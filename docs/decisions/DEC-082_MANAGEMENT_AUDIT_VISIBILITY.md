# DEC-082 — Management Audit Visibility

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

Audit persistence exists but no general tenant Audit Explorer exists. Raw
metadata cannot safely become a public projection.

## Decision

Company Admin may query a safe Organization-wide Management audit projection.
Location Manager is limited to explicitly authorized Locations. Supervisor may
see only operational history necessary for authorized work. Employee has no
general Audit Explorer. Guest has none.

Account-security audit is never returned through tenant audit. Secrets, raw
credentials, unrestricted metadata, and raw GPS/route history are excluded
without separate explicit authority. Each event family uses an allowlisted
projection; unknown event types fail closed to a minimal safe form.

Queries are bounded, paginated, filter-scoped, tenant-safe, stable under
concurrent appends, and reauthorize current persisted access on every request.
Ordinary reads do not recursively create audit events.

## Reason

Useful operational accountability requires purpose-limited projections, not a
dump of internal audit JSON.

## Consequences

MGT-BE-06 depends on DEC-079 and DEC-080. Indexes require measured query plans;
raw-route access stays governed by DEC-049.

## Security and privacy considerations

Event projections use explicit allowlists, current persisted authorization,
bounded filters, and non-disclosing tenant failures. Audit metadata is never a
generic public JSON response.

## Supersedes/amends references

Amends DEC-017 with the Management visibility matrix and preserves DEC-049's
separate route-history authority.

## Affected docs/code

`docs/06_SECURITY_AND_DATA_RULES.md`, `docs/08_DECISIONS_LOG.md`,
`docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`, future audit contracts/API.
