import json, glob, os, sys
from parse import extrair
from concurrent.futures import ProcessPoolExecutor
os.makedirs('q', exist_ok=True)
def um(f):
    b = os.path.basename(f)[:-4]
    try:
        r = extrair(open(f, encoding='utf-8', errors='ignore').read())
    except Exception as e:
        r = {'questoes': [], 'textos_base': {}, 'avisos': ['erro: %s' % e]}
    json.dump(r, open('q/%s.json' % b, 'w'), ensure_ascii=False)
    qs = r['questoes']
    ok = sum(1 for q in qs if q['formato'] and q['enunciado'])
    return b, len(qs), ok
if __name__ == '__main__':
    fs = sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else 'mu/*.txt'))
    with ProcessPoolExecutor(8) as ex: res = list(ex.map(um, fs))
    json.dump(res, open('stats.json', 'w'))
    import collections
    tot = sum(r[1] for r in res); ok = sum(r[2] for r in res)
    zero = [r[0] for r in res if r[1] < 5]
    boas = [r for r in res if r[1] >= 5 and r[2] / r[1] >= 0.9]
    print('provas', len(res), 'questoes', tot, 'completas', ok, 'sem extração', len(zero), 'provas >=90% completas', len(boas))
    print(collections.Counter(min(r[1] // 10 * 10, 100) for r in res))
