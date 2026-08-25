# ADR-0006: Use regex hostname exclusions

- Status: Accepted
- Date: 2026-08-25

## Context

Diagnostics can contain page text. Some domains may contain private, corporate, or personal information and must never be included in diagnostic data. A fixed hard-coded denylist would not cover user-specific environments.

## Decision

Provide a user-configurable exclusion list containing one regular expression per line. Patterns are matched against `location.hostname`, not the full URL.

When exclusion settings are saved:

- Existing diagnostic samples for newly excluded hostnames are removed.
- Host-level diagnostic counters for those hostnames are removed.
- Export applies the exclusion rules again as a defensive filter.
- The exclusion patterns themselves are not included in exported diagnostic JSON.

## Rationale

- Regex supports exact domains and domain families.
- Matching only the hostname avoids inspecting or storing potentially sensitive URL paths and query strings.
- Cleanup on settings changes prevents older samples from remaining in later exports.

## Consequences

Invalid regular expressions must be handled safely. Users are responsible for choosing patterns broad enough for the domains they intend to exclude.
