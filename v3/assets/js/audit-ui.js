/* TrooCRO page audit report (CRO core spec): three separate reads, one tab each (CRO, Design, Speed). Layout and look from
   her Design canvas (claude.ai artifact GWDFAzcX9WPTP3RkCqxu4t, 28 Nov 2026): underline tabs with a number pill each,
   cards with a hover spotlight, the first card of each tab with a moving glow border, numbers that count up.
   There is no combined score. Brand-facing text only: no codes. */
(function (win) {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ms = function (v) { return v == null ? "not measured" : v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms"; };
  var tone = function (l) { l = String(l || "").toLowerCase(); return /good|strong|fast|^met/.test(l) ? "ok" : /needs|moderate|partial|average/.test(l) ? "mid" : /poor|weak|missing|slow/.test(l) ? "bad" : "none"; };
  var money = function (p, c) { return p == null ? "" : (c === "INR" ? "₹" : c === "USD" ? "$" : (c || "") + " ") + Number(p).toLocaleString("en-IN"); };
  var sc = function (v) { return v ? (v >= 4 ? "ok" : v >= 3 ? "mid" : "bad") : "none"; };
  var sev = { critical: "bad", major: "mid", minor: "low" }, word = { critical: "Critical", major: "Major", minor: "Minor" };
  var pill = function (t, txt) { return '<span class="rx-pill p-' + t + '">' + esc(txt) + "</span>"; };
  var count = function (v, dec) { return '<b class="rx-big" data-rx-count="' + v + '" data-rx-dec="' + (dec || 0) + '">' + Number(v).toFixed(dec || 0) + "</b>"; };
  var head = function (h, sub) { return '<div class="rx-sh"><h2>' + h + "</h2>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>"; };
  function counts(c) { var miss = (c.missing || []).length, part = (c.partial || []).length, met = c.met || 0; return { miss: miss, part: part, met: met, tot: miss + part + met }; }

  /* ---------------- tabs: underline, one number pill each ---------------- */
  function tab(id, label, t, txt) {
    return '<button type="button" class="rx-tab" role="tab" id="rx-t-' + id + '" aria-controls="rx-p-' + id + '" data-au-tab="' + id + '"><span>' + label + '</span><span class="rx-tn c-' + t + '">' + esc(txt) + "</span></button>";
  }
  function tabs(P) {
    var n = counts(P.customer || {}), u = P.ui || {}, s = P.speed || {};
    var cro = n.miss ? ["bad", n.miss + " doubt" + (n.miss > 1 ? "s" : "")] : n.part ? ["mid", n.part + " in part"] : ["ok", "All answered"];
    var des = u.average == null ? ["none", "Not scored"] : [tone(u.label), u.average.toFixed(1) + " / 5"];
    var spd = s.score == null ? ["none", "Not measured"] : [s.score >= 90 ? "ok" : s.score >= 50 ? "mid" : "bad", s.score + " / 100"];
    return '<div class="rx-tabs" role="tablist" aria-label="Audit sections">' + tab("cro", "CRO", cro[0], cro[1]) + tab("design", "Design", des[0], des[1]) + tab("speed", "Speed", spd[0], spd[1]) + "</div>";
  }

  /* ---------------- CRO tab ---------------- */
  function croPanel(c, R) {
    var n = counts(c), miss = c.missing || [], part = c.partial || [], B = R.buyers || {}, p0 = (B.personas || [])[0];
    var st = n.miss ? ["bad", "Likely losing buyers"] : n.part ? ["mid", "Some doubts open"] : ["ok", "Doubts answered"];
    var x = '<div class="rx-grid g300">';
    x += '<article class="rx-card glow rx-col16"><div class="rx-ch"><span class="rx-k">Buyer doubts</span>' + pill(st[0], st[1]) + '</div><div class="rx-num">' + count(n.miss) + "<span>of " + n.tot + ' left unanswered</span></div><div class="rx-stack" aria-hidden="true"><i class="gx b-bad" style="flex:' + n.miss + '"></i><i class="gx b-mid" style="flex:' + n.part + '"></i><i class="gx b-ok" style="flex:' + n.met + '"></i></div><div class="rx-leg"><span><b class="c-bad">' + n.miss + '</b> not answered</span><span><b class="c-mid">' + n.part + '</b> in part</span><span><b class="c-ok">' + n.met + "</b> answered</span></div></article>";
    x += '<article class="rx-card"><span class="rx-k">Main cause</span>' + (c.main_cause ? '<h3 class="rx-h24">' + esc(c.main_cause.label) + '</h3><p class="rx-t">' + esc(c.main_cause.description) + "</p>" : '<h3 class="rx-h24">No single cause</h3>') +
      ((c.next_causes || []).length ? '<span class="rx-k rx-k2">Also behind it</span><div class="rx-chips">' + c.next_causes.map(function (q) { return "<span>" + esc(q.label) + "</span>"; }).join("") + "</div>" : "") + "</article>";
    x += '<article class="rx-card"><div class="rx-ch"><span class="rx-k">Who buys this</span><span class="rx-k">' + (B.source === "reviews" ? "From your reviews" : B.source === "stated" ? "Chosen by you" : "From category") + "</span></div>" +
      (p0 ? '<h3 class="rx-h20">' + esc(p0.label) + '</h3><p class="rx-t">' + esc(p0.worry) + "</p>" : '<p class="rx-t">No buyer type for this category.</p>') +
      ((B.personas || []).length > 1 ? '<p class="rx-m">Also: ' + B.personas.slice(1).map(function (q) { return esc(q.label); }).join(", ") + "</p>" : "") + "</article></div>";
    if (miss.length || part.length) x += '<section class="rx-sec">' + head("Open buyer doubts", "Questions a shopper is likely asking that the page doesn’t settle yet.") + '<div class="rx-grid g340">' + doubtCol("Not answered on the page", "bad", "Not answered", miss) + doubtCol("Answered only in part", "mid", "In part", part) + "</div></section>";
    var first = (p0 && p0.label.toLowerCase()) || "a first-time shopper";
    x += '<section class="rx-sec">' + head("What to change first", "Ranked by how much each one likely blocks a sale for " + esc(first) + ".") + changes(R.changes || []) + "</section>";
    x += findingsSec(R.findings || []);
    if (B.worries && B.worries.length) x += '<section class="rx-sec">' + head("What reviewers ask about") + '<article class="rx-card rx-list">' + B.worries.slice(0, 6).map(function (w) { return '<div class="rx-li"><i class="b-mid"></i><div><b>' + esc(w.worry) + "</b><span>" + w.mentions + " review" + (w.mentions > 1 ? "s" : "") + "</span></div></div>"; }).join("") + "</article></section>";
    return x;
  }
  /* Every failed check, grouped by root cause, P0 first, so the team sees all the scan saw and picks (Neeraj, 29 Nov:
     "give all, P0 P1 P2, across all root causes") */
  var IMP = { High: ["bad", 0, "P0"], Medium: ["mid", 1, "P1"], Lower: ["none", 2, "P2"] }, CHK = { confirmed: "Double-checked", unconfirmed: "Not double-checked", disagreed: "Second check disagreed", single: "" };
  function findingsSec(F) {
    if (!F.length) return "";
    var groups = {}; F.forEach(function (f) { (groups[f.cause] = groups[f.cause] || []).push(f); });
    var order = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
    var n = function (imp) { return F.filter(function (f) { return f.impact === imp; }).length; };
    return '<section class="rx-sec">' + head("Everything we found", F.length + " checks this page fails: " + n("High") + " P0 (high impact), " + n("Medium") + " P1 (medium), " + n("Lower") + " P2 (lower). Grouped by what is behind them.") +
      '<div class="rx-fgroups">' + order.map(function (c, gi) {
        var L = groups[c].slice().sort(function (a, b) { return IMP[a.impact][1] - IMP[b.impact][1]; });
        var cnt = ["High", "Medium", "Lower"].map(function (k) { var m = L.filter(function (f) { return f.impact === k; }).length; return m ? IMP[k][2] + " " + m : ""; }).filter(Boolean).join(" · ");
        return '<details class="rx-card rx-fg"' + (gi === 0 ? " open" : "") + '><summary><b>' + esc(c) + '</b><span class="rx-k">' + L.length + " check" + (L.length > 1 ? "s" : "") + " · " + cnt + '</span><i class="rx-chev" aria-hidden="true"></i></summary>' +
          L.map(function (f) {
            return '<div class="rx-frow"><span class="rx-pill p-' + IMP[f.impact][0] + '">' + IMP[f.impact][2] + " · " + f.impact + '</span><div class="rx-fm"><b>' + esc(f.name) + (f.from_reviews ? ' <em class="rx-rev">From your reviews</em>' : "") + "</b>" + (f.saw ? '<span class="rx-m">' + esc(f.saw) + "</span>" : "") +
              ((f.doubts || []).length || CHK[f.checked] ? '<div class="rx-ftags">' + (f.doubts || []).map(function (d) { return "<span>" + esc(d) + "</span>"; }).join("") + (CHK[f.checked] ? '<span class="c-' + f.checked + '">' + CHK[f.checked] + "</span>" : "") + "</div>" : "") + "</div></div>";
          }).join("") + "</details>";
      }).join("") + "</div></section>";
  }
  function doubtCol(title, t, p, list) {
    return '<article class="rx-card rx-list"><div class="rx-ch rx-lh"><b>' + title + "</b>" + pill(t, p) + "</div>" + (list.length ? list.map(function (b) { return '<div class="rx-li"><i class="b-' + t + '"></i><div><b>' + esc(b.name) + "</b>" + (b.question ? "<span>" + esc(b.question) + "</span>" : "") + "</div></div>"; }).join("") : '<p class="rx-m">None.</p>') + "</article>";
  }
  function changes(list) {
    if (!list.length) return '<p class="rx-m">No change was confirmed by the second read, so none is listed.</p>';
    return '<div class="rx-changes">' + list.map(function (c, i) {
      return '<article class="rx-card rx-chg' + (i >= 5 ? " more" : "") + '"' + (i >= 5 ? " hidden" : "") + '><span class="rx-n">' + (i + 1) + '</span><div class="rx-cm"><h3>' + esc(c.title) + (c.from_reviews ? ' <em class="rx-rev">From your reviews</em>' : "") + (c.checked ? ' <em class="rx-dc">Double-checked</em>' : "") + "</h3>" + (c.change ? '<p class="rx-t">' + esc(c.change) + "</p>" : "") + (c.why ? '<p class="rx-m">' + esc(c.why) + "</p>" : "") + "</div>" +
        (c.evidence ? '<div class="rx-ev"><span>On the page now</span><p>' + esc(c.evidence) + "</p></div>" : "") + "</article>";
    }).join("") + "</div>" + (list.length > 5 ? '<button type="button" class="rx-btn ghost sm" data-au-more>Show ' + (list.length - 5) + " more</button>" : "");
  }

  /* ---------------- Design tab ---------------- */
  function segs(score) { var t = sc(score), out = ""; for (var k = 1; k <= 5; k++) out += '<i class="gx ' + (score && k <= score ? "b-" + t : "b-off") + '"></i>'; return '<div class="rx-segs" aria-hidden="true">' + out + "</div>"; }
  function designPanel(u, A) {
    if (u.average == null) return '<article class="rx-card"><span class="rx-k">Design</span><p class="rx-t">' + esc(u.note || "Not scored: no screenshot of the page could be taken.") + "</p></article>";
    var x = '<div class="rx-grid g360"><article class="rx-card glow rx-col16"><div class="rx-ch"><span class="rx-k">UI alignment</span>' + pill(tone(u.label), u.label) + '</div><div class="rx-num">' + count(u.average, 1) + "<span>/ 5</span></div>" + (u.recommendation ? '<p class="rx-t">' + esc(u.recommendation) + "</p>" : "") +
      '<div class="rx-bars" aria-hidden="true">' + u.params.map(function (p) { return '<i class="gy b-' + (p.score ? sc(p.score) : "off") + '" style="height:' + (p.score ? Math.min(56, p.score * 13) : 6) + 'px"></i>'; }).join("") + "</div></article>";
    x += '<article class="rx-card rx-list"><div class="rx-lh"><b>Fix first</b></div>' + ((u.issues || []).length ? u.issues.map(function (i) { return '<div class="rx-li rx-fix"><span class="rx-sp c-' + sc(i.score) + '">' + (i.score ? i.score + "/5" : "–") + "</span><div><b>" + esc(i.label) + "</b><span>" + esc(i.note) + "</span></div></div>"; }).join("") : '<p class="rx-m">No design check scored low.</p>') + "</article></div>";
    x += '<section class="rx-sec">' + head("The nine design checks") + '<div class="rx-grid g320 tight">' + u.params.map(function (p) {
      return '<article class="rx-card rx-pc"><div class="rx-ch"><b>' + esc(p.label) + '</b><span class="rx-mono c-' + sc(p.score) + '">' + (p.score ? p.score + "/5" : "–") + "</span></div>" + segs(p.score) + (p.note ? '<p class="rx-m">' + esc(p.note) + "</p>" : "") + "</article>";
    }).join("") + "</div></section>";
    return x + annotated(A);
  }
  /* UI problems pinned on the page: numbered pins in a column beside the phone (they never cover the page), each joined
     to the phone's edge by a short line that ends at the problem's exact height; pins at nearly the same height are
     spread one pin apart so they never sit on each other. The picked one turns purple and its area is outlined. */
  function annotated(A) {
    if (!A || !(A.images || []).length || !(A.marks || []).length) return "";
    var desk = A.device === "Desktop";
    var shots = A.images.map(function (src, k) {
      return '<div class="rx-shot" data-au-k="' + k + '"' + (k ? " hidden" : "") + '><img src="' + esc(src) + '" alt="' + (desk ? "Desktop" : "Phone screen " + (k + 1)) + ' of your page" decoding="async">' +
        A.marks.map(function (m, i) { if (m.image !== k) return ""; var b = m.box; return '<span class="rx-area" data-au-m="' + i + '" style="left:' + b[1] / 10 + "%;top:" + b[0] / 10 + "%;width:" + (b[3] - b[1]) / 10 + "%;height:" + (b[2] - b[0]) / 10 + '%"></span>'; }).join("") + "</div>";
    }).join("");
    var GAP = desk ? 7.5 : 5.2;
    var pins = A.images.map(function (src, k) {
      var mk = A.marks.map(function (m, i) { return { m: m, i: i, y: (m.box[0] + m.box[2]) / 20 }; }).filter(function (o) { return o.m.image === k; }).sort(function (p, q) { return p.y - q.y; });
      mk.forEach(function (o, j) { o.p = Math.max(o.y, j ? mk[j - 1].p + GAP : 2.5); });
      for (var j = mk.length - 1; j >= 0; j--) { var cap = j === mk.length - 1 ? 97.5 : mk[j + 1].p - GAP; if (mk[j].p > cap) mk[j].p = cap; }
      return '<div class="rx-pins" data-au-pk="' + k + '"' + (k ? " hidden" : "") + '><svg class="rx-lines" viewBox="0 0 18 100" preserveAspectRatio="none" aria-hidden="true">' + mk.map(function (o) {
        return '<line data-au-m="' + o.i + '" class="s-' + (sev[o.m.severity] || "low") + '" x1="0" y1="' + o.p + '" x2="18" y2="' + o.y + '" vector-effect="non-scaling-stroke"/>';
      }).join("") + "</svg>" + mk.map(function (o) {
        return '<button type="button" class="rx-pin s-' + (sev[o.m.severity] || "low") + '" data-au-m="' + o.i + '" style="top:' + o.p + '%" aria-label="' + esc((o.i + 1) + ". " + o.m.area + ": " + o.m.what) + '">' + (o.i + 1) + "</button>";
      }).join("") + "</div>";
    }).join("");
    var pager = A.images.length < 2 ? "" : '<div class="rx-pager" role="tablist">' + A.images.map(function (src, k) {
      var c = A.marks.filter(function (m) { return m.image === k; }).length;
      return '<button type="button" role="tab" data-au-go="' + k + '" aria-selected="' + (k ? "false" : "true") + '"' + (k ? "" : ' class="on"') + ">Screen " + (k + 1) + (c ? " (" + c + ")" : "") + "</button>";
    }).join("") + "</div>";
    var notes = '<div class="rx-notes">' + A.marks.map(function (m, i) {
      var t = sev[m.severity] || "low";
      return '<button type="button" class="rx-note" data-au-m="' + i + '" data-au-img="' + m.image + '"><span class="rx-nd s-' + t + '">' + (i + 1) + '</span><span class="rx-nt"><span>' + esc(m.area) + "</span><b>" + esc(m.what) + '</b></span><span class="rx-sev v-' + t + '">' + esc(word[m.severity] || m.severity) + "</span></button>";
    }).join("") + "</div>";
    return '<section class="rx-sec">' + head("Where on your page", "The design problems pinned on your page as a " + (desk ? "desktop" : "phone") + " shopper sees it. Tap a pin or a note.") +
      '<div class="rx-anno"><article class="rx-card rx-phonecard' + (desk ? " is-desk" : "") + '"><div class="rx-pinwrap">' + pins + '<div class="rx-frame"><div class="rx-screen">' + shots + "</div></div></div>" + pager + "</article>" + notes + "</div></section>";
  }

  /* ---------------- Speed tab ---------------- */
  var MET = [
    ["lcp", "Main content shows", "How long until the main image or headline appears.", 2500, 4000, function (v) { return ms(v); }],
    ["cls", "Layout jumps", "How much the page shifts while it loads, so taps land on the wrong thing.", 0.1, 0.25, function (v) { return v == null ? "not measured" : v.toFixed(2); }],
    ["tbt", "Page frozen by scripts", "How long scripts block taps and scrolling while the page loads.", 200, 600, function (v) { return ms(v); }]];
  /* the scale has three equal parts (good, needs work, poor); the marker sits inside the part the value falls in */
  function mark(v, good, poor) { if (v == null) return null; var t = v <= good ? v / good : v <= poor ? 1 + (v - good) / (poor - good) : 2 + Math.min(1, (v - poor) / poor); return Math.max(0, Math.min(100, t / 3 * 100)); }
  function speedPanel(s) {
    if (s.score == null) return '<article class="rx-card"><span class="rx-k">Speed</span><h3 class="rx-h24">' + esc(s.band || "Not measured") + '</h3><p class="rx-t">' + esc(s.note || "Google PageSpeed could not measure this page.") + "</p></article>";
    var m = s.metrics || {}, r = s.rated || {}, f = s.field || {}, t = s.score >= 90 ? "ok" : s.score >= 50 ? "mid" : "bad";
    var x = '<div class="rx-grid g380"><article class="rx-card glow rx-gcard"><span class="rx-k">Lab score</span><div class="rx-gauge"><svg width="240" height="132" viewBox="0 0 200 110" aria-hidden="true"><path d="M 20 100 A 80 80 0 0 1 180 100" class="trk"/><path d="M 20 100 A 80 80 0 0 1 180 100" class="val s-' + t + '" data-rx-arc="' + (251.33 * s.score / 100).toFixed(1) + '" stroke-dasharray="' + (251.33 * s.score / 100).toFixed(1) + ' 400"/></svg><div class="rx-gnum">' + count(s.score) + "<span>/ 100</span></div></div>" + pill(tone(s.band), s.band) + '<p class="rx-m">Google PageSpeed on a mid-range phone, ' + s.runs + " run" + (s.runs > 1 ? "s" : "") + " averaged.</p></article>";
    var field = f.overall && (f.lcp || f.ttfb);
    var tiles = field ? [[f.lcp ? ms(f.lcp.p75) : "–", "Main content shows", f.lcp && f.lcp.category], [f.ttfb ? ms(f.ttfb.p75) : "–", "Server answers", f.ttfb && f.ttfb.category]] : [[ms(m.fcp), "First thing on screen"], [ms(m.ttfb), "Server answers"]];
    x += '<article class="rx-card rx-col18"><span class="rx-k">What real visitors get</span><p class="rx-h18">' + (f.overall ? 'Real Chrome visitors rate this page <b class="c-' + tone(f.overall) + '">' + esc(String(f.overall).toLowerCase()) + "</b>." : "Google has too little real-visitor data for this page.") + '</p><div class="rx-tiles">' +
      tiles.map(function (q) { return '<div><b class="reveal' + (q[2] ? " c-" + tone(q[2]) : "") + '">' + esc(q[0]) + "</b><span>" + q[1] + "</span></div>"; }).join("") + '</div><p class="rx-m sm">' + (field ? "From Google’s own field data: the slowest quarter of real visits." : "Lab numbers from the test phone, since field data is missing.") + "</p></article></div>";
    x += '<section class="rx-sec">' + head("Core Web Vitals", "What a phone shopper feels while the page loads.") + '<div class="rx-grid g300">' + MET.map(function (d) {
      var v = m[d[0]], pos = mark(v, d[3], d[4]);
      return '<article class="rx-card rx-met"><b class="rx-ml">' + d[1] + '</b><b class="rx-mv reveal c-' + tone(r[d[0]]) + '">' + esc(d[5](v)) + '</b><div class="rx-scale" aria-hidden="true"><div><i class="gx z-ok"></i><i class="gx z-mid"></i><i class="gx z-bad"></i></div>' + (pos == null ? "" : '<em class="mark" style="left:' + pos.toFixed(1) + '%"></em>') + '</div><p class="rx-m sm">Good is ' + d[5](d[3]) + ' or less</p><p class="rx-t">' + d[2] + "</p></article>";
    }).join("") + "</div></section>";
    return x;
  }

  /* ---------------- page ---------------- */
  function render(R) {
    var h = R.header || {}, p = R.product || {}, P = R.pillars || {};
    var chip = function (k, v) { return v ? "<span><i>" + k + "</i> " + esc(v) + "</span>" : ""; };
    var sep = '<i class="rx-sep"></i>';
    var out = '<div class="rx-wrap">';
    out += '<header class="rx-hero"><div class="rx-id">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '<span class="rx-noimg">Photo</span>') + '<div class="rx-idt"><span class="rx-eyebrow">' + esc(h.label || "Page audit") + "</span><h1>" + esc(p.title) + '</h1><div class="rx-meta"><span>' + esc(p.brand) + "</span>" + (p.price ? sep + "<span>" + esc(money(p.price, p.currency)) + "</span>" : "") + sep + "<span>" + esc(p.category) + "</span>" + sep + '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">Open page</a></div></div></div>' +
      '<div class="rx-bar"><div class="rx-chips">' + chip("Goal", h.goal) + chip("Device", h.device) + chip("Visitors", h.traffic) + chip("Buyer types", String(h.buyers || "").replace(/^Buyer types: /, "").replace(/^assumed from category$/, "From category")) + chip("Sections", /opened every section/i.test(h.reader || "") ? "All opened" : h.reader) + "</div>" +
      "<p>Three separate reads of one product page, one per tab. No combined score. Findings are likely, not confirmed. Ones marked Double-checked were confirmed by a second, separate check.</p></div></header>";
    out += tabs(P);
    out += '<section class="rx-panel" role="tabpanel" id="rx-p-cro" aria-labelledby="rx-t-cro" data-au-panel="cro">' + croPanel(P.customer || {}, R) + "</section>";
    out += '<section class="rx-panel" role="tabpanel" id="rx-p-design" aria-labelledby="rx-t-design" data-au-panel="design" hidden>' + designPanel(P.ui || {}, R.annotations) + "</section>";
    out += '<section class="rx-panel" role="tabpanel" id="rx-p-speed" aria-labelledby="rx-t-speed" data-au-panel="speed" hidden>' + speedPanel(P.speed || {}) + "</section>";
    out += '<div class="rx-next"><a class="rx-btn primary" href="contact.html">Fix it with TrooCRO</a><button type="button" class="rx-btn ghost" data-au-again>Audit another page</button></div></div>';
    return out;
  }

  /* hover spotlight on report cards and scan screen cards: the glow follows the pointer */
  win.document.addEventListener("pointermove", function (e) {
    var c = e.target.closest && e.target.closest(".rx-card, .an-spot"); if (!c) return;
    var r = c.getBoundingClientRect(); c.style.setProperty("--x", (e.clientX - r.left) + "px"); c.style.setProperty("--y", (e.clientY - r.top) + "px");
  }, { passive: true });
  var still = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* numbers count up (1.4 s, ease-out) and the speed arc fills with them, the first time a tab is shown */
  function countUp(panel) {
    if (!panel || panel.getAttribute("data-rx-done")) return;
    panel.setAttribute("data-rx-done", "1");
    var nums = [].slice.call(panel.querySelectorAll("[data-rx-count]")), arcs = [].slice.call(panel.querySelectorAll("[data-rx-arc]"));
    if (still || !win.requestAnimationFrame) return;
    var t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - t0) / 1400), v = 1 - Math.pow(1 - k, 3);
      nums.forEach(function (el) { el.textContent = (Number(el.getAttribute("data-rx-count")) * v).toFixed(Number(el.getAttribute("data-rx-dec"))); });
      arcs.forEach(function (el) { el.setAttribute("stroke-dasharray", (Number(el.getAttribute("data-rx-arc")) * v).toFixed(1) + " 400"); });
      if (k < 1) win.requestAnimationFrame(step);
    })(t0);
  }
  function wire(root, again) {
    var m = root.querySelector("[data-au-more]");
    if (m) m.addEventListener("click", function () { [].forEach.call(root.querySelectorAll(".rx-chg.more"), function (li) { li.hidden = false; }); m.remove(); });
    var a = root.querySelector("[data-au-again]"); if (a && again) a.addEventListener("click", again);
    var tabs = [].slice.call(root.querySelectorAll("[data-au-tab]"));
    function pick(id, focus) {
      tabs.forEach(function (t) { var on = t.getAttribute("data-au-tab") === id; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      [].forEach.call(root.querySelectorAll("[data-au-panel]"), function (el) { var on = el.getAttribute("data-au-panel") === id; el.hidden = !on; if (on) countUp(el); });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { pick(t.getAttribute("data-au-tab")); });
      t.addEventListener("keydown", function (e) { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]; pick(n.getAttribute("data-au-tab"), true); });
    });
    if (tabs.length) pick("cro");
    var an = root.querySelector(".rx-anno"); if (!an) return;
    function show(k) {
      [].forEach.call(an.querySelectorAll(".rx-shot"), function (el) { el.hidden = el.getAttribute("data-au-k") !== String(k); });
      [].forEach.call(an.querySelectorAll(".rx-pins"), function (el) { el.hidden = el.getAttribute("data-au-pk") !== String(k); });
      [].forEach.call(an.querySelectorAll("[data-au-go]"), function (b) { var on = b.getAttribute("data-au-go") === String(k); b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    }
    function sel(i) { [].forEach.call(an.querySelectorAll("[data-au-m]"), function (el) { el.classList.toggle("on", el.getAttribute("data-au-m") === i); }); }
    an.addEventListener("click", function (e) {
      var go = e.target.closest("[data-au-go]"); if (go) { show(go.getAttribute("data-au-go")); return; }
      var t = e.target.closest("[data-au-m]"); if (!t) return;
      if (t.hasAttribute("data-au-img")) show(t.getAttribute("data-au-img"));
      sel(t.getAttribute("data-au-m"));
    });
    var first = an.querySelector(".rx-note"); if (first) { show(first.getAttribute("data-au-img")); sel(first.getAttribute("data-au-m")); }
  }
  function failed(reason) {
    return '<div class="rx-wrap"><section class="rx-sec"><span class="rx-eyebrow">Page audit</span><h1 class="rx-fail">We couldn\'t finish this audit</h1><p class="rx-t">' + esc(reason || "The page could not be read or graded right now.") + ' No partial result is shown.' + (/bot check|status 4|blocked|could not be read|did not load|not reached/i.test(reason || "") ? " If the store blocks automated readers, use <b>Read it from your own browser</b> on the start page: it reads the page the way you see it." : " Try again in a few minutes.") + '</p><div class="rx-next"><button type="button" class="rx-btn ghost" data-au-again>Try another page</button></div></section></div>';
  }
  win.TrooAudit = { render: render, wire: wire, failed: failed };
})(window);
