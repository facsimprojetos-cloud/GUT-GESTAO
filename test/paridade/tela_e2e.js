#!/usr/bin/env node
// Teste da tela /sistema no navegador (Playwright) com o banco local:
//  • as leituras (abrir o sistema, telas) saem do banco pelo motor, sem passar pela GUT API;
//  • as gravações também vão direto ao banco (web_aplicar), sem a GUT API, e a leitura seguinte já vê o dado novo;
//  • fotos vão para o Storage;
//  • se o banco falhar, a mesma leitura volta para a GUT API sozinha.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pg = require('./pg_base'), criarGas = require('./gas_sim'), { cenario, executorA, chamarRpc } = require('./rodar');
const { criarRelogio } = require('./relogio');
const ROOT = path.join(__dirname, '..', '..');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  await pg.subir();
  let browser;
  try {
    const gas = criarGas(pg); await cenario(executorA(gas, criarRelogio(Date.now() - 3600000), []));
    const html = fs.readFileSync(path.join(ROOT, 'site/sistema/index.html'), 'utf8');
    const motorJs = fs.readFileSync(path.join(ROOT, 'site/sistema/gut-motor.js'), 'utf8');
    const API = [], RPC = []; let bancoFora = false;
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
    await page.goto('http://app.local/sistema/'); await page.waitForTimeout(3500);
    ok(RPC.includes('web_ler') && !API.includes('getBootstrapData') && !API.includes('getOperationalData'), 'abrir o sistema lê do banco, sem a GUT API (API: ' + ([...new Set(API)].join(',') || 'nada') + ')');
    const st = await page.evaluate(() => ({ vol: (STATE.volumes || []).length, rem: (STATE.remessas || []).length, prod: (STATE.cad?.produtos || []).length, mat: (STATE.estoqueMateriais || []).length }));
    ok(st.vol >= 6 && st.rem >= 2 && st.prod === 2 && st.mat >= 1, 'dados carregados na tela: ' + JSON.stringify(st));
    await page.click('#nav button[data-view="volumes"]'); await page.waitForTimeout(800);
    ok(/-V0?1/.test(await page.textContent('#view-volumes').catch(() => '') || await page.textContent('body')), 'tela de volumes mostra os volumes');
    API.length = 0;
    await page.click('#nav button[data-view="financeiro"]'); await page.waitForTimeout(1200);
    ok(!API.includes('getFinanceiroFaccao') && /COSTURA DA ANA/.test(await page.textContent('body')), 'financeiro das facções vem do banco');
    // gravação direto no banco e leitura nova já com o dado
    API.length = 0;
    await page.evaluate(() => callServer('salvarCadastro', 'cor', { COR: 'VERDE MUSGO' }));
    const cad = await page.evaluate(() => callServer('getCadastros'));
    ok(!API.length && RPC.includes('web_aplicar') && (cad.cores || []).some(c => c.COR === 'VERDE MUSGO') && pg.psql(`select count(*) from cad_cores where cor = 'VERDE MUSGO'`) === '1', 'gravação vai direto ao banco (sem GUT API) e a leitura seguinte já vê a cor nova');
    // a gravação repetida (mesmo requestId) não duplica
    const rep = await page.evaluate(async () => { const id = 'reqteste000000000001'; const a = await serverApi('salvarCadastro', ['cor', { COR: 'LILAS' }], { requestId: id }); const b = await serverApi('salvarCadastro', ['cor', { COR: 'LILAS' }], { requestId: id }); return [!!a.ok, !!b.__replayed]; });
    ok(rep[0] && rep[1] && pg.psql(`select count(*) from cad_cores where cor = 'LILAS'`) === '1', 'mesmo pedido duas vezes grava uma vez só');
    // erro de regra chega na tela como na GUT API
    const erroRegra = await page.evaluate(() => callServer('registrarCompra', { itens: [] }).then(() => '', e => e.message));
    ok(/pelo menos um item/.test(erroRegra), 'erro de regra aparece na tela: ' + erroRegra);
    // fotos no Storage
    const foto = await page.evaluate(async () => {
      const id = STATE.cad.produtos[0].ID_PRODUTO, png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const r = await callServer('salvarFotoProduto', { ID_PRODUTO: id, LADO: 'FRENTE', BASE64: png, MIME: 'image/png' });
      STATE.cad = r.cadastros; STATE.fotoCache = {};
      const g = await callServer('getFotosProduto', id);
      return { id: r.FILE_ID, ok: g.fotos.FRENTE === png };
    });
    ok(/^sb:4eb0139a-[^/]+\/[^/]+\/frente-\d+\.png$/.test(foto.id) && foto.ok && !API.length && /^sb:/.test(pg.psql(`select foto_frente from cad_produtos where foto_frente <> '' limit 1`)), 'foto vai para o Storage e volta igual: ' + foto.id);
    // banco fora → volta para a GUT API
    bancoFora = true; API.length = 0;
    const d = await page.evaluate(() => callServer('getDashboard', { DATA_INICIAL: localDateKey(), DATA_FINAL: localDateKey() }));
    ok(API.includes('getDashboard') && d && d.cards, 'se o banco falha antes de começar, a leitura volta para a GUT API sozinha');
    bancoFora = false;
    const par = await page.evaluate(() => gutParidade([['getVolumes', []], ['getFinanceiroFaccao', []], ['getInitialData', [localDateKey()]]]));
    ok(par.every(x => x.igual === 'sim'), 'gutParidade() no navegador: ' + par.map(x => x.ação + '=' + x.igual).join(', '));
    ok(errors.length === 0, 'sem erro de JavaScript ' + errors.join(' | '));
    const motorFalhou = avisos.filter(a => /Leitura direta do banco falhou/.test(a) && !/banco fora do ar/.test(a));
    ok(motorFalhou.length === 0, 'nenhuma leitura precisou voltar para a GUT API (fora o teste do banco fora) ' + motorFalhou.join(' | ').slice(0, 400));
  } finally { if (browser) await browser.close(); pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
