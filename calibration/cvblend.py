import json,numpy as np
exec(open('fit8.py').read().split("OUT={}")[0])
ZC=1.5
def fitT(T,rows):
    names=list(rows[0][1]); Z=np.array([[r[1][n] for n in names] for r in rows]); y=np.array([r[0] for r in rows])
    mu=Z.mean(0); sd=Z.std(0); sd[sd==0]=1; w=train(np.clip((Z-mu)/sd,-ZC,ZC),y)
    return lambda v: float(np.clip((np.array([v[n] for n in names])-mu)/sd,-ZC,ZC)@w)
S=[x for x in L if x['kind']=='store' and lab(x) and okpage(x.get('home'),'home') and okpage(x.get('pdp'),'pdp')]
y=np.array([YV[lab(x)] for x in S]); fold=np.random.default_rng(3).integers(0,10,len(S))
P=np.zeros(len(S)); H=np.zeros(len(S))
for k in range(10):
    tr=[x for x,f in zip(S,fold) if f!=k]
    fp=fitT('PDP',[(YV[lab(x)],pdp_vec(x['pdp'])) for x in tr]); fh=fitT('HOME',[(YV[lab(x)],home_vec(x['home'])) for x in tr])
    for i in np.where(fold==k)[0]: P[i]=fp(pdp_vec(S[i]['pdp'])); H[i]=fh(home_vec(S[i]['home']))
gp=y!=.5
zs=lambda a:(a-a.mean())/a.std()
for a in [1,0.7,0.5,0]:
    s=a*zs(P)+(1-a)*zs(H); print('pdpW',a,'CV AUC G/P %.2f'%roc_auc_score(y[gp]==1,s[gp]))
