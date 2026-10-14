const katex = require('katex');
const R = require('./todos.json'), I = require('./itens.json');
const erros = {};
const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
for (const [id, r] of Object.entries(R)) {
  if (r.acao !== 'corrigir') continue;
  const e = [];
  const alts = r.alternativas || {};
  const orig = I[id].alternativas || {};
  if (I[id].formato !== 'CE' && Object.keys(alts).sort().join() !== Object.keys(orig).sort().join()) e.push('letras diferentes: ' + Object.keys(alts).join());
  if (!r.enunciado || r.enunciado.length < 15) e.push('enunciado vazio');
  for (const t of [r.enunciado || '', ...Object.values(alts)]) {
    if (/\$[^\s\d]/.test(t) && !/R\$/.test(t)) e.push('usa $');
    const abre = (t.match(/\\\(|\\\[/g) || []).length, fecha = (t.match(/\\\)|\\\]/g) || []).length;
    if (abre !== fecha) e.push('delimitador desbalanceado');
    for (const m of t.matchAll(re)) {
      try { katex.renderToString(m[1] ?? m[2], { throwOnError: true }); } catch (x) { e.push('katex: ' + x.message.slice(0, 80)); }
    }
    if (/(?<![\\\w])[a-z]\d\s*[-–+=]/.test(t.replace(re, ''))) e.push('ainda achatado? ' + t.replace(re, '').match(/(?<![\\\w])[a-z]\d\s*[-–+=].{0,15}/)[0]);
  }
  if (e.length) erros[id] = e;
}
console.log(Object.keys(erros).length, 'com problema');
for (const [k, v] of Object.entries(erros).slice(0, 25)) console.log(k, v.join(' | '));
require('fs').writeFileSync('erros.json', JSON.stringify(erros, null, 1));
