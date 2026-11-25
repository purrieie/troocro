# TrooCRO v3: engine-faithful analyzer

v3 keeps the TrooCRO site's analyzer UI and runs it on the TrooCRO engine and Barrier Library instead of the v14 scoring. Live at https://purrieie.github.io/troocro/v3/analyze.html. The root of this repo is still the v14 site.

### Non-negotiables (approved by Jaanya, 25 Nov 2026)

1. No number without a source.
2. The TrooCRO engine code runs verbatim. It is never re-implemented.
3. Every Met or Partial grade carries a quote from the page, and a script checks the quote is really on the page.
4. Gemini only grades. Rules decide. Engine tables are read, never changed.
5. The Barrier Library is the backbone: no invented weights, no brand carry, no runtime learning.
6. Not judged is not Missing. What a product link cannot show is left out of the score.
7. No uplift or rupee figure without a sourced range.
8. Fairness: bad, mid and good pages land around 30, 50 and 70; on the 24-page set the average gap stays under 8 points and rank agreement at 0.75 or more.
9. The brand report speaks customer language: no barrier codes, signal IDs or P-labels.
10. No personal data is stored.
11. Keys live only in secrets, never in code.
12. Nothing is pushed or deployed without Jaanya's go.

### Decisions (approved by Jaanya)

- **Speed sits beside the score.** The score comes from barriers only. Google PageSpeed is shown next to it with its own number. The old 15% weight had no source.
- **Script quote check instead of two grading passes.** The TrooCRO kit asks for two independent passes on every Fail. v3 instead checks every Met and Partial quote on the page by script and lowers the grade when the words are not there (Met to Partial, Partial to Missing). This differs from the kit's 2-pass rule; it was chosen to stay inside the free Gemini quota.
- **UI parts that cannot be fed honestly are removed or marked Not judged:** the revenue and lift calculator is removed; persona bars show the % of that persona's barriers the page settles; no brand carry; no separate proof or house-rules scores; search, AI agents, accessibility and growth stack are not judged.

### Run v3 locally

The engine, prompts and keys are not in this repo. With `troocro-v2` and `troocro-v3-server` next to this folder:

```
node ../troocro-v3-server/dev.mjs
```

Then open http://localhost:8790/analyze.html. Live: https://purrieie.github.io/troocro/v3/analyze.html (folder `v3/` on `main`), backed by the `troocro-analyze` function.
