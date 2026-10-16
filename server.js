'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pool, init } = require('./db');
const S = require('./lib/simulados');
const { importarInventario, importarQuestoes, garantirMateria, garantirTema } = require('./lib/importar');
const { MATERIAS_PADRAO } = require('./lib/taxonomia');

// ---------------- configuração ----------------
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MIDIA_DIR = process.env.MIDIA_DIR || path.join(__dirname, 'midia');
const FB_PROJETO = process.env.FIREBASE_PROJECT_ID || 'simulados-academia';
const IMG_HOSTS = (process.env.IMG_HOSTS || 'https://academiadepolicia.com.br').split(/\s+/).filter(Boolean).join(' ');
if (SECRET.length < 32) {
  console.error('Defina a variável SESSION_SECRET com pelo menos 32 caracteres.');
  process.exit(1);
}

// ---------------- utilitários ----------------
function cpfValido(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    if ((soma * 10) % 11 % 10 !== Number(cpf[n])) return false;
  }
  return true;
}
const mascararCPF = c => `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
const nomeCurto = n => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

const hmac = p => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
function assinar(dados) {
  const p = Buffer.from(JSON.stringify(dados)).toString('base64url');
  return `${p}.${hmac(p)}`;
}
function verificar(tok) {
  if (!tok) return null;
  const [p, s] = tok.split('.');
  if (!p || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(hmac(p));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}
function lerCookie(req, nome) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${nome}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setSessao(res, alunoId) {
  const dias = 7;
  const tok = assinar({ id: alunoId, exp: Date.now() + dias * 864e5 });
  res.setHeader('Set-Cookie', `sid=${tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${dias * 86400}${PROD ? '; Secure' : ''}`);
}

// ---------------- login Firebase ----------------
// Confere o ID token do Firebase (JWT RS256) com as chaves públicas do Google, sem SDK.
let certs = { exp: 0, chaves: {} };
async function certsFirebase() {
  if (certs.exp > Date.now()) return certs.chaves;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('Não foi possível obter as chaves do Firebase.');
  const idade = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  certs = { chaves: await r.json(), exp: Date.now() + idade * 1000 };
  return certs.chaves;
}
async function tokenFirebase(tok) {
  const [h64, p64, s64] = String(tok || '').split('.');
  if (!s64) return null;
  let cab, c;
  try { cab = JSON.parse(Buffer.from(h64, 'base64url')); c = JSON.parse(Buffer.from(p64, 'base64url')); } catch { return null; }
  const pem = cab.alg === 'RS256' && (await certsFirebase())[cab.kid];
  if (!pem) return null;
  const chave = new crypto.X509Certificate(pem).publicKey;
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${h64}.${p64}`), chave, Buffer.from(s64, 'base64url'))) return null;
  const agora = Date.now() / 1000;
  if (c.aud !== FB_PROJETO || c.iss !== `https://securetoken.google.com/${FB_PROJETO}` || !c.sub || c.exp < agora || c.iat > agora + 300) return null;
  return c;
}
// token válido e e-mail confirmado (Google já vem confirmado)
async function contaFirebase(req, res) {
  const c = await tokenFirebase((req.body || {}).idToken);
  if (!c) { erro(res, 'Login inválido ou expirado. Entre novamente.', 401); return null; }
  if (!c.email || !c.email_verified) { res.status(403).json({ erro: 'Confirme seu e-mail pelo link que enviamos antes de entrar.', verificar: true }); return null; }
  return c;
}

// limitador simples para login/cadastro
const limites = new Map();
setInterval(() => { const t = Date.now(); for (const [k, v] of limites) if (v.reset < t) limites.delete(k); }, 10 * 60e3).unref();
const limitar = (max, janelaMs) => (req, res, next) => {
  const k = req.ip + req.path, agora = Date.now(), r = limites.get(k);
  if (!r || r.reset < agora) { limites.set(k, { n: 1, reset: agora + janelaMs }); return next(); }
  if (++r.n > max) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  next();
};

const h = fn => (req, res, next) => fn(req, res).catch(next);
const erro = (res, msg, st = 400) => res.status(st).json({ erro: msg });

function auth(req, res, next) {
  const s = verificar(lerCookie(req, 'sid'));
  if (!s) return erro(res, 'Sessão expirada. Entre novamente.', 401);
  req.alunoId = s.id;
  next();
}
function admin(req, res, next) {
  if (verificar(lerCookie(req, 'adm'))?.adm) return next();
  const tok = String((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token || '');
  if (!ADMIN_TOKEN || tok.length !== ADMIN_TOKEN.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(ADMIN_TOKEN))) return erro(res, 'Não autorizado.', 401);
  next();
}

// ---------------- itens ----------------
// Carrega itens com origem, matéria, tema e texto-base (para prova e resultado).
async function carregarItens(db, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT i.id, i.codigo, i.numero_original, i.formato, i.enunciado, i.alternativas, i.midia, i.gabarito, i.comentario, i.comentario_status,
            i.escopo, tb.id AS tb_id, tb.conteudo AS texto_base, m.nome AS materia, t.nome AS tema, t.dica,
            c.municipio, c.uf, c.ano, c.orgao, c.cargo, b.nome AS banca, p.caderno
     FROM itens i JOIN provas p ON p.id = i.prova_id JOIN concursos c ON c.id = p.concurso_id
     LEFT JOIN bancas b ON b.id = c.banca_id LEFT JOIN materias m ON m.id = i.materia_id
     LEFT JOIN temas t ON t.id = i.tema_id LEFT JOIN textos_base tb ON tb.id = i.texto_base_id
     WHERE i.id = ANY($1)`, [ids]);
  return new Map(rows.map(r => [r.id, r]));
}
const origem = q => [q.banca, q.orgao || (q.municipio ? `Pref. ${q.municipio}${q.uf ? '/' + q.uf : ''}` : null), q.ano, q.cargo]
  .filter(Boolean).join(' · ') + (q.numero_original ? ` · questão ${q.numero_original}` : '');

// ---------------- regras da prova ----------------
async function finalizar(db, t, motivo) {
  const itens = await carregarItens(db, t.ordem);
  const r = S.corrigir(t.ordem, t.respostas || {}, itens, t.regras);
  const fim = Math.min(Date.now(), new Date(t.expira_em).getTime());
  const dur = Math.max(0, Math.round((fim - new Date(t.iniciada_em).getTime()) / 1000));
  const { rows } = await db.query(
    `UPDATE tentativas SET finalizada_em = to_timestamp($2::double precision / 1000), motivo_fim = $3,
       certos = $4, errados = $5, brancos = $6, nota = $7, duracao_seg = $8, por_tema = $9, por_materia = $10
     WHERE id = $1 AND finalizada_em IS NULL RETURNING *`,
    [t.id, fim, motivo, r.certos, r.errados, r.brancos, r.nota, dur, r.porTema, r.porMateria]);
  return rows[0] || null;
}

// devolve a prova aberta; se o tempo acabou, entrega automaticamente
async function provaAberta(alunoId) {
  const { rows } = await pool.query('SELECT * FROM tentativas WHERE aluno_id = $1 AND finalizada_em IS NULL', [alunoId]);
  const t = rows[0];
  if (!t) return null;
  if (new Date(t.expira_em).getTime() <= Date.now()) { await finalizar(pool, t, 'tempo'); return null; }
  return t;
}
async function ultimaFinalizada(alunoId) {
  const { rows } = await pool.query('SELECT id FROM tentativas WHERE aluno_id = $1 AND finalizada_em IS NOT NULL ORDER BY finalizada_em DESC LIMIT 1', [alunoId]);
  return rows[0] ? rows[0].id : null;
}

// ---------------- app ----------------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    `font-src 'self' https://fonts.gstatic.com; img-src 'self' data: ${IMG_HOSTS}; ` +
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; " +
    `frame-src https://${FB_PROJETO}.firebaseapp.com; ` +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
const jsonPequeno = express.json({ limit: '20kb', type: ['application/json', 'text/plain'] }); // text/plain: navigator.sendBeacon
const jsonGrande = express.json({ limit: '15mb' });
app.use('/api/admin', jsonGrande, express.text({ limit: '15mb', type: ['text/csv', 'text/plain'] }));
app.use('/api', jsonPequeno);

app.get('/health', h(async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));

// ----- conta -----
// 1) depois do login no Firebase: entra se a conta já existe; senão pede o cadastro (CPF etc.)
app.post('/api/entrar', limitar(30, 15 * 60e3), h(async (req, res) => {
  const c = await contaFirebase(req, res);
  if (!c) return;
  const { rows } = await pool.query('SELECT id FROM alunos WHERE firebase_uid = $1', [c.sub]);
  if (rows[0]) { setSessao(res, rows[0].id); return res.json({ ok: true }); }
  res.json({ cadastro: true, nome: c.name || '', email: c.email });
}));

// 2) primeiro acesso: completa o cadastro. Uma conta por CPF (UNIQUE no banco).
app.post('/api/cadastro', limitar(10, 15 * 60e3), h(async (req, res) => {
  const c = await contaFirebase(req, res);
  if (!c) return;
  const b = req.body || {};
  const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
  const cpf = String(b.cpf || '').replace(/\D/g, '');
  const whatsapp = String(b.whatsapp || '').replace(/\D/g, '');
  const email = String(c.email).toLowerCase();
  if (nome.length < 5 || nome.length > 120 || !nome.includes(' ')) return erro(res, 'Informe seu nome completo.');
  if (!cpfValido(cpf)) return erro(res, 'CPF inválido. Confira os números digitados.');
  if (whatsapp.length < 10 || whatsapp.length > 11) return erro(res, 'WhatsApp inválido. Informe DDD + número.');
  // conta antiga (CPF + senha) com o mesmo e-mail: só vincula
  let { rows } = await pool.query(
    'UPDATE alunos SET firebase_uid = $1 WHERE cpf = $2 AND firebase_uid IS NULL AND lower(email) = $3 RETURNING id', [c.sub, cpf, email]);
  try {
    if (!rows[0]) ({ rows } = await pool.query(
      'INSERT INTO alunos (nome, cpf, email, whatsapp, firebase_uid) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [nome, cpf, email, whatsapp, c.sub]));
  } catch (e) {
    if (e.code !== '23505') throw e;
    if (/cpf/.test(e.constraint)) return erro(res, 'Este CPF já tem uma conta. Entre com o e-mail ou a conta Google usados no cadastro. Se não lembra, fale com a equipe.', 409);
    return erro(res, 'Esta conta já está cadastrada. Entre novamente.', 409);
  }
  setSessao(res, rows[0].id);
  res.json({ ok: true });
}));

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/me', auth, h(async (req, res) => {
  const { rows } = await pool.query('SELECT nome, cpf FROM alunos WHERE id = $1', [req.alunoId]);
  if (!rows[0]) return erro(res, 'Sessão inválida.', 401);
  const aberta = await provaAberta(req.alunoId);
  let simAberto = null;
  if (aberta) {
    const s = await pool.query('SELECT slug, titulo FROM simulados WHERE id = $1', [aberta.simulado_id]);
    simAberto = s.rows[0] || null;
  }
  res.json({ nome: rows[0].nome, cpf: mascararCPF(rows[0].cpf), tentativaAberta: simAberto, agora: new Date().toISOString() });
}));

// ----- catálogo de simulados -----
app.get('/api/simulados', auth, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.slug, s.titulo, s.subtitulo, s.tipo, s.regras, s.meta, s.destaque, s.total_itens,
            ult.iniciada_em AS ultima_em, COALESCE(st.feitas, 0) AS feitas, st.melhor, st.melhor_total
     FROM simulados s
     LEFT JOIN LATERAL (SELECT iniciada_em FROM tentativas WHERE aluno_id = $1 AND simulado_id = s.id ORDER BY iniciada_em DESC LIMIT 1) ult ON true
     LEFT JOIN LATERAL (SELECT count(*)::int AS feitas, max(nota) AS melhor, max(certos + errados + brancos) AS melhor_total
                        FROM tentativas WHERE aluno_id = $1 AND simulado_id = s.id AND finalizada_em IS NOT NULL) st ON true
     WHERE s.ativo AND s.total_itens > 0
     ORDER BY s.destaque DESC, s.ordem, s.titulo`, [req.alunoId]);
  const agora = Date.now();
  res.json({
    agora: new Date().toISOString(),
    simulados: rows.map(s => {
      const r = S.normalizarRegras(s.regras);
      const prox = s.ultima_em && r.intervalo_h ? new Date(s.ultima_em).getTime() + r.intervalo_h * 36e5 : 0;
      return {
        slug: s.slug, titulo: s.titulo, subtitulo: s.subtitulo, tipo: s.tipo, meta: s.meta, destaque: s.destaque,
        itens: s.total_itens, duracaoMin: S.duracaoSeg(r, s.total_itens) / 60, erroAnula: r.erro_anula,
        maxSaidas: r.max_saidas, intervaloH: r.intervalo_h,
        feitas: s.feitas, melhor: s.melhor, proximaEm: prox > agora ? new Date(prox).toISOString() : null,
      };
    }),
  });
}));

app.post('/api/simulados/:slug/tentativas', auth, h(async (req, res) => {
  const sim = await pool.query('SELECT * FROM simulados WHERE slug = $1 AND ativo', [req.params.slug]);
  if (!sim.rows[0]) return erro(res, 'Simulado não encontrado.', 404);
  await iniciarTentativa(req, res, sim.rows[0]);
}));

// treino de uma matéria (botão "treinar" nos pontos fracos): usa o simulado "por matéria" dela
app.post('/api/treino', auth, h(async (req, res) => {
  const materia = String((req.body || {}).materia || '');
  const sim = await pool.query(
    `SELECT * FROM simulados WHERE ativo AND tipo = 'materia' AND total_itens > 0 AND regras->'filtros'->'materias' ? $1 LIMIT 1`, [materia]);
  if (!sim.rows[0]) return erro(res, 'Ainda não há treino desta matéria.', 404);
  await iniciarTentativa(req, res, sim.rows[0]);
}));

async function iniciarTentativa(req, res, s) {
  const regras = S.normalizarRegras(s.regras);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT id FROM alunos WHERE id = $1 FOR UPDATE', [req.alunoId]); // trava contra cliques duplos
    const ab = await c.query('SELECT * FROM tentativas WHERE aluno_id = $1 AND finalizada_em IS NULL', [req.alunoId]);
    if (ab.rows[0]) {
      if (new Date(ab.rows[0].expira_em).getTime() > Date.now()) {
        await c.query('COMMIT');
        if (ab.rows[0].simulado_id === s.id) return res.json({ ok: true, retomada: true });
        return erro(res, 'Você já tem outro simulado em andamento. Termine ou entregue antes de começar um novo.', 409);
      }
      await finalizar(c, ab.rows[0], 'tempo');
    }
    const ult = await c.query('SELECT iniciada_em FROM tentativas WHERE aluno_id = $1 AND simulado_id = $2 ORDER BY iniciada_em DESC LIMIT 1', [req.alunoId, s.id]);
    if (ult.rows[0] && regras.intervalo_h) {
      const proxima = new Date(ult.rows[0].iniciada_em).getTime() + regras.intervalo_h * 36e5;
      if (proxima > Date.now()) {
        await c.query('ROLLBACK');
        return res.status(429).json({ erro: `Você já fez este simulado nas últimas ${regras.intervalo_h} horas.`, proximaEm: new Date(proxima).toISOString() });
      }
    }
    const ordem = await S.montarProva(c, regras);
    if (!ordem.length) { await c.query('ROLLBACK'); return erro(res, 'Este simulado ainda não tem questões liberadas.', 409); }
    const snap = { ...regras, duracao_seg: S.duracaoSeg(regras, ordem.length) };
    await c.query(
      `INSERT INTO tentativas (aluno_id, simulado_id, regras, expira_em, ordem, primeira)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6)`,
      [req.alunoId, s.id, snap, snap.duracao_seg, ordem, !ult.rows[0]]);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// ----- prova -----
app.get('/api/tentativas/atual', auth, h(async (req, res) => {
  const t = await provaAberta(req.alunoId);
  if (!t) return res.status(404).json({ erro: 'Nenhuma prova em andamento.', ultimaId: await ultimaFinalizada(req.alunoId) });
  const [al, sim, itens] = await Promise.all([
    pool.query('SELECT nome, cpf FROM alunos WHERE id = $1', [req.alunoId]),
    pool.query('SELECT titulo, subtitulo, tipo FROM simulados WHERE id = $1', [t.simulado_id]),
    carregarItens(pool, t.ordem),
  ]);
  const textos = {};
  const questoes = t.ordem.map((id, i) => {
    const q = itens.get(id);
    if (!q) return null;
    if (q.texto_base) textos['tb' + q.tb_id] = q.texto_base;
    return {
      id, n: i + 1, formato: q.formato, materia: q.materia || 'Geral', enunciado: q.enunciado,
      alternativas: q.alternativas, midia: q.midia, origem: origem(q),
      textoBase: q.texto_base ? 'tb' + q.tb_id : null,
    };
  }).filter(Boolean);
  res.json({
    id: t.id,
    simulado: sim.rows[0],
    expiraEm: t.expira_em,
    duracaoSeg: t.regras.duracao_seg,
    erroAnula: t.regras.erro_anula,
    agora: new Date().toISOString(),
    saidas: t.violacoes,
    maxSaidas: t.regras.max_saidas,
    respostas: t.respostas,
    marca: `${al.rows[0].nome} · ${mascararCPF(al.rows[0].cpf)}`,
    textos,
    questoes,
  });
}));

app.put('/api/tentativas/atual/resposta', auth, h(async (req, res) => {
  const qid = Number((req.body || {}).qid);
  let resp = (req.body || {}).resp ?? null;
  if (resp !== null) resp = String(resp).toUpperCase();
  if (resp !== null && !/^[A-E]$/.test(resp)) return erro(res, 'Resposta inválida.');
  const t = await provaAberta(req.alunoId);
  if (!t) return res.status(409).json({ erro: 'A prova já foi encerrada.', encerrada: true, id: await ultimaFinalizada(req.alunoId) });
  if (!t.ordem.includes(qid)) return erro(res, 'Item inválido.');
  if (resp) {
    const it = await pool.query('SELECT alternativas FROM itens WHERE id = $1', [qid]);
    if (!it.rows[0] || !(resp in it.rows[0].alternativas)) return erro(res, 'Alternativa inválida.');
    await pool.query(`UPDATE tentativas SET respostas = jsonb_set(respostas, ARRAY[$2::text], to_jsonb($3::text)) WHERE id = $1 AND finalizada_em IS NULL`, [t.id, String(qid), resp]);
  } else {
    await pool.query(`UPDATE tentativas SET respostas = respostas - $2::text WHERE id = $1 AND finalizada_em IS NULL`, [t.id, String(qid)]);
  }
  res.json({ ok: true });
}));

app.post('/api/tentativas/atual/violacao', auth, h(async (req, res) => {
  const tipo = String((req.body || {}).tipo || 'saida').slice(0, 40);
  const t = await provaAberta(req.alunoId);
  if (!t) return res.json({ encerrada: true, id: await ultimaFinalizada(req.alunoId) });
  const max = t.regras.max_saidas || 3;
  // conta no máximo 1 saída a cada 3 s (uma troca de aba dispara vários eventos)
  const { rows } = await pool.query(
    `UPDATE tentativas SET violacoes = violacoes + 1, ultima_violacao = now(),
       eventos = eventos || jsonb_build_array(jsonb_build_object('tipo', $2::text, 'em', now()))
     WHERE id = $1 AND finalizada_em IS NULL AND (ultima_violacao IS NULL OR ultima_violacao < now() - interval '3 seconds')
     RETURNING *`, [t.id, tipo]);
  const atual = rows[0] || t;
  if (atual.violacoes >= max) {
    await finalizar(pool, atual, 'saidas');
    return res.json({ encerrada: true, id: atual.id, saidas: atual.violacoes });
  }
  res.json({ saidas: atual.violacoes, max, contou: !!rows[0] });
}));

app.post('/api/tentativas/atual/finalizar', auth, h(async (req, res) => {
  const t = await provaAberta(req.alunoId);
  if (!t) return res.json({ id: await ultimaFinalizada(req.alunoId) });
  const f = await finalizar(pool, t, 'entregue');
  res.json({ id: f ? f.id : t.id });
}));

app.get('/api/tentativas', auth, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.iniciada_em, t.finalizada_em, t.motivo_fim, t.certos, t.errados, t.brancos, t.nota, t.duracao_seg,
            t.por_tema, t.por_materia, t.violacoes, t.primeira, t.regras->>'erro_anula' AS erro_anula,
            array_length(t.ordem, 1) AS total, s.slug, s.titulo, s.tipo
     FROM tentativas t JOIN simulados s ON s.id = t.simulado_id
     WHERE t.aluno_id = $1 AND t.finalizada_em IS NOT NULL ORDER BY t.iniciada_em`, [req.alunoId]);
  res.json(rows.map(r => ({ ...r, erro_anula: r.erro_anula === 'true' })));
}));

app.get('/api/tentativas/:id', auth, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, s.slug, s.titulo, s.subtitulo FROM tentativas t JOIN simulados s ON s.id = t.simulado_id
     WHERE t.id = $1 AND t.aluno_id = $2 AND t.finalizada_em IS NOT NULL`, [Number(req.params.id) || 0, req.alunoId]);
  const t = rows[0];
  if (!t) return erro(res, 'Resultado não encontrado.', 404);
  const anterior = await pool.query(
    `SELECT por_tema FROM tentativas WHERE aluno_id = $1 AND simulado_id = $2 AND finalizada_em IS NOT NULL AND iniciada_em < $3
     ORDER BY iniciada_em DESC LIMIT 1`, [req.alunoId, t.simulado_id, t.iniciada_em]);
  const itens = await carregarItens(pool, t.ordem);
  const dicas = {};
  for (const q of itens.values()) if (q.tema && q.dica) dicas[q.tema] = q.dica;
  res.json({
    id: t.id, simulado: { slug: t.slug, titulo: t.titulo, subtitulo: t.subtitulo },
    iniciada_em: t.iniciada_em, motivo_fim: t.motivo_fim, certos: t.certos, errados: t.errados, brancos: t.brancos,
    nota: t.nota, duracao_seg: t.duracao_seg, violacoes: t.violacoes, primeira: t.primeira,
    erroAnula: !!t.regras.erro_anula, maxSaidas: t.regras.max_saidas, duracaoSeg: t.regras.duracao_seg,
    por_tema: t.por_tema, por_materia: t.por_materia,
    por_tema_anterior: anterior.rows[0] ? anterior.rows[0].por_tema : null,
    total: t.ordem.length, dicas,
    revisao: t.ordem.map((id, i) => {
      const q = itens.get(id);
      if (!q) return null;
      return {
        n: i + 1, formato: q.formato, materia: q.materia, tema: q.tema, enunciado: q.enunciado, alternativas: q.alternativas,
        midia: q.midia, textoBase: q.texto_base, origem: origem(q),
        resposta: t.respostas[id] || null, gabarito: q.gabarito, comentario: q.comentario_status === 'ia_revisar' ? null : q.comentario,
      };
    }).filter(Boolean),
  });
}));

// ----- desempenho acumulado (todas as tentativas) -----
app.get('/api/desempenho', auth, h(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT por_materia, por_tema FROM tentativas WHERE aluno_id = $1 AND finalizada_em IS NOT NULL', [req.alunoId]);
  const soma = (alvo, obj) => {
    for (const [k, x] of Object.entries(obj || {})) {
      const a = alvo[k] || (alvo[k] = { materia: x.materia, total: 0, certos: 0, errados: 0, brancos: 0 });
      a.total += x.total; a.certos += x.certos; a.errados += x.errados; a.brancos += x.brancos;
    }
  };
  const porMateria = {}, porTema = {};
  rows.forEach(r => { soma(porMateria, r.por_materia); soma(porTema, r.por_tema); });
  const dic = await pool.query(`SELECT t.nome, t.dica FROM temas t WHERE t.dica IS NOT NULL AND t.nome = ANY($1)`, [Object.keys(porTema)]);
  res.json({ porMateria, porTema, dicas: Object.fromEntries(dic.rows.map(r => [r.nome, r.dica])) });
}));

// ----- ranking (por simulado) -----
// modo=primeira: ranking oficial, só a 1ª tentativa de cada aluno · modo=melhor: melhor nota de cada aluno
app.get('/api/ranking', auth, h(async (req, res) => {
  const sim = await pool.query('SELECT id, titulo FROM simulados WHERE slug = $1', [String(req.query.simulado || '')]);
  if (!sim.rows[0]) return erro(res, 'Simulado não encontrado.', 404);
  const sid = sim.rows[0].id;
  const melhor = req.query.modo === 'melhor';
  const base = melhor
    ? `SELECT DISTINCT ON (t.aluno_id) t.aluno_id, t.nota, t.certos, t.duracao_seg, t.finalizada_em, array_length(t.ordem,1) AS total
       FROM tentativas t WHERE t.simulado_id = $1 AND t.finalizada_em IS NOT NULL ORDER BY t.aluno_id, t.nota DESC, t.duracao_seg ASC`
    : `SELECT t.aluno_id, t.nota, t.certos, t.duracao_seg, t.finalizada_em, array_length(t.ordem,1) AS total
       FROM tentativas t WHERE t.simulado_id = $1 AND t.primeira AND t.finalizada_em IS NOT NULL`;
  const sql = `WITH b AS (${base}),
    r AS (SELECT b.*, a.nome, RANK() OVER (ORDER BY b.nota DESC, b.duracao_seg ASC) AS pos FROM b JOIN alunos a ON a.id = b.aluno_id)`;
  const [lista, eu, total] = await Promise.all([
    pool.query(`${sql} SELECT * FROM r ORDER BY pos, finalizada_em LIMIT 50`, [sid]),
    pool.query(`${sql} SELECT * FROM r WHERE aluno_id = $2`, [sid, req.alunoId]),
    pool.query(`${sql} SELECT count(*)::int AS n FROM r`, [sid]),
  ]);
  const fmt = l => ({ pos: Number(l.pos), nome: nomeCurto(l.nome), nota: l.nota, certos: l.certos, total: l.total, duracao_seg: l.duracao_seg, eu: l.aluno_id === req.alunoId });
  res.json({ titulo: sim.rows[0].titulo, lista: lista.rows.map(fmt), eu: eu.rows[0] ? fmt(eu.rows[0]) : null, total: total.rows[0].n });
}));

// ================= administração (Authorization: Bearer ADMIN_TOKEN) =================
app.get('/api/admin/resumo', admin, h(async (req, res) => {
  const q = sql => pool.query(sql).then(r => r.rows);
  const [itens, materias, simulados, concursos, alunos, comentarios] = await Promise.all([
    q(`SELECT status, count(*)::int AS n FROM itens GROUP BY status ORDER BY status`),
    q(`SELECT m.nome, m.eixo, count(i.id)::int AS itens, count(i.id) FILTER (WHERE i.status = 'aprovada')::int AS aprovadas
       FROM materias m LEFT JOIN itens i ON i.materia_id = m.id GROUP BY m.id ORDER BY m.ordem, m.nome`),
    q(`SELECT slug, titulo, tipo, ativo, total_itens FROM simulados ORDER BY ordem, titulo`),
    q(`SELECT count(*)::int AS concursos, count(DISTINCT banca_id)::int AS bancas FROM concursos`),
    q(`SELECT count(*)::int AS n FROM alunos`),
    q(`SELECT COALESCE(comentario_status, CASE WHEN comentario IS NULL THEN 'sem' ELSE 'antigo' END) AS status, count(*)::int AS n
       FROM itens WHERE status = 'aprovada' GROUP BY 1 ORDER BY 1`),
  ]);
  res.json({ statusLiberados: S.STATUS_LIBERADOS, itens, materias, simulados, acervo: concursos[0], alunos: alunos[0].n, comentarios });
}));

// corpo: o CSV puro (Content-Type: text/csv) ou {"csv": "..."}
app.post('/api/admin/importar/inventario', admin, h(async (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : (req.body || {}).csv;
  if (!csv) return erro(res, 'Envie o CSV no corpo (text/csv) ou em {"csv": "..."}.');
  res.json(await importarInventario(pool, csv));
}));

// corpo: o JSON de uma prova extraída (array de questões ou {prova, textos_base, questoes})
app.post('/api/admin/importar/questoes', admin, h(async (req, res) => {
  const r = await importarQuestoes(pool, req.body, { preservarRevisao: req.query.sobrescrever !== '1' });
  await S.atualizarContagens(pool);
  res.json(r);
}));

app.post('/api/admin/simulados/gerar', admin, h(async (req, res) => {
  const feitos = await S.gerarCatalogo(pool, req.body || {});
  res.json({ ok: true, simulados: feitos.length, slugs: feitos });
}));

// cria/atualiza um simulado montado à mão (ex.: tipo "edital" para Belém ou Toledo)
app.put('/api/admin/simulados/:slug', admin, h(async (req, res) => {
  const b = req.body || {};
  if (!b.titulo || !b.tipo) return erro(res, 'Informe ao menos titulo e tipo.');
  const regras = S.normalizarRegras(b.regras);
  await pool.query(
    `INSERT INTO simulados (slug, titulo, subtitulo, tipo, regras, meta, ativo, destaque, ordem)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,true),COALESCE($8,false),COALESCE($9,100))
     ON CONFLICT (slug) DO UPDATE SET titulo = EXCLUDED.titulo, subtitulo = EXCLUDED.subtitulo, tipo = EXCLUDED.tipo,
       regras = EXCLUDED.regras, meta = EXCLUDED.meta, ativo = EXCLUDED.ativo, destaque = EXCLUDED.destaque, ordem = EXCLUDED.ordem`,
    [req.params.slug, b.titulo, b.subtitulo || null, b.tipo, regras, b.meta || {}, b.ativo, b.destaque, b.ordem]);
  const n = await S.contarPool(pool, regras);
  await pool.query('UPDATE simulados SET total_itens = $2 WHERE slug = $1', [req.params.slug, n]);
  res.json({ ok: true, slug: req.params.slug, itens: n });
}));

// login do painel de administração: a senha é o ADMIN_TOKEN; vira cookie HttpOnly assinado (8 h)
app.post('/api/admin/login', limitar(10, 15 * 60e3), (req, res) => {
  const senha = String((req.body && req.body.senha) || '');
  if (!ADMIN_TOKEN || senha.length !== ADMIN_TOKEN.length || !crypto.timingSafeEqual(Buffer.from(senha), Buffer.from(ADMIN_TOKEN))) return erro(res, 'Senha incorreta.', 401);
  res.setHeader('Set-Cookie', `adm=${assinar({ adm: true, exp: Date.now() + 8 * 36e5 })}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `adm=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.get('/api/admin/taxonomia', admin, (req, res) => res.json(MATERIAS_PADRAO.map(m => ({ nome: m.nome, eixo: m.eixo, temas: m.temas }))));

// fila de revisão: filtros status, materia, q (código ou trecho do enunciado), offset/limite
app.get('/api/admin/itens', admin, h(async (req, res) => {
  const st = String(req.query.status || 'extraida,revisar').split(',');
  const lim = Math.min(500, Number(req.query.limite) || 100);
  const off = Math.max(0, Number(req.query.offset) || 0);
  const w = ['i.status = ANY($1)'], p = [st];
  if (req.query.materia) { p.push(String(req.query.materia)); w.push(`m.nome = $${p.length}`); }
  if (req.query.comentario) { p.push(String(req.query.comentario)); w.push(`i.comentario_status = $${p.length}`); }
  if (req.query.q) { p.push('%' + String(req.query.q).trim() + '%'); w.push(`(i.codigo ILIKE $${p.length} OR i.enunciado ILIKE $${p.length})`); }
  const where = w.join(' AND ');
  const base = `FROM itens i JOIN provas p ON p.id = i.prova_id JOIN concursos c ON c.id = p.concurso_id
     LEFT JOIN bancas b ON b.id = c.banca_id LEFT JOIN materias m ON m.id = i.materia_id LEFT JOIN temas t ON t.id = i.tema_id
     LEFT JOIN textos_base tb ON tb.id = i.texto_base_id WHERE ${where}`;
  const [tot, { rows }] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n ${base}`, p),
    pool.query(`SELECT i.codigo, i.status, i.formato, i.numero_original, i.enunciado, i.alternativas, i.gabarito, i.escopo, i.escopo_local,
            i.alertas, i.comentario, i.comentario_status, i.comentario_nota, i.motivo_remocao, m.nome AS materia, t.nome AS tema, tb.conteudo AS texto_base,
            c.slug AS concurso, c.municipio, c.uf, c.ano, b.nome AS banca, p.arquivo
     ${base} ORDER BY c.slug, i.numero_original LIMIT ${lim} OFFSET ${off}`, p)]);
  res.json({ total: tot.rows[0].n, itens: rows });
}));

// revisão de um item: status, motivo_remocao, comentario, gabarito, escopo, escopo_local, enunciado, alternativas, materia, tema
app.patch('/api/admin/itens/:codigo', admin, h(async (req, res) => {
  const b = req.body || {};
  const campos = [], vals = [req.params.codigo];
  const set = (c, v) => { vals.push(v); campos.push(`${c} = $${vals.length}`); };
  if (b.status) {
    if (!['extraida', 'revisar', 'aprovada', 'removida'].includes(b.status)) return erro(res, 'status inválido');
    set('status', b.status);
    set('motivo_remocao', b.status === 'removida' ? (b.motivo_remocao || 'outro') : null);
  }
  if ('comentario' in b) { set('comentario', b.comentario || null); set('comentario_status', b.comentario ? 'humano' : null); set('comentario_nota', null); }
  if ('gabarito' in b) set('gabarito', b.gabarito ? String(b.gabarito).toUpperCase() : null);
  if (b.escopo) set('escopo', b.escopo);
  if ('escopo_local' in b) set('escopo_local', b.escopo_local || null);
  if (typeof b.enunciado === 'string') {
    if (b.enunciado.trim().length < 5) return erro(res, 'Enunciado vazio.');
    set('enunciado', b.enunciado);
  }
  if (b.alternativas && typeof b.alternativas === 'object') {
    const alt = {};
    for (const [k, v] of Object.entries(b.alternativas)) if (/^[A-E]$/.test(k) && String(v).trim()) alt[k] = String(v);
    if (Object.keys(alt).length < 2) return erro(res, 'Informe ao menos duas alternativas.');
    set('alternativas', alt);
  }
  if (b.materia) {
    const mid = await garantirMateria(pool, String(b.materia));
    set('materia_id', mid);
    set('tema_id', b.tema ? await garantirTema(pool, mid, String(b.tema)) : null);
  }
  if (!campos.length) return erro(res, 'Nada para alterar.');
  const r = await pool.query(`UPDATE itens SET ${campos.join(', ')}, atualizado_em = now() WHERE codigo = $1 RETURNING codigo, status`, vals);
  if (!r.rows[0]) return erro(res, 'Item não encontrado.', 404);
  S.atualizarContagens(pool).catch(e => console.error('recontagem:', e.message));
  res.json(r.rows[0]);
}));

// comentários em lote (gerados fora da plataforma): [{codigo, comentario, status: ia_aprovado|ia_revisar, nota}]
app.post('/api/admin/comentarios', admin, h(async (req, res) => {
  const lista = Array.isArray(req.body) ? req.body : [];
  let n = 0;
  for (const c of lista) {
    if (!c || !c.codigo || !String(c.comentario || '').trim() || !['ia_aprovado', 'ia_revisar'].includes(c.status)) continue;
    // nunca sobrescreve comentário que um humano já escreveu ou aprovou
    const r = await pool.query(
      `UPDATE itens SET comentario = $2, comentario_status = $3, comentario_nota = $4
       WHERE codigo = $1 AND (comentario_status IS NULL OR comentario_status LIKE 'ia_%') AND (comentario IS NULL OR comentario_status IS NOT NULL)`,
      [String(c.codigo), String(c.comentario).trim(), c.status, c.nota ? String(c.nota) : null]);
    n += r.rowCount;
  }
  res.json({ gravados: n, recebidos: lista.length });
}));

// aprovar / tirar várias questões de uma vez
app.post('/api/admin/itens/lote', admin, h(async (req, res) => {
  const b = req.body || {};
  const codigos = (Array.isArray(b.codigos) ? b.codigos : []).map(String).slice(0, 500);
  if (!codigos.length || !['aprovada', 'revisar', 'removida'].includes(b.status)) return erro(res, 'Informe as questões e a ação.');
  const r = await pool.query(
    `UPDATE itens SET status = $2, motivo_remocao = $3, atualizado_em = now()
     WHERE codigo = ANY($1) AND ($2 <> 'aprovada' OR gabarito IS NOT NULL) RETURNING codigo`,
    [codigos, b.status, b.status === 'removida' ? (b.motivo_remocao || 'outro') : null]);
  S.atualizarContagens(pool).catch(e => console.error('recontagem:', e.message));
  res.json({ alterados: r.rowCount, semGabarito: codigos.length - r.rowCount });
}));

// ----- simulados montados à mão (tipo edital = "da Academia", aparece em destaque) -----
app.get('/api/admin/simulados', admin, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT slug, titulo, subtitulo, tipo, regras, meta, ativo, destaque, total_itens, criado_em
     FROM simulados WHERE tipo IN ('edital', 'livre') ORDER BY criado_em DESC`);
  res.json(rows);
}));

app.post('/api/admin/simulados', admin, h(async (req, res) => {
  const b = req.body || {};
  const titulo = String(b.titulo || '').trim();
  if (titulo.length < 3) return erro(res, 'Dê um título ao simulado.');
  const regras = {
    duracao_min: Number(b.duracao_min) || null, intervalo_h: Number(b.intervalo_h) || 0,
    max_saidas: Number(b.max_saidas) || 3, erro_anula: !!b.erro_anula, filtros: {},
  };
  const meta = { montado: b.modo, municipio: b.municipio || null, uf: b.uf || null };
  if (b.modo === 'itens') {
    const codigos = (Array.isArray(b.codigos) ? b.codigos : []).map(String);
    const { rows } = await pool.query('SELECT id, codigo FROM itens WHERE codigo = ANY($1)', [codigos]);
    const id = new Map(rows.map(r => [r.codigo, r.id]));
    regras.filtros.item_ids = codigos.filter(c => id.has(c)).map(c => id.get(c));
    if (!regras.filtros.item_ids.length) return erro(res, 'Escolha ao menos uma questão.');
    regras.ordem = 'fixa';
    meta.codigos = codigos.filter(c => id.has(c));
  } else {
    const cotas = {};
    for (const [m, n] of Object.entries(b.cotas || {})) if (Number(n) > 0) cotas[String(m)] = Math.min(200, Number(n));
    if (!Object.keys(cotas).length) return erro(res, 'Escolha ao menos uma matéria e quantas questões.');
    regras.cotas = cotas;
    regras.ordem = 'materia';
    if (b.municipio) regras.filtros.municipio = String(b.municipio);
  }
  const reg = S.normalizarRegras(regras);
  const total = await S.contarPool(pool, reg);
  const slugNovo = b.slug || 'academia-' + require('./lib/taxonomia').slug(titulo) + '-' + Date.now().toString(36);
  const { rows } = await pool.query(
    `INSERT INTO simulados (slug, titulo, subtitulo, tipo, regras, meta, ativo, destaque, ordem, total_itens)
     VALUES ($1,$2,$3,'edital',$4,$5,$6,$7,10,$8)
     ON CONFLICT (slug) DO UPDATE SET titulo = EXCLUDED.titulo, subtitulo = EXCLUDED.subtitulo, regras = EXCLUDED.regras,
       meta = EXCLUDED.meta, ativo = EXCLUDED.ativo, destaque = EXCLUDED.destaque, total_itens = EXCLUDED.total_itens
     WHERE simulados.tipo IN ('edital', 'livre') RETURNING slug, total_itens`,
    [slugNovo, titulo, String(b.subtitulo || '').trim() || null, reg, meta, b.ativo !== false, !!b.destaque, total]);
  if (!rows[0]) return erro(res, 'Esse simulado é automático e não pode ser editado aqui.', 409);
  res.json(rows[0]);
}));

app.post('/api/admin/recontar', admin, h(async (req, res) => res.json({ simulados: await S.atualizarContagens(pool) })));

app.get('/api/admin/alunos.csv', admin, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.nome, a.cpf, a.email, a.whatsapp, a.criado_em, count(t.id) FILTER (WHERE t.finalizada_em IS NOT NULL) AS provas
     FROM alunos a LEFT JOIN tentativas t ON t.aluno_id = a.id GROUP BY a.id ORDER BY a.criado_em`);
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['nome;cpf;email;whatsapp;cadastro;simulados_feitos',
    ...rows.map(r => [r.nome, r.cpf, r.email, r.whatsapp, new Date(r.criado_em).toISOString(), r.provas].map(cel).join(';'))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="alunos-simulados-academia.csv"');
  res.send('﻿' + csv);
}));

// ----- arquivos -----
app.use('/midia', express.static(MIDIA_DIR, { maxAge: '7d', fallthrough: false }));
app.use('/vendor/katex', express.static(path.join(__dirname, 'node_modules/katex/dist'), { maxAge: '30d', fallthrough: false }));
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders: (res, p) => res.setHeader('Cache-Control', p.endsWith('.html') ? 'no-store' : 'public, max-age=3600'),
}));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return erro(res, 'Requisição inválida.');
  if (err.type === 'entity.too.large') return erro(res, 'Arquivo grande demais.', 413);
  if (err.status === 404) return erro(res, 'Arquivo não encontrado.', 404);
  console.error(err);
  erro(res, 'Erro interno. Tente novamente.', 500);
});

if (require.main === module) {
  init()
    .then(() => S.atualizarContagens(pool))
    .then(() => {
      setInterval(() => S.atualizarContagens(pool).catch(e => console.error('recontagem:', e.message)), 15 * 60e3).unref();
      app.listen(PORT, () => console.log(`Simulados Academia de Polícia rodando na porta ${PORT}`));
    })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = app;
