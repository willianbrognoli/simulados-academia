#!/usr/bin/env python3
"""PDF -> texto em ordem de leitura respeitando 2 colunas (PyMuPDF). Uso: totext.py in.pdf out.txt"""
import sys, pymupdf
def pagina(p):
    W = p.rect.width
    bl = [b for b in p.get_text('blocks', sort=False) if b[6] == 0 and b[4].strip()]
    bl.sort(key=lambda b: (round(b[1]), b[0]))
    out, banda = [], []
    def flush():
        esq = sorted([b for b in banda if (b[0] + b[2]) / 2 < W / 2], key=lambda b: (b[1], b[0]))
        dir_ = sorted([b for b in banda if (b[0] + b[2]) / 2 >= W / 2], key=lambda b: (b[1], b[0]))
        for b in esq + dir_: out.append(b[4].rstrip())
        banda.clear()
    for b in bl:
        largo = b[0] < W * 0.40 and b[2] > W * 0.60
        if largo:
            flush(); out.append(b[4].rstrip())
        else:
            banda.append(b)
    flush()
    return '\n'.join(out)
doc = pymupdf.open(sys.argv[1])
open(sys.argv[2], 'w', encoding='utf-8').write('\n\f'.join(pagina(p) for p in doc))
