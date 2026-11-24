-- gut_032 — Kanban de produtos (painel de TV 4): quantidade de cada produto / tamanho / cor em cada etapa, sem lotes — v4.41.0
-- Etapas: CORTE (saldo no estoque de corte, ainda não volumado) → VOLUMADO (aguardando destino) → DESTINO (destino definido)
--         → FACCAO (na facção) → INSPECAO (voltou da facção, aguardando inspeção) → INTERNA (produção interna) → EMBALAR (pronto para embalar).
-- O que foi para o estoque de PA sai do Kanban e aparece no histórico (últimos N dias).

create or replace function public.web_fluxo_produtos(p_slug text, p_dias_hist int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; v_desde timestamptz;
begin
  v_emp := private.web_empresa(p_slug);
  v_desde := now() - make_interval(days => least(greatest(coalesce(p_dias_hist, 30), 1), 365));
  return (
  with vol as (
    select v.id_volume, coalesce(v.qtd_volume, 0) q, e.id_produto, e.id_cor, e.id_tamanho, v.atualizado_em,
      case
        when upper(coalesce(v.status_volume,'')) in ('EM_ESTOQUE_PA') or upper(coalesce(v.tipo_local_atual,'')) = 'ESTOQUE_PA' then 'HIST'
        when upper(coalesce(v.status_volume,'')) in ('CONTINUACAO_GERADA','RETRABALHO_GERADO','BAIXADO_QUALIDADE','CANCELADO','CANCELADA') then null
        when upper(coalesce(v.status_volume,'')) in ('AGUARDANDO_DESTINO','CRIADO') then 'VOLUMADO'
        when upper(coalesce(v.status_volume,'')) in ('AGUARDANDO_ENVIO_FACCAO','AGUARDANDO_ENVIO') then 'DESTINO'
        when upper(coalesce(v.status_volume,'')) in ('EM_FACCAO','RETORNO_PARCIAL','RETORNO_PARCIAL_FACCAO') then 'FACCAO'
        when upper(coalesce(v.status_volume,'')) in ('AGUARDANDO_INSPECAO','RETORNADO','RETORNADO_FACCAO','INSPECAO') then 'INSPECAO'
        when upper(coalesce(v.status_volume,'')) = 'EM_PRODUCAO_INTERNA' then 'INTERNA'
        when upper(coalesce(v.status_volume,'')) in ('CONCLUIDO_INTERNO','CAIXA_INTERNA_PRONTA','AGUARDANDO_EMBALAGEM','EMBALAGEM','EMBALAGEM_PARCIAL') then 'EMBALAR'
        when upper(coalesce(v.tipo_local_atual,'')) = 'ESTOQUE_CORTE' then 'VOLUMADO'
        when upper(coalesce(v.tipo_local_atual,'')) = 'FACCAO' then 'FACCAO'
        when upper(coalesce(v.tipo_local_atual,'')) = 'INSPECAO' then 'INSPECAO'
        when upper(coalesce(v.tipo_local_atual,'')) = 'INTERNO' then 'INTERNA'
        when upper(coalesce(v.tipo_local_atual,'')) = 'EMBALAGEM' then 'EMBALAR'
      end etapa
    from public.volumes v join public.estoque_corte e on e.empresa_id = v.empresa_id and e.id_estoque_corte = v.id_estoque_corte
    where v.empresa_id = v_emp and coalesce(v.qtd_volume, 0) > 0
  ), base as (
    select e.id_produto, e.id_cor, e.id_tamanho, 'CORTE' etapa, sum(e.saldo_disponivel) q, 0 nv
      from public.estoque_corte e where e.empresa_id = v_emp and coalesce(e.saldo_disponivel, 0) > 0 group by 1, 2, 3
    union all
    select id_produto, id_cor, id_tamanho, etapa, sum(q), count(*) from vol where etapa is not null and etapa <> 'HIST' group by 1, 2, 3, 4
    union all
    select id_produto, id_cor, id_tamanho, 'HIST', sum(q), count(*) from vol where etapa = 'HIST' and atualizado_em >= v_desde group by 1, 2, 3
  )
  select jsonb_build_object('dias_hist', least(greatest(coalesce(p_dias_hist, 30), 1), 365), 'gerado_em', now(),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'p', b.id_produto, 'pn', coalesce(nullif(p.produto, ''), p.descricao, b.id_produto), 'pc', coalesce(p.codigo_produto, ''),
      't', coalesce(b.id_tamanho, ''), 'tn', coalesce(t.tamanho, b.id_tamanho, ''), 'to', coalesce(t.ordem_exibicao, 999),
      'c', coalesce(b.id_cor, ''), 'cn', coalesce(c.cor, b.id_cor, ''),
      'e', b.etapa, 'q', b.q, 'v', b.nv) order by p.codigo_produto, t.ordem_exibicao, c.cor), '[]'::jsonb))
  from base b
  left join public.cad_produtos p on p.empresa_id = v_emp and p.id_produto = b.id_produto
  left join public.cad_tamanhos t on t.empresa_id = v_emp and t.id_tamanho = b.id_tamanho
  left join public.cad_cores c on c.empresa_id = v_emp and c.id_cor = b.id_cor
  );
end $$;

revoke all on function public.web_fluxo_produtos(text, int) from public, anon;
grant execute on function public.web_fluxo_produtos(text, int) to authenticated;
