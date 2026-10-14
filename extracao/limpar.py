"""Limpeza segura de lixo de página na ÚLTIMA alternativa e unidades (m2 -> m²)."""
import re
SEC = (r'L[IÍ]NGUA PORTUGUESA|PORTUGU[EÊ]S|MATEM[AÁ]TICA|RACIOC[IÍ]NIO L[OÓ]GICO[\w -]*|INFORM[AÁ]TICA|ATUALIDADES|GEOGRAFIA|HIST[OÓ]RIA'
       r'|CONHECIMENTOS (?:GERAIS|ESPEC[IÍ]FICOS|B[AÁ]SICOS|REGIONAIS|LOCAIS)[\w -]*|LEGISLA[CÇ][AÃ]O[\w -]*|NO[CÇ][OÕ]ES DE[\w -]*|DIREITO[\w -]*'
       r'|GUARDA(?: CIVIL)?(?: MUNICIPAL)?|ESTATUTO[\w -]*|[EÉ]TICA[\w -]*|REDA[CÇ][AÃ]O|PROVA[\w -]*|RASCUNHO')
SECS = '(?:' + SEC + r')(?:\s+E\s+(?:' + SEC + r'))*'
FIM = [
    re.compile(r'\s*_{5,}.*$', re.S),
    re.compile(r'\s+(?:QUEST[OÕ]ES?\s+(?:DE\s+)?\d+\s*(?:A|E|-|–)\s*\d+.*|' + SECS + r')\s*$'),
    re.compile(r'(?<=[\d.!?)%])\s+' + SECS + r'\s*$', re.I),
    re.compile(r'(?<=[.!?)])\s+[^.]*\bquest(?:ões|ão|oes)\s+\d+(?:\s*(?:,|e|a)\s*\d+)*\s*\.?\s*$', re.I),
    re.compile(r'(?<=[.!?)])\s+\d{1,3}\s*$'),
]
UNID = re.compile(r'(?<=\d)(\s?)(k|c|d|m)?m([23])\b')
def limpar_alt(s):
    for _ in range(3):
        a = s
        for p in FIM: s = p.sub('', s).rstrip()
        if s == a: break
    return s
def sup(m): return m.group(1) + (m.group(2) or '') + 'm' + {'2': '²', '3': '³'}[m.group(3)]
def limpar(q):
    alts = q.get('alternativas') or {}
    if alts and q.get('formato') != 'CE':
        k = list(alts)[-1]; alts[k] = limpar_alt(alts[k])
    q['enunciado'] = UNID.sub(sup, q['enunciado'])
    for k in alts: alts[k] = UNID.sub(sup, alts[k])
    return q

if __name__ == '__main__':
    for s, esp in [('10.654. 5', '10.654.'), ('21 metros GEOGRAFIA', '21 metros'), ('I, II, III e IV GUARDA', 'I, II, III e IV'),
                   ('3 _______ QUESTÕES DE 26 A 30 - INFORMÁTICA', '3'), ('152. Atualidades', '152.'), ('152', '152'), ('plena. MATEMÁTICA E RACIOCÍNIO LÓGICO', 'plena.'),
                   ('Lei Maria da Penha.', 'Lei Maria da Penha.'), ('IBGE', 'IBGE'), ('direito penal', 'direito penal'),
                   ('Rh- . A partir destes dados, responda as questões 23, 24 e 25.', 'Rh- .'), ('o STF e o STJ.', 'o STF e o STJ.')]:
        assert limpar_alt(s) == esp, (s, limpar_alt(s))
    assert UNID.sub(sup, 'área de 120 m2 e 3 cm3; x2') == 'área de 120 m² e 3 cm³; x2'
    print('ok')
