#!/usr/bin/env python3
"""Resumo de uma prova para decidir o gabarito. Uso: python3 info.py <id>"""
import sys, glob, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gab import candidatos, norm
pid = sys.argv[1]
B = os.path.dirname(os.path.abspath(__file__))
qf = sorted(glob.glob(f'{B}/q/{pid}_prova*.json'))
print(f'### {pid}')
for f in qf:
    d = json.load(open(f))
    print(f'questões extraídas ({os.path.basename(f)}): {len(d["questoes"])}', '| 1ª:', (d['questoes'][0]['enunciado'][:90] if d['questoes'] else '-'))
cad = sorted(glob.glob(f'{B}/mu/{pid}_prova*.txt'))
if cad:
    ls = [l.strip() for l in open(cad[0], encoding='utf-8', errors='ignore') if l.strip() and 'pcimark' not in l][:22]
    print('caderno (início):', ' | '.join(ls)[:900])
for gf in sorted(glob.glob(f'{B}/lay/{pid}_gabarito*.txt')):
    txt = open(gf, encoding='utf-8', errors='ignore').read()
    cands, gm, linhas = candidatos(txt)
    nt = norm(txt)
    fonte = 'DEFINITIVO' if 'DEFINITIV' in nt else ('PRELIMINAR' if 'PRELIMINAR' in nt else '?')
    print(f'\n--- gabarito {os.path.basename(gf)} | {len(txt)} chars | {len(linhas)} linhas | menciona: {fonte} | linhas c/ GUARDA: {gm[:15]}')
    if len(re.sub(r"\s", "", txt)) < 200: print('   (quase sem texto: provavelmente escaneado)')
    for g in gm[:6]:
        print(f'   L{g}:', ' / '.join(x.strip() for x in linhas[max(0, g - 1):g + 3] if x.strip())[:300])
    vistos = set()
    for i, c in enumerate(cands):
        k = tuple(sorted(c['r'].items()))
        if k in vistos: continue
        vistos.add(k)
        head = [linhas[j].strip() for j in range(max(0, c['linha'] - 8), c['linha']) if linhas[j].strip()][-3:]
        resp = ''.join((v if len(v) == 1 else '*') for _, v in sorted(c['r'].items()))
        print(f'   cand[{i}] {c["metodo"]} L{c["linha"]} n={len(c["r"])} {resp} | antes: {" / ".join(head)[:200]}')
