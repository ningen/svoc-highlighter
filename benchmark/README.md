# External benchmark corpus

External HTML is **never committed**. This directory is for opt-in, local-only benchmarking against public pages.

## Safety rules

- `sources.json` is intentionally empty by default.
- Add only URLs you have reviewed for automated-access terms and licensing.
- The fetcher checks `robots.txt` before every page family and refuses disallowed URLs.
- Requests use an identifying User-Agent and a minimum delay between requests.
- Downloads are capped per run.
- Raw HTML is written only under `benchmark/cache/`, which is gitignored.
- GitHub Actions does not execute the external fetcher.
- Do not add authenticated, personalized, private, paywalled, or user-specific URLs.
- Do not commit copied third-party prose into tests. Use synthetic/paraphrased fixtures and gold cases.

Example local source entry:

```json
{
  "url": "https://docs.example.org/page",
  "license": "CC-BY-4.0",
  "termsReviewed": true,
  "note": "Public documentation; automated access reviewed by maintainer"
}
```

## Run a local benchmark

Start from the example list instead of editing the empty default allowlist:

```bash
cp benchmark/sources.example.json benchmark/sources.local.json
```

Review each page's current license, terms, and crawler policy. Remove any page you have not approved, then set `termsReviewed` to `true` only for the entries you reviewed. The local file is gitignored.

Fetch the approved pages explicitly:

```bash
npm run benchmark:fetch -- --sources benchmark/sources.local.json
```

Existing cache entries are reused. Add `--refresh` when you intend to fetch them again. Fetching remains opt-in; CI and release jobs never run it.

Run the parser benchmark against the local cache:

```bash
CHROME_BIN=/path/to/chromium npm run benchmark:run
```

The evaluator uses only local files and headless Chromium. It does not call network APIs. Useful options are:

```text
--cache <dir>    HTML and metadata cache (default: benchmark/cache)
--out <dir>      report directory (default: benchmark/output)
--limit <count>  maximum cached pages to process (default: 100)
--browser <path> Chromium or Chrome executable
```

The run writes `report.json` and `report.md` under the gitignored output directory. Reports include page and sentence totals, highlighted/skipped counts, rules, confidence buckets, parser and extraction time, and capped samples for long clauses, relative-aware parses, missing main verbs, overlapping ranges, M-heavy output, and low-confidence highlights. Reports contain sentence snippets and metadata, never raw HTML.

For a fully local smoke test, run:

```bash
npm test
CHROME_BIN=/path/to/chromium npm run test:browser
```

Browser tests use only the synthetic fixtures in `tests/fixtures/`.
