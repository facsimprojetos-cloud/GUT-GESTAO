// Compara duas respostas e lista as diferenças (caminho → valor A × valor B).
// Tolerâncias: números com diferença < 1e-9; datas/horas geradas "agora" com até 5 s de diferença
// (ex.: generatedAt), porque os dois caminhos rodam um logo depois do outro.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function quaseIgual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (typeof a === 'string' && typeof b === 'string' && ISO.test(a) && ISO.test(b)) {
    const pa = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(a) ? a : a + '-03:00'), pb = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(b) ? b : b + '-03:00');
    return a === b || (a.length === b.length && Math.abs(pa - pb) <= 5000 && Math.abs(pa - Date.now()) < 600000);
  }
  return a === b;
}
function comparar(a, b, cam = '', out = []) {
  if (out.length > 50) return out;
  const ta = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a, tb = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;
  if (ta !== tb) { out.push(`${cam || '(raiz)'}: ${curto(a)} × ${curto(b)}`); return out; }
  if (ta === 'array') {
    if (a.length !== b.length) out.push(`${cam}: ${a.length} itens × ${b.length} itens`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) comparar(a[i], b[i], `${cam}[${i}]`, out);
    return out;
  }
  if (ta === 'object') {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    ks.forEach(k => {
      if (!(k in a)) out.push(`${cam}.${k}: (não existe) × ${curto(b[k])}`);
      else if (!(k in b)) out.push(`${cam}.${k}: ${curto(a[k])} × (não existe)`);
      else comparar(a[k], b[k], cam + '.' + k, out);
    });
    return out;
  }
  if (!quaseIgual(a, b)) out.push(`${cam}: ${curto(a)} × ${curto(b)}`);
  return out;
}
function curto(v) { const s = JSON.stringify(v); return s === undefined ? 'undefined' : (s.length > 90 ? s.slice(0, 87) + '…' : s); }
module.exports = { comparar };
