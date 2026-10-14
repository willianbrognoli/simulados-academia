import json,glob,os,sys
from parse import extrair
from concurrent.futures import ProcessPoolExecutor
def um(a):
    f,modo,out,livre=a
    b=os.path.basename(f)[:-4]
    try: r=extrair(open(f,encoding='utf-8',errors='ignore').read(),modo,livre)
    except Exception as e: r={'questoes':[],'textos_base':{},'avisos':[str(e)]}
    json.dump(r,open(f'{out}/{b}.json','w'),ensure_ascii=False)
jobs=[]
for src in ('mu','raw'):
    for modo in ('seq','cadeia'):
      for livre in (False,True):
        out=f'q_{src}_{modo}'+('_l' if livre else ''); os.makedirs(out,exist_ok=True)
        jobs+=[(f,modo,out,livre) for f in sorted(glob.glob(f'{src}/*_prova*.txt'))]
with ProcessPoolExecutor(8) as ex: list(ex.map(um,jobs))
