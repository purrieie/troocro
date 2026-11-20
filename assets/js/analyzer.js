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

  /* ---------------- quick questions ---------------- */
  var catSel = $("[data-q-category]"), catDetect = $("[data-q-cat-detect]"), aovDetect = $("[data-q-aov-detect]"), qErr = $("[data-q-err]");
  function setupQuestions() {
    $("[data-q-host]").textContent = S.host + " · reading your page";
    $("[data-q-host]").classList.add("live");
    catDetect.textContent = ""; aovDetect.textContent = ""; qErr.textContent = "";
    catSel.value = "";
    $$('[name="aov"]').forEach(function (r) { r.checked = false; });
    $$("[data-q-comp]").forEach(function (i) { i.value = ""; });
  }
  function onDetected(r) {
    var p = r.page || {};
    var tag = $("[data-q-host]");
    tag.textContent = S.host + " · page read"; tag.classList.remove("live");
    if (p.category) {
      catDetect.innerHTML = ICON_SPARK + "<span>We read you as <b>" + esc(p.category) + "</b>. Change it if that's wrong.</span>";
      if (!catSel.value) catSel.value = p.category;
    } else {
      catDetect.innerHTML = "<span>We couldn't tell your category from the page. Pick one for a sharper report.</span>";
    }
    if (p.aovBand) {
      if (!$$('[name="aov"]').some(function (x) { return x.checked; })) $$('[name="aov"]').forEach(function (x) { x.checked = x.value === p.aovBand; });
      aovDetect.innerHTML = ICON_SPARK + "<span>Prices on your page suggest <b>" + esc(bandLabel(p.aovBand)) + "</b>" + (p.aov ? " (about " + esc(inr(p.aov)) + ")" : "") + ".</span>";
    } else if (p.currency && p.currency !== "INR") {
      aovDetect.innerHTML = "<span>Your prices aren't in rupees, so pick the closest band.</span>";
    }
  }
  function radio(name) { var x = $$('[name="' + name + '"]').filter(function (i) { return i.checked; })[0]; return x ? x.value : ""; }
  function collectInputs(skip) {
    var det = (S.detected && S.detected.page) || {};
    var comps = [], bad = false;
    if (!skip) {
      $$("[data-q-comp]").forEach(function (i) {
        if (!i.value.trim()) return;
        var u = normalizeInput(i.value);
        if (!u) { bad = true; return; }
        if (hostOf(u) !== S.host && !comps.some(function (c) { return hostOf(c) === hostOf(u); })) comps.push(u);
      });
    }
    if (bad) { qErr.textContent = "Check the competitor address: it should look like competitor.com."; return false; }
    S.inputs = {
      category: skip ? (det.category || "") : (catSel.value || det.category || ""),
      aovBand: skip ? (det.aovBand || "") : (radio("aov") || det.aovBand || ""),
      goal: skip ? "conversion" : (radio("goal") || "conversion"),
      visitors: skip ? 0 : (+radio("visitors") || 0),
      competitors: comps.slice(0, 2)
    };
    return true;
  }
  var qStart = $("[data-q-start]"), qSkip = $("[data-q-skip]");
  if (qStart) qStart.addEventListener("click", function () { if (collectInputs(false)) runScan(); });
  if (qSkip) qSkip.addEventListener("click", function () { collectInputs(true); runScan(); });

  /* ---------------- live scan ---------------- */
  var STAGES = [
    { id: "open", phase: "Read", label: "Opening your page" },
    { id: "structure", phase: "Read", label: "Reading your page's structure" },
    { id: "business", phase: "Read", label: "Understanding your business" },
    { id: "signals", phase: "Diagnose", label: "Checking conversion signals" },
    { id: "barriers", phase: "Diagnose", label: "Tagging buyer barriers" },
    { id: "speed", phase: "Measure", label: "Measuring page speed" },
    { id: "search", phase: "Measure", label: "Checking search and AI answers" },
    { id: "a11y", phase: "Measure", label: "Checking accessibility" },
    { id: "compare", phase: "Plan", label: "Comparing you with your market" },
    { id: "plan", phase: "Plan", label: "Planning your first tests" }
  ];
  var stState = {}, tickT = 0, feedN = 0;

  function buildStages() {
    var box = $("[data-s-steps]"), html = "", phase = "", pi = 0;
    STAGES.forEach(function (s) {
      if (s.phase !== phase) { if (phase) html += "</div>"; phase = s.phase; pi++; html += '<div class="an-phase"><span class="an-label">0' + pi + " · " + esc(s.phase) + "</span>"; }
      html += '<div class="an-stage" data-stage="' + s.id + '"><span class="st">' + ICON_CHECK + '</span><span><span class="lb">' + esc(s.label) + '</span><span class="d"></span></span></div>';
    });
    box.innerHTML = html + "</div>";
    stState = {};
  }
  function stage(id, state, detail) {
    var el = $('[data-stage="' + id + '"]'); if (!el) return;
    el.classList.remove("run", "done", "skip");
    if (state) el.classList.add(state === "est" ? "done" : state);
    if (state === "est") el.classList.add("skip");
    if (detail != null) $(".d", el).textContent = detail;
    stState[id] = state;
    var done = 0; STAGES.forEach(function (s) { var v = stState[s.id]; done += v === "done" || v === "est" || v === "skip" ? 1 : v === "run" ? 0.4 : 0; });
    var pct = Math.round(done / STAGES.length * 100);
    $("[data-s-bar]").style.width = pct + "%";
    $("[data-s-barwrap]").setAttribute("aria-valuenow", pct);
  }
  function startTimer() {
    var t0 = Date.now(), el = $("[data-s-time]");
    clearInterval(tickT);
    tickT = setInterval(function () { var s = Math.floor((Date.now() - t0) / 1000); el.textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) + " elapsed"; }, 500);
  }
  function setMiniScore(v, label) {
    var ring = $("[data-s-ring]"), c = $(".val", ring);
    var C = 326.7;
    c.style.strokeDashoffset = v == null ? C : C * (1 - v / 100);
    $("[data-s-score]").textContent = v == null ? "–" : v;
    if (label) $("[data-s-score-label]").textContent = label;
  }
  function addFeed(kind, title, text, chips) {
    var list = $("[data-s-feed]");
    var empty = $(".an-feed-empty", list); if (empty) empty.remove();
    var d = doc.createElement("div");
    d.className = "an-fi " + kind;
    d.innerHTML = '<span class="dot">' + (kind === "pass" ? ICON_CHECK : kind === "fail" ? "!" : ICON_SPARK) + '</span><div><div class="t">' + esc(title) + "</div>" + (text ? '<div class="e">' + esc(text) + "</div>" : "") + (chips ? '<div class="chips">' + chips + "</div>" : "") + "</div>";
    list.insertBefore(d, list.firstChild);
    feedN++;
    $("[data-s-count]").textContent = plural(feedN, "finding") + " · newest first";
    while (list.children.length > 40) list.removeChild(list.lastChild);
  }
  function barrierChips(ids, lib, max) {
    return (ids || []).slice(0, max || 3).map(function (b) {
      var x = lib.barriers && lib.barriers[b];
      return '<span class="chip b" title="' + esc(x ? tidy(x.description) : "") + '">' + esc(b + (x ? " " + tidy(x.name) : "")) + "</span>";
    }).join("");
  }
  function fillFirstLook(r) {
    var p = cleanPage(r.page);
    $("[data-s-host]").textContent = hostOf(r.url) || S.host;
    $("[data-s-title]").textContent = p.heroHeadline || p.title || r.host;
    var rows = [["Page", PAGE_TYPE[p.pageType] || "Page"], ["Title", p.title || "No title tag"], ["Main button", p.primaryCta || "None found"], ["Platform", p.platform || "Not detected"]];
    $("[data-s-kv]").innerHTML = rows.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("");
    var og = String(p.ogImage || "");
    if (/^https:\/\//i.test(og)) setShot(og, true);
  }
  function setShot(src, isOg) {
    var box = $("[data-s-shot]"); if (!box) return;
    var img = new Image();
    img.alt = isOg ? "Preview image from your page's tags" : "Your page on a phone";
    img.onload = function () { box.innerHTML = ""; box.appendChild(img); };
    img.src = src;
  }

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
      conversion: c.conversion,
      checks: (c.checks || []).map(function (k) { return { key: k.key, signal: k.signal, status: k.status, evidence: k.evidence }; }),
      ai: { readiness: c.ai && c.ai.readiness, agent: { score: c.ai && c.ai.agent && c.ai.agent.score }, llms: c.ai && c.ai.llms },
      stack: { score: c.stack && c.stack.score, tools: ((c.stack && c.stack.tools) || []).map(function (t) { return t.name; }) },
      lite: { speedEstimate: c.lite && c.lite.speedEstimate, a11yEstimate: c.lite && c.lite.a11yEstimate },
      library: c.library
    };
  }
  function runComps(r) {
    var list = S.inputs.competitors || [];
    return Promise.all(list.map(function (u) {
      return api("/scan", { url: u, role: "competitor", parent: r.slug, category: (r.page && r.page.category) || undefined }, { timeout: 45000 })
        .then(compactComp)
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
    buildStages();
    $("[data-s-feed]").innerHTML = '<div class="an-feed-empty">Findings land here as each check finishes.</div>';
    $("[data-s-count]").textContent = "Newest first";
    $("[data-s-done]").hidden = true;
    $("[data-s-status]").textContent = "Scanning"; $("[data-s-status]").classList.add("live");
    $("[data-s-host]").textContent = S.host;
    $("[data-s-title]").textContent = "Opening your page…";
    $("[data-s-kv]").innerHTML = "";
    setMiniScore(null, "Scoring as checks finish");
    startTimer();

    /* 1. open */
    stage("open", "run", S.host);
    var r;
    try { r = await S.scanP; } catch (e) { showError(e); return; }
    var det = r.page || {};
    var want = S.inputs;
    if ((want.category && want.category !== det.category) || (want.aovBand && want.aovBand !== det.aovBand)) {
      stage("open", "run", "Updating the scan for your answers");
      try { r = await api("/scan", { url: S.url, category: want.category || undefined, aovBand: want.aovBand || undefined, goal: want.goal }, { timeout: 45000 }); }
      catch (e) { /* keep the first read */ }
    }
    S.scan = r;
    var lib = r.library || { signals: {}, barriers: {}, rootCauses: {} };
    await sleep(500);
    stage("open", "done", (hostOf(r.url) || S.host) + (r.lite && r.lite.ttfbMs != null ? " answered in " + r.lite.ttfbMs + "ms" : " answered"));

    var psiP = runPsi(r.url);
    var compP = runComps(r);

    /* 2. structure */
    stage("structure", "run");
    fillFirstLook(r);
    await sleep(1000);
    var p = r.page || {};
    stage("structure", "done", [PAGE_TYPE[p.pageType] || "Page", plural(p.words || 0, "word"), plural((p.images && p.images.total) || 0, "image")].join(" · "));
    if (p.rendered === "client") addFeed("info", "Your page builds most of its content with JavaScript", "We read what's in the page's HTML. Checks that need the rendered page are left out of the score, never counted as failures.");

    /* 3. business */
    stage("business", "run");
    await sleep(900);
    stage("business", "done", [p.category || "Category not detected", p.aovBand ? bandLabel(p.aovBand) : "", p.platform].filter(Boolean).join(" · "));

    /* 4. signals */
    var checks = (r.checks || []).filter(function (c) { return !/^SIG-(MOB|A11Y)/.test(c.signal); });
    stage("signals", "run", "0 of " + checks.length);
    var tw = 0, fw = 0;
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i], s = lib.signals[c.signal] || {};
      var w = Math.max(1, Math.min(3, s.severity || 2));
      tw += w; if (c.status === "fail") fw += w;
      if (c.status === "fail") addFeed("fail", tidy(s.name) || c.key, c.evidence, barrierChips(s.barriers, lib, 2));
      else addFeed("pass", c.evidence, "", "");
      setMiniScore(Math.round(100 * (1 - fw / tw)), "Conversion, so far");
      stage("signals", "run", (i + 1) + " of " + checks.length);
      await sleep(checks.length > 16 ? 330 : 430);
    }
    var conv = r.conversion || {};
    stage("signals", "done", checks.length ? conv.passed + " passed · " + conv.failed + " to fix" : "Not enough page content to check");

    /* 5. barriers */
    stage("barriers", "run");
    await sleep(800);
    var bHit = {};
    checks.forEach(function (c) { if (c.status !== "fail") return; var s = lib.signals[c.signal] || {}; (s.barriers || []).forEach(function (b) { bHit[b] = (bHit[b] || 0) + 1; }); });
    var bIds = Object.keys(bHit).sort(function (a, b) { return bHit[b] - bHit[a]; });
    stage("barriers", "done", bIds.length ? plural(bIds.length, "barrier") + ": " + bIds.slice(0, 3).map(function (b) { return b + (lib.barriers[b] ? " " + tidy(lib.barriers[b].name) : ""); }).join(", ") : "No barrier tags on the failed checks");

    /* 6. speed */
    stage("speed", "run", "Google PageSpeed, mobile");
    var skipTimer = setTimeout(function () {
      var el = $('[data-stage="speed"] .d');
      if (!el || stState.speed !== "run") return;
      el.innerHTML = "Still measuring. <button class=\"skipbtn\" type=\"button\" data-skip-psi>Use an estimate instead</button>";
      var b = $("[data-skip-psi]"); if (b) b.addEventListener("click", function () { if (S.psiSkip) S.psiSkip(); });
    }, 15000);
    var psi = await psiP;
    clearTimeout(skipTimer);
    S.psi = psi;
    if (psi) {
      (psi.findings || []).filter(function (f) { return f.area === "speed"; }).forEach(function (f) { var s = lib.signals[f.signal] || {}; addFeed("fail", tidy(s.name) || "Speed", f.evidence, ""); });
      var m = psi.metrics || {};
      stage("speed", "done", "Performance " + psi.scores.performance + "/100" + (m.lcp ? " · largest content at " + (m.lcp / 1000).toFixed(1) + "s" : ""));
    } else {
      var lt = r.lite || {};
      addFeed("info", "Speed estimated from your page's code", "Google PageSpeed was busy, so we estimated speed from server response, page weight and scripts: " + (lt.speedEstimate != null ? lt.speedEstimate + "/100." : "no estimate."));
      stage("speed", "est", "Estimated from your page's code: " + (lt.speedEstimate != null ? lt.speedEstimate + "/100" : "n/a"));
    }

    /* 7. search and AI */
    stage("search", "run");
    await sleep(800);
    var ai = r.ai || {};
    (ai.checks || []).filter(function (x) { return !x.pass; }).slice(0, 3).forEach(function (x) { addFeed("fail", x.label, x.detail || "", ""); });
    stage("search", "done", "Readiness " + (ai.readiness != null ? ai.readiness : "n/a") + "/100 · agent readiness " + (ai.agent && ai.agent.score != null ? ai.agent.score : "n/a") + "/100");

    /* 8. accessibility */
    stage("a11y", "run");
    await sleep(700);
    if (psi && psi.scores.accessibility != null) {
      (psi.findings || []).filter(function (f) { return f.area === "accessibility"; }).slice(0, 2).forEach(function (f) { var s = lib.signals[f.signal] || {}; addFeed("fail", tidy(s.name) || "Accessibility", f.evidence, ""); });
      stage("a11y", "done", "Accessibility " + psi.scores.accessibility + "/100 (Google Lighthouse)");
    } else {
      var lt2 = r.lite || {};
      if (lt2.a11yIssues && lt2.a11yIssues.length) addFeed("fail", "Accessibility gaps in the page's code", lt2.a11yIssues.slice(0, 3).join(", ") + ".", "");
      stage("a11y", "est", "Estimated from your page's code: " + (lt2.a11yEstimate != null ? lt2.a11yEstimate + "/100" : "n/a"));
    }

    /* 9. compare */
    var nComp = (S.inputs.competitors || []).length;
    stage("compare", "run", nComp ? "Reading " + plural(nComp, "competitor") : "Matching your category benchmark");
    var comps = await compP;
    S.comps = comps;
    await sleep(600);
    var okComps = comps.filter(function (c) { return !c.error; });
    var cDetail = nComp ? (okComps.length ? "Compared with " + okComps.map(function (c) { return c.host; }).join(" and ") : "We couldn't read the competitor pages") : "";
    var bm = r.benchmark;
    cDetail = [cDetail, bm ? "Benchmark: " + bm.category + ", " + bandLabel(bm.band) : "No benchmark for this category and price band"].filter(Boolean).join(" · ");
    stage("compare", "done", cDetail);

    /* 10. plan */
    stage("plan", "run");
    S.report = buildReport(r, psi, comps);
    var C = compute(S.report);
    var T = testsOf(S.report, findingsOf(S.report));
    await sleep(900);
    stage("plan", "done", T.length ? plural(T.length, "test") + " planned, starting " + fmtDate(nextMonday(new Date())) : "Nothing urgent to test");
    clearInterval(tickT);
    setMiniScore(C.total, "Website score");
    $("[data-s-status]").textContent = "Done"; $("[data-s-status]").classList.remove("live");
    $("[data-s-done]").hidden = false;
    S.running = false;
    saveReport();
    var openBtn = $("[data-s-open]");
    if (openBtn) openBtn.onclick = function () { openReport(S.report, { mode: "live" }); };
    await sleep(1600);
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
  function compute(R) {
    var areas = [];
    var conv = R.conversion && R.conversion.score != null ? R.conversion.score : null;
    areas.push({ key: "conversion", name: "Conversion", w: 40, v: conv, src: conv == null ? "Not measured: content loads with JavaScript" : R.conversion.passed + " of " + R.conversion.applicable + " checks passed" });
    var ps = R.psi && R.psi.scores ? R.psi.scores : null;
    if (ps && ps.performance != null) areas.push({ key: "speed", name: "Speed", w: 20, v: ps.performance, src: "Google PageSpeed, mobile" });
    else areas.push({ key: "speed", name: "Speed", w: 20, v: R.lite ? R.lite.speedEstimate : null, est: true, src: "Estimated from your page's code" });
    var aiChecks = (R.ai && R.ai.checks) || [];
    areas.push({ key: "search", name: "Search & AI", w: 20, v: R.ai ? R.ai.readiness : null, src: aiChecks.filter(function (x) { return x.pass; }).length + " of " + aiChecks.length + " checks passed" });
    if (ps && ps.accessibility != null) areas.push({ key: "a11y", name: "Accessibility", w: 20, v: ps.accessibility, src: "Google Lighthouse" });
    else areas.push({ key: "a11y", name: "Accessibility", w: 20, v: R.lite ? R.lite.a11yEstimate : null, est: true, src: "Estimated from your page's code" });
    areas.push({ key: "agent", name: "Agent readiness", w: 0, v: R.ai && R.ai.agent ? R.ai.agent.score : null, ctx: true, src: "Shown, not scored" });
    areas.push({ key: "stack", name: "Growth stack", w: 0, v: R.stack ? R.stack.score : null, ctx: true, src: "Shown, not scored" });
    var tw = 0, tv = 0, est = false;
    areas.forEach(function (a) { if (a.w && a.v != null) { tw += a.w; tv += a.w * a.v; if (a.est) est = true; } });
    var total = tw ? Math.round(tv / tw) : null;
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
  function ringSvg(v, size) {
    var r = size === "sm" ? 52 : 74, box = size === "sm" ? 120 : 168, sw = size === "sm" ? 8 : 10, C = 2 * Math.PI * r;
    var off = v == null ? C : C * (1 - v / 100);
    return '<div class="ring' + (size === "sm" ? " sm" : "") + '"><svg viewBox="0 0 ' + box + " " + box + '" aria-hidden="true"><circle class="trk" cx="' + box / 2 + '" cy="' + box / 2 + '" r="' + r + '" stroke-width="' + sw + '"/><circle class="val" cx="' + box / 2 + '" cy="' + box / 2 + '" r="' + r + '" stroke-width="' + sw + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-off="' + off.toFixed(1) + '"/></svg><div class="num"><b>' + (v == null ? "–" : v) + "</b><span>/ 100</span></div></div>";
  }
  function radarSvg(areas) {
    var cx = 200, cy = 132, R = 92, n = areas.length, pts = [], axes = "", labels = "", grid = "";
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      var g = areas.map(function (a, i) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; return (cx + Math.cos(ang) * R * k).toFixed(1) + "," + (cy + Math.sin(ang) * R * k).toFixed(1); }).join(" ");
      grid += '<polygon points="' + g + '" fill="none" stroke="rgba(255,255,255,0.06)"/>';
    });
    areas.forEach(function (a, i) {
      var ang = -Math.PI / 2 + i * 2 * Math.PI / n, ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R;
      axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="' + (a.v == null ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)") + '"' + (a.v == null ? ' stroke-dasharray="3 4"' : "") + "/>";
      var lx = cx + Math.cos(ang) * (R + 22), ly = cy + Math.sin(ang) * (R + 16);
      var anchor = Math.abs(Math.cos(ang)) < 0.2 ? "middle" : Math.cos(ang) > 0 ? "start" : "end";
      labels += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11" fill="' + (a.v == null ? "#6F6C7C" : "#CFCCD9") + '" font-family="DM Sans, sans-serif">' + esc(a.name) + (a.v != null ? " " + a.v : "") + "</text>";
      if (a.v != null) pts.push((cx + Math.cos(ang) * R * a.v / 100).toFixed(1) + "," + (cy + Math.sin(ang) * R * a.v / 100).toFixed(1));
    });
    var poly = pts.length >= 3 ? '<polygon points="' + pts.join(" ") + '" fill="rgba(139,107,247,0.22)" stroke="#A68EFA" stroke-width="1.6" stroke-linejoin="round"/>' + pts.map(function (pt) { var xy = pt.split(","); return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3" fill="#CBBEFD"/>'; }).join("") : "";
    return '<svg viewBox="0 0 400 264" role="img" aria-label="Area scores">' + grid + axes + poly + labels + "</svg>";
  }
  function metricCls(v, good, ok) { return v == null ? "" : v <= good ? "good" : v <= ok ? "ok" : "bad"; }
  function ck(ok, label, detail, sub) {
    return '<div class="an-ck ' + (ok ? "ok" : "no") + '"><span class="i">' + (ok ? ICON_CHECK : "!") + "</span><span>" + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="dt">' + esc(detail || "") + "</span></div>";
  }

  function renderReport(R, opts) {
    opts = opts || {};
    var L = R.lib || { signals: {}, barriers: {}, rootCauses: {} };
    R.page = cleanPage(R.page);
    var P = R.page;
    var C = compute(R);
    var F = findingsOf(R);
    var T = testsOf(R, F);
    var host = hostOf(R.url) || String(R.host || "").replace(/^www\./, "");
    var created = R.createdAt ? new Date(R.createdAt) : new Date();
    var passes = (R.checks || []).filter(function (c) { return c.status === "pass" && !/^SIG-(MOB|A11Y)/.test(c.signal); });
    var h = "";

    /* banner for sample / shared */
    if (opts.mode === "sample") h += '<div class="wrap" style="padding-top:118px"><div class="an-banner"><span><b>Sample report.</b> A real TrooCRO scan of ' + (/myshopify\.com$/.test(host) ? "Shopify\u2019s public theme demo store (" + esc(host) + "), with category, order value and traffic filled in as an example" : esc(host)) + ", run on " + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })) + ". Live scans run when this site is hosted or opened from your computer.</span></div></div>";

    /* header */
    h += '<div class="wrap an-report"' + (opts.mode === "sample" ? ' style="padding-top:28px"' : "") + ">";
    h += '<div class="an-rhead"><div><span class="eyebrow">' + (opts.mode === "shared" ? "Shared website analysis" : "Website analysis") + '</span><h1 class="h1">Your report for <span>' + esc(host) + "</span></h1>";
    h += '<div class="an-rmeta"><span class="an-tag">' + esc(PAGE_TYPE[P.pageType] || "Page") + "</span>" + (P.category ? '<span class="an-tag">' + esc(P.category) + "</span>" : "") + (P.aovBand ? '<span class="an-tag">' + esc(bandLabel(P.aovBand)) + "</span>" : "") + (P.platform ? '<span class="an-tag">' + esc(P.platform) + "</span>" : "") + '<span class="an-tag">' + esc(created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</span></div></div>";
    h += '<div class="an-ractions">' + (opts.mode === "live" ? '<button class="btn btn-ghost btn-sm" type="button" data-share' + (S.saveState === "saved" ? "" : " disabled") + "><span>" + (S.saveState === "saved" ? "Copy share link" : S.saveState === "failed" ? "Link unavailable" : "Saving link…") + "</span></button>" : opts.mode === "shared" ? '<button class="btn btn-ghost btn-sm" type="button" data-share><span>Copy share link</span></button>' : "") + '' + (S.offline ? "" : '<button class="btn btn-ghost btn-sm" type="button" data-print>Save as PDF</button>') + '<button class="btn btn-light btn-sm" type="button" data-new>' + (opts.mode === "live" ? "Analyze another site" : "Run your own analysis") + "</button></div></div>";

    /* score */
    var shot = R.psi && R.psi.shots && R.psi.shots.final;
    var og = /^https:\/\//i.test(P.ogImage || "") ? P.ogImage : "";
    h += '<div class="an-score-grid">';
    h += '<div class="an-card an-score-main">' + ringSvg(C.total) + '<div><span class="an-label">Website score</span><div class="verdict" style="margin-top:8px">' + esc(C.verdict) + '</div><p class="an-sub">Across the areas we could measure on this page.' + (C.est ? ' Speed and accessibility are estimated.' : "") + '</p><details><summary>How the score works</summary><p>Your score blends conversion (40%), speed (20%), search and AI (20%) and accessibility (20%). An area we couldn’t measure is left out and the rest are re-weighted, never counted as zero. Agent readiness and growth stack are shown for context, not scored.' + (C.est ? " Speed and accessibility are estimated from your page’s code when Google PageSpeed isn’t available." : "") + "</p></details></div></div>";
    h += '<div class="an-card an-radar"><span class="an-label">Area scores</span>' + radarSvg(C.areas) + '<p class="an-note">Only measured areas are drawn. Dashed axes weren’t measured in this scan.</p></div>';
    h += '<div class="an-card an-phone"><span class="an-label" style="align-self:flex-start">Your first screen</span>';
    if (shot) h += '<div class="an-shot" style="margin-top:10px"><img src="' + esc(shot) + '" alt="Your page on a phone, as Google loaded it"></div><p class="cap">Your page on a phone, as Google’s browser loaded it.</p>';
    else if (og) h += '<img class="ogimg" src="' + esc(og) + '" alt="" data-hide-broken><div class="firsttext" style="margin-top:10px"><div class="h">' + esc(P.heroHeadline || P.title || host) + "</div>" + (P.primaryCta ? '<span class="b">' + esc(P.primaryCta) + "</span>" : "") + '</div><p class="cap">Read from your page’s HTML and preview tags.</p>';
    else h += '<div class="firsttext"><div class="h">' + esc(P.heroHeadline || P.title || host) + "</div>" + (P.primaryCta ? '<span class="b">' + esc(P.primaryCta) + "</span>" : "") + '</div><p class="cap">Read from your page’s HTML.</p>';
    h += "</div>";
    h += '<div class="an-areas">' + C.areas.map(function (a) {
      return '<div class="an-area' + (a.v == null ? " na" : "") + (a.ctx ? " ctx" : "") + '"><div class="top"><span class="nm">' + esc(a.name) + '</span><span class="w">' + (a.w ? a.w + "%" : "info") + '</span></div><div class="v">' + (a.v == null ? "Not measured" : a.v + "<small>/100</small>") + '</div><div class="bar"><i style="width:' + (a.v || 0) + "%;background:" + colorFor(a.v) + '"></i></div><div class="src">' + esc(a.src) + (a.est && a.v != null ? "" : "") + "</div></div>";
    }).join("") + "</div>";
    h += "</div>";

    /* findings */
    h += '<section class="an-rsec"><div class="an-sec-head"><div><span class="eyebrow">What we found, by priority</span><h2 class="h2">What’s costing ' + esc(host) + " sales</h2></div><p class=\"an-sub\">" + (F.length ? "Each finding names the buyer barrier behind it and the fix from the TrooCRO playbook. Highest priority first." : "No conversion failures on the checks we could run on this page.") + "</p></div>";
    if (F.length) {
      h += '<div class="an-find-list">' + F.map(function (f) {
        var s = f.sig || {}, fx = s.fix || {};
        var rc = s.rootCause ? tidy(s.rootCause) : "";
        var rcd = rc && L.rootCauses ? tidy(L.rootCauses[s.rootCause] || "") : "";
        var sols = (fx.solutions || []).map(function (x) { return "<li>" + esc(tidy(x)) + "</li>"; }).join("");
        return '<article class="an-find"><div class="row1"><span class="sev ' + f.prio.k + '">' + f.prio.l + '</span><span class="an-tag">' + esc(surfaceLabel(s, R, f.area)) + '</span><span class="an-label">' + esc(f.signal) + "</span></div>" +
          "<h3>" + esc(tidy(s.name) || f.key) + '</h3><p class="ev">' + esc(f.evidence) + "</p>" +
          '<div class="why"><div><b>Buyer barrier</b>' + ((s.barriers || []).length ? '<div class="chips">' + barrierChips(s.barriers, L, 3) + "</div>" + esc((s.barriers || []).slice(0, 2).map(function (b) { return L.barriers[b] ? "“" + tidy(L.barriers[b].description) + "”" : ""; }).filter(Boolean).join(" ")) : "Not tied to a single barrier: this one slows every shopper down.") + "</div><div><b>Root cause" + (rc ? ": " + esc(rc) : "") + "</b>" + esc(rcd || "From the TrooCRO signal library.") + "</div></div>" +
          (fx.playbook || sols ? "<details><summary>How we’d fix it</summary><div class=\"fix\">" + esc(tidy(fx.playbook)) + (sols ? "<ul>" + sols + "</ul>" : "") + '<div class="meta">' + (fx.effort ? '<span class="chip">Effort ' + esc({ S: "small", M: "medium", L: "large" }[fx.effort] || fx.effort) + "</span>" : "") + (fx.impact ? '<span class="chip">Impact ' + esc({ H: "high", M: "medium", L: "low" }[fx.impact] || fx.impact) + "</span>" : "") + (fx.testType ? '<span class="chip">' + esc(fx.testType === "A/B" ? "A/B test" : fx.testType + " test") + "</span>" : "") + "</div></div></details>" : "") +
          "</article>";
      }).join("") + "</div>";
    }
    if (passes.length) {
      h += '<div class="an-pass-list"><details><summary><span class="sev" style="color:var(--green)">What’s working</span> ' + plural(passes.length, "check") + " passed</summary><div class=\"an-pass-items\">" + passes.map(function (c) { var s = L.signals[c.signal] || {}; return "<div>" + ICON_CHECK + "<span><b>" + esc(tidy(s.name) || c.key) + "</b>" + esc(c.evidence) + "</span></div>"; }).join("") + "</div></details></div>";
    }
    h += "</section>";

    /* tests + roadmap */
    if (T.length) {
      var start = nextMonday(created);
      h += '<section class="an-rsec"><div class="an-sec-head"><div><span class="eyebrow">Your first tests</span><h2 class="h2">What we’d test first on ' + esc(host) + '</h2></div><p class="an-sub">In the order we’d run them. Each one names where it goes, what changes and why it should work.</p></div><div class="an-tests">';
      h += T.map(function (t, i) {
        var fx = t.f.sig.fix || {};
        return '<article class="an-test' + (i === 0 ? " first" : "") + '"><div class="tn"><span class="an-label">Test ' + t.n + (i === 0 ? " · we’d run this first" : "") + '</span><span class="sev ' + t.f.prio.k + '">' + t.f.prio.l + "</span></div><h3>" + esc(t.title) + "</h3><dl><div><dt>Where</dt><dd>" + esc(t.where) + "</dd></div><div><dt>Why it should work</dt><dd>" + esc(t.why) + "</dd></div><div><dt>How we’d measure it</dt><dd>" + esc(t.measure) + '</dd></div></dl><div class="chips">' + barrierChips(t.f.sig.barriers, L, 2) + (fx.effort ? '<span class="chip">Effort ' + esc({ S: "small", M: "medium", L: "large" }[fx.effort] || fx.effort) + "</span>" : "") + "</div></article>";
      }).join("");
      h += '</div><div class="an-card an-roadmap"><div class="an-sec-head" style="margin:0;display:block"><span class="an-label">Your plan, dated</span><p class="an-sub" style="margin-top:6px">If you started with TrooCRO this week. Every shipped change gets a 45-day and a 90-day check.</p></div><div class="an-road">' + T.map(function (t, i) {
        var s0 = addDays(start, i * 7);
        return "<div><b>Test " + t.n + " live " + esc(fmtDate(s0)) + "</b><span>" + esc(t.title.length > 70 ? t.title.slice(0, 68).replace(/\s+\S*$/, "") + "…" : t.title) + "</span><span>45-day check " + esc(fmtDate(addDays(s0, 45))) + " · 90-day check " + esc(fmtDate(addDays(s0, 90))) + "</span></div>";
      }).join("") + "</div></div></section>";
    }

    /* beyond conversion */
    h += '<section class="an-rsec"><div class="an-sec-head"><div><span class="eyebrow">Beyond conversion</span><h2 class="h2">Speed, search, AI agents and accessibility</h2></div><p class="an-sub">The things that decide whether shoppers, search engines and AI assistants get to your offer at all.</p></div><div class="an-beyond">';
    h += speedPanel(R) + searchPanel(R) + agentPanel(R) + a11yPanel(R);
    h += "</div>" + stackPanel(R) + "</section>";

    /* competitors */
    if ((R.comps || []).length) h += compSection(R, C);

    /* benchmark + calculator */
    h += benchSection(R);

    /* CTA */
    h += '<section class="an-rsec"><div class="an-cta-grid"><div class="an-card pad"><span class="an-label">Done the usual way</span><h3 class="an-h3" style="margin-top:12px">Each fix needs four people and a lot of handoffs.</h3><div class="an-roles">' +
      [["01", "A CRO analyst to find and size it"], ["02", "A designer to make it on brand"], ["03", "A developer to build it on your store"], ["04", "QA to check it on every device"]].map(function (x) { return '<div class="an-role"><span class="n">' + x[0] + "</span><span>" + esc(x[1]) + '</span><span class="h">handoff</span></div>'; }).join("") +
      '</div></div><div class="an-fixit"><span class="eyebrow" style="color:var(--text-2)">With TrooCRO</span><h2 class="h2">One team finds it, builds it and measures it.</h2><p>TrooCRO turns this report into shipped, tested changes on your store. You approve every change before it goes live.</p><div class="an-avgs"><div><b>6.4 days</b>CRO audit</div><div><b>3.7 days</b>UI/UX fix live</div><div><b>3.4 days</b>Experiment setup</div><div><b>12.9 days</b>Landing page</div></div><p class="an-note" style="margin-top:10px;color:var(--text-2);opacity:.7">Averages across Troopod’s delivered projects.</p><div class="btn-row"><a class="btn btn-light" href="contact.html?site=' + encodeURIComponent(host) + (R.slug ? "&amp;report=" + encodeURIComponent(R.slug) : "") + '">Fix it with TrooCRO</a><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + WA + "?text=" + encodeURIComponent("Hi TrooCRO, I ran the site analysis for " + host + (C.total != null ? " (score " + C.total + "/100)" : "") + " and want to talk about the fixes.") + '"><svg width="15" height="15"><use href="#i-wa"/></svg>WhatsApp us</a></div></div></div>';
    h += '<div class="an-card an-lead"><span class="an-label">Get the full fix plan</span><h3 class="an-h3" style="margin-top:10px">Want every fix sized and scheduled for ' + esc(host) + "?</h3><p class=\"an-sub\">Leave your details and the TrooCRO team will have this report when they reach you.</p><form data-lead novalidate><label class=\"an-input\"><span class=\"sr-only\">Name</span><input name=\"name\" type=\"text\" autocomplete=\"name\" placeholder=\"Your name\" required></label><label class=\"an-input\"><span class=\"sr-only\">Work email</span><input name=\"email\" type=\"email\" autocomplete=\"email\" placeholder=\"Work email\" required></label><input class=\"hp\" name=\"hp\" tabindex=\"-1\" autocomplete=\"off\" aria-hidden=\"true\"><button class=\"btn btn-primary\" type=\"submit\">Send it to the team</button></form><div class=\"an-err\" data-lead-err role=\"alert\"></div></div></section>";

    /* foot note */
    var nChecks = (R.checks || []).length;
    h += '<div class="an-foot-note"><p>This analysis ran on a lightweight version of the TrooCRO engine, from your page’s public HTML' + (R.psi ? " and Google PageSpeed" : "") + ". It checked " + plural(nChecks, "signal") + " that apply to a " + esc((PAGE_TYPE[P.pageType] || "page").toLowerCase()) + " in the TrooCRO library. A full TrooCRO diagnosis covers every page type, your analytics and funnel data, and all 937 signals across 79 buyer barriers.</p><p>Benchmarks come from the TrooCRO category benchmark library. Nothing was installed on your store.</p></div>";
    h += "</div>";
    return { html: h, C: C, F: F, T: T };
  }

  function speedPanel(R) {
    var psi = R.psi, lt = R.lite || {}, h = '<div class="an-panel"><div class="ph"><div><span class="an-label">Speed</span><h3 class="an-h4" style="margin-top:8px">' + (psi ? "Speed, from Google PageSpeed (mobile)" : "Speed, estimated from your page’s code") + "</h3></div>";
    if (psi) {
      var m = psi.metrics || {};
      h += '<div class="big" style="color:' + colorFor(psi.scores.performance) + '">' + psi.scores.performance + "<small>/100</small></div></div>";
      h += '<div class="an-metrics">' +
        '<div class="an-metric ' + metricCls(m.lcp, 2500, 4000) + '"><b>' + (m.lcp != null ? (m.lcp / 1000).toFixed(1) + "s" : "n/a") + "</b><span>Largest content (LCP)</span></div>" +
        '<div class="an-metric ' + metricCls(m.cls, 0.1, 0.25) + '"><b>' + (m.cls != null ? m.cls.toFixed(2) : "n/a") + "</b><span>Layout shift (CLS)</span></div>" +
        '<div class="an-metric ' + metricCls(m.tbt, 200, 600) + '"><b>' + (m.tbt != null ? Math.round(m.tbt) + "ms" : "n/a") + "</b><span>Blocking time (TBT)</span></div>" +
        '<div class="an-metric ' + metricCls(m.fcp, 1800, 3000) + '"><b>' + (m.fcp != null ? (m.fcp / 1000).toFixed(1) + "s" : "n/a") + "</b><span>First content (FCP)</span></div>" +
        '<div class="an-metric ' + metricCls(m.ttfb, 800, 1800) + '"><b>' + (m.ttfb != null ? Math.round(m.ttfb) + "ms" : "n/a") + "</b><span>Server response</span></div>" +
        '<div class="an-metric"><b>' + (m.weightKb != null ? (m.weightKb > 1024 ? (m.weightKb / 1024).toFixed(1) + " MB" : m.weightKb + " KB") : "n/a") + "</b><span>Page weight</span></div></div>";
      if ((psi.thirdParty || []).length) h += '<div class="an-checklist" style="margin-top:14px">' + psi.thirdParty.slice(0, 4).map(function (t) { return ck(t.blockingMs < 50, t.name, (t.blockingMs ? t.blockingMs + "ms blocking · " : "") + t.kb + " KB", ""); }).join("") + "</div>";
    } else {
      h += '<div class="big" style="color:' + colorFor(lt.speedEstimate) + '">' + (lt.speedEstimate != null ? lt.speedEstimate : "–") + "<small>/100 est.</small></div></div>";
      h += '<div class="an-metrics">' +
        '<div class="an-metric ' + metricCls(lt.ttfbMs, 600, 1200) + '"><b>' + (lt.ttfbMs != null ? lt.ttfbMs + "ms" : "n/a") + "</b><span>Server response</span></div>" +
        '<div class="an-metric ' + metricCls(lt.htmlKb, 300, 800) + '"><b>' + (lt.htmlKb != null ? lt.htmlKb + " KB" : "n/a") + "</b><span>HTML size</span></div>" +
        '<div class="an-metric ' + metricCls(lt.scripts, 20, 40) + '"><b>' + (lt.scripts != null ? lt.scripts : "n/a") + "</b><span>Script files</span></div>" +
        '<div class="an-metric ' + metricCls(lt.thirdPartyHosts, 10, 20) + '"><b>' + (lt.thirdPartyHosts != null ? lt.thirdPartyHosts : "n/a") + "</b><span>Third-party hosts</span></div>" +
        '<div class="an-metric ' + metricCls(lt.stylesheets, 6, 10) + '"><b>' + (lt.stylesheets != null ? lt.stylesheets : "n/a") + "</b><span>Stylesheets</span></div>" +
        '<div class="an-metric ' + metricCls(lt.imagesNoDims, 5, 12) + '"><b>' + (lt.imagesNoDims != null ? lt.imagesNoDims : "n/a") + "</b><span>Images without size</span></div></div>";
      h += '<p class="an-note" style="margin-top:14px">Google PageSpeed wasn’t available for this scan, so this is an estimate. A full TrooCRO diagnosis measures real load times on phones.</p>';
    }
    return h + "</div>";
  }
  function searchPanel(R) {
    var ai = R.ai || {}, list = ai.checks || [];
    return '<div class="an-panel"><div class="ph"><div><span class="an-label">Search and AI answers</span><h3 class="an-h4" style="margin-top:8px">Can search engines and AI assistants read you?</h3></div><div class="big" style="color:' + colorFor(ai.readiness) + '">' + (ai.readiness != null ? ai.readiness : "–") + '<small>/100</small></div></div><div class="an-checklist">' + list.map(function (x) { return ck(x.pass, x.label, x.detail, ""); }).join("") + "</div></div>";
  }
  function agentPanel(R) {
    var ai = R.ai || {}, ag = ai.agent || {}, P = R.page || {};
    var lines = ["# " + (P.title || hostOf(R.url))];
    if (P.description) lines.push(P.description);
    lines.push("");
    if ((P.h1 || []).length) lines.push("H1: " + P.h1[0]);
    if (P.primaryCta) lines.push("Main action: " + P.primaryCta);
    if (P.prices) lines.push("Prices found: " + P.prices + (P.aov ? " (typical " + inr(P.aov) + ")" : ""));
    if (P.rating && P.rating.value) lines.push("Rating: " + P.rating.value + " from " + P.rating.count + " reviews");
    if ((ai.ldTypes || []).length) lines.push("Structured data: " + ai.ldTypes.slice(0, 6).join(", "));
    lines.push("llms.txt: " + (ai.llms ? "found" : "missing") + " · sitemap: " + (ai.sitemap ? "found" : "missing"));
    return '<div class="an-panel"><div class="ph"><div><span class="an-label">AI agents</span><h3 class="an-h4" style="margin-top:8px">How AI agents see ' + esc(hostOf(R.url) || R.host) + '</h3></div><div class="big" style="color:' + colorFor(ag.score) + '">' + (ag.score != null ? ag.score : "–") + '<small>/100</small></div></div><div class="an-checklist">' + (ag.checks || []).map(function (x) { return ck(x.pass, x.label, "", ""); }).join("") + '</div><div class="an-agentread" aria-label="What an agent reads">' + esc(lines.join("\n")) + "</div></div>";
  }
  function a11yPanel(R) {
    var psi = R.psi, lt = R.lite || {}, v, rows = "";
    var base = (R.checks || []).filter(function (c) { return /^SIG-(MOB|A11Y)/.test(c.signal); });
    if (psi && psi.scores.accessibility != null) {
      v = psi.scores.accessibility;
      rows = (psi.a11yFails || []).slice(0, 7).map(function (x) { return ck(false, x.title, x.count ? plural(x.count, "element") : "", ""); }).join("");
      if (!rows) rows = ck(true, "No failing accessibility audits", "", "");
    } else {
      v = lt.a11yEstimate;
      rows = (lt.a11yIssues || []).map(function (x) { return ck(false, x, "", ""); }).join("");
      rows += base.map(function (c) { return ck(c.status === "pass", c.evidence, "", ""); }).join("");
      if (!rows) rows = ck(true, "No accessibility gaps found in the page’s code", "", "");
    }
    return '<div class="an-panel"><div class="ph"><div><span class="an-label">Accessibility</span><h3 class="an-h4" style="margin-top:8px">' + (psi && psi.scores.accessibility != null ? "Accessibility, from Google Lighthouse" : "Accessibility, estimated from your page’s code") + '</h3></div><div class="big" style="color:' + colorFor(v) + '">' + (v != null ? v : "–") + "<small>/100" + (psi && psi.scores.accessibility != null ? "" : " est.") + '</small></div></div><div class="an-checklist">' + rows + "</div></div>";
  }
  function stackPanel(R) {
    var st = R.stack || {}, ess = st.essentials || [];
    var tools = (st.tools || []).map(function (t) { return t.name; });
    var hint = { analytics: "Without it you can’t see where shoppers drop.", behavior: "Heatmaps and recordings show what shoppers actually do.", ads: "Pixels let ad platforms learn who buys.", retention: "Bring shoppers back after the first visit.", reviews: "Reviews answer the trust question at the decision.", experiments: "Testing proves which changes earn more." };
    return '<div class="an-panel" style="margin-top:12px"><div class="ph"><div><span class="an-label">Growth stack</span><h3 class="an-h4" style="margin-top:8px">The tools we can see on your page</h3><p class="an-sub">' + (tools.length ? esc(tools.join(", ")) : "No marketing or analytics tools found in the page’s code.") + '</p></div><div class="big" style="color:' + colorFor(st.score) + '">' + (st.score != null ? st.score : "–") + '<small>/100</small></div></div><div class="an-tools three">' + ess.map(function (e) {
      var on = (e.found || []).length > 0;
      return '<div class="an-tool' + (on ? " on" : "") + '"><div class="k"><i></i>' + esc(e.label) + '</div><div class="f">' + (on ? esc(e.found.join(", ")) : esc(hint[e.key] || "Not found")) + "</div></div>";
    }).join("") + "</div></div>";
  }
  function compSection(R, C) {
    var comps = R.comps || [], L = R.lib || { signals: {} };
    var you = { host: hostOf(R.url) || R.host, conv: R.conversion, ai: R.ai ? R.ai.readiness : null, agent: R.ai && R.ai.agent ? R.ai.agent.score : null, stack: R.stack ? R.stack.score : null, speed: R.lite ? R.lite.speedEstimate : null };
    function cell(v) { return v == null ? '<span class="na">n/a</span>' : esc(v) + "<span class=\"na\">/100</span>"; }
    function convCell(c) { return c && c.applicable ? esc(c.passed + " of " + c.applicable) : '<span class="na">n/a</span>'; }
    var rows = '<tr class="you"><td>' + esc(you.host) + " (you)</td><td>" + convCell(you.conv) + "</td><td>" + cell(you.ai) + "</td><td>" + cell(you.agent) + "</td><td>" + cell(you.stack) + "</td><td>" + cell(you.speed) + "</td></tr>";
    var ahead = "";
    var mine = {}; (R.checks || []).forEach(function (c) { mine[c.key] = c; });
    comps.forEach(function (c) {
      if (c.error) { rows += "<tr><td>" + esc(hostOf(c.url) || c.host) + '</td><td colspan="5" class="na">' + esc(c.error) + "</td></tr>"; return; }
      rows += "<tr><td>" + esc(hostOf(c.url) || c.host) + "</td><td>" + convCell(c.conversion) + "</td><td>" + cell(c.ai.readiness) + "</td><td>" + cell(c.ai.agent.score) + "</td><td>" + cell(c.stack.score) + "</td><td>" + cell(c.lite.speedEstimate) + "</td></tr>";
      var theyWin = [], youWin = [];
      (c.checks || []).forEach(function (k) {
        var m = mine[k.key]; if (!m) return;
        var nm = tidy((L.signals[k.signal] || {}).name) || k.key;
        if (k.status === "pass" && m.status === "fail") theyWin.push(k.evidence ? dec(k.evidence) : "They pass: " + nm);
        if (k.status === "fail" && m.status === "pass") youWin.push(m.evidence ? dec(m.evidence) : "You pass: " + nm);
      });
      ahead += "<div><b>Where " + esc(hostOf(c.url) || c.host) + " is ahead</b>" + (theyWin.length ? "<ul>" + theyWin.slice(0, 5).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "Nowhere on the checks we could compare.") + "</div>";
      ahead += "<div><b>Where you’re ahead of " + esc(hostOf(c.url) || c.host) + "</b>" + (youWin.length ? "<ul>" + youWin.slice(0, 5).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "Nowhere on the checks we could compare.") + "</div>";
    });
    return '<section class="an-rsec"><div class="an-sec-head"><div><span class="eyebrow">You and your competitors</span><h2 class="h2">How you compare, page to page</h2></div><p class="an-sub">Their homepages, read today with the same engine. Speed here is estimated from each page’s code for all sites, so the comparison is fair.</p></div><div class="an-card an-comp"><table><thead><tr><th>Site</th><th>Conversion checks passed</th><th>Search &amp; AI</th><th>Agent readiness</th><th>Growth stack</th><th>Speed (est.)</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="an-ahead">' + ahead + "</div></section>";
  }
  function benchSection(R) {
    var b = R.benchmark, P = R.page || {};
    var visitors = (R.inputs && R.inputs.visitors) || 30000;
    var cr = b && b.cvr ? b.cvr : 1.5;
    var aov = P.aov || ({ "< ₹500": 400, "₹500–₹2,000": 1200, "₹2,000–₹5,000": 3200, "₹5,000+": 7500 }[P.aovBand] || 1500);
    var h = '<section class="an-rsec"><div class="an-bench-grid">';
    if (b) {
      h += '<div class="an-panel"><span class="an-label">Category benchmark</span><h3 class="an-h4" style="margin-top:8px">How ' + esc(b.category) + " stores at " + esc(bandLabel(b.band)) + ' usually convert</h3><div class="an-funnel">' +
        [["Add-to-cart rate", b.atc, 12], ["Cart to checkout", b.cartToCheckout, 100], ["Checkout to purchase", b.checkoutToPurchase, 100], ["Store conversion", b.cvr, 5]].map(function (x) { return '<div class="an-fun"><span>' + esc(x[0]) + '</span><span class="b"><i style="width:' + Math.min(100, (x[1] || 0) / x[2] * 100).toFixed(0) + '%"></i></span><b>' + esc(x[1] != null ? x[1] + "%" : "n/a") + "</b></div>"; }).join("") +
        '</div><p class="an-note" style="margin-top:14px">From the TrooCRO category benchmark library. Use them as a yardstick for your own analytics.</p></div>';
    } else {
      h += '<div class="an-panel"><span class="an-label">Category benchmark</span><h3 class="an-h4" style="margin-top:8px">No benchmark for this page yet</h3><p class="an-sub">We match benchmarks on category and order value in rupees. Pick both in the quick questions to see how stores like yours convert.</p></div>';
    }
    h += '<div class="an-panel" data-calc><span class="an-label">What a lift is worth</span><h3 class="an-h4" style="margin-top:8px">Put your own numbers in</h3><div class="an-calc"><label>Monthly visitors<span class="an-input"><input type="number" min="0" step="1000" value="' + esc(visitors) + '" data-c-v></span></label><label>Conversion rate %<span class="an-input"><input type="number" min="0" step="0.1" value="' + esc(cr) + '" data-c-cr></span></label><label>Average order ₹<span class="an-input"><input type="number" min="0" step="50" value="' + esc(Math.round(aov)) + '" data-c-aov></span></label></div><div class="an-calc-out"><span class="an-label">If fixes lift conversion by 10%</span><div class="big" data-c-out>–</div><p data-c-sub></p></div></div>';
    return h + "</div></section>";
  }

  function wireReport(root, R, out) {
    $$(".ring .val", root).forEach(function (c) { requestAnimationFrame(function () { requestAnimationFrame(function () { c.style.strokeDashoffset = c.getAttribute("data-off"); }); }); });
    $$("[data-hide-broken]", root).forEach(function (img) { img.addEventListener("error", function () { img.remove(); }); });
    var share = $("[data-share]", root);
    if (share) share.addEventListener("click", function () {
      if (!R.slug) return;
      var base = win.location.protocol === "file:" ? "" : win.location.origin + win.location.pathname;
      if (!base) { toast("Share links work once the site is hosted."); return; }
      copyText(base + "?r=" + R.slug).then(function () { toast("Link copied"); }, function () { toast("Couldn't copy. The link is " + base + "?r=" + R.slug); });
    });
    var pr = $("[data-print]", root); if (pr) pr.addEventListener("click", function () { win.print(); });
    var nb = $("[data-new]", root); if (nb) nb.addEventListener("click", function () { setQuery(""); urlIn.value = ""; show("start"); urlIn.focus(); });
    var calc = $("[data-calc]", root);
    if (calc) {
      var fv = $("[data-c-v]", calc), fc = $("[data-c-cr]", calc), fa = $("[data-c-aov]", calc), o = $("[data-c-out]", calc), sub = $("[data-c-sub]", calc);
      var upd = function () {
        var rev = (+fv.value || 0) * ((+fc.value || 0) / 100) * (+fa.value || 0);
        var gain = rev * 0.1;
        o.textContent = "+" + inr(gain) + " a month";
        sub.textContent = "About " + inr(gain * 12) + " a year, on " + inr(rev) + " of monthly revenue from this traffic.";
      };
      [fv, fc, fa].forEach(function (x) { x.addEventListener("input", upd); }); upd();
    }
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
