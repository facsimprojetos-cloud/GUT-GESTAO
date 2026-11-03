-- gut_010 — Kanbans rápidos e ao vivo no sistema web (/sistema)
-- O navegador (usuário logado no Supabase Auth) lê direto do banco os dados crus dos dois quadros
-- (produção interna e facções) numa chamada só; a montagem dos cards é a mesma do Apps Script,
-- feita no próprio navegador. Qualquer gravação nas tabelas avisa o canal 'campo-<empresa>'.

-- empresa pelo slug + confere se quem chama é usuário ativo dela (ou admin da plataforma)
create or replace function private.web_empresa(p_slug text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid;
begin
  if auth.uid() is null then raise exception 'Faça login novamente.'; end if;
  select e.id into v_emp from public.empresas e where e.slug = lower(trim(p_slug)) and e.status in ('ATIVA','TESTE');
  if v_emp is null then raise exception 'Empresa não encontrada ou suspensa.'; end if;
  if not private.sou_admin() and not exists (
    select 1 from public.usuarios_empresa u where u.empresa_id = v_emp and u.user_id = auth.uid() and coalesce(u.ativo, true)
  ) then raise exception 'Seu usuário não tem acesso a esta empresa.'; end if;
  return v_emp;
end $$;

-- linha -> json sem as colunas internas
create or replace function private.web_j(r jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select r - 'empresa_id' - 'sincronizado_em' - 'ordem_linha' - 'senha_hash' - 'senha_salt' - 'qr_token'
$$;

create or replace function public.web_quadro_interno(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'America/Sao_Paulo' as $$
declare v_emp uuid; r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  with vol as (
    select v.* from public.volumes v
    where v.empresa_id = v_emp and upper(coalesce(v.tipo_local_atual,'')) = 'INTERNO'
      and upper(coalesce(v.status_volume,'')) not in ('CANCELADO','ESTORNADO','EM_ESTOQUE_PA')
  ), ids as (
    select id_volume as id from vol union select id_volume_origem from vol where coalesce(id_volume_origem,'') <> ''
  ), cup as (
    select c.* from public.cupons_producao c
    where c.empresa_id = v_emp and c.id_volume in (select id_volume from vol)
      and upper(coalesce(c.status_cupom,'')) not in ('CANCELADO','ESTORNADO')
  ), rem as (
    select x.* from public.remessas x where x.empresa_id = v_emp and upper(coalesce(x.tipo_destino,'')) in ('INTERNO','PRODUCAO_INTERNA')
  ), itn as (
    select i.* from public.remessa_itens i where i.empresa_id = v_emp and i.id_volume in (select id from ids)
      and i.id_remessa in (select id_remessa from rem)
  )
  select jsonb_build_object(
    'VOLUMES', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from vol x),
    'CUPONS_PRODUCAO', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id_cupom', x.id_cupom, 'cod_cupom', x.cod_cupom, 'id_volume', x.id_volume, 'id_processo', x.id_processo, 'ordem_processo', x.ordem_processo, 'id_setor', x.id_setor, 'id_maquina', x.id_maquina, 'qtd_programada', x.qtd_programada, 'tempo_padrao_seg_un', x.tempo_padrao_seg_un, 'minutos_padrao_total', x.minutos_padrao_total, 'status_cupom', x.status_cupom, 'id_operador_marcacao', x.id_operador_marcacao, 'id_operador_bipagem', x.id_operador_bipagem, 'data_hora_inicio_marcacao', x.data_hora_inicio_marcacao, 'data_hora_fim_marcacao', x.data_hora_fim_marcacao, 'pausado_em', x.pausado_em, 'segundos_pausa', x.segundos_pausa, 'pausa_tipo', x.pausa_tipo, 'id_operador_alocado', x.id_operador_alocado, 'metodo_conclusao', x.metodo_conclusao, 'atualizado_em', x.atualizado_em, 'data_hora_bipagem', x.data_hora_bipagem)) order by x.ordem_linha), '[]') from cup x),  -- só as colunas que o quadro usa
    'ESTOQUE_CORTE', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from public.estoque_corte x
                      where x.empresa_id = v_emp and x.id_estoque_corte in (select id_estoque_corte from vol)),
    'REMESSAS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from rem x
                 where x.id_remessa in (select id_remessa from itn)),
    'REMESSA_ITENS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from itn x),
    'CAD_PROCESSOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_PROCESSO', x.id_processo, 'PROCESSO', x.processo, 'ID_MAQUINA_PADRAO', x.id_maquina_padrao) order by x.ordem_linha), '[]') from public.cad_processos x where x.empresa_id = v_emp),
    'CAD_OPERADORES', (select coalesce(jsonb_agg(jsonb_build_object('ID_OPERADOR', x.id_operador, 'NOME', x.nome, 'ATIVO', x.ativo) order by x.ordem_linha), '[]') from public.cad_operadores x where x.empresa_id = v_emp),
    'CAD_SETORES', (select coalesce(jsonb_agg(jsonb_build_object('ID_SETOR', x.id_setor, 'SETOR', x.setor) order by x.ordem_linha), '[]') from public.cad_setores x where x.empresa_id = v_emp),
    'CAD_MAQUINAS', (select coalesce(jsonb_agg(jsonb_build_object('ID_MAQUINA', x.id_maquina, 'MAQUINA', x.maquina) order by x.ordem_linha), '[]') from public.cad_maquinas x where x.empresa_id = v_emp),
    'CAD_PRODUTOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_PRODUTO', x.id_produto, 'CODIGO_PRODUTO', x.codigo_produto, 'PRODUTO', x.produto) order by x.ordem_linha), '[]') from public.cad_produtos x where x.empresa_id = v_emp),
    'CAD_CORES', (select coalesce(jsonb_agg(jsonb_build_object('ID_COR', x.id_cor, 'COR', x.cor) order by x.ordem_linha), '[]') from public.cad_cores x where x.empresa_id = v_emp),
    'CAD_TAMANHOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_TAMANHO', x.id_tamanho, 'TAMANHO', x.tamanho) order by x.ordem_linha), '[]') from public.cad_tamanhos x where x.empresa_id = v_emp),
    'EMPRESA_ID', v_emp,
    'AGORA', now()
  ) into r;
  return r;
end $$;

create or replace function public.web_quadro_faccao(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'America/Sao_Paulo' as $$
declare v_emp uuid; r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  with recursive rem as (
    select x.* from public.remessas x where x.empresa_id = v_emp and upper(coalesce(x.tipo_destino,'')) = 'FACCAO'
  ), itn as (
    select i.* from public.remessa_itens i where i.empresa_id = v_emp and i.id_remessa in (select id_remessa from rem)
  ), cadeia(id, n) as (   -- volumes das remessas + origem do retrabalho (preço do débito de qualidade)
    select distinct i.id_volume, 0 from itn i where coalesce(i.id_volume,'') <> ''
    union
    select v.id_volume_origem_retrabalho, c.n + 1 from cadeia c
      join public.volumes v on v.empresa_id = v_emp and v.id_volume = c.id
      where coalesce(v.id_volume_origem_retrabalho,'') <> '' and c.n < 8
  ), vids as (select distinct id from cadeia), vol as (
    select v.* from public.volumes v where v.empresa_id = v_emp and v.id_volume in (select id from vids)
  ), vit as (
    select x.* from public.volume_itens x where x.empresa_id = v_emp and x.id_volume in (select id_volume from itn)
  ), ret as (
    select x.* from public.retornos_externos x where x.empresa_id = v_emp and x.id_item_remessa in (select id_item_remessa from itn)
  )
  select jsonb_build_object(
    'REMESSAS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from rem x),
    'REMESSA_ITENS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from public.remessa_itens x
                      where x.empresa_id = v_emp and (x.id_remessa in (select id_remessa from rem) or x.id_volume in (select id from vids))),
    'VOLUMES', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from vol x),
    'ESTOQUE_CORTE', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from public.estoque_corte x
                      where x.empresa_id = v_emp and x.id_estoque_corte in (select id_estoque_corte from vol)),
    'VOLUME_ITENS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from vit x),
    'RETORNOS_EXTERNOS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from ret x),
    'RETORNO_VOLUME_ITENS', (select coalesce(jsonb_agg(jsonb_build_object('ID_VOLUME_ITEM', x.id_volume_item, 'QTD_RETORNADA', x.qtd_retornada) order by x.ordem_linha), '[]')
                             from public.retorno_volume_itens x where x.empresa_id = v_emp and x.id_volume_item in (select id_volume_item from vit)),
    'FINANCEIRO_FACCAO', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from public.financeiro_faccao x
                          where x.empresa_id = v_emp and (x.id_remessa in (select id_remessa from rem) or x.id_volume in (select id from vids))),
    'PAGAMENTOS_FACCAO', (select coalesce(jsonb_agg(jsonb_build_object('ID_PAGAMENTO', x.id_pagamento, 'NUM_PAGAMENTO', x.num_pagamento) order by x.ordem_linha), '[]') from public.pagamentos_faccao x where x.empresa_id = v_emp),
    'FACCAO_AVISOS', (select coalesce(jsonb_agg(private.web_j(to_jsonb(x)) order by x.ordem_linha), '[]') from public.faccao_avisos x
                      where x.empresa_id = v_emp and x.id_remessa in (select id_remessa from rem)),
    'CAD_PROCESSOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_PROCESSO', x.id_processo, 'PROCESSO', x.processo) order by x.ordem_linha), '[]') from public.cad_processos x where x.empresa_id = v_emp),
    'CAD_DESTINOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_DESTINO', x.id_destino, 'NOME_DESTINO', x.nome_destino) order by x.ordem_linha), '[]') from public.cad_destinos x where x.empresa_id = v_emp),
    'CAD_PRODUTOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_PRODUTO', x.id_produto, 'CODIGO_PRODUTO', x.codigo_produto, 'PRODUTO', x.produto) order by x.ordem_linha), '[]') from public.cad_produtos x where x.empresa_id = v_emp),
    'CAD_CORES', (select coalesce(jsonb_agg(jsonb_build_object('ID_COR', x.id_cor, 'COR', x.cor) order by x.ordem_linha), '[]') from public.cad_cores x where x.empresa_id = v_emp),
    'CAD_TAMANHOS', (select coalesce(jsonb_agg(jsonb_build_object('ID_TAMANHO', x.id_tamanho, 'TAMANHO', x.tamanho) order by x.ordem_linha), '[]') from public.cad_tamanhos x where x.empresa_id = v_emp),
    'EMPRESA_ID', v_emp,
    'AGORA', now()
  ) into r;
  return r;
end $$;

revoke all on function public.web_quadro_interno(text) from public, anon;
revoke all on function public.web_quadro_faccao(text) from public, anon;
grant execute on function public.web_quadro_interno(text) to authenticated;
grant execute on function public.web_quadro_faccao(text) to authenticated;

-- aviso ao vivo: agora diz qual tabela mudou (o app de campo ignora o conteúdo)
create or replace function private.campo_avisa_mudanca()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e uuid;
begin
  begin
    for e in select distinct empresa_id from novos loop
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'mudou', 'campo-' || e::text, false);
    end loop;
  exception when others then null;
  end;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['cupons_producao','remessas','remessa_itens','faccao_avisos','retornos_externos','volumes'] loop
    execute format('drop trigger if exists campo_vivo_ins on public.%I', t);
    execute format('drop trigger if exists campo_vivo_upd on public.%I', t);
    execute format('drop trigger if exists campo_vivo_del on public.%I', t);
    execute format('create trigger campo_vivo_ins after insert on public.%I referencing new table as novos for each statement execute function private.campo_avisa_mudanca()', t);
    execute format('create trigger campo_vivo_upd after update on public.%I referencing new table as novos for each statement execute function private.campo_avisa_mudanca()', t);
    execute format('create trigger campo_vivo_del after delete on public.%I referencing old table as novos for each statement execute function private.campo_avisa_mudanca()', t);
  end loop;
end $$;

-- gut_011 / gut_012 (quadro interno só com as colunas usadas) — id da empresa para o navegador assinar o canal ao vivo logo ao entrar
create or replace function public.web_empresa_id(p_slug text)
returns uuid language sql stable security definer set search_path = '' as $$ select private.web_empresa(p_slug) $$;
revoke all on function public.web_empresa_id(text) from public, anon;
grant execute on function public.web_empresa_id(text) to authenticated;
