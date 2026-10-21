# Issue #306 — original Incident reporter, frozen Details UI

Source baseline: `origin/main` `c883883df721449b5ca8025ab5cad94cfe5f0ff4` (2026-10-21). Implementation branch: `feat/issue-306-incident-original-reporter`.

## Reporter provenance and scope

- Existing Incident creation stores `reported_by_membership_id` from the authorized reporting actor. The FK targets canonical `organization_memberships` for the same Organization.
- The existing manager-authorized, exact Organization + Location Incident read now LEFT JOINs the canonical membership in the same bounded LIMIT+1 query. It exposes **only** nullable `reporterDisplayName` (bounded first/last name, complete pair required), with no membership ID/email included in the Incident DTO. Current assignee, resolving employee and shift state cannot change reporter attribution.
- Inactive/disabled reporter and revoked reporter Location grant retain their stored canonical name. Missing/incomplete name yields the localized **Reporter unavailable / المبلّغ غير متاح** fallback. No inferred historical attribution, migrations, mutations, staff directory endpoint or expanded grants.
- Only one existing-style `Fact` was inserted after Location in Incidents Details. No CSS, drawer chrome, table, actions, or route layout was changed.

## Test evidence

| Gate | Result |
| --- | --- |
| Disposable PostgreSQL: reporter source, inactive/revoked reporter, unavailable name, exact Organization/Location/role and manager grant denial, strict DTO, cursor | **13/13 PASS** across 3 integration files; cleanup reported 0 leftover databases/roles/children |
| Incident presentation existing localization/poison-key tests plus EN/AR reporter fallback | **25/25 PASS** |
| API, Dashboard and Contracts TypeScript checks; API/Dashboard ESLint; architecture check; `git diff --check` | **PASS** |
| Mounted browser on this branch's isolated `localhost:3316`: actual Details row, null fallback, light/dark, EN/AR, widths 320/390/768/1440 | **6/6 PASS** |
| Mounted browser: original reporter A at Location A, Escape, select Location B, reporter B only and A absent | **1/1 PASS** |
| Mounted browser: CSS `zoom: 2` (200%) at 320 AR and 1440 EN, long name, no *additional document scrollWidth* on drawer open, Escape | **2/2 automated assertions PASS; 320 AR screenshot visual NO-GO**: inherited drawer fields are clipped at the effective 160-CSS-pixel content width |
| Existing canonical POST staff-incident-reporting integration suite | Retry **3/4 PASS; 1 TIMEOUT** at default 5,000 ms in the original report/dedupe test. Initial run's setup hook timed out at 120,000 ms before assertions. No command code modified; **not a full PASS**. Both disposable runs cleaned up. |

Run the focused DB tests with `pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/dashboard-incident-reporter.integration.test.ts test/dashboard-overview-domains.integration.test.ts test/dashboard-overview-authz.integration.test.ts` against disposable PostgreSQL.

The mounted browser proof used `$env:E2E_BASE_URL='http://localhost:3316'; pnpm --filter @valet/dashboard exec playwright test e2e/md-r08-presentation.spec.ts e2e/issue306-incident-reporter.spec.ts --grep '#306' --workers=1` in Windows PowerShell, with an isolated #306 Next development server on port 3316. Port 3003 was occupied by the unrelated #305 worker; tests on that port were rejected as invalid payload by its older contract. The final run on 3316 was **9/9 automated assertions PASS**, subject to the separate CSS zoom visual finding.

## Screenshots and limits

`after/` contains 16 real Playwright captures from the passing final test run: six EN/AR/theme/viewport cases with reporter name and null fallback (12 images), two 200% CSS-zoom long-name cases, and the two Location A/B screenshots. The fixture names and incidents are synthetic; no real customer or employee data was used. Their test names, responsive conditions and exact test actions are in `apps/dashboard/e2e/md-r08-presentation.spec.ts` and `apps/dashboard/e2e/issue306-incident-reporter.spec.ts`.

**BEFORE screenshot: NOT RUN.** No same-condition image of the original unmodified `origin/main` drawer was captured. Frozen-design comparison is grounded in the narrow source diff (one `Fact`, translated strings, no CSS changes), and independent code reviewers, not a claimed pixel-diff screenshot. **Native browser 200% zoom: NOT RUN**; the two zoom tests explicitly use CSS `zoom: 2`. The 320px AR CSS zoom screenshot visibly clips **pre-existing** Type/Description fields as well as the long-name area at effective 160 CSS pixels, despite unchanged body scroll width. Existing shared Fact CSS already has `overflow-wrap: anywhere`; applying it redundantly to the new bdi cannot fix the inherited drawer-width issue. Therefore the extreme 320px+200% visual gate is **NOT ACCEPTED**, pending a separately authorized layout correction. Normal 320px and 390px content tests passed. **Concurrent mid-transaction role/grant-revocation race: NOT RUN**; this Incident reader retains existing Dashboard authorization semantics. Committed revocation before a new read was tested and denied. The new A→B browser test exercises the scope change and identity clearance; it does not inject a delayed stale HTTP response.
