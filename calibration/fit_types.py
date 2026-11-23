import json, numpy as np, math
from sklearn.metrics import roc_auc_score
D=json.load(open('features2.json'))
relabel={'shop_doodhvalefarms_com':'M','sevahome_in':'M','paksha_in':'M'}
def cap(v,c): return min(v or 0,c)/c
def home_vec(f):
    hw=f.get('hero_words',0)
    return {'hero_cta':f['hero_cta'],'hero_clear':1.0 if 4<=hw<=40 else 0.0,'categories':cap(f['category_entries'],8),'products_early':cap(f['cards_top'],8),
     'card_price':f['card_price'],'card_rating':f['card_rating'],'proof':max(f['social_scale'],f['testimonials'],f['rating_top']),'trust':cap(f['trust_page'],5),
     'bestsellers':f['bestsellers'],'search':f['search_box'],'no_carousel':1-f['carousel'],'no_overflow':1-f['overflow'],'no_popup':1-min(f['fixed_layers'],1),
     'calm_promos':1-cap(f['promo_noise'],8),'products_soon':1-min(1,f['first_product_screens']/4),'newsletter':f['newsletter_incentive'],'structure':cap(f['headings'],15)}
def coll_vec(f):
    return {'products_early':cap(f['cards_top'],8),'card_price':f['card_price'],'card_rating':f['card_rating'],'card_add':f['card_add'],'card_swatch':f['card_swatch'],
     'card_badge':f['card_badge'],'filter':f['filter_ui'],'sort':f['sort_ui'],'count':f['product_count'],'desc':f['collection_desc'],'breadcrumb':f['breadcrumb'],
     'products_soon':1-min(1,f['first_product_screens']/3),'no_overflow':1-f['overflow'],'no_popup':1-min(f['fixed_layers'],1),'calm_promos':1-cap(f['promo_noise'],8),'title':f['h1']}
def ok(f,kind):
    if not f: return False
    if f.get('words',0)<120: return False
    if kind=='coll' and f.get('cards',0)<2: return False
    return True
def fit(kind,vec):
    rows=[(k,relabel.get(k,v['label']),vec(v[kind])) for k,v in D.items() if ok(v.get(kind),kind)]
    names=list(rows[0][2]); Z=np.array([[r[2][n] for n in names] for r in rows],float)
    y=np.array([{'G':1,'M':.5,'P':0}[r[1]] for r in rows])
    mu=Z.mean(0); sd=Z.std(0); sd[sd==0]=1; Zs=(Z-mu)/sd
    def train(Zs,y):
        w=np.ones(Zs.shape[1])*0.05
        for it in range(5000):
            g=Zs.T@(Zs@w-(y-y.mean()))/len(y)+0.5*(w-0.05); w=np.maximum(0,w-0.05*g)
        return w
    pred=np.zeros(len(y))
    for i in range(len(y)):
        m=np.ones(len(y),bool); m[i]=False; pred[i]=Zs[i]@train(Zs[m],y[m])
    gp=y!=.5
    print(kind,'n=',len(y),{l:int((y==v).sum()) for l,v in [('G',1),('M',.5),('P',0)]},'LOO AUC G/P %.2f G/M %.2f M/P %.2f'%(roc_auc_score(y[gp]==1,pred[gp]),roc_auc_score(y[y>0]==1,pred[y>0]),roc_auc_score(y[y<1]==.5,pred[y<1])))
    w=train(Zs,y); raw=Zs@w
    xP,xM,xG=[float(np.median(raw[y==v])) for v in (0,.5,1)]
    def cal(r):
        if r>=xG: return 80+18*(1-math.exp(-(r-xG)/(xG-xM)))
        if r<=xP: return 30-25*(1-math.exp(-(xP-r)/(xM-xP)))
        return float(np.interp(r,[xP,xM,xG],[30,55,80]))
    sc=[cal(r) for r in raw]
    for lab,v in [('G',1),('M',.5),('P',0)]:
        s=np.array(sc)[y==v]; print('  ',lab,'mean %.0f median %.0f'%(s.mean(),np.median(s)))
    print('  weights:',sorted([(n,round(x,3)) for n,x in zip(names,w)],key=lambda t:-t[1]))
    print('  ',', '.join(f"{r[0][:14]}:{r[1]}:{s:.0f}" for r,s in sorted(zip(rows,sc),key=lambda t:-t[1])))
    return {'names':names,'mu':[round(x,4) for x in mu],'sd':[round(x,4) for x in sd],'w':[round(x,4) for x in w],'anchors':[round(xP,4),round(xM,4),round(xG,4)],'n':len(y)}
M={'HOME':fit('home',home_vec),'COLLECTION':fit('coll',coll_vec)}
json.dump(M,open('model_types.json','w'))
