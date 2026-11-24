/* GUT PPCP — máquinas numeradas, etiquetas QR das máquinas e crachás dos funcionários — v4.33
   QR da máquina: "GUT-MAQ:<código>"  •  QR do funcionário: "GUT-OP:<ID_OPERADOR>"
   Unidades das máquinas: private.maquina_unidades (web_unidades_ler / web_unidades_salvar).
   Foto do funcionário: Storage "produtos", caminho <empresa>/operadores/<ID_OPERADOR>.jpg */
(function () {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const web = () => typeof GUT_SB !== 'undefined' && GUT_SB && typeof GUT_EMPRESA_SLUG !== 'undefined' && GUT_EMPRESA_SLUG;
  const aviso = (m, erro) => (window.toast ? toast(m, erro) : alert(m));
  const empNome = () => { try { return (typeof GUT_EMPRESA !== 'undefined' && GUT_EMPRESA && (GUT_EMPRESA.nome || GUT_EMPRESA.slug)) || ''; } catch (e) { return ''; } };
  const U = { lista: null, carregando: null, fotos: new Map() };

  /* ---------- unidades ---------- */
  async function unidades(forcar) {
    if (U.lista && !forcar) return U.lista;
    if (!web()) return (U.lista = []);
    if (U.carregando && !forcar) return U.carregando;
    U.carregando = GUT_SB.rpc('web_unidades_ler', { p_slug: GUT_EMPRESA_SLUG }).then(({ data, error }) => { U.carregando = null; if (error) throw new Error(error.message); return (U.lista = data || []); });
    return U.carregando;
  }
  const maqs = () => (typeof STATE !== 'undefined' && STATE.cad && STATE.cad.maquinas) || [];
  const maq = id => maqs().find(m => String(m.ID_MAQUINA) === String(id));
  const nomeMaq = m => m ? (m.MAQUINA || m.COD_MAQUINA || m.ID_MAQUINA) : 'Máquina';
  function prefixo(m) {
    const t = String((m && (m.MAQUINA || m.COD_MAQUINA)) || 'MQ').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^(MAQUINA|MAQ\.?)\s+(DE\s+)?/, '');
    const w = (t.match(/[A-Z]+/) || ['MQ'])[0], c = w.slice(1).match(/[BCDFGHJKLMNPQRSTVWXYZ]/);
    return (w[0] + (c ? c[0] : (w[1] || 'Q'))).slice(0, 2);
  }
  const doTipo = id => (U.lista || []).filter(u => String(u.maq) === String(id));
  const qrMaq = c => 'GUT-MAQ:' + c, qrOp = id => 'GUT-OP:' + id;

  /* ---------- QR (usa a biblioteca qrcodejs já carregada na página) ---------- */
  function qrDataUrl(texto, px = 300) {
    if (typeof QRCode === 'undefined') return '';
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(d);
    try { new QRCode(d, { text: texto, width: px, height: px, correctLevel: QRCode.CorrectLevel.M }); const c = d.querySelector('canvas'); return c ? c.toDataURL('image/png') : (d.querySelector('img') || {}).src || ''; }
    finally { d.remove(); }
  }

  /* ---------- impressão por iframe (não depende de janela pop-up) ---------- */
  function imprimir(titulo, css, corpo) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    const doc = f.contentDocument; doc.open();
    doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
      *{box-sizing:border-box}body{margin:0;font-family:'DM Sans',Inter,Arial,sans-serif;color:#16171b;-webkit-print-color-adjust:exact;print-color-adjust:exact}${css}</style></head><body>${corpo}</body></html>`);
    doc.close();
    const ir = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); };
    const imgs = [...doc.images]; let falta = imgs.filter(i => !i.complete).length;
    if (!falta) setTimeout(ir, 250); else imgs.forEach(i => { if (!i.complete) i.onload = i.onerror = () => { if (--falta <= 0) setTimeout(ir, 150); }; });
  }

  /* ---------- etiquetas das máquinas ---------- */
  const CSS_ETQ = `@page{size:A4;margin:8mm}.grid{display:flex;flex-wrap:wrap;gap:4mm}
    .etq{width:62mm;height:38mm;border:0.3mm solid #c9ccd3;border-radius:3mm;display:flex;align-items:center;gap:3mm;padding:2.5mm 3mm;page-break-inside:avoid;break-inside:avoid;position:relative;overflow:hidden}
    .etq:before{content:"";position:absolute;left:0;top:0;bottom:0;width:1.6mm;background:#e11d2a}
    .etq img{width:31mm;height:31mm;flex:0 0 31mm}.etq .t{display:flex;flex-direction:column;gap:1mm;min-width:0}
    .etq b{font-size:19pt;line-height:1;letter-spacing:-.3pt}.etq span{font-size:8.5pt;font-weight:700;line-height:1.15}.etq small{font-size:6.5pt;color:#5b606b;line-height:1.2}`;
  function etiquetas(lista) {
    if (!lista.length) { aviso('Nenhuma unidade para imprimir. Gere as unidades primeiro.', true); return; }
    const emp = empNome();
    imprimir('Etiquetas das máquinas', CSS_ETQ, `<div class="grid">${lista.map(u => { const m = maq(u.maq); return `<div class="etq"><img src="${qrDataUrl(qrMaq(u.codigo))}" alt=""><div class="t"><b>${esc(u.codigo)}</b><span>${esc(nomeMaq(m))}</span>${u.serie ? `<small>Série ${esc(u.serie)}</small>` : ''}<small>${esc(emp)}</small></div></div>`; }).join('')}</div>`);
  }

  /* ---------- modal genérico ---------- */
  function modal(html, larg = 640) {
    let m = $('gutCrModal');
    if (!m) { m = document.createElement('div'); m.id = 'gutCrModal'; m.className = 'cr-modal'; document.body.appendChild(m); m.addEventListener('mousedown', e => { if (e.target === m) fechar(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('show')) { e.stopPropagation(); fechar(); } }, true); }
    m.innerHTML = `<div class="cr-card" style="max-width:${larg}px" role="dialog" aria-modal="true">${html}</div>`; m.classList.add('show');
    setTimeout(() => m.querySelector('input,button')?.focus(), 40);
  }
  function fechar() { $('gutCrModal')?.classList.remove('show'); }

  /* ---------- tela de unidades de um tipo de máquina ---------- */
  let ED = null;
  async function abrirUnidades(id) {
    const m = maq(id); if (!m) return;
    modal('<div class="cr-load">Carregando…</div>');
    try { await unidades(); } catch (e) { modal(`<p>Não foi possível carregar: ${esc(e.message)}</p><div class="cr-acts"><button class="btn btn-secondary" onclick="gutCrachas.fechar()">Fechar</button></div>`); return; }
    ED = { id: String(id), linhas: doTipo(id).map(u => Object.assign({}, u)), pref: doTipo(id)[0] ? String(doTipo(id)[0].codigo).replace(/[-_.]?\d+$/, '') : prefixo(m) };
    desenharUnidades();
  }
  function desenharUnidades() {
    const m = maq(ED.id), tot = Math.max(0, Math.floor(Number(m.QTD_TOTAL) || 0));
    modal(`<div class="cr-head"><div><h3>${esc(nomeMaq(m))}</h3><p>Cada máquina física ganha um código próprio, impresso na etiqueta com QR. O código não muda se a máquina trocar de lugar.</p></div><button class="cr-x" onclick="gutCrachas.fechar()" aria-label="Fechar">×</button></div>
      <div class="cr-gen"><label><span>Prefixo</span><input id="crPref" value="${esc(ED.pref)}" maxlength="10" oninput="gutCrachas._pref(this.value)"></label>
        <button class="btn btn-secondary btn-sm" onclick="gutCrachas._gerar()">Gerar até ${tot} unidade(s)</button><span class="muted">Cadastro: ${tot} no total • ${ED.linhas.length} numerada(s)</span></div>
      <div class="cr-uni">${ED.linhas.length ? `<div class="cr-uh"><span>Código</span><span>Descrição / posto</span><span>Nº de série</span><span>Ativa</span><span></span></div>` + ED.linhas.map((u, i) => `<div class="cr-ur">
        <input value="${esc(u.codigo)}" maxlength="24" oninput="gutCrachas._lin(${i},'codigo',this.value)" class="mono">
        <input value="${esc(u.descricao || '')}" maxlength="60" placeholder="ex.: perto da janela" oninput="gutCrachas._lin(${i},'descricao',this.value)">
        <input value="${esc(u.serie || '')}" maxlength="40" oninput="gutCrachas._lin(${i},'serie',this.value)">
        <input type="checkbox" ${u.ativo !== false ? 'checked' : ''} onchange="gutCrachas._lin(${i},'ativo',this.checked)" aria-label="Ativa">
        <button class="cr-del" onclick="gutCrachas._tirar(${i})" title="Remover esta unidade">×</button></div>`).join('') : '<p class="muted">Nenhuma unidade numerada ainda. Use "Gerar".</p>'}</div>
      <button class="btn btn-secondary btn-sm" onclick="gutCrachas._mais()">+ Adicionar unidade</button>
      <div class="cr-acts"><button class="btn btn-secondary" onclick="gutCrachas._etqTipo()">🏷 Imprimir etiquetas QR</button><span style="flex:1"></span><button class="btn btn-secondary" onclick="gutCrachas.fechar()">Cancelar</button><button class="btn btn-primary" id="crSalvar" onclick="gutCrachas._salvar()">Salvar</button></div>`, 760);
  }
  function proxCod() {
    const usados = new Set(ED.linhas.map(u => String(u.codigo).toUpperCase())), pref = (ED.pref || 'MQ').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'MQ';
    for (let n = 1; n < 1000; n++) { const c = `${pref}-${String(n).padStart(2, '0')}`; if (!usados.has(c)) return c; }
    return pref + '-' + Date.now().toString().slice(-4);
  }

  /* ---------- crachás dos funcionários ---------- */
  const ops = () => ((typeof STATE !== 'undefined' && STATE.cad && STATE.cad.operadores) || []);
  const op = id => ops().find(o => String(o.ID_OPERADOR) === String(id));
  const setor = o => { try { return (STATE.cad.setores || []).find(s => String(s.ID_SETOR) === String(o.ID_SETOR_PADRAO))?.SETOR || ''; } catch (e) { return ''; } };
  async function fotoCaminho(id) { return `${await gutEmpresaId()}/operadores/${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`; }
  async function foto(id) {
    if (U.fotos.has(id)) return U.fotos.get(id); if (!web()) return '';
    try { const { data, error } = await GUT_SB.storage.from('produtos').download(await fotoCaminho(id)); if (error || !data) { U.fotos.set(id, ''); return ''; } const u = await gutBlobDataUrl(data); U.fotos.set(id, u); return u; }
    catch (e) { U.fotos.set(id, ''); return ''; }
  }
  function reduzir(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = () => rej(new Error('Não foi possível ler a foto.'));
      fr.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('Arquivo de imagem inválido.')); im.onload = () => {
        const lado = Math.min(im.width, im.height * 0.8), sx = (im.width - lado) / 2, sh = lado / 0.8, sy = Math.max(0, (im.height - sh) / 2.6);
        const c = document.createElement('canvas'); c.width = 480; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 600);
        g.drawImage(im, sx, sy, lado, Math.min(sh, im.height), 0, 0, 480, 600); res(c.toDataURL('image/jpeg', 0.86)); }; im.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  const CSS_CR = `@page{size:A4;margin:8mm}.grid{display:flex;flex-wrap:wrap;gap:5mm}
    .cr{width:54mm;height:86mm;border:0.3mm solid #c9ccd3;border-radius:3.5mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;page-break-inside:avoid;break-inside:avoid;background:#fff}
    .cr .top{width:100%;height:15mm;background:linear-gradient(135deg,#16171b 0,#16171b 62%,#e11d2a 62.2%);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 4mm}
    .cr .top b{font-size:9.5pt;letter-spacing:.2pt;line-height:1.1;max-width:38mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cr .top small{font-size:6pt;opacity:.75}
    .cr .ph{width:25mm;height:31mm;margin-top:-5mm;border-radius:2.5mm;border:0.8mm solid #fff;box-shadow:0 0 0 0.3mm #c9ccd3;background:#eceef2 center/cover no-repeat;display:grid;place-items:center;color:#9aa0aa;font-size:20pt;font-weight:800}
    .cr .nm{margin-top:2mm;font-size:10.5pt;font-weight:800;text-align:center;line-height:1.1;padding:0 3mm;max-height:9mm;overflow:hidden}
    .cr .mt{font-size:7.5pt;color:#5b606b;text-align:center;margin-top:.6mm}
    .cr .qr{margin-top:auto;margin-bottom:2.5mm;display:flex;flex-direction:column;align-items:center}.cr .qr img{width:21mm;height:21mm}.cr .qr small{font-size:5.5pt;color:#7a7f8a}`;
  async function crachas(lista) {
    if (!lista.length) { aviso('Nenhum funcionário para imprimir.', true); return; }
    aviso('Montando os crachás…');
    const emp = empNome(), fotos = await Promise.all(lista.map(o => foto(String(o.ID_OPERADOR))));
    imprimir('Crachás', CSS_CR, `<div class="grid">${lista.map((o, i) => { const ini = String(o.NOME || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(); return `<div class="cr"><div class="top"><b>${esc(emp || 'Empresa')}</b><small>Produção</small></div>
      <div class="ph" style="${fotos[i] ? `background-image:url('${fotos[i]}')` : ''}">${fotos[i] ? '' : esc(ini)}</div><div class="nm">${esc(o.NOME || '')}</div><div class="mt">${o.MATRICULA ? 'Matrícula ' + esc(o.MATRICULA) : ''}${setor(o) ? ' • ' + esc(setor(o)) : ''}</div>
      <div class="qr"><img src="${qrDataUrl(qrOp(o.ID_OPERADOR))}" alt=""><small>${esc(o.MATRICULA || o.ID_OPERADOR)}</small></div></div>`; }).join('')}</div>`);
  }
  async function abrirCracha(id) {
    const o = op(id); if (!o) return;
    modal('<div class="cr-load">Carregando…</div>', 560);
    const f = await foto(String(id)), ini = String(o.NOME || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    modal(`<div class="cr-head"><div><h3>Crachá • ${esc(o.NOME || '')}</h3><p>Foto 3×4 e QR do funcionário. O QR serve para bipar quem está em cada máquina.</p></div><button class="cr-x" onclick="gutCrachas.fechar()" aria-label="Fechar">×</button></div>
      <div class="cr-prev"><div class="cr-mini"><div class="top"><b>${esc(empNome() || 'Empresa')}</b></div><div class="ph" id="crPh" style="${f ? `background-image:url('${f}')` : ''}">${f ? '' : esc(ini)}</div><div class="nm">${esc(o.NOME || '')}</div><div class="mt">${o.MATRICULA ? 'Matrícula ' + esc(o.MATRICULA) : ''}${setor(o) ? ' • ' + esc(setor(o)) : ''}</div><img class="qr" src="${qrDataUrl(qrOp(o.ID_OPERADOR), 180)}" alt="QR do funcionário"></div>
      <div class="cr-side"><input type="file" id="crFile" accept="image/*" capture="user" hidden onchange="gutCrachas._foto('${esc(id)}',this.files[0])">
        <button class="btn btn-secondary" onclick="document.getElementById('crFile').click()">${f ? '📷 Trocar foto' : '📷 Pôr foto'}</button>
        ${f ? `<button class="btn btn-secondary" onclick="gutCrachas._semFoto('${esc(id)}')">Tirar a foto</button>` : ''}
        <p class="muted">Pode tirar a foto pelo celular ou escolher um arquivo. Ela é cortada em 3×4 automaticamente.</p>
        <button class="btn btn-primary" onclick="gutCrachas._imprimirUm('${esc(id)}')">🪪 Imprimir crachá</button></div></div>`, 600);
  }

  window.gutCrachas = {
    fechar, unidades, abrirUnidades, abrirCracha,
    etiquetasTodas: async () => { try { await unidades(true); } catch (e) { aviso(e.message, true); return; } etiquetas((U.lista || []).filter(u => u.ativo !== false)); },
    crachasTodos: () => crachas(ops().filter(o => !['FALSE', '0', 'NAO', 'NÃO'].includes(String(o.ATIVO ?? '').toUpperCase())).sort((a, b) => String(a.NOME).localeCompare(String(b.NOME), 'pt-BR'))),
    porCodigo: c => (U.lista || []).find(u => String(u.codigo).toUpperCase() === String(c).toUpperCase()),
    _pref(v) { ED.pref = v; },
    _gerar() { const m = maq(ED.id), tot = Math.max(0, Math.floor(Number(m.QTD_TOTAL) || 0)); if (ED.linhas.length >= tot) { aviso(`Já há ${ED.linhas.length} unidade(s). Aumente a quantidade total no cadastro ou use "+ Adicionar unidade".`); return; } while (ED.linhas.length < tot) ED.linhas.push({ codigo: proxCod(), ativo: true }); desenharUnidades(); },
    _mais() { ED.linhas.push({ codigo: proxCod(), ativo: true }); desenharUnidades(); },
    _tirar(i) { ED.linhas.splice(i, 1); desenharUnidades(); },
    _lin(i, k, v) { ED.linhas[i][k] = k === 'codigo' ? String(v).toUpperCase() : v; },
    _etqTipo() { etiquetas(ED.linhas.filter(u => u.ativo !== false && u.codigo).map(u => Object.assign({ maq: ED.id }, u))); },
    async _salvar() {
      const b = $('crSalvar'); if (b) { b.disabled = true; b.textContent = 'Salvando…'; }
      try {
        const { data, error } = await GUT_SB.rpc('web_unidades_salvar', { p_slug: GUT_EMPRESA_SLUG, p_id_maquina: ED.id, p_unidades: ED.linhas.map(u => ({ id: u.id || '', codigo: String(u.codigo || '').trim().toUpperCase(), descricao: u.descricao || '', serie: u.serie || '', ativo: u.ativo !== false })) });
        if (error) throw new Error(error.message);
        U.lista = data || []; fechar(); aviso('Máquinas numeradas salvas.');
        try { if (typeof renderCadList === 'function' && STATE.cadType === 'maquina') renderCadList('maquina'); } catch (e) {}
        document.dispatchEvent(new CustomEvent('gut-unidades'));
      } catch (e) { aviso(e.message, true); if (b) { b.disabled = false; b.textContent = 'Salvar'; } }
    },
    async _foto(id, file) {
      if (!file) return;
      try { const url = await reduzir(file), blob = gutDataUrlBlob(url); const up = await GUT_SB.storage.from('produtos').upload(await fotoCaminho(id), blob, { contentType: 'image/jpeg', upsert: true }); if (up.error) throw new Error(up.error.message); U.fotos.set(String(id), url); aviso('Foto salva.'); abrirCracha(id); }
      catch (e) { aviso('Não foi possível salvar a foto: ' + e.message, true); }
    },
    async _semFoto(id) { if (!confirm('Tirar a foto deste funcionário?')) return; try { await GUT_SB.storage.from('produtos').remove([await fotoCaminho(id)]); U.fotos.set(String(id), ''); abrirCracha(id); } catch (e) { aviso(e.message, true); } },
    _imprimirUm(id) { const o = op(id); if (o) crachas([o]); }
  };
})();
