-- gut_034 — Baixa completa sem senha do supervisor — v4.43.0
-- Pedido de 24/11: a baixa completa não pede mais senha. Quando há operação sem funcionário, a tela mostra um aviso (⚠)
-- e pede confirmação; os minutos dessas operações continuam indo para a "produção da empresa" (id_operador = 'EMPRESA').
-- p_senha fica na assinatura só por compatibilidade e é ignorado. A tabela da senha do supervisor fica sem uso.

create or replace function public.web_baixa_caixas(p_slug text, p_cupons text[], p_senha text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; c public.cupons_producao; v_agora timestamptz := now(); v_quem text; st text; n_sem int := 0; r_min numeric;
  tot_ops int := 0; tot_min numeric := 0; emp_ops int := 0; emp_min numeric := 0; por jsonb := '{}'::jsonb; v_op text; v_nome text; vols text[] := '{}';
  v public.volumes; t int; f int; v_id text; v_pausa numeric;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.servidor_exige(v_emp, 'registrarApontamentosDiretosEmLote', true);
  if coalesce(array_length(p_cupons, 1), 0) = 0 then raise exception 'Nenhuma operação pendente nas caixas escolhidas.'; end if;
  if array_length(p_cupons, 1) > 3000 then raise exception 'Escolha menos caixas de uma vez (no máximo 3000 operações).'; end if;
  perform private.campo_trava(v_emp);
  v_quem := 'baixa-completa:' || coalesce(private.meu_email(), 'sistema');
  for c in select * from public.cupons_producao x where x.empresa_id = v_emp and x.id_cupom = any (p_cupons)
             and upper(coalesce(x.status_cupom,'')) not in ('CONCLUIDO','CANCELADO','ESTORNADO') order by x.id_volume, x.ordem_processo loop
    if exists (select 1 from public.apontamentos_producao a where a.empresa_id = v_emp and a.id_cupom = c.id_cupom and upper(coalesce(a.status,'VALIDO')) <> 'CANCELADO') then
      update public.cupons_producao set status_cupom = 'CONCLUIDO', atualizado_em = now() where empresa_id = v_emp and id_cupom = c.id_cupom;   -- já tinha apontamento
      continue;
    end if;
    if upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and coalesce(c.id_operador_marcacao,'') <> '' then
      v_op := c.id_operador_marcacao;
      v_pausa := coalesce(c.segundos_pausa,0) + case when c.pausado_em is not null then greatest(0, extract(epoch from (v_agora - c.pausado_em))) else 0 end;
      r_min := private.baixa_ponto(c, v_op, 'MARCACAO', c.data_hora_inicio_marcacao, v_agora, v_pausa, v_quem, 'Baixa completa da caixa');
    else
      select o.id_operador into v_op from public.cad_operadores o where o.empresa_id = v_emp and o.id_operador = c.id_operador_alocado
         and upper(coalesce(o.ativo::text,'TRUE')) not in ('FALSE','0','NAO','NÃO','INATIVO');
      if v_op is null then v_op := 'EMPRESA'; end if;
      r_min := private.baixa_ponto(c, v_op, 'APONTAMENTO', null, v_agora, null, v_quem,
                 case when v_op = 'EMPRESA' then 'Baixa completa sem funcionário (produção da empresa)' else 'Baixa completa da caixa' end);
    end if;
    tot_ops := tot_ops + 1; tot_min := tot_min + coalesce(r_min, 0);
    if v_op = 'EMPRESA' then emp_ops := emp_ops + 1; emp_min := emp_min + coalesce(r_min, 0);
    else
      por := jsonb_set(por, array[v_op], jsonb_build_object('ops', coalesce((por -> v_op ->> 'ops')::int, 0) + 1, 'min', coalesce((por -> v_op ->> 'min')::numeric, 0) + coalesce(r_min, 0)));
    end if;
    if not (c.id_volume = any (vols)) then vols := vols || c.id_volume; end if;
    v_op := null;
  end loop;
  -- andamento das caixas
  foreach v_id in array vols loop
    select * into v from public.volumes where empresa_id = v_emp and id_volume = v_id;
    if found and upper(coalesce(v.status_volume,'')) <> 'EM_ESTOQUE_PA' and upper(coalesce(v.tipo_local_atual,'')) <> 'ESTOQUE_PA' then
      select count(*), count(*) filter (where upper(coalesce(x.status_cupom,'')) = 'CONCLUIDO') into t, f from public.cupons_producao x where x.empresa_id = v_emp and x.id_volume = v_id;
      if t > 0 then
        update public.volumes set id_processo_atual = null, status_volume = case when f >= t then 'CONCLUIDO_INTERNO' else 'EM_PRODUCAO_INTERNA' end, atualizado_em = now()
          where empresa_id = v_emp and id_volume = v_id;
        update public.remessas set atualizado_em = now() where empresa_id = v_emp and id_remessa in
          (select i.id_remessa from public.remessa_itens i where i.empresa_id = v_emp and i.id_volume = coalesce(nullif(v.id_volume_origem,''), v.id_volume));
      end if;
    end if;
  end loop;
  perform private.web_audita(v_emp, 'BAIXA_COMPLETA', 'cupons_producao', array_to_string(vols, ','), null,
    jsonb_build_object('operacoes', tot_ops, 'minutos', private.r2(tot_min), 'empresa_ops', emp_ops, 'empresa_min', private.r2(emp_min)), 'baixa completa da caixa');
  perform private.toca_revisao(v_emp);
  return jsonb_build_object('ok', true, 'operacoes', tot_ops, 'minutos', private.r2(tot_min), 'empresa_ops', emp_ops, 'empresa_min', private.r2(emp_min), 'volumes', to_jsonb(vols),
    'por_funcionario', coalesce((select jsonb_agg(jsonb_build_object('id', k, 'nome', coalesce(o.nome, k), 'ops', (x ->> 'ops')::int, 'min', private.r2((x ->> 'min')::numeric)) order by o.nome)
                                   from jsonb_each(por) e(k, x) left join public.cad_operadores o on o.empresa_id = v_emp and o.id_operador = e.k), '[]'::jsonb));
end $$;
