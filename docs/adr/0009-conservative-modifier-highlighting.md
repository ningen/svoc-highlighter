# ADR 0009: Highlight modifiers conservatively as M

- Status: Accepted
- Date: 2026-08-25

## Context

The extension's core purpose is to expose sentence structure visually. S/V/O/C covers the main clause skeleton, but technical prose frequently places important context in prepositional phrases, adverbs, and adverbial/conditional clauses. Treating every unclassified token as M would create visual noise and convert parser uncertainty into misleading highlights.

## Decision

Add an `M` role, but only for high-confidence modifier spans that do not overlap S/V/O/C. Initial support targets fronted prepositional phrases, conditional/adverbial clauses, and standalone adverb/prepositional phrases. Infinitival complements are excluded from M. M uses a subtle gray dotted underline so core roles remain visually dominant.

## Rationale

The extension is a reading aid, not a full syntactic tree viewer. Conservative M detection improves readability while keeping false-positive cost low. Non-overlap also preserves the existing S/V/O/C regression contract.

## Consequences

Some legitimate modifiers will remain unhighlighted until rules improve. This is preferred to aggressively labeling uncertain spans. M accuracy can be expanded using real-world diagnostics and the gold corpus without changing the visual hierarchy.

## Alternatives considered

- Mark every token outside S/V/O/C as M: rejected because punctuation, clause fragments, and parser errors would appear authoritative.
- Use a full dependency parser: deferred because it increases runtime/package complexity and conflicts with the lightweight local-first goal.
