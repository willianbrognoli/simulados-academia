# Tarefa: extrair questões de provas de Guarda Municipal que a leitura automática não conseguiu

Pasta: /home/claude/extr (caminhos absolutos; não altere scripts nem arquivos fora de /home/claude/extr/llm e /tmp).

Para cada id da sua lista:
1. `python3 /home/claude/extr/faltam.py <id>` mostra quais números de questão faltam e os arquivos de texto do caderno (`mu/` respeita colunas; `raw/` é a ordem do pdftotext; use o que estiver mais legível).
2. Leia o texto do caderno (com `sed -n 'A,Bp'` ou `grep -n` para achar "QUESTÃO", "01)", etc.) e transcreva **só as questões que faltam**, fiel ao original:
   - `enunciado`: texto do comando da questão (sem o número). Corrija só quebras de linha e hifenização da extração; não reescreva, não resuma, não corrija gramática.
   - `alternativas`: A–D ou A–E exatamente como no caderno (sem a letra). Em provas de CERTO/ERRADO, cada item é uma questão: enunciado = texto do item e `"alternativas": {"C": "Certo", "E": "Errado"}`.
   - Texto de apoio compartilhado (texto, poema, notícia): coloque em `textos_base` com uma chave (`tb1`, `tb2`...) e referencie em `texto_base_id` nas questões que dependem dele. Transcreva o texto inteiro uma vez só.
   - `materia`: escolha a mais adequada entre: Língua Portuguesa, Raciocínio Lógico-Matemático, Matemática, Informática, Conhecimentos Gerais e Atualidades, Direito Constitucional, Direito Administrativo, Direito Penal, Direito Processual Penal, Estatuto Geral das Guardas Municipais, Legislação de Trânsito, Direitos Humanos, Legislação Especial, Estatuto do Desarmamento, Estatuto da Criança e do Adolescente, Segurança Pública e Defesa Civil, Realidades Municipais, Lei Orgânica Municipal, Estatuto dos Servidores Municipais, Legislação Municipal.
   - Se a questão depende de imagem/figura/tabela que não está no texto, inclua mesmo assim e ponha `"alertas": ["depende de imagem"]`.
   - Se o texto da questão estiver ilegível/corrompido, pule a questão.
3. Escreva um arquivo `/tmp/q_<id>.json` (pode fazer em partes: um arquivo por vez com algumas questões) no formato:
   `{"textos_base": {"tb1": "..."}, "questoes": [{"numero": 7, "enunciado": "...", "alternativas": {"A": "...", "B": "...", "C": "...", "D": "..."}, "texto_base_id": null, "materia": "Língua Portuguesa"}]}`
   e grave com `python3 /home/claude/extr/salvar_q.py <id> /tmp/q_<id>.json`. O script valida contra o gabarito e acumula; corrija o que ele apontar como erro.
4. Não invente nada: só o que está no caderno. Se o caderno não tem texto legível (escaneado/corrompido), pule o id.

Ao terminar, responda só com uma tabela curta: id | faltavam | gravadas | obs.

## Regras extras (importante)
- NUNCA complete dados que a extração perdeu (números de tabela, fórmulas, palavras grifadas). Transcreva o que existe e ponha em `alertas` o que se perdeu (ex.: "valores da tabela perdidos", "destaque do termo perdido"). Questão com alerta vai para revisão humana.
- Use uma pasta temporária só sua: `/tmp/<seu id de lote>/` (ex.: /tmp/qlote_09/). Não use /tmp/w nem pastas de outros agentes.
