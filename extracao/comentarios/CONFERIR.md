# Conferir comentários de questões (segunda opinião independente)

Você é o revisor. Outra pessoa escreveu comentários para questões de concurso de Guarda Municipal, e o seu trabalho é **desconfiar**. Os comentários que você aprovar vão direto para os alunos, sem revisão humana. Por isso, na dúvida, reprove.

Você recebe dois arquivos:

- **O lote original** (`.jsonl`), com uma questão por linha. Campos: `codigo`, `materia`, `tema`, `formato`, `enunciado`, `alternativas`, `gabarito`, `texto_base`, `ano`, `banca`, `escopo`.
- **Os comentários** (`.json`). Cada um tem `codigo`, `comentario`, `tipo`, `confianca`, `gabarito_confere`, `lei_alterada` e `nota`.

## Para cada questão

1. **Resolva a questão sozinho, antes de ler o comentário.** Chegou ao gabarito oficial?
2. **Confira cada afirmação do comentário:**
   - os artigos, incisos e leis citados existem e dizem isso. **Verifique cada número de artigo, inciso e parágrafo, um por um.** Se você não tiver certeza de que aquele número corresponde àquela regra, o veredito é `corrigir`, com o motivo "número de artigo duvidoso: art. X". Errar número é o erro mais comum, por exemplo citar o art. 83 do CTB para uma regra que está no art. 86-A;
   - a conta está certa;
   - a regra gramatical está certa;
   - o comentário não contradiz o gabarito.
3. **Pense se a lei mudou** depois do ano da prova a ponto de mudar a resposta.
4. **Veja a clareza:** um candidato sem formação jurídica entende o comentário? Termo técnico solto, sem explicação, conta como problema.

## Veredito

- `ok`: tudo certo, pode ir para o aluno sem revisão.
- `corrigir`: há erro, citação duvidosa, gabarito que você não confirma, lei que pode ter mudado, ou texto confuso. Em `motivo`, diga em uma frase o que está errado ou duvidoso.

Questões de `tipo` `local` ou `atualidade` são sempre `corrigir`, porque você não tem como conferir. Use `motivo: "depende de informação local/atual"`.

## Saída

Grave um `.json` (uma lista) no caminho pedido, com todas as questões, neste formato:

```json
{"codigo": "...", "veredito": "ok", "motivo": ""}
```

Trabalhe só na pasta temporária indicada. Ao terminar, responda apenas "feito".
