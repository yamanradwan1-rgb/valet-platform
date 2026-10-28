# PostgreSQL acquisition / release investigation and diagnostic handoff

## Status and pre-code scope

Remediation is **BLOCKED**, not complete. Starting `origin/main`, fetched before
branch creation: `0c0ebd87571b703d286c5ede344d9eb4e52f5598`.
Branch: `fix/postgres-acquisition-release-root-cause`.

The supplied busy workload failed. Existing counters and the accessible saved
Windows QA evidence do not establish a software defect that can safely be fixed.
The owner explicitly requires stopping rather than manufacturing a remediation.
This branch provides narrowly scoped diagnostics and real-PostgreSQL lifecycle
regressions; it must not be presented as the completed capacity remediation.

Pre-code review: root AGENTS; structure rules; security/engineering/database/stack
and collaboration guidance; accepted DEC-025/026 infrastructure and credential
boundaries; prior pool and condition-photo reports; shared acquisition, query,
lease, deadline and transaction ownership; direct checkout callers, live Staff
authentication and the mixed-workload transaction callers.

Affected entities are transient connection leases and fixed-schema numeric
diagnostics. No ValetSession or Task/Dispatch transition changes. No schema,
index, grants, transaction isolation, atomic audit/outbox, authorization,
tenant/Location policy or Company-default/Location-override changes. Within the
existing modular-monolith infrastructure scope. Keep one runtime pool, 4/128 QA
admission and the 2,000ms acquisition budget. Photo processing remains unchanged.

Structure plan: keep lifecycle phase bookkeeping separate from admission;
fixed operation context in neutral observability; existing query and lease
wrappers report events without altering ownership or error propagation. All
new/modified authored code stays within the 300-line policy. Add no SQL text,
parameters, tokens, tenant/customer IDs, private object keys or raw errors to
diagnostics.

## Evidence obtained before implementation

- Five baseline real-PG17 suites: 18 tests passed. Authentication/reset overlap,
  bounded burst admission, phase accounting, repeated reuse, server termination,
  deadlines, lost setup/reset/COMMIT/ROLLBACK responses and shutdown recovered.
- Accessible QA handoff and final report identify source
  `5341bbe2614442a24e833039cfffe1fe21b7195f`, not the new merged baseline.
  Only fixed numeric metrics and allowlisted operation summaries were extracted
  from private logs; no private payloads or credential fixtures were rendered.
- Same-source saved pulse uptime 4952 -> 4982 seconds: reset failures 1 -> 2;
  acquisition timeouts remain zero, with zero leased/waiting at both boundaries.
- Uptime 5162 -> 5192: timeouts 0 -> 182; then 5192 -> 5222: 182 -> 191.
  Reset failures remain 2. Thus the additional reset failure precedes the timeout
  burst; temporal evidence does not support treating it as its direct cause.
- In the latter 30-second interval, transaction-control RTT adds 39,336ms;
  setup/work/reset RTT add 58/309/33ms. Lease occupancy adds 39,790ms and four
  completed leases enter the >5,000ms bucket. These are completed driver RTTs,
  not server execution times, and cross sample boundaries.
- Allowlisted operation summaries show three TASK_QUEUE_READ durations
  9611.904/9530.446/9348.205ms and one STAFF_VEHICLE_DIRECTORY_READ 9379.066ms.
  Their HTTP responses had already disconnected. These requests are read paths;
  their later SUCCESS observation does not mean clients received success.
- Existing transaction-control counters combine BEGIN, COMMIT and ROLLBACK.
  No contemporaneous backend wait-event samples identify the stalled phase or
  distinguish server work, WAL/IO, locks, Docker networking or driver delivery.
- No query, lease, statement, lock or transaction timeout/error increments were
  recorded. Reset rejection details were discarded, so its exact cause cannot
  be recovered from these counters.
- Saved PG checkpoint logs show a checkpoint completion at 22:32:12.123
  Asia/Amman (sync 0.053s) and next start at 22:32:42.152. Checkpoint write time
  includes pacing; this is not proof of an IO stall or proof of its absence.

Confirmed: all four slots were occupied during the native acquisition-timeout
burst; the recovery interval is dominated by transaction-control RTT, followed
by complete drain.
Unconfirmed: exact stalled SQL/control phase and server wait, initiating cause,
exact reset failure, software defect, and any capacity improvement.

## Selected implementation and lifecycle

The justified implementation is diagnostic attribution, **not a performance fix**.
The acquisition, setup, SQL, transaction and reset policy and SQL are unchanged.
No evidence justifies skipping reset, shortening a legitimate Staff transaction,
increasing a limit or replaying a mutation. The exact historical reset batch
failure is unknowable from the retained counters; its rejection was not logged.
Destroyed connections are not classified as leaks.

Before and after, the lifecycle is:

```text
bounded admission -> native pg checkout -> owned lease -> general setup
  -> original SQL / BEGIN / protected action / COMMIT or ROLLBACK
  -> release requested -> general RESET batch -> native return
                        -> failure -> destroy
deadline / server termination / shutdown -> one-time forced disposal
```

Admission remains occupied through reset, and there is no reuse before reset
completion. Guest leases retain their existing stricter setup/teardown policy.
Query timeout still destroys an ambiguous connection, and a completed result
is not changed to failure because its later reset failed. As before, explicit
disposal can interrupt reset; the later reset rejection remains counted.
The new counters distinguish that race from a reset which initiated disposal.

New diagnostic state contains only numeric timestamps, counts and source-owned
category indexes. The operation context holds one integer, not the request,
URL, principal or headers. Live lease state is removed once on disposal/return;
query bookkeeping tracks outstanding driver calls without retaining SQL or
parameters. Both callback and Promise query APIs finish measurements once.
There are no additional database round trips, locks, transactions or pools.
Per-query bookkeeping and one operation-context boundary add bounded overhead;
its effect on realistic throughput has not been benchmarked.

### Fixed-schema metric contract

Existing counters and their dimensions are preserved. New vectors use this order:

- Phase, length 7: OWNED, SETUP, WORK, BEGIN, COMMIT, ROLLBACK, RESET.
- Operation, length 11: OTHER, AUTH, CONTEXT, TASK_QUEUE, DIRECTORY, CHECK_IN,
  PHOTO, DASHBOARD, GUEST, STAFF, HEALTH. Background/non-HTTP work is OTHER.
- Reset failure, length 8: ABORTED_TRANSACTION, QUERY_TIMEOUT, LOCK_TIMEOUT,
  STATEMENT_TIMEOUT, TRANSACTION_TIMEOUT, CONNECTION, OPERATION_DEADLINE, OTHER.

| Fields | Meaning |
| --- | --- |
| `pid`, `processStartedAtMs`, `sampledAtMs`, existing `releaseSha` | Same-process identity and actual sample boundaries; process start uses Node's fixed time origin |
| `phaseCounts`, `phaseMs`, `phaseMaxMs` | Driver calls started, completed RTT sum, lifetime maximum completed RTT per phase; OWNED has no SQL calls |
| `activeByPhase`, `oldestLeaseByPhaseMs`, `oldestQueryByPhaseMs` | In-flight ownership and age at sample time; unfinished stalls are visible before completion |
| `activeByOperation`, `operationLeases`, `operationLeaseMs`, `operationLeaseMaxMs` | Current HTTP category occupancy, started leases, completed ownership sum/max |
| `operationAcquisitions`, `operationAcquisitionMs`, `operationAcquisitionTimeouts` | All settled public checkout attempts, their elapsed time, and public ACQUISITION_TIMEOUT failures by category; includes denied/failed attempts in totals |
| `resetFailureReasons` | Sanitized reason of the RESET batch rejection; no raw error, SQLSTATE string, message, position or parameters are emitted |
| `resetsInterrupted`, `resetFailuresAfterDisposal` | Forced disposal while a reset was unsettled, and a reset rejection observed after disposal; these are overlapping lifecycle facts, not additional HTTP failures |
| `peakActive`, `peakIdle`, `peakLeased` | Lifetime observed peaks at checkout/snapshot observation points; not guaranteed continuously sampled maxima |

`phaseMs` includes client-side driver queuing when callers submit overlapping
queries; it is not PostgreSQL executor time. Ownership is attributed to the
oldest outstanding driver call. A snapshot cannot prove the backend's current
wait event. OWNED means no query is outstanding, not that application work is
necessarily unnecessary. RESET identifies the existing composite reset batch;
it does not retrospectively identify an individual RESET substatement.

Use counter deltas only between samples with identical PID, process start and
verified SHA. Copy vectors before computing local test deltas (snapshot counter
vectors, like the existing vectors, are live arrays). Maxima are lifetime values:
do not subtract them or label them fresh per-window peaks. The existing offline
metric-window validator remains compatible with the unchanged legacy schema;
it does not yet validate/difference these additional vectors. Preserve original
sanitized pulses with the new fields alongside its validated legacy window.

## Files changed

| Path | Change |
| --- | --- |
| `apps/api/src/common/database/postgres-lifecycle-diagnostics.ts` | New phase/operation ownership, RTT and sanitized reset-reason bookkeeping |
| `apps/api/src/common/observability/database-operation-context.ts` | New fixed-category asynchronous HTTP context |
| `apps/api/src/common/database/bounded-postgres-pool.ts` | Initialize diagnostics, measure settled acquisitions and expose live state/observed peaks |
| `apps/api/src/common/database/bounded-postgres-query.ts` | Pass the client to query measurement |
| `apps/api/src/common/database/postgres-query-measurement.ts` | Add phase measurement alongside unchanged legacy categories |
| `apps/api/src/common/database/postgres-lease.ts` | Report ownership/reset/disposal events without changing release sequencing |
| `apps/api/src/common/observability/http-metrics.middleware.ts` | Establish fixed operation context before downstream middleware |
| `apps/api/src/common/observability/runtime-metrics-pulse.ts` | Emit identity and additional numeric vectors in existing pulses |
| `apps/api/test/database-operation-context.test.ts` | Category isolation, async overlap and metadata handling |
| `apps/api/test/postgres-control-stall.integration.test.ts` | Controlled real-PG four-client COMMIT stall, queued timeout, phase attribution and drain |
| `apps/api/test/postgres-reset-diagnostics.integration.test.ts` | Real reset rejection, lost response, disposal races and cancellation/recovery |
| `docs/reference/postgres-acquisition-release-remediation.md` | This report and exact QA handoff |

## Security and transactional invariant review

- Live authentication remains a database read; access expiry, real refresh
  rotation/replay revocation and MFA are unchanged. No authorization cache.
- Organization, Location, role, Shift and Guest scope predicates/locks remain
  unchanged. The new context is diagnostic only and is never authorization.
- No transaction boundary, required SERIALIZABLE isolation, retry policy,
  idempotency record, protected mutation, state transition, unique constraint,
  audit or outbox change. No retry of unknown COMMIT outcomes.
- Runtime TLS and least-privilege role policy remain unchanged. Disposable
  test tables/functions/grants exist only in test-owned databases and are removed
  by the owned harness. Production settings and Windows QA state were not changed.
- Bounded JPEG workers, byte verification, private storage, reservation and
  finalization/reconciliation remain unchanged.
- Original public exceptions/statuses, timers, rejection/release counters,
  server deadlines and disposal behavior remain. No failure suppression.

## Local verification

Isolated local PostgreSQL **17.11**, Node **24.19.0**, pnpm **10.34.5**.
Docker image ID:
`sha256:81edcaa5ff2923f7be9c1f43d3e5076f29c6c9c216c86964b5fd038959404429`.
PostgreSQL is published only on loopback for disposable test-owned databases;
no Windows QA snapshot was copied, migrated or benchmarked here.

Setup: `CI=true corepack pnpm install --frozen-lockfile`, then
`corepack pnpm --filter @valet/contracts build`. An initial offline install
failed because a locked tarball was not cached; the normal verified-TLS install
succeeded without lockfile changes. Native-script warnings did not prevent the
executed real-auth tests from passing. No script-approval policy was changed.

Run test selections from root with:

```sh
corepack pnpm --filter @valet/api exec node \
  ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  <test paths listed below>
```

Passed before the diagnostic patch: 5 files / 18 real-PG tests, using
`auth-reset-admission`, `pool-startup-burst`, `pool-occupancy`,
`guest-t3-lease-regression`, `guest-t3-protocol-timeout` integration suites.

Passed after the patch:

1. New controlled-fault suites: **2 files / 6 real-PG tests**. Deferred COMMIT
   locks were deliberately installed only in a disposable test table. Four
   clients wait in COMMIT >5s while a queued checkout expires at the unchanged
   2s budget; aggregate COMMIT RTT exceeds 20s, all four effects commit once,
   and occupancy drains completely. This is a mechanism/diagnostic test, not
   reproduction of the initiating Windows defect or a capacity comparison.
   Real aborted-transaction reset produces 25P02 and destroys once; lost reset
   response produces QUERY_TIMEOUT; forced disposal is separately visible;
   cancelled acquisition executes no application SQL; cancelled active work
   rolls back and replacement connections succeed.
2. Main regression selection: **19 files / 167 tests**, including **140 real-PG
   tests** and **27 non-PG tests**. Paths under `apps/api/test/`:

```text
database-operation-context.test.ts
performance-pool-diagnostics.test.ts
health-pool-attribution.test.ts
auth-reset-admission.integration.test.ts
pool-occupancy.integration.test.ts
pool-startup-burst.integration.test.ts
guest-t3-lease-regression.integration.test.ts
guest-t3-protocol-timeout.integration.test.ts
staff-context-lease.integration.test.ts
staff-auth.integration.test.ts
staff-auth-native.integration.test.ts
staff-auth-continuity.integration.test.ts
intake-session-command.integration.test.ts
intake-serialization-recovery.integration.test.ts
intake-operation-concurrency.integration.test.ts
intake-independent-concurrency.integration.test.ts
staff-operational-context.integration.test.ts
shift-eligibility.integration.test.ts
check-in-api.integration.test.ts
```

3. Diagnostic/architecture contracts: **6 files / 83 tests**, all passed:

```text
runtime-metric-window.test.ts
performance-request-diagnostics.test.ts
guest-t4-observability.test.ts
architecture-repository-files.test.ts
architecture-check.test.ts
architecture-line-policy.test.ts
```

4. Final security/fault selection: **6 files / 42 tests**, all passed:

```text
postgres.test.ts
production-database-safety.integration.test.ts
staff-mfa-security.integration.test.ts
guest-t3-transaction-metrics.integration.test.ts
postgres-control-stall.integration.test.ts
postgres-reset-diagnostics.integration.test.ts
```

The initial final-selection run exposed a race in the new cancellation fixture:
its query read timeout could expire just before the operation deadline. The
fixture now suspends application work inside the active transaction, leaving no
competing query timer. It requires the exact OPERATION_DEADLINE outcome, verifies
rollback and resumes/joins the original action. Runtime cancellation policy was
not changed. The complete six-file selection then passed.

In total, **31 distinct files / 292 distinct tests passed after the patch**:
**168 real-PostgreSQL tests and 124 non-PostgreSQL tests**. Repeated executions
of the same tests are not counted twice in this total. No skipped tests or
unhandled errors were reported by these passing selections. The deliberate
unsafe-role startup rejection emits SAFETY_PREFLIGHT as expected in its test.

API `typecheck`, `build`, `lint` and root `architecture:check` passed. Architecture
reports existing grandfathered file-size warnings; no new/modified code exceeds
300 physical lines. Changed-code and report Prettier checks and `git diff --check`
passed. Final Git identity is recorded below and in the delivered report copy.
No unrelated failing baseline assertion was changed, and no full project CI
cleanup was attempted.

## Capacity implications and remaining blockers

**No new 200-staff acceptance PASS, throughput improvement or production sizing
claim.** The supplied normal (24.39 RPS) and soak (29.04 RPS) results remain their
historical Windows QA observations. Busy (~47.37 RPS, 135 HTTP503, 191 native
acquisition timeouts) remains FAIL. Those snapshots/workloads cannot be compared
to tiny disposable regression databases as controlled before/after capacity.

The historical control stall and reset failure were not reproduced with an
established initiating cause. Missing failure-time backend waits and discarded
reset error attribution block an evidence-backed architectural remediation.
Storage/WAL stalls, server/driver transport delays and control-phase contention
remain hypotheses, not diagnoses. No code fix or numeric sizing option is
recommended on that evidence alone. A stalled read transaction is not grounds
to remove its authorization locks or transaction.

No separate physical Linux load-generator host is available in this execution
environment. Co-located containers do not satisfy that requirement. No mixed
JPEG/MinIO load, worker co-load, full-stack capacity or new soak was run. The
owner's Windows processes, `.env`, credential fixtures and storage were left
unchanged; no worker was started, particularly no FCM-enabled Staff push worker.

## Exact next QA action

1. Check out the pushed diagnostic branch SHA, build contracts/API and set
   `VAYLET_RELEASE_GIT_SHA` to that exact SHA. Preserve the existing isolated QA
   profile, eight-Location synthetic fixtures, real sessions, 4/128 limits and
   acquisition timeout. Record PID, `processStartedAtMs`, sample UTC times,
   source SHA, host/container resource limits, fixture/snapshot identity and
   distinct load-generator identity. Do not override the old SHA guards in the
   ignored Windows runner without reviewing its fixture/preflight provenance.
2. First reproduce with a small concurrent authorized task-queue/directory
   workload on isolated QA. Collect the new pulses and contemporaneous PG
   observations at 100–250ms intervals during the stall. Use a single bounded
   read-only inspection connection outside the application pool and account for
   it in the connection inventory. Do not enable server extensions or alter
   database settings. A safe aggregate observation query is:

```sql
SELECT clock_timestamp() AS sampled_at,
       CASE WHEN state = 'idle' THEN 'IDLE'
            WHEN state LIKE 'idle in transaction%' THEN 'IDLE_TRANSACTION'
            WHEN query ~* '^[[:space:]]*BEGIN([[:space:];]|$)' THEN 'BEGIN'
            WHEN query ~* '^[[:space:]]*COMMIT([[:space:];]|$)' THEN 'COMMIT'
            WHEN query ~* '^[[:space:]]*ROLLBACK([[:space:];]|$)' THEN 'ROLLBACK'
            WHEN query LIKE 'RESET statement_timeout;%' THEN 'RESET'
            ELSE 'WORK' END AS phase,
       wait_event_type, wait_event, count(*) AS connections,
       max(clock_timestamp() - xact_start) AS oldest_transaction,
       max(clock_timestamp() - query_start) AS oldest_query
FROM pg_stat_activity
WHERE datname = current_database() AND usename = :'runtime_role'
GROUP BY 2, 3, 4;
```

   Pass the already-attested isolated runtime role as a psql variable; never
   print role credentials, query text, SQL parameters, guest proofs or fixtures.
   Correlate COMMIT vs WAL/IO/Lock/Client waits and active transaction ages with
   operation occupancy and new reset-reason counters. An `idle` backend while a
   client reports COMMIT outstanding suggests a response-delivery/driver gap;
   it does not by itself prove its cause. Capture matched network/host evidence.
3. Stop if the bottleneck cannot be reproduced reliably. If reproduced, choose
   one fix supported by that observation, run the focused real-PG/security
   regressions, and preserve ambiguous mutation reconciliation. These diagnostics
   alone do not authorize a speculative reset/transaction rewrite.
4. After that actual fix passes correctness, prepare equivalent isolated DB
   snapshots and fixtures, host limits and source SHAs. From a separately
   identified physical Linux generator, run **200 naturally active Staff across
   eight Locations for five minutes**, with real JPEG/MinIO, Check-In, Parking,
   Guest retrieval and Handoff. Use genuine refresh rotation in the follow-up
   soak. Keep all rate/auth/MFA/idempotency protections and existing sampling.
5. Require zero unexpected HTTP5xx, acquisition timeouts, QUEUE_FULL and
   unexplained reset failures; all authorized workflows and independent
   DB/S3/audit/task/custody checks must pass. Measure total/successful RPS,
   p50/p95/p99, endpoint/cause failures, successful intakes, stored byte checks,
   API CPU/RAM/event loop and PG CPU/waits/IO. Require p95 <1000ms and
   p99 <2500ms. Reconcile every missing client outcome through its existing
   operation ID. On failure stop; no 250/300/Peak/Stress escalation.

## Delivery identity

This is a diagnostic handoff with the remediation blocker explicitly retained.
No PR, merge, deployment, production change or manual GitHub CI trigger.
The existing CI workflow runs only for main pushes or PRs targeting main, not
this dedicated branch. Verified implementation commit:
`ac3cc766dc7bc3e94e0bdec5cb4b234c11079960`. This final documentation clarification
does not change the tested code. The final response records the exact delivery
commit SHA, remote equality and clean-tree verification. A committed report cannot
contain its own content-addressed commit SHA. Read the report at its immutable
GitHub blob URL using that final delivery SHA.
