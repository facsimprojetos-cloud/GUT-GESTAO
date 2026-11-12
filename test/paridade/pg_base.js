// Monta um Postgres local que imita o banco do Supabase do GUT PPCP (mesmas tabelas e funções de base),
// para testar as funções SQL web_* sem tocar no banco de verdade.
//   const pg = require('./pg_base'); await pg.subir(); pg.sql('select 1'); pg.descer();
// Usa o Postgres 16 instalado na máquina (/usr/lib/postgresql/16). Cada execução começa de um banco vazio.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const BIN = '/usr/lib/postgresql/16/bin';
const DIR = path.join(os.tmpdir(), 'gut_pg_paridade'), PORT = 54329, SOCK = '/tmp';
const ROOT = path.join(__dirname, '..', '..');
const SCHEMA = require('./schema.json');
const TIPO = { t: 'text', n: 'numeric', d: 'date', z: 'timestamptz', b: 'boolean' };

function comoPostgres(cmd, args, opts) {
  // o Postgres não roda como root: usa o usuário postgres
  const r = spawnSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(cmd + ' falhou: ' + (r.stderr || r.stdout));
  return r.stdout;
}
function psql(sqlText, { json = false, banco = 'gut' } = {}) {
  const f = path.join(DIR, 'q_' + process.pid + '.sql');
  fs.writeFileSync(f, sqlText); fs.chmodSync(f, 0o644);
  const args = ['-h', SOCK, '-p', String(PORT), '-d', banco, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-t', '-A', '-f', f];
  const r = spawnSync('runuser', ['-u', 'postgres', '--', BIN + '/psql', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    const txt = (r.stderr || '').trim(), m = txt.match(/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/);
    const e = new Error(m ? m[2] : txt); e.code = m ? m[1] : ''; e.sql = sqlText; e.completo = txt; throw e;
  }
  const out = r.stdout.trim();
  return json ? (out ? JSON.parse(out.split('\n').pop()) : null) : out;
}

function ddlTabelas() {
  return Object.entries(SCHEMA).map(([t, def]) => {
    const [pk, cols] = def.split('|');
    const c = cols.split(',').map(x => { const [n, k] = x.split(':'); return `${n} ${TIPO[k]}`; });
    return `create table public.${t} (empresa_id uuid not null references public.empresas(id), ${c.join(', ')}, sincronizado_em timestamptz default now(), ordem_linha bigint generated always as identity, primary key (empresa_id, ${pk}));\nalter table public.${t} enable row level security;`;
  }).join('\n');
}

// Supabase de mentira: auth.uid() vem do parâmetro 'gut.uid' da sessão; realtime.send não faz nada.
const STUB = `
create extension if not exists pgcrypto;
create schema if not exists extensions; create schema if not exists auth; create schema if not exists private; create schema if not exists realtime;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create or replace function extensions.digest(data bytea, type text) returns bytea language sql immutable as $f$ select public.digest(data, type) $f$;
create or replace function extensions.digest(data text, type text) returns bytea language sql immutable as $f$ select public.digest(data, type) $f$;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('gut.uid', true), '')::uuid $f$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as $f$ select $f$;
create table public.empresas (id uuid primary key default gen_random_uuid(), nome text, slug text unique, plano text default 'TESTE', status text default 'ATIVA',
  criado_em timestamptz default now(), cnpj text, contato text, email text, telefone text, observacao text, inicio date, atualizado_em timestamptz);
create table public.usuarios_empresa (user_id uuid, empresa_id uuid references public.empresas(id), papel text default 'OPERADOR', criado_em timestamptz default now(),
  nome text, email text, permissoes jsonb default '{}'::jsonb, ativo boolean default true, atualizado_em timestamptz, primary key (user_id, empresa_id));
create schema if not exists storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
create table public.plataforma_admins (user_id uuid primary key, criado_em timestamptz default now());
${ddlTabelas()}
-- funções de base que já existem no Supabase (gut_002/003/006/008)
create table private.tokens_importacao (token_hash text primary key, empresa_id uuid, revogado boolean default false, expira_em timestamptz);
create or replace function public.sou_dono(p_empresa uuid) returns boolean language sql stable security definer set search_path to '' as $f$
  select exists (select 1 from public.usuarios_empresa where user_id = auth.uid() and empresa_id = p_empresa and papel = 'DONO' and ativo) $f$;
create or replace function public.minhas_empresas() returns setof uuid language sql stable security definer set search_path to '' as $f$
  select empresa_id from public.usuarios_empresa where user_id = auth.uid() and ativo $f$;
create or replace function public.gestao_eu() returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare v_admin boolean; r jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no sistema primeiro.'; end if;
  v_admin := private.sou_admin();
  select jsonb_build_object('user', jsonb_build_object('id', auth.uid(), 'email', private.meu_email()), 'admin', v_admin,
    'empresas', coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug, 'status', e.status, 'plano', e.plano,
        'papel', case when v_admin then coalesce(u.papel, 'ADMIN') else u.papel end, 'permissoes', coalesce(u.permissoes, '{}'::jsonb)) order by e.nome), '[]'::jsonb))
  into r from public.empresas e left join public.usuarios_empresa u on u.empresa_id = e.id and u.user_id = auth.uid()
  where v_admin or (u.user_id is not null and u.ativo);
  return r;
end $f$;
grant execute on function public.gestao_eu() to authenticated;
create or replace function private.tabela_importavel(p_tabela text) returns boolean language sql stable security definer set search_path to '' as $f$
  select exists(select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = p_tabela and c.column_name = 'empresa_id')
     and p_tabela not in ('empresas','usuarios_empresa') $f$;
create or replace function private.colunas_chave(p_tabela text) returns text[] language sql stable security definer set search_path to '' as $f$
  select coalesce(array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)), '{}')
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = format('public.%I', p_tabela)::regclass and i.indisprimary and a.attname <> 'empresa_id' $f$;
create or replace function private.colunas_dados(p_tabela text) returns text[] language sql stable security definer set search_path to '' as $f$
  select coalesce(array_agg(c.column_name::text order by c.ordinal_position), '{}') from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_tabela and c.column_name not in ('empresa_id','sincronizado_em','ordem_linha') $f$;
create or replace function private.sou_admin() returns boolean language sql stable security definer set search_path to '' as $f$
  select exists (select 1 from public.plataforma_admins a where a.user_id = auth.uid()) $f$;
create or replace function private.meu_email() returns text language sql stable security definer set search_path to '' as $f$
  select coalesce((select email from auth.users where id = auth.uid()), 'gestao') $f$;
create or replace function private.toca_revisao(p_emp uuid) returns void language sql security definer set search_path to '' as $f$
  update public.app_controle set revisao = 'gestao-' || gen_random_uuid()::text, atualizado_em = now() where empresa_id = p_emp $f$;
create or replace function private.campo_trava(p_emp uuid) returns void language sql as $f$ select pg_advisory_xact_lock(hashtextextended('gut-campo:' || p_emp::text, 0)) $f$;
create or replace function private.hoje_sp() returns date language sql stable as $f$ select (now() at time zone 'America/Sao_Paulo')::date $f$;
-- como no Supabase: o usuário logado tem permissão de tabela e o RLS "tudo na própria empresa" (gut_002)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
do $g$ declare t text; begin
  for t in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'empresa_id' and table_name not in ('usuarios_empresa') group by table_name loop
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id in (select public.minhas_empresas())) with check (empresa_id in (select public.minhas_empresas()))', t || ': só a própria empresa', t);
  end loop; end $g$;
create or replace function private.r2(x numeric) returns numeric language sql immutable as $f$ select round(coalesce(x,0), 2) $f$;
`;


// As RPCs que o Apps Script usa (gut_004/005), iguais às do Supabase; o token é aceito sem conferência.
const SERVIDOR = `
create or replace function private.empresa_do_token(p_token text) returns uuid language sql stable as $f$ select id from public.empresas where slug = 'gut' $f$;
create or replace function public.gut_schema(p_token text) returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare r jsonb;
begin
  perform private.empresa_do_token(p_token);
  select jsonb_object_agg(t.table_name, jsonb_build_object('cols', t.cols, 'pk', to_jsonb(private.colunas_chave(t.table_name)))) into r from (
    select c.table_name::text as table_name, jsonb_agg(jsonb_build_array(c.column_name, c.data_type) order by c.ordinal_position) as cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.column_name not in ('empresa_id','sincronizado_em','ordem_linha')
       and private.tabela_importavel(c.table_name)
     group by c.table_name) t;
  return r;
end $f$;
create or replace function public.gut_ler(p_token text, p_tabelas text[], p_op text default null) returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare v_emp uuid; t text; r jsonb := '{}'::jsonb; rows jsonb; op jsonb;
begin
  v_emp := private.empresa_do_token(p_token);
  foreach t in array coalesce(p_tabelas, '{}') loop
    if not private.tabela_importavel(t) then raise exception 'Tabela não permitida: %', t; end if;
    execute format('select coalesce(jsonb_agg((to_jsonb(x) - ''empresa_id'' - ''sincronizado_em'' - ''ordem_linha'') order by x.ordem_linha), ''[]''::jsonb) from public.%I x where x.empresa_id = $1', t)
      into rows using v_emp;
    r := r || jsonb_build_object(t, rows);
  end loop;
  if p_op is not null then
    select to_jsonb(o) - 'empresa_id' - 'sincronizado_em' - 'ordem_linha' into op from public.app_operacoes o where o.empresa_id = v_emp and o.id_operacao = p_op;
    r := r || jsonb_build_object('__op', coalesce(op, 'null'::jsonb));
  end if;
  return r;
end $f$;
create or replace function public.gut_operacao(p_token text, p_id text) returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare v_emp uuid; r jsonb;
begin
  v_emp := private.empresa_do_token(p_token);
  select to_jsonb(o) - 'empresa_id' - 'sincronizado_em' - 'ordem_linha' into r from public.app_operacoes o where o.empresa_id = v_emp and o.id_operacao = p_id;
  return r;
end $f$;
create or replace function public.gut_aplicar(p_token text, p_ops jsonb) returns jsonb language plpgsql security definer set search_path to '' as $f$
declare v_emp uuid; op jsonb; t text; v_cols text[]; v_pk text[]; v_pkx text; v_pkr text; it jsonb; v_set text; n int; tot int := 0;
begin
  v_emp := private.empresa_do_token(p_token);
  for op in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    t := op->>'t';
    if not private.tabela_importavel(t) then raise exception 'Tabela não permitida: %', t; end if;
    v_cols := private.colunas_dados(t); v_pk := private.colunas_chave(t);
    select string_agg(format('x.%I', c), ', '), string_agg(format('r.%I', c), ', ') into v_pkx, v_pkr from unnest(v_pk) c;
    for it in select * from jsonb_array_elements(coalesce(op->'del', '[]'::jsonb)) loop
      execute format('delete from public.%I x using jsonb_populate_record(null::public.%I, $2) r where x.empresa_id = $1 and (%s) = (%s)', t, t, v_pkx, v_pkr) using v_emp, it;
      get diagnostics n = row_count; tot := tot + n;
    end loop;
    for it in select * from jsonb_array_elements(coalesce(op->'upd', '[]'::jsonb)) loop
      select string_agg(format('%1$I = r.%1$I', k), ', ') into v_set
        from jsonb_object_keys(it->'s') k where k = any(v_cols) and k <> all(v_pk);
      if v_set is null then continue; end if;
      execute format('update public.%I x set %s, sincronizado_em = now() from jsonb_populate_record(null::public.%I, $2) r where x.empresa_id = $1 and (%s) = (%s)', t, v_set, t, v_pkx, v_pkr)
        using v_emp, (it->'s') || (it->'k');
      get diagnostics n = row_count;
      if n <> 1 then raise exception 'Registro não encontrado para atualizar em % (%). Atualize a tela e tente de novo.', t, it->'k'; end if;
      tot := tot + n;
    end loop;
    if jsonb_array_length(coalesce(op->'ins', '[]'::jsonb)) > 0 then
      execute format('insert into public.%1$I (empresa_id, %2$s) select $1, %2$s from jsonb_populate_recordset(null::public.%1$I, $2)',
        t, (select string_agg(quote_ident(c), ', ') from unnest(v_cols) c)) using v_emp, op->'ins';
      get diagnostics n = row_count; tot := tot + n;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'linhas', tot);
end $f$;
create or replace function public.gut_garantir_colunas(p_token text, p_tabela text, p_cols text[]) returns jsonb language plpgsql security definer set search_path to '' as $f$
declare c text; falta text[] := '{}';
begin
  foreach c in array coalesce(p_cols, '{}') loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = lower(p_tabela) and column_name = lower(c)) then falta := falta || c; end if;
  end loop;
  if cardinality(falta) > 0 then raise exception 'Simulador: o Code.gs pediu colunas que o banco não tem em %: %', p_tabela, falta; end if;
  return public.gut_schema(p_token) -> lower(p_tabela);
end $f$;
`;

// migrações do repositório que entram no banco de teste (só as partes que não dependem do app de campo)
function migracoes() {
  const m10 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/gut_010_quadros_web.sql'), 'utf8');
  // de gut_010 só as funções web_empresa e web_j (os gatilhos ao vivo dependem do app de campo)
  const pega = nome => { const i = m10.indexOf('create or replace function ' + nome); const f = m10.indexOf('$$;', m10.indexOf('$$', m10.indexOf('$$', i) + 2)); return m10.slice(i, f + 3); };
  const fim = m10.indexOf('grant execute on function public.web_empresa_id(text) to authenticated;');
  const lista = [pega('private.web_empresa'), pega('private.web_j'), m10.slice(m10.indexOf('create or replace function public.web_empresa_id'), fim) + 'grant execute on function public.web_empresa_id(text) to authenticated;'];
  fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(f => /^gut_0(1[4-9]|[2-9]\d)_/.test(f)).sort()
    .forEach(f => lista.push('-- ' + f + '\n' + fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')));
  return lista.join('\n');
}

const CHAVE_TESTE = 'chave-de-teste-do-servidor';
const EMP = '4eb0139a-ddcb-4e95-bd06-087534e7257a', USER = '11111111-1111-4111-8111-111111111111';
function criarBanco(nome) {
  psql('create database ' + nome + ';', { banco: 'postgres' });
  psql(STUB, { banco: nome });
  psql(SERVIDOR, { banco: nome });
  psql(migracoes(), { banco: nome });
  psql(`insert into public.empresas (id, nome, slug, status) values ('${EMP}', 'GUT Confecções (teste)', 'gut', 'TESTE');
        insert into auth.users values ('${USER}', 'carla@gut.com');
        insert into public.usuarios_empresa (user_id, empresa_id, papel, nome, email) values ('${USER}', '${EMP}', 'DONO', 'Carla', 'carla@gut.com');`, { banco: nome });
  // chave do servidor de teste (a de verdade fica só nos segredos da Edge Function)
  psql(`update private.servidor_config set chave = '${CHAVE_TESTE}';`, { banco: nome });
}
async function subir({ bancos = ['gut'] } = {}) {
  descer(true);
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true }); execFileSync('chown', ['postgres', DIR]);
  comoPostgres(BIN + '/initdb', ['-D', path.join(DIR, 'dados'), '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  comoPostgres(BIN + '/pg_ctl', ['-D', path.join(DIR, 'dados'), '-o', `-p ${PORT} -k ${SOCK} -c listen_addresses='' -c timezone=UTC -c fsync=off`, '-l', path.join(DIR, 'log.txt'), '-w', 'start']);
  bancos.forEach(criarBanco);
}
function descer(silencioso) {
  try { comoPostgres(BIN + '/pg_ctl', ['-D', path.join(DIR, 'dados'), '-m', 'immediate', 'stop']); } catch (e) { if (!silencioso) throw e; }
}
// roda como o usuário logado (papel authenticated, auth.uid() = USER)
function comoUsuario(sqlText, uid = USER) {
  return `begin; set local role authenticated; select set_config('gut.uid', '${uid}', true);\n${sqlText}\ncommit;`;
}
module.exports = { CHAVE_TESTE, criarBanco, subir, descer, psql, comoUsuario, EMP, USER, SCHEMA };
