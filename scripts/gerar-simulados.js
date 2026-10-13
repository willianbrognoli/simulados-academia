'use strict';
// Uso: DATABASE_URL=... node scripts/gerar-simulados.js
// Cria/atualiza os simulados automáticos (prova real, estilo banca, por matéria) a partir dos itens liberados.
const { pool, init } = require('../db');
const { gerarCatalogo, STATUS_LIBERADOS } = require('../lib/simulados');

(async () => {
  await init();
  const feitos = await gerarCatalogo(pool);
  console.log(`Itens considerados: status ${STATUS_LIBERADOS.join(', ')}`);
  console.log(`${feitos.length} simulados criados/atualizados.`);
  feitos.forEach(s => console.log('  · ' + s));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
