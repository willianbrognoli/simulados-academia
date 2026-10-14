import json,glob,os,re,collections
G={os.path.basename(f)[:-5]:json.load(open(f)) for f in glob.glob('g/*.json')}
def score(qs,r):
    nums={q['numero']:q for q in qs}
    return sum(1 for k,v in r.items() if int(k) in nums and nums[int(k)]['formato'] and v and v in nums[int(k)]['alternativas'])
esc={}; tot=0
for pid,g in G.items():
    r=g.get('respostas',{})
    if not r: continue
    cands=[]
    for d in [x for x in glob.glob('q_*') if os.path.isdir(x)]:
        for f in glob.glob(f'{d}/{pid}_prova*.json'):
            j=json.load(open(f)); cands.append((score(j['questoes'],r),f))
    if not cands: continue
    s,f=max(cands); esc[pid]=(f,s,len(r)); tot+=s
json.dump(esc,open('escolha.json','w'))
print('coerentes',tot,'provas >=90%',sum(1 for v in esc.values() if v[1]>=0.9*v[2]))
