const fs=require('fs');const s=fs.readFileSync('../assets/js/analyzer.js','utf8');
const SHORT={},REGION_OF={}; let RULES,ruleApplies;
eval(s.slice(s.indexOf('  var CAT_HAS'),s.indexOf('  var RULE_BY')).replace('var RULES','RULES'));
const ra=s.slice(s.indexOf('  function ruleApplies('),s.indexOf('  function renderedChecks('));eval(ra.replace('function ruleApplies','ruleApplies = function'));
const VL=JSON.parse(fs.readFileSync('visual_labels.json','utf8'));
const L=fs.readFileSync('features5.jsonl','utf8').trim().split('\n').map(JSON.parse);
const ok=f=>f&&(f.visible_text||0)>=250;
const lab=x=>{let l=x.label; if(l==='?') l=VL[x.dom]||'X'; return l==='X'?null:l;};
const stats={}, fire={};
for(const x of L){ const l=lab(x); if(!l) continue;
  const pages=x.kind==='lead'?[['LEAD',x.home]]:[['PDP',x.pdp],['HOME',x.home],['COLLECTION',x.coll]];
  for(const [T,f] of pages){ if(!ok(f)) continue; let n=0,hi=0;
    for(const r of RULES){ if(!ruleApplies(r,T,'')) continue; if(r.cats) continue; let v; try{v=r.ok(f);}catch(e){v=null;} if(v===null||v===undefined) continue;
      const k=T+':'+r.k; fire[k]=fire[k]||{n:0,f:0,G:0,P:0,nG:0,nP:0}; fire[k].n++; if(l==='G')fire[k].nG++; if(l==='P')fire[k].nP++;
      if(!v){ n++; let sv=r.sev; if(r.sevf){try{sv=r.sevf(f)}catch(e){}} if(sv>=3)hi++; fire[k].f++; if(l==='G')fire[k].G++; if(l==='P')fire[k].P++; } }
    const key=T+':'+l; stats[key]=stats[key]||{pages:0,issues:0,high:0}; stats[key].pages++; stats[key].issues+=n; stats[key].high+=hi; }
}
for(const T of ['PDP','HOME','COLLECTION','LEAD']) console.log(T, ['G','M','P'].map(l=>{const s=stats[T+':'+l]; return s? l+': '+(s.issues/s.pages).toFixed(1)+' issues ('+(s.high/s.pages).toFixed(1)+' high) n='+s.pages:'';}).join(' | '));
console.log('\nrule fire rates (fail share overall, strong vs weak):');
Object.entries(fire).sort().forEach(([k,v])=>console.log(k.padEnd(30),'fails',(100*v.f/v.n).toFixed(0)+'%','G',v.nG?(100*v.G/v.nG).toFixed(0)+'%':'-','P',v.nP?(100*v.P/v.nP).toFixed(0)+'%':'-','n',v.n));
