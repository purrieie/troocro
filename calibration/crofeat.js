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
if (typeof module !== "undefined") module.exports = croFeatures;
