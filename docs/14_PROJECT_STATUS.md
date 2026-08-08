# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-08 21:03 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Verification basis: local `main`/`origin/main` refs and merge history through PR #8

## Current Milestone

**Phase 1 — Foundation: data, tenants, staff and audit-ready structure**

Phase 0 bootstrap is complete. The Founder & Product Blueprint v1.0 product-contract rebaseline and the Tenant & Staff database foundation are merged. The remaining no-plate Vehicle identity ambiguity is being closed before Customer + Vehicle persistence is implemented.

## Completed

### Phase 0 — Bootstrap

- PR #1 — `chore: bootstrap monorepo foundation`
- Status: **MERGED / COMPLETED**

### VAL-002A — Lock previous Phase 1 Database Contract

- Issue #2
- PR #3 — `docs: lock Phase 1 database contract`
- Status: **MERGED / COMPLETED**
- Note: retained as historical context where later Blueprint decisions supersede it

### VAL-002R — Rebaseline Product Contracts to Founder Blueprint v1.0

- Issue #6
- PR #7
- Branch: `docs/VAL-002R-blueprint-v1-rebaseline`
- Status: **MERGED / COMPLETED**
- Result: Blueprint v1.0 authority, scope, roles, lifecycle, Configuration First and implementation bridge are reflected in binding repository docs

### VAL-002B — Tenant & Staff Database Foundation

- Issue #4
- PR #8
- Branch: `feat/VAL-002B-tenant-staff-db`
- Status: **MERGED / COMPLETED**
- Merge commit on `main`: `f26beb9`
- Result: Organization, Location, User, OrganizationMembership, MembershipLocationAccess and Shift foundation with tenant constraints, migrations and PostgreSQL integration coverage

## Current Task

### VAL-003A — Lock no-plate / unreadable Vehicle identity contract

- Branch: `docs/VAL-003A-vehicle-identity-fallback`
- Status: **IN PROGRESS — DOCS/DECISION ONLY**
- Application/Prisma/migration changes: **none**
- Objective: lock the smallest safe MVP persistence contract for a Vehicle whose plate is absent, unreadable or not yet confidently established

Decision direction under this task:

- Vehicle remains the stable Organization-scoped identity even when plate identity is unknown
- grouped plate fields are all known or all absent
- a required temporary/manual descriptor supports operational recognition while absent
- unidentified Vehicles remain distinct by UUID
- tenant-scoped plate uniqueness applies only when normalized plate identity exists
- later identification/correction is explicit and audited
- automatic merge/deduplication remains deferred

## Current Product / Domain Baseline

Canonical ValetSession physical lifecycle:

```text
CHECKING_IN
-> AWAITING_PARKING
-> PARKING
-> PARKED
-> REQUESTED
-> RETRIEVING
-> READY
-> HANDOFF_PENDING
-> COMPLETED
```

Canonical Hybrid Dispatch Task lifecycle:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

Current tenant membership roles:

```text
ORG_ADMIN
LOCATION_MANAGER
VALET_SUPERVISOR
VALET_EMPLOYEE
```

## Dependencies / Contention

- VAL-003A changes high-contention binding database/domain/decision documents and should remain single-owner until reviewed/merged.
- No Prisma or migration work belongs in VAL-003A.
- The Customer + Vehicle database task depends on the accepted VAL-003A contract and should start from updated `main` after the documentation decision is merged.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate decisions/tasks.

## Exact Next Step

For `VAL-003A`:

```text
review Option A contract against Blueprint + tenant/custody rules
-> documentation checks
-> commit/push by the human owner when approved
-> PR + CI + cross-review
-> human merge decision
```

Next implementation after this decision merges:

```text
Customer + Vehicle database foundation
-> new Prisma schema slice and migration
-> tenant/identity constraint tests
-> fresh PostgreSQL migration verification
-> pnpm lint
-> pnpm typecheck
-> pnpm test
-> pnpm build
```

## Parallel UX/UI Track

UX/UI design may proceed in parallel only where it does not redefine active high-contention domain/database contracts. Frontend implementation should remain feature-by-feature with the corresponding backend/domain capability.

## Status Vocabulary

```text
LOCAL CHANGES ONLY
STASHED LOCALLY
COMMITTED LOCALLY
PUSHED / NO PR
PR OPEN / CI PENDING
PR OPEN / CHANGES REQUIRED
PR READY FOR MERGE
MERGED
BLOCKED
READY FOR LOCAL IMPLEMENTATION
```

Never call a task merged/completed merely because local edits or validation pass.
