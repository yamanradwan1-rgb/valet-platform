# DEC-027 — Feature Module Ownership Before Phase 3

Status: Accepted  
Date: 2026-08-11

## Context

VAL-004O / DEC-026 moved the runtime PostgreSQL pool, request transport/request ID, generic HTTP error/filter behavior, and generic observability primitives out of Check-In ownership. The remaining API composition is still feature-coupled: `CheckInApiModule` registers Staff Auth, Anti-Abuse, Guest Access and Staff Check-In providers/controllers; Staff Auth depends on the Check-In-named operation runner; Staff principal wiring lives under Check-In; and guest issue/revoke/read application behavior still lives in `CheckInApiService` / `GuestCheckInController`.

Phase 3 will add parking/key/dispatch modules. Those modules must not depend on Check-In merely to reach authentication, anti-abuse, guest access, or shared HTTP execution boundaries.

This decision is structural only. It must preserve every accepted Phase 2 product/security/transport behavior.

## Decision

Complete Cleanup B by separating API feature ownership into four feature modules composed directly by `AppModule`:

- `AuthModule`
- `AntiAbuseModule`
- `GuestAccessModule`
- `CheckInModule`

Shared runtime database, HTTP and observability infrastructure remain under `apps/api/src/common/**` as accepted by DEC-026.

No feature module may become a replacement god-module.

## Dependency direction

The intended feature dependency graph is acyclic:

```text
AppModule
  -> AuthModule
  -> AntiAbuseModule
  -> GuestAccessModule
  -> CheckInModule

AuthModule
  -> AntiAbuseModule
  -> RuntimeDatabaseModule
  -> HttpInfrastructureModule

GuestAccessModule
  -> AuthModule        (staff-principal boundary only)
  -> AntiAbuseModule
  -> RuntimeDatabaseModule
  -> HttpInfrastructureModule

CheckInModule
  -> AuthModule        (staff-principal boundary only)
  -> RuntimeDatabaseModule
  -> HttpInfrastructureModule

AntiAbuseModule
  -> RuntimeDatabaseModule
```

Common infrastructure must never import a feature module. `AuthModule` and `AntiAbuseModule` must not import Guest Access or Check-In. Guest Access and Check-In must not import each other merely for convenience.

## Auth ownership

`AuthModule` owns:

- `StaffAuthController`;
- `StaffAuthService`;
- `StaffAuthOriginPolicy`;
- `Argon2StaffPasswordVerifier` and `STAFF_PASSWORD_VERIFIER` wiring;
- `DatabaseStaffPrincipalResolver`;
- the `STAFF_PRINCIPAL_RESOLVER` token and `StaffPrincipal` / `StaffPrincipalResolver` boundary.

Move the staff-principal boundary out of `check-in-api.boundaries.ts` into Auth ownership. `AuthModule` exports only the principal-resolution boundary/providers needed by Staff Check-In and staff-facing Guest Access.

Authentication token formats, refresh rotation/replay handling, cookie behavior, origin behavior, disabled-user checks and DEC-023 semantics do not change.

## Anti-Abuse ownership

`AntiAbuseModule` owns:

- `AntiAbuseService`;
- `AntiAbuseKeyDeriver`;
- `TrustedClientAddressResolver`;
- the existing anti-abuse errors/contracts required by consumers.

It imports the neutral runtime database module and exports only the anti-abuse services needed by Auth and Guest Access.

DEC-024 behavior is frozen: exact rolling-window semantics, HMAC scopes, thresholds, transaction/advisory-lock behavior, trusted-proxy/X-Forwarded-For handling, fail-closed behavior, `Retry-After`, and durable PostgreSQL storage remain unchanged.

## Guest Access ownership

`GuestAccessModule` owns all guest-access API/application behavior that is currently embedded under Check-In ownership.

Move out of `CheckInApiService` / `GuestCheckInController`:

- guest access issue;
- guest access revoke;
- guest token resolution;
- transactional guest resolution used with Anti-Abuse;
- guest-safe session read.

Use a dedicated `GuestAccessService` (or equivalently clear feature-local name).

Use feature-owned controllers. A practical split is:

- a staff-facing guest-access controller for issue/revoke;
- a guest-facing controller for `GET /v1/guest/session`.

Controller class/file names may change internally, but routes may not.

The exact existing routes remain:

- `POST /v1/staff/check-in/sessions/:sessionId/guest-access/issue`
- `POST /v1/staff/check-in/sessions/:sessionId/guest-access/revoke`
- `GET /v1/guest/session`

Guest bearer validation, duplicate Authorization-header rejection, anti-abuse reservation/finalization ordering, token rotation/revocation semantics, response schemas and safe errors remain unchanged.

`CheckInApiService` must no longer expose guest issue/revoke/resolve methods after this cleanup.

## Check-In ownership

`CheckInModule` owns only Staff Check-In behavior:

- intake;
- vehicle identity;
- condition notes/corrections/photos/completion;
- completion of Check-In;
- Check-In-specific KPI/measurement enrichment such as `checkInElapsedMs`.

It owns `StaffCheckInController`, `CheckInApiService`, and any thin Check-In-specific operation-runner wrapper needed for KPI enrichment.

Guest Access methods/controllers and Auth/Anti-Abuse providers must not remain registered by `CheckInModule`.

The legacy `CheckInApiModule` name should be retired in favor of `CheckInModule` once all composition is separated.

## Neutral operation runner

Staff Auth and Guest Access must not depend on a Check-In-named operation runner.

Create a narrow neutral `ApiOperationRunner` under common HTTP/operation infrastructure. It preserves the existing operation execution behavior exactly:

- obtains the existing request ID/fallback;
- runs the action;
- maps failures through the existing `mapApiError` + `apiHttpException` behavior;
- sets the neutral `operationMeasured` marker at the same point;
- emits one operation measurement through the existing shared clock/observer;
- swallows observer/instrumentation failures so they never alter the business response.

To preserve Check-In's feature-local `checkInElapsedMs` without polluting shared `ApiRequest`, the neutral runner may accept one narrow optional measurement-decorator/enricher callback. The callback may add feature-local measurement fields to the emitted object but may not alter core duration/error/outcome/operation/request-id semantics.

`CheckInOperationRunner` may remain as a thin feature-local wrapper over `ApiOperationRunner` whose only extra responsibility is adding `checkInElapsedMs` when available. Auth and Guest Access use `ApiOperationRunner` directly.

Do not create a plugin/event/telemetry framework beyond this single behavior-preserving hook.

## Request-ID middleware ownership

After module separation, request-ID middleware coverage must no longer be owned centrally by Check-In.

Each controller-owning feature module applies the existing shared `RequestIdMiddleware` exactly once to its own controllers:

- `AuthModule` -> `StaffAuthController`;
- `GuestAccessModule` -> its staff-facing and guest-facing controllers;
- `CheckInModule` -> `StaffCheckInController`.

Do not broaden middleware coverage to unrelated routes and do not double-apply it.

The global `ApiExceptionFilter` remains shared infrastructure and must be registered globally exactly once through the existing `HttpInfrastructureModule` ownership.

## App composition

`AppModule` directly composes the feature modules instead of importing one Check-In composition module that owns all features.

`AppController` behavior remains unchanged.

Shared modules may be imported by multiple feature modules through normal Nest module composition, but regression tests must prove this does not create duplicate runtime pool instances, lifecycle owners, global filter registrations, or middleware execution.

## File organization

Internal file moves/renames are allowed when they clarify ownership. Prefer existing repository conventions and avoid cosmetic churn unrelated to ownership.

Do not create a module per class. The four feature modules above are the accepted boundary for Cleanup B.

## Behavior freeze

VAL-004P must not change:

- any route or HTTP method;
- request/response schema or response body;
- public error code, status or safe message;
- request-ID semantics;
- `Retry-After`, `Cache-Control` or auth `Pragma` behavior;
- staff access/refresh token or refresh-cookie behavior;
- guest bearer/token behavior;
- authentication/authorization, tenant, Location or role checks;
- anti-abuse thresholds, scopes, HMAC derivation, ordering, trusted-proxy behavior or transaction semantics;
- PostgreSQL runtime TLS/credential/privilege/startup safety behavior;
- database schema, migrations or grants;
- audit/evidence/custody behavior;
- ValetSession state behavior;
- any Phase 3 behavior.

## Regression requirements

At minimum prove:

- all current Staff Auth integration behavior remains green;
- staff principal resolution still uses the same DB/auth contract;
- all current Guest Access issue/revoke/read behavior remains green;
- Anti-Abuse 429/503, reservation/finalization and trusted-address behavior remain green;
- Staff Check-In routes and `checkInElapsedMs` observation remain green;
- request-ID middleware runs once on every previously covered route;
- the global exception filter remains one effective registration;
- only one runtime PostgreSQL pool/lifecycle exists;
- the four feature modules resolve without circular dependencies;
- common code imports no feature code;
- `CheckInModule` no longer registers Auth/Anti-Abuse/Guest controllers/providers;
- `CheckInApiService` contains no Guest Access methods;
- exactly 18 migrations remain unchanged;
- no dependency/package-lock changes are introduced.

## Consequences

Phase 3 modules can depend on explicit authentication/common infrastructure without importing Check-In as an application composition root. Guest Access becomes a real feature boundary, Anti-Abuse remains a low-level reusable security boundary, and Check-In becomes limited to its custody-entry workflow.

Cleanup C (architecture dependency guard) remains required after this change. Secure staff provisioning/onboarding and the final Phase 2 security/integrity closure, including a fresh post-fix Standard Security Scan, remain separate gates. This decision does not declare Phase 2 production-ready and does not start Phase 3.
