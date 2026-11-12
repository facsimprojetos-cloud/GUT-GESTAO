// Relógio e UUIDs previsíveis para a paridade de gravações: os dois caminhos (Apps Script e navegador)
// rodam a mesma ação com a mesma hora e os mesmos ids, e as tabelas finais ficam idênticas.
function criarRelogio(T0) {
  let base = T0, idx = 0, n = 0;
  return {
    acao(i) { idx = i; n = 0; base = T0 + i * 60000; },   // cada ação do cenário: 1 minuto depois da anterior
    reinicia() { n = 0; },                                 // o navegador pode rodar a mesma ação de novo (tabela que faltava)
    agora: () => base,
    uuid: () => { n++; return '00000000-0000-4000-8000-' + (idx * 10000 + n).toString(16).padStart(12, '0'); },
    requestId: () => 'req' + String(idx).padStart(10, '0')
  };
}
function dataFalsa(Real, rel) {
  class D extends Real { constructor(...a) { if (a.length) super(...a); else super(rel.agora()); } static now() { return rel.agora(); } }
  return D;
}
module.exports = { criarRelogio, dataFalsa };
