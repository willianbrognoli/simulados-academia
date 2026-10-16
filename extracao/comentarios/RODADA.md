# Rodada de comentários (como continuar)

Situação em 15/10/2026, 23h, entre as 20.755 questões aprovadas:

| Situação | Questões |
|---|---|
| `ia_aprovado` (já aparece para o aluno) | 3.034 |
| `ia_revisar` (espera a equipe no `/admin`) | 1.166 |
| sem comentário | 16.545 |
| antigos (questões de demonstração) | 10 |

Os arquivos de lote das rodadas anteriores se perderam. Não faz diferença: o **banco é a fonte da verdade**. Sempre baixe do servidor só o que está sem comentário.

## Precisa de

- Claude Code (ou Cowork) com esta pasta conectada, execução de código e agentes em paralelo.
- `SIM=https://marketing-simulados-academia.a2awit.easypanel.host` (ou o domínio definitivo).
- `TK=<ADMIN_TOKEN>`, lido no Easypanel › `marketing` › `simulados-academia` › Ambiente. Nunca gravar em arquivo do repositório.

## Passo a passo

1. **Baixar o que falta**, em páginas de 500:
   `GET $SIM/api/admin/itens?status=aprovada&comentario=sem&limite=500&offset=0` (depois `offset=500`, `1000`…, até cobrir o `total`).
   A ordem é estável (concurso, número, código). Salve tudo num `pendentes.jsonl`, com uma questão por linha e os campos que o `COMENTAR.md` espera: `codigo, materia, tema, formato, enunciado, alternativas, gabarito, texto_base, ano, banca, municipio, uf, escopo`. O `formato` vem do banco como ME4/ME5/CE; para o prompt, ME4 e ME5 viram `ME`.
2. **Lotes de 50** em pastas temporárias separadas: `lote_001.jsonl`, `lote_002.jsonl`…
3. **Escrever:** um agente por lote, seguindo o `COMENTAR.md`, grava `out_NNN.json`.
4. **Conferir:** outro agente, independente, seguindo o `CONFERIR.md`, grava `ver_NNN.json`.
5. **Juntar:** `python3 juntar.py <pasta>` gera `final.json` com `ia_aprovado` ou `ia_revisar`.
6. **Enviar** em blocos de até cerca de 500:
   `POST $SIM/api/admin/comentarios` com `Authorization: Bearer $TK` e o corpo `[{codigo, comentario, status, nota}]`.
   A resposta traz `{gravados, recebidos}`. A rota nunca sobrescreve comentário `humano`.
7. **Conferir no fim:** `GET $SIM/api/admin/resumo`, campo `comentarios`.

Dá para parar e retomar a qualquer momento. O passo 1 sempre devolve só o que ainda está sem comentário.

## Revisão humana

No `/admin`, use os filtros "Aprovadas" e "Comentário da IA para revisar". O motivo aparece na nota de cada questão. Editar e salvar o comentário o transforma em `humano`.
