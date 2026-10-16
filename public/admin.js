'use strict';
/* Painel de revisão (administração): fila de questões + editor */
const POR_PAG = 50;
let TAX = [], ITENS = [], total = 0, offset = 0, atual = null;
const opt = (v, txt, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(txt ?? v)}</option>`;
const adm = (url, o = {}) => api(url, { ...o, semRedirect: true });

async function iniciar() {
  try { TAX = await adm('/api/admin/taxonomia'); } catch (e) { if (e.status === 401) return mostrarLogin(); throw e; }
  $('#tela-login').classList.add('oculto');
  $('#tela-painel').classList.remove('oculto');
  $('#f-materia').innerHTML = opt('', 'Todas as matérias') + TAX.map(m => opt(m.nome)).join('');
  resumo();
  carregar();
}

function mostrarLogin() {
  $('#tela-painel').classList.add('oculto');
  $('#tela-login').classList.remove('oculto');
  $('#f-login input').focus();
}

$('#f-login').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-erro').textContent = '';
  try {
    await adm('/api/admin/login', { method: 'POST', body: { senha: e.target.senha.value } });
    e.target.reset();
    iniciar();
  } catch (x) { $('#login-erro').textContent = x.message; }
});
$('#sair').addEventListener('click', async () => { await adm('/api/admin/logout', { method: 'POST' }); mostrarLogin(); });

async function resumo() {
  const r = await adm('/api/admin/resumo');
  const n = s => (r.itens.find(x => x.status === s) || {}).n || 0;
  const porTipo = {};
  for (const s of r.simulados) if (s.ativo) porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1;
  const com = Object.fromEntries((r.comentarios || []).map(c => [c.status, c.n]));
  $('#resumo').textContent = `${n('aprovada')} no ar · ${n('revisar')} para revisar · ${n('removida')} removidas · ${porTipo.tema || 0} simulados por tema`;
  $('#resumo').title = 'Simulados ativos: ' + Object.entries(porTipo).map(([t, q]) => `${t} ${q}`).join(', ') +
    `\nComentários nas aprovadas: IA aprovado ${com.ia_aprovado || 0}, IA para revisar ${com.ia_revisar || 0}, equipe ${com.humano || 0}, antigos ${com.antigo || 0}, sem comentário ${com.sem || 0}`;
}

$('#gerar').addEventListener('click', async e => {
  if (!confirm('Gerar o catálogo automático agora? Os simulados existentes são atualizados; tentativas e ranking não são apagados.')) return;
  const b = e.currentTarget; b.disabled = true;
  try {
    const r = await adm('/api/admin/simulados/gerar', { method: 'POST', body: {} });
    toast(`Catálogo gerado: ${r.simulados} simulados automáticos.`, 'ok');
    resumo();
  } catch (x) { toast(x.message, 'erro'); }
  b.disabled = false;
});

async function carregar() {
  const q = new URLSearchParams({ status: $('#f-status').value, limite: POR_PAG, offset });
  if ($('#f-materia').value) q.set('materia', $('#f-materia').value);
  if ($('#f-coment').value) q.set('comentario', $('#f-coment').value);
  if ($('#f-q').value.trim()) q.set('q', $('#f-q').value.trim());
  $('#lista').innerHTML = '<p class="vazio">Carregando…</p>';
  const r = await adm('/api/admin/itens?' + q);
  ITENS = r.itens; total = r.total;
  $('#contagem').textContent = `${total} questões`;
  $('#pag').textContent = total ? `${offset + 1}–${Math.min(offset + POR_PAG, total)}` : '';
  $('#ant').disabled = offset === 0;
  $('#prox').disabled = offset + POR_PAG >= total;
  SEL.clear(); marcarLote();
  $('#lista').innerHTML = ITENS.length ? ITENS.map((it, i) => `
    <div class="adm-item${atual && atual.codigo === it.codigo ? ' on' : ''}" data-i="${i}">
      <input type="checkbox" class="sel" aria-label="Selecionar ${esc(it.codigo)}">
      <div class="txt"><b>${esc(it.codigo)}</b>
      <span>${esc(it.materia || 'sem matéria')}${it.tema ? ' › ' + esc(it.tema) : ''}</span>
      <small>${esc((it.enunciado || '').replace(/__/g, '').slice(0, 110))}…</small></div>
      <div class="rap">${it.status !== 'aprovada' ? `<button data-rap="aprovada" title="Aprovar">${ms('check')}</button>` : ''}${it.status !== 'removida' ? `<button data-rap="removida" title="Tirar">${ms('block')}</button>` : ''}</div>
    </div>`).join('') : '<p class="vazio">Nenhuma questão aqui.</p>';
}

// ---- seleção em lote e ações rápidas ----
const SEL = new Set();
function marcarLote() {
  ['#lote-aprovar', '#lote-tirar', '#lote-cesta'].forEach(s => { $(s).disabled = !SEL.size; });
  $('#sel-todas').checked = SEL.size && SEL.size === ITENS.length;
  $('#contagem').textContent = SEL.size ? `${SEL.size} selecionada(s)` : `${total} questões`;
}
$('#sel-todas').addEventListener('change', e => {
  SEL.clear();
  $$('#lista .sel').forEach((c, i) => { c.checked = e.target.checked; if (c.checked) SEL.add(ITENS[i].codigo); });
  marcarLote();
});
async function lote(codigos, status) {
  let motivo;
  if (status === 'removida') { motivo = prompt('Motivo (ex.: anulada, lei alterada, depende de imagem, erro na prova):', 'erro na questão'); if (motivo === null) return; }
  const r = await adm('/api/admin/itens/lote', { method: 'POST', body: { codigos, status, motivo_remocao: motivo } });
  toast(`${r.alterados} questão(ões) ${status === 'aprovada' ? 'aprovada(s)' : 'tirada(s) do ar'}${r.semGabarito ? ` · ${r.semGabarito} sem gabarito ficaram de fora` : ''}.`, 'ok');
  resumo(); carregar();
}
$('#lote-aprovar').addEventListener('click', () => lote([...SEL], 'aprovada'));
$('#lote-tirar').addEventListener('click', () => lote([...SEL], 'removida'));
$('#lote-cesta').addEventListener('click', () => { window.cesta && window.cesta([...SEL]); });

$('#lista').addEventListener('click', e => {
  const b = e.target.closest('.adm-item');
  if (!b) return;
  const it = ITENS[Number(b.dataset.i)];
  if (e.target.classList.contains('sel')) { e.target.checked ? SEL.add(it.codigo) : SEL.delete(it.codigo); return marcarLote(); }
  const rap = e.target.closest('[data-rap]');
  if (rap) return lote([it.codigo], rap.dataset.rap);
  $$('.adm-item').forEach(x => x.classList.toggle('on', x === b));
  editar(ITENS[Number(b.dataset.i)]);
});
let tBusca;
$('#f-q').addEventListener('input', () => { clearTimeout(tBusca); tBusca = setTimeout(() => { offset = 0; carregar(); }, 350); });
$('#f-status').addEventListener('change', () => { offset = 0; carregar(); });
$('#f-materia').addEventListener('change', () => { offset = 0; carregar(); });
$('#f-coment').addEventListener('change', () => { offset = 0; carregar(); });
$('#ant').addEventListener('click', () => { offset = Math.max(0, offset - POR_PAG); carregar(); });
$('#prox').addEventListener('click', () => { offset += POR_PAG; carregar(); });

function temasDe(materia) { return (TAX.find(m => m.nome === materia) || {}).temas || []; }

function editar(it) {
  atual = it;
  const ce = it.formato === 'CE';
  const letras = ce ? ['C', 'E'] : ['A', 'B', 'C', 'D', 'E'];
  const alt = it.alternativas || {};
  const origem = [it.banca, [it.municipio, it.uf].filter(Boolean).join('/'), it.ano, it.numero_original && `questão ${it.numero_original}`].filter(Boolean).join(' · ');
  $('#editor').innerHTML = `
    <div class="adm-cab">
      <div><b>${esc(it.codigo)}</b><div class="origem">${esc(origem)}</div></div>
      <span class="tag ${it.status === 'aprovada' ? 'ok' : it.status === 'removida' ? 'bad' : 'mid'}">${esc(it.status)}</span>
    </div>
    ${(it.alertas || []).length ? `<ul class="adm-alertas">${it.alertas.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    ${it.motivo_remocao ? `<p class="sub">Motivo da remoção: ${esc(it.motivo_remocao)}</p>` : ''}
    ${it.texto_base ? `<details class="textobase"><summary>Texto de apoio</summary><div>${fmt(it.texto_base)}</div></details>` : ''}
    <label>Enunciado <small>(destaque: __trecho__ · fórmula: \\( x^2 \\))</small><textarea id="e-enun" rows="7">${esc(it.enunciado)}</textarea></label>
    ${ce ? '' : `<div class="adm-alts">${letras.map(k => `<label>${k}<textarea data-k="${k}" rows="2">${esc(alt[k] || '')}</textarea></label>`).join('')}</div>`}
    <div class="adm-linha">
      <label>Gabarito<select id="e-gab">${opt('', '— sem gabarito —', !it.gabarito)}${letras.map(k => opt(k, k, it.gabarito === k)).join('')}</select></label>
      <label>Matéria<select id="e-mat">${opt('', '—', !it.materia)}${TAX.map(m => opt(m.nome, m.nome, m.nome === it.materia)).join('')}</select></label>
      <label>Tema<select id="e-tema"></select></label>
    </div>
    <label>Comentário para o aluno ${{ ia_revisar: '<span class="tag mid">IA, aguardando revisão</span>', ia_aprovado: '<span class="tag ok">IA, aprovado automaticamente</span>', humano: '<span class="tag">revisado pela equipe</span>' }[it.comentario_status] || ''}
      ${it.comentario_nota ? `<small class="coment-nota">Por que veio para revisão: ${esc(it.comentario_nota)}</small>` : ''}
      <textarea id="e-com" rows="6">${esc(it.comentario || '')}</textarea>
      <small>Ao salvar, o comentário passa a valer como revisado pela equipe e aparece para o aluno.</small></label>
    <div class="adm-acoes">
      <button class="btn btn-ouro" data-a="aprovar"><span class="ms">check_circle</span>Salvar e aprovar</button>
      <button class="btn btn-linha" data-a="salvar"><span class="ms">save</span>Salvar</button>
      <button class="btn btn-linha" data-a="revisar"><span class="ms">flag</span>Deixar para revisar</button>
      <button class="btn btn-linha adm-rem" data-a="remover"><span class="ms">delete</span>Remover</button>
      <button class="btn btn-linha" data-a="cesta"><span class="ms">playlist_add</span>Pôr no simulado</button>
    </div>
    <p class="adm-erro" id="e-erro"></p>
    <h3 class="adm-prev-t"><span class="ms">visibility</span>Como o aluno vê</h3>
    <div class="qcard adm-prev" id="prev"></div>`;
  const pintarTemas = () => {
    const ts = temasDe($('#e-mat').value);
    $('#e-tema').innerHTML = opt('', '—') + ts.map(t => opt(t, t, t === it.tema)).join('');
  };
  pintarTemas();
  $('#e-mat').addEventListener('change', pintarTemas);
  $('#editor').addEventListener('input', previa);
  previa();
}

function lerForm() {
  const alternativas = {};
  $$('#editor .adm-alts textarea').forEach(t => { if (t.value.trim()) alternativas[t.dataset.k] = t.value.trim(); });
  return {
    enunciado: $('#e-enun').value,
    alternativas: atual.formato === 'CE' ? undefined : alternativas,
    gabarito: $('#e-gab').value || null,
    materia: $('#e-mat').value || undefined,
    tema: $('#e-tema').value || null,
    comentario: $('#e-com').value.trim() || null,
  };
}

function previa() {
  const f = lerForm();
  const alts = atual.formato === 'CE' ? { C: 'Certo', E: 'Errado' } : f.alternativas;
  $('#prev').innerHTML = `<div class="qbody"><p class="enun">${fmt(f.enunciado)}</p><div class="alts">${Object.entries(alts).map(([k, v]) =>
    `<div class="alt${k === f.gabarito ? ' on' : ''}"><span class="k">${k}</span><span>${fmt(v)}</span></div>`).join('')}</div></div>`;
  mat($('#prev'));
}

$('#editor').addEventListener('click', async e => {
  const b = e.target.closest('[data-a]');
  if (!b || !atual) return;
  const a = b.dataset.a;
  if (a === 'cesta') return window.cesta && window.cesta([atual.codigo]);
  const corpo = lerForm();
  if (a === 'aprovar') {
    if (!corpo.gabarito) return ($('#e-erro').textContent = 'Defina o gabarito antes de aprovar.');
    corpo.status = 'aprovada';
  }
  if (a === 'revisar') corpo.status = 'revisar';
  if (a === 'remover') {
    const motivo = prompt('Motivo da remoção (ex.: anulada, lei alterada, depende de imagem, erro na prova):', 'erro na questão');
    if (motivo === null) return;
    corpo.status = 'removida'; corpo.motivo_remocao = motivo || 'outro';
  }
  b.disabled = true; $('#e-erro').textContent = '';
  try {
    await adm('/api/admin/itens/' + encodeURIComponent(atual.codigo), { method: 'PATCH', body: corpo });
    toast(a === 'salvar' ? 'Salvo.' : a === 'aprovar' ? 'Aprovada e no ar.' : a === 'remover' ? 'Removida.' : 'Marcada para revisar.', 'ok');
    Object.assign(atual, corpo, corpo.status ? { status: corpo.status } : {});
    resumo();
    if (corpo.status && corpo.status !== $('#f-status').value) {
      const i = ITENS.indexOf(atual);
      await carregar();
      if (ITENS[i]) { editar(ITENS[i]); $$('.adm-item')[i].classList.add('on'); }
      else $('#editor').innerHTML = '<p class="vazio">Fila concluída nesta página.</p>';
    } else editar(atual);
  } catch (x) { $('#e-erro').textContent = x.message; }
  b.disabled = false;
});

document.addEventListener('keydown', e => {
  if (!atual || !(e.ctrlKey || e.metaKey) || !$('#e-enun')) return;
  if (e.key === 'Enter') { e.preventDefault(); $('#editor [data-a=aprovar]').click(); }
  if (e.key.toLowerCase() === 's') { e.preventDefault(); $('#editor [data-a=salvar]').click(); }
});

// abas
$('#abas').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#abas button').forEach(x => x.classList.toggle('on', x === b));
  $('#tela-painel > main.adm:not(#aba-simulados)').classList.toggle('oculto', b.dataset.aba !== 'questoes');
  $('#aba-simulados').classList.toggle('oculto', b.dataset.aba !== 'simulados');
  if (b.dataset.aba === 'simulados' && window.abrirSimulados) window.abrirSimulados();
});

iniciar();
