#!/usr/bin/env node
// Teste da tela /sistema no navegador (Playwright) com o banco local:
//  • tudo (leituras e gravações) passa pelo servidor (Edge Function "gut"), nada pelo Google;
//  • a leitura seguinte já vê o dado novo; o navegador não grava direto;
//  • fotos vão para o Storage;
//  • se o servidor não responder, a leitura usa o motor do navegador (plano B); a gravação não.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pg = require('./pg_base'), criarGas = require('./gas_sim'), { cenario, executorA, chamarRpc, carregarServidor } = require('./rodar');
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
    const API = [], RPC = [], FN = []; let bancoFora = false, servidorFora = false;
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
    await page.goto('http://app.local/sistema/'); await page.waitForTimeout(3500);
    ok(FN.includes('getBootstrapData') && !RPC.includes('web_ler') && !API.length, 'abrir o sistema passa pelo servidor (Edge Function), sem o Google e sem ler tabelas no navegador: ' + [...new Set(FN)].join(','));
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
    ok(!API.length && FN.includes('salvarCadastro') && !RPC.includes('web_aplicar') && (cad.cores || []).some(c => c.COR === 'VERDE MUSGO') && pg.psql(`select count(*) from cad_cores where cor = 'VERDE MUSGO'`) === '1', 'gravação passa pelo servidor e a leitura seguinte já vê a cor nova');
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
    // servidor fora do ar: leitura usa o motor do navegador (plano B); gravação não grava pelo navegador
    servidorFora = true; RPC.length = 0;
    const lidoB = await page.evaluate(() => callServer('getCadastros').then(r => (r.cores || []).length, e => 'ERRO ' + e.message));
    ok(typeof lidoB === 'number' && lidoB > 0 && RPC.includes('web_ler'), 'servidor fora: a leitura sai pelo plano B do navegador (' + lidoB + ' cores)');
    const gravaB = await page.evaluate(() => serverApi('salvarCadastro', ['cor', { COR: 'SEM SERVIDOR' }], { requestId: 'reqteste000000000099' }).then(r => JSON.stringify(r), e => 'ERRO ' + e.message));
    ok(/^ERRO/.test(gravaB) && pg.psql(`select count(*) from cad_cores where cor = 'SEM SERVIDOR'`) === '0', 'servidor fora: a gravação não acontece pelo navegador (a tela guarda e tenta de novo)');
    servidorFora = false;
    // sessão inválida: o servidor recusa e a tela pede login
    const exp = await page.evaluate(async () => { const o = GUT_SB.auth.getSession; GUT_SB.auth.getSession = async () => ({ data: { session: { access_token: 'vencido', user: {} } } }); const r = await serverApi('getCadastros', [], {}); GUT_SB.auth.getSession = o; return { r, login: !!document.getElementById('gutWebLogin') }; });
    ok(exp.r.__error && exp.login, 'token vencido: a tela mostra o login de novo');
    await page.evaluate(() => { const l = document.getElementById('gutWebLogin'); if (l) l.remove(); });
    const semIA = await page.evaluate(() => { $('commandInput').value = 'qualquer coisa estranha'; return processCommand().then(() => true); });
    ok(semIA && !API.length && !RPC.some(f => /comando/i.test(f)), 'caixa de comando só navega (comando por IA retirado)');
    ok(!/script\.google\.com/.test(html), 'a tela não tem mais o endereço da GUT API');
    pg.psql('select backup.fazer();');
    const bk = await page.evaluate(async () => { if (!$('cadForms')) { const d = document.createElement('div'); d.id = 'cadForms'; document.body.appendChild(d); } custosRender(); const tem = !!$('gutBackupBox'); let nome = ''; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { nome = this.download; }; await gutBaixarBackup(); HTMLAnchorElement.prototype.click = o; return { tem, nome }; });
    ok(bk.tem && /^gut-ppcp-copia-\d{4}-\d{2}-\d{2}\.json$/.test(bk.nome), 'botão de cópia de segurança aparece e baixa o arquivo: ' + bk.nome);
    // ---- várias empresas (v4.20.0) ----
    ok(/\/sistema\/gut$/.test(new URL(page.url()).pathname), 'o endereço mostra a empresa: ' + new URL(page.url()).pathname);
    ok(/GUT Confecções/.test(await page.textContent('#gwEmpresa').catch(() => '')), 'o nome da empresa aparece no topo');
    const EMP2 = '22222222-0000-4000-8000-000000000002';
    pg.psql(`insert into public.empresas (id, nome, slug, status) values ('${EMP2}', 'Malharia Dois', 'dois', 'ATIVA');
      insert into public.app_controle (empresa_id, versao_schema, revisao) values ('${EMP2}', '4.6.0', 'r0');
      insert into public.usuarios_empresa (user_id, empresa_id, papel, nome, email) values ('${pg.USER}', '${EMP2}', 'DONO', 'Carla', 'carla@gut.com');`);
    await page.evaluate(() => localStorage.removeItem('gut-empresa'));
    await page.goto('http://app.local/sistema/'); await page.waitForTimeout(1500);
    const escolha = await page.evaluate(() => { const o = document.getElementById('gutEscolha'); return o && o.style.display !== 'none' ? [...o.querySelectorAll('a')].map(a => a.textContent + '|' + a.getAttribute('href')) : null; });
    ok(escolha && escolha.length === 2 && escolha.some(x => /Malharia Dois.*\/sistema\/dois$/.test(x)), 'com duas empresas e sem empresa no endereço: aparece a lista para escolher ' + JSON.stringify(escolha));
    await page.goto('http://app.local/sistema/?e=dois'); await page.waitForTimeout(2500);
    const naDois = await page.evaluate(() => ({ slug: GUT_EMPRESA_SLUG, url: location.pathname, cores: (STATE.cad?.cores || []).length, prod: (STATE.cad?.produtos || []).length }));
    ok(naDois.slug === 'dois' && /\/sistema\/dois$/.test(naDois.url) && naDois.prod === 0 && naDois.cores === 0, 'na empresa 2 a tela só tem os dados dela: ' + JSON.stringify(naDois));
    await page.evaluate(() => callServer('salvarCadastro', 'cor', { COR: 'COR DA DOIS' }));
    ok(pg.psql(`select count(*) from cad_cores where cor = 'COR DA DOIS' and empresa_id = '${EMP2}'`) === '1' && pg.psql(`select count(*) from cad_cores where cor = 'COR DA DOIS' and empresa_id = '${pg.EMP}'`) === '0', 'gravação na empresa 2 fica só na empresa 2');
    await page.goto('http://app.local/sistema/'); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => GUT_EMPRESA_SLUG) === 'dois', 'sem empresa no endereço, volta para a última usada');
    await page.goto('http://app.local/sistema/?e=nao-existe'); await page.waitForTimeout(1200);
    ok(/não tem acesso à empresa "nao-existe"/.test(await page.textContent('#gutEscolha').catch(() => '')), 'empresa que o usuário não tem: aviso e a lista das dele');
    pg.psql(`update public.empresas set status = 'SUSPENSA' where id = '${EMP2}';`);
    await page.goto('http://app.local/sistema/dois'); await page.waitForTimeout(1200);
    const susp = await page.evaluate(() => ({ txt: (document.getElementById('gutEscolha') || {}).textContent || '', entrou: GUT_STARTED }));
    ok(/suspensa/.test(susp.txt) && !susp.entrou, 'empresa suspensa: fica fora, com aviso (não abre o sistema)');
    pg.psql(`update public.empresas set status = 'ATIVA' where id = '${EMP2}';`);
    // menus conforme as permissões (operador só com produção)
    pg.psql(`update public.usuarios_empresa set papel = 'OPERADOR', permissoes = '{"producao":"editar","cadastros":"ver"}' where user_id = '${pg.USER}' and empresa_id = '${pg.EMP}';`);
    await page.goto('http://app.local/sistema/gut'); await page.waitForTimeout(2500);
    const menus = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#nav [data-view]')].map(b => [b.dataset.view, b.style.display !== 'none'])));
    ok(menus.interna && menus.bipagem && menus.cadastros && menus.dashboard && !menus.financeiro && !menus.compras && !menus.faccoes && !menus.corte, 'operador vê só os menus dos módulos dele: ' + Object.keys(menus).filter(k => menus[k]).join(','));
    const negado = await page.evaluate(() => callServer('salvarCadastro', 'cor', { COR: 'OPERADOR TENTOU' }).then(() => '', e => e.message));
    ok(/permissão para alterar em cadastros/.test(negado), 'com "ver" em cadastros, a tela mostra o cadastro mas o servidor não deixa alterar: ' + negado);
    pg.psql(`update public.usuarios_empresa set papel = 'DONO', permissoes = '{}' where user_id = '${pg.USER}' and empresa_id = '${pg.EMP}';`);
    // ---- máquinas (v4.21.0): o mesmo acesso em outra máquina ----
    ok(!(await page.$('#gwGestao')), 'botão de Gestão não aparece para quem não é administrador');
    const dev = await page.evaluate(() => gutDispositivo());
    ok(pg.psql(`select count(*) from private.sessoes_maquina where dispositivo = '${dev}' and empresa_id = '${pg.EMP}' and ativo`) === '1', 'ao entrar, a máquina fica registrada (' + pg.psql(`select nome from private.sessoes_maquina where dispositivo = '${dev}' and ativo limit 1`) + ')');
    pg.psql(`update public.empresas set maquinas_dono = 1 where id = '${pg.EMP}'; update private.sessoes_maquina set ativo = false where dispositivo = '${dev}';
      update private.sessoes_maquina set ativo = true where id = (select id from private.sessoes_maquina where empresa_id = '${pg.EMP}' and dispositivo = 'maquina-de-teste-0001' order by criado_em desc limit 1);`);
    const barrado = await page.evaluate(() => callServer('getCadastros').then(() => '', e => e.message));
    await page.waitForTimeout(800);
    const aviso = await page.evaluate(() => (document.getElementById('gutEscolha') || {}).textContent || '');
    ok(/outra máquina/.test(barrado) && /Acesso aberto em outra máquina/.test(aviso) && /Teste/.test(aviso), 'outra máquina pegou o acesso: esta é barrada e mostra onde está aberto');
    await page.click('#gmUsar'); await page.waitForTimeout(2500);
    ok(await page.evaluate(() => GUT_STARTED && GUT_EMPRESA_SLUG === 'gut' && !document.getElementById('gutEscolha')) && pg.psql(`select count(*) from private.sessoes_maquina where empresa_id = '${pg.EMP}' and ativo`) === '1' && pg.psql(`select count(*) from private.sessoes_maquina where dispositivo = '${dev}' and ativo`) === '1', '"Usar nesta máquina" volta para o sistema e desconecta a outra');
    await page.evaluate(() => localStorage.setItem('gut-dispositivo', 'm-outra-maquina-000000000001'));
    await page.goto('http://app.local/sistema/gut'); await page.waitForTimeout(1500);
    const nova = await page.evaluate(() => ({ txt: (document.getElementById('gutEscolha') || {}).textContent || '', entrou: GUT_STARTED }));
    ok(/Acesso aberto em outra máquina/.test(nova.txt) && !nova.entrou, 'entrar numa máquina nova com o limite cheio: pergunta antes (não abre o sistema)');
    await page.click('#gmUsar'); await page.waitForTimeout(2500);
    ok(await page.evaluate(() => GUT_STARTED) && pg.psql(`select count(*) from private.sessoes_maquina where dispositivo = '${dev}' and ativo`) === '0', 'confirmando, entra e a máquina anterior sai');
    await page.evaluate(() => gutSair()); await page.waitForTimeout(800);
    ok(pg.psql(`select count(*) from private.sessoes_maquina where dispositivo = 'm-outra-maquina-000000000001' and encerrado_motivo = 'saiu'`) === '1', 'Sair libera a máquina');
    pg.psql(`update public.empresas set maquinas_dono = 3 where id = '${pg.EMP}';`);
    ok(errors.length === 0, 'sem erro de JavaScript ' + errors.join(' | '));
    ok(!API.length, 'nenhuma chamada ao Google em todo o teste');
  } finally { if (browser) await browser.close(); pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
