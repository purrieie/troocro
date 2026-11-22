import json, numpy as np
meta=json.load(open('dataset_meta.json')); keys=meta['keys']; X=np.load('X.npy'); y=np.load('y.npy')
col={k:X[:,i] for i,k in enumerate(keys)}
def cap(v,c): return np.minimum(v,c)/c
feat={'cta_atf':col['cta_atf'],'cta_filled':col['cta_filled'],'sticky_cta':col['sticky_cta'],'price_atf':col['price_atf'],'rating_top':col['rating_top'],'offer':col['offer'],'delivery_near':col['delivery_near'],'trust_near':cap(col['trust_near'],4),'benefits':cap(col['benefit_bullets'],6),'structure':cap(col['headings'],15),'breadcrumb':col['breadcrumb'],'compare':col['compare_table'],'faq':col['faq'],'social':col['social_scale'],'reviews':cap(col['review_count_log'],3),'gallery':cap(col['gallery'],6),'video':col['video'],'crosssell':col['crosssell'],'variants':col['variants_ui'],'cta_contrast':cap(col['cta_contrast'],4),'no_overflow':1-col['overflow'],'short_title':1-np.clip((col['title_len']-60)/60,0,1),'no_wall':1-col['text_wall']/2,'no_popup':1-np.minimum(col['fixed_layers'],1)}
names=list(feat); Z=np.stack([feat[n] for n in names],1); mu=Z.mean(0); sd=Z.std(0); sd[sd==0]=1; Zs=(Z-mu)/sd
w=np.ones(len(names))*0.05
for it in range(6000):
    g=Zs.T@(Zs@w-(y-y.mean()))/len(y)+0.5*(w-0.05); w=np.maximum(0,w-0.05*g)
raw=Zs@w
med={lab:np.median(raw[y==v]) for lab,v in [('P',0),('M',.5),('G',1)]}
xs=[med['P'],med['M'],med['G']]; ys=[30,55,80]
def cal(r):
    if r<=xs[0]: s=30+(r-xs[0])*(25/(xs[1]-xs[0]))
    elif r>=xs[2]: s=80+(r-xs[2])*(25/(xs[2]-xs[1]))
    else: s=float(np.interp(r,xs,ys))
    return max(5,min(98,s))
sc=np.array([cal(r) for r in raw])
rows=meta['rows']
for (k,l),s in sorted(zip(rows,sc),key=lambda t:-t[1]): print(f"{s:5.0f} {l} {k}")
for lab,v in [('G',1),('M',.5),('P',0)]: print(lab,'mean %.0f  min %.0f  max %.0f'%(sc[y==v].mean(),sc[y==v].min(),sc[y==v].max()))
json.dump({'names':names,'mu':mu.tolist(),'sd':sd.tolist(),'w':w.tolist(),'anchors':xs},open('model.json','w'),indent=1)
