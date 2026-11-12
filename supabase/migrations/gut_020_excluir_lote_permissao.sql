-- gut_020 — Etapa C (SaaS): excluir lote em cadeia passa a conferir a permissão do usuário (módulo "corte", editar).
create or replace function public.web_corte_excluir(p_slug text, p_id_corte text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; r jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  perform private.servidor_exige(v_emp, 'registrarCorte', true);   -- mesma permissão de lançar corte
  perform private.campo_trava(v_emp);
  r := private.corte_exclusao(v_emp, p_id_corte, false);
  if md5(r::text) <> coalesce(p_token,'') then raise exception 'Os vínculos do lote mudaram desde a prévia. Abra a exclusão de novo para conferir.'; end if;
  if (r->>'modo') = 'PARCIAL' and (r->>'volumes')::int = 0 and (r->>'saldoNaoVolumado')::numeric <= 0 then
    raise exception 'Todo este lote já foi para facção. Não há nada para excluir.'; end if;
  return private.corte_exclusao(v_emp, p_id_corte, true);
end $$;
