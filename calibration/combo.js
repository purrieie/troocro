const fs = require('fs');
const src = fs.readFileSync('rules.js', 'utf8').split('\n');
const end = src.findIndex(l => l.includes('var RULE_BY'));
const SHORT = {}, REGION_OF = {};
eval(src.slice(0, end).join('\n').replace('var RULES', 'global.RULES'));
const D = JSON.parse(fs.readFileSync('features2.json', 'utf8'));
const relabel = { shop_doodhvalefarms_com: 'M', sevahome_in: 'M', paksha_in: 'M' };
const cap = (v, c) => Math.min(v || 0, c) / c;
const RUB = JSON.parse(fs.readFileSync('rubric_types.json', 'utf8'));
function vec(f, kind) {
  if (kind === 'HOME') return { hero_cta: f.hero_cta, hero_clear: f.hero_words >= 4 && f.hero_words <= 40 ? 1 : 0, categories: cap(f.category_entries, 8), products_soon: 1 - Math.min(1, (f.first_product_screens || 10) / 4), card_price: f.card_price, card_rating: f.card_rating, proof: Math.max(f.social_scale || 0, f.testimonials || 0, f.rating_top || 0), trust: cap(f.trust_page, 5), search: f.search_box, no_carousel: 1 - (f.carousel || 0), no_overflow: 1 - (f.overflow || 0), no_popup: 1 - Math.min(f.fixed_layers || 0, 1), calm_promos: 1 - cap(f.promo_noise, 8), newsletter: f.newsletter_incentive || 0, bestsellers: f.bestsellers };
  return { products_early: cap(f.cards_top, 8), products_soon: 1 - Math.min(1, (f.first_product_screens || 10) / 3), card_price: f.card_price, card_rating: f.card_rating, card_add: f.card_add, card_swatch: f.card_swatch, filter: f.filter_ui, sort: f.sort_ui, count: f.product_count, desc: f.collection_desc, breadcrumb: f.breadcrumb, no_overflow: 1 - (f.overflow || 0), no_popup: 1 - Math.min(f.fixed_layers || 0, 1), calm_promos: 1 - cap(f.promo_noise, 8), title: f.h1 };
}
const RW = +process.argv[2] || 1;
function score(f, kind) {
  const W = RUB[kind].weights, v = vec(f, kind); let tot = 0, got = 0;
  for (const k in W) { tot += W[k]; got += W[k] * Math.max(0, Math.min(1, +v[k] || 0)); }
  const ts = kind === 'HOME' ? ['HOME', 'LIST', 'ALL'] : ['COLLECTION', 'LIST', 'ALL'];
  const fails = [];
  RULES.forEach(r => { if (ts.indexOf(r.t) < 0 || r.cats) return; let o; try { o = r.ok(f); } catch (e) { o = null; } if (o === null || o === undefined) return; tot += RW * r.sev; if (o) got += RW * r.sev; else fails.push(r.k); });
  return { raw: got / tot, fails };
}
const out = {};
for (const [kind, key] of [['HOME', 'home'], ['COLLECTION', 'coll']]) {
  const rows = [];
  for (const k in D) { const e = D[k], f = e[key]; if (!f || (f.words || 0) < 120 || (kind === 'COLLECTION' && (f.cards || 0) < 2)) continue; const s = score(f, kind); rows.push({ k, l: relabel[k] || e.label, raw: s.raw, nf: s.fails.length }); }
  const raws = rows.map(r => r.raw).sort((a, b) => a - b), q = p => raws[Math.min(raws.length - 1, Math.floor(p * (raws.length - 1) + 0.5))];
  const a = [q(0.2), q(0.5), q(0.8)];
  const m = l => { const x = rows.filter(r => r.l === l); return [Math.round(100 * x.reduce((s, r) => s + r.raw, 0) / x.length), (x.reduce((s, r) => s + r.nf, 0) / x.length).toFixed(1)]; };
  let auc = 0, n = 0; rows.filter(r => r.l === 'G').forEach(g => rows.filter(r => r.l === 'P').forEach(p => { n++; auc += g.raw > p.raw ? 1 : g.raw === p.raw ? 0.5 : 0; }));
  console.log(kind, 'n', rows.length, 'anchors', a.map(x => x.toFixed(3)).join(' '), 'G', m('G'), 'M', m('M'), 'P', m('P'), 'AUC G/P', (auc / n).toFixed(2));
  out[kind] = { weights: RUB[kind].weights, ruleWeight: RW, anchors: a.map(x => Math.round(x * 10000) / 10000), n: rows.length };
}
if (process.argv[3]) fs.writeFileSync('rubric_types.json', JSON.stringify(out));
// blend with PDP model score
eval(fs.readFileSync('pdp_model.js','utf8'));
function cal(raw,a){ if(raw>=a[2]) return 80+18*(1-Math.exp(-(raw-a[2])/Math.max(1e-6,a[2]-a[1]))); if(raw<=a[0]) return 30-25*(1-Math.exp(-(a[0]-raw)/Math.max(1e-6,a[1]-a[0]))); return raw<=a[1]?30+25*(raw-a[0])/(a[1]-a[0]):55+25*(raw-a[1])/(a[2]-a[1]); }
for (const [kind,key] of [['HOME','home'],['COLLECTION','coll']]) for (const bw of [0,0.5,0.6,0.7,1]) {
  const rows=[]; for(const k in D){const e=D[k],f=e[key]; if(!f||(f.words||0)<120||(kind==='COLLECTION'&&(f.cards||0)<2)) continue; const ps=e.pdpF&&(e.pdpF.words||0)>=120?croScoreOf(e.pdpF):null; if(!ps) continue; const hs=cal(score(f,kind).raw,out[kind].anchors); rows.push({k,l:relabel[k]||e.label,s:bw*ps.score+(1-bw)*hs});}
  const m=l=>{const x=rows.filter(r=>r.l===l);return Math.round(x.reduce((a,r)=>a+r.s,0)/x.length)}; let auc=0,n=0; rows.filter(r=>r.l==='G').forEach(a=>rows.filter(r=>r.l==='P').forEach(b=>{n++;auc+=a.s>b.s?1:a.s===b.s?.5:0}));
  console.log(kind,'pdpW',bw,'n',rows.length,'G',m('G'),'M',m('M'),'P',m('P'),'AUC',(auc/n).toFixed(2));
}
const BL={};
for (const [kind,key] of [['HOME','home'],['COLLECTION','coll']]) {
  const rows=[]; for(const k in D){const e=D[k],f=e[key]; if(!f||(f.words||0)<120||(kind==='COLLECTION'&&(f.cards||0)<2)) continue; const ps=e.pdpF&&(e.pdpF.words||0)>=120?croScoreOf(e.pdpF):null; if(!ps) continue; const hs=cal(score(f,kind).raw,out[kind].anchors); rows.push({k,l:relabel[k]||e.label,s:0.7*ps.score+0.3*hs});}
  const med=l=>{const x=rows.filter(r=>r.l===l).map(r=>r.s).sort((a,b)=>a-b);return x[Math.floor(x.length/2)]};
  const xs=rows.map(r=>r.s).sort((p,q)=>p-q), qq=p=>xs[Math.floor(p*(xs.length-1)+0.5)]; const a=[qq(0.2),qq(0.5),qq(0.8)].map(x=>Math.round(x*10)/10); BL[kind]=a;
  const fin=rows.map(r=>({...r,f:Math.round(cal(r.s,a))}));
  const m=l=>{const x=fin.filter(r=>r.l===l);return Math.round(x.reduce((q,r)=>q+r.f,0)/x.length)};
  console.log(kind,'blend anchors',a,'final G',m('G'),'M',m('M'),'P',m('P'));
  console.log('  '+fin.sort((x,y)=>y.f-x.f).map(r=>r.k.slice(0,12)+':'+r.l+':'+r.f).join(', '));
  out[kind].blend={pdpW:0.7,anchors:a,n:rows.length};
}
fs.writeFileSync('rubric_types.json', JSON.stringify(out)); console.log(JSON.stringify(out));
