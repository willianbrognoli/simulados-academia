// Checagem do login Firebase com chaves de teste no lugar das do Google (precisa de banco):
//   DATABASE_URL=... node scripts/checar-login.js
// Cria um aluno de teste com CPF aleatório e apaga no fim.
const crypto = require('crypto'), { execSync } = require('child_process'), assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 1 -subj /CN=t 2>/dev/null`);
const KEY = fs.readFileSync(`${dir}/k.pem`), CERT = fs.readFileSync(`${dir}/c.pem`, 'utf8');
const fetchReal = global.fetch;
global.fetch = async (u, o) => String(u).includes('securetoken@system') ? new Response(JSON.stringify({ teste: CERT }), { headers: { 'cache-control': 'max-age=60' } }) : fetchReal(u, o);
const SERVER = path.join(__dirname, '..', 'server.js');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function tok(c, kid = 'teste', key = KEY) {
  const agora = Math.floor(Date.now() / 1000), h = b64({ alg: 'RS256', kid }), p = b64({ aud: 'simulados-academia', iss: 'https://securetoken.google.com/simulados-academia', iat: agora, exp: agora + 3600, ...c });
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
}
process.env.PORT = 3999; process.env.SESSION_SECRET = 'x'.repeat(40);
const app = require(SERVER);
require(SERVER.replace('server.js', 'db.js')).init().then(() => app.listen(3999));
const post = (url, body) => fetchReal('http://127.0.0.1:3999' + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ st: r.status, d: await r.json(), ck: r.headers.get('set-cookie') }));
setTimeout(async () => {
  const outra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.equal((await post('/api/entrar', { idToken: 'lixo' })).st, 401);
  assert.equal((await post('/api/entrar', { idToken: tok({ sub: 'u1', email: 'a@x.com', email_verified: true }, 'teste', outra) })).st, 401, 'assinatura falsa');
  assert.equal((await post('/api/entrar', { idToken: tok({ sub: 'u1', email: 'a@x.com', email_verified: true, aud: 'outro' }) })).st, 401, 'aud');
  assert.equal((await post('/api/entrar', { idToken: tok({ sub: 'u1', email: 'a@x.com', email_verified: false }) })).st, 403, 'nao verificado');
  const uid = 'u' + Date.now(), uid2 = uid + 'b';
  let r = await post('/api/entrar', { idToken: tok({ sub: uid, email: 'a@x.com', email_verified: true, name: 'Ana Teste' }) });
  assert.deepEqual([r.st, r.d.cadastro, r.d.nome], [200, true, 'Ana Teste']);
  const dig = b => { let s = 0; for (let i = 0; i < b.length; i++) s += +b[i] * (b.length + 1 - i); return (s * 10) % 11 % 10; };
  let base = String(Math.floor(1e8 + Math.random() * 8e8)); base += dig(base); const cpf = base + dig(base);
  r = await post('/api/cadastro', { idToken: tok({ sub: uid, email: 'a@x.com', email_verified: true }), nome: 'Ana Teste', cpf, whatsapp: '45999998888' });
  assert.equal(r.st, 200, JSON.stringify(r.d)); assert.match(r.ck, /sid=/);
  r = await post('/api/entrar', { idToken: tok({ sub: uid, email: 'a@x.com', email_verified: true }) });
  assert.equal(r.d.ok, true); assert.match(r.ck, /sid=/);
  r = await post('/api/cadastro', { idToken: tok({ sub: uid2, email: 'b@x.com', email_verified: true }), nome: 'Beto Teste', cpf, whatsapp: '45999998888' });
  assert.equal(r.st, 409, 'mesmo CPF, outra conta'); assert.match(r.d.erro, /CPF já tem uma conta/);
  r = await post('/api/cadastro', { idToken: tok({ sub: uid2, email: 'b@x.com', email_verified: true }), nome: 'Beto Teste', cpf: '12345678900', whatsapp: '45999998888' });
  assert.equal(r.st, 400, 'cpf invalido');
  console.log('OK: todos os testes passaram');
  const { pool } = require(SERVER.replace('server.js', 'db.js'));
  await pool.query('DELETE FROM alunos WHERE cpf = $1', [cpf]);
  process.exit(0);
}, 4000);
