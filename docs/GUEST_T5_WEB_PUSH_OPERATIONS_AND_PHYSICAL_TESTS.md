# Guest Web Push v1 — operational runbook and physical qualification

Status: **OWNER APPROVED design (DEC-101) / NOT DEPLOYED / PHYSICAL NOT VERIFIED**.
This runbook is an implementation/ops handoff, **not** authorization to run
production migrations, set up provider credentials, deploy, or enable Guest
enrollment. Production readiness is separate under T6.

## Deployment architecture and safety boundaries

The first-launch path is the existing public Customer **HTTPS** origin, same-origin
Guest API proxy, API modular monolith and dedicated Guest Web Push worker process.
There is **no** separate domain mutation service, Redis, Kafka or sticky browser
session. PostgreSQL durable GuestPushRegistration, GuestPushIntent and
GuestPushDelivery rows persist subscription bindings, immutable READY intent and
per-recipient attempt/lease truth. Staff Push persistence is independent.

All customer-facing API routes derive the exact Browser Session from the secure
HttpOnly cookie; mutations enforce accepted origin/CSRF and anti-abuse checks.
The browser chooses only a standards PushSubscription endpoint/encryption keys
and the approved locale. It never supplies trusted tenant, visit, membership,
session generation, or service-worker delivery recipient. A notification click
never carries an authority token and always triggers normal reauthorization.

**First READY** is `RETRIEVING -> READY` with stable identity
`ValetSession.id + ready_at`. READY, audit and push intent/delivery creation
commit atomically. Provider network I/O is **not** in that transaction.

### Accepted policy v1

| Setting | Approved value |
| --- | --- |
| Supported kind | `GUEST_VEHICLE_READY` only |
| Absolute intent expiry | 30 min after the first READY event |
| Max provider attempts | 4 |
| Provider-call deadline | 10 seconds |
| DB worker lease | 30 seconds |
| Retry | full jitter, 10-second floor, exponential cap 60 seconds |
| Intent/delivery retention | 7 days |
| Terminal registration retention | 30 days |
| Version | 1 |

### Actual named configuration contract

The checked-in `.env.example` documents the fixed, opt-in runtime switches:

| Name | API vs sender | Rule |
| --- | --- | --- |
| `GUEST_PUSH_REGISTRATION_ENABLED` | API | `false` by default; enables only Browser Session authorized subscription enrollment |
| `GUEST_PUSH_WORKER_SENDING_ENABLED` | Guest worker | `false` by default; no sends without explicit operator rollout |
| `GUEST_PUSH_WORKER_DATABASE_URL` | **Guest worker only** | Dedicated PostgreSQL LOGIN role/password. Worker startup also requires `DATABASE_URL` only as a comparison guard and refuses a missing/invalid URL or the same PostgreSQL username/principal; the worker DB pool is created only from this dedicated URL |
| `GUEST_PUSH_WORKER_ROLE` | **Migration provisioner only** | Existing dedicated worker LOGIN role name; must match the worker URL principal exactly, differ from ordinary API and migration principals, and share the same database/server/port. Not a credential. |
| `GUEST_PUSH_VAPID_PUBLIC_KEY` | API safe config + worker | Non-secret public application-server key; only enabled registrations receive it |
| `GUEST_PUSH_VAPID_PRIVATE_KEY` | Worker secret-store only | Never make available to Customer or ordinary API/browser runtimes |
| `GUEST_PUSH_VAPID_SUBJECT` | Worker secret-store config only | Accepted sender contact subject; not a Guest-provided value |
| `GUEST_PUSH_POLICY_VERSION` | Backend | `1` |
| `GUEST_PUSH_INTENT_TTL_SECONDS` | Backend/worker | `1800` (30m, absolute; never reset) |
| `GUEST_PUSH_MAX_ATTEMPTS` | Backend/worker | `4` |
| `GUEST_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS` | Worker | `10` |
| `GUEST_PUSH_LEASE_DURATION_SECONDS` | Worker | `30` |
| `GUEST_PUSH_RETRY_MINIMUM_SECONDS` | Worker | `10` |
| `GUEST_PUSH_RETRY_CAP_SECONDS` | Worker | `60` |
| `GUEST_PUSH_INTENT_DELIVERY_RETENTION_DAYS` | Worker maintenance | `7` |
| `GUEST_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS` | Worker maintenance | `30` |

The separately deployed worker entrypoint is
`apps/api/src/guest-push-worker.ts`; the API's dedicated package script is
`pnpm --filter @valet/api start:guest-push-worker` **after** an authorized
build, migration, secret configuration and runtime safety approval. Do not
invoke it against an unknown database and do not enable the worker as a
side effect of starting the ordinary HTTP API. Worker teardown must close
its bounded DB pool and cease new claims on SIGTERM/SIGINT.

The worker fails closed before opening its pool unless both database URLs are
present, parse as PostgreSQL URLs with named principals, and the worker
principal differs from the ordinary API principal. Supplying a different host,
password or database name with the **same PostgreSQL username** does not satisfy
this isolation guard. Production runtime-role/TLS safety verification is then
performed against the dedicated worker pool.

## Environment and deployment prerequisites

Before a **separately authorized** rollout, the operator must:

1. Confirm the immutable Customer artifact's exact public HTTPS origin, its
   browser service-worker scope, Next same-origin API proxy and secure cookies;
   do not use temporary tunnel hostnames or a mixed build/runtime origin.
2. Provision reviewed VAPID application-server public/private keys separately
   in every environment. The private key and approved contact subject exist
   only in the authorized **sender secret store**, never source control,
   browser bundles, HTTP responses or logs. The public key may reach the
   Customer through the narrow no-store safe configuration route.
3. Review dependency `web-push` lockfile, MPL-2.0 license, runtime compatibility,
   registry/security advisories and source integrity; no manual crypto.
4. Prepare the dedicated **forward** SQL migration and required narrow
   SECURITY DEFINER functions/grants. Use three distinct DB role boundaries:
   migration owner, ordinary API runtime (Guest registration/READY
   transaction functions only), and Guest sender worker (bounded
   lease/maintenance plus a lease-fenced secret resolver). Ordinary API
   cannot read delivery lease tokens or EXECUTE the secret resolver, and
   worker cannot invoke Guest registration or READY business writer. Verify
   denied and allowed grants with real distinct-connection tests on a
   **confirmed isolated disposable database**. Keep migration credentials
   out of all production API/worker environments.
   The separate role-grant script is
   `pnpm --filter @valet/database guest-push-worker:provision`, requiring
   `MIGRATION_DATABASE_URL`, `DATABASE_URL`,
   `GUEST_PUSH_WORKER_DATABASE_URL` and `GUEST_PUSH_WORKER_ROLE`.
   It does **not** create a new DB LOGIN/password and rejects role/URL
   mismatch or privileged identity reuse *before* opening the migration
   connection. It is not authorized to run against staging/production in T5.
5. Configure an independently managed, bounded, observable Guest worker
   process using the existing API build artifact and PostgreSQL connection
   limits; the job may be replicated. Ensure outbound TLS, DNS and permitted
   HTTPS egress to Apple/Android browser push endpoints. Do not run a sender
   with unverified secrets or direct unrestricted table mutation privileges.
6. Start with registration/sending disabled until the migration has completed,
   then enable only through the explicit reviewed rollout switch and verify
   worker read-only readiness/backlog before allowing real subscriptions.
7. Confirm the enabled Guest notification effective Organization default ->
   Location override, including a negative-location test. Never enable Guest
   Browser Session enrollment from this Web Push task alone.

### Credential rotation and fallback

VAPID private-key rotation must be executed as a separate, reviewed operation.
Subscriptions are associated with the public application-server key used when
the browser subscribed; a changed key can invalidate old delivery ability.
Roll out a replacement key version safely: preserve canonical Guest
authorization, make clients explicitly re-subscribe from approved consent,
record invalid endpoint outcomes, disable retired keys only when the migration
is confirmed. Do not log old/new private material. Without valid VAPID
configuration, disable only push sending/enrollment; normal Guest status,
retrieval, rating, secure handoff and completed reads remain available.

### Multi-replica, failure and security invariants

- Exactly one ACTIVE registration per current Browser Session and endpoint
  owner under database uniqueness; conflicting initial registrations on
  different API replicas converge deterministically.
- Exactly one intent per READY stable identity and at most one delivery per
  (intent, registration), including duplicate Mark Ready and concurrent workers.
- Claims are short transactions with `SKIP LOCKED`, bounded attempt count and
  unique lease token; finalization always compares the **exact lease token**.
- Immediately before provider I/O, re-prove current visit/tenant/Location,
  Browser Session and credential generation, revocation and effective
  notification policy, trigger identity, terminal/completion state and expiry.
- After an authority revocation, an already-in-flight *generic* notification
  may still display. It contains no private value and cannot reauthorize.
  Revocation **before** the last eligibility check suppresses new sends.
- Provider `ACCEPTED` is **only provider acknowledgement**; it is not a
  device display or viewed/seen state. Timeout after provider acceptance can
  cause at-least-once duplicate attention, mitigated with the opaque intent
  notification `tag` where supported.
- Worker/provider outage must never roll back READY, issue another Task,
  consume handoff proof, release custody, or cause a fake `PAID` state.

## Required telemetry and operator alarms

Use bounded, low-cardinality classes: registration outcomes, pending and
leased deliveries, oldest due age, retry/expired counts, provider accepted/
temporary/rate-limited/invalid/permanent/configuration/unknown results, lease
reclaims and retention cleanup. Metrics/log labels must **not** contain the
PushSubscription endpoint/hash/auth keys, raw bearer, cookie, ValetSession/
Organization/Location IDs, plate, customer information, provider payload or
VAPID material. Alert on growing due backlog, persistent configuration
failure, rising invalid-endpoint or unknown/provider error rates and missing
worker heartbeat; establish measured thresholds in T6.

## Device qualification matrix — actual physical evidence required

Do not substitute Vitest, Node service-worker mocks or successful provider HTTP
responses for OS-level notification receipt.

| Physical mode | Required setup | Required evidence |
| --- | --- | --- |
| Android Chrome HTTPS tab | Explicit permission, Browser Session valid, tab foreground then background/process closed | READY event -> provider acceptance -> actual device notification, click and current safe Guest reauth |
| Android installed Guest PWA | Install from approved HTTPS origin; explicit permission | Distinct background/locked/closed evidence; no assumed storage equivalence with Chrome tab |
| iPhone/iPad Home Screen web app, iOS/iPadOS 16.4+ | Add to Home Screen and initiate permission through tap in installed web app | Actual locked/closed OS notification, click, current visit authorization, version/build recorded |
| Ordinary iPhone Safari tab | No false Home Screen equivalence | Foreground-only notice or install guidance; **no** closed-tab push claim |
| Denied/unsupported/offline/revoked | Explicit variations for each platform | Honest UI, normal Guest canonical flow remains usable, revocation click denied, zero credential leak |

For each captured run, record device OS/browser versions, installed mode, exact
Customer origin, permission state, non-sensitive registration/version marker,
READY server event reference in restricted test logs, expected notification
language, approximate event/provider/device timestamps, click result,
re-authorization and proof of no duplicate business transition. Ensure no
bearer/private endpoint appears in screenshots.

Test the following timing races independently: staff Mark Ready rollback,
repeat Mark Ready, registration under simultaneous API requests,
generation reissue/context transfer before send, completion before send,
completion/revoke **after** provider I/O begins, two workers claiming one
delivery, worker death just before/after provider acceptance, provider timeout,
invalid endpoint cleanup, 30-minute expiry, duplicate tag and cleanup after
7/30 days. Distinguish automated SQL concurrency evidence from device proof.

## Safe rollback and release authority

Disable **only** new push enrollment and Guest worker sending on outage or
rollback. Preserve existing Guest Browser Session/cookie, foreground READY
polling and canonical vehicle status, secure handoff and rating/payment reads.
Do not destructively roll back migrations or purge ValetSession/Audit/Task
history. A version-compatible maintenance worker may expire pending work and
clear stale subscription secrets within the approved retention window.

Final first-launch **go/no-go** belongs to T6, after real HTTPS, separate
secret/migration/worker deployment authorization and measured HA/failover,
capacity, long-soak, browser/device and legal/operational acceptance evidence.
