"""Questões aprovadas com fórmula provavelmente estragada na extração."""
import json,glob,re,collections,sys
UNID=re.compile(r'\b(k|c|d|m)?m([23])\b')                      # m2, cm3 -> m², cm³ (seguro)
REGRAS={
 'lixo':  re.compile(r'\(cid:|�|[-]'),
 'pot':   re.compile(r'(?<![\w/.-])[a-zA-Z]\)?[2-9](?![\w,.]*\d)(?=\s*[-–+=×·)]|\s*$)|\)\s?[23]\b(?=\s*[-–+=])'),  # x2 – , (x1)2 +
 'raiz_frac': re.compile(r'√\s*$|\n\s*\d+\s*\n\s*[-–_]+\s*\n|\n\s*\d+\s*\n\s*\d+\s*\n'),
 'buracos': re.compile(r'(\S\s{3,}){2,}\S'),                     # "x x x     ," tokens soltos
 'sinais_soltos': re.compile(r'(?:^|\s)[=+×÷]\s*(?:$|\n)|\.\.\.\s*\d+\s+\d+\s+[a-z]\s+[a-z]'),
}
def checar(q):
    alts=list((q.get('alternativas') or {}).values())
    r=[k for k,p in REGRAS.items() if any(p.search(x) for x in [q['enunciado']]+alts)]
    return r
if __name__=='__main__':
    c=collections.Counter(); out={}
    for f in glob.glob('aprovar/*.json'):
        for q in json.load(open(f))['questoes']:
            if q['status']!='aprovada': continue
            r=checar(q)
            if r: out[q['id']]=r; c.update(r); c['TOTAL']+=1; c['mat:'+str(q.get('materia'))]+=1
    json.dump(out,open('suspeitas_mat.json','w'),ensure_ascii=False,indent=0)
    for k,v in c.most_common(): print(v,k)
