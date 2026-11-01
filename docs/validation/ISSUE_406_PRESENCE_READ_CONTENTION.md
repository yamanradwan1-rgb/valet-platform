# Issue #406 — Presence management read contention

## 1. Repository facts discovered

- Freshly fetched main: `92437b146617f856caff710b1f6ed1ff3f24c223`.
- Branch: `fix/issue-406-presence-authority-read-contention`.
- Initial branch `work`, clean tree; no user changes to preserve.
- Node 24.19.0; repository Corepack pnpm 10.34.5 (ambient pnpm 11.25.0).
- PostgreSQL 17.11 (isolated postgres:17-alpine), pg 8.22.0, NestJS 11.1.28,
  TypeScript 5.9.3, Vitest 4.1.10, Next.js 16.4.3, React 19.2.8,
  Playwright 1.62.1 and system Chromium 154.0.8037.57. No dependency changes.
- Five baseline contention probes passed before production edits: two distinct-session
  reads conflict at the exclusive try-lock; policy and zone-list likewise; actual
  staff activity conflicts there; configuration writer waits at settings; other
  Organizations do not conflict. Two separate real database-origin probes passed.
- Historical 20+ second Retry symptoms are reported incident context. No QA logs,
  running QA SHAs or historical competing transaction are available here.

## 2. Binding requirements

Actual precedence is AGENTS.md section 2: latest explicit Owner instruction,
Accepted focused Decisions/log, then binding docs. DEC-099/100 lock graph,
DEC-081/108 current authority, DEC-078 MFA, DEC-083 typed settings and DEC-094
lifecycle remain binding. No Shift/ValetSession/Task transitions change.

## 3. Existing implementation patterns

Thin controllers -> PresenceManagementService -> explicit transaction-aware
authority/commands/projections -> inPostgresTransaction -> COMMIT or ROLLBACK.
Runtime uses bounded pg pools and lease destruction at operation deadlines;
Nest Logger emits allowlisted structured fields with instrumentation failure
isolated from responses. Dashboard has keyed authoritative reads and generation
guards; mutation identity/CAS and outcome reconciliation are distinct from GET.

## 4. LOCKED decisions

Contract ledger:

| Behavior | Authority | Identity / persistence / retry / privacy |
| --- | --- | --- |
| Current authority on every attempt | Owner #406; DEC-081/099/100/108 | Exact User/session/member/Organization/Location; persisted proof; no cached grants |
| Existing lock graph and write semantics | DEC-099/100; existing authority and command SQL | No lock changes; same transaction; CAS/receipts/audit atomic |
| Bounded configuration-read recovery | Owner #406 Option A; security rules Issue #406 section | New transaction; only pre-operation advisory refusal; never write replay |
| Three distinct failure origins | Owner #406 Phase 5; engineering logging/privacy | Internal allowlist; unchanged public busy code; no IDs/payload |
| Unknown read authority blocks writes, truthful EN/AR UX | Owner #406 Phase 6 | Fresh success restores capability; scope/generation fencing retained |
| Real PostgreSQL proof; commit/push only | Owner #406 | Disposable database; no QA mutation/deployment/CI trigger/merge |

## 5. DERIVED conclusions

The exclusive nonblocking authority lock makes benign authorized reads fail
under another session's transaction. A refused try-lock occurs before the
protected operation, receipts, audit or admin-activity update. Rolling back and
retrying the entire read can recover without stale authorization. No lock-order
change is necessary to repair this proven mechanism. Same-session reads can
instead serialize at the session row. Configuration writers serialize earlier.

## 6. UNRESOLVED decisions

No implementation-critical policy choice remains under the explicit Owner task.
Historical QA attribution remains unproven; do not equate local reproduction
with historical telemetry. Numeric recovery bounds are technical parameters
within the Owner-authorized strict elapsed/attempt budget.

## 7. Risks / boundary violations

Retaining the exclusive lock preserves security but sustained contention can
still exhaust recovery. A finite deadline must interrupt database work, preserve
shorter enclosing deadlines and leave general operator limits intact. Diagnostic
deadlock injection belongs only to the disposable test, never production code.


Adversarial self-review used the VAYLET code-review guardian's 13 output areas:
actual diff and scope; Accepted contracts; authorization-before-mutation;
retry/concurrency/DB; helper compatibility; atomic append-only audit/privacy;
downstream boundaries; 300-line architecture; negative/race test adequacy; scope
leakage; actual gate evidence; and conditional merge readiness. No new P0/P1/P2
finding remains (0/0/0). No authorization predicate, tenant/Location selector,
MFA rule, mutation SQL, CAS, receipt or audit writer was relaxed. The four-read
allowlist and early error class prevent write replay; frontend display retention
never supplies edit authority. Review merge verdict: MERGEABLE AFTER FIXES to
unrelated repository gates and normal independent review/CI; no merge authorized.

Falsification checks: 6/6 contract-ledger rows and 4/4 derived claims checked.
Sources challenged were the exact session-context type, authority SQL and DEC
rules, every retry entrypoint, transaction boundary/receipt commands, HTTP error
serialization, and Dashboard scope/generation/capability guards. Tests include
real revocation-first and protected-operation-first schedules. This is an
adversarial scoped self-review, not a fresh Codex Security repository scan.

## 8. Proposed implementation plan

READY TO IMPLEMENT after seven baseline real-PostgreSQL probes. Extract the
existing transaction runner without changing its write path, classify errors,
and opt in only four configuration GET methods to bounded fresh-transaction
recovery. Extend the existing deadline primitive with a general-policy scope,
preserving Guest opt-in behavior and all enclosing limits. Distinguish Dashboard
read state from editability; preserve display-only drafts and block writes until
fresh success. Add SQL, authority, deadline and UI regressions, then full gates
and adversarial diff review before commit/push.

Authorization-before-mutation proof (unchanged): authenticate exact session;
resolve persisted Location/Organization; settings and lifecycle guards;
current User/session/MFA + staff-management boundary + exact member/role,
Organization, entitlement, Location/access proof; operation/receipt identity;
CAS protected write; atomic safe audit/receipt; final session/MFA recheck and
admin activity; COMMIT. Any exception rolls back. Reconciliation freshly proves
scope and never executes the write. Only the early advisory refusal is eligible
for configuration-read retry; no authorization result survives a rollback.

No new downstream domain boundary, schema, migration or dependency is needed.

### Actual change and unchanged mutation replay matrix

Implemented: explicit configuration-read recovery; classified internal diagnostics;
transaction-runner extraction; a narrow general-policy deadline using the existing
runtime pool/lease watchdog; explicit Dashboard authoritative-read states and
localized busy copy; scope-fenced display-only retention with blocked writes;
seven focused test files (60 new cases). No new repository layer was introduced.
The namespace inventory's existing `*-repository.ts` filenames are not a proposal
for an additional layer (plan-audit heuristic warning reviewed against real code).

| Mutation execution scenario (unchanged) | Authority and result |
| --- | --- |
| First valid execution | Complete current proof, existing settings/lifecycle/staff guards, CAS, safe audit/receipt, atomic COMMIT |
| Identical retry after success | Presence mutation UUID already reserved -> PRESENCE_MUTATION_CONFLICT; exact-result GET reauthorizes and discloses receipt without replay |
| Concurrent identical execution | Existing exclusive guards serialize; one winning effect/receipt, committed duplicate conflicts; rollback leaves no ghost receipt |
| Conflicting concurrent execution | Guard/CAS loser receives existing configuration/inherited-context/review conflict; no overwrite or automatic retry |
| Retry after post-success state | Old revision fails; identical committed UUID conflicts; explicit new intent needs fresh authoritative state |
| Same UUID, changed payload | Existing identity conflict, never replacement of the first committed receipt |
| Unknown response/commit outcome | Current-authority GET reconciliation only, never automatic protected write replay |

Staff role/status/grant commands retain their own accepted desired-state no-op,
version, last-admin, handover and audit semantics. They are test invalidators,
not a newly retried command family. Existing commit/rollback/UNKNOWN configuration,
review and revocation race assertions were preserved unchanged.

### Concrete call graph and unchanged lock order

Controller entry uses `ApiOperationRunner.run`, `presenceManagementHttpContext`
(no-store, exactly one Authorization header, persisted session resolution), and
`presenceLocationHttpTarget` for separate CA/LM routes. The service now delegates
the original transaction body to `runPresenceManagementTransaction`.

| Operation | Concrete path after HTTP/context resolution |
| --- | --- |
| Location policy GET / readiness GET | PresenceLocationPolicyController.read/readiness -> service.location -> protectPresenceManagementAuthority -> presenceLocationPolicy -> presenceCompanyPolicy + lockShiftPresenceConfiguration -> final session check -> applicable activity -> COMMIT |
| Attendance-zone list GET | PresenceLocationZoneController.list -> service.zones -> same authority -> listPresenceZones (exact Organization + Location predicate, keyset bound) -> final check/activity -> COMMIT |
| Individual zone GET | PresenceLocationZoneController.read -> service.zone -> same authority -> readPresenceZone (exact tenant/Location/id) + presenceLocationPolicy readiness -> final check/activity -> COMMIT |
| Company policy GET | PresenceCompanyController.read -> service.company -> same authority without a Location -> presenceCompanyPolicy -> final check/activity -> COMMIT |
| Configuration mutation | policy/zone controller -> service.setCompany/changeLocation/saveZone -> authority with configurationWriter=true -> recordPresenceManagementMutation -> policy command or zone command -> narrow SQL policy/CAS or guarded zone update -> safe audit + immutable receipt -> final session/MFA/activity -> COMMIT |
| Staff membership/grant mutation | StaffManagementMutationService.role/status/locationAccess -> authorizeStaffManagement -> CA Management authorizer or exact LM authorizer -> authorizeStaffTarget + locked target projection -> staff_management_set_role/status/location_access -> safe audit -> current authorized projection/activity -> COMMIT |
| Staff-management authorization | currentRole -> applicable assurance -> blocking exclusive staff-management-org advisory -> current membership FOR UPDATE -> grant/role/commercial checks; SQL rechecks the same boundary before target mutation |
| Session / MFA | lockAndRecheckStaffSessionContext -> staff-user-security exclusive transaction advisory -> exact session FOR UPDATE; lockAndRecheckMfaSession locks session + User FOR UPDATE; factor is held FOR SHARE; MFA compares database wall time; these calls repeat in every new read transaction |
| Failure | inPostgresTransaction catches -> ROLLBACK -> outcome notification -> release (destroy unusable lease); only the pre-operation advisory-refusal class can enter configuration-read backoff |

Before and after, the first-acquisition graph is:

```text
persisted Location -> Organization scope resolution (no lock / no write)
management-settings-org (S for read/review; X for configuration writer)
  -> location-lifecycle (S; Company writer locks all Locations in sorted order)
  -> staff-user-security (X) -> exact session/User rows (UPDATE)
  -> staff-management-org (X, nonblocking try)
  -> current membership (UPDATE)
  -> Organization + entitlement + exact Location/access rows (SHARE)
  -> applicable MFA factor (SHARE) + database-time assurance
  -> scoped projection / protected CAS operation + receipt/audit
  -> final exact-session / sensitive-MFA recheck -> activity -> COMMIT
```

`lockShiftPresenceConfiguration` and policy SQL re-enter already-held settings/
lifecycle guards; they do not introduce a new late first acquisition. All advisory
transaction locks and row locks persist until COMMIT/ROLLBACK. The only new edge
is outside transactions: ROLLBACK/release -> capped delay -> fresh BEGIN/full proof.
No isolation, lock mode, ordering, scope, SQL grants or mutation semantics change.

### Reproduced holder / waiter schedules

Each uses separate real connections and explicit commit/false-lock/pg_stat_activity
barriers; no timing sleep creates the asserted interleaving. Backoff delays belong
to production recovery, not test orchestration. Holder IDs and resource IDs are
synthetic and excluded from diagnostics/reporting.

| Scenario | Holder A / waiting or losing B | Held resources and duration | DML before conflict? | Proven origin / result |
| --- | --- | --- | --- | --- |
| A: two policy reads | CA policy read held before commit / separate LM policy read | A settings S, lifecycle S, staff-org X, authority rows until explicit finish | CA activity only; B none before refused boundary | Baseline false try-lock, zero driver SQLSTATE; repaired B rolls back then succeeds after A COMMIT and ROLLBACK |
| B: policy + zones | Same A / separate authorized zone-list | Same Organization boundary | B none | Same early advisory origin; canonical zone list after recovery |
| C: configuration writer | Actual policy writer held before commit / LM policy read | A settings X and all downstream locks; B waits at settings S | A policy + audit/receipt already written; B none | Expected serialization; B sees changed policy after COMMIT, old policy after ROLLBACK |
| D: staff activity | Actual staff status mutation / independent authorized read | A staff-org X and target membership through commit; B briefly holds its own session locks before try refusal | A target status + audit; B none | Advisory refusal, then read succeeds after A commits |
| E: grant/member revoke | Actual CA revocation/deactivation held before commit / affected LM policy read | A staff-org X and target membership; B rolls back each refused attempt | A revocation pending; B none | A COMMIT -> fresh read denied; A ROLLBACK -> authorized success; no cached proof |
| F: cross-Organization | Held A read / B other-Organization read | Disjoint advisory keys and principal rows | No protected mutation by B | B completes while A remains held |
| G/H: slow holder ends | Read or configuration holder explicitly COMMIT/ROLLBACK | All locks retained to chosen transaction end | As above | Canonical committed state only; rollback has no ghost change |
| I: 55P03 | Test admin holds Location UPDATE / protected read requests SHARE | B has staff-org X and upstream authority locks; lock_timeout=150ms in test connection | A no DML (row-lock only); B no protected DML | Real PostgreSQL 55P03; one attempt, rollback, internal POSTGRES_LOCK_NOT_AVAILABLE_55P03 |
| J: 40P01 | Test admin holds Location UPDATE then requests Organization UPDATE / protected read holds Organization SHARE then requests Location SHARE | Actual two-connection cycle; admin detector deliberately slower than application detector | No committed DML; victim rolls back | Real 40P01; one attempt; POSTGRES_DEADLOCK_40P01 at ERROR severity. External test-only inversion, not evidence of a production lock-order defect |
| prolonged advisory | A remains held through B exhaustion | B releases every transaction between attempts | B no INSERT/UPDATE/DELETE/COMMIT | At most 8 attempts; observed roughly 1.1s exhaustion, original public busy |
| prolonged settings | Test admin holds settings X through B deadline | B's owned lease is interrupted at the 2s budget | B none | READ_BUDGET_EXHAUSTED, subsequent fresh read succeeds |
| later revocation | LM read owns protected interval / later CA grant revoke | Revoker waits for staff-org; read commits first | Read only; later authorized revoke | First response valid, all subsequent reads denied |
| session/User/MFA/entitlement revoke | Unrelated actual staff mutation holds boundary / read retries after independent invalidation | Every new BEGIN rechecks exact persisted principal and authority | No protected write by read | 401, MFA step-up or concealed authority denial as appropriate |

Benign refusal is an availability defect in immediate-failure read handling.
Revocation contention itself is expected protection. SQLSTATE probes demonstrate
classification, not the historical incident's cause. The old QA pg_locks snapshot
is not used as proof of historical lock absence. Unknown protected write outcomes
still reconcile their exact receipt under fresh authority; they are never replayed.

### Complete namespace acquisition inventory

Inventory is source-site based (including historical SQL definitions), produced
from freshly fetched main plus this patch with `rg` over API source and committed
migrations. Shared helper callers are listed as well as direct namespace sites.
Transaction acquisitions live until transaction end. Dashboard KPI/resource
snapshot session-level shared acquisitions instead explicitly unlock in finally;
unusable connections are discarded if unlock cannot be established.

**management-settings-org**

- `apps/api/src/common/database/management-settings-lock.ts`
- `apps/api/src/modules/check-in-api/check-in-location-authorization.ts`
- `apps/api/src/modules/dispatch/emergency-takeover-locks.ts`
- `apps/api/src/modules/management/guest-information-authorization.ts`
- `apps/api/src/modules/management/management-branding.service.ts`
- `apps/api/src/modules/management/management-location.service.ts`
- `apps/api/src/modules/management/management-settings.service.ts`
- `apps/api/src/modules/management/presence-management-authority.ts`
- `apps/api/src/modules/parking/confirm-parked-command.ts`
- `apps/api/src/modules/parking/start-parking-command.ts`
- `apps/api/src/modules/retrieval/complete-handoff-command.ts`
- `apps/api/src/modules/retrieval/guest-retrieval-request-command.ts`
- `apps/api/src/modules/retrieval/start-retrieval-command.ts`
- `apps/api/src/modules/shifts/shift-presence-policy.ts`
- `apps/api/src/modules/shifts/shift-presence-security.ts`
- `apps/api/src/modules/shifts/shift-presence-zone.ts`
- `apps/api/src/modules/staff-push/staff-push-eligibility-repository.ts`
- `apps/api/src/modules/tracking/gps-ingestion-command.ts`
- `apps/api/src/modules/valet-sessions/check-in-condition-authorization.ts`
- `apps/api/src/modules/valet-sessions/complete-check-in-command.ts`
- `packages/database/prisma/migrations/20260916003800_mgt_be_05_company_settings_branding/migration.sql`
- `packages/database/prisma/migrations/20261004006000_shift_presence_authority_denial/migration.sql`
- `packages/database/prisma/migrations/20261004006100_shift_presence_policy_commands/migration.sql`
- `packages/database/prisma/migrations/20261007006900_shift_presence_strict_rollout_activation/migration.sql`
- `packages/database/prisma/migrations/20261008007800_guest_web_push_v1/migration.sql`

**location-lifecycle**

- `apps/api/src/common/database/location-lifecycle-lock.ts`
- `apps/api/src/modules/check-in-api/check-in-location-authorization.ts`
- `apps/api/src/modules/dashboard/incident-resolution-command.ts`
- `apps/api/src/modules/dashboard/supervisor-emergency-tasks-scope.ts`
- `apps/api/src/modules/dispatch/emergency-takeover-authorization.ts`
- `apps/api/src/modules/management/management-location.service.ts`
- `apps/api/src/modules/management/presence-management-authority.ts`
- `apps/api/src/modules/parking/cancel-before-parking-authorization.ts`
- `apps/api/src/modules/retrieval/guest-retrieval-request-command.ts`
- `apps/api/src/modules/shifts/shift-authorization.ts`
- `apps/api/src/modules/shifts/shift-operational-eligibility.ts`
- `apps/api/src/modules/shifts/shift-presence-policy.ts`
- `apps/api/src/modules/shifts/shift-presence-security.ts`
- `apps/api/src/modules/shifts/shift-presence-zone.ts`
- `apps/api/src/modules/tracking/task-route-authorization.ts`
- `apps/api/src/modules/valet-sessions/cancel-check-in-authorization.ts`
- `packages/database/prisma/migrations/20260917004000_mgt_be_07_location_management/migration.sql`
- `packages/database/prisma/migrations/20261004006000_shift_presence_authority_denial/migration.sql`
- `packages/database/prisma/migrations/20261004006100_shift_presence_policy_commands/migration.sql`
- `packages/database/prisma/migrations/20261007006900_shift_presence_strict_rollout_activation/migration.sql`

**staff-management-org**

- `apps/api/src/modules/dashboard/analytics-kpi-snapshot-transaction.ts`
- `apps/api/src/modules/dashboard/branding-command.ts`
- `apps/api/src/modules/dashboard/dashboard-read-authorization.ts`
- `apps/api/src/modules/dashboard/live-history-read-authorization.ts`
- `apps/api/src/modules/dashboard/physical-resource-authorization.ts`
- `apps/api/src/modules/dashboard/physical-resource-overview-transaction.ts`
- `apps/api/src/modules/dashboard/subscription-read.ts`
- `apps/api/src/modules/management/guest-information-authorization.ts`
- `apps/api/src/modules/management/management-authorization.ts`
- `apps/api/src/modules/management/presence-management-authority.ts`
- `apps/api/src/modules/management/staff-management-authorization.ts`
- `apps/api/src/modules/shifts/shift-presence-security.ts`
- `packages/database/prisma/migrations/20260916003700_mgt_be_04_staff_roles_access/migration.sql`
- `packages/database/prisma/migrations/20261001005000_mgt_240b_lm_staff_authority/migration.sql`
- `packages/database/prisma/migrations/20261001005300_mgt_240d_staff_activation/migration.sql`
- `packages/database/prisma/migrations/20261002005400_mgt_240f_force_end_shift/migration.sql`
- `packages/database/prisma/migrations/20261004006000_shift_presence_authority_denial/migration.sql`
- `packages/database/prisma/migrations/20261004006100_shift_presence_policy_commands/migration.sql`
- `packages/database/prisma/migrations/20261007006900_shift_presence_strict_rollout_activation/migration.sql`

Settings helper supports S/X: operational consumers, Presence projections and
normal settings/branding reads use S; configuration/branding mutations and
relevant Location commands use X. SQL migration 038 owns the settings helper;
060 uses S for presence denial; 061/069 use X for policy writes; 078 uses X for
Guest-push configuration. Staff-push eligibility takes S before final eligibility.

Lifecycle helper and migration 040 support S/X. Operational consumers and Presence
use S; Location lifecycle methods select S or X according to existing command.
Presence zone creation/update and policy SQL follow settings X -> lifecycle S.

Staff namespace: Management authorizers (CA and LM), guest information, SQL staff
mutators/activation/Force End and Presence management use X; Presence management
alone uses a nonblocking exclusive try. Shift Presence second-principal proof and
migration 060 use nonblocking S. Dashboard read/branding/subscription/resource/
history fences use S; KPI and resource snapshots use session-level S as described
above. Migrations 037/050 authorize staff mutations under X, 053 activation under
X, 054 Force End under X, and 061/069 policy writers under X. Superseded SQL
function versions are historical inventory, not additional runtime acquisitions.

Relevant row locks are exact-session/User UPDATE, membership UPDATE, Organization/
Location/access/entitlement/factor SHARE; staff mutations additionally lock target
memberships UPDATE and complete LM grants SHARE. Configuration projections read
zones under the settings guard; zone writes use the existing CAS revision and
exclusive settings guard. No row-lock clause is added or removed by this patch.


## 9. Test matrix

Every row below passed for its stated evidence boundary. API tests use the real
PostgreSQL runtime role and migrations; browser tests explicitly intercept API and
Maps SDK responses, not PostgreSQL or real-provider delivery.

Abbreviations (all API files under `apps/api/test/`):
- RC: `shift-presence-read-contention.integration.test.ts` (12 cases).
- RA: `shift-presence-read-authority-races.integration.test.ts` (10 cases).
- RD: `shift-presence-read-database-errors.integration.test.ts` (2 cases).
- RH: `shift-presence-read-http.integration.test.ts` (2 cases).
- RU: `presence-management-read-recovery.test.ts` (17 cases).
- UI: `studio-presence-read-state.test.tsx` (9 cases, Dashboard source).
- Browser: `issue406-presence-read-recovery.spec.ts` (8 cases).

| ID | Evidence |
| --- | --- |
| T01 | RC Company policy recovery; RH authorized fresh policy/zone HTTP; existing management suite |
| T02 | RC CA/LM exact-Location reads; RH exact LM route |
| T03 | RC two policy reads, different sessions, COMMIT and ROLLBACK; same-session serialization |
| T04 | RC policy + zones with actual overlapping transactions |
| T05 | RC actual short StaffManagementMutationService status writer; successful fresh retry |
| T06 | RC prolonged authority refusal and held settings lock: finite attempts and total deadline |
| T07 | RC COMMIT schedules return correct canonical state |
| T08 | RC and RA ROLLBACK schedules recover without ghost policy/revocation |
| T09 | RA actual grant/member revocation commits before retry -> denial |
| T10 | RA protected read wins, later revoke waits, subsequent reads denied; existing current-authority races |
| T11 | RC cross-Organization held read does not block another Organization |
| T12 | RH foreign-Location concealed 404; existing management-authority negative tests |
| T13 | RA membership deactivation; existing inactive/revoked/foreign authority assertions |
| T14 | RA session revocation and User disable during contention; RH revoked session 401 |
| T15 | RA MFA assurance and entitlement invalidation during contention; existing strict-rollout/MFA tests |
| T16 | Existing management + configuration-races suites preserve CAS, inherited context, receipt and audit behavior |
| T17 | RD actual 55P03/40P01, single BEGIN/ROLLBACK and exact internal origin; RU origin/severity tests |
| T18 | RA mutation/result reads remain one attempt; existing authority/current-authority races unchanged |
| T19 | Browser EN/AR policy/zone 409; UI correct busy copy + Retry without permanent view-only banner |
| T20 | Browser successful canEdit=false and genuine 403; UI denial/no-scope/inactive states; RH 401/404 |
| T21 | Browser explicit GET Retry restores authorized edit controls, zero configuration mutations |
| T22 | Browser dirty policy + zone draft retention, blocked saves, delayed A response after B selection; existing Issue407 A->B->A callback tests |
| T23 | Existing Issue407 browser tests and map unit tests pass; no production map file changed; SDK doubles do not prove real tiles |
| T24 | RC eight-attempt ceiling, rollback between attempts, 2s owned-lease deadline; RU shorter parent deadline and Guest-policy preservation |

### Commands and observed results

Use Corepack pnpm 10.34.5. PostgreSQL commands target only the disposable local
container, with `TEST_DATABASE_URL` supplied for the forward-migration fixture.
No QA/production URL or credential is used.

| Gate / exact command family | Result |
| --- | --- |
| Owned runner, five new API test files + existing forward migration: `corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/presence-management-read-recovery.test.ts test/shift-presence-read-contention.integration.test.ts test/shift-presence-read-authority-races.integration.test.ts test/shift-presence-read-database-errors.integration.test.ts test/shift-presence-read-http.integration.test.ts test/shift-presence-forward-migration.integration.test.ts` | PASS: 44 cases / 6 files; 27 real-PostgreSQL cases + 17 unit cases. RD strengthened to assert exact internal origins, rerun PASS 2/2 |
| Expanded owned runner: all `test/shift-presence*.test.ts` then `postgres-release-context`, `postgres-release-isolation`, `postgres-startup-release-context`, `postgres-reset-diagnostics`, `performance-pool-diagnostics`, RU | Initial 440 PASS, 1 skipped due missing explicit bootstrap URL: standard 168/26 files, race 198/24 files, pure 74/10 files. Forward migration rerun with explicit disposable URL PASS; no Presence test remains unverified |
| `corepack pnpm --filter @valet/dashboard exec vitest run src/features/administration/policies-studio/studio-presence-read-state.test.tsx --maxWorkers=1` | PASS 9/9 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=issue406-sdk-test-only ISSUE406_CHROMIUM_PATH=/usr/bin/chromium corepack pnpm --filter @valet/dashboard exec playwright test --config playwright.issue406.config.ts --reporter=line` | PASS 22/22: 8 new, 14 existing map/lifecycle cases. System Chromium, intercepted API/SDK, no real Maps delivery claim |
| `corepack pnpm --filter @valet/dashboard test` / final root pure Dashboard execution | Final PASS 1172/1172, 175 files. Earlier two help timeouts reproduced on baseline, then passed in final serial root lane |
| `corepack pnpm lint` | PASS 11/11 tasks; API and Dashboard ESLint included |
| `corepack pnpm typecheck` | PASS 11/11 tasks |
| `corepack pnpm build` | PASS 10/10 tasks (verification build, not deployment). API build/typecheck repeated after final backend edit, both PASS |
| Final changed-code ESLint | PASS, including new API tests, Dashboard unit and E2E files |
| `corepack pnpm architecture:check` | PASS; final physical-line inventory and changed-file formatting recorded in handoff |
| `git diff --check`; changed-file Prettier | PASS; no repository-wide formatting |
| `corepack pnpm test` | BLOCKED on both this branch and unchanged baseline: Issue215 target attestation missing, before tests. Its guard was not bypassed or modified |
| `corepack pnpm test:non-postgres` | FAIL from independently reproduced baseline Native appearance, API HTTP-cancellation, and DB migration-inventory tests; details below |
| Direct API pure Vitest project | 1437 PASS, 1 baseline Dispatch metadata FAIL, 7 skipped (203 files). The Node prerequisite failure above prevents this project from running in the aggregate script, so it was run separately |
| Manual QA / real-provider Maps / running QA SHAs | UNAVAILABLE. No QA log, screenshot, Irbid replay, deployed SHA or production-readiness claim |
| Remote CI | Not used as local proof; no manual workflow dispatch, merge, deployment or service restart |

The initial PostgreSQL forward-migration failure was fixture configuration:
it constructs a bootstrap Pool directly from TEST_DATABASE_URL, whereas other
fixtures have a local default. Supplying the task-owned URL fixed the gate without
editing the fixture or SQL. A second attempted focused invocation was refused
while the first still owned the test cluster; it was rerun only after lease release.

Hostile verification also caught an implementation edge before acceptance:
a shortened client query timeout can precede the operation watchdog. It originally
surfaced as INTERNAL_ERROR. The final query wrapper classifies only a genuinely
deadline-limited general query as OPERATION_DEADLINE, preserving ordinary operator
and Guest query-timeout semantics. The real held-lock deadline then returned the
original public busy contract and a subsequent read recovered. An initial MFA
fixture timestamp violated its existing SQL CHECK; the test now revokes the
assurance consistently with nullable assurance columns, without weakening SQL.

### Baseline failures, independently reproduced

Unchanged detached worktree: `92437b146617f856caff710b1f6ed1ff3f24c223`.
No unrelated tests or product files were changed to make these gates green.

| Gate | Exact baseline reproduction and evidence |
| --- | --- |
| Root test target guard | `corepack pnpm test`: identical missing attested Issue215 target rejection before test execution |
| Native appearance | `corepack pnpm --filter @valet/valet-native exec vitest run test/native-appearance-render-matrix.test.ts`: same two EN/AR release snapshots fail (Release blocked vs old Identity verified state) |
| API Node cancellation | From apps/api, `node --test test/issue333-u002-http-cancellation.test.mjs`: same synchronous-finish case times out after 12s; 3 pass / 1 fail. Aggregate Node lane: 48 pass / 1 fail |
| API module ownership | Owned runner `test/feature-module-ownership.test.ts`: same old Dispatch controller metadata assertion fails against existing EmergencyTaskTakeoverController; 11 pass / 1 fail. No Dispatch source changed |
| Database migration inventory | `corepack pnpm --filter @valet/database exec vitest run --config vitest.config.mjs --project database-non-postgres src/issue304-migration-source-appendix.test.ts`: same stale expected 103 vs actual 106 migrations. Aggregate DB pure lane: 64 pass / 1 fail |
| Earlier Dashboard timeouts | `corepack pnpm --filter @valet/dashboard exec vitest run src/features/help/administration-settings-help.test.ts --maxWorkers=1`: same two 5s help timeouts on baseline. Final Dashboard lane nevertheless passed all 1172 cases |

Aggregate non-PostgreSQL pure package results: contracts 533 PASS, UI 2 PASS,
testing 1 PASS, config 1 PASS, employee-client 928 PASS, customer 530 PASS,
Dashboard 1172 PASS, Native 1877 PASS / 2 baseline FAIL. Root pure Turbo reports
7 successful / 9 tasks; no broader all-green claim is made.

## 10. Files expected to change

Final intended inventory: 26 files (no dependency, lockfile, schema or migration change).

- `apps/api/src/common/database/bounded-postgres-query.ts`
- `apps/api/src/common/database/runtime-database-deadline.ts`
- `apps/api/src/modules/management/presence-management-authority.ts`
- `apps/api/src/modules/management/presence-management-diagnostics.ts`
- `apps/api/src/modules/management/presence-management-read-recovery.ts`
- `apps/api/src/modules/management/presence-management-transaction.ts`
- `apps/api/src/modules/management/presence-management.service.ts`
- `apps/api/test/presence-management-read-recovery.test.ts`
- `apps/api/test/shift-presence-read-authority-races.integration.test.ts`
- `apps/api/test/shift-presence-read-contention.integration.test.ts`
- `apps/api/test/shift-presence-read-database-errors.integration.test.ts`
- `apps/api/test/shift-presence-read-http.integration.test.ts`
- `apps/api/test/shift-presence-read-probe.ts`
- `apps/dashboard/e2e/issue406-presence-read-recovery.spec.ts`
- `apps/dashboard/playwright.issue406.config.ts`
- `apps/dashboard/src/features/administration/policies-studio/adapters/presence/use-policies-studio-presence.ts`
- `apps/dashboard/src/features/administration/policies-studio/policies-studio-page.tsx`
- `apps/dashboard/src/features/administration/policies-studio/studio-presence-bridge.ts`
- `apps/dashboard/src/features/administration/policies-studio/studio-presence-read-state.test.tsx`
- `apps/dashboard/src/features/administration/policies-studio/ui/ReadState.tsx`
- `apps/dashboard/src/features/administration/policies-studio/ui/Workspace.tsx`
- `apps/dashboard/src/features/administration/policies-studio/ui/studio-types.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-copy.ts`
- `apps/dashboard/src/features/administration/use-authoritative-read.ts`
- `docs/06_SECURITY_AND_DATA_RULES.md`
- `docs/validation/ISSUE_406_PRESENCE_READ_CONTENTION.md`

## 11. Explicitly out of scope

Lock-mode/order redesign, staff lifecycle redesign, protected write retries,
exception-consumption policy, map replacement, raw GPS retention, migrations,
dependencies, QA deployment/restart, manual CI trigger, merge and issue closure.

## 12. Ready-to-implement verdict

Planning verdict was READY TO IMPLEMENT after reproducing the mechanism.
Implementation verdict: **CONDITIONAL ACCEPTANCE** for a committed/pushed review
branch only, because unrelated repository gates remain baseline-red/blocked and
manual QA is unavailable. Focused #406 tests and scoped security review pass.

The commit and matching remote SHA are recorded in the final handoff after
publication (the committed report cannot include its own final commit hash).
The reviewable source diff is the owned branch against the baseline above.
Working-tree and remote-ref equality must be checked after push. Issue #406
remains open; no main merge, QA/production deployment/restart or manual CI trigger.
Historical incident attribution remains unknown; this is not a permanent-resolution
claim from mock tests or the old pg_locks snapshot.
