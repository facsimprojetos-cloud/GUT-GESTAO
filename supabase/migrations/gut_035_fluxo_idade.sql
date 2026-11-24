-- gut_035 — Kanban de produtos (BI): idade das peças em cada etapa — v4.44.0
-- web_fluxo_produtos passa a devolver em cada item: p7 = peças paradas há mais de 7 dias na etapa (pela última atualização
-- do volume, ou da linha do estoque de corte) e dias = a mais antiga, em dias. Usado nos insights do painel 4.

create or replace function public.web_fluxo_produtos(p_slug text, p_dias_hist int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; v_desde timestamptz;
begin
  v_emp := private.web_empresa(p_slug);
  v_desde := now() - make_interval(days => least(greatest(coalesce(p_dias_hist, 30), 1), 365));
  return (
  with vol as (
    select v.id_volume, coalesce(v.qtd_volume, 0) q, e.id_produto, e.id_cor, e.id_tamanho, v.atualizado_em,
      coalesce(v.atualizado_em, v.data_criacao) desde,
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
  ), prev as (
    select vol.id_produto, vol.id_cor, vol.id_tamanho, vol.etapa, vol.q, r.previsao_retorno d, coalesce(nullif(dd.nome_destino, ''), r.id_destino, '') f
      from vol
      left join lateral (select rr.previsao_retorno, rr.id_destino from public.remessa_itens i join public.remessas rr on rr.empresa_id = i.empresa_id and rr.id_remessa = i.id_remessa
                          where i.empresa_id = v_emp and i.id_volume = vol.id_volume and upper(coalesce(rr.tipo_destino,'')) = 'FACCAO'
                            and upper(coalesce(rr.status_remessa,'')) not in ('RETORNADO','CANCELADA','CANCELADO')
                          order by i.data_vinculo desc nulls last limit 1) r on true
      left join public.cad_destinos dd on dd.empresa_id = v_emp and dd.id_destino = r.id_destino
     where vol.etapa in ('FACCAO', 'DESTINO')
  ), prevg as (
    select id_produto, id_cor, id_tamanho, etapa, d, f, sum(q) q, count(*) nv from prev group by 1, 2, 3, 4, 5, 6
  ), base as (
    select e.id_produto, e.id_cor, e.id_tamanho, 'CORTE' etapa, sum(e.saldo_disponivel) q, 0 nv,
           sum(e.saldo_disponivel) filter (where coalesce(e.atualizado_em, e.data_geracao) < now() - interval '7 days') p7,
           max(extract(day from now() - coalesce(e.atualizado_em, e.data_geracao)))::int dias
      from public.estoque_corte e where e.empresa_id = v_emp and coalesce(e.saldo_disponivel, 0) > 0 group by 1, 2, 3
    union all
    select id_produto, id_cor, id_tamanho, etapa, sum(q), count(*), sum(q) filter (where desde < now() - interval '7 days'), max(extract(day from now() - desde))::int
      from vol where etapa is not null and etapa <> 'HIST' group by 1, 2, 3, 4
    union all
    select id_produto, id_cor, id_tamanho, 'HIST', sum(q), count(*), 0, 0 from vol where etapa = 'HIST' and atualizado_em >= v_desde group by 1, 2, 3
  )
  select jsonb_build_object('dias_hist', least(greatest(coalesce(p_dias_hist, 30), 1), 365), 'gerado_em', now(),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'p', b.id_produto, 'pn', coalesce(nullif(p.produto, ''), p.descricao, b.id_produto), 'pc', coalesce(p.codigo_produto, ''),
      't', coalesce(b.id_tamanho, ''), 'tn', coalesce(t.tamanho, b.id_tamanho, ''), 'to', coalesce(t.ordem_exibicao, 999),
      'c', coalesce(b.id_cor, ''), 'cn', coalesce(c.cor, b.id_cor, ''),
      'e', b.etapa, 'q', b.q, 'v', b.nv, 'p7', coalesce(b.p7, 0), 'dias', coalesce(b.dias, 0)) order by p.codigo_produto, t.ordem_exibicao, c.cor), '[]'::jsonb),
    'previsao', (select coalesce(jsonb_agg(jsonb_build_object(
      'p', g.id_produto, 'pn', coalesce(nullif(pp.produto, ''), pp.descricao, g.id_produto), 'pc', coalesce(pp.codigo_produto, ''),
      't', coalesce(g.id_tamanho, ''), 'tn', coalesce(tt.tamanho, g.id_tamanho, ''), 'to', coalesce(tt.ordem_exibicao, 999),
      'c', coalesce(g.id_cor, ''), 'cn', coalesce(cc.cor, g.id_cor, ''), 'e', g.etapa, 'd', g.d, 'f', g.f, 'q', g.q, 'v', g.nv)), '[]'::jsonb)
      from prevg g
      left join public.cad_produtos pp on pp.empresa_id = v_emp and pp.id_produto = g.id_produto
      left join public.cad_tamanhos tt on tt.empresa_id = v_emp and tt.id_tamanho = g.id_tamanho
      left join public.cad_cores cc on cc.empresa_id = v_emp and cc.id_cor = g.id_cor))
  from base b
  left join public.cad_produtos p on p.empresa_id = v_emp and p.id_produto = b.id_produto
  left join public.cad_tamanhos t on t.empresa_id = v_emp and t.id_tamanho = b.id_tamanho
  left join public.cad_cores c on c.empresa_id = v_emp and c.id_cor = b.id_cor
  );
end $$;

revoke all on function public.web_fluxo_produtos(text, int) from public, anon;
grant execute on function public.web_fluxo_produtos(text, int) to authenticated;
