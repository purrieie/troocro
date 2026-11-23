# Shopper-experience score calibration

How the TrooCRO analyzer's main score was built.

1. `urls.json` lists 67 product pages: strong D2C brands (G), mid-size stores (M) and small, unknown stores (P). 60 rendered usable pages; 6 that only render with JavaScript were left out.
2. `harvest.js` loads each page through the TrooCRO page view (scripts removed), renders it on a 390 x 844 phone and runs `crofeat.js` to measure what a shopper sees (button and price on the first screen, stars near the name, delivery and reassurance by the button, structure, fit to the screen and more). Results are in `features.json`.
3. `score.py` learns sign-constrained weights (a feature can only add to the score if CRO practice says it helps), shrunk toward equal weights, and calibrates the output so the median poor page sits at 30, average at 55 and strong at 80. Leave-one-out check: strong vs poor pages are ranked correctly 85 to 88% of the time.
4. `model.json` is the exported model. The live analyzer runs the same `crofeat.js` in a hidden phone-sized frame and applies these numbers.

To recalibrate with more brands: add rows to `urls.json`, run `node harvest.js`, then `python3 score.py`, and paste the new `model.json` into `assets/js/analyzer.js` (CRO_MODEL).

## Homepages and collection pages (v7)

5. `harvest2.js` renders each benchmark brand's homepage, a collection page and a product page the same way (`features2.json`).
6. `fit_types.py` tried learning homepage and collection weights the same way as product pages. It didn't work: layout signals alone ranked strong and weak stores no better than chance (leave-one-out AUC about 0.5), and a research-based rubric (`rubric_types.py`, Baymard homepage and product-list guidance) even ranked small stores slightly higher, because simple themes render fully without scripts.
7. The store's own product page did separate them (AUC 0.84 on the same brands). So `combo.js` scores a homepage or collection as 70% the PDP model on one of the store's product pages (found from links on the page) and 30% this page's rubric plus the rendered checks in `rules.js`, then places the result among the benchmark stores (20th percentile = 30, median = 55, 80th = 80). Strong vs weak stores are ranked correctly about 80% (homepages) and 89% (collections) of the time. Output: `rubric_types.json`, pasted into `assets/js/analyzer.js` (RUBRIC).
8. `rules.js` holds the rendered-page findings: about 55 checks for product pages, homepages and collections, each mapped to TrooCRO barrier codes (B01 to B72) with a fix and test type. Review-widget checks are skipped when the store runs a JavaScript review app, since our render doesn't run scripts.

Run: `node combo.js 1` (needs `pdp_model.js`, `rules.js`, `features2.json`, `rubric_types.json`).

## v8: 570+ sites (current model)

9. `sites.tsv` lists 684 sites: Indian D2C (155), US D2C (130), large retailers and marketplaces (35), small unknown stores found through the public Tranco popularity list (144, Shopify stores ranked below the top 250k), fintech (63 + 52 small) and healthtech (45 + 60 small). Known brands carry a strong (G) or average (M) label; the small ones were labelled by looking at each page's first phone screen (`visual_labels.json`; X = page didn't render, left out).
10. `harvest3.js` fetches each site through the TrooCRO page view, 10 to 14 at a time: the homepage, plus a product page (first product from Shopify's products.json, or a product link) and a collection for stores. Each page is measured on a 390 x 844 phone with `crofeat.js` (now also lead-gen and design signals). Output: `features4.jsonl` (now superseded by `features5.jsonl`) (573 homepages, 361 product pages, 372 collections usable).
11. `fit8.py` fits one sign-constrained model per page type (PDP, HOME, COLLECTION, LEAD for sign-up sites) with each signal's influence capped, and reports 10-fold cross-validated AUC (strong vs weak ranked correctly): product page 0.70, homepage 0.70, collection 0.61, sign-up sites 0.75. The old 60-page model only reached 0.61 on this wider set.
12. `blend8.py` / `cvblend.py`: combining a product page and the homepage of the same site lifts cross-validated AUC to about 0.75 to 0.76, so a product-page scan also measures the homepage (70/30), a homepage scan measures a product page (50/50), and a collection scan measures a product page (70 product / 30 collection). Calibration puts the median weak site at 30, average at 55, strong at 80. Output: `models8.json` (pasted into `assets/js/analyzer.js` as MODELS).

Honest limits: a page's own layout is a noisy signal (any single page can swing 20 to 30 points), big retailers mostly block automated fetches, and labels for known brands come from brand reputation, not measured conversion rates.

## v9: fixing the noise

13. `diag9.py` listed the biggest misranks. Most strong brands that scored low had their buy button and price in the page but hidden until JavaScript runs (our render runs no scripts), so the old extractor saw "no Add to cart".
14. `crofeat.js` now counts a buy button or price that exists but is hidden by scripts (at an unknown position), catches longer button text ("Add to Bag - $28", "Select size to add to cart", "Buy for myself"), and reports `render_conf`: how completely the page rendered. `remeasure.js` re-measured all saved pages (`features5.jsonl`).
15. `blend9.py`: the two pages of a site are weighted by their base weight times render confidence. Cross-validated strong-vs-weak accuracy: about 0.77 for two pages, versus about 0.70 for one page (`cvblend2.py`). Adding a collection as a third page gained almost nothing, so it isn't fetched.
16. Each score now carries a likely range: plus or minus 8 when both pages render fully and agree, wider when only one page could be read, the pages differ by 15+ points, or key parts only appear with JavaScript. In the benchmark, sites whose two pages disagreed were off by more.

## v10: findings aligned with the TrooUIUX Scanner

17. Every TrooCRO check now carries the id of the Scanner rule it matches and uses that rule's severity tier: critical and major = high, moderate = medium, minor = low. When a major rule is only partly missed, it shows one step lower.
18. Thresholds ported for the rules both tools share: main button reachable (a sticky bar counts) and button strength (contrast, height, width), competing solid buttons, headline length, proof, store trust share, delivery promise, gallery, products on arrival, product cards, filters, shopping paths, long paragraphs and placeholder text.
19. `ruleeval.js` checks how often each finding fires across the benchmark. Checks that fired on 80 to 100% of all sites were removed or fixed: brand-scale proof, newsletter incentive, data security on its own, and the old walls-of-text measure. Measuring the benchmark again with `remeasure2.js` relaunches the browser if it crashes.
20. A product-page scan also lists the homepage's top issues (and the reverse for homepages and collections), one priority step lower, because that page counts toward the score.
21. The full rule-by-rule map stays out of this public repo because it contains the Scanner's rule text.
