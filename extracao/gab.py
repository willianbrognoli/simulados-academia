#!/usr/bin/env python3
"""Leitura heurística de gabaritos (texto -layout). Devolve candidatos de sequência 1..N."""
import re, sys, json, unicodedata

def norm(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().upper()

RESP = r'(?:[A-E]|\*|X|ANULADA|ANULAD[OA]|NULA|ANUL\.?)'
PAR = re.compile(r'(?<![\d/.,])0*(\d{1,3})\s*(?:[-–:.)=]\s*|\s+)(' + RESP + r')(?![A-Za-z])')

def tokens_pares(linha):
    return [(int(n), r) for n, r in PAR.findall(linha)]

def seqs_de(eventos):
    """eventos: lista ordenada de (pos, num, resp). Monta sequências 1..N consecutivas."""
    seqs, cur = [], None
    for pos, n, r in eventos:
        if n == 1:
            if cur and len(cur['r']) >= 5: seqs.append(cur)
            cur = {'pos': pos, 'r': {1: r}}
        elif cur and n == max(cur['r']) + 1:
            cur['r'][n] = r
        elif cur and n in cur['r']:
            continue
    if cur and len(cur['r']) >= 5: seqs.append(cur)
    return seqs

def eventos_tabela(linhas):
    """linha de números seguida (até 3 linhas depois) de linha de letras com a mesma quantidade."""
    ev = []
    for i, l in enumerate(linhas):
        nums = re.findall(r'(?<![\w/.,])0*(\d{1,3})(?![\w/.,])', l)
        if len(nums) < 3 or not re.fullmatch(r'[\s\d]+', l.strip() + ' '):
            continue
        for j in range(i + 1, min(i + 4, len(linhas))):
            ls = linhas[j].strip()
            if not ls: continue
            toks = re.findall(RESP, norm(ls))
            if len(toks) == len(nums) and re.fullmatch(r'[\sA-EX*]+|[\sA-Z*.]+', norm(ls)):
                for k, (n, r) in enumerate(zip(nums, toks)):
                    ev.append((i * 1000 + k, int(n), r))
            break
    return ev

def eventos_pares(linhas):
    ev = []
    for i, l in enumerate(linhas):
        for k, (n, r) in enumerate(tokens_pares(norm(l))):
            ev.append((i * 1000 + k, n, r))
    return ev

def eventos_coluna(linhas):
    """formato do pdftotext sem layout: número numa linha, letra na seguinte."""
    ev = []
    nums = []
    for i, l in enumerate(linhas):
        s = norm(l.strip())
        if re.fullmatch(r'0*\d{1,3}', s):
            nums.append((i, int(s)))
        elif re.fullmatch(RESP, s) and nums:
            j, n = nums.pop(0)
            ev.append((j * 1000, n, s))
        elif s:
            nums = []
    return ev

def candidatos(txt):
    linhas = [l for l in txt.replace('\f', '\n').split('\n') if 'pcimark' not in l]
    out = []
    for nome, f in (('pares', eventos_pares), ('tabela', eventos_tabela), ('coluna', eventos_coluna)):
        ev = sorted(f(linhas))
        for s in seqs_de(ev):
            out.append({'metodo': nome, 'linha': s['pos'] // 1000, 'r': s['r']})
    # posição das menções a guarda
    gm = [i for i, l in enumerate(linhas) if re.search(r'GUARDA|GCM\b|AGENTE DE SEGURAN', norm(l))]
    return out, gm, linhas

def normaliza(r):
    r = norm(r)
    return r if r in 'ABCDE' and len(r) == 1 else None   # anulada -> None

def escolher(txt, n_esperado):
    cands, gm, linhas = candidatos(txt)
    if not cands: return None, 'sem sequência'
    def chave(c): return tuple(c['r'].items())
    unicos = {}
    for c in cands:
        unicos.setdefault(chave(c), c)
    cands = list(unicos.values())
    exatos = [c for c in cands if len(c['r']) == n_esperado] if n_esperado else cands
    if len(exatos) == 1:
        c = exatos[0]
    elif len(exatos) > 1:
        # prefere a sequência logo depois de uma menção a GUARDA
        def dist(c):
            ds = [c['linha'] - g for g in gm if c['linha'] - g >= 0]
            return min(ds) if ds else 10 ** 9
        exatos.sort(key=dist)
        if dist(exatos[0]) == 10 ** 9 or (len(exatos) > 1 and dist(exatos[0]) == dist(exatos[1])):
            # todas iguais? então tanto faz
            if len({chave(c) for c in exatos}) == 1: c = exatos[0]
            else: return None, 'ambíguo (%d sequências)' % len(exatos)
        c = exatos[0]
    else:
        return None, 'nenhuma sequência com %s itens (achei %s)' % (n_esperado, sorted({len(c['r']) for c in cands}))
    return {str(k): normaliza(v) for k, v in c['r'].items()}, 'ok:' + c['metodo']

if __name__ == '__main__':
    r, st = escolher(open(sys.argv[1], encoding='utf-8', errors='ignore').read(), int(sys.argv[2]) if len(sys.argv) > 2 else None)
    print(st, json.dumps(r))
