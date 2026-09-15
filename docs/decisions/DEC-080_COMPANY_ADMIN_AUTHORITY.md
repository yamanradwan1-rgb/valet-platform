# DEC-080 — Company Admin Management Authority

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

Accepted Dashboard decisions currently deny password-only `ORG_ADMIN` while
awaiting MFA. Operational commands separately and intentionally restrict field
authority to active shifted operational roles.

## Decision

After DEC-078 assurance is implemented, an active `ORG_ADMIN` may see every
Location in its active Organization; use company Dashboard/reports; manage
staff, company settings, allowed Location settings, and branding; create,
activate, drain, and deactivate Locations; and view authorized analytics and
tenant audit.

Company Admin does not automatically receive operational field authority:
check-in, parking, retrieval/handoff execution, key movement, or physical
custody operations. Operational map visibility is allowed as a company
Management read. Raw fine-grained employee route history is not included unless
a later explicit authority decision grants it.

Every request revalidates the active User, current membership/role/status,
Organization, target ownership, required MFA window, entitlement where
applicable, and capability-specific conditions from persistence. Frontend
claims, cached context, tokens, and Location IDs do not grant authority.

This decision amends the MFA-contingent `ORG_ADMIN` denials in DEC-047,
DEC-049, and DEC-058 through DEC-062 only for the capabilities explicitly
listed here. It does not broaden Supervisor, Employee, Guest, refund, override,
or field-operation matrices.

## Reason

Company administration and operational custody are different capabilities;
separating them preserves least privilege.

## Consequences

MGT-BE-03 creates a reusable Management capability matrix and company context.
Each domain keeps its own server-side guard and current-state recheck.

## Security and privacy considerations

Every Management or map read derives tenant scope, current membership, MFA
assurance, and projection on the server. Raw route samples and field mutation
capabilities remain separately protected.

## Supersedes/amends references

Amends DEC-023's MFA-contingent `ORG_ADMIN` denial for Management APIs only;
DEC-032/048/049 operational role boundaries remain binding.

## Affected docs/code

`docs/01_PRODUCT_SCOPE.md`, `docs/06_SECURITY_AND_DATA_RULES.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future Dashboard/domain authorization contracts.
