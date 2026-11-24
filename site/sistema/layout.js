/* GUT PPCP — Layout da fábrica (planta baixa) — v4.31
   Ambiente em metros, grade para encaixar, máquinas do cadastro e blocos livres, cotas entre itens
   (reta e em "L", base para o diagrama de espaguete) e a ocupação de hoje de cada máquina (mesma conta do painel Capacidade). */
(function () {
  const L = { lista: [], atual: null, sel: null, modo: 'MOVER', cotaA: null, zoom: 1, sujo: false, salvando: false, timer: 0, carregado: false, arr: null, hist: [], cheia: false, semPal: false, semProp: false, fluxo: true };
  const LOTE_W = 1, LOTE_H = 0.6;
  const CEL = [0.25, 0.5, 1];
  const BLOCOS = [
    { tipo: 'MESA', nome: 'Mesa de corte', w: 6, h: 1.8 },
    { tipo: 'BANCADA', nome: 'Bancada', w: 2, h: 0.8 },
    { tipo: 'ESTOQUE', nome: 'Estoque / pallet', w: 1.2, h: 1 },
    { tipo: 'CORREDOR', nome: 'Corredor', w: 1.2, h: 6 },
    { tipo: 'PAREDE', nome: 'Parede / coluna', w: 0.3, h: 3 },
    { tipo: 'AREA', nome: 'Área livre', w: 3, h: 3 }
  ];
  const MAQ_W = 1.2, MAQ_H = 0.6;
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const x = Number(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const fm = v => r2(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const web = () => typeof GUT_SB !== 'undefined' && GUT_SB && typeof GUT_EMPRESA_SLUG !== 'undefined' && GUT_EMPRESA_SLUG;
  const novoDados = () => ({ largura: 20, comprimento: 12, celula: 0.5, itens: [], cotas: [] });
  const D = () => L.atual && L.atual.dados;

  /* ---------- dados ---------- */
  async function carregar() {
    if (!web()) { L.lista = [{ id: '', nome: 'Ambiente', dados: novoDados() }]; L.atual = L.lista[0]; L.carregado = true; return; }
    const { data, error } = await GUT_SB.rpc('web_layout_ler', { p_slug: GUT_EMPRESA_SLUG });
    if (error) throw new Error(error.message);
    L.lista = (data || []).map(x => ({ id: x.id, nome: x.nome, dados: Object.assign(novoDados(), x.dados || {}) }));
    if (!L.lista.length) L.lista = [{ id: '', nome: 'Salão de costura', dados: novoDados() }];
    const keep = L.atual && L.lista.find(x => x.id === L.atual.id);
    L.atual = keep || L.lista[0]; L.carregado = true;
  }
  function mudou(redesenhar = true) {
    L.sujo = true; status(); clearTimeout(L.tAn); L.tAn = setTimeout(() => { analisar(); desenhar(); }, 250); if (redesenhar) desenhar();
    clearTimeout(L.timer); L.timer = setTimeout(salvar, 1200);
  }
  function snapshot() { L.hist.push(JSON.stringify(D())); if (L.hist.length > 40) L.hist.shift(); }
  async function salvar() {
    if (!L.sujo || L.salvando || !L.atual) return;
    if (!web()) { L.sujo = false; status(); return; }
    L.salvando = true; status();
    try {
      const { data, error } = await GUT_SB.rpc('web_layout_salvar', { p_slug: GUT_EMPRESA_SLUG, p_id: L.atual.id || '', p_nome: L.atual.nome, p_dados: D() });
      if (error) throw new Error(error.message);
      L.atual.id = data.id; L.sujo = false;
    } catch (e) { (window.toast || alert)('Não foi possível salvar o layout: ' + e.message, true); }
    finally { L.salvando = false; status(); preencherAmbientes(); }
  }
  function status() {
    const s = $('layStatus'); if (!s) return;
    s.textContent = L.salvando ? 'Salvando…' : L.sujo ? 'Alterações a salvar' : 'Salvo';
    s.className = 'lay-status ' + (L.salvando || L.sujo ? 'pend' : 'ok');
  }

  /* ---------- ocupação (mesma conta do painel Capacidade) ---------- */
  function ocupacao() {
    const m = new Map();
    try { if (typeof computeMachineLoad === 'function') computeMachineLoad().forEach(x => m.set(String(x.id), x)); } catch (e) {}
    return m;
  }
  /* carga da máquina física pelo posto: processos alocados (ou em marcação) à costureira ligada à máquina, no tipo daquela máquina */
  function oeeTabela() {
    const d = D(); if (!d) return ''; const lin = d.itens.filter(i => i.tipo === 'MAQ' && i.uni).map(i => ({ i, r: oeeDe(i) })).filter(x => x.r && !x.r.vazio).sort((a, b) => a.r.oee - b.r.oee);
    if (!lin.length) return `<div class="lay-h">OEE das máquinas hoje</div><p class="hint">Ainda sem registros hoje. No app de campo, a costureira bipa a etiqueta da máquina dela; daí as operações concluídas, as paradas ("Máquina parou") e as peças com defeito entram aqui.</p>`;
    return `<div class="lay-h">OEE das máquinas hoje (piores primeiro)</div><div class="lay-mx-wrap"><table class="lay-oeet"><thead><tr><th>Máquina</th><th>Costureira</th><th>Disponib.</th><th>Desempenho</th><th>Qualidade</th><th>OEE</th><th>Paradas</th></tr></thead><tbody>${lin.map(({ i, r }) => `<tr><td><b>${esc(i.nome)}</b>${r.o.parada_aberta ? ' <span class="badge-par">parada</span>' : ''}</td><td>${esc(String(r.o.operador || '—').split(/\s+/)[0])}</td><td>${pctTxt(r.D)}</td><td>${pctTxt(r.P)}</td><td>${pctTxt(r.Q)}</td><td><b class="oee-${classeOee(r.oee)}">${pctTxt(r.oee)}</b></td><td>${Object.entries(r.o.motivos || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m, v]) => `${esc(m)} ${Math.round(v)}′`).join(', ') || '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function oeeHtml(it) {
    if (!it.uni) return '';
    const r = oeeDe(it); if (!r) return '';
    const o = r.o, mot = Object.entries(o.motivos || {}).sort((a, b) => b[1] - a[1]);
    if (r.vazio) return `<div class="lay-oee vazio"><b>OEE de hoje</b><span>Sem registros ainda. Quando a costureira bipar esta máquina no app de campo, as operações, paradas e defeitos entram aqui.</span></div>`;
    return `<div class="lay-oee ${classeOee(r.oee)}"><div class="t"><b>OEE de hoje</b><strong>${pctTxt(r.oee)}</strong></div>
      <div class="f"><span>Disponibilidade <b>${pctTxt(r.D)}</b></span><span>Desempenho <b>${pctTxt(r.P)}</b></span><span>Qualidade <b>${pctTxt(r.Q)}</b></span></div>
      <small>${Math.round(r.plan)} min de turno até agora • ${Math.round(r.parada)} min parada${o.parada_aberta ? ' (parada agora)' : ''} • ${Math.round(Number(o.minutos_padrao))} min padrão produzidos • ${Number(o.pecas) || 0} peças • ${Number(o.defeitos) || 0} com defeito</small>
      ${mot.length ? `<small>Paradas: ${mot.map(([m, v]) => `${esc(m)} ${Math.round(v)} min`).join(' • ')}</small>` : ''}</div>`;
  }
  function postoCarga(it) {
    const rows = (typeof STATE !== 'undefined' && STATE.internalBoard && STATE.internalBoard.rows) || [], o = ocupacao().get(it.maq || '') || {}, cap = Number(o.day) || 420;
    let load = 0, ops = 0, feitoHoje = 0; const hoje = new Date().toISOString().slice(0, 10);
    rows.forEach(v => (v.OPERACOES || []).forEach(op => {
      const quem = String(op.ID_OPERADOR_MARCACAO || op.ID_OPERADOR_ALOCADO || op.ID_OPERADOR_BIPAGEM || ''); if (quem !== String(opDoItem(it))) return;
      const tipo = String(op.ID_MAQUINA || ''); if (tipo && tipo !== String(it.maq)) return;
      const feito = /CONCLU|FINAL/.test(String(op.STATUS_CUPOM || '')), min = Number(op.MINUTOS_PADRAO_TOTAL) || 0;
      if (feito) { const fim = String(op.DATA_HORA_FIM_MARCACAO || op.DATA_HORA_BIPAGEM || op.ATUALIZADO_EM || ''); if (fim.slice(0, 10) === hoje) feitoHoje += min; } else { load += min; ops++; }
    }));
    const agora = new Date(), ini = new Date(agora); ini.setHours(7, 0, 0, 0); const decorrido = Math.max(0, Math.min(cap, (agora - ini) / 60000));
    return { load, ops, cap, pct: cap ? load / cap * 100 : 0, feitoHoje, efic: decorrido > 30 && feitoHoje ? feitoHoje / decorrido * 100 : null };
  }
  const classe = p => (!isFinite(p) || p > 100) ? 'over' : p >= 80 ? 'high' : p > 0 ? 'ok' : 'idle';
  function maquinas() {
    return (typeof STATE !== 'undefined' && STATE.cad && STATE.cad.maquinas || [])
      .filter(m => !['FALSE', '0', 'NAO', 'NÃO', 'INATIVO'].includes(String(m.ATIVO ?? '').toUpperCase()))
      .map(m => ({ id: String(m.ID_MAQUINA), nome: m.MAQUINA || m.NOME_MAQUINA || m.DESCRICAO || ('Máquina ' + m.ID_MAQUINA), total: Math.max(0, Math.floor(num(m.QTD_TOTAL))) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  const unis = () => (window.gutCrachas && gutCrachas.unidades && window.GUT_UNI_CACHE) || [];
  const unisTipo = id => unis().filter(u => String(u.maq) === String(id) && u.ativo !== false);
  /* postos (costureira na máquina) e OEE do dia, vindos do banco */
  const P = { postos: new Map(), oee: new Map(), quando: 0, cor: 'OCUPACAO' };
  async function carregarPostos(forcar) {
    if (!web() || (!forcar && Date.now() - P.quando < 20000)) return; P.quando = Date.now();
    try {
      const [a, b] = await Promise.all([GUT_SB.rpc('web_postos_ler', { p_slug: GUT_EMPRESA_SLUG }), GUT_SB.rpc('web_oee', { p_slug: GUT_EMPRESA_SLUG, p_dia: (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date()) })]);
      if (!a.error) P.postos = new Map((a.data || []).map(x => [x.id_unidade, x]));
      if (!b.error) P.oee = new Map((b.data || []).map(x => [x.id_unidade, x]));
    } catch (e) {}
  }
  /* costureira do posto: a do banco (bipada no app de campo ou aqui) vale mais que a guardada no desenho */
  const opDoItem = it => (it.uni && P.postos.get(it.uni) && P.postos.get(it.uni).id_operador) || it.op || '';
  const INICIO_TURNO_MIN = 7 * 60;
  function oeeDe(it) {
    const o = it.uni && P.oee.get(it.uni); if (!o) return null;
    const occ = ocupacao().get(it.maq || '') || {}, dia = Number(occ.day) || 420, agora = new Date(), passou = agora.getHours() * 60 + agora.getMinutes() - INICIO_TURNO_MIN;
    const plan = Math.max(0, Math.min(dia, passou)), parada = Math.min(plan, Number(o.parada_min) || 0), operando = plan - parada;
    const temDado = Number(o.minutos_padrao) > 0 || Number(o.parada_min) > 0 || Number(o.defeitos) > 0; if (!temDado || plan < 15) return { vazio: true, o };
    const D1 = plan ? operando / plan : 0, P1 = operando > 0 ? Math.min(1.5, Number(o.minutos_padrao) / operando) : 0, pc = Number(o.pecas) || 0, Q1 = pc ? Math.max(0, (pc - (Number(o.defeitos) || 0)) / pc) : (Number(o.defeitos) ? 0 : 1);
    return { o, plan, parada, D: D1, P: P1, Q: Q1, oee: D1 * Math.min(1, P1) * Q1 };
  }
  const pctTxt = v => Math.round(v * 100) + '%';
  const classeOee = v => v >= 0.85 ? 'ok' : v >= 0.6 ? 'high' : 'over';
  async function carregarUnidades() { try { window.GUT_UNI_CACHE = await gutCrachas.unidades(); } catch (e) { window.GUT_UNI_CACHE = window.GUT_UNI_CACHE || []; } }
  document.addEventListener('gut-unidades', () => { carregarUnidades().then(() => { if (visivel()) { paleta(); desenhar(); props(); } }); });
  function operadorNome(id) { try { const o = (STATE.cad.operadores || []).find(x => String(x.ID_OPERADOR) === String(id)); return o ? String(o.NOME || '').trim() : ''; } catch (e) { return ''; } }
  function caixas() {
    const rows = (typeof STATE !== 'undefined' && STATE.internalBoard && STATE.internalBoard.rows) || [];
    return rows.map(v => {
      const prox = v.OPERACAO_ATUAL || v.PROXIMA_OPERACAO || null, p = Number(v.PROGRESSO_PCT) || 0;
      return { id: String(v.ID_VOLUME), cod: v.COD_VOLUME_EXIBICAO || v.COD_VOLUME || v.ID_VOLUME, prod: v.PRODUTO || '', cor: [v.COR, v.TAMANHO].filter(Boolean).join(' / '), qtd: Number(v.QTD_VOLUME) || 0, pct: p,
        op: prox ? (prox.PROCESSO || '') : '', opMaq: prox ? String(prox.ID_MAQUINA || '') : '', opMaqNome: prox ? (prox.MAQUINA || '') : '', ativa: !!(v.OPERACAO_ATUAL && v.OPERACAO_ATUAL.STATUS_CUPOM === 'EM_PRODUCAO'), feito: p >= 100 };
    }).sort((a, b) => String(a.cod).localeCompare(String(b.cod), 'pt-BR', { numeric: true }));
  }
  const mapaCaixas = () => new Map(caixas().map(c => [c.id, c]));
  /* lote → unidade mais próxima do tipo de máquina da próxima operação */
  function fluxos() {
    const d = D(), cx = mapaCaixas(), out = [];
    d.itens.filter(i => i.tipo === 'LOTE').forEach(l => {
      const c = cx.get(l.vol); if (!c || !c.opMaq || c.feito) return;
      const lx = l.x + l.w / 2, ly = l.y + l.h / 2;
      const alvo = d.itens.filter(i => i.tipo === 'MAQ' && i.maq === c.opMaq).map(m => ({ m, dist: Math.hypot(m.x + m.w / 2 - lx, m.y + m.h / 2 - ly) })).sort((a, b) => a.dist - b.dist)[0];
      out.push({ l, c, alvo: alvo ? alvo.m : null, dist: alvo ? alvo.dist : 0, lx, ly });
    });
    return out;
  }

  /* ---------- tela ---------- */
  function montar() {
    const root = $('layoutRoot'); if (!root) return;
    root.innerHTML = `
    <div class="page-head"><div><h3>Layout da fábrica</h3><p>Monte a planta baixa em metros, posicione as máquinas e meça as distâncias. A cor de cada máquina é a ocupação de hoje.</p></div></div>
    <div class="card lay-bar">
      <button class="btn btn-primary btn-sm lay-wiz-btn" type="button" onclick="gutLayout.wizard()" title="O sistema monta a planta com as suas máquinas e o roteiro dos produtos">🏭 Montar planta</button>
      <label class="lay-f"><span>Ambiente</span><select id="layAmb" onchange="gutLayout.trocar(this.value)"></select></label>
      <button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.novo()">+ Novo ambiente</button>
      <label class="lay-f"><span>Nome</span><input id="layNome" maxlength="60" oninput="gutLayout.campo('nome',this.value)"></label>
      <label class="lay-f lay-n"><span>Largura (m)</span><input id="layLarg" inputmode="decimal" onchange="gutLayout.campo('largura',this.value)"></label>
      <label class="lay-f lay-n"><span>Comprimento (m)</span><input id="layComp" inputmode="decimal" onchange="gutLayout.campo('comprimento',this.value)"></label>
      <label class="lay-f lay-n"><span>Grade</span><select id="layCel" onchange="gutLayout.campo('celula',this.value)">${CEL.map(c => `<option value="${c}">${fm(c).replace(',00', '')} m</option>`).join('')}</select></label>
      <span class="lay-area" id="layArea"></span>
      <div class="lay-grow"></div>
      <div class="seg" role="group" aria-label="Ferramenta"><button type="button" data-lm="MOVER" onclick="gutLayout.modo('MOVER')" title="Arrastar e selecionar (atalho V)">Mover</button><button type="button" data-lm="COTA" onclick="gutLayout.modo('COTA')" title="Medir: toque num item e depois em outro (atalho C)">Cota</button></div>
      <div class="seg" role="group" aria-label="Zoom"><button type="button" onclick="gutLayout.zoom(-1)" title="Diminuir">−</button><button type="button" onclick="gutLayout.zoom(0)" title="Caber na tela">Ajustar</button><button type="button" onclick="gutLayout.zoom(1)" title="Aumentar">+</button></div>
      <button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.desfazer()" title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
      <label class="lay-scan" title="Bipe a etiqueta da máquina e depois as caixas que estão ao lado dela (também aceita o crachá do funcionário)"><span>📟</span><input id="layScan" placeholder="Bipar máquina, caixa ou crachá" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();gutLayout.bipar(this.value);this.value=''}"></label>
      ${'BarcodeDetector' in window ? '<button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.camera()" title="Ler QR pela câmera">📷</button>' : ''}
      <button class="btn btn-secondary btn-sm lay-only-full" type="button" id="layPalBtn" onclick="gutLayout.lado('pal')" title="Mostrar ou esconder a lista de máquinas e lotes">◧ Lista</button>
      <button class="btn btn-secondary btn-sm lay-only-full" type="button" id="layPropBtn" onclick="gutLayout.lado('prop')" title="Mostrar ou esconder os detalhes e as cotas">◨ Detalhes</button>
      <label class="lay-f lay-n" title="O que a cor de cada máquina mostra"><span>Cor das máquinas</span><select onchange="gutLayout.cor(this.value)"><option value="OCUPACAO">Ocupação</option><option value="OEE">OEE de hoje</option></select></label>
      <label class="lay-chk" title="Liga cada lote à máquina da próxima operação dele"><input type="checkbox" id="layFluxo" onchange="gutLayout.fluxo(this.checked)" checked> Fluxo dos lotes</label>
      <button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.soPlanta(true)" title="Tela cheia só com a planta, sem botões nem listas (tecla P)">▣ Só a planta</button>
      <button class="btn btn-dark btn-sm" type="button" id="layFullBtn" onclick="gutLayout.cheia()" title="Abrir a planta em tela cheia (Esc volta)">⛶ Tela cheia</button>
      <span id="layStatus" class="lay-status ok">Salvo</span>
    </div>
    <div class="lay-body">
      <aside class="card lay-side" id="layPal"></aside>
      <div class="card lay-canvas" id="layWrap"><svg id="laySvg" xmlns="http://www.w3.org/2000/svg"></svg><div class="lay-vazio" id="layVazio" hidden><b>Planta vazia</b><span>Monte em um clique a partir das suas máquinas e dos roteiros dos produtos, ou arraste as máquinas da lista.</span><button class="btn btn-primary" type="button" onclick="gutLayout.wizard()">🏭 Montar planta pela produção</button></div><div class="lay-hint" id="layHint"></div><div class="lay-float"><button type="button" onclick="gutLayout.zoom(-1)" title="Diminuir">−</button><button type="button" onclick="gutLayout.zoom(0)" title="Caber na tela">Ajustar</button><button type="button" onclick="gutLayout.zoom(1)" title="Aumentar">+</button><button type="button" class="sai" onclick="gutLayout.soPlanta(false)" title="Mostrar os controles (Esc)">✕ Mostrar controles</button></div></div>
      <aside class="card lay-side" id="layProp"></aside>
    </div>
    <section class="card lay-an" id="layAn"></section>`;
    preencherAmbientes(); campos(); paleta(); desenhar(); props(); modo(L.modo, true); bindSvg(); analisar();
  }
  function preencherAmbientes() {
    const s = $('layAmb'); if (!s) return;
    s.innerHTML = L.lista.map((x, i) => `<option value="${i}" ${x === L.atual ? 'selected' : ''}>${esc(x.nome)}${x.id ? '' : ' (novo)'}</option>`).join('');
  }
  function campos() {
    const d = D(); if (!d) return;
    $('layNome').value = L.atual.nome; $('layLarg').value = fm(d.largura); $('layComp').value = fm(d.comprimento); $('layCel').value = String(d.celula);
    $('layArea').innerHTML = `<b>${fm(d.largura * d.comprimento)} m²</b> de área`;
  }
  function paleta() {
    const el = $('layPal'); if (!el) return; const d = D(), occ = ocupacao();
    const usados = new Map(); d.itens.filter(i => i.tipo === 'MAQ').forEach(i => usados.set(i.maq, (usados.get(i.maq) || 0) + 1));
    const mq = maquinas(), cxs = caixas(), cxm = new Map(cxs.map(c => [c.id, c])), lotes = d.itens.filter(i => i.tipo === 'LOTE'), noPlano = new Set(lotes.map(i => i.vol)), fora = lotes.filter(i => !cxm.has(i.vol)).length;
    el.innerHTML = `<div class="lay-h">Máquinas do cadastro</div>
      ${mq.length ? mq.map(m => { const u = usados.get(m.id) || 0, o = occ.get(m.id), p = o ? o.pct : 0, nu = unisTipo(m.id).length; m = Object.assign({}, m, { total: nu || m.total }); return `<button type="button" class="lay-pal" draggable="true" data-add="MAQ" data-maq="${esc(m.id)}" onclick="gutLayout.adicionar('MAQ','${esc(m.id)}')" title="Clique ou arraste para a planta">
        <i class="lay-dot ${classe(p)}"></i><span><b>${esc(m.nome)}</b><small>${u} de ${m.total} na planta${nu ? '' : ' • sem numeração'}${o && o.cap ? ` • ${isFinite(p) ? Math.round(p) : '>999'}% hoje` : ''}</small></span>${u >= m.total && m.total ? '<em>✓</em>' : ''}</button>`; }).join('') : '<p class="hint">Cadastre as máquinas em Cadastros › Máquinas.</p>'}
      <div class="lay-h">Lotes em produção (${cxs.length})</div>
      ${cxs.length ? cxs.map(c => { const na = noPlano.has(c.id); return `<button type="button" class="lay-pal lay-pal-lote ${c.feito ? 'feito' : ''}" draggable="true" data-add="LOTE" data-vol="${esc(c.id)}" onclick="gutLayout.adicionar('LOTE','${esc(c.id)}')" title="${esc(c.prod)} ${esc(c.cor)} • ${c.qtd} pç${c.op ? ' • próxima: ' + esc(c.op) : ''}">
        <i class="lay-dot lote"></i><span><b>${esc(c.cod)}</b><small>${esc(c.prod)} • ${c.qtd} pç • ${Math.round(c.pct)}%${c.op ? ' • ' + esc(c.op) : ''}</small></span>${na ? '<em>✓</em>' : ''}</button>`; }).join('') : '<p class="hint">Nenhuma caixa na produção interna agora.</p>'}
      ${fora ? `<button type="button" class="btn btn-secondary btn-sm" onclick="gutLayout.limparLotes()">Tirar da planta ${fora} lote(s) que já saíram da produção</button>` : ''}
      <div class="lay-h">Outros itens</div>
      ${BLOCOS.map(b => `<button type="button" class="lay-pal" draggable="true" data-add="${b.tipo}" onclick="gutLayout.adicionar('${b.tipo}')"><i class="lay-dot blk t-${b.tipo.toLowerCase()}"></i><span><b>${esc(b.nome)}</b><small>${fm(b.w)} × ${fm(b.h)} m</small></span></button>`).join('')}
      ${P.cor === 'OEE' ? `<div class="lay-legend"><div class="lay-h">OEE de hoje</div><span><i class="lay-dot idle"></i>sem registros</span><span><i class="lay-dot ok"></i>85% ou mais (classe mundial)</span><span><i class="lay-dot high"></i>60 a 85%</span><span><i class="lay-dot over"></i>abaixo de 60%</span><p class="hint">OEE = disponibilidade (turno menos paradas) × desempenho (minutos padrão produzidos ÷ tempo operando) × qualidade (peças boas ÷ peças). Vem do que a costureira registra no app de campo na máquina dela.</p></div>` : ''}
      <div class="lay-legend" ${P.cor === 'OEE' ? 'hidden' : ''}><div class="lay-h">Ocupação de hoje</div><span><i class="lay-dot idle"></i>sem carga</span><span><i class="lay-dot ok"></i>até 80%</span><span><i class="lay-dot high"></i>80 a 100%</span><span><i class="lay-dot over"></i>acima de 100%</span>
      <p class="hint">Carga = minutos padrão ainda não concluídos na produção interna ÷ capacidade do dia do tipo de máquina (igual ao painel Capacidade). Máquinas do mesmo tipo mostram a mesma ocupação, a não ser que tenham costureira no posto (bipe o crachá na máquina): aí a cor é a carga dos processos alocados a ela.</p></div>`;
    el.querySelectorAll('[data-add]').forEach(b => b.addEventListener('dragstart', e => { L.arr = { tipo: b.dataset.add, maq: b.dataset.maq || b.dataset.vol || '' }; try { e.dataTransfer.setData('text/plain', 'lay'); e.dataTransfer.effectAllowed = 'copy'; } catch (x) {} }));
  }

  function props() {
    const el = $('layProp'); if (!el) return; const d = D(); const it = d.itens.find(i => i.id === L.sel);
    const cotas = d.cotas.map(c => ({ c, m: medir(c) })).filter(x => x.m);
    const tot = cotas.reduce((s, x) => s + x.m.reta, 0), totL = cotas.reduce((s, x) => s + x.m.l, 0);
    let h = '';
    if (it && it.tipo === 'LOTE') {
      const c = mapaCaixas().get(it.vol), f = fluxos().find(x => x.l.id === it.id);
      h += `<div class="lay-h">Lote na planta</div>${c ? `<div class="lay-lote-card"><b>${esc(c.cod)}</b><span>${esc(c.prod)}${c.cor ? ' • ' + esc(c.cor) : ''}</span><span>${c.qtd} pç • ${Math.round(c.pct)}% concluído</span>
        <div class="lay-prog"><i style="width:${Math.min(100, c.pct)}%"></i></div>
        ${c.feito ? '<span class="ok">Todas as operações concluídas</span>' : c.op ? `<span>${c.ativa ? 'Em produção' : 'Próxima operação'}: <b>${esc(c.op)}</b>${c.opMaqNome ? ' • ' + esc(c.opMaqNome) : ''}</span>` : ''}
        ${f ? (f.alvo ? `<span>Até ${esc(f.alvo.nome)}: <b>${fm(f.dist)} m</b></span>` : `<span class="warn">Nenhuma ${esc(c.opMaqNome || 'máquina desse tipo')} na planta</span>`) : ''}</div>
        <div class="lay-acts"><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.abrirLote('${esc(it.vol)}')">Abrir no quadro</button><button class="btn btn-secondary btn-sm lay-del" type="button" onclick="gutLayout.excluirItem()">Tirar da planta</button></div>`
        : `<p class="hint">Este lote já saiu da produção interna.</p><div class="lay-acts"><button class="btn btn-secondary btn-sm lay-del" type="button" onclick="gutLayout.excluirItem()">Tirar da planta</button></div>`}`;
    } else if (it) {
      const occ = ocupacao().get(it.maq || ''), mq = maquinas();
      h += `<div class="lay-h">${it.tipo === 'MAQ' ? 'Máquina' : 'Item'} selecionado</div>
      <label class="lay-f"><span>Nome na planta</span><input value="${esc(it.nome)}" maxlength="40" oninput="gutLayout.prop('nome',this.value)"></label>
      ${it.tipo === 'MAQ' ? `<label class="lay-f"><span>Máquina nº (etiqueta QR)</span><select onchange="gutLayout.prop('uni',this.value)"><option value="">— sem número —</option>${unisTipo(it.maq).map(u => { const outro = d.itens.find(x => x.uni === u.id && x.id !== it.id); return `<option value="${esc(u.id)}" ${u.id === it.uni ? 'selected' : ''} ${outro ? 'disabled' : ''}>${esc(u.codigo)}${u.descricao ? ' • ' + esc(u.descricao) : ''}${outro ? ' (já na planta)' : ''}</option>`; }).join('')}</select></label>
      ${unisTipo(it.maq).length ? '' : `<p class="hint">Numere as máquinas em Cadastros › Máquinas › 🏷 Numerar / QR.</p>`}
      ${opDoItem(it) ? `<div class="lay-opr">👤 ${esc(operadorNome(opDoItem(it)) || opDoItem(it))} <button type="button" class="x" onclick="gutLayout.prop('op','')" title="Tirar a costureira desta máquina">×</button></div>` : ''}` : ''}
      ${it.tipo !== 'MAQ' ? `<label class="lay-f"><span>Papel no fluxo da peça</span><select onchange="gutLayout.prop('papel',this.value)"><option value="">— nenhum —</option><option value="CORTE" ${it.papel === 'CORTE' ? 'selected' : ''}>Início: corte (a peça sai daqui)</option><option value="EXPED" ${it.papel === 'EXPED' ? 'selected' : ''}>Fim: expedição (a peça termina aqui)</option></select></label>` : ''}
      ${it.tipo === 'MAQ' ? `<label class="lay-f"><span>Tipo de máquina</span><select onchange="gutLayout.prop('maq',this.value)">${mq.map(m => `<option value="${esc(m.id)}" ${m.id === it.maq ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>` : ''}
      <div class="lay-2"><label class="lay-f"><span>Largura (m)</span><input inputmode="decimal" value="${fm(it.w)}" onchange="gutLayout.prop('w',this.value)"></label><label class="lay-f"><span>Profundidade (m)</span><input inputmode="decimal" value="${fm(it.h)}" onchange="gutLayout.prop('h',this.value)"></label></div>
      <div class="lay-2"><label class="lay-f"><span>X (m)</span><input inputmode="decimal" value="${fm(it.x)}" onchange="gutLayout.prop('x',this.value)"></label><label class="lay-f"><span>Y (m)</span><input inputmode="decimal" value="${fm(it.y)}" onchange="gutLayout.prop('y',this.value)"></label></div>
      ${it.tipo === 'MAQ' ? oeeHtml(it) : ''}
      ${it.tipo === 'MAQ' && opDoItem(it) ? (() => { const pc = postoCarga(it); return `<div class="lay-occ ${classe(pc.pct)}"><b>${isFinite(pc.pct) ? Math.round(pc.pct) : '>999'}%</b><span>carga do posto hoje (${esc(operadorNome(opDoItem(it)).split(/\s+/)[0] || 'costureira')}) • ${Math.round(pc.load)} de ${Math.round(pc.cap)} min • ${pc.ops} processo(s) alocado(s)${pc.feitoHoje ? ` • ${Math.round(pc.feitoHoje)} min padrão entregues hoje${pc.efic != null ? ` • eficiência ${Math.round(pc.efic)}%` : ''}` : ''}</span></div>`; })() : ''}
      ${it.tipo === 'MAQ' && occ && !opDoItem(it) ? `<div class="lay-occ ${classe(occ.pct)}"><b>${isFinite(occ.pct) ? Math.round(occ.pct) : '>999'}%</b><span>ocupação hoje do tipo • ${Math.round(occ.load)} de ${Math.round(occ.cap)} min • ${occ.ops} processo(s) a fazer</span></div>` : ''}
      <div class="lay-acts"><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.girar()" title="Girar 90° (R)">⟳ Girar</button><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.duplicar()" title="Duplicar (Ctrl+D)">⧉ Duplicar</button><button class="btn btn-secondary btn-sm lay-del" type="button" onclick="gutLayout.excluirItem()" title="Excluir (Delete)">Excluir</button></div>`;
    } else {
      h += `<div class="lay-h">Como usar</div><ul class="lay-help"><li>Defina largura e comprimento do ambiente.</li><li>Clique ou arraste uma máquina para a planta; arraste para posicionar (encaixa na grade).</li><li><b>Cota</b>: toque num item e depois em outro para medir a distância entre os centros.</li><li>Arraste os <b>lotes em produção</b> para perto das máquinas: a linha laranja liga cada lote à máquina da próxima operação.</li><li>Atalhos: R gira, Delete exclui, setas movem uma casa, Ctrl+Z desfaz, F tela cheia.</li></ul>`;
    }
    h += `<div class="lay-h">Cotas (${cotas.length})</div>
      ${cotas.length ? `<div class="lay-cotas">${cotas.map(({ c, m }) => `<div class="lay-cota ${L.selCota === c.id ? 'on' : ''}" onclick="gutLayout.selCota('${c.id}')"><span>${esc(m.a.nome)} → ${esc(m.b.nome)}</span><b>${fm(m.reta)} m</b><small>em L ${fm(m.l)} m</small><button type="button" class="x" onclick="event.stopPropagation();gutLayout.excluirCota('${c.id}')" title="Excluir cota">×</button></div>`).join('')}</div>
      <div class="lay-tot"><span>Total do percurso</span><b>${fm(tot)} m</b><small>em L (andando pelos corredores) ${fm(totL)} m</small></div>` : '<p class="hint">Nenhuma cota ainda. Use a ferramenta Cota.</p>'}`;
    h += `<div class="lay-h">Ambiente</div><div class="lay-acts"><button class="btn btn-secondary btn-sm lay-del" type="button" onclick="gutLayout.excluirAmbiente()">Excluir ambiente</button></div>`;
    el.innerHTML = h;
  }

  function medir(c) {
    const d = D(), a = d.itens.find(i => i.id === c.a), b = d.itens.find(i => i.id === c.b); if (!a || !b) return null;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    return { a, b, ax, ay, bx, by, reta: Math.hypot(bx - ax, by - ay), l: Math.abs(bx - ax) + Math.abs(by - ay) };
  }

  /* ---------- análise de fluxo: matriz De-Para × distâncias → metros por peça ---------- */
  const A = { base: 'QUADRO', prod: '', qtd: 100, dist: 'L', ver: true, res: null };
  function produtos() { return ((typeof STATE !== 'undefined' && STATE.cad && STATE.cad.produtos) || []).filter(p => !['FALSE', '0', 'INATIVO'].includes(String(p.ATIVO ?? '').toUpperCase())); }
  const nomeProd = id => { const p = produtos().find(x => String(x.ID_PRODUTO) === String(id)); return p ? [p.CODIGO_PRODUTO, p.PRODUTO].filter(Boolean).join(' - ') : 'Produto'; };
  /* sequência de tipos de máquina do roteiro ativo do produto */
  function seqMaquinas(pid) {
    const procs = new Map(((STATE.cad && STATE.cad.processos) || []).map(p => [String(p.ID_PROCESSO), p]));
    return ((STATE.cad && STATE.cad.roteiro) || []).filter(r => String(r.ID_PRODUTO) === String(pid) && !['FALSE', '0', 'INATIVO'].includes(String(r.ATIVO ?? '').toUpperCase()))
      .sort((a, b) => num(a.ORDEM_PROCESSO) - num(b.ORDEM_PROCESSO))
      .map(r => { const pr = procs.get(String(r.ID_PROCESSO)) || {}; return { maq: String(r.ID_MAQUINA || pr.ID_MAQUINA_PADRAO || ''), op: pr.PROCESSO || 'Operação', seg: num(r.TEMPO_PADRAO_SEG_UN) }; });
  }
  /* volume por produto: quadro interno (peças ainda em produção) ou um produto com quantidade informada */
  function demanda() {
    if (A.base === 'PRODUTO') return A.prod ? [{ pid: A.prod, qtd: Math.max(1, num(A.qtd) || 1) }] : [];
    if (A.base === 'TODOS') return produtos().filter(p => seqMaquinas(p.ID_PRODUTO).filter(x => x.maq).length >= 2).map(p => ({ pid: String(p.ID_PRODUTO), qtd: 100 }));
    const m = new Map(); ((STATE.internalBoard && STATE.internalBoard.rows) || []).forEach(v => { const pid = String(v.ID_PRODUTO || ''); if (pid) m.set(pid, (m.get(pid) || 0) + (Number(v.QTD_VOLUME) || 0)); });
    return [...m].map(([pid, qtd]) => ({ pid, qtd })).filter(x => x.qtd > 0);
  }
  /* nós do fluxo: tipos de máquina + pontas (corte no início, expedição no fim) marcadas nos blocos com "papel" */
  const PONTA = { CORTE: '@CORTE', EXPED: '@EXPED' };
  const nomeNo = id => id === PONTA.CORTE ? 'Corte' : id === PONTA.EXPED ? 'Expedição' : ((maquinas().find(m => m.id === id) || {}).nome || 'Máquina sem cadastro');
  function nosDe(itens) {
    const unid = new Map(), add = (k, i) => { if (!unid.has(k)) unid.set(k, []); unid.get(k).push(i); };
    itens.forEach(i => { if (i.tipo === 'MAQ') add(i.maq, i); else if (i.papel === 'CORTE') add(PONTA.CORTE, i); else if (i.papel === 'EXPED') add(PONTA.EXPED, i); });
    return unid;
  }
  /* sequência com as pontas quando o ambiente tem corte/expedição marcados */
  function seqCom(pid, unid) {
    const s = seqMaquinas(pid).filter(x => x.maq); if (!s.length) return s;
    return (unid.has(PONTA.CORTE) ? [{ maq: PONTA.CORTE, op: 'Corte' }] : []).concat(s, unid.has(PONTA.EXPED) ? [{ maq: PONTA.EXPED, op: 'Expedição' }] : []);
  }
  function analisar() {
    const d = D(); if (!d) return; const mq = { get: nomeNo };
    const unid = nosDe(d.itens);
    const ctr = i => [i.x + i.w / 2, i.y + i.h / 2];
    const dd = (a, b) => A.dist === 'L' ? Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) : Math.hypot(a[0] - b[0], a[1] - b[1]);
    const par = new Map(); // menor distância entre uma unidade do tipo A e uma do tipo B
    const distTipos = (a, b) => { const k = a + '>' + b; if (par.has(k)) return par.get(k); const ua = unid.get(a), ub = unid.get(b); if (!ua || !ub) { par.set(k, null); return null; }
      let best = null; ua.forEach(x => ub.forEach(y => { const v = dd(ctr(x), ctr(y)); if (!best || v < best.d) best = { d: v, a: x, b: y }; })); par.set(k, best); return best; };
    const fluxo = new Map(), faltam = new Set(), semMaq = new Set(), porProd = [];
    let pecas = 0, metros = 0;
    demanda().forEach(({ pid, qtd }) => {
      const seq = seqCom(pid, unid); if (!seq.length) { semMaq.add(pid); return; }
      let m1 = 0, ok = true;
      for (let k = 1; k < seq.length; k++) {
        const a = seq[k - 1].maq, b = seq[k].maq; if (a === b) continue;
        const key = a + '>' + b, f = fluxo.get(key) || { a, b, qtd: 0, ops: new Set() }; f.qtd += qtd; f.ops.add(seq[k - 1].op + ' → ' + seq[k].op); fluxo.set(key, f);
        const bd = distTipos(a, b); if (!bd) { ok = false; if (!unid.has(a)) faltam.add(a); if (!unid.has(b)) faltam.add(b); continue; } m1 += bd.d;
      }
      pecas += qtd; metros += m1 * qtd; porProd.push({ pid, qtd, m: m1, ok, passos: seq.length });
    });
    const lista = [...fluxo.values()].map(f => { const bd = distTipos(f.a, f.b); return Object.assign(f, { d: bd ? bd.d : null, ua: bd && bd.a, ub: bd && bd.b, custo: bd ? bd.d * f.qtd : null }); });
    const tipos = []; lista.forEach(f => { [f.a, f.b].forEach(t => { if (!tipos.includes(t)) tipos.push(t); }); });
    tipos.sort((a, b) => (a === PONTA.CORTE ? -1 : b === PONTA.CORTE ? 1 : a === PONTA.EXPED ? 1 : b === PONTA.EXPED ? -1 : 0));
    A.res = { pecas, metros, porPeca: pecas ? metros / pecas : 0, lista, tipos, mq, faltam: [...faltam], semMaq: [...semMaq], porProd };
    painelAnalise();
  }

  /* ---------- montagem automática da planta ----------
     1) matriz produto × máquina ordenada por Rank Order Clustering (King) → famílias de produtos e a ordem das máquinas;
     2) vagas: em LINHA (fileiras em serpentina) ou em CÉLULAS EM U (uma por família), desviando de paredes, mesas e corredores fixos;
     3) melhora por trocas de lugar (estilo CRAFT / 2-opt), várias partidas, aceitando só o que reduz Σ peças × metros;
     4) no modo Automático monta os dois formatos e fica com o de menos metros por peça. */
  function custoDe(itens, dem, dist, seqs) {
    const unid = nosDe(itens);
    const c = i => [i.x + i.w / 2, i.y + i.h / 2], dd = (a, b) => dist === 'L' ? Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) : Math.hypot(a[0] - b[0], a[1] - b[1]);
    const memo = new Map(); let tot = 0, pecas = 0, falta = 0;
    dem.forEach(({ pid, qtd }) => { let seq = seqs ? seqs.get(pid) : seqMaquinas(pid).filter(x => x.maq); if (!seq || !seq.length) return; pecas += qtd;
      seq = (unid.has(PONTA.CORTE) ? [{ maq: PONTA.CORTE }] : []).concat(seq, unid.has(PONTA.EXPED) ? [{ maq: PONTA.EXPED }] : []);
      for (let k = 1; k < seq.length; k++) { const a = seq[k - 1].maq, b = seq[k].maq; if (a === b) continue; const key = a + '>' + b;
        if (!memo.has(key)) { const ua = unid.get(a), ub = unid.get(b); let best = null; if (ua && ub) ua.forEach(x => ub.forEach(y => { const v = dd(c(x), c(y)); if (best == null || v < best) best = v; })); memo.set(key, best); }
        const v = memo.get(key); if (v == null) falta++; else tot += v * qtd; } });
    return { tot, pecas, porPeca: pecas ? tot / pecas : 0, falta };
  }
  function rocOrdem(dem, tipos) {
    const prods = dem.map(x => x.pid); let rows = prods.slice(), cols = tipos.slice();
    const usa = new Map(prods.map(p => [p, new Set(seqMaquinas(p).map(x => x.maq))]));
    const peso = bits => bits.reduce((s, b, i) => s + (b ? Math.pow(2, Math.min(50, bits.length - 1 - i)) : 0), 0);
    for (let it = 0; it < 12; it++) {
      const nr = rows.slice().sort((a, b) => peso(cols.map(c => usa.get(b).has(c))) - peso(cols.map(c => usa.get(a).has(c))));
      const nc = cols.slice().sort((a, b) => peso(nr.map(r => usa.get(r).has(b))) - peso(nr.map(r => usa.get(r).has(a))));
      const igual = nr.join() === rows.join() && nc.join() === cols.join(); rows = nr; cols = nc; if (igual) break;
    }
    return { rows, cols, usa };
  }
  /* famílias: produtos seguidos na ordem do ROC que dividem boa parte das máquinas */
  function familias(roc, dem) {
    const fams = [], qtd = new Map(dem.map(x => [x.pid, x.qtd]));
    roc.rows.forEach(p => {
      const s = roc.usa.get(p), f = fams[fams.length - 1];
      if (f) { const inter = [...s].filter(x => f.tipos.has(x)).length, uni = new Set([...s, ...f.tipos]).size; if (uni && inter / uni >= 0.34) { f.prods.push(p); s.forEach(x => f.tipos.add(x)); f.qtd += qtd.get(p) || 0; return; } }
      fams.push({ prods: [p], tipos: new Set(s), qtd: qtd.get(p) || 0 });
    });
    return fams;
  }
  const sobrepoe = (a, b, folga = 0) => a.x < b.x + b.w + folga && a.x + a.w + folga > b.x && a.y < b.y + b.h + folga && a.y + a.h + folga > b.y;
  /* vaga = posição da máquina + a área da costureira (à frente da máquina) */
  function vagaLivre(v, W, H, obst) {
    const caixa = { x: v.x - 0.05, y: v.y - 0.05, w: v.area.w + 0.1, h: v.area.h + 0.1 };
    if (v.x < 0.3 || v.y < 0.3 || v.x + v.area.w > W - 0.3 || v.y + v.area.h > H - 0.3) return false;
    return !obst.some(o => o.tipo !== 'AREA' && sobrepoe(caixa, o));
  }
  function vagasLinha(n, W, H, obst) {
    const m0 = 1, px = MAQ_W + 0.4, cols = Math.max(1, Math.floor((W - 2 * m0 + 0.4) / px)), vagas = [];
    let y = m0, fila = 0;
    while (vagas.length < n && y + MAQ_H <= H - 0.5) {
      const xs = Array.from({ length: cols }, (_, k) => m0 + k * px); if (fila % 2) xs.reverse();
      xs.forEach(x => { const v = { x: r2(x), y: r2(y), w: MAQ_W, h: MAQ_H, celula: 0, area: { w: MAQ_W, h: MAQ_H + 0.8 } }; if (vagaLivre(v, W, H, obst)) vagas.push(v); });
      y += MAQ_H + 0.8 + (fila % 2 ? 1.2 : 0); fila++;
    }
    return vagas.length >= n ? vagas : null;
  }
  /* uma célula em U: desce pelo braço esquerdo, segue pelo fundo e sobe pelo braço direito; costureiras do lado de dentro */
  function formaU(n, ladoQ) {
    const lado = ladoQ != null ? ladoQ : Math.max(0, Math.floor(n / 3)), fundo = Math.max(1, n - 2 * lado), P = 1.6;
    const larg = Math.max(0.6 + 0.8 + fundo * P - 0.4 + 0.8 + 0.6, 0.6 + 2.4 + 0.6), alt = Math.max(lado * P, 0) + 0.8 + MAQ_H + 0.3;
    const out = [];
    for (let k = 0; k < lado; k++) out.push({ dx: 0, dy: k * P, w: MAQ_H, h: MAQ_W, area: { w: MAQ_H + 0.8, h: MAQ_W } });
    const x0 = (larg - (fundo * P - 0.4)) / 2;
    for (let k = 0; k < fundo; k++) out.push({ dx: x0 + k * P, dy: alt - MAQ_H, w: MAQ_W, h: MAQ_H, area: { w: MAQ_W, h: MAQ_H }, frente: -0.8 });
    for (let k = lado - 1; k >= 0; k--) out.push({ dx: larg - MAQ_H, dy: k * P, w: MAQ_H, h: MAQ_W, area: { w: MAQ_H + 0.8, h: MAQ_W }, esq: true });
    return { larg, alt, vagas: out };
  }
  function melhorU(n, W, H) {
    let f = null; for (let lado = Math.floor(n / 3); lado <= Math.max(Math.floor(n / 3), Math.floor((n - 1) / 2)); lado++) { const t = formaU(n, lado); if (t.larg <= W - 1.3 && t.alt <= H - 1.3 && (!f || t.larg * t.alt < f.larg * f.alt - 1e-9)) f = t; }
    return f;
  }
  function vagasU(grupos, W, H, obst) {
    // encaixe "de cima para baixo, da esquerda para a direita": as células maiores primeiro, 1,4 m de corredor entre elas;
    // testa os formatos de U do mais compacto ao mais comprido; se não couber tudo, divide as células grandes e tenta de novo
    const maxN = Math.max(...grupos);
    for (let k = 1; k <= 6; k++) {
      const limite = Math.ceil(maxN / k), ordem = grupos.map((n, g) => g).sort((a, b) => grupos[b] - grupos[a]), por = new Array(grupos.length), ocup = obst.filter(o => o.tipo !== 'AREA').slice();
      let novaCel = grupos.length + 1, falhou = false;
      const formas = n => { const out = []; for (let lado = Math.floor(n / 3); lado <= Math.max(Math.floor(n / 3), Math.floor((n - 1) / 2)); lado++) { const t = formaU(n, lado); if (t.larg <= W - 1.3 && t.alt <= H - 1.3) out.push(t); } return out.sort((a, b) => a.larg * a.alt - b.larg * b.alt); };
      const umaCel = (n, cel) => {
        for (const f of formas(n)) for (let cy = 0.8; cy + f.alt <= H - 0.5; cy += 0.5) for (let cx = 0.8; cx + f.larg <= W - 0.5; cx += 0.5) {
          const caixa = { x: cx, y: cy, w: f.larg, h: f.alt }; if (ocup.some(o => sobrepoe(caixa, o, o.tipo === 'CEL' ? 1.4 : 0.3))) continue;
          const vs = f.vagas.map(v => { const x = r2(cx + v.dx), y = r2(cy + v.dy); const ax = v.esq ? x - 0.8 : x, ay = v.frente ? y - 0.8 : y; return { x, y, w: v.w, h: v.h, celula: cel, area: v.area, ax, ay, frente: v.frente }; });
          if (vs.every(v => vagaLivre({ x: v.ax, y: v.ay, area: v.frente ? { w: v.w, h: v.h + 0.8 } : v.area }, W, H, obst))) { ocup.push({ tipo: 'CEL', x: cx, y: cy, w: f.larg, h: f.alt }); return vs; }
        }
        return null;
      };
      for (const g of ordem) {
        const n = grupos[g], partes = Math.ceil(n / limite); let vs = [];
        for (let p = 0; p < partes && !falhou; p++) { const t = Math.floor(n / partes) + (p < n % partes ? 1 : 0), r = umaCel(t, p ? novaCel++ : g + 1); if (!r) falhou = true; else vs = vs.concat(r); }
        if (falhou) break; por[g] = vs;
      }
      if (!falhou) return por.flat().map(v => ({ x: v.x, y: v.y, w: v.w, h: v.h, celula: v.celula, area: v.area }));
    }
    return null;
  }
  function otimizar(unidades, vagas, montarItens, dem, seqs, celulas) {
    let pos = unidades.map((u, k) => k);
    const custo = () => custoDe(montarItens(pos), dem, A.dist, seqs).tot;
    const ini = custo(), t0 = Date.now(); let passos = 0, rodadas = 0, melhorPos = pos.slice(), melhorCusto = ini;
    const mesmaCel = (a, b) => !celulas || vagas[a].celula === vagas[b].celula;
    while (rodadas < 30 && Date.now() - t0 < 2500) {
      if (rodadas > 0) { pos = unidades.map((u, k) => k); // embaralha só dentro de cada célula (no U) ou geral (na linha)
        const grupos = new Map(); pos.forEach((p, k) => { const c = celulas ? vagas[p].celula : 0; if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(k); });
        grupos.forEach(ks => { const ps = ks.map(k => pos[k]); for (let i = ps.length - 1; i > 0; i--) { const r = Math.floor(Math.random() * (i + 1)); [ps[i], ps[r]] = [ps[r], ps[i]]; } ks.forEach((k, i) => { pos[k] = ps[i]; }); }); }
      const livres = vagas.map((v, i) => i).filter(i => !pos.includes(i));
      let atual = custo(), melhorou = true;
      while (melhorou && Date.now() - t0 < 5000) {
        melhorou = false;
        for (let i = 0; i < unidades.length; i++) for (let j = i + 1; j < unidades.length + livres.length; j++) {
          if (j < unidades.length && (unidades[i].maq === unidades[j].maq || !mesmaCel(pos[i], pos[j]))) continue;
          if (j >= unidades.length && !mesmaCel(pos[i], livres[j - unidades.length])) continue;
          const ant = pos.slice();
          if (j < unidades.length) [pos[i], pos[j]] = [pos[j], pos[i]]; else { const l = j - unidades.length, v = livres[l]; livres[l] = pos[i]; pos[i] = v; }
          const c = custo(); passos++;
          if (c < atual - 1e-9) { atual = c; melhorou = true; } else { if (j >= unidades.length) livres[j - unidades.length] = pos[i]; pos = ant; }
        }
      }
      if (atual < melhorCusto - 1e-9 || rodadas === 0) { melhorCusto = atual; melhorPos = pos.slice(); }
      rodadas++;
    }
    return { pos: melhorPos, ini, fim: melhorCusto, passos, rodadas };
  }
  /* opções: { formato: 'AUTO'|'LINHA'|'U', tamanho: 'AUTO'|'ATUAL', fixos: bool, pontas: bool } */
  function montarPlanta(op) {
    const d = D(); if (!d) return null; const dem = demanda();
    if (!dem.length) return { erro: 'Não há produção na base escolhida. Escolha "Todos os produtos" ou um produto com roteiro.' };
    const mq = maquinas(); if (!mq.length) return { erro: 'Cadastre as máquinas primeiro (Cadastros › Máquinas).' };
    const unidades = []; mq.forEach(m => { const us = unisTipo(m.id); if (us.length) us.forEach(u => unidades.push({ maq: m.id, uni: u.id, nome: u.codigo })); else for (let k = 1; k <= Math.max(1, m.total); k++) unidades.push({ maq: m.id, uni: '', nome: `${m.nome} ${k}` }); });
    const usados = [...new Set(dem.flatMap(x => seqMaquinas(x.pid).map(s => s.maq)).filter(Boolean))].filter(t => mq.some(m => m.id === t));
    if (!usados.length) return { erro: 'Os roteiros desses produtos não têm máquina nas operações. Complete a máquina de cada operação na ficha do produto.' };
    const roc = rocOrdem(dem, usados), ordem = roc.cols.concat(mq.map(m => m.id).filter(t => !roc.cols.includes(t)));
    const fams = familias(roc, dem), seqs = new Map(dem.map(x => [x.pid, seqMaquinas(x.pid).filter(s => s.maq)]));
    // máquinas por família: cada tipo é dividido entre as famílias que o usam, pelo volume (pelo menos 1 para cada, se houver)
    const famDe = new Map(); ordem.forEach(t => {
      // balanceamento: cada família recebe máquinas do tipo na proporção dos minutos de trabalho dela nesse tipo (peças × tempo padrão)
      const carga = f => f.prods.reduce((s, p) => { const q = (dem.find(x => x.pid === p) || {}).qtd || 0; return s + seqMaquinas(p).filter(o => o.maq === t).reduce((a, o) => a + q * Math.max(1, o.seg || 60) / 60, 0); }, 0);
      const us = unidades.filter(u => u.maq === t), quem = fams.map((f, i) => ({ i, q: f.tipos.has(t) ? Math.max(0.01, carga(f)) : 0 })).filter(x => x.q > 0);
      if (!quem.length) { us.forEach(u => famDe.set(u, fams.length)); return; } // não usado em nenhum roteiro: vai para o fim
      const tot = quem.reduce((s, x) => s + x.q, 0); let k = 0;
      quem.forEach((x, n) => { const cota = n === quem.length - 1 ? us.length - k : Math.max(1, Math.round(us.length * x.q / tot)); for (let c = 0; c < cota && k < us.length; c++) famDe.set(us[k++], x.i); });
      while (k < us.length) famDe.set(us[k++], quem[0].i);
    });
    unidades.sort((a, b) => famDe.get(a) - famDe.get(b) || ordem.indexOf(a.maq) - ordem.indexOf(b.maq) || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
    // itens fixos e pontas
    const fixos = op.fixos ? d.itens.filter(i => i.tipo !== 'MAQ' && i.tipo !== 'LOTE').map(i => Object.assign({}, i, { id: uid() })) : [];
    const tentar = (formato, W, H, soCabe) => {
      const obst = fixos.map(i => Object.assign({}, i)); let corte = obst.find(i => i.papel === 'CORTE') || (op.pontas && obst.find(i => i.tipo === 'MESA'));
      let exped = obst.find(i => i.papel === 'EXPED') || (op.pontas && obst.find(i => i.tipo === 'ESTOQUE' && /exped/i.test(i.nome)));
      if (op.pontas) {
        // cria o que faltar num lugar livre: o corte perto do canto de cima à esquerda, a expedição perto do canto de baixo à direita
        const lugar = (w, h, deBaixo) => { const xs = [], ys = []; for (let x = 0.5; x + w <= W - 0.5; x += 0.5) xs.push(x); for (let y = 0.5; y + h <= H - 0.5; y += 0.5) ys.push(y); if (deBaixo) { xs.reverse(); ys.reverse(); }
          for (const y of ys) for (const x of xs) { const c = { x, y, w, h }; if (!obst.some(o => o.tipo !== 'AREA' && sobrepoe(c, o, 0.6))) return { x, y }; } return null; };
        if (corte) corte.papel = 'CORTE'; else { const w = Math.min(6, W - 2), p = lugar(w, 1.8, false); if (!p) return null; corte = { id: uid(), tipo: 'MESA', nome: 'Mesa de corte', papel: 'CORTE', w, h: 1.8, x: p.x, y: p.y }; obst.push(corte); }
        if (exped) exped.papel = 'EXPED'; else { const p = lugar(2, 1.5, true); if (!p) return null; exped = { id: uid(), tipo: 'ESTOQUE', nome: 'Expedição', papel: 'EXPED', w: 2, h: 1.5, x: p.x, y: p.y }; obst.push(exped); }
      }
      const grupos = []; if (formato === 'U') { const porFam = new Map(); unidades.forEach(u => { const f = famDe.get(u); if (f < fams.length) porFam.set(f, (porFam.get(f) || 0) + 1); }); [...porFam.keys()].sort((a, b) => a - b).forEach(f => { let n = porFam.get(f); // família grande demais para um U: vira mais de uma célula
        let partes = 1; while (!melhorU(Math.ceil(n / partes), W, H) && Math.ceil(n / partes) > 1) partes++;
        for (let k = 0; k < partes; k++) { const t = Math.floor(n / partes) + (k < n % partes ? 1 : 0); if (t) grupos.push(t); } }); }
      let vagas = formato === 'U' ? vagasU(grupos, W, H, obst) : vagasLinha(unidades.length, W, H, obst);
      // no U, as máquinas que nenhum roteiro usa ficam numa fileira de reserva, no espaço que sobrar
      if (formato === 'U' && vagas) { const resto = unidades.length - vagas.length; if (resto > 0) {
        const caixas = []; const porCel = new Map(); vagas.forEach(v => { const b = porCel.get(v.celula) || { x: 1e9, y: 1e9, x2: -1e9, y2: -1e9 }; b.x = Math.min(b.x, v.x - 0.8); b.y = Math.min(b.y, v.y - 0.8); b.x2 = Math.max(b.x2, v.x + v.w + 0.8); b.y2 = Math.max(b.y2, v.y + v.h + 0.8); porCel.set(v.celula, b); });
        porCel.forEach(b => caixas.push({ tipo: 'CEL', x: b.x, y: b.y, w: b.x2 - b.x, h: b.y2 - b.y }));
        const extra = vagasLinha(resto, W, H, obst.concat(caixas)); vagas = extra ? vagas.concat(extra.slice(0, resto)) : null; } }
      if (!vagas) return null; if (soCabe) return true;
      const montarItens = pos => obst.concat(unidades.map((u, k) => { const v = vagas[pos[k]]; return { id: 'sg' + k, tipo: 'MAQ', maq: u.maq, uni: u.uni, nome: u.nome, x: v.x, y: v.y, w: v.w, h: v.h }; }));
      const r = otimizar(unidades, vagas, montarItens, dem, seqs, formato === 'U');
      const itens = montarItens(r.pos); itens.filter(i => i.tipo === 'MAQ').forEach((i, k) => { if (vagas[r.pos[k]].celula) i.celula = vagas[r.pos[k]].celula; });
      return { formato, W, H, itens, r, res: custoDe(itens, dem, A.dist, seqs), celulas: formato === 'U' ? new Set(itens.filter(i => i.celula).map(i => i.celula)).size : 0 };
    };
    const formatos = op.formato === 'AUTO' ? ['LINHA', 'U'] : [op.formato];
    const resultados = [];
    formatos.forEach(f => {
      if (op.tamanho === 'ATUAL') { const x = tentar(f, d.largura, d.comprimento); if (x) resultados.push(x); return; }
      // tamanho ideal: largura pela raiz da área necessária; o comprimento cresce até caber tudo
      const area = unidades.length * 4.2 + (op.pontas ? 16 : 0) + fixos.reduce((s, i) => s + (i.tipo === 'AREA' ? 0 : i.w * i.h), 0);
      let W = Math.max(10, Math.ceil(Math.sqrt(area * 1.6))), x = null;
      fixos.forEach(i => { W = Math.max(W, Math.ceil(i.x + i.w + 1)); });
      let Hok = 0; const minH = fixos.reduce((m, i) => Math.max(m, i.y + i.h + 1), 0);
      for (let H = Math.max(8, Math.ceil(area / W), Math.ceil(minH)); H <= 300 && !Hok; H += 1) if (tentar(f, W, H, true)) Hok = H;
      if (Hok) x = tentar(f, W, Hok);
      if (x) resultados.push(x);
    });
    if (!resultados.length) return { erro: `Não coube: ${unidades.length} máquinas em ${fm(d.largura)} × ${fm(d.comprimento)} m com espaço para as costureiras e corredores. Use "Calcular o tamanho ideal" ou aumente o ambiente.` };
    resultados.sort((a, b) => a.res.porPeca - b.res.porPeca);
    return { melhor: resultados[0], todos: resultados, dem, roc, fams, unidades: unidades.length };
  }
  function sugerir(op) {
    op = Object.assign({ formato: 'AUTO', tamanho: 'ATUAL', fixos: true, pontas: false }, op || {});
    const d = D(), out = montarPlanta(op); if (!out) return;
    if (out.erro) { (window.toast || alert)(out.erro, true); return out; }
    const m = out.melhor, antes = custoDe(d.itens, out.dem, A.dist);
    const agora = new Date(), novo = { id: '', nome: `Planta sugerida ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, dados: { largura: m.W, comprimento: m.H, celula: d.celula, itens: m.itens, cotas: [] } };
    A.sug = { de: L.atual.nome, antes, depois: m.res, inicial: m.r.ini / Math.max(1, m.res.pecas), rodadas: m.r.rodadas, passos: m.r.passos, maquinas: out.unidades, roc: out.roc, fams: out.fams.length, nome: novo.nome, faltaAntes: antes.falta || !antes.pecas, base: A.base,
      formato: m.formato, celulas: m.celulas, W: m.W, H: m.H, todos: out.todos.map(x => ({ formato: x.formato, porPeca: x.res.porPeca, W: x.W, H: x.H })), pontas: op.pontas };
    salvar(); L.lista.push(novo); L.atual = novo; L.sel = null; L.selCota = null; L.hist = []; L.zoom = 1;
    preencherAmbientes(); campos(); paleta(); props(); mudou(); analisar(); desenhar();
    (window.toast || console.log)(`Planta montada: ${out.unidades} máquinas em ${m.formato === 'U' ? m.celulas + ' célula(s) em U' : 'linha'}. Salva como "${novo.nome}".`);
    return out;
  }
  function sugHtml() {
    const g = A.sug, nm = nomeNo;
    const ganho = !g.faltaAntes && g.antes.porPeca > 0 ? (1 - g.depois.porPeca / g.antes.porPeca) * 100 : null;
    const rows = g.roc.rows.slice(0, 14), cols = g.roc.cols;
    const fmtNome = f => f === 'U' ? 'Células em U' : 'Linha';
    return `<div class="lay-sug"><div class="lay-sug-top"><div><b>✨ ${esc(g.nome)}</b><span>${g.maquinas} máquinas • ${g.formato === 'U' ? `${g.celulas} célula(s) em U, uma por família de produtos` : 'em linha (serpentina)'} • ambiente de ${fm(g.W)} × ${fm(g.H)} m${g.pontas ? ' • do corte até a expedição' : ''}</span>
      ${g.todos.length > 1 ? `<span>Comparou os formatos: ${g.todos.map(x => `${fmtNome(x.formato)} ${fm(x.porPeca)} m/pç`).join(' • ')} → ficou com ${fmtNome(g.formato)}.</span>` : ''}
      <span class="muted">${g.passos.toLocaleString('pt-BR')} trocas testadas em ${g.rodadas} partidas (ordem pelo ROC: ${fm(g.inicial)} m/pç → depois das trocas: ${fm(g.depois.porPeca)} m/pç)</span></div>
      <div class="lay-sug-cmp"><div><small>${esc(g.de)}</small><b>${g.faltaAntes ? '—' : fm(g.antes.porPeca) + ' m'}</b><span>${g.faltaAntes ? 'desenho incompleto' : 'por peça'}</span></div><i>→</i><div class="novo"><small>Planta sugerida</small><b>${fm(g.depois.porPeca)} m</b><span>por peça</span></div>${ganho != null ? `<div class="ganho ${ganho > 0 ? 'bom' : ''}"><b>${ganho > 0 ? '−' : '+'}${Math.abs(Math.round(ganho))}%</b><span>de deslocamento</span></div>` : ''}</div>
      <div class="lay-acts"><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.trocarNome('${esc(g.de)}')">Voltar para ${esc(g.de)}</button><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.fecharSug()">Fechar</button></div></div>
      <details class="lay-roc"><summary>Matriz produto × máquina ordenada (Rank Order Clustering) — ${g.fams} família(s) de produtos</summary>
      <div class="lay-mx-wrap"><table class="lay-mx roc"><thead><tr><th>Produto \\ Máquina</th>${cols.map(c => `<th title="${esc(nm(c))}">${esc(nm(c).slice(0, 14))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><th>${esc(nomeProd(r).slice(0, 26))}</th>${cols.map(c => `<td class="${g.roc.usa.get(r).has(c) ? 'on' : ''}">${g.roc.usa.get(r).has(c) ? '1' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${g.roc.rows.length > 14 ? `<p class="hint">Mostrando 14 de ${g.roc.rows.length} produtos.</p>` : ''}</details>
      <p class="hint">Cada máquina tem 0,8 m para a costureira; entre fileiras e células ficam corredores de 1,2 a 1,6 m. Arraste o que quiser: os metros por peça se recalculam. O ambiente original não foi alterado.</p></div>`;
  }

  /* ---------- assistente "Montar planta pela produção" ---------- */
  function assistente() {
    const d = D(), cxs = caixas(), prods = produtos().filter(p => seqMaquinas(p.ID_PRODUTO).filter(x => x.maq).length >= 2), mq = maquinas();
    const nMaq = mq.reduce((s, m) => s + (unisTipo(m.id).length || Math.max(1, m.total)), 0), temFixos = d && d.itens.some(i => i.tipo !== 'MAQ' && i.tipo !== 'LOTE');
    const W0 = Object.assign({ base: A.base === 'PRODUTO' ? 'PRODUTO' : cxs.length ? 'QUADRO' : 'TODOS', formato: 'AUTO', tamanho: d && d.itens.some(i => i.tipo === 'MAQ') ? 'ATUAL' : 'AUTO', fixos: !!temFixos, pontas: true }, L.wiz || {});
    L.wiz = W0;
    let m = $('layWiz'); if (!m) { m = document.createElement('div'); m.id = 'layWiz'; m.className = 'lay-wiz'; document.body.appendChild(m); m.addEventListener('mousedown', e => { if (e.target === m) m.classList.remove('show'); }); }
    const card = (grupo, val, tit, sub, on) => `<button type="button" class="wz-op ${on ? 'on' : ''}" onclick="gutLayout.wz('${grupo}','${val}')"><b>${tit}</b><span>${sub}</span></button>`;
    m.innerHTML = `<div class="wz-card" role="dialog" aria-modal="true" aria-labelledby="wzT"><div class="wz-head"><div><h3 id="wzT">🏭 Montar a planta pela produção</h3><p>O sistema usa as suas ${nMaq} máquinas cadastradas e o roteiro dos produtos para posicionar tudo com o menor caminho para a peça.</p></div><button class="cr-x" type="button" onclick="document.getElementById('layWiz').classList.remove('show')" aria-label="Fechar">×</button></div>
      <div class="wz-step"><span class="wz-n">1</span><div><b>Qual produção usar?</b><div class="wz-ops">
        ${card('base', 'QUADRO', 'O que está em produção agora', cxs.length ? `${cxs.length} caixa(s) no quadro interno` : 'nenhuma caixa no quadro agora', W0.base === 'QUADRO')}
        ${card('base', 'TODOS', 'Todos os meus produtos', `${prods.length} produto(s) com roteiro completo`, W0.base === 'TODOS')}
        ${card('base', 'PRODUTO', 'Um produto', 'escolha o produto e a quantidade', W0.base === 'PRODUTO')}</div>
        ${W0.base === 'PRODUTO' ? `<div class="wz-row"><label class="lay-f"><span>Produto</span><select onchange="gutLayout.an('prod',this.value);gutLayout.wizard()"><option value="">Escolha…</option>${prods.map(p => `<option value="${esc(p.ID_PRODUTO)}" ${String(p.ID_PRODUTO) === A.prod ? 'selected' : ''}>${esc(nomeProd(p.ID_PRODUTO))}</option>`).join('')}</select></label><label class="lay-f lay-n"><span>Peças</span><input inputmode="numeric" value="${esc(A.qtd)}" onchange="gutLayout.an('qtd',this.value)"></label></div>` : ''}</div></div>
      <div class="wz-step"><span class="wz-n">2</span><div><b>Formato da produção</b><div class="wz-ops">
        ${card('formato', 'AUTO', 'Automático', 'monta em linha e em células e fica com o melhor', W0.formato === 'AUTO')}
        ${card('formato', 'LINHA', 'Linha', 'fileiras seguindo a sequência das operações', W0.formato === 'LINHA')}
        ${card('formato', 'U', 'Células em U', 'uma célula para cada família de produtos', W0.formato === 'U')}</div></div></div>
      <div class="wz-step"><span class="wz-n">3</span><div><b>Espaço</b><div class="wz-ops">
        ${card('tamanho', 'AUTO', 'Calcular o tamanho ideal', 'o sistema diz quantos m² você precisa', W0.tamanho === 'AUTO')}
        ${card('tamanho', 'ATUAL', `Usar este ambiente`, d ? `${fm(d.largura)} × ${fm(d.comprimento)} m (${fm(d.largura * d.comprimento)} m²)` : '', W0.tamanho === 'ATUAL')}</div>
        <label class="wz-chk"><input type="checkbox" ${W0.pontas ? 'checked' : ''} onchange="gutLayout.wz('pontas',this.checked)"><span>Incluir o caminho do <b>corte</b> até a <b>expedição</b> <small>(usa a mesa de corte e a expedição do ambiente ou cria as duas)</small></span></label>
        ${temFixos ? `<label class="wz-chk"><input type="checkbox" ${W0.fixos ? 'checked' : ''} onchange="gutLayout.wz('fixos',this.checked)"><span>Manter no lugar as paredes, mesas, estoques e corredores deste ambiente</span></label>` : ''}</div></div>
      <div class="wz-foot"><span class="muted">${nMaq} máquinas • ${mq.length} tipos • o ambiente atual não é alterado: a planta sai num ambiente novo</span><button class="btn btn-primary" type="button" id="wzGo" onclick="gutLayout.wzMontar()">Montar planta</button></div></div>`;
    m.classList.add('show'); setTimeout(() => $('wzGo')?.focus(), 30);
  }

  function painelAnalise() {
    const el = $('layAn'); if (!el) return; const r = A.res || { lista: [], tipos: [], porProd: [], faltam: [], semMaq: [], mq: new Map() };
    const nm = id => r.mq.get(id) || 'Máquina sem cadastro', abrev = id => { const t = String(nm(id)); return t.length > 14 ? t.slice(0, 13) + '…' : t; };
    const maxF = Math.max(1, ...r.lista.map(f => f.qtd)), cell = new Map(r.lista.map(f => [f.a + '>' + f.b, f]));
    const top = r.lista.filter(f => f.custo != null).sort((a, b) => b.custo - a.custo).slice(0, 8), totC = r.lista.reduce((s, f) => s + (f.custo || 0), 0) || 1;
    const prods = produtos().filter(p => seqMaquinas(p.ID_PRODUTO).length);
    el.innerHTML = `<div class="lay-an-head"><div><h4>Fluxo e metros por peça</h4><p>Matriz De-Para (peças que vão de uma máquina para outra, pelo roteiro) × distância na planta. Quanto menor o total, melhor o layout.</p></div>
      <div class="lay-an-ctl"><label class="lay-f"><span>Base</span><select onchange="gutLayout.an('base',this.value)"><option value="QUADRO" ${A.base === 'QUADRO' ? 'selected' : ''}>Produção interna agora</option><option value="PRODUTO" ${A.base === 'PRODUTO' ? 'selected' : ''}>Um produto</option><option value="TODOS" ${A.base === 'TODOS' ? 'selected' : ''}>Todos os produtos (100 pç cada)</option></select></label>
      ${A.base === 'PRODUTO' ? `<label class="lay-f"><span>Produto</span><select onchange="gutLayout.an('prod',this.value)"><option value="">Escolha…</option>${prods.map(p => `<option value="${esc(p.ID_PRODUTO)}" ${String(p.ID_PRODUTO) === A.prod ? 'selected' : ''}>${esc(nomeProd(p.ID_PRODUTO))}</option>`).join('')}</select></label><label class="lay-f lay-n"><span>Peças</span><input inputmode="numeric" value="${esc(A.qtd)}" onchange="gutLayout.an('qtd',this.value)"></label>` : ''}
      <label class="lay-f"><span>Distância</span><select onchange="gutLayout.an('dist',this.value)"><option value="L" ${A.dist === 'L' ? 'selected' : ''}>Em L (corredores)</option><option value="R" ${A.dist === 'R' ? 'selected' : ''}>Em linha reta</option></select></label>
      <label class="lay-chk"><input type="checkbox" ${A.ver ? 'checked' : ''} onchange="gutLayout.an('ver',this.checked)"> Desenhar o fluxo na planta</label>
      <button class="btn btn-primary btn-sm" type="button" onclick="gutLayout.wizard()" title="Monta um ambiente novo com todas as máquinas do cadastro na posição que dá menos metros por peça">🏭 Montar planta pela produção</button></div></div>
      ${A.sug ? sugHtml() : ''}
      ${!r.pecas && !r.lista.length ? `<p class="hint">${A.base === 'PRODUTO' ? 'Escolha um produto com roteiro.' : 'Não há caixas na produção interna agora. Use a base "Um produto".'}${r.semMaq.length ? ' Alguns produtos não têm máquina nas operações do roteiro.' : ''}</p>` : `
      <div class="lay-kpis"><div class="k"><small>Metros por peça</small><b>${fm(r.porPeca)} m</b><span>caminho médio de uma peça entre as máquinas do roteiro</span></div>
        <div class="k"><small>Movimentação total</small><b>${Math.round(r.metros).toLocaleString('pt-BR')} m</b><span>para ${r.pecas.toLocaleString('pt-BR')} peça(s)${r.pecas ? ` • ≈ ${Math.round(r.metros / 60).toLocaleString('pt-BR')} min a pé (1 m/s)` : ''}</span></div>
        <div class="k"><small>Trocas de máquina</small><b>${r.lista.length}</b><span>pares diferentes no roteiro</span></div>
        ${top[0] ? `<div class="k warn"><small>Maior custo</small><b>${esc(abrev(top[0].a))} → ${esc(abrev(top[0].b))}</b><span>${Math.round(top[0].custo / totC * 100)}% de toda a movimentação</span></div>` : ''}</div>
      ${r.faltam.length ? `<p class="lay-an-warn">Fora da planta: ${r.faltam.map(id => esc(nm(id))).join(', ')}. Coloque essas máquinas para o cálculo ficar completo.</p>` : ''}
      <div class="lay-an-grid"><div class="lay-mx-wrap"><div class="lay-h">Matriz De-Para (peças)</div><table class="lay-mx"><thead><tr><th>De \\ Para</th>${r.tipos.map(t => `<th title="${esc(nm(t))}">${esc(abrev(t))}</th>`).join('')}</tr></thead><tbody>
        ${r.tipos.map(a => `<tr><th title="${esc(nm(a))}">${esc(abrev(a))}</th>${r.tipos.map(b => { const f = cell.get(a + '>' + b); if (!f) return `<td class="${a === b ? 'diag' : ''}"></td>`; const al = 0.12 + 0.75 * f.qtd / maxF; return `<td class="${al > 0.5 ? 'forte' : ''}" style="--a:${al.toFixed(2)}" title="${esc(nm(a))} → ${esc(nm(b))}: ${f.qtd} pç${f.d != null ? ' • ' + fm(f.d) + ' m' : ' • fora da planta'}\n${esc([...f.ops].join('\n'))}"><b>${f.qtd.toLocaleString('pt-BR')}</b>${f.d != null ? `<small>${fm(f.d)} m</small>` : '<small>—</small>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div><div class="lay-h">Onde a peça mais anda (peças × metros)</div><div class="lay-rank">${top.map(f => `<div class="lay-rk"><span>${esc(nm(f.a))} → ${esc(nm(f.b))}</span><b>${Math.round(f.custo).toLocaleString('pt-BR')} m</b><i style="width:${Math.max(3, f.custo / top[0].custo * 100)}%"></i><small>${f.qtd} pç × ${fm(f.d)} m${f.ua ? ` • ${esc(f.ua.nome)} → ${esc(f.ub.nome)}` : ''}</small></div>`).join('') || '<p class="hint">Sem trocas de máquina na planta.</p>'}</div>
      ${r.porProd.length > 1 ? `<div class="lay-h">Por produto</div><div class="lay-rank">${r.porProd.sort((a, b) => b.m * b.qtd - a.m * a.qtd).slice(0, 8).map(x => `<div class="lay-rk sm"><span>${esc(nomeProd(x.pid))}</span><b>${fm(x.m)} m/pç</b><small>${x.qtd} pç • ${x.passos} operações${x.ok ? '' : ' • falta máquina na planta'}</small></div>`).join('')}</div>` : ''}</div></div>`}${oeeTabela()}`;
  }

  /* ---------- desenho (SVG em metros) ---------- */
  const PAD = 0.9;
  function escala() {
    const wrap = $('layWrap'), d = D(); if (!wrap || !d) return 40;
    const alt = L.cheia ? wrap.clientHeight - 24 : Math.max(360, window.innerHeight - 290);
    const fit = Math.max(8, Math.min((wrap.clientWidth - 24) / (d.largura + PAD * 2), alt / (d.comprimento + PAD * 2)));
    return fit * L.zoom;
  }
  function desenhar() {
    const svg = $('laySvg'), d = D(); if (!svg || !d) return;
    const W = d.largura, H = d.comprimento, s = escala(), c = d.celula, occ = ocupacao();
    svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`);
    svg.setAttribute('width', Math.round((W + PAD * 2) * s)); svg.setAttribute('height', Math.round((H + PAD * 2) * s));
    const fs = Math.max(0.16, Math.min(0.3, 14 / s));
    let g = `<defs><pattern id="layG" width="${c}" height="${c}" patternUnits="userSpaceOnUse"><path d="M ${c} 0 L 0 0 0 ${c}" class="lay-grid"/></pattern><pattern id="layG1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" class="lay-grid1"/></pattern>
      <pattern id="layHatch" width="0.25" height="0.25" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V0.25" class="lay-hatch"/></pattern>
      <marker id="laySpA" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="${fs * 1.1}" markerHeight="${fs * 1.1}" orient="auto"><path d="M0 0L10 5L0 10z" class="lay-spm"/></marker><marker id="layArr" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${fs * 1.3}" markerHeight="${fs * 1.3}" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="lay-arrm"/></marker><marker id="layTick" viewBox="-5 -5 10 10" markerUnits="userSpaceOnUse" markerWidth="${fs * 1.4}" markerHeight="${fs * 1.4}" orient="auto"><path d="M0 -4V4" class="lay-tickm"/></marker></defs>`;
    g += `<rect x="0" y="0" width="${W}" height="${H}" class="lay-floor"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#layG)"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#layG1)"/><rect x="0" y="0" width="${W}" height="${H}" class="lay-wall"/>`;
    const passo = W > 60 || H > 60 ? 10 : W > 25 || H > 25 ? 5 : 1;
    for (let x = 0; x <= W + 1e-6; x += passo) g += `<text x="${x}" y="${-0.25}" class="lay-rul" font-size="${fs}" text-anchor="middle">${Math.round(x)}</text>`;
    for (let y = passo; y <= H + 1e-6; y += passo) g += `<text x="${-0.25}" y="${y + fs / 3}" class="lay-rul" font-size="${fs}" text-anchor="end">${Math.round(y)}</text>`;
    { const cel = new Map(); d.itens.filter(i => i.tipo === 'MAQ' && i.celula).forEach(i => { const b = cel.get(i.celula) || { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 }; b.x1 = Math.min(b.x1, i.x); b.y1 = Math.min(b.y1, i.y); b.x2 = Math.max(b.x2, i.x + i.w); b.y2 = Math.max(b.y2, i.y + i.h); cel.set(i.celula, b); });
      cel.forEach((b, k) => { g += `<rect x="${b.x1 - 0.25}" y="${b.y1 - 0.25}" width="${b.x2 - b.x1 + 0.5}" height="${b.y2 - b.y1 + 0.5}" rx="0.3" class="lay-cel"/><text x="${b.x1 - 0.2}" y="${b.y1 - 0.4}" font-size="${fs * 0.85}" class="lay-celtx">Célula ${k}</text>`; }); }
    d.itens.filter(it => it.tipo !== 'LOTE').forEach(it => {
      const po = it.tipo === 'MAQ' && opDoItem(it) ? postoCarga(it) : null, oe = it.tipo === 'MAQ' && P.cor === 'OEE' ? oeeDe(it) : null, pr = it.tipo === 'MAQ' && it.uni && P.oee.get(it.uni) && P.oee.get(it.uni).parada_aberta;
      const o = it.tipo === 'MAQ' ? (po || occ.get(it.maq || '')) : null, p = o ? o.pct : 0;
      const cl = it.tipo === 'MAQ' ? 'maq ' + (P.cor === 'OEE' ? (oe && !oe.vazio ? classeOee(oe.oee) : 'idle') : classe(p)) + (po ? ' posto' : '') + (pr ? ' parada' : '') : 'blk t-' + it.tipo.toLowerCase() + (it.papel ? ' ponta' : '');
      const sel = it.id === L.sel ? ' sel' : '', ca = L.cotaA === it.id ? ' cota-a' : '';
      const tx = it.x + it.w / 2, ty = it.y + it.h / 2, small = Math.min(it.w, it.h), f = Math.max(0.12, Math.min(fs, it.tipo === 'MAQ' ? Math.max(small * 0.4, it.w * 0.17) : small * 0.36));
      const rot = it.h > it.w * 1.6 && it.tipo !== 'MAQ' ? ` transform="rotate(-90 ${tx} ${ty})"` : '';
      g += `<g class="lay-it ${cl}${sel}${ca}" data-it="${it.id}"><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${Math.min(0.08, small / 6)}" class="lay-body-r"/>`;
      if (it.tipo === 'MAQ') {
        const bw = it.w * 0.8, pct = isFinite(p) ? Math.min(100, p) : 100;
        g += `<rect x="${it.x + it.w * 0.1}" y="${it.y + it.h - Math.max(0.07, it.h * 0.16)}" width="${bw}" height="${Math.max(0.035, it.h * 0.07)}" rx="0.02" class="lay-bar-bg"/><rect x="${it.x + it.w * 0.1}" y="${it.y + it.h - Math.max(0.07, it.h * 0.16)}" width="${bw * pct / 100}" height="${Math.max(0.035, it.h * 0.07)}" rx="0.02" class="lay-bar"/>`;
        if (opDoItem(it)) g += `<text x="${tx}" y="${it.y - f * 0.35}" font-size="${f * 0.8}" class="lay-optx" text-anchor="middle">${pr ? '⛔ ' : '👤 '}${esc(curto(operadorNome(opDoItem(it)).split(/\s+/)[0] || 'func.', 14))}</text>`;
        else if (pr) g += `<text x="${tx}" y="${it.y - f * 0.35}" font-size="${f * 0.8}" class="lay-optx" text-anchor="middle">⛔ parada</text>`;
        if (L.alvo === it.id) g += `<rect x="${it.x - 0.12}" y="${it.y - 0.12}" width="${it.w + 0.24}" height="${it.h + 0.24}" rx="0.12" class="lay-alvo"/>`;
        g += `<text x="${tx}" y="${ty - f * 0.25}" font-size="${f}" class="lay-tx" text-anchor="middle">${esc(curto(it.nome, it.w / f * 1.7))}</text><text x="${tx}" y="${ty + f * 0.85}" font-size="${f * 0.95}" class="lay-pct" text-anchor="middle">${P.cor === 'OEE' ? (oe && !oe.vazio ? 'OEE ' + pctTxt(oe.oee) : '—') : o && o.cap ? (isFinite(p) ? Math.round(p) + '%' : '>999%') : '—'}</text>`;
      } else {
        g += `<text x="${tx}" y="${ty + f * 0.35}" font-size="${f}" class="lay-tx" text-anchor="middle"${rot}>${esc(curto(it.nome, (rot ? it.h : it.w) / f * 1.7))}</text>`;
      }
      g += `<title>${esc(it.nome)} • ${fm(it.w)} × ${fm(it.h)} m${o && o.cap ? ` • ocupação hoje ${isFinite(p) ? Math.round(p) : '>999'}%` : ''}</title></g>`;
    });
    const cx = mapaCaixas();
    if (L.fluxo) fluxos().forEach(f => { if (!f.alvo) return; const bx = f.alvo.x + f.alvo.w / 2, by = f.alvo.y + f.alvo.h / 2, mx = (f.lx + bx) / 2, my = (f.ly + by) / 2;
      g += `<g class="lay-flx${f.c.ativa ? ' ativa' : ''}"><line x1="${f.lx}" y1="${f.ly}" x2="${bx}" y2="${by}" class="lay-fl" marker-end="url(#layArr)"/><text x="${mx}" y="${my - fs * 0.35}" font-size="${fs * 0.75}" text-anchor="middle" class="lay-ftx" stroke-width="${fs * 0.18}">${esc(curto(f.c.op, 18))} • ${fm(f.dist)} m</text></g>`; });
    if (A.ver && A.res) { const mx = Math.max(1, ...A.res.lista.map(f => f.qtd));
      A.res.lista.filter(f => f.ua && f.ub).forEach(f => { const a = [f.ua.x + f.ua.w / 2, f.ua.y + f.ua.h / 2], b = [f.ub.x + f.ub.w / 2, f.ub.y + f.ub.h / 2], w = 1.5 + 7 * f.qtd / mx;
        const path = A.dist === 'L' ? `M${a[0]} ${a[1]} L${b[0]} ${a[1]} L${b[0]} ${b[1]}` : `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
        g += `<path d="${path}" class="lay-sp" style="stroke-width:${w.toFixed(1)}px" marker-end="url(#laySpA)"><title>${esc(f.qtd + ' pç • ' + fm(f.d) + ' m')}</title></path>`; }); }
    d.itens.filter(it => it.tipo === 'LOTE').forEach(it => {
      const c = cx.get(it.vol), sel = it.id === L.sel ? ' sel' : '', ca = L.cotaA === it.id ? ' cota-a' : '', st = !c ? ' fora' : c.feito ? ' feito' : c.ativa ? ' ativa' : '';
      const f = Math.max(0.12, Math.min(fs * 0.85, it.w * 0.16)), pct = c ? Math.min(100, c.pct) : 0;
      g += `<g class="lay-it lote${st}${sel}${ca}" data-it="${it.id}"><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="0.06" class="lay-body-r"/>
        <text x="${it.x + it.w / 2}" y="${it.y + it.h * 0.42}" font-size="${f}" text-anchor="middle" class="lay-tx">${esc(curto(c ? c.cod : 'lote', it.w / f * 1.9))}</text>
        <text x="${it.x + it.w / 2}" y="${it.y + it.h * 0.42 + f * 1.05}" font-size="${f * 0.85}" text-anchor="middle" class="lay-pct">${c ? c.qtd + ' pç • ' + Math.round(c.pct) + '%' : 'saiu'}</text>
        <rect x="${it.x + it.w * 0.08}" y="${it.y + it.h - it.h * 0.17}" width="${it.w * 0.84}" height="${it.h * 0.07}" rx="0.02" class="lay-bar-bg"/><rect x="${it.x + it.w * 0.08}" y="${it.y + it.h - it.h * 0.17}" width="${it.w * 0.84 * pct / 100}" height="${it.h * 0.07}" rx="0.02" class="lay-bar"/>
        <title>${c ? esc(c.cod + ' • ' + c.prod + ' • ' + c.qtd + ' pç • ' + Math.round(c.pct) + '%' + (c.op ? ' • próxima: ' + c.op : '')) : 'Lote que já saiu da produção interna'}</title></g>`;
    });
    d.cotas.forEach(cq => {
      const m = medir(cq); if (!m) return; const mx = (m.ax + m.bx) / 2, my = (m.ay + m.by) / 2, sel = L.selCota === cq.id ? ' sel' : '';
      g += `<g class="lay-cota-g${sel}" data-cota="${cq.id}"><line x1="${m.ax}" y1="${m.ay}" x2="${m.bx}" y2="${m.by}" class="lay-cl" marker-start="url(#layTick)" marker-end="url(#layTick)"/><line x1="${m.ax}" y1="${m.ay}" x2="${m.bx}" y2="${m.by}" class="lay-chit"/>
        <circle cx="${m.ax}" cy="${m.ay}" r="${fs * 0.28}" class="lay-cp"/><circle cx="${m.bx}" cy="${m.by}" r="${fs * 0.28}" class="lay-cp"/>
        <rect x="${mx - fs * 1.9}" y="${my - fs * 0.75}" width="${fs * 3.8}" height="${fs * 1.4}" rx="${fs * 0.3}" class="lay-cbox"/><text x="${mx}" y="${my + fs * 0.3}" font-size="${fs * 0.9}" text-anchor="middle" class="lay-ctx">${fm(m.reta)} m</text></g>`;
    });
    svg.innerHTML = g;
    const vz = $('layVazio'); if (vz) vz.hidden = d.itens.length > 0 || L.so;
    const hint = $('layHint'); if (hint) hint.textContent = L.modo === 'COTA' ? (L.cotaA ? 'Agora toque no segundo item para medir.' : 'Cota: toque no primeiro item.') : '';
  }
  function curto(t, max) { t = String(t || ''); max = Math.max(3, Math.floor(max)); return t.length > max ? t.slice(0, max - 1) + '…' : t; }

  /* ---------- interação ---------- */
  function pt(e) {
    const svg = $('laySvg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, y: q.y };
  }
  const snap = v => { const c = D().celula; return Math.round(v / c) * c; };
  function limitar(it) {
    const d = D(); it.w = Math.max(0.1, Math.min(it.w, d.largura)); it.h = Math.max(0.1, Math.min(it.h, d.comprimento));
    it.x = r2(Math.max(0, Math.min(d.largura - it.w, it.x))); it.y = r2(Math.max(0, Math.min(d.comprimento - it.h, it.y)));
  }
  function bindSvg() {
    const svg = $('laySvg'), wrap = $('layWrap'); if (!svg || svg._lay) return; svg._lay = true;
    let drag = null;
    svg.addEventListener('pointerdown', e => {
      const g = e.target.closest('[data-it]'), cg = e.target.closest('[data-cota]');
      if (L.modo === 'COTA') {
        if (!g) { L.cotaA = null; desenhar(); return; }
        const id = g.dataset.it;
        if (!L.cotaA) { L.cotaA = id; desenhar(); return; }
        if (L.cotaA !== id) { snapshot(); const d = D(); if (!d.cotas.some(c => (c.a === L.cotaA && c.b === id) || (c.a === id && c.b === L.cotaA))) d.cotas.push({ id: uid(), a: L.cotaA, b: id }); L.cotaA = id; mudou(); props(); }
        return;
      }
      if (cg && !g) { L.selCota = cg.dataset.cota; L.sel = null; desenhar(); props(); return; }
      if (!g) { L.sel = null; L.selCota = null; desenhar(); props(); return; }
      const it = D().itens.find(i => i.id === g.dataset.it); if (!it) return;
      L.drag = true; if (it.tipo === 'MAQ') L.alvo = it.id; L.sel = it.id; L.selCota = null; const p = pt(e); drag = { it, dx: p.x - it.x, dy: p.y - it.y, x0: it.x, y0: it.y, moveu: false };
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      desenhar(); props(); e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return; const p = pt(e), nx = snap(p.x - drag.dx), ny = snap(p.y - drag.dy);
      if (nx === drag.it.x && ny === drag.it.y) return;
      if (!drag.moveu) { snapshot(); drag.moveu = true; }
      drag.it.x = nx; drag.it.y = ny; limitar(drag.it); desenhar();
    });
    const fim = () => { if (drag && drag.moveu) { mudou(false); props(); } drag = null; L.drag = false; };
    svg.addEventListener('pointerup', fim); svg.addEventListener('pointercancel', fim);
    wrap.addEventListener('dragover', e => { if (L.arr) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (x) {} } });
    wrap.addEventListener('drop', e => { if (!L.arr) return; e.preventDefault(); const p = pt(e); adicionar(L.arr.tipo, L.arr.maq, p); L.arr = null; });
    document.addEventListener('dragend', () => { L.arr = null; });
    window.addEventListener('resize', () => { if (visivel()) desenhar(); });
    document.addEventListener('keydown', e => {
      if (!visivel() || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '') || document.querySelector('.modal.show')) return;
      const k = e.key.toLowerCase(), it = D().itens.find(i => i.id === L.sel);
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); desfazer(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'd' && it) { e.preventDefault(); duplicar(); return; }
      if (k === 'f' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); return cheia(); }
      if (k === 'p' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); return soPlanta(!L.so); }
      if (k === 'escape' && L.so) { soPlanta(false); return; }
      if (k === 'escape' && L.cheia && !document.fullscreenElement) { cheia(false); return; }
      if (k === 'v') return modo('MOVER'); if (k === 'c' && !e.ctrlKey && !e.metaKey) return modo('COTA');
      if (k === 'escape') { L.alvo = null; L.cotaA = null; L.sel = null; L.selCota = null; desenhar(); props(); return; }
      if ((k === 'delete' || k === 'backspace')) { e.preventDefault(); if (it) excluirItem(); else if (L.selCota) excluirCota(L.selCota); return; }
      if (!it) return; if (k === 'r') return girar();
      const c = D().celula, mv = { arrowleft: [-c, 0], arrowright: [c, 0], arrowup: [0, -c], arrowdown: [0, c] }[k];
      if (mv) { e.preventDefault(); snapshot(); it.x += mv[0]; it.y += mv[1]; limitar(it); mudou(); props(); }
    });
  }
  const visivel = () => { const v = $('view-layout'); return v && v.classList.contains('active') && !!D(); };

  function lugarLivre(w, h) {
    const d = D(), c = d.celula, ocup = (x, y) => d.itens.some(i => x < i.x + i.w && x + w > i.x && y < i.y + i.h && y + h > i.y);
    for (let y = c; y + h <= d.comprimento; y += c) for (let x = c; x + w <= d.largura; x += c) if (!ocup(x, y)) return { x, y };
    return { x: 0, y: 0 };
  }
  function adicionar(tipo, maq, p, uniEsp) {
    const d = D(); snapshot(); let it;
    if (tipo === 'LOTE') {
      const ex = d.itens.find(i => i.tipo === 'LOTE' && i.vol === maq);
      if (ex) { L.hist.pop(); if (p) { snapshot(); ex.x = snap(p.x - ex.w / 2); ex.y = snap(p.y - ex.h / 2); limitar(ex); } L.sel = ex.id; mudou(); props(); return; }
      it = { id: uid(), tipo: 'LOTE', vol: maq, nome: (mapaCaixas().get(maq) || {}).cod || 'Lote', w: LOTE_W, h: LOTE_H };
      if (!p) { const c = mapaCaixas().get(maq), alvo = c && d.itens.find(i => i.tipo === 'MAQ' && i.maq === c.opMaq); if (alvo) p = { x: alvo.x + alvo.w / 2, y: alvo.y + alvo.h + LOTE_H / 2 + d.celula }; }
    } else if (tipo === 'MAQ') {
      const m = maquinas().find(x => x.id === maq), n = d.itens.filter(i => i.tipo === 'MAQ' && i.maq === maq).length + 1;
      const usadas = new Set(d.itens.filter(i => i.uni).map(i => i.uni)), un = (uniEsp && unis().find(u => u.id === uniEsp)) || unisTipo(maq).find(u => !usadas.has(u.id));
      it = { id: uid(), tipo: 'MAQ', maq, uni: un ? un.id : '', nome: un ? un.codigo : `${m ? m.nome : 'Máquina'} ${n}`, w: MAQ_W, h: MAQ_H };
    }
    else { const b = BLOCOS.find(x => x.tipo === tipo) || BLOCOS[5]; it = { id: uid(), tipo: b.tipo, nome: b.nome, w: b.w, h: b.h }; }
    if (p) { it.x = snap(p.x - it.w / 2); it.y = snap(p.y - it.h / 2); } else Object.assign(it, lugarLivre(it.w, it.h));
    limitar(it); d.itens.push(it); L.sel = it.id; L.selCota = null; if (L.modo !== 'MOVER') modo('MOVER', true); mudou(); paleta(); props();
  }
  function duplicar() { const d = D(), it = d.itens.find(i => i.id === L.sel); if (!it) return; snapshot(); const c = d.celula; const n = Object.assign({}, it, { id: uid(), x: it.x + c * 2, y: it.y + c * 2 }); if (n.tipo === 'MAQ') n.nome = it.nome.replace(/\s\d+$/, '') + ' ' + (d.itens.filter(i => i.maq === it.maq).length + 1); limitar(n); d.itens.push(n); L.sel = n.id; mudou(); paleta(); props(); }
  function girar() { const it = D().itens.find(i => i.id === L.sel); if (!it) return; snapshot(); const cx = it.x + it.w / 2, cy = it.y + it.h / 2;[it.w, it.h] = [it.h, it.w]; it.x = snap(cx - it.w / 2); it.y = snap(cy - it.h / 2); limitar(it); mudou(); props(); }
  function excluirItem() { const d = D(); if (!L.sel) return; snapshot(); d.itens = d.itens.filter(i => i.id !== L.sel); d.cotas = d.cotas.filter(c => c.a !== L.sel && c.b !== L.sel); L.sel = null; mudou(); paleta(); props(); }
  function excluirCota(id) { snapshot(); D().cotas = D().cotas.filter(c => c.id !== id); if (L.selCota === id) L.selCota = null; mudou(); props(); }
  function desfazer() { const s = L.hist.pop(); if (!s) { (window.toast || alert)('Nada para desfazer.'); return; } L.atual.dados = JSON.parse(s); L.sel = null; L.selCota = null; campos(); mudou(); paleta(); props(); }
  function modo(m, silencioso) { L.modo = m; L.cotaA = null; document.querySelectorAll('[data-lm]').forEach(b => b.classList.toggle('active', b.dataset.lm === m)); const w = $('layWrap'); if (w) w.classList.toggle('lay-cota-mode', m === 'COTA'); if (!silencioso) desenhar(); else desenhar(); }

  function cheia(forcar) {
    const v = $('view-layout'); if (!v) return;
    L.cheia = typeof forcar === 'boolean' ? forcar : !L.cheia;
    if (!L.cheia && L.so) { L.so = false; v.classList.remove('lay-so'); }
    document.body.classList.toggle('lay-full', L.cheia); v.classList.toggle('lay-full-on', L.cheia);
    const b = $('layFullBtn'); if (b) b.textContent = L.cheia ? '✕ Sair da tela cheia' : '⛶ Tela cheia';
    try { if (L.cheia && !document.fullscreenElement && v.requestFullscreen) v.requestFullscreen().catch(() => {}); else if (!L.cheia && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
    lados(); L.zoom = 1; setTimeout(desenhar, 60); setTimeout(desenhar, 350);
  }
  function soPlanta(on) {
    L.so = !!on; const v = $('view-layout'); if (!v) return;
    if (L.so && !L.cheia) cheia(true);
    v.classList.toggle('lay-so', L.so);
    if (!L.so && L.saiuSo) { L.saiuSo = false; }
    L.zoom = 1; setTimeout(desenhar, 60); setTimeout(desenhar, 350);
  }
  function lados() {
    const b = document.querySelector('#view-layout .lay-body'); if (!b) return;
    b.classList.toggle('sem-pal', L.cheia && L.semPal); b.classList.toggle('sem-prop', L.cheia && L.semProp);
    $('layPalBtn')?.classList.toggle('active', !L.semPal); $('layPropBtn')?.classList.toggle('active', !L.semProp);
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && L.cheia) { if (L.so) { L.so = false; $('view-layout')?.classList.remove('lay-so'); } cheia(false); } });

  /* ---------- bipagem: máquina → caixas ao lado dela ---------- */
  function aviso(m, tipo) { const h = $('layHint'); if (h) { h.textContent = m; h.className = 'lay-hint ' + (tipo || ''); clearTimeout(L.tAviso); L.tAviso = setTimeout(() => { h.textContent = ''; h.className = 'lay-hint'; }, 6000); } if (L.so || !h) (window.toast || console.log)(m, tipo === 'erro'); }
  function vagaPerto(m, w, h) {
    const d = D(), c = d.celula, livre = (x, y) => x >= 0 && y >= 0 && x + w <= d.largura && y + h <= d.comprimento && !d.itens.some(i => i.tipo !== 'AREA' && i.tipo !== 'CORREDOR' && x < i.x + i.w - 1e-6 && x + w > i.x + 1e-6 && y < i.y + i.h - 1e-6 && y + h > i.y + 1e-6);
    const cand = [];
    for (let r = 0; r < 6; r++) {
      const gap = c * (1 + r);
      cand.push([m.x, m.y + m.h + gap - c + c * 0], [m.x + m.w + gap - c, m.y], [m.x, m.y - h - gap + c], [m.x - w - gap + c, m.y]);
      for (let k = 1; k <= r + 1; k++) cand.push([m.x + k * (w + c), m.y + m.h + gap - c], [m.x - k * (w + c), m.y + m.h + gap - c]);
    }
    for (const [x, y] of cand) { const sx = snap(x), sy = snap(y); if (livre(sx, sy)) return { x: sx, y: sy }; }
    return lugarLivre(w, h);
  }
  function bipar(txt) {
    const t = String(txt || '').trim(); if (!t || !D()) return;
    const d = D(), up = t.toUpperCase();
    // funcionário
    if (up.startsWith('GUT-OP:')) {
      const id = t.slice(7), nome = operadorNome(id); if (!nome) return aviso('Crachá não encontrado no cadastro de funcionários.', 'erro');
      const m = d.itens.find(i => i.id === L.alvo); if (!m) return aviso(`${nome}: bipe primeiro a máquina onde ela trabalha.`, 'erro');
      snapshot(); d.itens.forEach(i => { if (i.op === id) i.op = ''; }); m.op = id; mudou(); props();
      if (m.uni && web()) GUT_SB.rpc('web_posto_definir', { p_slug: GUT_EMPRESA_SLUG, p_id_operador: id, p_id_unidade: m.uni }).then(r => { if (r.error) aviso(r.error.message, 'erro'); else carregarPostos(true).then(() => { desenhar(); props(); }); });
      return aviso(`${nome} no posto ${m.nome}.`, 'ok');
    }
    // máquina
    const cod = up.startsWith('GUT-MAQ:') ? up.slice(8) : up, un = unis().find(u => String(u.codigo).toUpperCase() === cod);
    if (un) {
      let m = d.itens.find(i => i.uni === un.id);
      if (!m) { adicionar('MAQ', String(un.maq), null, un.id); m = d.itens.find(i => i.uni === un.id); aviso(`${un.codigo} não estava na planta: coloquei num lugar livre, arraste até onde ela fica. Agora bipe as caixas.`, 'ok'); }
      else aviso(`${un.codigo} selecionada. Agora bipe as caixas que estão ao lado dela.`, 'ok');
      L.alvo = m.id; L.sel = m.id; L.selCota = null; desenhar(); props(); return;
    }
    if (up.startsWith('GUT-MAQ:')) return aviso(`A máquina ${cod} não está numerada no cadastro.`, 'erro');
    // caixa (código da etiqueta da caixa, ID do volume ou código de um cupom dela)
    const cxs = caixas(), rows = (STATE.internalBoard && STATE.internalBoard.rows) || [];
    let c = cxs.find(x => String(x.cod).toUpperCase() === up || String(x.id).toUpperCase() === up);
    if (!c) { const r = rows.find(v => (v.OPERACOES || []).some(o => String(o.COD_CUPOM || '').toUpperCase() === up || String(o.QR_TEXT || '').toUpperCase() === up)); if (r) c = cxs.find(x => x.id === String(r.ID_VOLUME)); }
    if (!c) return aviso(`"${t}" não é uma máquina numerada nem uma caixa que está na produção interna.`, 'erro');
    const m = d.itens.find(i => i.id === L.alvo);
    if (!m) { adicionar('LOTE', c.id); return aviso(`Caixa ${c.cod} na planta. Para pôr ao lado de uma máquina, bipe a máquina antes.`, 'ok'); }
    snapshot(); let l = d.itens.find(i => i.tipo === 'LOTE' && i.vol === c.id);
    if (!l) { l = { id: uid(), tipo: 'LOTE', vol: c.id, nome: c.cod, w: LOTE_W, h: LOTE_H }; d.itens.push(l); }
    const ant = { x: l.x, y: l.y }; l.x = -999; l.y = -999; const v = vagaPerto(m, l.w, l.h); l.x = v.x; l.y = v.y; l.perto = m.id; limitar(l);
    L.sel = m.id; mudou(); paleta(); props();
    const f = fluxos().find(x => x.l.id === l.id), dica = c.feito ? ' Todas as operações já estão concluídas.' : c.op ? ` Próxima operação: ${c.op}${f && f.alvo && f.alvo.id !== m.id ? ` (na ${f.alvo.nome})` : ''}.` : '';
    aviso(`Caixa ${c.cod} ao lado da ${m.nome}.${dica}`, 'ok');
  }
  async function camera() {
    if (!('BarcodeDetector' in window)) return aviso('Este navegador não lê QR pela câmera. Use o leitor ou digite o código.', 'erro');
    let st; const dlg = document.createElement('div'); dlg.className = 'lay-cam'; dlg.innerHTML = '<video playsinline muted></video><div class="lay-cam-bar"><span id="layCamMsg">Aponte para a etiqueta</span><button type="button">Fechar</button></div>'; document.body.appendChild(dlg);
    const fim = () => { try { st && st.getTracks().forEach(t => t.stop()); } catch (e) {} dlg.remove(); }; dlg.querySelector('button').onclick = fim;
    try {
      st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const vid = dlg.querySelector('video'); vid.srcObject = st; await vid.play();
      const det = new BarcodeDetector({ formats: ['qr_code'] }); let ult = '', quando = 0;
      const loop = async () => { if (!document.body.contains(dlg)) return; try { const r = await det.detect(vid); const v = r[0] && r[0].rawValue; if (v && (v !== ult || Date.now() - quando > 2500)) { ult = v; quando = Date.now(); bipar(v); const msg = $('layCamMsg'); if (msg) msg.textContent = 'Lido: ' + v; try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} } } catch (e) {} setTimeout(loop, 250); };
      loop();
    } catch (e) { fim(); aviso('Não foi possível abrir a câmera: ' + e.message, 'erro'); }
  }

  window.gutLayout = {
    bipar, camera, alvo: () => L.alvo, analise: () => A.res,
    sugerir, wizard: () => assistente(), cor(v) { P.cor = v; carregarPostos(true).then(() => { paleta(); desenhar(); props(); }); }, postos: () => P,
    wz(k, v) { L.wiz = Object.assign(L.wiz || {}, { [k]: v }); if (k === 'base') { A.base = v; analisar(); } if (k !== 'pontas' && k !== 'fixos') assistente(); },
    wzMontar() { const w = L.wiz || {}, b = $('wzGo'); if (b) { b.disabled = true; b.textContent = 'Montando…'; }
      setTimeout(() => { const out = sugerir({ formato: w.formato || 'AUTO', tamanho: w.tamanho || 'AUTO', fixos: !!w.fixos, pontas: w.pontas !== false }); if (out && !out.erro) { $('layWiz')?.classList.remove('show'); setTimeout(() => $('layAn')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); } else if (b) { b.disabled = false; b.textContent = 'Montar planta'; } }, 30); },
    fecharSug() { A.sug = null; painelAnalise(); },
    trocarNome(n) { const i = L.lista.findIndex(x => x.nome === n); if (i >= 0) { gutLayout.trocar(i); preencherAmbientes(); analisar(); desenhar(); } },
    an(k, v) { if (k === 'ver') A.ver = !!v; else if (k === 'qtd') A.qtd = Math.max(1, Math.round(num(v)) || 1); else A[k] = v; analisar(); desenhar(); },
    cheia: () => { if (L.so) soPlanta(false); cheia(); }, soPlanta: on => soPlanta(on), lado(q) { if (q === 'pal') L.semPal = !L.semPal; else L.semProp = !L.semProp; lados(); setTimeout(desenhar, 30); },
    fluxo(on) { L.fluxo = !!on; desenhar(); },
    limparLotes() { const cx = mapaCaixas(); snapshot(); D().itens = D().itens.filter(i => i.tipo !== 'LOTE' || cx.has(i.vol)); const ids = new Set(D().itens.map(i => i.id)); D().cotas = D().cotas.filter(c => ids.has(c.a) && ids.has(c.b)); mudou(); paleta(); props(); },
    abrirLote(id) { cheia(false); try { showView('dash-interna'); if (typeof setInternalDashboardMode === 'function') setInternalDashboardMode('KANBAN'); openProdOps(id); } catch (e) {} },
    trocar(i) { salvar(); L.atual = L.lista[Number(i)] || L.lista[0]; L.sel = null; L.selCota = null; L.hist = []; campos(); paleta(); analisar(); desenhar(); props(); status(); preencherAmbientes(); },
    novo() { salvar(); const n = { id: '', nome: 'Ambiente ' + (L.lista.length + 1), dados: novoDados() }; L.lista.push(n); L.atual = n; L.sel = null; L.hist = []; preencherAmbientes(); campos(); paleta(); desenhar(); props(); mudou(false); },
    campo(k, v) {
      const d = D(); snapshot();
      if (k === 'nome') { L.atual.nome = String(v).slice(0, 60) || 'Ambiente'; mudou(false); clearTimeout(L.t2); L.t2 = setTimeout(preencherAmbientes, 600); return; }
      if (k === 'celula') d.celula = num(v) || 0.5;
      else { const x = num(v); if (x <= 0 || x > 500) { (window.toast || alert)('Informe um valor entre 0,1 e 500 m.', true); campos(); return; } d[k] = r2(x); d.itens.forEach(limitar); }
      campos(); mudou();
    },
    prop(k, v) {
      const it = D().itens.find(i => i.id === L.sel); if (!it) return; snapshot();
      if (k === 'nome') { it.nome = String(v).slice(0, 40); mudou(); return; }
      if (k === 'maq') { it.maq = v; it.uni = ''; mudou(); paleta(); props(); return; }
      if (k === 'uni') { it.uni = v; const u = unis().find(x => x.id === v); if (u) it.nome = u.codigo; mudou(); paleta(); props(); return; }
      if (k === 'op') { const antes = opDoItem(it); it.op = v; if (!v && antes && it.uni && web()) GUT_SB.rpc('web_posto_definir', { p_slug: GUT_EMPRESA_SLUG, p_id_operador: antes, p_id_unidade: '' }).then(() => carregarPostos(true)).then(() => { desenhar(); props(); }); mudou(); props(); return; }
      if (k === 'papel') { if (v) D().itens.forEach(i => { if (i !== it && i.papel === v) delete i.papel; }); if (v) it.papel = v; else delete it.papel; mudou(); props(); return; }
      const x = num(v); if (k === 'w' || k === 'h') { if (x <= 0) return props(); it[k] = r2(x); } else it[k] = r2(x);
      limitar(it); mudou(); props();
    },
    adicionar(t, m) { adicionar(t, m); }, girar, duplicar, excluirItem, excluirCota, desfazer, modo: m => modo(m),
    selCota(id) { L.selCota = id; L.sel = null; desenhar(); props(); },
    zoom(dir) { L.zoom = dir === 0 ? 1 : Math.max(0.4, Math.min(5, L.zoom * (dir > 0 ? 1.25 : 0.8))); desenhar(); },
    async excluirAmbiente() {
      if (!L.atual || !confirm(`Excluir o ambiente "${L.atual.nome}" com todas as máquinas e cotas?`)) return;
      try { if (L.atual.id && web()) { const { error } = await GUT_SB.rpc('web_layout_excluir', { p_slug: GUT_EMPRESA_SLUG, p_id: L.atual.id }); if (error) throw new Error(error.message); } }
      catch (e) { (window.toast || alert)(e.message, true); return; }
      L.lista = L.lista.filter(x => x !== L.atual); L.sujo = false; if (!L.lista.length) L.lista = [{ id: '', nome: 'Salão de costura', dados: novoDados() }];
      L.atual = L.lista[0]; L.sel = null; L.hist = []; preencherAmbientes(); campos(); paleta(); desenhar(); props(); status();
    },
    estado: () => L
  };

  window.gutLayoutAbrir = async function () {
    const root = $('layoutRoot'); if (!root) return;
    await carregarUnidades(); await carregarPostos(true);
    if (!L.carregado) { root.innerHTML = '<div class="card internal-loading">Carregando o layout…</div>'; try { await carregar(); } catch (e) { root.innerHTML = /web_layout_ler|does not exist|schema cache/i.test(e.message) ? '<div class="card">O Layout da fábrica ainda está sendo instalado no banco. Tente de novo daqui a pouco.</div>' : `<div class="card">Não foi possível abrir o layout: ${esc(e.message)}</div>`; return; } montar(); }
    else if (!$('laySvg')) montar(); else { paleta(); desenhar(); props(); }
    // ocupação: precisa do quadro da produção interna
    try { if (typeof STATE !== 'undefined' && !STATE.internalBoard && typeof loadInternalProductionBoard === 'function') { await loadInternalProductionBoard(); analisar(); paleta(); desenhar(); props(); } } catch (e) {}
  };
  setInterval(() => { if (visivel() && !L.drag && !document.querySelector('#view-layout input:focus,#view-layout select:focus')) { carregarPostos(); if (A.base === 'QUADRO') analisar(); paleta(); desenhar(); if (L.sel) { const it = D().itens.find(i => i.id === L.sel); if (it && it.tipo === 'LOTE') props(); } } }, 10000);
  window.addEventListener('beforeunload', e => { if (L.sujo) { salvar(); e.preventDefault(); e.returnValue = ''; } });
})();
