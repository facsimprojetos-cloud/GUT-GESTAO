-- Sistema principal aberto pelo Netlify: o Apps Script confere se o usuário do Supabase tem acesso à empresa do servidor.
create or replace function public.gut_usuario_web(p_token text, p_user uuid) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_emp uuid; u record; v_admin boolean; v_email text;
begin
  v_emp := private.empresa_do_token(p_token);
  select email into v_email from auth.users where id = p_user;
  if v_email is null then return jsonb_build_object('ok', false, 'motivo', 'Usuário não encontrado.'); end if;
  v_admin := exists (select 1 from public.plataforma_admins a where a.user_id = p_user);
  select ue.papel, ue.permissoes, ue.ativo, ue.nome into u from public.usuarios_empresa ue where ue.user_id = p_user and ue.empresa_id = v_emp;
  if not exists (select 1 from public.empresas e where e.id = v_emp and e.status in ('ATIVA','TESTE')) then
    return jsonb_build_object('ok', false, 'motivo', 'Empresa suspensa. Fale com o administrador.'); end if;
  if not v_admin and (u.papel is null or not u.ativo) then
    return jsonb_build_object('ok', false, 'motivo', 'Seu usuário não tem acesso a esta empresa.'); end if;
  return jsonb_build_object('ok', true, 'email', v_email, 'nome', coalesce(u.nome, ''), 'papel', coalesce(u.papel, 'ADMIN'),
    'permissoes', coalesce(u.permissoes, '{}'::jsonb), 'admin', v_admin);
end $$;
revoke all on function public.gut_usuario_web(text, uuid) from public;
grant execute on function public.gut_usuario_web(text, uuid) to anon, authenticated;
