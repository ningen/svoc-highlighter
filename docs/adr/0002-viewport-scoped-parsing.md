# ADR-0002: Parse only content near the viewport

- Status: Accepted
- Date: 2026-08-25

## Context

Technical documentation pages can contain hundreds or thousands of text nodes. Parsing the whole document eagerly would do unnecessary work, especially when the user reads only a small portion of the page.

## Decision

Use `IntersectionObserver` to analyze relevant text when its containing element approaches the viewport instead of eagerly parsing the entire page.

Code blocks intended as source code (`pre`) remain excluded from prose analysis. Inline code may participate in prose because technical documentation often places grammatically meaningful identifiers or values inside inline `code` elements.

## Rationale

- Work scales with what the user actually reads.
- Reduces startup cost on large documentation pages.
- Keeps DOM mutation and parser activity localized.
- Preserves inline technical tokens that can be part of the sentence grammar.

## Consequences

The extension must handle content that appears later through scrolling or dynamic page updates. Parsing order is therefore driven by visibility rather than document order.
