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
