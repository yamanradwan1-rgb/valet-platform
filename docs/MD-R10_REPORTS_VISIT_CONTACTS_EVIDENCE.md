# MD-R10 — Reports and Visit Contacts evidence

## A. Task and baseline

Scope: presentation parity for Reports and Visit Contacts, including preserved export, authority, privacy and correction contracts. Base: `7cb2b55fb68c0444d007135daebd27a954f4f083` (`fix(dashboard): restore payments and analytics reference parity`). Branch: `fix/md-r10-reports-visit-contacts-reference-parity`. Main was fetched, fast-forward checked and clean before branch creation. No worktree, PR or merge.

Binding sources: AGENTS.md; docs 15, 17, 24, 25; Accepted DEC-061/078/080/084/088/091/092/093/094/095; owner task and supplied Reference Remediation Plan v1.1. Local plan: `C:/Users/LP/Desktop/VAYLET_DASHBOARD_REFERENCE_REMEDIATION_PLAN_v1.1(4).md`.

Pre-code contract: report projections and visit-associated Customer/Vehicle/ValetSession history are affected only in presentation. No ValetSession or Task/Dispatch transition changes. No authorization, DB constraints/indexes, configuration policy or Company-default/Location-override changes. Existing approved Management scope is retained. Canonical facts and nulls remain visible. Report formulas and phone normalization remain server-owned.

Decision ledger: LOCKED — fixed report kinds, exact scope routing, bounded visit history, MFA/CAS, no replay. DERIVED — localized secondary evidence, explicit UTC for visit instants lacking a Location timezone, local scroll regions. FORBIDDEN — custom reports, delivery automation, CRM, ownership claims, bulk export, new contracts/schema/dependencies. No unresolved product decisions introduced.

## B. Live reference evidence

Reference `http://localhost:3011/`, candidate `http://localhost:3003/`, Chromium at 100% zoom/device scale 1, 1440×900 and 480×900, Light and Dark. Reports and Customers routes, report action/create overlay vocabulary, and contact detail drawer inspected before implementation. Only prototype overlays were opened; no prototype data was submitted.

Evidence root: `C:/Users/LP/.codex/visualizations/2026/09/27/01a0e40a-1703-7113-b279-c7c7bb627f03/`.

- `reference-measurements.json`: 20 observations, measured bounding boxes, typography, colors and spacing.
- `reference-reports-*`, `reference-contacts-*`, `reference-report-modal-*`, `reference-contact-drawer-*`: reference screenshots.
- `reference-ar-control-result.png`: Arabic Preview control leaves English text and no RTL document direction. Arabic reference parity is therefore not claimed.
- `r10-delivery-visual/`: final candidate page/overlay captures from 80 passing checks.
- `r10-evidence-final/`: correction dialog captures and focused presentation checks.

Measured desktop contract: title x292/y96, 24px/32px; tables x293/width1114; report table y224; table header 44.5px; report icon32px; contact search38px; contact drawer448px with24px padding and18px title. Tests assert these measured values where composition is equivalent. Light panels are white with slate borders; Dark panels use #0d152f/#172346. Reports retains three real rows. Contact rows expand to retain authorized history/evidence.

## C. Intentional visual exceptions

| Reference element/location | Production treatment | Reason/source | Approval |
| --- | --- | --- | --- |
| Reports custom rows/Create Report and prototype Generate alert | Exactly DAILY/WEEKLY/MONTHLY, real selector/preview/export | FUNCTIONAL_TRUTH; DEC-061/093 and explicit R10 scope | Already explicit |
| Report creation overlay | Its448px visual vocabulary applied to actual report preview and correction; preview body scrolls with export controls in view | FUNCTIONAL_TRUTH and ACCESSIBILITY | No new product decision |
| Customers title/global customer list | Visit Contacts title; explicit Name/Phone/Plate mode and submitted bounded search | SECURITY_PRIVACY; DEC-084 | Already explicit |
| Add Customer, email, ownership-style vehicle presentation | Omitted; visit associations and authorized history only | SECURITY_PRIVACY; DEC-084/091 | Already explicit |
| Single prototype search field | Labeled mode-specific fields, plate country, search button, result-state notice | FUNCTIONAL_TRUTH; strict current API | Already explicit |
| Prototype pagination totals | Loaded count and opaque Previous/Next cursor controls; no invented total | FUNCTIONAL_TRUTH; bounded current API | Already explicit |
| Prototype drawer summary/history | Real scope-safe facts; localized state/date with canonical ID/ISO evidence; CA-only correction controls | SECURITY_PRIVACY and FUNCTIONAL_TRUTH | Already explicit |
| Prototype drawer Done footer | Existing labeled close control/Escape; real history cursor controls retained | ACCESSIBILITY; current focus/authority contracts | No new product decision |
| Reference narrow fixed-sidebar overflow (Reports title x−123; Customers title x272 at480px) | Existing responsive shell retained; keyboard-scrollable local tables and bounded overlays | ACCESSIBILITY; global remediation rules, no unrelated shell edit | Already explicit |
| Inert Arabic Preview control | Real EN/AR, RTL/LTR and bidi isolation tested in candidate | I18N; approved product requirement | Already explicit |
| Locale-neutral PDF | Explicit current PDF language/RTL limitation retained | FUNCTIONAL_TRUTH; server export contract | Already explicit |

## D. Files changed / O. Physical line counts

Manifest below lists every authored source/test change and purpose. Documentation is this evidence file. All authored code/style/test files are at most300 physical lines, formatted without compression. Formatting expanded legacy one-line JSX/CSS; stylesheet extraction is confined to this feature.

| File | Lines | Purpose |
| --- | ---: | --- |
| `apps/dashboard/e2e/md05-closure.spec.ts` | 195 | Open existing R09 timezone disclosure before retained visibility assertion |
| `apps/dashboard/src/features/intelligence/report-preview-dialog.module.css` | 258 | Bounded flex preview body with visible export footer |
| `apps/dashboard/src/features/intelligence/report-preview-dialog.tsx` | 171 | Render localized evidence rows and loading label |
| `apps/dashboard/src/features/intelligence/reports-table.tsx` | 99 | Named keyboard-scrollable report table |
| `apps/dashboard/src/features/visit-contacts/visit-contact-detail-drawer.tsx` | 247 | Feature-local correction/MFA overlay host |
| `apps/dashboard/src/features/visit-contacts/visit-contact-drawer.tsx` | 90 | Use extracted drawer styles; retain focus/authority lifecycle |
| `apps/dashboard/src/features/visit-contacts/visit-contact-results.tsx` | 179 | Readable UTC instants and named keyboard table region |
| `apps/dashboard/src/features/visit-contacts/visit-contact-search.tsx` | 128 | Use extracted responsive search layout |
| `apps/dashboard/src/features/visit-contacts/visit-contacts.module.css` | 295 | Shared contact controls/facts/dialogs; reference typography and Dark contrast |
| `apps/dashboard/src/features/visit-contacts/visit-history.tsx` | 192 | Localized lifecycle state and UTC instant with canonical evidence |
| `apps/dashboard/e2e/md-r10-evidence.spec.ts` | 139 | Exact/null/currency, malformed exports, request budgets and correction presentation |
| `apps/dashboard/e2e/md-r10-visual.spec.ts` | 137 | Measured desktop/narrow EN/AR Light/Dark geometry and screenshots |
| `apps/dashboard/e2e/support/md-r10-fixtures.ts` | 36 | Bounded contact fixture setup for focused R10 checks |
| `apps/dashboard/src/features/intelligence/report-preview-rows.module.css` | 51 | Readable preview facts with Dark theme |
| `apps/dashboard/src/features/intelligence/report-preview-rows.tsx` | 62 | Manager labels, secondary canonical keys, exact/null/duration evidence |
| `apps/dashboard/src/features/intelligence/report-row-label.test.ts` | 31 | Label identity, translation and free-form fallback checks |
| `apps/dashboard/src/features/intelligence/report-row-label.ts` | 94 | EN/AR metric and event labels with safe raw fallback |
| `apps/dashboard/src/features/visit-contacts/visit-contact-drawer.module.css` | 65 | 448px drawer and bounded RTL/LTR content grid |
| `apps/dashboard/src/features/visit-contacts/visit-contact-overlay.module.css` | 26 | 448px Light/Dark correction/MFA panel vocabulary |
| `apps/dashboard/src/features/visit-contacts/visit-contact-search.module.css` | 31 | Responsive explicit search-mode layout |
| `apps/dashboard/src/features/visit-contacts/visit-contact-table.module.css` | 76 | Reference header alignment, 12px typography and local scroll width |
| `apps/dashboard/src/features/visit-contacts/visit-contact-time-format.ts` | 14 | Explicit UTC localized formatter without assumed Location timezone |
| `apps/dashboard/src/features/visit-contacts/visit-contact-time.test.ts` | 12 | UTC boundary and Arabic formatter regression |
| `apps/dashboard/src/features/visit-contacts/visit-contact-time.tsx` | 20 | Human instant plus unchanged ISO secondary evidence |

## E. Reports result

DAILY/WEEKLY/MONTHLY table composition retained. Preview labels are localized; duration display retains exact source seconds; currency totals stay separate, exact strings; null is Unavailable and zero remains zero. Canonical keys are secondary bidi-isolated evidence. Selector validation still rejects impossible/low-year dates, non-Monday weeks and invalid months before dispatch. Company uses one aggregate route; CA/LM active exact Location uses Location routes. No Location fan-out. Advisory subscription false/delay/failure does not block preview. CSV/PDF remain server-generated. No Custom/Create Report, automation or artifact history.

## F. Export safety

Retained browser and API tests cover one click/one POST, disabled double-submit, 401 reconciliation without replay, explicit retry, final auth/entitlement denial, unknown outcome, size limit, stale selector/scope artifact rejection and object URL revocation. New browser cases reject malformed content type and unsafe/mismatched filename without download/replay. Binary unit tests retain validation and body bounds. Real runtime test downloads Company/Location DAILY CSV and PDF, validates filenames/MIME/CSV header/PDF signature and EOF, induces a lost response after server execution and observes one POST/no automatic retry, then denies export after entitlement removal. Mock browser bytes are not represented as real renderer proof.

## G. Visit Contacts result

Name, Phone, Plate; NONE/UNIQUE/AMBIGUOUS; explicit selection; bounded cursor history; Returning Contact and customerless visits retained. Associated vehicles mean associations through visits, not ownership. No CRM, email, bulk export, arbitrary directory, create/delete or merge. Display timestamps use explicit UTC because the DTO supplies an instant without Location timezone; exact ISO remains secondary.

## H. Authority / privacy

CA uses Company/All Locations; LM uses Organization grant set including authorized historical visits. LM is not coerced into Reports' exact-Location scope. CA sees full phone and correction actions; LM sees final-four masking and no corrections. Supervisor/Employee/Guest/direct-route denials are retained. Backend tests exercise current persisted user/membership/Organization/session authority and foreign Organization denial. No new frontend authority or protected storage path was introduced.

## I. Corrections

Existing CA-only Name/Phone commands retained. Exact-session Sensitive MFA remains mandatory. `expectedUpdatedAt` CAS, conflicting concurrent correction, stale conflict, unknown outcome/reconcile, explicit retry/no replay, changed=false no-op and authority-loss eviction are covered by existing browser/backend tests. New narrow Dark EN/AR correction checks verify one modal,448px bounds, readable theme, initial input focus and restoration to correction opener. No mutation implementation changed.

## J. Concurrency

Retained tests cover Report Company→Location→Company, selector A→B, stale export, Contact Organization A→B→A, stale cursor/history and current denial over prior data. Identity/session generation unit tests and browser auth reconciliation retain logout/session replacement fences. Corrections keep bounded draft intent only where the existing same-user scope/session recovery contract allows explicit review; no automatic mutation replay was added.

## K. Accessibility / i18n

Keyboard activation, focus trap, Escape, focus restoration, named dialog/drawer semantics, EN/AR, RTL, bidi codes/phones/IDs/ISO dates verified. Tables expose named keyboard-focusable scroll regions. No document-wide overflow at480px. Drawer facts remain within its padding in both directions. Report footer stays visible while long preview data scrolls. Locale-neutral export statement remains visible. Reference Arabic limitation is recorded in B.

## L. Request budgets

Measured protected business requests (excluding auth/scope/advisory discovery): Company preview1GET per submitted selector; Location preview1GET per submitted selector; export1POST per explicit attempt; Visit Contact search1GET with limit25; history0 before selection and1GET after selection; each cursor action requests one page. Company Location fan-out0. No unbounded contact fetch or eager history preload. Existing max50 search contract preserved.

## M. Privacy / storage

Retained browser storage tests inspect localStorage, sessionStorage, IndexedDB and CacheStorage for protected payload/artifact sentinels. Real runtime test confirms no protected contact/export/object-URL markers and no added databases/cache entries. Object URLs are revoked after bounded download dispatch. Download files are user-requested artifacts; no application artifact persistence was added.

## N. Verification

Final command ledger and outcomes are recorded below after completion. Earlier failures were investigated rather than hidden: initial browser server stopped; unit test imported JSX into the pure-unit harness (formatter extracted); default database credentials differed from .env; one retained Analytics assertion needed to open the existing nested timezone disclosure; API `tsx` startup lacked decorator metadata so runtime used the normal compiled API; test runtime config required the documented push policy and anti-abuse secret. No production config or backend source was changed to recover these checks.

| Gate | Result | Count |
| --- | --- | ---: |
| Dashboard unit | PASS | 517 tests /69 files |
| Focused R10 plus retained MD04/MD05 browser | PASS | 89 (6 new +83 retained) |
| Visual repeat ×5 | PASS | 80 cases (16 ×5) |
| Backend owned harness | PASS | 67 tests /16 files (11+5+51) |
| Real local runtime report/privacy browser | PASS | 1 scenario |
| Root lint | PASS | 11 package tasks |
| Root typecheck | PASS | 11 package tasks |
| Architecture | PASS | existing grandfathered warnings only |
| Normal root build | PASS | 10 package tasks |
| Focused formatter | PASS | 24 authored files |
| git diff --check | PASS | no whitespace errors |

Exact commands (repository root unless noted):

```powershell
pnpm --filter @valet/dashboard test
$env:E2E_BASE_URL='http://localhost:3003'
pnpm --filter @valet/dashboard test:e2e md-r10-evidence.spec.ts md04-visit-contacts.spec.ts md04-accessibility.spec.ts md04-corrections.spec.ts md04-auth-reconciliation.spec.ts md04-scope-races.spec.ts md04-navigation.spec.ts md05-reports-export.spec.ts md05-reports-bidi.spec.ts md05-storage-privacy.spec.ts md05-closure.spec.ts md05-period-endpoint-focus.spec.ts md05-navigation-accessibility.spec.ts --output=C:/Users/LP/.codex/visualizations/2026/09/27/01a0e40a-1703-7113-b279-c7c7bb627f03/r10-retained-verified
pnpm --filter @valet/dashboard test:e2e md-r10-visual.spec.ts --repeat-each=5 --output=C:/Users/LP/.codex/visualizations/2026/09/27/01a0e40a-1703-7113-b279-c7c7bb627f03/r10-delivery-visual
# Working directory: apps/api; environment file loaded without printing credentials
node --env-file='C:/Users/LP/Desktop/valet-app/valet-platform/.env' ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-reports.integration.test.ts test/dashboard-reports-fix.integration.test.ts test/dashboard-reports-api.integration.test.ts test/dashboard-report-commercial.integration.test.ts test/management-company-reports.integration.test.ts test/management-company-report-snapshot-concurrency.integration.test.ts test/management-company-report-finalization.integration.test.ts test/management-company-report-export-http.integration.test.ts test/management-company-report-commercial.integration.test.ts test/management-commercial-location-export-finalization.integration.test.ts test/management-location-export-session-finalization.integration.test.ts test/management-visit-contact-privacy.integration.test.ts test/management-visit-contact-history.integration.test.ts test/management-visit-contact-correction.integration.test.ts test/management-visit-contact-authorization.integration.test.ts test/management-visit-contact-search.integration.test.ts
# Existing runtime scenario; local wrapper supplies test-only process environment
node C:/Users/LP/.codex/visualizations/2026/09/27/01a0e40a-1703-7113-b279-c7c7bb627f03/run-r10-runtime.cjs api
node C:/Users/LP/.codex/visualizations/2026/09/27/01a0e40a-1703-7113-b279-c7c7bb627f03/run-r10-runtime.cjs test
pnpm lint
pnpm typecheck
pnpm architecture:check
pnpm build
node node_modules/prettier/bin/prettier.cjs --check apps/dashboard/e2e/md05-closure.spec.ts apps/dashboard/src/features/intelligence/report-preview-dialog.module.css apps/dashboard/src/features/intelligence/report-preview-dialog.tsx apps/dashboard/src/features/intelligence/reports-table.tsx apps/dashboard/src/features/visit-contacts/visit-contact-detail-drawer.tsx apps/dashboard/src/features/visit-contacts/visit-contact-drawer.tsx apps/dashboard/src/features/visit-contacts/visit-contact-results.tsx apps/dashboard/src/features/visit-contacts/visit-contact-search.tsx apps/dashboard/src/features/visit-contacts/visit-contacts.module.css apps/dashboard/src/features/visit-contacts/visit-history.tsx apps/dashboard/e2e/md-r10-evidence.spec.ts apps/dashboard/e2e/md-r10-visual.spec.ts apps/dashboard/e2e/support/md-r10-fixtures.ts apps/dashboard/src/features/intelligence/report-preview-rows.module.css apps/dashboard/src/features/intelligence/report-preview-rows.tsx apps/dashboard/src/features/intelligence/report-row-label.test.ts apps/dashboard/src/features/intelligence/report-row-label.ts apps/dashboard/src/features/visit-contacts/visit-contact-drawer.module.css apps/dashboard/src/features/visit-contacts/visit-contact-overlay.module.css apps/dashboard/src/features/visit-contacts/visit-contact-search.module.css apps/dashboard/src/features/visit-contacts/visit-contact-table.module.css apps/dashboard/src/features/visit-contacts/visit-contact-time-format.ts apps/dashboard/src/features/visit-contacts/visit-contact-time.test.ts apps/dashboard/src/features/visit-contacts/visit-contact-time.tsx
git diff --check
```

The backend harness used its owned temporary databases/roles and reported cleanup. No existing migration was edited. Normal build is the repository verification command, not production deployment. CI is NOT RUN: the existing workflow triggers PRs to main or pushes to main, and this task forbids a PR/merge.


## P. Backend / contract / schema / dependency boundary

Backend changed? NO. Shared/public contracts changed? NO. Schema changed? NO. Migration added? NO. Dependencies changed? NO. Production configuration changed? NO. Runtime scenario uses the existing named local test fixture and test-only process environment; no tracked environment file changed.

## Q. Scope review

R11, R12 and #230 untouched. R01–R09 production behavior untouched; the retained MD05 closure assertion now opens R09's existing timezone disclosure before asserting visible evidence. No unrelated refactor. Existing report projection/API/state hooks, export client and correction commands remain unchanged. VAYLET code-review matrix applied to the actual diff: no new data writes, permission decisions, backend formulas or persistent state; styles/components remain feature-local.

## R. Git

Requested normal branch, based on exact verified main. Commit message: `fix(dashboard): restore reports and visit contacts reference parity`. Final commit SHA, pushed branch and clean status are reported in the delivery response. No PR/merge/worktree.

## S. External limitations

Source/static checks, fixture browser checks, live reference observations and real local API/PostgreSQL evidence are separate above. Browser fixture tests cover the full scope/kind/format matrix; real browser runtime samples DAILY Company/Location CSV/PDF. Backend integration tests provide real server report/authority/concurrency coverage. CI and production deployment have not been run and are not claimed. Reference3011 offers no functioning Arabic presentation and its Generate action is an alert, not a renderer.

## T. Verdict

All required local gates passed. The implementation is ready for independent review. Final commit, push and clean-status evidence are reported in the delivery response. No independent review, CI run, production deployment or merge is claimed by this implementation report.
