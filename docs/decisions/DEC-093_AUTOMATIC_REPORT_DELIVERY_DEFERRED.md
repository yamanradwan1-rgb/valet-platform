# DEC-093 — Automatic Report Delivery Deferred

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

DEC-061 already ships manual synchronous CSV/PDF composition and leaves
automated delivery to Reliability.

## Decision

Automatic/scheduled report delivery is deferred. Manual authenticated CSV/PDF
is the current Management requirement.

A future scheduled-delivery contract must use email first, deliver an
authenticated link rather than an open sensitive attachment, recheck current
authorization/entitlement immediately before send, use bounded retries and
truthful delivery states, and reuse the existing report composer. It may not
create a second formula implementation or expose report content through an
unguessable-link-only security model.

## Reason

Manual exports satisfy the current requirement without adding scheduler,
artifact-retention, recipient, and delivery-security obligations prematurely.

## Consequences

The old automatic-delivery packet is deferred and is not one of the 12 active
Management tasks. DEC-061 remains the current manual report authority.

## Security and privacy considerations

No open attachment or bearer-by-obscurity link is authorized. Future delivery
must recheck recipient authority/entitlement and minimize retained artifacts
and delivery metadata.

## Supersedes/amends references

Confirms DEC-061's automation deferral and supersedes the old current
automatic-delivery packet.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`.
