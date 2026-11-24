/* TrooCRO Analyzer v2: runs the scan steps and draws the report. No keys live here; every read goes through the server. */
(function () {
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? "/api" : "https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-analyze";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var tone = function (n) { return n == null ? "" : n >= 75 ? "good" : n >= 60 ? "warn" : "bad"; };
  var vTone = { pass: "good", partly: "warn", fail: "bad" };
  var vWord = { pass: "Does it", partly: "Partly", fail: "Missing", not_judged: "Not read", not_applicable: "N/A" };

  function post(route, body) {
    return fetch(API + "/" + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, reason: "The analyzer could not be reached. Check your connection and try again." }; });
  }

  // ---- agents at work ----------------------------------------------------------------------------------------
  var AGENTS = [["read", "R", "Reader", "Opens and maps your page", "Mapping header, product and reviews", 14, 26], ["list", "C", "Checklist", "Pulls the checks from the engine", "Asking the TrooCRO engine for this category", 4, 3],
    ["speed", "S", "Speed", "Times your page on a phone", "Loading your page on a mid-range phone", 14, 40], ["grade", "G", "Grader", "Grades every check with evidence", "Reading the page against the checklist", 38, 70],
    ["reviews", "V", "Voice", "Reads what buyers say", "Looking for reviews on the page", 4, 6], ["comp", "M", "Market", "Grades your direct competitors", "Finding pages to compare with", 20, 85], ["score", "E", "Engine", "Scores, ranks and pairs fixes", "Running the TrooCRO engine", 6, 3]];
  var A = {}, T0 = 0, clock = null, scene = null, queue = [], qi = 0;
  function drawSteps(url) {
    A = {}; T0 = Date.now(); queue = []; qi = 0;
    $("#alist").innerHTML = AGENTS.map(function (g) { A[g[0]] = { state: "queued", w: g[5], typ: g[6], t: 0 }; return '<div class="ag queued" id="ag-' + g[0] + '"><div class="av">' + g[1] + '</div><div><div class="nm">' + g[2] + '</div><div class="ds">' + g[3] + '</div><div class="ln">' + g[4] + '</div></div><span class="st">QUEUED</span></div>'; }).join("");
    $("#feed").innerHTML = ""; $("#phone").hidden = true; $("#skel").hidden = false; $("#phone").style.transform = ""; $("#runState").textContent = "Scanning";
    ["tChecks", "tFix", "tPass"].forEach(function (i) { $("#" + i).textContent = "0"; }); $("#tDone").textContent = "0 of 7";
    $("#furl").textContent = url.replace(/^https?:\/\//, ""); $("#runHost").textContent = hostOf(url);
    clearInterval(clock); clearInterval(scene);
    clock = setInterval(tick, 250); scene = setInterval(move, 2600); tick();
  }
  function tick() {
    var s = Math.floor((Date.now() - T0) / 1000), pct = 0, work = 0, done = 0;
    Object.keys(A).forEach(function (k) { var a = A[k]; if (a.state === "done" || a.state === "fail") { pct += a.w; done++; } else if (a.state === "live") { work++; pct += a.w * Math.min(0.92, (Date.now() - a.t) / 1000 / a.typ); } });
    $("#elapsed").textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) + " elapsed";
    $("#progBar").style.width = pct.toFixed(1) + "%"; $("#progPct").textContent = Math.round(pct) + "% done";
    $("#aw").textContent = work + " working"; $("#tDone").textContent = done + " of 7";
  }
  function say(text) {
    var s = Math.floor((Date.now() - T0) / 1000), li = document.createElement("li");
    li.innerHTML = "<span>" + Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) + "</span><div>" + esc(text) + "</div>";
    var f = $("#feed"); f.insertBefore(li, f.firstChild); while (f.children.length > 7) f.removeChild(f.lastChild);
  }
  function step(id, state, detail) {
    var a = A[id], el = $("#ag-" + id); if (!a || !el) return;
    if (state === "live" && a.state !== "live") a.t = Date.now();
    var changed = a.state !== state; a.state = state;
    el.className = "ag " + state; $(".st", el).textContent = { live: "WORKING", done: "DONE", fail: "SKIPPED" }[state] || "QUEUED";
    if (detail) $(".ln", el).textContent = detail;
    if (detail && (changed || state !== "live") && state !== "queued") say(el.querySelector(".nm").textContent + ": " + detail);
    tick();
  }
  function count(id, to) { var el = $("#" + id), from = parseInt(el.textContent, 10) || 0, t0 = Date.now(); (function f() { var p = Math.min(1, (Date.now() - t0) / 900); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); })(); }
  // The camera: pans the phone screenshot region by region while the grader works, naming what is being read.
  function showShot(scan) {
    queue = (scan.highlights || []).concat((scan.checks || []).map(function (c) { return "Checking: " + c; }));
    if (!scan.shot) { $(".skel p").textContent = "No screenshot for this page. Reading its text instead"; return; }
    var img = $("#shot"); img.onload = function () { $("#skel").hidden = true; $("#phone").hidden = false; move(); }; img.src = scan.shot;
  }
  function move() {
    var ph = $("#phone"); if (ph.hidden || !queue.length) return;
    var H = ph.offsetHeight, vh = $("#view").offsetHeight, vw = $("#view").offsetWidth, n = Math.max(1, Math.floor(H / 150)), r = qi % n, top = r * 150 + 8;
    var pan = Math.max(0, Math.min(H - vh + 40, top - vh * 0.3));
    ph.style.transform = "translateY(" + (-pan + 34) + "px)";
    $("#band").style.top = top + "px"; $("#band").style.height = (96 + (qi * 37) % 60) + "px";
    var text = queue[qi % queue.length]; $("#tag").textContent = text; qi++;
    if (A.grade && A.grade.state === "live" && text.indexOf("Checking: ") === 0) $(".ln", $("#ag-grade")).textContent = text;
    var y = top - pan + 34;
    $("#cur1").style.left = Math.min(vw - 90, vw / 2 + 40 + (qi * 53) % 90) + "px"; $("#cur1").style.top = (y + 30 + (qi * 29) % 50) + "px";
    $("#cur2").style.left = Math.max(8, vw / 2 - 190 + (qi * 31) % 60) + "px"; $("#cur2").style.top = Math.max(20, Math.min(vh - 40, y + 150 + (qi * 41) % 120)) + "px";
  }
  function stopStage() { clearInterval(clock); clearInterval(scene); }
  function fail(msg) { stopStage(); $("#run").hidden = true; $("#hero").hidden = false; var e = $("#err"); e.textContent = msg; e.hidden = false; }

  // ---- the run ------------------------------------------------------------------------------------------------
  function start(url, comps, category) {
    $("#err").hidden = true; $("#hero").hidden = true; $("#report").hidden = true; $("#run").hidden = false; $("#ask").hidden = true;
    drawSteps(url); step("read", "live");
    window.scrollTo(0, 0);
    post("scan", { url: url, competitors: comps, category: category || undefined }).then(function (scan) {
      if (!scan.ok) return fail(scan.reason || "That page could not be read.");
      step("read", "done", scan.product.title + " · read from " + scan.read_modes.join(", "));
      showShot(scan);
      if (scan.category_confidence === "low" && !category) return askCategory(scan, comps);
      go(scan);
    });
  }
  function askCategory(scan, comps) {
    var a = $("#ask"); a.hidden = false; $("#runState").textContent = "Waiting for you";
    a.innerHTML = "<b>Which category is this product?</b><p class=\"muted\">We could not tell for sure, and the checklist depends on it.</p><div class=\"row\"><select id=\"cat\">" + scan.categories.map(function (c) { return "<option" + (c === scan.category ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select><button class=\"btn primary sm\" id=\"catGo\">Continue</button></div>";
    $("#catGo").onclick = function () { a.hidden = true; start(scan.url, comps, $("#cat").value); };
  }
  function go(scan) {
    var url = scan.url, cat = scan.category, comps = scan.competitors.map(function (c) { return c.url; });
    step("list", "done", scan.checklist + " checks for " + cat + " product pages (" + scan.market + ")"); count("tChecks", scan.checklist);
    step("speed", "live"); step("grade", "live"); step("reviews", "live");
    step("comp", comps.length ? "live" : "fail", comps.length ? scan.competitors.map(function (c) { return hostOf(c.url); }).join(", ") + (scan.competitors[0].source === "suggested" ? " (picked for you)" : "") : "No competitor pages found. Add your own on the start screen.");
    var own = [
      within(post("psi", { url: url }), 106000).then(function (r) { r = r || { ok: false }; step("speed", r.ok ? "done" : "fail", r.ok ? "Mobile performance " + r.score + " / 100" : "PageSpeed did not answer. That pillar is left as limited evidence."); }),
      post("grade", { url: url, category: cat }).then(function (r) { if (!r.ok) throw new Error(r.reason || "Grading failed."); count("tFix", r.tally.fail + r.tally.partly); count("tPass", r.tally.pass); step("grade", "done", r.counts.by_gemini + " checks graded by Gemini, " + r.counts.by_rule + " by rules, " + r.counts.out_of_scope + " left for analytics or a click-through"); }),
      post("reviews", { url: url }).then(function (r) { step("reviews", r.ok && r.read ? "done" : "fail", r.ok && r.read ? r.read + " reviews read from " + r.source : "No readable reviews on this page. Buyer types use the category template."); }),
    ];
    var done = 0;
    var others = comps.map(function (c) {
      return within(Promise.all([post("psi", { url: c }), post("grade", { url: c, category: cat })]), 95000).then(function (r) { if (r) done++; step("comp", "live", done + " of " + comps.length + " competitor pages graded"); });
    });
    Promise.all(others).then(function () { if (comps.length) step("comp", done ? "done" : "fail", done === comps.length ? done + " competitor pages graded" : done + " of " + comps.length + " competitor pages graded in time. The slow ones are left out."); });
    Promise.all(own.concat(others)).then(function () {
      step("score", "live");
      return post("report", { url: url, category: cat, competitors: comps });
    }).then(function (r) {
      if (!r.ok) return fail(r.reason || "The report could not be built.");
      step("score", "done", "Report ready"); $("#runState").textContent = "Done"; setTimeout(function () { stopStage(); draw(r.report); }, 700);
    }).catch(function (e) { fail(e.message + " Please try again in a minute."); });
  }
  // Resolves with the promise, or with null once the time is up. Slow side jobs never hold the report back.
  function within(p, ms) { return Promise.race([p, new Promise(function (res) { setTimeout(function () { res(null); }, ms); })]); }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }

  // ---- report -------------------------------------------------------------------------------------------------
  function bar(label, score, note, extra) {
    var lim = score == null;
    return '<div class="b' + (lim ? " lim" : "") + '"><div class="top"><b>' + esc(label) + (extra || "") + '</b><span class="v ' + tone(score) + '">' + (lim ? "Limited evidence" : score) + '</span></div><div class="track"><i data-w="' + (lim ? 0 : score) + '"></i></div>' + (note ? '<div class="note">' + esc(note) + "</div>" : "") + "</div>";
  }
  var ADV = ' <span class="pill adv">Advisory</span>';
  function row(k, html, adv) { return html ? '<div class="r"><dt>' + k + (adv ? ' <span class="a">advisory</span>' : "") + "</dt><dd>" + html + "</dd></div>" : ""; }
  function finding(f) {
    var imp = f.score_impact, impTxt = imp && imp.sub_from != null ? esc(imp.cause) + " " + imp.sub_from + " to " + imp.sub_to + ", overall " + imp.overall_from + " to " + imp.overall_to + " on the roadmap" : "";
    var fix = f.fix ? esc(f.fix.text) + (f.fix.options.length ? "<ul>" + f.fix.options.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul>" : "") + '<p class="muted" style="margin-top:6px;font-size:13.5px">Evidence: ' + (f.fix.evidence ? esc(f.fix.evidence) : "no line for this fix in the Troopod research table yet, so none is quoted.") + "</p>" : "";
    var up = f.uplift ? '<span class="up">+' + f.uplift.low + " to " + f.uplift.high + "% " + esc(f.uplift.metric) + "</span>" + (f.uplift.rupees ? ' <span class="up">≈ ₹' + f.uplift.rupees[0].toLocaleString("en-IN") + " to ₹" + f.uplift.rupees[1].toLocaleString("en-IN") + " a month</span>" : "") + '<p class="muted" style="font-size:13.5px">Range from ' + esc(f.uplift.source) + "</p>"
      : '<span class="muted">No sourced range in the Troopod benchmark table for this fix yet. We do not estimate one.</span>';
    return '<article class="find fade" data-p="' + f.p + '"><div class="h"><h3>' + esc(f.title) + '</h3><div class="tags"><span class="pill p">' + f.p + "</span>" + (f.effort ? '<span class="pill">' + esc(f.effort) + " effort</span>" : "") + (f.type === "Enhancement" ? '<span class="pill">Enhancement</span>' : "") + "</div></div><dl>" +
      row("Behaviour", esc(f.behaviour.text) + '<br><span class="pill ' + (f.verdict === "partly" ? "warn" : "bad") + '">' + (f.verdict === "partly" ? "Partly there" : "Missing") + '</span><span class="pill">' + esc(f.behaviour.badge) + "</span>", true) +
      row("Root", "<b>" + esc(f.root.cause) + "</b> · " + f.root.barriers.map(function (b) { return '<span class="mono">' + esc(b.id) + "</span> " + esc(b.name); }).join(", ")) +
      row("Compete", f.compete ? esc(f.compete.text) + (f.compete.who.length ? ' <span class="muted">(' + esc(f.compete.who.join(", ")) + ")</span>" : "") : "", true) +
      row("Persona", f.persona && f.persona.fulfilment != null ? "Hurts the <b>" + esc(f.persona.label.toLowerCase()) + "</b> most: " + f.persona.share + "% of buyers, served at " + f.persona.fulfilment + '%. <span class="pill">' + esc(f.persona.provenance) + "</span>" : "", true) +
      row("Voice", f.voice ? "<blockquote>" + esc(f.voice.quote) + '</blockquote><p class="muted" style="font-size:13.5px;margin-top:6px">' + f.voice.mentions + " of " + f.voice.of + " reviews read (" + esc(f.voice.source) + ") touch on " + esc(f.voice.barrier.toLowerCase()) + ".</p>" : "", true) +
      row("Fix", fix) + row("Uplift", up, true) + row("Score impact", impTxt ? '<span class="mono">' + impTxt + "</span>" : "") + "</dl></article>";
  }

  function draw(R) {
    var S = R.score, C = R.competitors, P = R.personas, h = "";
    h += '<div class="rhead fade">' + (R.meta.product.image ? '<img src="' + esc(R.meta.product.image) + '" alt="">' : "") + "<div><h2>" + esc(R.meta.product.title) + '</h2><div class="meta"><span class="pill">' + esc(R.meta.host) + '</span><span class="pill">' + esc(R.meta.category) + '</span><span class="pill">' + esc(R.meta.market) + "</span></div></div></div>";
    h += '<div class="scorewrap fade"><div><div class="score"><div class="big"><span id="bigScore">0</span><small> / 100</small></div><div class="band">' + esc(S.band) + '</div><div class="cov">Coverage ' + S.coverage.pct + "% · " + S.coverage.judged + " checks · " + S.coverage.issues + " issues · " + S.coverage.enhancements + " enhancements · " + S.coverage.in_place + ' in place</div></div><div class="card pillars">' + S.pillars.map(function (p) { return bar(p.label, p.score, p.note); }).join("") + "</div></div>";
    h += '<div class="card rank">' + (C ? '<span class="pill adv">Advisory · shown beside the score, never inside it</span><div class="place">' + esc(C.rank_text) + '</div><p class="muted">Ranked on ' + esc(C.ranked_on.join(", ")) + (C.biggest_gap ? ". Biggest gap: " + esc(C.biggest_gap.toLowerCase()) : "") + '.</p><div class="scroll"><table style="margin-top:12px"><tr><th>#</th><th>Page</th><th class="n">Score</th></tr>' + C.table.map(function (t) { return '<tr class="' + (t.you ? "you" : "") + '"><td class="mono">' + t.rank + "</td><td>" + (t.you ? "You · " : "") + esc(t.host) + '</td><td class="n ' + tone(t.score) + '">' + t.score + "</td></tr>"; }).join("") + "</table></div>"
      : '<span class="pill adv">Advisory</span><h3 style="margin-top:10px">No competitor comparison yet</h3><p class="muted" style="margin-top:6px">We could not find competitor product pages to grade. Add up to three links on the start screen to see your rank and the gap table.</p>') + "</div></div>";

    var rm = S.roadmap;
    h += '<section class="sec fade"><span class="num">01</span><h2>Where the score can go</h2><p class="muted">The engine re-scores the page with the P0 fixes shipped, then P0 and P1. ' + esc(rm.note) + '</p><div class="stats"><div class="stat"><div class="k">' + rm.now + '</div><div class="l">Today</div></div><div class="stat"><div class="k ' + tone(rm.after_p0) + '">' + rm.after_p0 + '</div><div class="l">After ' + rm.p0 + ' P0 fixes</div></div><div class="stat"><div class="k ' + tone(rm.after_p0_p1) + '">' + rm.after_p0_p1 + '</div><div class="l">After P0 and ' + rm.p1 + " P1</div></div></div></section>";

    var f = S.pillars[2], ui = S.pillars[3], tech = S.pillars[4], D = R.diagnosis;
    h += '<section class="sec fade"><span class="num">02</span><h2>What is holding the page back</h2><p class="muted">' + (D.primary ? "The engine names <b style=\"color:#FFFFFF\">" + esc(D.primary.label.toLowerCase()) + "</b> as the main problem" + (D.secondary ? ", then " + esc(D.secondary.label.toLowerCase()) : "") + ". " + esc(D.primary.description || "") : "Scores by root cause.") + '</p><div class="grid2"><div class="card"><h3>Website funnel, by root cause</h3><div class="bars" style="margin-top:14px">' + (f.subs || []).map(function (s) { return bar(s.label, s.score, s.issues + " open of " + s.n + " checks" + (s.thin ? ". Too few checks to count toward the pillar." : "")); }).join("") + '</div></div><div class="card"><h3>UI alignment</h3><div class="bars" style="margin-top:14px">' + ((ui.subs || []).length ? ui.subs.map(function (s) { return bar(s.label, s.score, s.note); }).join("") : '<p class="muted">' + esc(ui.note) + "</p>") + "</div></div></div></section>";

    h += '<section class="sec fade"><span class="num">03</span><h2>Technical performance</h2><p class="muted">' + esc(tech.note) + ' This pillar is Google PageSpeed, counted in full.</p>' + (R.speed.metrics ? '<div class="kv">' + [["LCP", "lcp"], ["TBT", "tbt"], ["CLS", "cls"], ["FCP", "fcp"], ["Speed Index", "si"], ["TTI", "tti"]].filter(function (m) { return R.speed.metrics[m[1]]; }).map(function (m) { var x = R.speed.metrics[m[1]]; return '<div><div class="k ' + tone(x.score) + '">' + esc(x.display) + '</div><div class="l">' + m[0] + " · score " + x.score + "</div></div>"; }).join("") + "</div>" + (R.speed.field && R.speed.field.overall ? '<p class="muted" style="margin-top:12px;font-size:14px">Real Chrome users: ' + esc(R.speed.field.overall.toLowerCase()) + " on Core Web Vitals.</p>" : "") : '<div class="card muted">PageSpeed did not return a result for this page.</div>') + "</section>";

    if (P) h += '<section class="sec fade"><span class="num">04</span><h2>Customer voice' + ADV + '</h2><p class="muted">How much of each buyer type\'s worry the page answers. A re-cut of the same checks, not a new score. ' + esc(P.provenance_note) + '</p><div class="card"><div class="bars">' + P.rows.map(function (r) { return bar(r.label, r.fulfilment, r.worry + " " + r.share + "% of buyers."); }).join("") + "</div>" + (P.worst ? '<p style="margin-top:16px">Served worst: <b>' + esc(P.worst.label.toLowerCase()) + "</b> at " + P.worst.fulfilment + "%." + (P.overall_voice != null ? " Overall voice " + P.overall_voice + "%." : "") + ' <span class="pill">' + esc(P.provenance) + "</span></p>" : "") + "</div>" +
      (R.reviews && R.reviews.read ? '<p class="muted" style="margin-top:12px;font-size:14px">' + R.reviews.read + " reviews read from " + esc(R.reviews.source) + (R.reviews.rating ? ", average " + R.reviews.rating + " stars" : "") + "." + (R.reviews.barriers.length ? " Most mentioned: " + R.reviews.barriers.map(function (b) { return esc(b.name.toLowerCase()) + " (" + b.mentions + ")"; }).join(", ") + "." : "") + "</p>" : "") + "</section>";

    if (C && C.gaps.length) h += '<section class="sec fade"><span class="num">05</span><h2>They do, you do not' + ADV + '</h2><p class="muted">Checks you miss that at least one competitor gets right, highest priority first.</p><div class="card scroll"><table><tr><th>Check</th><th>You</th>' + C.gaps[0].them.map(function (t) { return "<th>" + esc(t.host) + "</th>"; }).join("") + "</tr>" + C.gaps.map(function (g) { return "<tr><td>" + esc(g.check) + ' <span class="pill p">' + g.p + '</span></td><td class="' + vTone[g.you] + '">' + vWord[g.you] + "</td>" + g.them.map(function (t) { return '<td class="' + (vTone[t.verdict] || "muted") + '">' + (vWord[t.verdict] || "Not read") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>" + (C.lead.length ? '<details class="fold"><summary>Where you are ahead (' + C.lead.length + ")</summary><ul>" + C.lead.map(function (l) { return "<li>You pass the check <b>" + esc(l.toLowerCase()) + "</b>. None of them do.</li>"; }).join("") + "</ul></details>" : "") + "</section>";

    var cnt = function (p) { return R.findings.filter(function (x) { return x.p === p; }).length; };
    h += '<section class="sec" id="fx"><span class="num">06</span><h2>What to fix, in order</h2><p class="muted">Priority, root cause, barrier and fix come from the TrooCRO engine. Rows marked Advisory add context and never move the score.</p><div class="tabs">' + [["all", "All " + R.findings.length], ["P0", "P0 · " + cnt("P0")], ["P1", "P1 · " + cnt("P1")], ["P2", "P2 · " + cnt("P2")]].map(function (t, i) { return '<button class="tab" data-f="' + t[0] + '" aria-pressed="' + (i === 0) + '">' + t[1] + "</button>"; }).join("") + '</div><div id="flist"></div><button class="btn ghost more" id="more" hidden>Show more</button></section>';

    h += '<section class="sec fade"><span class="num">07</span><h2>The fine print</h2><details class="fold"><summary>Checks this page passes (' + S.coverage.in_place + ")</summary><ul>" + R.in_place.map(function (x) { return "<li><b>Passed: " + esc(x.title.toLowerCase()) + ".</b> " + esc(x.evidence) + "</li>"; }).join("") + '</ul></details><details class="fold"><summary>What we could not judge from a link (' + R.not_judged.length + ")</summary><ul>" + R.not_judged.map(function (x) { return "<li><b>" + esc(x.title) + ".</b> " + esc(x.reason) + "</li>"; }).join("") + '</ul></details><details class="fold"><summary>How this report was made</summary><ul><li>Read from: ' + esc(R.meta.read_modes.join(", ")) + ".</li><li>Gemini (" + esc(R.meta.grader_model) + ") only answered pass, partly or fail for each check, with evidence. Scoring, priorities and fixes are the TrooCRO engine, unchanged (build <span class=\"mono\">" + esc(R.meta.engine_sha256.slice(0, 12)) + "</span>).</li>" + R.meta.assumptions.concat(R.meta.notes).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "<li>Overall is the average of the pillars we could investigate. Business Fundamentals and Traffic and Intent need your own data, so they are left out, not guessed.</li></ul></details></section>";
    h += '<section class="cta card fade"><h2>Want these fixed and tested?</h2><p class="muted" style="margin-top:8px">Troopod designs, builds and A/B tests the fixes, starting with the P0 list above.</p><a class="btn primary" href="../contact.html">Talk to Troopod</a> <button class="btn ghost" id="again">Analyze another page</button></section>';

    var el = $("#report"); el.innerHTML = h; el.hidden = false; $("#run").hidden = true; window.scrollTo(0, 0);
    count("bigScore", S.overall);
    requestAnimationFrame(function () { el.querySelectorAll(".track i").forEach(function (i) { i.style.width = i.getAttribute("data-w") + "%"; }); });
    var shown = 8, filter = "all";
    function list() {
      var xs = R.findings.filter(function (x) { return filter === "all" || x.p === filter; });
      $("#flist").innerHTML = xs.slice(0, shown).map(finding).join("") || '<p class="muted">Nothing at this priority.</p>';
      var m = $("#more"); m.hidden = xs.length <= shown; m.textContent = "Show " + Math.min(10, xs.length - shown) + " more of " + (xs.length - shown);
    }
    el.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { filter = t.getAttribute("data-f"); shown = 8; el.querySelectorAll(".tab").forEach(function (o) { o.setAttribute("aria-pressed", o === t); }); list(); }; });
    $("#more").onclick = function () { shown += 10; list(); };
    $("#again").onclick = function () { el.hidden = true; $("#hero").hidden = false; window.scrollTo(0, 0); $("#url").focus(); };
    list();
  }

  // ---- start --------------------------------------------------------------------------------------------------
  $("#form").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = $("#url").value.trim(); if (!u) return;
    var comps = Array.prototype.map.call(document.querySelectorAll(".comp"), function (i) { return i.value.trim(); }).filter(Boolean);
    start(u, comps);
  });
  var q = new URLSearchParams(location.search).get("url");
  if (q) { $("#url").value = q; start(q, []); }
})();
