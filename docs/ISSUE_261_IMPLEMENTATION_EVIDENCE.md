# Issue #261 — implementation evidence and deployment handoff

Date: 2026-10-03. Owner-approved code/focused-validation pass only.
Base: `a203ab895bb56b4c71c78ff0a0b7a950b9e26b3e` (verified clean main).
Branch: `fix/261-native-pre-custody-cancellation`.
Contract: [DEC-098](decisions/DEC-098_PRE_CUSTODY_PARKING_CANCELLATION.md).
Physical proof: **DEFERRED** to the owner batch gate. Issue closure is not authorized.

## Contract and mutation-order ledger

| Proposition | Accepted authority | Implemented boundary / evidence |
| --- | --- | --- |
| Opening/accepting is pre-start; explicit Start Parking remains custody boundary | Owner U261-L; DEC-098 lifecycle | Native Task and completed Check-In entry; entry tests assert no Start Parking call; existing Start Parking command/atomicity regressions |
| Completed intake AWAITING_PARKING plus exact QUEUED/ASSIGNED/ACCEPTED Parking Task terminate together | DEC-098 lifecycle/atomicity | `cancel-before-parking-command.ts`; all three source-state tests |
| No IN_PROGRESS cancellation, no resource release or fabricated history | DEC-098 lifecycle | Authorization physical-fact/history guards; guards tests; forward 057 constraint |
| Queued original intake owner; assigned/accepted current Task owner; supervisor self only | Owner U261-A; DEC-098 authority | `authorizeParkingCancellation`; command, guards and HTTP tests |
| Current active user/membership/role/company/location/grant and exact active Shift | DEC-098 authority/locks | Existing `lockShiftOperationalEligibility` held through commit; seven persisted-authority race dimensions |
| Dual CAS and original exact replay; protected terminal reads | Owner U261-T; DEC-098 transport/history | Command versions and `coherentParkingCancellation`; exact status query and HTTP tests |
| One transaction/time/version increment and one of each event | DEC-098 atomicity | Existing transaction, clock and audit/Dispatch writers; rollback and duplicate race tests |
| Ambiguous outcome uses exact GET; safe current versions require explicit reconfirmation | DEC-098 Native workflow | Strict transport and cancellation session; one-POST, malformed/lost response and explicit retry tests |
| Generation, scope, Shift, selection and A-B-A retirement fence late results | DEC-098 Native workflow | Cancellation session/runtime and monotonic Parking workflow revision; entry/runtime/client tests |
| Existing terminal consumers reject/exclude without inventing visits/revenue | DEC-098 consumers | Real cancellation consumer and financial tests below |
| Typed safe Management Audit projection with EN/AR labels | DEC-098 audit | Known event/catalog/copy; supervisor-visible real event projection test |
| DEC-097 remains incomplete-intake, no-Task only | DEC-098 amendment boundary; DEC-097 | Existing cancellation regression plus forward-migration compatibility |

Protected write trace:

1. Controller checks the single Authorization header, resolves the existing staff principal, validates strict path/body/query contracts.
2. `authorizeParkingCancellation` discovers the exact persisted session/Parking Task/member relationship without writing. Foreign/mismatched targets are concealed.
3. Existing Location lifecycle SHARED advisory guard; scoped session `FOR NO KEY UPDATE`; exact scoped Task `FOR UPDATE`.
4. Persisted Task/intake ownership, existing eligibility `FOR SHARE` proof and exact expected Shift; physical fields/history examined while transaction remains open.
5. Command proves terminal history for replay, otherwise verifies both versions and accepted source/fact predicates.
6. The **first protected write** is `UPDATE tasks` in `createCancelBeforeParkingCommandExecutor`, after all authority and source proofs. Then guarded session update, Dispatch append, custody Audit append, commit. No authorization by mutation/RETURNING.
7. Status/replay execute the same current authority proof and exact historical event checks; queue absence is never a success predicate.

No new schema entity, arbitrary state endpoint, field override, provider, configuration setting, index, enum, grant or replay table. Backend rules remain reusable independently of HTTP and Native presentation. Typed Company/Location policy precedence is unaffected.

## Concurrency evidence and falsification

Tests use repository `cancellationSqlBarrier`, separate real PostgreSQL transactions and `pg_blocking_pids`; no timing sleeps.

| Interaction | Evidence |
| --- | --- |
| Cancel vs explicit Start Parking | Both commit winner orders plus Start rollback; winner truth and losing failure preserved |
| Duplicate cancellation | Same result after committed winner; rollback permits other winner; exactly one of each event |
| Accept / Reassign / queue regeneration | Both winner orders against real existing commands; versions/owner/terminal guards converge |
| Actual End Shift vs queued cancellation | Both winner orders; cancellation-first permits End Shift, Shift-first commits ENDED and cancellation is concealed |
| User, membership, role, grant, Shift, Organization, Location loss | Both winner orders; persisted authority changes block through cancellation commit or win before its first write |
| Assigned Task Shift blockers / independent Location blockers | Real End Shift command and existing Location blocker function; other Task/session and active Shift remain blockers |

The initial session `FOR UPDATE` was falsified by a real `40P01`: cancellation session -> Task conflicted with Accept/Reassign Task -> session KEY SHARE needed by event foreign keys. No referenced key changes here, so the scoped session lock was narrowed to `FOR NO KEY UPDATE`. It serializes session state writes while permitting those FK checks. Deterministic commit/rollback and both-order race tests pass with this fix; no deadlock retry or timeout widening hides it.

Authority-loss tests intentionally exercise persisted fact writes; they do not claim full administrative deactivate/force-end endpoint acceptance. Location lifecycle guard reuse was reviewed against its existing EXCLUSIVE-before-drain protocol.

## Terminal consumer evidence

- Guest: issue access before real cancellation; stored credential/history retained; resolve, retrieval, payment, tip, handoff, rating and subsequent issuance deny terminal session. No fabricated revocation.
- Active Vehicles and Task queue: exclude exact cancelled pair. Queue creation rejects regeneration. Historic terminal Task remains readable only through the authorized exact reconciliation boundary.
- Shift / Location: terminal Task no longer blocks End Shift. Other active Task still blocks. Cancelled pair does not block Location drain; active Shift and unrelated awaiting session independently do.
- Incidents: existing operational mutation rejects terminal session; retained historical records are not erased.
- Financial / KPI: existing unpaid Payment remains unchanged; real completed Check-In still counts as intake; handled/parking/handoff success stay zero, no financial revenue cohort and no rating. Completed-visit/returning-contact positive COMPLETED predicates were reviewed; they were not broadened and no separate contact-history suite was run.
- Management Audit: one correctly scoped SESSION-family event is visible to self supervisor via the existing safe projection, without raw metadata or Shift ID.

## Focused tests executed

Only selected files were invoked. Counts below are unique passing tests, not sums of repeated repair runs.

| Package | Selected files / tests | Result |
| --- | --- | --- |
| API new cancellation | command 11; races 8; authority races 7; HTTP 1; consumers 3; financial 1; guards 4 | 35 pass |
| API existing directly affected regressions | DEC-097 cancellation 7; Start Parking command 13; atomicity 11; Dispatch lifecycle 6; queue 6 | 43 pass |
| Database | new fresh/from-056 migration 2; DEC-097 migration compatibility 3 | 5 pass |
| Contracts | strict cancellation schemas | 2 pass |
| Employee client | cancellation session 10, transport 2, queue fence 1; existing queue lifecycle 9 and Parking Start session 15 | 37 pass |
| Native entry / pre-start | Task action 11, completed Check-In entry 6, Parking Start 13, Check-In step 3 | 33 pass |
| Native cancellation / fences | UI 6, accessibility 1, runtime 3, entry fences 4 | 14 pass |
| Native existing lifecycle | production lifecycle owner/authority and Issue #255 lifecycle | 21 pass |
| Native frozen presentation | Tasks, active Parking and Check-In completion | 16 pass |

Total: **206 unique passing tests in 34 explicitly selected files**. No full-package/root test suite, full local CI, APK build or physical acceptance was run.

Commands used, with explicit file selection:

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/<selected>.integration.test.ts [...]
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/<selected>.integration.test.ts [...]
pnpm --filter @valet/contracts exec vitest run src/cancel-before-parking.test.ts
pnpm --filter @valet/employee-client exec vitest run src/<selected>.test.ts [...]
pnpm --filter @valet/valet-native exec vitest run test/<selected>.test.ts[x] [...]
pnpm --filter <affected-package> typecheck
node node_modules/eslint/bin/eslint.js <60 changed TS/TSX paths> --max-warnings=0
node node_modules/prettier/bin/prettier.cjs --check <60 changed TS/TSX paths>
git diff --check
```

Database runs used only task-owned disposable Docker PostgreSQL 17, container `valet-platform-issue261-test`, localhost port 55461, repository harness-owned databases/roles. Existing port-5432 service was not mutated. API/database runs were serialized on this cluster. The harness reported cleanup of its databases, roles and children. The task-owned container was removed after validation, with its ownership label verified.

Fresh path applies all 57 immutable migrations; upgrade seeds representative real-shaped rows at 056 and applies 057. Tests compare final CHECK shapes, retain incomplete CANCELLED/completed awaiting intake plus Guest credential/audit data, reject physical/resource facts, and verify runtime table ACL/function signatures do not drift. Existing migration test now explicitly selects its historical 054 baseline instead of fragile slices relative to current manifest length.

Early failures were investigated rather than masked: default local DB credential mismatch led to disposable task DB; fixture enum/duplicate credential construction and HTTP test typing/unused-variable defects were corrected; the real lock-cycle failure above changed the narrow lock; old Native test expectations/hooks were updated for pre-start semantics. A concurrent DB invocation was refused by the harness ownership lease and did not execute tests. Passing tests were rerun only after affecting changes; no timeout increase or retry loop was introduced.

## Typecheck, lint and structure limits

- Contracts, employee-client, API, database and dashboard typechecks: PASS.
- Native typecheck: **FAIL, pre-existing only**. Exact base archive and current source were compiled using the same installed TypeScript/dependencies. After normalizing their path prefixes, diagnostic text matches exactly: **five diagnostics in four untouched timezone fixtures**. No introduced diagnostic. These fixtures remain outside Issue #261 scope.
- Baseline diagnostic locations: `native-incident-recovery-context.test.ts:36`, `native-push-route-denial.test.ts:35`, `native-push-route-lifecycle.test.ts:207`, `native-shift-retirement.test.ts:40` and `:41`.
- Changed-file ESLint: PASS, zero warnings across 60 TS/TSX files (not described as a full package/root lint run).
- Changed authored-code physical lines: all <=300; `native-auth-runtime.ts` is 300 and `employee-parking-start-session.ts` is 296. Narrow existing result-identity guard extraction retains behavior and avoids growing a 300-line file.
- No dependency/lockfile or historical migration changes, architecture-baseline exception or compressed formatting. Full-root architecture collection was deliberately excluded because the owner forbids inspection of Employee Web.

## UI freeze proof and limits

Twelve selected frozen presentation paths compare byte-for-byte through Git diff against verified main: Tasks panel/card/row and styles, active Parking panel/styles, Parking confirmation panel/styles, pre-start styles, Check-In Parking step and styles. No appearance/style/typography/theme token edits. Existing Tasks/active Parking/Check-In presentation tests pass.

Allowed deltas only: stop implicit Start Parking; truthful Open Parking copy; existing pre-start Cancel Service action; existing-pattern confirmation and narrow state feedback; busy/disabled/Back fences; optional focus refs/onShow on existing controls. Focus lands on title/explanation, keeping interactive buttons separate. Existing callers retain their layout and labels. No Tasks card, active Parking geometry or navigation layout change.

Cancellation render tests cover EN Light, EN Dark, AR RTL Light and AR RTL Dark, exact meaning/labels, busy/disabled state and identical Light/Dark geometry tokens. Focus entry/return and uncertainty/conflict announcement paths pass mocked Native checks. This is source/render evidence, not screenshot, real TalkBack or device proof. Font wrapping and physical touch/focus behavior remain in the deferred owner batch gate.

## Deployment and controlled legacy remediation requirement

1. Deploy forward migration 057 and compatible API before enabling the Native action. Old clients may still have the historical auto-start behavior until updated; coordinate Native rollout accordingly.
2. No rollback/backfill is supplied that rewrites completed-intake CANCELLED into a false incomplete or physical state. Any downgrade requires a separately reviewed compatibility decision.
3. Legacy PARKING/IN_PROGRESS rows remain ineligible, including historically false starts. Existing timestamps/resource/custody facts cannot establish what physically happened by themselves.
4. For any reported false start, an authorized operator must establish actual vehicle/key custody, assignment and resources in the real operation before a separately approved repair. Preserve all evidence and before/after actor, reason and time through append-only history; do not delete, mass-reset or expose it as Cancel Service.
5. No legacy remediation command, override, automatic data rewrite or generic IN_PROGRESS cancellation is implemented. Separate follow-up approval and protected/audited repair design are required.

## Self-review using the VAYLET code-review skill

1. **Review target:** actual working diff/new files against base above, Issue #261 only; reviewed before commit.
2. **Decision/docs checked:** owner packet and merged Native plan; Accepted DEC-034/035/036/097/098; relevant binding domain/schema/state/security/engineering/structure/workflow/Definition of Done.
3. **Findings:** no unresolved implementation blocker found. Notes: Native baseline typecheck failure and deferred physical/CI evidence remain. Initial lock-cycle, accessibility focus grouping and completed Check-In late-authority risks were corrected with focused evidence.
4. **Security & tenant/location:** PASS for reviewed path and focused tests; authority derives from persistence before any protected write, same proof on status/replay.
5. **Retry/concurrency & DB:** PASS for tested interactions; dual CAS/coherent history, append-only transaction, database migration guards. No blanket claim for all administrative endpoints.
6. **Abstraction compatibility:** PASS; existing scoped custody/Dispatch writers and eligibility helper fit exact session ownership and transaction contract, with no fake values or generic widening.
7. **Audit/privacy:** PASS; narrow metadata, no reason/PII/credential output, safe Management Audit projection, retained history.
8. **Downstream consumer:** PASS for terminal consumers exercised/reviewed above; no future Tasks/GPS/other issue work.
9. **Architecture/300-line:** PASS for all changed authored files; full-root check excluded by owner scope.
10. **Test adequacy:** focused local evidence covers required new path and bounded regressions; physical/CI acceptance unverified.
11. **Scope leakage:** PASS; Employee Web, dependency changes, unrelated feature/refactor and remediation excluded.
12. **Gate evidence:** local focused tests/checks only; Native baseline failure recorded. No actual CI or production readiness claim.
13. **Merge verdict:** **BLOCK MERGE** until required repository CI/human cross-review and acceptance gates are satisfied. This verdict does not block the owner-authorized focused branch push for review.

## Changed-file inventory

The inventory below is the complete owned implementation set, including this evidence file.

```text
apps/api/src/modules/management/management-audit-event-catalog.ts
apps/api/src/modules/parking/cancel-before-parking-authorization.ts
apps/api/src/modules/parking/cancel-before-parking-command.ts
apps/api/src/modules/parking/cancel-before-parking-history.ts
apps/api/src/modules/parking/cancel-before-parking-status-query.ts
apps/api/src/modules/parking/cancel-before-parking-types.ts
apps/api/src/modules/parking/cancel-before-parking.controller.ts
apps/api/src/modules/parking/cancel-before-parking.service.ts
apps/api/src/modules/parking/start-parking.module.ts
apps/api/test/cancel-before-parking-authority-races.integration.test.ts
apps/api/test/cancel-before-parking-consumers.integration.test.ts
apps/api/test/cancel-before-parking-financial.integration.test.ts
apps/api/test/cancel-before-parking-guards.integration.test.ts
apps/api/test/cancel-before-parking-http.integration.test.ts
apps/api/test/cancel-before-parking-races.integration.test.ts
apps/api/test/cancel-before-parking-test-context.ts
apps/api/test/cancel-before-parking.integration.test.ts
apps/dashboard/src/features/audit/audit-event-copy.ts
apps/valet-native/src/auth/native-auth-runtime.ts
apps/valet-native/src/check-in/native-check-in-copy.ts
apps/valet-native/src/employee-ui/employee-controls.tsx
apps/valet-native/src/parking/native-completed-check-in-parking.ts
apps/valet-native/src/parking/native-parking-cancellation-controls.tsx
apps/valet-native/src/parking/native-parking-cancellation-copy.ts
apps/valet-native/src/parking/native-parking-cancellation-runtime.ts
apps/valet-native/src/parking/native-parking-start-panel.tsx
apps/valet-native/src/shell/native-production-back-handler.ts
apps/valet-native/src/shell/native-production-lifecycle-owner.ts
apps/valet-native/src/shell/native-production-shell.tsx
apps/valet-native/src/shell/native-production-workspace.tsx
apps/valet-native/src/shell/native-workflow-scope-retirement.ts
apps/valet-native/src/shift/native-shift-retirement.ts
apps/valet-native/src/tasks/native-task-action-sequence.ts
apps/valet-native/src/vehicles/native-check-in-cancel-sheet.tsx
apps/valet-native/test/issue-261-cancellation-accessibility.test.tsx
apps/valet-native/test/issue-261-cancellation-runtime.test.ts
apps/valet-native/test/issue-261-cancellation-ui.test.tsx
apps/valet-native/test/issue-261-entry-fences.test.ts
apps/valet-native/test/native-check-in-parking-task-step.test.tsx
apps/valet-native/test/native-completed-check-in-parking.test.ts
apps/valet-native/test/native-parking-start.test.tsx
apps/valet-native/test/native-task-action-sequence.test.ts
docs/02_DOMAIN_MODEL.md
docs/03_DATABASE_SCHEMA.md
docs/04_VALET_SESSION_STATE_MACHINE.md
docs/08_DECISIONS_LOG.md
docs/decisions/DEC-098_PRE_CUSTODY_PARKING_CANCELLATION.md
docs/ISSUE_261_IMPLEMENTATION_EVIDENCE.md
packages/contracts/src/cancel-before-parking.test.ts
packages/contracts/src/cancel-before-parking.ts
packages/contracts/src/index.ts
packages/contracts/src/management-audit-events.ts
packages/database/prisma/migrations/20261003005700_pre_custody_parking_cancellation/migration.sql
packages/database/src/check-in-cancellation-migration.integration.test.ts
packages/database/src/migration-manifest.ts
packages/database/src/pre-custody-cancellation-migration.integration.test.ts
packages/employee-client/src/employee-operational-session.ts
packages/employee-client/src/employee-parking-cancellation-queue.test.ts
packages/employee-client/src/employee-parking-cancellation-session.test.ts
packages/employee-client/src/employee-parking-cancellation-session.ts
packages/employee-client/src/employee-parking-cancellation-transport.test.ts
packages/employee-client/src/employee-parking-cancellation-transport.ts
packages/employee-client/src/employee-parking-cancellation-types.ts
packages/employee-client/src/employee-parking-start-recovery.ts
packages/employee-client/src/employee-parking-start-session.ts
packages/employee-client/src/employee-task-queue-owner.ts
packages/employee-client/src/index.ts
```
