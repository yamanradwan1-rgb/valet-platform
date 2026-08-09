# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-09 03:45 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Remote `main`: `b463c87f0ee6733f5a5d99c3d35d16c33ba4bd8b`
- Local user-reported `main`: clean and synced to `b463c87`
- Verification basis: merged PR #27 / VAL-003I, Issue #29, Issue #28, and current GitHub branch state

## Current Milestone

**Phase 1 — Foundation: data, tenants, staff and audit-ready structure**

Phase 0 is complete. Phase 1 has tenant/staff, Customer/Vehicle, ParkingSpot/KeySlot, ValetSession, AuditEvent/Black Box, RetrievalRequest and HandoffVerification persistence foundations merged with PostgreSQL integrity coverage. The DEC-021 financial architecture is accepted. A bounded docs-only clarification is active before the first financial migration slice begins.

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
- Source commit: `cc721df`
- Merge commit: `c8bd645`
- Status: **MERGED / COMPLETED**
- Result: append-only AuditEvent persistence foundation, tenant/location-safe session and actor relations, required timeline index and focused PostgreSQL coverage

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

### VAL-003I — Lock Payments Persistence Contract

- Issue #26
- PR #27
- Merge commit: `b463c87`
- Status: **MERGED / COMPLETED**
- Result: accepted DEC-021 payment-centric MVP financial persistence contract with Payment, Validation history, tip-on-Payment, CashEntry history, provider-event callback deduplication and separate Refund history

## Current Task

`VAL-003I-A — Clarify Financial Persistence Edge Contracts`

- Issue #29
- Branch: `docs/VAL-003I-A-financial-edge-contracts`
- Baseline: `b463c87f0ee6733f5a5d99c3d35d16c33ba4bd8b`
- Status: **DOCS CHANGES IN PROGRESS / NO PR YET**
- Scope: docs-only clarification of DEC-021 edge semantics after independent product review
- Required clarifications: zero/positive due transitions, narrowly guarded pre-collection payer correction, currency minor-unit precision rule, provider outbound retry/stale-reference responsibility, exact Refund row-state matrix, and Phase 1 vs Phase 6 ownership
- Entity model remains unchanged; no PaymentAttempt, ledger, settlement or provider-specific persistence is being added

## Next Implementation Task

`VAL-003J — Payment + Validation + Tip Database Foundation`

- Issue #28
- Intended branch: `feat/VAL-003J-payment-validation-tip-db`
- Status: **BLOCKED ON VAL-003I-A DOCS MERGE**
- Migration slot must not be used until Issue #29 is merged
- A remote branch with this name was created earlier from `b463c87`; after the docs clarification merges, start/rebase the implementation from the new `main` rather than coding against the stale baseline

## Remaining Phase 1 Foundation Slices

Financial persistence order is explicitly Phase 1 foundation:

1. Payment + Validation + tip
2. CashEntry + provider-event/idempotency
3. Refund

Then remaining separately scoped Phase 1 foundation work includes:

- Incident
- Notification
- demo/seed data when its dedicated task is reached

Phase 6 consumes the Phase 1 financial persistence foundation for domain commands, provider integration, operational payment/refund workflows and related user-facing behavior. It does not own the foundational financial migrations.

Task/Dispatch, KeyCustodyEvent, ParkingZone/Maps/GPS and domain command/check-in implementation belong to later focused phases/tasks and should not be pulled into these persistence slices without an accepted scope change.

## Local / Remote Handoff State

Latest user-reported local state:

```text
LOCAL WORKING TREE: clean
LOCAL BRANCH: main
LOCAL main: b463c87
origin/main: b463c87
```

Current remote coordination state:

```text
Issue #29: OPEN — docs clarification owner
Branch: docs/VAL-003I-A-financial-edge-contracts
Issue #28: OPEN but implementation blocked until #29 merges
feat/VAL-003J-payment-validation-tip-db: exists remotely from pre-clarification baseline; do not implement on it yet
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

Financial persistence remains payment-centric under DEC-021. DEC-022 clarifies edge behavior without changing entity boundaries or the three-slice order.

## Dependencies / Contention

- No financial migration is active while VAL-003I-A is docs-only.
- `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/**` remain CRITICAL/high-contention while Phase 1 database work continues.
- Keep one active migration owner at a time.
- Do not start VAL-003J implementation until Issue #29 is reviewed and merged.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

Finish VAL-003I-A docs alignment, open a docs-only PR, require CI success and review the exact diff. After it merges, sync local `main`, rebase/recreate the VAL-003J feature branch from the new `main`, then implement only Payment + Validation + tip persistence under Issue #28.

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
