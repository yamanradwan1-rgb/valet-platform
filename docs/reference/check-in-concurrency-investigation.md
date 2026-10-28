# Check-In concurrency conflict: investigation and targeted fix

Date: 2026-10-28 (Asia/Amman). Repository: `yamanradwan1-rgb/valet-platform`.
Baseline latest `origin/main`: `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8`.
Dedicated branch: `fix/check-in-serialization-contention`.
Dedicated worktree: `/workspace/work/vaylet-check-in`.

## A. Executive verdict

**CONFIRMED APPLICATION DEFECT — inadequate recovery from transient serializable
aborts for independent Check-In operations.**

The application deliberately uses PostgreSQL SERIALIZABLE isolation and was
already retrying SQLSTATE `40001`, but only three times with immediate reentry.
Legitimate distinct intakes can share SSI predicate/index coverage even without
sharing an operation ID, vehicle, phone or exclusive application lock. They can
abort each other, and immediate retries can collide again until the application
returns `INTAKE_CONCURRENCY_CONFLICT` (HTTP 409).

A small real-PostgreSQL reproduction used eight employees, distinct vehicles,
operation IDs and customer phones at one authorized Location. The unmodified
baseline committed six and rejected two in an unsynchronized probe; a controlled
first-wave overlap committed five and rejected three. These are focused
correctness scenarios, not capacity or percentile benchmarks. Real `40001` errors
were observed at COMMIT and several mutation/read phases. Nonblocking SIReadLock
coverage on `intake_operations_pkey` was captured before the first writes.

The targeted correction preserves SERIALIZABLE and all existing authorization,
locks, uniqueness and transaction effects. It performs at most five complete
attempts with short exponential equal jitter after rollback/release. It still
returns the original 409 if recovery is exhausted. Domain conflicts, transport
errors and ambiguous COMMIT acknowledgements are never retried by this policy.

The owner-supplied Windows measurements identify 12 exhausted Check-Ins and no
pool admission/timeouts. The code establishes what that exact application error
means: three failed `40001` attempts on that baseline. This run reproduces that
failure class; it does **not** establish the exact predicate relation, statement
or retry schedule for each of the 12 Windows requests. The connected Windows file tool became
available during evidence discovery: the handoff, workload source and saved stage
metadata were read without modifying that worktree. Private API logs and token
fixtures were deliberately left unread.

No k6 script, UI/mobile app, schema, migration, pool setting, authentication or
MFA behavior changed. No 50–300 VU capacity improvement is claimed.

### Classification

| Finding | Classification | Evidence / limit |
|---|---|---|
| Legitimate independent requests exhaust immediate retries | CONFIRMED defect | Small real-PG reproduction; deterministic baseline-failing recovery regression |
| PostgreSQL aborting a dangerous SSI dependency structure | EXPECTED database behavior | Actual SQLSTATE 40001; isolation remains enabled |
| Same Location/Vehicle competing for one active custody record | EXPECTED business conflict | One winner and losers retain ACTIVE_VALET_SESSION_CONFLICT |
| Same operation ID with changed actor/material | EXPECTED business conflict | Existing fingerprint includes authenticated actor and normalized material; IDEMPOTENCY_CONFLICT preserved |
| Same operation ID with identical request | EXPECTED idempotent replay | One committed intake, repeated original result, no extra side effects |
| Single synthetic Location or fresh small indexes | Possible fixture amplification, not a confirmed fixture defect | Fresh index predicate coverage can be broad; one busy Location is a valid operational workload |
| Operational-RPS time-window mismatch / obsolete expected-conflict code | HARNESS reporting issue, not a cause of the 12 failures | Saved metadata and workload inspected read-only; benchmark owner owns corrections |
| Pool bottleneck at the supplied 50-VU run | UNVERIFIED / not demonstrated | Owner reports zero rejections and acquisition timeouts; no pool tuning made |
| Exact SSI read/write edges in Windows run | UNVERIFIED | Handoff, workload and stage metadata were inspected; private logs/token files were not read and no per-attempt PG graph is in the safe metadata |

## B. Root cause and complete flow

Paths below are relative to `apps/api/`. Line references describe the delivered
source except where explicitly marked baseline.

1. `src/modules/check-in-api/check-in-api.controller.ts:66` handles
   `POST /v1/staff/check-in/intakes`. Its operation runner resolves Staff identity,
   parses the strict shared request and passes the server-resolved user plus the
   validated target selector, stable operation identity and material inputs.
2. `check-in-controller-support.ts:38` requires exactly one Authorization header.
   `src/modules/auth/staff-session-context.ts:54` requires current access hash,
   unrevoked/unexpired session and ACTIVE User. Current organization/location/role
   authority is not accepted from token or client claims.
3. `intake-session-normalization.ts:76` validates and normalizes once outside the
   retry loop. `intake-session-command.ts:59` obtains a fresh lease and starts
   `BEGIN ISOLATION LEVEL SERIALIZABLE` for each attempt.
4. `check-in-location-authorization.ts:25` locks/rechecks the active User, takes
   the SHARED lifecycle advisory lock, derives Organization from persisted
   Location, and requires an active operational membership, active tenant and
   Location plus explicit access. `custody-staff-authorizer.ts:53` and `:71`
   retain persisted FOR SHARE authority locks through the attempt. The command
   checks accepting_intake before any intake mutation.
5. `intake-session-command.ts:80` fingerprints server-resolved Organization,
   authenticated actor and normalized material, then takes the scoped
   Organization+operation transaction advisory lock. Identical requests replay;
   changed material/actor returns `IDEMPOTENCY_CONFLICT`.
6. `intake-session-persistence.ts:27` reads the existing operation through scoped
   joins to Session and Vehicle. For a new key, a SERIALIZABLE absence read still
   records a predicate dependency. PostgreSQL's lock granularity is physical
   relation/page/tuple coverage, not one application operation key per lock.
7. `intake-vehicle-resolution.ts:28` creates a distinct temporary Vehicle or
   resolves a confirmed same-Organization plate using the existing partial
   unique index and persisted row lock. Same-Location active custody uniqueness
   remains the final race arbiter.
8. `intake-customer-resolution.ts:61` serializes exact same-Organization phone
   resolution on a phone-specific advisory key, then applies zero/one/many
   semantics. Unique phones do not intentionally share that advisory key, but
   SSI scan/index coverage can still overlap. `:12` revalidates a proposed saved
   Customer using current same-Vehicle completed history inside the transaction.
9. `intake-session-persistence.ts:80` inserts CHECKING_IN/version-1 Session, safe
   VALET_SESSION_CREATED audit and durable operation record. Optional initial
   Guest issuance prepares a credential and database outbox in that same
   transaction; provider delivery happens separately after commit.
10. `intake-session-command.ts:136` commits. Errors attempt rollback at `:140`,
    preserve genuine constraint-to-domain mapping, and request lease release in
    finally at `:156`. Known real serialization abort means no attempt committed.
    Network/connection loss at COMMIT is an ambiguous outcome and is not 40001
    retry authority.
11. **Baseline** `intake-session-command.ts:168` immediately retried at most three
    times; at `:176–178`, a third caught `40001` became
    `INTAKE_CONCURRENCY_CONFLICT`. The extra throw at `:182` was defensive loop
    exhaustion. `src/common/http/api-errors.ts:81` maps that code to HTTP 409.
    It does not mean same-vehicle custody or idempotency mismatch.
12. The delivered `intake-serialization-retry.ts:13` owns the bounded retry policy;
    the executor delegates at `intake-session-command.ts:170`. The HTTP mapping
    and safe message remain unchanged.

### Why independent operations can conflict without lock waits

Two serializable transactions can both read absence on different keys in an
empty/small index and obtain overlapping SIReadLock coverage. Their inserts can
create read/write dependency edges in both directions. PostgreSQL detects a
serialization anomaly and aborts a participant with 40001. An abort can surface
at a later statement or COMMIT, not necessarily at the original absence read.
SIReadLock entries do not block writers, so a periodic sampler can show no ordinary
lock waits while the application still suffers serialization aborts.

The controlled probe captured four relation-level SIReadLock entries on
`intake_operations_pkey`, alongside expected authority tuple/page predicate locks.
It observed 13 failed 40001 attempts across eight logical requests; three logical
requests exhausted the baseline policy. The shared operation index coverage
exists even though operation IDs and vehicles differ. This demonstrates an
avoidable retry failure mode; it is not a complete reconstructed SSI conflict
graph for the Windows run.

The common User/Organization/Location access locks remain required authority
protection; SHARED locks are compatible among legitimate intakes. There is no
new exclusive Location-wide lock in this fix. Reused plate, operation identity
or phone may cause additional intended contention; Antigravity must report that
distribution rather than assume every 409 has the same cause.

### Windows artifact inspection and fixture implications

Read-only access through the connected PC tool inspected these existing ignored
files under the owner-provided `working` directory:

- `CAPACITY-HANDOFF-2026-10-28.md` (77 lines);
- `benchmark-workload.js` (256 lines); and
- `results/stage-diag-50vu-60sec-metadata.json` (386 lines).

No Windows source, script, artifact, process or DB was changed. Neither
`api-private.log` nor `preseeded-tokens.json` was opened or copied. Credential
patterns/fields were redacted from returned text. The handoff confirms the tested
SHA, independent per-VU sessions, Windows/Docker resource differences, and the
12 named INTAKE_CONCURRENCY_CONFLICT outcomes. Saved metadata independently
confirms 236 Check-In attempts, 224 creations, 12 unexpected 409s and zero pool
admission/acquisition-timeout deltas, with configured max=4 and queueCapacity=128.

`benchmark-workload.js:203–219` generates an operation identity from VU,
iteration and a random suffix and sends a TEMPORARY_DESCRIPTOR with **no Customer
input**. For this 60-second invocation, the VU/iteration components differ for
all legitimate new intakes. A temporary descriptor creates a distinct Vehicle
rather than resolving an existing plate. Thus customer-phone contention, saved
Customer history, initial Guest/outbox crypto, same-plate custody competition and
same-operation replay are not required to explain these 12 failures. The
expanded regression explicitly covers that no-customer temporary-vehicle shape.

The script uses `__ITER % 4 === 0` and a one-second sleep, so its intake cohort
can arrive in correlated waves rather than randomly spread over time. That can
amplify SSI retries on one Location but is a legitimate burst workload; it is not
a reason to count failed creations as successes. Retest the unchanged valid
profile first; any separately staggered arrival experiment must be labeled as a
different workload, not substituted to conceal the failure.

Two additional reporting observations do not explain the 12 correctness errors:

1. The saved operational numerator is 6,381 successful operations and uses the
   wrapper's 83.15-second elapsed period to report 76.74 RPS. The k6 aggregate
   rate is 8,399 / approximately 61.1 seconds = 137.43 RPS. Future before/after
   comparisons must use a common measurement window or explicitly label both;
   do not infer an operational fraction by dividing these differently timed rates.
2. The wider runtime-metric interval has releaseFailures delta=1, while queue,
   acquisition, query and transaction timeout deltas remain zero. Its cause and
   whether it falls inside the k6 active interval are unattributed. Preserve that
   counter for follow-up; do not silently classify it as the cause of a 40001
   retry-exhaustion result.

The harness's expected-conflict classifier at `benchmark-workload.js:225`
contains `VEHICLE_ALREADY_CHECKED_IN`, whereas this backend's actual custody code
is ACTIVE_VALET_SESSION_CONFLICT. This is a harness annotation mismatch for
future deliberate same-Vehicle negative probes, **not the source of the current
12 errors**. The script still correctly marks every non-201 Check-In as failed,
including expected negatives. Antigravity owns any harness correction; Codex did
not modify it. Operation IDs also need to remain distinct across later stages/
runs, not merely within one VU/iteration sequence.

### Transaction scope and Shift/MFA contract

Pure request normalization is already outside the transaction. Authority,
accepting-intake, idempotency, Vehicle/Customer resolution, custody uniqueness,
audit and optional Guest/outbox creation stay inside. Moving those checks outside
would introduce check/use races. UUID generation and encryption consume local
work but no measured evidence establishes them as this failure's cause; no
unrelated extraction or preflight redesign was made.

**Intake creation intentionally has no active-Shift precondition.** This is
explicit in `docs/05_ENGINEERING_RULES.md` (Intake session creation boundary),
existing authorization code and its regression tests. The task's requirement to
preserve required Shifts is verified on Shift-required Task/Dispatch operations,
including `queue-parking-task-command.ts:52` and task-queue authorization. No new
Shift condition is invented for intake. Company Admin/MFA management rules and
Staff session expiry/revocation remain unchanged; MFA is not a new field-intake
permission or a bypass for an unauthorized role.

## C. Reproduction and actual results

Tests use a new loopback-only PostgreSQL 17 container on port 55433, tmpfs data,
max_connections=100, and the existing ownership-aware repository harness. Each
suite migrates/provisions its own synthetic database/runtime role and cleans only
its owned resources. The existing owner DB and both earlier worktrees are unused.
The runtime pool limit was not increased.

| Scenario | Original implementation | Patched implementation / assertions |
|---|---|---|
| Eight employees, distinct temporary vehicles/phones/operation IDs, same Location | Unsynchronized probe: 6 commits, 2 exhausted; controlled first-wave probe: 5 commits, 3 exhausted | All eight commit; exactly eight Vehicles, Customers, Sessions, intake records and creation audits; zero Tasks or misplaced/resource-assigned Sessions |
| Eight temporary Vehicles with no Customer (Windows request shape), and eight distinct confirmed plates, same Location | Windows-like temporary/no-Customer overlap is also tested against baseline; no capacity claim | Each eight-operation case commits fully, with no Customer creation or duplicate custody |
| Three server-generated 40001 aborts after all intake/outbox writes, then successful transaction | Deterministic recovery regression FAILS: third abort becomes INTAKE_CONCURRENCY_CONFLICT | Attempt four succeeds; each rollback leaves zero partial entities, Tasks, outbox intent/delivery/envelope; one final Session/Customer/Vehicle/operation, two expected audit facts and one outbox set |
| Eight identical requests with one stable operation ID | Existing two-request regression already covered replay | Eight original results converge to one Session/Vehicle/operation/audit; material mismatch still denied |
| Eight competing operations, same confirmed Vehicle | Intended business conflict | One committed custody winner, seven ACTIVE_VALET_SESSION_CONFLICT results, no other failure codes |
| Persistent controlled 40001 | Original stops after three | Stops after five, same 409 classification, zero durable effects |
| Access revoked or intake stopped after rollback | Existing authorization contract applies | Fresh attempt denies respectively LOCATION_ACCESS_DENIED or LOCATION_INTAKE_STOPPED, zero intake effects |
| Successful COMMIT followed by simulated lost acknowledgement | Ambiguous outcome must not replay | One commit, one durable result, original ECONNRESET propagated, no automatic retry |

The controlled-abort test asks PostgreSQL to raise SQLSTATE 40001 before COMMIT,
so the server transaction is actually aborted after real writes. It is fault
injection to prove recovery/atomicity, not evidence of a naturally occurring SSI
edge. The separate first-wave overlap reproduction supplies the natural SSI
failure evidence without injected SQL failures.

The exact recovery suite was executed against the source from immutable baseline
`2c181fc3...` by temporarily replacing only the task-owned executor file, then
restoring it in a finally block. Baseline recovery result: two expected failures and three
passes (recovery after three aborts failed; the five-attempt assertion detected
baseline's three-attempt cap). The restored patch passed all five. No user or
owner source was replaced. Initial reproduction and baseline-failure logs remain
in task scratch; no existing test evidence was deleted.

## D. Implementation, invariants and remaining risks

| Changed file | Purpose and before/after behavior |
|---|---|
| `apps/api/src/modules/valet-sessions/intake-session-command.ts` | Replace immediate three-attempt loop with focused retry policy; executeOnce's transaction/authorization/effects remain intact; incidental formatting only elsewhere |
| `apps/api/src/modules/valet-sessions/intake-serialization-retry.ts` | At most five 40001 attempts, equal-jitter exponential waits, original exhaustion error; no retry on other codes |
| `apps/api/test/intake-concurrency-actors.ts` | Synthetic independent employees with exact shared Location grants |
| `apps/api/test/intake-serialization-test-pool.ts` | Decorate only test query execution to force real rollback or observe overlap/lost response; no additional runtime pool |
| `apps/api/test/intake-independent-concurrency.integration.test.ts` | Distinct temporary/confirmed vehicles, first-wave synchronization and integrity assertions |
| `apps/api/test/intake-operation-concurrency.integration.test.ts` | Eight-way exact replay and genuine same-Vehicle competition |
| `apps/api/test/intake-serialization-recovery.integration.test.ts` | Atomic recovery/outbox, bounded exhaustion, authorization/lifecycle rechecks and ambiguous commit behavior |
| `apps/api/test/intake-serialization-retry.test.ts` | Controlled-clock scheduling, cap, exact success propagation, non-retryable codes and unchanged HTTP 409 mapping |
| `docs/reference/check-in-concurrency-investigation.md` | Pre-code scope/design record, source evidence, results and independent handoff |

Schedule after failed attempts 1–4 is respectively **12–25, 25–50, 50–100,
100–200 ms**. The maximum **scheduled** additional wait is 375 ms. This is not
an end-to-end wall-clock deadline: query time, pool wait and event-loop delays
are additional. Successful first attempts have no retry sleep. Five attempts is
a bounded recovery budget, not a claim of universal eventual success.

A whole attempt completes its rollback and requests release before the retry
policy sleeps. Existing asynchronous pool reset may finish during that interval;
no business transaction lock is deliberately held during backoff. Each next
attempt reacquires a connection and freshly authorizes persisted User/member/
tenant/Location access. Normalization and the stable operation identity are
preserved; random IDs/crypto from aborted attempts have no committed existence.

Retry safety depends on **database-local atomic effects**. The actual initial
Guest hook performs local cryptography and same-transaction outbox writes; no
provider send occurs there. The successful fourth-attempt regression verifies
one generation/intent/delivery/envelope, and exact replay adds none. Future
extensions must keep provider/non-idempotent external effects outside this
retriable transaction. A returned 40001 at COMMIT means abort; connection loss or
an unknown commit outcome does not, and remains non-retryable here.

Security and data invariants preserved: SERIALIZABLE, lifecycle/authority locks,
tenant predicates, role/access checks, stable fingerprint, partial active-custody
uniqueness, atomic append-only audit, Guest/outbox uniqueness, existing MFA and
session lifetime/revocation, and existing production TLS/least-privilege roles.
No new migration/index, configuration policy, ValetSession transition or Task/
Dispatch effect was introduced. All new/modified authored files stay below 300
lines; common infrastructure has no new feature dependency.

Remaining risks: sustained SSI contention can still exhaust five attempts;
extra attempts may increase total DB work; rare failures and tail latency need
representative testing. Small/fresh-index behavior may differ from populated
benchmarks. The precise Windows per-attempt statement/SSI graph remains unknown; the
inspected request has no Customer/initial-issuance path. The wider-interval reset
failure and RPS measurement-window mismatch remain follow-up items. Nothing here proves 50–300 VU capacity.

## E. Verification

**150 focused tests passed across 17 distinct files:** 132 PostgreSQL test cases
in 14 files and 18 non-PostgreSQL tests in three files. There are no unresolved
verification failures. All eight new retry-policy unit cases and all ten new PostgreSQL concurrency/
recovery cases passed. The late-discovered Windows request shape added one
explicit no-Customer case to the already passing independent-concurrency suite.

The broad PostgreSQL invocation passed 103 tests in 11 api-postgres-race files
and 28 tests in three api-postgres-standard files. The updated independent
concurrency suite then passed all three cases, including the additional exact
Windows request shape, bringing distinct PostgreSQL cases verified to 132.
The separate non-PostgreSQL invocation passed all 18 tests. No test-only fixtures or source changes remain active outside the
isolated task branch.

Commands executed from the dedicated repository; the PostgreSQL invocation used
`PATH=/workspace/.cloud-setup/bin:$PATH`, `COREPACK_HOME=/workspace/.cache/corepack`
and `TEST_DATABASE_URL=postgresql://valet:valet@127.0.0.1:55433/valet` (synthetic
local credentials only). Corepack selected the repository's pnpm 10.34.5.

```sh
# PASS: contracts needed by focused HTTP/integration tests
corepack pnpm --filter @valet/contracts build

# PASS: broad PostgreSQL verification; 131 cases before adding the extra
# Windows-shape case (the current selection contains 132 cases)
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/intake-independent-concurrency.integration.test.ts \
  test/intake-serialization-recovery.integration.test.ts \
  test/intake-operation-concurrency.integration.test.ts \
  test/intake-session-command.integration.test.ts \
  test/returning-check-in-mutations.integration.test.ts \
  test/issue347-intake-state-races.integration.test.ts \
  test/issue347-intake-stopped.integration.test.ts \
  test/check-in-api.integration.test.ts test/staff-auth.integration.test.ts \
  test/staff-auth-native.integration.test.ts \
  test/staff-mfa-assurance.integration.test.ts test/staff-mfa-security.integration.test.ts \
  test/shift-eligibility.integration.test.ts test/staff-task-queue-authorization.integration.test.ts

# PASS: updated Windows-shape regression, all three independent-intake cases
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/intake-independent-concurrency.integration.test.ts

# PASS: 18 non-PostgreSQL tests
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/intake-serialization-retry.test.ts test/whatsapp-intake-issuance.test.ts \
  test/api-operation-runner.test.ts

# PASS on the restored patch / final source
corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm architecture:check
corepack pnpm exec prettier --check \
  apps/api/src/modules/valet-sessions/intake-{session-command,serialization-retry}.ts \
  apps/api/test/intake-{concurrency-actors,serialization-test-pool,independent-concurrency.integration.test,serialization-recovery.integration.test,operation-concurrency.integration.test,serialization-retry.test}.ts
git diff --check
```

Baseline reproduction used the same ownership-aware runner targeting
`test/intake-independent-concurrency.integration.test.ts` before any application
fix, and the deterministic baseline regression used
`test/intake-serialization-recovery.integration.test.ts` with the immutable
executor restored temporarily. Those expected FAIL results are described in C;
the same restored-patch recovery file passed all five tests immediately afterward
and again in the final combined run. After the Windows workload was inspected, the
final independent-intake suite was also run against the exact baseline: all
three cases (temporary/no Customer, temporary/distinct Customer, confirmed/no
Customer) failed with exhausted concurrency conflicts. Restoring the patch made
all three pass, including the request shape used by the Windows diagnostic.

An initial new unit-test assertion used Vitest fake timers against the real
`node:timers/promises` clock, which Vitest does not replace. That test fixture was
corrected to adapt its sleep to the controlled global timer; no runtime timing
change was needed for that test failure. An offline dependency setup attempt
lacked cached tarballs; the standard frozen-lockfile install succeeded without
repository dependency/config changes.

Existing suites cover wrong/missing tenant/Location, denied roles and revoked
access, retained no-Shift intake permission, required operational Shift denial,
Staff expiry/revocation and refresh replay, MFA assurance and abuse limits,
intake-stop races, customer ambiguity/history, input normalization, audit failure
rollback and custody conflicts. The new recovery suite adds grant/intake-stop
changes between attempts and a rollback-after-outbox case. No external provider
message is sent by these tests.

No large load, production traffic, full repository/browser E2E suite, deployment,
or manually triggered CI was run. Those omissions follow task ownership/scope.
Architecture checks emit only pre-existing grandfathered-file warnings; all task
authored files comply with the line ceiling. Tokens, QA credentials, .env files
and private API logs are not committed.

## F. Performance implications

| Concern | Measured fact | Prediction / limit |
|---|---|---|
| Check-In correctness | Baseline reproduction rejected independent operations; new recovery, replay, conflict and integrity assertions pass | Should reduce avoidable failures from transient 40001 collisions; external 99.5% gate still required |
| Transaction contention | SSI predicate overlap and natural 40001 observed; all isolation and locks unchanged | Jitter should reduce synchronized retry collisions; does not eliminate SSI dependencies |
| Connection hold time | Transaction body unchanged; rollback/release precedes policy wait | No extra business lock duration from sleeping; total connection-time across retries can rise |
| Pool pressure | Pool settings unchanged; supplied Windows run reported no admission/timeouts | Backoff spreads retry demand, while two additional possible attempts add bounded work; net effect unmeasured |
| Throughput and latency | Only focused functional tests, no equivalent before/after k6 run | No supported VU, RPS or percentile improvement claim; recovered requests can take additional delay |

## G. Antigravity handoff

Use the exact delivered commit on this branch and the same Windows/Docker
infrastructure, API process/worker counts, PostgreSQL 17 settings, pool limits,
timeouts, dataset/cardinality, optional Guest issuance flags and workload mix as
the failed validation. Do not compare these results to the earlier Linux host.
No migration or pool/auth configuration change is required. For the immediate
50-VU diagnostic comparison, retain API_ONLY_PROBE on both commits; a full-stack
capacity test is a separate workload and must not be compared directly with it.
Align the operational and aggregate RPS time windows noted above. Record release SHA,
all safe capacity settings and whether fixtures were fresh or already populated.

Retain independent per-VU Staff sessions with coordinated rotation within each
session. Keep one active accepting-intake Location if that is the intended
workload; it is a valid busy-site scenario. Legitimate distinct creations need
unique operation IDs and Vehicle identities. Report customer-phone reuse and
confirmed-versus-temporary identity distribution. Exact retries must retain their
original operation ID and material. Put deliberate same-Vehicle or changed-key
conflict probes in a separate expected-negative test cohort, not the valid-work
success denominator. No benchmark script was changed in this run.

### Stages

1. 5-VU smoke probe if needed after build/fixture verification.
2. 50 VUs using the same valid fixture and 60-second diagnostic workload.
3. 100 VUs.
4. 200 VUs.
5. 250 VUs.
6. 300 VUs.
7. Higher concurrency only after every preceding gate passes and owner approval
   permits that target.
8. 30-minute soak at the highest approved stable load, with valid renewed tokens
   throughout; independent refresh success must be measured.

### Mandatory gates and stop conditions

At every stage require:

- **>=99.5% successful legitimate Check-In operations**;
- **<0.5% unexpected HTTP failures**;
- **p95 <1000 ms**;
- **p99 <2500 ms**;
- **zero authentication refresh failures**;
- **zero database integrity violations**; and
- **no unexplained 409, 401, 429 or 503 spikes**.

Stop progression when any correctness gate fails; investigate latency/auth/error
breaches before raising load. Do not relabel exhausted Check-Ins, static pages or
rejected requests as successful operations. Resolve/reconcile ambiguous transport
outcomes through the existing durable operation contract rather than blind replay.

### Measurements and evidence to return

Capture total and successful operational RPS, new creations versus exact replays,
Check-In attempts/success/failure and error-code breakdown, p50/p95/p99 by endpoint
and success cohort, HTTP status/transport failures, login/refresh outcomes and
relative credential-expiry times. Correlate safe request IDs with the existing
private operation/HTTP metrics. Keep requestId as log correlation, never a metric
label. Preserve the existing pool gauges, rejection/acquisition-timeout counters,
acquisition histograms, API/PostgreSQL/worker CPU/RAM and process inventory.

Collect PostgreSQL SQLSTATE-40001 counts/phase information safely in the isolated
benchmark if exhaustion remains. Existing public INTAKE_CONCURRENCY_CONFLICT is
an exhausted logical request, not a count of individual attempts. Nonblocking
SIReadLock activity must not be inferred from ordinary lock-wait samples alone.
Capture safe predicate-lock relation/page aggregates and test-data/index
cardinality/statistics where feasible. Do not publish query parameters, raw
server/API logs, credentials, tokens or setup_data.

Additional evidence needed to attribute the original 12 individually: safe
per-request time/code/correlation records and PostgreSQL SQLSTATE/attempt-phase
or predicate-dependency evidence, extracted locally without sharing private logs
or query parameters. Handoff, workload generator and stage metadata have already
been inspected read-only via the connected PC tool at the provided Windows path.
The file set shows the exact tested SHA and safe pool settings. Preserve the
private log/token files and existing results in place; no new k6 run was executed
by Codex on either host.

## H. Git delivery

Implementation commit: `3336c3a331b7b9d42d56f0f845dd954abe39709c`
(`fix(api): back off bounded serializable intake retries`).

Baseline and isolated branch/worktree are recorded at the top. The previous
performance branch and owner worktree remain unchanged. The final response
records exact implementation/documentation commits, branch-only push status,
local/remote HEAD equality and clean worktree verification. Main is not modified
or merged, no PR is created, and nothing is deployed.

## Pre-code scope/design record

Eight independent employees at one authorized, accepting-intake Location with
unique operation IDs, vehicles and customer phones reproduced real PostgreSQL
40001 serialization aborts and INTAKE_CONCURRENCY_CONFLICT exhaustion. A controlled
first-wave overlap reproduced five commits and three exhausted requests. Predicate
lock sampling found SIReadLock relation coverage on intake_operations_pkey; these
are nonblocking SSI dependency tracking, not ordinary lock waits.

Baseline retries a whole SERIALIZABLE transaction three times immediately.
Independent operations can overlap predicate/index coverage even when their exact
keys differ. Immediate retries reenter the same competing workload. Preserve all
isolation and locks; bound retry attempts to five with equal-jitter exponential
backoff of 12–25, 25–50, 50–100 and 100–200 ms. Maximum added scheduled wait is
375 ms, outside the rolled-back/released attempt. Persistent 40001 still returns
existing 409. Do not retry domain conflicts, connection loss, or ambiguous COMMIT.

Affected entities: Vehicle, optional Customer, new CHECKING_IN ValetSession,
AuditEvent, IntakeOperation; optional transaction-local initial Guest credential
and outbox rows. No Task or Dispatch transition, no UI, configuration policy,
authentication lifetime, MFA, pool limit, schema, index or migration change.
Current tenant/membership/role/Location authorization and lifecycle locks are
reacquired for every attempt. Intake has no active-Shift prerequisite under its
accepted contract; later Shift-required operations retain their own checks.

All attempt effects must remain database-local and atomic. Production initial
Guest issuance encrypts locally and inserts an outbox; it does not send a provider
message. Rolled-back UUID/random/crypto work can repeat, but no successful external
side effect is replayed. New retry tests will force real server aborts after
writes and verify complete rollback, single eventual durable effects and no
replay of a lost COMMIT acknowledgement.

The existing executor is below 300 lines. Extract only its retry policy into a
small named module, retain executeOnce unchanged, and add focused tests following
the existing isolated PostgreSQL harness. Do not change public error semantics.

At initial cloud investigation the Windows D: path was not mounted. Later,
read-only connected-PC inspection obtained the handoff, workload source and safe
stage metadata as recorded above. Private logs and token fixtures were not read.
