#!/usr/bin/env python3
"""Grava o gabarito escolhido.
  python3 pick.py <id> cand <arquivo_gabarito> <idx> [--anuladas 3,7] [--fonte definitivo|preliminar|desconhecido] [--conf alta|media|baixa] [--obs "texto"]
  python3 pick.py <id> manual <arquivo_gabarito> "ABCD*ABC..."   (posição i = questão i; * = anulada)
  python3 pick.py <id> nada "motivo"
"""
import sys, json, os, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gab import candidatos
B = os.path.dirname(os.path.abspath(__file__))
os.makedirs(f'{B}/g', exist_ok=True)
p = argparse.ArgumentParser()
p.add_argument('id'); p.add_argument('modo'); p.add_argument('a', nargs='?'); p.add_argument('b', nargs='?')
p.add_argument('--anuladas', default=''); p.add_argument('--fonte', default='desconhecido')
p.add_argument('--conf', default='alta'); p.add_argument('--ce', action='store_true'); p.add_argument('--obs', default='')
a = p.parse_args()
out = {'id': a.id, 'fonte': a.fonte, 'confianca': a.conf, 'obs': a.obs}
if a.modo == 'nada':
    out.update(respostas={}, obs=a.a or a.obs, confianca='nenhuma')
else:
    gf = a.a if os.path.isabs(a.a) else f'{B}/lay/{os.path.basename(a.a)}'
    out['arquivo'] = os.path.basename(gf)
    if a.modo == 'cand':
        cands, _, _ = candidatos(open(gf, encoding='utf-8', errors='ignore').read())
        r = cands[int(a.b)]['r']
        resp = {str(k): (v if v in ('A', 'B', 'C', 'D', 'E') else None) for k, v in sorted(r.items())}
    else:
        s = a.b.replace(' ', '').upper()
        if a.ce:  # certo/errado: C/E ou V/F (V=C, F=E)
            s = s.replace('V', 'C').replace('F', 'E')
            resp = {str(i + 1): (ch if ch in 'CE' else None) for i, ch in enumerate(s)}
        else:
            resp = {str(i + 1): (ch if ch in 'ABCDE' else None) for i, ch in enumerate(s)}
        out['formato'] = 'CE' if a.ce else None
    for n in filter(None, a.anuladas.split(',')): resp[str(int(n))] = None
    out['respostas'] = resp
    out['n'] = len(resp)
json.dump(out, open(f'{B}/g/{a.id}.json', 'w'), ensure_ascii=False)
print('gravado', a.id, out.get('n'), 'itens', ''.join((v or '*') for v in out.get('respostas', {}).values()))
