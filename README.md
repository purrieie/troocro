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
- **Overall score** (v11.3, the headline, this page only) = weighted geometric mean of five pillars, each floored at 5, so one weak pillar pulls the total down:
  - **CRO score (85%)**: Clarity & fit 30%, Trust & risk 25%, Price, delivery & payment 20%, Focus & flow 10%.
  - **Speed score (15%)**: half Core Web Vitals against Google's thresholds (LCP 2.5/4s, TBT 200/600ms, CLS 0.1/0.25), half Lighthouse mobile performance; capped at 50 when Google's real-user data says slow. Desktop is shown, not scored.
  - Overall = CRO^0.85 x Speed^0.15, computed from the two rounded numbers on screen.
  - Buyer questions go to a pillar by the barrier library's root cause (Clarity/Desire to Clarity, Trust to Trust, Offer/Urgency to Price, Friction/Intent/Navigation to Flow). Moved by the research: B69 total cost, B09 delivery, B10 payment to Price; B50 to Trust; B15, B17, B19, B21, B25, B58 to Clarity. Weight floors: B09 7, B13 8, B10 6 in India.
  - Trust & risk = proof questions 70% + page-vs-policy agreement 30%. Price takes 8 off for a COD fee hidden in the policy. Focus & flow = layout benchmark 50% + path-to-buy questions (incl. ad match) 35% + accessibility 15%.
  - Search & AI, basket size and repeat orders are shown beside the score and ranked in the growth plan, not scored.
- **v12 score: shoppers + house rules** (replaces the five pillars in the headline; the pillars stay in the full report):
  - **Shoppers**: the `troogrowth-shop` edge function (deployed only, not in this repo: it holds the persona map and the prompts) makes two Groq calls per page. A reader (Qwen 3.8 27B with vision, looking at Google PageSpeed's first-screen screenshot; gpt-oss-20b text-only as fallback) works out the category, market, price tier and brand, picks the 4 shopper personas most likely to land on the page from a map of 62 (5 cross-category, 5 to 7 per category), finds contradictions and reads the reviews on the page. The shoppers call (gpt-oss-120b) reads the page as each persona: 5 checks with quotes copied from the page (unverifiable quotes cost 8 points each), the line where they'd hesitate, a buy score (0-100) and the one change that would win them. Shoppers score = buy scores weighted by how many shoppers like them the page gets.
  - **House rules**: 8 facts our scripts check: one clear price, page and policies agree, first screen does the job, reviews shoppers can trust, delivery time near the button, returns are clear, options in stock (Shopify product data), no fake pressure. Pass 1, partly 0.5, fail 0; a rule we can't check is left out.
  - **Customer voice** (v12.5) = shoppers 70% + reviews 30%. Reviews: count (up to 60), verified buyers or customer photos (25), average 4★ or more (15); minus 30 when the shopper read finds them unreliable and minus 30 when a widget shows 50+ reviews with none below 3 stars (reads as filtered). Reviews that couldn't load, or none on a household or well-known premium brand's page, are left out. Reviews are about 9% of the CRO score (they were 20% inside proof).
  - **Proof on the page** (v12.5, any category, reviews no longer here): tests, certificates, awards or other-platform ratings (25 for two kinds, 12 for one); specs, materials, ingredients or how-to as text (up to 15); results or customer numbers (20); out of 60, rescaled to 100; minus 20 for coupon clutter. Household names and well-known premium or luxury brands carry it by name (floor 80 and 75). Floored at 15 inside the score.
  - CRO = 30% customer voice + 50% proof + 20% house rules as a weighted geometric mean (each part floored at 5, proof at 15; weights re-spread when a part is missing), placed on a benchmark scale anchored on 20 PDPs: mix 25 -> 15, 35 -> 30, 46 -> 48, 50 -> 66, 60 -> 80, 72 -> 90 (piecewise linear, order never changes). Overall = CRO^0.85 x Speed^0.15.
  - Non-store sites (no prices, service or software copy) get no category guess and score as Other.
  - Pages we can't read (bot walls, pages that stay empty even with their scripts run) get no score and say so.
- **Live read** (v12.5): the analyzer also fetches the page with its scripts (`troocro-page-view?raw=1`) and runs that copy in a hidden, invisible frame sandboxed without same-origin access, so the store's scripts can't touch the analyzer or the shopper's session. A small script inside the copy scrolls it, waits for the text to settle (up to 17s) and posts back the visible text and this product's own review count (product schema, then a review badge near the title, then the reviews widget; badges in carousels and other products' cards are ignored). Storage, cookies and history calls are given harmless stand-ins, and A/B-test, geo-redirect and login-bridge scripts are switched off in the copy, because they read the address as about:srcdoc and send the copy away. If the copy still leaves, the last snapshot taken before it left is used. What the live copy adds is merged into the page text (an empty shell is read from the live copy instead) and the shoppers see it too.
- **Couldn't load** (v12.5): when a review app draws the reviews and neither read found a count (and the page doesn't say "no reviews yet"), reviews show "couldn't load" and are left out of the customer voice, and the reviews house rule is left out instead of failing.
- **Scan view** (v12.5): one camera move at a time, eased in and out (0.5 to 1.7s by distance), with the agent's cursor gliding in step. The conversion agent reads the page region by region from top to bottom: a frame with a scan line sits on the region and each check lands on its tag. Background agents wait on the rail; highlight boxes and pins stay glued to the page while it scrolls.
  - The report opens short: score, the 4 shoppers, the top 3 fixes and the house rules. Everything else (fix planner, buyer questions, levers, speed, search, competitors) is behind "See the full report".
- **Pinned planner** (v11.4, first section of the report): every fix the page needs, split into two tabs, CRO fixes (purple, 1, 2, 3) and Speed fixes (orange, S1, S2), each with the overall points it adds on its own. Ticking fixes re-runs the score model in the browser (`TrooGrowth.project`) and updates the CRO, Speed and "With your plan" numbers in the hero. The page itself is shown in a phone (the same script-free copy the scan measured, 262px wide) with pins in a gutter beside the part of the page each fix is about; opening a fix outlines that part. Positions come from the 390px render (`R.regions`, `R.pageH`). Speed fixes move a Core Web Vital into Google's good range and add Lighthouse's weight for it (LCP 25%, TBT 30%, CLS 25%) to PageSpeed: estimates, labelled as such.
  - Research behind the weights: eTailQ (Wolfinbarger & Gilly 2003), MECLABS heuristic, Baymard abandonment survey, Spiegel reviews study, Deloitte/Google Milliseconds Make Millions, Portent 2022, Di Fatta et al. 2018, OECD/JRC composite-indicator handbook. Weights are priors until calibrated on real conversion data.
- **Report**: snapshot, the biggest problem in one line, three things to do this week, buyer questions, levers, you vs two category leaders, things to confirm with the team, and the Troopod services that fit the top levers. Every line is tagged Seen, Estimate or Confirm.

## v13 buyer questions and v14 report (Nov 2026)

**Buyer questions (v13).** Each product page gets one question list for its kind of product, reviewed by an outside CRO audit and trimmed of questions no real buyer asks:
- 14 lists: furniture, décor, apparel, beauty, supplements, body supports, food, fine jewellery, fashion jewellery, electronics, baby, pet, sports, other.
- Sub-category add-ons, for example rugs, sunscreen or diamonds.
- Delivery, returns and reviews are shared questions across every list.

The list lives in `assets/js/troogrowth-lib.js` (`q13`). The question source is not in this repo.

- **Grading.** One AI call (Supabase function `troogrowth-grade`) grades every question:
  - The outcomes are answered, partly, not answered or not applicable, each with the page's own words.
  - A quote that isn't on the page is downgraded.
  - Conditional questions are left out when they don't apply. Example: an EMI question only counts above a set price.
  - Lab reports, vet standards and toy standards count only when the page claims them.
  - Refund mode counts only when we read the policy text.
- **Score.** Customer voice = 70% buyer questions (partly = half) + 30% reviews. The 4 shoppers stay in the report but no longer drive the score. On pages where we could read very little text, the questions and shoppers are averaged.
- **Fixes.** Fixes come only from questions the page leaves open, house rules it misses, and speed. Fableroom fixes:
  - A free replacement with no return fee counts as clear returns.
  - An installed countdown app is not a penalty.
  - Furniture, décor and fashion proof counts craft, warranty, stores and press instead of certificates.
- **Fallback.** If the grader is down, questions are checked by keywords and marked as a first pass.

**Report (v14).** The report is now a fix workbench:
- A sticky top bar with tabs: Fix planner, Buyer questions, Customer voice, Speed/search/AI, Growth plan, Next step.
- **Fix planner tab:**
  - A score ring (now and with your ticked fixes).
  - The #1 thing costing sales.
  - The tick-box fix cards, each with evidence and how to fix.
  - A revenue calculator. Its stated assumption: conversion rises by half the CRO gain, capped at +15%.
- **Phone.** The page on a phone sits on the right, with pins that match the fix numbers and a Now / With fixes toggle.

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

Edge Function `troocro-page-view` (`supabase/functions/troocro-page-view`): `GET ?url=` returns the page's HTML with scripts removed (the picture under the agents); `GET ?url=&raw=1` returns it with scripts kept, only `<base>` set and refresh/CSP metas dropped, for the sandboxed live read. Read-only, nothing stored, allowed origins only.

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
