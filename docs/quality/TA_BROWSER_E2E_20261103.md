# VAYLET Browser E2E reliability and cost audit — 2026-11-03

**Status:** Source-level audit and candidate triage; no approved deletion or
required-gate change. **Pinned source:** `f9ecebd9af85b44580771b4027515d06c0a31de4`, exclusive
`cos/test-audit-e2e-20261103` worktree. This report covers Dashboard conventional
mock/browser Playwright, Dashboard PostgreSQL/API runtime Playwright and Employee
Playwright. The companion `TA_BROWSER_E2E_SPEC_LEDGER_20261103.csv` inventories
**every tracked spec file** with its location, static `test(` declaration lines,
first available title, discovery exception, and file-level source signals. Its
`provisional_risk` is a filename heuristic; `contract_proof=NOT_ASSESSED_PER_CASE`
and `redundancy_verdict=NOT_PROVEN` explicitly disallow interpreting the ledger
as an exhaustive independent manual proof of every test case.

## Actual CI ownership and count reconciliation

| Suite | Tracked files | Source-level `test(` sites | Reported Playwright/CI observation | Required CI invocation |
| --- | ---: | ---: | --- | --- |
| Dashboard conventional `apps/dashboard/e2e` | **270** = 266 `.spec.ts` + 4 `.spec.mjs` | 780 | Owner supplied: **268 collected specs / 1,290 tests** after contracts build; 2 environment-gated exclusions | **Not invoked** by `.github/workflows/ci.yml` |
| Dashboard runtime `apps/dashboard/e2e-runtime` | **13** | 26 (including the one dynamic Issue300 wrapper) | Owner supplied: **59 discovered**, **34 protected skips**, **25 executed** in CI #586 | `employee-e2e`: `pnpm --filter @valet/dashboard test:e2e:runtime` |
| Employee `apps/valet/e2e` | **13** | 42 | Owner supplied: **44 executed** in CI #586; loop-generated tests exceed static call sites | `employee-e2e`: `pnpm --filter @valet/valet test:e2e` |

File counts were independently checked against tracked Git paths in this pinned
worktree. The Playwright-expanded case counts and CI #586 execution counts are
**reported historical observations, not reproduced on this docs worktree**.
Static sites differ from runtime case counts because tests are registered in
loops/wrappers. The exact `--list` output should remain attached to the run SHA
for any deletion or runtime-cost calculation.

The binding workflow makes the distinction precise:
`.github/workflows/ci.yml:233-385` creates a disposable PostgreSQL service,
migrates, provisions a limited runtime role, provisions Employee E2E fixtures,
builds/starts the API, runs Employee Playwright, provisions Management Dashboard
E2E fixtures and then runs **Dashboard runtime** Playwright, all in the
`employee-e2e` job. This required job is covered by `quality` at `:389-418`.
Dashboard `package.json:11-13` exposes three *different* commands:
`test` (Vitest), `test:e2e` (conventional Playwright) and `test:e2e:runtime`.
`apps/dashboard/playwright.config.ts:4-25` sets `testDir=./e2e`, `workers=1`
and 60-second timeout, with conditional ignores for
`issue306-matched-baseline.spec.ts` and
`issue314-independent-acceptance.spec.ts` unless their explicit variants are
present. `apps/dashboard/playwright.runtime.config.ts:4-13` instead targets
`./e2e-runtime`, uses one worker, 90-second timeout and **zero retries**.
`apps/valet/playwright.config.ts:4-20` targets `./e2e`, one worker, 60-second
timeout and **one retry**; individual Employee tests may set an explicit
90/120-second budget. No relevant workflow invokes conventional Dashboard
`test:e2e`; discovering or locally running these cases does not make them a
required CI security gate. Four `.spec.mjs` Issue354 files contain six static
tests (`issue-354-*.spec.mjs:29-101`): their inclusion in future Playwright
`--list` output should be checked by **actual test IDs**, not inferred solely
from extension or the headline 268 figure.

## The distinct evidence layers

1. **Mock Dashboard browser behavior:**
   `apps/dashboard/e2e/support/dashboard-api-fixture.ts:68-81` intercepts all
   `/v1/staff/**` requests with `page.route` and fulfills synthetic replies.
   The fallback at `:170-175` responds with **404 `AUTHORIZATION_DENIED`** for
   any unhandled path. Such a 404 is *not* proof of a real API tenant, role,
   membership or entitlement guard: a wrong/missing route can also elicit it.
   `md05-analytics.spec.ts:85-124` is valuable proof that the UI hides denied
   content and makes no Analytics reads, but its authority is fixture-provided.
   `issue352-supervisor-takeover.spec.ts:66-144` checks exact submitted command
   fields and UI behavior, while its operation receipt comes from an intercepted
   callback (`:71-88`). `issue278-help-lifecycle.spec.ts:23-70` tests actual
   browser focus/unmount behavior; the fabricated API context is orthogonal.
2. **Dashboard real runtime/browser + disposable DB:** The wrapper at
   `apps/dashboard/e2e-runtime/support/runtime-test.ts:5-10` provisions a fresh
   Management fixture **before each test** via
   `runtime-fixture.ts:142-163`, while `controlFixture` at `:116-140` changes
   test-only persisted state through explicit scripts. For example,
   `auth-principals.spec.ts:37-71` makes actual authenticated browser-side
   fetches and checks 404 for an ungranted Location, foreign tenant and
   all-Location analytics. `operational-separation.spec.ts:51-94` checks a
   denied physical key mutation **and unchanged DB snapshot**, then positive
   Employee/Guest operations despite lost Management entitlement. Unlike pure
   mock tests, these can prove integration with real server policy on the
   disposable fixture, conditional on the observed run.
3. **Real server response delayed in browser:**
   `e2e-runtime/support/delayed-real-response.ts:30-45` forwards with
   `route.fetch()`, waits for an explicit release, then fulfills the **actual
   response** or simulates transport failure. `scope-races.spec.ts:21-130`,
   `cross-feature-races.spec.ts:24-88` and `report-generation-race.spec.ts:10-49`
   exercise real backend effects plus browser generation fences; the synthetic
   delay is timing control, not a synthetic authorization outcome.
4. **Employee browser cases are mixed:**
   `apps/valet/e2e/employee-lifecycle.spec.ts:26-77` drives real UI and API
   from Check-In through verified pickup-code release; `employee-incident.spec.ts:9-69`
   checks an online incident, offline denial and actual returned reference;
   `employee-recovery.spec.ts:32-105` uses real shift state and `route.fetch`
   for a delayed intake. In contrast, `employee-app-logout.spec.ts:20-61`,
   `staff-logout-restoration.spec.ts:10-74`, `issue358-scope-transition.spec.ts`
   and `issue390-parking-stale.spec.ts` mount isolated test harnesses with
   mocked auth/context responses. Those are substantive browser lifecycle
   regressions but do **not** establish backend denial, persisted identity or
   production cookie semantics by themselves. The 44 Employee cases must not
   all be described as DB-backed end-to-end authorization proofs.

## Critical preserve/repair contracts and decisions

| Priority / recommendation | Source evidence and unique invariant | Required negative proof / cost or false-green risk |
| --- | --- | --- |
| **P0 KEEP Issue300 protective skip** | `e2e-runtime/issue300-closure.spec.ts:12-36,63-74` requires a separately approved, SHA-bound, owned single-case MFA/browser lease; `issue300-browser-safety.ts:117-177` checks exact HttpOnly Secure SameSite Strict refresh-cookie properties and consumes a normalized one-use digest via exclusive creation. This deliberately prevents replaying a rotated cookie in 34 contexts. | **Never delete, relax, bypass, change to nonblocking or reinterpret as a flaky skip.** 34 unavailable-case skips protect credential correctness. A future authorized real-browser run needs a new owner-attested one-time session per case, exact SHA and single-case selection, and results recorded without token/trace disclosure. `test.use({trace:'off', screenshot:'off', video:'off'})` at `issue300-closure.spec.ts:36` is intentional privacy hardening. No ordinary fixture may reset or simulate this authority. |
| **P1 KEEP real authz / privacy negatives** | `e2e-runtime/auth-principals.spec.ts:20-125` enforces Guest/disabled/LM/ungranted/foreign/Supervisor/Employee boundaries; `authority-loss.spec.ts:12-99` clears stale screens on entitlement, membership, grant and role loss; `operational-separation.spec.ts:51-94` proves non-authoritative Management cannot alter custody and Management entitlement cannot block operational Guest/Employee. | Match each visible denial with real HTTP status and unchanged server row or no network write where the operation could mutate; compare API integration e.g. `apps/api/test/management-company-analytics-authorization.integration.test.ts`, `issue352-takeover-authority.integration.test.ts`. Do not replace with mock-only 404 or hidden-nav proof. Scope/permission failure is a release-critical risk. |
| **P1 KEEP distinct real MFA and session controls** | `e2e-runtime/auth-principals.spec.ts:127-218` proves factor issuance/recovery, safe disclosure, revocation/restore; `issue234-security.spec.ts:13-105` confirms scoped-free Security and **sensitive freshness** independent of `ASSURED`, with 403, MFA step-up and explicit retry (no automatic write replay); `two-tab-concurrency.spec.ts:19-35` checks session-specific assurance. | Keep traces/screenshots/video **off** on sensitive real MFA suites (`auth-principals.spec.ts:13-18`, `issue234-security.spec.ts:11`) and clear ephemeral DOM. Distinguish these from mocked `apps/dashboard/e2e/md-r11-security.spec.ts:5-52`, which can prove AR/UI storage handling but fabricates MFA state and recovery values. No credential bytes in CI artifacts. |
| **P1 KEEP / REWRITE runtime settlement waits** | `e2e-runtime/scope-races.spec.ts:48-50,66-69,99-101,116-119`, `cross-feature-races.spec.ts:49-57,80-87`, `session-generation.spec.ts:34-38`, `report-generation-race.spec.ts:43-48` and `reports-privacy.spec.ts:103-117` use **150/250 ms fixed waits** after releasing a real response or aborting one. | A negative immediate `toHaveCount(0)` can pass before the stale async callback ever executes. Rewrite to wait for the specifically intercepted request's browser settlement, relevant current-generation UI/epoch or explicit work-completed signal, and observe a bounded post-settlement no-regression interval. Preserve stale A→B→A, export-after-logout, no-false-download and no-old-PII negatives; do **not** simply remove the waits or increase timeouts. The file-level inventory flagged 52 conventional Dashboard specs with fixed waits, requiring individual review before any broad rewrite. |
| **P1 REWRITE one real R11 selector proof** | `e2e-runtime/md-r11-administration.spec.ts:22-70` confirms Company PUT 200 and Location PUT 200 but checks changed `.ps-source` and `.ps-setting-value strong` with only `not.toHaveText(previous)`. It does not independently assert that the Location override is the intended value, survives refetch/reload, and clears back to the **actual persisted Company default**; transient placeholder or a wrong nonempty string could satisfy an inequality. | Keep the current write-response guard, then assert exact typed `tipsEnabled` effective value and `overridePresent` from the real GET/row after refresh (or equivalent real server projection), and that CLEAR is independently observed as committed before equality restoration. Negative cases: stale revision 409, wrong Location, canceled/delayed write, false-vs-null inheritance. `e2e-runtime/two-tab-concurrency.spec.ts:37-149` separately proves real CAS conflict + deliberate retry; `apps/api/test/management-settings-concurrency.integration.test.ts` is backend coverage, **not** a substitute for browser state correctness. `md-r11-administration.spec.ts:75-81` still contains translation-coupled `Inherited`/`Overridden` assertions for Branding; preserve the semantic state transition. |
| **P1 KEEP analytics/report exact-scope contracts** | Mock `apps/dashboard/e2e/md05-analytics.spec.ts:43-124` counts endpoint families and hides analytics on denied role; `md05-storage-privacy.spec.ts:43-112,115-160` probes browser stores with sentinel. Real `e2e-runtime/request-bounds.spec.ts:9-72` expects **two** Company analytics reads (navigation + Apply) and **zero** Location fan-out; `reports-privacy.spec.ts:32-62,64-146` checks actual CSV/PDF bytes/content type, unknown lost response, entitlement and no persistent Guest/financial contact data; `report-generation-race.spec.ts:10-49` prevents post-logout export publication. | Preserve request counts, no automatic export retry, exact currency, null vs zero, timezone and non-disclosure per Accepted DEC-092/095. `request-bounds.spec.ts:54-70` also requires wall-clock `Date.now()-startedAt < 2,000 ms`; noisy CI load can fail while scope/request invariants hold. Measure actual distributions before changing any latency gate, and never replace the strict two/zero request assertions with permissive bounds. Real backend recomputation requires PostgreSQL formula/source tests. |
| **P1 KEEP Employee physical lifecycle / offline authority** | `apps/valet/e2e/employee-lifecycle.spec.ts:26-77` drives real vehicle creation, parking, retrieval, code and final release; `employee-arabic-offline.spec.ts:7-108` proves AR/RTL, no offline completion and reconnection; `employee-recovery.spec.ts:37-105` checks no double intake, disabled offline Confirm Parked, real shift-loss denial. | DEC-063 `ONLINE_ONLY` for pickup proof/release; DEC-068 post-check-in key binding. Preserve real API receipt and terminal completed evidence. A visual “Handoff Complete” alone is weaker than server-canonical custody/audit and is not a reason to delete those API integration guards. `apps/valet/playwright.config.ts:7` allows one retry: capture first-attempt failure and persistent side effects before describing a passed retry as stable. Avoid changing retry policy in this docs task. |
| **P1 KEEP Employee stale-scope/shift negatives, mark synthetic** | `apps/valet/e2e/issue358-scope-transition.spec.ts:40-281`, `issue358-endshift-transition.spec.ts:38-116`, `issue390-parking-stale.spec.ts:204-285`, `issue398-start-shift-stale-location.spec.ts:59-158` preserve A→B/none, delayed accept/end-shift, parking drafts and location selection; real `employee-recovery.spec.ts:92-105` complements them with server shift loss. | The isolated harnesses model scoped authority inputs and race order; they do not prove that backend acceptance/command rejection really follows a tenant switch. Retain individual named negatives across START/END Shift, task accept and parking. A common fixture helper may be extracted if exact request trace and stale-response outcome remain verified for each command. |
| **P1 KEEP takeover/operations separation** | `apps/dashboard/e2e/issue352-supervisor-takeover.spec.ts:66-185` models a narrow supervisor Tasks read and one versioned, reasoned takeover; `apps/api/test/issue352-takeover-authority.integration.test.ts` and `issue352-takeover-races.integration.test.ts` are real authority/race proof candidates. | Do not equate fixture-produced 404, absence of nav or fixture-produced success receipt with persisted server takeover authority. Test a real active Shift + exact Location and deny inactive/wrong Location/role/Task state; prove no cross-tenant actor identity and only one winner. Preserve separate Task/ValetSession/Key custody authority. Proposed DEC-107 must not silently authorize broad Dashboard rights. |
| **P2 KEEP UI a11y/localization geometry** | Conventional `issue278-help-lifecycle.spec.ts:23-121` verifies modal focus, route unmount, no mutations, keyboard and nested help; `issue314-independent-acceptance.spec.ts:9-18,106-167` requires pinned isolated before/after and **actual Chrome native zoom** separate from CSS zoom; `apps/valet/e2e/viewport-zoom.spec.ts` and `employee-arabic-offline.spec.ts:13-20` check Employee zoom and RTL. | Keep real browser geometry/keyboard proof but classify screenshot/fixture comparisons as visual acceptance, not server security. Preserve environment guards for pinned baseline snapshots; do not invoke historical before/after specs against an unpinned runtime URL. CSS zoom alone is not native 200% browser zoom. |
| **P2 REWRITE mock-fixture negative confidence** | `apps/dashboard/e2e/support/dashboard-api-fixture.ts:135-175` fabricates route context and default 404. Conventional `md05-analytics.spec.ts:102-124`, `issue352-supervisor-takeover.spec.ts:146-185` can rightly assert zero attempted privileged reads, but 404 from a forgotten handler can make an untested API access look forbidden. | For tests that claim *server authorization*, require an explicit expected handler and assert it was reached with the right scope/role before simulating denial; pair with actual runtime/PG 403/404 and unchanged DB. For purely UI-negative tests keep `fixture.count(protectedPath)===0` and separate “no protected content rendered” assertions. Fail on unexpected known endpoint instead of relying on blanket 404 in proposed future isolated fixture instrumentation; do not change production or existing assertion semantics without negative fixtures. |
| **P2 REWRITE selector/timer coupling selectively** | Conventional `issue278-help-lifecycle.spec.ts:99,144` uses `waitForLoadState('networkidle')`; `task01-mfa-session-fencing.spec.ts:108-113` waits network idle then 300 ms to detect read amplification; `issue-354-focus.spec.mjs:59-93` uses fixed wait with count fence; runtime `request-bounds.spec.ts:41-68` already uses real response and eventual card visibility. | Substitute explicit owned request completion + stable accessibility state and strict request count with a separate bounded observation window for “must never happen” cases. Avoid `.nth(1)` and `.first()` if the referent is a unique semantic owner, except when index is the behavior under test (e.g., table ordering/first page). A positional selector is not inherently wrong. Benchmark cold/warm runs before claiming speedup. |
| **P3 MERGE candidate: Help/visual harness setup only** | The ledger groups 20 `issue278*` specs, 7 `issue280*` specs and two pinned historical issue314/306 specs. Several recreate fixture/bootstrap and viewport setup. | Extract *shared setup* if it reduces runtime and keeps test isolation; retain unique keyboard Escape, focus return, dirty form, RTL, nested dialogs, actual native zoom, denied route, no network mutation and historical screenshot contracts. No case-level removal proof, and conventional Dashboard tests are not current required CI runtime cost. |
| **P3 MERGE candidate: race harness setup only** | `task01*`, `task02*`, `md-r08*`, `md05*` mock families and real `e2e-runtime/scope-races.spec.ts`/`cross-feature-races.spec.ts` have recurring deferred-response/fence setup. | Keep distinct deny-before-request, 409, UNKNOWN, no replay, same-scope continuity, cross-tenant and post-logout export consequences. Mock and real suites have **non-interchangeable evidence**; sharing a clock/response helper is plausible, deleting a case based on similar titles is not. |
| **REMOVE candidate: NONE** | No current E2E case has a demonstrated equivalent tested invariant, same CI execution status and same security source after deletion. | Owner approval + exact old-case→replacement case mapping, mutation/negative replay proof and CI run on the pinned SHA are prerequisites. No test deletion, skip, timeout or gate change recommended from this source audit. |

## Fixture poisoning and false green controls

The required Dashboard runtime projects run sequentially (`workers:1`) and
`runtime-test.ts:5-10` resets the Management fixture before each case, limiting
cross-case DB contamination. However, `controlFixture` is an explicit database
mutation; a failed or interrupted test must not be assumed to have restored
the baseline until the next successful reset. A retry, if introduced later,
must not reuse a successful protected mutation or an MFA credential as a new
authority source. **Issue300 deliberately imports the base Playwright `test`
instead of the auto-reset fixture** and must remain isolated from that reset
and from token-replay semantics. The 34 protected skips are *expected safety
outcomes* for ordinary CI, not failed tests awaiting deletion.

For Employee E2E, the workflow provisions one disposable database at the start
and executes 13 spec files with `workers:1` and one permitted Playwright retry.
The real Employee recovery suite explicitly restores shared Shift state in
`employee-recovery.spec.ts:32-35` even after failure; other real lifecycle
cases may leave their own completed/active test visits behind. Avoid using a
later test's success as proof that earlier state did not contaminate it.
Review real operation IDs, duplicate writes and leftover sessions on **first
attempt and retry** before claiming deterministic idempotency. Synthetic
Employee browser fixture tests have a separate isolation concern: mocked
`Set-Cookie` and local fixture state are deliberately not production HttpOnly
auth persistence, so should be labeled as UI lifecycle only.

The conventional mock Dashboard group is **not all homogeneous**: 236 of 270
spec files contain a syntactic mock-fixture signal; the remainder include
browser visual, synthetic harness, local map SDK, cross-window or explicit
environment-attested comparisons. That 236 is a text search, not a count of
server-mocked *cases*. An unhandled endpoint's default 404 and a mocked
successful write may pass regardless of production policy. When qualifying a
negative test, record the exact response source (mock fixture, real server,
real server response delayed, or local synthetic fixture), observed actor and
scope, HTTP status, write count, persisted side effect and post-error screen
state. Avoid the blanket designation “real E2E” solely because Playwright ran.

## Safe acceptance path for follow-up work

1. Record `playwright --list` by **exact candidate SHA** for all three projects,
   including six Issue354 `.spec.mjs` names and 34 protected Issue300 case names.
   Preserve dynamic/loop expansion and reported 1,290/59/44 counts as separate
   historical evidence until the list output is reproduced. Confirm whether
   Issue306/314 are intentionally absent in the default conventional project.
2. For each `REWRITE` candidate, write a negative mutation (misrouted request,
   late fulfilled response, stale 200, wrong tenant, rejected 403/409/503,
   blocked persistence) that fails before the rewrite and after a deliberately
   broken candidate. Retain the exact protected behavior and no-replay guards.
3. Benchmark only the affected lane on a disposable approved environment with
   cold/warm timings and flake distribution. Keep initial failure logs for
   Employee retries and avoid general retries/timeouts or required-gate changes
   as a shortcut. If conventional Dashboard mock E2E is proposed for CI,
   separately budget runner time and select unique smoke contracts while
   preserving their full manual/release verification ownership.
4. Secure independent reviewer signoff and owner approval for any eventual
   test removal, gate change or policy shift. The current deliverables make
   no such edits.

**Verification limits:** This worktree had no installed `node_modules`; no
Playwright, PostgreSQL runtime, browser, timing benchmark, re-discovery or CI
execution was performed. Counts sourced from tracked files/static parser were
verified locally; expanded/test-run figures above are owner-supplied CI #586/
discovery observations. Read-only source audit included workflow, configs,
fixture machinery, protected Issue300 and selected security/custody/analytics/
privacy/visual test families. Every file is inventoried; the individual
semantics of all 1,290 conventional browser cases have **not** been manually
verified. No code, UI, tests, historical artifacts, skip guards, secrets,
required CI gates or production data were changed.
