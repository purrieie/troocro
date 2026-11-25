/* TrooCRO contact form: saves the request to the TrooCRO lead table (Supabase free plan). */
(function () {
  "use strict";
  var doc = document, win = window;
  var CFG = win.TROOCRO_CONFIG || {};
  var API = String(CFG.api || "").replace(/\/+$/, "");
  var WA = CFG.whatsapp || "919810483552";
  var form = doc.querySelector("[data-ct-form]");
  if (!form) return;
  var F = function (n) { return form.elements[n]; };
  var err = doc.querySelector("[data-ct-err]");
  var qs = new URLSearchParams(win.location.search);
  var site = (qs.get("site") || "").replace(/[^a-z0-9.-]/gi, "").slice(0, 120);
  var report = (qs.get("report") || "").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  if (site) {
    F("website").value = site;
    var att = doc.querySelector("[data-ct-attach]");
    if (att) {
      att.hidden = false;
      att.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M4.5 8h7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span></span>';
      att.querySelector("span").textContent = report ? "Your site analysis for " + site + " will be attached." : "We'll look at " + site + " before the call.";
    }
    var cb = form.querySelector('input[value="Barrier-led CRO and A/B testing"]'); if (cb) cb.checked = true;
  }
  if (win.location.hash === "#demo") { var f = form.querySelector('input[name="name"]'); if (f) setTimeout(function () { f.focus(); }, 300); }

  function setInvalid(name, bad) { var el = F(name); if (el && el.setAttribute) el.setAttribute("aria-invalid", bad ? "true" : "false"); }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = F("name").value.trim(), email = F("email").value.trim();
    var interests = Array.prototype.slice.call(form.querySelectorAll('input[name="interests"]:checked')).map(function (x) { return x.value; });
    setInvalid("name", !name); setInvalid("email", false);
    if (!name) { err.textContent = "Add your name."; F("name").focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setInvalid("email", true); err.textContent = "Enter a valid email address."; F("email").focus(); return; }
    err.textContent = "";
    var btn = form.querySelector(".ct-submit"), label = btn.innerHTML;
    btn.disabled = true; btn.textContent = "Sending…";
    var waText = "Hi TrooCRO, I'm " + name + (F("website").value.trim() ? " from " + F("website").value.trim() : "") + ". I'd like to book a demo.";
    function done() {
      doc.querySelector("[data-ct-formwrap]").hidden = true;
      var d = doc.querySelector("[data-ct-done]"); d.hidden = false;
      doc.querySelector("[data-ct-done-title]").textContent = "Thanks, " + name.split(" ")[0] + ". Your request is in.";
      doc.querySelector("[data-ct-wa]").href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(waText);
    }
    if (!API) { btn.disabled = false; btn.innerHTML = label; err.textContent = "The form isn't connected here. Message us on WhatsApp instead."; return; }
    var ctl = win.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : 0;
    fetch(API + "/lead", {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ source: "contact", name: name, email: email, website: F("website").value.trim(), interests: interests, message: F("message").value.trim(), scanSlug: report, hp: F("hp_field").value })
    }).then(function (r) {
      clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Couldn't send that. Try again."); return j; });
    }).then(done).catch(function (x) {
      btn.disabled = false; btn.innerHTML = label;
      err.innerHTML = "";
      var msg = x && x.name === "AbortError" ? "That took too long. " : x && x.name === "TypeError" ? "We couldn't reach our server from here. " : (x && x.message ? x.message + " " : "");
      err.appendChild(doc.createTextNode(msg));
      var a = doc.createElement("a"); a.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(waText); a.target = "_blank"; a.rel = "noopener"; a.className = "an-link"; a.textContent = "Message us on WhatsApp instead.";
      err.appendChild(a);
    });
  });
})();
