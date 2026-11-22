/* TrooCRO page features: measured on the page as a shopper sees it on a phone (390px wide, first screen 844px).
   Works on any document: the calibration harness and the live analyzer run this same function. */
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
  var cta = null;
  all("button, input[type=submit], a, [role=button]").some(function (el) {
    var t = tx(el) || el.value || "";
    if (t.length > 36 || !ATC.test(t)) return false;
    if (!vis(el)) return false;
    var r = R(el); if (r.w < 60 || r.h < 24) return false;
    cta = el; return true;
  });
  var ctaR = cta ? R(cta) : null;
  F.cta_found = cta ? 1 : 0;
  F.cta_atf = ctaR ? (ctaR.y < VH ? 1 : ctaR.y < VH * 1.6 ? 0.5 : 0) : 0;
  F.cta_height = ctaR ? Math.min(64, ctaR.h) : 0;
  F.cta_width = ctaR ? Math.min(1, ctaR.w / (VW - 24)) : 0;
  if (cta) {
    var s = cs(cta), bl = lum(s.backgroundColor), fl = lum(s.color);
    var own = bl == null ? bgOf(cta.parentElement) : bl, page = bgOf(cta.parentElement);
    F.cta_contrast = Math.min(8, contrast(own, page)); // button vs page
    F.cta_text_contrast = Math.min(15, contrast(own, fl == null ? 0 : fl));
    F.cta_filled = bl != null && Math.abs(bl - page) > 0.15 ? 1 : 0;
  } else { F.cta_contrast = 1; F.cta_text_contrast = 1; F.cta_filled = 0; }

  /* price and offer */
  var priceEl = null;
  all("[class*=price], [id*=price], [data-price]").some(function (el) { var t = tx(el); if (!/\d/.test(t) || t.length > 80 || !vis(el)) return false; var r = R(el); if (r.y > 2200) return false; priceEl = el; return true; });
  var pR = priceEl ? R(priceEl) : null;
  F.price_atf = pR ? (pR.y < VH ? 1 : pR.y < VH * 1.6 ? 0.5 : 0) : 0;
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
  return F;
}
if (typeof module !== "undefined") module.exports = croFeatures;
