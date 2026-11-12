#!/usr/bin/env node
/*
 * Gera site/sistema/gut-motor.js — o "motor de leituras" do sistema web.
 *
 * Pega do Apps Script (apps-script/principal/Code.gs + Supabase.gs) só as funções de LEITURA e tudo o que elas usam,
 * e embrulha num escopo próprio com um "imitador" do Google (gut-motor-shim). No navegador, as telas que antes
 * pediam os dados para a GUT API passam a montar a mesma resposta aqui, lendo as tabelas direto do Supabase
 * (RPC web_ler). Como o código das regras é o mesmo do Apps Script, a resposta é a mesma (conferido pela paridade).
 *
 * Uso:  node tools/gerar_motor.js            (gera o arquivo)
 *       node tools/gerar_motor.js --listar   (mostra as funções incluídas)
 * Rode de novo sempre que o Code.gs mudar.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = ['apps-script/principal/Code.gs', 'apps-script/principal/Supabase.gs'];
const OUT = path.join(ROOT, 'site/sistema/gut-motor.js');
const SHIM = path.join(__dirname, 'gut-motor-shim.js');

// Ações do Code.gs que usam o Google Drive (fotos): na tela web elas são feitas pelo Supabase Storage (gutFotos no index.html).
const GOOGLE_ACOES = require('./motor_google.json');

// Rotinas de manutenção do editor do Apps Script: nunca entram no navegador.
const PROIBIDAS = ['instalarAtualizacao', 'migrarParaSupabase', 'continuarMigracaoSupabase', 'backupSupabaseParaPlanilha', 'instalarBackupDiario', 'ativarSupabase', 'voltarParaPlanilha'];
// Funções que existem no Code.gs mas são trocadas por versões do shim (no navegador não há planilha nem Drive).
const TROCADAS = require('./motor_trocadas.json');
// Tabelas que cada ação lê (medido pela paridade: test/paridade/rodar.js grava este arquivo). Baixadas numa viagem só.
let TABELAS = {}; try { TABELAS = require('./motor_tabelas.json'); } catch (e) {}

function chunks(file) {
  const txt = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  const lines = txt.split('\n'), out = [];
  let cur = null;
  const start = /^(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=|var\s+(.*))/;
  lines.forEach((ln, i) => {
    const m = ln.match(start);
    if (m) {
      if (cur) out.push(cur);
      let names = [];
      if (m[1]) names = [m[1]]; else if (m[2]) names = [m[2]];
      else names = (m[3].match(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g) || []).map(s => s.replace(/[,=\s]/g, ''));
      cur = { file, line: i + 1, names, kind: m[1] ? 'function' : 'value', text: [ln] };
    } else if (cur) {
      // comentários/linhas em branco entre declarações ficam com a anterior; '}' e corpo também
      cur.text.push(ln);
    }
  });
  if (cur) out.push(cur);
  out.forEach(c => { while (c.text.length && /^\s*(\/\/.*)?$/.test(c.text[c.text.length - 1])) c.text.pop(); c.src = c.text.join('\n'); });
  return out;
}

function build() {
  const all = SRC.flatMap(chunks);
  const byName = new Map();
  all.forEach(c => c.names.forEach(n => { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(c); }));
  const ident = /[A-Za-z_$][\w$]*/g;
  const want = new Set(), queue = [];
  const pai = new Map();
  const add = (n, de) => { if (!want.has(n) && byName.has(n) && !TROCADAS.includes(n)) { want.add(n); queue.push(n); pai.set(n, de || '(entrada)'); } };
  // identificadores do código, sem textos entre aspas e sem comentários (mensagens citam nomes de funções)
  const semTexto = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''").replace(/\/\/[^\n]*/g, ' ');
  // entrada: o apiCall (o mesmo que a GUT API roda) e tudo o que ele alcança pelas rotas
  ['apiCall', 'routes_', 'mutationActions_'].forEach(n => add(n));
  while (queue.length) {
    const n = queue.shift();
    byName.get(n).forEach(c => (semTexto(c.src).match(ident) || []).forEach(x => add(x, n)));
  }
  const bad = [...want].filter(n => PROIBIDAS.includes(n));
  if (bad.length) {
    // descobre quem puxou
    const cadeia = n => { const l = [n]; while (pai.has(l[0]) && pai.get(l[0]) !== '(entrada)' && l.length < 30) l.unshift(pai.get(l[0])); return l.join(' → '); };
    const quem = bad.map(cadeia);
    throw new Error('Leitura puxou função que grava:\n  ' + quem.join('\n  '));
  }
  const sel = all.filter(c => c.names.some(n => want.has(n)));
  return { sel, want };
}

function main() {
  const { sel, want } = build();
  if (process.argv.includes('--listar')) { console.log([...want].sort().join('\n')); console.log('\n' + want.size + ' nomes, ' + sel.length + ' blocos'); return; }
  const shim = fs.readFileSync(SHIM, 'utf8');
  const corpo = sel.map(c => '// ' + c.file.split('/').pop() + ':' + c.line + '\n' + c.src).join('\n');
  const out = `/* GUT PPCP — motor do sistema web (leituras e gravações). ARQUIVO GERADO por tools/gerar_motor.js a partir do Apps Script.
   Não edite à mão: mude o Code.gs e gere de novo. */
window.GUT_MOTOR = (function () {
${shim}
// ======================= código do Apps Script (somente leituras) =======================
${corpo}
// ======================= fim do código do Apps Script =======================
__MOTOR.tabelas = ${JSON.stringify(TABELAS)};
return motorPublico_(${JSON.stringify(GOOGLE_ACOES)});
})();
`;
  // trava de segurança: o arquivo vai para o ar (GitHub Pages) — nada de token do servidor, chave secreta ou senha
  const segredo = out.match(/gutchave_[0-9a-f]{8,}|gutsrv_[0-9a-f]{8,}|gutimp_[0-9a-f]{8,}|OPENAI_API_KEY\s*[:=]\s*['"][^'"]+|sk-[A-Za-z0-9]{20,}|service_role/);
  if (segredo) throw new Error('O motor gerado teria um segredo (' + segredo[0].slice(0, 12) + '…). Troque a constante em tools/motor_trocadas.json + gut-motor-shim.js.');
  fs.writeFileSync(OUT, out);
  console.log('gerado ' + path.relative(ROOT, OUT) + ': ' + sel.length + ' blocos, ' + (out.length / 1024).toFixed(0) + ' KB');
  // a mesma coisa para o servidor (Edge Function "gut"): no Deno não há window
  // O arquivo é publicado no site (site/servidor/motor-<hash>.js) e a Edge Function o baixa uma vez e confere o hash
  // (assim a função publicada no Supabase fica pequena; trocar o motor = publicar o site + publicar a função com o hash novo).
  const srv = '// @ts-nocheck\nvar window = globalThis;\n' + out.replace('window.GUT_MOTOR = (function () {', 'globalThis.GUT_MOTOR = (function () {');
  const OUT_SRV = path.join(ROOT, 'supabase/functions/gut/motor.js');
  fs.mkdirSync(path.dirname(OUT_SRV), { recursive: true });
  fs.writeFileSync(OUT_SRV, srv);
  const sha = require('crypto').createHash('sha256').update(srv, 'utf8').digest('hex');
  const pasta = path.join(ROOT, 'site/servidor');
  fs.mkdirSync(pasta, { recursive: true });
  const nome = 'motor-' + sha.slice(0, 12) + '.js';
  // guarda o atual e o anterior (a função em produção pode ainda apontar para o anterior durante a troca)
  const antigos = fs.readdirSync(pasta).filter(f => /^motor-[0-9a-f]{12}\.js$/.test(f) && f !== nome).map(f => ({ f, t: fs.statSync(path.join(pasta, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  antigos.slice(1).forEach(a => fs.unlinkSync(path.join(pasta, a.f)));
  fs.writeFileSync(path.join(pasta, nome), srv);
  fs.writeFileSync(path.join(ROOT, 'supabase/functions/gut/versao.ts'),
    `// GERADO por tools/gerar_motor.js — qual motor a Edge Function "gut" usa.\nexport const MOTOR_URL = "https://gutgestao.com.br/servidor/${nome}";\nexport const MOTOR_SHA256 = "${sha}";\n`);
  console.log('gerado ' + path.relative(ROOT, OUT_SRV) + ' + site/servidor/' + nome);
}
if (require.main === module) main();
module.exports = { build, chunks };
