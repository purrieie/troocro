  var CRO_MODEL = {"names": ["cta_atf", "cta_filled", "sticky_cta", "price_atf", "rating_top", "offer", "delivery_near", "trust_near", "benefits", "structure", "breadcrumb", "compare", "faq", "social", "reviews", "gallery", "video", "crosssell", "variants", "cta_contrast", "no_overflow", "short_title", "no_wall", "no_popup"], "mu": [0.55, 0.7167, 0.6167, 0.625, 0.6667, 0.6667, 0.4, 0.4292, 0.4167, 0.5489, 0.4833, 0.5167, 0.75, 0.1333, 0.2714, 0.9139, 0.5667, 0.4167, 0.45, 0.7231, 0.8833, 0.9394, 0.15, 0.7667], "sd": [0.4252, 0.4506, 0.4862, 0.4044, 0.4714, 0.4714, 0.4899, 0.3294, 0.4362, 0.3805, 0.4997, 0.4997, 0.433, 0.3399, 0.3997, 0.2075, 0.3223, 0.493, 0.489, 0.3399, 0.321, 0.1456, 0.2784, 0.423], "w": [0.0848, 0.0292, 0.0589, 0.0193, 0.0537, 0.0015, 0.0417, 0.0078, 0.0486, 0.0468, 0.0406, 0.0, 0.0187, 0.0207, 0.0194, 0.018, 0.0, 0.0235, 0.0053, 0.0, 0.0702, 0.0338, 0.0354, 0.0], "anchors": [-0.3261, -0.0307, 0.1512], "n": 60};
  var CRO_LABEL = {
    cta_atf: "Add to cart on the first screen", cta_filled: "Solid, high-contrast main button", sticky_cta: "Add to cart stays in reach while scrolling",
    price_atf: "Price on the first screen", rating_top: "Star rating near the product name", offer: "Discount or MRP next to the price",
    delivery_near: "Delivery date next to the button", trust_near: "Reassurance badges by the button", benefits: "Scannable benefit points",
    structure: "Clear sections and headings", breadcrumb: "Breadcrumbs to find the way back", faq: "Answers to common questions",
    social: "Brand-scale proof (customers, press)", reviews: "Review count shown", gallery: "A real product photo gallery",
    crosssell: "Bundles or cross-sell", variants: "Easy variant buttons", no_overflow: "Page fits the phone screen",
    short_title: "Short, scannable product name", no_wall: "No walls of text", compare: "Comparison table", video: "Product video",
    cta_contrast: "Button stands out from the page", no_popup: "No popups covering the page"
  };
  function croVector(f) {
    function cap(v, c) { return Math.min(v || 0, c) / c; }
    return { cta_atf: f.cta_atf, cta_filled: f.cta_filled, sticky_cta: f.sticky_cta, price_atf: f.price_atf, rating_top: f.rating_top, offer: f.offer,
      delivery_near: f.delivery_near, trust_near: cap(f.trust_near, 4), benefits: cap(f.benefit_bullets, 6), structure: cap(f.headings, 15),
      breadcrumb: f.breadcrumb, compare: f.compare_table, faq: f.faq, social: f.social_scale, reviews: cap(f.review_count_log, 3), gallery: cap(f.gallery, 6),
      video: f.video, crosssell: f.crosssell, variants: f.variants_ui, cta_contrast: cap(f.cta_contrast, 4), no_overflow: 1 - (f.overflow || 0),
      short_title: 1 - Math.max(0, Math.min(1, ((f.title_len || 0) - 60) / 60)), no_wall: 1 - (f.text_wall || 0) / 2, no_popup: 1 - Math.min(f.fixed_layers || 0, 1) };
  }
  /* Homepages and collection pages: in our benchmark, layout signals alone did not separate strong from weak brands
     the way product-page signals did, so these use a research-weighted rubric (Baymard homepage and product-list
     guidelines plus the TrooCRO barrier library), placed on the same scale by where the page sits among
     the benchmark stores' pages of the same type (20th percentile = 30, median = 55, 80th = 80). */
  function croScoreOf(f) {
    if (!f) return null;
    var M = CRO_MODEL, v = croVector(f), raw = 0, parts = [];
    M.names.forEach(function (n, i) { var c = M.w[i] * ((+v[n] || 0) - M.mu[i]) / M.sd[i]; raw += c; if (M.w[i] > 0) parts.push({ k: n, c: c, on: (+v[n] || 0) >= 0.5 }); });
    var a = M.anchors, sc;
    if (raw >= a[2]) sc = 80 + 18 * (1 - Math.exp(-(raw - a[2]) / (a[2] - a[1])));
    else if (raw <= a[0]) sc = 30 - 25 * (1 - Math.exp(-(a[0] - raw) / (a[1] - a[0])));
    else if (raw <= a[1]) sc = 30 + 25 * (raw - a[0]) / (a[1] - a[0]);
    else sc = 55 + 25 * (raw - a[1]) / (a[2] - a[1]);
    parts.sort(function (x, y) { return y.c - x.c; });
    return { score: Math.round(sc), raw: Math.round(raw * 1000) / 1000, up: parts.filter(function (x) { return x.c > 0.004; }).slice(0, 4).map(function (x) { return x.k; }),
      down: parts.filter(function (x) { return x.c < -0.004; }).reverse().slice(0, 4).map(function (x) { return x.k; }), f: f, v: 3, n: M.n };
  }
  /* measure in a hidden phone-sized frame, exactly like the benchmark */
