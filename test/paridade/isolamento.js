#!/usr/bin/env node
// Etapa A (SaaS) — segurança do cérebro no servidor:
//  • uma empresa nunca lê nem grava nada de outra;
//  • cada usuário só faz o que as permissões dele (módulos do app de gestão) deixam; o dono pode tudo;
//  • o navegador não grava direto (nem nas tabelas, nem pelo web_aplicar, nem pelo servidor_aplicar sem a chave);
//  • empresa suspensa fica fora.
//   node test/paridade/isolamento.js
process.env.TZ = 'America/Sao_Paulo';
const pg = require('./pg_base');
const { carregarServidor, chamarRpc } = require('./rodar');
const results = []; const ok = (c, m) => { results.push(!!c); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const EMP2 = '22222222-0000-4000-8000-000000000002', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333';
const erroDe = async p => { try { const r = await p; return r && r.__error ? r.message : ''; } catch (e) { return e.message; } };
const sqlErro = q => { try { pg.psql(q); return ''; } catch (e) { return e.message; } };

(async () => {
  await pg.subir();
  try {
    pg.psql(`insert into public.app_controle (empresa_id, versao_schema, revisao) values ('${pg.EMP}', '4.6.0', 'r0');
      insert into public.empresas (id, nome, slug, status) values ('${EMP2}', 'Malharia Dois', 'dois', 'ATIVA');
      insert into public.app_controle (empresa_id, versao_schema, revisao) values ('${EMP2}', '4.6.0', 'r0');
      insert into auth.users values ('${U2}', 'bruno@dois.com'), ('${U3}', 'oper@gut.com');
      insert into public.usuarios_empresa (user_id, empresa_id, papel, nome, email) values ('${U2}', '${EMP2}', 'DONO', 'Bruno', 'bruno@dois.com');
      insert into public.usuarios_empresa (user_id, empresa_id, papel, nome, email, permissoes) values ('${U3}', '${pg.EMP}', 'OPERADOR', 'Oper', 'oper@gut.com', '{"producao":"editar","cadastros":"ver"}');`);
    const carla = await carregarServidor(), bruno = await carregarServidor({ uid: U2 }), oper = await carregarServidor({ uid: U3 });
    let k = 0; const rid = () => 'req-isolamento-' + String(++k).padStart(6, '0');

    // dados da GUT (pela dona)
    const r1 = await carla.pedir('salvarCadastro', ['cor', { COR: 'AZUL GUT' }], { requestId: rid() });
    ok(r1.ok, 'dona da GUT grava normalmente');
    // empresa 2 não enxerga a GUT
    const c2 = await bruno.pedir('getCadastros', [], {}, 'dois');
    ok(!c2.__error && !(c2.cores || []).length, 'empresa 2 lê só os próprios dados (nenhuma cor da GUT)');
    ok(/não tem acesso/.test(await erroDe(bruno.pedir('getCadastros', [], {}, 'gut'))), 'empresa 2 não lê a GUT pelo servidor');
    ok(/não tem acesso/.test(await erroDe(bruno.pedir('salvarCadastro', ['cor', { COR: 'INVASORA' }], { requestId: rid() }, 'gut'))), 'empresa 2 não grava na GUT pelo servidor');
    const r2 = await bruno.pedir('salvarCadastro', ['cor', { COR: 'VERDE DOIS' }], { requestId: rid() }, 'dois');
    ok(r2.ok && pg.psql(`select string_agg(cor, ',' order by cor) from cad_cores where empresa_id = '${EMP2}'`) === 'VERDE DOIS', 'empresa 2 grava na própria empresa');
    const cg = await carla.pedir('getCadastros', [], {});
    ok(!(cg.cores || []).some(c => c.COR === 'VERDE DOIS'), 'a GUT não enxerga a empresa 2');
    ok(pg.psql(`select count(*) from sequencias where empresa_id = '${EMP2}'`) === pg.psql(`select count(*) from sequencias where empresa_id = '${EMP2}'`), 'numerações separadas por empresa');

    // permissões por módulo
    ok(/permissão para alterar em cadastros/.test(await erroDe(oper.pedir('salvarCadastro', ['cor', { COR: 'X' }], { requestId: rid() }))), 'operador sem "editar cadastros" não cadastra');
    ok(/permissão para ver em financeiro/.test(await erroDe(oper.pedir('getFinanceiroFaccao', [], {}))), 'operador sem financeiro não vê o financeiro das facções');
    ok(/permissão para alterar em financeiro/.test(await erroDe(oper.pedir('registrarPagamentoFaccao', [{}], { requestId: rid() }))), 'operador não lança pagamento');
    const j = await oper.pedir('registrarJornada', [{ DATA: '2026-11-12', ID_OPERADOR: 'x', MINUTOS_PREVISTOS: 480 }], { requestId: rid() });
    ok(!/permissão/.test(j.message || ''), 'operador com "editar produção" passa da permissão (a regra do sistema decide o resto): ' + (j.message || 'ok'));
    ok(!(await oper.pedir('getCadastros', [], {})).__error, 'operador lê as telas gerais');

    // o navegador não grava direto
    ok(/permission denied/.test(sqlErro(pg.comoUsuario(`insert into public.cad_cores (empresa_id, id_cor, cor) values ('${pg.EMP}', 'x', 'DIRETO');`))), 'gravar direto na tabela (REST) é recusado');
    ok(/permission denied/.test(sqlErro(pg.comoUsuario(`update public.cad_cores set cor = 'MUDEI';`))), 'alterar direto na tabela é recusado');
    ok(/permission denied/.test(sqlErro(pg.comoUsuario(`select public.web_aplicar('gut', '[]'::jsonb);`))), 'web_aplicar não pode mais ser chamado pelo navegador');
    let e1 = ''; try { chamarRpc('gut', 'servidor_aplicar', { p_slug: 'gut', p_ops: [{ t: 'cad_cores', ins: [{ id_cor: 'y', cor: 'SEM CHAVE' }] }], p_acao: 'salvarCadastro', p_chave: 'chute' }); } catch (e) { e1 = e.message; }
    ok(/só pode ser feita pelo servidor/.test(e1), 'servidor_aplicar sem a chave do servidor é recusado');
    e1 = ''; try { chamarRpc('gut', 'servidor_ler', { p_slug: 'gut', p_tabelas: ['cad_cores'], p_acao: 'getCadastros', p_chave: '' }); } catch (e) { e1 = e.message; }
    ok(/só pode ser feita pelo servidor/.test(e1), 'servidor_ler sem a chave é recusado');
    ok(/permission denied/.test(sqlErro(pg.comoUsuario(`select public.servidor_obter_chave();`))), 'o navegador não consegue pegar a chave do servidor');
    ok(pg.psql(`select count(*) from cad_cores where cor in ('DIRETO','SEM CHAVE','INVASORA','X')`) === '0', 'nada do que foi recusado chegou ao banco');
    ok(pg.comoUsuario && pg.psql(pg.comoUsuario(`select count(*) from public.cad_cores;`)).split('\n').pop() === '1', 'leitura direta (RLS) continua só da própria empresa');

    // máquinas (gut_021/022): o mesmo acesso em outro computador fica BLOQUEADO até o primeiro sair ou ficar 5 min sem uso
    const rpcU = (fn, a, uid = pg.USER) => chamarRpc('gut', fn, a, uid);
    const DISP_B = 'maquina-de-teste-0002', DISP_C = 'maquina-de-teste-0003';
    ok(pg.psql(`select maquinas_dono from public.empresas where id = '${pg.EMP}'`) === '1', 'padrão: 1 computador por acesso, também para o dono');
    const semEntrar = await carregarServidor({ dispositivo: DISP_B, entrar: false });
    const rM = await semEntrar.pedir('getCadastros', [], {});
    ok(rM.__error && rM.maquina && /não está liberado nesta máquina/.test(rM.message), 'computador que não entrou é barrado pelo servidor');
    const tenta = rpcU('web_maquina_entrar', { p_slug: 'gut', p_dispositivo: DISP_B, p_nome: 'Notebook', p_assumir: false });
    ok(tenta.ok === false && tenta.bloqueado && tenta.em_uso.length === 1 && tenta.em_uso[0].nome === 'Teste' && tenta.libera_em_min >= 1, 'segundo computador fica bloqueado e vê onde o acesso está aberto');
    ok(rpcU('web_maquina_entrar', { p_slug: 'gut', p_dispositivo: DISP_B, p_nome: 'Notebook', p_assumir: true }).ok === false, 'nem pedindo para assumir: o primeiro computador não é derrubado');
    ok(!(await carla.pedir('getCadastros', [], {}, 'gut', 'maquina-de-teste-0001')).__error, 'o primeiro computador continua funcionando');
    ok(pg.psql(`select count(*) from auditoria where acao = 'MAQUINA_BLOQUEADA'`) === '2', 'tentativas bloqueadas ficam na auditoria');
    rpcU('web_maquina_sair', { p_slug: 'gut', p_dispositivo: 'maquina-de-teste-0001' });
    ok(rpcU('web_maquina_entrar', { p_slug: 'gut', p_dispositivo: DISP_B, p_nome: 'Notebook', p_assumir: false }).ok, 'depois que o primeiro sai, o segundo entra');
    ok(!(await semEntrar.pedir('getCadastros', [], {})).__error && (await carla.pedir('getCadastros', [], {}, 'gut', 'maquina-de-teste-0001')).maquina, 'agora o segundo funciona e o primeiro não');
    pg.psql(`update private.sessoes_maquina set ultimo_uso = now() - interval '6 minutes' where dispositivo = '${DISP_B}' and ativo;`);
    ok(rpcU('web_maquina_entrar', { p_slug: 'gut', p_dispositivo: DISP_C, p_nome: 'Celular', p_assumir: false }).ok, 'computador parado há mais de 5 min libera o acesso sozinho');
    ok((await semEntrar.pedir('getCadastros', [], {})).maquina, 'e o parado, ao voltar, fica bloqueado');
    pg.psql(`update public.empresas set maquinas_dono = 2 where id = '${pg.EMP}';`);
    ok(rpcU('web_maquina_entrar', { p_slug: 'gut', p_dispositivo: DISP_B, p_nome: 'Notebook', p_assumir: false }).ok, 'com limite 2, o segundo computador entra');
    ok(rpcU('web_maquina_sair', { p_slug: 'gut', p_dispositivo: DISP_C }).ok && (await carla.pedir('getCadastros', [], {}, 'gut', DISP_C)).maquina, 'sair libera a vaga e o computador deixa de funcionar');
    ok(/permission denied/.test(sqlErro(pg.comoUsuario(`select count(*) from private.sessoes_maquina;`))), 'o navegador não vê a lista de máquinas direto');
    ok(/administrador/.test(sqlErro(pg.comoUsuario(`select public.gestao_maquinas('${pg.EMP}');`))), 'só o administrador lista e desconecta máquinas no app de gestão');
    // limite de acessos da empresa e vincular usuário só pelo servidor (correção de segurança)
    ok(/permission denied/.test(sqlErro(pg.comoUsuario(`select public.gestao_vincular('${EMP2}', '${pg.USER}', 'carla@gut.com', 'Carla', 'DONO', '{}');`))), 'ninguém logado consegue se vincular a outra empresa (só o servidor de convites)');
    pg.psql(`update public.empresas set limite_usuarios = 1 where id = '${EMP2}';`);
    ok(/1 acessos do plano/.test(sqlErro(`select public.gestao_vincular('${EMP2}', '${U3}', 'oper@gut.com', 'Oper', 'OPERADOR', '{}');`)), 'empresa com limite de 1 acesso não aceita o segundo');
    pg.psql(`update public.empresas set limite_usuarios = 2 where id = '${EMP2}';`);
    ok(!sqlErro(`select public.gestao_vincular('${EMP2}', '${U3}', 'oper@gut.com', 'Oper', 'OPERADOR', '{}');`), 'com limite 2, o segundo acesso entra');
    pg.psql(`delete from public.usuarios_empresa where user_id = '${U3}' and empresa_id = '${EMP2}'; update public.empresas set limite_usuarios = null where id = '${EMP2}';`);

    // empresa suspensa: fica fora do sistema (regra atual do web_empresa; "só consulta" é decisão da etapa C)
    pg.psql(`update public.empresas set status = 'SUSPENSA' where id = '${EMP2}';`);
    ok(/suspensa/.test(await erroDe(bruno.pedir('salvarCadastro', ['cor', { COR: 'NOVA' }], { requestId: rid() }, 'dois'))), 'empresa suspensa não grava');
    ok(/suspensa/.test(await erroDe(bruno.pedir('getCadastros', [], {}, 'dois'))), 'empresa suspensa não entra');
  } finally { pg.descer(true); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); pg.descer(true); process.exit(2); });
