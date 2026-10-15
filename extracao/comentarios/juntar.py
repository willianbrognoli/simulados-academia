"""Junta comentário (out_XX.json) + conferência (ver_XX.json) e decide o status.
ia_aprovado só se: confiança alta, gabarito confere, lei não mudou, tipo objetivo E o conferente independente deu ok.
Uso: python3 juntar.py <pasta>  -> grava <pasta>/final.json e imprime o resumo."""
import json, glob, sys, os, collections
OBJETIVOS = {'lei_seca', 'calculo', 'gramatica', 'conceito', 'interpretacao'}
pasta = sys.argv[1]
saida, falta = [], []
for f in sorted(glob.glob(os.path.join(pasta, 'out_*.json'))):
    v = f.replace('out_', 'ver_')
    if not os.path.exists(v): falta.append(v); continue
    ver = {x['codigo']: x for x in json.load(open(v))}
    for c in json.load(open(f)):
        vv = ver.get(c['codigo'], {'veredito': 'corrigir', 'motivo': 'sem conferência'})
        motivos = []
        if c.get('confianca') != 'alta': motivos.append('IA com confiança baixa')
        if not c.get('gabarito_confere', True): motivos.append('IA discorda do gabarito oficial')
        if c.get('lei_alterada'): motivos.append('lei pode ter mudado depois da prova')
        if c.get('tipo') not in OBJETIVOS: motivos.append(f"tipo {c.get('tipo')} não dá para conferir sem humano")
        if vv.get('veredito') != 'ok': motivos.append('conferente: ' + (vv.get('motivo') or 'reprovou'))
        if c.get('nota'): motivos.append('obs. da IA: ' + c['nota'])
        aprovado = not [m for m in motivos if not m.startswith('obs.')]
        saida.append({'codigo': c['codigo'], 'comentario': c['comentario'], 'status': 'ia_aprovado' if aprovado else 'ia_revisar',
                      'nota': None if aprovado else '; '.join(motivos), 'tipo': c.get('tipo')})
json.dump(saida, open(os.path.join(pasta, 'final.json'), 'w'), ensure_ascii=False)
st = collections.Counter(x['status'] for x in saida)
print(len(saida), dict(st), 'sem conferência:', falta)
print(collections.Counter((x['tipo'], x['status']) for x in saida).most_common())
