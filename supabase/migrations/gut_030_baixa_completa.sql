-- gut_030 — Baixa completa da caixa na Produção interna — v4.39.0
-- Conclui de uma vez todas as operações pendentes das caixas escolhidas:
--   • em marcação agora  → finaliza a marcação para quem está marcando (método MARCACAO);
--   • alocada a alguém   → apontamento para o funcionário alocado (minutos vão para ele);
--   • sem funcionário    → só com a SENHA DO SUPERVISOR; os minutos ficam na "produção da empresa"
--                          (apontamento com id_operador = 'EMPRESA', sem jornada nem indicador de ninguém).
-- A senha do supervisor é da empresa (hash SHA-256 com sal), criada pelo dono ou por quem edita cadastros.
-- 5 senhas erradas seguidas bloqueiam por 10 minutos.

create table if not exists private.empresa_supervisor (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  sal text not null,
  hash text not null,
  falhas int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table private.empresa_supervisor enable row level security;

create or replace function private.supervisor_hash(p_sal text, p_senha text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_sal || ':gut-supervisor:' || coalesce(p_senha, ''), 'UTF8')), 'hex')
$$;

-- 'OK' | 'ERRADA' | 'BLOQUEADA' | 'SEM_SENHA'. Grava as falhas (quem chama não pode dar erro depois, senão desfaz a contagem).
create or replace function private.supervisor_confere(p_emp uuid, p_senha text) returns text
language plpgsql security definer set search_path = '' as $$
declare s private.empresa_supervisor;
begin
  select * into s from private.empresa_supervisor where empresa_id = p_emp for update;
  if not found then return 'SEM_SENHA'; end if;
  if s.bloqueado_ate is not null and s.bloqueado_ate > now() then return 'BLOQUEADA'; end if;
  if private.supervisor_hash(s.sal, p_senha) = s.hash then
    update private.empresa_supervisor set falhas = 0, bloqueado_ate = null where empresa_id = p_emp;
    return 'OK';
  end if;
  update private.empresa_supervisor set falhas = case when s.falhas + 1 >= 5 then 0 else s.falhas + 1 end,
    bloqueado_ate = case when s.falhas + 1 >= 5 then now() + interval '10 minutes' else null end
   where empresa_id = p_emp;
  return 'ERRADA';
end $$;

create or replace function public.web_supervisor_status(p_slug text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; pode boolean := true;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.servidor_exige(v_emp, 'registrarApontamentosDiretosEmLote', false);
  begin perform private.servidor_exige(v_emp, 'salvarCadastro', true); exception when others then pode := false; end;
  return jsonb_build_object('tem_senha', exists (select 1 from private.empresa_supervisor where empresa_id = v_emp), 'pode_definir', pode);
end $$;

-- Cria ou troca a senha do supervisor. Para trocar, precisa da senha atual. Devolve {ok} ou {erro}.
create or replace function public.web_supervisor_definir(p_slug text, p_atual text, p_nova text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_sal text; st text;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.servidor_exige(v_emp, 'salvarCadastro', true);
  if length(coalesce(p_nova, '')) < 4 then raise exception 'A senha do supervisor precisa ter pelo menos 4 caracteres.'; end if;
  if exists (select 1 from private.empresa_supervisor where empresa_id = v_emp) then
    st := private.supervisor_confere(v_emp, p_atual);
    if st = 'BLOQUEADA' then return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas erradas. Espere 10 minutos.'); end if;
    if st <> 'OK' then return jsonb_build_object('ok', false, 'erro', 'A senha atual não confere.'); end if;
  end if;
  v_sal := encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');
  insert into private.empresa_supervisor (empresa_id, sal, hash, atualizado_em, atualizado_por)
  values (v_emp, v_sal, private.supervisor_hash(v_sal, p_nova), now(), private.meu_email())
  on conflict (empresa_id) do update set sal = excluded.sal, hash = excluded.hash, falhas = 0, bloqueado_ate = null, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  perform private.web_audita(v_emp, 'SENHA_SUPERVISOR', 'empresa_supervisor', v_emp::text, null, null, 'senha do supervisor definida');
  return jsonb_build_object('ok', true);
end $$;

-- Um apontamento da baixa completa (mesmas regras de private.campo_ponto, sem exigir tempo padrão).
create or replace function private.baixa_ponto(c public.cupons_producao, p_op text, p_metodo text, p_inicio timestamptz, p_fim timestamptz, p_pausa numeric, p_quem text, p_obs text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_maq text; seg_pad numeric; min_pad numeric; seg_real numeric := 0; min_real numeric; efic numeric; v_id text := gen_random_uuid()::text;
  v_dia date := (p_fim at time zone 'America/Sao_Paulo')::date; op public.cad_operadores; j public.jornada_operador; v_disp numeric; v_entr numeric; v_n int; v_pecas numeric;
begin
  select coalesce(nullif(c.id_maquina,''), (select pr.id_maquina_padrao from public.cad_processos pr where pr.empresa_id = c.empresa_id and pr.id_processo = c.id_processo)) into v_maq;
  seg_pad := coalesce(c.qtd_programada,0) * coalesce(c.tempo_padrao_seg_un,0);
  min_pad := private.r2(seg_pad / 60);
  if p_inicio is not null then seg_real := greatest(1, round(extract(epoch from (p_fim - p_inicio)) - coalesce(p_pausa,0))); end if;
  min_real := case when seg_real > 0 then private.r2(seg_real / 60) end;
  efic := case when seg_real > 0 and seg_pad > 0 then private.r2(seg_pad / seg_real * 100) end;
  insert into public.apontamentos_producao (empresa_id, id_apontamento, data_hora, data_producao, id_operador, id_cupom, cod_cupom, id_volume, id_produto, id_cor, id_tamanho,
    id_processo, id_setor, id_maquina, qtd_apontada, tempo_padrao_seg_un, segundos_entregues, minutos_entregues, tipo_apontamento, status, id_usuario_bipagem, origem_bipagem,
    data_hora_inicio, data_hora_fim, segundos_reais, minutos_reais, eficiencia_execucao_pct, observacao, atualizado_em)
  values (c.empresa_id, v_id, p_fim, v_dia, p_op, c.id_cupom, c.cod_cupom, c.id_volume, c.id_produto, c.id_cor, c.id_tamanho,
    c.id_processo, c.id_setor, nullif(v_maq,''), coalesce(c.qtd_programada,0), coalesce(c.tempo_padrao_seg_un,0), seg_pad, min_pad, p_metodo, 'VALIDO', p_quem,
    case when p_metodo = 'MARCACAO' then 'MARCACAO_TEMPO_REAL' else 'BAIXA_COMPLETA' end,
    p_inicio, p_fim, nullif(seg_real,0), min_real, efic, p_obs, now());
  update public.cupons_producao set status_cupom = 'CONCLUIDO', id_operador_bipagem = p_op, data_hora_bipagem = p_fim, id_apontamento = v_id,
      id_maquina = coalesce(nullif(v_maq,''), id_maquina),
      data_hora_fim_marcacao = case when p_metodo = 'MARCACAO' then p_fim else data_hora_fim_marcacao end,
      metodo_conclusao = p_metodo,
      pausado_em = case when p_metodo = 'MARCACAO' then null else pausado_em end,
      segundos_pausa = case when p_metodo = 'MARCACAO' then round(coalesce(p_pausa,0)) else segundos_pausa end,
      pausa_tipo = case when p_metodo = 'MARCACAO' then null else pausa_tipo end,
      atualizado_em = now()
    where empresa_id = c.empresa_id and id_cupom = c.id_cupom;
  if p_op = 'EMPRESA' then return min_pad; end if;   -- produção da empresa: sem jornada nem indicador de funcionário
  select * into op from public.cad_operadores where empresa_id = c.empresa_id and id_operador = p_op;
  select * into j from public.jornada_operador where empresa_id = c.empresa_id and id_operador = p_op and data = v_dia order by ordem_linha limit 1;
  if not found then
    insert into public.jornada_operador (empresa_id, id_jornada, data, id_operador, id_setor, minutos_previstos, minutos_intervalos, minutos_ausencia, minutos_extra,
      minutos_disponiveis, motivo_ajuste, id_usuario, criado_em, atualizado_em)
    values (c.empresa_id, gen_random_uuid()::text, v_dia, p_op, op.id_setor_padrao, coalesce(op.minutos_padrao_dia,540), 0, 0, 0, coalesce(op.minutos_padrao_dia,540),
      'Gerada automaticamente na primeira bipagem', p_quem, now(), now())
    returning * into j;
  end if;
  select count(*), private.r2(sum(a.minutos_entregues)), coalesce(sum(a.qtd_apontada),0) into v_n, v_entr, v_pecas from public.apontamentos_producao a
    where a.empresa_id = c.empresa_id and a.id_operador = p_op and upper(coalesce(a.status,'VALIDO')) <> 'CANCELADO'
      and coalesce(a.data_producao, (a.data_hora at time zone 'America/Sao_Paulo')::date) = v_dia;
  v_disp := coalesce(j.minutos_disponiveis, op.minutos_padrao_dia, 540);
  update public.indicador_diario set data = v_dia, id_setor = coalesce(j.id_setor, op.id_setor_padrao), minutos_disponiveis = v_disp, minutos_entregues = v_entr,
      eficiencia_pct = case when v_disp > 0 then private.r2(v_entr / v_disp * 100) else 0 end, qtd_cupons = v_n, qtd_apontamentos = v_n, qtd_pecas_apontadas = v_pecas, atualizado_em = now()
    where empresa_id = c.empresa_id and id_operador = p_op and data = v_dia;
  if not found then
    insert into public.indicador_diario (empresa_id, id_indicador, data, id_operador, id_setor, minutos_disponiveis, minutos_entregues, eficiencia_pct, qtd_cupons, qtd_apontamentos, qtd_pecas_apontadas, atualizado_em)
    values (c.empresa_id, gen_random_uuid()::text, v_dia, p_op, coalesce(j.id_setor, op.id_setor_padrao), v_disp, v_entr,
      case when v_disp > 0 then private.r2(v_entr / v_disp * 100) else 0 end, v_n, v_n, v_pecas, now());
  end if;
  return min_pad;
end $$;

-- p_cupons: as operações pendentes que a tela mostra para as caixas escolhidas.
-- Devolve {ok:true, operacoes, minutos, empresa_min, empresa_ops, por_funcionario:[{id,nome,ops,min}], volumes}
--      ou {ok:false, precisa_senha:true, sem_funcionario:n, erro} quando há operação sem funcionário e a senha não confere.
create or replace function public.web_baixa_caixas(p_slug text, p_cupons text[], p_senha text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; c public.cupons_producao; v_agora timestamptz := now(); v_quem text; st text; n_sem int := 0; r_min numeric;
  tot_ops int := 0; tot_min numeric := 0; emp_ops int := 0; emp_min numeric := 0; por jsonb := '{}'::jsonb; v_op text; v_nome text; vols text[] := '{}';
  v public.volumes; t int; f int; v_id text; v_pausa numeric;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.servidor_exige(v_emp, 'registrarApontamentosDiretosEmLote', true);
  if coalesce(array_length(p_cupons, 1), 0) = 0 then raise exception 'Nenhuma operação pendente nas caixas escolhidas.'; end if;
  if array_length(p_cupons, 1) > 3000 then raise exception 'Escolha menos caixas de uma vez (no máximo 3000 operações).'; end if;
  perform private.campo_trava(v_emp);
  v_quem := 'baixa-completa:' || coalesce(private.meu_email(), 'sistema');
  -- quantas ficariam sem funcionário (alocado ativo ou marcando agora)?
  select count(*) into n_sem from public.cupons_producao x
   where x.empresa_id = v_emp and x.id_cupom = any (p_cupons)
     and upper(coalesce(x.status_cupom,'')) not in ('CONCLUIDO','CANCELADO','ESTORNADO')
     and not (upper(coalesce(x.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and coalesce(x.id_operador_marcacao,'') <> '')
     and not exists (select 1 from public.cad_operadores o where o.empresa_id = v_emp and o.id_operador = x.id_operador_alocado
                       and upper(coalesce(o.ativo::text,'TRUE')) not in ('FALSE','0','NAO','NÃO','INATIVO'));
  if n_sem > 0 then
    st := private.supervisor_confere(v_emp, p_senha);
    if st <> 'OK' then
      return jsonb_build_object('ok', false, 'precisa_senha', true, 'sem_funcionario', n_sem, 'sem_senha_cadastrada', st = 'SEM_SENHA',
        'erro', case st when 'SEM_SENHA' then 'Ainda não há senha do supervisor. Crie a senha para dar baixa nas operações sem funcionário.'
                        when 'BLOQUEADA' then 'Muitas tentativas erradas. Espere 10 minutos.'
                        else case when coalesce(p_senha,'') = '' then 'Informe a senha do supervisor.' else 'Senha do supervisor incorreta.' end end);
    end if;
  end if;
  for c in select * from public.cupons_producao x where x.empresa_id = v_emp and x.id_cupom = any (p_cupons)
             and upper(coalesce(x.status_cupom,'')) not in ('CONCLUIDO','CANCELADO','ESTORNADO') order by x.id_volume, x.ordem_processo loop
    if exists (select 1 from public.apontamentos_producao a where a.empresa_id = v_emp and a.id_cupom = c.id_cupom and upper(coalesce(a.status,'VALIDO')) <> 'CANCELADO') then
      update public.cupons_producao set status_cupom = 'CONCLUIDO', atualizado_em = now() where empresa_id = v_emp and id_cupom = c.id_cupom;   -- já tinha apontamento
      continue;
    end if;
    if upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and coalesce(c.id_operador_marcacao,'') <> '' then
      v_op := c.id_operador_marcacao;
      v_pausa := coalesce(c.segundos_pausa,0) + case when c.pausado_em is not null then greatest(0, extract(epoch from (v_agora - c.pausado_em))) else 0 end;
      r_min := private.baixa_ponto(c, v_op, 'MARCACAO', c.data_hora_inicio_marcacao, v_agora, v_pausa, v_quem, 'Baixa completa da caixa');
    else
      select o.id_operador into v_op from public.cad_operadores o where o.empresa_id = v_emp and o.id_operador = c.id_operador_alocado
         and upper(coalesce(o.ativo::text,'TRUE')) not in ('FALSE','0','NAO','NÃO','INATIVO');
      if v_op is null then v_op := 'EMPRESA'; end if;
      r_min := private.baixa_ponto(c, v_op, 'APONTAMENTO', null, v_agora, null, v_quem,
                 case when v_op = 'EMPRESA' then 'Baixa completa sem funcionário (senha do supervisor)' else 'Baixa completa da caixa' end);
    end if;
    tot_ops := tot_ops + 1; tot_min := tot_min + coalesce(r_min, 0);
    if v_op = 'EMPRESA' then emp_ops := emp_ops + 1; emp_min := emp_min + coalesce(r_min, 0);
    else
      por := jsonb_set(por, array[v_op], jsonb_build_object('ops', coalesce((por -> v_op ->> 'ops')::int, 0) + 1, 'min', coalesce((por -> v_op ->> 'min')::numeric, 0) + coalesce(r_min, 0)));
    end if;
    if not (c.id_volume = any (vols)) then vols := vols || c.id_volume; end if;
    v_op := null;
  end loop;
  -- andamento das caixas
  foreach v_id in array vols loop
    select * into v from public.volumes where empresa_id = v_emp and id_volume = v_id;
    if found and upper(coalesce(v.status_volume,'')) <> 'EM_ESTOQUE_PA' and upper(coalesce(v.tipo_local_atual,'')) <> 'ESTOQUE_PA' then
      select count(*), count(*) filter (where upper(coalesce(x.status_cupom,'')) = 'CONCLUIDO') into t, f from public.cupons_producao x where x.empresa_id = v_emp and x.id_volume = v_id;
      if t > 0 then
        update public.volumes set id_processo_atual = null, status_volume = case when f >= t then 'CONCLUIDO_INTERNO' else 'EM_PRODUCAO_INTERNA' end, atualizado_em = now()
          where empresa_id = v_emp and id_volume = v_id;
        update public.remessas set atualizado_em = now() where empresa_id = v_emp and id_remessa in
          (select i.id_remessa from public.remessa_itens i where i.empresa_id = v_emp and i.id_volume = coalesce(nullif(v.id_volume_origem,''), v.id_volume));
      end if;
    end if;
  end loop;
  perform private.web_audita(v_emp, 'BAIXA_COMPLETA', 'cupons_producao', array_to_string(vols, ','), null,
    jsonb_build_object('operacoes', tot_ops, 'minutos', private.r2(tot_min), 'empresa_ops', emp_ops, 'empresa_min', private.r2(emp_min)), 'baixa completa da caixa');
  perform private.toca_revisao(v_emp);
  return jsonb_build_object('ok', true, 'operacoes', tot_ops, 'minutos', private.r2(tot_min), 'empresa_ops', emp_ops, 'empresa_min', private.r2(emp_min), 'volumes', to_jsonb(vols),
    'por_funcionario', coalesce((select jsonb_agg(jsonb_build_object('id', k, 'nome', coalesce(o.nome, k), 'ops', (x ->> 'ops')::int, 'min', private.r2((x ->> 'min')::numeric)) order by o.nome)
                                   from jsonb_each(por) e(k, x) left join public.cad_operadores o on o.empresa_id = v_emp and o.id_operador = e.k), '[]'::jsonb));
end $$;

revoke all on function private.supervisor_hash(text, text) from public, anon, authenticated;
revoke all on function private.supervisor_confere(uuid, text) from public, anon, authenticated;
revoke all on function private.baixa_ponto(public.cupons_producao, text, text, timestamptz, timestamptz, numeric, text, text) from public, anon, authenticated;
revoke all on function public.web_supervisor_status(text) from public, anon;
revoke all on function public.web_supervisor_definir(text, text, text) from public, anon;
revoke all on function public.web_baixa_caixas(text, text[], text) from public, anon;
grant execute on function public.web_supervisor_status(text) to authenticated;
grant execute on function public.web_supervisor_definir(text, text, text) to authenticated;
grant execute on function public.web_baixa_caixas(text, text[], text) to authenticated;
