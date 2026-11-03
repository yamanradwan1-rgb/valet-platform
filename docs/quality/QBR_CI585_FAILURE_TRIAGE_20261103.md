# QBR — CI #585 source-backed failure triage (2026-11-03)

## Provenance and scope
- Draft PR #413, trigger commit `86cbf59eef16b5fdc25d902bd10fb93c9503600d`.
- GitHub Actions run `41666519563`: https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/41666519563
- The four categories below are diagnosed from the failing job logs on this **older** PR SHA. They are **not** evidence that a later local patch has passed remote CI.
- At first review, `postgres-api-race` and `postgres-api-standard` had not completed; their eventual conclusions must be recorded separately, not guessed.

## Diagnosed old-SHA failures and bounded follow-ups

| CI job | Observed log failure | Narrow test-only remedy | Evidence and remaining gate |
| --- | --- | --- | --- |
| unit / Valet Native | `native-appearance-render-matrix.test.ts` EN+AR: frozen release visual says Identity verified but source renders Release blocked | Supply a coherent synthetic `HANDOFF_PENDING` session, `pendingAt`, VERIFIED method and `verifiedAt` in the *positive fixture*. Do not remove `NativeReleasePanel` proof guard or relax baseline equality | Local integration Native appearance, release panel, negative verification **43/43 PASS**. Native baseline compilation had cold >5s on Windows; scoped 15s test-only timeout retains exact EN/AR visual comparison. Remote CI not yet run on this fix |
| unit / API Node | `issue333-u002-http-cancellation.test.mjs`: 12s wait for `finish` writing 24 MiB to paused client | Bound the **post-finish ordering** example to a 4 KiB response; huge paused TCP writes are subject to kernel backpressure, so `finish` is not guaranteed before reader resumes. Keep separate early-disconnect, partial-prefix and closeAllConnections tests unchanged | Local 4/4 PASS, five repeats. Independent source reviewer CLEAN. No change to product HTTP handling |
| postgres-api-compound | Shifted Supervisor Tasks GET expected 404, actual 200; historical CANCELLED Task assignee expected null, actual granted identity | Align outdated assertions to approved narrow #352 Supervisor Tasks exception and established #299 Tasks-history projection, **adding** unshifted Tasks denied and unrelated overview sessions denied HTTP negatives | Independent security source review CLEAN. Local API lint/typecheck and #299 SQL projection unit 3/3 PASS. Real PostgreSQL integration and final DEC-107 compatibility proof still required |
| employee-e2e | R11 Studio: expected literal `Overridden` but UI renders `Location override`, after PUT returned 200 | Test actual `.ps-source`/effective displayed value transitions and server-saved overridden input value, then restore inherited value via Clear Override. No Dashboard source/UI change | Scoped Prettier, Playwright discovery (2 tests) and Dashboard typecheck PASS. Actual browser E2E execution still required |

## Immutable safeguards and no false green
- No product source or deployment change in these bounded tests. No deletion or skipping of a required test, no suppression of a failed CI job, no changes to PostgreSQL role/SQL history, custody, handoff or authorization code.
- Owner-approved Supervisor exception does not imply broader `LOCATION_DASHBOARD_READ` or reporting access; DEC-107 engineering status remains **Proposed**. Exact positive/negative PostgreSQL suites and PR CI are required before merge readiness.
- Repeated local unit results do not prove the result on GitHub Ubuntu/Postgres service and do not establish reduced CI wall-clock or p95. `pnpm` store caching remains an unmeasured CI experiment.
- This report must be updated with the **actual final CI #585 outcomes**, and the next pushed SHA and run results must be inspected separately.

## CI #585 completed and later local validation
- Final #585 result for the older SHA `86cbf59e`: **7 direct runner jobs passed**, **3 failed** (`unit`, `postgres-api-compound`, `employee-e2e`), plus derivative `quality` failure. `postgres-api-standard`, `postgres-api-race`, `postgres-database`, `postgres-issue215`, `static-build` and both platform jobs all passed.
- Follow-up local test-only changes also repair: a stale DispatchModule controller inventory assertion after the approved emergency takeover controller; a `fileURLToPath` Windows Guest branding audit path; a native Shift visual comparison that computes 144 full before/after tree pairs; and Issue #336 CLI cold dynamic-import per-case timeout. **No production code or required CI job was altered.**
- Native appearance and Shift freeze tests retain exact baseline comparisons and have narrow, explicit cold-computation test deadlines rather than global timeouts.
- The Issue #300 versioned proof test now separates symlink and hardlink checks. On Windows only, a real file-symlink creation error `EPERM` produces a visible single-test skip instead of suppressing the separate hardlink and digest checks. Linux/GitHub CI must still exercise actual symlink rejection. Existing S3 opt-in tests remain skipped without a real approved S3 target.
- After these changes, `pnpm test:non-postgres` on the combined clean candidate completed **exit 0**: root pure Turbo **9/9 packages PASS**, including Native **1879/1879**, Dashboard **1183/1183**, Customer **553/553**, Employee Client **928/928**, Valet Web **676 passed + 1 pre-existing skip**; API non-Postgres **1439 passed / 7 skipped** (one Windows symlink privilege gate, six opt-in S3); Database non-Postgres **65/65 PASS**.
- `pnpm architecture:check` PASS with pre-existing grandfathered warning lines. Scoped API, Dashboard, Customer, Valet Web and Valet Native Typechecks PASS; API, Dashboard and Valet Native Lint PASS. Test Harness **45/45 PASS** from earlier integration checkpoint. No local disposable PostgreSQL or real Playwright browser execution was possible.
- Native Shift visual freeze test regenerates a tracked validation JSON on execution; its incidental local generated diff was inspected and restored, not committed.
- **Remote CI on the next final SHA remains required.** The above is source/local evidence, not a declaration of PR mergeability or measurable CI cost reduction.
