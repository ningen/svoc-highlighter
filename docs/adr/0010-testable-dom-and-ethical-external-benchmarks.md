# ADR 0010: Separate DOM extraction and keep external benchmarks ephemeral

## Status
Accepted

## Context
Real-use diagnostics revealed DOM-specific failures such as inline code disappearing, search-result UI fragments being parsed as prose, and browser structure affecting sentence extraction. Relying on user diagnostics to discover these cases makes the architecture difficult to test and turns observability into the primary validation mechanism.

The repository is public. Copying fetched third-party HTML into Git would redistribute copyrighted material and can trigger attribution/share-alike obligations or conflict with site terms. Automated retrieval can also impose load on publishers or ignore their crawler preferences.

## Decision
1. Extract DOM-to-text logic into `dom-extractor.js`, independent from parsing and rendering.
2. Test DOM extraction with committed **synthetic HTML fixtures** using headless Chromium.
3. Keep parser/gold-corpus tests pure and network-free.
4. Provide an optional external benchmark fetcher for maintainers, but keep its allowlist empty by default.
5. External fetching must:
   - require an explicit allowlisted source with license metadata and `termsReviewed: true`;
   - honor `robots.txt`;
   - use an identifying User-Agent;
   - rate-limit requests and cap pages per run;
   - reject credentialed URLs;
   - store fetched HTML only under gitignored `benchmark/cache/`.
6. CI must not fetch third-party pages. CI uses only synthetic fixtures and local corpora.
7. Third-party raw HTML and copied prose are not committed. Durable regression cases should be synthetic or paraphrased unless their license and attribution requirements are intentionally handled.
8. Real-use diagnostics remain observability for unknown cases, not a prerequisite for correctness testing.

## Rationale
This separates correctness into independently testable layers while minimizing privacy, copyright, terms-of-service, and publisher-load concerns. It also makes regressions reproducible without depending on live sites.

## Consequences
- DOM regressions can be reproduced locally without web access.
- External benchmark runs are intentionally opt-in and less reproducible than committed raw fixtures.
- Maintainers must review site terms/licensing before adding a source.
- Synthetic fixtures must model important DOM patterns rather than copy third-party pages verbatim.

## Alternatives considered
- Commit scraped HTML fixtures: rejected because a public repository would redistribute third-party content.
- Scrape live pages in CI: rejected because it creates recurring external load, nondeterminism, and terms/robots drift.
- Keep relying on real-use diagnostics: rejected because it makes test coverage dependent on user browsing behavior.
