# Importação do acervo e das questões

O caminho completo de uma prova até o simulado:

```
PDF (provas-gcm/…/pdf)  →  extração  →  JSON (docs/questao.schema.json)  →  importar  →  revisar  →  simulados:gerar
```

A **extração** (ler o PDF e montar o JSON) acontece fora deste repositório, com o Claude lendo os PDFs da pasta `provas-gcm`. Este repositório recebe o JSON pronto, valida e grava.

---

## 1. Inventário de concursos

Use os `inventario.csv` da pasta `provas-gcm`: `nacional/` com as 736 linhas do PCI e `vunesp/` com as 48 linhas da Vunesp.

```bash
npm run importar:inventario -- caminho/nacional/inventario.csv caminho/vunesp/inventario.csv
```

- Separador `;` ou `,`, detectado sozinho. Campos com `;` dentro precisam estar entre aspas.
- Colunas reconhecidas, todas opcionais exceto `id`: `id`, `ano`, `municipio`, `uf`, `cargo`, `banca`, `banca_slug`, `orgao`, `escolaridade`, `link` (ou `url`), `status`, `obs`.
- **Pode rodar quantas vezes quiser:** atualiza pelo `id`.
- O `id` do inventário (ex.: `jundiai-sp-2023`) é o **slug do concurso**. As questões se ligam a ele pelo prefixo do próprio id: `jundiai-sp-2023-q23` pertence a `jundiai-sp-2023`.

Em produção, sem acesso ao banco:

```bash
curl -X POST https://SEU-DOMINIO/api/admin/importar/inventario \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: text/csv" \
  --data-binary @inventario.csv
```

## 2. Formato do JSON de uma prova

O contrato de cada questão está em [`questao.schema.json`](questao.schema.json). O arquivo de uma prova pode ser:

**a) só a lista de questões**

```json
[ { "id": "jundiai-sp-2023-q1", … }, { "id": "jundiai-sp-2023-q2", … } ]
```

**b) o envelope completo (recomendado)**, com dados do caderno e textos de apoio:

```json
{
  "prova":       { "duracao_min": 180, "data_prova": "2023-05-14", "caderno": "", "arquivo": "jundiai-sp-2023_prova.pdf" },
  "textos_base": { "tb1": "Texto que serve para as questões 1 a 5…" },
  "questoes": [
    {
      "id": "jundiai-sp-2023-q1",
      "origem": { "banca": "Vunesp", "orgao": "Prefeitura de Jundiaí", "municipio": "Jundiaí", "uf": "SP",
                  "cargo": "Guarda Municipal", "ano": 2023, "numero_original": 1 },
      "formato": "ME5",
      "texto_base_id": "tb1",
      "enunciado": "De acordo com o texto, …",
      "alternativas": { "A": "…", "B": "…", "C": "…", "D": "…", "E": "…" },
      "midia": [ { "tipo": "imagem", "arquivo": "jundiai-sp-2023-q1.png", "descricao": "Charge sobre trânsito" } ],
      "gabarito": "C",
      "gabarito_fonte": "definitivo",
      "materia": "Língua Portuguesa",
      "tema": "Interpretação de texto",
      "leis_citadas": [],
      "escopo": "nacional",
      "escopo_local": null,
      "status": "extraida",
      "alertas": [],
      "comentario": null
    }
  ]
}
```

Um exemplo completo e válido está em [`../dados/exemplo/demo-academia-2026.json`](../dados/exemplo/demo-academia-2026.json).

### Regras de validação

Uma questão inválida é **ignorada**, e o erro aparece no relatório. As demais são importadas normalmente.

| Campo | Regra |
|---|---|
| `id` | Obrigatório e único. Padrão `<id do concurso>-q<nº>`. Se o caderno tiver versões, use `concurso` + `origem.caderno` |
| `formato` | `ME4` (A–D), `ME5` (A–E) ou `CE` (certo/errado) |
| `alternativas` | As chaves precisam bater exatamente com o formato. Em `CE` pode vir vazio: o importador cria `{C: Certo, E: Errado}` |
| `gabarito` | Uma das chaves, ou `null` para anulada. Anulada entra como `removida` |
| `materia` | Obrigatória. Se não existir, é criada no eixo "Outras"; acerte o eixo depois em `lib/taxonomia.js` |
| `tema` | Opcional. Criado sob a matéria |
| `origem.ano` | Obrigatório. Os demais campos de origem são recomendados, porque aparecem para o aluno |
| `escopo` | `nacional` (padrão), `estadual` ou `municipal`. Municipal pede `escopo_local` com o nome da cidade |
| `status` | `extraida` (padrão), `revisar`, `aprovada` ou `removida` |

### Imagens

- Coloque o arquivo em `midia/` (em produção, no volume montado em `/app/midia`) e referencie o **nome do arquivo** em `midia[].arquivo`.
- O aluno vê a imagem na questão e pode clicar para ampliar.
- Sem `arquivo`, a descrição aparece como texto. Isso serve para quando a imagem ainda não foi recortada; nesse caso, deixe a questão em `revisar`.

## 3. Importar

```bash
npm run importar:questoes -- extraido/                 # todos os .json da pasta
npm run importar:questoes -- extraido/sp-2026.json     # um arquivo
npm run importar:questoes -- extraido/ --sobrescrever  # passa por cima da revisão humana (cuidado)
```

Pela API (produção):

```bash
curl -X POST "https://SEU-DOMINIO/api/admin/importar/questoes" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  --data-binary @extraido/sp-2026.json
# resposta: {"recebidas":60,"inseridas":60,"atualizadas":0,"ignoradas":0,"erros":[]}
```

## 4. Revisar

Só questões `aprovada` vão para o aluno. Para listar a fila de revisão:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://SEU-DOMINIO/api/admin/itens?status=extraida,revisar&limite=100"
```

Para aprovar, remover ou corrigir uma questão:

```bash
# aprovar
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"aprovada"}' https://SEU-DOMINIO/api/admin/itens/sp-2026-q12

# tirar do banco por lei alterada
curl -X PATCH … -d '{"status":"removida","motivo_remocao":"lei_alterada"}' …/itens/sp-2013-q40

# marcar como da própria cidade
curl -X PATCH … -d '{"escopo":"municipal","escopo_local":"Jundiaí"}' …/itens/jundiai-sp-2023-q15

# corrigir gabarito ou adicionar comentário
curl -X PATCH … -d '{"gabarito":"B","comentario":"Art. 5º da Lei 13.022/2014…"}' …/itens/sp-2026-q30
```

Checklist da revisão (regras do banco decididas em 13/10/2026):

1. O **gabarito é o definitivo**, depois dos recursos.
2. **Lei alterada** depois da prova, com a resposta deixando de valer: `removida` / `lei_alterada`.
3. **Questão da própria cidade** (realidades municipais, Lei Orgânica, estatuto local): `municipal` + cidade.
4. **Depende de imagem** que não foi extraída: fica em `revisar` até a imagem entrar em `midia/`.
5. **Anulada:** `removida` / `anulada`.

Em homologação, para ver tudo antes de revisar, suba com `ITENS_STATUS=aprovada,extraida`.

## 5. Montar o catálogo

```bash
npm run simulados:gerar
# ou: curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://SEU-DOMINIO/api/admin/simulados/gerar
```

Para criar um simulado de **edital** (ex.: GCM Belém, com as matérias do edital e as questões de Belém):

```bash
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  https://SEU-DOMINIO/api/admin/simulados/edital-gcm-belem-2026 -d '{
  "titulo": "GCM Belém 2026",
  "subtitulo": "Montado pelo edital · banca a definir",
  "tipo": "edital",
  "destaque": true,
  "ordem": 1,
  "meta": { "uf": "PA", "municipio": "Belém" },
  "regras": {
    "n_itens": 60, "duracao_min": 240, "ordem": "materia",
    "filtros": {
      "materias": ["Língua Portuguesa", "Raciocínio Lógico-Matemático", "Direito Constitucional",
                   "Direito Penal", "Estatuto Geral das Guardas Municipais", "Direitos Humanos"],
      "municipio": "Belém"
    }
  }
}'
```

Para tirar um simulado do catálogo, envie o mesmo `PUT` com `"ativo": false`.
