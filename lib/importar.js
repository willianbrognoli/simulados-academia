'use strict';
// Importação do acervo: inventário de concursos (CSV) e questões extraídas (JSON no formato docs/questao.schema.json).
// Usado pelos scripts de linha de comando (scripts/) e pelas rotas /api/admin/importar/*.
const { slug } = require('./taxonomia');

// ---------------- utilitários ----------------
function lerCSV(texto, sep) {
  texto = String(texto).replace(/^﻿/, '');
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return [];
  sep = sep || (linhas[0].split(';').length >= linhas[0].split(',').length ? ';' : ',');
  const parse = l => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const cab = parse(linhas[0]).map(c => c.toLowerCase());
  return linhas.slice(1).map(l => { const v = parse(l); return Object.fromEntries(cab.map((c, i) => [c, v[i] ?? ''])); });
}

async function garantirBanca(db, nome, slugBanca) {
  nome = String(nome || '').trim();
  if (!nome && !slugBanca) return null;
  const s = slug(slugBanca || nome);
  const { rows } = await db.query(
    `INSERT INTO bancas (slug, nome) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET nome = bancas.nome RETURNING id`,
    [s, nome || slugBanca]);
  return rows[0].id;
}

async function garantirMateria(db, nome) {
  nome = String(nome || '').trim();
  if (!nome) return null;
  const { rows } = await db.query(
    `INSERT INTO materias (slug, nome) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
    [slug(nome), nome]);
  return rows[0].id;
}

async function garantirTema(db, materiaId, nome) {
  nome = String(nome || '').trim();
  if (!materiaId || !nome) return null;
  const { rows } = await db.query(
    `INSERT INTO temas (materia_id, nome) VALUES ($1, $2) ON CONFLICT (materia_id, nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
    [materiaId, nome]);
  return rows[0].id;
}

// ---------------- inventário ----------------
// Aceita o inventario.csv da pasta provas-gcm (nacional ou vunesp). Colunas reconhecidas:
// id, ano, municipio, uf, cargo, banca, banca_slug, orgao, escolaridade, link, status, obs
async function importarInventario(db, textoCSV) {
  const linhas = lerCSV(textoCSV);
  let n = 0;
  const erros = [];
  for (const l of linhas) {
    if (!l.id) { erros.push('linha sem id'); continue; }
    try {
      const bancaId = await garantirBanca(db, l.banca, l.banca_slug);
      await db.query(
        `INSERT INTO concursos (slug, municipio, uf, orgao, cargo, ano, escolaridade, banca_id, link_origem, status_coleta, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (slug) DO UPDATE SET municipio = EXCLUDED.municipio, uf = EXCLUDED.uf, orgao = COALESCE(EXCLUDED.orgao, concursos.orgao),
           cargo = EXCLUDED.cargo, ano = EXCLUDED.ano, escolaridade = COALESCE(EXCLUDED.escolaridade, concursos.escolaridade),
           banca_id = COALESCE(EXCLUDED.banca_id, concursos.banca_id), link_origem = EXCLUDED.link_origem,
           status_coleta = EXCLUDED.status_coleta, obs = EXCLUDED.obs`,
        [l.id, l.municipio || null, (l.uf || '').toUpperCase().slice(0, 2) || null, l.orgao || null, l.cargo || null,
          Number(l.ano) || null, l.escolaridade || null, bancaId, l.link || l.url || null, l.status || null, l.obs || null]);
      n++;
    } catch (e) { erros.push(`${l.id}: ${e.message}`); }
  }
  return { linhas: linhas.length, importados: n, erros };
}

// ---------------- questões ----------------
const LETRAS = { ME4: ['A', 'B', 'C', 'D'], ME5: ['A', 'B', 'C', 'D', 'E'], CE: ['C', 'E'] };

function validarQuestao(q) {
  const e = [];
  if (!q || typeof q !== 'object') return ['questão não é um objeto'];
  if (!q.id) e.push('sem id');
  if (!LETRAS[q.formato]) e.push(`formato inválido (${q.formato}); use ME4, ME5 ou CE`);
  if (!q.enunciado || !String(q.enunciado).trim()) e.push('enunciado vazio');
  if (!q.materia) e.push('sem matéria');
  if (!q.origem || !q.origem.ano) e.push('origem incompleta (precisa ao menos de origem.ano)');
  let alt = q.alternativas;
  if (q.formato === 'CE' && (!alt || !Object.keys(alt).length)) alt = { C: 'Certo', E: 'Errado' };
  if (LETRAS[q.formato]) {
    const esperadas = LETRAS[q.formato];
    const chaves = Object.keys(alt || {}).map(k => k.toUpperCase()).sort();
    if (chaves.join() !== esperadas.slice().sort().join()) e.push(`alternativas ${chaves.join('') || '(nenhuma)'} não batem com ${q.formato} (${esperadas.join('')})`);
    if (q.gabarito != null && !esperadas.includes(String(q.gabarito).toUpperCase())) e.push(`gabarito "${q.gabarito}" fora das alternativas`);
  }
  if (q.escopo && !['nacional', 'estadual', 'municipal'].includes(q.escopo)) e.push('escopo inválido');
  if (q.status && !['extraida', 'revisar', 'aprovada', 'removida'].includes(q.status)) e.push('status inválido');
  return e;
}

// Recebe o conteúdo de um arquivo de prova extraída:
//   - um array de questões, ou
//   - { "prova": { duracao_min, data_prova, caderno }, "textos_base": { "tb1": "texto..." }, "questoes": [...] }
// opcoes.preservarRevisao (padrão true): reimportar não desfaz a revisão humana (status aprovada/removida e comentário).
async function importarQuestoes(pool, conteudo, opcoes = {}) {
  // transação por questão: precisa de um único cliente (não do pool)
  const db = pool.connect ? await pool.connect() : pool;
  try { return await _importar(db, conteudo, opcoes); } finally { if (db !== pool) db.release(); }
}

async function _importar(db, conteudo, opcoes) {
  const preservar = opcoes.preservarRevisao !== false;
  const doc = Array.isArray(conteudo) ? { questoes: conteudo } : (conteudo || {});
  const lista = doc.questoes || [];
  const tbs = doc.textos_base || {};
  const meta = doc.prova || {};
  const res = { recebidas: lista.length, inseridas: 0, atualizadas: 0, ignoradas: 0, erros: [] };
  const cacheProva = new Map();

  for (const q of lista) {
    const errs = validarQuestao(q);
    if (errs.length) { res.ignoradas++; res.erros.push(`${q && q.id || '?'}: ${errs.join('; ')}`); continue; }
    const o = q.origem;
    const concursoSlug = q.concurso || meta.concurso || String(q.id).replace(/-q\d+[a-z]?$/i, '');
    const caderno = String(o.caderno || meta.caderno || '');
    const chave = concursoSlug + '|' + caderno;
    try {
      await db.query('BEGIN');
      let provaId = cacheProva.get(chave);
      if (!provaId) {
        const bancaId = await garantirBanca(db, o.banca);
        const c = await db.query(
          `INSERT INTO concursos (slug, municipio, uf, orgao, cargo, ano, banca_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (slug) DO UPDATE SET orgao = COALESCE(concursos.orgao, EXCLUDED.orgao),
             banca_id = COALESCE(concursos.banca_id, EXCLUDED.banca_id)
           RETURNING id`,
          [concursoSlug, o.municipio || null, (o.uf || '').toUpperCase().slice(0, 2) || null, o.orgao || null, o.cargo || null, Number(o.ano) || null, bancaId]);
        const p = await db.query(
          `INSERT INTO provas (concurso_id, caderno, formato, data_prova, duracao_min, arquivo)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (concurso_id, caderno) DO UPDATE SET
             formato = COALESCE(EXCLUDED.formato, provas.formato), data_prova = COALESCE(EXCLUDED.data_prova, provas.data_prova),
             duracao_min = COALESCE(EXCLUDED.duracao_min, provas.duracao_min), arquivo = COALESCE(EXCLUDED.arquivo, provas.arquivo)
           RETURNING id`,
          [c.rows[0].id, caderno, q.formato, o.data_prova || meta.data_prova || null, Number(meta.duracao_min) || null, o.arquivo || meta.arquivo || null]);
        provaId = p.rows[0].id;
        cacheProva.set(chave, provaId);
      }
      let tbId = null;
      if (q.texto_base_id) {
        const conteudoTB = q.texto_base || tbs[q.texto_base_id];
        if (conteudoTB) {
          const t = await db.query(
            `INSERT INTO textos_base (prova_id, chave, conteudo) VALUES ($1,$2,$3)
             ON CONFLICT (prova_id, chave) DO UPDATE SET conteudo = EXCLUDED.conteudo RETURNING id`,
            [provaId, q.texto_base_id, conteudoTB]);
          tbId = t.rows[0].id;
        } else {
          const t = await db.query('SELECT id FROM textos_base WHERE prova_id = $1 AND chave = $2', [provaId, q.texto_base_id]);
          tbId = t.rows[0] ? t.rows[0].id : null;
        }
      }
      const materiaId = await garantirMateria(db, q.materia);
      const temaId = await garantirTema(db, materiaId, q.tema);
      let alt = q.alternativas;
      if (q.formato === 'CE' && (!alt || !Object.keys(alt).length)) alt = { C: 'Certo', E: 'Errado' };
      alt = Object.fromEntries(Object.entries(alt).map(([k, v]) => [k.toUpperCase(), String(v)]));
      const gab = q.gabarito == null ? null : String(q.gabarito).toUpperCase();
      const anulada = gab === null || q.motivo_remocao === 'anulada';
      const status = anulada ? 'removida' : (q.status || 'extraida');
      const motivo = anulada ? 'anulada' : (q.motivo_remocao || null);

      const ant = await db.query('SELECT id, status, comentario FROM itens WHERE codigo = $1', [q.id]);
      let stFinal = status, comFinal = q.comentario || null;
      if (ant.rows[0] && preservar) {
        // a revisão humana vence o arquivo; só uma anulação vinda do arquivo derruba uma questão aprovada
        if (['aprovada', 'removida'].includes(ant.rows[0].status) && status !== 'removida') stFinal = ant.rows[0].status;
        if (!comFinal) comFinal = ant.rows[0].comentario;
      }
      const vals = [q.id, provaId, Number(o.numero_original) || null, q.formato, tbId, String(q.enunciado).trim(), alt,
        JSON.stringify(q.midia || []), gab, q.gabarito_fonte || null, materiaId, temaId, q.subtema || null,
        q.leis_citadas || [], q.escopo || 'nacional', q.escopo_local || null, stFinal,
        stFinal === 'removida' ? motivo : null, q.alertas || [], comFinal];
      await db.query(
        `INSERT INTO itens (codigo, prova_id, numero_original, formato, texto_base_id, enunciado, alternativas, midia, gabarito,
           gabarito_fonte, materia_id, tema_id, subtema, leis_citadas, escopo, escopo_local, status, motivo_remocao, alertas, comentario)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (codigo) DO UPDATE SET prova_id = EXCLUDED.prova_id, numero_original = EXCLUDED.numero_original,
           formato = EXCLUDED.formato, texto_base_id = EXCLUDED.texto_base_id, enunciado = EXCLUDED.enunciado,
           alternativas = EXCLUDED.alternativas, midia = EXCLUDED.midia, gabarito = EXCLUDED.gabarito,
           gabarito_fonte = EXCLUDED.gabarito_fonte, materia_id = EXCLUDED.materia_id, tema_id = EXCLUDED.tema_id,
           subtema = EXCLUDED.subtema, leis_citadas = EXCLUDED.leis_citadas, escopo = EXCLUDED.escopo,
           escopo_local = EXCLUDED.escopo_local, status = EXCLUDED.status,
           motivo_remocao = CASE WHEN EXCLUDED.status = 'removida' THEN COALESCE(EXCLUDED.motivo_remocao, itens.motivo_remocao) END,
           alertas = EXCLUDED.alertas, comentario = EXCLUDED.comentario, atualizado_em = now()`, vals);
      await db.query('COMMIT');
      if (ant.rows[0]) res.atualizadas++; else res.inseridas++;
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      res.ignoradas++;
      res.erros.push(`${q.id}: ${e.message}`);
    }
  }
  return res;
}

module.exports = { lerCSV, importarInventario, importarQuestoes, validarQuestao, garantirMateria, garantirTema, LETRAS };
