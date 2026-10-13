'use strict';
// Uso: DATABASE_URL=... node scripts/importar-inventario.js caminho/inventario.csv [outro.csv ...]
const fs = require('fs');
const { pool, init } = require('../db');
const { importarInventario } = require('../lib/importar');

(async () => {
  const arqs = process.argv.slice(2);
  if (!arqs.length) { console.error('Informe o(s) inventario.csv.'); process.exit(1); }
  await init();
  for (const a of arqs) {
    const r = await importarInventario(pool, fs.readFileSync(a, 'utf8'));
    console.log(`${a}: ${r.importados}/${r.linhas} concursos importados`);
    r.erros.slice(0, 20).forEach(e => console.log('  ! ' + e));
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
