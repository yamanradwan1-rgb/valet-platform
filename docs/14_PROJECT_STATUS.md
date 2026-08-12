# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-12`
- Repository: `veletpro0-lgtm/valet-platform`
- Verified main baseline before this status sync: `7b7dea417169fd8d8f5fd6ed1fa5e358aa867dd7`
- Active task: VAL-005E — Hybrid Dispatch Assignment / Acceptance / Reassignment
- Tracking issue: #101
- Accepted decision: DEC-035 (`docs/decisions/DEC-035_HYBRID_DISPATCH_ASSIGNMENT_ACCEPTANCE_REASSIGNMENT.md`)
- Database baseline: exactly **20 forward-only migrations**

## Current Milestone

**Phase 3 — Operations: keys, parking and Hybrid Dispatch**

Phase 0 is complete. Phase 1 is complete. Phase 2 contains the required Phase-3 entry baseline; deferred production/pilot hardening, including any fresh Standard Security Scan, is not claimed as run or passed.

Phase 3 status:

- VAL-005A — Key & Parking Persistence Foundation: **MERGED / COMPLETED** through PR #86.
- VAL-005B — Shift Operational Eligibility: **MERGED / COMPLETED** through PR #91.
- VAL-005C — Key Assignment & Custody Commands: **MERGED / COMPLETED** through PR #95.
- VAL-005D — Task / Dispatch Persistence Foundation: **MERGED / COMPLETED** through PR #100, implementation commit `fd31eade03259f7f6c3d785ea5aae2d3b1837c61`, merge commit `3dc2601680254edce3e8299f87ab8104e7782f8b`; Issue #97 completed.
- DEC-035 — Hybrid Dispatch Assignment / Acceptance / Reassignment: **ACCEPTED / MERGED** through PR #102, merge commit `7b7dea417169fd8d8f5fd6ed1fa5e358aa867dd7`.
- VAL-005E — Hybrid Dispatch Assignment / Acceptance / Reassignment: **CURRENT / READY FOR IMPLEMENTATION**; Issue #101 is open.

## Database / Migration Baseline

Exactly **20 forward-only migrations** now exist.

Phase 3 migrations:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
```

Migrations 1–20 are immutable for VAL-005E unless a new Accepted decision explicitly authorizes otherwise. DEC-035 requires no Prisma schema or migration change for VAL-005E.

VAL-005D delivered the authoritative Task current projection and append-only DispatchEvent history. `Task.current_assignee_membership_id` is canonical Hybrid Dispatch ownership; `ValetSession.current_assignee_membership_id` is not.

## Current Task — VAL-005E

Issue: #101  
Decision: DEC-035 — Accepted  
Status: **CURRENT — READY FOR IMPLEMENTATION**

VAL-005E owns the focused Hybrid Dispatch command/API behavior on top of the merged VAL-005D persistence foundation:

- Parking Task queue/current queue read surface needed by the employee workflow;
- concurrency-safe assignment/current assignee mutation using `Task.version`;
- DEC-032 transaction-aware operational eligibility inside the same protected transaction;
- current open-task load as the deterministic MVP ranking input;
- employee self-accept and self-decline according to DEC-035;
- authorized supervisor reassignment with bounded reason and append-only actor/previous/new-assignee history;
- required DispatchEvent and AuditEvent atomicity;
- open-work Shift-end handoff protection so canonical nonterminal Task ownership is not stranded;
- tenant/Location isolation and safe stable conflict/error mapping.

VAL-005E does **not** own:

- Prisma schema/migrations;
- GPS/maps/tracking/geofences;
- `AWAITING_PARKING -> PARKING`;
- key checkout/return;
- Zone/Spot parked confirmation;
- Retrieval behavior;
- payment, handoff, payroll;
- employee/dashboard UI;
- offline replay infrastructure;
- speculative timeout/requeue policy.

## Phase 3 Focused Task Sequence

```text
VAL-005A  Key & Parking Persistence Foundation                     MERGED
VAL-005B  Shift Operational Eligibility                            MERGED
VAL-005C  Key Assignment & Custody Commands                        MERGED
VAL-005D  Task / Dispatch Persistence Foundation                   MERGED
VAL-005E  Hybrid Dispatch Assignment / Acceptance / Reassignment   CURRENT
VAL-005F  Start Parking                                            NEXT
VAL-005G  Confirm Parked
VAL-005H  Phase 3 API / Integration / Employee Operations Gate
```

## Important Security / Architecture Boundaries

- Staff Auth proves persisted User identity; tenant, membership, role, Location and resource authority remain server-derived.
- Cross-tenant access is a critical defect and existing non-disclosing authorization mappings remain active.
- DEC-032 operational eligibility is the reusable field-operation eligibility boundary and must be consumed transactionally by VAL-005E.
- Task is canonical current Dispatch ownership; immutable DispatchEvent preserves assignment lifecycle history.
- KeyCustodyEvent remains append-only and VAL-005E does not emit parking checkout/return custody events.
- Common/shared infrastructure must not import feature modules.
- DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` 300-line policy remains binding.
- No fresh post-fix Standard Security Scan is claimed.
- Maps/session tracking remains Phase 5 work.

## Exact Next Step

Implement **VAL-005E — Hybrid Dispatch Assignment / Acceptance / Reassignment** on the focused branch `feat/VAL-005E-hybrid-dispatch`, strictly against Accepted DEC-035, DEC-032, DEC-034 and Issue #101.

Do not pull VAL-005F/G physical parking transitions or later-phase behavior into this slice.

After VAL-005E implementation is reviewed, CI-green and merged, proceed to the focused VAL-005F Start Parking decision/command slice.
