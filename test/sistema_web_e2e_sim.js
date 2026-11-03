process.env.HEADERS='headers460.json';process.env.SCHEMA='4.6.0';
const {chromium}=require('playwright');const fs=require('fs');const {makeEnv}=require('./sim');
const E=makeEnv('/home/claude/work/Code.gs');const html=fs.readFileSync('/home/claude/work/index.html','utf8').replace('__GUT_API_URL__','http://api.local/exec');
const results=[];const ok=(c,m)=>{results.push(!!c);console.log((c?'  ✓ ':'  ✗ ')+m)};
// ---- dados
E.insert('CAD_PRODUTOS',[{ID_PRODUTO:'p1',CODIGO_PRODUTO:'C1',PRODUTO:'CAMISA',ATIVO:true}]);E.insert('CAD_CORES',[{ID_COR:'c1',COR:'AZUL',ATIVO:true}]);E.insert('CAD_TAMANHOS',[{ID_TAMANHO:'t1',TAMANHO:'P',ATIVO:true}]);
E.insert('CAD_DESTINOS',[{ID_DESTINO:'d1',TIPO_DESTINO:'FACCAO',NOME_DESTINO:'COSTURA A',ATIVO:true,CAPACIDADE_MIN_DIA:600},{ID_DESTINO:'d2',TIPO_DESTINO:'FACCAO',NOME_DESTINO:'LEIA',ATIVO:true},{ID_DESTINO:'d3',TIPO_DESTINO:'FACCAO',NOME_DESTINO:'MARIA',ATIVO:true,CAPACIDADE_MIN_DIA:480},{ID_DESTINO:'d4',TIPO_DESTINO:'FACCAO',NOME_DESTINO:'ZEZE',ATIVO:true}]);
E.insert('CAD_PROCESSOS',[{ID_PROCESSO:'pr1',PROCESSO:'COSTURA',ORDEM_PADRAO:1,ATIVO:true}]);
E.insert('ROTEIRO_PRODUTO',[{ID_ROTEIRO:'r1',ID_PRODUTO:'p1',ID_PROCESSO:'pr1',ORDEM_PROCESSO:1,TEMPO_PADRAO_SEG_UN:600,ATIVO:true}]);
E.insert('CAD_PRECOS_FACCAO',[{ID_PRECO_FACCAO:'pf1',ID_DESTINO:'d1',ID_PRODUTO:'p1',VALOR_UNITARIO:1.5,ATIVO:true},{ID_PRECO_FACCAO:'pf2',ID_DESTINO:'d2',ID_PRODUTO:'p1',VALOR_UNITARIO:2,ATIVO:true},{ID_PRECO_FACCAO:'pf4',ID_DESTINO:'d4',ID_PRODUTO:'p1',VALOR_UNITARIO:2,ATIVO:true}]);
E.insert('ESTOQUE_CORTE',[{ID_ESTOQUE_CORTE:'e1',ID_CORTE:'K1',LOTE_CORTE:'04-10-2026',VARIACAO_SEQ:1,SUBLOTE:'04-10-2026.1',ID_PRODUTO:'p1',ID_COR:'c1',ID_TAMANHO:'t1',QTD_CORTADA:60,QTD_VOLUMADA:0,SALDO_DISPONIVEL:60,DATA_GERACAO:new Date()}]);
E.call('criarVolumesLoteImpl_',{itens:[{ID_ESTOQUE_CORTE:'e1',QTD:10},{ID_ESTOQUE_CORTE:'e1',QTD:10},{ID_ESTOQUE_CORTE:'e1',QTD:10},{ID_ESTOQUE_CORTE:'e1',QTD:10},{ID_ESTOQUE_CORTE:'e1',QTD:10}]});
const [v1,v2,v3,v4,v5]=E.rows('VOLUMES').map(v=>v.ID_VOLUME);
E.call('criarRemessaExternaImpl_',{volumeIds:[v1,v2],ID_DESTINO:'d1',PREVISAO_RETORNO:'2099-12-20'});const R1=E.rows('REMESSAS')[0].ID_REMESSA;E.call('confirmarEnvioRemessaManualImpl_',R1,[]);
E.call('criarRemessaExternaImpl_',{volumeIds:[v3],ID_DESTINO:'d2',PREVISAO_RETORNO:'2099-12-20'});const R2=E.rows('REMESSAS')[1].ID_REMESSA;
E.call('criarRemessaExternaImpl_',{volumeIds:[v4],ID_DESTINO:'d4',PREVISAO_RETORNO:'2026-10-01'});const R3=E.rows('REMESSAS')[2].ID_REMESSA;E.call('confirmarEnvioRemessaManualImpl_',R3,[]);

global.__WEB_TOKENS={'tok-ok':{id:'u1',email:'carla@gut.com'},'tok-fora':{id:'u2',email:'fora@x.com',ok:false}};
const mockSb=`window.supabase={createClient(){let s=null;try{s=JSON.parse(localStorage.getItem('mk')||'null')}catch(e){}
 return {auth:{async getSession(){return {data:{session:s}}},async signInWithPassword({email,password}){if(password!=='senha123')return {error:{message:'Invalid login credentials'}};s={access_token:email.startsWith('fora')?'tok-fora':'tok-ok'};localStorage.setItem('mk',JSON.stringify(s));return {error:null}},
  async signOut(){s=null;localStorage.removeItem('mk')},async resetPasswordForEmail(){return {error:null}}}}}};`;
(async()=>{
  const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1366,height:860}});
  await context.addInitScript(()=>{window.print=()=>{}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const CALLS=[];
  await page.route('**/*',async r=>{const u=r.request().url();
    if(u.startsWith('http://app.local/'))return r.fulfill({contentType:'text/html',body:html});
    if(u.startsWith('http://api.local/exec')){const b=JSON.parse(r.request().postData()||'{}');CALLS.push(b.action);let out;try{out=JSON.parse(JSON.stringify(E.ctx.apiWeb(b.action,b.args,b.meta,b.token)))}catch(e){out={__error:true,message:String(e.message||e)}}
      return r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(out)})}
    if(u.includes('supabase-js'))return r.fulfill({contentType:'application/javascript',body:mockSb});
    if(u.includes('chart.js'))return r.fulfill({contentType:'application/javascript',body:'window.Chart=function(){this.destroy=function(){};this.update=function(){}};Chart.defaults={plugins:{legend:{}}};'});
    if(u.includes('qrcode'))return r.fulfill({contentType:'application/javascript',body:'window.QRCode=function(){};QRCode.CorrectLevel={M:0};'});
    return r.fulfill({body:''})});
  await page.goto('http://app.local/');await page.waitForTimeout(800);
  ok(await page.locator('#gutWebLogin').isVisible(),'fora do Google abre a tela de login do GUT PPCP');
  ok(CALLS.length===0,'nada do sistema carrega antes do login');
  await page.fill('#gwEm','carla@gut.com');await page.fill('#gwPw','errada');await page.click('#gwGo');await page.waitForTimeout(300);
  ok(/incorretos/.test(await page.textContent('#gwErr')),'senha errada avisa');
  await page.fill('#gwPw','senha123');await page.click('#gwGo');await page.waitForTimeout(2500);
  ok(!(await page.locator('#gutWebLogin').isVisible())&&CALLS.includes('getBootstrapData'),'login certo abre o sistema e carrega os dados pela GUT API ('+[...new Set(CALLS)].join(',')+')');
  await page.click('#nav button[data-view="dash-faccoes"]');await page.waitForTimeout(1200);
  ok(/RE-000001/.test(await page.textContent('#externalStatusBoard')),'Kanban de facções carrega pelo modo web');
  ok(await page.locator('#gwSair').count()===1,'botão Sair aparece no topo');
  // gravação: confirmar envio de uma remessa registra o e-mail do usuário web
  const antes=E.rows('AUDITORIA').length;
  await page.evaluate(id=>callServer('confirmarEnvioRemessaManual',id,[]),R2).catch(()=>{});await page.waitForTimeout(800);
  const aud=E.rows('AUDITORIA').slice(antes);ok(aud.length>0&&aud.every(a=>a.ID_USUARIO==='carla@gut.com'),'gravações registram o e-mail de quem entrou ('+(aud[0]||{}).ID_USUARIO+')');
  await page.screenshot({path:'/tmp/claude-0/web_fac.png'});
  // sessão inválida -> volta o login
  await page.evaluate(()=>localStorage.setItem('mk',JSON.stringify({access_token:'tok-vencido'})));
  await page.reload();await page.waitForTimeout(1500);
  ok(await page.locator('#gutWebLogin').isVisible()&&/expirou/.test(await page.textContent('#gwErr')),'token vencido mostra o login com aviso de sessão expirada');
  // usuário sem acesso à empresa
  await page.fill('#gwEm','fora@x.com');await page.fill('#gwPw','senha123');await page.click('#gwGo');await page.waitForTimeout(1500);
  ok(/não tem acesso/.test(await page.textContent('#gwErr')),'usuário sem acesso à empresa é barrado');
  ok(errors.length===0,'sem erro JS '+errors.join('|'));
  await browser.close();const f=results.filter(x=>!x).length;console.log(`\n${results.length-f}/${results.length}`);process.exit(f?1:0);
})();
