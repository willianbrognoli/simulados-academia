'use strict';
let ME, SIMS = [], HIST = [], DES = {}, agoraSrv = 0, desvio = 0;
let fTipo = 'materia', ufSel = '', busca = '', escolhido = null, modoRank = 'primeira';

const TIPOS = {
  edital: { n: 'Edital', ic: 'campaign' },
  prova_real: { n: 'Prova real', ic: 'description' },
  banca: { n: 'Estilo banca', ic: 'account_balance' },
  materia: { n: 'Por matéria', ic: 'menu_book' },
  tema: { n: 'Por tema', ic: 'label' },
  livre: { n: 'Treino', ic: 'bolt' },
};

$('#sair').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', semRedirect: true }).catch(() => {});
  location.href = '/';
});
$$('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.remove('on')));
$('#ck-regras').addEventListener('change', e => { $('#bt-comecar').disabled = !e.target.checked; });

async function carregar() {
  const [me, sims, hist, des] = await Promise.all([api('/api/me'), api('/api/simulados'), api('/api/tentativas'), api('/api/desempenho')]);
  ME = me; SIMS = sims.simulados; HIST = hist; DES = des;
  agoraSrv = new Date(sims.agora).getTime(); desvio = Date.now() - agoraSrv;
  $('#ola').innerHTML = `Olá, <b>${esc(ME.nome.split(' ')[0])}</b>`;
  montarHero();
  montarPatente();
  montarMapa();
  montarAcademia();
  montarCatalogo();
  if (!ME.tentativaAberta) renderTreino($('#treino'), DES.porMateria);
  renderBarras($('#materias'), DES.porMateria, null, false);
  renderFoco($('#bem'), $('#mal'), DES.porTema, DES.dicas);
  montarHistorico();
  montarRanking();
  montarMedalhas();
}

function montarHero() {
  if (!ME.tentativaAberta) return;
  $('#aberta').innerHTML = `<a class="aberta" href="/prova"><span class="ms">timer</span><span><b>${esc(ME.tentativaAberta.titulo)}</b> está em andamento. O cronômetro continua correndo.</span><span class="btn btn-ouro btn-sm">Continuar</span></a>`;
}

function montarPatente() {
  const xp = xpDe(HIST), p = patenteDe(xp);
  $('#ins').innerHTML = ms(p.atual.ic);
  $('#pat').textContent = p.atual.n;
  $('#xp-txt').textContent = p.prox ? `${xp} XP · faltam ${p.prox.xp - xp} para ${p.prox.n}` : `${xp} XP · patente máxima`;
  const fr = p.prox ? (xp - p.atual.xp) / (p.prox.xp - p.atual.xp) : 1;
  setTimeout(() => { $('#xp-bar').style.width = Math.max(4, fr * 100) + '%'; }, 300);
  const resp = HIST.reduce((s, t) => s + t.certos + t.errados, 0);
  const cert = HIST.reduce((s, t) => s + t.certos, 0);
  contar($('#k-qtd'), HIST.length);
  contar($('#k-resp'), resp);
  contar($('#k-apr'), pct(cert, resp), 1200, '%');
  contar($('#k-mat'), Object.keys(DES.porMateria || {}).length);
}

// ---------- mapa: estado → cidades → provas ----------
// posição de cada UF numa grade (cartograma do Brasil)
const GRADE = {
  RR: [2, 0], AP: [4, 0],
  AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], AL: [6, 3],
  SP: [2, 4], MG: [3, 4], ES: [4, 4], SE: [5, 4],
  PR: [2, 5], RJ: [3, 5],
  SC: [2, 6],
  RS: [2, 7],
};
const REGIOES = {
  Sul: ['PR', 'SC', 'RS'], Sudeste: ['SP', 'RJ', 'MG', 'ES'], 'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Nordeste: ['BA', 'PE', 'CE', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI'], Norte: ['PA', 'AM', 'RO', 'TO', 'AC', 'AP', 'RR'],
};
const NOME_UF = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let CIDADES = new Map(); // uf -> Map(cidade -> [simulados])

function montarMapa() {
  CIDADES = new Map();
  for (const s of SIMS.filter(x => x.tipo === 'prova_real' && x.meta && x.meta.uf)) {
    const uf = s.meta.uf, cid = s.meta.municipio || NOME_UF[uf] || uf;
    if (!CIDADES.has(uf)) CIDADES.set(uf, new Map());
    const m = CIDADES.get(uf);
    if (!m.has(cid)) m.set(cid, []);
    m.get(cid).push(s);
  }
  $('#brasil').innerHTML = Object.entries(GRADE).map(([uf, [x, y]], i) => {
    const n = CIDADES.has(uf) ? CIDADES.get(uf).size : 0;
    return `<button class="uf" data-uf="${uf}" style="grid-column:${x + 1};grid-row:${y + 1};--i:${i}" ${n ? '' : 'disabled'}
      title="${NOME_UF[uf]}: ${n} ${n === 1 ? 'cidade' : 'cidades'}"><b>${uf}</b><small>${n || '–'}</small></button>`;
  }).join('');
  $('#regioes').innerHTML = Object.keys(REGIOES).map(r => `<button data-r="${r}">${r}</button>`).join('');
  let salvo = ''; try { salvo = localStorage.getItem('uf') || ''; } catch (e) {}
  const maior = [...CIDADES.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  escolherUF(CIDADES.has(salvo) ? salvo : (maior ? maior[0] : ''), false);
}

function escolherUF(uf, rolar = true) {
  ufSel = uf; busca = ''; cidadeAberta = ''; $('#f-cidade').value = '';
  try { localStorage.setItem('uf', uf); } catch (e) {}
  $$('#brasil .uf').forEach(b => b.classList.toggle('on', b.dataset.uf === uf));
  const reg = Object.keys(REGIOES).find(r => REGIOES[r].includes(uf));
  $$('#regioes button').forEach(b => b.classList.toggle('on', b.dataset.r === reg));
  $('#brasil').dataset.regiao = reg || '';
  $$('#brasil .uf').forEach(b => b.classList.toggle('reg', !!reg && REGIOES[reg].includes(b.dataset.uf)));
  listarCidades();
  if (rolar) $('#cidades').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function listarCidades() {
  let grupos;
  if (busca) {
    const q = norm(busca);
    grupos = [...CIDADES.entries()].flatMap(([uf, m]) => [...m.entries()].filter(([c]) => norm(c).includes(q)).map(([c, l]) => [c, l, uf]));
  } else {
    grupos = [...(CIDADES.get(ufSel) || new Map()).entries()].map(([c, l]) => [c, l, ufSel]);
  }
  grupos.sort((a, b) => a[0].localeCompare(b[0]));
  const tit = busca ? `Cidades com “${esc(busca)}”` : esc(NOME_UF[ufSel] || 'Escolha um estado');
  const nProvas = grupos.reduce((n, g) => n + g[1].length, 0);
  const abrir = grupos.length === 1 ? grupos[0][0] : cidadeAberta;
  $('#cidades').innerHTML = `<header class="cid-cab"><h2>${tit}</h2><span>${grupos.length} ${grupos.length === 1 ? 'cidade' : 'cidades'}, ${nProvas} ${nProvas === 1 ? 'prova' : 'provas'}</span></header>
    ${grupos.length ? `<div class="cid-lista">${grupos.map(([c, l, uf]) => `<button class="cid${c === abrir ? ' on' : ''}" data-cid="${esc(c)}" aria-expanded="${c === abrir}">
        ${esc(c)}${busca ? ` <small>${uf}</small>` : ''}<span>${l.length}</span></button>`).join('')}</div>
      <div id="cid-provas"></div>`
    : `<p class="vazio">Nenhuma cidade encontrada. Tente outro nome ou escolha o estado no mapa.</p>`}`;
  GRUPOS = grupos;
  if (abrir) abrirCidade(abrir);
}

let GRUPOS = [], cidadeAberta = '';
function abrirCidade(c) {
  const g = GRUPOS.find(x => x[0] === c);
  if (!g) return;
  cidadeAberta = c;
  $$('#cidades .cid').forEach(b => { const on = b.dataset.cid === c; b.classList.toggle('on', on); b.setAttribute('aria-expanded', on); });
  $('#cid-provas').innerHTML = `<article class="cidade"><h3>${esc(c)} <small>${g[2]}</small></h3>
    <ul>${g[1].sort((a, b) => (b.meta.ano || 0) - (a.meta.ano || 0)).map(linhaProva).join('')}</ul></article>`;
}
$('#cidades').addEventListener('click', e => {
  const b = e.target.closest('.cid'); if (!b) return;
  if (b.dataset.cid === cidadeAberta) { cidadeAberta = ''; b.classList.remove('on'); $('#cid-provas').innerHTML = ''; return; }
  abrirCidade(b.dataset.cid);
  $('#cid-provas').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function botaoSim(s) {
  const aberto = ME.tentativaAberta && ME.tentativaAberta.slug === s.slug;
  if (aberto) return `<a class="btn btn-ouro btn-sm" href="/prova">Continuar</a>`;
  if (s.proximaEm && new Date(s.proximaEm).getTime() > Date.now() - desvio) return `<span class="libera" title="1 tentativa a cada ${s.intervaloH}h">Libera ${fmtData(s.proximaEm)}</span>`;
  return `<button class="btn btn-linha btn-sm" data-s="${esc(s.slug)}">${s.feitas ? 'Refazer' : 'Fazer'}</button>`;
}

function linhaProva(s) {
  const extra = [s.meta.banca, s.subtitulo && s.subtitulo.split(' · ').slice(1).join(', ')].filter(Boolean).join(', ');
  return `<li><span class="ano">${esc(s.meta.ano || '')}</span>
    <span class="dados"><b>${esc(extra || 'Prova')}</b><small>${s.itens} questões em ${fmtDur(s.duracaoMin * 60)}${s.melhor != null ? `, sua melhor nota: ${s.melhor}` : ''}</small></span>
    ${botaoSim(s)}</li>`;
}

$('#brasil').addEventListener('click', e => { const b = e.target.closest('.uf'); if (b) escolherUF(b.dataset.uf); });
$('#regioes').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const uf = REGIOES[b.dataset.r].filter(u => CIDADES.has(u)).sort((a, c) => CIDADES.get(c).size - CIDADES.get(a).size)[0];
  if (uf) escolherUF(uf);
});
let tBusca;
$('#f-cidade').addEventListener('input', e => { clearTimeout(tBusca); tBusca = setTimeout(() => { busca = e.target.value.trim(); listarCidades(); }, 150); });

// simulados montados pela Academia (tipo edital) ficam em destaque acima das cidades
function montarAcademia() {
  const l = SIMS.filter(s => s.tipo === 'edital');
  const box = $('#academia');
  box.classList.toggle('oculto', !l.length);
  box.innerHTML = l.length ? `<h2>Simulados da Academia</h2><div class="acad">${l.map(s => `<article>
    <div><b>${esc(s.titulo)}</b>${s.subtitulo ? `<p>${esc(s.subtitulo)}</p>` : ''}<small>${s.itens} questões em ${fmtDur(s.duracaoMin * 60)}</small></div>
    ${botaoSim(s).replace('btn-linha', 'btn-ouro')}</article>`).join('')}</div>` : '';
}

// ---------- treinos por matéria, tema e banca ----------
$('#f-tipo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  fTipo = b.dataset.t;
  $$('#f-tipo button').forEach(x => x.classList.toggle('on', x === b));
  montarCatalogo();
});

function linhaTreino(s, nome) {
  return `<li><span class="dados"><b>${esc(nome || s.titulo)}</b><small>${s.itens} questões${s.feitas ? `, feito ${s.feitas}x` : ''}</small></span>${botaoSim(s)}</li>`;
}

function montarCatalogo() {
  const l = SIMS.filter(s => s.tipo === fTipo);
  const box = $('#lista');
  if (!l.length) { box.innerHTML = '<p class="vazio">Os treinos estão sendo preparados.</p>'; return; }
  if (fTipo === 'tema') {
    const por = new Map();
    for (const s of l) { const m = (s.meta && s.meta.materia) || 'Outros'; if (!por.has(m)) por.set(m, []); por.get(m).push(s); }
    box.innerHTML = `<div class="temas-grupos">${[...por.entries()].map(([m, x]) => `<details><summary>${esc(m)} <small>${x.length} temas</small></summary>
      <ul class="linhas">${x.sort((a, b) => a.titulo.localeCompare(b.titulo)).map(s => linhaTreino(s)).join('')}</ul></details>`).join('')}</div>`;
    return;
  }
  box.innerHTML = `<ul class="linhas col2">${l.sort((a, b) => a.titulo.localeCompare(b.titulo)).map(s => linhaTreino(s, fTipo === 'banca' ? s.titulo.replace(/^Estilo /, '') : null)).join('')}</ul>`;
}

// qualquer botão "Fazer" abre as regras do simulado
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-s]');
  if (!b) return;
  if (ME.tentativaAberta) return toast('Termine ou entregue o simulado em andamento antes de começar outro.', 'erro');
  escolhido = SIMS.find(s => s.slug === b.dataset.s);
  const s = escolhido;
  $('#mr-tit').textContent = s.titulo;
  $('#mr-sub').textContent = s.subtitulo || '';
  $('#mr-regras').innerHTML = [
    `<b>${s.itens} questões</b> e <b>${fmtDur(s.duracaoMin * 60)}</b> de prova. O cronômetro corre mesmo se você fechar a página.`,
    `A prova abre em <b>tela cheia</b>. Trocar de aba, minimizar ou sair da tela cheia conta como saída: <b>na ${s.maxSaidas}ª, a prova é entregue</b>.`,
    s.erroAnula ? 'Questões de certo/errado: <b>cada erro anula um acerto</b>. Na dúvida, deixe em branco.' : 'Questão em branco não pontua. Responda todas.',
    s.intervaloH ? `Depois de começar, a próxima tentativa deste simulado libera em <b>${s.intervaloH} horas</b>.` : 'Você pode refazer este treino quando quiser.',
  ].map(x => `<li>${x}</li>`).join('');
  $('#ck-regras').checked = false;
  $('#bt-comecar').disabled = true;
  $('#m-regras').classList.add('on');
});

$('#bt-comecar').addEventListener('click', async () => {
  const b = $('#bt-comecar');
  b.disabled = true;
  try {
    await api(`/api/simulados/${encodeURIComponent(escolhido.slug)}/tentativas`, { method: 'POST' });
    location.href = '/prova';
  } catch (e) {
    toast(e.message, 'erro');
    b.disabled = false;
  }
});

// ---------- histórico ----------
function montarHistorico() {
  if (!HIST.length) return;
  const motivo = { entregue: 'Entregue', tempo: 'Tempo esgotado', saidas: 'Encerrada por saídas' };
  $('#hist').innerHTML = HIST.slice().reverse().slice(0, 15).map(t => `<a href="/resultado?id=${t.id}">
    <span class="nt">${t.nota}<small style="font-size:12px;color:var(--txt3)">/${t.total}</small></span>
    <span class="mt"><b>${esc(t.titulo)}${t.primeira ? ' <span class="tag ouro">oficial</span>' : ''}</b>
    <span>${fmtData(t.iniciada_em)} · ${t.certos} certas, ${t.errados} erradas · ${fmtDur(t.duracao_seg)} · ${motivo[t.motivo_fim] || ''}</span></span>
    ${ms('chevron_right')}</a>`).join('');
}

// ---------- ranking ----------
function montarRanking() {
  const feitos = [...new Map(HIST.map(t => [t.slug, t.titulo])).entries()];
  const sel = $('#rk-sim');
  if (!feitos.length) { sel.innerHTML = '<option>Nenhum simulado feito ainda</option>'; sel.disabled = true; return; }
  sel.innerHTML = feitos.reverse().map(([s, t]) => `<option value="${esc(s)}">${esc(t)}</option>`).join('');
  sel.addEventListener('change', carregarRanking);
  $('#rk-modo').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    modoRank = b.dataset.m;
    $$('#rk-modo button').forEach(x => x.classList.toggle('on', x === b));
    carregarRanking();
  });
  carregarRanking();
}
async function carregarRanking() {
  const tb = $('#rank');
  try {
    const r = await api(`/api/ranking?simulado=${encodeURIComponent($('#rk-sim').value)}&modo=${modoRank}`);
    const linha = (l, extra = '') => `<tr class="${l.eu ? 'eu' : ''} ${extra}"><td><span class="pos ${l.pos <= 3 ? 'p' + l.pos : ''}">${l.pos}</span></td><td>${esc(l.nome)}${l.eu ? ' <span class="tag ouro">você</span>' : ''}</td><td><b>${l.nota}</b>/${l.total}</td><td>${fmtDur(l.duracao_seg)}</td></tr>`;
    tb.innerHTML = r.lista.length ? r.lista.map(l => linha(l)).join('') : '<tr><td colspan="4" class="vazio">Ninguém concluiu ainda.</td></tr>';
    if (r.eu && !r.lista.some(l => l.eu)) tb.innerHTML += linha(r.eu, 'sep');
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="4" class="vazio">${esc(e.message)}</td></tr>`;
  }
}

// ---------- condecorações ----------
function montarMedalhas() {
  const h = HIST, ap = t => pct(t.certos, t.total);
  const melhor = h.length ? Math.max(...h.map(ap)) : 0;
  const tipos = new Set(h.map(t => t.tipo));
  const lista = [
    { i: 'flag', n: 'Primeira missão', d: 'Concluiu o 1º simulado', on: h.length >= 1 },
    { i: 'military_tech', n: 'Bronze', d: '50%+ em um simulado', on: melhor >= 50 },
    { i: 'military_tech', n: 'Prata', d: '70%+ em um simulado', on: melhor >= 70 },
    { i: 'military_tech', n: 'Ouro', d: '85%+ em um simulado', on: melhor >= 85 },
    { i: 'shield', n: 'Prova limpa', d: 'Sem sair da tela', on: h.some(t => t.violacoes === 0) },
    { i: 'local_fire_department', n: 'Constância', d: '5 simulados feitos', on: h.length >= 5 },
    { i: 'description', n: 'Prova real', d: 'Refez uma prova completa', on: tipos.has('prova_real') },
    { i: 'account_balance', n: 'Conhece a banca', d: 'Fez um estilo banca', on: tipos.has('banca') },
    { i: 'menu_book', n: 'Foco total', d: 'Fez um treino por matéria', on: tipos.has('materia') },
    { i: 'trending_up', n: 'Em evolução', d: 'Superou o 1º aproveitamento', on: h.length >= 2 && ap(h[h.length - 1]) > ap(h[0]) },
  ];
  $('#badges').innerHTML = lista.map(b => `<div class="bdg ${b.on ? 'on' : ''}" title="${esc(b.d)}">${ms(b.i)}<b>${esc(b.n)}</b><span>${esc(b.d)}</span></div>`).join('');
  $('#bdg-sub').textContent = `${lista.filter(b => b.on).length} de ${lista.length} condecorações conquistadas.`;
}

carregar().catch(e => toast(e.message, 'erro'));
