/* TrooCRO site interactions: nav, menus, halftone canvases, text burst, reveal,
   sticky walkthrough, testimonial carousel, visitors-to-buyers flow, agent view. */
(function () {
  "use strict";
  var doc = document, win = window;
  var reduced = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------------- menus ---------------- */
  var items = $$("[data-menu]");
  var closeAll = function (except) { items.forEach(function (it) { if (it !== except) { it.classList.remove("open"); var b = $(".nav-link", it); if (b) b.setAttribute("aria-expanded", "false"); } }); };
  items.forEach(function (it) {
    var btn = $(".nav-link", it), t = null;
    var open = function () { clearTimeout(t); closeAll(it); it.classList.add("open"); btn.setAttribute("aria-expanded", "true"); };
    var close = function () { t = setTimeout(function () { it.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }, 140); };
    it.addEventListener("mouseenter", open);
    it.addEventListener("mouseleave", close);
    btn.addEventListener("click", function (e) { e.preventDefault(); it.classList.contains("open") ? (it.classList.remove("open"), btn.setAttribute("aria-expanded", "false")) : open(); });
  });
  doc.addEventListener("click", function (e) { if (!e.target.closest("[data-menu]")) closeAll(); });
  doc.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); closeSheet(); closeAgent(); } });

  /* floating pill nav */
  var floatNav = $(".float-nav");
  var onScrollNav = function () { if (floatNav) floatNav.classList.toggle("show", win.scrollY > 620); };
  win.addEventListener("scroll", onScrollNav, { passive: true }); onScrollNav();

  /* mobile sheet */
  var sheet = $(".mobile-sheet");
  function openSheet() { if (sheet) { sheet.classList.add("open"); sheet.setAttribute("aria-hidden", "false"); doc.body.style.overflow = "hidden"; } }
  function closeSheet() { if (sheet) { sheet.classList.remove("open"); sheet.setAttribute("aria-hidden", "true"); doc.body.style.overflow = ""; } }
  $$("[data-open-sheet]").forEach(function (b) { b.addEventListener("click", openSheet); });
  $$("[data-close-sheet]").forEach(function (b) { b.addEventListener("click", closeSheet); });

  /* hero url form -> analyzer */
  $$("[data-url-form]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = ($("input", f).value || "").trim();
      win.location.href = "analyze.html" + (v ? "?url=" + encodeURIComponent(v) : "");
    });
  });

  /* ---------------- halftone canvas ---------------- */
  function halftone(canvas, opt) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d"), w = 0, h = 0, dpr = Math.min(win.devicePixelRatio || 1, 1.5), raf = 0, last = 0, visible = true, t0 = performance.now();
    var gap = opt.gap || 13;
    function size() {
      var r = canvas.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 33) return; last = now;
      var t = (now - t0) / 1000 * (opt.speed || 1);
      ctx.clearRect(0, 0, w, h);
      var cols = Math.ceil(w / gap) + 1, rows = Math.ceil(h / gap) + 1;
      for (var j = 0; j < rows; j++) {
        var y = j * gap, ny = y / h;
        for (var i = 0; i < cols; i++) {
          var x = i * gap, nx = x / w;
          var v = Math.sin(nx * 6.2 + t * 0.55) * 0.5 + Math.sin(ny * 7.4 - t * 0.42 + nx * 2.3) * 0.5 + Math.sin((nx + ny) * 9 + t * 0.8) * 0.35;
          v = (v + 1.35) / 2.7;
          var m = opt.mask(nx, ny, t);
          var fl = opt.floor || 0;
          var a = m * (fl + (1 - fl) * v) * (opt.gain || 1);
          if (a < 0.08) continue;
          var s = Math.max(0.6, a * (opt.max || 2.6));
          ctx.fillStyle = a > 0.72 ? opt.hi : opt.lo;
          ctx.globalAlpha = clamp(a * (opt.alpha || 0.9), 0, 1);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
      if (reduced) cancelAnimationFrame(raf);
    }
    size(); win.addEventListener("resize", size);
    if ("IntersectionObserver" in win) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);
    raf = requestAnimationFrame(frame);
  }
  halftone($(".hero-canvas"), {
    gap: 11, max: 3.2, speed: 0.7, hi: "#EFEAFF", lo: "#9C82F8", alpha: 1, floor: 0.45, gain: 1.25,
    mask: function (x, y, t) {
      /* a field of dots with a slow wavy horizon, brightest along the crest */
      var hz = 0.6 + 0.03 * Math.sin(x * 4.6 + t * 0.45) + 0.015 * Math.sin(x * 11 - t * 0.7);
      var below = clamp((y - hz) / 0.06, 0, 1);
      var crest = Math.exp(-Math.pow((y - hz - 0.06) / 0.075, 2));
      var depth = clamp(1.05 - (y - hz) * 1.6, 0.18, 1);
      var sky = Math.exp(-Math.pow((y - hz + 0.05) / 0.06, 2)) * 0.22;
      var side = 0.55 + 0.45 * Math.min(1, Math.abs(x - 0.5) * 2.4);
      return clamp((below * (0.42 + 0.58 * crest) * depth + sky) * side, 0, 1);
    }
  });
  halftone($("[data-final-canvas]"), {
    gap: 12, max: 2.4, speed: 0.4, hi: "#FFFFFF", lo: "#CBBEFD", alpha: 0.55,
    mask: function (x, y) { return clamp(Math.exp(-Math.pow((x - 0.8) / 0.25, 2)) * Math.exp(-Math.pow((y - 0.45) / 0.45, 2)) * 1.1, 0, 1); }
  });

  /* ---------------- text burst ---------------- */
  function splitChars(el) {
    var idx = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
            var word = doc.createElement("span"); word.style.whiteSpace = "nowrap"; word.style.display = "inline-block";
            for (var k = 0; k < part.length; k++) { var c = doc.createElement("span"); c.className = "ch"; c.textContent = part[k]; c.setAttribute("data-i", idx++); word.appendChild(c); }
            frag.appendChild(word);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    })(el);
    return idx;
  }
  function burst(el) {
    var chars = $$(".ch", el); if (!chars.length) return;
    chars.forEach(function (c) {
      var i = +c.getAttribute("data-i");
      var final = getComputedStyle(c.parentNode.parentNode).color;
      if (!c.animate) return;
      c.animate([
        { color: "rgba(160,157,173,0.22)", textShadow: "none" },
        { color: "#E9E2FF", textShadow: "0 0 18px rgba(203,190,253,0.8)", offset: 0.35 },
        { color: "#A68EFA", textShadow: "0 0 10px rgba(139,107,247,0.5)", offset: 0.7 },
        { color: final, textShadow: "none" }
      ], { duration: 1150, delay: i * 16, easing: "ease-in-out", fill: "both" });
    });
  }
  if (!reduced && "IntersectionObserver" in win) {
    var bio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6) { bio.unobserve(e.target); burst(e.target); } });
    }, { threshold: [0, 0.6, 1] });
    $$("[data-burst]").forEach(function (el) { splitChars(el); bio.observe(el); });
  }

  /* ---------------- reveal ---------------- */
  if ("IntersectionObserver" in win && !reduced) {
    var rio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); rio.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    $$(".rv").forEach(function (el) { rio.observe(el); });
  } else $$(".rv").forEach(function (el) { el.classList.add("in"); });

  /* ---------------- walkthrough ---------------- */
  var walk = $("[data-walk]");
  if (walk) {
    var steps = $$(".walk-step", walk), scenes = $$(".scene", walk), bar = $(".walk-progress", walk), cur = -1;
    var typed = $(".typed", walk), typeTimer = 0;
    function typeUrl() {
      if (!typed) return; clearInterval(typeTimer);
      var full = typed.getAttribute("data-type"), n = 0; typed.textContent = "";
      typeTimer = setInterval(function () { n++; typed.textContent = full.slice(0, n); if (n >= full.length) clearInterval(typeTimer); }, 90);
    }
    function setStep(i) {
      if (i === cur) return; cur = i;
      steps.forEach(function (s, k) { s.classList.toggle("active", k === i); });
      scenes.forEach(function (s, k) { s.classList.toggle("on", k === i); });
      if (i === 0) typeUrl();
    }
    function onWalk() {
      var r = walk.getBoundingClientRect(), total = walk.offsetHeight - win.innerHeight;
      if (total <= 0) return;
      var p = clamp(-r.top / total, 0, 0.9999);
      setStep(Math.floor(p * steps.length));
      if (bar) { var list = bar.parentNode; bar.style.height = (p * (list.offsetHeight - 12)) + "px"; }
    }
    win.addEventListener("scroll", onWalk, { passive: true }); win.addEventListener("resize", onWalk); onWalk(); typeUrl();
    steps.forEach(function (s, k) {
      s.addEventListener("click", function () {
        var total = walk.offsetHeight - win.innerHeight, top = walk.getBoundingClientRect().top + win.scrollY;
        win.scrollTo({ top: top + total * ((k + 0.5) / steps.length), behavior: "smooth" });
      });
    });
  }

  /* ---------------- carousel ---------------- */
  $$("[data-carousel]").forEach(function (car) {
    var vp = $(".car-viewport", car), track = $(".car-track", car), cards = $$(".tcard", car), dotsWrap = $(".car-dots", car), idx = 1, timer = 0;
    cards.forEach(function (_, k) { var d = doc.createElement("i"); d.addEventListener("click", function () { go(k); }); dotsWrap.appendChild(d); });
    var dots = $$("i", dotsWrap);
    function go(k) {
      idx = (k + cards.length) % cards.length;
      var c = cards[idx], off = c.offsetLeft + c.offsetWidth / 2 - vp.offsetWidth / 2;
      track.style.transform = "translateX(" + (-off) + "px)";
      cards.forEach(function (x, j) { x.classList.toggle("on", j === idx); });
      dots.forEach(function (x, j) { x.classList.toggle("on", j === idx); });
    }
    function auto() { clearInterval(timer); if (!reduced) timer = setInterval(function () { go(idx + 1); }, 6500); }
    $("[data-prev]", car).addEventListener("click", function () { go(idx - 1); auto(); });
    $("[data-next]", car).addEventListener("click", function () { go(idx + 1); auto(); });
    var sx = 0, dx = 0, down = false;
    vp.addEventListener("pointerdown", function (e) { down = true; sx = e.clientX; dx = 0; vp.classList.add("drag"); });
    win.addEventListener("pointermove", function (e) { if (down) dx = e.clientX - sx; });
    win.addEventListener("pointerup", function () { if (!down) return; down = false; vp.classList.remove("drag"); if (Math.abs(dx) > 50) { go(idx + (dx < 0 ? 1 : -1)); auto(); } });
    cards.forEach(function (c, j) { c.addEventListener("click", function () { if (Math.abs(dx) < 6 && j !== idx) { go(j); auto(); } }); });
    win.addEventListener("resize", function () { go(idx); });
    go(idx); auto();
  });

  /* ---------------- flow: visitors -> buyers ---------------- */
  var flow = $("[data-flow]");
  if (flow && win.matchMedia("(min-width: 901px)").matches) {
    var sticky = $(".flow-sticky", flow), svg = $(".flow-svg", flow), fcards = $$(".fcard", flow), head = $(".flow-head .dimword", flow), tail = $(".flow-tail", flow);
    var NS = "http://www.w3.org/2000/svg", paths = [];
    function el(tag, attrs, parent) { var e = doc.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
    function build() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      paths = [];
      var sr = sticky.getBoundingClientRect();
      var defs = el("defs", {});
      var f = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
      el("feGaussianBlur", { stdDeviation: "3", result: "b" }, f);
      var mg = el("feMerge", {}, f); el("feMergeNode", { in: "b" }, mg); el("feMergeNode", { in: "SourceGraphic" }, mg);
      var hb = $(".flow-head .h2", flow).getBoundingClientRect(), tb = $(".flow-tail .h2", flow).getBoundingClientRect();
      var startX = hb.left - sr.left + hb.width / 2, startY = hb.bottom - sr.top + 18;
      var cr = fcards.map(function (c) { var r = c.getBoundingClientRect(); return { x: r.left - sr.left + r.width / 2, top: r.top - sr.top, bottom: r.bottom - sr.top, left: r.left - sr.left, right: r.right - sr.left }; });
      var busY = cr[0].top - 34, endX = tb.left - sr.left + tb.width / 2, endY = tb.top - sr.top - 6, meetY = endY - 40;
      var dIn = cr.map(function (c) { return "M" + startX + " " + startY + " V" + (busY - 14) + " Q" + startX + " " + busY + " " + (startX + (c.x > startX ? 14 : c.x < startX ? -14 : 0)) + " " + busY + " H" + (c.x + (c.x > startX ? -14 : 14)) + " Q" + c.x + " " + busY + " " + c.x + " " + (busY + 14) + " V" + (c.top - 2); });
      var dOut = cr.map(function (c, i) { var lane = endX + (i - 1.5) * 9; return "M" + c.x + " " + (c.bottom + 2) + " V" + (meetY - 40) + " C" + c.x + " " + (meetY - 5) + " " + lane + " " + (meetY - 25) + " " + lane + " " + meetY + " V" + endY; });
      var g = el("g", { filter: "url(#glow)" });
      [dIn, dOut].forEach(function (set, si) {
        set.forEach(function (d) {
          var m = el("mask", { id: "m" + paths.length, maskUnits: "userSpaceOnUse" }, defs);
          var reveal = el("path", { d: d, fill: "none", stroke: "#fff", "stroke-width": "8", "stroke-linecap": "round" }, m);
          var len = reveal.getTotalLength(); reveal.setAttribute("stroke-dasharray", len); reveal.setAttribute("stroke-dashoffset", len);
          el("path", { d: d, fill: "none", stroke: "rgba(255,255,255,0.10)", "stroke-width": "2", "stroke-dasharray": "2.2 3.2" }, svg);
          el("path", { d: d, fill: "none", stroke: "#F3EEFF", "stroke-width": "2.4", "stroke-dasharray": "2.2 3.2", mask: "url(#m" + paths.length + ")" }, g);
          paths.push({ reveal: reveal, len: len, phase: si });
        });
      });
      onFlow();
    }
    function onFlow() {
      var r = flow.getBoundingClientRect(), total = flow.offsetHeight - win.innerHeight;
      var p = clamp(-r.top / total, 0, 1);
      var pin = clamp((p - 0.06) / 0.38, 0, 1), pout = clamp((p - 0.5) / 0.36, 0, 1);
      paths.forEach(function (o) { var q = o.phase === 0 ? pin : pout; o.reveal.setAttribute("stroke-dashoffset", o.len * (1 - q)); });
      if (head) head.classList.toggle("lit", p > 0.02);
      fcards.forEach(function (c, i) { c.classList.toggle("lit", pin > 0.82 + i * 0.03 || pout > 0); });
      if (tail) tail.classList.toggle("lit", pout > 0.95);
      flowP = p;
    }
    var flowP = 0;
    win.addEventListener("scroll", onFlow, { passive: true });
    var rt = 0; win.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(build, 150); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(build); else setTimeout(build, 300);
    halftone($(".flow-canvas", flow), {
      gap: 11, max: 2.6, speed: 0.5, hi: "#FFFFFF", lo: "#A68EFA", alpha: 0.75,
      mask: function (x, y, t) {
        var show = clamp((flowP - 0.72) / 0.2, 0, 1);
        var hill = Math.exp(-Math.pow((x - 0.5) / 0.26, 2)) * clamp((y - 0.78) * 4.5, 0, 1);
        var noise = 0.55 + 0.45 * Math.sin(x * 40 + Math.sin(y * 30 + t) * 2);
        var ambient = 0.18 * clamp(1 - Math.abs(y - 0.5) * 2.2, 0, 1) * (0.5 + 0.5 * Math.sin(x * 9 + t * 0.6));
        return clamp(hill * noise * show * 1.2 + ambient * 0.5, 0, 1);
      }
    });
  }

  /* ---------------- agent view ---------------- */
  var agent = $(".agent-view"), pre = $("[data-agent-pre]"), md = $("#agent-md"), toggles = $$("[data-view]");
  function openAgent() { if (!agent) return; if (pre && md) pre.textContent = md.textContent.trim(); agent.classList.add("open"); agent.setAttribute("aria-hidden", "false"); toggles.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-view") === "agent"); }); }
  function closeAgent() { if (!agent) return; agent.classList.remove("open"); agent.setAttribute("aria-hidden", "true"); toggles.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-view") === "human"); }); }
  toggles.forEach(function (b) { b.addEventListener("click", function () { b.getAttribute("data-view") === "agent" ? openAgent() : closeAgent(); }); });
  $$("[data-agent-open]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); openAgent(); }); });
  $$("[data-agent-close]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); closeAgent(); }); });
})();
