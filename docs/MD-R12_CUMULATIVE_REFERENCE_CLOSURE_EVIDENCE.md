# MD-R12 — Cumulative reference closure evidence

Status: **GAP**. This is an evidence record, not a declaration of release acceptance.

## A. Baseline and scope

- Task branch: `fix/md-r12-dashboard-reference-closure`.
- Current-main base after fetch and fast-forward pull: `0a63cfd6811e417f650da04d7c5ba218d688cc7a`.
- Final branch SHA: the SHA pointed to by this branch after push is reported in the final task response. A commit cannot embed its own SHA in a tracked file without changing that SHA.
- R01–R11 are present on that main. No worktree, PR, merge, or push to main.
- Affected entities are Dashboard presentation and its cumulative browser test. No ValetSession or Task/Dispatch transition, tenant/location authorization rule, configuration precedence, database constraint/index, schema, API, dependency, or backend business rule changes.
- Approved sellable-MVP Dashboard boundaries and Accepted decisions remain authoritative. The release gate does not authorize a new capability.

## B. Physical reference and candidate inspection

The live reference at `http://localhost:3011/` and the locally started candidate at `http://localhost:3003/` were opened and operated in the in-app Chromium browser. At its actual `746×635` viewport, the reference settled and was visually inspected at `#/overview`, `#/live-operations`, `#/vehicles`, `#/tasks`, `#/employees`, `#/locations`, `#/maps-zones`, `#/keys`, `#/payments`, `#/validations`, `#/incidents`, `#/customers`, `#/analytics`, `#/reports`, `#/policies`, `#/roles-permissions`, and `#/settings`; Help was opened through `#/help-support`. Dark reference presentation was also inspected. The in-app browser's requested 1440×900 viewport did not change its actual 746-pixel inner width. A separate controlled Chromium capture then recorded **20 live reference routes at 1440×900 and 480×900** (40 route/viewport pairs) in `C:/Users/LP/.codex/visualizations/2026/09/28/01a0e886-a639-7351-80eb-b3ed36e59a08/reference-1440`, `reference-480`, and `r12-reference-capture.json`. `#/billing-subscription` is the actual Billing route. These PNGs are local evidence, outside Git. The capture records headings, actual viewport and document width, direction and theme attributes. It is EN Light reference evidence, not a candidate comparison or full theme/locale matrix.

The candidate was opened with synthetic MD06 Company Admin fixture credentials on Organization A, All Locations. Overview, Employees, Locations, Payments, Visit Contacts, Analytics, Reports, Policies & Settings, Roles & Permissions, Integrations & Connectors, Branding, Billing & Subscription, Audit Log, and Help settled with the expected page heading. At exact MD06 Garage A, Live Operations, Vehicles, Tasks, Maps & Zones, Keys, and Incidents did likewise. In these observed states, document width stayed at the 746-pixel viewport, and the candidate showed actual empty/unavailable states. Arabic RTL and Dark were physically inspected on Incidents; the document became `lang=ar dir=rtl` without document overflow. A separate controlled Chromium capture, with the synthetic authorized fixture and local development MFA bypass, recorded **14 Company routes plus six exact-Location routes** at both 1440×900 and 480×900 (40 route/viewport pairs) in `C:/Users/LP/.codex/visualizations/2026/09/28/01a0e886-a639-7351-80eb-b3ed36e59a08/candidate-*` and `r12-candidate-capture.json`. All 40 had the expected heading and `scrollWidth == innerWidth`. Direct browser reload loses the in-memory workspace selection, so the capture used actual in-app link navigation after authorization. These are EN Light candidate captures. Reference and candidate were physically inspected, but this is **not** a completed route × role × locale × theme × viewport visual matrix.

Earlier task artifacts in `docs/MD-R10_REPORTS_VISIT_CONTACTS_EVIDENCE.md` and `docs/MD-R11_ADMINISTRATION_REFERENCE_EVIDENCE.md` record controlled reference measurements and screenshots for their routes. They are inherited evidence. R12 in-app screenshots were observed in the tool session and were not saved as reusable image files. Neither MFA secrets nor recovery material were captured.

| Visual family | R12 physical observation | Acceptance limit |
| --- | --- | --- |
| Shell, navigation, scope | Both dashboards inspected at 746px; candidate Company and exact Location navigation exercised; 40 controlled reference and 40 candidate PNGs at 1440px/480px | Full Dark/RTL and role/state matrix remains incomplete |
| Overview and operational routes | Corresponding reference routes and candidate Company/Location pages captured at two controlled widths | Detailed typography, geometry, hover, loading/error and every control were not measured on every route |
| Administration and commercial routes | Reference Policies, Roles, Settings, Help and candidate settings/roles/integrations/branding/billing/help inspected | Reference has no direct counterpart for all candidate routes; all role variants were not physically repeated |
| Reports and Visit Contacts | Reference Reports/Customers and candidate Reports/Visit Contacts inspected | Privacy and report semantics depend on real-runtime proof; no complete per-viewport comparison in R12 |
| Arabic, Dark, narrow | Candidate Arabic RTL/Dark Incidents and reference Dark inspected; no observed 746px document overflow | Other surfaces and 480px physical matrix remain unverified in this task |

## C. Intentional reference exceptions

The following are inherited, authorized differences. Each row gives reference element/location, candidate treatment, exact approved reason, evidence, and whether a new owner approval is needed. These rows do not excuse unmeasured visual differences.

| Reference element / location | Production treatment | Reason | Evidence/source | New approval? |
| --- | --- | --- | --- | --- |
| Global search, alert/message badges and avatar menu / topbar | Authorized scope, locale/theme and sign-out controls; no implied global search, messaging, alert count or profile editor | PROTOTYPE_FICTION | R12 paired 1440px shell captures; R01/R11 evidence | NO |
| Always-visible operational modules / reference sidebar | Candidate navigation changes with real Company/Location/role grants | AUTHORITY | Accepted management authority; R12 paired scope captures and route E2E | NO |
| Fixed sidebar and wide tables / all narrow routes | Responsive navigation, local table scrolling and visible keyboard focus | ACCESSIBILITY | R10/R11 evidence and R12 746px inspection | NO |
| English text after Arabic preview / all reference routes | Real Arabic text, RTL document direction and LTR isolation for IDs/dates | LOCALIZATION | R10/R11 evidence; R12 Incidents observation | NO |
| Sample totals and populated tables / overview, operations, reports | Real API values, distinct empty/unavailable/denied states | TRUTHFUL_STATE | Accepted backend contracts; candidate observations and E2E | NO |
| Global customer ownership, Add Customer / `#/customers` | Authorized Visit Contacts search/history/correction, with no global CRM claim | PRIVACY | DEC-084/091; R10 evidence | NO |
| Create/custom report and sample report inventory / `#/reports` | Bounded authoritative report preview and audited server CSV/PDF export | UNSUPPORTED_BACKEND | R10 evidence and real-runtime export E2E | NO |
| General validation dashboard / `#/validations` | Existing payment/validation facts only where a backend contract supplies them | UNSUPPORTED_BACKEND | R09 browser tests; R12 reference capture and candidate route inventory | NO |
| Generic policies and arbitrary policy editor / `#/policies` | Typed Company defaults and Location overrides only | PROTOTYPE_FICTION | DEC-058/080/083/095; R11 evidence | NO |
| Custom role editor and asserted user totals / `#/roles-permissions` | Four accepted staff roles and bounded read-only directory | AUTHORITY | DEC-081; R11 evidence | NO |
| Logo/domain/font editing / Settings branding | Approved name/color inheritance only | UNSUPPORTED_BACKEND | DEC-062/085/086; R11 evidence | NO |
| Provider setup, Configure and Test Connection / integrations | Exact three status-only integrations | UNSUPPORTED_BACKEND | DEC-087; R11 evidence | NO |
| Prices, invoices, payment card and checkout / billing | Server-owned subscription status and entitlements | PROTOTYPE_FICTION | DEC-088/089; R11 evidence | NO |
| MFA toggle and general profile edits / Settings security | Separate real account-security MFA ceremonies | SECURITY | DEC-078; R11 evidence; real-runtime E2E with MFA enforced | NO |
| Ticket status, hotline and gateway health / Help | Static help and security guidance | UNSUPPORTED_BACKEND | R11 evidence and physical reference inspection | NO |

## D. Backend truth and product gaps

The inspected candidate uses existing production API adapters and typed contracts; this task added no client-generated sample totals, exports, provider status, tickets, billing execution or backend endpoint. Candidate empty/unavailable states were visible. Full absence of invented values across all route/state combinations is **not** newly proven by physical inspection alone. Existing R01–R11 tests/evidence and the R12 test runs below are supporting evidence.

Unimplemented reference/Blueprint sub-scopes remain documented in R10/R11: broader integration status, configured support/ticketing, general profile editing and verified logo lifecycle. Each requires a separate approved backend/product contract, role/scope and audit/concurrency/DB decision before implementation. None was implemented in R12. R12 discovered no new backend capability that justifies schema/API expansion.

## E. Route and authority

The real-runtime Dashboard suite was run against the local API and PostgreSQL fixture **with MFA enforced** before the user requested local development bypass. Its 23 passing cases cover Guest/disabled denial, Location Manager grants, Supervisor/Employee separation, Company Admin MFA, entitlement/grant/role loss and direct-route/session boundaries. Fixture browser suites exercise route visibility and direct-route behavior across R01–R11. This is automated route/authority evidence; it does not mean every route was physically opened under every role in R12. Inactive/historical Location combinations also were not fully physically enumerated in this run.

For the user's local development request, `VAYLET_LOCAL_DISABLE_MFA=true` was supplied only to a separate **development** API process against a verified localhost database. The source guard requires development mode and localhost. No repository configuration or production MFA contract was changed. That process has been stopped. The earlier 23-case real-runtime security result was obtained with bypass **off**.

## F. Concurrency and pagination

The 23-case real-runtime suite exercises scope ABA races, pending reads/writes, stale authority/entitlement, two-tab CAS/MFA, session revocation and export final denial. The fixture E2E suite includes period, Location and Organization selection races, stale success/failure, cursor generations and explicit mutation retry behavior. These are automated proofs, not a new manual replay of every scenario. Existing cursor contracts keep opaque cursors and avoid invented totals. No request client, generation fence, cursor, CAS or mutation replay code changed in R12.

## G. Privacy and export

Real-runtime cases cover browser persistence sentinels, logout/back, protected payload absence, audit privacy and export/final-denial races. Fixture E2E covers object URL cleanup, one explicit POST, no automatic replay, unknown outcome, filename/content type, CSV/PDF signatures and Company/Location paths. Exact case-by-case artifact opens and all storage engines were not independently repeated manually in this R12 session. No real customer data or MFA recovery material was added to evidence.

## H. Accessibility and localization

The changed cumulative E2E now proves keyboard opening, Escape close and focus restoration for Visit Contact and Audit detail; after Arabic switching it verifies the canonical audit event type stays LTR inside the dialog. Existing fixture E2E covers navigation, scope, period, settings, reports, map and responsive/focus scenarios. Physical R12 inspection confirmed one Arabic RTL/Dark candidate route and no 746px document overflow there. A full manual keyboard pass across every listed dialog and all RTL routes remains a gap.

## I. Performance and request budget

The real-runtime suite includes bounded request/race cases, and R01–R11 fixture tests assert request budgets and avoid aggregate Location fan-out. No R12 code changed a request path. Local Next development logs included example route GETs of 28ms (Overview), 233ms (Billing), 315ms (Locations), and a colder 1747ms (Roles). These are server route timings in a development process, not a representative end-to-end interaction series or N+1 trace; the approximate two-second interaction target is **unmeasured**, not PASS.

## J. Test repair and validation

The first complete fixture browser run had **472 passed, 1 failed** (473 total). The failure was in `md06-cumulative-ui.spec.ts`: R08 had humanized the Audit Inspect button to “Company setting default changed,” while the older cumulative test still selected the raw enum as the button's accessible name. The raw canonical enum correctly remains in Audit detail. The test was corrected to select the humanized button and verify the canonical enum in the detail dialog after Arabic switching, preserving keyboard/focus assertions. Focused rerun: **1 passed**.

The second complete browser run again had **472 passed, 1 failed**. This time `operations-r04-visual.spec.ts` compared a Chromium bounding-box height by exact floating-point equality: expected `61`, observed `60.999969482421875`. That is a 0.000031-pixel representation difference, with no visual/product discrepancy. The assertion now uses `toBeCloseTo(61, 3)`, a sub-0.001-pixel tolerance. The two corrected specs were rerun together: **2 passed**. No production source was changed.

| Gate | Observed result |
| --- | --- |
| Real-runtime Dashboard/API/PostgreSQL E2E, MFA enforced | 23 passed |
| Dashboard unit | 69 files, 517 tests passed |
| Complete Dashboard fixture E2E, initial run | 472 passed, 1 failed (stale Audit selector) |
| Focused cumulative E2E, after first test repair | 1 passed |
| Complete Dashboard fixture E2E, second run | 472 passed, 1 failed (fractional Chromium box height) |
| Focused two-spec E2E, after second test repair | 2 passed |
| Complete Dashboard fixture E2E, final run | **473 passed, 0 failed** (13.3 minutes) |
| `corepack pnpm lint` | 11/11 Turbo tasks passed |
| `corepack pnpm typecheck` | 11/11 Turbo tasks passed |
| `corepack pnpm architecture:check` | Passed; 18 grandfathered oversized-file warnings |
| `corepack pnpm format:check` | Failed on 932 pre-existing repository files; no mass formatting attempted |
| `corepack pnpm test:build-contract` | Initial sandbox EPERM reading installed Next executable; elevated rerun 4/4 passed |
| Root `corepack pnpm test` | **FAILED / incomplete**. Initial run used incorrect default PostgreSQL password. Second run with local `.env` passed pure Turbo and API non-PostgreSQL phases, then one financial-release API PostgreSQL case hit its 5-second limit while browser work overlapped; run stopped. Third run passed pure Turbo but API non-PostgreSQL had one 10-second hook timeout and one 5-second test timeout; PostgreSQL phase emitted no test result for over 14 minutes and was stopped. No root-suite PASS. |
| Normal `corepack pnpm build` | **10/10 Turbo tasks successful**, exit 0; verification mode, no fake production values |
| Changed-file Prettier check | Both changed specs passed using installed Prettier binary |
| `git diff --check` | Passed before final review; rerun before commit |

Focused diagnosis after the root runs, with the repository `.env` loaded and its migration URL verified as localhost: the two non-PostgreSQL files that timed out in the third run passed **2 files / 14 tests**; the financial-release PostgreSQL file that timed out in the second run passed **1 file / 11 tests**. These targeted passes identify timing/environment sensitivity and do **not** turn the root gate into PASS. The first focused command without `.env` also failed authentication against the harness default `valet:valet` URL; it was immediately rerun with the verified local URL.

Commands actually executed include `corepack pnpm --filter @valet/dashboard test`, `corepack pnpm --filter @valet/dashboard test:e2e --reporter=line --output=<local evidence directory>` with `E2E_BASE_URL=http://localhost:3003` (three complete runs), the two-spec focused E2E command, the 23-case real-runtime Playwright suite through the local R11 runtime wrapper with MFA enforced, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm architecture:check`, `corepack pnpm test:build-contract`, `corepack pnpm build`, `corepack pnpm format:check`, installed-Prettier changed-file checks, `corepack pnpm test` (initial/default and two `.env`-backed attempts), and focused API files via `scripts/test-harness/run-owned-tests.mjs` with `--env-file` for the verified localhost database. No `build:production` command was run.

The complete fixture E2E suite is green after the two test repairs. `operations-r04-visual.spec.ts` was then formatted without semantic change; focused two-spec E2E had already passed after its assertion repair. The repository-wide formatter failure is a separate pre-existing gate failure. Do not convert local test results into GitHub CI status.

## K. File size and boundaries

Only two authored test files changed: `apps/dashboard/e2e/md06-cumulative-ui.spec.ts`, **139 physical lines**, and `apps/dashboard/e2e/operations-r04-visual.spec.ts`, **215 physical lines** after formatting (both below the 300-line limit). This evidence Markdown file is not authored code/style/test. Prisma schema: unchanged. Migration files: unchanged; count **45 before and after**. API/contracts/lockfile/dependencies: unchanged. Generated `next-env.d.ts` from local Next development is to be restored before commit. No product-state or payment/incident semantics changed.

## L. Git, CI and final result

Final diff review, commit, push and post-push status are reported in the final task response because the tracked evidence document cannot contain its own final commit SHA. The repository GitHub workflow runs on main/PR; a task-branch push without PR does not constitute a CI run. GitHub CI is **NOT RUN / BLOCKED by this no-PR task process**, and no owner exception was supplied. Production deployment and configuration proof remain Issue #227.

**R12 result: GAP.** The complete fixture E2E and normal build passed, but the full route × authority × theme × locale × viewport physical matrix and systematic manual accessibility/performance checks remain incomplete. The complete root test gate failed/incompletely ran, repository-wide format check failed on pre-existing files, and GitHub CI cannot be labeled PASS without a PR/main workflow or explicit approved process exception. The declaration **“Management Dashboard Reference Remediation = DONE” is not justified** by this evidence.
