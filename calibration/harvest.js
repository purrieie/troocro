// Fetches each page through the TrooCRO page view (no scripts), renders it at phone width, measures features, saves a screenshot.
const { chromium } = require('playwright');
const fs = require('fs');
const croFeatures = require('./crofeat.js');
const P = 'https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-page-view';
(async () => {
  const rows = JSON.parse(fs.readFileSync('urls.json'));
  const b = await chromium.launch();
  const out = fs.existsSync('features.json') ? JSON.parse(fs.readFileSync('features.json')) : {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; const id = r.brand.replace(/[^a-z0-9#]/gi, '_');
    if (out[id] && out[id].f) continue;
    let html = null;
    const hf = 'html/' + id + '.html';
    if (fs.existsSync(hf)) html = fs.readFileSync(hf, 'utf8');
    else {
      try {
        const res = await fetch(P + '?url=' + encodeURIComponent(r.url), { headers: { Origin: 'http://localhost:8765' }, signal: AbortSignal.timeout(40000) });
        const j = await res.json(); html = j.html || null; if (html) fs.writeFileSync(hf, html);
      } catch (e) { html = null; }
    }
    if (!html) { out[id] = { ...r, err: 'no_html' }; console.log('x', id); continue; }
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    try {
      await p.setContent(html, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(1500);
      // same lazy-image fix the live analyzer applies
      await p.evaluate(() => { document.querySelectorAll('img').forEach(im => { const ds = im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || im.getAttribute('data-original'); const dss = im.getAttribute('data-srcset'); if (ds && (!im.getAttribute('src') || /data:image|placeholder|blank/i.test(im.getAttribute('src')))) im.setAttribute('src', ds.replace(/\{width\}/g, '800')); if (dss && !im.getAttribute('srcset')) im.setAttribute('srcset', dss.replace(/\{width\}/g, '800')); im.removeAttribute('loading'); }); });
      await p.waitForTimeout(1200);
      const f = await p.evaluate(`(${croFeatures.toString()})(document, window)`);
      await p.screenshot({ path: 'shots/' + id + '.png', clip: { x: 0, y: 0, width: 390, height: 1690 } }).catch(() => p.screenshot({ path: 'shots/' + id + '.png' }));
      out[id] = { ...r, f };
      console.log('ok', id, f && f.words);
    } catch (e) { out[id] = { ...r, err: String(e).slice(0, 120) }; console.log('err', id); }
    await ctx.close();
    fs.writeFileSync('features.json', JSON.stringify(out, null, 1));
  }
  await b.close();
})();
