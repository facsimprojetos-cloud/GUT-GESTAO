-- gut_015 — Painéis de TV (1. Peças prontas, 2. Produção, 3. Produção em tela cheia)
-- Uma leitura só, direto do banco, para o usuário logado no Supabase Auth (sem passar pelo Apps Script).
-- O navegador (site/sistema/paineis-tv.js) faz as contas de meta, eficiência, prontas e ranking.
--
--   web_paineis_tv(slug, inicio, fim) → {
--     hoje, agora, limite_revisar,
--     operadores[], produtos[], processos[], setores[],
--     roteiro[]      : sequência operacional ativa (produto, processo, ordem, tempo padrão, final)
--     apontamentos[] : apontamentos válidos do período, já com método, horários em SP e o selo FINAL
--     jornadas[]     : minutos disponíveis por funcionário e dia (jornada_operador)
--   }
--
-- "Pronta" = apontamento da última operação da sequência operacional cadastrada do produto
-- (maior ORDEM_PROCESSO entre as linhas ativas e vigentes de roteiro_produto).
-- O limite de "revisar tempo" vem do parâmetro TV_LIMITE_REVISAR (padrão 120%).

create or replace function public.web_paineis_tv(p_slug text, p_inicio date default null, p_fim date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini date;
  v_fim date;
  r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  v_ini := least(coalesce(p_inicio, v_hoje), coalesce(p_fim, p_inicio, v_hoje));
  v_fim := greatest(coalesce(p_inicio, v_hoje), coalesce(p_fim, p_inicio, v_hoje));
  if v_fim - v_ini > 92 then raise exception 'Escolha um período de até 93 dias.'; end if;

  with
  rot as (
    select r.id_roteiro, r.id_produto, r.id_processo, coalesce(r.ordem_processo, 0) as ordem,
           coalesce(r.tempo_padrao_seg_un, 0) as tp
      from public.roteiro_produto r
     where r.empresa_id = v_emp and coalesce(r.ativo, true)
       and (r.vigencia_fim is null or r.vigencia_fim > now())
  ),
  fim_prod as (
    select distinct on (id_produto) id_produto, ordem as ordem_final, id_processo as processo_final
      from rot order by id_produto, ordem desc
  ),
  ap as (
    select a.*, c.ordem_processo as c_ordem, c.id_roteiro as c_roteiro,
           coalesce(a.data_producao, (a.data_hora at time zone 'America/Sao_Paulo')::date) as dia
      from public.apontamentos_producao a
      left join public.cupons_producao c on c.empresa_id = a.empresa_id and c.id_cupom = a.id_cupom
     where a.empresa_id = v_emp
       and upper(coalesce(a.status, 'VALIDO')) <> 'CANCELADO'
       and coalesce(a.data_producao, (a.data_hora at time zone 'America/Sao_Paulo')::date) between v_ini and v_fim
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    'agora', now(),
    'inicio', v_ini,
    'fim', v_fim,
    'limite_revisar', coalesce((select nullif(private.web_num(p.valor, 0), 0) from public.app_parametros p
                                 where p.empresa_id = v_emp and p.chave = 'TV_LIMITE_REVISAR'), 120),
    'operadores', coalesce((select jsonb_agg(jsonb_build_object(
          'id', o.id_operador, 'nome', coalesce(nullif(o.nome, ''), o.id_operador), 'setor', o.id_setor_padrao,
          'min_dia', coalesce(nullif(o.minutos_padrao_dia, 0), 540), 'ativo', coalesce(o.ativo, true)) order by o.nome)
        from public.cad_operadores o where o.empresa_id = v_emp), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id_produto, 'nome', coalesce(nullif(p.produto, ''), p.codigo_produto, p.id_produto), 'codigo', p.codigo_produto,
          'ativo', coalesce(p.ativo, true)) order by p.produto)
        from public.cad_produtos p where p.empresa_id = v_emp), '[]'::jsonb),
    'processos', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id_processo, 'nome', coalesce(nullif(p.processo, ''), p.id_processo), 'ativo', coalesce(p.ativo, true)) order by p.processo)
        from public.cad_processos p where p.empresa_id = v_emp), '[]'::jsonb),
    'setores', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id_setor, 'nome', coalesce(nullif(s.setor, ''), s.id_setor), 'ativo', coalesce(s.ativo, true)) order by s.setor)
        from public.cad_setores s where s.empresa_id = v_emp), '[]'::jsonb),
    'roteiro', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id_roteiro, 'produto', r.id_produto, 'processo', r.id_processo, 'ordem', r.ordem, 'tp', r.tp,
          'final', r.ordem = f.ordem_final) order by r.id_produto, r.ordem)
        from rot r join fim_prod f on f.id_produto = r.id_produto), '[]'::jsonb),
    'jornadas', coalesce((select jsonb_agg(jsonb_build_object(
          'operador', j.id_operador, 'data', j.data, 'disp', coalesce(j.minutos_disponiveis, 0)))
        from public.jornada_operador j
       where j.empresa_id = v_emp and j.data between v_ini and v_fim), '[]'::jsonb),
    'apontamentos', coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id_apontamento,
          'data', a.dia,
          'ts', to_char(coalesce(a.data_hora_fim, a.data_hora) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS'),
          'hora', to_char(coalesce(a.data_hora_fim, a.data_hora) at time zone 'America/Sao_Paulo', 'HH24:MI'),
          'inicio', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
          'fim', to_char(a.data_hora_fim at time zone 'America/Sao_Paulo', 'HH24:MI'),
          'operador', a.id_operador,
          'produto', a.id_produto,
          'processo', a.id_processo,
          'setor', coalesce(nullif(a.id_setor, ''), o.id_setor_padrao),
          'qtd', coalesce(a.qtd_apontada, 0),
          'tp', coalesce(a.tempo_padrao_seg_un, 0),
          'min_ent', coalesce(a.minutos_entregues, coalesce(a.segundos_entregues, 0) / 60.0),
          'min_real', coalesce(a.minutos_reais, coalesce(a.segundos_reais, 0) / 60.0),
          'eff_exec', a.eficiencia_execucao_pct,
          'metodo', case
             when upper(coalesce(a.tipo_apontamento, '')) = 'MARCACAO' or upper(coalesce(a.origem_bipagem, '')) like '%MARCACAO%' then 'MARCACAO'
             when upper(coalesce(a.tipo_apontamento, '')) = 'APONTAMENTO' or upper(coalesce(a.origem_bipagem, '')) like '%APONTAMENTO%' then 'APONTAMENTO'
             else 'CUPOM' end,
          'ordem', coalesce(a.c_ordem, rc.ordem),
          'final', case
             when f.id_produto is null then false
             when coalesce(a.c_ordem, rc.ordem) is not null then coalesce(a.c_ordem, rc.ordem) = f.ordem_final
             else a.id_processo = f.processo_final end
        ) order by coalesce(a.data_hora_fim, a.data_hora) desc)
        from ap a
        left join rot rc on rc.id_roteiro = a.c_roteiro
        left join fim_prod f on f.id_produto = a.id_produto
        left join public.cad_operadores o on o.empresa_id = v_emp and o.id_operador = a.id_operador), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.web_paineis_tv(text, date, date) from public, anon;
grant execute on function public.web_paineis_tv(text, date, date) to authenticated;
