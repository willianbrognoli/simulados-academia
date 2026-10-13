# Deploy: GitHub + Easypanel

Mesmo esquema do `simulados-fauth`: repositório privado, build por Dockerfile e Postgres próprio no Easypanel.

## Visão

| Item | Valor |
|---|---|
| Repositório | `github.com/willianbrognoli/simulados-academia` (privado, branch **`master`**) |
| Easypanel | projeto **`marketing`** (o plano permite só 3 projetos; os serviços da Academia têm nome próprio) |
| Banco | serviço Postgres **`postgres-academia`**, banco **`simulados`**, host interno **`marketing_postgres-academia`** |
| App | serviço **`simulados-academia`**: fonte GitHub, build **Dockerfile**, porta **3000** |
| Volume | **`midia-academia`** montado em **`/app/midia`** (imagens das questões) |
| Domínio | provisório `marketing-simulados-academia.a2awit.easypanel.host` → definitivo `simulados.academiadepolicia.com.br` |

## 1. GitHub

Na pasta do projeto:

```bash
git init -b master
git add .
git commit -m "Plataforma de simulados da Academia de Polícia"
gh repo create willianbrognoli/simulados-academia --private --source . --push
```

> Se o `gh` reclamar de login: `gh auth login` (HTTPS, navegador). O código de 8 caracteres aparece no terminal.

## 2. Postgres

Easypanel → projeto `marketing` → **+ Service → Postgres**:

- Nome: `postgres-academia`, imagem `postgres:17`, banco `simulados`.
- Use uma senha só com letras e números (evita ter de codificar na URL).
- A URL interna fica `postgres://postgres:SENHA@marketing_postgres-academia:5432/simulados`.

## 3. App

**+ Service → App**, nome `simulados-academia`:

1. **Source:** GitHub → `willianbrognoli/simulados-academia`, branch `master`, path `/`.
2. **Build:** Dockerfile (`Dockerfile`).
3. **Environment.** Cole **sem espaços no começo das linhas**:
   ```
   DATABASE_URL=postgres://postgres:SENHA@marketing_postgres-academia:5432/simulados
   SESSION_SECRET=<48+ caracteres aleatórios>
   ADMIN_TOKEN=<outro valor aleatório longo>
   NODE_ENV=production
   PORT=3000
   ```
   Para gerar os segredos:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
4. **Mounts:** Volume `midia-academia` → `/app/midia`.
5. **Domains:** o domínio provisório já aponta para a porta `3000`. Confira.
6. **Implantar.** As tabelas e as matérias são criadas sozinhas na primeira subida.
7. **Teste:** `https://<domínio>/health` deve responder `{"ok":true}`.

## 4. Carregar o acervo (primeira vez)

Com o app no ar, pelo seu computador:

```bash
export SIM=https://<domínio>
export TK=<ADMIN_TOKEN>

# inventário (736 concursos do PCI + 48 da Vunesp)
curl -X POST $SIM/api/admin/importar/inventario -H "Authorization: Bearer $TK" -H "Content-Type: text/csv" --data-binary @provas-gcm/nacional/inventario.csv
curl -X POST $SIM/api/admin/importar/inventario -H "Authorization: Bearer $TK" -H "Content-Type: text/csv" --data-binary @provas-gcm/vunesp/inventario.csv

# questões extraídas (uma prova por vez)
for f in provas-gcm/extraido/*.json; do
  curl -s -X POST $SIM/api/admin/importar/questoes -H "Authorization: Bearer $TK" -H "Content-Type: application/json" --data-binary @"$f"; echo
done

# depois da revisão
curl -X POST $SIM/api/admin/simulados/gerar -H "Authorization: Bearer $TK"
```

PowerShell (Windows):

```powershell
$SIM = "https://<domínio>"; $TK = "<ADMIN_TOKEN>"
Invoke-RestMethod -Method Post "$SIM/api/admin/importar/inventario" -Headers @{Authorization="Bearer $TK"} -ContentType "text/csv; charset=utf-8" -InFile "provas-gcm\nacional\inventario.csv"
```

## 5. Domínio definitivo

1. No DNS de `academiadepolicia.com.br`, crie um registro **A** `simulados` apontando para o IP da VPS do Easypanel.
2. No app, em **Domains**, adicione `simulados.academiadepolicia.com.br` na porta `3000`. O HTTPS sai automático.
3. Se a LP ou o WordPress forem linkar para os simulados, use esse domínio.

## 6. Atualizações

O auto-deploy vem desligado, como na Fauth. Depois de cada `git push` para a `master`, clique em **Implantar** no Easypanel. Para publicar a cada push, ligue o auto-deploy em **Source**.

## Solução de problemas (já aconteceram no projeto da Fauth)

| Sintoma | Causa | Correção |
|---|---|---|
| "Service is not reachable" e o log mostra "Defina a variável SESSION_SECRET" | Env colada com espaços no início das linhas | Cole de novo sem os espaços e reimplante |
| Log `password authentication failed` ou `getaddrinfo` | Senha com `!@#` sem codificar na URL | Codifique: `!` → `%21`, `@` → `%40`, `#` → `%23` |
| Log `database "x" does not exist` | Nome do banco no fim da URL diferente do banco criado | Crie o banco ou corrija a URL |
| Catálogo vazio para o aluno | Nenhuma questão `aprovada` ou catálogo não gerado | Revise as questões e rode `simulados/gerar`. Em homologação, `ITENS_STATUS=aprovada,extraida` |
| Imagens somem a cada deploy | Sem volume em `/app/midia` | Crie o mount do passo 3.4 |
| `413 Arquivo grande demais` na importação | JSON acima de 15 MB | Divida a prova em mais de um arquivo |

## Backup

O que importa está no Postgres (questões revisadas, alunos, tentativas) e no volume `midia`. Use o backup do serviço Postgres no Easypanel, ou um `pg_dump` agendado:

```bash
pg_dump "$DATABASE_URL" -Fc -f simulados-$(date +%F).dump
```
