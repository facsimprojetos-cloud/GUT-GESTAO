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

  const unis = () => (window.gutCrachas && gutCrachas.unidades && window.GUT_UNI_CACHE) || [];
  const unisTipo = id => unis().filter(u => String(u.maq) === String(id) && u.ativo !== false);
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
      <label class="lay-chk" title="Liga cada lote à máquina da próxima operação dele"><input type="checkbox" id="layFluxo" onchange="gutLayout.fluxo(this.checked)" checked> Fluxo dos lotes</label>
      <button class="btn btn-secondary btn-sm" type="button" onclick="gutLayout.soPlanta(true)" title="Tela cheia só com a planta, sem botões nem listas (tecla P)">▣ Só a planta</button>
      <button class="btn btn-dark btn-sm" type="button" id="layFullBtn" onclick="gutLayout.cheia()" title="Abrir a planta em tela cheia (Esc volta)">⛶ Tela cheia</button>
      <span id="layStatus" class="lay-status ok">Salvo</span>
    </div>
    <div class="lay-body">
      <aside class="card lay-side" id="layPal"></aside>
      <div class="card lay-canvas" id="layWrap"><svg id="laySvg" xmlns="http://www.w3.org/2000/svg"></svg><div class="lay-hint" id="layHint"></div><div class="lay-float"><button type="button" onclick="gutLayout.zoom(-1)" title="Diminuir">−</button><button type="button" onclick="gutLayout.zoom(0)" title="Caber na tela">Ajustar</button><button type="button" onclick="gutLayout.zoom(1)" title="Aumentar">+</button><button type="button" class="sai" onclick="gutLayout.soPlanta(false)" title="Mostrar os controles (Esc)">✕ Mostrar controles</button></div></div>
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
      <div class="lay-legend"><div class="lay-h">Ocupação de hoje</div><span><i class="lay-dot idle"></i>sem carga</span><span><i class="lay-dot ok"></i>até 80%</span><span><i class="lay-dot high"></i>80 a 100%</span><span><i class="lay-dot over"></i>acima de 100%</span>
      <p class="hint">Carga = minutos padrão ainda não concluídos na produção interna ÷ capacidade do dia do tipo de máquina (igual ao painel Capacidade). Máquinas do mesmo tipo mostram a mesma ocupação.</p></div>`;
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
      ${it.op ? `<div class="lay-opr">👤 ${esc(operadorNome(it.op) || it.op)} <button type="button" class="x" onclick="gutLayout.prop('op','')" title="Tirar o funcionário deste posto">×</button></div>` : ''}` : ''}
      ${it.tipo === 'MAQ' ? `<label class="lay-f"><span>Tipo de máquina</span><select onchange="gutLayout.prop('maq',this.value)">${mq.map(m => `<option value="${esc(m.id)}" ${m.id === it.maq ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>` : ''}
      <div class="lay-2"><label class="lay-f"><span>Largura (m)</span><input inputmode="decimal" value="${fm(it.w)}" onchange="gutLayout.prop('w',this.value)"></label><label class="lay-f"><span>Profundidade (m)</span><input inputmode="decimal" value="${fm(it.h)}" onchange="gutLayout.prop('h',this.value)"></label></div>
      <div class="lay-2"><label class="lay-f"><span>X (m)</span><input inputmode="decimal" value="${fm(it.x)}" onchange="gutLayout.prop('x',this.value)"></label><label class="lay-f"><span>Y (m)</span><input inputmode="decimal" value="${fm(it.y)}" onchange="gutLayout.prop('y',this.value)"></label></div>
      ${it.tipo === 'MAQ' && occ ? `<div class="lay-occ ${classe(occ.pct)}"><b>${isFinite(occ.pct) ? Math.round(occ.pct) : '>999'}%</b><span>ocupação hoje do tipo • ${Math.round(occ.load)} de ${Math.round(occ.cap)} min • ${occ.ops} processo(s) a fazer</span></div>` : ''}
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
      <marker id="layArr" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${fs * 1.3}" markerHeight="${fs * 1.3}" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="lay-arrm"/></marker><marker id="layTick" viewBox="-5 -5 10 10" markerUnits="userSpaceOnUse" markerWidth="${fs * 1.4}" markerHeight="${fs * 1.4}" orient="auto"><path d="M0 -4V4" class="lay-tickm"/></marker></defs>`;
    g += `<rect x="0" y="0" width="${W}" height="${H}" class="lay-floor"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#layG)"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#layG1)"/><rect x="0" y="0" width="${W}" height="${H}" class="lay-wall"/>`;
    const passo = W > 60 || H > 60 ? 10 : W > 25 || H > 25 ? 5 : 1;
    for (let x = 0; x <= W + 1e-6; x += passo) g += `<text x="${x}" y="${-0.25}" class="lay-rul" font-size="${fs}" text-anchor="middle">${Math.round(x)}</text>`;
    for (let y = passo; y <= H + 1e-6; y += passo) g += `<text x="${-0.25}" y="${y + fs / 3}" class="lay-rul" font-size="${fs}" text-anchor="end">${Math.round(y)}</text>`;
    d.itens.filter(it => it.tipo !== 'LOTE').forEach(it => {
      const o = it.tipo === 'MAQ' ? occ.get(it.maq || '') : null, p = o ? o.pct : 0, cl = it.tipo === 'MAQ' ? 'maq ' + classe(p) : 'blk t-' + it.tipo.toLowerCase();
      const sel = it.id === L.sel ? ' sel' : '', ca = L.cotaA === it.id ? ' cota-a' : '';
      const tx = it.x + it.w / 2, ty = it.y + it.h / 2, small = Math.min(it.w, it.h), f = Math.max(0.12, Math.min(fs, it.tipo === 'MAQ' ? Math.max(small * 0.4, it.w * 0.17) : small * 0.36));
      const rot = it.h > it.w * 1.6 && it.tipo !== 'MAQ' ? ` transform="rotate(-90 ${tx} ${ty})"` : '';
      g += `<g class="lay-it ${cl}${sel}${ca}" data-it="${it.id}"><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${Math.min(0.08, small / 6)}" class="lay-body-r"/>`;
      if (it.tipo === 'MAQ') {
        const bw = it.w * 0.8, pct = isFinite(p) ? Math.min(100, p) : 100;
        g += `<rect x="${it.x + it.w * 0.1}" y="${it.y + it.h - Math.max(0.07, it.h * 0.16)}" width="${bw}" height="${Math.max(0.035, it.h * 0.07)}" rx="0.02" class="lay-bar-bg"/><rect x="${it.x + it.w * 0.1}" y="${it.y + it.h - Math.max(0.07, it.h * 0.16)}" width="${bw * pct / 100}" height="${Math.max(0.035, it.h * 0.07)}" rx="0.02" class="lay-bar"/>`;
        if (it.op) g += `<text x="${tx}" y="${it.y - f * 0.35}" font-size="${f * 0.8}" class="lay-optx" text-anchor="middle">👤 ${esc(curto(operadorNome(it.op).split(/\s+/)[0] || 'func.', 14))}</text>`;
        if (L.alvo === it.id) g += `<rect x="${it.x - 0.12}" y="${it.y - 0.12}" width="${it.w + 0.24}" height="${it.h + 0.24}" rx="0.12" class="lay-alvo"/>`;
        g += `<text x="${tx}" y="${ty - f * 0.25}" font-size="${f}" class="lay-tx" text-anchor="middle">${esc(curto(it.nome, it.w / f * 1.7))}</text><text x="${tx}" y="${ty + f * 0.85}" font-size="${f * 0.95}" class="lay-pct" text-anchor="middle">${o && o.cap ? (isFinite(p) ? Math.round(p) + '%' : '>999%') : '—'}</text>`;
      } else {
        g += `<text x="${tx}" y="${ty + f * 0.35}" font-size="${f}" class="lay-tx" text-anchor="middle"${rot}>${esc(curto(it.nome, (rot ? it.h : it.w) / f * 1.7))}</text>`;
      }
      g += `<title>${esc(it.nome)} • ${fm(it.w)} × ${fm(it.h)} m${o && o.cap ? ` • ocupação hoje ${isFinite(p) ? Math.round(p) : '>999'}%` : ''}</title></g>`;
    });
    const cx = mapaCaixas();
    if (L.fluxo) fluxos().forEach(f => { if (!f.alvo) return; const bx = f.alvo.x + f.alvo.w / 2, by = f.alvo.y + f.alvo.h / 2, mx = (f.lx + bx) / 2, my = (f.ly + by) / 2;
      g += `<g class="lay-flx${f.c.ativa ? ' ativa' : ''}"><line x1="${f.lx}" y1="${f.ly}" x2="${bx}" y2="${by}" class="lay-fl" marker-end="url(#layArr)"/><text x="${mx}" y="${my - fs * 0.35}" font-size="${fs * 0.75}" text-anchor="middle" class="lay-ftx" stroke-width="${fs * 0.18}">${esc(curto(f.c.op, 18))} • ${fm(f.dist)} m</text></g>`; });
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
      snapshot(); d.itens.forEach(i => { if (i.op === id) i.op = ''; }); m.op = id; mudou(); props(); return aviso(`${nome} no posto ${m.nome}.`, 'ok');
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
    bipar, camera, alvo: () => L.alvo,
    cheia: () => { if (L.so) soPlanta(false); cheia(); }, soPlanta: on => soPlanta(on), lado(q) { if (q === 'pal') L.semPal = !L.semPal; else L.semProp = !L.semProp; lados(); setTimeout(desenhar, 30); },
    fluxo(on) { L.fluxo = !!on; desenhar(); },
    limparLotes() { const cx = mapaCaixas(); snapshot(); D().itens = D().itens.filter(i => i.tipo !== 'LOTE' || cx.has(i.vol)); const ids = new Set(D().itens.map(i => i.id)); D().cotas = D().cotas.filter(c => ids.has(c.a) && ids.has(c.b)); mudou(); paleta(); props(); },
    abrirLote(id) { cheia(false); try { showView('dash-interna'); if (typeof setInternalDashboardMode === 'function') setInternalDashboardMode('KANBAN'); openProdOps(id); } catch (e) {} },
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
      if (k === 'maq') { it.maq = v; it.uni = ''; mudou(); paleta(); props(); return; }
      if (k === 'uni') { it.uni = v; const u = unis().find(x => x.id === v); if (u) it.nome = u.codigo; mudou(); paleta(); props(); return; }
      if (k === 'op') { it.op = v; mudou(); props(); return; }
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
    await carregarUnidades();
    if (!L.carregado) { root.innerHTML = '<div class="card internal-loading">Carregando o layout…</div>'; try { await carregar(); } catch (e) { root.innerHTML = /web_layout_ler|does not exist|schema cache/i.test(e.message) ? '<div class="card">O Layout da fábrica ainda está sendo instalado no banco. Tente de novo daqui a pouco.</div>' : `<div class="card">Não foi possível abrir o layout: ${esc(e.message)}</div>`; return; } montar(); }
    else if (!$('laySvg')) montar(); else { paleta(); desenhar(); props(); }
    // ocupação: precisa do quadro da produção interna
    try { if (typeof STATE !== 'undefined' && !STATE.internalBoard && typeof loadInternalProductionBoard === 'function') { await loadInternalProductionBoard(); paleta(); desenhar(); props(); } } catch (e) {}
  };
  setInterval(() => { if (visivel() && !L.drag && !document.querySelector('#view-layout input:focus,#view-layout select:focus')) { paleta(); desenhar(); if (L.sel) { const it = D().itens.find(i => i.id === L.sel); if (it && it.tipo === 'LOTE') props(); } } }, 10000);
  window.addEventListener('beforeunload', e => { if (L.sujo) { salvar(); e.preventDefault(); e.returnValue = ''; } });
})();
