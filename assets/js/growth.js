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
    return { all: all.slice(0, 120000), main: out.join(" ").slice(0, 80000), h1: h1t };
  }

  /* Add what the live read saw (the page run with its own scripts) to the script-free text.
     A page that was an empty shell without scripts is read from the live copy instead. */
  function mergeLive(t, L) {
    t = t || { all: "", main: "", h1: "" };
    if (!L || !L.ok || !(L.main || L.all)) { t.live = { ok: false, why: (L && L.why) || "none" }; return t; }
    var lines = [], seen = {};
    String(L.main || L.all).split(/\n+/).forEach(function (x) {
      x = x.replace(/\s+/g, " ").trim(); if (x.length < 2) return;
      var k = x.toLowerCase().slice(0, 80); if (seen[k]) return; seen[k] = 1;
      lines.push(/[.!?:]$/.test(x) ? x : x + ".");
    });
    var sm = String(t.main || ""), low = sm.toLowerCase(), extra = lines.filter(function (x) { return low.indexOf(x.toLowerCase().slice(0, 50).replace(/\.$/, "")) < 0; }).join(" ");
    var mode = sm.length < 600 ? "replaced" : extra.length ? "added" : "same";
    if (mode === "replaced") { t.main = lines.join(" ").slice(0, 60000); t.all = String(L.all || "").replace(/\s+/g, " ").slice(0, 120000) || t.main; }
    else if (extra) { t.main = (sm + " " + extra).slice(0, 90000); t.all = (String(t.all || "") + " " + extra).slice(0, 140000); }
    if (!t.h1 && L.h1) t.h1 = L.h1;
    t.live = { ok: true, mode: mode, extra: extra.slice(0, 6000), added: extra.length, rv: L.rv || null, apps: L.apps || [], ms: L.total || L.ms || 0, first: L.first || null };
    return t;
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
  var GSCORE = { yes: 1, partly: 0.3, no: 0 };
  /* v11.3 pillars. Each library question goes to a pillar by its root cause; a few are moved where the research puts them
     (total cost, delivery and payment sit with price: Baymard's top abandonment reasons). */
  var RC_GRP = { "Clarity failure": "clarity", "Desire deficit": "clarity", "Trust deficit": "trust", "Offer weakness": "price", "Urgency deficit": "price", "Friction / UX": "flow", "Intent / Message mismatch": "flow", "Discovery / Navigation": "flow" };
  var ID_GRP = { B69: "price", B09: "price", B10: "price", B50: "trust", B19: "clarity", B21: "clarity", B25: "clarity", B58: "clarity", B17: "clarity", B15: "clarity" };
  function grpOf(b) { return ID_GRP[b.id] || RC_GRP[b.rc] || "clarity"; }
  /* weight floors from the research: delivery is the #2 abandonment reason, reviews lift purchase likelihood the most,
     and payment options (COD, UPI) matter more in India. Floors only raise a weight, never lower it. */
  function wFloor(id, mk) { return ({ B09: 7, B13: 8 })[id] || (id === "B10" && mk === "IN" ? 6 : 0); }
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
      var q = { id: b.id, q: b.q, p: b.p, w: Math.max(b.w, wFloor(b.id, ctx.mk)), fix: b.good, ev: [], src: "lib", tag: "seen", grp: grpOf(b) };
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
      return { id: "P" + (i + 1), q: x.q, p: "must", w: 8, g: g, why: x.why, src: "product", tag: "seen", grp: "clarity",
        ev: x.answer ? ["The page says: “" + clip(x.answer, 140) + "”"] : hits.length ? ["The page mentions " + hits.slice(0, 3).join(", ") + " but doesn't answer it directly."] : ["Not answered on the page."],
        fix: x.answer ? "" : "Answer it near the price in one short line, in the shopper's words." };
    });
  }


  /* ---------------- v13 buyer questions: one list per kind of product, graded by the AI grader (troogrowth-grade) ---------------- */
  var Q13 = LIB.q13 || null;
  /* which list a page uses: the category's variant whose keywords match the product, else the category default */
  function qList(cat, s, more) {
    if (!Q13) return null;
    var V = Q13.variant[cat] || Q13.variant.Other, key = V.d, found = false;
    [s, more || ""].forEach(function (x) { for (var i = 0; !found && x && i < V.v.length; i++) { if (new RegExp(V.v[i][1], "i").test(x)) { key = V.v[i][0]; found = true; } } });
    var adds = (Q13.adds[key] || []).map(function (a) { return { n: a.n, rx: a.rx, qs: a.qs }; });
    var hit = adds.filter(function (a) { return new RegExp(a.rx, "i").test(s); });
    return { key: key, qs: Q13.lists[key], adds: hit.length ? hit : adds, rules: Q13.uRules.concat(Q13.rules[key] || []) };
  }
  var G13 = { A: "yes", P: "partly", N: "no" };
  function gradeQ13(R, ctx, cat) {
    var P = R.page || {}, prod = (ctx.trust || {}).product || {};
    var L = qList(cat, [P.title, ctx.text.h1, prod.title, prod.type].join(" "), String(ctx.text.main || "").slice(0, 4000)); if (!L) return null;
    var gr = ctx.grade && ctx.grade.grades && Q13.lists[ctx.grade.list] ? ctx.grade : null;
    if (gr && gr.list !== L.key) L = { key: gr.list, qs: Q13.lists[gr.list] };
    var T = (ctx.text.main || ctx.text.all || "") + " " + (ctx.side || "");
    var pick = gr && gr.sub ? (Q13.adds[L.key] || []).filter(function (a) { return a.n === gr.sub; })[0] : null;
    var rows = L.qs.concat(pick ? pick.qs : []), out = [];
    rows.forEach(function (b) {
      var q = { id: b.id, q: b.q, w: b.w, p: b.w >= 8 ? "must" : "should", fix: b.good, ev: [], src: "lib", tag: "seen", grp: Q13.tgrp[b.t] || "clarity", u: b.u || "", t: b.t, v13: true };
      var x = gr && gr.grades[b.id];
      if (x) {
        if (x.g === "NA") return;
        q.g = G13[x.g];
        if (x.quote) q.ev.push("The page says: “" + clip(x.quote, 150) + "”");
        q.fix = x.miss ? cap(x.miss.replace(/\.?$/, ".")) : "Show: " + b.good.charAt(0).toLowerCase() + b.good.slice(1) + ".";
        if (q.g === "no" && !q.ev.length) q.ev.push("Not answered on the page.");
      } else {
        if (b.c || gr) return; // conditional ones need the grader; a question the grader skipped is left out
        var hit = findQ(T, Q13.topic[b.t]);
        q.g = hit ? "partly" : "no"; q.tag = "estimate";
        q.ev.push(hit ? evq("related text", hit) + " Checked by keywords only." : "No related text found. Checked by keywords only.");
      }
      out.push(q);
    });
    (gr && gr.extra || []).forEach(function (x) {
      out.push({ id: x.id, q: x.q, w: x.w, p: x.w >= 8 ? "must" : "should", g: G13[x.g], fix: x.miss ? cap(x.miss) : "", ev: x.quote ? ["The page says: “" + clip(x.quote, 150) + "”"] : ["Not answered on the page."], src: "product", tag: "seen", grp: "clarity", v13: true });
    });
    out.list = L.key; out.sub = pick ? pick.n : ""; out.ai = !!gr;
    return out;
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

  /* Discover: can Google and AI assistants find and understand this page? Read from the page itself
     (plus robots.txt, llms.txt and the sitemap, which decide whether this page gets read at all). */
  var DFIX = {
    ai_search_allowed: "Allow AI search bots (ChatGPT, Perplexity, Claude) in robots.txt. Training bots can stay blocked.",
    llms_txt: "Add an llms.txt with your categories, best sellers and policies.",
    sitemap: "Publish a sitemap and submit it in Google Search Console.",
    jsonld: "Add JSON-LD structured data for the product, brand and breadcrumbs.",
    org_schema: "Add Organization schema with your logo and social profiles.",
    product_schema: "Add Product schema with price, availability, brand and rating.",
    meta_description: "Write a 140 to 155 character description with the main benefit and offer.",
    title: "Keep the title under 60 characters, product first, brand last.",
    single_h1: "Use one H1 that names the product.",
    canonical: "Add a canonical tag pointing to this page's main address.",
    og: "Add og:title and og:image so links look right on WhatsApp and social.",
    ssr_text: "Render the main content in the HTML; most AI bots don't run JavaScript.",
  };
  function discover(R, ctx) {
    var ai = R.ai || {}, P = R.page || {}, items = [], psi = R.psi || {};
    (ai.checks || []).forEach(function (x) {
      var sev = x.weight >= 3 ? 3 : x.weight >= 2 ? 2 : 1;
      items.push(item("d_" + x.key, x.label, x.pass ? "ok" : sev >= 3 ? "bad" : "warn", x.detail || "", x.pass ? "" : (DFIX[x.key] || ""), "seen", sev));
    });
    var types = ai.ldTypes || [];
    if ((P.pageType === "PDP" || P.pageType === "HOME") && types.indexOf("FAQPage") < 0) items.push(item("d_faq", "No FAQ schema for AI answers to quote", "warn", "AI assistants quote pages that answer questions in a clear format.", "Add 4 to 6 real buyer questions with FAQ schema.", "seen", 2));
    var im = P.images || {};
    if (im.total > 5 && im.missingAlt / im.total > 0.25) items.push(item("d_alt", "Images without descriptions", "warn", im.missingAlt + " of " + im.total + " images have no alt text.", "Describe every product image in its alt text.", "seen", 1));
    var base = ai.readiness != null ? ai.readiness : scoreItems(items), seo = psi.scores && psi.scores.seo;
    var extra = items.filter(function (i) { return /^d_(faq|alt)$/.test(i.k); }).reduce(function (s, i) { return s + (i.sev >= 2 ? 6 : 3); }, 0);
    base = Math.max(0, base - extra);
    return { score: seo != null ? Math.round(0.7 * base + 0.3 * seo) : base, items: items, note: "This page only: title, description, schema, headings, and whether Google and AI assistants can read it." + (seo != null ? " Google's SEO score for this page: " + seo + "/100." : "") };
  }

  /* Speed on phone: Core Web Vitals against Google's thresholds (half) and the Lighthouse mobile score (half).
     Google's real-user data, when it says slow, caps the score at 50. Desktop isn't counted: shoppers are on phones. */
  function band(v, good, poor) { if (v == null || !isFinite(v)) return null; if (v <= good) return 100; if (v <= poor) return Math.round(100 - 50 * (v - good) / (poor - good)); return Math.max(0, Math.round(50 - 50 * (v - poor) / poor)); }
  function speed(R, ctx) {
    var p = R.psi, items = [];
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
    var mob = p.scores.performance, desk = d && d.scores ? d.scores.performance : null;
    var cwv = avg([band(lcp, 2.5, 4), band(m.tbt, 200, 600), band(m.cls, 0.1, 0.25)]);
    var score = cwv == null ? mob : Math.round(0.5 * mob + 0.5 * cwv);
    var slow = p.field && p.field.overall === "SLOW";
    var capped = slow && score > 50;
    if (slow) score = Math.min(score, 50);
    return { score: score, items: items, perf: mob, cwv: cwv == null ? null : Math.round(cwv), capped: capped, slow: !!slow,
      bands: { lcp: band(lcp, 2.5, 4), tbt: band(m.tbt, 200, 600), cls: band(m.cls, 0.1, 0.25) },
      vit: { lcp: lcp, tbt: m.tbt != null ? Math.round(m.tbt) : null, cls: m.cls, kb: m.weightKb || null, field: p.field ? p.field.overall : null },
      note: "On a mid-range phone: Google PageSpeed " + mob + "/100, Core Web Vitals " + (cwv == null ? "n/a" : Math.round(cwv) + "/100") + " (main image " + (lcp != null ? lcp.toFixed(1) + "s" : "n/a") + ", blocked " + (m.tbt != null ? Math.round(m.tbt) + "ms" : "n/a") + ", layout shift " + (m.cls != null ? m.cls.toFixed(2) : "n/a") + ")." + (slow ? " Google's real-user data says slow, so this is capped at 50." : "") + (desk != null ? " Desktop " + desk + "/100, shown only." : "") };
  }

  /* ---------------- the plan: what each fix is worth ----------------
     A small copy of the score model that the report re-runs in the browser: tick fixes, get the new CRO, Speed and
     Overall. Same maths as build(): an answered question lifts its pillar, a removed contradiction lifts trust, and a
     speed fix moves that Core Web Vital into Google's good range and adds Lighthouse's weight for it to PageSpeed. */
  var PW = { clarity: 30, trust: 25, price: 20, flow: 10, speed: 15 }, CRO_K = ["clarity", "trust", "price", "flow"];
  var LH_W = { lcp: 0.25, tbt: 0.30, cls: 0.25 };
  var INTEGK = { contra: 1, contra_exc: 1, contra_ai: 1, fake_urgency: 1, numbers: 1, returns_scope: 1 };
  function penOf(i) { return i.st === "bad" ? (i.sev >= 3 ? 16 : 10) : i.st === "warn" ? (i.sev >= 2 ? 7 : 4) : 0; }
  function speedOf(sp, fx) {
    if (!sp || sp.est) return sp ? sp.estScore : null;
    if (sp.perf == null) return null;
    var perf = sp.perf, bands = [];
    ["lcp", "tbt", "cls"].forEach(function (k) { var b = sp.b[k]; if (fx[k] && b != null) { perf += LH_W[k] * (100 - b); b = 100; } bands.push(b); });
    perf = Math.min(100, perf);
    var cwv = avg(bands), sc = cwv == null ? Math.round(perf) : Math.round(0.5 * perf + 0.5 * cwv);
    if (sp.slow && !(fx.lcp || fx.tbt)) sc = Math.min(sc, 50);
    return sc;
  }
  function project(Mo, ids) {
    if (Mo.v4) return project4(Mo, ids);
    var on = {}; (ids || []).forEach(function (id) { on[id] = 1; });
    var S = {}, pen = Mo.pen, cod = Mo.cod, a11y = Mo.a11y, fx = {};
    CRO_K.forEach(function (k) { S[k] = Mo.q[k] ? Mo.q[k].S : 0; });
    Mo.fixes.forEach(function (f) {
      if (!on[f.id]) return; var e = f.e;
      if (e.t === "q") S[e.p] += e.d; else if (e.t === "integ") pen -= e.pen; else if (e.t === "cod") cod = 0;
      else if (e.t === "a11y") a11y = Math.max(a11y || 0, 95); else if (LH_W[e.t]) fx[e.t] = 1;
    });
    function qv(k) { var q = Mo.q[k]; return q && q.W ? Math.round(100 * S[k] / q.W) : null; }
    var P = {};
    P.clarity = qv("clarity");
    var tq = qv("trust"), integ = Mo.integ ? clamp(Math.round(100 - pen), 0, 100) : null;
    P.trust = tq == null ? integ : integ == null ? tq : Math.round(0.7 * tq + 0.3 * integ);
    var pq = qv("price"); P.price = pq == null ? null : Math.max(0, pq - cod);
    var fq = qv("flow"), fp = [[Mo.croS, 0.5], [fq, 0.35], [a11y, 0.15]].filter(function (x) { return x[0] != null; }), fw = fp.reduce(function (t, x) { return t + x[1]; }, 0);
    P.flow = fw ? Math.round(fp.reduce(function (t, x) { return t + x[0] * x[1]; }, 0) / fw) : null;
    P.speed = speedOf(Mo.sp, fx);
    function gx(keys) { var tw = 0, tl = 0; keys.forEach(function (k) { if (P[k] != null) { tw += PW[k]; tl += PW[k] * Math.log(Math.max(5, P[k])); } }); return tw ? { x: Math.exp(tl / tw), w: tw } : null; }
    var c = gx(CRO_K), sp = gx(["speed"]), a = gx(CRO_K.concat(["speed"]));
    var cro = c ? Math.round(c.x) : null, spd = sp ? Math.round(sp.x) : null;
    var overall = !a ? null : c && sp ? Math.round(Math.exp((c.w * Math.log(Math.max(5, cro)) + sp.w * Math.log(Math.max(5, spd))) / a.w)) : Math.round(a.x);
    return { P: P, cro: cro, speed: spd, overall: overall, x: a ? a.x : null };
  }
  /* where on the page each problem sits (regions measured on the 390px render) */
  var REG = { B01: "img", B02: "details", B04: "title", B05: "price", B06: "cta", B08: "cta", B09: "cta", B10: "cta", B13: "reviews", B15: "details", B16: "footer", B18: "cta", B19: "cta",
    B20: "price", B22: "details", B27: "details", B32: "details", B36: "details", B38: "details", B39: "title", B40: "details", B46: "title", B48: "img", B49: "img", B50: "cta", B52: "price",
    B53: "img", B55: "cta", B57: "title", B58: "details", B59: "title", B62: "details", B64: "details", B65: "title", B66: "price", B67: "nav", B68: "img", B69: "price", B70: "cta", B71: "cta", B72: "cta" };
  var IREG = { contra: "cta", contra_exc: "cta", contra_ai: "content", fake_urgency: "cta", numbers: "price", returns_scope: "cta", cod: "price", a11y: "cta", lcp: "img", tbt: "nav", cls: "img", apps: "nav", est: "nav" };

  /* Trust: does anything on the page undercut itself? */
  function trust(R, ctx, qs) {
    var t = ctx.trust || {}, items = [], ins = ctx.insight || {}, f = t.facts || {}, apps = appsOf(R, ctx);
    (t.contradictions || []).forEach(function (c) {
      if (/returns?|exchange|refund/i.test(c.issue) && c.b && FREE_REPL.test(c.b.quote || "")) return; // a free replacement with no fee is a clear returns promise, not a conflict
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
    var INTEG = { contra: 1, contra_exc: 1, contra_ai: 1, fake_urgency: 1, numbers: 1, returns_scope: 1 };
    var score = ctx.trust ? scoreItems(items.filter(function (i) { return i.st !== "confirm" && INTEG[i.k]; })) : null;
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
    ["clarity", "Clarity & fit", "Shoppers understand the product and that it suits them"],
    ["trust", "Trust & risk", "Shoppers feel safe buying from you"],
    ["price", "Price, delivery & payment", "Shoppers see the full price, delivery date and how to pay"],
    ["speed", "Speed on phone", "The page loads fast on a phone"],
    ["flow", "Focus & flow", "Nothing distracts from buying, and the page matches the ad"],
    ["discover", "Search & AI", "More people find you on Google and in AI answers"],
    ["aov", "Basket size", "Bigger baskets"],
    ["retain", "Repeat orders", "First-time buyers come back"],
  ];
  var GOAL_W = { conversion: { clarity: 1.3, trust: 1.2, price: 1.15, speed: 1.1 }, aov: { aov: 1.5, price: 1.1, clarity: 1.05 }, ads: { speed: 1.35, flow: 1.25, clarity: 1.15 }, speed: { speed: 1.5 }, ai: { discover: 1.6 }, repeat: { retain: 1.5, trust: 1.1 } };
  var TRAFFIC_W = { ads: { speed: 1.25, flow: 1.2 }, search: { discover: 1.25 }, social: { speed: 1.15, trust: 1.15, clarity: 1.1 }, mix: {} };
  function levers(B, money, inputs, season) {
    var g = GOAL_W[inputs.goal] || GOAL_W.conversion, tw = TRAFFIC_W[inputs.traffic] || {}, reach = REACH[inputs.traffic] || 0.35;
    return LEVERS.map(function (l) {
      var br = B[l[0]]; if (!br || br.score == null) return null;
      var share = l[0] === "discover" ? reach : 1;
      var inr10 = money.rev != null ? money.rev * share * 0.1 : null;
      var room = 100 - br.score;
      var sw = season && season.festive ? ({ aov: 1.2, speed: 1.1, price: 1.05 })[l[0]] || 1 : 1;
      var conf = ({ clarity: 1, trust: 0.9, price: 0.9, speed: 1, flow: 0.8, discover: 1, aov: 0.6, retain: 0.65 })[l[0]];
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
    if (!(I.category && I.catYou) && !P.prices && !P.aov && /401\(k\)|retirement|pension|insurance|\bloans?\b|lending|mutual fund|invest(?:ing|ment)|payroll|software|platform|\bsaas\b|book a demo|request a demo|get a quote|clinic|hospital|consult/i.test([P.title, P.description, P.heroHeadline, P.primaryCta].join(" "))) return { cat: "Other", src: "nonstore" };
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

  /* ---------------- v12: house rules + shoppers ----------------
     CRO = shoppers (4 personas Groq picked for this brand walk the page and say how likely they are to buy)
         + house rules (8 hard facts a script can check). Speed as before. Overall = CRO^0.85 x Speed^0.15. */
  var W4 = { shop: 0.3, proof: 0.5, rules: 0.2 };
  /* The mix is a weighted geometric mean (each part floored at 5), so a page with almost nothing to prove can't hide
     behind tidy basics. It is then placed on a benchmark scale anchored on 20 PDPs: bad pages (BSC, House of Men,
     Picklico, Baublelove) land around 15-30, mid ones (Bombae, Dermabay, Fableroom) 40-60, good brands' pages 65-80,
     the best 85-90.
     Monotonic, so the order never changes; only the scale does. */
  var CAL4 = [[0, 0], [25, 15], [35, 30], [46, 48], [50, 66], [60, 80], [72, 90], [100, 100]];
  function cal4(x) { if (x == null) return null; for (var i = 1; i < CAL4.length; i++) { var a = CAL4[i - 1], b = CAL4[i]; if (x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return 100; }
  var RULE_DEF = {
    price: { t: "One clear price", bad: "The price or discount is confusing", region: "price", fix: "Show one price, the MRP it's cut from and one discount. Move the other offers below the button." },
    agree: { t: "Page and policies agree", bad: "The page contradicts itself", region: "cta", fix: "Make every promise (discount, warranty, returns, delivery) say the same thing everywhere." },
    first: { t: "First screen does the job", bad: "The first screen misses the basics", region: "title", fix: "Fit the photo, name, price and Add to cart into the first phone screen." },
    reviews: { t: "Reviews shoppers can trust", bad: "Reviews are thin or hard to trust", region: "reviews", fix: "Show the rating and count under the name, and real reviews of this product, including a few critical ones." },
    delivery: { t: "Delivery time near the button", bad: "No delivery time near the button", region: "cta", fix: "Show a delivery date (pincode check) right under Add to cart." },
    returns: { t: "Returns are clear", bad: "Returns aren't clear", region: "cta", fix: "Say the return or exchange window in one line under Add to cart, with any exceptions." },
    stock: { t: "Options in stock", bad: "Popular options are sold out", region: "cta", fix: "Restock the sold-out options, or offer a back-in-stock alert and the closest alternative." },
    pressure: { t: "No fake pressure", bad: "Pressure that looks fake", region: "price", fix: "Use real end dates and real stock. Drop always-on countdowns and inflated MRPs." }
  };
  var RULE_ORDER = ["price", "agree", "first", "reviews", "delivery", "returns", "stock", "pressure"];
  var OFFX = /(code|coupon|extra|above|over ₹|orders?\b|prepaid|upi|bank|cart value|purchase of|or more|buy \d|up ?to|upto|\bmin\b|minimum|first order|\bapp\b|sitewide|member|stone|making|on \d|items)/i;
  var FISHY = /(no critical|no negative|no bad|only (?:5|five)|different product|other products?|not about|free product|sent me|exchange for|in exchange|gifted|same review|duplicate|repeated|another language|other language|french|german|store visitor|not verified|unverified)/i;
  function rules4(R, ctx, qs, TR) {
    var P = R.page || {}, tr = ctx.trust || {}, sh = ctx.shop || null, f = (R.cro && R.cro.f) || null, out = {};
    function set(id, st, ev) { out[id] = { id: id, t: RULE_DEF[id].t, bad: RULE_DEF[id].bad, st: st, v: st === "pass" ? 1 : st === "partly" ? 0.5 : st === "fail" ? 0 : null, ev: ev || "", fix: RULE_DEF[id].fix, region: RULE_DEF[id].region }; }
    var Q = {}; qs.forEach(function (q) { Q[q.id] = q; });
    var RANK = { yes: 3, partly: 2, no: 1 }, best = function (t) { return qs.filter(function (q) { return q.v13 && q.t === t; }).sort(function (a, b) { return (RANK[b.g] || 0) - (RANK[a.g] || 0); })[0]; };
    if (qs.length && qs[0].v13) { Q.B09 = best("delivery"); Q.B08 = best("returns"); }
    var main = ctx.text.main || "", h1 = (ctx.text.h1 || "").slice(0, 40), i0 = h1 ? main.indexOf(h1) : -1, top = main.slice(Math.max(0, i0), Math.max(0, i0) + 1500);
    /* 1. one clear price */
    var pc = {}, offers = 0, m, re = /(\d{1,2})\s?%\s?off/gi;
    while ((m = re.exec(top))) { var cx = top.slice(Math.max(0, m.index - 45), m.index + 45); if (OFFX.test(cx)) offers++; else pc[+m[1]] = 1; }
    offers += (top.match(/free (?:[a-z]+ ){0,3}(?:gift|minis?|pouch|sample)|cashback|use code/gi) || []).length;
    var nb = (tr.numbers || []).filter(function (n) { return n.sev >= 2 && !(n.quote && OFFX.test(n.quote)); }), dp = Object.keys(pc).map(Number).sort(function (a, b) { return b - a; });
    if (nb.length) set("price", "fail", nb[0].issue);
    else if (dp.length >= 2 && dp[0] - dp[dp.length - 1] <= 15) set("price", "fail", "The price area shows " + dp.map(function (x) { return x + "% off"; }).join(" and ") + ". Shoppers can't tell which is real.");
    else if (!P.prices && !(tr.product && tr.product.price) && !(sh && sh.stock && sh.stock.price)) set("price", "fail", "We couldn't find a price on the page.");
    else if (offers >= 3) set("price", "partly", offers + " offers are stacked around the price, so the final price takes working out.");
    else set("price", "pass", "One price and one discount.");
    /* 2. page and policies agree */
    var priceFailed = out.price && out.price.st === "fail";
    var hard = TR.items.filter(function (i) { return (i.k === "contra" || i.k === "contra_ai") && i.st !== "confirm" && !(priceFailed && /discount|% ?off|price/i.test(i.t + " " + i.ev)); }), soft = TR.items.filter(function (i) { return i.k === "contra_exc"; });
    if (hard.length) set("agree", "fail", hard[0].t.replace(/[.\s]+$/, "") + (hard.length > 1 ? " (+" + (hard.length - 1) + " more)" : "") + ". " + hard[0].ev);
    else if (soft.length) set("agree", "partly", soft[0].t.replace(/[.\s]+$/, "") + ". " + soft[0].ev);
    else set("agree", tr.facts || sh ? "pass" : "na", tr.facts || sh ? "No conflicts between the page and its policies." : "We couldn't read the policies.");
    /* 3. first screen */
    if (!f) set("first", "na", "We couldn't draw the page on a phone.");
    else {
      var photoKnown = !(f.gallery === 0 && !f.hero_ratio), parts = [["price", f.price_atf >= 0.5], ["Add to cart", f.cta_atf >= 0.5 || !!f.sticky_cta]];
      if (photoKnown) parts.unshift(["a product photo", f.hero_ratio >= 0.3 || f.gallery >= 3]);
      var miss = parts.filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
      set("first", !miss.length ? "pass" : miss.length === 1 ? "partly" : "fail", !miss.length ? "Photo, price and Add to cart show without scrolling." : "On a phone, " + miss.join(" and ") + " " + (miss.length === 1 ? "isn't" : "aren't") + " on the first screen.");
    }
    /* 4. reviews */
    var rt = P.rating && P.rating.value ? P.rating : tr.reviews && tr.reviews.schema && tr.reviews.schema.value ? tr.reviews.schema : null;
    var lvr = ctx.text.live && ctx.text.live.ok && ctx.text.live.rv;
    if (!rt && lvr && lvr.count >= 1 && lvr.rating) rt = { value: lvr.rating, count: lvr.count };
    if (!rt) { var mr = top.match(/\b([1-5](?:\.\d{1,2})?)\s*(?:\/\s*5|out of 5|★|stars?)?\s*[|(·]?\s*(?:from |based on )?([\d,]{1,7})\s*(?:\+\s*)?(?:verified )?(?:reviews|ratings)\b/i); if (mr && +mr[1] >= 1 && +mr[1] <= 5) rt = { value: +mr[1], count: +mr[2].replace(/,/g, "") }; }
    var rv = sh && sh.reviews, cnt = rt ? +(rt.count || 0) : 0;
    var apps = appsOf(R, ctx).reviews, known = sh && sh.brand_known === "household";
    var strong = rv && rv.read >= 3 ? (rv.fishy || []).filter(function (x) { return FISHY.test(x); }) : [];
    if (!rt) {
      if (rv && rv.read >= 3) set("reviews", "partly", rv.read + " reviews are on the page but there's no overall rating near the name.");
      else if (known) set("reviews", "na", "A household-name brand. Shoppers don't need reviews to trust it.");
      else if (apps.length && !(lvr && lvr.zero)) set("reviews", "na", "Couldn't load: " + apps.join(", ") + " draws the reviews with JavaScript and they didn't load for our reader, so this rule is left out of the score.");
      else set("reviews", "fail", "No rating or reviews on the page.");
    } else {
      var st = cnt >= 30 ? "pass" : cnt >= 5 || !cnt ? "partly" : "fail", ev = rt.value + "★" + (cnt ? " from " + cnt + " reviews" : "") + ".";
      var hs = lvr && lvr.hist, perfect = hs && cnt >= 50 && hs[3] + hs[4] === 0 && hs[2] <= cnt * 0.02;
      if (rv && rv.read >= 3 && (rv.about === false || strong.length)) { st = st === "pass" ? "partly" : "fail"; ev += " " + (rv.about === false ? "The reviews shown are about other products, not this one." : cap(strong[0]) + "."); }
      else if (perfect) { st = st === "pass" ? "partly" : st; ev += " None of them is below 3 stars, which reads as filtered: shoppers trust a few honest bad reviews more than none."; }
      else if (cnt && cnt < 5) ev += " Too few to trust.";
      set("reviews", st, ev);
    }
    /* 5. delivery time */
    var q9 = Q.B09, fa = tr.facts || {};
    if (f && f.delivery_near) set("delivery", "pass", "Delivery information sits next to the button.");
    else if (q9 && q9.g === "yes") set("delivery", "pass", (q9.ev[0] || "Delivery time is on the page."));
    else if ((q9 && q9.g === "partly") || fa.deliveryDays) set("delivery", "partly", q9 && q9.g === "partly" && q9.ev[0] ? q9.ev[0] : "Delivery time is only in the shipping policy.");
    else set("delivery", "fail", "We couldn't find a delivery time on the page.");
    /* 6. returns */
    var q8 = Q.B08 || Q.B50, cl = tr.claims || {}, restr = fa.noReturns || fa.exchangeOnly || fa.damagedOnly;
    var stated = cl.returnDays || cl.easyReturns || (q8 && q8.g === "yes");
    if (restr && FREE_REPL.test(restr.quote || "") && !fa.noReturns) set("returns", "pass", "Free replacement, no return fee: \u201c" + clip(restr.quote, 110) + "\u201d");
    else if (stated && !restr) set("returns", "pass", cl.returnDays ? "The page states " + cl.returnDays.days + "-day returns." : "Returns are stated on the page.");
    else if (stated || restr || (q8 && q8.g === "partly") || (fa.returnDays || []).length) set("returns", "partly", restr ? "Returns are limited: “" + clip((restr.quote || ""), 110) + "”" : "Returns are mentioned but not stated plainly near the button.");
    else set("returns", "fail", "We couldn't find a returns or exchange promise.");
    /* 7. stock */
    var sk = sh && sh.stock;
    if (!sk) set("stock", "na", "We couldn't read stock for this store.");
    else if (!sk.available) set("stock", "fail", "The product is sold out.");
    else if (sk.soldOut && sk.soldOut.length) set("stock", sk.avail / Math.max(1, sk.variants) < 0.5 ? "fail" : "partly", "Sold out: " + (sk.option ? sk.option + " " : "") + sk.soldOut.join(", ") + ".");
    else set("stock", "pass", sk.variants > 1 ? "All " + sk.variants + " options can be bought." : "In stock.");
    /* 8. no fake pressure */
    var fake = TR.items.filter(function (i) { return i.k === "fake_urgency"; }), timer = TR.items.filter(function (i) { return i.k === "timer_app" || i.k === "timer_text"; });
    var px = sk && sk.price && sk.compareAt && sk.compareAt > sk.price ? Math.round(100 * (1 - sk.price / sk.compareAt)) : (tr.product && tr.product.compareAt && tr.product.price && tr.product.compareAt > tr.product.price ? Math.round(100 * (1 - tr.product.price / tr.product.compareAt)) : 0);
    if (fake.length) set("pressure", "fail", fake[0].ev || fake[0].t);
    else if (px >= 70) set("pressure", "partly", px + "% off the MRP every day reads as an inflated MRP." + (timer.length ? " Plus a countdown." : ""));
    else if (timer.filter(function (x) { return x.k === "timer_text"; }).length) { var tt = timer.filter(function (x) { return x.k === "timer_text"; })[0]; set("pressure", "partly", tt.t + ": " + (tt.ev || "") + " Make sure it's real."); }
    else set("pressure", "pass", "No countdowns or made-up stock numbers.");
    return RULE_ORDER.map(function (k) { return out[k]; });
  }
  /* Reviews (v12.5): part of the customer voice, not of proof. Count, verified buyers and rating build it; reviews that look
     unreliable, or a widget with no reviews below 3 stars at all, pull it down. "Couldn't load" leaves it out. */
  var REV_W = 0.3;
  function reviews4(R, ctx, sh) {
    var P = R.page || {}, tr = ctx.trust || {}, main = String(ctx.text.main || ""), t = main + " " + String((tr.product && tr.product.desc) || ""), it = [], pts = 0;
    var lv = ctx.text.live || null, lvr = lv && lv.ok ? lv.rv : null;
    var rt = P.rating && P.rating.value ? P.rating : tr.reviews && tr.reviews.schema && tr.reviews.schema.value ? tr.reviews.schema : null, cnt = rt ? +(rt.count || 0) : 0, rating = rt ? +rt.value || 0 : 0;
    if (!cnt && lvr && lvr.count >= 1) { cnt = lvr.count; rating = rating || lvr.rating || 0; }
    if (!cnt) { var mr = t.match(/\b([\d,]{2,7})\s*(?:\+\s*)?(?:verified )?(?:reviews|ratings)\b/i); if (mr) cnt = +mr[1].replace(/,/g, ""); }
    if (!cnt) { var h1 = (ctx.text.h1 || "").slice(0, 30), i0 = h1 ? main.indexOf(h1) : -1, mp = (i0 >= 0 ? main.slice(i0, i0 + 600) : main.slice(0, 1500)).match(/\((\d{2,6})\)/); if (mp) cnt = +mp[1]; }
    if (!cnt && sh && sh.reviews && sh.reviews.read >= 5) cnt = sh.reviews.read;
    if (!rating && lvr && lvr.rating) rating = lvr.rating;
    var known = sh && sh.brand_known, tier = sh && sh.price_tier, carry = known === "household" || (known === "well-known" && (tier === "premium" || tier === "luxury"));
    var rApps = appsOf(R, ctx).reviews.concat((lv && lv.apps) || []).filter(function (x, i, A) { return A.indexOf(x) === i; });
    var noLoad = !cnt && rApps.length && !(lvr && lvr.zero) && !(sh && sh.reviews && sh.reviews.read >= 3);
    if (noLoad) return { score: null, noLoad: rApps, items: [{ k: "volume", unk: true, label: "Reviews: couldn't load" }] };
    if (!cnt && carry) return { score: null, carry: true, items: [] };
    function add(k, ok, n, label) { it.push({ k: k, ok: !!ok, label: label }); if (ok) pts += n; }
    add("volume", cnt >= 5, cnt >= 500 ? 60 : cnt >= 100 ? 50 : cnt >= 30 ? 35 : 15, cnt ? cnt.toLocaleString("en-IN") + " reviews" : "No reviews");
    if (cnt) {
      add("verified", /verified (?:buyer|purchase|customer|review)|certified buyer|customer photos|reviews? with (?:images|photos)|photos? (?:&|and) videos/i.test(t), 25, "Verified buyers or customer photos");
      if (rating) add("rating", rating >= 4, rating >= 4 ? 15 : 5, rating.toFixed(1).replace(/\.0$/, "") + "★ average");
    }
    var rv = sh && sh.reviews, fishy = rv && rv.read >= 3 && (rv.about === false || (rv.fishy || []).some(function (x) { return FISHY.test(x); }));
    if (fishy) { pts -= 30; it.push({ k: "fishy", ok: false, bad: true, label: rv.about === false ? "Reviews are about other products" : "Reviews look unreliable" }); }
    var hist = lvr && lvr.hist, perfect = hist && cnt >= 50 && hist[3] + hist[4] === 0 && hist[2] <= cnt * 0.02;
    if (perfect) { pts -= 30; it.push({ k: "perfect", ok: false, bad: true, label: "None of " + cnt.toLocaleString("en-IN") + " reviews below 3★" }); }
    return { score: clamp(Math.round(pts), 0, 100), cnt: cnt, rating: rating, hist: hist || null, perfect: !!perfect, fishy: !!fishy, items: it };
  }
  /* Proof on the page: what a careful shopper can check besides reviews (tests, certificates, awards, other platforms;
     specs and materials; results with numbers). Brand equity counts as proof for household names and well-known premium brands. */
  var FREE_REPL = /replace(?:ment)?[^.]{0,90}(?:free of charge|no (?:return |extra )?(?:fee|charge|cost)|at no (?:extra )?cost|\bfree\b)|free (?:of charge )?replacement/i;
  var NOCERT = { furniture: 1, decor: 1, fashion: 1, fashionjewel: 1 };
  var CRAFT_RX = /\d+[- ](?:year|month)s? warranty|warranty|hand[- ]?(?:made|woven|crafted|knotted|carved|tufted|block[- ]printed|embroidered)|artisans?|kiln[- ]dried|solid (?:wood|sheesham|teak|mango)|customer photos|experience (?:centre|center|store)|our stores?|showroom|since (?:19|20)\d\d|\d+\+? years? of (?:craft|experience)|anti[- ]tarnish warranty|stain[- ]resistant|termite[- ](?:proof|resistant)/gi;
  var PROOF_FIX = { furniture: "Show what proves the build: close-ups of the wood and joints, the warranty in years, room photos from buyers, and your stores or press.", decor: "Show what proves the quality: close-ups of the finish, the maker or craft behind it, buyer photos at home and any press.", fashion: "Show what proves the quality: fabric close-ups, fit notes from reviews, buyer photos and ratings from Myntra or Ajio.", fashionjewel: "Show what proves the quality: plating details, an anti-tarnish warranty, buyer photos after weeks of wear." };
  var PROOF_RX = /clinical(?:ly)?|\b(?:scientific|independent|published|research)\s+stud(?:y|ies)\b|\bstud(?:y|ies)\s+(?:show|shows|showed|found|proves?|confirm(?:s|ed)?)\b|volunteers|participants|dermatologist[- ](?:tested|approved)|lab[- ]tested|third[- ]party|certified|certificate|hallmark|\bbis\b|\bigi\b|\bgia\b|\bisi\b|fssai|\biso\b|\bgmp\b|ayush|patent|award|as seen (?:in|on)|featured in|bee \d|\d[- ]star (?:rated|energy)|organic certified|india organic|usda|great taste|peta|vegan society|oeko|gots/gi;
  var INFO_RX = /how to (?:use|brew|wear|apply|install)|directions|ingredients?|specifications?|dimensions|material|fabric|cotton|polyester|linen|\bgsm\b|\bfit\b|model (?:is )?wear|size chart|wash|in the box|what.s inside|care (?:guide|instructions)|battery|playback|playtime|bluetooth|warranty|ipx\d|water[- ]resistant|compatib|\brpm\b|\bwatts?\b|bldc|motor|remote|purity|carat|karat|\d{2}kt|silver|brass|plating|gold weight|net (?:weight|quantity|wt)|shelf life|nutrition|calories|protein|servings?|cups? per|origin|sourced|preservative|arabica|thickness|layers?|foam|firmness|trial|weight/gi;
  function proof4(R, ctx, sh, rules, RV) {
    var P = R.page || {}, tr = ctx.trust || {}, main = String(ctx.text.main || ""), t = main + " " + String((tr.product && tr.product.desc) || ""), it = [], pts = 0;
    function add(k, ok, n, label) { it.push({ k: k, ok: !!ok, label: label }); if (ok) pts += n; }
    /* someone else vouches: tests, certificates, awards, other platforms */
    var kinds = {}; (t.match(PROOF_RX) || []).forEach(function (m) { kinds[m.toLowerCase().slice(0, 6)] = 1; });
    var plat = /(?:nykaa|amazon|flipkart|myntra|google)[^.]{0,40}(?:\d\.\d|rating)/i.test(t); if (plat) kinds.platfm = 1;
    /* v13: furniture, decor, fashion and fashion jewellery don't come with certificates; their proof is craft, warranty and real use */
    var noCert = NOCERT[ctx.qList || ""];
    if (noCert) (t.match(CRAFT_RX) || []).forEach(function (m) { kinds["c_" + m.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6)] = 1; });
    var nk = Object.keys(kinds).length;
    add("tested", nk, nk >= 2 ? 25 : 12, noCert ? "Craft, warranty, stores, press or other platforms" : "Tests, certificates, awards or other platforms");
    /* specifics a shopper can hold you to */
    var info = {}; (t.match(INFO_RX) || []).forEach(function (m) { info[m.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6)] = 1; });
    var ni = Object.keys(info).length;
    add("info", ni >= 1, ni >= 6 ? 15 : ni >= 3 ? 10 : 3, "Specs, materials, ingredients or how-to as text");
    /* results with numbers */
    /* a large, natural review base is proof of scale: 500+ reviews at 4.2★ or more that don't look filtered or unreliable */
    if (RV && RV.cnt >= 500 && RV.rating >= 4.2 && !RV.perfect && !RV.fishy) add("scale", true, 20, RV.cnt.toLocaleString("en-IN") + " reviews at " + (+RV.rating).toFixed(1) + "★");
    add("results", /\d{2,3}\s?% (?:of )?(?:users|people|participants|women|men|customers|volunteers)|tested on \d+|\d+ (?:volunteers|participants|subjects)|\bday 0\b|before\s*(?:&|and|\/)\s*after|(?:trusted by|loved by|over|\d+)\s*[\d.,]+\s*(?:lakh|l\+|k\+|mn|million|crore)?\s*(?:happy )?customers/i.test(t), 20, "Results or customer numbers");
    var raw = pts * 100 / 60;
    var price = (sh && sh.stock && sh.stock.price) || (tr.product && tr.product.price) || P.aov || 0;
    var minBuy = 0; (t.match(/(?:min(?:imum)?\.? (?:purchase|order)|orders? (?:above|over|worth)|purchase of)\s*(?:of\s*)?(?:rs\.?|₹|inr)?\s?([\d,]{3,6})/gi) || []).forEach(function (m) { var v = +(m.match(/([\d,]{3,6})\s*$/) || [0, "0"])[1].replace(/,/g, ""); if (v > minBuy) minBuy = v; });
    var codes = (t.match(/use code|coupon code|\bcode\s*:?\s*[A-Z0-9]{4,}\b|click to copy|tap to copy/g) || []).length;
    if (codes >= 2 || (price && minBuy >= 3 * price)) { raw -= 20; it.push({ k: "clutter", ok: false, bad: true, label: price && minBuy >= 3 * price ? "Offers for baskets far above this price" : "Coupon codes crowd the price" }); }
    raw = clamp(Math.round(raw), 0, 100);
    var known = sh && sh.brand_known, tier = sh && sh.price_tier;
    var carry = known === "household" ? 80 : known === "well-known" && (tier === "premium" || tier === "luxury") ? 75 : 0;
    var lv = ctx.text.live || null;
    return { score: Math.max(raw, carry), raw: raw, carry: carry, known: known || "", tier: tier || "", items: it, live: lv ? (lv.ok ? lv.mode : "failed") : "" };
  }
  /* Looks (v12.6): how the page looks at a glance. The first phone screen as shoppers see it (measured in the live copy:
     price and button, anything covering it, promo strips and stickers, a big product photo), plus how consistent the design is
     (fonts, colours, tiny text, emoji) on the first two screens of the phone render. */
  var LOOK_W = 0;
  function looks4(R, ctx) {
    var f = (R.cro && R.cro.f) || null, lv = ctx.text && ctx.text.live, F = lv && lv.ok ? lv.first : null, it = [], pts = 0, max = 0;
    function add(k, ok, n, label) { max += n; it.push({ k: k, ok: !!ok, label: label }); if (ok) pts += n; }
    if (F) {
      add("buy", F.price && F.cta, 20, F.price && F.cta ? "Price and Add to cart on the first screen" : !F.price && !F.cta ? "Price and Add to cart only after scrolling" : !F.price ? "Price only after scrolling" : "Add to cart only after scrolling");
      add("clear", F.cover < 0.08, 20, F.cover < 0.08 ? "Nothing covers the first screen" : "Pop-ups or floating widgets cover " + Math.round(F.cover * 100) + "% of it");
      add("calm", F.strips <= 1 && F.stickers <= 1, 15, F.strips <= 1 && F.stickers <= 1 ? "At most one promo strip and one sticker" : (F.strips > 1 ? F.strips + " promo strips" : "") + (F.strips > 1 && F.stickers > 1 ? " and " : "") + (F.stickers > 1 ? F.stickers + " offer stickers" : "") + " on the first screen");
      add("photo", F.img >= 0.3, 15, F.img >= 0.3 ? "The product photo leads the first screen" : "The product photo takes under a third of the first screen");
    }
    if (f && f.d_colors != null) {
      var fam = f.font_families != null ? f.font_families : f.d_fonts;
      add("type", fam <= 2 && f.d_colors <= 10, 15, fam <= 2 && f.d_colors <= 10 ? "One consistent type style and palette" : (fam > 2 ? fam + " font families" : "") + (fam > 2 && f.d_colors > 10 ? " and " : "") + (f.d_colors > 10 ? f.d_colors + " text colours" : "") + " in the first two screens");
      add("text", (f.small_text || 0) < 0.2 && (f.d_emoji || 0) <= 1, 15, (f.small_text || 0) < 0.2 && (f.d_emoji || 0) <= 1 ? "Readable text, no emoji clutter" : (f.small_text >= 0.2 ? Math.round(100 * f.small_text) + "% of the text is tiny" : "") + (f.small_text >= 0.2 && f.d_emoji > 1 ? ", " : "") + (f.d_emoji > 1 ? f.d_emoji + " emoji" : ""));
    }
    if (!max) return null;
    return { score: Math.round(100 * pts / max), items: it, live: !!F, first: F || null };
  }
  function shopScore(sh) {
    if (!sh || !sh.personas || !sh.personas.length) return null;
    var w = 0, s = 0; sh.personas.forEach(function (p) { w += p.fit; s += p.fit * p.buy; });
    return w ? Math.round(s / w) : null;
  }
  function project4(Mo, ids) {
    var on = {}; (ids || []).forEach(function (id) { on[id] = 1; });
    var rs = Mo.rules.filter(function (r) { return r.v != null; }), fx = {};
    var rv = rs.length ? 100 * rs.reduce(function (t, r) { return t + (on["r_" + r.id] ? 1 : r.v); }, 0) / rs.length : null;
    var sw = 0, ss = 0; Mo.shop.forEach(function (p) { sw += p.fit; ss += p.fit * (on["p_" + p.id] ? Math.max(p.buy, p.to) : p.buy); });
    var sv = sw ? ss / sw : null;
    if (Mo.q13 && Mo.q13.length) { var qw = 0, qs2 = 0; Mo.q13.forEach(function (q) { qw += q.w; qs2 += q.w * (on["q_" + q.id] ? 1 : q.v); }); sv = Mo.thin && sv != null ? (100 * qs2 / qw + sv) / 2 : 100 * qs2 / qw; }
    /* customer voice: the shoppers plus what past buyers say in reviews (30%) */
    if (Mo.rev != null) sv = sv == null ? Mo.rev : (1 - (Mo.revW || 0.3)) * sv + (Mo.revW || 0.3) * Mo.rev;
    Mo.fixes.forEach(function (f) { if (on[f.id] && LH_W[f.e.t]) fx[f.e.t] = 1; });
    var pv = Mo.proof == null ? null : Math.max(15, on.p_proof ? Math.max(Mo.proof, Mo.proofTo || Mo.proof) : Mo.proof);
    var parts = [[sv, Mo.wS], [pv, Mo.wP], [rv, Mo.wR]].filter(function (x) { return x[0] != null; }), pw = parts.reduce(function (t, x) { return t + x[1]; }, 0);
    var mix = pw ? Math.exp(parts.reduce(function (t, x) { return t + x[1] * Math.log(Math.max(5, x[0])); }, 0) / pw) : null, croX = cal4(mix), cro = croX == null ? null : Math.round(croX);
    var spd = speedOf(Mo.sp, fx);
    var x = cro == null ? null : spd == null ? cro : Math.exp(0.85 * Math.log(Math.max(5, croX)) + 0.15 * Math.log(Math.max(5, spd)));
    var overall = cro == null ? null : spd == null ? cro : Math.round(Math.exp(0.85 * Math.log(Math.max(5, cro)) + 0.15 * Math.log(Math.max(5, spd))));
    return { P: { rules: rv == null ? null : Math.round(rv), shoppers: sv == null ? null : Math.round(sv), proof: pv, speed: spd, mix: mix == null ? null : Math.round(mix) }, cro: cro, speed: spd, overall: overall, x: x };
  }
  function unreadOf(R, ctx) {
    var P = R.page || {}, t = ctx.text || {}, tr = ctx.trust || {};
    var wall = /(access denied|are you a robot|verify you are human|captcha|request (?:was )?blocked|unusual traffic|enable javascript|site can.t be reached|something went wrong|temporarily unavailable|attention required|just a moment)/i;
    var txt = String(t.main || "") + " " + String(P.title || "");
    if (wall.test(txt.slice(0, 600)) && String(t.main || "").length < 2500) return "The site blocked our reader, so we only saw a check page, not the product.";
    if (String(t.main || "").length < 600) return t.live && t.live.ok ? "We ran the page with its own scripts too, but it still showed almost no text in our reader, so it couldn't load here." : "This page builds itself with JavaScript and it couldn't load in our reader, so we only saw an empty shell.";
    return null;
  }

  /* ---------------- build ---------------- */
  function build(R, ctx) {
    ctx = ctx || {}; ctx.text = ctx.text || { all: "", main: "", h1: "" };
    var P = R.page || {}, I = R.inputs || {};
    var tr = ctx.trust || {}, prod = tr.product || {};
    var co = catOf(R, ctx), cat = co.cat, catSrc = co.src;
    var shc = ctx.shop && ctx.shop.category;
    if (shc && LIB.cats[shc] && catSrc !== "you" && !P.lead && shc !== cat) { cat = shc; catSrc = "ai"; }
    var sub = subOf(cat, [P.title, ctx.text.h1, prod.title, prod.type, (prod.tags || []).join(" "), (P.h1 || []).join(" ")].join(" ") + " " + ctx.text.main.slice(0, 3000));
    var mk = marketOf(R);
    if (ctx.shop && ctx.shop.market === "IN" && mk !== "IN") mk = "IN";
    var season = seasonOf(mk);
    ctx.mk = mk;
    ctx.season = season;
    ctx.adMatch = adMatchOf(I.ad, R, ctx.text); ctx.traffic = I.traffic || "";
    var lead = !!P.lead;
    ctx.sub = sub;
    var q13 = !lead && Q13 ? gradeQ13(R, ctx, cat) : null;
    var qs = q13 || gradeLib(R, ctx, cat);
    ctx.qList = q13 ? q13.list : "";
    var pq = q13 ? [] : gradeProduct(ctx.insight, ctx);
    var money = moneyOf(R, cat);
    if (lead && !(+I.aov)) { money.aov = null; money.rev = null; }
    var B = {}, all = pq.concat(qs);
    if (lead) all.forEach(function (q) { if (q.grp === "price") q.grp = "clarity"; });
    var graded = all.filter(function (q) { return q.g !== "confirm" && GSCORE[q.g] != null; });
    var GS = q13 ? { yes: 1, partly: 0.5, no: 0 } : GSCORE;
    function qsc(a) { var ws = a.reduce(function (s, q) { return s + q.w; }, 0); return ws ? Math.round(100 * a.reduce(function (s, q) { return s + q.w * GS[q.g]; }, 0) / ws) : null; }
    function qOf(grp) { return qsc(graded.filter(function (q) { return q.grp === grp; })); }
    function qItems(grp, n, skip) {
      skip = skip || {};
      var bad = all.filter(function (q) { return q.grp === grp && (q.g === "no" || q.g === "partly") && !skip[q.id]; }).sort(function (a, b) { return (b.w * (b.g === "no" ? 2 : 1)) - (a.w * (a.g === "no" ? 2 : 1)); }).slice(0, n)
        .map(function (q) { return item("q_" + q.id, q.q, q.g === "no" ? "bad" : "warn", q.ev[0] || "", q.fix, q.tag, q.p === "must" ? 3 : 2); });
      var ok = all.filter(function (q) { return q.grp === grp && q.g === "yes"; }).map(function (q) { return item("q_" + q.id, q.q, "ok", q.ev[0] || "", "", q.tag, 1); });
      return bad.concat(ok);
    }
    var qscore = qsc(graded);
    var croS = R.cro && R.cro.score != null ? R.cro.score : null;
    B.discover = discover(R, ctx);
    /* Clarity & fit: does the page answer what the product is, who it suits and what it does? */
    B.clarity = { score: qOf("clarity"), items: qItems("clarity", 5), note: "Buyer questions about what the product is, who it suits and what it does" + (pq.length ? ", including questions written for this product" : "") + "." };
    /* Trust & risk: proof found (70%) and whether the page contradicts itself (30%) */
    var TR = trust(R, ctx, qs), tq = qOf("trust"), codFee = TR.items.filter(function (i) { return i.k === "cod_fee"; });
    var hasI = function (k) { return TR.items.some(function (i) { return i.k === k; }); };
    B.trust = { score: tq == null ? TR.score : TR.score == null ? tq : Math.round(0.7 * tq + 0.3 * TR.score), integ: TR.score, q: tq,
      items: TR.items.filter(function (i) { return i.k !== "cod_fee"; }).concat(qItems("trust", 4, { B13: hasI("no_reviews") ? 1 : 0, B08: hasI("no_policy") ? 1 : 0 })),
      note: "Proof on the page (reviews, returns, authenticity" + (TR.score != null ? "): " + (tq == null ? "n/a" : tq + "/100") + ", 70%. Page and policies agreeing with each other: " + TR.score + "/100, 30%." : ").") + (TR.note ? " " + TR.note : "") };
    /* Price, delivery & payment: total cost, delivery date, payment options and the offer, before checkout */
    var pqs = qOf("price");
    B.price = { score: pqs == null ? null : Math.max(0, pqs - (codFee.length ? 8 : 0)), items: codFee.concat(qItems("price", 5)), note: "Whether shoppers see the full price, delivery date, payment options and offer before checkout." + (codFee.length ? " A hidden COD charge takes off 8." : "") };
    /* Speed on phone */
    B.speed = speed(R, ctx);
    /* Focus & flow: layout benchmark (50%), path-to-buy questions incl. ad match (35%), accessibility (15%) */
    var fq = qOf("flow"), a11y = R.psi && R.psi.scores ? R.psi.scores.accessibility : null, fItems = qItems("flow", 4);
    if (ctx.adMatch && ctx.adMatch.g !== "yes" && !fItems.some(function (i) { return i.k === "q_B65"; })) fItems.unshift(item("admatch", "The page doesn't match your ad", ctx.adMatch.g === "no" ? "bad" : "warn", ctx.adMatch.ev, "Repeat the ad's promise in the first headline and show the same product and offer.", "seen", 3));
    if (a11y != null && a11y < 80) fItems.push(item("a11y", "Hard to use for some shoppers", "warn", "Accessibility " + a11y + "/100 (Google Lighthouse): contrast, labels or tap targets.", "Fix contrast and add labels to icon buttons.", "seen", 1));
    var fp = [[croS, 0.5], [fq, 0.35], [a11y, 0.15]].filter(function (x) { return x[0] != null; }), fw = fp.reduce(function (s, x) { return s + x[1]; }, 0);
    B.flow = { score: fw ? Math.round(fp.reduce(function (s, x) { return s + x[0] * x[1]; }, 0) / fw) : null, items: fItems,
      note: "Page layout on a phone, benchmarked: " + (croS == null ? "n/a" : croS + "/100") + ". Path-to-buy questions: " + (fq == null ? "n/a" : fq + "/100") + ". Accessibility: " + (a11y == null ? "n/a" : a11y + "/100") + "." };
    if (!lead) { B.aov = orderValue(R, ctx, money, cat); B.retain = retain(R, ctx, cat); }
    var L = levers(B, money, I, season);
    /* The headline: a weighted geometric mean of the five pillars (each floored at 5), so one weak pillar pulls the whole
       score down instead of being averaged away (OECD/JRC guidance on composite scores). CRO = the four page pillars;
       because the mean is geometric, Overall = CRO^0.85 x Speed^0.15 exactly. Search & AI, basket and repeat are shown
       beside the score, not in it: they bring visitors or grow later orders, they don't convert this visit. */
    var PW = { clarity: 30, trust: 25, price: 20, flow: 10, speed: 15 }, CRO_K = ["clarity", "trust", "price", "flow"];
    function gmean(keys) { var tw = 0, tl = 0; keys.forEach(function (k) { var b = B[k]; if (b && b.score != null) { tw += PW[k]; tl += PW[k] * Math.log(Math.max(5, b.score)); } }); return tw ? { v: Math.round(Math.exp(tl / tw)), w: tw } : null; }
    var gAll = gmean(CRO_K.concat(["speed"])), gCro = gmean(CRO_K), gSp = gmean(["speed"]);
    /* computed from the two rounded numbers the report shows, so Overall always equals CRO^a x Speed^b on screen */
    var gscore = !gAll ? null : gCro && gSp ? Math.round(Math.exp((gCro.w * Math.log(Math.max(5, gCro.v)) + gSp.w * Math.log(Math.max(5, gSp.v))) / gAll.w)) : gAll.v;
    var parts = CRO_K.concat(["speed"]).filter(function (k) { return B[k] && B[k].score != null; }).map(function (k) { return { id: k, w: Math.round(1000 * PW[k] / gAll.w) / 10, v: B[k].score, est: !!B[k].est, grp: k === "speed" ? "speed" : "cro" }; });
    var side = ["discover", "aov", "retain"].filter(function (k) { return B[k] && B[k].score != null; }).map(function (k) { return { id: k, v: B[k].score }; });
    var mustNo = all.filter(function (q) { return q.g === "no" && q.p === "must"; }).length;
    /* the plan */
    var SEVL = { must: "Must solve", should: "Should solve", basic: "Basics" }, fixes = [];
    all.filter(function (q) { return q.g === "no" || q.g === "partly"; }).forEach(function (q) {
      fixes.push({ id: "q_" + q.id, kind: "cro", pillar: q.grp, t: q.q, ev: q.ev[0] || "", fix: q.fix || "", sev: SEVL[q.p] || "", partly: q.g === "partly", region: q.src === "product" ? "content" : (REG[q.id] || "content"), e: { t: "q", p: q.grp, d: q.w * (1 - GSCORE[q.g]) } });
    });
    var integItems = TR.items.filter(function (i) { return INTEGK[i.k] && i.st !== "confirm"; });
    integItems.filter(function (i) { return i.st === "bad" || i.st === "warn"; }).forEach(function (i, n) {
      fixes.push({ id: "i_" + i.k + "_" + n, kind: "cro", pillar: "trust", t: i.t, ev: i.ev, fix: i.fix, sev: i.sev >= 3 ? "Must solve" : "Should solve", region: IREG[i.k] || "content", e: { t: "integ", pen: penOf(i) } });
    });
    if (codFee.length) fixes.push({ id: "i_cod", kind: "cro", pillar: "price", t: codFee[0].t, ev: codFee[0].ev, fix: codFee[0].fix, sev: "Should solve", region: "price", e: { t: "cod" } });
    if (a11y != null && a11y < 80) fixes.push({ id: "i_a11y", kind: "cro", pillar: "flow", t: "Hard to use for some shoppers", ev: "Accessibility " + a11y + "/100 (Google Lighthouse): contrast, labels or tap targets.", fix: "Fix contrast and add labels to icon buttons.", sev: "Should solve", region: "cta", e: { t: "a11y" } });
    var sItems = B.speed.items || [], appsI = sItems.filter(function (i) { return i.k === "apps"; })[0], hasTbt = sItems.some(function (i) { return i.k === "tbt"; });
    sItems.forEach(function (i) {
      if (i.k === "lcp" || i.k === "tbt" || i.k === "cls") fixes.push({ id: "s_" + i.k, kind: "speed", pillar: "speed", t: i.t, ev: i.ev + (i.k === "tbt" && appsI ? " Apps slowing it: " + appsI.ev : ""), fix: i.fix, sev: i.sev >= 3 ? "Must solve" : "Should solve", region: IREG[i.k], e: { t: i.k } });
      else if (i.k === "apps" && !hasTbt) fixes.push({ id: "s_apps", kind: "speed", pillar: "speed", t: i.t, ev: i.ev, fix: i.fix, sev: "Should solve", region: "nav", e: { t: "tbt" } });
      else if (i.k === "speed_est") fixes.push({ id: "s_est", kind: "speed", pillar: "speed", t: i.t, ev: i.ev, fix: i.fix, sev: "Should solve", region: "nav", e: { t: "none" }, nogain: true });
    });
    var Mo = { q: {}, pen: integItems.reduce(function (t, i) { return t + penOf(i); }, 0), integ: TR.score != null, cod: codFee.length ? 8 : 0, a11y: a11y, croS: croS,
      sp: B.speed.est || B.speed.perf == null ? { est: true, estScore: B.speed.score } : { perf: B.speed.perf, b: B.speed.bands || {}, slow: !!B.speed.slow },
      fixes: fixes.map(function (f) { return { id: f.id, e: f.e }; }) };
    CRO_K.forEach(function (k) { var a = graded.filter(function (q) { return q.grp === k; }); Mo.q[k] = { W: a.reduce(function (t, q) { return t + q.w; }, 0), S: a.reduce(function (t, q) { return t + q.w * GSCORE[q.g]; }, 0) }; });
    var base = project(Mo, []);
    ["clarity", "trust", "price", "flow", "speed"].forEach(function (k) { if (B[k] && B[k].score !== base.P[k] && win.console) console.warn("plan model differs", k, B[k].score, base.P[k]); });
    fixes.forEach(function (f) { if (f.nogain) { f.gain = null; return; } var d = project(Mo, [f.id]).x - base.x; f.gain = d >= 0.5 ? Math.round(d) : d > 0.05 ? 0.5 : 0; });
    var byGain = function (a, b) { return (b.gain || 0) - (a.gain || 0) || (a.sev === "Must solve" ? -1 : 0) - (b.sev === "Must solve" ? -1 : 0); };
    var croF = fixes.filter(function (f) { return f.kind === "cro"; }).sort(byGain), spF = fixes.filter(function (f) { return f.kind === "speed"; }).sort(byGain);
    croF.forEach(function (f, i) { f.label = String(i + 1); }); spF.forEach(function (f, i) { f.label = "S" + (i + 1); });
    var upTo = function (a) { return a.length ? project(Mo, a.map(function (f) { return f.id; })).overall - base.overall : 0; };
    var plan = { Mo: Mo, base: { overall: base.overall, cro: base.cro, speed: base.speed }, cro: croF, speed: spF, upCro: upTo(croF), upSpeed: upTo(spF),
      defaultOn: croF.concat(spF).filter(function (f) { return f.gain > 0; }).sort(byGain).slice(0, 3).map(function (f) { return f.id; }),
      vit: B.speed.vit || null, est: !!B.speed.est };
    // biggest problem in one line
    var SOFT = { B06: 1, B17: 1, B18: 1, B19: 1, B21: 1, B25: 1, B66: 1, B68: 1, B65: 1 };
    var topQ = all.filter(function (q) { return q.g === "no" && q.p === "must" && !SOFT[q.id]; }).sort(function (a, b) { return (b.w + (b.checks && b.checks.some(function (c) { return c.st === "fail"; }) ? 1.5 : 0) + (b.src === "product" ? 1 : 0)) - (a.w + (a.checks && a.checks.some(function (c) { return c.st === "fail"; }) ? 1.5 : 0) + (a.src === "product" ? 1 : 0)); })[0];
    var one = ctx.insight && ctx.insight.one_liner ? { text: ctx.insight.one_liner, src: "ai" } : topQ ? { text: "Shoppers asking “" + topQ.q + "” don't find an answer on this page.", src: "script" } : L[0] ? { text: "Your biggest room to grow is " + L[0].name.toLowerCase() + ": " + L[0].what.toLowerCase() + ".", src: "script" } : null;
    // three things this week
    var week = [], used = {};
    function pushW(it, br) { if (!it || used[it.t] || week.length >= 3) return; used[it.t] = 1; week.push({ title: it.fix || it.t, why: it.t + (it.ev ? (/[?.!]$/.test(it.t) ? " " : ": ") + clip(it.ev.replace(/“|”/g, "\""), 140) : ""), branch: br, tag: it.tag }); }
    if (topQ) pushW({ t: topQ.q, ev: topQ.ev[0], fix: topQ.src === "product" ? "Answer \u201c" + topQ.q + "\u201d on the page, near the price" : topQ.fix, tag: topQ.tag }, topQ.grp || "clarity");
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
      if (l.id === "speed") addS("TrooPerformance: site speed", "Faster first screen on phones, with apps loaded after the page is usable.");
      if (l.id === "flow" && (I.traffic === "ads" || I.ad)) addS("TrooLaunch", "Dedicated landing pages that match each ad.");
      if (l.id === "clarity" || l.id === "trust" || l.id === "price" || l.id === "flow" || l.id === "aov") addS("TrooCRO", "Answers the buyer questions in this report on your pages, then tests fixed and personalised versions.");
    });
    var vis = qs.filter(function (q) { return q.id === "B01" && q.g !== "yes"; })[0];
    if (vis && /Jewellery|Home|Electronics|Fashion|Beauty/.test(cat)) addS("Troo3D", "An interactive 3D view of the product, so shoppers can see exactly what they'll get.");
    var res = {
      v: 1, at: new Date().toISOString(), cat: cat, sub: sub, catSrc: catSrc, market: mk, season: season, lead: lead,
      product: (ctx.insight && ctx.insight.product) || prod.title || P.title || "", buyer: (ctx.insight && ctx.insight.buyer) || "",
      score: gscore, cro: gCro ? gCro.v : null, speed: gSp ? gSp.v : null, croW: gCro && gAll ? Math.round(1000 * gCro.w / gAll.w) / 10 : null, speedW: gSp && gAll ? Math.round(1000 * gSp.w / gAll.w) / 10 : null,
      parts: parts, side: side, scoreV: 3, mustNo: mustNo, qScore: qscore, layout: croS, plan: plan,
      one: one, qs: pq.concat(qs), branches: B, money: money, levers: L, week: week, confirm: confirm.slice(0, 8), you: you, peers: peers, services: svc,
      inputs: { goal: I.goal || "conversion", traffic: I.traffic || "", ad: I.ad || "" }, ai: !!(ctx.insight && ctx.insight.questions),
      reads: { crawl: !!(ctx.crawl && ctx.crawl.pages), trust: !!(tr.facts), insight: !!(ctx.insight && ctx.insight.questions), peers: peers.length, side: !!ctx.side, shop: !!(ctx.shop && ctx.shop.personas) },
    };
    /* v12: CRO = shoppers + house rules */
    var sh = ctx.shop && ctx.shop.personas && ctx.shop.personas.length ? ctx.shop : null;
    var rules = rules4(R, ctx, qs, TR), rApp = rules.filter(function (r) { return r.v != null; });
    var rScore = rApp.length ? Math.round(100 * rApp.reduce(function (t, r) { return t + r.v; }, 0) / rApp.length) : null, sScore = shopScore(sh);
    var RV = reviews4(R, ctx, sh), PF = proof4(R, ctx, sh, rules, RV), LK = looks4(R, ctx);
    /* v13: when the AI grader answered, the customer voice is the buyer questions (70%) plus reviews (30%); the 4 shoppers stay as colour */
    var qAI = q13 && q13.ai, qG = qAI ? q13.filter(function (q) { return GS[q.g] != null; }) : [];
    var qScore = qG.length ? qsc(qG) : null;
    /* when we could read only a little of the page (specs in tabs that didn't load), unanswered can mean unread: lean on the shoppers too */
    var thin = String(ctx.text.main || "").length < 3500;
    if (qScore != null && thin && sScore != null) qScore = Math.round((qScore + sScore) / 2);
    if (qScore != null) sScore = qScore;
    var vScore = sScore == null ? RV.score : RV.score == null ? sScore : Math.round((1 - REV_W) * sScore + REV_W * RV.score);
    var missP = PF.items.filter(function (i) { return !i.ok && !i.bad && !i.unk; }).map(function (i) { return i.label.toLowerCase(); });
    var proofTo = PF.carry >= PF.raw ? PF.score : Math.min(100, PF.score + 25);
    var Mo4 = { v4: true, proof: PF.score, proofTo: proofTo, wP: W4.proof, rev: RV.score, revW: REV_W, rules: rules.map(function (r) { return { id: r.id, v: r.v }; }), q13: qG.map(function (q) { return { id: q.id, w: q.w, v: GS[q.g] }; }), thin: thin, shop: sh ? sh.personas.map(function (p) { return { id: p.id, fit: p.fit, buy: p.buy, to: p.fix && p.fix.to != null ? p.fix.to : p.buy }; }) : [], wS: W4.shop, wR: W4.rules, sp: Mo.sp, fixes: [] };
    var fx4 = [];
    rules.forEach(function (r) { if (r.st === "fail" || r.st === "partly") fx4.push({ id: "r_" + r.id, kind: "cro", pillar: "rules", t: r.bad, ev: r.ev, fix: r.fix, sev: r.st === "fail" ? "Must solve" : "Should solve", partly: r.st === "partly", region: r.region, e: { t: "rule" } }); });
    if (PF.score < 60 && missP.length) fx4.push({ id: "p_proof", kind: "cro", pillar: "proof", t: "Show proof shoppers can check", ev: "Missing: " + missP.slice(0, 4).join(", ") + ".", fix: PROOF_FIX[ctx.qList] || "Add what this product can prove: test or certificate results with numbers, before and after, specs and materials as text, ratings from Nykaa or Amazon.", sev: PF.score < 35 ? "Must solve" : "Should solve", region: "reviews", e: { t: "proof" } });
    /* v13: fixes come only from buyer questions the page leaves open, biggest first */
    qG.filter(function (q) { return q.g !== "yes"; }).sort(function (a, b) { return b.w * (1 - GS[b.g]) - a.w * (1 - GS[a.g]); }).slice(0, 8).forEach(function (q) {
      fx4.push({ id: "q_" + q.id, kind: "cro", pillar: "shoppers", t: q.q, ev: q.ev[0] || "", fix: q.fix || "", sev: q.p === "must" ? "Must solve" : "Should solve", partly: q.g === "partly", region: "content", e: { t: "q13" } });
    });
    if (!qAI) (sh ? sh.personas : []).forEach(function (p) { if (p.fix && p.fix.change && p.fix.to > p.buy) fx4.push({ id: "p_" + p.id, kind: "cro", pillar: "shoppers", t: cap(p.fix.change), ev: p.n + ": “" + (p.leave || "") + "”", fix: "", sev: p.fit >= 30 ? "Must solve" : "Should solve", region: "content", e: { t: "persona" } }); });
    var sp4 = plan.speed;
    Mo4.fixes = fx4.concat(sp4).map(function (f) { return { id: f.id, e: f.e }; });
    var b4 = project4(Mo4, []);
    fx4.concat(sp4).forEach(function (f) { if (f.nogain) { f.gain = null; return; } var d = project4(Mo4, [f.id]).x - b4.x; f.gain = d >= 0.5 ? Math.round(d) : d > 0.05 ? 0.5 : 0; });
    var byG4 = function (a, b) { return (b.gain || 0) - (a.gain || 0) || (a.sev === "Must solve" ? -1 : 0) - (b.sev === "Must solve" ? -1 : 0); };
    fx4.sort(byG4); sp4.sort(byG4);
    fx4.forEach(function (f, i) { f.label = String(i + 1); }); sp4.forEach(function (f, i) { f.label = "S" + (i + 1); });
    var up4 = function (a) { return a.length ? project4(Mo4, a.map(function (f) { return f.id; })).overall - b4.overall : 0; };
    res.plan = { Mo: Mo4, base: { overall: b4.overall, cro: b4.cro, speed: b4.speed }, cro: fx4, speed: sp4, upCro: up4(fx4), upSpeed: up4(sp4),
      defaultOn: fx4.concat(sp4).filter(function (f) { return f.gain > 0; }).sort(byG4).slice(0, 3).map(function (f) { return f.id; }), vit: plan.vit, est: plan.est };
    res.score = b4.overall; res.cro = b4.cro; res.speed = b4.speed; res.croW = 85; res.speedW = 15;
    res.top3 = res.plan.defaultOn.length ? { from: b4.overall, to: project4(Mo4, res.plan.defaultOn).overall } : null;
    var wsum = (vScore == null ? 0 : W4.shop) + W4.proof + (rScore == null ? 0 : W4.rules), wOf = function (w) { return Math.round(850 * w / wsum) / 10; };
    res.parts = [{ id: "shoppers", w: wOf(W4.shop), v: vScore, grp: "cro" }, { id: "proof", w: wOf(W4.proof), v: PF.score, grp: "cro" }, { id: "rules", w: wOf(W4.rules), v: rScore, grp: "cro" }, { id: "speed", w: 15, v: b4.speed, est: !!B.speed.est, grp: "speed" }].filter(function (p) { return p.v != null; });
    res.mix = b4.P.mix; res.scoreV = 4; res.rules = rules; res.rulesScore = rScore; res.shop = sh; res.shopScore = sScore; res.qScore = qScore; res.qList = q13 ? q13.list : ""; res.voice = vScore; res.reviews = RV; res.looks = LK; res.revW = REV_W; res.proof = PF; res.w4 = { shop: vScore == null ? 0 : W4.shop / wsum, proof: W4.proof / wsum, rules: rScore == null ? 0 : W4.rules / wsum };
    if (sh) { if (sh.one_liner) res.one = { text: sh.one_liner, src: "ai" }; if (sh.product) res.product = sh.product; if (sh.buyer) res.buyer = sh.buyer; res.brandKnown = sh.brand_known; }
    res.unread = unreadOf(R, ctx);
    if (res.unread) { res.score = null; res.cro = null; res.parts = []; }
    return res;
  }

  /* ---------------- v12 short report: shoppers, top 3 fixes, house rules ---------------- */
  function buyWord(b) { return b >= 85 ? "Buys now" : b >= 70 ? "Likely to buy" : b >= 55 ? "Leaning yes" : b >= 40 ? "On the fence" : b >= 25 ? "Leaves to compare" : "Leaves"; }
  var A_ICON = { yes: "✓", partly: "!", no: "✕" }, R_ICON = { pass: "✓", partly: "!", fail: "✕", na: "–" };
  function rCard(p) {
    var n = { yes: 0, partly: 0, no: 0 }; (p.checks || []).forEach(function (c) { n[c.a]++; });
    return '<article class="sh-card"><div class="sh-top"><div class="sh-who"><b>' + esc(p.n) + '</b><span>' + p.fit + '% of your shoppers</span></div>' +
      '<div class="sh-buy" style="color:' + colorOf(p.buy) + '"><b>' + p.buy + '</b><span>' + esc(buyWord(p.buy)) + "</span></div></div>" +
      '<p class="sh-q">“' + esc(p.leave || p.voice) + "”</p>" +
      (p.fix && p.fix.change && p.fix.to > p.buy ? '<p class="sh-fix"><span>' + p.buy + " → " + p.fix.to + " if:</span> " + esc(p.fix.change) + "</p>" : "") +
      '<details class="sh-more"><summary>What they checked <em class="y">✓ ' + n.yes + '</em><em class="p">! ' + n.partly + '</em><em class="n">✕ ' + n.no + "</em></summary><ul>" +
      (p.checks || []).map(function (c) { return '<li class="a-' + c.a + '"><i>' + A_ICON[c.a] + "</i><span>" + esc(c.q) + (c.quote ? '<em>“' + esc(clip(c.quote, 110)) + "”</em>" : "") + "</span></li>"; }).join("") + "</ul></details></article>";
  }
  function rShort(G, R, opt) {
    opt = opt || {};
    if (!G || G.scoreV !== 4) return "";
    if (G.unread) return '<section class="rp-sec sh-unread" id="rp-shoppers">' + head("We couldn't read this page", "No score for this page", esc(G.unread) + " Scoring a page we couldn't load would be wrong, so we haven't. Try the brand's own product URL, or a page that loads without a login or check screen.") + "</section>";
    var sh = G.shop, h = "", Pl = G.plan, RVW = G.reviews || null, vw = Math.round(100 * ((G.w4 && G.w4.shop) || 0.3));
    /* reviews: what past buyers say, part of the customer voice */
    var rvRow = RVW ? '<div class="cv-rev"><b>Reviews' + (RVW.score != null ? " " + RVW.score + "/100" : "") + "</b>" +
      (RVW.items.length ? '<div class="pf-row">' + RVW.items.map(function (i) { return '<span class="pf-i ' + (i.bad ? "bad" : i.ok ? "ok" : i.unk ? "unk" : "no") + '"' + (i.unk ? ' title="Loaded with JavaScript and didn\'t load for our reader"' : "") + "><i>" + (i.bad ? "✕" : i.ok ? "✓" : i.unk ? "?" : "–") + "</i>" + esc(i.label) + "</span>"; }).join("") + "</div>" : "") +
      (RVW.noLoad ? '<p class="pf-note">Reviews on this page load with JavaScript (' + esc(RVW.noLoad.join(", ")) + ") and didn't load for our reader, so they're left out of the score instead of counted as missing.</p>" : RVW.carry ? '<p class="pf-note">No reviews on the page, but shoppers already know the brand, so they\'re left out.</p>' : RVW.hist ? '<p class="pf-note">Stars, 5 to 1: ' + RVW.hist.map(function (n) { return n.toLocaleString("en-IN"); }).join(" · ") + ".</p>" : "") + "</div>" : "";
    var vSub = (G.shopScore != null ? (G.qScore != null ? "Buyer questions " : "Shoppers ") + G.shopScore + "/100" : "") + (RVW && RVW.score != null ? (G.shopScore != null ? ", reviews " + RVW.score + "/100 (" + Math.round(100 * (G.revW || 0.3)) + "%)" : "Reviews " + RVW.score + "/100") : "") + (G.voice != null ? ": customer voice " + G.voice + "/100, " + vw + "% of the CRO score." : ".");
    if (sh && sh.personas && sh.personas.length) {
      var rv = sh.reviews || {};
      h += '<section class="rp-sec sh" id="rp-shoppers">' + head("Customer voice", "4 shoppers walked your page", (G.qScore != null ? "How well the page answers the questions " + esc(clip(G.product || "this product", 60)) + " buyers ask (scored in Buyer questions below), plus what past buyers say in reviews. The 4 shoppers below show how it reads to the people who buy it. " : "Picked for who buys " + esc(clip(G.product || "this product", 60)) + ". Each read the page and said how likely they are to buy, weighted by how many shoppers like them you get. Reviews from past buyers count too. ") + vSub) +
        '<div class="sh-grid">' + sh.personas.map(rCard).join("") + "</div>" + rvRow +
        (rv.read ? '<p class="sh-rv"><b>From your reviews:</b> ' + esc(rv.summary || "") + (rv.doubts && rv.doubts.length ? " Buyers keep asking: " + esc(rv.doubts.join("; ")) + "." : "") + "</p>" : "") + "</section>";
    } else h += '<section class="rp-sec sh" id="rp-shoppers">' + head("Customer voice", "Shoppers couldn't walk this page this time", "The shopper read didn't come back for this scan (our free AI quota may be busy), so the customer voice " + (RVW && RVW.score != null ? "uses your reviews alone" : "is left out") + ". Run it again in a few minutes for the full read.") + rvRow + "</section>";
    var byG = function (a, b) { return (b.gain || 0) - (a.gain || 0); };
    var top = Pl ? Pl.cro.concat(Pl.speed).filter(function (f) { return f.gain > 0; }).sort(byG).slice(0, 3) : [];
    if (top.length && !opt.noTop) h += '<section class="rp-sec tf" id="rp-top">' + head("Do these first", "Your top " + top.length + " fixes", "Each number is what that fix alone adds to your overall score." + (G.top3 && G.top3.to > G.top3.from ? " All " + top.length + " together: " + G.top3.from + " → " + G.top3.to + "." : "")) +
      '<ol class="tf-list">' + top.map(function (f, i) {
        return '<li><span class="tf-n ' + f.kind + '">' + (i + 1) + '</span><div class="tf-b"><b>' + esc(f.t) + "</b>" + (f.ev ? "<span>" + esc(clip(f.ev, 200)) + "</span>" : "") + (f.fix ? '<span class="fx">Fix: ' + esc(f.fix) + "</span>" : "") + '</div><span class="tf-g">' + gainTxt(f.gain) + "</span></li>";
      }).join("") + "</ol></section>";
    var PF = G.proof;
    if (PF) {
      var pw = Math.round(100 * ((G.w4 && G.w4.proof) || 0.4));
      h += '<section class="rp-sec pf" id="rp-proof">' + head("Proof", "Proof on the page: " + PF.score + "/100", (PF.carry && PF.carry >= PF.raw ? "Shoppers already know " + esc((G.shop && G.shop.brand) || "this brand") + (PF.tier === "premium" || PF.tier === "luxury" ? " as a " + esc(PF.tier) + " brand" : "") + ", so the name does most of the proving. On the page itself: " + PF.raw + "/100. " : "Besides reviews, what a careful shopper can check before paying: tests and certificates, specs, results. ") + pw + "% of the CRO score.") +
        '<div class="pf-row">' + PF.items.map(function (i) { return '<span class="pf-i ' + (i.bad ? "bad" : i.ok ? "ok" : i.unk ? "unk" : "no") + '"' + (i.unk ? ' title="Loaded with JavaScript and didn\'t load for our reader"' : "") + "><i>" + (i.bad ? "✕" : i.ok ? "✓" : i.unk ? "?" : "–") + "</i>" + esc(i.label) + "</span>"; }).join("") + "</div>" +
        "</section>";
    }
    var rl = G.rules || [], app = rl.filter(function (r) { return r.st !== "na"; }), ok = app.filter(function (r) { return r.st === "pass"; }).length;
    h += '<section class="rp-sec rl" id="rp-rules">' + head("House rules", ok + " of " + app.length + " basics in place", "Hard facts we check on every product page. Together they make up " + Math.round(100 * ((G.w4 && G.w4.rules) || 0.25)) + "% of the CRO score: " + (G.rulesScore == null ? "n/a" : G.rulesScore + "/100") + ".") +
      '<div class="rl-grid">' + rl.map(function (r) { return '<div class="rl-i ' + r.st + '"><i>' + R_ICON[r.st] + '</i><div><b>' + esc(r.t) + "</b><span>" + esc(clip(r.ev, 170)) + "</span></div></div>"; }).join("") + "</div></section>";
    return h;
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
      (q.g !== "yes" && q.fix ? '<p class="tg-fix"><b>Fix:</b> ' + esc(q.fix) + "</p>" : "") + '<div class="tg-qtags">' + tag(q.tag) + (q.grp && BR_NAME[q.grp] ? '<span class="tg-tag pillar">' + esc(BR_NAME[q.grp]) + "</span>" : "") + (q.src === "product" ? '<span class="tg-tag estimate">Question written for this product</span>' : "") + "</div></div></details>";
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
    return '<section class="rp-sec" id="rp-questions">' + head("Buyer questions", "What " + esc(G.cat === "Other" ? "shoppers" : G.cat.toLowerCase() + " shoppers") + " ask before they pay", (G.qScore != null ? "The doubts buyers of this kind of product have before they pay, graded on your page with the words that answer them. Questions that don't apply to this product are left out. Must-solve doubts stop the sale." : G.qList ? "The doubts buyers of this kind of product have before they pay. Our AI grader didn't answer this time, so these are checked by keywords only: treat them as a first pass." : "The doubts " + (G.sub ? esc(G.sub.toLowerCase()) + " " : "") + "buyers have, from the Troopod barrier library" + (G.ai ? " plus questions written for this exact product" : "") + ", checked against what your page actually says. Must-solve doubts stop the sale.")) + h + "</section>";
  }
  var BR_NAME = { rules: "House rules", shoppers: "Customer voice", proof: "Proof on the page", clarity: "Clarity & fit", trust: "Trust & risk", price: "Price, delivery & payment", speed: "Speed on phone", flow: "Focus & flow", discover: "Search & AI", aov: "Basket size", retain: "Repeat orders" };
  var BR_Q = { clarity: "Do shoppers understand what they get and that it suits them?", trust: "Do shoppers feel safe buying here?", price: "Do shoppers see the full price, delivery date and how to pay?", speed: "Does the page load fast on a phone?", flow: "Is the path to buy clear, and does the page match the ad?", discover: "Can Google and AI assistants find you?", aov: "Does the page invite a bigger basket?", retain: "Will first-time buyers come back?" };
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
  /* ---------------- the pinned planner ---------------- */
  /* the phone shows the page 262px wide with a 38px gutter on the right for pins, so pins never cover the page */
  var PL_W = 300, PL_PAGE = 262, PL_VIS = 8;
  var CHECK = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0A0A0C" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  function gainTxt(g) { return g == null ? "n/a" : g === 0.5 ? "<1" : "+" + g; }
  function rPlanRow(f, i, wb) {
    var extra = f.kind === "cro" && i >= PL_VIS;
    if (wb) return '<div class="pl-row wbc' + (extra ? " pl-extra" : "") + '" data-fix="' + esc(f.id) + '"' + (extra ? " hidden" : "") + '><div class="pl-head">' +
      '<button type="button" class="pl-check" aria-pressed="false" data-plan-check="' + esc(f.id) + '" aria-label="Add to plan: ' + esc(f.t) + '"><span class="pl-box">' + CHECK + "</span></button>" +
      '<div class="wbc-main"><div class="wbc-t"><span class="pl-num ' + f.kind + '">' + esc(f.label) + '</span><b>' + esc(f.t) + '</b><span class="wbc-g ' + f.kind + (f.gain == null ? " na" : "") + '">' + (f.gain == null ? "n/a" : gainTxt(f.gain) + " pts") + "</span></div>" +
      '<p class="wbc-meta">' + esc([BR_NAME[f.pillar], f.partly ? "partly answered" : "", f.sev].filter(Boolean).join(" · ")) + "</p>" +
      (f.ev ? '<p class="wbc-ev"><b>Seen on the page:</b> ' + esc(f.ev) + "</p>" : "") + (f.fix ? '<div class="wbc-fix"><b>How to fix:</b> ' + esc(f.fix) + "</div>" : "") + "</div>" +
      '<div class="wbc-act"><button type="button" class="wbc-pin" data-plan-open="' + esc(f.id) + '">Pin ' + esc(f.label) + '</button><button type="button" class="wbc-copy" data-wb-copy="' + esc((f.t + ". " + (f.fix || "")).slice(0, 400)) + '">Copy</button></div></div></div>';
    return '<div class="pl-row' + (extra ? " pl-extra" : "") + '" data-fix="' + esc(f.id) + '"' + (extra ? " hidden" : "") + '><div class="pl-head">' +
      '<button type="button" class="pl-check" aria-pressed="false" data-plan-check="' + esc(f.id) + '" aria-label="Add to plan: ' + esc(f.t) + '"><span class="pl-box">' + CHECK + "</span></button>" +
      '<button type="button" class="pl-open" aria-expanded="false" data-plan-open="' + esc(f.id) + '"><span class="pl-num ' + f.kind + '">' + esc(f.label) + '</span><span class="pl-t">' + esc(f.t) + "</span>" +
      '<span class="pl-g' + (f.gain == null ? " na" : "") + '" title="Overall points if you make only this fix">' + gainTxt(f.gain) + "</span></button></div>" +
      '<div class="pl-body" hidden>' + (f.ev ? '<p><span class="k">Seen: </span>' + esc(f.ev) + "</p>" : "") + (f.fix ? '<p class="fx"><span class="k">Fix: </span>' + esc(f.fix) + "</p>" : "") +
      '<p class="meta">' + esc([BR_NAME[f.pillar], f.partly ? "partly answered" : "", f.sev].filter(Boolean).join(" · ")) + "</p></div></div>";
  }
  function plPins(list, R) {
    var RG = R.regions || {}, S = PL_PAGE / 390, last = -99, out = "";
    var placed = list.map(function (f, i) { var key = RG[f.region] ? f.region : RG.content ? "content" : "title", r = RG[key]; return r ? { f: f, i: i, r: r, y: r.y * S } : null; }).filter(Boolean)
      .sort(function (a, b) { return a.y - b.y || a.i - b.i; });
    placed.forEach(function (p) {
      var y = Math.max(p.y + 2, last + 30); last = y;
      var r = p.r, hl = [Math.round(Math.max(0, r.x * S)), Math.round(r.y * S), Math.round(Math.min(r.w * S, PL_PAGE - Math.max(0, r.x * S))), Math.round(Math.max(18, r.h * S))].join(",");
      var extra = p.f.kind === "cro" && p.i >= PL_VIS;
      out += '<button type="button" class="pl-pin ' + p.f.kind + (extra ? " pl-extra" : "") + '" data-plan-pin="' + esc(p.f.id) + '" data-kind="' + p.f.kind + '" data-hl="' + hl + '" style="left:' + (PL_PAGE + 6) + "px;top:" + Math.round(y) + 'px"' + (p.f.kind !== "cro" || extra ? " hidden" : "") + ' aria-label="Problem ' + esc(p.f.label) + ": " + esc(p.f.t) + '">' + esc(p.f.label) + "</button>";
    });
    return out;
  }
  function vitTone(v, good, poor) { return v == null ? "" : v <= good ? "good" : v <= poor ? "mid" : "bad"; }
  function rPlan(G, R, wb) {
    var Pl = G.plan; if (!Pl || !(Pl.cro.length + Pl.speed.length)) return "";
    var row = function (f, i) { return rPlanRow(f, i, wb); };
    var V = Pl.vit, vit = "";
    if (Pl.est || !V) vit = '<p class="pl-vnote">Google PageSpeed didn\'t answer in time for this scan, so speed is estimated from the page\'s code. Run the analysis again for real numbers.</p>';
    else {
      var cells = [["Main image shows at", V.lcp != null ? V.lcp.toFixed(1) + "s" : "n/a", "under 2.5s", vitTone(V.lcp, 2.5, 4)], ["Page frozen for", V.tbt != null ? V.tbt + "ms" : "n/a", "under 200ms", vitTone(V.tbt, 200, 600)], ["Layout shift", V.cls != null ? V.cls.toFixed(2) : "n/a", "under 0.1", vitTone(V.cls, 0.1, 0.25)]];
      vit = '<div class="pl-vit">' + cells.map(function (c) { return '<div><span class="n">' + esc(c[0]) + '</span><b class="' + c[3] + '">' + esc(c[1]) + '</b><span class="g">good: ' + esc(c[2]) + "</span></div>"; }).join("") + "</div>" +
        (V.field || V.kb ? '<p class="pl-vnote">' + (V.field ? "Real Chrome users (Google, last 28 days): " + esc(V.field.toLowerCase()) + ". " : "") + (V.kb ? "Page weight on a phone: " + (V.kb / 1024).toFixed(1) + " MB." : "") + "</p>" : "");
    }
    var nCro = Pl.cro.length, more = nCro > PL_VIS ? '<button type="button" class="pl-more" data-plan-more>Show ' + (nCro - PL_VIS) + " more</button>" : "";
    var tabs = '<div class="pl-tabs" role="tablist" aria-label="Fix type">' +
      '<button type="button" role="tab" aria-selected="true" data-plan-tab="cro"><span class="pl-tl"><i class="pl-dot cro"></i>CRO fixes <em>' + nCro + '</em></span><span class="pl-up">up to +' + Pl.upCro + "</span></button>" +
      '<button type="button" role="tab" aria-selected="false" data-plan-tab="speed"><span class="pl-tl"><i class="pl-dot speed"></i>Speed fixes <em>' + Pl.speed.length + '</em></span><span class="pl-up">' + (Pl.est ? "estimated" : "up to +" + Pl.upSpeed) + "</span></button></div>";
    var side = '<div class="pl-side">' + tabs + '<div class="pl-vits" data-plan-vitals hidden>' + vit + "</div>" +
      '<div class="pl-hint"><p>Tick to add to your plan. Tap a fix to see why.</p><button type="button" class="pl-all" data-plan-all>Tick all CRO fixes</button></div>' +
      '<div class="pl-list" data-plan-list="cro">' + (nCro ? Pl.cro.map(row).join("") + more : '<p class="pl-empty">No CRO fixes left on this page.</p>') + "</div>" +
      '<div class="pl-list" data-plan-list="speed" hidden>' + (Pl.speed.length ? Pl.speed.map(row).join("") : '<p class="pl-empty">No speed problems flagged. Nice.</p>') + "</div></div>";
    var H = R.pageH && R.regions ? Math.min(R.pageH, 6000) : 0, S = PL_PAGE / 390, shot = R.psi && R.psi.shots && R.psi.shots.final;
    var screen = H ? '<div class="pl-canvas" data-plan-canvas data-h="' + H + '" style="height:' + Math.round(H * S) + 'px"><i class="pl-gutter" aria-hidden="true"></i><i class="pl-hl" data-plan-hl hidden></i>' + plPins(Pl.cro, R) + plPins(Pl.speed, R) + "</div>"
      : '<div class="pl-canvas fallback">' + (shot ? '<img src="' + esc(shot) + '" alt="Your page on a phone, as Google loaded it">' : '<p>We couldn\'t draw this page here.</p>') + "</div>";
    var phone = '<div class="pl-phone-col"><div class="pl-phone"><div class="pl-screen" data-plan-screen>' + screen + '</div></div><p class="pl-note" data-plan-note>' + (H ? "Your page on a phone, drawn without its scripts. Tap a number." : "We couldn't map where each problem sits on this page, so the list carries everything.") + "</p></div>";
    if (wb) return { side: side, phone: phone };
    return '<section class="rp-sec" id="rp-plan" data-plan>' + head("Your fixes", "Plan your fixes on the page itself", "Tick the fixes you'll make and the CRO, Speed and overall scores above update. The number on each fix is what it adds to the overall score on its own; fixes on the same pillar add a little less together. Estimates from the TrooCRO score model.") +
      '<div class="pl-wrap">' + side + phone + "</div></section>";
  }

  function render(G, R) {
    if (!G) return { html: "", nav: [] };
    var plan = rPlan(G, R);
    var html = plan + rSnapshot(G, R) + (plan ? "" : rWeek(G)) + rQuestions(G) + rLevers(G) + rPeers(G) + rConfirm(G);
    var nav = [];
    if (plan) nav.push(["rp-plan", "Plan your fixes", G.plan.cro.length + G.plan.speed.length]);
    nav.push(["rp-snapshot", "Snapshot", ""]);
    if (!plan && G.week.length) nav.push(["rp-week", "Start here", G.week.length]);
    nav.push(["rp-questions", "Buyer questions", G.qs.filter(function (q) { return q.g === "no"; }).length], ["rp-levers", "Growth levers", G.levers.length]);
    if (G.peers.length) nav.push(["rp-peers", "Vs category leaders", G.peers.length]);
    if (G.confirm.length) nav.push(["rp-confirm", "Confirm with your team", G.confirm.length]);
    var wb = G.scoreV === 4 && !G.unread ? { plan: rPlan(G, R, true), voice: rShort(G, R, { noTop: true }), questions: rQuestions(G), growth: rSnapshot(G, R) + rLevers(G) + rPeers(G) + rConfirm(G) } : null;
    return { html: html, nav: nav, services: rServices(G), short: rShort(G, R), wb: wb };
  }
  function wirePlan(root, G, opts) {
    var sec = root.querySelector("[data-plan]"); if (!sec || !G || !G.plan) return;
    var WB = sec.hasAttribute("data-wb");
    var Pl = G.plan, on = (Pl.defaultOn || []).slice(), tab = "cro", open = null, more = false;
    function q(sel, r) { return (r || root).querySelector(sel); }
    function qa(sel, r) { return Array.prototype.slice.call((r || root).querySelectorAll(sel)); }
    function ids(kind) { return (kind === "speed" ? Pl.speed : Pl.cro).map(function (f) { return f.id; }); }
    function setHTML(sel, h) { qa(sel).forEach(function (el) { el.innerHTML = h; }); }
    function arrow(a, b) { return b != null && a != null && b !== a ? a + ' <span class="ar">→</span> <b class="to">' + b + "</b>" : (a == null ? "n/a" : String(a)); }
    function upd() {
      var pr = project(Pl.Mo, on), b = Pl.base, d = pr.overall - b.overall;
      qa("[data-plan-check]").forEach(function (btn) { var id = btn.getAttribute("data-plan-check"), x = on.indexOf(id) >= 0; btn.setAttribute("aria-pressed", x ? "true" : "false"); var row = btn.closest(".pl-row"); if (row) row.classList.toggle("on", x); });
      qa("[data-plan-pin]").forEach(function (p) { p.classList.toggle("picked", on.indexOf(p.getAttribute("data-plan-pin")) >= 0); });
      setHTML("[data-plan-cro]", arrow(b.cro, pr.cro)); setHTML("[data-plan-speed]", arrow(b.speed, pr.speed));
      if (WB) {
        setHTML("[data-wb-to]", String(pr.overall)); setHTML("[data-wb-up]", d > 0 ? "+" + d + " pts" : "no change");
        qa("[data-wb-ring]").forEach(function (el) { el.style.setProperty("--to", (pr.overall || 0) + ""); });
        setHTML("[data-wb-n]", on.length + (on.length === 1 ? " fix" : " fixes"));
        qa("[data-wb-cro-to]").forEach(function (el) { el.style.width = (pr.cro || 0) + "%"; }); qa("[data-wb-sp-to]").forEach(function (el) { el.style.width = (pr.speed || 0) + "%"; });
        setHTML("[data-wb-cro-v]", arrow(b.cro, pr.cro)); setHTML("[data-wb-sp-v]", arrow(b.speed, pr.speed));
        qa("[data-wb-mode-to]").forEach(function (el) { el.textContent = "With fixes (" + pr.overall + ")"; });
        sec.setAttribute("data-lift", b.cro && pr.cro ? Math.max(0, (pr.cro - b.cro) / b.cro) : 0);
        if (typeof sec.wbCalc === "function") sec.wbCalc();
      }
      qa("[data-plan-cro-bar]").forEach(function (el) { el.style.width = (pr.cro || 0) + "%"; }); qa("[data-plan-speed-bar]").forEach(function (el) { el.style.width = (pr.speed || 0) + "%"; });
      qa("[data-plan-line]").forEach(function (el) {
        el.hidden = false;

        var dflt = Pl.Mo && Pl.Mo.v4 && on.length && on.length === (Pl.defaultOn || []).length && on.every(function (x) { return Pl.defaultOn.indexOf(x) >= 0; });
        el.hidden = !!(Pl.Mo && Pl.Mo.v4 && !on.length);
        el.innerHTML = dflt ? "With your top " + on.length + " fixes: <b>" + b.overall + ' <span class="ar">→</span> ' + pr.overall + "</b>" + (d > 0 ? ' <span class="up">+' + d + " pts</span>" : "") + ' <span class="n">· <a href="#rp-top">see them</a></span>'
          : on.length ? "With your plan: <b>" + b.overall + ' <span class="ar">→</span> ' + pr.overall + "</b>" + (d > 0 ? ' <span class="up">+' + d + " pts</span>" : "") + ' <span class="n">· ' + on.length + (on.length === 1 ? " fix" : " fixes") + ' ticked · <a href="#rp-plan">edit</a></span>'
          : 'Tick fixes in <a href="#rp-plan">Plan your fixes</a> to see your new score.';
      });
      var all = ids(tab), allOn = all.length && all.every(function (id) { return on.indexOf(id) >= 0; }), ab = q("[data-plan-all]");
      if (ab) { ab.textContent = allOn ? "Untick all" : tab === "speed" ? "Tick all speed fixes" : "Tick all CRO fixes"; ab.hidden = !all.length; }
    }
    function setTab(k) {
      tab = k;
      qa("[data-plan-tab]").forEach(function (t) { t.setAttribute("aria-selected", t.getAttribute("data-plan-tab") === k ? "true" : "false"); });
      qa("[data-plan-list]").forEach(function (l) { l.hidden = l.getAttribute("data-plan-list") !== k; });
      var v = q("[data-plan-vitals]"); if (v) v.hidden = k !== "speed";
      qa("[data-plan-pin]").forEach(function (p) { p.hidden = p.getAttribute("data-kind") !== k || (p.classList.contains("pl-extra") && !more); });
      var hb = q("[data-plan-hl]"); if (hb) hb.hidden = true; open = null; qa(".pl-row").forEach(function (r) { r.classList.remove("open"); var bd = q(".pl-body", r); if (bd) bd.hidden = true; });
      var n = q("[data-plan-note]"); if (n && q("[data-plan-canvas]")) n.textContent = k === "speed" ? "Speed problems slow the whole page. Pins show where shoppers feel them." : "Your page on a phone, drawn without its scripts. Tap a number.";
      upd();
    }
    function setOpen(id, fromPin) {
      open = open === id && !fromPin ? null : id;
      qa(".pl-row").forEach(function (r) { var x = r.getAttribute("data-fix") === open; r.classList.toggle("open", x); var bd = q(".pl-body", r); if (bd && !WB) bd.hidden = !x; var ob = q("[data-plan-open]", r); if (ob) ob.setAttribute("aria-expanded", x ? "true" : "false"); });
      if (WB) { var hc = q("[data-wb-hot]"), fx = open ? Pl.cro.concat(Pl.speed).filter(function (x) { return x.id === open; })[0] : null; if (hc) { hc.hidden = !fx; if (fx) hc.innerHTML = '<span class="wb-hot-k">Pin ' + esc(fx.label) + " · " + esc(BR_NAME[fx.pillar] || (fx.kind === "speed" ? "Speed" : "CRO")) + "</span><b>" + esc(fx.t) + "</b>" + (fx.ev ? "<p>" + esc(clip(fx.ev, 220)) + "</p>" : ""); } }
      qa("[data-plan-pin]").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-plan-pin") === open); });
      var hlb = q("[data-plan-hl]"), pin0 = open ? q('[data-plan-pin="' + open + '"]') : null;
      if (hlb) {
        if (pin0 && !pin0.hidden && pin0.getAttribute("data-hl")) {
          var v = pin0.getAttribute("data-hl").split(",").map(Number);
          hlb.style.left = v[0] + "px"; hlb.style.top = v[1] + "px"; hlb.style.width = v[2] + "px"; hlb.style.height = v[3] + "px";
          hlb.className = "pl-hl " + (pin0.getAttribute("data-kind") || "cro"); hlb.hidden = false;
        } else hlb.hidden = true;
      }
      if (!open) return;
      var pin = q('[data-plan-pin="' + open + '"]'), scr = q("[data-plan-screen]");
      if (pin && scr && !pin.hidden) scr.scrollTo({ top: Math.max(0, pin.offsetTop - 140), behavior: "smooth" });
      if (fromPin) { var row = q('.pl-row[data-fix="' + open + '"]'); if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
    sec.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("button") : null; if (!t || !sec.contains(t)) return;
      var id;
      if ((id = t.getAttribute("data-plan-check"))) { on = on.indexOf(id) >= 0 ? on.filter(function (x) { return x !== id; }) : on.concat([id]); upd(); return; }
      if ((id = t.getAttribute("data-plan-open"))) { setOpen(id); return; }
      if ((id = t.getAttribute("data-plan-pin"))) { var f = Pl.cro.concat(Pl.speed).filter(function (x) { return x.id === id; })[0]; if (f && f.kind !== tab) setTab(f.kind); setOpen(id, true); return; }
      if ((id = t.getAttribute("data-plan-tab"))) { setTab(id); return; }
      if ((id = t.getAttribute("data-wb-copy"))) { try { navigator.clipboard.writeText(id); t.textContent = "Copied"; setTimeout(function () { t.textContent = "Copy"; }, 1400); } catch (e2) { /* ignore */ } return; }
      if ((id = t.getAttribute("data-wb-mode"))) { sec.setAttribute("data-phone", id); qa("[data-wb-mode]").forEach(function (b2) { b2.setAttribute("aria-pressed", b2 === t ? "true" : "false"); }); return; }
      if ((id = t.getAttribute("data-wb-locate"))) { var f2 = Pl.cro.concat(Pl.speed).filter(function (x) { return x.id === id; })[0]; if (f2 && f2.kind !== tab) setTab(f2.kind); setOpen(id, true); var ph = q("[data-plan-screen]"); if (ph && ph.scrollIntoView && win.innerWidth < 1100) ph.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      if (t.hasAttribute("data-plan-more")) { more = true; qa(".pl-extra").forEach(function (x) { if (!x.classList.contains("pl-pin") || x.getAttribute("data-kind") === tab) x.hidden = false; }); t.remove(); return; }
      if (t.hasAttribute("data-plan-all")) { var a = ids(tab), allOn = a.every(function (x) { return on.indexOf(x) >= 0; }); on = allOn ? on.filter(function (x) { return a.indexOf(x) < 0; }) : on.concat(a.filter(function (x) { return on.indexOf(x) < 0; })); if (!allOn && !more) { var mb = q("[data-plan-more]"); if (mb) mb.click(); } upd(); return; }
    });
    setTab("cro");
    /* the live page in the phone: the same script-free copy the scan measured */
    var cv = q("[data-plan-canvas]"), H = cv ? +cv.getAttribute("data-h") : 0;
    if (cv && H && opts && opts.view) Promise.resolve(opts.view()).then(function (v) {
      if (!v || !v.html) { cv.classList.add("noview"); return; }
      var S = PL_PAGE / 390, fr = document.createElement("iframe");
      fr.setAttribute("sandbox", "allow-same-origin"); fr.setAttribute("title", "Your page on a phone"); fr.setAttribute("tabindex", "-1"); fr.setAttribute("aria-hidden", "true");
      fr.className = "pl-frame"; fr.style.height = H + "px"; fr.style.transform = "scale(" + S + ")";
      fr.srcdoc = v.html;
      fr.addEventListener("load", function () {
        try {
          Array.prototype.forEach.call(fr.contentDocument.querySelectorAll("img"), function (im) {
            var ds = im.getAttribute("data-src") || im.getAttribute("data-lazy-src") || im.getAttribute("data-original"), dss = im.getAttribute("data-srcset");
            if (ds && (!im.getAttribute("src") || /data:image|placeholder|blank/i.test(im.getAttribute("src")))) im.setAttribute("src", ds.replace(/\{width\}/g, "800"));
            if (dss && !im.getAttribute("srcset")) im.setAttribute("srcset", dss.replace(/\{width\}/g, "800"));
            im.removeAttribute("loading");
          });
        } catch (e) { /* cross-origin: leave as is */ }
        cv.classList.add("ready");
      });
      cv.insertBefore(fr, cv.firstChild);
    }).catch(function () { cv.classList.add("noview"); });
    else if (cv) cv.classList.add("noview");
  }
  function wire(root, G, opts) {
    wirePlan(root, G, opts);
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
    var md = "\n## TrooGrowth\n\n" + "Overall " + G.score + "/100 (CRO " + G.cro + "/100, " + G.croW + "%; speed " + G.speed + "/100, " + G.speedW + "%).\n\n" + (G.one ? "**Biggest problem:** " + G.one.text + "\n\n" : "") +
      (G.scoreV === 4 && G.shop ? "### Customer voice (" + (G.voice != null ? G.voice : G.shopScore) + "/100: " + (G.qScore != null ? "buyer questions " : "shoppers ") + G.shopScore + (G.reviews && G.reviews.score != null ? ", reviews " + G.reviews.score : "") + ")\n" + G.shop.personas.map(function (p) { return "- **" + p.n + "** (" + p.fit + "% of shoppers): " + p.buy + "/100. \u201c" + p.leave + "\u201d" + (p.fix && p.fix.change ? " Fix: " + p.fix.change : ""); }).join("\n") + "\n\n" : "") +
      (G.scoreV === 4 && G.rules ? "### House rules (" + G.rulesScore + "/100)\n" + G.rules.map(function (r) { return "- [" + r.st + "] " + r.t + ": " + r.ev; }).join("\n") + "\n\n" : "") + "Category: " + G.cat + (G.sub ? " > " + G.sub : "") + ". Season: " + G.season.name + ".\n\n### Three things this week\n" + G.week.map(function (w, i) { return (i + 1) + ". " + w.title + " (" + (BR_NAME[w.branch] || "") + ")"; }).join("\n") + "\n\n### Buyer questions\n";
    G.qs.forEach(function (q) { md += "- [" + G_LABEL[q.g] + "] " + q.q + (q.g !== "yes" && q.fix ? " Fix: " + q.fix : "") + "\n"; });
    md += "\n### Growth levers\n"; G.levers.forEach(function (l) { md += l.rank + ". " + l.name + ": " + l.score + "/100, 10% better is worth " + moneyFmt(l.inr10, G.money.cur) + "/month\n"; });
    return md;
  }

  win.TrooGrowth = { catOf: catOf, pageText: pageText, mergeLive: mergeLive, build: build, render: render, wire: wire, markdown: markdown, appsOf: appsOf, marketOf: marketOf, subOf: subOf, qList: qList, NAMES: BR_NAME, project: project };
})();
