# Phase 3 Operations Execution Plan

Status: Binding execution plan  
Version: 1.0  
Date: 2026-08-11

## Purpose

This document locks the implementation sequence and product invariants for Phase 3 after a fresh review of the full **VAYLET Founder & Product Blueprint v1.0 (August 2026)**.

It is an execution bridge, not a replacement for the Blueprint or accepted decisions. Exact command, schema, authorization, concurrency and policy semantics still require focused Accepted decisions before implementation where they are not already locked.

Phase 3 must implement the Blueprint's **Operations** stage without pulling Retrieval, Maps, Payments, Dashboard, Reliability or V2/Enterprise work forward.

## Blueprint sections reviewed for this plan

The Phase 3 review specifically reconciles:

- Section 04 - Users and permissions
- Section 05 - Vehicle journey from arrival to handoff
- Section 07 - Valet employee application and Shift Logic
- Section 08 - Key management, parking and maps
- Section 09 - Hybrid Dispatch and task management
- Section 10 - Security, verification and chain of custody
- Section 12 - Configuration First / Location Settings
- Section 15 - Sellable MVP vs V2 / Enterprise
- Section 16 - Business rules and exceptional cases
- Section 17 - Security, privacy and employee GPS principle
- Section 18 - Operational KPIs
- Section 25 - Development order and acceptance criteria
- Section 26 - 12-month roadmap
- Section 27 - Launch checklist
- Appendix A1 - core user stories
- Appendix A2 - principal data entities
- Appendix A3 - proposed Black Box event names
- Appendix A5 - v1.0 decision log

## Phase 3 objective

Make the physical operation executable after successful check-in:

```text
CHECKING_IN
  -> AWAITING_PARKING
  -> PARKING
  -> PARKED
```

The Phase 3 endpoint is a safely parked vehicle with:

- current key custody known;
- controlled parking location known;
- the responsible employee/task history known;
- required Black Box/Audit events appended;
- no duplicate active resource/task ownership;
- no guest exposure of exact key-slot or parking coordinates.

Retrieval begins in Phase 4.

## Binding product invariants

### 1. Physical custody state and Task state are separate

ValetSession represents physical vehicle custody only.

Canonical Task lifecycle:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

Alternative task outcomes/events may later include:

- REASSIGNED
- DECLINED
- CANCELLED
- INCIDENT

Never add ASSIGNED/REASSIGNED task states to ValetSession.

`ValetSession.current_assignee_membership_id` is not the canonical Hybrid Dispatch model. A focused Task/Dispatch decision must define the source of truth and any safe denormalized read fields.

### 2. Employee UX is task-first and fast

The employee surface is an operational terminal, not a mini-dashboard.

Phase 3 backend/API design must support:

- Task Queue
- Key Assignment
- Parking Task
- Parking Spot/Zone

Common employee actions should remain compatible with the Blueprint's 1-3 tap target after opening a task.

Do not force unnecessary form entry where scan or selection is possible.

### 3. Shift and Location eligibility are part of Phase 3 Dispatch

The Blueprint's Shift Logic is binding operational behavior:

- an employee starts a Shift inside a specific Location;
- the employee must not receive tasks for another Location;
- a Supervisor may move/reassign employees according to authorized company/location rules;
- ending a Shift prevents accepting new work after open work is safely handed off/reassigned.

Phase 1 created Shift persistence, but Phase 3 must not invent Hybrid Dispatch availability without a focused operational Shift/eligibility slice.

Exact start/end/handoff command semantics require a focused Accepted decision before implementation.

### 4. QR Key Slots are sellable-MVP behavior

Each Key Slot has an operator-visible identifier/code that may be encoded as a QR.

The normal flow must support fast scan-based identification when assigning a key to a vehicle/session.

A Key Slot may not be concurrently occupied by two active/current vehicle sessions.

Checkout/return custody must preserve actor and server-authoritative time.

QR is resource identification, not employee authentication or tenant authorization.

General employee UX still requires a safe manual fallback where the focused policy/command allows it.

### 5. Key Board state must be explainable from authoritative history

The Blueprint's Key Board presents operational states such as:

- Available
- Occupied
- Checked Out
- Incident

Do not create a second mutable truth merely for display if the state can be derived safely from:

- current KeySlot assignment;
- append-only KeyCustodyEvent history;
- relevant Incident state.

A later Dashboard slice may materialize/read optimized views without rewriting custody history.

### 6. Parking Zones / Spots are controlled resources

Phase 3 requires controlled Parking Zones and Parking Spots.

Blueprint rules:

- a Zone or Spot may have a QR;
- Parking QR is optional in MVP;
- manual Zone/Spot selection remains a fallback;
- exact behavior may depend on typed Location policy;
- a guest never sees the exact parking location.

Do not turn a static Zone/Spot QR into a bearer credential.

### 7. Parking location configuration is Configuration-First, but management UI is later

The Blueprint expects Company Admin / Location Manager to configure operational parking locations from Dashboard without developer intervention.

Phase 3 owns the operational persistence and command integrity needed by parking.

Phase 7 owns the broader management Dashboard/configuration surface unless a focused Phase 3 command requires a narrow typed policy earlier.

Do not build a speculative generic settings blob.

### 8. Hybrid Dispatch basic assignment inputs

The Blueprint's MVP assignment inputs are:

- employee availability;
- correct Location / Zone eligibility;
- current task load;
- approximate proximity only when location permission/data is available;
- Task type: Parking or Retrieval.

Phase 3 implements Parking usage of the Task model.

The shared Task model may support the Blueprint's Parking/Retrieval task types when the focused persistence decision proves that doing so avoids later schema churn, but Phase 3 must not implement Retrieval behavior early.

GPS proximity is optional input, not a Phase 3 blocker. Maps/tracking are Phase 5.

### 9. Reassignment is auditable

Supervisor reassignment must be easy operationally.

If reassignment occurs after acceptance, preserve:

- actor;
- reason;
- previous assignee;
- new assignee;
- server-authoritative time.

Do not rewrite task history to hide the previous assignment.

Timeout/requeue policy is configurable in the Blueprint, but exact timeout semantics must not be invented inside an unrelated task.

### 10. No duplicate active work

The system must prevent duplicate active work for the same intended operation.

A parking operation for one ValetSession must not produce competing active Parking tasks or two simultaneous accepted/in-progress owners.

Concurrency protection must exist at the authoritative persistence/transaction boundary, not only in UI code.

### 11. Key custody is part of the Black Box

The Blueprint's Black Box/chain-of-custody requirement must answer:

- who received the vehicle;
- who had the key and when;
- where the vehicle was placed;
- which employee/task moved it;
- what corrections/incidents occurred.

Important Phase 3 mutations must append their required custody/Task/Audit events atomically with the protected state change where the focused decision requires it.

Corrections append new events. They do not silently edit old history.

### 12. Parking key checkout/return semantics must be explicitly decided

The Blueprint explicitly requires every Key checkout/return to be actor/time recorded. It explicitly names Key Checkout in Retrieval and also requires full key custody throughout Parking.

Before implementing `start-parking` / `confirm-parked`, a focused decision must lock whether Parking key checkout/return is:

- a separate explicit command; or
- an atomic side effect of the parking lifecycle command.

Do not guess this inside implementation.

### 13. Tracking is not Phase 3

Maps + Session Tracking are sellable MVP, but belong to Phase 5 in the repository sequence.

Default Blueprint principle:

- tracking ON only during active Parking/Retrieval tasks when configured;
- tracking OFF outside those tasks;
- no continuous employee surveillance through the whole Shift by default;
- guest does not see exact coordinates.

Phase 3 parking commands may expose safe integration points/timestamps, but must not implement GPS tracking early.

### 14. Security and privacy boundaries remain active

Phase 3 must preserve:

- least privilege;
- tenant isolation;
- Location scope;
- Staff Auth identity;
- append-only sensitive history;
- no secret leakage;
- no exact key-slot/parking-location disclosure to Guest surfaces.

The owner-approved deferral of final security closure / fresh Standard Security Scan before Phase 3 does not remove these implementation requirements and does not mean those reviews were completed.

### 15. No V2/Enterprise leakage

Do not introduce in Phase 3:

- NFC/BLE key tags;
- Smart Key Vault;
- VAYLET Qualified/Safety Score assignment;
- SmartStack AI;
- Predictive Retrieval;
- indoor digital twin;
- permanent employee tracking;
- hardware-specific dependencies.

Build the operating system first.

## Phase 3 focused task sequence

The following is the intended dependency sequence. Each slice requires its own reviewable Issue/PR and focused Accepted decision where semantics are not already locked.

### VAL-005A - Key & Parking Persistence Foundation

Status: COMPLETED / MERGED

Accepted contract: DEC-031. Implementation was merged through PR #86, merge commit `3df5d9755e6c42a568c545fa2436c9a22506b41a`. It is limited to persistence, database integrity, append-only runtime-role grants, deterministic seed support, and focused verification; no command/API/Dispatch behavior is included.

Purpose:

- ParkingZone persistence;
- ParkingSpot -> Zone integrity;
- current ValetSession Zone/Spot fields and same-zone integrity;
- current KeySlot/ParkingSpot exclusivity;
- append-only KeyCustodyEvent persistence;
- runtime-role append-only grants.

No command/API/Dispatch behavior.

### VAL-005B - Shift Operational Eligibility

Status: ACTIVE / CURRENT

Accepted contract: DEC-032 (`docs/decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md`). Issue #88 remains open pending implementation.

Purpose:

- lock/start/end Shift command semantics needed by Dispatch;
- Location-bound employee eligibility;
- safe open-work handoff/reassignment rule before Shift end;
- availability boundary consumed by Task assignment.

Do not build payroll/timekeeping features.

### VAL-005C - Key Assignment & Custody Commands

Purpose:

- assign current KeySlot after check-in;
- scan-first resource identification with safe manual fallback contract;
- concurrency-safe single-slot occupancy;
- actor/time custody history;
- required Audit/Black Box event atomicity;
- correction/reassignment semantics without history rewrite.

No Parking state transition yet.

### VAL-005D - Task / Dispatch Persistence Foundation

Purpose:

- Task entity;
- Task lifecycle/status persistence;
- task type boundary compatible with Parking/Retrieval MVP;
- Dispatch/assignment history entity or equivalent append-only event model;
- one active intended operation protection;
- tenant/location/session integrity.

No assignment algorithm yet.

### VAL-005E - Hybrid Dispatch Assignment / Acceptance / Reassignment

Purpose:

- Task Queue;
- basic system suggestion/assignment;
- Shift/Location/Zone eligibility;
- current-load input;
- optional proximity input only when available;
- accept/decline/reassign concurrency;
- supervisor reassignment actor/reason history.

No GPS tracking implementation.

### VAL-005F - Start Parking

Purpose:

- authorized accepted Parking-task owner starts physical Parking;
- lock required key-custody precondition/side effect according to the focused decision;
- `AWAITING_PARKING -> PARKING`;
- `parking_started_at`;
- version/concurrency protections;
- Task enters IN_PROGRESS consistently;
- required custody/Task/Audit events in the correct transaction boundary.

No route/GPS tracking yet.

### VAL-005G - Confirm Parked

Purpose:

- Zone/Spot assignment/proof;
- QR when used, manual fallback according to accepted policy;
- exact same-tenant/same-Location Zone/Spot integrity;
- responsible actor known;
- key return/custody closure for the Parking operation according to the focused decision;
- `PARKING -> PARKED`;
- `parked_at`;
- Parking Task COMPLETED;
- Black Box/Audit completion events.

Guest receives no exact Zone/Spot/KeySlot detail.

### VAL-005H - Phase 3 API / Integration / Employee Operations Gate

Purpose:

Prove a real authorized employee flow from:

```text
AWAITING_PARKING
-> key assignment
-> Parking task queue/assignment/acceptance
-> PARKING
-> Zone/Spot confirmation
-> PARKED
```

with:

- tenant/Location isolation;
- Shift eligibility;
- no duplicate active tasks;
- no double KeySlot/ParkingSpot occupancy;
- custody history;
- reassignment history;
- 300-line architecture gate;
- task-oriented employee API suitable for the later Employee UI integration.

This task closes Phase 3 only if all required Phase 3 slices are merged and documented.

## Phase 3 acceptance boundary

Phase 3 is not complete merely because Zone/Spot/Key tables exist.

Phase 3 is complete when the backend can safely execute the post-check-in Parking operation through `PARKED` and answer from authoritative history:

- which employee handled the Parking task;
- what Shift/Location made them eligible;
- which KeySlot was assigned;
- who checked out/returned the key when applicable;
- which Zone/Spot contains the vehicle;
- whether the Parking task was reassigned and why;
- when Parking started and completed;
- which append-only events prove the sequence.

## Explicitly deferred after Phase 3

### Phase 4 - Retrieval and secure handoff

- guest request;
- duplicate-request protection;
- Retrieval task using the same Dispatch model;
- retrieval key checkout;
- `REQUESTED -> RETRIEVING -> READY`;
- Dynamic QR / 4-digit pickup code;
- secure handoff and completion.

### Phase 5 - Maps and task-scoped tracking

- map provider;
- GPS/route events;
- geofences;
- live operations map;
- task-scoped tracking only.

### Phase 6 - Payments / validation / cash / tips

No payment lifecycle is encoded in Phase 3 Task or ValetSession state.

### Phase 7 - Dashboard / Configuration First

Management UI for Zones/Spots/Keys/Policies and broader operational configuration.

### Phase 8 - Reliability / offline

Offline queue/sync, stable device operation IDs, reconnect behavior and reliability hardening.

### Phase 9 - Pilot hardening

Full-shift validation, security review, edge cases, launch readiness and KPI proof.

## Implementation warning for agents

Do not treat Phase 3 as "add a Task table and a parking endpoint."

The Blueprint's Phase 3 operation is a coordinated system of:

```text
Shift eligibility
+ Key custody
+ controlled parking location
+ Task / Hybrid Dispatch
+ physical ValetSession transitions
+ append-only Black Box history
```

If a proposed implementation skips one of these boundaries or merges them into a single god service/file, stop and reconcile the design before coding.
