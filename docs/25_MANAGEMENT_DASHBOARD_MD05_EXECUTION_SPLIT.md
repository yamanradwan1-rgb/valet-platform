# MD-05 Management Dashboard Intelligence — Execution Split

This document is an execution split derived from the accepted MD-05 scope in
`docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md`. It does not redefine product
behavior, backend semantics, authorization, analytics formulas, financial cohorts,
report semantics, or the MD-06 boundary. If this document and a current
authoritative source differ, the authority order below controls and implementation
must stop on a material contradiction rather than improvise.

## 1. Baseline

Planning baseline verified after `git fetch origin --prune`:

- Repository root: `C:/Users/LP/Desktop/valet-app/valet-platform`
- Branch: `main`
- HEAD: `ca7511e4b1892b194bd209c328c713461456af43`
- `origin/main`: `ca7511e4b1892b194bd209c328c713461456af43`
- Working tree before planning: clean
- `main...HEAD`: 0 ahead / 0 behind
- `origin/main...main`: 0 ahead / 0 behind

This baseline already contains reviewed and merged MD-01, MD-02, MD-03, and
MD-04. Each implementation task below starts only after the preceding task has
been independently reviewed and fast-forwarded to `main`.

## 2. Authority order

Use this order for every implementation decision:

1. Latest Project Owner instruction.
2. Accepted Decisions.
3. `docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md`.
4. Current source-of-truth documentation.
5. Current shared contracts.
6. Current backend implementation.
7. Current production Dashboard implementation.
8. Frozen reference Dashboard.
9. Existing tests.

The reference is visual/product-shape evidence only. It is not authority for
business data, roles, formulas, mutations, routes, totals, filters, or report
behavior. `docs/24` explicitly records this reconciliation at lines 40-75 and
binds MD-05 to current C8/C9/C10 behavior at lines 1117-1166.

## 3. Sources completely reviewed

### 3.1 Repository and source-of-truth material

Reviewed for MD-05 authority, boundaries, current implementation state, or
engineering constraints:

- `AGENTS.md`.
- `docs/00_SOURCE_OF_TRUTH.md`.
- `docs/01_PRODUCT_SCOPE.md`, including Dashboard/reports/EN-AR MVP scope at
  lines 212-235.
- `docs/02_DOMAIN_MODEL.md`, including Payment, Validation, Tip, CashEntry,
  Refund and financial-fact semantics around lines 456-517.
- `docs/03_DATABASE_SCHEMA.md`, including timezone rules at lines 21-26,
  exact money/currency semantics at lines 44-59, and persisted Location
  timezone/currency at lines 205-259.
- `docs/04_VALET_SESSION_STATE_MACHINE.md`.
- `docs/05_ENGINEERING_RULES.md`.
- `docs/06_SECURITY_AND_DATA_RULES.md`, especially lines 713-754 for Company
  Admin MFA, All Locations authority, Location Manager continuity, and current
  Company analytics/report entitlement composition.
- `docs/07_DEFINITION_OF_DONE.md`.
- `docs/08_DECISIONS_LOG.md`.
- `docs/17_AGENT_CODE_STRUCTURE_RULES.md`.
- `docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md`, including C8/C9/C10
  lines 310-401; reference inventory lines 442-485; Page→API map lines
  806-836; shared task/retry/validation contract lines 840-913; MD-05 lines
  1117-1166; final DoD lines 1282-1350.

### 3.2 Accepted Decisions read completely

The following Accepted Decision files were read completely for this split:

- `docs/decisions/DEC-050_PHASE6_FINANCIAL_POLICY_PAYMENT_CORE.md`
- `docs/decisions/DEC-051_PHASE6_VALIDATION_TIPS_PRECOLLECTION_AUTHORITY.md`
- `docs/decisions/DEC-052_PHASE6_CASH_COLLECTION_RECONCILIATION_AUTHORITY.md`
- `docs/decisions/DEC-053_PHASE6_CURRENCY_MINOR_UNIT_AUTHORITY.md`
- `docs/decisions/DEC-057_PHASE6_FINANCIAL_RELEASE_AND_PROJECTIONS.md`
- `docs/decisions/DEC-060_PHASE7_OPERATIONAL_KPI_FORMULA_CATALOG.md`
- `docs/decisions/DEC-061_PHASE7_REPORT_EXPORT_AND_DELIVERY_COMPOSITION.md`
- `docs/decisions/DEC-062_PHASE7_BASIC_BRANDING_AND_SUBSCRIPTION_ENTITLEMENTS.md`
- `docs/decisions/DEC-078_COMPANY_ADMIN_MFA.md`
- `docs/decisions/DEC-080_COMPANY_ADMIN_AUTHORITY.md`
- `docs/decisions/DEC-088_MANAGEMENT_ENTITLEMENT_SAFETY.md`
- `docs/decisions/DEC-090_MANAGEMENT_KPI_DEFINITIONS.md`
- `docs/decisions/DEC-091_GUEST_RATING_AND_RETURNING_CONTACT.md`
- `docs/decisions/DEC-092_ALL_LOCATIONS_ANALYTICS.md`
- `docs/decisions/DEC-093_AUTOMATIC_REPORT_DELIVERY_DEFERRED.md`
- `docs/decisions/DEC-095_MANAGEMENT_KPI_SOURCE_CONTRACTS.md`

Material rules carried forward include:

- analytics periods are inclusive local dates, maximum 31 days; persisted
  Location IANA timezone defines UTC boundaries and PostgreSQL handles DST
  (`DEC-060:19-35`; `analytics-period.ts:36-53,110-119`);
- money is exact decimal text grouped by immutable Payment currency and
  currencies are never combined (`DEC-060:72-103`);
- official Retrieval Wait is request→READY; retrieval-start latency is auxiliary
  and must never be relabeled as Retrieval Wait (`DEC-060:37-55`);
- SLA uses the immutable request-time target snapshot; equality complies and
  denominator zero remains null (`DEC-095:19-42,68-99`);
- Cars per Active Employee uses the approved immutable work-evidence union and
  is not Shift count or staff-directory headcount
  (`DEC-095:130-168`);
- Cars Handed Off uses final `completed_by_membership_id` and missing
  attribution remains explicit (`DEC-095:170-178`);
- Key Exceptions are exactly `KEY_MISSING`, `WRONG_KEY`, `KEY_DAMAGED`,
  `KEY_LOCKED_INSIDE`; normal custody movement never counts
  (`DEC-095:101-128`);
- DEC-091 defines Guest Rating and Returning Contact source semantics, but
  current C9 contracts still expose neither aggregate; MD-05 therefore removes
  both from retained presentation rather than deriving them
  (`DEC-091:14-28,35-39`; `docs/24:365-366`);
- Company metrics are recomputed from source-level numerators/denominators and
  distinct membership evidence, never from browser Location fan-out
  (`DEC-092`, `company-analytics-operations-query.ts`,
  `company-analytics-kpi-query.ts`);
- report generation is manual-only CSV/PDF, uses Standard Company Admin MFA,
  has no stored report artifact or scheduled/email delivery, and a lost response
  must not cause an invisible retry (`DEC-061`, `DEC-093`,
  `docs/24:370-400`).

### 3.3 Shared contracts inspected

- `packages/contracts/src/management-control-plane.ts`
- `packages/contracts/src/location-overview.ts`
- `packages/contracts/src/location-overview-pagination.ts`
- `packages/contracts/src/location-financial-overview.ts`
- `packages/contracts/src/location-analytics-common.ts`
- `packages/contracts/src/location-analytics-operational.ts`
- `packages/contracts/src/location-analytics-financial.ts`
- `packages/contracts/src/location-analytics-incidents.ts`
- `packages/contracts/src/location-analytics-kpis.ts`
- `packages/contracts/src/company-analytics.ts`
- `packages/contracts/src/location-report-common.ts`
- `packages/contracts/src/location-report.ts`
- `packages/contracts/src/company-report.ts`
- `packages/contracts/src/management-commercial.ts`
- `packages/contracts/src/location-subscription.ts`

### 3.4 Backend implementation inspected

Location Dashboard:

- `apps/api/src/modules/dashboard/overview.controller.ts`
- `apps/api/src/modules/dashboard/overview-financial-query.ts`
- `apps/api/src/modules/dashboard/analytics.controller.ts`
- `apps/api/src/modules/dashboard/analytics-period.ts`
- `apps/api/src/modules/dashboard/analytics-operations-query.ts`
- `apps/api/src/modules/dashboard/analytics-financial-query.ts`
- `apps/api/src/modules/dashboard/analytics-incidents-query.ts`
- `apps/api/src/modules/dashboard/analytics-kpi-query.ts`
- `apps/api/src/modules/dashboard/analytics-kpi-sla-query.ts`
- `apps/api/src/modules/dashboard/analytics-kpi-workforce-query.ts`
- `apps/api/src/modules/dashboard/analytics-kpi-key-exceptions-query.ts`
- `apps/api/src/modules/dashboard/dashboard-location-authorization.ts`
- `apps/api/src/modules/dashboard/dashboard-read-authorization.ts`
- `apps/api/src/modules/dashboard/report.controller.ts`
- `apps/api/src/modules/dashboard/report-period.ts`
- `apps/api/src/modules/dashboard/report-read-service.ts`
- `apps/api/src/modules/dashboard/report-export-service.ts`
- `apps/api/src/modules/dashboard/report-csv-renderer.ts`
- `apps/api/src/modules/dashboard/report-pdf-renderer.ts`
- `apps/api/src/modules/dashboard/report-audit-writer.ts`
- `apps/api/src/modules/reporting/report-render-hardening.ts`

Company Management:

- `apps/api/src/modules/management/management-company-analytics.controller.ts`
- `apps/api/src/modules/management/management-company-analytics.service.ts`
- `apps/api/src/modules/management/company-analytics-source.ts`
- `apps/api/src/modules/management/company-analytics-coverage-query.ts`
- `apps/api/src/modules/management/company-analytics-operations-query.ts`
- `apps/api/src/modules/management/company-analytics-financial-query.ts`
- `apps/api/src/modules/management/company-analytics-incidents-query.ts`
- `apps/api/src/modules/management/company-analytics-kpi-query.ts`
- `apps/api/src/modules/management/company-report.controller.ts`
- `apps/api/src/modules/management/company-report-read-service.ts`
- `apps/api/src/modules/management/company-report-export-service.ts`
- Company report CSV/PDF renderers
- `apps/api/src/modules/management/management-authorization.ts`
- `apps/api/src/modules/management/management-commercial-access-policy.ts`
- `apps/api/src/common/http/api-errors.ts`

### 3.5 Current production Dashboard implementation inspected

- `components/foundation/protected-dashboard-route.tsx`
- `components/foundation/management-foundation-app.tsx`
- `components/foundation/protected-dashboard-context.tsx`
- `components/foundation/revalidate-selected-scope.ts`
- `components/foundation/selected-scope-base-request.ts`
- `components/foundation/resolve-navigation-authority.ts`
- `components/foundation/dashboard-feature-target.ts`
- `components/foundation/scope-presentation.ts`
- `components/scope/scope-entry-types.ts`
- `components/scope/scope-entry-route-policy.ts`
- `lib/api/dashboard-api-client.ts`
- `lib/api/dashboard-api-error.ts`
- `lib/auth/staff-auth-client.ts`
- `lib/scope/scope-generation.ts`
- `lib/scope/dashboard-commercial-access.ts`
- `lib/navigation/dashboard-navigation.ts`
- `lib/navigation/navigation-registry.ts`
- `lib/navigation/navigation-types.ts`
- `lib/i18n/locale.ts`, `locale-provider.tsx`, and current dictionaries
- `components/presentation/focus-dialog.tsx`
- current Operations, Administration, Visit Contacts, and Audit API/scope/read,
  generation, navigation, accessibility and race patterns.

Important current evidence:

- protected context already exposes the one `DashboardApiClient`,
  `identityGeneration`, `sessionGeneration`, and `selectedScope`
  (`protected-dashboard-context.tsx:8-13`);
- selected route revalidation rejects `COMPANY_ADMIN_SUBSCRIPTION` outside
  subscription and rejects `LOCATION_MANAGER_GRANT_SET` before protected
  content (`revalidate-selected-scope.ts:47-52`);
- `DashboardApiClient` fences identity/session generations, retries only GET
  once after a 401 refresh, and never automatically replays a rejected write
  (`dashboard-api-client.ts:51-101`);
- `ScopeGenerationGuard` is the current stale-success/stale-failure fence
  (`lib/scope/scope-generation.ts:6-39`);
- navigation has a feature-owned registration extension point
  (`lib/navigation/dashboard-navigation.ts:8-20`) and filters by implementation,
  role, scope and current authority (`navigation-registry.ts:59-100`);
- `FocusDialog` already owns labeling, Escape, focus containment and
  restoration (`components/presentation/focus-dialog.tsx:23-70`);
- the current Dashboard client parses JSON text only
  (`dashboard-api-client.ts:121-159`); there is no production binary download
  path, so MD-05D must extend the existing client boundary rather than add a
  second API/auth client.

Hot files measured before planning:

- `components/scope/use-scope-entry-controller.ts`: 300 lines.
- `components/foundation/management-foundation-app.tsx`: 291 lines.
- `lib/auth/staff-auth-client.ts`: 251 lines.
- `styles/shell.css`: 265 lines.
- `e2e/support/dashboard-api-fixture.ts`: 300 lines.
- `e2e/scope-authority.spec.ts`: 263 lines.
- `lib/api/dashboard-api-client.test.ts`: 261 lines.

MD-05 must not grow the 300-line scope controller or fixture. New binary-client
tests belong in a new test file rather than pushing the existing API-client test
past the line limit.

### 3.6 Frozen reference Dashboard inspected

Pages:

- `reference/vaylet- man dashboard/src/pages/OverviewPage.tsx`
- `reference/vaylet- man dashboard/src/pages/PaymentsPage.tsx`
- `reference/vaylet- man dashboard/src/pages/ValidationsPage.tsx`
- `reference/vaylet- man dashboard/src/pages/AnalyticsPage.tsx`
- `reference/vaylet- man dashboard/src/pages/ReportsPage.tsx`

Shared reference MetricCard, chart, control, Modal, AppShell/Sidebar and mock
report dependencies were also inspected. The reference contains fallback sample
chart data and lacks production Arabic/RTL/focus behavior; production must use
the current Dashboard i18n/presentation primitives.

### 3.7 Existing test/validation infrastructure inspected

Representative Dashboard proof:

- `e2e/operations-concurrency.spec.ts`
- `e2e/administration-concurrency.spec.ts`
- `e2e/scope-authority.spec.ts`
- `e2e/md04-scope-races.spec.ts`
- `e2e/md04-accessibility.spec.ts`
- `e2e/operations-visual-freeze.spec.ts`
- `e2e/support/dashboard-api-fixture.ts`

Relevant backend regression families include the current dashboard analytics,
KPI, financial, reports, commercial/finalization and Company
analytics/report/finalization integration tests under `apps/api/test/**`.

## 4. Current capability verification

Current source verifies the `docs/24:1130` statement that retained MD-05
behavior needs no backend or shared-contract addition.

| Capability | Current route | Scope | Current contract | Current authority |
|---|---|---|---|---|
| Current session state counts | `GET /v1/staff/dashboard/locations/:locationId/overview/session-state-counts` | exact active Location | `location-overview.ts:44-58` | CA Standard MFA at exact active Location or LM exact active grant; D-access |
| Current queue | `GET /v1/staff/dashboard/locations/:locationId/analytics/queue` | exact Location | `location-analytics-operational.ts:39-45` | same |
| Current financial projection | `GET /v1/staff/dashboard/locations/:locationId/overview/financial` | exact Location | `location-financial-overview.ts:7-51` | same |
| Location operations | `GET /v1/staff/dashboard/locations/:locationId/analytics/operations?from&to` | exact Location period | `location-analytics-operational.ts:8-37` | same |
| Location finance | `GET /v1/staff/dashboard/locations/:locationId/analytics/financial?from&to` | exact Location period | `location-analytics-financial.ts:14-51` | same |
| Location incidents | `GET /v1/staff/dashboard/locations/:locationId/analytics/incidents?from&to` | exact Location period | `location-analytics-incidents.ts:19-34` | same |
| Location KPIs | `GET /v1/staff/dashboard/locations/:locationId/analytics/kpis?from&to` | exact Location period | `location-analytics-kpis.ts:31-70` | same |
| Company analytics | `GET /v1/staff/management/organizations/:organizationId/analytics/all-locations?from&to` | Organization / All Locations | `company-analytics.ts:23-160` | CA Standard MFA; D-access |
| Location report preview | `GET /v1/staff/dashboard/locations/:locationId/reports/{daily,weekly,monthly}` | exact active Location | `location-report-common.ts:12-25`, `location-report.ts:53-114` | CA Standard MFA or LM exact active grant; D-access |
| Company report preview | `GET /v1/staff/management/organizations/:organizationId/reports/{daily,weekly,monthly}` | Organization | `company-report.ts:20-82` | CA Standard MFA; D-access |
| Location export | `POST /v1/staff/dashboard/locations/:locationId/reports/exports` | exact active Location | `location-report-common.ts:27-50` | CA Standard MFA or LM exact active grant; D-access + Export-access |
| Company export | `POST /v1/staff/management/organizations/:organizationId/reports/exports` | Organization | `company-report.ts:20-24` | CA Standard MFA; D-access + Export-access |

Backend evidence:

- all five Location analytics routes exist at
  `analytics.controller.ts:112-215`;
- Company analytics uses one Organization endpoint and repeatable-read server
  composition at `management-company-analytics.controller.ts:59-80` and
  `management-company-analytics.service.ts:18-41`;
- report preview/export routes exist for both scope families at
  `dashboard/report.controller.ts:105-195` and
  `management/company-report.controller.ts:71-163`;
- LM authorization requires active user/membership/Organization/Location plus an
  explicit Location grant (`dashboard-location-authorization.ts:13-53`);
- CA exact-Location reads require an active target Location and current Standard
  MFA (`dashboard-read-authorization.ts:58-83`);
- Company analytics names `ANALYTICS_READ`
  (`management-company-analytics.service.ts:23-34`) and Company reports name
  `REPORTS_READ` (`company-report-read-service.ts:74-93`);
- `REPORT_EXPORTS` requires both dashboardAccess and reportExports
  (`management-commercial-access-policy.ts:14-28`);
- Location export finalization reauthorizes after rendering
  (`report-export-service.ts:46-109`); Company export does the same at
  `company-report-export-service.ts:69-117`;
- 5 MiB, CSV hardening and deterministic PDF-safe text are server-owned
  (`report-render-hardening.ts:7-53`).

Current frontend gaps are limited to MD-05 work: `features/intelligence/**`
does not exist, MD-05 routes/navigation do not exist, and the current
`DashboardApiClient` has no binary response method. There is also one
Foundation integration mismatch that MD-05A must close: ordinary
`DASHBOARD` scope entry/revalidation permits Company Admin to retain/select an
inactive exact Location for historical Management use
(`scope-entry-route-policy.ts:20-35`), while the exact-Location C8/C9/C10
families consumed by MD-05 require an active Location. The already-revalidated
base authority contains enough truth to solve this without a backend change:
for CA exact Location, `locationMapsEligible` is computed from the freshly
resolved Management context and is true only for an active exact Location
(`selected-scope-base-authority.ts:178-200`); CA All Locations remains a
separate valid Company mode. MD-05A therefore adds one narrow
`MANAGEMENT_INTELLIGENCE` route/navigation requirement to the existing
Foundation authority pipeline. None of these frontend gaps is a backend/shared-
contract blocker.

## 5. MD-05 scope reconciliation

Binding scope is `docs/24:1117-1166`.

### KEEP / ADAPT

- **Overview:** preserve the reference cards/chart/two-panel composition. Replace
  named greeting, hard-coded scope claims, fake trends, sample hourly series and
  mock feed with current state plus authoritative analytics.
- **Payments:** preserve card/table/panel visual language. Replace transaction
  fiction with current exact-Location financial projection and period financial
  analytics, grouped by currency.
- **Analytics:** preserve card/chart/selector composition. Use exact Location or
  Company analytics and expose Company coverage/precision/missing evidence.
- **Reports:** preserve the frozen header + rounded tab/table/row/action/loading-
  skeleton composition. Replace the mock catalog/custom flow inside those same
  regions with exactly DAILY/WEEKLY/MONTHLY server preview and manual CSV/PDF.
- **Validation facts:** retain only source-backed financial/analytics facts and
  compose them into Payments/Analytics.

### REMOVE

- Guest Satisfaction and Returning Contact aggregate KPI presentation.
- fake trend percentages and sample/fallback chart data.
- transaction ledger rows, transaction search/method filter, fake numbered
  paging, receipt/print flow and transaction CSV fiction.
- validation records, pending/approved/rejected workflow, create/approve/reject
  controls and fabricated counts.
- custom report definitions, report creation, scheduled/email delivery and
  stored report-library/history UI.
- browser Company Location fan-out, FX/cross-currency totals, and browser
  recreation of backend formulas.

## 6. Validations-page evidence decision

**Decision B: do not create/register a standalone production Validations page.**

Evidence:

- `docs/24:457` classifies the reference page as authoritative
  validation-related financial/analytics information only.
- `docs/24:821` explicitly allows integration into Payments/Analytics.
- `docs/24:1134` forbids a fabricated validation record/workflow list and says
  to remove an empty/misleading standalone destination when aggregate facts are
  not meaningful enough alone.
- `location-analytics-financial.ts:14-24` provides only
  `validationRate` and `currentValidationAmountTotal` per currency for period
  analytics.
- `location-financial-overview.ts:7-16` provides only
  `currentValidationAmountTotal` among current non-completed-session financial
  totals.
- Company analytics reuses the same financial currency group
  (`company-analytics.ts:74-79`).
- no Management Dashboard contract exposes a validation record identity/status
  list, approver, create/approve/reject command, or arbitrary validation filter.

`/validations` therefore must not survive as a production route or navigation
item. DEC-051 operational validation mutation authority does not create a
Management Dashboard workflow.

## 7. Derived subtask count and rationale

Minimum safe split: **four serial tasks**.

1. **MD-05A — Intelligence Read/Generation Foundation**
2. **MD-05B — Overview, Payments, and Validation Composition**
3. **MD-05C — Analytics and Coverage**
4. **MD-05D — Reports, Binary Export, and MD-05 Navigation**

This is the minimum split that isolates shared request/generation truth,
current/financial presentation, dense analytics/coverage/chart behavior, and
the higher-risk POST/binary/final-authorization export path. No intermediate
merge exposes fake data, dead export buttons, unfinished navigation, or a
standalone validation fiction. Navigation is intentionally registered only in
MD-05D after all four destinations exist.

## 8. MD-05A — Intelligence Read/Generation Foundation

### A. Stable task ID and title

`MD-05A — Intelligence Read/Generation Foundation`

### B. Purpose

Create the feature-owned scope, endpoint adapters, exact-value presentation
helpers and stale-generation read primitive that every MD-05 page consumes.
This task has no user-visible route or navigation registration.

### C. Why this boundary exists

Overview/Payments, Analytics and Reports all need the same authoritative choice
between CA Company All Locations and exact Location; all period reads need the
same request identity and stale-response fencing. Freezing that interface first
prevents three page tasks from inventing independent scope/API/generation logic.
Binary POST export stays in MD-05D because its no-replay/unknown-outcome
semantics differ from these JSON GETs.

### D. Depends on

- Integrated `main@ca7511e4b1892b194bd209c328c713461456af43`.
- Existing MD-01 Foundation/API/scope/generation primitives.

### E. Blocks

- MD-05B.
- MD-05C.
- MD-05D.

### F. Owned production surfaces

Internal `features/intelligence/**` read/generation foundation only. No
`app/**` page and no navigation item becomes visible.

### G. Exact source ownership

Create, following current Operations/Audit patterns:

- `apps/dashboard/src/features/intelligence/intelligence-scope.ts`
- `apps/dashboard/src/features/intelligence/intelligence-api.ts`
- `apps/dashboard/src/features/intelligence/intelligence-query-identity.ts`
- `apps/dashboard/src/features/intelligence/use-intelligence-read.ts`
- `apps/dashboard/src/features/intelligence/intelligence-format.ts`
- `apps/dashboard/src/features/intelligence/intelligence-api.test.ts`
- `apps/dashboard/src/features/intelligence/intelligence-generation.test.ts`
- `apps/dashboard/src/components/foundation/md05-intelligence-authority.test.ts`
- `apps/dashboard/src/lib/navigation/md05-intelligence-navigation.test.ts`

Modify the existing authority pipeline narrowly:

- `apps/dashboard/src/lib/scope/dashboard-commercial-access.ts` — add
  `MANAGEMENT_INTELLIGENCE` as a route requirement plus
  `managementIntelligenceAuthorized?: boolean` on `ProtectedRouteAuthority`;
  `allowsDashboardRouteAccessRequirement()` returns that exact boolean for this
  requirement. Do not add a second commercial model;
- `apps/dashboard/src/components/scope/scope-entry-route-policy.ts` — keep CA
  All Locations selectable, but require `ACTIVE` for an exact Location when
  entering an MD-05 route;
- `apps/dashboard/src/components/foundation/revalidate-selected-scope.ts` —
  authorize `MANAGEMENT_INTELLIGENCE` from the current revalidated base facts:
  CA All Locations is eligible; CA exact Location requires current
  `locationMapsEligible`; LM requires the existing active Management base;
  Supervisor/feature-only/subscription-only scopes are denied;
- `apps/dashboard/src/lib/navigation/navigation-authority.ts` and
  `apps/dashboard/src/components/foundation/resolve-navigation-authority.ts` —
  add/carry `managementIntelligenceEligible: boolean`; derive it from the same
  revalidated base facts + selected scope and make
  `allowsNavigationAccessRequirement()` return it for
  `MANAGEMENT_INTELLIGENCE`, with no feature-authority endpoint probe.

Do not modify `use-scope-entry-controller.ts` (already 300 lines),
`management-foundation-app.tsx`, navigation types/registry, or
`dashboard-navigation.ts` in this task. The new requirement reuses the current
route/navigation authority mechanisms and the existing server-revalidated
Management context; it is not a second authority system.

### H. Backend/contracts consumed

The adapter must expose typed functions for:

- exact Location state counts, current financial overview;
- Location operations, financial, incidents, KPIs and queue analytics;
- Company all-locations analytics;
- Location daily/weekly/monthly report preview;
- Company daily/weekly/monthly report preview.

Use the exact shared schemas listed in Section 4. Export POST is not exposed by
MD-05A; MD-05D owns the binary export helper.

### I. Authorization matrix

| Principal | Company / All Locations | exact Location | MFA / access |
|---|---|---|---|
| Company Admin | supported for Company analytics/report reads | supported only for exact active Organization-owned Location | Standard MFA; D-access |
| Location Manager | unsupported | supported only for exact active granted Location | no CA MFA ceremony; D-access |
| Supervisor | unsupported | unsupported for MD-05 | must not be accepted by `intelligenceScope` |
| Employee | unsupported | unsupported | no general Management workspace |
| Guest | unsupported | unsupported | no Staff Management route |

This is data authority, not a navigation inference. Backend revalidates it on
every request. The frontend `MANAGEMENT_INTELLIGENCE` requirement only keeps
scope entry, protected-route gating and navigation aligned with that backend
matrix. Export-access is not exercised by MD-05A.

### J. Data truth rules

- Scope is exactly one of `COMPANY` (CA + ALL_LOCATIONS) or `LOCATION`
  (CA exact active Organization-owned Location or LM exact active granted
  Location).
- Never convert `LOCATION_MANAGER_GRANT_SET` into Company scope.
- Never accept Supervisor merely because Foundation entry exists.
- Period values remain `YYYY-MM-DD` strings. The browser validates shape/order
  for immediate UX, but the backend owns final date validation/timezone/DST.
- Exact decimal money/rates/averages/ratios remain strings until formatting.
  No `Number()`, `parseFloat`, floating accumulation, or FX.
- Nullable rate/ratio/average values remain missing; null must not become zero.
- `retrievalWait` and `retrievalStartLatencyAuxiliary` remain distinct.
- Company responses are authoritative totals; do not fan out Location requests.
- `carsHandedOffByEmployee.byEmployee` exists only on Location KPI responses;
  Company has aggregate attribution coverage only.

### K. Explicit out-of-scope

No routes, cards, charts, navigation, reports export, binary transport,
transaction ledger, validation workflow, new formulas, Company fan-out or
backend/contracts/database change.

### L. Visual freeze contract

None rendered in this task. The frozen visual contract starts being consumed in
MD-05B; MD-05A must not create an alternative component library.

### M. Query/generation/concurrency model

Every feature request key includes:

`identityGeneration + sessionGeneration + selectionRevision + scopeKind +
organizationId + locationId-or-none + endpoint family + selector/period +
retryRevision`.

Follow the current MD-04 pattern exactly: read identity/session/scope from
`useProtectedDashboard()`, read `selectionRevision` from
`useSelectedScope()`, then build one feature-owned scope key before starting
the request (`visit-contacts-page.tsx:22-36`,
`visit-contact-scope.ts:29-44`, `audit-page.tsx:19-23`,
`audit-scope.ts:51-68`). Do not expand `ProtectedDashboardContext` merely to
carry `selectionRevision`.

For report preview, add `reportKind` and the exact selector
(`date` / `weekStart` / `month`). For period analytics include exact
`from` and `to`.

Use the existing `ScopeGenerationGuard` pattern: each scope/period/selector/
retry change invalidates the previous generation; abort where appropriate; a
late success or late failure may never publish into the newer state. A→B→A is
three distinct generations even when the final IDs equal the first IDs.

### N. Export behavior

No export execution in MD-05A. Do not invent client idempotency or binary
semantics here.

### O. Error states

The read primitive preserves `DashboardApiError` classification:
auth, MFA, authorization, entitlement, validation, network, malformed, unknown.
Aborted/stale settlements are discarded, not converted into visible current
errors.

### P. Unit/component test matrix

- CA ALL_LOCATIONS resolves to Company scope and Company endpoint family.
- CA exact active Location and LM exact active Location resolve to the Location
  endpoint family.
- `MANAGEMENT_INTELLIGENCE` scope entry permits CA All Locations, permits CA
  and LM active exact Locations, and rejects CA/LM inactive exact Locations.
- route revalidation derives CA exact-Location eligibility from the current
  revalidated Management context (via the existing active-location fact), not
  from stale navigation state.
- navigation authority shows MD-05 candidates for CA All Locations and
  CA/LM active exact Location, and hides them for CA inactive exact Location.
- no `/v1/staff/dashboard/feature-authority` probe is introduced for MD-05.
- LM grant-set, Supervisor and unsupported scopes return no MD-05 scope.
- exact endpoint/query construction for all Location analytics families and
  Company analytics.
- exact report selector construction for daily/weekly/monthly.
- request key changes on identityGeneration, sessionGeneration,
  selectionRevision, scope, period, report kind, selector and retry revision.
- A→B→A old success is fenced.
- old failure cannot replace a newer success.
- decimal/null formatting preserves exact string/null semantics.
- formatting never merges currency groups.

### Q. Browser/E2E matrix

No new production route. Browser proof is deferred to owning page tasks. Do not
add an internal test-only route.

### R. Manual proof

None.

### S. Validation commands

Focused:

```text
pnpm --filter @valet/dashboard exec vitest run src/features/intelligence/intelligence-api.test.ts src/features/intelligence/intelligence-generation.test.ts src/components/foundation/md05-intelligence-authority.test.ts src/lib/navigation/md05-intelligence-navigation.test.ts
pnpm --filter @valet/dashboard lint
pnpm --filter @valet/dashboard typecheck
pnpm architecture:check
```

No PostgreSQL suite is needed because no backend/contracts change.

### T. Acceptance / Done criteria

- one scope mapper supports exactly the authority matrix above;
- every retained MD-05 JSON route has one typed adapter using shared schemas;
- period/report request identity is generation-safe;
- exact decimal/null values are not numerically reaggregated;
- no route/navigation is exposed;
- every authored/modified code/test file is <=300 physical lines;
- focused validation passes.

### U. Stop conditions / blockers

Stop and return to the Project Owner if current source no longer exposes any
route/schema listed in Section 4, if CA/LM authority differs from Section 4, or
if a retained field would require a new backend formula/contract. Do not add a
frontend substitute.

### V. Commit boundary

One commit containing the intelligence scope/API/query-generation/format
foundation, the narrow `MANAGEMENT_INTELLIGENCE` extensions to the existing
scope-entry/route/navigation authority pipeline, and their focused tests. No
pages, CSS, navigation registrations, binary export, backend/contracts/database
or MD-06 work.

## 9. MD-05B — Overview, Payments, and Validation Composition

### A. Stable task ID and title

`MD-05B — Overview, Payments, and Validation Composition`

### B. Purpose

Implement the frozen Overview and Payments production routes with authoritative
Location/Company data, and fold the only meaningful validation aggregates into
Payments rather than creating `/validations`.

### C. Why this boundary exists

These pages share current-versus-period financial presentation and the binding
Validations composition decision. They are separate from MD-05C because the
Analytics page owns dense KPI/coverage/chart semantics, and separate from
MD-05D because manual binary export has materially different failure/retry risk.

### D. Depends on

- MD-05A merged to `main`.

### E. Blocks

- MD-05C.
- MD-05D.

### F. Owned production surfaces

- `/overview`
- `/payments`
- validation-related read-only presentation inside Payments

No `/validations` route is created.

### G. Exact source ownership

Create:

- `apps/dashboard/src/app/overview/page.tsx`
- `apps/dashboard/src/app/payments/page.tsx`
- `apps/dashboard/src/features/intelligence/overview-page.tsx`
- `apps/dashboard/src/features/intelligence/overview-presentation.ts`
- `apps/dashboard/src/features/intelligence/overview-copy.ts`
- `apps/dashboard/src/features/intelligence/overview.module.css`
- `apps/dashboard/src/features/intelligence/overview-activity-chart.tsx`
- `apps/dashboard/src/features/intelligence/overview-current-panel.tsx`
- `apps/dashboard/src/features/intelligence/payments-page.tsx`
- `apps/dashboard/src/features/intelligence/payments-presentation.ts`
- `apps/dashboard/src/features/intelligence/payments-copy.ts`
- `apps/dashboard/src/features/intelligence/payments.module.css`
- `apps/dashboard/src/features/intelligence/payments-summary-grid.tsx`
- `apps/dashboard/src/features/intelligence/payments-breakdown-table.tsx`
- `apps/dashboard/src/features/intelligence/overview-presentation.test.ts`
- `apps/dashboard/src/features/intelligence/payments-presentation.test.ts`
- `apps/dashboard/e2e/md05-overview-payments.spec.ts`

The app route wrappers use the current
`ProtectedDashboardRoute` with
`accessRequirement="MANAGEMENT_INTELLIGENCE"`, established by MD-05A. Do not
register navigation yet.

### H. Backend/contracts consumed

Overview exact Location:

- state counts: `GET D/overview/session-state-counts`
- queue: `GET D/analytics/queue`
- period operations: `GET D/analytics/operations?from&to`
- period incidents: `GET D/analytics/incidents?from&to`
- period KPIs: `GET D/analytics/kpis?from&to`

Overview Company:

- `GET O/analytics/all-locations?from&to` only; never Location fan-out.

Payments exact Location:

- `GET D/overview/financial` for current non-completed-session financial
  projection;
- `GET D/analytics/financial?from&to` for period cohorts.

Payments Company:

- `GET O/analytics/all-locations?from&to`, use only
  `summary.financial` plus relevant coverage context.

### I. Authorization matrix

| Principal | `/overview` Company | `/overview` Location | `/payments` Company | `/payments` Location |
|---|---|---|---|---|
| Company Admin | yes | exact active Location only | yes | exact active Location only |
| Location Manager | no | exact active granted only | no | exact active granted only |
| Supervisor | no | no | no | no |
| Employee | no | no | no | no |
| Guest | no | no | no | no |

CA uses Standard MFA. Every route requires D-access. There is no
Export-access requirement because MD-05B performs no report export.

### J. Data truth rules

Overview retained visible facts:

- **Cars handled:** use
  `carsPerActiveEmployee.numerator`, which is the authoritative completed-visit
  numerator for the requested period. Do not infer a total from loaded rows.
- **Average Retrieval Wait:** use official
  `metrics.retrievalWait.averageSeconds`; show no value when null.
- **SLA Compliance:** use `slaCompliance.percentage` with numerator,
  denominator, `missingTargetCount`, and
  `invalidOrMissingIntervalCount` available as coverage context.
- **Incidents:** use period `incidentCount`; do not relabel current open
  incidents as period incidents.
- **Vehicle activity chart:** use `carsHandledPerDay[]`; zero-count days from
  the backend are legitimate data, not fallback samples.
- **Exact-Location current panel:** state counts are all persisted session
  states, not “today” (`docs/24:316-317`); queue uses current `depth` and
  nullable `oldestAgeSeconds`.
- Company Overview uses Company response fields only. It must expose coverage
  rather than pretending all Locations contributed equally.

Payments retained visible facts:

- current exact-Location overview groups:
  `paymentCount`, `amountDueTotal`, `amountPaidTotal`, `tipAmountTotal`,
  `succeededRefundAmountTotal`, `currentValidationAmountTotal`,
  `collectionMethodCounts`, `statusCounts`
  (`location-financial-overview.ts:7-38`);
- period currency groups:
  `paidPaymentCount`, `collectedAmountTotal`, `tipAmountTotal`,
  `digitalPaymentRate`, `succeededRefundAmountTotal`, `validationRate`,
  `currentValidationAmountTotal`
  (`location-analytics-financial.ts:14-24`);
- cash reconciliation is a separate signed per-currency cohort
  (`location-analytics-financial.ts:30-37`);
- validation-rate denominator is completed sessions with canonical Payment and
  numerator is current FULL/PARTIAL validation; it is never inferred from money
  amount (`DEC-060:91-98`);
- current financial overview is not period revenue
  (`docs/24:323,331`);
- never merge currencies, round with binary floating point, derive “Average
  Payment”, or convert a null percentage into 0.

### K. Explicit out-of-scope

- no transaction rows/details/receipt/print/search/method filter;
- no fake “success rate” if it cannot be traced to
  `digitalPaymentRate.percentage`;
- no validation record table/tabs/create/approve/reject/status controls;
- no Guest Satisfaction;
- no report/export button that performs an unsupported transaction export;
- no Company current-financial approximation via Location fan-out.

### L. Visual freeze contract

Preserve the composition of:

- `reference/.../OverviewPage.tsx`: header, four-card grid, activity panel and
  secondary panel;
- `reference/.../PaymentsPage.tsx`: header/action region, four-card grid and
  main tabular/detail region;
- `reference/.../ValidationsPage.tsx` only as a visual vocabulary for the
  small validation summary embedded into Payments; its workflow/table does not
  survive.

Reference fake data, hard-coded trends, transaction controls and validation
workflow are removed/adapted without discretionary restyling
(`docs/24:1136-1138`).

### M. Query/generation/concurrency model

Overview identity:

`scope generation + from + to + overview family + retryRevision`.

Payments identity:

`scope generation + from + to + current/period family + retryRevision`.

Independent visible reads may run concurrently. A scope or period change
invalidates all prior card/chart/table settlements. Exact-Location current
financial data and period financial data are separate generations even when
rendered on one page. No stale failure may replace a newer successful period.

### N. Export behavior

No binary export in MD-05B. A Reports navigation/link may not be registered or
presented as working until MD-05D.

### O. Error states

Must distinguish:

- loading;
- empty/no current Payment evidence;
- empty period/no paid samples;
- null rate/average/ratio;
- invalid period/request;
- malformed response;
- network failure;
- auth/session change;
- MFA step-up;
- entitlement loss;
- access loss;
- stale settlement discarded.

Current state and period state must not collapse into one “0”.

### P. Unit/component test matrix

- Overview Company selects only Company analytics.
- Overview exact Location selects Location state/queue/operations/incidents/KPI.
- Payments Company selects Company financial summary only.
- Payments exact Location keeps current overview separate from period finance.
- official Retrieval Wait label never uses auxiliary latency.
- SLA null/missing-target/invalid-interval coverage stays visible.
- every currency renders separately and exact 3-decimal strings survive.
- null digital/validation percentages remain unavailable, not 0%.
- validation summary contains no record/workflow controls.
- transaction table/search/detail/receipt controls are absent.
- chart with empty response has no sample fallback.
- Arabic mixed-direction currency/canonical values use current bidi primitives.

### Q. Browser/E2E matrix

- CA enters All Locations → `/overview`; capture request URLs and prove only
  Company analytics is requested.
- CA switches All Locations → Location A → All Locations with the first Company
  response delayed; stale response cannot repopulate the final generation.
- LM exact Location can open both routes; no Company endpoint is requested.
- CA selected inactive/historical Location is rejected by the
  `MANAGEMENT_INTELLIGENCE` protected-route authority before MD-05 content
  mounts and issues no C8/C9 request.
- Supervisor/Employee direct route entry does not expose MD-05 content.
- period change with delayed old response leaves only the new period visible.
- `/payments` mixed-currency fixture renders separate currency groups and no FX
  total.
- null-rate fixture renders missing state rather than 0.
- no `/validations` route/nav and no validation workflow controls.
- Arabic route changes document direction and preserves LTR isolation for money,
  currency codes and canonical values.
- keyboard focus/controls and representative narrow width preserve the frozen
  composition.

Use a new MD-05 fixture/helper module rather than growing the existing
300-line `dashboard-api-fixture.ts`.

### R. Manual proof

- Compare Overview and Payments against the frozen reference at desktop and
  representative narrow width in EN and AR.
- Verify exact Location versus Company wording/data mode.
- Verify an empty period, mixed currencies and missing SLA evidence.

### S. Validation commands

Focused:

```text
pnpm --filter @valet/dashboard test
pnpm --filter @valet/dashboard test:e2e -- md05-overview-payments.spec.ts
pnpm --filter @valet/dashboard lint
pnpm --filter @valet/dashboard typecheck
pnpm architecture:check
```

Backend regression is read-only confirmation only when implementation touches no
backend/contracts; do not run uncontrolled PostgreSQL suites.

### T. Acceptance / Done criteria

- `/overview` and `/payments` are real protected routes;
- every visible value traces to the fields listed above;
- Company mode uses only Company analytics;
- validation facts are integrated and `/validations` is absent;
- no sample/fake transaction/validation workflow survives;
- EN/AR, accessibility, responsive and scope/period race proofs pass;
- no navigation registration exposes later unfinished pages;
- every authored/modified code/test file is <=300 lines.

### U. Stop conditions / blockers

Stop if a required reference slot cannot be truthfully filled without a new
metric/record API, if a Company value would require Location fan-out, if exact
money presentation requires floating aggregation, or if backend authority
differs from Section 4. Remove/adapt unsupported UI rather than invent data.

### V. Commit boundary

One commit containing Overview + Payments + embedded validation aggregate
presentation, their page routes, styling and focused tests. No Analytics page,
Reports/export, navigation registration, backend/contracts/database or MD-06.

## 10. MD-05C — Analytics and Coverage

### A. Stable task ID and title

`MD-05C — Analytics and Coverage`

### B. Purpose

Implement `/analytics` with the authoritative Location/Company metric families,
real bounded periods, exact decimal/currency semantics, Company coverage and
textual chart alternatives.

### C. Why this boundary exists

Analytics is the densest MD-05 read surface: four Location period endpoints or
one Company aggregate, plus KPI coverage and several chart cohorts. Keeping it
separate makes the formulas, nulls, Company weighting and race behavior
independently reviewable before export risk is introduced.

### D. Depends on

- MD-05A and MD-05B merged to `main`.

### E. Blocks

- MD-05D.

### F. Owned production surfaces

- `/analytics`
- analytics-specific cards/charts/coverage tables/text alternatives.

### G. Exact source ownership

Create:

- `apps/dashboard/src/app/analytics/page.tsx`
- `apps/dashboard/src/features/intelligence/analytics-page.tsx`
- `apps/dashboard/src/features/intelligence/analytics-presentation.ts`
- `apps/dashboard/src/features/intelligence/analytics-copy.ts`
- `apps/dashboard/src/features/intelligence/analytics.module.css`
- `apps/dashboard/src/features/intelligence/analytics-activity-chart.tsx`
- `apps/dashboard/src/features/intelligence/analytics-secondary-chart.tsx`
- `apps/dashboard/src/features/intelligence/analytics-coverage.tsx`
- `apps/dashboard/src/features/intelligence/analytics-text-summary.tsx`
- `apps/dashboard/src/features/intelligence/analytics-presentation.test.ts`
- `apps/dashboard/e2e/md05-analytics.spec.ts`

Consume MD-05A scope/API/generation helpers. Do not modify the Foundation or
register navigation yet.

### H. Backend/contracts consumed

Exact Location:

- `GET D/analytics/operations?from&to`
- `GET D/analytics/financial?from&to`
- `GET D/analytics/incidents?from&to`
- `GET D/analytics/kpis?from&to`

Company:

- `GET O/analytics/all-locations?from&to`

The queue endpoint is current-state and belongs to Overview, not period
Analytics.

### I. Authorization matrix

| Principal | Company / All Locations | exact Location |
|---|---|---|
| Company Admin | supported | exact active Location only |
| Location Manager | unsupported | exact active granted only |
| Supervisor | unsupported | unsupported |
| Employee | unsupported | unsupported |
| Guest | unsupported | unsupported |

CA uses Standard MFA; all reads require D-access. Export-access is irrelevant.

### J. Data truth rules

Operational:

- show all five duration families only by their contract names/meanings;
- official `retrievalWait` is request→READY;
- `retrievalStartLatencyAuxiliary` is explicitly auxiliary;
- `sampleCount=0` implies nullable average remains unavailable;
- `carsHandledPerDay` already includes legitimate zero days.

Financial:

- keep one group per immutable Payment currency;
- paid collections, tips, succeeded refunds, validation and cash reconciliation
  remain distinct cohorts;
- digital/validation rate numerator+denominator accompany the percentage;
- signed cash variance remains signed.

Incidents:

- `incidentCount`, severity counts and raw persisted type counts are period
  cohorts;
- `incidentsPer1000` retains explicit numerator/denominator and nullable value.

KPI:

- SLA shows numerator, denominator, percentage,
  `missingTargetCount`, `invalidOrMissingIntervalCount`; Company additionally
  shows `requestCount` and `contributingLocationCount`
  (`company-analytics.ts:96-108`);
- Cars per Active Employee shows source numerator/denominator/value; Company
  additionally exposes `evidenceLocationCount`
  (`company-analytics.ts:109-116`);
- Cars Handed Off never substitutes current assignee/Shift. Location may expose
  `attributedCount`, `missingAttributionCount`, `employeeCount`,
  `truncated`; Company exposes aggregate attribution counts and no byEmployee
  ranking (`location-analytics-kpis.ts:50-57`,
  `company-analytics.ts:117-123`);
- Key Exceptions are exactly the four controlled types.

Company:

- `coverage.totalLocationCount`, active/inactive counts and ordered
  `timezoneBoundaries[]` are visible coverage, not implementation metadata
  (`company-analytics.ts:23-49`);
- each timezone group includes server-derived `periodStartUtc` /
  `periodEndUtc`; do not calculate an Organization timezone in the browser;
- duration metrics include `contributingLocationCount`;
- Company averages/ratios are source-recomputed. Never average Location
  averages, sum percentages, or sum Location distinct employee counts;
- group bounds are server-owned (500 for timezone/currency/cash/incident-type
  groups; `company-analytics-source.ts:10-25,38-50`).

### K. Explicit out-of-scope

- Guest Satisfaction/rating card despite the persistence discussed by DEC-095;
  the current MD-05 contracts intentionally expose no Guest Rating aggregate
  (`docs/24:366`);
- Returning Contact aggregate;
- employee ranking/performance score;
- frontend KPI formulas or Location fan-out;
- cross-currency chart total;
- unsupported arbitrary filters or periods above 31 days;
- predictive/demand analytics.

### L. Visual freeze contract

Preserve the exact top-level composition of
`reference/.../AnalyticsPage.tsx:20-120`: one header/selector row, one
four-card grid, and one two-chart grid. Adapt the fake Location selector to
Foundation scope and the fake date selector to real `from/to`. The first chart
uses authoritative `carsHandledPerDay`; the second chart adapts the reference
Revenue panel to a source-backed duration/KPI comparison using returned values.
Do not add a third chart, a new top-level coverage panel, or another dashboard
section. Company coverage and metric evidence belong as compact annotations/data
alternatives inside the existing four-card/two-chart regions. Remove Guest
Satisfaction, the unsupported Revenue trend/time series, and all fallback sample
series. Every chart gains a textual/data alternative while its visual
composition remains consistent with the reference
(`docs/24:795-804,1136-1138`).

### M. Query/generation/concurrency model

Request identity:

`identityGeneration + sessionGeneration + selectionRevision + scopeKind +
organizationId + locationId-or-none + from + to + analytics family +
retryRevision`.

Location family reads can run concurrently under one page generation. Company
mode issues one Company request. A period change invalidates every old family.
A scope change invalidates both period and any local UI visibility choice.
Delayed failures are fenced the same as delayed successes.

### N. Export behavior

None.

### O. Error states

- loading;
- invalid/malformed/overlong period;
- no samples with null duration;
- null denominator/rate/ratio;
- missing SLA target/interval evidence;
- missing handoff attribution;
- Company zero/partial contributing-location coverage;
- Company analytics group-too-large 422 as a visible unavailable/error state,
  never client truncation;
- auth/MFA/entitlement/access loss;
- network/malformed response;
- stale settlement discarded.

### P. Unit/component test matrix

- strict date selector and <=31 inclusive-day UX validation agrees with backend
  bounds without doing timezone math;
- Location adapter combines no metrics beyond presentation;
- Company adapter consumes one Company DTO and never emits Location requests;
- null duration/rate/ratio stays null;
- official/auxiliary retrieval labels remain distinct;
- SLA missing target/invalid interval counts render truthfully;
- Location/Company employee-attribution shapes are handled without inventing a
  Company byEmployee list;
- Company coverage/timezone groups render deterministically;
- mixed currencies never share a summed card/series;
- empty chart state contains no sample fallback;
- chart textual alternative includes the same source values;
- no Guest Satisfaction or Returning Contact metric is rendered.

### Q. Browser/E2E matrix

- CA All Locations period request captures exactly
  `/analytics/all-locations?from=...&to=...`; no Location analytics request
  occurs.
- CA/LM exact active Location issue the four exact Location period families only.
- CA selected inactive/historical Location is denied before Analytics content
  mounts and makes no analytics request.
- delayed old period A then period B cannot overwrite B; captured request URLs
  prove the selector change.
- CA Company → Location → Company with delayed first Company response fences the
  old generation.
- mixed-timezone Company fixture renders server coverage boundaries rather than
  a single invented timezone.
- mixed-currency Company fixture keeps currency groups separate.
- denominator-zero/missing-SLA/missing-attribution fixture preserves null and
  coverage counts.
- 32-day/invalid selector never silently coerces into another period.
- AR/RTL and keyboard/textual chart alternatives are proven.
- representative mobile/narrow viewport preserves the frozen layout.

### R. Manual proof

- compare Company mixed-timezone/mixed-currency state with exact Location state;
- inspect an empty period and missing-attribution/SLA coverage in EN and AR;
- visually compare reference card/chart composition at desktop and narrow width.

### S. Validation commands

```text
pnpm --filter @valet/dashboard test
pnpm --filter @valet/dashboard test:e2e -- md05-analytics.spec.ts
pnpm --filter @valet/dashboard lint
pnpm --filter @valet/dashboard typecheck
pnpm architecture:check
```

If implementation discovers a backend regression while consuming current
contracts, run only the exact owned API test files through:

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs <exact-test-files>
```

Do not invoke uncontrolled PostgreSQL suites.

### T. Acceptance / Done criteria

- `/analytics` works in CA Company, CA active Location and LM active Location
  modes only;
- exact Location and Company endpoint selection is proven;
- all retained metrics trace to Section J fields;
- mixed timezone/currency, nulls and coverage remain truthful;
- no client fan-out/formula reconstruction/sample fallback exists;
- EN/AR, accessibility, period/scope races and visual freeze proofs pass;
- authored/modified code/test files remain <=300 lines.

### U. Stop conditions / blockers

Stop if a requested visible metric lacks a current contract field, if a Company
visual would require Location fan-out or client recomputation, if current
contracts add/remove a metric relative to this baseline, or if fulfilling the
reference requires a Guest Rating/Returning Contact API not currently exposed.

### V. Commit boundary

One commit containing only Analytics route/presentation/charts/copy/styles and
its focused tests. No report export/binary transport/navigation/backend/
contracts/database/MD-06 changes.

## 11. MD-05D — Reports, Binary Export, and MD-05 Navigation

### A. Stable task ID and title

`MD-05D — Reports, Binary Export, and MD-05 Navigation`

### B. Purpose

Implement fixed daily/weekly/monthly report preview and manual CSV/PDF
generation for Company and exact Location, extend the existing Dashboard API
client with one authenticated binary-response path, and register the completed
MD-05 destinations in navigation.

### C. Why this boundary exists

Report preview is a normal generation-fenced GET, but export is an audited POST
whose response is binary, whose authority/entitlement is rechecked after render,
and whose lost response must never auto-retry. This risk deserves one review
boundary. Navigation is registered here because only now are all retained
MD-05 routes complete.

### D. Depends on

- MD-05A, MD-05B and MD-05C merged to `main`.

### E. Blocks

- final MD-05 closure review.
- MD-06 only after closure succeeds.

### F. Owned production surfaces

- `/reports`
- manual CSV/PDF download intent/result UX
- final MD-05 navigation registrations for:
  `/overview`, `/payments`, `/analytics`, `/reports`.

There is no `/validations` registration.

### G. Exact source ownership

Create:

- `apps/dashboard/src/app/reports/page.tsx`
- `apps/dashboard/src/features/intelligence/reports-page.tsx`
- `apps/dashboard/src/features/intelligence/reports-export-api.ts`
- `apps/dashboard/src/features/intelligence/reports-export-api.test.ts`
- `apps/dashboard/src/features/intelligence/reports-presentation.ts`
- `apps/dashboard/src/features/intelligence/reports-copy.ts`
- `apps/dashboard/src/features/intelligence/report-export-intent.ts`
- `apps/dashboard/src/features/intelligence/report-preview-dialog.tsx`
- `apps/dashboard/src/features/intelligence/reports-export-controls.tsx`
- `apps/dashboard/src/features/intelligence/reports.module.css`
- `apps/dashboard/src/features/intelligence/intelligence-navigation.ts`
- `apps/dashboard/src/features/intelligence/intelligence-navigation.test.ts`
- `apps/dashboard/src/lib/api/dashboard-api-client-binary.test.ts`
- `apps/dashboard/e2e/md05-reports-export.spec.ts`
- `apps/dashboard/e2e/md05-navigation-accessibility.spec.ts`
- `apps/dashboard/e2e/md05-closure.spec.ts`

Modify:

- `apps/dashboard/src/lib/api/dashboard-api-client.ts` — narrow binary method
  using the existing auth/fence/error boundary;
- `apps/dashboard/src/lib/navigation/dashboard-navigation.ts` — import and
  append the MD-05 registration group only.

Do not grow `dashboard-api-client.test.ts`, the 300-line shared E2E fixture,
or `management-foundation-app.tsx`.

MD-05D owns the Reports page/preview presentation, but it consumes the frozen
daily/weekly/monthly JSON GET adapters from MD-05A
`intelligence-api.ts`. `reports-export-api.ts` is export-only and must not
duplicate or wrap a second report-preview request layer.

### H. Backend/contracts consumed

Location preview:

- `GET /v1/staff/dashboard/locations/:locationId/reports/daily?date=YYYY-MM-DD`
- `GET .../weekly?weekStart=YYYY-MM-DD`
- `GET .../monthly?month=YYYY-MM`

Company preview:

- `GET /v1/staff/management/organizations/:organizationId/reports/daily?date=...`
- `GET .../weekly?weekStart=...`
- `GET .../monthly?month=...`

Exports:

- Location `POST /v1/staff/dashboard/locations/:locationId/reports/exports`
- Company `POST /v1/staff/management/organizations/:organizationId/reports/exports`
- body is exactly the `reportExportRequestSchema` discriminated union
  (`location-report-common.ts:27-50`).

For user-facing export availability the page may read the already-authoritative
current subscription endpoints through existing
`readCompanyAdminSubscription` / `readLocationManagerSubscription`.
That read is advisory UX only; export POST remains authoritative and must handle
entitlement revocation after the advisory read.

### I. Authorization matrix

| Principal | Company preview | Location preview | Company export | Location export |
|---|---|---|---|---|
| Company Admin | yes | exact active Location only | yes when Export-access remains current | exact active Location only, when Export-access remains current |
| Location Manager | no | exact active granted | no | exact active granted when Export-access remains current |
| Supervisor | no | no | no | no |
| Employee | no | no | no | no |
| Guest | no | no | no | no |

CA preview/export uses Standard MFA, not five-minute Sensitive freshness
(`docs/24:381-388`). Preview requires D-access. Export requires D-access plus
current reportExports. Frontend advisory entitlement state never replaces final
server authorization.

### J. Data truth rules

- Report kinds are exactly `DAILY | WEEKLY | MONTHLY`.
- Formats are exactly `CSV | PDF`.
- Daily response includes `dailyActivity`; weekly/monthly do not.
- Location reports include Location ID, persisted timezone, period and summary
  (`location-report.ts:88-114`).
- Company reports include Organization ID, period and authoritative Company
  analytics summary; Company daily additionally includes bounded daily activity
  (`company-report.ts:26-78`).
- Preview renders report DTO fields directly; it must not reconstruct Analytics
  from separate browser requests.
- Company preview never fans out to Locations.
- CSV/PDF are server-rendered. Browser does not generate, alter, localize or
  re-summarize artifact contents.

### K. Explicit out-of-scope

- custom report kinds/columns;
- report creation/editing templates;
- report library/history persistence;
- scheduled/email delivery;
- automatic retries;
- Arabic PDF claim/localization;
- client-generated CSV/PDF;
- client idempotency keys;
- transaction export or Audit export;
- stored-artifact download links.

### L. Visual freeze contract

Preserve the actual frozen `reference/.../ReportsPage.tsx:70-157`
composition: header plus one rounded main container using the existing
tab/table/row/action/loading-skeleton visual language. The production table
contains exactly three fixed rows — Daily, Weekly, Monthly — instead of the mock
Standard/Custom report catalog. Remove the Create Report button, Custom Reports
tab and custom-report modal semantics. A row action opens the real server report
preview in a focus-safe dialog that adapts the reference Modal visual language
through the production `FocusDialog`; CSV/PDF controls live in that
dialog/action region. Do not add a new top-level preview panel or rearrange the
page. Scheduled/automated copy and fake alert-only actions are removed
(`docs/24:461,1136-1138`).

### M. Query/generation/concurrency model

Preview key:

`identityGeneration + sessionGeneration + selectionRevision + scopeKind +
organizationId + locationId-or-none + reportKind + exact selector +
previewRevision`.

Export intent key additionally contains `format` and a monotonically new local
`exportIntentRevision`. It is not a backend idempotency key.

Scope, report kind, selector or format change invalidates an old preview and any
unsubmitted export intent. Once POST starts, the response belongs to that exact
initiating generation. A stale success must not save a file into the new scope;
a stale failure must not replace the new preview. No stale/aborted/unknown
export causes automatic submission.

### N. Export behavior

The existing `DashboardApiClient` must gain one narrow binary request method.
The local method/type names are implementation details; its typed result must
carry the validated artifact bytes (for example `Uint8Array`), content type
and server filename. The method reuses the current auth provider, cookie
credentials, `no-store`, identity generation fence, session generation fence,
401 refresh semantics and `DashboardApiError` mapping.

`reports-export-api.ts` is the only MD-05 feature module that calls this binary
method. Report preview continues to use MD-05A's JSON GET adapters.

Required client behavior:

- pre-request stale/missing token refresh may happen before the POST;
- after a POST receives 401, refresh authentication but never replay the POST;
  surface the existing `AUTH_RECONCILED_RETRY_REQUIRED` contract;
- a network/transport loss after POST dispatch is an **unknown export outcome**;
  show explicit review/retry copy and never submit invisibly;
- auth/session generation change before accepting bytes rejects the result;
- require HTTP 200 plus expected content type:
  `text/csv; charset=utf-8` for CSV or `application/pdf` for PDF;
- parse the server `Content-Disposition: attachment; filename="..."` filename.
  Because current server filenames are deterministic ASCII-safe
  (`report-csv-renderer.ts:113-134`,
  `report-pdf-renderer.ts:115-119`,
  `company-report-csv-renderer.ts:11-28`,
  `company-report-pdf-renderer.ts:13-51`), missing/malformed disposition is a
  malformed-response state; do not invent a different filename;
- create one browser Blob/object URL only after all fences and header checks
  succeed, trigger one download, then revoke the object URL;
- do not reinterpret the 5 MiB rule client-side. Backend 422
  `REPORT_EXPORT_TOO_LARGE` is displayed as the authoritative size failure;
- final server authority/entitlement denial produces no file;
- another explicit user export is a new server generation/audit;
- CSV/PDF bytes are not persisted in Dashboard state after download;
- UI locale may be EN/AR, but PDF remains current locale-neutral/English and the
  page must state that truthfully.

### O. Error states

Preview:

- loading, empty legitimate report cohorts, invalid selector, malformed
  response, auth/MFA/entitlement/access/network failure and stale settlement.

Export:

- reportExports unavailable in current advisory subscription state;
- final authorization/entitlement denial after generation attempt;
- `REPORT_EXPORT_TOO_LARGE`;
- malformed content type/disposition;
- auth reconciled — explicit review/retry required;
- network/lost response — outcome unknown, no auto retry;
- scope/period/report change makes returned artifact stale, so no download.

### P. Unit/component test matrix

- daily/weekly/monthly selector→endpoint/request contract for both scopes.
- weekly selector does not accept a non-Monday as a valid report intent.
- preview DTO shape differs correctly between Location and Company and between
  daily versus periodic.
- binary client sends one POST and never replays it after 401.
- binary client rejects identity/session generation crossing.
- exact content type and Content-Disposition filename are required.
- network failure after POST is classified by report UX as unknown outcome.
- 422 size failure surfaces no file.
- advisory reportExports false disables/marks export unavailable while preview
  remains usable when D-access exists.
- advisory true followed by final backend denial produces no download.
- CSV/PDF object URLs are revoked.
- locale-neutral PDF wording is explicit; no Arabic PDF claim.
- navigation group contains only four MD-05 routes, no Validations.

### Q. Browser/E2E matrix

- CA All Locations previews daily/weekly/monthly through Organization routes.
- CA/LM exact active Location previews through Location routes.
- CA selected inactive/historical Location is denied before Reports content
  mounts and issues no C10 request/export.
- captured URLs prove selector changes reset the preview request identity.
- Company → Location → Company delayed preview race cannot repopulate stale
  report content.
- successful CSV and PDF downloads expose exact server filename/content type;
  E2E saves and opens/parses enough bytes to prove non-empty CSV/PDF artifact.
- reportExports false: preview remains, export is unavailable.
- entitlement/authority revoked during server generation: final POST denies and
  no browser download fires.
- lost/aborted export response: exactly one POST is observed; no automatic
  second POST occurs.
- 5 MiB 422: visible size failure and zero download.
- auth refresh after rejected export: exactly one POST before explicit user
  action; no automatic replay.
- navigation: CA All Locations sees Overview/Payments/Analytics/Reports; CA/LM
  exact Location sees the same; Supervisor does not; `/validations` is absent.
- direct Employee/Guest/general unauthorized entry exposes no MD-05 content.
- AR/RTL navigation/report UI, keyboard operation, focus restoration and
  representative responsive width pass.

### R. Manual proof

- save and open one real Location CSV, Location PDF, Company CSV and Company PDF;
- verify filenames match server headers;
- inspect Arabic UI around the explicitly locale-neutral PDF contract;
- compare Reports visual composition with frozen reference at desktop/narrow
  widths.

### S. Validation commands

Focused:

```text
pnpm --filter @valet/dashboard test
pnpm --filter @valet/dashboard test:e2e -- md05-reports-export.spec.ts md05-navigation-accessibility.spec.ts
pnpm --filter @valet/dashboard lint
pnpm --filter @valet/dashboard typecheck
pnpm architecture:check
```

Required owned backend regression proof for the export boundary:

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-reports-api.integration.test.ts test/dashboard-report-commercial.integration.test.ts test/management-location-export-session-finalization.integration.test.ts test/management-commercial-location-export-finalization.integration.test.ts test/management-company-reports.integration.test.ts test/management-company-report-finalization.integration.test.ts test/management-company-report-export-http.integration.test.ts test/management-company-report-commercial.integration.test.ts
```

Do not replace the owned harness with a direct uncontrolled PostgreSQL run.

### T. Acceptance / Done criteria

- fixed report preview works for every supported scope/kind;
- CSV/PDF performs exactly one POST per explicit user intent;
- server filename/content type are honored and actual files open;
- final authority/entitlement loss and size failures produce no download;
- lost response has explicit unknown-outcome UX and no automatic retry;
- all four completed MD-05 routes are registered with correct roles/scope and
  `MANAGEMENT_INTELLIGENCE` access;
- no Validations/custom/scheduled/stored-report destination survives;
- EN/AR, accessibility, responsive, race and export E2E proof passes;
- authored/modified code/test files remain <=300 lines.

### U. Stop conditions / blockers

Stop if binary transport cannot preserve the existing auth/session generation
fences without replacing the Dashboard client; if export headers differ from the
current server contract; if any export route gains idempotency or retry semantics
not reflected here; if reportExports cannot be determined/handled without a new
authority model; or if current report response fields cannot support the frozen
preview. Do not create client-side artifact/report storage.

### V. Commit boundary

One commit containing Reports route/preview/export UX, narrow existing-client
binary support, final MD-05 navigation registration and focused tests. No
backend/contracts/database, no custom/scheduled reports, no Validations route,
no MD-06 work.

## 12. Cross-task ownership matrix

| Task | Routes/pages | Primary feature ownership | Shared files | API families | E2E ownership | Depends on | Merge order |
|---|---|---|---|---|---|---|---|
| MD-05A | none | `features/intelligence/intelligence-{scope,api,query-identity,format}.ts`, `use-intelligence-read.ts`; MD-05 authority requirement | `dashboard-commercial-access.ts`, `scope-entry-route-policy.ts`, `revalidate-selected-scope.ts`, `navigation-authority.ts`, `resolve-navigation-authority.ts` | all MD-05 JSON GET adapters; no new backend authority endpoint | authority/navigation unit proof only; no visible route E2E | baseline | 1 |
| MD-05B | `/overview`, `/payments` | Overview/Payments presentation, embedded validation aggregates | consumes MD-05A only | Location overview/queue/operations/incidents/KPIs/financial; Company analytics | `md05-overview-payments.spec.ts` | A | 2 |
| MD-05C | `/analytics` | analytics cards/charts/coverage | consumes MD-05A only | Location four period analytics families; Company analytics | `md05-analytics.spec.ts` | A+B | 3 |
| MD-05D | `/reports`; nav for all MD-05 routes | reports/preview/export, navigation | modify `dashboard-api-client.ts`, `dashboard-navigation.ts`; consume A-C | Location/Company reports, exports, subscription read for advisory Export-access | reports/export/navigation/closure E2E | A+B+C | 4 |

Shared-file handoff:

1. **MD-05A first owns the new intelligence scope/API/generation interface.**
   After merge, its scope kinds, request-key dimensions, exact-decimal/null
   handling, JSON adapter signatures and `MANAGEMENT_INTELLIGENCE`
   route/navigation requirement are frozen. B/C/D consume them. A later task
   may add a report-specific export helper file, but may not fork the scope,
   authority or generation model.
2. **MD-05D is the only MD-05 task touching
   `lib/api/dashboard-api-client.ts`.** It adds binary response handling while
   preserving the already-frozen JSON semantics. Binary-specific tests live in a
   new file so the existing 261-line test is not inflated.
3. **MD-05D is the only MD-05 task touching
   `lib/navigation/dashboard-navigation.ts`.** A-C intentionally leave routes
   unregistered. D appends one feature-owned registration group after every
   destination is production-complete.
4. The 300-line `e2e/support/dashboard-api-fixture.ts` is frozen. MD-05 owns a
   separate small fixture/helper module if additional analytics/report response
   builders are needed.

Primary ownership of a page never overlaps. B owns Overview/Payments, C owns
Analytics, D owns Reports. Later tasks may import earlier presentation helpers
only when the interface is already frozen; they do not edit another task's page
to add unrelated behavior.

## 13. Route / navigation plan

The route names already exist in the accepted plan/reference inventory; no new
route naming decision is required.

| Production route | Navigation label EN / AR | Access requirement | Data eligibility | Navigation visibility | Owner |
|---|---|---|---|---|---|
| `/overview` | Overview / نظرة عامة | `MANAGEMENT_INTELLIGENCE` | CA Company or exact active Location; LM exact active Location | shown only when the same current revalidated eligibility is true | MD-05B page, MD-05D nav |
| `/payments` | Payments / المدفوعات | `MANAGEMENT_INTELLIGENCE` | CA Company or exact active Location; LM exact active Location | same | MD-05B page, MD-05D nav |
| `/analytics` | Analytics / التحليلات | `MANAGEMENT_INTELLIGENCE` | CA Company or exact active Location; LM exact active Location | same | MD-05C page, MD-05D nav |
| `/reports` | Reports / التقارير | `MANAGEMENT_INTELLIGENCE` | CA Company or exact active Location; LM exact active Location | same; export separately reflects/rechecks Export-access | MD-05D |
| `/validations` | none | none | unsupported | **removed / never registered** | none |

MD-05 registrations use:

- `roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"]`;
- `scopeRequirement: "ORGANIZATION"`;
- `accessRequirement: "MANAGEMENT_INTELLIGENCE"`;
- `availability: "IMPLEMENTED"` only in MD-05D.

`ORGANIZATION` is the current registry's narrowest representable candidate
filter that supports both CA All Locations and exact-Location management scopes
(`scope-presentation.ts:28-60`). It is only the cheap candidate filter.
`MANAGEMENT_INTELLIGENCE` is the authoritative frontend filter after current
base revalidation:

- CA All Locations: eligible when D-access is current;
- CA exact Location: eligible only when the fresh Management context resolves
  the same Location as ACTIVE. Reuse the existing `locationMapsEligible` fact,
  whose CA exact-Location computation already calls
  `isActiveExactCompanyLocationContext`
  (`selected-scope-base-authority.ts:178-200`);
- LM exact Location: eligible only through the existing active Management base
  (`selected-scope-base-authority.ts:107-131`);
- LM grant-set, Supervisor and subscription-only scopes: denied.

This requirement does **not** call
`/v1/staff/dashboard/feature-authority`; that endpoint's current feature enum is
MD-04-specific. It reuses the existing base Management context/subscription
revalidation. Scope entry also uses the same requirement so CA/LM inactive
Locations are not selectable from an MD-05 route, while CA All Locations
remains selectable. This closes the inactive-Location mismatch without changing
other Management routes that intentionally allow historical Locations.

Reference destinations that must not survive MD-05:

- standalone `/validations`;
- any custom-report/create-report/scheduled-report destination inferred from the
  prototype;
- any transaction-detail/receipt destination inferred from Payments.

## 14. Page → API traceability matrix

| Production surface | Component responsibility | Exact API | Request contract | Response contract | Authority / scope | Period | Currency | Missing/null semantics | Test proof |
|---|---|---|---|---|---|---|---|---|---|
| Overview — Company | period KPI/operations/incidents + Company coverage | `GET O/analytics/all-locations` | `companyAnalyticsPeriodQuerySchema` | `companyAnalyticsResponseSchema` | CA Standard MFA; Company/All Locations; D-access | explicit `from,to`, <=31 inclusive local dates per Location | response financial groups remain separate if surfaced | duration/rate/ratio null remains null; coverage explicit | B E2E captured URL + Company→Location→Company race |
| Overview — Location | cards, activity chart, current state/queue | `GET D/overview/session-state-counts`; `GET D/analytics/queue`; `GET D/analytics/operations`; `incidents`; `kpis` | overview none; analytics `analyticsPeriodQuerySchema` | state counts; queue; operational/incidents/KPI schemas | CA Standard MFA at exact active Location or LM exact active grant; D-access | current endpoints none; period endpoints explicit <=31 | no money in retained Overview cards | queue oldest age nullable; averages/rates nullable; missing SLA evidence explicit | B E2E Location endpoint set + period race |
| Payments — Company | period financial cards/tables + validation aggregates | `GET O/analytics/all-locations` | `companyAnalyticsPeriodQuerySchema` | `companyAnalyticsResponseSchema` → `summary.financial` | CA Standard MFA; Company; D-access | explicit <=31 | separate immutable Payment currencies | rate percentage null with denominator 0; absence of group is not a cross-currency zero | B mixed-currency/null E2E |
| Payments — Location current | non-completed-session financial snapshot | `GET D/overview/financial` | none | `financialOverviewResponseSchema` | CA Standard MFA at exact active Location or LM exact active grant; D-access | none | separate currencies | empty `currencies[]` means no current projection evidence | B current-vs-period component test |
| Payments — Location period | collections/tips/refunds/validation/cash | `GET D/analytics/financial` | `analyticsPeriodQuerySchema` | `financialAnalyticsResponseSchema` | CA Standard MFA at exact active Location or LM exact active grant; D-access | explicit <=31 Location-local | separate currencies; signed cash group separate | digital/validation percentage null on zero denominator | B exact-decimal test |
| Analytics — Company | all Company operations/finance/incidents/KPIs/coverage | `GET O/analytics/all-locations` | `companyAnalyticsPeriodQuerySchema` | `companyAnalyticsResponseSchema` | CA Standard MFA; Company; D-access | explicit <=31, per-Location bounds | separate currencies, no FX | null ratios/averages + coverage counts remain explicit | C weighting/coverage/race E2E |
| Analytics — Location | four period families | `GET D/analytics/{operations,financial,incidents,kpis}` | `analyticsPeriodQuerySchema` | four Location analytics schemas | CA Standard MFA at exact active Location or LM exact active grant; D-access | explicit <=31 Location-local | financial response separate currencies | null duration/rates/ratios and missing attribution/target remain explicit | C endpoint/period tests |
| Reports preview — Company | render one authoritative report DTO | `GET O/reports/{daily,weekly,monthly}` | Company aliases of daily/weekly/monthly query schemas | Company daily/periodic report schemas | CA Standard MFA; Company; D-access | exact kind selector | report DTO retains separated financial currency groups | summary nulls are rendered as missing | D preview E2E |
| Reports preview — Location | same | `GET D/reports/{daily,weekly,monthly}` | daily/weekly/monthly query schemas | Location daily/periodic report schemas | CA Standard MFA or LM exact active grant; D-access | exact kind selector; Location timezone | separated financial currency groups | summary nulls are rendered as missing | D preview E2E |
| Reports export — Company | download server bytes once | `POST O/reports/exports` | `companyReportExportRequestSchema` | binary HTTP response, server headers | CA Standard MFA; Company; D-access + Export-access | same kind selector | server artifact | denial/size/lost response yields no fabricated file | D final-denial/lost-response/download E2E |
| Reports export — Location | same | `POST D/reports/exports` | `reportExportRequestSchema` | binary HTTP response, server headers | CA Standard MFA or LM exact active grant; D-access + Export-access | same kind selector | server artifact | same | D final-denial/lost-response/download E2E |

Anything outside this matrix is not an MD-05 data source. A visible field that
cannot be traced to one row above is **REMOVE** unless a newer authoritative
source explicitly changes the contract.

## 15. Metric traceability matrix

### 15.1 Overview

| Visible item | Exact backend field/source | Rules |
|---|---|---|
| Cars handled card | Location `kpis.carsPerActiveEmployee.numerator`; Company `summary.kpis.carsPerActiveEmployee.numerator` | this numerator is completed visits in period; do not use loaded-row count |
| Avg Retrieval Wait card | Location `operations.metrics.retrievalWait.averageSeconds/sampleCount`; Company `summary.operational.metrics.retrievalWait.*` | official request→READY only; null when no sample |
| SLA Compliance card | `slaCompliance.numerator/denominator/percentage` | null percentage remains missing; missing target/invalid interval are separate coverage |
| Incident card | Location `incidentCount`; Company `summary.incidents.incidentCount` | period incidents only |
| Vehicle activity chart | `carsHandledPerDay[].date/handledCount` | backend zero days are real; never fallback sample |
| exact-Location state panel | `session-state-counts.counts[]` | all persisted session-state counts, not “today” |
| exact-Location queue panel | `queue.depth`, `oldestAgeSeconds` | point-in-time; empty queue oldest age is null |
| Company coverage context | `coverage.totalLocationCount/activeLocationCount/inactiveLocationCount/timezoneBoundaries` | do not claim one Organization timezone |

### 15.2 Payments / validation composition

| Visible item | Exact backend field/source | Rules |
|---|---|---|
| Collected by currency | `currencies[].collectedAmountTotal` | exact decimal; separate currency entries |
| Paid payments by currency | `currencies[].paidPaymentCount` | do not infer transaction ledger rows |
| Digital payment rate | `digitalPaymentRate.{numerator,denominator,percentage}` | denominator 0 → null |
| Validation rate | `validationRate.{numerator,denominator,percentage}` | canonical current FULL/PARTIAL validation only |
| Current validation amount | `currentValidationAmountTotal` | exact decimal per currency |
| Tips | `tipAmountTotal` | paid cohort, per currency |
| Succeeded refunds | `succeededRefundAmountTotal` | refund completion cohort, per currency |
| Cash reconciliation | `cashExpectedTotal/cashReportedTotal/cashVarianceTotal` | separate signed cohort per cash currency |
| exact-Location current payment count | overview `paymentCount` | current non-completed sessions only |
| exact-Location current due/paid | overview `amountDueTotal/amountPaidTotal` | not period revenue |
| exact-Location method/status distribution | overview `collectionMethodCounts/statusCounts` | canonical enums only |

The four reference Payments card positions must be adapted to source-backed
grouped values: **Collected**, **Paid Payments**, **Digital Payment Rate**, and
**Validation Rate**. When more than one currency exists, each card presents
currency-separated rows; it never merges them into one headline total.
Tips/refunds/current validation/cash and exact-Location current projection belong
in the retained main breakdown region. “Average Payment” and prototype Payment
Success Rate are **REMOVE** unless represented exactly by the accepted fields
above; Digital Payment Rate must keep its accepted name.

### 15.3 Analytics

All retained Analytics items use these exact fields:

- durations: `checkInTime`, `parkingTime`, `retrievalWait`,
  `retrievalStartLatencyAuxiliary`, `handoffTime`, each with
  `sampleCount/averageSeconds`; Company adds `contributingLocationCount`;
- cars/day: `carsHandledPerDay`;
- finance: every field in the Payments period rows above;
- incidents: `incidentCount`, `severityCounts`, `typeCounts`,
  `incidentsPer1000.{numerator,denominator,value}`;
- SLA: fields listed above; Company adds `requestCount` and
  `contributingLocationCount`;
- Cars per Active Employee:
  `numerator/denominator/value`; Company adds `evidenceLocationCount`;
- Location handoff coverage:
  `attributedCount/employeeCount/missingAttributionCount/truncated`; the
  `byEmployee` list is not required by the frozen reference and must not be
  promoted into an employee ranking;
- Company handoff coverage:
  `attributedCount/missingAttributionCount/distinctAttributedEmployeeCount`;
- Key Exceptions: `count` and exactly four `byType` entries;
- Company coverage: total/active/inactive Location counts plus timezone
  boundaries.

Reference Guest Satisfaction and any Returning Contact aggregate are
**REMOVE**: current C9 explicitly says they are unavailable
(`docs/24:365-366`).

### 15.4 Reports

Report preview does not define new metrics. It renders the current report DTO:

- Location report `summary` contains `metrics`, `carsHandledPerDay`,
  `currencies`, `cashReconciliation`, and `incidents`
  (`location-report.ts:53-61`);
- Company report `summary` is the full
  `companyAnalyticsSummarySchema`: `coverage`, `operational`,
  `financial`, `incidents`, `kpis`
  (`company-report.ts:53-73`, `company-analytics.ts:139-147`);
- DAILY only: `dailyActivity.retrievalRequestedCount`,
  `dispatchEventCounts[]`, `keyCustodyEventCounts[]`.

CSV/PDF content remains server-owned. The browser does not recompute report
rows.

## 16. Period / timezone matrix

| Endpoint family | Accepted selector | Semantics | Max / boundaries | Timezone | Invalid input |
|---|---|---|---|---|---|
| Location current overview/queue | none | point-in-time/current cohort | n/a | persisted Location context where relevant | n/a |
| Location analytics | `from=YYYY-MM-DD&to=YYYY-MM-DD` | inclusive local dates; UTC window is [from local midnight, day-after-to local midnight) | <=31 local calendar days inclusive | target Location persisted IANA timezone; PostgreSQL `AT TIME ZONE` handles DST | strict invalid date/order/>31 fails request validation |
| Company analytics | same `from,to` | same local-date intent applied independently to each Organization Location | <=31; all Location bounds composed server-side | each persisted Location timezone; response exposes grouped UTC boundaries | same |
| Location daily report | `date=YYYY-MM-DD` | one local calendar date | periodFrom=periodTo=date | Location persisted timezone for source cohorts | invalid calendar date fails |
| Company daily report | `date=YYYY-MM-DD` | one local date interpreted per Location by server Company bounds | one day | each Location timezone | invalid date fails |
| Location/Company weekly | `weekStart=YYYY-MM-DD` | Monday through following Sunday inclusive | exactly seven local dates | Location timezone / per-Location Company timezone | non-Monday or invalid date fails |
| Location/Company monthly | `month=YYYY-MM` | calendar month first through last day | actual month length | Location timezone / per-Location Company timezone | invalid month fails |
| Export | discriminated selector matching kind | exactly same period derivation as preview | same | same | server rejects invalid request |

Evidence:

- `analytics-period.ts:36-53,110-119`;
- `report-period.ts:39-80`;
- Company per-Location bounds:
  `company-analytics-bounds.ts:1-10`;
- Company daily activity reuses those bounds:
  `company-report-daily-activity-query.ts:22-80`.

The browser must not compute UTC offsets or DST windows. Current authority does
not define a default analytics/report period. Therefore MD-05 must not invent
“Today”, “Last 7 days”, or “Last 30 days” as an authoritative default. Period
endpoints load only after the user has an explicit valid selector; exact-Location
current-state panels may load immediately.

## 17. Money / currency matrix

| Field family | Contract representation | Rendering rule |
|---|---|---|
| financial overview totals | string matching exact 3-decimal decimal | display exact value with its returned currency group |
| analytics collected/tip/refund/validation totals | exact 3-decimal string | never floating-sum or FX |
| cash expected/reported/variance | signed exact 3-decimal string | preserve sign and currency |
| percentage | string with 2 decimals or null | display returned value; do not recompute from rounded display values |
| duration/ratio/per1000 | string with 3 decimals or null | display returned value; chart coordinate conversion is presentation-only |
| counts/numerators/denominators | integer | may be displayed directly; do not create unsupported business totals |

Source-of-truth money rules:

- database financial values are `numeric(14,3)` / Decimal, never float
  (`docs/03:44-59`);
- Payment currency is immutable history;
- paid collections, succeeded refunds, validation and cash reconciliation have
  different cohort timestamps and must remain distinct
  (`DEC-060:72-103`, `analytics-financial-query.ts:168-178`);
- Company financial source performs exact SQL numeric aggregation grouped by
  currency (`company-analytics-financial-query.ts:24-136`).

Frontend calculations permitted:

- locale/display formatting of a returned exact value;
- chart coordinate scaling that does not change the displayed/source value;
- no money total, rate, ratio, average, cross-currency sum or FX conversion.

## 18. Report / export matrix

| Scope | Kind | Selector | Preview endpoint | Export body | Formats | Authority | Failure / localization |
|---|---|---|---|---|---|---|---|
| Location | DAILY | `date` | `GET D/reports/daily` | `{kind:"DAILY",format,date}` | CSV/PDF | CA Standard MFA or LM exact active grant; D + Export for POST | final denial/422/lost response no file; PDF locale-neutral |
| Location | WEEKLY | Monday `weekStart` | `GET D/reports/weekly` | `{kind:"WEEKLY",format,weekStart}` | CSV/PDF | same | same |
| Location | MONTHLY | `month` | `GET D/reports/monthly` | `{kind:"MONTHLY",format,month}` | CSV/PDF | same | same |
| Company | DAILY | `date` | `GET O/reports/daily` | same shape | CSV/PDF | CA Standard MFA; D + Export for POST | same |
| Company | WEEKLY | Monday `weekStart` | `GET O/reports/weekly` | same shape | CSV/PDF | same | same |
| Company | MONTHLY | `month` | `GET O/reports/monthly` | same shape | CSV/PDF | same | same |

Server artifact filenames:

- Location: `report-<kind-lower>-<periodFrom>.csv|pdf`
  (`report-csv-renderer.ts:130-134`, `report-pdf-renderer.ts:115-119`);
- Company: `company-report-<kind-lower>-<periodFrom>.csv|pdf`
  (`company-report-csv-renderer.ts:24-28`,
  `company-report-pdf-renderer.ts:47-51`).

Server behavior that the UI must preserve:

- final authority and Export-access are rechecked after rendering;
- one successful explicit generation appends one export audit;
- 5 MiB limit is server-owned;
- CSV cells are server hardened against formula/control injection;
- PDF uses deterministic StandardFont-safe output and is not Arabic-localized;
- no stored artifact, scheduler, email delivery or background generation;
- another explicit POST is another generation/audit;
- lost response is not a reason for automatic retry.

## 19. Test ownership matrix

| Proof | Owner | Exact responsibility |
|---|---|---|
| analytics/report JSON adapters | MD-05A | endpoint/query/schema and scope selection |
| scope/generation/A→B→A primitive | MD-05A | all identity dimensions and stale success/failure |
| exact decimal/null formatting primitive | MD-05A | preserve strings/null/currency identity |
| MD-05 route/navigation authority | MD-05A | `MANAGEMENT_INTELLIGENCE` aligns scope entry, direct-route revalidation and navigation; proves inactive CA/LM exact Locations fail closed without a feature-authority probe |
| mixed currency Payments | MD-05B | separate grouped cards/tables, no FX/aggregate |
| validation composition | MD-05B | truthful aggregate only; no `/validations` workflow |
| Overview current vs period truth | MD-05B | state/queue vs period metrics |
| Overview/Payments visual freeze | MD-05B | reference composition, EN/AR/responsive |
| analytics period validation | MD-05C | explicit dates, <=31, URL proof, no timezone math |
| Company coverage/mixed timezone | MD-05C | server boundaries/contributing coverage |
| official vs auxiliary retrieval | MD-05C | label/source separation |
| SLA/employee attribution/key exception coverage | MD-05C | null/missing/controlled catalog |
| Analytics selected-scope + period races | MD-05C | delayed response fencing |
| report preview selectors | MD-05D | daily/weekly/monthly × Company/Location |
| binary client/no replay | MD-05D | 401 POST no replay, auth-generation fence, headers |
| export final denial | MD-05D | revocation after render/advisory state; zero download |
| export lost response | MD-05D | exactly one POST, explicit unknown outcome |
| filename/content/actual file | MD-05D | Content-Disposition/type; save/open CSV/PDF |
| final navigation/accessibility | MD-05D | four destinations, no Validations, EN/AR/keyboard |
| cumulative MD-05 closure | MD-05D authors; closure review reruns | `e2e/md05-closure.spec.ts`: CA Company vs Location, LM Location, mixed timezone/currency/null coverage, preview/export, no fake routes/data |

Tests must not duplicate server formula verification in frontend files. Existing
backend integration tests own formula/finalization internals; Dashboard tests
prove endpoint choice, safe presentation, race/authority and artifact behavior.

## 20. File-size / architecture plan

Every new or modified authored code/test file must remain <=300 physical lines.

- Do not modify the existing 300-line
  `components/scope/use-scope-entry-controller.ts`.
- Do not modify the existing 300-line
  `e2e/support/dashboard-api-fixture.ts`; create a focused MD-05 helper.
- Avoid modifying the 291-line
  `components/foundation/management-foundation-app.tsx`; the current protected
  context is already sufficient.
- `dashboard-api-client.ts` is 174 lines and may own the binary auth/fence
  orchestration. If the final file would approach/exceed 300 lines, extract only
  pure binary Content-Type/Content-Disposition parsing into
  `lib/api/dashboard-binary-response.ts`; keep auth/session logic in the
  existing client. Do not create a second client.
- Do not add binary cases to the 261-line
  `dashboard-api-client.test.ts`; use
  `dashboard-api-client-binary.test.ts`.
- Split page charts/tables/presentation adapters by responsibility before any
  intelligence TS/TSX/CSS/test file crosses 300 lines. Do not compress code to
  evade the physical-line rule.

## 21. No temporary product lies

The serial merge is intentionally non-visible until a page is real:

- MD-05A merges internal adapters only; no route/nav.
- MD-05B creates real Overview/Payments routes but navigation remains
  unregistered; direct routes are protected and contain no placeholder/sample
  data.
- MD-05C adds a real Analytics route; navigation remains unregistered.
- MD-05D adds a real Reports route and only then registers all four completed
  destinations.

At no boundary may main contain fake metrics, sample charts, fake transactions,
validation records/workflow, dead export controls, Company fan-out, merged
currencies, unsupported filters or navigation to unfinished MD-05 pages.

## 22. Safe serial merge order

```text
main@ca7511e4b1892b194bd209c328c713461456af43
→ MD-05A implementation
→ independent review
→ Project Owner-approved fast-forward to main
→ MD-05B implementation from that new main
→ independent review
→ Project Owner-approved fast-forward to main
→ MD-05C implementation from that new main
→ independent review
→ Project Owner-approved fast-forward to main
→ MD-05D implementation from that new main
→ independent review
→ Project Owner-approved fast-forward to main
→ MD-05 closure review/gate
→ only then MD-06
```

Freeze after each merge:

- **A:** scope kinds, JSON endpoint adapters, query identity dimensions,
  generation fencing, exact/null formatting and the
  `MANAGEMENT_INTELLIGENCE` authority requirement.
- **B:** Overview/Payments route ownership, source-backed card/table mapping,
  standalone Validations removal decision.
- **C:** Analytics metric/coverage mapping and chart/text-alternative contract.
- **D:** binary export semantics, filenames/content handling and the four-item
  MD-05 navigation group.

No implementation merge is authorized by this planning document.

## 23. Consolidated stop conditions

Any implementation task must stop and return to the Project Owner, with exact
file:line evidence, if one of these becomes true:

1. a route or schema in Section 4 does not exist on that task's actual baseline;
2. a retained visible field cannot be traced through Sections 14-18;
3. Company mode would require browser fan-out to Locations, average-of-averages,
   sum-of-ratios, sum of Location distinct employees, or an Organization
   timezone invented in the frontend;
4. a currency would have to be converted, merged, or aggregated with another
   currency;
5. a null/missing denominator, sample, target, attribution or coverage value
   would need to be shown as zero to fill the reference;
6. a proposed role/scope is not authorized by the actual current backend;
7. Standard versus Sensitive MFA differs from the inspected routes;
8. report preview/export semantics or final authorization differ from current
   controllers/services;
9. binary download cannot be added to the existing API-client/auth-generation
   boundary without creating a second client/auth system;
10. a reference control requires a transaction ledger, validation workflow,
    custom report, scheduler, stored artifact, Guest Rating aggregate, Returning
    Contact aggregate or another backend capability absent from current source;
11. a task would need backend/contracts/database changes to complete its stated
    retained surface;
12. a task would have to expose navigation to a page owned by a later task;
13. completing MD-05 would require an MD-06-owned cumulative integration change.

Unsupported prototype content is removed/adapted; these stop conditions do not
authorize an invented workaround.

## 24. Final MD-05 closure gate

Run this gate only after MD-05A/B/C/D have each passed independent review and
have been fast-forwarded to `main`.

### 24.1 Contract and endpoint proof

- CA All Locations Overview/Payments/Analytics use
  `GET O/analytics/all-locations`; captured requests prove no Location fan-out.
- CA exact active Location and LM exact active Location use only the exact
  Location C8/C9/C10 routes.
- CA inactive/historical Location has no MD-05 navigation item and direct MD-05
  route revalidation denies before content; no C8/C9/C10 request is issued.
- Company report preview/export uses Organization routes; Location preview/export
  uses Location routes.
- every request carries exactly the selected period/report selector.
- 32-day, invalid date, non-Monday weekly selector and invalid month are visibly
  rejected; no silent coercion.

### 24.2 Data-truth proof

- mixed-timezone Company response displays server coverage boundaries and does
  not choose one Organization timezone;
- mixed-currency responses remain separate in Payments, Analytics and report
  preview;
- exact decimal strings remain exact at displayed value boundaries and no
  floating-point money aggregation exists;
- zero denominator/sample remains null/missing rather than zero;
- official Retrieval Wait and auxiliary start latency are distinctly labeled;
- SLA target/interval coverage remains explicit;
- Cars per Active Employee uses returned numerator/denominator/value;
- handoff missing attribution remains visible and Company does not fabricate
  `byEmployee`;
- Key Exceptions use only the controlled four types;
- no current-page list length is treated as a total;
- exact-Location financial overview is not labeled period revenue.

### 24.3 Validation-composition proof

- `/validations` is absent from production routes and navigation;
- no pending/approved/rejected validation table, create, approve, reject or
  status mutation exists;
- Payments/Analytics display only
  `validationRate` and `currentValidationAmountTotal` from current financial
  contracts.

### 24.4 No-fallback/reference proof

- no mock service, inline fake metric, fake transaction, fake trend, fallback
  chart sample or fake successful report action exists under production
  `apps/dashboard/src/**`;
- Overview, Payments, Analytics and Reports retain the frozen reference
  composition while unsupported controls are removed/adapted;
- chart visuals have textual/data alternatives;
- representative desktop and narrow-width comparison is recorded for EN and AR.

### 24.5 Report / export proof

- DAILY/WEEKLY/MONTHLY preview renders real Location and Company DTOs.
- one explicit CSV click causes one export POST and one file download.
- one explicit PDF click causes one export POST and one file download.
- downloaded Location and Company CSV/PDF filenames equal server
  Content-Disposition names and actual files are saved/opened.
- reportExports absent/false leaves preview readable when D-access is valid but
  marks export unavailable.
- authority/entitlement revoked during generation produces final denial and zero
  download.
- 5 MiB failure produces the current server error state and zero download.
- an export network/lost-response case observes exactly one POST, displays
  unknown outcome, and performs no automatic retry.
- a rejected POST followed by auth refresh is not replayed; another POST requires
  explicit user action.
- Arabic UI does not claim the current PDF is Arabic-localized.

### 24.6 Authority, generation and privacy proof

- CA Company, CA active Location and LM active Location positive flows pass.
- Supervisor, Employee and Guest/direct unauthorized MD-05 access is denied.
- Company→Location→Company and Location A→B→A delayed successes/failures cannot
  repopulate stale data.
- period A→B delayed response cannot replace B.
- export response is accepted only by its initiating auth/scope/selector intent.
- no protected MD-05 business response is persisted in browser storage.

### 24.7 EN/AR, accessibility and responsive proof

- complete MD-05 flows work in English and Arabic;
- `html[dir]` follows the current locale provider;
- currency codes, exact amounts, canonical enum/code values and identifiers are
  safely bidirectional;
- every selector/button/table action has a meaningful accessible name;
- keyboard-only operation works;
- dialog/focus behavior reuses the existing focus-safe primitive;
- chart information is available without hover/pointer;
- narrow navigation/page composition is usable at the repository's current
  responsive breakpoint family.

### 24.8 Required automated validation

Dashboard:

```text
pnpm --filter @valet/dashboard lint
pnpm --filter @valet/dashboard typecheck
pnpm --filter @valet/dashboard test
pnpm --filter @valet/dashboard test:e2e
pnpm architecture:check
```

Focused owned backend regression through the repository harness:

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-analytics-api.integration.test.ts test/dashboard-analytics-financial.integration.test.ts test/dashboard-analytics-kpis.integration.test.ts test/dashboard-reports-api.integration.test.ts test/dashboard-report-commercial.integration.test.ts test/management-location-export-session-finalization.integration.test.ts test/management-commercial-location-export-finalization.integration.test.ts test/management-company-analytics-authorization.integration.test.ts test/management-company-analytics-boundaries.integration.test.ts test/management-company-analytics-financial.integration.test.ts test/management-company-analytics-weighting.integration.test.ts test/management-company-analytics-snapshot-concurrency.integration.test.ts test/management-company-reports.integration.test.ts test/management-company-report-snapshot-concurrency.integration.test.ts test/management-company-report-finalization.integration.test.ts test/management-company-report-export-http.integration.test.ts test/management-company-report-commercial.integration.test.ts
```

Cumulative repository/build gates required by current `docs/24:897-907`:

```text
pnpm lint
pnpm typecheck
pnpm architecture:check
pnpm test
pnpm build
pnpm build:production
```

`pnpm build:production` must use the actual required production configuration,
not a fake default. Root/package test commands already route PostgreSQL work
through the repository-owned bounded harness; do not replace them with direct
uncontrolled Vitest/PostgreSQL invocation.

### 24.9 Repository closure

- every new/modified authored code/test file is <=300 physical lines;
- no production dependency imports from `reference/**`;
- no backend/contracts/database migration is part of MD-05;
- no MD-06 code is present;
- task commits match their boundaries;
- final `main` working tree is clean and local `main` matches the
  Project Owner-approved integrated remote baseline.

MD-05 is closed only when every item in 24.1-24.9 is binary PASS.

## 25. Explicit exclusions

MD-05 must not implement or imply:

- a second API client, auth/session model, scope model, navigation-authority
  system, generation framework, i18n system, component library or test framework;
- backend/contracts/database changes;
- new KPI formulas;
- Guest Satisfaction/Guest Rating aggregate presentation;
- Returning Contact aggregate KPI;
- transaction ledger/search/details/receipt;
- validation record/workflow/create/approve/reject/status mutation;
- Company client fan-out or client rollup;
- FX/cross-currency totals;
- custom reports, stored report artifacts, scheduler, email delivery or automatic
  generation;
- Arabic PDF rendering beyond the current locale-neutral server artifact;
- automatic export retry or invented client idempotency;
- unsupported filters/totals;
- field operational mutations;
- MD-06 cumulative integration work.

## 26. Remaining unknowns

No backend/contract blocker remains on the verified planning baseline.

One source-level product detail is intentionally absent: current authority does
not prescribe a default initial analytics/report period. The frozen prototype's
“Today” or similar local defaults are not product authority. This does **not**
block MD-05: pages must require an explicit valid period/report selector before
issuing period/report requests. It would become a product decision only if the
Project Owner later requires an automatic initial period.

One local code-shape detail is intentionally open but non-blocking:
`apps/dashboard/src/lib/api/dashboard-api-client.ts:121-159` is JSON-only today,
so MD-05D owns one narrow binary method inside that existing auth/session-
generation boundary. Its local method/type names may follow the repository's
implementation style, but its typed result must carry validated artifact bytes,
content type and the server filename; it must not replay POST and must satisfy
Section 11 N/P/Q. No second client/auth stack is permitted.

No other implementation-blocking unknown was found. If the actual
implementation baseline changes after this plan, Section 23 requires
re-verification before using this split.
