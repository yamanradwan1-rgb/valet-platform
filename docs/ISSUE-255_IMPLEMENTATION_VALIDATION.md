# Issue #255 implementation and validation record

Date: 2026-10-03
Branch: `feat/VAL-255-incomplete-checkin-drafts`
Starting origin/main and implementation base: `2ce32445a289ed803366834fa8e1f7e80ab20818`
Implementation authority: merged 47-section plan, implementation prompt, U-001–U-007 lock, and owner's section-49 Guest clarification.
Accepted contract: [DEC-097](decisions/DEC-097_INCOMPLETE_CHECK_IN_CANCELLATION.md).
Final delivered commit SHA: the post-commit execution report contains the verified full SHA and remote-ref match. This committed record cannot embed its own content-addressed commit SHA.

Code implementation is complete for owner review. All scoped tests pass; broad baseline failures and unperformed release gates are recorded below. No PR or merge is authorized. No physical acceptance, remote CI pass or production readiness is claimed.

## Implemented behavior and request budget

- Only CHECKING_IN -> CANCELLED is added. CANCELLED is retained terminal history without physical completion/release, completed visit, rating or active custody meaning. No outgoing transition, hard delete, fake Task, cancellation table/columns, second version or expiration job.
- Continue and Cancel are self-owned for VALET_EMPLOYEE and VALET_SUPERVISOR. ACTIVE User, Organization, Location, membership, explicit exact Location grant and ACTIVE exact Location Shift are authoritative. Supervisor list visibility grants no other-owner action. Company Admin/Location Manager gain no cancellation override.
- Cancel/status resolve persisted scope, acquire the existing shared Location lifecycle lock, authorize actor, require intake membership equality, hold current Shift eligibility locks and compare expectedShiftId, then lock the scoped session and recheck ownership. These proofs precede protected mutation and terminal disclosure.
- POST /v1/staff/check-in/sessions/:sessionId/cancel accepts only expectedVersion/expectedShiftId. GET the sibling cancel-status accepts only expectedShiftId. Both return only sessionId/locationId/state/version, use current authority and no-store, and follow existing validation/error infrastructure.
- Precedence is authorization; coherent authorized CANCELLED convergence; otherwise VERSION_CONFLICT; then state/custody/Task invariants. Guarded state/version update and one VALET_SESSION_CHECK_IN_CANCELLED event commit atomically, using one database timestamp. Audit actor/scope/entity and four lifecycle metadata fields are server-derived. Audit failure rolls back all changed facts.
- Existing condition completion, notes/photos, Vehicle/contact/Incident/financial facts and Guest credentials remain historical facts. Cancel creates no GUEST_ACCESS_REVOKED. Terminal condition evidence rejects even replay paths; existing non-cancelled child behavior is retained.
- Vehicles is one capped list. The same query prioritizes the actor's CHECKING_IN candidates before unrelated rows under the 100-row cap, then displays the selected page in existing newest-first/id ordering. More than 100 owned drafts remains explicitly truncated. No second draft list, duplicate row, per-row detail fan-out or polling.
- Only Native explicitly negotiates check-in-actions-v2. It adds canContinueCheckIn/canCancelCheckIn presentation hints. Legacy and visibility-v1 retain exact shapes/masking. Portable directory transport defaults to v1; hints never authorize writes.
- Continue performs one exact authorized staff detail GET, checks selected id/Location/CHECKING_IN, hydrates persisted Vehicle/condition/version and only then enters the prepared existing Check-In route. No draft/continuation discovery, startNew or intake mutation. Close/Back returns to Vehicles and refreshes once when the original owner is current.
- Cancel preparation performs one exact detail GET. Explicit confirmation performs at most one POST in flight. Known success performs one directory refresh. No automatic POST retry, operationId, durable intent, outbox or background sync.
- Lost/malformed post-dispatch response stays unknown. One authorized exact status GET establishes terminal success, original CHECKING_IN version for a fresh user confirmation, or changed truth conflict. Unavailable status remains unknown. Directory absence is never success evidence. Foreground recovery verifies current operational authority, coalesces one status read and avoids duplicate success refresh.
- Request counts above are logical feature calls under stable authentication. Existing EmployeeClient may retry one safe GET after a 401 authorization refresh; it never retries a POST. No feature adds polling or per-row reads.
- Full auth generation/Organization/membership/Location/Shift/role and attempt revision fence preparation, mutation response, reconciliation and Continue hydration, including A -> B -> A. Background invalidates reads and preserves dispatched intent as unknown; logout/authority retirement purges transient intent. Process death cannot replay because nothing is persisted.

## Terminal consumer compatibility inventory

| Consumer | Final contract / evidence |
| --- | --- |
| Canonical schema/contracts | Prisma and Staff canonical enum include CANCELLED; focused strict cancel/status DTOs. Guest enum/schema unchanged. Dispatch and directory active enums explicitly exclude CANCELLED. |
| Active Location/Vehicle identity | Forward partial indexes exclude COMPLETED and CANCELLED. Vehicle identity competing query does the same. Non-null key/spot uniqueness stays unchanged; terminal CHECK forbids retaining custody/resources. |
| Location drain | SQL security-definer blocker function and readiness projection exclude both session terminals; independent ACTIVE Shift and active Task blockers remain. Function ACL/security/search path preserved on upgrade. |
| Vehicles/drafts/continuations/detail | Directory excludes both terminals; discovery uses existing positive states and remains non-resumable. Normal operational terminal detail remains non-disclosing. Own-draft priority solves bounded coverage. |
| Physical Dashboard context | Existing physical resource and key operational queries exclude both terminals; no Dashboard resource UI changes. |
| Financial/overview/visits | Operational financial projection excludes both custody terminals, underlying financial facts remain. Existing positive COMPLETED counts/KPI/contact-returning semantics remain. Authorized historical visit association schema truthfully permits CANCELLED without completedAt. |
| Task/parking/retrieval/handoff/release | Existing positive state guards stay narrow; no terminal Task projection or lifecycle widening. |
| Incidents | New creation rejects both terminal states; retained Incidents stay independent. Native reports cannot open a cancelled session. No incident workflow redesign. |
| Guest bearer | Normal and locked resolution reject CANCELLED with GUEST_ACCESS_INVALID before projection; actual retrieval request/cancel, payment projection/tip and handoff commands reject the same credential. |
| Staff Guest issuance | ISSUE_OR_ROTATE / REISSUE_REVOKED reject CANCELLED with GUEST_ACCESS_INTENT_CONFLICT after authoritative scope/auth/session lock, before token generation, mutation or audit. Explicit revoke stays idempotent and independent. |
| Audit | CHECK_IN catalog and existing Supervisor allowlist include VALET_SESSION_CHECK_IN_CANCELLED. Strict safe lifecycle projection and existing Dashboard Audit EN/AR labels carry CANCELLED. No other Dashboard UI change. |

## Migrations and real database proof

- 055: `20261003005500_check_in_cancelled_enum`, standalone enum value addition.
- 056: `20261003005600_check_in_cancelled_terminal`, active predicates, intake-only terminal CHECK and existing drain function replacement.
- All historical migrations are unchanged; manifest has 56. No dependency, runtime grants or new privileges.
- Fresh full history and actual 054 -> 055 -> 056 SQL upgrade preserve session, credential and audit canaries byte-for-byte; indexes/checks/function definitions match; ACL is unchanged. Independent Shift and Task drain blockers remain.
- Real API fixtures deploy all versioned migrations and provision restricted runtime roles; domain/HTTP/race commands use that runtime pool.
- Historical 053 -> 054 force-end proof is pinned to its actual migration target, so adding later migrations cannot silently alter that historical assertion. Its four runtime/provision tests pass. Existing lifecycle fresh-index expectations and latest schema-migration assertion reflect 056.
- Three new migration tests pass, four existing Location migration tests pass, four historical force-end migration tests pass. Broad database schema: 420/421 pass; the Audit required-field expectation fails with existing 42501 rather than 23502. The new upgrade canary explicitly exercises the same seven invalid inputs before and after 055/056 and verifies identical error codes, including 42501.

## Test execution evidence

Environment: Windows, Node 24.19.0, existing pnpm 10.34.5 dependencies, local PostgreSQL 17.11. Owned harness classification/resource profiles were used for database tests; all completed owned runs report zero owned databases, roles and child processes left over. No timeout increase or privilege broadening was used.

| Gate | Actual evidence |
| --- | --- |
| Contracts | `node ../../node_modules/vitest/vitest.mjs run src --maxWorkers=2` in packages/contracts: 49 files, 347 tests pass. |
| Portable client | Same source-only command in packages/employee-client: 73 files, 641 tests pass; subsequent two-file transport verification: 3 tests pass, including 2 newly added cancel transport tests. Source total is 74 files / 643 tests; this total is arithmetic, not a claimed new aggregate run. |
| API scoped | 27 real PostgreSQL test cases across cancellation domain (7), HTTP (2), Guest compatibility (1), directory cap (2), lifecycle/child races (6 + 3), authority races (6). Normal/locked resolver before-projection: 2 unit tests pass. Audit safe projection: 7 tests pass. Each named file was run successfully after its last behavioral change. |
| PostgreSQL races | 15 passing tests prove 26 held, blocked transaction interleavings on real connections: duplicate Cancel; Cancel/Complete commit and audit rollback; note/identity/condition/photo/Vehicle detail in both orders; user/membership/grant/Shift/Organization/Location revocation in both orders. Competing statements are proven blocked using pg_blocking_pids; this is not Promise-only race simulation. |
| Existing API regressions | First regression batch: 7 standard files / 36 tests, 1 non-Postgres file / 2 tests, 2 race files / 37 tests pass. Child/Guest regression batch: 5 race files / 81 tests pass (includes new races plus existing condition and Guest command suites); staff Guest HTTP 6 tests pass. Duplicate overlap is not added into a unique total. |
| Native scoped | Final selected run: 5 files / 18 tests pass, including freeze (5), action ownership (5), lifecycle recovery (2), and unchanged Vehicles/row parity (6). |
| Native aggregate | 173 files: 172 pass, 1 baseline file fails; 1291 pass / 3 fail of 1294 tests. This aggregate preceded the additional confirmation accessibility fixture; its final targeted run passed. Four Web-coupled tests were excluded as listed below. |
| Dashboard Audit | 4 files / 144 tests pass, including typed new event and EN/AR terminal label. |
| Lint | ESLint all changed/new authored TS/TSX/MJS with --max-warnings=0 passes; JSON fixture is excluded from ESLint and formatted separately. |
| Typecheck | API, contracts, employee-client, database and Dashboard pass. Native fails with the identical 11 baseline diagnostics listed below; current output exactly matches baseline after path normalization. No new diagnostic is claimed as PASS. |
| Prisma | Configured prisma:validate with a local migration URL passes. |
| Architecture | Repository architecture checker passes; only permitted grandfathered warnings. New short files stay <=300; modified legacy condition/Guest/identity files shrink and schema test stays 7564 lines. No baseline exception edits or compressed formatting workaround. |
| Final verification build | PASS: 9/9 build tasks (3 cached), 41.729s, exit 0. Exactly one `pnpm build --filter=!@valet/valet` invokes the canonical verification runner; Employee Web is excluded. Native has no build target and no APK is built. |
| CI / production / physical | NOT RUN / NOT CLAIMED. Owner Native batch acceptance remains open. |

API/database commands use the owned runner:

```powershell
$env:PATHEXT='.COM;.EXE;.BAT;.CMD'
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs <named test files>
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs <named source test files>
```

Named focused API files: cancel-check-in.integration, cancel-check-in-http.integration, cancelled-guest-compatibility.integration, cancelled-guest-resolution, check-in-directory-coverage.integration, cancel-check-in-concurrency.integration, cancel-check-in-child-race.integration, cancel-check-in-authority-race.integration and management-audit-projection; each ends in `.test.ts` and lives under `apps/api/test`.

Named existing regressions: complete-check-in-command, staff-vehicle-directory, staff-vehicle-directory-employee-visibility, staff-check-in-drafts-discovery, staff-check-in-continuations-discovery, management-location-lifecycle, check-in-condition-command, guest-access-command and staff-valet-session-guest-access integration suites.

Native aggregate command, from apps/valet-native:

```powershell
node ../../node_modules/vitest/vitest.mjs run test --maxWorkers=2 --exclude test/native-dictionary-parity.test.mjs --exclude test/employee-brand-assets.test.mjs --exclude test/employee-icon-foundation.test.tsx --exclude test/employee-shell-frame.test.tsx
```

## UI freeze, languages and accessibility

STATIC / FIXTURE VERIFIED: saved digests of actual pre-change Native row render trees at the starting SHA cover 32 combinations (eight active states x EN/AR x collapsed/expanded). Unchanged row trees match exactly; the eligible expanded CHECKING_IN row changes only its existing footer. Existing vehicle details/badges/identifiers/styles, list/header/bottom navigation, loading/empty/error/truncation composition remain unchanged.

The intentional additions are Native-only incomplete-work explanation, Continue and Cancel controls, an existing-pattern confirmation sheet, pending/conflict/unavailable/success/unknown feedback, a safe status check and explicit confirmed retry. Native-only central EN/AR fragments retain dictionary-key parity. Existing identifier LTR and RTL layout rules remain. Existing controls retain accessible labels; confirmation has modal/title semantics, RTL direction and disabled destructive confirmation when offline/unavailable. Fixture scenarios at width 320 and font scales 1/1.5/2 verify stacked controls, 12 gap and scaled >=64-height touch controls.

These fixtures do not measure real Android text layout, TalkBack, screenshots or touch targets. No new Guest screen/copy/status/card/navigation/layout/style is introduced. No Guest UI or Employee Web code is changed. No Native dependency/config/plugin/permission/Android source change, prebuild, development client or APK command was run.

Boundary exception: native-dictionary-parity was executed once before its Web-source coupling was noticed. This was disclosed during execution; it was excluded from further verification. The other three coupled tests were excluded proactively. Final new copy lives in separate Native-only dictionary fragments.

## Unrelated baseline failures

1. Native operational HTTP: three tests use currentLocation without required timezone. Exact original Native source/fixtures from the starting commit reproduce the same three failures against the unchanged context contract. No product transport relaxation or unrelated fixture repair.
2. Native typecheck: 11 diagnostics in the starting snapshot and current checkout match exactly after removing the snapshot path prefix: missing installed expo-image-manipulator; two CameraView fixture casts; three unavailable preview-metadata method diagnostics; timezone omissions in incident recovery, push denial, push lifecycle and two Shift-retirement assignments. No dependency install/config change is authorized.
3. Database Audit required-field assertion expects 23502, while the existing guard returns 42501 for some invalid inputs. Actual 054 and 056 error sequences match in the upgrade test. The broad schema run remains 420/421 pass; this is not reported as a green aggregate.
4. An earlier Native aggregate had a QR-import timeout during excessive parallel work. Re-running with two workers eliminated that failure without changing code or timeouts. Scoped fixture regressions caused by the added workflow owner/role were corrected and their final checks pass.
5. Initial source-and-dist client/contract discovery included generated tests; final reported source-only counts avoid double-counting. An invalid guessed API test filename and a harness cluster-lease rejection were corrected with actual owned filenames and sequential cluster use. Neither is test proof.

## Adversarial review (VAYLET code-review skill)

Review target: local full diff plus new files against starting SHA, merged plan, DEC-097 and the explicit Guest clarification. Security rules, DoD, structure rules, complete review matrix and production/failure gates were read. No parallel agent edited this tree.

- Scope / decision fidelity: U-001–U-007 and clarification are implemented; no unresolved Guest decision, future model or forbidden UI scope was introduced. Changed-file inventory below is authoritative for this run.
- Authorization / tenant / Location: persisted scope and actor checks precede session update, audit and terminal response. Foreign tenant, another Location, other employee/Supervisor, forbidden role and lost authority are denied; current authority also applies on retry/status. Existing detail CHECKING_IN classifier enforces own intake for both operational roles before hydration.
- Retry / concurrency / DB: narrow same-version lifecycle CAS and held eligibility/session locks; coherent terminal history without Task/custody facts; one event/version increment; atomic rollback; terminal child replay path corrected. Database rejects terminal custody facts and frees active identity without deleting history.
- Abstraction compatibility: existing transaction-aware eligibility, Location lifecycle and custody writer take real persisted scope. Token helpers and condition authority extraction preserve existing exports/types and non-cancelled behavior. No sentinel/fake ids or new generic authority abstraction.
- Audit / privacy: fixed four metadata fields, real membership/entity/scope, shared DB timestamp and no credentials/free text. Projection removes extra private metadata; zero issuance generation/mutation/audit on terminal denial. Stored prior Guest history remains intact.
- Downstream / consumer: active/terminal predicates and strict wire contracts audited as above; Native opt-in preserves default client contract. No later Dispatch/Task ownership or Guest presentation pulled into this change.
- Architecture: focused modules/extractions; no new >300-line authored code. Legacy files shrink or remain unchanged in physical count; architecture passes.
- Test adequacy / evidence: focused positive/negative/CAS/rollback/race/no-replay/budget/fence/render cases pass. Real PG/HTTP, mocked client/lifecycle and static/render evidence remain distinct. Physical and CI gates are unperformed.
- Findings: no unresolved scoped BLOCKER/MAJOR identified. NOTE: broad baseline failures and device/CI release gates remain as documented. No claim of production readiness or permission to merge.

Merge verdict: **BLOCK MERGE** until independent repository CI/baseline and owner Native release gates are satisfied. This does not prevent the explicitly authorized scoped implementation commit/push for owner review.

## Exact changed-file inventory

Count: 111 scoped paths. No temporary artifacts, generated build output, secrets, dependency or excluded-app changes are included.

```text
apps/api/src/modules/check-in-api/cancel-check-in.controller.ts
apps/api/src/modules/check-in-api/cancel-check-in.service.ts
apps/api/src/modules/check-in-api/check-in.module.ts
apps/api/src/modules/dashboard/overview-financial-query.ts
apps/api/src/modules/dashboard/overview-shifts-keys-incidents-query.ts
apps/api/src/modules/dashboard/physical-resource-query.ts
apps/api/src/modules/incidents/incident-creation-authorization.ts
apps/api/src/modules/management/management-audit-detail-projection.ts
apps/api/src/modules/management/management-audit-event-catalog.ts
apps/api/src/modules/management/management-location-projection.ts
apps/api/src/modules/staff/staff-valet-session.controller.ts
apps/api/src/modules/staff/staff-vehicle-directory-descriptor.ts
apps/api/src/modules/staff/staff-vehicle-directory.queries.ts
apps/api/src/modules/staff/staff-vehicle-directory.service.ts
apps/api/src/modules/valet-sessions/cancel-check-in-authorization.ts
apps/api/src/modules/valet-sessions/cancel-check-in-command.ts
apps/api/src/modules/valet-sessions/cancel-check-in-status-query.ts
apps/api/src/modules/valet-sessions/check-in-condition-authorization.ts
apps/api/src/modules/valet-sessions/check-in-condition-command.ts
apps/api/src/modules/valet-sessions/guest-access-command.ts
apps/api/src/modules/valet-sessions/guest-access-resolver.ts
apps/api/src/modules/valet-sessions/guest-access-session-resolution.ts
apps/api/src/modules/valet-sessions/guest-access-token.ts
apps/api/src/modules/valet-sessions/protected-custody-command.ts
apps/api/src/modules/vehicles/vehicle-identity-command.ts
apps/api/test/cancel-check-in-authority-race.integration.test.ts
apps/api/test/cancel-check-in-child-race.integration.test.ts
apps/api/test/cancel-check-in-concurrency.integration.test.ts
apps/api/test/cancel-check-in-http.integration.test.ts
apps/api/test/cancel-check-in-race-barrier.ts
apps/api/test/cancel-check-in.integration.test.ts
apps/api/test/cancelled-guest-compatibility.integration.test.ts
apps/api/test/cancelled-guest-resolution.test.ts
apps/api/test/check-in-directory-coverage.integration.test.ts
apps/api/test/management-audit-projection.test.ts
apps/api/test/staff-valet-session-harness.ts
apps/dashboard/src/features/audit/audit-detail-values.ts
apps/dashboard/src/features/audit/audit-event-copy.ts
apps/dashboard/src/features/audit/audit-presentation.test.ts
apps/valet-native/src/auth/native-auth-runtime.ts
apps/valet-native/src/auth/native-check-in-runtime.ts
apps/valet-native/src/check-in/native-check-in-actions.ts
apps/valet-native/src/check-in/native-check-in-ownership.ts
apps/valet-native/src/i18n/native-dictionary-ar-check-in-actions.ts
apps/valet-native/src/i18n/native-dictionary-ar.ts
apps/valet-native/src/i18n/native-dictionary-en-check-in-actions.ts
apps/valet-native/src/i18n/native-dictionary-en.ts
apps/valet-native/src/incident/native-incident-session.ts
apps/valet-native/src/shell/native-production-back-handler.ts
apps/valet-native/src/shell/native-production-lifecycle-owner.ts
apps/valet-native/src/shell/native-production-workspace.tsx
apps/valet-native/src/shell/native-workflow-scope-retirement.ts
apps/valet-native/src/shift/native-shift-retirement.ts
apps/valet-native/src/vehicles/native-check-in-actions-copy.ts
apps/valet-native/src/vehicles/native-check-in-cancel-sheet.tsx
apps/valet-native/src/vehicles/native-vehicle-check-in-actions.tsx
apps/valet-native/src/vehicles/native-vehicle-row.tsx
apps/valet-native/src/vehicles/native-vehicles-route.tsx
apps/valet-native/src/vehicles/native-vehicles-screen.tsx
apps/valet-native/test/fixtures/issue-255-native-row-baseline.json
apps/valet-native/test/issue-255-freeze-tree.ts
apps/valet-native/test/issue-255-native-action-ownership.test.ts
apps/valet-native/test/issue-255-native-cancel-lifecycle.test.ts
apps/valet-native/test/issue-255-native-vehicles-freeze.test.tsx
apps/valet-native/test/native-check-in-panel.test.tsx
apps/valet-native/test/native-contextual-workflow-repair.test.tsx
apps/valet-native/test/native-production-lifecycle-authority.test.ts
apps/valet-native/test/native-production-lifecycle-owner.test.ts
apps/valet-native/test/native-shift-retirement.test.ts
apps/valet-native/test/native-vehicles-test-fixture.tsx
docs/02_DOMAIN_MODEL.md
docs/03_DATABASE_SCHEMA.md
docs/04_VALET_SESSION_STATE_MACHINE.md
docs/06_SECURITY_AND_DATA_RULES.md
docs/08_DECISIONS_LOG.md
docs/11_REQUIREMENTS_TRACEABILITY.md
docs/12_AGENT_EXECUTION_PLAN.md
docs/14_PROJECT_STATUS.md
docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md
docs/ISSUE-255_IMPLEMENTATION_VALIDATION.md
docs/decisions/DEC-097_INCOMPLETE_CHECK_IN_CANCELLATION.md
packages/contracts/src/cancel-check-in.test.ts
packages/contracts/src/cancel-check-in.ts
packages/contracts/src/dispatch.ts
packages/contracts/src/index.ts
packages/contracts/src/management-audit-events.ts
packages/contracts/src/management-audit.test.ts
packages/contracts/src/management-visit-contacts.ts
packages/contracts/src/staff-valet-session.ts
packages/contracts/src/staff-vehicle-directory-actions.ts
packages/contracts/src/staff-vehicle-directory.ts
packages/database/prisma/migrations/20261003005500_check_in_cancelled_enum/migration.sql
packages/database/prisma/migrations/20261003005600_check_in_cancelled_terminal/migration.sql
packages/database/prisma/schema.prisma
packages/database/src/check-in-cancellation-migration.integration.test.ts
packages/database/src/location-lifecycle-migration.integration.test.ts
packages/database/src/migration-manifest.ts
packages/database/src/schema.integration.test.ts
packages/database/src/shift-force-end-migration-test-fixture.ts
packages/employee-client/src/employee-cancel-check-in-session.test.ts
packages/employee-client/src/employee-cancel-check-in-session.ts
packages/employee-client/src/employee-cancel-check-in-transport.test.ts
packages/employee-client/src/employee-cancel-check-in-transport.ts
packages/employee-client/src/employee-check-in-discovery.ts
packages/employee-client/src/employee-check-in-hydrated-snapshot.ts
packages/employee-client/src/employee-check-in-intake-snapshot.ts
packages/employee-client/src/employee-check-in-session-core.ts
packages/employee-client/src/employee-check-in-targeted-entry.test.ts
packages/employee-client/src/employee-vehicle-directory-actions-transport.test.ts
packages/employee-client/src/employee-vehicle-directory-transport.ts
packages/employee-client/src/index.ts
```
