// Homepage + collection page for each benchmark brand, plus PDP re-measure with the extended extractor.
const { chromium } = require('playwright');
const fs = require('fs');
delete require.cache[require.resolve('./crofeat.js')];
const croFeatures = require('./crofeat.js');
const P = 'https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-page-view';
async function view(u) {
  try { const r = await fetch(P + '?url=' + encodeURIComponent(u), { headers: { Origin: 'http://localhost:8765' }, signal: AbortSignal.timeout(40000) }); const j = await r.json(); return j.html ? j : null; } catch (e) { return null; }
}
function pickCollection(html, base) {
  const m = [...html.matchAll(/href="((?:https?:\/\/[^"/]+)?\/collections\/([a-z0-9\-_%]+))(?:[?"#])/gi)].map(x => x[1]).filter(h => !/\/collections\/(all|frontpage|vendors|types)$/i.test(h) && !/\/products\//.test(h));
  if (!m.length) return null;
  const c = {}; m.forEach(h => c[h] = (c[h] || 0) + 1);
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  return new URL(best, base).href;
}
async function measure(b, html, shot) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const p = await ctx.newPage(); let f = null;
  try {
    await p.setContent(html, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1200);
    await p.evaluate(() => { document.querySelectorAll('img').forEach(im => { const ds = im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || im.getAttribute('data-original'); const dss = im.getAttribute('data-srcset'); if (ds && (!im.getAttribute('src') || /data:image|placeholder|blank/i.test(im.getAttribute('src')))) im.setAttribute('src', ds.replace(/\{width\}/g, '800')); if (dss && !im.getAttribute('srcset')) im.setAttribute('srcset', dss.replace(/\{width\}/g, '800')); im.removeAttribute('loading'); }); });
    await p.waitForTimeout(1200);
    f = await p.evaluate(`(${croFeatures.toString()})(document, window)`);
    if (shot) await p.screenshot({ path: shot }).catch(() => {});
  } catch (e) { f = null; }
  await ctx.close(); return f;
}
(async () => {
  const rows = JSON.parse(fs.readFileSync('urls.json')).filter(r => !/#2/.test(r.brand));
  const out = fs.existsSync('features2.json') ? JSON.parse(fs.readFileSync('features2.json')) : {};
  const b = await chromium.launch();
  const queue = rows.slice();
  async function worker() {
    while (queue.length) {
      const r = queue.shift(); const id = r.brand.replace(/[^a-z0-9]/gi, '_');
      if (out[id] && out[id].done) continue;
      const rec = { label: r.label, brand: r.brand, pdp: r.url };
      const origin = new URL(r.url).origin;
      const hf = 'html_home/' + id + '.html', cf = 'html_coll/' + id + '.html';
      let home = fs.existsSync(hf) ? { html: fs.readFileSync(hf, 'utf8'), url: origin } : await view(origin);
      if (home) { fs.writeFileSync(hf, home.html); rec.home = await measure(b, home.html, 'shots_home/' + id + '.png'); }
      const cu = home ? pickCollection(home.html, home.url || origin) : null; rec.collUrl = cu;
      if (cu) { let coll = fs.existsSync(cf) ? { html: fs.readFileSync(cf, 'utf8') } : await view(cu); if (coll) { fs.writeFileSync(cf, coll.html); rec.coll = await measure(b, coll.html, 'shots_coll/' + id + '.png'); } }
      const pf = 'html/' + id + '.html'; if (fs.existsSync(pf)) rec.pdpF = await measure(b, fs.readFileSync(pf, 'utf8'), null);
      rec.done = true; out[id] = rec; fs.writeFileSync('features2.json', JSON.stringify(out));
      console.log(id, !!rec.home, !!rec.coll, rec.home && rec.home.cards, rec.coll && rec.coll.cards);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  await b.close();
})();
