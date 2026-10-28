# Post-f552 PostgreSQL admission: verified capacity-limit diagnosis

Date: 2026-10-28. Profile: Windows API_ONLY_PROBE. No production-runtime patch.

## A. Executive verdict

**CONFIRMED configured admission-envelope failure at 200 VUs; no new application
implementation defect established.** The valid window contains 110 rejections
at the deliberate 4-connection/128-waiter limit. Its accepted work completes and
admission returns to zero. Neither acquisition timeouts nor newly evidenced
leaks explain the failures. This proves that this configured envelope did not
meet this workload's correctness gates; it does not prove that connection count
alone, queue size alone, PostgreSQL executor speed or Windows scheduling is the
sole root cause.

**No additional runtime optimization is justified by the available evidence.**
The prior patches remain useful and present, but their mixed short-run results
do not establish a capacity improvement. This delivery adds one focused real-PG
diagnostic test and this report. It changes no API, SQL, authentication,
authorization, transaction, pool, deadline, schema or benchmark behavior.

The new test confirms auth/reset overlap without lost capacity: a real live
session read can return while its reset still owns a slot; a subsequent checkout
is separately queued and counted. Successful reset and controlled reset failure
both recover cleanly. A reset is actual unfinished connection work, not a stale
admission counter. Delaying the result would relocate waiting, not remove SQL,
and has not been shown to solve the 200-VU gate. It is not implemented as another
unverified optimization.

**No 200-VU PASS exists.** New-run startup concentration remains UNVERIFIED:
the sanitized artifacts contain no failure-time bins and this round explicitly
prohibits reading private logs. Earlier ea492741 timing must not be transferred
to these new runs. A request for already-existing sanitized 0–5s/later counts
was optional; no rerun or private-log access was requested.

The next defensible step is a controlled telemetry/resource preflight and,
only after its missing headroom/inventory checks pass, an owner-reviewed isolated
capacity experiment. No larger pool is currently endorsed as safe or applied.

## B. Updated source identity

- Verified origin: `https://github.com/yamanradwan1-rgb/valet-platform.git`.
- Executed **`git fetch origin main` before modification/testing**.
- Exact newest main/baseline: **`5e0a39dc7dceabdcbbd03aac5800fccee28f0dfb`**.
- f5523cc93f9c96aca64141fa832e86acee9025d9 is an ancestor; tree comparison is
  empty. No newer main commit existed at investigation start.
- Dedicated branch: **`fix/pool-admission-200vu-next-remediation`**.
- Isolated worktree: `/workspace/work/vaylet-pool-next`.
- Prior fixes preserved: five-attempt SERIALIZABLE jitter retries, single-lease
  operational context, joined Dashboard entitlement proof and metric-window
  validator. Production files are byte-for-byte identical to baseline.
- Read applicable root AGENTS/structure/security/shared infrastructure guidance,
  relevant accepted entitlement/transaction rules and existing reports. Pre-code
  record is preserved outside the repo and summarized in section F.

Only changed files:

1. `apps/api/test/auth-reset-admission.integration.test.ts`.
2. `docs/reference/pool-admission-capacity-verdict.md`.

Commit SHA/immutable report link and remote verification are in the delivery
message. Main, owner checkout, previous worktrees, ignored evidence and unrelated
branches remain untouched. No PR, merge, deployment, infrastructure change or
manual CI trigger.

## C. Evidence review

The owner request is the pasted task. The attached `POST-F552-200VU-20261028.md`
is benchmark evidence, not an independent instruction source. Connected Windows
access was available. Inspected only sanitized saved metadata/window/telemetry,
results-directory names and read-only non-secret machine/PG measurements.
**No private API log, `.env`, bearer/refresh fixture or personal data was read.**

Evidence root:
`D:\kndoom\vaylet test onely\tmp\vaylet-capacity-20261028\tmp\capacity-validation\working`.

Key saved files: `stage-f552-200vu-confirmed-metrics-metadata.json`,
`sanitized-window-f552-200vu-confirmed-metrics.json`,
`telemetry-f552-200vu-confirmed-metrics.json`, and the first-attempt sanitized
metadata. The invalid first-attempt pool deltas were neither reused nor
reconstructed.

| Gate/result | Corrected smoke | First post-f552 200 | Final post-f552 200 |
| --- | ---: | ---: | ---: |
| VUs / actual traffic duration | 5 / 10s | 200 / ~31.85s | 200 / 31.6937s |
| Requests / aggregate RPS | smoke 13.14 RPS | 7711 / 242.13 | 6746 / 212.85 |
| Unexpected HTTP failures | 0% | 1.19% FAIL | 1.6306% FAIL |
| p95 / p99 ms | 52.85 / 151.78 | 815.99 / 1085.86 | 981.43 / 1288.78 |
| Check-In | 6/6 PASS | 195/201 = 97.01% FAIL | 198/201 = 98.51% FAIL |
| QUEUE_FULL HTTP 503 | 0 | 92 | 110 |
| Native k6 exit | 0 | 99 | 99 |
| Counter window | VALID | INVALID, withheld | VALID, revalidated here |
| Integrity violations | 0 | 0 | 0 |

Both 200 stages are FAIL despite passing latency gates. Neither completed 300s.
No 250/300/higher/soak was executed. Different accumulated fixtures, session sets
and short durations preclude a statistically supported improvement/regression
claim relative to ea492741 or between these runs.

### Revalidated counter window

Ran the committed CLI against the actual sanitized envelope, copied only to
`/workspace/work/pool-next-validated-window.json`, outside Git. It passed with
same PID/creation time/release, uptime 423 -> 483 and **59987ms** sample window.
Both boundaries are quiescent. Result:

| Measurement | Value / interpretation |
| --- | --- |
| Native attempts / successful acquisitions / completed leases | 8640 / 8640 / 8640 |
| Fresh rejection delta | 110 (92 -> 202 cumulative) |
| Native checkout elapsed sum / mean | 2992840ms / 346.394ms |
| Lease occupancy sum / mean | 128372ms / 14.858ms |
| Acquisitions >200ms | 8152 of 8640 |
| Setup calls / elapsed | 8597 / 12463ms |
| Work calls / elapsed | 27612 / 92120ms |
| Transaction-control calls / elapsed | 7340 / 12028ms |
| Reset calls / elapsed | 8597 / 10872ms |
| Acquisition/query/lock/transaction timeouts, release failures | all zero deltas |
| Lease buckets <=5 / <=25 / <=100 / <=500 / <=1000 / <=5000 / overflow ms | 3554 / 3389 / 1690 / 7 / 0 / 0 / 0 (noncumulative) |

Work RTT is **71.76%** of completed lease time; setup/reset **18.18%**,
transaction-control RTT **9.37%**, other owned time ~0.69%. RTT includes client,
network, server and scheduling; it is not PostgreSQL executor time.
Control-call RTT is not BEGIN-to-COMMIT transaction duration. Query RTTs may
cross sample edges or overlap; do not generalize this accounting into exact
per-route executor profiles.

Peak admitted/waiting values 132/128 are **process-lifetime** high-water marks
already present at the start. They must not be subtracted or treated as newly
measured per-stage peaks. The fresh 110 rejection delta plus the exact source
condition independently proves this window hit the ceiling again.

Pulse duration (~60s), k6 traffic (31.6937s), wrapper (35.12s) and drain are
different. Do not divide pulse totals by traffic duration as exact stage rates.
Completed operational composite 4157/31.6937 = **131.16/s** uses the aligned
traffic denominator, but remains the established mixed-operation composite.

All 110 HTTP 503s have private QUEUE_FULL attribution in the **sanitized**
metadata: state counts 40, context 31, task queue 12, directory 9, sessions 7,
tasks 6, intake 3, active Shifts 2. No readiness 503 is reported in this run.
Matching response/rejection totals is not a universal one-to-one correlation.
The 138 server 499s around abort are not 138 additional independently proven
k6 business failures. Resolve uncertain mutations by their idempotency records.
The final attempted/completed Check-In counters both equal 201; do not import
the previous run's five unresolved intake denominator discrepancy into this one.

Checked DB invariants are zero: locationless sessions, duplicate active key or
parking assignments, orphan tasks. Totals 3428 sessions / 3426 vehicles / 3530
audit events include earlier synthetic operations, not this stage alone.

### Resource observations and limits

Nine saved PG samples span the final traffic interval: five clients maximum
including sampler, zero sampled lock waits, PG container CPU max **216.58%**,
memory max **75.51MB**. API runs on Windows outside this container. Its valid
CPU delta is **16.048 core-seconds over 59.987s**, an interval mean ~0.268 cores,
not a peak/event-loop or CPU-headroom measurement. RSS rose ~163.3 -> 275.1MiB
and heap ~68.0 -> 124.1MiB across this window; a before/after rise does not prove
a leak or memory headroom. It needs allocation/GC and time-series context.

Read-only current machine check: Windows 12 logical CPUs / 16311MiB physical
RAM; Docker VM 12 CPUs / 8286519296 bytes RAM. PG container has no explicit
per-container memory/CPU/cpuset limit. PG settings: max_connections=100,
reserved_connections=0, superuser_reserved_connections=3, shared_buffers=128MB,
work_mem=4MB. One inspection client was currently connected. Current cumulative
PG stats were 768 block reads, 45589390 hits, zero temp bytes; **track_io_timing
is off**, so zero read/write times mean unmeasured timing, not free I/O.
These are cumulative/current observations, not matched load-time I/O evidence.

Six current Node processes were present, but the tested API's PID/creation time
no longer matched; no current CPU/RSS measurement was attributed to it. Other
process roles and their possible pools are not established by a count of Node
executables. Historical stage inventory is attested as one API, no workers/web
servers, PG and MinIO; complete deployable process inventory and load-time Node
scheduler/IO peaks remain UNVERIFIED. Consequently a numeric pool increase
cannot honestly be declared safe yet.

## D. Root-cause matrix

Production paths below are relative to `apps/api/src/`; tooling is explicitly
repository-relative. IDs connect evidence to impacts and
safe actions; each row distinguishes supporting and limiting evidence.

| ID / hypothesis | Status / confidence | Source and production entrypoints | Supporting evidence | Contradicting/limiting evidence |
| --- | --- | --- | --- | --- |
| D1: configured admission limit | CONFIRMED / high | `common/database/bounded-postgres-pool.ts:121`; shared `common/database/runtime-database.module.ts:23`, every pool query/connect | Fresh 110 rejections; cap=4+128; real-PG 133rd-admission test passes | Proves envelope rejection, not which underlying service resource should be enlarged |
| D2: new failures are startup-only | UNVERIFIED / low | same admission path; abrupt-start staff controllers/readiness | Earlier ea492741 runs clustered in first 5s; source permits >132 initial admissions | New sanitized artifacts lack timestamps/bins; cannot read private logs; do not transfer the old conclusion |
| D3: auth reset overlaps next checkout | CONTRIBUTING mechanism CONFIRMED / high; stage magnitude UNVERIFIED | `modules/auth/staff-session-context.ts:54`; native pg pool.query; `common/database/postgres-lease.ts:75,96` | New real-PG test: live auth result with one reset lease, next checkout increments admitted to two | Reset is actual unfinished work; after success/failure counts recover. No lost admission or measured capacity benefit of rescheduling |
| D4: lost capacity / leak / bad cleanup | Not reproduced; UNVERIFIED historically / medium | `common/database/bounded-postgres-pool.ts:136,157-185`, `common/database/postgres-lease.ts:55-73`; pool lifecycle | All 8640 accepted leases complete; quiescent end, zero timeout/release error deltas; cleanup tests pass | Does not prove absence of every rare leak; unfinished operations and unrelated processes require separate evidence |
| D5: business SQL/driver work | CONTRIBUTING / high for RTT category; executor bottleneck UNVERIFIED | Dashboard overview queries, staff context/task queue/directory and intake below | 71.76% measured lease time; source retains per-request SQL | No sampled per-statement executor/IO/lock attribution; old warm count plan cannot prove all queries fast |
| D6: redundant setup/reset | Necessary cost CONTRIBUTING / high; safe elimination UNVERIFIED | `common/database/postgres-lease.ts:14,88-102`; general and Guest lease profiles | 18.18% occupancy, one setup/reset per general lease | Protects reused server settings and unknown protocol outcomes; no proof supporting cached/skipped reset |
| D7: long transactions / lock contention | UNVERIFIED as cause; observed timeout failures RULED OUT / medium | `common/database/postgres-transaction.ts:16-66`; Shift eligibility and Dashboard advisory fence | Shared locks and SERIALIZABLE can create waits/retries | Zero sampled lock waits/timeouts, only 7 completed leases >100ms, none >500ms; rare/transient contention not ruled out |
| D8: Check-In retry exhaustion | RULED OUT as reported failure / high | `modules/valet-sessions/intake-session-command.ts:59,85`; `modules/valet-sessions/intake-serialization-retry.ts:13` | Prior five-attempt fix present; concurrent/recovery/idempotency tests pass | Current 3 failed intakes are QUEUE_FULL; no unexpected serialization 409 established. Successful retries are not counted in current summary |
| D9: readiness / background work | CONTRIBUTING shared-pool work / high; primary cause UNVERIFIED | `health/health-readiness.service.ts:33,84`; `modules/anti-abuse/anti-abuse-maintenance.ts:31,43` | Coalesced checks and 60 bounded maintenance runs / 2 deleted rows / 12129ms elapsed | No readiness 503 or maintenance failure in final window; maintenance duration includes queue wait, not 12s of held SQL |
| D10: PG connection ceiling | RULED OUT as first limit / high | pool factory/policy plus each worker entry below | 5 sampled clients vs 97 ordinary slots; zero connection failure | Slot availability is not CPU/RAM/IO/scheduler headroom |
| D11: host / Node / PG CPU, IO, scheduling | UNVERIFIED / low-to-medium | actual Windows API process and Docker PG; runtime pulse CPU/RSS | PG ~2.17 cores observed; valid Node cumulative CPU; constrained VM | No matched peak API CPU/scheduler/IO series, current identity mismatch; current cumulative IO cannot determine load-time spare capacity |
| D12: metric accounting is causing the HTTP failures | RULED OUT / high | offline `apps/api/tools/capacity/runtime-metric-window.ts:106`; Windows collector | Actual sanitized window revalidates; independent native k6 exit99 and HTTP failures | First attempt's deltas remain invalid; that collector defect does not explain either run's HTTP errors |

### Impacts, security implications and options

| IDs | Request correctness / latency / throughput | Security implications and safe remediation |
| --- | --- | --- |
| D1–D2 | Rejected checkout starts no new transaction/commit; earlier ambiguous attempts still need reconciliation. Burst/queue wait raises latency. Which arrival phase dominates is still unknown. | Bounded failure protects resources. Keep failures in gates; do not add an outer retry/queue that bypasses 128, exclude startup or turn 503 into success. Obtain sanitized phase counts; evaluate a separately approved capacity budget. |
| D3–D4 | Brief double admission is possible per HTTP flow; failed reset destroys its client and later work recovers. Global benefit of awaiting cleanup unmeasured. | Reusing a resetting client or decrementing admission early would advertise unavailable capacity and risk deadline/protocol isolation. Keep ownership until actual return/disposal. Do not make a known committed result fail/replay because cleanup failed. |
| D5–D6 | SQL and wire round trips consume slots; removing proved unnecessary work can improve service time, but no new such defect is established. | Preserve live auth and post-fence snapshots; no authorization cache. Do not combine lock acquisition and protected re-read into one snapshot or skip profile reset. Measure matched runtime-role query plans before index/function refactoring. |
| D7–D8 | Genuine locks/retries can cost time; latest failing attempts are pool admission failures. | Keep SERIALIZABLE, bounded jitter, uniqueness and atomic audit/outbox. Never retry ambiguous commits or remove revocation/Shift locks. Existing focused tests verify these contracts. |
| D9–D10 | Shared maintenance/probes consume some capacity; more connections are only a hypothesis. | Keep limiter accounting/coalescing and distinct worker principals. Budget every process, administrative client and enabled webhook; no priority bypass or automatic larger pool. |
| D11–D12 | Unknown peaks may limit throughput or amplify queueing; invalid counters can mislead diagnosis but not erase failed outcomes. | Collect fixed private numeric telemetry and validated identities; never inspect secrets or publish private logs. No tuning recommendation passes until resource gates are verified. |

## E. Remediation decision

**No runtime fix.** The source and focused reproduction establish a deliberately
bounded admission limit and accounted cleanup, not an inappropriate rejection
condition. A sufficiently large simultaneous DB cohort still exceeds 132 even
with zero business SQL, as the existing exact-boundary test proves. No amount
of SQL micro-optimization changes that admission contract.

Do not overstate this as proof that all 200 VUs are continuously making a DB
request or that four connections can never pass these percentage gates. In the
preserved profile 134 staff VUs can begin auth reads while 67 surrogate VUs
share readiness checks; per-VU calls are sequential, while across-VU arrivals
and auth/reset/business overlap can exhaust the cap. Their exact new timing
and service headroom need measurement.

Alternatives considered:

- **More SQL consolidation:** previously proved batching/join fixes are retained.
  Further removing either Dashboard authorization proof or merging the lock and
  re-read snapshot risks revocation correctness. No new index/query-plan defect
  has been demonstrated.
- **Skip/cache setup/reset:** would require a complete connection-state proof
  across general/Guest leases and every SET/failed/reset path. The measured cost
  alone is not permission to weaken it.
- **Wait for reset before returning every pool.query result:** changes where
  waiting occurs, adds completion coupling, and may change known-success/error
  delivery for mutations. New test proves counted overlap, not net benefit or
  misclassification. No blanket change or auth-only optimization without a
  demonstrated application defect/benefit.
- **Retry QUEUE_FULL inside a new queue/backoff layer:** effectively increases
  waiting outside the verified bound and can hide overload. Rejected operations
  stay failures; no hidden queue/reclassification is introduced.
- **Increase connections/waiters:** requires full resource budget and headroom;
  a conditional experimental design is below, not an applied setting.

This is the authorized diagnosis-only path. Production bytes remain unchanged;
merging this report/test cannot itself improve 200-VU results.

## F. Detailed implementation

`apps/api/test/auth-reset-admission.integration.test.ts` (134 lines):

- Uses existing ShiftTestContext, provisioned least-privilege runtime and actual
  PostgreSQL. Generates a new in-memory synthetic credential and stores only its
  hash in a task-owned live session; reads no credential fixture.
- Runs real `DatabaseStaffSessionContextResolver.resolve`, retaining actual
  token shape, hash, current session, expiry/revocation and active User query.
- Holds only the first test-owned reset behind a deterministic latch, making
  asynchronous ownership observable. With max=1/waiter=1 the live auth read has
  returned while admitted=1/leased=1; next checkout gives admitted=2/waiting=1,
  and the third fails QUEUE_FULL before SQL.
- Opens the latch, tests actual reset success or a controlled reset rejection,
  requires the next checkout to succeed with statement_timeout=15s, and verifies
  exactly two acquisitions/completions, one rejection, zero acquisition timeout,
  zero residual admission/waiters and appropriate reset-failure count.
- Does not mock auth results or PostgreSQL work. Reset-failure injection is a
  controlled test seam, not a claim of an observed server reset defect. Existing
  real-socket/deadline tests provide the transport-failure coverage.

`docs/reference/pool-admission-capacity-verdict.md`: evidence, decision, matrix,
verification and handoff. No production file, dependency, lockfile, migration,
benchmark script, workload, UI or mobile file changed. Pre-code scope identified
only test User/Membership/Location/StaffAuthSession setup; no product state
transition, tenant/MFA/Shift rule or Company/Location policy was changed.

There is no original-FAIL/patched-PASS bugfix claim: the new diagnostic passes
against unchanged baseline runtime, as expected. The owner explicitly permits
a verified capacity-limit diagnosis instead of an invented application patch.

## G. Security and correctness

Production source matches 5e0a39dc byte-for-byte. Live session verification,
15-minute expiry, refresh rotation, old access invalidation, replay-family
revocation, MFA and rate limiting are intact. The new test calls the real live
resolver; existing native-auth/MFA tests pass. No auth result is cached.

Organization/location/grant/role/entitlement checks, Company Admin versus
Location Manager branches, Shift eligibility and both Dashboard revocation
proofs/lock are untouched. Focused tenant, missing subscription, null-gate
privilege and grant/entitlement race tests pass.

Check-In still owns a complete SERIALIZABLE transaction per attempt with a
stable operation ID/fingerprint and active custody uniqueness. Five-attempt
jitter remains after rollback/release. Independent, duplicate-operation,
same-vehicle, bounded retry/outbox recovery, rollback and ambiguous-COMMIT tests
pass. No failure is relabeled successful and no uncertain mutation is replayed.

Admission, server/driver/transaction/lease/operation deadlines, worker principal
isolation and reset/disposal behavior are untouched. Deadline/socket/abandonment
and exact 4/128 tests pass. Neither the local synthetic test DB nor read-only
Windows measurements touch production data.

## H. Verification — executed commands and results

Used existing task-owned stopped container `vaylet-pool-200vu-pg17`, loopback
55435, tmpfs PG17, max_connections=100. Reused the established owned harness and
fixture provisioning; did not rebuild benchmark infrastructure or run k6.
Local commands used Node24 / pnpm10.34.5, with local PATH/Corepack cache overrides.
Set `TEST_DATABASE_URL` to the disposable synthetic local URL
`postgresql://valet:valet@127.0.0.1:55435/valet`; no private credential was copied.

```sh
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/auth-reset-admission.integration.test.ts test/pool-startup-burst.integration.test.ts test/runtime-metric-window.test.ts
# PASS: standard 1 file/2 tests; race 1/1; non-PG 1/26. Total 3 files / 29 tests.
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/guest-t3-runtime-resilience.integration.test.ts test/guest-t3-lease-regression.integration.test.ts \
 test/staff-auth-native.integration.test.ts test/staff-mfa-assurance.integration.test.ts \
 test/dashboard-authorization-roundtrips.integration.test.ts \
 test/dashboard-authorization-fence-concurrency.integration.test.ts \
 test/dashboard-location-authorization.integration.test.ts test/shift-eligibility.integration.test.ts \
 test/intake-serialization-retry.test.ts test/intake-independent-concurrency.integration.test.ts \
 test/intake-operation-concurrency.integration.test.ts test/intake-serialization-recovery.integration.test.ts \
 test/health-pool-attribution.test.ts test/guest-t4-observability.test.ts \
 test/staff-operational-context-batching.integration.test.ts
# PASS: race 7 files/37 tests; standard 5/41; non-PG 3/24. Total 15 files / 102 tests.
corepack pnpm --filter @valet/api exec tsx tools/capacity/validate-runtime-metric-window.ts < /workspace/work/pool-next-validated-window.json
# PASS, actual sanitized final-run envelope: 59987ms window, 8640 acquisitions/completions, 110 rejected.
corepack pnpm install --offline --frozen-lockfile
corepack pnpm --filter @valet/contracts build
corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm architecture:check
# PASS; architecture reports existing grandfathered warnings only.
git diff --cached --name-only -z | xargs -0 corepack pnpm exec prettier --check
git diff --cached --check
# PASS after staging reviewed files.
```

**18 files / 131 tests PASS**, no skips/failures in these executions. This is
focused continuation coverage, not a repeat of all prior 326 tests or a new
repository-wide audit. High-load k6, full UI/e2e, the private Issue319 lab and
full deployment capacity validation were not run. No historical pass count is
represented as a new execution. Final checks found zero owned active clients
and zero remaining Shift fixture databases; the reused task container was
stopped again after testing. Test outputs and sanitized envelope remain
outside the repo; only the diagnostic test/report are staged.

## I. Expected performance impact

**Measured new result:** the existing admission/reset accounting and cleanup
hold in the controlled overlap scenario; exact 133rd-admission protection and
prior correctness tests pass. No runtime change or performance improvement is
claimed. Existing improvements remain source-level reductions with no validated
200-VU win. Different fixture cardinality and abort windows do not prove a
performance regression either.

Short leases do not mean unlimited throughput: four service slots and many
sequential per-request wire calls can accumulate hundreds of milliseconds of
waiting. Conversely, average wait/hold time cannot uniquely identify executor,
scheduler or arrival bursts. The new evidence supports local-envelope
saturation, not a safe new pool size or production VU ceiling.

## J. Antigravity handoff and decision gates

### Evidence completion, without discarding the existing runs

Keep 5e0a39dc + 4/128 as the official comparison baseline. This branch changes
no production code; do not merge/rebuild it expecting a capacity gain. Existing
Windows collector repairs/native exits/strict same-process validation remain.
Do not repeat 50/100 or rerun solely to get another failure count.

First seek already-recorded **sanitized** 0–5s versus later failure bins for
each post-f552 run; if absent, mark timing unverified. No private log access is
authorized for Codex. At the next permitted 200-VU diagnostic, collect those
fixed phase counts at source into a separate sanitized artifact, alongside
full-stage totals. Do not exclude startup from gates or change abrupt arrivals.

The missing resource series must describe the actual API PID/creation time and
release, not its launcher or PG container. Capture ~1Hz CPU/RSS/heap/IO,
event-loop delay/utilization or equivalent scheduler/GC evidence, PG/container
CPU/memory/IO, active query/transaction/lock samples, and a complete supervisor-
owned process/pool inventory. Current idle/cumulative samples are not substitutes.
An explicit test-only Node perf_hooks preloader or profiler can supply scheduler
data without changing auth/business code, but label the diagnostic observer and
measure its overhead; it is not a capacity fix. Use read-only PG/OS/container IO
counters; track_io_timing=off currently prevents claiming SQL IO durations.
Any diagnostic DB setting change is separately labelled, never a silent change
to the official 4/128 profile or production configuration.

Preserve strict metric-window checks: actual Node identity/creation time, SHA,
fresh pre-stage and post-drain quiescent pulses, monotonic counters/uptime,
unchanged limits and unmodified lifetime snapshots. Pulse rates use pulse
window duration; aggregate and successful operational RPS use the same actual
k6 traffic duration. Record actual stop time/native exit99 independently of
wrapper duration and 499 outcomes. Do not recreate invalid first-attempt deltas.

### Aggregate budget and conditional experiment design — NOT ready to execute

Source inventory: ordinary API singleton `common/database/runtime-database.module.ts:23`;
staff push `staff-push-worker.ts:45`; guest push `guest-push-worker.ts:33`;
outbound sender `outbound-message-worker.ts:24`; photo maintenance
`condition-photo-maintenance-worker.ts:42`; optional restricted webhook pool
`modules/notifications/webhooks/meta-webhook-database.ts:34`. Each process/replica
has its own max; Dashboard/Valet/Customer production source uses HTTP clients,
not another discovered pg runtime pool. Tooling/migrations/admin and unrelated
external clients still count. Native min=0/idle expiry means an enabled pool
may reserve capacity even when no backend is visible at a sample.

Budget formula:
`sum(API instances*max) + sum(enabled webhook instances*max) + sum(each worker kind instances*max) + other DB clients + admin/migration headroom <= 97 ordinary slots`.
The three PostgreSQL superuser-reserved slots remain outside that application
budget. Production policy's per-process API envelope guard is not a complete
fleet budget. work_mem is per operator/parallel worker, not a fixed per-client
allocation; include query plans/parallelism/VM competition in memory assessment.

For a verified one-API/no-worker/no-webhook isolated profile, one sampler plus
an explicit two-client admin reserve gives baseline budget **4+1+2=7** ordinary
slots. One API + one webhook + one each of four workers at default4 would instead
reserve **24**, before sampler/admin/others. The six unclassified current Node
processes prevent treating that example as a verified deployment inventory.

A possible future two-cell experiment is **4/128 versus 6/128**, keeping exact
source, fixtures, abrupt 200-VU arrivals, token/session behavior, deadlines,
resource limits and gates identical. The second cell's admission ceiling is
134, not 132; expected isolated budget would be **6+1+2=9** only if the above
inventory is verified. More connections provide service slots and two additional
burst admissions, but can increase CPU, memory, locks or IO and still reject
larger arrival cohorts. No waiter increase, outer queue or automatic retry.

**HOLD: do not execute or call 6 safe based on this report.** Before owner approval,
require complete timestamped pool inventory, matched loaded CPU/RSS/VM memory,
IO/lock/scheduler evidence, query/lease timing, explicitly quantified remaining
budgets and stop ceilings. Current evidence does not meet these prerequisites.
After those pass, owner may approve that isolated test-only candidate or choose
another evidence-backed next step. No production setting is recommended here.

Confirm/reject the hypothesis with all correctness gates and resource behavior:
less waiting/rejection without adverse CPU/IO/lock/tail-latency behavior would
support sizing as a cause; unchanged failures or resource regression would
reject that candidate and require examining the newly observed limiter.
Report instrumented diagnostics separately from unchanged official comparisons.
Do not describe the second cell as a proven code fix or compare it to a different
Linux/full-stack deployment. Comparable fixture snapshots matter; preserved
accumulated QA data is not an identical dataset between sequential stages.

### Required stage sequence and stop conditions

At the next approved measurement, verify the exact source SHA and resources,
minimal smoke only if needed, then **200 VUs FIRST**. No 250 until 200 passes
all gates; then 250 -> 300 -> approved higher levels -> 30-minute soak at the
highest agreed stable load. A failed diagnostic or experiment never authorizes
higher stages. Soak must cross real 15-minute expiry and coordinated refresh;
never extend lifetime or bypass authentication.

Required whole-stage gates, including startup:

- Legitimate Check-In >=99.5%; unexpected HTTP errors <0.5%.
- p95 <1000ms and p99 <2500ms, with p50 also recorded.
- Zero DB integrity violations and unexplained auth/refresh failures.
- No unexplained 409/401/429/503 spikes.

Stop immediately on correctness failure or sustained required-threshold breach.
Record each route's totals/failure rates, Check-In and ambiguous operation
reconciliation, auth/refresh, admission/timeouts/native checkout, completed
leases and setup/work/control/reset timings/peaks, actual process/resource/PG
metrics, idempotency and audit/outbox checks. Keep all previous artifacts and
invalid-window labels. This API_ONLY_PROBE uses readiness surrogates; separate
full-stack VPS validation is required for production-capacity claims.

## K. Git delivery

Dedicated branch `fix/pool-admission-200vu-next-remediation`, from the exact
baseline above. Commit only the focused diagnostic test and report; no private
artifact, dependency/config/runtime/schema change. The final delivery gives the
exact commit SHA and immutable GitHub report link; a report cannot embed its
own commit SHA. Verify remote HEAD equals local HEAD and worktree cleanliness
after pushing. No PR, main merge, deployment, manual CI, force push, or owner
worktree change. This delivery is a verified diagnosis, not a 200-VU fix claim.
