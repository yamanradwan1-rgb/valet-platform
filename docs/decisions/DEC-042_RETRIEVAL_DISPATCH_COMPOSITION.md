# DEC-042 — Retrieval Dispatch Composition

Status: Proposed  
Date: 2026-08-13  
Issue: #143 (`VAL-006C — Retrieval Dispatch Composition (fresh restart)`)

## Context

Phase 4 is implemented through VAL-006B. The current accepted repository baseline already creates one active `Task(task_type = RETRIEVAL, status = QUEUED)` when a valid guest request atomically moves a parked ValetSession to `REQUESTED`.

The existing Phase 3 Hybrid Dispatch surface already owns current Task assignment semantics:

```text
QUEUED -> ASSIGNED -> ACCEPTED
```

with self-decline back to `QUEUED`, supervisor reassignment for `ASSIGNED`/`ACCEPTED`, optimistic `Task.version`, append-only Dispatch/Audit history, canonical `Task.current_assignee_membership_id`, and DEC-032 Shift/Location eligibility.

However, current implementation details remain PARKING-specific in three important places:

- the internal Task lock/authorization helper rejects non-`PARKING` Tasks;
- the shared staff queue read filters to `task_type = 'PARKING'`;
- the shared Task projection contract allows only `taskType = 'PARKING'`.

VAL-006C must make the RETRIEVAL Task created by VAL-006B consumable by the same accepted Hybrid Dispatch model without creating a second assignment subsystem and without moving physical Retrieval forward.

A previous experimental VAL-006C / DEC-041 path was cancelled and removed from current authority. This decision is a fresh contract based only on the current post-VAL-006B repository state and accepted decisions.

## Decision

### 1. Scope

VAL-006C extends the shared operational Dispatch surface to support exactly these current Task types:

```text
PARKING
RETRIEVAL
```

It implements no new Task lifecycle state and no new assignment subsystem.

The existing shared staff commands remain the only public assignment surface:

```text
GET  /v1/staff/tasks/queue?locationId=<uuid>
POST /v1/staff/tasks/:taskId/assign
POST /v1/staff/tasks/:taskId/accept
POST /v1/staff/tasks/:taskId/decline
POST /v1/staff/tasks/:taskId/reassign
```

No Retrieval-specific assign/accept/decline/reassign route is added.

### 2. Canonical ownership remains unchanged

`Task.current_assignee_membership_id` remains the only canonical current Hybrid Dispatch owner for both PARKING and RETRIEVAL Tasks.

Do not read, write or synchronize `ValetSession.current_assignee_membership_id` as Task authority.

Assignment history remains append-only in `DispatchEvent` and required protected mutations remain auditable through `AuditEvent`.

### 3. Shared Task projection supports both operational types

The shared Task projection contract changes from a PARKING literal to the explicit accepted operational set:

```text
taskType = PARKING | RETRIEVAL
```

All other current projection fields and validation rules remain unchanged unless a narrow implementation requirement is separately justified.

This is an intentional additive API expansion. Existing PARKING responses continue to return `taskType = PARKING` exactly as before.

### 4. One generic Location queue

`GET /v1/staff/tasks/queue?locationId=<uuid>` remains one shared operational queue.

For an authorized current Location, it returns both PARKING and RETRIEVAL Tasks whose status is one of:

```text
QUEUED
ASSIGNED
ACCEPTED
IN_PROGRESS
```

The queue remains:

- tenant/Organization isolated;
- Location scoped;
- protected by current DEC-032 operational eligibility;
- guest-internal-detail safe;
- deterministically ordered by the repository's existing stable queue ordering unless a later accepted priority contract changes it.

VAL-006C adds no client-selectable task-type filter and no Retrieval priority field.

### 5. Shared operational Task authorization

The PARKING-only internal lock/authorization boundary must be narrowly generalized into a shared operational Task boundary that accepts only:

```text
PARKING
RETRIEVAL
```

Unsupported/future Task types must fail through the existing concealed `TASK_NOT_FOUND_OR_FORBIDDEN` boundary rather than becoming implicitly dispatchable.

The generalization must preserve existing PARKING authorization semantics exactly.

### 6. Assignment semantics remain DEC-035 semantics

For both supported Task types, initial assignment still requires:

```text
Task.status = QUEUED
current_assignee_membership_id = NULL
matching expectedVersion
```

The actor and target must satisfy the same accepted role, tenant, Location and DEC-032 current operational eligibility rules already used by PARKING.

Success remains:

```text
QUEUED -> ASSIGNED
current_assignee_membership_id = target membership
Task.version += 1
DispatchEvent(ASSIGNED)
AuditEvent(TASK_ASSIGNED)
```

No RETRIEVAL-specific assignment state is introduced.

### 7. Acceptance semantics remain DEC-035 semantics

Only the current canonical assignee may accept a Task.

For RETRIEVAL exactly as for PARKING:

```text
ASSIGNED -> ACCEPTED
```

The same assignee is retained, `Task.version` increments once, and accepted Dispatch/Audit history is appended atomically.

Acceptance of a RETRIEVAL Task does not mean physical Retrieval has started.

### 8. Decline semantics remain DEC-035 semantics

Only the current assignee may decline an `ASSIGNED` Task before acceptance.

For RETRIEVAL exactly as for PARKING:

```text
ASSIGNED -> QUEUED
current_assignee_membership_id -> NULL
```

The current Task row is preserved, version increments once, and the append-only `DECLINED` history preserves previous assignee and bounded optional reason.

Decline is not Retrieval cancellation and does not move the ValetSession back to `PARKED`.

### 9. Supervisor reassignment semantics remain DEC-035 semantics

A current operational `VALET_SUPERVISOR` may reassign a supported Task in:

```text
ASSIGNED
ACCEPTED
```

using the same accepted target-eligibility, different-assignee, non-empty bounded reason, optimistic-version and append-only history rules.

`IN_PROGRESS` reassignment remains forbidden by this slice.

VAL-006C does not invent a special Retrieval handoff while physical Retrieval is underway.

### 10. Automatic/basic ranking is shared operational load

The existing deterministic automatic assignment ranking remains authoritative.

Eligible assignees are ranked by current canonical owned open Task load at the Task Location using:

```text
ASSIGNED
ACCEPTED
IN_PROGRESS
```

The load intentionally counts both supported operational Task types, PARKING and RETRIEVAL.

This treats current employee operational workload as one shared queue rather than creating separate per-type load silos.

Ties remain deterministic by stable persisted identifier.

No GPS, distance, Zone proximity, AI score, safety score or predictive signal is introduced.

### 11. RETRIEVAL physical state remains unchanged during Dispatch composition

For every VAL-006C RETRIEVAL queue/assignment/acceptance/decline/reassignment operation:

```text
ValetSession.state = REQUESTED
RetrievalRequest.status = OPEN
```

must remain unchanged.

VAL-006C does not set or change:

- `retrieval_started_at`;
- `ready_at`;
- handoff timestamps;
- completion timestamps;
- ParkingSpot/Zone state;
- KeySlot assignment;
- key custody state.

Physical Retrieval begins only in VAL-006D.

### 12. No key checkout in VAL-006C

No VAL-006C command emits `KeyCustodyEvent(CHECKED_OUT)` or otherwise changes current key custody.

Key checkout belongs atomically with the accepted Start Retrieval transition in VAL-006D.

A loose public key-checkout endpoint must not be added as part of Dispatch composition.

### 13. RetrievalRequest remains request authority, not Dispatch ownership

The active `RetrievalRequest` remains the business record that Retrieval was requested.

Its `OPEN` status does not duplicate Task assignment status and must not be used as current employee ownership.

VAL-006C must not add a direct RetrievalRequest-to-assignee field or a second current-owner field.

`RetrievalRequest.status = OPEN` remains valid through RETRIEVAL Task queue, assignment and acceptance. VAL-006D owns the later transition to physical Retrieval semantics.

### 14. Optimistic concurrency and error precedence remain shared

Every contested mutation continues to require `expectedVersion` matching persisted `Task.version`.

Every successful real mutation increments `Task.version` exactly once.

For an already-authorized Task, existing precedence remains:

1. `VERSION_CONFLICT`;
2. invalid current Task status/transition;
3. target-assignee eligibility or assignment/reassignment conflict.

Cross-tenant/cross-Location/unsupported-type existence remains concealed through `TASK_NOT_FOUND_OR_FORBIDDEN`.

Raw PostgreSQL errors or constraint names must never be exposed.

### 15. Shift-end open-work guard remains generic

The existing Shift self-end guard already blocks ending a Shift while the membership canonically owns any Task at that Location in:

```text
ASSIGNED
ACCEPTED
IN_PROGRESS
```

VAL-006C preserves this behavior across both PARKING and RETRIEVAL Tasks.

An employee must decline, be reassigned, or complete work through its accepted lifecycle before normal Shift end can succeed.

No force-end bypass is introduced.

### 16. No new persistence or migration

VAL-006C adds no Prisma schema change and no database migration.

The accepted database baseline remains exactly **21 forward-only migrations**.

Migrations 1–21 remain immutable.

The existing `Task`, `DispatchEvent`, `AuditEvent`, `RetrievalRequest` and ValetSession persistence must be reused.

### 17. Architecture ownership

`dispatch` remains the owner of shared Task assignment/query/mutation semantics.

`retrieval` remains the owner of Retrieval business/physical lifecycle commands.

VAL-006C should generalize genuinely shared Dispatch primitives rather than duplicate them inside `retrieval`.

Do not make `dispatch` depend on Retrieval controllers/services merely to recognize `TaskType.RETRIEVAL`.

Keep module dependency direction acyclic and respect DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md`.

New authored code files must remain <=300 physical lines, and existing <=300-line files must not be pushed above the limit.

### 18. Early Retrieval cancellation is not a Task decline

The binding Phase 4 plan permits a separately audited pre-start cancellation:

```text
REQUESTED -> PARKED
```

That behavior is not implemented by VAL-006C and must not be inferred from `Task decline`.

A separate focused accepted cancellation contract must own ValetSession, RetrievalRequest and RETRIEVAL Task cancellation/terminalization semantics before Phase 4 is declared complete if that exception flow is required by the binding plan.

VAL-006C does not silently implement or redefine it.

### 19. Required regression proof

Implementation must prove at minimum:

- authorized Location queue returns both PARKING and RETRIEVAL operational Tasks;
- existing PARKING queue/projection behavior remains valid;
- RETRIEVAL Task projection returns `taskType = RETRIEVAL` through the shared contract;
- unsupported/future Task types are not implicitly dispatchable;
- cross-tenant and cross-Location Task existence remains concealed;
- self-claim/initial assignment requires current DEC-032 eligible actor/target;
- supervisor assignment to another eligible membership works under the same rules as PARKING;
- automatic assignment ranks using canonical combined PARKING + RETRIEVAL open workload;
- current assignee can accept RETRIEVAL `ASSIGNED -> ACCEPTED`;
- current assignee can decline RETRIEVAL `ASSIGNED -> QUEUED` without rewriting history;
- supervisor can reassign RETRIEVAL `ASSIGNED` and `ACCEPTED` with required bounded reason;
- same-assignee reassignment is rejected;
- stale `expectedVersion` cannot mutate RETRIEVAL Tasks;
- every real RETRIEVAL Dispatch mutation increments Task.version exactly once;
- DispatchEvent and AuditEvent writes are atomic and append-only;
- rollback produces no partial Task/Dispatch/Audit mutation;
- `ValetSession.state` remains `REQUESTED` through all VAL-006C RETRIEVAL operations;
- active `RetrievalRequest.status` remains `OPEN` through all VAL-006C RETRIEVAL operations;
- no key `CHECKED_OUT` custody event is emitted;
- no Retrieval physical timestamp is written;
- Shift end is blocked while a membership owns nonterminal RETRIEVAL work and succeeds after valid handoff of ownership;
- exactly 21 migrations remain and migrations 1–21 are unchanged;
- Prisma schema is unchanged;
- no GPS/maps/payment/handoff/READY/UI/offline behavior is introduced;
- full repository lint, architecture, typecheck, tests and build pass.

### 20. Explicitly out of scope

VAL-006C does not implement:

- `REQUESTED -> RETRIEVING`;
- RetrievalRequest physical-start transition;
- key checkout;
- GPS/maps/tracking/proximity;
- early Retrieval cancellation;
- READY progression;
- notification-provider delivery;
- handoff credential issuance or verification;
- supervisor handoff override;
- final key release;
- session completion;
- payment/validation workflows;
- Dashboard/Employee/Guest UI;
- offline replay/idempotency infrastructure;
- predictive/AI dispatch behavior.

## Consequences

- PARKING and RETRIEVAL use one operational Hybrid Dispatch system.
- Current employee workload is evaluated across both operational Task types.
- Existing Phase 3 Dispatch routes and concurrency/authorization semantics are preserved rather than cloned.
- RETRIEVAL assignment remains operational ownership only; physical custody stays at `REQUESTED`/`OPEN` until VAL-006D.
- No new schema or migration is required.
- Later Retrieval physical movement, key checkout, READY and secure handoff remain reviewable as separate focused slices.

## Implementation boundary

No VAL-006C production implementation may begin while this decision remains `Proposed`.

After project-owner acceptance, change this file to `Status: Accepted`, mirror a concise DEC-042 summary into `docs/08_DECISIONS_LOG.md`, merge the documentation gate, then create the VAL-006C implementation branch from the resulting current `main`.
