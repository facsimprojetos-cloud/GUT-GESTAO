-- gut_029 — Jornada de trabalho da empresa (entrada, saída, intervalo e dias da semana) — v4.38.0
-- Cadastro em Cadastros → Jornada de trabalho. Usada no OEE das máquinas (Layout da fábrica) no lugar do turno fixo das 7h.
-- Dias no padrão ISO: 1 = segunda … 7 = domingo.

create table if not exists private.empresa_jornada (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  entrada time not null default '07:00',
  saida time not null default '17:00',
  intervalo_ini time,
  intervalo_fim time,
  dias smallint[] not null default '{1,2,3,4,5}',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table private.empresa_jornada enable row level security;

create or replace function private.jornada_json(p_emp uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with j as (
    select coalesce(x.entrada, '07:00'::time) entrada, coalesce(x.saida, '17:00'::time) saida,
           case when x.empresa_id is null then '12:00'::time else x.intervalo_ini end intervalo_ini,
           case when x.empresa_id is null then '13:00'::time else x.intervalo_fim end intervalo_fim,
           coalesce(x.dias, '{1,2,3,4,5}'::smallint[]) dias, x.empresa_id is not null configurada
      from (select 1) um left join private.empresa_jornada x on x.empresa_id = p_emp
  )
  select jsonb_build_object(
    'configurada', configurada,
    'entrada', to_char(entrada, 'HH24:MI'), 'saida', to_char(saida, 'HH24:MI'),
    'intervalo_ini', coalesce(to_char(intervalo_ini, 'HH24:MI'), ''), 'intervalo_fim', coalesce(to_char(intervalo_fim, 'HH24:MI'), ''),
    'dias', to_jsonb(dias),
    'minutos_dia', (extract(epoch from (saida - entrada)) - coalesce(extract(epoch from (intervalo_fim - intervalo_ini)), 0)) / 60)
  from j
$$;

create or replace function public.web_jornada_ler(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.unidades_exige(v_emp, false);
  return private.jornada_json(v_emp);
end $$;

-- p_dias: "1,2,3,4,5" (1 = segunda … 7 = domingo). Intervalo vazio = sem intervalo.
create or replace function public.web_jornada_salvar(p_slug text, p_entrada text, p_saida text, p_intervalo_ini text, p_intervalo_fim text, p_dias text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; e time; s time; ii time; fi time; d smallint[];
begin
  v_emp := private.web_empresa(p_slug);
  perform private.unidades_exige(v_emp, true);
  begin
    e := nullif(btrim(p_entrada), '')::time; s := nullif(btrim(p_saida), '')::time;
    ii := nullif(btrim(coalesce(p_intervalo_ini, '')), '')::time; fi := nullif(btrim(coalesce(p_intervalo_fim, '')), '')::time;
  exception when others then raise exception 'Horário inválido. Use o formato 07:00.';
  end;
  if e is null or s is null then raise exception 'Informe o horário de entrada e de saída.'; end if;
  if s <= e then raise exception 'A saída precisa ser depois da entrada.'; end if;
  if (ii is null) <> (fi is null) then raise exception 'Informe o início e o fim do intervalo (ou deixe os dois vazios).'; end if;
  if ii is not null and (fi <= ii or ii < e or fi > s) then raise exception 'O intervalo precisa ficar dentro do horário de trabalho.'; end if;
  select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into d
    from regexp_split_to_table(coalesce(p_dias, ''), '\s*,\s*') x where x ~ '^[1-7]$';
  if coalesce(array_length(d, 1), 0) = 0 then raise exception 'Marque pelo menos um dia de trabalho.'; end if;
  insert into private.empresa_jornada (empresa_id, entrada, saida, intervalo_ini, intervalo_fim, dias, atualizado_em, atualizado_por)
  values (v_emp, e, s, ii, fi, d, now(), auth.uid())
  on conflict (empresa_id) do update set entrada = excluded.entrada, saida = excluded.saida, intervalo_ini = excluded.intervalo_ini,
    intervalo_fim = excluded.intervalo_fim, dias = excluded.dias, atualizado_em = now(), atualizado_por = auth.uid();
  return private.jornada_json(v_emp);
end $$;

revoke all on function private.jornada_json(uuid) from public, anon, authenticated;
revoke all on function public.web_jornada_ler(text) from public, anon;
revoke all on function public.web_jornada_salvar(text, text, text, text, text, text) from public, anon;
grant execute on function public.web_jornada_ler(text) to authenticated;
grant execute on function public.web_jornada_salvar(text, text, text, text, text, text) to authenticated;
