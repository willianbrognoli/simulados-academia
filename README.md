# Simulados · Academia de Polícia

Plataforma fechada de simulados da **Academia de Polícia** com questões de **provas reais de Guarda Municipal de todo o Brasil**. As questões ficam organizadas por concurso, banca, matéria e tema.

O aluno pode:
- refazer uma **prova real** completa no tempo original;
- treinar no **estilo de uma banca**;
- atacar uma **matéria específica**;
- fazer o **simulado montado pelo edital** de um concurso aberto (Belém, Toledo…).

Tudo com cronômetro, anti-cola, correção na hora, desempenho por matéria, patentes e ranking.

Este projeto nasceu da base do simulado da Prof.ª Adriane Fauth (`simulados-fauth`). A lógica de prova, o anti-cola e o deploy vieram de lá. O modelo de dados virou **multi-concurso**, a prova passou a aceitar **múltipla escolha (A–D, A–E) e certo/errado**, e o visual segue a identidade da Academia: preto, dourado, Space Grotesk e Inter.

> **Stack:** Node 20 + Express + PostgreSQL. O front-end não tem etapa de build: são HTML, CSS e JS puros em `public/`.

---

## Sumário

- [Como funciona](#como-funciona)
- [Rodar localmente](#rodar-localmente)
- [Colocar questões no ar](#colocar-questões-no-ar)
- [Deploy (Easypanel)](#deploy-easypanel)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Regras implementadas](#regras-implementadas)
- [Documentação detalhada](#documentação-detalhada)

---

## Como funciona

```
 provas-gcm/ (PDFs + inventario.csv)
        │  extração (pasta extracao/): PDF → JSON no formato docs/questao.schema.json
        ▼
 importar:inventario ─┐
 importar:questoes ───┼──► Postgres (concursos, provas, itens, matérias, temas)
                      │          │
 revisão (API admin) ─┘          ▼
                      simulados:gerar ──► catálogo (prova real · estilo banca · por matéria · edital)
                                                 │
                                                 ▼
                                   aluno: painel → prova → resultado
```

1. **Acervo.** O `inventario.csv` da pasta `provas-gcm` vira a tabela `concursos`: município, UF, ano, cargo, banca e situação da coleta.
2. **Questões.** Cada prova extraída é um JSON. O importador cria o caderno, os textos de apoio, as matérias e os temas, e grava as questões com status `extraida`.
3. **Revisão humana.** Só questões `aprovada` entram nos simulados. A revisão é feita pela API admin (`PATCH /api/admin/itens/:codigo`). Anuladas e as que caíram por lei alterada ficam como `removida`.
4. **Catálogo.** O script `simulados:gerar` cria sozinho:
   - 1 simulado **prova real** por caderno com 10 ou mais questões;
   - 1 **estilo banca** por banca com 30 ou mais questões (sorteia 50);
   - 1 **por matéria** por matéria com 20 ou mais questões (sorteia 20, sem limite de tentativas).

   Simulados de **edital** são montados à mão pela API.
5. **Aluno.** O aluno se cadastra com nome, CPF, e-mail, WhatsApp e senha, escolhe o simulado no catálogo, faz a prova em tela cheia e vê o resultado com gabarito comentado.

## Rodar localmente

Pré-requisitos: Node 20+ e um Postgres (local ou Docker).

```bash
git clone https://github.com/<conta>/simulados-academia.git
cd simulados-academia
npm install
cp .env.example .env            # preencha DATABASE_URL, SESSION_SECRET e ADMIN_TOKEN

# Postgres rápido com Docker (opcional)
docker run -d --name pg-sim -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
# DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres

npm run demo                     # carrega 10 questões de demonstração e monta 5 simulados
npm run dev                      # http://localhost:3000
npm test                         # checagens das regras de correção e importação
```

> O `server.js` não lê o `.env` sozinho. Exporte as variáveis no terminal ou rode `node --env-file=.env server.js` (Node 20.6+).

As tabelas são criadas automaticamente na primeira subida (`db.js`). A lista inicial de matérias também é semeada nesse momento.

## Colocar questões no ar

Passo a passo completo em [`docs/IMPORTACAO.md`](docs/IMPORTACAO.md). Resumo:

```bash
# 1. acervo de concursos (pode repetir; atualiza)
npm run importar:inventario -- ../provas-gcm/nacional/inventario.csv ../provas-gcm/vunesp/inventario.csv

# 2. questões extraídas (um .json por prova, ou a pasta inteira)
npm run importar:questoes -- ../provas-gcm/extraido/

# 3. depois da revisão (status = aprovada), monte o catálogo
npm run simulados:gerar
```

Também dá para importar **direto no servidor em produção**, sem acesso ao banco, pela API admin:

```bash
curl -X POST https://simulados.academiadepolicia.com.br/api/admin/importar/questoes \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  --data-binary @extraido/jundiai-sp-2023.json
```

## Deploy (Easypanel)

Passo a passo completo, com os problemas já enfrentados no projeto da Fauth, em [`docs/DEPLOY.md`](docs/DEPLOY.md). Resumo:

1. Repositório **privado** no GitHub, branch `master`.
2. Easypanel, projeto `marketing`: `+ Service → Postgres` (`postgres-academia`) e `+ Service → App` (`simulados-academia`). A fonte é o GitHub e o build usa o **Dockerfile**.
3. Variáveis de ambiente iguais ao `.env.example`, **sem espaço no início das linhas**.
4. Volume montado em `/app/midia` para as imagens das questões.
5. Domínio `simulados.academiadepolicia.com.br` apontando para a porta `3000`.
6. Teste: `https://…/health` deve responder `{"ok":true}`.

## Estrutura do repositório

| Caminho | O que faz |
|---|---|
| `server.js` | API (aluno e admin), sessão por cookie assinado, regras da prova, ranking, arquivos estáticos |
| `db.js` | Conexão e criação do esquema (idempotente) + semente das matérias |
| `lib/simulados.js` | Regras de simulado: filtro de itens, sorteio e ordem, correção, geração do catálogo |
| `lib/importar.js` | Importação do inventário (CSV) e das questões (JSON), com validação |
| `lib/taxonomia.js` | Matérias de partida e seus eixos (Base de fogo, Frente legal, Eixo operacional GCM, Realidade local) |
| `scripts/` | Linha de comando: `importar-inventario`, `importar-questoes`, `gerar-simulados`, `demo` |
| `public/` | Telas: `index` (login), `painel` (catálogo, desempenho, ranking), `prova`, `resultado` |
| `docs/questao.schema.json` | Formato de cada questão extraída (o contrato entre a extração e a plataforma) |
| `dados/exemplo/` | Prova de demonstração no formato de importação |
| `midia/` | Imagens das questões (volume em produção; fora do Git) |
| `test/` | `node --test` das regras puras |
| `extracao/` | Pipeline Python PDF → JSON e triagem automática (ver `extracao/README.md`) |

## Regras implementadas

- **Conta:** o CPF é validado pelos dígitos verificadores, e cada CPF tem uma conta só. A senha é guardada com bcrypt. A sessão fica num cookie HttpOnly assinado com HMAC e vale 7 dias.
- **Uma prova aberta por vez** por aluno, com índice único no banco e trava `FOR UPDATE` contra clique duplo.
- **Intervalo entre tentativas** por simulado: 24 h por padrão; os treinos por matéria são livres.
- **Tempo:**
  - o prazo é gravado no início da prova; quando acaba, a prova é entregue sozinha, mesmo com a página fechada;
  - o padrão é 3 min por questão, com mínimo de 30 min;
  - a prova real usa a duração original do caderno quando ela é informada.
- **Respostas** são salvas a cada clique. O gabarito só chega ao navegador no resultado.
- **Formatos:**
  - **ME4** (A–D), **ME5** (A–E) e **CE** (certo/errado);
  - no padrão Cebraspe (`erro_anula`), cada erro em item C/E desconta um acerto; em múltipla escolha errar não desconta.
- **Anti-cola:**
  - tela cheia obrigatória; marca d'água com nome e CPF;
  - bloqueio de copiar, colar, imprimir e inspecionar;
  - trocar de aba, minimizar, sair da tela cheia, fechar ou recarregar contam como saída; na 3ª saída a prova é entregue;
  - todas as saídas ficam registradas.
- **Escopo das questões:**
  - questão `municipal` (realidades da cidade, Lei Orgânica, estatuto local) só entra na prova real e no simulado da própria cidade (`filtros.municipio`);
  - anuladas e questões com lei alterada saem do banco (`status = removida`).
- **Origem sempre visível:** cada questão mostra banca, órgão, ano, cargo e número original. Os comentários são sempre originais da Academia.
- **Ranking por simulado:**
  - o oficial considera a 1ª tentativa de cada aluno, com desempate pelo menor tempo;
  - há também a visão "melhor nota";
  - mostra só o primeiro nome e a inicial do sobrenome.
- **Gamificação:**
  - XP gera **patentes** da carreira da guarda, de Aluno-guarda a Comandante;
  - 10 condecorações;
  - contador de ritmo por questão, só para treino.

## Documentação detalhada

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): modelo de dados, regras de simulado, fluxo da prova e decisões.
- [`docs/IMPORTACAO.md`](docs/IMPORTACAO.md): formato do JSON, inventário, revisão e catálogo.
- [`docs/API.md`](docs/API.md): todas as rotas (aluno e admin).
- [`docs/DEPLOY.md`](docs/DEPLOY.md): GitHub + Easypanel passo a passo, variáveis e solução de problemas.

## Limites conhecidos

- Nenhum sistema web impede consulta a um **segundo aparelho**. A plataforma detecta e pune saídas da tela e dificulta cópias.
- No **iPhone** não há tela cheia para páginas. A vigilância continua por troca de aba e saída do app.
- **Não há confirmação de e-mail nem recuperação de senha.** A decisão entre e-mail e WhatsApp está pendente; veja `docs/ARQUITETURA.md`.
- A **tela de revisão** de questões ainda é só por API. Uma interface de revisão é o próximo passo natural.
