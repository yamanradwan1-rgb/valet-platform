# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified implementation merge baseline: `e03f4a75e2dcd59e0779e39a22a79a5276bb9979`
- Current milestone: Phase 3 — Operations: keys, parking and Hybrid Dispatch
- Next focused task: VAL-005H — Phase 3 API / Integration / Employee Operations Gate
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
VAL-005H  Phase 3 API / Integration / Employee Operations Gate     NEXT
```

## Recently Completed — VAL-005G

- Issue: #111 — completed
- Accepted decision: DEC-037 (`docs/decisions/DEC-037_CONFIRM_PARKED.md`)
- Implementation commit: `2935123f9272717bfa7e6df2b078ce655a45cf69`
- Implementation PR: #114
- Merge commit: `e03f4a75e2dcd59e0779e39a22a79a5276bb9979`
- GitHub CI: run #145 — **SUCCESS**
- Changed files: 23
- Database: no Prisma schema change and no migration; migrations remain exactly 20.

Delivered behavior:

- `POST /v1/staff/valet-sessions/:sessionId/confirm-parked`;
- strict request with `expectedSessionVersion`, `expectedTaskVersion`, and exact trimmed `parkingSpotCode`;
- self-owned authorization through canonical `Task.current_assignee_membership_id`;
- DEC-032 operational eligibility inside the protected transaction;
- exact active ParkingSpot lookup in the persisted Organization + Location;
- ParkingZone derived from the persisted ParkingSpot rather than trusted from the client;
- preassigned session Zone preserved only when it matches the selected Spot Zone;
- existing database uniqueness remains final current ParkingSpot occupancy authority;
- coordinated `Task: IN_PROGRESS -> COMPLETED` and `ValetSession: PARKING -> PARKED`;
- `parked_at`, `parking_zone_id`, and `parking_spot_id` set atomically;
- Task.version and ValetSession.version each increment exactly once;
- current `ValetSession.key_slot_id` remains unchanged;
- append-only `KeyCustodyEvent(RETURNED_TO_SLOT)`;
- append-only `DispatchEvent(COMPLETED)`;
- required `VALET_SESSION_PARKED` AuditEvent;
- one PostgreSQL-authoritative operation timestamp shared across the protected completion facts;
- rollback coverage across Task/session/custody/dispatch/audit failures;
- concurrency coverage for duplicate confirmation, same-Spot contention, Shift end and the existing IN_PROGRESS reassignment boundary;
- tenant/Location/current-owner/resource concealment and narrow stable conflict mapping.

Explicit boundaries preserved:

- no `ValetSession.current_assignee_membership_id` synchronization;
- no KeySlot clearing;
- no RetrievalRequest or Retrieval Task behavior;
- no `PARKED -> REQUESTED`;
- no guest parked-notification delivery;
- no GPS/maps/tracking/geofences;
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

Prepare and execute **VAL-005H — Phase 3 API / Integration / Employee Operations Gate**.

VAL-005H is the final Phase 3 slice. It must verify the Phase 3 staff/employee operations surface end-to-end against the already accepted A–G contracts, close any narrowly proven integration/API gaps without inventing later-phase product behavior, run the required regression/security/architecture gates, and establish whether Phase 3 is ready to close.

Do not pull Retrieval, GPS/maps/tracking, notification delivery, payment, handoff, payroll, UI implementation, offline replay or later-phase behavior into VAL-005H unless a binding source explicitly places a specific gate/fix there.
