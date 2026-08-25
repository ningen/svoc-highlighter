# ADR-0005: Remove manual correctness feedback

- Status: Accepted
- Date: 2026-08-25

## Context

An earlier diagnostics UI allowed the user to mark samples as correct or identify S, V, O/C, or other errors. In practice this created extra interaction cost and the collected diagnostic exports showed that the review counters were unused.

The project already has a stronger maintenance loop: export diagnostics, inspect representative failures, create reviewed gold examples, then run automated regression tests.

## Decision

Remove the per-sample human correctness feedback UI and its stored review fields/counters.

Diagnostics are for discovering candidate failures. Accuracy decisions live in the source-controlled gold corpus and automated tests.

## Rationale

- Reduces settings/diagnostics UI complexity.
- Avoids asking the user to annotate grammar during normal browsing.
- Keeps correctness decisions durable and reviewable in source control.

## Consequences

There is no one-click in-browser annotation of a bad highlight. A diagnostic export or a separately reported sentence is required to add a new gold case.
