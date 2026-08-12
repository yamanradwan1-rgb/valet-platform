# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified main baseline before this status sync: `c8d28c1b82224d334abffa4e2b074d3c02f372e2`
- Current milestone: Phase 3 — Operations: keys, parking and Hybrid Dispatch
- Active task: VAL-005H — Phase 3 API / Integration / Employee Operations Gate
- Tracking issue: #116
- Accepted decision: DEC-038 (`docs/decisions/DEC-038_PHASE3_API_INTEGRATION_EMPLOYEE_OPERATIONS_GATE.md`)
- Database baseline: exactly **20 forward-only migrations**
- No fresh post-fix Standard Security Scan is claimed.

## Phase 3 Status

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED / COMPLETED
VAL-005B  Shift Operational Eligibility                            MERGED / COMPLETED
VAL-005C  Key Assignment & Custody Commands                        MERGED / COMPLETED
VAL-005D  Task / Dispatch Persistence Foundation                   MERGED / COMPLETED
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment   MERGED / COMPLETED
VAL-005F  Start Parking                                            MERGED / COMPLETED
VAL-005G  Confirm Parked                                           MERGED / COMPLETED
VAL-005H  Phase 3 API / Integration / Employee Operations Gate     CURRENT / READY FOR IMPLEMENTATION
```

## Recently Completed — VAL-005G

- Issue: #111 — completed
- Accepted decision: DEC-037
- Implementation commit: `2935123f9272717bfa7e6df2b078ce655a45cf69`
- Implementation PR: #114
- Merge commit: `e03f4a75e2dcd59e0779e39a22a79a5276bb9979`
- GitHub CI: run #145 — **SUCCESS**
- Completion/status sync PR: #115
- Result: atomic Confirm Parked moves the canonical Parking Task `IN_PROGRESS -> COMPLETED` and ValetSession `PARKING -> PARKED`, derives Zone from exact Spot, assigns current Zone/Spot, records `RETURNED_TO_SLOT`, `COMPLETED` Dispatch history and required Audit history, and preserves current KeySlot assignment.
- Database: no Prisma schema change and no migration; migrations remain exactly 20.

## Current Task — VAL-005H

Issue: #116  
Decision: DEC-038 — Accepted  
Status: **CURRENT — READY FOR IMPLEMENTATION**

VAL-005H is a closure/integration gate, not a new product workflow.

It must prove one coherent authorized employee flow through the already accepted Phase 3 staff API:

```text
AWAITING_PARKING
-> KeySlot assignment
-> Parking Task queue
-> Task assignment/self-claim
-> Task acceptance
-> Start Parking
-> Confirm Parked
-> PARKED
```

The gate must verify:

- production Phase 3 route/module wiring;
- tenant and Location isolation;
- DEC-032 operational Shift eligibility across protected operations;
- returned optimistic versions can drive the next command;
- canonical `Task.current_assignee_membership_id` ownership;
- one active Parking Task per session;
- no double current KeySlot or ParkingSpot occupancy;
- expected Key custody sequence `SLOT_ASSIGNED -> CHECKED_OUT -> RETURNED_TO_SLOT`;
- expected normal Dispatch sequence `QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED`;
- reassignment/decline history remains append-only and auditable;
- required Audit/Black Box events and safe metadata;
- exact KeySlot/Zone/Spot operational details stay out of guest-facing responses;
- architecture/300-line, schema/migration, contracts, full regression and Linux CI gates.

VAL-005H may make only narrow integration/wiring fixes proven necessary by failing gate evidence and consistent with DEC-031 through DEC-037.

It must not add Retrieval, GPS/maps/tracking, parked-notification delivery, payment, handoff, payroll, UI, offline replay, generic configuration CRUD or later-phase behavior.

## Database / Migration Baseline

Exactly **20 forward-only migrations** exist:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
```

Migrations 1–20 and `packages/database/prisma/schema.prisma` are frozen for VAL-005H.

`Task.current_assignee_membership_id` remains canonical Hybrid Dispatch ownership. `ValetSession.current_assignee_membership_id` is not synchronized or treated as Task authority.

## Phase 3 Closure Rule

Phase 3 is complete only after VAL-005H implementation is reviewed, Linux CI is green, its PR is merged, Issue #116 is completed, and this status snapshot is synchronized to mark **VAL-005A through VAL-005H completed** and Phase 3 closed.

## Exact Next Step

Implement **VAL-005H — Phase 3 API / Integration / Employee Operations Gate** on a focused branch from the current `main`, strictly against DEC-038 and the already accepted DEC-031 through DEC-037 contracts.

Do not begin Phase 4 behavior inside VAL-005H.
