# ADR-0004: Use a gold corpus for regression monitoring

- Status: Accepted
- Date: 2026-08-25

## Context

A parser can improve one sentence pattern while silently breaking another. Confidence scores are useful for triage but do not prove that a prediction is grammatically correct.

Real diagnostic logs provide candidate examples, but expected S/V/O/C roles still need a stable reference.

## Decision

Maintain a source-controlled gold corpus containing reviewed English sentences and their expected parser behavior. Real diagnostic examples that have a sufficiently clear grammatical interpretation can be promoted into this corpus.

Every parser change must run regression tests against the gold corpus and other fixed test cases.

Ambiguous sentences should not be forced into a single gold answer unless the project defines a deliberate annotation convention for them.

## Rationale

- Measures correctness against explicit expected outcomes rather than confidence alone.
- Prevents previously fixed parser failures from returning.
- Turns real-world failures into durable test coverage.
- Keeps accuracy work deterministic and reviewable.

## Consequences

Passing the gold corpus does not mean the parser has 100% real-world accuracy. It means the parser has not regressed on the currently encoded decisions and examples.
