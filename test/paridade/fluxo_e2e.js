#!/usr/bin/env node
// v4.23.0 — Facção com serviço parcial, na tela /sistema (Playwright + banco local, tudo pelo servidor):
//  • janela de destino: "Peça pronta" / "Serviço parcial", desmarcar operações, preço proporcional;
//  • quadro interno: saco que passou pela facção, operações da facção concluídas, "Problema da facção";
//  • kanban e romaneio mostram o serviço parcial.
//   node test/paridade/fluxo_e2e.js  (SHOT=/dir tira fotos) — Painel de TV 4: Kanban de produtos
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
    let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok', m); } else { fail++; console.log('✗', m); } };
    await page.setViewportSize({ width: 1600, height: 900 });
    console.log('volumes', pg.psql(`select string_agg(status_volume || ':' || n, ', ') from (select status_volume, count(*) n from public.volumes group by 1) x;`), '| corte', pg.psql(`select coalesce(sum(saldo_disponivel),0) from public.estoque_corte;`));
    // um volume de cada etapa para cobrir o Kanban
    const vs = pg.psql(`select string_agg(id_volume, ',' order by id_volume) from public.volumes;`).split(',');
    const est = ['AGUARDANDO_DESTINO', 'AGUARDANDO_ENVIO_FACCAO', 'EM_FACCAO', 'AGUARDANDO_INSPECAO', 'AGUARDANDO_EMBALAGEM', 'EM_ESTOQUE_PA', 'CONTINUACAO_GERADA'];
    const extra = [];
    est.forEach((st, k) => extra.push(`insert into public.volumes (empresa_id, id_volume, cod_volume, id_estoque_corte, qtd_volume, status_volume, atualizado_em)
      select empresa_id, 'FX-${k}', 'FX-${k}', id_estoque_corte, ${10 + k}, '${st}', now() from public.volumes where id_volume = '${vs[0]}';`));
    pg.psql(extra.join('\n'));
    const esperado = JSON.parse(pg.psql(`select json_object_agg(e, q) from (select e, sum(q) q from (
        select case status_volume when 'AGUARDANDO_DESTINO' then 'VOLUMADO' when 'CRIADO' then 'VOLUMADO' when 'AGUARDANDO_ENVIO_FACCAO' then 'DESTINO' when 'EM_FACCAO' then 'FACCAO' when 'AGUARDANDO_INSPECAO' then 'INSPECAO'
          when 'EM_PRODUCAO_INTERNA' then 'INTERNA' when 'AGUARDANDO_EMBALAGEM' then 'EMBALAR' when 'CONCLUIDO_INTERNO' then 'EMBALAR' when 'EM_ESTOQUE_PA' then 'HIST' end e, qtd_volume q from public.volumes
        union all select 'CORTE', saldo_disponivel from public.estoque_corte where saldo_disponivel > 0) x where e is not null group by e) y;`));
    console.log('esperado', JSON.stringify(esperado));

    await page.evaluate(() => gutTvAbrir(4)); await page.waitForTimeout(2500);
    const col = await page.evaluate(() => [...document.querySelectorAll('.fx-col')].map(c => ({ h: c.querySelector('.fx-col-h b').textContent, q: Number(c.querySelector('.fx-col-h>span').childNodes[0].textContent.replace(/\D/g, '')), cards: c.querySelectorAll('.fx-card').length })));
    console.log(JSON.stringify(col));
    const mapa = { 'ESTOQUE DE CORTE': 'CORTE', 'VOLUMADO': 'VOLUMADO', 'DESTINO DEFINIDO': 'DESTINO', 'NA FACÇÃO': 'FACCAO', 'RETORNO / INSPEÇÃO': 'INSPECAO', 'PRODUÇÃO INTERNA': 'INTERNA', 'PRONTO P/ EMBALAR': 'EMBALAR' };
    ok(col.length === 7 && col.every(c => c.q === Math.round(Number(esperado[mapa[c.h]] || 0))), 'painel 4 tem as 7 colunas e o total de cada uma bate com o banco');
    ok(col.every(c => c.cards <= 2), 'sem lotes: um card por produto em cada coluna (cenário com 1–2 produtos)');
    const titulo = await page.evaluate(() => document.getElementById('tvTitle').textContent + ' | ' + location.hash);
    ok(/KANBAN DE PRODUTOS/.test(titulo) && /#tv4/.test(titulo), 'título e link #tv4: ' + titulo);
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'kanban-produtos.png') });

    // explodir por tamanho e por cor
    const nTam = Number(pg.psql(`select count(distinct id_tamanho) from public.estoque_corte e where exists (select 1 from public.volumes v where v.id_estoque_corte = e.id_estoque_corte and v.status_volume = 'EM_PRODUCAO_INTERNA');`));
    await page.evaluate(() => document.querySelector('.fx-c5 .fx-card [data-tv-action="fx-abrir"]').click()); await page.waitForTimeout(300);
    const t = await page.evaluate(() => ({ n: document.querySelectorAll('.fx-c5 .fx-card').length, sub: [...document.querySelectorAll('.fx-c5 .fx-nome small')].map(x => x.textContent), tot: document.querySelector('.fx-c5 .fx-col-h>span').textContent }));
    ok(t.n === nTam && t.sub.every(Boolean), 'explodir o card por tamanho: um card por tamanho, mesmo total: ' + JSON.stringify(t));
    await page.evaluate(() => document.querySelector('.fx-c5 .fx-card [data-tv-action="fx-abrir"]').click()); await page.waitForTimeout(300);
    const c = await page.evaluate(() => ({ n: document.querySelectorAll('.fx-c5 .fx-card').length, sub: [...document.querySelectorAll('.fx-c5 .fx-nome small')].map(x => x.textContent) }));
    ok(c.sub.every(x => / · /.test(x)), 'explodir de novo: tamanho e cor no card: ' + JSON.stringify(c));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'kanban-produtos-cor.png') });
    await page.evaluate(() => document.querySelector('.fx-c5 [data-tv-action="fx-juntar"]').click()); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelectorAll('.fx-c5 .fx-card').length) <= 2, '"juntar" volta para um card por produto');
    await page.click('[data-tv-action="fx-nivel"][data-n="T"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => [...document.querySelectorAll('.fx-card .fx-nome small')].length === document.querySelectorAll('.fx-card').length), 'o seletor do topo "+ TAMANHO" separa todos os cards por tamanho');
    await page.click('[data-tv-action="fx-nivel"][data-n="P"]'); await page.waitForTimeout(200);
    await page.fill('#tvFxBusca', 'zzz-nao-existe'); await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.querySelectorAll('.fx-card').length === 0), 'busca por produto filtra os cards');
    await page.fill('#tvFxBusca', ''); await page.waitForTimeout(400);
    // histórico
    await page.click('[data-tv-action="fx-hist"]'); await page.waitForTimeout(300);
    const h = await page.evaluate(() => ({ t: document.querySelector('.fx-hist .tv-panel-header>span')?.textContent, cards: document.querySelectorAll('.fx-hist .fx-card').length }));
    ok(h.cards >= 1 && Number(String(h.t).replace(/\D/g, '')) === Math.round(Number(esperado.HIST || 0)), 'histórico mostra o que foi para o estoque (fora do Kanban): ' + JSON.stringify(h));
    if (SHOT) await page.screenshot({ path: path.join(SHOT, 'kanban-produtos-historico.png') });
    await page.click('[data-tv-action="fx-hist"]'); await page.waitForTimeout(200);
    // ao vivo: volume muda de etapa
    pg.psql(`update public.volumes set status_volume = 'EM_ESTOQUE_PA', tipo_local_atual = 'ESTOQUE_PA', atualizado_em = now() where id_volume = 'FX-4';`);
    await page.evaluate(() => GUT_TV.refresh()); await page.waitForTimeout(1500);
    const emb = await page.evaluate(() => Number(document.querySelector('.fx-c6 .fx-col-h>span').childNodes[0].textContent.replace(/\D/g, '')));
    ok(emb === Math.round(Number(esperado.EMBALAR || 0)) - 14, 'caixa enviada para o estoque sai da coluna "pronto p/ embalar": ' + emb);
    // botão no Dashboard
    await page.evaluate(() => GUT_TV.fechar());
    const btn = await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="tvtest">' + gutTvBotoes() + '</div>'); const b = [...document.querySelectorAll('#tvtest .tv-launch-btn')].find(x => /Kanban de produtos/.test(x.textContent)); return b ? !b.disabled : null; });
    ok(btn === true, 'Dashboard: botão 4 "Kanban de produtos" ao vivo');
    console.log('erros', errors.slice(0, 5)); console.log(`${pass}/${pass + fail}`); if (fail) process.exitCode = 1;
  } finally { if (browser) await browser.close(); pg.descer(true); }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
