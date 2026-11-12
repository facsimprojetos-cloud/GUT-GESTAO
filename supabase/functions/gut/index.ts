// GUT PPCP — Edge Function "gut": o cérebro do sistema no servidor (ver servidor.mjs).
import { atender } from "./servidor.mjs";
import { MOTOR_URL, MOTOR_SHA256 } from "./versao.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_BANCO = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// a chave que libera servidor_ler/servidor_aplicar fica no banco; só quem tem a chave de serviço do Supabase a obtém
let CHAVE = "";
async function chave(): Promise<string> {
  if (CHAVE) return CHAVE;
  const r = await fetch(`${URL_BANCO}/rest/v1/rpc/servidor_obter_chave`, { method: "POST", headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("Servidor sem a chave de gravação (" + r.status + ").");
  CHAVE = String(await r.json());
  return CHAVE;
}
// O motor (regras do sistema, gerado do Code.gs) é baixado do site uma vez por instância e conferido pelo hash:
// só roda exatamente o arquivo que foi testado e publicado junto com esta versão da função.
// deno-lint-ignore no-explicit-any
let M: any = null;
async function motor() {
  if (M) return M;
  const r = await fetch(MOTOR_URL, { cache: "no-store" });
  if (!r.ok) throw new Error("Não foi possível baixar o motor (" + r.status + ").");
  const txt = await r.text();
  const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (h !== MOTOR_SHA256) throw new Error("Motor diferente do esperado (hash).");
  new Function(txt)();
  // deno-lint-ignore no-explicit-any
  M = (globalThis as any).GUT_MOTOR;
  if (!M) throw new Error("Motor não carregou.");
  return M;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ __error: true, auth: true, retryable: false, message: "Faça login para usar o sistema." }, 401);
  let k = "", m = null;
  try { k = await chave(); m = await motor(); } catch (e) { return json({ __error: true, retryable: true, message: String((e as Error).message) }, 500); }
  const pedido = await req.json().catch(() => null);
  const chamar = async (nome: string, corpo: unknown) => {
    const r = await fetch(`${URL_BANCO}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const t = await r.text();
    let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = null; }
    if (!r.ok) { const e: any = new Error((j && (j.message || j.msg)) || `Banco respondeu ${r.status}`); e.code = (j && j.code) || String(r.status); throw e; }
    return j;
  };
  const t0 = Date.now();
  const out = await atender(m, pedido, chamar, k);
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json", "Server-Timing": `gut;dur=${Date.now() - t0}` } });
});
