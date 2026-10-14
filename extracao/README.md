# Extração: PDF → questões

Scripts que transformaram os ~1.500 PDFs de `provas-gcm/` nas 27.399 questões do banco. Rodam **fora** da plataforma (Python 3 + PyMuPDF + poppler-utils). O resultado são JSONs no formato `docs/questao.schema.json`, enviados pela API admin.

Os dados já extraídos (JSONs finais, gabaritos, transcrições por IA) estão em `provas-gcm/extracao-dados.zip`. Não estão no Git por tamanho.

## Pastas de trabalho (criadas na hora, fora do Git)

| Pasta | Conteúdo |
|---|---|
| `mu/` | texto do PDF por `totext.py` (PyMuPDF, respeita 2 colunas) |
| `raw/`, `txt/` | texto por `pdftotext -raw` e `pdftotext -layout` (gabaritos) |
| `q_*` | saída do parser em cada combinação fonte × modo × padrão |
| `g/<id>.json` | gabarito da prova: `respostas`, `fonte` (definitivo/preliminar), `confianca` (alta/media/baixa/nenhuma) |
| `llm/<id>.json` | questões transcritas por IA nas provas que o parser não leu |
| `extraido/`, `extraido2/` | JSON por prova (heurístico / heurístico + IA) |
| `final/` | `extraido2/<id>.json` se existir, senão `extraido/<id>.json` |

## Passo a passo (prova nova)

```bash
# 0. PDF em provas-gcm/nacional/pdf/<id>_prova.pdf e <id>_gabarito.pdf + linha no inventario.csv
# 1. texto
python3 totext.py pdf/<id>_prova.pdf mu/<id>_prova.txt
pdftotext -raw pdf/<id>_prova.pdf raw/<id>_prova.txt
pdftotext -layout pdf/<id>_gabarito.pdf txt/<id>_gabarito.txt
# 2. parser nas 8 combinações (rodar2.py) e escolha da melhor por coerência com o gabarito (melhor.py)
python3 rodar2.py && python3 melhor.py
# 3. gabarito: candidatos automáticos, depois confirmação (pick.py) — ver INSTRUCOES_GABARITO.md
python3 info.py <id>
python3 pick.py <id> cand 0 --fonte definitivo --conf alta
# 4. JSON da prova
python3 build_json.py
# 5. provas que o parser não leu: IA transcreve (faltam.py / salvar_q.py, ver INSTRUCOES_QUESTOES.md) e
python3 merge_llm.py
# 6. triagem automática: aprova o que é confiável (gera aprovar/)
python3 aprovar.py
# 7. envio
curl -X POST $SIM/api/admin/importar/questoes -H "Authorization: Bearer $TK" \
  -H "Content-Type: application/json" --data-binary @aprovar/<id>.json
```

`build_json.py` lê os inventários de `INV_NACIONAL` e `INV_VUNESP` (padrão `../provas-gcm/...`).

## Regra da triagem automática (`aprovar.py`)

Vira `aprovada` a questão que cumpre **todos** os critérios abaixo:

- a prova tem gabarito com confiança **alta**;
- a questão tem gabarito;
- o enunciado tem pelo menos 30 caracteres;
- todos os alertas são só informativos: gabarito preliminar ou sem indicação, matéria por palavra-chave, transcrita por IA.

O resto foi marcado `removida` com `motivo_remocao`:

- `triagem automática: depende de imagem` (1.127, recuperáveis recortando a figura do PDF);
- `triagem automática: extração ou gabarito incertos` (4.942).

Reimportar não desfaz a revisão humana. Exceção: se a questão vier anulada, ela passa a removida.
