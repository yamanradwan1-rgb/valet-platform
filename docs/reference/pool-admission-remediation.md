# PostgreSQL pool admission investigation and remediation

Date: 2026-10-28. Branch: `fix/pool-admission-occupancy`.

## A. Executive verdict

**Multiple factors: a deliberate admission ceiling, confirmed avoidable lease
churn, and a confirmed diagnostic attribution gap.** The bounded pool behaved
as designed. Its four connections and 128 waiting admissions became the first
observable limiting resource at 200 VUs. This does not prove PostgreSQL itself
was exhausted, that four connections are the correct production sizing, or
that the changes below make 200 VUs safe.

The justified correction reuses one owned connection for operational-context
reads: five acquisitions become one and fifteen driver round trips become
seven for an active Shift. SQL, authorization predicates and response contracts
are unchanged. Private fixed-size measurements now separate native checkout,
lease setup, business query RTT, transaction control and reset, and identify
readiness failure reasons. Pool size, queue size and all deadlines are unchanged.
**200 VUs remains unapproved pending Antigravity's controlled retest.**

### Baseline and investigation scope

Fetched `origin/main`: `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8`.
Fetched Check-In branch: `d1c19b13d1fa456fabfe0ad074ec423e8d96ae6a`.
Their merge base is the main SHA; the Check-In branch contains main and two
additional commits, including implementation `3336c3a331b7b9d42d56f0f845dd954abe39709c`.
Main does not contain that fix. This work starts at **d1c19b13** in the isolated
`/workspace/work/vaylet-pool-admission` worktree. The owner worktree and earlier
performance/Check-In worktrees are preserved. No merge, deployment, PR or manual
CI trigger was performed.

Read root `AGENTS.md` (no nested applicable files), architecture/file-size rules,
engineering/security guidance, relevant accepted database/transaction decisions
and both earlier investigation reports. The pre-code determination was:
User/Membership/Organization/Location/Shift reads only; no ValetSession, Task or
Dispatch transition, schema/index/migration, Company/Location policy,
entitlement, role/MFA or UI change. Keep every modified authored code file below
300 lines. No security fence or command transaction may be removed.

### Evidence actually inspected

The connected Windows machine was available. Read the latest handoff, saved
100/200-VU metadata, PostgreSQL telemetry and selected orchestrator source at:

`D:\kndoom\vaylet test onely\tmp\vaylet-capacity-20261028\tmp\capacity-validation\working`

Private API logs stayed on that machine. A read-only local aggregation bounded
by the exact saved runtime-counter markers returned only three fixed counts:
110 STAFF_OPERATION 503, 67 HEALTH 503, 124 STAFF_OPERATION 499. No raw private
log lines, tokens, credentials or `.env` contents were copied or committed.
Read-only PostgreSQL settings and one scoped SELECT execution plan were also
inspected there. No Windows benchmark script or data was modified.

| Saved observation | 100 VUs | 200 VUs |
| --- | ---: | ---: |
| Result | PASS | FAIL, safety abort |
| Traffic duration | approximately 300s | 31.87s |
| Aggregate RPS | 246.11 | 269.81 |
| Unexpected HTTP failures | 0% | 2.0586% |
| p95 / p99 ms | 163.20 / 255.88 | 1015.02 / 1270.40 |
| Check-In | 1938/1938 | 201/201 |
| Admission rejections / acquisition timeouts | 0 / 0 | 177 / 0 |
| Acquisition counter delta | 143081 | 14417 |
| Acquisition elapsed-ms delta | 3696215 | 2694478 |
| Mean successful acquisition ms (includes setup) | 25.833 | 186.896 |
| Acquisitions over 200ms | 94 | 5357 |

Counter windows include stage orchestration/idle time: the 200-VU metadata
window is 135.13s, while actual traffic lasts 31.87s and periodic runtime samples
span about 150s. Do not divide all counters by traffic duration. The saved
successful operational RPS (40.01 at 200) uses wrapper duration, while aggregate
RPS uses traffic duration; these are not directly comparable. Preserve the
saved evidence and align windows in the next analysis. The hung Docker CLI's
termination status is not the original k6 exit status. Saved metrics and failed
thresholds independently prove failure.

## B. Root-cause matrix

Source paths below are relative to the repository; line numbers refer to this
branch. Earlier report: [backend pool investigation](backend-pool-performance-investigation.md).

| Hypothesis | Classification | Evidence and implication |
| --- | --- | --- |
| Local pool admission is first observed limit | CONFIRMED | `apps/api/src/common/database/bounded-postgres-pool.ts:121` rejects before native checkout at admitted >= max + waiters = 132. Saved max=4, waiters=128, 177 rejections. Those rejections establish the ceiling was reached even though periodic gauges missed the peak. |
| Admission algorithm is defective | RULED OUT for reproduced boundaries | Max=1/waiters=1 real-PG test admits two, rejects the third with QUEUE_FULL, removes/reclaims admissions and recovers; bounded behavior is intentional. |
| Unnecessary context lease churn | CONFIRMED; CONTRIBUTING mechanism | Original context factory used separate pool.query calls for User, memberships and 2/3 batched detail reads. Each general checkout configures and resets server budgets. Active-Shift regression observed five acquisitions; corrected code uses one. Historical contribution to time saturation is not quantified. |
| Missing readiness attribution | CONFIRMED defect | All 67 unidentified 503s are HEALTH. Original health routes were absent from fixed route diagnostics and isReady swallowed causes. New private attribution records each response without extra queries or public details. |
| Every one of 177 HTTP 503s has individually proven QUEUE_FULL cause | UNVERIFIED | 110 staff responses explicitly prove QUEUE_FULL. Readiness coalesces requests (`health-readiness.service.ts:84`); one failure can fan out. Matching rejection/response totals do not establish one-to-one causality. Original causes for those 67 cannot be reconstructed confidently. |
| PostgreSQL connection ceiling | RULED OUT as observed first limit | max_connections=100, superuser_reserved=3, reserved=0; telemetry max clients=5 including sampler, no connection/acquisition timeouts. Global production inventory remains incomplete. |
| Leaked connections caused the stage | UNVERIFIED historically; not reproduced | No monotonically leaked-admission proof in saved samples. Existing/new real-PG cleanup tests pass. One releaseFailures increment occurred during the 200 window, so do not claim error-free cleanup throughout the aborted stage. |
| Slow SQL, locks, long transactions dominate occupancy | UNVERIFIED | No sampled lock waits/timeouts, but periodic sampling cannot exclude short waits/serialization. Historical lease/query timings did not exist. One warm state-count plan is fast; that does not establish all route SQL is fast under load. |
| CPU/RAM/IO exhaustion | UNVERIFIED | Active-window PG container CPU max 208.32% (roughly two cores), memory 73.62MB, five clients; no reliable historical Windows API CPU/IO. Docker VM limits are not equivalent to a two-core DB limit. |
| Check-In retry defect regressed | RULED OUT in supplied stage and focused tests | 201/201 intake, no unexpected 409; previous bounded five-attempt jitter retry source is unchanged and regression suites pass. |
| Read polling competes with operational writes | CONTRIBUTING by design | Eight routes use the shared ordinary API pool; auth queries and bounded anti-abuse maintenance also consume it. No priority bypass or security cache was introduced. |
| 499s are independent committed/failed business outcomes | UNVERIFIED | 124 are disconnect records near safety abort. A disconnected mutation can still commit; retain outcome reconciliation/idempotency rather than invent successes or replay ambiguous writes. |

### Connection lifecycle, cleanup and contention

`runtime-database.module.ts:23` supplies the singleton ordinary API pool.
`runtime-postgres-policy.ts:35` validates bounds/capacity; native checkout is
followed by `configureGeneralLease` (`postgres-lease.ts:14`), which installs
server budgets in one driver query. Work follows, then an asynchronous reset
round trip before native release (`postgres-lease.ts:72`). Admission remains
occupied during configuration and reset. General pool.query therefore takes
three driver round trips for one business SQL call. Guest scoped leases skip
this general setup/reset and retain their separate strict budget policy.

`postgres-transaction.ts:13` owns BEGIN/action/COMMIT, rollback and release.
Failed rollback/ambiguous commit destroys the connection; it does not replay.
The lease watchdog, server statement/lock/idle/transaction limits and operation
expiry bound abandoned work. Late expired checkouts are discarded. Native
acquisition timeout removes pending waiters. Shutdown closes admissions and
forces disposal of held leases before ending the native pool.

There is no universal HTTP-disconnect-to-SQL cancellation contract. The HTTP
observer records 499 once; ordinary business writes may still finish. Existing
Guest operation deadlines destroy their owned clients; generic non-Guest
borrowers remain bounded by server and lease deadlines. Changing this behavior
would require command-aware outcome handling; this patch does not cancel or
replay possibly committed writes to improve benchmark numbers.

Anti-abuse maintenance (`modules/anti-abuse/anti-abuse-maintenance.ts:31,55`)
shares the pool, runs at 1Hz, allows one in-flight batch, and bounds cleanup
and backlog sampling. It can contribute occupancy, but the historical share
is unknown. Removing it or its persistence would weaken security accounting.

### Eight operation paths and measured small-fixture costs

The new `pool-route-cost.integration.test.ts` runs each service path once on
synthetic data in an owned PostgreSQL 17 database. One authorized location,
one active employee Shift, manager Dashboard access, one temporary-descriptor
intake, no customer/notification issuance, and no tasks are seeded. This excludes
HTTP/auth middleware, background jobs and real benchmark dataset growth.
All paths acquired exactly one business lease. RTT is driver/network/server
elapsed time, **not server-only SQL execution time**. No latency threshold is
asserted or capacity inferred from these single cold/warm mixed samples.

| Operation | Work SQL / BEGIN+COMMIT calls | Summed work RTT ms | Completed lease ms | Source entry (`apps/api/src/modules/`) |
| --- | ---: | ---: | ---: | --- |
| State counts | 6 / 2 | 20.185 | 22.842 | `dashboard/overview-sessions-query.ts:213` |
| Sessions | 6 / 2 | 9.964 | 12.975 | `dashboard/overview-sessions-query.ts:79` |
| Tasks | 6 / 2 | 8.922 | 11.987 | `dashboard/overview-retrieval-tasks-query.ts:45` |
| Active Shifts | 6 / 2 | 7.473 | 10.336 | `dashboard/overview-shifts-keys-incidents-query.ts:34` |
| Operational context | 5 / 0 | 4.181 | 5.759 | `staff/staff-operational-context-query.ts:30` |
| Task queue | 4 / 2 | 7.460 | 9.789 | `dispatch/task-queue-query.ts:118` |
| Vehicle directory | 10 / 2 | 10.977 | 14.261 | `staff/staff-vehicle-directory.service.ts:56` |
| Intake | 13 / 2 | 18.734 | 23.743 | `valet-sessions/intake-session-command.ts:57` |

Every row additionally issues one setup and one reset driver call. The separate
staff-session resolver (`auth/staff-session-context.ts:54`) adds one checkout
and one work query (three RTTs) to an ordinary authenticated HTTP request.
Counts vary with role, MFA, capability, results, customer issuance and retries.
Do not treat this table as all possible branches or production query latency.

Dashboard's two authorization reads around the shared org advisory fence are
intentional (`dashboard/dashboard-read-authorization.ts:45-93`): the second
read must observe a concurrent grant revocation after lock acquisition. Keep
READ COMMITTED, the entitlement checks, session revalidation and Company Admin
MFA path. Counts include those controls. Task queue/directory retain active
Shift eligibility locks. Directory projections are already bulk-loaded; no
new N+1 correction was justified. Intake's SERIALIZABLE transaction, per-operation
advisory lock, uniqueness, audit/outbox and five-attempt retry remain intact.

Relevant existing indexes include `valet_sessions_location_id_state_idx`,
`tasks_location_id_status_created_at_id_idx`, `shifts_location_id_status_idx`,
active-Shift membership uniqueness, tenant/grant keys and active custody unique
constraints (`packages/database/prisma/schema.prisma:991,1188,1296`).
Windows EXPLAIN ANALYZE BUFFERS for the exact organization/location scoped
state-count SELECT (`overview-sessions-query.ts:223`) showed Aggregate/Seq Scan
of 2614 sessions, planning 2.408ms, execution 1.157ms, 98 total shared hits and
zero physical reads. This was one idle warm admin-role sample; no IDs/parameters
were returned. No pg_stat_statements extension was available. Other query plans,
per-statement server timings and lock/IO behavior under load remain unverified;
request sampled plans under equivalent runtime-role/fixture conditions if the
new RTT/lease evidence points there. No speculative index/migration was added.

## C. Pool configuration and aggregate budget

| Setting | Observed Windows / current source | Proposed for first retest |
| --- | --- | --- |
| DATABASE_POOL_MAX | 4 (confirmed saved metadata) | 4, unchanged |
| DATABASE_POOL_MAX_WAITERS | 128 (confirmed saved metadata) | 128, unchanged |
| Admission ceiling | max + waiters = 132 local operations | unchanged |
| Native acquire and remaining configuration budget | 2000ms | unchanged |
| Idle connections / idle expiry / lifetime | min=0 / 30000ms / native default lifetime=0 | unchanged |
| General lock / statement / lease transaction / idle transaction defaults | 5000 / 15000 / 30000 / 10000ms outside production | unchanged; preserve actual stage overrides |
| Guest lock / statement / transaction / operation | 2000 / 3000 / 5000 / 6000ms | unchanged |
| Absolute source bounds | max<=100; waiters<=1024 | unchanged |

Production requires explicit max, allowed/reserved connections, maximum API
instances and general deadlines (`runtime-postgres-policy.ts:43-50`). Its
per-process envelope guard is not a complete fleet/worker resource inventory.

Each API replica has its ordinary pool. Staff-push, guest-push, outbound sender
and condition-photo-maintenance entries each create their own runtime pool.
An enabled Meta webhook receiver has another restricted pool in the API
process (`notifications/webhooks/meta-webhook-database.ts:23`). The worker and
webhook principals remain distinct. Count every replica of each process:

`total = API_instances*API_max + webhook_instances*webhook_max + sum(worker_instances*worker_max) + other_clients + admin/migration reserve`.

Observed test DB ceiling=100, non-superuser slots=97. Five sampled clients are
consistent with four API connections plus the sampler; this is not a proof of
all possible processes. A current read-only process-name check found none of
the four named worker entrypoints running, seven other Node processes, and
only the read-only inspection backend in pg_stat_activity. Current snapshots
cannot establish historical or production process counts. For illustration,
one API + each of four workers + one webhook, all max=4, reserves **24** client
connections before other clients/admin/migrations, not four. Do not deploy that
illustration as a verified production inventory.

DB settings: shared_buffers=128MB, work_mem=4MB, default isolation READ COMMITTED;
max_connections=100/reserved_connections=0/superuser_reserved_connections=3.
The DB container itself has no explicit CPU/memory limits; outer Docker Desktop
resources constrain it. Connection slots alone do not prove CPU, memory, IO or
query-parallelism headroom. **No pool or waiter increase is justified yet.**
If admission still fails after this code-only comparison, first collect full
process budgets, DB/API CPU/RSS/IO, active queries/locks and new lease counters.
Then select one bounded pool-size experiment fitting that total envelope;
keep waiters fixed and compare under identical resources. No automatic 16/512
recommendation, production change or capacity promise is made here.

## D. Implementation and changed files

All paths below are relative to `apps/api/` unless shown otherwise.

| File | Reason |
| --- | --- |
| `src/modules/staff/staff-operational-context-query.ts` | Own one lease for unchanged sequential reads; release before response projection; discard on query failure. |
| `src/modules/staff/staff-operational-context-details.ts` | Accept the query interface so the same SQL works with an owned client. |
| `src/common/database/bounded-postgres-pool.ts` | Numeric native checkout attempts/time and admission/waiting high-water marks; initialize fixed measurement storage. |
| `src/common/database/postgres-lease.ts` | Measure completed lease time/histogram at the existing once-only finish boundary. |
| `src/common/database/postgres-query-measurement.ts` | New fixed four-category query-count/RTT helper; no SQL/parameters exported. |
| `src/common/database/bounded-postgres-query.ts` | Observe Promise/callback/synchronous completion without changing timeout policy or failure outcomes. |
| `src/common/observability/runtime-metrics-pulse.ts` | Expose fixed private numeric measurements in existing 30-second pulse. |
| `src/common/database/database-failure-reason.ts` | Type the existing allowlisted classifier so readiness retains known causes. |
| `src/common/database/runtime-database-deadline.ts` | Extend internal reason union for already-classified PostgreSQL causes; no deadline changes. |
| `src/common/database/runtime-database-readiness.ts` | Preserve allowlisted failure reason through generic readiness error wrapping. |
| `src/common/observability/performance-request-diagnostics.ts` | Allowlist health templates and fixed infrastructure reasons. |
| `src/health/health-readiness.service.ts` | Record per-request failure cause while preserving shared checks and 128-waiter cap. |
| `src/health/health.controller.ts` | Pass request solely for private diagnostic correlation; public readiness body/status unchanged. |
| `src/health/application-drain-middleware.ts` | Attribute existing drain rejection privately. |
| `test/staff-context-lease.integration.test.ts` | Single-acquisition regression, revoked grant, failed-query disposal and recovery. |
| `test/staff-operational-context-batching.integration.test.ts` | Retain five work SQL/multi-tenant batching check through the new owned lease. |
| `test/health-pool-attribution.test.ts` | Coalesced response attribution, error reasons, privacy, drain and bounded waiter recovery. |
| `test/pool-occupancy.integration.test.ts` | Actual queue boundary, separate pool isolation, recovery and once-only Promise/callback/transaction measurements. |
| `test/pool-route-cost.integration.test.ts` | Small eight-path synthetic service cost probe; no load generation or credentials logged. |
| `docs/reference/pool-admission-remediation.md` | This evidence, pre-code scope, verification and retest handoff. |

Before: active-Shift context acquires five leases, 5 work + 5 setup + 5 reset
calls. After: 1 lease, 5 work + 1 setup + 1 reset. No BEGIN or lock is introduced;
per-statement READ COMMITTED snapshots remain. A statement failure still
discards the connection, as native pool.query did. Denial releases normally.
The shared general lease watchdog now covers the whole read; no individual
statement or operation budget is extended.

Before: HEALTH 503 had no fixed route/reason suffix. After: public
`503 {status:"unavailable"}` stays identical while private logs identify
QUEUE_FULL, ACQUISITION_TIMEOUT, CONNECT_ERROR (the connection-failure label),
QUERY_TIMEOUT, LOCK_TIMEOUT, STATEMENT_TIMEOUT/QUERY_CANCELED,
TRANSACTION_TIMEOUT/IDLE_TRANSACTION_TIMEOUT, or an allowlisted infrastructure
reason. CLIENT_DISCONNECT is separate from application failures. Unknown
failures remain generic; causes are never guessed from private text.

Measurement semantics: query arrays are ordered **setup, work, transaction
control, reset** and contain started-call counts and completed elapsed-ms sums.
RTT includes client/network/server time; failed calls contribute their elapsed
time. Lease duration starts after native checkout and includes setup, callback,
queries and reset through disposal/release. Lease buckets are noncumulative
<=5/25/100/500/1000/5000ms/overflow. Native acquisition includes queue/connect
attempts, including failures; successful acquisitionMs additionally includes
setup. Use nativeAcquisitionAttempts as native denominator. Query/lease sums
can cross interval boundaries; compare sufficiently long aligned windows and
capture both boundaries. High-water marks are process-lifetime values, not
subtractive interval counters. Existing failure counters can overlap and must
not be summed as unique request counts. Query-stream/custom non-Promise,
non-callback APIs are not used by these application paths and do not have
completion RTT tracking. Counters contain no SQL, parameters or dynamic labels.

## E. Verification

All PostgreSQL execution used a new loopback-only PostgreSQL 17 Docker instance
`vaylet-pool-admission-pg17`, port 55434, tmpfs storage, synthetic `valet`
database, max_connections=100. Existing harness ownership, role provisioning,
resource profiles and cleanup remain unchanged. Final read-only checks found
zero active owned clients and zero remaining ShiftTestContext fixture databases.
The task-owned test container was stopped after verification. No production/shared database
was written and no capacity stress test was run.

### Before/after regressions

- Original d1c19b13 context implementation: regression **FAIL**, expected one
  connect but observed five (1 failed / 1 passed in the initial two-case file).
  Same acquisition assertion passes after the change; final expanded file has
  three passing cases, including query-error disposal and revoked access.
- Original readiness implementation: coalesced-503 diagnostic regression
  **FAIL** because `route=/health/ready` and `reason=QUEUE_FULL` were missing.
  Same response/privacy/coalescing assertion passes afterward; expanded tests
  cover the other bounded causes and readiness waiter ceiling.
- During test development, the failed-query test initially assumed all idle
  connections disappeared from a multi-connection fixture. Corrected it to use
  max=1 and verify the failed connection is destroyed. A separate-pool test
  initially exceeded the standard fixture's two-pool cap; it now genuinely runs
  concurrent pool probes and is classified into the existing race profile,
  without any harness/budget changes. A parallel invocation was correctly
  refused by cluster ownership; suites were rerun sequentially. These were
  fixture/invocation failures, not passing application results.

### Commands and results

Commands run from repository root. `corepack pnpm` resolves pnpm 10.34.5.
Environment for PostgreSQL commands: `TEST_DATABASE_URL=postgresql://valet:valet@127.0.0.1:55434/valet`.
The test harness creates only its owned databases/roles. Environment PATH and
Corepack cache overrides were local tooling setup, not application changes.

```sh
corepack pnpm --filter @valet/contracts build
# PASS
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/health-pool-attribution.test.ts test/guest-t4-health.test.ts \
 test/guest-t4-observability.test.ts test/performance-pool-diagnostics.test.ts \
 test/performance-request-diagnostics.test.ts
# PASS: 5 files / 37 tests
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/staff-context-lease.integration.test.ts test/staff-operational-context-batching.integration.test.ts \
 test/staff-operational-context.integration.test.ts test/pool-route-cost.integration.test.ts
# PASS: 4 files / 19 tests
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/pool-occupancy.integration.test.ts test/guest-t3-runtime-resilience.integration.test.ts \
 test/guest-t3-lease-regression.integration.test.ts test/pool-route-cost.integration.test.ts
# PASS: race 3 files / 23 tests; standard 1 file / 1 test
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/intake-serialization-retry.test.ts test/intake-independent-concurrency.integration.test.ts \
 test/intake-operation-concurrency.integration.test.ts test/intake-serialization-recovery.integration.test.ts \
 test/intake-session-command.integration.test.ts test/staff-auth.integration.test.ts \
 test/staff-auth-continuity.integration.test.ts test/staff-mfa-assurance.integration.test.ts \
 test/staff-task-queue-authorization.integration.test.ts test/staff-vehicle-directory.integration.test.ts \
 test/dashboard-overview-authz.integration.test.ts test/dashboard-read-revocation-fence.test.ts \
 test/shift-eligibility.integration.test.ts
# PASS: non-PG 2 files / 15 tests; race 6 files / 62 tests; standard 5 files / 31 tests
# Total: 13 files / 108 tests
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/postgres.test.ts test/guest-push-worker-principal.test.ts \
 test/architecture-check.test.ts test/architecture-line-policy.test.ts \
 test/architecture-repository-files.test.ts test/mfa-assurance-policy.test.ts
# PASS: 6 files / 71 tests
node --test scripts/test-harness/api-compound-ownership.test.mjs
# PASS: 2 tests (existing harness unchanged)
corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm architecture:check
# PASS; architecture emits only existing grandfathered warnings
```

After the final native-attempt counter addition, reran the following exact
selection through the same owned harness:

```sh
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/health-pool-attribution.test.ts test/guest-t4-health.test.ts \
 test/guest-t4-observability.test.ts test/performance-pool-diagnostics.test.ts \
 test/performance-request-diagnostics.test.ts test/pool-occupancy.integration.test.ts \
 test/staff-context-lease.integration.test.ts test/staff-operational-context-batching.integration.test.ts \
 test/staff-operational-context.integration.test.ts
# PASS: 5 non-PG files / 37 tests; 1 race file / 2 tests; 3 standard files / 18 tests
```

Unique final verification coverage: **31 Vitest files / 258 tests PASS**, plus
**2 existing harness ownership tests PASS**; repeated tests are not double-counted.
API typecheck, lint, build and architecture were rerun after the final code
change and passed. Architecture reports only existing grandfathered warnings;
every changed code file is <=300 lines. Changed-file Prettier check and
`git diff --check` passed. Formatting command after staging the reviewed files:

```sh
git diff --cached --name-only -z | xargs -0 corepack pnpm exec prettier --check
git diff --cached --check
```

These focused suites cover pool boundary/waiter rejection, acquisition timeout,
failed server preflight, failed rollback/socket loss, Promise/callback leases,
expiry/cancellation/abandonment, duplicate release, shutdown/reset response loss,
separate pool isolation and recovery. HTTP disconnect is explicitly tested in
`guest-t4-observability.test.ts`; it remains an observation, not a new mutation
cancellation policy. Full API/e2e and capacity suites were intentionally not run.

## F. Security and integrity

No authentication or MFA logic, token lifetime, session rotation/revocation,
entitlement, tenant/location predicates, Shift eligibility rules or public API
DTOs changed. Context uses the same persisted organization/membership pairs,
retains fail-closed revoked-Shift projection, and releases before JavaScript
response projection. No security result is cached. Dashboard revocation fences
and transaction scopes remain intact. Worker isolation is tested with an
independent pool; real restricted-principal policy remains separately tested.

The complete Check-In command and retry implementation are byte-for-byte
unchanged from d1c19b13. Its five bounded attempts, release before jitter,
re-authorization each attempt, SERIALIZABLE consistency, idempotency keys,
active vehicle uniqueness, audit/outbox atomicity and no replay of ambiguous
commits are preserved. Existing real-PG tests assert one result for duplicate
operations, genuine conflicts for competing vehicles, exactly one committed
audit/outbox after aborted attempts, and zero effects after exhausted retries.
No failed operation is relabeled successful. Windows post-stage integrity was
already clean; focused concurrency tests verify their own synthetic invariants
and do not establish production-wide correctness.

## G. Performance expectations and Antigravity handoff

**Measured:** active-Shift context uses 1 acquisition rather than 5 and 7 driver
calls rather than 15; focused real-PG probes and cleanup assertions pass.
**Expected, unproven at load:** reduced setup/reset work and re-admission churn
should reduce total connection occupancy/queue pressure. One context holds its
lease across the five statements instead of giving other callers a turn between
each; fairness and tail-latency effects require the retest. A small single-path
service probe is not a throughput benchmark.

The saved successful 100-VU stage had 7668 context requests. If all take the
active-Shift branch, 4 fewer acquisitions each removes 30672 from 143081
historical acquisitions, approximately **21.4% fewer acquisitions** for that
unchanged request trace. This is a counterfactual workload calculation, not a
measured RPS, latency, pool-pressure or VU improvement. Do not extrapolate it
linearly to capacity. PostgreSQL/query CPU, auth, read lock contention or other
queues may become limiting next.

Continue with the existing fixtures/artifacts; do not recreate the investigation
or delete prior evidence. First validate this branch includes the Check-In fix
and log its exact release SHA. Keep max=4/waiters=128 and actual deadlines,
resources, PG settings, process counts, dataset/cardinality, API-only workload
mix, staff sessions, authentication and stage duration equivalent for the
code-only comparison. Windows and historical Linux VPS figures remain separate.
A full-stack VPS validation must include Dashboard/Valet/Customer processes,
workers/infrastructure and their total resource budget; it is another controlled
profile, not an equivalent Windows before/after comparison.

Retest progressively: **5-VU smoke if needed → 50 → 100 → 200 → 250 → 300 →
higher only after every prior gate passes → 30-minute soak at the highest agreed
stable load.** Stop at the first correctness or required gate failure:

- Successful legitimate Check-Ins **>=99.5%**.
- Unexpected HTTP failures **<0.5%**.
- **p95 <1000ms; p99 <2500ms**.
- No unexplained authentication failures or token-refresh replay failures.
- No database integrity violations.
- No unexplained 409/401/429/503 spikes.

Use real 15-minute access-token expiry and coordinated refresh during the soak;
never extend access-token lifetime to bypass authentication behavior. Check
zero sessions without location, duplicate active key/parking assignments and
orphan tasks; also reconcile idempotency/audits/outbox and ambiguous/disconnected
mutation outcomes. Keep independent per-VU staff sessions and valid permissions.

Capture precise traffic and counter windows with a final post-drain snapshot.
Separate aggregate RPS and successful operational RPS with the **same duration**;
report aborted-stage 499s/outcomes separately. Preserve original k6 summary,
threshold verdict and original exit status independently of Docker CLI cleanup.
Capture per-route HTTP reason counts including health, raw numeric metric pulses
privately, API/each worker CPU/RSS/event-loop lag, DB CPU/memory/IO/connections,
active transactions/locks and process inventory. Compare delta acquisitions,
native attempts/time, lease completions/ms/buckets and setup/work/control/reset
RTTs, alongside lifetime peaks and instantaneous admitted/waiting gauges.

One shared readiness failure can produce several HTTP 503s: correlate counter
windows and route reasons without equating response counts to acquisitions.
If pressure persists, determine whether checkout, setup/reset, SQL, idle callback
time, lock duration or process scheduling dominates before considering pool
sizing. Workers using the pool factory have in-memory counters, but do not all
instantiate the API's pulse service; collect worker/PG telemetry explicitly.

## H. Remaining risks and limitations

Historical lease/statement distributions, individual causes for the 67 health
503s, complete fleet process counts and load-time API/IO profiles remain missing.
A single warm SQL plan cannot rule out scans on a growing fixture. One observed
reset failure deserves monitoring. No general disconnect cancellation change
was made. Diagnostic elapsed times include client scheduling; they are not
pure PostgreSQL executor time or exact transaction-duration histograms. Interval
edges/in-flight calls need careful accounting. Fixed numeric measurement adds
small unbenchmarked per-query clock/counter overhead and Promise completion work.

This targeted correction removes demonstrated redundant work and closes the
attribution gap. It does not prove the 200-VU admission bottleneck is fully
resolved or authorize 250/300 VUs without gates. No production pool sizing,
capacity gain, absence of all leaks, or before/after load improvement is claimed.

## I. Git delivery

Dedicated branch `fix/pool-admission-occupancy`, based on d1c19b13, includes the
unchanged Check-In fix. The implementation/report commits and verified remote
HEAD are supplied in the delivery message. The final report commit cannot
contain its own SHA; the immutable GitHub report link pins that exact revision.
Main, unrelated branches and owner worktrees remain unchanged. No merge or
deployment is part of this delivery.
