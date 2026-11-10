-- gut_014 — Fase 0 do plano "tudo no Supabase": a base que todas as próximas migrações usam.
--
-- 1) Leitura direta pelo sistema web (usuário logado no Supabase Auth, sem passar pelo Apps Script):
--      web_schema(slug)            → colunas e tipos das tabelas (mesmo formato do gut_schema)
--      web_ler(slug, tabelas[])    → várias tabelas numa chamada (mesmo formato do gut_ler), sem as senhas do app de campo
--    O navegador monta as respostas das telas com o mesmo código do Apps Script (site/sistema/gut-motor.js).
--
-- 2) Ajudantes para as funções de gravação web_* das próximas fases (mesmas regras do Code.gs):
--      private.web_num(x)              → número como o num_() (aceita "1.234,56")
--      private.web_data(x)             → data (yyyy-mm-dd ou dd/mm/aaaa) como o parseDate_/dateKey_
--      private.web_ts(x)               → data e hora (timestamptz) a partir de texto
--      private.web_txt(ts)             → texto 'yyyy-MM-ddTHH:mm:ss' no fuso de SP (como o serialize_ devolve as datas)
--      private.web_hoje()              → data de hoje em SP
--      private.web_seq(emp, chave, competencia, escopo) → próximo número da tabela SEQUENCIAS (nextSeqUnlocked_)
--      private.web_audita(emp, acao, tabela, id, antes, depois, obs) → linha na AUDITORIA (audit_)
--      private.web_gravacao(slug)      → início de toda gravação: confere o acesso e trava a empresa (fila única
--                                        com o app de campo); devolve o id da empresa
--      private.web_op_previa(emp, id, acao, hash) / private.web_op_salva(emp, id, acao, hash, resultado)
--                                      → idempotência: a mesma operação repetida devolve o mesmo resultado
--      private.web_fim(emp)            → marca a revisão (como o apiCall faz depois de toda gravação)

-- ---------- senhas do app de campo: o navegador nunca recebe ----------
-- senha_salt some; senha_hash vira só um aviso de "tem senha" (o Code.gs usa isso para mostrar TEM_SENHA)
create or replace function private.web_coluna_oculta(p_col text)
returns boolean language sql immutable set search_path = '' as $$
  select p_col = 'senha_salt'
$$;
create or replace function private.web_linha(r jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when r ? 'senha_hash'
              then (r - 'senha_salt') || jsonb_build_object('senha_hash', case when coalesce(r->>'senha_hash', '') <> '' then 'definida' end)
              else r end - 'empresa_id' - 'sincronizado_em' - 'ordem_linha'
$$;

-- tabelas que o sistema web pode ler (as mesmas do Apps Script, menos o registro interno de operações)
create or replace function private.web_tabela_ok(p_tabela text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.tabela_importavel(p_tabela) and p_tabela not in ('app_operacoes')
$$;

-- ---------- leitura ----------
create or replace function public.web_schema(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.web_empresa(p_slug);
  select jsonb_object_agg(t.table_name, jsonb_build_object('cols', t.cols, 'pk', to_jsonb(private.colunas_chave(t.table_name)))) into r from (
    select c.table_name::text as table_name, jsonb_agg(jsonb_build_array(c.column_name, c.data_type) order by c.ordinal_position) as cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.column_name not in ('empresa_id','sincronizado_em','ordem_linha')
       and not private.web_coluna_oculta(c.column_name)
       and private.web_tabela_ok(c.table_name)
     group by c.table_name) t;
  return r;
end $$;

create or replace function public.web_ler(p_slug text, p_tabelas text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; t text; r jsonb := '{}'::jsonb; rows jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  foreach t in array coalesce(p_tabelas, '{}') loop
    if not private.web_tabela_ok(t) then raise exception 'Tabela não permitida: %', t; end if;
    execute format('select coalesce(jsonb_agg(private.web_linha(to_jsonb(x)) order by x.ordem_linha), ''[]''::jsonb) from public.%I x where x.empresa_id = $1', t)
      into rows using v_emp;
    r := r || jsonb_build_object(t, rows);
  end loop;
  return r || jsonb_build_object('__agora', now(), '__empresa', v_emp);
end $$;

revoke all on function public.web_schema(text) from public, anon;
revoke all on function public.web_ler(text, text[]) from public, anon;
grant execute on function public.web_schema(text) to authenticated;
grant execute on function public.web_ler(text, text[]) to authenticated;

-- ---------- ajudantes de valor (mesmas regras do Code.gs) ----------
-- num_(): vazio → 0; com vírgula, ponto é milhar ("1.234,56"); sem vírgula, ponto é decimal ("1.5")
create or replace function private.web_num(p text, p_padrao numeric default 0)
returns numeric language plpgsql immutable set search_path = '' as $$
declare s text; v numeric;
begin
  s := btrim(coalesce(p, ''));
  if s = '' then return p_padrao; end if;
  if position(',' in s) > 0 then s := replace(replace(s, '.', ''), ',', '.'); end if;
  begin
    v := s::numeric;
  exception when others then return p_padrao;
  end;
  if v in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then return p_padrao; end if;
  return v;
end $$;

-- dateKey_(): texto que começa com yyyy-mm-dd → esses 10 caracteres (sem mexer no fuso); dd/mm/aaaa → essa data
create or replace function private.web_data(p text)
returns date language plpgsql stable set search_path = '' as $$
declare s text := btrim(coalesce(p, '')); m text[];
begin
  if s = '' then return null; end if;
  m := regexp_match(s, '^(\d{4})-(\d{2})-(\d{2})');
  if m is not null then return make_date(m[1]::int, m[2]::int, m[3]::int); end if;
  m := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{4})');
  if m is not null then return make_date(m[3]::int, m[2]::int, m[1]::int); end if;
  begin
    return (s::timestamptz at time zone 'America/Sao_Paulo')::date;
  exception when others then
    raise exception 'Data inválida: %', s;
  end;
end $$;

-- texto sem fuso ('2026-11-10T08:00:00') é hora de SP, como no Apps Script
create or replace function private.web_ts(p text)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare s text := btrim(coalesce(p, ''));
begin
  if s = '' then return null; end if;
  if s ~ '^\d{4}-\d{2}-\d{2}$' then return (s || ' 12:00:00')::timestamp at time zone 'America/Sao_Paulo'; end if;
  if s ~ '(Z|[+-]\d{2}(:?\d{2})?)$' then return s::timestamptz; end if;
  return replace(s, 'T', ' ')::timestamp at time zone 'America/Sao_Paulo';
exception when others then
  raise exception 'Data/hora inválida: %', s;
end $$;

create or replace function private.web_txt(p timestamptz)
returns text language sql stable set search_path = '' as $$
  select case when p is null then '' else to_char(p at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') end
$$;

create or replace function private.web_hoje()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- ---------- numeração ----------
-- nextSeqUnlocked_(chave, competencia, escopo): último número + 1, guardado em SEQUENCIAS.
-- Só chame depois de private.web_gravacao (a trava da empresa garante que não há dois números iguais).
create or replace function private.web_seq(p_emp uuid, p_chave text, p_competencia text default '', p_escopo text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare v numeric;
begin
  update public.sequencias s set ultimo_numero = coalesce(s.ultimo_numero, 0) + 1, atualizado_em = now(), sincronizado_em = now()
   where s.empresa_id = p_emp and s.chave = p_chave and coalesce(s.competencia, '') = coalesce(p_competencia, '') and coalesce(s.escopo_id, '') = coalesce(p_escopo, '')
  returning s.ultimo_numero into v;
  if v is null then
    insert into public.sequencias (empresa_id, chave, competencia, escopo_id, ultimo_numero, atualizado_em)
    values (p_emp, p_chave, coalesce(p_competencia, ''), coalesce(p_escopo, ''), 1, now());
    v := 1;
  end if;
  return v::int;
end $$;

-- ---------- auditoria ----------
create or replace function private.web_audita(p_emp uuid, p_acao text, p_tabela text, p_id text,
  p_antes jsonb default null, p_depois jsonb default null, p_obs text default 'sistema web')
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (empresa_id, id_log, data_hora, id_usuario, acao, tabela, id_registro, dados_antes, dados_depois, observacao)
  values (p_emp, gen_random_uuid()::text, now(), private.meu_email(), p_acao, p_tabela, coalesce(p_id, ''),
          coalesce(p_antes::text, ''), coalesce(p_depois::text, ''), coalesce(p_obs, ''));
$$;

-- ---------- início e fim de toda gravação ----------
create or replace function private.web_gravacao(p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.campo_trava(v_emp);   -- uma gravação por vez por empresa (a mesma fila do app de campo)
  return v_emp;
end $$;

create or replace function private.web_fim(p_emp uuid)
returns void language sql security definer set search_path = '' as $$
  update public.app_controle set revisao = 'web-' || gen_random_uuid()::text, atualizado_em = now() where empresa_id = p_emp;
$$;

-- ---------- idempotência (o mesmo pedido repetido não grava duas vezes) ----------
-- Devolve o resultado já gravado para este id (ou null se é a primeira vez). Erro se o id foi usado em outra ação.
create or replace function private.web_op_previa(p_emp uuid, p_id text, p_acao text, p_hash text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if coalesce(p_id, '') = '' then return null; end if;
  if p_id !~ '^[A-Za-z0-9_-]{12,100}$' then raise exception 'Identificador de operação inválido.'; end if;
  select * into o from public.app_operacoes where empresa_id = p_emp and id_operacao = p_id;
  if not found then return null; end if;
  if o.acao is distinct from p_acao or (coalesce(p_hash, '') <> '' and coalesce(o.hash, '') <> '' and o.hash <> p_hash) then
    raise exception 'Este identificador já pertence a outra operação.';
  end if;
  return coalesce(nullif(o.resultado_1, '')::jsonb, '{}'::jsonb);
end $$;

create or replace function private.web_op_salva(p_emp uuid, p_id text, p_acao text, p_hash text, p_resultado jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_id, '') <> '' then
    insert into public.app_operacoes (empresa_id, id_operacao, acao, hash, data_hora, usuario, refresh, resultado_1)
    values (p_emp, p_id, p_acao, coalesce(p_hash, ''), now(), private.meu_email(), 'WEB', p_resultado::text)
    on conflict do nothing;
  end if;
  return p_resultado;
end $$;

revoke all on function private.web_seq(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.web_audita(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function private.web_gravacao(text) from public, anon, authenticated;
revoke all on function private.web_fim(uuid) from public, anon, authenticated;
revoke all on function private.web_op_previa(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.web_op_salva(uuid, text, text, text, jsonb) from public, anon, authenticated;
