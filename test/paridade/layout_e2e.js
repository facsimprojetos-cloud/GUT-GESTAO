#!/usr/bin/env node
// v4.23.0 — Facção com serviço parcial, na tela /sistema (Playwright + banco local, tudo pelo servidor):
//  • janela de destino: "Peça pronta" / "Serviço parcial", desmarcar operações, preço proporcional;
//  • quadro interno: saco que passou pela facção, operações da facção concluídas, "Problema da facção";
//  • kanban e romaneio mostram o serviço parcial.
//   node test/paridade/layout_e2e.js  (SHOT=/dir tira fotos) — Layout da fábrica
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pg = require('./pg_base'), criarGas = require('./gas_sim'), { cenario, executorA, chamarRpc, carregarServidor } = require('./rodar');
const { criarRelogio } = require('./relogio');
const ROOT = path.join(__dirname, '..', '..');
const SHOT = process.env.SHOT || ''; const shot = async (page, nome, sel) => { if (!SHOT) return; const el = sel ? await page.$(sel) : null; await (el || page).screenshot({ path: path.join(SHOT, nome + '.png') }); };
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  await pg.subir();
  let browser;
  try {
    const gas = criarGas(pg); await cenario(executorA(gas, criarRelogio(Date.now() - 3600000), []));
    const html = fs.readFileSync(path.join(ROOT, 'site/sistema/index.html'), 'utf8');
    const motorJs = fs.readFileSync(path.join(ROOT, 'site/sistema/gut-motor.js'), 'utf8');
    const API = [], RPC = [], FN = []; let bancoFora = false, servidorFora = false;
    pg.psql(`update public.empresas set maquinas_dono = 5 where id = '${pg.EMP}';`);   // a parte das máquinas (no fim) testa o limite de 1
    const srv = await carregarServidor();
    const mockSb = `window.supabase={createClient(){const s={access_token:'tok-ok',user:{email:'carla@gut.com'}};
      return {auth:{async getSession(){return {data:{session:s}}},async signInWithPassword(){return {error:null}},async signOut(){},async resetPasswordForEmail(){return {error:null}}},
        storage:{from(){const S=window.__fotos||(window.__fotos={});return {async upload(p,b){S[p]=b;return {error:null}},async download(p){return S[p]?{data:S[p],error:null}:{data:null,error:{message:'não achei'}}},async remove(l){(l||[]).forEach(p=>delete S[p]);return {error:null}}}}},
        async rpc(fn,args){const r=await fetch('http://sb.local/rpc/'+fn,{method:'POST',body:JSON.stringify(args)});const j=await r.json();return r.ok?{data:j,error:null}:{data:null,error:{message:j.message,code:j.code}}},
        channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}}}};`;
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
    const errors = [], avisos = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') avisos.push(m.text()); });
    await page.route('**/*', async r => {
      const u = r.request().url();
      if (u.startsWith('http://app.local/sistema/gut-motor.js')) return r.fulfill({ contentType: 'application/javascript', body: motorJs });
      if (u.startsWith('http://app.local/sistema/paineis-tv.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/paineis-tv.js'), 'utf8') });
      if (u.startsWith('http://app.local/sistema/crachas.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/crachas.js'), 'utf8') });
      if (u.startsWith('http://app.local/sistema/layout.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/layout.js'), 'utf8') });
      if (u.startsWith('http://app.local/sistema/jornada.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/jornada.js'), 'utf8') });
      if (u.startsWith('http://app.local/sistema/menu-principal.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/menu-principal.js'), 'utf8') });
      if (u.startsWith('http://app.local/')) return r.fulfill({ contentType: 'text/html', body: html });
      if (u.startsWith('http://sb.local/rpc/')) {
        const fn = u.split('/rpc/')[1], args = JSON.parse(r.request().postData() || '{}'); RPC.push(fn);
        if (bancoFora) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'banco fora do ar' }) });
        try {
          return r.fulfill({ contentType: 'application/json', body: JSON.stringify(chamarRpc('gut', fn, args)) });
        } catch (e) { return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message.split('\n')[0], code: e.code || '' }) }); }
      }
      if (u.startsWith('https://ipjsogzbdkqprrtuquok.supabase.co/functions/v1/gut')) {
        const h = r.request().headers(), b = JSON.parse(r.request().postData() || '{}'); FN.push(b.acao);
        if (servidorFora) return r.fulfill({ status: 503, body: 'fora' });
        if (!/^Bearer tok-ok$/.test(h.authorization || '')) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"msg":"Invalid JWT"}' });
        return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(await srv.pedir(b.acao, b.args, b.meta, b.slug, b.dispositivo)) });
      }
      if (u.startsWith('https://script.google.com/')) {
        const b = JSON.parse(r.request().postData() || '{}'); API.push(b.action);
        let out; try { out = gas.api(b.action, b.args, b.meta || {}); } catch (e) { out = { __error: true, message: String(e.message || e) }; }
        return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
      }
      if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mockSb });
      if (u.includes('chart.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.Chart=function(){this.destroy=function(){};this.update=function(){}};Chart.defaults={plugins:{legend:{}}};' });
      if (u.includes('qrcode')) return r.fulfill({ contentType: 'application/javascript', body: 'window.QRCode=function(){};QRCode.CorrectLevel={M:0};' });
      return r.fulfill({ body: '' });
    });
    // leitura rápida do quadro de facções (gut_010; o banco local só carrega as migrações a partir da gut_014)
    { const m = fs.readFileSync(path.join(ROOT, 'supabase/migrations/gut_010_quadros_web.sql'), 'utf8'); const i = m.indexOf('create or replace function public.web_quadro_interno'); const j = m.indexOf('revoke all on function public.web_quadro_interno');
      pg.psql(m.slice(i, j) + '\ngrant execute on function public.web_quadro_interno(text), public.web_quadro_faccao(text) to authenticated;'); }
    await page.goto('http://app.local/sistema/'); await page.waitForTimeout(3500);
    await page.setViewportSize({ width: 1440, height: 900 });
    let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok', m); } else { fail++; console.log('✗', m); } };
    await page.evaluate(() => showView('layout')); await page.waitForTimeout(2500);
    ok(await page.$('#laySvg') !== null, 'a tela Layout da fábrica abre com a planta');
    const maq = await page.evaluate(() => (STATE.cad.maquinas || [])[0]?.ID_MAQUINA);
    ok(!!maq, 'a paleta tem as máquinas do cadastro');
    await page.evaluate(m => { gutLayout.campo('largura', '15'); gutLayout.campo('comprimento', '10'); gutLayout.adicionar('MAQ', String(m)); gutLayout.adicionar('MAQ', String(m)); gutLayout.adicionar('MESA'); }, maq);
    const st = await page.evaluate(() => { const d = gutLayout.estado().atual.dados; return { n: d.itens.length, w: d.largura, sobre: d.itens.some((a, i) => d.itens.some((b, j) => i < j && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)) }; });
    ok(st.n === 3 && st.w === 15 && !st.sobre, 'itens entram em lugares livres, sem sobrepor');
    await page.evaluate(() => { const d = gutLayout.estado().atual.dados; d.itens[0].x = 1; d.itens[0].y = 1; d.itens[1].x = 4; d.itens[1].y = 5; gutLayout.modo('COTA'); });
    const ids = await page.evaluate(() => gutLayout.estado().atual.dados.itens.map(i => i.id));
    await page.waitForTimeout(600);
    for (const id of ids.slice(0, 2)) { const b = await page.$(`[data-it="${id}"] rect`); const bb = await b.boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(200); }
    const cota = await page.evaluate(() => { const L = gutLayout.estado(); return { n: L.atual.dados.cotas.length, txt: document.querySelector('.lay-cota b')?.textContent, tot: document.querySelector('.lay-tot b')?.textContent }; });
    ok(cota.n === 1 && cota.txt === '5,00 m' && cota.tot === '5,00 m', 'cota entre duas máquinas mede a distância entre os centros (3 × 4 → 5,00 m): ' + JSON.stringify(cota));
    const occ = await page.evaluate(() => document.querySelector('.lay-it.maq')?.getAttribute('class'));
    ok(/\b(idle|ok|high|over)\b/.test(occ || ''), 'máquina pintada pela ocupação de hoje: ' + occ);
    await page.waitForTimeout(2500);
    ok(RPC.includes('web_layout_salvar') && await page.evaluate(() => !gutLayout.estado().sujo), 'salva sozinho no banco');
    await page.evaluate(() => { gutLayout.modo('MOVER'); });
    await page.evaluate(() => loadInternalProductionBoard(true)); await page.waitForTimeout(2500); await page.evaluate(() => { showView('layout'); }); await page.waitForTimeout(800);
    const lote = await page.evaluate(() => { const r = (STATE.internalBoard?.rows || []).find(v => (v.OPERACAO_ATUAL || v.PROXIMA_OPERACAO)); if (!r) return { sem: true, n: (STATE.internalBoard?.rows || []).length };
      const op = r.OPERACAO_ATUAL || r.PROXIMA_OPERACAO; if (!op.ID_MAQUINA) op.ID_MAQUINA = String(STATE.cad.maquinas[0].ID_MAQUINA); if (op.ID_MAQUINA) gutLayout.adicionar('MAQ', String(op.ID_MAQUINA)); gutLayout.adicionar('LOTE', String(r.ID_VOLUME)); gutLayout.adicionar('LOTE', String(r.ID_VOLUME));
      const d = gutLayout.estado().atual.dados; return { lotes: d.itens.filter(i => i.tipo === 'LOTE').length, pal: document.querySelectorAll('.lay-pal-lote').length, svg: document.querySelectorAll('.lay-it.lote').length, fluxo: document.querySelectorAll('.lay-flx').length, temMaq: !!op.ID_MAQUINA }; });
    ok(!lote.sem && lote.lotes === 1 && lote.pal >= 1 && lote.svg === 1, 'lote da produção interna entra na planta (uma vez só) e aparece na lista: ' + JSON.stringify(lote));
    ok(!lote.sem && lote.temMaq && lote.fluxo === 1, 'linha de fluxo liga o lote à máquina da próxima operação');
    await page.evaluate(() => gutLayout.cheia()); await page.waitForTimeout(600);
    const full = await page.evaluate(() => { const r = document.getElementById('laySvg').getBoundingClientRect(), v = document.getElementById('view-layout').getBoundingClientRect(); return { on: document.getElementById('view-layout').classList.contains('lay-full-on'), w: r.width, vw: v.width, h: v.height }; });
    ok(full.on && full.vw >= 1400 && full.h >= 880, 'tela cheia ocupa a janela inteira: ' + JSON.stringify(full));
    if (process.env.SHOT) { fs.mkdirSync(process.env.SHOT, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOT, 'layout-cheia.png') }); await page.evaluate(() => { gutLayout.lado('pal'); gutLayout.lado('prop'); }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOT, 'layout-cheia-so-planta.png') }); await page.evaluate(() => { gutLayout.lado('pal'); gutLayout.lado('prop'); }); }
    await page.evaluate(() => gutLayout.soPlanta(true)); await page.waitForTimeout(700);
    const so = await page.evaluate(() => { const r = document.getElementById('laySvg').getBoundingClientRect(); return { bar: getComputedStyle(document.querySelector('.lay-bar')).display, pal: getComputedStyle(document.getElementById('layPal')).display, h: r.height, w: r.width }; });
    ok(so.bar === 'none' && so.pal === 'none' && (so.h >= 820 || so.w >= 1380), 'modo só a planta: sem barras e a planta ocupa a tela: ' + JSON.stringify(so));
    if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'layout-so-planta.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => !document.getElementById('view-layout').classList.contains('lay-so')), 'Esc volta a mostrar os controles');
    await page.evaluate(() => gutLayout.cheia()); await page.waitForTimeout(2500);
    if (process.env.SHOT) { fs.mkdirSync(process.env.SHOT, { recursive: true }); await page.evaluate(() => { const d = gutLayout.estado().atual.dados; gutLayout.adicionar('CORREDOR'); gutLayout.adicionar('ESTOQUE'); }); await page.waitForTimeout(500); await page.screenshot({ path: path.join(process.env.SHOT, 'layout.png') }); await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(process.env.SHOT, 'layout-dark.png') }); await page.evaluate(() => { delete document.documentElement.dataset.theme; }); await page.waitForTimeout(2000); }
    // máquinas numeradas pelo cadastro
    await page.evaluate(() => { showView('cadastros'); });
    await page.waitForTimeout(800);
    const uni = await page.evaluate(async () => { const m = STATE.cad.maquinas[0]; await gutCrachas.abrirUnidades(m.ID_MAQUINA); gutCrachas._gerar(); const cods = [...document.querySelectorAll('.cr-ur input.mono')].map(i => i.value); await gutCrachas._salvar(); await new Promise(r => setTimeout(r, 800)); const l = await gutCrachas.unidades(true); return { tot: Number(m.QTD_TOTAL), cods, salvos: l.map(u => u.codigo), fechado: !document.getElementById('gutCrModal').classList.contains('show') }; });
    ok(uni.salvos.length === uni.tot && uni.fechado && /^[A-Z]{2}-01$/.test(uni.salvos[0]), 'cadastro numera as máquinas pela quantidade (RT-01, RT-02…): ' + JSON.stringify(uni));
    if (process.env.SHOT) { await page.evaluate(async () => { await gutCrachas.abrirUnidades(STATE.cad.maquinas[0].ID_MAQUINA); }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOT, 'unidades.png') }); await page.evaluate(() => gutCrachas.fechar());
      await page.evaluate(async () => { await gutCrachas.abrirCracha(STATE.cad.operadores[0].ID_OPERADOR); }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOT, 'cracha.png') }); await page.evaluate(() => gutCrachas.fechar());
      await page.evaluate(() => { const b = document.querySelector('[data-cad="maquina"]'); b && b.click(); }); await page.waitForTimeout(600); await page.screenshot({ path: path.join(process.env.SHOT, 'cad-maquinas.png') }); }
    const rep = await page.evaluate(async () => { const m = STATE.cad.maquinas[0]; const { error } = await GUT_SB.rpc('web_unidades_salvar', { p_slug: GUT_EMPRESA_SLUG, p_id_maquina: 'OUTRA', p_unidades: [{ codigo: (await gutCrachas.unidades())[0].codigo }] }); return error ? error.message : ''; });
    ok(/já está em uso/.test(rep), 'o mesmo código não pode ser usado em outra máquina: ' + rep);
    const cr = await page.evaluate(async () => { const o = STATE.cad.operadores[0]; try { await gutCrachas.abrirCracha(o.ID_OPERADOR); const ok = !!document.querySelector('.cr-mini .qr') && /Matrícula/.test(document.querySelector('.cr-mini').innerText); const t = document.getElementById('gutCrModal')?.innerText.slice(0, 150); gutCrachas.fechar(); return { ok, id: o.ID_OPERADOR, t }; } catch (e) { return { ok: false, id: o && o.ID_OPERADOR, err: e.message, html: document.getElementById('gutCrModal')?.innerText.slice(0, 200) }; } });
    ok(cr.ok, 'crachá do funcionário abre com o QR');
    // bipagem na planta: máquina → caixa ao lado; crachá → posto
    await page.evaluate(() => showView('layout')); await page.waitForTimeout(1500);
    const bip = await page.evaluate(async (opId) => {
      const u = (await gutCrachas.unidades())[1]; const L = gutLayout.estado(), d = L.atual.dados;
      gutLayout.bipar('GUT-MAQ:' + u.codigo); const m = d.itens.find(i => i.uni === u.id);
      const cx = (STATE.internalBoard.rows || [])[1]; const cod = displayVolumeCode(cx);
      gutLayout.bipar(cod); const l = d.itens.find(i => i.tipo === 'LOTE' && i.vol === String(cx.ID_VOLUME));
      const dist = l && m ? Math.hypot((l.x + l.w / 2) - (m.x + m.w / 2), (l.y + l.h / 2) - (m.y + m.h / 2)) : 99;
      const sobre = l && d.itens.some(i => i !== l && i.tipo !== 'AREA' && i.tipo !== 'CORREDOR' && l.x < i.x + i.w - 1e-6 && l.x + l.w > i.x + 1e-6 && l.y < i.y + i.h - 1e-6 && l.y + l.h > i.y + 1e-6);
      gutLayout.bipar('GUT-OP:' + opId);
      gutLayout.bipar('XYZ-NAO-EXISTE'); const msg = document.getElementById('layHint').textContent;
      return { maq: !!m && m.nome === u.codigo, perto: l ? l.perto === m.id : false, dist: Math.round(dist * 100) / 100, sobre, op: m && m.op === opId, msg, label: !!document.querySelector('.lay-optx') };
    }, cr.id);
    ok(bip.maq && bip.perto && bip.dist < 2.2 && !bip.sobre, 'bipar a máquina e depois a caixa põe a caixa encostada nela, sem sobrepor: ' + JSON.stringify(bip));
    ok(bip.op && bip.label, 'bipar o crachá põe o funcionário no posto da máquina');
    const posto = await page.evaluate((opId) => { const rows = STATE.internalBoard.rows, d = gutLayout.estado().atual.dados, m = d.itens.find(i => i.op === opId);
      const op = rows.flatMap(v => v.OPERACOES || []).find(o => !/CONCLU/.test(String(o.STATUS_CUPOM)) && Number(o.MINUTOS_PADRAO_TOTAL) > 0); if (!op || !m) return { sem: true };
      op.ID_OPERADOR_ALOCADO = opId; op.ID_MAQUINA = m.maq; gutLayout.estado().sel = m.id; gutLayout.prop('w', String(m.w).replace('.', ','));
      const t = document.getElementById('layProp').innerText; return { t: (t.match(/carga do posto hoje[^\n]*/) || [''])[0], min: Math.round(Number(op.MINUTOS_PADRAO_TOTAL)) }; }, cr.id);
    ok(!posto.sem && posto.t.includes(posto.min + ' de'), 'máquina com costureira no posto mostra a carga dos processos alocados a ela: ' + JSON.stringify(posto));
    // OEE de hoje: eventos da máquina (como se viessem do app de campo) e a cor "OEE"
    const uniOee = await page.evaluate(() => { const m = gutLayout.estado().atual.dados.itens.find(i => i.tipo === 'MAQ' && i.uni); return m ? m.uni : ''; });
    pg.psql(`insert into private.posto_eventos (empresa_id, tipo, id_unidade, id_operador, motivo, qtd, minutos_padrao, inicio, fim) values
      ('${pg.EMP}', 'PARADA', '${uniOee}', 'x', 'Quebrou / manutenção', null, null, now() - interval '20 minutes', now() - interval '5 minutes'),
      ('${pg.EMP}', 'USO', '${uniOee}', 'x', null, 40, 60, now() - interval '90 minutes', now() - interval '1 minute'),
      ('${pg.EMP}', 'REFUGO', '${uniOee}', 'x', 'Costura', 4, null, now(), now());`);
    pg.psql(`insert into private.empresa_jornada (empresa_id, entrada, saida, dias) values ('${pg.EMP}', '00:00', '23:59', '{1,2,3,4,5,6,7}') on conflict (empresa_id) do update set entrada = '00:00', saida = '23:59', intervalo_ini = null, intervalo_fim = null, dias = '{1,2,3,4,5,6,7}';`);
    await page.evaluate(() => gutJornada.ler(true));
    const oeeV = await page.evaluate(async (u) => { gutLayout.cor('OEE'); await new Promise(r => setTimeout(r, 1200)); const L = gutLayout.estado(), m = L.atual.dados.itens.find(i => i.uni === u); L.sel = m.id; gutLayout.prop('w', String(m.w).replace('.', ','));
      return { leg: /OEE de hoje/.test(document.getElementById('layPal').innerText), box: (document.querySelector('.lay-oee')?.innerText || '').replace(/\n/g, ' '), tab: !!document.querySelector('.lay-oeet'), pct: [...document.querySelectorAll('.lay-pct')].some(t => /^OEE \d+%$/.test(t.textContent)) }; }, uniOee);
    ok(uniOee && oeeV.leg && /Qualidade 90%/.test(oeeV.box) && /Quebrou \/ manutenção 15 min/.test(oeeV.box) && oeeV.tab && oeeV.pct, 'cor "OEE de hoje": máquina mostra OEE, disponibilidade, desempenho, qualidade (36/40 = 90%) e paradas; tabela no quadro: ' + JSON.stringify(oeeV));
    await page.evaluate(() => gutLayout.cor('OCUPACAO'));
    ok(/não é uma máquina numerada nem uma caixa/.test(bip.msg), 'código desconhecido avisa');
    // análise de fluxo: matriz De-Para × distâncias
    const an = await page.evaluate(() => {
      const L = gutLayout.estado(), d = L.atual.dados;
      const prod = (STATE.cad.produtos || []).find(p => (STATE.cad.roteiro || []).filter(r => String(r.ID_PRODUTO) === String(p.ID_PRODUTO)).length >= 2);
      if (!prod) return { sem: 'produto' };
      const procs = new Map((STATE.cad.processos || []).map(x => [String(x.ID_PROCESSO), x]));
      if (STATE.cad.maquinas.length < 2) STATE.cad.maquinas.push({ ID_MAQUINA: 'MQ-TESTE-2', MAQUINA: 'OVERLOQUE', QTD_TOTAL: 2, ATIVO: true });
      const ms = STATE.cad.maquinas.map(m => String(m.ID_MAQUINA)); (STATE.cad.roteiro || []).filter(r => String(r.ID_PRODUTO) === String(prod.ID_PRODUTO)).sort((a, b) => Number(a.ORDEM_PROCESSO) - Number(b.ORDEM_PROCESSO)).forEach((r, k) => { if (!r.ID_MAQUINA) r.ID_MAQUINA = ms[k % ms.length]; });
      const seq = (STATE.cad.roteiro || []).filter(r => String(r.ID_PRODUTO) === String(prod.ID_PRODUTO)).sort((a, b) => Number(a.ORDEM_PROCESSO) - Number(b.ORDEM_PROCESSO)).map(r => String(r.ID_MAQUINA || (procs.get(String(r.ID_PROCESSO)) || {}).ID_MAQUINA_PADRAO || ''));
      // garante cada tipo do roteiro na planta
      [...new Set(seq.filter(Boolean))].forEach(m => { if (!d.itens.some(i => i.tipo === 'MAQ' && i.maq === m)) gutLayout.adicionar('MAQ', m); });
      gutLayout.an('base', 'PRODUTO'); gutLayout.an('prod', String(prod.ID_PRODUTO)); gutLayout.an('qtd', '50'); gutLayout.an('dist', 'L');
      const r = gutLayout.analise();
      // conferência independente: soma das menores distâncias em L entre tipos consecutivos diferentes
      const c = i => [i.x + i.w / 2, i.y + i.h / 2]; let esp = 0;
      for (let k = 1; k < seq.length; k++) { const a = seq[k - 1], b = seq[k]; if (!a || !b || a === b) continue; let best = Infinity;
        d.itens.filter(i => i.maq === a && i.tipo === 'MAQ').forEach(x => d.itens.filter(i => i.maq === b && i.tipo === 'MAQ').forEach(y => { const p = c(x), q = c(y); best = Math.min(best, Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1])); })); esp += best; }
      return { seq: seq.length, porPeca: Math.round(r.porPeca * 100) / 100, esp: Math.round(esp * 100) / 100, metros: Math.round(r.metros), pecas: r.pecas, kpi: document.querySelector('.lay-kpis .k b')?.textContent, mx: document.querySelectorAll('.lay-mx td b').length, sp: document.querySelectorAll('.lay-sp').length };
    });
    ok(!an.sem && an.seq >= 2 && an.porPeca === an.esp && an.metros === Math.round(an.esp * 50) && an.pecas === 50 && an.mx >= 1 && an.sp >= 1, 'metros por peça = soma das distâncias entre as máquinas do roteiro; matriz e fluxo desenhados: ' + JSON.stringify(an));
    // sugestão de layout: ROC + trocas
    const sg = await page.evaluate(() => {
      const antes = gutLayout.estado().lista.length, orig = gutLayout.estado().atual, origItens = JSON.stringify(orig.dados.itens);
      gutLayout.sugerir(); const L = gutLayout.estado(), d = L.atual.dados, g = gutLayout.estado && document.querySelector('.lay-sug');
      const maqs = d.itens.filter(i => i.tipo === 'MAQ'), esperado = STATE.cad.maquinas.reduce((s, m) => s + Math.max(1, (gutCrachas && 0) || 0, Math.floor(Number(m.QTD_TOTAL) || 0)), 0);
      const sobre = maqs.some((a, i) => maqs.some((b, j) => i < j && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
      const dentro = maqs.every(i => i.x >= 0 && i.y >= 0 && i.x + i.w <= d.largura && i.y + i.h <= d.comprimento);
      const r = gutLayout.analise();
      return { novo: L.lista.length === antes + 1 && L.atual !== orig && /^Planta sugerida/.test(L.atual.nome), n: maqs.length, esperado, sobre, dentro, card: !!g, porPeca: r.porPeca, intacto: JSON.stringify(orig.dados.itens) === origItens, txt: (g && g.innerText || '').slice(0, 160) };
    });
    ok(sg.novo && sg.n >= sg.esperado && !sg.sobre && sg.dentro && sg.card && sg.intacto, 'sugestão cria um ambiente novo com todas as máquinas, sem sobrepor, sem mexer no original: ' + JSON.stringify(sg));
    const melhor = await page.evaluate(() => { const t = document.querySelector('.lay-sug').innerText; const m = t.match(/ROC: ([\d,]+) m\/pç → depois das trocas: ([\d,]+) m\/pç/); return m ? [Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))] : null; });
    ok(melhor && melhor[1] <= melhor[0], 'as trocas nunca pioram o arranjo inicial: ' + JSON.stringify(melhor));
    if (process.env.SHOT) { await page.evaluate(() => gutLayout.zoom(0)); await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOT, 'sugestao.png') }); await page.evaluate(() => document.getElementById('layAn').scrollIntoView()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(process.env.SHOT, 'sugestao-quadro.png') }); }
    await page.evaluate(() => gutLayout.trocar(0)); await page.waitForTimeout(500);
    // assistente: montar a planta pela produção, com corte e expedição e tamanho ideal
    await page.evaluate(() => gutLayout.wizard()); await page.waitForTimeout(300);
    const wz1 = await page.evaluate(() => ({ aberto: document.getElementById('layWiz').classList.contains('show'), ops: document.querySelectorAll('.wz-op').length }));
    ok(wz1.aberto && wz1.ops >= 8, 'assistente "Montar planta" abre com as escolhas (produção, formato, espaço)');
    await page.click('.wz-op:has-text("Calcular o tamanho ideal")'); await page.click('.wz-op:has-text("Automático")');
    await page.click('#wzGo'); await page.waitForTimeout(4500);
    const wz2 = await page.evaluate(() => { const L = gutLayout.estado(), d = L.atual.dados, r = gutLayout.analise();
      const its = d.itens, novo = x => x.tipo === 'MAQ' || x.papel, sobre = its.some((a, i) => its.some((b, j) => i < j && (novo(a) || novo(b)) && a.tipo !== 'AREA' && b.tipo !== 'AREA' && a.tipo !== 'CORREDOR' && b.tipo !== 'CORREDOR' && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
      return { fechou: !document.getElementById('layWiz').classList.contains('show'), nome: L.atual.nome, corte: its.some(i => i.papel === 'CORTE'), exped: its.some(i => i.papel === 'EXPED'), maqs: its.filter(i => i.tipo === 'MAQ').length, sobre, temCorte: r.tipos.includes('@CORTE') && r.tipos.includes('@EXPED'), W: d.largura, H: d.comprimento, card: !!document.querySelector('.lay-sug') }; });
    ok(wz2.fechou && /^Planta sugerida/.test(wz2.nome) && wz2.corte && wz2.exped && !wz2.sobre && wz2.temCorte && wz2.card, 'monta a planta com corte e expedição no fluxo, sem sobrepor: ' + JSON.stringify(wz2));
    if (process.env.SHOT) { await page.evaluate(() => { window.scrollTo(0, 0); gutLayout.zoom(0); }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOT, 'planta-montada.png') }); await page.evaluate(() => gutLayout.wizard()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(process.env.SHOT, 'assistente.png') }); await page.evaluate(() => document.getElementById('layWiz').classList.remove('show')); }
    await page.evaluate(() => gutLayout.trocar(0)); await page.waitForTimeout(500);
    if (process.env.SHOT) { await page.evaluate(() => { document.getElementById('layAn').scrollIntoView(); }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(process.env.SHOT, 'layout-analise.png'), fullPage: false }); await page.evaluate(() => window.scrollTo(0, 0)); }
    if (process.env.SHOT) { await page.evaluate(() => gutLayout.zoom(0)); await page.waitForTimeout(300); await page.screenshot({ path: path.join(process.env.SHOT, 'layout-bipagem.png') }); }
    await page.reload(); await page.waitForTimeout(3500); await page.evaluate(() => showView('layout')); await page.waitForTimeout(2500);
    const vol = await page.evaluate(() => { gutLayout.trocarNome('Salão de costura'); const d = gutLayout.estado().atual.dados; return { n: d.itens.length, c: d.cotas.length, w: d.largura, id: gutLayout.estado().atual.id }; });
    ok(vol.n >= 6 && vol.c === 1 && vol.w === 15 && /^LAY-/.test(vol.id), 'ao reabrir, a planta volta como foi salva: ' + JSON.stringify(vol));
    // Cadastros → Jornada de trabalho
    pg.psql(`delete from private.empresa_jornada;`);
    await page.evaluate(() => openCadTab('jornada')); await page.waitForTimeout(1200);
    const jr0 = await page.evaluate(() => ({ aviso: !!document.querySelector('.jr-aviso'), resumo: document.getElementById('jrResumo')?.innerText || '', dias: document.querySelectorAll('.jr-dia.on').length }));
    ok(jr0.aviso && /9h por dia/.test(jr0.resumo) && /45h por semana/.test(jr0.resumo) && jr0.dias === 5, 'aba Jornada de trabalho abre com o padrão (07–17, 1h de almoço, seg a sex) e o aviso de não salva: ' + JSON.stringify(jr0));
    await page.fill('#jrEntrada', '07:30'); await page.fill('#jrSaida', '17:18'); await page.click('.jr-dia:has-text("Sáb")'); await page.click('.jr-dia:has-text("Sáb")'); await page.click('.jr-dia:has-text("Sex")');
    const jr1 = await page.evaluate(() => document.getElementById('jrResumo').innerText);
    ok(/8h48 por dia/.test(jr1) && /4 dias/.test(jr1) && /35h12 por semana/.test(jr1), 'o resumo acompanha o que se digita: ' + jr1);
    await page.click('.jr-dia:has-text("Sex")'); await page.click('#jrSalvar'); await page.waitForTimeout(2000);
    const jrDb = JSON.parse(pg.psql(`select row_to_json(x) from (select to_char(entrada, 'HH24:MI') e, to_char(saida, 'HH24:MI') s, dias from private.empresa_jornada) x;`));
    const cap = await page.evaluate(() => (STATE.cad.maquinas || []).map(m => Number(m.MINUTOS_DISP_DIA)));
    ok(jrDb.e === '07:30' && jrDb.s === '17:18' && jrDb.dias.join() === '1,2,3,4,5' && cap.length && cap.every(v => v === 528) && !(await page.$('.jr-aviso')), 'salvar grava a jornada no banco e a capacidade das máquinas vira 528 min/dia: ' + JSON.stringify({ jrDb, cap }));
    const plan = await page.evaluate(() => [gutJornada.planejadoAte(new Date(2026, 10, 24, 10, 0)), gutJornada.planejadoAte(new Date(2026, 10, 24, 12, 30)), gutJornada.planejadoAte(new Date(2026, 10, 24, 20, 0)), gutJornada.planejadoAte(new Date(2026, 10, 28, 10, 0))]);
    ok(plan.join() === '150,270,528,0', 'jornada até a hora: 10h = 150 min, 12h30 (almoço) = 270, depois da saída = 528, sábado = 0: ' + plan);
    await page.fill('#jrEntrada', '18:00'); await page.click('#jrSalvar'); await page.waitForTimeout(800);
    ok(/Confira os horários/.test(await page.evaluate(() => document.getElementById('jrResumo').innerText)) && JSON.parse(pg.psql(`select row_to_json(x) from (select to_char(entrada, 'HH24:MI') e from private.empresa_jornada) x;`)).e === '07:30', 'entrada depois da saída avisa e não grava');
    if (process.env.SHOT) { await page.evaluate(() => gutJornada.abrir()); await page.waitForTimeout(800); await page.screenshot({ path: path.join(process.env.SHOT, 'cadastro-jornada.png') }); }
    console.log('erros', errors.slice(0, 5)); console.log(`${pass}/${pass + fail}`); if (fail) process.exitCode = 1;
  } finally { if (browser) await browser.close(); pg.descer(true); }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
