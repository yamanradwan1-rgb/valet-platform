# VAYLET backend and PostgreSQL performance investigation

Date: 2026-10-27. Baseline: `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`.
Branch: `fix/performance-db-pool-auth-observability`.

## A. Executive verdict

**The first limiting factor in Antigravity's workload is unresolved.** The
benchmark archive, k6 stage/check records, container telemetry, integrity
snapshots and earlier small-machine report were not attached or found in the
attachment/library/shared files. The supplied request is a summary, not enough
evidence to attribute its failed requests to PostgreSQL admission.

The source confirms a non-production default of four connections and 128
waiters. Production requires an explicit maximum and capacity envelope.
Neither configuration proves that pool saturation was the first workload limit.
No pool size, environment default, token lifetime, security policy or production
configuration was changed.

A concrete application inefficiency was repaired: operational-context reads
performed `2 + 2M + A` source-level pool queries, where M is the number of active
operational memberships and A those with a detected active Shift. Batching now
uses four queries without active shifts or five with them. Three active
memberships previously required eleven queries; the regression fixture now
requires five. Access resolution and per-lease setup/reset queries are additional.
The normal single-membership case retains its previous four/five query count.
This is a demonstrated reduction in database round trips, **not measured
capacity, latency or load-test improvement**.

Existing diagnostics could not distinguish queue rejection from checkout
failure and did not attach endpoint templates to the target routes' HTTP logs.
The repair extends the existing private log records with bounded classifications
and pool counters. No metrics endpoint, heavy dependency or extra pool was added.

Authentication can independently explain failures: opaque access credentials
expire after at most 900 seconds; refresh replaces access and refresh credentials;
concurrent reuse of a refresh credential revokes its family; login allows only
30 attempts per trusted address per rolling 15 minutes. Whether each occurred in
the reported run remains unverified. Sharing an access credential alone is not
proof of a defect.

## B. Root cause matrix

| Area | Evidence | Root cause / finding | Confidence | Resolution |
|---|---|---|---|---|
| First workload bottleneck | Only supplied aggregate benchmark summary | Cannot rank admission, SQL, locks, auth, proxy or domain conflicts without time-aligned records | UNVERIFIED | Independent verification contract below |
| Pool defaults | `common/database/runtime-postgres-policy.ts` | Non-production max 4; maxWaiters defaults to min(max × 32, 1024) | CONFIRMED | Retained; deployed values still need capture |
| Operational context | Membership loop in baseline; scoped PostgreSQL regression | Repeated location/existence/projection queries per membership | CONFIRMED | Batched exact persisted Organization/membership pairs and detected Shift IDs |
| Diagnostic ambiguity | Baseline aggregate failures and broad HTTP operation classes | Missing differentiated checkout reasons/configured limits/target templates | CONFIRMED | Private fixed-schema telemetry added |
| Pool leak | Existing real-pool resilience and lease tests | No leak reproduced in exercised success, rollback, timeout, termination or shutdown cases | NOT REPRODUCED | Retain lifecycle ownership/watchdogs; add counter regression tests |
| Auth expiry | `auth/staff-session-context.ts`, persisted-expiry tests | Correct 401 on expired/revoked/non-current credential | CONFIRMED | Preserve; harness must renew properly |
| Refresh concurrency | `auth/staff-auth.service.ts`, concurrent refresh test | Correct consumed-refresh replay-family revocation | CONFIRMED | One refresh owner per family; publish replacements coherently |
| Login overload | `auth/staff-login.service.ts`, durable limiter tests | Legitimate 30/address attempts and five identifier failure-capable reservations/900s; limiter fails closed | CONFIRMED | Preserve budgets; account for setup/login workload |
| Auth contribution in original run | Token counts and expiry reported by owner, no raw status/reason timeline | Expiry/replay/rate limiting and DB-blocked login all possible | UNVERIFIED | Separate auth, refresh, rate-limit and DB errors |
| Dashboard SQL/locks | Overview queries and shared authorization code | Deliberate reauthorization after SHARED org advisory fence; CA MFA/activity work; no query-plan bottleneck demonstrated | UNVERIFIED | Preserve fences; capture plans/lock evidence independently |
| Task queue/directory | Dispatch transaction; directory bulk projection loaders | Scoped transaction/Shift eligibility; directory already batches related projections | CONFIRMED | No speculative query or lock removal |
| Extra pools | Runtime module, worker entries, optional webhook module | Shared API singleton plus separate process/restricted-principal pools | CONFIRMED | Aggregate every process/pool in capacity accounting |
| Client disconnect | HTTP close handler; absence of request abort propagation into DB scope | Synthetic log status 499; disconnect does not itself cancel a mutation | CONFIRMED | Preserve bounded leases; reconcile ambiguous mutation outcomes |

### Request failure paths and mutation/recovery implications

All listed staff controller operations run through `common/http/api-operation-runner.ts`.
`common/http/api-errors.ts` owns the safe mapping. The exception filter preserves
mapped responses; routes outside its explicit operation table use Nest's base
filter on the already-mapped `HttpException`.

| Observed category | Origin and public result | Classification | Mutation / recovery |
|---|---|---|---|
| 401 access | Exact single Bearer header; persisted active User/current token, unrevoked session, access/absolute expiry checks | `STAFF_AUTHENTICATION_REQUIRED`; internal AUTHENTICATION | Denied before domain command; renew or reauthenticate |
| 401 login/refresh | Bad credentials, disabled User, absent/expired/revoked refresh, consumed refresh replay | `STAFF_AUTHENTICATION_FAILED` | Login denial creates no staff session; limiter accounting can commit. Replay deliberately commits family revocation before generic 401 |
| 403 | Browser Origin guard; MFA assurance requirements | `STAFF_AUTH_ORIGIN_NOT_ALLOWED`, `MFA_STEP_UP_REQUIRED`, `MFA_VERIFICATION_FAILED` | Expected security denial; do not bypass it. MFA failure accounting can persist |
| 404 scope denial | Current tenant/role/Location/entitlement/Shift authorization | `AUTHORIZATION_DENIED`, `TENANT_ACCESS_DENIED`, `LOCATION_ACCESS_DENIED`, `TASK_NOT_FOUND_OR_FORBIDDEN` | Non-disclosing expected denial; no successful protected mutation |
| 409 | Intake idempotency mismatch, active vehicle custody conflict, serialization exhaustion; Task/version/domain guards | `IDEMPOTENCY_CONFLICT`, `ACTIVE_VALET_SESSION_CONFLICT`, `INTAKE_CONCURRENCY_CONFLICT`, task/version codes | Failed transaction rolls back; exact intake replay returns prior result. Do not treat valid conflicts as pool failures |
| 429 | Durable staff login and independent MFA/feature limiters | `STAFF_AUTHENTICATION_RATE_LIMITED`, `MFA_RATE_LIMITED`, other safe codes; Retry-After preserved | Expected anti-abuse accounting; honor delay; no relaxed limits |
| 500 | Unrecognized application errors or transport failures outside known mappings | `INTERNAL_ERROR` | Unexpected; inspect safe correlated operation logs. Existing transaction paths attempt rollback and release |
| 503 admission | `bounded-postgres-pool.ts`: admitted >= max + maxWaiters | Public staff `INTERNAL_ERROR`; internal `QUEUE_FULL` | No connection/command starts for the rejected acquisition; unrelated earlier accounting may have committed |
| 503 checkout | Native pg queue/connect timeout or failed connection | Same public code; `ACQUISITION_TIMEOUT` / `CONNECT_ERROR` | Admission decremented on failed native acquisition; later requests can retry safely under endpoint policy |
| 503 DB deadline/error | SQL lock/statement/transaction timeout, deadlock, server connection limit, protocol read timeout, scoped operation expiry | Same staff public code; Guest scoped operations use `ANTI_ABUSE_UNAVAILABLE` | Uncommitted transactions roll back/dispose. Lost COMMIT acknowledgement remains ambiguous, never blindly replay |
| 503 limiter failure | AntiAbuse service cannot complete its durable decision | `ANTI_ABUSE_UNAVAILABLE` | Fail closed; never treat as bad password or create a session without the required accounting |
| 502 | No matching generic application DB-pressure mapping in reviewed paths | Usually requires proxy/upstream evidence | Could follow a lost response after commit; do not infer rollback from a gateway code |
| Cancellation / disconnect | PG 57014 or HTTP response close before finish | `QUERY_CANCELED` unless the recognized statement-timeout message establishes `STATEMENT_TIMEOUT`; synthetic log 499 for disconnect | 499 is not a sent HTTP status. Disconnect is not proof of DB cancellation or rollback |

The API deliberately keeps access denials non-disclosing: an expired credential
and a revoked credential are not differentiated publicly. No new DB lookup is
performed to explain every 401. SQLSTATE 57014 alone cannot establish a statement
timeout. Existing `statementTimeouts` is a legacy broad 57014 counter; use the
new per-request reason to avoid conflating cancellation and timeout.

## C. Application changes

All paths below are relative to `apps/api/`, except the final document.

| File | Before → after / purpose | Security and regression considerations |
|---|---|---|
| `src/modules/staff/staff-operational-context-query.ts` | Per-membership detail queries → batched detail loader plus unchanged response projection | Active User/membership/Organization selection, order and complete-response denial preserved |
| `src/modules/staff/staff-operational-context-details.ts` | New focused loader for locations, unconditional Shift existence, then eligible projection | Zipped Organization/membership pairs, exact detected Shift IDs, active Location and exact access joins; no cross product or tenant selectors from clients |
| `test/staff-operational-context-batching.integration.test.ts` | New three-organization query-count/isolation/regression fixture | Five pool queries; unrelated user excluded; one revoked active-Shift grant denies whole result |
| `src/common/database/runtime-database-deadline.ts` | Generic temporary error → optional bounded internal reason | Public code/message, timers, operation budgets and cancellation mechanics unchanged |
| `src/common/database/database-failure-reason.ts` | New source-owned reason classifier | No driver message, SQL, host, credential, exception cause or arbitrary code is emitted |
| `src/common/database/bounded-postgres-pool.ts` | Aggregate checkout failures → configured/owned-state gauges and differentiated counters/reasons | Same maximum, queue admission, native waiter removal, release ownership and callback public-error masking |
| `src/common/database/bounded-postgres-query.ts` | Generic protocol timeout → counted `QUERY_TIMEOUT` | Existing destructive disposal of ambiguous connection preserved |
| `src/common/database/postgres-lease.ts` | Uncounted reset failure/watchdog disposal → numeric counters | Same reset, native release, deadline and destruction paths |
| `src/common/database/runtime-database.module.ts` | Startup failure lacked a specific safe metric → counted and privately classified initialization failure | Same PostgreSQL capability, TLS and privilege checks; original failure rethrown |
| `src/common/observability/runtime-metrics-pulse.ts` | Existing 30-second private sample → extra fixed numeric fields | No extra query, dependency, timer or endpoint |
| `src/common/observability/performance-request-diagnostics.ts` | New fixed route-template/failure metadata formatter | No raw URL, query, body, Authorization, identity or dynamic path segment in output; request IDs remain log correlation only |
| `src/common/observability/http-metrics.middleware.ts` | Existing target HTTP logs lacked route/reason correlation → suffix with template, requestId, safe errorCode, reason | Existing finish/close status, once-only emission and telemetry failure isolation retained; unrelated routes retain existing format |
| `src/common/http/api-operation-runner.ts` | Mapped failures not available to HTTP finish observer → WeakMap metadata | Public error mapper/status/body untouched; no extra DB work |
| `test/performance-pool-diagnostics.test.ts` | New admission, callback, expired checkout, release/watchdog and initialization tests | Controlled promises/timers; no real-time sleeps needed for unit assertions |
| `test/performance-request-diagnostics.test.ts` | New template, 503, cancellation classification, disconnect and privacy tests | Secret-bearing target/header fixture never enters output; throwing logger cannot change response |
| `docs/reference/backend-pool-performance-investigation.md` | This source-level report and independent verification contract | Explicitly distinguishes proven fixes from workload hypotheses |

### Pre-code domain and architecture review

Entities affected by the read repair: User, OrganizationMembership,
Organization, Location, MembershipLocationAccess, Shift. No ValetSession,
Task, Dispatch or custody transition changed. No schema, constraint, index,
Company-default/Location-override policy, entitlement or product-scope change.
Existing membership/access and active-Shift constraints remain authoritative.
The baseline context query did not hold a transaction; batching adds no new
transaction or authorization claim and removes no commit-time fence. Like the
baseline it is a context projection, not command authority. Newly authored and
modified files stay within the 300-line policy. Common code imports no feature.

## D. Database pool findings

Authoritative implementation: `common/database/postgres.ts` constructs `pg.Pool`,
`runtime-postgres-policy.ts` supplies policy, and `bounded-postgres-pool.ts`
wraps admission/lease ownership. `bounded-postgres-query.ts` bounds query work;
`postgres-lease.ts` configures/resets/disposes borrowers. Nest's shared
`RuntimeDatabaseModule` owns the ordinary API pool and shutdown once. Repeated
module imports do not create additional ordinary runtime providers, as tested.

| Setting/behavior | Actual source contract |
|---|---|
| Maximum | `DATABASE_POOL_MAX`: default 4 outside production; required in production; max 100 |
| Waiters | `DATABASE_POOL_MAX_WAITERS`: default min(max × 32, 1024), maximum 1024; positive integer |
| Admission | At most max + maxWaiters admitted acquisitions/leases including setup/reset; immediate rejection beyond this |
| Minimum / idle | pg default minimum 0; lazy connections; idle timeout 30,000 ms |
| Connection lifetime | No configured maxLifetimeSeconds; pg default 0 (no age rotation) |
| Acquisition | 2,000 ms native queue/connect timeout; configuration receives the remaining acquisition budget; successful measurements include configuration |
| Guest budgets | lock 2s, statement 3s, idle transaction 2s, transaction 5s, operation 6s |
| General budgets | Non-production lock 5s, statement 15s, idle transaction 10s, lease/transaction 30s; `DATABASE_GENERAL_*` values required in production |
| Server versions | PostgreSQL 16+ supported; native transaction_timeout on 17+, with existing client lease watchdog on older supported servers |
| Retry | Pool has no automatic retry; intake retries only SQLSTATE 40001, at most three attempts |
| Timeout cleanup | Native pg removes timed-out waiters; deadline-expired native checkout is discarded before queries; owned disposal decrements admission once |
| Release | General lease resets settings asynchronously before native reuse; reset failure, protocol ambiguity, connection error or watchdog expiry discards it |
| Shutdown | Closes admission, disposes owned borrowers, invokes pg.end; queued/in-flight acquisitions fail or expire through existing native bounds |

The four/five context acquisitions still each incur existing general setup and
reset queries. No attempt was made to cache session settings or relax their
security boundaries. Dashboard and operational authorization transactions may
hold locks while reading projections; the deliberate org grant fence, Shift
eligibility and MFA/session revalidation must remain. Without actual plans and
lock waits, their cost is an investigation target, not a confirmed defect.

Worker processes (staff push, guest push, outbound messaging, photo maintenance)
construct their own bounded pools. The optional webhook receiver constructs an
additional intentionally restricted-principal pool in the API process. These
are not accidental module duplication. Production's envelope check validates
`max <= floor((DATABASE_ALLOWED_CONNECTIONS - DATABASE_RESERVED_CONNECTIONS) /
DATABASE_MAX_API_INSTANCES)`. It cannot discover every external process or role.
Inventory every API replica, worker replica and optional webhook pool before
using that envelope. No deployed max_connections or process inventory was
available, so tuning would be speculative.

### Metric interpretation and overhead

`RUNTIME_METRIC` remains a 30-second API sample. Counters are process-lifetime
monotonic values; derive interval deltas and reset at process restart/release.
Read every API process independently. Worker pool counters exist in memory but
workers do not automatically instantiate the API pulse; use PostgreSQL/container
telemetry for those processes in this experiment.

- `configuredMax`, `queueCapacity`: fixed limits for the sampled pool.
- `total`, `idle`, `waiting`: native pg gauges. `active = total - idle` also
  includes connecting/resetting clients; it is not the count of running SQL.
- `leased`: owned borrowers including setup/reset; `admitted`: native checkout
  plus owned leases; `acquiring = admitted - leased`: in-flight native checkout.
- `acquisitions`, `acquisitionMs`, `acquisitionsOver200Ms`, `acquisitionBuckets`:
  successful acquisitions including lease configuration. Buckets are
  non-cumulative <=5, <=25, <=100, <=500, <=1000, final <=2000/overflow ms.
  They do not provide exact acquisition p95/p99 or failed-wait distributions.
- `rejected`: queue admission rejection; `acquisitionTimeouts`: native timeout,
  exhausted acquisition budget or protocol timeout during lease setup.
- `connectionFailures`: failed native acquisition excluding recognized native
  timeouts; not a claim that a particular credential or network layer failed.
- `leaseSetupFailures`: failure after owned checkout while configuring/checking
  the lease; `expiredAcquisitions`: checkout rejected before ownership because
  its operation expired or pool closed.
- `poolErrors`, `clientErrors`: distinct error-event counters. Existing `failures`
  can include overlapping client/pool events; never sum it with those counters
  as a count of unique failed requests.
- `releaseFailures`, `leaseExpirations`, `queryTimeouts`: reset failure, watchdog
  disposal, and client protocol read timeout respectively.
- `initializationFailures`: runtime bootstrap failure. Bootstrap failure also
  emits `DATABASE_INITIALIZATION_FAILED reason=<fixed classification>` because
  an unready process might never start its periodic pulse.

Target `HTTP_METRIC` lines retain operation/outcome/status/durationMs and add
fixed `route`, correlation `requestId`, mapped `errorCode` and bounded `reason`.
Use route/status/errorCode/reason as bounded aggregation dimensions. Never make
requestId, User, session, vehicle, token, plate, phone or URL a metric label.
The existing OPERATION record is still available for operation-level correlation.
No raw request/driver values or additional per-request log record is emitted.

Added work is numeric increments and fixed small route matching/WeakMap metadata;
periodic sampling does no SQL. Logging output grows by a bounded suffix. Measure
collector/backpressure cost in Antigravity's environment; no unmeasured overhead
or throughput claim is made. The 30-second pulse can miss short queue spikes;
per-request reasons and PostgreSQL sampling provide the complementary evidence.

## E. Authentication findings

These staff tokens are **opaque credentials, not JWTs**. They contain 256 random
bits with separate access/refresh formats and SHA-256 verifier namespaces. No
JWT validation was weakened. Access lasts at most 15 minutes; a session has a
non-sliding 720-hour absolute expiry. Login verifies the accepted Argon2id hash
outside the session-creation transaction, then locks/rechecks User state before
commit. Separate logins create independent sessions; login does not inherently
replace all other sessions. CPU-expensive password verification is also a
possible login-specific pressure source, not measured here.

Refresh locks User, refresh and session security boundaries, consumes the old
refresh credential, inserts its replacement and rotates the current access hash
atomically. The old access credential immediately ceases to be current. A
consumed refresh replay commits session-family revocation and returns the same
safe 401 as other authentication failures. Two VUs presenting the same refresh
credential are not two independent sessions: one may rotate and the losing reuse
revokes the family, including the winner's new access credential.

Web login/refresh/logout keep strict JSON and exact Origin plus Secure/HttpOnly/
SameSite=Strict cookie semantics. Native transports use explicit refresh JSON,
not browser cookies or device claims. Logout is non-disclosing 204 on success,
revokes the resolved family and disables associated push authority; an actual
DB outage can still fail the operation. Access resolution rechecks current User
and session state on every request; Location/role/tenant/Shift/entitlement and
MFA remain separately authoritative. MFA timestamps do not slide on refresh.

The harness must assign one renewal coordinator to each shared family and update
all consumers to the new access value. Prefer independent sessions per logical
actor where operational fixtures require independent custody/task work. Do not
let setup_data copies independently refresh a common credential. Never publish
raw setup_data. For a 30-minute soak, record relative expiry/renewal event times
and safe success/failure counters; an unrenewed 900-second token cannot support
that whole run. Classify 401, 403, 404, 409, 429 and 503 separately. Reauthentication
must respect the durable 30/address and five identifier-failure budgets; obtaining
127 sessions rapidly from one address is not an unconstrained login workload.

## F. Tests and verification

**189 focused tests passed across 23 distinct files: 140 PostgreSQL tests in
16 files and 49 non-PostgreSQL tests in seven files.** The query-count regression
was additionally run against the immutable baseline and correctly failed at
11 queries versus the required five; the restored patch passed. This intentional
baseline failure demonstrates the test detects the repaired inefficiency.

The PostgreSQL commands used `TEST_DATABASE_URL` pointing only to the new
loopback port 55432, `PATH=/workspace/.cloud-setup/bin:$PATH` and
`COREPACK_HOME=/workspace/.cache/corepack` to select repository pnpm 10.34.5.
The new PostgreSQL 17 container uses tmpfs data and max_connections=100.
The ownership-aware harness creates/cleans only its own databases and roles.
The owner database is not used. No synthetic tokens/passwords were emitted.

Commands executed from the isolated repository (long argument lists wrapped):

```sh
COREPACK_HOME=/workspace/.cache/corepack corepack pnpm --filter @valet/contracts build

# Environment prefix as described above for both PostgreSQL invocations:
corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/staff-operational-context-batching.integration.test.ts \
  test/staff-operational-context.integration.test.ts \
  test/guest-t3-runtime-resilience.integration.test.ts \
  test/guest-t3-lease-regression.integration.test.ts \
  test/staff-auth.integration.test.ts test/staff-auth-native.integration.test.ts \
  test/staff-auth-continuity.integration.test.ts

corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/intake-session-command.integration.test.ts \
  test/staff-task-queue-authorization.integration.test.ts \
  test/staff-vehicle-directory.integration.test.ts \
  test/staff-vehicle-directory-employee-visibility.integration.test.ts \
  test/dashboard-overview-authz.integration.test.ts \
  test/staff-mfa-assurance.integration.test.ts test/staff-mfa-security.integration.test.ts \
  test/guest-t3-protocol-timeout.integration.test.ts \
  test/production-database-safety.integration.test.ts

corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/performance-pool-diagnostics.test.ts test/performance-request-diagnostics.test.ts \
  test/guest-t4-observability.test.ts test/staff-auth.service.test.ts \
  test/feature-module-ownership.test.ts test/guest-t4-health.test.ts \
  test/api-operation-runner.test.ts

corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm architecture:check
git diff --check
```

Existing real-pool tests cover native queue timeout removal, bounded admission,
release after success/rollback, duplicate releases, callback and pool.query use,
server termination, abandoned borrowers, lost setup/reset responses, shutdown,
scoped deadlines and ambiguous COMMIT without replay. New unit tests separately
assert reason/counter accuracy, late-checkout disposal, failed reset disposal,
watchdog ownership, safe startup failure, exact unchanged 503 response body,
route redaction, disconnect deduplication and logger failure isolation.
Authentication tests exercise persisted access expiry/revocation, refresh replay,
concurrent refresh, native/Web isolation, continuity and durable login limiting.
Domain tests exercise wrong tenants, revoked grants, employee visibility, MFA,
Check-In exact and concurrent replay, competing custody records and rollback.

Initial iteration failures were resolved: two new middleware/test typing issues,
a metric-field ordering expectation and a fake-clock mismatch (the latter was a
test setup problem, not a production cancellation defect). No unresolved test
failure remains. The production-safety negative fixture deliberately logs
`DATABASE_INITIALIZATION_FAILED reason=SAFETY_PREFLIGHT` and passes.

An offline dependency installation lacked package metadata. The environment's
fallback pnpm 11 then installed packages but rejected unapproved builds; its
incidental workspace-config changes were reverted before verification, and all
checks use repository pnpm 10.34.5. An optional `prisma generate` probe lacked
MIGRATION_DATABASE_URL; generation was unnecessary for the successful migration/
provisioning/test paths. No lockfile, dependency or workspace-config change is
part of this branch.

Full repository E2E, browser suites, full cross-app builds/tests, stress, capacity
and soak runs were intentionally omitted under the owner's scoped-verification
and UI-freeze instructions. No manual CI trigger, benchmark script change or
production/shared QA/owner DB mutation occurred. Architecture checks retain only
existing grandfathered-file warnings; all task files satisfy the line limit.

## G. Antigravity handoff

### Environment and immutable comparison

Use this dedicated branch's delivered commit SHA; baseline is the SHA at the
top of this document. Record `git rev-parse HEAD` and set
`VAYLET_RELEASE_GIT_SHA` to the exact tested 40-character SHA for API metric
correlation. No additional migration is introduced: both sides must use the
same baseline migration set and seed/fixture cardinality. Match 6 vCPU/12 GB,
PostgreSQL 17, all application/worker replicas and storage configuration. Record
all actual safe capacity/budget settings and PostgreSQL max_connections,
reserved_connections and superuser_reserved_connections; redact URLs/secrets.

Relevant settings: `DATABASE_POOL_MAX`, `DATABASE_POOL_MAX_WAITERS`,
`DATABASE_ALLOWED_CONNECTIONS`, `DATABASE_RESERVED_CONNECTIONS`,
`DATABASE_MAX_API_INSTANCES`, `DATABASE_GENERAL_LOCK_MS`,
`DATABASE_GENERAL_STATEMENT_MS`, `DATABASE_GENERAL_TRANSACTION_MS`,
`DATABASE_GENERAL_IDLE_TRANSACTION_MS`. **No setting changes in this branch.**
Keep every pool/budget setting, auth lifetime, login/MFA limit, tenant/location/
role policy, entitlement, workload mix and dataset unchanged for the initial
before/after comparison. No development-only diagnostic flag is needed; consume
existing private application logs. Never expose them as a public endpoint.

Before considering a separate pool-size experiment, calculate
`sum(replica_count × pool_max for every process and optional auxiliary pool) +
other_clients <= max_connections - all_reserved_headroom`.
Production envelope variables must conservatively cover this complete inventory.
Do not run migrations, change production values or deploy this branch as part of
this handoff.

### Per-stage required measurements

Capture aligned timestamps and process/release identity for:

1. VUs, offered request rate, total RPS, **successful operational RPS**; static
   pages, rejected requests and idempotent replays reported separately.
2. Successes/failures by endpoint, final HTTP status, public errorCode and internal
   fixed reason; transport failures separate from HTTP responses.
3. Endpoint p50/p95/p99, separately showing successful requests and all requests.
4. Check-In attempts/new creations/idempotent replays/conflicts/failures; one
   atomic expected custody/session/audit result per operation; no duplicates.
5. Login and token renewal successes/failures/429s, safe relative expiry events;
   no raw access/refresh credentials, cookies or setup_data in artifacts.
6. Each API pool's active/idle/waiting/leased/admitted/acquiring gauges,
   acquisitionMs/acquisitions and bucket deltas, rejection/timeout/error/reset/
   lease-disposal counters. Mark the 30-second sampling limitation.
7. API and each worker CPU/RSS/memory, PostgreSQL CPU/RSS/memory and connection
   activity, plus storage/container resource limits and proxy errors.
8. PostgreSQL safe state/wait_event_type/wait_event aggregates and blockers,
   lock-wait durations, idle-in-transaction counts and connection headroom.
   Have a DB operator collect scoped EXPLAIN (ANALYZE, BUFFERS) on the isolated
   benchmark fixture for expensive target reads if waits point to SQL. Do not
   put raw SQL literals, parameters or customer data in shared artifacts.

Successful acquisition buckets support coarse distributions, not exact
acquisition p95/p99. Exact acquisition quantiles require separate appropriately
scoped capture if Antigravity needs them; endpoint quantiles remain mandatory.

### Endpoint expectations

| Endpoint template | Expected authorized functional behavior |
|---|---|
| GET `/v1/staff/operational-context` | 200 matching the actor's current memberships/locations/shifts; revoked active-Shift access denies completely |
| GET `/v1/staff/tasks/queue` | 200 with authorized same-Location queue under current Shift eligibility |
| GET `/v1/staff/valet-sessions/directory` | 200 with permitted state/task visibility and employee key-slot masking |
| GET `/v1/staff/dashboard/locations/:locationId/overview/session-state-counts` | 200, correct counts, persisted role/location/entitlement and CA MFA enforced |
| GET same prefix + `/sessions`, `/tasks`, `/active-shifts` | 200 authorized projections; stable cursor/limit contracts; no role/fence removal |
| POST `/v1/staff/check-in/intakes` | Existing 201 success contract; exact durable operation replay preserves original result, conflicting material/custody returns existing 409 codes |
| POST `/v1/staff/auth/login`, `/native/login` | Existing 200 valid issuance within budgets; 401 bad credentials, 429 legitimate limits, 503 infrastructure/limiter pressure |
| POST `/v1/staff/auth/refresh`, `/native/refresh` | 200 one coordinated rotation; 401 expired/revoked/replayed family; 503 remains transient |

Authentication failures must never be converted into successful operational work
by excluding them from correctness totals. Deliberate negative auth/domain probes
have a separate expected-outcome denominator and must not pollute the healthy
operational workload.

### Stages and stop conditions

Start at 50, then 100, 200, 250 and 300 VUs. Agree thresholds with the owner
before execution; suggested gates for valid-workload operations are >=99.5%
functional success and unexpected failures <=0.5%, with no cross-tenant
exposure, custody/audit duplication or invariant break. Use the same endpoint
latency SLOs on both commits; no new latency SLO is invented here. Stop the stage
on any security/data-integrity failure or sustained valid-workload breach.
Investigate any unexpected auth loss or DB admission collapse before increasing
load. Do not progress automatically to 500–1000 when operations are failing.
Run a sustained soak only at a demonstrated stable target; coordinated renewal
must cover its entire duration.

Run an additional small multi-membership correctness/query-count check so the
actual repaired path is exercised; retain ordinary single-membership actors in
the representative capacity mix. Compare functional and Check-In success,
operational RPS, endpoint p95/p99, acquisition latency, rejection/timeouts,
resource use and auth failure taxonomy. Aggregate RPS alone is never evidence.

Pool saturation is demonstrated as the first limit only if time-aligned evidence
shows the serving pool reaches its limit, acquisition waiting rises and timeout/
QUEUE_FULL failures precede other bottlenecks while authorized tokens remain
valid. If auth failures or SQL lock waits occur first, report that instead. More
connections are a separate controlled experiment only after complete connection
accounting and lock/CPU evidence, never an inferred fix.

## H. Remaining risks

- No raw benchmark evidence or live benchmark process configuration was available;
  1000 VUs and any throughput/latency improvement remain unverified.
- The N+1 fix benefits multi-membership reads, not the normal single-membership
  query count. It may not materially affect the original workload.
- Query plans, lock waits, password-verification pressure and proxy 502 causes
  require representative runtime evidence. No index or lock tuning is claimed.
- HTTP disconnect is not cancellation authority. Work can finish after a lost
  response; mutation retry still needs canonical reconciliation/idempotency.
- Scoped expired native acquisitions are disposed on eventual checkout; the
  existing driver queue may retain them until its native bound. No immediate
  AbortSignal-based queue removal or private pg internals were introduced.
- Existing lease watchdogs bound abandonment; no universal proof of leak freedom
  across every application path is possible from these focused tests.
- API periodic metrics do not automatically cover worker pools or catch every
  short spike. PostgreSQL/per-process collection is required.
- Public temporary-error contracts remain intentionally generic. Missing runner
  metadata is marked NONE/unclassified rather than guessed from bodies/headers.

## I. Git delivery

Baseline and branch are recorded above. Dedicated worktree:
`/workspace/work/vaylet-performance`. The owner worktree at
`/workspace/valet-platform` is left untouched. The delivered run report records
logical commit SHAs, branch-only push result, remote/local HEAD equality and
final clean working-tree status. No PR, merge, deployment or manual CI trigger
is part of this task.

Application commits:

- `0d7dc1a7b2843a4f6720907281459de3c8a1c56b` — batch operational context membership reads.
- `ee54446d886a56cc7325911911ad4634a1cf69ca` — classify database pressure in private performance logs.

Both application commits passed focused verification before documentation delivery.
The final documentation commit SHA and push verification appear in the delivered
report; embedding a document's own commit hash would require another commit.
