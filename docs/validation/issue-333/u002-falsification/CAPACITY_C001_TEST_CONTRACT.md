# Issue #333 U-002 / C-001 — PostgreSQL pool-pressure test contract

Status: **2/2 PASS, real private PostgreSQL 17, synthetic HTTP/locks only**;
**no runtime protection accepted**.
Pinned baseline: `a4f5f2c6589b6be01b7db99cac4e6829986007f1`.

## Test implementation and classification

`apps/api/test/dashboard-issue333-u002-capacity.integration.test.ts` runs only
under the repository's task-owned Issue #333 PostgreSQL 17 harness, guarded by
the private cluster identity, local loopback port and ownership environment.
The test starts a synthetic, local Node HTTP server, not a Nest authenticated
VAYLET service. Consequently it exercises **a candidate advisory-lock/transport
architecture**, not the five production protected routes. No canonical
LocationAccess writer is invoked in this synthetic pool study.

| Schedule | Actual mechanism to inspect | Evidence boundary |
| --- | --- | --- |
| One reader, one writer | SHARED PostgreSQL **session** advisory held by HTTP handler, EXCLUSIVE PostgreSQL **transaction** advisory requested by writer, `pg_blocking_pids()`, `ServerResponse.finish` | Proves conditional ordering only while session lease survives |
| Four paused HTTP readers | PostgreSQL `Pool({max:4,connectionTimeoutMillis:350})`, one leased backend per paused response | Shows admission saturation and finite acquisition timeout, not a safe implementation ceiling |
| Release/recovery | `finish` or `close` unlock on original leased backend, then `SELECT 1` | Tests recovery under intact normal connections |

The test measures uncontended and saturated connection acquisition (five
samples each, p50/p95) and one blocked writer wait, records only synthetic
marker presence, backend-identity boolean and safe numeric pool metrics.
No credentials or database URL are logged. A passing falsifier demonstrates
that four slow readers can occupy the entire four-slot pool. It **must not**
be interpreted as five-route GREEN remediation evidence.

## Additional capacity gates before any runtime GO

- Repeat one, two and three readers plus canonical revoke under actual
  authenticated VAYLET HTTP; measure complete end-to-end timing.
- Verify Bounded response size, deadline, admission queue length, per-instance
  and per-identity quotas under slow/stalled/aborted clients.
- Verify unrelated queries remain serviceable when the authorization pool is
  pressured; no connection holding while trying to check out another connection.
- Verify different Organizations, CA EXCLUSIVE readers, LM readers, role change,
  retry/exhaustion, 55P03, 57014, 40001 if reachable, and deadlock victim.
- Establish a measured and Owner-reviewed maximum ordinary revoke wait and
  acceptable admission failure behavior, without inventing production SLOs.
- Terminate reader HTTP safely before releasing a lost/expired fence.

Until the above are proven, `C-001` is a **blocking capacity/design
condition** for the single-lease candidate. Read-only source analysis and
synthetic numbers are not evidence of current runtime throughput.

## Actual execution (2026-11-01, isolated Windows host)

Exact command from the Prime worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-capacity.integration.test.ts
```

Private run ID: `79b84285001a4fb38d9eccd521e7dabc`.
Vitest 4.1.10: **1 file, 2 tests passed**, duration **6.33 s**.
The test proved a real PostgreSQL exclusive advisory writer waited until
its matching SHARED backend released on HTTP `finish`
(`pg_blocking_pids` contained that exact reader PID). Observed waiter
duration: **214 ms**. This is safe *only while the leased backend survives*.

In the saturation schedule, all four PostgreSQL backends were checked out
by four paused HTTP responses; a fifth connection acquisition timed out
without any free pool slot. Five uncontended samples yielded **p50 0 ms,
p95 0 ms** at millisecond rounding; five saturated samples yielded
**p50 386 ms, p95 386 ms** (350 ms configured acquisition budget, scheduler
overhead). These are **local samples**, not product throughput/SLO.
Maximum buffered production response size was **not measured**; 23 bytes
of synthetic marker had been emitted at each test's pause gate.

The runner printed `exit=0 removed=True`: its *newly created, attested*
cluster was safely stopped and cleaned. Saved `cleanup.txt` showed zero
nondefault databases and zero foreign activity. The pre-existing W3
PostgreSQL artifact remains untouched. Logs with test numbers and sanitized
metrics are under the ignored private run directory
`tmp/issue-333-w6-evidence/79b84285001a4fb38d9eccd521e7dabc/`;
**this document** retains their nonsecret summary for Git review.

Classification: **VERIFIED SAFE IN TESTED CONTRACT** for the *intact-lease
synthetic reader/writer ordering*, and a **CONFIRMED CAPACITY HAZARD** for
four stalled responses on a four-connection pool. The five authenticated
VAYLET route remediations, backend loss, emergency disable, multi-Organization
pressure, retry/cancel and production latency are **UNVERIFIED** here.
