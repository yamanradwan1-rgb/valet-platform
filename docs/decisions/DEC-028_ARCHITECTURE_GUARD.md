# DEC-028 — Pre-Phase-3 Architecture Guard

Status: Accepted
Date: 2026-08-11

## Context

DEC-026 and DEC-027 corrected the API ownership model before Phase 3: shared runtime/database/HTTP/observability infrastructure moved under `apps/api/src/common/**`, and API feature composition was split into Auth, Anti-Abuse, Guest Access and Check-In modules.

Those boundaries are currently protected primarily by code review and focused tests. A later import can silently recreate the old coupling while still compiling and passing behavior tests. Phase 3 will add more feature modules, so the accepted dependency direction must become a deterministic repository gate before new operational code is introduced.

This decision adds architecture enforcement only. It does not change runtime behavior.

## Decision

Add a lightweight, repository-owned architecture guard with two layers:

1. ESLint `no-restricted-imports` rules for fast developer/editor feedback on obvious forbidden feature directions.
2. A root `architecture:check` command implemented with Node built-ins only that resolves repository-relative source imports and is the authoritative CI dependency-direction check.

Do not add an architecture framework or dependency.

## Enforced source boundaries

The checker applies to TypeScript/TSX source under `apps/api/src/**`.

### Common infrastructure

`apps/api/src/common/**` must not import any code under `apps/api/src/modules/**`.

Allowed direction is feature/domain code -> common, never common -> feature/domain modules.

### Anti-Abuse

`apps/api/src/modules/anti-abuse/**` is a low-level reusable security feature.

It must not import Auth, Guest Access or Check-In code.

It may depend on neutral common infrastructure and its existing external/package dependencies.

### Auth

`apps/api/src/modules/auth/**` may depend on Anti-Abuse and neutral common infrastructure.

It must not import Guest Access or Check-In.

### Guest Access

`apps/api/src/modules/guest-access/**` may depend on Auth, Anti-Abuse, neutral common infrastructure, and its existing lower-level guest/session domain commands.

It must not import Check-In.

### Check-In

`apps/api/src/modules/check-in-api/**` may depend on Auth, neutral common infrastructure, and its existing lower-level valet-session/vehicle domain commands.

It must not import Guest Access.

It must not take a direct dependency on Anti-Abuse unless a future Accepted decision explicitly changes the graph.

### Existing lower-level domain folders

Cleanup C does not redesign ownership of existing lower-level folders such as `modules/valet-sessions/**` or `modules/vehicles/**`.

The architecture guard must not invent new restrictions on those folders beyond preventing `common/**` from importing module code.

## Import resolution

The repository checker must inspect static TypeScript/JavaScript module edges sufficiently to prevent trivial bypasses through relative path spelling.

For relative imports/exports, normalize the importing file and target path before applying boundary rules.

The checker should cover normal static `import ... from`, side-effect imports, and `export ... from` forms used by the repository. If the implementation also recognizes `require()` or dynamic `import()` safely without adding dependencies, that is acceptable, but runtime module-loading redesign is not part of this task.

The guard must not depend on formatting style or a particular number of `../` path segments.

## Retired architecture symbols

Cleanup C must prevent reintroduction of the key retired composition ownership symbols:

- `CheckInApiModule`
- `CHECK_IN_POSTGRES_POOL`
- `GuestCheckInController`

The check is for architectural regression, not for historical documentation. Documentation/decision logs may mention retired names when describing history.

Do not broaden this into a generic banned-word system.

## App composition

The accepted API feature composition remains:

- `AuthModule`
- `AntiAbuseModule`
- `GuestAccessModule`
- `CheckInModule`

The existing feature-ownership regression test remains the primary executable proof of exact Nest module composition and one global filter/provider ownership. Cleanup C may strengthen that test mechanically if required, but the architecture script does not need to parse Nest decorator metadata itself.

## File-size policy

Large files are an advisory maintainability signal only.

The architecture checker may emit a warning for TypeScript/TSX source files above approximately 450 lines.

File size alone must never make `architecture:check` fail.

Do not add an arbitrary hard failure at 800 lines or any other line count.

## CLI and CI

Add a root package script:

```text
architecture:check
```

The command must return non-zero for architecture violations and zero when only advisory file-size warnings exist.

Add the architecture command to the existing GitHub Actions quality job so pull requests and pushes to `main` cannot pass CI with a forbidden dependency edge.

Keep the existing lint, typecheck, test and build gates.

## Testability

The checker must be deterministic and testable without mutating production source files.

Provide focused automated tests/fixtures proving at minimum:

- common -> module import fails;
- anti-abuse -> Auth fails;
- anti-abuse -> Guest Access fails;
- anti-abuse -> Check-In fails;
- Auth -> Guest Access fails;
- Auth -> Check-In fails;
- Guest Access -> Check-In fails;
- Check-In -> Guest Access fails;
- Check-In -> Anti-Abuse fails;
- allowed current edges pass;
- normalized relative paths cannot bypass the rule;
- retired architecture symbols are rejected in application source;
- an oversized source fixture produces only a warning and successful exit when no architecture violation exists.

Tests may exercise the checker through a temporary fixture root or an exported pure function, but must not require a new dependency.

## ESLint role

ESLint restrictions are a fast feedback layer, not the sole source of truth.

Use existing ESLint capabilities only. Do not install an import/dependency plugin.

Rules should align with the repository checker and avoid duplicating unrelated style policy.

## Behavior freeze

VAL-004Q must not change:

- routes or HTTP methods;
- request/response schemas;
- status/error codes or safe messages;
- authentication/authorization;
- staff access/refresh/cookie behavior;
- guest credential behavior;
- anti-abuse thresholds, scopes, ordering or proxy behavior;
- transaction or locking behavior;
- runtime PostgreSQL pool/lifecycle/TLS/privilege behavior;
- database schema, migrations or grants;
- audit/evidence/custody behavior;
- ValetSession state behavior;
- any Phase 3 product behavior.

## Dependency and database freeze

No dependency is added or removed.

`pnpm-lock.yaml` must remain unchanged.

The root `package.json` may change only to add the `architecture:check` script.

Exactly 18 existing migrations remain unchanged. Prisma schema remains unchanged.

## Documentation

Record DEC-028 canonically in `docs/08_DECISIONS_LOG.md` and update repository structure/execution/status docs as needed.

Cleanup A and Cleanup B are complete. Cleanup C is the final structural-cleanup slice, but its completion does not make Phase 2 production-ready.

Secure staff provisioning/admin onboarding and final Phase 2 security/integrity closure, including a fresh post-fix Standard Security Scan, remain separate gates before Phase 3.

## Consequences

- Future Phase 3 code receives immediate feedback when it tries to depend in the wrong direction.
- The accepted feature graph is protected by CI rather than convention alone.
- No new architecture toolchain dependency is introduced.
- File-size warnings encourage review without creating arbitrary CI failures.
- Runtime behavior remains unchanged.