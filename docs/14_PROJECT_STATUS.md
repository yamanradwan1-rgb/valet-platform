# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Current verified `main`: `b36f2b1ab76fdb539e1127f4fe4bd05d0903b81b`
- Active task: VAL-005C — Key Assignment & Custody Commands
- Tracking issue: #92
- Accepted decision: DEC-033 (`docs/decisions/DEC-033_KEY_ASSIGNMENT_CUSTODY_COMMANDS.md`)
- Verification basis: merged VAL-005A, merged VAL-005B implementation, merged DEC-033, and current Phase 3 execution plan

## Current Milestone

**Phase 3 — Operations: keys, parking and Hybrid Dispatch**

Phase 0 is complete. Phase 1 is complete. Phase 2 contains the required Phase-3 entry baseline; deferred production/pilot hardening, including any fresh Standard Security Scan, is not claimed as run or passed.

Phase 3 status:

- VAL-005A — Key & Parking Persistence Foundation: **MERGED / COMPLETED** through PR #86, merge commit `3df5d9755e6c42a568c545fa2436c9a22506b41a`.
- VAL-005B — Shift Operational Eligibility: **MERGED / COMPLETED** through PR #91, merge commit `928f992bb678c4e1fa268810ed42b279e0130cbd`; Issue #88 completed.
- DEC-033 — Key Assignment & Custody Commands: **ACCEPTED / MERGED** through PR #93, merge commit `b36f2b1ab76fdb539e1127f4fe4bd05d0903b81b`.
- VAL-005C — Key Assignment & Custody Commands implementation: **CURRENT / READY FOR IMPLEMENTATION**; Issue #92 is open.

Exactly **19 forward-only migrations** exist. DEC-033 authorizes **no Prisma schema change and no migration** for VAL-005C; migrations 1–19 must remain unchanged.

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

### DEC-033 — Key Assignment & Custody Commands

- Issue #92 — open for implementation
- PR #93 — decision only
- Merge commit: `b36f2b1ab76fdb539e1127f4fe4bd05d0903b81b`
- Status: **ACCEPTED / MERGED**
- Database: no schema migration authorized.

## Current Task

### VAL-005C — Key Assignment & Custody Commands

- Issue: #92
- Status: **CURRENT — READY FOR IMPLEMENTATION AGAINST ACCEPTED DEC-033**
- Accepted decision: DEC-033
- Database state: **19 forward-only migrations; no new migration authorized**

DEC-033 locks:

- public assign and clear KeySlot command routes under the staff ValetSession route family;
- `KeySlot.code` as the canonical QR/manual resource identifier, never authentication or authorization;
- current operational eligibility from DEC-032 inside the same protected transaction;
- exact `AWAITING_PARKING` state guard and existing ValetSession `version` optimistic concurrency;
- initial assignment, same-slot semantic no-op, A -> B reassignment, and explicit correction clear semantics;
- database-enforced single current KeySlot occupancy and stable non-disclosing resource conflict mapping;
- append-only `SLOT_ASSIGNED` / `SLOT_CLEARED` custody history with required AuditEvent atomicity;
- reusable transaction-aware custody primitives for later `CHECKED_OUT` and `RETURNED_TO_SLOT` integration in VAL-005F/VAL-005G;
- no standalone public checkout/return endpoint in VAL-005C;
- no ValetSession physical state transition in VAL-005C;
- no Task/Dispatch, GPS/maps, Retrieval, handoff, payment or payroll behavior;
- no Prisma schema change and no migration.

## Phase 3 Focused Task Sequence

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED
VAL-005B  Shift Operational Eligibility                            MERGED
VAL-005C  Key Assignment & Custody Commands                        CURRENT
VAL-005D  Task / Dispatch Persistence Foundation                   NEXT
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment
VAL-005F  Start Parking
VAL-005G  Confirm Parked
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

This sequence is dependency-oriented. Do not combine Phase 3 into one large PR and do not pull later slices into VAL-005C.

## Migration Baseline

Phase 1 completed with exactly 14 forward-only migrations. Phase 2 added migrations 15–18. Phase 3 VAL-005A added exactly:

```text
19  20260811001900_phase3_key_parking_persistence
```

VAL-005B added no migration. VAL-005C adds no migration. Do not modify migrations 1–19.

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
- DEC-032 operational eligibility must be reused rather than duplicated for VAL-005C field authority.
- KeySlot QR/code identifies a resource only; it never grants authority.
- KeyCustodyEvent history remains append-only.
- Common/shared infrastructure must not import feature modules.
- New authored code files must respect DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` 300-line policy.
- No fresh post-fix Standard Security Scan is claimed.
- Maps/session tracking remains task-scoped Phase 5 work.

## Exact Next Step

Implement **VAL-005C** on a fresh focused branch from current `main`, strictly against Accepted DEC-033 and Issue #92.

Do not change Prisma schema or migrations, do not implement Task/Dispatch early, do not perform Parking physical-state transitions, and do not create public standalone checkout/return endpoints.

After VAL-005C implementation is reviewed, CI-green and merged, proceed to VAL-005D.

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
