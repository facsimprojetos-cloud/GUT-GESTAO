#!/usr/bin/env node
/*
 * PARIDADE — mesma entrada, mesmo resultado no Apps Script e no caminho novo (Supabase).
 *
 *   node test/paridade/rodar.js            → monta o banco local, cria um cenário completo pelo próprio Apps Script
 *                                            (cadastros, compra, corte, volumes, produção, facção, pagamento) e
 *                                            compara cada leitura: GUT API (Code.gs) × motor do navegador (web_ler)
 *   node test/paridade/rodar.js --tabelas  → também regrava tools/motor_tabelas.json (tabelas que cada ação lê)
 *
 * Caminho A: Code.gs + Supabase.gs de verdade, no Node, falando com o Postgres local pelas RPCs gut_ler/gut_aplicar.
 * Caminho B: site/sistema/gut-motor.js (o que roda no navegador), falando com o mesmo Postgres por web_ler/web_schema,
 *            como o usuário logado (papel authenticated).
 * Nas próximas fases, cada função de gravação web_* entra aqui: o cenário roda nos dois caminhos e as tabelas
 * resultantes são comparadas (ver gravacoes.js).
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path'), vm = require('vm');
const pg = require('./pg_base');
const criarGas = require('./gas_sim');
const ROOT = path.join(__dirname, '..', '..');
const { comparar } = require('./comparar');

// ---------- caminho B: o motor do navegador ----------
function carregarMotor() {
  const store = {};
  const win = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  };
  const ctx = vm.createContext({ window: win, localStorage: win.localStorage, crypto: require('crypto').webcrypto, console, Intl, setTimeout, Promise });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site/sistema/gut-motor.js'), 'utf8'), ctx, { filename: 'gut-motor.js' });
  const m = win.GUT_MOTOR;
  let viagens = 0;
  m.configurar({
    slug: 'gut', email: 'carla@gut.com',
    rpc: async (fn, args) => {
      viagens++;
      const a = Object.entries(args).map(([k, v]) => Array.isArray(v) ? `${k} => array(select jsonb_array_elements_text($j$${JSON.stringify(v)}$j$::jsonb))` : `${k} => $j$${v}$j$`);
      const out = pg.psql(pg.comoUsuario(`select public.${fn}(${a.join(', ')})::text;`));
      return JSON.parse(out.split('\n').pop());
    }
  });
  return { m, viagens: () => viagens, zerar: () => { viagens = 0; }, store };
}

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function ontem(n = 1) { const d = new Date(Date.now() - n * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); }

// ---------- cenário: tudo criado pelo próprio Apps Script ----------
function cenario(gas) {
  const passos = [];
  const passo = (nome, fn) => { try { const r = fn(); passos.push({ nome, ok: true }); return r; } catch (e) { passos.push({ nome, ok: false, erro: e.message }); return null; } };
  pg.psql(`insert into public.app_controle (empresa_id, versao_schema, revisao, atualizado_em) values ('${pg.EMP}', '4.6.0', 'r0', now());
           insert into public.app_parametros (empresa_id, chave, valor) values ('${pg.EMP}', 'MINUTOS_PADRAO_DIA', '480');`);
  const cad = t => gas.api('getCadastros', [], { forceFresh: true });
  const id = (lista, campo, valor, idf) => { const r = (lista || []).find(x => String(x[campo]) === valor); if (!r) throw new Error('não achei ' + valor); return r[idf]; };
  passo('cadastros', () => {
    gas.grava('salvarCadastro', 'produto', { CODIGO_PRODUTO: '1001', PRODUTO: 'CAMISA POLO' });
    gas.grava('salvarCadastro', 'produto', { CODIGO_PRODUTO: '1002', PRODUTO: 'BERMUDA' });
    ['AZUL', 'PRETO'].forEach(c => gas.grava('salvarCadastro', 'cor', { COR: c }));
    ['P', 'M', 'G'].forEach((t, i) => gas.grava('salvarCadastro', 'tamanho', { TAMANHO: t, ORDEM_EXIBICAO: i + 1 }));
    gas.grava('salvarCadastro', 'setor', { SETOR: 'COSTURA', TIPO_SETOR: 'PRODUCAO' });
    gas.grava('salvarCadastro', 'maquina', { COD_MAQUINA: 'RT01', MAQUINA: 'RETA', QTD_TOTAL: 3, QTD_DISPONIVEL: 3 });
    ['FECHAR LATERAL', 'BAINHA', 'OVERLOQUE'].forEach((p, i) => gas.grava('salvarCadastro', 'processo', { PROCESSO: p, ORDEM_PADRAO: i + 1, TIPO_EXECUCAO_PADRAO: 'INTERNO' }));
    gas.grava('salvarCadastro', 'destino', { TIPO_DESTINO: 'FACCAO', NOME_DESTINO: 'COSTURA DA ANA', CAPACIDADE_MIN_DIA: 600 });
    gas.grava('salvarCadastro', 'destino', { TIPO_DESTINO: 'FACCAO', NOME_DESTINO: 'LEIA' });
    ['ANA', 'BIA', 'CIDA'].forEach((n, i) => gas.grava('salvarCadastro', 'operador', { NOME: n, MATRICULA: '00' + (i + 1), MINUTOS_PADRAO_DIA: 480 }));
    gas.grava('salvarCadastro', 'fornecedor', { RAZAO_SOCIAL: 'TECIDOS SUL LTDA', CNPJ_CPF: '00.000.000/0001-00' });
    gas.grava('salvarCadastro', 'localestoque', { LOCAL_ESTOQUE: 'ALMOXARIFADO', TIPO_LOCAL: 'INTERNO' });
    gas.grava('salvarCadastro', 'material', { COD_MATERIAL: 'TC01', MATERIAL: 'MALHA PIQUET', TIPO_MATERIAL: 'TECIDO', UNIDADE_ESTOQUE: 'KG', ESTOQUE_MINIMO: 5, CUSTO_UNITARIO: 32.5 });
    gas.grava('salvarCadastro', 'material', { COD_MATERIAL: 'LN01', MATERIAL: 'LINHA 120', TIPO_MATERIAL: 'AVIAMENTO', UNIDADE_ESTOQUE: 'UN' });
  });
  const c = cad();
  const P1 = id(c.produtos, 'CODIGO_PRODUTO', '1001', 'ID_PRODUTO'), P2 = id(c.produtos, 'CODIGO_PRODUTO', '1002', 'ID_PRODUTO');
  const AZ = id(c.cores, 'COR', 'AZUL', 'ID_COR'), PR = id(c.cores, 'COR', 'PRETO', 'ID_COR');
  const TP = id(c.tamanhos, 'TAMANHO', 'P', 'ID_TAMANHO'), TM = id(c.tamanhos, 'TAMANHO', 'M', 'ID_TAMANHO'), TG = id(c.tamanhos, 'TAMANHO', 'G', 'ID_TAMANHO');
  const procs = (c.processos || []).map(p => p.ID_PROCESSO), ops = (c.operadores || []).map(o => o.ID_OPERADOR);
  const D1 = id(c.destinos, 'NOME_DESTINO', 'COSTURA DA ANA', 'ID_DESTINO'), D2 = id(c.destinos, 'NOME_DESTINO', 'LEIA', 'ID_DESTINO');
  const MAT = id(c.materiais, 'COD_MATERIAL', 'TC01', 'ID_MATERIAL'), FORN = (c.fornecedores || [])[0]?.ID_FORNECEDOR;
  passo('roteiro e estrutura', () => {
    procs.forEach((p, i) => gas.grava('salvarCadastro', 'roteiro', { ID_PRODUTO: P1, ID_PROCESSO: p, ORDEM_PROCESSO: i + 1, TEMPO_PADRAO_SEG_UN: [45, 30, 20][i] }));
    gas.grava('salvarCadastro', 'roteiro', { ID_PRODUTO: P2, ID_PROCESSO: procs[0], ORDEM_PROCESSO: 1, TEMPO_PADRAO_SEG_UN: 60 });
    gas.grava('salvarCadastro', 'estrutura', { ID_PRODUTO: P1, ID_MATERIAL: MAT, CONSUMO_POR_UN: 0.25, PERDA_PCT: 5, UNIDADE_CONSUMO: 'KG' });
  });
  passo('preços de facção', () => {
    gas.grava('salvarPrecoFaccao', { ID_DESTINO: D1, ID_PRODUTO: P1, VALOR_UNITARIO: 2.5 });
    gas.grava('salvarPrecoFaccao', { ID_DESTINO: D2, ID_PRODUTO: P1, VALOR_UNITARIO: '3,10' });
  });
  passo('compra', () => gas.grava('registrarCompra', { ID_FORNECEDOR: FORN, DATA_COMPRA: ontem(2), DOCUMENTO: 'NF 123', itens: [{ ID_MATERIAL: MAT, QTD: 120, VALOR_UNITARIO: 31.9, COD_LOTE: 'L-01' }] }));
  let corte1 = null, corte2 = null;
  passo('corte 1 (com baixa de estoque) + explosão', () => {
    corte1 = gas.grava('registrarCorte', { ID_PRODUTO: P1, DATA_CORTE: ontem(1), PEDIDO: 'PED-9', ORDEM: 7, LOTE_TECIDO: 'LT-1', AUTO_BAIXA_ESTOQUE: false,
      cores: [{ ID_COR: AZ, FOLHAS: 10 }, { ID_COR: PR, FOLHAS: 6 }], tamanhos: [{ ID_TAMANHO: TP, RISCOS: 2 }, { ID_TAMANHO: TM, RISCOS: 3 }] });
    const idc = corte1.corte?.ID_CORTE || corte1.ID_CORTE || (corte1.cortesProgramados || [])[0]?.ID_CORTE;
    corte1.__id = idc;
    gas.grava('explodirCorte', idc);
  });
  passo('corte 2 programado (sem explodir)', () => { corte2 = gas.grava('registrarCorte', { ID_PRODUTO: P2, DATA_CORTE: hoje(), cores: [{ ID_COR: AZ, FOLHAS: 4 }], tamanhos: [{ ID_TAMANHO: TG, RISCOS: 1 }] }); });
  let vols = [];
  passo('volumes', () => {
    const est = gas.api('getEstoqueCorte', []);
    const r = gas.grava('criarVolumesLote', { itens: est.slice(0, 4).flatMap(e => [{ ID_ESTOQUE_CORTE: e.ID_ESTOQUE_CORTE, QTD: Math.floor(e.QTD_CORTADA / 2) }, { ID_ESTOQUE_CORTE: e.ID_ESTOQUE_CORTE, QTD: Math.ceil(e.QTD_CORTADA / 2) }]) });
    vols = (gas.api('getVolumes', []) || []).map(v => v.ID_VOLUME);
    if (vols.length < 6) throw new Error('poucos volumes: ' + vols.length);
  });
  let cupons = [];
  passo('produção interna (remessa, cupons, marcação, apontamento)', () => {
    gas.grava('destinarVolumesInternos', [vols[0], vols[1]]);
    const cv = gas.api('getCuponsVolume', [vols[0]]);
    cupons = (cv.cupons || cv || []).map(x => x.ID_CUPOM).filter(Boolean);
    if (!cupons.length) { gas.grava('gerarCuponsVolume', vols[0]); cupons = ((gas.api('getCuponsVolume', [vols[0]]).cupons) || []).map(x => x.ID_CUPOM); }
    gas.grava('iniciarMarcacaoProducao', { ID_CUPOM: cupons[0], ID_OPERADOR: ops[0] });
    gas.grava('finalizarMarcacaoProducao', { ID_CUPOM: cupons[0] });
    if (cupons[1]) gas.grava('apontarProducaoDireta', { ID_CUPOM: cupons[1], ID_OPERADOR: ops[1] });
    if (cupons[2]) gas.grava('iniciarMarcacaoProducao', { ID_CUPOM: cupons[2], ID_OPERADOR: ops[2] });
  });
  passo('jornada e metas', () => {
    gas.grava('registrarJornada', { DATA: hoje(), ID_OPERADOR: ops[0], MINUTOS_PREVISTOS: 480, MINUTOS_INTERVALOS: 60, MINUTOS_AUSENCIA: 0, MINUTOS_EXTRA: 30 });
    gas.grava('salvarMetasProducao', { metas: [{ DATA: hoje(), ID_OPERADOR: ops[1], MINUTOS_PREVISTOS: 420 }] });
  });
  let rem = null;
  passo('facção: remessa, envio, contagem, pagamento', () => {
    const itemValues = {}; [vols[2], vols[3]].forEach(v => itemValues[v] = { VALOR_UNITARIO: 2.5 });
    rem = gas.grava('criarRemessaExterna', { volumeIds: [vols[2], vols[3]], ID_DESTINO: D1, DATA_ENVIO: ontem(1), PREVISAO_RETORNO: hoje(), OBSERVACAO: 'urgente', itemValues });
    const idr = rem.remessa.ID_REMESSA;
    gas.grava('confirmarEnvioRemessaManual', idr, []);
    const r = (gas.api('getRemessasExternas', []) || []).find(x => x.ID_REMESSA === idr);
    const it = r.itens[0];
    gas.grava('registrarContagemRetorno', { ID_REMESSA: idr, itens: [{ ID_VOLUME: it.ID_VOLUME, QTD_CONTADA: it.QTD_ENVIADA - 1 }] });
    const fin = gas.api('getFinanceiroFaccao', []);
    const abertos = JSON.stringify(fin).match(/"ID_LANCAMENTO":"[^"]+"/g) || [];
    if (abertos.length) gas.grava('registrarPagamentoFaccao', { ID_DESTINO: D1, IDS: [abertos[0].split('"')[3]], DATA_PAGAMENTO: hoje(), FORMA_PAGAMENTO: 'PIX' });
  });
  passo('facção 2: remessa só criada', () => {
    const itemValues = { [vols[4]]: { VALOR_UNITARIO: 3.1 } };
    gas.grava('criarRemessaExterna', { volumeIds: [vols[4]], ID_DESTINO: D2, PREVISAO_RETORNO: ontem(3), itemValues });
  });
  passo('senha do app de campo (operador e facção)', () => pg.psql(`update public.cad_operadores set senha_hash = 'h4sh', senha_salt = 's4lt', acesso_app = true where nome = 'ANA';
    update public.cad_destinos set senha_hash = 'h4sh2', senha_salt = 's4lt2', acesso_app = true, codigo_acesso = 'LEIA' where nome_destino = 'LEIA';`));
  return { passos, ids: { P1, corte: corte1 && corte1.__id, vol: vols[0], vols, rem: rem && rem.remessa && rem.remessa.ID_REMESSA, cupom: cupons[0], cupom2: cupons[2] } };
}

// ---------- as leituras comparadas ----------
function leituras(ids) {
  const per = { DATA_INICIAL: ontem(7), DATA_FINAL: hoje() };
  return [
    ['getCadastros', []], ['getEstoqueMateriais', []], ['getComprasRecentes', []], ['getFluxoEstoque', []], ['getFluxoEstoque', [0]],
    ['getCortesProgramados', []], ['getCorte', [ids.corte]], ['getEstoqueCorte', []], ['getSeparacoesVolume', []], ['getPrecosFaccao', []],
    ['getVolumes', []], ['getCuponsVolume', [ids.vol]], ['getRemessasExternas', []], ['getRemessasInternas', []], ['getFinanceiroFaccao', []],
    ['getDashboard', [hoje()]], ['getDashboard', [per]], ['getInternalProductionPerformance', [per]],
    ['getOperationalData', []], ['getBootstrapData', [hoje()]], ['getInitialData', [hoje()]],
    ['getScanCatalog', [false]], ['getScanCatalog', [true]], ['getExternalScanCatalog', ['', 'ENVIO']], ['getExternalScanCatalog', ['', 'RECEBIMENTO']], ['getExternalScanCatalog', [ids.rem, 'RECEBIMENTO']],
    ['previewTempoPadraoMarcacao', [{ ID_CUPOM: ids.cupom }]], ['previewTempoPadraoMarcacao', [{ ID_CUPOM: ids.cupom2 }]],
    ['prepararRomaneioRemessa', [ids.rem]], ['prepararRomaneioInterno', [[ids.vols[0], ids.vols[1]]]], ['getCorte', ['nao-existe']],
  ];
}

async function main() {
  const t0 = Date.now();
  await pg.subir();
  let falhas = 0;
  try {
    const gas = criarGas(pg);
    const { passos, ids } = cenario(gas);
    console.log('Cenário (gravado pelo Apps Script):');
    passos.forEach(p => console.log((p.ok ? '  ✓ ' : '  ✗ ') + p.nome + (p.ok ? '' : ' — ' + p.erro)));
    const cont = pg.psql(`select string_agg(t || '=' || n, ' ') from (select 'volumes' t, count(*) n from volumes union all select 'cupons', count(*) from cupons_producao union all select 'remessas', count(*) from remessas union all select 'retornos', count(*) from retornos_externos union all select 'financeiro', count(*) from financeiro_faccao union all select 'apontamentos', count(*) from apontamentos_producao union all select 'mov_estoque', count(*) from mov_estoque) x;`);
    console.log('  linhas: ' + cont);

    const motor = carregarMotor();
    const tabelas = {};
    console.log('\nLeituras — Apps Script × navegador (Supabase):');
    for (const [acao, args] of leituras(ids)) {
      const a = gas.api(acao, args, {});
      const usadas = Object.keys(gas.ctx.__SUPA_USED || {}).filter(t => !['app_operacoes'].includes(t));
      tabelas[acao] = [...new Set([...(tabelas[acao] || []), ...usadas])].sort();
      motor.zerar();
      let b;
      try { b = JSON.parse(JSON.stringify(await motor.m.executar(acao, args, {}))); } catch (e) { b = { __error: true, retryable: false, message: String(e.message || e) }; } // na tela, os dois viram o mesmo erro (callServer rejeita com a mensagem)
      const dif = comparar(a, b);
      const txtB = JSON.stringify(b);
      if (/h4sh|s4lt/.test(txtB)) dif.push('SEGURANÇA: a resposta do navegador contém senha do app de campo');
      if (acao === 'getCadastros' && !/"TEM_SENHA":true/.test(txtB)) dif.push('getCadastros deveria marcar TEM_SENHA de quem tem senha');
      const nome = acao + '(' + args.map(x => JSON.stringify(x)).join(', ').slice(0, 60) + ')';
      const vazio = a && !a.__error && JSON.stringify(a).length < 30;
      if (dif.length) { falhas++; console.log('  ✗ ' + nome + ' — ' + dif.length + ' diferença(s)'); dif.slice(0, 8).forEach(d => console.log('      ' + d)); }
      else console.log('  ✓ ' + nome + (a && a.__error ? ' (os dois recusam: ' + a.message + ')' : '') + (vazio ? ' (resposta vazia!)' : '') + ' • ' + motor.viagens() + ' viagem(ns) ao banco');
    }
    if (process.argv.includes('--tabelas')) {
      fs.writeFileSync(path.join(ROOT, 'tools/motor_tabelas.json'), JSON.stringify(tabelas, null, 1) + '\n');
      console.log('\ntools/motor_tabelas.json atualizado — rode node tools/gerar_motor.js');
    }
    if (passos.some(p => !p.ok)) falhas++;
    if (gas.ctx.__avisos.length) console.log('\nAvisos do Apps Script: ' + [...new Set(gas.ctx.__avisos)].slice(0, 5).join(' | '));
  } finally { pg.descer(true); }
  console.log(`\n${falhas ? '✗ ' + falhas + ' problema(s)' : '✓ paridade ok'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(falhas ? 1 : 0);
}
if (require.main === module) main().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
module.exports = { cenario, carregarMotor, leituras };
