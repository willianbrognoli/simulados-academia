# Triagem de fórmulas (só leitura de texto)

Você recebe um arquivo `lote_XX.json` com questões de concurso extraídas de PDF. A extração costuma estragar notação matemática.

Para CADA questão, decida:
- `ok`: dá para ler e resolver como está. Isso inclui potências claras (x², 10³), frações escritas como 3/4 e texto sem fórmula.
- `quebrada`: a notação se perdeu. Exemplos:
  - expoente achatado e ambíguo ("x2 – 9x", "(x1)2", "2 50 3 h t t t");
  - fração ou raiz desmontada;
  - operadores ou símbolos faltando ou trocados por caracteres estranhos;
  - números colados ou em ordem embaralhada;
  - tabela ou matriz ilegível;
  - alternativas que perderam o símbolo (só "2" onde deveria ser "√2");
  - enunciado que depende de figura ou gráfico ausente;
  - lixo de cabeçalho dentro de alternativa ("10 INFORMÁTICA").

Atenção:
- NÃO resolva as questões nem confira o gabarito.
- Na dúvida, marque `quebrada`: é melhor revisar demais do que deixar aluno ver fórmula errada.
- "m2"/"cm2"/"km3" (unidade) sozinho NÃO é motivo: isso é corrigido automaticamente.

Grave `triagem/res_XX.json` (mesmo número do lote) no formato:
{"<id>": "ok", "<id>": "quebrada: motivo curto", ...}
com TODAS as questões do lote. Confira a contagem antes de terminar e responda só "feito N questões, Q quebradas".
