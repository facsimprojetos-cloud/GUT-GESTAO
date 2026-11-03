-- GUT PPCP — app de campo direto no Supabase (operadores e facções), por empresa.
-- Mesmas regras do Apps Script (campoApi). Tudo preso ao empresa_id da sessão.

create table if not exists private.campo_sessoes (
  token_hash text primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null, id text not null, senha_em timestamptz,
  expira timestamptz not null, criado_em timestamptz not null default now(), ultimo_uso timestamptz
);
create index if not exists campo_sessoes_quem on private.campo_sessoes (empresa_id, tipo, id);
create table if not exists private.campo_falhas (
  empresa_id uuid not null, tipo text not null, login text not null, n int not null default 0, ate timestamptz,
  primary key (empresa_id, tipo, login)
);
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='private' and t.typname='campo_quem') then
    create type private.campo_quem as (empresa_id uuid, tipo text, id text, nome text, login text, modo text, lider boolean, min_dia numeric);
  end if;
end $$;

-- ---------- utilitários ----------
create or replace function private.r2(x numeric) returns numeric language sql immutable as $$ select round(coalesce(x,0), 2) $$;
create or replace function private.vol_code(p_cod text, p_sub text, p_seq numeric) returns text language plpgsql immutable set search_path to '' as $$
declare raw text := btrim(coalesce(p_cod,'')); sub text := btrim(coalesce(p_sub,'')); m text[];
begin
  m := regexp_match(raw, '^SEP-\d+-V(\d+)(\.\d+)?$', 'i');
  if m is not null and sub <> '' then return sub || '-V' || lpad(coalesce(nullif(m[1],'')::int, 1)::text, 2, '0') || coalesce(m[2], ''); end if;
  if raw <> '' then return raw; end if;
  if sub <> '' and coalesce(p_seq,0) > 0 then return sub || '-V' || lpad(p_seq::int::text, 2, '0'); end if;
  return sub;
end $$;
create or replace function private.hoje_sp() returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function private.campo_auth(p_token text) returns private.campo_quem language plpgsql security definer set search_path to '' as $$
declare s private.campo_sessoes; q private.campo_quem; h text := encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
begin
  select * into s from private.campo_sessoes where token_hash = h and expira > now();
  if not found then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  if not exists (select 1 from public.empresas e where e.id = s.empresa_id and e.status in ('ATIVA','TESTE')) then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  if s.tipo = 'FACCAO' then
    select s.empresa_id, 'FACCAO', d.id_destino, coalesce(d.nome_destino,''), coalesce(d.codigo_acesso,''), null, false, 0 into q
      from public.cad_destinos d where d.empresa_id = s.empresa_id and d.id_destino = s.id and d.ativo and d.acesso_app and d.senha_em is not distinct from s.senha_em;
  else
    select s.empresa_id, 'OPERADOR', o.id_operador, coalesce(o.nome,''), coalesce(o.matricula,''),
        case when upper(coalesce(o.modo_app,'')) in ('MARCADOR','APONTADOR','AMBOS') then upper(o.modo_app) else 'AMBOS' end,
        coalesce(o.lider_app,false), coalesce(o.minutos_padrao_dia, 540) into q
      from public.cad_operadores o where o.empresa_id = s.empresa_id and o.id_operador = s.id and o.ativo and o.acesso_app and o.senha_em is not distinct from s.senha_em;
  end if;
  if q.id is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  if s.ultimo_uso is null or s.ultimo_uso < now() - interval '10 minutes' then update private.campo_sessoes set ultimo_uso = now() where token_hash = h; end if;
  return q;
end $$;
create or replace function private.campo_perfil(q private.campo_quem) returns jsonb language sql immutable as $$
  select case when q.tipo = 'FACCAO' then jsonb_build_object('tipo','FACCAO','id',q.id,'nome',q.nome,'login',q.login)
    else jsonb_build_object('tipo','OPERADOR','id',q.id,'nome',q.nome,'login',q.login,'modo',q.modo,'lider',q.lider) end;
$$;
create or replace function private.campo_exige(q private.campo_quem, p_tipo text) returns void language plpgsql immutable as $$
begin if q.tipo <> p_tipo then raise exception 'Acesso não permitido para este perfil.'; end if; end $$;
create or replace function private.campo_trava(p_emp uuid) returns void language sql as $$ select pg_advisory_xact_lock(hashtextextended('gut-campo:' || p_emp::text, 0)) $$;
create or replace function private.campo_quem_txt(q private.campo_quem) returns text language sql immutable as $$ select 'app-campo:' || coalesce(nullif(q.login,''), q.id) $$;
create or replace function private.campo_visivel(c public.cupons_producao, p_op text) returns boolean language sql immutable as $$
  select upper(coalesce(c.status_cupom,'')) not in ('CONCLUIDO','CANCELADO','ESTORNADO')
    and case when upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' then coalesce(c.id_operador_marcacao,'') = p_op
             else coalesce(c.id_operador_alocado,'') = p_op end;
$$;
create or replace function private.campo_audita(p_emp uuid, p_quem text, p_acao text, p_tab text, p_dados jsonb) returns void language sql security definer set search_path to '' as $$
  insert into public.auditoria (empresa_id, id_log, data_hora, id_usuario, acao, tabela, id_registro, dados_antes, dados_depois, observacao)
  values (p_emp, gen_random_uuid()::text, now(), p_quem, p_acao, p_tab, '', '', p_dados::text, 'app de campo');
$$;

-- ---------- listas ----------
create or replace function private.campo_lista_op(q private.campo_quem) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_hoje date := private.hoje_sp(); lista jsonb; h record; v_meta numeric;
begin
  select coalesce(jsonb_agg(x.o order by x.run desc, x.pau desc, x.aloc desc, x.caixa, x.ordem), '[]'::jsonb) into lista from (
    select (upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and c.pausado_em is null) run,
           (upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and c.pausado_em is not null) pau,
           (coalesce(c.id_operador_alocado,'') = q.id) aloc,
           coalesce(nullif(private.vol_code(v.cod_volume, v.sublote, coalesce(v.seq_separacao, v.volume_seq)),''), c.cod_volume, '') caixa,
           coalesce(c.ordem_processo,0) ordem,
           jsonb_build_object(
             'ID_CUPOM', c.id_cupom, 'CODIGO', coalesce(c.cod_cupom,''),
             'CAIXA', coalesce(nullif(private.vol_code(v.cod_volume, v.sublote, coalesce(v.seq_separacao, v.volume_seq)),''), c.cod_volume, ''),
             'ORDEM', coalesce(c.ordem_processo,0), 'PROCESSO', coalesce(pr.processo,''),
             'PRODUTO', coalesce(nullif(concat_ws(' - ', nullif(p.codigo_produto,''), nullif(p.produto,'')),''), ''),
             'COR', coalesce(co.cor,''), 'TAMANHO', coalesce(t.tamanho,''), 'MAQUINA', coalesce(m.maquina,''),
             'TOKEN', coalesce(c.qr_token,''), 'QTD', coalesce(c.qtd_programada,0), 'MIN_PADRAO', coalesce(c.minutos_padrao_total,0),
             'SEM_PADRAO', coalesce(c.tempo_padrao_seg_un,0) <= 0, 'ALOCADO', coalesce(c.id_operador_alocado,'') = q.id,
             'EM_ANDAMENTO', upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and c.pausado_em is null,
             'PAUSADO', upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and c.pausado_em is not null,
             'PAUSA_TIPO', coalesce(c.pausa_tipo,''),
             'INICIO', case when upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' then c.data_hora_inicio_marcacao end,
             'PAUSADO_EM', c.pausado_em, 'SEG_PAUSA', coalesce(c.segundos_pausa,0)) o
    from public.cupons_producao c
    left join public.volumes v on v.empresa_id = c.empresa_id and v.id_volume = c.id_volume
    left join public.cad_processos pr on pr.empresa_id = c.empresa_id and pr.id_processo = c.id_processo
    left join public.cad_produtos p on p.empresa_id = c.empresa_id and p.id_produto = c.id_produto
    left join public.cad_cores co on co.empresa_id = c.empresa_id and co.id_cor = c.id_cor
    left join public.cad_tamanhos t on t.empresa_id = c.empresa_id and t.id_tamanho = c.id_tamanho
    left join public.cad_maquinas m on m.empresa_id = c.empresa_id and m.id_maquina = coalesce(nullif(c.id_maquina,''), pr.id_maquina_padrao)
    where c.empresa_id = q.empresa_id and private.campo_visivel(c, q.id)
    order by 1 desc, 2 desc, 3 desc, 4, 5 limit 200) x;
  select count(*) n, coalesce(sum(a.qtd_apontada),0) pecas, private.r2(sum(a.minutos_entregues)) minutos,
         coalesce(sum(a.minutos_entregues) filter (where coalesce(a.minutos_reais,0) > 0),0) mpad,
         coalesce(sum(a.minutos_reais) filter (where coalesce(a.minutos_reais,0) > 0),0) mreal into h
    from public.apontamentos_producao a
    where a.empresa_id = q.empresa_id and a.id_operador = q.id and upper(coalesce(a.status,'VALIDO')) <> 'CANCELADO'
      and coalesce(a.data_producao, (a.data_hora at time zone 'America/Sao_Paulo')::date) = v_hoje;
  select coalesce(nullif(j.minutos_disponiveis,0), nullif(q.min_dia,0), 540) into v_meta from (select 1) z
    left join public.jornada_operador j on j.empresa_id = q.empresa_id and j.id_operador = q.id and j.data = v_hoje;
  return jsonb_build_object('ok', true, 'perfil', private.campo_perfil(q), 'cupons', lista,
    'hoje', jsonb_build_object('operacoes', h.n, 'pecas', h.pecas, 'minutos', h.minutos, 'meta', private.r2(v_meta),
      'pct', case when v_meta > 0 then private.r2(h.minutos / v_meta * 100) else 0 end,
      'eficMarcacao', case when h.mreal >= 5 then least(999, private.r2(h.mpad / h.mreal * 100)) end,
      'minutosReais', private.r2(h.mreal)));
end $$;

create or replace function private.campo_lista_fac(q private.campo_quem) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  with rem as (
    select r.* from public.remessas r
    where r.empresa_id = q.empresa_id and r.id_destino = q.id
      and upper(coalesce(r.status_remessa,'')) not in ('AGUARDANDO_ENVIO','CANCELADA','CONCLUIDA')
  ), it as (
    select i.*, v.cod_volume vcod, v.sublote vsub, coalesce(v.seq_separacao, v.volume_seq) vseq, v.id_estoque_corte vest
    from public.remessa_itens i join rem on rem.id_remessa = i.id_remessa
    left join public.volumes v on v.empresa_id = i.empresa_id and v.id_volume = i.id_volume
    where i.empresa_id = q.empresa_id and coalesce(i.qtd_enviada,0) - coalesce(i.qtd_retornada,0) > 0
      and upper(coalesce(i.status_item,'')) <> 'AGUARDANDO_ENVIO'
  ), av as (
    select a.id_remessa, coalesce(a.id_volume,'') vol, upper(coalesce(a.tipo,'')) tipo, a.data_hora from public.faccao_avisos a
    where a.empresa_id = q.empresa_id and a.id_remessa in (select id_remessa from rem)
  ), cx as (
    select it.id_remessa, it.id_volume,
      jsonb_build_object('ID_VOLUME', it.id_volume, 'CODIGO', coalesce(nullif(private.vol_code(it.vcod, it.vsub, it.vseq),''), it.cod_volume, ''),
        'QTD', coalesce(it.qtd_enviada,0) - coalesce(it.qtd_retornada,0),
        'CONTEUDO', coalesce((select jsonb_agg(jsonb_build_object('ID_PRODUTO', vi.id_produto,
              'PRODUTO', coalesce(nullif(concat_ws(' - ', nullif(p.codigo_produto,''), nullif(p.produto,'')),''),''),
              'COR', coalesce(co.cor,''), 'TAMANHO', coalesce(t.tamanho,''), 'QTD', coalesce(vi.qtd_item,0)) order by vi.ordem_linha)
            from public.volume_itens vi
            left join public.cad_produtos p on p.empresa_id = vi.empresa_id and p.id_produto = vi.id_produto
            left join public.cad_cores co on co.empresa_id = vi.empresa_id and co.id_cor = vi.id_cor
            left join public.cad_tamanhos t on t.empresa_id = vi.empresa_id and t.id_tamanho = vi.id_tamanho
            where vi.empresa_id = q.empresa_id and vi.id_volume = it.id_volume),
          (select jsonb_build_array(jsonb_build_object('ID_PRODUTO', e.id_produto,
              'PRODUTO', coalesce(nullif(concat_ws(' - ', nullif(p.codigo_produto,''), nullif(p.produto,'')),''),''),
              'COR', coalesce(co.cor,''), 'TAMANHO', coalesce(t.tamanho,''), 'QTD', coalesce(it.qtd_enviada,0)))
            from public.estoque_corte e
            left join public.cad_produtos p on p.empresa_id = e.empresa_id and p.id_produto = e.id_produto
            left join public.cad_cores co on co.empresa_id = e.empresa_id and co.id_cor = e.id_cor
            left join public.cad_tamanhos t on t.empresa_id = e.empresa_id and t.id_tamanho = e.id_tamanho
            where e.empresa_id = q.empresa_id and e.id_estoque_corte = it.vest), '[]'::jsonb),
        'STATUS_CAMPO', coalesce((select av.tipo from av where av.id_remessa = it.id_remessa and (av.vol = it.id_volume or av.vol = '')
            order by av.data_hora desc, (av.vol <> '') desc limit 1), '')) o,
      it.ordem_linha
    from it
  )
  select coalesce(jsonb_agg(x.o order by x.prev nulls last), '[]'::jsonb) into r from (
    select rem.previsao_retorno prev,
      jsonb_build_object('ID_REMESSA', rem.id_remessa, 'NUM_REMESSA', coalesce(rem.num_remessa,''),
        'DATA_ENVIO', coalesce(rem.data_envio, rem.data_hora), 'PREVISAO_RETORNO', rem.previsao_retorno,
        'PROCESSO', coalesce(pr.processo,''),
        'CAIXAS', (select jsonb_agg(cx.o order by cx.ordem_linha) from cx where cx.id_remessa = rem.id_remessa),
        'QTD', (select coalesce(sum((cx.o->>'QTD')::numeric),0) from cx where cx.id_remessa = rem.id_remessa),
        'PRODUTOS', (select coalesce(jsonb_agg(distinct jsonb_build_object('ID_PRODUTO', c.value->>'ID_PRODUTO', 'PRODUTO', c.value->>'PRODUTO')), '[]'::jsonb)
                     from cx, jsonb_array_elements(cx.o->'CONTEUDO') c where cx.id_remessa = rem.id_remessa and coalesce(c.value->>'ID_PRODUTO','') <> ''),
        'STATUS_CAMPO', (select case when count(*) > 0 and count(*) filter (where cx.o->>'STATUS_CAMPO' = 'CONCLUIDO') = count(*) then 'CONCLUIDO'
                                     when count(*) filter (where cx.o->>'STATUS_CAMPO' = 'CONCLUIDO') > 0 then 'PARCIAL'
                                     when count(*) filter (where cx.o->>'STATUS_CAMPO' = 'INICIADO') > 0 then 'INICIADO' else '' end
                         from cx where cx.id_remessa = rem.id_remessa)) o
    from rem left join public.cad_processos pr on pr.empresa_id = rem.empresa_id and pr.id_processo = rem.id_processo
    where exists (select 1 from cx where cx.id_remessa = rem.id_remessa)) x;
  return jsonb_build_object('ok', true, 'perfil', private.campo_perfil(q), 'remessas', r);
end $$;

-- ---------- baixa de produção (igual ao productionPointFromCouponUnlocked_) ----------
create or replace function private.campo_ponto(q private.campo_quem, c public.cupons_producao, p_metodo text, p_inicio timestamptz, p_fim timestamptz, p_pausa numeric)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_maq text; seg_pad numeric; min_pad numeric; seg_real numeric := 0; min_real numeric; efic numeric; v_id text := gen_random_uuid()::text;
  v_dia date := (p_fim at time zone 'America/Sao_Paulo')::date; op public.cad_operadores; j public.jornada_operador; v_disp numeric; v_entr numeric; v_n int; v_pecas numeric;
  v public.volumes; tot int; feitos int;
begin
  if upper(coalesce(c.status_cupom,'')) = 'CONCLUIDO' then raise exception 'Esta operação já foi concluída.'; end if;
  if p_metodo <> 'MARCACAO' and coalesce(c.tempo_padrao_seg_un,0) <= 0 then raise exception 'Operação sem tempo padrão: cronometre com o Marcador.'; end if;
  if p_metodo <> 'MARCACAO' and exists (select 1 from public.apontamentos_producao a where a.empresa_id = c.empresa_id and a.id_cupom = c.id_cupom and upper(coalesce(a.status,'VALIDO')) <> 'CANCELADO') then
    raise exception 'Esta operação já possui apontamento válido.'; end if;
  select * into op from public.cad_operadores where empresa_id = c.empresa_id and id_operador = q.id;
  select coalesce(nullif(c.id_maquina,''), (select pr.id_maquina_padrao from public.cad_processos pr where pr.empresa_id = c.empresa_id and pr.id_processo = c.id_processo)) into v_maq;
  seg_pad := coalesce(c.qtd_programada,0) * coalesce(c.tempo_padrao_seg_un,0);
  min_pad := private.r2(seg_pad / 60);
  if p_inicio is not null then seg_real := greatest(1, round(extract(epoch from (p_fim - p_inicio)) - coalesce(p_pausa,0))); end if;
  min_real := case when seg_real > 0 then private.r2(seg_real / 60) end;
  efic := case when seg_real > 0 and seg_pad > 0 then private.r2(seg_pad / seg_real * 100) end;
  insert into public.apontamentos_producao (empresa_id, id_apontamento, data_hora, data_producao, id_operador, id_cupom, cod_cupom, id_volume, id_produto, id_cor, id_tamanho,
    id_processo, id_setor, id_maquina, qtd_apontada, tempo_padrao_seg_un, segundos_entregues, minutos_entregues, tipo_apontamento, status, id_usuario_bipagem, origem_bipagem,
    data_hora_inicio, data_hora_fim, segundos_reais, minutos_reais, eficiencia_execucao_pct, observacao, atualizado_em)
  values (c.empresa_id, v_id, p_fim, v_dia, q.id, c.id_cupom, c.cod_cupom, c.id_volume, c.id_produto, c.id_cor, c.id_tamanho,
    c.id_processo, c.id_setor, nullif(v_maq,''), coalesce(c.qtd_programada,0), coalesce(c.tempo_padrao_seg_un,0), seg_pad, min_pad, p_metodo, 'VALIDO', private.campo_quem_txt(q),
    case when p_metodo = 'MARCACAO' then 'MARCACAO_TEMPO_REAL' else 'APONTAMENTO_DIRETO' end,
    p_inicio, p_fim, nullif(seg_real,0), min_real, efic, null, now());
  update public.cupons_producao set status_cupom = 'CONCLUIDO', id_operador_bipagem = q.id, data_hora_bipagem = p_fim, id_apontamento = v_id,
      id_maquina = coalesce(nullif(v_maq,''), id_maquina),
      data_hora_fim_marcacao = case when p_metodo = 'MARCACAO' then p_fim else data_hora_fim_marcacao end,
      metodo_conclusao = p_metodo,
      pausado_em = case when p_metodo = 'MARCACAO' then null else pausado_em end,
      segundos_pausa = case when p_metodo = 'MARCACAO' then round(coalesce(p_pausa,0)) else segundos_pausa end,
      pausa_tipo = case when p_metodo = 'MARCACAO' then null else pausa_tipo end,
      atualizado_em = now()
    where empresa_id = c.empresa_id and id_cupom = c.id_cupom;
  -- jornada do dia (criada na primeira baixa)
  select * into j from public.jornada_operador where empresa_id = c.empresa_id and id_operador = q.id and data = v_dia order by ordem_linha limit 1;
  if not found then
    insert into public.jornada_operador (empresa_id, id_jornada, data, id_operador, id_setor, minutos_previstos, minutos_intervalos, minutos_ausencia, minutos_extra,
      minutos_disponiveis, motivo_ajuste, id_usuario, criado_em, atualizado_em)
    values (c.empresa_id, gen_random_uuid()::text, v_dia, q.id, op.id_setor_padrao, coalesce(op.minutos_padrao_dia,540), 0, 0, 0, coalesce(op.minutos_padrao_dia,540),
      'Gerada automaticamente na primeira bipagem', private.campo_quem_txt(q), now(), now())
    returning * into j;
  end if;
  -- indicador diário
  select count(*), private.r2(sum(a.minutos_entregues)), coalesce(sum(a.qtd_apontada),0) into v_n, v_entr, v_pecas from public.apontamentos_producao a
    where a.empresa_id = c.empresa_id and a.id_operador = q.id and upper(coalesce(a.status,'VALIDO')) <> 'CANCELADO'
      and coalesce(a.data_producao, (a.data_hora at time zone 'America/Sao_Paulo')::date) = v_dia;
  v_disp := coalesce(j.minutos_disponiveis, op.minutos_padrao_dia, 540);
  update public.indicador_diario set data = v_dia, id_setor = coalesce(j.id_setor, op.id_setor_padrao), minutos_disponiveis = v_disp, minutos_entregues = v_entr,
      eficiencia_pct = case when v_disp > 0 then private.r2(v_entr / v_disp * 100) else 0 end, qtd_cupons = v_n, qtd_apontamentos = v_n, qtd_pecas_apontadas = v_pecas, atualizado_em = now()
    where empresa_id = c.empresa_id and id_operador = q.id and data = v_dia;
  if not found then
    insert into public.indicador_diario (empresa_id, id_indicador, data, id_operador, id_setor, minutos_disponiveis, minutos_entregues, eficiencia_pct, qtd_cupons, qtd_apontamentos, qtd_pecas_apontadas, atualizado_em)
    values (c.empresa_id, gen_random_uuid()::text, v_dia, q.id, coalesce(j.id_setor, op.id_setor_padrao), v_disp, v_entr,
      case when v_disp > 0 then private.r2(v_entr / v_disp * 100) else 0 end, v_n, v_n, v_pecas, now());
  end if;
  -- andamento da caixa
  select * into v from public.volumes where empresa_id = c.empresa_id and id_volume = c.id_volume;
  if found and upper(coalesce(v.status_volume,'')) <> 'EM_ESTOQUE_PA' and upper(coalesce(v.tipo_local_atual,'')) <> 'ESTOQUE_PA' then
    select count(*), count(*) filter (where upper(coalesce(x.status_cupom,'')) = 'CONCLUIDO') into tot, feitos from public.cupons_producao x where x.empresa_id = c.empresa_id and x.id_volume = c.id_volume;
    if tot > 0 then
      update public.volumes set id_processo_atual = null, status_volume = case when feitos >= tot then 'CONCLUIDO_INTERNO' else 'EM_PRODUCAO_INTERNA' end, atualizado_em = now()
        where empresa_id = c.empresa_id and id_volume = c.id_volume;
      update public.remessas set atualizado_em = now() where empresa_id = c.empresa_id and id_remessa in
        (select i.id_remessa from public.remessa_itens i where i.empresa_id = c.empresa_id and i.id_volume = coalesce(nullif(v.id_volume_origem,''), v.id_volume));
    end if;
  end if;
  return jsonb_build_object('minutosPadrao', min_pad, 'minutosReais', min_real, 'eficiencia', efic);
end $$;

-- ---------- API pública do app de campo (chamada com a chave pública + token da sessão) ----------
create or replace function public.campo_empresa(p_empresa text) returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('ok', true, 'nome', e.nome) from public.empresas e where e.slug = lower(btrim(coalesce(p_empresa,''))) and e.status in ('ATIVA','TESTE')),
    jsonb_build_object('ok', false));
$$;

create or replace function public.campo_login(p_empresa text, p_tipo text, p_login text, p_senha text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_emp uuid; v_tipo text := case when upper(coalesce(p_tipo,'')) = 'FACCAO' then 'FACCAO' else 'OPERADOR' end;
  v_login text := upper(btrim(coalesce(p_login,''))); v_senha text := btrim(coalesce(p_senha,'')); f private.campo_falhas;
  rid text; rhash text; rsalt text; rsem timestamptz; tok text; q private.campo_quem;
begin
  if v_login = '' or v_senha = '' then return jsonb_build_object('error', 'Informe o código e a senha.'); end if;
  select id into v_emp from public.empresas where slug = lower(btrim(coalesce(p_empresa,''))) and status in ('ATIVA','TESTE');
  if v_emp is null then return jsonb_build_object('error', 'Empresa não encontrada. Confira o link do app.'); end if;
  select * into f from private.campo_falhas where empresa_id = v_emp and tipo = v_tipo and login = v_login;
  if found and f.n >= 6 and f.ate > now() then return jsonb_build_object('error', 'Muitas tentativas erradas. Aguarde 10 minutos e tente de novo.'); end if;
  if v_tipo = 'FACCAO' then
    select d.id_destino, d.senha_hash, d.senha_salt, d.senha_em into rid, rhash, rsalt, rsem from public.cad_destinos d
      where d.empresa_id = v_emp and d.ativo and upper(coalesce(d.tipo_destino,'')) = 'FACCAO' and upper(btrim(coalesce(d.codigo_acesso,''))) = v_login order by d.ordem_linha limit 1;
    if rid is not null and not coalesce((select acesso_app from public.cad_destinos where empresa_id = v_emp and id_destino = rid), false) then rid := null; end if;
  else
    select o.id_operador, o.senha_hash, o.senha_salt, o.senha_em into rid, rhash, rsalt, rsem from public.cad_operadores o
      where o.empresa_id = v_emp and o.ativo and upper(btrim(coalesce(o.matricula,''))) = v_login order by o.ordem_linha limit 1;
    if rid is not null and not coalesce((select acesso_app from public.cad_operadores where empresa_id = v_emp and id_operador = rid), false) then rid := null; end if;
  end if;
  if rid is null or coalesce(rhash,'') = '' or private.campo_hash(v_senha, coalesce(rsalt,'')) <> rhash then
    insert into private.campo_falhas (empresa_id, tipo, login, n, ate) values (v_emp, v_tipo, v_login, 1, now() + interval '10 minutes')
      on conflict (empresa_id, tipo, login) do update set n = case when private.campo_falhas.ate < now() then 1 else private.campo_falhas.n + 1 end, ate = now() + interval '10 minutes';
    return jsonb_build_object('error', 'Código ou senha incorretos.');
  end if;
  delete from private.campo_falhas where empresa_id = v_emp and tipo = v_tipo and login = v_login;
  delete from private.campo_sessoes where expira < now();
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.campo_sessoes (token_hash, empresa_id, tipo, id, senha_em, expira) values (encode(extensions.digest(tok, 'sha256'), 'hex'), v_emp, v_tipo, rid, rsem, now() + interval '30 days');
  if v_tipo = 'FACCAO' then update public.cad_destinos set ultimo_acesso_app = now() where empresa_id = v_emp and id_destino = rid;
  else update public.cad_operadores set ultimo_acesso_app = now() where empresa_id = v_emp and id_operador = rid; end if;
  q := private.campo_auth(tok);
  return jsonb_build_object('ok', true, 'token', tok, 'empresa_id', v_emp, 'perfil', private.campo_perfil(q));
end $$;

create or replace function public.campo_sair(p_token text) returns jsonb language sql security definer set search_path to '' as $$
  delete from private.campo_sessoes where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;
create or replace function public.campo_perfil(p_token text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token);
begin return jsonb_build_object('ok', true, 'empresa_id', q.empresa_id, 'perfil', private.campo_perfil(q)); end $$;

create or replace function public.campo_op_cupons(p_token text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token);
begin perform private.campo_exige(q, 'OPERADOR'); return private.campo_lista_op(q); end $$;

create or replace function private.campo_cupom(q private.campo_quem, p_id text) returns public.cupons_producao language plpgsql security definer set search_path to '' as $$
declare c public.cupons_producao;
begin
  select * into c from public.cupons_producao where empresa_id = q.empresa_id and id_cupom = coalesce(p_id,'') for update;
  if not found then raise exception 'Operação não encontrada.'; end if;
  if not private.campo_visivel(c, q.id) then raise exception 'Esta operação não está disponível para você (já foi feita ou está com outra pessoa).'; end if;
  return c;
end $$;

create or replace function public.campo_op_iniciar(p_token text, p_id_cupom text, p_pausar_outra boolean default false) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); c public.cupons_producao; outra public.cupons_producao; v_agora timestamptz := now(); v_pausada text := '';
begin
  perform private.campo_exige(q, 'OPERADOR');
  if q.modo = 'APONTADOR' then raise exception 'Seu acesso é só de apontamento.'; end if;
  perform private.campo_trava(q.empresa_id);
  c := private.campo_cupom(q, p_id_cupom);
  if upper(coalesce(c.status_cupom,'')) = 'CONCLUIDO' then raise exception 'Esta operação já foi concluída.'; end if;
  if upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' then raise exception 'Esta operação já possui marcação em andamento.'; end if;
  select * into outra from public.cupons_producao x where x.empresa_id = q.empresa_id and x.id_cupom <> c.id_cupom
    and upper(coalesce(x.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and x.pausado_em is null and x.id_operador_marcacao = q.id limit 1 for update;
  if found then
    if not coalesce(p_pausar_outra,false) then raise exception 'Este operador já possui outra marcação em andamento (%). Pause ou finalize antes de iniciar uma nova.', coalesce(outra.cod_cupom,'operação'); end if;
    update public.cupons_producao set pausado_em = v_agora, pausa_tipo = 'INDIVIDUAL', atualizado_em = v_agora where empresa_id = q.empresa_id and id_cupom = outra.id_cupom;
    v_pausada := outra.id_cupom;
  end if;
  update public.cupons_producao set status_cupom = 'EM_ANDAMENTO_MARCACAO', id_operador_marcacao = q.id, data_hora_inicio_marcacao = v_agora, data_hora_fim_marcacao = null,
      metodo_conclusao = 'MARCACAO', pausado_em = null, segundos_pausa = 0, pausa_tipo = null, atualizado_em = v_agora
    where empresa_id = q.empresa_id and id_cupom = c.id_cupom;
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'ID_CUPOM', c.id_cupom, 'inicio', v_agora, 'pausada', v_pausada, '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_op_finalizar(p_token text, p_id_cupom text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); c public.cupons_producao; v_fim timestamptz := now(); v_pausa numeric; r jsonb;
begin
  perform private.campo_exige(q, 'OPERADOR');
  if q.modo = 'APONTADOR' then raise exception 'Seu acesso é só de apontamento.'; end if;
  perform private.campo_trava(q.empresa_id);
  c := private.campo_cupom(q, p_id_cupom);
  if upper(coalesce(c.status_cupom,'')) <> 'EM_ANDAMENTO_MARCACAO' or coalesce(c.id_operador_marcacao,'') <> q.id then raise exception 'Esta operação não está em andamento com você.'; end if;
  if c.data_hora_inicio_marcacao is null then raise exception 'Não foi possível recuperar o horário de início.'; end if;
  v_pausa := round(coalesce(c.segundos_pausa,0) + case when c.pausado_em is not null then greatest(0, extract(epoch from (v_fim - c.pausado_em))) else 0 end);
  r := private.campo_ponto(q, c, 'MARCACAO', c.data_hora_inicio_marcacao, v_fim, v_pausa);
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'ID_CUPOM', c.id_cupom, 'minutosReais', r->'minutosReais', 'minutosPadrao', r->'minutosPadrao', 'eficiencia', r->'eficiencia', '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_op_apontar(p_token text, p_id_cupom text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); c public.cupons_producao; r jsonb;
begin
  perform private.campo_exige(q, 'OPERADOR');
  if q.modo = 'MARCADOR' then raise exception 'Seu acesso é pelo marcador: use Iniciar e Finalizar.'; end if;
  perform private.campo_trava(q.empresa_id);
  c := private.campo_cupom(q, p_id_cupom);
  if upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' then raise exception 'Esta operação está com o marcador em andamento. Finalize-a.'; end if;
  r := private.campo_ponto(q, c, 'APONTAMENTO', null, now(), null);
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'ID_CUPOM', c.id_cupom, 'minutosPadrao', r->'minutosPadrao', '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_op_pausar(p_token text, p_id_cupom text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); c public.cupons_producao; v_agora timestamptz := now();
begin
  perform private.campo_exige(q, 'OPERADOR');
  perform private.campo_trava(q.empresa_id);
  c := private.campo_cupom(q, p_id_cupom);
  if upper(coalesce(c.status_cupom,'')) <> 'EM_ANDAMENTO_MARCACAO' then raise exception 'Esta operação não está em andamento.'; end if;
  if coalesce(c.id_operador_marcacao,'') <> q.id then raise exception 'Esta operação está com outra pessoa.'; end if;
  if c.pausado_em is null then
    update public.cupons_producao set pausado_em = v_agora, pausa_tipo = 'INDIVIDUAL', atualizado_em = v_agora where empresa_id = q.empresa_id and id_cupom = c.id_cupom;
    perform private.toca_revisao(q.empresa_id);
  end if;
  return jsonb_build_object('ok', true, 'ID_CUPOM', c.id_cupom, 'jaPausada', c.pausado_em is not null, '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_op_retomar(p_token text, p_id_cupom text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); c public.cupons_producao; v_agora timestamptz := now(); v_seg numeric;
begin
  perform private.campo_exige(q, 'OPERADOR');
  perform private.campo_trava(q.empresa_id);
  c := private.campo_cupom(q, p_id_cupom);
  if upper(coalesce(c.status_cupom,'')) <> 'EM_ANDAMENTO_MARCACAO' or c.pausado_em is null then raise exception 'Esta operação não está pausada.'; end if;
  if coalesce(c.id_operador_marcacao,'') <> q.id then raise exception 'Esta operação está com outra pessoa.'; end if;
  update public.cupons_producao set pausado_em = v_agora, pausa_tipo = 'INDIVIDUAL', atualizado_em = v_agora
    where empresa_id = q.empresa_id and id_cupom <> c.id_cupom and upper(coalesce(status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and pausado_em is null and id_operador_marcacao = q.id;
  v_seg := round(coalesce(c.segundos_pausa,0) + greatest(0, extract(epoch from (v_agora - c.pausado_em))));
  update public.cupons_producao set pausado_em = null, pausa_tipo = null, segundos_pausa = v_seg, atualizado_em = v_agora where empresa_id = q.empresa_id and id_cupom = c.id_cupom;
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'ID_CUPOM', c.id_cupom, 'SEGUNDOS_PAUSA', v_seg, '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_op_pausar_todos(p_token text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); v_agora timestamptz := now(); n int;
begin
  perform private.campo_exige(q, 'OPERADOR');
  if not q.lider then raise exception 'Só o líder pode pausar todos.'; end if;
  perform private.campo_trava(q.empresa_id);
  update public.cupons_producao set pausado_em = v_agora, pausa_tipo = 'COLETIVA', atualizado_em = v_agora
    where empresa_id = q.empresa_id and upper(coalesce(status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and pausado_em is null;
  get diagnostics n = row_count;
  perform private.campo_audita(q.empresa_id, private.campo_quem_txt(q), 'PAUSA_COLETIVA', 'CUPONS_PRODUCAO', jsonb_build_object('QTD', n, 'POR', q.nome));
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'qtd', n, '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_op_retomar_todos(p_token text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); v_agora timestamptz := now(); n int;
begin
  perform private.campo_exige(q, 'OPERADOR');
  if not q.lider then raise exception 'Só o líder pode retomar todos.'; end if;
  perform private.campo_trava(q.empresa_id);
  with ocupados as (
    select distinct id_operador_marcacao op from public.cupons_producao
    where empresa_id = q.empresa_id and upper(coalesce(status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and pausado_em is null
  ), alvo as (
    select distinct on (c.id_operador_marcacao) c.id_cupom from public.cupons_producao c
    where c.empresa_id = q.empresa_id and upper(coalesce(c.status_cupom,'')) = 'EM_ANDAMENTO_MARCACAO' and c.pausado_em is not null
      and upper(coalesce(c.pausa_tipo,'')) = 'COLETIVA' and coalesce(c.id_operador_marcacao,'') not in (select coalesce(op,'') from ocupados)
    order by c.id_operador_marcacao, c.pausado_em desc
  )
  update public.cupons_producao c set segundos_pausa = round(coalesce(c.segundos_pausa,0) + greatest(0, extract(epoch from (v_agora - c.pausado_em)))),
      pausado_em = null, pausa_tipo = null, atualizado_em = v_agora
    where c.empresa_id = q.empresa_id and c.id_cupom in (select id_cupom from alvo);
  get diagnostics n = row_count;
  perform private.campo_audita(q.empresa_id, private.campo_quem_txt(q), 'RETOMADA_COLETIVA', 'CUPONS_PRODUCAO', jsonb_build_object('QTD', n, 'POR', q.nome));
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'qtd', n, '__lista', private.campo_lista_op(q));
end $$;

create or replace function public.campo_faccao_remessas(p_token text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token);
begin perform private.campo_exige(q, 'FACCAO'); return private.campo_lista_fac(q); end $$;

create or replace function public.campo_faccao_aviso(p_token text, p_id_remessa text, p_id_volume text, p_tipo text, p_obs text default '') returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); v_tipo text := upper(coalesce(p_tipo,'')); rem public.remessas; it public.remessa_itens; v_agora timestamptz := now();
begin
  perform private.campo_exige(q, 'FACCAO');
  if v_tipo not in ('INICIADO','CONCLUIDO') then raise exception 'Aviso inválido.'; end if;
  select * into rem from public.remessas where empresa_id = q.empresa_id and id_remessa = coalesce(p_id_remessa,'');
  if not found or coalesce(rem.id_destino,'') <> q.id then raise exception 'Remessa não encontrada para esta facção.'; end if;
  if coalesce(p_id_volume,'') <> '' then
    select * into it from public.remessa_itens where empresa_id = q.empresa_id and id_remessa = rem.id_remessa and id_volume = p_id_volume limit 1;
    if not found then raise exception 'Caixa não pertence a esta remessa.'; end if;
  end if;
  insert into public.faccao_avisos (empresa_id, id_aviso, id_remessa, num_remessa, id_destino, id_volume, cod_volume, tipo, data_hora, origem, obs, lido_em)
  values (q.empresa_id, gen_random_uuid()::text, rem.id_remessa, coalesce(rem.num_remessa,''), q.id, nullif(coalesce(it.id_volume,''),''), nullif(coalesce(it.cod_volume,''),''),
    v_tipo, v_agora, 'APP_FACCAO', left(coalesce(p_obs,''), 300), null);
  perform private.toca_revisao(q.empresa_id);
  return jsonb_build_object('ok', true, 'TIPO', v_tipo, 'DATA_HORA', v_agora, '__lista', private.campo_lista_fac(q));
end $$;

create or replace function public.campo_faccao_ficha(p_token text, p_id_produto text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q private.campo_quem := private.campo_auth(p_token); lst jsonb; p public.cad_produtos; mats jsonb; ops jsonb;
begin
  perform private.campo_exige(q, 'FACCAO');
  lst := private.campo_lista_fac(q);
  if not exists (select 1 from jsonb_array_elements(lst->'remessas') r, jsonb_array_elements(r->'PRODUTOS') x where x->>'ID_PRODUTO' = coalesce(p_id_produto,'')) then
    raise exception 'Esta ficha não está disponível para você.'; end if;
  select * into p from public.cad_produtos where empresa_id = q.empresa_id and id_produto = p_id_produto;
  if not found then raise exception 'Produto não encontrado.'; end if;
  select coalesce(jsonb_agg(m.o order by m.ord, m.nome), '[]'::jsonb) into mats from (
    select case upper(coalesce(mt.tipo_material,'OUTRO')) when 'TECIDO' then 1 when 'AVIAMENTO' then 2 when 'EMBALAGEM' then 3 else 4 end ord, coalesce(mt.material,'') nome,
      jsonb_build_object('TIPO', upper(coalesce(mt.tipo_material,'OUTRO')), 'CODIGO', coalesce(mt.cod_material,''), 'MATERIAL', coalesce(mt.material,''),
        'CONSUMO', coalesce(e.consumo_por_un,0), 'UNIDADE', coalesce(nullif(e.unidade_consumo,''), mt.unidade_estoque, ''), 'PERDA', coalesce(e.perda_pct,0),
        'CONSUMO_PERDA', round(coalesce(e.consumo_por_un,0) * (1 + coalesce(e.perda_pct,0) / 100), 4),
        'APLICACAO', coalesce(nullif(concat_ws(' / ', nullif(co.cor,''), nullif(t.tamanho,'')),''), 'Todas'), 'OBS', coalesce(e.observacao,'')) o
    from public.estrutura_produto e
    left join public.cad_materiais mt on mt.empresa_id = e.empresa_id and mt.id_material = e.id_material
    left join public.cad_cores co on co.empresa_id = e.empresa_id and co.id_cor = e.id_cor
    left join public.cad_tamanhos t on t.empresa_id = e.empresa_id and t.id_tamanho = e.id_tamanho
    where e.empresa_id = q.empresa_id and e.id_produto = p_id_produto and coalesce(e.ativo, true)) m;
  select coalesce(jsonb_agg(r.o order by r.ord), '[]'::jsonb) into ops from (
    select coalesce(ro.ordem_processo,0) ord,
      jsonb_build_object('PROCESSO', coalesce(pr.processo,''), 'MAQUINA', case when coalesce(ro.id_maquina,'') <> '' then coalesce(m.maquina,'') else 'Manual / bancada' end,
        'REFERENCIA', coalesce(ro.componente_referencia,''), 'SEG', greatest(coalesce(ro.tempo_padrao_seg_un,0),0), 'SEM_PADRAO', coalesce(ro.tempo_padrao_seg_un,0) <= 0) o
    from public.roteiro_produto ro
    left join public.cad_processos pr on pr.empresa_id = ro.empresa_id and pr.id_processo = ro.id_processo
    left join public.cad_maquinas m on m.empresa_id = ro.empresa_id and m.id_maquina = ro.id_maquina
    where ro.empresa_id = q.empresa_id and ro.id_produto = p_id_produto and coalesce(ro.ativo, true)) r;
  return jsonb_build_object('ok', true, 'produto', jsonb_build_object('CODIGO', coalesce(p.codigo_produto,''), 'PRODUTO', coalesce(p.produto,''), 'UNIDADE', coalesce(nullif(p.unidade,''),'UN'),
      'DESCRICAO', coalesce(p.descricao,''), 'ATUALIZADO_EM', p.atualizado_em), 'fotos', '{}'::jsonb, 'materiais', mats, 'operacoes', ops);
end $$;

-- ---------- aviso ao vivo: quando algo muda, avisa os celulares daquela empresa ----------
create or replace function private.campo_avisa_mudanca() returns trigger language plpgsql security definer set search_path to '' as $$
declare e uuid;
begin
  begin
    for e in select distinct empresa_id from novos loop
      perform realtime.send('{}'::jsonb, 'mudou', 'campo-' || e::text, false);
    end loop;
  exception when others then null; -- aviso ao vivo nunca pode atrapalhar a gravação
  end;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['cupons_producao','remessas','remessa_itens','faccao_avisos'] loop
    execute format('drop trigger if exists campo_vivo_ins on public.%I', t);
    execute format('drop trigger if exists campo_vivo_upd on public.%I', t);
    execute format('create trigger campo_vivo_ins after insert on public.%I referencing new table as novos for each statement execute function private.campo_avisa_mudanca()', t);
    execute format('create trigger campo_vivo_upd after update on public.%I referencing new table as novos for each statement execute function private.campo_avisa_mudanca()', t);
  end loop;
end $$;

-- ---------- permissões ----------
do $$ declare f text; begin
  foreach f in array array['campo_empresa(text)','campo_login(text,text,text,text)','campo_sair(text)','campo_perfil(text)','campo_op_cupons(text)',
    'campo_op_iniciar(text,text,boolean)','campo_op_finalizar(text,text)','campo_op_apontar(text,text)','campo_op_pausar(text,text)','campo_op_retomar(text,text)',
    'campo_op_pausar_todos(text)','campo_op_retomar_todos(text)','campo_faccao_remessas(text)','campo_faccao_aviso(text,text,text,text,text)','campo_faccao_ficha(text,text)'] loop
    execute 'revoke all on function public.' || f || ' from public';
    execute 'grant execute on function public.' || f || ' to anon, authenticated';
  end loop;
end $$;
