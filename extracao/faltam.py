#!/usr/bin/env python3
"""Mostra o que falta extrair de uma prova. Uso: python3 faltam.py <id>"""
import sys, json, glob, os
B = os.path.dirname(os.path.abspath(__file__))
pid = sys.argv[1]
g = json.load(open(f'{B}/g/{pid}.json'))
r = g['respostas']
ja = set()
f = f'{B}/extraido/{pid}.json'
if os.path.exists(f):
    ja = {q['origem']['numero_original'] for q in json.load(open(f))['questoes']}
falta = [int(k) for k in r if int(k) not in ja]
ce = all(v in ('C', 'E', None) for v in r.values())
print(f'### {pid}: gabarito com {len(r)} itens; já extraídas {len(ja)}; FALTAM {len(falta)}: {falta}')
print('formato provável:', 'CERTO/ERRADO' if ce else 'múltipla escolha')
for t in sorted(glob.glob(f'{B}/mu/{pid}_prova*.txt')) + sorted(glob.glob(f'{B}/raw/{pid}_prova*.txt')):
    n = len(open(t, errors='ignore').read())
    print(f'texto: {t} ({n} chars)')
