# Architecture Decision Records

This directory records important product and architecture decisions for SVOC Highlighter.

ADRs are source-only project documentation. They are intentionally excluded from the packaged Chrome extension because they are useful to maintainers, not at runtime.

Status values used here:

- **Accepted** — current decision.
- **Superseded** — replaced by a later ADR.

## Index

- [ADR-0001: Keep parsing local and AI-free](0001-local-ai-free-parsing.md)
- [ADR-0002: Parse only content near the viewport](0002-viewport-scoped-parsing.md)
- [ADR-0003: Record local diagnostics for parser improvement](0003-local-diagnostics.md)
- [ADR-0004: Use a gold corpus for regression monitoring](0004-gold-corpus-regression.md)
- [ADR-0005: Remove manual correctness feedback](0005-remove-manual-feedback.md)
- [ADR-0006: Use regex hostname exclusions](0006-regex-hostname-exclusions.md)
- [ADR-0007: Check hostname before starting analysis](0007-preflight-hostname-check.md)
- [ADR-0008: Expose analyzed hostnames in settings](0008-analyzed-hostnames-settings.md)

- [0009: Highlight modifiers conservatively as M](0009-conservative-modifier-highlighting.md)

- [0010: Separate DOM extraction and keep external benchmarks ephemeral](0010-testable-dom-and-ethical-external-benchmarks.md)
