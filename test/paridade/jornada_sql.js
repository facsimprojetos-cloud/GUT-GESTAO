#!/usr/bin/env node
// gut_029 — jornada de trabalho da empresa (web_jornada_ler / web_jornada_salvar).
//   node test/paridade/jornada_sql.js
process.env.TZ = 'America/Sao_Paulo';
const pg = require('./pg_base');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const j = sql => { const out = pg.psql(sql).split('\n').filter(Boolean).pop(); try { return JSON.parse(out); } catch (e) { return out; } };
const erro = sql => { try { pg.psql(sql); return ''; } catch (e) { return String(e.message || e); } };
const salvar = (e, s, ii, fi, d) => pg.comoUsuario(`select public.web_jornada_salvar('gut', '${e}', '${s}', '${ii}', '${fi}', '${d}');`);

(async () => {
  await pg.subir();
  try {
    let r = j(pg.comoUsuario(`select public.web_jornada_ler('gut');`));
    ok(r.configurada === false && r.entrada === '07:00' && r.saida === '17:00' && Number(r.minutos_dia) === 540 && r.dias.join() === '1,2,3,4,5', 'sem cadastro: padrão 07:00–17:00, 1h de intervalo, seg a sex (540 min): ' + JSON.stringify(r));
    r = j(salvar('07:30', '17:18', '12:00', '13:00', '1,2,3,4,5'));
    ok(r.configurada === true && r.entrada === '07:30' && r.saida === '17:18' && Number(r.minutos_dia) === 528, 'salva 07:30–17:18 com 1h de almoço = 528 min/dia');
    r = j(salvar('06:00', '14:00', '', '', '5, 1,3,3,9'));
    ok(r.intervalo_ini === '' && Number(r.minutos_dia) === 480 && r.dias.join() === '1,3,5', 'sem intervalo; dias repetidos ou inválidos são ignorados e ficam em ordem');
    ok(Number(pg.psql(`select count(*) from private.empresa_jornada;`)) === 1, 'uma linha por empresa (salvar de novo atualiza)');
    ok(/depois da entrada/.test(erro(salvar('17:00', '07:00', '', '', '1'))), 'saída antes da entrada é recusada');
    ok(/dentro do horário/.test(erro(salvar('07:00', '17:00', '18:00', '19:00', '1'))), 'intervalo fora do horário é recusado');
    ok(/início e o fim do intervalo/.test(erro(salvar('07:00', '17:00', '12:00', '', '1'))), 'intervalo pela metade é recusado');
    ok(/pelo menos um dia/.test(erro(salvar('07:00', '17:00', '', '', '9'))), 'sem dia de trabalho é recusado');
    ok(/Horário inválido/.test(erro(salvar('7h', '17:00', '', '', '1'))), 'horário em formato errado é recusado');
    const sem = JSON.stringify([1, 2, 3, 4, 5, 6, 7].map(d => ({ dia: d, trabalha: d <= 6, entrada: '07:00', saida: d === 5 ? '16:00' : d === 6 ? '11:00' : '17:00', intervalo_ini: d === 6 ? '' : '12:00', intervalo_fim: d === 6 ? '' : '13:00' })));
    r = j(pg.comoUsuario(`select public.web_jornada_salvar_semana('gut', '${sem}');`));
    ok(Number(r.minutos_semana) === 2880 && Number(r.minutos_dia) === 480 && r.dias.join() === '1,2,3,4,5,6' && Number(r.semana[4].minutos) === 480 && Number(r.semana[5].minutos) === 240 && r.semana[6].trabalha === false,
      'por dia da semana: sexta até 16h (8h), sábado 7h–11h (4h), domingo folga = 48h por semana, média 8h: ' + JSON.stringify({ s: r.minutos_semana, d: r.minutos_dia }));
    r = j(pg.comoUsuario(`select public.web_jornada_ler('gut');`));
    ok(r.semana[5].saida === '11:00' && r.semana[5].intervalo_ini === '' && r.entrada === '07:00', 'ler devolve o horário de cada dia');
    ok(/Na sexta, a saída/.test(erro(pg.comoUsuario(`select public.web_jornada_salvar_semana('gut', '${sem.replace('"16:00"', '"06:00"')}');`))), 'erro diz o dia com problema');
    ok(pg.psql(`select has_function_privilege('anon', 'public.web_jornada_salvar(text, text, text, text, text, text)', 'execute')::text;`) === 'false'
      && pg.psql(`select has_function_privilege('authenticated', 'private.jornada_json(uuid)', 'execute')::text;`) === 'false', 'fechado para anônimo; função interna fechada');
  } finally {
    pg.descer(true);
    const n = results.filter(Boolean).length; console.log(`${n}/${results.length}`); if (n !== results.length) process.exitCode = 1;
  }
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
