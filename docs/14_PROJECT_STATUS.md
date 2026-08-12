# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Current verified implementation `main`: `8c24b46dec32625f19de617783ba85cdf4922815`
- Completed task: VAL-005C — Key Assignment & Custody Commands
- Completed issue: #92
- Accepted decision: DEC-033 (`docs/decisions/DEC-033_KEY_ASSIGNMENT_CUSTODY_COMMANDS.md`)
- Next task: VAL-005D — Task / Dispatch Persistence Foundation
- Verification basis: reviewed VAL-005C implementation, GitHub CI run #115 success, PR #95 merged, Issue #92 completed, and current Phase 3 execution plan

## Current Milestone

**Phase 3 — Operations: keys, parking and Hybrid Dispatch**

Phase 0 is complete. Phase 1 is complete. Phase 2 contains the required Phase-3 entry baseline; deferred production/pilot hardening, including any fresh Standard Security Scan, is not claimed as run or passed.

Phase 3 status:

- VAL-005A — Key & Parking Persistence Foundation: **MERGED / COMPLETED** through PR #86, merge commit `3df5d9755e6c42a568c545fa2436c9a22506b41a`.
- VAL-005B — Shift Operational Eligibility: **MERGED / COMPLETED** through PR #91, merge commit `928f992bb678c4e1fa268810ed42b279e0130cbd`; Issue #88 completed.
- DEC-033 — Key Assignment & Custody Commands: **ACCEPTED / MERGED** through PR #93, merge commit `b36f2b1ab76fdb539e1127f4fe4bd05d0903b81b`.
- VAL-005C — Key Assignment & Custody Commands: **MERGED / COMPLETED** through PR #95, implementation commit `2084ae6d5c9c0aea73d2a821238dcf266b6e5379`, merge commit `8c24b46dec32625f19de617783ba85cdf4922815`; Issue #92 completed.
- VAL-005D — Task / Dispatch Persistence Foundation: **NEXT — DECISION/ISSUE PREPARATION REQUIRED BEFORE IMPLEMENTATION**.

Exactly **19 forward-only migrations** exist. VAL-005C changed neither Prisma schema nor migrations; migrations 1–19 remain the baseline.

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

## Next Task

### VAL-005D — Task / Dispatch Persistence Foundation

- Status: **NEXT — NOT YET AUTHORIZED FOR IMPLEMENTATION**
- Required first step: create a focused Issue and Accepted persistence decision before coding where semantics are not already locked.
- Database baseline entering the slice: **19 forward-only migrations**.

VAL-005D purpose remains:

- Task entity persistence;
- Task lifecycle/status persistence compatible with the canonical task path;
- task type boundary compatible with Parking/Retrieval MVP without implementing Retrieval behavior early;
- append-only Dispatch/assignment history or equivalent accepted event model;
- one-active-intended-operation protection;
- exact tenant/Location/ValetSession integrity.

VAL-005D must not implement the Hybrid Dispatch assignment algorithm, acceptance/reassignment commands, GPS proximity, parking physical-state transitions, Retrieval behavior, payment, handoff or UI early. Those remain later focused slices.

## Phase 3 Focused Task Sequence

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED
VAL-005B  Shift Operational Eligibility                            MERGED
VAL-005C  Key Assignment & Custody Commands                        MERGED
VAL-005D  Task / Dispatch Persistence Foundation                   NEXT
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment
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

VAL-005B added no migration. VAL-005C added no migration. The next migration number, if and only if an Accepted VAL-005D persistence decision requires one, is 20. Existing migrations 1–19 remain immutable.

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
- DEC-032 operational eligibility is the reusable field-operation eligibility boundary.
- KeySlot QR/code identifies a resource only; it never grants authority.
- KeyCustodyEvent history remains append-only.
- Common/shared infrastructure must not import feature modules.
- New authored code files must respect DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` 300-line policy.
- No fresh post-fix Standard Security Scan is claimed.
- Maps/session tracking remains task-scoped Phase 5 work.

## Exact Next Step

Prepare **VAL-005D — Task / Dispatch Persistence Foundation** as the next focused Phase 3 slice: create its scoped Issue, inspect the existing Task/Dispatch persistence baseline, and accept a focused decision before implementation if schema, lifecycle, history, uniqueness or concurrency semantics are not already fully locked.

Do not implement VAL-005E Hybrid Dispatch assignment/acceptance/reassignment behavior inside VAL-005D.

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
