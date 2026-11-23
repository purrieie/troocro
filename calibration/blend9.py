import json,numpy as np
exec(open('fit8.py').read().split("OUT={}")[0])
M=json.load(open('models8.json'))
def score(T,f):
    m=M[T]; v=SETS[T][2](f); z=np.clip((np.array([v[n] for n in m['names']])-np.array(m['mu']))/np.array(m['sd']),-m['zc'],m['zc']); return soft(float(z@np.array(m['w'])),m['anchors'])
conf=lambda f: max(0.2,float(f.get('render_conf',1)))
for T,key,wP in [('PDP','home',0.7),('HOME','home',0.5),('COLLECTION','coll',0.7)]:
    rows=[]
    for x in L:
        if x['kind']!='store' or not lab(x) or not okpage(x.get('pdp'),'pdp'): continue
        other=x.get(key); need='coll' if T=='COLLECTION' else 'home'
        if not okpage(other,need): continue
        sP=score('PDP',x['pdp']); sO=score('HOME' if T=='PDP' else T,other); cP=conf(x['pdp']); cO=conf(other)
        s=(wP*cP*sP+(1-wP)*cO*sO)/(wP*cP+(1-wP)*cO)
        rows.append((YV[lab(x)],s,abs(sP-sO),min(cP,cO)))
    y=np.array([r[0] for r in rows]); s=np.array([r[1] for r in rows]); gp=y!=.5
    an=[float(np.median(s[y==v])) for v in (0,.5,1)]; fin=np.array([soft(v,an) for v in s])
    key2='homeW' if T=='PDP' else 'pdpW'
    M[T]['blend']={key2:(1-wP) if T=='PDP' else wP,'anchors':[round(v,2) for v in an],'n':len(rows),'conf':True}
    # spread: how far is the final score from its label group's median, by agreement
    dis=np.array([r[2] for r in rows]); err=np.abs(fin-np.array([{0:30,.5:55,1:80}[v] for v in y]))
    print(T,'n',len(rows),'AUC %.3f'%roc_auc_score(y[gp]==1,s[gp]),'means G %.0f M %.0f P %.0f'%(fin[y==1].mean(),fin[y==.5].mean(),fin[y==0].mean()),'| median err when pages agree(<15) %.0f, disagree %.0f'%(np.median(err[dis<15]),np.median(err[dis>=15])))
json.dump(M,open('models8.json','w'))
