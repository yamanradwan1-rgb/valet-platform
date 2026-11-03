# CIQ-08 — CI critical-path cost baseline and experiment plan
Date: 2026-11-03. Source: .github/workflows/ci.yml and GitHub Actions run 41342122691 on commit 0a1d7420. Current pinned source is a5a46de; the intervening native logo commit carries [skip ci], so the run is historic, not current-SHA CI proof.

## Job durations observed in one run
| CI job | Observed wall-clock | Conclusion |
| --- | ---: | --- |
| postgres-api-race | 20.9 minutes | FAIL (one tracking assertion) |
| postgres-api-standard | 20.6 minutes | PASS |
| postgres-api-compound | 4.6 minutes | FAIL (two assertions) |
| postgres-database | 3.7 minutes | FAIL (manifest 103 vs 106) |
| employee-e2e | 3.4 minutes | FAIL (two dashboard tests) |
| static-build | 2.6 minutes | PASS |
| postgres-issue215 | 2.1 minutes | PASS |
| platform-windows-latest | 1.4 minutes | PASS |
| platform-ubuntu-latest | 0.5 minutes | PASS |
| unit | 0.4 minutes | FAIL (test discovery count), later non-Postgres tests did NOT execute |
| quality | 0.1 minutes | FAIL, consequence of dependencies |

Job wall-clock based on GitHub run job started_at/completed_at; one observation alone does not establish median, p95, stable cost or potential savings.

## Execution topology observations
- .github/workflows/ci.yml:18-189 runs separate static-build, unit, five PostgreSQL matrix jobs (including distinct protected Issue215), then platform Ubuntu/Windows and serial employee/dashboard E2E at :189-378. quality at :379-408 waits on all.
- Every of the ten runner jobs repeats setup-node, pnpm setup and pnpm install --frozen-lockfile. No explicit setup-node cache: pnpm is present; potential duplicated setup cost but not proven dominant.
- API race and standard suites dominate the last observed critical wall clock, not total number of test files. The test-count failure stopped unit before the non-Postgres suite; a future green run may have longer critical path.
- worker-6 discovered 35 script tests outside default CI and 38 API private/manual exclusions. These are coverage classification questions, not automatically safe deletions.

## Safely measurable experiments (not authorized CI edits)
1. Capture ~20 comparable completed runs on the same workflow/config (exclude canceled and classify failure-short-circuited runs). Record job start/end, setup/install/build/test, cached/cold variance, median/p95, critical path, and runner OS.
2. Within disposable CI environment profile slowest 20 API race+standard files and test setup/teardown, connection pools/DB reset and serial execution, without changing correctness/fail-fast behavior.
3. Compare pin-safe pnpm store caching (full SHA/lock integrity), setup step changes, and package/artifact reuse only via controlled A/B on identical code+runner conditions. Never replay unstamped artifacts across branches.
4. Investigate whether shared import/fixture setup or wrongly classified generic Promise.all tests are inflating the race lane; do not move tests until db-signal/race constraints and parallel isolation are proven.
5. Investigate serial dashboard E2E after employee E2E: splitting may shorten wall time but duplicate app/DB setup, potentially increasing runner cost; test isolation must stay correct.
6. Keep required tenant, MFA, custody, payment, concurrency, audit and migration protections on every protected PR. Any nightly selection or required-gate change is an owner+Deployment Guardian decision.

## Acceptance and stop criteria
- Proposed target: >=20% reduction in comparable CI median/p95, zero protected invariant losses, zero silent skips, no unauthorized security semantics, no unexplained flaky passing on retries.
- Do not count fewer files, fewer assertions or a single run improvement as proof of less CI critical-path cost.
- No workflows, CI required gates, branch protection or deployment were changed.
