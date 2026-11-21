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

  function begin(raw) {
    var u = normalizeInput(raw);
    if (!u) { formErr.textContent = "Enter your store's address, like yourstore.com."; urlIn.focus(); return; }
    formErr.textContent = "";
    if (S.offline) { openSample(); return; }
    S.url = u; S.host = hostOf(u); S.detected = null; S.mode = "live";
    S.scanP = api("/scan", { url: u }, { timeout: 45000 }).then(function (r) { S.detected = r; onDetected(r); return r; });
    S.scanP.catch(function (e) { if (doc.body.getAttribute("data-an-view") === "questions") showError(e); });
    setupQuestions();
    show("questions");
    setQuery("url=" + encodeURIComponent(u.replace(/^https?:\/\//, "").replace(/\/$/, "")));
  }

  /* ---------------- quick questions: one at a time ---------------- */
  var CATS = ["Beauty & Personal Care", "Fashion & Apparel", "Jewellery & Accessories", "Health & Wellness", "Food & Beverages", "Home & Living", "Electronics & Gadgets", "Baby & Kids", "Pet Care", "Sports & Fitness", "Games & Toys"];
  var QS = [
    { id: "category", title: "What do you sell?", sub: "It picks your category checks and the benchmark we compare you with.", cols: 3, opts: CATS.map(function (c) { return [c, c]; }) },
    { id: "aovBand", title: "What's a typical order worth?", sub: "Stores at different price points convert very differently.", cols: 2, opts: [["< ₹500", "Under ₹500"], ["₹500–₹2,000", "₹500 to ₹2,000"], ["₹2,000–₹5,000", "₹2,000 to ₹5,000"], ["₹5,000+", "Over ₹5,000"]] },
    { id: "goal", title: "What matters most right now?", sub: "Your first tests are ordered around it.", cols: 1, opts: [["conversion", "More orders from the same traffic"], ["aov", "Bigger baskets"], ["ads", "Better return on ad spend"], ["speed", "A faster store"], ["ai", "Showing up in AI answers"]] },
    { id: "visitors", title: "How many people visit this page a month?", sub: "A rough guess is fine. It dates your test plan.", cols: 1, opts: [["5000", "Under 10,000"], ["30000", "10,000 to 50,000"], ["120000", "50,000 to 2 lakh"], ["300000", "Over 2 lakh"], ["", "Not sure"]] },
    { id: "competitors", title: "Who do shoppers compare you with?", sub: "Optional. Add up to two sites and we'll show where they're ahead.", type: "comp" }
  ];
  var QA = {}, qi = 0, advT = 0, liveT = 0;
  var stageEl = $("[data-qz-stage]");
  var ICON_ARROW = '<svg width="14" height="14" aria-hidden="true"><use href="#i-arrow"/></svg>';

  function setupQuestions() {
    QA = { competitors: ["", ""] }; qi = 0;
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
  function detectedFor(id) {
    var p = (S.detected && S.detected.page) || {};
    if (id === "category") return CATS.indexOf(p.category) >= 0 ? p.category : null;
    if (id === "aovBand") return p.aovBand || null;
    return null;
  }
  function currentVal(q) {
    if (QA[q.id] !== undefined) return QA[q.id];
    var d = detectedFor(q.id);
    if (d) return d;
    if (q.id === "goal") return "conversion";
    return undefined;
  }
  function qHtml(q, i) {
    var h = '<span class="qz-num">' + (i + 1) + ICON_ARROW + '</span><h2 class="qz-title" id="qz-title">' + esc(q.title) + '</h2><p class="qz-sub">' + esc(q.sub) + "</p>";
    if (q.type === "comp") {
      h += '<div class="qz-comp">' + [0, 1].map(function (k) {
        return '<label class="an-input qz-inp"><span class="pfx">https://</span><span class="sr-only">Competitor ' + (k + 1) + '</span><input type="text" inputmode="url" autocapitalize="none" spellcheck="false" data-qz-comp="' + k + '" placeholder="' + (k ? "another.com" : "competitor.com") + '" value="' + esc(QA.competitors[k] || "") + '"></label>';
      }).join("") + '</div><div class="an-err" data-qz-err role="alert"></div><div class="qz-go"><button class="btn btn-primary qz-start" type="button" data-qz-start>Start my analysis ' + ICON_ARROW + '</button><span class="qz-enter">or press <kbd>Enter</kbd></span></div>';
      return h;
    }
    var det = detectedFor(q.id), cur = currentVal(q);
    var dp = (S.detected && S.detected.page) || {};
    if (det) h += '<div class="qz-det">' + ICON_SPARK + "<span>We read you as <b>" + esc(q.id === "aovBand" ? bandLabel(det) : det) + "</b>. Keep it or pick another.</span></div>";
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
    var old = stageEl.firstElementChild;
    var el = doc.createElement("div");
    el.className = "qz-q" + (dir ? (dir > 0 ? " from-b" : " from-t") : "");
    el.innerHTML = qHtml(q, i);
    if (old) {
      if (dir) { old.classList.add(dir > 0 ? "to-t" : "to-b"); setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, reduced ? 0 : 340); }
      else old.parentNode.removeChild(old);
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
    QA[q.id] = v;
    $$(".qz-opt", stageEl.lastElementChild).forEach(function (b) { var on = b.getAttribute("data-v") === String(v); b.classList.toggle("on", on); b.setAttribute("aria-checked", on); if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } });
    clearTimeout(advT);
    advT = setTimeout(nextQ, reduced ? 60 : 420);
  }
  function nextQ() {
    clearTimeout(advT);
    var q = QS[qi];
    if (q && q.type !== "comp" && QA[q.id] === undefined) { var c = currentVal(q); if (c !== undefined) QA[q.id] = c; }
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
      category: skip ? (det.category || "") : (QA.category || det.category || ""),
      aovBand: skip ? (det.aovBand || "") : (QA.aovBand || det.aovBand || ""),
      goal: skip ? "conversion" : (QA.goal || "conversion"),
      visitors: skip ? 0 : (+QA.visitors || 0),
      competitors: comps.slice(0, 2)
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
      var k = e.key.toUpperCase().charCodeAt(0) - 65;
      if (k >= 0 && k < q.opts.length) { e.preventDefault(); choose(q.opts[k][0]); }
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
    var shot = $("[data-qz-shot]"), og = String(p.ogImage || "");
    shot.innerHTML = '<div class="wire on"><span class="wh">' + esc((p.heroHeadline || p.title || "").slice(0, 80)) + '</span><i class="w2"></i><i class="w3"></i><span class="wcta">' + esc(p.primaryCta || "") + "</span></div>";
    if (/^https:\/\//i.test(og)) { var img = new Image(); img.alt = ""; img.onload = function () { shot.insertBefore(img, shot.firstChild); shot.classList.add("has-img"); }; img.src = og; }
    var q = QS[qi];
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
      return '<div class="ag-a" data-ag="' + a.id + '" style="--c:' + a.c + '"><span class="ag-av"><i></i><b>' + esc(a.name.charAt(0)) + '</b></span><div class="ag-a-b"><div class="ag-a-t"><b>' + esc(a.name) + '</b><span class="ag-st">Queued</span></div><div class="ag-a-r">' + esc(a.role) + '</div><div class="ag-a-s" data-ag-s></div></div></div>';
    }).join("");
    var fx = $("[data-ag-fx]");
    fx.innerHTML = AGENTS.map(function (a) {
      return '<div class="ag-cur" data-cur="' + a.id + '" style="--c:' + a.c + '"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 1.5 14 7.2 8.6 8.6 6.6 14Z" fill="var(--c)" stroke="#0A0A0C" stroke-width="1.2" stroke-linejoin="round"/></svg><span>' + esc(a.name) + "</span></div>";
    }).join("");
    $("[data-ag-log]").innerHTML = "";
    $("[data-ag-page]").innerHTML = '<div class="pg-loading"><i></i><i></i><i></i></div>';
    $("[data-ag-url]").textContent = "Opening " + S.host + "…";
    updTally(); updAgCount();
  }
  function updTally() {
    $("[data-t-fix]").textContent = tally.fix;
    $("[data-t-pass]").textContent = tally.pass;
  }
  function updAgCount() {
    var done = AGENTS.filter(function (a) { return agState[a.id] === "done"; }).length;
    var run = AGENTS.filter(function (a) { return agState[a.id] === "run"; }).map(function (a) { return a.name; });
    $("[data-t-ag]").textContent = done + " of " + AGENTS.length;
    $("[data-ag-active]").textContent = done === AGENTS.length ? "All done" : run.length ? run.length + " working" : "Starting";
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
      var cur = $('[data-cur="' + id + '"]');
      if (cur) cur.classList.toggle("on", state === "run");
      if (state !== "run") { clearInterval(thinkT[id]); park(id); }
      updAgCount();
    }
    if (text != null) typeInto($("[data-ag-s]", row), text);
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
    var stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    var li = doc.createElement("li");
    li.className = "ag-l " + kind;
    li.style.setProperty("--c", a.c);
    li.innerHTML = '<span class="tm">' + fmtT() + '</span><span class="who">' + esc(a.name) + '</span><span class="ic">' + (kind === "pass" ? ICON_CHECK : kind === "fail" ? "!" : kind === "info" ? ICON_SPARK : "›") + '</span><span class="tx"><b>' + esc(title) + "</b>" + (text ? '<em>' + esc(text) + "</em>" : "") + (chips ? '<span class="chips">' + chips + "</span>" : "") + "</span>";
    list.appendChild(li);
    feedN++;
    $("[data-s-count]").textContent = plural(feedN, "line");
    while (list.children.length > 80) list.removeChild(list.firstChild);
    if (stick) list.scrollTop = list.scrollHeight;
  }
  function barrierChips(ids, lib, max) {
    return (ids || []).slice(0, max || 3).map(function (b) {
      var x = lib.barriers && lib.barriers[b];
      return '<span class="chip b" title="' + esc(x ? tidy(x.description) : "") + '">' + esc(b + (x ? " " + tidy(x.name) : "")) + "</span>";
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
    pg.className = "ag-page " + (pdp ? "is-pdp" : "is-home");
    pg.innerHTML = h;
    var og = String(p.ogImage || "");
    if (/^https:\/\//i.test(og)) {
      var img = new Image(); img.alt = ""; img.onload = function () { var box = $('[data-ag-page] [data-r="img"]'); if (box) { box.style.backgroundImage = 'url("' + og.replace(/"/g, "%22") + '")'; box.classList.add("has-img"); } }; img.src = og;
    }
    if (S.viewP) S.viewP.then(function (v) { if (v && v.html && S.running) mountReal(v, p); });
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
  function mountReal(v, p) {
    var view = $(".ag-view"), pg = $("[data-ag-page]"); if (!view || !pg) return;
    var W = pg.clientWidth || (view.clientWidth - 70), H = view.clientHeight;
    var vw = W < 560 ? 390 : 1280, scale = W / vw;
    var fr = doc.createElement("iframe");
    fr.setAttribute("sandbox", "allow-same-origin");
    fr.setAttribute("title", "Your page, as the agents see it");
    fr.setAttribute("tabindex", "-1");
    fr.className = "ag-frame";
    fr.style.width = vw + "px"; fr.style.height = Math.ceil(H / scale) + "px"; fr.style.transform = "scale(" + scale + ")";
    fr.srcdoc = v.html;
    var holder = doc.createElement("div"); holder.className = "ag-real"; holder.appendChild(fr);
    view.insertBefore(holder, pg);
    var done = false;
    function ready() {
      if (done) return; done = true;
      var d, w;
      try { d = fr.contentDocument; w = fr.contentWindow; } catch (e) { holder.remove(); return; }
      if (!d || !d.body) { holder.remove(); return; }
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
        if (text < 250 || (!els.title && !els.cta)) { holder.remove(); return; }
        RV = { frame: fr, doc: d, win: w, scale: scale, els: els, H: H, pins: [] };
        holder.classList.add("on"); pg.classList.add("hide");
        $(".ag-canvas").classList.add("is-real");
        addFeed("act", "Loaded your live page", "The agents now work on your real page, drawn without its scripts", "", "reader");
      }, 700);
    }
    fr.addEventListener("load", ready);
    setTimeout(ready, 6000);
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
    R.trust = first("[class*=trust], [class*=badge], [class*=usp], [class*=icon-with-text], [class*=guarantee], [class*=delivery], [class*=shipping]", function (el) { return tx(el).length < 300; }, 2600);
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
    var x = b.left * s, y = b.top * s, w = Math.min(b.width * s, W - 74 - Math.max(0, x)), h = Math.min(b.height * s, H * 0.8);
    return { x: Math.max(0, x), y: y, w: Math.max(20, w), h: Math.max(14, h), W: W, H: H };
  }
  function scrollToRegion(name, cb) {
    if (!RV || !RV.els[name]) { if (cb) cb(); return; }
    var w = RV.win, viewH = RV.H / RV.scale, b = RV.els[name].getBoundingClientRect();
    var from = w.scrollY, docTop = b.top + from;
    var inView = b.top > 30 && b.top + Math.min(b.height, viewH * 0.5) < viewH - 30;
    if (inView) { if (cb) cb(); return; }
    var to = Math.max(0, docTop - viewH * 0.28), t0 = performance.now(), dur = REDUCED ? 0 : 280;
    (function step(now) {
      var k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      w.scrollTo(0, from + (to - from) * e); placePins();
      if (k < 1) win.requestAnimationFrame(step); else if (cb) cb();
    })(t0);
  }
  function placePins() {
    if (!RV) return;
    RV.pins.forEach(function (pp) {
      var r = realRect(pp.region); if (!r) return;
      var slot = { bad: 0, warn: 1, test: 2 }[pp.kind] || 0;
      pp.el.style.left = Math.min(r.x + r.w - 10 - slot * 34, r.W - 30) + "px";
      pp.el.style.top = (r.y - 9) + "px";
      pp.el.style.opacity = r.y < -10 || r.y > r.H - 10 ? "0" : "";
    });
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
    moveCur(id, W * a.park[0] - 40, H * a.park[1] - 8);
  }
  function goTo(id, region, jitter) {
    if (RV) { scrollToRegion(region, function () { goTo2(id, region, jitter); }); return true; }
    return goTo2(id, region, jitter);
  }
  function goTo2(id, region, jitter) {
    var r = regionRect(region); if (!r) return null;
    var j = jitter == null ? 0.5 : jitter;
    moveCur(id, r.x + r.w * (0.25 + 0.5 * Math.random() * j), r.y + Math.min(r.h * 0.6, 24 + Math.random() * Math.max(0, r.h - 30)));
    return r;
  }
  function flash(region, kind, label, color) {
    var r = regionRect(region), fx = $("[data-ag-fx]"); if (!r) return;
    $$(".ag-box:not(.out)", fx).forEach(function (o) { o.classList.add("out"); setTimeout(function () { o.remove(); }, 450); });
    var b = doc.createElement("div");
    b.className = "ag-box " + (kind || "");
    if (color) b.style.setProperty("--c", color);
    b.style.cssText += ";left:" + (r.x - 3) + "px;top:" + (r.y - 3) + "px;width:" + (r.w + 6) + "px;height:" + (r.h + 6) + "px";
    if (label) b.innerHTML = '<span' + (r.y < 26 ? ' class="in"' : "") + ">" + esc(label) + "</span>";
    fx.appendChild(b);
    setTimeout(function () { b.classList.add("out"); }, 1300);
    setTimeout(function () { b.remove(); }, 1800);
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

  function runPsi(url) {
    var skipP = new Promise(function (res) { S.psiSkip = function () { res(null); }; });
    var p;
    if (S.scan && S.scan.psiServer) {
      p = api("/psi?url=" + encodeURIComponent(url) + "&strategy=mobile", null, { timeout: 110000 });
    } else if (win.TrooPSI && win.AbortController) {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 95000);
      p = fetch(win.TrooPSI.psiUrl(url, "mobile"), { signal: ctl.signal })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { clearTimeout(t); return d && d.lighthouseResult ? win.TrooPSI.compactPsi(d, "mobile") : null; });
    } else p = Promise.resolve(null);
    p = p.then(function (d) { return d && d.scores && d.scores.performance != null ? d : null; }).catch(function () { return null; });
    return Promise.race([p, skipP]);
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
    var list = S.inputs.competitors || [];
    return Promise.all(list.map(function (u) {
      return api("/scan", { url: u, role: "competitor", parent: r.slug, category: (r.page && r.page.category) || undefined }, { timeout: 45000 })
        .then(function (c) { rescore(c, (c.library || {}).signals); return compactComp(c); })
        .catch(function (e) { return { url: u, host: hostOf(u), error: e.message || "We couldn't read their page." }; });
    }));
  }

  function showError(e) {
    S.running = false;
    clearInterval(tickT);
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
    show("scan");
    S.viewP = fetchView(S.url);
    buildStages();
    $("[data-s-done]").hidden = true;
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
    try { r = await S.scanP; } catch (e) { showError(e); return; }
    var det = r.page || {};
    var want = S.inputs;
    if ((want.category && want.category !== det.category) || (want.aovBand && want.aovBand !== det.aovBand)) {
      setAgent("reader", null, "Re-reading the page with your answers");
      try { r = await api("/scan", { url: S.url, category: want.category || undefined, aovBand: want.aovBand || undefined, goal: want.goal }, { timeout: 45000 }); }
      catch (e) { /* keep the first read */ }
    }
    S.scan = r;
    var lib = r.library || { signals: {}, barriers: {}, rootCauses: {} };
    rescore(r, lib.signals);
    var p = r.page || {};
    paintPage(r);
    await sleep(350);
    stage("open", "done", (hostOf(r.url) || S.host) + (r.lite && r.lite.ttfbMs != null ? " answered in " + r.lite.ttfbMs + "ms" : " answered"));
    addFeed("act", "Page opened", r.lite && r.lite.ttfbMs != null ? "Server answered in " + r.lite.ttfbMs + "ms, " + (r.lite.htmlKb || "?") + " KB of HTML" : "", "");

    /* Speed and Market start now and work in parallel */
    var psiP = runPsi(r.url);
    var compP = runComps(r);
    curAgent = "speed";
    stage("speed", "run");
    think("speed", ["Loading your page on a mid-range phone", "Timing the largest image and headline", "Counting scripts that block taps", "Waiting for Google PageSpeed"]);
    goTo("speed", "img");
    addFeed("act", "Started Google PageSpeed on mobile", "Runs in the background while the others work", "", "speed");
    var nComp = (S.inputs.competitors || []).length;
    stage("compare", "run");
    think("market", nComp ? ["Opening " + S.inputs.competitors.map(hostOf).join(" and "), "Reading their pages with the same checks", "Lining up their scores with yours"] : ["Finding the benchmark for " + (p.category || "your category"), "Matching your price band"]);
    addFeed("act", nComp ? "Reading " + plural(nComp, "competitor") + " in parallel" : "Looking up your category benchmark", "", "", "market");

    /* 2. Reader maps the structure */
    curAgent = "reader";
    stage("structure", "run", "Mapping header, product and footer");
    var walk = [["nav", "Header and menu"], ["title", (p.h1 && p.h1.length) ? plural(p.h1.length, "H1 heading") : "No H1 heading"], ["img", plural((p.images && p.images.total) || 0, "image")], ["cta", "Main button: " + (p.primaryCta || "none found")], ["footer", "Footer"]];
    for (var w = 0; w < walk.length; w++) {
      goTo("reader", walk[w][0]); await sleep(330);
      flash(walk[w][0], "map", walk[w][1], AG.reader.c); await sleep(260);
    }
    stage("structure", "done", [PAGE_TYPE[p.pageType] || "Page", plural(p.words || 0, "word"), plural((p.images && p.images.total) || 0, "image")].join(" · "));
    addFeed("act", "Mapped the page", [PAGE_TYPE[p.pageType] || "Page", plural(p.words || 0, "word"), plural((p.images && p.images.total) || 0, "image"), p.platform].filter(Boolean).join(" · "), "");
    if (p.rendered === "client") addFeed("info", "This page builds most of its content with JavaScript", "We read what's in the HTML. Checks that need the rendered page are left out of the score, never counted as failures.");

    /* 3. Reader reads the business */
    stage("business", "run", "Working out what you sell");
    goTo("reader", "price"); await sleep(420);
    var bizLine = [p.category || "Category not detected", p.aovBand ? bandLabel(p.aovBand) : p.aov ? money(p.aov, p.currency) : "", p.platform].filter(Boolean).join(" · ");
    flash("price", "map", p.aov ? "Typical price " + money(p.aov, p.currency) : "Prices", AG.reader.c);
    await sleep(500);
    stage("business", "done", bizLine);
    addFeed("act", "Read the business", bizLine, "");

    /* 4. Conversion agent runs every check on the page */
    curAgent = "conv";
    var checks = (r.checks || []).filter(function (c) { return !/^SIG-(MOB|A11Y)/.test(c.signal); });
    stage("signals", "run", "0 of " + checks.length + " checks");
    addFeed("act", "Running " + plural(checks.length, "conversion check"), "Each one comes from the TrooCRO signal library", "");
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i], s = lib.signals[c.signal] || {}, reg = regionFor(c.key);
      var short = SHORT[c.key] || tidy(s.name) || c.key;
      setAgent("conv", null, "Checking " + (i + 1) + " of " + checks.length + ": " + (tidy(s.name) || short));
      goTo("conv", reg);
      await sleep(REDUCED ? 120 : 300);
      if (c.status === "fail") {
        tally.fix++;
        flash(reg, "bad", short);
        pin(reg, "!", "bad");
        addFeed("fail", short, c.evidence, barrierChips(s.barriers, lib, 2));
      } else {
        tally.pass++;
        flash(reg, "ok", clip2(c.evidence, 46));
        addFeed("pass", clip2(c.evidence, 90), "", "");
      }
      updTally();
      await sleep(checks.length > 16 ? 230 : 320);
    }
    var conv = r.conversion || {};
    stage("signals", "done", checks.length ? conv.passed + " passed, " + conv.failed + " to fix" : "Not enough page content to check");

    /* 5. Barrier agent tags what stops buyers */
    curAgent = "barrier";
    stage("barriers", "run", "Matching failures to buyer barriers");
    var bHit = {}, bReg = {};
    checks.forEach(function (c) { if (c.status !== "fail") return; var s = lib.signals[c.signal] || {}; (s.barriers || []).forEach(function (b) { bHit[b] = (bHit[b] || 0) + 1; if (!bReg[b]) bReg[b] = regionFor(c.key); }); });
    var bIds = Object.keys(bHit).sort(function (a, b) { return bHit[b] - bHit[a]; });
    for (var bi = 0; bi < Math.min(bIds.length, 5); bi++) {
      var bid = bIds[bi], bx = lib.barriers[bid];
      setAgent("barrier", null, bid + (bx ? " " + tidy(bx.name) : "") + ": " + plural(bHit[bid], "issue"));
      goTo("barrier", bReg[bid]); await sleep(300);
      flash(bReg[bid], "bar", bid + (bx ? " " + tidy(bx.name) : ""), AG.barrier.c);
      $("[data-t-bar]").textContent = String(bi + 1);
      await sleep(360);
    }
    $("[data-t-bar]").textContent = String(bIds.length);
    stage("barriers", "done", bIds.length ? plural(bIds.length, "barrier") + ": " + bIds.slice(0, 3).join(", ") : "No barrier tags on the failed checks");
    addFeed(bIds.length ? "fail" : "pass", bIds.length ? plural(bIds.length, "buyer barrier") + " triggered" : "No buyer barriers triggered", bIds.slice(0, 4).map(function (b) { return b + (lib.barriers[b] ? " " + tidy(lib.barriers[b].name) : ""); }).join(", "), "");

    /* 6. Search & AI agent (runs while Speed keeps waiting) */
    curAgent = "search";
    stage("search", "run", "Reading robots.txt, sitemap and schema");
    var ai = r.ai || {};
    goTo("search", "nav"); await sleep(380);
    flash("nav", "map", "Meta tags and schema", AG.search.c); await sleep(320);
    (ai.checks || []).forEach(function (x) { if (!x.pass) addFeed("fail", x.label, x.detail || "", ""); });
    var aiFails = (ai.checks || []).filter(function (x) { return !x.pass; });
    if (aiFails.length) { goTo("search", "title"); await sleep(320); flash("title", "bad", aiFails[0].label); pin("nav", "AI", "warn"); }
    await sleep(300);
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
    }, 12000);
    sweep(true, AG.speed.c);
    var psi = await psiP;
    clearTimeout(skipTimer);
    sweep(false);
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
    goTo("a11y", "img"); await sleep(380);
    if (psi && psi.scores.accessibility != null) {
      (psi.findings || []).filter(function (f) { return f.area === "accessibility"; }).slice(0, 3).forEach(function (f) { var s = lib.signals[f.signal] || {}; addFeed("fail", tidy(s.name) || "Accessibility", f.evidence, ""); });
      flash("img", psi.scores.accessibility >= 85 ? "ok" : "bad", "Accessibility " + psi.scores.accessibility + "/100");
      await sleep(400);
      stage("a11y", "done", "Accessibility " + psi.scores.accessibility + "/100 (Google Lighthouse)");
    } else {
      var lt2 = r.lite || {};
      if (lt2.a11yIssues && lt2.a11yIssues.length) { flash("img", "bad", lt2.a11yIssues[0]); addFeed("fail", "Accessibility gaps in the page's code", lt2.a11yIssues.slice(0, 3).join(", ") + ".", ""); }
      else flash("img", "ok", "No obvious gaps in the code");
      goTo("a11y", "cta"); await sleep(400);
      stage("a11y", "est", "Estimated from the page's code: " + (lt2.a11yEstimate != null ? lt2.a11yEstimate + "/100" : "n/a"));
    }

    /* 9. Market agent reports in */
    curAgent = "market";
    goTo("market", "price");
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
    var C = compute(S.report);
    var T = testsOf(S.report, findingsOf(S.report));
    for (var ti = 0; ti < T.length; ti++) {
      var reg2 = regionFor(T[ti].f.key);
      setAgent("plan", null, "Test " + (ti + 1) + ": " + clip2(T[ti].title, 60));
      goTo("plan", reg2); await sleep(380);
      flash(reg2, "plan", "Test " + (ti + 1), AG.plan.c);
      pin(reg2, String(ti + 1), "test");
      addFeed("act", "Test " + (ti + 1) + ": " + clip2(T[ti].title, 90), T[ti].where || "", "");
      await sleep(320);
    }
    stage("plan", "done", T.length ? plural(T.length, "test") + " planned, starting " + fmtDate(nextMonday(new Date())) : "Nothing urgent to test");
    clearInterval(tickT);
    $("[data-s-status]").textContent = "Done"; $("[data-s-status]").classList.remove("live");
    $("[data-s-verb]").textContent = "Finished reading"; $("[data-ag-canvas]").classList.add("is-done"); $(".ag-livepill").lastChild.textContent = "Done";
    $("[data-s-verdict]").textContent = C.verdict;
    $("[data-s-done]").hidden = false;
    setTimeout(function () { setMiniScore(C.total); }, 60);
    addFeed("pass", "Report ready", "Website score " + (C.total != null ? C.total + "/100" : "n/a"), "", "plan");
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
      benchmark: r.benchmark, psi: psiC, comps: comps || [],
      lib: { signals: signals, barriers: barriers, rootCauses: lib.rootCauses || {} }
    };
  }
  function saveReport() {
    var R = S.report; if (!R || !R.slug) return;
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

  function compute(R) {
    var areas = [];
    rescore(R);
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
    return { areas: areas, total: total, est: est, verdict: verdict };
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
  function findingsOf(R) {
    var L = R.lib || { signals: {} }, goal = (R.inputs && R.inputs.goal) || "conversion", out = [];
    (R.checks || []).forEach(function (c) {
      if (c.status !== "fail" || /^SIG-(MOB|A11Y)/.test(c.signal)) return;
      out.push({ area: "conversion", key: c.key, signal: c.signal, evidence: c.evidence, sig: L.signals[c.signal] || null });
    });
    ((R.psi && R.psi.findings) || []).forEach(function (f) {
      if (f.area !== "speed") return;
      out.push({ area: "speed", key: "psi", signal: f.signal, evidence: f.evidence, sig: L.signals[f.signal] || null });
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
    var metric = f.area === "speed" ? "load time and bounce rate" : (R.page && R.page.pageType === "PDP") ? "add-to-cart rate" : "click-through to products and add-to-cart rate";
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

  function renderReport(R, opts) {
    opts = opts || {};
    var L = R.lib || { signals: {}, barriers: {}, rootCauses: {} };
    R.page = cleanPage(R.page);
    var P = R.page;
    var C = compute(R), F = findingsOf(R), T = testsOf(R, F);
    var host = hostOf(R.url) || String(R.host || "").replace(/^www\./, "");
    var created = R.createdAt ? new Date(R.createdAt) : new Date();
    var passes = (R.checks || []).filter(function (c) { return c.status === "pass" && !/^SIG-(MOB|A11Y)/.test(c.signal); });
    var barriersHit = {}; F.forEach(function (f) { ((f.sig || {}).barriers || []).forEach(function (b) { barriersHit[b] = 1; }); });
    var nBar = Object.keys(barriersHit).length;
    var hasComp = (R.comps || []).length > 0;
    var h = '<div class="rp">';

    if (opts.mode === "sample") h += '<div class="wrap" style="padding-top:118px"><div class="an-banner"><span><b>Sample report.</b> A real TrooCRO scan of ' + (/myshopify\.com$/.test(host) ? "Shopify’s public theme demo store (" + esc(host) + "), with category, order value and traffic filled in as an example" : esc(host)) + ", run on " + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })) + ". Live scans run when this site is hosted or opened from your computer.</span></div></div>";

    /* header */
    h += '<div class="wrap rp-wrap"' + (opts.mode === "sample" ? ' style="padding-top:28px"' : "") + ">";
    h += '<header class="rp-head"><div><span class="eyebrow">' + (opts.mode === "shared" ? "Shared website analysis" : "Website analysis") + '</span><h1 class="h1">Your report for <span>' + esc(host) + "</span></h1>";
    h += '<div class="rp-meta"><span class="an-tag">' + esc(PAGE_TYPE[P.pageType] || "Page") + "</span>" + (P.category && P.category !== "Other" ? '<span class="an-tag">' + esc(P.category) + "</span>" : "") + (P.aovBand ? '<span class="an-tag">' + esc(bandLabel(P.aovBand)) + "</span>" : "") + (P.platform ? '<span class="an-tag">' + esc(P.platform) + "</span>" : "") + '<span class="an-tag">' + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</span></div></div>";
    h += '<div class="rp-actions">' + (opts.mode === "live" ? '<button class="btn btn-ghost btn-sm" type="button" data-share' + (S.saveState === "saved" ? "" : " disabled") + "><span>" + (S.saveState === "saved" ? "Copy share link" : S.saveState === "failed" ? "Link unavailable" : "Saving link…") + "</span></button>" : opts.mode === "shared" ? '<button class="btn btn-ghost btn-sm" type="button" data-share><span>Copy share link</span></button>' : "") + (S.offline ? "" : '<button class="btn btn-ghost btn-sm" type="button" data-print>Save as PDF</button>') + '<button class="btn btn-light btn-sm" type="button" data-new>' + (opts.mode === "live" ? "Analyze another site" : "Run your own analysis") + "</button></div></header>";

    /* verdict hero */
    var path = ""; try { path = new URL(R.url).pathname; } catch (e) { /* ignore */ }
    var shot = R.psi && R.psi.shots && R.psi.shots.final;
    var og = /^https:\/\//i.test(P.ogImage || "") ? P.ogImage : "";
    h += '<section class="rp-hero" id="rp-overview">';
    h += '<div class="rp-score"><div class="rp-score-top">' + ringSvg(C.total) + '<div><span class="an-label">Website score</span><div class="rp-verdict">' + esc(C.verdict) + '</div><p class="an-sub">Across the areas we could measure on this page.' + (C.est ? " Speed and accessibility are estimated." : "") + "</p></div></div>";
    h += '<div class="rp-kpis"><div><b>' + F.length + "</b><span>" + (F.length === 1 ? "issue" : "issues") + ' costing sales</span></div><div><b>' + nBar + "</b><span>buyer " + (nBar === 1 ? "barrier" : "barriers") + ' triggered</span></div><div><b>' + T.length + "</b><span>" + (T.length === 1 ? "test" : "tests") + " ready to run</span></div></div>";
    h += '<div class="rp-areas">' + C.areas.map(function (a) {
      return '<div class="rp-area' + (a.ctx ? " ctx" : "") + (a.v == null ? " na" : "") + '" title="' + esc(a.src) + '"><span class="nm">' + esc(a.name) + (a.est && a.v != null ? "<em>est.</em>" : "") + '</span><span class="bar"><i style="width:' + (a.v || 0) + "%;background:" + colorFor(a.v) + '"></i></span><b>' + (a.v == null ? "n/a" : a.v) + '</b><span class="w">' + (a.w ? a.w + "%" : "info") + "</span></div>";
    }).join("") + "</div>";
    h += '<details class="rp-how"><summary>How the score works</summary><p>Conversion counts for 40%, speed 25%, accessibility 20% and search and AI 15%. Your weakest area pulls the total down further, because one broken area costs sales on its own. Basics every store needs, like a price or a contact link, earn nothing when present and cost a lot when missing, and checks we can only confirm from a keyword get partial credit. An area we couldn’t measure is left out, never counted as zero. Agent readiness and growth stack are shown for context, not scored.' + (C.est ? " Speed and accessibility are estimated from your page’s code when Google PageSpeed isn’t available." : "") + "</p></details></div>";
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

    /* body: rail + main */
    var nav = [["rp-findings", "What’s costing sales", F.length], ["rp-tests", "First tests and plan", T.length], ["rp-beyond", "Speed, search and AI", ""]];
    if (hasComp) nav.push(["rp-compare", "Competitors", R.comps.length]);
    nav.push(["rp-worth", "What a lift is worth", ""], ["rp-next", "Next step", ""]);
    h += '<div class="rp-body"><nav class="rp-rail" aria-label="In this report"><span class="an-label">In this report</span>' + nav.map(function (n, i) { return '<a href="#' + n[0] + '" data-rail="' + n[0] + '"' + (i === 0 ? ' class="on"' : "") + "><span>" + esc(n[1]) + "</span>" + (n[2] !== "" ? "<i>" + n[2] + "</i>" : "") + "</a>"; }).join("") + '<a class="btn btn-primary btn-sm rp-rail-cta" href="#rp-next">Fix it with TrooCRO</a></nav><div class="rp-main">';
    h += rpFindings(R, F, L, host, passes);
    if (T.length) h += rpTests(R, T, L, host, created);
    h += rpBeyond(R, host);
    if (hasComp) h += compSection(R);
    h += rpWorth(R);
    h += rpNext(R, C, host);
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
    var metric = f.area === "speed" ? "load time" : (R.page && R.page.pageType === "PDP") ? "add-to-cart rate" : "click-through and add-to-cart";
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
    return { key: "speed", name: "Speed", title: "Speed, estimated", v: lt.speedEstimate != null ? lt.speedEstimate : null, est: true, sum: "Google PageSpeed wasn’t available for this scan, so we estimated speed from server response, page weight and scripts. A full TrooCRO diagnosis measures real load times on phones.", body: body };
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
  function rpNext(R, C, host) {
    var h = '<div class="an-cta-grid"><div class="an-card pad"><span class="an-label">Done the usual way</span><h3 class="an-h3" style="margin-top:12px">Each fix needs four people and a lot of handoffs.</h3><div class="an-roles">' +
      [["01", "A CRO analyst to find and size it"], ["02", "A designer to make it on brand"], ["03", "A developer to build it on your store"], ["04", "QA to check it on every device"]].map(function (x) { return '<div class="an-role"><span class="n">' + x[0] + "</span><span>" + esc(x[1]) + '</span><span class="h">handoff</span></div>'; }).join("") +
      '</div><p class="an-roles-foot">Four briefs and four calendars. Every handoff is a place a fix can stall.</p></div><div class="an-fixit"><span class="eyebrow" style="color:var(--text-2)">With TrooCRO</span><h2 class="h2">One team finds it, builds it and measures it.</h2><p>TrooCRO turns this report into shipped, tested changes on your store. You approve every change before it goes live.</p><div class="an-avgs"><div><b>6.4 days</b>CRO audit</div><div><b>3.7 days</b>UI/UX fix live</div><div><b>3.4 days</b>Experiment setup</div><div><b>12.9 days</b>Landing page</div></div><p class="an-note" style="margin-top:10px;color:var(--text-2);opacity:.7">Averages across Troopod’s delivered projects.</p><div class="btn-row"><a class="btn btn-light" href="contact.html?site=' + encodeURIComponent(host) + (R.slug ? "&amp;report=" + encodeURIComponent(R.slug) : "") + '">Fix it with TrooCRO</a><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + WA + "?text=" + encodeURIComponent("Hi TrooCRO, I ran the site analysis for " + host + (C.total != null ? " (score " + C.total + "/100)" : "") + " and want to talk about the fixes.") + '"><svg width="15" height="15"><use href="#i-wa"/></svg>WhatsApp us</a></div></div></div>';
    h += '<div class="an-card an-lead"><span class="an-label">Get the full fix plan</span><h3 class="an-h3" style="margin-top:10px">Want every fix sized and scheduled for ' + esc(host) + '?</h3><p class="an-sub">Leave your details and the TrooCRO team will have this report when they reach you.</p><form data-lead novalidate><label class="an-input"><span class="sr-only">Name</span><input name="name" type="text" autocomplete="name" placeholder="Your name" required></label><label class="an-input"><span class="sr-only">Work email</span><input name="email" type="email" autocomplete="email" placeholder="Work email" required></label><input class="hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn btn-primary" type="submit">Send it to the team</button></form><div class="an-err" data-lead-err role="alert"></div></div>';
    return '<section class="rp-sec" id="rp-next">' + secHead("Your next step", "Turn this report into revenue", "") + h + "</section>";
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
    var pr = $("[data-print]", root); if (pr) pr.addEventListener("click", function () { $$("details", root).forEach(function (d) { d.open = true; }); win.print(); });
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
      err.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
      api("/lead", { source: "report", name: name, email: email, website: R.url, scanSlug: R.slug || "", hp: lf.elements["hp"].value, interests: ["Site analysis report"] }, { timeout: 20000 }).then(function () {
        lf.outerHTML = '<p class="ok">Thanks, ' + esc(name.split(" ")[0]) + ". Your details are saved with this report, and someone from the TrooCRO team may follow up.</p>";
      }).catch(function (x) { btn.disabled = false; btn.textContent = "Send it to the team"; err.textContent = x.message || "Couldn't send that. Try again."; });
    });
  }

  function reportMarkdown(R, out) {
    var C = out.C, lines = [];
    var hh = hostOf(R.url) || R.host;
    lines.push("---", 'title: "TrooCRO website analysis for ' + hh + '"', "format: agent view of this page (the same facts as the page, as text)", "---", "");
    lines.push("# Website analysis for " + hh, "", "Website score: " + (C.total != null ? C.total + "/100" : "not enough to score") + (C.est ? " (partly estimated)" : "") + ". " + C.verdict, "");
    lines.push("## Area scores");
    C.areas.forEach(function (a) { lines.push("- " + a.name + ": " + (a.v != null ? a.v + "/100" : "not measured") + " (" + (a.w ? a.w + "% of score" : "not scored") + "; " + a.src + ")"); });
    lines.push("", "## Findings, by priority");
    out.F.forEach(function (f) { lines.push("- " + f.prio.l + ": " + (tidy((f.sig || {}).name) || f.key) + ". " + f.evidence + ((f.sig || {}).barriers && f.sig.barriers.length ? " Barriers: " + f.sig.barriers.join(", ") + "." : "")); });
    if (out.T.length) { lines.push("", "## First tests"); out.T.forEach(function (t) { lines.push(t.n + ". " + t.title + ". Where: " + t.where + ". " + t.measure); }); }
    lines.push("", "## Next step", "Fix it with TrooCRO: contact.html · WhatsApp +91 98104 83552");
    return lines.join("\n");
  }

  function openReport(R, opts) {
    opts = opts || {};
    S.mode = opts.mode || "live";
    var root = $("[data-report]");
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

  /* ---------------- boot ---------------- */
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
