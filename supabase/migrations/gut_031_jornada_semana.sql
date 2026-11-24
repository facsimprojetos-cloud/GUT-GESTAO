-- gut_031 — Jornada de trabalho por dia da semana (ex.: sexta mais curta, sábado meio período) — v4.40.0
-- private.empresa_jornada.horarios = {"1":{"entrada":"07:00","saida":"17:00","intervalo_ini":"12:00","intervalo_fim":"13:00"}, …}
-- (chave = dia ISO, 1 = segunda … 7 = domingo; dia ausente = não trabalha). As colunas antigas continuam como resumo
-- (primeiro dia de trabalho) e dias = dias com horário.

alter table private.empresa_jornada add column if not exists horarios jsonb;

create or replace function private.jornada_min(e time, s time, ii time, fi time) returns numeric
language sql immutable set search_path = '' as $$
  select case when e is null or s is null or s <= e then 0
    else (extract(epoch from (s - e)) - case when ii is not null and fi is not null and fi > ii
           then greatest(0, extract(epoch from (least(fi, s) - greatest(ii, e)))) else 0 end) / 60 end
$$;

create or replace function private.jornada_json(p_emp uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x private.empresa_jornada; sem jsonb := '[]'::jsonb; d int; h jsonb; m numeric; tot numeric := 0; n int := 0; primeiro jsonb;
begin
  select * into x from private.empresa_jornada where empresa_id = p_emp;
  for d in 1..7 loop
    if x.empresa_id is null then
      h := case when d <= 5 then '{"entrada":"07:00","saida":"17:00","intervalo_ini":"12:00","intervalo_fim":"13:00"}'::jsonb end;
    elsif x.horarios is not null then
      h := x.horarios -> d::text;
    elsif d = any (x.dias) then
      h := jsonb_build_object('entrada', to_char(x.entrada, 'HH24:MI'), 'saida', to_char(x.saida, 'HH24:MI'),
             'intervalo_ini', coalesce(to_char(x.intervalo_ini, 'HH24:MI'), ''), 'intervalo_fim', coalesce(to_char(x.intervalo_fim, 'HH24:MI'), ''));
    else h := null;
    end if;
    if h is null then
      sem := sem || jsonb_build_object('dia', d, 'trabalha', false, 'entrada', '', 'saida', '', 'intervalo_ini', '', 'intervalo_fim', '', 'minutos', 0);
    else
      m := private.jornada_min(nullif(h->>'entrada','')::time, nullif(h->>'saida','')::time, nullif(h->>'intervalo_ini','')::time, nullif(h->>'intervalo_fim','')::time);
      tot := tot + m; n := n + 1; if primeiro is null then primeiro := h; end if;
      sem := sem || (jsonb_build_object('dia', d, 'trabalha', true, 'intervalo_ini', '', 'intervalo_fim', '') || h || jsonb_build_object('minutos', m));
    end if;
  end loop;
  return jsonb_build_object('configurada', x.empresa_id is not null, 'semana', sem,
    'dias', coalesce((select jsonb_agg((e->>'dia')::int) from jsonb_array_elements(sem) e where (e->>'trabalha')::boolean), '[]'::jsonb),
    'minutos_semana', tot, 'minutos_dia', case when n > 0 then round(tot / n, 1) else 0 end,
    'entrada', coalesce(primeiro->>'entrada', ''), 'saida', coalesce(primeiro->>'saida', ''),
    'intervalo_ini', coalesce(primeiro->>'intervalo_ini', ''), 'intervalo_fim', coalesce(primeiro->>'intervalo_fim', ''));
end $$;

-- p_semana: JSON (texto) com 7 itens {dia, trabalha, entrada, saida, intervalo_ini, intervalo_fim}.
create or replace function public.web_jornada_salvar_semana(p_slug text, p_semana text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; arr jsonb; it jsonb; d int; e time; s time; ii time; fi time; hor jsonb := '{}'::jsonb; dias smallint[] := '{}';
  nome text[] := array['segunda','terça','quarta','quinta','sexta','sábado','domingo']; p1 jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.unidades_exige(v_emp, true);
  begin arr := p_semana::jsonb; exception when others then raise exception 'Jornada inválida.'; end;
  if jsonb_typeof(arr) <> 'array' then raise exception 'Jornada inválida.'; end if;
  for it in select * from jsonb_array_elements(arr) loop
    d := (it->>'dia')::int;
    if d is null or d < 1 or d > 7 then raise exception 'Dia da semana inválido.'; end if;
    if coalesce((it->>'trabalha')::boolean, false) is false or hor ? d::text then continue; end if;
    begin
      e := nullif(btrim(coalesce(it->>'entrada','')), '')::time; s := nullif(btrim(coalesce(it->>'saida','')), '')::time;
      ii := nullif(btrim(coalesce(it->>'intervalo_ini','')), '')::time; fi := nullif(btrim(coalesce(it->>'intervalo_fim','')), '')::time;
    exception when others then raise exception 'Horário inválido na %. Use o formato 07:00.', nome[d];
    end;
    if e is null or s is null then raise exception 'Informe a entrada e a saída de %.', nome[d]; end if;
    if s <= e then raise exception 'Na %, a saída precisa ser depois da entrada.', nome[d]; end if;
    if (ii is null) <> (fi is null) then raise exception 'Na %, informe o início e o fim do intervalo (ou deixe os dois vazios).', nome[d]; end if;
    if ii is not null and (fi <= ii or ii < e or fi > s) then raise exception 'Na %, o intervalo precisa ficar dentro do horário de trabalho.', nome[d]; end if;
    hor := hor || jsonb_build_object(d::text, jsonb_build_object('entrada', to_char(e, 'HH24:MI'), 'saida', to_char(s, 'HH24:MI'),
             'intervalo_ini', coalesce(to_char(ii, 'HH24:MI'), ''), 'intervalo_fim', coalesce(to_char(fi, 'HH24:MI'), '')));
    dias := dias || d::smallint;
  end loop;
  if coalesce(array_length(dias, 1), 0) = 0 then raise exception 'Marque pelo menos um dia de trabalho.'; end if;
  select array_agg(x order by x) into dias from unnest(dias) x;
  p1 := hor -> dias[1]::text;
  insert into private.empresa_jornada (empresa_id, entrada, saida, intervalo_ini, intervalo_fim, dias, horarios, atualizado_em, atualizado_por)
  values (v_emp, (p1->>'entrada')::time, (p1->>'saida')::time, nullif(p1->>'intervalo_ini','')::time, nullif(p1->>'intervalo_fim','')::time, dias, hor, now(), auth.uid())
  on conflict (empresa_id) do update set entrada = excluded.entrada, saida = excluded.saida, intervalo_ini = excluded.intervalo_ini, intervalo_fim = excluded.intervalo_fim,
    dias = excluded.dias, horarios = excluded.horarios, atualizado_em = now(), atualizado_por = auth.uid();
  return private.jornada_json(v_emp);
end $$;

-- a versão antiga (um horário para todos os dias) passa a gravar também os horários por dia
create or replace function public.web_jornada_salvar(p_slug text, p_entrada text, p_saida text, p_intervalo_ini text, p_intervalo_fim text, p_dias text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.web_jornada_salvar_semana(p_slug, (select jsonb_agg(jsonb_build_object('dia', d, 'trabalha', d::text = any (regexp_split_to_array(coalesce(p_dias,''), '\s*,\s*')),
      'entrada', p_entrada, 'saida', p_saida, 'intervalo_ini', p_intervalo_ini, 'intervalo_fim', p_intervalo_fim)) from generate_series(1, 7) d)::text);
end $$;

revoke all on function private.jornada_min(time, time, time, time) from public, anon, authenticated;
revoke all on function private.jornada_json(uuid) from public, anon, authenticated;
revoke all on function public.web_jornada_salvar_semana(text, text) from public, anon;
grant execute on function public.web_jornada_salvar_semana(text, text) to authenticated;
