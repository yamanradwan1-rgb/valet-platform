# T4 — Implementation, observability and evidence report

Repository branch `feat/guest-t4-deployment-ha-observability` (from
`d285d791be5b652afd713b9ee9183b61ff697ecc`). Source implementation
described here is **not** proof of deployed or independently qualified HA.
No production service, DNS/tunnel, database migration, Guest enrollment,
T3 ACTIVE policy or public rollout was changed by this task.

## 1. Intended scope and actual implementation

| Contract | Source changes | Evidence status |
| --- | --- | --- |
| Customer API origin | `apps/customer/src/lib/api/api-origin.ts`, `next.config.ts`, `scripts/build/build-contract.mjs`, `validate-customer-artifact.mjs` | Code validates real build-time origin, rejects missing/invalid production values, and checks generated rewrite against expected. Real production value **not supplied**. |
| Secure same-origin transport | Existing `/api/v1/guest/*` rewrite retained; `apps/customer/scripts/artifact-origin.mjs` and production start require exactly one immutable rewrite **and matching deployment `API_ORIGIN`** | Customer verification build/loopback standalone tests can prove header forwarding; public HTTPS/cookie use remains staging proof. |
| Trusted client identity | `apps/api/src/modules/anti-abuse/client-address.ts` + `test/anti-abuse-boundaries.test.ts` | Strict trusted-hop parsing, duplicate raw header rejection, canonical IPv4/6; actual authorized CIDRs and ingress stripping **not configured here**. |
| API liveness and readiness | `apps/api/src/health/**`, `common/database/runtime-database-readiness.ts`, `app.module.ts` | Dependency-free `/health/live`, bounded read-only DB/config/Guest/limiter `/health/ready`, generic 503 on required failure. No quota or mutation. |
| Customer readiness | `apps/customer/src/app/readyz/route.ts`, `lib/readiness/customer-readiness.ts` | Validates real artifact API `/health/ready` up to 3s; absent/unreachable/not-ready API → generic 503/no-store. |
| API drain | `apps/api/src/main.ts`, `health/application-drain-*.ts`, `health/graceful-drain.lifecycle.ts` | Withdraw readiness, deny new non-health traffic, wait up to 10s, close pool only after Nest transport lifecycle. SIGTERM metrics in code; real proxy/drain test unverified. |
| Shared authority | Existing PostgreSQL Browser Session and durable anti-abuse records retained; `test/guest-t4-ha-application.integration.test.ts` | No process-local Guest session authority or affinity added. Real dual-replica PostgreSQL tests authored; runtime execution unverified. |
| Lost-response safety | Existing T1/T2 reconciliation preserved, new `guest-t4-mutation-retry.integration.test.ts` | Tests require real authorized disposable PostgreSQL; never blindly replay protected POST. |
| DB metrics | `common/database/bounded-postgres-pool.ts`, `common/observability/runtime-metrics-pulse.ts` | Existing counters plus additive exact `acquisitionsOver200Ms`; fixed numeric samples every 30s. |
| Limiter cleanup | `modules/anti-abuse/anti-abuse-maintenance.ts`, `limiter-maintenance-metrics.ts` | Read-only telemetry snapshot of existing cleanup runs/deleted/failures/backlog sample/age; limiter authorization remains DB-backed. |
| HTTP metrics | `common/observability/http-metrics.middleware.ts`, `main.ts` | First middleware measures **final** response status, including guards/filters/drain failures and disconnected `499`, safe route categories only; no raw URL/query/headers. |
| Guest outcome metrics | `common/observability/guest-operation-metrics.ts`, existing console observer | Allowlisted operation names/outcomes, bounded error category and duration. Does not print free-text error codes. |
| Alerts | `infra/monitoring/guest-t4-alert-policy.json`, `README.md` | Targets defined and locally tested. No installed provider, ingestion, actual on-call, alert delivery or recovery acknowledgment. |

## 2. Security preservation / no policy expansion

- Browser Session authority remains server-side PostgreSQL; production proxy
  may forward only the same-origin Guest routes. No new auth type, bearer
  storage, client-side session authority, cookie weakening or broad CORS path.
- Trusted forwarding is **only** for peers within real configured CIDRs; the
  resolver rejects untrusted/duplicate/malformed trusted-hop input. Native
  authenticated API ingress must remain accessible under a controlled path.
- No Guest token, cookie, raw link, plate, tenant/session/user ID, raw IP,
  SQL, auth header or free-text request path becomes a metric label. HTTP
  metrics use bounded `GUEST_READ`, `GUEST_MUTATION`, `STAFF_AUTH`,
  `STAFF_OPERATION`, `HEALTH`, `OTHER` categories.
- The release SHA is emitted only if `VAYLET_RELEASE_GIT_SHA` is a 40-character
  lower-case hex string; `UNVERIFIED` is the fail-closed telemetry label, not
  a real release proof. Build-time origin stays private to the server and
  immutable compiled Guest rewrite.
- The normal API service must use the restricted runtime DB role and TLS,
  never the migration role. Readiness uses only bounded least-privilege
  catalog/permission queries, not business function calls, credential
  creation, limiter reservations or database schema migrations.
- Preserve T2 **21±1s** foreground cadence (never faster than 20s), stale
  threshold **35s**, hidden background suppression, coalesced wake reads,
  Retry-After, trust fencing and no automatic mutation replay. T4 did not
  change customer polling or handoff material.
- Preserve T3 **COMPATIBILITY** budgets and durable cross-instance
  accounting. Do not activate ACTIVE or weaken enforcement to improve perf.

## 3. Repository test evidence and classification

Owner's final commands/review outcomes must be attached to this branch's
delivery report; results below are local T4 implementation evidence:

| Gate | Observed evidence | Classification |
| --- | --- | --- |
| Customer origin/readiness tests | 17/17 passed in worker validation | Local focused PASS |
| Anti-abuse trusted identity tests | 9/9 passed in worker validation | Local focused PASS |
| Build contract tests | 8/8 passed, including runtime-deployment origin mismatch rejection | Local focused PASS |
| API health and HTTP/Guest observability | 19/19 passed after final shutdown and middleware corrections; API scaffold 1/1 also passed (20/20 total) | Local focused PASS |
| Customer standalone verification build | Built with explicit synthetic private **loopback** `API_ORIGIN`; runtime private-origin override did not affect artifact rewrite | **Verification proof only**, not true production build proof |
| Architecture aggregate | Two existing non-T4 violations: oversized DB context-switch test 328 lines; portable Employee `window` | Pre-existing baseline failures; T4-owned changes need independent line gate |
| Monorepo typecheck | Pre-existing `apps/valet` fixtures missing required `timezone` | Existing baseline failure; API+Customer targeted typecheck passed |
| Monorepo lint | Pre-existing Dashboard React hooks/ref violations | Existing baseline failure; API+Customer targeted lint passed |
| Non-PostgreSQL aggregate | Legacy module expectations, Dashboard/Employee tests and CPU-concurrent timed-out fixture tests fail | Aggregate **not green**, classify by file; avoid treating every fixture timeout as proof of a T4 defect |
| Real two-replica PostgreSQL suites | Added; pre-fix T4 ObservabilityModule independently instantiated a runtime pool inside HTTP test modules and blocked Nest startup, including an existing T3 suite. That T4 regression was corrected by placing RuntimeMetricsPulse in HealthModule. | Rerun pending against **confirmed disposable** PostgreSQL; no success or HA proof claimed. |
| Live public ingress, DB failover, alerts | No authorized staging/production evidence | **NOT VERIFIED** |

### T4 readiness concurrency merge-gate follow-up (2026-10-08)

**Confirmed source-level defect, not a measured production exploit.** Before
this remediation, 100 simultaneous calls to the real Customer readiness
checker invoked the mocked upstream fetch **100 times**; 100 simultaneous
calls to the real API HealthReadinessService invoked the mocked PostgreSQL
capability query **100 times**. Both baseline test runs passed while asserting
those observed counts. No network/load test was sent to production.

With single-flight in-flight coalescing, repeating both controlled 100-caller
scenarios invokes **1 upstream HTTP fetch** and **1 PostgreSQL capability
SELECT**, respectively. Each wave completes with its own authoritative
success/failure; no positive or negative result is retained after completion.
Both implementations admit at most **128 waiting callers per in-flight
operation**; additional callers fail closed immediately and do not enqueue
work. The cap is a local resource bound, not a production ingress rate limit.

- Customer rechecks the immutable artifact-origin configuration before
  waiting and before accepting a successful result. A changed/malformed origin
  while a check is pending fails closed; different configurations do not
  spawn a second simultaneous probe. Existing 3-second deadline and
  AbortController behavior remain intact; the shared promise slot clears even
  if a test transport ignores abortion.
- API independently checks Guest rate-policy, HMAC capability and production
  allowed origin **for every caller and again after the database wait**.
  Drain status is checked before starting and after awaiting the shared query,
  so neither a new call nor a late success can publish ready after drain.
  PostgreSQL readiness remains the existing read-only privilege/capability
  SELECT with a 2.5-second operation deadline; no Guest limiter reservation,
  token issuance, other mutation, migration or DB privilege expansion.
- Existing DB deadline/connection/statement limits still govern the underlying
  query and cleanup. Single-flight does **not** independently guarantee that
  an uncooperative network or real PostgreSQL driver cancels immediately;
  real pool and failure recovery must still be observed on approved staging.
  The API in-flight slot clears after a timeout and permits the next wave.
- Tests also cover 200-call overflow, repeated success/failure/success waves,
  failed config, deadline/retry, late database success after drain and generic
  Customer `/readyz` response without credentials or internal details.

Local focused commands after remediation: Customer `vitest run`
`src/app/readyz/route.test.ts` and
`src/app/readyz/readiness-concurrency.test.ts` **10/10 PASS**; API
`vitest run --config vitest.config.mjs --project api-non-postgres`
`test/guest-t4-health.test.ts` and
`test/guest-t4-readiness-concurrency.test.ts` **18/18 PASS**. Both targeted
TypeScript checks and both app-level lint commands passed. The repository-wide
architecture check still fails on the two pre-existing out-of-scope violations
listed above; all six follow-up changed/new files remain within the 300-line
authored-code ceiling and no new T4 architecture violation was reported.

**Infrastructure qualification remains pending.** The operator must restrict
health endpoints to appropriate load-balancer/monitoring sources where
practical, apply edge rate/concurrency controls against public probe floods,
preserve legitimate probes, and verify readiness routing/monitoring across real
replicas. The actual ingress ACL, forwarding hop chain, DB HA and alert
provider are not established by these unit-level measurements.

No new production DB migration, Prisma schema change, lockfile/dependency
change, Guest UI redesign, Android/iOS build or deployment is intended in T4.
Current published commit/review outcome belongs in the final Owner handoff,
not guessed in this static implementation document.

## 4. Operational metric contract

| Source | Bounded measurement | External gap |
| --- | --- | --- |
| `HTTP_METRIC` | request class, status, outcome, duration; includes rejected/closed operations after route middleware | Provider-wide ratio and p95 need complete ingress sampling, even for upstream/WAF failures |
| `GUEST_OPERATION_METRIC` | whitelisted operation, SUCCESS/ERROR, bounded error category, duration | Business outcome/projection must be interpreted, not guessed from HTTP code alone |
| `RUNTIME_METRIC` | pool total/idle/waiting, acquisitions/rejections/timeout types, `acquisitionsOver200Ms`, memory/CPU/uptime, cleanup counters and backlog sample | Retention, histogram/delta ingestion, process restarts, DB-provider connection telemetry |
| `T4_READINESS` | ready/unavailable transition without names/secrets | Actual healthy replica counts and uptime SLO |
| `T4_DRAIN` | withdrawn/completed, bounded duration and remaining requests | Real LB traffic-rerouting, hard-kill, load shedding and response-loss measurements |

Operational release, infrastructure and provider metrics (host restarts,
overall CPU utilization vs process CPU time, DB failover, backup restore,
reconnection intervals, stale view duration, incident confirmation) require
separate provider/client integration. **Do not claim them measured from
existing emitted log lines.** Per-session/auth-protected recovery counters
must be instrumented/qualified without logging identifiers or inflating
metric cardinality; T2/T6 own the browser/physical view evidence.

## 5. Alert rules and responsibilities

The source of machine-readable intended policy is
`infra/monitoring/guest-t4-alert-policy.json`. The repo does **not** configure
an actual alert manager, destination or pager. Required target severity:

| Signal | Rule | Severity |
| --- | --- | --- |
| Confirmed active visit access loss | Any confirmed defect | Immediate page |
| Duplicate protected effect | Any confirmed duplicate | Immediate page |
| Cross-tenant/session disclosure | Any confirmed disclosure | Immediate page |
| Unexpected legitimate 429/401/403 | Baseline deviation; classify abuse vs normal | Investigation |
| HTTP 5xx | Greater than 1% of HTTP responses during five minutes | Page |
| Guest read latency | p95 >1 second during five minutes | Page |
| DB pool acquisition wait | p95 >200ms during five minutes | Page |
| Eligible cleanup backlog | Oldest eligible row >2 hours | Alert |
| No ready replica in a required tier | Count zero | Immediate page |

For pool p95, evaluate delta of cumulative `acquisitionsOver200Ms` /
`acquisitions` across reset-aware five-minute windows. The approved policy
has `OPERATOR_TO_ASSIGN` as the placeholder; operator must set responder,
backup, severity, destination and escalation route, then perform an
**authorized staged synthetic failure** and record notification delivery,
time-to-detect, ACK, responder and recovery notice. A JSON file or log line
alone proves **neither alert delivery nor 99.9% availability**.

## 6. Post-review qualification

Three required review lenses: (A) proxy/origin/cookie security and built
artifact, (B) readiness/drain/DB/no sticky Guest/rollback and (C) safe
observability/alert delivery gaps. Any P0/P1 code blocker discovered must be
fixed on this branch and retested before declaring T4 code-ready. No reviewer
can certify unmeasured deployed HA from code inspection.
