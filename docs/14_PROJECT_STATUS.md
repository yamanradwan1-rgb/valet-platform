# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-09 02:00 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Remote `main`: `e0e3d2fc02138edc510657f82be68e3a883789ba`
- Verification basis: local `origin/main`/`main`, merged PR #25 at current main, and GitHub Issue #26

## Current Milestone

**Phase 1 — Foundation: data, tenants, staff and audit-ready structure**

Phase 0 is complete. Phase 1 now has the tenant/staff, Customer/Vehicle, ParkingSpot/KeySlot, ValetSession, AuditEvent/Black Box, RetrievalRequest and HandoffVerification persistence foundations merged with PostgreSQL integrity coverage. The sellable-MVP financial persistence contract is the active docs/decision task; no financial migration is active.

## Completed

### Phase 0 — Bootstrap

- PR #1 — `chore: bootstrap monorepo foundation`
- Status: **MERGED / COMPLETED**

### VAL-002A — Lock previous Phase 1 Database Contract

- Issue #2
- PR #3
- Status: **MERGED / COMPLETED**
- Note: historical where later Blueprint v1.0 decisions supersede it

### VAL-002R — Rebaseline Product Contracts to Founder Blueprint v1.0

- Issue #6
- PR #7
- Status: **MERGED / COMPLETED**

### VAL-002B — Tenant & Staff Database Foundation

- Issue #4
- PR #8
- Merge commit: `f26beb9`
- Status: **MERGED / COMPLETED**
- Result: Organization, Location, User, OrganizationMembership, MembershipLocationAccess and Shift foundation

### VAL-003A — Lock no-plate / unreadable Vehicle identity contract

- Issue #9
- PR #10
- Merge commit: `02b8465`
- Status: **MERGED / COMPLETED**
- Result: accepted DEC-020 plate-less Vehicle identity contract

### VAL-003B — Customer & Vehicle Database Foundation

- Issue #11
- PR #12
- Merge commit: `ddcdc1c`
- Status: **MERGED / COMPLETED**

### VAL-003C — Parking Spot & Key Slot Database Foundation

- Issue #13
- PR #14
- Merge commit: `e3cf4dc`
- Status: **MERGED / COMPLETED**

### VAL-003D — ValetSession Database Foundation

- Issue #15
- PR #16
- Merge commit: `3577320`
- Status: **MERGED / COMPLETED**
- Result: canonical nine-state ValetSession persistence, tenant/location-safe relations, version/completion checks and active-session uniqueness protections

### VAL-003E — Restore Required ValetSession Query Indexes

- Issue #17
- PR #18
- Merge commit: `3f76a23`
- Status: **MERGED / COMPLETED**
- Result: all three binding ValetSession query indexes restored through a forward-only migration

### VAL-003F — AuditEvent / Black Box Database Foundation

- Issue #19
- PR #20
- Branch: `feat/VAL-003F-audit-event-db`
- Source commit: `cc721df`
- Merge commit: `c8bd645`
- Status: **MERGED / COMPLETED**
- CI: **PASSED** — lint, typecheck, test and build
- Result: append-only AuditEvent persistence foundation, tenant/location-safe session and actor relations, required timeline index, 13 focused tests; database package reached 99 passing tests in the task validation

### VAL-003G — RetrievalRequest Database Foundation

- Issue #22
- PR #23
- Status: **MERGED / COMPLETED**
- Result: tenant-safe retrieval request persistence and one-active-request protection

### VAL-003H — HandoffVerification Database Foundation

- Issue #24
- PR #25
- Merge commit: `e0e3d2f`
- Status: **MERGED / COMPLETED**
- Result: tenant-safe pickup-code, Dynamic QR and supervisor-override verification persistence foundation

## Current Task

`VAL-003I — Lock Payments Persistence Contract`

- Issue #26
- Branch: `docs/VAL-003I-payments-persistence-contract`
- Baseline: `e0e3d2fc02138edc510657f82be68e3a883789ba`
- Status: **IN PROGRESS / LOCAL DOCS REVIEW**
- Scope: docs/decision only; lock Payment/Validation/Tip/Cash/ProviderEvent/Refund persistence before any financial migration
- Accepted direction in branch: DEC-021 payment-centric aggregate with normalized history facts
- Explicit prohibition: no Prisma, migration, integration-test or application implementation in VAL-003I

## Remaining Phase 1 Foundation Slices

The execution plan still calls for separately scoped persistence/foundation work for:

- Payment + Validation + tip foundation after VAL-003I is reviewed and merged
- CashEntry + provider-event/idempotency foundation
- Refund foundation
- Incident
- Notification
- demo/seed data when its dedicated task is reached

Task/Dispatch, KeyCustodyEvent, ParkingZone/Maps/GPS and domain command/check-in implementation belong to later focused phases/tasks and should not be pulled into these persistence slices without an accepted scope change.

## Local / Remote Handoff State

Current verified local state:

```text
LOCAL WORKING TREE: VAL-003I docs changes only / uncommitted
LOCAL BRANCH: docs/VAL-003I-payments-persistence-contract
BASELINE HEAD: e0e3d2fc02138edc510657f82be68e3a883789ba
REMOTE main: e0e3d2fc02138edc510657f82be68e3a883789ba
ISSUE #26: OPEN
VAL-003I COMMIT/PUSH/PR: NONE at task start
```

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

Audit/Black Box history is append-only by contract. Protected future domain mutations that require audit must commit the mutation and required AuditEvent atomically.

## Dependencies / Contention

- No active migration owner; VAL-003I is docs/decision only and leaves the migration slot unused.
- `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/**` remain CRITICAL/high-contention while Phase 1 database work continues.
- Keep one active migration owner at a time.
- Do not start Payment implementation until VAL-003I is reviewed and merged.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

Review the VAL-003I documentation diff against Issue #26 and DEC-021. After human approval, commit/push/open the docs PR through the normal workflow. Do not create the first Payment migration Issue/branch until this contract is merged into `main`.

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
