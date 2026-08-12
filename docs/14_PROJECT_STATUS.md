# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified main baseline before this status sync: `51b9ca53526deba2126c98e4b068f8f73d39dc9d`
- Current milestone: Phase 3 — Operations: keys, parking and Hybrid Dispatch
- Active task: VAL-005G — Confirm Parked
- Tracking issue: #111
- Accepted decision: DEC-037 (`docs/decisions/DEC-037_CONFIRM_PARKED.md`)
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
VAL-005G  Confirm Parked                                           CURRENT / READY FOR IMPLEMENTATION
VAL-005H  Phase 3 API / Integration / Employee Operations Gate     NEXT
```

## Recently Completed — VAL-005F

- Issue: #106 — completed
- Accepted decision: DEC-036 (`docs/decisions/DEC-036_START_PARKING.md`)
- Implementation commit: `bc06db4696e0053d1b9aff7e7dddc2c97c3751fa`
- Implementation PR: #109
- Merge commit: `05e860423b2eb65cfd9e764f0ebda519d9a73d52`
- GitHub CI: run #137 — **SUCCESS**
- Completion/status sync PR: #110
- Result: atomic Start Parking moves the accepted Parking Task to IN_PROGRESS and ValetSession to PARKING, records `parking_started_at`, `CHECKED_OUT`, `IN_PROGRESS` Dispatch history and required Audit history while preserving current KeySlot assignment.
- Database: no Prisma schema change and no migration; migrations remain exactly 20.

## Current Task — VAL-005G

Issue: #111  
Decision: DEC-037 — Accepted  
Status: **CURRENT — READY FOR IMPLEMENTATION**

VAL-005G owns exactly one coordinated Confirm Parked operation:

```text
Task:         IN_PROGRESS -> COMPLETED
ValetSession: PARKING -> PARKED
```

The accepted contract requires:

- canonical route `POST /v1/staff/valet-sessions/:sessionId/confirm-parked`;
- strict request with `expectedSessionVersion`, `expectedTaskVersion`, and exact `parkingSpotCode`;
- only the current IN_PROGRESS PARKING Task owner may confirm;
- DEC-032 operational eligibility inside the same protected transaction;
- exact active ParkingSpot code lookup in the session Organization + Location;
- ParkingZone derived from the persisted Spot, never trusted from client input;
- any existing preassigned session Zone must match the selected Spot Zone;
- current Spot occupancy protected with existing database uniqueness as final authority;
- session current `parking_zone_id` / `parking_spot_id` assigned consistently;
- current KeySlot remains assigned and active;
- exactly one `KeyCustodyEvent(RETURNED_TO_SLOT)` through DEC-033;
- exactly one `DispatchEvent(COMPLETED)`;
- exactly one `VALET_SESSION_PARKED` AuditEvent;
- one PostgreSQL-authoritative operation time shared across `parked_at` and event history;
- Task.version and ValetSession.version each increment exactly once;
- atomic rollback across session/task/parking-resource/custody/dispatch/audit effects;
- safe same-Spot concurrency and non-disclosing resource errors.

Parking proof boundary:

- `ParkingSpot.code` is the single submitted resource identifier;
- scanner and permitted manual entry use the same exact code field;
- no QR bearer secret, client-selected Spot UUID, or client-selected Zone authority;
- VAL-005G does not invent a typed QR-vs-manual policy or migration.

VAL-005G explicitly does **not** own:

- Prisma schema or migrations;
- RetrievalRequest / Retrieval Task behavior;
- `PARKED -> REQUESTED`;
- GPS/maps/tracking/geofences;
- guest parked notification delivery;
- parking management/configuration CRUD;
- key release/handoff completion;
- payment/handoff/payroll;
- dashboard/employee UI;
- offline replay;
- IN_PROGRESS reassignment/handoff exception.

## Database / Migration Baseline

Exactly **20 forward-only migrations** exist:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
```

Migrations 1–20 remain immutable for VAL-005G. DEC-037 requires no Prisma schema change and no migration.

`Task.current_assignee_membership_id` remains canonical Hybrid Dispatch ownership. `ValetSession.current_assignee_membership_id` is not synchronized or treated as Task authority.

## Exact Next Step

Implement **VAL-005G — Confirm Parked** on a focused branch from the current `main`, strictly against DEC-037 plus DEC-031/032/033/034/035/036 and the binding ValetSession state machine.

After implementation is reviewed, Linux CI is green and the PR is merged, proceed to **VAL-005H — Phase 3 API / Integration / Employee Operations Gate**.

Do not pull Retrieval, GPS/maps/tracking, notification delivery, payment, handoff, payroll, UI or later-phase behavior into VAL-005G.
