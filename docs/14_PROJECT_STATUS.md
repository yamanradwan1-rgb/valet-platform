# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-09 00:05 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Remote `main`: `c8bd64586a6b9c33e50ff5a84a2303eb6ceff76d`
- Verification basis: GitHub main history, merged PR #20, CI run #27, Issue #19, and the user-reported local terminal state before PR #20 merged

## Current Milestone

**Phase 1 — Foundation: data, tenants, staff and audit-ready structure**

Phase 0 is complete. Phase 1 now has the tenant/staff, Customer/Vehicle, ParkingSpot/KeySlot, ValetSession and AuditEvent/Black Box persistence foundations merged with PostgreSQL integrity coverage.

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

## Current Task

No implementation task is currently active after VAL-003F merged.

Recommended next focused Phase 1 slice:

```text
RetrievalRequest database foundation
```

Create and scope the next Issue from current `main` before implementation. Do not start another migration task until ownership is explicit.

## Remaining Phase 1 Foundation Slices

The execution plan still calls for separately scoped persistence/foundation work for:

- RetrievalRequest
- HandoffVerification
- Payment foundation
- Incident
- Notification
- demo/seed data when its dedicated task is reached

Task/Dispatch, KeyCustodyEvent, ParkingZone/Maps/GPS and domain command/check-in implementation belong to later focused phases/tasks and should not be pulled into these persistence slices without an accepted scope change.

## Local / Remote Handoff State

At the last user-reported terminal state before PR #20 merged:

```text
LOCAL WORKING TREE: clean
LOCAL BRANCH: feat/VAL-003F-audit-event-db
LOCAL/REMOTE FEATURE COMMIT: cc721df
FEATURE BRANCH: pushed
PR #20: now merged remotely
REMOTE main: c8bd645
LOCAL main: not yet confirmed synced to c8bd645 after the merge
```

Therefore the first local action next session is to synchronize `main` before creating the next task branch.

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

- No active migration owner at this handoff; VAL-003F is merged.
- `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/**` remain CRITICAL/high-contention while Phase 1 database work continues.
- Keep one active migration owner at a time.
- No unresolved blocker was recorded at the end of VAL-003F.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

At the start of the next session:

```powershell
git checkout main
git pull --ff-only origin main
git status
git log -3 --oneline
```

Expected remote head:

```text
c8bd645 Merge pull request #20 from veletpro0-lgtm/feat/VAL-003F-audit-event-db
```

Then:

```text
verify GitHub current state
-> create/assign the next scoped Phase 1 Issue
-> create a branch from current main
-> keep one migration owner
-> provide the local coding agent a self-contained task packet
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
