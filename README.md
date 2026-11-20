# TrooCRO website

A TrooCRO-branded clone of coframe.com's marketing site and free site analyzer, rebuilt on Troopod's own data: the TrooCRO signal library (937 signals, 79 buyer barriers), published Troopod case studies and Troopod's delivery averages.

Everything runs at ₹0: static pages, one Supabase Edge Function on the free plan, Google Fonts and the free Google PageSpeed API.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Homepage: hero with URL box, scroll-driven walkthrough, customer results, platform, testimonials, visitors-to-buyers flow, how it works, logo wall, comparison table, integrations, trust, final CTA. |
| `analyze.html` | Free site analysis: quick questions, live 10-stage scan, then a full report with a share link. |
| `contact.html` | Book a demo form (saved to Supabase) with a WhatsApp fallback. |
| `*.md`, `llms.txt`, `robots.txt` | Agent views of every page (also behind the HUMAN / AGENT toggle), an llms.txt guide and a robots.txt that welcomes AI crawlers. |

## Run it locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Live scans work from your computer too. Share links need the site to be hosted.

## How the analyzer works

1. **Start.** The URL box (homepage or `analyze.html?url=yourstore.com`) calls `POST /scan` straight away.
2. **Quick questions** (category, order value, goal, monthly visitors, up to two competitors) are asked while the first read runs. If the answers change the category or order band, the page is scanned again with those answers.
3. **Live scan** in four phases: Read, Diagnose, Measure, Plan. Conversion checks land in the feed one by one, each tagged to its buyer barriers. Speed runs through Google PageSpeed when it is available, otherwise it is estimated from the page's code. Competitor homepages are scanned in parallel.
4. **Report**: website score (conversion 40%, speed 20%, search and AI 20%, accessibility 20%; areas we can't measure are left out, never counted as zero), radar of area scores, findings by priority with barrier, root cause and the playbook fix, the first three tests with a dated plan (45 and 90-day checks), speed, search and AI, AI-agent view, accessibility, growth stack, competitor comparison, category benchmark, a lift calculator and the "Fix it with TrooCRO" CTA. The report is saved with `POST /save` and opens again at `analyze.html?r=REPORT_ID`.
5. **Sample mode**: where live scans can't run (for example a sandboxed preview), the page offers a sample report from a real scan of Shopify's public Dawn demo store (`assets/js/sample-report.js`).

All scanned text is escaped before it is shown. No paid AI calls are made: the analysis is rule-based on the TrooCRO library.

## Backend (Supabase, free plan)

Project: **TrooCRO** (`mrfixorpmhrnkxhqzesn`). Function URL is set in `assets/js/config.js`.

Edge Function `troocro-site-analysis` (`supabase/functions/troocro-site-analysis`):

| Route | Purpose |
| --- | --- |
| `GET /health` | Status, and whether a PageSpeed key is set. |
| `POST /scan` | Fetches the page (redirect-safe, public hosts only, 4 MB cap), reads robots.txt, llms.txt, sitemap and the Shopify product JSON, runs the checks and returns the result plus the library entries they map to. Rate limit: 40 scans an hour per visitor. |
| `GET /psi` | Google PageSpeed through the server, used only when a key is set. |
| `POST /save`, `GET /report` | Save a finished report once, and load it by its ID. |
| `POST /lead` | Saves contact and report leads (honeypot plus 10 an hour per visitor). |

Tables (`supabase/migrations`): `sa_scans` (every scan and saved report) and `sa_leads` (demo and report requests). Row level security is on with no policies, so only the function can read or write them. The function reads the TrooCRO library tables (`ref_signals`, `ref_fixes`, `ref_barriers`, `ref_root_causes`, `ref_benchmarks`) and never writes to them.

**Leads:** new demo and report requests land in `sa_leads` (Supabase dashboard, Table editor). Nothing emails the team yet.

**Measured speed (optional, free):** Google's shared keyless PageSpeed quota is usually used up, so speed is estimated by default. Create a free PageSpeed Insights API key in Google Cloud and add it as an Edge Function secret named `PSI_API_KEY`. The site then shows lab-measured speed, accessibility, Core Web Vitals and a phone screenshot of the page.

## Deploy to GitHub Pages

```
git init && git add . && git commit -m "TrooCRO website"
git branch -M main
git remote add origin https://github.com/<account>/troocro.git
git push -u origin main
```

Then turn on Pages (Settings, Pages, deploy from `main`, root). `.nojekyll` is included so every file is served as is.

## Brand

Troopod dark theme: `#0A0A0C` base, `#8B6BF7` purple, DM Sans and DM Mono. Sentence case, no em dashes, no emoji. Every number on the site comes from troopod.io case studies, Troopod's delivery averages or the TrooCRO library.

## What was cloned from coframe.com, and how

| Coframe | TrooCRO version |
| --- | --- |
| Hero with URL box, video background, logo marquee | Same layout; animated halftone "dot ocean" instead of the video; Troopod client logos |
| Sticky 5-step product walkthrough with app mockups | Same mechanics; TrooCRO steps (Diagnose, Find the barriers, Design the fix, Build and QA, Measure and learn) |
| Results bento, platform cards, testimonial carousel | Same structure with published Troopod case studies and verbatim testimonials |
| Scroll-drawn "visitors into buyers" flow | Same SVG mask-reveal glowing lines and halftone tail |
| Weeks vs days comparison | Troopod's delivery averages (6.4, 3.7, 3.4, 12.9 days) |
| HUMAN / AGENT toggle, `.md` agent views, llms.txt | Same, for every page |
| Free site analyzer (4 phases, 10 stages, weighted score, email and CAPTCHA gate) | Same flow and score logic without the gate; rule-based on the TrooCRO library instead of LLM agents; competitor reads, category benchmark, dated test plan |
| Experimentation SDK (bucketing, holdouts, edge variants, bandit assignment, session replay) | Not cloned. It is Coframe's product runtime, not part of the website; TrooCRO's build-and-test work happens in Troopod's delivery process |
