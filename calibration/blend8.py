import json,numpy as np
exec(open('fit8.py').read().split("OUT={}")[0])
M=json.load(open('models8.json'))
def score(T,f):
    m=M[T]; v=SETS[T][2](f); z=np.clip((np.array([v[n] for n in m['names']])-np.array(m['mu']))/np.array(m['sd']),-m['zc'],m['zc']); return soft(float(z@np.array(m['w'])),m['anchors'])
for T,key in [('HOME','home'),('COLLECTION','coll')]:
    rows=[]
    for x in L:
        if x['kind']!='store' or not lab(x) or not okpage(x.get(key),'coll' if T=='COLLECTION' else 'home') or not okpage(x.get('pdp'),'pdp'): continue
        rows.append((YV[lab(x)],score(T,x[key]),score('PDP',x['pdp']),x['seg']))
    y=np.array([r[0] for r in rows]); gp=y!=.5
    out=[]
    for a in [0,0.3,0.5,0.7,1]:
        s=np.array([a*r[2]+(1-a)*r[1] for r in rows]); out.append((a,round(roc_auc_score(y[gp]==1,s[gp]),3),round(s[y==1].mean()),round(s[y==.5].mean()),round(s[y==0].mean())))
    print(T,'n',len(rows),out)
for T,key,a in [('HOME','home',0.5),('COLLECTION','coll',0.7)]:
    rows=[]
    for x in L:
        if x['kind']!='store' or not lab(x) or not okpage(x.get(key),'coll' if T=='COLLECTION' else 'home') or not okpage(x.get('pdp'),'pdp'): continue
        rows.append((YV[lab(x)],a*score('PDP',x['pdp'])+(1-a)*score(T,x[key])))
    y=np.array([r[0] for r in rows]); s=np.array([r[1] for r in rows])
    an=[float(np.median(s[y==v])) for v in (0,.5,1)]
    fin=np.array([soft(v,an) for v in s])
    M[T]['blend']={'pdpW':a,'anchors':[round(v,2) for v in an],'n':len(rows),'auc':round(roc_auc_score(y[y!=.5]==1,s[y!=.5]),3)}
    print(T,'blend anchors',an,'final means G %.0f M %.0f P %.0f'%(fin[y==1].mean(),fin[y==.5].mean(),fin[y==0].mean()))
json.dump(M,open('models8.json','w'))
rows=[]
for x in L:
    if x['kind']!='store' or not lab(x) or not okpage(x.get('home'),'home') or not okpage(x.get('pdp'),'pdp'): continue
    rows.append((YV[lab(x)],0.7*score('PDP',x['pdp'])+0.3*score('HOME',x['home'])))
y=np.array([r[0] for r in rows]); s=np.array([r[1] for r in rows])
an=[float(np.median(s[y==v])) for v in (0,.5,1)]; fin=np.array([soft(v,an) for v in s])
M['PDP']['blend']={'homeW':0.3,'anchors':[round(v,2) for v in an],'n':len(rows),'auc':round(roc_auc_score(y[y!=.5]==1,s[y!=.5]),3)}
print('PDP+home blend',M['PDP']['blend'],'means G %.0f M %.0f P %.0f'%(fin[y==1].mean(),fin[y==.5].mean(),fin[y==0].mean()))
json.dump(M,open('models8.json','w'))
