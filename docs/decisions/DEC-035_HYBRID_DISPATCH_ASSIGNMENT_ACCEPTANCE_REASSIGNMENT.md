# DEC-035 — Hybrid Dispatch Assignment / Acceptance / Reassignment

Status: Accepted  
Date: 2026-08-12  
Issue: #101 (`VAL-005E — Hybrid Dispatch Assignment / Acceptance / Reassignment`)

## Context

VAL-005D / DEC-034 established the authoritative `Task` current projection, append-only `DispatchEvent` history, exact tenant/Location/session/membership integrity, optimistic `Task.version`, and the database partial uniqueness boundary for active intended work.

VAL-005B / DEC-032 already provides the reusable transaction-aware operational eligibility boundary for staff work at a Location. VAL-005E must consume that boundary rather than recreate Shift or membership eligibility.

VAL-005E owns Hybrid Dispatch assignment/acceptance/decline/reassignment behavior only. It must not pull Start Parking, Confirm Parked, GPS/maps, Retrieval, payment, handoff, payroll, dashboard or employee UI work forward.

## Decision

### 1. Scope

VAL-005E implements:

- Parking Task queue/read surface needed by the employee workflow;
- initial Parking Task creation/queueing where the post-check-in operation requires one;
- deterministic basic assignment/suggestion using currently authoritative inputs;
- staff self-accept;
- staff self-decline;
- supervisor reassignment;
- append-only `DispatchEvent` history for those mutations;
- required `AuditEvent` writes for protected assignment mutations;
- `Task.version` concurrency;
- integration of canonical open Task ownership with normal Shift end so a Shift cannot end while that membership still owns nonterminal work.

VAL-005E adds no new database migration and does not modify the Prisma schema.

Exactly 20 forward-only migrations remain present and immutable.

### 2. Canonical ownership

`Task.current_assignee_membership_id` is the only canonical current Hybrid Dispatch owner.

Do not read or write `ValetSession.current_assignee_membership_id` as assignment authority and do not synchronize it in this slice.

### 3. Phase-3 Task type

Public VAL-005E operational commands act on `TaskType.PARKING` only.

`TaskType.RETRIEVAL` remains persistence compatibility for later Phase 4 and is not exposed as a Phase-3 Retrieval workflow.

### 4. Parking Task creation / queueing

For an eligible post-check-in Parking operation, the service may create or return the single active `PARKING` Task for the ValetSession.

New Parking Tasks begin:

```text
status = QUEUED
current_assignee_membership_id = NULL
version = 1
```

and append exactly one `DispatchEvent(QUEUED)` for the real creation.

The partial unique index from DEC-034 is final authority against duplicate active `(valet_session_id, PARKING)` work.

A concurrent loser must recover outside the failed PostgreSQL statement/transaction as required and return/classify the authoritative active Task without leaking raw constraint names.

No duplicate queue event is emitted for a semantic retry that finds the existing active Parking Task.

### 5. Queue read scope

Staff queue reads are Location-scoped and server-authorized.

The client may identify only the target Location/query parameters needed for the read; Organization, membership, role and Shift authority are server-derived.

The caller must satisfy current DEC-032 operational eligibility for that Location.

The queue returns only Phase-3 Parking Tasks in operationally relevant nonterminal states and must not expose another Organization or Location.

The response must not expose exact key-slot or parking-location data that is unnecessary for task selection.

### 6. Initial assignment authorization

An initial assignment mutation may be executed only by an authenticated operational staff actor whose persisted membership is one of:

- `VALET_SUPERVISOR` for assignment to another eligible staff member;
- `VALET_EMPLOYEE` or `VALET_SUPERVISOR` when assigning the Task to self through the accepted self-claim path.

`ORG_ADMIN` and `LOCATION_MANAGER` do not inherit field-operation assignment permission implicitly.

The target assignee must be resolved from persisted membership state and must satisfy DEC-032 operational eligibility at the Task Location inside the same transaction as the Task mutation.

No client-supplied Organization, actor, role, Shift or eligibility claim is authoritative.

### 7. Basic assignment/suggestion inputs

The MVP assignment ranking may use only currently authoritative inputs that already exist:

1. exact Task Location / Organization scope;
2. DEC-032 current operational eligibility at that Location;
3. current open Task load from canonical `Task` rows;
4. deterministic tie-breaking.

If no authoritative proximity/location data exists, proximity contributes no score and must not block assignment.

VAL-005E does not add GPS collection, tracking, maps, geofences or speculative Zone-access persistence.

No AI/safety score or V2/Enterprise signal may be introduced.

### 8. Deterministic load ranking

For automatic/basic suggestion among eligible members, compare current nonterminal owned Task count at the Task Location using statuses:

```text
ASSIGNED
ACCEPTED
IN_PROGRESS
```

Lower load ranks first.

Ties must be resolved deterministically by a stable persisted identifier rather than random choice.

`QUEUED` Tasks have no owner and therefore do not count toward a member's current owned load.

### 9. Assignment transition

Initial assignment requires current persisted Task state exactly:

```text
QUEUED
```

and `current_assignee_membership_id IS NULL`.

It changes the Task to:

```text
ASSIGNED
current_assignee_membership_id = target membership
version = previous version + 1
```

and appends exactly one `DispatchEvent(ASSIGNED)` with `new_assignee_membership_id` equal to the target assignee.

The protected Task mutation and required Dispatch/Audit history commit atomically.

### 10. Optimistic concurrency

All contested public Task mutations require `expectedVersion` matching persisted `Task.version`.

A successful real current-projection mutation increments `Task.version` exactly once.

Stale version returns stable `VERSION_CONFLICT` before state-specific mutation semantics are applied.

No second version/idempotency field is introduced.

### 11. Self-accept

Only the Task's current assignee may accept.

Inside the same transaction the implementation must prove:

- caller resolves to the current assignee membership;
- Task is at the caller's authorized Location;
- caller remains DEC-032 operationally eligible at that Location;
- Task status is exactly `ASSIGNED`;
- expected version matches.

Success performs:

```text
ASSIGNED -> ACCEPTED
```

retains the same current assignee, increments version exactly once, appends `DispatchEvent(ACCEPTED)` with that assignee as the new/current assignee, and appends the required AuditEvent atomically.

### 12. Self-decline

Only the Task's current assignee may decline an `ASSIGNED` Task before acceptance.

Decline requires current DEC-032 operational eligibility and matching expected version.

A decline reason is optional at this stage but, when provided, must be trimmed and bounded by the shared request contract; blank-after-trim is treated as absent.

Success performs:

```text
ASSIGNED -> QUEUED
current_assignee_membership_id -> NULL
```

increments version exactly once and appends:

```text
DispatchEvent(DECLINED)
previous_assignee_membership_id = declining assignee
new_assignee_membership_id = NULL
```

with any accepted bounded reason.

The current Task projection is not replaced with a new Task row.

### 13. Supervisor reassignment

Only current `VALET_SUPERVISOR` operational membership may reassign another Task owner within the same authorized Task Location.

The target assignee must satisfy DEC-032 operational eligibility inside the same transaction as reassignment.

Reassignment applies to Task status:

```text
ASSIGNED
ACCEPTED
```

It does not apply to `IN_PROGRESS`; physical in-progress parking handoff requires a later focused contract rather than silently changing custody while parking is underway.

Supervisor reassignment requires a non-empty trimmed bounded reason.

The target assignee must differ from the current assignee.

Success:

- preserves the current Task status (`ASSIGNED` remains `ASSIGNED`; `ACCEPTED` remains `ACCEPTED`);
- replaces `current_assignee_membership_id` with the new eligible membership;
- increments Task.version exactly once;
- appends one `DispatchEvent(REASSIGNED)` with previous/new assignee, supervisor actor and reason;
- appends the required AuditEvent atomically.

A same-assignee request is rejected as a stable conflict/validation error; it is not recorded as a reassignment event.

### 14. Authorization order

For every protected mutation, authorization and resource scope must be proven before mutation.

The implementation must not leak cross-tenant Task existence through different error responses.

For an already-authorized Task resource, error precedence is:

1. `VERSION_CONFLICT`;
2. invalid Task status/transition;
3. target-assignee eligibility/conflict validation.

### 15. Transaction and locking boundary

Task mutation commands use one PostgreSQL transaction.

Within that transaction they must:

- lock/read the authoritative Task row;
- resolve authoritative actor membership and Task scope;
- consume `lockShiftOperationalEligibility(...)` or the repository's canonical DEC-032 equivalent for every member whose current operational eligibility is required by the command;
- perform current-load reads/locks needed for deterministic assignment without splitting authorization and mutation across transactions;
- write the Task projection and Dispatch/Audit events atomically.

No HTTP call or pre-transaction boolean eligibility check substitutes for this boundary.

### 16. Audit events

Protected real mutations append one corresponding `AuditEvent` in the same transaction.

Use narrow event names:

```text
TASK_ASSIGNED
TASK_ACCEPTED
TASK_DECLINED
TASK_REASSIGNED
```

Task creation/queueing may append `TASK_QUEUED` when the repository's Audit policy treats queue creation as a protected operational mutation; the implementation must use one consistent rule and test it.

Audit metadata must remain narrow: task/session identifiers, previous/new assignee facts, from/to version/status and bounded reason where applicable.

Do not persist auth headers, cookies, bearer credentials, guest secrets, QR secrets, arbitrary request bodies or sensitive PII.

### 17. Shift-end open-work guard

After VAL-005E, normal self-end of Shift must not strand canonical open Task ownership.

Before the Shift `ACTIVE -> ENDED` mutation commits, the same protected transaction must prove the Shift's membership owns no Task at that Location with status:

```text
ASSIGNED
ACCEPTED
IN_PROGRESS
```

If open work exists, return stable conflict `OPEN_TASK_HANDOFF_REQUIRED` and do not end the Shift.

A Task must first be declined/reassigned/completed according to its accepted lifecycle.

No force-end or administrative bypass is introduced in VAL-005E.

### 18. Public API surface

Use strict shared Zod request/response contracts under `packages/contracts` and thin NestJS feature wiring.

The focused staff route family is:

```text
POST /v1/staff/valet-sessions/:sessionId/parking-task/queue
GET  /v1/staff/tasks/queue?locationId=<uuid>
POST /v1/staff/tasks/:taskId/assign
POST /v1/staff/tasks/:taskId/accept
POST /v1/staff/tasks/:taskId/decline
POST /v1/staff/tasks/:taskId/reassign
```

`assign` accepts a target assignee membership identifier when the actor is a supervisor; self-claim may omit it or use the actor's own membership according to one strict shared contract.

Every contested mutation carries `expectedVersion` except first-time queue creation, whose duplicate-active-work protection is database/state based.

No generic PATCH endpoint is allowed.

### 19. Stable public errors

Reuse existing authorization concealment and `VERSION_CONFLICT` behavior.

Add narrow stable errors as needed, including:

```text
TASK_NOT_FOUND_OR_FORBIDDEN
TASK_INVALID_STATE
TASK_ASSIGNEE_NOT_ELIGIBLE
TASK_REASSIGN_REASON_REQUIRED
TASK_ASSIGNMENT_CONFLICT
OPEN_TASK_HANDOFF_REQUIRED
```

Raw PostgreSQL constraint names/errors must never become public API responses.

### 20. No physical parking transition

VAL-005E never changes ValetSession physical state.

It does not set `parking_started_at`, Zone/Spot, or `parked_at` and does not emit KeyCustodyEvent checkout/return facts.

Ownership remains:

- VAL-005F: accepted Parking Task `-> IN_PROGRESS`, `AWAITING_PARKING -> PARKING`, key `CHECKED_OUT`;
- VAL-005G: Parking Task `-> COMPLETED`, `PARKING -> PARKED`, Zone/Spot proof, key `RETURNED_TO_SLOT`.

### 21. No GPS / Retrieval / later-phase leakage

Do not add:

- GPS capture or storage;
- maps/geofences;
- continuous employee tracking;
- Retrieval Task APIs/behavior;
- payment/handoff/payroll;
- employee/dashboard UI;
- offline replay infrastructure;
- timeout/requeue scheduler/policy;
- AI assignment or V2/Enterprise scoring.

### 22. Required proof

Implementation must prove at minimum:

- migrations remain exactly 20 and Prisma schema is unchanged;
- queue creation is concurrency-safe and does not duplicate active Parking Tasks/events;
- queue reads are tenant/Location isolated and operationally authorized;
- initial assignment requires eligible target membership and expected version;
- self-accept only by the current assignee;
- self-decline returns Task to QUEUED without rewriting history;
- supervisor reassignment works for ASSIGNED and ACCEPTED only;
- supervisor reason is required and bounded;
- same-assignee reassignment is rejected;
- ineligible/revoked/ended-Shift target cannot be assigned or reassigned;
- eligibility race cannot commit after a competing Shift end/revocation wins;
- load ranking is deterministic and based on canonical open Task ownership;
- stale Task versions cannot mutate even if requested state now appears semantically equivalent;
- every real mutation increments version exactly once;
- DispatchEvent ordering/content is correct;
- required AuditEvent writes are atomic with Task mutation;
- rollback leaves no partial Task/Dispatch/Audit effects;
- Shift end rejects with open canonical Task ownership and succeeds after handoff;
- no ValetSession physical transition occurs;
- no KeyCustodyEvent checkout/return occurs;
- no Retrieval/GPS/maps/payment/handoff/payroll/UI behavior is introduced;
- authored code respects the repository 300-line policy.

## Consequences

VAL-005E establishes a small, auditable Hybrid Dispatch command layer over the durable persistence added by VAL-005D while preserving the separation between work assignment and physical vehicle custody. It intentionally leaves physical parking execution to VAL-005F/VAL-005G and later product stages to their own focused slices.
