/* GUT PPCP — Layout da fábrica (planta baixa) — v4.31
   Ambiente em metros, grade para encaixar, máquinas do cadastro e blocos livres, cotas entre itens
   (reta e em "L", base para o diagrama de espaguete) e a ocupação de hoje de cada máquina (mesma conta do painel Capacidade). */
(function () {
  const L = { lista: [], atual: null, sel: null, modo: 'MOVER', cotaA: null, zoom: 1, sujo: false, salvando: false, timer: 0, carregado: false, arr: null, hist: [] };
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
    L.sujo = true; status(); if (redesenhar) desenhar();
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
  const classe = p => (!isFinite(p) || p > 100) ? 'over' : p >= 80 ? 'high' : p > 0 ? 'ok' : 'idle';
  function maquinas() {
    return (typeof STATE !== 'undefined' && STATE.cad && STATE.cad.maquinas || [])
      .filter(m => !['FALSE', '0', 'NAO', 'NÃO', 'INATIVO'].includes(String(m.ATIVO ?? '').toUpperCase()))
      .map(m => ({ id: String(m.ID_MAQUINA), nome: m.MAQUINA || m.NOME_MAQUINA || m.DESCRICAO || ('Máquina ' + m.ID_MAQUINA), total: Math.max(0, Math.floor(num(m.QTD_TOTAL))) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /* ---------- tela ---------- */
  function montar() {
    const root = $('layoutRoot'); if (!root) return;
    root.innerHTML = `
    <div class="page-head"><div><h3>Layout da fábrica</h3><p>Monte a planta baixa em metros, posicione as máquinas e meça as distâncias. A cor de cada máquina é a ocupação de hoje.</p></div></div>
    <div class="card lay-bar">
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
      <span id="layStatus" class="lay-status ok">Salvo</span>
    </div>
    <div class="lay-body">
      <aside class="card lay-side" id="layPal"></aside>
      <div class="card lay-canvas" id="layWrap"><svg id="laySvg" xmlns="http://www.w3.org/2000/svg"></svg><div class="lay-hint" id="layHint"></div></div>
      <aside class="card lay-side" id="layProp"></aside>
    </div>`;
    preencherAmbientes(); campos(); paleta(); desenhar(); props(); modo(L.modo, true); bindSvg();
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
    const mq = maquinas();
    el.innerHTML = `<div class="lay-h">Máquinas do cadastro</div>
      ${mq.length ? mq.map(m => { const u = usados.get(m.id) || 0, o = occ.get(m.id), p = o ? o.pct : 0; return `<button type="button" class="lay-pal" draggable="true" data-add="MAQ" data-maq="${esc(m.id)}" onclick="gutLayout.adicionar('MAQ','${esc(m.id)}')" title="Clique ou arraste para a planta">
        <i class="lay-dot ${classe(p)}"></i><span><b>${esc(m.nome)}</b><small>${u} de ${m.total} na planta${o && o.cap ? ` • ${isFinite(p) ? Math.round(p) : '>999'}% hoje` : ''}</small></span>${u >= m.total && m.total ? '<em>✓</em>' : ''}</button>`; }).join('') : '<p class="hint">Cadastre as máquinas em Cadastros › Máquinas.</p>'}
      <div class="lay-h">Outros itens</div>
      ${BLOCOS.map(b => `<button type="button" class="lay-pal" draggable="true" data-add="${b.tipo}" onclick="gutLayout.adicionar('${b.tipo}')"><i class="lay-dot blk t-${b.tipo.toLowerCase()}"></i><span><b>${esc(b.nome)}</b><small>${fm(b.w)} × ${fm(b.h)} m</small></span></button>`).join('')}
      <div class="lay-legend"><div class="lay-h">Ocupação de hoje</div><span><i class="lay-dot idle"></i>sem carga</span><span><i class="lay-dot ok"></i>até 80%</span><span><i class="lay-dot high"></i>80 a 100%</span><span><i class="lay-dot over"></i>acima de 100%</span>
      <p class="hint">Carga = minutos padrão ainda não concluídos na produção interna ÷ capacidade do dia do tipo de máquina (igual ao painel Capacidade). Máquinas do mesmo tipo mostram a mesma ocupação.</p></div>`;
    el.querySelectorAll('[data-add]').forEach(b => b.addEventListener('dragstart', e => { L.arr = { tipo: b.dataset.add, maq: b.dataset.maq || '' }; try { e.dataTransfer.setData('text/plain', 'lay'); e.dataTransfer.effectAllowed = 'copy'; } catch (x) {} }));
  }

  function props() {
    const el = $('layProp'); if (!el) return; const d = D(); const it = d.itens.find(i => i.id === L.sel);
    const cotas = d.cotas.map(c => ({ c, m: medir(c) })).filter(x => x.m);
    const tot = cotas.reduce((s, x) => s + x.m.reta, 0), totL = cotas.reduce((s, x) => s + x.m.l, 0);
    let h = '';
    if (it) {
      const occ = ocupacao().get(it.maq || ''), mq = maquinas();
      h += `<div class="lay-h">${it.tipo === 'MAQ' ? 'Máquina' : 'Item'} selecionado</div>
      <label class="lay-f"><span>Nome na planta</span><input value="${esc(it.nome)}" maxlength="40" oninput="gutLayout.prop('nome',this.value)"></label>
      ${it.tipo === 'MAQ' ? `<label class="lay-f"><span>Tipo de máquina</span><select onchange="gutLayout.prop('maq',this.value)">${mq.map(m => `<option value="${esc(m.id)}" ${m.id === it.maq ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>` : ''}
      <div class="lay-2"><label class="lay-f"><span>Largura (m)</span><input inputmode="decimal" value="${fm(it.w)}" onchange="gutLayout.prop('w',this.value)"></label><label class="lay-f"><span>Profundidade (m)</span><input inputmode="decimal" value="${fm(it.h)}" onchange="gutLayout.prop('h',this.value)"></label></div>
      <div class="lay-2"><label class="lay-f"><span>X (m)</span><input inputmode="decimal" value="${fm(it.x)}" onchange="gutLayout.prop('x',this.value)"></label><label class="lay-f"><span>Y (m)</span><input inputmode="decimal" value="${fm(it.y)}" onchange="gutLayout.prop('y',this.value)"></label></div>
      ${it.tipo === 'MAQ' && occ ? `<div class="lay-occ ${classe(occ.pct)}"><b>${isFinite(occ.pct) ? Math.round(occ.pct) : '>999'}%</b><span>ocupação hoje do tipo • ${Math.round(occ.load)} de ${Math.round(occ.cap)} min • ${occ.ops} processo(s) a fazer</span></div>` : ''}
      <div class="lay-acts"><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.girar()" title="Girar 90° (R)">⟳ Girar</button><button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.duplicar()" title="Duplicar (Ctrl+D)">⧉ Duplicar</button><button class="btn btn-secondary btn-sm lay-del" type="button" onclick="gutLayout.excluirItem()" title="Excluir (Delete)">Excluir</button></div>`;
    } else {
      h += `<div class="lay-h">Como usar</div><ul class="lay-help"><li>Defina largura e comprimento do ambiente.</li><li>Clique ou arraste uma máquina para a planta; arraste para posicionar (encaixa na grade).</li><li><b>Cota</b>: toque num item e depois em outro para medir a distância entre os centros.</li><li>Atalhos: R gira, Delete exclui, setas movem uma casa, Ctrl+Z desfaz.</li></ul>`;
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

  /* ---------- desenho (SVG em metros) ---------- */
  const PAD = 0.9;
  function escala() {
    const wrap = $('layWrap'), d = D(); if (!wrap || !d) return 40;
    const fit = Math.max(8, Math.min((wrap.clientWidth - 24) / (d.largura + PAD * 2), (Math.max(360, window.innerHeight - 290)) / (d.comprimento + PAD * 2)));
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
      <marker id="layTick" viewBox="-5 -5 10 10" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 -4V4" class="lay-tickm"/></marker></defs>`;
    g += `<rect x="0" y="0" width="${W}" height="${H}" class="lay-floor"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#layG)"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#layG1)"/><rect x="0" y="0" width="${W}" height="${H}" class="lay-wall"/>`;
    const passo = W > 60 || H > 60 ? 10 : W > 25 || H > 25 ? 5 : 1;
    for (let x = 0; x <= W + 1e-6; x += passo) g += `<text x="${x}" y="${-0.25}" class="lay-rul" font-size="${fs}" text-anchor="middle">${Math.round(x)}</text>`;
    for (let y = passo; y <= H + 1e-6; y += passo) g += `<text x="${-0.25}" y="${y + fs / 3}" class="lay-rul" font-size="${fs}" text-anchor="end">${Math.round(y)}</text>`;
    d.itens.forEach(it => {
      const o = it.tipo === 'MAQ' ? occ.get(it.maq || '') : null, p = o ? o.pct : 0, cl = it.tipo === 'MAQ' ? 'maq ' + classe(p) : 'blk t-' + it.tipo.toLowerCase();
      const sel = it.id === L.sel ? ' sel' : '', ca = L.cotaA === it.id ? ' cota-a' : '';
      const tx = it.x + it.w / 2, ty = it.y + it.h / 2, small = Math.min(it.w, it.h), f = Math.max(0.12, Math.min(fs, it.tipo === 'MAQ' ? Math.max(small * 0.4, it.w * 0.17) : small * 0.36));
      const rot = it.h > it.w * 1.6 && it.tipo !== 'MAQ' ? ` transform="rotate(-90 ${tx} ${ty})"` : '';
      g += `<g class="lay-it ${cl}${sel}${ca}" data-it="${it.id}"><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${Math.min(0.08, small / 6)}" class="lay-body-r"/>`;
      if (it.tipo === 'MAQ') {
        const bw = it.w * 0.8, pct = isFinite(p) ? Math.min(100, p) : 100;
        g += `<rect x="${it.x + it.w * 0.1}" y="${it.y + it.h - Math.max(0.07, it.h * 0.16)}" width="${bw}" height="${Math.max(0.035, it.h * 0.07)}" rx="0.02" class="lay-bar-bg"/><rect x="${it.x + it.w * 0.1}" y="${it.y + it.h - Math.max(0.07, it.h * 0.16)}" width="${bw * pct / 100}" height="${Math.max(0.035, it.h * 0.07)}" rx="0.02" class="lay-bar"/>`;
        g += `<text x="${tx}" y="${ty - f * 0.25}" font-size="${f}" class="lay-tx" text-anchor="middle">${esc(curto(it.nome, it.w / f * 1.7))}</text><text x="${tx}" y="${ty + f * 0.85}" font-size="${f * 0.95}" class="lay-pct" text-anchor="middle">${o && o.cap ? (isFinite(p) ? Math.round(p) + '%' : '>999%') : '—'}</text>`;
      } else {
        g += `<text x="${tx}" y="${ty + f * 0.35}" font-size="${f}" class="lay-tx" text-anchor="middle"${rot}>${esc(curto(it.nome, (rot ? it.h : it.w) / f * 1.7))}</text>`;
      }
      g += `<title>${esc(it.nome)} • ${fm(it.w)} × ${fm(it.h)} m${o && o.cap ? ` • ocupação hoje ${isFinite(p) ? Math.round(p) : '>999'}%` : ''}</title></g>`;
    });
    d.cotas.forEach(cq => {
      const m = medir(cq); if (!m) return; const mx = (m.ax + m.bx) / 2, my = (m.ay + m.by) / 2, sel = L.selCota === cq.id ? ' sel' : '';
      g += `<g class="lay-cota-g${sel}" data-cota="${cq.id}"><line x1="${m.ax}" y1="${m.ay}" x2="${m.bx}" y2="${m.by}" class="lay-cl" marker-start="url(#layTick)" marker-end="url(#layTick)"/><line x1="${m.ax}" y1="${m.ay}" x2="${m.bx}" y2="${m.by}" class="lay-chit"/>
        <circle cx="${m.ax}" cy="${m.ay}" r="${fs * 0.28}" class="lay-cp"/><circle cx="${m.bx}" cy="${m.by}" r="${fs * 0.28}" class="lay-cp"/>
        <rect x="${mx - fs * 1.9}" y="${my - fs * 0.75}" width="${fs * 3.8}" height="${fs * 1.4}" rx="${fs * 0.3}" class="lay-cbox"/><text x="${mx}" y="${my + fs * 0.3}" font-size="${fs * 0.9}" text-anchor="middle" class="lay-ctx">${fm(m.reta)} m</text></g>`;
    });
    svg.innerHTML = g;
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
      L.sel = it.id; L.selCota = null; const p = pt(e); drag = { it, dx: p.x - it.x, dy: p.y - it.y, x0: it.x, y0: it.y, moveu: false };
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      desenhar(); props(); e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return; const p = pt(e), nx = snap(p.x - drag.dx), ny = snap(p.y - drag.dy);
      if (nx === drag.it.x && ny === drag.it.y) return;
      if (!drag.moveu) { snapshot(); drag.moveu = true; }
      drag.it.x = nx; drag.it.y = ny; limitar(drag.it); desenhar();
    });
    const fim = () => { if (drag && drag.moveu) { mudou(false); props(); } drag = null; };
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
      if (k === 'v') return modo('MOVER'); if (k === 'c' && !e.ctrlKey && !e.metaKey) return modo('COTA');
      if (k === 'escape') { L.cotaA = null; L.sel = null; L.selCota = null; desenhar(); props(); return; }
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
  function adicionar(tipo, maq, p) {
    const d = D(); snapshot(); let it;
    if (tipo === 'MAQ') { const m = maquinas().find(x => x.id === maq); const n = d.itens.filter(i => i.tipo === 'MAQ' && i.maq === maq).length + 1; it = { id: uid(), tipo: 'MAQ', maq, nome: `${m ? m.nome : 'Máquina'} ${n}`, w: MAQ_W, h: MAQ_H }; }
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

  window.gutLayout = {
    trocar(i) { salvar(); L.atual = L.lista[Number(i)] || L.lista[0]; L.sel = null; L.selCota = null; L.hist = []; campos(); paleta(); desenhar(); props(); status(); },
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
      if (k === 'maq') { it.maq = v; mudou(); paleta(); props(); return; }
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
    if (!L.carregado) { root.innerHTML = '<div class="card internal-loading">Carregando o layout…</div>'; try { await carregar(); } catch (e) { root.innerHTML = `<div class="card">Não foi possível abrir o layout: ${esc(e.message)}</div>`; return; } montar(); }
    else if (!$('laySvg')) montar(); else { paleta(); desenhar(); props(); }
    // ocupação: precisa do quadro da produção interna
    try { if (typeof STATE !== 'undefined' && !STATE.internalBoard && typeof loadInternalProductionBoard === 'function') { await loadInternalProductionBoard(); paleta(); desenhar(); props(); } } catch (e) {}
  };
  window.addEventListener('beforeunload', e => { if (L.sujo) { salvar(); e.preventDefault(); e.returnValue = ''; } });
})();
