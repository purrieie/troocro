// Re-measure saved page-view HTML with the current crofeat.js (no refetch).
const { chromium } = require('playwright'); const fs = require('fs'), zlib = require('zlib');
const croFeatures = require('./crofeat.js');
const L = fs.readFileSync('features4.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const SH = +process.argv[2] || 0, NSH = +process.argv[3] || 1, OUT = `features5_${SH}.jsonl`;
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).dom) : []);
async function measure(b, html) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false }); const p = await ctx.newPage(); let f = null;
  try {
    await p.setContent(html, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
    await p.evaluate(() => { document.querySelectorAll('img').forEach(im => { const ds = im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || im.getAttribute('data-original'); const dss = im.getAttribute('data-srcset'); if (ds && (!im.getAttribute('src') || /data:image|placeholder|blank/i.test(im.getAttribute('src')))) im.setAttribute('src', ds.replace(/\{width\}/g, '800')); if (dss && !im.getAttribute('srcset')) im.setAttribute('srcset', dss.replace(/\{width\}/g, '800')); im.removeAttribute('loading'); }); }).catch(() => {});
    await p.waitForTimeout(1200);
    f = await p.evaluate(`(${croFeatures.toString()})(document, window)`);
    if (f) f.visible_text = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').length);
  } catch (e) { f = null; }
  await ctx.close().catch(() => {}); return f;
}
(async () => {
  const b = await chromium.launch(); const q = L.filter((x, i) => i % NSH === SH && !done.has(x.dom)); let n = 0;
  async function worker() {
    while (q.length) {
      const x = q.shift(), id = x.dom.replace(/[^a-z0-9]/gi, '_'), rec = { ...x };
      for (const k of ['home', 'pdp', 'coll']) { const f = `h3/${id}_${k}.html.gz`; if (fs.existsSync(f)) rec[k] = await measure(b, zlib.gunzipSync(fs.readFileSync(f)).toString()); }
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n'); if (++n % 50 === 0) console.log(SH, n);
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker)); await b.close(); console.log('done', SH, n);
})();
