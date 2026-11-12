-- gut_017 — Fase 6: o sistema não depende mais do Google.
--
-- 1) Cópia de segurança diária DENTRO do Supabase (substitui a planilha de backup do Apps Script):
--    todo dia às 23h (SP) o pg_cron copia todas as tabelas de cada empresa para backup.copias (uma linha por
--    dia/empresa/tabela, em JSON) e guarda os últimos 14 dias. O schema "backup" não é exposto pela API.
--      backup.fazer()                                   → faz a cópia agora
--      backup.restaurar_tabela(dia, empresa_id, tabela) → volta uma tabela de uma empresa para a cópia daquele dia
--      public.web_backup_baixar(slug)                   → o DONO baixa a cópia mais recente (para guardar fora)
-- 2) GUT API desligada: o token do servidor (gutsrv_…) e o de importação são revogados e as RPCs gut_* deixam
--    de poder ser chamadas pela internet. (As funções ficam no banco, só sem permissão; nada foi apagado.)

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.copias (
  dia date not null,
  empresa_id uuid not null,
  tabela text not null,
  linhas integer not null default 0,
  dados jsonb not null default '[]'::jsonb,
  feito_em timestamptz not null default now(),
  primary key (dia, empresa_id, tabela)
);
revoke all on backup.copias from public, anon, authenticated;

create or replace function backup.fazer()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_dia date := (now() at time zone 'America/Sao_Paulo')::date; e uuid; t text; d jsonb; n int; tot int := 0; tabs int := 0;
begin
  for e in select id from public.empresas loop
    for t in select distinct c.table_name::text from information_schema.columns c
              where c.table_schema = 'public' and c.column_name = 'empresa_id' and c.table_name not in ('usuarios_empresa', 'app_operacoes') loop
      execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''empresa_id'' order by x.ordem_linha), ''[]''::jsonb), count(*) from public.%I x where x.empresa_id = $1', t)
        into d, n using e;
      insert into backup.copias (dia, empresa_id, tabela, linhas, dados, feito_em) values (v_dia, e, t, n, d, now())
      on conflict (dia, empresa_id, tabela) do update set linhas = excluded.linhas, dados = excluded.dados, feito_em = now();
      tot := tot + n; tabs := tabs + 1;
    end loop;
  end loop;
  delete from backup.copias where dia < v_dia - 14;
  return jsonb_build_object('ok', true, 'dia', v_dia, 'tabelas', tabs, 'linhas', tot);
end $$;
revoke all on function backup.fazer() from public, anon, authenticated;

-- volta UMA tabela de UMA empresa para a cópia de um dia (uso manual, pelo SQL do Supabase)
create or replace function backup.restaurar_tabela(p_dia date, p_emp uuid, p_tabela text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d jsonb; n int;
begin
  select dados into d from backup.copias where dia = p_dia and empresa_id = p_emp and tabela = p_tabela;
  if d is null then raise exception 'Não há cópia de % em % para essa empresa.', p_tabela, p_dia; end if;
  execute format('delete from public.%I where empresa_id = $1', p_tabela) using p_emp;
  execute format('insert into public.%1$I (empresa_id, %2$s) select $1, %2$s from jsonb_populate_recordset(null::public.%1$I, $2)', p_tabela,
    (select string_agg(quote_ident(c), ', ') from unnest(private.colunas_dados(p_tabela)) c)) using p_emp, d;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'tabela', p_tabela, 'dia', p_dia, 'linhas', n);
end $$;
revoke all on function backup.restaurar_tabela(date, uuid, text) from public, anon, authenticated;

-- o dono da empresa baixa a cópia mais recente (sem as senhas do app de campo)
create or replace function public.web_backup_baixar(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; v_dia date; r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  if not (public.sou_dono(v_emp) or private.sou_admin()) then raise exception 'Só o dono da empresa pode baixar a cópia de segurança.'; end if;
  select max(dia) into v_dia from backup.copias where empresa_id = v_emp;
  if v_dia is null then raise exception 'Ainda não há cópia de segurança.'; end if;
  select jsonb_object_agg(tabela, (select coalesce(jsonb_agg(x - 'senha_hash' - 'senha_salt'), '[]'::jsonb) from jsonb_array_elements(dados) x))
    into r from backup.copias where empresa_id = v_emp and dia = v_dia;
  return jsonb_build_object('dia', v_dia, 'gerado_em', now(), 'tabelas', r);
end $$;
revoke all on function public.web_backup_baixar(text) from public, anon;
grant execute on function public.web_backup_baixar(text) to authenticated;

-- agenda diária (23h em São Paulo = 02h UTC), se o pg_cron estiver disponível
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponível: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gut-backup-diario';
    perform cron.schedule('gut-backup-diario', '0 2 * * *', 'select backup.fazer()');
  end if;
end $$;

-- ---------- GUT API (Apps Script) desligada ----------
update private.tokens_importacao set revogado = true where not revogado;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'gut\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- fotos antigas do Google Drive (só testes): deixam de ser referenciadas; as novas vão para o Storage
update public.cad_produtos set foto_frente = '' where coalesce(foto_frente, '') <> '' and foto_frente not like 'sb:%';
update public.cad_produtos set foto_costas = '' where coalesce(foto_costas, '') <> '' and foto_costas not like 'sb:%';
