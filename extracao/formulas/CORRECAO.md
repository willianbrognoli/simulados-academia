# Correção de fórmulas a partir do PDF

Você recebe `lote_XX.json`: uma lista de ids de questões de concurso cuja notação se perdeu na extração do PDF. Os dados atuais de cada questão estão em `/home/claude/extr/formulas/itens.json`, com enunciado, alternativas, gabarito, origem e o `motivo` apontado na triagem.

## Para cada questão

1. Gere as imagens da página:
   `python3 /home/claude/extr/formulas/pagina.py <id> /tmp/XX/`
   Abra os PNG com a ferramenta Read. Se o script disser "NAO ACHEI", localize a página você mesmo (por exemplo, `pdftotext -layout` no PDF e procure o número da questão), renderize com pymupdf e abra. Use só `/tmp/XX/`.
2. Compare a imagem com o texto atual e decida a `acao`:
   - `corrigir`: reescreva `enunciado` e `alternativas` FIELMENTE ao PDF, consertando:
     - a notação: potências, frações, raízes, símbolos;
     - o texto colado ou faltando;
     - o lixo de cabeçalho ou rodapé nas alternativas.

     Regras da notação:
     - Fórmula em LaTeX com `\( … \)` na linha e `\[ … \]` destacada. Exemplos: `\(x^2 - 9x - 36 = 0\)`, `\(\frac{3}{4}\)`, `\(\sqrt{2}\)`, `\(x_1\)`.
     - NUNCA use `$`.
     - Unidade simples pode ficar em Unicode (m², cm³). Texto normal fica texto normal.
     - Tabela pequena: linhas separadas por quebra de linha, colunas por " | ".
     - Mantenha as mesmas letras de alternativas.
   - `figura`: a questão depende de figura, gráfico, ícone ou imagem que não dá para escrever em texto. Explique em `obs`, por exemplo "gráfico de barras com 5 valores".
   - `ok`: o texto atual já está fiel e legível; o motivo da triagem era falso.
   - `descartar`: o PDF também está ilegível, ou a questão não fecha (falta parte). Explique em `obs`.
3. NUNCA invente dado que não está na imagem. NÃO resolva a questão nem mude o gabarito. Se o gabarito parecer claramente errado, só anote em `obs`.

## Saída

Grave `/home/claude/extr/formulas/res_XX.json` usando Python (json.dump com ensure_ascii=False e strings raw `r"..."` para não perder as barras do LaTeX):

```
{"<id>": {"acao": "corrigir", "enunciado": "...", "alternativas": {"A": "...", ...}, "obs": ""},
 "<id>": {"acao": "figura", "obs": "..."}, ...}
```

Salve de 10 em 10 questões, relendo e acrescentando, para não perder trabalho. No fim, confira que TODOS os ids do lote estão no arquivo e responda só "feito N: X corrigir, Y figura, Z ok, W descartar".
