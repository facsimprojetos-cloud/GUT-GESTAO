#!/usr/bin/env node
// v4.23.0 — Facção com serviço parcial, na tela /sistema (Playwright + banco local, tudo pelo servidor):
//  • janela de destino: "Peça pronta" / "Serviço parcial", desmarcar operações, preço proporcional;
//  • quadro interno: saco que passou pela facção, operações da facção concluídas, "Problema da facção";
//  • kanban e romaneio mostram o serviço parcial.
//   OUT=/tmp/vis node test/paridade/visual_shots.js (fotos das telas para revisão visual)
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
    const OUT = process.env.OUT || '/tmp/vis'; fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const vistas = (process.env.VISTAS || 'dashboard,dash-faccoes,dash-interna,producao,estoque,cadastros,financeiro-faccoes').split(',');
    for (const tema of (process.env.TEMAS || 'light,dark').split(',')) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t === 'dark' ? 'dark' : ''; if (t !== 'dark') delete document.documentElement.dataset.theme; }, tema);
      for (const v of vistas) {
        const b = await page.$(`#nav button[data-view="${v}"]`); if (!b) { console.log('sem vista', v); continue; }
        await b.click(); await page.waitForTimeout(1800);
        await page.screenshot({ path: path.join(OUT, `${tema}-${v}.png`) });
      }
    }
    if (process.env.TV !== '0') for (const n of [1, 2, 3]) { await page.evaluate(n => gutTvAbrir(n), n); await page.waitForTimeout(2500); await page.screenshot({ path: path.join(OUT, `tv${n}.png`) }); await page.keyboard.press('Escape'); await page.evaluate(() => { try { gutTvFechar && gutTvFechar(); } catch (e) {} }); await page.waitForTimeout(500); }
    console.log('erros', errors.slice(0, 5));
  } finally { if (browser) await browser.close(); pg.descer(true); }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
