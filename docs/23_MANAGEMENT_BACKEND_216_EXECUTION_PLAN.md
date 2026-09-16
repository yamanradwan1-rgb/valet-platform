# Management Backend — Final Rebaseline and Execution Plan

Status: Binding execution plan with implementation progress through MGT-BE-05.
MGT-BE-06 has not started.

Rebaseline date: 2026-09-17

## 1. Exact baseline and provenance

| Item | Verified value |
| --- | --- |
| Repository | `valet-platform` |
| Updated local branch before work | `main` |
| Local `main` SHA | `6a9617690b60a7d11a9ea11c77b7e0d681507cf1` |
| `origin/main` SHA | `6a9617690b60a7d11a9ea11c77b7e0d681507cf1` |
| Match before branch creation | Yes; `HEAD == origin/main` |
| Working tree before fetch/pull | Clean |
| Update method | `git fetch origin`; `git switch main`; `git pull --ff-only origin main` |
| Current feature branch | `feat/mgt-be-05-company-settings-branding` |
| Current implementation migration count | 38 forward-only directories through MGT-BE-05 |
| Current implementation latest migration | `20260916003800_mgt_be_05_company_settings_branding` |

The earlier 39-packet plan did not merge to `main`. Its historical source is
remote commit `a40b328` on `origin/docs/VAL-009-management-216-plan`; it is
input to this reconciliation, not authority over current main. This document
creates the requested canonical path on the exact baseline above.

## 2. Authority and audit method

Repository authority was read in the order defined by `AGENTS.md`. The audit
covered all requested binding documents, the full relevant Accepted focused
DECs (including authentication/session, anti-abuse, staff provisioning,
roles/scope, key/shift/dispatch, tracking/privacy, financial policy,
Dashboard/configuration/analytics/reports/branding/subscription, returning
recognition, notifications/FCM, OCR, and the new incident recovery contract),
the current Prisma schema/migrations/runtime privilege tooling, current API
modules, shared contracts, and the completed Employee Native plan.

The 17 owner-confirmed Management decisions are now repository-native Accepted
DEC-078 through DEC-094. Their full files are authoritative and their canonical
summaries are in `docs/08_DECISIONS_LOG.md`. They amend prior contingent gaps;
no historical Accepted DEC file was silently rewritten.

## 3. Material changes since the old Management audit

The old plan used `ca82d6ea2fbd2c2cf35287b7d62d0a46b0fc8261` and 33 migrations.
The current repository state through the implemented MGT-BE-05 packet
materially adds or completes:

- migration 34 and `IncidentRecoveryIntent`, with actor/Organization/Location/
  ValetSession binding, `RESERVED -> RETIRED`, a 15-minute authoritative
  admission window, restricted runtime mutation, and DEC-077;
- production-shaped Employee Native incident process-death recovery APIs and
  contracts without a generic mutation journal or fabricated success;
- a reusable `StaffSessionContext` containing persisted Staff session ID,
  access verifier, creation time, and User ID; it still contains no MFA
  verification time, inactivity state, or assurance level;
- session-bound Staff Push registrations, intents, deliveries, direct FCM HTTP
  v1 worker/lease/retry/finalization, stale registration cleanup, and accepted
  policy values from DEC-073/075/076;
- logout composition that revokes a Staff session and disables its active push
  registrations atomically; refresh replay/invalidity revokes the session and
  send-time push eligibility remains the backstop;
- Employee/native production shell, lifecycle, telemetry, diagnostics,
  process-death fences, and current task/vehicle revalidation behavior;
- Jordan mobile normalization for current Check-In customer phone input
  (`+9627...`) while persisted Customer contact remains normalized visit data;
- the staff vehicle-directory `keySlotVisibility` capability, distinguishing
  `VISIBLE`, `RESTRICTED`, and `UNASSIGNED` without widening Employee access;
- extensive current tests and capacity tooling that can be reused as
  regression evidence but do not implement Management authority.
- merged MGT-BE-01 / migration 35 with truthful Organization-wide tenant audit,
  explicit actor provenance, and a separate append-only account-security store;
- implemented MGT-BE-02 / migration 36 with TOTP enrollment/recovery,
  exact-factor Staff-session assurance, bounded MFA anti-abuse, and controlled
  operator recovery;
- implemented MGT-BE-03 Company Admin control plane with exact-session MFA,
  bounded Organization/Location selectors, explicit selected Location versus
  `ALL_LOCATIONS` context, a typed capability snapshot, current-state
  revalidation, existing Location Dashboard/analytics/reports/export access,
  and current live-map read authority. It adds no migration or index and leaves
  raw route history and field operations denied.
- implemented MGT-BE-04 / migration 37 with shared
  `OrganizationMembership.version` CAS, bounded Staff directory/detail,
  role/status/Location-grant lifecycle, race-safe last-usable-admin protection,
  operational handover blockers, Organization-scoped membership deactivation,
  and a separate controlled global User security-disable path.
- implemented MGT-BE-05 / migration 38 with narrow Company Admin mutation/read
  surfaces for the ten existing typed defaults, typed EN/AR language,
  normalized informational operating hours, OCR-assist, Parking Spot required,
  employee Retrieval-requested and Guest vehicle-ready notification toggles,
  and Company/Location name-color branding. It adds no generic settings JSON,
  logo/assets, entitlement enforcement, geofence toggle, SLA target source, or
  KPI implementation. Representative field commands consume mutable policy at
  serialized authoritative boundaries and do not rewrite historical facts.

These changes remove no Management requirement. They add schema/migration
contention, session/push interactions for MFA and emergency disable, a new
append-oriented reliability record that staff lifecycle must not falsify, and
new shared-contract compatibility obligations.

## 4. Current implemented foundation

- Opaque password Staff Auth: 15-minute access, non-sliding 30-day session,
  rotating refresh, replay-family revocation, Web cookie and Native body
  transports, current User checks, durable login anti-abuse.
- `StaffPrincipal { userId }` plus the internal exact `StaffSessionContext` and
  server-side MFA assurance/activity state bound to the exact Staff session and
  active factor.
- Four membership roles, active/inactive membership, explicit Location grants,
  active Shift eligibility, Task/Dispatch ownership, and append-only custody.
- Existing Location Manager exact-Location Dashboard authorization remains
  available under its persisted grants. MGT-BE-03 adds MFA-backed `ORG_ADMIN`
  access to authorized existing Location Dashboard/analytics/reports/export and
  current live-map reads without requiring a Location grant.
- MGT-BE-03 exposes bounded, keyset-paginated Company Admin Organization and
  Location selectors plus explicit `LOCATION | ALL_LOCATIONS` context. The
  returned capability catalog is a client snapshot only; protected use
  revalidates current persisted authority.
- Eight bounded/paginated operational overview routes; four existing Location
  analytics families; manual DAILY/WEEKLY/MONTHLY Location reports and
  synchronous hardened CSV/PDF export.
- Ten typed Company-default/Location-override policies retain the existing
  Location Manager exact-grant override authority, and MGT-BE-05 now adds
  Company Admin Company-default plus allowed exact-Location Management mutation.
- MGT-BE-05 also implements typed EN/AR language, normalized informational
  operating hours, OCR-assist, Parking Spot required, and the two real
  notification enablement types with Company-default -> nullable Location
  override resolution.
- Company/Location display-name and primary-color Management is implemented;
  Company display name remains `Organization.name`. No logo or advanced
  white-label asset system exists.
- Read-only `OrganizationSubscription` with plan/status and three typed
  entitlements; no tenant mutation, billing engine, or enforcement.
- Customer/Vehicle/ValetSession history and narrow exact returning Check-In
  recognition; no Management Customers API and no CRM.
- Maps/tracking, Task/Vehicle-centric live map, ended-route history, finite raw
  GPS cleanup, keys, payments, incidents, external-notification persistence,
  and Staff Push/FCM foundations under their existing Accepted role matrices.
- DEC-079/MGT-BE-01 audit foundation is merged: Location audit remains
  compatible, Organization-wide events use null Location truthfully, and
  account-security history is separate. There is still no Management audit
  query API.
- DEC-078/MGT-BE-02 is implemented: TOTP/recovery persistence, verification,
  re-enrollment, recovery-code reissue, exact-session assurance, soft step-up,
  MFA anti-abuse, and controlled no-code recovery are present.
- DEC-080/MGT-BE-03 is implemented without schema changes: Company Admin
  Management context/selection and the reusable capability guard are present;
  raw route history and field-operation authority are excluded.
- DEC-081/MGT-BE-04 is implemented: bounded Staff directory/detail and the
  role/status/Location-grant lifecycle are present with shared membership CAS,
  last-usable-admin and operational handover safeguards. Membership
  deactivation is Organization-scoped; global User `DISABLED` remains a
  separate controlled VAYLET security action. Company Admin still does not gain
  field-operation superuser authority.

## 5. Current real gaps

1. No safe Audit Explorer.
2. No Location create/readiness/intake-stop/drain/deactivate API; persistence
   still defaults new rows to `ACTIVE`.
3. No Management visit-contact search/history/correction surface.
4. No Guest rating persistence or write.
5. No SLA Compliance, Cars per Active Employee, Cars Handed Off by Employee,
    or controlled Key Exceptions metrics.
6. No All Locations analytics or company CSV/PDF reports. The implemented
   `ALL_LOCATIONS` selector/context is foundation only.
7. No truthful Integration status API, Management-only entitlement
    enforcement, company commercial view, or Guest effective branding.
8. No historically truthful SLA-target source yet. BE-05 deliberately does not
   add a current scalar target that BE-10 could retroactively apply to old visits.

## 6. Formal decision mapping

| Management direction | Repository DEC | Primary active task |
| --- | --- | --- |
| Company Admin MFA | DEC-078 | MGT-BE-02 |
| Three audit scopes | DEC-079 | MGT-BE-01 |
| Company Admin authority | DEC-080 | MGT-BE-03 |
| Staff/role/access lifecycle | DEC-081 | MGT-BE-04 |
| Audit visibility | DEC-082 | MGT-BE-06 |
| Settings catalog | DEC-083 | MGT-BE-05 |
| Customers as visit contacts | DEC-084 | MGT-BE-08 |
| Basic effective branding | DEC-085 | MGT-BE-05 / MGT-BE-12 |
| Logo deferred | DEC-086 | Deferred |
| Read-only integrations | DEC-087 | MGT-BE-12 |
| Entitlement safety | DEC-088 | MGT-BE-12 |
| Read-only billing | DEC-089 | MGT-BE-12 |
| KPI definitions | DEC-090 | MGT-BE-10 |
| Rating / Returning Contact | DEC-091 | MGT-BE-08 / 09 / 10 |
| All Locations analytics | DEC-092 | MGT-BE-11 |
| Automatic reports deferred | DEC-093 | Deferred |
| Location lifecycle | DEC-094 | MGT-BE-07 |

## 7. Execution model and dependency graph

The 12 IDs below are the only active core Management Backend backlog. They are
delivery packets, not permission to create 12 god services or one branch per
entire packet. Each packet is implemented as small controller, policy,
application command/query, persistence, projection, and focused test modules;
high-risk schema/auth slices may use independently reviewed child PRs while
retaining the same core task ID.

```text
MGT-BE-01 Audit Foundation
  -> MGT-BE-02 Complete MFA
      -> MGT-BE-03 Company Admin Control Plane
          -> MGT-BE-04 Staff, Roles & Access
          -> MGT-BE-05 Company Settings & Branding
          -> MGT-BE-06 Management Audit Log
          -> MGT-BE-07 Location Management
          -> MGT-BE-08 Customers / Guests
          -> MGT-BE-12 Integrations & Commercial Access

MGT-BE-01 -> MGT-BE-09 Guest Rating
MGT-BE-05 -> MGT-BE-10 KPI & Analytics Package
MGT-BE-03 + MGT-BE-10 -> MGT-BE-11 All Locations + Company Reports
MGT-BE-11 -> final report-export entitlement composition in MGT-BE-12
```

One active migration owner is mandatory. Every branch starts from current main
and rechecks newly merged Android/auth/contracts changes before shared edits.

## 8. Active implementation packets

### MGT-BE-01 — Audit Foundation

Objective: implement DEC-079 Organization audit, existing Location compatibility,
and separate account-security audit with safe actor provenance and append-only
guarantees.

Implementation status: merged. Migration
`20260916003500_mgt_be_01_audit_foundation`
preserves existing Location history/writers, adds Organization-wide null-Location
tenant audit, explicit new-row actor provenance and a separate account-security
append boundary.

- Dependencies: none beyond current main and DEC-079.
- Schema: migration 35 preserves all existing Location rows/writers while adding
  explicit scope-safe relationships without dummy Location/provenance facts.
- Auth/audit: security audit is outside tenant Audit Log; mutations and their
  correct audit record commit atomically.
- Concurrency/idempotency: stable event identity where retryable; duplicate
  command retries cannot duplicate success history; runtime/PUBLIC cannot
  update/delete/truncate append-only records.
- Performance: add Organization/location/time/id query indexes only from
  planned access paths and `EXPLAIN` evidence.
- Proof: migration upgrade/fresh paths, FK/tenant constraints, provenance,
  redaction, rollback, runtime privilege bypass, and compatibility regression
  for every existing audit writer.

### MGT-BE-02 — Complete MFA

Objective: implement DEC-078 enrollment, TOTP, ten recovery codes, verification,
VAYLET-mediated recovery, re-enrollment, assurance windows, soft step-up,
abuse/replay protection, and exact session interaction.

Implementation status: implemented as migration
`20260916003600_mgt_be_02_complete_mfa` plus Staff Auth MFA contracts/services,
routes, runtime privileges, and controlled operator recovery. Historical scope
note: MGT-BE-03 was not part of the MGT-BE-02 implementation; it is now
implemented separately below.

- Dependencies: MGT-BE-01.
- Schema: `user_mfa_totp_factors` with `PENDING`/`ACTIVE`/`RETIRED`,
  `mfa_recovery_codes`, and StaffAuthSession `mfa_authenticated_at`,
  `mfa_factor_id`, `last_admin_activity_at`. Assurance requires the exact factor
  to remain active; replacement/retirement invalidates old assurance.
- Auth: reuse StaffAuthSession and StaffSessionContext; preserve Web/Native
  transport, refresh rotation, non-sliding absolute expiry, replay-family
  revocation, logout/push disable, and current User checks. Refresh never renews
  assurance.
- Crypto: TOTP SHA-1/6 digits/30 seconds/±1, issuer `VAYLET`, 20-byte secret; `mte1`
  AES-256-GCM protection using `MFA_TOTP_ENCRYPTION_KEY_B64URL`; exactly ten
  `vmr1` recovery codes per set (8-byte selector + 20-byte secret) with `mrv1`
  HMAC-SHA-256 verifiers using `MFA_RECOVERY_HMAC_SECRET_B64URL`. Both keys are
  independent canonical 43-character base64url encodings of 32 random bytes.
- API: `/v1/staff/auth/mfa/state`, `/enrollment/begin`, `/enrollment/confirm`,
  `/step-up`, `/recovery/begin`, and `/recovery-codes/reissue` under the common
  MFA prefix.
- Assurance: eight-hour max expires at `>=`; 30-minute inactivity expires at
  `>=`; sensitive freshness expires at `> 5 minutes`. Expiry is soft step-up.
- Abuse: `v1:mfa-totp-user` and `v1:mfa-recovery-user`, five failure-capable
  attempts per User in the immediately preceding 15 minutes.
- Audit catalog: `MFA_TOTP_ACTIVATED`, `MFA_RECOVERY_CODE_USED`,
  `MFA_FACTOR_REENROLLMENT_STARTED`, `MFA_RECOVERY_CODES_REISSUED`,
  `MFA_OPERATOR_RECOVERY`, all in the separate account-security boundary.
- Controlled recovery: `pnpm --filter @valet/api staff:mfa-recover -- --operation recover-totp --operation-id <uuid> --user-id <uuid> --operator-ref <ref>`
  uses `MIGRATION_DATABASE_URL`; ordinary runtime cannot manufacture controlled
  operator provenance.
- Concurrency/idempotency: enrollment verification, recovery-code consumption,
  factor replacement, concurrent step-up, refresh/replay/logout/disable races,
  and lost response are atomic and single-use.
- Performance/security: bounded factor lookup and abuse state; constant-time
  verifier handling; no secrets in logs, audit, telemetry, URLs, or fixtures.
- Proof: fake-clock 8h/30m/5m matrices, code exhaustion/replay, recovery paths,
  Web/native regressions, session revocation, and runtime privileges.
- Deployment order: provision both MFA keys before server start; run
  `pnpm --filter @valet/database migrate:deploy`; run
  `pnpm --filter @valet/database runtime:provision` (including privilege
  verification); deploy; smoke login, enrollment, step-up, recovery-code and
  operator-recovery flows. No zero-downtime guarantee is asserted.

### MGT-BE-03 — Company Admin Control Plane

Objective: implement DEC-080 MFA-backed `ORG_ADMIN` Management authorization,
Organization selection/context, bounded Location enumeration, selected Location,
All Locations foundation, and a capability matrix.

Implementation status: implemented on the existing 36-migration schema. No
migration or index was added for MGT-BE-03.

- Dependencies: MGT-BE-01 and MGT-BE-02.
- Schema: no domain fields, migration, or new index. Context/capabilities are
  projections over existing persisted authority.
- Context/API: bounded keyset Organization and Location selectors use `limit`
  1–100 (default 50), tenant-bound cursors, an explicitly selected Organization,
  and either a selected Organization-owned Location or `ALL_LOCATIONS` with no
  selected Location. Active and inactive Locations may appear in Management
  selection/context; downstream capabilities enforce their own active-target
  requirements.
- Auth: server derives current User, exact Staff session assurance, active
  `ORG_ADMIN` membership and active Organization. The capability catalog is a
  typed snapshot, never authority; every protected use revalidates persisted
  role/status/assurance/target ownership and capability-specific conditions.
- Capability snapshot: the implemented catalog is exactly
  `COMPANY_DASHBOARD_READ`, `LOCATION_DASHBOARD_READ`, `ANALYTICS_READ`,
  `REPORTS_READ`, `REPORT_EXPORT`, `LIVE_MAP_READ`, `STAFF_MANAGE_ELIGIBLE`,
  `COMPANY_SETTINGS_MANAGE_ELIGIBLE`, `LOCATION_SETTINGS_MANAGE_ELIGIBLE`,
  `BRANDING_MANAGE_ELIGIBLE`, `LOCATION_LIFECYCLE_MANAGE_ELIGIBLE`,
  `TENANT_AUDIT_READ_ELIGIBLE`, and `ALL_LOCATIONS_SCOPE_SELECT`. The
  `*_ELIGIBLE` entries expose control-plane eligibility for later owning tasks;
  they do not assert that those mutation/query surfaces are implemented.
- Compatibility: existing Location Manager Dashboard authorization remains
  intact. Company Admin gains the authorized existing Location Dashboard,
  analytics, reports/export and current live-map read paths without a Location
  grant.
- Boundary: `ALL_LOCATIONS` is selection/context foundation only. MGT-BE-03 does
  not implement All Locations analytics, company report aggregation, or
  entitlement enforcement. Company Admin still cannot use raw route history,
  map-setup mutation, check-in, parking, Dispatch, Retrieval/handoff, key, GPS
  field writes, or other operational custody commands.
- Concurrency/activity: successful Management use records admin activity without
  sliding `mfa_authenticated_at`; stale/inactive/revoked authority is rejected by
  current-state revalidation and MFA expiry is soft step-up.
- Proof: role × status × tenant × Location × assurance matrix, exact-session
  isolation, multi-membership selection, cursor tamper/crossover denial,
  current-state staleness, existing Location Manager compatibility, live-map
  allow/raw-route deny, and field-operation denial regression.

### MGT-BE-04 — Staff, Roles & Access

Objective: implement DEC-081 membership directory, role changes, Location
grant/revoke, activation/deactivation, last-admin protection, emergency disable,
and operational-responsibility safeguards.

Implementation status: implemented as migration
`20260916003700_mgt_be_04_staff_roles_access` plus bounded Staff management
contracts/API, controlled global security-disable tooling, shared concurrency
boundaries, tenant/account-security audit integration, and focused race/runtime
privilege coverage. MGT-BE-05 is implemented in the next packet below.

- Dependencies: MGT-BE-01 through MGT-BE-03.
- Schema: migration 37 adds shared positive monotonic
  `OrganizationMembership.version` CAS and narrow migration-owner
  `SECURITY DEFINER` role/status/Location-grant command functions plus private
  helpers. Four base roles remain unchanged; no generic permission model or new
  mutable key-custody owner was introduced.
- Directory/privacy: Organization staff list is keyset-paginated and bounded;
  its final query is page-first, selecting the tenant membership page by
  `(created_at, id)` before User hydration and Location-grant counting. Detail
  returns at most 100 Location grants plus total/truncated state. Public
  projection is membership ID, email, role, status, version and bounded grant
  data only; foreign membership and other-Organization state remain concealed.
- Mutation semantics: role/status/grant requests use one shared CAS,
  fail closed on nullable DB-boundary CAS/mode input, and converge desired-state
  no-ops without duplicate version/audit. `ORG_ADMIN` demotion requires dormant
  Location-grant reconciliation.
- Auth/audit: sensitive mutation uses five-minute exact-session MFA freshness;
  changed tenant mutations append one atomic Organization audit event and no-op
  retries append none. Controlled global User disable writes account-security
  audit only and never fabricates tenant lifecycle/operational completion.
- Last-admin/concurrency: usable admin means active Organization + active
  `ORG_ADMIN` membership + active User + `ACTIVE` TOTP factor; live session is
  not required. Staff-management transactions serialize per Organization on
  `staff-management-org` before actor/last-admin recheck.
- Handover: access reduction blocks active Shift, assigned/accepted/in-progress
  Task, unfinished intake responsibility, and unexpired `RESERVED`
  IncidentRecoveryIntent in the affected scope. Task assignment is canonical
  current key/custody responsibility; `KeyCustodyEvent` remains history.
- Disable scope: membership `INACTIVE` is Organization-scoped and leaves other
  memberships intact. Controlled User `DISABLED` revokes all of that User's
  Staff sessions and active push registrations while preserving memberships and
  operational truth. Disable/login/refresh/push registration serialize on the
  per-User `staff-user-security` advisory boundary.
- Runtime/deploy: ordinary runtime cannot directly mutate User status,
  membership authority/version, or grant identity and can execute only the
  three reviewed staff-management command functions; helpers/PUBLIC stay
  denied. Apply migration 37, rerun runtime-role provisioning/verification,
  then deploy/smoke the updated API.
- Performance proof: migration 37 keeps only the three justified indexes used by
  the final access paths: `organization_memberships_org_created_id_idx` on
  `(organization_id, created_at, id)`,
  `valet_sessions_checked_in_state_location_idx` on
  `(checked_in_by_membership_id, state, location_id)`, and
  `incident_recovery_intents_member_state_expiry_location_idx` on
  `(reporting_membership_id, state, expires_at, location_id)`.

### MGT-BE-05 — Company Settings & Branding

Objective: expose existing typed defaults plus DEC-083/085 language, operating
hours, OCR toggle, parking Spot requirement, per-notification-type toggles,
SLA target integration, optional justified geofence alert, and name/color
inheritance/overrides.

Implementation status: implemented in migration 38 and the Management API.
The completed catalog is the ten existing typed defaults plus `languageDefault`,
`operatingHours`, `ocrAssistEnabled`, `parkingSpotRequired`,
`employeeRetrievalRequestedNotificationEnabled`, and
`guestVehicleReadyNotificationEnabled`. Geofence alert is not implemented
because there is no current justified configurable alert consumer. SLA target
persistence is not implemented because MGT-BE-10 must define historically
truthful applicability before a source can be added.

- Dependencies: MGT-BE-01 and MGT-BE-03; SLA setting waits for the MGT-BE-10
  source contract. Coordinate any field-command policy consumers.
- Schema: typed columns/tables only; existing ten pairs and branding reused.
  No generic JSON/rules/templates. Historical SLA applicability must be
  representable without applying today's target retroactively.
- Auth/audit: Company Admin reads use STANDARD Management assurance and writes
  use SENSITIVE/five-minute freshness. Existing Location Manager exact-Location
  authority for the original ten configuration settings/branding is preserved
  separately and receives no Company Admin MFA. Company/Location Management
  writes use narrow database authority, CAS, truthful no-op convergence, and one
  atomic typed audit event per real change.
- Concurrency/idempotency: policy changes race safely with active operations;
  operating hours are informational; OCR/manual fallback and provider/cost
  gates remain; existing financial/custody history is immutable.
- Performance: one bounded effective-configuration projection, not per-setting
  query loops.
- Proof: inheritance including false-vs-null, timezone/DST hours, EN/AR,
  notification type allowlist, OCR production-unavailable behavior, parking
  command policy races, and unchanged existing policy semantics.
- Branding: Company display name is authoritative `Organization.name`; Company
  and Location primary color is canonical uppercase `#RRGGBB`; Location CLEAR
  inherits the current Company value. Logos/assets remain deferred by DEC-086.
- Runtime/deploy order: (1) deploy/provision the compatible migration artifact,
  (2) apply migration 38, (3) run `runtime:provision` and privilege verification,
  (4) deploy the API, (5) smoke the existing Location Manager configuration
  path, (6) smoke Company Admin Company settings, (7) smoke Company Admin exact-
  Location overrides, (8) smoke Company/Location branding, and (9) verify the
  operational consumers. No zero-downtime claim is asserted.

### MGT-BE-06 — Management Audit Log

Objective: implement DEC-082 safe Organization/Location audit query APIs with
pagination, filtering, and role-specific visibility.

- Dependencies: MGT-BE-01 and MGT-BE-03.
- Schema: normally query indexes only after `EXPLAIN`; no audit mutation API.
- Auth/privacy: Company Admin Organization-wide; Location Manager granted
  Locations; Supervisor necessary operational projection; Employee/Guest none;
  security audit and raw route data excluded.
- Concurrency: cursor binds filters/scope and handles equal timestamps plus
  concurrent appends deterministically.
- Performance: keyset pagination, bounded page/filter values, allowlisted joins,
  no metadata N+1.
- Proof: every event family safe projection, unknown-event fallback, cursor
  tampering, cross-tenant/location denial, prohibited-field snapshots, and
  query-plan inspection.

### MGT-BE-07 — Location Management

Objective: implement DEC-094 create-inactive, readiness, activate, stop intake,
safe drain, deactivate, historical access, and currency/timezone correction
rules.

- Dependencies: MGT-BE-01, MGT-BE-03, and operational precondition interfaces
  from MGT-BE-04.
- Schema: current `ACTIVE|INACTIVE` and default `ACTIVE` cannot by themselves
  express accepting versus draining. Select the smallest typed representation
  that preserves the full lifecycle; use a forward migration, never rewrite.
- Auth/audit: five-minute MFA freshness, same-company server authority, stable
  create identity, atomic lifecycle audit, no hard delete.
- Concurrency/idempotency: code uniqueness, create retries, activation/readiness
  races, stop-intake versus Check-In, drain versus new Task/Shift/custody work,
  and final deactivation recheck under locks.
- Performance: bounded readiness/drain summaries using indexed existence checks,
  not loading all historical work.
- Proof: INACTIVE creation, explicit currency/timezone, incomplete readiness,
  intake fencing, safe drain, active-work denial, historical reads, and
  prospective currency/timezone correction behavior.

### MGT-BE-08 — Customers / Guests

Objective: implement DEC-084 visit-contact search by phone/plate/name, visit
history, bounded projections, controlled corrections, and DEC-091 Returning
Contact calculation.

- Dependencies: MGT-BE-01 and MGT-BE-03; correction authorization uses
  MGT-BE-04 capability policy.
- Schema: reads should reuse Customer/Vehicle/ValetSession; add no CRM or
  ownership table. Correction history may require only audit unless a concrete
  immutable fact is missing.
- Auth/privacy: search only within authorized visits/Locations/Organization;
  phone projection is role-safe; no Employee directory or Guest token access.
- Concurrency/idempotency: corrections use CAS and preserve historical visit
  links; no automatic merge; exact phone ambiguity remains explicit.
- Performance: normalized exact phone/plate lookup, bounded name search, keyset
  pagination, aggregate visit counts without N+1, indexes only with evidence.
- Proof: cross-tenant/location isolation, ambiguous/shared contact, vehicle
  association wording, Jordan current input compatibility, correction rollback,
  and absence of CRM fields.

### MGT-BE-09 — Guest Rating

Objective: implement DEC-091 guest-only 1–5 rating, once per completed visit,
idempotency, and an authoritative analytics source.

- Dependencies: MGT-BE-01 and existing Guest Access/completion authority.
- Schema: dedicated minimal rating relation or equivalent explicit constrained
  source; unique visit rating and restrictive tenant/session relationship.
- Auth/audit: exact Guest bearer/session only; completed visit required; staff
  cannot write/change/delete. Do not expose raw bearer or contact.
- Concurrency/idempotency: same-value lost-response retry converges; competing
  different values have one winner and safe conflict; no overwrite.
- Performance: direct unique lookup and period/location index only if analytics
  query evidence requires it.
- Proof: invalid range/state/token, concurrent submissions, post-completion,
  staff denial, cross-session isolation, analytics cohort, and append-only
  runtime privileges.

### MGT-BE-10 — KPI & Analytics Package

Objective: implement DEC-090 SLA target/Compliance, Cars per Active Employee,
Cars Handed Off by Employee, and controlled Key Exceptions while preserving all
DEC-060 metrics.

- Dependencies: MGT-BE-05 SLA target source and required authoritative sources;
  Guest Rating may be added only after MGT-BE-09.
- Schema: likely SLA history/snapshot and a controlled Key Exception source;
  do not infer from ordinary custody. Confirm an evidence-backed “actually
  worked” cohort before coding.
- Auth: existing Location Manager plus MFA Company Admin through MGT-BE-03;
  server-derived Location periods.
- Correctness: explicit numerator/denominator/coverage; no hard-coded five
  minutes; handoffs use persisted completion actor; not payroll/scoring.
- Performance: set-based bounded period queries, no N+1, exact decimals,
  query-plan/capacity inspection, justified indexes only.
- Proof: timezone/DST boundaries, missing targets/source, zero denominator,
  role changes, multi-task employees, normal key movements excluded, and
  concurrent completion visibility.

### MGT-BE-11 — All Locations + Company Reports

Objective: implement DEC-092 company summary/multi-Location analytics, weighted
calculations, currency grouping, missing-data coverage, and manual CSV/PDF
company reports with final export authorization/audit.

- Dependencies: MGT-BE-01, MGT-BE-03, and MGT-BE-10; MGT-BE-06 provides the
  Management audit read projection but is not required to write export audit.
- Schema: source reuse expected; indexes/materialization only after measured
  evidence and a focused decision. No warehouse or cache by default.
- Auth/audit: MFA Company Admin, current entitlement at final generation,
  Organization scope; one generation audit only after successful bounded output.
- Correctness: recompute from source, sum numerators/denominators, never average
  averages, preserve each Location timezone, separate currencies, and expose
  missing coverage.
- Performance: bounded Location/period fan-in, set-based queries, no per-Location
  N+1, row/artifact limits, memory limits, CSV injection hardening, PDF reuse.
- Concurrency/idempotency: final reauthorization before bytes/audit; repeated
  manual export is intentionally a new generation event; source snapshot
  semantics documented.
- Proof: mixed timezone/currency/missing data, weighted ratios, large-company
  query plans, cross-tenant denial, 5 MiB/row caps or accepted company bounds,
  deterministic CSV/PDF, and no automatic delivery.

### MGT-BE-12 — Integrations & Commercial Access

Objective: implement DEC-087/088/089 read-only Integrations, plan/status/
features, VAYLET-owned entitlements, Management-only enforcement, and the
DEC-085 guest-safe effective branding projection if still missing.

- Dependencies: MGT-BE-03; report-export enforcement after MGT-BE-11; effective
  branding consumes MGT-BE-05.
- Schema: reuse OrganizationSubscription and branding. Integration status comes
  from real adapter/config health, not a tenant secrets table. New entitlement
  fields require a focused product need, never generic JSON.
- Auth/security: tenant users have no commercial/provider mutation; status
  redacts endpoints, project IDs, credentials, tokens, and provider errors.
- Safety: Dashboard/Management lapse may restrict Management only. It must not
  enter Check-In, Parking, Retrieval, Handoff, release, custody completion,
  incident safety, or necessary Guest completion paths.
- Concurrency: current entitlement rechecked at protected Management use/export;
  stale frontend state is not authority. Provider status is truthful and may be
  unknown/unavailable rather than fabricated healthy.
- Performance: bounded typed status reads; avoid live provider calls on every
  page load unless a separately bounded health cache/adapter contract exists.
- Proof: entitlement-lapse field-operation regression matrix, plan-code
  non-authority, no tenant mutations, real/absent integration truth, secret
  redaction, and Guest branding derived from the persisted visit Location.

## 9. Old 39-packet disposition

Nothing from the historical plan disappears silently.

| Old packet | Disposition | New owner / reason |
| --- | --- | --- |
| MGT-BE-001 Non-Location audit foundation | Merged | MGT-BE-01 |
| MGT-BE-002 MFA enrollment/challenge | Merged | MGT-BE-02 |
| MGT-BE-003 MFA recovery/session assurance | Merged | MGT-BE-02 |
| MGT-BE-004 MFA ORG_ADMIN authorization | Merged | MGT-BE-03 |
| MGT-BE-005 Company context/Location enumeration | Merged | MGT-BE-03 |
| MGT-BE-006 Company defaults for existing policies | Merged | MGT-BE-05 |
| MGT-BE-007 Staff membership directory | Merged | MGT-BE-04 |
| MGT-BE-008 Membership role changes | Merged | MGT-BE-04 |
| MGT-BE-009 Location grant/revoke | Merged | MGT-BE-04 |
| MGT-BE-010 Membership activation/deactivation | Merged | MGT-BE-04 |
| MGT-BE-011 Management Audit Log | Merged | MGT-BE-06; expanded by DEC-082 |
| MGT-BE-012 Company name/color defaults | Merged | MGT-BE-05 |
| MGT-BE-013 Operating hours | Merged | MGT-BE-05; informational first |
| MGT-BE-014 Language defaults | Merged | MGT-BE-05 |
| MGT-BE-015 OCR assistance policy | Merged | MGT-BE-05; provider/cost gates remain |
| MGT-BE-016 Key-system policy | Retired | DEC-083: one valid mode does not justify a policy |
| MGT-BE-017 Parking Spot requirement | Merged | MGT-BE-05 |
| MGT-BE-018 Geofence alert enablement | Merged, optional | MGT-BE-05 only if justified |
| MGT-BE-019 Notification template policy | Superseded | MGT-BE-05 per-type toggles; no editor |
| MGT-BE-020 SLA target policy | Merged | MGT-BE-05 + MGT-BE-10 |
| MGT-BE-021 SLA Compliance | Merged | MGT-BE-10 |
| MGT-BE-022 Cars per Employee | Superseded | MGT-BE-10 exact Cars per Active Employee plus separate handoffs |
| MGT-BE-023 Key Exceptions | Merged | MGT-BE-10; controlled genuine exceptions only |
| MGT-BE-024 Customer/Guest reads | Merged | MGT-BE-08 |
| MGT-BE-025 Guest rating | Merged | MGT-BE-09 |
| MGT-BE-026 Repeat Guest | Superseded | MGT-BE-08/10 uses Returning Contact |
| MGT-BE-027 Company operational summary | Merged | MGT-BE-11 |
| MGT-BE-028 Multi-Location analytics | Merged | MGT-BE-11 |
| MGT-BE-029 Company reports/exports | Merged | MGT-BE-11 |
| MGT-BE-030 Integration visibility | Merged | MGT-BE-12, read-only truthful status |
| MGT-BE-031 Entitlement administration | Superseded | MGT-BE-12; only VAYLET controls entitlements |
| MGT-BE-032 Entitlement enforcement | Merged | MGT-BE-12; Management-only |
| MGT-BE-033 Internal billing control | Superseded | MGT-BE-12 read-only plan/status/features; engine retired |
| MGT-BE-034 Logo | Deferred | DEC-086; verified asset boundary required |
| MGT-BE-035 Guest-safe name/color | Merged | MGT-BE-12 effective Location branding |
| MGT-BE-036 Automatic report delivery | Deferred | DEC-093; manual CSV/PDF first |
| MGT-BE-037 Location lifecycle | Merged | MGT-BE-07 |
| MGT-BE-038 Additional validation policy | Retired | DEC-083; existing typed validation enablement/commands suffice |
| MGT-BE-039 Location allowed-role policy | Retired | DEC-083/081; base roles plus grants suffice |

Count check: 39 historical IDs, 39 explicit dispositions, 12 active core tasks.

## 10. Deferred, retired, and prohibited current work

Deferred: logo, automatic report delivery, advanced white-label, scheduled
email/authenticated-link delivery design, and any future verified asset system.

Retired or not current: SaaS billing engine/Stripe/invoices/cards/renewals/
coupons/self-upgrade portal; Key Policy; generic validation-policy engine;
Location allowed-role policy; generic notification-template editor; generic
Rules Builder/settings JSON; POS/PMS/SSO; CRM campaigns/tags/segments/loyalty/
marketing notes. Geofence alert configuration is optional, not a launch claim.

No task may start provider-secret self-service, custom domains/fonts/CSS,
automatic report attachments, currency conversion, customer ownership claims,
or raw route access for Company Admin without a new Accepted decision.
Management/Dashboard entitlement lapse must never block field operation or safe
custody completion.

## 11. Cross-cutting implementation requirements

Every active task must preserve:

- server-side authentication/authorization from current persisted authority;
- strict tenant and Location isolation and non-disclosing failures;
- bounded inputs, queries, pages, periods, groups, exports, and retries;
- keyset pagination where lists can grow and deterministic tie ordering;
- set-based data access with no N+1 query patterns;
- indexes only when justified by access paths and query inspection;
- database constraints for row-local/tenant/uniqueness invariants;
- transactions and consistent lock ordering for protected mutations;
- optimistic concurrency and stable operation IDs/idempotency where retryable;
- safe lost-response/replay behavior and finite retries with jitter where I/O
  is involved;
- atomic required audit with mutation and no success audit on rollback;
- safe metadata/projection allowlists and no trust in frontend claims;
- current authority recheck at final mutation/export boundaries;
- DEC-030/`docs/17_AGENT_CODE_STRUCTURE_RULES.md` small-module boundaries;
- representative query-plan/performance/capacity tests where warranted.

The reduction from 39 packets to 12 reduces workflow and branch overhead only.
It does not reduce test, security, concurrency, audit, performance, database, or
architecture quality.

## 12. Required validation per implementation task

Use focused unit tests for policies/formulas; HTTP contract and authorization
tests; real PostgreSQL constraint, concurrency, migration, and runtime-role
tests; redaction/privacy snapshots; query-plan inspection at representative
cardinality; and existing Web/Native/Guest/field-operation regressions for any
shared boundary.

Normal repository gates remain `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and `pnpm architecture:check`, plus Prisma validation/migration
diff/fresh-upgrade/runtime privilege gates for database work. Provider/device
claims require their separate real-environment evidence; adapter tests alone do
not certify deployment.

## 13. Decision conflicts and implementation blockers

No unresolved product contradiction remains after DEC-078 through DEC-094.
They explicitly amend prior MFA-contingent `ORG_ADMIN` denials and replace stale
planning names/scope without rewriting historical DECs.

Known implementation gaps, not contradictions:

- current Location database default is ACTIVE while DEC-094 requires
  Management-created Locations to start INACTIVE;
- DEC-074 keeps real OCR provider calls fail-closed unavailable in production
  until a shared durable OCR cost guard exists; an OCR tenant toggle cannot
  bypass that gate;
- existing Task/current-assignee data does not by itself prove the complete
  historical “actually worked” cohort, and ordinary KeyCustodyEvent rows are
  not Key Exceptions;
- SLA historical applicability, genuine Key Exception source, and Location
  intake-stop/drain persistence require careful schema design in their owning
  tasks before migration;
- Employee Check-In currently accepts Jordan mobile numbers only, so broader
  international Management phone normalization cannot be assumed.
- historical docs-rebaseline evidence: at that baseline SHA, the repository
  architecture gate failed for four oversized test files. The failure was also
  reproduced in a detached clean worktree; this statement is retained as
  provenance and does not assert the status of the current BE-04 working tree.
- historical docs-rebaseline evidence: at that same baseline, lint failed at
  `apps/valet-native/test/app-config.test.mjs` because `URL` was not defined in
  the lint environment, and the isolated Employee Web suite had three failing
  authorization-loss assertions for 403/404 responses. This statement likewise
  does not assert current BE-04 validation status.

The notes below and the two validation bullets above record the state of the
earlier documentation/rebaseline branch and are historical baseline evidence;
they do not override the current working tree or an explicit production task
authorization. At that historical point, MGT-BE-01 was merged, MGT-BE-02 was
implemented, and MGT-BE-03 had not started. Current status is recorded above:
MGT-BE-03, MGT-BE-04, and MGT-BE-05 are implemented; MGT-BE-06 has not started.

## 14. Documentation rebaseline validation record

Passed on this branch:

- Prettier check for every changed/new Markdown file;
- internal referenced-file existence, DEC-078–094 uniqueness/structure, exactly
  12 active task headings, and exactly one disposition for each old 001–039;
- `git diff --check`;
- `pnpm typecheck` (11/11 packages);
- `pnpm turbo run build --env-mode=loose` with the required non-secret
  `API_ORIGIN` supplied (10/10 build tasks); and
- documentation-only path inspection: no production source, Prisma schema,
  migration, Android, manifest, lockfile, or runtime dependency changes.

Known baseline failures, reproduced without production changes:

- `pnpm lint`: one `no-undef` error for `URL` in the native app-config test;
- `pnpm test`: the isolated `@valet/valet` package has 3 failed and 622 passed
  tests in the two Employee API-client test files described above; and
- `node scripts/architecture-check.mjs`: pre-existing size violations in
  `apps/api/test/intake-session-command.integration.test.ts`,
  `apps/valet-native/test/native-plate-camera-step.test.ts`,
  `apps/valet-native/test/native-tasks-panel.test.tsx`, and
  `apps/valet-native/test/native-vehicles-parity.test.tsx`, reproduced at the
  exact clean baseline SHA.

The ordinary build command also requires production `API_ORIGIN`; without that
required configuration it fails closed as designed. No validation failure was
worked around by changing product code in this documentation task.
