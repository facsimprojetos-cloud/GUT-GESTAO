/* GUT PPCP — jornada de trabalho da empresa (Cadastros → Jornada de trabalho) — v4.38
   Banco: private.empresa_jornada (web_jornada_ler / web_jornada_salvar). Dias ISO: 1 = segunda … 7 = domingo.
   Usada no OEE das máquinas (layout.js) e, se a pessoa quiser, como capacidade das máquinas (minutos por dia). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const web = () => typeof GUT_SB !== 'undefined' && GUT_SB && typeof GUT_EMPRESA_SLUG !== 'undefined' && GUT_EMPRESA_SLUG;
  const aviso = (m, erro) => (window.toast ? toast(m, erro) : alert(m));
  const PADRAO = { configurada: false, entrada: '07:00', saida: '17:00', intervalo_ini: '12:00', intervalo_fim: '13:00', dias: [1, 2, 3, 4, 5] };
  const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];
  const J = { dados: null, quando: 0, carregando: null, rasc: null };

  const min = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hm = v => { v = Math.max(0, Math.round(v)); const h = Math.floor(v / 60), m = v % 60; return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };
  function minutosDia(j) {
    const e = min(j.entrada), s = min(j.saida), ii = min(j.intervalo_ini), fi = min(j.intervalo_fim);
    if (e == null || s == null || s <= e) return 0;
    return s - e - (ii != null && fi != null && fi > ii ? Math.max(0, Math.min(fi, s) - Math.max(ii, e)) : 0);
  }
  /* minutos de trabalho planejados no dia até "quando" (0 se o dia não é de trabalho) */
  function planejadoAte(quando, j) {
    j = j || J.dados || PADRAO; quando = quando || new Date();
    const iso = quando.getDay() || 7; if (!(j.dias || []).map(Number).includes(iso)) return 0;
    const agora = quando.getHours() * 60 + quando.getMinutes(), e = min(j.entrada), s = min(j.saida); if (e == null || s == null) return 0;
    const fim = Math.min(agora, s); if (fim <= e) return 0;
    const ii = min(j.intervalo_ini), fi = min(j.intervalo_fim);
    const pausa = ii != null && fi != null ? Math.max(0, Math.min(fim, fi) - Math.max(e, ii)) : 0;
    return fim - e - pausa;
  }

  async function ler(forcar) {
    if (!web()) return (J.dados = J.dados || { ...PADRAO });
    if (J.dados && !forcar && Date.now() - J.quando < 300000) return J.dados;
    if (J.carregando && !forcar) return J.carregando;
    J.carregando = GUT_SB.rpc('web_jornada_ler', { p_slug: GUT_EMPRESA_SLUG }).then(({ data, error }) => {
      J.carregando = null; J.quando = Date.now();
      J.dados = error || !data ? (J.dados || { ...PADRAO }) : { ...PADRAO, ...data, dias: (data.dias || []).map(Number) };
      return J.dados;
    }).catch(() => { J.carregando = null; return (J.dados = J.dados || { ...PADRAO }); });
    return J.carregando;
  }

  /* ---------- tela do cadastro ---------- */
  function resumo() {
    const r = J.rasc, el = $('jrResumo'); if (!el || !r) return;
    const md = minutosDia(r), nd = r.dias.length;
    el.innerHTML = md > 0 && nd ? `<b>${hm(md)}</b> por dia <span>•</span> <b>${nd}</b> dia${nd > 1 ? 's' : ''} por semana <span>•</span> <b>${hm(md * nd)}</b> por semana`
      : '<span class="jr-erro">Confira os horários e marque os dias de trabalho.</span>';
  }
  function render() {
    const el = $('cadForms'); if (!el) return;
    if (!J.rasc) { el.innerHTML = '<div class="section-box"><p class="hint">Carregando a jornada…</p></div>'; ler(true).then(d => { J.rasc = { ...d, dias: [...d.dias] }; if (STATE.cadType === 'jornada') render(); }); return; }
    const r = J.rasc, temInt = !!(r.intervalo_ini || r.intervalo_fim);
    el.innerHTML = `<div class="section-box jr-box">
      <h3 style="margin:0 0 4px"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Jornada de trabalho</h3>
      <div class="hint">O horário em que a fábrica trabalha. O sistema usa para calcular o OEE das máquinas no Layout da fábrica e, se você quiser, a capacidade de cada máquina.</div>
      ${J.dados && !J.dados.configurada ? '<div class="jr-aviso">Ainda não foi salva. Por enquanto o sistema considera das 07:00 às 17:00, com intervalo das 12:00 às 13:00, de segunda a sexta.</div>' : ''}
      <div class="jr-grid">
        <div class="jr-card"><div class="jr-h">Horário</div>
          <div class="jr-linha"><label>Entrada<input type="time" id="jrEntrada" value="${esc(r.entrada)}" oninput="gutJornada.campo('entrada',this.value)"></label>
          <label>Saída<input type="time" id="jrSaida" value="${esc(r.saida)}" oninput="gutJornada.campo('saida',this.value)"></label></div>
        </div>
        <div class="jr-card"><div class="jr-h">Intervalo (almoço)</div>
          <div class="jr-linha"><label>De<input type="time" id="jrIntIni" value="${esc(r.intervalo_ini)}" oninput="gutJornada.campo('intervalo_ini',this.value)"></label>
          <label>Até<input type="time" id="jrIntFim" value="${esc(r.intervalo_fim)}" oninput="gutJornada.campo('intervalo_fim',this.value)"></label></div>
          ${temInt ? '<button type="button" class="jr-link" onclick="gutJornada.semIntervalo()">Não tem intervalo</button>' : '<span class="hint">Sem intervalo</span>'}
        </div>
        <div class="jr-card jr-dias-card"><div class="jr-h">Dias de trabalho</div>
          <div class="jr-dias" role="group" aria-label="Dias de trabalho">${DIAS.map(([n, t]) => `<button type="button" class="jr-dia${r.dias.includes(n) ? ' on' : ''}" aria-pressed="${r.dias.includes(n)}" onclick="gutJornada.dia(${n})">${t}</button>`).join('')}</div>
        </div>
      </div>
      <div class="jr-resumo" id="jrResumo"></div>
      <label class="jr-chk"><input type="checkbox" id="jrCap" checked> Usar também como capacidade das máquinas (minutos por dia de cada máquina)</label>
      <div class="toolbar" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" type="button" id="jrSalvar" onclick="gutJornada.salvar()">💾 Salvar jornada</button></div>
    </div>`;
    resumo();
  }
  async function salvar() {
    const r = J.rasc; if (!r) return;
    if (!web()) return aviso('Disponível só no sistema on-line.', true);
    const md = minutosDia(r); if (!(md > 0)) return aviso('A saída precisa ser depois da entrada.', true);
    if (!r.dias.length) return aviso('Marque pelo menos um dia de trabalho.', true);
    const cap = !!($('jrCap') && $('jrCap').checked), b = $('jrSalvar'); if (b) b.disabled = true;
    try {
      const { data, error } = await GUT_SB.rpc('web_jornada_salvar', { p_slug: GUT_EMPRESA_SLUG, p_entrada: r.entrada, p_saida: r.saida, p_intervalo_ini: r.intervalo_ini || '', p_intervalo_fim: r.intervalo_fim || '', p_dias: r.dias.join(',') });
      if (error) throw new Error(error.message);
      J.dados = { ...PADRAO, ...data, dias: (data.dias || []).map(Number) }; J.quando = Date.now(); J.rasc = { ...J.dados, dias: [...J.dados.dias] };
      let extra = '';
      if (cap) {
        const ms = ((typeof STATE !== 'undefined' && STATE.cad && STATE.cad.maquinas) || []).filter(m => m.ID_MAQUINA && String(m.ATIVO ?? 'TRUE').toUpperCase() !== 'FALSE');
        if (ms.length) {
          try {
            const rr = await callServer('salvarCapacidadeMaquinas', { itens: ms.map(m => ({ ID_MAQUINA: m.ID_MAQUINA, MINUTOS_DISP_DIA: Math.round(md) })) });
            if (rr && rr.maquinas) STATE.cad.maquinas = rr.maquinas;
            extra = ` Capacidade de ${ms.length} máquina(s) atualizada para ${Math.round(md)} min/dia.`;
          } catch (e) { extra = ' (A capacidade das máquinas não foi atualizada: ' + e.message + ')'; }
        }
      }
      render(); aviso(`Jornada salva: ${J.dados.entrada} às ${J.dados.saida}, ${hm(md)} por dia.${extra}`);
      document.dispatchEvent(new CustomEvent('gut-jornada'));
    } catch (e) { aviso(e.message, true); }
    finally { const b2 = $('jrSalvar'); if (b2) b2.disabled = false; }
  }

  window.gutJornada = {
    abrir() { J.rasc = null; render(); },
    ler, render, salvar, planejadoAte, minutosDia, hm, dados: () => J.dados || PADRAO,
    campo(k, v) { if (!J.rasc) return; J.rasc[k] = v; resumo(); },
    semIntervalo() { if (!J.rasc) return; J.rasc.intervalo_ini = ''; J.rasc.intervalo_fim = ''; render(); },
    dia(n) { if (!J.rasc) return; const d = J.rasc.dias; J.rasc.dias = d.includes(n) ? d.filter(x => x !== n) : [...d, n].sort((a, b) => a - b); render(); },
  };
})();
