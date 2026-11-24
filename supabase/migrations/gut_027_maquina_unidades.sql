-- gut_027 — Máquinas numeradas (unidades físicas) — v4.33.0
-- Cada tipo de máquina do cadastro (cad_maquinas) tem unidades físicas com código próprio (RT-01, OV-02...),
-- usadas na etiqueta com QR, na planta baixa e, depois, para saber em qual máquina cada processo foi feito.
-- Ver: módulo cadastros ou produção (ver/editar). Gravar: dono ou cadastros = editar.

create table if not exists private.maquina_unidades (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  id_unidade text not null,
  id_maquina text not null,
  codigo text not null,
  descricao text,
  serie text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, id_unidade)
);
create unique index if not exists maquina_unidades_codigo on private.maquina_unidades (empresa_id, upper(codigo));
alter table private.maquina_unidades enable row level security;

create or replace function private.unidades_exige(p_emp uuid, p_gravar boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare u record; e record; c text; p text;
begin
  select * into e from public.empresas where id = p_emp;
  if p_gravar and coalesce(e.status, '') in ('SUSPENSA', 'CANCELADA') then
    raise exception 'A empresa está %: o sistema está só para consulta.', lower(e.status) using errcode = '42501';
  end if;
  if private.sou_admin() then return; end if;
  select * into u from public.usuarios_empresa where empresa_id = p_emp and user_id = auth.uid() and coalesce(ativo, true);
  if not found then raise exception 'Você não tem acesso a esta empresa.' using errcode = '42501'; end if;
  if u.papel = 'DONO' then return; end if;
  c := lower(coalesce(u.permissoes ->> 'cadastros', '')); p := lower(coalesce(u.permissoes ->> 'producao', ''));
  if p_gravar and c <> 'editar' then
    raise exception 'Você não tem permissão para alterar as máquinas (módulo cadastros). Peça ao dono da empresa para liberar.' using errcode = '42501';
  end if;
  if not p_gravar and c not in ('ver', 'editar') and p not in ('ver', 'editar') then
    raise exception 'Você não tem permissão para ver as máquinas.' using errcode = '42501';
  end if;
end $$;

create or replace function public.web_unidades_ler(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.unidades_exige(v_emp, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id_unidade, 'maq', id_maquina, 'codigo', codigo, 'descricao', descricao, 'serie', serie, 'ativo', ativo) order by upper(codigo))
    from private.maquina_unidades where empresa_id = v_emp), '[]'::jsonb);
end $$;

-- grava a lista de unidades de UM tipo de máquina (substitui a lista daquele tipo)
create or replace function public.web_unidades_salvar(p_slug text, p_id_maquina text, p_unidades jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; r jsonb; v_cod text; v_ids text[] := '{}'; v_id text;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.unidades_exige(v_emp, true);
  if coalesce(trim(p_id_maquina), '') = '' then raise exception 'Informe a máquina.'; end if;
  if p_unidades is null or jsonb_typeof(p_unidades) <> 'array' then raise exception 'Lista de unidades inválida.'; end if;
  if jsonb_array_length(p_unidades) > 500 then raise exception 'No máximo 500 unidades por tipo de máquina.'; end if;
  for r in select * from jsonb_array_elements(p_unidades) loop
    v_cod := upper(trim(coalesce(r ->> 'codigo', '')));
    if v_cod = '' then raise exception 'Toda unidade precisa de um código.'; end if;
    if v_cod !~ '^[A-Z0-9][A-Z0-9._-]{0,23}$' then raise exception 'Código "%" inválido: use letras, números, ponto, hífen ou sublinhado (até 24).', v_cod; end if;
    if exists (select 1 from private.maquina_unidades where empresa_id = v_emp and upper(codigo) = v_cod and id_maquina <> p_id_maquina) then
      raise exception 'O código % já está em uso em outra máquina.', v_cod;
    end if;
    v_id := nullif(trim(coalesce(r ->> 'id', '')), '');
    if v_id is null then v_id := 'UN-' || replace(gen_random_uuid()::text, '-', ''); end if;
    v_ids := v_ids || v_id;
  end loop;
  -- códigos repetidos dentro da própria lista
  if (select count(*) from jsonb_array_elements(p_unidades) x) <> (select count(distinct upper(trim(x ->> 'codigo'))) from jsonb_array_elements(p_unidades) x) then
    raise exception 'Há códigos repetidos na lista.';
  end if;
  delete from private.maquina_unidades where empresa_id = v_emp and id_maquina = p_id_maquina and not (id_unidade = any (v_ids));
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    r := p_unidades -> (i - 1);
    insert into private.maquina_unidades (empresa_id, id_unidade, id_maquina, codigo, descricao, serie, ativo, atualizado_em)
    values (v_emp, v_ids[i], p_id_maquina, upper(trim(r ->> 'codigo')), nullif(trim(coalesce(r ->> 'descricao', '')), ''), nullif(trim(coalesce(r ->> 'serie', '')), ''), coalesce((r ->> 'ativo')::boolean, true), now())
    on conflict (empresa_id, id_unidade) do update set codigo = excluded.codigo, descricao = excluded.descricao, serie = excluded.serie, ativo = excluded.ativo, id_maquina = excluded.id_maquina, atualizado_em = now();
  end loop;
  return public.web_unidades_ler(p_slug);
end $$;

revoke all on function public.web_unidades_ler(text) from public, anon;
revoke all on function public.web_unidades_salvar(text, text, jsonb) from public, anon;
revoke all on function private.unidades_exige(uuid, boolean) from public, anon, authenticated;
grant execute on function public.web_unidades_ler(text) to authenticated;
grant execute on function public.web_unidades_salvar(text, text, jsonb) to authenticated;
