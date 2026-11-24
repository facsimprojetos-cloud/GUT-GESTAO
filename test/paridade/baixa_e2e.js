#!/usr/bin/env node
// v4.23.0 — Facção com serviço parcial, na tela /sistema (Playwright + banco local, tudo pelo servidor):
//  • janela de destino: "Peça pronta" / "Serviço parcial", desmarcar operações, preço proporcional;
//  • quadro interno: saco que passou pela facção, operações da facção concluídas, "Problema da facção";
//  • kanban e romaneio mostram o serviço parcial.
//   node test/paridade/baixa_e2e.js  (SHOT=/dir tira fotos) — Produção interna: baixa completa e visualização em linha
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
      if (u.startsWith('http://app.local/sistema/baixa.js')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'site/sistema/baixa.js'), 'utf8') });
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
    await page.setViewportSize({ width: 1440, height: 900 });
    let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok', m); } else { fail++; console.log('✗', m); } };
    await page.evaluate(() => { window.__GUT_AUTO_CONFIRM = true; });
    await page.evaluate(async () => { showView('dash-interna'); }).catch(() => {});
    await page.evaluate(async () => { STATE.internalBoard = await callServer('getInternalProductionBoard'); renderInternalDashboard(); });
    const vols = await page.evaluate(() => (STATE.internalBoard.rows || []).map(v => ({ id: v.ID_VOLUME, pend: (v.OPERACOES || []).filter(o => String(o.STATUS_CUPOM).toUpperCase() !== 'CONCLUIDO').map(o => o.ID_CUPOM), ops: (v.OPERACOES || []).length })));
    console.log('caixas', JSON.stringify(vols.map(v => [v.id, v.pend.length, v.ops])));
    const comPend = vols.filter(v => v.pend.length >= 1);
    ok(comPend.length >= 2, 'cenário com pelo menos 2 caixas com operação pendente: ' + comPend.length);

    // 1) visualização em linha
    await page.evaluate(() => setBoardView('LINHAS')); await page.waitForTimeout(300);
    const ln = await page.evaluate(() => ({ rows: document.querySelectorAll('.bx-row').length, bars: document.querySelectorAll('.bx-row .progress i').length, nums: document.querySelectorAll('#internalDashboardLots .op-num').length, ativo: document.querySelector('[data-board-view="LINHAS"]').classList.contains('active'), n: internalBoardRows().length, txt: document.querySelector('.bx-row')?.innerText.replace(/\n/g, ' | ') }));
    ok(ln.rows === ln.n && ln.bars === ln.n && ln.nums === 0 && ln.ativo, 'em linha: uma linha por caixa, com barra de progresso e sem os quadradinhos: ' + JSON.stringify(ln));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'linhas.png') });

    // 2) caixa com todos alocados → baixa sem senha, minutos para cada um
    const opId = await page.evaluate(() => activeOperators()[0].ID_OPERADOR), opId2 = await page.evaluate(() => (activeOperators()[1] || activeOperators()[0]).ID_OPERADOR);
    const A = comPend[0];
    await page.evaluate(async ({ a, o1, o2 }) => { const half = Math.ceil(a.pend.length / 2); await callServer('alocarOperadorCupons', { ids: a.pend.slice(0, half), ID_OPERADOR: o1 }); if (a.pend.length > half) await callServer('alocarOperadorCupons', { ids: a.pend.slice(half), ID_OPERADOR: o2 }); STATE.internalBoard = await callServer('getInternalProductionBoard'); renderInternalDashboard(); }, { a: A, o1: opId, o2: opId2 });
    const btnA = await page.evaluate(id => { const r = [...document.querySelectorAll('.bx-row')].find(x => x.innerHTML.includes(`gutBaixa.abrir('${id}')`)); return r ? r.querySelector('.bx-btn').textContent : ''; }, A.id);
    ok(/Baixa completa/.test(btnA) && !/🔒/.test(btnA), 'linha da caixa toda alocada mostra "Baixa completa" sem cadeado: ' + btnA);
    await page.evaluate(id => gutBaixa.abrir(id), A.id); await page.waitForTimeout(400);
    const mA = await page.evaluate(() => ({ open: document.getElementById('baixaModal').classList.contains('open'), t: document.getElementById('bxCorpo').innerText.replace(/\n/g, ' | '), senha: !!document.getElementById('bxSenha') }));
    ok(mA.open && /Todas as operações têm funcionário/.test(mA.t) && !mA.senha, 'janela: resumo por funcionário, sem pedir senha: ' + mA.t.slice(0, 220));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'baixa-alocados.png') });
    await page.click('#bxOk'); await page.waitForTimeout(2500);
    const rA = await page.evaluate(() => document.getElementById('bxCorpo').innerText.replace(/\n/g, ' | '));
    const dbA = JSON.parse(pg.psql(`select json_build_object('pend', (select count(*) from public.cupons_producao where id_volume = '${A.id}' and upper(coalesce(status_cupom,'')) <> 'CONCLUIDO'), 'ops', (select json_agg(distinct id_operador) from public.apontamentos_producao where id_volume = '${A.id}' and origem_bipagem = 'BAIXA_COMPLETA'));`));
    ok(/Baixa feita/.test(rA) && dbA.pend === 0 && dbA.ops && !dbA.ops.includes('EMPRESA') && dbA.ops.every(x => [opId, opId2].includes(x)), 'baixa feita: caixa sem pendência e minutos lançados para os alocados: ' + JSON.stringify(dbA) + ' ' + rA.slice(0, 160));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'baixa-feita.png') });
    await page.evaluate(() => gutBaixa.fechar());
    const pA = await page.evaluate(id => { const v = STATE.internalBoard.rows.find(x => String(x.ID_VOLUME) === String(id)); return v ? Math.round(Number(v.PROGRESSO_PCT)) : -1; }, A.id);
    ok(pA === 100, 'o quadro atualiza e a caixa aparece 100%: ' + pA);

    // 3) caixa sem ninguém → senha do supervisor
    const B = comPend[1];
    pg.psql(`update public.cupons_producao set id_operador_alocado = null where id_cupom in (${B.pend.map(x => `'${x}'`).join(',')});`);
    await page.evaluate(async () => { STATE.internalBoard = await callServer('getInternalProductionBoard'); renderInternalDashboard(); });
    const btnB = await page.evaluate(id => { const r = [...document.querySelectorAll('.bx-row')].find(x => x.innerHTML.includes(`gutBaixa.abrir('${id}')`)); return r ? r.innerText.replace(/\n/g, ' | ') : ''; }, B.id);
    ok(/sem funcionário/.test(btnB) && /🔒/.test(btnB), 'linha da caixa sem funcionário mostra o aviso e o cadeado: ' + btnB);
    await page.evaluate(id => gutBaixa.abrir(id), B.id); await page.waitForTimeout(800);
    const mB = await page.evaluate(() => ({ t: document.getElementById('bxCorpo').innerText.replace(/\n/g, ' | '), nova: !!document.getElementById('bxNova'), dis: document.getElementById('bxOk').disabled }));
    ok(/produção da empresa/.test(mB.t) && mB.nova && mB.dis, 'sem funcionário e sem senha cadastrada: pede para criar a senha do supervisor e trava o botão: ' + mB.t.slice(0, 200));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'baixa-criar-senha.png') });
    await page.fill('#bxNova', '2468'); await page.fill('#bxNova2', '2468'); await page.click('.bx-senha .btn'); await page.waitForTimeout(800);
    ok(await page.$('#bxSenha') !== null, 'senha criada: agora pede a senha do supervisor');
    await page.fill('#bxSenha', '1111'); await page.click('#bxOk'); await page.waitForTimeout(1200);
    const errB = await page.evaluate(() => document.getElementById('bxErro')?.textContent || '');
    ok(/incorreta/.test(errB) && Number(pg.psql(`select count(*) from public.apontamentos_producao where id_volume = '${B.id}' and id_operador = 'EMPRESA';`)) === 0, 'senha errada avisa e não grava: ' + errB);
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'baixa-senha-errada.png') });
    await page.fill('#bxSenha', '2468'); await page.click('#bxOk'); await page.waitForTimeout(2500);
    const rB = await page.evaluate(() => document.getElementById('bxCorpo').innerText.replace(/\n/g, ' | '));
    const nEmp = Number(pg.psql(`select count(*) from public.apontamentos_producao where id_volume = '${B.id}' and id_operador = 'EMPRESA';`));
    ok(/Produção da empresa/.test(rB) && nEmp === B.pend.length, 'com a senha: operações sem funcionário vão para a produção da empresa: ' + nEmp + ' ' + rB.slice(0, 160));
    await page.evaluate(() => gutBaixa.fechar());
    const whoB = await page.evaluate(id => { openProdOps(id); return document.getElementById('internalDashboardLots').innerText; }, B.id);
    ok(/Empresa \(sem funcionário\)/.test(whoB), 'no detalhe da caixa a operação aparece como "Empresa (sem funcionário)"');

    // 4) várias caixas de uma vez (em linha)
    await page.evaluate(() => setBoardView('LINHAS')); await page.waitForTimeout(200);
    // reabre as duas caixas para testar a baixa de várias de uma vez
    pg.psql(`delete from public.apontamentos_producao where origem_bipagem = 'BAIXA_COMPLETA'; update public.cupons_producao set status_cupom = 'PENDENTE', id_apontamento = null, id_operador_bipagem = null, id_operador_alocado = null where id_cupom in (${[...A.pend, ...B.pend].map(x => `'${x}'`).join(',')}); update public.volumes set status_volume = 'EM_PRODUCAO_INTERNA' where id_volume in ('${A.id}', '${B.id}');`);
    await page.evaluate(async () => { STATE.internalBoard = await callServer('getInternalProductionBoard'); renderInternalDashboard(); });
    const resto = comPend.map(v => v.id);
    await page.evaluate(() => gutBaixa.marcarTodas(true)); await page.waitForTimeout(200);
    const sel = await page.evaluate(() => ({ sel: gutBaixa.selecionadas(), bar: document.querySelector('.bx-head')?.innerText.replace(/\n/g, ' | ') }));
    ok(sel.sel.length === resto.length && /Baixa completa \(/.test(sel.bar), '"selecionar todas" marca só as caixas com pendência e mostra o botão: ' + JSON.stringify(sel));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'linhas-selecao.png') });
    await page.evaluate(() => gutBaixa.abrirSelecionadas()); await page.waitForTimeout(800);
    const tit = await page.evaluate(() => document.getElementById('bxTitulo').textContent);
    ok(resto.length === 1 ? /caixa/.test(tit) : new RegExp(resto.length + ' caixas').test(tit), 'a janela junta as caixas selecionadas: ' + tit);
    if (await page.$('#bxSenha')) await page.fill('#bxSenha', '2468');
    await page.click('#bxOk'); await page.waitForTimeout(2500);
    const left = Number(pg.psql(`select count(*) from public.cupons_producao where id_volume in (${resto.map(x => `'${x}'`).join(',') || "''"}) and upper(coalesce(status_cupom,'')) not in ('CONCLUIDO','CANCELADO','ESTORNADO');`));
    ok(left === 0, 'baixa em todas as selecionadas de uma vez: ' + left + ' pendente(s)');
    await page.evaluate(() => gutBaixa.fechar());

    // 5) a escolha "em linha" fica guardada
    await page.reload(); await page.waitForTimeout(3500);
    await page.evaluate(async () => { showView('dash-interna'); STATE.internalBoard = await callServer('getInternalProductionBoard'); renderInternalDashboard(); });
    ok(await page.evaluate(() => boardView() === 'LINHAS' && document.querySelectorAll('.bx-row').length > 0), 'ao reabrir, continua em linha');
    await page.evaluate(() => setBoardView('CAIXAS'));
    ok(await page.evaluate(() => document.querySelectorAll('.prod-mini').length > 0), 'volta para os cards de caixas');
    console.log('erros', errors.slice(0, 5)); console.log(`${pass}/${pass + fail}`); if (fail) process.exitCode = 1;
  } finally { if (browser) await browser.close(); pg.descer(true); }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
