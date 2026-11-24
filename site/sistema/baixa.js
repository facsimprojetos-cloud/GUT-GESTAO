/* GUT PPCP — Produção interna: baixa completa da caixa e visualização em linha — v4.39
   Banco: gut_030 (web_baixa_caixas, web_supervisor_status, web_supervisor_definir).
   • Todos alocados → baixa direta; os minutos vão para cada funcionário alocado (marcação em andamento é finalizada para quem marca).
   • Operação sem funcionário → só com a senha do supervisor; os minutos ficam na "produção da empresa" (sem funcionário). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const fmin = v => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const web = () => typeof GUT_SB !== 'undefined' && GUT_SB && typeof GUT_EMPRESA_SLUG !== 'undefined' && GUT_EMPRESA_SLUG;
  const aviso = (m, erro) => (window.toast ? toast(m, erro) : alert(m));
  const B = { ids: [], plano: null, sup: null, resultado: null, enviando: false, sel: new Set() };
  const done = o => String(o?.STATUS_CUPOM || '').toUpperCase() === 'CONCLUIDO';
  const morto = o => ['CANCELADO', 'ESTORNADO'].includes(String(o?.STATUS_CUPOM || '').toUpperCase());
  const ativo = o => String(o?.STATUS_CUPOM || '').toUpperCase() === 'EM_ANDAMENTO_MARCACAO';
  const rows = () => (typeof STATE !== 'undefined' && STATE.internalBoard && STATE.internalBoard.rows) || [];
  const opsAtivos = () => new Map((typeof activeOperators === 'function' ? activeOperators() : (STATE.cad.operadores || [])).map(o => [String(o.ID_OPERADOR), o.NOME || o.MATRICULA || o.ID_OPERADOR]));
  const codigo = v => (typeof displayVolumeCode === 'function' ? displayVolumeCode(v) : v.COD_VOLUME || v.ID_VOLUME);

  /* o que cada caixa tem pendente, separado por quem recebe os minutos */
  function plano(ids) {
    const vivos = opsAtivos(), por = new Map(), p = { caixas: [], cupons: [], ops: 0, min: 0, sem: [], semMin: 0, marcando: 0 };
    ids.forEach(id => {
      const v = rows().find(x => String(x.ID_VOLUME) === String(id)); if (!v) return;
      const pend = (v.OPERACOES || []).filter(o => !done(o) && !morto(o)); if (!pend.length) return;
      p.caixas.push(v);
      pend.forEach(o => {
        const m = num(o.MINUTOS_PADRAO_TOTAL); p.cupons.push(String(o.ID_CUPOM)); p.ops++; p.min += m;
        let quem = '';
        if (ativo(o) && o.ID_OPERADOR_MARCACAO) { quem = String(o.ID_OPERADOR_MARCACAO); p.marcando++; }
        else if (o.ID_OPERADOR_ALOCADO && vivos.has(String(o.ID_OPERADOR_ALOCADO))) quem = String(o.ID_OPERADOR_ALOCADO);
        if (!quem) { p.sem.push({ v, o }); p.semMin += m; return; }
        const g = por.get(quem) || { id: quem, nome: vivos.get(quem) || (ativo(o) ? o.OPERADOR_MARCACAO : '') || quem, ops: 0, min: 0 };
        g.ops++; g.min += m; por.set(quem, g);
      });
    });
    p.por = [...por.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return p;
  }
  function pendentes(v) { return (v.OPERACOES || []).filter(o => !done(o) && !morto(o)); }
  function semFuncionario(v) { const vivos = opsAtivos(); return pendentes(v).filter(o => !(ativo(o) && o.ID_OPERADOR_MARCACAO) && !(o.ID_OPERADOR_ALOCADO && vivos.has(String(o.ID_OPERADOR_ALOCADO)))).length; }

  /* ---------- janela ---------- */
  function garantirModal() {
    if ($('baixaModal')) return;
    const d = document.createElement('div'); d.className = 'modal'; d.id = 'baixaModal';
    d.innerHTML = '<div class="modal-card bx-card" role="dialog" aria-modal="true" aria-labelledby="bxTitulo"><div class="modal-head"><div><h4 id="bxTitulo">Baixa completa</h4><div class="hint" id="bxSub"></div></div><button class="x" type="button" onclick="gutBaixa.fechar()" aria-label="Fechar">×</button></div><div id="bxCorpo"></div></div>';
    document.body.appendChild(d);
  }
  async function abrir(ids) {
    ids = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
    if (!web()) return aviso('A baixa completa funciona no sistema on-line.', true);
    B.ids = ids; B.plano = plano(ids); B.resultado = null; B.sup = null;
    if (!B.plano.ops) return aviso('Estas caixas não têm operação pendente.', true);
    garantirModal(); render(); openModal('baixaModal');
    if (B.plano.sem.length) {
      try { const { data, error } = await GUT_SB.rpc('web_supervisor_status', { p_slug: GUT_EMPRESA_SLUG }); if (error) throw error; B.sup = data; }
      catch (e) { B.sup = { tem_senha: true, pode_definir: false }; }
      render(); setTimeout(() => $('bxSenha')?.focus(), 60);
    }
  }
  function fechar() { closeModal('baixaModal'); B.resultado = null; }
  function render() {
    const p = B.plano, el = $('bxCorpo'); if (!el || !p) return;
    $('bxTitulo').textContent = p.caixas.length === 1 ? `Baixa completa • caixa ${codigo(p.caixas[0])}` : `Baixa completa • ${p.caixas.length} caixas`;
    $('bxSub').textContent = p.caixas.length === 1 ? `${p.caixas[0].PRODUTO || ''} • ${num(p.caixas[0].QTD_VOLUME)} pç` : p.caixas.map(codigo).slice(0, 6).join(', ') + (p.caixas.length > 6 ? '…' : '');
    if (B.resultado) return (el.innerHTML = resultadoHtml());
    const sem = p.sem.length, s = B.sup;
    let senha = '';
    if (sem) {
      if (!s) senha = '<p class="hint">Conferindo a senha do supervisor…</p>';
      else if (!s.tem_senha && s.pode_definir) senha = `<div class="bx-senha"><b>Crie a senha do supervisor</b><p class="hint">Ela será pedida sempre que alguém der baixa em operação sem funcionário. Guarde com o responsável pela produção.</p>
        <div class="bx-campos"><label>Nova senha<input type="password" id="bxNova" autocomplete="new-password" minlength="4"></label><label>Repita a senha<input type="password" id="bxNova2" autocomplete="new-password" onkeydown="if(event.key==='Enter')gutBaixa.criarSenha()"></label></div>
        <button class="btn btn-secondary" type="button" onclick="gutBaixa.criarSenha()">Criar senha</button></div>`;
      else if (!s.tem_senha) senha = '<div class="bx-senha bx-alerta"><b>Falta a senha do supervisor</b><p class="hint">Peça ao dono da empresa (ou a quem edita os Cadastros) para criar a senha aqui mesmo. Ou aloque um funcionário nas operações sem ninguém.</p></div>';
      else senha = `<div class="bx-senha"><label for="bxSenha"><b>Senha do supervisor</b></label><p class="hint">Necessária porque ${sem === 1 ? 'uma operação está' : sem + ' operações estão'} sem funcionário.</p>
        <input type="password" id="bxSenha" autocomplete="off" onkeydown="if(event.key==='Enter')gutBaixa.confirmar()"><div class="bx-erro" id="bxErro" role="alert"></div>
        ${s.pode_definir ? '<button type="button" class="bx-link" onclick="gutBaixa.trocarSenha()">Trocar a senha do supervisor</button>' : ''}</div>`;
    }
    const linhas = p.por.map(g => `<div class="bx-linha"><span class="bx-quem">${esc(g.nome)}</span><span>${g.ops} operaç${g.ops === 1 ? 'ão' : 'ões'}</span><b>${fmin(g.min)} min</b></div>`).join('');
    const bloqueado = sem && !(s && s.tem_senha);
    el.innerHTML = `<div class="bx-resumo"><div><b>${p.ops}</b><span>operaç${p.ops === 1 ? 'ão pendente' : 'ões pendentes'}</span></div><div><b>${fmin(p.min)}</b><span>minutos padrão</span></div><div><b>${p.ops - sem}</b><span>com funcionário</span></div></div>
      ${linhas ? `<div class="bx-grupo"><div class="bx-h">Os minutos vão para</div>${linhas}</div>` : ''}
      ${p.marcando ? `<p class="hint">⏱ ${p.marcando} em marcação agora: a marcação é finalizada para quem está marcando.</p>` : ''}
      ${sem ? `<div class="bx-grupo bx-sem"><div class="bx-h">Sem funcionário → produção da empresa</div><div class="bx-linha"><span class="bx-quem">${p.sem.slice(0, 4).map(x => esc(x.o.PROCESSO || 'Operação')).join(', ')}${sem > 4 ? ` e mais ${sem - 4}` : ''}</span><span>${sem} operaç${sem === 1 ? 'ão' : 'ões'}</span><b>${fmin(p.semMin)} min</b></div><p class="hint">Esses minutos não entram para nenhum funcionário. Use quando a caixa já foi feita e não se sabe quem fez, ou para limpar o quadro.</p></div>` : '<p class="bx-ok">Todas as operações têm funcionário. Pode dar a baixa direto.</p>'}
      ${senha}
      <div class="bx-acoes"><button class="btn btn-secondary" type="button" onclick="gutBaixa.fechar()">Cancelar</button><button class="btn btn-primary btn-lg" type="button" id="bxOk" onclick="gutBaixa.confirmar()" ${bloqueado || B.enviando ? 'disabled' : ''}>${B.enviando ? 'Dando baixa…' : `✓ Dar baixa em ${p.ops} operaç${p.ops === 1 ? 'ão' : 'ões'}`}</button></div>`;
  }
  function resultadoHtml() {
    const r = B.resultado, nomes = (r.por_funcionario || []).map(g => `<div class="bx-linha"><span class="bx-quem">${esc(g.nome)}</span><span>${g.ops} operaç${g.ops === 1 ? 'ão' : 'ões'}</span><b>+${fmin(g.min)} min</b></div>`).join('');
    return `<div class="bx-feito"><div class="bx-check" aria-hidden="true">✓</div><b>Baixa feita: ${r.operacoes} operaç${r.operacoes === 1 ? 'ão' : 'ões'}, ${fmin(r.minutos)} min</b></div>
      ${nomes ? `<div class="bx-grupo"><div class="bx-h">Minutos lançados</div>${nomes}</div>` : ''}
      ${r.empresa_ops ? `<div class="bx-grupo bx-sem"><div class="bx-linha"><span class="bx-quem">Produção da empresa (sem funcionário)</span><span>${r.empresa_ops} operaç${r.empresa_ops === 1 ? 'ão' : 'ões'}</span><b>${fmin(r.empresa_min)} min</b></div></div>` : ''}
      <p class="hint">${(r.volumes || []).length === 1 ? 'A caixa está pronta. Use "Liberar estoque" quando ela for para o estoque.' : 'As caixas estão prontas. Use "Liberar estoque" em cada uma quando forem para o estoque.'}</p>
      <div class="bx-acoes"><button class="btn btn-primary" type="button" onclick="gutBaixa.fechar()">Fechar</button></div>`;
  }
  async function criarSenha(trocar) {
    const nova = $('bxNova')?.value || '', nova2 = $('bxNova2')?.value || '', atual = trocar ? ($('bxAtual')?.value || '') : '';
    if (nova.length < 4) return aviso('A senha precisa ter pelo menos 4 caracteres.', true);
    if (nova !== nova2) return aviso('As duas senhas não são iguais.', true);
    try {
      const { data, error } = await GUT_SB.rpc('web_supervisor_definir', { p_slug: GUT_EMPRESA_SLUG, p_atual: atual, p_nova: nova });
      if (error) throw new Error(error.message); if (!data || !data.ok) throw new Error((data && data.erro) || 'Não foi possível salvar.');
      B.sup = { ...(B.sup || {}), tem_senha: true }; render(); aviso('Senha do supervisor salva.'); setTimeout(() => $('bxSenha')?.focus(), 50);
    } catch (e) { aviso(e.message, true); }
  }
  function trocarSenha() {
    const box = document.querySelector('#bxCorpo .bx-senha'); if (!box) return;
    box.innerHTML = `<b>Trocar a senha do supervisor</b><div class="bx-campos"><label>Senha atual<input type="password" id="bxAtual" autocomplete="current-password"></label><label>Nova senha<input type="password" id="bxNova" autocomplete="new-password"></label><label>Repita a nova<input type="password" id="bxNova2" autocomplete="new-password"></label></div>
      <button class="btn btn-secondary" type="button" onclick="gutBaixa.criarSenha(true)">Salvar nova senha</button> <button type="button" class="bx-link" onclick="gutBaixa.render()">voltar</button>`;
    $('bxAtual')?.focus();
  }
  async function confirmar() {
    const p = B.plano; if (!p || B.enviando) return;
    const senha = $('bxSenha')?.value || '';
    if (p.sem.length && !senha) { const e = $('bxErro'); if (e) e.textContent = 'Informe a senha do supervisor.'; $('bxSenha')?.focus(); return; }
    B.enviando = true; render(); if ($('bxSenha')) $('bxSenha').value = senha;
    try {
      if (typeof DIRECTQ !== 'undefined' && (DIRECTQ.queue || []).some(q => !q.error) && typeof flushDirectProductionQueue === 'function') await flushDirectProductionQueue(true);
      const { data, error } = await GUT_SB.rpc('web_baixa_caixas', { p_slug: GUT_EMPRESA_SLUG, p_cupons: p.cupons, p_senha: senha });
      if (error) throw new Error(error.message);
      if (!data.ok) {
        B.enviando = false;
        if (data.sem_senha_cadastrada) B.sup = { ...(B.sup || {}), tem_senha: false };
        render(); const e = $('bxErro'); if (e) e.textContent = data.erro || 'Não foi possível dar baixa.'; else aviso(data.erro, true);
        if ($('bxSenha')) { $('bxSenha').value = ''; $('bxSenha').focus(); }
        return;
      }
      B.resultado = data; B.enviando = false; B.sel.clear(); render();
      try { STATE.internalBoard = await callServer('getInternalProductionBoard'); STATE.internalPerformance = null; } catch (e) { console.warn('Atualizar o quadro depois da baixa:', e); }
      if (typeof renderInternalDashboard === 'function') renderInternalDashboard();
    } catch (e) { B.enviando = false; render(); aviso(e.message, true); }
  }

  /* ---------- botões no quadro ---------- */
  function botao(v, classe) {
    const pend = pendentes(v).length; if (!pend || num(v._progress ?? v.PROGRESSO_PCT) >= 100) return '';
    const sem = semFuncionario(v);
    return `<button type="button" class="btn ${classe || 'btn-secondary btn-sm'} bx-btn" onclick="event.stopPropagation();gutBaixa.abrir('${esc(v.ID_VOLUME)}')" title="${sem ? `${sem} operação(ões) sem funcionário: pede a senha do supervisor` : 'Todos alocados: dá baixa em todas as operações, cada uma para o seu funcionário'}">✓ Baixa completa${sem ? ' 🔒' : ''}</button>`;
  }

  /* ---------- visualização em linha ---------- */
  function linhasHtml(lista) {
    const sorted = lista.slice().sort((a, b) => (volumeActiveOps(b).length > 0) - (volumeActiveOps(a).length > 0) || (a._progress >= 100) - (b._progress >= 100) || String(a.LOTE_CORTE || '').localeCompare(String(b.LOTE_CORTE || ''), 'pt-BR', { numeric: true }) || codigo(a).localeCompare(codigo(b), 'pt-BR', { numeric: true }));
    if (!sorted.length) return '<div class="card empty">Nenhuma caixa de produção interna para este filtro.</div>';
    const visiveis = new Set(sorted.map(v => String(v.ID_VOLUME)));
    [...B.sel].forEach(id => { if (!visiveis.has(id)) B.sel.delete(id); });
    const comPend = sorted.filter(v => pendentes(v).length && v._progress < 100), todas = comPend.length && comPend.every(v => B.sel.has(String(v.ID_VOLUME)));
    const selV = sorted.filter(v => B.sel.has(String(v.ID_VOLUME))), selOps = selV.reduce((t, v) => t + pendentes(v).length, 0), selSem = selV.reduce((t, v) => t + semFuncionario(v), 0);
    const linhas = sorted.map(v => {
      const id = String(v.ID_VOLUME), ops = (v.OPERACOES || []).filter(o => !morto(o)), feitas = ops.filter(done).length, p = Math.max(0, Math.min(100, num(v._progress))), run = volumeActiveOps(v).length, pend = pendentes(v).length, sem = semFuncionario(v), pode = pend && p < 100;
      const tp = typeof rowTipoParcial === 'function' ? rowTipoParcial(v) : '';
      const estado = p >= 100 ? '<span class="bx-st ok">Pronta</span>' : run ? `<span class="bx-st run"><span class="live-dot"></span>${run} em produção</span>` : !pend ? '' : sem ? `<span class="bx-st sem" title="Operações sem funcionário alocado">${sem} sem funcionário</span>` : '<span class="bx-st aloc">👤 todos alocados</span>';
      return `<div class="bx-row ${p >= 100 ? 'is-done' : ''} ${run ? 'is-running' : ''} ${B.sel.has(id) ? 'is-sel' : ''}" onclick="openProdOps('${esc(id)}')">
        <label class="bx-chk" onclick="event.stopPropagation()" title="${pode ? 'Selecionar para dar baixa junto' : 'Sem operação pendente'}"><input type="checkbox" ${B.sel.has(id) ? 'checked' : ''} ${pode ? '' : 'disabled'} onchange="gutBaixa.marcar('${esc(id)}',this.checked)" aria-label="Selecionar caixa ${esc(codigo(v))}"></label>
        <div class="bx-cx"><strong class="mono">${esc(codigo(v))}</strong><span>${esc(v.PRODUTO || '')}${v.COR || v.TAMANHO ? ` • ${esc([v.COR, v.TAMANHO].filter(Boolean).join(' / '))}` : ''}${tp ? ' • 🧵 ' + (tp === 'FIN' ? 'finalização interna' : 'ajuste no envio') : ''}</span></div>
        <div class="bx-lote"><span>Lote ${esc(v.LOTE_CORTE || (typeof volumeLot === 'function' ? volumeLot(v) : '') || '—')}</span>${v.NUM_REMESSA_INTERNA ? `<span>${esc(v.NUM_REMESSA_INTERNA)}</span>` : ''}</div>
        <div class="bx-qtd"><b>${num(v.QTD_VOLUME)}</b> pç</div>
        <div class="bx-prog"><div class="progress ${typeof progressClass === 'function' ? progressClass(p) : ''}"><i style="width:${p}%"></i></div><span><b>${Math.round(p)}%</b> • ${feitas}/${ops.length} operações</span></div>
        <div class="bx-estado">${estado}</div>
        <div class="bx-acao" onclick="event.stopPropagation()">${p >= 100 ? `<button class="btn btn-primary btn-sm" type="button" onclick="releaseVolumeToStock('${esc(id)}','INTERNO')">Liberar estoque</button>` : botao(v)}</div>
      </div>`;
    }).join('');
    return `<div class="board-detail-head bx-head"><label class="bx-chk"><input type="checkbox" ${todas ? 'checked' : ''} ${comPend.length ? '' : 'disabled'} onchange="gutBaixa.marcarTodas(this.checked)" aria-label="Selecionar todas as caixas com operação pendente"></label>
        <div class="board-detail-title"><strong>${sorted.length} caixa(s)</strong><div class="hint">${selV.length ? `${selV.length} selecionada(s) • ${selOps} operação(ões) pendente(s)${selSem ? ` • ${selSem} sem funcionário (pede a senha)` : ''}` : 'Marque as caixas para dar baixa em várias de uma vez'}</div></div>
        ${selV.length ? `<button class="btn btn-primary" type="button" onclick="gutBaixa.abrirSelecionadas()">✓ Baixa completa (${selV.length})${selSem ? ' 🔒' : ''}</button><button class="btn btn-secondary btn-sm" type="button" onclick="gutBaixa.marcarTodas(false)">Limpar seleção</button>` : ''}</div>
      <div class="bx-lista" role="list">${linhas}</div>`;
  }
  function rerender() { if (typeof renderInternalDashboard === 'function') renderInternalDashboard(); }

  window.gutBaixa = {
    abrir, fechar, confirmar, criarSenha, trocarSenha, render, botao, linhasHtml, plano,
    marcar(id, on) { on ? B.sel.add(String(id)) : B.sel.delete(String(id)); rerender(); },
    marcarTodas(on) { if (!on) B.sel.clear(); else (typeof internalBoardRows === 'function' ? internalBoardRows() : rows()).forEach(v => { if (pendentes(v).length && num(v._progress) < 100) B.sel.add(String(v.ID_VOLUME)); }); rerender(); },
    abrirSelecionadas() { abrir([...B.sel]); },
    selecionadas: () => [...B.sel],
  };
})();
