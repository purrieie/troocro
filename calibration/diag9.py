import json,numpy as np
exec(open('fit8.py').read().split("OUT={}")[0])
ZC=1.5
def fitT(rows):
    names=list(rows[0][1]); Z=np.array([[r[1][n] for n in names] for r in rows]); y=np.array([r[0] for r in rows])
    mu=Z.mean(0); sd=Z.std(0); sd[sd==0]=1; w=train(np.clip((Z-mu)/sd,-ZC,ZC),y)
    return lambda v: float(np.clip((np.array([v[n] for n in names])-mu)/sd,-ZC,ZC)@w)
# CV scores for PDP and HOME on stores, LEAD for lead
out=[]
for T,key,need,vec,kind in [('PDP','pdp','pdp',pdp_vec,'store'),('HOME','home','home',home_vec,'store'),('LEAD','home','lead',lead_vec,'lead')]:
    S=[x for x in L if x['kind']==kind and lab(x) and okpage(x.get(key),need)]
    y=np.array([YV[lab(x)] for x in S]); fold=np.random.default_rng(3).integers(0,10,len(S)); pr=np.zeros(len(S))
    for k in range(10):
        f=fitT([(YV[lab(x)],vec(x[key])) for x,ff in zip(S,fold) if ff!=k])
        for i in np.where(fold==k)[0]: pr[i]=f(vec(S[i][key]))
    z=(pr-pr.mean())/pr.std()
    for x,zz in zip(S,z):
        fe=x[key]; out.append(dict(T=T,dom=x['dom'],lab=lab(x),seg=x['seg'],z=round(float(zz),2),vt=fe.get('visible_text'),words=fe.get('words'),head=fe.get('headings'),imgs=fe.get('gallery'),cta=fe.get('cta_found'),lcta=fe.get('lead_cta_found'),h1=fe.get('h1'),cards=fe.get('cards'),dimg=round(fe.get('d_img_cover') or 0,2),fixed=fe.get('fixed_layers'),hero=fe.get('hero_head_words')))
json.dump(out,open('diag9.json','w'))
import collections
for T in ['PDP','HOME','LEAD']:
    R=[o for o in out if o['T']==T]
    bad=[o for o in R if (o['lab']=='G' and o['z']<-0.5) or (o['lab']=='P' and o['z']>0.5)]
    print(T,'n',len(R),'misranked',len(bad))
    for o in sorted(bad,key=lambda o:-abs(o['z']))[:14]: print('  ',o['lab'],o['z'],o['dom'],'vt',o['vt'],'words',o['words'],'head',o['head'],'dimg',o['dimg'],'cta',o['cta'] if T!='LEAD' else o['lcta'],'hero',o['hero'],'fixed',o['fixed'])
