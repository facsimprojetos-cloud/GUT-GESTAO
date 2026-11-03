/**
 * GUT PPCP — Armazenamento no Supabase (Etapa 1).
 *
 * Com a propriedade do script GUT_STORAGE = SUPABASE, todas as leituras e gravações que antes iam para a
 * planilha passam a ir para o banco Supabase. As regras do sistema (Code.gs) não mudam: esta camada imita a
 * planilha (linhas com _row, cabeçalhos em MAIÚSCULAS, datas como Date, vazio como '').
 * Cada operação grava tudo de uma vez numa transação do banco (gut_aplicar): ou grava tudo, ou nada.
 *
 *   ativarSupabase()      → passa a usar o Supabase (rode no editor).
 *   voltarParaPlanilha()  → volta a usar a planilha (o Supabase fica como está).
 *   statusArmazenamento() → mostra qual está em uso.
 */
const SUPA = {
  URL: 'https://ipjsogzbdkqprrtuquok.supabase.co',
  KEY: 'sb_publishable_jJqCSp5S2wOh0Pa5bQlVGg_cxJweXNy',
  TOKEN: 'gutsrv_b59a0d13e7a06570c054d9da502251a577d8f654c0904260',
  PROP: 'GUT_STORAGE',
  SCHEMA_CACHE: 'GUT_SUPA_SCHEMA_v1',
  PF_KEY: 'GUT_PF2:',   // tabelas que cada ação usa (guardado de vez nas propriedades + cache)
  // tabelas de histórico que só são lidas quando alguma tela pede (não entram na leitura antecipada)
  SEM_PREFETCH: ['auditoria', 'movimentacoes', 'mov_estoque', 'bipagens_externas', 'app_operacoes']
};
var __SUPA_MODE = null, __SUPA_SCHEMA = null, __SUPA_ROWPK = {}, __SUPA_ACTION = '', __SUPA_MUT = false, __SUPA_READS = {}, __SUPA_PF_DONE = false, __SUPA_USED = {}, __SUPA_PF_LIST = null;

function ativarSupabase() {
  PropertiesService.getScriptProperties().setProperty(SUPA.PROP, 'SUPABASE');
  __SUPA_MODE = null; supaSchemaReset_();
  const s = supaSchema_(), n = Object.keys(s).length;
  console.log('✅ GUT PPCP agora usa o Supabase (' + n + ' tabelas). A planilha não recebe mais gravações. Publique uma nova versão do App da Web.');
  return { ok: true, armazenamento: 'SUPABASE', tabelas: n };
}
function voltarParaPlanilha() {
  PropertiesService.getScriptProperties().setProperty(SUPA.PROP, 'PLANILHA');
  __SUPA_MODE = null;
  console.log('↩ GUT PPCP voltou a usar a planilha. Atenção: o que foi gravado no Supabase depois da virada não está na planilha.');
  return { ok: true, armazenamento: 'PLANILHA' };
}
function statusArmazenamento() {
  const m = SUPA_ON_() ? 'SUPABASE' : 'PLANILHA';
  console.log('Armazenamento em uso: ' + m);
  return m;
}

function SUPA_ON_() {
  if (__SUPA_MODE === null) {
    try { __SUPA_MODE = PropertiesService.getScriptProperties().getProperty(SUPA.PROP) === 'SUPABASE'; } catch (e) { __SUPA_MODE = false; }
  }
  return __SUPA_MODE;
}
function supaResetRequest_() { __SUPA_ROWPK = {}; __SUPA_READS = {}; __SUPA_PF_DONE = false; __SUPA_USED = {}; __SUPA_PF_LIST = null; }
function supaMarkUsed_(name) { __SUPA_USED[String(name).toLowerCase()] = true; }
function supaBegin_(action, mutation) { supaResetRequest_(); __SUPA_ACTION = String(action || ''); __SUPA_MUT = !!mutation; }
function supaEnd_() {
  if (!SUPA_ON_() || !__SUPA_ACTION) return;
  try {
    const used = Object.keys(__SUPA_USED).filter(t => SUPA.SEM_PREFETCH.indexOf(t) < 0 && supaDef_(t));
    if (!used.length) return;
    const known = supaLearned_(), add = known ? used.filter(t => known.indexOf(t) < 0) : used;
    if (known && !add.length) return;
    const lista = (known || []).concat(add), key = SUPA.PF_KEY + __SUPA_ACTION, val = JSON.stringify(lista);
    try { PropertiesService.getScriptProperties().setProperty(key, val); } catch (e) {}
    try { CacheService.getScriptCache().put(key, val, 21600); } catch (e) {}
  } catch (e) {}
}
// Tabelas que esta ação costuma ler (null = ação ainda desconhecida).
function supaLearned_() {
  if (__SUPA_PF_LIST !== null) return __SUPA_PF_LIST || null;
  const key = SUPA.PF_KEY + __SUPA_ACTION; let raw = null;
  try { raw = CacheService.getScriptCache().get(key); } catch (e) {}
  if (!raw) {
    try { raw = PropertiesService.getScriptProperties().getProperty(key); } catch (e) {}
    if (raw) try { CacheService.getScriptCache().put(key, raw, 21600); } catch (e) {}
  }
  let l = null; try { l = raw ? JSON.parse(raw) : null; } catch (e) { l = null; }
  __SUPA_PF_LIST = Array.isArray(l) ? l : false;
  return __SUPA_PF_LIST || null;
}
// Lista para a leitura antecipada: o que a ação já usou; se ela ainda é desconhecida, todas as tabelas de trabalho
// (menos os históricos), numa chamada só, em vez de uma viagem por tabela.
function supaPrefetchList_(first) {
  let l = supaLearned_();
  if (!l) l = Object.keys(supaSchema_()).filter(t => SUPA.SEM_PREFETCH.indexOf(t) < 0);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // gravações sempre atualizam a revisão em app_controle: já traz junto
  if (__SUPA_MUT && l.indexOf('app_controle') < 0) l = l.concat(['app_controle']);
  return l.filter(x => x !== first && supaDef_(x) && !has(__TABLE_MEM, x.toUpperCase()));
}

function supaRpc_(fn, body) {
  const r = UrlFetchApp.fetch(SUPA.URL + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPA.KEY }, payload: JSON.stringify(Object.assign({ p_token: SUPA.TOKEN }, body || {}))
  });
  const code = r.getResponseCode(), txt = r.getContentText();
  if (code >= 300) {
    let msg = txt;
    try { const j = JSON.parse(txt); msg = j.message || j.hint || txt; } catch (e) {}
    throw new Error('Banco de dados: ' + String(msg).slice(0, 400));
  }
  return txt ? JSON.parse(txt) : null;
}

// ---------- estrutura ----------
function supaSchemaReset_() { __SUPA_SCHEMA = null; try { CacheService.getScriptCache().remove(SUPA.SCHEMA_CACHE); } catch (e) {} }
function supaSchema_() {
  if (__SUPA_SCHEMA) return __SUPA_SCHEMA;
  try { const c = CacheService.getScriptCache().get(SUPA.SCHEMA_CACHE); if (c) return (__SUPA_SCHEMA = JSON.parse(c)); } catch (e) {}
  __SUPA_SCHEMA = supaRpc_('gut_schema', {}) || {};
  try { CacheService.getScriptCache().put(SUPA.SCHEMA_CACHE, JSON.stringify(__SUPA_SCHEMA), 21600); } catch (e) {}
  return __SUPA_SCHEMA;
}
function supaDef_(name) { return supaSchema_()[String(name).toLowerCase()] || null; }
function supaTableExists_(name) { return !!supaDef_(name); }
function supaHeaders_(name) {
  const d = supaDef_(name);
  if (!d) throw new Error('Aba não encontrada: ' + name);
  return d.cols.map(c => String(c[0]).toUpperCase());
}
function supaTypes_(name) { const d = supaDef_(name), o = {}; (d ? d.cols : []).forEach(c => o[String(c[0]).toUpperCase()] = c[1]); return o; }
function supaPk_(name) { const d = supaDef_(name); return (d && d.pk && d.pk.length ? d.pk : [d.cols[0][0]]).map(c => String(c).toUpperCase()); }
function supaEnsureColumns_(name, wanted) {
  wanted = (wanted || []).filter(Boolean);
  const d = supaDef_(name), have = d ? supaHeaders_(name) : [];
  const missing = d ? wanted.filter(h => have.indexOf(h) < 0) : wanted;
  if (!missing.length) return false;
  supaRpc_('gut_garantir_colunas', { p_tabela: String(name).toLowerCase(), p_cols: missing.map(c => String(c).toLowerCase()) });
  supaSchemaReset_();
  return true;
}

// ---------- conversão de valores ----------
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
function supaRowToDb_(name, row, fields) {
  const types = supaTypes_(name), pk = supaPk_(name), out = {};
  (fields || Object.keys(row)).forEach(f => {
    if (f === '_row' || !Object.prototype.hasOwnProperty.call(types, f)) return;
    out[f.toLowerCase()] = supaToDb_(row[f], types[f], pk.indexOf(f) >= 0);
  });
  return out;
}
function supaKeyOf_(name, row) {
  const types = supaTypes_(name), k = {};
  supaPk_(name).forEach(f => k[f.toLowerCase()] = supaToDb_(row[f], types[f], true));
  return k;
}

// ---------- leitura ----------
// Lê várias tabelas numa chamada só. Na primeira leitura de cada requisição, já traz junto as tabelas que
// esta mesma ação costuma usar (aprendido nas execuções anteriores), para não fazer uma chamada por tabela.
function supaLoad_(name) {
  const t = String(name).toLowerCase();
  if (!supaDef_(t)) throw new Error('Aba não encontrada: ' + name);
  supaMarkUsed_(t);
  let lista = [t];
  if (!__SUPA_PF_DONE) { __SUPA_PF_DONE = true; try { lista = lista.concat(supaPrefetchList_(t)); } catch (e) {} }
  const data = supaRpc_('gut_ler', { p_tabelas: lista }) || {};
  return supaIngest_(lista, data, t);
}
// Converte o que veio do banco e guarda na memória da requisição. Devolve as linhas de "alvo" (se houver).
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
function supaRowKey_(name, row) {
  const m = __SUPA_ROWPK[name];
  if (m && m[row]) return m[row];
  const r = (__TABLE_MEM[name] || []).find(x => x._row === row);
  if (r) return supaKeyOf_(name, r);
  throw new Error('Linha ' + row + ' de ' + name + ' não encontrada para gravar. Atualize a tela e tente de novo.');
}

// ---------- gravação ----------
function supaCommit_() {
  const ops = [];
  Object.keys(__TX.tables).forEach(name => {
    const t = __TX.tables[name], op = { t: name.toLowerCase() };
    const dels = Object.keys(t.deletes || {}).map(Number);
    if (dels.length) op.del = dels.map(r => supaRowKey_(name, r));
    const ups = Object.keys(t.patches || {}).map(Number).filter(r => !(t.deletes || {})[r]);
    if (ups.length) op.upd = ups.map(r => ({ k: supaRowKey_(name, r), s: supaRowToDb_(name, t.patches[r]) }));
    if (t.appends.length) op.ins = t.appends.map(row => supaRowToDb_(name, row, t.headers));
    if (op.del || op.upd || op.ins) ops.push(op);
  });
  if (!ops.length) return;
  __TX.committing = true;
  supaRpc_('gut_aplicar', { p_ops: ops });
  __METRICS.commits++;
}
function supaFindOperation_(id) {
  let r;
  if (!__SUPA_PF_DONE) {
    // gravação: confere se a operação já foi feita e já traz as tabelas que ela vai usar, numa viagem só
    __SUPA_PF_DONE = true;
    const lista = supaPrefetchList_(null);
    const data = supaRpc_('gut_ler', { p_tabelas: lista, p_op: String(id) }) || {};
    supaIngest_(lista, data, null);
    r = data.__op;
  } else r = supaRpc_('gut_operacao', { p_id: String(id) });
  if (!r) return null;
  const out = {}; operationHeaders_().forEach(h => { const v = r[h.toLowerCase()]; out[h] = v === null || v === undefined ? '' : v; });
  return out;
}

// ---------- cópia de segurança diária (o plano grátis do Supabase não tem backup automático) ----------
// Gera/atualiza a planilha "GUT PPCP — backup do Supabase" no seu Drive, uma aba por tabela.
// instalarBackupDiario() agenda para todo dia às 23h; rode uma vez no editor (vai pedir permissão).
function backupSupabaseParaPlanilha() {
  const props = PropertiesService.getScriptProperties(), schema = supaSchema_();
  let ss = null, id = props.getProperty('GUT_BACKUP_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('GUT PPCP — backup do Supabase'); props.setProperty('GUT_BACKUP_ID', ss.getId()); }
  const tabelas = Object.keys(schema).sort(), resumo = [];
  for (let i = 0; i < tabelas.length; i += 8) {
    const lote = tabelas.slice(i, i + 8), data = supaRpc_('gut_ler', { p_tabelas: lote }) || {};
    lote.forEach(t => {
      if (t === 'app_operacoes') return;
      const cols = schema[t].cols.map(c => c[0]), rows = data[t] || [];
      let sh = ss.getSheetByName(t.toUpperCase()); if (!sh) sh = ss.insertSheet(t.toUpperCase());
      sh.clearContents();
      const values = [cols.map(c => c.toUpperCase())].concat(rows.map(r => cols.map(c => { const v = r[c]; return v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : v); })));
      sh.getRange(1, 1, values.length, cols.length).setValues(values);
      resumo.push(t + ': ' + rows.length);
    });
  }
  const capa = ss.getSheetByName('LEIA_ME') || ss.insertSheet('LEIA_ME', 0);
  capa.clearContents();
  capa.getRange(1, 1, 3, 1).setValues([['Cópia de segurança do banco Supabase do GUT PPCP'], ['Atualizada em: ' + Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm')], ['Não edite: esta planilha é sobrescrita a cada cópia.']]);
  const padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1'); if (padrao && ss.getSheets().length > 1) ss.deleteSheet(padrao);
  console.log('✅ Backup atualizado: ' + ss.getUrl() + '\n' + resumo.join(' • '));
  return { ok: true, url: ss.getUrl() };
}
function instalarBackupDiario() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupSupabaseParaPlanilha').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupSupabaseParaPlanilha').timeBased().everyDays(1).atHour(23).create();
  const r = backupSupabaseParaPlanilha();
  console.log('Backup diário agendado para as 23h. Primeira cópia: ' + r.url);
  return r;
}


// ---------- v4.13.0: sistema aberto pelo Netlify ----------
// O projeto "GUT API" (Apps Script publicado para "Qualquer pessoa") recebe as chamadas da tela no Netlify e chama GUT.apiWeb.
// Aqui confere o login do Supabase (token do usuário) e se ele tem acesso a esta empresa; só então executa a mesma apiCall da tela do Google.
var __WEB_USER = '';
function apiWeb(action, args, meta, token) {
  if (!SUPA_ON_()) return { __error: true, message: 'O sistema pela web precisa do Supabase ativo.' };
  let quem;
  try { quem = webAuth_(token); } catch (e) { return { __error: true, auth: true, message: String((e && e.message) || e) }; }
  __WEB_USER = quem.email || '';
  try { return apiCall(action, Array.isArray(args) ? args : [], meta || {}); }
  catch (e) { return { __error: true, message: String((e && e.message) || e) }; }
  finally { __WEB_USER = ''; }
}
function webAuth_(token) {
  token = String(token || '');
  if (!token) throw new Error('Entre no sistema.');
  const key = 'GUT_WEB_AUTH:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 43);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch(SUPA.URL + '/auth/v1/user', { method: 'get', muteHttpExceptions: true, headers: { apikey: SUPA.KEY, Authorization: 'Bearer ' + token } });
  if (r.getResponseCode() !== 200) throw new Error('Sua sessão expirou. Entre novamente.');
  const u = JSON.parse(r.getContentText() || '{}');
  if (!u.id) throw new Error('Sua sessão expirou. Entre novamente.');
  const acc = supaRpc_('gut_usuario_web', { p_user: u.id }) || {};
  if (!acc.ok) throw new Error(acc.motivo || 'Seu usuário não tem acesso a esta empresa.');
  const out = { id: u.id, email: acc.email || u.email || '', papel: acc.papel || '', admin: !!acc.admin, permissoes: acc.permissoes || {} };
  try { cache.put(key, JSON.stringify(out), 300); } catch (e) {}
  return out;
}
