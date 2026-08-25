# ADR-0008: Expose analyzed hostnames in settings

- Status: Accepted
- Date: 2026-08-25

## Context

Regex exclusions are flexible but manually typing every hostname is inconvenient. Users also need visibility into which sites have produced diagnostics so they can notice a sensitive domain and exclude it quickly.

## Decision

Track lightweight per-host analysis counts locally and show an "Analyzed hostnames" list in settings.

For each hostname, show analysis/highlight counts and provide an `Exclude` action. The action escapes the hostname and adds an exact-match regular expression such as:

```text
^docs\.example\.com$
```

After exclusion, existing samples and counters for that hostname are removed. Runtime parsing on currently loaded pages follows ADR-0007 and therefore requires reload to stop.

Host counters and the exclusion list are not included in exported diagnostics.

## Rationale

- Makes sensitive-domain cleanup discoverable.
- Avoids requiring users to write regex for the common exact-host case.
- Retains regex flexibility for advanced patterns.

## Consequences

Per-host counters add a small amount of local storage, but no page text is added beyond diagnostics already captured.
