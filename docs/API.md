# API

Todas as respostas são JSON. Em caso de erro, o formato é `{"erro": "mensagem"}`.

- **Aluno:** cookie `sid`, criado no login ou no cadastro.
- **Admin:** header `Authorization: Bearer <ADMIN_TOKEN>` ou o cookie `adm`, criado no login do painel `/admin` (a senha é o `ADMIN_TOKEN`, a sessão dura 8 h). Também aceita `?token=` para baixar o CSV pelo navegador.

## Saúde

| Método | Rota | Resposta |
|---|---|---|
| GET | `/health` | `{"ok":true}` quando o banco responde |

## Conta

| Método | Rota | Corpo | Observações |
|---|---|---|---|
| POST | `/api/cadastro` | `nome, cpf, email, whatsapp, senha` | CPF validado, um por conta; já faz login |
| POST | `/api/login` | `cpf, senha` | Limite de 10 tentativas a cada 15 min por IP |
| POST | `/api/logout` | — | |
| GET | `/api/me` | — | `{nome, cpf (mascarado), tentativaAberta: {slug, titulo} \| null}` |

## Catálogo e prova

| Método | Rota | Observações |
|---|---|---|
| GET | `/api/simulados` | Simulados ativos com questões. Cada um traz `itens`, `duracaoMin`, `erroAnula`, `intervaloH`, `feitas`, `melhor` e `proximaEm` (quando ainda está bloqueado) |
| POST | `/api/simulados/:slug/tentativas` | Inicia o simulado. Respostas: 409 se houver outro em andamento, 429 com `proximaEm` se ainda estiver no intervalo |
| GET | `/api/tentativas/atual` | Prova em andamento: questões **sem gabarito**, textos de apoio, prazo e saídas. 404 com `ultimaId` se não houver |
| PUT | `/api/tentativas/atual/resposta` | `{qid, resp}`. `resp` é a letra ou `null` para deixar em branco |
| POST | `/api/tentativas/atual/violacao` | `{tipo}`. Saída da tela, com debounce de 3 s; encerra ao atingir o máximo |
| POST | `/api/tentativas/atual/finalizar` | Entrega a prova e devolve `{id}` |
| GET | `/api/tentativas` | Histórico do aluno: nota, total, desempenho por tema e por matéria, simulado |
| GET | `/api/tentativas/:id` | Resultado: estatísticas, desempenho, dicas e revisão com gabarito, comentário e origem |
| GET | `/api/desempenho` | Soma de todas as tentativas por matéria e tema, com dicas |
| GET | `/api/ranking?simulado=slug&modo=primeira\|melhor` | Top 50, a posição do aluno e o total |

## Admin

| Método | Rota | Corpo | Observações |
|---|---|---|---|
| GET | `/api/admin/resumo` | — | Questões por status, matérias, simulados, acervo e número de alunos |
| POST | `/api/admin/importar/inventario` | CSV (`text/csv`) ou `{"csv": "…"}` | Upsert de concursos pelo `id` |
| POST | `/api/admin/importar/questoes` | JSON de uma prova | Use `?sobrescrever=1` para passar por cima da revisão |
| POST | `/api/admin/login` | `senha` | Abre a sessão do painel; limite de 10 tentativas a cada 15 min |
| POST | `/api/admin/logout` | — | |
| GET | `/api/admin/taxonomia` | — | Matérias, eixos e temas |
| GET | `/api/admin/itens?status=revisar&materia=&q=&limite=50&offset=0` | — | Fila de revisão: `{total, itens}`. `q` busca no código e no enunciado |
| PATCH | `/api/admin/itens/:codigo` | `status, motivo_remocao, gabarito, comentario, escopo, escopo_local, enunciado, alternativas, materia, tema` | Revisão e edição de uma questão |
| POST | `/api/admin/simulados/gerar` | `{minProva, minBanca, minMateria, minTema}` (opcional) | Cria ou atualiza o catálogo automático, inclusive os simulados por tema |
| PUT | `/api/admin/simulados/:slug` | `titulo, subtitulo, tipo, regras, meta, ativo, destaque, ordem` | Simulado manual (edital/livre) |
| POST | `/api/admin/recontar` | — | Recalcula `total_itens` de todos os simulados |
| GET | `/api/admin/alunos.csv` | — | Leads: nome, CPF, e-mail, WhatsApp, cadastro e simulados feitos |
