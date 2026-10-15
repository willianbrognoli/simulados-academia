'use strict';
/* Admin: montar simulados próprios (sorteio por matéria ou questões escolhidas a dedo) */
let SIMS_ADM = [], MAT_N = {}, form = null;
const novoForm = () => ({ slug: null, titulo: '', subtitulo: '', modo: 'cotas', cotas: {}, codigos: [], duracao_min: '', intervalo_h: 0, destaque: true, ativo: true, municipio: '' });

// "Pôr no simulado": junta questões ao simulado em montagem (modo questões escolhidas)
window.cesta = codigos => {
  if (!form) form = novoForm();
  form.modo = 'itens';
  const antes = form.codigos.length;
  for (const c of codigos) if (!form.codigos.includes(c)) form.codigos.push(c);
  toast(`${form.codigos.length - antes} questão(ões) adicionada(s). O simulado em montagem tem ${form.codigos.length}. Veja na aba Simulados.`, 'ok');
};

window.abrirSimulados = async () => {
  const [sims, r] = await Promise.all([adm('/api/admin/simulados'), adm('/api/admin/resumo')]);
  SIMS_ADM = sims;
  MAT_N = Object.fromEntries(r.materias.map(m => [m.nome, m.aprovadas]));
  listar();
  if (!form) form = novoForm();
  desenhar();
};

function listar() {
  $('#sim-lista').innerHTML = SIMS_ADM.length ? SIMS_ADM.map((s, i) => `
    <div class="adm-item${form && form.slug === s.slug ? ' on' : ''}" data-s="${i}">
      <div class="txt"><b>${esc(s.titulo)}</b>
      <span>${s.total_itens} questões · ${s.meta && s.meta.montado === 'itens' ? 'escolhidas a dedo' : 'sorteio por matéria'}</span>
      <small>${s.ativo ? 'No ar' : 'Fora do ar'}${s.destaque ? ' · em destaque' : ''}</small></div>
    </div>`).join('') : '<p class="vazio">Nenhum simulado montado ainda.</p>';
}

$('#sim-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (!b) return;
  const s = SIMS_ADM[Number(b.dataset.s)], r = s.regras || {};
  form = {
    slug: s.slug, titulo: s.titulo, subtitulo: s.subtitulo || '', modo: (s.meta && s.meta.montado) || 'cotas',
    cotas: r.cotas || {}, codigos: (s.meta && s.meta.codigos) || [], duracao_min: r.duracao_min || '',
    intervalo_h: r.intervalo_h || 0, destaque: s.destaque, ativo: s.ativo, municipio: (r.filtros && r.filtros.municipio) || '',
  };
  listar(); desenhar();
});
$('#sim-novo').addEventListener('click', () => { form = novoForm(); listar(); desenhar(); });

function desenhar() {
  const f = form, ld = (n, v) => `value="${esc(v ?? '')}" name="${n}"`;
  const soma = f.modo === 'cotas' ? Object.values(f.cotas).reduce((a, n) => a + (Number(n) || 0), 0) : f.codigos.length;
  $('#sim-form').innerHTML = `
    <div class="adm-cab"><div><b>${f.slug ? 'Editar simulado' : 'Novo simulado'}</b><div class="origem">Aparece no painel do aluno como "Simulado da Academia".</div></div></div>
    <label>Título<input ${ld('titulo', f.titulo)} placeholder="Ex.: Simulado GCM Cascavel 2026 — 1ª rodada"></label>
    <label>Subtítulo <small>(opcional)</small><input ${ld('subtitulo', f.subtitulo)} placeholder="Ex.: 60 questões no padrão do edital"></label>
    <div class="seg" id="sf-modo"><button data-m="cotas" class="${f.modo === 'cotas' ? 'on' : ''}">Sortear por matéria</button><button data-m="itens" class="${f.modo === 'itens' ? 'on' : ''}">Escolher questões</button></div>
    ${f.modo === 'cotas' ? `
      <p class="sub">Quantas questões de cada matéria. Cada aluno recebe um sorteio diferente.</p>
      <div class="sf-cotas">${TAX.map(m => `<label><span>${esc(m.nome)} <small>${MAT_N[m.nome] || 0} no ar</small></span>
        <input type="number" min="0" max="200" data-cota="${esc(m.nome)}" value="${f.cotas[m.nome] || ''}" placeholder="0"></label>`).join('')}</div>
      <label>Cidade <small>(só para incluir questões locais da cidade: História e Geografia Local, Legislação Municipal)</small><input ${ld('municipio', f.municipio)} placeholder="Ex.: Cascavel"></label>`
    : `
      <p class="sub">Todos os alunos recebem as mesmas questões, nesta ordem. Para adicionar, vá na aba <b>Questões</b>, busque e use <b>Pôr no simulado</b> (ou selecione várias e use ${ms('playlist_add')}).</p>
      <ol class="sf-itens">${f.codigos.map((c, i) => `<li><code>${esc(c)}</code><button data-tira="${i}" title="Tirar">${ms('close')}</button></li>`).join('') || '<li class="vazio">Nenhuma questão escolhida ainda.</li>'}</ol>`}
    <div class="adm-linha">
      <label>Duração (min) <small>vazio = 3 min/questão</small><input type="number" min="5" ${ld('duracao_min', f.duracao_min)}></label>
      <label>Intervalo entre tentativas (h) <small>0 = livre</small><input type="number" min="0" ${ld('intervalo_h', f.intervalo_h)}></label>
      <label>Total<input value="${soma} questões" disabled></label>
    </div>
    <label class="check"><input type="checkbox" name="destaque" ${f.destaque ? 'checked' : ''}> Mostrar em destaque no topo do painel</label>
    <label class="check"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''}> No ar (visível para os alunos)</label>
    <div class="adm-acoes"><button class="btn btn-ouro" id="sf-salvar">${ms('save')}Salvar simulado</button></div>
    <p class="adm-erro" id="sf-erro"></p>`;
}

function lerSim() {
  const v = n => { const el = $(`#sim-form [name=${n}]`); return el ? (el.type === 'checkbox' ? el.checked : el.value) : form[n]; };
  ['titulo', 'subtitulo', 'municipio', 'duracao_min', 'intervalo_h', 'destaque', 'ativo'].forEach(n => { form[n] = v(n); });
  $$('#sim-form [data-cota]').forEach(i => { form.cotas[i.dataset.cota] = Number(i.value) || 0; });
}

$('#sim-form').addEventListener('click', async e => {
  const m = e.target.closest('#sf-modo button');
  if (m) { lerSim(); form.modo = m.dataset.m; return desenhar(); }
  const t = e.target.closest('[data-tira]');
  if (t) { lerSim(); form.codigos.splice(Number(t.dataset.tira), 1); return desenhar(); }
  if (!e.target.closest('#sf-salvar')) return;
  lerSim();
  $('#sf-erro').textContent = '';
  try {
    const r = await adm('/api/admin/simulados', { method: 'POST', body: form });
    form.slug = r.slug;
    toast(`Simulado salvo com ${r.total_itens} questões disponíveis.`, 'ok');
    abrirSimulados();
  } catch (x) { $('#sf-erro').textContent = x.message; }
});
$('#sim-form').addEventListener('input', e => { if (e.target.dataset.cota !== undefined) { lerSim(); const t = $('#sim-form .adm-linha input[disabled]'); if (t) t.value = Object.values(form.cotas).reduce((a, n) => a + n, 0) + ' questões'; } });
