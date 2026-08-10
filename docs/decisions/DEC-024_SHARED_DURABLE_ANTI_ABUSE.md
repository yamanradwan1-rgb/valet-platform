# DEC-024 — Shared Durable Anti-Abuse Boundary

Status: Accepted  
Date: 2026-08-10

> Binding decision for VAL-004M. Before implementation changes are committed, this accepted decision must also be copied into `docs/08_DECISIONS_LOG.md` without semantic changes so the repository authority order remains intact.

## Context

Phase 2 now exposes two production-sensitive public boundaries that need shared anti-abuse protection:

- staff password login at `POST /v1/staff/auth/login`;
- guest bearer resolution at `GET /v1/guest/session`.

DEC-023 already requires no more than five failed staff credential attempts per normalized identifier in a rolling 15-minute window and no more than 30 staff login attempts per trusted client address in a rolling 15-minute window. Guest access separately requires externally usable rate limiting without persisting or logging raw bearer tokens.

Process-local counters are rejected because they reset on restart and diverge across API replicas. PostgreSQL is already mandatory shared infrastructure for the pilot and both protected request paths already depend on it.

## Options considered

- **Option A — PostgreSQL-backed exact rolling-window state.** Existing shared database, transactional serialization, short-lived limiter events/reservations.
- **Option B — Redis-backed limiter state.** Suitable at higher volume but adds a new production service, ACL/TLS/network and availability dependency.
- **Option C — managed edge/WAF rate limiting.** Useful for coarse network protection but cannot safely own normalized staff-identifier semantics by itself.
- **Option D — process-local memory.** Rejected because it is neither durable nor shared across replicas.

## Decision

Use **Option A: PostgreSQL-backed exact rolling-window anti-abuse state** for VAL-004M.

PostgreSQL is the shared authority across API replicas. The implementation uses exact rolling 15-minute windows, transaction-level advisory serialization per limiter key, indexed short-lived limiter rows, and database-authoritative time. Redis/WAF/process-memory limiter dependencies are not introduced by this task.

If measured pilot load later proves material limiter contention, a later accepted decision may move the same public behavior to Redis or an edge/application hybrid.

## Secret and limiter-key contract

Production configuration uses:

```text
ANTI_ABUSE_HMAC_SECRET_B64URL
```

It is exactly one unpadded base64url value encoding **32 random bytes**: 43 characters from `[A-Za-z0-9_-]`.

The secret:

- is separate from staff/guest credentials and database credentials;
- is identical on every API replica;
- is never committed or logged;
- causes protected production endpoints to fail closed if absent or malformed;
- is not rotated ad hoc because changing it would split/reset active windows.

Limiter identities are HMAC-SHA-256 values. Inputs use unambiguous binary domain separation:

```text
HMAC-SHA-256(secret, UTF8(scope) || 0x00 || UTF8(value))
```

Scopes are exactly:

```text
v1:staff-login-identifier
v1:staff-client-address
v1:guest-client-address
v1:guest-token
```

Persisted key format:

```text
anti-abuse-hmac-sha256:v1:<64 lowercase hex characters>
```

Raw/normalized email, raw/canonical client IP, raw guest bearer, password, `Authorization`, `Cookie`, request bodies and auth verifier hashes are never persisted in limiter rows or emitted in normal logs, traces, metrics or `AuditEvent`.

Staff identifier keying reuses the exact DEC-023 email normalization; no second canonicalization rule is allowed.

Guest-token limiter keying uses the exact shape-valid raw guest bearer and is intentionally independent from the guest authentication SHA-256 verifier stored on `ValetSession`.

## Trusted client-address contract

Production configuration uses:

```text
ANTI_ABUSE_TRUSTED_PROXY_CIDRS
```

as a comma-separated list of explicit IPv4/IPv6 CIDRs. Empty means direct-client mode.

The socket peer address is authoritative unless the immediate peer is inside a configured trusted-proxy CIDR.

- Untrusted peers: ignore `X-Forwarded-For`, `Forwarded`, `X-Real-IP` and similar headers.
- Trusted peers: only `X-Forwarded-For` may contribute to the limiter client address.
- The trusted proxy/load balancer must overwrite or safely append the forwarding chain according to deployment configuration.
- Multiple ambiguous raw `X-Forwarded-For` header fields or malformed IP/CIDR data fail closed for protected endpoints.
- Walk the forwarding chain from right to left with the direct peer, discard trusted-proxy hops, and select the first untrusted hop.
- Do not trust a fixed hop count by itself.
- IPv4-mapped IPv6 is normalized to canonical IPv4; IPv6 uses one canonical textual form before HMAC keying.
- Malformed configured CIDRs fail production startup closed.

Production networking must prevent direct untrusted access to a proxy-only internal API listener when proxy mode is enabled.

## Persistence model

VAL-004M adds one new forward-only migration after migration 17.

Use one ephemeral anti-abuse table with the smallest fields needed for enforcement, conceptually:

- server-generated row ID;
- limiter `scope`;
- versioned HMAC `key_hash`;
- server-authoritative `occurred_at`;
- state: `PENDING`, `COUNTED`, or `IGNORED`.

Index `(scope, key_hash, occurred_at)` for current-window lookup.

`PENDING` and `COUNTED` consume quota for failure-only scopes. `IGNORED` does not. Count-all scopes insert directly as `COUNTED`.

Current-window rows are not tenant business history and are never written to `AuditEvent`.

## Advisory serialization

For each logical limiter key, check/reserve/record behavior runs in one PostgreSQL transaction and obtains a transaction-level advisory lock before counting/inserting.

The advisory-lock ID is deterministically derived from the limiter HMAC output as two signed 32-bit halves from its first eight bytes and acquired with the transaction-scoped advisory-lock form. The full versioned HMAC key remains authoritative for row lookup/counting.

A rare 64-bit advisory-lock collision may only over-serialize unrelated keys; it must never merge counters because SQL filtering still uses the full limiter key.

The limiter transaction uses a bounded local lock timeout of **2 seconds**. Failure to acquire/complete authoritative limiter state within that boundary follows the fail-closed unavailable contract rather than waiting without bound or falling back to memory.

Database server time is authoritative. Client/process clocks do not decide windows, expiry or `Retry-After`.

A request rejected because the relevant threshold is already exhausted does not append another counted event, so repeated 429s do not extend the window.

## Staff login — trusted client-address limit

For a syntactically valid staff-login request that passed the existing strict JSON/Origin transport checks, evaluate the address limiter before Argon2 work.

```text
30 login attempts per trusted client address
within the immediately preceding 15 minutes
```

The first 30 may proceed. While 30 counted address events remain in-window, the next request is 429.

Every allowed syntactically valid login attempt consumes this address quota regardless of later result: success, unknown email, wrong password, disabled User or unsupported/malformed stored hash.

Malformed JSON/body/schema and existing Origin failures retain their current 400/403 semantics and do not create staff limiter rows. Coarse malformed-request/DDoS protection remains a reverse-proxy/edge concern.

## Staff login — normalized identifier failure limit

For a syntactically valid normalized email, evaluate before Argon2:

```text
5 failed credential attempts per normalized identifier
within the immediately preceding 15 minutes
```

Unknown email, wrong password, disabled User and unsupported/malformed stored hash are identical counted failures.

Before password verification, reserve one slot as `PENDING` while holding the identifier limiter transaction/lock. Existing `PENDING` + `COUNTED` rows consume the five slots, so concurrent attempts cannot overshoot the threshold.

Outcome handling:

- credential failure -> finalize reservation to `COUNTED` before returning 401;
- successful session issuance -> finalize to `IGNORED` in the **same database transaction that commits successful staff-session issuance**;
- inconclusive/unexpected failure -> leave/finalize a fail-safe counted state until it ages out;
- if failure finalization cannot be made authoritative -> return the shared 503 unavailable response, not a possibly misleading 401.

A successful login does not erase earlier failures. A correct password presented while five still-counted failures exist receives the same staff 429 without password verification.

Known and unknown identifiers use identical reservation, keying and 429 behavior.

## Guest access — trusted client-address failure limit

For `GET /v1/guest/session`:

```text
60 failed guest-authentication attempts per trusted client address
within the immediately preceding 15 minutes
```

Reserve the address slot as `PENDING` before guest authentication.

Missing bearer, malformed/duplicate bearer, random/unknown bearer, expired bearer and revoked/rotated-old bearer finalize to `COUNTED`.

A successful guest resolution finalizes to `IGNORED` and does not permanently consume the address-failure quota.

Guest success resolution and address-reservation finalization must commit through one authoritative database transaction before guest data is returned. If that transaction cannot complete, return 503 and no guest data.

## Guest access — token request limit

For shape-valid guest bearers:

```text
180 requests per derived guest-token key
within the immediately preceding 15 minutes
```

Every shape-valid bearer presentation consumes the token-key quota before validity is disclosed, whether valid, unknown, expired, revoked or rotated-old. This permits ordinary status polling while bounding repeated use of one credential.

Requests without a shape-valid bearer do not create token-key rows but remain subject to the guest address-failure reservation.

Workflow order is:

1. reserve guest address failure slot;
2. if bearer is shape-valid, check/record token-key quota;
3. if token-key quota is already exhausted, finalize the address reservation to `IGNORED` and return token 429;
4. otherwise perform guest authentication and finalize the address reservation according to success/failure.

A rotating-random-token attacker therefore remains bounded by the address-failure threshold, while normal valid guests behind one NAT are not permanently charged against the address-failure quota.

## 429 contract

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

Responses include the normal bounded `X-Request-Id`, `Cache-Control: no-store`, and:

```text
Retry-After: <integer delta-seconds>
```

The database computes the delta from the earliest currently counted/reserved row whose expiry keeps the blocking scope exhausted. Clamp to `1..900` seconds.

If multiple applicable scopes are already exhausted, return a conservative `Retry-After` equal to the greatest remaining blocking duration so a client is not told to retry before another known blocker expires.

429 never exposes account existence, token validity, counter values, which scope fired, limiter keys, identifiers, addresses or database details.

Below threshold, existing 400/401/403 semantics remain unchanged.

## Limiter-unavailable contract

Both protected endpoints fail closed when authoritative limiter state cannot be derived, locked, written or finalized.

Return:

```text
HTTP 503
code: ANTI_ABUSE_UNAVAILABLE
message: Service temporarily unavailable.
```

with the normal bounded `X-Request-Id` and `Cache-Control: no-store`.

On staff login 503:

- do not perform password verification when the limiter failed before auth;
- do not issue/return a staff session unless limiter success-finalization commits atomically with session issuance.

On guest 503:

- do not return guest session data.

Never fall back to unlimited access, process-local counters or caller-supplied identity.

## Runtime privileges and cleanup

The ordinary runtime DB role receives only the specific `SELECT`/`INSERT`/`UPDATE` privileges required by limiter enforcement. It receives no unrestricted `DELETE`, `TRUNCATE`, schema ownership or DDL privileges on limiter persistence.

Expired rows are ignored by enforcement after 15 minutes. Normal cleanup targets rows older than one hour.

Cleanup must use a fixed, parameterless maintenance boundary owned by migration/maintenance authority (or equivalently constrained database function) whose cutoff is server-authored and cannot delete current-window rows based on caller-selected keys/timestamps. If runtime is allowed to invoke such a function, only `EXECUTE` on that fixed function is granted; direct table `DELETE` remains denied.

Cleanup delay does not change enforcement correctness, but unbounded retention is not accepted.

## Concurrency / multi-instance acceptance

Tests must prove with shared PostgreSQL state that:

- two API instances observe one limiter state;
- simultaneous staff-address requests cannot exceed 30 accepted attempts;
- simultaneous staff-identifier requests cannot create more than five failure-capable reservations;
- simultaneous guest address failures cannot create more than 60 failure-capable reservations;
- simultaneous same-token guest requests cannot exceed 180 accepted requests;
- process restart does not reset limits;
- database time controls expiry;
- reservation finalization cannot affect another scope/key;
- advisory-lock timeout/outage fails closed;
- known/unknown staff identifiers remain non-enumerating;
- raw email/IP/token/password/header material is absent from limiter persistence/log/audit.

No process-local cache is authoritative for allow/deny behavior.

## Telemetry

Anti-abuse telemetry is security telemetry, not tenant `AuditEvent`.

Allowed fields: bounded event type, limiter scope, allow/deny/unavailable outcome, request ID, server time and coarse internal error category.

Do not emit raw/normalized email, raw/canonical IP, raw guest bearer, HMAC limiter key, password, `Authorization`, `Cookie`, request body or limiter row IDs into normal logs/metrics/traces.

Aggregated identity-free counts by endpoint/scope/outcome are allowed.

## Scope boundary

VAL-004M does not add CAPTCHA, bot scoring, Redis, CDN/WAF policy, payment/handoff rate limits, object-storage controls, MFA, signup/reset behavior, frontend integration or Phase 3 operations.

A future reverse proxy/WAF may add coarse request/connection protection but must not replace or weaken these application-level staff-identifier and guest-token semantics.

Production database network/TLS/credential hardening remains the next separate production-readiness slice.

## Reason

PostgreSQL is the smallest already-selected shared mechanism that can enforce exact rolling windows atomically across replicas without another production service. HMAC-derived keys minimize persisted identity data, reservations prevent concurrent overshoot on failure-only limits, bounded transaction-level advisory locking prevents unbounded same-key waits, and explicit proxy rules prevent caller-controlled forwarding headers from selecting limiter identities.

## Consequences

- VAL-004M adds exactly one new forward-only migration after migration 17 if implementation matches this decision.
- No Redis/WAF/rate-limit package dependency is required by the accepted architecture.
- Staff login and public guest access remain production-readiness gates until this limiter is implemented and verified.
- Phase 2 is still not production-ready after VAL-004M alone; production DB/network/TLS hardening and remaining deployment controls require their own closure review.
- Before implementation commit/PR, this accepted decision must be copied into `docs/08_DECISIONS_LOG.md` without semantic changes.

## Affected docs/code

`docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`, `docs/08_DECISIONS_LOG.md`, `docs/11_REQUIREMENTS_TRACEABILITY.md`, `docs/12_AGENT_EXECUTION_PLAN.md`, `docs/14_PROJECT_STATUS.md`, `.env.example`, future focused anti-abuse migration/runtime-role/service/controller/tests
