#!/usr/bin/env node
// App de gestão (gutgestao.com.br/) no navegador, como administrador da plataforma:
//  • cadastrar empresa com limite de acessos e de máquinas;
//  • o card mostra o uso; a aba Acessos lista as máquinas abertas e desconecta.
//   node test/paridade/gestao_e2e.js
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pg = require('./pg_base'), { chamarRpc } = require('./rodar');
const ROOT = path.join(__dirname, '..', '..');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  await pg.subir();
  let browser;
  try {
    const ADM = '99999999-9999-4999-8999-999999999999';
    pg.psql(`insert into auth.users values ('${ADM}', 'admin@gut.com'); insert into public.plataforma_admins (user_id) values ('${ADM}');
      insert into public.app_controle (empresa_id, versao_schema, revisao) values ('${pg.EMP}', '4.6.0', 'r0');`);
    chamarRpc('gut', 'web_maquina_entrar', { p_slug: 'gut', p_dispositivo: 'maquina-da-carla-000001', p_nome: 'Windows • Chrome', p_assumir: false });
    const html = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
    const mockSb = `window.supabase={createClient(){const s={access_token:'tok-ok',user:{email:'admin@gut.com'}};
      return {auth:{async getSession(){return {data:{session:s}}},onAuthStateChange(){},async signInWithPassword(){return {error:null}},async signOut(){}},
        async rpc(fn,args){const r=await fetch('http://sb.local/rpc/'+fn,{method:'POST',body:JSON.stringify(args||{})});const j=await r.json();return r.ok?{data:j,error:null}:{data:null,error:{message:j.message}}},
        channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}}}};`;
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route('**/*', async r => {
      const u = r.request().url();
      if (u.startsWith('http://app.local/')) return r.fulfill({ contentType: 'text/html', body: html });
      if (u.startsWith('http://sb.local/rpc/')) {
        const fn = u.split('/rpc/')[1], args = JSON.parse(r.request().postData() || '{}');
        try {
          // gestao_usuarios não existe no banco de teste: lista simples da tabela
          const out = fn === 'gestao_usuarios'
            ? JSON.parse(pg.psql(`select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'nome', nome, 'email', email, 'papel', papel, 'ativo', ativo, 'confirmado', true)), '[]') from public.usuarios_empresa where empresa_id = '${args.p_emp}'`))
            : chamarRpc('gut', fn, args, ADM);
          return r.fulfill({ contentType: 'application/json', body: JSON.stringify(out) });
        } catch (e) { return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message.split('\n')[0] }) }); }
      }
      if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mockSb });
      return r.fulfill({ body: '' });
    });
    await page.goto('http://app.local/'); await page.waitForTimeout(1500);
    ok(/GUT Confecções/.test(await page.textContent('#main')), 'administrador vê as empresas');
    // nova empresa com limites
    await page.click('text=+ Nova empresa'); await page.waitForTimeout(300);
    await page.fill('#eNome', 'Malharia Nova'); await page.fill('#eLim', '3'); await page.fill('#eMaq', '2'); await page.fill('#eMaqD', '4');
    await page.click('#eSv'); await page.waitForTimeout(1200);
    ok(pg.psql(`select limite_usuarios || '/' || maquinas_por_usuario || '/' || maquinas_dono from public.empresas where slug = 'malharia-nova'`) === '3/2/4', 'empresa nova salva com limite de 3 acessos, 2 máquinas por login e 4 para o dono');
    const card = await page.textContent('#main');
    ok(/Até 3 acesso\(s\) • 2 máquina\(s\) por login \(dono: 4\)/.test(card) && /0\/3acessos/.test(card.replace(/\s+/g, '')), 'o card mostra os limites e o uso');
    ok(/Acessos sem limite/.test(card) && /1máquinasabertas/.test(card.replace(/\s+/g, '')), 'a GUT (sem limite) mostra 1 máquina aberta');
    // editar: limite inválido
    await page.evaluate(id => editarEmpresa(id), pg.EMP); await page.waitForTimeout(300);
    await page.fill('#eMaq', '0'); await page.click('#eSv'); await page.waitForTimeout(600);
    ok(/pelo menos 1/.test(await page.textContent('#eErr')), 'número de máquinas zero é recusado');
    await page.click('.modal .x'); await page.waitForTimeout(200);
    // acessos da GUT: máquinas abertas e desconectar
    await page.evaluate(id => abrirEmpresa(id, 'equipe'), pg.EMP); await page.waitForTimeout(1200);
    const eq = await page.textContent('#main');
    ok(/Máquinas abertas agora/.test(eq) && /Windows • Chrome/.test(eq) && /Carla/.test(eq), 'aba Acessos lista a máquina aberta da Carla');
    await page.click('button:has-text("Desconectar")'); await page.waitForTimeout(1200);
    ok(pg.psql(`select count(*) from private.sessoes_maquina where ativo`) === '0' && /Nenhuma máquina aberta/.test(await page.textContent('#main')), 'Desconectar tira a máquina');
    ok(pg.psql(`select count(*) from auditoria where acao = 'GESTAO_MAQUINA_DESCONECTAR'`) === '1', 'a desconexão fica na auditoria');
    ok(errors.length === 0, 'sem erro de JavaScript ' + errors.join(' | '));
  } finally { if (browser) await browser.close(); pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
