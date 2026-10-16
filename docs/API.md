# API

Todas as respostas são JSON. Em caso de erro, o formato é `{"erro": "mensagem"}`.

- **Aluno:** login pelo Firebase Authentication (Google ou e-mail/senha com e-mail confirmado). O navegador manda o ID token do Firebase; o servidor confere a assinatura com as chaves públicas do Google e cria o cookie `sid`. Uma conta por CPF (`UNIQUE` no banco).
- **Admin:** header `Authorization: Bearer <ADMIN_TOKEN>` ou o cookie `adm`, criado no login do painel `/admin` (a senha é o `ADMIN_TOKEN`, a sessão dura 8 h). Também aceita `?token=` para baixar o CSV pelo navegador.

## Saúde

| Método | Rota | Resposta |
|---|---|---|
| GET | `/health` | `{"ok":true}` quando o banco responde |

## Conta

| Método | Rota | Corpo | Observações |
|---|---|---|---|
| POST | `/api/entrar` | `idToken` | Conta existe: abre a sessão (`{ok}`). Não existe: `{cadastro, nome, email}`. E-mail não confirmado: 403 `{verificar}` |
| POST | `/api/cadastro` | `idToken, nome, cpf, whatsapp` | Primeiro acesso. CPF validado e único: CPF já usado dá 409. O e-mail vem do token |
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
| GET | `/api/admin/resumo` | — | Questões por status, matérias, simulados, acervo, número de alunos e `comentarios` (situação do comentário nas aprovadas: `ia_aprovado`, `ia_revisar`, `humano`, `antigo`, `sem`) |
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
| POST | `/api/admin/itens/lote` | `codigos[], status, motivo_remocao` | Aprova, manda para revisão ou tira até 500 questões; sem gabarito não aprova |
| POST | `/api/admin/comentarios` | `[{codigo, comentario, status, nota}]` | Comentários gerados por IA (`status` = `ia_aprovado` ou `ia_revisar`). Nunca sobrescreve comentário `humano` |
| GET | `/api/admin/simulados` | — | Simulados montados à mão (`edital`/`livre`) |
| POST | `/api/admin/simulados` | `titulo, subtitulo, modo (cotas\|itens), cotas, codigos, duracao_min, intervalo_h, max_saidas, erro_anula, municipio, uf, ativo, destaque, slug` | Cria ou edita um simulado da Academia |
| GET | `/api/admin/alunos.csv` | — | Leads: nome, CPF, e-mail, WhatsApp, cadastro e simulados feitos |
