import json,glob,os,collections
OK=('gabarito sem indicação de preliminar/definitivo','matéria por palavra-chave','gabarito preliminar','transcrita por IA a partir do PDF: conferir')
tot=collections.Counter()
for f in sorted(glob.glob('final/*.json')):
    pid=os.path.basename(f)[:-5]
    alta=json.load(open('g/%s.json'%pid)).get('confianca')=='alta'
    d=json.load(open(f)); n=0
    for q in d['questoes']:
        if alta and q.get('status')=='extraida' and q.get('gabarito') and len(q['enunciado'].strip())>=30 and all(a.startswith(OK) for a in q.get('alertas') or []):
            q['status']='aprovada'; n+=1
    tot['aprovada']+=n; tot['fica']+=len(d['questoes'])-n
    if n: json.dump(d,open('aprovar/'+pid+'.json','w'),ensure_ascii=False)
print(tot, len(os.listdir('aprovar')))
