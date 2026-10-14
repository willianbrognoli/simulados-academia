import json, glob, os, csv, re, collections, unicodedata
from parse import classificar
INV = {}
for r in csv.DictReader(open(os.environ.get('INV_NACIONAL', '../provas-gcm/nacional/inventario.csv'), encoding='utf-8'), delimiter=';'):
    INV[r['id']] = dict(municipio=r['municipio'], uf=r['uf'], cargo=r['cargo'], ano=r['ano'], banca=r['banca'], status=r['status'])
for r in csv.DictReader(open(os.environ.get('INV_VUNESP', '../provas-gcm/vunesp/inventario.csv'), encoding='utf-8'), delimiter=';'):
    INV[r['id']] = dict(municipio=r['municipio'], uf=r.get('uf') or 'SP', cargo=r['cargo'], ano=r['ano'], banca='Vunesp', status=r['status'])
LOCAL = {'Realidades Municipais', 'Lei Orgânica Municipal', 'Estatuto dos Servidores Municipais', 'Legislação Municipal'}
G = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob('g/*.json')}
esc = json.load(open('escolha.json'))
os.makedirs('extraido', exist_ok=True)
st = collections.Counter(); rel = []
for pid, g in sorted(G.items()):
    r = g.get('respostas') or {}
    inv = INV.get(pid)
    if not r or not inv or pid not in esc:
        st['sem_dados'] += 1; continue
    if inv['status'] == 'duplicata':
        st['duplicata'] += 1; continue
    f, s, n = esc[pid]
    d = json.load(open(f))
    nums = {q['numero']: q for q in d['questoes']}
    fonte = g.get('fonte') if g.get('fonte') in ('definitivo', 'preliminar') else None
    qs, usados = [], set()
    for k, v in sorted(r.items(), key=lambda x: int(x[0])):
        q = nums.get(int(k))
        if not q or not q['formato'] or not q['enunciado']:
            continue
        if v is not None and v not in q['alternativas']:
            continue
        mat = q['materia'] or classificar(q['enunciado']) or 'Conhecimentos Gerais e Atualidades'
        alertas = list(q['alertas'])
        if g.get('confianca') in ('media', 'baixa'): alertas.append('gabarito com confiança %s: %s' % (g['confianca'], g.get('obs', '')[:120]))
        if fonte != 'definitivo': alertas.append('gabarito %s' % (fonte or 'sem indicação de preliminar/definitivo'))
        status = 'revisar' if any('imagem' in a or 'vazia' in a or 'enunciado' in a for a in alertas) else 'extraida'
        item = {
            'id': f'{pid}-q{int(k)}',
            'origem': {'banca': inv['banca'] or 'Não informada', 'orgao': f"Prefeitura de {inv['municipio']}" if inv['municipio'] else None,
                       'municipio': inv['municipio'], 'uf': inv['uf'], 'cargo': inv['cargo'], 'ano': int(inv['ano']) if inv['ano'] else None,
                       'numero_original': int(k), 'arquivo': os.path.basename(f).replace('.json', '.pdf')},
            'formato': q['formato'], 'enunciado': q['enunciado'], 'alternativas': q['alternativas'],
            'gabarito': v, 'gabarito_fonte': fonte, 'materia': mat,
            'escopo': 'municipal' if mat in LOCAL else 'nacional', 'escopo_local': inv['municipio'] if mat in LOCAL else None,
            'status': status, 'alertas': alertas,
        }
        if q.get('texto_base_id'):
            item['texto_base_id'] = q['texto_base_id']; usados.add(q['texto_base_id'])
        qs.append(item)
    if not qs:
        st['zero_questoes'] += 1; continue
    doc = {'prova': {'caderno': ''}, 'textos_base': {k: v for k, v in d['textos_base'].items() if k in usados}, 'questoes': qs}
    json.dump(doc, open(f'extraido/{pid}.json', 'w'), ensure_ascii=False)
    st['provas'] += 1; st['questoes'] += len(qs); st['anuladas'] += sum(1 for x in qs if x['gabarito'] is None)
    rel.append((pid, len(r), len(qs)))
json.dump(rel, open('relatorio_extracao.json', 'w'))
print(st)
