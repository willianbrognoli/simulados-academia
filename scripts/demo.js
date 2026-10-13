'use strict';
// Carrega a prova de demonstração (dados/exemplo) e monta o catálogo com limites baixos.
// Uso: DATABASE_URL=... node scripts/demo.js     (serve para testar a plataforma antes de ter questões reais)
const fs = require('fs');
const path = require('path');
const { pool, init } = require('../db');
const { importarQuestoes } = require('../lib/importar');
const { gerarCatalogo, normalizarRegras, contarPool } = require('../lib/simulados');

(async () => {
  await init();
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '../dados/exemplo/demo-academia-2026.json'), 'utf8'));
  const r = await importarQuestoes(pool, doc, { preservarRevisao: false });
  console.log(`Demonstração: +${r.inseridas} novas, ${r.atualizadas} atualizadas, ${r.ignoradas} ignoradas`);
  r.erros.forEach(e => console.log('  ! ' + e));
  const feitos = await gerarCatalogo(pool, { minProva: 5, minBanca: 5, minMateria: 2 });
  // exemplo de simulado "edital" montado à mão, com questões municipais de Cascavel
  const regras = normalizarRegras({ duracao_min: 20, intervalo_h: 0, ordem: 'materia', filtros: { municipio: 'Cascavel' } });
  await pool.query(
    `INSERT INTO simulados (slug, titulo, subtitulo, tipo, regras, meta, destaque, ordem)
     VALUES ('edital-demo-cascavel', 'GCM Cascavel (demonstração)', 'Simulado montado pelo edital · inclui realidade local', 'edital', $1, '{"municipio":"Cascavel","uf":"PR"}', true, 1)
     ON CONFLICT (slug) DO UPDATE SET regras = EXCLUDED.regras`, [regras]);
  await pool.query(`UPDATE simulados SET total_itens = $1 WHERE slug = 'edital-demo-cascavel'`, [await contarPool(pool, regras)]);
  console.log(`${feitos.length + 1} simulados prontos.`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
