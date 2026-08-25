# SVOC Highlighter

## v0.8.0

- Separated DOM extraction into `dom-extractor.js` so DOM behavior can be tested independently from the parser and renderer.
- Added synthetic DOM fixtures and headless Chromium tests.
- Added an opt-in external benchmark fetcher with an empty-by-default allowlist, robots.txt checks, rate limiting, request caps, and a gitignored cache.
- CI remains network-free; fetched third-party HTML is never committed.
- Added ADR 0010 documenting the testing and ethical-data policy.


A lightweight Chrome extension that highlights the main S / V / O / C / M structure of English text directly on web pages.

## v0.7.0

- Added **M (Modifier)** highlighting for high-confidence adjuncts such as fronted prepositional phrases, conditional/adverbial clauses, and standalone adverb/prepositional phrases.
- M is intentionally conservative: it never overlaps S/V/O/C and does not treat infinitival complements as modifiers.
- M uses a subtle gray dotted underline so the core clause remains visually dominant.
- Added M-specific regression cases and ADR 0009.

## v0.6.0

- Removed the manual human-feedback/review UI and its stored review counters.
- Accuracy improvement is driven by exported real-world diagnostics plus the manually curated `tests/gold-corpus.json` regression set.
- Added an **Analyzed hostnames** section to Diagnostics & settings.
- Tracks lightweight per-host processed/highlighted counts locally.
- Each analyzed hostname has an **Exclude** button. It adds an exact-host regex such as `^docs\.example\.com$` to the exclusion list.
- Excluding a host immediately purges its stored diagnostic samples and host counter. Reload open pages for runtime exclusion to take effect.
- Excluded sites are checked at content-script startup, before DOM scanning, observers, parsing, highlighting, or diagnostics begin.
- Exclusion patterns and analyzed-host counters are not included in exported diagnostics JSON.
- Existing v0.5 review fields/counters are migrated out of local diagnostics when the settings page opens.
- No AI is used at runtime and no network requests are made.

## Highlight colors

- **S** Subject: blue underline
- **V** Verb: red underline
- **O** Object: green underline
- **C** Complement: yellow underline
- **M** Modifier: subtle gray dotted underline

## Diagnostics

Open the extension popup and choose **Diagnostics & settings**.

The extension stores diagnostics only in `chrome.storage.local`:

- number of sentences processed/highlighted
- parser time and confidence
- low-confidence samples
- parser rule / reasons
- analyzed hostname counters

Nothing is uploaded automatically. Export only happens when you explicitly download the diagnostics JSON.

### Gold corpus

`tests/gold-corpus.json` contains sentences manually reviewed for their intended S/V/O/C/M structure. It is used as a fixed reference set so parser changes can be checked against known-good analyses.

## Excluded hostnames

One JavaScript regular expression per line is matched case-insensitively against `location.hostname` only.

Example:

```text
(^|\.)corp\.example\.com$
^localhost$
```

The hostname check happens once at content-script startup. If it matches, DOM scanning, observers, parsing, highlighting, and diagnostics never start. After changing the list, reload already-open pages.

When the list is saved, existing samples and analyzed-host counters from newly excluded hosts are purged. Export applies the sample filter again as a final safety check. Exclusion regexes and host counters are never exported.

## Install

1. Download and extract `svoc-highlighter-v0.8.0.zip`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the extracted directory.

## Tests

```bash
npm test
npm run test:browser   # requires Chromium/Chrome
```

## Performance

Parsing is synchronous and local. Blocks are processed only when they approach the viewport using `IntersectionObserver`.

## Architecture decisions

Important design decisions and their rationale are recorded as ADRs under [`docs/adr/`](docs/adr/README.md). These files are maintainer documentation only and are intentionally not included in the packaged Chrome extension ZIP.
