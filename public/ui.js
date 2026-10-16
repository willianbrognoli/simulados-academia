'use strict';
/* Utilitários compartilhados por todas as telas */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const BRASAO = 'https://academiadepolicia.com.br/wp-content/uploads/2026/04/brasao-academia-de-policia-em-fundo.png';
const ms = nome => `<span class="ms" aria-hidden="true">${nome}</span>`;

async function api(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let d = {};
  try { d = await r.json(); } catch {}
  if (r.status === 401 && !opts.semRedirect) { location.href = '/'; throw new Error('Sessão expirada'); }
  if (!r.ok) { const e = new Error(d.erro || 'Erro inesperado. Tente novamente.'); e.status = r.status; e.dados = d; throw e; }
  return d;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// texto de questão: escapa e transforma __trecho__ em destaque (sublinhado + negrito), como o grifo da prova impressa
const fmt = s => esc(s).replace(/__(.+?)__/g, '<u class="dest">$1</u>');
const pad = n => String(n).padStart(2, '0');

let _toastT;
function toast(msg, tipo = '') {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast on ' + tipo;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('on'), 3800);
}

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
function mascaraCPF(v) {
  v = v.replace(/\D/g, '').slice(0, 11);
  return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function mascaraTel(v) {
  v = v.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 2) return v;
  if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
}

function fmtDur(seg) {
  seg = seg || 0;
  const h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60);
  return h ? `${h}h${pad(m)}` : `${m} min`;
}
const fmtData = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

// número subindo animado
function contar(el, alvo, ms_ = 1200, sufixo = '') {
  if (!el) return;
  const ini = performance.now();
  const passo = t => {
    const p = Math.min(1, (t - ini) / ms_), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(alvo * e) + sufixo;
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// revela elementos .rv ao rolar
function revelar() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 });
  $$('.rv:not(.in)').forEach(el => io.observe(el));
}

// anel de nota (dourado)
const CIRC = 2 * Math.PI * 52;
function anel(box, valor, max, rotulo = 'acertos') {
  box.innerHTML = `<svg viewBox="0 0 120 120"><defs><linearGradient id="gO" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0D27A"/><stop offset="1" stop-color="#D4AF37"/></linearGradient></defs>
    <circle class="bg" cx="60" cy="60" r="52" fill="none" stroke-width="9"/>
    <circle class="fg" cx="60" cy="60" r="52" fill="none" stroke-width="9" stroke="url(#gO)" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>
    <div class="ct"><b>0</b><span>${esc(rotulo)} de ${max}</span></div>`;
  const p = Math.max(0, Math.min(1, valor / (max || 1)));
  requestAnimationFrame(() => setTimeout(() => { $('.fg', box).style.strokeDashoffset = CIRC * (1 - p); }, 120));
  const b = $('.ct b', box);
  if (valor < 0) b.textContent = valor; else contar(b, valor, 1500);
}

// classificação de desempenho
function classe(p) {
  if (p >= 80) return { c: 'ok', t: 'Dominado' };
  if (p >= 60) return { c: 'ok', t: 'Bom caminho' };
  if (p >= 40) return { c: 'mid', t: 'Atenção' };
  return { c: 'bad', t: 'Prioridade' };
}

// barras por matéria/tema (+ tendência em relação à tentativa anterior)
function renderBarras(box, dados, anterior, mostrarMateria = true) {
  const chaves = Object.keys(dados || {}).sort((a, b) => pct(dados[a].certos, dados[a].total) - pct(dados[b].certos, dados[b].total));
  if (!chaves.length) { box.innerHTML = '<p class="vazio">Faça um simulado para ver seu desempenho aqui.</p>'; return; }
  box.innerHTML = chaves.map(k => {
    const x = dados[k], p = pct(x.certos, x.total), c = classe(p);
    let tend = '';
    if (anterior && anterior[k]) {
      const pa = pct(anterior[k].certos, anterior[k].total);
      if (p > pa) tend = `<span class="tend up">▲ ${p - pa}</span>`;
      else if (p < pa) tend = `<span class="tend down">▼ ${pa - p}</span>`;
    }
    return `<div class="tema"><div class="lin"><span class="nm">${esc(k)} <span class="tag ${c.c}">${c.t}</span></span><span class="pc">${p}%${tend}</span></div>
      <div class="barra"><i class="${c.c}" data-w="${p}"></i></div>
      <small>${x.certos} certo(s) · ${x.errados} errado(s) · ${x.brancos} em branco${mostrarMateria && x.materia && x.materia !== k ? ' · ' + esc(x.materia) : ''}</small></div>`;
  }).join('');
  setTimeout(() => $$('.barra i[data-w]', box).forEach(i => { i.style.width = Math.max(3, i.dataset.w) + '%'; }), 150);
}

// matérias abaixo de 60% viram atalho de treino (as 3 piores)
function renderTreino(box, porMateria) {
  const fracas = Object.entries(porMateria || {}).map(([m, x]) => ({ m, p: pct(x.certos, x.total), x }))
    .filter(l => l.p < 60 && l.x.total >= 2).sort((a, b) => a.p - b.p).slice(0, 3);
  box.classList.toggle('oculto', !fracas.length);
  if (!fracas.length) return;
  box.innerHTML = `<h3>${ms('fitness_center')}Treine onde você perdeu pontos</h3>
    <p class="sub">20 questões só da matéria, sem limite de tentativas.</p>
    <div class="treinos">${fracas.map(l => `<button class="treino" data-treino="${esc(l.m)}">
      <span class="pc ${classe(l.p).c}">${l.p}%</span><b>${esc(l.m)}</b><small>${l.x.certos} de ${l.x.total} certas</small>
      <span class="ir">${ms('arrow_forward')}Treinar agora</span></button>`).join('')}</div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-treino]');
  if (!b || b.disabled) return;
  b.disabled = true;
  try {
    await api('/api/treino', { method: 'POST', body: { materia: b.dataset.treino } });
    location.href = '/prova';
  } catch (er) { toast(er.message, 'erro'); b.disabled = false; }
});

// pontos fortes e prioridades de estudo
function renderFoco(boxBem, boxMal, dados, dicas = {}) {
  const lista = Object.keys(dados || {}).map(k => ({ k, p: pct(dados[k].certos, dados[k].total), x: dados[k] }));
  const bem = lista.filter(l => l.p >= 60).sort((a, b) => b.p - a.p).slice(0, 4);
  const mal = lista.filter(l => l.p < 60).sort((a, b) => a.p - b.p).slice(0, 5);
  boxBem.innerHTML = bem.length ? bem.map(l => `<li><span class="n">${l.p}%</span><div><b>${esc(l.k)}</b><span>${l.x.certos} de ${l.x.total} certas. Revise de vez em quando para manter.</span></div></li>`).join('')
    : '<li><div><b>Ainda nada acima de 60%</b><span>Comece pelo gabarito comentado e refaça o treino por matéria.</span></div></li>';
  boxMal.innerHTML = mal.length ? mal.map(l => `<li><span class="n">${l.p}%</span><div><b>${esc(l.k)}</b><span>${esc(dicas[l.k] || `Faça o treino de ${l.x.materia || l.k} e releia a lei seca do tema.`)}</span></div></li>`).join('')
    : '<li><div><b>Nada abaixo de 60%</b><span>Excelente. Agora o foco é velocidade e constância.</span></div></li>';
}

// patentes (no lugar de nível/XP), inspiradas na carreira da guarda
const PATENTES = [
  { n: 'Aluno-guarda', xp: 0, ic: 'school' },
  { n: 'Guarda 3ª Classe', xp: 300, ic: 'shield' },
  { n: 'Guarda 2ª Classe', xp: 900, ic: 'shield_person' },
  { n: 'Guarda 1ª Classe', xp: 1800, ic: 'local_police' },
  { n: 'Guarda Classe Especial', xp: 3200, ic: 'verified_user' },
  { n: 'Subinspetor', xp: 5000, ic: 'military_tech' },
  { n: 'Inspetor', xp: 7500, ic: 'workspace_premium' },
  { n: 'Inspetor-Chefe', xp: 10500, ic: 'star' },
  { n: 'Comandante', xp: 15000, ic: 'crown' },
];
function xpDe(hist) { return hist.reduce((s, t) => s + t.certos * 10 + 40 + (t.violacoes === 0 ? 20 : 0), 0); }
function patenteDe(xp) {
  let i = 0;
  while (i + 1 < PATENTES.length && xp >= PATENTES[i + 1].xp) i++;
  return { atual: PATENTES[i], prox: PATENTES[i + 1] || null, i };
}

// confete nas cores da marca
function confete(dur = 2600) {
  const cv = document.createElement('canvas');
  cv.className = 'confete';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cores = ['#D4AF37', '#F0D27A', '#8f7424', '#E5E2E1', '#191919'];
  const ps = Array.from({ length: 150 }, () => ({ x: W / 2 + (Math.random() - .5) * 200, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cores[Math.random() * cores.length | 0] }));
  const ini = performance.now();
  (function quadro(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (t - ini < dur) requestAnimationFrame(quadro); else cv.remove();
  })(ini);
}

// imagens das questões ampliáveis
function ativarZoom(raiz = document) {
  let z = $('.zoom');
  if (!z) { z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = '<img alt="">'; document.body.appendChild(z); z.addEventListener('click', () => z.classList.remove('on')); }
  raiz.addEventListener('click', e => {
    const img = e.target.closest('.midia img');
    if (!img) return;
    $('img', z).src = img.src;
    z.classList.add('on');
  });
}
function htmlMidia(midia) {
  if (!midia || !midia.length) return '';
  return `<div class="midia">${midia.map(m => m.arquivo
    ? `<figure><img src="/midia/${encodeURIComponent(m.arquivo)}" alt="${esc(m.descricao || 'Imagem da questão')}" loading="lazy">${m.descricao ? `<figcaption>${esc(m.descricao)}</figcaption>` : ''}</figure>`
    : `<p class="origem">[${esc(m.tipo || 'mídia')}] ${esc(m.descricao || '')}</p>`).join('')}</div>`;
}

// fórmulas: o texto usa \( … \) (na linha) e \[ … \] (destacada); o KaTeX é carregado com defer
function mat(el) {
  if (!el) return;
  const f = () => window.renderMathInElement && renderMathInElement(el, {
    delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
    throwOnError: false
  });
  if (window.renderMathInElement) f(); else addEventListener('load', f, { once: true });
}

// botão claro/escuro no cabeçalho de cada página
// (um botão por cabeçalho: no /admin há o cartão de login E o topo do painel, e o painel também precisa do botão)
(function () {
  const cabs = [...document.querySelectorAll('.topo .in, .pbar .in, .auth-card')];
  if (!cabs.length) return;
  const botoes = [];
  const pintar = () => {
    const claro = document.documentElement.dataset.tema === 'claro';
    for (const b of botoes) {
      b.innerHTML = `<span class="ms">${claro ? 'dark_mode' : 'light_mode'}</span>`;
      b.title = b.ariaLabel = claro ? 'Mudar para modo escuro' : 'Mudar para modo claro';
    }
  };
  const trocar = () => {
    const claro = document.documentElement.dataset.tema !== 'claro';
    if (claro) document.documentElement.dataset.tema = 'claro'; else delete document.documentElement.dataset.tema;
    try { localStorage.setItem('tema', claro ? 'claro' : 'escuro'); } catch (e) {}
    pintar();
  };
  for (const cab of cabs) {
    if (cab.matches('.auth-card') && cabs.length > 1 && cab !== cabs[0]) continue;
    const b = document.createElement('button');
    b.className = 'btn btn-linha btn-sm tema-btn';
    b.type = 'button';
    b.addEventListener('click', trocar);
    if (cab.classList.contains('auth-card')) { b.style.cssText = 'position:absolute;top:14px;right:14px'; cab.style.position = 'relative'; }
    cab.appendChild(b);
    botoes.push(b);
  }
  pintar();
})();
