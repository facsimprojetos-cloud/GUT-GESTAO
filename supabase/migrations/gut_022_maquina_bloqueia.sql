-- gut_022 — Mesmo acesso em outra máquina: BLOQUEIA (decisão do usuário, 12/11/2026).
-- Quem entra por último fica travado enquanto o acesso estiver aberto no outro computador.
-- A vaga libera quando: a pessoa clica em Sair; o outro computador fica 5 minutos sem o sistema aberto
-- (a tela avisa "estou aqui" a cada minuto); ou o administrador desconecta no app de gestão.
-- Padrão: 1 máquina por acesso, inclusive para o dono (o administrador da plataforma não tem limite).

alter table public.empresas alter column maquinas_dono set default 1;
update public.empresas set maquinas_dono = 1 where maquinas_dono = 3;

create or replace function private.maquina_inativa() returns interval language sql immutable as $$ select interval '5 minutes' $$;

-- máquinas que pararam de avisar são encerradas
create or replace function private.maquinas_expira(p_emp uuid, p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update private.sessoes_maquina set ativo = false, encerrado_em = now(), encerrado_motivo = 'sem uso'
   where empresa_id = p_emp and user_id = p_user and ativo and ultimo_uso < now() - private.maquina_inativa();
$$;

create or replace function private.maquina_confere(p_emp uuid, p_dispositivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uso timestamptz;
begin
  if private.sou_admin() then return; end if;
  select id, ultimo_uso into v_id, v_uso from private.sessoes_maquina
   where empresa_id = p_emp and user_id = auth.uid() and dispositivo = coalesce(p_dispositivo, '') and ativo;
  if v_id is null then
    raise exception 'Este acesso não está liberado nesta máquina (está aberto em outro computador ou ficou muito tempo sem uso).' using errcode = 'GT001';
  end if;
  if v_uso < now() - interval '30 seconds' then update private.sessoes_maquina set ultimo_uso = now() where id = v_id; end if;
end $$;

-- entrar (ou avisar "estou aqui"): { ok } ou { ok:false, bloqueado:true, limite, libera_em_min, em_uso:[...] }
-- p_assumir não derruba mais ninguém (ficou só para compatibilidade).
create or replace function public.web_maquina_entrar(p_slug text, p_dispositivo text, p_nome text, p_assumir boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_lim int; v_outras int; v_disp text := btrim(coalesce(p_dispositivo, '')); v_ult timestamptz;
begin
  v_emp := private.web_empresa(p_slug);
  if length(v_disp) < 16 then raise exception 'Identificação da máquina inválida.'; end if;
  if private.sou_admin() then return jsonb_build_object('ok', true, 'admin', true); end if;
  perform pg_advisory_xact_lock(hashtextextended('gut-maquina:' || v_emp::text || ':' || auth.uid()::text, 0));
  perform private.maquinas_expira(v_emp, auth.uid());
  if exists (select 1 from private.sessoes_maquina where empresa_id = v_emp and user_id = auth.uid() and dispositivo = v_disp and ativo) then
    update private.sessoes_maquina set ultimo_uso = now(), nome = coalesce(nullif(btrim(p_nome), ''), nome)
     where empresa_id = v_emp and user_id = auth.uid() and dispositivo = v_disp and ativo;
    return jsonb_build_object('ok', true);
  end if;
  v_lim := private.maquinas_limite(v_emp, auth.uid());
  select count(*), max(ultimo_uso) into v_outras, v_ult from private.sessoes_maquina where empresa_id = v_emp and user_id = auth.uid() and ativo;
  if v_outras >= v_lim then
    perform private.web_audita(v_emp, 'MAQUINA_BLOQUEADA', 'sessoes_maquina', auth.uid()::text, null, jsonb_build_object('maquina', p_nome));
    return jsonb_build_object('ok', false, 'bloqueado', true, 'limite', v_lim,
      'libera_em_min', greatest(1, ceil(extract(epoch from (v_ult + private.maquina_inativa() - now())) / 60))::int,
      'em_uso', coalesce((select jsonb_agg(jsonb_build_object('nome', s.nome, 'ultimo_uso', s.ultimo_uso, 'desde', s.criado_em) order by s.ultimo_uso desc)
        from private.sessoes_maquina s where s.empresa_id = v_emp and s.user_id = auth.uid() and s.ativo), '[]'::jsonb));
  end if;
  insert into private.sessoes_maquina (empresa_id, user_id, dispositivo, nome) values (v_emp, auth.uid(), v_disp, coalesce(nullif(btrim(p_nome), ''), 'Máquina'));
  return jsonb_build_object('ok', true);
end $$;

-- a lista do app de gestão e a contagem só mostram máquinas realmente em uso
create or replace function public.gestao_maquinas(p_emp uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.exige_gerir(p_emp);
  update private.sessoes_maquina set ativo = false, encerrado_em = now(), encerrado_motivo = 'sem uso'
   where empresa_id = p_emp and ativo and ultimo_uso < now() - private.maquina_inativa();
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'nome', s.nome, 'desde', s.criado_em, 'ultimo_uso', s.ultimo_uso) order by s.ultimo_uso desc)
    from private.sessoes_maquina s where s.empresa_id = p_emp and s.ativo), '[]'::jsonb);
end $$;

revoke all on function private.maquina_inativa(), private.maquinas_expira(uuid, uuid) from public, anon, authenticated;
