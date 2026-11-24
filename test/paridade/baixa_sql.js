#!/usr/bin/env node
// gut_030 / gut_034 — baixa completa da caixa (web_baixa_caixas), sem senha desde a v4.43.
//   node test/paridade/baixa_sql.js
process.env.TZ = 'America/Sao_Paulo';
const pg = require('./pg_base');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const E = pg.EMP;
const j = sql => { const out = pg.psql(sql).split('\n').filter(Boolean).pop(); try { return JSON.parse(out); } catch (e) { return out; } };
const erro = sql => { try { pg.psql(sql); return ''; } catch (e) { return String(e.message || e); } };
const baixa = (ids, senha = '') => j(pg.comoUsuario(`select public.web_baixa_caixas('gut', array[${ids.map(i => `'${i}'`).join(',')}]::text[], '${senha}');`));

(async () => {
  await pg.subir();
  try {
    pg.psql(`
      insert into public.cad_operadores (empresa_id, id_operador, matricula, nome, ativo, minutos_padrao_dia) values
        ('${E}', 'OP-A', '201', 'Ana Souza', true, 480), ('${E}', 'OP-B', '202', 'Bia Lima', true, 480), ('${E}', 'OP-X', '203', 'Xavier (inativo)', false, 480);
      insert into public.volumes (empresa_id, id_volume, cod_volume, status_volume, qtd_volume) values
        ('${E}', 'VB-1', 'VB-1', 'EM_PRODUCAO_INTERNA', 20), ('${E}', 'VB-2', 'VB-2', 'EM_PRODUCAO_INTERNA', 10);
      insert into public.cupons_producao (empresa_id, id_cupom, cod_cupom, id_volume, ordem_processo, qtd_programada, tempo_padrao_seg_un, minutos_padrao_total, status_cupom, id_operador_alocado) values
        ('${E}', 'B1-1', 'B1-1', 'VB-1', 1, 20, 30, 10, 'PENDENTE', 'OP-A'),
        ('${E}', 'B1-2', 'B1-2', 'VB-1', 2, 20, 60, 20, 'PENDENTE', 'OP-B'),
        ('${E}', 'B1-3', 'B1-3', 'VB-1', 3, 20, 0, 0, 'PENDENTE', 'OP-A'),
        ('${E}', 'B1-4', 'B1-4', 'VB-1', 4, 20, 15, 5, 'CONCLUIDO', null),
        ('${E}', 'B2-1', 'B2-1', 'VB-2', 1, 10, 60, 10, 'PENDENTE', null),
        ('${E}', 'B2-2', 'B2-2', 'VB-2', 2, 10, 30, 5, 'PENDENTE', 'OP-X'),
        ('${E}', 'B2-3', 'B2-3', 'VB-2', 3, 10, 120, 20, 'EM_ANDAMENTO_MARCACAO', null);
      update public.cupons_producao set id_operador_marcacao = 'OP-B', data_hora_inicio_marcacao = now() - interval '25 minutes',
        pausado_em = now() - interval '5 minutes', segundos_pausa = 60 where id_cupom = 'B2-3';`);

    // caixa 1: todo mundo alocado → baixa direta, sem senha
    let r = baixa(['B1-1', 'B1-2', 'B1-3']);
    const ana = (r.por_funcionario || []).find(x => x.id === 'OP-A'), bia = (r.por_funcionario || []).find(x => x.id === 'OP-B');
    ok(r.ok && r.operacoes === 3 && Number(r.minutos) === 30 && r.empresa_ops === 0 && ana && ana.ops === 2 && Number(ana.min) === 10 && bia && Number(bia.min) === 20,
      'todos alocados: baixa sem senha e os minutos vão para cada funcionário (Ana 10, Bia 20; operação sem tempo padrão entra com 0): ' + JSON.stringify(r));
    ok(pg.psql(`select status_volume from public.volumes where id_volume = 'VB-1';`) === 'CONCLUIDO_INTERNO', 'a caixa fica concluída (pronta para estoque)');
    const ind = j(`select jsonb_object_agg(id_operador, minutos_entregues) from public.indicador_diario;`);
    ok(Number(ind['OP-A']) === 10 && Number(ind['OP-B']) === 20, 'indicador do dia de cada funcionário atualizado: ' + JSON.stringify(ind));
    ok(Number(pg.psql(`select count(*) from public.apontamentos_producao where origem_bipagem = 'BAIXA_COMPLETA';`)) === 3, 'três apontamentos "BAIXA_COMPLETA"');

    // caixa 2: uma sem ninguém, uma alocada a inativo, uma em marcação — sem senha (v4.43): a tela só avisa e confirma
    r = baixa(['B2-1', 'B2-2', 'B2-3']);
    const bia2 = (r.por_funcionario || []).find(x => x.id === 'OP-B');
    ok(r.ok && r.operacoes === 3 && r.empresa_ops === 2 && Number(r.empresa_min) === 15 && bia2 && Number(bia2.min) === 20,
      'sem senha: 2 operações sem funcionário (15 min) vão para a produção da empresa e a marcação em andamento é finalizada para a Bia: ' + JSON.stringify(r));
    const emp = j(`select jsonb_agg(jsonb_build_object('c', id_cupom, 'op', id_operador, 'm', minutos_entregues, 'obs', observacao)) from public.apontamentos_producao where id_operador = 'EMPRESA';`);
    ok(emp.length === 2 && emp.every(x => /produção da empresa/.test(x.obs)), 'apontamentos da empresa com id_operador EMPRESA');
    ok(Number(pg.psql(`select count(*) from public.indicador_diario where id_operador = 'EMPRESA';`)) === 0 && Number(pg.psql(`select count(*) from public.jornada_operador where id_operador = 'EMPRESA';`)) === 0,
      'produção da empresa não cria jornada nem indicador');
    const mk = j(`select jsonb_build_object('met', metodo_conclusao, 'real', (select segundos_reais from public.apontamentos_producao a where a.id_cupom = 'B2-3')) from public.cupons_producao where id_cupom = 'B2-3';`);
    ok(mk.met === 'MARCACAO' && Math.abs(Number(mk.real) - (25 * 60 - 60 - 5 * 60)) <= 5, 'a marcação pausada desconta a pausa (25 min − 1 min − 5 min pausada agora): ' + JSON.stringify(mk));
    ok(pg.psql(`select status_volume from public.volumes where id_volume = 'VB-2';`) === 'CONCLUIDO_INTERNO', 'caixa 2 concluída');
    r = baixa(['B2-1']);
    ok(r.ok && r.operacoes === 0, 'repetir a baixa não grava de novo');
    ok(pg.psql(`select has_function_privilege('anon', 'public.web_baixa_caixas(text, text[], text)', 'execute')::text;`) === 'false'
      && pg.psql(`select has_function_privilege('authenticated', 'private.baixa_ponto(public.cupons_producao, text, text, timestamptz, timestamptz, numeric, text, text)', 'execute')::text;`) === 'false', 'fechado para anônimo; funções internas fechadas');
  } finally {
    pg.descer(true);
    const n = results.filter(Boolean).length; console.log(`${n}/${results.length}`); if (n !== results.length) process.exitCode = 1;
  }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
