/* TrooGrowth engine: turns one scan into a growth plan a founder can read in five minutes.
   Pure script. Inputs: the scan report R (page, checks, PageSpeed, phone render) plus the extra reads from the troogrowth
   edge function (crawl, trust, insight, peers). Output: R.growth, which renders the same way for shared links.
   Every line carries a tag: seen (read on your pages), estimate (worked out from your answers or benchmarks),
   confirm (we can't check it from outside: ask the brand). */
(function () {
  "use strict";
  var win = window, LIB = win.TROOGROWTH_LIB || { cats: {}, det: {}, detCat: {}, needs: {}, confirm: {}, checkOnly: [], subs: {} };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clip(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function avg(a) { a = a.filter(function (x) { return typeof x === "number" && isFinite(x); }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

  /* ---------------- page text from the phone render's HTML (scripts already stripped) ---------------- */
  function pageText(html) {
    if (!html || !win.DOMParser) return { all: "", main: "", h1: "" };
    var d;
    try { d = new DOMParser().parseFromString(html, "text/html"); } catch (e) { return { all: "", main: "", h1: "" }; }
    Array.prototype.forEach.call(d.querySelectorAll("script,style,noscript,svg,template,iframe,.visually-hidden,.sr-only,.screen-reader-text,.hidden,[hidden],[aria-hidden=true],[style*='display:none'],[style*='display: none']"), function (n) { n.remove(); });
    Array.prototype.forEach.call(d.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,section,tr,dt,dd,summary,label,option"), function (n) { n.insertAdjacentText("afterend", ". "); });
    Array.prototype.forEach.call(d.querySelectorAll("br,div,td,button,a,span"), function (n) { n.insertAdjacentText("afterend", " "); });
    var h1 = d.querySelector("h1"), h1t = h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "";
    var tidy = function (x) { return x.replace(/\s+/g, " ").replace(/\s*\.(\s*\.)+/g, ".").replace(/([.!?:])\s*\./g, "$1").trim(); };
    var all = tidy(d.body ? d.body.textContent : "");
    var m = d.querySelector("main,#MainContent,[role=main]") || d.body;
    if (m) {
      Array.prototype.forEach.call(m.querySelectorAll("header,nav,footer,[class*=drawer],[id*=drawer],[class*=cart-],[id*=cart],[class*=announcement],[class*=popup],[class*=modal]"), function (n) { n.remove(); });
    }
    var main = m ? tidy(m.textContent) : all;
    // repeated marquee text: keep the first copy of each sentence
    var seen = {}, out = [];
    main.replace(/([.!?])\s+/g, "$1\u0001").split("\u0001").forEach(function (s) { var k = s.toLowerCase().slice(0, 80); if (!seen[k]) { seen[k] = 1; out.push(s); } });
    return { all: all.slice(0, 120000), main: out.join(" ").slice(0, 20000), h1: h1t };
  }

  function sentenceAt(t, i, max) {
    var a = i, b = i; max = max || 150;
    while (a > 0 && i - a < max && !/[.!?]\s/.test(t.slice(a - 2, a))) a--;
    while (b < t.length && b - i < max && !/[.!?]/.test(t[b])) b++;
    return clip(t.slice(a, b + 1).replace(/^[.\s]+/, ""), max);
  }
  function around(t, i, len) {
    var a = Math.max(0, i - 55), b = Math.min(t.length, i + len + 65);
    var sa = t.lastIndexOf(". ", i); if (sa >= a - 40 && sa >= 0 && sa < i) a = sa + 2;
    var sb = t.indexOf(". ", i + len); if (sb >= 0 && sb <= b + 40) b = sb + 1;
    var s = t.slice(a, b).trim();
    if (a > 0 && !/^[A-Z0-9₹$“"]/.test(s)) s = "…" + s.replace(/^\S*\s/, "");
    if (b < t.length && !/[.!?]$/.test(s)) s = s.replace(/\s\S*$/, "") + "…";
    return s;
  }
  function proseLike(q) { var w = q.replace(/[…."“”]/g, " ").split(/\s+/).filter(Boolean); if (w.length < 6) return false; var lower = w.filter(function (x) { return /^[a-z]/.test(x); }).length; return lower / w.length >= 0.35; }
  function findQ(t, rx) {
    var re; try { re = new RegExp(rx, "gi"); } catch (e) { return null; }
    var m, first = null, n = 0;
    while ((m = re.exec(t)) && n < 6) { n++; var q = around(t, m.index, m[0].length); if (!first) first = { q: q, word: m[0] }; if (proseLike(q)) return q; if (re.lastIndex === m.index) re.lastIndex++; }
    if (first && /\d/.test(first.word)) return first.q; // specs like "16 inches" or "250 ml" sit in tables, not sentences
    return first ? "\u0002" + cap(first.word.trim()) : null;
  }
  /* a quote, or a heading/link when the words only appear in a menu or tab */
  function evq(label, q) { return q.charAt(0) === "\u0002" ? cap(label) + ": a heading or link says \u201c" + q.slice(1) + "\u201d" : cap(label) + ": \u201c" + q + "\u201d"; }
  function plainQ(q) { return q && q.charAt(0) === "\u0002" ? q.slice(1) : q; }

  /* ---------------- context: category, sub-category, market, season ---------------- */
  function subOf(cat, s) {
    var best = null, bestN = 0;
    (LIB.subs[cat] || []).forEach(function (x) { var re = new RegExp(x[1], "gi"), n = (s.match(re) || []).length; if (n > bestN) { bestN = n; best = x[0]; } });
    return best;
  }
  function marketOf(R) {
    var P = R.page || {}, h = String(R.host || "");
    if (P.currency === "USD" || /\.us$/.test(h)) return "US";
    if (P.currency === "INR" || P.india || /\.in$|\.co\.in$/.test(h)) return "IN";
    return P.currency && P.currency !== "unknown" ? "OTHER" : "IN";
  }
  var SEASONS = {
    IN: [[0, "New year and winter sales", "Winter End of Season sales and New Year resolutions. Shoppers compare more and wait for offers."], [1, "Valentine's and wedding season", "Gifting and wedding shopping lift order values."], [2, "Holi and financial year end", "Spring offers; summer ranges start."], [3, "Summer", "Summer ranges and end-of-quarter sales."], [4, "Summer", "Heat-led needs (sunscreen, hydration, light fabrics)."], [5, "Monsoon starts", "End of Season sales; monsoon needs."], [6, "Monsoon and Prime Day", "Big marketplace sales pull deal-seekers."], [7, "Rakhi and Independence Day", "Gifting and freedom sales."], [8, "Festive run-up", "Navratri and early festive sales begin."], [9, "Diwali", "The year's biggest traffic. Gifting and bundles sell; slow pages lose the most money now."], [10, "Wedding season and Black Friday", "Weddings and late festive sales. Gifting, premium picks and bundles lift order values."], [11, "Year-end sales", "Christmas and New Year gifting; End of Season sales start."]],
    US: [[0, "New year", "Resolutions (fitness, wellness) and post-holiday returns."], [1, "Valentine's Day", "Gifting lifts jewellery, beauty and treats."], [2, "Spring", "Spring refresh and early Easter."], [3, "Spring and Easter", "Seasonal refresh."], [4, "Mother's Day and Memorial Day", "Gifting and long-weekend sales."], [5, "Father's Day and summer", "Gifting and summer ranges."], [6, "Summer and Prime Day", "Deal-seekers compare prices."], [7, "Back to school", "School and dorm shopping."], [8, "Labor Day", "End-of-summer sales."], [9, "Fall and Halloween", "Early holiday browsing starts."], [10, "Black Friday and Cyber Monday", "The year's biggest traffic. Bundles, gift sets and fast pages win."], [11, "Holidays", "Gifting, shipping cut-offs and gift cards."]],
  };
  function seasonOf(mk, d) { var s = (SEASONS[mk === "US" ? "US" : "IN"])[(d || new Date()).getMonth()]; return { name: s[1], note: s[2], festive: /Diwali|Black Friday|Holidays|Year-end|Valentine|wedding|Rakhi|Mother/i.test(s[1]) }; }
  var CONSUMABLE = { "Beauty & Personal Care": 1, "Health & Wellness": 1, "Food & Beverages": 1, "Pet Care": 1, "Baby & Kids": 1 };

  /* ---------------- buyer questions: the category's barrier library, graded on the page ---------------- */
  var GSCORE = { yes: 1, partly: 0.5, no: 0 };
  function checksByBarrier(R) {
    var L = (R.lib && R.lib.signals) || {}, map = {};
    (R.checks || []).forEach(function (c) {
      var s = L[c.signal] || {}; (s.barriers || []).forEach(function (b) {
        (map[b] = map[b] || []).push({ key: c.key, name: s.name || c.key, st: c.status, sev: s.severity || 2, ev: c.evidence, fix: s.fix && s.fix.playbook ? s.fix.playbook : "" });
      });
    });
    return map;
  }
  var SUB_SKIP = {
    "Cleaning & Laundry": { B36: 1, B37: 1, B53: 1, B54: 1 }, "Bedding & Bath": { B37: 1 }, "Kitchen & Dining": { B36: 1, B53: 1 }, "Plants & Garden": { B37: 1, B53: 1 },
    "Fragrance & Perfume": { B27: 1, B28: 1, B45: 1 }, "Men's Grooming": { B27: 1 }, "Oral Care": { B27: 1, B26: 1 }, "Sexual Wellness": { B27: 1, B28: 1 },
    "Footwear": { B49: 1 }, "Bags & Wallets": { B32: 1, B50: 1 }, "Eyewear": { B33: 1 },
    "Watches & Timepieces": { B20: 1, B24: 1 }, "Fashion & Imitation Jewellery": { B20: 1, B24: 1 },
  };
  function gradeLib(R, ctx, cat) {
    var rows = LIB.cats[cat] || LIB.cats.Other || [], skip = SUB_SKIP[ctx.sub] || {};
    var LEAD_SET = { B02: 1, B03: 1, B04: 1, B07: 1, B08: 1, B11: 1, B13: 1, B14: 1, B16: 1, B65: 1, B67: 1, B68: 1, B72: 1 };
    var LEAD_FIX = { B02: "Say who it's for in the first screen, in their words (for example: first-time investors, small businesses).", B72: "Say plainly whether there's any fee or lock-in to cancel or close the account.", B13: "Show app-store ratings, user numbers or named customer stories near the sign-up button.", B08: "Say what happens if it doesn't work out for them: free trial, cancel anytime or refund terms." };
    if (R.page && R.page.lead) rows = (LIB.cats.Other || []).filter(function (b) { return LEAD_SET[b.id]; }).map(function (b) { return LEAD_FIX[b.id] ? Object.assign({}, b, { good: LEAD_FIX[b.id] }) : b; });
    rows = rows.filter(function (b) { return !skip[b.id]; });
    var Tall = (ctx.text.all + " " + (ctx.side || "")).slice(0, 160000), Tmain = ctx.text.main ? (ctx.text.main + " " + (ctx.sideMain || "")).slice(0, 80000) : Tall;
    var FOOTER = { B08: 1, B09: 1, B10: 1, B14: 1, B16: 1, B69: 1, B71: 1, B06: 1, B50: 1, B04: 1 };
    var CB = checksByBarrier(R), out = [], tr = ctx.trust || {}, facts = tr.facts || {}, apps = appsOf(R, ctx);
    rows.forEach(function (b) {
      var T = FOOTER[b.id] ? Tall : Tmain;
      if (LIB.needs[b.id] && !new RegExp(LIB.needs[b.id], "i").test(Tmain)) return;
      var q = { id: b.id, q: b.q, p: b.p, w: b.w, fix: b.good, ev: [], src: "lib", tag: "seen" };
      if (LIB.confirm[b.id]) {
        q.g = "confirm"; q.tag = "confirm"; q.note = LIB.confirm[b.id];
        if (b.id === "B70" && apps.checkout.length) { q.g = "partly"; q.tag = "seen"; q.ev.push("One-tap checkout app installed: " + apps.checkout.join(", ") + ". Check the steps after it."); }
        if (b.id === "B65" && ctx.adMatch) { q.g = ctx.adMatch.g; q.tag = "seen"; q.ev.push(ctx.adMatch.ev); q.note = ""; }
        else if (b.id === "B65" && ctx.traffic !== "ads") return;
        out.push(q); return;
      }
      var dets = (LIB.det[b.id] || []).concat(((LIB.detCat[cat] || {})[b.id]) || []);
      var hits = {}, nHit = 0;
      if (LIB.checkOnly.indexOf(b.id) < 0) dets.forEach(function (d) {
        if (hits[d[0]]) return;
        var s = findQ(T, d[1]); if (s) { hits[d[0]] = s; nHit += s.charAt(0) === "\u0002" ? 0.5 : 1; }
      });
      var cs = (CB[b.id] || []).filter(function (c) { return c.st === "pass" || c.st === "fail"; });
      var fails = cs.filter(function (c) { return c.st === "fail"; }), passes = cs.filter(function (c) { return c.st === "pass"; });
      var textS = LIB.checkOnly.indexOf(b.id) >= 0 ? null : Math.min(nHit, 2) / 2;
      var wf = fails.reduce(function (s, c) { return s + (c.sev || 2); }, 0), wp = passes.reduce(function (s, c) { return s + (c.sev || 2); }, 0);
      var checkS = cs.length ? wp / (wp + wf) : null;
      var sc = textS == null ? checkS : checkS == null ? textS : 0.5 * textS + 0.5 * checkS;
      // facts from the trust read that change the answer
      if (b.id === "B08" || b.id === "B50") {
        if (facts.damagedOnly && !(tr.claims && (tr.claims.returnDays || tr.claims.easyReturns))) { sc = Math.min(sc == null ? 0.5 : sc, 0.5); q.ev.push("Policy: “" + clip(facts.damagedOnly.quote, 120) + "”"); }
        if (facts.returnDays && facts.returnDays.length && nHit === 0) { sc = Math.max(sc || 0, 0.5); q.ev.push("The returns policy gives " + facts.returnDays.join(" or ") + " days, but the page doesn't say it."); }
      }
      if (b.id === "B13") {
        var rated = (R.page && R.page.rating && R.page.rating.value) || (tr.reviews && tr.reviews.schema && tr.reviews.schema.value);
        if (rated) { sc = Math.max(sc || 0, nHit ? 1 : 0.75); if (!nHit) q.ev.push("Rated " + rated + (R.page.rating && R.page.rating.count ? " from " + R.page.rating.count + " reviews" : "") + " in the page data."); }
        else if (apps.reviews.length && !nHit) { q.g = "confirm"; q.tag = "confirm"; q.note = apps.reviews.join(", ") + " loads reviews with JavaScript, so we couldn't see them. Make sure stars show near the price on a phone."; out.push(q); return; }
      }
      if (sc == null) return; // nothing to judge it on
      q.g = sc >= 0.75 ? "yes" : sc >= 0.35 ? "partly" : "no";
      Object.keys(hits).sort(function (a, b) { return (hits[a].charAt(0) === "\u0002") - (hits[b].charAt(0) === "\u0002"); }).slice(0, 2).forEach(function (k) { q.ev.push(evq(k, hits[k])); });
      fails.slice(0, 2).forEach(function (c) { if (c.ev) q.ev.push(c.ev); });
      var fx = fails.filter(function (c) { return c.fix; }).sort(function (a, b) { return (b.sev || 2) - (a.sev || 2); })[0];
      if (fx && q.g !== "yes") q.fix = fx.fix;
      if (!q.ev.length && q.g === "no") q.ev.push("Not found in the page text we read.");
      if (q.g === "yes" && passes.length && !Object.keys(hits).length) q.ev.push(passes[0].ev || "Passes the page checks.");
      if (!q.ev.length && passes.length && passes[0].ev) q.ev.push(passes[0].ev);
      if (!q.ev.length && q.g === "partly") q.ev.push("Part of the answer is on the page, but it's thin or hard to find.");
      q.checks = cs.map(function (c) { return { n: c.name, st: c.st }; }).slice(0, 4);
      out.push(q);
    });
    return out;
  }
  function gradeProduct(ins, ctx) {
    if (!ins || !ins.questions) return [];
    var T = (ctx.text.main || ctx.text.all).toLowerCase();
    return ins.questions.map(function (x, i) {
      var hits = (x.look_for || []).filter(function (k) { return T.indexOf(k) >= 0; });
      var g = x.answer ? "yes" : hits.length >= 2 ? "partly" : "no";
      return { id: "P" + (i + 1), q: x.q, p: "must", w: 8, g: g, why: x.why, src: "product", tag: "seen",
        ev: x.answer ? ["The page says: “" + clip(x.answer, 140) + "”"] : hits.length ? ["The page mentions " + hits.slice(0, 3).join(", ") + " but doesn't answer it directly."] : ["Not answered on the page."],
        fix: x.answer ? "" : "Answer it near the price in one short line, in the shopper's words." };
    });
  }

  /* ---------------- installed apps (server stack + raw page read) ---------------- */
  function appsOf(R, ctx) {
    var out = { reviews: [], messaging: [], loyalty: [], referral: [], subscription: [], upsell: [], quiz: [], checkout: [], all: [] };
    var WA = /^(Bik|LimeChat|Interakt|WATI|Gallabox|AiSensy|Zoko|Gupshup|Spur|DelightChat|Klaviyo|Omnisend)$/;
    var add = function (n, c) { var k = c === "retention" || WA.test(n) ? "messaging" : c; if (out[k] && out[k].indexOf(n) < 0) out[k].push(n); if (out.all.indexOf(n) < 0) out.all.push(n); };
    ((R.stack && R.stack.tools) || []).forEach(function (t) { add(t.name, t.category); });
    (((ctx && ctx.trust) || {}).apps || []).forEach(function (a) { add(a.name, a.cat); });
    return out;
  }

  /* ---------------- branch helpers ---------------- */
  function item(k, t, st, ev, fix, tag, sev) { return { k: k, t: t, st: st, ev: ev || "", fix: fix || "", tag: tag || "seen", sev: sev || (st === "bad" ? 3 : st === "warn" ? 2 : 1) }; }
  function scoreItems(items, base) {
    var pen = 0; items.forEach(function (i) { if (i.st === "bad") pen += i.sev >= 3 ? 16 : 10; else if (i.st === "warn") pen += i.sev >= 2 ? 7 : 4; });
    return clamp(Math.round((base == null ? 100 : base) - pen), 0, 100);
  }

  /* Discover: can Google and AI assistants find and understand the store? */
  function discover(R, ctx) {
    var c = ctx.crawl, items = [], psi = R.psi || {};
    if (!c || !c.pages) {
      var ai = R.ai || {};
      (ai.checks || []).forEach(function (x) { if (!x.pass) items.push(item("ai_" + (x.key || x.label), x.label, "warn", x.detail || "", "", "seen", 2)); });
      return { score: ai.readiness != null ? ai.readiness : null, items: items, note: "Read from your homepage only: the site crawl didn't finish." };
    }
    var P = c.pages.filter(function (p) { return p.status === 200 && p.titleLen != null; }), n = P.length || 1;
    var prods = P.filter(function (p) { return p.kind === "product"; }), np = prods.length;
    if (!c.sitemap) items.push(item("sitemap", "No sitemap for search engines", "bad", "We couldn't find /sitemap.xml or a sitemap in robots.txt.", "Publish a sitemap and submit it in Google Search Console.", "seen", 3));
    var aiSearch = (c.aiBlocked || []).filter(function (b) { return /ChatGPT-User|OAI-SearchBot|PerplexityBot|Claude-SearchBot|Claude-User|Perplexity-User/.test(b); });
    if (aiSearch.length) items.push(item("ai_block", "AI assistants are blocked from reading the site", "bad", "robots.txt blocks " + aiSearch.join(", ") + ", so ChatGPT and Perplexity can't recommend your products.", "Allow AI search bots in robots.txt (training bots can stay blocked).", "seen", 3));
    else if ((c.aiBlocked || []).length) items.push(item("ai_train", "Some AI crawlers are blocked", "ok", "Blocked: " + c.aiBlocked.join(", ") + ". Search assistants can still read the site.", "", "seen", 1));
    if (!c.llms) items.push(item("llms", "No llms.txt for AI assistants", "warn", "AI assistants look for /llms.txt to understand a store quickly.", "Add an llms.txt with your categories, best sellers and policies.", "seen", 1));
    var noTitle = P.filter(function (p) { return !p.titleLen; }).length, longT = P.filter(function (p) { return p.titleLen > 65; }).length;
    var titles = {}, dup = 0; P.forEach(function (p) { var k = (p.title || "").toLowerCase(); if (k) { if (titles[k]) dup++; titles[k] = 1; } });
    if (noTitle) items.push(item("title_missing", "Pages without a title", "bad", noTitle + " of " + n + " pages we sampled have no title.", "Give every page a unique title with the product and category words people search.", "seen", 3));
    if (dup) items.push(item("title_dup", "Pages share the same title", "warn", dup + " of " + n + " sampled pages repeat another page's title.", "Write a unique title per page.", "seen", 2));
    if (longT > n / 3) items.push(item("title_long", "Titles get cut off in Google", "warn", longT + " of " + n + " titles are longer than 65 characters.", "Keep titles under 60 characters, product first, brand last.", "seen", 1));
    var noDesc = P.filter(function (p) { return !p.desc; }).length;
    if (noDesc) items.push(item("desc", "Pages without a meta description", noDesc > n / 3 ? "warn" : "ok", noDesc + " of " + n + " pages have no description, so Google writes its own snippet.", "Write a 140 to 155 character description per page with the main benefit and offer.", "seen", 2));
    var noindex = P.filter(function (p) { return p.noindex && (p.kind === "product" || p.kind === "collection" || p.kind === "home"); });
    if (noindex.length) items.push(item("noindex", "Shopping pages hidden from Google", "bad", noindex.length + " product or collection pages say noindex: " + noindex.slice(0, 2).map(function (p) { return p.url.replace(/^https?:\/\/[^/]+/, ""); }).join(", ") + ".", "Remove noindex from pages you want found.", "seen", 3));
    var canonOther = P.filter(function (p) { return p.canon === "other"; }).length, canonNone = P.filter(function (p) { return p.canon === "none"; }).length;
    if (canonNone > n / 3) items.push(item("canon", "Pages without a canonical link", "warn", canonNone + " of " + n + " pages don't say which address is the main one.", "Add a self-referencing canonical tag to every page.", "seen", 2));
    if (canonOther > n / 3) items.push(item("canon_other", "Pages point Google to another address", "warn", canonOther + " of " + n + " sitemap pages name a different canonical address.", "List only canonical addresses in the sitemap.", "seen", 2));
    var badH1 = P.filter(function (p) { return p.h1 !== 1; }).length;
    if (badH1 > n / 3) items.push(item("h1", "Pages without exactly one main heading", "warn", badH1 + " of " + n + " pages have no H1 or more than one.", "One H1 per page that names the product or category.", "seen", 1));
    if (np) {
      var noProd = prods.filter(function (p) { return (p.types || []).indexOf("Product") < 0 && (p.types || []).indexOf("ProductGroup") < 0; }).length;
      var noRate = prods.filter(function (p) { return !p.rating; }).length, noFaq = prods.filter(function (p) { return !p.faq; }).length;
      if (noProd) items.push(item("schema_product", "Product pages Google can't read as products", "bad", noProd + " of " + np + " product pages have no Product schema, so no price or stock in search results.", "Add Product schema with price, availability and brand.", "seen", 3));
      if (noRate === np) items.push(item("schema_rating", "No review stars in Google results", "warn", "None of the " + np + " product pages we sampled share their rating with search engines.", "Add aggregateRating to Product schema (most review apps can do this).", "seen", 2));
      if (noFaq > np / 2) items.push(item("schema_faq", "Product pages don't answer questions in a way AI can quote", "warn", noFaq + " of " + np + " product pages have no FAQ schema.", "Add 4 to 6 real buyer questions per product page with FAQ schema.", "seen", 2));
    }
    var imgs = P.reduce(function (s, p) { return s + (p.imgs || 0); }, 0), noAlt = P.reduce(function (s, p) { return s + (p.noAlt || 0); }, 0);
    if (imgs > 20 && noAlt / imgs > 0.25) items.push(item("alt", "Images without descriptions", "warn", pct(noAlt, imgs) + "% of images on the sampled pages have no alt text, so image search and screen readers skip them.", "Describe every product image in its alt text.", "seen", 1));
    var blogs = (c.counts && c.counts.blog) || 0;
    if (blogs < 5) items.push(item("content", "Few articles answering buyer questions", "warn", (blogs ? "Only " + blogs + " blog or guide pages" : "No blog or guide pages") + " in the sitemap. AI answers quote pages that explain things.", "Publish guides that answer the top buyer questions in this report.", "seen", 2));
    var bad200 = c.pages.length - P.length;
    if (bad200 > 0) items.push(item("errors", "Pages that didn't load", bad200 > 3 ? "warn" : "ok", bad200 + " of " + c.pages.length + " sampled pages returned an error or blocked us.", "Fix or redirect broken sitemap links.", "seen", 1));
    var base = scoreItems(items);
    var seo = psi.scores && psi.scores.seo;
    return { score: seo != null ? Math.round(0.7 * base + 0.3 * seo) : base, items: items, note: "We read " + n + " pages from your sitemap" + (c.sitemapUrls ? " (" + c.sitemapUrls + " listed)" : "") + (c.blocked ? ", skipping " + c.blocked + " that robots.txt asks us not to read" : "") + "." + (seo != null ? " Google's SEO score for this page: " + seo + "/100." : "") };
  }

  /* Land: does the page load fast and match what brought the visitor? */
  function land(R, ctx) {
    var p = R.psi, items = [];
    if (ctx.adMatch && ctx.adMatch.g !== "yes") items.push(item("admatch", "The page doesn't match your ad", ctx.adMatch.g === "no" ? "bad" : "warn", ctx.adMatch.ev, "Repeat the ad's promise in the first headline and show the same product and offer.", "seen", 3));
    if (!p || !p.scores || p.scores.performance == null) {
      var lt = R.lite || {};
      if (lt.speedEstimate != null && lt.speedEstimate < 60) items.push(item("speed_est", "The page looks heavy", "warn", (lt.htmlKb || "?") + " KB of HTML and " + (lt.scripts || "?") + " scripts.", "Run a full speed audit.", "estimate", 2));
      return { score: lt.speedEstimate != null ? lt.speedEstimate : null, items: items, note: "Google PageSpeed didn't answer in time, so this is estimated from the page's code.", est: true };
    }
    var m = p.metrics || {}, d = p.desktop || null, runs = p.runs || 1;
    var lcp = m.lcp != null ? m.lcp / 1000 : null;
    if (lcp != null && lcp > 2.5) items.push(item("lcp", "The main image shows late on phones", lcp > 4 ? "bad" : "warn", "Largest content appears at " + lcp.toFixed(1) + "s on a mid-range phone (good is under 2.5s).", "Serve the first image in WebP at the size shown, preload it, and don't lazy-load it.", "seen", lcp > 4 ? 3 : 2));
    if (m.tbt != null && m.tbt > 300) items.push(item("tbt", "Scripts freeze the page before shoppers can tap", m.tbt > 600 ? "bad" : "warn", "The page is blocked for " + Math.round(m.tbt) + "ms (good is under 200ms).", "Delay apps that aren't needed on the first screen.", "seen", m.tbt > 600 ? 3 : 2));
    if (m.cls != null && m.cls > 0.1) items.push(item("cls", "The layout jumps while loading", m.cls > 0.25 ? "bad" : "warn", "Layout shift " + m.cls.toFixed(2) + " (good is under 0.1). Shoppers tap the wrong thing.", "Reserve space for images, banners and review widgets.", "seen", 2));
    var tp = (p.thirdParty || []).filter(function (x) { return x.blockingMs > 50; }).slice(0, 3);
    if (tp.length) items.push(item("apps", "Apps slowing the page", "warn", tp.map(function (x) { return x.name + " (" + x.blockingMs + "ms)"; }).join(", ") + ".", "Load these after the page is usable, or remove the ones you don't use.", "seen", 2));
    if (p.field && p.field.overall === "SLOW") items.push(item("field", "Real Chrome users rate the site slow", "bad", "Google's real-user data (last 28 days) marks this " + (p.field.originFallback ? "site" : "page") + " as slow.", "Fix the main image and scripts first; field data updates over 28 days.", "seen", 3));
    if (m.weightKb && m.weightKb > 3500) items.push(item("weight", "The page is heavy", "warn", "About " + (m.weightKb / 1024).toFixed(1) + " MB to download on a phone.", "Compress images and drop unused apps.", "seen", 1));
    var a11y = p.scores.accessibility;
    if (a11y != null && a11y < 80) items.push(item("a11y", "Hard to use for some shoppers", "warn", "Accessibility " + a11y + "/100 (Google Lighthouse): contrast, labels or tap targets.", "Fix contrast and add labels to icon buttons.", "seen", 1));
    var mob = p.scores.performance, desk = d && d.scores ? d.scores.performance : null;
    var score = Math.round(0.7 * mob + 0.1 * (desk != null ? desk : mob) + 0.2 * (a11y != null ? a11y : 80));
    if (ctx.adMatch && ctx.adMatch.g === "no") score = Math.max(0, score - 15);
    return { score: score, items: items, note: "Google PageSpeed, average of " + runs + (runs === 1 ? " run" : " runs") + " on a mid-range phone: " + mob + "/100" + (desk != null ? "; desktop " + desk + "/100" : "") + "." };
  }

  /* Trust: does anything on the page undercut itself? */
  function trust(R, ctx, qs) {
    var t = ctx.trust || {}, items = [], ins = ctx.insight || {}, f = t.facts || {}, apps = appsOf(R, ctx);
    (t.contradictions || []).forEach(function (c) {
      if (/^The page promises easy returns/.test(c.issue) && /\b(sale|offer|discount|personali[sz]ed|custom|hygiene|opened|used|innerwear|clearance|free gift)\b/i.test(c.b.quote)) {
        items.push(item("contra_exc", "Easy returns, with exceptions the page doesn't mention", "warn", "Page: \u201c" + clip(c.a.quote, 100) + "\u201d  Policy: \u201c" + clip(c.b.quote, 120) + "\u201d", "Add the exception next to the returns promise (one short line).", "seen", 1));
        return;
      }
      items.push(item("contra", c.issue, c.sev >= 2 ? "bad" : "warn", "Page: “" + clip(c.a.quote, 110) + "”  Policy: “" + clip(c.b.quote, 110) + "”", "Make the page and the policy say the same thing.", "seen", c.sev >= 3 ? 3 : 2)); });
    (ins.contradictions || []).forEach(function (c) { items.push(item("contra_ai", cap(c.issue), "warn", "“" + clip(c.a, 110) + "” vs “" + clip(c.b, 110) + "”", "Pick one and use it everywhere.", "seen", 2)); });
    (t.urgency || []).forEach(function (u) {
      if (u.kind === "random") items.push(item("fake_urgency", "A 'people viewing' or stock number is made up by a script", "bad", u.text, "Show real stock or remove the message. Shoppers who spot it stop trusting the rest of the page.", "seen", 3));
      else if (u.kind === "app") items.push(item("timer_app", "Countdown or live-activity app", "confirm", u.text + " We can't see from outside whether it resets for each visitor.", "If the timer restarts on every visit, switch it to a real end date.", "confirm", 2));
      else items.push(item("timer_text", "Countdown or stock message", "confirm", "“" + clip(u.quote, 110) + "”", "Make sure it's real (a real end date or real stock).", "confirm", 1));
    });
    (t.numbers || []).forEach(function (n) { items.push(item("numbers", n.issue, n.sev >= 2 ? "bad" : "warn", n.quote ? "“" + clip(n.quote, 110) + "”" : "", "Fix the numbers so every price and discount agrees.", "seen", n.sev || 2)); });
    (t.unsupported || []).forEach(function (u) { items.push(item("claim", "‘" + cap(u.claim) + "’ without a source", "confirm", "“" + clip(u.quote, 120) + "”", "Add the proof next to the claim: the study, test or certificate.", "confirm", 2)); });
    if (t.facts && !(f.policies || []).length) items.push(item("no_policy", "We couldn't find a returns or shipping policy", "bad", "No policy page linked from this page.", "Link returns, shipping and refund policies in the footer and near Add to cart.", "seen", 3));
    if (f.damagedOnly) items.push(item("returns_scope", "Returns only for damaged or wrong items", "warn", "Policy: “" + clip(f.damagedOnly.quote, 130) + "”", "Say it plainly near Add to cart, with what you do offer (replacement, exchange).", "seen", 2));
    if (f.codFee) items.push(item("cod_fee", "Cash on delivery costs extra", "warn", "Policy mentions a ₹" + f.codFee + " COD charge. Shoppers who find it at checkout drop off.", "Show the COD charge on the product page, next to the payment options.", "seen", 1));
    var rated = (R.page && R.page.rating && R.page.rating.value) || (t.reviews && t.reviews.schema && t.reviews.schema.value);
    if (!rated && !apps.reviews.length) items.push(R.page && R.page.lead ? item("no_reviews", "No ratings in the page data", "warn", "We didn't find a rating that search engines and AI assistants can read.", "Show app-store ratings or user numbers near the sign-up button, with rating schema.", "seen", 1) : item("no_reviews", "No reviews on the page", "bad", "No star rating in the page data and no reviews app installed.", "Add a reviews app and show stars near the price.", "seen", 3));
    else if (!rated && apps.reviews.length) items.push(item("reviews_js", "Reviews load late", "confirm", apps.reviews.join(", ") + " draws reviews with JavaScript, so search engines and slow phones may not see them.", "Turn on the app's schema or server-rendered stars.", "confirm", 1));
    var score = scoreItems(items.filter(function (i) { return i.st !== "confirm"; }));
    return { score: score, items: items, note: (f.policies || []).length ? "We read " + f.policies.length + " policy " + (f.policies.length === 1 ? "page" : "pages") + " and compared them with the page." : "" };
  }

  /* Order value: does the page invite a bigger basket? */
  function orderValue(R, ctx, money, cat) {
    var T = ctx.text.all + " " + (ctx.side || ""), items = [], apps = appsOf(R, ctx), have = 0, tot = 0;
    /* big-ticket stores grow baskets with sets, add-ons and pay-later, not multi-packs */
    var big = (money && money.aov >= 5000) || /Jewellery/.test(cat) || ctx.sub === "Furniture";
    var W = big ? { bundle: 10, xsell: 30, threshold: 10, volume: 0, gift: 20, emi: 25 } : { bundle: 25, xsell: 25, threshold: 20, volume: 15, gift: 15, emi: 0 };
    function chk(k, label, rx, w, fix, okEv, extra) {
      tot += w; var q = plainQ(findQ(T, rx)), ok = !!q || !!extra;
      if (ok) { have += w; items.push(item(k, label, "ok", q ? "“" + q + "”" : extra, "", "seen", 1)); }
      else items.push(item(k, label, "warn", okEv, fix, "seen", w >= 25 ? 2 : 1));
    }
    chk("bundle", big ? "Sets and combos" : "Bundles or combos", "\\b(combos?|bundles?|kit|pack of (?:\\d|two|three|four|six)|buy \\d (?:get|for)|b\\dg\\d|value pack|build your own|set of \\d|matching set)\\b", W.bundle, "Offer a 2 or 3 pack or a routine bundle at a small saving.", "No bundle or combo offer found on the pages we read.");
    chk("xsell", "Add-ons and pairings", "\\b(frequently bought together|you may also like|complete the (?:look|routine|set|kit)|pairs? (?:well )?with|customers also (?:bought|viewed)|goes well with|you might also like|recommended for you|hot deals|deals for you|add[- ]ons?|upgrade your|build your (?:own )?(?:box|kit|bundle|combo)|bought together|shop the look|style it with)\\b", W.xsell, "Show 2 or 3 add-ons that go with this product near Add to cart.", "No 'goes well with' or add-on section found.", apps.upsell.length ? "Upsell app installed: " + apps.upsell.join(", ") + "." : "");
    var thr = (T.match(/free (?:shipping|delivery)[^.]{0,40}?(?:above|over|on orders? (?:above|over|of))\s*(?:rs\.?|inr|₹|\$)\s*([\d,]+)/i) || [])[1];
    thr = thr ? +thr.replace(/,/g, "") : (ctx.trust && ctx.trust.facts && ctx.trust.facts.freeShipAbove) || null;
    var tw = W.threshold; tot += tw;
    var pdp = R.page && R.page.pageType === "PDP" && money && money.src && money.src.aov === "page", ref = pdp ? "this product's price" : "a typical order";
    if (thr && money && money.aov) {
      var r = thr / money.aov;
      if (r > 1.05 && r < 2) { have += tw; items.push(item("threshold", "Free-shipping goal a little above " + ref, "ok", "Free shipping from " + sym(money.cur) + thr.toLocaleString("en-IN") + ", a little above " + ref + " (" + sym(money.cur) + Math.round(money.aov).toLocaleString("en-IN") + ").", "", "seen", 1)); }
      else if (r <= 1.05) { have += pdp ? tw : tw * 0.4; items.push(item("threshold", "Free shipping starts below " + ref, pdp ? "ok" : "warn", "Free shipping from " + sym(money.cur) + thr.toLocaleString("en-IN") + "; " + ref + " is " + sym(money.cur) + Math.round(money.aov).toLocaleString("en-IN") + (pdp ? ", so the threshold doesn't add to this basket. Check it against your store-wide average order." : ", so it doesn't push baskets up."), pdp ? "" : "Test a threshold about 20 to 30% above your typical order, with a progress bar in the cart.", "estimate", pdp ? 1 : 2)); }
      else { have += tw * 0.4; items.push(item("threshold", "Free-shipping goal is far away", "warn", "Free shipping from " + sym(money.cur) + thr.toLocaleString("en-IN") + ", about " + r.toFixed(1) + "x " + ref + ".", "Test a closer threshold with a progress bar in the cart.", "estimate", 1)); }
    } else if (thr) { have += tw * 0.6; items.push(item("threshold", "Free-shipping threshold", "ok", "Free shipping from " + sym(money && money.cur) + thr.toLocaleString("en-IN") + ".", "", "seen", 1)); }
    else items.push(item("threshold", "No free-shipping goal shown", "warn", "We didn't find a free-shipping threshold on the page.", "Show a free-shipping goal and a progress bar in the cart.", "seen", 1));
    if (W.volume) chk("volume", "Buy more, save more", "\\b(buy (?:any )?\\d+ (?:at|for|get)|buy more,? save more|\\d+% off on (?:\\d|two|three)|extra \\d+% off on|flat \\d+% off on orders? above)\\b", W.volume, "Try a tiered offer (buy 2 save 10%, buy 3 save 15%).", "No multi-buy offer found.");
    if (W.emi) chk("emi", "Pay later or EMI near the price", "\\b(no[- ]cost emi|emi (?:from|starting|available|options?)|pay in \\d|snapmint|simpl|zestmoney|klarna|afterpay|affirm)\\b", W.emi, "Show 'No-cost EMI from \u20b9X a month' under the price.", "No EMI or pay-later line found near the price.", apps.checkout.filter(function (n) { return /Snapmint|Simpl/.test(n); }).length ? "Pay-later app installed: " + apps.checkout.filter(function (n) { return /Snapmint|Simpl/.test(n); }).join(", ") + "." : "");
    chk("gift", "Gifting", "\\b(gift (?:wrap|card|box|set|hamper|message)|gifting)\\b", W.gift, "Add gift wrap, gift sets or gift cards, especially in " + ((ctx.season && ctx.season.name) || "festive season") + ".", "No gifting option found.");
    return { score: Math.round(100 * have / tot), items: items, note: "What the pages offer to grow a basket." };
  }
  function sym(cur) { return !cur || cur === "INR" || cur === "unknown" ? "₹" : cur === "USD" ? "$" : cur + " "; }

  /* Retain: will a first-time buyer come back? */
  function retain(R, ctx, cat) {
    var T = ctx.text.all + " " + (ctx.side || ""), items = [], apps = appsOf(R, ctx), have = 0, tot = 0, cons = !!CONSUMABLE[cat];
    function chk(k, label, rx, w, fix, missEv, appList) {
      tot += w; var q = rx ? plainQ(findQ(T, rx)) : null, ok = !!q || (appList && appList.length);
      if (ok) { have += w; items.push(item(k, label, "ok", appList && appList.length ? "Installed: " + appList.join(", ") + "." + (q ? " “" + q + "”" : "") : "“" + q + "”", "", "seen", 1)); }
      else items.push(item(k, label, "warn", missEv, fix, "seen", w >= 20 ? 2 : 1));
    }
    chk("capture", "Email or WhatsApp sign-up", "\\b(sign up|subscribe to|join (?:our|the) (?:list|club|community|newsletter)|newsletter|get \\d+% off (?:on )?(?:your )?first order|whatsapp updates|be the first to know)\\b", 25, "Ask for email or WhatsApp with a first-order offer.", "No sign-up box found on the page.", null);
    if (apps.messaging.length) chk("messaging", "Email, SMS or WhatsApp marketing tool", null, 20, "", "", apps.messaging);
    else items.push(item("messaging", "Email, SMS or WhatsApp follow-ups", "confirm", "We didn't see an email, SMS or WhatsApp marketing tool in the page code. Many load later, so check that abandoned-cart and post-purchase messages are on.", "Set up abandoned-cart and post-purchase flows.", "confirm", 1));
    chk("loyalty", "Rewards or loyalty", "\\b(rewards|reward points|loyalty|earn (?:points|coins)|cashback|membership|refer (?:a friend|and earn)|wallet points|coins)\\b", 20, "Start a simple points or referral program.", "No rewards, points or referral program found.", apps.loyalty.concat(apps.referral));
    if (cons) chk("subscribe", "Subscribe and save", "\\b(subscribe (?:&|and) save|subscription|auto[- ]?ship|deliver every|refill)\\b", 25, "Offer subscribe-and-save on products people run out of.", "No subscription or refill option found.", apps.subscription);
    else chk("care", "Care, warranty or registration", "\\b(warranty registration|register your product|care guide|lifetime (?:service|warranty|exchange))\\b", 15, "Add care guides or warranty registration to get a reason to stay in touch.", "No care or warranty registration found.", null);
    chk("account", "Order tracking and account", "\\b(track (?:your )?order|my account|log ?in|sign in)\\b", 10, "Make order tracking easy to find.", "No order tracking or account link found.", null);
    return { score: Math.round(100 * have / tot), items: items, note: cons ? "People run out of " + cat.toLowerCase() + " products, so repeat orders matter." : "People buy " + cat.toLowerCase() + " less often, so referrals and care matter more than refills." };
  }

  /* ---------------- money: what a 10% lift on each lever is worth ---------------- */
  var BAND_MID = { "< ₹500": 400, "₹500–₹2,000": 1200, "₹2,000–₹5,000": 3200, "₹5,000+": 7500 };
  var REACH = { search: 0.6, mix: 0.35, ads: 0.15, social: 0.15 };
  function moneyOf(R, cat) {
    var P = R.page || {}, I = R.inputs || {}, b = R.benchmark;
    if (b && cat && b.category !== cat && b.category !== "Other") b = null; // benchmark was for a different category
    var visitors = +I.visitors || 0, vSrc = visitors ? "you" : "estimate"; if (!visitors) visitors = 30000;
    var cvr = +I.cvr || (b && b.cvr) || 0, cSrc = +I.cvr ? "you" : b && b.cvr ? "benchmark" : "estimate"; if (!cvr) cvr = 1.5;
    var aov = +I.aov || P.aov || BAND_MID[P.aovBand] || 0, aSrc = +I.aov ? "you" : P.aov ? "page" : BAND_MID[P.aovBand] ? "band" : null;
    var cur = !P.currency || P.currency === "unknown" ? "INR" : P.currency;
    if (!P.aov && !+I.aov) cur = "INR";
    var rev = aov ? visitors * cvr / 100 * aov : null;
    return { visitors: visitors, cvr: cvr, aov: aov || null, cur: cur, rev: rev, src: { visitors: vSrc, cvr: cSrc, aov: aSrc }, bench: b ? { category: b.category, band: b.band } : null };
  }
  var LEVERS = [
    ["discover", "Discover", "More people find you on Google and in AI answers"],
    ["land", "Land", "Visitors stay because the page loads fast and matches the ad"],
    ["convert", "Convert", "The page answers buyers' doubts"],
    ["trust", "Trust", "Nothing on the page makes shoppers doubt you"],
    ["aov", "Order value", "Bigger baskets"],
    ["retain", "Retain", "First-time buyers come back"],
  ];
  var GOAL_W = { conversion: { convert: 1.3, trust: 1.2, land: 1.1 }, aov: { aov: 1.5, convert: 1.1 }, ads: { land: 1.35, convert: 1.2 }, speed: { land: 1.5 }, ai: { discover: 1.6 }, repeat: { retain: 1.5, trust: 1.1 } };
  var TRAFFIC_W = { ads: { land: 1.25, convert: 1.1 }, search: { discover: 1.25 }, social: { land: 1.15, trust: 1.15 }, mix: {} };
  function levers(B, money, inputs, season) {
    var g = GOAL_W[inputs.goal] || GOAL_W.conversion, tw = TRAFFIC_W[inputs.traffic] || {}, reach = REACH[inputs.traffic] || 0.35;
    return LEVERS.map(function (l) {
      var br = B[l[0]]; if (!br || br.score == null) return null;
      var share = l[0] === "discover" ? reach : 1;
      var inr10 = money.rev != null ? money.rev * share * 0.1 : null;
      var room = 100 - br.score;
      var sw = season && season.festive ? ({ aov: 1.2, land: 1.1 })[l[0]] || 1 : 1;
      var conf = ({ discover: 1, land: 1, convert: 1, trust: 0.9, aov: 0.6, retain: 0.65 })[l[0]];
      var pr = (inr10 != null ? inr10 : 1) * (room / 100 + 0.12) * (g[l[0]] || 1) * (tw[l[0]] || 1) * sw * conf;
      return { id: l[0], name: l[1], what: l[2], score: br.score, room: room, inr10: inr10, share: share, pr: pr };
    }).filter(Boolean).sort(function (a, b) { return b.pr - a.pr; }).map(function (l, i) { l.rank = i + 1; return l; });
  }

  /* ---------------- ad-to-page match (only when the visitor gave an ad headline) ---------------- */
  var STOP = { like: 1, real: 1, thing: 1, things: 1, just: 1, more: 1, only: 1, very: 1, really: 1, make: 1, made: 1, off: 1, sale: 1, the: 1, a: 1, an: 1, and: 1, or: 1, for: 1, to: 1, of: 1, in: 1, on: 1, with: 1, your: 1, you: 1, our: 1, is: 1, are: 1, now: 1, get: 1, shop: 1, buy: 1, new: 1, best: 1, at: 1, by: 1, from: 1, this: 1, that: 1, it: 1 };
  function words(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9₹% ]+/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
  function adMatchOf(ad, R, text) {
    if (!ad) return null;
    var P = R.page || {}, first = [text.h1, P.heroHeadline, P.title].filter(Boolean).join(" "), aw = words(ad);
    if (!aw.length) return null;
    var fw = words(first), all = text.main.toLowerCase();
    var inFirst = aw.filter(function (w) { return fw.indexOf(w) >= 0; }), inPage = aw.filter(function (w) { return all.indexOf(w) >= 0; });
    var s = inFirst.length / aw.length, sp = inPage.length / aw.length;
    var g = s >= 0.5 ? "yes" : s >= 0.25 || sp >= 0.6 ? "partly" : "no";
    var miss = aw.filter(function (w) { return inFirst.indexOf(w) < 0; }).slice(0, 4);
    return { g: g, ev: "Ad: “" + clip(ad, 90) + "”. First headline: “" + clip(text.h1 || P.heroHeadline || P.title || "", 90) + "”." + (miss.length && g !== "yes" ? " Missing up top: " + miss.join(", ") + "." : "") };
  }

  /* category: the visitor's answer, else the scan's guess, with a second opinion from the product's own words
     (page keywords can mislead, e.g. "teak" read as tea) */
  function catOf(R, ctx) {
    var P = R.page || {}, I = R.inputs || {}, t = (ctx && ctx.text) || { main: "", h1: "" }, prod = (ctx && ctx.trust && ctx.trust.product) || {};
    var cat = I.category || P.category || "Other"; if (!LIB.cats[cat]) cat = "Other";
    if (P.lead) return { cat: "Other", src: "lead" };
    if (I.category && I.catYou) return { cat: cat, src: "you" };
    var strong = [prod.title, prod.type, (prod.tags || []).join(" "), t.h1, P.title].join(" "), weak = String(t.main || "").slice(0, 1000);
    var best = null, bestN = 0, cur = 0, curS = 0, bestS = 0;
    Object.keys(LIB.subs).forEach(function (c) {
      var ns = 0, nw = 0; LIB.subs[c].forEach(function (x) { var re = new RegExp(x[1], "gi"); ns += (strong.match(re) || []).length; nw += (weak.match(re) || []).length; });
      var n = 4 * ns + nw;
      if (c === cat) { cur = n; curS = ns; } if (n > bestN) { bestN = n; best = c; bestS = ns; }
    });
    if (best && best !== cat && ((bestN >= 4 && cur * 2 < bestN) || (bestS >= 2 && curS === 0))) return { cat: best, src: "words" };
    return { cat: cat, src: "detected" };
  }

  /* ---------------- build ---------------- */
  function build(R, ctx) {
    ctx = ctx || {}; ctx.text = ctx.text || { all: "", main: "", h1: "" };
    var P = R.page || {}, I = R.inputs || {};
    var tr = ctx.trust || {}, prod = tr.product || {};
    var co = catOf(R, ctx), cat = co.cat, catSrc = co.src;
    var sub = subOf(cat, [P.title, ctx.text.h1, prod.title, prod.type, (prod.tags || []).join(" "), (P.h1 || []).join(" ")].join(" ") + " " + ctx.text.main.slice(0, 3000));
    var mk = marketOf(R), season = seasonOf(mk);
    ctx.season = season;
    ctx.adMatch = adMatchOf(I.ad, R, ctx.text); ctx.traffic = I.traffic || "";
    var lead = !!P.lead;
    ctx.sub = sub;
    var qs = gradeLib(R, ctx, cat);
    var pq = gradeProduct(ctx.insight, ctx);
    var money = moneyOf(R, cat);
    if (lead && !(+I.aov)) { money.aov = null; money.rev = null; }
    var B = {};
    B.discover = discover(R, ctx);
    B.land = land(R, ctx);
    var all = pq.concat(qs).filter(function (q) { return q.g !== "confirm"; });
    var wsum = all.reduce(function (s, q) { return s + q.w; }, 0), qscore = wsum ? Math.round(100 * all.reduce(function (s, q) { return s + q.w * GSCORE[q.g]; }, 0) / wsum) : null;
    var croS = R.cro && R.cro.score != null ? R.cro.score : null;
    B.convert = { score: qscore == null ? croS : croS == null ? qscore : Math.round(0.5 * qscore + 0.5 * croS), items: [], note: (qscore != null ? "Buyer questions answered: " + qscore + "/100" : "") + (croS != null ? (qscore != null ? ". " : "") + "Page layout benchmark: " + croS + "/100" : "") + "." };
    pq.concat(qs).filter(function (q) { return q.g === "no" || q.g === "partly"; }).sort(function (a, b) { return (b.w * (b.g === "no" ? 2 : 1)) - (a.w * (a.g === "no" ? 2 : 1)); }).slice(0, 5).forEach(function (q) {
      B.convert.items.push(item("q_" + q.id, q.q, q.g === "no" ? "bad" : "warn", q.ev[0] || "", q.fix, q.tag, q.p === "must" ? 3 : 2));
    });
    B.trust = trust(R, ctx, qs);
    if (!lead) { B.aov = orderValue(R, ctx, money, cat); B.retain = retain(R, ctx, cat); }
    var L = levers(B, money, I, season);
    // biggest problem in one line
    var SOFT = { B06: 1, B17: 1, B18: 1, B19: 1, B21: 1, B25: 1, B66: 1, B68: 1, B65: 1 };
    var topQ = pq.concat(qs).filter(function (q) { return q.g === "no" && q.p === "must" && !SOFT[q.id]; }).sort(function (a, b) { return (b.w + (b.checks && b.checks.some(function (c) { return c.st === "fail"; }) ? 1.5 : 0) + (b.src === "product" ? 1 : 0)) - (a.w + (a.checks && a.checks.some(function (c) { return c.st === "fail"; }) ? 1.5 : 0) + (a.src === "product" ? 1 : 0)); })[0];
    var one = ctx.insight && ctx.insight.one_liner ? { text: ctx.insight.one_liner, src: "ai" } : topQ ? { text: "Shoppers asking “" + topQ.q + "” don't find an answer on this page.", src: "script" } : L[0] ? { text: "Your biggest room to grow is " + L[0].name.toLowerCase() + ": " + L[0].what.toLowerCase() + ".", src: "script" } : null;
    // three things this week
    var week = [], used = {};
    function pushW(it, br) { if (!it || used[it.t] || week.length >= 3) return; used[it.t] = 1; week.push({ title: it.fix || it.t, why: it.t + (it.ev ? (/[?.!]$/.test(it.t) ? " " : ": ") + clip(it.ev.replace(/“|”/g, "\""), 140) : ""), branch: br, tag: it.tag }); }
    if (topQ) pushW({ t: topQ.q, ev: topQ.ev[0], fix: topQ.src === "product" ? "Answer \u201c" + topQ.q + "\u201d on the page, near the price" : topQ.fix, tag: topQ.tag }, "convert");
    L.forEach(function (l) { var its = (B[l.id].items || []).filter(function (i) { return (i.st === "bad" || i.st === "warn") && i.fix; }).sort(function (a, b) { return b.sev - a.sev; }); pushW(its[0], l.id); });
    L.forEach(function (l) { (B[l.id].items || []).filter(function (i) { return i.st === "bad" && i.fix; }).forEach(function (i) { pushW(i, l.id); }); });
    // confirm with the brand
    var confirm = [];
    qs.filter(function (q) { return q.g === "confirm"; }).forEach(function (q) { confirm.push({ t: q.q, why: q.note }); });
    Object.keys(B).forEach(function (k) { (B[k].items || []).filter(function (i) { return i.st === "confirm"; }).forEach(function (i) { confirm.push({ t: i.t, why: i.ev + (i.fix ? " " + i.fix : "") }); }); });
    // peers
    var you = { host: R.host, perf: R.psi && R.psi.scores ? R.psi.scores.performance : null, lcp: R.psi && R.psi.metrics && R.psi.metrics.lcp != null ? R.psi.metrics.lcp : null, seo: R.psi && R.psi.scores ? R.psi.scores.seo : null, a11y: R.psi && R.psi.scores ? R.psi.scores.accessibility : null, ai: R.ai ? R.ai.readiness : null, rating: P.rating && P.rating.value ? P.rating : null, tools: appsOf(R, ctx).all };
    var peers = ((ctx.peers && ctx.peers.peers) || []).filter(function (p) { return p && !p.error && !p.pending; }).map(function (p) {
      return { host: p.host, perf: p.psi ? p.psi.perf : null, lcp: p.psi ? p.psi.lcp : null, seo: p.psi ? p.psi.seo : null, a11y: p.psi ? p.psi.a11y : null, ai: p.ai, rating: p.rating && p.rating.value ? p.rating : null, tools: (p.tools || []).map(function (t) { return String(t).split("|")[0]; }), toolCats: (p.tools || []).map(function (t) { return String(t).split("|")[1]; }), at: p.at };
    });
    // Troopod services that fit the top levers
    var svc = [], sv = {};
    function addS(n, why) { if (!sv[n]) { sv[n] = 1; svc.push({ n: n, why: why }); } }
    L.slice(0, 3).forEach(function (l) {
      if (l.id === "discover") addS("TrooPerformance: SEO and AEO", "Technical SEO, schema and content so Google and AI assistants find and quote you.");
      if (l.id === "land") { addS("TrooPerformance: site speed", "Faster first screen on phones, with apps loaded after the page is usable."); if (I.traffic === "ads" || I.ad) addS("TrooLaunch", "Dedicated landing pages that match each ad."); }
      if (l.id === "convert" || l.id === "trust" || l.id === "aov") addS("TrooCRO", "Answers the buyer questions in this report on your pages, then tests fixed and personalised versions.");
    });
    var vis = qs.filter(function (q) { return q.id === "B01" && q.g !== "yes"; })[0];
    if (vis && /Jewellery|Home|Electronics|Fashion|Beauty/.test(cat)) addS("Troo3D", "An interactive 3D view of the product, so shoppers can see exactly what they'll get.");
    return {
      v: 1, at: new Date().toISOString(), cat: cat, sub: sub, catSrc: catSrc, market: mk, season: season, lead: lead,
      product: (ctx.insight && ctx.insight.product) || prod.title || P.title || "", buyer: (ctx.insight && ctx.insight.buyer) || "",
      one: one, qs: pq.concat(qs), branches: B, money: money, levers: L, week: week, confirm: confirm.slice(0, 8), you: you, peers: peers, services: svc,
      inputs: { goal: I.goal || "conversion", traffic: I.traffic || "", ad: I.ad || "" }, ai: !!(ctx.insight && ctx.insight.questions),
      reads: { crawl: !!(ctx.crawl && ctx.crawl.pages), trust: !!(tr.facts), insight: !!(ctx.insight && ctx.insight.questions), peers: peers.length, side: !!ctx.side },
    };
  }

  /* ---------------- render ---------------- */
  var G_ICON = { yes: "✓", partly: "!", no: "✕", confirm: "?" }, G_LABEL = { yes: "Answered", partly: "Partly", no: "Not answered", confirm: "Check" };
  var TAG_LABEL = { seen: "Seen", estimate: "Estimate", confirm: "Confirm" };
  var P_LABEL = { must: "Must solve", should: "Should solve", basic: "Basics" };
  function tag(t) { return '<span class="tg-tag ' + esc(t) + '">' + esc(TAG_LABEL[t] || t) + "</span>"; }
  function moneyFmt(n, cur) { if (n == null) return "n/a"; var s = sym(cur); if (s === "₹") { if (n >= 1e7) return s + (n / 1e7).toFixed(n >= 1e8 ? 0 : 1) + " Cr"; if (n >= 1e5) return s + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1) + " L"; return s + Math.round(n).toLocaleString("en-IN"); } return s + Math.round(n).toLocaleString("en-US"); }
  function colorOf(v) { return v == null ? "var(--dim)" : v >= 80 ? "var(--green)" : v >= 55 ? "var(--amber)" : "var(--red)"; }
  function head(eyebrow, title, sub) { return '<div class="rp-sec-head"><span class="eyebrow">' + esc(eyebrow) + '</span><h2 class="h2">' + title + "</h2>" + (sub ? '<p class="an-sub">' + sub + "</p>" : "") + "</div>"; }

  function rSnapshot(G, R) {
    var chips = [["Category", G.cat + (G.sub ? " › " + G.sub : ""), G.catSrc === "you" ? "seen" : "confirm"], ["Market", G.market === "US" ? "United States" : G.market === "IN" ? "India" : "International", "estimate"], ["Season", G.season.name, "estimate"]];
    if (G.money.aov) chips.push([G.money.src.aov === "page" && R.page && R.page.pageType === "PDP" ? "Price on this page" : "Typical order", moneyFmt(G.money.aov, G.money.cur), G.money.src.aov === "page" || G.money.src.aov === "you" ? "seen" : "estimate"]);
    var h = '<div class="tg-snap">' + chips.map(function (c) { return '<div class="tg-chip"><span class="k">' + esc(c[0]) + '</span><span class="v">' + esc(c[1]) + "</span>" + tag(c[2]) + "</div>"; }).join("") + "</div>";
    if (G.one) h += '<div class="tg-one"><span class="an-label">The biggest problem, in one line</span><p>' + esc(G.one.text) + "</p>" + tag(G.one.src === "ai" ? "estimate" : "seen") + "</div>";
    h += '<p class="tg-season">' + esc(G.season.note) + "</p>";
    return '<section class="rp-sec" id="rp-snapshot">' + head("Snapshot", "What we found on " + esc(R.host ? String(R.host).replace(/^www\./, "") : "your site"), "Every line is tagged: <b>Seen</b> on your pages, <b>Estimate</b> from your answers or benchmarks, <b>Confirm</b> needs a check by your team.") + h + "</section>";
  }
  function rQuestion(q) {
    return '<details class="tg-q ' + q.g + '"><summary><span class="tg-g ' + q.g + '" aria-label="' + esc(G_LABEL[q.g]) + '">' + G_ICON[q.g] + '</span><span class="tg-qt">' + esc(q.q) + '</span><span class="tg-gl">' + esc(G_LABEL[q.g]) + "</span></summary>" +
      '<div class="tg-qb">' + (q.why ? '<p class="tg-why">' + esc(q.why) + "</p>" : "") + (q.ev || []).map(function (e) { return "<p>" + esc(e) + "</p>"; }).join("") + (q.note ? "<p>" + esc(q.note) + "</p>" : "") +
      (q.g !== "yes" && q.fix ? '<p class="tg-fix"><b>Fix:</b> ' + esc(q.fix) + "</p>" : "") + '<div class="tg-qtags">' + tag(q.tag) + (q.src === "product" ? '<span class="tg-tag estimate">Question written for this product</span>' : "") + "</div></div></details>";
  }
  function rQuestions(G) {
    var pq = G.qs.filter(function (q) { return q.src === "product"; }), lq = G.qs.filter(function (q) { return q.src !== "product"; });
    var count = function (a, g) { return a.filter(function (q) { return q.g === g; }).length; };
    var h = '<div class="tg-qsum"><span class="yes">' + count(G.qs, "yes") + " answered</span><span class=\"partly\">" + count(G.qs, "partly") + " partly</span><span class=\"no\">" + count(G.qs, "no") + " not answered</span>" + (count(G.qs, "confirm") ? '<span class="confirm">' + count(G.qs, "confirm") + " to check</span>" : "") + "</div>";
    if (pq.length) h += '<div class="tg-qgroup"><h3 class="an-h3">About this product' + (G.product ? ": " + esc(clip(G.product, 60)) : "") + "</h3>" + pq.map(rQuestion).join("") + "</div>";
    ["must", "should", "basic"].forEach(function (p) {
      var a = lq.filter(function (q) { return q.p === p; }).sort(function (x, y) { return ({ no: 0, partly: 1, confirm: 2, yes: 3 })[x.g] - ({ no: 0, partly: 1, confirm: 2, yes: 3 })[y.g] || y.w - x.w; });
      if (!a.length) return;
      h += '<div class="tg-qgroup"><h3 class="an-h3">' + P_LABEL[p] + ' <span class="tg-cnt">' + a.filter(function (q) { return q.g === "yes"; }).length + " of " + a.length + " answered</span></h3>" + (p === "basic" ? "<details class=\"tg-more\"><summary>Show " + a.length + " basics</summary>" + a.map(rQuestion).join("") + "</details>" : a.map(rQuestion).join("")) + "</div>";
    });
    return '<section class="rp-sec" id="rp-questions">' + head("Buyer questions", "What " + esc(G.cat === "Other" ? "shoppers" : G.cat.toLowerCase() + " shoppers") + " ask before they pay", "The doubts " + (G.sub ? esc(G.sub.toLowerCase()) + " " : "") + "buyers have, from the Troopod barrier library" + (G.ai ? " plus questions written for this exact product" : "") + ", checked against what your page actually says. Must-solve doubts stop the sale.") + h + "</section>";
  }
  var BR_NAME = { discover: "Discover", land: "Land", convert: "Convert", trust: "Trust", aov: "Order value", retain: "Retain" };
  var BR_Q = { discover: "Can Google and AI assistants find you?", land: "Does the page load fast and match the ad?", convert: "Does the page answer buyers' doubts?", trust: "Does anything make shoppers doubt you?", aov: "Does the page invite a bigger basket?", retain: "Will first-time buyers come back?" };
  function rItem(i) {
    var cls = i.st === "ok" ? "ok" : i.st === "confirm" ? "confirm" : i.st === "bad" ? "bad" : "warn";
    return '<li class="tg-it ' + cls + '"><span class="tg-dot"></span><div><b>' + esc(i.t) + "</b>" + (i.ev ? "<p>" + esc(i.ev) + "</p>" : "") + (i.fix && i.st !== "ok" ? '<p class="tg-fix"><b>Fix:</b> ' + esc(i.fix) + "</p>" : "") + "</div>" + tag(i.tag) + "</li>";
  }
  function leverCards(G) {
    return '<div class="tg-levers">' + G.levers.map(function (l) {
      var br = G.branches[l.id], bad = (br.items || []).filter(function (i) { return i.st === "bad" || i.st === "warn" || i.st === "confirm"; }), ok = (br.items || []).filter(function (i) { return i.st === "ok"; });
      return '<article class="tg-lever" id="tg-' + l.id + '"><header><span class="tg-rank">' + l.rank + '</span><div><h3 class="an-h3">' + esc(l.name) + '</h3><p class="an-sub">' + esc(BR_Q[l.id]) + '</p></div><div class="tg-score" style="--c:' + colorOf(l.score) + '"><b>' + l.score + "</b><span>/100</span></div></header>" +
        '<div class="tg-bar"><i style="width:' + l.score + "%;background:" + colorOf(l.score) + '"></i></div>' +
        '<p class="tg-lv"><span class="tg-room ' + (l.room >= 40 ? "hi" : l.room >= 20 ? "md" : "lo") + '">' + (l.room >= 40 ? "Lots of room to grow" : l.room >= 20 ? "Some room to grow" : "Little room left") + "</span>" + (l.share < 1 && l.inr10 != null ? "<span>10% more search visitors is worth</span><b data-l10=\"" + l.share + "\">" + moneyFmt(l.inr10, G.money.cur) + "</b><span>a month (search is about " + Math.round(l.share * 100) + "% of traffic" + (G.inputs.traffic ? ", from your answer" : "") + ")</span>" + tag("estimate") : "") + "</p>" +
        (br.note ? '<p class="tg-note">' + esc(br.note) + "</p>" : "") +
        (bad.length ? '<ul class="tg-items">' + bad.slice(0, 5).map(rItem).join("") + "</ul>" : '<p class="tg-note">Nothing urgent here.</p>') +
        (ok.length ? '<details class="tg-more"><summary>' + ok.length + " already in place</summary><ul class=\"tg-items\">" + ok.map(rItem).join("") + "</ul></details>" : "") + "</article>";
    }).join("") + "</div>";
  }
  function rLevers(G) {
    var M = G.money, h = "";
    if (G.lead) return '<section class="rp-sec" id="rp-levers">' + head("Growth levers", "Where to focus, ranked for your goal", "A sign-up site, so we rank by room to grow rather than revenue.") + leverCards(G) + "</section>";
    h += '<div class="tg-money" data-tg-money data-cur="' + esc(M.cur) + '"><div class="tg-calc"><label><span>Monthly visitors</span><input type="number" min="0" step="1000" value="' + esc(M.visitors) + '" data-m-v>' + tag(M.src.visitors === "you" ? "seen" : "estimate") + '</label><label><span>Conversion rate %</span><input type="number" min="0" step="0.1" value="' + esc(M.cvr) + '" data-m-c>' + tag(M.src.cvr === "you" ? "seen" : "estimate") + '</label><label><span>Typical order (' + esc(sym(M.cur).trim()) + ')</span><input type="number" min="0" step="50" value="' + esc(M.aov || "") + '" data-m-a>' + tag(M.src.aov === "page" || M.src.aov === "you" ? "seen" : "estimate") + "</label></div>" +
      '<p class="tg-rev">About <b data-m-rev>' + moneyFmt(M.rev, M.cur) + "</b> a month from this page's traffic. Each 10% lift below is worth about <b data-m-10>" + moneyFmt(M.rev != null ? M.rev * 0.1 : null, M.cur) + "</b> a month.</p>" +
      '<p class="an-note">' + (M.src.cvr === "benchmark" && M.bench ? "Conversion is the TrooCRO benchmark for " + esc(M.bench.category) + " stores at this order value. " : "") + "We don't promise a 10% lift: it's a way to compare where effort pays most. Change the numbers to yours.</p></div>";
    h += leverCards(G);
    return '<section class="rp-sec" id="rp-levers">' + head("Growth levers", "Where the money is, ranked for your goal", "Revenue = visitors × conversion × order value × repeat orders. Each lever below moves one of these. Ranked by how much room you have" + (G.inputs.goal ? ", your goal" : "") + (G.inputs.traffic ? ", where your traffic comes from" : "") + " and the season (" + esc(G.season.name) + ").") + h + "</section>";
  }
  function fmtS(ms) { return ms == null ? "n/a" : (ms / 1000).toFixed(1) + "s"; }
  function rPeers(G) {
    if (!G.peers.length) return "";
    var cols = [G.you].concat(G.peers);
    var rows = [
      ["Mobile speed (Google)", function (x) { return x.perf; }, function (v) { return v == null ? "n/a" : v + "/100"; }, 1],
      ["Main image shows at", function (x) { return x.lcp; }, fmtS, -1],
      ["SEO (Google)", function (x) { return x.seo; }, function (v) { return v == null ? "n/a" : v + "/100"; }, 1],
      ["Accessibility", function (x) { return x.a11y; }, function (v) { return v == null ? "n/a" : v + "/100"; }, 1],
      ["Search and AI readiness", function (x) { return x.ai; }, function (v) { return v == null ? "n/a" : v + "/100"; }, 1],
      ["Rating in page data", function (x) { return x.rating ? x.rating.value : null; }, function (v) { return v == null ? "None" : v + "★"; }, 1],
    ];
    var h = '<div class="tg-peers"><table><thead><tr><th></th>' + cols.map(function (c, i) { return "<th" + (i === 0 ? ' class="you"' : "") + ">" + esc(String(c.host || "").replace(/^www\./, "")) + (i === 0 ? " <span>(you)</span>" : "") + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var vals = cols.map(r[1]), others = vals.slice(1).filter(function (v) { return v != null; });
      var best = others.length ? (r[3] > 0 ? Math.max.apply(null, others) : Math.min.apply(null, others)) : null;
      var behind = vals[0] != null && best != null && (r[3] > 0 ? vals[0] < best - 5 : vals[0] > best * 1.2);
      h += "<tr><td>" + esc(r[0]) + "</td>" + vals.map(function (v, i) { return "<td" + (i === 0 ? ' class="you' + (behind ? " behind" : "") + '"' : "") + ">" + esc(r[2](v)) + "</td>"; }).join("") + "</tr>";
    });
    h += "</tbody></table></div>";
    var at = G.peers[0] && G.peers[0].at ? new Date(G.peers[0].at) : null;
    return '<section class="rp-sec" id="rp-peers">' + head("You vs category leaders", "How you compare with " + G.peers.map(function (p) { return esc(p.host); }).join(" and "), "Two leading " + esc(G.cat.toLowerCase()) + " stores" + (G.market === "US" ? " in the US" : " in India") + ", measured the same way (homepage, Google PageSpeed on mobile)" + (at ? ", refreshed " + at.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "") + ". Red means you're clearly behind.") + h + "</section>";
  }
  function rWeek(G) {
    if (!G.week.length) return "";
    return '<section class="rp-sec" id="rp-week">' + head("Start here", "Three things to do this week", "The highest-value fixes across all levers, in order.") + '<ol class="tg-week">' + G.week.map(function (w, i) { return '<li><span class="n">' + (i + 1) + '</span><div><b>' + esc(w.title) + "</b><p>" + esc(w.why) + '</p><span class="tg-br">' + esc(BR_NAME[w.branch] || "") + "</span>" + tag(w.tag || "seen") + "</div></li>"; }).join("") + "</ol></section>";
  }
  function rConfirm(G) {
    if (!G.confirm.length) return "";
    return '<section class="rp-sec" id="rp-confirm">' + head("Confirm with your team", "Things we can't check from outside", "We only read public pages. These need someone with access to the store, the checkout or the ads.") + '<ul class="tg-confirm">' + G.confirm.map(function (c) { return "<li><b>" + esc(c.t) + "</b><p>" + esc(c.why || "") + "</p></li>"; }).join("") + "</ul></section>";
  }
  function rServices(G) {
    if (!G.services.length) return "";
    return '<div class="tg-svc"><span class="an-label">How Troopod can help with your top levers</span><div class="tg-svc-grid">' + G.services.map(function (s) { return '<div class="tg-svc-card"><b>' + esc(s.n) + "</b><p>" + esc(s.why) + "</p></div>"; }).join("") + "</div></div>";
  }
  function render(G, R) {
    if (!G) return { html: "", nav: [] };
    var html = rSnapshot(G, R) + rWeek(G) + rQuestions(G) + rLevers(G) + rPeers(G) + rConfirm(G);
    var nav = [["rp-snapshot", "Snapshot", ""]];
    if (G.week.length) nav.push(["rp-week", "Start here", G.week.length]);
    nav.push(["rp-questions", "Buyer questions", G.qs.filter(function (q) { return q.g === "no"; }).length], ["rp-levers", "Growth levers", G.levers.length]);
    if (G.peers.length) nav.push(["rp-peers", "Vs category leaders", G.peers.length]);
    if (G.confirm.length) nav.push(["rp-confirm", "Confirm with your team", G.confirm.length]);
    return { html: html, nav: nav, services: rServices(G) };
  }
  function wire(root, G) {
    var box = root.querySelector("[data-tg-money]"); if (!box || !G) return;
    var cur = box.getAttribute("data-cur");
    function upd() {
      var v = +box.querySelector("[data-m-v]").value || 0, c = +box.querySelector("[data-m-c]").value || 0, a = +box.querySelector("[data-m-a]").value || 0;
      var rev = a ? v * c / 100 * a : null;
      box.querySelector("[data-m-rev]").textContent = moneyFmt(rev, cur);
      box.querySelector("[data-m-10]").textContent = moneyFmt(rev != null ? rev * 0.1 : null, cur);
      Array.prototype.forEach.call(root.querySelectorAll("[data-l10]"), function (el) { el.textContent = moneyFmt(rev != null ? rev * 0.1 * +el.getAttribute("data-l10") : null, cur); });
    }
    Array.prototype.forEach.call(box.querySelectorAll("input"), function (i) { i.addEventListener("input", upd); });
  }
  function markdown(G) {
    if (!G) return "";
    var md = "\n## TrooGrowth\n\n" + (G.one ? "**Biggest problem:** " + G.one.text + "\n\n" : "") + "Category: " + G.cat + (G.sub ? " > " + G.sub : "") + ". Season: " + G.season.name + ".\n\n### Three things this week\n" + G.week.map(function (w, i) { return (i + 1) + ". " + w.title + " (" + (BR_NAME[w.branch] || "") + ")"; }).join("\n") + "\n\n### Buyer questions\n";
    G.qs.forEach(function (q) { md += "- [" + G_LABEL[q.g] + "] " + q.q + (q.g !== "yes" && q.fix ? " Fix: " + q.fix : "") + "\n"; });
    md += "\n### Growth levers\n"; G.levers.forEach(function (l) { md += l.rank + ". " + l.name + ": " + l.score + "/100, 10% better is worth " + moneyFmt(l.inr10, G.money.cur) + "/month\n"; });
    return md;
  }

  win.TrooGrowth = { catOf: catOf, pageText: pageText, build: build, render: render, wire: wire, markdown: markdown, appsOf: appsOf, marketOf: marketOf, subOf: subOf };
})();
