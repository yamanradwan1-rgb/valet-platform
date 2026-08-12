# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified implementation merge baseline: `05e860423b2eb65cfd9e764f0ebda519d9a73d52`
- Current milestone: Phase 3 — Operations: keys, parking and Hybrid Dispatch
- Next focused task: VAL-005G — Confirm Parked
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
VAL-005G  Confirm Parked                                           NEXT
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

## Recently Completed — VAL-005F

- Issue: #106 — completed
- Accepted decision: DEC-036 (`docs/decisions/DEC-036_START_PARKING.md`)
- Implementation commit: `bc06db4696e0053d1b9aff7e7dddc2c97c3751fa`
- Implementation PR: #109
- Merge commit: `05e860423b2eb65cfd9e764f0ebda519d9a73d52`
- GitHub CI: run #137 — **SUCCESS**
- Changed files: 22
- Database: no Prisma schema change and no migration; migrations remain exactly 20.

Delivered behavior:

- `POST /v1/staff/valet-sessions/:sessionId/start-parking`;
- strict dual expected-version request contract;
- self-owned authorization through canonical `Task.current_assignee_membership_id`;
- DEC-032 operational eligibility inside the protected transaction;
- coordinated `Task: ACCEPTED -> IN_PROGRESS` and `ValetSession: AWAITING_PARKING -> PARKING`;
- shared PostgreSQL-authoritative `parking_started_at` / event timestamp;
- Task.version and ValetSession.version each increment exactly once;
- current `ValetSession.key_slot_id` remains unchanged;
- append-only `KeyCustodyEvent(CHECKED_OUT)`;
- append-only `DispatchEvent(IN_PROGRESS)`;
- required `VALET_SESSION_PARKING_STARTED` AuditEvent;
- atomic rollback across Task/session/custody/dispatch/audit effects;
- concurrency coverage for double start, Task acceptance/reassignment, KeySlot correction and Shift-end interaction;
- tenant/Location/current-owner concealment and stable error mapping.

Explicit boundaries preserved:

- no `ValetSession.current_assignee_membership_id` synchronization;
- no Zone/Spot assignment or proof;
- no `PARKING -> PARKED`;
- no `parked_at`;
- no Parking Task completion;
- no `RETURNED_TO_SLOT`;
- no GPS/maps/tracking/geofences;
- no Retrieval behavior;
- no payment, handoff, payroll, dashboard, employee UI, or offline behavior.

## Database / Migration Baseline

Exactly **20 forward-only migrations** exist:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
```

Migrations 1–20 remain immutable unless a later Accepted decision explicitly authorizes a new forward-only migration.

`Task.current_assignee_membership_id` remains canonical Hybrid Dispatch ownership. `ValetSession.current_assignee_membership_id` is not.

## Exact Next Step

Prepare the focused Accepted decision and implementation slice for **VAL-005G — Confirm Parked**.

VAL-005G owns the coordinated parking-completion transaction, including the exact guards and concurrency needed to move:

```text
Task:         IN_PROGRESS -> COMPLETED
ValetSession: PARKING -> PARKED
```

and to establish the required Zone/Spot parking proof, set `parked_at`, return the key through the DEC-033 custody boundary with `RETURNED_TO_SLOT`, and append the required Dispatch/Audit history atomically.

Do not pull Retrieval, GPS/maps/tracking, payment, handoff, payroll, UI or later-phase behavior into VAL-005G before its focused Accepted decision is locked.
