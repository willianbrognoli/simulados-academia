# Arquitetura

## Visão geral

Um único processo Node (Express) serve a API e as telas estáticas. O estado fica todo no Postgres. As imagens das questões ficam numa pasta (`MIDIA_DIR`), montada como volume em produção.

```
navegador ──► Express (server.js)
                 ├── /api/*         API do aluno (cookie de sessão)
                 ├── /api/admin/*   API de administração (Bearer ADMIN_TOKEN)
                 ├── /midia/*       imagens das questões
                 └── /*             telas em public/
                        │
                        ▼
                    PostgreSQL
```

## Modelo de dados

```
bancas ─┐
        ▼
     concursos (1 linha do inventario.csv: município, UF, ano, cargo, banca)
        │ 1:N
        ▼
      provas (caderno: tipo A/B, masculino/feminino…)
        │ 1:N                         materias (eixo, ordem)
        ├──► textos_base                 │ 1:N
        ▼                                ▼
      itens ─────────────────────────► temas
        ▲
        │ ids em tentativas.ordem
simulados ──► tentativas ◄── alunos
```

| Tabela | Campos principais | Observações |
|---|---|---|
| `alunos` | nome, cpf (único), email, whatsapp, senha_hash | Mesma regra da Fauth |
| `bancas` | slug, nome | Criada sozinha na importação |
| `concursos` | slug (id do inventário), municipio, uf, orgao, cargo, ano, banca_id, status_coleta | `status_coleta` vem do inventário: baixado, parcial, duplicata… |
| `provas` | concurso_id, caderno, formato, data_prova, duracao_min, arquivo | Único por (concurso, caderno) |
| `textos_base` | prova_id, chave, conteudo | Texto compartilhado por várias questões |
| `materias` / `temas` | nome, eixo, ordem / nome, dica | A dica do tema aparece no plano de estudo |
| `itens` | codigo, formato, enunciado, alternativas (JSONB), gabarito, materia, tema, escopo, status, comentario | Ver estados abaixo |
| `simulados` | slug, titulo, tipo, regras (JSONB), meta (JSONB), total_itens | `total_itens` é recalculado a cada 15 min e após importações |
| `tentativas` | aluno, simulado, regras (cópia), ordem (ids), respostas, saídas, nota, por_tema, por_materia | As regras são copiadas no início: mudar o simulado não afeta provas em andamento |

### Estados de uma questão (`itens.status`)

```
extraida ──► revisar ──► aprovada   (entra nos simulados)
    │            │
    └────────────┴──► removida      (motivo_remocao: anulada | lei_alterada | incompleta | duplicada | outro)
```

- Por padrão, **só `aprovada` vai para os simulados**. A variável `ITENS_STATUS` muda isso; em homologação, por exemplo, `ITENS_STATUS=aprovada,extraida`.
- Uma questão sem gabarito (`null`) é tratada como **anulada** e já entra como `removida`.
- **Reimportar não desfaz a revisão humana.** Uma questão `aprovada` ou `removida` mantém o status e o comentário, a menos que a importação seja feita com `--sobrescrever`. A exceção é a anulação: se o novo JSON trouxer a questão como anulada, ela sai do banco.

### Escopo (`itens.escopo`)

| Escopo | Onde aparece |
|---|---|
| `nacional` | Em todos os simulados que passam no filtro |
| `municipal` (+ `escopo_local` = município) | Só na prova real daquele caderno e em simulados com `filtros.municipio` igual à cidade |
| `estadual` | Hoje se comporta como municipal: só na prova real ou com filtro explícito |

Regra decidida em 13/10/2026: cerca de 40% de uma prova da Vunesp pode ser da própria cidade (Jundiaí 2023: 21 de 50). Essas questões são ouro para o simulado daquela cidade e ruído nos demais.

## Regras de simulado (`simulados.regras`)

```jsonc
{
  "duracao_min": null,     // null = 3 min por questão (mínimo 30)
  "n_itens": null,         // null = todas as que passam no filtro; número = sorteio
  "max_saidas": 3,         // na 3ª saída da tela a prova é entregue
  "intervalo_h": 24,       // horas entre tentativas do mesmo simulado (0 = livre)
  "erro_anula": false,     // Cebraspe: erro em item C/E desconta um acerto
  "ordem": "materia",      // original | materia | aleatoria
  "filtros": {
    "prova_ids": [12],                 // prova real: só este caderno (escopo ignorado)
    "concursos": ["jundiai-sp-2023"],  // slugs do inventário
    "bancas": ["vunesp"],              // slug da banca
    "materias": ["Direito Penal"],
    "temas": ["Legítima defesa"],
    "ufs": ["SP"],
    "formatos": ["ME5"],
    "ano_min": 2015,
    "municipio": "Belém"               // inclui as questões municipais desta cidade
  }
}
```

### Tipos de simulado

| Tipo | Como nasce | Padrão |
|---|---|---|
| `prova_real` | `simulados:gerar`: 1 por caderno com ≥ 10 questões liberadas | Ordem original, duração do caderno, `erro_anula` se houver item C/E |
| `banca` | `simulados:gerar`: 1 por banca com ≥ 30 questões nacionais | 50 sorteadas, ordem por matéria |
| `materia` | `simulados:gerar`: 1 por matéria com ≥ 20 questões nacionais | 20 sorteadas, aleatória, sem intervalo |
| `edital` | À mão (`PUT /api/admin/simulados/:slug`) | Filtros e duração do edital |
| `livre` | À mão | Qualquer combinação |

Os automáticos são recriados a cada `simulados:gerar`. Os manuais (`edital`, `livre`) nunca são tocados pelo gerador.

### Montagem da prova

1. Os itens elegíveis saem do filtro: status liberado, gabarito presente, filtros e escopo.
2. Se houver `n_itens`, é feito um sorteio com `crypto.randomInt`.
3. Depois vem a ordenação:
   - `original`: por caderno e número original;
   - `materia`: matérias na ordem da taxonomia, sorteio dentro de cada uma, com os itens do mesmo texto de apoio juntos;
   - `aleatoria`: tudo embaralhado.
4. Os ids vão para `tentativas.ordem`, e a prova fica fixa daí em diante.

### Correção

- Para cada item, o resultado é **certo**, **errado** ou **em branco**.
- Nota:
  - **sem** `erro_anula`: nota = certos;
  - **com** `erro_anula`: nota = certos − erros em itens C/E;
  - erros em múltipla escolha nunca descontam.
- O desempenho é guardado por **tema** e por **matéria**. O painel soma todas as tentativas para o desempenho acumulado.

## Fluxo da prova

1. `POST /api/simulados/:slug/tentativas`. O servidor:
   - trava a conta do aluno (`FOR UPDATE`);
   - confere se há outra prova aberta e o intervalo do simulado;
   - sorteia os itens e grava `expira_em`.
2. Em `/prova`, o portão de tela cheia só libera as questões depois de entrar em tela cheia.
3. Cada clique dispara `PUT /api/tentativas/atual/resposta`. A letra é validada contra as alternativas daquele item.
4. Cada saída da tela gera `POST …/violacao`, com debounce de 3 s no servidor. Ao atingir `max_saidas`, a prova é entregue.
5. A entrega acontece por:
   - `POST …/finalizar`;
   - tempo esgotado: verificação *lazy* em qualquer chamada;
   - excesso de saídas.
6. Em `/resultado?id=`, o aluno vê nota, desempenho, plano de estudo e o gabarito comentado com a origem de cada questão.

## Segurança

- Cookie de sessão `HttpOnly`, `SameSite=Strict` e `Secure` em produção, assinado com HMAC-SHA256 (`SESSION_SECRET`).
- CSP restritiva: só scripts próprios, fontes do Google e imagens do próprio domínio e de `IMG_HOSTS`.
- Limite de tentativas em login e cadastro: 10 a cada 15 min por IP.
- Rotas admin com comparação em tempo constante do `ADMIN_TOKEN`.
- Corpo JSON limitado a 20 KB nas rotas do aluno e a 15 MB nas de importação.

## Decisões e pendências herdadas

- **Direito autoral:** o uso das provas foi liberado após consulta a advogado (13/10/2026). Boas práticas mantidas: exibir banca, órgão e ano em cada questão; comentários sempre originais.
- **Confirmação de cadastro e recuperação de senha:** resolvidas com o Firebase Authentication (14/10/2026). Google ou e-mail e senha; conta por e-mail só entra com o e-mail confirmado; o Firebase cuida da troca de senha. Ao trocar de domínio, incluir o novo em *Authentication › Settings › Authorized domains*.
- **Tela de revisão:** feita em `/admin` (fila, editor, lote, simulados da Academia e botão de gerar o catálogo).
- **Comentários:** gerados por IA com segunda conferência independente (`extracao/comentarios/`). Campo `itens.comentario_status`: `ia_aprovado` e `humano` aparecem para o aluno; `ia_revisar` fica escondido até a equipe revisar. Editar o comentário no `/admin` o torna `humano`, e a importação em lote nunca sobrescreve um comentário humano.
- **Tempo por questão no resultado:** o contador de ritmo fica só no navegador. Para mostrar "questões acima do ritmo" no resultado, ele precisaria ser gravado no servidor.
