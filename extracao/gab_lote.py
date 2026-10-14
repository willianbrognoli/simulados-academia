import json, glob, os, re
from gab import candidatos, normaliza
os.makedirs('g', exist_ok=True)
res = {}
for qf in sorted(glob.glob('q/*_prova*.json')):
    pid = re.sub(r'_prova(_v\d+)?\.json$', '', os.path.basename(qf))
    if pid in res: continue
    n = len(json.load(open(qf))['questoes'])
    gfs = sorted(glob.glob(f'lay/{pid}_gabarito*.txt'))
    if not gfs: res[pid] = ('sem_gabarito', n, None); continue
    # usa o último (v2 costuma ser o definitivo)
    melhor = None
    for gf in reversed(gfs):
        txt = open(gf, encoding='utf-8', errors='ignore').read()
        cands, gm, _ = candidatos(txt)
        distintas = {tuple(sorted(c['r'].items())) for c in cands}
        longas = [c for c in cands if len(c['r']) >= 10]
        dl = {tuple(sorted(c['r'].items())) for c in longas}
        if len(dl) == 1 and n and len(longas[0]['r']) == n:
            melhor = ('ok', n, {str(k): normaliza(v) for k, v in longas[0]['r'].items()}, os.path.basename(gf)); break
    res[pid] = melhor or ('llm', n, None)
json.dump(res, open('gab_heur.json', 'w'))
import collections; print(collections.Counter(v[0] for v in res.values()), len(res))
