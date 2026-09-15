# DEC-088 — Management Entitlement Safety

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

DEC-062 persists read-only Organization subscription and Management entitlement
booleans but intentionally does not enforce them. Commercial lapse must not
endanger vehicles already in custody.

## Decision

Only VAYLET platform authority controls commercial entitlements. Tenant users
cannot mutate entitlement state. Entitlement checks are server-side,
current-state, typed, and independent of opaque `plan_code` labels.

A Management/Dashboard entitlement lapse may restrict Management reads,
configuration, analytics, reports, exports, branding administration, or other
commercial Management features. It must never block or alter valet field
operations, including check-in, parking, retrieval, ready, handoff, secure
release, custody completion, operational incident safety, or the minimal guest
flow required to complete a visit. No field command may import a Dashboard
entitlement guard.

Guest valet-payment rules remain governed by financial policy and are not SaaS
billing entitlements.

## Reason

Commercial access control must not create a physical-custody safety failure.

## Consequences

MGT-BE-12 owns read-only commercial access and Management-only enforcement.
The implementation requires explicit negative regression tests for every field
transition. DEC-062 is amended only to add this enforcement composition rule.

## Security and privacy considerations

Entitlement state is server-controlled and tenant-read-only. Denials must not
disclose other tenants or internal commercial configuration, and stale client
state is never authority.

## Supersedes/amends references

Amends DEC-062 by accepting Management-only enforcement while preserving its
typed read-only subscription source.

## Affected docs/code

`docs/01_PRODUCT_SCOPE.md`, `docs/06_SECURITY_AND_DATA_RULES.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future Management authorization.
