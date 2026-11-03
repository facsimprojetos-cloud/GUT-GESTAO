const {chromium}=require('playwright');const fs=require('fs');
const html=fs.readFileSync(''+__dirname+'/../site/index.html','utf8'),mock=fs.readFileSync(''+__dirname+'/mock_supabase.js','utf8');
const res=[];const ok=(c,m)=>{res.push(!!c);console.log((c?'  ✓ ':'  ✗ ')+m)};
(async()=>{
  const b=await chromium.launch();
  for(const [W,H,tag] of [[1366,860,'desk'],[390,844,'cel']]){
  const ctx=await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:tag==='cel'?2:1});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>{const u=r.request().url();if(u.startsWith('http://gestao.local/'))return r.fulfill({contentType:'text/html',body:html});if(u.includes('supabase-js'))return r.fulfill({contentType:'application/javascript',body:mock});return r.fulfill({body:''})});
  await page.goto('http://gestao.local/');await page.waitForTimeout(300);
  if(tag==='desk'){
  await page.fill('#em','adm@gut.com');await page.fill('#pw','errada');await page.click('#go');await page.waitForTimeout(200);
  ok(/incorretos/.test(await page.textContent('#lgErr')),'senha errada avisa');
  await page.screenshot({path:'/tmp/claude-0/g_login.png'});
  await page.fill('#pw','senha1234');await page.click('#go');await page.waitForTimeout(400);
  const t=await page.textContent('#app');ok(/Empresas/.test(t)&&/GUT Confecções/.test(t)&&/Bela Moda/.test(t),'admin entra e vê todas as empresas');
  await page.screenshot({path:'/tmp/claude-0/g_empresas.png'});
  await page.click('button:has-text("+ Nova empresa")');await page.fill('#eNome','Confecção Nova');await page.click('#eSv');await page.waitForTimeout(400);
  ok(/Confecção Nova/.test(await page.textContent('#main')),'cadastra nova empresa');
  await page.selectOption('#empSel','e1');await page.waitForTimeout(100);
  await page.click('.tabs button:has-text("Equipe")');await page.waitForTimeout(300);
  await page.click('button:has-text("+ Convidar pessoa")');await page.fill('#uNome','Carla Supervisora');await page.fill('#uMail','carla@gut.com');await page.selectOption('#uPap','SUPERVISOR');await page.waitForTimeout(100);
  const pre=await page.$$eval('.perm .seg',s=>s.map(x=>x.dataset.mod+':'+x.querySelector('.on').dataset.v).join(','));ok(/custos:nenhum/.test(pre)&&/producao:editar/.test(pre),'papel Supervisor já preenche as permissões ('+pre+')');
  await page.click('.perm .seg[data-mod="custos"] button[data-v="ver"]');
  await page.screenshot({path:'/tmp/claude-0/g_convite.png'});
  await page.click('#uSv');await page.waitForTimeout(400);
  ok(/Link gerado/.test(await page.textContent('#uShare'))&&await page.locator('#uShare a:has-text("WhatsApp")').count()===1,'convite gera o link com botão de WhatsApp');
  const saved=await page.evaluate(()=>window.__DB.membros.find(m=>m.email==='carla@gut.com'));ok(saved&&saved.papel==='SUPERVISOR'&&saved.permissoes.custos==='ver','permissões ajustadas foram enviadas (custos: ver)');
  await page.screenshot({path:'/tmp/claude-0/g_convite_link.png'});
  await page.click('.modal .x');await page.waitForTimeout(200);
  ok(/Carla Supervisora/.test(await page.textContent('#main'))&&/Convite pendente/.test(await page.textContent('#main')),'equipe lista a pessoa como convite pendente');
  await page.screenshot({path:'/tmp/claude-0/g_equipe.png'});
  await page.click('.tabs button:has-text("App de campo")');await page.waitForTimeout(300);
  ok(/MARIA/.test(await page.textContent('#main'))&&/Liberado/.test(await page.textContent('#main'))&&/Sem senha/.test(await page.textContent('#main')),'campo lista operadores com situação do acesso');
  await page.screenshot({path:'/tmp/claude-0/g_campo.png'});
  await page.locator('tr:has-text("JOANA") button:has-text("Editar")').click();await page.waitForTimeout(150);
  await page.fill('#cLg','t010');await page.click('#cSv');await page.waitForTimeout(200);
  ok(/Crie uma senha/.test(await page.textContent('#cErr')),'liberar sem senha pede a senha');
  await page.click('#cGen');await page.fill('#cTel','11977776666');await page.selectOption('#cModo','APONTADOR');await page.click('#cSv');await page.waitForTimeout(400);
  const sh=await page.textContent('#cShare');ok(/JOANA/.test(sh)&&/T010/.test(sh)&&/Senha: \d{6}/.test(sh)&&/script.google.com/.test(sh),'salvar com senha mostra a mensagem pronta (link + matrícula + senha)');
  const wa=await page.getAttribute('#cShare a','href');ok(/wa\.me\/5511977776666/.test(wa),'WhatsApp vai para o telefone do operador');
  await page.screenshot({path:'/tmp/claude-0/g_campo_senha.png'});
  await page.click('.modal .x');await page.waitForTimeout(200);
  await page.click('.seg button:has-text("Facções")');await page.waitForTimeout(200);ok(/COSTURA A/.test(await page.textContent('#main')),'aba facções');
  await page.click('.top .tb:has-text("Trocar")');await page.fill('#t1','NovaSenha1');await page.fill('#t2','NovaSenha2');await page.click('#tSv');await page.waitForTimeout(150);
  ok(/não são iguais/.test(await page.textContent('#tErr')),'trocar senha confere a repetição');
  await page.fill('#t2','NovaSenha1');await page.click('#tSv');await page.waitForTimeout(250);ok(await page.locator('#t1').count()===0,'trocar senha salva e fecha');
  await page.click('.top .tb:has-text("Sair")');await page.waitForTimeout(300);
  await page.fill('#em','dono@bela.com');await page.fill('#pw','senha1234');await page.click('#go');await page.waitForTimeout(400);
  const t2=await page.textContent('#app');ok(!/🏢 Empresas/.test(t2)&&/Bela Moda/.test(t2)&&/Equipe do escritório/.test(t2)&&!/GUT Confecções/.test(t2),'dono de outra empresa vê só a dele, sem aba Empresas');
  await page.locator('tr:has-text("Dona Bela") button:has-text("Editar")').click();await page.selectOption('#uPap','OPERADOR');await page.click('#uSv');await page.waitForTimeout(300);
  ok(/não pode tirar/.test(await page.textContent('#uErr')),'dono não consegue tirar o próprio acesso de dono');
  ok(errs.length===0,'sem erro JS '+errs.join('|'));
  } else {
    await page.fill('#em','adm@gut.com');await page.fill('#pw','senha1234');await page.click('#go');await page.waitForTimeout(400);
    await page.screenshot({path:'/tmp/claude-0/g_cel_emp.png'});
    await page.selectOption('#empSel','e1');await page.click('.tabs button:has-text("App de campo")');await page.waitForTimeout(300);
    await page.screenshot({path:'/tmp/claude-0/g_cel_campo.png'});
    const sw=await page.evaluate(()=>document.documentElement.scrollWidth);ok(sw<=392,'celular sem rolagem para o lado ('+sw+')');
    ok(errs.length===0,'celular sem erro JS '+errs.join('|'));
  }
  await ctx.close();}
  await b.close();const f=res.filter(x=>!x).length;console.log(`\n${res.length-f}/${res.length}`);process.exit(f?1:0);
})();
