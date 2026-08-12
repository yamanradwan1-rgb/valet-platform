# DEC-036 — Start Parking

Status: Accepted  
Date: 2026-08-12  
Issue: #106 (`VAL-005F — Start Parking`)

## Context

Phase 3 now has the prerequisites needed to start physical Parking safely:

- VAL-005A / DEC-031 established KeySlot and parking-resource persistence;
- VAL-005B / DEC-032 established transaction-aware operational eligibility;
- VAL-005C / DEC-033 established current KeySlot assignment plus reusable append-only `CHECKED_OUT` / `RETURNED_TO_SLOT` custody primitives;
- VAL-005D / DEC-034 established authoritative Task persistence and append-only DispatchEvent history;
- VAL-005E / DEC-035 established Parking Task queue/assignment/acceptance/reassignment, canonical Task ownership, `Task.version`, and the Shift-end open-work guard.

The binding ValetSession state machine allows exactly:

```text
AWAITING_PARKING -> PARKING
```

for Start Parking, while the accepted Task lifecycle requires the same physical start to move the accepted Parking Task:

```text
ACCEPTED -> IN_PROGRESS
```

These are two distinct current projections of one operational action. The command must therefore protect both projections, key custody history, Dispatch history and Audit history in one transaction. It must not split Task start from physical parking start or expose a standalone key checkout route.

The current schema already contains `ValetSession.parking_started_at`, ValetSession `version`, Task `version`, KeyCustodyEvent `CHECKED_OUT`, DispatchEvent `IN_PROGRESS`, and all required scope relations. VAL-005F needs no schema or migration change.

## Decision

### 1. Scope

VAL-005F implements only the explicit Start Parking command/API.

It owns:

- one staff Start Parking route;
- current accepted `PARKING` Task-owner authorization;
- DEC-032 current operational eligibility inside the same transaction;
- coordinated Task `ACCEPTED -> IN_PROGRESS`;
- coordinated ValetSession `AWAITING_PARKING -> PARKING`;
- `parking_started_at` from one PostgreSQL-authoritative operation timestamp;
- exactly one Task version increment and one ValetSession version increment;
- required current KeySlot readiness;
- exactly one append-only `KeyCustodyEvent(CHECKED_OUT)` through the DEC-033 custody boundary;
- exactly one append-only `DispatchEvent(IN_PROGRESS)`;
- one required AuditEvent for the protected Start Parking operation;
- focused authorization, rollback and concurrency tests.

VAL-005F does not implement:

- Parking Zone/Spot selection or proof;
- `PARKING -> PARKED`;
- `parked_at`;
- `RETURNED_TO_SLOT`;
- Parking Task `COMPLETED`;
- GPS/maps/tracking/geofences;
- Retrieval behavior;
- payment/handoff/payroll;
- dashboard or employee UI;
- offline replay/durable operation IDs;
- timeout/requeue policy;
- supervisor reassignment of `IN_PROGRESS` work.

### 2. Persistence and migration freeze

VAL-005F requires no Prisma schema change and no database migration.

The repository remains at exactly **20 forward-only migrations**.

Migrations 1–20 are immutable for this slice.

Do not add:

- migration 21;
- another parking-start timestamp;
- another Task/ValetSession concurrency field;
- a key-checkout status column;
- a duplicate current-assignee field;
- a new GPS/route field;
- a durable operation-id column.

Existing persistence is sufficient.

### 3. Canonical command route

The canonical staff route is:

```text
POST /v1/staff/valet-sessions/:sessionId/start-parking
```

The route is session-scoped because the protected physical transition belongs to ValetSession. The active Parking Task is derived from persisted Task data for that session rather than trusted from a client-selected Task identifier.

The strict shared request body is:

```json
{
  "expectedSessionVersion": 4,
  "expectedTaskVersion": 3
}
```

No Organization, Location, membership, role, actor, Shift, Task status, key slot, or Task owner claim is accepted from the client as authority.

No generic ValetSession or Task PATCH endpoint is introduced.

### 4. Success response

The successful response is a minimal combined projection sufficient for the employee workflow:

```text
sessionId
state = PARKING
sessionVersion
parkingStartedAt
taskId
taskStatus = IN_PROGRESS
taskVersion
```

The response does not need to expose exact KeySlot, Zone, Spot, GPS, route or guest-sensitive detail.

### 5. Actor authorization

Start Parking is a self-owned field operation.

Only the current canonical assignee of the accepted Parking Task may start Parking.

The actor must resolve from the authenticated Staff User to an OrganizationMembership in the exact Task/session Organization and remain currently operationally eligible under DEC-032 at the exact session Location.

Allowed operational roles therefore remain those accepted by DEC-032:

- `VALET_EMPLOYEE`
- `VALET_SUPERVISOR`

A supervisor does not gain permission to start another employee's accepted Task merely because the role can reassign earlier Task states.

`ORG_ADMIN` and `LOCATION_MANAGER` do not inherit field-operation Start Parking authority.

If the authenticated actor is not the current Task assignee, the command uses the existing non-disclosing Task authorization behavior and must not reveal another employee's assignment details.

### 6. Canonical ownership

`Task.current_assignee_membership_id` remains the only canonical current Hybrid Dispatch owner.

VAL-005F must not read, write, synchronize, clear, or reinterpret:

```text
ValetSession.current_assignee_membership_id
```

as Task ownership.

That legacy/current operational field remains outside this command's assignment authority.

### 7. Parking Task resolution

After locking and authorizing the target session, the command resolves the single active `TaskType.PARKING` Task for that ValetSession from authoritative persistence.

The DEC-034 partial unique index remains final authority that at most one active Parking Task exists across:

```text
QUEUED
ASSIGNED
ACCEPTED
IN_PROGRESS
```

Start Parking requires the resolved Task to be exactly:

```text
status = ACCEPTED
current_assignee_membership_id = acting membership
```

No Retrieval Task may satisfy this command.

If no authorized active Parking Task exists, use the existing non-disclosing Task-not-found/forbidden behavior rather than inventing a second Task identity source.

### 8. ValetSession preconditions

The persisted ValetSession must be exactly:

```text
state = AWAITING_PARKING
```

and its existing:

```text
parking_started_at
```

must still be null before the real start mutation.

The command must not accept `PARKING`, `PARKED` or any later physical state as a semantic retry.

A completed first execution is protected from duplicate side effects by the new versions/state. A later retry is evaluated against current persisted state; VAL-005F does not provide durable replay of the original response.

### 9. Dual optimistic concurrency

Start Parking mutates both the Task current projection and the ValetSession physical projection, so the request carries both accepted current versions:

```text
expectedTaskVersion
expectedSessionVersion
```

The command does not add another concurrency token.

For an already-authorized session/task pair, if either persisted version differs from its expected value, return:

```text
VERSION_CONFLICT
```

before state-specific readiness validation.

A successful real Start Parking operation increments:

- `Task.version` exactly once;
- `ValetSession.version` exactly once.

The final SQL mutations must still be conditional on the locked expected version and accepted source state so implementation mistakes cannot turn preflight reads into the sole concurrency guard.

### 10. Error precedence

Authorization/resource concealment occurs before public state detail is revealed.

For an already-authorized session and current owner Task, stable command precedence is:

1. `VERSION_CONFLICT` if either expected Task or session version is stale;
2. `TASK_INVALID_STATE` if the Parking Task is not exactly `ACCEPTED`;
3. `INVALID_STATE_TRANSITION` if the ValetSession is not exactly `AWAITING_PARKING` or already has an inconsistent non-null `parking_started_at`;
4. `KEY_CUSTODY_NOT_READY` when the required current key assignment cannot safely be checked out;
5. protected mutation/concurrency failure mapped to the narrow existing stable conflict/error surface.

Do not return raw PostgreSQL errors, constraint names, SQL text or stack traces.

### 11. Key custody readiness

Normal Start Parking requires a current KeySlot assignment on the ValetSession.

The command must prove from persistence inside the same transaction:

- `ValetSession.key_slot_id IS NOT NULL`;
- that exact KeySlot belongs to the same persisted Organization + Location relationship already enforced by the schema;
- the current KeySlot is operationally `ACTIVE` at the time of checkout.

The KeySlot row must be transactionally protected before the custody fact is appended.

If the current assignment is absent or cannot safely be used, return:

```text
KEY_CUSTODY_NOT_READY
```

mapped as a stable conflict without exposing another tenant's resource state.

### 12. KeySlot current assignment remains assigned

Starting Parking means the employee physically takes the key from its assigned board slot. It does not erase which slot the key belongs to.

Therefore Start Parking must **not** clear or change:

```text
ValetSession.key_slot_id
```

The current assigned slot remains the return destination used by VAL-005G.

Current key-board state is explained by the current slot assignment plus append-only custody history rather than a second mutable checkout-status field.

### 13. CHECKED_OUT custody fact

The Start Parking transaction appends exactly one:

```text
KeyCustodyEvent(event_type = CHECKED_OUT)
```

using the accepted DEC-033 transaction-aware custody primitive.

The event records:

- persisted Organization;
- persisted Location;
- persisted ValetSession;
- the current assigned KeySlot;
- the current accepted Task owner / acting membership;
- the same database-authoritative operation timestamp used by the rest of Start Parking.

No standalone checkout endpoint is added.

No historical KeyCustodyEvent is updated or deleted.

### 14. Task transition

The same transaction performs exactly:

```text
Task.status: ACCEPTED -> IN_PROGRESS
```

The current assignee remains unchanged.

The command increments Task.version exactly once.

It does not create a replacement Task and does not touch a Retrieval Task.

### 15. Dispatch history

The same transaction appends exactly one:

```text
DispatchEvent(event_type = IN_PROGRESS)
```

with:

```text
actor_membership_id = current accepted Task owner
new_assignee_membership_id = current accepted Task owner
previous_assignee_membership_id = NULL
reason = NULL
```

This satisfies the structural DispatchEvent contract established by DEC-034 and preserves append-only Task lifecycle history.

No existing DispatchEvent is rewritten.

### 16. ValetSession transition

The same transaction performs exactly:

```text
ValetSession.state: AWAITING_PARKING -> PARKING
```

and sets:

```text
parking_started_at = operationTime
```

using the one database-authoritative Start Parking timestamp.

ValetSession.version increments exactly once.

VAL-005F does not mutate:

- `parking_zone_id`;
- `parking_spot_id`;
- `parked_at`;
- retrieval timestamps;
- handoff timestamps;
- payment state;
- `current_assignee_membership_id`.

### 17. One authoritative operation time

Obtain one timestamp from PostgreSQL inside the protected transaction.

Use that same instant for at least:

- `ValetSession.parking_started_at`;
- Task `updated_at` when explicitly controlled by the command;
- `KeyCustodyEvent.occurred_at`;
- `DispatchEvent.occurred_at`;
- required AuditEvent `occurred_at`.

Clients and Node `Date.now()` do not choose trusted parking-start time.

### 18. Audit / Black Box event

A real successful Start Parking operation appends exactly one required AuditEvent in the same transaction.

Canonical event type:

```text
VALET_SESSION_PARKING_STARTED
```

Canonical shape:

- entity type: `VALET_SESSION`;
- entity ID: ValetSession ID;
- persisted Organization + Location + ValetSession scope;
- actor membership: current accepted Task owner;
- occurredAt: the shared database-authoritative Start Parking time;
- narrow metadata only.

Safe metadata may include:

```text
taskId
fromSessionState / toSessionState
fromSessionVersion / toSessionVersion
fromTaskStatus / toTaskStatus
fromTaskVersion / toTaskVersion
```

The custody event already records the KeySlot fact, so Audit metadata does not need to duplicate exact slot code or other operator-sensitive resource identifiers.

Never store auth headers, cookies, staff credentials, guest bearer secrets, QR payloads/secrets, arbitrary request bodies, payment credentials, GPS data or sensitive PII.

### 19. Atomicity

Start Parking is one indivisible protected transaction.

The following effects either all commit or all roll back:

1. ValetSession `AWAITING_PARKING -> PARKING`;
2. ValetSession version increment;
3. `parking_started_at`;
4. Task `ACCEPTED -> IN_PROGRESS`;
5. Task version increment;
6. `KeyCustodyEvent(CHECKED_OUT)`;
7. `DispatchEvent(IN_PROGRESS)`;
8. `AuditEvent(VALET_SESSION_PARKING_STARTED)`.

No implementation may commit Task IN_PROGRESS while the session remains AWAITING_PARKING, or commit PARKING while the Task remains ACCEPTED, or append checkout/history without both projections committing.

### 20. Transaction lock ordering

The implementation must use repository-compatible row locking and preserve a deterministic lock order.

Because existing key commands lock the ValetSession before proving/using key resources, Start Parking should begin by locking the target ValetSession, then resolve/lock its active Parking Task and required current KeySlot, while keeping DEC-032 eligibility proof inside that same transaction.

Do not introduce a reverse lock cycle through cross-feature helper calls.

Focused concurrency tests must exercise at least the meaningful races against:

- Task accept/reassignment;
- concurrent Start Parking requests;
- KeySlot correction/reassignment;
- Shift end / eligibility loss where repository test infrastructure can coordinate the race deterministically.

Only safe committed outcomes are acceptable.

### 21. Reassignment boundary

DEC-035 intentionally forbids supervisor reassignment of `IN_PROGRESS` Tasks.

VAL-005F does not change that rule.

A supervisor who needs a different employee to perform Parking must reassign the Task while it is still `ASSIGNED` or `ACCEPTED` according to DEC-035, before Start Parking commits.

Once Start Parking commits, any physical in-progress handoff requires a later focused exception contract and cannot be invented here.

### 22. Shift-end interaction

DEC-035 already blocks normal Shift end while the membership owns `ASSIGNED`, `ACCEPTED` or `IN_PROGRESS` canonical Tasks.

VAL-005F preserves that boundary.

The acting employee must remain DEC-032 operationally eligible while Start Parking executes. The eligibility rows/active Shift used to authorize Start Parking remain locked through the protected write.

Therefore a Shift-end/Start-Parking race must converge safely:

- if Start Parking retains the eligibility protection and commits first, the Task becomes `IN_PROGRESS` and Shift end remains blocked by open work; or
- if Shift end/eligibility loss commits first, Start Parking observes ineligibility and does not mutate session/task/custody/history.

No force-end bypass is introduced.

### 23. Retry behavior

VAL-005F uses state + dual optimistic versions, not durable operation identity.

After a successful Start Parking commit:

- a retry with stale pre-success versions returns `VERSION_CONFLICT` and appends no duplicate events;
- a caller that refreshes to the new versions and invokes Start Parking again sees the current Task/session state and receives the appropriate invalid-state response;
- no duplicate `CHECKED_OUT`, `IN_PROGRESS` DispatchEvent or AuditEvent is appended.

Transparent replay of the original successful response remains deferred to the later offline/reliability work unless a focused decision introduces durable operation identity.

### 24. Public error contract

VAL-005F reuses existing errors where applicable:

```text
TASK_NOT_FOUND_OR_FORBIDDEN
TASK_INVALID_STATE
VERSION_CONFLICT
INVALID_STATE_TRANSITION
AUTHORIZATION_DENIED / existing non-disclosing tenant-location authorization mappings
```

It adds one narrow Start Parking readiness error:

```text
KEY_CUSTODY_NOT_READY -> HTTP 409
```

The error intentionally combines absent/inactive/unusable current key assignment outcomes that should not be exposed with more resource detail.

Raw database errors never become public responses.

### 25. Shared contracts and architecture

Use strict shared Zod request/response contracts under `packages/contracts` and thin NestJS feature wiring.

The implementation should be a focused Parking/Start-Parking feature boundary rather than adding parking behavior to the generic Dispatch controller or the KeySlot public controller.

Reuse only the narrow accepted internal transaction-aware primitives needed from existing Shift/Dispatch/Key boundaries. Do not import another feature's controller/service as a shortcut and do not build a generic repository framework.

DEC-030 and `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding: new authored code/test `.ts/.tsx/.js/.mjs/.cjs` files must respect the 300-line policy.

### 26. No Confirm Parked leakage

VAL-005F must stop after the vehicle is physically in `PARKING` and the Task is `IN_PROGRESS`.

Do not:

- choose or validate a ParkingZone/ParkingSpot for completion;
- set `parked_at`;
- move session to `PARKED`;
- move Task to `COMPLETED`;
- append `DispatchEvent(COMPLETED)`;
- append `RETURNED_TO_SLOT`;
- send parked notification behavior.

Those belong to VAL-005G.

### 27. No GPS / later-phase leakage

Do not add:

- GPS capture/storage;
- route events;
- maps/geofences;
- continuous employee tracking;
- Retrieval commands;
- handoff behavior;
- payments/validation/refunds;
- payroll/timekeeping;
- dashboard/employee UI;
- offline queue/replay infrastructure;
- AI assignment or V2/Enterprise scoring.

The presence of `parking_started_at` is only the safe integration point for later task-scoped tracking; VAL-005F does not start a tracking subsystem.

### 28. Required proof

Implementation must prove at minimum:

- exactly 20 migrations remain and migrations 1–20 are unchanged;
- Prisma schema is unchanged;
- the exact route is `POST /v1/staff/valet-sessions/:sessionId/start-parking`;
- request contract is strict and requires both expected versions;
- unauthorized/cross-tenant/cross-Location callers cannot learn protected Task/session details;
- only the current accepted Parking Task owner may start;
- operationally ineligible/ended-Shift actor cannot start;
- `ORG_ADMIN` / `LOCATION_MANAGER` do not inherit field-operation start authority;
- Retrieval Task cannot start Parking;
- Task must be exactly `ACCEPTED`;
- ValetSession must be exactly `AWAITING_PARKING`;
- stale Task version fails;
- stale session version fails;
- either stale version returns `VERSION_CONFLICT` before state readiness detail for an authorized pair;
- missing current KeySlot fails `KEY_CUSTODY_NOT_READY`;
- inactive/unusable current KeySlot fails `KEY_CUSTODY_NOT_READY`;
- successful Start Parking leaves `ValetSession.key_slot_id` unchanged;
- successful Start Parking sets `parking_started_at` once from PostgreSQL time;
- successful Start Parking increments session version exactly once;
- successful Start Parking moves Task `ACCEPTED -> IN_PROGRESS`;
- successful Start Parking keeps the same current Task assignee;
- successful Start Parking increments Task version exactly once;
- exactly one `CHECKED_OUT` custody event is appended with current slot + actor;
- exactly one `IN_PROGRESS` DispatchEvent is appended with actor/current assignee;
- exactly one `VALET_SESSION_PARKING_STARTED` AuditEvent is appended;
- all timestamped effects use the same authoritative operation time where the schema permits exact comparison;
- any custody/Dispatch/Audit failure rolls back both current projections and timestamps/versions;
- concurrent double Start Parking yields at most one committed transition/event set;
- Start Parking vs Task reassignment/accept race has only safe authoritative outcomes;
- Start Parking vs key correction has only safe authoritative outcomes;
- Start Parking vs Shift end/eligibility loss has only safe authoritative outcomes;
- Shift end remains blocked after successful Task `IN_PROGRESS` ownership;
- no `ValetSession.current_assignee_membership_id` synchronization occurs;
- no Zone/Spot mutation occurs;
- no `PARKED`, Task completion or `RETURNED_TO_SLOT` behavior occurs;
- no GPS/maps/Retrieval/payment/handoff/payroll/UI/offline behavior is introduced;
- architecture/lint/typecheck/tests/build/Prisma validation remain green;
- authored code respects the 300-line policy.

## Consequences

VAL-005F creates the first command that atomically couples the canonical Dispatch Task lifecycle to the physical ValetSession custody lifecycle. After a successful call, authoritative state says one accepted employee has actually begun moving the vehicle, the key checkout is recorded, and all current/history projections agree on the same operation time.

The vehicle is not yet considered parked. VAL-005G remains responsible for Zone/Spot proof, `PARKING -> PARKED`, Task completion and key return.