# DEC-081 — Staff, Role, and Access Lifecycle

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

The repository persists roles, membership status, and Location grants but has
only create-only operator provisioning. It has no tenant staff lifecycle API.

## Decision

Company Admin manages Organization-wide membership roles and Location access.
A Location Manager cannot change a base company role. Self-demotion is allowed
only when another usable Company Admin remains. The last usable Company Admin
cannot normally remove, demote, or deactivate themselves.

Normal deactivation or access revocation requires proper handover of active
Shifts, Tasks, key/custody responsibility, and other live work. Emergency or
security disable must block new and current access immediately and revoke
affected Staff sessions/attention endpoints, but must not fabricate Task,
KeyCustodyEvent, Shift, Incident, or ValetSession completion. Those records stay
truthful and require explicit authorized operational recovery.

Membership disable is Organization-scoped. Disabling one
`OrganizationMembership` does not disable the User or memberships in other
Organizations. Global User disable remains a distinct VAYLET security action.

Role/status/grant commands require current persisted authority, five-minute MFA
freshness, optimistic/concurrency control, last-admin serialization,
idempotent desired-state semantics, non-disclosing tenant failures, and an
atomic tenant audit event. No generic permission engine or new role enum is
introduced.

## Reason

Tenant staff administration must not strand operations, erase responsibility,
or turn a tenant-scoped action into a platform-wide account disable.

## Consequences

MGT-BE-04 owns the directory and mutation commands. Existing DEC-029 remains a
create-only deployment path; DEC-032 operational eligibility remains dynamic.

## Security and privacy considerations

Directory projections are tenant-minimized. Mutations recheck persisted
actor/target authority and do not reveal another Organization's membership,
grants, sessions, or operational responsibility.

## Supersedes/amends references

Amends DEC-029's create-only provisioning boundary with a tenant management
lifecycle; DEC-032 role and eligibility rules remain binding.

## Affected docs/code

`docs/02_DOMAIN_MODEL.md`, `docs/06_SECURITY_AND_DATA_RULES.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future staff/auth/dispatch/shift/key implementation.
