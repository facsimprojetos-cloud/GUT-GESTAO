-- gut_028 — Posto (costureira ↔ máquina numerada), paradas, peças com defeito e OEE por máquina — v4.37.0
-- App de campo: a costureira bipa a etiqueta da máquina (posto), marca "máquina parou / voltou" e "peça com defeito".
-- Toda operação concluída por quem está num posto vira um registro de USO naquela máquina (gatilho em cupons_producao).
-- OEE do dia = disponibilidade × desempenho × qualidade, calculado em web_oee.

create table if not exists private.postos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  id_operador text not null,
  id_unidade text not null,
  desde timestamptz not null default now(),
  primary key (empresa_id, id_operador)
);
create unique index if not exists postos_unidade on private.postos (empresa_id, id_unidade);
alter table private.postos enable row level security;

create table if not exists private.posto_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('USO', 'PARADA', 'REFUGO')),
  id_unidade text not null,
  id_operador text,
  id_cupom text,
  motivo text,
  qtd numeric,
  minutos_padrao numeric,
  inicio timestamptz,
  fim timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists posto_eventos_dia on private.posto_eventos (empresa_id, id_unidade, inicio);
create unique index if not exists posto_eventos_parada_aberta on private.posto_eventos (empresa_id, id_unidade) where tipo = 'PARADA' and fim is null;
create unique index if not exists posto_eventos_uso_cupom on private.posto_eventos (empresa_id, id_cupom) where tipo = 'USO';
alter table private.posto_eventos enable row level security;

-- código da etiqueta (aceita "GUT-MAQ:RETA-01" ou só "RETA-01")
create or replace function private.unidade_por_codigo(p_emp uuid, p_codigo text) returns private.maquina_unidades
language sql stable security definer set search_path = '' as $$
  select u.* from private.maquina_unidades u
   where u.empresa_id = p_emp and u.ativo and upper(u.codigo) = upper(btrim(regexp_replace(coalesce(p_codigo, ''), '^\s*GUT-MAQ:', '', 'i')))
$$;

create or replace function private.posto_definir(p_emp uuid, p_op text, p_unidade text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- quem estava nesta máquina sai dela; a costureira sai da máquina anterior (e fecha uma parada aberta lá)
  update private.posto_eventos e set fim = now() from private.postos p
   where p.empresa_id = p_emp and p.id_operador = p_op and coalesce(p.id_unidade, '') <> coalesce(p_unidade, '')
     and e.empresa_id = p_emp and e.id_unidade = p.id_unidade and e.tipo = 'PARADA' and e.fim is null;
  delete from private.postos where empresa_id = p_emp and (id_operador = p_op or id_unidade = p_unidade);
  if coalesce(p_unidade, '') <> '' then insert into private.postos (empresa_id, id_operador, id_unidade) values (p_emp, p_op, p_unidade); end if;
end $$;

-- ---------- operação concluída por quem está num posto = uso daquela máquina ----------
create or replace function private.posto_registra_uso() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_op text := coalesce(nullif(new.id_operador_bipagem, ''), nullif(new.id_operador_marcacao, '')); v_uni text;
begin
  if upper(coalesce(new.status_cupom, '')) <> 'CONCLUIDO' or upper(coalesce(old.status_cupom, '')) = 'CONCLUIDO' or v_op is null then return null; end if;
  select id_unidade into v_uni from private.postos where empresa_id = new.empresa_id and id_operador = v_op;
  if v_uni is null then return null; end if;
  insert into private.posto_eventos (empresa_id, tipo, id_unidade, id_operador, id_cupom, qtd, minutos_padrao, inicio, fim)
  values (new.empresa_id, 'USO', v_uni, v_op, new.id_cupom, new.qtd_programada,
          coalesce(new.minutos_padrao_total, coalesce(new.qtd_programada, 0) * coalesce(new.tempo_padrao_seg_un, 0) / 60.0),
          new.data_hora_inicio_marcacao, coalesce(new.data_hora_bipagem, new.data_hora_fim_marcacao, now()))
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists posto_uso on public.cupons_producao;
create trigger posto_uso after update of status_cupom on public.cupons_producao for each row execute function private.posto_registra_uso();

-- ---------- sistema web ----------
create or replace function public.web_postos_ler(p_slug text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.layout_exige(v_emp, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id_operador', p.id_operador, 'nome', coalesce(o.nome, ''), 'id_unidade', p.id_unidade, 'desde', p.desde))
    from private.postos p left join public.cad_operadores o on o.empresa_id = p.empresa_id and o.id_operador = p.id_operador where p.empresa_id = v_emp), '[]'::jsonb);
end $$;

create or replace function public.web_posto_definir(p_slug text, p_id_operador text, p_id_unidade text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.layout_exige(v_emp, true);
  if not exists (select 1 from public.cad_operadores where empresa_id = v_emp and id_operador = p_id_operador) then raise exception 'Funcionário não encontrado.'; end if;
  if coalesce(p_id_unidade, '') <> '' and not exists (select 1 from private.maquina_unidades where empresa_id = v_emp and id_unidade = p_id_unidade) then raise exception 'Máquina não encontrada.'; end if;
  perform private.posto_definir(v_emp, p_id_operador, nullif(p_id_unidade, ''));
  return public.web_postos_ler(p_slug);
end $$;

-- resumo do dia por máquina: paradas (minutos dentro do dia, até agora), minutos padrão e peças produzidas, peças com defeito
create or replace function public.web_oee(p_slug text, p_dia date) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; v_ini timestamptz; v_fim timestamptz;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.layout_exige(v_emp, false);
  v_ini := (coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date)::timestamp) at time zone 'America/Sao_Paulo';
  v_fim := least(v_ini + interval '1 day', now());
  return coalesce((select jsonb_agg(x) from (
    select u.id_unidade, u.codigo,
      coalesce((select sum(extract(epoch from (least(coalesce(e.fim, now()), v_fim) - greatest(e.inicio, v_ini))) / 60)
                  from private.posto_eventos e where e.empresa_id = v_emp and e.id_unidade = u.id_unidade and e.tipo = 'PARADA' and e.inicio < v_fim and coalesce(e.fim, now()) > v_ini), 0) as parada_min,
      coalesce((select jsonb_object_agg(m, mins) from (select coalesce(nullif(e.motivo, ''), 'Outro') m, round(sum(extract(epoch from (least(coalesce(e.fim, now()), v_fim) - greatest(e.inicio, v_ini))) / 60)::numeric, 1) mins
                  from private.posto_eventos e where e.empresa_id = v_emp and e.id_unidade = u.id_unidade and e.tipo = 'PARADA' and e.inicio < v_fim and coalesce(e.fim, now()) > v_ini group by 1) z), '{}'::jsonb) as motivos,
      coalesce((select bool_or(e.fim is null) from private.posto_eventos e where e.empresa_id = v_emp and e.id_unidade = u.id_unidade and e.tipo = 'PARADA'), false) as parada_aberta,
      coalesce((select sum(e.minutos_padrao) from private.posto_eventos e where e.empresa_id = v_emp and e.id_unidade = u.id_unidade and e.tipo = 'USO' and e.fim >= v_ini and e.fim < v_fim), 0) as minutos_padrao,
      coalesce((select sum(e.qtd) from private.posto_eventos e where e.empresa_id = v_emp and e.id_unidade = u.id_unidade and e.tipo = 'USO' and e.fim >= v_ini and e.fim < v_fim), 0) as pecas,
      coalesce((select sum(e.qtd) from private.posto_eventos e where e.empresa_id = v_emp and e.id_unidade = u.id_unidade and e.tipo = 'REFUGO' and e.inicio >= v_ini and e.inicio < v_fim), 0) as defeitos,
      (select o.nome from private.postos p join public.cad_operadores o on o.empresa_id = p.empresa_id and o.id_operador = p.id_operador where p.empresa_id = v_emp and p.id_unidade = u.id_unidade) as operador
    from private.maquina_unidades u where u.empresa_id = v_emp and u.ativo) x), '[]'::jsonb);
end $$;

revoke all on function public.web_postos_ler(text) from public, anon;
revoke all on function public.web_posto_definir(text, text, text) from public, anon;
revoke all on function public.web_oee(text, date) from public, anon;
grant execute on function public.web_postos_ler(text) to authenticated;
grant execute on function public.web_posto_definir(text, text, text) to authenticated;
grant execute on function public.web_oee(text, date) to authenticated;
revoke all on function private.unidade_por_codigo(uuid, text) from public, anon, authenticated;
revoke all on function private.posto_definir(uuid, text, text) from public, anon, authenticated;
revoke all on function private.posto_registra_uso() from public, anon, authenticated;

-- @so-supabase (daqui para baixo depende do app de campo, que o banco de teste local não carrega sozinho)
create or replace function private.posto_estado(p_emp uuid, p_op text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'posto', (select jsonb_build_object('id', u.id_unidade, 'codigo', u.codigo, 'maquina', coalesce(m.maquina, ''), 'desde', p.desde)
                from private.postos p join private.maquina_unidades u on u.empresa_id = p.empresa_id and u.id_unidade = p.id_unidade
                left join public.cad_maquinas m on m.empresa_id = u.empresa_id and m.id_maquina = u.id_maquina
               where p.empresa_id = p_emp and p.id_operador = p_op),
    'parada', (select jsonb_build_object('id', e.id, 'motivo', e.motivo, 'desde', e.inicio)
                 from private.postos p join private.posto_eventos e on e.empresa_id = p.empresa_id and e.id_unidade = p.id_unidade and e.tipo = 'PARADA' and e.fim is null
                where p.empresa_id = p_emp and p.id_operador = p_op limit 1),
    'defeitosHoje', (select coalesce(sum(e.qtd), 0) from private.posto_eventos e
                      where e.empresa_id = p_emp and e.id_operador = p_op and e.tipo = 'REFUGO' and (e.inicio at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date))
$$;

-- ---------- app de campo ----------
create or replace function public.campo_posto(p_token text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare q private.campo_quem := private.campo_auth(p_token);
begin
  perform private.campo_exige(q, 'OPERADOR');
  return private.posto_estado(q.empresa_id, q.id);
end $$;

create or replace function public.campo_posto_definir(p_token text, p_codigo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare q private.campo_quem := private.campo_auth(p_token); u private.maquina_unidades;
begin
  perform private.campo_exige(q, 'OPERADOR');
  if coalesce(btrim(p_codigo), '') = '' then perform private.posto_definir(q.empresa_id, q.id, null); return private.posto_estado(q.empresa_id, q.id); end if;
  u := private.unidade_por_codigo(q.empresa_id, p_codigo);
  if u.id_unidade is null then raise exception 'Máquina % não encontrada. Confira a etiqueta.', btrim(regexp_replace(p_codigo, '^\s*GUT-MAQ:', '', 'i')); end if;
  perform private.posto_definir(q.empresa_id, q.id, u.id_unidade);
  return private.posto_estado(q.empresa_id, q.id);
end $$;

-- p_motivo preenchido = a máquina parou; vazio = voltou a funcionar
create or replace function public.campo_parada(p_token text, p_motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare q private.campo_quem := private.campo_auth(p_token); v_uni text;
begin
  perform private.campo_exige(q, 'OPERADOR');
  select id_unidade into v_uni from private.postos where empresa_id = q.empresa_id and id_operador = q.id;
  if v_uni is null then raise exception 'Bipe primeiro a etiqueta da sua máquina.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then
    update private.posto_eventos set fim = now() where empresa_id = q.empresa_id and id_unidade = v_uni and tipo = 'PARADA' and fim is null;
  elsif not exists (select 1 from private.posto_eventos where empresa_id = q.empresa_id and id_unidade = v_uni and tipo = 'PARADA' and fim is null) then
    insert into private.posto_eventos (empresa_id, tipo, id_unidade, id_operador, motivo, inicio) values (q.empresa_id, 'PARADA', v_uni, q.id, left(btrim(p_motivo), 60), now());
  end if;
  return private.posto_estado(q.empresa_id, q.id);
end $$;

create or replace function public.campo_defeito(p_token text, p_qtd numeric, p_motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare q private.campo_quem := private.campo_auth(p_token); v_uni text; v_cupom text;
begin
  perform private.campo_exige(q, 'OPERADOR');
  if coalesce(p_qtd, 0) <= 0 or p_qtd > 10000 then raise exception 'Informe quantas peças com defeito.'; end if;
  select id_unidade into v_uni from private.postos where empresa_id = q.empresa_id and id_operador = q.id;
  if v_uni is null then raise exception 'Bipe primeiro a etiqueta da sua máquina.'; end if;
  select c.id_cupom into v_cupom from public.cupons_producao c
   where c.empresa_id = q.empresa_id and (c.id_operador_marcacao = q.id or c.id_operador_bipagem = q.id)
   order by (upper(coalesce(c.status_cupom, '')) = 'EM_ANDAMENTO_MARCACAO') desc, coalesce(c.data_hora_bipagem, c.data_hora_inicio_marcacao) desc nulls last limit 1;
  insert into private.posto_eventos (empresa_id, tipo, id_unidade, id_operador, id_cupom, motivo, qtd, inicio, fim)
  values (q.empresa_id, 'REFUGO', v_uni, q.id, v_cupom, left(btrim(coalesce(p_motivo, '')), 60), p_qtd, now(), now());
  return private.posto_estado(q.empresa_id, q.id);
end $$;

revoke all on function public.campo_posto(text) from public;
revoke all on function public.campo_posto_definir(text, text) from public;
revoke all on function public.campo_parada(text, text) from public;
revoke all on function public.campo_defeito(text, numeric, text) from public;
grant execute on function public.campo_posto(text) to anon, authenticated;
grant execute on function public.campo_posto_definir(text, text) to anon, authenticated;
grant execute on function public.campo_parada(text, text) to anon, authenticated;
grant execute on function public.campo_defeito(text, numeric, text) to anon, authenticated;
revoke all on function private.posto_estado(uuid, text) from public, anon, authenticated;
