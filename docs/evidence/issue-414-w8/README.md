# Issue #414 W8 — source-reader PostgreSQL 17 performance evidence

**Execution:** 2026-11-04 13:00:19 UTC; local ephemeral PostgreSQL **17.11**
(`server_version_num=170011`, x86_64 Windows, 8 KiB pages).
Node v24.19.0, AMD Ryzen 5 3600 (12 logical CPUs), ~17.1 GB host RAM.
**Source revision tested:** `971e59abbdb9f509b6d10aa1df30c31490aba778`.

**Full machine-readable evidence:** [management-alert-source-pg17.json](management-alert-source-pg17.json).
The JSON preserves all 12 *actual* `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
candidate SQL trees, plan nodes, shared hit/read blocks, planner/execution
times, 12 end-to-end latency distributions, and 18 contention distributions.
No credentials, tokens, or free-text source descriptions are recorded.

## Reproduction

From the repository root, **only after obtaining the test-cluster lease**:

```powershell
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/management-alert-source-performance.integration.test.ts
```

Normal runs profile in memory and **do not overwrite tracked evidence**.
To intentionally replace the JSON with new machine- and time-specific
measurements, opt in explicitly:

```powershell
$env:ISSUE414_CAPTURE_PG_EVIDENCE = "enabled"
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/management-alert-source-performance.integration.test.ts
Remove-Item Env:ISSUE414_CAPTURE_PG_EVIDENCE
```

Successful run: `api-postgres-race` **1/1 PASS**, Vitest duration 35.66 s;
owned harness cleanup run `run_focused-api_gw0_8f858b0558a6` reported
`db=0 roles=0 children=0`, exit code 0; lease released and Prime notified.
The first dry run failed on an ambiguous synthetic SQL parameter addition,
was corrected using explicit integer casts, and **produced no timings**.
This report uses only the successful second run.

Fixture construction creates two unrelated Organizations (sparse and dense),
one selected active Location and one other-Location distractor in each,
active Company Admin and Location Manager memberships and current MFA/Staff
sessions. All readers run directly, with the real session lock, current
Dashboard authorization, subscription and per-family source predicate.
The selected Location has a saved 30-second SLA; retrieval attempts are
already overdue. `ANALYZE` refreshes synthetic test-database statistics;
**no indexes, schemas, migrations or production databases are changed**.

| Fixture/selected Location | Eligible ALT-01 | Cancelled retrieval history | Eligible ALT-08 | Incident noise | Eligible ALT-12 | Revoked-grant pending | Rejected history | Other-Location sessions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sparse | 2 | 2 | 2 | 4 | 2 | 1 | 1 | 1 |
| Dense | 42 | 600 | 42 | 1,200 | 42 | 300 | 300 | 280 |

Dense incident noise has 599 recent LOW/OPEN and 601 RESOLVED/HIGH records,
while 42 qualified CRITICAL incidents have older timestamps. Thus source
filtering and severity order are exercised **before the 21-row LIMIT**.
Presence includes current START requests, pending exceptions whose requester
grant was revoked, and lawful REJECTED terminal history. Each reader
returned exactly 2/21 qualified items on sparse/dense scope; no false zero.
These are synthetic stress fixtures, not representative staffing ratios.

The commercial cross-check confirmed an active Location Dashboard and the
Presence entitlement helper are **both true** with
`dashboard_access_enabled=TRUE`. With it false, the helper returns false
**and the ordinary Dashboard ALT-08 reader denies the whole scope**. No
separate Presence-commercial-disabled but Dashboard-enabled state exists
under this schema.

## Sequential readers: 20 untimed warmups, 100 measured calls per row

Times are **milliseconds** around the full in-process transaction, including
pool acquisition, session validation, Dashboard authorization, source query,
and transaction commit. Plan times reported below are separately measured
PostgreSQL-only candidate-query execution, **not** these reader durations.
Percentiles use linear interpolation between adjacent ordered observations.

| Fixture | Actor | Family | p50 | p95 | max | EXPLAIN execution |
|---|---|---|---:|---:|---:|---:|
| Sparse | LM | ALT-01 | 9.848 | 14.058 | 15.360 | 0.106 |
| Sparse | LM | ALT-08 | 7.593 | 10.293 | 14.235 | 0.044 |
| Sparse | LM | ALT-12 | 9.189 | 12.611 | 16.123 | 0.218 |
| Sparse | CA | ALT-01 | 9.460 | 14.989 | 17.585 | 0.043 |
| Sparse | CA | ALT-08 | 10.172 | 14.491 | 22.009 | 0.034 |
| Sparse | CA | ALT-12 | 11.072 | 14.742 | 17.908 | 0.171 |
| Dense | LM | ALT-01 | 10.313 | 13.079 | 14.526 | 0.381 |
| Dense | LM | ALT-08 | 7.108 | 10.532 | 13.637 | 0.274 |
| Dense | LM | ALT-12 | 11.430 | 17.405 | 20.745 | 2.257 |
| Dense | CA | ALT-01 | 8.044 | 11.053 | 12.814 | 0.208 |
| Dense | CA | ALT-08 | 6.942 | 11.978 | 64.364 | 0.200 |
| Dense | CA | ALT-12 | 9.301 | 12.672 | 14.495 | 1.343 |

The 64.364 ms dense CA ALT-08 maximum is an observed outlier, **not**
suppressed. One local run cannot assign its cause.

## Dense concurrent readers: five waves per width, same Staff principal

Each wave submits 4, 8 or 16 concurrent full reader transactions; 20, 40
or 80 individual measurements per family/role/width. Because calls use the
**same Staff principal**, required Staff-user and Staff-session locks create
intentional serialization. These figures measure this synthetic contention,
not independent-user throughput or product capacity.

| Actor | Family | Width | p50 ms | p95 ms | max ms |
|---|---|---:|---:|---:|---:|
| LM | ALT-01 | 4 | 16.174 | 67.827 | 94.151 |
| LM | ALT-01 | 8 | 27.086 | 46.133 | 49.409 |
| LM | ALT-01 | 16 | 52.414 | 96.651 | 102.361 |
| LM | ALT-08 | 4 | 13.903 | 23.428 | 31.780 |
| LM | ALT-08 | 8 | 28.025 | 50.579 | 55.313 |
| LM | ALT-08 | 16 | 50.377 | 96.744 | 107.168 |
| LM | ALT-12 | 4 | 23.605 | 41.820 | 59.325 |
| LM | ALT-12 | 8 | 39.839 | 72.894 | 80.704 |
| LM | ALT-12 | 16 | 93.616 | 170.934 | 192.950 |
| CA | ALT-01 | 4 | 21.219 | 32.316 | 35.614 |
| CA | ALT-01 | 8 | 34.526 | 60.173 | 71.172 |
| CA | ALT-01 | 16 | 63.798 | 117.373 | 139.575 |
| CA | ALT-08 | 4 | 17.236 | 27.211 | 34.398 |
| CA | ALT-08 | 8 | 40.875 | 73.211 | 80.140 |
| CA | ALT-08 | 16 | 60.798 | 120.583 | 140.095 |
| CA | ALT-12 | 4 | 32.444 | 53.396 | 63.382 |
| CA | ALT-12 | 8 | 50.519 | 96.267 | 133.514 |
| CA | ALT-12 | 16 | 95.017 | 178.453 | 195.065 |

## Exact observed plans and W2 index evaluation

- **ALT-01 dense:** `Bitmap Heap Scan` over 42 live
  `valet_sessions` using `valet_sessions_location_id_state_idx`, joined
  to `retrieval_requests` through
  `retrieval_requests_one_active_per_valet_session_idx` (44 candidate
  entries, 42 joined rows). Root shared hits 7 / reads 0.
  Candidate-query execution: LM 0.381 ms; CA 0.208 ms. No demonstrated
  missing-index blocker at this fixture scale.
- **ALT-08 dense:** `Seq Scan on incidents` returns 42 candidate rows,
  **1,206 rows removed by filter** (1,248 scanned); root shared hits 27 /
  reads 0, quicksort to the 21-row severity-first limit. Candidate-query
  execution LM 0.274 ms; CA 0.200 ms. Existing index
  `incidents_location_id_status_idx` is used in sparse but the planner
  favors a Seq Scan at the tested dense size.
- **ALT-12 dense:** `Bitmap Heap Scan` on
  `shift_presence_exceptions` using existing `..._scope_key` index
  (471 index rows per 2 loops, and 150 filtered per loop), with **342**
  challenge and operation PK index probes. Root shared hits 2,095 /
  reads 0; candidate query LM 2.257 ms / CA 1.343 ms. Existing
  `shift_presence_exceptions_queue_idx` also exists, so there is no
  proven missing index. Viewer-dependent `canReview` predicates cannot be
  replaced with a coarse Location-only index or first-page shortcut.

**Conditional W2 proposal, not approved or applied:** if a substantially
larger fixture or measured deployment shows that ALT-08's filtered Seq Scan
and sort become expensive, evaluate a source-specific partial ordering index:

```sql
CREATE INDEX CONCURRENTLY incidents_management_alert_active_order_idx
ON public.incidents (
  organization_id,
  location_id,
  ((CASE WHEN severity = 'CRITICAL' THEN 0 ELSE 1 END)),
  created_at DESC,
  id DESC
)
INCLUDE (severity)
WHERE status IN ('OPEN', 'INVESTIGATING')
  AND severity IN ('HIGH', 'CRITICAL');
```

Check the `EXPLAIN` plan after representative higher row counts and quantify
index maintenance/storage before seeking migration approval. **Current
evidence does not justify a mandatory index change or demonstrate production
capacity.** W2 owns migrations; W8 did not apply this DDL.

## Limits

Only a single local PG17 instance, warm shared-buffer access (all captured
plans show zero shared reads), one snapshot of two synthetic Organizations,
one source reader per transaction, direct Node integration, and same-principal
contention were tested. No API HTTP ingress, real network latency, realistic
multi-user workload, staging production data, cold-cache behavior, aggregate
ALT-02/03 work, end-to-end bell UI, or production deployment is represented.
The independent W1 code-review verdict and Prime's integration gates remain
separate decisions.
