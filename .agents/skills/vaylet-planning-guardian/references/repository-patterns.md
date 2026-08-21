# Repository patterns — navigation aid, not authority (v1.1)

These patterns are known navigation hints. Verify current files before relying on them because the repository evolves.

## Staff API routing

Inspect current controllers before proposing routes.

Known examples use `v1/staff/...` route families. Do not assume a global `/api` prefix exists.

## Shared public contracts

Inspect:

- `packages/contracts/src/`
- `packages/contracts/src/index.ts`

Existing API controllers commonly consume schemas/types through `@valet/contracts`.

Before proposing module-local transport DTOs, verify whether the contract should be shared with future UI clients.

## Authentication/principal resolution

Inspect:

- `apps/api/src/modules/auth/staff-principal.ts`
- current staff controllers

Do not reimplement bearer parsing/principal semantics casually.

## Staff custody authorization

Inspect:

- `apps/api/src/modules/staff/custody-staff-authorizer.ts`

Known authorization decomposition includes active user, active membership, organization/location status, explicit LocationAccess, role allowlist, and persisted resource scope.

Do not assume a new Shift eligibility boundary can simply reuse this helper until you verify whether the helper's resource-scope and role semantics match the accepted Shift contract.

## API error mapping

Inspect:

- `apps/api/src/common/http/api-errors.ts`
- `apps/api/src/common/http/api-exception.filter.ts`
- `packages/contracts/src/api-errors.ts`

Do not invent HTTP mappings without verifying the shared pattern.

## Operational command pattern

Inspect comparable explicit command executors under modules such as:

- `apps/api/src/modules/valet-sessions/`
- `apps/api/src/modules/vehicles/`

Existing patterns commonly put protected state changes inside explicit transaction-aware command executors rather than creating a generic repository layer by default.

## Audit writing — verify both schema and writer

Inspect:

- `packages/database/prisma/schema.prisma` for `AuditEvent`;
- `apps/api/src/modules/audit/custody-audit-event-writer.ts`;
- callers of that writer.

At the time this skill was authored, the database permits nullable `valet_session_id`, but the custody writer is intentionally narrower: its persisted scope requires a ValetSession id and its entity contract is limited to custody entities such as ValetSession/Vehicle. **Verify current code before relying on this note.**

Therefore, never infer that Shift audit events can use the custody writer merely because the database column is nullable. If current code remains narrow, report an abstraction gap and let the Accepted Decision determine whether a dedicated/generalized writer is appropriate.

## Runtime database access

Inspect:

- `apps/api/src/common/database/`
- current modules using `RUNTIME_POSTGRES_POOL`

Do not introduce an ORM path in API code merely for convenience if the established protected-command path uses transaction-safe SQL.

## Shift persistence

Inspect both:

- `packages/database/prisma/schema.prisma`
- the original migration that created `shifts`

Important DB constraints may exist only in SQL. For example, Prisma may not represent a partial unique index.

A DB constraint protecting one active Shift per membership proves an integrity boundary. It does **not** by itself define whether a repeated Start Shift request returns conflict, the existing Shift, or another accepted result.

## Downstream operational boundaries

When `docs/18_PHASE3_OPERATIONS_EXECUTION_PLAN.md` says a slice provides a boundary consumed by a later Task/Dispatch slice, inspect how reusable internal command/query primitives are structured elsewhere. Do not make future server-side assignment code depend on invoking the server's own HTTP route unless explicitly accepted.

## 300-line architecture

Read `docs/17_AGENT_CODE_STRUCTURE_RULES.md` and run the repository architecture gate. Existing oversized files may be grandfathered; new authored code must remain modular.
