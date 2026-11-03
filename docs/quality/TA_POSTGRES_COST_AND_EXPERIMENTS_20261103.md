# TA — PostgreSQL CI critical-path cost and safe experiment ledger

Date: 2026-11-03
Base SHA: `f9ecebd9af85b44580771b4027515d06c0a31de4` (merged PR #413)
Scope: source-level cost audit and completed CI log measurements. **No protected runner, test, SQL, or gate modified.**

## 1. Why reducing tiny unit-test counts cannot materially fix CI duration

The PR `#413` final workflow [#586](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/41676375549) completed successfully. Its longest lanes were:

| Required lane | Passing test files | Passing test cases | Skipped cases | Observed Vitest duration |
| --- | ---: | ---: | ---: | ---: |
| `api-postgres-standard` | 185 | 1,186 | 11 | 1,140.54 s |
| `api-postgres-race` | 257 | 1,519 | 63 | 1,398.71 s |
| `api-postgres-compound` | 27 | 95 | 1 | 236.75 s (CI #585; evidence from that earlier run only) |

The entire workflow critical path is governed by the slowest **parallel job**, not the sum of job durations. This is important for token budget: deleting 20 inexpensive unit assertions changes their lane, not necessarily the ~23-minute PR wait.

In completed CI #585, per-test-file observed elapsed medians were **6.569 seconds** for 185 passing Standard files and **8.920 seconds** for 257 passing Race files. The 95th percentiles were **8.072** and **12.470 seconds** respectively; these are percentiles *across test files in one workflow*, not statistically valid p95 across many workflow executions. The file body does not prove whether setup or product queries dominate; only stage timing does.

## 2. Stage-level root cause evidence

- `apps/api/vitest.config.mjs:29-44` uses isolated bounded fork projects with `fileParallelism: true` but sets `maxWorkers` from `scripts/test-harness/resource-budget.mjs`. **Standard: 1 file worker; Race: 2.** Budget is intentional rather than a careless configuration; available PostgreSQL connections, subprocesses and direct clients have a calculated envelope.
- `scripts/test-harness/vitest-postgres-global.mjs` verifies owned disposable database target, cluster lease, stale-owner recovery before cleanup, applies profile admission, and cleans only owned resources. Cannot safely remove preflight or cleanup to save seconds.
- Many API fixtures allocate their **own database**, apply all migrations, provision runtime role and start Nest/HTTP for each integration file, with fresh roles and teardown. Examples include `apps/api/test/shift-test-context.ts`, `check-in-api.integration.test.ts`, `staff-auth.integration.test.ts`, `guest-access-command.integration.test.ts`, and `vehicle-identity-command.integration.test.ts`. These are repetition of **setup**, not proven duplication of behavioral invariants.
- Representative slow files from the **#585** logs: Standard `guest-t3-cost.integration.test.ts` ~25.4 s (intentionally seeds 100,000 events), `guest-t3-protocol-timeout.integration.test.ts` ~13.1 s; Race `guest-t3-runtime-resilience.integration.test.ts` ~31.6 s, `guest-t3-lease-regression.integration.test.ts` ~28.3 s, `management-company-report-export-http.integration.test.ts` ~27.7 s. Some intentionally test timeouts or stress behavior and must not be shrunk merely to make the clock green.
- `.github/workflows/ci.yml` has dedicated ephemeral PostgreSQL 17-alpine services per matrix job, preserving isolation. `pnpm` cache is already enabled after PR #413; it restored a ~408 MB cache, but aggregate setup and install wall times from two nonmatched workflows did **not** prove a speedup. Revert only after comparable repeated experiments, not anecdote.

## 3. Measured experiments, in risk order

| Experiment | Instrumentation and acceptance proof | Safety / rollback |
| --- | --- | --- |
| **P1 A/B trace create/migrate/provision** | Capture redacted stage durations for at least 20 representative Standard/Race files using already present `issue215-fixture-timing.ts` style timers. Record file, stage, project, worker and source SHA in CI artifacts. No database URLs/secrets. | Do not alter fixture or workload yet. Fail if instrumentation changes observed behavior |
| **P1 prototype migration template** | In a **disposable** local/CI PG cluster, migrate a pinned schema template once, then use `CREATE DATABASE ... TEMPLATE` to create a **fresh isolated database per test-file** where supported. Provision unique runtime role/grants after cloning. Verify migration checksums, privilege negative tests, owner lease, cleanup and concurrent clone locks. Compare same file set vs current full migrations | Never reuse mutable operational rows or copy credentials; never use production cluster/template. Unsafe privilege/tenant test differences or rollback fail closes experiment |
| **P1 fixture ownership simplification** | Consolidate repeated *fixture builder code*, not the logically distinct tests. Extract a schema/role helper only where fresh DB/role, audit persistence, isolation and rollback conditions match exactly. Bench only after template baseline | No changing authorization-before-mutation / app command semantics |
| **P2 bounded parallelism** | On isolated Docker PG with measured `max_connections`, repeat full affected race/standard suite under current vs +1 file worker, with reservation budget and fault/negative tests, 10 runs per variant | Reject on pool admission failure, nondeterministic case order, race false green, or cleanup drift; 1 and 2 workers remain locked until proven safe |
| **P2 CI cache assessment** | Compare identical lockfile and GitHub runner image across 10 hits/10 misses, measuring Setup Node + pnpm + frozen install and entire critical path | Cache has no authority to bypass frozen lockfile, auth, S3 or DB/security lanes |

## 4. Decision gates

A candidate can be proposed for migration only after it proves all of: no changed accepted domain policy, no change to migration history, dedicated owned database & role per risky file, real tenant and Location denial, atomic audit/payment/custody, lost-session/UNKNOWN retry and concurrent conflict, fail-closed cluster lease and stale-owner cleanup. The protected Issue215 and private Issue319/333 tests are not interchangeable with mocked or reclassified Unit tests.

For a statistically meaningful claim, use a **fixed SHA**, lockfile, PG 17 service, runner class and equal set of test files. Capture 10+ clean runs for each variant, report critical-path elapsed, per-stage p50/p95, total runner-minutes, frequency of flaky reruns, and selected failures. A 20% target is an experiment, **not a proven result**.

## Conclusion

**Root cause with strongest source support:** per-file DB/migration/runtime-role/Nest setup repeated hundreds of times under intentional low concurrency. **Next engineering change should instrument the setup stages and prototype per-file database clones in disposable PG only**, preserving all negative correctness/authorization and concurrency tests. Removing valuable test cases before tackling setup cost is unlikely to materially reduce the CI critical path.
