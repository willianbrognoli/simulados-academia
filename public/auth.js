'use strict';
// Login pelo Firebase (Google ou e-mail/senha). Depois, o servidor confere o token e abre a sessão da plataforma.
api('/api/me', { semRedirect: true }).then(() => location.replace('/painel')).catch(() => {});

firebase.initializeApp({
  apiKey: 'AIzaSyDHWSpjZiL3x_gTmr-vMuQSjPab63_c3Rw',
  authDomain: 'simulados-academia.firebaseapp.com',
  projectId: 'simulados-academia',
  appId: '1:942841913776:web:72a1568128393d6f0ff675',
});
const fa = firebase.auth();
fa.languageCode = 'pt';
fa.setPersistence(firebase.auth.Auth.Persistence.NONE); // a sessão que vale é a da plataforma

const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Este e-mail já tem conta. Use a aba Entrar.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Tente novamente.',
};
const falha = e => { if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast(ERROS[e.code] || e.message, 'erro'); };

function mostrar(id) {
  ['passo-login', 'passo-aviso', 'f-perfil'].forEach(x => $('#' + x).classList.toggle('oculto', x !== id));
}

// abas Entrar / Criar conta
const tabs = $('.tabs');
$$('.tab').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.tab;
  tabs.classList.toggle('criar', t === 'criar');
  $$('.tab').forEach(x => x.classList.toggle('on', x === b));
  $$('#passo-login .form').forEach(f => f.classList.toggle('on', f.id === 'f-' + t));
}));

// com o usuário logado no Firebase: entra ou pede o cadastro
async function seguir(user) {
  const idToken = await user.getIdToken(true);
  try {
    const r = await api('/api/entrar', { method: 'POST', body: { idToken }, semRedirect: true });
    if (r.ok) return location.replace('/painel');
    $('#f-perfil [name=nome]').value = r.nome || '';
    mostrar('f-perfil');
  } catch (e) {
    if (e.dados && e.dados.verificar) return aviso(user, `Enviamos um link para ${user.email}. Abra o e-mail, clique no link e depois volte aqui.`);
    toast(e.message, 'erro');
  }
}
function aviso(user, txt) {
  $('#aviso-txt').textContent = txt;
  $('#b-reenviar').onclick = () => user.sendEmailVerification().then(() => toast('Link reenviado. Veja também o spam.', 'ok'), falha);
  mostrar('passo-aviso');
}
$('#b-voltar').addEventListener('click', async () => {
  const u = fa.currentUser;
  if (!u) return mostrar('passo-login');
  await u.reload();
  seguir(u);
});

$('#b-google').addEventListener('click', () => {
  fa.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(r => seguir(r.user), falha);
});

$('#f-entrar').addEventListener('submit', e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (!d.email || !d.senha) return toast('Digite e-mail e senha.', 'erro');
  fa.signInWithEmailAndPassword(d.email.trim(), d.senha).then(r => seguir(r.user), falha);
});

$('#f-criar').addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if ((d.senha || '').length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.', 'erro');
  try {
    const r = await fa.createUserWithEmailAndPassword((d.email || '').trim(), d.senha);
    await r.user.sendEmailVerification();
    aviso(r.user, `Conta criada! Enviamos um link de confirmação para ${r.user.email}. Abra o e-mail, clique no link e depois volte aqui.`);
  } catch (er) { falha(er); }
});

$('#b-esqueci').addEventListener('click', () => {
  const email = $('#f-entrar [name=email]').value.trim();
  if (!email) return toast('Digite seu e-mail no campo acima.', 'erro');
  fa.sendPasswordResetEmail(email).then(() => toast('Se o e-mail tiver conta, enviamos o link para criar nova senha.', 'ok'), falha);
});

// cadastro (primeiro acesso)
const cpfIn = $('#f-perfil [name=cpf]');
cpfIn.addEventListener('input', () => {
  const lb = cpfIn.closest('label'), dica = $('.dica-campo', lb);
  cpfIn.value = mascaraCPF(cpfIn.value);
  const d = cpfIn.value.replace(/\D/g, '');
  lb.classList.remove('valido', 'invalido');
  dica.textContent = '';
  if (d.length === 11) {
    const ok = cpfValido(d);
    lb.classList.add(ok ? 'valido' : 'invalido');
    dica.textContent = ok ? '✓ CPF válido' : 'CPF inválido, confira os números';
  }
});
$('#f-perfil [name=whatsapp]').addEventListener('input', e => { e.target.value = mascaraTel(e.target.value); });

$('#f-perfil').addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if ((d.nome || '').trim().split(/\s+/).length < 2) return toast('Informe nome e sobrenome.', 'erro');
  if (!cpfValido(d.cpf)) return toast('CPF inválido. Confira os números.', 'erro');
  if ((d.whatsapp || '').replace(/\D/g, '').length < 10) return toast('Informe o WhatsApp com DDD.', 'erro');
  if (!d.lgpd) return toast('Marque a concordância com o uso dos dados.', 'erro');
  const btn = $('button[type=submit]', e.target);
  btn.disabled = true;
  try {
    const idToken = await fa.currentUser.getIdToken();
    await api('/api/cadastro', { method: 'POST', body: { idToken, nome: d.nome, cpf: d.cpf, whatsapp: d.whatsapp }, semRedirect: true });
    toast('Tudo certo! Entrando…', 'ok');
    setTimeout(() => location.href = '/painel', 450);
  } catch (er) { toast(er.message, 'erro'); btn.disabled = false; }
});
