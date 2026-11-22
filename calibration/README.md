# Shopper-experience score calibration

How the TrooCRO analyzer's main score was built.

1. `urls.json` lists 67 product pages: strong D2C brands (G), mid-size stores (M) and small, unknown stores (P). 60 rendered usable pages; 6 that only render with JavaScript were left out.
2. `harvest.js` loads each page through the TrooCRO page view (scripts removed), renders it on a 390 x 844 phone and runs `crofeat.js` to measure what a shopper sees (button and price on the first screen, stars near the name, delivery and reassurance by the button, structure, fit to the screen and more). Results are in `features.json`.
3. `score.py` learns sign-constrained weights (a feature can only add to the score if CRO practice says it helps), shrunk toward equal weights, and calibrates the output so the median poor page sits at 30, average at 55 and strong at 80. Leave-one-out check: strong vs poor pages are ranked correctly 85 to 88% of the time.
4. `model.json` is the exported model. The live analyzer runs the same `crofeat.js` in a hidden phone-sized frame and applies these numbers.

To recalibrate with more brands: add rows to `urls.json`, run `node harvest.js`, then `python3 score.py`, and paste the new `model.json` into `assets/js/analyzer.js` (CRO_MODEL).
