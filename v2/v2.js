/* TrooCRO Analyzer v2: runs the scan steps and draws the report. No keys live here; every read goes through the server. */
(function () {
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? "/api" : "https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-analyze";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function post(route, body) {
    return fetch(API + "/" + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, reason: "The analyzer could not be reached. Check your connection and try again." }; });
  }

  // ---- agents at work ----------------------------------------------------------------------------------------
  var AGENTS = [["read", "R", "Reader", "Opens and maps your page", "Mapping header, product and reviews", 14, 26], ["list", "C", "Checklist", "Pulls the checks from the engine", "Asking the TrooCRO engine for this category", 4, 3],
    ["speed", "S", "Speed", "Times your page on a phone", "Loading your page on a mid-range phone", 14, 40], ["grade", "G", "Grader", "Checks every buyer question", "Reading the page against what shoppers ask", 38, 70],
    ["reviews", "V", "Voice", "Reads what buyers say", "Looking for reviews on the page", 4, 6], ["comp", "M", "Market", "Asks rival pages the same questions", "Finding pages to compare with", 20, 60], ["score", "E", "Engine", "Scores the page and orders the fixes", "Running the TrooCRO engine", 6, 3]];
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
      post("grade", { url: url, category: cat }).then(function (r) { if (!r.ok) throw new Error(r.reason || "Grading failed."); count("tFix", r.questions.missing + r.questions.partial); count("tPass", r.questions.met); step("grade", "done", r.questions.met + " buyer questions answered, " + r.questions.partial + " half answered, " + r.questions.missing + " not answered"); }),
      post("reviews", { url: url }).then(function (r) { step("reviews", r.ok && r.read ? "done" : "fail", r.ok && r.read ? r.read + " reviews read from " + r.source : "No readable reviews on this page. Buyer types use the category template."); }),
    ];
    var done = 0;
    var others = comps.map(function (c) {
      return within(post("grade", { url: c, category: cat, rival: true }), 95000).then(function (r) { if (r) done++; step("comp", "live", done + " of " + comps.length + " competitor pages graded"); });
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

  // ---- report ----------------------------------------------------------------------------------------------------
  var stTone = { met: "good", partial: "warn", missing: "bad", unread: "", na: "" };
  var sTone = function (n) { return n == null ? "" : n >= 70 ? "good" : n >= 45 ? "warn" : "bad"; };
  function bar(label, score, note, right) {
    var lim = score == null;
    return '<div class="b' + (lim ? " lim" : "") + '"><div class="top"><b>' + esc(label) + '</b><span class="v ' + sTone(score) + '">' + (lim ? "Not measured" : (right || score + "%")) + '</span></div><div class="track"><i data-w="' + (lim ? 0 : score) + '"></i></div>' + (note ? '<div class="note">' + esc(note) + "</div>" : "") + "</div>";
  }
  function fixItem(f) {
    return '<li><div class="fi"><b>' + esc(f.title) + '</b><span class="pill p">' + esc(f.step) + "</span>" + (f.effort ? '<span class="pill">' + esc(f.effort) + "</span>" : "") + '</div><p class="muted">What we saw: ' + esc(f.seen) + "</p>" + (f.change ? "<p>What to change: " + esc(f.change) + "</p>" : "") + (f.ways.length ? "<ul>" + f.ways.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") + "</li>";
  }
  function row(k, html) { return html ? '<div class="r"><dt>' + k + "</dt><dd>" + html + "</dd></div>" : ""; }
  function question(q) {
    var ahead = q.rivals.filter(function (r) { return r.grade === "met"; });
    var rivals = q.rivals.length ? (ahead.length ? ahead.length + " of " + q.rivals.length + " rival pages answer this fully (" + esc(ahead.map(function (r) { return r.host; }).join(", ")) + ")." : "None of the " + q.rivals.length + " rival pages answer this fully either.") : "";
    return '<article class="find fade"><div class="h"><h3>&ldquo;' + esc(q.question) + '&rdquo;</h3><div class="tags"><span class="pill ' + stTone[q.grade] + '">' + esc(q.status) + '</span><span class="pill">' + esc(q.importance) + "</span>" + (q.lift > 0 ? '<span class="pill p">+' + q.lift + " points</span>" : "") + "</div></div><dl>" +
      row("How you lose them", q.gap ? esc(q.gap) : "The page does not settle this doubt.") +
      row("On your page now", q.on_page ? "<blockquote>" + esc(q.on_page) + "</blockquote>" : (q.grade === "missing" ? '<span class="muted">Nothing that speaks to this.</span>' : "")) +
      row("A strong page shows", esc(q.good_looks_like)) +
      row("Rival pages", rivals) +
      row("Your customers say", q.voice ? "<blockquote>" + esc(q.voice.quote) + '</blockquote><p class="muted" style="font-size:13.5px;margin-top:6px">' + q.voice.mentions + " of " + q.voice.of + " reviews read touch on this.</p>" : "") +
      row("What to change", q.fixes.length ? "<details class=\"fx\"" + (q.fixes.length <= 2 ? " open" : "") + "><summary>" + q.fixes.length + " specific change" + (q.fixes.length > 1 ? "s" : "") + ', most important first</summary><ul class="fixes">' + q.fixes.slice(0, 6).map(fixItem).join("") + "</ul></details>" : '<span class="muted">Add what a strong page shows, near the buy button.</span>') +
      row("If you fix it", q.lift > 0 ? '<span class="mono">Score goes up by about ' + q.lift + " point" + (q.lift > 1 ? "s" : "") + "</span>" : "") + "</dl></article>";
  }

  function draw(R) {
    var S = R.score, C = R.competitors, P = R.buyers, h = "", open = R.questions.filter(function (q) { return q.grade === "missing" || q.grade === "partial"; }), met = R.questions.filter(function (q) { return q.grade === "met"; });
    h += '<div class="rhead fade">' + (R.meta.product.image ? '<img src="' + esc(R.meta.product.image) + '" alt="">' : "") + "<div><h2>" + esc(R.meta.product.title) + '</h2><div class="meta"><span class="pill">' + esc(R.meta.host) + '</span><span class="pill">' + esc(R.meta.category) + '</span><span class="pill">' + esc(R.meta.market) + "</span></div></div></div>";
    h += '<div class="scorewrap fade"><div><div class="score"><div class="big"><span id="bigScore">0</span><small> / 100</small></div><div class="band">' + esc(S.label) + '</div><div class="cov">' + esc(S.line) + '</div></div><div class="card pillars"><h3>What shoppers ask before buying</h3><div class="q3"><div><b class="good mono">' + S.counts.answered + '</b><span>answered</span></div><div><b class="warn mono">' + S.counts.half + '</b><span>half answered</span></div><div><b class="bad mono">' + S.counts.not + '</b><span>not answered</span></div></div><p class="muted" style="font-size:13.5px">Your score is the share of these questions your page settles, weighted by how much each one matters to ' + esc(R.meta.category.toLowerCase()) + " shoppers.</p></div></div>";
    h += '<div class="card rank">' + (C ? '<span class="pill">Against rival product pages</span><div class="place">' + esc(C.rank_text) + '</div><p class="muted">Same questions, asked of each page.</p><div class="scroll"><table style="margin-top:12px"><tr><th>#</th><th>Page</th><th class="n">Score</th></tr>' + C.table.map(function (t) { return '<tr class="' + (t.you ? "you" : "") + '"><td class="mono">' + t.rank + "</td><td>" + (t.you ? "You · " : "") + esc(t.host) + '</td><td class="n ' + sTone(t.score) + '">' + t.score + "</td></tr>"; }).join("") + "</table></div>"
      : '<span class="pill">Against rival product pages</span><h3 style="margin-top:10px">No comparison yet</h3><p class="muted" style="margin-top:6px">We could not find rival product pages to check. Add up to three links on the start screen to see where you stand.</p>') + "</div></div>";

    var p = S.path;
    h += '<section class="sec fade"><span class="num">01</span><h2>Where your score can go</h2><p class="muted">Each number is the same score, worked out again as if those questions were fully answered on the page.</p><div class="stats"><div class="stat"><div class="k ' + sTone(p.now) + '">' + p.now + '</div><div class="l">Today</div></div><div class="stat"><div class="k ' + sTone(p.top3) + '">' + p.top3 + '</div><div class="l">After the top 3 fixes below</div></div><div class="stat"><div class="k ' + sTone(p.deal_breakers) + '">' + p.deal_breakers + '</div><div class="l">After all ' + p.deal_breakers_open + " open deal-breakers</div></div></div></section>";

    h += '<section class="sec" id="fx"><span class="num">02</span><h2>How you are losing shoppers</h2><p class="muted">These are the questions a first-time shopper asks that your page leaves open, biggest gain first. Each one shows what is missing, what a strong page shows and what to change.</p><div id="qlist"></div><button class="btn ghost more" id="more" hidden>Show more</button></section>';

    if (met.length) h += '<section class="sec fade"><span class="num">03</span><h2>What your page already answers</h2><p class="muted">Keep these. They are doing their job.</p><div class="card"><ul class="okl">' + met.map(function (q) { return "<li><b>&ldquo;" + esc(q.question) + '&rdquo;</b>' + (q.on_page ? '<span class="muted"> ' + esc(q.on_page) + "</span>" : "") + "</li>"; }).join("") + "</ul></div></section>";

    if (P) h += '<section class="sec fade"><span class="num">04</span><h2>Who you are losing</h2><p class="muted">The kinds of buyer this product attracts, and how much of each one\'s worry the page settles. ' + esc(P.source) + '</p><div class="card"><div class="bars">' + P.rows.map(function (r) { return bar(r.label, r.answered, r.worry); }).join("") + "</div>" + (P.worst ? '<p style="margin-top:16px">Served worst: <b>' + esc(P.worst.label.toLowerCase()) + "</b>, with " + P.worst.answered + "% of their worry settled.</p>" : "") + "</div></section>";

    if (C && C.ahead_on.length) h += '<section class="sec fade"><span class="num">05</span><h2>Where rival pages are ahead</h2><p class="muted">Questions a rival page answers better than yours.</p><div class="card scroll"><table><tr><th>Shopper asks</th><th>You</th>' + C.ahead_on[0].rivals.map(function (t) { return "<th>" + esc(t.host) + "</th>"; }).join("") + "</tr>" + C.ahead_on.map(function (g) { return "<tr><td>" + esc(g.question) + '</td><td class="' + (g.you === "Not answered" ? "bad" : "warn") + '">' + esc(g.you) + "</td>" + g.rivals.map(function (t) { return '<td class="' + (stTone[t.grade] || "muted") + '">' + esc(t.status) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div></section>";

    var sp = R.speed, lk = R.look;
    h += '<section class="sec fade"><span class="num">06</span><h2>Speed and look on a phone</h2><p class="muted">Measured separately. They are not part of the score above, but a slow or cluttered page loses shoppers before they read anything.</p><div class="grid2"><div class="card"><h3>Speed on a phone' + (sp.score != null ? ' <span class="mono ' + sTone(sp.score) + '" style="float:right">' + sp.score + " / 100</span>" : "") + "</h3>" + (sp.metrics ? '<div class="kv" style="margin-top:14px">' + [["Main content shows after", "lcp"], ["Page frozen by scripts for", "tbt"], ["First paint", "fcp"], ["Layout jumps", "cls"]].filter(function (m) { return sp.metrics[m[1]]; }).map(function (m) { var x = sp.metrics[m[1]]; return '<div><div class="k ' + sTone(x.score) + '">' + esc(x.display) + '</div><div class="l">' + m[0] + "</div></div>"; }).join("") + '</div><p class="muted" style="margin-top:12px;font-size:13.5px">Google PageSpeed, mobile.' + (sp.field && sp.field.overall ? " Real Chrome users rate it " + esc(sp.field.overall.toLowerCase()) + "." : "") + "</p>" : '<p class="muted" style="margin-top:10px">Google PageSpeed did not return a result for this page.</p>') + '</div><div class="card"><h3>Look and feel' + (lk ? ' <span class="mono ' + sTone(lk.score) + '" style="float:right">' + lk.score + " / 100</span>" : "") + "</h3>" + (lk ? '<div class="bars" style="margin-top:14px">' + lk.parts.slice().sort(function (a, b) { return a.score - b.score; }).slice(0, 5).map(function (s) { return bar(s.label, s.score, s.note, String(s.score)); }).join("") + "</div>" : '<p class="muted" style="margin-top:10px">No screenshot was available to judge the look.</p>') + "</div></div></section>";

    if (R.contradictions.length) h += '<section class="sec fade"><span class="num">07</span><h2>Things on your page that disagree</h2><p class="muted">A careful shopper notices these, and they make every other claim harder to believe.</p><div class="card"><ul class="okl">' + R.contradictions.map(function (c) { return "<li><b>" + esc(c.about) + '</b><span class="muted"> &ldquo;' + esc(c.a) + "&rdquo; against &ldquo;" + esc(c.b) + "&rdquo;</span></li>"; }).join("") + "</ul></div></section>";

    h += '<section class="sec fade"><span class="num">08</span><h2>The fine print</h2>' + (R.other_fixes.length ? '<details class="fold"><summary>Smaller things worth fixing (' + R.other_fixes.length + ')</summary><ul class="fixes">' + R.other_fixes.map(fixItem).join("") + "</ul></details>" : "") + '<details class="fold"><summary>What we could not check from a link (' + (S.counts.could_not_check + R.not_judged.length) + ")</summary><ul>" + R.questions.filter(function (q) { return q.grade === "unread"; }).map(function (q) { return "<li><b>&ldquo;" + esc(q.question) + "&rdquo;</b> needs your cart, checkout or content we could not open.</li>"; }).join("") + R.not_judged.slice(0, 25).map(function (x) { return "<li><b>" + esc(x.title) + ".</b> " + esc(x.reason) + "</li>"; }).join("") + '</ul></details><details class="fold"><summary>How this score is worked out</summary><ul><li>We read your page the way a phone shopper sees it: ' + esc(R.meta.read_modes.join(", ")) + ".</li><li>Troopod's research lists the questions shoppers in your category ask before buying, and how much each one matters. We checked " + S.questions_graded + " of them on your page. Each is answered, half answered or not answered, and every answer has to be backed by words that are really on the page.</li><li>The score is the share of those questions your page settles, weighted by importance. Nothing else goes into it. Speed, look and rival pages are shown beside it.</li><li>An AI reads the page. Fixed rules do the scoring, set the order of fixes and pick each fix.</li>" + R.meta.assumptions.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></details></section>";
    h += '<section class="cta card fade"><h2>Want these fixed and tested?</h2><p class="muted" style="margin-top:8px">Troopod designs, builds and A/B tests the changes, starting with the top fixes above.</p><a class="btn primary" href="../contact.html">Talk to Troopod</a> <button class="btn ghost" id="again">Analyze another page</button></section>';

    var el = $("#report"); el.innerHTML = h; el.hidden = false; $("#run").hidden = true; window.scrollTo(0, 0);
    count("bigScore", S.overall);
    requestAnimationFrame(function () { el.querySelectorAll(".track i").forEach(function (i) { i.style.width = i.getAttribute("data-w") + "%"; }); });
    var shown = 5;
    function list() { $("#qlist").innerHTML = open.slice(0, shown).map(question).join("") || '<p class="muted">Nothing open. The page answers every question we could check.</p>'; var m = $("#more"); m.hidden = open.length <= shown; m.textContent = "Show " + Math.min(6, open.length - shown) + " more of " + (open.length - shown); }
    $("#more").onclick = function () { shown += 6; list(); };
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
