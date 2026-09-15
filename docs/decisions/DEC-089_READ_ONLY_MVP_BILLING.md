# DEC-089 — Read-Only MVP Billing

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

The current `OrganizationSubscription` has plan code, status, and three typed
entitlements. It contains no SaaS billing execution data.

## Decision

MVP Billing is a read-only Management projection of plan, subscription status,
and included features. Do not build invoices, card storage, Stripe, renewal,
coupon, self-upgrade, checkout, cancellation, or a SaaS billing portal.

The page must not fabricate price, renewal date, invoice availability, or a
provider state absent from persistence. VAYLET-owned provisioning remains an
external/internal platform operation until separately accepted. Guest valet
payment, validation, cash, and refund flows are separate and unchanged.

## Reason

The existing typed subscription state supports truthful customer visibility
without pulling a billing platform into MVP.

## Consequences

MGT-BE-12 reuses or extends safe read projections only. The old SaaS billing
engine packet is retired for the current stream.

## Security and privacy considerations

Return only the tenant's allowlisted commercial projection. Payment
credentials, provider objects, invoice data, and internal provisioning controls
do not enter this surface.

## Supersedes/amends references

Narrows DEC-062's deferred billing gap to a read-only MVP view and supersedes
the old current billing-engine packet.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future commercial read contracts.
