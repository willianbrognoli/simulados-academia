# Tarefa: identificar o gabarito da prova de GUARDA MUNICIPAL de cada concurso

Pasta de trabalho: /home/claude/extr (use caminhos absolutos; NÃO altere scripts nem arquivos de outras pastas).

Para cada id da sua lista:

1. Rode `python3 /home/claude/extr/info.py <id>`. Ele mostra:
   - quantas questões foram extraídas do caderno e o início do caderno (cargo, tipo/cor do caderno, nº de questões);
   - para cada arquivo de gabarito: se menciona DEFINITIVO/PRELIMINAR, as linhas onde aparece GUARDA e as sequências 1..N já detectadas automaticamente (`cand[i]`), com as respostas em sequência e os títulos logo acima.
2. Decida qual é o gabarito do cargo de Guarda Municipal / Guarda Civil Municipal / Guarda Metropolitana (o cargo do caderno). Cuidados:
   - Arquivos com vários cargos: use só o bloco do cargo de guarda (ou o do código de cargo/nível de escolaridade que o caderno indica).
   - Gabaritos em partes: às vezes as matérias comuns (ex.: Português 1–20) vêm por NÍVEL (Fundamental/Médio/Superior) e as específicas (21–40) vêm por CARGO. Monte a sequência inteira juntando o nível certo do cargo de guarda (normalmente MÉDIO; confira no caderno) + o bloco do cargo.
   - Tipos/cores de caderno (Tipo 1/2, A/B, Branca/Amarela): use o do caderno (veja o início do caderno). Se não der para saber, use o Tipo 1/A e marque `--conf media`.
   - Se houver `_gabarito_v1` e `_gabarito_v2`, prefira o DEFINITIVO.
   - Anuladas: símbolos como `*`, `X`, `NULA`, `ANULADA` → anulada.
   - O número de respostas deve bater com o nº de questões do caderno. Se o caderno extraído tiver 0 questões, use o nº declarado no caderno ou no gabarito.
   - Para ver o texto de um gabarito: `sed -n 'A,Bp' /home/claude/extr/lay/<arquivo>.txt` (com layout) ou `/home/claude/extr/raw/<arquivo>.txt` (sem layout). Leia só os trechos necessários: alguns arquivos são enormes.
3. Grave com o script (NÃO escreva JSON à mão):
   - candidato pronto: `python3 /home/claude/extr/pick.py <id> cand <arquivo_gabarito.txt> <idx> --fonte definitivo|preliminar|desconhecido [--anuladas 3,17] [--conf alta|media|baixa] [--obs "..."]`
   - montado à mão: `python3 /home/claude/extr/pick.py <id> manual <arquivo_gabarito.txt> "ABCDA*CB..." --fonte ... [--conf ...] [--obs "..."]`
     (a posição i da string é a questão i; use `*` para anulada; confira a contagem antes de gravar)
   - prova de CERTO/ERRADO ou VERDADEIRO/FALSO (Cebraspe etc.): use `manual` com `--ce` e a string em C/E (ou V/F): `python3 /home/claude/extr/pick.py <id> manual <arquivo> "CECCE*E..." --ce --fonte ...`
   - sem como determinar (escaneado, cargo não aparece, arquivo errado): `python3 /home/claude/extr/pick.py <id> nada "motivo curto"`
4. Nunca invente respostas. Na dúvida entre dois blocos, grave `nada` ou use `--conf baixa` explicando em `--obs`.

Ao terminar a lista, responda só com uma tabela curta: id | resultado (cand/manual/nada) | n | confiança | obs.
