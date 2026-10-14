'use strict';
const qs = new URLSearchParams(location.search);
let R, filtro = 'todos';

['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
document.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ['c', 'p', 's', 'u'].includes(k)) { e.preventDefault(); toast('Ação bloqueada.', 'erro'); }
});

function mensagem(p) {
  if (p >= 80) return ['Desempenho de <em>aprovação!</em>', 'Nota de quem disputa as primeiras colocações. Agora é manter o ritmo e não errar o que você já domina.'];
  if (p >= 60) return ['Muito bem, você está <em>no caminho!</em>', 'Você já tem base. As prioridades abaixo são o atalho para subir a nota.'];
  if (p >= 40) return ['Bom começo, agora é <em>lapidar.</em>', 'Revise o gabarito comentado e faça o treino por matéria nos pontos fracos.'];
  return ['Todo aprovado <em>começou daqui.</em>', 'Comece pelas matérias prioritárias, releia a lei seca e volte para o próximo simulado.'];
}

async function carregar() {
  try {
    R = await api('/api/tentativas/' + encodeURIComponent(qs.get('id') || ''));
  } catch (e) {
    toast(e.message, 'erro');
    setTimeout(() => location.replace('/painel'), 1500);
    return;
  }
  const ap = pct(R.certos, R.total);
  const [tit, sub] = mensagem(ap);
  document.title = `Resultado · ${R.simulado.titulo}`;
  $('#r-sim').textContent = R.simulado.titulo;
  $('#r-tit').innerHTML = tit;
  $('#r-sub').textContent = sub;
  $('#r-data').textContent = `Feito em ${fmtData(R.iniciada_em)}${R.primeira ? ' · tentativa oficial do ranking' : ''}${R.erroAnula ? ' · nota líquida (erro anula acerto)' : ''}`;
  $('#r-stats').innerHTML = `
    <div class="v"><b>${R.certos}</b><span>Certas</span></div>
    <div class="r"><b>${R.errados}</b><span>Erradas</span></div>
    <div><b>${R.brancos}</b><span>Em branco</span></div>
    <div><b>${fmtDur(R.duracao_seg)}</b><span>Tempo</span></div>
    <div><b>${R.violacoes}/${R.maxSaidas}</b><span>Saídas</span></div>`;
  const avisos = {
    saidas: `Esta prova foi entregue automaticamente porque você saiu da tela ${R.maxSaidas} vezes.`,
    tempo: 'O tempo acabou e a prova foi entregue automaticamente.',
  };
  if (avisos[R.motivo_fim]) { $('#r-aviso').textContent = avisos[R.motivo_fim]; $('#r-aviso').classList.remove('oculto'); }
  anel($('#ring'), R.nota, R.total, R.erroAnula ? 'nota líquida' : 'acertos');
  renderBarras($('#materias'), R.por_materia, null, false);
  renderFoco($('#bem'), $('#mal'), R.por_tema, R.dicas);
  revisao();
  revelar();
  ativarZoom($('#revisao'));
  if (qs.get('novo') === '1') {
    history.replaceState(null, '', `/resultado?id=${R.id}`);
    if (ap >= 60) setTimeout(confete, 900);
  }
}

const situacao = q => !q.resposta ? 'branco' : q.resposta === q.gabarito ? 'acerto' : 'erro';

function revisao() {
  const lista = R.revisao.filter(q => filtro === 'todos' || situacao(q) === filtro);
  $('#revisao').innerHTML = lista.length ? lista.map(q => {
    const s = situacao(q), ce = q.formato === 'CE';
    const selo = s === 'acerto' ? '<span class="tag ok">✓ Você acertou</span>'
      : s === 'erro' ? `<span class="tag bad">✗ Você errou${R.erroAnula ? ' (−1)' : ''}</span>` : '<span class="tag">Em branco</span>';
    const alts = Object.entries(q.alternativas).sort(([a], [b]) => ce ? (a === 'C' ? -1 : 1) : a.localeCompare(b)).map(([k, v]) => {
      const cl = k === q.gabarito ? 'gab' : (k === q.resposta ? 'marcou-errado' : '');
      return `<div class="alt ${cl}"><span class="k">${k}</span><span>${esc(ce ? (k === 'C' ? 'Certo' : 'Errado') : v)}</span></div>`;
    }).join('');
    return `<article class="rev ${s}">
      <div class="gb"><b>Questão ${q.n}</b><span class="tag ouro">${esc(q.materia || '')}</span>${q.tema ? `<span class="tag">${esc(q.tema)}</span>` : ''}${selo}</div>
      <div class="origem">${esc(q.origem)}</div>
      ${q.textoBase ? `<details class="textobase"><summary>Texto de apoio</summary><div>${esc(q.textoBase)}</div></details>` : ''}
      <p class="enun">${esc(q.enunciado)}</p>
      ${htmlMidia(q.midia)}
      <div class="alts ${ce ? 'ce' : ''}">${alts}</div>
      <div class="coment">${q.comentario ? `<b>Comentário:</b> ${esc(q.comentario)}` : '<b>Comentário:</b> em produção pela equipe da Academia.'}</div>
    </article>`;
  }).join('') : '<p class="vazio">Nenhuma questão nesta categoria.</p>';
  mat($('#revisao'));
}

$('#filtros').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  filtro = b.dataset.f;
  $$('#filtros button').forEach(x => x.classList.toggle('on', x === b));
  revisao();
});

carregar();
