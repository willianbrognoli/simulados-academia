'use strict';
let ME, SIMS = [], HIST = [], DES = {}, agoraSrv = 0, desvio = 0;
let fTipo = '', fBusca = '', fUF = '', fBanca = '', limite = 24, escolhido = null, modoRank = 'primeira';

const TIPOS = {
  edital: { n: 'Edital', ic: 'campaign' },
  prova_real: { n: 'Prova real', ic: 'description' },
  banca: { n: 'Estilo banca', ic: 'account_balance' },
  materia: { n: 'Por matéria', ic: 'menu_book' },
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
  montarFiltros();
  montarCatalogo();
  renderBarras($('#materias'), DES.porMateria, null, false);
  renderFoco($('#bem'), $('#mal'), DES.porTema, DES.dicas);
  montarHistorico();
  montarRanking();
  montarMedalhas();
  revelar();
}

function montarHero() {
  if (ME.tentativaAberta) {
    $('#titulo').innerHTML = 'Você tem uma <em>missão em andamento</em>';
    $('#subtitulo').textContent = 'O cronômetro continua correndo mesmo com a página fechada.';
    $('#aberta').innerHTML = `<div class="aberta"><span class="ms" style="color:var(--ouro)">timer</span><b style="flex:1">${esc(ME.tentativaAberta.titulo)}</b><a class="btn btn-ouro btn-sm" href="/prova">Continuar</a></div>`;
    $('#bt-catalogo').classList.add('oculto');
  } else if (HIST.length) {
    $('#titulo').innerHTML = 'De volta à <em>linha de frente</em>';
  }
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

// ---------- catálogo ----------
function montarFiltros() {
  const ufs = [...new Set(SIMS.map(s => s.meta && s.meta.uf).filter(Boolean))].sort();
  const bancas = [...new Set(SIMS.map(s => s.meta && s.meta.banca).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('#f-uf').innerHTML += ufs.map(u => `<option>${esc(u)}</option>`).join('');
  $('#f-banca').innerHTML += bancas.map(b => `<option>${esc(b)}</option>`).join('');
  $('#f-tipo').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    fTipo = b.dataset.t; limite = 24;
    $$('#f-tipo button').forEach(x => x.classList.toggle('on', x === b));
    montarCatalogo();
  });
  let t;
  $('#f-busca').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { fBusca = e.target.value; limite = 24; montarCatalogo(); }, 200); });
  $('#f-uf').addEventListener('change', e => { fUF = e.target.value; limite = 24; montarCatalogo(); });
  $('#f-banca').addEventListener('change', e => { fBanca = e.target.value; limite = 24; montarCatalogo(); });
  $('#mais').addEventListener('click', () => { limite += 24; montarCatalogo(); });
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function montarCatalogo() {
  const q = norm(fBusca);
  const lista = SIMS.filter(s => (!fTipo || s.tipo === fTipo)
    && (!fUF || (s.meta && s.meta.uf) === fUF)
    && (!fBanca || (s.meta && s.meta.banca) === fBanca)
    && (!q || norm([s.titulo, s.subtitulo, s.meta && s.meta.banca, s.meta && s.meta.municipio].join(' ')).includes(q)));
  const box = $('#lista');
  if (!lista.length) {
    box.innerHTML = `<p class="vazio" style="grid-column:1/-1">${SIMS.length ? 'Nenhum simulado com esses filtros.' : 'Os simulados estão sendo preparados. Volte em breve!'}</p>`;
    $('#mais').classList.add('oculto');
    return;
  }
  box.innerHTML = lista.slice(0, limite).map(s => {
    const t = TIPOS[s.tipo] || TIPOS.livre;
    const aberto = ME.tentativaAberta && ME.tentativaAberta.slug === s.slug;
    const bloqueado = !aberto && s.proximaEm && new Date(s.proximaEm).getTime() > Date.now() - desvio;
    let botao = `<button class="btn btn-ouro btn-sm" data-s="${esc(s.slug)}">${ms('play_arrow')}Iniciar</button>`;
    if (aberto) botao = `<a class="btn btn-ouro btn-sm" href="/prova">${ms('timer')}Continuar</a>`;
    else if (bloqueado) botao = `<span class="tag">${ms('schedule')}Libera ${fmtData(s.proximaEm)}</span>`;
    return `<article class="sim ${s.destaque ? 'destaque' : ''}">
      <div class="tp"><span class="tag ouro">${ms(t.ic)}${t.n}</span>${s.erroAnula ? '<span class="tag">Certo/Errado</span>' : ''}${s.feitas ? `<span class="tag ok">feito ${s.feitas}x</span>` : ''}</div>
      <h4>${esc(s.titulo)}</h4>
      ${s.subtitulo ? `<p>${esc(s.subtitulo)}</p>` : ''}
      <div class="info"><span>${ms('quiz')}${s.itens} questões</span><span>${ms('timer')}${fmtDur(s.duracaoMin * 60)}</span>${s.melhor != null ? `<span>${ms('emoji_events')}melhor: ${s.melhor}</span>` : ''}</div>
      <div class="rodape"><small>${s.intervaloH ? `1 tentativa a cada ${s.intervaloH}h` : 'Sem limite de tentativas'}</small>${botao}</div>
    </article>`;
  }).join('');
  $('#mais').classList.toggle('oculto', lista.length <= limite);
}

$('#lista').addEventListener('click', e => {
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
    s.erroAnula ? 'Questões de certo/errado: <b>cada erro anula um acerto</b>. Na dúvida, deixe em branco.' : 'Questão em branco conta como erro na prática. Responda todas.',
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
