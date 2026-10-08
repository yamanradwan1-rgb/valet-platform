# T4 — Controlled deployment, rollback and recovery runbook

**Not an authorization to execute.** This is an operator handoff template,
not a claim that any production release directory, provider, hostname,
monitoring service, replica or backup exists. The source branch has NOT been
deployed. Substitute only **confirmed, authorized** environment values; do not
run destructive examples against shared or production databases.

## 1. Owner/operator preconditions and hard stops

1. Owner authorizes target staging/prod, release SHA, T5/T6 gates, rollout
   window and any Guest enrollment activation **separately**. T4 grants none.
2. Operator verifies ≥2 Customer and ≥2 API replicas with independent
   failure domains, managed PostgreSQL HA, network routing, health checks,
   HTTPS/hostname and valid Native ingress. A single VPS is not enough.
3. Operator inventories current release and previous compatible immutable
   artifacts, public static/SW compatibility, DB migration level and runtime
   credential role. No destructive or reverse migrations.
4. Operator allocates secret storage and verified monitoring contacts; no
   tokens, links, session cookies, credential material or authenticated logs
   enter committed manifests, shell history or terminal reports.
5. Stop before activating if runtime `MIGRATION_DATABASE_URL` is supplied to
   API, T3 `ACTIVE` is enabled without full independent qualification, an API
   auth route fails, a replica is unready or any protected mutation duplicates.

## 2. Proven repository commands (pre-deployment only)

Use a **clean isolated checkout** of the selected commit; build environment
must be the authorized production one, not `scripts/build`'s deterministic
verification origin. Commands below are meaningful only after a real operator
has set those inputs; no actual production value is provided here.

```sh
git rev-parse HEAD
git status --short
pnpm install --frozen-lockfile
pnpm architecture:check
pnpm lint
pnpm typecheck
pnpm test:non-postgres
pnpm test:build-contract
```

The production build is the existing repository command **only after** the
operator has provisioned and verified real `API_ORIGIN` at **build time**:

```sh
pnpm build:production
```

This command has not been executed for the final production origin in T4.
`apps/customer` validates generated standalone `routes-manifest.json`, the
exact Guest rewrite, artifact-derived private readiness origin, required
static assets, and absence of upstream private origin in public bundles.
Run it in the actual production build environment; attaching `API_ORIGIN`
only to systemd at runtime does **not** qualify the compiled rewrite.
Deployment runtime `API_ORIGIN` must additionally **exactly match** the
artifact rewrite origin: Customer startup refuses missing/mismatched or
invalid settings rather than serving a cross-environment artifact.

`API_ORIGIN` (Customer build/server-only),
`EXPO_PUBLIC_CUSTOMER_APP_ORIGIN` (Native Guest opening) and
`NEXT_PUBLIC_CUSTOMER_APP_ORIGIN` (Employee Web sharing) are distinct.
Never replace one with another. The actual Customer hostname, API TLS hop,
trust CIDRs and operator environment must be discovered, not guessed.

## 3. Immutable artifacts and release descriptor

Package both the Customer standalone tree (including `public/`, `.next/static`
and `.next/routes-manifest.json`) and a compatible API artifact from the
**same authorized Git SHA**. Store them in operator-owned **immutable**
versioned storage, not a mutable Git checkout. A release descriptor must
contain the Git SHA, cryptographic artifact digest, a **non-secret fingerprint**
of build-time API origin/config, runtime configuration version reference,
minimum-compatible API/schema versions, creation/activation timestamps,
previous known-compatible artifact digest and approval ticket/operator. Do
not put actual `API_ORIGIN` if it reveals an internal host in a public manifest;
store sensitive config separately under restricted access.

`VAYLET_RELEASE_GIT_SHA` is the repository-owned telemetry field; set it to
the actual 40-character release commit SHA on each approved API replica and
validate against the immutable descriptor. `UNVERIFIED` means release linkage
is **not established**. Manifest format, storage, atomic link/switch command,
and replica-specific service names remain `REQUIRES OPERATOR CONFIGURATION`
until a real hosting topology is accepted. Do **not** claim the existing
single-host unit files constitute the final immutable release scheme.

## 4. Safe phased rollout **procedure** (not executed)

1. Confirm DB **forward-only** migrations are applied only by the separately
   authorized migration role, with compatible old/new API functions and no
   session-table reset; preserve current revocations and audits. Runtime role
   must never own `MIGRATION_DATABASE_URL`.
2. Qualify T1 Browser Session resolution across old/current compatibility
   versions; retain old cookies, active visits, limited post-visit reads and
   legacy SW assets in the defined compatibility window.
3. Stage each Customer/API artifact with its immutable config and registered
   release digest. Validate `GET /health/live`, `GET /health/ready` and
   Customer `GET /readyz` on each *actual* instance. Readiness must fail for
   missing DB/anti-abuse capability, invalid config or draining process.
4. Check public HTTPS route strips client-provided forwarded identity and
   logs no authenticated URLs/cookies; verify Origin/CSRF/no-store/Set-Cookie
   preservation and Native API access. Derive `ANTI_ABUSE_TRUSTED_PROXY_CIDRS`
   from controlled proxy hop evidence only. Never use universal trust CIDRs.
5. Shift traffic to one verified ready replica **only on explicit operator
   approval**, observe health and error rate, then sequentially drain old
   replicas while keeping enough healthy replicas to serve current Guests.
   Do not run auto-advancing canary percentages or new enrollment cohorts.
6. On graceful API termination: readiness withdraws; ingress stops assigning
   traffic; new operations receive generic 503; eligible requests can finish
   for **at most 10 seconds** before hard close. Measure actually delivered
   responses and ensure operator proxy timeout/drain exceeds the API window.
7. After every replacement, alternate same valid Guest Browser Session across
   Customer A/B → API A/B and confirm same visit, no session resurrection,
   no cross-tenant scope transfer or duplicate retrieval/handoff.
8. Verify alerts are delivered to real responders and recovery notification
   reaches them. Final go/no-go is **Owner/operator**, not this repository.

## 5. Failure, reconciliation and rollback

Treat hard kill, OOM, network partition, power loss and DB failover as
**different** from graceful SIGTERM. Application shutdown hooks may never run;
Guest authority, durable anti-abuse and business transitions must remain
PostgreSQL-authoritative. A protected POST with a lost response has an
**unknown outcome**. **Never blindly replay it**: restore server authority,
GET the canonical current state and follow the accepted explicit recovery/
staff reissue path. Reissue invalidates old generations; revoked Browser
Sessions must not return after a cache warmup or rollback.

On suspected bad release: stop **new enrollment first** where applicable;
preserve already enrolled Browser Sessions and security revocations; route
only to a previously proven compatible immutable API/Customer pair; retain
additive schema and compatible public asset/SW versions; preserve financial,
audit and custody history. **Do not restore old database state**, undo
migrations destructively or use a version that cannot resolve current
Browser Sessions. If no safe previous artifact exists, hold traffic in
safe failure/recovery mode and escalate rather than force an incompatible
rollback. Actual `systemctl`/load-balancer/release-switch commands need
verified provider paths and separate operator authorization; none is
fabricated here.

## 6. Bounded staging experiments — operator must authorize target

Use `scripts/test-harness/guest-t4-staging-read-probe.mjs` only on authorized
staging with opt-in `GUEST_T4_STAGING_READ_PROBE=1`, actual distinct HTTPS
replica origins and an authorized Browser Session credential supplied through
ephemeral secret injection, not command-line args. It performs **read-only**
per-replica current-visit checks and optional stale/revoked denial checks;
it does not prove load balancing, physical failures or database RPO/RTO.

Separate approved run records must contain date, target, release/config
digest, health-routing observations, cookie/CSRF/Native verification, A/B
alternation, single API and Customer failure, forced hard-kill, graceful
drain, managed DB failover, isolated backup restore, loss/recovery time,
in-flight protected operation outcome, telemetry and synthetic alert receipt.
T6 owns 100/500/1000-Guest capacity, eight-/26-hour soak, browser/physical
matrix and full go/no-go. Never conduct disruptive tests on production or
shared databases under this document alone.
