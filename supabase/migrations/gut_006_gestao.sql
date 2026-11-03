-- GUT PPCP — app de gestão (empresas, usuários do escritório, acesso de campo)
-- Tudo passa por funções SECURITY DEFINER que conferem quem está logado (auth.uid()).

create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.plataforma_admins enable row level security;

alter table public.empresas add column if not exists cnpj text;
alter table public.empresas add column if not exists contato text;
alter table public.empresas add column if not exists email text;
alter table public.empresas add column if not exists telefone text;
alter table public.empresas add column if not exists observacao text;
alter table public.empresas add column if not exists inicio date;
alter table public.empresas add column if not exists atualizado_em timestamptz;
alter table public.empresas drop constraint if exists empresas_status_check;
alter table public.empresas add constraint empresas_status_check check (status = any (array['ATIVA','TESTE','SUSPENSA','CANCELADA']));

alter table public.usuarios_empresa add column if not exists nome text;
alter table public.usuarios_empresa add column if not exists email text;
alter table public.usuarios_empresa add column if not exists permissoes jsonb not null default '{}'::jsonb;
alter table public.usuarios_empresa add column if not exists ativo boolean not null default true;
alter table public.usuarios_empresa add column if not exists atualizado_em timestamptz;

-- ---------- quem pode o quê ----------
create or replace function private.sou_admin() returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.plataforma_admins a where a.user_id = auth.uid());
$$;
create or replace function private.pode_gerir(p_emp uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select private.sou_admin() or exists (
    select 1 from public.usuarios_empresa u
    where u.user_id = auth.uid() and u.empresa_id = p_emp and u.ativo and u.papel = 'DONO');
$$;
create or replace function private.exige_gerir(p_emp uuid) returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'Entre no sistema primeiro.'; end if;
  if not private.pode_gerir(p_emp) then raise exception 'Você não tem permissão para gerenciar esta empresa.'; end if;
end $$;
create or replace function private.toca_revisao(p_emp uuid) returns void language sql security definer set search_path to '' as $$
  update public.app_controle set revisao = 'gestao-' || gen_random_uuid()::text, atualizado_em = now() where empresa_id = p_emp;
$$;
create or replace function private.meu_email() returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select email from auth.users where id = auth.uid()), 'gestao');
$$;
create or replace function private.audita(p_emp uuid, p_acao text, p_tabela text, p_id text, p_depois jsonb) returns void language sql security definer set search_path to '' as $$
  insert into public.auditoria (empresa_id, id_log, data_hora, id_usuario, acao, tabela, id_registro, dados_antes, dados_depois, observacao)
  values (p_emp, gen_random_uuid()::text, now(), private.meu_email(), p_acao, p_tabela, p_id, '', p_depois::text, 'app de gestão');
$$;
-- mesmo hash do Apps Script (campoHash_): 40 rodadas de SHA-256 em base64
create or replace function private.campo_hash(p_senha text, p_salt text) returns text language plpgsql immutable set search_path to '' as $$
declare h text := p_salt || '|' || p_senha; i int;
begin
  for i in 1..40 loop
    h := encode(extensions.digest(convert_to(h || '|' || p_salt, 'UTF8'), 'sha256'), 'base64');
  end loop;
  return h;
end $$;

-- ---------- sessão ----------
create or replace function public.gestao_eu() returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_admin boolean; r jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no sistema primeiro.'; end if;
  v_admin := private.sou_admin();
  select jsonb_build_object(
    'user', jsonb_build_object('id', auth.uid(), 'email', private.meu_email()),
    'admin', v_admin,
    'empresas', coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug, 'status', e.status, 'plano', e.plano,
        'papel', case when v_admin then coalesce(u.papel, 'ADMIN') else u.papel end,
        'permissoes', coalesce(u.permissoes, '{}'::jsonb)) order by e.nome), '[]'::jsonb))
  into r
  from public.empresas e
  left join public.usuarios_empresa u on u.empresa_id = e.id and u.user_id = auth.uid()
  where v_admin or (u.user_id is not null and u.ativo);
  return r;
end $$;

-- ---------- empresas (só administrador da plataforma) ----------
create or replace function public.gestao_empresas() returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not private.sou_admin() then raise exception 'Só o administrador da plataforma vê todas as empresas.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'slug', e.slug, 'cnpj', e.cnpj, 'contato', e.contato, 'email', e.email, 'telefone', e.telefone,
      'plano', e.plano, 'status', e.status, 'inicio', e.inicio, 'observacao', e.observacao, 'criado_em', e.criado_em,
      'usuarios', (select count(*) from public.usuarios_empresa u where u.empresa_id = e.id and u.ativo),
      'operadores', (select count(*) from public.cad_operadores o where o.empresa_id = e.id and o.ativo),
      'operadores_app', (select count(*) from public.cad_operadores o where o.empresa_id = e.id and o.ativo and o.acesso_app),
      'faccoes', (select count(*) from public.cad_destinos d where d.empresa_id = e.id and d.ativo and upper(d.tipo_destino) = 'FACCAO'),
      'faccoes_app', (select count(*) from public.cad_destinos d where d.empresa_id = e.id and d.ativo and upper(d.tipo_destino) = 'FACCAO' and d.acesso_app),
      'ultimo_uso', (select max(c.atualizado_em) from public.app_controle c where c.empresa_id = e.id)
    ) order by e.nome) from public.empresas e), '[]'::jsonb);
end $$;

create or replace function public.gestao_empresa_salvar(p jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_nome text := btrim(coalesce(p->>'nome', '')); v_slug text; v_status text := upper(coalesce(nullif(p->>'status', ''), 'ATIVA'));
begin
  if not private.sou_admin() then raise exception 'Só o administrador da plataforma cadastra empresas.'; end if;
  if length(v_nome) < 2 then raise exception 'Informe o nome da empresa.'; end if;
  v_slug := lower(regexp_replace(coalesce(nullif(btrim(p->>'slug'), ''), v_nome), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then raise exception 'Código da empresa inválido.'; end if;
  if exists (select 1 from public.empresas e where e.slug = v_slug and e.id is distinct from v_id) then raise exception 'Já existe uma empresa com o código %.', v_slug; end if;
  if v_id is null then
    insert into public.empresas (nome, slug, cnpj, contato, email, telefone, plano, status, inicio, observacao, atualizado_em)
    values (v_nome, v_slug, p->>'cnpj', p->>'contato', p->>'email', p->>'telefone', coalesce(nullif(p->>'plano', ''), 'TESTE'), v_status, nullif(p->>'inicio', '')::date, p->>'observacao', now())
    returning id into v_id;
    insert into public.app_controle (empresa_id, versao_schema, revisao, atualizado_em) values (v_id, '4.6.0', 'gestao-' || gen_random_uuid()::text, now()) on conflict do nothing;
  else
    update public.empresas set nome = v_nome, slug = v_slug, cnpj = p->>'cnpj', contato = p->>'contato', email = p->>'email', telefone = p->>'telefone',
      plano = coalesce(nullif(p->>'plano', ''), plano), status = v_status, inicio = nullif(p->>'inicio', '')::date, observacao = p->>'observacao', atualizado_em = now()
    where id = v_id;
    if not found then raise exception 'Empresa não encontrada.'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------- usuários do escritório ----------
create or replace function public.gestao_usuarios(p_emp uuid) returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform private.exige_gerir(p_emp);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', u.user_id, 'nome', coalesce(u.nome, ''), 'email', coalesce(au.email, u.email), 'papel', u.papel, 'permissoes', u.permissoes, 'ativo', u.ativo,
      'convidado_em', au.invited_at, 'confirmado', au.email_confirmed_at is not null or au.last_sign_in_at is not null, 'ultimo_acesso', au.last_sign_in_at,
      'sou_eu', u.user_id = auth.uid()
    ) order by coalesce(u.nome, au.email)) from public.usuarios_empresa u left join auth.users au on au.id = u.user_id where u.empresa_id = p_emp), '[]'::jsonb);
end $$;

create or replace function public.gestao_usuario_salvar(p_emp uuid, p jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_user uuid := (p->>'user_id')::uuid; v_papel text := upper(coalesce(p->>'papel', 'OPERADOR')); v_ativo boolean := coalesce((p->>'ativo')::boolean, true);
begin
  perform private.exige_gerir(p_emp);
  if v_papel not in ('DONO', 'SUPERVISOR', 'FINANCEIRO', 'OPERADOR') then raise exception 'Papel inválido.'; end if;
  if v_user = auth.uid() and not private.sou_admin() and (v_papel <> 'DONO' or not v_ativo) then raise exception 'Você não pode tirar o seu próprio acesso de dono.'; end if;
  update public.usuarios_empresa set nome = coalesce(p->>'nome', nome), papel = v_papel, permissoes = coalesce(p->'permissoes', permissoes), ativo = v_ativo, atualizado_em = now()
  where empresa_id = p_emp and user_id = v_user;
  if not found then raise exception 'Usuário não encontrado nesta empresa.'; end if;
  perform private.audita(p_emp, 'GESTAO_USUARIO', 'usuarios_empresa', v_user::text, jsonb_build_object('papel', v_papel, 'ativo', v_ativo, 'permissoes', p->'permissoes'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gestao_usuario_remover(p_emp uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform private.exige_gerir(p_emp);
  if p_user = auth.uid() and not private.sou_admin() then raise exception 'Você não pode remover a si mesmo.'; end if;
  delete from public.usuarios_empresa where empresa_id = p_emp and user_id = p_user;
  perform private.audita(p_emp, 'GESTAO_USUARIO_REMOVIDO', 'usuarios_empresa', p_user::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- usada pela função de convite (Edge Function, com a chave de serviço): liga o usuário à empresa
create or replace function public.gestao_vincular(p_emp uuid, p_user uuid, p_email text, p_nome text, p_papel text, p_perm jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if upper(coalesce(p_papel, '')) not in ('DONO', 'SUPERVISOR', 'FINANCEIRO', 'OPERADOR') then raise exception 'Papel inválido.'; end if;
  insert into public.usuarios_empresa (user_id, empresa_id, papel, nome, email, permissoes, ativo, atualizado_em)
  values (p_user, p_emp, upper(p_papel), p_nome, lower(p_email), coalesce(p_perm, '{}'::jsonb), true, now())
  on conflict (user_id, empresa_id) do update set papel = excluded.papel, nome = coalesce(excluded.nome, public.usuarios_empresa.nome), email = excluded.email, permissoes = excluded.permissoes, ativo = true, atualizado_em = now();
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.gestao_usuario_por_email(p_email text) returns uuid language sql stable security definer set search_path to '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
create or replace function public.gestao_pode_gerir(p_emp uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select auth.uid() is not null and private.pode_gerir(p_emp);
$$;

-- ---------- acesso de campo (operadores e facções) ----------
create or replace function public.gestao_campo(p_emp uuid) returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform private.exige_gerir(p_emp);
  return jsonb_build_object(
    'link', (select valor from public.app_parametros where empresa_id = p_emp and chave = 'LINK_APP_CAMPO'),
    'operadores', coalesce((select jsonb_agg(jsonb_build_object('id', o.id_operador, 'nome', o.nome, 'login', coalesce(o.matricula, ''), 'telefone', coalesce(o.telefone, ''),
        'acesso', coalesce(o.acesso_app, false), 'modo', coalesce(nullif(o.modo_app, ''), 'AMBOS'), 'lider', coalesce(o.lider_app, false),
        'tem_senha', coalesce(o.senha_hash, '') <> '', 'senha_em', o.senha_em, 'ultimo_acesso', o.ultimo_acesso_app) order by o.nome)
      from public.cad_operadores o where o.empresa_id = p_emp and o.ativo), '[]'::jsonb),
    'faccoes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id_destino, 'nome', d.nome_destino, 'login', coalesce(d.codigo_acesso, ''), 'telefone', coalesce(nullif(d.whatsapp, ''), d.telefone, ''),
        'acesso', coalesce(d.acesso_app, false), 'tem_senha', coalesce(d.senha_hash, '') <> '', 'senha_em', d.senha_em, 'ultimo_acesso', d.ultimo_acesso_app,
        'responsavel', coalesce(d.responsavel, '')) order by d.nome_destino)
      from public.cad_destinos d where d.empresa_id = p_emp and d.ativo and upper(d.tipo_destino) = 'FACCAO'), '[]'::jsonb));
end $$;

create or replace function public.gestao_campo_salvar(p_emp uuid, p jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_tipo text := case when upper(coalesce(p->>'tipo', '')) = 'FACCAO' then 'FACCAO' else 'OPERADOR' end;
  v_id text := coalesce(p->>'id', ''); v_login text := upper(btrim(coalesce(p->>'login', '')));
  v_acesso boolean := coalesce((p->>'acesso')::boolean, true); v_senha text := btrim(coalesce(p->>'senha', ''));
  v_modo text := upper(coalesce(nullif(p->>'modo', ''), 'AMBOS')); v_tem boolean; v_salt text; v_hash text; v_quando timestamptz := date_trunc('milliseconds', now());
begin
  perform private.exige_gerir(p_emp);
  if v_login = '' then raise exception '%', case when v_tipo = 'FACCAO' then 'Informe o código de acesso da facção.' else 'Informe a matrícula do operador (ela é o usuário do app).' end; end if;
  if v_login !~ '^[A-Z0-9._-]{2,30}$' then raise exception 'Use só letras, números, ponto, hífen ou sublinhado no código (2 a 30 caracteres).'; end if;
  if v_senha <> '' and v_senha !~ '^\S{4,32}$' then raise exception 'A senha precisa ter de 4 a 32 caracteres, sem espaços.'; end if;
  if v_senha <> '' then v_salt := replace(gen_random_uuid()::text, '-', ''); v_hash := private.campo_hash(v_senha, v_salt); end if;
  if v_tipo = 'OPERADOR' then
    if v_modo not in ('MARCADOR', 'APONTADOR', 'AMBOS') then raise exception 'Modo inválido.'; end if;
    if exists (select 1 from public.cad_operadores o where o.empresa_id = p_emp and o.ativo and upper(btrim(o.matricula)) = v_login and o.id_operador <> v_id) then raise exception 'A matrícula % já é usada por outro operador.', v_login; end if;
    select coalesce(o.senha_hash, '') <> '' into v_tem from public.cad_operadores o where o.empresa_id = p_emp and o.id_operador = v_id;
    if v_tem is null then raise exception 'Operador não encontrado.'; end if;
    if v_acesso and not v_tem and v_senha = '' then raise exception 'Crie uma senha para liberar o acesso.'; end if;
    update public.cad_operadores set matricula = v_login, acesso_app = v_acesso, modo_app = v_modo, lider_app = coalesce((p->>'lider')::boolean, lider_app),
      telefone = coalesce(p->>'telefone', telefone), atualizado_em = now(),
      senha_salt = coalesce(v_salt, senha_salt), senha_hash = coalesce(v_hash, senha_hash), senha_em = case when v_hash is null then senha_em else v_quando end
    where empresa_id = p_emp and id_operador = v_id;
  else
    if exists (select 1 from public.cad_destinos d where d.empresa_id = p_emp and d.ativo and upper(d.tipo_destino) = 'FACCAO' and upper(btrim(d.codigo_acesso)) = v_login and d.id_destino <> v_id) then raise exception 'O código % já é usado por outra facção.', v_login; end if;
    select coalesce(d.senha_hash, '') <> '' into v_tem from public.cad_destinos d where d.empresa_id = p_emp and d.id_destino = v_id;
    if v_tem is null then raise exception 'Facção não encontrada.'; end if;
    if v_acesso and not v_tem and v_senha = '' then raise exception 'Crie uma senha para liberar o acesso.'; end if;
    update public.cad_destinos set codigo_acesso = v_login, acesso_app = v_acesso, whatsapp = coalesce(p->>'telefone', whatsapp), atualizado_em = now(),
      senha_salt = coalesce(v_salt, senha_salt), senha_hash = coalesce(v_hash, senha_hash), senha_em = case when v_hash is null then senha_em else v_quando end
    where empresa_id = p_emp and id_destino = v_id;
  end if;
  perform private.toca_revisao(p_emp);
  perform private.audita(p_emp, 'ACESSO_APP_CAMPO', case when v_tipo = 'FACCAO' then 'CAD_DESTINOS' else 'CAD_OPERADORES' end, v_id,
    jsonb_build_object('LOGIN', v_login, 'ACESSO_APP', v_acesso, 'SENHA_ALTERADA', v_senha <> '', 'ORIGEM', 'app de gestão'));
  return jsonb_build_object('ok', true, 'login', v_login);
end $$;

create or replace function public.gestao_link_campo(p_emp uuid, p_link text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform private.exige_gerir(p_emp);
  insert into public.app_parametros (empresa_id, chave, valor, atualizado_em, atualizado_por) values (p_emp, 'LINK_APP_CAMPO', btrim(coalesce(p_link, '')), now(), private.meu_email())
  on conflict (empresa_id, chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  perform private.toca_revisao(p_emp);
  return jsonb_build_object('ok', true);
end $$;

-- permissões de execução
revoke all on function public.gestao_eu(), public.gestao_empresas(), public.gestao_empresa_salvar(jsonb), public.gestao_usuarios(uuid),
  public.gestao_usuario_salvar(uuid, jsonb), public.gestao_usuario_remover(uuid, uuid), public.gestao_campo(uuid), public.gestao_campo_salvar(uuid, jsonb),
  public.gestao_link_campo(uuid, text), public.gestao_pode_gerir(uuid), public.gestao_vincular(uuid, uuid, text, text, text, jsonb), public.gestao_usuario_por_email(text) from public, anon;
grant execute on function public.gestao_eu(), public.gestao_empresas(), public.gestao_empresa_salvar(jsonb), public.gestao_usuarios(uuid),
  public.gestao_usuario_salvar(uuid, jsonb), public.gestao_usuario_remover(uuid, uuid), public.gestao_campo(uuid), public.gestao_campo_salvar(uuid, jsonb),
  public.gestao_link_campo(uuid, text), public.gestao_pode_gerir(uuid) to authenticated;
grant execute on function public.gestao_vincular(uuid, uuid, text, text, text, jsonb), public.gestao_usuario_por_email(text) to service_role;
