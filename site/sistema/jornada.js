/* GUT PPCP — jornada de trabalho da empresa por dia da semana (Cadastros → Jornada de trabalho) — v4.40
   Banco: private.empresa_jornada (web_jornada_ler / web_jornada_salvar_semana). Dias ISO: 1 = segunda … 7 = domingo.
   Usada no OEE das máquinas (layout.js) e, se a pessoa quiser, como capacidade das máquinas (média de minutos por dia de trabalho). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const web = () => typeof GUT_SB !== 'undefined' && GUT_SB && typeof GUT_EMPRESA_SLUG !== 'undefined' && GUT_EMPRESA_SLUG;
  const aviso = (m, erro) => (window.toast ? toast(m, erro) : alert(m));
  const NOMES = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const J = { dados: null, quando: 0, carregando: null, rasc: null };

  const min = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hm = v => { v = Math.max(0, Math.round(v)); const h = Math.floor(v / 60), m = v % 60; return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };
  function minutosDia(j) {
    const e = min(j.entrada), s = min(j.saida), ii = min(j.intervalo_ini), fi = min(j.intervalo_fim);
    if (e == null || s == null || s <= e) return 0;
    return s - e - (ii != null && fi != null && fi > ii ? Math.max(0, Math.min(fi, s) - Math.max(ii, e)) : 0);
  }
  const diaVazio = d => ({ dia: d, trabalha: false, entrada: '', saida: '', intervalo_ini: '', intervalo_fim: '' });
  /* aceita o formato novo (semana) e o antigo (um horário + dias) */
  function normalizar(data) {
    const base = data || {};
    let semana = Array.isArray(base.semana) && base.semana.length === 7 ? base.semana.map(x => ({ ...diaVazio(Number(x.dia)), ...x, dia: Number(x.dia), trabalha: !!x.trabalha })) : null;
    if (!semana) {
      const dias = (base.dias || (base.configurada ? [] : [1, 2, 3, 4, 5])).map(Number), e = base.entrada || '07:00', s = base.saida || '17:00';
      const ii = base.configurada ? base.intervalo_ini || '' : '12:00', fi = base.configurada ? base.intervalo_fim || '' : '13:00';
      semana = [1, 2, 3, 4, 5, 6, 7].map(d => dias.includes(d) ? { dia: d, trabalha: true, entrada: e, saida: s, intervalo_ini: ii, intervalo_fim: fi } : diaVazio(d));
    }
    return { configurada: !!base.configurada, semana };
  }
  const totais = semana => { const ds = semana.filter(x => x.trabalha), tot = ds.reduce((t, x) => t + minutosDia(x), 0); return { tot, n: ds.length, media: ds.length ? tot / ds.length : 0 }; };

  /* minutos de trabalho planejados no dia até "quando" (0 se o dia não é de trabalho) */
  function planejadoAte(quando, j) {
    j = j || J.dados || normalizar(null); quando = quando || new Date();
    const d = (j.semana || []).find(x => x.dia === (quando.getDay() || 7)); if (!d || !d.trabalha) return 0;
    const agora = quando.getHours() * 60 + quando.getMinutes(), e = min(d.entrada), s = min(d.saida); if (e == null || s == null) return 0;
    const fim = Math.min(agora, s); if (fim <= e) return 0;
    const ii = min(d.intervalo_ini), fi = min(d.intervalo_fim);
    const pausa = ii != null && fi != null ? Math.max(0, Math.min(fim, fi) - Math.max(e, ii)) : 0;
    return fim - e - pausa;
  }

  async function ler(forcar) {
    if (!web()) return (J.dados = J.dados || normalizar(null));
    if (J.dados && !forcar && Date.now() - J.quando < 300000) return J.dados;
    if (J.carregando && !forcar) return J.carregando;
    J.carregando = GUT_SB.rpc('web_jornada_ler', { p_slug: GUT_EMPRESA_SLUG }).then(({ data, error }) => {
      J.carregando = null; J.quando = Date.now();
      J.dados = error || !data ? (J.dados || normalizar(null)) : normalizar(data);
      return J.dados;
    }).catch(() => { J.carregando = null; return (J.dados = J.dados || normalizar(null)); });
    return J.carregando;
  }

  /* ---------- tela do cadastro ---------- */
  const copia = d => ({ configurada: d.configurada, semana: d.semana.map(x => ({ ...x })) });
  function resumo() {
    const r = J.rasc, el = $('jrResumo'); if (!el || !r) return;
    r.semana.forEach(x => { const c = $('jrTot' + x.dia); if (c) { const m = x.trabalha ? minutosDia(x) : 0; c.textContent = x.trabalha ? (m > 0 ? hm(m) : 'confira') : '—'; c.classList.toggle('jr-erro', x.trabalha && !(m > 0)); } });
    const t = totais(r.semana), ruim = r.semana.some(x => x.trabalha && !(minutosDia(x) > 0));
    el.innerHTML = t.n && !ruim ? `<b>${hm(t.tot)}</b> por semana <span>•</span> <b>${t.n}</b> dia${t.n > 1 ? 's' : ''} de trabalho <span>•</span> média de <b>${hm(t.media)}</b> por dia`
      : `<span class="jr-erro">${t.n ? 'Confira os horários dos dias marcados.' : 'Marque pelo menos um dia de trabalho.'}</span>`;
    const cap = $('jrCapTxt'); if (cap) cap.textContent = t.media > 0 ? `${Math.round(t.media)} min, a média por dia de trabalho` : 'a média de minutos por dia de trabalho';
  }
  function linha(x) {
    const id = x.dia, temInt = !!(x.intervalo_ini || x.intervalo_fim);
    const inp = (k, rot) => `<label><span class="jr-rot">${rot}</span><input type="time" id="jr${k}${id}" value="${esc(x[k])}" ${x.trabalha ? '' : 'disabled'} aria-label="${rot} de ${NOMES[id].toLowerCase()}" oninput="gutJornada.campo(${id},'${k}',this.value)"></label>`;
    return `<div class="jr-dialinha${x.trabalha ? '' : ' off'}" role="row">
      <label class="jr-tg"><input type="checkbox" ${x.trabalha ? 'checked' : ''} onchange="gutJornada.trabalha(${id},this.checked)"><b>${NOMES[id]}</b></label>
      ${x.trabalha ? `${inp('entrada', 'Entrada')}${inp('saida', 'Saída')}
        <div class="jr-int">${temInt ? `${inp('intervalo_ini', 'Intervalo de')}${inp('intervalo_fim', 'até')}<button type="button" class="jr-link" onclick="gutJornada.semIntervalo(${id})" aria-label="Tirar o intervalo de ${NOMES[id].toLowerCase()}">sem intervalo</button>` : `<button type="button" class="jr-link" onclick="gutJornada.comIntervalo(${id})">+ intervalo</button>`}</div>`
        : '<span class="jr-folga">Não trabalha</span>'}
      <span class="jr-tot" id="jrTot${id}"></span>
    </div>`;
  }
  function render() {
    const el = $('cadForms'); if (!el) return;
    if (!J.rasc) { el.innerHTML = '<div class="section-box"><p class="hint">Carregando a jornada…</p></div>'; ler(true).then(d => { J.rasc = copia(d); if (STATE.cadType === 'jornada') render(); }); return; }
    const r = J.rasc;
    el.innerHTML = `<div class="section-box jr-box">
      <h3 style="margin:0 0 4px"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Jornada de trabalho</h3>
      <div class="hint">O horário em que a fábrica trabalha em cada dia da semana. O sistema usa para calcular o OEE das máquinas no Layout da fábrica e, se você quiser, a capacidade de cada máquina.</div>
      ${J.dados && !J.dados.configurada ? '<div class="jr-aviso">Ainda não foi salva. Por enquanto o sistema considera das 07:00 às 17:00, com intervalo das 12:00 às 13:00, de segunda a sexta.</div>' : ''}
      <div class="jr-semana" role="table" aria-label="Horário por dia da semana">${r.semana.map(linha).join('')}</div>
      <div class="jr-atalhos"><button type="button" class="btn btn-secondary btn-sm" onclick="gutJornada.copiarSegunda()" title="Usa o horário de segunda em todos os dias marcados">Copiar o horário de segunda para os outros dias</button></div>
      <div class="jr-resumo" id="jrResumo"></div>
      <label class="jr-chk"><input type="checkbox" id="jrCap" checked> Usar também como capacidade das máquinas (<span id="jrCapTxt">a média de minutos por dia de trabalho</span>)</label>
      <div class="toolbar" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" type="button" id="jrSalvar" onclick="gutJornada.salvar()">💾 Salvar jornada</button></div>
    </div>`;
    resumo();
  }
  async function salvar() {
    const r = J.rasc; if (!r) return;
    if (!web()) return aviso('Disponível só no sistema on-line.', true);
    const t = totais(r.semana); if (!t.n) return aviso('Marque pelo menos um dia de trabalho.', true);
    const ruim = r.semana.find(x => x.trabalha && !(minutosDia(x) > 0)); if (ruim) return aviso(`Na ${NOMES[ruim.dia].toLowerCase()}, a saída precisa ser depois da entrada.`, true);
    const cap = !!($('jrCap') && $('jrCap').checked), b = $('jrSalvar'); if (b) b.disabled = true;
    try {
      const { data, error } = await GUT_SB.rpc('web_jornada_salvar_semana', { p_slug: GUT_EMPRESA_SLUG, p_semana: JSON.stringify(r.semana) });
      if (error) throw new Error(error.message);
      J.dados = normalizar(data); J.quando = Date.now(); J.rasc = copia(J.dados);
      const md = Math.round(totais(J.dados.semana).media);
      let extra = '';
      if (cap && md > 0) {
        const ms = ((typeof STATE !== 'undefined' && STATE.cad && STATE.cad.maquinas) || []).filter(m => m.ID_MAQUINA && String(m.ATIVO ?? 'TRUE').toUpperCase() !== 'FALSE');
        if (ms.length) {
          try {
            const rr = await callServer('salvarCapacidadeMaquinas', { itens: ms.map(m => ({ ID_MAQUINA: m.ID_MAQUINA, MINUTOS_DISP_DIA: md })) });
            if (rr && rr.maquinas) STATE.cad.maquinas = rr.maquinas;
            extra = ` Capacidade de ${ms.length} máquina(s): ${md} min/dia.`;
          } catch (e) { extra = ' (A capacidade das máquinas não foi atualizada: ' + e.message + ')'; }
        }
      }
      render(); aviso(`Jornada salva: ${hm(totais(J.dados.semana).tot)} por semana.${extra}`);
      document.dispatchEvent(new CustomEvent('gut-jornada'));
    } catch (e) { aviso(e.message, true); }
    finally { const b2 = $('jrSalvar'); if (b2) b2.disabled = false; }
  }
  const dia = n => J.rasc && J.rasc.semana.find(x => x.dia === n);

  window.gutJornada = {
    abrir() { J.rasc = null; render(); },
    ler, render, salvar, planejadoAte, minutosDia, hm, normalizar, dados: () => J.dados || normalizar(null),
    campo(n, k, v) { const x = dia(n); if (!x) return; x[k] = v; resumo(); },
    trabalha(n, on) {
      const x = dia(n); if (!x) return; x.trabalha = !!on;
      if (on && !x.entrada) { const ref = J.rasc.semana.find(y => y.trabalha && y.dia !== n && y.entrada) || { entrada: '07:00', saida: '17:00', intervalo_ini: '12:00', intervalo_fim: '13:00' }; Object.assign(x, { entrada: ref.entrada, saida: ref.saida, intervalo_ini: ref.intervalo_ini, intervalo_fim: ref.intervalo_fim }); }
      render();
    },
    semIntervalo(n) { const x = dia(n); if (!x) return; x.intervalo_ini = ''; x.intervalo_fim = ''; render(); },
    comIntervalo(n) { const x = dia(n); if (!x) return; x.intervalo_ini = '12:00'; x.intervalo_fim = '13:00'; render(); },
    copiarSegunda() {
      const s = dia(1); if (!s || !s.trabalha) return aviso('Marque e preencha a segunda primeiro.', true);
      J.rasc.semana.forEach(x => { if (x.trabalha && x.dia !== 1) Object.assign(x, { entrada: s.entrada, saida: s.saida, intervalo_ini: s.intervalo_ini, intervalo_fim: s.intervalo_fim }); });
      render();
    },
  };
})();
