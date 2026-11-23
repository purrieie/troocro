import json, numpy as np, math, sys
from sklearn.metrics import roc_auc_score
L=[json.loads(l) for l in open('features4.jsonl')]
VL=json.load(open('visual_labels.json'))
def lab(x):
    l=x['label']
    if l=='?': l=VL.get(x['dom'],'X')
    return None if l=='X' else l
def cap(v,c): return min(v or 0,c)/c
def g(f,k): return float(f.get(k) or 0)
def okpage(f,need):
    if not f or g(f,'visible_text')<250: return False
    if need=='pdp': return bool(g(f,'cta_found') or g(f,'h1'))
    if need=='coll': return g(f,'cards')>=2
    return True
def design(f): return {'d_caps':1-min(1,g(f,'d_caps')/0.5),'d_emoji':1-cap(g(f,'d_emoji'),5),'d_img':cap(g(f,'d_img_cover'),0.6)}
def pdp_vec(f): return {**design(f),'cta_atf':g(f,'cta_atf'),'cta_filled':g(f,'cta_filled'),'sticky_cta':g(f,'sticky_cta'),'price_atf':g(f,'price_atf'),'rating_top':g(f,'rating_top'),'offer':g(f,'offer'),'delivery_near':g(f,'delivery_near'),'trust_near':cap(g(f,'trust_near'),4),'benefits':cap(g(f,'benefit_bullets'),6),'structure':cap(g(f,'headings'),15),'breadcrumb':g(f,'breadcrumb'),'compare':g(f,'compare_table'),'faq':g(f,'faq'),'social':g(f,'social_scale'),'reviews':cap(g(f,'review_count_log'),3),'gallery':cap(g(f,'gallery'),6),'video':g(f,'video'),'crosssell':g(f,'crosssell'),'variants':g(f,'variants_ui'),'cta_contrast':cap(g(f,'cta_contrast'),4),'no_overflow':1-g(f,'overflow'),'short_title':1-min(1,max(0,(g(f,'title_len')-60)/60)),'no_wall':1-g(f,'text_wall')/2,'no_popup':1-min(g(f,'fixed_layers'),1),
  'returns_near':g(f,'returns_near'),'free_ship':g(f,'free_ship_msg'),'payment_opts':g(f,'payment_opts'),'how_to_use':g(f,'how_to_use'),'composition':g(f,'composition'),'guarantee':g(f,'guarantee'),'calm_promos':1-cap(g(f,'promo_noise'),8)}
def home_vec(f):
    hw=g(f,'hero_words')
    return {**design(f),'hero_cta':g(f,'hero_cta'),'hero_clear':1.0 if 4<=hw<=40 else 0.0,'categories':cap(g(f,'category_entries'),8),'products_early':cap(g(f,'cards_top'),8),'card_price':g(f,'card_price'),'card_rating':g(f,'card_rating'),'proof':max(g(f,'social_scale'),g(f,'testimonials'),g(f,'rating_top')),'trust':cap(g(f,'trust_page'),5),'bestsellers':g(f,'bestsellers'),'search':g(f,'search_box'),'no_carousel':1-g(f,'carousel'),'no_overflow':1-g(f,'overflow'),'no_popup':1-min(g(f,'fixed_layers'),1),'calm_promos':1-cap(g(f,'promo_noise'),8),'products_soon':1-min(1,(g(f,'first_product_screens') or 10)/4),'newsletter':g(f,'newsletter_incentive'),'structure':cap(g(f,'headings'),15),'press':g(f,'press'),'stats':cap(g(f,'stat_claims'),3),'logos':cap(g(f,'logos_strip'),6),'sections':cap(g(f,'feature_sections'),10),'hero_size':cap(g(f,'hero_head_size'),40),'no_wall':1-g(f,'text_wall')/2}
def coll_vec(f): return {**design(f),'products_early':cap(g(f,'cards_top'),8),'card_price':g(f,'card_price'),'card_rating':g(f,'card_rating'),'card_add':g(f,'card_add'),'card_swatch':g(f,'card_swatch'),'card_badge':g(f,'card_badge'),'filter':g(f,'filter_ui'),'sort':g(f,'sort_ui'),'count':g(f,'product_count'),'desc':g(f,'collection_desc'),'breadcrumb':g(f,'breadcrumb'),'products_soon':1-min(1,(g(f,'first_product_screens') or 10)/3),'no_overflow':1-g(f,'overflow'),'no_popup':1-min(g(f,'fixed_layers'),1),'calm_promos':1-cap(g(f,'promo_noise'),8),'title':g(f,'h1'),'structure':cap(g(f,'headings'),15)}
def lead_vec(f):
    n=g(f,'lead_cta_atf_n'); hw=g(f,'hero_head_words')
    return {**design(f),'cta_atf':g(f,'lead_cta_atf'),'cta_found':g(f,'lead_cta_found'),'cta_filled':g(f,'lead_cta_filled'),'cta_contrast':cap(g(f,'lead_cta_contrast'),4),'cta_width':min(1,g(f,'lead_cta_width')/0.6),'focused':1.0 if 1<=n<=2 else 0.0,'app':g(f,'app_badges'),'app_rating':g(f,'app_rating'),'press':g(f,'press'),'regulated':g(f,'regulated'),'security':g(f,'security'),'stats':cap(g(f,'stat_claims'),3),'logos':cap(g(f,'logos_strip'),6),'pricing':g(f,'pricing_link'),'form_atf':g(f,'form_atf'),'how_it_works':g(f,'how_it_works'),'calculator':g(f,'calculator'),'experts':g(f,'doctor_proof'),'testimonials':g(f,'testimonials'),'faq':g(f,'faq'),'structure':cap(g(f,'headings'),15),'sections':cap(g(f,'feature_sections'),10),'hero_clear':1.0 if 3<=hw<=14 else 0.0,'hero_size':cap(g(f,'hero_head_size'),40),'no_overflow':1-g(f,'overflow'),'no_popup':1-min(g(f,'fixed_layers'),1),'no_wall':1-g(f,'text_wall')/2,'calm_promos':1-cap(g(f,'promo_noise'),8)}
SETS={'PDP':('pdp','pdp',pdp_vec,lambda x:x['kind']=='store'),'HOME':('home','home',home_vec,lambda x:x['kind']=='store'),'COLLECTION':('coll','coll',coll_vec,lambda x:x['kind']=='store'),'LEAD':('home','lead',lead_vec,lambda x:x['kind']=='lead')}
YV={'G':1,'M':.5,'P':0}
def train(Zs,y,lam=0.5,w0=0.05):
    w=np.ones(Zs.shape[1])*w0
    for it in range(3000):
        gr=Zs.T@(Zs@w-(y-y.mean()))/len(y)+lam*(w-w0); w=np.maximum(0,w-0.05*gr)
    return w
def soft(r,a):
    if r>=a[2]: return 80+18*(1-math.exp(-(r-a[2])/max(1e-6,a[2]-a[1])))
    if r<=a[0]: return 30-25*(1-math.exp(-(a[0]-r)/max(1e-6,a[1]-a[0])))
    return float(np.interp(r,a,[30,55,80]))
ZC=float(sys.argv[1]) if len(sys.argv)>1 else 2.0
OUT={}
for T,(key,need,vec,flt) in SETS.items():
    rows=[(x['dom'],lab(x),x['seg'],vec(x[key])) for x in L if flt(x) and lab(x) and okpage(x.get(key),need)]
    names=list(rows[0][3]); Z=np.array([[r[3][n] for n in names] for r in rows]); y=np.array([YV[r[1]] for r in rows])
    mu=Z.mean(0); sd=Z.std(0); sd[sd==0]=1; Zs=np.clip((Z-mu)/sd,-ZC,ZC)
    print('   rare:',[(n,round(float(v),2)) for n,v in zip(names,mu) if v<0.08 or v>0.92])
    # 10-fold CV predictions
    rng=np.random.default_rng(1); fold=rng.integers(0,10,len(y)); pred=np.zeros(len(y))
    for k in range(10):
        m=fold!=k; pred[~m]=Zs[~m]@train(Zs[m],y[m])
    gp=y!=.5
    auc=roc_auc_score(y[gp]==1,pred[gp]) if gp.sum()>5 and len(set(y[gp]))>1 else float('nan')
    w=train(Zs,y); raw=Zs@w
    a=[float(np.median(raw[y==v])) for v in (0,.5,1)]
    if not (a[0]<a[1]<a[2]): a=sorted(a); a[1]=(a[0]+a[2])/2
    sc=np.array([soft(r,a) for r in raw])
    cnt={l:int((y==v).sum()) for l,v in YV.items()}
    print(f"{T}: n={len(y)} {cnt} CV AUC G/P={auc:.2f}  mean score G {sc[y==1].mean():.0f} M {sc[y==.5].mean():.0f} P {sc[y==0].mean():.0f}")
    print('   top weights:',[(n,round(float(x),3)) for n,x in sorted(zip(names,w),key=lambda t:-t[1])[:10]])
    segs=sorted(set(r[2] for r in rows))
    print('   by segment:',{s:round(float(sc[[r[2]==s for r in rows]].mean())) for s in segs})
    OUT[T]={'names':names,'mu':[round(float(v),4) for v in mu],'sd':[round(float(v),4) for v in sd],'w':[round(float(v),4) for v in w],'anchors':[round(v,4) for v in a],'n':len(y),'auc':round(auc,3),'zc':ZC}
    if T in ('PDP','LEAD'): pass
json.dump(OUT,open('models8.json','w'))
