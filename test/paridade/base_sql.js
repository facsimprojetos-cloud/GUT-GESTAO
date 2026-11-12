#!/usr/bin/env node
// Fase 0 — os ajudantes SQL (gut_014) dão o mesmo resultado que as funções do Code.gs que eles substituem.
//   node test/paridade/base_sql.js
process.env.TZ = 'America/Sao_Paulo';
const pg = require('./pg_base'), criarGas = require('./gas_sim');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const q = s => `$q$${s}$q$`;

(async () => {
  await pg.subir();
  try {
    const gas = criarGas(pg), G = gas.ctx;
    // num_ × web_num
    const nums = ['', '0', '12', '1.5', '1,5', '1.234,56', ' 7 ', 'abc', '-3,25', '1e3', '10.000', '2.500,00', 'Infinity', 'NaN'];
    const sqlN = pg.psql(`select string_agg(coalesce(private.web_num(x)::text, 'null'), '|' order by i) from unnest(array[${nums.map(q).join(',')}]) with ordinality t(x, i);`).split('|').map(Number);
    const difN = nums.map((s, i) => [s, G.num_(s), sqlN[i]]).filter(([, a, b]) => Math.abs(a - b) > 1e-9);
    ok(!difN.length, 'web_num = num_ em ' + nums.length + ' casos ' + JSON.stringify(difN));
    // dateKey_ × web_data
    const datas = ['2026-11-10', '05/03/2026', '5/3/2026', '2026-11-10T02:00:00Z', '2026-11-10T23:30:00-03:00', '2026-11-10T12:00:00', '31/12/2025 18:00'];
    const sqlD = pg.psql(`select string_agg(coalesce(private.web_data(x)::text, ''), '|' order by i) from unnest(array[${datas.map(q).join(',')}]) with ordinality t(x, i);`).split('|');
    const difD = datas.map((s, i) => [s, G.dateKey_(s), sqlD[i]]).filter(([, a, b]) => a !== b);
    ok(!difD.length, 'web_data = dateKey_ em ' + datas.length + ' casos ' + JSON.stringify(difD));
    // serialize_(Date) × web_txt
    const ts = ['2026-11-10T02:00:00Z', '2026-01-01T00:00:00-03:00', '2026-07-15T15:45:59.999Z'];
    const sqlT = pg.psql(`select string_agg(private.web_txt(x::timestamptz), '|' order by i) from unnest(array[${ts.map(q).join(',')}]) with ordinality t(x, i);`).split('|');
    const difT = ts.map((s, i) => [s, G.serialize_(new G.Date(s)), sqlT[i]]).filter(([, a, b]) => a !== b);
    ok(!difT.length, 'web_txt = serialize_(data) ' + JSON.stringify(difT));
    // numeração: SQL e Apps Script usam a mesma tabela e continuam a mesma contagem
    pg.psql(`insert into public.app_controle (empresa_id, versao_schema, revisao) values ('${pg.EMP}', '4.6.0', 'r0');`);
    gas.grava('salvarCadastro', 'fornecedor', { RAZAO_SOCIAL: 'F' }); gas.grava('salvarCadastro', 'localestoque', { LOCAL_ESTOQUE: 'L' }); gas.grava('salvarCadastro', 'material', { COD_MATERIAL: 'M', MATERIAL: 'M' });
    const c = gas.api('getCadastros', [], { forceFresh: true });
    const compra = () => gas.grava('registrarCompra', { ID_FORNECEDOR: c.fornecedores[0].ID_FORNECEDOR, DATA_COMPRA: '2026-11-10', itens: [{ ID_MATERIAL: c.materiais[0].ID_MATERIAL, QTD: 1, VALOR_UNITARIO: 1 }] }).compra.NUM_COMPRA;
    const n1 = compra();
    const n2 = Number(pg.psql(`select private.web_seq('${pg.EMP}', 'COMPRA', '2026', 'GLOBAL');`));
    const n3 = compra();
    ok(n1 === 'CP-000001' && n2 === 2 && n3 === 'CP-000003', `numeração compartilhada: Apps Script ${n1} → SQL ${n2} → Apps Script ${n3}`);
    // gravação: acesso + trava + auditoria + idempotência + revisão, como usuário logado
    const r = pg.psql(`select set_config('gut.uid', '${pg.USER}', false);
      do $$ declare e uuid; p jsonb; begin
        e := private.web_gravacao('gut');
        p := private.web_op_previa(e, 'teste-operacao-0001', 'acaoX', 'h1');
        if p is not null then raise exception 'previa deveria ser nula'; end if;
        perform private.web_audita(e, 'TESTE', 'X', 'id1', null, '{"a":1}'::jsonb);
        perform private.web_op_salva(e, 'teste-operacao-0001', 'acaoX', 'h1', '{"ok":true,"n":7}'::jsonb);
        perform private.web_fim(e);
      end $$;
      select private.web_op_previa(id, 'teste-operacao-0001', 'acaoX', 'h1')::text || '|' || (select id_usuario || ',' || observacao from public.auditoria where acao = 'TESTE') || '|' || (select revisao like 'web-%' from public.app_controle)::text from public.empresas;`).split('\n').pop();
    ok(r === '{"n": 7, "ok": true}|carla@gut.com,sistema web|true', 'web_gravacao/web_audita/web_op_salva/web_fim: ' + r);
    let erro = '';
    try { pg.psql(`select set_config('gut.uid', '${pg.USER}', false); select private.web_op_previa(id, 'teste-operacao-0001', 'outraAcao', '') from public.empresas;`); } catch (e) { erro = e.message; }
    ok(/já pertence a outra operação/.test(erro), 'o mesmo id de operação em outra ação é recusado');
    try { erro = ''; pg.psql(`select set_config('gut.uid', '22222222-2222-4222-8222-222222222222', false); select private.web_gravacao('gut');`); } catch (e) { erro = e.message; }
    ok(/não tem acesso/.test(erro), 'quem não é da empresa não grava');
    try { erro = ''; pg.psql(pg.comoUsuario(`select private.web_seq('${pg.EMP}', 'X', '', '');`)); } catch (e) { erro = e.message; }
    ok(/permission denied/.test(erro), 'o navegador não chama os ajudantes privados direto');
    try { erro = ''; pg.psql(`select set_config('gut.uid', '', false); select public.web_ler('gut', array['cad_cores']);`); } catch (e) { erro = e.message; }
    ok(/Faça login/.test(erro), 'sem login, web_ler recusa');
    // backup diário dentro do Supabase (fase 6)
    const bk = JSON.parse(pg.psql(`select backup.fazer()::text;`));
    const linhas = Number(pg.psql(`select count(*) from public.cad_fornecedores;`));
    const baixa = JSON.parse(pg.psql(pg.comoUsuario(`select public.web_backup_baixar('gut')::text;`)).split('\n').pop());
    ok(bk.ok && bk.tabelas > 40 && baixa.tabelas.cad_fornecedores.length === linhas && !JSON.stringify(baixa).includes('senha_salt'), `backup.fazer copiou ${bk.tabelas} tabelas (${bk.linhas} linhas) e o dono baixa a cópia sem senhas`);
    pg.psql(`delete from public.cad_fornecedores;`);
    const rest = JSON.parse(pg.psql(`select backup.restaurar_tabela(private.web_hoje(), '${pg.EMP}', 'cad_fornecedores')::text;`));
    ok(rest.linhas === linhas && Number(pg.psql(`select count(*) from public.cad_fornecedores;`)) === linhas, 'restaurar_tabela devolve a tabela apagada');
    try { erro = ''; pg.psql(pg.comoUsuario(`select public.gut_ler('x', array['cad_cores']);`)); } catch (e) { erro = e.message; }
    ok(/permission denied/.test(erro), 'GUT API desligada: gut_ler não pode mais ser chamada de fora');
    try { erro = ''; pg.psql(pg.comoUsuario(`select count(*) from backup.copias;`)); } catch (e) { erro = e.message; }
    ok(/permission denied/.test(erro), 'a cópia de segurança não é acessível pelo navegador');
  } finally { pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
