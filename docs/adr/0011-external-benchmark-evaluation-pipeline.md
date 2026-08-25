# ADR 0011: Evaluate cached documentation with a local browser pipeline

## Status
Accepted

## Context
ADR 0010 allows maintainers to fetch reviewed public documentation into a gitignored cache, but the repository had no way to run that HTML through the same DOM extraction and parser path used by the extension. Parser-only corpora cannot show failures caused by navigation, inline code, nested blocks, or document structure. Opening cached pages directly would also risk executing third-party scripts.

The benchmark must remain local and opt-in. Raw HTML cannot enter Git, CI must not fetch public pages, and the evaluator must work without network access after the cache is populated.

## Decision
1. Load cached HTML with synchronous file access in a dedicated headless Chromium harness.
2. Parse the response with `DOMParser` instead of navigating to the cached page. This keeps third-party scripts inert.
3. Reuse `dom-extractor.js`, the production English-text gate, and `parser.js` so the benchmark follows the extension's content path.
4. Keep orchestration in `tools/run-benchmark.mjs`. It may read files and launch Chromium but must not import or call network APIs.
5. Write JSON and Markdown reports under gitignored `benchmark/output/`. Reports may include sentence snippets and source metadata, but never raw HTML.
6. Report parser coverage, confidence, rule usage, processing time, and bounded suspicious-sample buckets. Overlapping ranges are always suspicious because modifier ranges are designed not to overlap S/V/O/C.
7. Keep the source example disabled with `termsReviewed: false`. Maintainers copy it to a gitignored local file and approve entries individually.
8. Test the harness and report library with synthetic fixtures only. CI and release jobs do not run the external fetcher or cached-page benchmark.

## Rationale
The browser harness covers the DOM boundary without trusting or executing cached code. Separating pure report functions from the browser runner keeps aggregation easy to test, while the policy test makes the evaluator's offline boundary visible in the repository.

## Consequences
- Maintainers can compare parser behavior across documentation styles after one reviewed fetch step.
- Reports are reproducible while the local cache is retained, but the cache remains intentionally outside version control.
- A Chromium or Chrome executable is required for browser extraction.
- Source licensing, terms, and robots rules can change, so maintainers must review them before fetching or refreshing pages.
- CI validates the synthetic pipeline but does not provide a live external benchmark result.

## Alternatives considered
- Navigate directly to cached pages: rejected because embedded scripts and resource loads would blur the offline and trust boundaries.
- Reimplement DOM extraction in Node: rejected because it would diverge from browser parsing and the production extractor.
- Commit benchmark output or raw pages: rejected because reports can contain third-party snippets and raw pages carry redistribution obligations.
- Fetch and benchmark in CI: rejected because it creates recurring external traffic, nondeterminism, and policy drift.
