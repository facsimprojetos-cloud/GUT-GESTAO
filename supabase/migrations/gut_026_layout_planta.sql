-- gut_026 — Layout da fábrica (planta baixa) — v4.31.0
-- Cada empresa pode ter vários ambientes (salas). O desenho fica num JSON:
-- { largura, comprimento, celula, itens:[{id,tipo,maq,nome,x,y,w,h,rot}], cotas:[{id,a,b}] }  (medidas em metros)
-- Ver: qualquer usuário com "producao" ver/editar. Gravar: dono ou "producao" = editar.

create table if not exists private.layout_planta (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  id_layout text not null,
  nome text not null default 'Ambiente',
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (empresa_id, id_layout)
);
alter table private.layout_planta enable row level security;

create or replace function private.layout_exige(p_emp uuid, p_gravar boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare u record; e record; nivel text;
begin
  select * into e from public.empresas where id = p_emp;
  if p_gravar and coalesce(e.status, '') in ('SUSPENSA', 'CANCELADA') then
    raise exception 'A empresa está %: o sistema está só para consulta.', lower(e.status) using errcode = '42501';
  end if;
  if private.sou_admin() then return; end if;
  select * into u from public.usuarios_empresa where empresa_id = p_emp and user_id = auth.uid() and coalesce(ativo, true);
  if not found then raise exception 'Você não tem acesso a esta empresa.' using errcode = '42501'; end if;
  if u.papel = 'DONO' then return; end if;
  nivel := lower(coalesce(u.permissoes ->> 'producao', ''));
  if (p_gravar and nivel <> 'editar') or (not p_gravar and nivel not in ('ver', 'editar')) then
    raise exception 'Você não tem permissão para % o layout (módulo produção). Peça ao dono da empresa para liberar.', case when p_gravar then 'alterar' else 'ver' end
      using errcode = '42501';
  end if;
end $$;

create or replace function public.web_layout_ler(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.layout_exige(v_emp, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id_layout, 'nome', nome, 'dados', dados, 'atualizado_em', atualizado_em) order by nome, id_layout)
    from private.layout_planta where empresa_id = v_emp), '[]'::jsonb);
end $$;

create or replace function public.web_layout_salvar(p_slug text, p_id text, p_nome text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_id text := nullif(trim(coalesce(p_id, '')), '');
begin
  v_emp := private.web_empresa(p_slug);
  perform private.layout_exige(v_emp, true);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Layout inválido.'; end if;
  if octet_length(p_dados::text) > 1500000 then raise exception 'Layout grande demais para salvar.'; end if;
  if coalesce((p_dados ->> 'largura')::numeric, 0) <= 0 or coalesce((p_dados ->> 'comprimento')::numeric, 0) <= 0
     or (p_dados ->> 'largura')::numeric > 500 or (p_dados ->> 'comprimento')::numeric > 500 then
    raise exception 'Informe largura e comprimento do ambiente (até 500 m).';
  end if;
  if v_id is null then v_id := 'LAY-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'); end if;
  insert into private.layout_planta (empresa_id, id_layout, nome, dados, atualizado_em, atualizado_por)
  values (v_emp, v_id, coalesce(nullif(trim(p_nome), ''), 'Ambiente'), p_dados, now(), auth.uid())
  on conflict (empresa_id, id_layout) do update set nome = excluded.nome, dados = excluded.dados, atualizado_em = now(), atualizado_por = auth.uid();
  return jsonb_build_object('id', v_id, 'atualizado_em', now());
end $$;

create or replace function public.web_layout_excluir(p_slug text, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.layout_exige(v_emp, true);
  delete from private.layout_planta where empresa_id = v_emp and id_layout = p_id;
end $$;

revoke all on function public.web_layout_ler(text) from public, anon;
revoke all on function public.web_layout_salvar(text, text, text, jsonb) from public, anon;
revoke all on function public.web_layout_excluir(text, text) from public, anon;
revoke all on function private.layout_exige(uuid, boolean) from public, anon, authenticated;
grant execute on function public.web_layout_ler(text) to authenticated;
grant execute on function public.web_layout_salvar(text, text, text, jsonb) to authenticated;
grant execute on function public.web_layout_excluir(text, text) to authenticated;
