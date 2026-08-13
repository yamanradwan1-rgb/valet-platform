# DEC-041 — Retrieval Dispatch Composition

Status: Accepted  
Date: 2026-08-13  
Issue: #139 (`VAL-006C — Retrieval Dispatch Composition`)

## Context

Phase 4 now has an implemented guest Retrieval request boundary from VAL-006B / DEC-040. A successful first request creates one canonical active Retrieval operation with:

```text
ValetSession.state = REQUESTED
RetrievalRequest.status = OPEN
Task.task_type = RETRIEVAL
Task.status = QUEUED
Task.current_assignee_membership_id = NULL
```

The binding Phase 4 execution plan requires that Retrieval assignment reuse the existing Hybrid Dispatch model rather than create a Retrieval-only assignment system.

The repository already has a mature Phase 3 Hybrid Dispatch implementation under `apps/api/src/modules/dispatch` with:

- Location-scoped staff queue reads;
- deterministic assignment ranking;
- staff self-claim;
- supervisor assignment;
- staff self-accept;
- staff self-decline;
- supervisor reassignment;
- canonical `Task.current_assignee_membership_id` ownership;
- optimistic `Task.version` concurrency;
- DEC-032 transaction-aware Shift operational eligibility;
- append-only DispatchEvent history;
- protected AuditEvent history;
- Shift-end open-work protection.

However, DEC-035 intentionally restricted the public Phase 3 command surface to `TaskType.PARKING` and deferred `TaskType.RETRIEVAL` behavior to Phase 4. The current implementation therefore still contains PARKING-specific restrictions such as `lockParkingTask(...)` and a queue SQL filter of `task_type = 'PARKING'`.

VAL-006C must intentionally broaden that same canonical Hybrid Dispatch surface to Retrieval while preserving all accepted Phase 3 PARKING semantics and keeping Task assignment separate from physical vehicle movement.

## Decision

### 1. VAL-006C extends the existing Hybrid Dispatch system; it does not create a second system

The canonical Dispatch implementation remains the single authority for operational Task assignment and ownership.

The generic assignment command surface supports exactly:

```text
PARKING
RETRIEVAL
```

for the task types currently authorized by accepted product flows.

VAL-006C must not introduce:

- a Retrieval-specific assignment table;
- a Retrieval-specific assignment enum;
- a second queue model;
- a second workload ranking algorithm;
- duplicate Shift eligibility logic;
- Retrieval-only copies of the generic assign/accept/decline/reassign routes.

Future task types are not implicitly authorized merely because they exist in persistence. The supported generic Dispatch task-type set must remain explicit.

### 2. Existing generic task routes are reused

The existing staff routes remain canonical:

```text
GET  /v1/staff/tasks/queue?locationId=<uuid>
POST /v1/staff/tasks/:taskId/assign
POST /v1/staff/tasks/:taskId/accept
POST /v1/staff/tasks/:taskId/decline
POST /v1/staff/tasks/:taskId/reassign
```

Those routes may operate on an authorized `PARKING` or `RETRIEVAL` Task according to the same accepted Dispatch semantics.

No Retrieval-specific duplicate route family is introduced.

The existing Parking queue-creation route remains PARKING-specific:

```text
POST /v1/staff/valet-sessions/:sessionId/parking-task/queue
```

VAL-006C must not repurpose it for Retrieval. VAL-006B already creates the Retrieval Task atomically with the guest request.

### 3. Task projection explicitly exposes supported task type

The shared Task projection must represent the operational task type as:

```text
PARKING | RETRIEVAL
```

This is a contract broadening, not a new projection shape.

Existing response fields, privacy boundaries and stable identifiers remain unchanged except for allowing `RETRIEVAL` where the projection previously accepted only `PARKING`.

### 4. Authorization locking becomes Dispatch-task aware, not Parking-only

The current PARKING-specific task lock/authorization boundary must be generalized narrowly so protected generic Dispatch mutations can authorize exactly the supported task types:

```text
PARKING
RETRIEVAL
```

The generalized boundary must preserve:

- concealed `TASK_NOT_FOUND_OR_FORBIDDEN` behavior;
- Organization isolation;
- Location isolation;
- server-derived actor membership;
- DEC-032 active Shift operational eligibility;
- current Task row locking before mutation;
- current `Task.version` authority.

If a PARKING-specific wrapper remains useful for the PARKING queue-creation command or other Phase 3-only behavior, it may delegate to the generalized lock while still enforcing PARKING where that command contract requires it.

Unsupported future task types must remain rejected by the generic operational mutation surface until explicitly accepted by a later decision.

### 5. Queue read includes operational PARKING and RETRIEVAL Tasks

For an authorized Location, the canonical queue read may return operational nonterminal Tasks with:

```text
task_type IN (PARKING, RETRIEVAL)
```

and statuses already accepted by DEC-035:

```text
QUEUED
ASSIGNED
ACCEPTED
IN_PROGRESS
```

The existing deterministic queue ordering remains authoritative unless an already-accepted contract says otherwise.

The read remains Location-scoped and requires current DEC-032 operational eligibility.

The queue must not expose another Organization/Location or unnecessary KeySlot, exact parking location, GPS, guest credential or internal Audit metadata.

### 6. Initial Retrieval assignment reuses DEC-035 exactly

A queued Retrieval Task begins from the VAL-006B projection:

```text
status = QUEUED
current_assignee_membership_id = NULL
version = 1
```

Initial assignment requires matching `expectedVersion` and follows the same accepted rules as Parking:

- an eligible `VALET_EMPLOYEE` or `VALET_SUPERVISOR` may self-claim through the existing contract;
- an operational `VALET_SUPERVISOR` may assign to another eligible staff membership at the same Task Location;
- the existing automatic assignment mode may be used by an authorized supervisor;
- the target must be currently eligible under DEC-032 inside the protected transaction.

Success remains:

```text
QUEUED -> ASSIGNED
current_assignee_membership_id = target
Task.version += 1
```

with exactly one corresponding `DispatchEvent(ASSIGNED)` and required `AuditEvent(TASK_ASSIGNED)` committed atomically.

### 7. Assignment ranking composes PARKING and RETRIEVAL workload

VAL-006C reuses the existing deterministic MVP ranking.

The ranking inputs remain:

1. exact Organization/Location scope;
2. DEC-032 current operational eligibility;
3. canonical current owned Task load;
4. deterministic persisted-identifier tie breaking.

Current owned workload counts Tasks in:

```text
ASSIGNED
ACCEPTED
IN_PROGRESS
```

across both PARKING and RETRIEVAL task types.

A Parking Task contributes to the employee's workload when ranking for Retrieval, and a Retrieval Task contributes when ranking for Parking.

No task-type-specific workload model is introduced.

VAL-006C does not add GPS proximity, maps, geofences, VAYLET Qualified, Safety Score, VIP/SLA scoring, predictive Retrieval or AI assignment.

### 8. Retrieval Task acceptance remains a Dispatch mutation only

Only the current authorized assignee may accept an assigned Retrieval Task, using the same DEC-035 protected boundary.

Success performs:

```text
ASSIGNED -> ACCEPTED
```

while preserving the same Task owner and incrementing `Task.version` exactly once.

It appends the existing canonical acceptance Dispatch/Audit history atomically.

Critically, Task acceptance does not start physical Retrieval.

Therefore VAL-006C must not mutate:

```text
ValetSession.state
RetrievalRequest.status
ValetSession.retrieval_started_at
```

For a normal Retrieval operation after assignment/acceptance:

```text
ValetSession.state = REQUESTED
RetrievalRequest.status = OPEN
```

remain authoritative.

DEC-039 reserves `RetrievalRequest.OPEN -> ACCEPTED` and `REQUESTED -> RETRIEVING` for the later Start Retrieval command in VAL-006D.

### 9. Retrieval Task decline reuses DEC-035 exactly

Only the current assignee may decline an `ASSIGNED` Retrieval Task before acceptance.

Success remains:

```text
ASSIGNED -> QUEUED
current_assignee_membership_id = NULL
Task.version += 1
```

with canonical `DispatchEvent(DECLINED)` and required Audit history.

The existing bounded optional decline reason semantics remain unchanged.

Decline does not:

- create a new Task;
- cancel the RetrievalRequest;
- move the ValetSession back to PARKED;
- mutate `retrieval_requested_at`;
- create key custody events.

The physical operation remains:

```text
ValetSession.state = REQUESTED
RetrievalRequest.status = OPEN
```

### 10. Supervisor Retrieval reassignment reuses DEC-035 exactly

Only a current operational `VALET_SUPERVISOR` at the Task Location may reassign another current Task owner.

The target must satisfy DEC-032 operational eligibility inside the protected transaction.

Reassignment applies only to:

```text
ASSIGNED
ACCEPTED
```

and remains forbidden for:

```text
IN_PROGRESS
```

in this contract.

A non-empty trimmed bounded reason is mandatory. The target must differ from the current assignee.

Success preserves current Task status, replaces current Task owner, increments `Task.version` exactly once, and appends canonical REASSIGNED Dispatch/Audit evidence with previous/new assignee, actor and reason.

No ValetSession or RetrievalRequest mutation occurs.

### 11. Shift eligibility remains the shared DEC-032 boundary

Retrieval assignment does not create a new eligibility model.

All protected Retrieval Dispatch mutations reuse the same transaction-aware operational eligibility boundary already used for Parking.

The implementation must preserve protection against:

- inactive/revoked membership;
- wrong Organization;
- wrong Location;
- ended/non-active Shift;
- eligibility races with concurrent Shift end or revocation.

A losing eligibility state must prevent the competing Dispatch mutation from committing.

### 12. Optimistic concurrency remains Task.version only

All contested assignment/accept/decline/reassign mutations continue using:

```text
expectedVersion
Task.version
```

No second version or idempotency field is introduced.

For an already-authorized Task, error precedence remains the DEC-035 ordering:

1. `VERSION_CONFLICT`;
2. invalid Task state/transition;
3. target-assignee eligibility/assignment conflict validation.

A successful real Task projection mutation increments `Task.version` exactly once.

### 13. Dispatch/Audit history remains append-only and shared

Retrieval Task mutations reuse the existing event families:

```text
TASK_ASSIGNED
TASK_ACCEPTED
TASK_DECLINED
TASK_REASSIGNED
```

with their corresponding DispatchEvent types.

No Retrieval-specific duplicate assignment event taxonomy is introduced merely because `task_type = RETRIEVAL`.

Metadata remains narrow and must not contain bearer credentials, cookies, raw auth headers, guest secrets, sensitive PII, arbitrary request bodies, GPS, KeySlot or exact parking-location data unless a later accepted contract explicitly requires such operational evidence.

### 14. Physical Retrieval state is frozen throughout VAL-006C

VAL-006C owns Task/Dispatch composition only.

For the normal active Retrieval operation, assignment/accept/decline/reassign must leave:

```text
ValetSession.state = REQUESTED
RetrievalRequest.status = OPEN
```

unchanged.

VAL-006C must not set:

- `retrieval_started_at`;
- `ready_at`;
- `handoff_pending_at`;
- `completed_at`;
- key checkout/return/release custody facts.

It must not increment ValetSession.version merely because Task ownership changes.

VAL-006D owns physical Start Retrieval and key checkout.

### 15. Database schema and migrations remain unchanged

VAL-006C requires no Prisma schema change and no new migration.

The repository remains at exactly 21 forward-only migrations after VAL-006B.

Migrations 1–21 remain immutable.

If implementation proves safe Retrieval Dispatch composition requires a new database invariant that cannot be expressed through the existing accepted Task/Dispatch model, implementation must stop and raise a focused decision rather than invent Migration 22.

### 16. Existing Phase 3 PARKING semantics must remain unchanged

This decision intentionally broadens only the supported task type for the already-generic Dispatch surface.

It does not change the accepted Phase 3 semantics for:

- Parking queue creation;
- Parking queue read visibility beyond coexistence with Retrieval work;
- Parking assignment authorization;
- Parking accept/decline behavior;
- Parking supervisor reassignment;
- deterministic workload ranking;
- Task.version concurrency;
- Shift-end open-task ownership guard;
- physical Parking transitions owned by VAL-005F / VAL-005G.

Regression tests must prove the existing Parking behavior remains semantically unchanged.

### 17. Required implementation proof

VAL-006C must prove at minimum:

1. the authorized Location queue returns both operational PARKING and RETRIEVAL Tasks;
2. cross-Location and cross-Organization Retrieval Tasks remain concealed;
3. staff without DEC-032 current operational eligibility cannot read/operate on the queue;
4. eligible employee self-claim works for RETRIEVAL;
5. supervisor assignment to another eligible member works for RETRIEVAL;
6. existing automatic assignment/ranking works for RETRIEVAL;
7. workload ranking counts canonical owned PARKING + RETRIEVAL work;
8. lower current load ranks first and ties remain deterministic;
9. only current assignee can accept RETRIEVAL;
10. accept performs only `ASSIGNED -> ACCEPTED` on Task;
11. decline performs only `ASSIGNED -> QUEUED` and clears owner;
12. supervisor reassignment works for RETRIEVAL in ASSIGNED and ACCEPTED only;
13. same-assignee reassignment and missing reason remain rejected;
14. IN_PROGRESS remains non-reassignable under this contract;
15. stale `expectedVersion` cannot mutate;
16. contested concurrent mutations produce one authoritative winner;
17. eligibility races fail safely;
18. Dispatch/Audit history is atomic and append-only;
19. RetrievalRequest remains OPEN through QUEUED/ASSIGNED/ACCEPTED;
20. ValetSession remains REQUESTED through all VAL-006C mutations;
21. no `retrieval_started_at` or key custody fact is created;
22. existing Phase 3 PARKING assign/accept/decline/reassign behavior remains green;
23. Shift-end open-work guard remains correct for canonical owned Tasks;
24. no GPS/maps/payment/handoff/UI/offline/AI behavior is introduced;
25. authored code respects repository architecture and physical-line limits;
26. migration count remains exactly 21 and Prisma schema is unchanged.

Required repository gates remain:

```text
pnpm lint
pnpm architecture:check
pnpm typecheck
pnpm test
pnpm build
```

### 18. Explicitly out of scope

DEC-041 / VAL-006C do not implement or define:

- Start Retrieval;
- key checkout;
- `REQUESTED -> RETRIEVING`;
- RetrievalRequest `OPEN -> ACCEPTED`;
- Retrieval cancellation;
- GPS/maps/tracking/geofences;
- READY progression;
- notification-provider delivery;
- pickup PIN or Dynamic QR;
- handoff verification/override;
- vehicle release/session completion;
- payment/validation;
- dashboard/employee/guest UI;
- offline replay;
- predictive Retrieval/AI/V2 scoring.

## Relationship to DEC-035

DEC-035 remains authoritative for all Hybrid Dispatch mutation semantics.

DEC-041 changes only DEC-035 section 3's Phase-3 task-type restriction for the Phase 4 generic Dispatch surface by extending supported operational task types from:

```text
PARKING
```

to:

```text
PARKING
RETRIEVAL
```

All other DEC-035 authorization, eligibility, ranking, concurrency, state-transition, audit, reassignment, error and physical-state separation rules remain authoritative unless DEC-041 explicitly states otherwise.

## Consequences

Positive:

- Retrieval composes with the proven Phase 3 Dispatch system instead of duplicating it;
- employee workload becomes correctly shared across Parking and Retrieval work;
- Phase 3 authorization and concurrency guarantees are reused;
- Task acceptance remains separate from physical Retrieval custody;
- the implementation remains small and testable with no schema change.

Trade-offs:

- the formerly Parking-only shared Task projection and queue now intentionally expose both operational task types;
- regression coverage must be strong because a shared Dispatch code path now serves two physical workflows;
- later physical Retrieval commands must continue respecting the separation locked here rather than coupling Task acceptance to vehicle movement.

## Implementation boundary

Implementation may begin only after this decision is marked `Accepted` and mirrored in `docs/08_DECISIONS_LOG.md` according to repository decision-log rules.
