-- gut_013 — Excluir lote (corte) em cadeia, direto no banco, a partir do sistema web.
-- Regra: o que já foi colocado para facção (está em remessa de facção, está na facção ou tem retorno) fica intacto,
-- junto com os volumes "pai" e "filho" dele. Todo o resto da cadeia do lote é apagado:
--   • nada foi para facção  -> apaga o lote inteiro (corte, estoque de corte, volumes, cupons, apontamentos, remessas
--     internas, movimentações) e devolve a matéria-prima baixada ao estoque;
--   • parte foi para facção -> apaga só os volumes que não saíram e o saldo ainda não volumado; o lote continua existindo
--     com o que está na facção (a baixa de matéria-prima é mantida).

create or replace function private.corte_exclusao(p_emp uuid, p_corte text, p_executar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record; v_est text[]; v_todos text[]; v_prot text[]; v_del text[]; v_cup text[]; v_ritem text[]; v_rem text[];
  v_cresc boolean := true; v_n int; v_modo text; r jsonb; v_lote text; k record; v_agora timestamptz := now();
begin
  select * into c from public.pedidos_corte where empresa_id = p_emp and id_corte = p_corte;
  if not found then raise exception 'Lote/corte não encontrado.'; end if;
  v_lote := coalesce(c.lote_corte, '');
  select coalesce(array_agg(id_estoque_corte), '{}') into v_est from public.estoque_corte where empresa_id = p_emp and id_corte = p_corte;

  -- todos os volumes da cadeia (inclui filhos de fracionamento e de retrabalho)
  select coalesce(array_agg(distinct id), '{}') into v_todos from (
    select id_volume id from public.volume_itens where empresa_id = p_emp and id_estoque_corte = any(v_est)
    union select id_volume from public.volumes where empresa_id = p_emp and id_estoque_corte = any(v_est)) s;
  while v_cresc loop
    select coalesce(array_agg(distinct id_volume), '{}') into v_del from public.volumes
      where empresa_id = p_emp and (id_volume_origem = any(v_todos) or id_volume_origem_retrabalho = any(v_todos)) and not (id_volume = any(v_todos));
    v_cresc := cardinality(v_del) > 0; v_todos := v_todos || v_del;
  end loop;

  -- o que já saiu para facção
  select coalesce(array_agg(distinct id), '{}') into v_prot from (
    select v.id_volume id from public.volumes v where v.empresa_id = p_emp and v.id_volume = any(v_todos)
      and (upper(coalesce(v.tipo_local_atual,'')) = 'FACCAO' or coalesce(v.id_volume_origem_retrabalho,'') <> '')
    union select i.id_volume from public.remessa_itens i join public.remessas x on x.empresa_id = i.empresa_id and x.id_remessa = i.id_remessa
      where i.empresa_id = p_emp and i.id_volume = any(v_todos) and upper(coalesce(x.tipo_destino,'')) = 'FACCAO'
    union select id_volume from public.retornos_externos where empresa_id = p_emp and id_volume = any(v_todos)) s;
  -- protege também pais e filhos de quem saiu
  v_cresc := cardinality(v_prot) > 0;
  while v_cresc loop
    select coalesce(array_agg(distinct id), '{}') into v_del from (
      select id_volume_origem id from public.volumes where empresa_id = p_emp and id_volume = any(v_prot) and coalesce(id_volume_origem,'') <> ''
      union select id_volume from public.volumes where empresa_id = p_emp and (id_volume_origem = any(v_prot) or id_volume_origem_retrabalho = any(v_prot))) s
      where id = any(v_todos) and not (id = any(v_prot));
    v_cresc := cardinality(v_del) > 0; v_prot := v_prot || v_del;
  end loop;

  select coalesce(array_agg(id), '{}') into v_del from unnest(v_todos) id where not (id = any(v_prot));
  v_modo := case when cardinality(v_prot) = 0 then 'TOTAL' else 'PARCIAL' end;
  select coalesce(array_agg(id_cupom), '{}') into v_cup from public.cupons_producao where empresa_id = p_emp and id_volume = any(v_del);
  select coalesce(array_agg(id_item_remessa), '{}'), coalesce(array_agg(distinct id_remessa), '{}') into v_ritem, v_rem
    from public.remessa_itens where empresa_id = p_emp and id_volume = any(v_del);

  r := jsonb_build_object(
    'modo', v_modo, 'lote', v_lote,
    'volumesNaFaccao', (select count(*) from public.volumes where empresa_id = p_emp and id_volume = any(v_prot) and coalesce(id_volume_origem,'') = ''),
    'pecasNaFaccao', (select coalesce(sum(qtd_volume),0) from public.volumes where empresa_id = p_emp and id_volume = any(v_prot) and coalesce(id_volume_origem,'') = ''),
    'cortes', case when v_modo = 'TOTAL' then 1 else 0 end,
    'estoqueCorte', case when v_modo = 'TOTAL' then cardinality(v_est) else 0 end,
    'saldoNaoVolumado', (select coalesce(sum(greatest(0, coalesce(qtd_cortada,0) - coalesce(qtd_volumada,0))),0) from public.estoque_corte where empresa_id = p_emp and id_estoque_corte = any(v_est)),
    'volumes', cardinality(v_del),
    'cupons', cardinality(v_cup),
    'apontamentos', (select count(*) from public.apontamentos_producao where empresa_id = p_emp and (id_volume = any(v_del) or id_cupom = any(v_cup))),
    'itensRemessa', cardinality(v_ritem),
    'remessas', cardinality(v_rem),
    'movimentosLogisticos', (select count(*) from public.movimentacoes where empresa_id = p_emp and (id_volume = any(v_del) or (v_modo = 'TOTAL' and id_estoque_corte = any(v_est)))),
    'consumosMateriais', case when v_modo = 'TOTAL' then (select count(*) from public.corte_consumos where empresa_id = p_emp and id_corte = p_corte) else 0 end,
    'financeiro', (select count(*) from public.financeiro_faccao where empresa_id = p_emp and id_volume = any(v_del)));
  if not p_executar then return r; end if;

  -- ===== execução =====
  -- volumes mistos: devolve o volumado de sublotes de OUTROS lotes que estavam em volumes apagados
  for k in select vi.id_estoque_corte, sum(vi.qtd_item) q from public.volume_itens vi join public.volumes v on v.empresa_id = vi.empresa_id and v.id_volume = vi.id_volume
           where vi.empresa_id = p_emp and vi.id_volume = any(v_del) and coalesce(v.id_volume_origem,'') = '' and not (vi.id_estoque_corte = any(v_est)) group by 1 loop
    update public.estoque_corte e set qtd_volumada = greatest(0, coalesce(e.qtd_volumada,0) - k.q),
      saldo_disponivel = greatest(0, coalesce(e.qtd_cortada,0) - greatest(0, coalesce(e.qtd_volumada,0) - k.q)),
      status_estoque = case when greatest(0, coalesce(e.qtd_volumada,0) - k.q) <= 0 then 'DISPONIVEL'
                            when coalesce(e.qtd_cortada,0) - greatest(0, coalesce(e.qtd_volumada,0) - k.q) <= 0 then 'TOTALMENTE_VOLUMADO' else 'PARCIALMENTE_VOLUMADO' end,
      atualizado_em = v_agora
    where e.empresa_id = p_emp and e.id_estoque_corte = k.id_estoque_corte;
  end loop;

  -- indicadores dos operadores afetados (recalculados depois de apagar)
  create temp table if not exists _corte_ind(id_operador text, dia date) on commit drop;
  delete from _corte_ind;
  insert into _corte_ind select distinct id_operador, coalesce(data_producao, (data_hora at time zone 'America/Sao_Paulo')::date)
    from public.apontamentos_producao where empresa_id = p_emp and (id_volume = any(v_del) or id_cupom = any(v_cup)) and coalesce(id_operador,'') <> '';

  delete from public.apontamentos_producao where empresa_id = p_emp and (id_volume = any(v_del) or id_cupom = any(v_cup));
  delete from public.planejamento_carga where empresa_id = p_emp and (id_volume = any(v_del) or id_cupom = any(v_cup));
  delete from public.cupons_producao where empresa_id = p_emp and id_volume = any(v_del);
  delete from public.bipagens_externas where empresa_id = p_emp and (id_volume = any(v_del) or id_item_remessa = any(v_ritem));
  delete from public.financeiro_faccao where empresa_id = p_emp and id_volume = any(v_del);
  delete from public.faccao_avisos where empresa_id = p_emp and id_volume = any(v_del);
  delete from public.retorno_volume_itens where empresa_id = p_emp and id_volume = any(v_del);
  delete from public.retornos_externos where empresa_id = p_emp and id_volume = any(v_del);
  delete from public.remessa_itens where empresa_id = p_emp and id_item_remessa = any(v_ritem);
  -- remessas que ficaram vazias saem; as outras têm os totais refeitos
  delete from public.remessas x where x.empresa_id = p_emp and x.id_remessa = any(v_rem)
    and not exists (select 1 from public.remessa_itens i where i.empresa_id = p_emp and i.id_remessa = x.id_remessa);
  update public.remessas x set qtd_volumes = s.nv, qtd_total = s.tot, qtd_retornada = s.ret, qtd_pendente = greatest(0, s.tot - s.ret),
      valor_total_remessa = round(s.val, 2), status_retorno = case when s.tot - s.ret <= 0 then 'CONCLUIDO' when s.ret > 0 then 'PARCIAL' else 'PENDENTE' end, atualizado_em = v_agora
    from (select id_remessa, count(*) nv, sum(coalesce(qtd_enviada,0)) tot, sum(coalesce(qtd_retornada,0)) ret, sum(coalesce(valor_total_item,0)) val
          from public.remessa_itens where empresa_id = p_emp and id_remessa = any(v_rem) group by 1) s
    where x.empresa_id = p_emp and x.id_remessa = s.id_remessa;
  delete from public.movimentacoes where empresa_id = p_emp and (id_volume = any(v_del) or (v_modo = 'TOTAL' and id_estoque_corte = any(v_est)));

  -- pais mantidos que perderam filhos: refaz o status de fracionamento
  update public.volumes p set status_volume = case when greatest(0, coalesce(p.qtd_volume,0) - s.fr) <= 0 then 'FRACIONADO_COMPLETO' when s.fr > 0 then 'FRACIONAMENTO_PARCIAL' else 'AGUARDANDO_FRACIONAMENTO' end, atualizado_em = v_agora
    from (select pp.id_volume, coalesce((select sum(f.qtd_volume) from public.volumes f where f.empresa_id = p_emp and f.id_volume_origem = pp.id_volume and not (f.id_volume = any(v_del))),0) fr
          from public.volumes pp where pp.empresa_id = p_emp and not (pp.id_volume = any(v_del))
           and pp.id_volume in (select id_volume_origem from public.volumes where empresa_id = p_emp and id_volume = any(v_del))) s
    where p.empresa_id = p_emp and p.id_volume = s.id_volume;

  -- separações
  update public.separacoes_volume sp set qtd_volumes = s.nv, qtd_total = s.tot, status_separacao = 'PARCIAL'
    from (select id_separacao, count(*) filter (where not (id_volume = any(v_del))) nv, sum(qtd_volume) filter (where not (id_volume = any(v_del))) tot
          from public.volumes where empresa_id = p_emp and id_separacao in (select id_separacao from public.volumes where empresa_id = p_emp and id_volume = any(v_del)) group by 1) s
    where sp.empresa_id = p_emp and sp.id_separacao = s.id_separacao and s.nv > 0;
  delete from public.separacoes_volume sp where sp.empresa_id = p_emp
    and sp.id_separacao in (select id_separacao from public.volumes where empresa_id = p_emp and id_volume = any(v_del))
    and not exists (select 1 from public.volumes v where v.empresa_id = p_emp and v.id_separacao = sp.id_separacao and not (v.id_volume = any(v_del)));

  delete from public.volume_itens where empresa_id = p_emp and id_volume = any(v_del);
  delete from public.volumes where empresa_id = p_emp and id_volume = any(v_del);

  if v_modo = 'TOTAL' then
    -- devolve a matéria-prima baixada pelo corte
    for k in select id_material, id_lote, id_local_estoque, sum(coalesce(qtd_baixada,0)) q from public.corte_consumos
             where empresa_id = p_emp and id_corte = p_corte group by 1,2,3 having sum(coalesce(qtd_baixada,0)) > 0 loop
      insert into public.mov_estoque (empresa_id, id_mov_estoque, data_hora, tipo_mov, id_material, id_lote, id_local_estoque, qtd_mov, saldo_antes, saldo_depois,
        custo_unitario, tipo_origem, id_origem, id_corte, id_usuario, observacao, lote_corte)
      select p_emp, gen_random_uuid()::text, v_agora, 'ESTORNO_EXCLUSAO_CORTE', k.id_material, k.id_lote, k.id_local_estoque, k.q,
        coalesce(s.qtd_disponivel,0), coalesce(s.qtd_disponivel,0) + k.q, s.custo_medio_unit, 'EXCLUSAO_CORTE', p_corte, '', private.meu_email(),
        'Estorno automático pela exclusão em cadeia do lote ' || v_lote, v_lote
      from (select 1) z left join public.estoque_saldos s on s.empresa_id = p_emp and s.id_material = k.id_material and s.id_lote = k.id_lote and s.id_local_estoque = k.id_local_estoque;
      update public.estoque_saldos set qtd_disponivel = coalesce(qtd_disponivel,0) + k.q, status_saldo = 'DISPONIVEL', atualizado_em = v_agora
        where empresa_id = p_emp and id_material = k.id_material and id_lote = k.id_lote and id_local_estoque = k.id_local_estoque;
      update public.estoque_lotes set qtd_atual = coalesce(qtd_atual,0) + k.q, status_lote = 'DISPONIVEL', atualizado_em = v_agora
        where empresa_id = p_emp and id_lote = k.id_lote;
    end loop;
    delete from public.corte_consumos where empresa_id = p_emp and id_corte = p_corte;
    delete from public.estoque_corte where empresa_id = p_emp and id_corte = p_corte;
    delete from public.pedidos_corte where empresa_id = p_emp and id_corte = p_corte;
  else
    -- fica só o que está na facção: o saldo não volumado deixa de existir
    update public.estoque_corte e set qtd_cortada = s.vol, qtd_volumada = s.vol, saldo_disponivel = 0, status_estoque = 'TOTALMENTE_VOLUMADO', atualizado_em = v_agora
      from (select ee.id_estoque_corte, coalesce((select sum(vi.qtd_item) from public.volume_itens vi join public.volumes v on v.empresa_id = vi.empresa_id and v.id_volume = vi.id_volume
               where vi.empresa_id = p_emp and vi.id_estoque_corte = ee.id_estoque_corte and coalesce(v.id_volume_origem,'') = ''),0) vol
            from public.estoque_corte ee where ee.empresa_id = p_emp and ee.id_estoque_corte = any(v_est)) s
      where e.empresa_id = p_emp and e.id_estoque_corte = s.id_estoque_corte;
    delete from public.estoque_corte where empresa_id = p_emp and id_estoque_corte = any(v_est) and coalesce(qtd_cortada,0) <= 0;
    update public.pedidos_corte set qtd_total_cortada = (select coalesce(sum(qtd_cortada),0) from public.estoque_corte where empresa_id = p_emp and id_corte = p_corte),
      observacao = trim(both ' ' from coalesce(observacao,'') || ' [Exclusão parcial em ' || to_char(v_agora at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') || ': ficou só o que foi para facção]'),
      atualizado_em = v_agora
      where empresa_id = p_emp and id_corte = p_corte;
  end if;

  -- refaz os indicadores diários dos operadores afetados
  update public.indicador_diario i set minutos_entregues = s.me, qtd_cupons = s.n, qtd_apontamentos = s.n, qtd_pecas_apontadas = s.pc,
      eficiencia_pct = case when coalesce(i.minutos_disponiveis,0) > 0 then round(s.me / i.minutos_disponiveis * 100, 2) else 0 end, atualizado_em = v_agora
    from (select a.id_operador, a.dia,
            coalesce((select round(sum(coalesce(x.minutos_entregues,0)),2) from public.apontamentos_producao x where x.empresa_id = p_emp and x.id_operador = a.id_operador
               and coalesce(x.data_producao, (x.data_hora at time zone 'America/Sao_Paulo')::date) = a.dia and upper(coalesce(x.status,'VALIDO')) <> 'CANCELADO'),0) me,
            (select count(*) from public.apontamentos_producao x where x.empresa_id = p_emp and x.id_operador = a.id_operador
               and coalesce(x.data_producao, (x.data_hora at time zone 'America/Sao_Paulo')::date) = a.dia and upper(coalesce(x.status,'VALIDO')) <> 'CANCELADO') n,
            coalesce((select sum(coalesce(x.qtd_apontada,0)) from public.apontamentos_producao x where x.empresa_id = p_emp and x.id_operador = a.id_operador
               and coalesce(x.data_producao, (x.data_hora at time zone 'America/Sao_Paulo')::date) = a.dia and upper(coalesce(x.status,'VALIDO')) <> 'CANCELADO'),0) pc
          from _corte_ind a) s
    where i.empresa_id = p_emp and i.id_operador = s.id_operador and i.data = s.dia;

  insert into public.auditoria (empresa_id, id_log, data_hora, id_usuario, acao, tabela, id_registro, dados_antes, dados_depois, observacao)
    values (p_emp, gen_random_uuid()::text, v_agora, private.meu_email(), case when v_modo = 'TOTAL' then 'EXCLUIR_CORTE_CASCATA' else 'EXCLUIR_CORTE_PARCIAL' end,
            'PEDIDOS_CORTE', p_corte, '', r::text, 'sistema web');
  perform private.toca_revisao(p_emp);
  return r;
end $$;

create or replace function public.web_corte_exclusao_previa(p_slug text, p_id_corte text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  r := private.corte_exclusao(v_emp, p_id_corte, false);
  return r || jsonb_build_object('token', md5(r::text), 'bloqueado', (r->>'modo') = 'PARCIAL' and (r->>'volumes')::int = 0 and (r->>'saldoNaoVolumado')::numeric <= 0);
end $$;

create or replace function public.web_corte_excluir(p_slug text, p_id_corte text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.campo_trava(v_emp);
  r := private.corte_exclusao(v_emp, p_id_corte, false);
  if md5(r::text) <> coalesce(p_token,'') then raise exception 'Os vínculos do lote mudaram desde a prévia. Abra a exclusão de novo para conferir.'; end if;
  if (r->>'modo') = 'PARCIAL' and (r->>'volumes')::int = 0 and (r->>'saldoNaoVolumado')::numeric <= 0 then
    raise exception 'Todo este lote já foi para facção. Não há nada para excluir.'; end if;
  return private.corte_exclusao(v_emp, p_id_corte, true);
end $$;

revoke all on function private.corte_exclusao(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.web_corte_exclusao_previa(text, text) from public, anon;
revoke all on function public.web_corte_excluir(text, text, text) from public, anon;
grant execute on function public.web_corte_exclusao_previa(text, text) to authenticated;
grant execute on function public.web_corte_excluir(text, text, text) to authenticated;
