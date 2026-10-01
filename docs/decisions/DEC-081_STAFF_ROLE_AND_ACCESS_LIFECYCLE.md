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

## Approved Issue #240 / T05-B Location Manager staff authority extension — 2026-10-01

The owner-approved U-02 contract narrowly amends the original Company-Admin-only
role/access rule for existing lower-role staff. An active `LOCATION_MANAGER` may
manage only `VALET_EMPLOYEE` and `VALET_SUPERVISOR` memberships whose complete
current persisted Location grant set is non-empty and wholly contained in the
manager's own current grants to active Locations in the same active Organization.
Zero-grant, mixed/outside-grant, `ORG_ADMIN`, `LOCATION_MANAGER`, and self targets
are denied and concealed; directory, detail, no-op, mutation, and result reads use
the same complete-coverage boundary and never infer authority from a loaded page,
the first 100 grants, submitted IDs, or the Dashboard-selected Location.

Within that boundary, a Location Manager may change Employee <-> Supervisor,
activate/deactivate subject to every existing operational handover blocker, and
explicitly grant/revoke 1-50 Locations per CAS-protected command. Each submitted
Location must be in the actor's current active grant set and the resulting target
grant set must remain non-empty and wholly contained in that set. Actor grant
loss, target grant changes, and Location lifecycle changes must serialize with the
protected write so stale preflight authority cannot commit. Company Admin staff
management, last-usable-admin rules, desired-state no-op semantics, versioning,
atomic audit families, and blocker behavior remain unchanged.

Location Manager sensitive staff mutations reuse the existing TOTP,
`StaffAuthSession`, recovery, server-clock, and five-minute sensitive-assurance
mechanisms. MFA account eligibility may therefore include an active Location
Manager in an active Organization, but MFA eligibility does not grant Company
Admin authority or unrelated Management capabilities. Supervisor and Employee
MFA eligibility is not added by this extension. T05-B does not add onboarding,
invitations, activation links, Shift History, Force End Shift, or Force Start.

Source: Issue #240, the owner-approved execution plan U-02, and T05-B brief.

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
