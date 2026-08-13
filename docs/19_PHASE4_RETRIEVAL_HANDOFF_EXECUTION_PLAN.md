# Phase 4 Retrieval & Secure Handoff Execution Plan

Status: Binding execution plan  
Version: 1.0  
Date: 2026-08-12

## Purpose

This document locks the implementation sequence and product invariants for **Phase 4 — Retrieval, guest progression and secure handoff**.

It is an execution bridge, not a replacement for the Founder & Product Blueprint v1.0 or focused Accepted decisions. Exact command, persistence, authorization, concurrency, policy, anti-abuse and API semantics still require a focused Accepted decision before implementation whenever they are not already locked by a higher-authority source.

Phase 4 begins from the completed Phase 3 operational baseline and must extend the real vehicle journey from `PARKED` through secure release and `COMPLETED` without pulling Maps/GPS, full Payments, Dashboard implementation, Reliability/offline, or V2/Enterprise work forward.

## Authority and reviewed sources

Implementation must follow the authority order in `AGENTS.md`.

This plan was reconciled against:

- `AGENTS.md`
- `docs/15_BLUEPRINT_V1_REBASELINE.md`
- `docs/01_PRODUCT_SCOPE.md`
- `docs/04_VALET_SESSION_STATE_MACHINE.md`
- `docs/03_DATABASE_SCHEMA.md`
- `docs/02_DOMAIN_MODEL.md`
- `docs/06_SECURITY_AND_DATA_RULES.md`
- `docs/13_COLLABORATION_WORKFLOW.md`
- `docs/18_PHASE3_OPERATIONS_EXECUTION_PLAN.md`
- Accepted DEC-031 through DEC-038
- Founder & Product Blueprint v1.0 sections 04, 05, 06, 07, 09, 10, 12, 15, 16, 17, 25, 26 and Appendix A

## Phase 4 objective

Make the retrieval and release operation executable after a vehicle is safely parked:

```text
PARKED
  -> REQUESTED
  -> RETRIEVING
  -> READY
  -> HANDOFF_PENDING
  -> COMPLETED
```

Task/Dispatch state remains separate:

```text
QUEUED
  -> ASSIGNED
  -> ACCEPTED
  -> IN_PROGRESS
  -> COMPLETED
```

The Phase 4 endpoint is a securely completed custody session with:

- one authoritative active RetrievalRequest at a time;
- one authoritative active Retrieval Task at a time;
- guest request progression without exposing exact operational details;
- retrieval assignment through the existing Hybrid Dispatch model;
- valid Shift/Location/task ownership for operational employee commands;
- retrieval key checkout and final custody release history;
- secure one-time handoff verification or authorized audited override;
- append-only Dispatch, custody and Audit/Black Box history;
- terminal `ValetSession.state = COMPLETED`;
- completed RetrievalRequest and Retrieval Task.

## Existing persistence that Phase 4 must reuse

Phase 4 does **not** begin from an empty schema.

Existing repository persistence already includes:

- `RetrievalRequest` with requester type, status, requester identity and server-time fields;
- a PostgreSQL partial unique index preventing more than one active `OPEN`/`ACCEPTED` RetrievalRequest per ValetSession;
- `Task.type = RETRIEVAL` support and the Phase 3 active-task uniqueness boundary;
- append-only `DispatchEvent` history;
- `HandoffVerification` with methods `PICKUP_CODE`, `DYNAMIC_QR`, and `SUPERVISOR_OVERRIDE`;
- hashed handoff secret storage, expiry, attempt count, max attempts, verification and consumption fields;
- supervisor override actor/reason persistence guards;
- `KeyCustodyEventType.RELEASED` persistence compatibility;
- ValetSession fields/timestamps for retrieval request, retrieval start, ready, handoff pending and completion.

Therefore the first Phase 4 slice is a **persistence hardening and contract-lock review**, not a greenfield foundation rewrite.

If the accepted Phase 4 command contracts reveal a missing database invariant, add only a new forward-only migration through the focused task that owns that invariant. Existing migrations remain immutable.

## Binding product invariants

### 1. Physical custody and Dispatch remain separate

Do not add assignment states to `ValetSession`.

`REQUESTED` means a valid retrieval request exists. Assignment/acceptance/reassignment belongs to `Task` and `DispatchEvent`.

`Task.current_assignee_membership_id` remains the canonical current Task owner.

### 2. Guest request is authenticated by the existing guest-access boundary

Guest/Customer is not an OrganizationMembership.

Guest retrieval commands must derive Organization, Location, Customer and ValetSession scope from the authorized guest credential/session boundary. Do not trust client-supplied tenant/location/customer ownership fields.

Guest responses must not expose exact KeySlot, Parking Zone/Spot, employee GPS, internal assignment details, internal audit metadata, or reusable secrets.

### 3. Duplicate retrieval work is forbidden

Repeated guest presses must not create competing active RetrievalRequests or Retrieval Tasks.

The existing partial unique constraints are authoritative persistence protections and must be composed transactionally with request creation and state transition semantics.

A semantic retry should return/show the current active retrieval operation when the focused contract can safely identify it; it must not create a second active operation.

### 4. Retrieval uses the existing Hybrid Dispatch model

Do not build a separate retrieval-only assignment system.

Retrieval Task assignment must reuse the accepted Task/Dispatch contracts from Phase 3, including:

- tenant/Location isolation;
- active Shift/operational eligibility;
- current workload input;
- assignment/accept/decline/reassign concurrency protections;
- supervisor reassignment history and reason rules.

GPS proximity may become an optional later input in Phase 5; it is not a Phase 4 blocker.

### 5. Retrieval key checkout is part of the protected transition

Starting Retrieval must establish valid key custody and record checkout actor/time according to the accepted command contract.

Do not expose a loose public key-checkout endpoint merely to make the flow convenient if the custody event belongs atomically with `REQUESTED -> RETRIEVING`.

### 6. READY is the canonical staged state

Use `READY`, not a new `STAGED` ValetSession enum.

Marking the vehicle ready ends the Phase 4 retrieval movement operation and prepares secure handoff.

Exact staging Zone/Spot behavior belongs to a focused operational contract if needed; do not invent a new physical-state enum.

### 7. Secure handoff is mandatory for normal release

Standard handoff accepts one configured allowed method:

- Dynamic one-time QR; or
- 4-digit pickup code.

A successful reusable/bearer secret must never be stored in plaintext.

Verification secrets must expire, be attempt/rate limited where applicable, and be single-use.

A successful handoff verification must not be reusable after consumption or after session completion.

### 8. Supervisor override is exceptional

Supervisor override is not a normal shortcut.

It requires:

- authorized role/permission;
- same tenant/Location scope;
- non-empty reason;
- actor identity;
- server-authoritative timestamp;
- append-only Audit/Black Box evidence.

DEC-042 limits override to an actively shifted, explicitly authorized
same-Location `VALET_SUPERVISOR`. It is valid only after explicit initiation has
placed the session in `HANDOFF_PENDING`; it never performs
`READY -> HANDOFF_PENDING`. When the current Task owner is unavailable, existing
audited Dispatch/reassignment commands establish a new owner before initiation.

### 9. Payment remains a separate lifecycle

Phase 4 must not implement the full Phase 6 Payments workflow early.

However, handoff must not bypass an already-authoritative payment/validation precondition. If the current payment foundation or later accepted policy says release is blocked, Phase 4 must compose with that guard rather than silently weakening it.

If no Phase 4-safe payment policy is yet authoritative, record the dependency and keep payment behavior outside this phase instead of inventing a bypass.

### 10. Notifications are event-ready, not provider-complete

The Blueprint includes Requested/Ready guest progression and notification messages in the retrieval journey.

Phase 4 should produce the authoritative domain events/status projections needed for guest progression and later messaging delivery.

Do not pull full messaging-provider delivery, retry infrastructure, template management or offline reliability into Phase 4 unless a focused accepted task explicitly scopes it.

### 11. Black Box history is append-only

Important retrieval and handoff operations must preserve explainability, including where applicable:

- retrieval requested;
- Retrieval Task queued/assigned/accepted/reassigned;
- key checked out;
- retrieval started;
- vehicle ready;
- handoff initiated;
- verification success or authorized override;
- vehicle released;
- RetrievalRequest/Task completed;
- session completed.

Corrections create new events; old history is never rewritten to hide mistakes.

### 12. Phase 4 remains inside sellable MVP

Do not introduce:

- Predictive Retrieval;
- VAYLET Qualified/Safety Score assignment;
- ClaimShield full;
- Smart Key Vault or NFC/BLE keys;
- POS/PMS integration;
- permanent employee tracking;
- advanced AI/optimization;
- full Dashboard implementation;
- advanced analytics/BI.

## Phase 4 focused task sequence

### VAL-006A — Retrieval & Handoff Persistence Hardening / Contract Lock

Purpose:

- review existing `RetrievalRequest`, `HandoffVerification`, `Task(RETRIEVAL)`, ValetSession retrieval timestamps and custody persistence against the accepted Phase 4 flow;
- lock any missing database invariant required before commands are safe;
- preserve existing migrations; add a new migration only if the accepted decision proves a real missing invariant;
- define exact active/terminal RetrievalRequest semantics and handoff-verification lifecycle compatibility for later slices.

Must not implement guest request API, retrieval commands, Dispatch behavior, verification execution, Maps, Payments or UI.

### VAL-006B — Guest Retrieval Request + Duplicate Protection

Purpose:

- authorized guest request from a valid guest session boundary;
- `PARKED -> REQUESTED`;
- set `retrieval_requested_at` server-authoritatively;
- create/open one RetrievalRequest;
- create/queue one `RETRIEVAL` Task using the shared Task model;
- atomically preserve required Audit/Black Box history;
- repeated presses do not create duplicate active request/task work;
- return a guest-safe current progression representation.

This slice must explicitly define concurrency, semantic retry behavior, guest anti-abuse interaction and error precedence.

### VAL-006C — Retrieval Dispatch Composition

Purpose:

- make Retrieval Tasks fully consumable by the existing Hybrid Dispatch command surface;
- reuse Shift/Location eligibility and Task ownership rules;
- assignment, acceptance, decline and supervisor reassignment remain auditable;
- ensure RetrievalRequest/ValetSession physical state is not mutated merely by assignment;
- prove retrieval queue behavior and no competing active owner.

No GPS proximity implementation.

### VAL-006D — Start Retrieval + Key Checkout

Purpose:

- accepted/authorized Retrieval Task owner starts physical retrieval;
- validate active RetrievalRequest and canonical Task ownership;
- record required key `CHECKED_OUT` custody event atomically with the protected transition;
- `REQUESTED -> RETRIEVING`;
- set `retrieval_started_at`;
- move Retrieval Task to `IN_PROGRESS` consistently;
- preserve version/concurrency protections and required Dispatch/Audit events.

No route/GPS tracking implementation.

### VAL-006E — Mark Vehicle Ready + Guest Progression Events

Purpose:

- authorized in-progress Retrieval Task owner marks the vehicle physically ready;
- `RETRIEVING -> READY`;
- set `ready_at`;
- preserve Task/Dispatch consistency without completing the Task early unless the focused contract explicitly proves that boundary;
- append required Audit/Black Box events;
- expose guest-safe `Ready` progression data;
- create the authoritative event/status integration point for later Ready notification delivery.

No messaging-provider implementation.

### VAL-006F — Secure Handoff Verification

Purpose:

- `READY -> HANDOFF_PENDING` through an explicit command;
- issue/activate the accepted handoff verification material according to the focused contract;
- support Dynamic one-time QR and 4-digit pickup code as Standard methods;
- verify hashed secrets without logging plaintext material;
- enforce expiry, attempt/rate-limit and single-use semantics;
- support authorized reasoned supervisor override;
- allow safe abort `HANDOFF_PENDING -> READY` where the accepted contract permits;
- preserve guest/staff privacy and audit requirements.

DEC-042 locks typed Company default -> Location override method policy,
guest-bearer issue/display, current Task-owner verification, 10-minute pickup
code, 2-minute Dynamic QR, five attempts per proof and durable session-wide
anti-abuse across rotations. Verification leaves Task `IN_PROGRESS` and
RetrievalRequest `ACCEPTED`.

This slice does not complete the custody session yet unless the focused decision explicitly combines verification and completion atomically; default planning keeps final release in VAL-006G for reviewability.

### VAL-006G — Vehicle Release + Session Completion

Purpose:

- re-evaluate current effective handoff-method policy and require a still-valid,
  unconsumed, unexpired, currently allowed Standard verification or a valid
  unconsumed audited supervisor override;
- enforce releasing employee authority and current vehicle/session identity;
- enforce any already-authoritative payment/validation or blocking-incident guard without implementing those later feature lifecycles;
- `HANDOFF_PENDING -> COMPLETED`;
- set `completed_at` and completing/releasing actor;
- consume verification atomically;
- record final key custody `RELEASED` according to the accepted physical workflow;
- complete RetrievalRequest and Retrieval Task consistently;
- append vehicle-released and session-completed Black Box/Audit history;
- make the session terminal.

No receipt/rating/payment implementation beyond safe integration boundaries.

### VAL-006H — Phase 4 API / Integration / Guest + Employee E2E Gate

Purpose:

Prove the real production-composed flow from the completed Phase 3 baseline:

```text
PARKED
-> guest request
-> REQUESTED
-> Retrieval task queue / assignment / acceptance
-> key checkout
-> RETRIEVING
-> READY
-> HANDOFF_PENDING
-> secure QR/code verification OR authorized override case
-> vehicle release
-> COMPLETED
```

The gate must prove at minimum:

- real guest credential authority and guest-safe responses;
- duplicate request/task protection under repeat/concurrent request attempts;
- real PostgreSQL persistence;
- Staff bearer authority for employee operations;
- tenant/Location isolation;
- Shift eligibility;
- canonical Task ownership;
- retrieval assignment/reassignment history;
- key checkout/release custody history;
- optimistic concurrency/version propagation where required;
- single-use/expired/invalid verification rejection;
- supervisor override audit semantics;
- append-only Dispatch/Custody/Audit history;
- final `ValetSession.state = COMPLETED`;
- final RetrievalRequest/Task terminal consistency;
- no guest exposure of KeySlot, exact Zone/Spot, assignee internals, GPS or verification secrets;
- repository structure/300-line architecture gate and required CI.

Phase 4 closes only when every required slice is merged and the full gate passes.

## Exception flows owned or constrained by Phase 4

### Duplicate request

Must be handled in VAL-006B. Repeated presses return/show the current active retrieval operation rather than create competing work.

### Early cancellation before Retrieval starts

The binding state machine permits:

```text
REQUESTED -> PARKED
```

through an explicit audited cancellation command before Retrieval begins.

The exact ownership, request/task cancellation and retry semantics must be locked by a focused Accepted decision. It may be implemented in the slice whose command boundary best owns it, but it must not be silently omitted from the Phase 4 accepted flow.

### Cancellation after Retrieval starts

Do not invent a direct reset.

The binding state machine allows `RETRIEVING -> PARKING` only through an explicit focused return-to-parking exception contract. If that behavior is not required to close the normal Phase 4 gate, it may remain a documented follow-up rather than expanding the happy-path slices.

### Wrong key / wrong vehicle / verification mismatch

Unsafe completion must fail closed. Existing/future Incident state remains separate from ValetSession physical state. Phase 4 must preserve a safe integration boundary without implementing full incident/ClaimShield work.

### Handoff aborted before release

The state machine permits:

```text
HANDOFF_PENDING -> READY
```

through an explicit safe abort command. The focused handoff decision must lock verification invalidation/rotation semantics for this case.

## Explicitly deferred after Phase 4

### Phase 5 — Maps & task-scoped tracking

- Parking/Retrieval tracking;
- route history;
- zones/geofences beyond existing parking-resource use;
- geofence alerts;
- live operations map;
- no continuous whole-shift employee surveillance.

### Phase 6 — Payments / validation / tips

- fee policy;
- customer/venue responsibility;
- cash;
- validation;
- digital gateway;
- tips;
- reconciliation/refunds as scoped.

### Phase 7 — Dashboard / Configuration surfaces

- full management UI;
- live operations views;
- tasks/employees/shifts/keys/maps/payment/policy/reporting modules;
- Configuration First management UX.

### Later Reliability / Pilot hardening

- offline replay/idempotency infrastructure;
- provider delivery retries;
- monitoring/backups/recovery hardening;
- broader load/performance/pilot edge-case work.

## Phase 4 acceptance boundary

Phase 4 is not complete merely because RetrievalRequest and HandoffVerification tables exist.

Phase 4 is complete when the backend/API can safely execute the post-PARKED retrieval and release operation through `COMPLETED` and answer from authoritative history:

- who requested retrieval and through which authorized boundary;
- whether duplicate requests were prevented;
- which Retrieval Task represented the operation;
- who was assigned/accepted/reassigned and why;
- what Shift/Location made the employee eligible;
- who checked out the key and when;
- who physically started Retrieval;
- when the vehicle became READY;
- how secure handoff was verified or who overrode it and why;
- who released the vehicle;
- when the RetrievalRequest, Task and ValetSession completed;
- which append-only events prove the sequence.

## Implementation rule for every VAL-006 slice

Before code:

1. read the assigned GitHub Issue and `AGENTS.md`;
2. read this execution plan and the affected binding docs;
3. read all task-specific Accepted decisions;
4. name affected entities and exact ValetSession / Task transitions;
5. identify authorization, tenant, Location, Shift and guest-access impact;
6. identify database constraints/indexes and whether a new migration is truly required;
7. identify Configuration First/policy impact;
8. identify privacy, anti-abuse, secret-handling and audit impact;
9. inspect intended target-file sizes against `docs/17_AGENT_CODE_STRUCTURE_RULES.md`;
10. if a material semantic is not already locked, create/accept a focused decision before implementing it.

Do not implement a material product choice from chat assumptions alone.
