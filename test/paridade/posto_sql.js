#!/usr/bin/env node
// gut_028 — posto (costureira ↔ máquina), paradas, peças com defeito, uso pelo gatilho e OEE do dia.
//   node test/paridade/posto_sql.js
process.env.TZ = 'America/Sao_Paulo';
const pg = require('./pg_base'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const E = pg.EMP;
const j = sql => { const out = pg.psql(sql).split('\n').filter(Boolean).pop(); try { return JSON.parse(out); } catch (e) { return out; } };
const erro = sql => { try { pg.psql(sql); return ''; } catch (e) { return String(e.message || e); } };

(async () => {
  await pg.subir();
  try {
    // o banco local não traz o app de campo (gut_008): carrega aqui, e depois a parte "@so-supabase" da gut_028
    const g8 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/gut_008_app_campo.sql'), 'utf8');
    try { pg.psql(g8); } catch (e) { console.log('  (gut_008 com avisos: ' + String(e.message).split('ERROR:')[1]?.split('\n')[0] + ')'); }
    pg.psql(fs.readFileSync(path.join(ROOT, 'supabase/migrations/gut_028_posto_oee.sql'), 'utf8').split('-- @so-supabase')[1].replace(/^[^\n]*\n/, ''));
    pg.psql(`
      insert into public.cad_maquinas (empresa_id, id_maquina, cod_maquina, maquina, qtd_total, ativo) values ('${E}', 'MQ-R', 'RETA', 'Reta', 2, true) on conflict do nothing;
      insert into private.maquina_unidades (empresa_id, id_unidade, id_maquina, codigo) values ('${E}', 'U1', 'MQ-R', 'RETA-01'), ('${E}', 'U2', 'MQ-R', 'RETA-02');
      insert into public.cad_operadores (empresa_id, id_operador, matricula, nome, ativo, acesso_app) values ('${E}', 'OP-A', '101', 'Ana Souza', true, true), ('${E}', 'OP-B', '102', 'Bia Lima', true, true);
      insert into private.campo_sessoes (token_hash, empresa_id, tipo, id, expira) values
        (encode(extensions.digest('tkA', 'sha256'), 'hex'), '${E}', 'OPERADOR', 'OP-A', now() + interval '1 day'),
        (encode(extensions.digest('tkB', 'sha256'), 'hex'), '${E}', 'OPERADOR', 'OP-B', now() + interval '1 day');`);

    let r = j(`select public.campo_posto('tkA');`);
    ok(r.posto === null && r.parada === null, 'sem posto no começo');
    ok(/Bipe primeiro/.test(erro(`select public.campo_parada('tkA', 'Quebrou');`)), 'parada sem máquina pede para bipar a etiqueta');
    r = j(`select public.campo_posto_definir('tkA', 'GUT-MAQ:reta-01');`);
    ok(r.posto && r.posto.codigo === 'RETA-01' && r.posto.maquina === 'Reta', 'bipar a etiqueta (com prefixo, minúsculas) põe a costureira na máquina: ' + JSON.stringify(r.posto));
    ok(/não encontrada/.test(erro(`select public.campo_posto_definir('tkA', 'XYZ-99');`)), 'etiqueta desconhecida avisa');

    r = j(`select public.campo_parada('tkA', 'Quebrou / manutenção');`);
    ok(r.parada && r.parada.motivo === 'Quebrou / manutenção', 'máquina parou: fica registrada a parada aberta');
    j(`select public.campo_parada('tkA', 'Outro');`);
    ok(Number(pg.psql(`select count(*) from private.posto_eventos where tipo = 'PARADA' and fim is null;`)) === 1, 'tocar "parou" de novo não abre outra parada');
    pg.psql(`update private.posto_eventos set inicio = now() - interval '30 minutes' where tipo = 'PARADA';`);
    r = j(`select public.campo_parada('tkA', '');`);
    ok(r.parada === null, 'voltou a funcionar: a parada fecha');

    r = j(`select public.campo_defeito('tkA', 2, 'Costura');`);
    ok(Number(r.defeitosHoje) === 2, 'peça com defeito soma no dia');
    ok(/quantas peças/.test(erro(`select public.campo_defeito('tkA', 0, 'Costura');`)), 'defeito sem quantidade é recusado');

    // operação concluída por quem está no posto vira uso da máquina (gatilho)
    pg.psql(`insert into public.cupons_producao (empresa_id, id_cupom, cod_cupom, qtd_programada, tempo_padrao_seg_un, minutos_padrao_total, status_cupom)
               values ('${E}', 'CP-1', 'C1', 30, 60, 30, 'PENDENTE'), ('${E}', 'CP-2', 'C2', 10, 60, 10, 'PENDENTE');
             update public.cupons_producao set status_cupom = 'CONCLUIDO', id_operador_bipagem = 'OP-A', data_hora_bipagem = now() where id_cupom = 'CP-1';
             update public.cupons_producao set atualizado_em = now() where id_cupom = 'CP-1';`);
    const uso = j(`select jsonb_agg(jsonb_build_object('u', id_unidade, 'min', minutos_padrao, 'q', qtd)) from private.posto_eventos where tipo = 'USO';`);
    ok(uso && uso.length === 1 && uso[0].u === 'U1' && Number(uso[0].min) === 30 && Number(uso[0].q) === 30, 'operação concluída entra uma vez como uso da RETA-01: ' + JSON.stringify(uso));
    pg.psql(`update public.cupons_producao set status_cupom = 'CONCLUIDO', id_operador_bipagem = 'OP-B', data_hora_bipagem = now() where id_cupom = 'CP-2';`);
    ok(Number(pg.psql(`select count(*) from private.posto_eventos where tipo = 'USO';`)) === 1, 'quem não está em nenhum posto não gera uso');

    // OEE do dia como usuário logado
    const oee = j(pg.comoUsuario(`select public.web_oee('gut', null);`));
    const u1 = (oee || []).find(x => x.id_unidade === 'U1');
    ok(u1 && Math.abs(Number(u1.parada_min) - 30) < 1 && Number(u1.minutos_padrao) === 30 && Number(u1.pecas) === 30 && Number(u1.defeitos) === 2 && u1.operador === 'Ana Souza' && u1.motivos['Quebrou / manutenção'] >= 29,
      'web_oee: 30 min parada, 30 min padrão, 30 peças, 2 com defeito, costureira e motivos: ' + JSON.stringify(u1));

    // outra costureira na mesma máquina: a anterior sai do posto
    j(`select public.campo_posto_definir('tkB', 'RETA-01');`);
    ok(j(`select public.campo_posto('tkA');`).posto === null && j(`select public.campo_posto('tkB');`).posto.codigo === 'RETA-01', 'uma costureira por máquina: quem bipa por último fica');
    // pelo sistema web (layout)
    const ps = j(pg.comoUsuario(`select public.web_posto_definir('gut', 'OP-A', 'U2');`));
    ok(ps.length === 2 && ps.find(x => x.id_operador === 'OP-A').id_unidade === 'U2', 'o sistema web também põe a costureira na máquina');
    // segurança
    ok(pg.psql(`select has_function_privilege('anon', 'public.web_oee(text, date)', 'execute')::text;`) === 'false' && pg.psql(`select has_function_privilege('authenticated', 'private.posto_definir(uuid, text, text)', 'execute')::text;`) === 'false', 'web_oee fechado para anônimo; funções internas fechadas');
    ok(/sessão expirou/.test(erro(`select public.campo_posto('token-errado');`)), 'app de campo exige sessão válida');
  } finally {
    pg.descer(true);
    const n = results.filter(Boolean).length; console.log(`${n}/${results.length}`); if (n !== results.length) process.exitCode = 1;
  }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
