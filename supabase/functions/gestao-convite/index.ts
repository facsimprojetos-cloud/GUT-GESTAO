// GUT PPCP — convite de usuários do escritório (app de gestão)
// Só quem pode gerir a empresa (dono ou administrador da plataforma) consegue usar.
// Não depende de e-mail: devolve o link de convite / troca de senha para enviar por WhatsApp ou copiar.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "convidar");
    const empresa = String(body.empresa_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    const redirectTo = String(body.redirect_to || "") || undefined;
    if (!empresa) return resp({ error: "Empresa não informada." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resp({ error: "E-mail inválido." }, 400);

    // 1) quem está pedindo pode gerir esta empresa?
    const quem = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: pode, error: e1 } = await quem.rpc("gestao_pode_gerir", { p_emp: empresa });
    if (e1 || !pode) return resp({ error: "Você não tem permissão para gerenciar esta empresa." }, 403);

    const adm = createClient(url, service, { auth: { persistSession: false } });
    let { data: uid } = await adm.rpc("gestao_usuario_por_email", { p_email: email });

    if (acao === "link_senha") {
      if (!uid) return resp({ error: "Usuário não encontrado." }, 404);
      const { data, error } = await adm.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
      if (error) return resp({ error: error.message }, 400);
      return resp({ ok: true, link: data.properties?.action_link, tipo: "senha" });
    }

    // 2) convidar: cria o usuário (se ainda não existe) e gera o link para ele criar a senha
    const nome = String(body.nome || "").trim();
    const papel = String(body.papel || "OPERADOR").toUpperCase();
    let link = "";
    let novo = false;
    if (!uid) {
      const { data, error } = await adm.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { nome } } });
      if (error) return resp({ error: error.message }, 400);
      uid = data.user?.id;
      link = data.properties?.action_link || "";
      novo = true;
    } else {
      const { data } = await adm.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
      link = data?.properties?.action_link || "";
    }
    const { error: e3 } = await adm.rpc("gestao_vincular", {
      p_emp: empresa, p_user: uid, p_email: email, p_nome: nome || null, p_papel: papel, p_perm: body.permissoes || {},
    });
    if (e3) return resp({ error: e3.message }, 400);
    return resp({ ok: true, novo, link, user_id: uid });
  } catch (e) {
    return resp({ error: String((e as Error)?.message || e) }, 500);
  }
});
