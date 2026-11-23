import json, numpy as np, math
exec(open('fit_types.py').read().split("def fit(")[0])
RUB={'home':{'hero_cta':3,'hero_clear':2,'categories':3,'products_soon':2,'card_price':2,'card_rating':2,'proof':2,'trust':2,'search':2,'no_carousel':1,'no_overflow':2,'no_popup':1,'calm_promos':1,'newsletter':1,'bestsellers':1},
     'coll':{'products_early':3,'products_soon':2,'card_price':3,'card_rating':2,'card_add':1,'card_swatch':1,'filter':3,'sort':2,'count':1,'desc':1,'breadcrumb':1,'no_overflow':2,'no_popup':1,'calm_promos':1,'title':1}}
out={}
for kind,vec,key in [('home',home_vec,'HOME'),('coll',coll_vec,'COLLECTION')]:
    W=RUB[kind]; tot=sum(W.values())
    rows=[(k,relabel.get(k,v['label']),vec(v[kind])) for k,v in D.items() if ok(v.get(kind),kind)]
    raw=np.array([sum(W[n]*r[2][n] for n in W)/tot for r in rows])
    p20,p50,p80=np.percentile(raw,[20,50,80])
    def cal(r):
        if r>=p80: return 80+18*(1-math.exp(-(r-p80)/max(1e-6,(p80-p50))))
        if r<=p20: return 30-25*(1-math.exp(-(p20-r)/max(1e-6,(p50-p20))))
        return float(np.interp(r,[p20,p50,p80],[30,55,80]))
    sc=np.array([cal(r) for r in raw]); y=np.array([r[1] for r in rows])
    print(kind,'n',len(rows),'p20/50/80 %.2f %.2f %.2f'%(p20,p50,p80),{l:round(float(sc[y==l].mean())) for l in 'GMP'})
    print('  ',', '.join(f"{r[0][:14]}:{r[1]}:{s:.0f}" for r,s in sorted(zip(rows,sc),key=lambda t:-t[1])))
    out[key]={'weights':W,'anchors':[round(p20,4),round(p50,4),round(p80,4)],'n':len(rows)}
json.dump(out,open('rubric_types.json','w'))
