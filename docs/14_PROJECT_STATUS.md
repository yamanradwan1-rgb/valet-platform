# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified implementation merge baseline: `09b8ef78d8a5a29c2b147e3006dfa2e863fba1dd`
- Current milestone: Phase 3 — Operations: keys, parking and Hybrid Dispatch
- Next focused task: VAL-005F — Start Parking
- Database baseline: exactly **20 forward-only migrations**
- No fresh post-fix Standard Security Scan is claimed.

## Phase 3 Status

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED / COMPLETED
VAL-005B  Shift Operational Eligibility                            MERGED / COMPLETED
VAL-005C  Key Assignment & Custody Commands                        MERGED / COMPLETED
VAL-005D  Task / Dispatch Persistence Foundation                   MERGED / COMPLETED
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment   MERGED / COMPLETED
VAL-005F  Start Parking                                            NEXT
VAL-005G  Confirm Parked
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

## Recently Completed — VAL-005E

- Issue: #101 — completed
- Accepted decision: DEC-035 (`docs/decisions/DEC-035_HYBRID_DISPATCH_ASSIGNMENT_ACCEPTANCE_REASSIGNMENT.md`)
- Implementation commit: `38a74ad305ebd778447d9eaee346e5c2dbaf0794`
- Implementation PR: #104
- Merge commit: `09b8ef78d8a5a29c2b147e3006dfa2e863fba1dd`
- GitHub CI: run #129 — **SUCCESS**
- Changed files: 33
- Database: no Prisma schema change and no migration; migrations remain exactly 20.

Delivered behavior:

- `POST /v1/staff/valet-sessions/:sessionId/parking-task/queue`
- `GET /v1/staff/tasks/queue?locationId=<uuid>`
- `POST /v1/staff/tasks/:taskId/assign`
- `POST /v1/staff/tasks/:taskId/accept`
- `POST /v1/staff/tasks/:taskId/decline`
- `POST /v1/staff/tasks/:taskId/reassign`
- canonical Task ownership through `Task.current_assignee_membership_id` only;
- concurrency-safe Parking Task queue creation/retry;
- employee self-claim and supervisor assignment;
- deterministic lower-open-load automatic ranking with stable persisted tie-break;
- self-accept and self-decline;
- supervisor reassignment for ASSIGNED/ACCEPTED Tasks with bounded reason;
- `Task.version` optimistic concurrency and stable error precedence;
- DEC-032 transaction-aware operational eligibility reused inside protected Task transactions;
- append-only DispatchEvent and required AuditEvent atomicity;
- Shift self-end blocked by canonical ASSIGNED/ACCEPTED/IN_PROGRESS ownership via `OPEN_TASK_HANDOFF_REQUIRED`;
- tenant/Location isolation and non-disclosing Task authorization.

Explicit boundaries preserved:

- no `ValetSession.current_assignee_membership_id` synchronization;
- no `AWAITING_PARKING -> PARKING` transition;
- no Task `IN_PROGRESS` parking start behavior;
- no KeyCustodyEvent checkout/return;
- no Zone/Spot confirmation;
- no Retrieval behavior;
- no GPS/maps/geofences;
- no payment, handoff, payroll, dashboard, employee UI, or offline behavior.

## Database / Migration Baseline

Exactly **20 forward-only migrations** exist:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
```

Migrations 1–20 remain immutable unless a later Accepted decision explicitly authorizes a new forward-only migration.

`Task.current_assignee_membership_id` is canonical Hybrid Dispatch ownership. `ValetSession.current_assignee_membership_id` is not.

## Exact Next Step

Prepare the focused Accepted decision and implementation slice for **VAL-005F — Start Parking**.

VAL-005F owns the coordinated accepted Parking start transaction, including the exact guards and concurrency needed to move:

```text
Task: ACCEPTED -> IN_PROGRESS
ValetSession: AWAITING_PARKING -> PARKING
```

and to consume the existing DEC-033 transaction-aware key-custody boundary for the required `CHECKED_OUT` fact in the same accepted transaction.

Do not implement Confirm Parked, Zone/Spot completion, key return, GPS/maps, Retrieval, payment, handoff, payroll, or UI behavior early.
