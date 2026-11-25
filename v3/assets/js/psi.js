/* TrooCRO: PageSpeed Insights compactor + signal mapping (browser build of the shared psi.js). Exposes window.TrooPSI. */
(function () {
"use strict";
// Shared PageSpeed Insights compactor + TrooCRO signal mapping.
// Used by the edge function (Deno, ESM import) and by the website (browser, window.TrooPSI).
// Keep this file dependency-free.

const PSI_CATEGORIES = ["performance", "accessibility", "seo", "best-practices"];

function psiUrl(pageUrl, strategy, key) {
  const p = new URLSearchParams({ url: pageUrl, strategy: strategy || "mobile" });
  PSI_CATEGORIES.forEach((c) => p.append("category", c));
  if (key) p.set("key", key);
  return "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + p.toString();
}

function compactPsi(d, strategy) {
  const lr = (d && d.lighthouseResult) || {};
  const a = lr.audits || {};
  const cat = lr.categories || {};
  const score = (k) => (cat[k] && typeof cat[k].score === "number" ? Math.round(cat[k].score * 100) : null);
  const nv = (k) => (a[k] && typeof a[k].numericValue === "number" ? a[k].numericValue : null);
  const failed = (k) => a[k] && a[k].score === 0;
  const items = (k) => (a[k] && a[k].details && Array.isArray(a[k].details.items) ? a[k].details.items : []);

  const metrics = {
    lcp: nv("largest-contentful-paint"),
    fcp: nv("first-contentful-paint"),
    cls: nv("cumulative-layout-shift"),
    tbt: nv("total-blocking-time"),
    si: nv("speed-index"),
    ttfb: nv("server-response-time"),
    weightKb: a["total-byte-weight"] && a["total-byte-weight"].numericValue ? Math.round(a["total-byte-weight"].numericValue / 1024) : null,
    requests: items("network-requests").length || null,
  };

  const le = (d && d.loadingExperience) || {};
  const fm = le.metrics || {};
  const pct = (m) => (fm[m] && typeof fm[m].percentile === "number" ? fm[m].percentile : null);
  const field = le.overall_category
    ? {
        overall: le.overall_category,
        lcp: pct("LARGEST_CONTENTFUL_PAINT_MS"),
        inp: pct("INTERACTION_TO_NEXT_PAINT"),
        cls: pct("CUMULATIVE_LAYOUT_SHIFT_SCORE") != null ? pct("CUMULATIVE_LAYOUT_SHIFT_SCORE") / 100 : null,
        originFallback: !!le.origin_fallback,
      }
    : null;

  // Lighthouse moved the full-page screenshot from audits to lighthouseResult.fullPageScreenshot; read either
  const fps = (lr && lr.fullPageScreenshot) || (a["full-page-screenshot"] && a["full-page-screenshot"].details);
  const allNodes = (fps && fps.nodes) || {};
  const usedIds = new Set();
  const nodeOf = (it) => {
    const n = it && (it.node || (it.subItems && it.subItems.items && it.subItems.items[0] && it.subItems.items[0].node));
    if (!n || !n.lhId || !allNodes[n.lhId]) return null;
    usedIds.add(n.lhId);
    return { id: n.lhId, label: (n.nodeLabel || "").slice(0, 80), snippet: (n.snippet || "").slice(0, 160) };
  };
  const nodesFrom = (k, max) => items(k).map(nodeOf).filter(Boolean).slice(0, max || 6);

  const F = [];
  const add = (signal, evidence, nodes, extra) => F.push(Object.assign({ signal, evidence, nodes: nodes || [] }, extra || {}));
  const secs = (ms) => (ms / 1000).toFixed(1) + "s";

  // Speed
  if (metrics.lcp != null) {
    let lcpNodes = [];
    const lcpEl = items("largest-contentful-paint-element");
    if (lcpEl[0] && lcpEl[0].items) lcpNodes = lcpEl[0].items.map(nodeOf).filter(Boolean).slice(0, 1);
    else lcpNodes = nodesFrom("largest-contentful-paint-element", 1);
    if (metrics.lcp > 4000) add("SIG-ALL-F-SLOWLCP-01", "Largest content takes " + secs(metrics.lcp) + " to appear on a mid-range phone (good is under 2.5s).", lcpNodes, { area: "speed" });
    else if (metrics.lcp > 2500) add("SIG-PERF-F-LCPABOVE25-01", "Largest content appears at " + secs(metrics.lcp) + " on mobile (good is under 2.5s).", lcpNodes, { area: "speed" });
  }
  if (metrics.cls != null && metrics.cls > 0.1) add("SIG-PERF-F-CLSABOVE01-01", "Layout shifts while loading: CLS " + metrics.cls.toFixed(2) + " (good is under 0.1).", nodesFrom("layout-shifts", 3), { area: "speed" });
  if (metrics.tbt != null && metrics.tbt > 600) add("SIG-ALL-F-JSBLOCKING-01", "Scripts block the page for " + Math.round(metrics.tbt) + "ms before it responds to taps (good is under 200ms).", [], { area: "speed" });
  const tpAll = items("third-party-summary").map((i) => ({
    name: typeof i.entity === "string" ? i.entity : (i.entity && i.entity.text) || "",
    blockingMs: Math.round(i.blockingTime || 0),
    kb: Math.round((i.transferSize || 0) / 1024),
  })).filter((x) => x.name);
  const tpBlocking = tpAll.reduce((s, x) => s + x.blockingMs, 0);
  const thirdParty = tpAll.sort((x, y) => y.blockingMs - x.blockingMs || y.kb - x.kb).slice(0, 8);
  if (tpBlocking > 250) add("SIG-ALL-F-THIRDPARTYAPPDELAY-01", "Third-party scripts block " + tpBlocking + "ms, led by " + thirdParty.slice(0, 3).map((x) => x.name).join(", ") + ".", [], { area: "speed" });
  if (metrics.ttfb != null && metrics.ttfb > 800) add("SIG-PERF-F-TTFBHIGH-01", "Server takes " + Math.round(metrics.ttfb) + "ms to send the first byte (good is under 800ms).", [], { area: "speed" });
  const imgSave = a["modern-image-formats"] && a["modern-image-formats"].details && a["modern-image-formats"].details.overallSavingsBytes;
  if (imgSave && imgSave > 100 * 1024) add("SIG-PERF-F-IMAGEFORMATSUBOPTIMAL-01", "Serving images as WebP/AVIF would save about " + Math.round(imgSave / 1024) + " KB.", [], { area: "speed" });
  if (failed("font-display")) add("SIG-PERF-F-FONTLOADINGFOIT-01", "Web fonts hide text while they load (no font-display: swap).", [], { area: "speed" });
  if (field && field.overall === "SLOW") add("SIG-ALL-F-COREWEBVITALS-01", "Real Chrome users rate this " + (field.originFallback ? "site" : "page") + " slow on Core Web Vitals.", [], { area: "speed" });
  if (field && field.inp != null && field.inp > 200) add("SIG-PERF-F-INPABOVE200-01", "Real users wait " + field.inp + "ms for the page to react to a tap (good is under 200ms).", [], { area: "speed" });

  // Accessibility
  if (failed("color-contrast")) {
    const ns = nodesFrom("color-contrast", 6);
    const ctaLike = ns.some((n) => /<button|<a [^>]*(btn|button|cta)|type="submit"/i.test(n.snippet));
    const count = items("color-contrast").length;
    add(ctaLike ? "SIG-A11Y-F-CONTRASTCTALOW-01" : "SIG-A11Y-F-CONTRASTTEXTLOW-01", count + " text element" + (count === 1 ? "" : "s") + " fall below the readable contrast ratio" + (ctaLike ? ", including a button." : "."), ns, { area: "accessibility" });
  }
  if (failed("image-alt")) { const c = items("image-alt").length; add("SIG-A11Y-F-ALTTEXTMISSING-01", c + " image" + (c === 1 ? " has" : "s have") + " no alt text.", nodesFrom("image-alt", 4), { area: "accessibility" }); }
  if (failed("button-name") || failed("link-name")) {
    const c = items("button-name").length + items("link-name").length;
    add("SIG-A11Y-F-ARIALABELSMISS-01", c + " button" + (c === 1 ? " or link has" : "s or links have") + " no name a screen reader can announce.", nodesFrom("button-name", 3).concat(nodesFrom("link-name", 3)).slice(0, 4), { area: "accessibility" });
  }
  const tgt = a["target-size"] ? "target-size" : "tap-targets";
  if (failed(tgt)) { const c = items(tgt).length; add("SIG-MOB-F-TOUCHTARGETSIZE-01", c + " tap target" + (c === 1 ? " is" : "s are") + " too small or too close together on mobile.", nodesFrom(tgt, 4), { area: "accessibility" }); }
  if (failed("heading-order")) add("SIG-A11Y-F-HEADINGHIERARCHYBROKEN-01", "Heading levels skip (for example h2 straight to h4).", nodesFrom("heading-order", 2), { area: "accessibility" });
  if (failed("html-has-lang")) add("SIG-A11Y-F-LANGATTRMISS-01", "The page does not declare its language.", [], { area: "accessibility" });
  if (failed("link-text")) { const c = items("link-text").length; add("SIG-A11Y-F-LINKTEXTGENERIC-01", c + " link" + (c === 1 ? " uses" : "s use") + " vague text like 'click here' or 'learn more'.", [], { area: "accessibility" }); }
  if (failed("viewport")) add("SIG-MOB-F-VIEWPORTNOTSET-01", "No mobile viewport tag, so phones render the desktop layout.", [], { area: "accessibility" });

  const listFails = (catKey) => {
    const c = cat[catKey];
    if (!c || !Array.isArray(c.auditRefs)) return [];
    return c.auditRefs
      .filter((r) => r.weight > 0 && a[r.id] && a[r.id].score !== null && a[r.id].score < 1 && a[r.id].scoreDisplayMode !== "notApplicable" && a[r.id].scoreDisplayMode !== "manual")
      .map((r) => ({ id: r.id, title: (a[r.id].title || r.id).replace(/`/g, ""), count: items(r.id).length }))
      .slice(0, 12);
  };

  let full = null;
  if (fps && fps.screenshot && fps.screenshot.data) {
    const nodes = {};
    usedIds.forEach((id) => { const n = allNodes[id]; if (n) nodes[id] = { l: Math.round(n.left), t: Math.round(n.top), w: Math.round(n.width), h: Math.round(n.height) }; });
    full = { data: fps.screenshot.data, w: fps.screenshot.width, h: fps.screenshot.height, nodes };
  }
  const finalShot = a["final-screenshot"] && a["final-screenshot"].details && a["final-screenshot"].details.data;

  return {
    strategy: strategy || "mobile",
    fetchedAt: lr.fetchTime || null,
    finalUrl: lr.finalDisplayedUrl || lr.finalUrl || null,
    scores: { performance: score("performance"), accessibility: score("accessibility"), seo: score("seo"), bestPractices: score("best-practices") },
    metrics,
    field,
    thirdParty,
    thirdPartyBlockingMs: tpBlocking,
    findings: F,
    a11yFails: listFails("accessibility"),
    seoFails: listFails("seo"),
    shots: { final: finalShot || null, full },
  };
}


window.TrooPSI = { psiUrl: psiUrl, compactPsi: compactPsi, PSI_CATEGORIES: PSI_CATEGORIES };
})();
