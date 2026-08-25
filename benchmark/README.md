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
