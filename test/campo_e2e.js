const {chromium}=require('playwright');const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../site/campo/index.html','utf8'),mock=fs.readFileSync(__dirname+'/mock_campo.js','utf8');
const res=[];const ok=(c,m)=>{res.push(!!c);console.log((c?'  ✓ ':'  ✗ ')+m)};
(async()=>{
  const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/*',r=>{const u=r.request().url();if(u.startsWith('http://campo.local/'))return r.fulfill({contentType:'text/html',body:html});if(u.includes('supabase-js'))return r.fulfill({contentType:'application/javascript',body:mock});return r.fulfill({body:''})});
  await page.goto('http://campo.local/campo/');await page.waitForTimeout(300);
  ok(/Link incompleto/.test(await page.textContent('#app')),'link sem a empresa avisa "Link incompleto"');
  await page.goto('http://campo.local/campo/naoexiste');await page.waitForTimeout(400);
  ok(/Empresa não encontrada/.test(await page.textContent('#app')),'empresa inexistente avisa');
  await page.goto('http://campo.local/campo/gut');await page.waitForTimeout(400);
  ok(/GUT Confecções/.test(await page.textContent('#app')),'tela de login mostra o nome da empresa');
  await page.fill('#lg','t002');await page.fill('#pw','errada');await page.click('#go');await page.waitForTimeout(200);
  ok(/incorretos/.test(await page.textContent('#lgErr')),'senha errada avisa');
  await page.fill('#pw','1234');await page.click('#go');await page.waitForTimeout(400);
  ok(/CARLOS/.test(await page.textContent('#app'))&&/Fechar lateral/.test(await page.textContent('#app')),'entra e vê as operações dele');
  ok((await page.evaluate(()=>window.__DB.channels)).includes('campo-e1'),'liga a atualização ao vivo da empresa');
  await page.evaluate(()=>window.__DB.calls.length=0);
  await page.locator('.card button:has-text("▶ Iniciar")').first().click();await page.waitForTimeout(400);
  ok(await page.locator('.running').count()===1,'iniciar mostra o cronômetro');
  ok(JSON.stringify(await page.evaluate(()=>window.__DB.calls))==='["campo_op_iniciar"]','iniciar faz UMA chamada só ao banco');
  await page.click('.running button:has-text("Pausar")');await page.waitForTimeout(300);ok(await page.locator('.card.paused').count()===1,'pausar');
  await page.click('.card.paused button:has-text("Retomar")');await page.waitForTimeout(300);ok(await page.locator('.running').count()===1,'retomar');
  await page.click('.running .btn.stop');await page.waitForTimeout(150);await page.click('.modal [data-r="1"]');await page.waitForTimeout(400);
  ok(await page.locator('.running').count()===0&&/1 operações/.test(await page.textContent('.prog')),'finalizar conclui e soma no painel do dia');
  ok(await page.locator('.card.lider').count()===1,'líder vê pausar/retomar todos');
  await page.screenshot({path:'/tmp/claude-0/campo5_op.png'});
  // sessão expirada
  await page.evaluate(()=>{window.__DB.sessoes={};localStorage.setItem('__mock_sess','{}')});await page.click('.top button[title="Atualizar"]');await page.waitForTimeout(400);
  ok(/sessão expirou/i.test(await page.textContent('#app')),'sessão expirada volta para o login com aviso');
  // facção
  await page.click('#tFac');await page.fill('#lg','leia');await page.fill('#pw','abcd');await page.click('#go');await page.waitForTimeout(400);
  ok(/RE-000018/.test(await page.textContent('#app')),'facção entra e vê a remessa');
  await page.click('button:has-text("▶ Iniciei esta remessa")');await page.click('.modal [data-r="1"]');await page.waitForTimeout(400);
  ok(/Em produção/.test(await page.textContent('#app')),'aviso "Iniciei" atualiza a tela');
  await page.locator('.fbtn').first().click();await page.waitForTimeout(400);
  ok(/MALHA PIQUET/.test(await page.textContent('#fview'))&&!/R\$/.test(await page.textContent('#fview')),'ficha técnica abre (sem custos)');
  await page.screenshot({path:'/tmp/claude-0/campo5_ficha.png'});
  await page.click('#fview button:has-text("Voltar")');
  // reabrir: mostra na hora com cache
  await page.reload();await page.waitForTimeout(80);ok(/RE-000018/.test(await page.textContent('#app')),'ao reabrir, mostra a última tela na hora');
  // empresas diferentes não misturam o login guardado no aparelho
  await page.goto('http://campo.local/campo/outra');await page.waitForTimeout(300);ok(!/RE-000018/.test(await page.textContent('#app')),'outro link de empresa não usa o login guardado da GUT');
  ok(errs.length===0,'sem erro JS '+errs.join('|'));
  await b.close();const f=res.filter(x=>!x).length;console.log(`\n${res.length-f}/${res.length}`);process.exit(f?1:0);
})();
