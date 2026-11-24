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
      if (u.startsWith('http://app.local/sistema/layout.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/layout.js'), 'utf8') });
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
    await page.reload(); await page.waitForTimeout(3500); await page.evaluate(() => showView('layout')); await page.waitForTimeout(2500);
    const vol = await page.evaluate(() => { const d = gutLayout.estado().atual.dados; return { n: d.itens.length, c: d.cotas.length, w: d.largura, id: gutLayout.estado().atual.id }; });
    ok(vol.n >= 5 && vol.c === 1 && vol.w === 15 && /^LAY-/.test(vol.id), 'ao reabrir, a planta volta como foi salva: ' + JSON.stringify(vol));
    console.log('erros', errors.slice(0, 5)); console.log(`${pass}/${pass + fail}`); if (fail) process.exitCode = 1;
  } finally { if (browser) await browser.close(); pg.descer(true); }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
