# Issue #240 / T05-F — LM MFA and Force End backend

Baseline: `c82f7462e16f4b94f3d166bc2effb5f125abf990`, fetched and clean.
Normal branch: `fix/240f-mfa-force-end-backend`; no worktree or PR.
This record initially describes the implementation contract; evidence is added
only after execution. Issue #240 is not complete. T05-G is not implemented.

## Accepted implementation map and contract ledger

Authority: owner T05-F brief clauses 0–50; Issue #240; accepted DEC-078 and
DEC-081, including the owner-locked plan section 28. These amend DEC-032 only
with a distinct management closure; ordinary self-end semantics are retained.

| Choice | Binding source / identity / persistence and race authority |
| --- | --- |
| Route | Brief 6: POST `/v1/staff/management/organizations/:organizationId/shifts/:shiftId/force-end`; single Authorization, UUIDs, strict body, no query, no-store, operation runner; HTTP 201 follows management POST convention |
| Request | Brief 7: `{operationId: UUID, confirmation: "FORCE_END_SHIFT", reason: string}`; outer trim, nonblank, maximum 500 characters, Unicode preserved; strict |
| Response | Brief 8: `{operationId, shiftId, membershipId, locationId, status: "ENDED", startedAt, endedAt, closureKind: "ADMIN_FORCE_END", cashReconciliationState: "PENDING"}`; strict, authoritative persisted instants; no reason/cash/audit internals |
| Errors | Brief 19/27/30: existing validation 400, session 401, MFA_STEP_UP_REQUIRED 403, concealed AUTHORIZATION_DENIED 404; OPEN_TASK_HANDOFF_REQUIRED, IDEMPOTENCY_CONFLICT and new focused SHIFT_ALREADY_ENDED 409; no free text in messages |
| CA | Brief 14: current active User/exact session/member/Organization/entitlement; same-Organization Shift; fresh sensitive MFA, no target complete-coverage requirement |
| LM | Brief 15: same actor predicates plus current active grant at persisted Shift Location; no target-role/status/complete-grant requirement; replay reauthorized |
| MFA | Brief 3/16/17/26, DEC-078: existing requireMfaAssuranceInTransaction with sensitive=true and exact-session/User row lock; migration command independently rechecks exact session/factor/time and holds factor SHARE; no new MFA system |
| Shift | Brief 22–25, DEC-032: target row FOR UPDATE conflicts with self-end UPDATE and operational eligibility SHARE; Task blocker queried after lock without Task row lock |
| Operation | Brief 9/19–21: Organization+operationId unique, one closure per Shift, version/domain+org+Shift+trimmed reason+confirmation SHA-256; same fingerprint replays, changed fingerprint conflicts; fresh proof before replay |
| Persistence | Brief 9/18: shift_force_end_closures stores shift/org/actor/op/fingerprint/ended/created; restrictive composite FKs; no reason; migration 20261002005400_mgt_240f_force_end_shift; narrow SECURITY DEFINER function only |
| Audit | Brief 12/13/28/29: exactly one SHIFT_FORCE_ENDED, Shift entity, actual manager, target Location/Organization and closure time; allowlisted ACTIVE→ENDED, ADMIN_FORCE_END, PENDING, targetMembershipId, operationId, bounded reason; no Supervisor visibility |
| Cash | Brief 11: all six reconciliation columns remain NULL; self-end afterward returns existing reconciliation-unavailable error; no settlement workflow |
| Runtime | Brief 18: fixed pg_catalog,public path; PUBLIC and private helpers denied; EXECUTE only on public command; closure SELECT/DML denied; existing self-end privileges retained |

Affected entities: Shift, dedicated administrative closure and tenant AuditEvent;
existing session/factor, membership/grant, Organization/subscription/Location are
authority inputs. No Task/Dispatch or ValetSession transitions. Configuration:
none; no Company-default/Location-override policy. Approved operational MVP scope.

## Concrete lock acquisition graph (source inspection)

- MFA enrollment/state/step-up/recovery: exact session and User UPDATE locks;
  MFA user advisory (except state); factor UPDATE. Controlled recovery locks
  User before MFA user/factor. Force End reuses exact-session/User proof.
- Management staff authorization: sensitive session proof → staff-management-org
  advisory → actor membership UPDATE. Migration 050 retains this Organization
  serialization for grant writers; active LM grants/Locations use SHARE.
- Location lifecycle: lifecycle advisory → staff-org → Location UPDATE. Force
  End does not request the lifecycle advisory after staff-org. It holds row SHARE
  proof for LM Location/grant and active Organization/subscription through commit.
- Force End: session/User proof → existing management actor proof → SQL repeat
  session proof / staff-org / actor → Organization/subscription/factor SHARE →
  persisted target scope / LM grant+Location SHARE → Shift UPDATE → replay/state
  decision → plain canonical open-Task SELECT → Shift/closure/audit writes →
  admin activity → commit. The first business write follows target authority.
- Self-end: active User SHARE → owning field membership/Location SHARE → same
  Shift UPDATE → plain Task blocker → cash/Shift/audit. No manager impersonation.
- Assign: Task UPDATE → actor and target operational eligibility (lifecycle
  advisory shared + member/User/Organization/Location/grant/active Shift SHARE)
  → Task/dispatch/audit. Force End never locks Task, so no Shift→Task inversion.
- Session revoke/refresh/disable: their session/User conflicting writes wait on
  the existing proof; if their change wins, exact-session proof fails. Factor
  retirement conflicts with factor SHARE. All locks remain in one transaction.

## Structure and proof plan

Focused contract, controller, service, repository/policy/error and audit Shift
projection files stay below 300 physical lines. Extract the SHIFT projection
from the existing near-limit audit projector; do not grow its responsibility.
Provision/verify use a focused Force End privilege module wrapping existing
onboarding provisioning so the existing 300-line verifier does not grow.

Focused tests: contract strictness; real restricted-runtime HTTP/authority/replay/
cash/privacy/audit rollback; deterministic competing commit and rollback races
for self-end, assignment, grants, session and factor; LM enrollment/step-up/recovery;
054 fresh and 053→054 upgrade preservation/constraints/privileges. Existing
assurance boundary and directly relevant self-end/cash/eligibility suites retained.
Affected typechecks, changed-file lint/format, architecture, Prisma and diff checks
only. Broad root gates, builds, browser/visual suites and remote CI are deferred.

## Executed acceptance evidence

Local focused acceptance passed on 2026-10-02. This is backend acceptance for
T05-F, not full Issue #240 completion, remote CI, deployment or merge approval.
T05-G was not started. No Force End action/dialog, Force Start, Task/Session
automatic mutation, cash settlement or unrelated auth refactor was added.
Dashboard's sole change is the exhaustive existing audit catalog's EN/AR label.
Existing LM MFA production code already satisfies eligibility and ceremony;
only missing proof was added. No new MFA storage or implementation was needed.

### Proof ledger

| Area | Executed result |
| --- | --- |
| Contracts | 12 new Force End/typed audit tests plus 5 existing audit contract tests: 17 passed |
| Force End HTTP | 8 command tests, 19 authority tests, 6 scope tests, 3 audit/runtime-history tests: 36 passed |
| Force End concurrency | 8 self-end/assignment tests, 12 grant/session/factor tests, 6 operation replay tests: 26 passed |
| Transport/observability | 6 controller tests; single Authorization/no-store, bounded measurement, raw SQL detail/context discarded: passed |
| Existing LM ceremony closure | 7 tests: LM enrollment/verification/state/step-up/non-sliding refresh/recovery/re-enrollment, lower-role denial and active identity requirements: passed |
| Direct existing API regressions | 29 self-end/cash/MFA eligibility/assurance/session-race tests, 13 Shift eligibility, 5 exact assurance boundaries, 6 audit projection: 53 passed |
| Migration/runtime | 4 tests: real 053→054 upgrade and fresh 054, preserved full prior row/function snapshots, no backfill, restrictive actual cross-tenant FKs, fingerprint/uniqueness/immutability, repeat provisioning, real restricted runtime denials: passed |
| Total distinct tests | 149 passed: contracts 17, API 128, database 4. Counts exclude repeat executions |
| Typechecks | contracts, API, database and the affected Dashboard compatibility catalog: passed |
| ESLint / Prettier | Changed authored files, max warnings 0 / format check: passed. Repository Prettier ignores docs/ and Prisma/SQL have no Prettier parser |
| Architecture | Passed; no changed/new authored code exceeds 300 physical lines. Existing unrelated grandfathered warnings retained |
| Prisma / whitespace | Prisma validate and git diff --check: passed |
| Historical migrations | 001–053 unchanged against exact baseline; only 20261002005400_mgt_240f_force_end_shift added |

CA succeeds for a same-Organization Shift; LM succeeds only with the current
grant to its ACTIVE Location. Missing, foreign and outside-LM IDs are concealed.
Target owner status, role or complete grant coverage does not replace Shift
Location authority. Supervisor/Employee remain denied even after account MFA
obtained through a separate management membership. Replay denies current grant,
Location, role, membership, Organization, entitlement, User, session, factor and
freshness loss without revealing endedAt or reason.

Assurance requires the exact session's current active factor. Existing policy
tests prove sensitive age exactly 5 minutes is allowed, +1ms denied; maximum
age exactly 8 hours and idle exactly 30 minutes are denied. Refresh retains the
original MFA timestamp. The database command rechecks proof/time after acquiring
locks, then retains session/User, factor and scope locks through commit.

Each successful command writes Shift ENDED, a unique Organization/operation and
Shift closure and exactly one SHIFT_FORCE_ENDED at the same authoritative time.
All six cash columns remain NULL. Ordinary employee end retains its original
cash; self-end after forced closure returns SHIFT_CASH_RECONCILIATION_UNAVAILABLE.
An explicitly retried unknown result with identical canonical payload returns
the original result. Changed payload or another Shift at the same Organization
operation conflicts; a different operation at an ended Shift is SHIFT_ALREADY_ENDED.
The same UUID at a different Organization is independent. No automatic POST retry.

Commit and rollback were exercised in both acquisition orders for self-end,
assignment, grant loss, session revoke and factor retirement. Real command
executors and separate PostgreSQL connections were used for operational races;
proof-loss writers use actual database writes and the canonical grant-lock
boundary. A commit barrier holds the actual executor's transaction and locks;
pg_stat_activity confirms the competitor waits. Force End never locks Task rows.
Assignment winning commit produces OPEN_TASK_HANDOFF_REQUIRED; assignment rollback
permits closure. Closure winning commit fences new assignment; closure rollback
permits it. Identical/conflicting operation races also cover commit and rollback.

Audit metadata is exactly fromStatus, toStatus, closureKind,
cashReconciliationState, targetMembershipId, operationId and bounded reason.
Actor is the actual manager, entity is Shift, valet_session_id is absent, scope
is the target Organization/Location. Authorized CA/LM typed audit returns the
reason as text; Supervisor excludes the entire event. Command response, error,
operation observer and cursor assertions exclude it. Unknown SQL exceptions are
stripped of raw message/detail/context before transport/telemetry. Audit failure
rolls back Shift, closure and admin activity. Forced history rejects runtime
status/cash rewriting, and the audit guard rejects a forged Force End event.

Only public.staff_shift_force_end(uuid,uuid,text,uuid,uuid,uuid,text,text,text)
is executable by runtime. Its owner differs from runtime; SECURITY DEFINER uses
fixed search_path=pg_catalog, public. PUBLIC execution and private history/audit
helper execution are denied. Runtime closure SELECT/INSERT/UPDATE/DELETE/TRUNCATE
and any column access are denied. Repeat provisioning verifies these ACLs and
retains prior onboarding, MFA, management and self-end grants.

### Exact focused commands

PostgreSQL commands load the existing root .env without printing credentials:

```powershell
$env:DOTENV_CONFIG_PATH=(Resolve-Path '.env').Path
```

Every API group below was passed through this repository-owned command prefix:

```text
pnpm --filter @valet/api exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs
```

1. test/staff-shift-force-end.integration.test.ts test/staff-shift-force-end-authority.integration.test.ts — 26 passed before adding the Location loss case.
2. test/staff-shift-force-end-proof-races.integration.test.ts test/staff-shift-force-end-replay-races.integration.test.ts — 18 passed.
3. test/staff-mfa-lm-closure.integration.test.ts test/staff-shift-force-end-work-races.integration.test.ts test/shift-end.integration.test.ts test/shift-cash-reconciliation.integration.test.ts test/shift-eligibility.integration.test.ts test/staff-mfa-eligibility.integration.test.ts test/staff-mfa-assurance.integration.test.ts test/staff-mfa-session-races.integration.test.ts test/mfa-assurance-policy.test.ts — operational 8 and regressions 47 passed; corrected LM fixture was verified separately.
4. test/staff-mfa-lm-closure.integration.test.ts test/staff-shift-force-end-audit.integration.test.ts test/staff-shift-force-end-controller.test.ts test/management-audit-projection.test.ts — PostgreSQL LM/audit 10 passed; corrected audit catalog was verified separately.
5. test/staff-shift-force-end-controller.test.ts test/management-audit-projection.test.ts — 12 passed.
6. test/staff-shift-force-end-authority.integration.test.ts test/staff-shift-force-end-scope.integration.test.ts — scope 6 passed; corrected Location fixture was verified separately.
7. test/staff-shift-force-end-authority.integration.test.ts test/shift-end.integration.test.ts test/shift-cash-reconciliation.integration.test.ts test/staff-mfa-eligibility.integration.test.ts test/staff-mfa-assurance.integration.test.ts test/staff-mfa-session-races.integration.test.ts — final authority 19 plus existing regressions 29: 48 passed.

```text
pnpm --filter @valet/contracts exec vitest run src/staff-shift-force-end.test.ts src/management-audit.test.ts
pnpm --filter @valet/database exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-force-end-migration.integration.test.ts
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/database typecheck
pnpm --filter @valet/dashboard typecheck
pnpm --filter @valet/database exec node -r dotenv/config node_modules/prisma/build/index.js validate
pnpm architecture:check
git diff --check
```

Changed-file lint/format use this exact manifest, not root gates:

```powershell
$files=@(git diff --name-only) + @(git ls-files --others --exclude-standard)
$authored=@($files | Where-Object { $_ -match '\.(ts|tsx|mjs|mts)$' })
pnpm exec eslint @authored --max-warnings=0
pnpm exec prettier --check @authored
```

Normal dependency reads returned sandbox EPERM; approved escalation was used
for installed pnpm dependency links. Git metadata writes also required approved
escalation. One attempted overlapping test invocation was rejected by the cluster
lease before tests; subsequent PostgreSQL commands were serial. The initial new
migration fixture exceeded poolCount=2; it now closes the fresh inspection pool
before opening runtime. Neither was a product timeout/hang or repeated debug loop.
Existing Windows DEP0190 warnings from unchanged fixture spawning were retained.

Deterministic development failures were corrected, not hidden: ambiguous
PL/pgSQL Task location_id; missing Prisma composite uniqueness/reverse relations;
test typing/declaration errors; LM recovery test falsely expecting cleared factor
ID and subsequently using the wrong table name; existing event-catalog count and
reason policy expectations; Location test fixture omitting intake closure.
No production MFA behavior was changed to satisfy an incorrect test. An initial
Prisma format invocation omitted env loading; corrected invocation succeeded.
Unrelated schema formatting was removed, then the final focused schema validated.

Skipped by explicit owner instruction: root lint/typecheck/tests, all PostgreSQL,
Dashboard E2E, production build, visual matrix and remote CI. No timeout increases,
race weakening, skipped tests or architecture-baseline changes were introduced.

## Hostile diff review

Review target: exact baseline SHA → current intentional T05-F diff, including
untracked new files. Checked AGENTS, Accepted DEC-032/078/081/082, owner-locked
plan/brief, schema/security/structure/Definition of Done and source helpers.

- Findings: no unresolved BLOCKER, MAJOR or MINOR in the reviewed task scope.
- Security/tenant/location: operation-specific current proof precedes the first
  Shift write and replay disclosure, independently repeated in narrow SQL.
- Retry/concurrency/DB: Organization/operation identity, canonical fingerprint,
  Shift exclusivity, restrictive composite FKs and actual commit/rollback proof.
- Abstractions: existing exact-session assurance and transaction boundary reused;
  no staff-target complete-coverage helper or session-specific audit impersonation.
- Audit/privacy: append-only actual manager event, protected reason, atomic rollback,
  no arbitrary metadata/body logging; projection tests reflect the accepted reason
  exception only for SHIFT_FORCE_ENDED.
- Downstream: strict shared contract and reusable service boundary are available
  for T05-G; no UI action/unknown-result flow was implemented in this slice.
- Architecture: focused extracted Shift audit and runtime ACL responsibilities;
  all changed/new authored code stays <=300 without baseline exceptions.
- Test adequacy: 149 distinct focused tests passed, covering negative, replay,
  race, actual runtime privilege and versioned migration boundaries above.
- Scope leakage/internal consistency: 47 intentional files; no dependency change,
  historical migration rewrite, Force Start, settlement or Task/Session mutation.
- Gate evidence: local focused/runtime/failure verification only. Remote CI,
  deployment and cumulative T05-G acceptance were not claimed.
- Review verdict: CLEAN TO MERGE for reviewed code; actual merging remains
  unauthorized and subject to repository CI/human cross-review requirements.

## Changed-file manifest and physical line counts

Exact intentional manifest: 47 files. Physical line counts below apply to
authored TS/TSX/MJS/MTS; docs, Prisma schema and migration SQL are exempt.
Commit and matching remote SHA are reported in the final delivery after push.

| File | Authored physical lines |
| --- | --- |
| apps/api/src/common/http/api-errors.ts | 229 |
| apps/api/src/common/http/api-exception.filter.ts | 293 |
| apps/api/src/common/http/staff-shift-force-end-operation-routes.ts | 7 |
| apps/api/src/modules/management/management-audit-detail-projection.ts | 272 |
| apps/api/src/modules/management/management-audit-event-catalog.ts | 171 |
| apps/api/src/modules/management/management-audit-projection.ts | 118 |
| apps/api/src/modules/management/management-audit-shift-projection.ts | 26 |
| apps/api/src/modules/management/management.module.ts | 107 |
| apps/api/src/modules/management/staff-shift-force-end-errors.ts | 41 |
| apps/api/src/modules/management/staff-shift-force-end-policy.ts | 22 |
| apps/api/src/modules/management/staff-shift-force-end-repository.ts | 61 |
| apps/api/src/modules/management/staff-shift-force-end.controller.ts | 73 |
| apps/api/src/modules/management/staff-shift-force-end.service.ts | 44 |
| apps/api/test/management-audit-projection.test.ts | 210 |
| apps/api/test/staff-mfa-lm-closure.integration.test.ts | 187 |
| apps/api/test/staff-shift-force-end-audit.integration.test.ts | 100 |
| apps/api/test/staff-shift-force-end-authority.integration.test.ts | 199 |
| apps/api/test/staff-shift-force-end-controller.test.ts | 136 |
| apps/api/test/staff-shift-force-end-proof-races.integration.test.ts | 132 |
| apps/api/test/staff-shift-force-end-race-fixture.ts | 66 |
| apps/api/test/staff-shift-force-end-replay-races.integration.test.ts | 78 |
| apps/api/test/staff-shift-force-end-scope.integration.test.ts | 104 |
| apps/api/test/staff-shift-force-end-test-fixture.ts | 147 |
| apps/api/test/staff-shift-force-end-work-races.integration.test.ts | 183 |
| apps/api/test/staff-shift-force-end.integration.test.ts | 202 |
| apps/dashboard/src/features/audit/audit-event-copy.ts | 247 |
| docs/03_DATABASE_SCHEMA.md | — |
| docs/06_SECURITY_AND_DATA_RULES.md | — |
| docs/08_DECISIONS_LOG.md | — |
| docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md | — |
| docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md | — |
| docs/validation/ISSUE_240F_LM_MFA_FORCE_END_BACKEND.md | — |
| packages/contracts/src/index.ts | 65 |
| packages/contracts/src/management-audit-events.ts | 103 |
| packages/contracts/src/management-audit.test.ts | 124 |
| packages/contracts/src/management-audit.ts | 279 |
| packages/contracts/src/staff-shift-force-end.test.ts | 87 |
| packages/contracts/src/staff-shift-force-end.ts | 36 |
| packages/database/prisma/migrations/20261002005400_mgt_240f_force_end_shift/migration.sql | — |
| packages/database/prisma/schema.prisma | — |
| packages/database/scripts/runtime-table-privileges.mjs | 275 |
| packages/database/scripts/shift-force-end-runtime-privileges.d.mts | 17 |
| packages/database/scripts/shift-force-end-runtime-privileges.mjs | 78 |
| packages/database/scripts/verify-runtime-table-privileges.mjs | 298 |
| packages/database/src/migration-manifest.ts | 56 |
| packages/database/src/shift-force-end-migration-test-fixture.ts | 209 |
| packages/database/src/shift-force-end-migration.integration.test.ts | 189 |
