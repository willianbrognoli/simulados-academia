# Correção de questões a partir do PDF

Você recebe `lote_XXX.json`, uma lista de ids de questões de concurso que a extração do PDF estragou. Os dados atuais de cada questão estão em `/home/claude/extr/corr/itens.json`: enunciado, alternativas, gabarito, origem, `texto_base_atual` (o texto de apoio vinculado, se houver) e o `motivo` apontado na triagem.

## Para cada questão

1. Gere as imagens da página com `python3 /home/claude/extr/corr/pagina.py <id> /tmp/cXXX/` e abra os PNG com a ferramenta Read.
   - Se o script disser "NAO ACHEI", localize a página você mesmo: rode `pdftotext -layout` no PDF, procure o número da questão (`origem.numero_original`), renderize a página com pymupdf e abra a imagem.
   - Use só `/tmp/cXXX/`.
   - O texto de apoio costuma estar páginas antes. Abra as páginas que precisar.
2. Decida a `acao`:
   - `corrigir`: reescreva `enunciado` e `alternativas` FIELMENTE ao PDF, mantendo as mesmas letras de alternativas. Regras:
     - **Destaque:** quando o enunciado fala em "termo em destaque", "palavra sublinhada" ou "expressão grifada", marque o trecho destacado com dois sublinhados de cada lado: `não foi __a pensada__ pelos criadores`. Faça o mesmo no texto de apoio, se o destaque estiver lá.
     - **Fórmula:** LaTeX com `\( … \)` na linha e `\[ … \]` destacada. NUNCA use `$`. Unidade simples pode ir em Unicode (m², cm³).
     - **Texto de apoio:** se a questão depende de um texto que NÃO está em `texto_base_atual` (ou se ele está errado), transcreva o texto completo e fiel no campo `texto_base`. Inclua título, fonte e numeração de linhas, se a questão se referir a linhas.
       - Se outra questão do MESMO lote já trouxe esse mesmo texto, não repita: use `"texto_base_de": "<id da outra questão>"`.
       - Se o `texto_base_atual` está certo, não mande nada.
     - **Questões coladas** (uma engoliu a outra): fique só com a questão do id.
     - **Lixo de página** (cabeçalho, número da página, nome da seção): remova.
     - **Tabela pequena:** linhas separadas por quebra de linha, colunas por " | ".
   - `figura`: a questão depende de figura, gráfico, tirinha, mapa ou imagem que não dá para escrever em texto. Explique em `obs`.
   - `ok`: o texto atual já está fiel e completo, e o motivo da triagem era falso.
   - `descartar`: o PDF também está ilegível, ou a questão não fecha. Explique em `obs`.
3. NUNCA invente dado que não está na imagem. NÃO resolva a questão nem mude o gabarito. Se o gabarito parecer claramente errado, só anote em `obs`.

## Saída

Grave `/home/claude/extr/corr/res_XXX.json` usando Python (json.dump com ensure_ascii=False; strings raw `r"..."` para não perder as barras do LaTeX). Use SÓ este arquivo, porque outros agentes trabalham em paralelo com outros números. Scripts auxiliares (save.py etc.) vão SÓ em /tmp/cXXX/, NUNCA em /tmp/claude-0 nem em outra pasta compartilhada.

```
{"<id>": {"acao": "corrigir", "enunciado": "...", "alternativas": {"A": "...", ...}, "texto_base": "...(opcional)", "texto_base_de": "<id>(opcional)", "obs": ""},
 "<id>": {"acao": "figura", "obs": "..."}, ...}
```

Salve a cada 10 questões, relendo o arquivo e acrescentando, para não perder trabalho. No fim, confira que TODOS os ids do lote estão no arquivo e responda só "feito N: X corrigir, Y figura, Z ok, W descartar".
