# #414 W7 — PG17 ALT-02/03 source-reader performance evidence

**Result: scoped benchmark PASS on the measured synthetic tier; Phase-1
release remains BLOCKED by separate gates.** Execution on 2026-11-04,
source frozen at `71ad11f349e76236ef9429b971ce537772cba2ac`.
The follow-up adds **test/evidence only**, not source/writer/migrations.
WBS **414-01-11:** this fulfills only W7's ALT-02/03 SQL-reader
microbenchmark slice, not the full all-source/HTTP/pilot acceptance.

## Provenance and exact run

- Disposable, newly migrated **PostgreSQL 17.11** child DB with newly
  provisioned restricted API runtime role; parent was the task's local
  loopback PG17 harness. The repository's `run-owned-tests.mjs` acquired
  its **exclusive global cluster lease**; cleanup reported `db=0 roles=0
  children=0`. No shared database or manual lease/run-ID override was used.
- Command executed in `apps/api` via the workspace:
  `TEST_DATABASE_URL=<privately supplied task-owned local PG17 URL>
  ISSUE414_W7_BENCH_ENABLE=I_OWN_EXCLUSIVE_PG17_LEASE
  pnpm --filter @valet/api exec node
  ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs
  test/issue414-dispatch-performance.integration.test.ts`.
  (Set environment variables using your shell's syntax. Never print
  credentials or set `VAYLET_TEST_CLUSTER_RUN_ID` yourself.)
- **PASS 1/1** opt-in benchmark integration test, exit 0; 36 successful
  scenarios, **20 warmup + 100 measured reads each**: 4,320 successful
  requests including warmups, 3,600 measured, **0 errors**, 12 real
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` statements.
- Exact shipping SQL was parsed from the original reader TypeScript AST,
  without writing a comparison query by hand. SQL SHA-256:
  `452c9f008508cc3516d203ab3745ea337395d01b1a4902f0d991a77805d0c813`.
  The runner compared original reader source in Git at frozen SHA against
  HEAD before executing.
- Fixture consists of two independently scoped Organizations, **two
  Locations per Organization**, CA and LM viewers, and four Location
  cohorts. Sparse target **80 Tasks** (12 ALT-02/12 ALT-03; 56 historical
  terminal) with secondary 30 Tasks; dense target **1,200 Tasks** (60
  ALT-02/60 ALT-03; 1,080 historical terminal) with secondary 300 Tasks.
  Total **1,610 Tasks / 26,156 DispatchEvents / 38,146 AuditEvents**.
  Dense inactive Task history: 18 extra Dispatch and 25 Audit rows per
  Task, plus one QUEUED event; dense active ALT-03: old Audit history and
  exact current version/actor/time paired evidence. Fixture is
  **synthetic SQL-generated, not canonical operational-writer traffic**.
  Existing indexes only; **no index DDL**.

## Measured end-to-end p95 (milliseconds)

Each entry has 100 measured reads at the *requested* concurrency 4/8/16.
The production-like runtime pool was actually **max=4**, so concurrency
8/16 induced pool queuing, not 8/16 concurrent PostgreSQL query backends.
These are hot-cache local **reader SQL + pool + DTO mapping** measurements,
not HTTP latency, token renewal, MFA checks or production traffic.

| Location | Reader | Source | c4 | c8 | c16 |
|---|---|---|---:|---:|---:|
| sparse | CA | list | 8.139 | 19.150 | 27.157 |
| sparse | CA | ALT-02 detail | 6.284 | 13.012 | 28.369 |
| sparse | CA | ALT-03 detail | 7.964 | 15.716 | 20.032 |
| sparse | LM | list | 8.325 | 13.182 | 24.616 |
| sparse | LM | ALT-02 detail | 4.892 | 9.421 | 26.574 |
| sparse | LM | ALT-03 detail | 6.689 | 11.337 | 19.702 |
| dense | CA | list | 16.868 | 29.695 | 61.291 |
| dense | CA | ALT-02 detail | 9.573 | 19.104 | 36.489 |
| dense | CA | ALT-03 detail | 9.484 | 16.931 | 28.763 |
| dense | LM | list | 18.790 | 34.157 | **70.822** |
| dense | LM | ALT-02 detail | 12.305 | 14.181 | 26.751 |
| dense | LM | ALT-03 detail | 7.321 | 12.351 | 23.210 |

Worst measured combination, dense LM list, requested c16:
**p50 41.350 ms / p95 70.822 ms / max 86.577 ms**. Its pool
acquisition: p50 **20.934 ms** / p95 **55.968 ms** / max **70.449 ms**;
query+mapping after acquisition p50 **15.505 ms** / p95 **18.127 ms**
/ max **33.653 ms**. All 36 complete p50/p95/max, pool acquisition,
query+mapping, timeouts/errors, wait observations and measurements are in
`W7_DISPATCH_PG17_METRICS.json`, with no guessed values. Every measured
p95 was under the proposed **1,000 ms** alert-branch screening threshold;
that proposed threshold is **not** an approved production SLO.

## Real PostgreSQL plans, LATERAL Audit cost

The following are 12 actual PG17 `EXPLAIN (ANALYZE, BUFFERS)` statements
using the exact SQL and the restricted runtime role. Root shared-buffer
counts are **inclusive**, not a sum of nodes; all reported disk reads were
zero in this warmed run. Planner time is separately visible in full JSON.

| Tier / viewer | SQL | Execution ms | Root shared hits | Rows returned |
|---|---|---:|---:|---:|
| sparse CA | list | 1.562 | 408 | 21 |
| sparse CA | ALT-02 | 0.394 | 121 | 1 |
| sparse CA | ALT-03 | 0.338 | 125 | 1 |
| sparse LM | list | 0.885 | 401 | 21 |
| sparse LM | ALT-02 | 0.291 | 123 | 1 |
| sparse LM | ALT-03 | 0.578 | 127 | 1 |
| dense CA | list | 7.816 | 5,393 | 21 |
| dense CA | ALT-02 | 1.190 | 1,456 | 1 |
| dense CA | ALT-03 | 1.351 | 1,461 | 1 |
| dense LM | list | **9.502** | **5,395** | 21 |
| dense LM | ALT-02 | 1.056 | 1,458 | 1 |
| dense LM | ALT-03 | 0.327 | 51 | 1 |

Dense LM list plan included **120 loops** over current candidates:
`audit_events` **Bitmap Heap Scan 120 loops**, bitmap index
`audit_events_valet_session_id_occurred_at_idx` (120 loops, ~26 rows per
loop), **3,308 inclusive shared-hit blocks** at the Audit scan node;
`dispatch_events` bitmap heap scan 120 loops, plus a separate indexed
Dispatch verification. The reader did **not** show an all-table Audit
sequential scan in this tested tier, but Audit is a correlated per-candidate
count with old rows filtered after per-Session lookup. Increasing the
number of active queued candidates or deepening their shared Session history
may make this expensive. **No Task/version-specific Audit index currently
exists**. More realistic larger-tier proof is required before any index
decision; **no index created or authorized here**.

All 12 unabridged PostgreSQL plan JSON trees are retained together with
per-read metrics in `W7_DISPATCH_PG17_FULL_EXPLAIN.json.gz`. Its
decompressed SHA-256 is
`ef9146b8f89f117c89df96ec3ecc8661381ff2872339dd707ab676043e683891`.
Uncompressed raw JSON size **694,197 bytes**. Human-readable indexed plan
nodes and the 36 complete timing records are also in
`W7_DISPATCH_PG17_METRICS.json`. Neither contains credentials, tokens,
guest profile data nor a database URL.

## Pool/lock/error evidence and limits

Default runtime pool **4**. c16 had a cumulative peak waiting/admitted
count of **16/20** in `runtimePoolSnapshot`, and sampled max **4 active
PG backends**. A separate administrative connection polled
`pg_stat_activity` every **25 ms**: **366 samples**, **0 positive lock
wait samples** and max observed lock-blocked backends **0**. All scenarios
reported zero pool acquisition, lock, statement, query timeouts, and
`pg_stat_database.deadlocks` deltas **0**. Sampling cannot detect
sub-25ms waits and does not prove a no-lock guarantee. `database.size`
in the raw JSON was recorded **before fixture seeding** (15 MB), not a
post-load storage measurement.

The benchmark makes read-only source calls in a local hot-cache fixture,
with no concurrent domain writers, HTTP request path, real MFA/session
renewal, tenant-wide high activity, cold cache, 100k/1m scale, 16 DB
connections, or product deployment. No 1-second production p95 guarantee
can be inferred from these data. **Phase-1 activation remains BLOCKED**
by W1's fractional-millisecond legacy cutover finding: capture and persist
the trusted post-quiescence DB-side
`clock_timestamp()::timestamptz(3)` cutoff, prove provenance, enforce
fresh delegated session/MFA/entitlement authority in the aggregate,
and obtain independent review, complete multi-source/HTTP load and CI.
See `docs/plans/ISSUE_414_PHASE1_DISPATCH_CHRONOLOGY_EVIDENCE.md` and
the real PG17 boundary test at
`apps/api/test/issue414-dispatch-cutover-precision.integration.test.ts`.

### Trial failures retained for reproducibility

The first explicit invocation was classified into the non-Postgres lane,
**failed before DB work** because the global lease was missing. The opt-in
test now has a direct PG probe and enters the proper PostgreSQL harness.
Two subsequent leased attempts **failed during test-only fixture SQL
seeding** (PostgreSQL parameter binding), before EXPLAIN or timed reads;
both performed complete disposable cleanup, confirmed
`db=0 roles=0 children=0`. Corrected fixture binder forms passed the
third leased attempt above. These failure exits are **not** counted as
successful measurements.
