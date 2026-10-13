'use strict';
// Conexão com o Postgres e criação automática do esquema (idempotente: roda a cada subida).
const { Pool } = require('pg');
const { MATERIAS_PADRAO } = require('./lib/taxonomia');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX) || 15,
});

const SCHEMA = `
-- ===================== alunos =====================
CREATE TABLE IF NOT EXISTS alunos (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  cpf         CHAR(11) NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  whatsapp    TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== acervo de provas =====================
CREATE TABLE IF NOT EXISTS bancas (
  id    SERIAL PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  nome  TEXT NOT NULL
);

-- um concurso = uma linha do inventario.csv (município + ano + cargo + banca)
CREATE TABLE IF NOT EXISTS concursos (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,          -- id do inventário, ex.: jundiai-sp-2023
  municipio     TEXT,
  uf            CHAR(2),
  orgao         TEXT,
  cargo         TEXT,
  ano           INT,
  escolaridade  TEXT,
  banca_id      INT REFERENCES bancas(id),
  link_origem   TEXT,
  status_coleta TEXT,                          -- baixado | parcial | duplicata | nao_encontrado
  obs           TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- caderno aplicado (um concurso pode ter tipo A/B, masculino/feminino etc.)
CREATE TABLE IF NOT EXISTS provas (
  id           SERIAL PRIMARY KEY,
  concurso_id  INT NOT NULL REFERENCES concursos(id) ON DELETE CASCADE,
  caderno      TEXT NOT NULL DEFAULT '',
  formato      TEXT,
  data_prova   DATE,
  duracao_min  INT,
  arquivo      TEXT,
  UNIQUE (concurso_id, caderno)
);

-- ===================== taxonomia =====================
CREATE TABLE IF NOT EXISTS materias (
  id     SERIAL PRIMARY KEY,
  slug   TEXT NOT NULL UNIQUE,
  nome   TEXT NOT NULL UNIQUE,
  eixo   TEXT NOT NULL DEFAULT 'Outras',
  ordem  INT  NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS temas (
  id          SERIAL PRIMARY KEY,
  materia_id  INT NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  dica        TEXT,
  UNIQUE (materia_id, nome)
);

-- ===================== questões =====================
CREATE TABLE IF NOT EXISTS textos_base (
  id        SERIAL PRIMARY KEY,
  prova_id  INT NOT NULL REFERENCES provas(id) ON DELETE CASCADE,
  chave     TEXT NOT NULL,
  conteudo  TEXT NOT NULL,
  UNIQUE (prova_id, chave)
);

CREATE TABLE IF NOT EXISTS itens (
  id               SERIAL PRIMARY KEY,
  codigo           TEXT NOT NULL UNIQUE,       -- <id da prova>-q<nº>, ex.: jundiai-sp-2023-q23
  prova_id         INT NOT NULL REFERENCES provas(id) ON DELETE CASCADE,
  numero_original  INT,
  formato          TEXT NOT NULL CHECK (formato IN ('ME4', 'ME5', 'CE')),
  texto_base_id    INT REFERENCES textos_base(id) ON DELETE SET NULL,
  enunciado        TEXT NOT NULL,
  alternativas     JSONB NOT NULL,             -- {"A": "...", "B": "..."}  ou  {"C": "Certo", "E": "Errado"}
  midia            JSONB NOT NULL DEFAULT '[]'::jsonb,
  gabarito         TEXT,                       -- null = anulada
  gabarito_fonte   TEXT,
  materia_id       INT REFERENCES materias(id),
  tema_id          INT REFERENCES temas(id),
  subtema          TEXT,
  leis_citadas     TEXT[] NOT NULL DEFAULT '{}',
  escopo           TEXT NOT NULL DEFAULT 'nacional' CHECK (escopo IN ('nacional', 'estadual', 'municipal')),
  escopo_local     TEXT,
  status           TEXT NOT NULL DEFAULT 'extraida' CHECK (status IN ('extraida', 'revisar', 'aprovada', 'removida')),
  motivo_remocao   TEXT,
  alertas          TEXT[] NOT NULL DEFAULT '{}',
  comentario       TEXT,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS itens_status_materia ON itens (status, materia_id);
CREATE INDEX IF NOT EXISTS itens_prova ON itens (prova_id, numero_original);

-- ===================== simulados =====================
-- regras (JSONB): duracao_min, n_itens, max_saidas, intervalo_h, erro_anula, ordem, filtros{...}
CREATE TABLE IF NOT EXISTS simulados (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  titulo       TEXT NOT NULL,
  subtitulo    TEXT,
  tipo         TEXT NOT NULL CHECK (tipo IN ('prova_real', 'banca', 'materia', 'edital', 'livre')),
  regras       JSONB NOT NULL,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- banca, uf, ano, municipio (para filtros do catálogo)
  ativo        BOOLEAN NOT NULL DEFAULT true,
  destaque     BOOLEAN NOT NULL DEFAULT false,
  ordem        INT NOT NULL DEFAULT 100,
  total_itens  INT NOT NULL DEFAULT 0,               -- itens disponíveis hoje (recalculado pelo servidor)
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tentativas (
  id               SERIAL PRIMARY KEY,
  aluno_id         INT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  simulado_id      INT NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  regras           JSONB NOT NULL,             -- cópia das regras no momento do início
  iniciada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em        TIMESTAMPTZ NOT NULL,
  finalizada_em    TIMESTAMPTZ,
  ordem            INT[] NOT NULL,             -- ids de itens na ordem apresentada
  respostas        JSONB NOT NULL DEFAULT '{}'::jsonb,
  violacoes        INT NOT NULL DEFAULT 0,
  ultima_violacao  TIMESTAMPTZ,
  eventos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  motivo_fim       TEXT,
  certos           INT,
  errados          INT,
  brancos          INT,
  nota             INT,
  duracao_seg      INT,
  por_tema         JSONB,
  por_materia      JSONB,
  primeira         BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS tentativas_uma_aberta ON tentativas (aluno_id) WHERE finalizada_em IS NULL;
CREATE INDEX IF NOT EXISTS tentativas_aluno ON tentativas (aluno_id, iniciada_em DESC);
CREATE INDEX IF NOT EXISTS tentativas_ranking ON tentativas (simulado_id, nota DESC, duracao_seg) WHERE finalizada_em IS NOT NULL;
`;

async function semearTaxonomia(db) {
  for (const [i, m] of MATERIAS_PADRAO.entries()) {
    await db.query(
      `INSERT INTO materias (slug, nome, eixo, ordem) VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET eixo = EXCLUDED.eixo, ordem = EXCLUDED.ordem`,
      [m.slug, m.nome, m.eixo, (i + 1) * 10]);
  }
}

async function init() {
  for (let i = 1; i <= 15; i++) {
    try {
      await pool.query(SCHEMA);
      await semearTaxonomia(pool);
      console.log('Banco pronto.');
      return;
    } catch (e) {
      if (e.code && !['ECONNREFUSED', '57P03', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(e.code)) throw e;
      console.log(`Aguardando o Postgres (tentativa ${i}/15): ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Não foi possível conectar ao Postgres. Confira DATABASE_URL.');
}

module.exports = { pool, init };
