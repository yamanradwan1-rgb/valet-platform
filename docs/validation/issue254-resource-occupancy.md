# Issue #254 — implementation and verification evidence

Branch: `feat/issue-254-resource-occupancy-vehicle-context`.
Base: `875571136428d47cceb946a0aa1e0bbb75daac35` (`origin/main` at task start).
Closure review of `1a51b3e6a0055243dbbefb9f86e8c4531166c1d0` removes only three
unrelated stale-test expectation repairs. Core #254 production code, fixtures,
strict contracts and UI remain unchanged. The nine-line Dashboard Vitest JSX
config is retained after a deterministic negative control: without its transform,
the real TSX bidi component test fails before execution with Unexpected JSX
expression. No parent/root Vitest configuration exists at the base.
The closure results below supersede historical full-suite PASS claims where
baseline expectations have been restored; prior commands remain recorded as
evidence for the original reviewed commit, not as fresh amended-commit results.
The owner's execution brief supplies the approved scope and the focused gates.
This report records local evidence, not remote CI, merge approval or production
readiness. Commit identity and remote verification are in the closing report.

## Implemented contract

The modular monolith retains the existing Dashboard controllers, PostgreSQL
read functions, shared strict contracts and Dashboard read hooks. Neither
physical custody nor Dispatch lifecycle commands were changed. No operational
mutation, policy, audit event, schema or migration was added.

Keys retain `holdingSessionId` and Empty/In use semantics. `holdingVehicle` is
null for an empty slot, otherwise a strict object with only
`plateNumberNormalized` and `temporaryDescriptor`. The holder is the persisted,
non-COMPLETED session whose current `key_slot_id` matches that slot in the exact
Organization and Location. Vehicle joins additionally require Organization.

Parking Spot GET entries retain configuration, zone association and cursors.
The dedicated `ParkingSpotListEntry` adds optional nullable `occupancy` with
`sessionId`, non-COMPLETED `sessionState` and the same minimal vehicle object.
For an active persisted Location, null means Available; an object means
Occupied. The persisted current `parking_spot_id` association is authoritative,
regardless of Spot configuration ACTIVE/INACTIVE. For an inactive Location's
CA historical read, occupancy is omitted and no availability or occupant is
rendered. Create responses retain `ParkingSpotConfiguration` without occupancy.

Both reads extend one existing bounded page query. Current-assignment unique
indexes from `20260811001900_phase3_key_parking_persistence` prevent join fanout.
No per-row request/query, client-side operational join, polling or automatic
cursor walking was added. Authorization remains inside the existing transaction
before projection; existing admin activity recording is retained.

Vehicle labels use trimmed normalized plate, then trimmed temporary descriptor,
then the existing localized unavailable copy: `Vehicle identity unavailable` /
`هوية المركبة غير متاحة`. Plates use `<bdi dir="ltr">`; descriptors and unavailable
copy use `<bdi dir="auto">`. UUIDs are not primary labels. The global
`operationsVehicleLabel` and all make/model-first consumers are unchanged.

## Authority and browser evidence

Real PostgreSQL HTTP tests prove CA and exact-granted LM reads; Supervisor and
Employee denial despite grants; populated foreign Location and Organization
denial; current grant removal, inactive membership, inactive LM Location and
revoked CA entitlement denial. A distinct authenticated CA cannot read another
CA's populated resources. Inactive CA Spot listing retains configuration only;
the operational Keys read is denied. Existing authority suites add regression
coverage for persisted User/Organization/MFA/commercial eligibility.

Database tests prove normalized plate, Arabic descriptor, minimal strict fields,
empty resources, deterministic explicit pages, same-code Location isolation,
movement to another current spot, completion/release clearing both resources,
and defensive exclusion of terminal sessions retaining legacy bindings.

Each read family has manually gated A→B→A late-success and late-failure tests:
fresh A commits before old A is released, old data/errors stay absent, and B's
data renders only in B. Separate tests prove page cursor resets and old data
fencing across logout and replacement identity. No production hook was changed.

The request-budget test observed **2 initial Keys reads** (development Strict
Mode) and **1 Parking Spot read**. Before entering Physical Resources there
were zero physical-resource reads. Entering that existing parent tab also reads
its default Key Slots configuration family once; selecting Spots then reads
Spots once. Keys are not refetched by Spot selection. There are zero vehicle
enrichment/session-list/task-list reads and no cursor walking. Counts remain
unchanged during a 5.5-second observation. This preserves the baseline tab
request behavior.

Storage checks cover localStorage, sessionStorage, IndexedDB and CacheStorage;
protected resource/vehicle/session facts are absent. Logout removes protected
DOM; a newer server denial removes browser-held occupancy. Existing keyboard
Inspect/Escape/focus-trap/opener/backdrop tests pass.

Baseline screenshots were captured before UI edits. Final screenshots cover
both tables at EN light/dark and AR light/dark desktop, plus AR light at 480px.
Visual inspection confirmed the existing shell, tabs, badges, action buttons,
five-column tables, colors, borders, radius and typography. Narrow tables retain
their baseline internal horizontal scrolling; document width stays within 480px.
The additions use existing muted text within Usage/Status cells only.

**No Dashboard redesign or visual-system change was made; only the Issue #254
operational row content was added using existing Dashboard components/styles.**

## Historical implementation commands and results (original reviewed commit)

PostgreSQL commands use the existing `.env` migration connection as
`TEST_DATABASE_URL`, without printing credentials, and the repository-owned
temporary database/role harness. No timeout was increased.

```powershell
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-resource-occupancy.integration.test.ts test/dashboard-resource-occupancy-authority.integration.test.ts
```

PASS: 2 files, 7 tests. Final isolated run: 18.76s Vitest / 20.96s harness.

```powershell
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-physical-resources.integration.test.ts test/dashboard-physical-resources-authority.integration.test.ts test/dashboard-overview-domains.integration.test.ts test/dashboard-overview-authz.integration.test.ts test/dashboard-overview-api.integration.test.ts test/dashboard-parking-zone-create.integration.test.ts test/dashboard-parking-zone-authority.integration.test.ts
```

PASS: 7 files, 37 tests (race 4/24, standard 2/9, compound 1/4). Harness cleanup
reports zero retained databases, roles and child processes. New + regression:
9 files, 44 PostgreSQL tests.

```powershell
pnpm --filter @valet/contracts test
pnpm --filter @valet/dashboard test
pnpm --filter @valet/dashboard exec vitest run src/lib/presentation/resource-vehicle-identity.test.ts src/lib/presentation/resource-vehicle-identity-text.test.tsx src/features/operations/operations-presentation.test.ts src/features/operations/live-operations/live-operations-presentation.test.ts
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/dashboard typecheck
```

PASS: Contracts 48 files / 344 tests; Dashboard 82 files / 600 tests; final
focused Dashboard run 4 files / 19 tests. All three focused typechecks pass.
The Dashboard Vitest config uses automatic JSX, matching sibling apps, for real
TSX component verification. Existing exact-field Overview regression assertions
were synchronized with already-present #241 projections; stale task/status and
staff-name expectations were corrected to unchanged production behavior.
No assertion, security boundary or race requirement was removed.

```powershell
$env:E2E_BASE_URL='http://localhost:3003'
pnpm --filter @valet/dashboard exec playwright test e2e/issue254-resource-rows.spec.ts e2e/issue254-resource-races.spec.ts e2e/issue254-visual.spec.ts e2e/issue237-keys-spots.spec.ts e2e/issue237-physical-resource-session-races.spec.ts e2e/issue237-physical-resource-cursor-race.spec.ts e2e/issue232-physical-resource-races.spec.ts e2e/issue232-physical-resources.spec.ts e2e/issue232-physical-resource-closure.spec.ts --output <external-artifacts>/issue254-regression-run
pnpm --filter @valet/dashboard exec playwright test e2e/issue254-resource-rows.spec.ts e2e/issue236-parking-zones.spec.ts e2e/issue236-zone-selector-races.spec.ts e2e/issue236-zone-auth-retry.spec.ts e2e/md-r08-presentation.spec.ts e2e/md-r08-accessibility.spec.ts e2e/md-r08-privacy-budget.spec.ts --output <external-artifacts>/issue254-additional-run
pnpm --filter @valet/dashboard exec playwright test e2e/issue254-resource-rows.spec.ts --grep 'vehicle rows preserve' --reporter=json --output <external-artifacts>/issue254-budget-run
```

PASS: 31 tests (1.8m), 22 tests (47.1s), budget-only 1 test (7.85s).
The first two runs cover 50 distinct tests; three #254 row tests repeat.
The final budget run records exact request counts in its JSON attachment.

```powershell
$env:API_ORIGIN='http://localhost:3001'
pnpm build:production -- --filter=@valet/dashboard... --filter=@valet/api...
pnpm architecture:check
node node_modules/eslint/bin/eslint.js --max-warnings=0 <all-task-code-files>
node node_modules/prettier/bin/prettier.cjs --check <all-task-files>
git diff --check
```

PASS: local production-mode build, all 4 scoped packages, 2m56s. The explicit
origin is the repository's canonical local API development origin, not a claimed
deployed production origin. Architecture passes with existing grandfathered
warnings; every changed/new authored code file is below 300 physical lines.
Focused lint, formatting and diff checks pass.

## Other gates and limitations

FAIL: root `pnpm lint` encounters unchanged selected-management-shell/scope
React hook violations (9 errors / 3 warnings). Root `pnpm typecheck` encounters
unchanged Employee application test fixtures missing the required `timezone`.
Root `pnpm test:non-postgres` fails in unrelated API architecture/capacity harness
tests and Auth feature-module ownership expectations; the API segment reports
5 failed / 60 passed files and 17 failed / 455 passed tests. The Database
non-PostgreSQL segment passes 3 files / 23 tests. No root-green claim is made.
Full root PostgreSQL suite and full root build: NOT RUN; the owner-required
focused PostgreSQL suites and scoped production build were run instead.
Remote CI, Docker/deployment and fresh security scans: NOT RUN / not claimed.

ENVIRONMENT/HARNESS ISSUE: the first PostgreSQL attempt used the harness's
default credentials and failed before product assertions; configuring the
existing connection resolved it. Later concurrent broad tests/build saturated
the machine and caused five-second timeouts; the isolated focused commands pass
without timeout changes. Initial new test assumptions about the Keys response
HTTP no-store header were incorrect and removed: the existing Overview family
does not set it, while Dashboard requests use cache:no-store. Spot headers and
all existing family cache behavior remain unchanged.

ENVIRONMENT: the first production-build attempt lacked required `API_ORIGIN`;
the explicit local-origin run passed. Automatic approval review rejected the
optional separate production-mode browser `next start` command with "blocked
by policy" and no further reason. Browser proof therefore uses the existing
development server; a separately started production browser runtime is NOT RUN.

No scoped implementation blocker was identified in the manual VAYLET review
passes for contract, scope, authority, database integrity, abstraction, privacy,
API/downstream compatibility, architecture or feature evidence. Whole-repository
checks still have the failures above; this is not a PR-ready or production-ready
certification. Only the owner-requested branch commit/push is authorized.

Migrations changed: NO. Prisma/schema changed: NO. Dependencies/lockfile changed:
NO. CSS changed: NO. PR created: NO. Merge performed: NO. Main update: NO.
Issue closure: NO. The owner's existing `apps/dashboard/test-results/` is
untouched and excluded from the task commit. All screenshots/reports are external.

Artifacts: `C:/Users/LP/.codex/visualizations/2026/10/02/01a0fdd7-0e84-7690-bc6b-42d2571dc1fd/`.
Baseline: `issue254-baseline/`. Final: `issue254-final/`. Request report:
`issue254-budget-report.json`. Screenshots are inspection evidence, not pixel
snapshot assertions against identical fixtures; baseline and final row fixtures
differ to exercise the new operational content.

## Exact final task-owned changed files

- `apps/api/src/modules/dashboard/overview-shifts-keys-incidents-query.ts`
- `apps/api/src/modules/dashboard/physical-resource-query.ts`
- `apps/api/src/modules/dashboard/physical-resource.controller.ts`
- `apps/api/test/dashboard-resource-occupancy-authority.integration.test.ts`
- `apps/api/test/dashboard-resource-occupancy.integration.test.ts`
- `apps/api/test/resource-occupancy-test-fixture.ts`
- `apps/dashboard/e2e/issue254-resource-races.spec.ts`
- `apps/dashboard/e2e/issue254-resource-rows.spec.ts`
- `apps/dashboard/e2e/issue254-visual.spec.ts`
- `apps/dashboard/e2e/support/issue254-resources.ts`
- `apps/dashboard/e2e/support/operations-fixtures.ts`
- `apps/dashboard/e2e/support/r08-accountability.ts`
- `apps/dashboard/src/features/administration/physical-resources/physical-resource-table.tsx`
- `apps/dashboard/src/features/administration/physical-resources/physical-resources-api.ts`
- `apps/dashboard/src/features/administration/physical-resources/physical-resources-copy.ts`
- `apps/dashboard/src/features/administration/physical-resources/physical-resources-panel.tsx`
- `apps/dashboard/src/features/operations/keys/keys-operational-view.tsx`
- `apps/dashboard/src/lib/presentation/resource-vehicle-identity-text.test.tsx`
- `apps/dashboard/src/lib/presentation/resource-vehicle-identity-text.tsx`
- `apps/dashboard/src/lib/presentation/resource-vehicle-identity.test.ts`
- `apps/dashboard/src/lib/presentation/resource-vehicle-identity.ts`
- `apps/dashboard/vitest.config.mjs`
- `docs/plans/issue254-resource-occupancy-contract.md`
- `docs/validation/issue254-resource-occupancy.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/location-overview.ts`
- `packages/contracts/src/physical-resource-configuration.ts`
- `packages/contracts/src/resource-occupancy.test.ts`
- `packages/contracts/src/resource-vehicle-identity.ts`

## Closure-only scope audit

Fetch confirmed HEAD and the remote feature branch both at the original reviewed
commit, and `origin/main` still at the original base. No rebase was needed.
All 32 original changed files were reviewed against that base. A is direct #254
implementation, B is required #254 test/tooling/evidence support, C is unrelated
stale baseline repair. No category D file was identified. All three C changes
were reverted byte-for-byte to the base. The final diff contains 29 files:
14 category A and 15 category B.

| Original changed file | Classification / verdict |
| --- | --- |
| `apps/api/src/modules/dashboard/overview-shifts-keys-incidents-query.ts` | A → KEEP |
| `apps/api/src/modules/dashboard/physical-resource-query.ts` | A → KEEP |
| `apps/api/src/modules/dashboard/physical-resource.controller.ts` | A → KEEP |
| `apps/api/test/dashboard-overview-domains.integration.test.ts` | C → REVERT |
| `apps/api/test/dashboard-resource-occupancy-authority.integration.test.ts` | B → KEEP |
| `apps/api/test/dashboard-resource-occupancy.integration.test.ts` | B → KEEP |
| `apps/api/test/resource-occupancy-test-fixture.ts` | B → KEEP |
| `apps/dashboard/e2e/issue254-resource-races.spec.ts` | B → KEEP |
| `apps/dashboard/e2e/issue254-resource-rows.spec.ts` | B → KEEP |
| `apps/dashboard/e2e/issue254-visual.spec.ts` | B → KEEP |
| `apps/dashboard/e2e/support/issue254-resources.ts` | B → KEEP |
| `apps/dashboard/e2e/support/operations-fixtures.ts` | B → KEEP |
| `apps/dashboard/e2e/support/r08-accountability.ts` | B → KEEP |
| `apps/dashboard/src/features/administration/physical-resources/physical-resource-table.tsx` | A → KEEP |
| `apps/dashboard/src/features/administration/physical-resources/physical-resources-api.ts` | A → KEEP |
| `apps/dashboard/src/features/administration/physical-resources/physical-resources-copy.ts` | A → KEEP |
| `apps/dashboard/src/features/administration/physical-resources/physical-resources-panel.tsx` | A → KEEP |
| `apps/dashboard/src/features/operations/keys/keys-operational-view.tsx` | A → KEEP |
| `apps/dashboard/src/features/operations/live-operations/live-operations-presentation.test.ts` | C → REVERT |
| `apps/dashboard/src/features/operations/operations-presentation.test.ts` | C → REVERT |
| `apps/dashboard/src/lib/presentation/resource-vehicle-identity-text.test.tsx` | B → KEEP |
| `apps/dashboard/src/lib/presentation/resource-vehicle-identity-text.tsx` | A → KEEP |
| `apps/dashboard/src/lib/presentation/resource-vehicle-identity.test.ts` | B → KEEP |
| `apps/dashboard/src/lib/presentation/resource-vehicle-identity.ts` | A → KEEP |
| `apps/dashboard/vitest.config.mjs` | B → KEEP |
| `docs/plans/issue254-resource-occupancy-contract.md` | B → KEEP |
| `docs/validation/issue254-resource-occupancy.md` | B → KEEP |
| `packages/contracts/src/index.ts` | A → KEEP |
| `packages/contracts/src/location-overview.ts` | A → KEEP |
| `packages/contracts/src/physical-resource-configuration.ts` | A → KEEP |
| `packages/contracts/src/resource-occupancy.test.ts` | B → KEEP |
| `packages/contracts/src/resource-vehicle-identity.ts` | A → KEEP |

The Overview domain test repairs added fields already emitted at the base by
`overview-sessions-query.ts` and `overview-retrieval-tasks-query.ts`: activeTask,
resource projections, vehicle make/model/color and assignee. Neither production
module changed in #254. The old task-status test expected a staff name even
though the base function returns Assigned; the old staff-name test expected
Assigned even though the base function returns the persisted human display name.
Those repairs made unrelated gates green and are not required to validate #254.
Their original assertions are restored without changing production behavior.

The two existing E2E fixture edits are required contract compatibility. Empty
`keyItem()` must include `holdingVehicle:null`; each R08 in-use fixture must
include its minimal vehicle object. Missing holdingVehicle or a non-null holder
with a null vehicle fails the strict #254 schema. Slot status, session IDs, usage,
roles, actions, pagination and all incident/audit fixtures are unchanged.

The Dashboard Vitest config is the smallest compatible automatic JSX transform,
matching the sibling Valet/Customer pattern. No parent/root configuration exists.
With an external empty config, the real component test fails before execution
with RolldownError: Unexpected JSX expression; with the retained config it passes
both bidi cases. The config affects JSX transformation across Dashboard tests but
adds no includes/excludes, mocks, timeouts, environment or assertion changes.
The existing Dashboard test script has no config override. A custom per-test
transformer or coupling the command to a sibling app would be a broader tooling
change. The minimal local transform is therefore required support, not baseline
cleanup.

All core #254 files are unchanged relative to the reviewed pushed commit.
No entities, transitions, authorization, query joins, configuration, DB
constraints, contract semantics, UI/CSS or runtime build configuration changed
in this closure pass. The three restored tests were the only code edits.

## Fresh closure verification

- PASS: `pnpm --filter @valet/contracts test`: 48 files, 344 tests.
- PASS: default-config focused resource presentation command: 2 files, 3 tests.
- EXPECTED NEGATIVE CONTROL: the same TSX test with an external empty config
  fails to parse before execution (1 failed suite, zero tests). This proves the
  necessity of the retained JSX transform; it is not a product regression.
- FAIL (baseline): `pnpm --filter @valet/dashboard test`: 80 passed / 2 failed
  files, 598 passed / 2 failed tests. The restored task-status assertion expects
  Lina Haddad but the unchanged base helper returns Assigned; the restored
  staff-name assertion expects Assigned but the unchanged base helper returns
  Lina Haddad. Baseline files and their production functions are byte-identical.
- PASS: Contracts, API and Dashboard package typecheck commands.
- PASS: the repository-owned focused #254 PostgreSQL command above: 2 files,
  7 tests, 14.31s Vitest / 16.24s harness. Cleanup retains zero DBs/roles/children.
- FAIL (baseline): the same owned harness with only
  `test/dashboard-overview-domains.integration.test.ts`: 4 passed / 3 failed
  tests, 7.17s Vitest. Failures are the restored session field allowlist,
  retrieval task assignee shape, and task field allowlist. The field-producing
  production modules are unchanged from the original base. The operational
  Keys test in this suite passes. No broad PostgreSQL loop or timeout change.
- PASS: #254 rows/races/visual Playwright specs only: 14 tests, 36.1s, external
  output under `issue254-review-browser/`; screenshots under
  `issue254-review-visual/`. No runtime UI file changed; #237 was not rerun.
- PASS: architecture (existing grandfather warnings only), ESLint with zero
  warnings for all final task-owned code, scoped Prettier and git diff checks.
- PASS: the same scoped production build with explicit local API_ORIGIN:
  all 4 packages successful (2 cached), 25.527s. Rerun once because Next's
  production typecheck includes the restored Dashboard source tests.
- Root lint/typecheck/non-PostgreSQL loops: NOT RERUN, per closure scope.
  Existing unrelated failures remain recorded above; none were repaired here.

The final scope is clean and all core #254 files retain their reviewed contents.
Merge conclusion: **NOT READY**. The deterministic blockers are the two restored
Dashboard baseline tests and three restored API domain baseline tests above;
required repository CI cannot be claimed green. Fixing those unrelated baseline
tests is outside this closure request. No PR, merge, main modification or Issue
closure is performed, and no merge-readiness claim hides those failed gates.
