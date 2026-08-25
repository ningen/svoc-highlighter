# ADR-0001: Keep parsing local and AI-free

- Status: Accepted
- Date: 2026-08-25

## Context

The extension exists to make English technical documentation easier to read by highlighting S/V/O/C roles directly on web pages. The primary constraint is that highlighting should feel immediate and should not introduce noticeable latency while browsing.

Sending page text to an LLM or remote parser would add network latency, recurring cost, failure modes, and privacy concerns. It would also make the feature depend on connectivity.

## Decision

SVOC analysis runs entirely inside the browser. The extension does not use AI APIs, remote NLP services, or network requests for parsing.

The parser is a lightweight deterministic parser optimized for technical English. It may use local lexical and grammatical rules, but runtime analysis must remain self-contained.

## Rationale

- Keeps interaction latency low and predictable.
- Avoids transmitting page contents to third parties.
- Works offline after installation.
- Makes behavior reproducible and regression-testable.
- Keeps operating cost at zero.

## Consequences

Positive:

- Very low per-sentence processing cost.
- Strong privacy properties by default.
- Parser behavior can be inspected and tested.

Negative:

- Complex English cannot be parsed as accurately as a large general-purpose language model in every case.
- Accuracy improvements require explicit parser rules and better test data.

## Alternatives considered

- Remote LLM parsing: rejected because latency, privacy, and cost conflict with the core browsing experience.
- Remote dependency parser: rejected for the same runtime/network reasons.
