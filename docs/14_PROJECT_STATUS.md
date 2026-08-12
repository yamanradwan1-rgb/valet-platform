# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified decision baseline before this status sync: `dddd9c2a0a2a7ea4de2a440a6c71f3a429482e5a`
- Active task: VAL-005D — Task / Dispatch Persistence Foundation
- Tracking issue: #97
- Accepted decision: DEC-034 (`docs/decisions/DEC-034_TASK_DISPATCH_PERSISTENCE_FOUNDATION.md`)
- Verification basis: reviewed/merged VAL-005C, Accepted DEC-034 merged through PR #98, and the current Phase 3 execution plan

## Current Milestone

**Phase 3 — Operations: keys, parking and Hybrid Dispatch**

Phase 0 is complete. Phase 1 is complete. Phase 2 contains the required Phase-3 entry baseline; deferred production/pilot hardening, including any fresh Standard Security Scan, is not claimed as run or passed.

Phase 3 status:

- VAL-005A — Key & Parking Persistence Foundation: **MERGED / COMPLETED** through PR #86, merge commit `3df5d9755e6c42a568c545fa2436c9a22506b41a`.
- VAL-005B — Shift Operational Eligibility: **MERGED / COMPLETED** through PR #91, merge commit `928f992bb678c4e1fa268810ed42b279e0130cbd`; Issue #88 completed.
- VAL-005C — Key Assignment & Custody Commands: **MERGED / COMPLETED** through PR #95, implementation commit `2084ae6d5c9c0aea73d2a821238dcf266b6e5379`, merge commit `8c24b46dec32625f19de617783ba85cdf4922815`; Issue #92 completed.
- DEC-034 — Task / Dispatch Persistence Foundation: **ACCEPTED / MERGED** through PR #98, merge commit `dddd9c2a0a2a7ea4de2a440a6c71f3a429482e5a`.
- VAL-005D — Task / Dispatch Persistence Foundation: **CURRENT / READY FOR IMPLEMENTATION**; Issue #97 is open.

Exactly **19 forward-only migrations** currently exist. Accepted DEC-034 authorizes exactly migration 20, `20260812002000_phase3_task_dispatch_persistence`; migrations 1–19 remain immutable.

## Recently Completed Phase 3 Gates

### VAL-005A — Key & Parking Persistence Foundation

- Issue #84
- PR #86
- Merge commit: `3df5d9755e6c42a568c545fa2436c9a22506b41a`
- Accepted decision: DEC-031
- Result: ParkingZone persistence, exact Zone/Spot integrity, current KeySlot/ParkingSpot exclusivity, append-only KeyCustodyEvent persistence, runtime-role append-only grants, deterministic seed support, and migration 19.

### VAL-005B — Shift Operational Eligibility

- Issue #88 — completed
- PR #91
- Merge commit: `928f992bb678c4e1fa268810ed42b279e0130cbd`
- Accepted decision: DEC-032
- Result: staff Shift start/self-end/own-active lookup, dynamic Location-scoped operational eligibility, reusable transaction-aware eligibility locking, concurrency-safe lifecycle behavior, and atomic Shift audit events.
- Database: no migration; migrations 1–19 unchanged.

### VAL-005C — Key Assignment & Custody Commands

- Issue #92 — completed
- Decision PR #93 — DEC-033 accepted
- Implementation PR #95
- Implementation commit: `2084ae6d5c9c0aea73d2a821238dcf266b6e5379`
- Merge commit: `8c24b46dec32625f19de617783ba85cdf4922815`
- GitHub CI: run #115 — **SUCCESS**
- Result:
  - strict staff KeySlot assign/clear APIs;
  - exact QR/manual `KeySlot.code` lookup with no bearer-authority semantics;
  - DEC-032 transaction-aware operational eligibility reused inside the protected write transaction;
  - exact `AWAITING_PARKING` + ValetSession version guards;
  - initial assignment, same-slot semantic no-op, ordered A -> B correction/reassignment, and correction clear;
  - database-backed single current KeySlot occupancy with safe conflict mapping;
  - append-only custody plus atomic AuditEvent writes using PostgreSQL-authoritative operation time;
  - internal transaction-aware `CHECKED_OUT` / `RETURNED_TO_SLOT` custody primitives for later VAL-005F/VAL-005G;
  - no public checkout/return route and no physical ValetSession state transition.
- Database: no Prisma schema change and no migration; migrations 1–19 unchanged.
- Boundaries preserved: no Task/Dispatch, GPS/maps, Retrieval, handoff, payment, payroll or UI behavior.

### DEC-034 — Task / Dispatch Persistence Foundation

- Issue #97 — open for implementation
- Decision PR #98
- Merge commit: `dddd9c2a0a2a7ea4de2a440a6c71f3a429482e5a`
- Status: **ACCEPTED / MERGED**
- Database decision: add exactly migration 20 during VAL-005D implementation; migrations 1–19 remain immutable.

## Current Task

### VAL-005D — Task / Dispatch Persistence Foundation

- Issue: #97
- Status: **CURRENT — READY FOR IMPLEMENTATION AGAINST ACCEPTED DEC-034**
- Accepted decision: DEC-034
- Database entering slice: **19 forward-only migrations**
- Authorized migration: **20 only — `20260812002000_phase3_task_dispatch_persistence`**

DEC-034 locks:

- first-class `Task` as the authoritative current Hybrid Dispatch projection, separate from ValetSession physical custody state;
- `TaskType` exactly `PARKING`, `RETRIEVAL`, with Retrieval persistence compatibility only and no Phase 4 behavior;
- `TaskStatus` exactly `QUEUED`, `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`;
- `DispatchEventType` exactly `QUEUED`, `ASSIGNED`, `ACCEPTED`, `DECLINED`, `REASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`;
- Task current assignee as canonical Task ownership; `ValetSession.current_assignee_membership_id` is not synchronized or treated as authority;
- `Task.version` as the single Task optimistic-concurrency field;
- PostgreSQL partial uniqueness allowing at most one active Task per `(valet_session_id, task_type)` across `QUEUED`, `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`;
- exact Organization/Location/ValetSession/membership composite integrity;
- append-only `DispatchEvent` history with structured actor/previous/new assignee/reason facts;
- runtime `SELECT, INSERT` only for DispatchEvent and `SELECT, INSERT, UPDATE` without delete/truncate for Task;
- migration 20 only, with no synthesis of production Tasks from legacy ValetSession assignee/state data;
- no Task/Dispatch HTTP routes or assignment/acceptance/reassignment commands;
- no ValetSession physical-state transition, GPS/maps, Retrieval behavior, payment, handoff, payroll or UI behavior.

## Phase 3 Focused Task Sequence

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED
VAL-005B  Shift Operational Eligibility                            MERGED
VAL-005C  Key Assignment & Custody Commands                        MERGED
VAL-005D  Task / Dispatch Persistence Foundation                   CURRENT
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment   NEXT
VAL-005F  Start Parking
VAL-005G  Confirm Parked
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

This sequence is dependency-oriented. Do not combine Phase 3 into one large PR and do not pull VAL-005E behavior into VAL-005D.

## Migration Baseline

Phase 1 completed with exactly 14 forward-only migrations. Phase 2 added migrations 15–18. Phase 3 VAL-005A added exactly:

```text
19  20260811001900_phase3_key_parking_persistence
```

VAL-005B added no migration. VAL-005C added no migration. VAL-005D is authorized to add exactly:

```text
20  20260812002000_phase3_task_dispatch_persistence
```

Do not modify migrations 1–19.

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

Canonical Hybrid Dispatch Task lifecycle remains separate:

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

Audit/Black Box history is append-only by contract. Protected domain mutations that require audit must commit the mutation and required AuditEvent atomically.

`ValetSession.current_assignee_membership_id` is not canonical Task/Hybrid Dispatch ownership.

## Important Security / Architecture Boundaries

- Staff Auth proves only persisted User identity; tenant, membership, Location and role authority remain server-derived.
- Cross-tenant access is a critical defect and existing non-disclosing authorization mappings remain active.
- DEC-032 operational eligibility is the reusable field-operation eligibility boundary for later assignment commands.
- KeySlot QR/code identifies a resource only; it never grants authority.
- KeyCustodyEvent and DispatchEvent history remain append-only where applicable.
- Common/shared infrastructure must not import feature modules.
- New authored code files must respect DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` 300-line policy.
- No fresh post-fix Standard Security Scan is claimed.
- Maps/session tracking remains task-scoped Phase 5 work.

## Exact Next Step

Implement **VAL-005D — Task / Dispatch Persistence Foundation** on a focused branch from current `main`, strictly against Accepted DEC-034 and Issue #97.

Add exactly migration 20 and the locked persistence/integrity/runtime-role proof. Do not implement VAL-005E assignment/acceptance/reassignment behavior, Task HTTP APIs, parking physical-state transitions, GPS/maps, Retrieval behavior, payment, handoff, payroll or UI early.

After VAL-005D implementation is reviewed, CI-green and merged, proceed to VAL-005E decision/command work.

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

Never call a task merged/completed merely because branch edits or validation pass.
