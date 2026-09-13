# Employee Native — MOB-025A Measured Capacity Baseline

> Evidence and proposed pilot thresholds only. This record does not approve
> U-004, establish production SLOs, qualify a release candidate, or start
> MOB-025B. Correctness and security hard-zero requirements remain binding
> independently of every latency or throughput result below.

## Scope

MOB-025A measured a guarded local API/PostgreSQL cohort through real HTTP,
authentication, authorization, domain-command, and database boundaries. It
adds a small repository-local Node/TypeScript harness using only existing
dependencies. It did not load production, call FCM, change runtime behavior,
change schema/indexes/pool settings, or use customer data.

Result: **SERVER/API/DB BASELINE MEASURED; PHYSICAL-DEVICE EVIDENCE OPEN**.
U-004 remains an Owner gate.

## Tested SHA

- Reviewed base and code-under-test SHA:
  `ce445a50cccd85406fa59741071c26281e18ab15`
- Measurement branch: `codex/mob-025a-capacity-baseline`
- Environment class: guarded local development only
- Measurement date: 2026-09-13 UTC

The harness was uncommitted tooling layered on the exact reviewed application
SHA. It did not modify the built API or database schema.

Focused review repair did not rerun or replace the measurements. The final
supported run was invoked with `CAPACITY_API_PID=2086581`, and its result
contains API RSS/CPU snapshots from that process. Making the already-supplied
PID mandatory changes only fail-closed preflight behavior and therefore does
not invalidate the measured workload or results.

## Environment and hardware

| Item | Measured configuration |
| --- | --- |
| Container/OS | isolated LXC/KVM; Linux 6.8.0-139-generic, x86_64 |
| CPU | AMD EPYC Processor (with IBPB); 8 presented, 6 online/available to Node |
| RAM/swap | 4 GiB RAM; 4 GiB swap; about 2.95 GiB available at final run start |
| Node | v22.23.2 |
| PostgreSQL server | 17.11, loopback container topology; `max_connections=100` |
| API | one built Node process; `NODE_ENV=development`; no API restart during successful runs |
| API pool | current node-postgres default, maximum 10 connections per API process |
| Harness DB pool | maximum 3 migration/admin connections, used only for guarded fixture setup and aggregate checks |
| Push worker | zero worker processes; creation and sending disabled |

The ordinary local API service could not start after the current build because
the persistent local `.env` lacks the now-required non-secret Staff Push policy
keys. Measurement used an ephemeral systemd API unit with the checked-in
accepted v1 policy values, both push switches `false`, and otherwise the normal
local `.env`. No value was written back and no tuning occurred during a run.
This local bootstrap/config drift is a reproducibility finding, not a capacity
optimization.

CPU samples use Linux process CPU convention: 100% is one logical CPU, so the
API process and its password-hashing worker threads can exceed 100%. Samples
were taken at workload boundaries, not continuously.

## Dataset and cohort

Each run began with the guarded local bootstrap, then inserted deterministic,
sanitized synthetic records in one transaction:

- 1 Organization;
- 10 active Locations;
- 20 active `VALET_EMPLOYEE` identities/memberships, 2 per Location; 21 native
  auth sessions after the separate first-login sample plus the 20-login burst;
- 20 active Shifts;
- 510 ValetSessions and Vehicles: 50 queued parking Tasks plus 1 command
  sentinel per Location;
- 500 initial Tasks and 510 after the protected command burst; and
- one role only (`VALET_EMPLOYEE`), with no real credentials, names, vehicles,
  proofs, provider data, or customer records.

Queue step runs had no think time and used a warm API/database after login.
The five-second observation had an explicit 5,000 ms wait. The final supported
run lasted 107.78 seconds and produced 2,031 request samples. Successful earlier
repeat runs produced 2,731 samples each because they included the exploratory
concurrency-40 queue step.

## Existing tooling inventory and fit

The inventory covered the root and affected manifests, `apps/api/package.json`,
API `tools/**`, local bootstrap/status/smoke scripts, integration HTTP and
fixture helpers, database connection policy, current Web/Native queue owners,
native auth/session recovery, and Staff Push worker/provider configuration.

Reusable pieces were Node 22, TypeScript/`tsx`, Vitest, `fetch`, `pg`, the
guarded local bootstrap, migration connection policy, canonical synthetic demo
credential, current integration fixtures, API operation logging, PostgreSQL
views, and `/proc` process metrics. The repository had no dedicated load tool.
These existing facilities provide bounded true concurrency, real API/DB
traffic, percentile calculation, safety gates, tests, and JSON output, so k6,
Artillery, autocannon, JMeter, Gatling, and other new dependencies were neither
needed nor installed.

Current source behavior matters to the workload model:

- Employee Web owns a five-second queue timer and prevents overlapping active
  reads.
- The portable employee client used by Native defaults to five seconds,
  coalesces same-scope refreshes, aborts obsolete scope, pauses in background,
  and performs authoritative context/queue rereads on foreground recovery.
- Therefore a logical refresh is not multiplied by overlapping same-scope
  requests. The measured poll observation produced exactly 20 HTTP requests
  for 20 logical refreshes (1.00 request per refresh).
- Web and Native can coexist, but simultaneous mixed-client traffic was not
  separately generated. The old 40-rps hypothesis is not treated as fact or a
  threshold.

## Harness design and safety limits

Run from a freshly bootstrapped guarded local database:

```bash
CAPACITY_CONFIRM_LOCAL=mob-025a \
CAPACITY_API_PID=<measured-api-pid> \
corepack pnpm --filter @valet/api capacity:baseline
```

The confirmation string and `CAPACITY_API_PID` are mandatory. PID preflight
requires an integer greater than 1 with readable `/proc/<pid>/stat` and
`/proc/<pid>/status` before local environment loading, pool construction,
fixture creation, authentication, or HTTP work. Monitoring never falls back to
an unmonitored mode. The existing database guard rejects a non-local target,
requests have no automatic retries, and output is aggregate sanitized JSON
under ignored `.tmp/capacity/`. The output contains no token, credential,
header, URL, business payload, or PII. Fixture seeding uses the migration role
only; all measured requests use real least-privilege API behavior.

Exact test-environment abort guards (not proposed SLOs):

| Guard | Abort condition |
| --- | --- |
| Requests / wall clock | more than 5,000 requests or more than 180 seconds |
| Per request | 3,000 ms client timeout |
| Errors | 10 consecutive errors, or over 5% after at least 50 samples |
| API | PID/RSS unreadable, 768 MiB RSS, or 5 consecutive boundary samples at or above 95% of one logical CPU |
| PostgreSQL | 80 database connections or 10 lock waiters |
| Retries/backlog/data | no harness retries, no mutation replay, no worker, fixed transactional fixture cardinality, fresh bootstrap required for repeat |

Unit tests prove nearest-rank percentile summaries, exact requested count and
maximum concurrency, zero hidden retry count, both error aborts, DB connection
abort, stopping new work after an abort, rejection of missing/invalid/unreadable
PIDs, acceptance of a readable PID, valid deterministic UUID fixtures, and
rejection of cross-Location or missing queue fixtures. A malformed/error HTTP
response is not accepted as a correct domain result. Protected effects are
independently counted in the database.

## Workloads executed and measured results

The following is the final supported run. Latencies are milliseconds. Every
row had zero HTTP/domain errors and zero retries.

| Workload | Concurrency | Samples | Duration ms | p50 | p95 | p99 | Requests/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| First login; API already started, first auth operation | 1 | 1 | 1,986.04 | 1,985.41 | 1,985.41 | 1,985.41 | 0.50 |
| Login burst | 5 | 20 | 4,677.99 | 895.39 | 2,199.94 | 2,264.14 | 4.28 |
| Refresh-token rotation wave | 20 | 20 | 349.56 | 294.41 | 344.78 | 345.14 | 57.21 |
| First/cold queue step | 1 | 50 | 53,121.00 | 1,668.99 | 2,348.39 | 2,677.33 | 0.94 |
| Warm queue step | 5 | 250 | 8,805.64 | 102.33 | 631.31 | 1,368.76 | 28.39 |
| Warm queue step | 10 | 500 | 10,292.01 | 139.83 | 631.72 | 1,108.20 | 48.58 |
| Warm queue sustained bounded run | 20 | 1,000 | 15,631.17 | 262.31 | 617.42 | 871.76 | 63.97 |
| Session-detail read wave | 20 | 100 | 2,282.77 | 364.71 | 907.31 | 928.25 | 43.81 |
| Duplicate parking-command burst | 50 | 50 | 658.91 | 535.75 | 624.67 | 640.66 | 75.88 |
| Five-second queue observation | 20 | 20 | 113.03 | 84.91 | 100.46 | 108.50 | 176.94 |
| Reconnect authoritative context reread | 20 | 20 | 170.73 | 159.29 | 169.30 | 169.63 | 117.14 |

The final run exposed a pronounced cold first queue series: its first 50 serial
reads were much slower than every later warm queue shape. It is reported
separately and is not averaged into steady-state throughput. The detail wave
validated both requested session identity and Location on every response.

### Queue staleness and request multiplicity

Twenty clients waited 5,000 ms after the protected command and issued one
queue read each. Time from command-wave completion until each updated queue was
observed was p50 5,106.93 ms, p95 5,125.21 ms, and p99 5,131.33 ms. All 20
found the authoritative new Task. Multiplicity was 20 observed requests / 20
logical refreshes = 1.00. This is a server-observed synthetic polling clock,
not physical-device render freshness.

### Error, recovery, and repeat observations

- Final supported run: 2,031/2,031 successful; 0 errors; 0 retries; error and
  retry rates 0%.
- Twenty simultaneous reconnect/context rereads all recovered; completion
  p50/p95/p99 was 160.54/170.45/170.73 ms.
- Two earlier complete runs show material host variability. At concurrency 20,
  queue p95 was 495.29 and 682.60 ms, p99 was 680.87 and 1,314.04 ms, and
  throughput was 95.28 and 63.72 requests/s. Their staleness p95 was 5,353.34
  and 5,476.56 ms; reconnect p95 was 305.92 and 267.60 ms.
- Exploratory concurrency 40 completed twice at only 54.60 and 43.50
  requests/s with p95 1,503.16 and 2,026.70 ms and p99 2,050.46 and 2,761.31
  ms. A strengthened repeat then hit ten consecutive 3-second client timeouts;
  server completions stretched beyond five seconds and the harness aborted.
  This is the observed first break. Concurrency 40 is excluded from the safe
  default and is not proposed as supported capacity.
- An initial 20-way login experiment also exceeded the 3-second client guard
  (server completion reached about 7.56 seconds) and aborted. The supported
  login burst is therefore paced at concurrency 5; rate limiting was never
  disabled or bypassed.

## API and database pressure

In the final supported run, API RSS grew from 104.34 MiB to a peak of 149.63
MiB. Across the two earlier complete runs the maximum observed peak was 253.96
MiB. The API had zero restarts/crashes and its service logged no error outcome
for the final run.

Final boundary CPU samples peaked at 213.11% during password hashing and later
at 103.47%; no five consecutive high samples occurred. These coarse samples
show that authentication is CPU-expensive but do not constitute a continuous
CPU utilization series.

PostgreSQL peaked at 11 observed connections in the final run (12 across
complete repeats), with zero lock waiters and no observed database/query error.
Because the API pool maximum is 10 and the harness pool maximum is 3, this
single-container topology is not representative of a scaled deployment.
Database CPU/memory and pool wait duration are not exposed by existing safe
visibility and were not fabricated or instrumented with new infrastructure.

## Correctness observations

Final supported run outcomes:

- duplicate protected effects: **0** — 50 concurrent parking queue commands,
  five against each of 10 sentinel sessions, produced exactly 10 Tasks and 10
  dispatch events;
- cross-scope leakage: **0** — every successful queue body was checked against
  the exact allowed synthetic session set for that Employee Location, and all
  100 detail responses matched the requested session and Location;
- unexpected authorization failures: **0**;
- stale-success observations: **0** — all post-command queue reads contained
  the expected new authoritative session Task;
- command conflicts/errors: **0**; idempotent successful responses preserved
  the one-effect contract;
- API restart/crash: **0**; and
- lock waiters: **0**.

Authorization failure, cross-tenant leakage, duplicate protected effect,
custody/audit corruption, stale-state authority, and broken payment/release
guards remain hard-zero failures. Good timing can never offset one. This
harness directly exercises queue scope and parking-task idempotency; it does
not claim exhaustive proof for every other hard-zero category.

## Push/provider workloads

No push capacity or provider result is claimed. The local baseline had push
creation disabled, sending disabled, zero worker processes, and no accepted
safe real-provider load environment. Existing fake/test adapters can prove
logic but not provider latency or delivery. Provider outage/recovery, server
claim/send capacity, real FCM latency, and device delivery remain open.

## Client/mobile measurements

No physical Android device was connected or available; `adb` was not installed
in the workspace. No emulator value is relabeled as physical evidence. Thus no
measurement is claimed for startup/operational readiness, UI/input response,
first/warm list render, first/warm camera readiness, memory growth, battery,
crash/ANR, or human check-in field time.

### Physical-device evidence procedure (open)

On an Owner-approved physical Android cohort and integrated candidate SHA:

1. Record build SHA/version, device model, Android/OEM version, RAM/storage,
   battery condition, network class, Location/task cardinality, and whether the
   run is cold or warm. Never record staff/customer/business payloads.
2. Run at least 30 bounded repetitions each for cold launch to authenticated
   operational readiness, restored-session readiness, initial Task list render,
   refreshed list render, first camera readiness, and later camera opens.
   Capture monotonic timestamps and p50/p95/p99 separately.
3. Capture UI frame/jank and input latency with the existing Android tooling
   available in the approved lab; capture process memory before/after a bounded
   operational session. Record crashes and ANRs from system diagnostics.
4. Reset battery statistics, execute a defined bounded active-shift script,
   record duration/screen/network conditions, and report consumed percentage
   or charge with device uncertainty. Do not extrapolate a short run to a full
   shift without validation.
5. Time human check-in field work separately from render, network, and API
   timing. Measure the optional no-photo path and any photo-required
   configuration as distinct cohorts.
6. Exercise loss/recovery of network, foreground/background, and push-attention
   flows, then prove authoritative context/queue recovery and no blind mutation
   replay.

Smallest next physical action: connect one approved representative Android
device, install the integrated candidate, and execute steps 1–6 with the
synthetic 10-Location cohort. A broader device/OEM matrix belongs downstream,
not in this remote baseline.

## Proposed U-004 pilot thresholds

Everything in this section is **PROPOSED FOR OWNER REVIEW**, not accepted.
Thresholds apply only to an integrated candidate on hardware at least
comparable to the measured cohort and the stated dataset; they require a
repeat before acceptance.

| Category | Measured basis | Proposed pilot threshold | Margin/rationale and confidence |
| --- | --- | --- | --- |
| Cohort | 10 Locations, 20 Employee sessions; bounded wave c20 | qualification floor of 10 Locations / 20 simultaneously active sessions on one comparable API process | No extrapolation to the old 200-Employee hypothesis; low confidence until representative pilot cohort is known |
| Queue latency | c20 repeats: p95 495–683 ms, p99 681–1,314 ms | p95 ≤750 ms and p99 ≤1,500 ms through c20 | Above worst complete repeat; c40 is explicitly excluded; medium confidence for this local cohort |
| Queue throughput | c20 repeats 63.72–95.28 requests/s; final supported run 63.97 | ≥60 successful queue reads/s through c20 | Below the slowest complete repeat; first break was queue/CPU/DB contention above c20; medium-low confidence |
| Queue freshness | p95 5.13–5.48 s with five-second polling | p95 ≤6.0 s from committed change to refreshed queue observation | About 0.52 s beyond worst repeat; excludes device render/network; medium confidence |
| Request errors/retries | 0% in complete bounded runs | errors <1%, harness retries 0; no retry storm | Statistical evidence is short and local; low-medium confidence |
| Login burst | c5 p95 up to 2.20 s, p99 up to 2.64 s; c20 aborted | c5 p95 ≤2.5 s and p99 <3.0 s | Preserves anti-abuse and client timeout; higher concurrency not accepted; medium confidence |
| Refresh wave | c20 p95 up to 1.04 s, p99 up to 1.10 s | c20 p95 ≤1.25 s, p99 ≤1.50 s | Allows repeat variability; medium-low confidence |
| Session detail | one c20/100 wave: p95 0.91 s, p99 0.93 s | c20 p95 ≤1.25 s, p99 ≤1.50 s | One local run only; low confidence |
| Protected parking command | c50 p95 up to 0.73 s, p99 up to 0.76 s | p95 ≤0.85 s, p99 ≤1.0 s, duplicate effects = 0 | Latency margin plus non-negotiable exactly-once effect; medium confidence for this command only |
| Reconnect recovery | c20 p95 0.08–0.31 s | all 20 recover; p95 ≤0.50 s, no mutation replay | Above worst repeat; excludes physical network reconnect; medium confidence |
| DB pressure | peak 12 connections, 0 lock waiters | <20 observed connections and 0 lock waiters for this one-process cohort | Leaves headroom below server cap but is topology-specific; low-medium confidence |
| API memory | complete-run peak ≤253.96 MiB | peak RSS <384 MiB and no sustained growth across bounded repeat | Roughly 1.5× measured peak; soak needed; low confidence |
| CPU | boundary peaks >100%; no sustained abort | **OPEN — no U-004 CPU threshold proposed** | Sampling is too coarse and auth uses worker threads |
| Physical client, battery, crash/ANR, check-in field time | not measured | **OPEN — no threshold proposed** | Physical-device evidence required |
| Push/provider/device delivery | not measured | **OPEN — no threshold proposed** | Fake/provider-neutral timing cannot establish provider capacity |

The likely first bottleneck on this cohort is queue processing under high
parallelism: c40 throughput regressed and then timed out on repeat. Password
hashing is the auth-burst CPU hotspot. Blind spots include single-host
API/DB colocation, development runtime, short duration, one role, no mixed
Web+Native traffic, no WAN, no real provider, no worker, no DB wait-time
telemetry, and no physical device.

### Owner decision

**OPEN — OWNER ACCEPTANCE REQUIRED**

OWNER ACCEPTED thresholds: **OPEN / EMPTY**.

## Limitations

- This is baseline characterization, not saturation qualification, full-shift
  soak, production capacity, signed candidate qualification, or go/no-go.
- Final supported measurement stops at concurrency 20. The c40 attempt is
  retained only as an unsafe/unstable boundary observation.
- The workload uses synthetic data through real applicable boundaries, but its
  2 Employees per Location does not represent the old 20-per-Location
  hypothesis.
- Queue response payloads contain 50–51 Tasks per Location. Other cardinalities
  may shift the knee.
- Only the already-completed parking-task command had a safe focused fixture.
  Check-in, retrieval, handoff/release, payment, and custody command capacity
  were not generalized into this bounded harness.
- No production, live customer, live Location, or real staff account was used.

## MOB-025B prerequisites

MOB-025B is **NOT STARTED**. Before it can perform adversarial qualification or
a representative soak:

1. the Project Owner must accept, reject, or adjust U-004 thresholds and the
   intended pilot/hardware cohort;
2. the integrated candidate SHA and safe qualification environment must be
   identified;
3. physical-device baseline evidence and any accepted push/provider evidence
   must be supplied;
4. any required mixed Web+Native workload and DB/pool observability must be
   approved; and
5. every hard-zero correctness/security gate must remain green independently
   of performance.
