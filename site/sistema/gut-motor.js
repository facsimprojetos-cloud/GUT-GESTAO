/* GUT PPCP — motor de leituras do sistema web. ARQUIVO GERADO por tools/gerar_motor.js a partir do Apps Script.
   Não edite à mão: mude o Code.gs e gere de novo. */
window.GUT_MOTOR = (function () {
// ----------------------------------------------------------------------------------------------
// Imitação do ambiente do Google Apps Script dentro do navegador (só o que as leituras usam).
// As tabelas vêm do Supabase pela RPC web_ler (mesmo formato do gut_ler que o Apps Script usa);
// a conversão de tipos é a do próprio Supabase.gs (supaIngest_/supaFromDb_), então o resultado é o mesmo.
// ----------------------------------------------------------------------------------------------
var __MOTOR = { rpc: null, email: '', slug: 'gut', schema: null, dados: {}, falta: null, tabelas: {}, log: false };
var GUT_TZ_ = 'America/Sao_Paulo';
var __FMT = {};
function motorPartes_(d, tz) {
  const f = __FMT[tz] || (__FMT[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const o = {}; f.formatToParts(d).forEach(p => { if (p.type !== 'literal') o[p.type] = p.value; });
  if (o.hour === '24') o.hour = '00';
  return o;
}
function motorOffsetMin_(ms, tz) { // minutos a somar ao UTC para ter a hora local de tz
  const p = motorPartes_(new Date(ms), tz);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}
var Utilities = {
  formatDate: function (d, tz, pat) {
    d = d instanceof Date ? d : new Date(d);
    if (isNaN(d.getTime())) throw new Error('Data inválida');
    const p = motorPartes_(d, tz || GUT_TZ_);
    const tok = { yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, SSS: String(d.getMilliseconds()).padStart(3, '0') };
    return String(pat).replace(/'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss|SSS/g, (m, lit) => lit !== undefined ? lit : tok[m]);
  },
  parseDate: function (s, tz, pat) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) throw new Error('Data inválida: ' + s);
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    let ms = guess - motorOffsetMin_(guess, tz || GUT_TZ_) * 60000;
    ms = guess - motorOffsetMin_(ms, tz || GUT_TZ_) * 60000;
    return new Date(ms);
  },
  getUuid: function () {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
};
var PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k === 'GUT_STORAGE' ? 'SUPABASE' : null; }, setProperty: function () {} }; } };
var CacheService = { getScriptCache: function () { return { get: function () { return null; }, getAll: function () { return {}; }, put: function () {}, putAll: function () {}, remove: function () {} }; } };
var Session = { getActiveUser: function () { return { getEmail: function () { return __MOTOR.email; } }; }, getEffectiveUser: function () { return { getEmail: function () { return __MOTOR.email; } }; } };
var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };

// --- trocas de funções do Apps Script (lista em tools/motor_trocadas.json) ---
// SUPA sem endereço nem token do servidor: o navegador só fala com o banco pelo login do usuário (web_ler)
var SUPA = { PROP: 'GUT_STORAGE', SCHEMA_CACHE: 'GUT_SUPA_SCHEMA_v1', PF_KEY: 'GUT_PF2:', SEM_PREFETCH: ['auditoria', 'movimentacoes', 'mov_estoque', 'bipagens_externas', 'app_operacoes'] };
function cacheGet_() { return null; }      // sem cache compartilhado: sempre lê o banco
function cachePut_() {}
function supaPrefetchList_() { return []; } // as tabelas já foram baixadas antes de rodar
function supaRpc_(fn, body) {
  if (fn === 'gut_schema') return __MOTOR.schema;
  if (fn === 'gut_ler') {
    const out = {};
    (body.p_tabelas || []).forEach(t => {
      if (Object.prototype.hasOwnProperty.call(__MOTOR.dados, t)) out[t] = __MOTOR.dados[t];
      else __MOTOR.falta.add(t);
    });
    if (__MOTOR.falta.size) throw new Error('__MOTOR_FALTA__');
    return out;
  }
  throw new Error('O motor de leituras do navegador não grava (' + fn + ').');
}

function motorPublico_(ACOES, IMPL) {
  const LS = 'gut-motor-tabelas:';
  const lembrar = (acao) => { let l = __MOTOR.tabelas[acao] || []; try { const s = JSON.parse(localStorage.getItem(LS + acao) || '[]'); if (Array.isArray(s)) l = l.concat(s); } catch (e) {} return [...new Set(l)]; };
  const aprender = (acao, novas) => { try { const l = lembrar(acao).concat(novas); localStorage.setItem(LS + acao, JSON.stringify([...new Set(l)])); } catch (e) {} };
  // baixa as tabelas que faltam para o "alvo" (cada execução tem o seu: chamadas simultâneas não se misturam)
  async function carregar(alvo, tabelas) {
    const faltam = [...new Set(tabelas)].filter(t => !Object.prototype.hasOwnProperty.call(alvo, t));
    if (!faltam.length) return false;
    const r = await __MOTOR.rpc('web_ler', { p_slug: __MOTOR.slug, p_tabelas: faltam });
    faltam.forEach(t => { alvo[t] = (r && r[t]) || []; });
    return true;
  }
  function rodar(acao, impl, args, meta) {
    resetRequestState_();
    __REQ = { fluxoDias: meta && meta.fluxoDias };
    supaBegin_(acao, false);
    __WEB_USER = __MOTOR.email || '';
    try {
      ensureRuntimeSchema_();
      __FRESH = true;
      return finalizeResponse_(serialize_(impl.apply(null, args)), {});
    } finally { __WEB_USER = ''; }
  }
  async function executar(acao, args, meta) {
    const nome = ACOES[acao];
    if (!nome) throw new Error('Ação sem motor no navegador: ' + acao);
    if (!__MOTOR.rpc) throw new Error('Motor de leituras sem conexão com o banco.');
    const t0 = Date.now();
    if (!__MOTOR.schema) __MOTOR.schema = await __MOTOR.rpc('web_schema', { p_slug: __MOTOR.slug });
    // cada execução lê o banco de novo (nada de dado velho); o código do Apps Script roda inteiro, sem pausas
    const minhas = {}; let viagens = 0;
    const baixar = async (lista) => { if (await carregar(minhas, lista)) viagens++; };
    await baixar(lembrar(acao).concat(['app_controle']));
    for (let tentativa = 0; tentativa < 60; tentativa++) {
      const run = () => {
        __MOTOR.dados = minhas; __MOTOR.falta = new Set();
        try { return { ok: true, r: rodar(acao, IMPL[nome], args || [], meta || {}) }; }
        catch (e) { return { ok: false, e }; }
      };
      const res = run(); // síncrono: nada roda no meio (o código do Apps Script usa variáveis globais da requisição)
      const falta = [...__MOTOR.falta];
      if (falta.length) { aprender(acao, falta); await baixar(falta); continue; }
      if (__MOTOR.log) console.log('[GUT motor]', acao, (Date.now() - t0) + ' ms', viagens + ' leitura(s)');
      if (!res.ok) throw res.e;
      return res.r;
    }
    throw new Error('O motor de leituras não conseguiu reunir as tabelas de ' + acao + '.');
  }
  return {
    acoes: Object.keys(ACOES),
    tem: acao => Object.prototype.hasOwnProperty.call(ACOES, acao),
    configurar: function (o) { Object.assign(__MOTOR, o || {}); if (o && o.slug) __MOTOR.schema = null; },
    executar: executar,
    estado: () => __MOTOR
  };
}

// ======================= código do Apps Script (somente leituras) =======================
// Code.gs:16
const CFG = Object.freeze({
  SPREADSHEET_ID: '1eihZ8DT7mp9iMqCBQF7rYJSNUgl9oWP3ttaWVbdHtLA',
  TZ: 'America/Sao_Paulo',
  APP_NAME: 'GUT PPCP',
  OPENAI_URL: 'https://api.openai.com/v1/responses',
  OPENAI_MODEL_FALLBACK: 'gpt-6-luna',
  MAX_LIST: 500,
  DEFAULT_MINUTES_DAY: 540,
  SCAN_CACHE_SECONDS: 90,
  SCAN_BATCH_MAX: 1000,
  SCAN_CATALOG_MAX: 5000,
});
// Code.gs:29
const TAB = Object.freeze({
  PRODUTOS: 'CAD_PRODUTOS',
  CORES: 'CAD_CORES',
  TAMANHOS: 'CAD_TAMANHOS',
  PROCESSOS: 'CAD_PROCESSOS',
  MAQUINAS: 'CAD_MAQUINAS',
  DESTINOS: 'CAD_DESTINOS',
  USUARIOS: 'CAD_USUARIOS',
  SETORES: 'CAD_SETORES',
  OPERADORES: 'CAD_OPERADORES',
  ROTEIRO: 'ROTEIRO_PRODUTO',
  MATERIAIS: 'CAD_MATERIAIS',
  FORNECEDORES: 'CAD_FORNECEDORES',
  LOCAIS_ESTOQUE: 'CAD_LOCAIS_ESTOQUE',
  COMPRAS: 'COMPRAS',
  COMPRA_ITENS: 'COMPRA_ITENS',
  ESTOQUE_LOTES: 'ESTOQUE_LOTES',
  ESTOQUE_SALDOS: 'ESTOQUE_SALDOS',
  MOV_ESTOQUE: 'MOV_ESTOQUE',
  ESTRUTURA_PRODUTO: 'ESTRUTURA_PRODUTO',
  CORTE_CONSUMOS: 'CORTE_CONSUMOS',
  PEDIDOS_CORTE: 'PEDIDOS_CORTE',
  ESTOQUE_CORTE: 'ESTOQUE_CORTE',
  VOLUMES: 'VOLUMES',
  VOLUME_ITENS: 'VOLUME_ITENS',
  REMESSAS: 'REMESSAS',
  REMESSA_ITENS: 'REMESSA_ITENS',
  RETORNOS_EXTERNOS: 'RETORNOS_EXTERNOS',
  RETORNO_VOLUME_ITENS: 'RETORNO_VOLUME_ITENS',
  MOVIMENTACOES: 'MOVIMENTACOES',
  SEQUENCIAS: 'SEQUENCIAS',
  AUDITORIA: 'AUDITORIA',
  CUPONS: 'CUPONS_PRODUCAO',
  APONTAMENTOS: 'APONTAMENTOS_PRODUCAO',
  JORNADA: 'JORNADA_OPERADOR',
  INDICADOR: 'INDICADOR_DIARIO',
  BIPAGENS_EXTERNAS: 'BIPAGENS_EXTERNAS',
  SEPARACOES_VOLUME: 'SEPARACOES_VOLUME',
  PRECO_FACCAO: 'CAD_PRECOS_FACCAO',
  FINANCEIRO_FACCAO: 'FINANCEIRO_FACCAO',
  PAGAMENTOS_FACCAO: 'PAGAMENTOS_FACCAO',
});
// Code.gs:107
var __SS_MEM = null;
// Code.gs:108
var __TABLE_MEM = {};
// Code.gs:109
var __HEADER_MEM = {};
// Code.gs:130
function getInitialDataImpl_(dataRef) {
  ensureExternalSchema_();
  ensureInventorySchema_();
  const data = normalizeDateKey_(dataRef || todayKey_());

  // O fluxo de estoque é complementar. Se existir algum dado histórico
  // incompatível, ele não pode derrubar o carregamento de produtos, cortes,
  // volumes e demais cadastros do aplicativo.
  let fluxoEstoque = [];
  let avisoFluxoEstoque = '';
  try {
    fluxoEstoque = getFluxoEstoqueImpl_();
  } catch (e) {
    avisoFluxoEstoque = String((e && e.message) || e || 'Falha ao carregar fluxo de estoque.');
  }

  return {
    ok: true,
    appName: CFG.APP_NAME,
    today: todayKey_(),
    date: data,
    userEmail: currentUser_(),
    cadastros: getCadastrosImpl_(),
    dashboard: getDashboardImpl_(data),
    estoque: getEstoqueCorteImpl_(),
    volumes: getVolumesImpl_(),
    remessas: getRemessasExternasImpl_(),
    precosFaccao: getPrecosFaccaoImpl_(),
    cortesProgramados: getCortesProgramadosImpl_(),
    estoqueMateriais: getEstoqueMateriaisImpl_(),
    comprasRecentes: getComprasRecentesImpl_(),
    fluxoEstoque: fluxoEstoque,
    avisoFluxoEstoque: avisoFluxoEstoque,
  };
}
// Code.gs:170
function getCadastrosImpl_() {
  const produtos = active_(readTable_(TAB.PRODUTOS), 'ATIVO');
  const cores = active_(readTable_(TAB.CORES), 'ATIVO');
  const tamanhos = active_(readTable_(TAB.TAMANHOS), 'ATIVO')
    .sort((a, b) => num_(a.ORDEM_EXIBICAO) - num_(b.ORDEM_EXIBICAO));
  const processos = active_(readTable_(TAB.PROCESSOS), 'ATIVO')
    .sort((a, b) => num_(a.ORDEM_PADRAO) - num_(b.ORDEM_PADRAO));
  const maquinas = active_(readTable_(TAB.MAQUINAS), 'ATIVO')
    .sort((a, b) => String(a.MAQUINA || '').localeCompare(String(b.MAQUINA || ''), 'pt-BR'));
  const destinos = active_(readTable_(TAB.DESTINOS), 'ATIVO');
  const setores = active_(readTable_(TAB.SETORES), 'ATIVO');
  const operadores = active_(readTable_(TAB.OPERADORES), 'ATIVO');
  const roteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO');
  const materiais = active_(readTable_(TAB.MATERIAIS), 'ATIVO');
  const fornecedores = active_(readTable_(TAB.FORNECEDORES), 'ATIVO');
  const locaisEstoque = active_(readTable_(TAB.LOCAIS_ESTOQUE), 'ATIVO');
  const estruturaProduto = active_(readTable_(TAB.ESTRUTURA_PRODUTO), 'ATIVO');

  return {
    produtos: stripMeta_(produtos),
    cores: stripMeta_(cores),
    tamanhos: stripMeta_(tamanhos),
    processos: stripMeta_(processos),
    maquinas: stripMeta_(maquinas),
    destinos: stripMeta_(destinos).map(campoPublicRecord_),
    setores: stripMeta_(setores),
    operadores: stripMeta_(operadores).map(campoPublicRecord_),
    roteiro: stripMeta_(roteiro),
    materiais: custosMateriais_(stripMeta_(materiais)),
    fornecedores: stripMeta_(fornecedores),
    locaisEstoque: stripMeta_(locaisEstoque),
    estruturaProduto: stripMeta_(estruturaProduto),
    parametros: getParametros_(),
  };
}
// Code.gs:740
function getEstoqueMateriaisImpl_() {
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const lotes = mapBy_(readTable_(TAB.ESTOQUE_LOTES), 'ID_LOTE');
  const locais = mapBy_(readTable_(TAB.LOCAIS_ESTOQUE), 'ID_LOCAL_ESTOQUE');
  const saldos = readTable_(TAB.ESTOQUE_SALDOS);
  const totalPorMaterial = {};
  saldos.forEach(s => {
    const id = String(s.ID_MATERIAL || '');
    totalPorMaterial[id] = round6_((totalPorMaterial[id] || 0) + num_(s.QTD_DISPONIVEL));
  });
  return saldos
    .sort((a,b) => {
      const ma = materiais[a.ID_MATERIAL] || {}, mb = materiais[b.ID_MATERIAL] || {};
      return String(ma.MATERIAL || '').localeCompare(String(mb.MATERIAL || ''), 'pt-BR') || dateMs_((lotes[a.ID_LOTE]||{}).DATA_ENTRADA) - dateMs_((lotes[b.ID_LOTE]||{}).DATA_ENTRADA);
    })
    .map(s => {
      const m = materiais[s.ID_MATERIAL] || {};
      const l = lotes[s.ID_LOTE] || {};
      const loc = locais[s.ID_LOCAL_ESTOQUE] || {};
      const totalMaterial = num_(totalPorMaterial[String(s.ID_MATERIAL || '')]);
      const minimo = num_(m.ESTOQUE_MINIMO);
      return {
        ...serialize_(s),
        COD_MATERIAL: m.COD_MATERIAL || '',
        MATERIAL: m.MATERIAL || s.ID_MATERIAL,
        TIPO_MATERIAL: m.TIPO_MATERIAL || '',
        UNIDADE: l.UNIDADE || m.UNIDADE_ESTOQUE || '',
        ESTOQUE_MINIMO: minimo,
        SALDO_TOTAL_MATERIAL: totalMaterial,
        ABAIXO_MINIMO: minimo > 0 && totalMaterial <= minimo,
        COD_LOTE: l.COD_LOTE || '',
        DATA_ENTRADA: serialize_(l.DATA_ENTRADA),
        LOCAL_ESTOQUE: loc.LOCAL_ESTOQUE || s.ID_LOCAL_ESTOQUE,
      };
    });
}
// Code.gs:777
function getComprasRecentesImpl_() {
  const fornecedores = mapBy_(readTable_(TAB.FORNECEDORES), 'ID_FORNECEDOR');
  // v4.5.6: contagem de itens em uma única passada (antes era um filtro por compra).
  const qtdItens = Object.create(null);
  readTable_(TAB.COMPRA_ITENS).forEach(i => { const k = String(i.ID_COMPRA); qtdItens[k] = (qtdItens[k] || 0) + 1; });
  return readTable_(TAB.COMPRAS)
    .sort((a,b) => dateMs_(b.ATUALIZADO_EM || b.DATA_COMPRA || b.CRIADO_EM) - dateMs_(a.ATUALIZADO_EM || a.DATA_COMPRA || a.CRIADO_EM))
    .map(c => ({
      ...serialize_(c),
      FORNECEDOR: ((fornecedores[c.ID_FORNECEDOR] || {}).NOME_FANTASIA || (fornecedores[c.ID_FORNECEDOR] || {}).RAZAO_SOCIAL || c.ID_FORNECEDOR || ''),
      QTD_ITENS: qtdItens[String(c.ID_COMPRA)] || 0,
    }));
}

/**
 * v4.5.6: o fluxo de estoque é filtrado por período para não trafegar todo o
 * histórico a cada atualização. dias = 0 devolve o histórico completo.
 * Sem argumento, usa o período escolhido na tela (enviado pelo front em meta.fluxoDias).
 */
// Code.gs:796
function fluxoDiasPadrao_() {
  const d = Number(__REQ && __REQ.fluxoDias);
  return Number.isFinite(d) && d >= 0 ? Math.floor(d) : 30;
}
// Code.gs:800
function getFluxoEstoqueImpl_(dias) {
  const periodo = (dias === undefined || dias === null || dias === '') ? fluxoDiasPadrao_() : Math.max(0, Math.floor(num_(dias)));
  // dateFromKey_ devolve meio-dia; recua 12h para começar à 00:00 do primeiro dia do período.
  const limiteMs = periodo > 0 ? dateFromKey_(todayKey_()).getTime() - 12 * 3600000 - (periodo - 1) * 86400000 : 0;
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const lotes = mapBy_(readTable_(TAB.ESTOQUE_LOTES), 'ID_LOTE');
  const locais = mapBy_(readTable_(TAB.LOCAIS_ESTOQUE), 'ID_LOCAL_ESTOQUE');
  const cortes = mapBy_(readTable_(TAB.PEDIDOS_CORTE), 'ID_CORTE');
  const produtos = mapBy_(readTable_(TAB.PRODUTOS), 'ID_PRODUTO');
  return readTable_(TAB.MOV_ESTOQUE)
    .filter(mov => { if (!limiteMs) return true; const ms = dateMs_(mov.DATA_HORA); return !ms || ms >= limiteMs; }) // sem data legível: mantém visível
    .sort((a,b) => dateMs_(b.DATA_HORA) - dateMs_(a.DATA_HORA))
    .map(mov => {
      const mat = materiais[mov.ID_MATERIAL] || {};
      const lote = lotes[mov.ID_LOTE] || {};
      const loc = locais[mov.ID_LOCAL_ESTOQUE] || {};
      const idCorte = mov.ID_CORTE || (String(mov.TIPO_ORIGEM || '').toUpperCase() === 'CORTE' ? mov.ID_ORIGEM : '');
      const corte = cortes[idCorte] || {};
      const produto = produtos[corte.ID_PRODUTO] || {};
      const qtd = num_(mov.QTD_MOV);
      const origem = String(mov.TIPO_ORIGEM || '').toUpperCase();
      // LOTE_CORTE pode ter sido interpretado pelo Sheets como Date em registros
      // históricos. Convertemos SEMPRE antes de devolver ao google.script.run.
      const loteCorte = serialize_(mov.LOTE_CORTE || corte.LOTE_CORTE || '');
      let origemLabel = mov.TIPO_MOV || origem || 'MOVIMENTO';
      if (origem === 'CORTE' || idCorte) origemLabel = 'CORTE ' + loteCorte;
      else if (origem === 'COMPRA') origemLabel = 'COMPRA';
      else if (origem === 'MANUAL') origemLabel = 'BAIXA MANUAL';
      else if (origem === 'AJUSTE') origemLabel = 'AJUSTE DE ESTOQUE';
      return {
        ...serialize_(mov),
        MATERIAL: mat.MATERIAL || mov.ID_MATERIAL || '',
        COD_MATERIAL: mat.COD_MATERIAL || '',
        COD_LOTE: lote.COD_LOTE || '',
        UNIDADE: lote.UNIDADE || mat.UNIDADE_ESTOQUE || '',
        LOCAL_ESTOQUE: loc.LOCAL_ESTOQUE || '',
        QTD_ABS: Math.abs(qtd),
        SENTIDO: qtd >= 0 ? 'ENTRADA' : 'SAIDA',
        VALOR_MOVIMENTO: round2_(Math.abs(qtd) * num_(mov.CUSTO_UNITARIO)),
        ID_CORTE_REF: idCorte || '',
        LOTE_CORTE: loteCorte,
        DATA_CORTE: serialize_(corte.DATA_CORTE || ''),
        PRODUTO_CORTE: produto.PRODUTO || produto.CODIGO_PRODUTO || '',
        PEDIDO_CORTE: corte.PEDIDO || '',
        ORDEM_CORTE: corte.ORDEM || '',
        ORIGEM_LABEL: origemLabel.trim(),
      };
    });
}
// Code.gs:1130
function inventoryConversionFactor_(unidadeConsumo, unidadeEstoque, fatorConfigurado) {
  const cfg = num_(fatorConfigurado, NaN);
  if (Number.isFinite(cfg) && cfg > 0) return cfg;
  const a = normKey_(unidadeConsumo), b = normKey_(unidadeEstoque);
  if (!a || !b || a === b) return 1;
  const map = {
    'UN|MIL': 0.001, 'MIL|UN': 1000,
    'UN|DZ': 1/12, 'DZ|UN': 12,
    'G|KG': 0.001, 'KG|G': 1000,
    'CM|M': 0.01, 'M|CM': 100,
    'MM|M': 0.001, 'M|MM': 1000,
    'ML|L': 0.001, 'L|ML': 1000,
  };
  return map[a+'|'+b] || 0;
}
// Code.gs:1326
function getCortesProgramadosImpl_() {
  const maps = buildMaps_();
  return readTable_(TAB.PEDIDOS_CORTE)
    .filter(c => !truthy_(c.EXPLODIDO))
    .sort((a, b) => dateMs_(b.ATUALIZADO_EM || b.DATA_HORA || b.DATA_CORTE) - dateMs_(a.ATUALIZADO_EM || a.DATA_HORA || a.DATA_CORTE))
    .map(c => {
      const cores = [];
      const tamanhos = [];
      for (let i = 1; i <= 12; i++) {
        if (c['ID_COR_' + i] && num_(c['FOLHAS_' + i]) > 0) {
          cores.push({
            ID_COR: c['ID_COR_' + i],
            COR: maps.cores[c['ID_COR_' + i]] || c['ID_COR_' + i],
            FOLHAS: num_(c['FOLHAS_' + i]),
          });
        }
      }
      for (let i = 1; i <= 8; i++) {
        if (c['ID_TAMANHO_' + i] && num_(c['RISCOS_' + i]) > 0) {
          tamanhos.push({
            ID_TAMANHO: c['ID_TAMANHO_' + i],
            TAMANHO: maps.tamanhos[c['ID_TAMANHO_' + i]] || c['ID_TAMANHO_' + i],
            RISCOS: num_(c['RISCOS_' + i]),
          });
        }
      }
      const totalFolhas = cores.reduce((s, x) => s + num_(x.FOLHAS), 0);
      const totalRiscos = tamanhos.reduce((s, x) => s + num_(x.RISCOS), 0);
      return {
        ...serialize_(c),
        STATUS_CORTE: 'PROGRAMADO',
        PRODUTO: maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO,
        cores,
        tamanhos,
        QTD_PLANEJADA: totalFolhas * totalRiscos,
      };
    });
}
// Code.gs:1443
function getEstoqueCorteImpl_() {
  const estoque = readTable_(TAB.ESTOQUE_CORTE);
  const maps = buildMaps_();
  return estoque
    .sort((a, b) => dateMs_(b.ATUALIZADO_EM || b.DATA_GERACAO) - dateMs_(a.ATUALIZADO_EM || a.DATA_GERACAO))
    .map(x => ({
      ...serialize_(x),
      PRODUTO: maps.produtos[x.ID_PRODUTO] || x.ID_PRODUTO,
      COR: maps.cores[x.ID_COR] || x.ID_COR,
      TAMANHO: maps.tamanhos[x.ID_TAMANHO] || x.ID_TAMANHO,
    }));
}

// -----------------------------------------------------------------------------
// VOLUMES / PRODUÇÃO INTERNA / CUPONS
// -----------------------------------------------------------------------------

/**
 * v4.5.7 — a numeração dos sacos é contínua no LOTE (corte), não mais no sublote.
 * Ex.: 01-10-2026.1-V01..V04, 01-10-2026.2-V05..V09. O sublote continua no código.
 * Caixas internas (V05.1, V05.2) não entram na conta: herdam o número do saco pai.
 */
// Code.gs:1603
function getSeparacoesVolumeImpl_() {
  ensureExternalSchema_();
  const separacoes = readTable_(TAB.SEPARACOES_VOLUME);
  const volumes = readTable_(TAB.VOLUMES);
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const maps = buildMaps_();
  return separacoes
    .sort((a,b)=>dateMs_(b.DATA_HORA)-dateMs_(a.DATA_HORA))
    .map(sep => {
      const vs = volumes
        .filter(v => String(v.ID_SEPARACAO || '') === String(sep.ID_SEPARACAO))
        .sort((a,b)=>num_(a.SEQ_SEPARACAO)-num_(b.SEQ_SEPARACAO))
        .map(v => {
          const conteudos = volumeItens.filter(vi => String(vi.ID_VOLUME) === String(v.ID_VOLUME));
          const c = conteudos[0] || {};
          return {
            ...serialize_(v),
            VOLUME_EXIBICAO: 'VOLUME ' + String(num_(v.SEQ_SEPARACAO || v.VOLUME_SEQ || 0)).padStart(2,'0'),
            PRODUTO: maps.produtos[c.ID_PRODUTO] || '',
            COR: maps.cores[c.ID_COR] || '',
            TAMANHO: maps.tamanhos[c.ID_TAMANHO] || '',
            QTD: num_(v.QTD_VOLUME),
          };
        });
      return {
        ...serialize_(sep),
        volumes: vs,
      };
    });
}
// Code.gs:1777
function getPrecosFaccaoImpl_() {
  ensureExternalSchema_();
  const maps = buildMaps_();
  return readTable_(TAB.PRECO_FACCAO)
    .sort((a,b)=>dateMs_(b.ATUALIZADO_EM || b.CRIADO_EM)-dateMs_(a.ATUALIZADO_EM || a.CRIADO_EM))
    .map(x => ({
      ...serialize_(x),
      FACCAO: maps.destinos[x.ID_DESTINO] || x.ID_DESTINO || '',
      PRODUTO: maps.produtos[x.ID_PRODUTO] || x.ID_PRODUTO || '',
      VALOR_UNITARIO: num_(x.VALOR_UNITARIO),
    }));
}
// Code.gs:2323
function getVolumesImpl_() {
  const volumes = readTable_(TAB.VOLUMES);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const cupons = readTable_(TAB.CUPONS);
  const maps = buildMaps_(), contentByVolume=groupBy_(volumeItens,'ID_VOLUME');
  const cupCount = {};
  const cupDone = {};
  const filhosPorPai = {};
  volumes.forEach(v => {
    const pai = String(v.ID_VOLUME_ORIGEM || '');
    if (pai) (filhosPorPai[pai] = filhosPorPai[pai] || []).push(v);
  });
  cupons.forEach(c => {
    cupCount[c.ID_VOLUME] = (cupCount[c.ID_VOLUME] || 0) + 1;
    if (String(c.STATUS_CUPOM).toUpperCase() === 'CONCLUIDO') cupDone[c.ID_VOLUME] = (cupDone[c.ID_VOLUME] || 0) + 1;
  });

  return volumes
    .sort((a, b) => dateMs_(b.DATA_CRIACAO) - dateMs_(a.DATA_CRIACAO))
    .map(v => {
      const e = estoque[v.ID_ESTOQUE_CORTE] || {};
      const conteudos = (contentByVolume[String(v.ID_VOLUME)]||[]);
      const produtos = [...new Set(conteudos.map(c => maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO).filter(Boolean))];
      const cores = [...new Set(conteudos.map(c => maps.cores[c.ID_COR] || c.ID_COR).filter(Boolean))];
      const tamanhos = [...new Set(conteudos.map(c => maps.tamanhos[c.ID_TAMANHO] || c.ID_TAMANHO).filter(Boolean))];
      return {
        ...serialize_(v),
        ID_PRODUTO: e.ID_PRODUTO || (conteudos.length===1?conteudos[0].ID_PRODUTO:''),
        PRODUTO: produtos.length ? produtos.join(' + ') : (maps.produtos[e.ID_PRODUTO] || ''),
        COR: cores.length===1 ? cores[0] : (cores.length>1?'MÚLTIPLAS':(maps.cores[e.ID_COR] || '')),
        TAMANHO: tamanhos.length===1 ? tamanhos[0] : (tamanhos.length>1?'MÚLTIPLOS':(maps.tamanhos[e.ID_TAMANHO] || '')),
        CONTEUDOS: serialize_(conteudos),
        CUPONS_TOTAL: cupCount[v.ID_VOLUME] || 0,
        CUPONS_CONCLUIDOS: cupDone[v.ID_VOLUME] || 0,
        EH_CAIXA_INTERNA: !!v.ID_VOLUME_ORIGEM,
        QTD_CAIXAS: (filhosPorPai[String(v.ID_VOLUME)] || []).length,
        QTD_FRACIONADA: (filhosPorPai[String(v.ID_VOLUME)] || []).reduce((sum, x) => sum + num_(x.QTD_VOLUME), 0),
        SALDO_FRACIONAR: Math.max(0, num_(v.QTD_VOLUME) - (filhosPorPai[String(v.ID_VOLUME)] || []).reduce((sum, x) => sum + num_(x.QTD_VOLUME), 0)),
        DESTINO: maps.destinos[v.ID_DESTINO_ATUAL] || '',
        COD_VOLUME_EXIBICAO: volumeOperationalCode_(v, e.SUBLOTE),
        VOLUME_EXIBICAO: volumeOperationalCode_(v, e.SUBLOTE),
      };
    });
}
// Code.gs:2369
function getCuponsVolumeImpl_(idVolume) {
  const cupons = readTable_(TAB.CUPONS).filter(c => c.ID_VOLUME === idVolume)
    .sort((a, b) => num_(a.ORDEM_PROCESSO) - num_(b.ORDEM_PROCESSO));
  const maps = buildMaps_();
  const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  return cupons.map(c => ({
    ...serialize_(c),
    PRODUTO: maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO,
    COR: maps.cores[c.ID_COR] || c.ID_COR,
    TAMANHO: maps.tamanhos[c.ID_TAMANHO] || c.ID_TAMANHO,
    PROCESSO: maps.processos[c.ID_PROCESSO] || c.ID_PROCESSO,
    SETOR: maps.setores[c.ID_SETOR] || c.ID_SETOR,
    MAQUINA: (()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||id||''})(),
  }));
}
// Code.gs:2407
function romaneioItemsFromVolumes_(volumeIds) {
  const ids = new Set((volumeIds || []).map(String).filter(Boolean));
  if (!ids.size) return [];
  const volumes = readTable_(TAB.VOLUMES).filter(v => ids.has(String(v.ID_VOLUME)));
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const out = [];

  volumes.forEach(v => {
    const vis = volumeItens.filter(vi => String(vi.ID_VOLUME) === String(v.ID_VOLUME));
    if (vis.length) {
      vis.forEach(vi => {
        const est = estoque[vi.ID_ESTOQUE_CORTE] || {};
        out.push({
          ID_VOLUME: v.ID_VOLUME,
          COD_VOLUME: v.COD_VOLUME || '',
          NUM_SEPARACAO: v.NUM_SEPARACAO || '',
          LOTE_CORTE: est.LOTE_CORTE || '',
          SUBLOTE: vi.SUBLOTE || est.SUBLOTE || v.SUBLOTE || '',
          ID_PRODUTO: vi.ID_PRODUTO || est.ID_PRODUTO || '',
          ID_COR: vi.ID_COR || est.ID_COR || '',
          ID_TAMANHO: vi.ID_TAMANHO || est.ID_TAMANHO || '',
          PRODUTO: maps.produtos[vi.ID_PRODUTO || est.ID_PRODUTO] || '',
          COR: maps.cores[vi.ID_COR || est.ID_COR] || '',
          TAMANHO: maps.tamanhos[vi.ID_TAMANHO || est.ID_TAMANHO] || '',
          QTD: num_(vi.QTD_ITEM),
        });
      });
      return;
    }
    const est = estoque[v.ID_ESTOQUE_CORTE] || {};
    out.push({
      ID_VOLUME: v.ID_VOLUME,
      COD_VOLUME: v.COD_VOLUME || '',
      NUM_SEPARACAO: v.NUM_SEPARACAO || '',
      LOTE_CORTE: est.LOTE_CORTE || '',
      SUBLOTE: v.SUBLOTE || est.SUBLOTE || '',
      ID_PRODUTO: est.ID_PRODUTO || '',
      ID_COR: est.ID_COR || '',
      ID_TAMANHO: est.ID_TAMANHO || '',
      PRODUTO: maps.produtos[est.ID_PRODUTO] || '',
      COR: maps.cores[est.ID_COR] || '',
      TAMANHO: maps.tamanhos[est.ID_TAMANHO] || '',
      QTD: num_(v.QTD_VOLUME),
    });
  });
  return out.filter(x => x.ID_PRODUTO && x.QTD > 0);
}

/**
 * Calcula o picking físico a partir da ESTRUTURA_PRODUTO exatamente com a
 * mesma regra de consumo/perda/conversão usada no corte. Não gera nova baixa
 * de estoque: é somente um documento operacional de separação.
 */
// Code.gs:2462
function buildMaterialSeparation_(items) {
  items = (items || []).filter(x => x && x.ID_PRODUTO && num_(x.QTD) > 0);
  const estruturas = active_(readTable_(TAB.ESTRUTURA_PRODUTO), 'ATIVO');
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const maps = buildMaps_();
  const prodIds = [...new Set(items.map(x => String(x.ID_PRODUTO)).filter(Boolean))];
  const semEstrutura = prodIds.filter(id => !estruturas.some(e => String(e.ID_PRODUTO) === id));
  const agg = {};

  estruturas.forEach(e => {
    const aplicaveis = items.filter(i =>
      String(i.ID_PRODUTO) === String(e.ID_PRODUTO) &&
      (!e.ID_COR || String(i.ID_COR) === String(e.ID_COR)) &&
      (!e.ID_TAMANHO || String(i.ID_TAMANHO) === String(e.ID_TAMANHO))
    );
    const qtdPecas = aplicaveis.reduce((sum, i) => sum + num_(i.QTD), 0);
    if (qtdPecas <= 0) return;

    const mat = materiais[e.ID_MATERIAL] || {};
    const unidadeConsumo = String(e.UNIDADE_CONSUMO || mat.UNIDADE_ESTOQUE || '').trim().toUpperCase();
    const unidadeEstoque = String(mat.UNIDADE_ESTOQUE || unidadeConsumo || '').trim().toUpperCase();
    const consumoOrigem = round6_(qtdPecas * num_(e.CONSUMO_POR_UN) * (1 + num_(e.PERDA_PCT) / 100));
    if (consumoOrigem <= 0) return;
    const fator = inventoryConversionFactor_(unidadeConsumo, unidadeEstoque, e.FATOR_CONVERSAO_ESTOQUE);
    const conversaoOk = fator > 0;
    const qtdEstoque = conversaoOk ? round6_(consumoOrigem * fator) : 0;
    const key = String(e.ID_MATERIAL) + '|' + unidadeEstoque;

    if (!agg[key]) {
      agg[key] = {
        ID_MATERIAL: e.ID_MATERIAL,
        COD_MATERIAL: mat.COD_MATERIAL || '',
        MATERIAL: mat.MATERIAL || e.ID_MATERIAL,
        TIPO_MATERIAL: String(mat.TIPO_MATERIAL || 'OUTRO').toUpperCase(),
        UNIDADE: unidadeEstoque || unidadeConsumo,
        QTD_SEPARAR: 0,
        CONVERSAO_OK: true,
        OBSERVACOES: [],
        APLICACOES: [],
      };
    }
    const a = agg[key];
    a.QTD_SEPARAR = round6_(a.QTD_SEPARAR + qtdEstoque);
    if (!conversaoOk) a.CONVERSAO_OK = false;
    if (e.OBSERVACAO && !a.OBSERVACOES.includes(String(e.OBSERVACAO))) a.OBSERVACOES.push(String(e.OBSERVACAO));
    a.APLICACOES.push({
      ID_ESTRUTURA: e.ID_ESTRUTURA,
      PRODUTO: maps.produtos[e.ID_PRODUTO] || e.ID_PRODUTO,
      COR: e.ID_COR ? (maps.cores[e.ID_COR] || e.ID_COR) : 'Todas',
      TAMANHO: e.ID_TAMANHO ? (maps.tamanhos[e.ID_TAMANHO] || e.ID_TAMANHO) : 'Todos',
      QTD_PECAS: qtdPecas,
      CONSUMO_POR_UN: num_(e.CONSUMO_POR_UN),
      PERDA_PCT: num_(e.PERDA_PCT),
      UNIDADE_CONSUMO: unidadeConsumo,
      FATOR_CONVERSAO_ESTOQUE: conversaoOk ? fator : 0,
      QTD_CONSUMO_ORIGEM: consumoOrigem,
      QTD_ESTOQUE: qtdEstoque,
    });
  });

  const ordemTipo = { AVIAMENTO:1, EMBALAGEM:2, OUTRO:3, TECIDO:4 };
  const rows = Object.values(agg).sort((a,b) =>
    (ordemTipo[a.TIPO_MATERIAL] || 3) - (ordemTipo[b.TIPO_MATERIAL] || 3) ||
    String(a.MATERIAL || '').localeCompare(String(b.MATERIAL || ''), 'pt-BR')
  );
  return {
    totalPecas: items.reduce((sum,x)=>sum+num_(x.QTD),0),
    materiais: rows,
    produtosSemEstrutura: semEstrutura.map(id => maps.produtos[id] || id),
    temConversaoPendente: rows.some(x => !x.CONVERSAO_OK),
  };
}
// Code.gs:2535
function prepararRomaneioInternoImpl_(volumeIds) {
  volumeIds = Array.isArray(volumeIds) ? [...new Set(volumeIds.map(String).filter(Boolean))] : [];
  if (!volumeIds.length) throw new Error('Selecione pelo menos uma caixa para o romaneio interno.');

  const allVolumes = readTable_(TAB.VOLUMES);
  const selecionados = [];
  const addVolume = v => {
    if (!v || String(v.TIPO_LOCAL_ATUAL || '').toUpperCase() !== 'INTERNO') return;
    if (!selecionados.some(x => String(x.ID_VOLUME) === String(v.ID_VOLUME))) selecionados.push(v);
  };
  volumeIds.forEach(id => {
    const v = allVolumes.find(x => String(x.ID_VOLUME) === id);
    if (!v) return;
    const filhos = allVolumes.filter(x => String(x.ID_VOLUME_ORIGEM || '') === String(v.ID_VOLUME) && String(x.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'INTERNO');
    if (filhos.length) filhos.forEach(addVolume); else addVolume(v);
  });
  selecionados.sort((a,b)=>String(a.COD_VOLUME||'').localeCompare(String(b.COD_VOLUME||''),'pt-BR',{numeric:true}));
  if (!selecionados.length) throw new Error('Nenhuma caixa interna válida encontrada para o romaneio.');

  const ids = selecionados.map(v => String(v.ID_VOLUME));
  const idSet = new Set(ids);
  const itens = romaneioItemsFromVolumes_(ids);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const cupons = readTable_(TAB.CUPONS).filter(c => idSet.has(String(c.ID_VOLUME)));
  const roteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO');
  const caixas = selecionados.map(v => {
    const est = estoque[v.ID_ESTOQUE_CORTE] || {};
    const its = itens.filter(i => String(i.ID_VOLUME) === String(v.ID_VOLUME));
    const produtos = [...new Set(its.map(i=>i.PRODUTO).filter(Boolean))];
    const cores = [...new Set(its.map(i=>i.COR).filter(Boolean))];
    const tamanhos = [...new Set(its.map(i=>i.TAMANHO).filter(Boolean))];
    return {
      ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME||'',COD_VOLUME_EXIBICAO:volumeOperationalCode_(v,v.SUBLOTE||est.SUBLOTE),VOLUME_SEQ:num_(v.VOLUME_SEQ),
      LOTE_CORTE:est.LOTE_CORTE||'',SUBLOTE:v.SUBLOTE||est.SUBLOTE||'',QTD_VOLUME:num_(v.QTD_VOLUME),
      PRODUTO:produtos.join(' + ')||(maps.produtos[est.ID_PRODUTO]||''),
      COR:cores.length===1?cores[0]:(cores.length>1?'MÚLTIPLAS':(maps.cores[est.ID_COR]||'')),
      TAMANHO:tamanhos.length===1?tamanhos[0]:(tamanhos.length>1?'MÚLTIPLOS':(maps.tamanhos[est.ID_TAMANHO]||'')),
    };
  });

  const processos = [];
  selecionados.forEach(v => {
    const est = estoque[v.ID_ESTOQUE_CORTE] || {};
    let rows = cupons.filter(c => String(c.ID_VOLUME) === String(v.ID_VOLUME));
    if (!rows.length && est.ID_PRODUTO) {
      rows = roteiro.filter(r => String(r.ID_PRODUTO) === String(est.ID_PRODUTO)).map(r => ({
        ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME,ID_PRODUTO:est.ID_PRODUTO,ID_PROCESSO:r.ID_PROCESSO,
        ID_SETOR:r.ID_SETOR||'',ID_MAQUINA:r.ID_MAQUINA||(processoById[r.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'',ORDEM_PROCESSO:num_(r.ORDEM_PROCESSO,1),QTD_PROGRAMADA:num_(v.QTD_VOLUME),
        TEMPO_PADRAO_SEG_UN:num_(r.TEMPO_PADRAO_SEG_UN),MINUTOS_PADRAO_TOTAL:round2_(num_(v.QTD_VOLUME)*num_(r.TEMPO_PADRAO_SEG_UN)/60),
      }));
    }
    rows.sort((a,b)=>num_(a.ORDEM_PROCESSO)-num_(b.ORDEM_PROCESSO)).forEach(c => processos.push({
      ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME||c.COD_VOLUME||'',ORDEM_PROCESSO:num_(c.ORDEM_PROCESSO),
      PROCESSO:maps.processos[c.ID_PROCESSO]||c.ID_PROCESSO||'',SETOR:maps.setores[c.ID_SETOR]||c.ID_SETOR||'',MAQUINA:(()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||id||''})(),
      QTD_PROGRAMADA:num_(c.QTD_PROGRAMADA,num_(v.QTD_VOLUME)),TEMPO_PADRAO_SEG_UN:num_(c.TEMPO_PADRAO_SEG_UN),
      MINUTOS_PADRAO_TOTAL:round2_(num_(c.MINUTOS_PADRAO_TOTAL,num_(c.QTD_PROGRAMADA)*num_(c.TEMPO_PADRAO_SEG_UN)/60)),
      STATUS_CUPOM:c.STATUS_CUPOM||'PLANEJADO',
    }));
  });

  const resumoMap = {};
  processos.forEach(p => {
    const key = String(p.ORDEM_PROCESSO)+'|'+p.PROCESSO+'|'+p.SETOR+'|'+p.MAQUINA;
    if(!resumoMap[key]) resumoMap[key]={ORDEM_PROCESSO:p.ORDEM_PROCESSO,PROCESSO:p.PROCESSO,SETOR:p.SETOR,MAQUINA:p.MAQUINA,CAIXAS:0,QTD_PECAS:0,MINUTOS_PADRAO_TOTAL:0,_vols:new Set()};
    const r=resumoMap[key];if(!r._vols.has(String(p.ID_VOLUME))){r._vols.add(String(p.ID_VOLUME));r.CAIXAS++}
    r.QTD_PECAS+=num_(p.QTD_PROGRAMADA);r.MINUTOS_PADRAO_TOTAL=round2_(r.MINUTOS_PADRAO_TOTAL+num_(p.MINUTOS_PADRAO_TOTAL));
  });
  const resumoProcessos=Object.values(resumoMap).map(r=>({ORDEM_PROCESSO:r.ORDEM_PROCESSO,PROCESSO:r.PROCESSO,SETOR:r.SETOR,MAQUINA:r.MAQUINA,CAIXAS:r.CAIXAS,QTD_PECAS:r.QTD_PECAS,MINUTOS_PADRAO_TOTAL:r.MINUTOS_PADRAO_TOTAL})).sort((a,b)=>a.ORDEM_PROCESSO-b.ORDEM_PROCESSO||String(a.PROCESSO).localeCompare(String(b.PROCESSO),'pt-BR'));

  return {ok:true,tipo:'INTERNO',geradoEm:new Date(),caixas:serialize_(caixas),processos:serialize_(processos),resumoProcessos:serialize_(resumoProcessos),itens:serialize_(itens),materiais:serialize_(buildMaterialSeparation_(itens))};
}
// Code.gs:2609
function prepararRomaneioRemessaImpl_(idRemessa) {
  const remessa = readTable_(TAB.REMESSAS).find(r => String(r.ID_REMESSA) === String(idRemessa));
  if (!remessa) throw new Error('Remessa não encontrada.');
  const itensRemessa = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa));
  const volumeIds = itensRemessa.map(i => String(i.ID_VOLUME)).filter(Boolean);
  if (!volumeIds.length) throw new Error('Esta remessa não possui volumes.');
  const itens = romaneioItemsFromVolumes_(volumeIds);
  return {ok:true,tipo:'FACCAO',geradoEm:new Date(),ID_REMESSA:idRemessa,NUM_REMESSA:remessa.NUM_REMESSA||'',itens:serialize_(itens),materiais:serialize_(buildMaterialSeparation_(itens))};
}
// Code.gs:2624
function getCorteImpl_(idCorte) {
  const c = findById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', req_(idCorte, 'Corte'));
  if (!c) throw new Error('Corte não encontrado.');
  const maps = buildMaps_(), cores=[], tamanhos=[];
  for (let i=1;i<=12;i++) if (c['ID_COR_'+i] && num_(c['FOLHAS_'+i])>0) cores.push({ID_COR:c['ID_COR_'+i],COR:maps.cores[c['ID_COR_'+i]]||c['ID_COR_'+i],FOLHAS:num_(c['FOLHAS_'+i])});
  for (let i=1;i<=8;i++) if (c['ID_TAMANHO_'+i] && num_(c['RISCOS_'+i])>0) tamanhos.push({ID_TAMANHO:c['ID_TAMANHO_'+i],TAMANHO:maps.tamanhos[c['ID_TAMANHO_'+i]]||c['ID_TAMANHO_'+i],RISCOS:num_(c['RISCOS_'+i])});
  return serialize_({...c,PRODUTO:maps.produtos[c.ID_PRODUTO]||c.ID_PRODUTO,cores,tamanhos,EXPLODIDO:truthy_(c.EXPLODIDO)});
}
// Code.gs:2810
function getScanCatalogImpl_(forceRefresh) {
  const maps = buildMaps_();
  const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const items = readTable_(TAB.CUPONS)
    .filter(c => !['CONCLUIDO', 'CANCELADO', 'ESTORNADO', 'EM_ANDAMENTO_MARCACAO'].includes(String(c.STATUS_CUPOM || '').toUpperCase()))
    .map(c => ({
      id: String(c.ID_CUPOM || ''),
      token: String(c.QR_TOKEN || ''),
      code: String(c.COD_CUPOM || ''),
      volumeId: String(c.ID_VOLUME || ''),
      volume: String(c.COD_VOLUME || ''),
      product: maps.produtos[c.ID_PRODUTO] || String(c.ID_PRODUTO || ''),
      process: maps.processos[c.ID_PROCESSO] || String(c.ID_PROCESSO || ''),
      machine: (()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||String(id||'')})(),
      qty: num_(c.QTD_PROGRAMADA),
      minutes: round2_(num_(c.MINUTOS_PADRAO_TOTAL, num_(c.QTD_PROGRAMADA) * num_(c.TEMPO_PADRAO_SEG_UN) / 60)),
      allocatedOperatorId: String(c.ID_OPERADOR_ALOCADO || ''),
      noStd: num_(c.TEMPO_PADRAO_SEG_UN) <= 0,
    }));

  const out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
  return out;
}
// Code.gs:3042
function normalizeDateRange_(startRef, endRef) {
  let a=startRef,b=endRef;
  if(a && typeof a==='object' && !(a instanceof Date)){
    b=a.DATA_FINAL||a.dataFinal||a.END||a.end||'';
    a=a.DATA_INICIAL||a.dataInicial||a.START||a.start||'';
  }
  let start=normalizeDateKey_(a||todayKey_());
  let end=normalizeDateKey_(b||a||start);
  if(start>end){const t=start;start=end;end=t}
  return {start,end};
}
// Code.gs:3053
function dateKeysInRange_(startKey,endKey){
  const out=[],d=dateFromKey_(startKey),end=dateFromKey_(endKey);
  while(d.getTime()<=end.getTime()){
    out.push(Utilities.formatDate(d,CFG.TZ,'yyyy-MM-dd'));
    d.setDate(d.getDate()+1);
    if(out.length>3700)throw new Error('Período muito longo para esta consulta.');
  }
  return out;
}
// Code.gs:3063
function productionPointMethod_(a) {
  const tipo=String(a.TIPO_APONTAMENTO||'').toUpperCase();
  const origem=String(a.ORIGEM_BIPAGEM||'').toUpperCase();
  if(tipo==='MARCACAO'||origem.indexOf('MARCACAO')>=0)return 'MARCACAO';
  if(tipo==='APONTAMENTO'||origem.indexOf('APONTAMENTO')>=0)return 'APONTAMENTO';
  if(tipo==='CUPOM'||tipo==='PRODUCAO'||origem.indexOf('QR')>=0)return 'CUPOM';
  return tipo||'CUPOM';
}
// Code.gs:3072
function getInternalProductionPerformanceImpl_(dataRef, dataFim) {
  const range=normalizeDateRange_(dataRef,dataFim),dataInicial=range.start,dataFinal=range.end;
  const operadoresAtivos=active_(readTable_(TAB.OPERADORES),'ATIVO');
  const jornadas=readTable_(TAB.JORNADA).filter(j=>{const dk=dateKey_(j.DATA);return dk>=dataInicial&&dk<=dataFinal});
  const apont=readTable_(TAB.APONTAMENTOS).filter(a=>{
    const dk=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA);
    return dk>=dataInicial&&dk<=dataFinal&&String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO';
  });
  const operadores=mapBy_(readTable_(TAB.OPERADORES),'ID_OPERADOR');
  const processos=mapBy_(readTable_(TAB.PROCESSOS),'ID_PROCESSO');
  const volumes=mapBy_(readTable_(TAB.VOLUMES),'ID_VOLUME');
  const estoque=mapBy_(readTable_(TAB.ESTOQUE_CORTE),'ID_ESTOQUE_CORTE');
  const maps=buildMaps_();
  const rows=apont.map(a=>{
    const v=volumes[String(a.ID_VOLUME)]||{};
    const est=estoque[String(v.ID_ESTOQUE_CORTE||'')]||{};
    const metodo=productionPointMethod_(a);
    const minPadrao=round2_(num_(a.MINUTOS_ENTREGUES,num_(a.SEGUNDOS_ENTREGUES)/60));
    const minRealRaw=num_(a.MINUTOS_REAIS,num_(a.SEGUNDOS_REAIS)/60);
    const minReal=minRealRaw>0?round2_(minRealRaw):'';
    const eficiencia=a.EFICIENCIA_EXECUCAO_PCT!==''&&a.EFICIENCIA_EXECUCAO_PCT!=null
      ?round2_(num_(a.EFICIENCIA_EXECUCAO_PCT))
      :(minRealRaw>0?round2_(minPadrao/minRealRaw*100):'');
    const lote=String(est.LOTE_CORTE||'');
    const sub=String(v.SUBLOTE||est.SUBLOTE||'');
    return {
      ID_APONTAMENTO:a.ID_APONTAMENTO||'',ID_CUPOM:a.ID_CUPOM||'',DATA_HORA:a.DATA_HORA||a.DATA_HORA_FIM||'',DATA_PRODUCAO:a.DATA_PRODUCAO||'',
      ID_OPERADOR:a.ID_OPERADOR||'',OPERADOR:(operadores[String(a.ID_OPERADOR)]||{}).NOME||a.ID_OPERADOR||'',
      ID_PROCESSO:a.ID_PROCESSO||'',PROCESSO:(processos[String(a.ID_PROCESSO)]||{}).PROCESSO||maps.processos[a.ID_PROCESSO]||a.ID_PROCESSO||'',
      ID_PRODUTO:a.ID_PRODUTO||est.ID_PRODUTO||'',PRODUTO:maps.produtos[a.ID_PRODUTO||est.ID_PRODUTO]||'',
      COR:maps.cores[a.ID_COR||est.ID_COR]||'',TAMANHO:maps.tamanhos[a.ID_TAMANHO||est.ID_TAMANHO]||'',
      ID_VOLUME:a.ID_VOLUME||'',COD_VOLUME:v.COD_VOLUME||'',COD_VOLUME_EXIBICAO:volumeOperationalCode_(v,sub),
      LOTE_CORTE:lote,SUBLOTE:sub,QTD_APONTADA:num_(a.QTD_APONTADA),MINUTOS_PADRAO:minPadrao,
      MINUTOS_REAIS:minReal,EFICIENCIA_PCT:eficiencia,TIPO_APONTAMENTO:metodo,
      DATA_HORA_INICIO:a.DATA_HORA_INICIO||'',DATA_HORA_FIM:a.DATA_HORA_FIM||a.DATA_HORA||''
    };
  }).sort((a,b)=>dateMs_(b.DATA_HORA_FIM||b.DATA_HORA)-dateMs_(a.DATA_HORA_FIM||a.DATA_HORA));
  return {
    ok:true,data:dataFinal,dataInicial,dataFinal,days:dateKeysInRange_(dataInicial,dataFinal).length,
    defaultMinutesDay:CFG.DEFAULT_MINUTES_DAY,
    operadores:serialize_(operadoresAtivos.map(op=>({ID_OPERADOR:op.ID_OPERADOR,NOME:op.NOME||op.ID_OPERADOR||'',ID_SETOR_PADRAO:op.ID_SETOR_PADRAO||'',MINUTOS_PADRAO_DIA:num_(op.MINUTOS_PADRAO_DIA,CFG.DEFAULT_MINUTES_DAY)}))),
    jornadas:serialize_(jornadas.map(j=>({ID_JORNADA:j.ID_JORNADA||'',DATA:dateKey_(j.DATA),ID_OPERADOR:j.ID_OPERADOR||'',MINUTOS_PREVISTOS:num_(j.MINUTOS_PREVISTOS),MINUTOS_DISPONIVEIS:num_(j.MINUTOS_DISPONIVEIS),MOTIVO_AJUSTE:j.MOTIVO_AJUSTE||'',ATUALIZADO_EM:j.ATUALIZADO_EM||''}))),
    rows:serialize_(rows)
  };
}
// Code.gs:3125
function roteiroDoCupom_(c, roteiros) {
  roteiros = roteiros || readTable_(TAB.ROTEIRO);
  return roteiros.find(r => String(r.ID_ROTEIRO) === String(c.ID_ROTEIRO || '')) ||
    roteiros.find(r => String(r.ID_PRODUTO) === String(c.ID_PRODUTO) && String(r.ID_PROCESSO) === String(c.ID_PROCESSO) && num_(r.ORDEM_PROCESSO) === num_(c.ORDEM_PROCESSO)) || null;
}
// Code.gs:3130
function execucoesMarcacaoRoteiro_(rot, cupons) {
  return cupons.filter(c => String(c.STATUS_CUPOM || '').toUpperCase() === 'CONCLUIDO' && metodoConclusaoCupom_(c) === 'MARCACAO' &&
    (String(c.ID_ROTEIRO || '') === String(rot.ID_ROTEIRO) || (!c.ID_ROTEIRO && String(c.ID_PRODUTO) === String(rot.ID_PRODUTO) && String(c.ID_PROCESSO) === String(rot.ID_PROCESSO))))
    .map(c => { const ini = dateMs_(c.DATA_HORA_INICIO_MARCACAO), fim = dateMs_(c.DATA_HORA_FIM_MARCACAO), q = num_(c.QTD_PROGRAMADA); return (ini && fim > ini && q > 0) ? { c, seg: (fim - ini) / 1000, q } : null; })
    .filter(Boolean);
}
// Code.gs:3136
function previewTempoPadraoMarcacaoImpl_(payload) {
  payload = payload || {};
  const cupons = readTable_(TAB.CUPONS), c = cupons.find(x => String(x.ID_CUPOM) === String(payload.ID_CUPOM || ''));
  if (!c) throw new Error('Operação não encontrada.');
  const rot = roteiroDoCupom_(c); if (!rot) throw new Error('Roteiro desta operação não encontrado.');
  const ex = execucoesMarcacaoRoteiro_(rot, cupons), esta = ex.find(e => String(e.c.ID_CUPOM) === String(c.ID_CUPOM));
  if (!esta) throw new Error('Esta operação não tem uma marcação concluída com início e fim.');
  const totSeg = ex.reduce((t, e) => t + e.seg, 0), totQ = ex.reduce((t, e) => t + e.q, 0), maps = buildMaps_();
  const pend = cupons.filter(x => String(x.ID_ROTEIRO || '') === String(rot.ID_ROTEIRO) && !['CONCLUIDO','CANCELADO','ESTORNADO'].includes(String(x.STATUS_CUPOM || '').toUpperCase())).length;
  const retro = ex.filter(e => num_(e.c.TEMPO_PADRAO_SEG_UN) <= 0).length;
  return { ok: true, ID_ROTEIRO: rot.ID_ROTEIRO, PRODUTO: maps.produtos[rot.ID_PRODUTO] || '', PROCESSO: maps.processos[rot.ID_PROCESSO] || '',
    atualSegUn: num_(rot.TEMPO_PADRAO_SEG_UN), estaSegUn: round2_(esta.seg / esta.q), mediaSegUn: round2_(totSeg / totQ), nMarcacoes: ex.length, pecasMedidas: totQ, pendentes: pend, retroativos: retro };
}
// Code.gs:3264
const PARAM_TAB = 'APP_PARAMETROS', PARAM_HEADERS = ['CHAVE', 'VALOR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'];
// Code.gs:3265
const PARAM_KEYS = { LINK_APP_CAMPO: 'str', CUSTO_MINUTO: 'num', CALC_CUSTO_MENSAL: 'num', CALC_OPERADORES: 'num', CALC_MIN_DIA: 'num', CALC_DIAS_MES: 'num', CALC_EFICIENCIA_PCT: 'num' };
// Code.gs:3266
function getParametros_() {
  const out = { LINK_APP_CAMPO: '', CUSTO_MINUTO: 0, CALC_CUSTO_MENSAL: 0, CALC_OPERADORES: 0, CALC_MIN_DIA: 0, CALC_DIAS_MES: 0, CALC_EFICIENCIA_PCT: 0 };
  try {
    if (!tableExists_(PARAM_TAB)) return out;
    readTable_(PARAM_TAB).forEach(r => {
      const k = String(r.CHAVE || '').trim();
      if (PARAM_KEYS[k]) out[k] = PARAM_KEYS[k] === 'num' ? num_(r.VALOR) : String(r.VALOR || '');
    });
  } catch (e) {}
  return out;
}
// Code.gs:3277
function tableExists_(name) {
  if (SUPA_ON_()) return supaTableExists_(name);
  try { return !!ss_().getSheetByName(name); } catch (e) { return false; }
}
// Code.gs:3301
function custosMateriais_(materiais) {
  const media = {}, ultima = {};
  try {
    readTable_(TAB.ESTOQUE_SALDOS).forEach(s => {
      const q = num_(s.QTD_DISPONIVEL), c = num_(s.CUSTO_MEDIO_UNIT), id = String(s.ID_MATERIAL || '');
      if (!id || !(q > 0) || !(c > 0)) return;
      const a = media[id] || (media[id] = { q: 0, v: 0 }); a.q += q; a.v += q * c;
    });
    readTable_(TAB.ESTOQUE_LOTES).forEach(l => {
      const c = num_(l.CUSTO_UNITARIO), id = String(l.ID_MATERIAL || ''), t = dateMs_(l.DATA_ENTRADA || l.CRIADO_EM);
      if (!id || !(c > 0)) return;
      if (!ultima[id] || t >= ultima[id].t) ultima[id] = { c, t };
    });
  } catch (e) {}
  return materiais.map(m => {
    const id = String(m.ID_MATERIAL), med = media[id] && media[id].q > 0 ? round6_(media[id].v / media[id].q) : 0, ult = ultima[id] ? round6_(ultima[id].c) : 0;
    const auto = med || ult, fonte = med ? 'ESTOQUE' : ult ? 'ULTIMA_COMPRA' : '';
    return Object.assign({}, m, { CUSTO_MEDIO_ESTOQUE: med, CUSTO_ULTIMA_COMPRA: ult, CUSTO_AUTO: auto, CUSTO_AUTO_FONTE: fonte });
  });
}
// Code.gs:3523
function metodoConclusaoCupom_(c) {
  const m=String(c.METODO_CONCLUSAO||'').toUpperCase();
  if(m)return m;
  if(String(c.STATUS_CUPOM||'').toUpperCase()!=='CONCLUIDO')return '';
  return (c.DATA_HORA_INICIO_MARCACAO&&c.DATA_HORA_FIM_MARCACAO)?'MARCACAO':'CUPOM';
}
// Code.gs:3783
function getDashboardImpl_(dataRef, dataFim) {
  const range=normalizeDateRange_(dataRef,dataFim),dataInicial=range.start,dataFinal=range.end,dayKeys=dateKeysInRange_(dataInicial,dataFinal);
  const operadores=active_(readTable_(TAB.OPERADORES), 'ATIVO');
  const allJornadas=readTable_(TAB.JORNADA).filter(j=>{const dk=dateKey_(j.DATA);return dk>=dataInicial&&dk<=dataFinal});
  const apont=readTable_(TAB.APONTAMENTOS).filter(a=>{const dk=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA);return dk>=dataInicial&&dk<=dataFinal&&String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO'});
  const apontPorOperador=groupBy_(apont,'ID_OPERADOR'),jornadaByKey={};
  allJornadas.forEach(j=>jornadaByKey[dateKey_(j.DATA)+'|'+j.ID_OPERADOR]=j);
  const maps=buildMaps_();

  const porOperador=operadores.map(op=>{
    const a=apontPorOperador[String(op.ID_OPERADOR)]||[];
    const minutos=round2_(a.reduce((s,x)=>s+num_(x.MINUTOS_ENTREGUES),0));
    const qtdPecas=a.reduce((s,x)=>s+num_(x.QTD_APONTADA),0);
    let disponiveis=0,lastJ=null;
    dayKeys.forEach(k=>{const j=jornadaByKey[k+'|'+op.ID_OPERADOR];if(j){disponiveis+=num_(j.MINUTOS_DISPONIVEIS);lastJ=j}else disponiveis+=num_(op.MINUTOS_PADRAO_DIA,CFG.DEFAULT_MINUTES_DAY)});
    disponiveis=round2_(disponiveis);
    const eficiencia=disponiveis>0?round2_(minutos/disponiveis*100):0;
    return {
      ID_OPERADOR:op.ID_OPERADOR,NOME:op.NOME,SETOR:maps.setores[(lastJ&&lastJ.ID_SETOR)||op.ID_SETOR_PADRAO]||'',
      MINUTOS_DISPONIVEIS:disponiveis,MINUTOS_ENTREGUES:minutos,EFICIENCIA_PCT:eficiencia,QTD_CUPONS:a.length,QTD_PECAS:qtdPecas,
    };
  });

  const minutosEntregues=round2_(porOperador.reduce((s,x)=>s+x.MINUTOS_ENTREGUES,0));
  const minutosDisponiveis=round2_(porOperador.reduce((s,x)=>s+x.MINUTOS_DISPONIVEIS,0));
  const eficienciaGeral=minutosDisponiveis>0?round2_(minutosEntregues/minutosDisponiveis*100):0;
  const cortes=readTable_(TAB.PEDIDOS_CORTE).filter(c=>{const dk=dateKey_(c.DATA_CORTE||c.DATA_HORA);return dk>=dataInicial&&dk<=dataFinal});
  const estoque=readTable_(TAB.ESTOQUE_CORTE);
  const remessas=readTable_(TAB.REMESSAS).filter(r=>String(r.TIPO_DESTINO).toUpperCase()==='FACCAO');
  // v4.5.7: "Em facção" conta só sacos com envio confirmado; o restante é "aguardando envio".
  const remIds=new Set(remessas.map(r=>String(r.ID_REMESSA)));
  const retPorItem={};readTable_(TAB.RETORNOS_EXTERNOS).forEach(r=>{const k=String(r.ID_ITEM_REMESSA);retPorItem[k]=(retPorItem[k]||0)+num_(r.QTD_RETORNADA)});
  let faccaoPendente=0,faccaoAguardandoEnvio=0;
  readTable_(TAB.REMESSA_ITENS).forEach(i=>{if(!remIds.has(String(i.ID_REMESSA)))return;const saldo=Math.max(0,num_(i.QTD_ENVIADA)-(retPorItem[String(i.ID_ITEM_REMESSA)]||0));if(envioConfirmado_(i))faccaoPendente+=saldo;else faccaoAguardandoEnvio+=saldo});

  return {
    data:dataFinal,dataInicial,dataFinal,
    cards:{cortes:cortes.length,minutosEntregues,eficienciaGeral,cuponsBipados:apont.length,apontamentosConcluidos:apont.length,saldoCorte:estoque.reduce((s,e)=>s+num_(e.SALDO_DISPONIVEL),0),pecasEmFaccao:faccaoPendente,pecasAguardandoEnvioFaccao:faccaoAguardandoEnvio},
    operadores:porOperador.sort((a,b)=>b.EFICIENCIA_PCT-a.EFICIENCIA_PCT),
    trend:getEfficiencyTrend_(dataFinal,dayKeys.length),
  };
}
// Code.gs:4358
function envioConfirmado_(item) {
  return String((item && item.STATUS_BIPAGEM_ENVIO) || '').toUpperCase() === 'CONFIRMADO';
}
// Code.gs:4481
function precoDebitoQualidade_(item, idVolume) {
  const direto = num_(item && item.PRECO_FACCAO_UNIT);
  if (direto > 0) return direto;
  const lanc = readTable_(TAB.FINANCEIRO_FACCAO), itens = readTable_(TAB.REMESSA_ITENS);
  let vol = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume), guard = 0;
  while (vol && guard++ < 8) {
    const deb = lanc.find(l => String(l.ID_VOLUME) === String(vol.ID_VOLUME) && l.TIPO === 'DEBITO' && l.ORIGEM === 'RETRABALHO' && num_(l.VALOR_UNITARIO) > 0);
    if (deb) return num_(deb.VALOR_UNITARIO);
    const origemId = String(vol.ID_VOLUME_ORIGEM_RETRABALHO || '');
    if (!origemId) break;
    const it = itens.filter(i => String(i.ID_VOLUME) === origemId && num_(i.PRECO_FACCAO_UNIT) > 0).pop();
    if (it) return num_(it.PRECO_FACCAO_UNIT);
    vol = findById_(TAB.VOLUMES, 'ID_VOLUME', origemId);
  }
  return 0;
}

/** Processa (uma única vez) os retornos com inspeção concluída da remessa. */
// Code.gs:4577
function getFinanceiroFaccaoImpl_() {
  const destinos = readTable_(TAB.DESTINOS).filter(d => String(d.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
  const nome = Object.create(null); destinos.forEach(d => nome[String(d.ID_DESTINO)] = d.NOME_DESTINO || d.RESPONSAVEL || d.ID_DESTINO);
  const lanc = readTable_(TAB.FINANCEIRO_FACCAO);
  const pags = readTable_(TAB.PAGAMENTOS_FACCAO);
  const retById = mapBy_(readTable_(TAB.RETORNOS_EXTERNOS), 'ID_RETORNO');
  // Em facção: sacos com envio confirmado, ainda não devolvidos (valor previsto).
  const remessas = mapBy_(readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO'), 'ID_REMESSA');
  const retPorItem = Object.create(null); readTable_(TAB.RETORNOS_EXTERNOS).forEach(r => { const k = String(r.ID_ITEM_REMESSA); retPorItem[k] = (retPorItem[k] || 0) + num_(r.QTD_RETORNADA); });
  const resumo = Object.create(null);
  const get = id => resumo[id] || (resumo[id] = { ID_DESTINO: id, FACCAO: nome[id] || id, EM_FACCAO_QTD: 0, EM_FACCAO_VALOR: 0, A_PAGAR: 0, DEBITOS: 0, LIQUIDO: 0, PAGO_TOTAL: 0, ULTIMO_PAGAMENTO: '' });
  destinos.forEach(d => get(String(d.ID_DESTINO)));
  readTable_(TAB.REMESSA_ITENS).forEach(i => {
    const r = remessas[String(i.ID_REMESSA)]; if (!r || !envioConfirmado_(i)) return;
    const saldo = Math.max(0, num_(i.QTD_ENVIADA) - (retPorItem[String(i.ID_ITEM_REMESSA)] || 0)); if (saldo <= 0) return;
    const g = get(String(r.ID_DESTINO)); g.EM_FACCAO_QTD += saldo; g.EM_FACCAO_VALOR = round2_(g.EM_FACCAO_VALOR + saldo * num_(i.PRECO_FACCAO_UNIT));
  });
  lanc.forEach(l => {
    if (String(l.STATUS || '').toUpperCase() !== 'ABERTO') return;
    const g = get(String(l.ID_DESTINO));
    if (l.TIPO === 'A_PAGAR') g.A_PAGAR = round2_(g.A_PAGAR + num_(l.VALOR)); else if (l.TIPO === 'DEBITO') g.DEBITOS = round2_(g.DEBITOS + num_(l.VALOR));
  });
  pags.forEach(p => { const g = get(String(p.ID_DESTINO)); g.PAGO_TOTAL = round2_(g.PAGO_TOTAL + num_(p.VALOR_PAGO)); if (dateMs_(p.DATA_PAGAMENTO) > dateMs_(g.ULTIMO_PAGAMENTO)) g.ULTIMO_PAGAMENTO = p.DATA_PAGAMENTO; });
  Object.values(resumo).forEach(g => g.LIQUIDO = round2_(g.A_PAGAR - g.DEBITOS));
  return {
    ok: true,
    faccoes: serialize_(Object.values(resumo).sort((a, b) => (b.A_PAGAR + b.DEBITOS + b.EM_FACCAO_VALOR) - (a.A_PAGAR + a.DEBITOS + a.EM_FACCAO_VALOR) || String(a.FACCAO).localeCompare(String(b.FACCAO), 'pt-BR'))),
    lancamentos: serialize_(lanc.slice().sort((a, b) => dateMs_(b.DATA_HORA) - dateMs_(a.DATA_HORA)).map(l => ({ ...l, FACCAO: nome[String(l.ID_DESTINO)] || l.ID_DESTINO,
      INSPECIONADO: l.TIPO === 'A_PAGAR' && l.ID_RETORNO ? String((retById[String(l.ID_RETORNO)] || {}).STATUS_INSPECAO || '').toUpperCase() === 'CONCLUIDA' : '' }))),
    pagamentos: serialize_(pags.slice().sort((a, b) => dateMs_(b.DATA_PAGAMENTO || b.CRIADO_EM) - dateMs_(a.DATA_PAGAMENTO || a.CRIADO_EM)).map(p => ({ ...p, FACCAO: nome[String(p.ID_DESTINO)] || p.ID_DESTINO }))),
  };
}
// Code.gs:4695
function getRemessasExternasImpl_() {
  ensureExternalSchema_();
  const remessas = readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
  const items = readTable_(TAB.REMESSA_ITENS);
  const retornos = readTable_(TAB.RETORNOS_EXTERNOS);
  const retornoVolumeItens = readTable_(TAB.RETORNO_VOLUME_ITENS);
  const volumes = readTable_(TAB.VOLUMES);
  const estoque = readTable_(TAB.ESTOQUE_CORTE);
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const volumeById = mapBy_(volumes, 'ID_VOLUME');
  const estoqueById = mapBy_(estoque, 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const itemsByRemessa=groupBy_(items,'ID_REMESSA'),returnsByItem=groupBy_(retornos,'ID_ITEM_REMESSA'),contentByVolume=groupBy_(volumeItens,'ID_VOLUME');
  const returnedByContent={};retornoVolumeItens.forEach(ri=>returnedByContent[ri.ID_VOLUME_ITEM]=(returnedByContent[ri.ID_VOLUME_ITEM]||0)+num_(ri.QTD_RETORNADA));
  // v4.6.2: situação de pagamento por retorno/saco/remessa (para sinalizar "pago" nos cards).
  const finRows = readTable_(TAB.FINANCEIRO_FACCAO);
  const pagNum = Object.create(null); readTable_(TAB.PAGAMENTOS_FACCAO).forEach(p => pagNum[String(p.ID_PAGAMENTO)] = p.NUM_PAGAMENTO);
  const finByRetorno = Object.create(null), finByRemessa = Object.create(null);
  finRows.forEach(l => {
    const st = String(l.STATUS || '').toUpperCase(); if (st === 'CANCELADO') return;
    const rem = finByRemessa[String(l.ID_REMESSA)] || (finByRemessa[String(l.ID_REMESSA)] = { FIN_PAGO: 0, FIN_A_PAGAR: 0, FIN_DEBITO_ABERTO: 0, FIN_DEBITO_DESCONTADO: 0, FIN_PAGAMENTOS: [] });
    const v = num_(l.VALOR), num = l.ID_PAGAMENTO ? (pagNum[String(l.ID_PAGAMENTO)] || '') : '';
    if (l.TIPO === 'A_PAGAR') {
      if (st === 'PAGO') rem.FIN_PAGO = round2_(rem.FIN_PAGO + v); else rem.FIN_A_PAGAR = round2_(rem.FIN_A_PAGAR + v);
      if (l.ID_RETORNO) finByRetorno[String(l.ID_RETORNO)] = { FIN_STATUS: st === 'PAGO' ? 'PAGO' : 'A_PAGAR', FIN_VALOR: v, FIN_PAGAMENTO: num };
    } else if (l.TIPO === 'DEBITO') {
      if (st === 'DESCONTADO') rem.FIN_DEBITO_DESCONTADO = round2_(rem.FIN_DEBITO_DESCONTADO + v); else rem.FIN_DEBITO_ABERTO = round2_(rem.FIN_DEBITO_ABERTO + v);
    }
    if (num && rem.FIN_PAGAMENTOS.indexOf(num) < 0) rem.FIN_PAGAMENTOS.push(num);
  });
  const avisosCampo = avisosCampoMap_();
  return remessas
    .sort((a, b) => dateMs_(b.ATUALIZADO_EM || b.DATA_ENVIO || b.DATA_HORA) - dateMs_(a.ATUALIZADO_EM || a.DATA_ENVIO || a.DATA_HORA))
    .map(r => {
      const remessaItens = (itemsByRemessa[r.ID_REMESSA]||[]).map(i => {
        const volume = volumeById[i.ID_VOLUME] || {};
        const est = estoqueById[volume.ID_ESTOQUE_CORTE] || {};
        let conteudos = (contentByVolume[String(i.ID_VOLUME)]||[]).map(vi => {
          const qtdRetornadaItem = (returnedByContent[vi.ID_VOLUME_ITEM]||0);
          return ({
            ...serialize_(vi),
            PRODUTO: maps.produtos[vi.ID_PRODUTO] || vi.ID_PRODUTO || '',
            COR: maps.cores[vi.ID_COR] || vi.ID_COR || '',
            TAMANHO: maps.tamanhos[vi.ID_TAMANHO] || vi.ID_TAMANHO || '',
            QTD_ITEM: num_(vi.QTD_ITEM),
            QTD_RETORNADA_ITEM: qtdRetornadaItem,
            SALDO_RETORNO_ITEM: Math.max(0, num_(vi.QTD_ITEM)-qtdRetornadaItem),
            PRECO_FACCAO_UNIT: num_(i.PRECO_FACCAO_UNIT) > 0 ? num_(i.PRECO_FACCAO_UNIT) : num_(vi.PRECO_FACCAO_UNIT),
            VALOR_TOTAL_ITEM: round2_((num_(i.PRECO_FACCAO_UNIT) > 0 ? num_(i.PRECO_FACCAO_UNIT) * num_(vi.QTD_ITEM) : num_(vi.VALOR_TOTAL_ITEM))),
          });
        });
        // Compatibilidade com volumes antigos, que guardavam o sublote diretamente no VOLUMES.
        if (!conteudos.length && (volume.ID_ESTOQUE_CORTE || est.ID_ESTOQUE_CORTE)) {
          conteudos = [{
            ID_VOLUME_ITEM: '', ID_VOLUME: i.ID_VOLUME, ID_ESTOQUE_CORTE: volume.ID_ESTOQUE_CORTE || est.ID_ESTOQUE_CORTE, ID_PRODUTO: est.ID_PRODUTO || '',
            SUBLOTE: volume.SUBLOTE || est.SUBLOTE || '',
            PRODUTO: maps.produtos[est.ID_PRODUTO] || est.ID_PRODUTO || '',
            COR: maps.cores[est.ID_COR] || est.ID_COR || '',
            TAMANHO: maps.tamanhos[est.ID_TAMANHO] || est.ID_TAMANHO || '',
            QTD_ITEM: num_(i.QTD_ENVIADA), QTD_RETORNADA_ITEM:num_(i.QTD_RETORNADA), SALDO_RETORNO_ITEM:Math.max(0,num_(i.QTD_ENVIADA)-num_(i.QTD_RETORNADA)), PRECO_FACCAO_UNIT: num_(i.PRECO_FACCAO_UNIT), VALOR_TOTAL_ITEM: round2_(num_(i.VALOR_TOTAL_ITEM)),
          }];
        }
        const rs = (returnsByItem[i.ID_ITEM_REMESSA]||[]);
        const resumoProdutos = [...new Set(conteudos.map(c => c.PRODUTO).filter(Boolean))].join(' + ');
        const resumoVariacoes = conteudos.map(c => [c.COR,c.TAMANHO].filter(Boolean).join('/')).filter(Boolean).join(' + ');
        return {
          ...serialize_(i),
          VOLUME_SEQ: num_(volume.VOLUME_SEQ || volume.SEQ_SEPARACAO),
          COD_VOLUME_EXIBICAO: volumeOperationalCode_(volume, conteudos.length === 1 ? conteudos[0].SUBLOTE : volume.SUBLOTE),
          VOLUME_EXIBICAO: volumeOperationalCode_(volume, conteudos.length === 1 ? conteudos[0].SUBLOTE : volume.SUBLOTE),
          SUBLOTE: conteudos.length === 1 ? conteudos[0].SUBLOTE : (volume.SUBLOTE || 'MULTILOTE'),
          LOTE_CORTE: est.LOTE_CORTE || '',
          PRODUTO: resumoProdutos || (maps.produtos[est.ID_PRODUTO] || est.ID_PRODUTO || ''),
          COR: conteudos.length === 1 ? conteudos[0].COR : '',
          TAMANHO: conteudos.length === 1 ? conteudos[0].TAMANHO : '',
          RESUMO_VARIACOES: resumoVariacoes,
          CONTEUDOS: conteudos,
          PRECO_FACCAO_UNIT: num_(i.PRECO_FACCAO_UNIT),
          VALOR_TOTAL_ITEM: round2_(num_(i.VALOR_TOTAL_ITEM)),
          BIP_ENVIO_CONFIRMADO: String(i.STATUS_BIPAGEM_ENVIO || '').toUpperCase() === 'CONFIRMADO',
          BIP_RECEBIMENTO_CONFIRMADO: String(i.STATUS_BIPAGEM_RECEBIMENTO || '').toUpperCase() === 'CONFIRMADO',
          STATUS_VOLUME_ATUAL: volume.STATUS_VOLUME || '',
          TIPO_LOCAL_ATUAL: volume.TIPO_LOCAL_ATUAL || '',
          QTD_APROVADA: rs.reduce((s, x) => s + num_(x.QTD_APROVADA), 0),
          QTD_REPROVADA: rs.reduce((s, x) => s + num_(x.QTD_REPROVADA), 0),
          QTD_RETRABALHO: rs.reduce((s, x) => s + num_(x.QTD_RETRABALHO), 0),
          QTD_EMBALADA: rs.reduce((s, x) => s + num_(x.QTD_EMBALADA), 0),
          retornos: rs.map(x => ({ ...serialize_(x), ...(finByRetorno[String(x.ID_RETORNO)] || {}) })),
          PRECO_DEBITO_REF: num_(i.PRECO_FACCAO_UNIT) > 0 || !String(volume.ID_VOLUME_ORIGEM_RETRABALHO || '') ? num_(i.PRECO_FACCAO_UNIT) : precoDebitoQualidade_(i, i.ID_VOLUME),
          FIN_PAGO_ITEM: round2_(rs.reduce((t, x) => { const f = finByRetorno[String(x.ID_RETORNO)]; return t + (f && f.FIN_STATUS === 'PAGO' ? f.FIN_VALOR : 0); }, 0)),
          FIN_A_PAGAR_ITEM: round2_(rs.reduce((t, x) => { const f = finByRetorno[String(x.ID_RETORNO)]; return t + (f && f.FIN_STATUS === 'A_PAGAR' ? f.FIN_VALOR : 0); }, 0)),
          CAMPO_STATUS: campoStatusVolume_(avisosCampo[String(r.ID_REMESSA)], i.ID_VOLUME),
        };
      });
      const allReturns = remessaItens.flatMap(i => i.retornos || []);
      const aprovadas = allReturns.reduce((s, x) => s + num_(x.QTD_APROVADA), 0);
      const embaladas = allReturns.reduce((s, x) => s + num_(x.QTD_EMBALADA), 0);
      const valorTotalRemessa = round2_(remessaItens.reduce((s, i) => s + num_(i.VALOR_TOTAL_ITEM), 0));
      const bipEnvio = remessaItens.filter(i => i.BIP_ENVIO_CONFIRMADO).length;
      const bipRecebimento = remessaItens.filter(i => i.BIP_RECEBIMENTO_CONFIRMADO).length;
      const statusEmbalagem = aprovadas <= 0 ? 'PENDENTE' : (embaladas >= aprovadas ? 'CONCLUIDA' : (embaladas > 0 ? 'PARCIAL' : 'PENDENTE'));
      return {
        ...serialize_(r),
        CAMPO: campoResumoRemessa_(avisosCampo[String(r.ID_REMESSA)], (itemsByRemessa[r.ID_REMESSA] || [])),
        DESTINO: maps.destinos[r.ID_DESTINO] || r.ID_DESTINO,
        PROCESSO: maps.processos[r.ID_PROCESSO] || r.ID_PROCESSO,
        QTD_EMBALADA: embaladas,
        VALOR_TOTAL_REMESSA: valorTotalRemessa,
        QTD_BIP_ENVIO: bipEnvio,
        QTD_BIP_RECEBIMENTO: bipRecebimento,
        STATUS_EMBALAGEM: statusEmbalagem,
        ...(finByRemessa[String(r.ID_REMESSA)] || { FIN_PAGO: 0, FIN_A_PAGAR: 0, FIN_DEBITO_ABERTO: 0, FIN_DEBITO_DESCONTADO: 0, FIN_PAGAMENTOS: [] }),
        itens: remessaItens,
      };
    });
}
// Code.gs:4812
function getRemessasInternasImpl_() {
  ensureExternalSchema_();
  const remessas = readTable_(TAB.REMESSAS).filter(r => ['INTERNO','PRODUCAO_INTERNA'].includes(String(r.TIPO_DESTINO || '').toUpperCase()));
  const items = readTable_(TAB.REMESSA_ITENS);
  const volumes = readTable_(TAB.VOLUMES);
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const volumeById = mapBy_(volumes, 'ID_VOLUME');
  const contentByVolume = groupBy_(volumeItens, 'ID_VOLUME');
  const itemsByRemessa = groupBy_(items, 'ID_REMESSA');
  return remessas
    .sort((a,b)=>dateMs_(b.ATUALIZADO_EM||b.DATA_ENVIO||b.DATA_HORA)-dateMs_(a.ATUALIZADO_EM||a.DATA_ENVIO||a.DATA_HORA))
    .map(r=>{
      const ri=(itemsByRemessa[String(r.ID_REMESSA)]||[]).map(i=>{
        const v=volumeById[String(i.ID_VOLUME)]||{};
        const est=estoque[v.ID_ESTOQUE_CORTE]||{};
        const cs=contentByVolume[String(i.ID_VOLUME)]||[];
        const produtos=[...new Set((cs.length?cs.map(c=>c.ID_PRODUTO):[est.ID_PRODUTO]).filter(Boolean).map(id=>maps.produtos[id]||id))];
        const cores=[...new Set((cs.length?cs.map(c=>c.ID_COR):[est.ID_COR]).filter(Boolean).map(id=>maps.cores[id]||id))];
        const tamanhos=[...new Set((cs.length?cs.map(c=>c.ID_TAMANHO):[est.ID_TAMANHO]).filter(Boolean).map(id=>maps.tamanhos[id]||id))];
        return {
          ...serialize_(i),
          COD_VOLUME:v.COD_VOLUME||i.COD_VOLUME||'',
          COD_VOLUME_EXIBICAO:volumeOperationalCode_(v, v.SUBLOTE||est.SUBLOTE),
          VOLUME_SEQ:num_(v.VOLUME_SEQ||v.SEQ_SEPARACAO),
          LOTE_CORTE:est.LOTE_CORTE||'',SUBLOTE:v.SUBLOTE||est.SUBLOTE||'',
          PRODUTO:produtos.join(' + '),COR:cores.length===1?cores[0]:(cores.length?'MÚLTIPLAS':''),TAMANHO:tamanhos.length===1?tamanhos[0]:(tamanhos.length?'MÚLTIPLOS':''),
          QTD_VOLUME:num_(v.QTD_VOLUME||i.QTD_ENVIADA),STATUS_VOLUME_ATUAL:v.STATUS_VOLUME||'',TIPO_LOCAL_ATUAL:v.TIPO_LOCAL_ATUAL||''
        };
      });
      const concluidos=ri.filter(i=>String(i.STATUS_VOLUME_ATUAL||'').toUpperCase()==='EM_ESTOQUE_PA').length;
      const statusCalculado=ri.length&&concluidos===ri.length?'CONCLUIDA':'EM_PRODUCAO';
      return {...serialize_(r),DESTINO:'Produção interna',STATUS_CALCULADO:statusCalculado,itens:ri};
    });
}
// Code.gs:4906
function getExternalScanCatalogImpl_(idRemessa, tipo) {
  ensureExternalSchema_();
  tipo = String(tipo || 'ENVIO').toUpperCase();
  if (!['ENVIO','RECEBIMENTO'].includes(tipo)) throw new Error('Tipo de conferência externa inválido.');

  // v4.3.6: idRemessa é opcional. O QR de volume resolve automaticamente
  // volume -> item de remessa -> remessa/facção. Mantemos o parâmetro para
  // compatibilidade com chamadas antigas e atalhos do Kanban.
  const todasRemessas = readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
  let remessas = todasRemessas;
  if (String(idRemessa || '').trim()) {
    const remessa = todasRemessas.find(r => String(r.ID_REMESSA) === String(idRemessa));
    if (!remessa) throw new Error('Remessa externa não encontrada.');
    remessas = [remessa];
  }
  const remessaById = mapBy_(remessas, 'ID_REMESSA');
  const remessaIds = new Set(remessas.map(r => String(r.ID_REMESSA)));
  const items = readTable_(TAB.REMESSA_ITENS).filter(i => remessaIds.has(String(i.ID_REMESSA)));
  const itemIds = new Set(items.map(i => String(i.ID_ITEM_REMESSA)));
  const retornosByItem = groupBy_(readTable_(TAB.RETORNOS_EXTERNOS).filter(r => itemIds.has(String(r.ID_ITEM_REMESSA))), 'ID_ITEM_REMESSA');
  const volumes = mapBy_(readTable_(TAB.VOLUMES), 'ID_VOLUME');
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const conteudosByVolume = groupBy_(readTable_(TAB.VOLUME_ITENS), 'ID_VOLUME');
  const maps = buildMaps_();
  const out = [];

  items.forEach(i => {
    const remessa = remessaById[String(i.ID_REMESSA)];
    if (!remessa) return;
    const v = volumes[i.ID_VOLUME] || {};
    const e = estoque[v.ID_ESTOQUE_CORTE] || {};
    const conteudos = conteudosByVolume[String(i.ID_VOLUME)] || [];
    const retornos = retornosByItem[String(i.ID_ITEM_REMESSA)] || [];
    const returned = retornos.reduce((s,r)=>s+num_(r.QTD_RETORNADA),0);
    const saldo = Math.max(0, num_(i.QTD_ENVIADA) - returned);
    const enviadoConfirmado = String(i.STATUS_BIPAGEM_ENVIO || '').toUpperCase() === 'CONFIRMADO';
    const recebidoConfirmado = String(i.STATUS_BIPAGEM_RECEBIMENTO || '').toUpperCase() === 'CONFIRMADO';
    if (tipo === 'ENVIO' && enviadoConfirmado) return;
    if (tipo === 'RECEBIMENTO' && (saldo <= 0 || recebidoConfirmado || !enviadoConfirmado)) return;
    out.push({
      idRemessa: remessa.ID_REMESSA,
      numRemessa: remessa.NUM_REMESSA,
      idDestino: remessa.ID_DESTINO,
      destino: maps.destinos[remessa.ID_DESTINO] || remessa.ID_DESTINO || '',
      idItem: i.ID_ITEM_REMESSA,
      idVolume: i.ID_VOLUME,
      code: String(i.COD_VOLUME || v.COD_VOLUME || ''),
      displayCode: volumeOperationalCode_(v, v.SUBLOTE || e.SUBLOTE),
      product: conteudos.length ? [...new Set(conteudos.map(c => maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO).filter(Boolean))].join(' + ') : (maps.produtos[e.ID_PRODUTO] || e.ID_PRODUTO || ''),
      color: conteudos.length === 1 ? (maps.cores[conteudos[0].ID_COR] || conteudos[0].ID_COR || '') : '',
      size: conteudos.length === 1 ? (maps.tamanhos[conteudos[0].ID_TAMANHO] || conteudos[0].ID_TAMANHO || '') : '',
      contents: conteudos.map(c => ({ sublote:c.SUBLOTE, product:maps.produtos[c.ID_PRODUTO]||c.ID_PRODUTO||'', color:maps.cores[c.ID_COR]||c.ID_COR||'', size:maps.tamanhos[c.ID_TAMANHO]||c.ID_TAMANHO||'', qty:num_(c.QTD_ITEM) })),
      qty: tipo === 'RECEBIMENTO' ? saldo : num_(i.QTD_ENVIADA),
      unitPrice: num_(i.PRECO_FACCAO_UNIT),
      totalValue: num_(i.VALOR_TOTAL_ITEM),
    });
  });

  // v4.5.7: duplicado = o mesmo código apontando para sacos DIFERENTES.
  const codeOwners = {};
  out.forEach(i => { const k=String(i.code||'').trim(); if(k) (codeOwners[k] || (codeOwners[k] = new Set())).add(String(i.idVolume||i.idItem)); });
  const duplicateCodes = Object.keys(codeOwners).filter(k => codeOwners[k].size > 1);
  const remessaUnica = remessas.length === 1 ? remessas[0] : null;
  return {
    ok: true,
    tipo,
    automatico: !String(idRemessa || '').trim(),
    remessa: remessaUnica ? serialize_({
      ID_REMESSA: remessaUnica.ID_REMESSA,
      NUM_REMESSA: remessaUnica.NUM_REMESSA,
      ID_DESTINO: remessaUnica.ID_DESTINO,
      DESTINO: maps.destinos[remessaUnica.ID_DESTINO] || remessaUnica.ID_DESTINO,
    }) : null,
    count: out.length,
    duplicateCodes,
    items: out,
  };
}
// Code.gs:5301
function getEfficiencyTrend_(endDateKey, days) {
  const end=dateFromKey_(endDateKey),ops=active_(readTable_(TAB.OPERADORES),'ATIVO');
  const delivered={},available={};
  readTable_(TAB.APONTAMENTOS).forEach(a=>{
    if(String(a.STATUS||'VALIDO').toUpperCase()==='CANCELADO')return;
    const k=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA)+'|'+a.ID_OPERADOR;
    delivered[k]=(delivered[k]||0)+num_(a.MINUTOS_ENTREGUES);
  });
  readTable_(TAB.JORNADA).forEach(j=>available[dateKey_(j.DATA)+'|'+j.ID_OPERADOR]=num_(j.MINUTOS_DISPONIVEIS));
  const out=[];
  for(let i=days-1;i>=0;i--){const d=new Date(end.getTime());d.setDate(d.getDate()-i);
    const key=Utilities.formatDate(d,CFG.TZ,'yyyy-MM-dd');let produced=0,minutes=0;
    ops.forEach(op=>{const k=key+'|'+op.ID_OPERADOR;produced+=delivered[k]||0;
      minutes+=Object.prototype.hasOwnProperty.call(available,k)?available[k]:num_(op.MINUTOS_PADRAO_DIA,CFG.DEFAULT_MINUTES_DAY);});
    out.push({date:key,label:Utilities.formatDate(d,CFG.TZ,'dd/MM'),efficiency:minutes>0?round2_(produced/minutes*100):0,delivered:round2_(produced),available:round2_(minutes)});
  }return out;
}
// Code.gs:5616
function ss_() {
  if (!__SS_MEM) __SS_MEM = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  return __SS_MEM;
}
// Code.gs:5704
function buildMaps_() {
  if (__MAPS_MEM) return __MAPS_MEM;
  return (__MAPS_MEM = {
    produtos: labelMap_(TAB.PRODUTOS, 'ID_PRODUTO', r => [r.CODIGO_PRODUTO, r.PRODUTO].filter(Boolean).join(' - ')),
    cores: labelMap_(TAB.CORES, 'ID_COR', r => r.COR),
    tamanhos: labelMap_(TAB.TAMANHOS, 'ID_TAMANHO', r => r.TAMANHO),
    processos: labelMap_(TAB.PROCESSOS, 'ID_PROCESSO', r => r.PROCESSO),
    maquinas: labelMap_(TAB.MAQUINAS, 'ID_MAQUINA', r => r.MAQUINA),
    destinos: labelMap_(TAB.DESTINOS, 'ID_DESTINO', r => r.NOME_DESTINO),
    setores: labelMap_(TAB.SETORES, 'ID_SETOR', r => r.SETOR),
  });
}
// Code.gs:5717
function labelMap_(sheet, key, labelFn) {
  const out = {};
  readTable_(sheet).forEach(r => out[r[key]] = labelFn(r));
  return out;
}
// Code.gs:5723
function mapBy_(rows, key) {
  const out = {};
  rows.forEach(r => { if (r[key] !== '' && r[key] != null) out[r[key]] = r; });
  return out;
}
// Code.gs:5729
function active_(rows, field) {
  return rows.filter(r => r[field] === '' || r[field] == null || truthy_(r[field]));
}
// Code.gs:5733
function stripMeta_(rows) {
  return rows.map(serialize_);
}
// Code.gs:5737
function serialize_(value) {
  if (value == null) return value;
  if (value instanceof Date) return Utilities.formatDate(value, CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
  if (Array.isArray(value)) return value.map(serialize_);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => {
      if (k === '_row') return;
      out[k] = serialize_(value[k]);
    });
    return out;
  }
  return value;
}
// Code.gs:5757
function req_(v, label) {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error('Campo obrigatório: ' + label + '.');
  return String(v).trim();
}
// Code.gs:5762
function num_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback === undefined ? 0 : fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : (fallback || 0);
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

/**
 * v4.5.6: leitura numérica para texto vindo de CSV brasileiro.
 * num_ continua igual para não alterar valores já digitados nas telas.
 *   "1.000"    -> 1000      (ponto como separador de milhar)
 *   "12.500"   -> 12500
 *   "1.000,5"  -> 1000.5
 *   "0,350"    -> 0.35
 *   "0.350"    -> 0.35      (começa com zero: é decimal, não milhar)
 *   "1.5"      -> 1.5       (grupo com menos de 3 dígitos: é decimal)
 */
// Code.gs:5791
function truthy_(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['TRUE', 'VERDADEIRO', 'SIM', '1', 'ATIVO'].includes(String(v || '').trim().toUpperCase());
}
// Code.gs:5797
function normKey_(v) {
  return String(v == null ? '' : v)
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}
// Code.gs:5805
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
// Code.gs:5807
function round6_(n) { return Math.round((Number(n) + Number.EPSILON) * 1000000) / 1000000; }
// Code.gs:5808
function currentUser_() { if (typeof __WEB_USER !== 'undefined' && __WEB_USER) return __WEB_USER; try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }
// Code.gs:5845
function volumeOperationalCode_(volume, subloteFallback) {
  volume = volume || {};
  const raw = String(volume.COD_VOLUME || '').trim();
  const sub = String(volume.SUBLOTE || subloteFallback || '').trim();
  const legacy = raw.match(/^SEP-\d+-V(\d+)(\.\d+)?$/i);
  if (legacy && sub) {
    return sub + '-V' + String(Number(legacy[1]) || 1).padStart(2, '0') + (legacy[2] || '');
  }
  if (raw) return raw;
  const seq = num_(volume.SEQ_SEPARACAO || volume.VOLUME_SEQ);
  return sub && seq > 0 ? sub + '-V' + String(seq).padStart(2, '0') : (sub || '');
}
// Code.gs:5858
function parseDate_(v) {
  if (v instanceof Date) return v;
  const s = String(v || '').trim();
  if (!s) return new Date();
  const iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null;
  if (iso) {
    const parts = s.slice(0, 10).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0);
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error('Data inválida: ' + s);
  return d;
}
// Code.gs:5874
function todayKey_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
// Code.gs:5875
function dateFromKey_(key) {
  const p = normalizeDateKey_(key).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}
// Code.gs:5879
function normalizeDateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return Utilities.formatDate(parseDate_(s), CFG.TZ, 'yyyy-MM-dd');
}
// Code.gs:5885
function dateKey_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try { return Utilities.formatDate(parseDate_(s), CFG.TZ, 'yyyy-MM-dd'); } catch (e) { return ''; }
}
// Code.gs:5892
function dateMs_(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
// Code.gs:5928
const ENGINE = Object.freeze({
  VERSION: '4.13.0', SCHEMA: '4.6.0', CONTROL: 'APP_CONTROLE', OPS: 'APP_OPERACOES',
  CACHE_TTL: 120, CACHE_PART: 70000, CACHE_MAX_PARTS: 12,
  RESULT_PART: 40000, RESULT_PARTS: 16, MAX_COMMIT_BYTES: 1800000,
});
// Code.gs:5933
var __TX = null, __SHEET_MEM = {}, __INDEX_MEM = {}, __MAPS_MEM = null;
// Code.gs:5934
var __REVISION = '', __SCHEMA_READY = false, __FRESH = false;
// Code.gs:5935
var __METRICS = { reads: 0, cacheHits: 0, commits: 0 };
// Code.gs:5936
var __REQ = {}; // opções da requisição atual vindas do front (ex.: período do fluxo de estoque).
// Code.gs:5938
function resetRequestState_() {
  __SS_MEM = null; __TABLE_MEM = {}; __HEADER_MEM = {}; __SHEET_MEM = {};
  __INDEX_MEM = {}; __MAPS_MEM = null; __REVISION = ''; __SCHEMA_READY = false;
  __TX = null; __FRESH = false; __METRICS = { reads: 0, cacheHits: 0, commits: 0 }; __REQ = {};
  supaResetRequest_();
}
// Code.gs:5952
const DELTA_KEYS = ['estoque','volumes','remessas','remessasInternas','precosFaccao','cortesProgramados','estoqueMateriais','comprasRecentes','fluxoEstoque'];
// Code.gs:5953
function rowHash_(row) {
  // cyrb53: hash rápido em JS puro (sem Utilities.computeDigest por linha).
  const str = JSON.stringify(row);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Code.gs:5965
function finalizeResponse_(out, meta) {
  if (!out || typeof out !== 'object' || Array.isArray(out) || out.__error) return out;
  const known = (meta && meta.known && typeof meta.known === 'object') ? meta.known : null;
  DELTA_KEYS.forEach(k => {
    const list = out[k];
    if (!Array.isArray(list)) return;
    const hashes = list.map(rowHash_);
    const have = known && Array.isArray(known[k]) && known[k].length ? new Set(known[k].map(String)) : null;
    if (have) {
      const rows = {}; let enviados = 0;
      hashes.forEach((h, i) => { if (!have.has(h) && !Object.prototype.hasOwnProperty.call(rows, h)) { rows[h] = list[i]; enviados++; } });
      if (enviados < list.length) {
        (out.__delta || (out.__delta = {}))[k] = { order: hashes, rows: rows };
        delete out[k];
        return;
      }
    }
    (out.__rowHashes || (out.__rowHashes = {}))[k] = hashes;
  });
  return out;
}
// Code.gs:5986
function referenceTables_() {
  return [TAB.PRODUTOS,TAB.CORES,TAB.TAMANHOS,TAB.PROCESSOS,TAB.MAQUINAS,TAB.DESTINOS,
    TAB.SETORES,TAB.OPERADORES,TAB.ROTEIRO,TAB.MATERIAIS,TAB.FORNECEDORES,
    TAB.LOCAIS_ESTOQUE,TAB.ESTRUTURA_PRODUTO,TAB.PRECO_FACCAO];
}
// Code.gs:6041
function sh_(name) {
  if (!__SHEET_MEM[name]) __SHEET_MEM[name] = ss_().getSheetByName(name);
  if (!__SHEET_MEM[name]) throw new Error('Aba não encontrada: '+name);
  return __SHEET_MEM[name];
}
// Code.gs:6051
function readTable_(name, forceRefresh) {
  if (SUPA_ON_()) supaMarkUsed_(name);
  // Durante a transação nunca descartar alterações ainda não confirmadas.
  if ((!forceRefresh || __TX) && Object.prototype.hasOwnProperty.call(__TABLE_MEM,name)) return __TABLE_MEM[name];
  const useCache = !__TX && !forceRefresh && referenceTables_().includes(name);
  if (useCache) {
    const saved=cacheGet_('table:'+name);
    if(saved) { __HEADER_MEM[name]=saved.headers; if (SUPA_ON_()) { const m={}; saved.rows.forEach(r=>{m[r._row]=supaKeyOf_(name,r)}); __SUPA_ROWPK[name]=m; } return (__TABLE_MEM[name]=saved.rows); }
  }
  let rows, headers;
  if (SUPA_ON_()) { rows = supaLoad_(name); headers = __HEADER_MEM[name]; }
  else {
  const sheet=sh_(name), lastRow=sheet.getLastRow(), lastCol=sheet.getLastColumn();
  if(lastRow<1||lastCol<1) return (__TABLE_MEM[name]=[]);
  const values=sheet.getRange(1,1,lastRow,lastCol).getValues(); __METRICS.reads++;
  headers=values[0].map(v=>String(v||'').trim()); __HEADER_MEM[name]=headers;
  rows=values.slice(1).map((row,i)=>{
    const obj={_row:i+2}; headers.forEach((h,j)=>{if(h)obj[h]=row[j]}); return obj;
  }).filter(o=>Object.keys(o).some(k=>k!=='_row'&&o[k]!==''&&o[k]!==null));
  }
  if (__TX && __TX.tables[name]) {
    const staged=__TX.tables[name];
    rows.forEach((row,i)=>{if(staged.patches[row._row])rows[i]={...row,...staged.patches[row._row]}});
    staged.appends.forEach(row=>rows.push({...row}));
  }
  __TABLE_MEM[name]=rows;
  if(useCache) cachePut_('table:'+name,{headers,rows});
  return rows;
}
// Code.gs:6153
function findById_(name, field, id) {
  if(!__INDEX_MEM[name])__INDEX_MEM[name]={};
  if(!__INDEX_MEM[name][field]){
    const index=Object.create(null);readTable_(name).forEach(r=>index[String(r[field])]=r);
    __INDEX_MEM[name][field]=index;
  }
  return __INDEX_MEM[name][field][String(id)]||null;
}
// Code.gs:6246
function ensureRuntimeSchema_() {
  if(__SCHEMA_READY)return;
  if (SUPA_ON_()) {
    // Gravações não usam o cache de respostas: não precisam ler a revisão antes da trava.
    if (__SUPA_MUT) { __SCHEMA_READY=true; return; }
    const ctrl=readTable_(ENGINE.CONTROL)[0];
    if(!ctrl||String(ctrl.VERSAO_SCHEMA)!==ENGINE.SCHEMA)throw new Error('Execute instalarAtualizacao no editor do Apps Script antes de usar esta versão.');
    __REVISION=String(ctrl.REVISAO||'0');__SCHEMA_READY=true;return;
  }
  const ctrl=ss_().getSheetByName(ENGINE.CONTROL);
  if(!ctrl||String(ctrl.getRange(2,1).getValue())!==ENGINE.SCHEMA)throw new Error('Execute instalarAtualizacao no editor do Apps Script antes de usar esta versão.');
  __REVISION=String(ctrl.getRange(2,2).getValue()||'0');__SCHEMA_READY=true;
}
// Code.gs:6308
function getBootstrapDataImpl_(dataRef) {
  return {ok:true,appName:CFG.APP_NAME,version:ENGINE.VERSION,today:todayKey_(),userEmail:currentUser_(),cadastros:getCadastrosImpl_(),dashboard:getDashboardImpl_(dataRef||todayKey_())};
}
// Code.gs:6311
function getOperationalDataImpl_() {
  return {ok:true,estoque:getEstoqueCorteImpl_(),volumes:getVolumesImpl_(),remessas:getRemessasExternasImpl_(),precosFaccao:getPrecosFaccaoImpl_(),cortesProgramados:getCortesProgramadosImpl_(),estoqueMateriais:getEstoqueMateriaisImpl_(),comprasRecentes:getComprasRecentesImpl_(),fluxoEstoque:getFluxoEstoqueImpl_()};
}
// Code.gs:6375
function ensureExternalSchema_(){ensureRuntimeSchema_();}
// Code.gs:6376
function ensureInventorySchema_(){ensureRuntimeSchema_();}
// Code.gs:6377
function groupBy_(rows, field) {
  const out=Object.create(null);rows.forEach(r=>(out[String(r[field])]||(out[String(r[field])]=[])).push(r));return out;
}
// Code.gs:6587
const CAMPO = {
  AVISOS: 'FACCAO_AVISOS',
  AVISO_HEADERS: ['ID_AVISO', 'ID_REMESSA', 'NUM_REMESSA', 'ID_DESTINO', 'ID_VOLUME', 'COD_VOLUME', 'TIPO', 'DATA_HORA', 'ORIGEM', 'OBS', 'LIDO_EM'],
  OP_COLS: ['TELEFONE', 'ACESSO_APP', 'MODO_APP', 'SENHA_HASH', 'SENHA_SALT', 'SENHA_EM', 'ULTIMO_ACESSO_APP', 'LIDER_APP'],
  DEST_COLS: ['CODIGO_ACESSO', 'ACESSO_APP', 'SENHA_HASH', 'SENHA_SALT', 'SENHA_EM', 'ULTIMO_ACESSO_APP'],
  TOKEN_DIAS: 30, MAX_FALHAS: 6, MODOS: ['MARCADOR', 'APONTADOR', 'AMBOS']
};
// Code.gs:6594
const CAMPO_SECRET_FIELDS = ['SENHA_HASH', 'SENHA_SALT'];
// Code.gs:6601
function campoPublicRecord_(r) {
  const o = Object.assign({}, r);
  o.TEM_SENHA = !!String(r.SENHA_HASH || '');
  CAMPO_SECRET_FIELDS.forEach(k => delete o[k]);
  return o;
}
// Code.gs:6698
function avisosCampoMap_() {
  const out = {};
  if (!tableExists_(CAMPO.AVISOS)) return out;
  readTable_(CAMPO.AVISOS).slice().sort((a, b) => dateMs_(a.DATA_HORA) - dateMs_(b.DATA_HORA)).forEach(a => {
    const k = String(a.ID_REMESSA || ''); if (!k) return;
    const r = out[k] || (out[k] = { geral: null, vols: {}, ultimo: null, naoLidos: 0 });
    const ev = { TIPO: String(a.TIPO || '').toUpperCase(), DATA_HORA: serialize_(a.DATA_HORA), ms: dateMs_(a.DATA_HORA), OBS: a.OBS || '' };
    if (a.ID_VOLUME) r.vols[String(a.ID_VOLUME)] = ev; else { r.geral = ev; r.vols = Object.fromEntries(Object.entries(r.vols).filter(([, v]) => v.ms > ev.ms)); }
    r.ultimo = ev; if (!a.LIDO_EM) r.naoLidos++;
  });
  return out;
}
// Code.gs:6710
function campoStatusVolume_(av, idVolume) {
  if (!av) return '';
  const g = av.geral, v = av.vols[String(idVolume)];
  const e = v && (!g || v.ms >= g.ms) ? v : g;
  return e ? e.TIPO : '';
}
// Code.gs:6716
function campoResumoRemessa_(av, itens) {
  if (!av) return null;
  const pend = itens.filter(i => num_(i.QTD_ENVIADA) - num_(i.QTD_RETORNADA) > 0 || !itens.some(x => num_(x.QTD_RETORNADA) > 0));
  const st = (pend.length ? pend : itens).map(i => campoStatusVolume_(av, i.ID_VOLUME));
  const conc = st.filter(s => s === 'CONCLUIDO').length, ini = st.filter(s => s === 'INICIADO').length;
  const status = st.length && conc === st.length ? 'CONCLUIDO' : conc ? 'PARCIAL' : ini ? 'INICIADO' : '';
  return { STATUS: status, CONCLUIDOS: conc, INICIADOS: ini, TOTAL: st.length, ULTIMO: av.ultimo, NAO_LIDOS: av.naoLidos };
}
// Supabase.gs:23
var __SUPA_MODE = null, __SUPA_SCHEMA = null, __SUPA_ROWPK = {}, __SUPA_ACTION = '', __SUPA_MUT = false, __SUPA_READS = {}, __SUPA_PF_DONE = false, __SUPA_USED = {}, __SUPA_PF_LIST = null;
// Supabase.gs:44
function SUPA_ON_() {
  if (__SUPA_MODE === null) {
    try { __SUPA_MODE = PropertiesService.getScriptProperties().getProperty(SUPA.PROP) === 'SUPABASE'; } catch (e) { __SUPA_MODE = false; }
  }
  return __SUPA_MODE;
}
// Supabase.gs:50
function supaResetRequest_() { __SUPA_ROWPK = {}; __SUPA_READS = {}; __SUPA_PF_DONE = false; __SUPA_USED = {}; __SUPA_PF_LIST = null; }
// Supabase.gs:51
function supaMarkUsed_(name) { __SUPA_USED[String(name).toLowerCase()] = true; }
// Supabase.gs:52
function supaBegin_(action, mutation) { supaResetRequest_(); __SUPA_ACTION = String(action || ''); __SUPA_MUT = !!mutation; }
// Supabase.gs:105
function supaSchema_() {
  if (__SUPA_SCHEMA) return __SUPA_SCHEMA;
  try { const c = CacheService.getScriptCache().get(SUPA.SCHEMA_CACHE); if (c) return (__SUPA_SCHEMA = JSON.parse(c)); } catch (e) {}
  __SUPA_SCHEMA = supaRpc_('gut_schema', {}) || {};
  try { CacheService.getScriptCache().put(SUPA.SCHEMA_CACHE, JSON.stringify(__SUPA_SCHEMA), 21600); } catch (e) {}
  return __SUPA_SCHEMA;
}
// Supabase.gs:112
function supaDef_(name) { return supaSchema_()[String(name).toLowerCase()] || null; }
// Supabase.gs:113
function supaTableExists_(name) { return !!supaDef_(name); }
// Supabase.gs:114
function supaHeaders_(name) {
  const d = supaDef_(name);
  if (!d) throw new Error('Aba não encontrada: ' + name);
  return d.cols.map(c => String(c[0]).toUpperCase());
}
// Supabase.gs:119
function supaTypes_(name) { const d = supaDef_(name), o = {}; (d ? d.cols : []).forEach(c => o[String(c[0]).toUpperCase()] = c[1]); return o; }
// Supabase.gs:120
function supaPk_(name) { const d = supaDef_(name); return (d && d.pk && d.pk.length ? d.pk : [d.cols[0][0]]).map(c => String(c).toUpperCase()); }
// Supabase.gs:132
function supaFromDb_(v, type) {
  if (v === null || v === undefined) return '';
  if (type === 'timestamp with time zone') { const d = new Date(v); return isNaN(d.getTime()) ? '' : d; }
  if (type === 'date') {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    // meia-noite no fuso da empresa (como a planilha devolvia as datas)
    try { if (Utilities.parseDate) return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' 00:00:00', CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); } catch (e) {}
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  if (type === 'numeric') { const n = Number(v); return isFinite(n) ? n : ''; }
  return v;
}
// Supabase.gs:145
function supaToDb_(v, type, isKey) {
  if (v === '' || v === null || v === undefined) return isKey ? '' : null;
  switch (type) {
    case 'numeric': {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v instanceof Date) return null;
      let t = String(v).trim().replace(/\s/g, '');
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(',', '.');
      const n = Number(t);
      return t !== '' && isFinite(n) ? n : null;
    }
    case 'boolean': {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      const t = String(v).trim().toUpperCase();
      if (['TRUE', 'VERDADEIRO', 'SIM', 'S', 'YES', '1'].indexOf(t) >= 0) return true;
      if (['FALSE', 'FALSO', 'NAO', 'NÃO', 'N', 'NO', '0'].indexOf(t) >= 0) return false;
      return null;
    }
    case 'date': {
      if (v instanceof Date) return isNaN(v.getTime()) ? null : Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
      const t = String(v).trim();
      let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
      m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      return null;
    }
    case 'timestamp with time zone': {
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
      if (typeof v === 'number') return null;
      const d = new Date(String(v).trim().replace(' ', 'T'));
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    default:
      if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
  }
}
// Supabase.gs:192
function supaKeyOf_(name, row) {
  const types = supaTypes_(name), k = {};
  supaPk_(name).forEach(f => k[f.toLowerCase()] = supaToDb_(row[f], types[f], true));
  return k;
}
// Supabase.gs:201
function supaLoad_(name) {
  const t = String(name).toLowerCase();
  if (!supaDef_(t)) throw new Error('Aba não encontrada: ' + name);
  supaMarkUsed_(t);
  let lista = [t];
  if (!__SUPA_PF_DONE) { __SUPA_PF_DONE = true; try { lista = lista.concat(supaPrefetchList_(t)); } catch (e) {} }
  const data = supaRpc_('gut_ler', { p_tabelas: lista }) || {};
  return supaIngest_(lista, data, t);
}
// Supabase.gs:211
function supaIngest_(lista, data, alvo) {
  __METRICS.reads++;
  let mine = null;
  lista.forEach(x => {
    const N = x.toUpperCase(), types = supaTypes_(N), headers = supaHeaders_(N);
    const rows = (data[x] || []).map((r, i) => {
      const o = { _row: i + 2 };
      headers.forEach(h => { o[h] = supaFromDb_(r[h.toLowerCase()], types[h]); });
      return o;
    });
    __SUPA_READS[x] = true;
    const pkmap = {}; rows.forEach(r => { pkmap[r._row] = supaKeyOf_(N, r); });
    __SUPA_ROWPK[N] = pkmap;
    __HEADER_MEM[N] = headers;
    if (x === alvo) mine = rows;
    else if (!Object.prototype.hasOwnProperty.call(__TABLE_MEM, N)) {
      // mesma regra do readTable_: o que já foi preparado nesta operação entra por cima do que veio do banco
      if (__TX && __TX.tables[N]) {
        const st = __TX.tables[N];
        rows.forEach((row, i) => { if (st.patches[row._row]) rows[i] = Object.assign({}, row, st.patches[row._row]); });
        st.appends.forEach(row => rows.push(Object.assign({}, row)));
        const del = st.deletes || {}; for (let i = rows.length - 1; i >= 0; i--) if (del[rows[i]._row]) rows.splice(i, 1);
      }
      __TABLE_MEM[N] = rows;
    }
  });
  return mine;
}
// Supabase.gs:319
var __WEB_USER = '';
// ======================= fim do código do Apps Script =======================
const ACOES = {"getBootstrapData":"getBootstrapDataImpl_","getInitialData":"getInitialDataImpl_","getOperationalData":"getOperationalDataImpl_","getCadastros":"getCadastrosImpl_","getCorte":"getCorteImpl_","getDashboard":"getDashboardImpl_","getFinanceiroFaccao":"getFinanceiroFaccaoImpl_","getFluxoEstoque":"getFluxoEstoqueImpl_","getInternalProductionPerformance":"getInternalProductionPerformanceImpl_","getRemessasExternas":"getRemessasExternasImpl_","getRemessasInternas":"getRemessasInternasImpl_","getEstoqueMateriais":"getEstoqueMateriaisImpl_","getComprasRecentes":"getComprasRecentesImpl_","getCortesProgramados":"getCortesProgramadosImpl_","getEstoqueCorte":"getEstoqueCorteImpl_","getSeparacoesVolume":"getSeparacoesVolumeImpl_","getPrecosFaccao":"getPrecosFaccaoImpl_","getVolumes":"getVolumesImpl_","getCuponsVolume":"getCuponsVolumeImpl_","getScanCatalog":"getScanCatalogImpl_","getExternalScanCatalog":"getExternalScanCatalogImpl_","previewTempoPadraoMarcacao":"previewTempoPadraoMarcacaoImpl_","prepararRomaneioRemessa":"prepararRomaneioRemessaImpl_","prepararRomaneioInterno":"prepararRomaneioInternoImpl_"};
__MOTOR.tabelas = {"getCadastros":["app_controle","app_parametros","cad_cores","cad_destinos","cad_fornecedores","cad_locais_estoque","cad_maquinas","cad_materiais","cad_operadores","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_lotes","estoque_saldos","estrutura_produto","roteiro_produto"],"getEstoqueMateriais":["app_controle","cad_locais_estoque","cad_materiais","estoque_lotes","estoque_saldos"],"getComprasRecentes":["app_controle","cad_fornecedores","compra_itens","compras"],"getFluxoEstoque":["app_controle","cad_locais_estoque","cad_materiais","cad_produtos","estoque_lotes","mov_estoque","pedidos_corte"],"getCortesProgramados":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","pedidos_corte"],"getCorte":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","pedidos_corte"],"getEstoqueCorte":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte"],"getSeparacoesVolume":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","separacoes_volume","volume_itens","volumes"],"getPrecosFaccao":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_precos_faccao","cad_processos","cad_produtos","cad_setores","cad_tamanhos"],"getVolumes":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","cupons_producao","estoque_corte","volume_itens","volumes"],"getCuponsVolume":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","cupons_producao"],"getRemessasExternas":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","faccao_avisos","financeiro_faccao","pagamentos_faccao","remessa_itens","remessas","retorno_volume_itens","retornos_externos","volume_itens","volumes"],"getRemessasInternas":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","remessa_itens","remessas","volume_itens","volumes"],"getFinanceiroFaccao":["app_controle","cad_destinos","financeiro_faccao","pagamentos_faccao","remessa_itens","remessas","retornos_externos"],"getDashboard":["apontamentos_producao","app_controle","cad_cores","cad_destinos","cad_maquinas","cad_operadores","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","jornada_operador","pedidos_corte","remessa_itens","remessas","retornos_externos"],"getInternalProductionPerformance":["apontamentos_producao","app_controle","cad_cores","cad_destinos","cad_maquinas","cad_operadores","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","jornada_operador","volumes"],"getOperationalData":["app_controle","cad_cores","cad_destinos","cad_fornecedores","cad_locais_estoque","cad_maquinas","cad_materiais","cad_precos_faccao","cad_processos","cad_produtos","cad_setores","cad_tamanhos","compra_itens","compras","cupons_producao","estoque_corte","estoque_lotes","estoque_saldos","faccao_avisos","financeiro_faccao","mov_estoque","pagamentos_faccao","pedidos_corte","remessa_itens","remessas","retorno_volume_itens","retornos_externos","volume_itens","volumes"],"getBootstrapData":["apontamentos_producao","app_controle","app_parametros","cad_cores","cad_destinos","cad_fornecedores","cad_locais_estoque","cad_maquinas","cad_materiais","cad_operadores","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","estoque_lotes","estoque_saldos","estrutura_produto","jornada_operador","pedidos_corte","remessa_itens","remessas","retornos_externos","roteiro_produto"],"getInitialData":["apontamentos_producao","app_controle","app_parametros","cad_cores","cad_destinos","cad_fornecedores","cad_locais_estoque","cad_maquinas","cad_materiais","cad_operadores","cad_precos_faccao","cad_processos","cad_produtos","cad_setores","cad_tamanhos","compra_itens","compras","cupons_producao","estoque_corte","estoque_lotes","estoque_saldos","estrutura_produto","faccao_avisos","financeiro_faccao","jornada_operador","mov_estoque","pagamentos_faccao","pedidos_corte","remessa_itens","remessas","retorno_volume_itens","retornos_externos","roteiro_produto","volume_itens","volumes"],"getScanCatalog":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","cupons_producao"],"getExternalScanCatalog":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","remessa_itens","remessas","retornos_externos","volume_itens","volumes"],"previewTempoPadraoMarcacao":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_processos","cad_produtos","cad_setores","cad_tamanhos","cupons_producao","roteiro_produto"],"prepararRomaneioRemessa":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_materiais","cad_processos","cad_produtos","cad_setores","cad_tamanhos","estoque_corte","estrutura_produto","remessa_itens","remessas","volume_itens","volumes"],"prepararRomaneioInterno":["app_controle","cad_cores","cad_destinos","cad_maquinas","cad_materiais","cad_processos","cad_produtos","cad_setores","cad_tamanhos","cupons_producao","estoque_corte","estrutura_produto","roteiro_produto","volume_itens","volumes"]};
const IMPL = { getBootstrapDataImpl_: getBootstrapDataImpl_, getInitialDataImpl_: getInitialDataImpl_, getOperationalDataImpl_: getOperationalDataImpl_, getCadastrosImpl_: getCadastrosImpl_, getCorteImpl_: getCorteImpl_, getDashboardImpl_: getDashboardImpl_, getFinanceiroFaccaoImpl_: getFinanceiroFaccaoImpl_, getFluxoEstoqueImpl_: getFluxoEstoqueImpl_, getInternalProductionPerformanceImpl_: getInternalProductionPerformanceImpl_, getRemessasExternasImpl_: getRemessasExternasImpl_, getRemessasInternasImpl_: getRemessasInternasImpl_, getEstoqueMateriaisImpl_: getEstoqueMateriaisImpl_, getComprasRecentesImpl_: getComprasRecentesImpl_, getCortesProgramadosImpl_: getCortesProgramadosImpl_, getEstoqueCorteImpl_: getEstoqueCorteImpl_, getSeparacoesVolumeImpl_: getSeparacoesVolumeImpl_, getPrecosFaccaoImpl_: getPrecosFaccaoImpl_, getVolumesImpl_: getVolumesImpl_, getCuponsVolumeImpl_: getCuponsVolumeImpl_, getScanCatalogImpl_: getScanCatalogImpl_, getExternalScanCatalogImpl_: getExternalScanCatalogImpl_, previewTempoPadraoMarcacaoImpl_: previewTempoPadraoMarcacaoImpl_, prepararRomaneioRemessaImpl_: prepararRomaneioRemessaImpl_, prepararRomaneioInternoImpl_: prepararRomaneioInternoImpl_ };
return motorPublico_(ACOES, IMPL);
})();
