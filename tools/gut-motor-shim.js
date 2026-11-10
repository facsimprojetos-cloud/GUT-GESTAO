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
