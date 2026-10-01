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

## Approved Issue #240 / T05-A identity and directory extension — 2026-10-01

The owner-approved U-01 contract adds nullable `firstName` and `lastName` to
OrganizationMembership. User remains the global email authority. Existing
memberships retain null names; no email-derived or guessed backfill is allowed.
Non-null names preserve Unicode, diacritics and punctuation, have no surrounding
ECMAScript whitespace, and contain 1–100 Unicode code points. The conservative
100-code-point component bound is an implementation constant; existing shared
Management labels use 200 characters, but no structured person-name bound exists.

One exported shared identity formatter displays `firstName + " " + lastName`
only when both names exist; otherwise it displays the real email. Directory and
detail expose the same structured identity, and named staff retain visible email.
Names are protected tenant identity, never global User fields.

The existing Company Admin directory supports bounded, trimmed, case-insensitive
literal substring search (maximum 200 Unicode code points) over first name,
last name, full name and User email, exact role/status, and Organization-owned
Location filters. Effective predicates precede the `(created_at,id)` keyset
limit (default 50, maximum 100); grant counts remain bounded to returned rows.
Version-2 cursors bind domain, Organization and a SHA-256 fingerprint of effective
filters (trimmed/empty-normalized search with case preserved, exact enums and
normalized Location UUID), never readable search PII. Search case remains
distinct in the fingerprint to avoid assuming PostgreSQL locale case-folding
equivalence. Invalid/mismatched cursors fail validation.
Existing Company Admin authority, MFA, entitlements and all mutation semantics
remain unchanged. Location Manager expansion, onboarding and shift changes are
owned by later Issue #240 slices and are not introduced by T05-A.

Source: Issue #240, the owner-approved execution plan U-01, and T05-A brief.

## Reason (original decision)

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
