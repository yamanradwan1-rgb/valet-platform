# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-12` (VAL-005B source-of-truth sync)
- Repository: `veletpro0-lgtm/valet-platform`
- Current `main`: `f1695178e43f004e9d11b6d55c0a822dc4edd4f0`
- Active task: VAL-005B — Shift Operational Eligibility
- Tracking issue: #88
- Accepted decision: DEC-032 (`docs/decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md`)
- Verification basis: merged VAL-005A implementation, merged DEC-032 docs PR #89, and current Phase 3 execution plan

## Current Milestone

**Phase 3 — Operations: keys, parking and Hybrid Dispatch**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, deterministic demo/seed data, and the pre-Phase-2 local-security hardening gate are merged to `main`.

Phase 2 check-in/security/architecture work required before Phase 3 is present in the current baseline. The former final Phase 2 security/integrity closure and fresh Standard Security Scan are deferred production/pilot-hardening work and are **not** claimed as run or passed.

Phase 3 is active:

- VAL-005A — Key & Parking Persistence Foundation: **MERGED / COMPLETED** through PR #86, merge commit `3df5d9755e6c42a568c545fa2436c9a22506b41a`.
- DEC-032 — Shift Operational Eligibility: **ACCEPTED / MERGED** through PR #89, merge commit `f1695178e43f004e9d11b6d55c0a822dc4edd4f0`.
- VAL-005B — Shift Operational Eligibility implementation: **CURRENT / NOT YET IMPLEMENTED**; Issue #88 remains open.

Exactly **19 forward-only migrations** currently exist. VAL-005B is explicitly a no-migration slice under DEC-032; migrations 1–19 must remain unchanged by its implementation.

## Recently Completed Phase 3 Gate

### VAL-005A — Phase 3 Key & Parking Persistence Foundation

- Issue #84
- PR #86
- Merge commit: `3df5d9755e6c42a568c545fa2436c9a22506b41a`
- Status: **MERGED / COMPLETED**
- Accepted decision: DEC-031
- Result:
  - ParkingZone persistence and exact Organization/Location/Zone/Spot integrity
  - current non-null KeySlot/ParkingSpot exclusivity
  - append-only KeyCustodyEvent persistence
  - runtime-role append-only grants
  - deterministic seed support and focused verification
  - exactly migration 19: `20260811001900_phase3_key_parking_persistence`
- Explicitly not included: Shift commands, Task/Dispatch, parking state transitions, GPS/maps, retrieval, handoff, dependencies or lockfile changes

## Current Task

### VAL-005B — Shift Operational Eligibility

- Issue: #88
- Status: **CURRENT — READY FOR IMPLEMENTATION AGAINST ACCEPTED DEC-032**
- Accepted decision: DEC-032
- Database state: **19 forward-only migrations; no new migration authorized**

DEC-032 locks:

- one ACTIVE Shift per `OrganizationMembership`, not one platform-wide per User;
- self-start for `VALET_EMPLOYEE` / `VALET_SUPERVISOR` at an authorized active Location;
- server-derived Organization/membership/role scope;
- self-end only in VAL-005B, including stale-own-Shift cleanup after access/status changes;
- dynamic current operational eligibility for future Dispatch;
- transaction-aware reusable eligibility boundary for future VAL-005E;
- `POST /v1/staff/shifts/start`;
- `POST /v1/staff/shifts/:shiftId/end`;
- `GET /v1/staff/shifts/active?locationId=<uuid>`;
- `ACTIVE_SHIFT_CONFLICT` -> HTTP 409;
- `SHIFT_STARTED` and `SHIFT_ENDED` AuditEvents atomically with first successful mutation;
- PostgreSQL-authoritative timestamps;
- no supervisor force-end, no Task/Dispatch implementation, no `current_assignee_membership_id` promotion to Task ownership, and no schema migration.

Implementation must preserve authorization-before-mutation: no protected Shift mutation may occur before the authenticated User and persisted target ownership/scope required by DEC-032 have been proven.

## Phase 3 Focused Task Sequence

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED
VAL-005B  Shift Operational Eligibility                            CURRENT
VAL-005C  Key Assignment & Custody Commands                        NEXT
VAL-005D  Task / Dispatch Persistence Foundation
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment
VAL-005F  Start Parking
VAL-005G  Confirm Parked
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

This sequence is dependency-oriented. Do not combine Phase 3 into one large PR and do not pull later slices into VAL-005B.

## Migration Baseline

Phase 1 completed with exactly **14 forward-only migrations**, ending with:

```text
20260809001400_notification_foundation
```

Phase 2 then added:

```text
15  20260809001500_check_in_intake_persistence
16  20260810001600_intake_session_creation
17  20260810001700_staff_authentication
18  20260810001800_shared_durable_anti_abuse
```

Phase 3 VAL-005A added:

```text
19  20260811001900_phase3_key_parking_persistence
```

VAL-005B adds **no migration**. Do not modify migrations 1–19.

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

Financial persistence remains payment-centric under DEC-021 with DEC-022 edge clarifications. Phase 6 consumes that persistence for commands/provider/workflows.

## Important Security / Architecture Boundaries

- Staff Auth proves only persisted User identity; tenant, membership, Location and role authority remain server-derived.
- Cross-tenant access is a critical defect and existing non-disclosing authorization mappings remain active.
- Common/shared infrastructure must not import feature modules.
- New authored code files must respect DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` 300-line policy.
- No fresh post-fix Standard Security Scan is claimed.
- No Phase 3 task may introduce continuous employee tracking; maps/session tracking remain task-scoped Phase 5 work.

## Exact Next Step

Implement **VAL-005B** on a fresh focused branch from current `main`, strictly against Accepted DEC-032 and Issue #88.

Do not change schema/migrations, do not implement Task/Dispatch early, do not add supervisor force-end, and do not use `ValetSession.current_assignee_membership_id` as open Task ownership.

After VAL-005B implementation is reviewed, CI-green and merged, proceed to VAL-005C.

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
