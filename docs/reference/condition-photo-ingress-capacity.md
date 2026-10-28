# Condition-photo concurrency remediation

## Pre-code scope and design (2026-10-28)

Fetched baseline: `5e0a39dc7dceabdcbbd03aac5800fccee28f0dfb`.
Dedicated branch: `fix/condition-photo-ingress-capacity`.

Affected entities: transient JPEG jobs; existing photo operations, attempts,
VehiclePhoto and audit records retain their existing journal and transactions.
No ValetSession/Task transition, schema/index, organization/location policy,
Shift eligibility, authentication, qualification policy or production config change.
Inside accepted DEC-104 server-mediated photo scope. Existing pre-parser auth,
anti-abuse, ingress admission and reservation/finalization reauthorization remain.

Confirmed source mechanism: module-global `activeJobs >= 2` immediately rejects
canonicalization and retained-object verification before durable reservation.
Each transform starts one Worker and terminates it; no queue exists.
The exact two-job value is a protective local engineering bound, not an image
format/business requirement or a measured production capacity specification. Four HTTP
multipart requests may already hold ingress slots. Thus three valid independent
images can encounter decoder 503 despite sufficient ingress capacity. This
reproduces the supplied QA pattern; the original missing error body prevents
conclusive attribution of that individual HTTP response.

Selected change: retain two fresh isolated Workers, add FIFO admission with at
most two waiting jobs and a 5-second maximum queue wait. Preserve the separate
5-second processing deadline, image protections and termination before releasing
capacity. Bound aggregate queued source bytes to 16 MiB. No tenant-priority or
queue bypass: admitted jobs run FIFO, preventing later tenants overtaking earlier
ones. Existing user/session rate limits and four-request multipart cap remain.
No claim of guaranteed tenant bandwidth at overload.

Cancel queued/active decoding on client disconnect, before DB reservation only.
After decoding, cancellation is checked before entering the journal; once the
reservation boundary is crossed, existing write-once storage/status/reconciliation
semantics continue, even after disconnect. Never retry an uncertain mutation.

Keep fresh Workers for hard per-job native state isolation and deterministic
crash/timeout cleanup. Reuse would require a persistent protocol and measured
benefit; it is not necessary to fix immediate rejection. Separate scheduler,
Worker runner, error type and feature-owned fixed-schema diagnostic metrics.
Every new/modified authored file stays below 300 lines. No common-to-feature
observability import or new PostgreSQL pool.

Verification/results and QA handoff will be recorded after execution.

## Verdict and original QA evidence

**Confirmed avoidable application admission bottleneck, corrected in source.**
The original third request was rejected immediately; accepted work can now wait
briefly without increasing decode parallelism. This is burst tolerance, not a
claim that sustained photo throughput, PostgreSQL capacity or production sizing
is solved.

Read the supplied `PHOTO-CAPACITY-GATE-20261028.md` attachment. Its instructions
were treated as evidence/recommendations; the chat implementation request is the
authority. That report records genuine native login, Check-In, JPEG, private S3
read-back and DB reconciliation on the same baseline: single-small and
single-large PASS, three-concurrent FAIL with 2/3 VERIFIED and 1 HTTP503. The
rejected session remained CHECKING_IN with zero operation/verification/audit
rows. The response body code was not captured. We reproduced the specific
source failure independently; we cannot retrospectively prove the exact public
code of that historical response. No original Windows private logs, credential
fixtures, tokens, `.env`, images or QA database were accessed in this task.

The legacy native-login and worker-preloader issues were already corrected in
QA. This patch does not repair them again. It does not alter Windows MinIO ports
or its preserved named volume. Existing QA preflight must use the already
approved scoped 59110/59111 override, not the obsolete helpers expecting 59000.

## Architecture and precise mechanism

Baseline `apps/api/src/modules/vehicle-photos/condition-photo-jpeg-decoder.ts:78`
rejects on `activeJobs >= 2`; retained-byte verification has the same guard at
baseline line 115. `condition-photo-upload-executor.ts` fully canonicalizes
before reservation. The separate multipart ingress cap admits four requests.
This is an intentional protective limit with unnecessarily abrupt admission for
a healthy three-image burst, not a JPEG-size defect or PostgreSQL pool proof.

Before: authorized multipart -> four-request ingress -> two-job immediate
rejection -> fresh Worker -> reservation -> conditional PUT -> exact GET ->
mark stored -> fenced finalization/audit -> authorized status.

After: the same chain, with one shared **two-active/two-waiting FIFO** between
multipart and the fresh Worker. Upload and trusted stored-byte verification
share it. FIFO accepted jobs cannot be overtaken by another user or tenant.
This is finite first-arrival fairness, not reserved per-tenant bandwidth or a
promise to admit everyone at overload. Existing durable user/session limits
remain active. There is no authorization cache or tenant-key telemetry.

### Admission, deadlines and overload

- Active jobs: **2**, unchanged; each job gets a new Worker.
- Waiting jobs: **2**, with aggregate queued source bytes <=**16 MiB**.
- Queue waiting: **5,000 ms maximum** on a monotonic clock. A timer removes
  expired work; dispatch also checks its age before starting, so delayed timer
  delivery cannot start stale work. Expiration/cancellation removes its buffer
  reference and listener without executing the decoder or reserving a DB row.
- Worker processing: existing **5,000 ms** parent deadline and Sharp five-second
  limit. Isolate startup/import/clone is inside the parent deadline. Cleanup is
  awaited before releasing an active slot. Termination/native cleanup can add
  elapsed time; this is not a hard five-second end-to-end HTTP SLO.
- Multipart stays **4 in flight**, each <=8 MiB, with existing 60-second parse
  deadline and unchanged wire/parts limits. Ingress slots remain held through
  processing/storage/finalization and released in finally. The fifth parser is
  still rejected. Trusted read verification also consumes decoder slots, so
  decoder-full and ingress-full are separately counted.
- Full queue, wait expiry, Worker crash/exit-without-result, processing timeout
  and cancellation fail closed with existing
  `CONDITION_PHOTO_STORAGE_UNAVAILABLE` (503). These reasons are distinct in
  private diagnostics. An actually undecodable image remains 422 and file-size
  violations retain 413. No public error schema or Retry-After policy changed;
  clients must not automatically repeat an uncertain upload.
- Crash/start failure does not poison later jobs: every subsequent job starts a
  fresh Worker. Even a zero-code exit without a result settles as unavailable.
  Error/exit/cancel/timeout races settle only once; listeners/timers are bounded.

A reusable pool could reduce startup time, but requires a persistent protocol,
job identity, native-state reset and lifecycle recovery. The reproduced failure
does not require that change. Fresh Workers retain the existing isolation and
avoid retaining native image state between jobs. No new decoder dependency.

### Disconnect and uncertain outcomes

The controller listens to **response close**, including disconnect after the
request body has already ended; IncomingMessage close alone would cancel normal
fully received requests. It passes an AbortSignal only into pre-reservation
processing. A queued job is removed; active decoding is terminated and awaited.
The source buffer is wiped only after that work settles.

The executor checks cancellation once more before invoking reservation. Once it
enters the existing reservation routine, cancellation does **not** abort SQL,
PUT/GET or finalization. This protects uncertain committed outcomes. Existing
15-second object-operation deadlines, 120-second leases, 30-minute operation
expiry, short SQL transactions and status/reconcile flow remain unchanged.
There is no transaction or checked-out PostgreSQL connection while queued or
decoding. Pre-parser auth already ended its read-only transaction.

A disconnect near finalization may leave a verified operation without a received
HTTP201. The runner must query the authorized operation status before attempting
anything else. A timeout/unknown PUT is journaled PENDING; no blind storage or
mutation retry is added. Database failure after PUT keeps the existing recovery
path. This patch does not claim to eliminate provider/network ambiguity.

## Security and database invariants

Unchanged: JPEG-only real decoding, 8 MiB input/output, 4096-pixel sides,
12-million-pixel bound, strict decode failures, single-page validation, EXIF
orientation application and stripping, canonical quality/version, SHA-256 over
source and output, exact private-object read-back and write-once key semantics.
The worker still rechecks normalized format/dimensions and metadata removal.

`condition-photo-authorization.ts:27` still locks/rechecks the exact current staff
session and persisted User/membership/Organization/Location authority at each
protected DB boundary. Native login/15-minute expiry/rotation, MFA, revocation,
rate limits and all existing Shift eligibility rules are unchanged. Photo
commands do not gain a new Shift requirement; DEC-104 U-006 explicitly preserves
their existing authority. New waiting time cannot extend a credential or grant:
reservation/finalization must still freshly pass authorization.

No migration, isolation setting, DB lock, constraint, pool limit, SQL function,
audit/outbox rule, public API shape or custody transition changed.
`20261015008200_issue_215_condition_photo_policy_recovery/migration.sql:55`
continues to reserve exact scope/source fingerprint and fenced attempts;
`20261015008300_issue_215_condition_photo_policy_recovery_finish/migration.sql:138`
continues to lock current lifecycle/policy/authority and operation/attempt,
then atomically select the attempt, insert the photo/verification/availability,
update the journal and append its one authoritative audit. Its FK/unique fences
and rollback semantics are preserved. The SQL remains the correctness boundary,
not the new process-local scheduler.

Production P3 qualification remains fail closed with exactly its existing
configuration/test-only policy. No flag was enabled in a production process.

## Observability

Feature-owned `ConditionPhotoMetricsPulse` emits a fixed-schema
`CONDITION_PHOTO_METRIC` JSON sample every 30 seconds when CheckInModule is live.
It has no second PostgreSQL pool, global filter or common-to-feature import.
The exported singleton snapshot is also available to a same-process private QA
observer; it is **not a new public endpoint**. Existing RUNTIME_METRIC retains
CPU/RSS/heap and pool checkout/wait/rejection measurements, while existing
request/operation telemetry retains HTTP status, cancellation and business
error attribution. Collect all three streams in matched windows.

New metrics: active/waiting/queued bytes; active/rejected ingress; successful
canonicalizations; verified upload executor completions; queue full/expired,
cancellation, Worker crash, processing timeout, invalid/too-large image and
storage failure/timeout/unknown counters. `verifiedUploadExecutions` counts server-observed authorized VERIFIED returns,
including identical replays and concurrent duplicate executions. It is not the
number of distinct committed photos or delivered HTTP successes. Derive unique
new photos from authoritative DB reconciliation and delivered successes from
the client ledger; do not mistake this counter for exactly-once audit evidence.
Failure counters are events, not guaranteed one-per-HTTP-request totals.

Fixed-size histograms and totals cover queue wait, slot occupancy (including
cleanup), Worker startup/import, metadata validation, combined pixel
read/normalization/re-encode, termination, S3 PUT and exact GET (including body
read). GET/PUT durations include failures. The fixed percentile fields are
**bucket upper bounds**, not exact observations; null means no samples or an
overflow beyond the largest 15-second bound. Buckets are non-cumulative; derive
window percentiles from bucket deltas in the same process. Lifetime percentile
fields cannot be subtracted. Counters keep fixed cardinality and allocate no
per-user/image/time-series histories. No credentials, IDs, URLs, keys, hashes,
raw provider errors or image bytes enter these samples.

QA must collect exact per-request p50/p95/p99 by JPEG size and failure reason,
photos/second, Node event-loop delay/utilization and host/process/container
CPU/RAM/IO separately. Process CPU counters do not establish event-loop health.
Do not read private API logs; use the existing sanitized aggregate observer and
native client ledger. Match release SHA, PID/creation identity and monotonic
uptime before subtracting counters; obtain a fresh before and post-drain after
snapshot and keep actual traffic duration separate from orchestration duration.

## Focused measurements (not a capacity benchmark)

Node v24.19.0, local Linux execution container, compiled production decoder,
synthetic random-pixel JPEGs generated before measurement. Three serial samples
per image size, then three bursts of all sizes; 18/18 canonicalizations succeeded,
zero decoder rejection/crash/timeout and zero slots left active/waiting. Original
Windows fixture bytes were not copied. Noise fixtures are deliberately larger:
323,167 / 1,013,087 / 2,592,613 bytes at the same dimensions. These measurements
exclude HTTP/auth/DB/S3 and are **not comparable before/after deployment results**.

| Input | Wall ms range | Process CPU ms range | Startup/import ms range | Pixel decode/normalize/encode ms range | Peak process RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 720x540 | 73.19–93.10 | 99.27–118.29 | 54.01–71.89 | 11.87–16.03 | 109.3 |
| 1280x960 | 110.47–125.07 | 147.20–155.63 | 65.14–76.21 | 32.92–39.50 | 125.7 |
| 2048x1536 | 133.99–179.69 | 185.88–242.17 | 53.93–87.50 | 72.00–82.79 | 153.0 |
| Three together (whole burst) | 231.09–258.43 | 403.54–444.31 | 168.80–205.23 summed across jobs | 145.44–153.47 summed across jobs | 200.7 |

Single-image metadata times were 1.40–6.73ms, termination 0.01–3.56ms. In the
bursts the third image waited 95.92–108.87ms; no parallelism increase occurred.
Startup/import is measured from Worker creation to executing the loaded worker
module, using aligned monotonic origins, and reported in its single result
message. Normalization includes full pixel decoding/re-encoding and canonical
metadata checking; it does not isolate pure libjpeg CPU time. Parent slot
occupancy includes clone/startup/result/termination and differs from full
canonicalization wall time. CPU is process-wide, not pure libjpeg time. RSS is
sampled every 5ms and is a process high-water observation, not per-image RAM;
allocator reuse, retained source fixtures and missed between-sample peaks apply.
Three samples do not justify useful production p95/p99 estimates or sizing.

The queue retains at most 16 MiB of source references; it does not make another
copy. Four ingress source buffers total <=32 MiB, but multipart chunks+concat can
transiently duplicate data, Workers clone input, outputs/read-backs add buffers,
and libvips allocates native memory. Existing 256 MiB Worker old-generation and
4 MiB stack limits **do not cap native memory or total RSS**. File/pixel/output,
worker/job-count and ingress bounds keep work finite; do not treat 32 MiB or the
sampled 200.7 MiB as a production memory budget. Measure worst permitted images,
process inventory, burstiness, native allocation and container headroom before
sizing. No exact hard OS memory cap is claimed by this patch.

Queueing can increase request lifetime versus immediate rejection and can allow
more legitimate operations to reach S3/PostgreSQL. Sustained capacity remains
limited by two decoders and the other services. No PostgreSQL limit was changed;
its previously observed pool saturation is a separate unresolved capacity gate.

## Changed files and responsibilities

All paths below are relative to the repository root.

- `apps/api/src/modules/vehicle-photos/condition-photo-decode-queue.ts`: bounded
  FIFO, age checks, cancellation, capacity recovery, shared upload/verify admission.
- `condition-photo-worker-runner.ts` in that directory: fresh Worker isolation,
  startup/result/crash/exit/timeout/cancel cleanup and stage timing.
- `condition-photo-decode-error.ts`: shared error type without a scheduler/decoder
  circular import; decoder re-exports the same existing public class name.
- `condition-photo-jpeg-decoder.ts`: route both operations through admission;
  keep byte/hash/normalization checks and optional pre-reservation cancellation.
- `condition-photo-jpeg-worker.ts`: timing fields only; no validation/encoding
  policy change; retains one terminal result message.
- `condition-photo-processing-metrics.ts`, `condition-photo-metrics-pulse.ts`:
  bounded, fixed-cardinality counters/histograms and feature-owned lifecycle.
- `condition-photo-upload-executor.ts`, `condition-photo-backend.service.ts`:
  carry signal to decoder, check before reservation, count new verified uploads.
- `s3-private-photo-store.ts`: timed PUT/GET and classified failure diagnostics;
  unchanged SDK retry count, commands, HTTPS configuration and write semantics.
- `apps/api/src/modules/check-in-api/condition-photo.controller.ts`: response
  disconnect signal and guaranteed listener/ingress cleanup.
- `condition-photo-ingress.ts` in that directory: gauge/rejection counters only;
  cap remains four. `check-in.module.ts`: register feature diagnostic lifecycle.
- `apps/api/test/condition-photo-jpeg-concurrency.test.ts` and
  `condition-photo-jpeg-fixture.ts`: true JPEG three-size regression, dimensions,
  source hashes and metadata checks with synthetic noise fixtures, followed by
  three concurrent trusted stored-byte verifications through the same queue.
- `condition-photo-jpeg-decoder.test.ts`: additional side/pixel-limit negatives.
- `condition-photo-decode-queue.test.ts`: two active/two waiting, FIFO/byte budget,
  fifth-job rejection, wait deadline, cancelled waiters and recovery.
- `condition-photo-worker-recovery.test.ts`: actual Worker crash/clean exit,
  controlled startup/hang, timeout, actual active-worker cancellation and recovery.
- `condition-photo-execution-cancellation.test.ts`: real decode plus instrumented
  journal/store boundaries; pre-reservation denial, late disconnect/finalization,
  controlled DB failure and unknown PUT without retry. These are unit boundary
  proofs, **not** substitutes for real-PG rollback/atomicity tests.
- `condition-photo-disconnect-http.test.ts`: actual socket/fetch abort through
  Nest, multipart and decoder queue; auth boundary is a transport-only fixture.
- `condition-photo-processing-metrics.test.ts`: bounded bucket math, snapshot
  isolation and fixed-schema privacy.
- `condition-photo-concurrent-http.integration.test.ts`: protected real Nest,
  restricted PG and MinIO three-upload qualification, source/retained-object hash,
  scope/attempt/audit association, identical/different replay, concurrent duplicate operation IDs, condition completion
  and complete Check-In. Requires the existing attested protected infrastructure.
- `scripts/test-harness/issue215-test-manifest.mjs` and
  `issue215-api-classification.test.mjs`: register/prove that new test belongs
  exclusively to the protected lane, with all existing attestation guards intact.
- This tracked report. Formatting changes in touched files use project Prettier;
  no authored code file exceeds 300 physical lines.

## Reproduction and automated verification

Before runtime edits, the new `condition-photo-jpeg-concurrency.test.ts` alone
failed against baseline at `canonicalizeConditionJpeg:79`, throwing
`CONDITION_PHOTO_STORAGE_UNAVAILABLE` on the third input. After the patch, that
same regression passes. The earlier failed attempt while dependencies were
still being installed (`vitest` not yet present) was a setup failure, not the
baseline reproduction. Setup was then completed and the actual baseline failure
captured. Subsequent intermediate test/type/lint failures were fixed; final
results below are the executed verified results, not those intermediate runs.

From repository root, used Node v24.19.0 and pnpm v10.34.5:

```sh
corepack pnpm install --offline --frozen-lockfile
corepack pnpm --filter @valet/contracts build
corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm architecture:check
node --test scripts/test-harness/issue215-api-classification.test.mjs
node --test scripts/test-harness/classification.test.mjs scripts/test-harness/issue215-api-classification.test.mjs
```

PASS: install with unchanged lockfile; contracts build; API typecheck/lint/build;
architecture with existing grandfather warnings only; four focused ownership tests (also included in the 16-test combined classification check).
Native optional-dependency install-script warnings did not prevent executed auth
or Sharp tests from running. No build-scripts policy was relaxed.

The final three-size test was also rerun after adding concurrent stored-byte
verification assertions: one file/one test PASS, with focused ESLint PASS.

Final non-PostgreSQL selection: **25 files, 113 tests PASS**, zero skipped or
unhandled errors:

```sh
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/condition-photo-jpeg-concurrency.test.ts \
  test/condition-photo-jpeg-decoder.test.ts \
  test/condition-photo-decode-queue.test.ts \
  test/condition-photo-worker-recovery.test.ts \
  test/condition-photo-execution-cancellation.test.ts \
  test/condition-photo-processing-metrics.test.ts \
  test/condition-photo-disconnect-http.test.ts \
  test/condition-photo-http.test.ts \
  test/condition-photo-multipart.test.ts \
  test/condition-photo-ingress.test.ts \
  test/condition-photo-private-storage.test.ts \
  test/condition-photo-s3-wire.test.ts \
  test/condition-photo-admission.test.ts \
  test/condition-photo-db-errors.test.ts \
  test/condition-photo-qualification-gate.test.ts \
  test/condition-photo-qualified-receipt.test.ts \
  test/condition-photo-status-query.test.ts \
  test/condition-photo-maintenance-policy.test.ts \
  test/condition-photo-maintenance-restore.test.ts \
  test/condition-photo-maintenance-sweep.test.ts \
  test/condition-photo-maintenance-s3.test.ts \
  test/condition-photo-maintenance-integrity.test.ts \
  test/check-in-photo-preflight.test.ts \
  test/check-in-photo-command-credential.test.ts \
  test/guest-t4-observability.test.ts
```

Real PostgreSQL 17 selection: **nine files, 62 tests PASS**, zero skipped:
36 tests/three standard files and 26 tests/six race files. Used the previously
owned, initially stopped `vaylet-pool-200vu-pg17` loopback:55435 test container;
created/dropped only harness-owned disposable databases/roles. TEST_DATABASE_URL
was injected for this local synthetic target; its credential value is omitted.
PATH selected a task-local Docker wrapper that unsets endpoint/context/TLS
selectors and explicitly addresses `/var/run/docker.sock`, preserving proxies.

```sh
PATH=/workspace/work/photo-tools/bin:$PATH corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/staff-auth-native.integration.test.ts \
  test/staff-mfa-assurance.integration.test.ts \
  test/dashboard-authorization-fence-concurrency.integration.test.ts \
  test/dashboard-location-authorization.integration.test.ts \
  test/shift-eligibility.integration.test.ts \
  test/intake-independent-concurrency.integration.test.ts \
  test/intake-operation-concurrency.integration.test.ts \
  test/intake-serialization-recovery.integration.test.ts \
  test/guest-t3-runtime-resilience.integration.test.ts
```

These cover native expiry/refresh/replay, MFA, revoked Location/tenant fences,
existing Shift eligibility, concurrent independent intake, duplicate operation
IDs/same-vehicle competition, serialization retries, rollback and DB recovery.
They do not execute photo finalization SQL under the modified photo path.
Read-only post-run reconciliation found zero active harness clients and zero
remaining `vlt_005b_*` owned databases. No QA/production dataset was used. The reused PG container was stopped again.
No new PG/MinIO container remains. After proving the task-owned container labels
absent, removed only the two fresh failed-start credential/ownership files;
kept sanitized attempt logs and all preexisting evidence.

**Infrastructure blocked, not PASS:** protected photo HTTP/PG/MinIO, the new
three-upload end-to-end test, existing protected photo rollback/duplicate-op/
revocation/finalization races and real unknown-S3-outcome suites were not run.

Attempted:

```sh
PATH=/workspace/work/photo-tools/bin:$PATH node scripts/test-harness/issue215-worker9-pg-fixture.mjs start
PATH=/workspace/work/photo-tools/bin:$PATH node scripts/issue215-local-s3/start.mjs
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/condition-photo-concurrent-http.integration.test.ts
```

The PG helper refused its pinned image identity: it expects image ID
`sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193`;
the local `postgres:17-alpine` tag differs. It removed only its just-created
container. The direct protected test command stopped before test collection
because no attested URL was available. MinIO start failed on
`https://cgr.dev/v2/` with **Forbidden** under the current cloud network policy;
no MinIO container started. No attestation, network restriction or production
storage policy was bypassed. These are explicit release-validation blockers,
not skipped tests counted as green. The new protected SQL query was checked
against the existing migration/HTTP fixture; execution remains pending.

The final verification log paths are task-local outside Git:
`/workspace/work/photo-baseline-regression.log`,
`photo-delivery-unit-tests.log`, `photo-postgres-regressions.log`,
`photo-delivery-compiled-profile.json`, `photo-delivery-classification.log` and
`photo-protected-preflight.log`. They contain synthetic test output, are preserved
for review, and are not staged. No prior benchmark evidence was deleted.

## Remaining risks and Antigravity handoff

**Runtime capacity validation pending. No production approval or server-size
recommendation.** The isolated decoder regression passes; the genuine native
login -> HTTP -> PG/MinIO -> completed Check-In gate on the delivered release
has not been executed here. Full protected photo DB/security/recovery coverage
must run in its approved attested environment before release acceptance. The
additional 16 Node harness classification tests pass; they prove ownership and
preflight behavior, not photo throughput.

The queue is process-local. Each API process has its own two Workers/two waiting
jobs; multiply resource demand by actual process/replica counts. No cross-process
fairness or global CPU controller is claimed. FIFO protects accepted work, while
an overloaded process may still reject a tenant. Native allocation, scheduler,
GC and OS shutdown behavior at stress remain runtime gates. Main-thread hashing,
cloning and canonical byte copies are unchanged. Reuse may be worth a later
measured change if startup dominates; it is not bundled into this correction.

The 60-second limit in the multipart parser bounds receiving/parsing, not the
whole photo business operation. Staff photo commands use the ordinary string
operation policy, not the six-second Guest T3 database deadline. Reverse proxy,
client and deployment request deadlines must be recorded in QA; they were not
changed or assumed here. A new five-second queue wait is additional to decode,
object operations and existing DB bounds. Never increase client/proxy timeouts
silently, and reconcile any mutation whose response is lost near finalization.

### Preconditions and harness adjustments

1. Owner selects the delivered release for the **existing isolated QA** API.
   Verify exact binary/source SHA, one intended API process, existing pool and
   waiter settings, fixture snapshot, PG17 and private MinIO identity/HTTPS
   readiness. No production P3 flags, new pool limits or new bucket policy.
2. Preserve prior failing stages and ledgers. Use native
   `/v1/staff/auth/native/login`, actual expiring tokens and existing refresh
   coordination. Keep the already-corrected main-thread-only diagnostic
   preloader; do not inherit a broken exclusive-file preloader into Workers.
   The Worker retains a single result message, with optional numeric timing
   fields; direct-worker diagnostics must not depend on an exact object shape.
3. Keep the current Windows MinIO override and private HTTPS route. Do not run
   the obsolete Compose/provisioning helper expecting the host-reserved 59000
   ports. No new networking/public Funnel or production provider approval.
4. Capture sanitized HTTP response codes as well as statuses for every failed
   photo. Preserve operation IDs in the **private client ledger**, never add
   secrets or raw images to telemetry/Git. Correlate no-row pre-reservation
   failure versus PENDING/VERIFIED post-reservation outcome. Record original and
   canonical hashes privately; reconcile every ambiguous operation read-only.
5. Record queue and processing exact per-request times where the approved
   private observer permits, plus same-process histogram/counter snapshots
   before, during and after drain. Keep ingress, decoder, PG, S3, auth and
   business conflicts distinct. Sample resource/event-loop/queue peaks at useful
   frequency; a 30-second pulse can miss a short three-photo burst.
6. Run the protected test selection above plus existing real-http-negative,
   policy-recovery, staff-credential-races, recovery/real-S3/unknown-outcome and
   photo P1 DB integrity/audit/privilege suites using their existing attested
   runner. Do not switch to an arbitrary TEST_DATABASE_URL or spoof CI flags to
   evade ownership. The new HTTP test seeds valid scoped test bearers; it does
   not replace the separate genuine native-login QA gate.

### Gate A: three real photos, then separate photo ingress

First single small, medium and large, then three authorized distinct staff
members near-simultaneously with independent sessions/resources/operation IDs
and the existing validated JPEGs. Require **3/3 verified and completed
Check-Ins**, 100% valid operations, no unexpected HTTP failures, no unresolved
outcomes, exact source/canonical hashes, one selected attempt/verification/audit
per successful operation and no cross-scope associations. Independently GET the
stored exact object version as well as checking DB facts; the original Windows
reconciler did not perform that second independent GET.

Confirm fourth in-flight request can queue when appropriate, genuine fifth
parser/decoder overload is honestly rejected, wait expiry is bounded, and later
requests recover. Use controlled synthetic fault tests for disconnection while
queued/active/at finalization, Worker crash, S3 unknown PUT/read-back outage and
DB rollback. Respect expected duplicate/competing-operation business conflicts;
never reinterpret them as successful independent operations or hide 503s.

Only after correctness passes, run photo ingress separately at measured arrival
rates with the size mix, not a simultaneous 200-photo assumption. Record
successful requests/sec and distinct committed photos/sec separately, exact
latency percentiles per size, queue wait, slot occupancy, Worker stage times,
PUT/GET, ingress/decoder rejection reasons, PG pool and resource behavior. Select
an agreed upload latency SLO explicitly; five-second decode protection is not a
promised end-to-end photo SLO. No corrected official Gate A result is claimed.

### Gate B: full domain lifecycle

Prepare independent authorized actors, Shifts where the command requires them,
key slots, parking spots and tasks across the eight QA locations. Use current
contracts and domain APIs, never SQL state/version updates to fabricate later
custody states. For each vehicle:

1. Create intake, upload/reconcile verified condition photos, condition completion
   and complete Check-In through `/v1/staff/check-in/...`.
2. Perform Parking task assignment/acceptance and
   `/v1/staff/valet-sessions/:sessionId/start-parking`, key-slot assignment
   (`.../key-slot/assign`) and `.../confirm-parked` with distinct physical resources.
3. Issue authorized guest access, exchange to the normal guest context and use
   `/v1/guest/session/request-retrieval`; assign/accept the retrieval task.
4. `.../start-retrieval`, retrieve the vehicle/key through the domain commands,
   `.../mark-ready`, issue guest pickup verification, `.../initiate-handoff`,
   `.../verify-pickup-code` or `.../verify-dynamic-qr`, and `.../complete-handoff`.
   Observe current payment/release guards rather than bypassing them.
5. Check authoritative COMPLETED/Check-Out state, resource release, task/custody
   history, guest visibility, audit/idempotency and exactly-once photo facts.

Use the repository's existing task endpoints and current request schemas, expected
versions and authority returned by the previous step. The route list is an
execution map, not permission to set arbitrary states or guess proof values.
Explicitly test shared-resource competition separately; legitimate conflicts
must remain failures for the competing command. This whole real-photo lifecycle
was **not run** in this task.

### Gates C/D: representative load and production sizing

After A/B pass, reuse 200 distinct employees across eight locations with normal
think times and independently varied action frequencies. Calibrate arrival,
checkout, dashboard/task/key/guest/photo-view rates and small/medium/large mix to
an explicit operational scenario. Model vehicle inventory/residence of 1/2/3
hours without changing completed session state in SQL. A synthetic preexisting
inventory is not evidence of elapsed-hour behavior; true aging needs the elapsed
run. Distinguish session preparation from actual simultaneous login load, and
model authentic login/refresh traffic according to the chosen scenario.

Run at least five minutes of the mixed 200-employee workload, then a 30-minute
soak spanning real 15-minute access expiry and refresh rotation. Only if all
correctness/resource gates pass, increase load progressively (250, 300, then
owner-approved higher stages), identify highest stable load and first degradation,
and stop at the first correctness violation or sustained required-threshold
breach. A short abort must never be reported as a completed nominal stage.

Use the existing operational gates: legitimate Check-In >=99.5%, unexpected HTTP
failures <0.5%, p95 <1000ms and p99 <2500ms for the agreed operational route
profile; also require the separately agreed photo SLO. Zero integrity/security
violations, unexplained refresh/auth failures or unresolved mutations; no
unexplained 409/401/429/503 spikes. Gate A remains stricter at 100% success.

Same resources, exact source SHA, process counts, DB snapshot/profile, pools,
storage route and fixtures are required for a code-only comparison. Existing
API-only natural workloads/soaks excluded photos; busy-read PG failures are a
separate ceiling. Neither earlier API-only success nor local JPEG timings proves
full-platform 200-employee capacity.

Before buying a production server, obtain production-equivalent full-stack
measurements: safe sustained and peak **successful** RPS, failure reasons,
endpoint p50/p95/p99, distinct photo and Check-In throughput, actual API/Frontend
and background process CPU/RAM, Node event-loop/GC, PG CPU/RAM/connections/
query/transaction/lock/IO metrics, disk latency, object throughput/storage growth,
retention/backup/restore and approved operational headroom. Inventory all API,
worker, webhook and other DB pools before any separate sizing experiment. None
of these full-stack capacity/resource/headroom gates has been proven here.

## Git delivery

Base `5e0a39dc7dceabdcbbd03aac5800fccee28f0dfb`;
branch `fix/condition-photo-ingress-capacity` in isolated
`/workspace/work/vaylet-photo`. The final delivery message supplies its immutable
commit SHA and report link (a report cannot embed its own commit hash).
Only photo processing/diagnostics, focused tests/protected ownership and this
report belong in the commit. No private fixtures, generated build artifacts,
credentials, local benchmark results, schema or production config changes.
The branch is pushed without force; verify remote HEAD equals local HEAD and
worktree cleanliness. Main/owner/earlier worktrees remain untouched. No PR,
merge, deployment or manual CI trigger. Status remains **runtime capacity
validation pending**, including the protected photo end-to-end test.
