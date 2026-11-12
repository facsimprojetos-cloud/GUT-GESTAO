-- gut_021 — Limites por empresa (acessos) e controle de máquinas (o mesmo login em duas máquinas).
--
-- Empresa (definido pelo administrador da plataforma no app de gestão):
--   limite_usuarios       → quantos acessos ativos ao sistema a empresa pode ter (vazio = sem limite; o administrador não conta)
--   maquinas_por_usuario  → em quantas máquinas o MESMO login pode estar aberto ao mesmo tempo (padrão 1)
--   maquinas_dono         → idem para o dono da empresa (padrão 3: escritório, celular, TV da fábrica)
-- Máquina = navegador identificado por um código guardado nele (gut-dispositivo). Ao entrar numa máquina nova com o
-- limite cheio, a pessoa vê onde o acesso está aberto e pode "usar aqui", o que desconecta a máquina mais antiga.
-- A máquina desconectada é barrada pelo servidor no próximo clique (erro GT001) e volta para a tela de entrada.
-- O administrador da plataforma não tem limite.

alter table public.empresas add column if not exists limite_usuarios integer;
alter table public.empresas add column if not exists maquinas_por_usuario integer not null default 1;
alter table public.empresas add column if not exists maquinas_dono integer not null default 3;

create table if not exists private.sessoes_maquina (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null,
  dispositivo text not null,
  nome text not null default '',
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  ativo boolean not null default true,
  encerrado_em timestamptz,
  encerrado_motivo text
);
create index if not exists sessoes_maquina_ativas on private.sessoes_maquina (empresa_id, user_id) where ativo;
create unique index if not exists sessoes_maquina_uma on private.sessoes_maquina (empresa_id, user_id, dispositivo) where ativo;
alter table private.sessoes_maquina enable row level security;   -- sem políticas: só pelas funções abaixo
revoke all on private.sessoes_maquina from anon, authenticated;

create or replace function private.maquinas_limite(p_emp uuid, p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(1, case when u.papel = 'DONO' then e.maquinas_dono else e.maquinas_por_usuario end)
    from public.empresas e left join public.usuarios_empresa u on u.empresa_id = e.id and u.user_id = p_user
   where e.id = p_emp
$$;

-- a máquina desta chamada está liberada? (usada pelo servidor em toda leitura e gravação)
create or replace function private.maquina_confere(p_emp uuid, p_dispositivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uso timestamptz;
begin
  if private.sou_admin() then return; end if;
  select id, ultimo_uso into v_id, v_uso from private.sessoes_maquina
   where empresa_id = p_emp and user_id = auth.uid() and dispositivo = coalesce(p_dispositivo, '') and ativo;
  if v_id is null then
    raise exception 'Este acesso foi aberto em outra máquina (ou esta máquina foi desconectada).' using errcode = 'GT001';
  end if;
  if v_uso < now() - interval '1 minute' then update private.sessoes_maquina set ultimo_uso = now() where id = v_id; end if;
end $$;

-- entrar nesta máquina: { ok } ou { ok:false, limite, em_uso:[{nome, ultimo_uso}] }
create or replace function public.web_maquina_entrar(p_slug text, p_dispositivo text, p_nome text, p_assumir boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_lim int; v_outras int; v_disp text := btrim(coalesce(p_dispositivo, ''));
begin
  v_emp := private.web_empresa(p_slug);
  if length(v_disp) < 16 then raise exception 'Identificação da máquina inválida.'; end if;
  if private.sou_admin() then return jsonb_build_object('ok', true, 'admin', true); end if;
  perform pg_advisory_xact_lock(hashtextextended('gut-maquina:' || v_emp::text || ':' || auth.uid()::text, 0));
  if exists (select 1 from private.sessoes_maquina where empresa_id = v_emp and user_id = auth.uid() and dispositivo = v_disp and ativo) then
    update private.sessoes_maquina set ultimo_uso = now(), nome = coalesce(nullif(btrim(p_nome), ''), nome)
     where empresa_id = v_emp and user_id = auth.uid() and dispositivo = v_disp and ativo;
    return jsonb_build_object('ok', true);
  end if;
  v_lim := private.maquinas_limite(v_emp, auth.uid());
  select count(*) into v_outras from private.sessoes_maquina where empresa_id = v_emp and user_id = auth.uid() and ativo;
  if v_outras >= v_lim then
    if not coalesce(p_assumir, false) then
      return jsonb_build_object('ok', false, 'limite', v_lim, 'em_uso', coalesce((select jsonb_agg(jsonb_build_object('nome', s.nome, 'ultimo_uso', s.ultimo_uso, 'desde', s.criado_em) order by s.ultimo_uso desc)
        from private.sessoes_maquina s where s.empresa_id = v_emp and s.user_id = auth.uid() and s.ativo), '[]'::jsonb));
    end if;
    -- desconecta as mais antigas para caber esta
    update private.sessoes_maquina set ativo = false, encerrado_em = now(), encerrado_motivo = 'outra máquina entrou: ' || coalesce(nullif(btrim(p_nome), ''), 'sem nome')
     where id in (select id from private.sessoes_maquina where empresa_id = v_emp and user_id = auth.uid() and ativo order by ultimo_uso asc limit (v_outras - v_lim + 1));
    perform private.web_audita(v_emp, 'MAQUINA_ASSUMIU', 'sessoes_maquina', auth.uid()::text, null, jsonb_build_object('maquina', p_nome));
  end if;
  insert into private.sessoes_maquina (empresa_id, user_id, dispositivo, nome) values (v_emp, auth.uid(), v_disp, coalesce(nullif(btrim(p_nome), ''), 'Máquina'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.web_maquina_sair(p_slug text, p_dispositivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  update private.sessoes_maquina set ativo = false, encerrado_em = now(), encerrado_motivo = 'saiu'
   where empresa_id = v_emp and user_id = auth.uid() and dispositivo = coalesce(p_dispositivo, '') and ativo;
  return jsonb_build_object('ok', true);
end $$;

-- app de gestão: máquinas abertas da empresa e desconectar
create or replace function public.gestao_maquinas(p_emp uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exige_gerir(p_emp);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'nome', s.nome, 'desde', s.criado_em, 'ultimo_uso', s.ultimo_uso) order by s.ultimo_uso desc)
    from private.sessoes_maquina s where s.empresa_id = p_emp and s.ativo), '[]'::jsonb);
end $$;
create or replace function public.gestao_maquina_desconectar(p_emp uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.exige_gerir(p_emp);
  update private.sessoes_maquina set ativo = false, encerrado_em = now(), encerrado_motivo = 'desconectada por ' || private.meu_email()
   where id = p_id and empresa_id = p_emp and ativo;
  perform private.audita(p_emp, 'GESTAO_MAQUINA_DESCONECTAR', 'sessoes_maquina', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- limite de acessos ativos por empresa (o administrador da plataforma não conta)
create or replace function private.limite_usuarios_confere(p_emp uuid, p_user uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_lim int; v_n int;
begin
  select limite_usuarios into v_lim from public.empresas where id = p_emp;
  if v_lim is null then return; end if;
  select count(*) into v_n from public.usuarios_empresa u
   where u.empresa_id = p_emp and u.ativo and u.user_id <> p_user
     and not exists (select 1 from public.plataforma_admins a where a.user_id = u.user_id);
  if v_n >= v_lim then
    raise exception 'A empresa já usa os % acessos do plano. Desative alguém ou fale com o suporte para aumentar.', v_lim;
  end if;
end $$;

create or replace function public.gestao_vincular(p_emp uuid, p_user uuid, p_email text, p_nome text, p_papel text, p_perm jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if upper(coalesce(p_papel, '')) not in ('DONO', 'SUPERVISOR', 'FINANCEIRO', 'OPERADOR') then raise exception 'Papel inválido.'; end if;
  if not exists (select 1 from public.plataforma_admins a where a.user_id = p_user) then perform private.limite_usuarios_confere(p_emp, p_user); end if;
  insert into public.usuarios_empresa (user_id, empresa_id, papel, nome, email, permissoes, ativo, atualizado_em)
  values (p_user, p_emp, upper(p_papel), p_nome, lower(p_email), coalesce(p_perm, '{}'::jsonb), true, now())
  on conflict (user_id, empresa_id) do update set papel = excluded.papel, nome = coalesce(excluded.nome, public.usuarios_empresa.nome), email = excluded.email, permissoes = excluded.permissoes, ativo = true, atualizado_em = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gestao_usuario_salvar(p_emp uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (p->>'user_id')::uuid; v_papel text := upper(coalesce(p->>'papel', 'OPERADOR')); v_ativo boolean := coalesce((p->>'ativo')::boolean, true); v_antes boolean;
begin
  perform private.exige_gerir(p_emp);
  if v_papel not in ('DONO', 'SUPERVISOR', 'FINANCEIRO', 'OPERADOR') then raise exception 'Papel inválido.'; end if;
  if v_user = auth.uid() and not private.sou_admin() and (v_papel <> 'DONO' or not v_ativo) then raise exception 'Você não pode tirar o seu próprio acesso de dono.'; end if;
  select ativo into v_antes from public.usuarios_empresa where empresa_id = p_emp and user_id = v_user;
  if v_ativo and not coalesce(v_antes, false) and not exists (select 1 from public.plataforma_admins a where a.user_id = v_user) then
    perform private.limite_usuarios_confere(p_emp, v_user);
  end if;
  update public.usuarios_empresa set nome = coalesce(p->>'nome', nome), papel = v_papel, permissoes = coalesce(p->'permissoes', permissoes), ativo = v_ativo, atualizado_em = now()
  where empresa_id = p_emp and user_id = v_user;
  if not found then raise exception 'Usuário não encontrado nesta empresa.'; end if;
  if not v_ativo then
    update private.sessoes_maquina set ativo = false, encerrado_em = now(), encerrado_motivo = 'acesso desativado'
     where empresa_id = p_emp and user_id = v_user and ativo;
  end if;
  perform private.audita(p_emp, 'GESTAO_USUARIO', 'usuarios_empresa', v_user::text, jsonb_build_object('papel', v_papel, 'ativo', v_ativo, 'permissoes', p->'permissoes'));
  return jsonb_build_object('ok', true);
end $$;

-- empresas: o administrador define os limites; a lista mostra o uso
create or replace function public.gestao_empresa_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_nome text := btrim(coalesce(p->>'nome', '')); v_slug text; v_status text := upper(coalesce(nullif(p->>'status', ''), 'ATIVA'));
  v_lim int := nullif(btrim(coalesce(p->>'limite_usuarios', '')), '')::int;
  v_maq int := coalesce(nullif(btrim(coalesce(p->>'maquinas_por_usuario', '')), '')::int, 1);
  v_maqd int := coalesce(nullif(btrim(coalesce(p->>'maquinas_dono', '')), '')::int, 3);
begin
  if not private.sou_admin() then raise exception 'Só o administrador da plataforma cadastra empresas.'; end if;
  if length(v_nome) < 2 then raise exception 'Informe o nome da empresa.'; end if;
  if v_lim is not null and v_lim < 1 then raise exception 'O limite de acessos precisa ser pelo menos 1 (ou vazio para sem limite).'; end if;
  if v_maq < 1 or v_maqd < 1 then raise exception 'O número de máquinas precisa ser pelo menos 1.'; end if;
  v_slug := lower(regexp_replace(coalesce(nullif(btrim(p->>'slug'), ''), v_nome), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then raise exception 'Código da empresa inválido.'; end if;
  if exists (select 1 from public.empresas e where e.slug = v_slug and e.id is distinct from v_id) then raise exception 'Já existe uma empresa com o código %.', v_slug; end if;
  if v_id is null then
    insert into public.empresas (nome, slug, cnpj, contato, email, telefone, plano, status, inicio, observacao, atualizado_em, limite_usuarios, maquinas_por_usuario, maquinas_dono)
    values (v_nome, v_slug, p->>'cnpj', p->>'contato', p->>'email', p->>'telefone', coalesce(nullif(p->>'plano', ''), 'TESTE'), v_status, nullif(p->>'inicio', '')::date, p->>'observacao', now(), v_lim, v_maq, v_maqd)
    returning id into v_id;
    insert into public.app_controle (empresa_id, versao_schema, revisao, atualizado_em) values (v_id, '4.6.0', 'gestao-' || gen_random_uuid()::text, now()) on conflict do nothing;
  else
    update public.empresas set nome = v_nome, slug = v_slug, cnpj = p->>'cnpj', contato = p->>'contato', email = p->>'email', telefone = p->>'telefone',
      plano = coalesce(nullif(p->>'plano', ''), plano), status = v_status, inicio = nullif(p->>'inicio', '')::date, observacao = p->>'observacao', atualizado_em = now(),
      limite_usuarios = v_lim, maquinas_por_usuario = v_maq, maquinas_dono = v_maqd
    where id = v_id;
    if not found then raise exception 'Empresa não encontrada.'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.gestao_empresas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.sou_admin() then raise exception 'Só o administrador da plataforma vê todas as empresas.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'slug', e.slug, 'cnpj', e.cnpj, 'contato', e.contato, 'email', e.email, 'telefone', e.telefone,
      'plano', e.plano, 'status', e.status, 'inicio', e.inicio, 'observacao', e.observacao, 'criado_em', e.criado_em,
      'limite_usuarios', e.limite_usuarios, 'maquinas_por_usuario', e.maquinas_por_usuario, 'maquinas_dono', e.maquinas_dono,
      'usuarios', (select count(*) from public.usuarios_empresa u where u.empresa_id = e.id and u.ativo and not exists (select 1 from public.plataforma_admins a where a.user_id = u.user_id)),
      'maquinas', (select count(*) from private.sessoes_maquina s where s.empresa_id = e.id and s.ativo),
      'operadores', (select count(*) from public.cad_operadores o where o.empresa_id = e.id and o.ativo),
      'operadores_app', (select count(*) from public.cad_operadores o where o.empresa_id = e.id and o.ativo and o.acesso_app),
      'faccoes', (select count(*) from public.cad_destinos d where d.empresa_id = e.id and d.ativo and upper(d.tipo_destino) = 'FACCAO'),
      'faccoes_app', (select count(*) from public.cad_destinos d where d.empresa_id = e.id and d.ativo and upper(d.tipo_destino) = 'FACCAO' and d.acesso_app),
      'ultimo_uso', (select max(c.atualizado_em) from public.app_controle c where c.empresa_id = e.id)
    ) order by e.nome) from public.empresas e), '[]'::jsonb);
end $$;

-- o servidor passa a exigir a máquina liberada em toda leitura e gravação
drop function if exists public.servidor_ler(text, text[], text, text, text);
create or replace function public.servidor_ler(p_slug text, p_tabelas text[], p_op text default null, p_acao text default '', p_chave text default '', p_dispositivo text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_emp uuid; r jsonb;
begin
  perform private.servidor_confere(p_chave);
  v_emp := private.web_empresa(p_slug);
  perform private.maquina_confere(v_emp, p_dispositivo);
  perform private.servidor_exige(v_emp, p_acao, (select m.tipo = 'editar' from private.acao_modulo(p_acao) m));
  r := public.web_ler(p_slug, p_tabelas, p_op);
  return r || jsonb_build_object('__email', private.meu_email());
end $$;

drop function if exists public.servidor_aplicar(text, jsonb, text, text);
create or replace function public.servidor_aplicar(p_slug text, p_ops jsonb, p_acao text default '', p_chave text default '', p_dispositivo text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  perform private.servidor_confere(p_chave);
  v_emp := private.web_gravacao(p_slug);
  perform private.maquina_confere(v_emp, p_dispositivo);
  perform private.servidor_exige(v_emp, p_acao, true);
  return private.aplicar_ops(v_emp, p_ops);
end $$;

revoke all on function public.servidor_ler(text, text[], text, text, text, text) from public, anon;
revoke all on function public.servidor_aplicar(text, jsonb, text, text, text) from public, anon;
grant execute on function public.servidor_ler(text, text[], text, text, text, text) to authenticated;
grant execute on function public.servidor_aplicar(text, jsonb, text, text, text) to authenticated;
revoke all on function public.web_maquina_entrar(text, text, text, boolean) from public, anon;
revoke all on function public.web_maquina_sair(text, text) from public, anon;
revoke all on function public.gestao_maquinas(uuid) from public, anon;
revoke all on function public.gestao_maquina_desconectar(uuid, uuid) from public, anon;
grant execute on function public.web_maquina_entrar(text, text, text, boolean) to authenticated;
grant execute on function public.web_maquina_sair(text, text) to authenticated;
grant execute on function public.gestao_maquinas(uuid) to authenticated;
grant execute on function public.gestao_maquina_desconectar(uuid, uuid) to authenticated;

-- correção de segurança: vincular usuário e procurar usuário por e-mail só pelo servidor (função gestao-convite,
-- que já confere se quem pede pode gerir a empresa). Antes qualquer pessoa logada podia se vincular a qualquer empresa.
revoke execute on function public.gestao_vincular(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.gestao_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.gestao_vincular(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.gestao_usuario_por_email(text) to service_role;
