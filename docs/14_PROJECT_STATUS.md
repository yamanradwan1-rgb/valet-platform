# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified main baseline before this status sync: `52a7181fc06a300e33472e16361b692d3ea7d20a`
- Current milestone: Phase 3 — Operations: keys, parking and Hybrid Dispatch
- Active task: VAL-005F — Start Parking
- Tracking issue: #106
- Accepted decision: DEC-036 (`docs/decisions/DEC-036_START_PARKING.md`)
- Database baseline: exactly **20 forward-only migrations**
- No fresh post-fix Standard Security Scan is claimed.

## Phase 3 Status

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED / COMPLETED
VAL-005B  Shift Operational Eligibility                            MERGED / COMPLETED
VAL-005C  Key Assignment & Custody Commands                        MERGED / COMPLETED
VAL-005D  Task / Dispatch Persistence Foundation                   MERGED / COMPLETED
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment   MERGED / COMPLETED
VAL-005F  Start Parking                                            CURRENT / READY FOR IMPLEMENTATION
VAL-005G  Confirm Parked                                           NEXT
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

## Recently Completed — VAL-005E

- Issue: #101 — completed
- Accepted decision: DEC-035
- Implementation commit: `38a74ad305ebd778447d9eaee346e5c2dbaf0794`
- Implementation PR: #104
- Merge commit: `09b8ef78d8a5a29c2b147e3006dfa2e863fba1dd`
- GitHub CI: run #129 — **SUCCESS**
- Completion/status sync PR: #105
- Result: Parking Task queue/read, assignment/self-claim/automatic ranking, accept/decline/reassignment, Task.version concurrency, append-only DispatchEvent + required AuditEvent atomicity, and Shift-end canonical open-work protection.
- Database: no Prisma schema change and no migration; migrations remain exactly 20.

## Current Task — VAL-005F

Issue: #106  
Decision: DEC-036 — Accepted  
Status: **CURRENT — READY FOR IMPLEMENTATION**

VAL-005F owns exactly one coordinated Start Parking operation:

```text
Task:         ACCEPTED -> IN_PROGRESS
ValetSession: AWAITING_PARKING -> PARKING
```

The accepted contract requires:

- canonical route `POST /v1/staff/valet-sessions/:sessionId/start-parking`;
- strict request with both `expectedSessionVersion` and `expectedTaskVersion`;
- only the current accepted PARKING Task owner may start;
- DEC-032 operational eligibility inside the same protected transaction;
- current active KeySlot assignment required;
- current `ValetSession.key_slot_id` remains assigned and unchanged;
- exactly one `KeyCustodyEvent(CHECKED_OUT)` through the DEC-033 custody boundary;
- exactly one `DispatchEvent(IN_PROGRESS)`;
- exactly one `VALET_SESSION_PARKING_STARTED` AuditEvent;
- one PostgreSQL-authoritative operation time shared across the coordinated effects;
- `parking_started_at` set once;
- Task.version increments exactly once;
- ValetSession.version increments exactly once;
- atomic rollback across session/task/custody/dispatch/audit effects;
- stable non-disclosing errors and safe concurrency outcomes.

VAL-005F explicitly does **not** own:

- Prisma schema or migrations;
- Zone/Spot assignment/proof;
- `PARKING -> PARKED`;
- `parked_at`;
- Task `COMPLETED`;
- `RETURNED_TO_SLOT`;
- GPS/maps/tracking/geofences;
- Retrieval;
- payment/handoff/payroll;
- dashboard/employee UI;
- offline replay;
- supervisor reassignment of IN_PROGRESS work.

## Database / Migration Baseline

Exactly **20 forward-only migrations** exist:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
```

Migrations 1–20 remain immutable for VAL-005F. DEC-036 requires no Prisma schema change and no migration.

`Task.current_assignee_membership_id` remains canonical Hybrid Dispatch ownership. `ValetSession.current_assignee_membership_id` is not synchronized or treated as Task authority.

## Exact Next Step

Implement **VAL-005F — Start Parking** on a focused branch from the current `main`, strictly against DEC-036 plus DEC-032/033/034/035 and the binding ValetSession state machine.

After implementation is reviewed, Linux CI is green and the PR is merged, proceed to the focused VAL-005G Confirm Parked decision/command slice.
