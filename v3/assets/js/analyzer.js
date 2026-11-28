/* TrooCRO site analysis: start -> quick questions -> live scan -> report.
   Talks to the TrooCRO Edge Function (Supabase free plan). PageSpeed is optional and free.
   Every string that came from a scanned page is escaped before it touches the DOM. */
(function () {
  "use strict";
  var doc = document, win = window;
  var CFG = win.TROOCRO_CONFIG || {};
  var API = String(CFG.api || "").replace(/\/+$/, "");
  var WA = CFG.whatsapp || "919810483552";
  var reduced = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tidy(s) { return String(s || "").replace(/\s*—\s*/g, ": ").replace(/\s+–\s+/g, ", ").replace(/\s+/g, " ").trim(); }
  function bandLabel(b) {
    if (!b) return "";
    if (/^</.test(b)) return "Under " + b.replace(/^<\s*/, "");
    if (/\+$/.test(b)) return "Over " + b.replace(/\+$/, "");
    return b.replace(/\s*[–-]\s*/, " to ");
  }
  function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  var CUR_SYM = { INR: "₹", USD: "$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$", SGD: "S$", AED: "AED ", NZD: "NZ$" };
  function rupees(cur) { return !cur || cur === "INR" || cur === "unknown"; }
  function money(n, cur) { return rupees(cur) ? inr(n) : (CUR_SYM[cur] || cur + " ") + Math.round(n).toLocaleString("en-GB"); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, reduced ? Math.min(ms, 80) : ms); }); }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return String(u || "").replace(/^www\./, ""); } }
  function dec(s) {
    return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, function (m, e) {
      var k = e.toLowerCase();
      if (k[0] === "#") { var n = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[k] || m;
    });
  }
  function cleanPage(p) {
    p = Object.assign({}, p || {});
    ["title", "description", "heroHeadline", "primaryCta"].forEach(function (k) { if (p[k]) p[k] = dec(dec(p[k])); });
    if (Array.isArray(p.h1)) p.h1 = p.h1.map(function (x) { return dec(dec(x)); });
    return p;
  }
  function normalizeInput(v) {
    v = String(v || "").trim();
    if (!v || /\s/.test(v)) return null;
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try {
      var u = new URL(v);
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
      return u.href;
    } catch (e) { return null; }
  }
  function fmtDate(d) { return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function nextMonday(from) { var d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); do { d = addDays(d, 1); } while (d.getDay() !== 1); return d; }
  function colorFor(v) { return v == null ? "var(--dim)" : v >= 85 ? "var(--green)" : v >= 70 ? "var(--purple-2)" : v >= 50 ? "var(--amber)" : "var(--red)"; }
  function plural(n, a, b) { return n + " " + (n === 1 ? a : (b || a + "s")); }
  var ICON_CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5 8.6l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_SPARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor"/></svg>';
  var SURFACE = { HOME: "Homepage", PDP: "Product page", LP: "Landing page", COLLECTION: "Collection page", ALL: "Every page", CART: "Cart", CHECKOUT: "Checkout", SEARCH: "Search", PERF: "Page load" };
  function surfaceLabel(s, R, area) {
    if (area === "speed") return "Page load";
    if (!s || !s.surface || s.surface === "ALL") return "Every page";
    return PAGE_TYPE[(R.page || {}).pageType] || SURFACE[s.surface] || "This page";
  }
  var PAGE_TYPE = { HOME: "Homepage", PDP: "Product page", LP: "Landing page", COLLECTION: "Collection page", CART: "Cart page", OTHER: "Page" };

  function toast(msg) {
    var t = $("[data-toast]"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function copyText(s) {
    if (navigator.clipboard && win.isSecureContext) return navigator.clipboard.writeText(s);
    return new Promise(function (res, rej) {
      var ta = doc.createElement("textarea"); ta.value = s; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); }
      doc.body.removeChild(ta);
    });
  }

  function api(path, body, opts) {
    opts = opts || {};
    if (!API) return Promise.reject(Object.assign(new Error("The scanner address is not set."), { network: true, status: 0 }));
    var ctl = win.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 45000) : 0;
    return fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Something went wrong. Try again."); e.status = r.status; throw e; }
        return j;
      });
    }, function (e) {
      clearTimeout(timer);
      var err = new Error(e && e.name === "AbortError" ? "That took too long. Try again in a minute." : "We couldn't reach the TrooCRO scanner.");
      err.network = true; err.status = 0; throw err;
    });
  }

  /* ---------------- state ---------------- */
  var S = { url: "", host: "", inputs: { category: "", aovBand: "", goal: "conversion", visitors: 0, competitors: [] }, scanP: null, detected: null, scan: null, psi: null, comps: [], report: null, saved: false, offline: false, mode: "live", running: false };
  var panels = $$("[data-panel]");
  function show(name) {
    panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    win.scrollTo(0, 0);
    doc.body.setAttribute("data-an-view", name);
  }
  function setQuery(q) { try { history.replaceState(null, "", win.location.pathname + (q ? "?" + q : "")); } catch (e) { /* file:// may refuse */ } }

  /* ---------------- start ---------------- */
  var form = $("[data-an-form]"), urlIn = $("#an-url"), formErr = $("[data-an-form-err]");
  if (form) form.addEventListener("submit", function (e) { e.preventDefault(); begin(urlIn.value); });
  $$("[data-an-sample]").forEach(function (b) { b.addEventListener("click", function () { openSample(); }); });

  function begin(raw, cap) {
    S.capture = cap || null; /* a read sent from the shopper's own browser (bookmarklet) */
    var u = normalizeInput(raw);
    if (!u) { formErr.textContent = "Enter your store's address, like yourstore.com."; urlIn.focus(); return; }
    formErr.textContent = "";
    if (S.offline) { openSample(); return; }
    S.url = u; S.host = hostOf(u); S.detected = null; S.mode = "live";
    S.runId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); /* one id per audit: every step is logged under it (audit_run_log) */
    S.scanP = api("/scan", { url: u }, { timeout: 45000 }).then(function (r) { S.detected = r; onDetected(r); return r; });
    S.scanP.catch(function (e) { if (!CFG.audit && doc.body.getAttribute("data-an-view") === "questions") showError(e); }); /* audit mode reads the page in a browser: a failed quick fetch is not fatal */
    /* v3: the quiz's category comes from the v3 reader, not the old keyword guess */
    S.v3cat = null; S.v3checks = null; S.v3price = null;
    S.auditReadP = CFG.audit ? auditRead(u) : null; /* full read starts now; the quiz only needs the quick category */
    if (CFG.v3) (CFG.audit ? v3call("/audit_peek", { url: u }, 30000) : v3call("/scan", { url: u, suggest: false }, 60000)).then(function (d) {
      if (!d || S.url !== u) return;
      S.v3cat = CATS.indexOf(d.category) >= 0 ? d.category : null; S.v3checks = d.checklist || null;
      if (!S.v3price && d.product && +d.product.price > 0) S.v3price = { v: +d.product.price, cur: d.product.currency || "INR" };
      lateCategory();
    });
    if (S.auditReadP) S.auditReadP.then(function (r) {
      if (!r || !r.ok || S.url !== u) return;
      /* the reader's price is the one a shopper sees on the first screen: it replaces the quick guess */
      if (r.product && +r.product.price > 0) { S.v3price = { v: +r.product.price, cur: r.product.currency || "INR" }; v3Facts(); }
      if (!S.v3cat && CATS.indexOf(r.category) >= 0) { S.v3cat = r.category; lateCategory(); }
    }, function () {});
    setupQuestions();
    show("questions");
    setQuery("url=" + encodeURIComponent(u.replace(/^https?:\/\//, "").replace(/\/$/, "")));
  }

  /* ---------------- quick questions: one at a time ---------------- */
  var CATS = ["Beauty & Personal Care", "Fashion & Apparel", "Jewellery & Accessories", "Health & Wellness", "Food & Beverages", "Home & Living", "Electronics & Gadgets", "Baby & Kids", "Pet Care", "Sports & Fitness", "Games & Toys"];
  var QS = [
    { id: "category", title: "What do you sell?", sub: "It picks your category checks and the benchmark we compare you with.", cols: 3, opts: CATS.map(function (c) { return [c, c]; }) },
    { id: "aovBand", title: "What's a typical order worth?", sub: "Stores at different price points convert very differently.", cols: 2, opts: [["< ₹500", "Under ₹500"], ["₹500–₹2,000", "₹500 to ₹2,000"], ["₹2,000–₹5,000", "₹2,000 to ₹5,000"], ["₹5,000+", "Over ₹5,000"]] },
    { id: "goal", title: "What matters most right now?", sub: "Your first tests are ordered around it.", cols: 1, opts: [["conversion", "More orders from the same traffic"], ["aov", "Bigger baskets"], ["ads", "Better return on ad spend"], ["speed", "A faster store"], ["ai", "Showing up in AI answers"], ["repeat", "More repeat buyers"]] },
    { id: "traffic", title: "Where do most visitors come from?", sub: "Paid, search and social visitors need different fixes first.", cols: 2, opts: [["ads", "Paid ads (Meta, Google)"], ["search", "Google search"], ["social", "Instagram and influencers"], ["mix", "A mix, or not sure"]] },
    { id: "visitors", title: "How many people visit this page a month?", sub: "A rough guess is fine. It dates your test plan.", cols: 1, opts: [["5000", "Under 10,000"], ["30000", "10,000 to 50,000"], ["120000", "50,000 to 2 lakh"], ["300000", "Over 2 lakh"], ["", "Not sure"]] },
    { id: "competitors", title: "Who do shoppers compare you with?", sub: "Optional. Add up to two sites and we'll show where they're ahead.", type: "comp" }
  ];
  /* Page audit (CRO core spec): category, device, traffic source, who buys. Nothing else is asked. */
  if (CFG.audit) QS = [
    { id: "category", title: "What do you sell?", sub: "It picks the checks for your category.", cols: 3, opts: CATS.map(function (c) { return [c, c]; }) },
    { id: "device", title: "Where do most shoppers buy?", sub: "We read the page phone first unless you say otherwise.", cols: 2, opts: [["Phone", "Phone"], ["Desktop", "Desktop"], ["Both", "Both"], ["Not sure", "Not sure"]] },
    { id: "trafficA", title: "Where do most visitors come from?", sub: "Visitors from paid ads need more convincing, so their doubts rank higher.", cols: 2, opts: [["paid", "Mostly paid ads"], ["search", "Mostly search"], ["social", "Mostly social or influencer"], ["email", "Mostly email or WhatsApp"], ["direct", "Mostly direct"], ["unsure", "Not sure"]] },
    { id: "buyers", title: "Who mainly buys this?", sub: "Pick up to two, or Not sure. Their doubts decide which changes come first.", cols: 1, multi: 2, opts: [] }
  ];
  /* the category arrived after the quiz moved on: fill it in, and swap a fallback buyer list for the right one */
  function lateCategory() {
    v3Facts();
    var q = QS[qi], inQs = doc.body.getAttribute("data-an-view") === "questions";
    if (q && q.id === "category" && QA.category === undefined && inQs) renderQ(qi, 0);
    if (q && q.multi && CFG.audit && !QA.catPicked && !QA.buyersTouched && S.v3cat && S.auditPersonasCat !== S.v3cat) { if (!QA.category || QA.category === "Other") QA.category = S.v3cat; S.auditPersonasCat = null; loadPersonas(); if (inQs) renderQ(qi, 0); }
  }
  function loadPersonas() {
    var cat = QA.category || S.v3cat || "Other";
    if (S.auditPersonasCat === cat) return;
    S.auditPersonasCat = cat; S.auditPersonas = null; QA.buyers = [];
    v3call("/audit_personas", { url: S.url, category: cat }, 20000).then(function (d) {
      if (S.auditPersonasCat !== cat) return;
      S.auditPersonas = (d && d.personas) || [];
      var q = QS[qi]; if (q && q.multi && doc.body.getAttribute("data-an-view") === "questions") renderQ(qi, 0);
    });
  }
  var QA = {}, qi = 0, advT = 0, liveT = 0;
  var stageEl = $("[data-qz-stage]");
  var ICON_ARROW = '<svg width="14" height="14" aria-hidden="true"><use href="#i-arrow"/></svg>';

  function setupQuestions() {
    QA = { competitors: ["", ""], ad: "" }; qi = 0;
    var pg = $("[data-qz-prog]"); if (pg) pg.innerHTML = QS.map(function () { return "<i></i>"; }).join("");
    var st = $("[data-qz-status]"); st.textContent = "Reading your page"; st.classList.add("live");
    $("[data-qz-url]").textContent = S.host;
    var t0 = $("[data-qz-title]"); t0.textContent = "Opening " + S.host + "…"; t0.classList.remove("desc"); t0.hidden = false;
    $("[data-qz-facts]").innerHTML = "";
    $("[data-qz-shot]").innerHTML = '<div class="wire"><i class="w1"></i><i class="w2"></i><i class="w3"></i><span class="wcta"></span></div><div class="shimmer"></div>';
    var t0 = Date.now(), tm = $("[data-qz-time]");
    clearInterval(liveT);
    liveT = setInterval(function () { if (S.detected) { clearInterval(liveT); return; } tm.textContent = ((Date.now() - t0) / 1000).toFixed(1) + "s"; }, 100);
    stageEl.innerHTML = "";
    renderQ(0, 0);
  }
  /* a service, fintech or software site (no prices, lead-style copy): don't guess a shop category for it */
  function nonStore(p) {
    if (!p) return false;
    var txt = [p.title, p.description, p.heroHeadline, p.primaryCta].join(" ");
    return !!p.lead || (!p.prices && !p.aov && /401\(k\)|retirement|pension|insurance|\bloans?\b|lending|mutual fund|invest(?:ing|ment)|payroll|software|platform|\bsaas\b|book a demo|request a demo|get a quote|clinic|hospital|consult/i.test(txt));
  }
  function v3Facts() {
    $$("[data-qz-facts] li").forEach(function (li) {
      var k = li.querySelector("span"), v = li.querySelector("b"); if (!k || !v) return;
      if (k.textContent === "Category") v.textContent = S.v3cat || "Reading…";
      if (k.textContent === "Checks lined up" && S.v3checks) v.textContent = String(S.v3checks);
      /* audit mode: the price is the product's own, from the page reader; never the old scan's "typical" guess
         (stevemadden.in pumps showed "Typical ₹1,52,975") */
      if (k.textContent === "Prices" && CFG.audit) { k.textContent = "Price"; v.textContent = S.v3price ? money(S.v3price.v, S.v3price.cur) : "Reading…"; }
      else if (k.textContent === "Price" && CFG.audit && S.v3price) v.textContent = money(S.v3price.v, S.v3price.cur);
    });
  }
  function detectedFor(id) {
    if (id === "category" && CFG.v3) return S.v3cat || null;
    var p = (S.detected && S.detected.page) || {};
    if (id === "category") return nonStore(p) ? null : CATS.indexOf(p.category) >= 0 ? p.category : null;
    if (id === "aovBand") return p.aovBand || null;
    return null;
  }
  function currentVal(q) {
    if (QA[q.id] !== undefined) return QA[q.id];
    var d = detectedFor(q.id);
    if (d) return d;
    if (q.id === "goal") return "conversion";
    if (q.id === "traffic") return "mix";
    if (q.id === "device") return "Phone";
    if (q.id === "trafficA") return "unsure";
    return undefined;
  }
  function qHtml(q, i) {
    var h = '<span class="qz-num">' + (i + 1) + ICON_ARROW + '</span><h2 class="qz-title" id="qz-title">' + esc(q.title) + '</h2><p class="qz-sub">' + esc(q.sub) + "</p>";
    if (q.type === "comp") {
      h += '<div class="qz-comp">' + [0, 1].map(function (k) {
        return '<label class="an-input qz-inp"><span class="pfx">https://</span><span class="sr-only">Competitor ' + (k + 1) + '</span><input type="text" inputmode="url" autocapitalize="none" spellcheck="false" data-qz-comp="' + k + '" placeholder="' + (k ? "another.com" : "competitor.com") + '" value="' + esc(QA.competitors[k] || "") + '"></label>';
      }).join("") + '</div><label class="an-input qz-inp qz-ad"><span class="sr-only">One of your ad headlines</span><input type="text" maxlength="160" data-qz-ad placeholder="Optional: paste one ad headline and we\'ll check the page matches it" value="' + esc(QA.ad || "") + '"></label><div class="an-err" data-qz-err role="alert"></div><div class="qz-go"><button class="btn btn-primary qz-start" type="button" data-qz-start>Start my analysis ' + ICON_ARROW + '</button><span class="qz-enter">or press <kbd>Enter</kbd></span></div>';
      return h;
    }
    if (q.multi) {
      var L = S.auditPersonas, sel = QA.buyers || [];
      if (!L) h += '<div class="qz-det">' + ICON_SPARK + "<span>Loading the buyer types for this category…</span></div>";
      var mo = (L || []).map(function (p) { return [p.id, p.label, p.worry]; }).concat([["unsure", "Not sure", ""]]);
      h += '<div class="qz-opts c1" role="group" aria-labelledby="qz-title">' + mo.map(function (o, k) {
        var on = o[0] === "unsure" ? (!sel.length && !!QA.buyersTouched) : sel.indexOf(o[0]) >= 0;
        return '<button type="button" class="qz-opt' + (on ? " on" : "") + '" role="checkbox" aria-checked="' + on + '" data-v="' + esc(o[0]) + '"><kbd>' + String.fromCharCode(65 + k) + "</kbd><span>" + esc(o[1]) + (o[2] ? '<small style="display:block;opacity:.7;font-size:12.5px;margin-top:3px">' + esc(o[2]) + "</small>" : "") + '</span><i class="tick">' + ICON_CHECK + "</i></button>";
      }).join("") + "</div>";
      h += '<div class="qz-go"><button class="btn btn-light btn-sm qz-ok" type="button" data-qz-ok>OK ' + ICON_CHECK + '</button><span class="qz-enter">press <kbd>Enter</kbd></span></div>';
      return h;
    }
    var det = detectedFor(q.id), cur = currentVal(q);
    var dp = (S.detected && S.detected.page) || {};
    if (q.id === "category" && nonStore(dp)) h += '<div class="qz-det">' + ICON_SPARK + "<span>This looks like a service or software site, not a store, so we haven't guessed a category. Pick the closest one, or skip.</span></div>";
    else if (det) h += '<div class="qz-det">' + ICON_SPARK + "<span>We read you as <b>" + esc(q.id === "aovBand" ? bandLabel(det) : det) + "</b>. Keep it or pick another.</span></div>";
    else if (q.id === "aovBand" && dp.aov && !rupees(dp.currency)) h += '<div class="qz-det">' + ICON_SPARK + "<span>Your page shows prices in " + esc(dp.currency) + " (about <b>" + esc(money(dp.aov, dp.currency)) + "</b>), so pick the closest rupee band yourself.</span></div>";
    h += '<div class="qz-opts c' + q.cols + '" role="radiogroup" aria-labelledby="qz-title">' + q.opts.map(function (o, k) {
      var on = cur !== undefined && String(cur) === String(o[0]);
      return '<button type="button" class="qz-opt' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-v="' + esc(o[0]) + '"><kbd>' + String.fromCharCode(65 + k) + "</kbd><span>" + esc(o[1]) + "</span>" + (det && String(det) === String(o[0]) ? '<em>Detected</em>' : "") + '<i class="tick">' + ICON_CHECK + "</i></button>";
    }).join("") + "</div>";
    h += '<div class="qz-go"><button class="btn btn-light btn-sm qz-ok" type="button" data-qz-ok>OK ' + ICON_CHECK + '</button><span class="qz-enter">press <kbd>Enter</kbd></span></div>';
    return h;
  }
  function renderQ(i, dir) {
    var q = QS[i];
    if (q.multi && CFG.audit) loadPersonas();
    var old = stageEl.firstElementChild;
    var el = doc.createElement("div");
    el.className = "qz-q" + (dir ? (dir > 0 ? " from-b" : " from-t") : "");
    el.innerHTML = qHtml(q, i);
    if (!dir) stageEl.innerHTML = ""; /* a re-render replaces everything, including a question still sliding out */
    else if (old) {
      [].slice.call(stageEl.children).forEach(function (c) { if (c !== old) c.parentNode.removeChild(c); });
      old.classList.add(dir > 0 ? "to-t" : "to-b"); setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, reduced ? 0 : 340);
    }
    stageEl.appendChild(el);
    if (dir) requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove("from-b", "from-t"); }); });
    $$("[data-qz-prog] i").forEach(function (b, k) { b.className = k < i ? "done" : k === i ? "cur" : ""; });
    $("[data-qz-count]").textContent = (i + 1) + " of " + QS.length;
    var back = $("[data-qz-back]"); back.style.visibility = i === 0 ? "hidden" : "visible";
    setTimeout(function () {
      var f = q.type === "comp" ? $("[data-qz-comp='0']", el) : ($(".qz-opt.on", el) || $(".qz-opt", el));
      if (f && doc.body.getAttribute("data-an-view") === "questions") { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
    }, reduced ? 0 : 360);
  }
  function choose(v) {
    var q = QS[qi]; if (!q || q.type === "comp") return;
    if (q.multi) {
      var sl = (QA.buyers || []).slice(); QA.buyersTouched = true;
      if (v === "unsure") sl = []; else { var ix = sl.indexOf(v); if (ix >= 0) sl.splice(ix, 1); else { sl.push(v); if (sl.length > q.multi) sl.shift(); } }
      QA.buyers = sl; renderQ(qi, 0); return;
    }
    QA[q.id] = v;
    if (q.id === "category") QA.catPicked = true; // a tap is the shopper's own choice; OK on the default is not
    /* a category other than the detected one changes every check and buyer type: show it and wait for OK, no auto-advance
       (a stray letter key once audited a Mamaearth moisturiser as jewellery) */
    var detC = q.id === "category" ? detectedFor("category") : null, cur0 = stageEl.lastElementChild, warn = cur0 && cur0.querySelector("[data-qz-swap]");
    if (warn) warn.remove();
    if (detC && v !== detC) {
      warn = doc.createElement("div"); warn.className = "qz-det"; warn.setAttribute("data-qz-swap", "");
      warn.innerHTML = ICON_SPARK + "<span>We read this page as <b>" + esc(detC) + "</b>. Switching to <b>" + esc(v) + "</b> changes the checks and buyer types. Press OK to confirm.</span>";
      var go0 = cur0.querySelector(".qz-go"); if (go0) go0.parentNode.insertBefore(warn, go0);
    }
    $$(".qz-opt", stageEl.lastElementChild).forEach(function (b) { var on = b.getAttribute("data-v") === String(v); b.classList.toggle("on", on); b.setAttribute("aria-checked", on); if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } });
    clearTimeout(advT);
    if (detC && v !== detC) return;
    advT = setTimeout(nextQ, reduced ? 60 : 420);
  }
  function nextQ() {
    clearTimeout(advT);
    var q = QS[qi];
    if (q && q.type !== "comp" && QA[q.id] === undefined) { var c = currentVal(q); if (c !== undefined) QA[q.id] = c; }
    /* audit mode: the category picks the checks and the buyer types, so it cannot be skipped */
    if (q && q.id === "category" && CFG.audit && !QA.category) {
      var cur = stageEl.lastElementChild, hint = cur && cur.querySelector("[data-qz-need]");
      if (cur && !hint) { hint = doc.createElement("div"); hint.className = "qz-det"; hint.setAttribute("data-qz-need", ""); hint.innerHTML = ICON_SPARK + "<span>Pick what you sell, so we use the right checks and buyer types.</span>"; var go = cur.querySelector(".qz-opts"); if (go) go.parentNode.insertBefore(hint, go); }
      return;
    }
    if (qi < QS.length - 1) { qi++; renderQ(qi, 1); } else finishQs(false);
  }
  function prevQ() { clearTimeout(advT); if (qi > 0) { qi--; renderQ(qi, -1); } }
  function finishQs(skip) {
    var det = (S.detected && S.detected.page) || {};
    var comps = [], bad = false;
    if (!skip) {
      (QA.competitors || []).forEach(function (v) {
        if (!String(v || "").trim()) return;
        var u = normalizeInput(v);
        if (!u) { bad = true; return; }
        if (hostOf(u) !== S.host && !comps.some(function (c) { return hostOf(c) === hostOf(u); })) comps.push(u);
      });
    }
    if (bad) { var er = $("[data-qz-err]"); if (er) er.textContent = "Check the address: it should look like competitor.com."; return; }
    S.inputs = {
      category: skip ? (nonStore(det) ? "" : det.category || "") : (QA.category || (nonStore(det) ? "" : det.category) || ""),
      aovBand: skip ? (det.aovBand || "") : (QA.aovBand || det.aovBand || ""),
      goal: skip ? "conversion" : (QA.goal || "conversion"),
      visitors: skip ? 0 : (+QA.visitors || 0),
      catYou: !skip && (CFG.v3 ? !!QA.catPicked : !!QA.category),
      traffic: skip ? "" : (QA.traffic || ""),
      ad: skip ? "" : String(QA.ad || "").replace(/\s+/g, " ").trim().slice(0, 160),
      competitors: comps.slice(0, 2),
      device: skip ? "Phone" : (QA.device || "Phone"),
      trafficA: skip || !QA.trafficA || QA.trafficA === "unsure" ? "" : QA.trafficA,
      personas: skip ? [] : (QA.buyers || []).slice(0, 2)
    };
    if (S.inputs.category === "Other") S.inputs.category = "";
    runScan();
  }
  if (stageEl) {
    stageEl.addEventListener("click", function (e) {
      var b = e.target.closest(".qz-opt"); if (b) { choose(b.getAttribute("data-v")); return; }
      if (e.target.closest("[data-qz-ok]")) { nextQ(); return; }
      if (e.target.closest("[data-qz-start]")) finishQs(false);
    });
    stageEl.addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-qz-comp");
      if (k != null) { QA.competitors[+k] = e.target.value; var er = $("[data-qz-err]"); if (er) er.textContent = ""; }
      if (e.target.hasAttribute && e.target.hasAttribute("data-qz-ad")) QA.ad = e.target.value;
    });
  }
  var qBack = $("[data-qz-back]"), qSkipAll = $("[data-qz-skip]");
  if (qBack) qBack.addEventListener("click", prevQ);
  if (qSkipAll) qSkipAll.addEventListener("click", function () { finishQs(true); });
  doc.addEventListener("keydown", function (e) {
    if (doc.body.getAttribute("data-an-view") !== "questions" || e.metaKey || e.ctrlKey || e.altKey) return;
    var q = QS[qi]; if (!q) return;
    var tag = ((e.target && e.target.tagName) || "").toLowerCase();
    if (q.type === "comp") { if (e.key === "Enter") { e.preventDefault(); finishQs(false); } return; }
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "Enter") { e.preventDefault(); nextQ(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      var opts = $$(".qz-opt", stageEl.lastElementChild), at = opts.indexOf(doc.activeElement);
      if (opts.length) { e.preventDefault(); var n = at < 0 ? 0 : (at + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) + opts.length) % opts.length; opts[n].focus(); }
      return;
    }
    if (e.key.length === 1) {
      /* letter shortcuts only for a single deliberate key, never inside fast typing (two keys within 0.4 s) */
      var now = Date.now(), burst = now - (S.lastKeyT || 0) < 400; S.lastKeyT = now;
      if (burst) { clearTimeout(S.keyT); return; }
      var k = e.key.toUpperCase().charCodeAt(0) - 65;
      if (k >= 0 && k < q.opts.length) { e.preventDefault(); var val = q.opts[k][0]; clearTimeout(S.keyT); S.keyT = setTimeout(function () { if (Date.now() - S.lastKeyT >= 380) choose(val); }, 400); }
    }
  });
  function onDetected(r) {
    var p = cleanPage(r.page || {});
    clearInterval(liveT);
    var st = $("[data-qz-status]"); st.textContent = "Page read"; st.classList.remove("live");
    $("[data-qz-time]").textContent = r.lite && r.lite.ttfbMs != null ? "answered in " + r.lite.ttfbMs + "ms" : "";
    $("[data-qz-url]").textContent = (hostOf(r.url) || S.host) + (function () { try { var pa = new URL(r.url).pathname; return pa.length > 1 ? pa : ""; } catch (e) { return ""; } })();
    var tEl = $("[data-qz-title]"), d = String(p.description || "").replace(/\s+/g, " ").trim();
    if (d) { tEl.textContent = d.length > 140 ? d.slice(0, 137).replace(/\s+\S*$/, "") + "…" : d; tEl.classList.add("desc"); tEl.hidden = false; }
    else tEl.hidden = true;
    var conv = r.conversion || {};
    var facts = [["Page", PAGE_TYPE[p.pageType] || "Page"], ["Platform", p.platform || "Not detected"], ["Category", p.category && p.category !== "Other" ? p.category : "Not sure yet"], ["Prices", p.aov ? "Typical " + money(p.aov, p.currency) : p.prices ? plural(p.prices, "price") + " found" : "None found"], ["Checks lined up", conv.applicable ? String(conv.applicable) : "Limited: page loads with JavaScript"]];
    $("[data-qz-facts]").innerHTML = facts.map(function (f, k) { return '<li style="animation-delay:' + (k * 90) + 'ms"><span>' + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b></li>"; }).join("");
    if (CFG.v3) v3Facts();
    var shot = $("[data-qz-shot]"), og = String(p.ogImage || "");
    shot.innerHTML = '<div class="wire on"><span class="wh">' + esc((p.heroHeadline || p.title || "").slice(0, 80)) + '</span><i class="w2"></i><i class="w3"></i><span class="wcta">' + esc(p.primaryCta || "") + "</span></div>";
    if (/^https:\/\//i.test(og)) { var img = new Image(); img.alt = ""; img.onload = function () { shot.insertBefore(img, shot.firstChild); shot.classList.add("has-img"); }; img.src = og; }
    var q = QS[qi];
    if (CFG.v3) v3Facts();
    if (q && (q.id === "category" || q.id === "aovBand") && QA[q.id] === undefined && doc.body.getAttribute("data-an-view") === "questions") renderQ(qi, 0);
  }

  /* ---------------- live scan: agents at work ---------------- */
  var REDUCED = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var STAGES = [
    { id: "open", agent: "reader" }, { id: "structure", agent: "reader" }, { id: "business", agent: "reader" },
    { id: "signals", agent: "conv" }, { id: "barriers", agent: "barrier" }, { id: "speed", agent: "speed" },
    { id: "search", agent: "search" }, { id: "a11y", agent: "a11y" }, { id: "compare", agent: "market" }, { id: "plan", agent: "plan" }
  ];
  var AGENTS = [
    { id: "reader", name: "Reader", role: "Opens and maps your page", c: "#CBBEFD", park: [0.93, 0.12] },
    { id: "conv", name: "Conversion", role: "Runs the conversion checks", c: "#8B6BF7", park: [0.93, 0.24] },
    { id: "barrier", name: "Barriers", role: "Tags what stops buyers", c: "#EF6B57", park: [0.93, 0.36] },
    { id: "speed", name: "Speed", role: "Times your page on a phone", c: "#E5A93D", park: [0.93, 0.48] },
    { id: "search", name: "Search & AI", role: "Checks Google and AI answers", c: "#4CC38A", park: [0.93, 0.6] },
    { id: "a11y", name: "Access", role: "Checks it works for everyone", c: "#7FD1C7", park: [0.93, 0.72] },
    { id: "market", name: "Market", role: "Compares you with your market", c: "#A68EFA", park: [0.93, 0.84] },
    { id: "plan", name: "Planner", role: "Plans your first tests", c: "#F4F3F8", park: [0.93, 0.94] }
  ];
  var AG = {}; AGENTS.forEach(function (a) { AG[a.id] = a; });
  var REGION_OF = {
    hero_single_action: "cta", cta_competition: "cta", cta_copy: "cta", pdp_atc: "cta", pdp_sticky: "cta",
    pdp_price: "price", pdp_anchor: "price", pdp_emi: "price", pdp_bundle: "price",
    pdp_reviews: "reviews", proof_density: "reviews", cat_brandproof: "reviews",
    pdp_trust: "trust", pdp_guarantee: "trust", pdp_ship_returns: "trust", pdp_cod: "trust", pdp_pincode: "trust", pdp_urgency: "trust",
    pdp_faq: "content", pdp_variants: "details", contact: "footer", live_chat: "footer", policies: "footer", address: "footer",
    newsletter: "footer", founder_story: "nav", search: "nav", viewport: "nav", lang: "nav"
  };
  var stState = {}, agState = {}, tickT = 0, feedN = 0, t0Scan = 0, pinN = {}, tally = { fix: 0, pass: 0 }, thinkT = {};

  function regionFor(key) { return REGION_OF[key] || (/^cat_/.test(key) ? "title" : "content"); }
  function fmtT() { var s = Math.floor((Date.now() - t0Scan) / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function clip2(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; }

  function buildStages() {
    stState = {}; agState = {}; pinN = {}; tally = { fix: 0, pass: 0 }; RV = null;
    $$(".ag-real").forEach(function (x) { x.remove(); });
    var cv = $(".ag-canvas"); if (cv) cv.classList.remove("is-real");
    Object.keys(thinkT).forEach(function (k) { clearInterval(thinkT[k]); }); thinkT = {};
    $("[data-ag-roster]").innerHTML = AGENTS.map(function (a) {
      return '<div class="ag-a" data-ag="' + a.id + '" style="--c:' + a.c + '" title="' + esc(a.role) + '"><div class="ag-a-t"><span class="ag-av"><b>' + esc(a.name.charAt(0)) + '</b></span><b class="ag-nm">' + esc(a.name) + '</b></div><span class="ag-st">Queued</span><i class="ag-pb"><em data-ag-pb></em></i><div class="ag-a-s" data-ag-s hidden></div></div>';
    }).join("");
    var fx = $("[data-ag-fx]");
    fx.innerHTML = AGENTS.map(function (a) {
      return '<div class="ag-cur" data-cur="' + a.id + '" style="--c:' + a.c + '"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 1.5 14 7.2 8.6 8.6 6.6 14Z" fill="var(--c)" stroke="#0A0A0C" stroke-width="1.2" stroke-linejoin="round"/></svg><span>' + esc(a.name) + "</span></div>";
    }).join("");
    $("[data-ag-log]").innerHTML = ""; agLine = {}; feedC = { all: 0, fail: 0, pass: 0 }; updFilt(); updNow();
    var nc = $("[data-ag-nowcheck]"); if (nc) nc.hidden = true;
    $("[data-ag-page]").innerHTML = '<div class="pg-loading"><i></i><i></i><i></i></div>';
    $("[data-ag-url]").textContent = "Opening " + S.host + "…";
    updTally(); updAgCount();
  }
  function updTally() {
    $("[data-t-fix]").textContent = tally.fix;
    $("[data-t-pass]").textContent = tally.pass;
    var tot = tally.fix + tally.pass, mf = $("[data-m-fix]"), mp = $("[data-m-pass]");
    if (mf) mf.style.width = (tot ? Math.round(100 * tally.fix / tot) : 0) + "%";
    if (mp) mp.style.width = (tot ? Math.round(100 * tally.pass / tot) : 0) + "%";
  }
  function updAgCount() {
    var done = AGENTS.filter(function (a) { return agState[a.id] === "done"; }).length;
    var run = AGENTS.filter(function (a) { return agState[a.id] === "run"; }).map(function (a) { return a.name; });
    $("[data-t-ag]").textContent = done;
    var q = AGENTS.length - done - run.length, sub = $("[data-t-ag-sub]"); if (sub) sub.textContent = done === AGENTS.length ? "All done" : run.length ? run.length + " working now" : "Starting";
    var bs = $("[data-t-bar-sub]"); if (bs) bs.textContent = agState.barrier === "done" ? "Tagged from your page" : agState.barrier === "run" ? "Tagging what stops buyers" : "Barriers agent queued";
    var sg = $("[data-m-ag]"); if (sg) sg.innerHTML = AGENTS.map(function (a, k) { return '<em class="' + (agState[a.id] === "done" ? "on" : agState[a.id] === "run" ? "run" : "") + '" style="--c:' + a.c + '"></em>'; }).join("");
    $("[data-ag-active]").textContent = done === AGENTS.length ? "All done" : done + " done, " + run.length + " working, " + q + " queued";
  }
  function typeInto(el, text) {
    if (!el) return;
    clearInterval(el._tt);
    if (REDUCED) { el.textContent = text; return; }
    var i = 0; el.textContent = "";
    el._tt = setInterval(function () { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(el._tt); }, 16);
  }
  function setAgent(id, state, text) {
    var row = $('[data-ag="' + id + '"]'); if (!row) return;
    if (state && agState[id] !== state) {
      agState[id] = state;
      row.classList.remove("run", "done", "est");
      row.classList.add(state === "est" ? "done" : state);
      if (state === "est") { row.classList.add("est"); agState[id] = "done"; }
      $(".ag-st", row).textContent = state === "run" ? "Working" : state === "est" ? "Estimated" : state === "done" ? "Done" : "Queued";
      if (state === "done" || state === "est") { var pb = $("[data-ag-pb]", row); if (pb) pb.style.width = "100%"; }
      var cur = $('[data-cur="' + id + '"]');
      if (cur) cur.classList.toggle("on", state === "run");
      if (state !== "run") { clearInterval(thinkT[id]); park(id); }
      updAgCount();
    }
    if (text != null) { typeInto($("[data-ag-s]", row), text); agLine[id] = text; }
    updNow();
  }
  /* the strip under the agent cards: what each working agent is doing right now */
  var agLine = {};
  function updNow() {
    var el = $("[data-ag-now]"); if (!el) return;
    var run = AGENTS.filter(function (a) { return agState[a.id] === "run" && agLine[a.id]; }).slice(0, 3);
    el.innerHTML = run.map(function (a) { return '<div style="--c:' + a.c + '"><b>' + esc(a.name) + "</b><span>" + esc(agLine[a.id]) + "</span></div>"; }).join("");
    el.hidden = !run.length;
  }
  function think(id, lines) {
    clearInterval(thinkT[id]); var k = 0;
    setAgent(id, null, lines[0]);
    thinkT[id] = setInterval(function () { if (agState[id] !== "run") return clearInterval(thinkT[id]); k = (k + 1) % lines.length; setAgent(id, null, lines[k]); }, 2600);
  }
  function stage(id, state, detail) {
    stState[id] = state;
    var st = STAGES.filter(function (s) { return s.id === id; })[0]; if (!st) return;
    var mine = STAGES.filter(function (s) { return s.agent === st.agent; });
    var allDone = mine.every(function (s) { return stState[s.id] === "done" || stState[s.id] === "est"; });
    var aState = state === "run" ? "run" : allDone ? (state === "est" ? "est" : "done") : "run";
    setAgent(st.agent, aState, detail != null ? detail : null);
    var done = 0; STAGES.forEach(function (s) { var v = stState[s.id]; done += v === "done" || v === "est" ? 1 : v === "run" ? 0.4 : 0; });
    var pct = Math.round(done / STAGES.length * 100);
    AGENTS.forEach(function (ag) {
      var ms = STAGES.filter(function (s) { return s.agent === ag.id; }); if (!ms.length) return;
      var d = 0; ms.forEach(function (s) { var v = stState[s.id]; d += v === "done" || v === "est" ? 1 : v === "run" ? 0.45 : 0; });
      var pb = $('[data-ag="' + ag.id + '"] [data-ag-pb]'); if (pb) pb.style.width = Math.round(100 * d / ms.length) + "%";
    });
    $("[data-s-bar]").style.width = pct + "%";
    $("[data-s-barwrap]").setAttribute("aria-valuenow", pct);
    $("[data-s-pct]").textContent = pct + "% done";
  }
  function startTimer() {
    t0Scan = Date.now(); var el = $("[data-s-time]");
    clearInterval(tickT);
    tickT = setInterval(function () { el.textContent = fmtT() + " elapsed"; }, 500);
  }
  function setMiniScore(v) {
    var ring = $("[data-s-ring]"), c = $(".val", ring), C = 326.7;
    c.style.strokeDashoffset = v == null ? C : C * (1 - v / 100);
    $("[data-s-score]").textContent = v == null ? "–" : v;
  }
  /* log line: agent tag, time, icon, text */
  var curAgent = "reader";
  function addFeed(kind, title, text, chips, agentId) {
    var a = AG[agentId || curAgent] || AGENTS[0];
    var list = $("[data-ag-log]");
    var prev = $(".ag-l.now", list); if (prev) { prev.classList.remove("now"); $(".bd", prev).textContent = "Info"; }
    var li = doc.createElement("li"), isNow = kind === "act" && S.running;
    li.className = "ag-l " + kind + (isNow ? " now" : "");
    li.style.setProperty("--c", a.c);
    li.innerHTML = '<span class="tm">' + fmtT() + '</span><span class="bd">' + (kind === "pass" ? "Pass" : kind === "fail" ? "Fix" : isNow ? "Now" : "Info") + '</span><span class="tx"><b>' + esc(title) + "</b>" + (text ? '<em>' + esc(text) + "</em>" : "") + (chips ? '<span class="chips">' + chips + "</span>" : "") + '</span><span class="who">' + esc(a.name) + "</span>";
    list.insertBefore(li, list.firstChild);
    feedN++; feedC.all++; if (kind === "fail") feedC.fail++; if (kind === "pass") feedC.pass++; updFilt();
    $("[data-s-count]").textContent = plural(feedN, "line");
    while (list.children.length > 80) list.removeChild(list.lastChild);
    if (isNow) { var nc = $("[data-ag-nowcheck]"); if (nc) { nc.hidden = false; $("[data-ag-nc-t]", nc).textContent = title + (text ? ": " + text : ""); var w = $("[data-ag-nc-a]", nc); w.textContent = a.name; w.style.color = a.c; } }
  }
  var feedC = { all: 0, fail: 0, pass: 0 };
  function updFilt() { ["all", "fail", "pass"].forEach(function (k) { var e = $("[data-fc-" + k + "]"); if (e) e.textContent = feedC[k]; }); }
  doc.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ag-filt] [data-f]"); if (!b) return;
    var f = b.getAttribute("data-f"), list = $("[data-ag-log]");
    $$("[data-ag-filt] [data-f]").forEach(function (x) { x.classList.toggle("on", x === b); });
    if (list) list.setAttribute("data-filter", f);
  });
  function barrierChips(ids, lib, max) {
    return (ids || []).slice(0, max || 3).map(function (b) {
      var x = lib.barriers && lib.barriers[b];
      return '<span class="chip b" title="' + esc(x ? tidy(x.description) : "") + '">' + esc(x ? tidy(x.name) : "Buyer doubt") + "</span>"; /* no barrier codes in what shoppers see */
    }).join("");
  }

  /* the page canvas */
  function paintPage(r) {
    var p = cleanPage(r.page || {}), pdp = p.pageType === "PDP";
    var url = (hostOf(r.url) || S.host) + (function () { try { var pa = new URL(r.url).pathname; return pa.length > 1 ? pa : ""; } catch (e) { return ""; } })();
    $("[data-ag-url]").textContent = url;
    $("[data-s-host]").textContent = hostOf(r.url) || S.host;
    var head = esc(clip2(p.heroHeadline || p.title || S.host, 70));
    var cta = esc(clip2(p.primaryCta || "Shop now", 22));
    var price = p.aov ? esc(money(p.aov, p.currency)) : "";
    var stars = '<span class="st">★★★★★</span>';
    var nav = '<div class="pg-nav" data-r="nav"><span class="logo">' + esc((hostOf(r.url) || S.host).split(".")[0]) + '</span><span class="links"><i></i><i></i><i></i><i></i></span><span class="icons"><i></i><i></i></span></div>';
    var foot = '<div class="pg-foot" data-r="footer"><div><i></i><i></i><i></i></div><div><i></i><i></i><i></i></div><div><i></i><i></i></div><div class="nl"><i></i><span></span></div></div>';
    var h;
    if (pdp) {
      h = nav + '<div class="pg-pdp"><div class="pg-img" data-r="img"><div class="thumbs"><i></i><i></i><i></i></div></div><div class="pg-info">' +
        '<div class="pg-crumb"><i></i><i></i></div><div class="pg-title" data-r="title">' + head + '</div><div class="pg-rate" data-r="reviews">' + stars + '<i></i></div>' +
        '<div class="pg-price" data-r="price">' + (price ? "<b>" + price + "</b>" : "<b class=\"sk\"></b>") + '<s></s></div><div class="pg-var" data-r="details"><i></i><i></i><i></i></div>' +
        '<div class="pg-cta" data-r="cta">' + cta + '</div><div class="pg-trust" data-r="trust"><i></i><i></i><i></i></div></div></div>' +
        '<div class="pg-sec" data-r="content"><i></i><i></i><i style="width:60%"></i></div>' + foot;
    } else {
      h = nav + '<div class="pg-hero" data-r="img"><div class="pg-hero-t"><div class="pg-title" data-r="title">' + head + '</div><div class="pg-cta" data-r="cta">' + cta + '</div></div></div>' +
        '<div class="pg-strip" data-r="trust"><i></i><i></i><i></i><i></i></div><div class="pg-grid" data-r="price">' + [0, 1, 2, 3].map(function () { return '<div><span></span><i></i><i style="width:45%"></i></div>'; }).join("") + '</div>' +
        '<div class="pg-rev" data-r="reviews">' + stars + '<i></i><i></i></div><div class="pg-sec" data-r="content"><i></i><i style="width:70%"></i></div>' + foot;
    }
    var pg = $("[data-ag-page]");
    pg.className = "ag-page " + (pdp ? "is-pdp" : "is-home") + (RV ? " hide" : "");
    pg.innerHTML = h;
    var og = String(p.ogImage || "");
    if (/^https:\/\//i.test(og)) {
      var img = new Image(); img.alt = ""; img.onload = function () { var box = $('[data-ag-page] [data-r="img"]'); if (box) { box.style.backgroundImage = 'url("' + og.replace(/"/g, "%22") + '")'; box.classList.add("has-img"); } }; img.src = og;
    }
  }

  /* ---------- warming up: a pixel page assembles while we fetch and render the real one ---------- */
  var warmT = 0, warmLineT = 0;
  function viewDone(ok) { if (S._viewRes) { S._viewRes(!!ok); S._viewRes = null; } }
  function warmStart() {
    var view = $(".ag-view"); if (!view) return;
    var old = $("[data-ag-warm]"); if (old) old.remove();
    var cols = 34, rows = 22, cells = [], mask = [];
    function inMask(c, r) {
      if (r === 1 && c >= 2 && c <= 31) return "nav";
      if (r >= 3 && r <= 13 && c >= 2 && c <= 16) return "img";
      if (r === 4 && c >= 18 && c <= 30) return "title";
      if (r === 5 && c >= 18 && c <= 26) return "title";
      if (r === 7 && c >= 18 && c <= 22) return "star";
      if (r === 9 && c >= 18 && c <= 23) return "price";
      if (r >= 11 && r <= 12 && c >= 18 && c <= 31) return "cta";
      if (r === 14 && (c >= 18 && c <= 31) && c % 5 !== 2) return "trust";
      if ((r === 16 || r === 18) && c >= 2 && c <= 29) return "text";
      if (r === 20 && c >= 2 && c <= 31 && c % 8 < 6) return "foot";
      return "";
    }
    var h = '<div class="ag-warm" data-ag-warm aria-hidden="true"><div class="px" style="--cols:' + cols + '">';
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) { var m = inMask(c, r); h += '<i class="' + (m ? "m " + m : "") + '"></i>'; }
    h += '</div><div class="ag-warm-t"><span class="an-label">Warming up</span><b data-warm-line>Fetching your page</b><span class="ag-warm-dots"><i></i><i></i><i></i></span></div></div>';
    view.insertAdjacentHTML("beforeend", h);
    $(".ag-canvas").classList.add("warming");
    var lit = $$("[data-ag-warm] .px i.m"), all2 = $$("[data-ag-warm] .px i:not(.m)");
    lit.sort(function () { return Math.random() - 0.5; });
    var k = 0;
    clearInterval(warmT);
    warmT = setInterval(function () {
      for (var j = 0; j < 5 && k < lit.length; j++, k++) lit[k].classList.add("on");
      var x = all2[Math.floor(Math.random() * all2.length)]; if (x) { x.classList.add("tw"); setTimeout(function () { x.classList.remove("tw"); }, 500); }
      if (k >= lit.length) { k = 0; lit.forEach(function (q) { q.classList.remove("on"); }); lit.sort(function () { return Math.random() - 0.5; }); }
    }, REDUCED ? 400 : 45);
    var lines = ["Fetching your page", "Removing scripts and trackers", "Rendering it on a 390px phone", "Finding the button, price and reviews", "Briefing the agents"], li = 0;
    clearInterval(warmLineT);
    warmLineT = setInterval(function () { li = Math.min(li + 1, lines.length - 1); var el = $("[data-warm-line]"); if (el) el.textContent = lines[li]; }, 1700);
  }
  function warmEnd() {
    clearInterval(warmT); clearInterval(warmLineT);
    var w = $("[data-ag-warm]"), cv = $(".ag-canvas");
    if (w) { w.classList.add("out"); setTimeout(function () { w.remove(); }, 650); }
    if (cv) cv.classList.remove("warming");
  }

  /* ---------- the real page: fetched without scripts and drawn in a sandboxed frame ---------- */
  var RV = null; // { frame, doc, win, scale, els: {region: element} }
  function fetchView(url) {
    var base = String(CFG.pageView || "").replace(/\/+$/, "");
    if (!base || !win.fetch) return Promise.resolve(null);
    var ctl = win.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;
    return fetch(base + "?url=" + encodeURIComponent(url), { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  /* the page as a real browser drew it (troocro-page-view ?render=1: Cloudflare Browser Rendering, else r.jina.ai).
     A bot-check page ("Just a moment…") counts as a failed render, never as the store's content. */
  function fetchRender(url) {
    var base = String(CFG.pageView || "").replace(/\/+$/, "");
    if (!base || !win.fetch || CFG.render === false) return Promise.resolve(null);
    var ctl = win.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 50000) : 0;
    return fetch(base + "?render=1&url=" + encodeURIComponent(url), { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.html && !/<title>\s*(just a moment|attention required|access denied|verify you are human|are you a robot)/i.test(d.html.slice(0, 3000)) ? d : null; })
      .catch(function () { return null; });
  }
  /* ---------- the live read: the same page WITH its scripts, run in a hidden frame that has no access to this page
     (sandbox without allow-same-origin), so reviews and text the store draws with JavaScript can be read ---------- */
  function livePrelude() {
    /* storage and cookies throw in a sandboxed frame; give the store's scripts harmless in-memory stand-ins */
    var mem = function () { var o = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; }, setItem: function (k, v) { o[k] = String(v); }, removeItem: function (k) { delete o[k]; }, clear: function () { o = {}; }, key: function (i) { return Object.keys(o)[i] || null; }, get length() { return Object.keys(o).length; } }; };
    try { Object.defineProperty(window, "localStorage", { value: mem(), configurable: true }); } catch (e) { /* keep */ }
    try { Object.defineProperty(window, "sessionStorage", { value: mem(), configurable: true }); } catch (e) { /* keep */ }
    try { Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true }); } catch (e) { /* keep */ }
    var jar = {};
    try { Object.defineProperty(document, "cookie", { configurable: true, get: function () { return Object.keys(jar).map(function (k) { return k + "=" + jar[k]; }).join("; "); }, set: function (v) { var kv = String(v).split(";")[0], i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1); } }); } catch (e) { /* keep */ }
    /* routers (Vue, React) fall back to location.assign when replaceState throws in a sandbox, which sends the copy away: let it fail quietly */
    try { ["pushState", "replaceState"].forEach(function (k) { var o = History.prototype[k]; History.prototype[k] = function () { try { return o.apply(this, arguments); } catch (e) { return undefined; } }; }); } catch (e) { /* keep */ }
    window.alert = window.confirm = window.prompt = function () { return null; };
    window.open = function () { return null; };
  }
  function liveCollector(ID) {
    var t0 = Date.now(), sent = false, y = 0, last = -1, calm = 0, started = false;
    function q(sel) { try { return Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (e) { return []; } }
    function it(el) { try { return (el && el.innerText) || ""; } catch (e) { return ""; } }
    function num(v) { var m = String(v == null ? "" : v).replace(/,/g, "").match(/\d+(?:\.\d+)?/); return m ? +m[0] : 0; }
    /* this product's own review count: product schema first, then a badge near the title, then the reviews widget.
       Badges inside carousels, "you may also like" cards or store-wide counters belong to other products. */
    function reviews() {
      var h1 = document.querySelector("h1"), hy = h1 ? h1.getBoundingClientRect().top + window.scrollY : 0, cand = [], k = 0;
      var OTHER = "[class*=carousel], [class*=all-reviews], [class*=medal], [class*=recommend], [class*=related], [class*=upsell], [class*=complementary], [class*=product-card], [class*=card-product], [class*=product-item], [class*=grid-product], [class*=card__], footer, a[href*='/products/']";
      function other(el) { try { return !!(el.closest && el.closest(OTHER)); } catch (e) { return false; } }
      function near(el) { var y = el.getBoundingClientRect().top + window.scrollY; return Math.abs(y - hy) < 1400; }
      function add(el, c, r, app, pri) { if (c === "" || c == null) return; c = num(c); r = num(r); if (c > 5e6) return; cand.push({ c: c, r: r > 0 && r <= 5 ? r : 0, app: app, pri: pri, k: k++ }); }
      q("script[type='application/ld+json']").forEach(function (s) {
        var d; try { d = JSON.parse(s.textContent); } catch (e) { return; }
        (function walk(o, n) {
          if (!o || typeof o !== "object" || n > 6) return;
          var t = [].concat(o["@type"] || []).join(" ");
          if (/Product/.test(t) && o.aggregateRating) add(null, o.aggregateRating.reviewCount || o.aggregateRating.ratingCount, o.aggregateRating.ratingValue, "schema", 0);
          for (var x in o) if (o[x] && typeof o[x] === "object") walk(o[x], n + 1);
        })(d, 0);
      });
      q("[data-number-of-reviews], [data-raters], [data-reviews-count], [data-review-count]").forEach(function (e) {
        if (other(e)) return;
        var c = e.getAttribute("data-number-of-reviews") || e.getAttribute("data-raters") || e.getAttribute("data-reviews-count") || e.getAttribute("data-review-count");
        var app = e.hasAttribute("data-number-of-reviews") ? "Judge.me" : e.hasAttribute("data-raters") ? "Loox" : "";
        var widget = /rev-widg|review-widget|reviews-widget/i.test(e.className || "");
        if (near(e)) add(e, c, e.getAttribute("data-average-rating") || e.getAttribute("data-rating"), app, 1); else if (widget) add(e, c, e.getAttribute("data-average-rating"), app, 2);
      });
      q("[class*=review], [class*=Review], [class*=rating], [class*=Rating], [id*=review], [class*=yotpo], [class*=okendo], [class*=oke-], [class*=stamped], [class*=jdgm], [class*=star]").slice(0, 500).forEach(function (e) {
        if (other(e) || !near(e)) return;
        var t = it(e); if (!t || t.length > 160) return;
        var m = t.match(/(\d[\d,]*)\s*\+?\s*(?:verified\s+)?(?:reviews?|ratings?)\b/i), m2 = t.match(/\b([1-5](?:\.\d{1,2})?)\s*(?:\/\s*5|★|stars?)?\s*\((\d[\d,]*)\)/), r = t.match(/\b([1-5](?:\.\d{1,2})?)\s*(?:\/\s*5|out of 5|stars?|★)/i);
        if (m) add(e, m[1], r ? r[1] : 0, "", 3); else if (m2) add(e, m2[2], m2[1], "", 3);
      });
      /* last resort: the block around the product name, e.g. "4.6/5 (10)" with no review class on it */
      if (h1 && !cand.length) {
        var box = h1; for (var up = 0; up < 4 && box.parentElement; up++) { box = box.parentElement; if (it(box).length > 220) break; }
        var bt = it(box).slice(0, 3000), m3 = bt.match(/(\d[\d,]*)\s*\+?\s*(?:verified\s+)?(?:reviews?|ratings?)\b/i), m4 = bt.match(/\b([1-5](?:\.\d{1,2})?)\s*(?:\/\s*5|★|stars?)\s*\|?\s*\(?(\d[\d,]*)\)?/i), r3 = bt.match(/\b([1-5](?:\.\d{1,2})?)\s*(?:\/\s*5|out of 5|stars?|★)/i);
        if (m3) add(box, m3[1], r3 ? r3[1] : 0, "", 4); else if (m4) add(box, m4[2], m4[1], "", 4);
      }
      cand.sort(function (a, b) { return (b.c > 0) - (a.c > 0) || a.pri - b.pri || a.k - b.k; });
      var best = cand[0] || { c: 0, r: 0, app: "" };
      var zero = !best.c && /be the first to (?:write a )?review|no reviews yet|write the first review|\b0 reviews\b|reviews \(0\)|hasn.t received any reviews|there are no reviews|^\s*no reviews\s*$/im.test(it(document.body).slice(0, 200000));
      /* the star histogram (5 down to 1), when the widget shows one: five counts in a row that add up to the review count */
      var hist = null;
      if (best.c >= 20) {
        var body = it(document.body), re = /(?:^|\n)\s*([\d,]+)\s*\n\s*([\d,]+)\s*\n\s*([\d,]+)\s*\n\s*([\d,]+)\s*\n\s*([\d,]+)\s*(?=\n|$)/g, mh;
        while ((mh = re.exec(body))) {
          var hv = mh.slice(1, 6).map(num), sum = hv.reduce(function (a, b) { return a + b; }, 0);
          if (sum && Math.abs(sum - best.c) <= Math.max(1, best.c * 0.01)) { hist = hv[0] >= hv[4] ? hv : hv.slice().reverse(); break; }
          re.lastIndex = mh.index + 1;
        }
      }
      return { count: best.c, rating: best.c ? best.r : 0, app: best.app, zero: zero, hist: hist };
    }
    function apps() {
      var w = window, a = [];
      if (w.jdgm || q("[class*=jdgm]").length) a.push("Judge.me");
      if (w.yotpo || w.yotpoWidgetsContainer || q("[class*=yotpo]").length) a.push("Yotpo");
      if (w.okeWidgetApi || q("[class*=okendo], [class*=oke-]").length) a.push("Okendo");
      if (w.loox || q("[class*=loox]").length) a.push("Loox");
      if (w.StampedFn || q("[class*=stamped]").length) a.push("Stamped");
      return a;
    }
    /* the first phone screen as a shopper sees it, scripts and all: what's covering it, promo strips, stickers, price and button */
    var FIRST = null;
    function firstProbe() {
      if (FIRST || !document.body || (window.scrollY || 0) > 5) return;
      try {
        var vw = window.innerWidth || 390, vh = window.innerHeight || 844, A = vw * vh, cover = 0, overlays = 0, img = 0, chars = 0, price = false, cta = false, bands = [], stk = [];
        var ATC = /add to (cart|bag|basket)|buy (it )?now|add to order|order now|shop now/i, OFF = /\d+\s?%|\boff\b|free|sale|code|deal|launch|offer|save|cashback|shop now|₹|rs\.?\s?\d/i, STK = /\d+\s?%|\boff\b|sold|best ?seller|bestseller|\bnew\b|\bsale\b|save|trending|selling fast|limited/i;
        function solid(cs) { var m = String(cs.backgroundColor || "").match(/rgba?\(([^)]+)\)/); if (!m) return false; var p = m[1].split(","); return p.length < 4 || +p[3] > 0.5; }
        q("body *").slice(0, 3000).forEach(function (el) {
          var r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
          var cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.1) return;
          var vis = Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top)) * Math.max(0, Math.min(vw, r.right) - Math.max(0, r.left));
          var own = ""; for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
          own = own.replace(/\s+/g, " ").trim(); if (own) chars += own.length;
          /* something floating over the page (pop-up, video bubble, offer box), not the header or a bottom buy bar */
          if (cs.position === "fixed" && cs.pointerEvents !== "none" && vis > A * 0.04 && r.top > 64 && r.top < vh * 0.8 && (solid(cs) || el.querySelector("img,video,iframe"))) {
            var tx = it(el); if (!ATC.test(tx.slice(0, 400))) { overlays++; cover += vis; }
          }
          /* promo strips near the top: full-width bands with offer words (merged, so one strip counts once) */
          if (r.top < 280 && r.width >= vw * 0.9 && r.height >= 16 && r.height <= 70 && OFF.test(it(el).slice(0, 300))) {
            var hit = bands.some(function (bd) { return r.top < bd[1] + 4 && r.bottom > bd[0] - 4; }); if (!hit) bands.push([r.top, r.bottom]);
          }
          /* offer stickers: short badge text; parts of one badge are merged */
          if (own && own.length < 40 && STK.test(own) && r.width < 220 && r.height < 70 && r.top > 60 && !(r.top < 280 && r.width >= vw * 0.9)) {
            var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            if (!stk.some(function (p) { return Math.abs(p[0] - cx) < 90 && Math.abs(p[1] - cy) < 36; })) stk.push([cx, cy]);
          }
          if ((el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "PICTURE" || el.tagName === "CANVAS") && vis > img) img = vis;
          if (!price && own && /(₹|rs\.?|\$|£|€)\s?\d/i.test(own) && r.bottom < vh) price = true;
          if (!cta && (el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button" || el.type === "submit") && r.bottom < vh && r.width > 80 && ATC.test(it(el).slice(0, 60))) cta = true;
        });
        FIRST = { overlays: overlays, cover: Math.min(1, Math.round(100 * cover / A) / 100), strips: Math.min(bands.length, 6), stickers: Math.min(stk.length, 12), img: Math.round(100 * img / A) / 100, chars: chars, price: price, cta: cta };
      } catch (e) { FIRST = null; }
    }
    /* a snapshot of what's on screen; it never changes the page, so it can run as often as needed */
    var DROP = "header, nav, footer, [role=dialog], [aria-modal=true], [class*=popup], [class*=modal], [class*=drawer], [id*=drawer], [class*=announcement], [class*=cookie], [class*=recommend], [class*=related], [class*=upsell], [class*=complementary], [class*=product-card], [class*=card-product], [class*=product-item], [class*=all-reviews], [class*=carousel]";
    function snap(why, fin) {
      if (sent || !document.body) return;
      if (fin) sent = true;
      var rv = {}, ap = [], all = "", h1 = "", main = "";
      try { rv = reviews(); } catch (e) { /* skip */ }
      try { ap = apps(); } catch (e) { /* skip */ }
      try { all = it(document.body); var h = document.querySelector("h1"); h1 = h ? it(h).replace(/\s+/g, " ").trim() : ""; } catch (e) { /* skip */ }
      try {
        var m = document.querySelector("main, #MainContent, [role=main]") || document.body, hh = document.querySelector("h1"), outer = [];
        main = it(m);
        q(DROP).forEach(function (n) { if (m.contains(n) && n !== m && !(hh && n.contains(hh)) && !outer.some(function (o) { return o.contains(n); })) outer.push(n); });
        outer.forEach(function (n) { var x = it(n); if (x.length > 12) main = main.split(x).join("\n"); });
      } catch (e) { main = all; }
      firstProbe();
      try { parent.postMessage({ type: "troo-live", id: ID, fin: !!fin, why: why, ms: Date.now() - t0, title: document.title, h1: h1, all: all.slice(0, 60000), main: main.slice(0, 40000), rv: rv, apps: ap, first: FIRST, tapped: TAPPED.join(" | ").slice(0, 7000) }, "*"); } catch (e) { /* gone */ }
    }
    /* taps (v14.2): open the tabs, accordions and "size guide / price breakup" style controls a shopper would tap, and keep the text
       each one reveals. Only controls that open content on the page: no links that leave it, no cart, login, share or form buttons. */
    var TAPPED = [], tapping = false;
    var TAP_RX = /price ?break|break ?up|size ?(guide|chart)|ring size|find (your|my) size|product (details|info|description)|specification|specs\b|description|details|delivery|shipping|return|exchange|warranty|guarantee|ingredient|how to use|directions|care|know more|view more|read more|see more|show more|more info|faq|composition|material|fabric|dimension|measurement|certific|nutrition|in the box|what'?s inside|assurance|policy|offers?\b/i;
    var TAP_NO = /add to (bag|cart)|buy now|check ?out|login|log in|sign ?(in|up)|wishlist|share|notify|subscribe|write a review|apply|search|close|cancel|pay|book|call|whatsapp|chat|language|country|currency|menu/i;
    function lines(t) { var o = {}; String(t || "").split(/\n+/).forEach(function (x) { x = x.replace(/\s+/g, " ").trim(); if (x.length > 1) o[x] = 1; }); return o; }
    function taps(done) {
      if (tapping) return; tapping = true;
      var cands = [], seenT = {};
      q("[role=tab],[aria-expanded=false],summary,button,[role=button],a,[data-toggle],[data-bs-toggle],[class*=accordion] [class*=title],[class*=accordion] [class*=header],[class*=tab] li,[class*=tab] span,[class*=collapsible]").slice(0, 2500).forEach(function (el) {
        try {
          if (cands.length >= 16) return;
          var tx = it(el).replace(/\s+/g, " ").trim(); if (!tx || tx.length > 44 || !TAP_RX.test(tx) || TAP_NO.test(tx) || seenT[tx.toLowerCase()]) return;
          if (el.closest && el.closest("header,nav,footer,[class*=footer],[class*=header] nav,form")) return;
          if (el.tagName === "A") { var hr = el.getAttribute("href") || ""; if (hr && !/^(#|javascript:)/i.test(hr)) return; }
          if (el.type === "submit") return;
          var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
          seenT[tx.toLowerCase()] = 1; cands.push({ el: el, tx: tx });
        } catch (e) { /* skip */ }
      });
      /* React and Vue tabs are often plain divs with a click handler: take short pointer-cursor elements too */
      if (cands.length < 16) q("div,span,p,li,h2,h3,h4,h5,label").slice(0, 5000).forEach(function (el) {
        try {
          if (cands.length >= 16 || el.children.length > 3) return;
          var tx = it(el).replace(/\s+/g, " ").trim(); if (!tx || tx.length > 44 || !TAP_RX.test(tx) || TAP_NO.test(tx) || seenT[tx.toLowerCase()]) return;
          if (el.closest && el.closest("header,nav,footer,[class*=footer],form,a[href]:not([href^='#'])")) return;
          if (getComputedStyle(el).cursor !== "pointer") return;
          var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
          seenT[tx.toLowerCase()] = 1; cands.push({ el: el, tx: tx });
        } catch (e) { /* skip */ }
      });
      var i = 0;
      (function next() {
        if (i >= cands.length || sent) { tapping = false; return done(); }
        var c = cands[i++], before = lines(it(document.body));
        try { c.el.scrollIntoView({ block: "center" }); c.el.click(); } catch (e) { /* skip */ }
        setTimeout(function () {
          try {
            var after = lines(it(document.body)), add = Object.keys(after).filter(function (x) { return !before[x]; });
            if (add.length) TAPPED.push(c.tx + ": " + add.join(". ").slice(0, 900));
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          } catch (e) { /* skip */ }
          setTimeout(next, 120);
        }, 520);
      })();
    }
    function tick() {
      if (sent) return;
      var de = document.documentElement, H = Math.max(de.scrollHeight || 0, document.body ? document.body.scrollHeight : 0), vh = window.innerHeight || 844;
      y = Math.min(H, y + 640); window.scrollTo(0, y);
      var n = it(document.body).length; if (Math.abs(n - last) < 40) calm++; else calm = 0; last = n;
      if ((y + vh >= H - 10 && calm >= 4) || Date.now() - t0 > 12000) { taps(function () { window.scrollTo(0, 0); setTimeout(function () { snap("done", true); }, 300); }); return; }
      if (++ticks % 4 === 0) snap("progress", false);
      setTimeout(tick, 420);
    }
    var ticks = 0;
    function start() { if (started) return; started = true; setTimeout(function () { firstProbe(); tick(); }, 1500); }
    if (document.readyState === "complete") start(); else { window.addEventListener("load", start); document.addEventListener("DOMContentLoaded", function () { setTimeout(function () { snap("early", false); }, 600); setTimeout(start, 5000); }); }
    setTimeout(start, 8000);
    /* some stores' scripts send the frame somewhere else (they read the address as about:srcdoc); keep what was read before it goes */
    window.addEventListener("pagehide", function (e) { if (e.isTrusted) snap("leaving", true); });
    window.addEventListener("beforeunload", function (e) { if (e.isTrusted) snap("progress", false); });
    window.addEventListener("message", function (e) { if (e.data && e.data.type === "troo-live-now" && e.data.id === ID) snap("asked", true); });
  }
  /* A/B-test and geo-redirect scripts send the copy to another address (they read it as about:srcdoc); switch them off in the copy */
  var LIVE_OFF_SRC = /shoplift|intelligems|abconvert|elevateab|visually\.io|convertcdn|cdn-3\.convertexperiments|optimizely|vwo\.com|wingify|redirect|geoip|geolocat|geo-?target|(?:^|[-_./])sso(?:[-_.]|$)|session[-_]bridge|login[-_.]|auth[-_]init/i;
  var LIVE_OFF_INLINE = /shoplift|intelligems|queueRedirect|_vwo_code|optimizely|geo-?redirect|sso_bridge|sso_continue|page-load-sso/i;
  function liveDoc(html, id) {
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, function (m, attrs, body) {
      var src = (attrs.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || "";
      if (src ? LIVE_OFF_SRC.test(src) : LIVE_OFF_INLINE.test(body.slice(0, 2500))) return '<script type="text/plain" data-troo-off="1"></' + "script>";
      return m;
    });
    /* both go first in <head>, before any of the store's scripts */
    var pre = "<script>(" + livePrelude.toString() + ")();(" + liveCollector.toString() + ")(" + JSON.stringify(id) + ");<\/script>";
    var hm = /<head\b[^>]*>/i.exec(html);
    return hm ? html.slice(0, hm.index + hm[0].length) + pre + html.slice(hm.index + hm[0].length) : pre + html;
  }
  function liveRead(url) {
    var base = String(CFG.pageView || "").replace(/\/+$/, ""), t0 = Date.now();
    if (!base || !win.fetch || CFG.live === false) return Promise.resolve(null);
    var ctl = win.AbortController ? new AbortController() : null, ta = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;
    return fetch(base + "?raw=1&url=" + encodeURIComponent(url), { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(ta); return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.html || v.html.length < 300) return { ok: false, why: "fetch" };
        S.rawHtml = v.html; // the page's own HTML with its scripts: its product data (price breakup, rating) feeds the hidden-facts read
        return new Promise(function (res) {
          var id = "tl" + Math.random().toString(36).slice(2), fr = doc.createElement("iframe"), done = false, tA = 0, tB = 0;
          var latest = null, tL = 0;
          function finish(d) {
            if (done) return; done = true; clearTimeout(tA); clearTimeout(tB); clearTimeout(tL); win.removeEventListener("message", on);
            try { fr.remove(); } catch (e) { /* gone */ }
            d = d || latest;
            res(d && String(d.all || "").length > 200 ? Object.assign({ ok: true, total: Date.now() - t0 }, d) : { ok: false, why: latest ? "left" : "timeout" });
          }
          /* progress snapshots are kept; the final one (or the last kept one, if the page leaves or stalls) is the read */
          function on(e) { if (e.source !== fr.contentWindow) return; var d = e.data; if (!d || d.type !== "troo-live" || d.id !== id) return; clearTimeout(tL); if (!latest || String(d.all || "").length >= String(latest.all || "").length * 0.8) latest = d; if (d.fin) finish(d.why === "leaving" ? latest : d); }
          win.addEventListener("message", on);
          fr.setAttribute("sandbox", "allow-scripts");
          fr.setAttribute("allow", "autoplay 'none'; camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; fullscreen 'none'");
          fr.setAttribute("aria-hidden", "true"); fr.setAttribute("title", "Live copy of your page, read in the background"); fr.tabIndex = -1;
          /* it has to sit inside the viewport (invisible) or the browser pauses it and lazy sections never load */
          fr.style.cssText = "position:fixed;right:0;bottom:0;width:390px;height:844px;border:0;opacity:0;pointer-events:none;z-index:-1";
          fr.srcdoc = liveDoc(v.html, id);
          /* a second "load" means a script sent the copy to another page: keep the last snapshot and stop */
          var loads = 0; fr.addEventListener("load", function () { if (++loads > 1) { clearTimeout(tL); tL = setTimeout(function () { finish(null); }, 5000); } });
          doc.body.appendChild(fr);
          tA = setTimeout(function () { try { fr.contentWindow.postMessage({ type: "troo-live-now", id: id }, "*"); } catch (e) { /* gone */ } }, 24000);
          tB = setTimeout(function () { finish(null); }, 29000);
        });
      })
      .catch(function () { clearTimeout(ta); return { ok: false, why: "fetch" }; });
  }
  win.TrooLive = { read: liveRead };
  function mountReal(v, p) {
    var view = $(".ag-view"), pg = $("[data-ag-page]"); if (!view || !pg) return;
    view.style.height = ""; /* a height set for a phone-sized screen on an earlier scan */
    var W = (S.inputs && S.inputs.device === "Desktop" ? pg.clientWidth : 0) || (view.clientWidth - 70), H = view.clientHeight; /* phone mode: the placeholder is phone-sized, so measure the view */
    /* phone first: the page is shown on a 390px phone unless the shopper said most buyers use desktop */
    var desk = !!(S.inputs && S.inputs.device === "Desktop"), vw = desk ? 1280 : 390, scale, ox = 0, oy = 0, sw = 0, sh = 0, BZ = 11, H2 = H;
    if (desk) scale = W / vw;
    else {
      /* a real phone: a 390 x 844 screen scaled to fit the height, in a bezel, centred; the agents' rail stays outside */
      /* on a phone-sized screen there is no room for the agents' rail: the phone takes the full width and the box
         shrinks to the phone's height (no empty band above and below) */
      var narrow = win.innerWidth < 600; /* a phone-sized window; on wider screens the canvas is phone-width on purpose */
      if (narrow) { W = view.clientWidth; scale = Math.min((W - 2 * BZ - 8) / vw, 1); H = Math.round(844 * scale) + 2 * BZ + 12; view.style.height = H + "px"; }
      else scale = Math.min((H - 2 * BZ - 12) / 844, (W - 2 * BZ - 8) / vw, 1);
      sw = Math.round(vw * scale); sh = Math.round(844 * scale); H2 = sh;
      ox = Math.max(0, Math.round((W - sw - 2 * BZ) / 2)) + BZ; oy = Math.max(0, Math.round((H - sh - 2 * BZ) / 2)) + BZ;
    }
    var fr = doc.createElement("iframe");
    fr.setAttribute("sandbox", "allow-same-origin");
    fr.setAttribute("title", "Your page, as the agents see it");
    fr.setAttribute("tabindex", "-1");
    fr.className = "ag-frame";
    fr.style.width = vw + "px"; fr.style.height = Math.ceil(H2 / scale) + "px"; fr.style.transform = "scale(" + scale + ")";
    fr.srcdoc = v.html;
    var holder = doc.createElement("div"); holder.className = "ag-real" + (desk ? "" : " is-phone");
    if (desk) holder.appendChild(fr);
    else {
      var scr = doc.createElement("div"); scr.className = "ag-screen"; scr.style.width = sw + "px"; scr.style.height = sh + "px"; scr.appendChild(fr); holder.appendChild(scr);
      holder.style.left = (ox - BZ) + "px"; holder.style.top = (oy - BZ) + "px"; holder.style.right = "auto"; holder.style.bottom = "auto";
      holder.style.width = (sw + 2 * BZ) + "px"; holder.style.height = (sh + 2 * BZ) + "px";
    }
    view.insertBefore(holder, pg);
    var done = false;
    function ready() {
      if (done) return; done = true;
      var d, w;
      try { d = fr.contentDocument; w = fr.contentWindow; } catch (e) { holder.remove(); viewDone(false); return; }
      if (!d || !d.body) { holder.remove(); viewDone(false); return; }
      $$("img", d).forEach(function (im) {
        var ds = im.getAttribute("data-src") || im.getAttribute("data-lazy-src") || im.getAttribute("data-original");
        var dss = im.getAttribute("data-srcset");
        if (ds && (!im.getAttribute("src") || /data:image|placeholder|blank/i.test(im.getAttribute("src")))) im.setAttribute("src", ds.replace(/\{width\}/g, "800"));
        if (dss && !im.getAttribute("srcset")) im.setAttribute("srcset", dss.replace(/\{width\}/g, "800"));
        im.removeAttribute("loading");
      });
      setTimeout(function () {
        var text = (d.body.innerText || "").replace(/\s+/g, " ").length;
        var els = findRegions(d, w);
        if (text < 250 || (!els.title && !els.cta)) { holder.remove(); viewDone(false); return; }
        RV = { frame: fr, doc: d, win: w, scale: scale, els: els, H: H2, pins: [], ox: ox, oy: oy, phone: !desk };
        if (!desk) realShot(holder);
        holder.classList.add("on"); pg.classList.add("hide");
        $(".ag-canvas").classList.add("is-real");
        addFeed("act", "Loaded your live page", "Drawn without its scripts, so nothing on your store runs or changes", "", "reader");
        viewDone(true);
      }, 700);
    }
    fr.addEventListener("load", ready);
    setTimeout(ready, 6000);
  }
  /* The copy above is drawn without the store's scripts, so anything a script adds (review stars and counts, offer
     badges) is missing. When the page reader's real phone render arrives (a browser that ran the scripts and waited
     for the page to settle), it is laid over the copy and scrolls with it; the copy stays underneath for positions. */
  function realShot(holder) {
    Promise.resolve(S.auditReadP).then(function (rd) {
      var src = rd && rd.ok && rd.shot;
      if (!RV || !S.running || typeof src !== "string" || !/^data:image\//.test(src)) return;
      var im = new Image(); im.alt = ""; im.className = "ag-shot";
      im.onload = function () {
        if (!RV || !holder.isConnected) return;
        (holder.querySelector(".ag-screen") || holder).appendChild(im); RV.shot = im; placePins();
        requestAnimationFrame(function () { im.classList.add("on"); });
        addFeed("act", "Swapped in the real phone render", "Read in a browser that ran your page's scripts, so review stars and offers show as shoppers see them", "", "reader");
      };
      im.src = src;
    }, function () {});
  }
  function findRegions(d, w) {
    var ATC = /add to (cart|bag|basket)|buy (it )?now|add to order|shop now|order now/i;
    function ok(el, maxTop) {
      if (!el || !el.getBoundingClientRect) return false;
      var r = el.getBoundingClientRect(), cs = w.getComputedStyle(el);
      if (r.width < 24 || r.height < 10 || cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return false;
      return maxTop == null || r.top + w.scrollY < maxTop;
    }
    function first(sel, test, maxTop) {
      var L; try { L = d.querySelectorAll(sel); } catch (e) { return null; }
      for (var i = 0; i < L.length && i < 400; i++) if (ok(L[i], maxTop) && (!test || test(L[i]))) return L[i];
      return null;
    }
    function tx(el) { return (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(); }
    var R = {};
    R.nav = first("header") || first("nav") || first("[class*=header]");
    R.title = first("main h1, h1");
    R.cta = first("button, input[type=submit], a", function (el) { var t = tx(el); return t.length < 40 && ATC.test(t); }, 2400) || first("form[action*='/cart/add'] [type=submit]") ||
      first("a[class*=btn], a[class*=button], button", function (el) { var t = tx(el); return t.length > 2 && t.length < 30; }, 1200);
    R.price = first("[class*=price]", function (el) { var t = tx(el); return /\d/.test(t) && t.length < 90; }, 1800);
    R.reviews = first("[class*=rating], [class*=review], [class*=stars], [class*=jdgm], [class*=yotpo], [class*=loox], [class*=okendo], [class*=stamped]", null, 1800);
    R.details = first("variant-radios, variant-selects, fieldset, select[name*=ption], [class*=variant], [class*=swatch], [class*=option]", null, 2000);
    var TRUSTW = /return|exchange|deliver|ship|cod\b|cash on|genuine|authentic|warrant|secure|guarantee|free|certified|made in|cruelty|dermat/i;
    R.trust = first("[class*=trust], [class*=usp], [class*=icon-with-text], [class*=guarantee], [class*=delivery], [class*=shipping]", function (el) { var t = tx(el); return t.length > 3 && t.length < 300; }, 2600) ||
      first("[class*=badge], [class*=benefit], [class*=feature]", function (el) { var t = tx(el); return t.length < 300 && TRUSTW.test(t); }, 2600);
    R.img = first("main img, img", function (el) { var r = el.getBoundingClientRect(); return r.width > 180 && r.height > 140; }, 1600);
    R.content = first("[class*=description], .rte, [class*=accordion]", function (el) { return tx(el).length > 40; }) || first("main h2");
    R.footer = first("footer") || first("[class*=footer]");
    var fb = { price: "title", reviews: "title", details: "cta", trust: "cta", content: "img", img: "title", nav: "title", title: "cta" };
    Object.keys(fb).forEach(function (k) { if (!R[k]) R[k] = R[fb[k]] || null; });
    return R;
  }
  function realRect(name) {
    if (!RV || !RV.els[name]) return null;
    var b = RV.els[name].getBoundingClientRect(), s = RV.scale, fx = $("[data-ag-fx]");
    var W = fx.clientWidth, H = fx.clientHeight;
    var x = b.left * s + (RV.ox || 0), y = b.top * s + (RV.oy || 0), w = Math.min(b.width * s, W - 74 - Math.max(0, x)), h = Math.min(b.height * s, H * 0.8);
    if (RV.phone) {
      /* keep highlights on the phone's screen: clip to it, and send anything scrolled off it out of view */
      var top = RV.oy, bot = RV.oy + RV.H; w = Math.min(b.width * s, RV.ox + RV.H * 390 / 844 - x);
      if (y + h < top + 4 || y > bot - 4) return { x: x, y: -999, w: Math.max(20, w), h: 14, W: W, H: H };
      if (y < top) { h -= top - y; y = top; } h = Math.min(h, bot - y);
    }
    return { x: Math.max(0, x), y: y, w: Math.max(20, w), h: Math.max(14, h), W: W, H: H };
  }
  /* ---------- camera: one smooth, eased scroll at a time; the agent's cursor glides in step with it ---------- */
  var CAM = { q: Promise.resolve(), at: {} };
  function easeIO(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function camPlan(name) {
    if (!RV || !RV.els[name]) return null;
    var w = RV.win, viewH = RV.H / RV.scale, b = RV.els[name].getBoundingClientRect(), from = w.scrollY;
    var maxY = Math.max(0, Math.max(RV.doc.documentElement.scrollHeight || 0, RV.doc.body ? RV.doc.body.scrollHeight : 0) - viewH);
    var inView = b.top > viewH * 0.06 && b.top + Math.min(b.height, viewH * 0.45) < viewH * 0.9;
    var to = inView ? from : Math.min(maxY, Math.max(0, b.top + from - viewH * 0.26)), dy = Math.abs(to - from) * RV.scale;
    return { from: from, to: to, dur: REDUCED || dy < 3 ? 0 : Math.round(Math.min(1700, 520 + dy * 0.55)) };
  }
  function camRun(pl) {
    return new Promise(function (res) {
      if (!pl || !RV) return res();
      if (!pl.dur) { if (pl.to !== pl.from) RV.win.scrollTo(0, pl.to); placePins(); return res(); }
      var w = RV.win, t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / pl.dur);
        w.scrollTo(0, pl.from + (pl.to - pl.from) * easeIO(k)); placePins();
        if (k < 1) win.requestAnimationFrame(step); else res();
      })(t0);
    });
  }
  /* back to the top of the page, slowly, when the scan ends */
  function camTop() {
    CAM.q = CAM.q.then(function () {
      if (!RV) return;
      var from = RV.win.scrollY, dy = from * RV.scale;
      return camRun({ from: from, to: 0, dur: REDUCED || dy < 3 ? 0 : Math.round(Math.min(1900, 600 + dy * 0.45)) });
    });
    return CAM.q;
  }
  function placePins() {
    if (!RV) return;
    if (RV.shot) RV.shot.style.transform = "translateY(" + (-RV.win.scrollY * RV.scale) + "px)";
    RV.pins.forEach(function (pp) {
      var r = realRect(pp.region); if (!r) return;
      var slot = { bad: 0, warn: 1, test: 2 }[pp.kind] || 0;
      pp.el.style.left = Math.min(r.x + r.w - 10 - slot * 34, r.W - 30) + "px";
      pp.el.style.top = (r.y - 9) + "px";
      pp.el.style.opacity = r.y < -10 || r.y > r.H - 10 ? "0" : "";
    });
    /* highlight boxes stay glued to the part of the page they describe */
    RV.boxes = (RV.boxes || []).filter(function (bx) { return bx.el.isConnected; });
    RV.boxes.forEach(function (bx) { var r = realRect(bx.region); if (r) boxAt(bx.el, r); });
  }
  function regionRect(name) {
    if (RV) return realRect(name);
    var fx = $("[data-ag-fx]"), el = $('[data-ag-page] [data-r="' + name + '"]');
    if (!fx || !el) return null;
    var a = fx.getBoundingClientRect(), b = el.getBoundingClientRect();
    return { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, W: a.width, H: a.height };
  }
  function moveCur(id, x, y) {
    var c = $('[data-cur="' + id + '"]'); if (!c) return;
    c.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function park(id) {
    var fx = $("[data-ag-fx]"), a = AG[id]; if (!fx || !a) return;
    var W = fx.clientWidth, H = fx.clientHeight;
    delete CAM.at[id];
    var c = $('[data-cur="' + id + '"]'); if (c) { c.style.transitionDuration = ""; c.style.transitionTimingFunction = ""; }
    moveCur(id, W * a.park[0] - 40, H * a.park[1] - 8);
  }
  function aim(id, r, spot, dur) {
    var c = $('[data-cur="' + id + '"]');
    if (c) { c.style.transitionDuration = Math.max(550, dur || 0) + "ms"; c.style.transitionTimingFunction = dur ? "cubic-bezier(0.65, 0, 0.35, 1)" : ""; }
    moveCur(id, r.x + r.w * spot[0], r.y + Math.min(r.h * 0.6, 22 + spot[1] * Math.max(0, r.h - 30)));
  }
  /* Move one agent to a region. Moves queue up, so the page never jumps between two places at once.
     Agents working in the background go back to the rail while the camera moves. */
  function goTo(id, region, jitter) {
    CAM.q = CAM.q.then(function () {
      var j = jitter == null ? 0.5 : jitter, spot = [0.25 + 0.5 * Math.random() * j, Math.random()];
      AGENTS.forEach(function (a) { if (a.id !== id && CAM.at[a.id]) park(a.id); });
      CAM.at[id] = region;
      if (!RV) { var r0 = regionRect(region); if (r0) aim(id, r0, spot, 0); return sleep(REDUCED ? 0 : 480); }
      var pl = camPlan(region), r = realRect(region);
      if (r && pl) { r.y -= (pl.to - pl.from) * RV.scale; aim(id, r, spot, pl.dur); }
      return camRun(pl).then(function () { var r2 = realRect(region); if (r2) aim(id, r2, spot, 300); return sleep(pl && pl.dur ? 120 : 260); });
    });
    return CAM.q;
  }
  function boxAt(b, r) { b.style.left = (r.x - 3) + "px"; b.style.top = (r.y - 3) + "px"; b.style.width = (r.w + 6) + "px"; b.style.height = (r.h + 6) + "px"; }
  function track(b, region) { if (RV) (RV.boxes = RV.boxes || []).push({ el: b, region: region }); }
  function clearBoxes() { var fx = $("[data-ag-fx]"); if (!fx) return; $$(".ag-box:not(.out)", fx).forEach(function (o) { o.classList.add("out"); setTimeout(function () { o.remove(); }, 450); }); }
  function flash(region, kind, label, color) {
    var r = regionRect(region), fx = $("[data-ag-fx]"); if (!r) return;
    clearBoxes();
    var b = doc.createElement("div");
    b.className = "ag-box " + (kind || "");
    if (color) b.style.setProperty("--c", color);
    boxAt(b, r);
    if (label) b.innerHTML = '<span' + (r.y < 26 ? ' class="in"' : "") + ">" + esc(label) + "</span>";
    fx.appendChild(b); track(b, region);
    setTimeout(function () { b.classList.add("out"); }, 1700);
    setTimeout(function () { b.remove(); }, 2200);
  }
  /* A region under inspection: a soft frame with a scan line running down it, and the latest check written on its tag. */
  var RNAME = { nav: "Header", title: "Product name", img: "Photos", price: "Price", reviews: "Reviews", details: "Options", cta: "Add to cart", trust: "Trust badges", content: "Details and FAQ", footer: "Footer" };
  function focusOn(region, color, title, sub) {
    var r = regionRect(region), fx = $("[data-ag-fx]"); if (!r) return null;
    clearBoxes();
    var b = doc.createElement("div");
    b.className = "ag-box focus";
    b.style.setProperty("--c", color || "var(--purple-2)");
    boxAt(b, r);
    b.innerHTML = '<i class="ag-beam"></i><span class="ag-tag' + (r.y < 30 ? " in" : "") + '"><b>' + esc(title) + "</b><em>" + esc(sub || "") + "</em></span>";
    fx.appendChild(b); track(b, region);
    var em = $("em", b);
    return {
      line: function (kind, text) { em.className = kind || ""; em.textContent = text; em.style.animation = "none"; void em.offsetWidth; em.style.animation = ""; },
      done: function () { b.classList.add("out"); setTimeout(function () { b.remove(); }, 500); }
    };
  }
  /* regions in the order they sit on the page, top to bottom */
  function byPageOrder(list) {
    return list.map(function (rg, i) { var r = regionRect(rg); return { rg: rg, y: r ? r.y + (RV ? RV.win.scrollY * RV.scale : 0) : 1e6 + i }; })
      .sort(function (a, b) { return a.y - b.y; }).map(function (x) { return x.rg; });
  }
  /* one pin per region and kind: issues show a running count, tests show their numbers */
  function pin(region, text, kind) {
    var r = regionRect(region), fx = $("[data-ag-fx]"); if (!r) return;
    kind = kind || "bad";
    var key = region + ":" + kind, d = pinN[key];
    var slot = { bad: 0, warn: 1, test: 2 }[kind] || 0;
    if (!d) {
      d = pinN[key] = doc.createElement("span");
      d.className = "ag-pin " + kind;
      d.style.left = Math.min(r.x + r.w - 10 - slot * 34, r.W - 30) + "px";
      d.style.top = Math.max(2, r.y - 9) + "px";
      d._n = 0; d._t = [];
      fx.appendChild(d);
      if (RV) RV.pins.push({ el: d, region: region, kind: kind });
    } else { d.style.animation = "none"; void d.offsetWidth; d.style.animation = ""; }
    d._n++;
    if (kind === "test") { d._t.push(text); d.textContent = "T" + d._t.join(","); }
    else d.textContent = kind === "warn" ? text : "!" + (d._n > 1 ? " " + d._n : "");
  }
  function sweep(on, color) {
    var s = $("[data-ag-sweep]"); if (!s) return;
    if (color) s.style.setProperty("--c", color);
    s.classList.toggle("on", !!on);
  }
  win.addEventListener("resize", function () { if (doc.body.getAttribute("data-an-view") === "scan") AGENTS.forEach(function (a) { if (agState[a.id] !== "run") park(a.id); }); });

  /* Google PageSpeed: 3 runs on mobile and 3 on desktop in parallel, averaged (Lighthouse varies run to run).
     We wait for every run up to 25s after the first mobile result, then average whatever came back. */
  function avgPsi(list) {
    list = list.filter(function (d) { return d && d.scores && d.scores.performance != null; });
    if (!list.length) return null;
    var mean = list.reduce(function (s, d) { return s + d.scores.performance; }, 0) / list.length;
    var base = list.slice().sort(function (x, y) { return Math.abs(x.scores.performance - mean) - Math.abs(y.scores.performance - mean); })[0];
    var out = Object.assign({}, base, { scores: Object.assign({}, base.scores), metrics: Object.assign({}, base.metrics), runs: list.length });
    ["performance", "accessibility", "seo", "bestPractices"].forEach(function (k) { var v = list.map(function (d) { return d.scores[k]; }).filter(function (x) { return x != null; }); if (v.length) out.scores[k] = Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length); });
    ["lcp", "fcp", "cls", "tbt", "si", "ttfb", "weightKb", "requests"].forEach(function (k) { var v = list.map(function (d) { return d.metrics && d.metrics[k]; }).filter(function (x) { return typeof x === "number"; }); if (v.length) { var m = v.reduce(function (s, x) { return s + x; }, 0) / v.length; out.metrics[k] = k === "cls" ? Math.round(m * 1000) / 1000 : Math.round(m); } });
    return out;
  }
  /* Google PageSpeed with our key: one run on mobile and one on desktop, for the page that was entered.
     A run that fails is retried once if there's time. If nothing comes back, S.psiErr keeps Google's reason. */
  function runPsi(url) {
    var skipP = new Promise(function (res) { S.psiSkip = function () { res(null); }; });
    S.psiErr = "";
    if (!win.TrooPSI || !win.AbortController) return Promise.resolve(null);
    var key = CFG.psiKey || "", N = 1, t0 = Date.now(), res = { mobile: [], desktop: [] }, errs = [];
    function one(strategy) {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 150000);
      return fetch(win.TrooPSI.psiUrl(url, strategy, key), { signal: ctl.signal })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (x) {
          clearTimeout(t);
          if (x.d && x.d.lighthouseResult) return { d: win.TrooPSI.compactPsi(x.d, strategy) };
          var msg = x.d && x.d.error && x.d.error.message ? String(x.d.error.message) : "HTTP " + x.status;
          return { err: msg };
        })
        .catch(function (e) { clearTimeout(t); return { err: e && e.name === "AbortError" ? "Google took longer than 2.5 minutes to load this page" : "Couldn't reach Google PageSpeed" }; });
    }
    function lane(strategy) {
      return new Promise(function (resolve) {
        var n = 0, fails = 0;
        (function next() {
          if (res[strategy].length >= N || fails >= 2 || Date.now() - t0 > 60000) return resolve();
          n++;
          one(strategy).then(function (x) {
            if (x.d && x.d.scores && x.d.scores.performance != null) res[strategy].push(x.d);
            else { fails++; errs.push(x.err || "No score returned"); if (win.console) console.warn("PageSpeed " + strategy + ": " + (x.err || "no score")); }
            next();
          });
        })();
      });
    }
    var mobL = lane("mobile"), deskL = lane("desktop");
    /* desktop is secondary: once mobile is in, give desktop 20 more seconds at most */
    var p = Promise.race([Promise.all([mobL, deskL]), mobL.then(function () { return res.mobile.length ? sleep(20000) : deskL; }), sleep(160000)]).then(function () {
      var m = avgPsi(res.mobile);
      if (m) { var d = avgPsi(res.desktop); if (d) m.desktop = { scores: d.scores, metrics: d.metrics, runs: d.runs }; }
      else S.psiErr = errs[0] || "Google PageSpeed didn't answer in time";
      return m;
    });
    return Promise.race([p, skipP]);
  }
  /* TrooGrowth reads (troogrowth edge function): site crawl, trust check, product questions, category leaders */
  function gapi(path, body, timeout, base) {
    var G = String(base || CFG.growth || "").replace(/\/+$/, "");
    if (!G || !win.AbortController) return Promise.resolve(null);
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, timeout || 60000);
    var init = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal };
    return fetch(G + path, init).then(function (r) { return r.json(); }).then(function (d) { clearTimeout(t); return d && !d.error && !d.fallback ? d : null; }).catch(function () { clearTimeout(t); return null; });
  }
  /* plain facts our scripts checked, handed to the shopper personas so they react to them */
  function shopFacts(r, tr) {
    var p = r.page || {}, f = tr.facts || {}, cl = tr.claims || {}, out = [];
    var rt = p.rating && p.rating.value ? p.rating : tr.reviews && tr.reviews.schema ? tr.reviews.schema : null;
    if (rt) out.push("Rating shown: " + rt.value + (rt.count ? " from " + rt.count + " reviews" : ""));
    if (cl.returnDays) out.push("The page promises " + cl.returnDays.days + "-day returns");
    if (f.noReturns) out.push("Policy: " + f.noReturns.quote);
    else if (f.damagedOnly) out.push("Policy: returns only for damaged or wrong items");
    if (f.exchangeOnly) out.push("Policy: " + f.exchangeOnly.quote);
    if (f.deliveryDays) out.push("Shipping policy: delivery in " + f.deliveryDays[0] + "-" + f.deliveryDays[1] + " days");
    if (f.freeShipAbove) out.push("Free shipping above " + f.freeShipAbove);
    if (f.codFee) out.push("Cash on delivery costs extra: " + f.codFee);
    (tr.contradictions || []).slice(0, 2).forEach(function (c) { out.push("Conflict: " + c.issue); });
    (tr.numbers || []).filter(function (n) { return !(n.quote && /(code|coupon|extra|above|orders?\b|prepaid|upi|bank|purchase of|or more|buy \d|up ?to|items)/i.test(n.quote)); }).slice(0, 2).forEach(function (n) { out.push("Numbers: " + n.issue + (n.quote ? " (\"" + n.quote + "\")" : "")); });
    (tr.urgency || []).slice(0, 1).forEach(function (u) { out.push("Urgency: " + u.text); });
    if (tr.product && tr.product.compareAt && tr.product.price && tr.product.compareAt > tr.product.price) out.push("Price " + tr.product.price + ", MRP " + tr.product.compareAt + " (" + Math.round(100 * (1 - tr.product.price / tr.product.compareAt)) + "% off)");
    return out.slice(0, 12);
  }
  function startGrowthReads() {
    var gx = S.gx = { t0: Date.now() };
    gx.crawlP = Promise.resolve(null); // search checks come from the entered page itself
    gx.trustP = CFG.v3 ? Promise.resolve(null) : gapi("/trust", { url: S.url }, 50000);
    var staticP = S.viewP.then(function (v) { return v && v.html && win.TrooGrowth ? win.TrooGrowth.pageText(v.html) : null; }).catch(function () { return null; });
    gx.renderP = (CFG.v3 ? Promise.resolve(null) : fetchRender(S.url)).then(function (d) {
      if (d) addFeed("act", "Opened your page in a real browser", "Read what the store draws with JavaScript, the way a shopper sees it", "", "reader");
      return d;
    });
    gx.textP = Promise.all([staticP, Promise.resolve(S.liveP).catch(function () { return null; }), gx.renderP]).then(function (x) {
      var t = win.TrooGrowth && win.TrooGrowth.mergeLive ? win.TrooGrowth.mergeLive(x[0], x[1]) : x[0];
      if (t && S.rawHtml && win.TrooGrowth.hiddenOf) { var rh = win.TrooGrowth.hiddenOf(S.rawHtml); if (rh) t.hid = ((t.hid ? t.hid + ". " : "") + rh).slice(0, 9000); } if (t && S.rawHtml && win.TrooGrowth.fakeCounterOf) { try { t.fakeCount = win.TrooGrowth.fakeCounterOf(S.rawHtml); } catch (e) { /* ignore */ } }
      return win.TrooGrowth && win.TrooGrowth.mergeRender ? win.TrooGrowth.mergeRender(t, x[2]) : t;
    });
    return gx;
  }
  /* v3: one call path to the engine-faithful API (TrooCRO engine verbatim, Barrier Library score, quote check).
     scan (category + competitors) -> grade + PageSpeed for this page and each competitor, in parallel -> report */
  /* The real-browser read can take up to ~3 minutes on the free host, longer than one backend request may last, so the
     backend answers "pending" and this asks again (the backend picks up the same read, it does not start a new one). */
  function auditRead(u) {
    var tries = 0;
    function go() {
      return v3call("/audit_read", { url: u }, 140000).then(function (d) {
        if (d && d.pending) {
          if (++tries < 4) { if (S.running && tries === 1) addFeed("act", "Still reading the page in a real browser", "The first read of a page can take up to 3 minutes", "", "reader"); return go(); }
          S.v3Err = d.reason || "The page took too long to read."; return null;
        }
        return d;
      });
    }
    return go();
  }
  function v3call(path, body, ms) {
    var B = String((/^\/audit_/.test(path) && CFG.auditApi) || CFG.v3 || "").replace(/\/+$/, "");
    if (!B || !win.AbortController) return Promise.resolve(null);
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 90000);
    if (S.capture && /^\/audit_/.test(path)) body = Object.assign({ capture: S.capture }, body);
    if (/^\/audit_/.test(path)) body = Object.assign({ run: S.runId || null, client: { device: (S.inputs && S.inputs.device) || null, w: win.innerWidth, touch: "ontouchstart" in win } }, body);
    return fetch(B + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal })
      .then(function (x) { return x.json(); })
      .then(function (d) { clearTimeout(t); if (d && (d.ok !== false || d.pending)) return d; S.v3Err = (d && d.reason) || S.v3Err || ""; return null; })
      .catch(function () { clearTimeout(t); return null; });
  }
  function startV3(r) {
    var gx = S.gx, I = S.inputs || {}, url = r.url || S.url;
    gx.v3P = v3call("/scan", { url: url, category: I.catYou && I.category ? I.category : undefined, competitors: I.competitors || [], suggest: true }, 120000).then(function (sc) {
      if (!sc) return null;
      var cat = sc.category, comps = (sc.competitors || []).map(function (c) { return c.url; }).slice(0, 3);
      S.v3scan = sc;
      if (S.running) addFeed("act", "Picked the buyer questions for " + cat, plural(sc.checklist || 0, "signal") + " from the TrooCRO engine apply to this page" + (comps.length ? "; " + plural(comps.length, "competitor") + " to grade the same way" : ""), "", "barrier");
      var mine = Promise.all([v3call("/grade", { url: url, category: cat }, 170000), v3call("/psi", { url: url }, 120000)]);
      var rivals = Promise.all(comps.map(function (c) {
        return Promise.all([v3call("/grade", { url: c, category: cat, rival: true }, 170000), v3call("/psi", { url: c }, 120000)]).then(function (x) { return x[0] ? c : null; });
      }));
      return Promise.all([mine, rivals]).then(function (x) {
        if (!x[0][0]) return null;
        return v3call("/report", { url: url, category: cat, competitors: x[1].filter(Boolean) }, 60000);
      }).then(function (d) { return d && d.report ? d.report : null; });
    });
  }
  /* Page audit: read (started at the quiz) -> speed, signal grading and customer layer in parallel -> report
     (engine, second read, changes written for the buyer). No partial result: any failed step fails the audit. */
  function startAudit(r) {
    var I = S.inputs || {};
    S.auditP = Promise.resolve(S.auditReadP || auditRead(S.url)).then(function (rd) {
      if (!rd) return { failed: S.v3Err || "The page could not be read." };
      var url = rd.url || S.url, cat = I.category || rd.category || "Other";
      if (S.running) addFeed("act", "Opened the page for the audit", rd.reader === "browser" ? "Every collapsed section opened" + (rd.postcode ? ", delivery checked for " + rd.postcode : "") : "Read the page as it loads", "", "barrier");
      return Promise.all([v3call("/audit_grade", { url: url, category: cat }, 175000), v3call("/audit_customer", { url: url, category: cat }, 150000), v3call("/audit_speed", { url: url }, 150000)]).then(function (x) {
        if (!x[0] || !x[1]) return { failed: S.v3Err || "Grading did not finish." };
        if (S.running) addFeed("act", "Checked the page for " + cat, plural(x[0].counts.pass + x[0].counts.fail, "check") + " judged from what the page shows", "", "barrier");
        if (S.running) addFeed("act", "Second read on the biggest problems", "Each one is re-checked on desktop and in the store data before it is listed", "", "plan");
        return v3call("/audit_report", { url: url, category: cat, device: I.device, traffic: I.trafficA, personas: I.personas }, 175000).then(function (d) { return d && d.report ? d.report : { failed: S.v3Err || "The report did not finish." }; });
      });
    });
  }
  function growthAfterScan(r) {
    var gx = S.gx; if (!gx || !win.TrooGrowth) return;
    if (CFG.audit) { startAudit(r); return; }
    if (CFG.v3) { startV3(r); return; }
    var p = r.page || {}, mk = win.TrooGrowth.marketOf(r);
    var catP = gx.textP.then(function (t) { return win.TrooGrowth.catOf({ page: p, inputs: S.inputs }, { text: t || {} }).cat; });
    gx.peersP = catP.then(function (cat) { return cat && cat !== "Other" ? gapi("/peers?cat=" + encodeURIComponent(cat) + "&market=" + mk + "&exclude=" + encodeURIComponent(hostOf(r.url)), null, 30000) : null; });
    /* v12: 4 shopper personas walk the page (troogrowth-shop: Groq reader + reviews + shoppers) */
    gx.insightP = Promise.resolve(null);
    /* the shoppers also look at the first screen: Google PageSpeed's phone screenshot, so this waits for PageSpeed */
    var shotP = Promise.race([Promise.resolve(S.psiP).then(function (ps) { var f = ps && ps.shots && ps.shots.final; return typeof f === "string" && /^data:image\//.test(f) && f.length < 160000 ? f : ""; }).catch(function () { return ""; }), sleep(170000).then(function () { return ""; })]);
    gx.shopP = Promise.all([gx.textP, Promise.race([gx.trustP, sleep(22000).then(function () { return null; })]), catP, shotP]).then(function (x) {
      var t = x[0], tr = x[1] || {}, prod = tr.product || {}, cat = x[2] || "", shot = x[3] || "";
      if (!t || !t.main || t.main.length < 300) return null;
      var text = (prod.desc && t.main.indexOf(prod.desc.slice(0, 40)) < 0 ? prod.desc.slice(0, 1200) + " " : "") + t.main, ex = t.live && t.live.extra;
      if (ex && t.live.mode === "added") text = text.slice(0, 4400) + " " + ex.slice(0, 1600);
      var sub = win.TrooGrowth.subOf(cat, [p.title, t.h1, prod.title, prod.type].join(" "));
      var i0 = t.h1 ? t.main.indexOf(t.h1.slice(0, 40)) : -1, first = t.main.slice(Math.max(0, i0 - 200), Math.max(0, i0 - 200) + 700);
      var rt = p.rating && p.rating.value ? p.rating : tr.reviews && tr.reviews.schema ? tr.reviews.schema : null;
      gx.shopT0 = Date.now();
      return gapi("/shop", { url: r.url, category: cat, sub: sub || "", market: mk, currency: p.currency || "", pageType: p.pageType, title: p.title, product: prod.title || t.h1 || "", price: prod.price ? (p.currency === "USD" ? "$" : p.currency === "GBP" ? "£" : "Rs ") + prod.price : p.aov ? (p.currency === "USD" ? "$" : "Rs ") + p.aov : "", text: text.slice(0, 6000), first: first, policy: tr.policyText || "", facts: shopFacts(r, tr), rating: rt, shot: shot, t: CFG.shopTest || undefined }, 90000, CFG.shop || String(CFG.growth || "").replace(/\/+$/, "") + "-shop");
    });
    startGrade(r, catP);
  }
  /* v13: the AI grader answers the category's buyer questions on the page (troogrowth-grade), in parallel with the shoppers */
  function startGrade(r, catP) {
    var gx = S.gx, p = r.page || {};
    /* the AI reader's category (from the shoppers call) beats our keyword guess; wait up to 45s for it */
    var aiCatP = Promise.race([Promise.resolve(gx.shopP).then(function (d) { return d && d.category; }).catch(function () { return null; }), sleep(45000).then(function () { return null; })]);
    /* Google's real-Chrome render of the whole page (PageSpeed full-page screenshot), cut into phone-sized slices for the grader to read */
    /* last resort, kept small on Groq: only when the real-browser render failed (bot check, timeout) does the grader read
       Google PageSpeed's full-page screenshot, which comes from Google's own Chrome */
    var fullP = CFG.gradeShots !== false ? Promise.all([gx.renderP]).then(function (rr) { return rr[0] ? [] : Promise.race([Promise.resolve(S.psiP).then(function (ps) { return ps && ps.shots && ps.shots.full ? sliceShot(ps.shots.full) : []; }).catch(function () { return []; }), sleep(110000).then(function () { return []; })]); }) : Promise.resolve([]);
    /* what the nightly review has learned (routes, weights, trial questions); never blocks the scan for more than 4s */
    var learnP = Promise.race([fetch((CFG.grade || String(CFG.growth || "").replace(/\/+$/, "") + "-grade") + "/learn").then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; }), sleep(4000).then(function () { return null; })]);
    gx.gradeP = Promise.all([gx.textP, Promise.race([gx.trustP, sleep(22000).then(function () { return null; })]), catP, aiCatP, fullP, learnP]).then(function (x) {
      try { if (win.TrooGrowth.setLearn) win.TrooGrowth.setLearn(x[5], new URL(r.url).hostname); } catch (e) { /* ignore */ }
      var t = x[0], tr = x[1] || {}, prod = tr.product || {}, cat = x[3] || x[2] || "Other", shots = x[4] || [];
      if (!t || !t.main || t.main.length < 300 || !win.TrooGrowth.qList) return null;
      var L = win.TrooGrowth.qList(cat, [p.title, t.h1, prod.title, prod.type].join(" "), t.main.slice(0, 4000));
      if (!L) return null;
      /* the grader reads 12K characters: start at the product title, keep what the store drew with JavaScript, then add
         the policy-type sentences (delivery, returns, warranty, size, care) from the rest of the page, so long pages keep them */
      var main = t.main, h0 = t.h1 ? main.indexOf(t.h1.slice(0, 40)) : -1;
      var head = (prod.desc && main.indexOf(prod.desc.slice(0, 40)) < 0 ? prod.desc.slice(0, 1500) + " " : "") + main.slice(Math.max(0, h0 - 300), Math.max(0, h0 - 300) + 7500);
      var ex = t.live && t.live.extra && t.live.mode === "added" ? t.live.extra.slice(0, 2500) : "";
      var POL = /(deliver|dispatch|ship|pincode|cash on delivery|\bcod\b|return|exchange|refund|replace|warrant|guarantee|size|fit|measure|dimension|care|wash|ingredient|material|certif|hallmark|tested|expiry|shelf life|in the box|includes)/i;
      var rest = (h0 > 300 ? main.slice(0, h0 - 300) + " " : "") + main.slice(Math.max(0, h0 - 300) + 7500), pol = [], seen = {};
      rest.split(/(?<=[.!?])\s+/).forEach(function (x) { var k = x.slice(0, 60).toLowerCase(); if (x.length > 12 && x.length < 400 && POL.test(x) && !/[\u201c\u201d"]|\b(?:I|I'm|my|me)\b/.test(x) && !seen[k]) { seen[k] = 1; pol.push(x); } });
      var hid = t.hid ? " On the page behind a tap (tabs, pop-ups, product data): " + t.hid.slice(0, 4200) + "." : "";
      var text = head.slice(0, 6500) + (ex ? " " + ex.slice(0, 2000) : "") + hid + (pol.length ? " " + pol.join(" ") : "");
      var f = (r.cro && r.cro.f) || {}, facts = [];
      if (f.gallery != null) facts.push(f.gallery + " product photos in the gallery");
      if (f.video != null) facts.push(f.video ? "has a product video" : "no product video");
      shopFacts(r, tr).slice(0, 6).forEach(function (x) { facts.push(x); });
      var slim = function (q) { var o = { id: q.id, q: q.q, good: q.good }; if (q.c) o.c = q.c; return o; };
      return gapi("/grade", { url: r.url, v: "13b", cat: cat, list: L.key, product: prod.title || t.h1 || "", price: prod.price ? "Rs " + prod.price : "", facts: facts.join("; "), text: text.slice(0, 12000), policy: tr.policyText || "",
        qs: L.qs.map(slim), adds: L.adds.map(function (a) { return { n: a.n, qs: a.qs.map(slim) }; }), rules: (p.currency && p.currency !== "INR" ? ["This store sells outside India: a free-shipping threshold, shipping cost or 'ships in X days' answers the delivery question; cash on delivery is not expected. A stated N-day return window or a satisfaction/money-back guarantee answers the returns question."] : []).concat(L.rules), shots: shots, t: CFG.shopTest || undefined }, 90000, CFG.grade || String(CFG.growth || "").replace(/\/+$/, "") + "-grade")
        .then(function (d) { if (d && d.grades) { d.list = L.key; d.cat = cat; d.learned = !!L.learned; d.learnRev = x[5] && x[5].rev || ""; } return d && d.grades ? d : null; });
    });
  }
  function sliceShot(full) {
    return new Promise(function (res) {
      if (!full || !full.data || !doc.createElement("canvas").getContext) return res([]);
      var im = new Image();
      im.onload = function () {
        try {
          var W = im.naturalWidth, H = Math.min(im.naturalHeight, W * 20), sc = Math.min(2, 640 / W), ch = Math.round(W * 2.4), out = [];
          for (var y = 0; y < H && out.length < 8; y += ch) {
            var h = Math.min(ch, H - y); if (h < 60) break;
            var c = doc.createElement("canvas"); c.width = Math.round(W * sc); c.height = Math.round(h * sc);
            var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, y, W, h, 0, 0, c.width, c.height);
            var u = c.toDataURL("image/jpeg", 0.72); if (u.length < 650000) out.push(u);
          }
          res(out);
        } catch (e) { res([]); }
      };
      im.onerror = function () { res([]); };
      im.src = full.data;
    });
  }
  async function growthCtx(capMs) {
    var gx = S.gx || {}, cap = function (pr, ms) { return Promise.race([pr || Promise.resolve(null), sleep(ms).then(function () { return null; })]); };
    var left = Math.max(4000, capMs);
    var shopLeft = Math.max(left, gx.shopT0 ? 75000 - (Date.now() - gx.shopT0) : 45000);
    var v3Left = Math.max(left, 210000 - (Date.now() - (gx.t0 || Date.now())));
    var x = await Promise.all([cap(gx.textP, 3000), cap(gx.crawlP, left), cap(gx.trustP, left), cap(gx.insightP, left), cap(gx.peersP, left), cap(gx.shopP, shopLeft), cap(gx.gradeP, shopLeft), CFG.v3 ? cap(gx.v3P, v3Left) : null]);
    if (CFG.v3) return { text: x[0] || { all: "", main: "", h1: "" }, v3: x[7] || { failed: S.v3Err || "" } };
    var shop = x[5] && x[5].personas ? x[5] : null;
    var ins = shop ? { product: shop.product, buyer: shop.buyer, one_liner: shop.one_liner, contradictions: shop.contradictions || [] } : x[3];
    return { text: x[0] || { all: "", main: "", h1: "" }, crawl: x[1], trust: x[2] && !x[2].error ? x[2] : null, insight: ins, shop: shop, grade: x[6] || null, peers: x[4], side: S.sideTxt || "", sideMain: S.sideMain || "" };
  }
  function compactComp(c) {
    var p = c.page || {};
    return {
      url: c.url, host: c.host,
      page: { title: p.title, pageType: p.pageType, category: p.category, rendered: p.rendered, rating: p.rating, hasReviews: p.hasReviews, platform: p.platform, primaryCta: p.primaryCta },
      conversion: c.conversion, _v2: true,
      checks: (c.checks || []).map(function (k) { return { key: k.key, signal: k.signal, status: k.status, evidence: k.evidence }; }),
      ai: { readiness: c.ai && c.ai.readiness, agent: { score: c.ai && c.ai.agent && c.ai.agent.score }, llms: c.ai && c.ai.llms },
      stack: { score: c.stack && c.stack.score, tools: ((c.stack && c.stack.tools) || []).map(function (t) { return t.name; }) },
      lite: c.lite ? { speedEstimate: c.lite.speedEstimate, a11yEstimate: c.lite.a11yEstimate, ttfbMs: c.lite.ttfbMs, htmlKb: c.lite.htmlKb, scripts: c.lite.scripts, stylesheets: c.lite.stylesheets, thirdPartyHosts: c.lite.thirdPartyHosts, imagesNoDims: c.lite.imagesNoDims, inlineScripts: c.lite.inlineScripts } : {},
      library: c.library
    };
  }
  function runComps(r) {
    if (CFG.v3) return Promise.resolve([]);
    var list = S.inputs.competitors || [];
    return Promise.all(list.map(function (u) {
      return api("/scan", { url: u, role: "competitor", parent: r.slug, category: (r.page && r.page.category) || undefined }, { timeout: 45000 })
        .then(function (c) { rescore(c, (c.library || {}).signals); return compactComp(c); })
        .catch(function (e) { return { url: u, host: hostOf(u), error: e.message || "We couldn't read their page." }; });
    }));
  }

  /* the old scan's result shape, built from the audit read, for stores that block the quick read */
  function auditOnlyScan(rd) {
    var pr = rd.product || {};
    return { url: rd.url, lite: null, conversion: {}, stack: { tools: [] }, checks: [], library: { signals: {}, barriers: {}, rootCauses: {} },
      page: { url: rd.url, title: pr.title || "", category: rd.category || "", pageType: "PDP", platform: "", currency: pr.currency || "INR", aov: +pr.price || 0, prices: pr.price ? 1 : 0, description: String(pr.description || "").slice(0, 400), primaryCta: "" } };
  }
  /* a store that turns readers away (403, bot check) is not a wrong address: say so, and offer the bookmark */
  function blockedError(e, rd) {
    var m = String((e && e.message) || "") + " " + String((rd && rd.reason) || "");
    if (!S.capture && /\b(401|403|429)\b|blocked|bot check|access denied|forbidden|captcha/i.test(m)) return { blocked: true, message: m };
    return (rd && rd.reason && !(e && e.message)) ? { message: rd.reason } : e;
  }
  function showError(e) {
    S.running = false;
    clearInterval(tickT);
    var bl = $("[data-err-blocked]"); if (bl) bl.hidden = !(e && e.blocked);
    var et = $("#an-err-title"); if (et) et.textContent = e && e.blocked ? "This store turns readers away." : "We couldn't finish this one.";
    var rt = $("[data-err-retry]"); if (rt) rt.hidden = !!(e && e.blocked);
    if (e && e.blocked) {
      $("[data-err-msg]").textContent = S.host + " blocks automated readers, ours included, so we can't open it from our side. You can still audit it from your own browser, where you're a real shopper: it takes one click on the store's page.";
      var op = $("[data-err-open]"); if (op) op.href = S.url;
      show("error"); return;
    }
    if (e && e.network && !S.offline) {
      $("[data-err-msg]").textContent = "We couldn't reach the TrooCRO scanner from this page. Check your connection, or open a sample report instead.";
    } else {
      $("[data-err-msg]").textContent = (e && e.message) || "Something went wrong. Try again.";
    }
    show("error");
  }
  var errRetry = $("[data-err-retry]"), errNew = $("[data-err-new]");
  if (errRetry) errRetry.addEventListener("click", function () { if (S.url) begin(S.url); else show("start"); });
  if (errNew) errNew.addEventListener("click", function () { setQuery(""); show("start"); urlIn.value = ""; urlIn.focus(); });

  async function runScan() {
    if (S.running) return;
    S.running = true; S.psi = null; S.comps = []; S.report = null; S.saved = false; S.saveState = ""; feedN = 0;
    var cv0 = $("[data-ag-canvas]"); if (cv0) cv0.classList.toggle("is-phone", !(S.inputs && S.inputs.device === "Desktop"));
    show("scan");
    S.viewP = fetchView(S.url);
    S.liveP = liveRead(S.url);
    S.viewReady = new Promise(function (res) { S._viewRes = res; });
    S.croP = S.viewP.then(function (v) { return v && v.html ? measureCro(v.html) : null; });
    S.sideTxt = ""; S.sideMain = "";
    S.psiP = runPsi(S.url);
    startGrowthReads();
    /* only the page that was entered is analysed (no second page of the site) */
    S.sideP = Promise.resolve(null);
    buildStages();
    warmStart();
    S.viewP.then(function (v) { if (v && v.html && S.running) mountReal(v); else viewDone(false); });
    S.liveP.then(function (L) {
      if (!S.running) return;
      if (L && L.ok) addFeed("act", "Ran your page's own scripts in a sealed copy", "Read what the store draws with JavaScript" + (L.rv && L.rv.count ? ": " + L.rv.count.toLocaleString("en-IN") + " reviews" + (L.rv.rating ? " at " + L.rv.rating + "★" : "") : ""), "", "reader");
      else addFeed("info", "Your page's scripts didn't run here", "Anything it draws with JavaScript, like a reviews widget, is marked \u201ccouldn't load\u201d and left out of the score", "", "reader");
    });
    $("[data-s-done]").hidden = true; $("[data-s-done]").classList.remove("is-audit");
    $("[data-s-status]").textContent = "Scanning"; $("[data-s-status]").classList.add("live");
    $("[data-s-verb]").textContent = "Reading"; $("[data-ag-canvas]").classList.remove("is-done"); $(".ag-livepill").lastChild.textContent = "Live";
    $("[data-s-host]").textContent = S.host;
    $("[data-t-bar]").textContent = "0";
    setMiniScore(null);
    startTimer();
    await sleep(60);
    AGENTS.forEach(function (a) { park(a.id); });

    /* 1. Reader opens the page */
    curAgent = "reader";
    stage("open", "run", "Opening " + S.host);
    addFeed("act", "Opening " + S.host, "", "");
    var r;
    try { r = await S.scanP; }
    catch (e) {
      /* audit mode: the quick scan is only the old side reads. When a store blocks it (403) but our real-browser read
         or the shopper's own browser (bookmark) got the page, the audit carries on with that read. */
      var rd0 = CFG.audit ? await Promise.resolve(S.auditReadP).catch(function () { return null; }) : null;
      if (rd0 && rd0.ok) { r = auditOnlyScan(rd0); addFeed("info", "The quick read was blocked by the store", "Carrying on with the full read" + (S.capture ? " from your browser" : " from our browser"), "", "reader"); }
      else { showError(blockedError(e, rd0)); return; }
    }
    var det = r.page || {};
    var want = S.inputs;
    if ((want.category && want.category !== det.category) || (want.aovBand && want.aovBand !== det.aovBand)) {
      setAgent("reader", null, "Re-reading the page with your answers");
      try { r = await api("/scan", { url: S.url, category: want.category || undefined, aovBand: want.aovBand || undefined, goal: want.goal }, { timeout: 45000 }); }
      catch (e) { /* keep the first read */ }
    }
    S.scan = r;
    /* audit mode: the price everywhere is the page reader's (what a shopper sees), never the old scan's "typical" guess */
    if (CFG.audit && r.page) { r.page.aov = S.v3price ? S.v3price.v : 0; if (S.v3price) r.page.currency = S.v3price.cur; r.page.aovBand = ""; }
    growthAfterScan(r);
    var lib = r.library || { signals: {}, barriers: {}, rootCauses: {} };
    rescore(r, lib.signals);
    var p = r.page || {};
    paintPage(r);
    setAgent("reader", null, "Waiting for your page to render");
    var real = await Promise.race([S.viewReady, sleep(Math.max(1500, 16000 - (Date.now() - t0Scan)))]);
    if (!real) viewDone(false);
    warmEnd();
    await sleep(500);
    AGENTS.forEach(function (a) { park(a.id); });
    if (!RV) addFeed("info", "Showing a drawing of your page", "We couldn't render the live page here, so the agents work on a map of it built from its code", "", "reader");
    stage("open", "done", (hostOf(r.url) || S.host) + (r.lite && r.lite.ttfbMs != null ? " answered in " + r.lite.ttfbMs + "ms" : " answered"));
    addFeed("act", "Page opened", r.lite && r.lite.ttfbMs != null ? "Server answered in " + r.lite.ttfbMs + "ms, " + (r.lite.htmlKb || "?") + " KB of HTML" : "", "");

    /* Speed and Market start now and work in parallel */
    var psiP = S.psiP || runPsi(r.url);
    var compP = runComps(r);
    curAgent = "speed";
    stage("speed", "run");
    think("speed", ["Loading your page on a mid-range phone", "Timing the largest image and headline", "Counting scripts that block taps", "Waiting for Google PageSpeed"]);
    addFeed("act", "Started Google PageSpeed on mobile", "Runs in the background while the others work", "", "speed");
    var nComp = (S.inputs.competitors || []).length;
    stage("compare", "run");
    think("market", nComp ? ["Opening " + S.inputs.competitors.map(hostOf).join(" and "), "Reading their pages with the same checks", "Lining up their scores with yours"] : ["Finding the benchmark for " + (p.category || "your category"), "Matching your price band"]);
    addFeed("act", nComp ? "Reading " + plural(nComp, "competitor") + " in parallel" : "Looking up your category benchmark", "", "", "market");

    /* 2. Reader maps the structure */
    curAgent = "reader";
    stage("structure", "run", "Mapping header, product and footer");
    var walkL = { nav: "Header and menu", title: (p.h1 && p.h1.length) ? plural(p.h1.length, "H1 heading") : "No H1 heading", img: plural((p.images && p.images.total) || 0, "image"), cta: "Main button: " + (p.primaryCta || "none found"), footer: "Footer" };
    var walk = byPageOrder(["nav", "title", "img", "cta", "footer"]);
    for (var w = 0; w < walk.length; w++) {
      if (walk[w] === "footer") continue;
      await goTo("reader", walk[w]);
      flash(walk[w], "map", walkL[walk[w]], AG.reader.c); await sleep(REDUCED ? 100 : 620);
    }
    stage("structure", "done", [PAGE_TYPE[p.pageType] || "Page", plural(p.words || 0, "word"), plural((p.images && p.images.total) || 0, "image")].join(" · "));
    addFeed("act", "Mapped the page", [PAGE_TYPE[p.pageType] || "Page", plural(p.words || 0, "word"), plural((p.images && p.images.total) || 0, "image"), p.platform].filter(Boolean).join(" · "), "");
    if (p.rendered === "client") addFeed("info", "This page builds most of its content with JavaScript", "We read what's in the HTML. Checks that need the rendered page are left out of the score, never counted as failures.");

    /* 3. Reader reads the business */
    stage("business", "run", "Working out what you sell");
    await goTo("reader", "price");
    var bizLine = [p.category || "Category not detected", p.aovBand ? bandLabel(p.aovBand) : p.aov ? money(p.aov, p.currency) : "", p.platform].filter(Boolean).join(" · ");
    flash("price", "map", CFG.audit ? (S.v3price ? "Price " + money(S.v3price.v, S.v3price.cur) : "Price") : p.aov ? "Typical price " + money(p.aov, p.currency) : "Prices", AG.reader.c);
    await sleep(REDUCED ? 100 : 700);
    stage("business", "done", bizLine);
    addFeed("act", "Read the business", bizLine, "");

    /* 4. Conversion agent runs every check on the page, including what we measured on the rendered page */
    curAgent = "conv";
    addStackChecks(r); lib = r.library;
    var croEarly = await Promise.race([S.croP, sleep(7000).then(function () { return null; })]);
    if (croEarly && croEarly.f) {
      r.page = r.page || {};
      if (isLeadPage(croEarly.f, r.page)) { r.page.lead = true; addFeed("info", "This is a sign-up site, not a store", "Judging it on sign-ups, trust and clarity instead of add-to-cart", "", "conv"); }
      var nRc = mergeRendered(r, croEarly.f);
      lib = r.library;
      if (nRc) addFeed("act", "Measured the page on a phone", plural(nRc, "extra check") + " from the rendered page, mapped to buyer barriers", "", "conv");
    }
    var checks = (r.checks || []).filter(function (c) { return !/^SIG-(MOB|A11Y)/.test(c.signal); });
    stage("signals", "run", "0 of " + checks.length + " checks");
    addFeed("act", "Running " + plural(checks.length, "conversion check"), "Each one comes from the TrooCRO signal library", "");
    /* one region at a time, top to bottom: the camera stops, a scan line runs over the region, its checks land on the tag */
    var grp = {}; checks.forEach(function (c) { var rg = regionFor(c.key); (grp[rg] = grp[rg] || []).push(c); });
    var gOrder = byPageOrder(Object.keys(grp)), per = REDUCED ? 120 : Math.max(280, Math.min(520, Math.round(17000 / Math.max(1, checks.length)))), ci = 0;
    for (var gi = 0; gi < gOrder.length; gi++) {
      var reg = gOrder[gi], gl = grp[reg];
      setAgent("conv", null, (RNAME[reg] || "Page") + ": " + plural(gl.length, "check"));
      await goTo("conv", reg);
      var fc = focusOn(reg, AG.conv.c, RNAME[reg] || "Page", "Reading " + plural(gl.length, "check"));
      await sleep(REDUCED ? 0 : 380);
      for (var i = 0; i < gl.length; i++) {
        var c = gl[i], s = lib.signals[c.signal] || {};
        var short = SHORT[c.key] || tidy(s.name) || c.key;
        ci++;
        setAgent("conv", null, "Checking " + ci + " of " + checks.length + ": " + (tidy(s.name) || short));
        if (c.status === "fail") {
          tally.fix++;
          if (fc) fc.line("bad", short);
          pin(reg, "!", "bad");
          addFeed("fail", short, c.evidence, barrierChips(s.barriers, lib, 2));
        } else {
          tally.pass++;
          if (fc) fc.line("ok", clip2(c.evidence, 46));
          addFeed("pass", clip2(c.evidence, 90), "", "");
        }
        updTally();
        await sleep(per);
      }
      if (fc) fc.done();
    }
    var conv = r.conversion || {};
    stage("signals", "done", checks.length ? conv.passed + " passed, " + conv.failed + " to fix" : "Not enough page content to check");

    /* 5. Barrier agent tags what stops buyers */
    curAgent = "barrier";
    stage("barriers", "run", "Matching failures to buyer barriers");
    var bHit = {}, bReg = {};
    checks.forEach(function (c) { if (c.status !== "fail") return; var s = lib.signals[c.signal] || {}; (s.barriers || []).forEach(function (b) { bHit[b] = (bHit[b] || 0) + 1; if (!bReg[b]) bReg[b] = regionFor(c.key); }); });
    var bIds = Object.keys(bHit).sort(function (a, b) { return bHit[b] - bHit[a]; });
    var bTop = bIds.slice(0, 5), bRegs = byPageOrder(bTop.map(function (b) { return bReg[b]; }).filter(function (x, k, A) { return A.indexOf(x) === k; }));
    var bShown = 0;
    for (var bi = 0; bi < bRegs.length; bi++) {
      var here = bTop.filter(function (b) { return bReg[b] === bRegs[bi]; });
      await goTo("barrier", bRegs[bi]);
      for (var bj = 0; bj < here.length; bj++) {
        var bid = here[bj], bx = lib.barriers[bid];
        setAgent("barrier", null, (bx ? tidy(bx.name) : "A buyer doubt") + ": " + plural(bHit[bid], "issue"));
        flash(bRegs[bi], "bar", bx ? tidy(bx.name) : "Buyer doubt", AG.barrier.c);
        $("[data-t-bar]").textContent = String(++bShown);
        await sleep(REDUCED ? 120 : 760);
      }
    }
    $("[data-t-bar]").textContent = String(bIds.length);
    stage("barriers", "done", bIds.length ? plural(bIds.length, "barrier") + ": " + bIds.slice(0, 3).join(", ") : "No barrier tags on the failed checks");
    addFeed(bIds.length ? "fail" : "pass", bIds.length ? plural(bIds.length, "buyer barrier") + " triggered" : "No buyer barriers triggered", bIds.slice(0, 4).map(function (b) { return lib.barriers[b] ? tidy(lib.barriers[b].name) : "Buyer doubt"; }).join(", "), ""); /* names only: no barrier codes in what brands see */

    /* 6. Search & AI agent (runs while Speed keeps waiting) */
    curAgent = "search";
    stage("search", "run", "Reading robots.txt, sitemap and schema");
    var ai = r.ai || {};
    await goTo("search", "nav");
    flash("nav", "map", "Meta tags and schema", AG.search.c); await sleep(REDUCED ? 100 : 700);
    (ai.checks || []).forEach(function (x) { if (!x.pass) addFeed("fail", x.label, x.detail || "", ""); });
    var aiFails = (ai.checks || []).filter(function (x) { return !x.pass; });
    if (aiFails.length) { await goTo("search", "title"); flash("title", "bad", aiFails[0].label); pin("nav", "AI", "warn"); }
    await sleep(REDUCED ? 100 : 600);
    stage("search", "done", "Search and AI " + (ai.readiness != null ? ai.readiness : "n/a") + "/100, agents " + (ai.agent && ai.agent.score != null ? ai.agent.score : "n/a") + "/100");
    addFeed("act", "Search and AI readiness " + (ai.readiness != null ? ai.readiness + "/100" : "n/a"), (ai.checks || []).filter(function (x) { return x.pass; }).length + " of " + (ai.checks || []).length + " checks pass", "");

    /* 7. Speed agent reports in */
    curAgent = "speed";
    var skipTimer = setTimeout(function () {
      if (agState.speed !== "run") return;
      var row = $('[data-ag="speed"] [data-ag-s]'); if (!row) return;
      clearInterval(thinkT.speed); clearInterval(row._tt);
      row.innerHTML = "Still measuring. <button class=\"skipbtn\" type=\"button\" data-skip-psi>Use an estimate</button>";
      var b = $("[data-skip-psi]"); if (b) b.addEventListener("click", function () { if (S.psiSkip) S.psiSkip(); });
    }, 45000);
    sweep(true, AG.speed.c);
    var psi = await psiP;
    clearTimeout(skipTimer);
    sweep(false);
    await goTo("speed", "img");
    S.psi = psi;
    if (psi) {
      (psi.findings || []).filter(function (f) { return f.area === "speed"; }).forEach(function (f) { var s = lib.signals[f.signal] || {}; addFeed("fail", tidy(s.name) || "Speed", f.evidence, ""); });
      var m = psi.metrics || {};
      flash("img", psi.scores.performance >= 70 ? "ok" : "bad", "Performance " + psi.scores.performance + "/100");
      stage("speed", "done", "Performance " + psi.scores.performance + "/100" + (m.lcp ? ", largest content at " + (m.lcp / 1000).toFixed(1) + "s" : ""));
    } else {
      var lt = r.lite || {};
      flash("img", "map", "Speed estimate " + (lt.speedEstimate != null ? lt.speedEstimate + "/100" : "n/a"), AG.speed.c);
      addFeed("info", "Speed estimated from the page's code", "Google PageSpeed was busy, so we estimated from server response, page weight and scripts: " + (lt.speedEstimate != null ? lt.speedEstimate + "/100." : "no estimate."));
      stage("speed", "est", "Estimated from the page's code: " + (lt.speedEstimate != null ? lt.speedEstimate + "/100" : "n/a"));
    }

    /* 8. Access agent */
    curAgent = "a11y";
    stage("a11y", "run", "Checking alt text, labels and contrast");
    await goTo("a11y", "img");
    if (psi && psi.scores.accessibility != null) {
      (psi.findings || []).filter(function (f) { return f.area === "accessibility"; }).slice(0, 3).forEach(function (f) { var s = lib.signals[f.signal] || {}; addFeed("fail", tidy(s.name) || "Accessibility", f.evidence, ""); });
      flash("img", psi.scores.accessibility >= 85 ? "ok" : "bad", "Accessibility " + psi.scores.accessibility + "/100");
      await sleep(REDUCED ? 100 : 800);
      stage("a11y", "done", "Accessibility " + psi.scores.accessibility + "/100 (Google Lighthouse)");
    } else {
      var lt2 = r.lite || {};
      if (lt2.a11yIssues && lt2.a11yIssues.length) { flash("img", "bad", lt2.a11yIssues[0]); addFeed("fail", "Accessibility gaps in the page's code", lt2.a11yIssues.slice(0, 3).join(", ") + ".", ""); }
      else flash("img", "ok", "No obvious gaps in the code");
      await sleep(REDUCED ? 100 : 700); await goTo("a11y", "cta");
      stage("a11y", "est", "Estimated from the page's code: " + (lt2.a11yEstimate != null ? lt2.a11yEstimate + "/100" : "n/a"));
    }

    /* 9. Market agent reports in */
    curAgent = "market";
    await goTo("market", "price");
    var comps = await compP;
    S.comps = comps;
    await sleep(400);
    var okComps = comps.filter(function (c) { return !c.error; });
    okComps.forEach(function (c) { addFeed("act", "Read " + c.host, "Search and AI " + (c.ai && c.ai.readiness != null ? c.ai.readiness : "n/a") + ", speed estimate " + (c.lite && c.lite.speedEstimate != null ? c.lite.speedEstimate : "n/a"), ""); });
    comps.filter(function (c) { return c.error; }).forEach(function (c) { addFeed("info", "Couldn't read " + c.host, c.error, ""); });
    var bm = r.benchmark;
    flash("price", "map", bm ? "Benchmark: store conversion " + bm.cvr + "%" : "No benchmark for this band", AG.market.c);
    var cDetail = [nComp ? (okComps.length ? "Compared with " + okComps.map(function (c) { return c.host; }).join(" and ") : "Couldn't read the competitor pages") : "", bm ? "Benchmark: " + bm.category + ", " + bandLabel(bm.band) : "No benchmark for this category and band"].filter(Boolean).join(" · ");
    await sleep(500);
    stage("compare", "done", cDetail);

    /* 10. Planner */
    curAgent = "plan";
    stage("plan", "run", "Ranking fixes by impact and effort");
    S.report = buildReport(r, psi, comps);
    var croM = await Promise.race([S.croP, sleep(16000).then(function () { return null; })]);
    var pType = (r.page || {}).pageType, lead = !!(r.page && r.page.lead) || (croM && croM.f && isLeadPage(croM.f, r.page)), sideM = null;
    if (false) {
      sideM = await Promise.race([S.sideP, sleep(12000).then(function () { return null; })]);
      if (sideM) addFeed("act", pType === "PDP" ? "Checked your homepage too" : "Checked one of your product pages too", "Two pages of the same site rank stores far more reliably than one", "", "plan");
    }
    var cro = croM && croM.f ? croScore(croM.f, pType, sideM, lead) : null;
    if (croM && croM.regions && croM.pageH) { S.report.regions = croM.regions; S.report.pageH = croM.pageH; }
    if (cro && cro.kind === "blend" && sideM && sideM.f) addSideFindings(S.report, sideM, cro.side.type);
    if (cro) { S.report.cro = { score: cro.score, up: cro.up, down: cro.down, f: cro.f, v: 4, n: cro.n, kind: cro.kind, labels: cro.labels, page: cro.page, side: cro.side }; addFeed("act", "Benchmarked the page", (lead ? "Visitor experience " : "Shopper experience ") + cro.score + "/100 against " + cro.n + " " + (lead ? "fintech, healthtech and service sites" : "sites") + " we measured the same way", "", "plan"); }
    else addFeed("info", "Limited score", "We couldn't measure the page on a phone, so the score uses its code only", "", "plan");
    if (CFG.audit) {
      setAgent("plan", null, "Checking the biggest problems a second time");
      var A = await Promise.race([Promise.resolve(S.auditP), sleep(480000).then(function () { return { failed: "That took too long." }; })]);
      A = A || { failed: S.v3Err || "" }; S.report.audit = A;
      if (A.failed) addFeed("fail", "The audit didn't finish", A.failed, "", "barrier");
      else addFeed("pass", "Page audit ready", plural((A.changes || []).length, "change") + " to make, each checked twice", "", "plan");
      clearBoxes(); camTop();
      stage("plan", "done", A.failed ? "Not finished" : "Ready");
      clearInterval(tickT);
      $("[data-s-status]").textContent = "Done"; $("[data-s-status]").classList.remove("live");
      $("[data-s-verb]").textContent = "Finished reading"; $("[data-ag-canvas]").classList.add("is-done"); $(".ag-livepill").lastChild.textContent = "Done";
      $("[data-s-verdict]").textContent = A.failed ? "Not finished" : "Page audit ready";
      $("[data-s-done]").classList.add("is-audit"); /* a page audit has no single score, so the score ring stays hidden */
      $("[data-s-done]").hidden = false;
      S.running = false;
      var aOpen = $("[data-s-open]");
      if (aOpen) aOpen.onclick = function () { openReport(S.report, { mode: "live" }); };
      await sleep(1500);
      if (doc.body.getAttribute("data-an-view") === "scan") openReport(S.report, { mode: "live" });
      return;
    }
    if (win.TrooGrowth) {
      setAgent("plan", null, "Lining up buyer questions, policies and category leaders");
      try {
        var gctx = await growthCtx(Math.max(6000, 30000 - (Date.now() - (S.gx ? S.gx.t0 : Date.now())) / 4));
        S.report.growth = win.TrooGrowth.build(S.report, gctx);
        var GR = S.report.growth, nNo = GR.qs.filter(function (q) { return q.g === "no"; }).length;
        if (GR.v3) {
          if (GR.unread) addFeed("fail", "Grading didn't finish", GR.unread, "", "barrier");
          else {
            addFeed(nNo ? "fail" : "pass", plural(GR.qs.length, "buyer question") + " graded for " + GR.cat, nNo ? plural(nNo, "question") + " not answered on the page" : "Every question has an answer on the page", "", "barrier");
            if (GR.shop.personas.length) addFeed("act", "Re-cut the same grades by buyer type", clip2(GR.shop.personas.map(function (q) { return q.n + " " + q.settled + "%"; }).join(" · "), 120), "", "barrier");
            if (GR.peers.length) addFeed("act", "Graded " + GR.peers.map(function (x) { return x.host; }).join(" and ") + " the same way", GR.compRank ? "You are " + GR.compRank : "", "", "market");
          }
        } else {
        if (gctx.crawl && gctx.crawl.pages) addFeed("act", "Read " + plural(gctx.crawl.pages.filter(function (x) { return x.status === 200; }).length, "page") + " from your sitemap", "Titles, schema, canonical tags and AI access, page by page", "", "search");
        if (gctx.trust && gctx.trust.facts) addFeed((gctx.trust.contradictions || []).length ? "fail" : "act", "Compared your policies with the page", (gctx.trust.contradictions || []).length ? plural(gctx.trust.contradictions.length, "conflict") + " between what the page promises and what the policy says" : "No conflicts between the page and " + plural((gctx.trust.facts.policies || []).length, "policy page"), "", "conv");
        if (gctx.shop) addFeed("act", "4 shoppers walked the page", clip2(gctx.shop.personas.map(function (q) { return q.n + " " + q.buy; }).join(" · "), 120), "", "barrier");
        else addFeed("info", "Shoppers didn't finish in time", "The CRO score uses the house rules alone", "", "barrier");
        addFeed(nNo ? "fail" : "pass", plural(GR.qs.length, "buyer question") + " checked for " + GR.cat, nNo ? plural(nNo, "question") + " not answered on the page" : "Every question has an answer on the page", "", "barrier");
        if (GR.peers.length) addFeed("act", "Benchmarked against " + GR.peers.map(function (x) { return x.host; }).join(" and "), "Category leaders, measured the same way", "", "market");
        if (GR.levers[0]) addFeed("act", "Top lever: " + GR.levers[0].name, GR.levers[0].what, "", "plan");
        }
      } catch (eG) { if (win.console) console.warn("growth", eG); }
    }
    var C = compute(S.report);
    var T = S.report.growth && S.report.growth.v3 ? [] : testsOf(S.report, findingsOf(S.report));
    for (var ti = 0; ti < T.length; ti++) {
      var reg2 = regionFor(T[ti].f.key);
      setAgent("plan", null, "Test " + (ti + 1) + ": " + clip2(T[ti].title, 60));
      await goTo("plan", reg2);
      flash(reg2, "plan", "Test " + (ti + 1), AG.plan.c);
      pin(reg2, String(ti + 1), "test");
      addFeed("act", "Test " + (ti + 1) + ": " + clip2(T[ti].title, 90), T[ti].where || "", "");
      await sleep(REDUCED ? 120 : 700);
    }
    clearBoxes(); camTop();
    stage("plan", "done", T.length ? plural(T.length, "test") + " planned, starting " + fmtDate(nextMonday(new Date())) : "Nothing urgent to test");
    clearInterval(tickT);
    $("[data-s-status]").textContent = "Done"; $("[data-s-status]").classList.remove("live");
    $("[data-s-verb]").textContent = "Finished reading"; $("[data-ag-canvas]").classList.add("is-done"); $(".ag-livepill").lastChild.textContent = "Done";
    $("[data-s-verdict]").textContent = C.verdict;
    $("[data-s-done]").hidden = false;
    setTimeout(function () { setMiniScore(C.total); }, 60);
    addFeed("pass", "Report ready", (C.growth ? "Overall score " : "Website score ") + (C.total != null ? C.total + "/100" : "n/a"), "", "plan");
    S.running = false;
    saveReport();
    var openBtn = $("[data-s-open]");
    if (openBtn) openBtn.onclick = function () { openReport(S.report, { mode: "live" }); };
    await sleep(2200);
    if (doc.body.getAttribute("data-an-view") === "scan") openReport(S.report, { mode: "live" });
  }

  function buildReport(r, psi, comps) {
    var lib = r.library || { signals: {}, barriers: {}, rootCauses: {} };
    var signals = {}, barriers = {};
    function take(id) {
      var s = lib.signals[id]; if (!s || signals[id]) return;
      signals[id] = s;
      (s.barriers || []).forEach(function (b) { if (lib.barriers[b]) barriers[b] = lib.barriers[b]; });
    }
    (r.checks || []).forEach(function (c) { take(c.signal); });
    ((psi && psi.findings) || []).forEach(function (f) { take(f.signal); });
    (comps || []).forEach(function (c) { (c.checks || []).forEach(function (k) { take(k.signal); }); delete c.library; });
    var psiC = psi ? Object.assign({}, psi, { shots: { final: psi.shots && /^data:image\//.test(psi.shots.final || "") ? psi.shots.final : null } }) : null;
    return {
      v: 1, slug: r.slug, createdAt: new Date().toISOString(), url: r.url, host: r.host,
      inputs: S.inputs, page: r.page, checks: r.checks, conversion: r.conversion, ai: r.ai, stack: r.stack, lite: r.lite,
      benchmark: r.benchmark, psi: psiC, psiErr: psiC ? "" : (S.psiErr || ""), comps: comps || [],
      lib: { signals: signals, barriers: barriers, rootCauses: lib.rootCauses || {} }
    };
  }
  function saveReport() {
    var R = S.report; if (!R || !R.slug) return;
    /* v3 is local until it has its own new function: don't write v3 reports into the live report table */
    if (CFG.v3) { S.saveState = "failed"; $$("[data-share]").forEach(function (b) { b.disabled = true; (b.querySelector("span") || b).textContent = "Link unavailable"; }); return; }
    S.saveState = "saving";
    api("/save", { slug: R.slug, report: R }, { timeout: 30000 }).then(function () {
      S.saved = true; S.saveState = "saved";
      var b = $("[data-share]"); if (b) { b.disabled = false; b.querySelector("span").textContent = "Copy share link"; }
    }).catch(function () {
      S.saveState = "failed";
      var b = $("[data-share]"); if (b) { b.disabled = true; b.querySelector("span").textContent = "Link unavailable"; }
    });
  }

  /* ---------------- scoring and planning ---------------- */

  /* ---------------- shopper-experience score (v4): benchmarked on 570+ sites ----------------
     We render the page on a 390px phone (scripts removed, exactly as the live view), measure what a visitor sees, and score it
     against pages we measured the same way: Indian and US D2C brands, large retailers, small unknown stores, fintech and
     healthtech sites. Weights are learned with sign constraints (a signal can only help if CRO practice says it helps),
     and each store score combines the scanned page with a second page from the same site (product page + homepage),
     because in cross-validation that ranked strong vs weak sites correctly far more often than either page alone. */
  function croFeatures(d, w) {
    var VW = 390, VH = 844;
    var sy = w.scrollY || 0;
    function R(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top + sy, w: r.width, h: r.height, b: r.bottom + sy }; }
    function cs(el) { try { return w.getComputedStyle(el); } catch (e) { return null; } }
    function vis(el) {
      if (!el || !el.getBoundingClientRect) return false;
      var r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) return false;
      var s = cs(el); if (!s) return false;
      return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05;
    }
    function tx(el) { return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim(); }
    function all(sel) { try { return Array.prototype.slice.call(d.querySelectorAll(sel)); } catch (e) { return []; } }
    function lum(c) {
      var m = String(c || "").match(/rgba?\(([^)]+)\)/); if (!m) return null;
      var p = m[1].split(",").map(function (x) { return parseFloat(x); });
      if (p.length > 3 && p[3] < 0.1) return null;
      var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
    }
    function bgOf(el) { for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var s = cs(e); var L = s && lum(s.backgroundColor); if (L != null) return L; } return 1; }
    function contrast(a, b) { var hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }
    var body = d.body; if (!body) return null;
    var full = tx(body), low = full.toLowerCase();
    var docH = Math.max(body.scrollHeight, d.documentElement.scrollHeight);
    var F = {};
    F.words = Math.min(6000, full ? full.split(" ").length : 0);
    F.overflow = (d.documentElement.scrollWidth > VW + 12) ? 1 : 0;

    /* main button */
    var ATC = /^(add to (cart|bag|basket)|buy (it )?now|add to order|order now|shop now|add$|buy$|pre-?order|add \+)/i;
    var cta = null, ctaHidden = null;
    /* also catch buy buttons that say more ("Add to Bag - $28", "Select size to add to cart", "Buy for myself") */
    var ATC2 = /\b(add to (cart|bag|basket)|buy (it )?now|buy for (myself|me|yourself)|select (a )?size to add|choose options|pre-?order now)\b/i;
    all("button, input[type=submit], a, [role=button]").some(function (el) {
      var t = tx(el) || el.value || "";
      if (t.length > 48 || !(ATC.test(t) || ATC2.test(t))) return false;
      if (!vis(el)) { if (!ctaHidden) ctaHidden = el; return false; }
      var r = R(el); if (r.w < 60 || r.h < 24) return false;
      cta = el; return true;
    });
    var ctaR = cta ? R(cta) : null;
    /* a buy button that exists in the page but is shown by JavaScript (our render runs no scripts): count it, but as unknown position */
    F.cta_hidden = !cta && ctaHidden ? 1 : 0;
    F.cta_found = cta || ctaHidden ? 1 : 0;
    F.cta_atf = ctaR ? (ctaR.y < VH ? 1 : ctaR.y < VH * 1.6 ? 0.5 : 0) : (F.cta_hidden ? 0.5 : 0);
    F.cta_height = ctaR ? Math.min(64, ctaR.h) : 0;
    F.cta_width = ctaR ? Math.min(1, ctaR.w / (VW - 24)) : 0;
    if (cta) {
      var s = cs(cta), bl = lum(s.backgroundColor), fl = lum(s.color);
      var own = bl == null ? bgOf(cta.parentElement) : bl, page = bgOf(cta.parentElement);
      F.cta_contrast = Math.min(8, contrast(own, page)); // button vs page
      F.cta_text_contrast = Math.min(15, contrast(own, fl == null ? 0 : fl));
      F.cta_filled = bl != null && Math.abs(bl - page) > 0.15 ? 1 : 0;
    } else if (F.cta_hidden) { F.cta_contrast = 2.5; F.cta_text_contrast = 4; F.cta_filled = 0.5; }
    else { F.cta_contrast = 1; F.cta_text_contrast = 1; F.cta_filled = 0; }

    /* price and offer */
    var priceEl = null;
    all("[class*=price], [id*=price], [data-price]").some(function (el) { var t = tx(el); if (!/\d/.test(t) || t.length > 80 || !vis(el)) return false; var r = R(el); if (r.y > 2200) return false; priceEl = el; return true; });
    var pR = priceEl ? R(priceEl) : null;
    var priceHidden = !priceEl && all("[class*=price], [id*=price], [data-price]").some(function (el) { var t = (el.textContent || "").trim(); return /\d/.test(t) && t.length < 80 && /(₹|rs\.?|\$|£|€|inr|usd)/i.test(t); });
    F.price_hidden = priceHidden ? 1 : 0;
    F.price_atf = pR ? (pR.y < VH ? 1 : pR.y < VH * 1.6 ? 0.5 : 0) : (priceHidden ? 0.5 : 0);
    var priceZone = priceEl ? tx(priceEl.parentElement && priceEl.parentElement.parentElement || priceEl).toLowerCase().slice(0, 300) : "";
    F.offer = /(\d{1,2})\s*%\s*off|save\s*(₹|rs|\$|£|\d)|mrp|you save|was\s*(₹|rs|\$|£)|<s>/.test(priceZone) || (priceEl && priceEl.parentElement && priceEl.parentElement.querySelector("s, del, [class*=compare], [class*=regular], [class*=strike]")) ? 1 : 0;
    F.emi = /\bemi\b|pay later|pay in \d|klarna|afterpay|snapmint|simpl|lazypay|interest[- ]free|no[- ]cost/.test(low) ? 1 : 0;

    /* stars and reviews near the title */
    var topTxt = "";
    var h1 = all("h1").filter(vis)[0] || null, h1R = h1 ? R(h1) : null;
    F.h1 = h1 ? 1 : 0;
    F.title_len = h1 ? Math.min(160, tx(h1).length) : 0;
    var ratingEl = null;
    all("[class*=rating], [class*=review], [class*=stars], [class*=star-], [class*=jdgm], [class*=yotpo], [class*=loox], [class*=okendo], [class*=stamped], [class*=trustpilot], [aria-label*=star], [aria-label*=rating]").some(function (el) {
      if (!vis(el)) return false; var r = R(el); if (r.y > 1500) return false;
      if (h1R && Math.abs(r.y - h1R.y) > 600) return false;
      ratingEl = el; return true;
    });
    var ratingText = /(\d(\.\d)?)\s*(\/\s*5|out of 5|stars?|★)|★★|\(\s*\d[\d,]*\s*\)|\d[\d,]*\s*(reviews|ratings)/i;
    F.rating_top = ratingEl ? 1 : 0;
    if (!ratingEl && h1R) {
      var near = all("span, div, a, p").filter(function (el) { if (el.children.length > 3) return false; var t = tx(el); if (!t || t.length > 60) return false; var r = el.getBoundingClientRect(); var y = r.top + sy; return Math.abs(y - h1R.y) < 300 && ratingText.test(t) && r.width > 10; });
      if (near.length) F.rating_top = 1;
    }
    var rc = 0; (full.match(/(\d[\d,]{0,7})\+?\s*(verified\s*)?(reviews|ratings)/gi) || []).forEach(function (m) { var n = parseInt(m.replace(/[^\d]/g, ""), 10); if (n > rc && n < 2000000) rc = n; });
    F.review_count_log = rc ? Math.log10(1 + rc) : 0;
    var cards = all("[class*=review-item], [class*=review_item], [class*=reviewItem], [class*=jdgm-rev], [class*=yotpo-review], [class*=loox-review], [class*=okendo-review], [class*=review-card], [class*=testimonial], [class*=review]").filter(function (el) { var t = tx(el); return t.length > 60 && t.length < 1500 && vis(el); });
    F.review_cards = Math.min(20, cards.length);

    /* product media */
    var big = 0, thumbs = 0, heroArea = 0;
    all("img, picture, video").forEach(function (el) {
      var r = el.getBoundingClientRect(); var y = r.top + sy;
      if (y > 1600 || r.width < 30) return;
      if (r.width >= 200 && r.height >= 150) { big++; heroArea = Math.max(heroArea, Math.min(r.width, VW) * Math.min(r.height, VH)); }
      else if (r.width >= 36 && r.width < 140 && r.height >= 36 && r.height < 160) thumbs++;
    });
    F.gallery = Math.min(10, big + thumbs);
    F.hero_ratio = Math.min(1, heroArea / (VW * VH));
    F.video = all("video").length ? 1 : (/youtube|vimeo|\.mp4|video/.test((body.innerHTML || "").slice(0, 400000).toLowerCase()) ? 0.5 : 0);

    /* reassurance next to the button */
    var TRUST = ["free (shipping|delivery)", "cash on delivery|\\bcod\\b", "return|exchange|refund", "warranty|guarantee", "secure|safe (checkout|payment)", "genuine|authentic|original", "certified|dermatolog|clinically|lab[- ]tested|fssai|hallmark", "made in|handmade|handcrafted|cruelty[- ]free|vegan|natural", "delivery|dispatch|ships", "\\d[\\d,.]*\\s*(k|lakh|l|m)?\\+?\\s*(happy )?(customers|orders|sold|users)"];
    var zone = "";
    if (ctaR) {
      all("div, li, span, p, small, img").forEach(function (el) {
        if (el.children.length > 6) return;
        var r = el.getBoundingClientRect(), y = r.top + sy;
        if (y < ctaR.y - 250 || y > ctaR.b + 650 || r.width < 8) return;
        var t = (el.tagName === "IMG" ? (el.alt || "") : tx(el)); if (t && t.length < 140) zone += " " + t.toLowerCase();
      });
    }
    F.trust_near = TRUST.filter(function (p) { return new RegExp(p).test(zone); }).length;
    F.delivery_near = /(deliver(y|ed|s)?|dispatch(ed|es)?|ships?|arrives?|get it)\s*(by|in|within|on|tomorrow|today)|pin ?code|check delivery|estimated delivery|delivery date/.test(zone) ? 1 : 0;
    F.trust_page = TRUST.filter(function (p) { return new RegExp(p).test(low); }).length;

    /* story and structure */
    var bullets = 0;
    all("li").forEach(function (el) { var r = el.getBoundingClientRect(), y = r.top + sy; var t = tx(el); if (y < 2600 && t.length >= 12 && t.length <= 140 && vis(el) && !el.querySelector("a[href*='/collections'], a[href*='/pages']") && !(el.closest && el.closest("nav, header, footer"))) bullets++; });
    F.benefit_bullets = Math.min(12, bullets);
    var heads = all("main h2, main h3, main h4, h2, h3").filter(function (el) { return vis(el) && !(el.closest && el.closest("header, footer, nav")); }).length;
    F.headings = Math.min(25, heads);
    F.accordions = Math.min(12, all("details, [class*=accordion], [class*=collapsible], [class*=tab-]").filter(vis).length);
    F.faq = /\bfaqs?\b|frequently asked|questions\?/.test(low) ? 1 : 0;
    F.crosssell = /(frequently bought|bought together|you may also like|complete the (look|routine|set)|pairs well|customers also|recommended for you|related products|goes well with|shop the look|bundle)/.test(low) ? 1 : 0;
    F.urgency = /only \d+ left|few left|selling fast|low (in )?stock|hurry|ends (in|tonight|today)|sale ends|\d+\s*(people|customers) (are )?(viewing|bought|watching)|sold in (the )?(last|past)|bought in (the )?(last|past)/.test(low) ? 1 : 0;
    F.social_scale = /(as seen in|featured in|trusted by|\d[\d,.]*\s*(k|lakh|l|m|million)?\+?\s*(happy )?(customers|users|families|orders))/.test(low) ? 1 : 0;
    F.compare_table = all("main table, [class*=compar]").filter(vis).length ? 1 : 0;
    F.breadcrumb = all("[class*=breadcrumb], nav[aria-label*=readcrumb]").length ? 1 : 0;
    F.variants_ui = all("[class*=swatch], variant-radios, fieldset input[type=radio], [class*=variant] button, [class*=option-value], [class*=size-btn]").filter(vis).length ? 1 : (all("select[name*=ption], select[name*=ariant]").length ? 0.5 : 0);
    F.sticky_cta = all("[class*=sticky], [class*=fixed]").some(function (el) { var t = tx(el); return t.length < 300 && /add to (cart|bag)|buy now/i.test(t); }) ? 1 : 0;

    /* friction and clutter */
    var longest = 0; all("p, div").forEach(function (el) { if (el.children.length > 2) return; var t = tx(el); if (t.length > longest && vis(el)) longest = t.length; });
    F.text_wall = longest > 1200 ? 2 : longest > 650 ? 1 : 0;
    var small = 0, sampled = 0, fams = {};
    all("p, span, li, a, div").slice(0, 1500).forEach(function (el) {
      if (el.children.length) return; var t = tx(el); if (t.length < 3) return;
      var r = el.getBoundingClientRect(); if (r.top + sy > 3000 || r.width < 5) return;
      var s = cs(el); if (!s) return; sampled++;
      if (parseFloat(s.fontSize) < 12) small++;
      fams[String(s.fontFamily).split(",")[0].replace(/['"]/g, "").trim().toLowerCase()] = 1;
    });
    F.small_text = sampled ? small / sampled : 0;
    F.font_families = Math.min(8, Object.keys(fams).length);
    var taps = all("a, button").filter(function (el) { var r = el.getBoundingClientRect(); var y = r.top + sy; return y < 2500 && r.width > 4 && r.height > 4 && r.height < 28 && r.width < 28 && vis(el); }).length;
    F.tiny_taps = Math.min(30, taps);
    F.fixed_layers = all("body *").slice(0, 3000).filter(function (el) { var s = cs(el); if (!s || (s.position !== "fixed")) return false; var r = el.getBoundingClientRect(); return r.width * r.height > VW * VH * 0.25 && vis(el); }).length;
    F.announce = all("[class*=announcement], [class*=marquee], [class*=ticker], [class*=topbar], [class*=top-bar]").filter(vis).length ? 1 : 0;
    F.broken_imgs = (function () { var im = all("img").filter(function (i) { var r = i.getBoundingClientRect(); return r.top + sy < 1500 && r.width > 60; }); if (!im.length) return 0; return im.filter(function (i) { return i.complete && i.naturalWidth === 0; }).length / im.length; })();
    F.doc_height_screens = Math.min(20, docH / VH);

    /* ---- extra page content signals (used for findings on every page type) ---- */
    F.how_to_use = /how to (use|apply|wear|style|care|assemble|install)|directions( for use)?|usage|dosage|care instructions|wash care|application/.test(low) ? 1 : 0;
    F.composition = /ingredients?|key actives|formulation|composition|material|fabric|made (of|from|with)|specifications?|specs|tech specs|dimensions|nutrition(al)? (facts|information)|what'?s inside/.test(low) ? 1 : 0;
    F.size_guide = /size (chart|guide)|find your (size|fit)|measurements?|fit guide/.test(low) ? 1 : 0;
    F.dimensions = /dimensions?|\d+\s*(cm|mm|inch|in|ft)\s*(x|×)\s*\d+/.test(low) ? 1 : 0;
    F.free_ship_msg = /free (shipping|delivery)/.test(low) ? 1 : 0;
    F.payment_opts = /\bupi\b|gpay|google pay|phonepe|paytm|visa|mastercard|rupay|cash on delivery|\bcod\b|net ?banking|apple pay|paypal|klarna/.test(low) ? 1 : 0;
    F.returns_msg = /\d+[- ]?days? (easy )?(return|exchange|refund)|easy (returns?|exchange)|free returns?|no questions asked|money[- ]back|return policy/.test(low) ? 1 : 0;
    F.returns_near = /return|exchange|refund|money[- ]back/.test(zone) ? 1 : 0;
    F.certs = /fssai|gmp|iso ?\d|certified|lab[- ]tested|clinically (tested|proven)|dermatologically|hallmark|\bbis\b|fda|ayush|nabl|cruelty[- ]free|vegan certified|peta/.test(low) ? 1 : 0;
    F.photo_reviews = cards.some(function (el) { return el.querySelector && el.querySelector("img"); }) ? 1 : 0;
    F.gift = /gift (wrap|box|card|message|packaging)|gifting|perfect gift/.test(low) ? 1 : 0;
    F.promo_noise = Math.min(12, (full.match(/(\d{1,2})\s*%\s*off|use code|coupon|flat ₹|extra \d+%|buy \d+ get \d+/gi) || []).length);
    F.guarantee = /guarantee|warranty|money[- ]back|risk[- ]free/.test(low) ? 1 : 0;
    F.whatsapp = /wa\.me|whatsapp/.test((body.innerHTML || "").slice(0, 600000).toLowerCase()) ? 1 : 0;
    F.search_box = all("input[type=search], form[action*=search] input, [role=search] input").length || all("a[href*='/search'], [aria-label*=earch]").length ? 1 : 0;

    /* ---- listing signals: product cards (homepage and collection pages) ---- */
    var seenCards = [], cardsInfo = [];
    all("a[href*='/products/'], a[href*='/product/'], a[href*='/p/']").forEach(function (a) {
      var card = a.closest ? (a.closest("li, article, [class*=card], [class*=product-item], [class*=grid__item], [class*=product-tile]") || a.parentElement) : a.parentElement;
      if (!card || seenCards.indexOf(card) >= 0) return;
      var r = card.getBoundingClientRect(); if (r.width < 90 || r.height < 120 || r.width > VW + 5) return;
      if (!card.querySelector("img")) return;
      seenCards.push(card);
      var t = tx(card);
      cardsInfo.push({ y: r.top + sy, price: /(₹|rs\.?|\$|£|€|inr)\s?[\d,]+/i.test(t), rating: /★|(\d\.\d)\s*(\/5|stars?)|\(\s*\d[\d,]*\s*\)|\d+\s*reviews?/i.test(t) || !!card.querySelector("[class*=star], [class*=rating], [class*=review]"),
        add: !!Array.prototype.slice.call(card.querySelectorAll("button, [class*=add], input[type=submit]")).filter(function (b) { return /add|cart|bag|buy|\+/i.test(tx(b) || b.value || b.getAttribute("aria-label") || ""); }).length,
        swatch: !!card.querySelector("[class*=swatch], [class*=color], [class*=colour]"), badge: /(\d{1,2})\s*%\s*off|sale|save|bestseller|best seller|new/i.test(t) });
    });
    var nC = cardsInfo.length || 1;
    F.cards = Math.min(60, cardsInfo.length);
    F.cards_top = Math.min(20, cardsInfo.filter(function (c) { return c.y < VH * 3; }).length);
    F.card_price = cardsInfo.length ? cardsInfo.filter(function (c) { return c.price; }).length / nC : 0;
    F.card_rating = cardsInfo.length ? cardsInfo.filter(function (c) { return c.rating; }).length / nC : 0;
    F.card_add = cardsInfo.length ? cardsInfo.filter(function (c) { return c.add; }).length / nC : 0;
    F.card_swatch = cardsInfo.length ? cardsInfo.filter(function (c) { return c.swatch; }).length / nC : 0;
    F.card_badge = cardsInfo.length ? cardsInfo.filter(function (c) { return c.badge; }).length / nC : 0;
    var firstCard = cardsInfo.length ? Math.min.apply(null, cardsInfo.map(function (c) { return c.y; })) : 99999;
    F.first_product_screens = Math.min(10, firstCard / VH);
    var ctrl = all("button, a, summary, select, label, span").filter(function (el) { var t = tx(el).toLowerCase(); return t.length < 30 && vis(el); });
    F.filter_ui = ctrl.some(function (el) { return /^(filter|filters|refine|filter (by|&|and) sort|show filters)/.test(tx(el).toLowerCase()); }) || all("[class*=filter], facet-filters-form, [id*=filter]").filter(vis).length ? 1 : 0;
    F.sort_ui = ctrl.some(function (el) { return /^sort/.test(tx(el).toLowerCase()); }) || all("select[name*=sort], [class*=sort]").length ? 1 : 0;
    F.product_count = /\b\d+\s*(products|items|results)\b/i.test(full) ? 1 : 0;
    var catLinks = {}; all("a[href*='/collections/'], a[href*='/category'], a[href*='/c/']").forEach(function (a) { var r = a.getBoundingClientRect(); if (r.top + sy < VH * 3 && r.width > 30 && vis(a) && !(a.closest && a.closest("header nav [class*=drawer], footer"))) catLinks[(a.getAttribute("href") || "").split("?")[0]] = 1; });
    F.category_entries = Math.min(20, Object.keys(catLinks).length);
    var heroText = ""; all("h1, h2, p, a, button").forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top + sy < VH && r.width > 40 && vis(el)) heroText += " " + tx(el); });
    F.hero_words = Math.min(80, heroText.trim() ? heroText.trim().split(/\s+/).length : 0);
    var heroBtn = all("a, button").some(function (el) { var r = el.getBoundingClientRect(); var t = tx(el); if (r.top + sy > VH || r.width < 70 || r.height < 28 || !t || t.length > 30 || !vis(el)) return false; var s2 = cs(el); return lum(s2.backgroundColor) != null || /btn|button|cta/i.test(el.className || ""); });
    F.hero_cta = heroBtn ? 1 : 0;
    F.carousel = all("[class*=slider], [class*=carousel], [class*=swiper], [class*=slideshow], slider-component, slideshow-component").filter(function (el) { var r = el.getBoundingClientRect(); return r.top + sy < VH && r.height > 150; }).length ? 1 : 0;
    F.bestsellers = /best ?sellers?|top (picks|rated|selling)|most loved|customer favou?rites|trending/.test(low) ? 1 : 0;
    F.testimonials = /testimonials?|what (our )?customers (say|are saying)|reviews? from|loved by|happy customers|customer stories/.test(low) ? 1 : 0;
    F.collection_desc = all("[class*=collection-description], [class*=collection__description], [class*=category-description], .rte").filter(function (el) { var r = el.getBoundingClientRect(); return r.top + sy < VH * 1.5 && tx(el).length > 40; }).length ? 1 : 0;
    F.newsletter_incentive = (function () { var em = all("input[type=email]"); if (!em.length) return 0; var z = tx(em[0].closest ? (em[0].closest("form, section, div") || em[0]) : em[0]).toLowerCase(); return /%|off|discount|early access|free|exclusive|coupon|₹\s?\d/.test(z) ? 1 : 0.5; })();

    /* ---- lead-gen / service pages (fintech, healthtech, apps, services) ---- */
    (function () {
      var LEAD = /^(get started|sign ?up|start (free|now|investing|trading|your)|open (an? )?(free )?(account|demat)|apply( now)?|check (eligibility|offer)|get (the app|a quote|quote|your|free|instant|loan|card|covered)|book (a |an |your )?(demo|consult|consultation|appointment|test|call|now|free)|talk to|contact (sales|us)|request (a )?(demo|call|callback)|download( the)? app|join (now|free|waitlist)|try (it )?(for )?free|start (a )?free trial|consult now|create account|log ?in to start|invest now|buy (a )?policy|compare)/i;
      var cands = all("a, button, [role=button], input[type=submit]").filter(function (el) { var t = tx(el) || el.value || ""; return t.length <= 40 && LEAD.test(t) && vis(el); });
      var atf = cands.filter(function (el) { var r = R(el); return r.y < VH && r.w >= 70 && r.h >= 28; });
      F.lead_cta_found = cands.length ? 1 : 0;
      F.lead_cta_atf = atf.length ? 1 : 0;
      F.lead_cta_atf_n = Math.min(atf.length, 6);
      var lc = atf[0];
      if (lc) { var st = cs(lc), bgL = lum(st && st.backgroundColor), pb = bgOf(lc.parentElement || lc); F.lead_cta_filled = bgL != null ? 1 : 0; F.lead_cta_contrast = bgL != null ? contrast(bgL, pb) : 1; var rr = R(lc); F.lead_cta_width = rr.w / VW; F.lead_cta_height = Math.min(64, rr.h); } else { F.lead_cta_filled = 0; F.lead_cta_contrast = 1; F.lead_cta_width = 0; F.lead_cta_height = 0; }
      var html = d.documentElement.innerHTML || "";
      F.app_badges = /play\.google\.com\/store|apps\.apple\.com|itunes\.apple\.com/i.test(html) ? 1 : 0;
      F.app_rating = /\b[34]\.\d\s*(★|stars?|rating|on (google play|play store|app store))|rated\s*[34]\.\d/i.test(low) ? 1 : 0;
      F.press = /(as (seen|featured) (in|on)|featured in|in the (news|press)|press coverage|media coverage)/i.test(low) ? 1 : 0;
      F.regulated = /\b(rbi|sebi|irdai|amfi|nbfc|fdic|finra|sipc|hipaa|iso ?27001|soc ?2|pci[- ]dss|nabl|nabh|cap accredited|fda[- ](approved|registered|cleared)|licensed|regulated by|registered with)\b/i.test(low) ? 1 : 0;
      F.security = /(bank[- ]grade|256[- ]bit|encrypt|secure(d)? (by|with)|data (is )?(safe|secure|protected)|privacy[- ]first|we never share)/i.test(low) ? 1 : 0;
      var stats = low.match(/\b\d[\d,.]*\s?(\+|k\+|m\+|lakh\+?|crore\+?|cr\+?|million\+?|billion\+?|mn\+?)\s*(happy |active |trusted |satisfied )?(users|customers|investors|patients|members|downloads|businesses|merchants|families|people|consultations|doctors|clients|traders|policies)/g) || [];
      F.stat_claims = Math.min(stats.length, 5);
      F.logos_strip = (function () { var n = 0; all("img").forEach(function (im) { var a = ((im.getAttribute("alt") || "") + " " + (im.getAttribute("src") || "")).toLowerCase(); if (/logo|partner|client|investor|backed|press/.test(a)) n++; }); return Math.min(n, 12); })();
      F.pricing_link = all("a").some(function (a) { return /pricing|plans|fees|charges|brokerage|interest rates?|premium/i.test(tx(a)) && tx(a).length < 30; }) ? 1 : 0;
      var forms = all("form").filter(function (f0) { return vis(f0); });
      F.form_atf = forms.some(function (f0) { return R(f0).y < VH * 1.2 && f0.querySelectorAll("input:not([type=hidden]):not([type=submit]), select").length >= 1; }) ? 1 : 0;
      F.form_fields = forms.length ? Math.min(12, Math.max.apply(null, forms.map(function (f0) { return f0.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=checkbox]), select, textarea").length; }))) : 0;
      F.how_it_works = /(how it works|how does it work|in \d simple steps|step 1|3 easy steps|get started in)/i.test(low) ? 1 : 0;
      F.calculator = /(calculator|emi calc|check (your )?(eligibility|premium|returns)|estimate (your|savings))/i.test(low) ? 1 : 0;
      F.doctor_proof = /(\d+\+?\s*(years|yrs) (of )?experience|board[- ]certified|mbbs|md\b|specialists?|qualified doctors|expert doctors)/i.test(low) ? 1 : 0;
      F.feature_sections = Math.min(all("section, [class*=section]").filter(function (x) { return vis(x) && R(x).h > 200; }).length, 20);
      var heroEl = all("h1, h2").filter(function (h) { return vis(h) && R(h).y < VH; })[0];
      F.hero_head_words = heroEl ? Math.min(40, tx(heroEl).split(" ").length) : 0;
      F.hero_head_size = heroEl ? Math.min(64, parseFloat((cs(heroEl) || {}).fontSize) || 0) : 0;
    })();

    /* ---- how complete our render is (scripts off): low when key parts only appear with JavaScript ---- */
    F.render_conf = Math.max(0, Math.min(1, 1 - 0.3 * (F.cta_hidden || 0) - 0.2 * (F.price_hidden || 0) - ((F.words || 0) < 150 ? 0.3 : 0) - ((F.headings || 0) === 0 ? 0.15 : 0) - ((F.gallery || 0) <= 1 && !(F.cards >= 3) ? 0.15 : 0)));

    /* ---- signals that mirror TrooUIUX Scanner rules (used by findings, not by the score) ---- */
    F.cards_atf = Math.min(20, cardsInfo.filter(function (c) { return c.y < VH - 80; }).length);
    F.delivery_any = /(deliver(y|ed|s)?|dispatch(ed|es)?|ships?|arrives?|get it)\s*(by|in|within|on|tomorrow|today)|pin ?code|check delivery|estimated delivery|delivery date|same[- ]day delivery|next[- ]day delivery/.test(low) ? 1 : 0;
    F.cod_any = /cash on delivery|\bcod\b/.test(low) ? 1 : 0;
    F.lorem = /lorem ipsum|dolor sit amet|consectetur adipiscing|your (text|title|content) here|placeholder text/.test(low) ? 1 : 0;
    F.india = /₹|\brs\.?\s?\d|\binr\b/.test(low) ? 1 : 0;
    F.rating_any = (F.review_count_log > 0 || F.review_cards > 0 || F.rating_top || /\b[1-5](\.\d)?\s*(\/\s*5|out of 5|stars?)\b|★/.test(low)) ? 1 : 0;
    F.solid_atf = (function () {
      var seen = {}, n = 0;
      all("a, button, [role=button], input[type=submit]").forEach(function (el) {
        if (n > 12 || !vis(el)) return;
        var r = el.getBoundingClientRect(), y = r.top + sy; if (y > VH || r.width < 60 || r.height < 28) return;
        var st = cs(el), bl = st && lum(st.backgroundColor); if (bl == null) return;
        if (Math.abs(bl - bgOf(el.parentElement || el)) < 0.15) return;
        var t = (tx(el) || el.value || "").toLowerCase().slice(0, 30); if (!t || seen[t]) return;
        seen[t] = 1; n++;
      });
      return n;
    })();

    /* paragraphs over 110 words (Scanner "para" rule); counted on leaf text blocks */
    F.long_paras = Math.min(10, all("p, li, div").filter(function (el) {
      if (!vis(el)) return false;
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) { var d0 = (cs(c) || {}).display || ""; if (/block|flex|grid|table|list-item/.test(d0)) return false; }
      return tx(el).split(" ").length > 110;
    }).length);
    /* broader read of a sign-up site's main action (rule use only; the score keeps the original measure) */
    (function () {
      var LEAD2 = /^(get started|get going|sign ?up|start\b|open (an? )?(free )?(account|demat)|apply|check (eligibility|offer|your|now|rates?|score|price)|get (the app|app|a quote|quote|your|free|instant|loan|card|covered|started)|book\b|talk to|chat with|contact (sales|us)|request|download|install|join\b|try\b|consult|create (an? )?account|invest|buy (a )?(policy|plan|insurance)|compare|explore (plans|products|now)|find (a |the )?(doctor|hospital|clinic|lab|test|plan)|search (doctors|hospitals|clinics)|schedule|claim|enrol|enroll|calculate|see (plans|pricing|how)|view plans|shop now|order now)/i;
      var cand = all("a, button, [role=button], input[type=submit]").filter(function (el) { var t = tx(el) || el.value || ""; return t.length <= 44 && LEAD2.test(t); });
      var shown = cand.filter(vis), atf = shown.filter(function (el) { var r = R(el); return r.y < VH && r.w >= 60 && r.h >= 24; });
      F.lead_cta2_found = shown.length ? 1 : 0;
      F.lead_cta2_hidden = !shown.length && cand.length ? 1 : 0;
      F.lead_cta2_atf = atf.length ? 1 : 0;
      var c0 = atf[0];
      if (c0) {
        var st = cs(c0) || {}, bgL = lum(st.backgroundColor), grad = /gradient|url\(/i.test(st.backgroundImage || ""), rr = R(c0);
        /* the section behind the button: first ancestor with a different colour; a photo or gradient behind it can't be judged, so it isn't penalised */
        var secL = 1, secImg = false;
        for (var e0 = c0.parentElement; e0 && e0.nodeType === 1; e0 = e0.parentElement) {
          var s0 = cs(e0); if (!s0) continue;
          if (/url\(|gradient/i.test(s0.backgroundImage || "")) { secImg = true; break; }
          var l0 = lum(s0.backgroundColor); if (l0 != null && (bgL == null || Math.abs(l0 - bgL) > 0.02)) { secL = l0; break; }
        }
        F.lead_cta2_filled = bgL != null || grad ? 1 : 0;
        F.lead_cta2_contrast = secImg || grad ? 3 : bgL != null ? contrast(bgL, secL) : 1;
        F.lead_cta2_height = Math.min(64, rr.h); F.lead_cta2_width = rr.w / VW;
      } else { F.lead_cta2_filled = 0; F.lead_cta2_contrast = 1; F.lead_cta2_height = 0; F.lead_cta2_width = 0; }
    })();
    /* ---- design-quality signals (how polished the page looks, from the DOM) ---- */
    (function () {
      var H2 = VH * 2, sizes = {}, colors = {}, fams = {}, caps = 0, chars = 0, leaves = 0, sat = 0, boxes = 0, emoji = 0, imgArea = 0, lowres = 0, imgs = 0;
      function rgb(c) { var m = String(c || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; var p = m[1].split(",").map(parseFloat); if (p.length > 3 && p[3] < 0.2) return null; return p; }
      function satOf(p) { var r = p[0] / 255, g = p[1] / 255, b = p[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return 0; return (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn); }
      var els = all("body *"), n = 0;
      for (var i = 0; i < els.length && n < 4000; i++) {
        var el = els[i]; n++;
        var r0 = el.getBoundingClientRect(); if (r0.width < 4 || r0.height < 4) continue;
        var y0 = r0.top + sy; if (y0 > H2) continue;
        var st = cs(el); if (!st || st.display === "none" || st.visibility === "hidden") continue;
        var own = ""; for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
        own = own.replace(/\s+/g, " ").trim();
        if (own.length > 1) {
          leaves++; sizes[Math.round(parseFloat(st.fontSize))] = 1; colors[st.color] = 1; fams[(st.fontFamily || "").split(",")[0].trim().toLowerCase()] = 1;
          chars += own.length; caps += (own.match(/[A-Z]/g) || []).length + (st.textTransform === "uppercase" ? (own.match(/[a-z]/g) || []).length : 0);
          emoji += (own.match(/[\u{1F300}-\u{1FAFF}☀-➿]/gu) || []).length;
        }
        var bg = rgb(st.backgroundColor);
        if (bg && r0.width > VW * 0.6 && r0.height > 18 && r0.height < 160 && satOf(bg) > 0.55 && (bg[0] + bg[1] + bg[2]) > 120) sat++;
        if (parseFloat(st.borderTopWidth) >= 1 && st.borderTopStyle !== "none" && parseFloat(st.borderLeftWidth) >= 1 && r0.width > 60 && r0.height > 24) boxes++;
        if (el.tagName === "IMG" && y0 < VH) {
          var vis_h = Math.max(0, Math.min(VH, y0 + r0.height) - Math.max(0, y0)); imgArea += Math.min(VW, r0.width) * vis_h;
          if (r0.width > 120) { imgs++; if (el.naturalWidth && el.naturalWidth < r0.width * 1.4) lowres++; }
        }
      }
      F.d_font_sizes = Math.min(Object.keys(sizes).length, 20);
      F.d_colors = Math.min(Object.keys(colors).length, 20);
      F.d_fonts = Math.min(Object.keys(fams).length, 8);
      F.d_caps = chars ? Math.min(1, caps / chars) : 0;
      F.d_leaves = Math.min(leaves, 300);
      F.d_sat_bands = Math.min(sat, 10);
      F.d_boxes = Math.min(boxes, 60);
      F.d_emoji = Math.min(emoji, 20);
      F.d_img_cover = Math.min(1, imgArea / (VW * VH));
      F.d_lowres = imgs ? lowres / imgs : 0;
    })();
    return F;
  }
  var MODELS = {"PDP": {"names": ["d_caps", "d_emoji", "d_img", "cta_atf", "cta_filled", "sticky_cta", "price_atf", "rating_top", "offer", "delivery_near", "trust_near", "benefits", "structure", "breadcrumb", "compare", "faq", "social", "reviews", "gallery", "video", "crosssell", "variants", "cta_contrast", "no_overflow", "short_title", "no_wall", "no_popup", "returns_near", "free_ship", "payment_opts", "how_to_use", "composition", "guarantee", "calm_promos"], "mu": [0.641, 0.8868, 0.8198, 0.5108, 0.6369, 0.4154, 0.6846, 0.44, 0.5415, 0.2369, 0.3515, 0.5046, 0.4265, 0.5415, 0.2923, 0.5662, 0.1138, 0.1088, 0.8021, 0.5154, 0.3015, 0.3323, 0.6681, 0.9046, 0.9624, 0.2523, 0.7785, 0.2923, 0.4615, 0.2031, 0.2769, 0.6862, 0.3169, 0.7496], "sd": [0.2315, 0.2681, 0.3116, 0.3871, 0.4596, 0.4928, 0.386, 0.4964, 0.4983, 0.4252, 0.3437, 0.4511, 0.3677, 0.4983, 0.4548, 0.4956, 0.3176, 0.2751, 0.3054, 0.3009, 0.4589, 0.4628, 0.3359, 0.2937, 0.1536, 0.3651, 0.4153, 0.4548, 0.4985, 0.4023, 0.4475, 0.4641, 0.4653, 0.3166], "w": [0.0239, 0.0508, 0.013, 0.0103, 0.002, 0.0, 0.0077, 0.034, 0.0, 0.0011, 0.0, 0.0095, 0.0165, 0.0214, 0.0, 0.0344, 0.0165, 0.0775, 0.01, 0.0204, 0.0054, 0.0251, 0.0387, 0.0128, 0.0576, 0.0545, 0.0271, 0.0162, 0.027, 0.0, 0.0181, 0.0099, 0.0313, 0.0049], "anchors": [-0.0798, -0.0087, 0.0646], "n": 325, "zc": 1.5, "blend": {"homeW": 0.30000000000000004, "anchors": [33.41, 52.83, 70.46], "n": 322, "conf": false}}, "HOME": {"names": ["d_caps", "d_emoji", "d_img", "hero_cta", "hero_clear", "categories", "products_early", "card_price", "card_rating", "proof", "trust", "bestsellers", "search", "no_carousel", "no_overflow", "no_popup", "calm_promos", "products_soon", "newsletter", "structure", "press", "stats", "logos", "sections", "hero_size", "no_wall"], "mu": [0.5331, 0.9003, 0.8458, 0.6781, 0.3588, 0.6398, 0.4617, 0.2422, 0.1415, 0.3799, 0.5161, 0.5989, 0.8786, 0.3826, 0.9393, 0.8074, 0.6471, 0.4198, 0.3351, 0.6888, 0.0844, 0.0422, 0.5123, 0.8517, 0.5527, 0.2454], "sd": [0.2822, 0.2609, 0.3139, 0.4672, 0.4797, 0.3972, 0.459, 0.3824, 0.3123, 0.4854, 0.2989, 0.4901, 0.3266, 0.486, 0.2388, 0.3944, 0.4054, 0.3966, 0.2513, 0.3531, 0.278, 0.1531, 0.3817, 0.2976, 0.3289, 0.3693], "w": [0.0411, 0.0518, 0.0221, 0.02, 0.0027, 0.0, 0.0, 0.0, 0.0215, 0.0, 0.0, 0.0312, 0.0, 0.0882, 0.0224, 0.0266, 0.0, 0.0111, 0.0241, 0.0, 0.0357, 0.0265, 0.0, 0.0, 0.0226, 0.0351], "anchors": [-0.0517, -0.0245, 0.0421], "n": 379, "zc": 1.5, "blend": {"pdpW": 0.5, "anchors": [34.03, 51.26, 70.94], "n": 322, "conf": false}}, "COLLECTION": {"names": ["d_caps", "d_emoji", "d_img", "products_early", "card_price", "card_rating", "card_add", "card_swatch", "card_badge", "filter", "sort", "count", "desc", "breadcrumb", "products_soon", "no_overflow", "no_popup", "calm_promos", "title", "structure"], "mu": [0.5385, 0.895, 0.76, 0.8923, 0.3771, 0.2317, 0.2222, 0.1962, 0.2816, 0.7857, 0.7395, 0.395, 0.2395, 0.4748, 0.7996, 0.9622, 0.7857, 0.6234, 0.6933, 0.479], "sd": [0.2581, 0.2661, 0.3013, 0.2269, 0.4421, 0.3879, 0.38, 0.3647, 0.3881, 0.4103, 0.4389, 0.4888, 0.4268, 0.4994, 0.1696, 0.1907, 0.4103, 0.4308, 0.4611, 0.4362], "w": [0.0218, 0.0452, 0.0608, 0.012, 0.0175, 0.0388, 0.0, 0.0329, 0.018, 0.0, 0.0, 0.0231, 0.0139, 0.0048, 0.006, 0.0351, 0.0458, 0.0, 0.0147, 0.0497], "anchors": [-0.0275, 0.0043, 0.0414], "n": 238, "zc": 1.5, "blend": {"pdpW": 0.7, "anchors": [32.05, 58.26, 69.49], "n": 228, "conf": false}}, "LEAD": {"names": ["d_caps", "d_emoji", "d_img", "cta_atf", "cta_found", "cta_filled", "cta_contrast", "cta_width", "focused", "app", "app_rating", "press", "regulated", "security", "stats", "logos", "pricing", "form_atf", "how_it_works", "calculator", "experts", "testimonials", "faq", "structure", "sections", "hero_clear", "hero_size", "no_overflow", "no_popup", "no_wall", "calm_promos"], "mu": [0.787, 0.9804, 0.5068, 0.4196, 0.8112, 0.2867, 0.4255, 0.3004, 0.3636, 0.3566, 0.0629, 0.1329, 0.6434, 0.1119, 0.1445, 0.5303, 0.4476, 0.1608, 0.1608, 0.3636, 0.2727, 0.2448, 0.4336, 0.7338, 0.6168, 0.7552, 0.604, 0.8182, 0.8042, 0.1294, 0.9353], "sd": [0.1517, 0.0955, 0.402, 0.4935, 0.3914, 0.4522, 0.3073, 0.3843, 0.481, 0.479, 0.2428, 0.3394, 0.479, 0.3152, 0.2602, 0.395, 0.4972, 0.3674, 0.3674, 0.481, 0.4454, 0.4299, 0.4956, 0.3305, 0.3821, 0.4299, 0.3432, 0.3857, 0.3968, 0.2755, 0.2074], "w": [0.0144, 0.0661, 0.0081, 0.0, 0.0215, 0.0029, 0.0009, 0.0, 0.0229, 0.0, 0.0455, 0.0456, 0.0329, 0.0422, 0.0349, 0.0, 0.0236, 0.0502, 0.0591, 0.0, 0.0312, 0.0167, 0.0205, 0.0, 0.0303, 0.0245, 0.0227, 0.0171, 0.0678, 0.0, 0.0172], "anchors": [-0.1085, -0.0242, 0.0807], "n": 143, "zc": 1.5}};
  function mCap(v, c) { return Math.min(+v || 0, c) / c; }
  function mG(f, k) { return +f[k] || 0; }
  function designVec(f) { return { d_caps: 1 - Math.min(1, mG(f, "d_caps") / 0.5), d_emoji: 1 - mCap(mG(f, "d_emoji"), 5), d_img: mCap(mG(f, "d_img_cover"), 0.6) }; }
  function vecOf(T, f) {
    var g = function (k) { return mG(f, k); }, v;
    if (T === "PDP") v = { cta_atf: g("cta_atf"), cta_filled: g("cta_filled"), sticky_cta: g("sticky_cta"), price_atf: g("price_atf"), rating_top: g("rating_top"), offer: g("offer"), delivery_near: g("delivery_near"), trust_near: mCap(g("trust_near"), 4), benefits: mCap(g("benefit_bullets"), 6), structure: mCap(g("headings"), 15), breadcrumb: g("breadcrumb"), compare: g("compare_table"), faq: g("faq"), social: g("social_scale"), reviews: mCap(g("review_count_log"), 3), gallery: mCap(g("gallery"), 6), video: g("video"), crosssell: g("crosssell"), variants: g("variants_ui"), cta_contrast: mCap(g("cta_contrast"), 4), no_overflow: 1 - g("overflow"), short_title: 1 - Math.min(1, Math.max(0, (g("title_len") - 60) / 60)), no_wall: 1 - g("text_wall") / 2, no_popup: 1 - Math.min(g("fixed_layers"), 1), returns_near: g("returns_near"), free_ship: g("free_ship_msg"), payment_opts: g("payment_opts"), how_to_use: g("how_to_use"), composition: g("composition"), guarantee: g("guarantee"), calm_promos: 1 - mCap(g("promo_noise"), 8) };
    else if (T === "HOME") { var hw = g("hero_words"); v = { hero_cta: g("hero_cta"), hero_clear: hw >= 4 && hw <= 40 ? 1 : 0, categories: mCap(g("category_entries"), 8), products_early: mCap(g("cards_top"), 8), card_price: g("card_price"), card_rating: g("card_rating"), proof: Math.max(g("social_scale"), g("testimonials"), g("rating_top")), trust: mCap(g("trust_page"), 5), bestsellers: g("bestsellers"), search: g("search_box"), no_carousel: 1 - g("carousel"), no_overflow: 1 - g("overflow"), no_popup: 1 - Math.min(g("fixed_layers"), 1), calm_promos: 1 - mCap(g("promo_noise"), 8), products_soon: 1 - Math.min(1, (g("first_product_screens") || 10) / 4), newsletter: g("newsletter_incentive"), structure: mCap(g("headings"), 15), press: g("press"), stats: mCap(g("stat_claims"), 3), logos: mCap(g("logos_strip"), 6), sections: mCap(g("feature_sections"), 10), hero_size: mCap(g("hero_head_size"), 40), no_wall: 1 - g("text_wall") / 2 }; }
    else if (T === "COLLECTION") v = { products_early: mCap(g("cards_top"), 8), card_price: g("card_price"), card_rating: g("card_rating"), card_add: g("card_add"), card_swatch: g("card_swatch"), card_badge: g("card_badge"), filter: g("filter_ui"), sort: g("sort_ui"), count: g("product_count"), desc: g("collection_desc"), breadcrumb: g("breadcrumb"), products_soon: 1 - Math.min(1, (g("first_product_screens") || 10) / 3), no_overflow: 1 - g("overflow"), no_popup: 1 - Math.min(g("fixed_layers"), 1), calm_promos: 1 - mCap(g("promo_noise"), 8), title: g("h1"), structure: mCap(g("headings"), 15) };
    else { var n = g("lead_cta_atf_n"), hw2 = g("hero_head_words"); v = { cta_atf: g("lead_cta_atf"), cta_found: g("lead_cta_found"), cta_filled: g("lead_cta_filled"), cta_contrast: mCap(g("lead_cta_contrast"), 4), cta_width: Math.min(1, g("lead_cta_width") / 0.6), focused: n >= 1 && n <= 2 ? 1 : 0, app: g("app_badges"), app_rating: g("app_rating"), press: g("press"), regulated: g("regulated"), security: g("security"), stats: mCap(g("stat_claims"), 3), logos: mCap(g("logos_strip"), 6), pricing: g("pricing_link"), form_atf: g("form_atf"), how_it_works: g("how_it_works"), calculator: g("calculator"), experts: g("doctor_proof"), testimonials: g("testimonials"), faq: g("faq"), structure: mCap(g("headings"), 15), sections: mCap(g("feature_sections"), 10), hero_clear: hw2 >= 3 && hw2 <= 14 ? 1 : 0, hero_size: mCap(g("hero_head_size"), 40), no_overflow: 1 - g("overflow"), no_popup: 1 - Math.min(g("fixed_layers"), 1), no_wall: 1 - g("text_wall") / 2, calm_promos: 1 - mCap(g("promo_noise"), 8) }; }
    var d = designVec(f); for (var k in d) v[k] = d[k];
    return v;
  }
  function softCal(raw, a) {
    if (raw >= a[2]) return 80 + 18 * (1 - Math.exp(-(raw - a[2]) / Math.max(1e-6, a[2] - a[1])));
    if (raw <= a[0]) return 30 - 25 * (1 - Math.exp(-(a[0] - raw) / Math.max(1e-6, a[1] - a[0])));
    return raw <= a[1] ? 30 + 25 * (raw - a[0]) / (a[1] - a[0]) : 55 + 25 * (raw - a[1]) / (a[2] - a[1]);
  }
  function modelScore(T, f) {
    var m = MODELS[T]; if (!m || !f) return null;
    var v = vecOf(T, f), raw = 0, parts = [];
    m.names.forEach(function (n, i) { var z = ((+v[n] || 0) - m.mu[i]) / m.sd[i]; z = Math.max(-m.zc, Math.min(m.zc, z)); var c = m.w[i] * z; raw += c; if (m.w[i] > 0) parts.push({ k: n, c: c }); });
    parts.sort(function (x, y) { return y.c - x.c; });
    return { score: softCal(raw, m.anchors), raw: raw, up: parts.filter(function (x) { return x.c > 0.004; }).slice(0, 4).map(function (x) { return x.k; }),
      down: parts.filter(function (x) { return x.c < -0.004; }).reverse().slice(0, 4).map(function (x) { return x.k; }) };
  }
  var CRO_LABEL = {
    cta_atf: "Main button on the first screen", cta_filled: "Solid main button", sticky_cta: "Button stays in reach while scrolling", price_atf: "Price on the first screen",
    rating_top: "Stars near the product name", offer: "A clear offer", delivery_near: "Delivery info by the button", trust_near: "Reassurance by the button", benefits: "Scannable benefit points",
    structure: "Well-structured page", breadcrumb: "Breadcrumbs", compare: "Comparison table", faq: "FAQs", social: "Customer numbers", reviews: "Review volume", gallery: "Enough product photos",
    video: "Product video", crosssell: "Bundles or cross-sell", variants: "Clear variant picker", cta_contrast: "Button stands out", no_overflow: "Fits the phone screen", short_title: "Short, clear title",
    no_wall: "No walls of text", no_popup: "No popup covering the page", returns_near: "Returns shown by the button", free_ship: "Free-shipping message", payment_opts: "Payment options shown",
    how_to_use: "How-to-use guidance", composition: "Ingredients or materials", guarantee: "A guarantee", calm_promos: "Offers kept focused",
    hero_cta: "A clear action in the first screen", hero_clear: "First screen says what you sell", categories: "Categories visible early", products_early: "Products fill the first screens",
    card_price: "Prices on product cards", card_rating: "Ratings on product cards", proof: "Reviews or customer proof", trust: "Shipping, returns and payment reassurance", bestsellers: "Bestsellers featured",
    search: "Visible search", no_carousel: "One focused hero, not a carousel", products_soon: "Products appear early", newsletter: "Sign-up with a clear incentive", press: "Press or partner mentions",
    stats: "Customer numbers", logos: "Partner or press logos", sections: "Clear page sections", hero_size: "A bold headline", card_add: "Quick add on product cards", card_swatch: "Colour options on cards",
    card_badge: "Badges on cards", filter: "Filters", sort: "Sorting", count: "Product count shown", desc: "Collection intro", title: "Clear collection title",
    cta_found: "A sign-up or apply action", cta_width: "A large, easy-to-tap button", focused: "One or two focused actions", app: "App store links", app_rating: "App rating shown", regulated: "Licence or regulation shown",
    security: "Data-security reassurance", pricing: "Pricing or fees easy to find", form_atf: "Form or entry point near the top", how_it_works: "How it works", calculator: "Calculator or eligibility check",
    experts: "Expert or doctor credentials", testimonials: "Testimonials", d_caps: "Calm typography (not all caps)", d_emoji: "No emoji clutter", d_img: "Strong visuals on the first screen"
  };
  var RUBRIC_LABEL = CRO_LABEL;
  var CRO_LABEL_NEG = {
    cta_atf: "Main button below the first screen", cta_filled: "Main button is outlined, not solid", sticky_cta: "No sticky buy button", price_atf: "Price below the first screen",
    rating_top: "No stars near the product name", offer: "No clear offer", delivery_near: "No delivery info by the button", trust_near: "Little reassurance by the button", benefits: "No scannable benefit points",
    structure: "Page not broken into sections", breadcrumb: "No breadcrumbs", compare: "No comparison table", faq: "No FAQs", social: "No customer numbers", reviews: "Few reviews",
    gallery: "Few product photos", video: "No product video", crosssell: "No bundles or cross-sell", variants: "Unclear variant picker", cta_contrast: "Main button doesn't stand out",
    no_overflow: "Page wider than the phone", short_title: "Long product name", no_wall: "Walls of text", no_popup: "Popup covering the page", returns_near: "Returns not shown by the button",
    free_ship: "No free-shipping message", payment_opts: "Payment options not shown", how_to_use: "No how-to-use guidance", composition: "No ingredients or materials", guarantee: "No guarantee",
    calm_promos: "Too many competing offers", hero_cta: "No clear action in the first screen", hero_clear: "First screen doesn't say what you sell", categories: "Few categories up top",
    products_early: "Few products in the first screens", card_price: "Cards without prices", card_rating: "Cards without ratings", proof: "No reviews or customer proof",
    trust: "Little shipping, returns or payment reassurance", bestsellers: "No bestsellers featured", search: "No visible search", no_carousel: "Rotating hero carousel", products_soon: "Products appear late",
    newsletter: "Sign-up without a reason", press: "No press or partner mentions", stats: "No customer numbers", logos: "No partner or press logos", sections: "Few clear page sections",
    hero_size: "Headline doesn't stand out", card_add: "No quick add on cards", card_swatch: "No colour options on cards", card_badge: "No badges on cards", filter: "No filters", sort: "No sorting",
    count: "Product count not shown", desc: "No collection intro", title: "No clear collection title", cta_found: "No sign-up or apply action", cta_width: "Small main button",
    focused: "Too many competing actions", app: "No app store links", app_rating: "No app rating shown", regulated: "No licence or regulation shown", security: "No data-security reassurance",
    pricing: "Pricing or fees hard to find", form_atf: "No form or entry point near the top", how_it_works: "No how-it-works section", calculator: "No calculator or eligibility check",
    experts: "No expert or doctor credentials", testimonials: "No testimonials", d_caps: "Lots of ALL-CAPS text", d_emoji: "Emoji clutter", d_img: "Weak visuals on the first screen"
  };

  function howV4(R) {
    var c = R.cro, T = c.labels, what = T === "LEAD" ? "a sign-up site: whether the first screen says what you offer and gives one clear action, and whether you show proof, licences, data security, pricing and how it works"
      : T === "PDP" ? "a product page: the main button and price on the first screen, stars near the name, delivery and returns by the button, reviews, photos, structure and clutter"
      : T === "COLLECTION" ? "a collection: products in the first screens, prices and ratings on cards, filters, sorting and clutter" : "a homepage: a clear promise and action up top, bestsellers, proof, a focused hero instead of a carousel, and clutter";
    var t = "We load your page on a 390px phone, the way a visitor sees it, and measure it as " + what + ". ";
    t += "We measured 570+ sites the same way: Indian and US D2C brands, big retailers, small unknown stores, fintech and healthtech. The weights come from what separated the strong sites from the weak ones, and a signal can only add to your score if CRO practice says it helps. ";
    if (c.kind === "blend" && c.side) t += (c.side.type === "HOME" ? "We also measured your homepage (" + c.side.score + "/100). Your score combines both pages, this page weighted 70% and the homepage 30%, and ranks the result against the benchmark. " : "We also measured one of your product pages (" + c.side.score + "/100). Your score combines both pages, this page weighted " + (T === "HOME" ? "50%" : "30%") + " and the product page " + (T === "HOME" ? "50%" : "70%") + ", and ranks the result against the benchmark. ") + "Judging two pages of the same site separates strong and weak stores more reliably than one page. ";
    else if (T !== "LEAD") t += "This score is based on this page. ";
    t += "A weak site typically scores around 30, an average one around 55 and a strong one 80 or more.";
    t += R.psi ? " Google PageSpeed counts for 20%." : " Speed, search and accessibility are shown for context and don’t change this score.";
    return t;
  }
  /* Lead-gen sites (fintech, healthtech, services): no cart, no product cards, but a sign-up, apply or booking action. */
  function isLeadPage(f, page) {
    if (!f) return false;
    if (page && /shopify|woocommerce|magento|bigcommerce|wix stores|salesforce commerce/i.test(page.platform || "")) return false;
    if (page && page.pageType === "PDP") return false;
    return !f.cta_found && (f.cards || 0) < 3 && !f.price_atf && !!(f.lead_cta_found || f.form_atf || f.app_badges || f.regulated);
  }
  /* The score of a store page uses a second page of the same site: product page + homepage. */
  function croScore(f, pageType, side, lead) {
    if (!f) return null;
    var T = lead ? "LEAD" : pageType === "PDP" || !pageType ? "PDP" : pageType === "COLLECTION" ? "COLLECTION" : "HOME";
    var own = modelScore(T, f); if (!own) return null;
    var out = { page: Math.round(own.score), up: own.up, down: own.down, f: f, v: 4, labels: T, kind: "model", n: MODELS[T].n, score: Math.round(own.score) };
    var B = MODELS[T].blend;
    /* a product page is paired with the homepage; a homepage or collection with a product page. Anything else stays single-page. */
    var oT = T === "PDP" ? "HOME" : "PDP";
    if (B && side && side.f && side.type === oT) {
      var o = modelScore(oT, side.f);
      if (o) {
        var wPdp = T === "PDP" ? 1 - B.homeW : B.pdpW, sP = T === "PDP" ? own.score : o.score, sO = T === "PDP" ? o.score : own.score;
        out.kind = "blend"; out.side = { type: oT, score: Math.round(o.score), url: side.url }; out.score = Math.round(softCal(wPdp * sP + (1 - wPdp) * sO, B.anchors)); out.n = B.n;
      }
    }
    return out;
  }
  /* The second page counts toward the score, so its biggest issues are listed too (one priority step lower than the scanned page's own). */
  function addSideFindings(R, side, type) {
    var rc = renderedChecks(side.f, { pageType: type, category: (R.page || {}).category || "" }), label = type === "HOME" ? "Homepage" : "Product page";
    R.lib = R.lib || { signals: {}, barriers: {}, rootCauses: {} };
    var fails = rc.checks.filter(function (c) { return c.status === "fail" && !JS_REVIEW_RULES[c.key]; }).map(function (c) { return { c: c, s: rc.signals[c.signal] }; });
    fails.sort(function (a, b) { return (b.s.severity || 1) - (a.s.severity || 1); });
    fails.slice(0, 4).forEach(function (x) {
      var key = "side_" + x.c.key, id = "TC-SIDE-" + x.c.key.toUpperCase();
      R.checks = (R.checks || []).filter(function (c) { return c.key !== key; });
      R.checks.push({ key: key, signal: id, status: "fail", evidence: label + ": " + x.c.evidence, confidence: "high", rendered: true, uiux: x.c.uiux, side: type });
      R.lib.signals[id] = Object.assign({}, x.s, { name: label + ": " + x.s.name, severity: Math.max(1, (x.s.severity || 2) - 1) });
      SHORT[key] = label + ": " + (SHORT[x.c.key] || x.s.name).replace(/ on the homepage$/i, "").replace(/^./, function (m) { return m.toLowerCase(); });
    });
  }
  function croScoreOf(f) { var m = modelScore("PDP", f); return m ? { score: Math.round(m.score) } : null; }
  function productLinkOf(html, base) {
    var re = /href\s*=\s*["']([^"'#?]*\/products?\/[^"'#?\/]+)/gi, m, seen = 0;
    while ((m = re.exec(html)) && seen < 40) {
      seen++;
      try { var u = new URL(m[1].replace(/&amp;/g, "&"), base); if (u.hostname.replace(/^www\./, "") === new URL(base).hostname.replace(/^www\./, "") && !/\.(js|css|json|png|jpe?g|webp)$/i.test(u.pathname)) return u.href; } catch (e) {}
    }
    return null;
  }
  /* measure in a hidden phone-sized frame, exactly like the benchmark */
  function measureCro(html) {
    return new Promise(function (res) {
      var fr = doc.createElement("iframe"), done = false;
      fr.setAttribute("sandbox", "allow-same-origin"); fr.setAttribute("aria-hidden", "true"); fr.tabIndex = -1;
      fr.style.cssText = "position:absolute;left:-10000px;top:0;width:390px;height:844px;border:0;visibility:hidden;pointer-events:none";
      fr.srcdoc = html; doc.body.appendChild(fr);
      function finish(x) { if (done) return; done = true; try { fr.remove(); } catch (e) { /* gone */ } res(x); }
      var started = false;
      /* Image-heavy pages can take a long time to fire "load"; measure at load or 6s after the document is parsed, whichever comes first. */
      var poll = setInterval(function () {
        var d0; try { d0 = fr.contentDocument; } catch (e) { d0 = null; }
        if (d0 && d0.body && d0.readyState !== "loading" && d0.readyState !== "uninitialized") { clearInterval(poll); setTimeout(go, 6000); }
      }, 250);
      fr.addEventListener("load", function () { clearInterval(poll); go(); });
      function go() {
        if (started) return; started = true;
        var d, w; try { d = fr.contentDocument; w = fr.contentWindow; } catch (e) { return finish(null); }
        if (!d || !d.body) return finish(null);
        $$("img", d).forEach(function (im) {
          var ds = im.getAttribute("data-src") || im.getAttribute("data-lazy-src") || im.getAttribute("data-original"), dss = im.getAttribute("data-srcset");
          if (ds && (!im.getAttribute("src") || /data:image|placeholder|blank/i.test(im.getAttribute("src")))) im.setAttribute("src", ds.replace(/\{width\}/g, "800"));
          if (dss && !im.getAttribute("srcset")) im.setAttribute("srcset", dss.replace(/\{width\}/g, "800"));
          im.removeAttribute("loading");
        });
        setTimeout(function () {
          try {
            var f = croFeatures(d, w);
            var visibleText = (d.body.innerText || "").replace(/\s+/g, " ").length;
            if (!f || visibleText < 250 || (!f.cta_found && !f.h1 && !f.cards && !f.hero_cta && !f.lead_cta_found)) return finish(null);
            var regs = {}, pageH = 0;
            try {
              var els = findRegions(d, w), sy = w.scrollY || 0;
              Object.keys(els).forEach(function (k) { var el = els[k]; if (!el) return; var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return; regs[k] = { x: Math.round(r.left), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) }; });
              pageH = Math.round(Math.max(d.documentElement.scrollHeight || 0, d.body.scrollHeight || 0));
            } catch (eR) { regs = {}; }
            finish({ f: f, regions: regs, pageH: pageH });
          } catch (e) { finish(null); }
        }, 2200);
      }
      setTimeout(function () { clearInterval(poll); finish(null); }, 16000);
    });
  }

  /* ---------------- stricter scoring (v2) ----------------
     Table-stakes checks (viewport, price shown, contact...) earn nothing when they pass and cost a lot when they fail.
     Checks we can only confirm by a keyword somewhere on the page get partial credit.
     Severity is squared, so a missing star rating near the top costs far more than a missing FAQ. */
  var HYGIENE = { viewport: 1, lang: 1, pdp_atc: 1, pdp_price: 1, contact: 1, policies: 1, search: 1 };
  var WEAK = { pdp_trust: 0.5, pdp_guarantee: 0.5, pdp_faq: 0.5, pdp_bundle: 0.5, pdp_urgency: 0.6, address: 0.6, live_chat: 0.6, pdp_sticky: 0.6, pdp_cod: 0.6, founder_story: 0.6, newsletter: 0.6 };
  function convScore(checks, signals, rendered) {
    if (rendered === "client") return { score: null, passed: 0, failed: 0, applicable: 0 };
    var got = 0, tot = 0, np = 0, nf = 0, hygFail = false, sev3Fail = false;
    (checks || []).forEach(function (c) {
      if (/^SIG-(MOB|A11Y)/.test(c.signal)) return;
      var sv = Math.max(1, Math.min(3, ((signals || {})[c.signal] || {}).severity || 2)), w = sv * sv;
      if (c.status === "fail") nf++; else np++;
      if (HYGIENE[c.key]) { if (c.status === "fail") { tot += 12; hygFail = true; } return; }
      tot += w;
      if (c.status === "fail") { if (sv === 3) sev3Fail = true; } else got += w * (WEAK[c.key] || 1);
    });
    var sc = tot ? Math.round(100 * got / tot) : null;
    if (sc != null && hygFail) sc = Math.min(sc, 60);
    if (sc != null && sev3Fail) sc = Math.min(sc, 85);
    return { score: sc, passed: np, failed: nf, applicable: np + nf, v: 2 };
  }
  function speedEst(lt) {
    if (!lt || lt.scripts == null) return lt ? lt.speedEstimate : null;
    var s = 100, t = lt.ttfbMs || 0, kb = lt.htmlKb || 0, sc = lt.scripts || 0, css = lt.stylesheets || 0, tp = lt.thirdPartyHosts || 0, im = lt.imagesNoDims || 0, inl = lt.inlineScripts || 0;
    s -= t > 1200 ? 20 : t > 600 ? 12 : t > 300 ? 5 : 0;
    s -= kb > 800 ? 20 : kb > 400 ? 14 : kb > 200 ? 7 : 0;
    s -= sc > 40 ? 25 : sc > 25 ? 18 : sc > 15 ? 10 : 0;
    s -= css > 20 ? 14 : css > 10 ? 8 : css > 6 ? 4 : 0;
    s -= tp > 20 ? 15 : tp > 10 ? 8 : 0;
    s -= im > 40 ? 10 : im > 15 ? 5 : 0;
    s -= inl > 50 ? 6 : 0;
    return Math.max(5, Math.min(90, s));
  }
  function rescore(x, signals) {
    if (!x || x._v2) return x;
    if (x.lite && x.lite.scripts != null) x.lite.speedEstimate = speedEst(x.lite);
    if (x.checks && x.checks.length) x.conversion = convScore(x.checks, signals || (x.lib && x.lib.signals) || (x.library && x.library.signals) || {}, x.page && x.page.rendered);
    (x.comps || []).forEach(function (c) { if (!c.error) rescore(c, signals || (x.lib && x.lib.signals)); });
    x._v2 = true;
    return x;
  }

  var LEVER_NAME = { shoppers: "Customer voice", proof: "Proof on the page", rules: "House rules", clarity: "Clarity & fit", trust: "Trust & risk", price: "Price, delivery & payment", flow: "Focus & flow", speed: "Speed on phone", discover: "Search & AI", aov: "Basket size", retain: "Repeat orders" };
  var PILLAR_WHAT = { shoppers: "4 personas picked for this brand read the page and say how likely they are to buy (70%), plus what past buyers say in reviews (30%)", proof: "Tests, certificates, results and specs a shopper can check; known premium brands carry it by name", rules: "8 hard facts: price, policies, first screen, reviews, delivery, returns, stock, no fake pressure", clarity: "What it is, who it suits, what it does", trust: "Reviews, returns, proof, and no contradictions", price: "Total cost, delivery date, COD/UPI, offer", flow: "Layout on a phone, ad match, accessibility", speed: "Core Web Vitals and PageSpeed on a phone", discover: "Brings visitors, doesn't convert them", aov: "Grows the order after the decision", retain: "Happens after the first order" };
  function compute(R) {
    var areas = [];
    rescore(R);
    if (R.growth && R.growth.unread) return { areas: [], total: null, verdict: "We couldn't read this page.", growth: true, unread: true, v4: true };
    if (R.growth && R.growth.score != null && R.growth.parts) {
      var G = R.growth, gt = G.score;
      G.parts.forEach(function (p) { areas.push({ key: p.id, name: LEVER_NAME[p.id] || p.id, w: p.w, v: p.v, est: p.est, grp: p.grp, src: PILLAR_WHAT[p.id] || "" }); });
      (G.side || []).forEach(function (p) { areas.push({ key: p.id, name: LEVER_NAME[p.id] || p.id, w: 0, v: p.v, side: true, src: PILLAR_WHAT[p.id] || "" }); });
      var gv = G.v3 ? G.label + "." : gt >= 80 ? "Strong. Small gains left." : gt >= 65 ? "Good, with clear room to grow." : gt >= 45 ? (G.lead ? "Average. Sign-ups are slipping away." : "Average. Real sales are slipping away.") : (G.lead ? "Needs work. Visitors are hitting walls." : "Needs work. Shoppers are hitting walls.");
      return { areas: areas, total: gt, cro: G.cro, speed: G.speed, croW: G.croW, speedW: G.speedW, est: G.parts.some(function (p) { return p.est; }), verdict: gv, line: G.v3 ? G.line : "", growth: true, v4: G.scoreV === 4, v3: !!G.v3 };
    }
    if (R.cro && R.cro.score != null) {
      var ps3 = R.psi && R.psi.scores ? R.psi.scores : null, realSpeed = ps3 && ps3.performance != null;
      var lead4 = R.cro.labels === "LEAD";
      areas.push({ key: "conversion", name: lead4 ? "Visitor experience" : "Shopper experience", w: realSpeed ? 80 : 100, v: R.cro.score, src: R.cro.v === 4 ? "Ranked against " + R.cro.n + (lead4 ? " fintech, healthtech and service sites" : " sites") + " we measured the same way" : "Ranked against " + (R.cro.n || 60) + " product pages we measured the same way" });
      if (realSpeed) areas.push({ key: "speed", name: "Speed", w: 20, v: ps3.performance, src: "Google PageSpeed, mobile" });
      else areas.push({ key: "speed", name: "Speed", w: 0, ctx: true, est: true, v: R.lite ? R.lite.speedEstimate : null, src: "Estimated, so not scored" });
      var aiC = (R.ai && R.ai.checks) || [];
      areas.push({ key: "search", name: "Search & AI", w: 0, ctx: true, v: R.ai ? R.ai.readiness : null, src: aiC.filter(function (x) { return x.pass; }).length + " of " + aiC.length + " checks passed" });
      areas.push({ key: "a11y", name: "Accessibility", w: 0, ctx: true, v: ps3 && ps3.accessibility != null ? ps3.accessibility : (R.lite ? R.lite.a11yEstimate : null), est: !(ps3 && ps3.accessibility != null), src: "Shown, not scored" });
      areas.push({ key: "agent", name: "Agent readiness", w: 0, v: R.ai && R.ai.agent ? R.ai.agent.score : null, ctx: true, src: "Shown, not scored" });
      areas.push({ key: "stack", name: "Growth stack", w: 0, v: R.stack ? R.stack.score : null, ctx: true, src: "Shown, not scored" });
      var t3 = realSpeed ? Math.round(0.8 * R.cro.score + 0.2 * ps3.performance) : R.cro.score;
      var v3 = t3 >= 80 ? "Strong. Small gains left." : t3 >= 65 ? "Good, with clear room to grow." : t3 >= 45 ? (lead4 ? "Average. Sign-ups are slipping away." : "Average. Real sales are slipping away.") : (lead4 ? "Needs work. Visitors are hitting walls." : "Needs work. Shoppers are hitting walls.");
      return { areas: areas, total: t3, est: false, verdict: v3, v3: true };
    }
    var conv = R.conversion && R.conversion.score != null ? R.conversion.score : null;
    areas.push({ key: "conversion", name: "Conversion", w: 40, v: conv, src: conv == null ? "Not measured: content loads with JavaScript" : R.conversion.passed + " of " + R.conversion.applicable + " checks passed" });
    var ps = R.psi && R.psi.scores ? R.psi.scores : null;
    if (ps && ps.performance != null) areas.push({ key: "speed", name: "Speed", w: 25, v: ps.performance, src: "Google PageSpeed, mobile" });
    else areas.push({ key: "speed", name: "Speed", w: 25, v: R.lite ? R.lite.speedEstimate : null, est: true, src: "Estimated from your page's code" });
    var aiChecks = (R.ai && R.ai.checks) || [];
    areas.push({ key: "search", name: "Search & AI", w: 15, v: R.ai ? R.ai.readiness : null, src: aiChecks.filter(function (x) { return x.pass; }).length + " of " + aiChecks.length + " checks passed" });
    if (ps && ps.accessibility != null) areas.push({ key: "a11y", name: "Accessibility", w: 20, v: ps.accessibility, src: "Google Lighthouse" });
    else areas.push({ key: "a11y", name: "Accessibility", w: 20, v: R.lite ? R.lite.a11yEstimate : null, est: true, src: "Estimated from your page's code" });
    areas.push({ key: "agent", name: "Agent readiness", w: 0, v: R.ai && R.ai.agent ? R.ai.agent.score : null, ctx: true, src: "Shown, not scored" });
    areas.push({ key: "stack", name: "Growth stack", w: 0, v: R.stack ? R.stack.score : null, ctx: true, src: "Shown, not scored" });
    var tw = 0, tv = 0, est = false;
    areas.forEach(function (a) { if (a.w && a.v != null) { tw += a.w; tv += a.w * a.v; if (a.est) est = true; } });
    var avg = tw ? tv / tw : null, low = null;
    areas.forEach(function (a) { if (a.w && a.v != null && (low == null || a.v < low)) low = a.v; });
    // weakest link: one badly broken area drags the whole score down
    var total = avg == null ? null : Math.round(avg - 0.3 * Math.max(0, avg - low));
    var verdict = total == null ? "Not enough to score" : total >= 85 ? "Strong. Small gains left." : total >= 70 ? "Good, with clear room to grow." : total >= 50 ? "Fair. Real sales are slipping away." : "Needs work. Shoppers are hitting walls.";
    return { areas: areas, total: total, est: est, verdict: verdict, limited: true };
  }
  function prio(f) {
    var s = f.sig || {}, fx = s.fix || {};
    var imp = { H: 3, M: 2, L: 1 }[fx.impact] || 2;
    var sum = (s.severity || 2) + imp;
    return sum >= 5 ? { k: "high", l: "High priority" } : sum >= 4 ? { k: "med", l: "Medium priority" } : { k: "low", l: "Lower priority" };
  }
  function goalBoost(f, goal) {
    var rc = (f.sig && f.sig.rootCause) || "";
    if (goal === "speed" && f.area === "speed") return 4;
    if (goal === "ads" && /Intent|Clarity/.test(rc)) return 3;
    if (goal === "aov" && /Offer|Desire/.test(rc)) return 3;
    if (goal === "conversion" && /Trust|Clarity|Friction/.test(rc)) return 1;
    return 0;
  }
  /* shown as context, never as a problem: absence alone isn't a conversion issue */
  /* the Scanner never fails these: urgency is informational, price anchor only matters when discounted, payment options and chat are minor */
  var INFO_ONLY = { pdp_urgency: 1, pdp_anchor: 1, pdp_cod: 1, pdp_emi: 1, live_chat: 1, newsletter: 1 };
  function findingsOf(R) {
    var L = R.lib || { signals: {} }, goal = (R.inputs && R.inputs.goal) || "conversion", out = [];
    (R.checks || []).forEach(function (c) {
      if (c.status !== "fail" || /^SIG-(MOB|A11Y)/.test(c.signal) || INFO_ONLY[c.key]) return;
      var fi = { area: "conversion", key: c.key, signal: c.signal, evidence: c.evidence, sig: L.signals[c.signal] || null, uiux: c.uiux || null, rendered: !!c.rendered };
      fi.uiux = uiuxOf(fi);
      /* code-level checks take the Scanner's severity tier for the same rule */
      if (!fi.rendered && fi.uiux && UIUX_SEV[fi.uiux] && fi.sig) fi.sig = Object.assign({}, fi.sig, { severity: UIUX_TIER[UIUX_SEV[fi.uiux]] });
      out.push(fi);
    });
    ((R.psi && R.psi.findings) || []).forEach(function (f) {
      if (f.area !== "speed") return;
      var fs2 = { area: "speed", key: "psi", signal: f.signal, evidence: f.evidence, sig: L.signals[f.signal] || null, uiux: PSI_U[f.signal] || null };
      if (fs2.uiux && fs2.sig) fs2.sig = Object.assign({}, fs2.sig, { severity: UIUX_TIER[UIUX_SEV[fs2.uiux]] });
      out.push(fs2);
    });
    out.forEach(function (f) {
      var s = f.sig || {}, fx = s.fix || {};
      f.rank = (s.severity || 2) * 2 + ({ H: 3, M: 2, L: 1 }[fx.impact] || 2) * 2 + ({ S: 2, M: 1, L: 0 }[fx.effort] != null ? { S: 2, M: 1, L: 0 }[fx.effort] : 1) + goalBoost(f, goal);
      f.prio = prio(f);
      f.rank += { high: 300, med: 200, low: 100 }[f.prio.k];
    });
    out.sort(function (a, b) { return b.rank - a.rank; });
    return out;
  }
  function whereOf(f, R) {
    var p = R.page || {}, s = f.sig || {};
    if (/^side_/.test(f.key)) return (R.cro && R.cro.side && R.cro.side.type === "HOME" ? "Your homepage" : "Your product page") + (R.cro && R.cro.side && R.cro.side.url ? " (" + R.cro.side.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60) + ")" : "");
    if (f.key === "hero_single_action") return "First screen" + (p.heroHeadline ? ": “" + p.heroHeadline.slice(0, 70) + "”" : "");
    if (f.key === "cta_copy") return "Main button: “" + (p.primaryCta || "") + "”";
    if (f.key === "proof_density") return "First screen, near the main button";
    if (/^pdp_/.test(f.key)) return "Product page, near Add to cart";
    if (f.key === "search") return "Header, on mobile and desktop";
    if (f.key === "newsletter") return "Email sign-up";
    if (f.key === "address" || f.key === "policies" || f.key === "contact") return "Footer and contact page";
    if (f.area === "speed") return "Page load on mobile";
    return surfaceLabel(s, R, f.area);
  }
  function abDays(R) {
    var v = R.inputs && R.inputs.visitors;
    if (!v) return null;
    var p = R.benchmark && R.benchmark.atc ? R.benchmark.atc / 100 : 0.035;
    var n = 2 * 16 * p * (1 - p) / Math.pow(p * 0.15, 2);
    return Math.ceil(n / (v / 30));
  }
  function measureOf(f, R) {
    var t = ((f.sig || {}).fix || {}).testType || "A/B";
    var metric = f.area === "speed" ? "load time and bounce rate" : (R.page && R.page.lead) ? "sign-up or enquiry rate" : (R.page && R.page.pageType === "PDP") ? "add-to-cart rate" : "click-through to products and add-to-cart rate";
    var d = abDays(R);
    if (t === "A/B") {
      if (d != null && d > 45) return "At your traffic, a clean A/B test would take about " + Math.round(d / 7) + " weeks, so we'd ship it and compare " + metric + " before and after.";
      return "A/B test on " + metric + (d != null ? ", with a readout in about " + Math.max(14, d) + " days." : ".");
    }
    if (t === "Funnel") return "Funnel test: we'd track each step from landing to checkout.";
    if (t === "Holdout") return "Holdout: a small share of visitors keeps the old version so the lift can be measured.";
    return "Ship it and compare " + metric + " before and after.";
  }
  function testsOf(R, finds) {
    var L = R.lib || { barriers: {} };
    return finds.filter(function (f) { return f.sig && f.sig.fix; }).slice(0, 3).map(function (f, i) {
      var fx = f.sig.fix || {};
      var sol = (fx.solutions || [])[0] || "";
      var bars = (f.sig.barriers || []).map(function (b) { var x = L.barriers[b]; return x ? b + " " + tidy(x.name) + ": “" + tidy(x.description) + "”" : b; });
      return {
        n: i + 1, f: f,
        title: tidy(sol || fx.playbook || f.sig.name).replace(/\.$/, ""),
        where: whereOf(f, R),
        why: bars.length ? "Answers " + bars.slice(0, 2).join(" and ") : tidy((L.rootCauses && L.rootCauses[f.sig.rootCause]) || f.sig.rootCause || ""),
        measure: measureOf(f, R)
      };
    });
  }

  /* ---------------- report rendering ---------------- */
  var EFFORT = { S: "small", M: "medium", L: "large" }, IMPACT = { H: "high", M: "medium", L: "low" };
  function ringSvg(v, size) {
    var r = size === "sm" ? 52 : 74, box = size === "sm" ? 120 : 168, sw = size === "sm" ? 8 : 10, C = 2 * Math.PI * r;
    var off = v == null ? C : C * (1 - v / 100);
    return '<div class="ring' + (size === "sm" ? " sm" : "") + '"><svg viewBox="0 0 ' + box + " " + box + '" aria-hidden="true"><circle class="trk" cx="' + box / 2 + '" cy="' + box / 2 + '" r="' + r + '" stroke-width="' + sw + '"/><circle class="val" cx="' + box / 2 + '" cy="' + box / 2 + '" r="' + r + '" stroke-width="' + sw + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-off="' + off.toFixed(1) + '"/></svg><div class="num"><b>' + (v == null ? "–" : v) + "</b><span>/ 100</span></div></div>";
  }
  function metricCls(v, good, ok) { return v == null ? "" : v <= good ? "good" : v <= ok ? "ok" : "bad"; }
  function ck(ok, label, detail) {
    return '<div class="an-ck ' + (ok ? "ok" : "no") + '"><span class="i">' + (ok ? ICON_CHECK : "!") + "</span><span>" + esc(label) + '</span><span class="dt">' + esc(detail || "") + "</span></div>";
  }
  function secHead(eyebrow, title, sub) {
    return '<div class="rp-sec-head"><span class="eyebrow">' + esc(eyebrow) + '</span><h2 class="h2">' + title + "</h2>" + (sub ? '<p class="an-sub">' + sub + "</p>" : "") + "</div>";
  }

  /* v11.3: Overall = CRO x Speed (weighted geometric mean), with the weights in a dropdown under the score */
  function rpWeights(R, C) {
    var G = R.growth, A = C.areas;
    if (C.v4) return rpWeights4(R, C);
    function tile(nm, v, w, est, cls) {
      return '<div class="rp-sub ' + cls + '"><span class="nm"><i class="pl-dot ' + cls + '"></i>' + esc(nm) + (est ? "<em>est.</em>" : "") + '</span><div class="v"><b data-plan-' + cls + ">" + (v == null ? "n/a" : v) + "</b><span>/100</span></div>" +
        '<span class="bar"><i class="gain" data-plan-' + cls + '-bar style="width:' + (v || 0) + '%"></i><i class="now" style="width:' + (v || 0) + '%"></i></span><span class="w">' + (w != null ? w + "% of the overall score" : "not measured") + "</span></div>";
    }
    var cro = A.filter(function (a) { return a.grp === "cro"; }), sp = A.filter(function (a) { return a.grp === "speed"; }), side = A.filter(function (a) { return a.side; });
    function row(a) { return '<tr><td><span class="pn">' + esc(a.name) + (a.est ? "<em>est.</em>" : "") + '</span><span class="pw">' + esc(a.src) + '</span></td><td class="pv" style="color:' + colorFor(a.v) + '">' + (a.v == null ? "n/a" : a.v) + '</td><td class="pc">' + (a.side ? "–" : a.w != null ? a.w + "%" : "") + "</td></tr>"; }
    /* speed is one pillar, so show what it is made of instead of repeating it */
    var SB = (G.branches && G.branches.speed) || {}, half = C.speedW != null ? Math.round(C.speedW * 5) / 10 : null;
    var spRows = SB.est || SB.perf == null ? [{ name: "Estimated from the page's code", src: "Google PageSpeed didn't answer in time, so we read the page's size and scripts", v: C.speed, w: C.speedW, est: true }]
      : SB.cwv == null ? [{ name: "Google PageSpeed (mobile)", src: "Lighthouse on a mid-range phone", v: SB.perf, w: C.speedW }]
      : [{ name: "Core Web Vitals", src: "Main image time, blocked time and layout shift, against Google's thresholds", v: SB.cwv, w: half }, { name: "Google PageSpeed (mobile)", src: "Lighthouse on a mid-range phone", v: SB.perf, w: half }];
    if (SB.capped) spRows.push({ name: "Capped at 50", src: "Google's real-user data rates this page slow", v: 50, w: null });
    var h = (G.plan ? '<p class="rp-plan-line" data-plan-line hidden></p>' : "") + '<div class="rp-subs">' + tile("CRO score", C.cro, C.croW, false, "cro") + tile("Speed score", C.speed, C.speedW, sp.some(function (a) { return a.est; }), "speed") + "</div>";
    h += '<details class="rp-how rp-wt"><summary>How this score is weighted</summary><table class="rp-wtab"><thead><tr><th>Pillar</th><th>Score</th><th>Weight</th></tr></thead><tbody>';
    h += '<tr class="grp"><td>CRO score</td><td class="pv">' + (C.cro == null ? "n/a" : C.cro) + '</td><td class="pc">' + (C.croW != null ? C.croW + "%" : "") + "</td></tr>" + cro.map(row).join("");
    h += '<tr class="grp"><td>Speed score</td><td class="pv">' + (C.speed == null ? "n/a" : C.speed) + '</td><td class="pc">' + (C.speedW != null ? C.speedW + "%" : "") + "</td></tr>" + (sp.length ? spRows.map(row).join("") : "");
    if (side.length) h += '<tr class="grp side"><td colspan="3">Shown, not counted in the score</td></tr>' + side.map(row).join("");
    h += "</tbody></table>";
    var a = C.croW != null ? (C.croW / 100).toFixed(2) : "0.85", b = C.speedW != null ? (C.speedW / 100).toFixed(2) : "0.15";
    h += "<p>" + esc("Why these weights: research on what makes online shoppers buy finds that clear product information and trust predict purchase best, hidden costs and slow delivery are the top reasons carts are abandoned, and phone speed moves conversion. The overall score is a weighted geometric mean, so one weak pillar pulls it down instead of being averaged away:") +
      ' <span class="rp-formula">Overall = CRO<sup>' + a + "</sup> × Speed<sup>" + b + "</sup></span>. " +
      esc("Buyer questions count by how much they matter to " + (G.cat && G.cat !== "Other" ? G.cat.toLowerCase() + " " : "") + "shoppers, and a partly answered one counts 30%." + (G.mustNo ? " " + G.mustNo + " Must-solve " + (G.mustNo === 1 ? "question is" : "questions are") + " unanswered on this page." : "") + (G.lead ? " This is a sign-up page, so price questions count under Clarity." : "") + " Search and AI, basket size and repeat orders are in the growth plan below, not in this score: they bring visitors or grow later orders.") + "</p></details>";
    return h;
  }

  /* v12 hero: CRO and Speed tiles, and how the score is made (shoppers + house rules, speed) */
  function rpWeights4(R, C) {
    var G = R.growth;
    function tile(nm, v, w, est, cls) {
      return '<div class="rp-sub ' + cls + '"><span class="nm"><i class="pl-dot ' + cls + '"></i>' + esc(nm) + (est ? "<em>est.</em>" : "") + '</span><div class="v"><b data-plan-' + cls + ">" + (v == null ? "n/a" : v) + "</b><span>/100</span></div>" +
        '<span class="bar"><i class="gain" data-plan-' + cls + '-bar style="width:' + (v || 0) + '%"></i><i class="now" style="width:' + (v || 0) + '%"></i></span><span class="w">' + (w != null ? w + "% of the overall score" : "not measured") + "</span></div>";
    }
    var sp = C.areas.filter(function (a) { return a.grp === "speed"; }), SB = (G.branches && G.branches.speed) || {};
    function row(a) { return '<tr><td><span class="pn">' + esc(a.name) + (a.est ? "<em>est.</em>" : "") + '</span><span class="pw">' + esc(a.src) + '</span></td><td class="pv" style="color:' + colorFor(a.v) + '">' + (a.v == null ? "n/a" : a.v) + '</td><td class="pc">' + (a.w != null ? a.w + "%" : "") + "</td></tr>"; }
    var h = (G.plan ? '<p class="rp-plan-line" data-plan-line hidden></p>' : "") + '<div class="rp-subs">' + tile("CRO score", C.cro, C.croW, false, "cro") + tile("Speed score", C.speed, C.speedW, sp.some(function (a) { return a.est; }), "speed") + "</div>";
    h += '<details class="rp-how rp-wt"><summary>How this score works</summary><table class="rp-wtab"><thead><tr><th>Part</th><th>Score</th><th>Weight</th></tr></thead><tbody>';
    h += '<tr class="grp"><td>CRO score</td><td class="pv">' + (C.cro == null ? "n/a" : C.cro) + '</td><td class="pc">' + C.croW + "%</td></tr>" + C.areas.filter(function (a) { return a.grp === "cro"; }).map(row).join("") +
      (G.mix != null ? row({ name: "On the benchmark scale", src: "Weighted mix " + G.mix + ", placed on the scale our graded pages set: bad pages 15-35, mid around 50, good brands 65-80, the best 85-90", v: C.cro, w: null }) : "");
    h += '<tr class="grp"><td>Speed score</td><td class="pv">' + (C.speed == null ? "n/a" : C.speed) + '</td><td class="pc">' + C.speedW + "%</td></tr>" + row({ name: SB.est || SB.perf == null ? "Estimated from the page's code" : "Core Web Vitals and Google PageSpeed (mobile)", src: SB.capped ? "Capped at 50: Google's real-user data rates this page slow" : "Main image time, blocked time and layout shift, plus Lighthouse on a mid-range phone", v: C.speed, w: null, est: SB.est });
    h += "</tbody></table><p>" + esc("Shoppers: Groq picks the 4 kinds of shopper most likely to land on this page, then each one reads the page the way a real buyer would and says how likely they are to buy. Their scores are weighted by how many shoppers like them you get, and reviews from past buyers make up 30% of this customer voice (count, verified buyers, rating; filtered-looking reviews count against it). A brand they already know needs less proof; an unknown brand has to earn it on the page. Proof: what a careful shopper can check on the page besides reviews (tests and certificates, results, specs); household names and well-known premium brands carry it by name. House rules: 8 hard facts we check with scripts. CRO is " + Math.round(100 * ((G.w4 && G.w4.shop) || 0)) + "% customer voice, " + Math.round(100 * ((G.w4 && G.w4.proof) || 0)) + "% proof and " + Math.round(100 * ((G.w4 && G.w4.rules) || 0)) + "% house rules, mixed as a weighted geometric mean so one very weak part pulls the score down, then placed on a benchmark scale anchored on product pages the Troopod team graded (bad pages land around 15-35, mid ones around 50, good brands' pages 65-80, the best 85-90). Speed counts for 15% of the overall score:") +
      ' <span class="rp-formula">Overall = CRO<sup>0.85</sup> × Speed<sup>0.15</sup></span></p></details>';
    return h;
  }

  /* ---------------- v14 report: the fix workbench ----------------
     Sticky top bar with tabs; left: score, the #1 problem, the tick-box fix planner and a revenue calculator;
     right: the page on a phone with numbered pins that match the fixes. Every number comes from the same plan model. */
  function wbRing(v) {
    return '<div class="wb-ring" data-wb-ring style="--now:' + (v || 0) + ";--to:" + (v || 0) + '"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52" pathLength="100"/><circle class="to" cx="60" cy="60" r="52" pathLength="100"/><circle class="now" cx="60" cy="60" r="52" pathLength="100"/></svg>' +
      '<div class="wb-ring-v"><b>' + (v == null ? "–" : v) + '</b><span class="wb-ring-from">out of 100</span><span class="wb-ring-fix" data-wb-fixline hidden>with fixes <b data-wb-to>' + (v == null ? "–" : v) + "</b></span></div></div>";
  }
  function rpWorkbench(R, C, GR, opts, host, T, hasComp, created) {
    var G = R.growth, W = GR.wb, Pl = G.plan || { cro: [], speed: [], base: {} }, P = R.page || {};
    var path = ""; try { path = new URL(R.url).pathname; } catch (e) { /* ignore */ }
    var miss = G.qs.filter(function (q) { return q.g === "no"; }).length, part = G.qs.filter(function (q) { return q.g === "partly"; }).length;
    var lcp = Pl.vit && Pl.vit.lcp != null ? Pl.vit.lcp : null, mon = G.money || {}, cur = mon.cur || P.currency || "INR";
    var top = Pl.cro.concat(Pl.speed).filter(function (f) { return f.gain > 0; }).sort(function (a, b) { return b.gain - a.gain; })[0] || Pl.cro[0];
    var tabs = [["plan", "Fix planner", Pl.upCro ? "+" + (Pl.upCro + (Pl.est ? 0 : Pl.upSpeed)) + " pts" : ""], ["questions", "Buyer questions", miss + " missing · " + part + " partly"], ["voice", "Customer voice", G.voice != null ? G.voice + "/100" : ""],
      ["speed", "Speed, search & AI", lcp != null ? "LCP " + lcp.toFixed(1) + "s" : C.speed != null ? C.speed + "/100" : ""], ["growth", "Growth plan", G.levers.length ? G.levers.length + " levers" : ""], ["next", "Next step", ""]];
    var h = '<div class="wb" data-plan data-wb data-phone="now">';
    /* top bar */
    h += '<header class="wb-top"><div class="wb-id"><span class="wb-mark" aria-hidden="true">T</span><div><b>TrooCRO <em>' + (G.v3 ? "v3" : "v14") + '</em></b><span>' + esc(PAGE_TYPE[P.pageType] || "Page") + " diagnostic · " + esc(clip2(host + (path.length > 1 ? path : ""), 70)) + "</span></div></div>" +
      '<div class="wb-chips">' + (G.cat ? '<span class="wb-chip">' + esc(G.cat) + (G.qList ? " · " + esc(LIST_NAME[G.qList] || G.qList) : "") + "</span>" : "") + (P.platform ? '<span class="wb-chip">' + esc(P.platform) + "</span>" : "") + '<span class="wb-chip">' + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</span></div>" +
      '<div class="wb-acts">' + (opts.mode === "live" ? '<button class="wb-btn" type="button" data-share' + (S.saveState === "saved" ? "" : " disabled") + ">" + (S.saveState === "saved" ? "Share report" : S.saveState === "failed" ? "Link unavailable" : "Saving…") + "</button>" : "") + '<button class="wb-btn" type="button" data-print>Download PDF</button>' + (opts.mode !== "sample" ? '<button class="wb-btn" type="button" data-new>New scan</button>' : "") + '<a class="wb-btn cta" href="#wb-next" data-wb-goto="next">Fix with TrooCRO</a></div></header>';
    h += '<nav class="wb-tabs" role="tablist" aria-label="Report sections">' + tabs.map(function (t, i) { return '<button type="button" role="tab" data-wb-tab="' + t[0] + '" aria-selected="' + (i === 0) + '"' + (i ? ' tabindex="-1"' : "") + '><span class="n">' + (i + 1) + "</span>" + esc(t[1]) + (t[2] ? '<em>' + esc(t[2]) + "</em>" : "") + "</button>"; }).join("") + "</nav>";
    h += '<div class="wb-grid"><div class="wb-main">';
    /* ---- panel 1: plan ---- */
    h += '<section class="wb-panel" data-wb-panel="plan" id="wb-plan">';
    var verdict = C.verdict || "";
    h += '<div class="wb-card wb-score">' + wbRing(C.total) + '<div class="wb-score-t"><span class="wb-k">Score now ' + (C.total == null ? "–" : C.total) + '/100 · with <span data-wb-n>' + (Pl.defaultOn || []).length + ' fixes</span> <b class="up" data-wb-up></b></span><h2>' + esc(verdict) + '</h2><p>' + esc((G.v3 ? (C.line ? C.line + " " : "") + "This page only, for a shopper who is already on it. Speed is shown beside the score, not inside it." : "This page only, for a shopper who is already on it." + (Pl.est ? " Speed is estimated." : ""))) + "</p></div>" +
      '<div class="wb-bars">' + [["cro", G.v3 ? "Buyer questions" : "CRO", C.cro, C.croW, "data-wb-cro"], ["speed", "Speed on phone", C.speed, C.speedW, "data-wb-sp"]].map(function (x) { return '<div class="wb-bar ' + x[0] + '"><div class="l"><i class="pl-dot ' + x[0] + '"></i>' + esc(x[1]) + ' <span>(' + (G.v3 ? (x[0] === "cro" ? "the score" : "not in the score") : x[3] != null ? x[3] + "%" : "") + ')</span><b ' + x[4] + '-v>' + (x[2] == null ? "n/a" : x[2]) + '</b></div><span class="t"><i class="to" ' + x[4] + '-to style="width:' + (x[2] || 0) + '%"></i><i class="now" style="width:' + (x[2] || 0) + '%"></i></span></div>'; }).join("") + "</div>" +
      (G.v3 ? "" : '<div class="wb-lift"><span class="wb-k">Est. revenue lift</span><b data-wb-lift>–</b><span data-wb-lift-n class="s"></span><span class="s">At <b data-wb-lift-v></b> visitors a month' + (mon.src && mon.src.visitors === "you" ? "" : " (our guess: change it below)") + '</span></div>') + '</div>';
    if (top) h += '<div class="wb-card wb-driver"><div><span class="wb-badge">#1 thing costing sales</span>' + (top.gain ? '<span class="wb-badge g">' + gainTxt2(top.gain) + " pts on its own</span>" : "") + "<h3>" + esc(top.t) + "</h3>" + (top.ev ? "<p>" + esc(clip2(top.ev, 260)) + "</p>" : "") + '</div><button type="button" class="wb-btn" data-wb-locate="' + esc(top.id) + '">Show on phone</button></div>';
    h += W.fails || "";
    h += '<div class="wb-card wb-planner"><div class="wb-ph"><div><h3>Fix planner</h3><p>' + (G.v3 ? "Tick fixes to see your new score. Each CRO fix answers a buyer question your page leaves open; speed fixes come from Google PageSpeed and don't move the score. The number on each fix is its pin on the phone." : "Tick fixes to see your new score. Each fix comes from a buyer question your page leaves open, a house rule it misses, or a speed problem, and its number is the pin on the phone.") + '</p></div></div>' + (W.plan ? W.plan.side : '<p class="pl-empty">No fixes to plan on this page.</p>') + "</div>";
    if (!G.v3) h += '<div class="wb-card wb-calc" data-wb-calc data-cur="' + esc(cur) + '"><div class="wb-ph"><div><h3>What the ticked fixes could be worth</h3><p>Change these to your real numbers. Our assumption: conversion rises by half of the CRO gain from your ticked fixes, capped at +15%.</p></div>' + (G.season && G.season.name ? '<span class="wb-chip">' + esc(G.season.name) + "</span>" : "") + "</div>" +
      '<div class="wb-in"><label><span>Monthly visitors to this page</span><input type="number" min="0" data-c-v value="' + Math.round(mon.visitors || 30000) + '"><em>' + esc(mon.src && mon.src.visitors === "you" ? "From your answers" : "Our guess. Put yours in") + '</em></label>' +
      '<label><span>Conversion rate (%)</span><input type="number" min="0" step="0.1" data-c-c value="' + (mon.cvr || 1.5) + '"><em>' + esc(mon.src && mon.src.cvr === "you" ? "From your answers" : mon.src && mon.src.cvr === "benchmark" ? "Category benchmark" : "Our guess") + '</em></label>' +
      '<label><span>Average order value</span><input type="number" min="0" data-c-a value="' + Math.round(mon.aov || P.aov || 0) + '"><em>' + esc(mon.src && mon.src.aov === "page" ? "Price on the page" : mon.src && mon.src.aov === "you" ? "From your answers" : "Put yours in") + "</em></label></div>" +
      '<div class="wb-out"><div><span>Revenue from this page now</span><b data-c-now>–</b><em data-c-on></em></div><div><span>With the ticked fixes</span><b class="g" data-c-to>–</b><em data-c-tn></em></div><div><span>Extra a year</span><b class="g" data-c-yr>–</b><em>Estimate, not a promise</em></div></div></div>';
    h += "</section>";
    /* ---- other panels ---- */
    h += '<section class="wb-panel" data-wb-panel="questions" hidden>' + W.questions + "</section>";
    h += '<section class="wb-panel" data-wb-panel="voice" hidden>' + W.voice + "</section>";
    h += '<section class="wb-panel" data-wb-panel="speed" hidden>' + rpBeyond(R, host) + "</section>";
    h += '<section class="wb-panel" data-wb-panel="growth" hidden>' + W.growth + (T.length ? rpTests(R, T, R.lib || {}, host, created) : "") + (hasComp ? compSection(R) : "") + "</section>";
    h += '<section class="wb-panel" data-wb-panel="next" id="wb-next" hidden>' + rpNext(R, C, host, GR.services) + "</section>";
    h += "</div>";
    /* ---- right: the phone ---- */
    h += '<aside class="wb-side"><div class="wb-card wb-phonecard"><div class="wb-ph"><div><span class="wb-k">Your page on a phone</span><p>Tap a number to see the fix.</p></div><div class="wb-mode" role="group" aria-label="Phone view"><button type="button" data-wb-mode="now" aria-pressed="true">Now (' + (C.total == null ? "–" : C.total) + ')</button><button type="button" data-wb-mode="to" data-wb-mode-to aria-pressed="false">With fixes</button></div></div>' +
      (W.plan ? W.plan.phone : "") + '<div class="wb-hot" data-wb-hot hidden></div></div></aside>';
    h += "</div></div>";
    return h;
  }
  var LIST_NAME = { furniture: "Furniture", decor: "Décor", fashion: "Apparel", beauty: "Beauty", supplements: "Supplements", supports: "Body supports", food: "Food", fine: "Fine jewellery", fashionjewel: "Fashion jewellery", electronics: "Electronics", baby: "Baby & kids", pet: "Pet", sports: "Sports", other: "General", homecare: "Home care", makeup: "Makeup", bags: "Bags & luggage" };
  function gainTxt2(g) { return g == null ? "n/a" : g === 0.5 ? "<1" : "+" + g; }
  function wireWorkbench(root, R) {
    var wb = $(".wb", root); if (!wb) return;
    var tabs = $$("[data-wb-tab]", wb);
    function sel(id, focus) {
      tabs.forEach(function (b) { var on = b.getAttribute("data-wb-tab") === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      $$("[data-wb-panel]", wb).forEach(function (p) { p.hidden = p.getAttribute("data-wb-panel") !== id; });
      var y = wb.getBoundingClientRect().top + win.scrollY - 70; if (win.scrollY > y) win.scrollTo({ top: y, behavior: "smooth" });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { sel(t.getAttribute("data-wb-tab")); });
      t.addEventListener("keydown", function (e) { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); sel(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length].getAttribute("data-wb-tab"), true); });
    });
    $$("[data-wb-goto]", wb).forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); sel(a.getAttribute("data-wb-goto")); }); });
    /* links inside panels that point at another panel's section */
    wb.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#rp-"]') : null; if (!a) return;
      var tgt = $(a.getAttribute("href"), wb); if (!tgt) return; var pn = tgt.closest("[data-wb-panel]"); if (!pn) return;
      e.preventDefault(); sel(pn.getAttribute("data-wb-panel")); setTimeout(function () { tgt.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    });
    /* revenue calculator: reads the plan's CRO lift from the wrapper */
    var calc = $("[data-wb-calc]", wb); if (!calc) return;
    var cur = calc.getAttribute("data-cur");
    function fmt(n) { return n == null || !isFinite(n) ? "–" : money(Math.round(n), cur); }
    wb.wbCalc = function () {
      var v = +$("[data-c-v]", calc).value || 0, c = +$("[data-c-c]", calc).value || 0, a = +$("[data-c-a]", calc).value || 0;
      var lift = Math.min(0.15, 0.5 * (+wb.getAttribute("data-lift") || 0)), o0 = v * c / 100, o1 = o0 * (1 + lift);
      var r0 = a ? o0 * a : null, r1 = a ? o1 * a : null;
      $("[data-c-now]", calc).textContent = fmt(r0); $("[data-c-to]", calc).textContent = fmt(r1); $("[data-c-yr]", calc).textContent = r0 != null ? "+" + fmt((r1 - r0) * 12) : "–";
      $("[data-c-on]", calc).textContent = Math.round(o0).toLocaleString("en-IN") + " orders a month"; $("[data-c-tn]", calc).textContent = Math.round(o1).toLocaleString("en-IN") + " orders a month (+" + Math.round(lift * 1000) / 10 + "%)";
      $$("[data-wb-lift]", wb).forEach(function (el) { el.textContent = r0 == null ? "Add your order value" : lift <= 0 ? "Tick a CRO fix" : "+" + fmt(r1 - r0) + " / mo"; });
      $$("[data-wb-lift-n]", wb).forEach(function (el) { el.textContent = lift <= 0 ? "Speed fixes aren't counted in this estimate" : "Conversion " + c + "% → " + (Math.round(c * (1 + lift) * 100) / 100) + "%"; });
      $$("[data-wb-lift-v]", wb).forEach(function (el) { el.textContent = Math.round(v).toLocaleString("en-IN"); });
    };
    $$("input", calc).forEach(function (i) { i.addEventListener("input", wb.wbCalc); });
    wb.wbCalc();
  }
  function renderReport(R, opts) {
    opts = opts || {};
    var L = R.lib || { signals: {}, barriers: {}, rootCauses: {} };
    R.page = cleanPage(R.page);
    var P = R.page;
    var C = compute(R), F = findingsOf(R), T = R.growth && R.growth.v3 ? [] : testsOf(R, F);
    var host = hostOf(R.url) || String(R.host || "").replace(/^www\./, "");
    var created = R.createdAt ? new Date(R.createdAt) : new Date();
    var passes = (R.checks || []).filter(function (c) { return c.status === "pass" && !/^SIG-(MOB|A11Y)/.test(c.signal); });
    var barriersHit = {}; F.forEach(function (f) { ((f.sig || {}).barriers || []).forEach(function (b) { barriersHit[b] = 1; }); });
    var nBar = Object.keys(barriersHit).length;
    var hasComp = !(R.growth && R.growth.v3) && (R.comps || []).length > 0;
    var h = '<div class="rp">';

    if (opts.mode === "sample") h += '<div class="wrap" style="padding-top:118px"><div class="an-banner"><span><b>Sample report.</b> A real TrooCRO scan of ' + (/myshopify\.com$/.test(host) ? "Shopify’s public theme demo store (" + esc(host) + "), with category, order value and traffic filled in as an example" : esc(host)) + ", run on " + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })) + ". Live scans run when this site is hosted or opened from your computer.</span></div></div>";

    /* header */
    h += '<div class="wrap rp-wrap"' + (opts.mode === "sample" ? ' style="padding-top:28px"' : "") + ">";
    h += '<header class="rp-head"><div><span class="eyebrow">' + (opts.mode === "shared" ? "Shared website analysis" : "Website analysis") + '</span><h1 class="h1">Your report for <span>' + esc(host) + "</span></h1>";
    h += '<div class="rp-meta"><span class="an-tag">' + esc(PAGE_TYPE[P.pageType] || "Page") + "</span>" + (P.category && P.category !== "Other" ? '<span class="an-tag">' + esc(P.category) + "</span>" : "") + (P.aovBand ? '<span class="an-tag">' + esc(bandLabel(P.aovBand)) + "</span>" : "") + (P.platform ? '<span class="an-tag">' + esc(P.platform) + "</span>" : "") + '<span class="an-tag">' + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</span></div></div>";
    h += '<div class="rp-actions">' + (opts.mode === "live" ? '<button class="btn btn-ghost btn-sm" type="button" data-share' + (S.saveState === "saved" ? "" : " disabled") + "><span>" + (S.saveState === "saved" ? "Copy share link" : S.saveState === "failed" ? "Link unavailable" : "Saving link…") + "</span></button>" : opts.mode === "shared" ? '<button class="btn btn-ghost btn-sm" type="button" data-share><span>Copy share link</span></button>' : "") + (S.offline ? "" : '<button class="btn btn-ghost btn-sm" type="button" data-print>Save as PDF</button>') + '<button class="btn btn-light btn-sm" type="button" data-new>' + (opts.mode === "live" ? "Analyze another site" : "Run your own analysis") + "</button></div></header>";

    var GR = R.growth && win.TrooGrowth ? win.TrooGrowth.render(R.growth, R) : null;
    if (C.v4 && GR && GR.wb && !C.unread && !opts.classic) {
      h = '<div class="rp rp-wb">' + (opts.mode === "sample" ? '<div class="wrap"><div class="an-banner"><span><b>Sample report.</b> A real TrooCRO scan.</span></div></div>' : "") + '<div class="wb-wrap">' + rpWorkbench(R, C, GR, opts, host, T, hasComp, created) + "</div></div>";
      return { html: h, C: C, F: F, T: T };
    }
    /* verdict hero */
    var path = ""; try { path = new URL(R.url).pathname; } catch (e) { /* ignore */ }
    var shot = R.psi && R.psi.shots && R.psi.shots.final;
    var og = /^https:\/\//i.test(P.ogImage || "") ? P.ogImage : "";
    h += '<section class="rp-hero" id="rp-overview">';
    h += '<div class="rp-score"><div class="rp-score-top">' + ringSvg(C.total) + '<div><span class="an-label">' + (C.growth ? "Overall score" : "Website score") + '</span><div class="rp-verdict">' + esc(C.verdict) + '</div><p class="an-sub">' + (C.growth ? "This page only, for a shopper who is already on it." : "Across the areas we could measure on this page.") + (C.est ? " Speed is estimated." : "") + "</p></div></div>";
    if (C.growth && !C.unread) h += rpWeights(R, C);
    var kpis = '<div class="rp-kpis"><div><b>' + F.length + "</b><span>" + (F.length === 1 ? "issue" : "issues") + ' costing sales</span></div><div><b>' + nBar + "</b><span>buyer " + (nBar === 1 ? "barrier" : "barriers") + ' triggered</span></div><div><b>' + T.length + "</b><span>" + (T.length === 1 ? "test" : "tests") + " ready to run</span></div></div>";
    if (!C.v4) h += kpis;
    if (!C.growth) h += '<div class="rp-areas">' + C.areas.map(function (a) {
      return '<div class="rp-area' + (a.ctx ? " ctx" : "") + (a.v == null ? " na" : "") + '" title="' + esc(a.src) + '"><span class="nm">' + esc(a.name) + (a.est && a.v != null ? "<em>est.</em>" : "") + '</span><span class="bar"><i style="width:' + (a.v || 0) + "%;background:" + colorFor(a.v) + '"></i></span><b>' + (a.v == null ? "n/a" : a.v) + '</b><span class="w">' + (a.w ? a.w + "%" : "info") + "</span></div>";
    }).join("") + "</div>";
    if (C.growth) {
      h += "</div>";
    } else if (C.v3) {
      var LBL = R.cro.kind === "rubric" || R.cro.kind === "blend" ? RUBRIC_LABEL : CRO_LABEL;
      var up = (R.cro.up || []).map(function (k) { return "<li class=\"up\">" + esc(LBL[k] || k) + "</li>"; }).join("");
      var dn = (R.cro.down || []).map(function (k) { return "<li class=\"dn\">" + esc((R.cro.v === 4 && CRO_LABEL_NEG[k]) || LBL[k] || k) + "</li>"; }).join("");
      if (R.cro.v === 4) h += '<details class="rp-how"><summary>How the score works</summary><p>' + esc(howV4(R)) + "</p>" + (up || dn ? '<div class="rp-moved">' + (up ? "<div><b>Helping your score</b><ul>" + up + "</ul></div>" : "") + (dn ? "<div><b>Holding it back</b><ul>" + dn + "</ul></div>" : "") + "</div>" : "") + "</details></div>";
      else h += '<details class="rp-how"><summary>How the score works</summary><p>' + (R.cro.kind === "rubric" || R.cro.kind === "blend" ? "We load your page on a 390px phone and check it against research-based guidelines for " + (R.cro.labels === "COLLECTION" ? "collection pages: products in the first screens, prices and ratings on every card, filters, sorting and quick add" : "homepages: a clear promise and action in the first screen, categories and bestsellers early, proof, reassurance and search") + ", plus the rendered-page checks behind the findings below. " + (R.cro.kind === "blend" ? "In our benchmark of " + R.cro.n + " stores, " + (R.cro.labels === "COLLECTION" ? "collection" : "homepage") + " layout alone didn’t reliably tell strong stores from weak ones, but their product pages did. So we also measured one of your product pages (it scored " + R.cro.pdp.score + "/100) and it carries 70% of this score; this page’s own checks carry the other 30%." : "We couldn’t open one of your product pages, so this score uses this page alone. In our benchmark that is a weaker signal than a product page, so treat it as indicative and run the analysis on a product page for a firmer read.") + " The bottom fifth of stores scores around 30, the middle around 55, the top fifth 80 or more." : 'We load your page on a 390px phone and measure what a shopper sees: the main button and price on the first screen, the stars near the product name, delivery and reassurance next to the button, how the page is structured and whether it fits the screen. Your page is then ranked against ' + (R.cro.n || 60) + ' product pages we measured the same way, from strong D2C brands to small unknown stores. The weights come from what separated the strong pages from the weak ones, not from guesswork. A typical weak page scores around 30, an average one around 55 and a strong one 80 or more.') + (R.psi ? " Google PageSpeed counts for 20%." : " Speed, search and accessibility are shown for context and don’t change this score.") + "</p>" + (up || dn ? '<div class="rp-moved">' + (up ? "<div><b>Helping your score</b><ul>" + up + "</ul></div>" : "") + (dn ? "<div><b>Holding it back</b><ul>" + dn + "</ul></div>" : "") + "</div>" : "") + "</details></div>";
    } else
    h += '<details class="rp-how"><summary>How the score works</summary><p>' + (C.limited ? "We couldn’t render this page on a phone, so this is a limited score from its code only. " : "") + 'Conversion counts for 40%, speed 25%, accessibility 20% and search and AI 15%. Your weakest area pulls the total down further, because one broken area costs sales on its own. Basics every store needs, like a price or a contact link, earn nothing when present and cost a lot when missing, and checks we can only confirm from a keyword get partial credit. An area we couldn’t measure is left out, never counted as zero. Agent readiness and growth stack are shown for context, not scored.' + (C.est ? " Speed and accessibility are estimated from your page’s code when Google PageSpeed isn’t available." : "") + "</p></details></div>";
    h += '<div class="rp-page"><div class="browser"><div class="bbar"><i></i><i></i><i></i><span class="url">' + esc(host + (path.length > 1 ? path : "")) + '</span></div><div class="bview' + (shot ? " phone" : "") + '">';
    if (shot) h += '<img class="full" src="' + esc(shot) + '" alt="Your page on a phone, as Google loaded it">';
    else {
      if (og) h += '<img class="og" src="' + esc(og) + '" alt="" data-hide-broken>';
      h += '<div class="wire on"><i class="wimg"></i><span class="wtag">First screen</span><span class="wh">' + esc(P.heroHeadline || P.title || host) + '</span><i class="w2"></i><i class="w3"></i>' + (P.primaryCta ? '<span class="wcta">' + esc(P.primaryCta) + "</span>" : "") + "</div>";
    }
    h += "</div></div>";
    var facts = [["Page", PAGE_TYPE[P.pageType] || "Page"], ["Main button", P.primaryCta || "None found"], ["Prices", P.aov ? "Typical " + money(P.aov, P.currency) : P.prices ? plural(P.prices, "price") : "None found"], ["Reviews", P.rating && P.rating.value ? P.rating.value + " from " + (P.rating.count || "?") + " reviews" : P.hasReviews ? "Shown" : "Not found"]];
    h += '<dl class="rp-facts">' + facts.map(function (f) { return "<div><dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl></div>";
    h += "</section>";

    /* v12: the short report (shoppers, top 3 fixes, house rules), with everything else behind one button */
    if (C.v4 && GR) {
      h += '<div class="rp-short">' + GR.short + "</div>";
      if (!C.unread) h += '<div class="rp-more"><button type="button" class="btn btn-ghost" data-full-toggle aria-expanded="false">See the full report</button><span>Fix planner on your page, every buyer question, growth levers, speed and search details' + (hasComp ? ", competitors" : "") + "</span></div>";
    }
    /* body: rail + main */
    var nav;
    if (GR) {
      nav = GR.nav.slice();
      if (T.length) nav.push(["rp-tests", "Tests to run", T.length]);
      nav.push(["rp-beyond", "Speed, search and AI details", ""]);
      if (hasComp) nav.push(["rp-compare", "Your competitors", R.comps.length]);
      nav.push(["rp-next", "Next step", ""]);
    } else {
      nav = [["rp-findings", "What’s costing sales", F.length], ["rp-tests", "First tests and plan", T.length], ["rp-beyond", "Speed, search and AI", ""]];
      if (hasComp) nav.push(["rp-compare", "Competitors", R.comps.length]);
      nav.push(["rp-worth", "What a lift is worth", ""], ["rp-next", "Next step", ""]);
    }
    h += '<div class="rp-body"' + (C.v4 ? " data-full hidden" : "") + '><nav class="rp-rail" aria-label="In this report"><span class="an-label">In this report</span>' + nav.map(function (n, i) { return '<a href="#' + n[0] + '" data-rail="' + n[0] + '"' + (i === 0 ? ' class="on"' : "") + "><span>" + esc(n[1]) + "</span>" + (n[2] !== "" ? "<i>" + n[2] + "</i>" : "") + "</a>"; }).join("") + '<a class="btn btn-primary btn-sm rp-rail-cta" href="#rp-next">Fix it with TrooCRO</a></nav><div class="rp-main">';
    if (GR) {
      h += GR.html;
      if (T.length) h += rpTests(R, T, L, host, created);
      h += rpBeyond(R, host);
      if (hasComp) h += compSection(R);
      h += rpNext(R, C, host, GR.services);
    } else {
      h += rpFindings(R, F, L, host, passes);
      if (T.length) h += rpTests(R, T, L, host, created);
      h += rpBeyond(R, host);
      if (hasComp) h += compSection(R);
      h += rpWorth(R);
      h += rpNext(R, C, host);
    }
    var nChecks = (R.checks || []).length;
    h += '<div class="an-foot-note"><p>This analysis ran on a lightweight version of the TrooCRO engine, from your page’s public HTML' + (R.psi ? " and Google PageSpeed" : "") + ". It checked " + plural(nChecks, "signal") + " that apply to a " + esc((PAGE_TYPE[P.pageType] || "page").toLowerCase()) + " in the TrooCRO library. A full TrooCRO diagnosis covers every page type, your analytics and funnel data, and all 937 signals across 79 buyer barriers.</p><p>Benchmarks come from the TrooCRO category benchmark library. Nothing was installed on your store.</p></div>";
    h += "</div></div></div></div>";
    return { html: h, C: C, F: F, T: T };
  }

  var SHORT = {
    hero_single_action: "No single clear action in the first screen", cta_copy: "Main button doesn’t say what you get", cta_competition: "Too many competing actions up top",
    proof_density: "No proof in the first screen", founder_story: "No About or brand story", contact: "Contact details hard to find", live_chat: "No chat for last-minute questions",
    policies: "Privacy or refund policy not linked", address: "No company address", search: "No search box", newsletter: "Email sign-up doesn’t say what you get",
    pdp_atc: "No Add to cart found", pdp_sticky: "No sticky Add to cart on mobile", pdp_price: "Price not found", pdp_anchor: "No MRP or compare-at price",
    pdp_reviews: "Ratings not shown near the top", pdp_trust: "Few trust badges near the button", pdp_ship_returns: "Delivery time and returns not shown",
    pdp_cod: "No cash-on-delivery mention", pdp_pincode: "No pincode delivery check", pdp_guarantee: "No guarantee or easy-return promise", pdp_faq: "No product FAQ",
    pdp_urgency: "No honest reason to buy now", pdp_bundle: "No bundle or multi-pack", pdp_emi: "No EMI or pay-later near the price", pdp_variants: "Too many variants without grouping",
    cat_concern: "No shop-by-concern path", cat_quiz: "No quiz or finder for first-time buyers", cat_brandproof: "No brand-level proof up top", cat_occasion: "No shop-by-occasion path",
    cat_styling: "No styling inspiration", cat_goal: "No shop-by-goal path", cat_cert: "No certifications shown", cat_room: "No shop-by-room path", cat_emi: "No EMI message",
    cat_diet: "No shop-by-diet path", cat_fresh: "No freshness reassurance", cat_hallmark: "No hallmark or certification bar", cat_gift: "No gifting path",
    cat_genuine: "No genuine-product promise", cat_age: "No shop-by-age path", cat_safety: "No safety credentials", cat_pet: "No shop-by-pet path", cat_vet: "No vet validation", cat_sport: "No shop-by-sport path"
  };
  /* ---------------- rendered-page findings ----------------
     Checks run on the page as drawn on a 390px phone (not just its code). Each maps to TrooCRO buyer barriers;
     fixes follow the barrier library's "what good looks like" and published e-commerce UX research. */
  var CAT_HAS = function (cat, list) { return list.indexOf(cat) >= 0; };
  var RULES = [
    /* ---------- product page ---------- */
    { k: "rc_cta_atf", u: "cta-fold", t: "PDP", b: ["B70", "B67"], rc: "Friction / UX", sev: 3, sevf: function (f) { return f.cta_atf >= 0.5 ? 2 : 3; }, r: "cta", s: "Add to cart below the first screen", n: "Add to cart not on the first phone screen",
      ok: function (f) { return f.cta_found && !f.cta_hidden ? (f.cta_atf >= 1 || !!f.sticky_cta) : null; }, ev: ["On a phone, Add to cart sits below the first screen, so shoppers scroll before they can act.", "Add to cart is visible on the first phone screen."],
      fx: ["S", "H", "A/B", "Fit the product name, price, one benefit line and Add to cart into the first phone screen.", ["Shorten the image gallery on mobile so Add to cart lands above the fold", "Move secondary badges and long offers below the button"]] },
    { k: "rc_sticky", u: "pdp-sticky", t: "PDP", b: ["B67", "B70"], rc: "Friction / UX", sev: 2, r: "cta", s: "No sticky Add to cart while scrolling", n: "Add to cart scrolls out of reach",
      ok: function (f) { return f.cta_found && !f.cta_hidden ? !!f.sticky_cta : null; }, ev: ["Once shoppers scroll into the details, there is no sticky Add to cart to act on.", "A sticky Add to cart stays in reach while scrolling."],
      fx: ["S", "M", "A/B", "Add a slim sticky bar with price and Add to cart that appears after the main button scrolls away.", ["Sticky Add to cart bar on mobile showing price and selected variant"]] },
    { k: "rc_cta_style", u: "cta-strength", t: "PDP", b: ["B67"], rc: "Clarity failure", sev: 3, sevf: function (f) { return (0.55 * (f.cta_filled >= 1 ? Math.max(0, Math.min(1, ((f.cta_contrast || 1) - 1.25) / 1.75)) : 0.25) + 0.3 * Math.max(0, Math.min(1, ((f.cta_height || 0) - 26) / 18)) + 0.15 * Math.max(0, Math.min(1, ((f.cta_width || 0) * 366 - 60) / 96))) < 0.5 ? 3 : 2; }, r: "cta", s: "Main button doesn't stand out", n: "Low-contrast or outlined main button",
      ok: function (f) { return f.cta_found && !f.cta_hidden ? (0.55 * (f.cta_filled >= 1 ? Math.max(0, Math.min(1, ((f.cta_contrast || 1) - 1.25) / 1.75)) : 0.25) + 0.3 * Math.max(0, Math.min(1, ((f.cta_height || 0) - 26) / 18)) + 0.15 * Math.max(0, Math.min(1, ((f.cta_width || 0) * 366 - 60) / 96))) >= 0.9 : null; }, ev: ["The main button is outlined or close in colour to the page, so it doesn't read as the next step.", "The main button is solid and stands out from the page."],
      fx: ["S", "M", "A/B", "Make Add to cart a solid, full-width button in your strongest brand colour, and keep every other button visually quieter.", ["Solid full-width Add to cart in the brand accent colour"]] },
    { k: "rc_price_atf", u: "pdp-price", t: "PDP", b: ["B05"], rc: "Offer weakness", sev: 3, sevf: function (f) { return f.price_atf >= 0.5 ? 2 : 3; }, r: "price", s: "Price not on the first screen", n: "Price hidden below the first screen",
      ok: function (f) { return f.price_hidden ? null : f.price_atf >= 1; }, ev: ["Shoppers can't see the price without scrolling on a phone.", "Price is visible on the first phone screen."],
      fx: ["S", "M", "A/B", "Show price, MRP and saving right under the product name.", ["Price block with MRP strike-through directly under the title"]] },
    { k: "rc_rating_top", u: "proof", t: "PDP", b: ["B13"], rc: "Trust deficit", sev: 2, r: "reviews", s: "Star rating far from the product name", n: "Star rating missing near the title",
      ok: function (f) { return f.rating_any ? !!f.rating_top : null; }, ev: ["Your star rating appears on the page, but not near the product name, where shoppers look first.", "A star rating sits near the product name."],
      fx: ["S", "H", "A/B", "Put the star rating and review count right under the product name, linked to the reviews section.", ["Star rating and review count under the title, tapping through to reviews"]] },
    { k: "rc_proof_none", u: "proof", t: "PDP", b: ["B13"], rc: "Trust deficit", sev: 3, r: "reviews", s: "No star ratings or reviews", n: "No social proof on the product page",
      ok: function (f) { return !!(f.rating_any || f.rating_top); }, ev: ["We couldn't find star ratings, a review count or reviews anywhere on the page.", "Ratings or reviews are shown."],
      fx: ["M", "H", "A/B", "Show the star rating and review count under the product name, and a reviews section with photos further down.", ["Star rating and count under the title", "Reviews section with photo reviews pinned first"]] },
    { k: "rc_review_volume", u: "proof", t: "PDP", b: ["B13"], rc: "Trust deficit", sev: 2, r: "reviews", s: "Few reviews shown", n: "Thin review count",
      ok: function (f) { return f.rating_any ? f.review_count_log >= 0.778 : null; }, ev: [function (f) { var n = Math.round(Math.pow(10, f.review_count_log || 0) - 1); return "Only " + n + " review" + (n === 1 ? "" : "s") + " show on the page; under five reads as unproven."; }, "Enough reviews show on the page."],
      fx: ["M", "H", "Ship", "Grow and surface review volume: post-delivery review requests, and roll up reviews across variants and packs.", ["Automated review request 7 days after delivery with a photo prompt", "Show combined reviews across all sizes and packs"]] },
    { k: "rc_photo_reviews", t: "PDP", b: ["B13", "B01"], rc: "Trust deficit", sev: 1, r: "content", s: "No customer photos in reviews", n: "Reviews without customer photos",
      ok: function (f) { return f.review_cards ? !!f.photo_reviews : null; }, ev: ["Reviews have no customer photos, so shoppers can't see the product in real hands.", "Reviews include customer photos."],
      fx: ["S", "M", "Ship", "Ask for photos in review requests and pin photo reviews first.", ["Photo-first review gallery near the top of the reviews section"]] },
    { k: "rc_gallery", u: "pdp-gallery", t: "PDP", b: ["B01"], rc: "Clarity failure", sev: 2, r: "img", s: "Too few product photos", n: "Thin product gallery",
      ok: function (f) { return ((f.gallery || 0) - 2) / 4 + (f.video ? 0.15 : 0) >= 0.5; }, ev: [function (f) { return "We found " + (f.gallery || 0) + " product images on the page. Buyers decide from photos: angles, scale, texture, in use."; }, function (f) { return f.gallery + " product images are on the page."; }],
      fx: ["M", "H", "A/B", "Aim for 8 or more images: front, back, close-up texture, in hand for scale, in use, and what's in the box.", ["Add in-scale and in-use images to the gallery", "Thumbnail strip so shoppers know more images exist"]] },
    { k: "rc_video", u: "pdp-gallery", t: "PDP", b: ["B01", "B68"], rc: "Desire deficit", sev: 1, r: "img", s: "No product video", n: "No product video",
      ok: function (f) { return f.video >= 1; }, ev: ["There's no product video showing it in use.", "A product video is on the page."],
      fx: ["M", "M", "A/B", "Add a 15 to 30 second in-use video as the second gallery item.", ["Short in-use video as the second gallery slide"]] },
    { k: "rc_delivery_near", u: "pdp-delivery", t: "PDP", b: ["B09"], rc: "Trust deficit", sev: 1, r: "trust", s: "Delivery info far from the button", n: "Delivery date missing by the button",
      ok: function (f) { return f.delivery_any ? !!f.delivery_near : null; }, ev: ["Delivery info is on the page, but not next to the main button where shoppers decide.", "Delivery info sits by the button."],
      fx: ["S", "H", "A/B", "Show an estimated delivery date (or a pincode check) right under Add to cart.", ["'Get it by <date>' line under Add to cart with a pincode check"]] },
    { k: "rc_delivery", u: "pdp-delivery", t: "PDP", b: ["B09"], rc: "Trust deficit", sev: 2, r: "trust", s: "No delivery promise", n: "No delivery date, dispatch time or pincode check",
      ok: function (f) { return !!(f.delivery_any || f.delivery_near); }, ev: ["We couldn't find a delivery date, dispatch time or pincode check anywhere on the page.", "A delivery promise is shown."],
      fx: ["S", "M", "A/B", "Show an estimated delivery date or a pincode check right under the main button.", ["'Get it by Thursday' line under Add to cart", "Pincode check with delivery date"]] },
    { k: "rc_trust_near", u: "trust", t: "PDP", b: ["B04", "B08"], rc: "Trust deficit", sev: 1, r: "trust", s: "Little reassurance by the button", n: "No reassurance strip by the button",
      ok: function (f) { return f.cta_found ? f.trust_near >= 2 : null; }, ev: [function (f) { return "Around Add to cart we found " + (f.trust_near || 0) + " reassurance cues (returns, COD, genuine, secure payment). This is where hesitation happens."; }, function (f) { return f.trust_near + " reassurance cues sit around Add to cart."; }],
      fx: ["S", "H", "A/B", "Add a 3-icon strip under Add to cart: easy returns, cash on delivery or secure payment, and genuine product.", ["3-icon trust strip under Add to cart"]] },
    { k: "rc_trust", u: "trust", t: "PDP", b: ["B08", "B09", "B10"], rc: "Trust deficit", sev: 2, r: "trust", s: "Missing delivery, returns or payment reassurance", n: "Store reassurance incomplete",
      ok: function (f) { var need = [f.returns_msg, f.delivery_any || f.delivery_near, f.payment_opts]; if (f.india) need.push(f.cod_any); return need.filter(Boolean).length / need.length >= 0.5; },
      ev: [function (f) { var miss = []; if (!f.returns_msg) miss.push("returns"); if (!(f.delivery_any || f.delivery_near)) miss.push("delivery"); if (!f.payment_opts) miss.push("payment options"); if (f.india && !f.cod_any) miss.push("cash on delivery"); return "Shoppers can't find " + miss.join(", ") + " on the page."; }, "Delivery, returns and payment are covered."],
      fx: ["S", "H", "A/B", "Add one reassurance row under the main button: delivery time, easy returns, and payment options (COD where you offer it).", ["Icon row under Add to cart: delivery, returns, COD/UPI", "Link each item to the full policy"]] },
    { k: "rc_returns_near", u: "trust", t: "PDP", b: ["B08"], rc: "Trust deficit", sev: 1, r: "trust", s: "Returns info far from the button", n: "Return promise missing near the button",
      ok: function (f) { return f.returns_msg ? !!f.returns_near : null; }, ev: ["Your returns policy is on the page, but not next to the main button where shoppers hesitate.", "Returns info sits by the button."],
      fx: ["S", "H", "A/B", "State the return window in plain words next to the button, for example '7-day easy returns'.", ["One-line return promise under Add to cart linking to the policy"]] },
    { k: "rc_benefits", u: "pdp-benefits", t: "PDP", b: ["B03", "B68"], rc: "Clarity failure", sev: 1, r: "title", s: "No scannable benefit points", n: "Benefits buried in paragraphs",
      ok: function (f) { return (f.benefit_bullets || 0) >= 2; }, ev: ["We couldn't find 3 or more short benefit points near the top; benefits sit in paragraphs shoppers skip.", "Benefit points are easy to scan."],
      fx: ["S", "M", "A/B", "Add 3 to 4 outcome-first bullets under the title, each one line.", ["3 outcome-first benefit bullets under the product name"]] },
    { k: "rc_structure", u: "subheads", t: "PDP", b: ["B67"], rc: "Friction / UX", sev: 1, r: "content", s: "Details not broken into sections", n: "Product details lack structure",
      ok: function (f) { return f.headings >= 4 || f.accordions >= 3; }, ev: ["The product details aren't broken into clear sections, so answers are hard to find.", "Details are split into clear sections."],
      fx: ["S", "M", "Ship", "Split details into labelled sections: benefits, how to use, ingredients or materials, shipping and returns, FAQ.", ["Collapsible sections with clear labels"]] },
    { k: "rc_text_wall", u: "para", t: "ALL", b: ["B67"], rc: "Friction / UX", sev: 1, r: "content", s: "Long paragraphs", n: "Several paragraphs over 110 words",
      ok: function (f) { return (f.long_paras || 0) < 3; }, ev: [function (f) { return f.long_paras + " paragraphs run over 110 words; on a phone that reads as a wall of text."; }, "Paragraphs are short enough to scan."],
      fx: ["S", "L", "Ship", "Break long copy into short paragraphs, bullets and subheads.", ["Rewrite long blocks into bullets with subheads"]] },
    { k: "rc_title", u: "h1", t: "PDP", b: ["B03"], rc: "Clarity failure", sev: 1, r: "title", s: "Product name too long", n: "Overlong product name",
      ok: function (f) { return f.h1 ? f.title_len <= 70 : null; }, ev: [function (f) { return "The product name is " + f.title_len + " characters, so it wraps over several lines and pushes the price down."; }, "The product name is short and scannable."],
      fx: ["S", "L", "A/B", "Keep the visible name under about 60 characters and move SEO keywords into the description.", ["Short display name with keywords moved below"]] },
    { k: "rc_overflow", u: "hscroll", t: "ALL", b: ["B67"], rc: "Friction / UX", sev: 3, r: "nav", s: "Page wider than the phone screen", n: "Page spills sideways on phones",
      ok: function (f) { return !f.overflow; }, ev: ["Part of the page is wider than a phone screen, so shoppers can pan sideways by accident.", "The page fits the phone screen."],
      fx: ["S", "M", "Ship", "Find the element overflowing on mobile (often a wide table, image or slider) and constrain it to the screen width.", ["Fix the overflowing element on mobile"]] },
    { k: "rc_lorem", u: "lorem", t: "ALL", b: ["B04"], rc: "Trust deficit", sev: 3, r: "content", s: "Placeholder text on the page", n: "Lorem ipsum or placeholder copy is live",
      ok: function (f) { return !f.lorem; }, ev: ["The page still shows placeholder copy (like lorem ipsum), which makes the store look unfinished.", "No placeholder text."],
      fx: ["S", "H", "Ship", "Replace every placeholder block with real copy before sending traffic to the page.", ["Search the theme for lorem ipsum and template text"]] },
    { k: "rc_popup", u: "interstitial", t: "ALL", b: ["B67"], rc: "Friction / UX", sev: 3, r: "content", s: "Popup covers the page on load", n: "Popup covering the page",
      ok: function (f) { return !f.fixed_layers; }, ev: ["A large overlay covers the page as it loads, before shoppers have seen the product.", "No overlay covers the page on load."],
      fx: ["S", "M", "A/B", "Delay popups until scroll or exit intent, and never cover the product on first view.", ["Exit-intent or 30-second delayed popup instead of on load"]] },
    { k: "rc_cta_compete", u: "cta-compete", t: "ALL", b: ["B67"], rc: "Clarity failure", sev: 2, r: "cta", s: "Too many competing buttons up top", n: "Several solid buttons compete on the first screen",
      ok: function (f) { return f.solid_atf ? f.solid_atf <= 3 : null; }, ev: [function (f) { return f.solid_atf + " solid buttons compete on the first screen, so none of them reads as the next step."; }, "The first screen has a clear next step."],
      fx: ["S", "M", "A/B", "Keep one solid primary button on the first screen; make secondary actions outlined or text links.", ["One solid primary button", "Secondary actions as text links"]] },
    { k: "rc_promo_noise", t: "ALL", b: ["B67"], rc: "Friction / UX", sev: 1, r: "nav", s: "Too many competing offers", n: "Competing offers and codes",
      ok: function (f) { return f.promo_noise <= 4; }, ev: [function (f) { return "We counted " + f.promo_noise + " separate offers, codes or discounts on the page, which compete with the product."; }, "Offers are kept focused."],
      fx: ["S", "M", "A/B", "Lead with one offer near the price and move the rest into a single 'offers' drawer.", ["Single best offer by the price, others in a drawer"]] },
    { k: "rc_how_to", t: "PDP", b: ["B11"], rc: "Clarity failure", sev: 1, r: "content", s: "No how-to-use guidance", n: "Missing how-to-use",
      ok: function (f) { return !!f.how_to_use; }, ev: ["We couldn't find how-to-use or care guidance on the page.", "How-to-use guidance is on the page."],
      fx: ["S", "M", "Ship", "Add a short 'How to use' section with 3 steps and how often.", ["3-step how-to-use block with icons"]] },
    { k: "rc_composition", t: "PDP", b: ["B12", "B33", "B38"], rc: "Clarity failure", sev: 2, r: "content", s: "No ingredients, materials or specs", n: "Ingredients, materials or specs missing",
      ok: function (f) { return !!f.composition; }, ev: ["We couldn't find ingredients, materials or specifications on the page.", "Ingredients, materials or specs are listed."],
      fx: ["S", "M", "Ship", "List what it's made of in plain words, with the hero ingredients or materials called out.", ["Key ingredients or materials with one-line benefits"]] },
    { k: "rc_size_guide", u: "pdp-variant", t: "PDP", cats: ["Fashion & Apparel", "Sports & Fitness"], b: ["B32", "B62", "B50"], rc: "Clarity failure", sev: 3, r: "details", s: "No size guide", n: "Size guide missing",
      ok: function (f) { return !!f.size_guide; }, ev: ["There's no size chart or fit guide, which is the top reason apparel shoppers hesitate or return.", "A size guide is available."],
      fx: ["S", "H", "A/B", "Add a size chart next to the size selector with body measurements and a fit note (true to size, runs small).", ["Size chart link beside sizes plus a one-line fit note"]] },
    { k: "rc_dimensions", t: "PDP", cats: ["Home & Living"], b: ["B36", "B53"], rc: "Clarity failure", sev: 3, r: "details", s: "No dimensions shown", n: "Product dimensions missing",
      ok: function (f) { return !!f.dimensions; }, ev: ["We couldn't find product dimensions, so shoppers can't tell if it fits their space.", "Product dimensions are shown."],
      fx: ["S", "H", "A/B", "Show dimensions near the price and add a dimensions image with a person or room for scale.", ["Dimensions image in the gallery", "W x D x H line under the price"]] },
    { k: "rc_certs", t: "PDP", cats: ["Health & Wellness", "Beauty & Personal Care", "Baby & Kids", "Food & Beverages", "Jewellery & Accessories", "Pet Care"], b: ["B29", "B46", "B12"], rc: "Trust deficit", sev: 2, r: "trust", s: "No certifications or testing shown", n: "Certifications or testing not shown",
      ok: function (f) { return !!f.certs; }, ev: ["We couldn't find certifications or test claims (FSSAI, GMP, lab tested, hallmark and so on) on the page.", "Certifications or testing are shown."],
      fx: ["S", "H", "A/B", "Show the relevant certification badges and a 'lab tested' proof near the price.", ["Certification badge row with links to reports"]] },
    { k: "rc_free_ship", t: "PDP", b: ["B69"], rc: "Trust deficit", sev: 2, r: "price", s: "Shipping cost not shown", n: "Shipping cost or threshold missing",
      ok: function (f) { return !!f.free_ship_msg; }, ev: ["The page doesn't say whether shipping is free or what it costs, so the total feels uncertain.", "Shipping cost or free-shipping threshold is shown."],
      fx: ["S", "M", "A/B", "State shipping up front: 'Free delivery above ₹X' near the price.", ["Free-delivery threshold line by the price"]] },
    { k: "rc_compare", t: "PDP", b: ["B07"], rc: "Offer weakness", sev: 1, r: "content", s: "No 'why us' comparison", n: "No comparison with alternatives",
      ok: function (f) { return !!f.compare_table; }, ev: ["There's no comparison showing why this beats the alternatives.", "A comparison helps shoppers choose."],
      fx: ["M", "M", "A/B", "Add a simple 'Us vs others' table on 3 to 4 points shoppers care about.", ["Us vs others comparison table"]] },
    { k: "rc_crosssell", t: "PDP", b: ["B05"], rc: "Offer weakness", sev: 1, r: "content", s: "No bundles or cross-sell", n: "No bundle or cross-sell",
      ok: function (f) { return !!f.crosssell; }, ev: ["There's no 'frequently bought together' or bundle, which leaves order value on the table.", "Bundles or cross-sell are offered."],
      fx: ["M", "M", "A/B", "Add a 'Complete the routine' or 'Frequently bought together' bundle with a small saving.", ["2-item bundle with a visible saving"]] },
    { k: "rc_gift", t: "PDP", cats: ["Jewellery & Accessories"], b: ["B19", "B21"], rc: "Offer weakness", sev: 2, r: "trust", s: "No gifting option", n: "Gifting not supported",
      ok: function (f) { return !!f.gift; }, ev: ["We couldn't find gift wrap, a gift message or gift packaging, though jewellery is often bought as a gift.", "Gifting options are offered."],
      fx: ["S", "M", "A/B", "Add a gift-wrap and message option near the button and show the gift box in the gallery.", ["Gift wrap toggle with a message field"]] },
    { k: "rc_variants_ui", u: "pdp-variant", t: "PDP", b: ["B15"], rc: "Friction / UX", sev: 1, r: "details", s: "Variants in a dropdown", n: "Variant picker hidden in a dropdown",
      ok: function (f) { return f.variants_ui === 0.5 ? false : null; }, ev: ["Variants sit in a dropdown, which hides the options shoppers are choosing between.", ""],
      fx: ["S", "M", "A/B", "Show variants as buttons or swatches with stock status.", ["Variant buttons with out-of-stock marked"]] },
    { k: "rc_tiny_taps", u: "tap", t: "ALL", b: ["B67"], rc: "Friction / UX", sev: 3, r: "content", s: "Tap targets too small", n: "Tiny tap targets",
      ok: function (f) { return f.tiny_taps <= 8; }, ev: [function (f) { return f.tiny_taps + " links or buttons near the top are smaller than a fingertip (under 28px)."; }, "Tap targets are a comfortable size."],
      fx: ["S", "L", "Ship", "Make icons and links at least 44px tall on mobile.", ["Increase tap areas of icons and small links"]] },
    { k: "rc_small_text", u: "font", t: "ALL", b: ["B67"], rc: "Clarity failure", sev: 1, r: "content", s: "Text too small to read", n: "Small text on mobile",
      ok: function (f) { return f.small_text <= 0.25; }, ev: [function (f) { return Math.round(f.small_text * 100) + "% of text near the top is smaller than 12px on a phone."; }, "Text is a readable size."],
      fx: ["S", "L", "Ship", "Set body text to at least 14px on mobile.", ["Raise mobile body text to 14 to 16px"]] },
    /* ---------- homepage ---------- */
    { k: "rc_hero_cta", u: "cta-fold", t: "HOME", b: ["B65", "B67"], rc: "Clarity failure", sev: 3, r: "cta", s: "No clear action in the first screen", n: "Hero without a clear action",
      ok: function (f) { return !!f.hero_cta; }, ev: ["The first screen has no clear button, so shoppers have to work out where to go.", "The first screen has a clear action."],
      fx: ["S", "H", "A/B", "Give the hero one clear button that leads to your bestsellers or main category.", ["One-button hero linking to bestsellers"]] },
    { k: "rc_hero_clear", u: "value-prop", t: "HOME", b: ["B65", "B68"], rc: "Intent / Message mismatch", sev: 3, sevf: function (f) { return f.hero_head_words >= 1 && f.hero_head_words <= 17 ? 2 : 3; }, r: "title", s: "First screen doesn't say what you sell", n: "Unclear value proposition up top",
      ok: function (f) { return f.hero_head_words >= 1 && f.hero_head_words <= 12; }, ev: [function (f) { return f.hero_head_words ? "The first-screen headline runs " + f.hero_head_words + " words; visitors take in about 12 at a glance." : "There is no visible headline on the first screen saying what you sell."; }, "The first screen says what you sell in a short headline."],
      fx: ["S", "H", "A/B", "Put a one-line promise in the hero: what it is, who it's for, why it's better.", ["One-line value proposition over the hero image"]] },
    { k: "rc_categories", u: "home-paths", t: "HOME", b: ["B02", "B15"], rc: "Discovery / Navigation", sev: 2, r: "content", s: "Few shopping paths up top", n: "Categories not visible early",
      ok: function (f) { return (f.category_entries || 0) + Math.min(f.cards_top || 0, 4) >= 2; }, ev: [function (f) { return "Only " + f.category_entries + " category links appear in the first three screens, so shoppers can't see your range."; }, "Shoppers can see your range of categories early."],
      fx: ["S", "H", "A/B", "Add a shop-by-category row (image tiles) right after the hero covering your main categories.", ["Category tiles row under the hero"]] },
    { k: "rc_products_soon", u: "home-paths", t: "HOME", b: ["B01", "B68"], rc: "Discovery / Navigation", sev: 2, r: "content", s: "Products appear late", n: "Products appear late on the homepage",
      ok: function (f) { return f.cards ? f.first_product_screens <= 2.2 : null; }, ev: [function (f) { return "The first product appears about " + f.first_product_screens.toFixed(1) + " screens down."; }, "Products appear early."],
      fx: ["S", "M", "A/B", "Bring a bestseller row into the first two screens.", ["Bestsellers carousel directly under the hero"]] },
    { k: "rc_card_price", u: "col-cards", t: "LIST", b: ["B05"], rc: "Offer weakness", sev: 2, r: "content", s: "Product cards without prices", n: "Prices missing on product cards",
      ok: function (f) { return f.cards >= 3 && f.card_price > 0 ? 0.7 * f.card_price + 0.3 * (f.card_rating || 0) >= 0.5 : null; }, ev: [function (f) { return Math.round((1 - f.card_price) * 100) + "% of product cards don't show a price."; }, "Product cards show prices."],
      fx: ["S", "M", "Ship", "Show price and MRP on every product card.", ["Price and MRP on all product cards"]] },
    { k: "rc_card_rating", u: "col-cards", t: "LIST", b: ["B13"], rc: "Trust deficit", sev: 1, r: "content", s: "Product cards without ratings", n: "Ratings missing on product cards",
      ok: function (f) { return f.cards >= 3 && f.card_price >= 0.5 ? f.card_rating >= 0.5 : null; }, ev: ["Most product cards don't show a star rating and count, which shoppers use to pick what to open.", "Product cards show ratings."],
      fx: ["S", "M", "A/B", "Show the star average and number of reviews on every product card.", ["Stars and review count on product cards"]] },
    { k: "rc_home_proof", u: "proof", t: "HOME", b: ["B13", "B04"], rc: "Trust deficit", sev: 2, r: "reviews", s: "No reviews or proof on the homepage", n: "Homepage lacks social proof",
      ok: function (f) { return !!(f.social_scale || f.testimonials || f.rating_top); }, ev: ["We couldn't find reviews, testimonials or customer numbers on the homepage.", "Social proof is on the homepage."],
      fx: ["S", "M", "A/B", "Add a reviews strip with real customer quotes and your average rating.", ["Customer reviews strip after bestsellers"]] },
    { k: "rc_home_trust", u: "trust", t: "HOME", b: ["B08", "B09", "B10"], rc: "Trust deficit", sev: 2, r: "trust", s: "No trust strip on the homepage", n: "Homepage lacks shipping and returns reassurance",
      ok: function (f) { return f.trust_page >= 3; }, ev: ["The homepage doesn't reassure on shipping, returns and payment.", "Shipping, returns and payment are reassured."],
      fx: ["S", "M", "A/B", "Add an icon strip under the hero: free shipping, easy returns, COD or secure payment.", ["Trust icon strip under the hero"]] },
    { k: "rc_search", u: "search", t: "HOME", b: ["B15"], rc: "Discovery / Navigation", sev: 1, r: "nav", s: "No visible search", n: "Search not visible",
      ok: function (f) { return !!f.search_box; }, ev: ["We couldn't find a search box or search icon in the header.", "Search is available."],
      fx: ["S", "M", "Ship", "Show a search icon or bar in the mobile header.", ["Search icon in the mobile header"]] },
    { k: "rc_carousel", t: "HOME", b: ["B67"], rc: "Friction / UX", sev: 1, r: "img", s: "Hero is a rotating carousel", n: "Rotating hero carousel",
      ok: function (f) { return !f.carousel; }, ev: ["The hero is a rotating carousel; most visitors only take in the first slide.", "The hero is a single focused message."],
      fx: ["S", "M", "A/B", "Replace the carousel with one hero message, and move other offers into tiles below.", ["Static hero with offer tiles underneath"]] },
    /* ---------- collection page ---------- */
    { k: "rc_products_early", u: "col-fold", t: "COLLECTION", b: ["B15", "B01"], rc: "Discovery / Navigation", sev: 3, sevf: function (f) { return (f.cards_atf || 0) === 1 ? 2 : 3; }, r: "content", s: "Products not visible on arrival", n: "Products pushed down by banners",
      ok: function (f) { return f.cards ? (f.cards_atf || 0) >= 2 : null; }, ev: [function (f) { return (f.cards_atf ? "Only " + f.cards_atf + " product shows" : "No products show") + " on the first phone screen; shoppers came to see products."; }, "Products show on arrival."],
      fx: ["S", "H", "A/B", "Trim the collection banner on mobile and start the product grid within the first screen, two products per row.", ["Slim collection header and 2-column grid on mobile"]] },
    { k: "rc_filter", u: "col-filters", t: "COLLECTION", b: ["B15", "B02"], rc: "Discovery / Navigation", sev: 2, r: "nav", s: "No filters or sorting", n: "No way to filter products",
      ok: function (f) { return f.cards > 12 ? !!(f.filter_ui || f.sort_ui) : null; }, ev: ["With this many products there are no filters or sorting, so shoppers scroll everything.", "Filters or sorting are available."],
      fx: ["M", "H", "A/B", "Add filters for the attributes shoppers choose by (size, price, type, concern) in a sticky filter button on mobile.", ["Sticky 'Filter' button opening a drawer of category filters"]] },
    { k: "rc_sort", u: "col-filters", t: "COLLECTION", b: ["B15"], rc: "Discovery / Navigation", sev: 1, r: "nav", s: "No sorting", n: "No sorting options",
      ok: function (f) { return f.cards > 12 && f.filter_ui ? !!f.sort_ui : null; }, ev: ["We couldn't find sorting by price, rating, bestselling or newest.", "Sorting is available."],
      fx: ["S", "M", "Ship", "Offer sorting by bestselling, price, rating and newest.", ["Sort by bestselling, price, rating, newest"]] },
    { k: "rc_card_add", t: "COLLECTION", b: ["B70"], rc: "Friction / UX", sev: 1, r: "content", s: "No quick add on cards", n: "No quick add on product cards",
      ok: function (f) { return f.cards >= 3 && f.card_price >= 0.5 ? f.card_add >= 0.5 : null; }, ev: ["Shoppers have to open each product to add it; there's no quick add on the cards.", "Cards have quick add."],
      fx: ["S", "M", "A/B", "Add a quick add button on product cards for single-variant items.", ["Quick add on product cards"]] },
    { k: "rc_card_swatch", t: "COLLECTION", cats: ["Fashion & Apparel", "Jewellery & Accessories", "Home & Living"], b: ["B15", "B49"], rc: "Discovery / Navigation", sev: 1, r: "content", s: "No colour swatches on cards", n: "Colour options hidden on cards",
      ok: function (f) { return f.cards >= 3 && f.card_price >= 0.5 ? f.card_swatch >= 0.3 : null; }, ev: ["Product cards don't show colour or finish options, so shoppers miss variants.", "Cards show colour options."],
      fx: ["S", "M", "A/B", "Show colour swatches on product cards.", ["Swatches under each product card"]] },
    { k: "rc_count", t: "COLLECTION", b: ["B15"], rc: "Discovery / Navigation", sev: 1, r: "nav", s: "Product count not shown", n: "No product count",
      ok: function (f) { return !!f.product_count; }, ev: ["The page doesn't show how many products are in the collection.", "The product count is shown."],
      fx: ["S", "L", "Ship", "Show the number of products next to the collection title.", ["'24 products' next to the title"]] },
    { k: "rc_coll_desc", t: "COLLECTION", b: ["B02", "B03"], rc: "Clarity failure", sev: 1, r: "title", s: "No collection intro", n: "No collection description",
      ok: function (f) { return !!f.collection_desc; }, ev: ["There's no short intro telling shoppers who this collection is for.", "A short collection intro is shown."],
      fx: ["S", "L", "Ship", "Add a one or two line intro under the collection title, and a 'how to choose' link.", ["Short collection intro with a buying-guide link"]] },
    /* ---------- sign-up sites: fintech, healthtech, services ---------- */
    { k: "rc_lead_cta", u: "cta-fold", t: "LEAD", b: ["B67", "B65"], rc: "Clarity failure", sev: 3, sevf: function (f) { return f.lead_cta2_found ? 2 : 3; }, r: "cta", s: "No clear action on the first screen", n: "No sign-up, apply or book action on the first phone screen",
      ok: function (f) { return f.lead_cta2_hidden ? null : !!f.lead_cta2_atf; }, ev: ["On a phone, the first screen has no clear Sign up, Apply or Book button, so visitors have to hunt for the next step.", "A clear action sits on the first screen."],
      fx: ["S", "H", "A/B", "Put one primary action (Open account, Apply now, Book a consult) under the headline on the first phone screen.", ["One solid primary button under the hero headline", "Repeat the same action as a sticky bar on mobile"]] },
    { k: "rc_lead_cta_style", u: "cta-strength", t: "LEAD", b: ["B67"], rc: "Clarity failure", sev: 3, sevf: function (f) { return (0.55 * (f.lead_cta2_filled ? Math.max(0, Math.min(1, ((f.lead_cta2_contrast || 1) - 1.25) / 1.75)) : 0.25) + 0.3 * Math.max(0, Math.min(1, ((f.lead_cta2_height || 44) - 26) / 18)) + 0.15 * Math.max(0, Math.min(1, ((f.lead_cta2_width || 0) * 390 - 60) / 96))) < 0.5 ? 3 : 2; }, r: "cta", s: "Main button doesn't stand out", n: "Low-contrast or outlined primary action",
      ok: function (f) { return f.lead_cta2_atf ? (0.55 * (f.lead_cta2_filled ? Math.max(0, Math.min(1, ((f.lead_cta2_contrast || 1) - 1.25) / 1.75)) : 0.25) + 0.3 * Math.max(0, Math.min(1, ((f.lead_cta2_height || 44) - 26) / 18)) + 0.15 * Math.max(0, Math.min(1, ((f.lead_cta2_width || 0) * 390 - 60) / 96))) >= 0.9 : null; }, ev: ["The main action is outlined or close in colour to the page, so it doesn't read as the next step.", "The main action is a solid, high-contrast button."],
      fx: ["S", "M", "A/B", "Make the primary action a solid button in your strongest brand colour.", ["Solid, full-width primary button on mobile"]] },
    { k: "rc_lead_hero", u: "value-prop", t: "LEAD", b: ["B65", "B03"], rc: "Clarity failure", sev: 3, sevf: function (f) { return f.hero_head_words >= 1 && f.hero_head_words <= 17 ? 2 : 3; }, r: "title", s: "Headline doesn't say what you offer", n: "Unclear or overlong first-screen headline",
      ok: function (f) { return f.hero_head_words >= 1 && f.hero_head_words <= 12; }, ev: ["The first-screen headline is missing, too long or too vague to say what you offer and for whom.", "The headline says what you offer in a few words."],
      fx: ["S", "H", "A/B", "Lead with a 5 to 12 word headline that names the outcome (for example, Personal loans up to ₹5 lakh in 10 minutes).", ["Outcome-first headline with one supporting line"]] },
    { k: "rc_lead_how", t: "LEAD", b: ["B11", "B03"], rc: "Clarity failure", sev: 1, r: "content", s: "No 'how it works'", n: "Process not explained",
      ok: function (f) { return !!f.how_it_works; }, ev: ["Visitors can't see the steps from sign-up to result, which raises effort and doubt.", "A how-it-works section explains the steps."],
      fx: ["S", "M", "Ship", "Add a 3-step how-it-works strip right after the hero.", ["Three numbered steps with icons and one line each"]] },
    { k: "rc_lead_proof", u: "proof", t: "LEAD", b: ["B13"], rc: "Trust deficit", sev: 3, r: "reviews", s: "No customer proof", n: "No user numbers, ratings or testimonials",
      ok: function (f) { return !!(f.stat_claims || f.testimonials || f.app_rating); }, ev: ["We couldn't find user numbers, app ratings or testimonials, so visitors have no sign that others trust you.", "Customer proof is shown."],
      fx: ["S", "H", "A/B", "Show your strongest proof near the hero: users served, app store rating, and two short testimonials.", ["Proof strip under the hero: users, rating, years", "Two named testimonials with photos"]] },
    { k: "rc_lead_regulated", u: "trust", t: "LEAD", b: ["B04"], rc: "Trust deficit", sev: 3, r: "trust", s: "No licence or regulation shown", n: "Regulatory or accreditation status not visible",
      ok: function (f) { return !!f.regulated; }, ev: ["We couldn't find a licence, regulator or accreditation (RBI, SEBI, IRDAI, NABL, HIPAA and similar), which visitors look for before sharing money or health data.", "Licence or regulation is shown."],
      fx: ["S", "H", "Ship", "State your licence or regulator in the hero or proof strip, with the registration number in the footer.", ["Regulated-by line near the main button", "Registration numbers in the footer"]] },
    { k: "rc_lead_trust", u: "trust", t: "LEAD", b: ["B04", "B08", "B16"], rc: "Trust deficit", sev: 2, r: "trust", s: "Weak trust signals", n: "Risk reversal, credibility and privacy not covered",
      ok: function (f) { var need = [f.guarantee || f.faq, f.regulated || f.press || (f.logos_strip || 0) >= 3, f.security]; return need.filter(Boolean).length >= 2; },
      ev: [function (f) { var miss = []; if (!(f.guarantee || f.faq)) miss.push("what happens if it goes wrong (guarantee or FAQs)"); if (!(f.regulated || f.press || (f.logos_strip || 0) >= 3)) miss.push("credibility (licence, press or partners)"); if (!f.security) miss.push("data privacy"); return "Visitors can't find " + miss.join(", ") + "."; }, "Risk reversal, credibility and privacy are covered."],
      fx: ["S", "H", "A/B", "Add a trust strip near the main action: licence or regulator, a guarantee or clear FAQ, and one line on data privacy.", ["Trust strip: regulator, guarantee, encryption", "FAQ block answering fees, safety and cancellation"]] },
    { k: "rc_lead_pricing", t: "LEAD", b: ["B69", "B05"], rc: "Offer weakness", sev: 2, r: "content", s: "Pricing or fees hard to find", n: "No pricing, fees or rates link",
      ok: function (f) { return !!f.pricing_link; }, ev: ["We couldn't find pricing, fees, charges or interest rates, which makes visitors expect surprises.", "Pricing or fees are easy to find."],
      fx: ["S", "M", "Ship", "Link to a plain pricing or fees page from the header and near the main button.", ["Pricing link in the header", "Starting-from price next to the main action"]] },
    { k: "rc_lead_form", u: "form", t: "LEAD", b: ["B70"], rc: "Friction / UX", sev: 2, r: "cta", s: "Long form up front", n: "Too many form fields before value",
      ok: function (f) { return f.form_fields ? f.form_fields <= 5 : null; }, ev: [function (f) { return "The form asks for " + f.form_fields + " things up front; each extra field loses people."; }, "The form is short."],
      fx: ["M", "H", "A/B", "Start with just a phone number or email and collect the rest after the first step.", ["Phone-number-first form with OTP", "Progressive steps with a progress bar"]] },
    { k: "rc_lead_faq", t: "LEAD", b: ["B08", "B03"], rc: "Trust deficit", sev: 1, r: "content", s: "No FAQs", n: "Common doubts not answered",
      ok: function (f) { return !!f.faq; }, ev: ["There's no FAQ answering the common doubts (eligibility, fees, cancellation, safety).", "FAQs answer common doubts."],
      fx: ["S", "M", "Ship", "Add 5 to 8 FAQs covering eligibility, fees, timelines, cancellation and data safety.", ["FAQ accordion above the footer"]] },
  ];
  var RULE_BY = {}; RULES.forEach(function (r) { RULE_BY[r.k] = r; });
  RULES.forEach(function (r) { SHORT[r.k] = r.s; REGION_OF[r.k] = r.r; });
  function ruleApplies(r, type, cat) {
    if (type === "LEAD") return r.t === "ALL" || r.t === "LEAD";
    if (r.t === "LEAD") return false;
    var t = type === "PDP" ? "PDP" : type === "COLLECTION" ? "COLLECTION" : "HOME";
    var ok = r.t === "ALL" || r.t === t || (r.t === "LIST" && (t === "HOME" || t === "COLLECTION"));
    if (!ok) return false;
    if (r.cats && r.cats.indexOf(cat) < 0) return false;
    return true;
  }
  function renderedChecks(f, page) {
    if (!f) return { checks: [], signals: {} };
    var type = page && page.lead ? "LEAD" : (page && page.pageType) || "PDP", cat = (page && page.category) || "", out = [], sigs = {};
    RULES.forEach(function (r) {
      if (!ruleApplies(r, type, cat)) return;
      var v; try { v = r.ok(f); } catch (e) { v = null; }
      if (v === null || v === undefined) return;
      var e = r.ev[v ? 1 : 0]; e = typeof e === "function" ? e(f) : e;
      if (v && !e) return;
      var id = "TC-" + r.k.toUpperCase();
      out.push({ key: r.k, signal: id, status: v ? "pass" : "fail", evidence: e, confidence: "high", rendered: true, uiux: r.u || null });
      var sv = r.sev; if (!v && r.sevf) { try { sv = r.sevf(f) || r.sev; } catch (e2) { sv = r.sev; } }
      sigs[id] = { name: r.n, surface: type, severity: sv, uiux: r.u || null, rootCause: r.rc, barriers: r.b, failureMode: "", fix: { effort: r.fx[0], impact: r.fx[1], testType: r.fx[2], playbook: r.fx[3], solutions: r.fx[4] } };
    });
    return { checks: out, signals: sigs };
  }
  /* rendered checks replace the code-only versions of the same question */
  var SUPERSEDED = { pdp_reviews: "rc_proof_none", pdp_sticky: "rc_sticky", pdp_trust: "rc_trust", pdp_ship_returns: "rc_trust", proof_density: "rc_home_proof", hero_single_action: "rc_hero_cta", search: "rc_search", newsletter: "rc_newsletter", cta_competition: "rc_cta_compete", pdp_price: "rc_price_atf", pdp_atc: "rc_cta_atf", pdp_pincode: "rc_delivery" };
  /* TrooUIUX Scanner rule library: same rule ids and the same severity tiers in both tools (critical/major = high, moderate = medium, minor = low) */
  var UIUX_SEV = {"cta-fold":"critical","cta-strength":"major","cta-copy":"moderate","cta-compete":"moderate","cta-repeat":"minor","value-prop":"major","proof":"major","trust":"moderate","contact":"minor","form":"moderate","urgency":"minor","capture":"minor","analytics":"moderate","pdp-price":"major","pdp-sticky":"moderate","pdp-gallery":"moderate","pdp-delivery":"moderate","pdp-anchor":"minor","pdp-pay":"minor","pdp-variant":"minor","pdp-benefits":"minor","col-fold":"major","col-cards":"moderate","col-filters":"moderate","col-paging":"minor","cart-express":"major","cart-threshold":"minor","cart-coupon":"minor","art-next":"moderate","home-paths":"moderate","lp-exits":"minor","title":"major","title-dupe":"minor","desc":"moderate","desc-dupe":"minor","h1":"major","hier":"minor","canonical":"moderate","robots":"critical","og":"minor","schema":"moderate","schema-product":"moderate","schema-price":"major","url":"minor","int-links":"moderate","nofollow":"minor","anchors":"minor","kw":"moderate","stuff":"minor","crumbs":"minor","hreflang":"minor","error-page":"critical","words":"moderate","read":"moderate","sent":"minor","para":"minor","measure":"minor","lorem":"critical","broken-img":"major","subheads":"minor","art-meta":"moderate","art-toc":"minor","lang":"moderate","contrast":"major","labels":"major","btn-name":"moderate","link-name":"moderate","link-purpose":"minor","zoom":"major","tabindex":"minor","dup-id":"minor","landmarks":"minor","skip":"minor","aria-hidden":"minor","iframe":"minor","autoplay":"major","alt":"major","focus":"moderate","viewport":"critical","hscroll":"major","tap":"major","font":"minor","ios-zoom":"minor","interstitial":"critical","sticky":"minor","nav":"minor","search":"minor","plugins":"major","ttfb":"moderate","fcp":"moderate","lcp":"major","cls":"major","inp":"moderate","weight":"moderate","requests":"minor","third":"moderate","blocking":"moderate","oversize":"moderate","lazy":"minor","lcp-img":"moderate","dims":"minor","dom":"minor","fonts":"minor","app-dupe":"minor","https":"critical","mixed":"major","doctype":"minor","charset":"minor","favicon":"minor","deprecated":"minor","jslinks":"minor","hash":"minor","noopener":"minor","consent":"minor","tags-dup":"moderate"};
  var UIUX_TIER = { critical: 3, major: 3, moderate: 2, minor: 1 };
  var BACKEND_U = { hero_single_action: "value-prop", cta_competition: "cta-compete", cta_copy: "cta-copy", pdp_atc: "cta-fold", pdp_sticky: "pdp-sticky", pdp_price: "pdp-price", pdp_anchor: "pdp-anchor", pdp_reviews: "proof", pdp_trust: "trust", pdp_ship_returns: "trust", pdp_cod: "pdp-pay", pdp_pincode: "pdp-delivery", pdp_emi: "pdp-pay", pdp_variants: "pdp-variant", proof_density: "proof", contact: "contact", live_chat: "contact", search: "search", newsletter: "capture", viewport: "viewport", lang: "lang", pdp_urgency: "urgency" };
  var PSI_U = { "SIG-ALL-F-SLOWLCP-01": "lcp", "SIG-PERF-F-LCPABOVE25-01": "lcp", "SIG-PERF-F-CLSABOVE01-01": "cls", "SIG-ALL-F-JSBLOCKING-01": "blocking", "SIG-ALL-F-THIRDPARTYAPPDELAY-01": "third", "SIG-PERF-F-TTFBHIGH-01": "ttfb", "SIG-PERF-F-IMAGEFORMATSUBOPTIMAL-01": "oversize", "SIG-PERF-F-FONTLOADINGFOIT-01": "fonts", "SIG-ALL-F-COREWEBVITALS-01": "lcp", "SIG-PERF-F-INPABOVE200-01": "inp", "SIG-A11Y-F-ALTTEXTMISSING-01": "alt", "SIG-A11Y-F-ARIALABELSMISS-01": "btn-name", "SIG-A11Y-F-HEADINGHIERARCHYBROKEN-01": "hier", "SIG-A11Y-F-LANGATTRMISS-01": "lang", "SIG-A11Y-F-LINKTEXTGENERIC-01": "anchors", "SIG-A11Y-F-CONTRASTCTALOW-01": "contrast", "SIG-A11Y-F-CONTRASTTEXTLOW-01": "contrast", "SIG-MOB-F-TOUCHTARGETSIZE-01": "tap", "SIG-MOB-F-VIEWPORTNOTSET-01": "viewport" };
  function uiuxOf(f) { return f.uiux || BACKEND_U[f.key] || PSI_U[f.signal] || null; }
  /* The Scanner's analytics rule reads the live page after scripts run; TrooCRO reads page code only, where tracking
     loaded by scripts (Shopify pixels, tag bundles) can't be seen, so absence is never claimed. */
  function addStackChecks(r) { return r; }
  /* Review widgets (Judge.me, Yotpo, Okendo...) draw stars with JavaScript, which our phone render doesn't run.
     If the store has one, a missing star rating in the render is "can't confirm", never a finding. */
  var JS_REVIEW_RULES = { rc_rating_top: 1, rc_proof_none: 1, rc_review_volume: 1, rc_photo_reviews: 1, rc_card_rating: 1 };
  function mergeRendered(r, f) {
    var rc = renderedChecks(f, r.page || {}); if (!rc.checks.length) return 0;
    var tools = ((r.stack || {}).tools || []), hasReviewApp = tools.some(function (t) { return t && t.category === "reviews"; });
    var codePass = {}; (r.checks || []).forEach(function (c) { if (c.status === "pass") codePass[c.key] = 1; });
    rc.checks = rc.checks.filter(function (c) {
      if (c.status !== "fail") return true;
      if (hasReviewApp && JS_REVIEW_RULES[c.key]) return false;
      /* the code-level check already found it (often drawn by a script): trust that over the render */
      for (var k in SUPERSEDED) if (SUPERSEDED[k] === c.key && codePass[k]) return false;
      return true;
    });
    /* sign-up sites: drop store-only code checks (search, category paths, product-page checks) */
    if (r.page && r.page.lead) {
      var KEEP = { address: 1, contact: 1, policies: 1, live_chat: 1, viewport: 1, lang: 1, founder_story: 1 };
      r.checks = (r.checks || []).filter(function (c) { return c.rendered || KEEP[c.key] || /^SIG-(MOB|A11Y|SEO|AI|SPD)/.test(c.signal || ""); });
    }
    if (!rc.checks.length) return 0;
    var have = {}; rc.checks.forEach(function (c) { have[c.key] = 1; });
    r.checks = (r.checks || []).filter(function (c) { return !(SUPERSEDED[c.key] && have[SUPERSEDED[c.key]]); }).concat(rc.checks);
    r.library = r.library || { signals: {}, barriers: {}, rootCauses: {} };
    Object.keys(rc.signals).forEach(function (k) { r.library.signals[k] = rc.signals[k]; });
    return rc.checks.length;
  }

  var THEMES = {
    "Trust deficit": "Shoppers can’t confirm the basics before buying", "Clarity failure": "The next step isn’t obvious",
    "Discovery / Navigation": "Shoppers can’t find their way to the right product", "Friction / UX": "Small frictions slow shoppers down",
    "Offer weakness": "The offer isn’t pulling its weight", "Intent / Message mismatch": "The page doesn’t continue the ad’s promise",
    "Desire deficit": "The page doesn’t build enough desire", "Urgency deficit": "There’s no reason to buy now", speed: "The page is slow on phones"
  };
  function firstSentence(s) { s = tidy(s); var m = s.match(/^.*?[.!?](\s|$)/); return (m ? m[0] : s).trim(); }
  function shortOf(f) {
    if (f.area === "speed") return tidy(String(f.evidence || "").replace(/\s*\(.*\)\.?$/, "")) || tidy((f.sig || {}).name);
    return SHORT[f.key] || tidy((f.sig || {}).name) || f.key;
  }
  function themesOf(F) {
    var map = {}, order = [], pr = { high: 3, med: 2, low: 1 };
    F.forEach(function (f) {
      var k = f.area === "speed" ? "speed" : ((f.sig && f.sig.rootCause) || "Other");
      if (!map[k]) { map[k] = { key: k, items: [] }; order.push(k); }
      map[k].items.push(f);
    });
    return order.map(function (k) {
      var t = map[k];
      t.prio = t.items.reduce(function (m, f) { return pr[f.prio.k] > pr[m.k] ? f.prio : m; }, t.items[0].prio);
      return t;
    }).sort(function (a, b) { return pr[b.prio.k] - pr[a.prio.k] || b.items.length - a.items.length; });
  }
  var WHY = {
    "Trust deficit": "Shoppers need proof before they pay, and the page leaves the basics unanswered.",
    "Clarity failure": "Shoppers can’t tell what they get or what to do next.",
    "Discovery / Navigation": "Shoppers struggle to find the right product from here.",
    "Friction / UX": "Each small snag on the way to checkout costs a share of shoppers.",
    "Offer weakness": "Nothing on the page gives shoppers a reason to buy now.",
    "Intent / Message mismatch": "The page doesn’t pick up the promise that brought shoppers here.",
    "Desire deficit": "The page doesn’t make the product feel worth it yet.",
    "Urgency deficit": "Nothing tells shoppers why today beats later.",
    speed: "Slow pages lose shoppers before they see the product."
  };
  function themeCard(t, L, i) {
    var bars = [];
    t.items.forEach(function (f) { ((f.sig || {}).barriers || []).forEach(function (b) { if (bars.indexOf(b) < 0) bars.push(b); }); });
    var qs = bars.map(function (b) {
      if (!L.barriers[b]) return "";
      var d = tidy(L.barriers[b].description), m = d.match(/^[^?]{6,140}\?/);
      return "“" + (m ? m[0] : firstSentence(d)) + "”";
    }).filter(function (x, k, a) { return x && a.indexOf(x) === k; }).slice(0, 2);
    var top = t.items[0], fx = (top.sig || {}).fix || {};
    var why = qs.length ? "Shoppers ask " + qs.join(" and ") + " The page doesn’t answer." : (WHY[t.key] || firstSentence((L.rootCauses || {})[top.sig && top.sig.rootCause] || ""));
    var start = tidy((fx.solutions || [])[0] || firstSentence(fx.playbook || ""));
    var h = '<article class="th' + (i === 0 ? " lead" : "") + '"><div class="th-top"><span class="sev ' + t.prio.k + '">' + t.prio.l + '</span><span class="th-n">' + plural(t.items.length, "issue") + "</span></div>";
    h += '<h3 class="th-title">' + esc(THEMES[t.key] || "Other fixes") + '</h3><p class="th-why">' + esc(why) + "</p>";
    h += '<ul class="th-list">' + t.items.map(function (f) {
      var codes = ((f.sig || {}).barriers || []).slice(0, 2).map(function (b) { var x = L.barriers[b]; return '<span class="code" title="' + esc(x ? tidy(x.name) + ": " + tidy(x.description) : b) + '">' + esc(b) + "</span>"; }).join("");
      return '<li><span class="pri ' + f.prio.k + '"></span><span class="th-l">' + esc(shortOf(f)) + '</span><span class="codes">' + codes + "</span></li>";
    }).join("") + "</ul>";
    if (start) h += '<div class="th-fix"><span class="an-label">Start with</span><p>' + esc(start) + '</p><div class="th-fix-meta">' + (fx.effort ? '<span class="chip">Effort ' + esc(EFFORT[fx.effort] || fx.effort) + "</span>" : "") + (fx.impact ? '<span class="chip">Impact ' + esc(IMPACT[fx.impact] || fx.impact) + "</span>" : "") + (i === 0 ? '<a href="#rp-tests" class="th-fix-go">In your test plan</a>' : "") + "</div></div>";
    h += '<details class="th-more"><summary>Evidence and how we’d fix each<span class="chev" aria-hidden="true"></span></summary><div class="th-detail">' + t.items.map(function (f) {
      var s = f.sig || {}, x = s.fix || {};
      var sols = (x.solutions || []).map(function (y) { return "<li>" + esc(tidy(y)) + "</li>"; }).join("");
      return '<div class="td"><b>' + esc(shortOf(f)) + '</b><p class="ev">' + esc(f.evidence) + "</p>" + (x.playbook ? "<p>" + esc(firstSentence(x.playbook)) + "</p>" : "") + (sols ? "<ul>" + sols + "</ul>" : "") + '<div class="meta">' + (x.effort ? '<span class="chip">Effort ' + esc(EFFORT[x.effort] || x.effort) + "</span>" : "") + (x.impact ? '<span class="chip">Impact ' + esc(IMPACT[x.impact] || x.impact) + "</span>" : "") + '<span class="sig">' + esc(f.signal) + "</span></div></div>";
    }).join("") + "</div></details></article>";
    return h;
  }
  function rpFindings(R, F, L, host, passes) {
    var TH = themesOf(F);
    var h = secHead("What we found, by priority", "What’s costing " + esc(host) + " sales", F.length ? plural(F.length, "issue") + " in " + plural(TH.length, "theme") + ", highest priority first. Open a card for the evidence and the fix for each." : "");
    if (!F.length) h += '<div class="rp-empty">' + ICON_CHECK + "<span>No conversion failures on the checks we could run on this page. Run the analysis on a product page for a deeper read.</span></div>";
    else h += '<div class="th-grid">' + TH.map(function (t, i) { return themeCard(t, L, i); }).join("") + "</div>";
    if (passes.length) {
      var L2 = R.lib || { signals: {} };
      h += '<details class="rp-working"><summary><span class="ok-dot">' + ICON_CHECK + "</span>What’s working <b>" + plural(passes.length, "check") + ' passed</b><span class="chev" aria-hidden="true"></span></summary><ul>' + passes.map(function (c) { return "<li>" + ICON_CHECK + "<span>" + esc(dec(c.evidence)) + "</span></li>"; }).join("") + "</ul></details>";
    }
    return '<section class="rp-sec" id="rp-findings">' + h + "</section>";
  }
  function measureShortOf(f, R) {
    var t = ((f.sig || {}).fix || {}).testType || "A/B";
    var metric = f.area === "speed" ? "load time" : (R.page && R.page.lead) ? "sign-ups or enquiries" : (R.page && R.page.pageType === "PDP") ? "add-to-cart rate" : "click-through and add-to-cart";
    var d = abDays(R);
    if (t === "A/B" && !(d != null && d > 45)) return "A/B test on " + metric + (d != null ? ", about " + Math.max(14, d) + " days" : "");
    return "Ship it and compare " + metric + " before and after";
  }

  function rpTests(R, T, L, host, created) {
    var start = nextMonday(created);
    var h = secHead("Your first tests", "What we’d test first on " + esc(host), "In the order we’d run them.");
    h += '<div class="rp-tests">' + T.map(function (t, i) {
      var fx = t.f.sig.fix || {};
      return '<article class="rp-test' + (i === 0 ? " first" : "") + '"><div class="rp-test-n">0' + t.n + '</div><div class="rp-test-b"><div class="top"><span class="an-label">' + (i === 0 ? "We’d run this first" : "Then") + '</span><span class="sev ' + t.f.prio.k + '">' + t.f.prio.l + "</span></div><h3>" + esc(t.title) + '</h3><p class="rp-test-meta"><span>' + esc(t.where) + "</span><span>" + esc(measureShortOf(t.f, R)) + '</span></p><div class="chips">' + barrierChips(t.f.sig.barriers, L, 2) + (fx.effort ? '<span class="chip">Effort ' + esc(EFFORT[fx.effort] || fx.effort) + "</span>" : "") + "</div></div></article>";
    }).join("") + "</div>";
    /* dated plan as a mini timeline */
    var day = 86400000, total = (T.length - 1) * 7 + 96;
    var pct = function (d) { return Math.max(0, Math.min(100, d / total * 100)); };
    var ticks = "";
    for (var d = new Date(start.getFullYear(), start.getMonth() + 1, 1); (d - start) / day <= total; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      ticks += '<span style="left:' + pct((d - start) / day).toFixed(2) + '%">' + esc(d.toLocaleDateString("en-IN", { month: "short" })) + "</span>";
    }
    var short = function (n) { return addDays(start, n).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
    h += '<div class="rp-plan"><div class="rp-plan-h"><div><span class="an-label">Your plan, dated</span><h3 class="an-h4">If you started with TrooCRO on ' + esc(fmtDate(start)) + '</h3></div><div class="g-legend"><span><b class="g-start"></b>Goes live</span><span><i class="g-run"></i>Test running</span><span><b class="g-mk"></b>45 and 90-day checks</span></div></div><div class="g-grid"><div class="g-axis">' + ticks + "</div>";
    h += T.map(function (t, i) {
      var s0 = i * 7, c45 = s0 + 45, c90 = s0 + 90;
      return '<div class="g-row"><span class="g-lbl">Test ' + t.n + '</span><div class="g-track"><i class="g-run" style="left:' + pct(s0).toFixed(2) + "%;width:" + (pct(c45) - pct(s0)).toFixed(2) + '%"></i><i class="g-tail" style="left:' + pct(c45).toFixed(2) + "%;width:" + (pct(c90) - pct(c45)).toFixed(2) + '%"></i><b class="g-start" style="left:' + pct(s0).toFixed(2) + '%"></b><b class="g-mk" style="left:' + pct(c45).toFixed(2) + '%"></b><b class="g-mk" style="left:' + pct(c90).toFixed(2) + '%"></b></div><span class="g-dates">Live ' + esc(short(s0)) + " · checks " + esc(short(c45)) + ", " + esc(short(c90)) + "</span></div>";
    }).join("") + "</div></div>";
    return '<section class="rp-sec" id="rp-tests">' + h + "</section>";
  }

  function tabSpeed(R) {
    var psi = R.psi, lt = R.lite || {}, body;
    if (psi && psi.scores && psi.scores.performance != null) {
      var m = psi.metrics || {};
      body = '<div class="an-metrics">' +
        '<div class="an-metric ' + metricCls(m.lcp, 2500, 4000) + '"><b>' + (m.lcp != null ? (m.lcp / 1000).toFixed(1) + "s" : "n/a") + "</b><span>Largest content (LCP)</span></div>" +
        '<div class="an-metric ' + metricCls(m.cls, 0.1, 0.25) + '"><b>' + (m.cls != null ? m.cls.toFixed(2) : "n/a") + "</b><span>Layout shift (CLS)</span></div>" +
        '<div class="an-metric ' + metricCls(m.tbt, 200, 600) + '"><b>' + (m.tbt != null ? Math.round(m.tbt) + "ms" : "n/a") + "</b><span>Blocking time (TBT)</span></div>" +
        '<div class="an-metric ' + metricCls(m.fcp, 1800, 3000) + '"><b>' + (m.fcp != null ? (m.fcp / 1000).toFixed(1) + "s" : "n/a") + "</b><span>First content (FCP)</span></div>" +
        '<div class="an-metric ' + metricCls(m.ttfb, 800, 1800) + '"><b>' + (m.ttfb != null ? Math.round(m.ttfb) + "ms" : "n/a") + "</b><span>Server response</span></div>" +
        '<div class="an-metric"><b>' + (m.weightKb != null ? (m.weightKb > 1024 ? (m.weightKb / 1024).toFixed(1) + " MB" : m.weightKb + " KB") : "n/a") + "</b><span>Page weight</span></div></div>";
      if ((psi.thirdParty || []).length) body += '<div class="an-checklist" style="margin-top:16px">' + psi.thirdParty.slice(0, 4).map(function (t) { return ck(t.blockingMs < 50, t.name, (t.blockingMs ? t.blockingMs + "ms blocking · " : "") + t.kb + " KB"); }).join("") + "</div>";
      return { key: "speed", name: "Speed", title: "Speed on a phone", v: psi.scores.performance, est: false, sum: "Measured by Google PageSpeed on a mid-range phone. Slow pages lose shoppers before they see the offer.", body: body };
    }
    body = '<div class="an-metrics">' +
      '<div class="an-metric ' + metricCls(lt.ttfbMs, 600, 1200) + '"><b>' + (lt.ttfbMs != null ? lt.ttfbMs + "ms" : "n/a") + "</b><span>Server response</span></div>" +
      '<div class="an-metric ' + metricCls(lt.htmlKb, 300, 800) + '"><b>' + (lt.htmlKb != null ? lt.htmlKb + " KB" : "n/a") + "</b><span>HTML size</span></div>" +
      '<div class="an-metric ' + metricCls(lt.scripts, 20, 40) + '"><b>' + (lt.scripts != null ? lt.scripts : "n/a") + "</b><span>Script files</span></div>" +
      '<div class="an-metric ' + metricCls(lt.thirdPartyHosts, 10, 20) + '"><b>' + (lt.thirdPartyHosts != null ? lt.thirdPartyHosts : "n/a") + "</b><span>Third-party hosts</span></div>" +
      '<div class="an-metric ' + metricCls(lt.stylesheets, 6, 10) + '"><b>' + (lt.stylesheets != null ? lt.stylesheets : "n/a") + "</b><span>Stylesheets</span></div>" +
      '<div class="an-metric ' + metricCls(lt.imagesNoDims, 5, 12) + '"><b>' + (lt.imagesNoDims != null ? lt.imagesNoDims : "n/a") + "</b><span>Images without size</span></div></div>";
    return { key: "speed", name: "Speed", title: "Speed, estimated", v: lt.speedEstimate != null ? lt.speedEstimate : null, est: true, sum: "Google PageSpeed couldn’t measure this page" + (R.psiErr ? " (" + tidy(String(R.psiErr).replace(/^Lighthouse returned error:\s*/i, "").slice(0, 140)) + ")" : "") + ", so we estimated speed from server response, page weight and scripts. A full TrooCRO diagnosis measures real load times on phones.", body: body };
  }
  function tabSearch(R) {
    var ai = R.ai || {}, list = ai.checks || [], ok = list.filter(function (x) { return x.pass; }).length;
    return { key: "search", name: "Search and AI", title: "Search engines and AI assistants", v: ai.readiness != null ? ai.readiness : null, est: false, sum: ok + " of " + list.length + " checks passed. " + (ai.readiness >= 85 ? "Search engines and AI assistants can read and cite this page." : "Gaps here make it harder for search and AI assistants to understand and recommend you."), body: '<div class="an-checklist two">' + list.map(function (x) { return ck(x.pass, x.label, x.detail); }).join("") + "</div>" };
  }
  function tabAgents(R, host) {
    var ai = R.ai || {}, ag = ai.agent || {}, P = R.page || {}, list = ag.checks || [], ok = list.filter(function (x) { return x.pass; }).length;
    var lines = ["# " + (P.title || host)];
    if (P.description) lines.push(P.description);
    lines.push("");
    if ((P.h1 || []).length) lines.push("H1: " + P.h1[0]);
    if (P.primaryCta) lines.push("Main action: " + P.primaryCta);
    if (P.prices || P.aov) lines.push("Prices: " + (P.aov ? "typical " + money(P.aov, P.currency) : P.prices + " found"));
    if (P.rating && P.rating.value) lines.push("Rating: " + P.rating.value + " from " + P.rating.count + " reviews");
    if ((ai.ldTypes || []).length) lines.push("Structured data: " + ai.ldTypes.slice(0, 6).join(", "));
    lines.push("llms.txt: " + (ai.llms ? "found" : "missing") + " · sitemap: " + (ai.sitemap ? "found" : "missing"));
    return { key: "agents", name: "AI agents", title: "How AI agents see " + host, v: ag.score != null ? ag.score : null, est: false, sum: ok + " of " + list.length + " checks passed. Shopping agents read this page as text and act on named buttons and fields.", body: '<div class="rp-agent"><div class="an-checklist">' + list.map(function (x) { return ck(x.pass, x.label, ""); }).join("") + '</div><div><span class="an-label">What an agent reads</span><div class="an-agentread">' + esc(lines.join("\n")) + "</div></div></div>" };
  }
  function tabA11y(R) {
    var psi = R.psi, lt = R.lite || {}, v, rows, measured = psi && psi.scores && psi.scores.accessibility != null;
    var base = (R.checks || []).filter(function (c) { return /^SIG-(MOB|A11Y)/.test(c.signal); });
    if (measured) {
      v = psi.scores.accessibility;
      rows = (psi.a11yFails || []).slice(0, 8).map(function (x) { return ck(false, x.title, x.count ? plural(x.count, "element") : ""); }).join("") || ck(true, "No failing accessibility audits", "");
    } else {
      v = lt.a11yEstimate;
      rows = (lt.a11yIssues || []).map(function (x) { return ck(false, x, ""); }).join("") + base.map(function (c) { return ck(c.status === "pass", c.evidence, ""); }).join("");
      if (!rows) rows = ck(true, "No accessibility gaps found in the page’s code", "");
    }
    return { key: "a11y", name: "Accessibility", title: measured ? "Accessibility, from Google Lighthouse" : "Accessibility, estimated", v: v != null ? v : null, est: !measured, sum: measured ? "Measured by Google Lighthouse. Missing labels and low contrast make the page harder to use for some shoppers." : "Estimated from the page’s code: labels, alt text, language and heading order.", body: '<div class="an-checklist two">' + rows + "</div>" };
  }
  function tabStack(R) {
    var st = R.stack || {}, ess = st.essentials || [], tools = (st.tools || []).map(function (t) { return t.name; });
    var hint = { analytics: "Without it you can’t see where shoppers drop.", behavior: "Heatmaps and recordings show what shoppers actually do.", ads: "Pixels let ad platforms learn who buys.", retention: "Brings shoppers back after the first visit.", reviews: "Reviews answer the trust question at the decision.", experiments: "Testing proves which changes earn more." };
    var found = ess.filter(function (e) { return (e.found || []).length; }).length;
    return { key: "stack", name: "Growth stack", title: "The tools we can see on your page", v: st.score != null ? st.score : null, est: false, sum: found + " of " + ess.length + " essentials found in the page’s code." + (tools.length ? " Seen: " + tools.join(", ") + "." : ""), body: '<div class="an-tools three">' + ess.map(function (e) { var on = (e.found || []).length > 0; return '<div class="an-tool' + (on ? " on" : "") + '"><div class="k"><i></i>' + esc(e.label) + '</div><div class="f">' + (on ? esc(e.found.join(", ")) : esc(hint[e.key] || "Not found")) + "</div></div>"; }).join("") + "</div>" };
  }
  function rpBeyond(R, host) {
    /* v3: speed comes from the same Google PageSpeed run as the rest of the report; search, AI agents, accessibility
       and growth stack are not part of the TrooCRO engine score, so v3 does not judge them */
    var G3 = R.growth && R.growth.v3 ? R.growth : null;
    if (G3) {
      var t = tabSpeed({ psi: G3.speedRaw ? { scores: { performance: G3.speedRaw.score }, metrics: G3.speedRaw.metrics } : null, lite: {}, psiErr: G3.speedRaw ? "" : "it didn't answer for this scan" });
      return '<section class="rp-sec" id="rp-beyond">' + secHead("Speed", "Speed on a phone", "Shown beside your score, not inside it.") +
        '<div class="rp-tp"><div class="rp-tp-sum"><div class="big" style="color:' + colorFor(t.v) + '">' + (t.v == null ? "n/a" : t.v) + '<small>/100</small></div><h3 class="an-h4">' + esc(t.title) + '</h3><p class="an-sub">' + esc(t.sum) + '</p></div><div class="rp-tp-body">' + t.body + "</div></div>" +
        '<p class="an-note">Search, AI agents, accessibility and your growth stack are not judged in this report: they are not part of the TrooCRO score.</p></section>';
    }
    var tabs = [tabSpeed(R), tabSearch(R), tabAgents(R, host), tabA11y(R), tabStack(R)];
    var h = secHead("Beyond conversion", "Speed, search, AI agents and accessibility", "What decides whether shoppers, search engines and AI assistants reach your offer at all.");
    h += '<div class="rp-tabs" role="tablist" aria-label="Beyond conversion">' + tabs.map(function (t, i) {
      return '<button type="button" role="tab" id="rpt-' + t.key + '" aria-controls="rpp-' + t.key + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-rp-tab="' + t.key + '"><span>' + esc(t.name) + '</span><b style="color:' + colorFor(t.v) + '">' + (t.v == null ? "n/a" : t.v) + "</b>" + (t.est && t.v != null ? "<em>est.</em>" : "") + "</button>";
    }).join("") + "</div>";
    h += tabs.map(function (t, i) {
      return '<div class="rp-tp" role="tabpanel" id="rpp-' + t.key + '" aria-labelledby="rpt-' + t.key + '" data-rp-panel="' + t.key + '"' + (i ? " hidden" : "") + '><div class="rp-tp-sum"><div class="big" style="color:' + colorFor(t.v) + '">' + (t.v == null ? "n/a" : t.v) + "<small>/100" + (t.est && t.v != null ? " est." : "") + '</small></div><h3 class="an-h4">' + esc(t.title) + '</h3><p class="an-sub">' + esc(t.sum) + '</p></div><div class="rp-tp-body">' + t.body + "</div></div>";
    }).join("");
    return '<section class="rp-sec" id="rp-beyond">' + h + "</section>";
  }
  function aheadOf(c, R, mine, L) {
    var they = [], you = [], seen = {};
    function gap(name, a, b, est) {
      if (a == null || b == null || Math.abs(a - b) < 10) return;
      var line = "<em>" + esc(name) + "</em> " + esc(a) + " vs " + esc(b) + (est ? " (est.)" : "");
      if (a > b) they.push(line.replace(" vs ", " vs your ")); else you.push("<em>" + esc(name) + "</em> " + esc(b) + " vs their " + esc(a) + (est ? " (est.)" : ""));
    }
    gap("Speed", c.lite && c.lite.speedEstimate, R.lite && R.lite.speedEstimate, true);
    gap("Search and AI", c.ai && c.ai.readiness, R.ai && R.ai.readiness);
    gap("Agent readiness", c.ai && c.ai.agent && c.ai.agent.score, R.ai && R.ai.agent && R.ai.agent.score);
    gap("Growth stack", c.stack && c.stack.score, R.stack && R.stack.score);
    function byKey(list) { var o = {}; (list || []).forEach(function (x) { o[x.key] = x; }); return o; }
    function cmp(theirs, ours) {
      var mo = byKey(ours);
      (theirs || []).forEach(function (t) {
        var m = mo[t.key]; if (!m || seen[t.key]) return;
        if (t.pass && !m.pass) { they.push(esc(t.label)); seen[t.key] = 1; }
        else if (!t.pass && m.pass) { you.push(esc(t.label)); seen[t.key] = 1; }
      });
    }
    cmp(c.ai && c.ai.checks, R.ai && R.ai.checks);
    cmp(c.ai && c.ai.agent && c.ai.agent.checks, R.ai && R.ai.agent && R.ai.agent.checks);
    var ms = byKey(R.stack && R.stack.essentials);
    ((c.stack && c.stack.essentials) || []).forEach(function (e) {
      var m = ms[e.key]; if (!m) return;
      if (e.found.length && !m.found.length) they.push(esc(e.label) + " <span class=\"dim\">(" + esc(e.found.slice(0, 2).join(", ")) + ")</span>");
      else if (!e.found.length && m.found.length) you.push(esc(e.label) + " <span class=\"dim\">(" + esc(m.found.slice(0, 2).join(", ")) + ")</span>");
    });
    (c.checks || []).forEach(function (k) {
      var m = mine[k.key]; if (!m) return;
      var nm = tidy((L.signals[k.signal] || {}).name) || k.key;
      if (k.status === "pass" && m.status === "fail") they.push(esc(k.evidence ? dec(k.evidence) : nm));
      if (k.status === "fail" && m.status === "pass") you.push(esc(m.evidence ? dec(m.evidence) : nm));
    });
    return [they, you];
  }
  function compSection(R) {
    var comps = R.comps || [], L = R.lib || { signals: {} };
    var you = { host: hostOf(R.url) || R.host, conv: R.conversion, ai: R.ai ? R.ai.readiness : null, agent: R.ai && R.ai.agent ? R.ai.agent.score : null, stack: R.stack ? R.stack.score : null, speed: R.lite ? R.lite.speedEstimate : null };
    function cell(v) { return v == null ? '<span class="na">n/a</span>' : '<span class="sc" style="--c:' + colorFor(v) + '">' + esc(v) + "</span>"; }
    function convCell(c) { return c && c.applicable ? esc(c.passed + " of " + c.applicable) : '<span class="na">n/a</span>'; }
    var rows = '<tr class="you"><td>' + esc(you.host) + ' <span class="you-tag">You</span></td><td>' + convCell(you.conv) + "</td><td>" + cell(you.ai) + "</td><td>" + cell(you.agent) + "</td><td>" + cell(you.stack) + "</td><td>" + cell(you.speed) + "</td></tr>";
    var ahead = "", mine = {};
    (R.checks || []).forEach(function (c) { mine[c.key] = c; });
    comps.forEach(function (c) {
      var ch = hostOf(c.url) || c.host;
      if (c.error) { rows += "<tr><td>" + esc(ch) + '</td><td colspan="5" class="na">' + esc(c.error) + "</td></tr>"; return; }
      rows += "<tr><td>" + esc(ch) + "</td><td>" + convCell(c.conversion) + "</td><td>" + cell(c.ai.readiness) + "</td><td>" + cell(c.ai.agent.score) + "</td><td>" + cell(c.stack.score) + "</td><td>" + cell(c.lite.speedEstimate) + "</td></tr>";
      var W = aheadOf(c, R, mine, L), theyWin = W[0], youWin = W[1];
      function lst(a) { return a.length ? "<ul>" + a.slice(0, 5).map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "<p>Nothing clear on the checks we could compare.</p>"; }
      ahead += '<div class="rp-ahead-c"><b>Where ' + esc(ch) + " is ahead</b>" + lst(theyWin) + "</div>";
      ahead += '<div class="rp-ahead-c you"><b>Where you’re ahead of ' + esc(ch) + "</b>" + lst(youWin) + "</div>";
    });
    var h = secHead("You and your competitors", "How you compare, page to page", "Their homepages, read today with the same engine. Speed is estimated from each page’s code for every site, so the comparison is fair.");
    h += '<div class="rp-comp"><table><thead><tr><th>Site</th><th>Conversion checks</th><th>Search and AI</th><th>Agent readiness</th><th>Growth stack</th><th>Speed (est.)</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="rp-comp-hint" aria-hidden="true">Swipe the table to see every column</p><div class="rp-ahead">' + ahead + "</div>";
    return '<section class="rp-sec" id="rp-compare">' + h + "</section>";
  }
  function rpWorth(R) {
    var b = R.benchmark, P = R.page || {};
    var visitors = (R.inputs && R.inputs.visitors) || 30000;
    var cr = b && b.cvr ? b.cvr : 1.5;
    var cur = rupees(P.currency) ? "INR" : P.currency;
    var aov = P.aov || ({ "< ₹500": 400, "₹500–₹2,000": 1200, "₹2,000–₹5,000": 3200, "₹5,000+": 7500 }[P.aovBand] || 1500);
    if (cur !== "INR" && !P.aov) cur = "INR";
    var h = secHead("What a lift is worth", "Put your own numbers in", b ? "Prefilled with your answers and the TrooCRO benchmark for " + esc(b.category) + " stores at " + esc(bandLabel(b.band)) + ". Change anything." : "Change the numbers to match your store.");
    h += '<div class="rp-worth" data-calc data-cur="' + esc(cur) + '"><div class="rp-calc"><label><span>Monthly visitors</span><span class="an-input"><input type="number" min="0" step="1000" value="' + esc(visitors) + '" data-c-v></span></label><label><span>Conversion rate %</span><span class="an-input"><input type="number" min="0" step="0.1" value="' + esc(cr) + '" data-c-cr></span></label><label><span>Average order ' + esc((CUR_SYM[cur] || cur + " ").trim()) + '</span><span class="an-input"><input type="number" min="0" step="50" value="' + esc(Math.round(aov)) + '" data-c-aov></span></label></div><div class="rp-out"><span class="an-label">If fixes lift conversion by 10%</span><div class="big" data-c-out>–</div><p data-c-sub></p></div></div>';
    if (b) h += '<div class="rp-bench"><span class="an-label">Typical for ' + esc(b.category) + " at " + esc(bandLabel(b.band)) + '</span><div class="rp-bench-row">' + [["Add-to-cart rate", b.atc], ["Cart to checkout", b.cartToCheckout], ["Checkout to purchase", b.checkoutToPurchase], ["Store conversion", b.cvr]].map(function (x) { return "<div><b>" + esc(x[1] != null ? x[1] + "%" : "n/a") + "</b><span>" + esc(x[0]) + "</span></div>"; }).join("") + '</div><p class="an-note">From the TrooCRO category benchmark library. Use them as a yardstick for your own analytics.</p></div>';
    return '<section class="rp-sec" id="rp-worth">' + h + "</section>";
  }
  function rpNext(R, C, host, services) {
    var h = '<div class="an-cta-grid"><div class="an-card pad"><span class="an-label">Done the usual way</span><h3 class="an-h3" style="margin-top:12px">Each fix needs four people and a lot of handoffs.</h3><div class="an-roles">' +
      [["01", "A CRO analyst to find and size it"], ["02", "A designer to make it on brand"], ["03", "A developer to build it on your store"], ["04", "QA to check it on every device"]].map(function (x) { return '<div class="an-role"><span class="n">' + x[0] + "</span><span>" + esc(x[1]) + '</span><span class="h">handoff</span></div>'; }).join("") +
      '</div><p class="an-roles-foot">Four briefs and four calendars. Every handoff is a place a fix can stall.</p></div><div class="an-fixit"><span class="eyebrow" style="color:var(--text-2)">With TrooCRO</span><h2 class="h2">One team finds it, builds it and measures it.</h2><p>TrooCRO turns this report into shipped, tested changes on your store. You approve every change before it goes live.</p><div class="an-avgs"><div><b>6.4 days</b>CRO audit</div><div><b>3.7 days</b>UI/UX fix live</div><div><b>3.4 days</b>Experiment setup</div><div><b>12.9 days</b>Landing page</div></div><p class="an-note" style="margin-top:10px;color:var(--text-2);opacity:.7">Averages across Troopod’s delivered projects.</p><div class="btn-row"><a class="btn btn-light" href="contact.html?site=' + encodeURIComponent(host) + (R.slug ? "&amp;report=" + encodeURIComponent(R.slug) : "") + '">Fix it with TrooCRO</a><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + WA + "?text=" + encodeURIComponent("Hi TrooCRO, I ran the site analysis for " + host + (C.total != null ? " (score " + C.total + "/100)" : "") + " and want to talk about the fixes.") + '"><svg width="15" height="15"><use href="#i-wa"/></svg>WhatsApp us</a></div></div></div>';
    h += '<div class="an-card an-lead"><span class="an-label">Get the full fix plan</span><h3 class="an-h3" style="margin-top:10px">Want every fix sized and scheduled for ' + esc(host) + '?</h3><p class="an-sub">Leave your details and the TrooCRO team will have this report when they reach you.</p><form data-lead novalidate><label class="an-input"><span class="sr-only">Name</span><input name="name" type="text" autocomplete="name" placeholder="Your name" required></label><label class="an-input"><span class="sr-only">Work email</span><input name="email" type="email" autocomplete="email" placeholder="Work email" required></label><input class="hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><label class="an-consent"><input type="checkbox" name="consent"><span>Troopod can contact me about this report. We save your name, email and this report, nothing else.</span></label><button class="btn btn-primary" type="submit">Send it to the team</button></form><div class="an-err" data-lead-err role="alert"></div></div>';
    return '<section class="rp-sec" id="rp-next">' + secHead("Your next step", "Turn this report into revenue", "") + (services || "") + h + "</section>";
  }

  function wireReport(root, R, out) {
    $$(".ring .val", root).forEach(function (c) { requestAnimationFrame(function () { requestAnimationFrame(function () { c.style.strokeDashoffset = c.getAttribute("data-off"); }); }); });
    $$(".rp-area .bar i", root).forEach(function (b, i) { var w = b.style.width; b.style.width = "0%"; setTimeout(function () { b.style.width = w; }, 120 + i * 70); });
    $$("[data-hide-broken]", root).forEach(function (img) {
      function ok() { var v = img.closest(".bview"); if (v) v.classList.add("has-img"); }
      img.addEventListener("error", function () { img.remove(); });
      img.addEventListener("load", ok);
      if (img.complete && img.naturalWidth > 0) ok();
    });
    var share = $("[data-share]", root);
    if (share) share.addEventListener("click", function () {
      if (!R.slug) return;
      var base = win.location.protocol === "file:" ? "" : win.location.origin + win.location.pathname;
      if (!base) { toast("Share links work once the site is hosted."); return; }
      copyText(base + "?r=" + R.slug).then(function () { toast("Link copied"); }, function () { toast("Couldn't copy. The link is " + base + "?r=" + R.slug); });
    });
    if (win.TrooGrowth && R.growth) win.TrooGrowth.wire(root, R.growth, { view: function () { return S.viewP && S.url === R.url ? S.viewP : fetchView(R.url); } });
    wireWorkbench(root, R);
    var pr = $("[data-print]", root); if (pr) pr.addEventListener("click", function () { $$("details", root).forEach(function (d) { d.open = true; }); win.print(); });
    var ft = $("[data-full-toggle]", root), fb = $("[data-full]", root);
    if (ft && fb) ft.addEventListener("click", function () {
      var open = fb.hidden; fb.hidden = !open; ft.setAttribute("aria-expanded", open ? "true" : "false");
      ft.textContent = open ? "Hide the full report" : "See the full report";
      if (open && fb.scrollIntoView) fb.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    var nb = $("[data-new]", root); if (nb) nb.addEventListener("click", function () { setQuery(""); urlIn.value = ""; show("start"); urlIn.focus(); });
    /* tabs */
    var tabs = $$("[data-rp-tab]", root);
    function selTab(t, focus) {
      tabs.forEach(function (b) { var on = b === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
      $$("[data-rp-panel]", root).forEach(function (p) { p.hidden = p.getAttribute("data-rp-panel") !== t.getAttribute("data-rp-tab"); });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { selTab(t); });
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault(); selTab(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length], true);
      });
    });
    /* rail: highlight the section in view */
    var links = $$("[data-rail]", root);
    if (links.length && "IntersectionObserver" in win) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (!e.isIntersecting) return; var id = e.target.id; links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-rail") === id); }); });
      }, { rootMargin: "-35% 0px -60% 0px" });
      links.forEach(function (a) { var s = doc.getElementById(a.getAttribute("data-rail")); if (s) io.observe(s); });
    }
    /* calculator */
    var calc = $("[data-calc]", root);
    if (calc) {
      var fv = $("[data-c-v]", calc), fc = $("[data-c-cr]", calc), fa = $("[data-c-aov]", calc), o = $("[data-c-out]", calc), sub = $("[data-c-sub]", calc);
      var upd = function () {
        var rev = (+fv.value || 0) * ((+fc.value || 0) / 100) * (+fa.value || 0);
        var gain = rev * 0.1;
        var cc = calc.getAttribute("data-cur") || "INR";
        o.textContent = "+" + money(gain, cc) + " a month";
        sub.textContent = "About " + money(gain * 12, cc) + " a year, on " + money(rev, cc) + " of monthly revenue from this traffic.";
      };
      [fv, fc, fa].forEach(function (x) { x.addEventListener("input", upd); }); upd();
    }
    /* lead form */
    var lf = $("[data-lead]", root);
    if (lf) lf.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("[data-lead-err]", root), btn = $("button", lf);
      var name = lf.elements["name"].value.trim(), email = lf.elements["email"].value.trim();
      if (!name) { err.textContent = "Add your name."; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = "Enter a valid email address."; return; }
      if (S.mode === "sample" || S.offline) { err.textContent = "This is a sample report, so nothing was sent. Book a demo from the contact page instead."; return; }
      if (lf.elements["consent"] && !lf.elements["consent"].checked) { err.textContent = "Tick the box so we can contact you about this report."; return; }
      err.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
      api("/lead", { source: "report", name: name, email: email, website: R.url, scanSlug: R.slug || "", hp: lf.elements["hp"].value, interests: ["Site analysis report"].concat(lf.elements["consent"] && lf.elements["consent"].checked ? ["Consent: contact me about this report"] : []), consent: !!(lf.elements["consent"] && lf.elements["consent"].checked) }, { timeout: 20000 }).then(function () {
        lf.outerHTML = '<p class="ok">Thanks, ' + esc(name.split(" ")[0]) + ". Your details are saved with this report, and someone from the TrooCRO team may follow up.</p>";
      }).catch(function (x) { btn.disabled = false; btn.textContent = "Send it to the team"; err.textContent = x.message || "Couldn't send that. Try again."; });
    });
  }

  function reportMarkdown(R, out) {
    var C = out.C, lines = [];
    var hh = hostOf(R.url) || R.host;
    lines.push("---", 'title: "TrooCRO website analysis for ' + hh + '"', "format: agent view of this page (the same facts as the page, as text)", "---", "");
    lines.push("# Website analysis for " + hh, "", (C.growth ? "Overall score: " : "Website score: ") + (C.total != null ? C.total + "/100" : "not enough to score") + (C.growth ? " (CRO " + (C.cro != null ? C.cro : "n/a") + "/100, " + C.croW + "%; speed " + (C.speed != null ? C.speed : "n/a") + "/100, " + C.speedW + "%)" : "") + (C.est ? " (partly estimated)" : "") + ". " + C.verdict, "");
    lines.push("## Area scores");
    C.areas.forEach(function (a) { lines.push("- " + a.name + ": " + (a.v != null ? a.v + "/100" : "not measured") + " (" + (a.w ? a.w + "% of score" : "not scored") + "; " + a.src + ")"); });
    lines.push("", "## Findings, by priority");
    out.F.forEach(function (f) { lines.push("- " + f.prio.l + ": " + (tidy((f.sig || {}).name) || f.key) + ". " + f.evidence + ((f.sig || {}).barriers && f.sig.barriers.length ? " Barriers: " + f.sig.barriers.join(", ") + "." : "")); });
    if (out.T.length) { lines.push("", "## First tests"); out.T.forEach(function (t) { lines.push(t.n + ". " + t.title + ". Where: " + t.where + ". " + t.measure); }); }
    if (win.TrooGrowth && R.growth) lines.push(win.TrooGrowth.markdown(R.growth));
    lines.push("", "## Next step", "Fix it with TrooCRO: contact.html");
    return lines.join("\n");
  }

  function openReport(R, opts) {
    opts = opts || {};
    S.mode = opts.mode || "live";
    var root = $("[data-report]");
    if (R && R.audit && win.TrooAudit) {
      root.innerHTML = R.audit.failed ? win.TrooAudit.failed(R.audit.failed) : win.TrooAudit.render(R.audit);
      win.TrooAudit.wire(root, function () { win.location.href = win.location.pathname; });
      show("report"); doc.title = "TrooCRO page audit: " + S.host;
      return;
    }
    rescore(R);
    var out = renderReport(R, opts);
    root.innerHTML = out.html;
    wireReport(root, R, out);
    show("report");
    if (R.slug && opts.mode !== "sample") setQuery("r=" + encodeURIComponent(R.slug));
    var md = $("#agent-md"), pre = $("[data-agent-pre]");
    if (md) md.textContent = reportMarkdown(R, out);
    if (pre) pre.textContent = "";
    doc.title = "TrooCRO analysis: " + (hostOf(R.url) || R.host);
  }

  function openSample() {
    function go() {
      var R = win.TROOCRO_SAMPLE_REPORT;
      if (!R) { formErr.textContent = "The sample report didn't load."; return; }
      openReport(R, { mode: "sample" });
    }
    if (win.TROOCRO_SAMPLE_REPORT) return go();
    var s = doc.createElement("script"); s.src = "assets/js/sample-report.js"; s.onload = go; s.onerror = function () { formErr.textContent = "The sample report didn't load."; };
    doc.body.appendChild(s);
  }

  function loadShared(slug) {
    show("scan");
    buildStages();
    $("[data-s-host]").textContent = "a shared report";
    $("[data-s-status]").textContent = "Loading";
    stage("open", "run", "Loading the shared report");
    api("/report?slug=" + encodeURIComponent(slug), null, { timeout: 20000 }).then(function (j) {
      var R = j.report; if (!R || !R.url || !Array.isArray(R.checks)) throw new Error("That report is not available. Run your own analysis: it takes about 2 minutes.");
      R.slug = R.slug || j.slug;
      S.saved = true; S.saveState = "saved";
      openReport(R, { mode: "shared" });
    }).catch(function (e) {
      if (e.network) { S.offline = true; }
      $("[data-err-msg]").textContent = e.network ? "We couldn't reach the TrooCRO scanner to load this report." : (e.message || "That report is not available.");
      show("error");
    });
  }

  /* ---------------- read from the shopper's own browser (bookmarklet) ---------------- */
  (function () {
    $$("[data-capture-link]").forEach(function (link) { if (!win.TROO_CAPTURE_SRC) return; {
      var page = win.location.origin + win.location.pathname;
      link.href = "javascript:" + encodeURIComponent(win.TROO_CAPTURE_SRC.replace("__ORIGIN__", win.location.origin).replace("__PAGE__", page));
      link.addEventListener("click", function (e) { e.preventDefault(); alert("Drag this button to your bookmarks bar, then click it on the store's product page."); });
    } });
  })();
  function receiveCapture() {
    var bn = $("[data-an-capturing]"), msg = $("[data-an-capmsg]"), got = false;
    var say = function (t) { if (msg) msg.textContent = t; if (bn) bn.hidden = false; };
    say("Waiting for the page from your browser…");
    win.addEventListener("message", function (e) {
      if (got || e.source !== win.opener || !e.data || e.data.type !== "troo-capture" || typeof e.data.data !== "object") return;
      got = true; say("Got the page from your browser. Reading it…");
      v3call("/audit_capture", { data: e.data.data }, 90000).then(function (r) {
        if (!r || !r.capture) { say((S.v3Err || "That page could not be read.") + " Open the product page and click the bookmark again."); return; }
        try { history.replaceState(null, "", win.location.pathname); } catch (x) {}
        if (bn) bn.hidden = true;
        urlIn.value = r.url.replace(/^https?:\/\//i, "");
        begin(r.url, r.capture);
      });
    });
    if (win.opener) { try { win.opener.postMessage("troo-ready", "*"); } catch (x) {} }
    else say("Open this from the TrooCRO bookmark on the store's product page.");
    setTimeout(function () { if (!got) say("Nothing arrived from the store tab. Go back to it and click the bookmark again."); }, 15000);
  }

  /* ---------------- boot ---------------- */
  if (win.location.hash === "#troo-capture") { receiveCapture(); return; }
  var qs = new URLSearchParams(win.location.search);
  var shared = (qs.get("r") || "").replace(/[^a-z0-9]/gi, "");
  var preUrl = qs.get("url") || "";
  if (qs.get("sample") === "1") { openSample(); return; }
  if (shared) { loadShared(shared); return; }
  if (preUrl) urlIn.value = preUrl.replace(/^https?:\/\//i, "");
  api("/health", null, { timeout: 6000 }).then(function () {
    S.offline = false;
    if (preUrl) begin(preUrl);
  }).catch(function (e) {
    if (e.network) { S.offline = true; var b = $("[data-an-offline]"); if (b) b.hidden = false; }
    else if (preUrl) begin(preUrl);
  });
})();
