# Management Backend — Final Rebaseline and Execution Plan

Status: Binding execution plan with Management Backend MGT-BE-01 through
MGT-BE-12 complete. MGT-BE-12 is **MERGED** at
`df6158e8a417996bdaa67994ffe90724645e9e40`. INFRA-TEST-01A, 01B and 01C are
**MERGED** through `main@f6d30b967c71bc7c3b9aaa0c0eba8ccaece7aa88`.
MGT-FIX-01 and MGT-FIX-02 are implemented and independently reviewed. The
`fix/mgt-management-final-integration` branch contains both reviewed repairs
and remains pending final integration review/merge; neither repair is represented
here as merged to `main` or deployed.

Rebaseline date: 2026-09-18

## 1. Exact baseline and provenance

| Item | Current verified value |
| --- | --- |
| Repository | `valet-platform` |
| BE-10 implementation commit | `2a178e977f88c576cfdc0c2c8363afae89f0ea5c` |
| Current merged `main` SHA | `f6d30b967c71bc7c3b9aaa0c0eba8ccaece7aa88` |
| BE-12 merged implementation | `df6158e8a417996bdaa67994ffe90724645e9e40` |
| INFRA-TEST-01A merged implementation | `d7a2e309a06d749edbaf1f16a06111da59e9225e` + `fe5406ff60f30d7f482ae57b416dcdf4b62f1146` |
| INFRA-TEST-01B merged implementation | `0f9b4b4478c1686a7cbce77013bf6c2b7aab206d` |
| INFRA-TEST-01C | Merged through `main@f6d30b967c71bc7c3b9aaa0c0eba8ccaece7aa88` |
| MGT-FIX-01 reviewed implementation | `48ec582245fb64bf80623ecaace5dd3eed61efb5` |
| MGT-FIX-02 reviewed implementation | `041b0f8a54f366ec7808f95919dc2789a31ae3c6` |
| Final integration branch | `fix/mgt-management-final-integration` contains both reviewed repairs; pending final review/merge |
| Integration branch migration count | 45 forward-only directories |
| Integration branch latest migration | `20260919004500_mgt_fix_02_pagination_snapshot_membership` (not yet on `main`) |

The earlier 39-packet plan did not merge to `main`. Its historical source is
remote commit `a40b328` on `origin/docs/VAL-009-management-216-plan`; it is
input to this reconciliation, not authority over current main. This document
creates the requested canonical path on the exact baseline above.

MGT-BE-10 production code and migration 43 are merged in `2a178e...`.
The follow-up BE-10 benchmark wording correction preceded the merged BE-11 main.
BE-11 application work and migration 44 are merged. BE-12 adds no migration and
is merged at the current `main` SHA above.

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
- implemented MGT-BE-06 / migration 39 with read-only Organization and exact-
  Location Management Audit routes, current-state Company Admin/Location
  Manager/Supervisor authorization, an explicit safe projection catalog (78
  then-current event types at the BE-06 merge, 87 current event types), a
  36-event Supervisor operational allowlist, strict scope/filter-bound keyset
  cursors, and complete separation
  from account-security audit and raw GPS/route history. Representative 100,000-
  row PostgreSQL plans measured the new
  `(organization_id, occurred_at DESC, id DESC)` index before adding it; no
  speculative Location- or event-type-leading audit index was added.
- implemented MGT-BE-07 / migration 40 with `status + accepting_intake` lifecycle
  representation, Management-created `INACTIVE/false` Locations, explicit
  lifecycle routes with readiness/drain projection, currency/timezone-only
  activation readiness, session/Shift/Task drain blockers, the shared Location
  lifecycle advisory boundary, and safe-boundary currency/timezone correction.
  A 100,001-row-per-table PostgreSQL benchmark justified partial blocker indexes
  for non-completed ValetSessions and non-terminal Tasks; the existing Shift
  index was already sufficient.

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
  entitlements; MGT-BE-12 now enforces current typed booleans on protected
  Management/Dashboard use while retaining no tenant mutation or billing engine.
- Read-only Company commercial and integration status routes are implemented;
  integration status is a fixed provider-neutral projection and performs no
  provider I/O merely to render Management status.
- Guest Session now projects effective persisted visit-Location display name and
  primary color only, with no commercial entitlement as Guest authority.
- Customer/Vehicle/ValetSession history, narrow exact returning Check-In
  recognition, and the MGT-BE-08 bounded Visit Contact search/history/Returning
  Contact surface; no CRM.
- Maps/tracking, Task/Vehicle-centric live map, ended-route history, finite raw
  GPS cleanup, keys, payments, incidents, external-notification persistence,
  and Staff Push/FCM foundations under their existing Accepted role matrices.
- DEC-079/MGT-BE-01 audit foundation is merged: Location audit remains
  compatible, Organization-wide events use null Location truthfully, and
  account-security history is separate. MGT-BE-06 now adds the bounded safe
  Management Audit query API without exposing the account-security store.
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
- DEC-094/MGT-BE-07 is merged on
  `main@3b1d6a3bdb422a7b862c233de1f1a628aeb8ea32`. Location persistence now uses
  `ACTIVE | INACTIVE` plus `accepting_intake`, defaults new rows to
  `INACTIVE/false`, and exposes the bounded lifecycle projection and commands.
  Activation readiness is exactly supported currency plus valid IANA timezone;
  final deactivation requires intake already stopped and no live session, Shift,
  or non-terminal Task blocker.

## 5. Current real gaps

1. Automatic report delivery remains intentionally deferred by DEC-093; this is
   not an unfinished BE-11/BE-12 requirement.

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

Implementation status: implemented on
`feat/mgt-be-06-management-audit-log` with migration 39 and focused API/contracts
coverage, then merged to `main` as
`b018833d84d32a6f3b78ee3dcbba58db76e413e5`. This statement does not claim
production deployment.

- Dependencies: MGT-BE-01 and MGT-BE-03.
- Routes: `GET /v1/staff/management/organizations/:organizationId/audit-events`
  for Company Admin Organization audit, and
  `GET /v1/staff/management/organizations/:organizationId/locations/:locationId/audit-events`
  for exact-Location Company Admin, Location Manager, or eligible Supervisor.
- Schema: migration 39 adds only
  `audit_events(organization_id, occurred_at DESC, id DESC)`. It was added after
  representative `EXPLAIN (ANALYZE, BUFFERS)` evidence; no audit mutation API or
  DML privilege change is introduced.
- Auth/privacy: Company Admin uses current exact-session STANDARD MFA plus current
  `ORG_ADMIN`/Organization authority. Location Manager requires the exact current
  Location grant; inactive Location history remains readable under DEC-094 while
  that grant is current. Supervisor additionally requires an active exact-
  Location Shift and receives only the explicit 36-event operational allowlist.
  Employee/Guest have no explorer. Account-security audit, raw metadata, raw
  route/GPS data, secret/PII/provider internals, and controlled operator refs are
  excluded.
- Projection: all 87 current tenant event types are explicitly classified into
  safe typed families. Known metadata is parsed field-by-field. Optional numeric
  versions/counts admit only public-schema-compatible safe integers and preserve
  their positive/non-negative rules; malformed historical values are omitted
  rather than failing the page. Unknown events return only a minimal `UNKNOWN`
  envelope and are excluded entirely for Supervisor.
- Filters/cursor: default `limit=50`, range 1–100; Organization supports optional
  exact `locationId` and known `eventType`, exact-Location supports optional known
  `eventType`. Unknown query keys/types are rejected. MGT-FIX-02 cursor v2 is a
  bounded HMAC-authenticated opaque value that binds route, Organization,
  Location/filter, event filter, `(occurred_at,id)` boundary, the original
  timestamp ceiling, and the first-page PostgreSQL `pg_snapshot`.
- Concurrency: every page reauthorizes current persisted authority inside the
  read transaction. Migration 45 records each new AuditEvent's immutable top-level
  insert transaction; later pages require that transaction to have been visible
  in the first-page snapshot. Therefore a matching writer still uncommitted at
  page one cannot enter page 2+ after commit, while a fresh traversal can see it.
  Pre-migration rows remain explicitly legacy/null and need no rewrite. Ordering
  remains `occurred_at DESC, id DESC`; equal timestamps stay deterministic.
  Audit reads append no AuditEvent.
- Performance: one bounded page query over authorized `audit_events` scope, no
  hydration N+1. The original 100,000-row benchmark measured Organization
  chronology at 54.250 ms / 2,026 shared buffers before versus 0.144 ms / 13
  after, exact Location at 62.407 ms / 1,961 versus 0.165 ms / 29, and event-type
  filtering at 32.669 ms / 1,961 versus 0.435 ms / 47; that run used ordered
  index scans with no Sort after migration 39. Final differential validation
  repeated the benchmark on a new disposable 100,000-row database and again
  showed the Organization chronology key materially winning (32.247 ms / 5,075
  buffers / Seq Scan + Sort to 0.066 ms / 10 / Index Only Scan) and the
  event-type shape materially winning (11.804 ms / 3,705 / Seq Scan + Sort to
  0.228 ms / 46 / Index Scan). On that second synthetic distribution PostgreSQL
  retained Seq Scan + Sort for the exact-Location shape (8.089 ms / 3,705 before,
  8.298 ms / 3,705 after), so exact-Location index selection is not claimed as a
  universal planner outcome. The Organization chronology measurement alone
  independently justifies migration 39; the evidence still does not justify a
  second Location- or event-type-leading index.
- Focused validation coverage is present for current-state role/status/grant/Shift
  revocation, tenant/Location scope, account-security separation, every current
  event-family projection, malicious and malformed metadata, Supervisor
  exclusions, signed-cursor crossover/tampering, equal timestamp/concurrent
  append traversal, the pre-page-one uncommitted-writer regression, zero
  read-side audit writes, migration upgrade/fresh install, and unchanged
  append-only runtime authority over audit metadata. Overall branch validation
  remains tracked separately.

### MGT-BE-07 — Location Management

Objective: implement DEC-094 create-inactive, readiness, activate, stop intake,
safe drain, deactivate, historical access, and currency/timezone correction
rules.

Implementation status: merged to `main` at
`3b1d6a3bdb422a7b862c233de1f1a628aeb8ea32` with migration
`20260917004000_mgt_be_07_location_management`.

- Dependencies: MGT-BE-01, MGT-BE-03, and operational precondition interfaces
  from MGT-BE-04.
- Schema: migration 40 adds `locations.accepting_intake BOOLEAN NOT NULL DEFAULT
  FALSE`, backfills existing ACTIVE rows to intake-open, changes Location status
  default to `INACTIVE`, and forbids `INACTIVE/true`. The three valid lifecycle
  representations are `INACTIVE/false`, `ACTIVE/true`, and drain-state
  `ACTIVE/false`.
- Routes: `POST /v1/staff/management/organizations/:organizationId/locations`;
  `GET /v1/staff/management/organizations/:organizationId/locations/:locationId/lifecycle`;
  and exact-Location `POST` routes at
  `/v1/staff/management/organizations/:organizationId/locations/:locationId/activate`,
  `/stop-intake`, `/deactivate`, `/currency-correction`, and
  `/timezone-correction` under that same exact-Location prefix.
- Readiness/drain projection: activation readiness is exactly
  `currencySupported && timezoneValid`. Drain reports only `activeShiftPresent`,
  `nonCompletedValetSessionPresent`, and `nonTerminalTaskPresent`; non-terminal
  Task means `QUEUED | ASSIGNED | ACCEPTED | IN_PROGRESS`.
- Auth/audit: every BE-07 route requires current same-Organization Company Admin
  authority with SENSITIVE/five-minute exact-session MFA. Real mutations append
  one of `LOCATION_CREATED`, `LOCATION_ACTIVATED`,
  `LOCATION_INTAKE_STOPPED`, `LOCATION_DEACTIVATED`,
  `LOCATION_CURRENCY_CORRECTED`, or `LOCATION_TIMEZONE_CORRECTED`; no hard delete
  or fabricated operational completion is used. Migration 40 reserves those six
  event names from direct runtime audit INSERT so lifecycle provenance and the
  create idempotency ledger remain command-authoritative.
- Concurrency/idempotency: create uses stable UUID `operationId` plus immutable
  request fingerprint; lifecycle/correction writes use `expectedUpdatedAt` CAS.
  The shared `location-lifecycle:<locationId>` transaction advisory key composes
  exclusive Management lifecycle writes with shared Check-In/Shift/retrieval
  operational boundaries. Stop-intake fences new Check-In; final deactivation
  rechecks all three drain blockers while holding the lifecycle boundary.
- Correction safe boundary: currency/timezone may change only when the Location
  is `INACTIVE`, intake is closed, and no session/Shift/Task drain blocker
  remains. Currency must be supported and keep the effective service fee exactly
  representable. Timezone must be valid IANA data and correction requires a
  bounded reason; historical timestamps/report facts remain unchanged.
- Performance: projection/blocker reads are bounded `EXISTS` queries. With
  100,001 rows in each blocker table, the pre-index ValetSession plan was a
  sequential scan at 9.262 ms / 935 shared-hit buffers and the Task plan was a
  sequential scan at 13.103 ms / 1,031 shared-hit buffers. Migration 40 therefore
  adds `valet_sessions_location_id_non_completed_idx` and
  `tasks_location_id_non_terminal_idx`; the same plans become index-only scans at
  0.057 ms / 2 buffers and 0.015 ms / 2 buffers. The existing
  `shifts_location_id_status_idx` was already index-only (0.023 ms / 3 buffers in
  the before run; 0.066 ms / 3 buffers in the after run). None of the three plans
  sorts. The separate create-operation partial unique audit index exists for
  retry correctness.
- Proof: INACTIVE creation, explicit currency/timezone, readiness truth, intake
  fencing, safe drain, active-work denial, shared-lock races, historical reads,
  create retry/conflict, CAS/no-op behavior, and prospective currency/timezone
  correction behavior.

### MGT-BE-08 — Customers / Guests

Objective: implement DEC-084 visit-contact search by phone/plate/name, visit
history, bounded projections, controlled corrections, and DEC-091 Returning
Contact calculation.

Implementation status: merged to
`main@8c01dd58098715ed5b3b03a2d16c77a241714657` as migration 41.

- Routes/contracts: `GET /v1/staff/management/organizations/:organizationId/visit-contacts`
  accepts exactly one of `phone`, `plate+plateCountry`, or `name`, plus bounded
  `limit`/`cursor` where applicable. Customer and Vehicle history are
  `GET .../visit-contacts/:customerId/visits` and
  `GET .../visit-vehicles/:vehicleId/visits`. Company Admin Customer correction
  uses explicit `POST .../visit-contacts/:customerId/name-correction` and
  `/phone-correction`; no generic Customer patch exists.
- Bounds/cursors: search/history default to 25 and cap at 50. Phone/name search
  and history use bounded HMAC-authenticated version-2 keyset cursors bound to
  membership, Organization, normalized mode/subject facts, the original
  timestamp ceiling and first-page PostgreSQL `pg_snapshot`. Plate is an exact
  bounded lookup and does not accept a cursor. History keeps
  `(ValetSession.created_at DESC, id DESC)` ordering and reauthorizes current
  persisted scope on every page. Migration 45 gives each newly inserted
  ValetSession an immutable top-level insert transaction; candidate evidence,
  scoped search evidence, history rows and Returning Contact prior-visit
  evidence must have been visible in the first-page snapshot. Thus a matching
  visit transaction uncommitted at page one cannot join page 2+ after commit,
  while a fresh traversal may see it. Mutable Customer fields and later
  ValetSession state changes remain current projections; MGT-FIX-02 does not
  fabricate historical row versions or hold a database transaction across HTTP.
- Search semantics: phone reuses the current Jordan-only Check-In normalizer;
  plate reuses authoritative country/number normalization; name is NFKC,
  control-character-rejecting, 2–80 code points, case-normalized prefix matching
  with SQL wildcards escaped. There is no browse, suffix/fuzzy phone, fuzzy
  plate, or unrestricted people search.
- Projection/ambiguity: results expose only safe source IDs, display name,
  role-safe phone, authorized completed count/latest visit, and up to five
  vehicles observed on authorized visits. Customerless Vehicle results remain
  valid. Match state is `NONE | UNIQUE | AMBIGUOUS`; duplicate phone Customer
  rows are never merged or hidden behind a selected winner. Location Manager
  ambiguity and aggregates ignore inaccessible Locations.
- Authorization: Company Admin has `VISIT_CONTACT_READ_ELIGIBLE` under STANDARD
  MFA and `VISIT_CONTACT_CORRECT_ELIGIBLE` under SENSITIVE/five-minute MFA.
  Location Manager read authority is the exact current persisted Location-grant
  set and does not require Company Admin MFA. Supervisor/Employee/Guest have no
  explorer or correction surface. Inactive Location history remains visible to
  an LM only while the exact current grant remains valid.
- Returning Contact: true only when the normalized contact for the reference
  visit appears on a strictly earlier `(created_at, id)` `COMPLETED` visit in
  the viewer's authorized scope. The current visit, future/incomplete visits,
  plate alone, and hidden Locations do not count. Matching normalized contact
  across different Customer rows works without merging.
- Corrections: accepted Management mutation authority supports only Company
  Admin `Customer.display_name` and Jordan-normalized phone correction. Both use
  `Customer.updated_at` CAS; exact retries are no-op, stale/different concurrent
  changes conflict, and historical ValetSession links remain unchanged. Current
  accepted authority does not establish safe Location Manager Organization-level
  Customer/Vehicle mutation or a Management plate correction, so neither is
  implemented.
- Audit/security: real changes atomically append
  `VISIT_CONTACT_NAME_CORRECTED` or `VISIT_CONTACT_PHONE_CORRECTED` with no raw
  name/phone/plate metadata. BE-06 recognizes both as Management events while
  Supervisor visibility is unchanged. Reads append no AuditEvent.
- Schema/runtime: migration 41 adds no CRM/ownership/merge table. It adds the
  measured Customer phone, Customer name-prefix, and ValetSession customer
  chronology indexes plus two narrow `SECURITY DEFINER` correction functions
  with fixed safe search path. Runtime keeps no generic Customer UPDATE/DELETE
  and receives execute only on those commands; private helpers and PUBLIC remain
  denied. MGT-FIX-02 migration 45 adds only nullable `xid8` pagination birth
  markers to `audit_events` and `valet_sessions` plus a private preservation
  trigger; there is no backfill, pagination table, cache, or new index.
- Performance: the original disposable PostgreSQL component proof at 60,000
  Customers, 50,000 Vehicles and 100,000 ValetSessions measured phone 38.081 ->
  0.278 ms, name 67.154 -> 0.364 ms, history 15.929 -> 0.026 ms, Returning
  Contact 30.884 -> 0.043 ms, completed aggregate 48.459 -> 0.071 ms, and LM
  scoped lookup 17.949 -> 0.106 ms with the three migration-41 indexes. After
  adding the search snapshot fence, the exact full production search SQL was
  rerun on a fresh disposable dataset at the same cardinality: warm
  `EXPLAIN (ANALYZE, BUFFERS)` execution was 0.785 ms / 312 shared hits for
  phone Company Admin, 0.490 ms / 244 hits for phone Location Manager,
  2.991 ms / 1,690 hits for broad name Company Admin, 4.381 ms / 2,875 hits for
  broad name Location Manager, and 0.539 ms / 162 hits for a selective name
  prefix. Phone uses `customers_organization_phone_normalized_id_idx`; selective
  name uses `customers_organization_display_name_prefix_id_idx`; authorized
  evidence and scoped aggregates use
  `valet_sessions_organization_customer_created_at_id_idx`. Broad name prefixes
  may rationally use the Organization/id keyset index with bounded filtering;
  no additional index was justified. Exact plate stayed on the existing
  `vehicles_known_plate_unique_idx` / Vehicle-session access path at 0.062 ->
  0.051 ms, so no extra plate index was added. Each benchmark database was
  dropped after measurement.

### MGT-BE-09 — Guest Rating

Objective: implement DEC-091 guest-only 1–5 rating, once per completed visit,
idempotency, and an authoritative analytics source.

Implementation status: merged to
`main@9f8e63659645806ae99e562d500cd4fe209c184c` with migration 42.

- Route/contract: `POST /v1/guest/session/rating`, HTTP 200 on create/exact
  retry, strict JSON `{ rating: 1..5 }`, no query parameters and no-store
  headers. Success returns only `valetSessionId`, `rating` and ISO `ratedAt`.
- Authorization/anti-abuse: exact current Guest bearer/session only, reusing the
  existing DEC-024 guest address and token limiter scopes and fail-closed
  finalization. The request cannot select a session, tenant or Location. Expired,
  revoked, malformed and unknown authority remains non-disclosing.
- Completion: the locked authoritative ValetSession must be `COMPLETED` with
  non-null `completed_at`; earlier physical states return the safe rating-not-
  available conflict without creating a rating.
- Schema: migration 42, `20260917004200_mgt_be_09_guest_rating`, adds
  `guest_ratings(organization_id, location_id, valet_session_id, rating,
  rated_at)`. `valet_session_id` is the primary key, rating is CHECKed 1–5, and
  the composite tenant/Location/session FK is restrictive. UPDATE/DELETE is
  rejected by an immutable-row trigger.
- Idempotency/concurrency: the session row is the serialization boundary. The
  first committed value wins; same-value retry returns the same row and original
  `ratedAt`, while a different value returns `GUEST_RATING_CONFLICT`. There is no
  overwrite path.
- Runtime/audit: ordinary runtime has no direct `guest_ratings` table privilege.
  Its only write authority is EXECUTE on fixed-search-path migration-owner
  `SECURITY DEFINER` `guest_rating_submit(text, integer)`; PUBLIC/private-helper
  execution is denied. Rating submission creates no `AuditEvent`.
- Analytics source: `guest_ratings` is the authoritative future rating fact and
  `rated_at` is the rating submission time. It does not redefine the later
  Location-local analytics visit-period cohort. The BE-09 PostgreSQL 17
  benchmark used 4 Organizations, 20 Locations, 200,000 ValetSessions, 180,000
  completed visits and 100,000 ratings. The representative scoped cohort join
  improved from 11.123 ms / 1,445 shared hits with an all-ratings sequential
  scan to 6.161 ms / 365 hits + 43 reads with
  `(organization_id, location_id, valet_session_id)`, about 44.6% faster.
  Migration 42 therefore includes exactly that scoped structural index and no
  other speculative rating/period index. MGT-BE-10 must justify any additional
  read/index path from its real aggregate query.

### MGT-BE-10 — KPI & Analytics Package

Objective: implement DEC-090 SLA target/Compliance, Cars per Active Employee,
Cars Handed Off by Employee, and controlled Key Exceptions while preserving all
DEC-060 metrics.

Implementation status: **MERGED** in
`2a178e977f88c576cfdc0c2c8363afae89f0ea5c`. Migration 43 is
`20260917004300_mgt_be_10_kpi_analytics`. Follow-up commit `4e8a505...`
corrected only the benchmark wording; `6c3810af41081d4b816fd81b9e188a2a7b42886f`
was the later merged main at that BE-11 point, not the current main.
DEC-095 closes the SLA applicability, work-evidence, and Key Exception source
gates intentionally left open by DEC-090.

- Dependencies: DEC-095 now locks the historically applicable SLA target
  snapshot, approved work-evidence union, and Incident-backed Key Exception
  catalog; MGT-BE-09 provides the authoritative Guest Rating source.
- Schema: nullable `locations.sla_target_seconds` plus immutable per-attempt
  `retrieval_requests.sla_target_seconds_snapshot`, each constrained to 30..3600
  when present and with no backfill/default. A trigger derives the snapshot under
  the shared settings boundary; target SET/CLEAR uses narrow ORG_ADMIN-only
  SECURITY DEFINER commands. Key Exceptions reuse Incident and do not get a
  second table.
- Auth: existing Location Manager plus MFA Company Admin through MGT-BE-03;
  server-derived Location periods.
- Correctness: SLA snapshots at the authoritative retrieval-request transition;
  explicit numerator/denominator/coverage; no hard-coded five minutes; handoffs
  use persisted completion actor; work evidence is exactly DEC-095's approved
  actor-at-time union and is not payroll/scoring.
- API: separate strict `GET
  /v1/staff/dashboard/locations/:locationId/analytics/kpis` response. SLA exposes
  numerator/denominator/percentage plus missing-target and invalid/missing-
  interval counts. Cars per Active Employee exposes numerator/denominator/value;
  handoffs expose attributed/missing counts plus at most 500 deterministic
  membership rows; Key Exceptions expose total plus all four controlled types.
  No Guest Rating formula or Returning Contact aggregate is invented.
- Performance: exact PostgreSQL numeric and set-based bounded period queries in
  one REPEATABLE READ snapshot. Representative PostgreSQL 17.11 EXPLAIN/BUFFERS on
  200k sessions, 150k requests, 600k key events and 600k dispatch events measured
  31-day SLA 35.510 -> 12.387 ms, Cars/Active 326.548 -> 153.278 ms, handoff
  summary 5.591 -> 1.694 ms and handoff rows 5.766 -> 1.961 ms. Six measured
  source indexes are retained; an Incident KPI index and other marginal
  candidates are deliberately omitted. Both disposable benchmark DBs were
  verified dropped. The retained 31-day plans changed SLA from a RetrievalRequest
  sequential scan to bitmap index/heap access (7,807 shared hits -> 7,335) and
  Cars/Active from 31,788 hits + 26,194 reads to 14,509 hits + 19,008 reads;
  handoff buffers fell from 5,631 to 2,103 shared hits. Captured summaries include
  scan/sort families but did not retain temp-block counters, so no temp-I/O value
  is asserted.
- Proof: fresh/upgrade/no-backfill migration, runtime least privilege, CAS/no-op/
  typed audit, deterministic setting-vs-Guest-request serialization in both lock
  orders with PostgreSQL barriers and no sleeps, cancellation/new-request
  snapshots, null target, SLA equality/coverage, exact eight-source work union,
  excluded assignment evidence, historical role/status changes, handoff missing
  attribution, exact four Incident types, same-Organization different-Location
  isolation, zero denominator, Location timezone/DST, Company Admin/Location
  Manager reads, and DEC-060 regression coverage.

### MGT-BE-11 — All Locations + Company Reports

Objective: implement DEC-092 company summary/multi-Location analytics, weighted
calculations, currency grouping, missing-data coverage, and manual CSV/PDF
company reports with final export authorization/audit.

Implementation status: **MERGED** at
`main@6c3810af41081d4b816fd81b9e188a2a7b42886f` with migration 44.

- Dependencies: MGT-BE-01, MGT-BE-03, and MGT-BE-10; MGT-BE-06 provides the
  Management audit read projection but is not required to write export audit.
- API: strict no-store Company Admin routes are `GET
  /v1/staff/management/organizations/:organizationId/analytics/all-locations?from&to`,
  `GET .../:organizationId/reports/daily?date`, `GET
  .../:organizationId/reports/weekly?weekStart`, `GET
  .../:organizationId/reports/monthly?month`, and `POST
  .../:organizationId/reports/exports`.
- Correctness: all persisted Organization Locations participate, including
  inactive history. Each current persisted Location IANA timezone defines its own
  local period bounds. Company analytics recomputes from source, averages raw
  qualifying duration samples, sums ratio numerators/denominators, keeps immutable
  Payment currencies separate, and exposes explicit Location/timezone/missing
  coverage. Cars per Active Employee uses one Organization-wide
  `COUNT(DISTINCT membership_id)` over approved DEC-095 evidence. Company handoff
  output is aggregate-only with no `byEmployee`; Guest Rating and Returning
  Contact are not included.
- Query/snapshot shape: one REPEATABLE READ source snapshot uses exactly five
  source queries for analytics and WEEKLY/MONTHLY report summaries; DAILY adds one
  controlled activity query. Query count is independent of Location count and
  there is no per-Location N+1, warehouse, cache or persisted report artifact.
- Bounds/rendering: timezone, currency, cash-reconciliation and Incident-type
  group families are capped at 500; DAILY Dispatch/key-custody groups are capped
  at 16/5; CSV/PDF artifacts are capped at 5 MiB. CSV receives injection/control
  hardening and PDF bytes are deterministic. Manual authenticated CSV/PDF is the
  only delivery surface; automatic delivery remains deferred.
- Auth/audit: BE-11 revalidates current MFA-backed Company Admin Management
  authority. After rendering, a fresh `REPORT_EXPORT` authorization transaction
  rederives and matches the period, hashes the final bytes, and appends exactly
  one `DASHBOARD_REPORT_EXPORT_GENERATED` AuditEvent for the Organization with
  null Location. Failed final reauthorization writes no successful-generation
  audit; repeated successful manual export is intentionally a new event. MGT-BE-12
  now composes current `dashboardAccess + reportExports` both before generation
  and again in this fresh final transaction before audit/artifact return.
- Schema/performance: migration 44,
  `20260918004400_mgt_be_11_all_locations_reports`, retains exactly one measured
  index and no other schema object:
  `dispatch_events_org_location_occurred_at_company_reports_idx` on
  `(organization_id, location_id, occurred_at) INCLUDE (task_id, event_type)`
  (109,568,000 bytes).
- Benchmark evidence: PostgreSQL 17.11 used 52 Locations overall and a target
  Organization with 40 Locations (30 ACTIVE/10 INACTIVE), eight timezone groups,
  and 400k target sessions. Overall benchmark-database totals were 318k retrieval
  requests, 1.272m key events, 254.4k notes,
  508.8k photos, 381.6k handoff verifications, 1.272m dispatch events, 84.8k
  incidents, 339.2k payments, 106k validations, 21.2k refunds and 56.16k shifts.
  The exact six production SQL statements were captured from exports. Two
  completed full runs both retained the Dispatch index: the exact 31-day DAILY
  statement improved about 23% to 57% across runs with strong one-day/seven-day
  wins. The initially tested Incident index was rejected after a permitted roughly
  30 KiB `Incident.type` value proved its `INCLUDE(type)` shape unsafe. A follow-up
  migrations-1-through-43 PostgreSQL 17.11 benchmark recaptured the exact current
  `queryCompanyIncidents` SQL and tested two safe alternatives. `INCLUDE(severity)`
  (5,775,360 bytes) accepted a 30,024-byte type but changed 1d/7d/31d execution
  from 430.089/469.619/475.268 ms to 456.630/464.902/494.088 ms; the key-only
  variant (5,029,888 bytes) accepted a 30,017-byte type and changed the same
  windows to 441.310/433.783/465.929 ms. PostgreSQL used neither candidate and
  neither met the >=20% and >=5 ms retention threshold, so migration 44 contains
  no Incident index. Other candidates failed thresholds, regressed, or lacked
  repeat support. Bundle endpoint wall-time was noisy/inconclusive and is not
  claimed as a proven speedup. All disposable benchmark databases were dropped
  and verified absent; temporary benchmark scripts were deleted.
- Privacy/proof: Company output contains no per-employee staff breakdown, raw
  contact identity, raw route/GPS data, provider secret, Guest Rating or Returning
  Contact aggregate. Focused proof covers mixed timezone/currency/missing data,
  weighted ratios, Organization DISTINCT evidence, cross-tenant denial,
  deterministic bounded exports and final-revocation behavior.

### MGT-BE-12 — Integrations & Commercial Access

Objective: implement DEC-087/088/089 read-only Integrations, plan/status/
features, VAYLET-owned entitlements, Management-only enforcement, and the
DEC-085 guest-safe effective branding projection if still missing.

Implementation status: **MERGED** at
`main@df6158e8a417996bdaa67994ffe90724645e9e40`.

- Dependencies: MGT-BE-03; report-export enforcement after MGT-BE-11; effective
  branding consumes MGT-BE-05.
- Schema: MGT-BE-12 itself added no migration after migration 44. Existing
  `organization_subscriptions` and branding persistence are reused; runtime
  remains SELECT-only on subscriptions. The later MGT-FIX-02 corrective branch
  independently owns migration 45 for pagination membership.
- Commercial read: `GET
  /v1/staff/management/organizations/:organizationId/subscription` requires
  current Company Admin tenant/MFA authority but is intentionally not
  `dashboardAccess`-gated. It returns exact opaque plan/status/three typed
  booleans or `subscription: null`; no tenant mutation or billing engine exists.
- Entitlements: current `dashboardAccess` is the base protected
  Management/Dashboard gate. Report export additionally requires
  `reportExports`; branding administration additionally requires
  `basicBranding`. Missing row fails closed. `planCode` and subscription
  status are descriptive and never feature authority.
- Integrations: `GET
  /v1/staff/management/organizations/:organizationId/integrations` is
  dashboard-gated and returns only the fixed `PLATE_OCR`, `STAFF_PUSH`,
  `DIGITAL_PAYMENT` catalog and safe status enum. OCR uses existing config/cost
  truth, Staff Push uses existing worker/policy/config truth, and Digital Payment
  reflects the actual unconfigured production registry. Configured syntax does
  not mean healthy; no provider call/send/payment action occurs on status read.
- Export finalization: exact-Location and Company manual export both recheck
  current `dashboardAccess + reportExports` at their fresh final authorization
  transaction before generation audit/artifact return. Post-render revocation
  writes no successful generation audit.
- Guest branding: `GET /v1/guest/session` now returns only
  `branding: { displayName, primaryColor }` from the real persisted
  ValetSession Location, with Location override -> current Organization fallback.
  Guest chooses no scope, no branding snapshot is persisted, and commercial
  lapse is not Guest authority.
- Safety/scope: entitlement checks stay in Management/Dashboard read/admin
  boundaries and do not enter Check-In, Parking, key/Shift/Task/Dispatch,
  Retrieval/READY/Handoff/release/completion, Incident recovery, Guest
  progression/rating, valet payment/validation/cash/refund, or operational
  tracking. No provider-secret persistence/configuration, POS/PMS/SSO, logo,
  advanced branding, automatic report delivery, or INFRA-TEST-01 work is added.

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

- DEC-074 keeps real OCR provider calls fail-closed unavailable in production
  until a shared durable OCR cost guard exists; an OCR tenant toggle cannot
  bypass that gate;
- existing Task/current-assignee data does not by itself prove the complete
  historical “actually worked” cohort, and ordinary KeyCustodyEvent rows are
  not Key Exceptions;
- SLA historical applicability and the genuine Key Exception source require
  careful schema design in their owning tasks before migration;
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
MGT-BE-03 through MGT-BE-12 are merged. MGT-BE-12 is at
`df6158e8a417996bdaa67994ffe90724645e9e40`; current merged main is
`f6d30b967c71bc7c3b9aaa0c0eba8ccaece7aa88` after INFRA-TEST-01A/01B/01C.
Management Backend MGT-BE-01 through MGT-BE-12 and the three INFRA-TEST-01
stabilization slices are merged. MGT-FIX-01 (`48ec582...`) and MGT-FIX-02
(`041b0f8...`) are later independently reviewed corrective implementations now
combined on `fix/mgt-management-final-integration`; migration 45 exists on that
integration branch, not on current `main`, and the combined corrective state is
pending final integration review/merge.

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
