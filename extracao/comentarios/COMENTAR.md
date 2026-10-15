# Comentar questões de concurso de Guarda Municipal

Você recebe um arquivo `.jsonl` com uma questão por linha. Os campos são:

- `codigo`, `materia`, `tema`, `formato` (`ME` = múltipla escolha; `CE` = certo ou errado);
- `enunciado`, `alternativas` (objeto letra → texto), `gabarito` (letra oficial da banca);
- `texto_base` (texto de apoio, quando houver), `ano`, `banca`, `municipio`, `uf`;
- `escopo` (`nacional` ou `municipal`).

Notação usada nos textos:

- `__trecho__` marca um trecho grifado na prova;
- `\( … \)` e `\[ … \]` marcam fórmulas em LaTeX.

## Público

Quem lê é candidato a guarda municipal, quase sempre **sem formação jurídica**. Escreva como um bom professor de cursinho explicaria em sala: frases claras e encadeadas, vocabulário simples, e o termo técnico explicado na primeira vez que aparecer.

## O comentário

Escreva de 3 a 7 frases, em português do Brasil, em texto corrido, sem markdown nem títulos. Siga esta ordem:

1. Por que a alternativa do gabarito está certa. É aqui que se cita a fonte exata: artigo, inciso e lei (ex.: "art. 5º, XI, da Constituição"), regra gramatical, conta resolvida passo a passo ou conceito.
2. Por que as alternativas erradas mais tentadoras estão erradas. Escolha uma ou duas e diga onde está a pegadinha.
3. Quando for útil, uma dica curta para lembrar na prova.

Regras por tipo de questão:

- **Cálculo:** mostre a conta. Fórmulas vão em `\( \)`.
- **Interpretação de texto:** aponte o trecho do texto que sustenta a resposta.
- **Certo/errado:** explique por que a afirmação está certa ou errada.

Não invente artigo, súmula ou número de lei. **Só cite o número de um artigo, inciso ou parágrafo se tiver certeza absoluta de que é aquele.** Errar o número é pior que não citar. Se tiver qualquer dúvida, cite só a lei ("o Código de Trânsito determina…"), sem o número, e mantenha a confiança. Se a dúvida for sobre a própria regra, use `confianca: "baixa"`.

## Verificações obrigatórias (honestidade acima de tudo)

**Gabarito.** Resolva a questão você mesmo antes de escrever.

- Se a sua resposta for diferente do gabarito oficial, marque `gabarito_confere: false` e explique em `nota`.
- Não escreva um comentário defendendo uma resposta que você acha errada.

**Lei atualizada.** Pense se a lei, ou o entendimento cobrado, mudou depois do ano da prova. Exemplos: Pacote Anticrime (Lei 13.964/2019), Estatuto da Pessoa Idosa (Lei 14.423/2022), mudanças no CTB, na Lei de Drogas, no ECA, nas Leis 13.022/2014 e 13.675/2018, e decisões do STF sobre guardas municipais.

Se mudou, há duas situações:

- **Mudou e o gabarito deixou de valer:** marque `lei_alterada: true` e diga em `nota` o que mudou.
- **Mudou, mas o gabarito continua valendo:** escreva o comentário com a lei vigente e mencione a mudança no próprio comentário.

**Classificação (`tipo`):**

- `lei_seca`: a resposta está no texto de uma lei ou da Constituição;
- `calculo`;
- `gramatica`: regra objetiva da norma culta;
- `conceito`: definição técnica estável (informática, primeiros socorros etc.);
- `interpretacao`: depende de ler o texto de apoio;
- `local`: história, geografia ou lei da cidade ou do estado. Neste caso você normalmente não tem como conferir, então use `confianca: "baixa"`;
- `atualidade`: fatos ou dados que mudam com o tempo;
- `opiniao`: a resposta depende de doutrina divergente ou a questão é mal formulada.

**Confiança:**

- `alta` só quando você tem certeza da resposta **e** da fonte citada.
- Em qualquer dúvida, use `baixa`.

## Saída

Grave um arquivo `.json` (uma lista) no caminho pedido. Cada elemento deve ter este formato:

```json
{"codigo": "...", "comentario": "...", "tipo": "lei_seca", "confianca": "alta", "gabarito_confere": true, "lei_alterada": false, "nota": ""}
```

Inclua **todas** as questões do lote, na mesma ordem. Use `nota` para qualquer coisa que o revisor humano precise saber; se não houver nada, deixe vazio.

Trabalhe só na pasta temporária indicada. Nunca use pastas compartilhadas com outros agentes. Ao terminar, responda apenas "feito".
