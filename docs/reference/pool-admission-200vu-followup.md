# PostgreSQL admission at 200 VUs: post-merge follow-up

Date: 2026-10-28. Evidence profile: Windows **API_ONLY_PROBE**.

## A. Executive verdict

**Confirmed startup admission burst at the four-connection/128-waiter ceiling,
contributing avoidable Dashboard round trips, and an independent benchmark
accounting defect.** No malfunction of the bounded admission algorithm, serialization retries or connection cleanup
was established. A genuine unnecessary implementation cost was reproduced and
removed in one production source file: manager Dashboard reads now use four
business SQL calls instead of six while retaining both authorization proofs and
the shared revocation fence. This is a safe reduction in work, not a proven
200-VU capacity solution.

A further local-only timing aggregation is decisive: **all 113 first-run and
all 117 repeat QUEUE_FULL HTTP responses occur in the first five seconds of
traffic**, within only a two-second / roughly one-second timestamp span,
respectively. None occurs later in the recorded short stages. These runs prove
a startup burst admission failure; they do not prove sustained steady-state
200-VU exhaustion. The failed initial operations still count and both stages
still FAIL. Waiting may continue below the rejection ceiling afterward; absence
of further QUEUE_FULL does not establish spare service capacity. No ramp, excluded warmup interval or relaxed gate is proposed.

The dominant measured lease-time category in the first post-merge window is
business-query RTT (70.17%); setup/reset accounts for 18.21%. Four leases service
a burst workload with an authentication checkout plus a business checkout per staff
request and many serial SQL round trips. Native waiting (~286ms/attempt) greatly
exceeds completed lease time (~13ms). The queue fills to 128 waiters and new
admissions are rejected at 132. These numbers explain the observable choke point;
they do not isolate PostgreSQL executor time from client/network/scheduler time.

**200 VUs still has two FAIL results and no verified PASS.** Antigravity must
repeat 200 VUs at unchanged 4/128 bounds after adopting fresh same-process metric
collection. No higher-load or soak approval follows from focused tests.

## B. Updated source and preservation

- Verified origin: `https://github.com/yamanradwan1-rgb/valet-platform.git`.
- Executed `git fetch origin main`; exact updated main and selected baseline:
  **`ea49274101822d56b650a856abcd9c80471491e6`**.
- `a5fe02ea2a631a25ae2891dc8ea84f2e7c2de77c` is an ancestor of updated main.
  `git diff --exit-code a5fe02ea ea492741` passed: merge history adds no source
  differences. No commits followed ea492741 at investigation start.
- New branch: **`fix/pool-admission-200vu-followup`**; new isolated worktree:
  `/workspace/work/vaylet-pool-200vu`. No existing branch/worktree was reused.
- Prior Check-In five-attempt bounded jitter retries, operational-context single
  lease and private admission diagnostics are present and unchanged.
- Read applicable root `AGENTS.md`, file-size/architecture, engineering/security,
  shared-infrastructure and relevant accepted commercial/Shift rules, plus all
  three previous investigation reports. The pre-code determination is retained
  in the appendix. New/modified authored code remains below 300 lines.

Owner worktree, prior worktrees, ignored artifacts and saved evidence were
preserved. No PR, merge, deployment, production configuration or manual CI trigger.

## C. Root cause and competing hypotheses

Paths in this section are relative to `apps/api/src/` unless stated otherwise.

| Mechanism | Classification | Evidence / implication |
| --- | --- | --- |
| Intentional admission ceiling | CONFIRMED | `common/database/bounded-postgres-pool.ts:121` rejects before native connect at admitted >= max + waiters. Both retests reached peak admitted=132 / native waiting=128 with max=4 / waiters=128. |
| Startup arrival burst exceeds the bounded admission envelope | CONFIRMED | All 113/117 HTTP QUEUE_FULLs occur during the first five seconds, not throughout the stage. At 200 VUs, 134 staff VUs can issue initial auth reads while 67 readiness VUs share a DB check; maintenance can add work. The pool admits only 132 operations. First recorded window: 9909 completed leases, 129219ms cumulative occupancy; native checkout 2835157ms. Burst failure is repeated independently. These are wider pulse windows, not an exact traffic-only utilization calculation. |
| Business-query round trips dominate measured lease time | CONFIRMED category; server-only cause UNVERIFIED | First window query elapsed deltas: setup 12647ms, work 90678ms, transaction control 14091ms, reset 10883ms. Work=70.17%, setup/reset=18.21%, control=10.90%; remaining ~0.71% is other owned-lease time. RTT includes driver/network/runtime scheduling and SQL. |
| Separate scope/entitlement reads add unnecessary Dashboard work | CONFIRMED; CONTRIBUTING | Baseline `modules/dashboard/dashboard-location-authorization.ts:20-53` made two queries. `modules/dashboard/dashboard-read-authorization.ts:45,78` invokes it twice around the required fence: four scope/entitlement calls plus fence and projection = six work calls. Regression observed two per authorization; patched source uses one. |
| Authentication pressure | CONTRIBUTING legitimate work | `modules/auth/staff-session-context.ts:54` performs one indexed live session/User read per authenticated request, plus general setup/reset. No auth caching, batching across users or verifier bypass is justified. |
| Concurrent HTTP/polling demand | CONTRIBUTING workload | Inspected Windows workload: 66 Dashboard VUs, 67 valet VUs and 67 readiness-surrogate VUs at 200; each group issues sequential requests then sleeps 1s. No intra-VU batch/fan-out was found. Across VUs, a synchronized initial cohort can exceed 132 admissions. This is a valid burst workload characteristic, not a fixture defect that excuses failures. Preserve this workload for comparison. |
| Readiness traffic | CONTRIBUTING profile characteristic | API_ONLY_PROBE substitutes BOTH customer-web and readyz GETs with `/health/ready` (`benchmark-workload.js:245-250`). This exercises DB readiness, not real customer APIs/web. Existing in-flight coalescing bounds DB checks and can fan one rejection into several HTTP failures. No success cache or probe bypass added. |
| Excessive setup/reset | CONTRIBUTING; safe removal UNVERIFIED | Measured 18.21% occupancy. Those boundaries protect general/Guest deadline settings and discard uncertain connections. Removing/caching resets needs a complete state-proof; this patch leaves them intact. |
| Long-held application callbacks / transactions dominate | RULED OUT as dominant completed-lease category in this window; rare cases UNVERIFIED | ~13ms average completed lease; only 8 of 9909 completions in >100..500ms bucket, none >500ms. Query/control/reset RTT nearly accounts for lease time. Lease timing does not separately measure BEGIN-to-COMMIT wall time or unfinished operations. |
| Lock waits / serialization exhaustion | UNVERIFIED transient waits; RULED OUT as observed failure classification | Periodic PG samples show zero lock waits, counters show no lock/statement/transaction timeouts; no unexpected intake 409. Sampling cannot exclude short lock waits or successful serialization retries. |
| Leaks / broken pool waiter cleanup | UNVERIFIED historically; not reproduced | No new leak evidence, zero acquisition timeouts. Existing/new real-PG admission, cancellation, abandonment, reset, rollback and recovery tests pass. Stage release failures delta=0 in first run; an earlier cumulative releaseFailures=1 remains visible. |
| PostgreSQL connection limit | RULED OUT as first observed limit | max_connections=100, non-superuser slots=97, sampled clients peak=5 including sampler, no connect errors. This does not establish CPU/IO/memory headroom for a larger pool. |
| PostgreSQL CPU/IO or Node scheduling ceiling | UNVERIFIED | First run PG container CPU peaked 212.88%, memory ~73MB. Node CPU delta=18.219 core-seconds over 90s pulse window; API does not run inside that PG container. No adequate load-time API scheduling/IO profile. Do not infer total resource exhaustion or spare capacity from those averages. |
| Background maintenance is the primary cause | UNVERIFIED; shares pool | Anti-abuse maintenance has one in-flight 1Hz batch. One cleanup failure occurred in first window; it could be admission or another failure. Duration includes waiting; it is not proof of SQL occupancy. Repeat process reports zero cumulative cleanup failures. |
| Cross-process metric subtraction | CONFIRMED harness defect | Same release SHA was reused across API restart. Start uptime=212s, end=62s, CPU/counters decrease. Acquisitions=862 / rejected=3 are invalid deltas, independently of HTTP/Check-In failures. |

### Complete lifecycle and unchanged boundaries

`common/database/runtime-database.module.ts:23` owns the shared ordinary API
pool. Policy (`runtime-postgres-policy.ts:35`) defaults to 4/128 outside
production; production requires explicit capacity/general-deadline settings.
Native `pg.Pool.connect` queues; admission remains counted during setup, work
and asynchronous reset. `postgres-lease.ts:14` installs general settings in one
call, then `postgres-lease.ts:72` resets in one call before native release.
General pool.query uses setup + work + reset. Its work result can resume the
controller while the auth lease's asynchronous reset still owns a slot; the
subsequent business checkout briefly adds another admitted operation for that
HTTP request. This is real bounded occupancy, not a leaked admission. Immediate
burst admission decisions happen before later SQL completions; fewer SQL calls
can speed drain but cannot guarantee acceptance of a cohort above the ceiling.
Guest scoped operations retain
their strict deadlines and skip general setup/reset.

`postgres-transaction.ts:13` performs BEGIN/action/COMMIT or rollback. Failed
rollback/ambiguous COMMIT destroys the client and does not replay. Query/lease
watchdogs and native deadlines bound abandoned work; timed-out native waiters
are removed, expired late checkouts discarded, shutdown disposes owned leases.
HTTP disconnect records 499 once and does not guarantee SQL cancellation or
rollback of an ordinary mutation. Do not replay an uncertain commit.

`modules/anti-abuse/anti-abuse-maintenance.ts:31,55` shares this pool, one batch
per second with no overlap, cleanup bound and 500ms local statement ceiling.
Known workers create separate pools (staff push, guest push, outbound sender,
photo maintenance); optional webhook receiver also creates a restricted pool.
Their credentials, principal restrictions, lifecycle and limits are untouched.

A final exact-boundary real-PG regression submits four held leases plus 128
queued leases and requires admission 133 to fail immediately, before any
business SQL is submitted. All 132 accepted leases drain with zero acquisition
timeouts/leaks, then a health query succeeds. This proves the fixed ceiling can
reject a sufficiently large simultaneous DB cohort even with zero business
query cost; it is expected resource control, not a pool algorithm defect. The
Dashboard correction speeds work but cannot remove that admission contract.

### Eight paths: focused PostgreSQL probe

Executed the existing `pool-route-cost.integration.test.ts` before and after on
the same task-owned PG17 instance with freshly provisioned small fixtures. No
HTTP/auth middleware or background work is included. Each path uses one business
acquisition; authenticated HTTP normally adds one separate auth acquisition and
three driver calls. Counts vary for CA/MFA, nonempty tasks, customer issuance
and retries. Query RTT is not pure PostgreSQL execution time.

| Service operation | Baseline -> patched work calls | Control calls | Baseline -> first patched lease ms | Source (`apps/api/src/`) |
| --- | ---: | ---: | ---: | --- |
| State counts | 6 -> 4 | 2 | 8.632 -> 8.292 | `modules/dashboard/overview-sessions-query.ts:213` |
| Sessions | 6 -> 4 | 2 | 9.181 -> 11.062 | `modules/dashboard/overview-sessions-query.ts:79` |
| Tasks | 6 -> 4 | 2 | 7.036 -> 8.188 | `modules/dashboard/overview-retrieval-tasks-query.ts:45` |
| Active Shifts | 6 -> 4 | 2 | 7.686 -> 6.974 | `modules/dashboard/overview-shifts-keys-incidents-query.ts:34` |
| Context | 5 -> 5 | 0 | 5.000 -> 6.067 | `modules/staff/staff-operational-context-query.ts:30` |
| Task queue | 4 -> 4 | 2 | 8.830 -> 8.490 | `modules/dispatch/task-queue-query.ts:118` |
| Directory | 10 -> 10 | 2 | 10.104 -> 9.565 | `modules/staff/staff-vehicle-directory.service.ts:56` |
| Intake | 13 -> 13 | 2 | 17.661 -> 15.998 | `modules/valet-sessions/intake-session-command.ts:57` |

All rows also have one setup and one reset call. Dashboard business calls fall
10 -> 8, and complete normal LM HTTP DB calls 13 -> 11 including auth. The final
probe again observed four Dashboard work calls, with leases 7.782/15.428/14.565/
6.756ms; variability makes **no measured latency/occupancy improvement claim**
justified. The measured correction is the eliminated round trips.

Existing tenant/location/session/task/Shift indexes and the subscription's
organization PK support these reads. No missing-index or query-plan defect was
established. The prior warm state-count EXPLAIN is not evidence about all queries
under load. No new load-time executor/IO/query-plan evidence exists; collect
sampled runtime-role plans if RTT/CPU evidence points there. No speculative
index/migration or unrelated query rewrite was performed.

## D. Benchmark evidence and accounting correction

Read the supplied `POST-MERGE-200VU-20261028.md` as evidence, separately from the
owner's explicit task. Inspected Windows saved merged/repeat metadata,
first-run telemetry, selected orchestrator source and the workload source via
the connected file tool. No credential fixture or `.env` was read. A narrow local-only PowerShell
aggregation of the private API log returned fixed counts/timing summaries only;
no raw line, token, request ID, tenant or credential crossed the Windows boundary. Evidence root:

`D:\kndoom\vaylet test onely\tmp\vaylet-capacity-20261028\tmp\capacity-validation\working`

| Metric | First merged run | Confirmatory repeat |
| --- | ---: | ---: |
| Source | ea492741 | ea492741 |
| Effective traffic seconds (count/rate) | 31.8475 | 31.8463 |
| Requests / aggregate RPS | 7600 / 238.64 | 8427 / 264.61 |
| HTTP failure rate | 1.4868% | 1.3884% |
| p95 / p99 ms | 861.69 / 1025.80 | 704.45 / 971.68 |
| Completed Check-In responses | 198/201 (98.51%) | 197/201 (98.01%) |
| HTTP 503, privately QUEUE_FULL | 113 | 117 |
| Unexpected intake serialization 409 | 0 | 0 |
| Sampled integrity violations | 0 | 0 |
| Outcome | FAIL / early abort | FAIL / early abort |

Latency passes in both, error/Check-In gates fail. Neither nominal 300s stage
completed. Fresh sessions and accumulated data differ; no controlled performance
gain can be inferred even between these two runs of identical source.
The timing aggregation matched the first run's exact start/end pulse markers
(acquisitions 279/10188, uptime 32/122) and counted 113 QUEUE_FULL HTTP records
with no missing timestamps. Baseline pulse UTC was 01:28:13; failures occurred
8..10s after it, approximately 0.3..2.3s after traffic start. The repeat matched
the API logger process to its end pulse (acquisitions 11141, uptime 62,
rejected 117) and counted 117 responses, all in the first 0..5s traffic bin.
Second-resolution log timestamps limit subsecond precision. Neither aggregation
uses the repeat's invalid start counter. No raw private lines were returned.
These counts establish temporal clustering, not per-request one-to-one mapping
between HTTP responses and DB admission attempts.

First snapshot window has increasing uptime 32 -> 122 and monotonic counters,
consistent with the same process, but lacks the explicit process identity now
required for future validation. It spans wrapper/drain idle time. Its 114 pool
rejections need not equal 113 HTTP 503s because readiness coalesces checks.
Repeat has 117 cumulative new-process rejections, but its old-start/new-end
subtraction is unusable. Independent 117 HTTP QUEUE_FULL outcomes remain valid.

The repeat also records **206 started Check-In attempts**, 201 completed Rate
observations, and 5 intake 499s at abort. The reported 197/201 is the completed
response denominator. Reconcile the five interrupted operation IDs against
committed idempotency/session/audit records; their commit outcomes are unknown.
They must not disappear from the final correctness accounting or become assumed
successes. All server 499s (146 first / 76 repeat) remain separate observations.

Saved successful operational RPS 56.42 / 84.16 uses wrapper durations 84.41 /
64.27s; aggregate RPS uses ~31.85s traffic. They are incomparable as saved.
Using completed operational counts 4762 / 5409 with the k6 count/rate duration
would give approximately 149.53 / 169.85 completed operational responses/s,
excluding unresolved responses. This is an aligned arithmetic reinterpretation,
not a before/after capacity result or repaired historical counter window.

`post-codex-orchestrator.py:56-70` picks the last retained pulse without freshness
or process identity; `:317-328` clamps negative differences with max(0,...).
That concealed the restart in the repeat. Its stopped Docker CLI exit
4294967295 is wrapper cleanup, not native k6 status. JSON metrics independently
establish both FAIL verdicts. Preserve the original summary, metadata and traces.

## E. Remediation and every changed file

| Repository file | Change / reason |
| --- | --- |
| `apps/api/src/modules/dashboard/dashboard-location-authorization.ts` | One joined read of authorized scope and own-Organization entitlement. Reuse existing typed policy, fail closed on absent subscription. Explicitly return only three scope fields. Ungated null-requirement callers omit the subscription join and retain existing privilege requirements. |
| `apps/api/test/dashboard-authorization-roundtrips.integration.test.ts` | Baseline-failing acquisition-independent SQL-count regression; all 8 boolean combinations across 3 requirements; status/plan independence; missing subscription, foreign tenant and ungated SELECT-privilege compatibility. |
| `apps/api/test/dashboard-authorization-fence-concurrency.integration.test.ts` | Real-PG prior grant/entitlement writer causes fresh post-fence denial; later writer waits for read transaction. |
| `apps/api/test/pool-startup-burst.integration.test.ts` | Exact 4/128 real-PG boundary: 132 accepted leases, admission 133 rejected before business SQL, complete drain/recovery with zero timeouts. |
| `apps/api/tools/capacity/runtime-metric-window.ts` | Offline strict same-process/freshness/counter validator; no production import. |
| `apps/api/tools/capacity/validate-runtime-metric-window.ts` | stdin CLI for sanitized envelopes, bounded input acceptance, fixed errors, nonzero rejection and no partial deltas. |
| `apps/api/test/runtime-metric-window.test.ts` | 26 cases covering restarts, PID reuse, stale/future samples, missing/decreasing counters/vectors/peaks, config drift, undrained boundaries and immutable raw samples. |
| `docs/reference/pool-admission-200vu-followup.md` | This investigation, exact verification and benchmark handoff. |

One production file changed. Existing `dashboard-read-authorization.ts` is
unchanged: scope hint, shared transaction advisory lock, READ COMMITTED check
and fresh scope proof all remain. The subscription PK ensures zero or one
joined row; COALESCE false preserves missing-subscription denial. Only trusted
source-owned fragments vary for the existing null requirement, with user/location
values still parameterized. Central `allowsManagementCommercialAccess` remains
authority: no copied SQL policy, plan-code inference or entitlement cache.

## F. Security and correctness

Organization joins, exact location, active User/Membership/Organization/Location,
LOCATION_MANAGER role and explicit grant predicates are retained. Joining the
entitlement yields one statement snapshot for each scope proof; the second
statement after the fence still observes earlier managed revocations. No grant
or entitlement is cached, no lock/revalidation removed. Null-entitlement callers
retain one query and need no new subscription read permission. Returned scope
still contains only locationId/membershipId/organizationId.

CA MFA/session paths, auth guards, token validity, refresh rotation/family replay
revocation, rate limiting, Shift requirements and worker principals are unchanged.
New and existing real-PG revocation/MFA tests pass. All Check-In/source retry,
idempotency, SERIALIZABLE, custody uniqueness, rollback/audit/outbox and lease
policies are unchanged. Their concurrent/duplicate/same-vehicle/recovery tests
pass, including no replay of an ambiguous COMMIT and zero effects on rollback.

No public success/error shape is altered; QUEUE_FULL remains a failure. No
pool/waiter/deadline configuration changed. No production/shared DB writes.
The offline accounting tool cannot alter application outcomes or saved counters.

## G. Exact verification commands and results

Commands run from repository root with pnpm 10.34.5 / Node 24. Standard tests
used the dedicated loopback/tmpfs PG17 container `vaylet-pool-200vu-pg17`,
port 55435, max_connections=100. Its synthetic bootstrap URL was
`postgresql://valet:valet@127.0.0.1:55435/valet`. Existing harness ownership,
migrations, least-privilege role provisioning, caps and cleanup stayed intact.
Final checks found zero owned active clients/remaining Shift fixture databases
and zero other clients in the security cluster. Both task-owned containers were
stopped after testing; local test output files are preserved outside the repo.
No full capacity stress test or production fixture was used.

Baseline command, before changing production source:

```sh
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/dashboard-authorization-roundtrips.integration.test.ts test/pool-route-cost.integration.test.ts
# EXPECTED FAIL: 1 failed / 1 passed; authorizer expected 1 query, observed 2.
```

The same authorizer assertion passed afterward; initial expanded post-patch run
passed 2 files / 4 tests. Final expanded checks below passed **42 unique Vitest
files / 326 tests**, with no skips in their successful runs. Repeated tests are
not double counted.

Set `TEST_DATABASE_URL` to the task-owned URL above and use the owned harness:

```sh
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/dashboard-authorization-roundtrips.integration.test.ts \
 test/dashboard-authorization-fence-concurrency.integration.test.ts \
 test/dashboard-location-authorization.integration.test.ts test/dashboard-overview-authz.integration.test.ts \
 test/dashboard-read-revocation-fence.test.ts test/management-commercial-policy.test.ts \
 test/dashboard-report-commercial.integration.test.ts test/dashboard-branding-commercial.integration.test.ts \
 test/runtime-metric-window.test.ts test/pool-route-cost.integration.test.ts
# PASS: standard 4 files/19 tests; race 1/3; non-PG 3/37; compound 2/3 (total 10/62).
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/pool-startup-burst.integration.test.ts
# PASS: race 1 file / 1 test; actual 4/128 boundary, no business work.
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/pool-occupancy.integration.test.ts test/guest-t3-runtime-resilience.integration.test.ts \
 test/guest-t3-lease-regression.integration.test.ts test/staff-context-lease.integration.test.ts \
 test/staff-operational-context-batching.integration.test.ts test/staff-operational-context.integration.test.ts \
 test/health-pool-attribution.test.ts test/guest-t4-health.test.ts test/performance-pool-diagnostics.test.ts \
 test/guest-t4-observability.test.ts test/performance-request-diagnostics.test.ts
# PASS: race 3/23; standard 3/18; non-PG 5/37 (total 11/78).
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/intake-serialization-retry.test.ts test/intake-independent-concurrency.integration.test.ts \
 test/intake-operation-concurrency.integration.test.ts test/intake-serialization-recovery.integration.test.ts \
 test/intake-session-command.integration.test.ts test/staff-auth.integration.test.ts \
 test/staff-auth-native.integration.test.ts test/staff-auth-continuity.integration.test.ts \
 test/staff-mfa-assurance.integration.test.ts test/staff-task-queue-authorization.integration.test.ts \
 test/staff-vehicle-directory.integration.test.ts test/shift-eligibility.integration.test.ts \
 test/postgres.test.ts test/guest-push-worker-principal.test.ts test/mfa-assurance-policy.test.ts \
 test/management-commercial-field-boundary.test.ts test/architecture-check.test.ts \
 test/architecture-line-policy.test.ts test/architecture-repository-files.test.ts
# PASS: non-PG 8/81; race 6/62; standard 5/40 (total 19/183).
```

The existing Issue319 MFA recovery race suite initially refused the ordinary
cluster before tests ran (1 suite failed preflight; 2 skipped). Provisioned a
second owned PG17 Docker cluster satisfying its checks exactly: owner
issue315_owner, database postgres, loopback/server port 55436, actual PGDATA
`/tmp/issue-315-pg-qa/issue319-pool200/.issue315-private-cluster`, tmpfs,
max_connections=100. No test guard was bypassed or changed. Then executed:

```sh
TEST_DATABASE_URL=postgresql://issue315_owner:valet@127.0.0.1:55436/postgres \
MIGRATION_DATABASE_URL=postgresql://issue315_owner:valet@127.0.0.1:55436/postgres \
ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER \
ISSUE315_PG_PRIVATE_DATADIR=/tmp/issue-315-pg-qa/issue319-pool200/.issue315-private-cluster \
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
 test/dashboard-issue319-ca-mfa-rr-regression.integration.test.ts
# PASS: 1 file / 2 tests; actual owned cluster/port/directory/runtime role checks passed.
```

Both passwords above are disposable synthetic test values. No real credential
was copied. Source/test modifications remain limited to the listed files.

```sh
corepack pnpm install --offline --frozen-lockfile
corepack pnpm --filter @valet/contracts build
corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm --filter @valet/api exec tsc --noEmit --skipLibCheck --target ES2022 --module commonjs --moduleResolution node tools/capacity/validate-runtime-metric-window.ts
corepack pnpm architecture:check
# PASS; architecture emits existing grandfathered warnings only.
git diff --cached --name-only -z | xargs -0 corepack pnpm exec prettier --check
git diff --cached --check
# PASS after staging the reviewed files.
```

CLI smoke executed with synthetic complete envelopes:

```sh
corepack pnpm --filter @valet/api exec tsx tools/capacity/validate-runtime-metric-window.ts < /workspace/work/pool200-valid-window.json
# PASS: exit 0, 32000ms counter window / 17 rejected delta.
corepack pnpm --filter @valet/api exec tsx tools/capacity/validate-runtime-metric-window.ts < /workspace/work/pool200-invalid-window.json
# PASS negative check: expected exit 1, fixed rejection, no stdout deltas (PID creation time differs).
```

Initial new-test type errors and an incomplete synthetic CLI envelope were
corrected before final checks. Full API/UI/e2e, other private opt-in labs and
high-load k6 were omitted. No 200-VU PASS is inferred from these 326 tests.

## H. Performance expectations and remaining uncertainty

Measured: authorization SQL 2 -> 1; LM Dashboard work calls 6 -> 4; normal LM
HTTP DB round trips 13 -> 11. **Acquisitions remain unchanged** for this patch.
Timing samples are variable and some are slower; no mean/p95 improvement or
lower contention/pool-pressure/capacity claim is supported yet. A larger join
can shift planning/execution cost; retest actual fixture cardinality/runtime role.

The first run completed 2452 Dashboard requests. If each uses the measured LM
path, 4904 fewer work calls would remove about 13.49% of its historical 36356
work calls (7.61% of all 64462 calls). This is a counterfactual for an unchanged
request trace, not measured throughput. Authorization snapshots/security are
preserved, but new planning costs and closed-loop traffic can change the result.

The independent accounting validator prevents a false metric comparison; it
cannot improve request success. The dominant observed *failure pattern* is
startup burst admission, while the
largest measured *completed lease-time category* is business-query RTT. Those
are different conclusions. No evidence establishes that four connections could
sustain a full five-minute 200-VU run even though no QUEUE_FULLs occurred after
the initial five seconds of these short runs. No leak, slow-query, scheduler or
resource-limit claim has been manufactured. CPU/IO peaks, role-specific timings,
large pages,
authentication refresh and background work can limit the next stage.

## I. Antigravity handoff

### First fix metric collection, preserving existing evidence

The offline validator is delivered and tested; the ignored Windows orchestrator
has **not** been modified or automatically integrated. Apply this narrow
collection change there without altering traffic, gates or recorded results:

1. Record the actual API **Node PID and OS process creation time**, not pnpm/
   watcher/Docker CLI parent PID, before traffic. Record immutable built release
   SHA independently. Use a dedicated append-only log and bookmark its offset
   when starting that process; never attach the new PID to an old retained line.
2. Finish session preparation/smoke, then wait for a **new pulse** after the
   bookmark from the verified process. The 30s pulse cadence may require a wait;
   it is not permission to reuse the previous process's last pulse. Capture its
   UTC `sampledAtMs`, host UTC `collectedAtMs` and unmodified metric strings.
   Both clocks are on the Windows API host. Recheck PID + creation time around
   collection. Compare timestamp-minus-creation against reported uptime.
3. Stop traffic, drain/reconcile in-flight requests, and capture a fresh
   post-drain pulse with admitted/leased/acquiring/waiting/active all zero.
   Background work can delay a quiescent sample; do not disable security cleanup.
   Collect both endpoints within 5s of pulse time. Timestamps/uptime may differ
   by at most 2s due to rounding/startup; inconsistent clocks fail closed.
4. Construct sanitized JSON: `{expectedReleaseSha,before,after}`. Each endpoint
   contains `{process:{pid,startedAtMs},sampledAtMs,collectedAtMs,metrics}`;
   `metrics` is the full parsed fixed numeric/CSV pulse plus releaseSha and
   uptimeSeconds. Preserve raw snapshots privately; send no raw log lines,
   request IDs, tokens or tenant data. Invoke from the checkout:

   ```sh
   corepack pnpm --filter @valet/api exec tsx tools/capacity/validate-runtime-metric-window.ts < sanitized-window.json
   ```

5. Reject nonzero validation; mark pool deltas **INVALID**, retain both originals
   and recollect. Never clamp decreasing counters, supply missing fields as zero
   or repair a restart by borrowing counters. The helper validates matching
   PID/creation time/SHA, monotonic uptime/counters/vectors/peaks, freshness,
   unchanged pool settings and quiescent boundaries. It preserves lifetime
   gauges/peaks instead of subtracting them and emits only fixed numeric fields.
   It validates supplied metadata; the collector must establish its provenance.
6. Keep `counterWindowMs`, traffic start/end/duration, wrapper duration and drain
   duration separate. Use the **same actual k6 traffic duration** for aggregate
   and completed operational RPS; use counterWindowMs only for the counter
   sample interval. Report edge/background contributions. Capture native k6
   threshold status independently of a hung Docker CLI cleanup exit.

Old repeat metadata lacks sufficient identity/freshness evidence for recovery;
do not publish corrected deltas for it. The 117 independently classified HTTP
failures and failed Check-In/error gates remain valid.

### Code-only retest and gates

Verify this branch's exact new commit/release, perform a small safety smoke if
needed, then **200 VUs first** at max=4/waiters=128 and unchanged deadlines.
50/100 already passed and this patch does not justify re-running their full
stages. Use the existing API_ONLY_PROBE environment, same resources/processes,
PG profile, comparable fixture snapshot/cardinality, endpoint mix, real staff
sessions and measurement windows. Preserve both prior failed runs. Account for
fixture growth rather than calling sequential accumulated datasets identical.

Stop on correctness violation or sustained threshold breach:

- Legitimate Check-In success **>=99.5%**, with interrupted/ambiguous outcomes
  reconciled by operation ID rather than assumed successful.
- Unexpected HTTP failures **<0.5%**; **p95 <1000ms**, **p99 <2500ms**.
- Zero DB integrity violations; no unexplained auth/refresh failures.
- No unexplained 409/401/429/503 spikes.

Only after full 200-VU gates pass: **250 -> 300 -> approved higher loads ->
30-minute soak at the highest agreed stable load**. Soak must exercise genuine
15-minute access-token expiry and coordinated refresh/replay protections. Never
extend token lifetime, bypass authentication, remove health failures or change
the traffic mix to manufacture a pass. Do not label the readiness surrogate as
an actual guest/business/full-web measurement. Full-stack Linux/VPS validation
is a separate deployment profile; compare resources/process counts explicitly.

Record the startup first-five-second interval separately from the remainder,
while retaining it in every whole-stage correctness/error gate. Preserve the
existing abrupt-start workload and early-stop rules. Inspect admission and
async auth-reset/business-checkout overlap during that first cohort; do not
hide it by dropping samples or adding a ramp to the comparison.

Collect matched aggregate/operational RPS, p50/p95/p99, per-route outcomes,
Check-In/refresh results, reason-tagged rejections/timeouts, native wait/setup/
work/control/reset and lease distributions, peaks and PG clients/active SQL,
CPU/RSS/IO/locks/scheduler metrics for the actual Windows API and DB. Container
sampling inside PostgreSQL cannot measure Windows Node CPU. Check locationless
sessions, duplicate active key/parking assignments, orphan tasks, idempotency,
audit/outbox integrity and disconnected/ambiguous request outcomes.

### Connection budget and conditional experiment (not executed)

Read-only Windows check found PG max=100, reserved=0, superuser_reserved=3,
shared_buffers=128MB, work_mem=4MB; DB container has no explicit per-container
CPU/memory cap. Current known worker process counts are zero; six other Node
processes are unclassified and only the inspection PG client is currently
connected. The saved handoff's stage inventory is one API, no workers/web
servers, PostgreSQL and MinIO. These current snapshots are not historical
all-process proof or a production inventory. Production headroom remains
unverified; inventory optional webhook pools and all other clients explicitly.

Aggregate budget must count ordinary API replicas, each enabled webhook pool,
every replica of four worker kinds, other clients and admin/migration reserve.
At default 4, one API + one webhook + one each of four workers would reserve 24
connections before other clients/admin, not four. Production's per-process
capacity-envelope check does not replace the aggregate calculation.

No limits were changed. If unchanged-4/128 retest still shows short leases and
queue pressure, **only after** complete inventory plus load-time CPU/RSS/IO/lock
headroom is recorded, a separately labelled test-only candidate is
`DATABASE_POOL_MAX=6`, `DATABASE_POOL_MAX_WAITERS=128`, all deadlines unchanged
(admission ceiling 134 instead of 132). That adds two burst admissions and two
service slots; it still does not guarantee every synchronized arrival fits.
For an explicitly verified one-API/no-worker/no-webhook isolated profile with
one sampler and two reserved administrative clients, expected demand is
**6+1+2=9 of 97 ordinary slots** (baseline budget 4+1+2=7). Unknown clients make
that candidate budget invalid until inventoried; include them or do not run.
A webhook at max4 adds four, every worker its own max. This is a conditional
experiment proposal, not proof that six is safe or a production recommendation.

Confirm the sizing hypothesis only if the same-source/same-fixture comparison
reduces wait/rejection and passes every correctness gate without adverse
CPU/IO/lock/tail-latency behavior. Reject it on any gate/resource regression;
stop progression and investigate the new limiting resource. Keep results
separate from the 4/128 code-only comparison. Do not enlarge waiters or silently
change production configuration.

## J. Git delivery

Branch: `fix/pool-admission-200vu-followup`, based on the fetched main SHA above.
Verified commit/remote HEAD and immutable report link are supplied in the final
delivery message; a report commit cannot contain its own SHA. Only the eight
listed files are included. No private benchmark artifacts are staged. Final
worktree cleanliness and local/remote HEAD equality are checked after push.
Main and owner/earlier worktrees remain unchanged; no PR/merge/deploy/manual CI.
The unresolved capacity gate and Windows collector integration are explicit
handoff work, not claimed completed load validation.

## Appendix: original pre-code determination
# Post-merge 200-VU pool follow-up

Date: 2026-10-28. Baseline: ea49274101822d56b650a856abcd9c80471491e6.
Branch: fix/pool-admission-200vu-followup. Latest main was fetched and verified;
a5fe02ea is an ancestor and there are no newer main commits at investigation start.

## Pre-code determination

The two post-merge 200-VU stages failed correctness/error gates, while latency
passed and unexpected Check-In serialization 409s remained zero. Preserve all
prior fixes. Repeat metadata counter subtraction is invalid across API processes
(uptime 212s -> 62s); independent HTTP failures remain valid evidence.

First-run same-process-shaped window: 9909 completed leases, 129219ms lease
occupancy, 2835157ms native checkout; work RTT 90678ms (70.17%), setup/reset
23530ms (18.21%), transaction control 14091ms (10.90%). About 4*31.85s available
lease time is comparable to the measured 129.2s, but boundaries include idle
wrapper time; do not label it an exact utilization percentage. Node CPU delta
18.219 core-seconds over the wider 90s pulse window cannot prove or exclude
transient scheduler stalls. Pool cap is confirmed, root dominance within business
SQL requires scoped evidence. No pool-size or waiter change is authorized by
these observations alone.

Confirmed unnecessary round trips: Dashboard manager authorization reads the
scope then its Organization's subscription separately. Each of two required
authorizations around the advisory fence performs both calls. Read endpoints
therefore use six work SQL calls; four can preserve the same proof by LEFT JOIN
of the subscription in each scope read and reuse of the existing typed
allowsManagementCommercialAccess function. Preserve BOTH authorization reads,
the intervening shared advisory lock, READ COMMITTED checks, Company Admin/MFA
branch, and all tenant/grant predicates. No entitlement cache or lock removal.
A regression will require one authorization SQL call on baseline (currently two),
then verify entitlement matrix, cross-tenant behavior and post-fence revocation.

Entities: User, Membership, Organization, Location, MembershipLocationAccess,
OrganizationSubscription reads only. No ValetSession/Task/Dispatch transition,
schema/index/DDL, public DTO, auth/token, role/Shift, transaction/deadline,
Company-default/Location-override, or production configuration change. Accepted
DEC-088/062 preserve current typed booleans (status/plan labels are not authority).
Target authorizer is 54 lines; keep all new/modified code below 300. Existing
pool/context/Check-In implementations stay unchanged.

The separate Windows harness bug will receive a documented strict collection
protocol and a small offline validator if useful. Do not alter saved evidence,
read private fixtures or logs, or claim corrected deltas for the old repeat.

Subsequent scope refinement: the owner's express permission for local aggregate
private-evidence analysis was used for the timing checks in section D after the
preliminary report. No raw log line was disclosed; the original pre-code note
above records the earlier plan, not a separate permission requirement.
