#!/usr/bin/env python3
"""Extrai questões de um caderno de prova (texto do pdftotext, modo leitura).
Uso: parse.py arquivo.txt  -> imprime JSON {questoes:[...], textos_base:{...}, avisos:[...]}"""
import re, sys, json, unicodedata
from collections import Counter

def norm(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().upper()

# ---------- matérias por cabeçalho de seção ----------
SECOES = [
    (r'LINGUA PORTUGUESA|PORTUGUES\b|INTERPRETACAO DE TEXTO', 'Língua Portuguesa'),
    (r'RACIOCINIO LOGICO|LOGICA', 'Raciocínio Lógico-Matemático'),
    (r'MATEMATICA', 'Matemática'),
    (r'INFORMATICA|NOCOES DE COMPUTACAO', 'Informática'),
    (r'ATUALIDADES|CONHECIMENTOS GERAIS|CULTURA GERAL|ESTUDOS SOCIAIS|HISTORIA|GEOGRAFIA', 'Conhecimentos Gerais e Atualidades'),
    (r'REALIDADE|CONHECIMENTOS (DO|SOBRE O) MUNICIPIO|HISTORIA DO MUNICIPIO|ASPECTOS (HISTORICOS|GERAIS) D', 'Realidades Municipais'),
    (r'LEI ORGANICA', 'Lei Orgânica Municipal'),
    (r'ESTATUTO DOS? (SERVIDORES|FUNCIONARIOS)', 'Estatuto dos Servidores Municipais'),
    (r'LEGISLACAO MUNICIPAL', 'Legislação Municipal'),
    (r'DIREITO CONSTITUCIONAL|CONSTITUICAO', 'Direito Constitucional'),
    (r'DIREITO ADMINISTRATIVO', 'Direito Administrativo'),
    (r'PROCESSO PENAL|PROCESSUAL PENAL', 'Direito Processual Penal'),
    (r'DIREITO PENAL', 'Direito Penal'),
    (r'DIREITOS HUMANOS', 'Direitos Humanos'),
    (r'TRANSITO', 'Legislação de Trânsito'),
    (r'ESTATUTO GERAL|13\.?022|GUARDAS? (CIVIS? )?MUNICIPA', 'Estatuto Geral das Guardas Municipais'),
    (r'LEGISLACAO|CONHECIMENTOS ESPECIFICOS|ESPECIFIC', None),   # genérico: classifica por questão
]

# classificação por questão (quando a seção é genérica ou não existe)
PALAVRAS = [
    ('Estatuto Geral das Guardas Municipais', r'13\.022|ESTATUTO GERAL DAS GUARDAS|GUARDA MUNICIPAL|GUARDAS MUNICIPAIS|GUARDA CIVIL'),
    ('Legislação de Trânsito', r'TRANSITO|CTB|9\.503|CONDUTOR|VEICULO|HABILITACAO|INFRACAO GRAVISSIMA'),
    ('Estatuto da Criança e do Adolescente', r'8\.069|ESTATUTO DA CRIANCA|ADOLESCENTE|ECA\b'),
    ('Estatuto do Desarmamento', r'10\.826|DESARMAMENTO|ARMA DE FOGO'),
    ('Direitos Humanos', r'DIREITOS HUMANOS|DECLARACAO UNIVERSAL'),
    ('Direito Processual Penal', r'PROCESSO PENAL|INQUERITO|FLAGRANTE|PRISAO PREVENTIVA|PRISAO TEMPORARIA'),
    ('Direito Penal', r'CODIGO PENAL|CRIME|PENA DE|DOLO|CULPOSO|LEGITIMA DEFESA|ABUSO DE AUTORIDADE|13\.869|11\.340|MARIA DA PENHA|11\.343|DROGAS'),
    ('Direito Constitucional', r'CONSTITUICAO|CF/88|ART\. 5|ART\. 144|DIREITOS FUNDAMENTAIS|DIREITOS E GARANTIAS'),
    ('Direito Administrativo', r'ADMINISTRACAO PUBLICA|ATO ADMINISTRATIVO|SERVIDOR PUBLICO|LICITACAO|IMPROBIDADE|PODER DE POLICIA'),
    ('Informática', r'WINDOWS|EXCEL|WORD|NAVEGADOR|INTERNET|E-MAIL|CTRL|TECLA|PLANILHA|SOFTWARE|HARDWARE|LINUX|LIBREOFFICE|POWERPOINT'),
    ('Raciocínio Lógico-Matemático', r'PROPOSICAO|NEGACAO|LOGICAMENTE|SEQUENCIA|PORCENTAGEM|\d+ ?%|RAZAO|PROBABILIDADE|EQUACAO|QUANTOS|CALCULE|RESULTADO D'),
    ('Língua Portuguesa', r'\bTEXTO\b|PALAVRA|ORACAO|CONCORDANCIA|REGENCIA|CRASE|PONTUACAO|SINONIMO|ACENTUA|VERBO|SUBSTANTIVO|ADJETIVO|SILAB'),
]

LIXO = re.compile(r'P[áa]gina \d+\s*(de \d+)?\s*$|Tipo \d+ – Cor \w+|pcimarkpci|www\.pciconcursos\.com\.br|^\s*P[áa]gina \d+|^\s*\d+\s*/\s*\d+\s*$|^\s*-\s*\d+\s*-\s*$', re.I)
QINI = re.compile(r'^\s*(?:QUEST[ÃA]O|Quest[ãa]o)?\s*[Nn]?[ºo°]?\s*0*(\d{1,3})\s*(?:[\)\.\-–—:]|\s{2,}|$)\s*(.*)$')
QINI2 = re.compile(r'^\s*(?:QUEST[ÃA]O|Quest[ãa]o)\s*[Nn]?[ºo°.]?\s*0*(\d{1,3})\b\s*[\)\.\-–—:]?\s*(.*)$')
QORD = re.compile(r'^\s*0*(\d{1,3})\s*[ªaº°]\s*QUEST[ÃA]O\s*[)\.\-–—:]?\s*(.*)$', re.I)
ALT_PAD = re.compile(r'^\s*\(?\s*([A-Ea-e])\s*[\)\.\-–—]\s*(.*)$')
ALT_LIVRE = re.compile(r'^\s*\(?\s*([A-E])\s*(?:[\)\.\-–—]|\s(?=[A-ZÀ-Úa-zà-ú“"(\d]))\s*(.*)$')
ALT = ALT_PAD
ALT_SO = re.compile(r'^\s*\(?([A-E])\)?\s*$')
IMG = re.compile(r'\b(FIGURA|IMAGEM|CHARGE|TIRINHA|TIRA\b|GRAFICO|ILUSTRACAO|QUADRINHO|FOTO|MAPA|TABELA)\b')

def limpar(txt):
    txt = re.sub(r'\b(?:Check-square|SQUARE)\b', '', txt)
    linhas = [l.rstrip() for l in txt.replace('\f', '\n').split('\n')]
    linhas = [l for l in linhas if not LIXO.search(l)]
    # cabeçalhos/rodapés repetidos (aparecem em várias páginas)
    c = Counter(l.strip() for l in linhas if 6 < len(l.strip()) < 120)
    rep = {k for k, v in c.items() if v >= 4 and not ALT.match(k) and not re.match(r'^[A-E]$', k)}
    return [l for l in linhas if l.strip() not in rep]

def secao(linha):
    n = norm(linha.strip())
    if len(n) > 90 or len(n) < 4: return False, None
    letras = re.sub(r'[^A-Z]', '', n)
    # cabeçalho: majoritariamente maiúsculas no original
    orig = re.sub(r'[^A-Za-zÀ-ÿ]', '', linha)
    if not orig or sum(ch.isupper() for ch in orig) / len(orig) < 0.8: return False, None
    for pat, mat in SECOES:
        if re.search(pat, n): return True, mat
    return False, None

def classificar(texto):
    n = norm(texto)
    for mat, pat in PALAVRAS:
        if re.search(pat, n): return mat
    return None

def extrair(txt, modo='cadeia', livre=False):
    global ALT
    ALT = ALT_LIVRE if livre else ALT_PAD
    L = limpar(txt)
    # 1) localizar inícios de questão em sequência 1,2,3... (recomeça a cadeia a cada "1"; fica a mais longa)
    def tem_alt(i):
        janela = L[i + 1:i + 150]
        return any(ALT.match(x) and ALT.match(x).group(1).upper() == 'A' for x in janela) or any(ALT_SO.match(x) for x in janela)
    cadeias, cur = [], None
    for i, l in enumerate(L):
        m = QORD.match(l) or QINI2.match(l) or QINI.match(l)
        if not m: continue
        n = int(m.group(1))
        if n == 1 and tem_alt(i):
            if cur: cadeias.append(cur)
            cur = [(i, 1, m.group(2).strip())]
        elif cur and n == cur[-1][1] + 1 and tem_alt(i):
            cur.append((i, n, m.group(2).strip()))
    if cur: cadeias.append(cur)
    def qualidade(c):
        q = 0
        for k, (ini, n, r) in enumerate(c):
            fim = c[k + 1][0] if k + 1 < len(c) else min(len(L), ini + 200)
            letras = {(ALT.match(x) or ALT_SO.match(x)).group(1).upper() for x in L[ini + 1:fim] if ALT.match(x) or ALT_SO.match(x)}
            q += len(letras & set('ABCD')) >= 3
        return q
    starts = max(cadeias, key=qualidade) if cadeias else []
    if modo == 'seq':  # varredura simples: só aceita o próximo número esperado
        starts, esperado = [], 1
        for i, l in enumerate(L):
            m = QORD.match(l) or QINI2.match(l) or QINI.match(l)
            if m and int(m.group(1)) == esperado and tem_alt(i):
                starts.append((i, esperado, m.group(2).strip())); esperado += 1
    avisos = []
    if len(starts) < 5:
        return {'questoes': [], 'textos_base': {}, 'avisos': ['poucas questões encontradas (%d)' % len(starts)]}

    # 2) seções antes de cada questão
    mat_atual = None
    secao_por_linha = {}
    for idx, l in enumerate(L):
        eh, mat = secao(l)
        if eh:
            mat_atual = mat
        secao_por_linha[idx] = mat_atual

    questoes, textos, tb_atual, tb_range = [], {}, None, None
    for k, (ini, num, resto) in enumerate(starts):
        fim = starts[k + 1][0] if k + 1 < len(starts) else len(L)
        bloco = L[ini + 1:fim]
        # separa alternativas
        enun = [resto] if resto else []
        alts, atual, letra_esp = {}, None, 'A'
        trailing = []
        for l in bloco:
            m = ALT.match(l)
            ms = ALT_SO.match(l)
            letra = (m.group(1).upper() if m else (ms.group(1) if ms else None))
            if letra and letra == letra_esp and (letra != 'A' or True):
                atual = letra
                alts[letra] = (m.group(2).strip() if m else '')
                letra_esp = chr(ord(letra) + 1)
                continue
            if atual is None:
                enun.append(l)
            else:
                if l.strip() == '':
                    # linha em branco depois da última alternativa: o resto é material entre questões
                    if letra_esp > 'D':
                        atual = '#'
                    continue
                if atual == '#':
                    trailing.append(l)
                else:
                    alts[atual] = (alts[atual] + ' ' + l.strip()).strip()
        # material entre questões (texto-base / cabeçalho) vai para a próxima
        enun_txt = re.sub(r'\s+', ' ', ' '.join(x.strip() for x in enun)).strip()
        q = {'numero': num, 'enunciado': enun_txt, 'alternativas': alts, 'trailing': trailing,
             'materia_secao': secao_por_linha.get(ini)}
        questoes.append(q)

    # 3) texto-base: material longo entre a última alternativa de uma questão e a próxima
    tb_n = 0
    pend = None
    for k, q in enumerate(questoes):
        if pend:
            q['_tb'] = pend
        tr = [x for x in q.pop('trailing') if not secao(x)[0]]
        t = '\n'.join(x.strip() for x in tr).strip()
        if len(t) > 250:
            tb_n += 1
            chave = 'tb%d' % tb_n
            textos[chave] = re.sub(r'\n(?=[a-zà-ÿ,;])', ' ', t)
            pend = chave
            # questões que dependem do texto seguem; para quando a questão não fala de texto
        elif pend and k > 0:
            pass
        if pend and '_tb' in q and not re.search(r'TEXTO|TRECHO|PARAGRAFO|AUTOR|LINHA|ESTROFE|VERSO|FRAGMENTO', norm(q['enunciado'])):
            del q['_tb']
            pend = None

    # 4) monta saída
    saida = []
    for q in questoes:
        alts = q['alternativas']
        letras = ''.join(sorted(alts))
        if letras == 'ABCDE': fmt = 'ME5'
        elif letras == 'ABCD': fmt = 'ME4'
        else:
            fmt = None
        mat = q['materia_secao']
        if mat in (None, 'Conhecimentos Gerais e Atualidades'):
            mat = classificar(q['enunciado'] + ' ' + ' '.join(alts.values())) or mat
        alertas = []
        if IMG.search(norm(q['enunciado'])): alertas.append('pode depender de imagem')
        if not q['enunciado']: alertas.append('enunciado vazio')
        if any(len(re.sub(r'[^\wÀ-ÿ]', '', v)) < 1 for v in alts.values()): alertas.append('alternativa vazia')
        if not q['materia_secao']: alertas.append('matéria por palavra-chave')
        saida.append({'numero': q['numero'], 'formato': fmt, 'enunciado': q['enunciado'],
                      'alternativas': alts, 'materia': mat, 'texto_base_id': q.get('_tb'), 'alertas': alertas})
    return {'questoes': saida, 'textos_base': textos, 'avisos': avisos}

if __name__ == '__main__':
    print(json.dumps(extrair(open(sys.argv[1], encoding='utf-8', errors='ignore').read()), ensure_ascii=False, indent=1))
