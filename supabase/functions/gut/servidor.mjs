// GUT PPCP — o "cérebro" no servidor. Recebe { acao, args, meta, slug } da tela, roda a regra (motor.js, gerado do
// Code.gs) e grava numa transação só. Quem pede é conferido no banco a cada leitura/gravação:
//   servidor_ler / servidor_aplicar  → login (o token do usuário vai junto), empresa, situação da empresa e
//                                      permissão do usuário para a ação (módulos do app de gestão).
// Só esta função conhece a chave (guardada no banco, obtida com a chave de serviço) que libera servidor_aplicar.
// "chamar(nome, corpo)" faz a chamada ao banco (no Supabase: HTTP com o token do usuário; nos testes: Postgres local).
export async function atender(M, pedido, chamar, chave) {
  const acao = String((pedido && pedido.acao) || '');
  const args = Array.isArray(pedido && pedido.args) ? pedido.args : [];
  const meta = (pedido && typeof pedido.meta === 'object' && pedido.meta) || {};
  const slug = String((pedido && pedido.slug) || '').trim().toLowerCase();
  if (!acao || !slug) return { __error: true, retryable: false, message: 'Pedido incompleto (ação ou empresa).' };
  if (!M.tem(acao)) return { __error: true, retryable: false, message: 'Esta ação não existe no sistema: ' + acao };
  const quem = { email: '' };
  const rpc = async (fn, a) => {
    let nome = fn; const corpo = Object.assign({}, a);
    if (fn === 'web_ler') { nome = 'servidor_ler'; corpo.p_acao = acao; corpo.p_chave = chave; }
    else if (fn === 'web_aplicar') { nome = 'servidor_aplicar'; corpo.p_acao = acao; corpo.p_chave = chave; }
    else if (fn !== 'web_schema') throw new Error('Chamada não permitida: ' + fn);
    const r = await chamar(nome, corpo);
    if (nome === 'servidor_ler' && r && r.__email) quem.email = String(r.__email);
    return r;
  };
  const ctx = { rpc, slug, get email() { return quem.email; } };
  try {
    return await M.api(acao, args, meta, ctx);
  } catch (e) {
    const code = (e && e.code) || '';
    // erro do banco (sem permissão, sem login, conflito...) → nada foi gravado; sem código = falha de comunicação
    return { __error: true, retryable: !code, auth: code === '28000' || code === 'PGRST301' || code === '401' || /fa[çc]a login|JWT/i.test(String(e && e.message)), message: String((e && e.message) || e), code };
  }
}
