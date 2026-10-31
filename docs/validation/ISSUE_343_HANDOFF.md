# Issue #343 engineering handoff

**Verdict: PIXEL-PERFECT UI FREEZE PASS — broader verification remains incomplete**

The production feature source is implemented and the owner-scoped pixel-perfect
UI Freeze verification is complete. This handoff does not claim overall merge
approval or production readiness; broader gates explicitly excluded from this
continuation remain unverified. No PR, merge or deployment was performed. All
observations below refer to 2026-10-31 UTC.

## A. Git state

- Baseline main: `92638c499a1062db3f814687ca3761f235361298`.
- Approved prototype: `1909a3cdb3e34d7bdf8d35897676948542468ac1`.
- Prototype merge base: `2b1ed12d62a3d68d4b3bafeaf25b6bf53fde1e3f`.
- Feature branch: `feat/issue-343-task-route-history`.
- Branch URL: https://github.com/yamanradwan1-rgb/valet-platform/tree/feat/issue-343-task-route-history
- Final commit, verified remote SHA and final working-tree status are recorded
  after the preservation commit in the accompanying `git-state.json`. This
  document is part of that commit and cannot embed its own commit hash.
- Main was fetched/fast-forwarded before creating the isolated branch. The
  prototype was inspected in scratch storage, never merged or cherry-picked.

## B. Implementation

New protected transport:
`GET /v1/staff/tasks/:taskId/route-history-recordings?limit=100&cursor=...`.
The strict shared query permits only a bounded limit (1–500) and a Task-bound
cursor of at most 512 characters. It accepts no caller-supplied tenant,
Location, user or membership authority. The paginated response contains ended
recording references, actual start/end times and nullable immutable assignee
membership provenance; it contains no GPS coordinates or general Task-list
extension. Discovery requires a COMPLETED PARKING/RETRIEVAL Task. The existing
sample endpoint is reused unchanged in its authorization/query semantics;
no-store response headers are added there.

Task Details forwards a feature-owned optional insertion after the existing
Emergency Takeover action. The insertion is disabled for active/non-completed
Tasks and Company Admin. The lazy viewer mounts only on explicit open. It uses
the current Location name/timezone, actual retained coordinates and timestamps,
and the existing API client, auth/session fences, focus dialog, locale/theme
providers and Google SDK loader. There is no polling, autoplay, production demo
state or coordinate fixture. Existing Supervisor Tasks browsing remains limited
to its current IN_PROGRESS emergency slice; no completed-task browsing is added.

Multiple recordings remain separately selectable. Each sample request uses the
selected real tracker ID. NULL historical owner provenance is shown as unknown;
it never falls back to current Task assignee. Segments are never concatenated.
Each automatic sample window performs at most four sequential 500-sample
requests and displays at most 2,000 observations. Explicit previous/next controls
reach later windows; partial windows are labeled. All observations in a window
are drawn, with bounded interactive markers. Lines show observed order, not a
claimed traveled road. Single-point, empty, unavailable, loading, denied and
failed states are distinct. A later-page error discards the whole attempted
window; retry starts a fresh authorized read.

The Google adapter reuses the current key/map-ID configuration. It draws observed
polylines, markers, selection, pan/zoom and fit without Directions, snapping,
ETA, distance or speed. Missing configuration/provider failure uses the approved
coordinate-map fallback with a truthful basemap-unavailable label. Configured
failures have explicit retry. Provider objects/listeners are torn down on
closure, failure, recording change or effect disposal. Scripted SDK tests verify
cleanup; live Google was not verified. No new provider configuration is added.

The exact added/modified file list and physical line counts follow in section F.

## C. Security

| Principal | Raw historical discovery/read policy |
| --- | --- |
| ACTIVE LOCATION_MANAGER | Exact active tenant membership and explicit access to the Task's active Location |
| ACTIVE VALET_SUPERVISOR | Same exact grant, plus current active Shift at that Location |
| ORG_ADMIN / Company Admin, including MFA | Denied; Management authority does not imply raw GPS authority |
| VALET_EMPLOYEE | Denied |
| Guest/Customer/anonymous | No staff raw-GPS permission; unauthenticated transport returns 401 |
| Disabled User/inactive membership/Organization/Location, revoked session | Denied |

Authentication uses the real bearer/session resolver. Discovery transactionally
rechecks the exact current staff session and active User, takes the existing
Location lifecycle boundary before Location row locks, and proves the persisted
Task/ValetSession/tenant/Location/grant/role joins. Supervisor Shift eligibility
is protected through the same read transaction. No business mutation is added.
Foreign, absent and unauthorized objects share the concealed authorization
response. Every metadata page and existing sample page reauthorizes. A cursor
is a pagination position, never an authority credential.

Real PostgreSQL evidence includes two independent principals accessing their own
objects and being denied each other's; absent IDs; wrong tenant/Location;
missing/revoked grants; exact role/Shift boundaries; Shift end; inactive status;
session revocation; active Task with an old ended segment; active tracker even
with an inconsistent completed Task; independent immutable recordings and
Task-bound pagination. Concurrent tests prove grant deletion waits for a read,
a waiting reader observes writer COMMIT versus ROLLBACK, and Location disabling
uses the compatible lifecycle-before-row lock order. The new HTTP test uses actual
stored bearer hashes, current-session resolution, the runtime database role,
request IDs, bounded validation and concealed errors. The retained legacy sample
transport test stubs its principal resolver while still querying real PostgreSQL.

Privacy boundaries: no new GPS ingestion, collection policy, retention duration,
cleanup job, guest response, export, public link, logging, metric or audit
payload. No coordinates are persisted by the new Dashboard feature. Closing
tears down feature state; cancellation/generation fences reject late results.
The existing TasksContent remounts on identity/session/Location scope generation
changes. This is source evidence plus closed/reopened stale-read browser
coverage, not an exhaustive browser test of every possible identity transition.

Residual limits: no repository-wide security audit or live-provider verification
was completed in this continuation. Independent UI Freeze verification was
completed against the controlled local evidence. Pagination spans independently
authorized reads rather than a cross-request snapshot. Existing finite retention
can remove observations between requests. Already delivered data cannot be
retroactively undisclosed; subsequent reads require current authority.

## D. UI Freeze

**UI FREEZE: PASS**

The original Cloud comparison was retained as historical evidence: it used
Webpack for the baseline and Turbopack for the feature, producing 42/48 exact
pairs and six 4–25-pixel differences with maximum RGB-channel delta 1. The raw
Cloud PNG/mask bundle and reported untracked follow-up file were not available
from GitHub or authorized local worktrees, so their contents were not treated as
recovered evidence.

The 2026-10-31 local follow-up reproduced the baseline Webpack failure at
`packages/contracts/src/index.ts` (`Can't resolve './api-errors.js'`). Rather
than changing product imports or shared contracts, both pinned revisions were
launched with their existing Next.js 16.4.3 Turbopack configuration. They used
the same Playwright Chromium 151.0.7922.34 process, frozen dependencies, host,
fonts, fixtures, viewport, DPR, locale/theme controls and screenshot settings.

The new matrix completes 48 pairs: 32 Tasks list/Task Details combinations over
320/390/768/1440, EN/AR and light/dark, plus 16 Emergency Takeover/empty/loading/
error representative cases. Each image is captured twice per revision, for 192
PNGs total. Baseline and feature repeat comparisons are both exact.

`tmp/issue-343-ui-freeze-evidence/comparison.json` records 48/48 exact pairs,
zero failing pairs and **0 differing unmasked pixels**. The comparator uses exact
RGBA equality with no tolerance, smoothing or resizing. Only the exact visible
Route History section bounds are masked in Task Details/Emergency captures; list,
empty, loading and error cases are unmasked. Emergency captures subtract the
pre-existing nested Emergency dialog bounds from the feature mask, so none of the
existing modal is excluded from comparison. The recorded mask scope and occlusion
checks pass.
All six historical residual cases now report zero differing pixels and zero max
channel delta under the same renderer.

Frozen geometry recorded with the captures matches exactly. A separate
16-combination geometry audit also verifies the original Emergency Takeover
button/toolbar, Close button and original fact rows exactly across all widths,
locales and themes. No global Dashboard CSS, shell styling, production dependency
or shared component styling was changed to obtain the PASS.

The durable harness and exact comparator are committed with the task; raw PNGs
remain in ignored/local evidence. Full methodology and evidence paths are in
`docs/validation/ISSUE_343_UI_FREEZE_FOLLOWUP.md`.

All 16 width/locale/theme browser keyboard cases passed: focus stays inside the
viewer under forward/reverse Tab traversal, close remains reachable, the range
supports Home/End, Escape closes only the viewer, and focus returns to View Route.
The ten functional browser cases also exercise nested drawer behavior. Existing
Emergency Takeover tests pass, including Arabic small-screen Cancel behavior.
Native 200% desktop browser zoom remains outside this owner-directed UI Freeze
continuation and was not rerun. CSS scaling or device emulation is not represented
as native zoom.

## E. Executed verification

Commands ran from the repository root unless a working directory is stated.
`npm_config_verify_deps_before_run=false` was inherited by workspace scripts;
`pnpm --config.verify-deps-before-run=false` avoids this environment's automatic
non-interactive dependency reinstall. No dependency or lockfile change was made.
Logs in the bundle retain full results, including unsuccessful attempts.

| Command / working directory | Actual result | Passed / failed / skipped |
| --- | --- | --- |
| `pnpm --config.verify-deps-before-run=false lint --concurrency=1` | PASS, all 11 packages, final source | Not test counts; 0 lint errors |
| `pnpm --config.verify-deps-before-run=false typecheck --concurrency=1` | PASS, all 11 packages, final source | Not test counts; 0 type errors |
| `NEXT_TELEMETRY_DISABLED=1 pnpm --config.verify-deps-before-run=false build --concurrency=1` | PASS, all 10 build tasks; verification mode with loopback API origin, not deployment | Build tasks, not tests |
| `pnpm --config.verify-deps-before-run=false architecture:check` | PASS; only existing grandfathered warnings | Not tests; no new exception |
| `pnpm --config.verify-deps-before-run=false exec prettier --check <exact authored path list>` | Scope formatting checked; path list in evidence | Not tests |
| `git diff --check` and `git diff --cached --check` | Checked before commit | Not tests |
| `pnpm --config.verify-deps-before-run=false exec vitest run src/task-route-recordings.test.ts src/route-history.test.ts`, packages/contracts | PASS, strict new/existing contracts | 4 / 0 / 0 |
| `pnpm --config.verify-deps-before-run=false exec vitest run src/features/operations/tasks/route-history/route-history-api.test.ts src/features/operations/tasks/route-history/historical-google-runtime.test.ts`, apps/dashboard | PASS; mocked API and scripted Google SDK, not live provider | 6 / 0 / 0 |
| `pnpm --config.verify-deps-before-run=false exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/task-route-recordings.integration.test.ts test/task-route-api.integration.test.ts test/route-history-api.integration.test.ts test/task-route-revocation.integration.test.ts test/route-history.integration.test.ts`, apps/api | PASS against owned PostgreSQL 16 with versioned migrations and runtime-role provisioning; 7 standard + 9 race-project cases | 16 / 0 / 0 |
| `pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.mjs --project api-non-postgres test/feature-module-ownership.test.ts -t 'keeps GPS ingestion ownership focused'`, apps/api | PASS after updating the tracking ownership assertion | 1 / 0 / 11 filtered |
| `pnpm --config.verify-deps-before-run=false exec playwright test --config /workspace/work/issue-343/playwright.config.mjs issue343-route-history.spec.ts`, apps/dashboard | PASS, actual browser/app, fixture API | 10 / 0 / 0 |
| `pnpm --config.verify-deps-before-run=false exec playwright test --config /workspace/work/issue-343/playwright.config.mjs issue343-route-accessibility.spec.ts`, apps/dashboard | PASS, actual browser/app, fixture API, 16 screenshots | 16 / 0 / 0 |
| `pnpm --config.verify-deps-before-run=false exec playwright test --config /workspace/work/issue-343/takeover-playwright.config.mjs`, apps/dashboard | PASS, unchanged Emergency Takeover/Supervisor behavior, fixture API | 9 / 0 / 0 |
| `pnpm --config.verify-deps-before-run=false test` | BLOCKED before any test: Issue #215 verified disposable-target attestation | 0 executed; not a passing suite |
| `pnpm --config.verify-deps-before-run=false test:non-postgres` | FAIL; detailed breakdown below | See package counts below |

The broad non-PostgreSQL run observed:

- UI: 2 pass; config: 1; contracts: 533; testing: 1; customer: 495;
  employee-client: 928, each with zero failures/skips in its reported summary.
- Dashboard: 1,099 pass / 2 fail / 13 skip. Both failures are help-registry count
  expectations (111 versus current 112). Two mounted-help suites cannot launch
  their expected cached Playwright headless-shell binary.
- API Node tests: 40 pass / 0 fail / 0 skip. API Vitest: 1,413 pass / 2 fail /
  7 skip. One failure was the TrackingModule assertion, subsequently updated and
  verified above; the other is the pre-existing Dispatch controller expectation.
- Database non-PostgreSQL: 64 pass / 1 fail / 0 skip. Its frozen migration-list
  appendix expects 103 entries while main has 106. No migrations changed here.
- Turbo aborted later app tasks after Dashboard failed; this is not full-suite
  coverage. Counts reflect the observed run, not a hypothetical corrected run.

Baseline verification in the untouched main checkout:

- Same help registry test command: 4 pass / 2 fail / 0 skip; exact failures
  reproduced (`baseline-help.log`).
- Same complete module ownership file: 11 pass / 1 fail / 0 skip; exact Dispatch
  failure reproduced (`baseline-ownership.log`).
- `pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.mjs --project database-non-postgres src/issue304-migration-source-appendix.test.ts`, baseline packages/database:
  0 pass / 1 fail / 0 skip; exact migration-list failure reproduced.

Other attempts/evidence:

- Initial root lint/typecheck were launched concurrently and interrupted after
  resource contention. Serialized runs passed, including final reruns. The
  interrupted attempts are not counted as passes.
- An earlier focused database batch passed 14 cases, then the added active-tracker
  and lifecycle-order cases brought the final batch to 16. An intermediate
  revocation-only run passed all five cases. These are repeat validations, not
  extra distinct test coverage.
- Early browser-fixture/timing failures were corrected in the tests; final
  functional and accessibility logs show 10 and 16 passes, respectively.
- `pnpm exec playwright install chromium` failed with CDN HTTP 403. Explicit
  `/usr/bin/chromium` is used by the task's browser configs. Existing unrelated
  mounted-help suites still require their default missing cached binary.
- `node /workspace/valet-platform/apps/api/node_modules/tsx/dist/cli.mjs /workspace/work/issue-343/capture.mts baseline` and `... capture.mts after`:
  actual 16-case list/details captures per variant. The analogous
  `capture-extra.mts baseline/after` produced 16 additional captures per variant.
- `python3 /workspace/work/issue-343/compare-visual.py`: 48 exact comparisons,
  42 zero differences, six residual one-level raster differences; geometry
  exact. Not reported as a passing zero-difference freeze gate.
- Native zoom probes (`check-zoom.mts`, `check-extension-zoom.mts`) did not verify
  native 200%; see probe logs and section D. No live Google call was verified.
- Root fixture bootstrap was not bypassed, CI environment was not spoofed, and
  unrelated policy/tests were not weakened to manufacture green gates.
- Local UI Freeze follow-up: the pinned baseline and feature both launched with
  `pnpm --dir apps/dashboard exec next dev --turbopack` on separate localhost
  ports. `apps/dashboard/e2e/issue343-ui-freeze-local.spec.ts` passed and produced
  48 captures plus 48 repeats per revision. The exact comparator reports 48/48
  pairs, 0 failing pairs and 0 differing unmasked pixels. The separate Emergency
  Takeover geometry spec passed 16/16 combinations. See
  `ISSUE_343_UI_FREEZE_FOLLOWUP.md` for the controlled environment and evidence.

## F. Architecture and scope

New production responsibilities are separated into strict contracts; HTTP
controller/service; transaction query; authority proof; cursor; lazy section and
viewer; recording selector; bounded loader; inspector; provider adapter/runtime;
coordinate fallback and feature-scoped stylesheet. No authored code file exceeds
300 physical lines (largest new code file: coordinate renderer, 294 lines).
Stylesheets and Markdown are exempt under the repository's code-extension rule.
The generated Next AGENTS/next-env changes are excluded from the feature commit.

Dependencies: none. Package manifests/lockfile: unchanged. Prisma: unchanged.
Migrations: none; existing migration history untouched. Retention and tracking
writers: unchanged. Task/Dispatch/custody transitions: none added or changed.
Documentation: only this task's implementation plan, source review, handoff and
focused UI Freeze follow-up/reproducibility material.
Architecture baseline: unchanged. Full file manifest follows.


### Exact file manifest

| Change | File | Physical lines |
| --- | --- | --- |
| modified | `apps/api/src/modules/tracking/route-history.controller.ts` | 71 |
| added | `apps/api/src/modules/tracking/task-route-authorization.ts` | 64 |
| added | `apps/api/src/modules/tracking/task-route-cursor.ts` | 40 |
| added | `apps/api/src/modules/tracking/task-route-recordings-query.ts` | 84 |
| added | `apps/api/src/modules/tracking/task-route-recordings.controller.ts` | 64 |
| added | `apps/api/src/modules/tracking/task-route-recordings.service.ts` | 12 |
| modified | `apps/api/src/modules/tracking/tracking.module.ts` | 43 |
| modified | `apps/api/test/feature-module-ownership.test.ts` | 284 |
| added | `apps/api/test/task-route-api.integration.test.ts` | 124 |
| added | `apps/api/test/task-route-recordings.integration.test.ts` | 209 |
| added | `apps/api/test/task-route-revocation.integration.test.ts` | 170 |
| added | `apps/api/test/task-route-test-context.ts` | 57 |
| added | `apps/dashboard/e2e/issue343-route-accessibility.spec.ts` | 80 |
| added | `apps/dashboard/e2e/issue343-route-history.spec.ts` | 259 |
| added | `apps/dashboard/e2e/issue343-ui-freeze-local.spec.ts` | 289 |
| added | `apps/dashboard/e2e/issue343-emergency-geometry-local.spec.ts` | 154 |
| added | `apps/dashboard/e2e/support/issue343-route-fixture.ts` | 100 |
| modified | `apps/dashboard/src/features/operations/tasks/emergency-task-drawer.tsx` | 57 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/historical-google-runtime.test.ts` | 157 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/historical-google-runtime.ts` | 162 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/historical-route-map.tsx` | 183 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/recording-page.tsx` | 62 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/recording-samples.tsx` | 131 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-copy.ts` | 128 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-history-api.test.ts` | 91 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-history-api.ts` | 64 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-history.module.css` | 573 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-map.tsx` | 294 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-section.tsx` | 58 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-state.tsx` | 42 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/route-viewer.tsx` | 129 |
| added | `apps/dashboard/src/features/operations/tasks/route-history/sample-inspector.tsx` | 115 |
| modified | `apps/dashboard/src/features/operations/tasks/task-drawer.tsx` | 109 |
| added | `docs/validation/ISSUE_343_HANDOFF.md` | 324 |
| added | `docs/validation/ISSUE_343_IMPLEMENTATION_PLAN.md` | 153 |
| added | `docs/validation/ISSUE_343_SOURCE_REVIEW.md` | 145 |
| added | `docs/validation/ISSUE_343_UI_FREEZE_FOLLOWUP.md` | 153 |
| added | `docs/validation/issue-343-ui-freeze/compare.mjs` | 179 |
| modified | `packages/contracts/src/index.ts` | 99 |
| added | `packages/contracts/src/task-route-recordings.test.ts` | 47 |
| added | `packages/contracts/src/task-route-recordings.ts` | 33 |

## G. Remaining gates and final verdict

**PIXEL-PERFECT UI FREEZE: PASS**

The strict UI Freeze residual from the earlier mixed-renderer run is resolved by
the controlled same-render rerun described in section D and the focused follow-up.
No RGB tolerance or broader mask was introduced.

The owner explicitly scoped this continuation to the remaining Pixel-perfect UI
Freeze and excluded live Google Maps, native 200% zoom and unrelated root-suite
failures. Those previously documented broader verification items remain
unverified and are not converted into PASS claims here. No PR, merge, deployment,
Issue closure, remote CI or overall production/merge-readiness claim is made by
this handoff update.
