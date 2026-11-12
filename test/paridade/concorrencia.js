#!/usr/bin/env node
// Gravações pelo navegador: concorrência, idempotência e convivência com o Apps Script, no mesmo banco.
//   node test/paridade/concorrencia.js
process.env.TZ = 'America/Sao_Paulo';
const pg = require('./pg_base'), criarGas = require('./gas_sim');
const { carregarMotor, chamarRpc } = require('./rodar');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const n = q => Number(pg.psql(q));

(async () => {
  await pg.subir();
  try {
    pg.psql(`insert into public.app_controle (empresa_id, versao_schema, revisao) values ('${pg.EMP}', '4.6.0', 'r0');`);
    const gas = criarGas(pg);
    const motor = carregarMotor();
    const m = motor.m;
    const grava = async (acao, args, id) => { const r = await m.api(acao, args, { requestId: id }); if (r && r.__error) throw new Error(acao + ': ' + r.message); return r; };
    await grava('salvarCadastro', ['fornecedor', { RAZAO_SOCIAL: 'F' }], 'req-cad-000000000001');
    await grava('salvarCadastro', ['localestoque', { LOCAL_ESTOQUE: 'L' }], 'req-cad-000000000002');
    await grava('salvarCadastro', ['material', { COD_MATERIAL: 'M1', MATERIAL: 'MALHA' }], 'req-cad-000000000003');
    const c = await m.api('getCadastros', [], {});
    const compra = { ID_FORNECEDOR: c.fornecedores[0].ID_FORNECEDOR, DATA_COMPRA: '2026-11-12', itens: [{ ID_MATERIAL: c.materiais[0].ID_MATERIAL, QTD: 10, VALOR_UNITARIO: 2 }] };

    // 1) outro usuário grava no meio: a 1ª tentativa é recusada (40001) e a ação é refeita com os dados novos
    const rpcOriginal = m.estado().rpc; let interferiu = 0, recusas = 0;
    m.configurar({ rpc: async (fn, args) => {
      if (fn === 'web_aplicar' && !interferiu) { interferiu++; gas.api('registrarCompra', [compra], { requestId: 'req-outro-usuario-0001' }); }
      try { return await rpcOriginal(fn, args); } catch (e) { if (e.code === '40001') recusas++; throw e; }
    } });
    const r1 = await grava('registrarCompra', [compra], 'req-compra-00000000001');
    m.configurar({ rpc: rpcOriginal });
    const nums = pg.psql(`select string_agg(num_compra, ',' order by num_compra) from compras;`);
    ok(recusas === 1 && r1.compra.NUM_COMPRA === 'CP-000002' && nums === 'CP-000001,CP-000002', `concorrência: outro usuário gravou no meio → 1 recusa e refeito (${r1.compra.NUM_COMPRA}; compras ${nums})`);
    ok(n(`select count(*) from compras`) === 2 && n(`select count(*) from estoque_lotes`) === 2, 'nada gravado em dobro nem pela metade');

    // 2) idempotência: o mesmo pedido de novo só repete a resposta
    const r2 = await m.api('registrarCompra', [compra], { requestId: 'req-compra-00000000001' });
    ok(r2.__replayed && r2.compra.NUM_COMPRA === 'CP-000002' && n(`select count(*) from compras`) === 2, 'mesmo requestId pelo navegador: repete a resposta, não grava de novo');
    // 3) o Apps Script repete uma operação feita pelo navegador (e vice-versa)
    const r3 = gas.api('registrarCompra', [compra], { requestId: 'req-compra-00000000001' });
    ok(r3.__replayed && r3.compra.NUM_COMPRA === 'CP-000002', 'a GUT API lê a resposta guardada pelo navegador (gzip)');
    const r4 = await m.api('registrarCompra', [compra], { requestId: 'req-outro-usuario-0001' });
    ok(r4.__replayed && r4.compra.NUM_COMPRA === 'CP-000001', 'o navegador lê a resposta guardada pela GUT API (gzip comprimido)');
    // 4) mesmo id com outros dados → recusado
    const r5 = await m.api('registrarCompra', [Object.assign({}, compra, { DOCUMENTO: 'outro' })], { requestId: 'req-compra-00000000001' });
    ok(r5.__error && /já pertence a outra operação/.test(r5.message), 'mesmo id com dados diferentes é recusado');
    // 5) erro de regra: nada gravado, resposta igual à da GUT API
    const ruimA = gas.api('registrarCompra', [{ itens: [] }], { requestId: 'req-ruim-a-0000000001' });
    const ruimB = await m.api('registrarCompra', [{ itens: [] }], { requestId: 'req-ruim-b-0000000001' });
    ok(ruimB.__error && ruimB.message === ruimA.message && ruimB.retryable === false, 'erro de regra igual ao da GUT API: ' + ruimB.message);
    // 6) sem login / outra empresa: o banco recusa
    let erro = '';
    try { pg.psql(pg.comoUsuario(`select public.web_aplicar('gut', '[{"t":"cad_cores","ins":[{"id_cor":"x","cor":"X"}]}]'::jsonb);`, '22222222-2222-4222-8222-222222222222')); } catch (e) { erro = e.message; }
    ok(/não tem acesso/.test(erro), 'quem não é da empresa não grava pelo web_aplicar');
    try { erro = ''; chamarRpc('gut', 'web_aplicar', { p_slug: 'gut', p_ops: [{ t: 'empresas', ins: [{ id: 'x' }] }] }); } catch (e) { erro = e.message; }
    ok(/não permitida/.test(erro), 'web_aplicar não mexe em tabelas de controle (empresas)');
    // 7) a ação que precisa do Google não roda no navegador (a tela manda para a GUT API)
    try { erro = ''; await m.api('salvarFotoProduto', [{}], { requestId: 'req-foto-000000000001' }); } catch (e) { erro = e.message; }
    ok(/não roda no navegador/.test(erro), 'fotos (Drive) ficam na GUT API por enquanto');
    ok(n(`select count(*) from app_operacoes where id_operacao like 'req-ruim%'`) === 0, 'operação recusada não fica registrada');
  } finally { pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
