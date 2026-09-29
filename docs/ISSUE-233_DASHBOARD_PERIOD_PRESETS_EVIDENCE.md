# Issue #233 — Dashboard period presets evidence

Status: **FINALIZED WITH REAL-RUNTIME ENVIRONMENT GAP — owner resolved Company calendar rule**.

## A. Baseline

- Fetched `origin --prune` on 2026-09-29. Actual `origin/main` and branch base: `098feba91035eceaa7c623e517873f255ddb6d11`.
- Work branch: `feat/233-dashboard-period-presets`; tracked source was clean before branching.
- The owner's attached Issue #233 brief and subsequent binding decision define this task. The public GitHub issue page was not readable through the available endpoint.
- The initial investigation was **BLOCKED** because the request did not define how Company "current" could map to its one absolute selector across Location timezones. The Project Owner resolved this: frontend presets use the browser current instant projected into `Organization.timezone` for Company or `Location.timezone` for exact Location. Company Today is a **Company calendar date label**. The unchanged backend still interprets that label per Location under DEC-092. No server current-date contract is needed.

## B. Period surface inventory

The inventory searched Dashboard application and E2E code for period, range, date, week, month, selectors, URL state, and read paths. These are all current user-selectable business reporting periods:

| Class / surface | Old behavior | New behavior | Existing API selector | Preset calendar zone |
| --- | --- | --- | --- | --- |
| A — Overview (`overview-page.tsx`) | Custom from/to only; absent URL produced no period read | Shared Today default, 2D/3D/7D/14D/30D and Custom | Inclusive `from/to`, maximum 31 days | Organization or selected Location |
| A — Payments (`payments-page.tsx`) | Same manual period requirement | Same shared controls and automatic Today read | Same `from/to`; separate existing current financial read | Organization or selected Location |
| A — Analytics (`analytics-page.tsx`) | Independently parsed raw URL and Custom dialog | Same shared controls and automatic Today read | Same `from/to`; one Company read or bounded Location families | Organization or selected Location |
| B — Reports (`reports-page.tsx`) | Daily/Weekly/Monthly dialog opened with blank selector | Dialog opens prefilled with current Daily date, Monday week start, or month; existing Load preview action sends one read | `date`, `weekStart`, or `month` | Organization or selected Location |

No C — OTHER_BUSINESS_PERIOD selector was found. D — DISPLAY_ONLY includes Audit event times, Visit Contact history times, Operations task/vehicle/incident timestamps, and Administration lifecycle/update timestamps. E — DOMAIN_DATE_INPUT includes operating-hours status/open/close times. D/E are outside this task and were not edited. Reports' input type is selected dynamically, so a literal `type="week"` search alone would miss it.

## C. Shared architecture

- Pre-code domain check: no persisted entity or ValetSession/Task/Dispatch transition is changed. The only persisted fields read for selector resolution are the existing Organization and Location IANA timezones. Existing authorization, scope selection, and Company-default/Location-override configuration behavior remain in place. No new constraint, index, schema, or migration is required; the work stays within the approved Management Dashboard MVP reporting surfaces.
- `dashboard-period-calendar.ts` owns pure IANA civil-date projection, civil-day arithmetic, six typed relative presets, and native report-selector defaults. It accepts an instant, timezone, and preset/kind; components contain no calendar math.
- `dashboard-period-selection.ts` distinguishes absent URL (`TODAY`), valid explicit absolute URL (`CUSTOM`), valid `preset=`, and invalid explicit URL. `use-dashboard-period.ts` connects this model to URL navigation, the selected scope, and a stable civil-date snapshot. The snapshot is recomputed synchronously on preset activation, back/forward, and scope render; a bounded visible/online clock check notifies rollover while a preset remains active.
- One `DashboardPeriodControl` renders EN/AR preset buttons and one FocusDialog Custom editor across all A pages. Each page retains its own read and presentation contracts. Reports uses only its native report kinds and selectors.
- Existing `use-intelligence-read.ts` request identity, `ScopeGenerationGuard`, aborts, and settlement fencing remain. Its optional same-key retry snapshot retention is enabled only for single-endpoint A period reads, so independently settling Location endpoint families cannot mix old and new response generations. Other reads, including Reports preview/export, keep prior behavior.

## D. Authoritative civil-date source

The Project Owner explicitly permits `Date.now()` as a **selector convenience instant**. `Intl.DateTimeFormat(..., { timeZone })` projects that instant to canonical civil date in the persisted scope timezone. The backend remains authoritative for metrics, boundaries, aggregation, reports, and KPI truth. No browser-local calendar fields or elapsed-millisecond day subtraction are used. At `2026-09-28T21:30:00Z`, Company `Asia/Amman` resolves Today to `2026-09-29`, while Location `America/New_York` resolves it to `2026-09-28`; the same absolute Company date label continues through its existing API and per-Location interpretation.

## E. Overview

Initial Company/Location period reads dispatch automatically for Today after scope resolution. Shared presets and Custom feed the existing endpoint family; the existing current/queue panels and Cars Handled, average, incident, SLA and zero/unavailable presentation logic were not changed.

## F. Payments

Initial period financial read dispatches for Today. Shared presets and Custom feed the existing Company analytics or exact Location financial analytics family. Current financial overview and currency-separated rendering remain.

## G. Analytics

Initial Today read uses one Company endpoint in All Locations or four existing bounded analytics families in exact Location. Presets, Custom, URL validation, and scope recomputation share the same model as Overview/Payments. No formula or chart data transformation changed.

## H. Reports

Daily opens with the scope calendar date, Weekly with the containing Monday, Monthly with `YYYY-MM`. Opening itself causes no report GET; the existing Load preview action immediately works without typing and sends one native-selector GET. Historical selectors remain editable and absolute. Preview/export API, entitlement, replay, lost-response, and object-URL protections were not changed. Reopening follows the then-current calendar date.

## I. Additional surfaces

None in A, B, or C beyond the four rows in section B. D/E surfaces remain outside scope.

## J. URL semantics

Missing `from/to/preset` chooses Today without rewriting the URL. Valid `from/to` remains Custom. A validated `preset` query keeps relative identity across re-render, scope switch, and browser back/forward. Explicit partial, duplicate, impossible, reversed, over-31-day, or conflicting query values remain invalid and dispatch zero period business reads. Custom Cancel/Escape leaves the previous URL and selection intact.

## K. Scope/race proof

The existing request key includes identity/session/selection generations, scope IDs, endpoint family, absolute selector, and retry revision. Company-to-Location-to-Company, stale period success/failure, identity and session invalidation, and export races remain covered by the affected suites. New E2E exercises a 7D Company-to-Location-to-Company switch and a Location A-to-B-to-A switch with different persisted timezones; relative absolute ranges recompute while Custom keeps its absolute range. Rapid Today-to-30D-to-7D-to-2D changes make one bounded request per selection and fence delayed older success and failure responses.

## L. Refresh/rollover

The existing pages do not poll period analytics. The relative clock checks at one-minute intervals only while a relative preset is active; hidden/offline ticks do not notify a new date, and visibility/online resume checks immediately. A changed civil date updates the absolute selector and triggers its normal read; unchanged dates create no extra read. Re-entering a preset after Custom, including across midnight, resolves from the current instant before any read, preventing an obsolete selector request. Custom has no active clock and never moves. Reports current defaults advance when reopened. Same-key retry retention keeps a valid single-endpoint period snapshot and shows a visible EN/AR Refreshing status; multi-endpoint Location periods use their existing Loading state until all families settle. New scope/period keys cannot reuse retained data.

## M. Accessibility/RTL/responsive

One button group uses `aria-pressed`, full accessible names for compact 2D/3D/etc., visible focus, EN/AR labels, a bidi-isolated absolute range, and Company/Location timezone wording. Custom uses FocusDialog with Escape/cancel and focus restoration. The new visual E2E covers each of the four surfaces in EN Light desktop, EN Dark desktop, AR RTL Dark desktop, and AR RTL Dark narrow viewport, including a document horizontal-overflow assertion. Captured page images for all four surfaces were physically inspected for active-state legibility, control placement, cards/tables, RTL, and overlap. The live concept reference at `http://localhost:3011/` was also inspected; the candidate images came from the authenticated Playwright fixture because a separate direct browser tab did not share its login session.

## N. Request budgets

The new focused E2E observes exactly one initial Company analytics request on each A page, one Company request per preset selection, and zero Location fan-out. The Location switch uses the existing bounded Location endpoint family. Reports opening produces zero report GETs and Load preview produces one.

## O. Privacy/security

No backend, API/contract, schema, migration, dependency, authentication, MFA, entitlement, or export implementation changed. URL state contains only non-sensitive selector metadata; no protected payload is persisted. Existing authorization and report-export regression cases are included in the Dashboard E2E suite.

## P. Tests

- Pure calendar and URL tests: 22 passing. They cover six presets, positive/negative zones, same-instant differing dates, month/year/leap/DST boundaries, report selector dates and Weekly/Monthly rollover, and invalid URL distinctions.
- New `md233-period-ux.spec.ts`: 10 passing on focused runs. It covers all three A-page initial/preset requests, scope zones, Custom stability, all three Company report defaults, exact Location report default, online rollover, and report reopen rollover.
- New `md233-period-refresh.spec.ts`: 2 passing on isolated focused run. They verify same-selection single-endpoint snapshot retention with a visible Refreshing status, and Custom-to-Today activation across midnight with exactly one current-date request.
- New `md233-period-scope-race.spec.ts`: 3 passing on focused run. It verifies relative Location A-to-B-to-A selector recomputation and delayed old success/failure rejection across rapid preset changes.
- New `md233-period-visual.spec.ts`: 4 passing on focused runs, each visiting all four surfaces at one locale/theme/viewport combination.
- An earlier complete Dashboard E2E run had 462 passed / 21 failed due old period UI expectations; each of those assertions was updated for the accepted Today/default and shared Custom behavior. A targeted repeat across affected cases passed 60/60. The first complete post-correction Dashboard E2E run passed **488/488** in 18.2 minutes. After refresh/race review fixes, the focused five-spec repeat passed 49/49. The civil-date activation fix then passed 14/15 focused cases; its one failure was `ERR_NETWORK_IO_SUSPENDED` during `page.goto` under concurrent test/build load, before an application assertion. The affected refresh spec passed 2/2 in an isolated rerun. The later expanded **492-case complete E2E run was INTERRUPTED** at case 396 by the Project Owner's stop instruction; 395 cases had completed with no failures reported at that point. It is not a pass.
- Final focused checks, run sequentially on the current code: `corepack pnpm --filter @valet/dashboard test` **PASS**, 71 files and 539/539 tests; `corepack pnpm --filter @valet/dashboard exec playwright test e2e/md233-period-ux.spec.ts e2e/md233-period-refresh.spec.ts e2e/md233-period-scope-race.spec.ts e2e/md233-period-visual.spec.ts e2e/md05-overview-payments.spec.ts e2e/md05-analytics.spec.ts e2e/md05-period-endpoint-focus.spec.ts --reporter=line` **PASS**, 70/70 cases; `corepack pnpm --filter @valet/dashboard typecheck` **PASS**.
- Final repository gates: `corepack pnpm lint` **PASS**, 11/11 tasks; `corepack pnpm architecture:check` **PASS** with only unrelated grandfathered file-size warnings; `corepack pnpm test:build-contract` **PASS**, 4/4 tests; `corepack pnpm build` **PASS**, 10/10 tasks; `git diff --check` **PASS**. An earlier `corepack pnpm typecheck` also passed 11/11 tasks; it was not part of the final requested check sequence and was not rerun.
- A local real-runtime attempt started the compiled API and Dashboard, but all eight selected runtime cases stopped before assertions at the fixture's `E2E_APPROVED_DATABASE` guard. The configured database was the populated shared development database; the guard was not bypassed. This is an environment gap rather than an application assertion failure.

## Q. File sizes

All new and modified authored code/style/test files are below 300 physical lines after formatting the new files. The highest modified file is `md05-analytics.spec.ts` at 295 lines; the highest new file is `md233-period-ux.spec.ts` at 272 lines. Exact post-edit counts:

| File under `apps/dashboard/` | Physical lines |
| --- | ---: |
| `e2e-runtime/request-bounds.spec.ts` | 46 |
| `e2e/md-r02-overview-parity.spec.ts` | 268 |
| `e2e/md-r09-lifecycle.spec.ts` | 143 |
| `e2e/md-r09-visual.spec.ts` | 115 |
| `e2e/md05-analytics.spec.ts` | 295 |
| `e2e/md05-closure.spec.ts` | 195 |
| `e2e/md05-location-race.spec.ts` | 94 |
| `e2e/md05-overview-payments.spec.ts` | 292 |
| `e2e/md05-period-endpoint-focus.spec.ts` | 208 |
| `e2e/md06-cumulative-ui.spec.ts` | 139 |
| `e2e/md233-period-refresh.spec.ts` | 90 |
| `e2e/md233-period-scope-race.spec.ts` | 130 |
| `e2e/md233-period-ux.spec.ts` | 272 |
| `e2e/md233-period-visual.spec.ts` | 84 |
| `e2e/support/md05-analytics-visual-proof.ts` | 212 |
| `e2e/support/md05-reports-interaction-proof.ts` | 125 |
| `e2e/support/md05-visual-proof.ts` | 287 |
| `src/features/intelligence/analytics-page.tsx` | 204 |
| `src/features/intelligence/analytics-presentation.ts` | 158 |
| `src/features/intelligence/dashboard-period-calendar.test.ts` | 98 |
| `src/features/intelligence/dashboard-period-calendar.ts` | 95 |
| `src/features/intelligence/dashboard-period-control.module.css` | 83 |
| `src/features/intelligence/dashboard-period-control.tsx` | 211 |
| `src/features/intelligence/dashboard-period-selection.test.ts` | 47 |
| `src/features/intelligence/dashboard-period-selection.ts` | 68 |
| `src/features/intelligence/overview-page.tsx` | 165 |
| `src/features/intelligence/payments-page.tsx` | 157 |
| `src/features/intelligence/reports-copy.ts` | 151 |
| `src/features/intelligence/reports-page.tsx` | 279 |
| `src/features/intelligence/use-dashboard-period.ts` | 112 |
| `src/features/intelligence/use-intelligence-read.ts` | 137 |

`src/features/intelligence/use-explicit-analytics-period.ts` was deleted after all three consumers migrated; `docs/ISSUE-233_DASHBOARD_PERIOD_PRESETS_EVIDENCE.md` is the only new documentation file. Generated `next-env.d.ts` and `test-results/` are excluded from the final change.

## R. Git

Branch is based on the SHA above. The finalization sequence commits and pushes this branch after the documented checks. No PR or merge is requested.

## S. PASS / GAP / BLOCKED

- **PASS:** Owner calendar decision applied over unchanged absolute contracts; complete four-surface inventory and implementation; 22 pure unit cases, 15 new behavior E2E cases, 4 new visual E2E cases, 539 Dashboard unit tests, an earlier complete 488/488 E2E run, final focused 70/70 E2E run, sequential final gates, and physical four-surface inspection.
- **GAP:** The later 492-case complete E2E run was interrupted by instruction and was not rerun. Real-runtime fixture assertions require a dedicated, explicitly approved local test database; the current shared development database is unsuitable. All eight attempted runtime cases stopped at the database guard before application assertions.
- **RESOLVED historical blocker:** Company current selector semantics were supplied by the Project Owner after the initial BLOCKED investigation.
