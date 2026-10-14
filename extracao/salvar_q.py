#!/usr/bin/env python3
"""Valida e grava questões extraídas manualmente.
Uso: python3 salvar_q.py <id> <arquivo.json>
O arquivo deve ser {"textos_base": {"tb1": "..."}, "questoes": [{"numero": 7, "enunciado": "...", "alternativas": {"A": "...", ...}, "texto_base_id": "tb1" | null, "materia": "Língua Portuguesa"}]}
Para certo/errado use "alternativas": {"C": "Certo", "E": "Errado"}."""
import sys, json, os
B = os.path.dirname(os.path.abspath(__file__))
pid, arq = sys.argv[1], sys.argv[2]
d = json.load(open(arq))
g = json.load(open(f'{B}/g/{pid}.json'))['respostas']
ok, erros = [], []
for q in d.get('questoes', []):
    n = str(q.get('numero'))
    alts = {k.upper(): str(v).strip() for k, v in (q.get('alternativas') or {}).items()}
    ks = ''.join(sorted(alts))
    if ks not in ('ABCD', 'ABCDE', 'CE'): erros.append(f'q{n}: alternativas {ks}'); continue
    if not str(q.get('enunciado', '')).strip(): erros.append(f'q{n}: enunciado vazio'); continue
    if n not in g: erros.append(f'q{n}: número fora do gabarito'); continue
    v = g[n]
    if v is not None and v not in alts: erros.append(f'q{n}: gabarito {v} não está nas alternativas {ks}'); continue
    if not q.get('materia'): erros.append(f'q{n}: sem matéria'); continue
    q['alternativas'] = alts
    ok.append(q)
os.makedirs(f'{B}/llm', exist_ok=True)
dest = f'{B}/llm/{pid}.json'
ant = json.load(open(dest)) if os.path.exists(dest) else {'textos_base': {}, 'questoes': []}
porn = {q['numero']: q for q in ant['questoes']}
for q in ok: porn[q['numero']] = q
ant['questoes'] = sorted(porn.values(), key=lambda q: int(q['numero']))
ant['textos_base'].update(d.get('textos_base', {}))
json.dump(ant, open(dest, 'w'), ensure_ascii=False)
print(f'gravadas {len(ok)} (total no arquivo: {len(ant["questoes"])}); erros: {len(erros)}')
for e in erros: print('  !', e)
