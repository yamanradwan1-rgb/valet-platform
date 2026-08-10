# DEC-024 — Shared Durable Anti-Abuse Boundary

Status: Proposed  
Date: 2026-08-10

> This focused proposal is the review copy for VAL-004M. Once accepted, its binding text must be incorporated into `docs/08_DECISIONS_LOG.md` before VAL-004M is merged.

## Context

Phase 2 now exposes two production-sensitive public boundaries that need shared anti-abuse protection:

- staff password login at `POST /v1/staff/auth/login`;
- guest bearer resolution at `GET /v1/guest/session`.

DEC-023 already requires no more than five failed staff credential attempts per normalized identifier in a rolling 15-minute window and no more than 30 staff login attempts per trusted client address in a rolling 15-minute window. Guest access separately requires externally usable rate limiting without persisting or logging raw bearer tokens.

Process-local counters are rejected because they reset on restart and diverge across API replicas. The locked stack already requires PostgreSQL, and the initial production model is a containerized API behind a reverse proxy/load balancer as appropriate. Redis, a managed WAF/CDN limiter and another distributed cache are not currently accepted infrastructure dependencies.

## Options considered

- **Option A — PostgreSQL-backed exact rolling-window state.** Use the existing shared database with transactional serialization and short-lived limiter events/reservations.
- **Option B — Redis-backed limiter state.** Good fit for high-volume rate limiting but introduces a new production service, network boundary, persistence/availability policy and ACL/TLS requirement.
- **Option C — managed edge/WAF rate limiting.** Useful for coarse network/request protection but cannot by itself safely own staff normalized-identifier semantics without moving sensitive application meaning to the edge.
- **Option D — process-local memory.** Rejected because it is neither durable nor shared across replicas.

## Proposed decision

Use **Option A: PostgreSQL-backed exact rolling-window anti-abuse state** for the Phase 2 production-readiness boundary.

PostgreSQL is already a mandatory shared dependency for staff authentication and guest resolution, so this option adds no new network service or provider dependency for the pilot. Exact rolling-window semantics can be enforced transactionally across multiple API processes. Contention is intentionally limited to requests sharing the same limiter key.

Redis remains a valid future optimization if measured load demonstrates that PostgreSQL limiter traffic is material. Moving the mechanism later requires a new accepted decision and equivalent behavioral/security tests. Edge/WAF controls may later add coarse DDoS protection but do not replace this application-level contract.

## Limiter key derivation and privacy

The application uses one dedicated **32-byte production secret**, separate from staff/guest credentials and database credentials, to derive limiter keys with HMAC-SHA-256. The same secret must be configured identically on every API replica.

Persisted limiter keys use:

```text
anti-abuse-hmac-sha256:v1:<64 lowercase hex characters>
```

HMAC inputs are domain-separated:

```text
v1|staff-login-identifier|<normalized email>
v1|staff-client-address|<canonical client IP>
v1|guest-client-address|<canonical client IP>
v1|guest-token|<exact raw guest bearer>
```

Raw email, normalized email, raw/canonical client address, raw guest bearer, password, Authorization header and Cookie header must never be stored in limiter persistence, AuditEvent, logs, traces or metrics.

The staff identifier uses the exact DEC-023 normalization already used by staff login. The limiter must not invent a second email canonicalization rule.

The guest-token limiter key is independent of the guest authentication SHA-256 verifier already stored on `ValetSession`; anti-abuse persistence must not reuse or expose that authentication verifier.

The HMAC secret is a deployment secret and must never be committed. Production startup must fail closed if it is absent, malformed or not exactly 32 decoded bytes. Uncoordinated secret rotation is prohibited because it would split/reset active windows. A later rotation procedure must preserve current enforcement or deliberately drain the protected endpoints during rotation.

## Exact rolling-window model

All limits use an exact rolling **15-minute** window based on PostgreSQL server time. Client clocks are never authoritative.

Limiter persistence is ephemeral security-control state, not tenant `AuditEvent` history. Conceptually each row contains only:

- server-generated event/reservation ID;
- limiter scope;
- versioned HMAC key;
- server-authoritative timestamp;
- minimal reservation/finalization state where required.

The implementation must index `(scope, key, occurred_at)` for current-window lookup and must never persist request bodies or credential material.

For one logical limiter key, check/reserve/record behavior is serialized with a PostgreSQL transaction-level advisory lock and one database transaction. The full HMAC key remains the authoritative lookup key. An advisory-lock hash collision may only over-serialize unrelated keys; it must not merge their counters or permit threshold bypass.

A request rejected because an applicable threshold is already exhausted does **not** append another counted event. Repeated 429 requests therefore do not extend the lockout indefinitely.

`Retry-After` is computed from the earliest still-counted event/reservation whose expiry currently keeps the relevant threshold exhausted.

## Staff-login client-address limit

For a syntactically valid login request that reaches staff authentication, check the trusted-client-address limiter before password verification.

Contract:

```text
30 accepted login attempts per trusted client address
within the immediately preceding 15 minutes
```

The first 30 attempts may proceed. The next attempt while 30 counted events remain inside the rolling window returns 429.

Every syntactically valid login attempt that passes the limiter consumes the address quota regardless of whether it later:

- succeeds;
- uses an unknown email;
- has a wrong password;
- targets a disabled User;
- encounters an unsupported/malformed stored password hash.

Malformed JSON/body/schema requests and Origin failures keep their existing 400/403 transport semantics and do not create staff identifier/address limiter events. Coarse malformed-request/DDoS protection remains a separate reverse-proxy/edge concern.

## Staff-login identifier-failure limit

For a syntactically valid request with a normalized email, check the identifier limiter before Argon2 verification.

Contract:

```text
5 failed credential attempts per normalized identifier
within the immediately preceding 15 minutes
```

Unknown email, wrong password, disabled User and unsupported/malformed stored password hash are all the same counted credential-failure outcome.

A successful login does not remain counted against the identifier-failure quota and does not erase earlier failures.

To prevent concurrent requests from overshooting the five-failure threshold, every allowed identifier attempt first creates a `PENDING` reservation while holding the limiter key transaction/lock. Current `PENDING` plus counted `FAILED` rows consume the five slots.

After authentication outcome:

- credential failure -> finalize reservation as `FAILED`;
- successful login issuance -> finalize as `IGNORED_SUCCESS`;
- unexpected application/authentication failure before conclusive success -> retain/finalize a fail-safe counted state until the reservation ages out.

A correct password submitted while five still-counted failures exist is temporarily rejected with the same 429. The limiter must not bypass the threshold merely because credentials would otherwise succeed.

Known and unknown identifiers use identical reservation, key-derivation and 429 behavior.

## Guest-access limits

Guest credentials already contain 256 bits of random entropy. Guest limiting primarily protects endpoint resources and repeated guessing/replay while avoiding unnecessary penalty to normal shared-NAT traffic.

Two limits apply to `GET /v1/guest/session`.

### Guest trusted-client-address failure limit

```text
60 failed guest-authentication attempts per trusted client address
within the immediately preceding 15 minutes
```

The guest address limiter uses the same pending-reservation pattern as the staff identifier limiter.

Missing/malformed bearer, random/unknown bearer, expired bearer and revoked/rotated-old bearer finalize as counted failures. A successful guest resolution finalizes as ignored success and does not remain counted against the address-failure quota.

### Guest token request limit

```text
120 requests per shape-valid derived guest-token key
within the immediately preceding 15 minutes
```

Every shape-valid bearer presentation consumes the token-key quota before validity is disclosed, whether the token is valid, expired, revoked, rotated-old or unknown. Successful guest requests therefore remain bounded per credential while many valid guests behind one shared address do not permanently consume the address-failure quota.

A rotating-random-token attacker cannot bypass the address-failure limit by changing token values. Repeated use of one token is additionally bounded by the token-key limit.

Requests without a shape-valid bearer have no token-key event but can consume the guest address-failure reservation.

## 429 response contract

Threshold exhaustion returns HTTP 429.

Staff login:

```text
code: STAFF_AUTHENTICATION_RATE_LIMITED
message: Too many requests. Try again later.
```

Guest resolution:

```text
code: GUEST_ACCESS_RATE_LIMITED
message: Too many requests. Try again later.
```

The normal bounded `X-Request-Id` remains present.

`Retry-After` is an integer delta-seconds value:

```text
ceil(earliest still-counted expiry - database now)
```

bounded to at least `1` and at most `900`.

The response must not expose account existence, guest-token validity, counter values, which limiter scope fired, limiter keys, raw identifiers/addresses/tokens or database details. 429 responses are non-cacheable.

Below threshold, existing 400/401/403 behavior remains unchanged.

## Trusted client-address contract

The TCP peer address from the server socket is authoritative unless the immediate peer is explicitly configured as a trusted reverse proxy/load balancer.

Production configuration provides an explicit allowlist of trusted proxy CIDRs. An empty list means **direct-client mode**: all forwarding headers are ignored and the canonical socket peer address is used.

Only when the immediate socket peer belongs to a configured trusted-proxy CIDR may the application use `X-Forwarded-For`. `Forwarded`, `X-Real-IP` and other client-address headers are not independent authority.

For a trusted peer, the proxy/load balancer must sanitize or append the forwarding chain according to the deployment contract. The application parses only syntactically valid IP literals, walks the `X-Forwarded-For` chain from right to left together with the direct peer, discards hops inside configured trusted-proxy CIDRs, and selects the first untrusted hop as the client address.

An untrusted direct peer may send arbitrary forwarding headers, but they are ignored.

Malformed forwarding data received from a trusted proxy fails closed for the protected endpoint rather than falling back to an attacker-selected value.

IPv4 and IPv6 are accepted. IPv4-mapped IPv6 is normalized to canonical IPv4 before HMAC keying. IPv6 text must use one canonical representation so alternate spellings cannot choose different limiter identities.

The implementation must not use a fixed trusted-hop count by itself. Production must document trusted proxy CIDRs and prevent direct untrusted access to a proxy-only internal API listener when proxy mode is enabled.

## Limiter-backend outage behavior

Both protected boundaries fail closed if the anti-abuse PostgreSQL operation cannot be completed.

Staff login:

- do not perform password authentication or issue a session;
- return a stable generic 503 security-service-unavailable response.

Guest resolution:

- do not resolve or return guest session data;
- return a stable generic 503 security-service-unavailable response.

A limiter outage must never silently fall back to process-local memory or unlimited access.

Because this limiter uses the same PostgreSQL dependency already required by these authentication paths, it does not introduce another independent production service dependency.

## Persistence privileges and cleanup

Limiter records are ephemeral security-control data and are not tenant business/audit history.

The ordinary runtime database role may receive only the operations needed by the accepted limiter transaction. It must not receive unrestricted `DELETE`, `TRUNCATE`, schema ownership or DDL privileges on limiter persistence.

Current-window rows must not be erasable through ordinary application DML.

Expired rows are eligible for deletion after they can no longer affect a 15-minute window. Implementation must provide a bounded cleanup boundary owned by migration/maintenance authority or an equivalently constrained database function. Cleanup must be incapable of deleting current-window rows based on caller-selected timestamps/keys.

No limiter row is retained for analytics. Normal cleanup targets rows older than one hour. Temporary cleanup delay is acceptable because stale rows are ignored by enforcement after 15 minutes, but unbounded retention is not accepted.

## Concurrency and multi-instance behavior

The PostgreSQL transaction is the shared authority across API replicas.

Tests must prove:

- two API instances see the same limiter state;
- simultaneous staff-address attempts cannot exceed 30 accepted attempts in one active window;
- simultaneous staff identifier attempts cannot create more than five failure-capable reservations;
- simultaneous guest address failures cannot create more than 60 failure-capable reservations;
- simultaneous same-token guest requests cannot exceed 120 accepted requests;
- finalizing one reservation cannot alter another limiter key;
- threshold expiry uses database time, not process time;
- process restart does not reset active limits.

No process-local cache may be authoritative for allow/deny behavior.

## Telemetry

Anti-abuse telemetry is security telemetry, not tenant `AuditEvent`.

Allowed fields are bounded event type, limiter scope, allow/deny/unavailable outcome, request ID, server time and coarse internal error category.

Do not emit raw email, normalized email, raw/canonical client IP, raw guest bearer, HMAC limiter key, password, Authorization/Cookie headers, request body or database row identifiers into normal logs/metrics/traces.

Aggregated metrics may count allowed/limited/unavailable outcomes by endpoint/scope without identity values.

## Scope boundary

This decision does not add CAPTCHA, bot scoring, Redis, CDN/WAF policy, payment/handoff rate limiting, object-storage controls, MFA, signup/reset behavior, frontend integration or Phase 3 operations.

A reverse proxy/WAF may later enforce coarse connection/request limits in addition to this contract, but it must not weaken or replace the application-level staff-identifier and guest-token semantics.

Production database network/TLS/credential hardening remains the next separate production-readiness slice.

## Reason

PostgreSQL is the smallest already-selected shared mechanism that can enforce the required exact rolling windows atomically across replicas without introducing another production service. HMAC-derived keys minimize persisted identity data, reservation semantics close concurrency overshoot on failure-only limits, and the explicit proxy contract prevents caller-controlled forwarding headers from selecting limiter identities.

## Consequences

- VAL-004M implementation requires one new forward-only migration after migration 17 if this decision is accepted.
- Implementation may add focused anti-abuse service/transport code and PostgreSQL integration tests, but no Redis/WAF dependency.
- Staff login remains a production gate until the accepted limiter is implemented.
- Guest public access remains a production-readiness gate until its limiter behavior is implemented.
- Phase 2 is still not production-ready after this task alone; production DB/network/TLS hardening and remaining deployment controls require their own closure review.
- If pilot load later shows limiter database contention, a focused accepted decision may move the same behavioral contract to Redis or an edge/application hybrid without changing public error/security semantics.

## Affected docs/code

`docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`, `docs/08_DECISIONS_LOG.md`, `docs/11_REQUIREMENTS_TRACEABILITY.md`, `docs/12_AGENT_EXECUTION_PLAN.md`, `docs/14_PROJECT_STATUS.md`, future focused anti-abuse migration/runtime-role/service/controller/tests
