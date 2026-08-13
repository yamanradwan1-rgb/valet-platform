# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs/accepted decisions.

## Last Verified

- Date/time: `2026-08-13`
- Repository: `veletpro0-lgtm/valet-platform`
- Current `main` checkpoint: `3938257190dbd072ccfc2f906c944457ebb40525`
- Current milestone: **Phase 4 — Retrieval, guest progression and secure handoff — IN PROGRESS**
- Binding Phase 4 execution plan: `docs/19_PHASE4_RETRIEVAL_HANDOFF_EXECUTION_PLAN.md`
- Current completed slice: **VAL-006B — Guest Retrieval Request + Duplicate Protection**
- Next implementation slice: **VAL-006C — Retrieval Dispatch Composition**, which must start fresh under the normal workflow
- Database baseline: exactly **21 forward-only migrations**
- Security remediation findings SEC-002 and SEC-003 are merged; SEC-004 post-remediation Security Diff Verification remains open/tooling-blocked
- No fresh post-fix repository-wide Standard Security Scan is claimed.

## Phase 4 Status

```text
VAL-006   Phase 4 Retrieval & Secure Handoff execution contract     MERGED / COMPLETED
VAL-006A  Retrieval & Handoff Persistence Hardening / Contract Lock MERGED / COMPLETED
VAL-006B  Guest Retrieval Request + Duplicate Protection            MERGED / COMPLETED
VAL-006C  Retrieval Dispatch Composition                            NEXT / FRESH START REQUIRED
VAL-006D  Start Retrieval + Key Checkout                            PENDING
VAL-006E  Mark Vehicle Ready + Guest Progression Events             PENDING
VAL-006F  Secure Handoff Verification                               PENDING
VAL-006G  Vehicle Release + Session Completion                      PENDING
VAL-006H  Phase 4 API / Integration / Guest + Employee E2E Gate     PENDING
```

Phase 4 implementation has started and is complete through VAL-006B.

## Completed Phase 4 Foundation

### VAL-006 — execution contract

- Tracking issue: #127
- Planning PR: #128
- Result: binding Phase 4 plan with exactly eight focused slices VAL-006A through VAL-006H.

### VAL-006A — persistence hardening

- Tracking issue: #129
- Accepted decision: DEC-039
- Implementation PR: #133
- Result: existing `RetrievalRequest`, `HandoffVerification` and `Task(type=RETRIEVAL)` persistence is reused; runtime-role access was hardened for the two Phase 4 stateful tables without adding a migration.

### VAL-006B — guest retrieval request

- Tracking issue: #134
- Accepted decision: DEC-040
- Implementation PR: #138
- Merge/checkpoint commit: `3938257190dbd072ccfc2f906c944457ebb40525`

VAL-006B added the production guest Retrieval request boundary:

```text
POST /v1/guest/session/request-retrieval
```

A first valid guest request atomically performs:

```text
ValetSession: PARKED -> REQUESTED
RetrievalRequest: OPEN
Retrieval Task: QUEUED / unassigned
DispatchEvent: QUEUED
AuditEvent: RETRIEVAL_REQUESTED
```

Repeated/coherent presses return current guest-safe progression without creating duplicate active RetrievalRequest/Task work.

The guest response remains privacy-limited and does not expose internal tenant, Location, KeySlot, ParkingSpot/Zone, Task ownership or audit details.

## Database / Migration Baseline

Exactly **21 forward-only migrations** are present.

Latest migrations:

```text
19  20260811001900_phase3_key_parking_persistence
20  20260812002000_phase3_task_dispatch_persistence
21  20260813002100_guest_retrieval_requester_consistency
```

Migration 21 narrowly updates RetrievalRequest requester consistency so guest/customer-originated requests may exist without a persisted Customer row while STAFF requester semantics remain constrained.

Migrations 1–20 remain immutable. Migration 21 is now part of the accepted forward-only baseline and must also remain immutable after merge.

## Current Retrieval Boundary

The authoritative physical/session flow implemented so far is:

```text
CHECKING_IN
-> AWAITING_PARKING
-> PARKING
-> PARKED
-> REQUESTED
```

The current Retrieval Task is created at `REQUESTED` but remains unassigned:

```text
QUEUED
current_assignee_membership_id = NULL
```

`Task.current_assignee_membership_id` remains the canonical Hybrid Dispatch owner. ValetSession physical state remains separate from Task/Dispatch assignment state.

## VAL-006C Reset / Historical Experiment

A prior VAL-006C / DEC-041 experiment was cancelled by the project owner.

- Issue #139 is closed `not_planned`.
- PR #141 was cancelled and must not be reused.
- PR #140 is historical only; its DEC-041 content is not current repository authority.
- `main` was intentionally restored to the exact post-VAL-006B checkpoint `3938257190dbd072ccfc2f906c944457ebb40525`.

Any new VAL-006C work must therefore be planned and implemented fresh from the current accepted repository state. Do not copy or resurrect the cancelled experiment as authority.

## Security Checkpoint

The Post-Phase-3 Standard Security Scan produced two validated findings and both remediation changes are merged:

```text
SEC-002  Runtime DB least privilege        FIXED / MERGED
SEC-003  Guest sensitive response no-store FIXED / MERGED
```

Issue #126 / SEC-004 remains open because formal post-remediation Security Diff Scan finalization is blocked by Codex Security tooling failures. This is not recorded as a clean scan verdict and does not imply a newly discovered repository vulnerability.

## Still Deferred / Not Claimed

Phase 4 has not yet delivered:

- Retrieval assignment / acceptance / decline / reassignment;
- `REQUESTED -> RETRIEVING` and Retrieval key checkout;
- `RETRIEVING -> READY`;
- handoff verification / one-time QR / pickup code execution;
- final key `RELEASED` custody and `COMPLETED` session;
- Maps/GPS/tracking/geofences;
- full messaging-provider delivery;
- full payment/validation/refund workflows;
- Dashboard or Employee UI/PWA implementation;
- offline replay/idempotency infrastructure;
- V2/Enterprise capabilities.

## Exact Next Step

Prepare a **fresh focused decision and implementation issue for VAL-006C — Retrieval Dispatch Composition** from the current post-VAL-006B authority.

VAL-006C must reuse the existing Hybrid Dispatch command surface and DEC-032/DEC-035 rules, extend it only as required for `Task.type = RETRIEVAL`, keep `ValetSession.state = REQUESTED` and `RetrievalRequest.status = OPEN` unchanged during assignment/acceptance/decline/reassignment, and introduce no GPS, key checkout, physical Retrieval transition, READY, handoff, payment or UI behavior.
