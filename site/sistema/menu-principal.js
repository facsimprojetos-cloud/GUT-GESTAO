/* GUT PPCP — menu principal (v4.30): tela de entrada com os módulos em blocos; dentro do módulo, botão "Menu" e abas só daquele módulo.
   Cada aba é uma tela que já existe (showView) e, quando preciso, um ajuste (modo do quadro, coluna em foco, histórico). */
(function () {
  const W = 'class="w"', R = 'class="r"';
  const ICO = {
    fabrica: `<path ${W} d="M6 41V23l10 7v-7l10 7V9h7v32z"/><path ${W} d="M4 41h40"/><path ${R} d="M11 35h3M18 35h3M25 35h3"/>`,
    fabricaExt: `<path ${W} d="M4 41V23l10 7v-7l10 7V15h6v26z"/><path ${W} d="M2 41h30"/><path ${R} d="M9 35h3M16 35h3"/><path ${R} d="M34 8h10v10M44 8 33 19"/>`,
    tesoura: `<circle ${W} cx="11" cy="13" r="5"/><circle ${W} cx="11" cy="35" r="5"/><path ${W} d="M15 16 36 33M15 32 36 15"/><path ${R} d="M37 24h3M43 24h3" />`,
    camadas: `<path ${W} d="M24 6 5 15l19 9 19-9z"/><path ${R} d="m5 24 19 9 19-9"/><path ${W} d="m5 33 19 9 19-9"/>`,
    tecido: `<path ${W} d="M13 8h23a7 12 0 0 1 0 24H13"/><ellipse ${W} cx="13" cy="20" rx="7" ry="12"/><path ${R} d="M13 20c0-3 3-3.5 3.5-1s-1.5 4.5-4 4-4-4.5-2.5-8"/><path ${W} d="M36 32l7 9H17l-4-9"/>`,
    carrinho: `<path ${W} d="M4 8h5l5 24h22l5-17H11"/><circle ${R} cx="17" cy="40" r="3"/><circle ${R} cx="33" cy="40" r="3"/>`,
    maquina: `<path ${W} d="M8 38V16a6 6 0 0 1 6-6h22a6 6 0 0 1 6 6v10H20v12"/><path ${W} d="M5 40h38v-5H5zM28 10V6"/><path ${R} d="M33 15h5v5h-5z"/><path ${W} d="M20 30h8"/>`,
    calendario: `<rect ${W} x="5" y="9" width="32" height="30" rx="4"/><path ${W} d="M5 17h32M13 5v8M29 5v8M12 24h3M19 24h3M26 24h3M12 31h3M19 31h3"/><circle ${R} cx="36" cy="36" r="8"/><path ${R} d="m32 36 3 3 5-6"/>`,
    selo: `<path ${W} d="M24 4l4 3 5-1 2 5 5 2-1 5 3 4-3 4 1 5-5 2-2 5-5-1-4 3-4-3-5 1-2-5-5-2 1-5-3-4 3-4-1-5 5-2 2-5 5 1z"/><path ${R} d="m17 21 5 5 9-9"/><path ${R} d="m15 34-4 10 6-3 3 5 3-10M33 34l4 10-6-3-3 5-3-10"/>`,
    barras: `<path ${W} d="M5 42h38M37 42V8h-8v34"/><path ${R} d="M9 42V32h7v10M19 42V22h7v20"/>`,
    cadastro: `<path ${R} d="M24 5 5 14l19 9 19-9z"/><path ${W} d="m5 23 19 9 19-9M5 32l19 9 19-9"/>`,
    planta: `<rect ${W} x="4" y="4" width="40" height="40" rx="3"/><path ${W} d="M4 20h14v24M18 28h26M30 4v12"/><rect ${R} x="24" y="34" width="6" height="4"/><rect ${R} x="34" y="34" width="6" height="4"/><rect ${R} x="8" y="9" width="6" height="4"/><path ${R} d="M11 24v-8" stroke-dasharray="2 2"/>`,
    banco: `<ellipse ${W} cx="20" cy="10" rx="14" ry="5"/><path ${W} d="M6 10v24c0 2.8 6.3 5 14 5M34 10v9M6 18c0 2.8 6.3 5 14 5s14-2.2 14-5M6 26c0 2.8 6.3 5 14 5"/><circle ${R} cx="35" cy="34" r="9"/><path ${R} d="M38 30.5c-.8-1-2-1.5-3.3-1.5-1.9 0-3.2 1-3.2 2.4 0 3.3 6.7 1.7 6.7 5 0 1.5-1.4 2.6-3.4 2.6-1.4 0-2.7-.6-3.5-1.6M35 27v2M35 39v2"/>`
  };
  const fac = (modo, foco) => () => { try { if (typeof setFactionDashboardMode === 'function') setFactionDashboardMode(modo); if (STATE.factionKanbanFocus !== foco) { STATE.factionKanbanFocus = foco; renderExternalDashboard(); } } catch (e) {} };
  const int = modo => () => { try { if (typeof setInternalDashboardMode === 'function') setInternalDashboardMode(modo); } catch (e) {} };
  const MODULOS = [
    { id: 'interna', nome: 'Produção interna', ico: 'fabrica', abas: [['dash-interna', 'Quadro', int('KANBAN')], ['interna', 'Remessas internas'], ['bipagem', 'Bipagem']] },
    { id: 'externa', nome: 'Produção externa', ico: 'fabricaExt', abas: [['dash-faccoes', 'Quadro de facções', fac('OPERACIONAL', '')], ['romaneios', 'Romaneios']] },
    { id: 'corte', nome: 'Corte', ico: 'tesoura', abas: [['corte', 'Novo corte'], ['volumes', 'Lotes / volumes']] },
    { id: 'estcorte', nome: 'Estoque de corte', ico: 'camadas', abas: [['estoque', 'Estoque de corte']] },
    { id: 'tecido', nome: 'Estoque de tecido', ico: 'tecido', abas: [['materiais', 'Estoque de materiais']] },
    { id: 'compras', nome: 'Compras', ico: 'carrinho', abas: [['compras', 'Compras']] },
    { id: 'faccao', nome: 'Facção', ico: 'maquina', abas: [['faccoes', 'Remessas e retornos']] },
    { id: 'ppcp', nome: 'PPCP', ico: 'calendario', abas: [['dashboard', 'Visão geral e TV'], ['estoque-pa', 'Estoque PA']] },
    { id: 'qualidade', nome: 'Qualidade', ico: 'selo', abas: [['dash-faccoes', 'Inspeção das facções', fac('OPERACIONAL', 'INSPECAO')], ['dash-faccoes', 'Remessas concluídas', () => { fac('OPERACIONAL', 'INSPECAO')(); try { openHistoricoRemessas(); } catch (e) {} }]] },
    { id: 'relatorios', nome: 'Relatórios', ico: 'barras', abas: [['dash-faccoes', 'Facções', fac('ANALITICO', '')], ['dash-interna', 'Produção por minutos', int('MINUTOS')], ['dash-interna', 'Eficiência por marcação', int('EFICIENCIA')]] },
    { id: 'layout', nome: 'Layout da fábrica', ico: 'planta', abas: [['layout', 'Planta baixa']] },
    { id: 'cadastros', nome: 'Cadastros', ico: 'cadastro', abas: [['cadastros', 'Cadastros']] },
    { id: 'financeiro', nome: 'Financeiro', ico: 'banco', abas: [['financeiro', 'Financeiro facções']] }
  ];
  const H = { mod: null, aba: 0, mudando: false };
  const pode = v => (typeof gutPodeVer !== 'function' || gutPodeVer(v));
  const abasLiberadas = m => m.abas.map((a, i) => ({ a, i })).filter(x => pode(x.a[0]));
  const svg = k => `<svg viewBox="0 0 48 48" aria-hidden="true">${ICO[k]}</svg>`;
  const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function logo() {
    return `<div class="hm-logo"><svg class="hm-mark" viewBox="0 0 64 56" aria-hidden="true"><defs><linearGradient id="hmPrata" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f3f5"/><stop offset="1" stop-color="#8d9099"/></linearGradient></defs><path d="M30 6H8a5 5 0 0 0-5 5v36a5 5 0 0 0 5 5h44a5 5 0 0 0 5-5V22" fill="none" stroke="url(#hmPrata)" stroke-width="3.2" stroke-linecap="round"/><rect x="11" y="34" width="8" height="13" rx="1" fill="#e11d2a"/><rect x="23" y="24" width="8" height="23" rx="1" fill="#e11d2a"/><rect x="35" y="2" width="9" height="45" rx="1" fill="#ff2a36"/></svg><div class="hm-word"><b>GUT</b><small>Consultoria e treinamentos</small></div></div>`;
  }

  function montar() {
    let el = document.getElementById('homeMenu');
    if (!el) { el = document.createElement('section'); el.id = 'homeMenu'; el.setAttribute('aria-label', 'Menu principal'); document.body.appendChild(el); }
    let emp = ''; try { emp = (typeof GUT_EMPRESA !== 'undefined' && GUT_EMPRESA && (GUT_EMPRESA.nome || GUT_EMPRESA.slug)) || ''; } catch (e) {}
    const tiles = MODULOS.filter(m => abasLiberadas(m).length).map(m => `<button type="button" class="hm-tile" data-mod="${m.id}" onclick="gutHomeAbrir('${m.id}')"><span class="hm-ico">${svg(m.ico)}</span><span class="hm-name">${escH(m.nome)}</span></button>`).join('');
    el.innerHTML = `<div class="hm-top"><span class="hm-emp" title="Empresa">${escH(emp)}</span><button type="button" class="hm-btn" onclick="toggleTheme()" title="Alternar modo claro/escuro" aria-label="Alternar modo claro/escuro"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></button><button type="button" class="hm-btn" onclick="gutSair&&gutSair()">Sair</button></div>
      <div class="hm-inner">${logo()}<div class="hm-ppcp"><i></i><h1>PPCP</h1><i></i></div><div class="hm-grid">${tiles || '<p class="hm-vazio">Você ainda não tem acesso a nenhum módulo. Peça ao dono da empresa para liberar.</p>'}</div></div>`;
  }

  function barra() {
    const tb = document.querySelector('.topbar'); if (!tb) return;
    if (!document.getElementById('homeBackBtn')) {
      const b = document.createElement('button'); b.id = 'homeBackBtn'; b.type = 'button'; b.className = 'home-back'; b.title = 'Voltar ao menu principal';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span>Menu</span>'; b.onclick = () => gutHomeMostrar();
      tb.insertBefore(b, tb.firstChild);
      const t = document.createElement('nav'); t.id = 'modTabs'; t.className = 'mod-tabs'; const ti = document.getElementById('topTitle'); ti && ti.after(t);
    }
    const m = MODULOS.find(x => x.id === H.mod), t = document.getElementById('modTabs'); if (!m || !t) return;
    const lib = abasLiberadas(m);
    t.innerHTML = lib.length > 1 ? lib.map(x => `<button type="button" class="${x.i === H.aba ? 'on' : ''}" onclick="gutHomeAba(${x.i})">${escH(x.a[1])}</button>`).join('') : '';
    const ti = document.getElementById('topTitle'); if (ti) ti.textContent = m.nome;
  }

  window.gutHomeMostrar = function () {
    montar(); document.body.classList.add('home-open');
    setTimeout(() => document.querySelector('#homeMenu .hm-tile')?.focus({ preventScroll: true }), 50);
  };
  window.gutHomeAbrir = function (id) {
    const m = MODULOS.find(x => x.id === id); if (!m) return; const lib = abasLiberadas(m); if (!lib.length) return;
    H.mod = id; document.body.classList.add('mod-mode'); document.body.classList.remove('home-open');
    gutHomeAba(lib[0].i);
  };
  window.gutHomeAba = function (i) {
    const m = MODULOS.find(x => x.id === H.mod); if (!m || !m.abas[i]) return; const [v, , acao] = m.abas[i];
    H.aba = i; H.mudando = true;
    try { if (STATE.view !== v) showView(v); } finally { H.mudando = false; }
    if (acao) acao(); barra(); window.scrollTo(0, 0);
  };
  /* chamada no fim do showView: se a tela mudou por outro caminho, acha o módulo dela */
  window.gutHomeSync = function (v) {
    if (!document.body.classList.contains('mod-mode')) return;
    if (!H.mudando) {
      const atual = MODULOS.find(x => x.id === H.mod), k = atual ? atual.abas.findIndex(a => a[0] === v) : -1;
      if (k >= 0) H.aba = k; else { const m = MODULOS.find(x => x.abas.some(a => a[0] === v)); if (m) { H.mod = m.id; H.aba = m.abas.findIndex(a => a[0] === v); } }
    }
    barra();
  };
  window.gutHomeInicio = function () {
    return; // v4.31.1: o usuário preferiu o menu lateral (recolhível); o menu em blocos fica desligado
    if (navigator.webdriver) return; // testes automáticos seguem no menu lateral
    if (/^#tv[123]$/.test(location.hash || '')) return;
    gutHomeMostrar();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('home-open') && document.body.classList.contains('mod-mode') && !document.querySelector('.modal.show,.modal.open')) { document.body.classList.remove('home-open'); }
  });
})();
