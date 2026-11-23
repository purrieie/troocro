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
2. **Quick questions** (category, order value, goal, monthly visitors, traffic source, up to two competitors and an optional ad headline) are asked while the first read runs. If the answers change the category or order band, the page is scanned again with those answers.
3. **Live scan** in four phases: Read, Diagnose, Measure, Plan. Conversion checks land in the feed one by one, each tagged to its buyer barriers. Speed runs through Google PageSpeed when it is available, otherwise it is estimated from the page's code. Competitor homepages are scanned in parallel.
4. **Report**: website score (conversion 40%, speed 20%, search and AI 20%, accessibility 20%; areas we can't measure are left out, never counted as zero), radar of area scores, findings by priority with barrier, root cause and the playbook fix, the first three tests with a dated plan (45 and 90-day checks), speed, search and AI, AI-agent view, accessibility, growth stack, competitor comparison, category benchmark, a lift calculator and the "Fix it with TrooCRO" CTA. The report is saved with `POST /save` and opens again at `analyze.html?r=REPORT_ID`.
5. **Sample mode**: where live scans can't run (for example a sandboxed preview), the page offers a sample report from a real scan of Shopify's public Dawn demo store (`assets/js/sample-report.js`).

All scanned text is escaped before it is shown. The analysis is rule-based on the TrooCRO library; the only AI call is one small Groq request per page for product-specific questions (see TrooGrowth below).

## TrooGrowth (v11)

The report is now a growth plan, not a list of generic findings. Same scan, four extra reads, one new report.

**Extra reads** (Edge Function `troogrowth`, `supabase/functions/troogrowth`, cached 24 hours in `tg_cache`):

| Route | What it does |
| --- | --- |
| `GET /crawl?url=` | Not used by the report (it analyses only the page that was entered). Samples up to 22 sitemap pages, respecting robots.txt, for a future site-wide view. |
| `POST /trust {url}` | Fetches the returns and shipping policies, pulls facts (return window, damaged-only returns, free-shipping threshold, COD fee) and compares them with what the page promises. Also: countdown or "people viewing" scripts that use random numbers, sale labels with no higher original price, schema price vs product price, claims like "clinically proven" with no source nearby, and installed apps (reviews, loyalty, subscriptions, upsell, messaging, checkout). Quotes are copied from the pages, never written. |
| `POST /insight {...}` | The only AI call: one small Groq request per page (cached 24h, 30 a day per visitor, 1,500 a day in total). It writes 4 to 6 buyer questions for this exact product, the exact page quote that answers each one (checked by script, dropped if it isn't on the page), real contradictions between two quotes (both checked), and one line on the biggest reason a shopper might not buy. If it fails, the report runs without it. |
| `GET /peers?cat=&market=&exclude=` | Two category leaders for India or the US: homepage scan plus Google PageSpeed (mobile and desktop), refreshed once a day by `GET /peer-refresh?host=`. |

The Groq key and the server PageSpeed key are placeholders in this repo (`__GROQ_KEY__`, `__PSI_KEY__`); the deployed function has them. The browser PageSpeed key is in `assets/js/config.js` (restrict it to purrieie.github.io in Google Cloud).

**One page only:** the report covers the page that was entered: one Google PageSpeed run on mobile and one on desktop (retried once if Google fails), the page's own search checks, and the policies it links to. No second page and no site crawl.

**Engine** (`assets/js/growth.js`, pure script):
- Category, sub-category (86 from the TrooCRO library), market and season. The category gets a second opinion from the product's own words when the visitor didn't pick it.
- **Buyer questions**: the category tab of the Troopod Category Barrier Library (`assets/js/troogrowth-lib.js`, built by `calibration/troogrowth/build_lib.py`), each graded Answered, Partly, Not answered or Check from the page text, the page checks mapped to that barrier, and the trust facts. Must, Should and Basics come from the library's priority for that category. Sub-categories drop questions that don't apply (no "will it fit my room" for a detergent).
- **Six levers**: Discover (this page's search and AI checks + Google SEO score), Land (PageSpeed, accessibility, ad-to-page match), Convert (buyer questions + the benchmarked layout score), Trust, Order value, Retain. Each has a score, issues with evidence and fixes, and what's already in place.
- **Money**: visitors x conversion x order value, from the visitor's answers, the page and the TrooCRO benchmark. Each 10% lift is worth the same, so levers are ranked by room to grow, the visitor's goal, traffic source and season, with lower weight on Order value and Retain (less of them is visible from outside).
- **Growth score** (the headline, this page only): Convert 35% (buyer questions 60% + page layout benchmark 40%), Land 20%, Trust 15%, Discover 15%, Order value 7.5%, Retain 7.5%, minus 3 for each Must-solve question left unanswered (up to 15). A partly answered question counts 30%.
- **Report**: snapshot, the biggest problem in one line, three things to do this week, buyer questions, levers, you vs two category leaders, things to confirm with the team, and the Troopod services that fit the top levers. Every line is tagged Seen, Estimate or Confirm.

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
