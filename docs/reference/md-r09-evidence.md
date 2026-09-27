# MD-R09 — Payments and Analytics reference parity

## A. Baseline and scope ledger

Required and verified main: `bd2edb997c385034702a2d5c789e0f36b18362fa`.
Branch: `fix/md-r09-payments-analytics-reference-parity`. One normal checkout.

Allowed: feature-local Payments/Analytics presentation, focused tests, this evidence.
Forbidden: backend/contracts/schema/dependencies, new formulas, transaction ledger,
exports, Validations workflow, R10, issue #230, unrelated shared refactors.

Entities read: Organization, Location, Payment/Validation/Refund aggregates,
Shift cash reconciliation, ValetSession duration/completion aggregates, Incident,
OrganizationMembership work evidence. No entity mutations, ValetSession or
Task/Dispatch transitions, new constraints/indexes, audit writes, or configuration
changes. Existing Company-default/Location-override behavior remains server-owned.
This is approved MVP Management presentation remediation.

## Contract ledger before implementation

| Category | Binding source | Implementation consequence |
| --- | --- | --- |
| LOCKED authority | DEC-080, DEC-088; task §§5,19–23 | Preserve current CA Company/exact ACTIVE Location and LM exact granted ACTIVE Location reads; persisted server authority/entitlement; no field capability changes or persistent response storage. |
| LOCKED metrics | DEC-090, DEC-095; docs/25 §§15–17; task §§8,12–16 | Keep exact source fields, completed-visit numerator, nulls, sample/ratio evidence, signed cash and currency cohorts. |
| LOCKED Company | DEC-092; task §§15,22 | One Company endpoint, source recomputation and persisted Location timezone boundaries; no browser aggregation/fan-out. |
| LOCKED finance | DEC-052, DEC-053, DEC-057; task §§8–10 | Exact strings, no FX/rounding, explicitly current projection, pure localized enum labels. No financial mutation/release change. |
| LOCKED requests | docs/25 §§9M,10M; task §§17–21 | Preserve explicit dates, existing request identities, retries and stale success/failure fencing. |
| DERIVED presentation | task §§7,9,11,13,24–25,28; live reference | Four cards; one Payments detail panel; two Analytics charts; reuse tested duration formatter, compact expandable evidence, accessible data tables, logical CSS. |
| FORBIDDEN | task §§0,26,34 | No invented source, scope expansion, third Analytics panel, provider/transaction/export fiction. |
| UNRESOLVED | None for retained source-backed surfaces | Reference-only controls remain omitted with exceptions below. |

Persistence, concurrency, privacy and audit authority remain the existing server
and `useIntelligenceRead` contracts. Presentation code introduces no new policy.

## B. Live reference inspection (2026-09-27)

Chromium via repository Playwright, scale 1 / zoom 100%, 1440×900 and 480×900.
Reference `http://localhost:3011/`, Payments and Analytics navigation states;
candidate `http://localhost:3003/payments` and `/analytics`.
Reference screenshots/JSON captured before candidate evidence under ignored
`tmp/r09-evidence/reference-*`; pre-edit candidate under `baseline-*`.
Candidate inspection uses the existing test transport fixtures, not live API data.

Measured desktop reference:

| Measurement | Payments | Analytics |
| --- | --- | --- |
| H1 origin / typography | (292,96), 24/32px, 700 | (292,96), 24/32px, 700 |
| Cards top / width / height | 174 / 267 / 124.5px | 176 / 267 / 136px |
| Grid gap / card padding / radius | 16 / 20 / 12px | 16 / 20 / 12px |
| Icon size / radius | 40 / 12px | 44 / circular |
| Primary values | 24/32px, 800, monospace | 30/36px, 700 |
| Main region top / width | 322.5 / 1116px | 336 / 1116px |
| Charts | N/A | 546px each, 24px gap, 348px panels, 260px SVG |
| Light / dark surface | white / #0d152f | white / #0d152f |
| Border / dark border | #e2e8f0 / #172346 | #e2e8f0 / #172346 |

At 480px the reference keeps its fixed sidebar, leaving 156px for content.
Cards and charts stack but controls overflow the content area. Reference has no
working Arabic locale: Settings renders an inert “Arabic Preview / RTL Ready”
tile. No AR reference result is claimed. Candidate baseline captured all 16
route × viewport × locale × theme states before source edits.

## C. Intentional visual exceptions

| Reference element | Production treatment | Reason / authority |
| --- | --- | --- |
| Revenue/average-payment/success metrics, trend badges | Existing collected/paid/digital/validation facts; evidence in secondary treatment | TRUTHFUL_STATE, PROTOTYPE_FICTION; task §§7–10 |
| Transactions, search/method filters, Export | One financial detail container with real period/validation/cash/current facts | UNSUPPORTED_BACKEND; task §9, docs/25 §9 |
| Guest Satisfaction and Revenue chart | SLA/Incidents cards and source duration comparison | PROTOTYPE_FICTION; task §§11–14 |
| Default dates / independent chart presets | Explicit shared period and existing focus-safe dialog | TRUTHFUL_STATE; task §§17–18 |
| No coverage/evidence controls | Compact expandable source evidence inside retained cards/panels | TRUTHFUL_STATE, ACCESSIBILITY; DEC-092/095 |
| Fixed crowded narrow shell | Existing responsive shell, stacked cards/charts, contained table scrolling | ACCESSIBILITY; task §25 |
| Inert Arabic preview | Actual EN/AR and logical RTL layout | LOCALIZATION; task §24 |
| Synthetic data and uniform card heights | Exact independent currency cohorts; content can grow without clipping | TRUTHFUL_STATE; DEC-053/092 |

## E. Payments result

Exactly four summary cards: Collected, Paid Payments, Digital Payment Rate,
Validation Rate. One major Financial Breakdown container holds period currency
groups, validation/rate evidence, cash reconciliation and (only at exact Location
scope) the explicitly current non-completed-session projection. Method/status
codes have exhaustive typed EN/AR labels. Each currency remains separate; exact
decimal strings, signed variance and real zero survive. Null rates remain
Unavailable, with their source numerator/denominator inspectable in the detail
table. No transaction ledger, financial export, standalone Validations route,
cross-currency total, FX conversion or provider state was added.

## F. Analytics result

Exactly four cards: Cars Handled, Avg. Retrieval Wait, SLA Compliance, Incidents.
Exactly two chart panels: Vehicle Activity and Duration Comparison. Cars Handled
uses the existing completed-visit numerator; activity uses returned
`carsHandledPerDay`. The five duration series still use their returned metrics.
The existing exact-decimal duration formatter displays e.g. `640.000` as
`10m 40s`; raw seconds, samples and contributing Locations remain in keyboard
accessible data/evidence. Null durations/SLA stay unavailable; actual zero remains
zero. Expandable card evidence retains ratios, missing targets, invalid intervals,
attribution and incident-rate evidence. Company coverage and persisted timezone
boundaries remain available inside the second panel. No Guest Satisfaction,
Revenue Trend, invented dates/points or fallback series.

## G. Endpoint and request matrix

Counts below are asserted browser transport requests after selecting a valid
period in a fresh authorized scope. They are not claims about production traffic.

| Role / scope / page | Actual families | Count |
| --- | --- | --- |
| CA Company Payments | `/v1/staff/management/organizations/:organizationId/analytics/all-locations?from=…&to=…` | 1 |
| CA Location Payments | `/v1/staff/dashboard/locations/:locationId/overview/financial`; `/analytics/financial?from=…&to=…` under the same Location prefix | 1 + 1 |
| LM Location Payments | Same exact Location current and period financial families | 1 + 1 |
| CA Company Analytics | Company all-locations endpoint above | 1 |
| CA Location Analytics | Exact Location `/analytics/operations`, `/analytics/financial`, `/analytics/incidents`, `/analytics/kpis`, each with the explicit period | 1 each (4 total) |
| LM Location Analytics | Same four granted exact Location families | 1 each (4 total) |

Company mode has zero Location fan-out. Location mode has zero Company analytics
requests. Locale/theme/disclosure changes do not dispatch new business reads.
Current financial projection remains independent of the selected period.

## H. Authority and security

The protected dashboard, selected-scope provider, API client, request identity and
`useIntelligenceRead` are unchanged. CA Company, CA exact ACTIVE Location and LM
exact ACTIVE granted Location retain their existing paths. Supervisor, Employee,
Guest, stale/inactive Location and denied commercial context are covered by
negative browser tests; selected API suites independently exercise server scope
authorization. A denied commercial context cannot mount either page or dispatch
its financial/analytics reads. Direct URLs retain the same guards.

## I. Concurrency

Request identity still includes session generation, identity generation,
Organization, scope kind, exact Location, endpoint family, dates, selection and
retry revisions. Browser proofs cover period A→B stale success/failure,
Company→Location→Company, Location A→B→A stale success/failure, explicit retry and
pending reads across logout/replacement sign-in. Tests assert request budgets.
## O. Privacy and storage

No new request cache, browser aggregation, mutation, audit write or persistent
business storage exists. Retained MD-05 privacy checks inspect localStorage,
sessionStorage, IndexedDB and Cache Storage after Company and Location reads.

## J. Currency, time and coverage

JOD/USD cohorts and three-decimal source strings remain separate; no FX or
float-based monetary calculation. Cash expected/reported/variance are the returned
ended-shift facts. Location dates retain server Location-local calendar semantics.
Company aggregation remains server-owned across persisted Location timezone
boundaries, with total/active/inactive Location coverage. Missing is not zero.

## K. Accessibility and i18n

Both pages require explicit canonical real dates, ordered From≤To, at most 31
inclusive days; low years, noncanonical, impossible, reversed, missing and
overlong periods fail before dispatch. Native dialog behavior retains keyboard
entry, focus containment, Escape and focus restoration. New native details
controls expose evidence without obscuring the primary metrics. Scrollable
financial tables, chart data, timezone lists and source evidence are focusable;
table headers/captions and chart text alternatives retain source semantics.
EN, AR/RTL, bidi numeric/date/currency values, both themes and 480px layouts are
covered. Candidate page-level horizontal overflow is absent in all matrix states.

## P. Scope review and bounded verdict

Review target: local task diff against `bd2edb997c385034702a2d5c789e0f36b18362fa`.
The implementation-guardian and code-review skills were applied to the actual
diff, task attachment, Accepted DECs listed above, security, Definition of Done
and structure rules. This is a presentation-only read path: protected mutation
ordering, database/audit writes and new downstream domain capability are N/A.
Existing server authorization and client generation fencing were preserved.
Duration/currency helpers were inspected for exact decimal and null behavior.
The file splits stay local to the two pages and preserve shared contracts.

No #230/R05 follow-up, R10, maps, keys, incidents, audit, report/export or unrelated
R01–R08 implementation was changed. Existing Overview checks remain regression
coverage. No backend, public/shared contract, schema, migration, dependency or
production configuration changed. No secrets, environment files, screenshots,
test-results or debug logs belong in the commit.

The review found and resolved: displaced chart content caused by flex spacing;
keyboard-inaccessible overflow evidence; stale visual assertions for the live
Payments badge reserve/dark divider; and a type-only component import cycle.
No unresolved source/security/domain finding remains. Merge is still gated by
independent review and repository CI; this task does not authorize merge.

## L. Local validation evidence

| Gate | Exact command | Result |
| --- | --- | --- |
| Dashboard unit tests | `pnpm --filter @valet/dashboard test` | PASS: 67 files, 514 tests |
| Focused R09 and retained MD-05 | `pnpm --filter @valet/dashboard test:e2e md-r09- md05-overview-payments.spec.ts md05-analytics.spec.ts md05-period-endpoint-focus.spec.ts md05-location-race.spec.ts md05-navigation-accessibility.spec.ts md05-storage-privacy.spec.ts` | PASS: 111 tests (46 R09 + 65 retained) |
| Visual stability | `pnpm --filter @valet/dashboard test:e2e md-r09-visual.spec.ts --repeat-each=5 --output=../../tmp/r09-visual-repeat` | PASS: 80/80, all 16 states five times |
| Lint | `pnpm lint` | PASS: 11/11 workspace tasks |
| Typecheck | `pnpm typecheck` | PASS: 11/11 workspace tasks |
| Architecture | `pnpm architecture:check` | PASS: existing untouched grandfathered warnings only |
| Normal verification build | `pnpm build` | PASS: 10/10 workspace tasks; no production build |
| Whitespace | `git diff --check` | PASS |

Selected PostgreSQL suites: 11 files, 45 tests PASS (compound 3, standard 19,
race 23). Exact owned-harness command, with `TEST_DATABASE_URL` set only for the
process from the existing local `MIGRATION_DATABASE_URL` (credentials omitted):

```powershell
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-analytics-api.integration.test.ts test/dashboard-analytics-financial.integration.test.ts test/dashboard-analytics-financial-cohorts.integration.test.ts test/dashboard-analytics-kpis.integration.test.ts test/dashboard-analytics.integration.test.ts test/dashboard-overview-financial.integration.test.ts test/management-company-analytics-authorization.integration.test.ts test/management-company-analytics-boundaries.integration.test.ts test/management-company-analytics-financial.integration.test.ts test/management-company-analytics-snapshot-concurrency.integration.test.ts test/management-company-analytics-weighting.integration.test.ts
```

Focused formatting PASS for all new R09 code/tests using:

```powershell
pnpm exec prettier --check 'apps/dashboard/e2e/md-r09-*.spec.ts' apps/dashboard/e2e/support/md-r09-fixtures.ts 'apps/dashboard/src/features/intelligence/payments-{breakdown-types,current-table,labels,labels.test,period-tables,table-primitives}.{ts,tsx}' 'apps/dashboard/src/features/intelligence/analytics-{cards,card-evidence,chart-data}.tsx' apps/dashboard/src/features/intelligence/analytics-evidence.module.css
```

Initial failed/interrupted attempts are not reported as passes. PostgreSQL first
failed because Docker was stopped, then because the harness used its default
credentials; the declared local Compose PostgreSQL was started and the rerun used
existing local credentials successfully. Early browser runs exposed test selector
mistakes and stale presentation assertions, which were corrected without removing
checks. One Overview run lost its period during concurrent development refresh;
the complete unchanged-source rerun passed. No unrelated backend fix was made.

Evidence files (local only, excluded from commit):

- `tmp/r09-evidence/reference-*`: 8 reference PNGs and matching geometry JSON;
- `tmp/r09-evidence/baseline-*`: 16 pre-edit candidate states;
- `tmp/r09-evidence/candidate-*`: 16 final candidate PNGs and geometry JSON;
- `tmp/r09-visual-repeat/**/r09.png`: 80 full-page stability screenshots;
- `tmp/r09-combined.log`, `tmp/r09-visual-repeat.log`, `tmp/r09-backend.log`,
  `tmp/r09-unit-final.log`, `tmp/r09-lint-final.log`,
  `tmp/r09-typecheck-final.log`, `tmp/r09-architecture-final.log`.

Final desktop candidate measurements: Payments cards 267×124.5 at y174, main
panel y322.5; Analytics cards 267×136 at y176, two 546px panels starting y336 with
24px gap. Both plots align at the same y and retain 260px SVG height. Analytics
panels grow to 520px with Company coverage/evidence; this is the documented
TRUTHFUL_STATE/ACCESSIBILITY exception to the 348px reference panel. At 480px,
candidate cards/panels are 440px wide at x20, with contained financial scrolling.

## R. External limitations and release boundary

Live 3011 reference was available; its Arabic control is an inert prototype tile,
so no Arabic reference screenshot is claimed. Candidate locale evidence is real.
Browser business-state verification used controlled transport fixtures; the
selected API tests exercised real PostgreSQL and the HTTP boundary independently.
This does not claim a complete deployed end-to-end operation.

The compiled local API started on 3001 using existing local credentials and
checked-in development defaults. Direct TSX startup exposed an unrelated decorator
dependency-resolution problem; compiled startup succeeded. The normal dashboard
development server is restored on 3003. Starting the built dashboard with an
explicit local API origin was rejected by automatic approval review (only
“blocked by policy” was supplied), so that optional preview mode is not claimed.
The normal build and required development-browser gates passed independently.

Remote CI is a separate post-push observation. No PR or merge is authorized.
Production configuration/deployment proof remains Issue #227. No production
origins, credentials or deployment values were invented, and `build:production`
was not run. Issue #230 and R10 were untouched.

## N. Backend / contract / schema / dependency status

| Change | YES / NO |
| --- | --- |
| Backend | NO |
| Public/shared contracts | NO |
| Schema | NO |
| Migration | NO |
| Dependency | NO |
| Production configuration | NO |

## Q. Git delivery

Commit message: `fix(dashboard): restore payments and analytics reference parity`.
Push only `origin/fix/md-r09-payments-analytics-reference-parity`.
The delivery message records the final commit SHA and verified final status;
the documentation cannot embed its own commit hash. Main stays at the required
base. No PR and no merge. Independent review and actual CI remain merge gates.

## S. Source verdict

All required local R09 source, behavior, visual, authority, concurrency,
accessibility and validation gates passed. Ready for independent review;
this is not production-deployment or merge approval.

## D / M. File inventory and physical line counts

All authored code/test files below remain ≤300 physical lines. No grandfathered file was expanded.
The evidence document itself is documentation and is exempt.

| File | Lines | Reason |
| --- | ---: | --- |
| apps/dashboard/e2e/md-r09-analytics.spec.ts | 92 | Source durations, exact evidence and keyboard data access. |
| apps/dashboard/e2e/md-r09-lifecycle.spec.ts | 142 | Logout/replacement, retry, period validation and dialog focus. |
| apps/dashboard/e2e/md-r09-payments-races.spec.ts | 154 | Payments period and scope races with request budgets. |
| apps/dashboard/e2e/md-r09-payments.spec.ts | 107 | Payments composition, currency truth, labels and exact request families. |
| apps/dashboard/e2e/md-r09-states.spec.ts | 158 | Zero/empty states, commercial denial and role denial. |
| apps/dashboard/e2e/md-r09-visual.spec.ts | 115 | Live-measured 16-state visual matrix and repeat artifacts. |
| apps/dashboard/e2e/md05-analytics.spec.ts | 294 | Retain raw source cells while asserting new human-duration column. |
| apps/dashboard/e2e/md05-overview-payments.spec.ts | 291 | Assert added digital null-rate evidence. |
| apps/dashboard/e2e/support/md-r09-fixtures.ts | 80 | Focused shared browser entry, data and selectors. |
| apps/dashboard/e2e/support/md05-visual-contract.ts | 129 | Correct live badge reserve and dark divider measurements. |
| apps/dashboard/e2e/support/md05-visual-proof.ts | 298 | Assert measured dark divider instead of light color in both themes. |
| apps/dashboard/src/features/intelligence/analytics-activity-chart.tsx | 157 | Expose chart data and keep tooltip positioned relative to the plot. |
| apps/dashboard/src/features/intelligence/analytics-card-evidence.tsx | 103 | Extract unchanged card evidence fields. |
| apps/dashboard/src/features/intelligence/analytics-cards.tsx | 208 | Compact durations and expandable secondary evidence. |
| apps/dashboard/src/features/intelligence/analytics-chart-data.tsx | 114 | Semantic activity/duration tables with exact values. |
| apps/dashboard/src/features/intelligence/analytics-copy.ts | 226 | EN/AR evidence and display-duration labels. |
| apps/dashboard/src/features/intelligence/analytics-coverage.tsx | 121 | Extract cards and make boundary evidence compact/focusable. |
| apps/dashboard/src/features/intelligence/analytics-evidence.module.css | 55 | Disclosure, focus and table presentation. |
| apps/dashboard/src/features/intelligence/analytics-page.tsx | 296 | Use extracted card component; read logic unchanged. |
| apps/dashboard/src/features/intelligence/analytics-secondary-chart.tsx | 217 | Human-duration tooltip and accessible exact data. |
| apps/dashboard/src/features/intelligence/analytics-text-summary.tsx | 205 | Move chart tables and focus-enable source overflow. |
| apps/dashboard/src/features/intelligence/analytics.module.css | 284 | Top-align plots and wrap narrow controls. |
| apps/dashboard/src/features/intelligence/payments-breakdown-table.tsx | 65 | Compose narrow period/current components and coverage. |
| apps/dashboard/src/features/intelligence/payments-breakdown-types.ts | 19 | Shared view props without component import cycles. |
| apps/dashboard/src/features/intelligence/payments-breakdown.module.css | 222 | Reference typography, readable counts and scroll focus. |
| apps/dashboard/src/features/intelligence/payments-current-table.tsx | 119 | Explicit current projection with localized controlled labels. |
| apps/dashboard/src/features/intelligence/payments-labels.test.ts | 41 | Exhaustive EN/AR method/status label assertions. |
| apps/dashboard/src/features/intelligence/payments-labels.ts | 42 | Typed canonical method/status labels. |
| apps/dashboard/src/features/intelligence/payments-period-tables.tsx | 192 | Period, validation/rate and cash source sections. |
| apps/dashboard/src/features/intelligence/payments-summary-grid.tsx | 160 | Move fractions to evidence and identify null currency cohorts. |
| apps/dashboard/src/features/intelligence/payments-table-primitives.tsx | 82 | Exact money, rate evidence, states and named keyboard scrollers. |
| apps/dashboard/src/features/intelligence/payments.module.css | 189 | Match live subtitle, label and reserved trend geometry. |
| docs/reference/md-r09-evidence.md | N/A | Pre-code contract ledger, live measurements, exceptions and final evidence. |
