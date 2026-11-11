#!/usr/bin/env node
// Painéis de TV (/sistema): web_paineis_tv no banco local + tela no Playwright.
//   node test/paridade/paineis_tv_e2e.js        (precisa NODE_PATH=$(npm root -g))
// Confere as contas dos painéis 1, 2 e 3, os botões do Dashboard, o aviso ao vivo e tira prints em /tmp/gut_tv_*.png.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pg = require('./pg_base'), criarGas = require('./gas_sim'), { cenario } = require('./rodar');
const ROOT = path.join(__dirname, '..', '..');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const E = pg.EMP;
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const ontem = (() => { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
const ts = (dia, hm) => `${dia} ${hm}:00-03`;

function cenarioTv() {
  pg.psql(`
delete from apontamentos_producao; -- só os apontamentos deste teste
create or replace function public.web_empresa_id(p_slug text) returns uuid language sql stable security definer set search_path = '' as $$ select private.web_empresa(p_slug) $$;
grant execute on function public.web_empresa_id(text) to authenticated;
insert into cad_operadores(empresa_id,id_operador,nome,minutos_padrao_dia,ativo) values('${E}','OTV1','Ana TV',480,true),('${E}','OTV2','Bia TV',540,true);
insert into cad_produtos(empresa_id,id_produto,produto,ativo) values('${E}','PTV','Camisa TV',true);
insert into cad_processos(empresa_id,id_processo,processo,ativo) values('${E}','TA','Fechar lateral',true),('${E}','TB','Revisão final',true);
insert into roteiro_produto(empresa_id,id_roteiro,id_produto,id_processo,ordem_processo,tempo_padrao_seg_un,ativo) values('${E}','RTA','PTV','TA',1,30,true),('${E}','RTB','PTV','TB',2,20,true);
insert into jornada_operador(empresa_id,id_jornada,data,id_operador,minutos_disponiveis) values('${E}','JTV2','${ontem}','OTV2',400);
insert into apontamentos_producao(empresa_id,id_apontamento,data_hora,data_producao,id_operador,id_produto,id_processo,qtd_apontada,tempo_padrao_seg_un,minutos_entregues,tipo_apontamento,status,data_hora_inicio,data_hora_fim,minutos_reais,eficiencia_execucao_pct) values
('${E}','Y1','${ts(ontem, '09:00')}','${ontem}','OTV1','PTV','TA',20,30,10,'MARCACAO','VALIDO','${ts(ontem, '08:48')}','${ts(ontem, '09:00')}',12,83.33),
('${E}','Y2','${ts(ontem, '17:00')}','${ontem}','OTV2','PTV','TB',600,20,200,'APONTAMENTO','VALIDO',null,'${ts(ontem, '17:00')}',null,null),
('${E}','Y3','${ts(ontem, '17:10')}','${ontem}','OTV2','PTV','TB',99,20,33,'APONTAMENTO','CANCELADO',null,null,null,null),
('${E}','H1','${ts(hoje, '00:20')}','${hoje}','OTV1','PTV','TB',50,20,16.67,'MARCACAO','VALIDO','${ts(hoje, '00:05')}','${ts(hoje, '00:20')}',15,111.13),
('${E}','H2','${ts(hoje, '00:25')}','${hoje}','OTV1','PTV','TA',10,30,5,'MARCACAO','VALIDO','${ts(hoje, '00:21')}','${ts(hoje, '00:25')}',3.5,142.86),
('${E}','H3','${ts(hoje, '00:30')}','${hoje}','OTV2','PTV','TA',40,30,20,'APONTAMENTO','VALIDO',null,'${ts(hoje, '00:30')}',null,null);`);
}

(async () => {
  await pg.subir();
  let browser;
  try {
    const gas = criarGas(pg); cenario(gas); cenarioTv();
    // 1) a função no banco
    const d = pg.psql(pg.comoUsuario(`select public.web_paineis_tv('gut','${ontem}','${hoje}')::text;`)).split('\n').pop();
    const D = JSON.parse(d), tv = D.apontamentos.filter(a => /^[YH]\d$/.test(a.id));
    ok(tv.length === 5 && !tv.some(a => a.id === 'Y3'), 'web_paineis_tv traz os apontamentos válidos do período (sem o cancelado)');
    ok(tv.find(a => a.id === 'Y2').final && tv.find(a => a.id === 'H1').final && !tv.find(a => a.id === 'H2').final, 'selo FINAL = última operação da sequência operacional');
    ok(tv.find(a => a.id === 'H1').metodo === 'MARCACAO' && tv.find(a => a.id === 'H3').metodo === 'APONTAMENTO' && tv.find(a => a.id === 'H1').inicio === '00:05', 'método e horários em SP');
    let negado = ''; try { pg.psql(pg.comoUsuario(`select public.web_paineis_tv('gut',null,null);`, '22222222-2222-4222-8222-222222222222')); } catch (e) { negado = e.message; }
    ok(/Faça login|acesso/.test(negado), 'quem não é da empresa não lê os painéis');

    // 2) a tela
    const html = fs.readFileSync(path.join(ROOT, 'site/sistema/index.html'), 'utf8');
    const motorJs = fs.readFileSync(path.join(ROOT, 'site/sistema/gut-motor.js'), 'utf8');
    const tvJs = fs.readFileSync(path.join(ROOT, 'site/sistema/paineis-tv.js'), 'utf8');
    const RPC = [];
    const mockSb = `window.supabase={createClient(){const s={access_token:'tok-ok',user:{email:'carla@gut.com'}};
      return {auth:{async getSession(){return {data:{session:s}}},async signInWithPassword(){return {error:null}},async signOut(){},async resetPasswordForEmail(){return {error:null}}},
        async rpc(fn,args){const r=await fetch('http://sb.local/rpc/'+fn,{method:'POST',body:JSON.stringify(args)});const j=await r.json();return r.ok?{data:j,error:null}:{data:null,error:{message:j.message}}},
        channel(){const c={on(t,f,h){window.__vivo=h;return c},subscribe(cb){setTimeout(()=>cb&&cb('SUBSCRIBED'),10);return c}};return c},removeChannel(){}}}};`;
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async r => {
      const u = r.request().url();
      if (u.startsWith('http://app.local/sistema/gut-motor.js')) return r.fulfill({ contentType: 'application/javascript', body: motorJs });
      if (u.startsWith('http://app.local/sistema/paineis-tv.js')) return r.fulfill({ contentType: 'application/javascript', body: tvJs });
      if (u.startsWith('http://app.local/')) return r.fulfill({ contentType: 'text/html', body: html });
      if (u.startsWith('http://sb.local/rpc/')) {
        const fn = u.split('/rpc/')[1], args = JSON.parse(r.request().postData() || '{}'); RPC.push(fn);
        try {
          const a = Object.entries(args).map(([k, v]) => Array.isArray(v) ? `${k} => array(select jsonb_array_elements_text($j$${JSON.stringify(v)}$j$::jsonb))` : v == null ? `${k} => null` : `${k} => $j$${v}$j$`);
          const out = pg.psql(pg.comoUsuario(`select coalesce(to_jsonb(public.${fn}(${a.join(', ')}))::text, 'null');`)).split('\n').pop();
          return r.fulfill({ contentType: 'application/json', body: out });
        } catch (e) { console.log('    rpc falhou', fn, e.message.split('\n')[0]); return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message.split('\n')[0] }) }); }
      }
      if (u.startsWith('https://script.google.com/')) {
        const b = JSON.parse(r.request().postData() || '{}');
        let out; try { out = gas.api(b.action, b.args, b.meta || {}); } catch (e) { out = { __error: true, message: String(e.message || e) }; }
        return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
      }
      if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mockSb });
      if (u.includes('chart.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.Chart=function(){this.destroy=function(){};this.update=function(){}};Chart.defaults={plugins:{legend:{}}};' });
      if (u.includes('qrcode')) return r.fulfill({ contentType: 'application/javascript', body: 'window.QRCode=function(){};QRCode.CorrectLevel={M:0};' });
      return r.fulfill({ body: '' });
    });
    await page.goto('http://app.local/sistema/'); await page.waitForTimeout(3500);
    ok(await page.locator('#kpiCards .tv-launch-btn').count() === 5 && await page.locator('#kpiCards .tv-launch-btn[disabled]').count() === 2, 'Dashboard mostra os 5 botões (1, 2 e 3 ativos; 4 e 5 em breve)');
    await page.screenshot({ path: '/tmp/gut_tv_dashboard.png' });

    // painel 2 com o período ontem → hoje
    await page.click('.tv-launch-btn >> nth=1'); await page.waitForSelector('#tvWorkspace'); await page.waitForTimeout(800);
    await page.fill('#tvInicio', ontem); await page.dispatchEvent('#tvInicio', 'change'); await page.waitForTimeout(900);
    await page.selectOption('#tvProduto', 'PTV'); await page.waitForTimeout(300);
    const k2 = await page.$$eval('#tvBody .tvg-kpi strong', x => x.map(e => e.textContent));
    ok(k2.join('|') === '1.276|720|650|-596|53,3%', 'painel 2: meta 1.276 · realizado 720 · prontas 650 · saldo −596 · eficiência 53,3% (' + k2.join('|') + ')');
    const linhas = await page.$$eval('#tvBody tbody tr', x => x.map(e => e.className + ' :: ' + e.textContent));
    ok(linhas.length === 5 && /tv-neutral.*fim do dia/.test(linhas[0]), 'mais recente em cima; apontamento direto de hoje fica "fim do dia" (' + linhas[0] + ')');
    ok(linhas.some(l => /tv-good.*revisar tempo/.test(l) && /142,9%/.test(l)), 'eficiência acima de 120% pede "revisar tempo"');
    ok(linhas.some(l => /tv-good.*FINAL.*111,1%/.test(l)) && linhas.some(l => /tv-bad.*50%/.test(l)) && linhas.some(l => /tv-mid.*83,3%/.test(l)), 'cores: >100 verde, 80–100 azul, ≤80 vermelho');
    const rk = await page.$$eval('#tvBody .tv-rank-row', x => x.map(e => e.textContent));
    ok(rk.length === 2 && /Ana TV.*105,3%/.test(rk[0]) && /Bia TV.*50%/.test(rk[1]), 'ranking por eficiência acumulada (' + rk.join(' / ') + ')');
    await page.screenshot({ path: '/tmp/gut_tv_painel2.png' });

    // painel 1
    await page.click('[data-tv-panel="1"]'); await page.waitForTimeout(300);
    const k1 = await page.$$eval('#tvBody .tvg-kpi strong', x => x.map(e => e.textContent));
    ok(k1.join('|') === '650|1.245|52,2%|325|53,3%', 'painel 1: prontas 650 · meta 1.245 · coletiva 52,2% · 325/dia · global 53,3% (' + k1.join('|') + ')');
    ok(await page.locator('#tvBody .tvg-bar').count() === 2 && await page.locator('#tvBody .tvg-marker').count() === 2 && await page.locator('#tvBody .tvg-line.l-media').count() === 1, 'gráfico: barra por dia, traço da meta e linha da média');
    const prod = await page.textContent('#tvBody .tvp-prod');
    ok(/Camisa TV/.test(prod) && /Prontas650de1.245/.test(prod.replace(/\s/g, '')) && /Gargalo.*Fechar lateral.*−290 pç vs média/.test(prod), 'por produto: % · prontas X de Y · gargalo (' + prod.replace(/\s+/g, ' ').trim() + ')');
    await page.screenshot({ path: '/tmp/gut_tv_painel1.png' });

    // painel 3: hoje, sem filtros, tela cheia
    await page.click('[data-tv-panel="3"]'); await page.waitForTimeout(400);
    const k3 = await page.$$eval('#tvBody .tvg-kpi strong', x => x.map(e => e.textContent));
    ok(k3.join('|') === '52|100|50|+8|115,4%', 'painel 3 (hoje): meta 52 · realizado 100 · prontas 50 · saldo +8 · 115,4% (' + k3.join('|') + ')');
    ok(!(await page.isVisible('#tvFilterBar')), 'painel 3 sem filtros');
    const rk3 = await page.$$eval('#tvBody .tv-rank-row', x => x.map(e => e.textContent));
    ok(/Bia TV.*20 min de 540/.test(rk3.join(' ')), 'acumulado do dia mostra minutos entregues ÷ disponíveis de quem ainda fecha no fim do dia');
    await page.click('[data-tv-action="fullscreen"]', { force: true }); await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/gut_tv_painel3.png' });

    // ao vivo: nova gravação + aviso no canal → recarrega sozinho
    pg.psql(`insert into apontamentos_producao(empresa_id,id_apontamento,data_hora,data_producao,id_operador,id_produto,id_processo,qtd_apontada,tempo_padrao_seg_un,minutos_entregues,tipo_apontamento,status) values('${E}','H4','${ts(hoje, '00:40')}','${hoje}','OTV2','PTV','TB',7,20,2.33,'APONTAMENTO','VALIDO');`);
    const antes = RPC.filter(x => x === 'web_paineis_tv').length;
    await page.evaluate(() => window.__vivo({ payload: { t: 'cupons_producao' } })); await page.waitForTimeout(1500);
    const k3b = await page.$$eval('#tvBody .tvg-kpi strong', x => x.map(e => e.textContent));
    ok(RPC.filter(x => x === 'web_paineis_tv').length > antes && k3b[1] === '107' && await page.locator('#tvBody tr.tv-new').count() === 1, 'aviso ao vivo recarrega e o lançamento novo chega por cima, destacado');

    // rodízio e voltar
    await page.evaluate(() => { document.getElementById('tvWorkspace').classList.remove('tv-full'); });
    await page.check('#tvRotOn'); await page.fill('#tvRotSecs', '10'); await page.dispatchEvent('#tvRotSecs', 'change');
    await page.waitForTimeout(10600);
    ok(await page.getAttribute('#tvWorkspace', 'data-panel') === '1', 'rodízio passa para o próximo painel');
    await page.uncheck('#tvRotOn');
    await page.click('[data-tv-action="back"]'); await page.waitForTimeout(200);
    ok(!(await page.$('#gutTv')) && !/#tv/.test(page.url()), 'Voltar fecha o painel e limpa o link');
    // link direto
    await page.goto('about:blank'); await page.goto('http://app.local/sistema/#tv2'); await page.waitForTimeout(4000);
    ok(await page.$('#tvWorkspace[data-panel="2"]') !== null, 'o link /sistema/#tv2 abre o painel direto (para a TV)');
    ok(errors.length === 0, 'sem erro de JavaScript ' + errors.join(' | '));
  } finally { if (browser) await browser.close(); pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
