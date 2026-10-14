import json, glob, os, csv
from build_json import INV, LOCAL, G   # reaproveita metadados (roda o build de novo, ok)
os.makedirs('extraido2', exist_ok=True)
tot = 0; provas = 0
for f in sorted(glob.glob('llm/*.json')):
    pid = os.path.basename(f)[:-5]
    g = G.get(pid); inv = INV.get(pid)
    if not g or not inv: continue
    r = g['respostas']
    base = json.load(open(f'extraido/{pid}.json')) if os.path.exists(f'extraido/{pid}.json') else {'prova': {'caderno': ''}, 'textos_base': {}, 'questoes': []}
    L = json.load(open(f))
    pref = lambda k: k if k.startswith('L_') else 'L_' + k
    tbs = {pref(k): v for k, v in L.get('textos_base', {}).items()}
    fonte = g.get('fonte') if g.get('fonte') in ('definitivo', 'preliminar') else None
    porn = {q['origem']['numero_original']: q for q in base['questoes']}
    for q in L['questoes']:
        n = int(q['numero']); v = r.get(str(n))
        alertas = list(q.get('alertas') or []) + ['transcrita por IA a partir do PDF: conferir']
        if g.get('confianca') in ('media', 'baixa'): alertas.append('gabarito com confiança %s' % g['confianca'])
        if fonte != 'definitivo': alertas.append('gabarito %s' % (fonte or 'sem indicação de preliminar/definitivo'))
        if pid == 'japeri-rj-2013': alertas.append('gabarito de Português parece não corresponder ao caderno')
        mat = q['materia']
        ce = ''.join(sorted(q['alternativas'])) == 'CE'
        item = {'id': f'{pid}-q{n}',
                'origem': {'banca': inv['banca'] or 'Não informada', 'orgao': f"Prefeitura de {inv['municipio']}" if inv['municipio'] else None,
                           'municipio': inv['municipio'], 'uf': inv['uf'], 'cargo': inv['cargo'], 'ano': int(inv['ano']) if inv['ano'] else None, 'numero_original': n},
                'formato': 'CE' if ce else ('ME5' if len(q['alternativas']) == 5 else 'ME4'),
                'enunciado': q['enunciado'], 'alternativas': q['alternativas'], 'gabarito': v, 'gabarito_fonte': fonte,
                'materia': mat, 'escopo': 'municipal' if mat in LOCAL else 'nacional', 'escopo_local': inv['municipio'] if mat in LOCAL else None,
                'status': 'revisar' if any(('imagem' in a or 'perdid' in a or 'reconstru' in a or 'parece' in a or 'conferir no' in a) for a in alertas[:-2]) else 'extraida',
                'alertas': alertas}
        if q.get('texto_base_id'): item['texto_base_id'] = pref(q['texto_base_id'])
        porn[n] = item
    usados = {q.get('texto_base_id') for q in porn.values()}
    alltb = {**base['textos_base'], **tbs}
    doc = {'prova': base['prova'], 'textos_base': {k: v for k, v in alltb.items() if k in usados}, 'questoes': sorted(porn.values(), key=lambda q: q['origem']['numero_original'])}
    faltando_tb = [q['id'] for q in doc['questoes'] if q.get('texto_base_id') and q['texto_base_id'] not in doc['textos_base']]
    for q in doc['questoes']:
        if q['id'] in faltando_tb: q.pop('texto_base_id')
    json.dump(doc, open(f'extraido2/{pid}.json', 'w'), ensure_ascii=False)
    tot += len(L['questoes']); provas += 1
print('provas', provas, 'questões da IA', tot)
