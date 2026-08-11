# DEC-026 — Shared API Infrastructure Ownership

Status: Accepted  
Date: 2026-08-11

## Context

Phase 2 started with one check-in-focused HTTP module, but subsequent slices placed several cross-cutting production boundaries under `modules/check-in-api`: the application runtime PostgreSQL provider/lifecycle, request-ID middleware/request shape, generic HTTP exception/filter behavior, and operation timing/observer primitives. Staff authentication, guest access and shared anti-abuse already consume those boundaries, and Phase 3 will add additional operational modules.

If these primitives remain owned and named by Check-In, later features must import a feature module merely to obtain infrastructure. That creates the wrong dependency direction and makes future module separation riskier.

This decision is structural only. It must not change any externally observable behavior or accepted security/domain contract.

## Decision

Before Phase 3, move already-shared API/runtime infrastructure to neutral application ownership. Do this in staged cleanup PRs so behavior remains reviewable.

The cleanup sequence is:

1. **Shared Runtime Infrastructure** — neutral database/HTTP/observability ownership; Check-In consumes it.
2. **Feature Ownership** — separate Staff Auth, Anti-Abuse, Guest Access and Check-In module ownership without changing routes/contracts.
3. **Architecture Guard** — enforce dependency direction with static checks; file-size checks are advisory only.

VAL-004O implements only step 1.

## Runtime database ownership

The production runtime PostgreSQL pool is application infrastructure, not a Check-In dependency.

Use one neutral provider token, canonically named `RUNTIME_POSTGRES_POOL` or an equivalently neutral repository-convention name. There must be exactly one ordinary application runtime pool instance.

A neutral runtime database module owns:

- creation through the existing `createRuntimePostgresPool` contract;
- production startup safety verification from DEC-025;
- application shutdown of the pool;
- exporting the runtime pool provider to feature modules.

The refactor must preserve DEC-025 exactly:

- production verified TLS;
- `MIGRATION_DATABASE_URL` compartmentalization;
- live `pg_stat_ssl` verification;
- runtime role safety/ownership/CREATE checks;
- fail-closed startup;
- local development plaintext capability.

No second pool, second lifecycle owner, fallback pool or feature-specific database connection may be introduced.

`CHECK_IN_POSTGRES_POOL` is retired once all consumers in this cleanup use the neutral runtime token. Feature code must not retain an alias that allows new code to continue treating the shared pool as Check-In-owned.

## HTTP request and request-ID ownership

The request shape needed for request IDs, raw headers and socket peer information is shared HTTP infrastructure.

Move it to a neutral HTTP boundary with a neutral name such as `ApiRequest`. Preserve the exact currently accepted request-ID contract:

- inbound `X-Request-Id` is used only when it matches the existing bounded ASCII-safe pattern;
- otherwise the server creates a UUID;
- the same resolved request ID is attached to the request and emitted as `X-Request-Id`;
- no new header names, formats or reflection behavior are introduced.

Request-ID middleware must remain applied to every existing protected Staff Auth, Staff Check-In and Guest route currently covered. Cleanup A may keep route registration in `CheckInApiModule` temporarily if moving controller ownership belongs to Cleanup B; infrastructure implementation itself must be neutral.

## HTTP error/filter ownership

HTTP exception creation and the global exception filter behavior already serve Staff Auth, Guest Access, Anti-Abuse and Check-In. Their infrastructure belongs under a neutral HTTP boundary.

Cleanup A may move the existing mapping implementation mechanically, but it must preserve every current externally observable mapping exactly, including:

- HTTP status;
- stable error code;
- safe message;
- request ID;
- `Retry-After` semantics;
- `Cache-Control: no-store` behavior where currently required;
- non-disclosure of SQL/stacks/credentials/internal details.

Do not redesign the error taxonomy in this cleanup. A neutral shared file may still contain feature-specific mappings temporarily; final feature ownership can be improved later without changing transport behavior.

The transport-validation error type may be renamed only if all behavior/tests remain identical and the new name is neutral. A compatibility alias is acceptable only inside this refactor if needed to keep the diff safe; it must not become a new architectural dependency.

## Operation timing and observer ownership

Monotonic timing and operation observation are cross-cutting infrastructure when they do not contain feature semantics.

Move the generic clock interface/provider and generic operation observer/measurement primitives to a neutral observability boundary. The no-op observer remains behaviorally identical.

The operation runner may move to shared infrastructure only if its error mapping and measurement behavior remain identical. If the runner still contains Check-In-specific measurement fields or semantics that cannot be neutralized mechanically without changing behavior, keep the runner feature-local in VAL-004O and move only the genuinely generic primitives. Do not invent a generic framework merely to complete the move.

Instrumentation failures must continue never to change the business response.

## Dependency direction

After VAL-004O, the intended direction is:

```text
feature modules
  -> common/runtime database
  -> common/http
  -> common/observability
```

Common/shared infrastructure must not import feature modules.

VAL-004O does not yet require final Staff Auth / Guest / Anti-Abuse / Check-In module separation; that is Cleanup B.

## Behavior freeze

VAL-004O must not change:

- routes or HTTP methods;
- request/response schemas;
- status/error codes or safe messages;
- staff access/refresh/refresh-cookie behavior;
- guest bearer transport/resolution behavior;
- anti-abuse thresholds, ordering, HMAC scopes, trusted proxy rules or `Retry-After` calculations;
- authorization/tenant/location/role behavior;
- transaction or locking behavior;
- PostgreSQL TLS/credential/privilege policy;
- database schema, migrations or grants;
- audit/evidence semantics;
- any Phase 3 state or domain behavior.

File moves, symbol renames and import rewiring are allowed only when regression coverage proves behavior is unchanged.

## Regression requirements

At minimum preserve and run:

- Staff Auth integration coverage;
- Anti-Abuse integration coverage;
- Guest/Check-In API integration coverage;
- production database safety integration coverage;
- request-ID tests;
- exception/filter tests including 429/503 headers;
- runtime pool lifecycle tests.

Add focused wiring tests where necessary to prove:

- only one runtime pool provider/lifecycle exists;
- features resolve the neutral runtime provider;
- production startup verification still runs before readiness;
- shutdown still closes the pool once;
- existing route middleware/filter coverage remains intact.

Exactly 18 migrations remain unchanged. No dependencies or lockfile changes are part of this decision.

## Consequences

Phase 3 feature modules can depend on neutral application infrastructure instead of importing Check-In solely for shared services. Check-In becomes a consumer rather than infrastructure owner, reducing coupling before parking/key/dispatch modules are introduced.

This cleanup does not itself make Phase 2 production-ready and does not replace the remaining secure staff provisioning/onboarding and final Phase 2 security/integrity closure gates.
