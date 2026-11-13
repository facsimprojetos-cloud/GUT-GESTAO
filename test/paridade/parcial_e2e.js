#!/usr/bin/env node
// v4.23.0 — Facção com serviço parcial, na tela /sistema (Playwright + banco local, tudo pelo servidor):
//  • janela de destino: "Peça pronta" / "Serviço parcial", desmarcar operações, preço proporcional;
//  • quadro interno: saco que passou pela facção, operações da facção concluídas, "Problema da facção";
//  • kanban e romaneio mostram o serviço parcial.
//   node test/paridade/parcial_e2e.js
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
    const LEIA = pg.psql(`select id_destino from cad_destinos where nome_destino = 'LEIA'`);
    const ANA = pg.psql(`select id_destino from cad_destinos where nome_destino = 'COSTURA DA ANA'`);   // o retrabalho voltaria sem custo para a LEIA (que causou o defeito)
    // bags da camisa (roteiro de 3 operações) aguardando destino e sem nada feito; a parte 4 do cenário deixou o OVERLOQUE como "só interno"
    pg.psql(`update roteiro_produto set so_interno = false;`); await page.evaluate(() => callServer('getCadastros', [], { forceFresh: true }).then(c => { STATE.cad = c; }));
    const livres = await page.evaluate(() => availableDestinationVolumes().filter(x => rotOps(volProductId(x)).length === 3 && !x.OPS_FEITAS && !x.ID_VOLUME_ORIGEM_RETRABALHO).map(x => String(x.ID_VOLUME)));
    const RET = livres[0];
    const CONT = pg.psql(`select id_volume from volumes where coalesce(id_volume_origem_parcial,'') <> '' limit 1`);
    ok(livres.length >= 2 && CONT && LEIA, 'cenário tem sacos da camisa aguardando destino (' + livres.length + ') e um saco de continuação na produção interna');
    // ---- janela de destino: serviço parcial
    const jan = await page.evaluate(({ RET, ANA }) => {
      const v = availableDestinationVolumes().find(x => String(x.ID_VOLUME) === RET); if (!v) return { erro: 'volume não está aguardando destino' };
      openLotDest('LOTE::' + String(volumeLot(v) || '—'), 'FACCAO', ANA, [RET]);
      const antes = $('lotDestScope').textContent;
      setLotDestScope('PARCIAL');
      const pid = volProductId(v), ops = rotOps(pid);
      const lista = [...document.querySelectorAll('#lotDestScope .lotdest-ops label')].length;
      const precoCheio = n(document.querySelector('[data-lotdest-price]').value);
      lotDestOpToggle(pid, ops[1].id, false);
      window.__pid = pid;
      const preco = n(document.querySelector('[data-lotdest-price]').value), hint = document.querySelector('.lotdest-prices small').textContent, txt = $('lotDestScope').textContent;
      return { antes, lista, precoCheio, preco, hint, txt, ops: ops.map(o => o.seg) };
    }, { RET, ANA });
    ok(/Peça pronta/.test(jan.antes) && /Serviço parcial/.test(jan.antes) && /devolve a peça pronta/.test(jan.antes), 'na janela de destino aparece "Escopo do serviço" com Peça pronta (padrão) e Serviço parcial');
    ok(jan.lista === 3 && /faz 2 de 3/.test(jan.txt), 'serviço parcial lista as 3 operações do roteiro; desmarcando uma, a facção faz 2 de 3: ' + (jan.txt || jan.erro));
    const esperado = Math.round(2.5 * (jan.ops[0] + jan.ops[2]) / (jan.ops[0] + jan.ops[1] + jan.ops[2]) * 100) / 100;
    ok(Math.abs(jan.preco - esperado) < 0.001 && /tabela .* × \d+% das operações/.test(jan.hint), 'preço sugerido proporcional ao tempo das operações: R$ ' + jan.preco + ' (' + jan.hint + ')');
    await shot(page, '1-janela-destino', '#lotDestModal .modal-card');
    await page.evaluate(() => confirmLotDest()); await page.waitForTimeout(3000);
    const item = pg.psql(`select escopo_servico || '|' || ops_faccao || '|' || preco_faccao_unit from remessa_itens where id_volume = '${RET}'`);
    ok(/^PARCIAL\|\[".+",".+"\]\|/.test(item) && Math.abs(Number(item.split('|')[2]) - esperado) < 0.001, 'remessa criada como serviço parcial, com as 2 operações e o preço proporcional: ' + item);
    await page.evaluate(() => callServer('getRemessasExternas').then(r => { STATE.remessas = r; }));
    const card = await page.evaluate(RET => { const g = dashActiveRemessaGroups(dashRemessaItems()).find(g => g.items.some(i => String(i.ID_VOLUME) === RET)); if (!g) return ''; STATE.expandedDashboardRemessas.add(String(g._viewKey || g.id)); return dashRemessaCardHtml(g); }, RET);
    ok(/status-mini\s+ajuste/.test(card) && /badge teal[^>]*>ajuste no envio/.test(card) && /Ajuste no envio: faz 2 de 3 operações/.test(card) && /status-child drag-child ajuste/.test(card), 'operação desmarcada no envio: card da remessa e do saco na cor de "ajuste no envio", com o que a facção faz');
    ok(/Finalização interna \(marcada no cadastro/.test(await page.textContent('.fac-legend')) && /Ajuste no envio/.test(await page.textContent('.fac-legend')), 'o quadro de facções tem a legenda das cores');
    ok(/class="mini-prod">1001 - CAMISA POLO</.test(card), 'card da remessa mostra o nome do produto sem precisar abrir');
    if (SHOT) { await page.click('[data-view="dash-faccoes"]'); await page.waitForTimeout(1500); await page.evaluate(() => { document.querySelectorAll('.status-group-toggle').forEach(b => b.click()); }); await page.waitForTimeout(500); await shot(page, '2-kanban-faccoes', '#externalStatusBoard'); }
    const rom = await page.evaluate(RET => { const r = STATE.remessas.find(r => (r.itens || []).some(i => String(i.ID_VOLUME) === RET)); return romaneioEscopoHtml(r); }, RET);
    ok(/SERVIÇO PARCIAL/.test(rom) && /\(2 de 3 operações\)/.test(rom), 'romaneio da facção diz que é serviço parcial e lista as operações dela');
    // ---- aguardando destino: saco que voltou de serviço parcial
    const espera = await page.evaluate(({ LEIA }) => { const v = { ...(STATE.volumes || []).find(x => x.ID_PRODUTO && rotOps(volProductId(x)).length === 3) }; v.ID_DESTINO_PARCIAL = LEIA; v.ID_VOLUME_ORIGEM_PARCIAL = 'x'; v.OPS_FEITAS = JSON.stringify(rotOps(volProductId(v)).slice(0, 2).map(o => o.id)); const [g] = dashWaitingLotGroups([v]); STATE.expandedDashboardLots.add(g.key); return dashWaitingLotCardHtml(g); }, { LEIA });
    ok(/status-mini drag-card ajuste/.test(espera) && /TERMINAR DENTRO/.test(espera) && /Voltou de <b>LEIA<\/b> • falta: <b>OVERLOQUE<\/b>/.test(espera) && /LEIA fez 2 de 3 operações • faltam 1/.test(espera), 'em "Aguardando destino" o lote que voltou com operação desmarcada vem na cor de ajuste, com a facção e o que falta');
    // ---- quadro interno: continuação
    await page.evaluate(() => loadInternalProductionBoard(true)); await page.waitForTimeout(1500);
    const q = await page.evaluate(CONT => { const v = (STATE.internalBoard?.rows || []).find(x => String(x.ID_VOLUME) === CONT); if (!v) return null; const row = { ...v, _progress: n(v.PROGRESSO_PCT) }; return { html: internalProductionVolumeCardHtml(row), ops: v.OPERACOES.map(o => o.STATUS_CUPOM + '/' + o.METODO_CONCLUSAO), fac: v.FACCAO_PARCIAL, oc: v.QTD_OCORRENCIA_FACCAO }; }, CONT);
    ok(q && q.ops.join(',') === 'CONCLUIDO/FACCAO,PENDENTE/,CONCLUIDO/FACCAO', 'no quadro interno as operações da facção já vêm concluídas (verdes) e só a que falta fica pendente: ' + (q && q.ops.join(',')));
    ok(q && /Passou por LEIA/.test(q.html) && /Problema da facção/.test(q.html) && /3 pç com problema/.test(q.html), 'o card do saco mostra que passou pela facção, o problema já registrado (1 da inspeção + 2 da produção) e o botão "Problema da facção"');
    await page.evaluate(CONT => openOcorr(CONT), CONT);
    const pre = await page.evaluate(() => ({ preco: $('ocorrPreco').value, info: $('ocorrInfo').textContent }));
    await page.fill('#ocorrQtd', '1'); await page.fill('#ocorrMotivo', 'barra torta');
    const prev = await page.textContent('#ocorrPreview');
    await page.click('#ocorrModal .btn-primary'); await page.waitForTimeout(1500);
    ok(/LEIA/.test(pre.info) && Number(pre.preco) > 0 && /Débito para LEIA: 1 ×/.test(prev), 'janela "Problema da facção" já traz a facção e o valor por peça que ela recebeu; mostra o débito antes de confirmar');
    ok(pg.psql(`select count(*) from financeiro_faccao where origem = 'OCORRENCIA_INTERNA' and id_volume = '${CONT}' and motivo = 'barra torta'`) === '1' && pg.psql(`select qtd_ocorrencia_faccao from volumes where id_volume = '${CONT}'`) === '4', 'problema registrado: débito no financeiro da facção e o saco soma 4 peças com problema');
    // finalizado dentro: o saco da remessa volta à cor normal, com "finalizado internamente"
    const fd = await page.evaluate(CONT => { const cont = STATE.volumes.find(v => String(v.ID_VOLUME) === CONT); const it = (STATE.remessas || []).flatMap(r => r.itens || []).find(i => String(i.ID_VOLUME) === String(cont.ID_VOLUME_ORIGEM_PARCIAL));
      const antes = { tipo: itemTipoParcial(it), fin: itemFinalizadoDentro(it), txt: contStatusTxt(cont) };
      const st = cont.STATUS_VOLUME; cont.STATUS_VOLUME = 'CONCLUIDO_INTERNO'; const depois = { tipo: itemTipoParcial(it), fin: itemFinalizadoDentro(it) }; cont.STATUS_VOLUME = st; return { antes, depois }; }, CONT);
    ok(fd.antes.tipo && !fd.antes.fin && fd.antes.txt === 'em produção interna' && fd.depois.tipo === '' && fd.depois.fin, 'enquanto o lote de finalização está em produção o saco fica colorido; quando termina dentro, volta à cor normal com "finalizado internamente"');
    const imp = await page.evaluate(CONT => callServer('prepararImpressaoCuponsInternos', [CONT]).then(r => (r.cupons || []).length), CONT);
    ok(imp === 1, 'imprimir cupons do saco de continuação: só o cupom da operação que falta');
    // ---- ficha do produto: operação "só interno (finalização)"
    const fic = await page.evaluate(async () => {
      const p = STATE.cad.produtos.find(x => x.CODIGO_PRODUTO === '1001'); fichaOpen(p.ID_PRODUTO); await new Promise(r => setTimeout(r, 300));
      const temCol = [...document.querySelectorAll('#ficha_rot th')].some(th => th.textContent === 'Quem faz');
      fichaSet('rot', 2, 'SO_INTERNO', true); await fichaSave(); await new Promise(r => setTimeout(r, 1500));
      return { temCol };
    });
    ok(fic.temCol && pg.psql(`select count(*) from roteiro_produto r join cad_produtos p on p.id_produto = r.id_produto and p.empresa_id = r.empresa_id where p.codigo_produto = '1001' and r.ativo and r.so_interno`) === '1', 'ficha do produto: coluna "Quem faz" e a operação marcada como "Só interno (finalização)" fica salva');
    const pp = await page.evaluate(({ ANA, OUTRO }) => {
      const v = availableDestinationVolumes().find(x => String(x.ID_VOLUME) === OUTRO); if (!v) return { erro: 'sem volume' };
      openLotDest('LOTE::' + String(volumeLot(v) || '—'), 'FACCAO', ANA, [v.ID_VOLUME]);
      return { nota: $('lotDestScope').textContent, hint: document.querySelector('.lotdest-prices small').textContent };
    }, { ANA, OUTRO: livres[1] });
    ok(/menos a finalização interna \(OVERLOQUE\)/.test(pp.nota) && /× \d+% das operações/.test(pp.hint), 'Peça pronta com finalização interna: a janela avisa que a facção faz tudo menos a finalização, com preço proporcional: ' + (pp.nota || pp.erro));
    await shot(page, '3-peca-pronta-finalizacao', '#lotDestModal .modal-card');
    await page.evaluate(() => confirmLotDest()); await page.waitForTimeout(3000);
    await page.evaluate(() => callServer('getRemessasExternas').then(r => { STATE.remessas = r; }));
    const cardFin = await page.evaluate(OUTRO => { const g = dashActiveRemessaGroups(dashRemessaItems()).find(g => g.items.some(i => String(i.ID_VOLUME) === OUTRO)); return g ? dashRemessaCardHtml(g) : ''; }, livres[1]);
    ok(/status-mini\s+fin/.test(cardFin) && /badge purple[^>]*>finalização interna/.test(cardFin), 'peça pronta de produto com finalização no cadastro: card da remessa na cor de "finalização interna"');
    // a tela atualiza o quadro pela leitura rápida (wqRemessasExternas): as cores precisam continuar depois de atualizar
    const rapido = await page.evaluate(async ({ RET, OUTRO }) => { STATE.remessas = await wqRemessasExternas(); const card = id => { const g = dashActiveRemessaGroups(dashRemessaItems()).find(g => g.items.some(i => String(i.ID_VOLUME) === id)); if (!g) return ''; STATE.expandedDashboardRemessas.add(String(g._viewKey || g.id)); return dashRemessaCardHtml(g); }; return { aj: card(RET), fin: card(OUTRO) }; }, { RET, OUTRO: livres[1] });
    ok(/status-mini\s+ajuste/.test(rapido.aj) && /Ajuste no envio: faz 2 de 3 operações/.test(rapido.aj) && /status-mini\s+fin/.test(rapido.fin) && /Finalização interna: faz 2 de 3/.test(rapido.fin), 'depois de atualizar o quadro, as remessas continuam com a cor (ajuste no envio / finalização interna)');
    const esperaFin = await page.evaluate(({ LEIA }) => { const v = { ...(STATE.volumes || []).find(x => x.ID_PRODUTO && rotOps(volProductId(x)).length === 3) }; v.ID_DESTINO_PARCIAL = LEIA; v.ID_VOLUME_ORIGEM_PARCIAL = 'x'; v.OPS_FEITAS = JSON.stringify(rotOps(volProductId(v)).slice(0, 2).map(o => o.id)); const [g] = dashWaitingLotGroups([v]); return dashWaitingLotCardHtml(g); }, { LEIA });
    ok(/status-mini drag-card fin/.test(esperaFin) && /FINALIZAÇÃO/.test(esperaFin), 'lote que volta só para a finalização do cadastro: card roxo "FINALIZAÇÃO" em Aguardando destino');
    if (SHOT) { await page.click('[data-view="dash-faccoes"]'); await page.waitForTimeout(1500); await page.evaluate(() => { document.querySelectorAll('.status-group-toggle').forEach(b => b.click()); }); await page.waitForTimeout(500); await shot(page, '4-kanban-cores', '#dash-faccoes .fac-flow-head ~ *'); await page.screenshot({ path: path.join(SHOT, '5-kanban-tela.png'), fullPage: false }); }
    ok(errors.length === 0, 'sem erro de JavaScript ' + errors.join(' | '));
  } finally { if (browser) await browser.close(); pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
