/**
 * GUT API — porta do sistema principal para a tela publicada no Netlify (/sistema).
 *
 * Projeto Apps Script separado, publicado como App da Web:
 *   Executar como: Eu  •  Quem pode acessar: Qualquer pessoa
 * Biblioteca: o projeto principal "GUT PPCP Supabase", identificador GUT, versão HEAD.
 *
 * Ele não guarda nada e não mostra tela nenhuma: só repassa a chamada para GUT.apiWeb,
 * que confere o login do Supabase e se a pessoa tem acesso à empresa antes de executar.
 */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {}
  var out;
  try {
    out = GUT.apiWeb(String(body.action || ''), body.args || [], body.meta || {}, String(body.token || ''));
  } catch (err) {
    out = { __error: true, message: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'GUT API' })).setMimeType(ContentService.MimeType.JSON);
}

/** Rode uma vez no editor para autorizar e conferir a ligação com o sistema. */
function testarConexao() {
  console.log('Armazenamento do sistema: ' + GUT.statusArmazenamento());
}
