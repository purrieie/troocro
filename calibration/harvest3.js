// v8 benchmark harvest: ~680 sites. Stores: homepage + product page + collection. Lead-gen (fintech, healthtech): homepage.
// Every page goes through the same TrooCRO page view as the live analyzer and is measured on a 390x844 phone with scripts off.
const { chromium } = require('playwright');
const fs = require('fs');
const croFeatures = require('./crofeat.js');
const P = 'https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-page-view';
const BUDGET = (+process.argv[2] || 520) * 1000, T0 = Date.now(), CONC = +process.argv[3] || 12;
async function view(u) {
  try { const r = await fetch(P + '?url=' + encodeURIComponent(u), { headers: { Origin: 'http://localhost:8765' }, signal: AbortSignal.timeout(35000) }); if (!r.ok) return null; const j = await r.json(); return j.html && j.html.length > 2000 ? j : null; } catch (e) { return null; }
}
async function shopifyProduct(origin) {
  try { const r = await fetch(origin + '/products.json?limit=12', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) }); if (!r.ok) return null; const j = await r.json(); const ps = (j.products || []).filter(p => p.handle && (p.variants || []).some(v => v.available !== false)); const p = ps[0] || (j.products || [])[0]; return p ? origin + '/products/' + p.handle : null; } catch (e) { return null; }
}
function sameHost(u, base) { try { return new URL(u).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, ''); } catch (e) { return false; } }
function links(html, base, re, bad) {
  const out = {}; for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) { let h = m[1].replace(/&amp;/g, '&'); try { h = new URL(h, base).href.split('?')[0]; } catch (e) { continue; } if (!sameHost(h, base) || !re.test(h) || (bad && bad.test(h)) || /\.(js|css|png|jpe?g|webp|svg|json|xml)$/i.test(h)) continue; out[h] = (out[h] || 0) + 1; }
  return Object.entries(out).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
const zlib = require('zlib');
function save(id, kind, html) { try { fs.writeFileSync(`h3/${id}_${kind}.html.gz`, zlib.gzipSync(html)); } catch (e) {} }
async function measure(b, html, shot) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const p = await ctx.newPage(); let f = null;
  try {
    await p.setContent(html, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
    await p.evaluate(() => { document.querySelectorAll('img').forEach(im => { const ds = im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || im.getAttribute('data-original'); const dss = im.getAttribute('data-srcset'); if (ds && (!im.getAttribute('src') || /data:image|placeholder|blank/i.test(im.getAttribute('src')))) im.setAttribute('src', ds.replace(/\{width\}/g, '800')); if (dss && !im.getAttribute('srcset')) im.setAttribute('srcset', dss.replace(/\{width\}/g, '800')); im.removeAttribute('loading'); }); }).catch(() => {});
    await p.waitForTimeout(1500);
    f = await p.evaluate(`(${croFeatures.toString()})(document, window)`);
    if (f) f.visible_text = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').length);
    if (shot) await p.screenshot({ path: shot, timeout: 8000 }).catch(() => {});
  } catch (e) { f = null; }
  await ctx.close().catch(() => {}); return f;
}
(async () => {
  const rows = fs.readFileSync(process.env.SITES || 'sites.tsv', 'utf8').trim().split('\n').map(l => { const [label, seg, dom, kind] = l.split('\t'); return { label, seg, dom, kind }; });
  const doneF = process.env.OUTF || 'features3.jsonl', done = new Set();
  if (fs.existsSync(doneF)) fs.readFileSync(doneF, 'utf8').trim().split('\n').filter(Boolean).forEach(l => { try { done.add(JSON.parse(l).dom); } catch (e) {} });
  const SH = +process.argv[4] || 0, NSH = +process.argv[5] || 1;
  const queue = rows.filter((r, i) => !done.has(r.dom) && i % NSH === SH);
  console.log('todo', queue.length, 'done', done.size);
  const b = await chromium.launch();
  let n = 0;
  async function worker() {
    while (queue.length && Date.now() - T0 < BUDGET) {
      const r = queue.shift(), id = r.dom.replace(/[^a-z0-9]/gi, '_'), rec = { ...r, t: Date.now() };
      const home = await view('https://' + r.dom + '/');
      if (home) {
        const base = home.url || ('https://' + r.dom + '/'); rec.homeUrl = base;
        save(id, 'home', home.html); rec.home = await measure(b, home.html, r.label === '?' && r.kind === 'lead' ? `shots3/${id}_home.png` : null);
        if (r.kind === 'store') {
          const origin = new URL(base).origin;
          let pu = await shopifyProduct(origin);
          if (!pu) pu = links(home.html, base, /\/(products?|p|dp|item|buy)\/[^/]+/i)[0] || null;
          rec.pdpUrl = pu;
          if (pu) { const pv = await view(pu); if (pv) { save(id, 'pdp', pv.html); } if (pv) rec.pdp = await measure(b, pv.html, r.label === '?' ? `shots3/${id}_pdp.png` : null); }
          let cu = links(home.html, base, /\/(collections|category|categories|c|shop)\/[^/]+\/?$/i, /\/(products?|account|cart|pages|blogs?)\//i).filter(h => !/\/collections\/(all|frontpage|vendors|types)\/?$/i.test(h))[0] || null;
          if (!cu && pu && /\/products\//.test(pu)) cu = origin + '/collections/all';
          rec.collUrl = cu;
          if (cu) { const cv = await view(cu); if (cv) { save(id, 'coll', cv.html); } if (cv) rec.coll = await measure(b, cv.html, null); }
        }
      }
      rec.ms = Date.now() - rec.t;
      fs.appendFileSync(doneF, JSON.stringify(rec) + '\n'); n++;
      if (n % 10 === 0) console.log(n, 'elapsed', Math.round((Date.now() - T0) / 1000) + 's');
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await b.close();
  console.log('batch done', n, 'left', queue.length);
})();
