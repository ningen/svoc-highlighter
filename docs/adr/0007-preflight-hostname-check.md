# ADR-0007: Check hostname before starting analysis

- Status: Accepted
- Date: 2026-08-25

## Context

Initially, hostname exclusions were designed primarily as a diagnostics privacy control. The desired behavior was later expanded: excluded sites should not be highlighted or parsed at all.

Checking exclusions only at diagnostic-write time would still perform DOM traversal and grammatical analysis on excluded pages.

## Decision

At content-script startup, load the exclusion patterns and test `location.hostname` before initializing parsing, DOM observation, highlighting, or diagnostics.

If the hostname is excluded, return immediately.

Changes to the exclusion list do not dynamically stop or restart an already loaded page. The user reloads the page to apply the new runtime exclusion state.

## Rationale

- Strongest privacy boundary: excluded page text does not enter the parser pipeline.
- Best performance: no observers or parser work are started on excluded sites.
- Simpler lifecycle than dynamically tearing down and restarting observers when settings change.

## Consequences

Changing the exclusion list requires a page reload before highlighting behavior changes on an already open page.
