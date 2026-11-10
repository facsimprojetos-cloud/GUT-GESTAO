// Simulador do Apps Script do GUT PPCP: roda o Code.gs + Supabase.gs de verdade (como estão no repositório)
// dentro do Node, com o armazenamento no Supabase ligado e as chamadas ao banco indo para o Postgres local
// (pg_base.js), que tem as mesmas RPCs gut_ler/gut_aplicar do Supabase.
//   const gas = require('./gas_sim')(pg);  gas.api('getCadastros', [])  → resposta igual à da GUT API
process.env.TZ = 'America/Sao_Paulo'; // o projeto Apps Script roda no fuso de São Paulo
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', '..');

function partes(d, tz) {
  const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(d).forEach(p => { if (p.type !== 'literal') o[p.type] = p.value; });
  if (o.hour === '24') o.hour = '00'; return o;
}
const bytes = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
const buf = arr => Buffer.from(arr.map(b => (b < 0 ? b + 256 : b)));
function blob(b) { return { getBytes: () => bytes(b), getDataAsString: () => b.toString('utf8'), _b: b }; }

function criar(pg, { email = 'carla@gut.com' } = {}) {
  const props = { GUT_STORAGE: 'SUPABASE' };
  const chamadas = [];
  const sqlLit = (v, tag = 'gutj') => `$${tag}$${v}$${tag}$`;
  function rpc(fn, body) {
    chamadas.push(fn);
    const args = Object.entries(body).map(([k, v]) => {
      if (k === 'p_tabelas' || k === 'p_cols') return `${k} => array(select jsonb_array_elements_text(${sqlLit(JSON.stringify(v || []))}::jsonb))`;
      if (k === 'p_ops') return `${k} => ${sqlLit(JSON.stringify(v))}::jsonb`;
      if (v === null || v === undefined) return `${k} => null`;
      return `${k} => ${sqlLit(String(v))}`;
    });
    return pg.psql(`select coalesce(public.${fn}(${args.join(', ')})::text, 'null');`);
  }
  const Utilities = {
    formatDate(d, tz, pat) {
      const p = partes(d, tz), tok = { yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, SSS: String(d.getMilliseconds()).padStart(3, '0') };
      return String(pat).replace(/'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss|SSS/g, (m, lit) => lit !== undefined ? lit : tok[m]);
    },
    parseDate(s, tz) {
      const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      // no Apps Script o fuso do projeto é o mesmo de CFG.TZ, e o Node aqui roda em America/Sao_Paulo
      return new ctx.Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); // Date do próprio Apps Script
    },
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5', SHA_1: 'sha1' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => bytes(crypto.createHash(alg).update(typeof s === 'string' ? Buffer.from(s, 'utf8') : buf(s)).digest()),
    computeHmacSha256Signature: (v, k) => bytes(crypto.createHmac('sha256', k).update(v).digest()),
    base64Encode: a => (typeof a === 'string' ? Buffer.from(a) : buf(a)).toString('base64'),
    base64EncodeWebSafe: a => (typeof a === 'string' ? Buffer.from(a) : buf(a)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64Decode: s => bytes(Buffer.from(s, 'base64')),
    newBlob: (d) => blob(typeof d === 'string' ? Buffer.from(d, 'utf8') : buf(d)),
    gzip: b => blob(zlib.gzipSync(b._b)), ungzip: b => blob(zlib.gunzipSync(b._b)),
    sleep: () => {}
  };
  const ctx = {
    console: { log: () => {}, warn: (...a) => ctx.__avisos.push(a.join(' ')), error: (...a) => ctx.__avisos.push(a.join(' ')) },
    __avisos: [],
    Utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, getAll: () => ({}), put() {}, putAll() {}, remove() {} }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => email }), getEffectiveUser: () => ({ getEmail: () => email }) },
    UrlFetchApp: {
      fetch(url, opt) {
        const fn = String(url).split('/rest/v1/rpc/')[1];
        const body = JSON.parse(opt.payload || '{}');
        try { const txt = rpc(fn, body); return { getResponseCode: () => 200, getContentText: () => txt }; }
        catch (e) { return { getResponseCode: () => 400, getContentText: () => JSON.stringify({ message: String(e.message).replace(/^psql:[^:]*:\d+: ERROR:\s*/, '').split('\n')[0] }) }; }
      }
    },
    HtmlService: {}, SpreadsheetApp: {}, DriveApp: {}, ScriptApp: {}, Logger: { log() {} },
  };
  vm.createContext(ctx);
  ctx.Date = vm.runInContext('Date', ctx);
  const src = ['apps-script/principal/Code.gs', 'apps-script/principal/Supabase.gs'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  vm.runInContext(src + '\n;this.__api = apiCall; this.__chamar = function(n, a){ return this[n].apply(null, a); };', ctx, { filename: 'Code.gs' });

  let seq = 0;
  return {
    ctx, chamadas,
    // igual à GUT API: apiCall(acao, args, meta) → resposta serializada (com __error em caso de erro)
    api(acao, args = [], meta = {}) {
      const mut = ctx.mutationActions_().includes(acao);
      const m = Object.assign({}, meta);
      if (mut && !m.requestId) m.requestId = 'sim' + Date.now().toString(36) + (++seq).toString(36).padStart(6, '0');
      const r = ctx.__api(acao, args, m);
      return JSON.parse(JSON.stringify(r));
    },
    // grava e falha alto se o Apps Script recusar (para montar os cenários)
    grava(acao, ...args) { const r = this.api(acao, args); if (r && r.__error) throw new Error(acao + ': ' + r.message); return r; },
    props
  };
}
module.exports = criar;
