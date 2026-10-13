'use strict';
// Regras de simulado: montagem da prova (sorteio de itens), correção e geração automática do catálogo.
const crypto = require('crypto');
const { slug } = require('./taxonomia');

// Quais status de item entram em simulado. Em produção só 'aprovada' (passou pela revisão humana).
// ITENS_STATUS=aprovada,extraida libera itens ainda não revisados (útil em homologação).
const STATUS_LIBERADOS = (process.env.ITENS_STATUS || 'aprovada').split(',').map(s => s.trim()).filter(Boolean);

const REGRAS_PADRAO = {
  duracao_min: null,     // null = 3 min por item (mínimo 30 min)
  n_itens: null,         // null = todos os itens que passam no filtro
  max_saidas: 3,         // na 3ª saída da tela a prova é entregue
  intervalo_h: 24,       // 1 tentativa a cada 24 h por simulado (0 = livre)
  erro_anula: false,     // true = padrão Cebraspe: cada erro em item certo/errado desconta um acerto
  ordem: 'materia',      // original | materia | aleatoria
  filtros: {},           // prova_ids, bancas, materias, temas, ufs, municipio, formatos
};

function normalizarRegras(r = {}) {
  const x = { ...REGRAS_PADRAO, ...r, filtros: { ...(r.filtros || {}) } };
  x.max_saidas = Math.max(1, Number(x.max_saidas) || 3);
  x.intervalo_h = Math.max(0, Number(x.intervalo_h ?? 24));
  x.erro_anula = !!x.erro_anula;
  if (!['original', 'materia', 'aleatoria'].includes(x.ordem)) x.ordem = 'materia';
  x.n_itens = x.n_itens ? Math.max(1, Number(x.n_itens)) : null;
  x.duracao_min = x.duracao_min ? Math.max(5, Number(x.duracao_min)) : null;
  return x;
}

const duracaoSeg = (regras, nItens) => (regras.duracao_min ? regras.duracao_min : Math.max(30, nItens * 3)) * 60;

// WHERE dos itens elegíveis para um simulado
function filtroSQL(regras) {
  const f = regras.filtros || {};
  const w = ['i.status = ANY($1)', 'i.gabarito IS NOT NULL'];
  const p = [STATUS_LIBERADOS];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (f.prova_ids && f.prova_ids.length) add('i.prova_id = ANY(?)', f.prova_ids.map(Number));
  if (f.concursos && f.concursos.length) add('c.slug = ANY(?)', f.concursos);
  if (f.bancas && f.bancas.length) add('b.slug = ANY(?)', f.bancas);
  if (f.materias && f.materias.length) add('m.nome = ANY(?)', f.materias);
  if (f.temas && f.temas.length) add('t.nome = ANY(?)', f.temas);
  if (f.ufs && f.ufs.length) add('c.uf = ANY(?)', f.ufs);
  if (f.formatos && f.formatos.length) add('i.formato = ANY(?)', f.formatos);
  if (f.ano_min) add('c.ano >= ?', Number(f.ano_min));
  // Escopo: prova real traz a prova inteira; nos demais, questão municipal só entra no simulado da própria cidade.
  if (!f.prova_ids || !f.prova_ids.length) {
    if (f.municipio) add(`(i.escopo = 'nacional' OR lower(i.escopo_local) = lower(?))`, f.municipio);
    else w.push(`i.escopo = 'nacional'`);
  }
  return { where: w.join(' AND '), params: p };
}

const FROM_ITENS = `FROM itens i
  JOIN provas p ON p.id = i.prova_id
  JOIN concursos c ON c.id = p.concurso_id
  LEFT JOIN bancas b ON b.id = c.banca_id
  LEFT JOIN materias m ON m.id = i.materia_id
  LEFT JOIN temas t ON t.id = i.tema_id`;

async function contarPool(db, regras) {
  const { where, params } = filtroSQL(regras);
  const { rows } = await db.query(`SELECT count(*)::int AS n ${FROM_ITENS} WHERE ${where}`, params);
  return regras.n_itens ? Math.min(regras.n_itens, rows[0].n) : rows[0].n;
}

function embaralhar(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Sorteia e ordena os itens de uma nova tentativa. Devolve ids.
async function montarProva(db, regras) {
  const { where, params } = filtroSQL(regras);
  const { rows } = await db.query(
    `SELECT i.id, i.prova_id, i.numero_original, i.texto_base_id, COALESCE(m.ordem, 999) AS mordem
     ${FROM_ITENS} WHERE ${where}`, params);
  let lista = rows;
  if (regras.n_itens && lista.length > regras.n_itens) lista = embaralhar(lista).slice(0, regras.n_itens);
  if (regras.ordem === 'original') {
    lista.sort((a, b) => a.prova_id - b.prova_id || (a.numero_original || 0) - (b.numero_original || 0));
  } else if (regras.ordem === 'materia') {
    // matérias na ordem da taxonomia; dentro de cada uma, sorteio mantendo juntos os itens do mesmo texto-base
    const grupos = new Map();
    for (const it of embaralhar(lista)) {
      const k = it.mordem;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(it);
    }
    lista = [...grupos.keys()].sort((a, b) => a - b).flatMap(k =>
      grupos.get(k).sort((a, b) => (a.texto_base_id || 0) - (b.texto_base_id || 0) || 0));
  } else {
    lista = embaralhar(lista);
  }
  return lista.map(r => r.id);
}

// Corrige uma tentativa. itens = Map(id -> {gabarito, formato, tema, materia}).
function corrigir(ordem, respostas, itens, regras) {
  let certos = 0, errados = 0, brancos = 0, errosCE = 0;
  const porTema = {}, porMateria = {};
  const soma = (obj, k, materia, campo) => {
    const x = obj[k] || (obj[k] = { materia, total: 0, certos: 0, errados: 0, brancos: 0 });
    x.total++; x[campo]++;
  };
  for (const id of ordem) {
    const q = itens.get(id);
    if (!q) continue;
    const r = respostas[id];
    const campo = !r ? 'brancos' : r === q.gabarito ? 'certos' : 'errados';
    if (campo === 'certos') certos++; else if (campo === 'errados') { errados++; if (q.formato === 'CE') errosCE++; } else brancos++;
    const materia = q.materia || 'Sem matéria';
    soma(porTema, q.tema || materia, materia, campo);
    soma(porMateria, materia, materia, campo);
  }
  // erro_anula (padrão Cebraspe) vale só para itens de certo/errado; em múltipla escolha errar não desconta
  const nota = regras.erro_anula ? certos - errosCE : certos;
  return { certos, errados, brancos, nota, porTema, porMateria };
}

// ---------- catálogo automático ----------
// Cria/atualiza: 1 simulado "prova real" por caderno, 1 "estilo banca" por banca e 1 "por matéria" por matéria.
// Simulados criados à mão (tipo edital/livre) nunca são alterados aqui.
async function gerarCatalogo(db, { minProva = 10, minBanca = 30, minMateria = 20 } = {}) {
  const st = STATUS_LIBERADOS;
  const feitos = [];
  const upsert = async (s) => {
    await db.query(
      `INSERT INTO simulados (slug, titulo, subtitulo, tipo, regras, meta, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (slug) DO UPDATE SET titulo = EXCLUDED.titulo, subtitulo = EXCLUDED.subtitulo,
         regras = EXCLUDED.regras, meta = EXCLUDED.meta
       WHERE simulados.tipo IN ('prova_real', 'banca', 'materia')`,
      [s.slug, s.titulo, s.subtitulo, s.tipo, normalizarRegras(s.regras), s.meta || {}, s.ordem || 100]);
    feitos.push(s.slug);
  };

  const provas = await db.query(
    `SELECT p.id, p.caderno, p.duracao_min, c.slug, c.municipio, c.uf, c.ano, c.cargo, b.nome AS banca, b.slug AS banca_slug,
            count(i.id)::int AS n, bool_or(i.formato = 'CE') AS ce
     FROM provas p JOIN concursos c ON c.id = p.concurso_id LEFT JOIN bancas b ON b.id = c.banca_id
     JOIN itens i ON i.prova_id = p.id AND i.status = ANY($1) AND i.gabarito IS NOT NULL
     GROUP BY p.id, c.id, b.id HAVING count(i.id) >= $2`, [st, minProva]);
  for (const p of provas.rows) {
    await upsert({
      slug: `prova-${p.slug}${p.caderno ? '-' + slug(p.caderno) : ''}`,
      titulo: `GCM ${p.municipio || ''}${p.uf ? '/' + p.uf : ''} ${p.ano || ''}`.replace(/\s+/g, ' ').trim(),
      subtitulo: [p.banca, p.cargo, p.caderno].filter(Boolean).join(' · '),
      tipo: 'prova_real',
      regras: { duracao_min: p.duracao_min || null, ordem: 'original', erro_anula: !!p.ce, filtros: { prova_ids: [p.id] } },
      meta: { banca: p.banca, banca_slug: p.banca_slug, uf: p.uf, ano: p.ano, municipio: p.municipio },
      ordem: 300,
    });
  }

  const bancas = await db.query(
    `SELECT b.slug, b.nome, count(i.id)::int AS n FROM itens i JOIN provas p ON p.id = i.prova_id
     JOIN concursos c ON c.id = p.concurso_id JOIN bancas b ON b.id = c.banca_id
     WHERE i.status = ANY($1) AND i.gabarito IS NOT NULL AND i.escopo = 'nacional'
     GROUP BY b.id HAVING count(i.id) >= $2`, [st, minBanca]);
  for (const b of bancas.rows) {
    await upsert({
      slug: `banca-${b.slug}`, titulo: `Estilo ${b.nome}`,
      subtitulo: `${Math.min(b.n, 50)} questões sorteadas de provas de guarda da ${b.nome}`,
      tipo: 'banca',
      regras: { n_itens: 50, ordem: 'materia', filtros: { bancas: [b.slug] } },
      meta: { banca: b.nome, banca_slug: b.slug }, ordem: 200,
    });
  }

  const mats = await db.query(
    `SELECT m.nome, m.eixo, m.ordem, count(i.id)::int AS n FROM itens i JOIN materias m ON m.id = i.materia_id
     WHERE i.status = ANY($1) AND i.gabarito IS NOT NULL AND i.escopo = 'nacional'
     GROUP BY m.id HAVING count(i.id) >= $2`, [st, minMateria]);
  for (const m of mats.rows) {
    await upsert({
      slug: `materia-${slug(m.nome)}`, titulo: m.nome, subtitulo: `${m.eixo} · treino focado`,
      tipo: 'materia',
      regras: { n_itens: 20, ordem: 'aleatoria', intervalo_h: 0, filtros: { materias: [m.nome] } },
      meta: { eixo: m.eixo }, ordem: 100 + m.ordem,
    });
  }
  await atualizarContagens(db);
  return feitos;
}

async function atualizarContagens(db) {
  const { rows } = await db.query('SELECT id, regras FROM simulados');
  for (const s of rows) {
    const n = await contarPool(db, normalizarRegras(s.regras));
    await db.query('UPDATE simulados SET total_itens = $2 WHERE id = $1 AND total_itens IS DISTINCT FROM $2', [s.id, n]);
  }
  return rows.length;
}

module.exports = { STATUS_LIBERADOS, REGRAS_PADRAO, normalizarRegras, duracaoSeg, contarPool, montarProva, corrigir, gerarCatalogo, atualizarContagens, embaralhar };
