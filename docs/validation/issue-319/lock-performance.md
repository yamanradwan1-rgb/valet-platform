# Issue #319 — lock safety, availability, and latency

Worktree source SHA: 20998a069eb5d576895c0e6c149271a4a0e4028b, dedicated audit-only tests. Final repeated PostgreSQL/HTTP run: 25/25 PASS in docs/validation/issue-319/logs/audit-tests.txt (2026-10-23, 05:04:27 runner time).

## Real loopback HTTP, uncontended measurements

| Route | N | p50 ms | p95 ms | mean ms | max ms | min ms |
|---|---:|---:|---:|---:|---:|---:|
| GET Dashboard /overview/keys | 80 | 13.98 | 20.95 | 16.11 | 88.92 | 6.85 |
| GET Physical Resources /key-slots | 80 | 8.44 | 14.05 | 9.46 | 24.15 | 5.11 |
| GET scope discovery /organizations/:id/locations | 80 | 12.16 | 25.32 | 14.13 | 36.71 | 7.14 |

Source: apps/api/test/dashboard-issue319-performance.integration.test.ts; console markers ISSUE319_UNCONTENDED_HTTP_LATENCY in logs/audit-tests.txt:111-119. These n=80 per endpoint on a synthetic local fixture permit empirical sample p95, not a production SLO estimate. No pre-fix/post-fix comparison was attempted, because production security logic was not changed. Response latency includes loopback HTTP and local test infrastructure. These are not SQL query execution time or isolated lock-acquisition wait distributions.

## Intentional contention

| Case | Measured observation | Interpretation and limit |
|---|---|---|
| D315 LM reader first vs real CA Location deactivation writer | PostgreSQL activity reported at least 1 Lock waiter. LM read HTTP 200 finished before CA deactivate HTTP 201; new read 404. | Canonical Location lifecycle and read appeared ordered in this interleaving. Wait counter does not identify exact blocking backend PID or lock mode. |
| Lifecycle writer queued before LM reader | PostgreSQL activity reported 1 then 2 Lock waiters; writer completed first, LM read rejected 404. | Required transaction order observed; exact lock graph and broad deadlock absence unproven. |
| Legacy Physical LM authorization/projection with CA HTTP grant revoke | CA POST 201 completed before LM old GET 200. Revoker was able to commit during the stalled reader. | Security failure F319-01, rather than a lock wait; this is not an acceptable latency optimization. |
| Legacy Configuration authorization/projection with canonical grant revoke | Revoker commits while reader is parked; response 200 with settings. | Security failure F319-02. |
| KPI RR lock retry path | Historical #315 regression assertions retained and 28/28 baseline passed. | Current #319 has not newly measured all session-advisory error and cancellation paths. |

Observed completed #319 suite: 25 passing tests, 0 failed, 0 skipped, 4 files. No PostgreSQL deadlock errors observed in these selected traces. This does not prove deadlock freedom for all 85 read routes or under sustained pool saturation. Deliberate contention sample sizes are only 1-2 ordered runs and do not support p95 wait-time or latency percentile figures.

## Fault / pool / cleanup evidence

The harness creates a unique private PostgreSQL 17 cluster on random loopback port, never uses DATABASE_URL (explicitly unset), requires ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER and validates owner, runtime role, data directory and server port before tests. Per-test runtime roles are non-superuser, non-createdb, non-createrole. At end logs/audit-cleanup.txt records zero residual child databases, zero child connections and OWNED_CLUSTER_DIRECTORY_REMOVED=True. A built-in valet_photo_evidence_lock_owner role is reported by the private bootstrap cluster at shutdown; it was not an external or persistent role.

Not measured by #319: lock_timeout and statement_timeout matrices, forced connection cancellation, ambiguous rollback quarantine, exact pool checkout/release under failures, two simultaneous reader waves across Organizations, controlled long-running request histogram, canceled KPI session-level advisory lock failure, and repeated retry after injected failure. These remain NOT RUN/UNVERIFIED; source design and historic #315 tests should not be inflated into new empirical proof. A security patch proposal must verify lock ordering plus rollback/connection sanitation and measure contention against this exact source baseline.
