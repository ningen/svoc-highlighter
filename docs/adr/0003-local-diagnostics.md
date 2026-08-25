# ADR-0003: Record local diagnostics for parser improvement

- Status: Accepted
- Date: 2026-08-25

## Context

Parser accuracy cannot be improved reliably from synthetic examples alone. Real technical documentation exposes fragments, UI text, nested clauses, omitted subjects, inline code, and vocabulary that are difficult to anticipate.

At the same time, automatically sending captured page text to a server would violate the local-first privacy goal.

## Decision

Collect parser diagnostics locally in `chrome.storage.local`. Diagnostics may include the sentence, predicted ranges, confidence, rule identifier, parser reasons, hostname, element metadata, and processing time.

Diagnostics are exported only when the user explicitly chooses to export them. The extension does not upload them automatically.

## Rationale

- Gives maintainers real failure examples.
- Allows rule-level and performance analysis.
- Preserves the no-network runtime design.
- Makes parser behavior explainable through rule IDs and reasons.

## Consequences

Diagnostics can contain page text, so site exclusions are required for sensitive domains. Export must remain explicit and exclusions must be re-applied before export.
