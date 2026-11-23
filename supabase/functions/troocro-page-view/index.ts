// TrooCRO page view: fetches a public store page and returns its HTML with scripts removed,
// so the analyzer can show the real page under the agents. Read-only, nothing stored.
// ?raw=1 keeps the scripts (only <base> is set and CSP/refresh metas dropped): the analyzer runs that copy in a
// sandboxed frame with no same-origin access, to read reviews and text that the store draws with JavaScript.
const ALLOWED_ORIGINS = [/^https:\/\/purrieie\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
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
const FIX_CSS = "<style>html{scroll-behavior:auto!important}.scroll-trigger,[data-aos],.animate--slide-in,.animate--fade-in,.reveal,.lazyload,.lazyloading{opacity:1!important;transform:none!important;visibility:visible!important}</style>";
Deno.serve(async (req: Request) => {
  const c = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: c.h });
  const json = (d: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { ...c.h, ...extra, "Content-Type": "application/json; charset=utf-8" } });
  if (!c.ok) return json({ error: "origin_not_allowed" }, 403);
  const sp = new URL(req.url).searchParams, raw = sp.get("raw") === "1";
  let cur = publicUrl(sp.get("url") || "");
  if (!cur) return json({ error: "bad_url" }, 400);
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
