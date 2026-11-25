// TrooCRO page view: fetches a public store page and returns its HTML with scripts removed,
// so the analyzer can show the real page under the agents. Read-only, nothing stored.
// ?raw=1 keeps the scripts (only <base> is set and CSP/refresh metas dropped): the analyzer runs that copy in a
// sandboxed frame with no same-origin access, to read reviews and text that the store draws with JavaScript.
// ?render=1 returns the page as a real browser drew it (scripts run, page scrolled): Cloudflare Browser Rendering when its
// token is set (CF_ACCOUNT_ID, CF_API_TOKEN; dormant until those secrets exist), else the free r.jina.ai reader. With Cloudflare
// the page is also scrolled and its tabs and accordions are tapped (TAP_SCRIPT). Neither gets past a site that blocks bots.
const ALLOWED_ORIGINS = [/^https:\/\/purrieie\.github\.io$/, /^https:\/\/(www\.)?troopod\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 TrooCRO-Analyzer/1.0";
const MAX = 3_000_000;
function cors(origin: string | null) {
  const ok = !!origin && ALLOWED_ORIGINS.some((r) => r.test(origin));
  return { ok, h: { "Access-Control-Allow-Origin": ok ? origin! : "null", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Vary": "Origin" } as Record<string, string> };
}
function publicUrl(s: string): URL | null {
  try {
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    const u = new URL(s), h = u.hostname.toLowerCase();
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.port && !["80", "443"].includes(u.port)) return null;
    if (!h.includes(".") || h === "localhost" || /\.(local|internal|localhost|arpa)$/.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return null;
    u.hash = "";
    return u;
  } catch { return null; }
}
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
// Runs inside the real browser (Cloudflare only): scroll to load lazy sections, then tap the tabs and accordions a shopper would
// (price breakup, size guide, product details, delivery, returns, FAQ...) and write what each one opened into #troo-tapped,
// so the returned HTML carries it. Never taps links that leave the page, or cart, login, share, chat or form buttons.
const TAP_SCRIPT = `(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const it=e=>{try{return e.innerText||""}catch(x){return""}};
for(let y=0;y<document.body.scrollHeight&&y<20000;y+=700){scrollTo(0,y);await w(110)}scrollTo(0,0);await w(300);
const RX=/price ?break|break ?up|size ?(guide|chart)|ring size|find (your|my) size|product (details|info|description)|specification|specs\\b|description|details|delivery|shipping|return|exchange|warranty|guarantee|ingredient|how to use|directions|care|know more|view more|read more|see more|show more|more info|faq|composition|material|fabric|dimension|measurement|certific|nutrition|in the box|assurance|policy/i;
const NO=/add to (bag|cart)|buy now|check ?out|login|log in|sign ?(in|up)|wishlist|share|notify|subscribe|write a review|apply|search|close|cancel|pay|book|call|whatsapp|chat|language|country|currency|menu/i;
const seen={},c=[];const ok=e=>{const t=it(e).replace(/\\s+/g," ").trim();if(!t||t.length>44||!RX.test(t)||NO.test(t)||seen[t.toLowerCase()])return;if(e.closest("header,nav,footer,form"))return;if(e.tagName==="A"){const h=e.getAttribute("href")||"";if(h&&!/^(#|javascript:)/i.test(h))return}if(e.type==="submit")return;const r=e.getBoundingClientRect();if(!r.width||!r.height)return;seen[t.toLowerCase()]=1;c.push([e,t])};
document.querySelectorAll("[role=tab],[aria-expanded=false],summary,button,[role=button],a,[data-toggle],[data-bs-toggle]").forEach(e=>{if(c.length<16)ok(e)});
[...document.querySelectorAll("div,span,p,li,h2,h3,h4,h5,label")].slice(0,5000).forEach(e=>{if(c.length<16&&e.children.length<=3&&getComputedStyle(e).cursor==="pointer")ok(e)});
const out=[];const L=t=>{const o={};String(t).split(/\\n+/).forEach(x=>{x=x.replace(/\\s+/g," ").trim();if(x.length>1)o[x]=1});return o};
for(const [e,t] of c){const b=L(it(document.body));try{e.scrollIntoView({block:"center"});e.click()}catch(x){}await w(600);const a=Object.keys(L(it(document.body))).filter(x=>!b[x]);if(a.length)out.push(t+": "+a.join(". ").slice(0,900));document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))}
const s=document.createElement("section");s.id="troo-tapped";s.textContent=out.join(" | ").slice(0,8000);document.body.appendChild(s)})()`;
const FIX_CSS = "<style>html{scroll-behavior:auto!important}.scroll-trigger,[data-aos],.animate--slide-in,.animate--fade-in,.reveal,.lazyload,.lazyloading{opacity:1!important;transform:none!important;visibility:visible!important}</style>";
Deno.serve(async (req: Request) => {
  const c = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: c.h });
  const json = (d: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { ...c.h, ...extra, "Content-Type": "application/json; charset=utf-8" } });
  if (!c.ok) return json({ error: "origin_not_allowed" }, 403);
  const sp = new URL(req.url).searchParams, raw = sp.get("raw") === "1";
  let cur = publicUrl(sp.get("url") || "");
  if (!cur) return json({ error: "bad_url" }, 400);
  if (sp.get("render") === "1") {
    const errs: string[] = [];
    const acc = Deno.env.get("CF_ACCOUNT_ID") || "", tok = Deno.env.get("CF_API_TOKEN") || "";
    if (acc && tok) {
      try {
        const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acc + "/browser-rendering/content", {
          method: "POST", signal: AbortSignal.timeout(40000), headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
          body: JSON.stringify({ url: cur.href, userAgent: UA.replace(" TrooCRO-Analyzer/1.0", ""), viewport: { width: 390, height: 844 }, gotoOptions: { waitUntil: "networkidle2", timeout: 30000 }, rejectResourceTypes: ["image", "media", "font"],
            addScriptTag: [{ content: TAP_SCRIPT }], waitForTimeout: 9000 }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d && d.success && typeof d.result === "string" && d.result.length > 500) return json({ url: cur.href, html: d.result.slice(0, MAX), by: "cloudflare" }, 200, { "Cache-Control": "public, max-age=600" });
        errs.push("cloudflare " + r.status + " " + JSON.stringify(d && d.errors || "").slice(0, 160));
      } catch (e) { errs.push("cloudflare " + String(e).slice(0, 120)); }
    }
    try {
      const r = await fetch("https://r.jina.ai/" + cur.href, { signal: AbortSignal.timeout(40000), headers: { "X-Return-Format": "html", "X-Timeout": "25", "X-No-Cache": "true", "Accept": "text/html" } });
      const h = await r.text();
      if (r.ok && h.length > 500 && !/^\s*\{\s*"code"\s*:\s*4\d\d/.test(h)) return json({ url: cur.href, html: h.slice(0, MAX), by: "jina" }, 200, { "Cache-Control": "public, max-age=600" });
      errs.push("jina " + r.status);
    } catch (e) { errs.push("jina " + String(e).slice(0, 120)); }
    return json({ error: "render_failed", errs }, 502);
  }
  let res: Response | null = null;
  try {
    for (let i = 0; i < 5; i++) {
      res = await fetch(cur.href, { redirect: "manual", headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-IN,en;q=0.9", "Cookie": "localization=IN; cart_currency=INR" }, signal: AbortSignal.timeout(12000) });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { const n = publicUrl(new URL(loc, cur).href); try { await res.body?.cancel(); } catch { /* ignore */ } if (!n) return json({ error: "bad_redirect" }, 400); cur = n; continue; }
      break;
    }
  } catch { return json({ error: "fetch_failed" }, 502); }
  if (!res || res.status >= 400 || !/html/i.test(res.headers.get("content-type") || "")) return json({ error: "not_html", status: res && res.status }, 502);
  const reader = res.body!.getReader(); const parts: Uint8Array[] = []; let n = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; n += value.length; parts.push(value); if (n > MAX) { try { await reader.cancel(); } catch { /* ignore */ } break; } }
  const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p.subarray(0, Math.min(p.length, n - o)), o); o += p.length; if (o >= n) break; }
  let html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (raw) {
    html = html.replace(/<meta[^>]+http-equiv=["']?(?:refresh|content-security-policy)[^>]*>/gi, "").replace(/<base\b[^>]*>/gi, "");
    const b = '<base href="' + esc(cur.href) + '">';
    html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (m) => m + b) : b + html;
    return json({ url: cur.href, html, raw: true }, 200, { "Cache-Control": "public, max-age=300" });
  }
  html = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<\/?noscript\b[^>]*>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<(object|embed)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, "")
    .replace(/<meta[^>]+http-equiv=["']?refresh[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const head = '<base href="' + esc(cur.href) + '">' + FIX_CSS;
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (m) => m + head) : head + html;
  return json({ url: cur.href, html }, 200, { "Cache-Control": "public, max-age=300" });
});
