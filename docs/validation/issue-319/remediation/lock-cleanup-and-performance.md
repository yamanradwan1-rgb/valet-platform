# Issue #319 post-remediation PostgreSQL lock, pool and performance evidence

## Isolated execution environment and logs

`docs/validation/issue-319/run-lab.ps1` is the sole PostgreSQL environment
owner. Its `-Evidence remediation -RunTag ...` variant provisions a unique
PostgreSQL **17.11** private cluster on random `127.0.0.1` port, owner
`issue315_owner`, test child DB and non-superuser runtime role. It requires
`ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER`, removes ambient `DATABASE_URL`,
records identity/version/data-directory and cleans up only its own unique
cluster. The full pre-adjacent-patch `patched-full-audit-identity.txt` names
port `55055` and owned data-directory suffix `issue319-e3a0b30591b748c698cad3f8a259e3f3/.issue315-private-cluster`.
`patched-full-audit-cleanup.txt` shows **0 child databases, 0 child
connections and OWNED_CLUSTER_DIRECTORY_REMOVED=True**. Test cases use
synthetic actors and Location/Organization rows.

## 80-sample uncontended real loopback HTTP comparisons

| Endpoint | Source baseline p50/p95 (ms) | After F319-01/F319-02 p50/p95 (ms) | Samples each | Scope |
|---|---:|---:|---:|---|
| Dashboard `/overview/keys` | 13.98 / 20.95 | **10.76 / 15.17** | 80 / 80 | Reference/negative control |
| Physical `/physical-resources/key-slots` | 8.44 / 14.05 | **10.28 / 12.64** | 80 / 80 | Fixed READ COMMITTED LM |
| Scope discovery `/organizations/:id/locations` | 12.16 / 25.32 | **8.34 / 13.53** | 80 / 80 | Reference/negative control |
| Physical `/physical-resources/overview` | Not recorded | **14.36 / 20.41** | 0 / 80 | New RR fenced measurement |
| Physical key-slots Company Admin MFA | Not recorded | **10.25 / 14.81** | 0 / 80 | Preserved CA path |
| Legacy Configuration GET | Not recorded | **9.78 / 13.57** | 0 / 80 | Fixed LM fence |

Sources: pre-fix `../logs/audit-tests.txt` and `../lock-performance.md`,
after-first-two-fixes `logs/patched-full-audit-tests.txt:185-202`. These are
observations from independent locally created test clusters and include
Nest/HTTP time, Node runtime warmup and network loopback. The paired p95
figures alone do not establish causal effect or sustained-load SLO. Branding
and Subscription were patched **after** these samples; a final rerun checks
that baseline endpoints remain stable, but this historical comparison remains
identified as the original two-fix milestone.

## Deterministic ordering and failures

`logs/patched-full-audit-tests.txt` (52/52 first full patched milestone):

- Real MFA-assured CA HTTP Staff Management `/location-access/revoke` with
  reader-first held SHARED organization advisory: writer visibly queues and
  reader 200 completes before writer 201, then fresh 404. Revoker-first uses
  an external exclusive gate: one queued writer and later reader appear as
  PostgreSQL Lock waiters before release; canonical revoke 201 precedes denied
  LM 404. Two orders each for Physical key-slots, Physical RR overview and
  Configuration (six cases total).
- Two concurrent valid LM readers hold two actually granted SHARED advisory
  locks; `pg_blocking_pids(writer_pid)` proves the canonical EXCLUSIVE writer
  blocked by **two distinct reader PIDs**, then by one, then none as readers
  complete. Distinct Organization's read completes while an unrelated
  Organization's exclusive gate is held. See `logs/extension-locks-retry-audit-tests.txt`
  (6/6 PASS after an initial timing-order assumption failed; initial failure
  retained in `logs/extension-locks-audit-tests.txt`).
- PostgreSQL `lock_timeout` raises SQLSTATE **55P03**, `statement_timeout`
  raises **57014**, rollback releases the transaction advisory and a fresh
  attempt works. KPI session advisory cancellation before BEGIN removes
  ambiguous pool lease; rollback/unlock retry cases tested.
- Physical RR session-advisory acquisition times out with **57014**, discards
  its client (`pool.totalCount=0` in focused assertion), next fresh connection
  reauthorizes; projection exception rolls back/unlocks and retry succeeds.
  `logs/physical-lease-audit-tests.txt` **2/2 PASS**.
- No PostgreSQL deadlock errors were observed in the supported 52-case suite,
  but finite deterministic interleavings cannot prove global absence of
  deadlocks or bounded contention p95. A separate contended wait distribution,
  pool-saturation soak or wide 85-route scan was not executed.

The early extension lock run had **1 test FAIL / 5 PASS** due to assuming a
specific arrival order of two concurrent readers. The test was made
order-independent without relaxing its PostgreSQL backend-PID assertions;
its exact rerun is **6 PASS / 0 FAIL**, and the full nine-file milestone is
**52 PASS / 0 FAIL / 0 SKIP**. Preserve both logs.

An extra CA RR MFA factor-retirement race is separately identified in the
independent review. Its result must be reported in the final acceptance;
the READ COMMITTED CA factor-retirement exercise is not a substitute for an
in-flight RR/MFA proof.

## F319-05 supplemental CA factor retirement lock evidence

`logs/ca-rr-mfa-fixed-audit-tests.txt` is the unchanged RED→GREEN RR
reproducer (now **1 PASS**, HTTP 403 and synthetic Key Slot absent). Actual
`logs/ca-rr-mfa-concurrency-audit-tests.txt` is **2 PASS** with canonical real
MFA recovery, not a mock or direct factor SQL revocation. Its reader-first
`pg_blocking_pids` shows recovery writer PID 30296 blocked by the fenced
CA reader PID 29436; its revoker-first graph shows writer PID 37140 queued
behind synthetic factor gate PID 40128 and the reader queued behind the
writer, followed by 403/no Key Slot. Tests use different Staff sessions for
the same synthetic CA to expose the factor-wide, not only session-row, lock.
Private PG17.11 ports 57597 and 57709 both report 0 child databases, 0
child connections and owned cluster directory removed true. The finite graph
tests establish ordering for these cases only; they do not prove every
PostgreSQL deadlock or pool-saturation schedule impossible.

## Final five-fix local benchmark (after F319-05)

Exact command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag final-five-fixes-performance -TestFile test/dashboard-issue319-performance.integration.test.ts
```

**1 PASS / 0 FAIL / 0 SKIP**, one independent synthetic-fixture HTTP
benchmark file, **80 timed requests per endpoint**, no background load.
`logs/final-five-fixes-performance-audit-tests.txt`, PostgreSQL 17.11 private
port **58318**, non-superuser runtime, matching identity and cleanup logs
confirm **0 child DBs/connections and cluster directory removed**.

| Path | Pre-fix historical p50 / p95 ms | Final five-fix p50 / p95 ms | Samples each | Notes |
|---|---:|---:|---:|---|
| Dashboard `/overview/keys` | 13.98 / 20.95 | 9.31 / 17.01 | 80 / 80 | Unmodified reference |
| Physical key-slots LM | 8.44 / 14.05 | 8.23 / 12.58 | 80 / 80 | Grant-fenced RC reader |
| Scope discovery | 12.16 / 25.32 | 6.27 / 9.10 | 80 / 80 | Unmodified reference |
| Physical RR overview LM | Not measured | 10.42 / 17.51 | 0 / 80 | Pre-BEGIN grant advisory |
| Physical key-slots CA with MFA | Not measured | 6.92 / 10.22 | 0 / 80 | Original RC CA path |
| **Physical RR overview CA with MFA** | **Not measured** | **11.99 / 17.46** | 0 / 80 | New F319-05 factor-fenced path |
| Legacy Configuration LM | Not measured | 7.12 / 10.72 | 0 / 80 | Same original ten settings |

The full #319 combined suite (`logs/final-five-fixes-audit-tests.txt`)
also ran its preexisting six-route 80-sample case on another private cluster;
its measured p50/p95 were respectively 9.39/13.00, 10.66/17.31,
9.09/11.46, 14.24/22.63, 9.11/13.46 and 11.40/16.27 ms. These two
five-fix measurements vary across fresh isolated local environments. Do
not claim same-host controlled causal improvement or production p95 from
these observations. In particular, the pre-fix CA RR Overview was **never
measured**, so no before/after percentage is justified for F319-05. The
deterministic contention proofs above establish ordering, **not** a p95
contended wait distribution. Pool saturation and long-duration soak remain
NOT RUN; no deadlock was observed in exercised deterministic barriers.
