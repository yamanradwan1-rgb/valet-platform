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

## Approved Issue #240 / T05-C onboarding backend — 2026-10-01

Owner-approved T05-C adds distinct `PENDING` User and membership lifecycle states.
New pending Users have null `password_hash`; ACTIVE/DISABLED Users retain required
verifiers. Pending memberships have required membership-owned names, a lower
direct role and 1–50 distinct Organization-owned initial Location grants. They
have no protected authority and are excluded from ordinary directory/detail and
role/status/grant commands, including ordinary `/activate`.

Sensitive CA onboarding allows LM/Supervisor/Employee; LM allows only
Supervisor/Employee with complete current active grant coverage. Existing ACTIVE
or PENDING Users are reused without password/status changes; global DISABLED and
same-Organization membership conflicts produce neutral onboarding-unavailable
responses. MFA and entitlement requirements remain the existing mechanisms.

Exact commands: `POST /v1/staff/management/organizations/:organizationId/staff`
and `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/invitations`.
Create takes strict operationId/names/email/role/locationIds; resend takes only
operationId. Invitations persist tenant-composite member/actor references,
generation, durable Organization-scoped operation identity, normalized request
digest, verifier hash, expiry and terminal timestamps. Plaintext never persists.
Fresh successful issuance returns a trusted-origin fragment activation link only
after commit. Same operation/digest returns `INVITE_PENDING_LINK_UNAVAILABLE`
without a link or new generation/audit; conflicting digest returns operation
conflict. Only explicit new resend rotates and revokes previous generations.

Issuance and one safe tenant audit event commit atomically through narrow runtime
SECURITY DEFINER entrypoints; direct table mutations and private helper execution
remain denied. No email/SMS transport. T05-D owns token proof/consumption,
existing-account ownership, first password, activation and onboarding UI.

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

## Approved T05-D activation and pending management reads

The owner Task 05-D contract is recorded in
`docs/validation/ISSUE_240D_STAFF_ACTIVATION_UI.md` (Accepted implementation map).
Public POST /v1/staff/auth/activate accepts only inviteToken/password. PENDING
accounts choose a password under current provisioning policy; ACTIVE accounts
prove their current password without hash/status/session changes; DISABLED is
denied. Activation consumes the current generation with member/account activation
and dedicated safe audit atomically, without issuing a Staff session. Narrow
migration 053 and runtime EXECUTE protect these writes. HMAC failure reservations
bound public attempts (credential 5, trusted address 30 per rolling 15 minutes).
Pending manager reads retain full LM coverage while ordinary mutations remain
quarantined. Create/resend use explicit MFA retry and ephemeral copy-link results.
The standalone EN/AR activation form immediately removes its fragment and keeps
secrets only in memory. T05-E/F/G and email/SMS delivery are outside T05-D.

## Approved T05-E management Shift history (2026-10-02)

The owner T05-E contract and execution map are recorded in
`docs/validation/ISSUE_240E_SHIFT_HISTORY.md`. Organization-scoped, bounded GET
`/v1/staff/management/organizations/:organizationId/shifts` and `/:shiftId`
read existing ACTIVE/ENDED rows. Current canonical membership names/User email,
currentRole and authoritative Location metadata are projected; these are current
identity values, not historical snapshots. No cash or custody/task projection.

Every request revalidates the current active actor account, exact Staff session,
membership, Organization and Dashboard entitlement. Company Admin uses ordinary
DEC-078 read assurance and sees its Organization history including inactive
Locations/targets. Location Manager sees only Shift rows at its CURRENT granted
ACTIVE Locations. Target lifecycle, role or complete target-management grant
coverage must not erase otherwise authorized history. Direct detail is concealed
outside that same Location authority. No LM history MFA policy is added here.

Exact membership/Location/status and started-in `[from,to)` instant predicates
run before LIMIT+1. Pages order by started_at DESC/id DESC; dedicated versioned
cursors bind Organization, actor authority/membership/grant scope and normalized
filter fingerprint for CA and LM. No frozen snapshot across HTTP requests.
`/shifts/employees` is a bounded searchable identity-only candidate read using
the same history Location authority, rather than the target-management directory.
Existing bounded Location discovery supplies filter metadata. Civil dates use
the selected Location timezone, or explicit UTC for all authorized Locations;
invalid/equal/reversed or unavailable midnight boundaries block browser reads.

The Dashboard retains the Staff visual language, renders a separate authoritative
detail read, and uses one local minute clock shared by visible rows/detail with
zero duration requests. Filter/page/refresh/scope/session generations fence stale
successes and failures. Refresh starts page one. No operational mutation,
business audit, history-copy persistence, Force End/Start or T05-F/G behavior.
