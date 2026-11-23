// Re-measure only the pages that came back empty, relaunching the browser if it dies.
const { chromium } = require('playwright'); const fs = require('fs'), zlib = require('zlib');
const croFeatures = require('./crofeat.js');
const IN = process.argv[2], OUT = process.argv[3], SH = +process.argv[4] || 0, NSH = +process.argv[5] || 1;
const L = fs.readFileSync(IN, 'utf8').trim().split('\n').map(JSON.parse);
let browser = null;
async function getB() { if (!browser || !browser.isConnected()) { try { if (browser) await browser.close(); } catch (e) {} browser = await chromium.launch(); } return browser; }
async function measure(html) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const b = await getB(); let ctx = null;
    try {
      ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false }); const p = await ctx.newPage();
      await p.setContent(html, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await p.evaluate(() => { document.querySelectorAll('img').forEach(im => { const ds = im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || im.getAttribute('data-original'); const dss = im.getAttribute('data-srcset'); if (ds && (!im.getAttribute('src') || /data:image|placeholder|blank/i.test(im.getAttribute('src')))) im.setAttribute('src', ds.replace(/\{width\}/g, '800')); if (dss && !im.getAttribute('srcset')) im.setAttribute('srcset', dss.replace(/\{width\}/g, '800')); im.removeAttribute('loading'); }); }).catch(() => {});
      await p.waitForTimeout(1200);
      const f = await p.evaluate(`(${croFeatures.toString()})(document, window)`);
      if (f) f.visible_text = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').length);
      await ctx.close().catch(() => {}); return f;
    } catch (e) { try { if (ctx) await ctx.close(); } catch (e2) {} }
  }
  return null;
}
const timed = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
(async () => {
  const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).dom) : []);
  const q = L.filter((x, i) => i % NSH === SH && !done.has(x.dom)); let redo = 0, n = 0;
  async function worker() {
    while (q.length) {
      const x = q.shift(), id = x.dom.replace(/[^a-z0-9]/gi, '_'), rec = { ...x };
      for (const k of ['home', 'pdp', 'coll']) {
        const f = `h3/${id}_${k}.html.gz`;
        if (fs.existsSync(f) && (rec[k] === null || rec[k] === undefined)) { rec[k] = await timed(measure(zlib.gunzipSync(fs.readFileSync(f)).toString()), 30000); redo++; }
      }
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n'); n++;
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  try { if (browser) await browser.close(); } catch (e) {}
  console.log('done', SH, 'records', n, 'remeasured', redo);
})();
