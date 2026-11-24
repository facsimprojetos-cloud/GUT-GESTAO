#!/usr/bin/env node
// App de campo (v4.37): "Minha máquina" — bipar a etiqueta da máquina, "Máquina parou" / "Voltou a funcionar" e "Peça com defeito".
//   node test/paridade/campo_posto_e2e.js   (SHOT=/dir tira fotos)
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pg = require('./pg_base'), { chamarRpc } = require('./rodar');
const ROOT = path.join(__dirname, '..', '..'), E = pg.EMP;
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  let browser;
  await pg.subir();
  try {
    try { pg.psql(fs.readFileSync(path.join(ROOT, 'supabase/migrations/gut_008_app_campo.sql'), 'utf8')); } catch (e) {}
    pg.psql(fs.readFileSync(path.join(ROOT, 'supabase/migrations/gut_028_posto_oee.sql'), 'utf8').split('-- @so-supabase')[1].replace(/^[^\n]*\n/, ''));
    pg.psql(`
      insert into public.cad_maquinas (empresa_id, id_maquina, cod_maquina, maquina, qtd_total, ativo) values ('${E}', 'MQ-R', 'RETA', 'Reta 1 agulha', 2, true) on conflict do nothing;
      insert into private.maquina_unidades (empresa_id, id_unidade, id_maquina, codigo) values ('${E}', 'U1', 'MQ-R', 'RETA-01');
      insert into public.cad_operadores (empresa_id, id_operador, matricula, nome, ativo, acesso_app, modo_app) values ('${E}', 'OP-A', '101', 'Ana Souza', true, true, 'AMBOS');
      insert into private.campo_sessoes (token_hash, empresa_id, tipo, id, expira) values (encode(extensions.digest('tkA', 'sha256'), 'hex'), '${E}', 'OPERADOR', 'OP-A', now() + interval '1 day');`);
    const html = fs.readFileSync(path.join(ROOT, 'site/campo/index.html'), 'utf8');
    const mockSb = `window.supabase={createClient(){return {async rpc(fn,args){const r=await fetch('http://sb.local/rpc/'+fn,{method:'POST',body:JSON.stringify(args)});const j=await r.json();return r.ok?{data:j,error:null}:{data:null,error:{message:j.message}}},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}}}};`;
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async r => {
      const u = r.request().url();
      if (u.startsWith('http://app.local/campo/')) return r.fulfill({ contentType: 'text/html', body: html });
      if (u.includes('supabase-js') || u.includes('supabase.js')) return r.fulfill({ contentType: 'application/javascript', body: mockSb });
      if (u.startsWith('http://sb.local/rpc/')) {
        const fn = u.split('/rpc/')[1], args = JSON.parse(r.request().postData() || '{}');
        try { return r.fulfill({ contentType: 'application/json', body: JSON.stringify(chamarRpc('gut', fn, args)) }); }
        catch (e) { return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: (String(e.message).match(/ERROR:\s+(?:P0001:\s+)?([^\n]+)/) || [, e.message])[1] }) }); }
      }
      return r.fulfill({ status: 204, body: '' });
    });
    await page.addInitScript(() => { localStorage.setItem('gutCampoToken@gut', 'tkA'); localStorage.setItem('gutCampoTipo@gut', 'OPERADOR'); });
    await page.goto('http://app.local/campo/?e=gut'); await page.waitForTimeout(2500);
    const t0 = await page.evaluate(() => document.querySelector('.card.maq')?.innerText || '');
    ok(/Qual máquina você está usando/.test(t0), 'sem máquina: o app pede para bipar a etiqueta da máquina');
    if (process.env.SHOT) { fs.mkdirSync(process.env.SHOT, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOT, 'campo-sem-maquina.png') }); }
    // bipar pelo campo de busca (leitor USB) com o código da etiqueta
    await page.fill('#q', 'GUT-MAQ:RETA-01'); await page.press('#q', 'Enter'); await page.waitForTimeout(1500);
    const t1 = await page.evaluate(() => document.querySelector('.card.maq')?.innerText || '');
    ok(/RETA-01/.test(t1) && /Máquina parou/.test(t1) && /Peça com defeito/.test(t1), 'depois de bipar: mostra RETA-01 com "Máquina parou" e "Peça com defeito"');
    if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'campo-maquina.png') });
    // máquina parou → motivo
    await page.click('text=Máquina parou'); await page.waitForTimeout(400);
    if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'campo-motivo.png') });
    await page.click('.modal .opt:has-text("Falta de material")'); await page.waitForTimeout(1500);
    const t2 = await page.evaluate(() => document.querySelector('.card.maq')?.innerText || '');
    ok(/RETA-01 parada/.test(t2) && /Falta de material/.test(t2) && /Voltou a funcionar/.test(t2), 'parada: cartão vermelho com o motivo e o botão "Voltou a funcionar"');
    if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'campo-parada.png') });
    await page.click('text=Voltou a funcionar'); await page.waitForTimeout(1500);
    const t3 = await page.evaluate(() => document.querySelector('.card.maq')?.innerText || '');
    ok(/Máquina parou/.test(t3) && Number(pg.psql(`select count(*) from private.posto_eventos where tipo = 'PARADA' and fim is not null and motivo = 'Falta de material';`)) === 1, 'voltou a funcionar: a parada fica registrada com início e fim');
    // peça com defeito: + duas vezes = 3
    await page.click('text=Peça com defeito'); await page.waitForTimeout(400);
    await page.click('.modal [data-mais]'); await page.click('.modal [data-mais]');
    if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'campo-defeito.png') });
    await page.click('.modal .opt:has-text("Costura")'); await page.waitForTimeout(1500);
    const t4 = await page.evaluate(() => document.querySelector('.card.maq')?.innerText || '');
    ok(/3 peça\(s\) com defeito hoje/.test(t4) && pg.psql(`select sum(qtd)::int || '|' || max(motivo) from private.posto_eventos where tipo = 'REFUGO';`) === '3|Costura', 'peça com defeito: 3 peças de costura registradas e mostradas no dia');
    // trocar → sair da máquina
    await page.click('.card.maq .lnk'); await page.waitForTimeout(300); await page.click('.modal .opt:has-text("Sair da máquina")'); await page.waitForTimeout(1500);
    ok(/Qual máquina você está usando/.test(await page.evaluate(() => document.querySelector('.card.maq')?.innerText || '')), 'trocar → sair da máquina volta a pedir a etiqueta');
    ok(!errors.length, 'sem erro de JavaScript ' + errors.slice(0, 3).join(' | '));
  } finally {
    if (browser) await browser.close(); pg.descer(true);
    const n = results.filter(Boolean).length; console.log(`${n}/${results.length}`); if (n !== results.length) process.exitCode = 1;
  }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
