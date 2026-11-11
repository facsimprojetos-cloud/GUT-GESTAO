/* GUT PPCP | Painéis de TV (modo escuro)
 * 1. Peças prontas · 2. Produção (eficiências) · 3. Produção em tela cheia
 * Dados direto do Supabase (RPC web_paineis_tv), ao vivo pelo canal campo-<empresa> e a cada 15 s.
 * Design e lógica de referência: facsimprojetos-cloud/apontador-de-producao (tv-dashboard.js).
 * Abrir: GUT_TV.abrir(1|2|3) ou o link /sistema/#tv1, #tv2, #tv3.
 */
(() => {
'use strict';
if (window.GUT_TV) return;

/* ---------- utilitários ---------- */
const fmt = (v, d = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = v => v == null || !isFinite(v) ? '—' : fmt(v, 1).replace(',0', '') + '%';
const shortDate = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—';
const dateLabel = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somaDias = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const $id = id => document.getElementById(id);

/* Cores: até 80% vermelho; acima de 80% até 100% azul; acima de 100% verde */
const cls = e => e == null || !isFinite(e) ? 'tv-neutral' : e > 100 ? 'tv-good' : e > 80 ? 'tv-mid' : 'tv-bad';

const PANELS = [[1, 'PEÇAS PRONTAS'], [2, 'PRODUÇÃO'], [3, 'PRODUÇÃO · TELA CHEIA']];
const CFG_KEY = 'gut-tv-cfg';
const cfg = { panel: 2, rotate: false, secs: 30 };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (_) { /* sem armazenamento */ }
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify({ panel: cfg.panel, rotate: cfg.rotate, secs: cfg.secs })); } catch (_) {} };

const filtrosPadrao = () => { const h = hojeSP(); return { inicio: h, fim: h, funcionario: '', produto: '', processo: '', setor: '' }; };
const filters = filtrosPadrao();

let DADOS = null;      // período dos filtros
let DADOS_HOJE = null; // só hoje (painel 3)
let active = false, busy = false, lastUpdated = null, lastError = '', pendingLive = false;
let timer = null, clockTimer = null, scrollTimer = null, rotTimer = null, liveTimer = null, rotElapsed = 0;
let vistosP3 = new Set();

/* ---------- leitura ---------- */
function slug() { return (typeof GUT_EMPRESA_SLUG !== 'undefined' && GUT_EMPRESA_SLUG) || 'gut'; }
async function rpc(ini, fim) {
  if (typeof GUT_SB === 'undefined' || !GUT_SB) throw new Error('Os painéis de TV funcionam no sistema web (/sistema).');
  const { data, error } = await GUT_SB.rpc('web_paineis_tv', { p_slug: slug(), p_inicio: ini, p_fim: fim });
  if (error) throw new Error(error.message || 'Falha ao ler o Supabase.');
  return preparar(data);
}
async function carregar() {
  const h = hojeSP();
  const ini = filters.inicio || h, fim = filters.fim || ini;
  const incluiHoje = ini <= h && h <= fim;
  const [a, b] = await Promise.all([rpc(ini, fim), incluiHoje ? null : rpc(h, h)]);
  DADOS = a; DADOS_HOJE = b || a;
}

/* ---------- contas ----------
 * Marcação (início e fim): meta = minutos reais ÷ tempo padrão; eficiência por apontamento, na hora.
 * Cupom ou apontamento direto: eficiência só no fim do dia = minutos entregues ÷ minutos disponíveis
 *   (jornada do funcionário, menos o tempo já cronometrado em marcação). A meta de cada apontamento
 *   é a quantidade × disponíveis ÷ entregues (as peças que sairiam a 100%). Hoje ainda não fechou:
 *   esses apontamentos entram no realizado e ficam "aguardando o fim do dia" na meta e na eficiência.
 */
function preparar(d) {
  d = d || {};
  const by = arr => new Map((arr || []).map(x => [String(x.id), x]));
  const out = {
    hoje: String(d.hoje || hojeSP()).slice(0, 10), limite: Number(d.limite_revisar) || 120,
    inicio: String(d.inicio || '').slice(0, 10), fim: String(d.fim || '').slice(0, 10),
    operadores: d.operadores || [], produtos: d.produtos || [], processos: d.processos || [], setores: d.setores || [],
    roteiro: d.roteiro || [], jornadas: d.jornadas || []
  };
  out.mOp = by(out.operadores); out.mProd = by(out.produtos); out.mProc = by(out.processos); out.mSet = by(out.setores);
  const jorn = new Map(out.jornadas.map(j => [j.operador + '|' + String(j.data).slice(0, 10), Number(j.disp) || 0]));
  const rows = (d.apontamentos || []).map(a => ({
    ...a, data: String(a.data).slice(0, 10), qtd: Number(a.qtd) || 0, tp: Number(a.tp) || 0,
    min_ent: Number(a.min_ent) || 0, min_real: Number(a.min_real) || 0,
    eff_exec: a.eff_exec == null || a.eff_exec === '' ? null : Number(a.eff_exec),
    meta: null, eff: null, pendente: false
  }));
  const grupos = new Map();
  for (const r of rows) {
    r.marc = r.metodo === 'MARCACAO' && r.min_real > 0;
    if (r.marc) {
      r.meta = r.tp > 0 ? r.min_real * 60 / r.tp : null;
      r.eff = r.eff_exec != null ? r.eff_exec : (r.min_real > 0 ? 100 * r.min_ent / r.min_real : null);
    }
    const k = r.operador + '|' + r.data;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  out.diaOp = new Map();
  for (const [k, lista] of grupos) {
    const [op, dia] = k.split('|');
    const disp = jorn.has(k) ? jorn.get(k) : Number(out.mOp.get(op)?.min_dia) || 540;
    const minMarc = lista.filter(r => r.marc).reduce((n, r) => n + r.min_real, 0);
    const outros = lista.filter(r => !r.marc);
    const entOutros = outros.reduce((n, r) => n + r.min_ent, 0);
    const resto = Math.max(0, disp - minMarc);
    const fechado = dia < out.hoje;
    for (const r of outros) {
      if (!fechado) { r.pendente = true; continue; }
      if (resto > 0 && entOutros > 0) { r.meta = r.qtd * resto / entOutros; r.eff = 100 * entOutros / resto; }
    }
    out.diaOp.set(k, { disp, ent: lista.reduce((n, r) => n + r.min_ent, 0), fechado });
  }
  for (const r of rows) r.revisar = r.eff != null && r.eff > out.limite;
  rows.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')) || String(b.id).localeCompare(String(a.id)));
  out.rows = rows;
  return out;
}
function sums(rows) {
  let real = 0, meta = 0, realMeta = 0, prontas = 0, pend = 0;
  for (const r of rows) {
    real += r.qtd;
    if (r.final) prontas += r.qtd;
    if (r.meta != null) { meta += r.meta; realMeta += r.qtd; } else if (r.pendente) pend += r.qtd;
  }
  return { real, meta, realMeta, prontas, pend, saldo: realMeta - meta, eff: meta > 0 ? 100 * realMeta / meta : null };
}
const nomeOp = (D, id) => D.mOp.get(String(id))?.nome || '—';
const nomeProd = (D, id) => D.mProd.get(String(id))?.nome || '—';
const nomeProc = (D, id) => D.mProc.get(String(id))?.nome || '—';
const passa = (r, f, todos) => (!f.inicio || r.data >= f.inicio) && (!f.fim || r.data <= f.fim) &&
  (!f.produto || r.produto === f.produto) && (!f.setor || r.setor === f.setor) &&
  (todos ? (!f.funcionario || r.operador === f.funcionario) && (!f.processo || r.processo === f.processo) : true);
const rowsFor = () => DADOS ? DADOS.rows.filter(r => passa(r, filters, true)) : [];
// Peças prontas usa o fluxo inteiro do produto: ignora os filtros de funcionário e processo
const rowsFlow = () => DADOS ? DADOS.rows.filter(r => passa(r, filters, false)) : [];

/* ---------- pedaços de tela ---------- */
function kpiBox(label, value, clsName, sub) {
  return `<article class="tvg-kpi ${clsName || ''}"><small>${label}</small><strong>${value}</strong>${sub ? `<span>${sub}</span>` : ''}</article>`;
}
function barChart(items, lines) {
  const max = Math.max(1, ...items.map(i => Math.max(i.value, i.marker || 0)), ...lines.map(l => l.value)) * 1.1;
  const h = v => Math.max(0, Math.min(100, v / max * 100));
  return `<div class="tvg-plot" style="--n:${items.length || 1}"><div class="tvg-area">
  ${lines.filter(l => l.value > 0).map(l => `<div class="tvg-line ${l.cls}" style="bottom:${h(l.value)}%"><em>${esc(l.label)}</em></div>`).join('')}
  <div class="tvg-bars">${items.map(i => `<div class="tvg-col"><div class="tvg-bar ${i.cls || ''}" style="height:${h(i.value)}%" title="${esc(i.title || '')}"><span>${esc(i.text ?? fmt(i.value))}</span></div>${i.marker > 0 ? `<b class="tvg-marker" style="bottom:${h(i.marker)}%" title="Meta ${fmt(i.marker)}"></b>` : ''}</div>`).join('')}</div></div>
  <div class="tvg-labels">${items.map(i => `<span title="${esc(i.label)}">${esc(i.label)}</span>`).join('')}</div></div>`;
}
function effCell(r) {
  if (r.pendente) return '<td class="tv-eff-num tv-wait">fim do dia</td>';
  return `<td class="tv-eff-num">${pct(r.eff)}${r.revisar ? ' <span class="tv-review" title="Eficiência acima do limite: revise o tempo padrão desta operação">revisar tempo</span>' : ''}</td>`;
}
function rowsHtml(D, rows, compacto) {
  if (!rows.length) return `<tr class="tv-empty"><td colspan="${compacto ? 8 : 10}">${compacto ? 'Nenhum lançamento hoje ainda.' : 'Nenhum apontamento nesse período. Altere os filtros para ver os dados.'}</td></tr>`;
  return rows.slice(0, compacto ? 60 : 400).map(r => {
    const novo = compacto && !vistosP3.has(r.id) && vistosP3.size ? ' tv-new' : '';
    return `<tr class="${r.pendente ? 'tv-neutral' : cls(r.eff)}${novo}">` +
      (compacto ? '' : `<td class="tv-nw" title="${esc(dateLabel(r.data))}">${esc(shortDate(r.data))}</td>`) +
      `<td class="tv-nw">${esc(r.hora || '—')}</td>` +
      `<td class="tv-product tv-text">${esc(nomeProd(D, r.produto))}</td>` +
      `<td class="tv-text">${esc(nomeOp(D, r.operador))}</td>` +
      `<td class="tv-text">${esc(nomeProc(D, r.processo))}${r.final ? ' <span class="tv-finish">FINAL</span>' : ''}</td>` +
      (compacto ? '' : `<td class="tv-nw">${esc(r.inicio || '—')}</td><td class="tv-nw">${esc(r.fim || '—')}</td>`) +
      `<td class="tv-nw">${r.meta == null ? '—' : fmt(r.meta)}</td><td class="tv-nw">${fmt(r.qtd)}</td>${effCell(r)}</tr>`;
  }).join('');
}
function ranking(D, rows, modoDia) {
  const map = new Map();
  for (const r of rows) {
    let x = map.get(r.operador);
    if (!x) { x = { id: r.operador, nome: nomeOp(D, r.operador), meta: 0, realMeta: 0, real: 0, pend: 0, ent: 0 }; map.set(r.operador, x); }
    x.real += r.qtd; x.ent += r.min_ent;
    if (r.meta != null) { x.meta += r.meta; x.realMeta += r.qtd; } else if (r.pendente) x.pend += r.qtd;
  }
  const lista = [...map.values()].map(x => {
    x.eff = x.meta > 0 ? 100 * x.realMeta / x.meta : null;
    if (modoDia) { const d = D.diaOp.get(x.id + '|' + D.hoje); x.disp = d ? d.disp : 0; x.doDia = x.disp > 0 ? 100 * x.ent / x.disp : null; }
    return x;
  }).sort((a, b) => (b.eff ?? -1) - (a.eff ?? -1) || (b.doDia ?? 0) - (a.doDia ?? 0) || b.real - a.real);
  if (!lista.length) return '<div class="tv-rank-empty">Sem funcionários com apontamentos ' + (modoDia ? 'hoje.' : 'no período.') + '</div>';
  return lista.map((v, i) => {
    let barra, num, sub;
    if (v.eff != null) {
      barra = `<i class="${cls(v.eff)}" style="width:${Math.max(2, Math.min(100, v.eff / 1.2))}%"></i>`;
      num = pct(v.eff);
      sub = `${fmt(v.real)} pç` + (v.pend ? ` · ${fmt(v.pend)} pç aguardando fim do dia` : '');
    } else {
      const p = modoDia ? v.doDia : null;
      barra = `<i class="tv-day" style="width:${p == null ? 0 : Math.max(2, Math.min(100, p))}%"></i>`;
      num = '—';
      sub = `${fmt(v.real)} pç · ${fmt(v.ent)} min` + (p != null ? ` de ${fmt(v.disp)} (${pct(p)} do dia)` : ' · fim do dia');
    }
    return `<div class="tv-rank-row"><div class="tv-rank-index">${i + 1}</div><div class="tv-rank-name"><b>${esc(v.nome)}</b><small>${sub}</small><span class="tv-rank-bar">${barra}</span></div><div class="tv-rank-eff ${cls(v.eff)}">${num}</div></div>`;
  }).join('');
}
function kpisProducao(rows, compacto) {
  const t = sums(rows);
  const pend = t.pend ? ` · ${fmt(t.pend)} pç no fim do dia` : '';
  return kpiBox('META', t.meta ? fmt(t.meta) : '—', '', 'peças previstas no período' + pend) +
    kpiBox('REALIZADO', fmt(t.real), 'tvg-yellow', 'peças apontadas') +
    kpiBox('PRONTAS', fmt(t.prontas), 'tvg-tv-good', 'saíram da operação final') +
    kpiBox('SALDO', t.meta ? (t.saldo > 0 ? '+' : '') + fmt(t.saldo) : '—', t.saldo < 0 ? 'tvg-tv-bad' : 'tvg-tv-good', 'realizado − meta') +
    kpiBox('EFICIÊNCIA', pct(t.eff), 'tvg-' + cls(t.eff), compacto ? '' : 'realizado ÷ meta');
}

/* ---------- painel 1: peças prontas ---------- */
function opStats(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.ordem != null ? 'o' + r.ordem : 'p' + r.processo;
    let o = m.get(k);
    if (!o) { o = { k, processo: r.processo, ordem: r.ordem, pecas: 0 }; m.set(k, o); }
    o.pecas += r.qtd;
  }
  return [...m.values()];
}
function panel1() {
  const D = DADOS, rows = rowsFlow(), all = sums(rows), finals = rows.filter(r => r.final), fin = sums(finals);
  const dias = [...new Set(rows.map(r => r.data))].sort();
  const porDia = dias.map(d => {
    const s = sums(finals.filter(r => r.data === d));
    const pend = s.pend > 0 && !s.meta;
    return { label: shortDate(d), value: s.real, marker: s.meta, text: fmt(s.real), cls: 'tvp-' + (pend ? 'tv-neutral' : cls(s.eff)),
      title: `${dateLabel(d)}: ${fmt(s.real)} prontas` + (s.meta ? ` de ${fmt(s.meta)} (${pct(s.eff)})` : ' · meta no fim do dia') };
  });
  const diasProntas = porDia.filter(x => x.value > 0).length;
  const mediaDia = diasProntas ? fin.real / diasProntas : 0;
  const prods = [...new Set(rows.map(r => r.produto))].map(id => {
    const pr = rows.filter(r => r.produto === id), f = sums(pr.filter(r => r.final));
    const temFinal = D.roteiro.some(x => x.produto === id && x.final);
    const st = opStats(pr), med = st.length ? st.reduce((n, o) => n + o.pecas, 0) / st.length : 0;
    const g = [...st].sort((a, b) => a.pecas - b.pecas)[0];
    return { id, nome: nomeProd(D, id), f, temFinal, g, perda: st.length > 1 && g ? med - g.pecas : 0 };
  }).sort((a, b) => b.f.real - a.f.real || a.nome.localeCompare(b.nome));
  return `<section class="tvg-kpis tvg-kpis5">
  ${kpiBox('PEÇAS PRONTAS', fmt(fin.real), 'tvg-yellow', 'passaram pela operação final')}
  ${kpiBox('META DE PRONTAS', fin.meta ? fmt(fin.meta) : '—', '', 'gerada pelo tempo padrão da operação final' + (fin.pend ? ` · ${fmt(fin.pend)} pç no fim do dia` : ''))}
  ${kpiBox('EFICIÊNCIA COLETIVA', pct(fin.eff), 'tvg-' + cls(fin.eff), 'prontas ÷ meta de prontas')}
  ${kpiBox('PRONTAS/DIA', fmt(mediaDia), 'tvg-yellow', diasProntas + ' dia(s) com peças prontas')}
  ${kpiBox('GLOBAL', pct(all.eff), 'tvg-' + cls(all.eff), 'todas as operações')}
 </section>
 <div class="tvg-grid"><section class="tvg-box"><div class="tv-panel-header"><div><b>PEÇAS PRONTAS POR DIA</b><small>Barra = prontas · traço branco = meta do dia · linha azul = média</small></div></div>
  ${porDia.length ? barChart(porDia, [{ value: mediaDia, label: `MÉDIA (${fmt(mediaDia)})`, cls: 'l-media' }]) : '<div class="tvg-empty tvg-empty-big">Sem produção no período. Ajuste os filtros.</div>'}
 </section><aside class="tvg-box tvg-side"><div class="tv-panel-header"><div><b>POR PRODUTO</b><small>Prontas, meta e onde está travando</small></div></div><div class="tvg-sug-list tv-autoscroll">
  ${prods.length ? prods.map(x => `<div class="tvp-prod"><div class="tvp-prod-top"><b>${esc(x.nome)}</b><span class="tvp-eff ${x.temFinal ? cls(x.f.eff) : 'tv-neutral'}">${x.temFinal ? pct(x.f.eff) : '—'}</span></div>
   ${x.temFinal ? `<div class="tvp-line"><span>Prontas</span><b>${fmt(x.f.real)}</b><span>de ${x.f.meta ? fmt(x.f.meta) : '—'}${x.f.pend ? ' (meta no fim do dia)' : ''}</span></div>` : '<div class="tvp-line warn">Cadastre a sequência operacional do produto</div>'}
   ${x.g && x.perda > 0 ? `<div class="tvp-line"><span>Gargalo</span><b>${esc(nomeProc(D, x.g.processo))}</b><span>−${fmt(x.perda)} pç vs média</span></div>` : ''}</div>`).join('')
    : '<div class="tvg-empty">Sem produção no período.</div>'}</div></aside></div>`;
}

/* ---------- painel 2: produção ---------- */
function panel2() {
  const D = DADOS, rows = rowsFor();
  return `<section class="tvg-kpis tvg-kpis5">${kpisProducao(rows)}</section>
 <div class="tv-content-grid"><section class="tv-table-box"><div class="tv-panel-header"><div><b>LANÇAMENTOS DE PRODUÇÃO</b><small>O mais recente em cima · a linha toma a cor da eficiência</small></div><span>${fmt(rows.length)} apontamento(s)</span></div>
 <div class="tv-table-scroll"><table class="tv-data-table"><thead><tr><th>DATA</th><th>HORA</th><th>PRODUTO</th><th>FUNCIONÁRIO</th><th>PROCESSO</th><th>INÍCIO</th><th>FIM</th><th>META</th><th>REALIZADO</th><th>EFICIÊNCIA</th></tr></thead><tbody>${rowsHtml(D, rows, false)}</tbody></table></div></section>
 <aside class="tv-ranking-box"><div class="tv-panel-header"><div><b>FUNCIONÁRIOS</b><small>Eficiência acumulada no período</small></div><span>${new Set(rows.map(r => r.operador)).size} pessoa(s)</span></div><div class="tv-ranking-scroll tv-autoscroll">${ranking(D, rows, false)}</div></aside></div>`;
}

/* ---------- painel 3: produção em tela cheia (hoje, sem filtros) ---------- */
function panel3() {
  const D = DADOS_HOJE; if (!D) return '';
  const rows = D.rows.filter(r => r.data === D.hoje);
  const html = `<section class="tvg-kpis tvg-kpis5 tv-compact">${kpisProducao(rows, true)}</section>
 <div class="tv-content-grid tv-p3-grid"><section class="tv-table-box"><div class="tv-panel-header"><div><b>LANÇAMENTOS DE HOJE</b><small>Os últimos chegam por cima</small></div><span>${fmt(rows.length)} apontamento(s)</span></div>
 <div class="tv-table-scroll"><table class="tv-data-table"><thead><tr><th>HORA</th><th>PRODUTO</th><th>FUNCIONÁRIO</th><th>PROCESSO</th><th>META</th><th>REALIZADO</th><th>EFICIÊNCIA</th></tr></thead><tbody>${rowsHtml(D, rows, true)}</tbody></table></div></section>
 <aside class="tv-ranking-box"><div class="tv-panel-header"><div><b>ACUMULADO DO DIA</b><small>Por funcionário</small></div><span>${new Set(rows.map(r => r.operador)).size} pessoa(s)</span></div><div class="tv-ranking-scroll tv-autoscroll">${ranking(D, rows, true)}</div></aside></div>`;
  vistosP3 = new Set(rows.map(r => r.id));
  return html;
}

/* ---------- moldura ---------- */
const GUT_MARK = '<svg viewBox="0 0 96 96" aria-hidden="true"><rect width="96" height="96" rx="22" fill="#F2D95E"/><path d="M68 34a24 24 0 1 0 4 22H50V44h34v6A36 36 0 1 1 78 26z" fill="#0B0C0F"/></svg>';
function options(arr, sel, all) {
  return `<option value="">${esc(all)}</option>` + (arr || []).filter(x => x.ativo !== false || String(x.id) === String(sel))
    .map(v => `<option value="${esc(v.id)}"${String(v.id) === String(sel) ? ' selected' : ''}>${esc(v.nome)}</option>`).join('');
}
function filterSummary() {
  const D = DADOS; if (!D) return '';
  const p = [filters.inicio === filters.fim ? dateLabel(filters.inicio) : shortDate(filters.inicio) + ' a ' + shortDate(filters.fim)];
  if (filters.funcionario) p.push(nomeOp(D, filters.funcionario));
  if (filters.produto) p.push(nomeProd(D, filters.produto));
  if (filters.processo) p.push(nomeProc(D, filters.processo));
  if (filters.setor) p.push(D.mSet.get(filters.setor)?.nome || '');
  return p.join(' · ');
}
function filterBar() {
  const D = DADOS || { operadores: [], produtos: [], processos: [], setores: [] };
  return `<label><span>DATA INICIAL</span><input type="date" id="tvInicio" value="${esc(filters.inicio)}"></label>
  <label><span>DATA FINAL</span><input type="date" id="tvFim" value="${esc(filters.fim)}"></label>
  <label><span>FUNCIONÁRIO</span><select id="tvFuncionario">${options(D.operadores, filters.funcionario, 'Todos os funcionários')}</select></label>
  <label><span>PRODUTO</span><select id="tvProduto">${options(D.produtos, filters.produto, 'Todos os produtos')}</select></label>
  <label><span>PROCESSO</span><select id="tvProcesso">${options(D.processos, filters.processo, 'Todas as operações')}</select></label>
  <label><span>SETOR</span><select id="tvSetor">${options(D.setores, filters.setor, 'Todos os setores')}</select></label>
  <button type="button" class="tv-reset" data-tv-action="reset">Limpar filtros</button>`;
}
function template() {
  return `<section id="tvWorkspace" class="tv-workspace${cfg.rotate ? ' tv-rotating' : ''}" data-panel="${cfg.panel}">
 <header class="tv-header"><div class="tv-brand"><div class="tv-fx">${GUT_MARK}<b>GUT</b></div><div class="tv-title"><span>PAINEL AO VIVO</span><h1 id="tvTitle"></h1></div></div>
 <div class="tv-header-actions"><span class="tv-filter-summary" id="tvFilterSummary"></span><span class="tv-live" id="tvLive"><span></span> ATUALIZAÇÃO AUTOMÁTICA · 15 S</span><span class="tv-clock" id="tvClock"></span>
 <button type="button" class="tv-button" data-tv-action="refresh">↻ Atualizar</button>
 <button type="button" class="tv-button" data-tv-action="fullscreen">⛶ Tela cheia</button>
 <button type="button" class="tv-button tv-button-close" data-tv-action="back">← Voltar</button></div></header>
 <section class="tv-panelbar"><div class="tv-panels">${PANELS.map(([n, l]) => `<button type="button" class="tv-panel-tab" data-tv-panel="${n}">${n}. ${l}</button>`).join('')}
 <label class="tv-rotate"><input type="checkbox" id="tvRotOn"${cfg.rotate ? ' checked' : ''}> RODÍZIO</label><label class="tv-rotate">A CADA <input type="number" id="tvRotSecs" min="10" max="600" step="5" value="${cfg.secs}"> S</label></div>
 <span class="tv-panel-now"><span id="tvPanelName"></span><span id="tvDots" class="tv-dots"></span></span><div class="tv-rot-track"><i id="tvRotBar"></i></div></section>
 <section class="tv-filterbar" id="tvFilterBar">${filterBar()}</section>
 <div class="tv-p" id="tvBody"><div class="tvg-empty tvg-empty-big">Carregando do Supabase…</div></div>
 <footer class="tv-bottom"><span>GUT PPCP • GESTÃO INDUSTRIAL</span><span id="tvFoot"></span><span id="tvLastSync">Sincronizando com o Supabase</span></footer></section>`;
}
const TITULOS = { 1: 'PEÇAS <em>PRONTAS</em>', 2: 'PRODUÇÃO <em>EFICIÊNCIAS</em>', 3: 'PRODUÇÃO <em>DO DIA</em>' };
const RODAPE = {
  1: 'Pronta = peça que passou pela operação final da sequência operacional · ignora os filtros de funcionário e processo',
  2: 'Até 80% vermelho · até 100% azul · acima de 100% verde · cupom e apontamento direto: eficiência no fim do dia',
  3: 'Hoje, sem filtros · marcação dá eficiência na hora · cupom e apontamento direto fecham no fim do dia'
};
function applyPanel() {
  const ws = $id('tvWorkspace'); if (!ws) return;
  ws.dataset.panel = String(cfg.panel);
  ws.querySelectorAll('[data-tv-panel]').forEach(b => b.classList.toggle('on', Number(b.dataset.tvPanel) === cfg.panel));
  const n = $id('tvPanelName'); if (n) n.textContent = (PANELS.find(p => p[0] === cfg.panel) || [])[1] || '';
  const dots = $id('tvDots'); if (dots) dots.innerHTML = PANELS.map(([k]) => `<i class="${k === cfg.panel ? 'on' : ''}"></i>`).join('');
  const t = $id('tvTitle'); if (t) t.innerHTML = TITULOS[cfg.panel];
  const f = $id('tvFoot'); if (f) f.textContent = RODAPE[cfg.panel];
  try { history.replaceState(null, '', '#tv' + cfg.panel); } catch (_) {}
}
function updateClock() { const c = $id('tvClock'); if (c) c.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function updateUi() {
  if (!active) return;
  const body = $id('tvBody');
  if (body && DADOS) {
    const sc = body.querySelector('.tv-autoscroll'), keep = sc ? sc.scrollTop : 0;
    body.innerHTML = cfg.panel === 1 ? panel1() : cfg.panel === 3 ? panel3() : panel2();
    const ns = body.querySelector('.tv-autoscroll'); if (ns) ns.scrollTop = keep;
  }
  const fs = $id('tvFilterSummary'); if (fs) fs.textContent = cfg.panel === 3 ? 'Hoje · ' + dateLabel(hojeSP()) : filterSummary();
  const s = $id('tvLastSync'); if (s) s.textContent = lastError || (lastUpdated ? 'Atualizado às ' + lastUpdated.toLocaleTimeString('pt-BR') : 'Sincronizando com o Supabase');
  const lv = $id('tvLive'); if (lv) lv.classList.toggle('tv-off', !!lastError);
  updateClock();
}
async function refresh() {
  if (!active || busy) return;
  if (document.visibilityState === 'hidden') { pendingLive = true; return; }
  busy = true; pendingLive = false;
  try { await carregar(); lastUpdated = new Date(); lastError = ''; }
  catch (e) { lastError = (e && e.message ? e.message + ' · ' : '') + 'nova tentativa em 15 s'; console.warn('[GUT TV]', e); }
  finally { busy = false; }
  updateUi();
  if (pendingLive) setTimeout(refresh, 300);
}

/* ---------- rodízio, rolagem automática, tela cheia ---------- */
function rotTick() {
  if (!active || !cfg.rotate) return;
  rotElapsed++;
  const bar = $id('tvRotBar'); if (bar) bar.style.width = Math.min(100, rotElapsed / cfg.secs * 100) + '%';
  if (rotElapsed >= cfg.secs) { rotElapsed = 0; cfg.panel = cfg.panel % PANELS.length + 1; saveCfg(); applyPanel(); updateUi(); }
}
function setRotation() {
  rotElapsed = 0; if (rotTimer) { clearInterval(rotTimer); rotTimer = null; }
  const bar = $id('tvRotBar'); if (bar) bar.style.width = '0%';
  const ws = $id('tvWorkspace'); if (ws) ws.classList.toggle('tv-rotating', !!cfg.rotate);
  if (cfg.rotate) rotTimer = setInterval(rotTick, 1000);
}
let scrollDir = 1, scrollPause = 60, scrollHold = false;
function autoScrollTick() {
  if (scrollHold) return;
  const box = document.querySelector('#tvBody .tv-autoscroll'); if (!box) return;
  const max = box.scrollHeight - box.clientHeight;
  if (max <= 2) { box.scrollTop = 0; return; }
  if (scrollPause > 0) { scrollPause--; return; }
  box.scrollTop = Math.max(0, Math.min(max, box.scrollTop + scrollDir));
  if (scrollDir > 0 && box.scrollTop >= max - 1) { scrollDir = -1; scrollPause = 80; }
  else if (scrollDir < 0 && box.scrollTop <= 0) { scrollDir = 1; scrollPause = 80; }
}
function setFull(on) {
  const el = $id('tvWorkspace'); if (!el) return;
  el.classList.toggle('tv-full', on);
  const b = el.querySelector('[data-tv-action=fullscreen]'); if (b) b.textContent = on ? '✕ Sair da tela cheia' : '⛶ Tela cheia';
}

/* ---------- abrir / fechar ---------- */
function abrir(n) {
  injectCss();
  if (n) cfg.panel = Math.max(1, Math.min(3, Number(n) || 2));
  saveCfg();
  let root = $id('gutTv');
  if (!root) { root = document.createElement('div'); root.id = 'gutTv'; document.body.appendChild(root); }
  root.innerHTML = template();
  document.body.classList.add('gut-tv-open');
  active = true; lastError = ''; vistosP3 = new Set();
  applyPanel(); updateUi(); setRotation();
  clearInterval(timer); clearInterval(clockTimer); clearInterval(scrollTimer);
  timer = setInterval(refresh, 15000);
  clockTimer = setInterval(updateClock, 1000);
  scrollDir = 1; scrollPause = 60; scrollTimer = setInterval(autoScrollTick, 50);
  refresh().then(() => { const fb = $id('tvFilterBar'); if (fb) fb.innerHTML = filterBar(); });
  if (n === 3 || cfg.panel === 3) setFull(true);
}
function fechar() {
  active = false;
  [timer, clockTimer, scrollTimer, rotTimer, liveTimer].forEach(t => t && clearInterval(t));
  timer = clockTimer = scrollTimer = rotTimer = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  const root = $id('gutTv'); if (root) root.remove();
  document.body.classList.remove('gut-tv-open');
  try { if (/^#tv\d/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
}
// chamado pelo canal ao vivo do sistema (wqAoVivo) quando o banco avisa que algo mudou
const TAB_VIVO = ['cupons_producao', 'apontamentos_producao', 'jornada_operador', 'roteiro_produto', 'cad_operadores', 'cad_produtos', 'cad_processos'];
function aviso(tabela) {
  if (!active) return;
  if (tabela && !TAB_VIVO.includes(tabela)) return;
  clearTimeout(liveTimer); liveTimer = setTimeout(refresh, 700); // junta várias gravações seguidas
}

/* ---------- eventos ---------- */
document.addEventListener('change', ev => {
  if (!active || !ev.target.closest?.('#gutTv')) return;
  const id = ev.target.id;
  if (id === 'tvRotOn') { cfg.rotate = ev.target.checked; saveCfg(); setRotation(); return; }
  if (id === 'tvRotSecs') { cfg.secs = Math.max(10, Math.min(600, Math.round(Number(ev.target.value) || 30))); ev.target.value = cfg.secs; saveCfg(); setRotation(); return; }
  const k = { tvInicio: 'inicio', tvFim: 'fim', tvFuncionario: 'funcionario', tvProduto: 'produto', tvProcesso: 'processo', tvSetor: 'setor' }[id];
  if (!k) return;
  filters[k] = ev.target.value;
  if (k === 'inicio' || k === 'fim') {
    if (!filters.inicio) filters.inicio = filters.fim || hojeSP();
    if (!filters.fim) filters.fim = filters.inicio;
    if (filters.inicio > filters.fim) { const t = filters.inicio; filters.inicio = filters.fim; filters.fim = t; $id('tvInicio').value = filters.inicio; $id('tvFim').value = filters.fim; }
    if (somaDias(filters.inicio, 92) < filters.fim) { filters.inicio = somaDias(filters.fim, -92); $id('tvInicio').value = filters.inicio; }
    refresh();
  } else updateUi();
});
document.addEventListener('click', ev => {
  if (!active) return;
  const pb = ev.target.closest('#gutTv [data-tv-panel]');
  if (pb) { cfg.panel = Number(pb.dataset.tvPanel); rotElapsed = 0; saveCfg(); applyPanel(); updateUi(); return; }
  const b = ev.target.closest('#gutTv [data-tv-action]'); if (!b) return;
  const a = b.dataset.tvAction;
  if (a === 'back') { fechar(); return; }
  if (a === 'refresh') { refresh(); return; }
  if (a === 'reset') { Object.assign(filters, filtrosPadrao()); const fb = $id('tvFilterBar'); if (fb) fb.innerHTML = filterBar(); refresh(); return; }
  if (a === 'fullscreen') {
    const el = $id('tvWorkspace');
    if (document.fullscreenElement) { document.exitFullscreen?.(); setFull(false); return; }
    if (el?.classList.contains('tv-full')) { setFull(false); return; }
    setFull(true); // modo TV mesmo em navegador de TV sem tela cheia
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => { if (active && !document.fullscreenElement && cfg.panel !== 3) setFull(false); });
document.addEventListener('pointerover', ev => { if (ev.target.closest?.('#gutTv .tv-autoscroll')) scrollHold = true; });
document.addEventListener('pointerout', ev => { if (ev.target.closest?.('#gutTv .tv-autoscroll') && !ev.relatedTarget?.closest?.('#gutTv .tv-autoscroll')) scrollHold = false; });
document.addEventListener('keydown', ev => {
  if (!active || ev.key !== 'Escape') return;
  const el = $id('tvWorkspace');
  if (document.fullscreenElement) { document.exitFullscreen?.(); setFull(false); }
  else if (el?.classList.contains('tv-full')) setFull(false);
  else fechar();
});
document.addEventListener('visibilitychange', () => { if (active && document.visibilityState === 'visible') refresh(); });

/* ---------- estilo (mesmo visual do Apontador de Produção) ---------- */
function injectCss() {
  if ($id('gutTvCss')) return;
  const st = document.createElement('style'); st.id = 'gutTvCss';
  st.textContent = `
body.gut-tv-open{overflow:hidden}
#gutTv{position:fixed;inset:0;z-index:9000;overflow:auto;background:#07090e}
#gutTv *{box-sizing:border-box}
.tv-workspace{font-family:'DM Sans',Inter,Arial,sans-serif;background:radial-gradient(ellipse at 0 0,#151a20 0,#0a0d13 48%,#07090e 100%);color:#ecf0ee;height:100vh;width:100%;padding:19px clamp(14px,1.5vw,30px) 12px;display:flex;flex-direction:column;gap:14px;overflow:hidden}
.tv-header{display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap;min-height:84px}
.tv-brand{display:flex;align-items:center;gap:22px;min-width:0}
.tv-brand .tv-fx{display:flex;align-items:center;gap:14px;flex:0 0 auto}
.tv-brand .tv-fx svg{width:clamp(46px,4.4vw,72px);height:auto}
.tv-brand .tv-fx b{font:800 clamp(26px,2.9vw,46px)/1 Manrope,Inter,Arial,sans-serif;letter-spacing:.8px;color:#fff}
.tv-title{border-left:1px solid #57552c;padding-left:21px;min-width:0}
.tv-title span{font-size:11px;letter-spacing:2.5px;font-weight:800;color:#9d9e72}
.tv-title h1{font-size:clamp(19px,2.3vw,36px);font-family:Manrope,Inter,Arial,sans-serif;font-weight:850;line-height:1.14;letter-spacing:-1px;color:#f2df68;margin:4px 0 0}
.tv-title em{font-style:normal;display:block}
.tv-header-actions{display:flex;gap:9px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.tv-filter-summary{display:none}
.tv-live{font-size:9px;letter-spacing:1px;color:#c8bf66;display:flex;align-items:center;gap:8px;font-weight:800}
.tv-live span{width:7px;height:7px;box-shadow:0 0 12px #78e9a2;border-radius:50%;background:#65dea2}
.tv-live.tv-off span{background:#ef5350;box-shadow:0 0 12px #ef5350}
.tv-clock{font-size:15px;font-weight:800;min-width:72px;text-align:center;color:#f3e58a;letter-spacing:.4px;font-variant-numeric:tabular-nums}
.tv-button,.tv-reset{background:#21232a;border:1px solid #8a8240;border-radius:7px;color:#eee69f;font-size:11px;font-weight:800;padding:9px 12px;min-height:34px;white-space:nowrap;cursor:pointer;font-family:inherit}
.tv-button:hover,.tv-reset:hover{background:#3e402c}
.tv-button-close{border-color:#5d5e5a;color:#d1d7d9}
.tv-filterbar{display:grid;grid-template-columns:repeat(2,minmax(133px,.92fr)) repeat(4,minmax(120px,1fr)) auto;gap:10px;align-items:end}
.tv-workspace[data-panel="3"] .tv-filterbar{display:none}
.tv-filterbar label{min-width:0;display:grid;gap:6px}
.tv-filterbar label span{display:block;font-size:9px;letter-spacing:1.4px;color:#d1c46f;font-weight:900;padding-left:2px}
.tv-filterbar input,.tv-filterbar select{color:#f4e5a0;background:#1b1d21;border:1px solid #9f9040;border-radius:8px;min-width:0;width:100%;height:40px;padding:0 10px;outline:none;font-size:12px;font-weight:700;color-scheme:dark;font-family:inherit}
.tv-filterbar select option{color:#fff;background:#22252d}
.tv-filterbar input:focus,.tv-filterbar select:focus{border-color:#fff0a1;box-shadow:0 0 0 2px #f3d45d26}
.tv-reset{height:40px}
.tv-p{display:flex;flex-direction:column;gap:14px;flex:1;min-height:0}
.tv-content-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(280px,1.2fr);gap:12px;min-height:320px;flex:1;overflow:hidden}
.tv-table-box,.tv-ranking-box{border:1.5px solid #b8a646;border-radius:11px;box-shadow:inset 0 0 0 2px #e2d35716;background:#0d1016;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.tv-panel-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;min-height:58px;background:#181a1f;border-bottom:1px solid #6f6430}
.tv-panel-header b{display:block;letter-spacing:.85px;color:#f6de6d;font-size:12px;font-weight:900}
.tv-panel-header small{display:block;font-size:10px;color:#9e9e94;margin-top:3px}
.tv-panel-header>span{color:#e8d979;font-size:11px;font-weight:800;white-space:nowrap}
.tv-table-scroll{overflow:auto;min-height:0;flex:1;scrollbar-color:#8e823a #191b1f;scrollbar-width:thin}
.tv-data-table{width:100%;border-collapse:separate;border-spacing:0;font-size:clamp(10px,.84vw,13px)}
.tv-data-table thead th{color:#f2d95f;background:#171a20;text-align:center;border-bottom:2px solid #a6963d;padding:12px 8px;white-space:nowrap;position:sticky;top:0;z-index:1;font-weight:900;letter-spacing:.5px}
.tv-data-table tbody tr{color:#f4f6f9}
.tv-data-table tbody td{border-bottom:1px solid #0f151e80;border-right:1px solid #0b101725;padding:10px 8px;text-align:center;line-height:1.22;font-weight:600}
.tv-data-table tbody tr.tv-good{background:#1e734a}.tv-data-table tbody tr.tv-good:nth-child(even){background:#24673e}
.tv-data-table tbody tr.tv-mid{background:#31549d}.tv-data-table tbody tr.tv-mid:nth-child(even){background:#28488b}
.tv-data-table tbody tr.tv-bad{background:#a12d30}.tv-data-table tbody tr.tv-bad:nth-child(even){background:#91292d}
.tv-data-table tbody tr.tv-neutral{background:#313941}.tv-data-table tbody tr.tv-neutral:nth-child(even){background:#2a3138}
.tv-data-table tbody tr:hover{filter:brightness(1.18)}
.tv-data-table tbody tr.tv-new{animation:tvNew 2.4s ease-out}
@keyframes tvNew{0%{box-shadow:inset 0 0 0 3px #f2d95e;filter:brightness(1.5)}100%{box-shadow:none;filter:none}}
.tv-data-table td.tv-nw{white-space:nowrap;width:1%;font-variant-numeric:tabular-nums}
.tv-data-table td.tv-text{white-space:normal;overflow-wrap:break-word;min-width:9ch}
.tv-data-table td.tv-product{text-transform:uppercase;font-weight:900;min-width:12ch}
.tv-data-table td.tv-eff-num{font-weight:900;font-size:1.02em;white-space:nowrap}
.tv-data-table td.tv-wait{font-size:.8em;font-weight:700;color:#cfd6dc;letter-spacing:.3px}
.tv-finish{display:inline-block;font-size:8px;font-weight:900;letter-spacing:.7px;color:#14553b;background:#b7f8bd;border-radius:3px;padding:2px 4px;margin-left:2px;white-space:nowrap}
.tv-review{display:inline-block;font-size:8px;font-weight:900;letter-spacing:.5px;color:#4a3500;background:#f2d95e;border-radius:3px;padding:2px 4px;margin-left:3px;white-space:nowrap;text-transform:uppercase}
.tv-data-table tr.tv-empty{background:#151a20}.tv-data-table tr.tv-empty td{padding:36px 20px;color:#d0c89a}
.tv-ranking-scroll{flex:1;min-height:0;overflow:auto;scrollbar-color:#8e823a #191b1f;scrollbar-width:thin}
.tv-rank-row{display:grid;grid-template-columns:25px minmax(0,1fr) auto;gap:8px;align-items:center;padding:11px 9px;border-bottom:1px solid #ffffff12;min-height:57px;background:linear-gradient(90deg,#202329,#181a20)}
.tv-rank-row:nth-child(even){background:linear-gradient(90deg,#191c21,#11161b)}
.tv-rank-index{font-size:12px;color:#cbbb61;font-weight:800;text-align:center}
.tv-rank-name{min-width:0}
.tv-rank-name b{display:block;font-size:13px;color:#e5ebee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-rank-name small{display:block;font-size:10px;color:#8fa0a9;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-rank-bar{display:block;height:5px;margin-top:7px;border-radius:9px;background:#ffffff14;overflow:hidden}
.tv-rank-bar i{display:block;height:100%;border-radius:9px;background:#c0c6cd}
.tv-rank-bar i.tv-good{background:#5fd39a}.tv-rank-bar i.tv-mid{background:#86a8f5}.tv-rank-bar i.tv-bad{background:#f07272}.tv-rank-bar i.tv-day{background:#f2d95e}
.tv-rank-eff{font-size:15px;font-weight:900;white-space:nowrap;font-variant-numeric:tabular-nums}
.tv-rank-eff.tv-good{color:#8fecbd}.tv-rank-eff.tv-mid{color:#b1caff}.tv-rank-eff.tv-bad{color:#ff9494}.tv-rank-eff.tv-neutral{color:#8a939b}
.tv-rank-empty{padding:20px;color:#ccc2a0;font-size:12px}
.tv-bottom{display:flex;align-items:center;justify-content:space-between;gap:13px;font-size:10px;color:#979c9c;padding:0 2px}
.tv-bottom span:first-child{color:#ead66c;font-weight:900}.tv-bottom span:last-child{color:#8fd8b1}
.tv-panelbar{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tv-panels{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tv-panel-tab{background:#14171c;border:1.5px solid #5c5428;color:#cfc9a0;border-radius:8px;padding:9px 14px;font:inherit;font-size:12px;font-weight:900;letter-spacing:.8px;cursor:pointer}
.tv-panel-tab.on{background:#f2d95e;border-color:#f2d95e;color:#111}
.tv-rotate{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:900;letter-spacing:.8px;color:#ded089;background:#14171c;border:1.5px solid #3c3a2a;border-radius:8px;padding:6px 10px;cursor:pointer}
.tv-rotate input[type=checkbox]{width:17px;height:17px;accent-color:#f2d95e}
.tv-rotate input[type=number]{width:62px;background:#0b0d11;border:1px solid #5c5428;color:#fff;border-radius:6px;padding:4px 6px;font:inherit;font-size:13px}
.tv-panel-now{display:none;align-items:center;gap:10px;font-weight:900;letter-spacing:1.2px;color:#f2d95e;font-size:clamp(12px,1vw,18px)}
.tv-dots{display:inline-flex;gap:6px}.tv-dots i{width:9px;height:9px;border-radius:50%;background:#4a4630}.tv-dots i.on{background:#f2d95e}
.tv-rot-track{display:none;position:absolute;left:0;right:0;bottom:-6px;height:3px;background:#22252a;border-radius:3px;overflow:hidden}
.tv-rot-track i{display:block;height:100%;width:0;background:#f2d95e;transition:width 1s linear}
.tv-rotating .tv-rot-track{display:block}
.tvg-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.tvg-kpis5{grid-template-columns:repeat(5,minmax(0,1fr))}
.tvg-kpi{display:flex;flex-direction:column;justify-content:center;gap:5px;padding:14px 18px;min-height:108px;background:linear-gradient(145deg,#22252a,#161a1f);border:2px solid #f2d95e;border-radius:11px;min-width:0}
.tvg-kpi small{color:#f2d95e;font-size:12px;letter-spacing:1.6px;font-weight:900}
.tvg-kpi strong{font-size:clamp(26px,3vw,52px);font-weight:800;line-height:1;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums;letter-spacing:-1px}
.tvg-kpi span{font-size:11px;color:#9ea9aa}
.tvg-kpi.tvg-yellow strong{color:#f2d95e}
.tvg-kpi.tvg-tv-good strong{color:#79ebad}.tvg-kpi.tvg-tv-mid strong{color:#9fbaf7}.tvg-kpi.tvg-tv-bad strong{color:#ff8984}
.tv-compact .tvg-kpi,.tv-full .tvg-kpi{flex-direction:row;align-items:center;justify-content:space-between;padding:8px 16px;min-height:0}
.tv-compact .tvg-kpi span,.tv-full .tvg-kpi span{display:none}
.tv-compact .tvg-kpi small,.tv-full .tvg-kpi small{font-size:clamp(11px,.85vw,15px)}
.tvg-grid{display:grid;grid-template-columns:minmax(0,2.6fr) minmax(280px,1fr);gap:12px;flex:1;min-height:340px}
.tvg-box{border:1.5px solid #b8a646;border-radius:11px;background:#07080b;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.tvg-plot{flex:1;min-height:0;display:flex;flex-direction:column;padding:34px 18px 10px}
.tvg-area{position:relative;flex:1;min-height:150px;border-bottom:2px solid #f2d95e}
.tvg-bars{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:clamp(4px,1vw,18px);align-items:end}
.tvg-col{position:relative;height:100%;display:flex;align-items:flex-end}
.tvg-bar{position:relative;width:100%;background:#f2d95e;border-radius:3px 3px 0 0;min-height:2px}
.tvg-bar span{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;font-weight:800;font-size:clamp(11px,1vw,20px);color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums}
.tvg-bar.tvp-tv-good{background:#5fd39a}.tvg-bar.tvp-tv-mid{background:#4f8cff}.tvg-bar.tvp-tv-bad{background:#ef5350}.tvg-bar.tvp-tv-neutral{background:#8a939b}
.tvg-marker{position:absolute;left:-4px;right:-4px;height:0;border-top:3px solid #fff;pointer-events:none;z-index:3}
.tvg-line{position:absolute;left:0;right:0;height:0;border-top:2px dashed;z-index:2;pointer-events:none}
.tvg-line em{position:absolute;right:0;bottom:2px;font-style:normal;font-size:clamp(9px,.75vw,13px);font-weight:900;letter-spacing:.6px;background:#07080bcc;padding:1px 5px;border-radius:3px;white-space:nowrap}
.tvg-line.l-media{border-color:#4f8cff}.tvg-line.l-media em{color:#8fb4ff}
.tvg-labels{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:clamp(4px,1vw,18px);padding-top:8px}
.tvg-labels span{font-size:clamp(9px,.8vw,14px);font-weight:700;color:#d8d3b0;text-align:center;overflow:hidden;white-space:nowrap}
.tvg-side{background:#0d1016}
.tvg-sug-list{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.tvg-empty{color:#9ea9aa;font-size:13px;padding:8px 4px;line-height:1.4}
.tvg-empty-big{display:grid;place-items:center;flex:1;font-size:16px;text-align:center;min-height:200px}
.tvp-prod{border:1px solid #3a3a2a;border-radius:10px;background:#14171c;padding:10px 12px}
.tvp-prod-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.tvp-prod-top b{font-size:clamp(14px,1.15vw,22px);color:#fff}
.tvp-eff{font-weight:800;font-size:clamp(18px,1.6vw,30px);font-variant-numeric:tabular-nums}
.tvp-eff.tv-good{color:#79ebad}.tvp-eff.tv-mid{color:#9fbaf7}.tvp-eff.tv-bad{color:#ff8984}.tvp-eff.tv-neutral{color:#9ea9aa}
.tvp-line{display:flex;gap:8px;align-items:baseline;font-size:clamp(11px,.85vw,15px);color:#9ea9aa;margin-top:4px;flex-wrap:wrap}
.tvp-line b{color:#f2d95e}.tvp-line.warn{color:#ffb36b}
/* tela cheia (TV) */
.tv-workspace.tv-full{height:100vh;padding:10px 16px;gap:10px}
.tv-full .tv-filterbar,.tv-full .tv-bottom,.tv-full .tv-panel-header small{display:none!important}
.tv-full .tv-header{min-height:0;flex-wrap:nowrap;gap:16px}
.tv-full .tv-brand .tv-fx svg{width:auto;height:clamp(36px,4.8vh,56px)}
.tv-full .tv-brand .tv-fx b{font-size:clamp(22px,2.2vw,38px)}
.tv-full .tv-title{padding-left:16px;display:flex;align-items:baseline;gap:12px}
.tv-full .tv-title span{display:none}
.tv-full .tv-title h1{margin:0;font-size:clamp(20px,2.1vw,38px);white-space:nowrap}
.tv-full .tv-title em{display:inline}
.tv-full .tv-header-actions{gap:14px;flex-wrap:nowrap}
.tv-full .tv-filter-summary{display:inline;font-size:clamp(11px,.9vw,15px);color:#c9c48f;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:32vw}
.tv-full .tv-clock{font-size:clamp(16px,1.5vw,26px)}
.tv-full .tv-button:not([data-tv-action=fullscreen]){display:none}
.tv-full [data-tv-action=fullscreen]{opacity:0;transition:opacity .2s}
.tv-full .tv-header:hover [data-tv-action=fullscreen],.tv-full [data-tv-action=fullscreen]:focus-visible{opacity:1}
.tv-full .tv-p{gap:10px}
.tv-full .tvg-kpi strong{font-size:clamp(26px,2.6vw,50px)}
.tv-full .tv-content-grid{grid-template-columns:minmax(0,2.4fr) minmax(320px,1.35fr)}
.tv-full .tv-data-table{font-size:clamp(12px,.95vw,17px)}
.tv-full .tv-rank-row{grid-template-columns:clamp(28px,2.2vw,42px) minmax(0,1fr) auto;gap:12px;padding:clamp(9px,1.1vh,16px) 14px;min-height:0}
.tv-full .tv-rank-index{font-size:clamp(14px,1.2vw,22px)}
.tv-full .tv-rank-name b{font-size:clamp(16px,1.45vw,28px)}
.tv-full .tv-rank-name small{font-size:clamp(10px,.8vw,14px)}
.tv-full .tv-rank-eff{font-size:clamp(22px,2.1vw,40px)}
.tv-full .tv-panel-header b{font-size:clamp(12px,.95vw,17px)}
.tv-full .tvg-grid{min-height:0}
.tv-full .tv-panelbar{justify-content:flex-end;margin-top:-4px}
.tv-full .tv-panels{display:none}
.tv-full .tv-panel-now{display:inline-flex}
.tv-full .tv-panelbar:hover .tv-panels{display:flex}
.tv-full .tv-panelbar:hover .tv-panel-now{display:none}
@media(max-width:1400px){.tv-filterbar{grid-template-columns:repeat(4,minmax(0,1fr))}.tvg-kpi{min-height:90px;padding:12px}}
@media(max-width:1100px){.tvg-grid{grid-template-columns:minmax(0,1fr)}.tvg-kpis,.tvg-kpis5{grid-template-columns:repeat(2,minmax(0,1fr))}.tvg-plot{min-height:340px}}
@media(max-width:940px){.tv-workspace{overflow:visible;height:auto;min-height:100vh}.tv-content-grid{grid-template-columns:minmax(0,1fr);overflow:visible}.tv-table-box{min-height:310px;max-height:60vh}.tv-ranking-box{min-height:220px;max-height:360px}.tv-filterbar{grid-template-columns:repeat(2,minmax(0,1fr))}.tv-header-actions{width:100%;justify-content:flex-start}.tv-bottom{flex-wrap:wrap}}
@media(max-width:560px){.tv-data-table{min-width:820px}.tv-title h1{font-size:17px}.tv-panel-tab{padding:7px 9px;font-size:11px}}
/* botões grandes no Dashboard */
.tv-launch-wrap{margin-bottom:16px}
.tv-launch{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.tv-launch-btn{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:150px;padding:20px 22px;border-radius:16px;border:2px solid #f2d95e;background:radial-gradient(ellipse at 0 0,#1b2027 0,#0b0e13 70%);color:#fff;text-align:left;cursor:pointer;font-family:inherit;box-shadow:0 12px 30px rgba(15,23,42,.18);transition:transform .15s,box-shadow .15s}
.tv-launch-btn:hover{transform:translateY(-2px);box-shadow:0 18px 36px rgba(15,23,42,.28)}
.tv-launch-btn .tv-n{width:34px;height:34px;border-radius:9px;background:#f2d95e;color:#111;display:grid;place-items:center;font-weight:900;font-size:17px}
.tv-launch-btn b{font-size:20px;font-weight:900;letter-spacing:-.3px;color:#f2d95e}
.tv-launch-btn small{font-size:12px;color:#aeb6bd;line-height:1.35}
.tv-launch-btn em{position:absolute;right:16px;top:18px;font-style:normal;font-size:10px;font-weight:900;letter-spacing:1px;color:#65dea2}
.tv-launch-btn[disabled]{opacity:.45;cursor:not-allowed;border-color:#5c5428;transform:none}
.tv-launch-btn[disabled] b{color:#cfc9a0}
`;
  document.head.appendChild(st);
}

injectCss();
window.GUT_TV = { abrir, fechar, aviso, refresh, _preparar: preparar, _sums: sums };
})();
