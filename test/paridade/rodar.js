#!/usr/bin/env node
/*
 * PARIDADE — mesma entrada, mesmo resultado no Apps Script e no caminho novo (Supabase).
 *
 *   node test/paridade/rodar.js            → dois bancos locais iguais; o MESMO cenário completo roda nos dois:
 *                                            A = Code.gs como a GUT API (gut_ler/gut_aplicar)
 *                                            B = motor do navegador (web_ler/web_aplicar, usuário logado)
 *                                            com o mesmo relógio e os mesmos ids. Compara a resposta de cada
 *                                            ação (gravações e leituras), as tabelas no fim e mais 31 leituras.
 *   node test/paridade/rodar.js --tabelas  → também regrava tools/motor_tabelas.json (tabelas que cada ação lê)
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path'), vm = require('vm');
const pg = require('./pg_base');
const criarGas = require('./gas_sim');
const { criarRelogio, dataFalsa } = require('./relogio');
const ROOT = path.join(__dirname, '..', '..');
const { comparar } = require('./comparar');

// ---------- caminho B: o motor do navegador ----------
function chamarRpc(banco, fn, args, uid = pg.USER) {
  const a = Object.entries(args).map(([k, v]) => {
    if (Array.isArray(v) && k !== 'p_ops') return `${k} => array(select jsonb_array_elements_text($j$${JSON.stringify(v)}$j$::jsonb))`;
    if (typeof v === 'object' && v !== null) return `${k} => $j$${JSON.stringify(v)}$j$::jsonb`;
    return `${k} => $j$${v}$j$`;
  });
  const out = pg.psql(pg.comoUsuario(`select coalesce(to_jsonb(public.${fn}(${a.join(', ')}))::text, 'null');`, uid), { banco });
  return JSON.parse(out.split('\n').pop());
}
// caminho do servidor (Edge Function "gut"): motor.js + servidor.mjs, com o banco chamado como o usuário logado
async function carregarServidor({ banco = 'gut', relogio = null, uid = pg.USER, chave = pg.CHAVE_TESTE, antesDe = null, dispositivo = 'maquina-de-teste-0001', entrar = true } = {}) {
  // cada login precisa da máquina liberada (gut_021): a tela chama web_maquina_entrar ao abrir
  const entrou = new Set();
  const entrarEm = slug => { if (!entrar || entrou.has(slug)) return; entrou.add(slug);
    try { chamarRpc(banco, 'web_maquina_entrar', { p_slug: slug, p_dispositivo: dispositivo, p_nome: 'Teste', p_assumir: true }, uid); } catch (e) { /* sem acesso à empresa: os testes de isolamento conferem isso */ } };
  entrarEm('gut');
  const ctx = vm.createContext({ console, Intl, setTimeout, Promise, TextEncoder, TextDecoder, btoa, atob, Proxy, crypto: require('crypto').webcrypto });
  if (relogio) ctx.Date = dataFalsa(vm.runInContext('Date', ctx), relogio);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'supabase/functions/gut/motor.js'), 'utf8'), ctx, { filename: 'motor.js' });
  const M = ctx.GUT_MOTOR;
  if (relogio) M.configurar({ uuid: relogio.uuid, antes: relogio.reinicia });
  const { atender } = await import(path.join(ROOT, 'supabase/functions/gut/servidor.mjs'));
  let viagens = 0;
  const chamar = async (nome, corpo) => { viagens++; if (antesDe) await antesDe(nome, corpo); try { return chamarRpc(banco, nome, corpo, uid); } catch (e) { const err = new Error(e.message); err.code = e.code; throw err; } };
  return {
    M, viagens: () => viagens, zerar: () => { viagens = 0; },
    pedir: (acao, args, meta, slug = 'gut', disp = dispositivo) => (entrarEm(slug), atender(M, { acao, args, meta, slug, dispositivo: disp }, chamar, chave)),
    gravacao: acao => M.gravacao(acao)
  };
}
function carregarMotor({ banco = 'gut', relogio = null } = {}) {
  const store = {};
  const win = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    console
  };
  const ctx = vm.createContext({ window: win, localStorage: win.localStorage, crypto: require('crypto').webcrypto, Intl, setTimeout, Promise, TextEncoder, TextDecoder, btoa, atob, Proxy });
  if (relogio) ctx.Date = dataFalsa(vm.runInContext('Date', ctx), relogio);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site/sistema/gut-motor.js'), 'utf8'), ctx, { filename: 'gut-motor.js' });
  const m = win.GUT_MOTOR;
  let viagens = 0;
  m.configurar({
    slug: 'gut', email: 'carla@gut.com',
    uuid: relogio ? relogio.uuid : null, antes: relogio ? relogio.reinicia : null,
    rpc: async (fn, args) => { viagens++; try { return chamarRpc(banco, fn, args); } catch (e) { const err = new Error(e.message); err.code = e.code; throw err; } }
  });
  return { m, viagens: () => viagens, zerar: () => { viagens = 0; }, store };
}

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function ontem(n = 1) { const d = new Date(Date.now() - n * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); }

// ---------- cenário: tudo criado pelo próprio Apps Script ----------
async function cenario(x) {
  const passos = [];
  const passo = async (nome, fn) => { try { const r = await fn(); passos.push({ nome, ok: true }); return r; } catch (e) { passos.push({ nome, ok: false, erro: e.message }); return null; } };
  x.sql(`insert into public.app_controle (empresa_id, versao_schema, revisao, atualizado_em) values ('${pg.EMP}', '4.6.0', 'r0', now());
           insert into public.app_parametros (empresa_id, chave, valor) values ('${pg.EMP}', 'MINUTOS_PADRAO_DIA', '480');`);
  const cad = () => x.api('getCadastros', [], { forceFresh: true });
  const id = (lista, campo, valor, idf) => { const r = (lista || []).find(x => String(x[campo]) === valor); if (!r) throw new Error('não achei ' + valor); return r[idf]; };
  await passo('cadastros', async () => {
    await x.grava('salvarCadastro', 'produto', { CODIGO_PRODUTO: '1001', PRODUTO: 'CAMISA POLO' });
    await x.grava('salvarCadastro', 'produto', { CODIGO_PRODUTO: '1002', PRODUTO: 'BERMUDA' });
    for (const c of ['AZUL', 'PRETO']) await x.grava('salvarCadastro', 'cor', { COR: c });
    for (const [i, t] of ['P', 'M', 'G'].entries()) await x.grava('salvarCadastro', 'tamanho', { TAMANHO: t, ORDEM_EXIBICAO: i + 1 });
    await x.grava('salvarCadastro', 'setor', { SETOR: 'COSTURA', TIPO_SETOR: 'PRODUCAO' });
    await x.grava('salvarCadastro', 'maquina', { COD_MAQUINA: 'RT01', MAQUINA: 'RETA', QTD_TOTAL: 3, QTD_DISPONIVEL: 3 });
    for (const [i, p] of ['FECHAR LATERAL', 'BAINHA', 'OVERLOQUE'].entries()) await x.grava('salvarCadastro', 'processo', { PROCESSO: p, ORDEM_PADRAO: i + 1, TIPO_EXECUCAO_PADRAO: 'INTERNO' });
    await x.grava('salvarCadastro', 'destino', { TIPO_DESTINO: 'FACCAO', NOME_DESTINO: 'COSTURA DA ANA', CAPACIDADE_MIN_DIA: 600 });
    await x.grava('salvarCadastro', 'destino', { TIPO_DESTINO: 'FACCAO', NOME_DESTINO: 'LEIA' });
    for (const [i, n] of ['ANA', 'BIA', 'CIDA'].entries()) await x.grava('salvarCadastro', 'operador', { NOME: n, MATRICULA: '00' + (i + 1), MINUTOS_PADRAO_DIA: 480 });
    await x.grava('salvarCadastro', 'fornecedor', { RAZAO_SOCIAL: 'TECIDOS SUL LTDA', CNPJ_CPF: '00.000.000/0001-00' });
    await x.grava('salvarCadastro', 'localestoque', { LOCAL_ESTOQUE: 'ALMOXARIFADO', TIPO_LOCAL: 'INTERNO' });
    await x.grava('salvarCadastro', 'material', { COD_MATERIAL: 'TC01', MATERIAL: 'MALHA PIQUET', TIPO_MATERIAL: 'TECIDO', UNIDADE_ESTOQUE: 'KG', ESTOQUE_MINIMO: 5, CUSTO_UNITARIO: 32.5 });
    await x.grava('salvarCadastro', 'material', { COD_MATERIAL: 'LN01', MATERIAL: 'LINHA 120', TIPO_MATERIAL: 'AVIAMENTO', UNIDADE_ESTOQUE: 'UN' });
  });
  const c = await cad();
  const P1 = id(c.produtos, 'CODIGO_PRODUTO', '1001', 'ID_PRODUTO'), P2 = id(c.produtos, 'CODIGO_PRODUTO', '1002', 'ID_PRODUTO');
  const AZ = id(c.cores, 'COR', 'AZUL', 'ID_COR'), PR = id(c.cores, 'COR', 'PRETO', 'ID_COR');
  const TP = id(c.tamanhos, 'TAMANHO', 'P', 'ID_TAMANHO'), TM = id(c.tamanhos, 'TAMANHO', 'M', 'ID_TAMANHO'), TG = id(c.tamanhos, 'TAMANHO', 'G', 'ID_TAMANHO');
  const procs = (c.processos || []).map(p => p.ID_PROCESSO), ops = (c.operadores || []).map(o => o.ID_OPERADOR);
  const D1 = id(c.destinos, 'NOME_DESTINO', 'COSTURA DA ANA', 'ID_DESTINO'), D2 = id(c.destinos, 'NOME_DESTINO', 'LEIA', 'ID_DESTINO');
  const MAT = id(c.materiais, 'COD_MATERIAL', 'TC01', 'ID_MATERIAL'), FORN = (c.fornecedores || [])[0]?.ID_FORNECEDOR;
  await passo('roteiro e estrutura', async () => {
    for (const [i, p] of procs.entries()) await x.grava('salvarCadastro', 'roteiro', { ID_PRODUTO: P1, ID_PROCESSO: p, ORDEM_PROCESSO: i + 1, TEMPO_PADRAO_SEG_UN: [45, 30, 20][i] });
    await x.grava('salvarCadastro', 'roteiro', { ID_PRODUTO: P2, ID_PROCESSO: procs[0], ORDEM_PROCESSO: 1, TEMPO_PADRAO_SEG_UN: 60 });
    await x.grava('salvarCadastro', 'estrutura', { ID_PRODUTO: P1, ID_MATERIAL: MAT, CONSUMO_POR_UN: 0.25, PERDA_PCT: 5, UNIDADE_CONSUMO: 'KG' });
  });
  await passo('preços de facção', async () => {
    await x.grava('salvarPrecoFaccao', { ID_DESTINO: D1, ID_PRODUTO: P1, VALOR_UNITARIO: 2.5 });
    await x.grava('salvarPrecoFaccao', { ID_DESTINO: D2, ID_PRODUTO: P1, VALOR_UNITARIO: '3,10' });
  });
  await passo('compra', async () => await x.grava('registrarCompra', { ID_FORNECEDOR: FORN, DATA_COMPRA: ontem(2), DOCUMENTO: 'NF 123', itens: [{ ID_MATERIAL: MAT, QTD: 120, VALOR_UNITARIO: 31.9, COD_LOTE: 'L-01' }] }));
  let corte1 = null, corte2 = null;
  await passo('corte 1 (com baixa de estoque) + explosão', async () => {
    corte1 = await x.grava('registrarCorte', { ID_PRODUTO: P1, DATA_CORTE: ontem(1), PEDIDO: 'PED-9', ORDEM: 7, LOTE_TECIDO: 'LT-1', AUTO_BAIXA_ESTOQUE: false,
      cores: [{ ID_COR: AZ, FOLHAS: 10 }, { ID_COR: PR, FOLHAS: 6 }], tamanhos: [{ ID_TAMANHO: TP, RISCOS: 2 }, { ID_TAMANHO: TM, RISCOS: 3 }] });
    const idc = corte1.corte?.ID_CORTE || corte1.ID_CORTE || (corte1.cortesProgramados || [])[0]?.ID_CORTE;
    corte1.__id = idc;
    await x.grava('explodirCorte', idc);
  });
  await passo('corte 2 programado (sem explodir)', async () => { corte2 = await x.grava('registrarCorte', { ID_PRODUTO: P2, DATA_CORTE: hoje(), cores: [{ ID_COR: AZ, FOLHAS: 4 }], tamanhos: [{ ID_TAMANHO: TG, RISCOS: 1 }] }); });
  let vols = [];
  await passo('volumes', async () => {
    const est = await x.api('getEstoqueCorte', []);
    const r = await x.grava('criarVolumesLote', { itens: est.slice(0, 4).flatMap(e => [{ ID_ESTOQUE_CORTE: e.ID_ESTOQUE_CORTE, QTD: Math.floor(e.QTD_CORTADA / 2) }, { ID_ESTOQUE_CORTE: e.ID_ESTOQUE_CORTE, QTD: Math.ceil(e.QTD_CORTADA / 2) }]) });
    vols = (await x.api('getVolumes', []) || []).map(v => v.ID_VOLUME);
    if (vols.length < 6) throw new Error('poucos volumes: ' + vols.length);
  });
  let cupons = [];
  await passo('produção interna (remessa, cupons, marcação, apontamento)', async () => {
    await x.grava('destinarVolumesInternos', [vols[0], vols[1]]);
    const cv = await x.api('getCuponsVolume', [vols[0]]);
    cupons = (cv.cupons || cv || []).map(x => x.ID_CUPOM).filter(Boolean);
    if (!cupons.length) { await x.grava('gerarCuponsVolume', vols[0]); cupons = (((await x.api('getCuponsVolume', [vols[0]])).cupons) || []).map(x => x.ID_CUPOM); }
    await x.grava('iniciarMarcacaoProducao', { ID_CUPOM: cupons[0], ID_OPERADOR: ops[0] });
    await x.grava('finalizarMarcacaoProducao', { ID_CUPOM: cupons[0] });
    if (cupons[1]) await x.grava('apontarProducaoDireta', { ID_CUPOM: cupons[1], ID_OPERADOR: ops[1] });
    if (cupons[2]) await x.grava('iniciarMarcacaoProducao', { ID_CUPOM: cupons[2], ID_OPERADOR: ops[2] });
  });
  await passo('jornada e metas', async () => {
    await x.grava('registrarJornada', { DATA: hoje(), ID_OPERADOR: ops[0], MINUTOS_PREVISTOS: 480, MINUTOS_INTERVALOS: 60, MINUTOS_AUSENCIA: 0, MINUTOS_EXTRA: 30 });
    await x.grava('salvarMetasProducao', { metas: [{ DATA: hoje(), ID_OPERADOR: ops[1], MINUTOS_PREVISTOS: 420 }] });
  });
  let rem = null;
  await passo('facção: remessa, envio, contagem, pagamento', async () => {
    const itemValues = {}; [vols[2], vols[3]].forEach(v => itemValues[v] = { VALOR_UNITARIO: 2.5 });
    rem = await x.grava('criarRemessaExterna', { volumeIds: [vols[2], vols[3]], ID_DESTINO: D1, DATA_ENVIO: ontem(1), PREVISAO_RETORNO: hoje(), OBSERVACAO: 'urgente', itemValues });
    const idr = rem.remessa.ID_REMESSA;
    await x.grava('confirmarEnvioRemessaManual', idr, []);
    const r = (await x.api('getRemessasExternas', []) || []).find(x => x.ID_REMESSA === idr);
    const it = r.itens[0];
    await x.grava('registrarContagemRetorno', { ID_REMESSA: idr, itens: [{ ID_VOLUME: it.ID_VOLUME, QTD_CONTADA: it.QTD_ENVIADA - 1 }] });
    const fin = await x.api('getFinanceiroFaccao', []);
    const abertos = JSON.stringify(fin).match(/"ID_LANCAMENTO":"[^"]+"/g) || [];
    if (abertos.length) await x.grava('registrarPagamentoFaccao', { ID_DESTINO: D1, IDS: [abertos[0].split('"')[3]], DATA_PAGAMENTO: hoje(), FORMA_PAGAMENTO: 'PIX' });
  });
  await passo('facção 2: remessa só criada', async () => {
    const itemValues = { [vols[4]]: { VALOR_UNITARIO: 3.1 } };
    await x.grava('criarRemessaExterna', { volumeIds: [vols[4]], ID_DESTINO: D2, PREVISAO_RETORNO: ontem(3), itemValues });
  });
  await passo('senha do app de campo (operador e facção)', async () => x.sql(`update public.cad_operadores set senha_hash = 'h4sh', senha_salt = 's4lt', acesso_app = true where nome = 'ANA';
    update public.cad_destinos set senha_hash = 'h4sh2', senha_salt = 's4lt2', acesso_app = true, codigo_acesso = 'LEIA' where nome_destino = 'LEIA';`));
  // ---------- parte 2: as outras gravações (cada uma comparada; erro igual nos dois também é paridade) ----------
  const tenta = (acao, ...args) => x.api(acao, args);
  const rid = r => (r && !r.__error) ? r : null;
  await passo('parte 2: cadastros, parâmetros, acesso do app, CSV, ficha', async () => {
    await tenta('salvarParametros', { MINUTOS_PADRAO_DIA: 500 });
    await tenta('salvarAcessoCampo', { TIPO: 'OPERADOR', ID: ops[1], LOGIN: '002', SENHA: 'abc123', ACESSO_APP: true, MODO_APP: 'COMPLETO' });
    await tenta('salvarAcessoCampo', { TIPO: 'FACCAO', ID: D1, LOGIN: 'ANA', SENHA: 'senha9', ACESSO_APP: true });
    await tenta('importarCadastroCSV', 'cor', [{ COR: 'VERDE' }, { COR: 'ROSA' }, { COR: 'AZUL' }]);
    await tenta('salvarFichaProduto', { produto: { ID_PRODUTO: P2, CODIGO_PRODUTO: '1002', PRODUTO: 'BERMUDA SARJA' }, estrutura: [{ ID_MATERIAL: MAT, CONSUMO_POR_UN: 0.4, UNIDADE_CONSUMO: 'KG' }], roteiro: [{ ID_PROCESSO: procs[1], ORDEM_PROCESSO: 1, TEMPO_PADRAO_SEG_UN: 50 }] });
    const maq = (c.maquinas || [])[0];
    if (maq) await tenta('salvarCapacidadeMaquinas', { itens: [{ ID_MAQUINA: maq.ID_MAQUINA, QTD_DISPONIVEL: 2, MINUTOS_DISP_DIA: 420 }] });
    await tenta('salvarCapacidadeFaccoes', { itens: [{ ID_DESTINO: D1, CAPACIDADE_MIN_DIA: 720 }, { ID_DESTINO: D2, CAPACIDADE_MIN_DIA: 300 }] });
    const cad2 = await x.api('getCadastros', []);
    const verde = (cad2.cores || []).find(k => k.COR === 'VERDE');
    if (verde) { const pv = await tenta('previewExclusao', 'cor', verde.ID_COR); await tenta('excluirEntidade', 'cor', verde.ID_COR, pv && pv.token); }
  });
  await passo('parte 2: estoque de matéria-prima', async () => {
    const em = await x.api('getEstoqueMateriais', []);
    const saldo = JSON.stringify(em).match(/"ID_SALDO":"([^"]+)"/);
    if (saldo) {
      await tenta('baixarEstoqueManual', { ID_SALDO: saldo[1], QTD: 2.5, MOTIVO: 'PERDA', OBSERVACAO: 'rasgou' });
      await tenta('ajustarEstoqueManual', { ID_SALDO: saldo[1], SALDO_CONTADO: '110,5', MOTIVO: 'INVENTARIO' });
    }
  });
  await passo('parte 2: corte com consumo, edição, volume avulso, separação, envio em massa', async () => {
    const r3 = await tenta('registrarCorte', { ID_PRODUTO: P1, DATA_CORTE: hoje(), AUTO_BAIXA_ESTOQUE: true, cores: [{ ID_COR: AZ, FOLHAS: 5 }], tamanhos: [{ ID_TAMANHO: TG, RISCOS: 2 }, { ID_TAMANHO: TP, RISCOS: 1 }] });
    const id3 = r3 && r3.idCorte;
    if (id3) {
      const prev = await tenta('prepararConsumoCorte', id3);
      const linhas = (prev && (prev.linhas || prev.itens)) || [];
      await tenta('confirmarConsumoCorteEExplodir', { ID_CORTE: id3, linhas: linhas.map(l => Object.assign({}, l, { QTD_BAIXAR: l.QTD_BAIXAR || l.QTD_PREVISTA })) });
    }
    if (corte2 && corte2.idCorte) await tenta('explodirCorte', corte2.idCorte);
    if (corte1 && corte1.__id) await tenta('editarCorteExecutado', { ID_CORTE: corte1.__id, PEDIDO: 'PED-10', ORDEM: 8, OBSERVACAO: 'ajuste' });
    const est = ((await x.api('getEstoqueCorte', [])) || []).filter(e => Number(e.SALDO_DISPONIVEL) > 0);
    if (est[0]) await tenta('criarVolume', { ID_ESTOQUE_CORTE: est[0].ID_ESTOQUE_CORTE, QTD_VOLUME: 2 });
    if (est[1]) {
      const sep = await tenta('criarSeparacaoVolumes', { itens: [{ ID_ESTOQUE_CORTE: est[1].ID_ESTOQUE_CORTE, QTD: 2 }, { ID_ESTOQUE_CORTE: est[1].ID_ESTOQUE_CORTE, QTD: 1 }] });
      const seps = await x.api('getSeparacoesVolume', []);
      const idSep = JSON.stringify(seps).match(/"ID_SEPARACAO":"([^"]+)"/);
      if (idSep) await tenta('marcarEtiquetasSeparacaoImpressas', idSep[1]);
    }
    if (est[2]) await tenta('criarEnvioFaccaoMassa', { ID_DESTINO: D2, itens: [{ ID_ESTOQUE_CORTE: est[2].ID_ESTOQUE_CORTE, QTD: 2, VALOR_UNITARIO: 3.1 }] });
  });
  await passo('parte 2: volumes internos, cupons, bipagem, marcação', async () => {
    const vv = (await x.api('getVolumes', [])) || [];
    const v1 = vv.find(v => v.ID_VOLUME === vols[1]);
    if (v1 && Number(v1.QTD_VOLUME) >= 2) await tenta('fracionarVolumeInterno', { ID_VOLUME_ORIGEM: vols[1], caixas: [{ QTD: 1 }, { QTD: Number(v1.QTD_VOLUME) - 1 }] });
    const v5 = vv.find(v => v.ID_VOLUME === vols[5]);
    if (v5) await tenta('editarVolume', { ID_VOLUME: vols[5], QTD_VOLUME: Math.max(1, Number(v5.QTD_VOLUME) - 1), OBSERVACAO: 'conferido' });
    await tenta('prepararImpressaoCuponsInternos', [vols[0]]);
    await tenta('marcarCuponsImpressos', vols[0]);
    const cs = [];
    for (const v of [vols[0], vols[1]]) { const cv = await x.api('getCuponsVolume', [v]); cs.push(...((cv && cv.cupons) || (Array.isArray(cv) ? cv : []))); }
    if (!cs.some(k => k.ID_VOLUME === vols[1])) await tenta('gerarCuponsVolume', vols[1]);
    const livre = cs.filter(k => !/CONCLU|APONT/i.test(String(k.STATUS_CUPOM)));
    if (livre[0]) await tenta('biparCupom', livre[0].COD_CUPOM, ops[0]);
    if (livre[1]) await tenta('biparCuponsEmLote', [{ ID_CUPOM: livre[1].ID_CUPOM, CODIGO: livre[1].COD_CUPOM }], ops[1]);
    if (livre[2]) await tenta('registrarApontamentosDiretosEmLote', [{ ID_CUPOM: livre[2].ID_CUPOM, ID_OPERADOR: ops[2], CLIENT_ID: 'cli-1' }]);
    if (cupons[2]) { await tenta('pausarMarcacao', { ID_CUPOM: cupons[2] }); await tenta('retomarMarcacao', { ID_CUPOM: cupons[2] }); }
    await tenta('pausarTodasMarcacoes', {}); await tenta('retomarTodasMarcacoes', {});
    if (livre[3]) await tenta('alocarOperadorCupons', { ids: [livre[3].ID_CUPOM], ID_OPERADOR: ops[1] });
    if (cupons[0]) await tenta('aplicarTempoPadraoMarcacao', { ID_CUPOM: cupons[0], ids: [cupons[0]], MODO: 'ESTA' });
    await tenta('enviarBipagensColetadas', [], ops[0]);
    await tenta('consolidarBipagens', ops[0], hoje(), [vols[0]]);
  });
  await passo('parte 2: facção — retorno, inspeção, grade, bipagem, retirada, cancelamento, avisos', async () => {
    const rs = (await x.api('getRemessasExternas', [])) || [];
    const r1 = rem && rs.find(r => r.ID_REMESSA === rem.remessa.ID_REMESSA);
    const r2 = rs.find(r => r.ID_DESTINO === D2 && (!r1 || r.ID_REMESSA !== r1.ID_REMESSA));
    if (r1) {
      const it = r1.itens[r1.itens.length - 1];
      await tenta('registrarRetornoExterno', { ID_REMESSA: r1.ID_REMESSA, ID_VOLUME: it.ID_VOLUME, QTD_RETORNADA: it.QTD_ENVIADA, QTD_APROVADA: it.QTD_ENVIADA - 1, QTD_REPROVADA: 1, QTD_RETRABALHO: 0, STATUS_INSPECAO: 'INSPECIONADO', RESPONSAVEL_INSPECAO: 'Carla' });
      const fr = JSON.stringify(await x.api('getRemessasExternas', [])).match(/"ID_RETORNO":"([^"]+)"/);
      if (fr) await tenta('registrarInspecaoRetorno', { ID_REMESSA: r1.ID_REMESSA, ID_RETORNO: fr[1], QTD_APROVADA: 1, QTD_REPROVADA: 0, QTD_RETRABALHO: 0, QTD_EMBALADA: 1, RESPONSAVEL_INSPECAO: 'Carla', DEFEITO_FACCAO: false });
      await tenta('liberarVolumeEstoquePA', { ID_VOLUME: it.ID_VOLUME, ORIGEM: 'RETORNO' });
      await tenta('marcarAvisosCampoLidos', { ids: [r1.ID_REMESSA] });
    }
    if (r2) {
      await tenta('salvarGradeRemessa', { ID_REMESSA: r2.ID_REMESSA, itens: (r2.itens || []).map(i => ({ ID_ITEM_REMESSA: i.ID_ITEM_REMESSA, ID_VOLUME: i.ID_VOLUME, COD_VOLUME: i.COD_VOLUME, QTD_ENVIADA: i.QTD_ENVIADA })) });
      await tenta('registrarBipagensExternasEmLote', r2.ID_REMESSA, 'ENVIO', (r2.itens || []).map(i => i.COD_VOLUME), {});
      if ((r2.itens || []).length) await tenta('retirarVolumeRemessa', { ID_REMESSA: r2.ID_REMESSA, ID_VOLUME: r2.itens[0].ID_VOLUME, MOTIVO: 'faltou aviamento' });
    }
    const fin = JSON.stringify(await x.api('getFinanceiroFaccao', []));
    const lanc = [...fin.matchAll(/"ID_LANCAMENTO":"([^"]+)"/g)].map(m => m[1]);
    if (lanc.length) await tenta('cancelarLancamentoFaccao', { ID_LANCAMENTO: lanc[lanc.length - 1], MOTIVO: 'lançado em dobro' });
  });
  // v4.23.0 — facção com serviço parcial: faz 2 das 3 operações; as aprovadas voltam num saco de continuação
  let cont = null;
  await passo('parte 3: facção com serviço parcial → continuação na produção interna → problema da facção', async () => {
    const cc = await cad();
    const rot = (cc.roteiro || []).filter(r => String(r.ID_PRODUTO) === String(P1)).sort((a, b) => a.ORDEM_PROCESSO - b.ORDEM_PROCESSO);
    if (rot.length !== 3) throw new Error('roteiro do P1 com ' + rot.length + ' operações');
    const v5 = (await x.api('getVolumes', [])).find(v => v.ID_VOLUME === vols[5]);
    const r = await x.grava('criarRemessaExterna', { volumeIds: [vols[5]], ID_DESTINO: D2, DATA_ENVIO: ontem(1), itemValues: { [vols[5]]: { ESCOPO_SERVICO: 'PARCIAL', OPS_FACCAO: [rot[0].ID_ROTEIRO, rot[2].ID_ROTEIRO] } } });
    const idr = r.remessa.ID_REMESSA;
    const it = (await x.api('getRemessasExternas', [])).find(z => z.ID_REMESSA === idr).itens[0];
    if (!it.SERVICO_PARCIAL || it.OPS_FACCAO_NOMES.length !== 2 || it.OPS_TOTAL_PRODUTO !== 3) throw new Error('item parcial: ' + JSON.stringify([it.SERVICO_PARCIAL, it.OPS_FACCAO_NOMES, it.OPS_TOTAL_PRODUTO]));
    const t = rot.map(r => Number(r.TEMPO_PADRAO_SEG_UN) || 0), esperado = Math.round(3.1 * (t[0] + t[2]) / (t[0] + t[1] + t[2]) * 100) / 100;
    if (Math.abs(it.PRECO_FACCAO_UNIT - esperado) > 0.001) throw new Error('preço proporcional: ' + it.PRECO_FACCAO_UNIT + ' (esperado ' + esperado + ')');
    await x.grava('confirmarEnvioRemessaManual', idr, []);
    await x.grava('registrarContagemRetorno', { ID_REMESSA: idr, itens: [{ ID_VOLUME: vols[5], QTD_CONTADA: it.QTD_ENVIADA }] });
    const ret = (await x.api('getRemessasExternas', [])).find(z => z.ID_REMESSA === idr).itens[0].retornos[0];
    const ins = await x.grava('registrarInspecaoRetorno', { ID_REMESSA: idr, ID_RETORNO: ret.ID_RETORNO, QTD_APROVADA: it.QTD_ENVIADA - 2, QTD_REPROVADA: 1, QTD_RETRABALHO: 1, QTD_EMBALADA: 0, RESPONSAVEL_INSPECAO: 'Carla', MOTIVO_DEFEITO: 'ponto solto' });
    if ((ins.continuacoes || []).length !== 1 || (ins.retrabalhos || []).length !== 1) throw new Error('inspeção: ' + JSON.stringify([ins.continuacoes, ins.retrabalhos]));
    const vs = await x.api('getVolumes', []);
    cont = vs.find(v => v.ID_VOLUME_ORIGEM_PARCIAL === vols[5]);
    const orig = vs.find(v => v.ID_VOLUME === vols[5]), rt = vs.find(v => v.ID_VOLUME_ORIGEM_RETRABALHO === vols[5]);
    if (!cont || cont.STATUS_VOLUME !== 'AGUARDANDO_DESTINO' || cont.QTD_VOLUME !== it.QTD_ENVIADA - 2 || !/-C1$/.test(cont.COD_VOLUME) || cont.ID_DESTINO_PARCIAL !== D2) throw new Error('continuação: ' + JSON.stringify(cont));
    if (orig.STATUS_VOLUME !== 'CONTINUACAO_GERADA') throw new Error('saco de origem: ' + orig.STATUS_VOLUME);
    if (!rt || rt.OPS_FEITAS !== (v5.OPS_FEITAS || '')) throw new Error('retrabalho herda o que já estava feito antes da facção');
    const lib = await x.api('liberarVolumeEstoquePA', [{ ID_VOLUME: vols[5], ORIGEM: 'RETORNO' }]);
    if (!lib || !lib.__error || !/continuação/.test(lib.message)) throw new Error('liberar o saco de origem devia ser recusado');
    await x.grava('destinarVolumesInternos', [cont.ID_VOLUME]);
    const cv = await x.api('getCuponsVolume', [cont.ID_VOLUME]);
    const cups = cv.cupons || cv || [];
    const st = cups.map(c => c.STATUS_CUPOM + '/' + (c.METODO_CONCLUSAO || '')).join(',');
    if (st !== 'CONCLUIDO/FACCAO,PENDENTE/,CONCLUIDO/FACCAO') throw new Error('cupons da continuação: ' + st);
    const imp = await x.grava('prepararImpressaoCuponsInternos', [cont.ID_VOLUME]);
    if ((imp.cupons || []).length !== 1) throw new Error('impressão devia ter só o cupom que falta: ' + (imp.cupons || []).length);
    const oc = await x.grava('registrarOcorrenciaFaccao', { ID_VOLUME: cont.ID_VOLUME, QTD: 2, MOTIVO: 'costura torta' });
    if (Math.abs(oc.debito - 2 * esperado) > 0.001) throw new Error('débito da ocorrência: ' + oc.debito);
    const semFac = await x.api('registrarOcorrenciaFaccao', [{ ID_VOLUME: vols[0], QTD: 1, MOTIVO: 'x' }]);
    if (!semFac || !semFac.__error) throw new Error('ocorrência num saco que não passou por facção devia ser recusada');
  });
  return { passos, ids: { P1, corte: corte1 && corte1.__id, vol: vols[0], vols, rem: rem && rem.remessa && rem.remessa.ID_REMESSA, cupom: cupons[0], cupom2: cupons[2], cont: cont && cont.ID_VOLUME } };
}

// ---------- as leituras comparadas ----------
function leituras(ids) {
  const per = { DATA_INICIAL: ontem(7), DATA_FINAL: hoje() };
  return [
    ['getCadastros', []], ['getEstoqueMateriais', []], ['getComprasRecentes', []], ['getFluxoEstoque', []], ['getFluxoEstoque', [0]],
    ['getCortesProgramados', []], ['getCorte', [ids.corte]], ['getEstoqueCorte', []], ['getSeparacoesVolume', []], ['getPrecosFaccao', []],
    ['getVolumes', []], ['getCuponsVolume', [ids.vol]], ['getCuponsVolume', [ids.cont]], ['getInternalProductionBoard', []], ['getRemessasExternas', []], ['getRemessasInternas', []], ['getFinanceiroFaccao', []],
    ['getDashboard', [hoje()]], ['getDashboard', [per]], ['getInternalProductionPerformance', [per]],
    ['getOperationalData', []], ['getBootstrapData', [hoje()]], ['getInitialData', [hoje()]],
    ['getScanCatalog', [false]], ['getScanCatalog', [true]], ['getExternalScanCatalog', ['', 'ENVIO']], ['getExternalScanCatalog', ['', 'RECEBIMENTO']], ['getExternalScanCatalog', [ids.rem, 'RECEBIMENTO']],
    ['previewTempoPadraoMarcacao', [{ ID_CUPOM: ids.cupom }]], ['previewTempoPadraoMarcacao', [{ ID_CUPOM: ids.cupom2 }]],
    ['prepararRomaneioRemessa', [ids.rem]], ['prepararRomaneioInterno', [[ids.vols[0], ids.vols[1]]]], ['getCorte', ['nao-existe']],
  ];
}

// executores do cenário: o mesmo roteiro nos dois caminhos
function executorA(gas, rel, log) {
  let i = 0; const mut = new Set(gas.ctx.mutationActions_());
  const api = async (acao, args = [], meta = {}) => {
    rel.acao(++i); const m = Object.assign({}, meta); if (mut.has(acao)) m.requestId = rel.requestId();
    const r = gas.api(acao, args, m);
    log.push({ i, acao, args, r, tabelas: Object.keys(gas.ctx.__SUPA_USED || {}) });
    return r;
  };
  return { api, grava: async (acao, ...args) => { const r = await api(acao, args); if (r && r.__error) throw new Error(acao + ': ' + r.message); return r; }, sql: q => pg.psql(q, { banco: 'gut' }) };
}
function executorB(srv, rel, log) {
  let i = 0;
  const api = async (acao, args = [], meta = {}) => {
    rel.acao(++i); const m = Object.assign({}, meta); if (srv.gravacao(acao)) m.requestId = rel.requestId();
    let r = JSON.parse(JSON.stringify(await srv.pedir(acao, JSON.parse(JSON.stringify(args)), m)));
    if (r && r.__error && r.code !== undefined) delete r.code;   // o servidor devolve também o código do erro do banco
    log.push({ i, acao, args, r });
    return r;
  };
  return { api, grava: async (acao, ...args) => { const r = await api(acao, args); if (r && r.__error) throw new Error(acao + ': ' + r.message); return r; }, sql: q => pg.psql(q, { banco: 'gut_b' }) };
}
const semSenha = v => JSON.parse(JSON.stringify(v === undefined ? null : v, (k, x) => (k === 'SENHA_HASH' || k === 'SENHA_SALT' ? undefined : x)));
function despejar(banco) {
  const out = {};
  Object.keys(pg.SCHEMA).forEach(t => {
    out[t] = JSON.parse(pg.psql(`select coalesce(jsonb_agg(to_jsonb(x) - 'sincronizado_em' - 'ordem_linha' order by x.ordem_linha), '[]')::text from public.${t} x;`, { banco }) || '[]');
  });
  // a resposta guardada para repetir a operação: o navegador grava gzip sem compressão; o conteúdo tem que ser o mesmo
  // (e o zlib do Node lê os dois formatos, como o Utilities.ungzip do Apps Script)
  out.app_operacoes.forEach(r => {
    const enc = Array.from({ length: 16 }, (_, i) => r['resultado_' + (i + 1)] || '').join('');
    Array.from({ length: 16 }, (_, i) => delete r['resultado_' + (i + 1)]);
    r.resultado = enc ? JSON.parse(require('zlib').gunzipSync(Buffer.from(enc, 'base64')).toString('utf8')) : null;
  });
  return out;
}

async function main() {
  const t0 = Date.now();
  await pg.subir({ bancos: ['gut', 'gut_b'] });
  let falhas = 0;
  try {
    const T0 = Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) + 'T10:00:00-03:00');
    const relA = criarRelogio(T0), relB = criarRelogio(T0), logA = [], logB = [];
    const gas = criarGas(pg, { banco: 'gut', relogio: relA });
    const motor = await carregarServidor({ banco: 'gut_b', relogio: relB });
    const A = await cenario(executorA(gas, relA, logA));
    const B = await cenario(executorB(motor, relB, logB));
    console.log('Cenário (A = regras como na antiga GUT API, B = servidor novo: Edge Function "gut"):');
    A.passos.forEach((p, k) => { const q = B.passos[k] || {}; console.log((p.ok && q.ok ? '  ✓ ' : '  ✗ ') + p.nome + (p.ok ? '' : ' — A: ' + p.erro) + (q.ok ? '' : ' — B: ' + q.erro)); if (!p.ok || !q.ok) falhas++; });
    const cont = pg.psql(`select string_agg(t || '=' || n, ' ') from (select 'volumes' t, count(*) n from volumes union all select 'cupons', count(*) from cupons_producao union all select 'remessas', count(*) from remessas union all select 'retornos', count(*) from retornos_externos union all select 'financeiro', count(*) from financeiro_faccao union all select 'apontamentos', count(*) from apontamentos_producao union all select 'mov_estoque', count(*) from mov_estoque union all select 'auditoria', count(*) from auditoria) x;`);
    console.log('  linhas: ' + cont);

    console.log('\nCada ação do cenário — resposta A × B:');
    const tabelas = {}, porAcao = {};
    logA.forEach((a, k) => {
      const b = logB[k] || {};
      tabelas[a.acao] = [...new Set([...(tabelas[a.acao] || []), ...a.tabelas.filter(t => t !== 'app_operacoes')])].sort();
      // diferença esperada: o Apps Script devolve SENHA_HASH/SENHA_SALT em algumas respostas; o navegador nunca recebe
      const dif = b.acao === a.acao ? comparar(semSenha(a.r), semSenha(b.r)) : ['ordem diferente: ' + a.acao + ' × ' + b.acao];
      if (/h4sh|s4lt|SENHA_SALT":"[0-9a-f]{8}/.test(JSON.stringify(b.r))) dif.push('SEGURANÇA: resposta do navegador com senha do app de campo');
      const s = porAcao[a.acao] || (porAcao[a.acao] = { n: 0, dif: [] }); s.n++; if (dif.length) s.dif.push(...dif.slice(0, 5).map(d => '#' + a.i + ' ' + d));
    });
    const mutT = gas.ctx.mutationActions_(), ok = new Set(logA.filter(a => mutT.includes(a.acao) && a.r && !a.r.__error).map(a => a.acao));
    const soErro = [...new Set(logA.filter(a => mutT.includes(a.acao) && a.r && a.r.__error && !ok.has(a.acao)).map(a => a.acao + ' (' + a.r.message.slice(0, 70) + ')'))];
    console.log('  gravações que funcionaram no cenário: ' + ok.size + ' de ' + mutT.length + (soErro.length ? '\n  só com erro (igual nos dois): ' + soErro.join('; ') : ''));
    console.log('  sem teste: ' + mutT.filter(a => !logA.some(l => l.acao === a)).join(', '));
    if (logA.length !== logB.length) { falhas++; console.log('  ✗ quantidade de ações: ' + logA.length + ' × ' + logB.length); }
    Object.entries(porAcao).forEach(([acao, s]) => {
      if (s.dif.length) { falhas++; console.log('  ✗ ' + acao + ' (' + s.n + 'x)'); s.dif.slice(0, 6).forEach(d => console.log('      ' + d)); }
      else console.log('  ✓ ' + acao + ' (' + s.n + 'x)');
    });

    console.log('\nTabelas no fim — banco A × banco B:');
    const dA = despejar('gut'), dB = despejar('gut_b'); let difT = 0;
    dA.app_operacoes = semSenha(dA.app_operacoes); dB.app_operacoes = semSenha(dB.app_operacoes);
    Object.keys(dA).forEach(t => { const d = comparar(dA[t], dB[t]); if (d.length) { difT++; console.log('  ✗ ' + t + ': ' + d.slice(0, 4).join(' | ')); } });
    if (difT) falhas++; else console.log('  ✓ as ' + Object.keys(dA).length + ' tabelas são idênticas (' + Object.values(dA).reduce((n, r) => n + r.length, 0) + ' linhas)');

    console.log('\nLeituras — regras antigas (banco A) × servidor novo (banco B):');
    for (const [acao, args] of leituras(A.ids)) {
      relA.acao(9000); relB.acao(9000);
      const a = gas.api(acao, args, {});
      tabelas[acao] = [...new Set([...(tabelas[acao] || []), ...Object.keys(gas.ctx.__SUPA_USED || {}).filter(t => t !== 'app_operacoes')])].sort();
      motor.zerar();
      let b = JSON.parse(JSON.stringify(await motor.pedir(acao, args, {}))); if (b && b.__error) delete b.code;
      const dif = comparar(a, b), txtB = JSON.stringify(b);
      if (/h4sh|s4lt/.test(txtB)) dif.push('SEGURANÇA: a resposta do navegador contém senha do app de campo');
      if (acao === 'getCadastros' && !/"TEM_SENHA":true/.test(txtB)) dif.push('getCadastros deveria marcar TEM_SENHA de quem tem senha');
      const nome = acao + '(' + args.map(x => JSON.stringify(x)).join(', ').slice(0, 60) + ')';
      if (dif.length) { falhas++; console.log('  ✗ ' + nome + ' — ' + dif.length + ' diferença(s)'); dif.slice(0, 8).forEach(d => console.log('      ' + d)); }
      else console.log('  ✓ ' + nome + (a && a.__error ? ' (os dois recusam: ' + a.message + ')' : '') + ' • ' + motor.viagens() + ' viagem(ns)');
    }
    if (process.argv.includes('--tabelas')) {
      fs.writeFileSync(path.join(ROOT, 'tools/motor_tabelas.json'), JSON.stringify(tabelas, null, 1) + '\n');
      console.log('\ntools/motor_tabelas.json atualizado — rode node tools/gerar_motor.js');
    }
    if (gas.ctx.__avisos.length) console.log('\nAvisos do Apps Script: ' + [...new Set(gas.ctx.__avisos)].slice(0, 5).join(' | '));
  } finally { pg.descer(true); }
  console.log(`\n${falhas ? '✗ ' + falhas + ' problema(s)' : '✓ paridade ok'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(falhas ? 1 : 0);
}
if (require.main === module) main().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
module.exports = { cenario, carregarMotor, carregarServidor, leituras, executorA, executorB, chamarRpc };
