# DEC-094 — Location Lifecycle

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

Location persistence currently defaults status to `ACTIVE`, while no tenant
Location-creation lifecycle API exists. Immediate activation would bypass
setup and safe operational drain.

## Decision

A newly created Location starts `INACTIVE`. Currency and IANA timezone are
chosen explicitly, and required setup/readiness must be complete before an
explicit activation.

Closing is a lifecycle, not one status toggle:

1. stop new intake;
2. finish or explicitly hand over existing operational work; and
3. deactivate only after safe drain.

Historical Location data is never deleted. Deactivation must not fabricate
completion of Shifts, Tasks, custody, Incidents, Payments, or ValetSessions.

Currency changes may be prospective only when every historical financial fact
retains its immutable currency snapshot. Timezone changes after production use
are exceptional corrections requiring explicit authority, reason, audit, and
impact review; historical timestamps and prior reporting meaning are not
silently rewritten.

Creation, readiness, activation, intake-stop, and deactivation require
five-minute MFA freshness, stable operation identity/CAS as appropriate,
current-state rechecks, same-tenant constraints, and atomic audit.

## Reason

Location status must preserve safe setup, custody continuity, and historical
reporting semantics.

## Consequences

MGT-BE-07 owns the lifecycle. The existing database default `ACTIVE` is a known
implementation gap: the create command must explicitly persist `INACTIVE`, and
the implementation task must decide whether a forward migration should also
change the default. No current schema is changed by this decision task.

## Security and privacy considerations

Lifecycle commands require same-Organization MFA-backed authority, explicit
reason/operation identity, atomic audit, and non-disclosing errors. Historical
tenant and custody records remain authorized after deactivation.

## Supersedes/amends references

Amends current active/inactive Location semantics with creation, readiness,
intake-stop, drain, and correction rules; no historical DEC is rewritten.

## Affected docs/code

`docs/01_PRODUCT_SCOPE.md`, `docs/02_DOMAIN_MODEL.md`,
`docs/03_DATABASE_SCHEMA.md`, `docs/08_DECISIONS_LOG.md`,
`docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`, future Location/domain code.
