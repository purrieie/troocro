import json,numpy as np
exec(open('fit8.py').read().split("OUT={}")[0])
ZC=1.5
def fitT(rows):
    names=list(rows[0][1]); Z=np.array([[r[1][n] for n in names] for r in rows]); y=np.array([r[0] for r in rows])
    mu=Z.mean(0); sd=Z.std(0); sd[sd==0]=1; w=train(np.clip((Z-mu)/sd,-ZC,ZC),y)
    return lambda v: float(np.clip((np.array([v[n] for n in names])-mu)/sd,-ZC,ZC)@w)
S=[x for x in L if x['kind']=='store' and lab(x) and okpage(x.get('home'),'home') and okpage(x.get('pdp'),'pdp')]
y=np.array([YV[lab(x)] for x in S]); fold=np.random.default_rng(3).integers(0,10,len(S))
P=np.zeros(len(S)); H=np.zeros(len(S)); C=np.full(len(S),np.nan)
for k in range(10):
    tr=[x for x,f in zip(S,fold) if f!=k]
    fp=fitT([(YV[lab(x)],pdp_vec(x['pdp'])) for x in tr]); fh=fitT([(YV[lab(x)],home_vec(x['home'])) for x in tr])
    trc=[x for x in tr if okpage(x.get('coll'),'coll')]; fc=fitT([(YV[lab(x)],coll_vec(x['coll'])) for x in trc])
    for i in np.where(fold==k)[0]:
        P[i]=fp(pdp_vec(S[i]['pdp'])); H[i]=fh(home_vec(S[i]['home']))
        if okpage(S[i].get('coll'),'coll'): C[i]=fc(coll_vec(S[i]['coll']))
z=lambda a:(a-np.nanmean(a))/np.nanstd(a)
zP,zH,zC=z(P),z(H),z(C)
cP=np.array([x['pdp'].get('render_conf',1) for x in S]); cH=np.array([x['home'].get('render_conf',1) for x in S])
gp=y!=.5; A=lambda s: roc_auc_score(y[gp]==1,s[gp])
print('n',len(S))
print('PDP %.3f HOME %.3f'%(A(zP),A(zH)))
print('0.5/0.5 %.3f'%A(0.5*zP+0.5*zH))
print('conf-weighted %.3f'%A((cP*zP+cH*zH)/(cP+cH)))
print('conf^2-weighted %.3f'%A((cP**2*zP+cH**2*zH)/(cP**2+cH**2)))
three=np.where(np.isnan(zC),(zP+zH)/2,(zP+zH+zC)/3); print('three pages %.3f'%A(three))
three2=np.where(np.isnan(zC),0.5*zP+0.5*zH,0.4*zP+0.4*zH+0.2*zC); print('three 40/40/20 %.3f'%A(three2))
print('low-conf share pdp',(cP<0.8).mean(),'home',(cH<0.8).mean())
# error rate: how often G scored below median of P etc -> pairwise
