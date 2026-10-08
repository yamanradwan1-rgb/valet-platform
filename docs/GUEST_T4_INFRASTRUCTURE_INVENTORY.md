# T4 — Source-backed infrastructure inventory

Scope: Guest U-09 readiness, reviewed on branch
`feat/guest-t4-deployment-ha-observability`, base
`d285d791be5b652afd713b9ee9183b61ff697ecc`. This document does **not**
authorize a production change. Classification denotes the nature of the
evidence; no production topology or availability is inferred from source.

## 1. Confirmed from code — current deployable components

| Component | Repository evidence | Assessment |
| --- | --- | --- |
| Customer | `apps/customer/next.config.ts`, `scripts/start-production.mjs`, `infra/systemd/vaylet-customer.service` | Next standalone server; sample systemd unit binds `127.0.0.1:3002` and uses a mutable `/workspace/valet-platform` checkout. **Not evidence of a deployed replica**. |
| Guest browser transport | `apps/customer/src/lib/api/api-origin.ts`, `next.config.ts` | Browser calls the Customer same-origin `/api/v1/guest/*` rewrite; compiled upstream is server-only `API_ORIGIN`, validated against generated artifact in T4. |
| API | `apps/api/src/main.ts`, `infra/systemd/`, `apps/api/src/app.module.ts` | Nest API listener with existing staff/Native and Guest routes. Production-bound listener, ingress and number of running replicas **unknown**. |
| Database | `apps/api/src/common/database/`, `packages/database/prisma/migrations/`, `packages/database/scripts/provision-runtime-role.mjs` | Shared PostgreSQL runtime pool and restricted-role provisioning, durable Browser Session and limiter functions. Actual provider, connection limit, TLS chain, backup and HA status **not established**. |
| Existing metrics | `apps/api/src/common/observability/`, `apps/api/src/modules/anti-abuse/anti-abuse-maintenance.ts` | Structured operations and T4 fixed-key HTTP, pool/process and cleanup measurements; no telemetry ingestion/provider/alert delivery demonstrated. |
| Proxy and tunnel | `infra/nginx/`, `infra/systemd/README.md` | Contains example Nginx/systemd/Cloudflare routing; no verified deployed proxy hops or trusted CIDR chain. |
| Release build | `scripts/build/`, `apps/customer/package.json` | `pnpm build:production` must inherit the real production build-time `API_ORIGIN`; generic verification builds are **not** production-artifact proof. |

## 2. Confirmed from code — T4 additions

- API: `GET /health/live` is dependency-independent. `GET /health/ready`
  evaluates draining, required config, Guest Browser Session and shared
  anti-abuse database capabilities, bounded by a read-only database deadline.
  Public payload contains only `status`; failures return 503.
- Customer: `GET /readyz` is fail-closed, checks the immutable standalone
  artifact-derived API `/health/ready` with an explicit 3-second timeout, and
  returns 503 when unhealthy or misconfigured. No Guest business logic moves
  into Next. Customer startup **also compares** the immutable artifact origin
  with deployment `API_ORIGIN` and rejects a missing/mismatched setting
  before starting Next; a runtime override cannot silently retarget traffic.
- API shutdown: T4 removes instance from readiness, denies new non-health
  requests and waits for bounded in-flight completion; existing DB lifecycle
  closes the shared pool after Nest's HTTP shutdown boundary.
- Proxy identity: the API resolves the nearest untrusted hop through an
  explicitly configured, finite trusted CIDR set and rejects missing or
  duplicate raw forwarding headers from trusted peers. CIDR values are NOT
  provided or selected by source code.
- Observability: `HTTP_METRIC`, `GUEST_OPERATION_METRIC`, `RUNTIME_METRIC`,
  `T4_READINESS` and `T4_DRAIN` have bounded fields; the provider/retention
  pipeline is still external and unconfigured.

## 3. REQUIRES RUNTIME PROOF — no topology invented

| Required fact | Why it matters | Safe evidence |
| --- | --- | --- |
| Actual public Guest hostname(s), DNS, TLS termination | Same-origin cookie, Secure and redirect boundaries | Authorized read-only DNS/TLS/routing inspection with sanitized output |
| Native authenticated API ingress | Native clients must stay supported while private Customer-to-API stays controlled | Authorized Native HTTPS request/routing proof, ingress ACL inspection |
| Exact proxy hop chain and real source CIDRs | Invalid trust can let client spoof anti-abuse IP | Sanitized proxy configs plus controlled spoof testing on approved staging |
| Two independent Customer instances | U-09 survival of instance failure | Verified host/provider zone/failure-domain IDs and health-routing test |
| Two independent API instances | No sticky Guest authority and request continuity | Verified instance identities and A/B alternating requests |
| Balancer health/drain integration | Automatic removal/recovery within 30 seconds | Timestamped drain, readiness and traffic-shift evidence |
| Managed PostgreSQL HA, TLS and privileges | Durable Guest authority and limiter survival | Provider topology, runtime-role checks and isolated failover drill |
| Backup policy, restore and database RPO | Avoid unrecoverable lost/revived sessions | Backup manifest, restoration rehearsal, measured recovery-point evidence |
| Independent application power/network zones | Two Node processes on one VPS do not provide HA | Provider failure-domain mapping, not systemd process counts |
| Staging capacity and monitoring delivery | Detect 5xx/p95/backlog and qualified recovery | Approved stage, dashboard screenshot, synthetic alert receipt |

`CONFIRMED FROM RUNTIME`: **none recorded for production**. Local builds and
unit tests prove their own contracts, not deployed topology. The repository's
existing single-VPS sample must not be promoted as U-09; its systemd restart
policy alone is not availability. The present VPS is not assumed to be the
approved final environment.

## 4. Intended U-09 target and current classification

At least **2 Customer + 2 API** instances on independent failure domains in
one region; **managed HA PostgreSQL**; no sticky browser sessions; bounded
readiness-based routing; sequential **100 / 500 / 1000** active-Guest capacity
qualification (T6). **99.9% monthly availability**, app-instance recovery
**within 30 seconds**, DB failover **within 120 seconds** and **zero** loss of
active Guest access, duplicate protected effects or cross-tenant disclosure.
**All production measurements are NOT VERIFIED.** RPO is deliberately unset.

## 5. Boundaries and sequencing

**Implementation-owned:** canonical origin validation, health/readiness,
draining, identity resolver tests, non-sticky persistence integration tests,
immutable-artifact verification, privacy-safe telemetry and alert definitions.

**Operator-owned:** real hostnames, private/public listeners, firewall, proxy
header stripping, actual CIDRs, application replicas in separate failure
domains, provider HA/backup, TLS, monitoring destination, immutable release
storage, staging credentials and synthetic alert routing.

Safe evidence sequence: (1) sanitize read-only host/proxy/provider inventory;
(2) validate build against **real authorized** `API_ORIGIN`; (3) verify static
asset privacy, cookies, Origin/CSRF and authorized Native ingress; (4) verify
runtime role and readiness in approved staging; (5) stage 2x2 replicas and
alternating-authority tests; (6) controlled instance failure/recovery; (7)
approved DB failover and isolated backup restore; (8) alert delivery;
(9) T6 capacity/soak/physical browser matrix. **No stage beyond step 1 is
authorized by this inventory itself.**

## 6. Issue boundary

Issue **#224** (Customer HTTPS origin) and **#227** (real production origin/
build) remain **evidence pending**. Code now guards these contracts; without
verified public HTTPS, real build-time origin and deployed traffic proof,
neither issue is declared complete or closed.
