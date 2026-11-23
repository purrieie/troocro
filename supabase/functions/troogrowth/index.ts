// TrooGrowth edge function: the extra reads behind the TrooGrowth report.
//   GET  /crawl?url=        sample 20-25 pages from the sitemap (robots.txt respected) for search and AI checks
//   POST /trust {url}       policy pages vs page claims, urgency scripts, price numbers, claims that need a source, installed apps
//   POST /insight {...}     one small Groq call per page: product-specific buyer questions + verified quotes (cached 24h)
//   GET  /peers?cat=&market=&exclude=   two category leaders: PageSpeed + page checks, refreshed daily
// Pure script except /insight. Everything is cached in tg_cache for 24 hours.
import { createClient } from "npm:@supabase/supabase-js@2";
import { compactPsi, psiUrl } from "./psi.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const sb = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;
const SCAN_API = (SUPABASE_URL || "https://mrfixorpmhrnkxhqzesn.supabase.co") + "/functions/v1/troocro-site-analysis";

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
      headers: { "User-Agent": UA, "Accept": opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-IN,en;q=0.9", "Cookie": "localization=IN; cart_currency=INR" },
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

// apps that shape order value and retention (read from the raw page, before scripts are stripped)
const APPS: Array<[string, string, RegExp]> = [
  ["Smile.io", "loyalty", /smile\.io|smile-ui|cdn\.sweettooth/i], ["LoyaltyLion", "loyalty", /loyaltylion/i], ["Rivo", "loyalty", /rivo\.io|rivo-loyalty/i],
  ["Nector", "loyalty", /nector\.io|nector-/i], ["BON Loyalty", "loyalty", /bon-loyalty|bonloyalty/i], ["Flits", "loyalty", /getflits/i], ["Yotpo Loyalty", "loyalty", /yotpo[^"']{0,40}(loyalty|swell)/i],
  ["Growave", "loyalty", /growave/i], ["ReferralCandy", "referral", /referralcandy/i], ["Friendbuy", "referral", /friendbuy/i],
  ["Recharge", "subscription", /rechargeapps|rechargecdn|recharge-subscriptions/i], ["Appstle", "subscription", /appstle/i], ["Seal Subscriptions", "subscription", /sealsubscriptions|seal-subscriptions/i],
  ["Loop Subscriptions", "subscription", /loopsubscriptions|loop-subscriptions/i], ["Skio", "subscription", /skio\.com|skio-/i], ["Bold Subscriptions", "subscription", /bold-subscriptions|boldsubscriptions/i], ["Stay Ai", "subscription", /stay\.ai|retextion/i],
  ["Rebuy", "upsell", /rebuyengine/i], ["Easy Bundle Builder", "upsell", /easy-bundle|gift-box-builder|bundle-builder/i], ["Bundle offer app", "upsell", /bundles?-?app|volume-discount|quantity-breaks/i], ["Frequently Bought Together", "upsell", /frequently[-_ ]bought[-_ ]together|cbb-frequently|codeblackbelt/i], ["Bundler", "upsell", /bundler\.app|bundler-/i],
  ["Kaching Bundles", "upsell", /kaching/i], ["Fast Bundle", "upsell", /fastbundle|fast-bundle/i], ["Wide Bundles", "upsell", /widebundle/i], ["Zipify OCU", "upsell", /zipify/i],
  ["ReConvert", "upsell", /reconvert/i], ["Selleasy", "upsell", /selleasy/i], ["LimeSpot", "upsell", /limespot/i], ["Nosto", "upsell", /nosto/i], ["Glood", "upsell", /glood\.ai/i],
  ["Octane AI quiz", "quiz", /octaneai|octane-ai/i], ["RevenueHunt quiz", "quiz", /revenuehunt/i],
  ["Klaviyo", "messaging", /klaviyo/i], ["Omnisend", "messaging", /omnisend/i], ["Mailchimp", "messaging", /chimpstatic\.com|list-manage\.com/i], ["Privy", "messaging", /privy\.com/i],
  ["WebEngage", "messaging", /webengage/i], ["MoEngage", "messaging", /moengage/i], ["CleverTap", "messaging", /clevertap/i], ["Netcore", "messaging", /netcoresmartech|smartech/i],
  ["Interakt", "messaging", /interakt/i], ["WATI", "messaging", /wati\.io/i], ["Gallabox", "messaging", /gallabox/i], ["AiSensy", "messaging", /aisensy/i], ["Zoko", "messaging", /zoko/i],
  ["Bik", "messaging", /cdn\.bik\.ai|bik\.ai\//i], ["LimeChat", "messaging", /limechat/i], ["Postscript", "messaging", /postscript\.io|sdk\.postscript/i], ["Attentive", "messaging", /attentivemobile|attn\.tv/i],
  ["Judge.me", "reviews", /judge\.me|judgeme/i], ["Yotpo", "reviews", /yotpo/i], ["Loox", "reviews", /loox\.io/i], ["Okendo", "reviews", /okendo/i], ["Stamped", "reviews", /stamped\.io/i],
  ["Reviews.io", "reviews", /reviews\.io/i], ["Trustpilot", "reviews", /trustpilot/i], ["Junip", "reviews", /junip/i], ["Fera", "reviews", /fera\.ai/i], ["Bazaarvoice", "reviews", /bazaarvoice/i], ["Kiwi Sizing", "fit", /kiwisizing/i],
  ["GoKwik", "checkout", /gokwik/i], ["Shopflo", "checkout", /shopflo/i], ["Fastrr", "checkout", /fastrr|shiprocket/i], ["Simpl", "checkout", /getsimpl|simpl\.in/i], ["Snapmint", "checkout", /snapmint/i],
];
// ===================================================================== TrooGrowth
// Extra routes for the TrooGrowth report. All pure script except /insight, which makes one small Groq call per page
// (cached 24h, rate limited, with a script fallback when it fails).
// Keys: GROQ_KEY and PSI_KEY_HARD are placeholders in the repo copy; the deployed copy has them filled in.
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") || "__GROQ_KEY__";
const PSI_KEY_HARD = "__PSI_KEY__";
const DAY = 86_400_000;

async function cacheGet(key: string) {
  if (!sb) return null;
  const { data } = await sb.from("tg_cache").select("data,created_at").eq("key", key).maybeSingle();
  if (!data) return null;
  return { data: data.data, age: Date.now() - new Date(data.created_at).getTime() };
}
async function cachePut(key: string, kind: string, data: unknown) {
  if (!sb) return;
  await sb.from("tg_cache").upsert({ key, kind, data, created_at: new Date().toISOString() });
}
async function callsSince(kind: string, ipHash: string | null, ms: number) {
  if (!sb) return 0;
  let q = sb.from("tg_calls").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", new Date(Date.now() - ms).toISOString());
  if (ipHash) q = q.eq("ip_hash", ipHash);
  const { count } = await q;
  return count || 0;
}
async function logCall(kind: string, ipHash: string) { if (sb) await sb.from("tg_calls").insert({ kind, ip_hash: ipHash }); }
function bg(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er && er.waitUntil) er.waitUntil(p.catch(() => {})); else p.catch(() => {});
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", rupee: "₹" };
function decodeEnt(s: string) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function textOf(html: string) {
  return clean(decodeEnt(String(html || "")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|td)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")).replace(/(\.\s*){2,}/g, ". "));
}
function sentenceAt(text: string, idx: number, max = 160) {
  let a = idx, b = idx;
  while (a > 0 && idx - a < max && !/[.!?]\s/.test(text.slice(a - 2, a))) a--;
  while (b < text.length && b - idx < max && !/[.!?]/.test(text[b])) b++;
  return clean(text.slice(a, b + 1)).replace(/^[.\s]+/, "");
}
function quoteOf(text: string, re: RegExp, max = 160) {
  const m = re.exec(text); if (!m) return null;
  return clip(sentenceAt(text, m.index, max), max);
}

async function fetchPolite(u: URL | string, opts: { timeout?: number; maxBytes?: number; accept?: string } = {}) {
  let r = await fetchText(u, opts);
  if (r.status === 429 || r.status === 503) { await new Promise((res) => setTimeout(res, 2500)); r = await fetchText(u, opts); }
  return r;
}
// ---------------------------------------------------------------- crawl (Discover)
function robotsRules(robots: string) {
  const dis: string[] = [], allow: string[] = [], sitemaps: string[] = [];
  let applies = false, lastUA = false;
  for (const raw of String(robots || "").split(/\r?\n/)) {
    const l = raw.replace(/#.*/, "").trim(); if (!l) continue;
    const m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "sitemap") { sitemaps.push(v); continue; }
    if (k === "user-agent") { if (!lastUA) applies = false; if (v === "*") applies = true; lastUA = true; continue; }
    lastUA = false;
    if (!applies) continue;
    if (k === "disallow" && v) dis.push(v);
    if (k === "allow" && v) allow.push(v);
  }
  return { dis, allow, sitemaps };
}
function robotsAllows(rules: { dis: string[]; allow: string[] }, path: string) {
  const toRe = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  let best = -1, ok = true;
  for (const d of rules.dis) { try { if (toRe(d).test(path) && d.length > best) { best = d.length; ok = false; } } catch { /* bad rule */ } }
  for (const a of rules.allow) { try { if (toRe(a).test(path) && a.length >= best) { best = a.length; ok = true; } } catch { /* bad rule */ } }
  return ok;
}
function locsOf(xml: string) { return [...String(xml || "").matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEnt(m[1].trim())); }
function kindOfUrl(u: string) {
  const p = (() => { try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } })();
  if (p === "/" || p === "") return "home";
  if (/\/products?\/|\/p\/|\/dp\/|\/item\//.test(p)) return "product";
  if (/\/collections?\/|\/category\/|\/categories\/|\/shop\/|\/c\//.test(p)) return "collection";
  if (/\/blogs?\/|\/articles?\/|\/news\/|\/journal\/|\/stories\//.test(p)) return "blog";
  if (/\/pages?\/|\/about|\/contact|\/faq|\/policies\//.test(p)) return "page";
  return "other";
}
function metaOf(head: string, name: string) {
  const re = new RegExp("<meta[^>]+(?:name|property)=[\"']" + name.replace(/[:.]/g, "\\$&") + "[\"'][^>]*>", "i");
  const t = head.match(re); if (!t) return null;
  const c = t[0].match(/content=["']([^"']*)["']/i);
  return c ? clean(decodeEnt(c[1])) : "";
}
function pageSummary(html: string, url: string, status: number) {
  const head = html.slice(0, 250_000);
  const title = clean(decodeEnt((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""));
  const desc = metaOf(head, "description");
  const robots = (metaOf(head, "robots") || "").toLowerCase();
  const canonTag = (head.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [""])[0];
  const canon = (canonTag.match(/href=["']([^"']+)["']/i) || [])[1] || null;
  let canonSelf: boolean | null = null;
  if (canon) { try { const a = new URL(canon, url), b = new URL(url); canonSelf = a.host.replace(/^www\./, "") === b.host.replace(/^www\./, "") && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, ""); } catch { canonSelf = null; } }
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(" ");
  const types = [...new Set([...ld.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)].flatMap((m) => (m[1].match(/"([^"]+)"/g) || []).map((x) => x.replace(/"/g, ""))))].slice(0, 12);
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((t) => !/\balt\s*=\s*["'][^"']*\S[^"']*["']/i.test(t)).length;
  const bodyText = textOf(html.slice(html.search(/<body/i) >= 0 ? html.search(/<body/i) : 0));
  return {
    url, status, kind: kindOfUrl(url), title, titleLen: title.length, desc: desc == null ? null : desc.length, noindex: /noindex/.test(robots),
    canon: canon ? (canonSelf ? "self" : "other") : "none", h1, types, rating: /"aggregateRating"/.test(ld), offers: /"offers"/.test(ld), faq: types.includes("FAQPage"),
    og: !!metaOf(head, "og:image"), hreflang: (head.match(/hreflang=/gi) || []).length, imgs: imgs.length, noAlt, words: bodyText.split(" ").length,
  };
}
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(new Array(Math.min(n, items.length)).fill(0).map(async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
async function handleCrawl(url: URL) {
  const target = normalizeUrl(url.searchParams.get("url") || "");
  const origin = target.origin;
  const ck = "crawl:" + target.hostname.replace(/^www\./, "");
  const hit = await cacheGet(ck);
  if (hit && hit.age < DAY) return json({ ...hit.data, cached: true });
  const [robots, llms, sm0] = await Promise.all([fetchQuiet(origin + "/robots.txt"), fetchQuiet(origin + "/llms.txt"), fetchQuiet(origin + "/sitemap.xml")]);
  const rtxt = robots && robots.status === 200 ? robots.text : "";
  const rules = robotsRules(rtxt);
  let smText = sm0 && sm0.status === 200 && /<(urlset|sitemapindex)/i.test(sm0.text) ? sm0.text : "";
  if (!smText && rules.sitemaps[0]) { const s2 = await fetchQuiet(rules.sitemaps[0]); if (s2 && s2.status === 200) smText = s2.text; }
  let urls: string[] = [];
  const counts: Record<string, number> = {};
  let truncated = false;
  if (/<sitemapindex/i.test(smText)) {
    const kids = locsOf(smText);
    const pick = ["product", "collection", "page", "blog"].map((k) => kids.find((u) => new RegExp(k, "i").test(u))).filter(Boolean) as string[];
    const chosen = (pick.length ? pick : kids).slice(0, 4);
    const subs = await Promise.all(chosen.map((u) => fetchText(u, { timeout: 8000, maxBytes: 900_000, accept: "application/xml,text/xml,*/*" }).catch(() => null)));
    subs.forEach((s) => { if (s && s.status === 200) { const l = locsOf(s.text).filter((x) => !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(x)); urls = urls.concat(l); if (s.bytes >= 900_000) truncated = true; } });
    counts.sitemaps = kids.length;
  } else if (smText) urls = locsOf(smText);
  urls = [...new Set(urls.filter((u) => { try { return new URL(u).hostname.replace(/^www\./, "") === target.hostname.replace(/^www\./, ""); } catch { return false; } }))];
  urls.forEach((u) => { const k = kindOfUrl(u); counts[k] = (counts[k] || 0) + 1; });
  const by: Record<string, string[]> = {};
  urls.forEach((u) => { const k = kindOfUrl(u); (by[k] = by[k] || []).push(u); });
  const spread = (a: string[] = [], n: number) => a.length <= n ? a : new Array(n).fill(0).map((_, i) => a[Math.floor(i * a.length / n)]);
  let sample = [origin + "/"].concat(spread(by.product, 8), spread(by.collection, 5), spread(by.page, 3), spread(by.blog, 3), spread(by.other, 3));
  sample = [...new Set(sample)].slice(0, 22);
  let blocked = 0;
  sample = sample.filter((u) => { let p = "/"; try { p = new URL(u).pathname; } catch { /* keep */ } const ok = robotsAllows(rules, p); if (!ok) blocked++; return ok; });
  const pages = await pool(sample, 2, async (u) => {
    try { const r = await fetchPolite(u, { timeout: 9000, maxBytes: 450_000 }); return pageSummary(r.text, r.finalUrl.href, r.status); }
    catch { return { url: u, status: 0, kind: kindOfUrl(u) } as any; }
  });
  const out = {
    host: target.hostname, at: new Date().toISOString(), robots: !!rtxt, robotsBlocksAll: rules.dis.includes("/") , aiBlocked: rtxt ? robotsBlocked(rtxt) : [],
    llms: !!(llms && llms.status === 200 && llms.text.length > 50 && !/<html/i.test(llms.text.slice(0, 300))), sitemap: !!smText, sitemapUrls: urls.length, truncated, counts, blocked, pages,
  };
  bg(cachePut(ck, "crawl", out));
  return json(out);
}

// ---------------------------------------------------------------- trust check
const URGENCY_APPS: Array<[string, RegExp]> = [
  ["Hurrify countdown", /hurrify/i], ["Hextom countdown bar", /hextom/i], ["Essential Countdown Timer", /essential[-_ ]?countdown/i],
  ["Sales Pop", /sales[-_ ]?pop/i], ["FOMO", /fomo\.com|usefomo/i], ["ProveSource", /provesource/i], ["Nudgify", /nudgify/i],
  ["Ultimate Sales Boost", /ultimate[-_ ]?sales[-_ ]?boost/i], ["Stock countdown app", /stock[-_ ]?countdown|low[-_ ]?stock[-_ ]?alert/i],
  ["Countdown timer app", /countdown[-_ ]?timer[-_ ]?(bar|app|plus|ultimate)|timer\.appsfinal|cuddle(cloud)?[-_ ]?timer/i],
];
async function handleTrust(req: Request) {
  const body = await req.json().catch(() => ({}));
  const target = normalizeUrl(body.url);
  const ck = "trust:" + target.hostname.replace(/^www\./, "") + target.pathname.replace(/\/+$/, "");
  const hit = await cacheGet(ck);
  if (hit && hit.age < DAY) return json({ ...hit.data, cached: true });
  let page;
  try { page = await fetchPolite(target, { timeout: 15000 }); } catch { throw new HttpError(422, "Couldn't open the page."); }
  if (page.status >= 400) return json({ error: "blocked", status: page.status });
  const raw = page.text, origin = page.finalUrl.origin;
  const ptext = textOf(raw.slice(raw.search(/<body/i) >= 0 ? raw.search(/<body/i) : 0));
  const shopify = /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(raw.slice(0, 600_000));
  // policy pages: Shopify standard paths + footer links
  const links = new Set<string>();
  if (shopify) ["/policies/refund-policy", "/policies/shipping-policy"].forEach((p) => links.add(origin + p));
  for (const m of raw.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const t = textOf(m[2]).toLowerCase(), h = m[1].toLowerCase();
    if (/(return|refund|exchange|shipping|delivery|cancell?ation)/.test(t + " " + h) && !/(track|login|account|cart|mailto|tel:|wa\.me|whatsapp|\/apps\/|dashboard|\/blogs?\/|\/products\/|\/collections\/)/.test(h)) {
      try { const u = new URL(m[1], origin); if (u.origin === origin) links.add(u.href.split("#")[0]); } catch { /* ignore */ }
    }
    if (links.size >= 6) break;
  }
  const pol = (await pool([...links].slice(0, 5), 5, async (u) => {
    try {
      const r = await fetchPolite(u, { timeout: 8000, maxBytes: 700_000 });
      if (r.status !== 200) return null;
      const body2 = (r.text.match(/<div[^>]+class=["'][^"']*shopify-policy__body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1];
      const t = textOf(body2 || r.text.slice(r.text.search(/<main|<body/i) >= 0 ? r.text.search(/<main|<body/i) : 0));
      const kind = /refund|return|exchange/i.test(u) ? "returns" : /ship|deliver/i.test(u) ? "shipping" : /cancel/i.test(u) ? "cancellation" : "policy";
      return { url: r.finalUrl.href, kind, text: t.slice(0, 30000) };
    } catch { return null; }
  })).filter(Boolean) as Array<{ url: string; kind: string; text: string }>;
  const polText = pol.map((p) => p.text).join(" ");
  const polSrc = (re: RegExp) => {
    for (const p of pol) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = g.exec(p.text))) { const q = clip(sentenceAt(p.text, m.index, 160), 160); if (!/\?\s*$/.test(q)) return { quote: q, src: p.url }; if (g.lastIndex === m.index) g.lastIndex++; }
    }
    return null;
  };

  let product: any = null;
  if (shopify && /\/products\/[^/?#]+/i.test(page.finalUrl.pathname)) {
    const pj = await fetchPolite(origin + page.finalUrl.pathname.replace(/\/+$/, "") + ".js", { timeout: 6000, maxBytes: 800_000, accept: "application/json" }).catch(() => null);
    try { product = pj && pj.status === 200 ? JSON.parse(pj.text) : null; } catch { product = null; }
  }
  // facts from the policy pages
  const daysNear = (t: string) => {
    const s = new Set<number>();
    for (const m of t.matchAll(/(\d{1,3})\s*(?:-|–)?\s*(?:calendar |business |working )?days?\b[^.]{0,70}?\b(return|exchange|refund|replace)/gi)) s.add(+m[1]);
    for (const m of t.matchAll(/\b(return|exchange|refund|replacement)s?\b[^.]{0,70}?\b(?:within|in|of)\s*(\d{1,3})\s*(?:-|–)?\s*(?:calendar |business |working )?days?\b/gi)) s.add(+m[2]);
    return [...s].filter((n) => n > 0 && n <= 365);
  };
  const NO_RET = /\b(no returns?\b|do(?:es)? not (?:accept|offer|entertain) (?:any )?returns?|non[- ]returnable|cannot be returned|can ?not be returned|not eligible for (?:a )?returns?|all sales are final|no refunds?\b|not (?:accept|offer)\w* (?:any )?refunds?)/i;
  const EXCH_ONLY = /\b(exchange only|only (?:an )?exchange|exchanges? only|store credit only|refund(?:s|ed)? (?:only )?(?:as|in the form of|via) (?:a )?(?:store credit|wallet|coupon|credit note)|only (?:as )?store credit)/i;
  const facts = {
    policies: pol.map((p) => ({ url: p.url, kind: p.kind, words: p.text.split(" ").length })),
    returnDays: daysNear(polText),
    noReturns: polSrc(NO_RET),
    exchangeOnly: polSrc(EXCH_ONLY),
    freeShipAbove: (() => { const m = polText.match(/free (?:shipping|delivery)[^.]{0,60}?(?:above|over|on (?:all )?orders? (?:above|over|of|worth)|for orders? (?:above|over))\s*(?:rs\.?|inr|₹|\$|usd)?\s*([\d,]+)/i); return m ? +m[1].replace(/,/g, "") : null; })(),
    deliveryDays: (() => { const m = polText.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:business |working )?days?[^.]{0,40}?(deliver|ship|dispatch|arriv)|(deliver|ship|dispatch|arriv)\w*[^.]{0,60}?(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:business |working )?days/i); return m ? (m[1] ? [+m[1], +m[2]] : [+m[5], +m[6]]) : null; })(),
    codFee: (() => { const m = polText.match(/(?:cod|cash on delivery)[^.]{0,80}?(?:fee|charge|charges|convenience)[^.]{0,30}?(?:rs\.?|inr|₹)\s*(\d+)/i); return m ? +m[1] : null; })(),
    damagedOnly: polSrc(/\b(?:only|solely)\b[^.]{0,40}\b(?:damaged|defective|wrong (?:item|product)|manufacturing defect)|\b(?:damaged|defective)\b[^.]{0,60}\b(?:replace|replacement)\b/i),
    returnShipPaidByBuyer: polSrc(/\b(customers?|you|buyers?) (?:will |shall |would )?(?:need to |have to )?(?:bear|pay)[^.]{0,50}(?:shipping|courier|postage|reverse pick ?up|return)/i),
  };

  // claims made on the page
  const claimDaysRe = /\b(\d{1,3})[- ]?days? (?:easy |free |hassle[- ]free |no[- ]questions?[- ]asked )?(?:returns?|exchanges?|return\s*(?:&|and|\/)\s*exchange|replacement|money[- ]back|refund)/i;
  const claims = {
    returnDays: (() => { const m = ptext.match(claimDaysRe); return m ? { days: +m[1], quote: quoteOf(ptext, claimDaysRe) } : null; })(),
    easyReturns: quoteOf(ptext, /\b(easy|free|hassle[- ]free|no[- ]questions?[- ]asked) (returns?|exchanges?)\b/i),
    freeShip: quoteOf(ptext, /\bfree (shipping|delivery)\b(?![^.]{0,40}(above|over|on orders|orders above|min))/i),
    moneyBack: quoteOf(ptext, /\b(money[- ]back guarantee|100% refund|full refund)\b/i),
    cod: /cash on delivery|\bcod\b/i.test(ptext),
  };

  // the product area of the page (cart drawers and announcement bars sit before it)
  const h1txt = textOf((raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").slice(0, 80);
  let pIdx = h1txt.length > 3 ? ptext.indexOf(h1txt) : -1;
  if (pIdx < 0 && product && product.title) pIdx = ptext.indexOf(String(product.title).slice(0, 60));
  const pwin = pIdx >= 0 ? ptext.slice(pIdx, pIdx + 3000) : "";
  const OFFER_CTX = /\b(buy \d|buy any|any \d|code|coupon|cart|orders? above|extra|bank|upi|prepaid|on orders|sitewide|use code)\b/i;
  // contradictions: page vs policy, quotes verbatim
  const contra: any[] = [];
  const pageSrc = page.finalUrl.href;
  if ((claims.easyReturns || claims.returnDays) && facts.noReturns && !claims.returnDays?.days) {
    contra.push({ issue: "The page promises easy returns, but the policy says some items can't be returned.", a: { quote: claims.easyReturns || claims.returnDays!.quote, src: pageSrc }, b: facts.noReturns, sev: 2 });
  }
  if (claims.returnDays && facts.returnDays.length && !facts.returnDays.includes(claims.returnDays.days)) {
    const q = polSrc(new RegExp("\\b(" + facts.returnDays.join("|") + ")\\s*(?:-|–)?\\s*(?:calendar |business |working )?days?", "i"));
    if (q) contra.push({ issue: "The page and the returns policy give different return windows (" + claims.returnDays.days + " vs " + facts.returnDays.join("/") + " days).", a: { quote: claims.returnDays.quote, src: pageSrc }, b: q, sev: 3 });
  }
  if (claims.moneyBack && (facts.exchangeOnly || facts.noReturns)) {
    contra.push({ issue: "The page offers a refund guarantee, but the policy limits refunds.", a: { quote: claims.moneyBack, src: pageSrc }, b: facts.exchangeOnly || facts.noReturns, sev: 3 });
  }
  if (claims.freeShip && facts.freeShipAbove) {
    const q = polSrc(/free (?:shipping|delivery)[^.]{0,60}?(?:above|over|orders)/i);
    if (q) contra.push({ issue: "Free shipping is shown without its condition. The policy says it applies above a minimum order.", a: { quote: claims.freeShip, src: pageSrc }, b: q, sev: 1 });
  }

  const numbers: any[] = [];
  // urgency that can't be verified
  const urgency: any[] = [];
  const apps = URGENCY_APPS.filter(([, re]) => re.test(raw)).map(([n]) => n);
  if (apps.length) urgency.push({ kind: "app", names: apps, text: "A countdown or live-activity app is installed (" + apps.join(", ") + ")." });
  const scripts = [...raw.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.length < 60000);
  for (const s of scripts) {
    const m = s.match(/Math\.(?:floor|round|ceil)?\(?\s*Math\.random\(\)[^;]{0,80}/);
    if (m && /(viewing|watching|people|visitors|bought|sold|purchased|stock|left|hurry|orders? today)/i.test(s.slice(Math.max(0, (m.index || 0) - 400), (m.index || 0) + 400))) {
      urgency.push({ kind: "random", text: "A script on the page picks a random number for a 'people viewing', 'sold' or 'only X left' message.", code: clip(clean(m[0]), 90) });
      break;
    }
  }
  const timerText = pwin ? quoteOf(pwin, /\b(ends? in|offer ends|sale ends|hurry[^.]{0,20}(?:left|ends)|only [1-9]\d{0,2} (?:left|pieces? left|units? left))\b/i) : null;
  if (timerText && !urgency.length) urgency.push({ kind: "text", text: "The page shows a countdown or stock message.", quote: timerText });

  // numbers
  const ldObjs: any[] = [];
  const walk = (o: any) => { if (!o || typeof o !== "object" || ldObjs.length > 200) return; if (Array.isArray(o)) { o.forEach(walk); return; } ldObjs.push(o); Object.values(o).forEach((v) => { if (v && typeof v === "object") walk(v); }); };
  for (const m of raw.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(m[1].trim())); } catch { /* invalid JSON-LD */ } }
  const isType = (o: any, t: string) => [].concat(o["@type"] || []).some((x: any) => String(x).toLowerCase() === t);
  const ldProd = ldObjs.find((o) => isType(o, "product"));
  const offer = ldProd ? [].concat(ldProd.offers || []).map((x: any) => (x && x.offers ? [].concat(x.offers)[0] : x))[0] as any : null;
  const ldPrice = offer && offer.price != null && +offer.price > 0 ? +offer.price : offer && offer.lowPrice ? +offer.lowPrice : null;
  const ar = ldProd && ldProd.aggregateRating;
  const ldRating = ar && +ar.ratingValue > 0 ? { value: +ar.ratingValue, count: +(ar.reviewCount || ar.ratingCount || 0) || null } : null;
  if (product && product.variants && product.variants.length) {
    const v0 = product.variants.find((v: any) => v.available) || product.variants[0];
    const price = v0.price / 100, cmp = v0.compare_at_price ? v0.compare_at_price / 100 : null;
    const saleQ = pwin ? quoteOf(pwin.slice(0, 900), /\b(sale price|on sale|\d{1,2}\s?% off|save (?:rs\.?|₹|\$)?\s?\d+)\b/i) : null;
    const saleWord = saleQ && !OFFER_CTX.test(saleQ) ? saleQ : null;
    if (saleWord && (!cmp || cmp <= price)) numbers.push({ issue: "The page shows a sale or discount, but the product's data has no higher original price.", quote: saleWord, sev: 2, tag: "seen" });
    const pctQ = pwin ? quoteOf(pwin.slice(0, 900), /\b\d{1,2}\s?% off\b/i) : null;
    const pct = pctQ && !OFFER_CTX.test(pctQ) ? pctQ.match(/(\d{1,2})\s?% off/i) : null;
    if (pct && cmp && cmp > price) { const real = Math.round((1 - price / cmp) * 100); if (Math.abs(real - +pct[1]) >= 4) numbers.push({ issue: "The discount shown (" + pct[1] + "% off) doesn't match the prices (" + real + "% off).", quote: pctQ, sev: 2, tag: "seen" }); }
    if (ldPrice && Math.abs(ldPrice - price) > 1 && Math.abs(ldPrice - price * 100) > 1) numbers.push({ issue: "Search engines see a different price (" + ldPrice + ") from the product's price (" + price + ").", sev: 1, tag: "seen" });
  }
  const origins = [...new Set([...ptext.matchAll(/country of origin\s*[:\-]?\s*([A-Za-z]{3,20}(?: [A-Za-z]{3,12})?)/gi)].map((m) => m[1].toLowerCase().trim()))];
  if (origins.length > 1) numbers.push({ issue: "The page lists more than one country of origin (" + origins.slice(0, 3).join(", ") + ").", sev: 1, tag: "seen" });

  // claims that need a source
  const CLAIMS: Array<[string, RegExp]> = [
    ["clinically proven", /\bclinically (?:proven|tested|backed)\b/i], ["dermatologist tested", /\bdermatologist[- ](?:tested|approved|recommended)\b/i],
    ["number one / best-selling", /(?:#\s?1|\bno\.?\s?1|\bnumber one)\b[^.]{0,30}(?:brand|selling|choice|rated)|\bindia'?s (?:best|most loved|favourite|largest)\b|\bbest[- ]selling\b/i],
    ["100% natural / chemical-free", /\b100% (?:natural|organic|pure)\b|\bchemical[- ]free\b|\btoxin[- ]free\b/i],
    ["visible results claim", /\bresults? in (?:just )?\d{1,2} (?:days|weeks)\b|\b\d{2,3}% (?:of )?(?:users|people|customers|women|men) (?:saw|noticed|reported|felt)\b/i],
  ];
  const SOURCE = /\b(study|studies|trial|tested on|participants|subjects|n\s?=\s?\d|lab report|third[- ]party|certified by|according to|survey of|journal|research)\b/i;
  const unsupported: any[] = [];
  for (const [label, re] of CLAIMS) {
    const m = re.exec(ptext); if (!m) continue;
    const win = ptext.slice(Math.max(0, m.index - 300), m.index + 400);
    if (!SOURCE.test(win)) unsupported.push({ claim: label, quote: quoteOf(ptext, re) });
  }

  const out = {
    url: page.finalUrl.href, shopify, facts, claims, contradictions: contra, urgency, numbers, unsupported: unsupported.slice(0, 4),
    apps: APPS.filter(([, , re]) => re.test(raw)).map(([n, c]) => ({ name: n, cat: c })),
    reviews: { schema: ldRating }, product: product ? { title: product.title, type: product.type, vendor: product.vendor, tags: (product.tags || []).slice(0, 15), price: product.price / 100, compareAt: product.compare_at_price ? product.compare_at_price / 100 : null, variants: product.variants.length, options: (product.options || []).map((o: any) => o.name || o).slice(0, 4), available: product.available, desc: textOf(product.description || "").slice(0, 2500) } : null,
    policyText: pol.map((p) => p.kind + ": " + p.text.slice(0, 900)).join("\n").slice(0, 2200),
  };
  bg(cachePut(ck, "trust", out));
  return json(out);
}

// ---------------------------------------------------------------- insight (one small Groq call)
function normQ(s: string) { return String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9₹$%' ]+/g, " ").replace(/\s+/g, " ").trim(); }
async function groq(model: string, messages: unknown[], timeout = 25000) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(timeout),
    headers: { "Authorization": "Bearer " + GROQ_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_completion_tokens: 1800, response_format: { type: "json_object" }, ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}) }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.choices) throw new Error("groq " + r.status + " " + JSON.stringify(d && d.error || "").slice(0, 160));
  return JSON.parse(d.choices[0].message.content || "{}");
}
async function handleInsight(req: Request) {
  const b = await req.json().catch(() => ({}));
  const target = normalizeUrl(b.url);
  const text = clean(String(b.text || "")).slice(0, 4500), policy = clean(String(b.policy || "")).slice(0, 1800);
  if (text.length < 200) return json({ fallback: true, reason: "too_little_text" });
  const ck = "insight:" + target.hostname.replace(/^www\./, "") + target.pathname.replace(/\/+$/, "");
  const hit = await cacheGet(ck);
  if (hit && hit.age < DAY) return json({ ...hit.data, cached: true });
  const ipHash = await sha(clientIp(req));
  if (GROQ_KEY.startsWith("__") || await callsSince("insight", ipHash, DAY) >= 30 || await callsSince("insight", null, DAY) >= 1500) return json({ fallback: true, reason: "limit" });
  await logCall("insight", ipHash);
  const facts = [
    "Store category: " + clip(String(b.category || "unknown"), 60) + (b.sub ? " / " + clip(String(b.sub), 60) : ""),
    "Market: " + (b.market === "US" ? "United States" : b.market === "IN" ? "India" : "unknown"),
    "Page type: " + clip(String(b.pageType || ""), 20), "Title: " + clip(String(b.title || ""), 150), "Product: " + clip(String(b.product || ""), 150),
    "Price: " + clip(String(b.price || ""), 30),
  ].join("\n");
  const sys = "You help a D2C store understand why shoppers hesitate. Reply with one JSON object only, no prose.";
  const user = facts + "\n\nPAGE TEXT:\n" + text + (policy ? "\n\nPOLICY TEXT:\n" + policy : "") + `

Return JSON with exactly these keys:
{"product": "what this page sells, under 8 words",
 "buyer": "who most likely buys it, under 12 words",
 "questions": [{"q": "a doubt a shopper has about THIS specific product before paying, in their words, under 14 words", "look_for": ["3 to 6 short generic words or phrases a page would use when answering this doubt"], "answer": "exact quote copied from PAGE TEXT that answers this doubt, under 120 characters, or empty string if the page does not answer it", "why": "why it matters for this product, under 16 words"}],
 "contradictions": [{"a": "exact quote copied from PAGE TEXT", "b": "exact quote copied from PAGE TEXT or POLICY TEXT", "issue": "the conflict, under 20 words"}],
 "one_liner": "the single biggest reason this shopper might not buy from this page, under 22 words, plain words"}
Rules: 4 to 6 questions; prefer doubts that only apply to this kind of product (ingredients, fit, taste, size, results, compatibility, care), not generic shipping, payment or returns questions. Contradictions only when two statements truly conflict; copy quotes character for character, under 120 characters each; return [] if none. Never invent facts that are not in the text.`;
  let data: any = null, model = "openai/gpt-oss-120b";
  try { data = await groq(model, [{ role: "system", content: sys }, { role: "user", content: user }]); }
  catch (_e) {
    model = "openai/gpt-oss-20b";
    try { data = await groq(model, [{ role: "system", content: sys }, { role: "user", content: user }], 20000); } catch (e2) { console.error("insight", String(e2)); return json({ fallback: true, reason: "ai_failed" }); }
  }
  const T = normQ(text), P = normQ(text + " " + policy);
  const s = (v: unknown, n: number) => clip(clean(String(v || "")), n);
  const questions = (Array.isArray(data.questions) ? data.questions : []).slice(0, 6).map((q: any) => ({
    q: s(q.q, 110), why: s(q.why, 130), answer: (() => { const a = s(q.answer, 160); return a.length > 8 && T.includes(normQ(a)) ? a : ""; })(),
    look_for: [...new Set((Array.isArray(q.look_for) ? q.look_for : []).map((x: unknown) => normQ(String(x))).filter((x: string) => x.length >= 3 && x.length <= 40))].slice(0, 6),
  })).filter((q: any) => q.q && q.look_for.length);
  const contradictions = (Array.isArray(data.contradictions) ? data.contradictions : []).slice(0, 3).map((c: any) => ({ a: s(c.a, 160), b: s(c.b, 160), issue: s(c.issue, 160) }))
    .filter((c: any) => c.a.length > 8 && c.b.length > 8 && normQ(c.a) !== normQ(c.b) && T.includes(normQ(c.a)) && P.includes(normQ(c.b)));
  const out = { model, product: s(data.product, 80), buyer: s(data.buyer, 110), questions, contradictions, one_liner: s(data.one_liner, 200), at: new Date().toISOString() };
  bg(cachePut(ck, "insight", out));
  return json(out);
}

// ---------------------------------------------------------------- peers (category leaders, refreshed daily)
const PEERS: Record<string, { IN: string[]; US: string[] }> = {
  "Beauty & Personal Care": { IN: ["beminimalist.co", "mamaearth.in", "plumgoodness.com"], US: ["theordinary.com", "glossier.com", "summerfridays.com"] },
  "Fashion & Apparel": { IN: ["thesouledstore.com", "snitch.co.in", "rarerabbit.in"], US: ["gymshark.com", "everlane.com", "quince.com"] },
  "Jewellery & Accessories": { IN: ["giva.co", "caratlane.com", "miabytanishq.com"], US: ["mejuri.com", "gorjana.com", "catbirdnyc.com"] },
  "Health & Wellness": { IN: ["kapiva.in", "plixlife.com", "wellbeingnutrition.com"], US: ["ritual.com", "drinkag1.com", "liquid-iv.com"] },
  "Food & Beverages": { IN: ["thewholetruthfoods.com", "sleepyowl.co", "bluetokaicoffee.com"], US: ["magicspoon.com", "graza.co", "drinkpoppi.com"] },
  "Home & Living": { IN: ["thesleepcompany.in", "wakefit.co", "urbanladder.com"], US: ["brooklinen.com", "fromourplace.com", "carawayhome.com"] },
  "Electronics & Gadgets": { IN: ["boat-lifestyle.com", "gonoise.com", "atomberg.com"], US: ["anker.com", "nothing.tech", "ouraring.com"] },
  "Baby & Kids": { IN: ["superbottoms.com", "themomsco.com", "firstcry.com"], US: ["lovevery.com", "coterie.com", "hatch.co"] },
  "Pet Care": { IN: ["headsupfortails.com", "supertails.com"], US: ["bark.co", "wildone.com", "thefarmersdog.com"] },
  "Sports & Fitness": { IN: ["cultsport.com", "decathlon.in", "muscleblaze.com"], US: ["therabody.com", "hyperice.com", "vuoriclothing.com"] },
  "Games & Toys": { IN: ["firstcry.com"], US: ["lovevery.com"] },
};
async function peerData(host: string) {
  const r = await fetch(SCAN_API + "/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://" + host + "/", role: "competitor" }), signal: AbortSignal.timeout(45_000) });
  const a = await r.json().catch(() => null);
  if (!r.ok || !a || a.error) throw new Error("scan failed " + r.status);
  const key = Deno.env.get("PSI_API_KEY") || (PSI_KEY_HARD.startsWith("__") ? "" : PSI_KEY_HARD);
  let psi: any = null;
  if (key) {
    const runs = await Promise.all(["mobile", "desktop"].map((st) => fetch(psiUrl(a.url, st, key), { signal: AbortSignal.timeout(100_000) }).then((x) => x.json()).then((d) => d && d.lighthouseResult ? compactPsi(d, st) : null).catch(() => null)));
    const m = runs[0], d = runs[1];
    if (m) psi = { perf: m.scores.performance, seo: m.scores.seo, a11y: m.scores.accessibility, lcp: m.metrics.lcp, cls: m.metrics.cls, tbt: m.metrics.tbt, desktop: d ? d.scores.performance : null, field: m.field || null };
  }
  const tools = (a.stack && a.stack.tools) || [];
  return { host, at: new Date().toISOString(), psi, ai: a.ai && a.ai.readiness, conv: a.conversion && a.conversion.score, speedEst: a.lite && a.lite.speedEstimate, rating: a.page && a.page.rating, tools: tools.map((t: any) => t.name + "|" + t.category), title: a.page && a.page.title, platform: a.page && a.page.platform };
}
const PEER_HOSTS = new Set(Object.values(PEERS).flatMap((x) => [...x.IN, ...x.US]));
async function handlePeerRefresh(url: URL) {
  const h = String(url.searchParams.get("host") || "").toLowerCase();
  if (!PEER_HOSTS.has(h)) throw new HttpError(400, "Unknown peer.");
  const d = await peerData(h);
  if (d.psi) await cachePut("peer:" + h, "peer", d);
  return json(d);
}
async function kickRefresh(h: string, selfBase: string) {
  const lock = await cacheGet("peerlock:" + h);
  if (lock && lock.age < 180_000) return;
  await cachePut("peerlock:" + h, "lock", { at: Date.now() });
  const p = fetch(selfBase + "/peer-refresh?host=" + encodeURIComponent(h)).then((r) => r.text()).catch(() => "");
  bg(p);
  await new Promise((res) => setTimeout(res, 400));
}
async function handlePeers(url: URL) {
  const cat = String(url.searchParams.get("cat") || ""), mk = url.searchParams.get("market") === "US" ? "US" : "IN";
  const ex = String(url.searchParams.get("exclude") || "").replace(/^www\./, "");
  const list = ((PEERS[cat] || { IN: [], US: [] })[mk] || []).filter((h) => h !== ex && !ex.endsWith("." + h)).slice(0, 2);
  const selfBase = (SUPABASE_URL || "https://mrfixorpmhrnkxhqzesn.supabase.co") + "/functions/v1/troogrowth";
  const out = await Promise.all(list.map(async (h) => {
    const hit = await cacheGet("peer:" + h);
    if (hit && hit.age < DAY) return hit.data;
    await kickRefresh(h, selfBase);
    return hit ? { ...hit.data, stale: true } : { host: h, pending: true };
  }));
  return json({ category: cat, market: mk, peers: out });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/troogrowth/, "") || "/";
  try {
    if (path === "/health" || path === "/") return json({ ok: true, db: !!sb, ai: !GROQ_KEY.startsWith("__"), psi: !PSI_KEY_HARD.startsWith("__") });
    if (path === "/crawl" && req.method === "GET") return await handleCrawl(url);
    if (path === "/trust" && req.method === "POST") return await handleTrust(req);
    if (path === "/insight" && req.method === "POST") return await handleInsight(req);
    if (path === "/peers" && req.method === "GET") return await handlePeers(url);
    if (path === "/peer-refresh" && req.method === "GET") return await handlePeerRefresh(url);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("troogrowth error", e);
    return json({ error: status === 500 ? "Something went wrong on our side. Try again." : (e as Error).message }, status);
  }
});
