#!/usr/bin/env python3
"""Uso: pagina.py <id-da-questão> <pasta-saida>
Acha a página do PDF onde a questão está e salva PNG (150 dpi) dela e da seguinte. Imprime os caminhos."""
import sys, json, re, unicodedata, os, pymupdf
qid, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
Q = json.load(open('itens.json'))[qid]
arq = Q['origem'].get('arquivo') or re.sub(r'-q\d+$', '', qid) + '_prova.pdf'
import glob
pdf = (glob.glob('/mnt/user-data/uploads/provas-gcm/*/pdf/' + arq) or [arq])[0]
def n(s): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())
alvo = n(Q['enunciado'])[:40]
doc = pymupdf.open(pdf)
pg = None
for tam in (40, 25, 15):
    for i, p in enumerate(doc):
        if alvo[:tam] and alvo[:tam] in n(p.get_text()): pg = i; break
    if pg is not None: break
if pg is None: print('NAO ACHEI a página; PDF:', pdf, 'páginas:', len(doc)); sys.exit(1)
for i in (pg, pg + 1):
    if i < len(doc):
        f = f'{out}/{qid}_p{i + 1}.png'; doc[i].get_pixmap(dpi=150).save(f); print(f)
