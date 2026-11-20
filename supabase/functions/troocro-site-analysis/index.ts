// TrooCRO site analyzer: edge function for the TrooCRO website clone.
// Routes: GET /health, POST /scan, GET /psi, POST /save, GET /report, POST /lead
// Free-plan friendly: no paid APIs. Uses the TrooCRO signal library (ref_signals, ref_fixes,
// ref_barriers, ref_root_causes, ref_benchmarks) read-only, and writes only to sa_scans / sa_leads.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseHTML } from "npm:linkedom@0.18.12";
import { compactPsi, psiUrl } from "./psi.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const sb = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

const PSI_KEY_NAMES = ["PSI_API_KEY", "PAGESPEED_API_KEY", "GOOGLE_PSI_API_KEY", "PAGESPEED_KEY", "PSI_KEY", "GOOGLE_PAGESPEED_API_KEY", "GOOGLE_API_KEY"];
function psiKey(): string {
  for (const n of PSI_KEY_NAMES) { const v = Deno.env.get(n); if (v) return v; }
  return "";
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 TrooCRO-Analyzer/1.0";

// ---------------------------------------------------------------- utils
function normalizeUrl(input: string): URL {
  let s = String(input || "").trim();
  if (!s) throw new HttpError(400, "Enter your website's address, like yourstore.com.");
  if (s.length > 500) throw new HttpError(400, "That address is too long.");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try { u = new URL(s); } catch { throw new HttpError(400, "That doesn't look like a website address."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new HttpError(400, "Use an http or https address.");
  if (u.port && !["80", "443"].includes(u.port)) throw new HttpError(400, "Use a standard website address.");
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.endsWith(".arpa")) {
    throw new HttpError(400, "Use a public website address.");
  }
  u.hash = "";
  return u;
}

async function sha(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("troocro-sa:" + s));
  return Array.from(new Uint8Array(b)).slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
}
function slugId(n = 10): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r).map((x) => chars[x % chars.length]).join("");
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const clean = (s: string) => String(s || "").replace(/\s+/g, " ").trim();

async function fetchText(u: URL | string, opts: { timeout?: number; maxBytes?: number; accept?: string } = {}) {
  const timeout = opts.timeout ?? 15000, maxBytes = opts.maxBytes ?? 4_000_000;
  let current = typeof u === "string" ? new URL(u) : u;
  const t0 = performance.now();
  let res: Response | null = null;
  for (let i = 0; i < 6; i++) {
    res = await fetch(current.href, {
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept": opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-IN,en;q=0.9" },
      signal: AbortSignal.timeout(timeout),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, current);
      normalizeUrl(next.href);
      try { await res.body?.cancel(); } catch { /* ignore */ }
      current = next;
      continue;
    }
    break;
  }
  if (!res) throw new HttpError(502, "No response");
  const ttfbMs = Math.round(performance.now() - t0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      if (received > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } break; }
    }
  }
  const buf = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, received - off)), off); off += c.length; if (off >= received) break; }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return { status: res.status, finalUrl: current, contentType: res.headers.get("content-type") || "", text, bytes: received, ttfbMs };
}

async function fetchQuiet(u: string, timeout = 7000) {
  try { return await fetchText(u, { timeout, maxBytes: 400_000, accept: "text/plain,text/xml,application/xml,*/*;q=0.5" }); }
  catch { return null; }
}

// ------------------------------------------------------------- library
type Lib = { signals: Record<string, any>; barriers: Record<string, any>; rootCauses: Record<string, string>; benchmarks: any[]; at: number };
let LIB: Lib | null = null;
const ALL_SIGNALS = [
  "SIG-HOME-F-HEROINTENTUNCLEA-01", "SIG-LP-F-CTAAMBIGUITY-01", "SIG-LP-F-WEAKCTALANGUA-01", "SIG-PDP-F-PRIMARYCTAMISS-01", "SIG-PDP-F-STICKYCTAMISS-01",
  "SIG-PDP-F-NOPRICEANCHOR-01", "SIG-PDP-F-PRICEVISIBILITYMISS-01", "SIG-PDP-F-REVIEWVISIBILITYMISS-01", "SIG-LP-F-PROOFDENSITTOO-01", "SIG-PDP-F-TRUSTBADGESMISSING-01",
  "SIG-PDP-F-SHIPPINGRETURNUNCLEAR-01", "SIG-PDP-F-CODELIGIBILITYMISS-01", "SIG-PDP-F-PINCODEDELIVERYCHECK-01", "SIG-PDP-F-GUARANTEEMISS-01", "SIG-PDP-E-FAQMICROA-01",
  "SIG-PDP-F-NOURGENCY-01", "SIG-ALL-F-CONTACTACCESSWEAK-01", "SIG-ALL-F-LIVECHATABSENT-01", "SIG-ALL-F-PRIVACYPOLICYACCESSWEAK-01", "SIG-SEARCH-F-NOSEARCHBAR-01",
  "SIG-ALL-F-NEWSLETTERINCENTIVEUNCLEAR-01", "SIG-ALL-F-PHYSICALADDRESSMISS-01", "SIG-HOME-F-FOUNDERSTORYMISS-01", "SIG-PDP-E-BUNDLEANCHOR-01", "SIG-PDP-F-EMISPLITPAYMISS-01",
  "SIG-MOB-F-VIEWPORTNOTSET-01", "SIG-A11Y-F-LANGATTRMISS-01", "SIG-PDP-F-VARIANTOVERLOAD-01", "SIG-BPC-HOME-F-01", "SIG-BPC-HOME-F-03", "SIG-BPC-HOME-F-04",
  "SIG-FA-HOME-F-01", "SIG-FA-HOME-F-04", "SIG-HW-HOME-F-01", "SIG-HW-HOME-F-02", "SIG-HW-HOME-F-04", "SIG-HL-HOME-F-01", "SIG-HL-HOME-F-03", "SIG-FB-HOME-F-01",
  "SIG-FB-HOME-F-02", "SIG-HOME-F-HALLMARKTRUSTBAR-01", "SIG-HOME-F-OCCASIONNAVMISS-01", "SIG-HOME-F-GIFTGUIDEMISS-01", "SIG-EG-HOME-F-02", "SIG-EG-HOME-F-03",
  "SIG-BK-HOME-F-01", "SIG-BK-HOME-F-02", "SIG-PC-HOME-F-01", "SIG-PC-HOME-F-02", "SIG-SF-HOME-F-01", "SIG-ALL-F-SLOWLCP-01", "SIG-PERF-F-LCPABOVE25-01",
  "SIG-PERF-F-CLSABOVE01-01", "SIG-ALL-F-JSBLOCKING-01", "SIG-ALL-F-THIRDPARTYAPPDELAY-01", "SIG-PERF-F-TTFBHIGH-01", "SIG-PERF-F-IMAGEFORMATSUBOPTIMAL-01",
  "SIG-ALL-F-COREWEBVITALS-01", "SIG-PERF-F-INPABOVE200-01", "SIG-PERF-F-FONTLOADINGFOIT-01", "SIG-A11Y-F-CONTRASTTEXTLOW-01", "SIG-A11Y-F-CONTRASTCTALOW-01",
  "SIG-A11Y-F-ALTTEXTMISSING-01", "SIG-A11Y-F-ARIALABELSMISS-01", "SIG-MOB-F-TOUCHTARGETSIZE-01", "SIG-A11Y-F-HEADINGHIERARCHYBROKEN-01", "SIG-A11Y-F-LINKTEXTGENERIC-01",
];
// Library rows whose solutions in ref_fixes do not match the signal: show the playbook only.
const SKIP_SOLUTIONS = new Set(["SIG-MOB-F-VIEWPORTNOTSET-01", "SIG-PDP-F-EMISPLITPAYMISS-01"]);

async function getLibrary(): Promise<Lib> {
  if (LIB && Date.now() - LIB.at < 10 * 60 * 1000) return LIB;
  const empty: Lib = { signals: {}, barriers: {}, rootCauses: {}, benchmarks: [], at: Date.now() };
  if (!sb) return empty;
  const [sig, fix, bar, rc, bench] = await Promise.all([
    sb.from("ref_signals").select("id,name,surface,severity,root_cause,barriers,failure_mode").in("id", ALL_SIGNALS),
    sb.from("ref_fixes").select("signal_id,effort,impact,test_type,playbook,solutions").in("signal_id", ALL_SIGNALS),
    sb.from("ref_barriers").select("id,name,description,type"),
    sb.from("ref_root_causes").select("id,description"),
    sb.from("ref_benchmarks").select("category,aov_band,atc_rate,cart_checkout_rate,checkout_purchase_rate,store_cvr"),
  ]);
  const fixes: Record<string, any> = {};
  for (const f of fix.data || []) fixes[f.signal_id] = f;
  const signals: Record<string, any> = {};
  for (const s of sig.data || []) {
    const f = fixes[s.id] || {};
    const sols = Array.isArray(f.solutions) ? f.solutions.map((x: any) => (typeof x === "string" ? x : x && x.text)).filter(Boolean).slice(0, 2) : [];
    signals[s.id] = {
      name: s.name, surface: s.surface, severity: s.severity || 1, rootCause: s.root_cause || "", barriers: Array.isArray(s.barriers) ? s.barriers : [],
      failureMode: s.failure_mode || "",
      fix: { effort: f.effort || null, impact: f.impact || null, testType: f.test_type || null, playbook: f.playbook || "", solutions: SKIP_SOLUTIONS.has(s.id) ? [] : sols },
    };
  }
  const barriers: Record<string, any> = {};
  for (const b of bar.data || []) barriers[b.id] = { name: b.name, description: b.description, type: b.type };
  const rootCauses: Record<string, string> = {};
  for (const r of rc.data || []) rootCauses[r.id] = r.description;
  LIB = { signals, barriers, rootCauses, benchmarks: bench.data || [], at: Date.now() };
  return LIB;
}

// ------------------------------------------------------------- detection tables
const CATS: Record<string, string[]> = {
  "Beauty & Personal Care": ["skincare", "skin care", "serum", "moistur", "sunscreen", "face wash", "cleanser", "makeup", "lipstick", "haircare", "hair care", "shampoo", "conditioner", "beauty", "cosmetic", "fragrance", "perfume", "grooming", "shaving", "beard", "body wash", "lotion", "kajal", "nail", "deodorant", "razor"],
  "Fashion & Apparel": ["clothing", "apparel", "dress", "kurta", "kurti", "saree", "shirt", "t-shirt", "tshirt", "jeans", "trouser", "fashion", "ethnic wear", "lehenga", "innerwear", "lingerie", "jacket", "hoodie", "sneaker", "footwear", "shoes", "activewear", "boxers", "briefs", "co-ord"],
  "Jewellery & Accessories": ["jewellery", "jewelry", "earring", "necklace", "bracelet", "pendant", "diamond", "gold", "silver", "925", "bangle", "anklet", "mangalsutra", "handbag", "wallet", "sunglasses", "watches"],
  "Health & Wellness": ["supplement", "vitamin", "protein", "whey", "nutrition", "wellness", "ayurved", "immunity", "probiotic", "collagen", "ashwagandha", "capsule", "multivitamin", "omega", "electrolyte", "magnesium", "condom", "lubricant", "sexual wellness", "intimate", "gut health"],
  "Food & Beverages": ["snack", "chocolate", "coffee", " tea", "food", "beverage", "juice", "spice", "masala", "ghee", "honey", "nuts", "cookie", "granola", "peanut butter", "sauce", "pickle", "cereal", "flour", "millet", "drink"],
  "Home & Living": ["furniture", "sofa", "mattress", "home decor", "decor", "lamp", "cookware", "bedsheet", "curtain", "rug", "storage", "dining", "wardrobe", "cushion", "planter", "cleaning", "interior", "modular kitchen", "cabinet"],
  "Electronics & Gadgets": ["electronics", "gadget", "earbuds", "headphone", "speaker", "charger", "smartwatch", "laptop", "power bank", "bluetooth", "camera", " tws", "smart home"],
  "Baby & Kids": ["baby", "kids", "toddler", "infant", "newborn", "diaper", "nursery", "children"],
  "Pet Care": ["pet food", "pet ", "dog", "cat food", "puppy", "kitten", "pet treats", "litter"],
  "Sports & Fitness": ["fitness", "gym", "yoga", "sports", "running", "cricket", "badminton", "cycling", "workout", "dumbbell", "sportswear"],
  "Games & Toys": ["toys", "board game", "puzzle", "chess", "lego", "games"],
};

const TOOLS: Array<[string, string, RegExp]> = [
  ["Google Analytics 4", "analytics", /gtag\/js\?id=G-|['"]G-[A-Z0-9]{6,}['"]/],
  ["Google Tag Manager", "analytics", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ["Meta Pixel", "ads", /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(['"]init/],
  ["Google Ads", "ads", /AW-\d{6,}|googleadservices\.com|googlesyndication/],
  ["TikTok Pixel", "ads", /analytics\.tiktok\.com/],
  ["Snap Pixel", "ads", /sc-static\.net\/scevent/],
  ["LinkedIn Insight", "ads", /snap\.licdn\.com/],
  ["Criteo", "ads", /static\.criteo\.net/],
  ["Microsoft Clarity", "behavior", /clarity\.ms/],
  ["Hotjar", "behavior", /static\.hotjar\.com|hotjar\.com\/c\/hotjar/],
  ["FullStory", "behavior", /fullstory\.com\/s\/fs\.js|edge\.fullstory\.com/],
  ["Lucky Orange", "behavior", /luckyorange\.(com|net)/],
  ["Mouseflow", "behavior", /mouseflow\.com/],
  ["Klaviyo", "retention", /klaviyo/],
  ["Mailchimp", "retention", /chimpstatic\.com|list-manage\.com/],
  ["WebEngage", "retention", /webengage/],
  ["MoEngage", "retention", /moengage/],
  ["CleverTap", "retention", /clevertap/],
  ["Netcore", "retention", /netcoresmartech|smartech/],
  ["Omnisend", "retention", /omnisend/],
  ["Privy", "retention", /privy\.com/],
  ["Interakt", "retention", /interakt/],
  ["WATI", "retention", /wati\.io/],
  ["Gallabox", "retention", /gallabox/],
  ["AiSensy", "retention", /aisensy/],
  ["Zoko", "retention", /zoko/],
  ["Judge.me", "reviews", /judge\.me|judgeme/],
  ["Yotpo", "reviews", /yotpo/],
  ["Loox", "reviews", /loox\.io/],
  ["Okendo", "reviews", /okendo/],
  ["Stamped", "reviews", /stamped\.io/],
  ["Reviews.io", "reviews", /reviews\.io|reviews\.co\.uk/],
  ["Trustpilot", "reviews", /trustpilot/],
  ["Junip", "reviews", /junip/],
  ["Ryviu", "reviews", /ryviu/],
  ["Fera", "reviews", /fera\.ai/],
  ["Growave", "reviews", /growave/],
  ["Bazaarvoice", "reviews", /bazaarvoice/],
  ["VWO", "experiments", /visualwebsiteoptimizer|dev\.visualwebsiteoptimizer|vwo_code/],
  ["Optimizely", "experiments", /optimizely/],
  ["AB Tasty", "experiments", /abtasty/],
  ["Convert", "experiments", /cdn-\d+\.convertexperiments\.com|convert\.com\/js/],
  ["Coframe", "experiments", /cofra\.me|coframe/],
  ["Kameleoon", "experiments", /kameleoon/],
  ["Dynamic Yield", "experiments", /dynamicyield/],
  ["Nosto", "experiments", /nosto/],
  ["Rebuy", "experiments", /rebuyengine/],
  ["LimeSpot", "experiments", /limespot/],
  ["GoKwik", "checkout", /gokwik/],
  ["Shopflo", "checkout", /shopflo/],
  ["Fastrr (Shiprocket)", "checkout", /fastrr|shiprocket/],
  ["Razorpay", "checkout", /razorpay/],
  ["Simpl", "checkout", /getsimpl|simpl\.in/],
  ["Snapmint", "checkout", /snapmint/],
  ["Searchanise", "search", /searchanise/],
  ["Boost Commerce", "search", /boostcommerce|bc-sf-filter/],
  ["Algolia", "search", /algolia/],
  ["Klevu", "search", /klevu/],
  ["WhatsApp chat", "support", /href=["'][^"']*(wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/)|whatsapp-(button|widget|chat|float)/i],
  ["Gorgias", "support", /gorgias/],
  ["Intercom", "support", /intercom/],
  ["Tawk.to", "support", /tawk\.to/],
  ["Crisp", "support", /crisp\.chat/],
  ["Freshchat", "support", /freshchat|freshworks/],
  ["Zendesk", "support", /zdassets|zendesk/],
  ["Tidio", "support", /tidio/],
  ["Kommunicate", "support", /kommunicate/],
  ["Haptik", "support", /haptik/],
  ["Verloop", "support", /verloop/],
];
const ESSENTIALS: Array<[string, string, string[]]> = [
  ["analytics", "Analytics", ["analytics"]],
  ["behavior", "Heatmaps and recordings", ["behavior"]],
  ["ads", "Ad pixels", ["ads"]],
  ["retention", "Email, SMS or WhatsApp marketing", ["retention"]],
  ["reviews", "Reviews app", ["reviews"]],
  ["experiments", "Testing or personalisation", ["experiments"]],
];

const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "CCBot", "Applebot-Extended"];
const AI_SEARCH_BOTS = ["ChatGPT-User", "OAI-SearchBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User"];

function robotsBlocked(robots: string): string[] {
  const lines = robots.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  const groups: Array<{ agents: string[]; disallowAll: boolean; allowAll: boolean }> = [];
  let cur: { agents: string[]; disallowAll: boolean; allowAll: boolean } | null = null;
  let lastWasAgent = false;
  for (const l of lines) {
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallowAll: false, allowAll: false }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (k === "disallow" && v === "/") cur.disallowAll = true;
      if (k === "allow" && v === "/") cur.allowAll = true;
    }
  }
  const blocked: string[] = [];
  const star = groups.find((g) => g.agents.includes("*"));
  for (const bot of AI_BOTS) {
    const g = groups.find((x) => x.agents.includes(bot.toLowerCase()));
    if (g ? g.disallowAll && !g.allowAll : !!(star && star.disallowAll && !star.allowAll)) blocked.push(bot);
  }
  return blocked;
}

// ------------------------------------------------------------- analysis
const ACTION_RE = /^(shop|buy|add to (cart|bag)|order|get|start|book|try|subscribe|explore|discover|learn|view|see|claim|grab|join|sign ?up|download|contact|call|chat|enquire|request|apply|find|take|check|unlock|save|reserve|pre-?order)\b/i;
const GENERIC_CTA = /^(shop now|learn more|read more|know more|click here|submit|explore|explore now|discover|discover more|view more|see more|view all|see all|continue|go|ok|more)$/i;
const ATC_RE = /add to (cart|bag|basket)|buy (it )?now|buy now|add to order/i;
const UTILITY = /^(skip to (main )?content|skip|open menu|close( menu)?|menu|search( products| our store)?|cart|bag|account|log ?in|sign ?in|wishlist|checkout( loading\.*)?|continue shopping|view cart|my account|english|en|inr|usd|toggle( menu)?|previous|next|prev|play|pause|accept( all)?|reject( all)?|ok|got it)$/i;

function bandFor(v: number | null): string | null {
  if (v == null || !isFinite(v)) return null;
  if (v < 500) return "< ₹500";
  if (v < 2000) return "₹500–₹2,000";
  if (v < 5000) return "₹2,000–₹5,000";
  return "₹5,000+";
}

function analyze(html: string, finalUrl: URL, extras: { robots: any; llms: any; sitemap: any; ttfbMs: number; bytes: number; product: any }, opts: any) {
  const raw = html;
  const rawLower = raw.toLowerCase();

  // JSON-LD before stripping scripts
  const ldTypes = new Set<string>();
  let aggRating: any = null;
  let hasPostalAddress = false;
  const ldPrices: number[] = [];
  for (const m of raw.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const walk = (o: any) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        const t = o["@type"];
        (Array.isArray(t) ? t : [t]).filter(Boolean).forEach((x: string) => ldTypes.add(String(x)));
        if (o.aggregateRating && typeof o.aggregateRating === "object") {
          aggRating = { value: parseFloat(o.aggregateRating.ratingValue) || null, count: parseInt(o.aggregateRating.reviewCount || o.aggregateRating.ratingCount) || null };
        }
        if (String(t).includes("PostalAddress") || o.streetAddress) hasPostalAddress = true;
        if (o.offers) {
          const offs = Array.isArray(o.offers) ? o.offers : [o.offers];
          for (const of of offs) { const p = parseFloat(of && (of.price || of.lowPrice)); if (p > 0 && (!of.priceCurrency || of.priceCurrency === "INR")) ldPrices.push(p); }
        }
        for (const k of Object.keys(o)) if (k !== "aggregateRating" && typeof o[k] === "object") walk(o[k]);
      };
      walk(data);
    } catch { /* ignore broken JSON-LD */ }
  }

  const scriptSrcs = Array.from(raw.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)).map((m) => m[1]);
  const inlineScripts = (raw.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || []).length;
  const styleLinks = (raw.match(/<link[^>]+rel=["']?stylesheet/gi) || []).length;

  const stripped = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "<svg></svg>")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const document: any = (parseHTML(stripped.length > 2_500_000 ? stripped.slice(0, 2_500_000) : stripped) as any).document;
  const q = (sel: string, root: any = document): any[] => { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } };
  const txt = (el: any) => clean(el ? el.textContent || "" : "");

  const metas: Record<string, string> = {};
  for (const m of q("meta")) {
    const k = (m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("itemprop") || "").toLowerCase();
    if (k && !metas[k]) metas[k] = clean(m.getAttribute("content") || "");
  }
  const title = clip(txt(q("title")[0]), 160);
  const description = clip(metas["description"] || metas["og:description"] || "", 300);
  const htmlEl = q("html")[0];
  const lang = (htmlEl && htmlEl.getAttribute("lang")) || (raw.match(/<html[^>]*\slang=["']?([a-zA-Z-]+)/i) || [])[1] || "";
  const viewport = metas["viewport"] || "";
  const canonical = (q('link[rel="canonical"]')[0] || { getAttribute: () => "" }).getAttribute("href") || "";
  const mdAlternate = q('link[rel="alternate"]').some((l: any) => /markdown/i.test(l.getAttribute("type") || ""));

  const body = document.body || document.documentElement;
  const bodyText = clean(body ? body.textContent || "" : "").slice(0, 300_000);
  const lower = bodyText.toLowerCase();
  const words = bodyText ? bodyText.split(" ").length : 0;

  const h1s = q("h1").map(txt).filter(Boolean).map((s: string) => clip(s, 140));
  const h2s = q("h2").map(txt).filter(Boolean).slice(0, 12).map((s: string) => clip(s, 120));

  const headerEls = q("header, nav, [role=navigation]");
  const navText = clean(headerEls.map(txt).join(" ")).toLowerCase().slice(0, 20000);
  const footerEls = q("footer");
  const footerText = clean(footerEls.map(txt).join(" ")).slice(0, 20000);
  const links = q("a[href]");
  const hrefs = links.map((a: any) => (a.getAttribute("href") || "").toLowerCase());
  const linkTexts = links.map((a: any) => txt(a).toLowerCase()).filter(Boolean);

  // CTA candidates
  const ctaEls = q("button, a[href], input[type=submit], input[type=button], [role=button]").filter((el: any) => {
    if (el.closest && el.closest("footer")) return false;
    const t = txt(el) || el.getAttribute("value") || el.getAttribute("aria-label") || "";
    if (!t || t.length > 42) return false;
    const cls = (el.getAttribute("class") || "").toLowerCase();
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "INPUT") return ACTION_RE.test(t) || /btn|button|cta/.test(cls);
    return /btn|button|cta/.test(cls) || ACTION_RE.test(t);
  });
  const ctaText = (el: any) => {
    let t = clean(txt(el) || el.getAttribute("value") || el.getAttribute("aria-label") || "");
    t = t.replace(/\s+(adding|loading|processing|added|sold out|please wait)\.{0,3}$/i, "").replace(/^(.{3,40}?)\s+\1$/i, "$1");
    return clip(t, 42);
  };

  // hero region: first content blocks after header/nav
  const main = q("main")[0] || body;
  const heroEls: any[] = [];
  let acc = 0;
  for (const child of Array.from((main && main.children) || []) as any[]) {
    const tn = child.tagName;
    if (["HEADER", "NAV", "SCRIPT", "STYLE", "TEMPLATE"].includes(tn)) continue;
    const t = txt(child);
    if (!t && !q("img, video, picture", child).length) continue;
    heroEls.push(child);
    acc += t.length;
    if (acc > 900 || heroEls.length >= 3) break;
  }
  const heroText = clean(heroEls.map(txt).join(" ")).slice(0, 4000);
  const heroCtas = Array.from(new Set(heroEls.flatMap((el: any) => ctaEls.filter((c: any) => el === c || (el.contains && el.contains(c))).map(ctaText)).filter((t: string) => t && !UTILITY.test(t.trim()))));
  const heroLinkedImages = heroEls.some((el: any) => q("a img, a picture", el).length > 0 || (el.tagName === "A" && q("img", el).length > 0));
  const pageCtas = Array.from(new Set(ctaEls.map(ctaText).filter((t: string) => t && !UTILITY.test(t.trim())))).slice(0, 14);
  const bodyCtas = Array.from(new Set(ctaEls.filter((el: any) => !(el.closest && el.closest("header, nav, [role=navigation]"))).map(ctaText).filter((t: string) => t && !UTILITY.test(t.trim()))));
  const heroHeadline = h1s[0] || (heroEls.length ? clip(txt(q("h2, h3, p", heroEls[0])[0]), 140) : "");

  // forms
  const forms = q("form");
  const emailInputs = q("input[type=email], input[name*=email], input[placeholder*=email], input[placeholder*=Email]");
  const atcForm = forms.some((f: any) => /\/cart\/add/i.test(f.getAttribute("action") || ""));
  const atcButton = ctaEls.some((c: any) => ATC_RE.test(ctaText(c))) || q("button, input[type=submit]").some((b: any) => ATC_RE.test(txt(b) || b.getAttribute("value") || ""));

  // images
  const imgs = q("img");
  const imgsNoAlt = imgs.filter((i: any) => !i.hasAttribute("alt")).length;
  const imgsNoDims = imgs.filter((i: any) => !i.getAttribute("width") && !i.getAttribute("height")).length;

  // a11y-lite
  const btnNoName = q("button, [role=button]").filter((b: any) => !txt(b) && !b.getAttribute("aria-label") && !b.getAttribute("title") && !b.getAttribute("aria-labelledby")).length;
  const formFields = q("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea");
  const labelFor = new Set(q("label[for]").map((l: any) => l.getAttribute("for")));
  const inputsNoLabel = formFields.filter((i: any) => !i.getAttribute("aria-label") && !i.getAttribute("aria-labelledby") && !(i.id && labelFor.has(i.id)) && !(i.closest && i.closest("label")) && !i.getAttribute("placeholder")).length;
  const headingLevels = q("h1, h2, h3, h4, h5, h6").map((h: any) => parseInt(h.tagName.slice(1)));
  let headingSkip = false;
  for (let i = 1; i < headingLevels.length; i++) if (headingLevels[i] - headingLevels[i - 1] > 1) { headingSkip = true; break; }
  const genericLinks = linkTexts.filter((t: string) => /^(click here|read more|learn more|more|here|know more)$/.test(t)).length;

  // platform
  let platform = "Custom";
  if (/cdn\.shopify\.com|shopify\.theme|myshopify\.com|shopify-section/i.test(raw)) platform = "Shopify";
  else if (/woocommerce|wp-content\/plugins\/woo/i.test(raw)) platform = "WooCommerce";
  else if (/wp-content|wp-includes/i.test(raw)) platform = "WordPress";
  else if (/\bmage\/|magento|\/static\/version\d+\//i.test(raw)) platform = "Magento";
  else if (/bigcommerce/i.test(raw)) platform = "BigCommerce";
  else if (/wixstatic|_wixcssimports|wix\.com/i.test(raw)) platform = "Wix";
  else if (/webflow/i.test(raw)) platform = "Webflow";
  else if (/squarespace/i.test(raw)) platform = "Squarespace";
  else if (/framerusercontent|framer\.com/i.test(raw)) platform = "Framer";
  else if (/__next_data__|\/_next\//i.test(raw)) platform = "Next.js";
  else if (/data-reactroot|react-dom|__nuxt|ng-version/i.test(raw)) platform = "JavaScript app";

  // growth stack
  const tools: Array<{ name: string; category: string }> = [];
  for (const [name, catName, re] of TOOLS) if (re.test(raw)) tools.push({ name, category: catName });
  const essentials = ESSENTIALS.map(([key, label, cats]) => ({ key, label, found: tools.filter((t) => cats.includes(t.category)).map((t) => t.name) }));
  const stackScore = Math.round((essentials.filter((e) => e.found.length).length / essentials.length) * 100);
  const thirdPartyHosts = Array.from(new Set(scriptSrcs.map((s) => { try { return new URL(s, finalUrl).hostname; } catch { return ""; } }).filter((h) => h && h !== finalUrl.hostname && !h.endsWith("." + finalUrl.hostname.replace(/^www\./, "")))));

  // page type
  const path = finalUrl.pathname.replace(/\/+$/, "");
  let pageType = "LP";
  if (!path || path === "" || path === "/" || /^\/(en|in|en-in|home)$/i.test(path)) pageType = "HOME";
  else if (ldTypes.has("Product") || /\/products?\//i.test(path) || /\/p\/|\/dp\//i.test(path) || (atcForm && /product/i.test(rawLower.slice(0, 200000)))) pageType = "PDP";
  else if (/\/collections?\/|\/category|\/categories|\/shop\b|\/c\//i.test(path)) pageType = "COLLECTION";

  // category
  const catScores: Record<string, number> = {};
  const hay = (" " + (title + " " + description + " ").repeat(3) + h1s.join(" ").repeat(2) + " " + navText + " " + lower.slice(0, 25000) + " ").toLowerCase();
  for (const [catName, kws] of Object.entries(CATS)) {
    let s = 0;
    for (const k of kws) { let idx = hay.indexOf(k); let n = 0; while (idx !== -1 && n < 25) { n++; idx = hay.indexOf(k, idx + k.length); } s += n; }
    catScores[catName] = s;
  }
  const sortedCats = Object.entries(catScores).sort((a, b) => b[1] - a[1]);
  let category = sortedCats[0] && sortedCats[0][1] >= 3 ? sortedCats[0][0] : "Other";
  if (opts && opts.category && CATS[opts.category]) category = opts.category;

  // prices and AOV (average, not median)
  const inr = /(?:₹|rs\.?\s|inr\s?)\s?([\d,]{2,9}(?:\.\d{1,2})?)/gi;
  const prices: number[] = [];
  for (const m of bodyText.matchAll(inr)) {
    const idx = m.index || 0;
    const before = bodyText.slice(Math.max(0, idx - 22), idx).toLowerCase();
    const after = bodyText.slice(idx + m[0].length, idx + m[0].length + 16).toLowerCase();
    if (/(above|over|upto|up to|save|saving|worth|min(imum)?|orders? of|cashback|flat|extra|get|off on|spend|more than|purchase of)\s*$/.test(before)) continue;
    if (/^\s*(off|and above|& above|or more|cashback|discount|\+|\/\s*(month|mo)|per month|onwards)/.test(after)) continue;
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (v >= 49 && v <= 500000) prices.push(v);
    if (prices.length >= 40) break;
  }
  const hasUsd = /\$\s?\d{1,5}(\.\d{2})?/.test(bodyText) && !prices.length;
  let currency = prices.length || /₹|\binr\b/i.test(bodyText) ? "INR" : hasUsd ? "USD" : "unknown";
  let aov: number | null = null;
  if (extras.product && typeof extras.product.price === "number") aov = extras.product.price / 100;
  else if (ldPrices.length && pageType === "PDP") aov = ldPrices.reduce((a, b) => a + b, 0) / ldPrices.length;
  else if (prices.length) {
    const s = prices.slice().sort((a, b) => a - b);
    const trim = s.length >= 10 ? s.slice(Math.floor(s.length * 0.1), Math.ceil(s.length * 0.9)) : s;
    aov = trim.reduce((a, b) => a + b, 0) / trim.length;
  }
  if (extras.product && typeof extras.product.price === "number") currency = currency === "unknown" ? "INR" : currency;
  let aovBand = currency === "INR" ? bandFor(aov) : null;
  const bandInputs = ["< ₹500", "₹500–₹2,000", "₹2,000–₹5,000", "₹5,000+"];
  if (opts && bandInputs.includes(opts.aovBand)) aovBand = opts.aovBand;
  const india = currency === "INR" || /\.in$/.test(finalUrl.hostname) || /\+91|india/i.test(footerText);

  // shared text probes
  const has = (re: RegExp, s = lower) => re.test(s);
  const topText = lower.slice(0, Math.max(2500, Math.floor(lower.length * 0.35)));
  const proofRe = /(\d[\d,.]*\s*\+?\s*(k|lakh|million|m)?\+?\s*(reviews|ratings|customers|happy customers|orders|families|users))|rated\s*\d(\.\d)?|\d\.\d\s*(\/\s*5|stars?|★)|★|as seen (in|on)|featured in|trusted by|#1\b|best ?seller/i;
  const reviewsApp = tools.some((t) => t.category === "reviews");
  const hasReviews = !!aggRating || reviewsApp || /(\d[\d,]*)\s*(verified\s*)?(reviews|ratings)\b/i.test(bodyText) || /★|⭐/.test(bodyText);
  const trustPatterns = [/secure (checkout|payment)|100% secure|safe (payment|checkout)|ssl/, /genuine|authentic|100% original/, /certified|certification|fssai|gmp|iso\b|lab[- ]tested|clinically|dermatologist/, /free (shipping|delivery)/, /easy returns?|hassle[- ]free return|\d+[- ]day returns?/, /\bcod\b|cash on delivery/, /made in india|cruelty[- ]free|vegan|natural/, /warranty|guarantee/, /trusted by|happy customers/];
  const trustHits = trustPatterns.filter((r) => r.test(lower)).length;
  const deliveryRe = /free (shipping|delivery)|ships? (in|within)|deliver(y|ed)? (in|within|by)|dispatch(ed|es)? (in|within)|delivery (time|timeline|estimate|in)|estimated delivery|express delivery|same[- ]day|next[- ]day|\d+\s*-\s*\d+\s*(business |working )?days/;
  const returnsRe = /\b(returns?|refunds?|exchanges?|replacements?)\b/;
  const searchPresent = q("input[type=search], form[action*=search], [role=search]").length > 0 || hrefs.some((h: string) => /\/search\b/.test(h)) ||
    q("[aria-label]").some((e: any) => /search/i.test(e.getAttribute("aria-label") || "")) || /class=["'][^"']*\bsearch/i.test(stripped.slice(0, 200000));
  const contactPresent = hrefs.some((h: string) => /contact|^tel:|^mailto:|wa\.me|whatsapp/.test(h)) || linkTexts.some((t: string) => /contact|customer (care|support)|help ?cent(er|re)|support/.test(t)) || pageCtas.some((t: string) => /contact|support/i.test(t)) || /(\+91[\s-]?\d{5}[\s-]?\d{5}|\b\d{10}\b|[\w.+-]+@[\w-]+\.[\w.]+)/.test(footerText || bodyText.slice(-20000));
  const chatPresent = tools.some((t) => t.category === "support");
  const privacyLink = hrefs.some((h: string) => /privacy/.test(h)) || linkTexts.some((t: string) => /privacy/.test(t));
  const refundLink = hrefs.some((h: string) => /refund|return|shipping-policy|policies\/(refund|shipping)/.test(h)) || linkTexts.some((t: string) => /refund|return|shipping policy|cancellation/.test(t));
  const addressPresent = hasPostalAddress || (/\b\d{6}\b|\b\d{5}(-\d{4})?\b/.test(footerText) && /(road|rd\b|street|st\b|nagar|floor|sector|block|marg|lane|avenue|suite|building|tower|park|pvt|private limited|ltd|llp|inc\b|india)/i.test(footerText));

  // ----------------------------------------------------------- checks
  type Check = { key: string; signal: string; status: "fail" | "pass"; evidence: string; confidence: "high" | "medium" };
  const checks: Check[] = [];
  const ck = (key: string, signal: string, pass: boolean, evFail: string, evPass: string, confidence: "high" | "medium" = "high") =>
    checks.push({ key, signal, status: pass ? "pass" : "fail", evidence: pass ? evPass : evFail, confidence });
  const isHome = pageType === "HOME", isPdp = pageType === "PDP", isLp = pageType === "LP" || pageType === "COLLECTION";

  // Clarity and action
  if (isHome) {
    const n = heroCtas.length;
    ck("hero_single_action", "SIG-HOME-F-HEROINTENTUNCLEA-01", n >= 1 && n <= 3,
      n === 0 ? (heroLinkedImages ? "Your first section is a clickable banner image with no visible button, so shoppers have to guess what to tap." : "We couldn't find a clear button in your first section, so visitors have to work out where to go.") : "Your first section offers " + n + " different actions (" + heroCtas.slice(0, 4).map((t) => "'" + t + "'").join(", ") + "), so none of them stands out.",
      "Your first section leads with " + (heroCtas[0] ? "'" + heroCtas[0] + "'" : "one clear action") + ".");
  } else if (isLp) {
    ck("cta_competition", "SIG-LP-F-CTAAMBIGUITY-01", heroCtas.length <= 3,
      "The opening section offers " + heroCtas.length + " competing actions: " + heroCtas.slice(0, 4).map((t) => "'" + t + "'").join(", ") + ".", "The opening section keeps to one main action.", "medium");
  }
  // On a product page the main button is Add to cart / Buy now, not a promo banner link.
  let atcLabel = "";
  if (isPdp) {
    const atcEl = ctaEls.find((c: any) => ATC_RE.test(ctaText(c))) || q("button, input[type=submit]").find((b: any) => ATC_RE.test(txt(b) || b.getAttribute("value") || ""));
    if (atcEl) atcLabel = clean(ctaText(atcEl) || txt(atcEl) || atcEl.getAttribute("value") || "").replace(/\s+/g, " ").slice(0, 40);
    if (!atcLabel && atcForm) atcLabel = "Add to cart";
  }
  const primary = atcLabel || heroCtas[0] || bodyCtas.find((t: string) => ACTION_RE.test(t)) || bodyCtas[0] || "";
  if (primary) {
    ck("cta_copy", "SIG-LP-F-WEAKCTALANGUA-01", !GENERIC_CTA.test(primary.trim()),
      "Your main button says '" + primary + "', which tells shoppers nothing about what they get.", "Your main button ('" + primary + "') says what happens next.", "medium");
  }
  if (isPdp) {
    ck("pdp_atc", "SIG-PDP-F-PRIMARYCTAMISS-01", atcButton || atcForm, "We couldn't find an Add to cart or Buy now button in the page's code.", "Add to cart is present on the page.", "medium");
    const sticky = /sticky[-_ ]?(atc|add|cart|buy|product|bar|button)|(atc|add-to-cart|addtocart|buy-now|product-form)[-_ ]?sticky|product-sticky|sticky-product|fixed-add-to-cart|m-sticky|stickycart/i.test(raw);
    ck("pdp_sticky", "SIG-PDP-F-STICKYCTAMISS-01", sticky, "We couldn't find a sticky Add to cart bar, so on phones the button scrolls out of view.", "A sticky Add to cart bar is set up.", "medium");
    const priceFound = prices.length > 0 || ldPrices.length > 0 || (extras.product && extras.product.price != null);
    ck("pdp_price", "SIG-PDP-F-PRICEVISIBILITYMISS-01", priceFound, "We couldn't find a price on the page.", "Price is shown on the page.");
    const anchor = (extras.product && extras.product.compare_at_price && extras.product.compare_at_price > extras.product.price) ||
      /compare[-_]?at|price--compare|price__compare|was[-_]price|old[-_]price|price--old|line-through|<s[\s>]|<del[\s>]|\bmrp\b/i.test(raw.slice(0, 900000));
    ck("pdp_anchor", "SIG-PDP-F-NOPRICEANCHOR-01", !!anchor, "We couldn't find an MRP or compare-at price next to the selling price, so there's nothing to anchor value against.", "An MRP or compare-at price anchors the selling price.", "medium");
    ck("pdp_reviews", "SIG-PDP-F-REVIEWVISIBILITYMISS-01", hasReviews && (proofRe.test(topText) || !!aggRating),
      hasReviews ? "Reviews exist, but we couldn't find a star rating or review count near the top of the page." : "We couldn't find a star rating, review count or reviews app on the page.",
      aggRating && aggRating.value ? "Star rating " + aggRating.value + (aggRating.count ? " from " + aggRating.count + " reviews" : "") + " is marked up on the page." : "Star rating and review count are shown.");
    ck("pdp_trust", "SIG-PDP-F-TRUSTBADGESMISSING-01", trustHits >= 3, "Only " + trustHits + " of 9 common trust cues (secure payment, genuine, certified, free shipping, easy returns, COD and so on) appear on the page.", trustHits + " trust cues appear on the page.");
    const del = deliveryRe.test(lower), ret = returnsRe.test(lower);
    ck("pdp_ship_returns", "SIG-PDP-F-SHIPPINGRETURNUNCLEAR-01", del && ret,
      !del && !ret ? "We couldn't find delivery time or the return policy on the page." : !del ? "We couldn't find delivery time or cost on the page." : "We couldn't find the return or exchange policy on the page.",
      "Delivery and returns are both mentioned on the page.");
    if (india) {
      ck("pdp_cod", "SIG-PDP-F-CODELIGIBILITYMISS-01", /\bcod\b|cash on delivery|pay on delivery/.test(lower), "We couldn't find a cash-on-delivery mention, and many Indian shoppers look for it before adding to cart.", "Cash on delivery is mentioned.");
      ck("pdp_pincode", "SIG-PDP-F-PINCODEDELIVERYCHECK-01", /pin ?code|pincode|check delivery|delivery availability|check availability|enter your pin/.test(lower), "We couldn't find a pincode check, so shoppers can't see if and when it reaches them.", "A pincode delivery check is on the page.");
    }
    ck("pdp_guarantee", "SIG-PDP-F-GUARANTEEMISS-01", /guarantee|money[- ]back|warranty|risk[- ]free|no questions asked|easy returns?|hassle[- ]free return|\d+[- ]day return/.test(lower), "We couldn't find a guarantee, warranty or easy-return promise.", "A guarantee or easy-return promise is visible.");
    ck("pdp_faq", "SIG-PDP-E-FAQMICROA-01", ldTypes.has("FAQPage") || /\bfaqs?\b|frequently asked/.test(lower), "We couldn't find a product FAQ answering the questions shoppers leave to research.", "The page answers common questions in an FAQ.");
    ck("pdp_urgency", "SIG-PDP-F-NOURGENCY-01", /only \d+ left|few left|selling fast|low (in )?stock|hurry|ends (in|tonight|today|soon)|limited (time|stock|edition|period)|sale ends|\d+\s*(people|customers) (are )?(viewing|bought)|countdown/.test(lower) || /countdown|timer/i.test(raw.slice(0, 600000)), "We couldn't find a truthful reason to act now (stock level, offer end or delivery cut-off).", "The page gives a reason to act now.", "medium");
    ck("pdp_bundle", "SIG-PDP-E-BUNDLEANCHOR-01", /bundle|combo|pack of \d|buy \d get|\bbogo\b|\bkit\b|save \d+%|frequently bought|value pack/.test(lower), "We couldn't find a bundle or multi-pack offered against the single product.", "A bundle or multi-pack option is offered.", "medium");
    if (aov && aov >= 2000 && currency === "INR") {
      ck("pdp_emi", "SIG-PDP-F-EMISPLITPAYMISS-01", /\bemi\b|no[- ]cost emi|pay in \d|snapmint|simpl|lazypay|zestmoney|bajaj finserv|cardless|split (pay|payment)/.test(lower) || tools.some((t) => ["Snapmint", "Simpl"].includes(t.name)), "At about ₹" + Math.round(aov).toLocaleString("en-IN") + ", no EMI or pay-later option is shown near the price.", "EMI or pay-later options are shown.");
    }
    if (extras.product && Array.isArray(extras.product.variants)) {
      const nv = extras.product.variants.length;
      ck("pdp_variants", "SIG-PDP-F-VARIANTOVERLOAD-01", nv <= 24, "This product has " + nv + " variants to choose from, which is a lot to scan without grouping.", "Variant count (" + nv + ") is manageable.", "medium");
    }
  }
  if (isHome || isLp) {
    ck("proof_density", "SIG-LP-F-PROOFDENSITTOO-01", proofRe.test(heroText.toLowerCase()) || proofRe.test(topText.slice(0, 3000)),
      "We couldn't find anything in the opening screen showing that other people buy and like this (ratings, reviews, customer counts, press).", "Proof appears early on the page.");
  }
  if (isHome) {
    ck("founder_story", "SIG-HOME-F-FOUNDERSTORYMISS-01", /our story|about us|founder|founded|meet the team|who we are|our journey|about\b/.test(navText + " " + linkTexts.join(" ")), "We couldn't find an About or Our story path that shows who is behind the brand.", "An About or Our story path is available.", "medium");
  }
  // Trust and support (all pages)
  ck("contact", "SIG-ALL-F-CONTACTACCESSWEAK-01", contactPresent, "We couldn't find a contact page, phone number, email or WhatsApp link.", "Contact details are reachable.");
  ck("live_chat", "SIG-ALL-F-LIVECHATABSENT-01", chatPresent, "We couldn't find WhatsApp or live chat for last-minute questions.", "WhatsApp or live chat is available (" + tools.filter((t) => t.category === "support").map((t) => t.name).slice(0, 2).join(", ") + ").");
  ck("policies", "SIG-ALL-F-PRIVACYPOLICYACCESSWEAK-01", privacyLink && refundLink,
    !privacyLink && !refundLink ? "We couldn't find a privacy or refund policy link." : !privacyLink ? "We couldn't find a privacy policy link." : "We couldn't find a refund, return or shipping policy link.",
    "Privacy and refund policies are linked.");
  ck("address", "SIG-ALL-F-PHYSICALADDRESSMISS-01", addressPresent, "We couldn't find a company address in the footer, which many shoppers use to judge legitimacy.", "A company address is shown.", "medium");
  if (pageType !== "LP" || hrefs.length > 40) {
    ck("search", "SIG-SEARCH-F-NOSEARCHBAR-01", searchPresent, "We couldn't find a search box or search link.", "Search is available.", "medium");
  }
  if (emailInputs.length) {
    const formText = clean(emailInputs.map((i: any) => { const f = i.closest ? i.closest("form, section, div") : null; return f ? txt(f) : ""; }).join(" ")).toLowerCase();
    ck("newsletter", "SIG-ALL-F-NEWSLETTERINCENTIVEUNCLEAR-01", /%|off|discount|early access|free|exclusive|coupon|₹\s?\d|first order/.test(formText), "Your email sign-up doesn't say what subscribers get (a discount, perk or early access).", "The email sign-up states what subscribers get.", "medium");
  }
  // Mobile and accessibility basics from HTML
  ck("viewport", "SIG-MOB-F-VIEWPORTNOTSET-01", /width\s*=\s*device-width/i.test(viewport), "No mobile viewport tag, so phones may render the desktop layout.", "Mobile viewport is set.");
  ck("lang", "SIG-A11Y-F-LANGATTRMISS-01", !!lang, "The page does not declare its language.", "Page language is declared (" + lang + ").");

  // Category-specific homepage checks
  if (isHome) {
    const nav = navText + " " + linkTexts.join(" ") + " " + h2s.join(" ").toLowerCase();
    const count = (re: RegExp, s: string) => (s.match(new RegExp(re.source, "gi")) || []).length;
    const catChecks: Array<[string, string, string, boolean, string, string]> = [];
    if (category === "Beauty & Personal Care") {
      catChecks.push(["cat_concern", "SIG-BPC-HOME-F-01", "", count(/concern|skin type|acne|pigment|ageing|aging|dryness|dull|sensitive skin|oily|dark circle|hair ?fall|dandruff|frizz/, nav) >= 2, "We couldn't find a shop-by-concern path (acne, pigmentation, dryness and so on) on the homepage.", "Shoppers can browse by concern."]);
      catChecks.push(["cat_quiz", "SIG-BPC-HOME-F-03", "", /quiz|routine (builder|finder)|find your (routine|regimen|match)|skin analysis|diagnos/.test(lower), "We couldn't find a skin quiz or routine finder to guide first-time buyers.", "A quiz or routine finder guides first-time buyers."]);
      catChecks.push(["cat_brandproof", "SIG-BPC-HOME-F-04", "", proofRe.test(topText), "We couldn't find brand-level proof (ratings, customer count, press) near the top of the homepage.", "Brand-level proof shows near the top."]);
    } else if (category === "Fashion & Apparel") {
      catChecks.push(["cat_occasion", "SIG-FA-HOME-F-01", "", count(/occasion|festive|wedding|party|office|work ?wear|vacation|date night|ethnic|casual|lounge/, nav) >= 2, "We couldn't find a shop-by-occasion path on the homepage.", "Shoppers can browse by occasion."]);
      catChecks.push(["cat_styling", "SIG-FA-HOME-F-04", "", /lookbook|style (guide|edit)|shop the look|outfit|styled|how to style|complete the look/.test(lower), "We couldn't find outfit or styling inspiration on the homepage.", "Styling inspiration is featured."]);
    } else if (category === "Health & Wellness") {
      catChecks.push(["cat_goal", "SIG-HW-HOME-F-01", "", count(/goal|immunity|sleep|energy|gut|digestion|weight|stress|muscle|heart|bone|women'?s health|men'?s health|performance|pleasure/, nav) >= 3, "We couldn't find a shop-by-health-goal path on the homepage.", "Shoppers can browse by goal."]);
      catChecks.push(["cat_cert", "SIG-HW-HOME-F-02", "", /fssai|gmp|certified|lab[- ]tested|third[- ]party tested|clinically|\biso\b|nabl|ayush|fda|dermatologically/.test(lower), "We couldn't find a certification or testing bar (FSSAI, GMP, lab tested) on the homepage.", "Certifications are shown."]);
      catChecks.push(["cat_quiz", "SIG-HW-HOME-F-04", "", /quiz|assessment|find your (supplement|plan|product)|personali[sz]ed (plan|recommendation)/.test(lower), "We couldn't find a quiz or assessment to point buyers to the right product.", "A quiz guides buyers."]);
    } else if (category === "Home & Living") {
      catChecks.push(["cat_room", "SIG-HL-HOME-F-01", "", count(/living room|bedroom|kitchen|dining|study|office|balcony|outdoor|kids room|bathroom/, nav) >= 2, "We couldn't find a shop-by-room path on the homepage.", "Shoppers can browse by room."]);
      catChecks.push(["cat_emi", "SIG-HL-HOME-F-03", "", /\bemi\b|no[- ]cost emi|per month|\/month|\/mo\b/.test(lower), "We couldn't find an EMI or monthly-price message on the homepage.", "EMI is mentioned."]);
    } else if (category === "Food & Beverages") {
      catChecks.push(["cat_diet", "SIG-FB-HOME-F-01", "", count(/vegan|vegetarian|keto|gluten|sugar[- ]free|diabetic|high protein|low calorie|jain|no onion|gift|festive/, nav) >= 2, "We couldn't find a shop-by-diet or occasion path on the homepage.", "Shoppers can browse by diet or occasion."]);
      catChecks.push(["cat_fresh", "SIG-FB-HOME-F-02", "", /fresh|no preservatives|preservative[- ]free|small batch|handmade|fssai|made to order|baked/.test(lower), "We couldn't find freshness or food-safety reassurance on the homepage.", "Freshness and quality are reassured."]);
    } else if (category === "Jewellery & Accessories") {
      catChecks.push(["cat_hallmark", "SIG-HOME-F-HALLMARKTRUSTBAR-01", "", /hallmark|\bbis\b|certified|\bigi\b|\bgia\b|925|sterling|authentic/.test(lower), "We couldn't find a hallmark or certification bar on the homepage.", "Hallmark or certification is shown."]);
      catChecks.push(["cat_occasion", "SIG-HOME-F-OCCASIONNAVMISS-01", "", count(/occasion|wedding|anniversary|birthday|engagement|festive|daily wear|office wear/, nav) >= 2, "We couldn't find occasion-led navigation on the homepage.", "Shoppers can browse by occasion."]);
      catChecks.push(["cat_gift", "SIG-HOME-F-GIFTGUIDEMISS-01", "", /gift/.test(nav), "We couldn't find a gift guide or gifting path on the homepage.", "Gifting has its own path."]);
    } else if (category === "Electronics & Gadgets") {
      catChecks.push(["cat_genuine", "SIG-EG-HOME-F-02", "", /genuine|authori[sz]ed|official|warranty/.test(lower), "We couldn't find a genuine-product or warranty promise on the homepage.", "Genuine-product promise is shown."]);
      catChecks.push(["cat_emi", "SIG-EG-HOME-F-03", "", /\bemi\b|no[- ]cost emi|per month|\/month/.test(lower), "We couldn't find an EMI message on the homepage.", "EMI is mentioned."]);
    } else if (category === "Baby & Kids") {
      catChecks.push(["cat_age", "SIG-BK-HOME-F-01", "", /\d+\s*-\s*\d+\s*(months|years|yrs|m\b)|by age|age group|newborn|toddler|infant/.test(nav), "We couldn't find a shop-by-age path on the homepage.", "Shoppers can browse by age."]);
      catChecks.push(["cat_safety", "SIG-BK-HOME-F-02", "", /safe|non[- ]toxic|\bbis\b|certified|paediatrician|pediatrician|dermatologist|bpa[- ]free|en71/.test(lower), "We couldn't find safety credentials on the homepage.", "Safety credentials are shown."]);
    } else if (category === "Pet Care") {
      catChecks.push(["cat_pet", "SIG-PC-HOME-F-01", "", /\bdogs?\b/.test(nav) && /\bcats?\b/.test(nav), "We couldn't find a shop-by-pet path (dog, cat) on the homepage.", "Shoppers can browse by pet."]);
      catChecks.push(["cat_vet", "SIG-PC-HOME-F-02", "", /\bvet\b|veterinar/.test(lower), "We couldn't find a vet endorsement or expert validation on the homepage.", "Vet validation is shown."]);
    } else if (category === "Sports & Fitness") {
      catChecks.push(["cat_sport", "SIG-SF-HOME-F-01", "", count(/running|gym|yoga|cricket|football|badminton|cycling|swimming|tennis|training|hiking/, nav) >= 2, "We couldn't find a shop-by-sport path on the homepage.", "Shoppers can browse by sport."]);
    }
    for (const [key, signal, , pass, ef, ep] of catChecks) ck(key, signal, pass, ef, ep, "medium");
  }

  // AI and search readiness
  const robotsOk = !!(extras.robots && extras.robots.status === 200 && !/<html/i.test(extras.robots.text.slice(0, 200)));
  const blocked = robotsOk ? robotsBlocked(extras.robots.text) : [];
  const searchBlocked = blocked.filter((b) => AI_SEARCH_BOTS.includes(b));
  const llmsOk = !!(extras.llms && extras.llms.status === 200 && extras.llms.text.length > 40 && !/<html|<!doctype/i.test(extras.llms.text.slice(0, 300)));
  const sitemapOk = !!(extras.sitemap && extras.sitemap.status === 200 && /<(urlset|sitemapindex)/i.test(extras.sitemap.text.slice(0, 2000))) || (robotsOk && /^sitemap:/im.test(extras.robots.text));
  const metaLen = (metas["description"] || "").length;
  const aiChecks = [
    { key: "ai_search_allowed", label: "AI assistants are allowed to read the site", pass: searchBlocked.length === 0, weight: 3, detail: searchBlocked.length ? "robots.txt blocks " + searchBlocked.join(", ") : robotsOk ? "No AI search crawlers are blocked." : "No robots.txt, so nothing is blocked." },
    { key: "llms_txt", label: "llms.txt guide for AI assistants", pass: llmsOk, weight: 2, detail: llmsOk ? "Found /llms.txt." : "No /llms.txt file." },
    { key: "sitemap", label: "XML sitemap", pass: sitemapOk, weight: 2, detail: sitemapOk ? "Sitemap found." : "No sitemap at /sitemap.xml or in robots.txt." },
    { key: "jsonld", label: "Structured data (JSON-LD)", pass: ldTypes.size > 0, weight: 2, detail: ldTypes.size ? Array.from(ldTypes).slice(0, 6).join(", ") : "No JSON-LD structured data." },
    { key: "org_schema", label: "Organisation or website schema", pass: ldTypes.has("Organization") || ldTypes.has("WebSite") || ldTypes.has("Corporation") || ldTypes.has("OnlineStore") || ldTypes.has("LocalBusiness"), weight: 1, detail: "" },
    ...(isPdp ? [{ key: "product_schema", label: "Product schema with price and rating", pass: ldTypes.has("Product"), weight: 2, detail: ldTypes.has("Product") ? (aggRating ? "Product with rating." : "Product without rating.") : "No Product schema." }] : []),
    { key: "meta_description", label: "Meta description (70 to 170 characters)", pass: metaLen >= 70 && metaLen <= 170, weight: 2, detail: metaLen ? metaLen + " characters" : "Missing" },
    { key: "title", label: "Page title (15 to 70 characters)", pass: title.length >= 15 && title.length <= 70, weight: 1, detail: title ? title.length + " characters" : "Missing" },
    { key: "single_h1", label: "One clear H1 heading", pass: h1s.length === 1, weight: 1, detail: h1s.length + " H1 heading" + (h1s.length === 1 ? "" : "s") },
    { key: "canonical", label: "Canonical URL", pass: !!canonical, weight: 1, detail: canonical ? "Set" : "Missing" },
    { key: "og", label: "Social preview tags (Open Graph)", pass: !!(metas["og:title"] && metas["og:image"]), weight: 1, detail: metas["og:image"] ? "Set" : "Missing og:image" },
    { key: "ssr_text", label: "Content readable without JavaScript", pass: words >= 150, weight: 2, detail: words + " words in the page's HTML" },
  ];
  const aiW = aiChecks.reduce((s, c) => s + c.weight, 0), aiP = aiChecks.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0);
  const readiness = Math.round((aiP / aiW) * 100);
  const landmarks = ["main", "nav", "header", "footer"].filter((t) => q(t).length > 0);
  const agentChecks = [
    { key: "ai_search_allowed", label: "AI agents may read the site", pass: searchBlocked.length === 0 },
    { key: "llms_txt", label: "llms.txt for agents", pass: llmsOk },
    { key: "md_alternate", label: "Markdown version of pages for agents", pass: mdAlternate },
    { key: "jsonld", label: "Machine-readable product and brand data", pass: ldTypes.size > 0 },
    { key: "ssr_text", label: "Text in the HTML, not only in JavaScript", pass: words >= 150 },
    { key: "landmarks", label: "Page landmarks (header, nav, main, footer)", pass: landmarks.length >= 3 },
    { key: "named_controls", label: "Buttons and fields have names", pass: btnNoName <= 2 && inputsNoLabel <= 2 },
  ];
  const agentScore = Math.round((agentChecks.filter((c) => c.pass).length / agentChecks.length) * 100);

  // Lite estimates (used only when PageSpeed is unavailable)
  let speedEst = 100;
  if (extras.ttfbMs > 1200) speedEst -= 20; else if (extras.ttfbMs > 600) speedEst -= 10;
  const kb = extras.bytes / 1024;
  if (kb > 800) speedEst -= 20; else if (kb > 300) speedEst -= 10;
  if (scriptSrcs.length > 40) speedEst -= 20; else if (scriptSrcs.length > 20) speedEst -= 10;
  if (thirdPartyHosts.length > 20) speedEst -= 20; else if (thirdPartyHosts.length > 10) speedEst -= 10;
  if (styleLinks > 8) speedEst -= 5;
  if (imgsNoDims > 10) speedEst -= 5;
  speedEst = Math.max(5, Math.min(95, speedEst));
  let a11yEst = 100;
  const altRatio = imgs.length ? imgsNoAlt / imgs.length : 0;
  a11yEst -= Math.min(20, Math.round(altRatio * 40));
  a11yEst -= Math.min(15, btnNoName * 3);
  a11yEst -= Math.min(15, inputsNoLabel * 3);
  if (!lang) a11yEst -= 10;
  if (headingSkip) a11yEst -= 5;
  if (genericLinks > 2) a11yEst -= 5;
  a11yEst = Math.max(5, Math.min(98, a11yEst));
  const a11yIssues = [
    imgsNoAlt ? imgsNoAlt + " image" + (imgsNoAlt === 1 ? "" : "s") + " without alt text" : "",
    btnNoName ? btnNoName + " button" + (btnNoName === 1 ? "" : "s") + " without a name" : "",
    inputsNoLabel ? inputsNoLabel + " form field" + (inputsNoLabel === 1 ? "" : "s") + " without a label" : "",
    !lang ? "No page language" : "",
    headingSkip ? "Heading levels skip" : "",
    genericLinks > 2 ? genericLinks + " vague link texts" : "",
  ].filter(Boolean);

  const clientRendered = words < 80;
  const finalChecks = clientRendered ? checks.filter((c) => ["viewport", "lang"].includes(c.key)) : checks;
  return {
    page: {
      rendered: clientRendered ? "client" : "server",
      title, description, lang, canonical, platform, pageType, category, categoryScores: Object.fromEntries(sortedCats.slice(0, 4)),
      h1: h1s.slice(0, 3), h2: h2s.slice(0, 8), heroHeadline, heroCtas: heroCtas.slice(0, 6), ctas: pageCtas.slice(0, 10), primaryCta: primary,
      ogImage: metas["og:image"] || "", themeColor: metas["theme-color"] || "", currency, aov: aov ? Math.round(aov) : null, aovBand, india,
      prices: prices.length, words, images: { total: imgs.length, missingAlt: imgsNoAlt }, forms: forms.length, links: links.length,
      rating: aggRating, hasReviews, trustHits,
    },
    checks: finalChecks,
    ai: { robots: { found: robotsOk, blocked }, llms: llmsOk, sitemap: sitemapOk, ldTypes: Array.from(ldTypes).slice(0, 12), checks: aiChecks, readiness, agent: { score: agentScore, checks: agentChecks } },
    stack: { platform, tools, essentials, score: stackScore, thirdPartyHosts: thirdPartyHosts.slice(0, 30) },
    lite: { ttfbMs: extras.ttfbMs, htmlKb: Math.round(kb), scripts: scriptSrcs.length, inlineScripts, stylesheets: styleLinks, thirdPartyHosts: thirdPartyHosts.length, imagesNoDims: imgsNoDims, speedEstimate: speedEst, a11yEstimate: a11yEst, a11yIssues },
  };
}

function conversionScore(checks: any[], lib: Lib) {
  let total = 0, failed = 0, nPass = 0, nFail = 0;
  for (const c of checks) {
    const sig = lib.signals[c.signal];
    if (sig && /^(SIG-MOB|SIG-A11Y)/.test(c.signal)) continue; // scored under accessibility
    const w = sig ? Math.max(1, Math.min(3, sig.severity || 1)) : 2;
    total += w;
    if (c.status === "fail") { failed += w; nFail++; } else nPass++;
  }
  const score = total ? Math.round(100 * (1 - failed / total)) : null;
  return { score, passed: nPass, failed: nFail, applicable: nPass + nFail };
}

// ------------------------------------------------------------- handlers
async function rateLimited(table: "sa_scans" | "sa_leads", ipHash: string, max: number): Promise<boolean> {
  if (!sb) return false;
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  return (count || 0) >= max;
}

async function handleScan(req: Request) {
  const body = await req.json().catch(() => ({}));
  const target = normalizeUrl(body.url);
  const inputs = { category: body.category || null, aovBand: body.aovBand || null, goal: body.goal || null, role: body.role === "competitor" ? "competitor" : "primary", parent: body.parent || null };
  const ipHash = await sha(clientIp(req));
  if (await rateLimited("sa_scans", ipHash, 40)) throw new HttpError(429, "You've run a lot of scans in the last hour. Try again a little later.");

  let page;
  try { page = await fetchText(target); }
  catch (e) { throw new HttpError(422, "We couldn't open " + target.hostname + ". Check the address, or the site may be blocking automated visits."); }
  if (page.status >= 400) throw new HttpError(422, target.hostname + " answered with an error (" + page.status + "). Check the address and try again.");
  if (!/html|xml/i.test(page.contentType) && !/<html|<!doctype/i.test(page.text.slice(0, 1000))) throw new HttpError(422, "That address doesn't return a web page.");

  const finalUrl = page.finalUrl;
  const origin = finalUrl.origin;
  let productPromise: Promise<any> = Promise.resolve(null);
  if (/\/products\/[^/?#]+/i.test(finalUrl.pathname) && /cdn\.shopify\.com|shopify/i.test(page.text.slice(0, 400000))) {
    const pj = origin + finalUrl.pathname.replace(/\/+$/, "") + ".js";
    productPromise = fetchText(pj, { timeout: 6000, maxBytes: 600_000, accept: "application/json" }).then((r) => { try { return r.status === 200 ? JSON.parse(r.text) : null; } catch { return null; } }).catch(() => null);
  }
  const [robots, llms, sitemap, product, lib] = await Promise.all([
    fetchQuiet(origin + "/robots.txt"), fetchQuiet(origin + "/llms.txt"), fetchQuiet(origin + "/sitemap.xml"), productPromise, getLibrary(),
  ]);
  const result = analyze(page.text, finalUrl, { robots, llms, sitemap, ttfbMs: page.ttfbMs, bytes: page.bytes, product }, inputs);
  const conv = conversionScore(result.checks, lib);
  if (result.page.rendered === "client") conv.score = null;
  const bench = result.page.category && result.page.aovBand
    ? (lib.benchmarks.find((b: any) => b.category === result.page.category && b.aov_band === result.page.aovBand) ||
       lib.benchmarks.find((b: any) => b.category === "Other" && b.aov_band === result.page.aovBand) || null)
    : null;

  const slug = slugId();
  const serverResult = { url: finalUrl.href, host: finalUrl.hostname, fetchedAt: new Date().toISOString(), ...result, conversion: conv };
  if (sb) {
    await sb.from("sa_scans").insert({ slug, url: finalUrl.href, host: finalUrl.hostname, inputs, server_result: serverResult, status: "scanned", ip_hash: ipHash });
  }
  return json({
    slug, ...serverResult,
    benchmark: bench ? { category: bench.category, band: bench.aov_band, atc: bench.atc_rate, cartToCheckout: bench.cart_checkout_rate, checkoutToPurchase: bench.checkout_purchase_rate, cvr: bench.store_cvr } : null,
    library: { signals: lib.signals, barriers: lib.barriers, rootCauses: lib.rootCauses },
    psiServer: !!psiKey(),
  });
}

async function handlePsi(_req: Request, url: URL) {
  const key = psiKey();
  if (!key) return json({ error: "no_psi_key" }, 501);
  const target = normalizeUrl(url.searchParams.get("url") || "");
  const strategy = url.searchParams.get("strategy") === "desktop" ? "desktop" : "mobile";
  const r = await fetch(psiUrl(target.href, strategy, key), { signal: AbortSignal.timeout(110_000) });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || data.error) return json({ error: "psi_failed", status: r.status, message: data && data.error && String(data.error.message || "").slice(0, 200) }, 502);
  return json(compactPsi(data, strategy));
}

async function handleSave(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || "").replace(/[^a-z0-9]/g, "").slice(0, 16);
  if (!slug || !body.report) throw new HttpError(400, "Missing report.");
  const s = JSON.stringify(body.report);
  if (s.length > 450_000) throw new HttpError(413, "Report too large.");
  if (!sb) return json({ ok: true, slug });
  const { error } = await sb.from("sa_scans").update({ report: body.report, status: "complete", updated_at: new Date().toISOString() }).eq("slug", slug).eq("status", "scanned");
  if (error) throw new HttpError(500, "Could not save the report.");
  return json({ ok: true, slug });
}

async function handleReport(url: URL) {
  const slug = String(url.searchParams.get("slug") || "").replace(/[^a-z0-9]/g, "").slice(0, 16);
  if (!slug || !sb) throw new HttpError(404, "That report is not available.");
  const { data } = await sb.from("sa_scans").select("slug,url,host,report,created_at,status").eq("slug", slug).maybeSingle();
  if (!data || !data.report) throw new HttpError(404, "That report is not available. Run the analysis again: it takes about 2 minutes.");
  return json({ slug: data.slug, url: data.url, host: data.host, createdAt: data.created_at, report: data.report });
}

async function handleLead(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.hp) return json({ ok: true }); // honeypot
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  const name = clean(String(body.name || "")).slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!name) throw new HttpError(400, "Add your name.");
  const ipHash = await sha(clientIp(req));
  if (await rateLimited("sa_leads", ipHash, 10)) throw new HttpError(429, "Too many requests. Try again later.");
  const interests = Array.isArray(body.interests) ? body.interests.map((x: any) => String(x).slice(0, 60)).slice(0, 8) : [];
  const row = {
    source: ["contact", "report", "newsletter", "analyzer"].includes(body.source) ? body.source : "contact",
    name, email, website: String(body.website || "").slice(0, 300), interests, message: String(body.message || "").slice(0, 2000),
    scan_slug: String(body.scanSlug || "").replace(/[^a-z0-9]/g, "").slice(0, 16) || null, ip_hash: ipHash,
  };
  if (sb) { const { error } = await sb.from("sa_leads").insert(row); if (error) throw new HttpError(500, "Could not save your details."); }
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/troocro-site-analysis/, "") || "/";
  try {
    if (path === "/health" || path === "/") return json({ ok: true, psi: !!psiKey(), db: !!sb });
    if (path === "/scan" && req.method === "POST") return await handleScan(req);
    if (path === "/psi" && req.method === "GET") return await handlePsi(req, url);
    if (path === "/save" && req.method === "POST") return await handleSave(req);
    if (path === "/report" && req.method === "GET") return await handleReport(url);
    if (path === "/lead" && req.method === "POST") return await handleLead(req);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("troocro-site-analysis error", e);
    return json({ error: status === 500 ? "Something went wrong on our side. Try again." : (e as Error).message }, status);
  }
});

export { analyze, normalizeUrl, robotsBlocked };
