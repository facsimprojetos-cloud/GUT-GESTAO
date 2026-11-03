-- 1) App de gestão: só o administrador da plataforma gerencia empresas e acessos do escritório
create or replace function private.pode_gerir(p_emp uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select private.sou_admin();
$$;
create or replace function private.exige_gerir(p_emp uuid) returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'Entre no sistema primeiro.'; end if;
  if not private.sou_admin() then raise exception 'Só o administrador da plataforma pode fazer isso.'; end if;
end $$;

-- 2) Senhas do app de campo (hash e salt) nunca saem para quem tem login no Supabase.
do $$
declare t text; cols text;
begin
  foreach t in array array['cad_operadores','cad_destinos'] loop
    execute format('revoke select on public.%I from anon, authenticated', t);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name not in ('senha_hash','senha_salt');
    execute format('grant select (%s) on public.%I to authenticated', cols, t);
  end loop;
end $$;
