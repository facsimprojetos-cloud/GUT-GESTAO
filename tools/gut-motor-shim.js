// ----------------------------------------------------------------------------------------------
// Imitação do ambiente do Google Apps Script dentro do navegador.
// O Code.gs roda inteiro aqui (apiCall: leituras E gravações). As tabelas vêm do Supabase pela RPC web_ler
// (mesmo formato do gut_ler); o que a ação grava é juntado e enviado no fim, numa transação só, pela
// RPC web_aplicar (com conferência de concorrência). A conversão de tipos é a do próprio Supabase.gs.
// ----------------------------------------------------------------------------------------------
var __MOTOR = { rpc: null, email: '', slug: 'gut', schema: null, dados: {}, indice: {}, falta: null, tabelas: {}, log: false, op: undefined, opId: null, ops: null, google: null, uuid: null };
var GUT_TZ_ = 'America/Sao_Paulo';
// o apiCall registra cada chamada no console; aqui só com __MOTOR.log ligado
var console = { log: function () { if (__MOTOR.log) window.console.log.apply(window.console, arguments); }, warn: function () { window.console.warn.apply(window.console, arguments); }, error: function () { window.console.error.apply(window.console, arguments); } };

// ---------- datas no fuso de SP ----------
var __FMT = {};
function motorPartes_(d, tz) {
  const f = __FMT[tz] || (__FMT[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const o = {}; f.formatToParts(d).forEach(p => { if (p.type !== 'literal') o[p.type] = p.value; });
  if (o.hour === '24') o.hour = '00';
  return o;
}
function motorOffsetMin_(ms, tz) {
  const p = motorPartes_(new Date(ms), tz);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}

// ---------- bytes (o Apps Script usa arrays de bytes com sinal) ----------
const motorU8_ = a => (a instanceof Uint8Array ? a : Uint8Array.from(a, b => b & 255));
const motorS8_ = u => Array.from(u, b => (b > 127 ? b - 256 : b));
const motorUtf8_ = s => new TextEncoder().encode(String(s));
function motorB64_(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function motorDeB64_(s) { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
// SHA-256 síncrono (o Apps Script calcula na hora; o crypto.subtle do navegador é assíncrono)
const motorK_ = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function motorSha256_(msg) {
  const l = msg.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb); m.set(msg); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) >>> 0; }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + motorK_[i] + w[i]) >>> 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
}
// gzip "guardado" (sem compressão): o Apps Script lê normalmente
let motorCrcT_ = null;
function motorCrc32_(u) { if (!motorCrcT_) { motorCrcT_ = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; motorCrcT_[n] = c >>> 0; } } let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = motorCrcT_[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function motorGzip_(u) {
  const blocos = Math.max(1, Math.ceil(u.length / 65535)), out = new Uint8Array(10 + u.length + blocos * 5 + 8);
  out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255]); let p = 10;
  for (let i = 0; i < blocos; i++) { const ini = i * 65535, len = Math.min(65535, u.length - ini); out[p++] = i === blocos - 1 ? 1 : 0; out[p++] = len & 255; out[p++] = len >> 8; out[p++] = ~len & 255; out[p++] = (~len >> 8) & 255; out.set(u.subarray(ini, ini + len), p); p += len; }
  const dv = new DataView(out.buffer); dv.setUint32(p, motorCrc32_(u), true); dv.setUint32(p + 4, u.length >>> 0, true); return out;
}
// descompactador DEFLATE completo (para ler respostas que o Apps Script guardou em APP_OPERACOES)
function motorInflate_(d) {
  let p = 0, bit = 0; const out = [];
  const bits = n => { let v = 0; for (let i = 0; i < n; i++) { if (p >= d.length) throw new Error('gzip inválido'); v |= ((d[p] >> bit) & 1) << i; if (++bit === 8) { bit = 0; p++; } } return v; };
  const tabela = lens => { const cnt = new Uint16Array(16), off = new Uint16Array(16), sym = new Uint16Array(lens.length); lens.forEach(l => cnt[l]++); cnt[0] = 0; for (let i = 1; i < 16; i++) off[i] = off[i - 1] + cnt[i - 1]; lens.forEach((l, s) => { if (l) sym[off[l]++] = s; }); return { cnt, sym }; };
  const dec = t => { let code = 0, first = 0, idx = 0; for (let l = 1; l < 16; l++) { code |= bits(1); const c = t.cnt[l]; if (code - c < first) return t.sym[idx + code - first]; idx += c; first += c; first <<= 1; code <<= 1; } throw new Error('gzip inválido'); };
  const LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258], LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577], DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  let fim = 0;
  while (!fim) {
    fim = bits(1); const tipo = bits(2);
    if (tipo === 0) { if (bit) { bit = 0; p++; } const len = d[p] | (d[p + 1] << 8); p += 4; for (let i = 0; i < len; i++) out.push(d[p++]); continue; }
    let lt, dt;
    if (tipo === 1) { const l = new Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288); lt = tabela(l); dt = tabela(new Array(30).fill(5)); }
    else if (tipo === 2) {
      const hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4, ord = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15], cl = new Array(19).fill(0);
      for (let i = 0; i < hc; i++) cl[ord[i]] = bits(3);
      const ct = tabela(cl), ls = [];
      while (ls.length < hl + hd) { const s = dec(ct); if (s < 16) ls.push(s); else if (s === 16) { const v = ls[ls.length - 1], n = 3 + bits(2); for (let i = 0; i < n; i++) ls.push(v); } else { const n = s === 17 ? 3 + bits(3) : 11 + bits(7); for (let i = 0; i < n; i++) ls.push(0); } }
      lt = tabela(ls.slice(0, hl)); dt = tabela(ls.slice(hl));
    } else throw new Error('gzip inválido');
    for (;;) { const s = dec(lt); if (s < 256) out.push(s); else if (s === 256) break; else { const li = s - 257, len = LB[li] + bits(LE[li]), di = dec(dt), dist = DB[di] + bits(DE[di]); const ini = out.length - dist; for (let i = 0; i < len; i++) out.push(out[ini + i]); } }
  }
  return Uint8Array.from(out);
}
function motorGunzip_(u) {
  if (u[0] !== 0x1f || u[1] !== 0x8b) throw new Error('gzip inválido');
  let p = 10; const fl = u[3];
  if (fl & 4) p += 2 + (u[p] | (u[p + 1] << 8)); if (fl & 8) { while (u[p++]); } if (fl & 16) { while (u[p++]); } if (fl & 2) p += 2;
  return motorInflate_(u.subarray(p));
}
function motorBlob_(u, tipo) { return { _u: u, getBytes: () => motorS8_(u), getDataAsString: () => new TextDecoder().decode(u), getContentType: () => tipo || 'application/octet-stream', setContentType: function (t) { tipo = t; return this; } }; }

var Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5', SHA_1: 'SHA_1' }, Charset: { UTF_8: 'UTF_8' },
  formatDate: function (d, tz, pat) {
    d = d instanceof Date ? d : new Date(d);
    if (isNaN(d.getTime())) throw new Error('Data inválida');
    const p = motorPartes_(d, tz || GUT_TZ_);
    const tok = { yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, SSS: String(d.getMilliseconds()).padStart(3, '0') };
    return String(pat).replace(/'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss|SSS/g, (m, lit) => lit !== undefined ? lit : tok[m]);
  },
  parseDate: function (s, tz) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) throw new Error('Data inválida: ' + s);
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    let ms = guess - motorOffsetMin_(guess, tz || GUT_TZ_) * 60000;
    ms = guess - motorOffsetMin_(ms, tz || GUT_TZ_) * 60000;
    return new Date(ms);
  },
  getUuid: function () {
    if (__MOTOR.uuid) return __MOTOR.uuid();
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  },
  computeDigest: function (alg, v) {
    if (alg !== 'SHA_256') throw new Error('Algoritmo não disponível no navegador: ' + alg);
    return motorS8_(motorSha256_(typeof v === 'string' ? motorUtf8_(v) : motorU8_(v)));
  },
  base64Encode: v => motorB64_(typeof v === 'string' ? motorUtf8_(v) : motorU8_(v)),
  base64EncodeWebSafe: v => motorB64_(typeof v === 'string' ? motorUtf8_(v) : motorU8_(v)).replace(/\+/g, '-').replace(/\//g, '_'),
  base64Decode: s => motorS8_(motorDeB64_(s)),
  base64DecodeWebSafe: s => motorS8_(motorDeB64_(s)),
  newBlob: (v, tipo) => motorBlob_(typeof v === 'string' ? motorUtf8_(v) : motorU8_(v || []), tipo),
  gzip: b => motorBlob_(motorGzip_(b._u), 'application/x-gzip'),
  ungzip: b => motorBlob_(motorGunzip_(b._u)),
  sleep: function () {}
};
var PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k === 'GUT_STORAGE' ? 'SUPABASE' : null; }, setProperty: function () {}, deleteProperty: function () {} }; } };
var CacheService = { getScriptCache: function () { return { get: function () { return null; }, getAll: function () { return {}; }, put: function () {}, putAll: function () {}, remove: function () {}, removeAll: function () {} }; } };
var Session = { getActiveUser: function () { return { getEmail: function () { return __MOTOR.email; } }; }, getEffectiveUser: function () { return { getEmail: function () { return __MOTOR.email; } }; } };
var LockService = { getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; } };
// Serviços que só existem no Google: se uma ação precisar deles, ela volta para a GUT API (sem gravar nada aqui).
function motorGoogle_(nome) { return new Proxy({}, { get: function (o, k) { __MOTOR.google = nome; throw new Error('__MOTOR_GOOGLE__ ' + nome + '.' + String(k)); } }); }
var DriveApp = motorGoogle_('DriveApp'), UrlFetchApp = motorGoogle_('UrlFetchApp'), SpreadsheetApp = motorGoogle_('SpreadsheetApp'), Sheets = motorGoogle_('Sheets'), ScriptApp = motorGoogle_('ScriptApp'), HtmlService = motorGoogle_('HtmlService'), MailApp = motorGoogle_('MailApp');

// --- trocas de funções do Apps Script (lista em tools/motor_trocadas.json) ---
// SUPA sem endereço nem token do servidor: o navegador só fala com o banco pelo login do usuário
var SUPA = { PROP: 'GUT_STORAGE', SCHEMA_CACHE: 'GUT_SUPA_SCHEMA_v1', PF_KEY: 'GUT_PF2:', SEM_PREFETCH: ['auditoria', 'movimentacoes', 'mov_estoque', 'bipagens_externas', 'app_operacoes'] };
function cacheGet_() { return null; }      // sem cache compartilhado: sempre lê o banco
function cachePut_() {}
function supaPrefetchList_() { return []; } // as tabelas já foram baixadas antes de rodar
function motorLinhaPorChave_(t, k) {
  const ix = __MOTOR.indice[t] || (__MOTOR.indice[t] = (() => {
    const pk = (__MOTOR.schema[t] && __MOTOR.schema[t].pk) || [], m = new Map();
    (__MOTOR.dados[t] || []).forEach(r => m.set(pk.map(c => String(r[c] == null ? '' : r[c])).join('\u0001'), r));
    return { pk, m };
  })());
  return ix.m.get(ix.pk.map(c => String(k[c] == null ? '' : k[c])).join('\u0001')) || null;
}
function supaRpc_(fn, body) {
  if (fn === 'gut_schema') return __MOTOR.schema;
  if (fn === 'gut_ler' || fn === 'gut_operacao') {
    const out = {};
    (body.p_tabelas || []).forEach(t => {
      if (Object.prototype.hasOwnProperty.call(__MOTOR.dados, t)) out[t] = __MOTOR.dados[t];
      else __MOTOR.falta.add(t);
    });
    const id = fn === 'gut_operacao' ? body.p_id : body.p_op;
    if (id !== undefined && id !== null && (__MOTOR.op === undefined || __MOTOR.opId !== String(id))) __MOTOR.falta.add('__op');
    if (__MOTOR.falta.size) throw new Error('__MOTOR_FALTA__');
    if (fn === 'gut_operacao') return __MOTOR.op;
    if (id !== undefined && id !== null) out.__op = __MOTOR.op;
    return out;
  }
  if (fn === 'gut_aplicar') {
    // não grava agora: guarda as operações (com a linha lida, para conferir concorrência) e manda no fim
    __MOTOR.indice = {};
    __MOTOR.ops = (body.p_ops || []).map(op => {
      const o = Object.assign({}, op);
      if (op.del) o.del = op.del.map(k => ({ k, o: motorLinhaPorChave_(op.t, k) }));
      if (op.upd) o.upd = op.upd.map(u => ({ k: u.k, s: u.s, o: motorLinhaPorChave_(op.t, u.k) }));
      return o;
    });
    return { ok: true };
  }
  throw new Error('O navegador não faz esta chamada ao banco: ' + fn);
}

function motorPublico_(GOOGLE_ACOES) {
  const LS = 'gut-motor-tabelas:';
  const lembrar = (acao) => { let l = __MOTOR.tabelas[acao] || []; try { const s = JSON.parse(localStorage.getItem(LS + acao) || '[]'); if (Array.isArray(s)) l = l.concat(s); } catch (e) {} return [...new Set(l)]; };
  const aprender = (acao, novas) => { if (!novas.length) return; try { const l = lembrar(acao).concat(novas); localStorage.setItem(LS + acao, JSON.stringify([...new Set(l)])); } catch (e) {} };
  const mutacoes = new Set(mutationActions_()), rotas = routes_();
  const tem = acao => Object.prototype.hasOwnProperty.call(rotas, acao) && !GOOGLE_ACOES.includes(acao);
  const erroDoBanco = e => !!(e && e.code && /^[0-9A-Z]{5}$/.test(String(e.code)));

  // Roda a ação como a GUT API rodaria e devolve a MESMA resposta (inclusive {__error, retryable, message}).
  // Lança erro só quando não chegou a gravar nada (sem conexão, sem permissão, ação inexistente).
  // ctx (no servidor, uma por pedido): { rpc, slug, email } — vários pedidos podem estar em andamento ao mesmo tempo.
  async function api(acao, args, meta, ctx) {
    meta = meta || {}; ctx = ctx || {};
    const rpc = ctx.rpc || __MOTOR.rpc, slug = ctx.slug || __MOTOR.slug, email = () => (ctx.email !== undefined ? ctx.email : __MOTOR.email) || '';
    if (!rpc) throw new Error('Motor sem conexão com o banco.');
    if (!tem(acao)) throw new Error('Ação não roda no navegador: ' + acao);
    const t0 = Date.now(), mut = mutacoes.has(acao), opId = mut && meta.requestId ? String(meta.requestId) : null;
    if (!__MOTOR.schema) __MOTOR.schema = await rpc('web_schema', { p_slug: slug });
    let minhas = {}, op, viagens = 0, conflitos = 0;
    const baixar = async (lista, comOp) => {
      const faltam = [...new Set(lista)].filter(t => !Object.prototype.hasOwnProperty.call(minhas, t));
      if (!faltam.length && !comOp) return;
      const a = { p_slug: slug, p_tabelas: faltam };
      if (comOp) a.p_op = opId;
      const r = await rpc('web_ler', a); viagens++;
      faltam.forEach(t => { minhas[t] = (r && r[t]) || []; });
      if (comOp) op = r && r.__op ? r.__op : null;
    };
    await baixar(lembrar(acao).concat(['app_controle']), !!opId);
    for (let tentativa = 0; tentativa < 60; tentativa++) {
      if (__MOTOR.antes) __MOTOR.antes();   // (teste de paridade: mesmo relógio/ids a cada tentativa)
      __MOTOR.dados = minhas; __MOTOR.indice = {}; __MOTOR.falta = new Set(); __MOTOR.ops = null; __MOTOR.google = null;
      __MOTOR.op = opId ? op : undefined; __MOTOR.opId = opId;
      __MOTOR.email = email(); __MOTOR.slug = slug;   // síncrono a partir daqui: vale só para este pedido
      __WEB_USER = __MOTOR.email;
      let r;
      try { r = apiCall(acao, args || [], meta); } finally { __WEB_USER = ''; }   // síncrono: nada roda no meio
      if (__MOTOR.google || (r && r.__error && /__MOTOR_GOOGLE__/.test(r.message || ''))) throw new Error('Esta ação ainda usa o Google (' + (__MOTOR.google || '') + ').');
      if (__MOTOR.falta.size) {
        const falta = [...__MOTOR.falta].filter(t => t !== '__op');
        aprender(acao, falta); await baixar(falta, __MOTOR.falta.has('__op') && !!opId); continue;
      }
      if (r && r.__error && /gzip inválido/.test(r.message || '')) throw new Error('Resposta guardada num formato que o navegador não lê.');
      const ops = __MOTOR.ops;
      if (!mut || !ops || !ops.length || (r && r.__error)) { motorLog_(acao, t0, viagens, 0); return r; }
      try {
        await rpc('web_aplicar', { p_slug: slug, p_ops: ops });
      } catch (e) {
        if (erroDoBanco(e) && String(e.code) === '40001' && ++conflitos <= 4) { minhas = {}; await baixar(lembrar(acao).concat(['app_controle']), !!opId); continue; }
        if (erroDoBanco(e)) return { __error: true, retryable: false, message: String(e.message || e) };  // nada foi gravado (tudo ou nada)
        return { __error: true, retryable: true, message: 'Não foi possível confirmar a resposta da gravação. Tente novamente sem alterar os dados; o sistema verificará a operação antes de gravar. Detalhe: ' + ((e && e.message) || e) };
      }
      motorLog_(acao, t0, viagens + 1, ops.length);
      return r;
    }
    throw new Error('O motor não conseguiu reunir as tabelas de ' + acao + '.');
  }
  function motorLog_(acao, t0, viagens, ops) { if (__MOTOR.log) window.console.log('[GUT motor]', acao, (Date.now() - t0) + ' ms', viagens + ' viagem(ns)', ops ? ops + ' tabela(s) gravada(s)' : ''); }
  return {
    tem: tem,
    gravacao: acao => mutacoes.has(acao),
    configurar: function (o) { Object.assign(__MOTOR, o || {}); if (o && o.slug) __MOTOR.schema = null; },
    api: api,
    // compatibilidade: executar = api, mas lança o erro em vez de devolver {__error}
    executar: async function (acao, args, meta) { const r = await api(acao, args, meta); if (r && r.__error) { const e = new Error(r.message); e.retryable = !!r.retryable; throw e; } return r; },
    estado: () => __MOTOR
  };
}
