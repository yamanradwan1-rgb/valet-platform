# DEC-092 — All Locations Analytics

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

Current analytics and reports authorize and calculate one exact Location.
Company Admin needs company views without mathematically invalid aggregation.

## Decision

All Locations analytics recomputes from underlying authoritative source data.
It never averages displayed averages. Ratios use summed numerators divided by
summed denominators. Money remains grouped by immutable currency and currencies
are never converted or combined without a later accepted FX contract.

Each Location's persisted timezone controls its local date/cohort semantics.
Company output must expose coverage and Location/timezone boundaries rather
than silently forcing one Organization timezone. Missing data stays missing and
is never converted to zero. Zero is returned only for a supported measured
cohort whose legitimate value is zero.

Queries must be tenant-isolated, bounded by Location and period, avoid N+1
execution, and be inspected/tested at representative multi-Location volumes.

## Reason

Recomputation preserves statistical, monetary, and local-time correctness.

## Consequences

MGT-BE-11 extends DEC-060/061 using shared formula composers rather than
combining already-rendered Location cards or reports.

## Security and privacy considerations

Company aggregates require current MFA-backed Organization authority and
bounded source access. Location membership, contact, route, and staff details
must not leak through drill-down or export fields.

## Supersedes/amends references

Amends DEC-060/061 with Organization aggregation semantics; their
single-Location correctness and export hardening remain binding.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future company analytics/report contracts.
