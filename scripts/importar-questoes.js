'use strict';
// Uso: DATABASE_URL=... node scripts/importar-questoes.js extraido/            (todos os .json da pasta)
//      DATABASE_URL=... node scripts/importar-questoes.js prova1.json prova2.json [--sobrescrever]
// --sobrescrever: reimporta por cima da revisão humana (status aprovada/removida e comentários).
const fs = require('fs');
const path = require('path');
const { pool, init } = require('../db');
const { importarQuestoes } = require('../lib/importar');
const { atualizarContagens } = require('../lib/simulados');

(async () => {
  const args = process.argv.slice(2);
  const sobrescrever = args.includes('--sobrescrever');
  const arqs = args.filter(a => !a.startsWith('--')).flatMap(a =>
    fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter(f => f.endsWith('.json')).sort().map(f => path.join(a, f)) : [a]);
  if (!arqs.length) { console.error('Informe arquivos .json ou uma pasta.'); process.exit(1); }
  await init();
  const tot = { inseridas: 0, atualizadas: 0, ignoradas: 0 };
  for (const a of arqs) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(a, 'utf8')); } catch (e) { console.log(`${a}: JSON inválido (${e.message})`); continue; }
    const r = await importarQuestoes(pool, doc, { preservarRevisao: !sobrescrever });
    console.log(`${path.basename(a)}: +${r.inseridas} novas, ${r.atualizadas} atualizadas, ${r.ignoradas} ignoradas`);
    r.erros.slice(0, 10).forEach(e => console.log('  ! ' + e));
    for (const k of Object.keys(tot)) tot[k] += r[k];
  }
  await atualizarContagens(pool);
  console.log(`Total: +${tot.inseridas} novas, ${tot.atualizadas} atualizadas, ${tot.ignoradas} ignoradas.`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
