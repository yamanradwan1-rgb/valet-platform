# DEC-037 — Confirm Parked

Status: Accepted  
Date: 2026-08-12  
Issue: #111 (`VAL-005G — Confirm Parked`)

> Amendment notice (2026-08-25): `DEC-065` — Verified Key Return During Confirm
> Parked (`Proposed`) amends this decision's request body (§3), resource-code
> scope (§4), error precedence (§11), key-custody readiness (§12), return-
> evidence wording (§13, §18), atomicity proof set (§24) and related required
> proofs (§33) once Accepted. Until then this decision remains fully binding.
>
> Amendment notice (2026-08-26): `DEC-068` — Post-Parking Key Slot Binding
> (`Accepted`) further amends this decision for sessions whose persisted
> `key_slot_id` is NULL at confirmation time: §11 (KEY_CUSTODY_NOT_READY
> widened to cover new-path resolution/availability/lost-race outcomes),
> §12 (key readiness no longer requires a preexisting assignment),
> §13 (the binding may be CREATED by this command), §18 (SLOT_ASSIGNED is
> appended before RETURNED_TO_SLOT on the new path), §24 (branch-aware
> atomic effect set) and §33 (required proofs). Sessions with a non-null
> persisted `key_slot_id` remain governed by the DEC-065-amended equality
> behavior unchanged. See
> `docs/decisions/DEC-068_POST_PARKING_KEY_SLOT_BINDING.md` §8, §12–§15 and §28.

## Context

Phase 3 now has every prerequisite required to finish a Parking operation safely:

- DEC-031 established ParkingZone/ParkingSpot persistence, current Spot occupancy protection, current ValetSession Zone/Spot fields, and static operator-visible resource codes;
- DEC-032 established transaction-aware operational eligibility;
- DEC-033 established current KeySlot assignment and the reusable append-only `RETURNED_TO_SLOT` custody primitive;
- DEC-034 established authoritative Task persistence and append-only DispatchEvent history;
- DEC-035 established canonical Task ownership and Task optimistic concurrency;
- DEC-036 established Start Parking, moving the accepted Parking Task to `IN_PROGRESS`, the ValetSession to `PARKING`, checking the key out, and preserving the current KeySlot assignment.

The binding ValetSession state machine allows exactly:

```text
PARKING -> PARKED
```

for the normal parking-completion path. The same physical confirmation must complete the authoritative Parking Task:

```text
IN_PROGRESS -> COMPLETED
```

The operation must also establish the exact parked Zone/Spot, set `parked_at`, return the key to its assigned slot, append Dispatch history and Audit history, and preserve current resource occupancy atomically.

The current schema already contains every required field and enum. VAL-005G therefore requires no Prisma schema change and no migration.

## Decision

### 1. Scope

VAL-005G implements only the explicit Confirm Parked command/API.

It owns:

- one staff Confirm Parked route;
- current `IN_PROGRESS` PARKING Task-owner authorization;
- DEC-032 current operational eligibility inside the same transaction;
- exact ParkingSpot resolution from persisted resource code;
- derived ParkingZone validation from the selected ParkingSpot;
- current ParkingSpot occupancy protection;
- coordinated Task `IN_PROGRESS -> COMPLETED`;
- coordinated ValetSession `PARKING -> PARKED`;
- current `parking_zone_id` / `parking_spot_id` assignment;
- `parked_at` from one PostgreSQL-authoritative operation timestamp;
- exactly one Task version increment and one ValetSession version increment;
- exactly one append-only `KeyCustodyEvent(RETURNED_TO_SLOT)` through the DEC-033 custody boundary;
- exactly one append-only `DispatchEvent(COMPLETED)`;
- one required AuditEvent for the parked confirmation;
- focused authorization, occupancy, rollback and concurrency tests.

VAL-005G does not implement:

- Retrieval request or Retrieval Task behavior;
- `PARKED -> REQUESTED`;
- GPS/maps/tracking/geofences;
- parking-management/configuration CRUD;
- guest notification delivery;
- key release/handoff completion;
- payment/handoff/payroll;
- dashboard or employee UI;
- offline replay/durable operation IDs;
- supervisor reassignment of `IN_PROGRESS` work;
- any later exception flow for moving an already parked vehicle.

### 2. Persistence and migration freeze

VAL-005G requires no Prisma schema change and no database migration.

The repository remains at exactly **20 forward-only migrations**.

Migrations 1–20 are immutable for this slice.

Do not add:

- migration 21;
- a parking-proof table;
- another parked timestamp;
- another Task/ValetSession concurrency field;
- a mutable key-return status column;
- a duplicate current ParkingSpot/Zone projection;
- a QR secret/token column;
- a GPS/route field;
- a durable operation-id column.

Existing persistence is sufficient.

### 3. Canonical command route

The canonical staff route is:

```text
POST /v1/staff/valet-sessions/:sessionId/confirm-parked
```

The route is session-scoped because the protected physical transition belongs to ValetSession. The active Parking Task is derived from persisted Task data for that session rather than trusted from a client-selected Task identifier.

The strict shared request body is:

```json
{
  "expectedSessionVersion": 5,
  "expectedTaskVersion": 4,
  "parkingSpotCode": "A-042"
}
```

No Organization, Location, membership, role, actor, Shift, Task ID/status, ParkingZone ID/code, ParkingSpot UUID, KeySlot ID, Task owner, or parked timestamp claim is accepted from the client as authority.

No generic ValetSession or Task PATCH endpoint is introduced.

### 4. Parking proof / resource-code contract

`ParkingSpot.code` is the one canonical operator-visible identifier submitted to Confirm Parked.

The same `parkingSpotCode` field is used whether the operator obtained it from a static QR scan or from a permitted manual entry workflow.

Transport may trim surrounding whitespace before exact lookup, but must not:

- case-fold;
- fuzzy-match;
- partially match;
- reinterpret the code;
- treat the code as authentication;
- accept a client-selected ParkingSpot UUID instead.

The code only identifies a resource. Staff Auth, tenant scope, Location scope, Task ownership and Shift eligibility remain server-derived.

There is currently no separate persisted typed policy that lets the server distinguish "QR required" from "manual permitted" for parking confirmation. VAL-005G must not invent a generic policy blob, proof enum, QR bearer secret, or migration merely to represent that distinction. A later focused configuration task may add such policy if required.

### 5. Success response

A successful response is a minimal combined projection sufficient for the employee workflow:

```text
sessionId
state = PARKED
sessionVersion
parkedAt
parkingZoneId
parkingSpotId
parkingSpotCode
taskId
taskStatus = COMPLETED
taskVersion
```

`parkingZoneId` / `parkingSpotId` may be returned to the authenticated staff caller because they are the exact protected operational resources just confirmed. Do not return unnecessary guest data, KeySlot code, GPS, route, payment, handoff, or later Retrieval details.

### 6. Actor authorization

Confirm Parked is a self-owned field operation.

Only the current canonical assignee of the `IN_PROGRESS` Parking Task may confirm the vehicle parked.

The actor must resolve from the authenticated Staff User to an OrganizationMembership in the exact Task/session Organization and remain currently operationally eligible under DEC-032 at the exact session Location inside the same protected transaction.

Allowed operational roles remain:

- `VALET_EMPLOYEE`
- `VALET_SUPERVISOR`

A supervisor does not gain permission to finish another employee's `IN_PROGRESS` Task merely by hierarchy.

`ORG_ADMIN` and `LOCATION_MANAGER` do not inherit ordinary field-operation authority.

If the authenticated actor is not the current Task assignee, preserve the existing non-disclosing Task authorization behavior.

### 7. Canonical ownership

`Task.current_assignee_membership_id` remains the only canonical current Hybrid Dispatch owner.

VAL-005G must not read, write, synchronize, clear, or reinterpret:

```text
ValetSession.current_assignee_membership_id
```

as Task ownership.

### 8. Parking Task resolution

After locking the target session, resolve the single active `TaskType.PARKING` Task for that ValetSession from authoritative persistence.

Start Parking has already moved the normal Task to:

```text
status = IN_PROGRESS
current_assignee_membership_id = acting membership
```

Confirm Parked requires exactly that state and owner.

No Retrieval Task may satisfy this command.

If no authorized active Parking Task exists, use the existing non-disclosing Task-not-found/forbidden behavior.

### 9. ValetSession preconditions

The persisted ValetSession must be exactly:

```text
state = PARKING
```

and must have a real prior Start Parking fact:

```text
parking_started_at IS NOT NULL
```

Before the real confirmation mutation:

```text
parked_at IS NULL
parking_spot_id IS NULL
```

`parking_zone_id` may be null or may contain an earlier same-Location zone assignment. If non-null, the selected ParkingSpot must belong to that exact same zone.

A session already in `PARKED` or later state is not a semantic retry.

### 10. Dual optimistic concurrency

Confirm Parked mutates both the Task current projection and the ValetSession physical projection, so the request carries both accepted current versions:

```text
expectedTaskVersion
expectedSessionVersion
```

For an already-authorized session/current-owner Task pair, if either persisted version differs from its expected value, return:

```text
VERSION_CONFLICT
```

before state/resource readiness detail.

A successful real confirmation increments:

- `Task.version` exactly once;
- `ValetSession.version` exactly once.

The final SQL mutations must still be conditional on the locked expected version and accepted source state.

### 11. Error precedence

Authorization/resource concealment occurs before public state detail is revealed.

For an already-authorized session and current-owner Task, stable command precedence is:

1. `VERSION_CONFLICT` if either expected Task or session version is stale;
2. `TASK_INVALID_STATE` if the Parking Task is not exactly `IN_PROGRESS`;
3. `INVALID_STATE_TRANSITION` if the ValetSession is not exactly `PARKING`, `parking_started_at` is null, `parked_at` is already non-null, or an exact Spot is already assigned unexpectedly;
4. `KEY_CUSTODY_NOT_READY` when the required current KeySlot cannot safely receive the returned key;
5. `PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE` when the submitted Spot cannot safely be used;
6. protected mutation/concurrency failure mapped to the narrow stable conflict surface.

Do not return raw PostgreSQL errors, constraint names, SQL text or stack traces.

### 12. Key custody readiness

Normal Confirm Parked requires the current KeySlot assignment preserved by Start Parking.

Inside the same transaction prove:

- `ValetSession.key_slot_id IS NOT NULL`;
- that exact KeySlot belongs to the persisted Organization + Location;
- the KeySlot remains `ACTIVE`;
- the row is transactionally protected before the return event is appended.

If absent, inactive, wrong-scope or otherwise unusable, return:

```text
KEY_CUSTODY_NOT_READY
```

without exposing protected KeySlot detail.

### 13. Current KeySlot remains assigned

Confirm Parked returns the key physically to the session's assigned slot.

It does **not** clear or change:

```text
ValetSession.key_slot_id
```

The current slot remains assigned to this custody session for later Retrieval/handoff workflows until a later explicit lifecycle command changes it.

### 14. ParkingSpot resolution

Resolve `parkingSpotCode` only inside the persisted session Organization + Location.

The selected ParkingSpot must be:

- exact code match after surrounding trim;
- `ACTIVE`;
- assigned to a non-null ParkingZone;
- in the exact same Organization + Location;
- linked to an `ACTIVE` ParkingZone in that same scope.

If any of those checks fail, return the combined non-disclosing:

```text
PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE
```

Do not distinguish wrong tenant, wrong Location, inactive Zone, inactive Spot, zone-null configuration, or occupied Spot through more revealing public errors.

### 15. ParkingZone is server-derived

The client does not submit authoritative Zone identity.

The command derives:

```text
parking_zone_id = selected ParkingSpot.parking_zone_id
```

from persisted relations.

If the ValetSession already carries a non-null `parking_zone_id`, the selected Spot must belong to that exact Zone. A mismatch is classified as:

```text
PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE
```

The command never silently moves a preassigned session to a different Zone.

### 16. ParkingSpot occupancy and concurrency

The database unique current-assignment rule over non-null `ValetSession.parking_spot_id` remains final authority against double occupancy.

The implementation must use repository-compatible transactional locking and classify races safely.

At minimum:

- protect the selected Spot row before mutation;
- inspect current occupancy in a transaction-safe way;
- two sessions concurrently confirming the same free Spot can produce at most one winner;
- the losing operation commits no session/task/custody/dispatch/audit effects;
- raw unique-constraint names are never exposed;
- if a PostgreSQL uniqueness failure aborts a transaction, any recovery/classification query must occur outside the aborted transaction when required.

Stable public conflict:

```text
PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE -> HTTP 409
```

### 17. Session parking assignment

On success, the same protected mutation sets:

```text
ValetSession.parking_zone_id = selected Spot's persisted zone
ValetSession.parking_spot_id = selected Spot.id
```

The composite database constraints remain the final integrity authority that Spot and Zone match the exact Organization + Location + Zone relationship.

Do not create a separate current parking-assignment table.

### 18. RETURNED_TO_SLOT custody fact

The same transaction appends exactly one:

```text
KeyCustodyEvent(event_type = RETURNED_TO_SLOT)
```

through the accepted DEC-033 transaction-aware custody primitive.

The event records:

- persisted Organization;
- persisted Location;
- persisted ValetSession;
- current assigned KeySlot;
- current `IN_PROGRESS` Parking Task owner / acting membership;
- the shared database-authoritative operation timestamp.

No standalone return-key route is added.

No historical KeyCustodyEvent is updated or deleted.

### 19. Task transition

The same transaction performs exactly:

```text
Task.status: IN_PROGRESS -> COMPLETED
```

The current assignee remains unchanged on the completed Task as historical/current completion projection permitted by DEC-034.

The command increments Task.version exactly once.

It does not create a replacement Task and does not touch a Retrieval Task.

### 20. Dispatch history

The same transaction appends exactly one:

```text
DispatchEvent(event_type = COMPLETED)
```

with:

```text
actor_membership_id = current Parking Task owner
new_assignee_membership_id = current Parking Task owner
previous_assignee_membership_id = NULL
reason = NULL
```

No existing DispatchEvent is rewritten.

### 21. ValetSession transition

The same transaction performs exactly:

```text
ValetSession.state: PARKING -> PARKED
```

and sets:

```text
parked_at = operationTime
```

using the shared PostgreSQL-authoritative operation timestamp.

ValetSession.version increments exactly once.

VAL-005G does not mutate:

- `parking_started_at` except to preserve its existing value;
- retrieval timestamps;
- handoff timestamps;
- payment state;
- `current_assignee_membership_id`;
- KeySlot assignment.

### 22. One authoritative operation time

Obtain one timestamp from PostgreSQL inside the protected transaction.

Use that same instant for at least:

- `ValetSession.parked_at`;
- Task `updated_at` when explicitly controlled by the command;
- ValetSession `updated_at` when explicitly controlled by the command;
- `KeyCustodyEvent.occurred_at`;
- `DispatchEvent.occurred_at`;
- required AuditEvent `occurred_at`.

Clients and Node `Date.now()` do not choose trusted parked time.

### 23. Audit / Black Box event

A real successful Confirm Parked operation appends exactly one required AuditEvent in the same transaction.

Canonical event type:

```text
VALET_SESSION_PARKED
```

Canonical shape:

- entity type: `VALET_SESSION`;
- entity ID: ValetSession ID;
- persisted Organization + Location + ValetSession scope;
- actor membership: current Parking Task owner;
- occurredAt: shared database-authoritative parked time;
- narrow metadata only.

Safe metadata may include:

```text
taskId
parkingZoneId
parkingSpotId
fromSessionState / toSessionState
fromSessionVersion / toSessionVersion
fromTaskStatus / toTaskStatus
fromTaskVersion / toTaskVersion
```

Do not store auth headers, cookies, staff credentials, guest bearer secrets, QR payloads, arbitrary request bodies, payment credentials, GPS data or sensitive PII.

### 24. Atomicity

Confirm Parked is one indivisible protected transaction.

The following effects either all commit or all roll back:

1. ValetSession `PARKING -> PARKED`;
2. ValetSession version increment;
3. `parked_at`;
4. `parking_zone_id` assignment;
5. `parking_spot_id` assignment;
6. Task `IN_PROGRESS -> COMPLETED`;
7. Task version increment;
8. `KeyCustodyEvent(RETURNED_TO_SLOT)`;
9. `DispatchEvent(COMPLETED)`;
10. `AuditEvent(VALET_SESSION_PARKED)`.

Forbidden partial states include:

- Task COMPLETED while session remains PARKING;
- session PARKED while Task remains IN_PROGRESS;
- Spot assignment committed without parked state;
- RETURNED_TO_SLOT committed without both projections;
- Dispatch/Audit history committed without protected projections.

### 25. Transaction lock ordering

Use repository-compatible row locking and preserve a deterministic lock order compatible with Start Parking and key commands.

Preferred order:

1. lock target ValetSession;
2. resolve actor membership;
3. resolve and lock the active Parking Task;
4. prove current Task ownership;
5. prove DEC-032 eligibility;
6. lock/prove current KeySlot;
7. resolve and lock the selected ParkingSpot and its ParkingZone;
8. inspect/protect Spot occupancy;
9. perform guarded mutations/events.

Do not introduce a reverse lock cycle through cross-feature helper calls.

### 26. Meaningful concurrency races

Focused integration tests must cover meaningful races at minimum:

- two concurrent Confirm Parked calls for the same session;
- two different sessions racing for the same free ParkingSpot;
- Confirm Parked vs Shift end / eligibility loss;
- Confirm Parked vs any attempted Task reassignment boundary;
- Confirm Parked vs any concurrent resource/config status change that test infrastructure can coordinate safely.

Expected safety:

- exactly one completion event set for one session;
- exactly one session may win a contested Spot;
- if Confirm Parked commits first, the Task becomes COMPLETED and no longer blocks normal Shift end;
- if Shift end / eligibility loss commits first, Confirm Parked observes ineligibility and commits nothing;
- `IN_PROGRESS` reassignment remains forbidden under DEC-035/036.

### 27. Retry behavior

VAL-005G uses state + dual optimistic versions, not durable operation identity.

After a successful Confirm Parked commit:

- retry with stale pre-success versions returns `VERSION_CONFLICT` and appends no duplicate events;
- caller refreshed to new versions sees Task/session terminal-for-this-slice states and receives the appropriate invalid-state result;
- no duplicate `RETURNED_TO_SLOT`, `COMPLETED` DispatchEvent or AuditEvent is appended.

Transparent replay of the original successful response remains deferred.

### 28. Public error contract

VAL-005G reuses existing errors where applicable:

```text
TASK_NOT_FOUND_OR_FORBIDDEN
TASK_INVALID_STATE
VERSION_CONFLICT
INVALID_STATE_TRANSITION
KEY_CUSTODY_NOT_READY
AUTHORIZATION_DENIED / existing non-disclosing tenant-location mappings
```

It adds:

```text
PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE -> HTTP 409
```

The error intentionally combines invalid/inactive/wrong-scope/wrong-zone/zone-null/occupied Spot outcomes where more detail would expose protected resource state unnecessarily.

### 29. No guest notification side effect

The binding state machine notes that parked state may later trigger guest notification according to configured channel/template.

VAL-005G does not implement notification delivery because no focused notification command/integration contract is part of this slice.

The authoritative `PARKED` state and `parked_at` timestamp are sufficient integration facts for a later notification workflow.

Do not add provider calls, queue jobs, message templates or notification retries in this task.

### 30. No GPS/maps/tracking leakage

Confirm Parked may provide the future end boundary for task-scoped Parking tracking, but VAL-005G does not implement tracking.

Do not add:

- GPS capture/storage;
- route points;
- geofences;
- maps provider calls;
- tracking session rows;
- employee surveillance behavior.

Those remain later Phase 5 work.

### 31. Retrieval boundary

After success the ValetSession is `PARKED` and the Parking Task is `COMPLETED`.

VAL-005G stops there.

Do not:

- create a RetrievalRequest;
- create/queue a Retrieval Task;
- move `PARKED -> REQUESTED`;
- set `retrieval_requested_at`;
- expose retrieval shortcuts.

Those belong to later phases/tasks.

### 32. Shared contracts and architecture

Use strict shared Zod request/response contracts under `packages/contracts` and thin NestJS feature wiring.

The implementation should extend the focused Parking feature boundary established by VAL-005F rather than adding physical parking behavior to generic Dispatch or Key public controllers.

Narrow reuse of internal transaction-aware Dispatch/Key/Shift primitives is allowed and preferred where it preserves the accepted transaction contract.

Do not introduce a generic repository/service framework.

DEC-028 dependency direction and DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding.

### 33. Required proof

Implementation must prove at minimum:

- exact canonical route and strict shared request/response contracts;
- current `IN_PROGRESS` Parking Task owner only;
- operational eligibility inside the same transaction;
- no supervisor/admin/manager hierarchy bypass;
- Task and session dual version precedence;
- Task must be `IN_PROGRESS`;
- session must be `PARKING` with non-null `parking_started_at`, null `parked_at`, and no unexpected exact Spot assignment;
- missing/inactive current KeySlot is rejected safely;
- exact ParkingSpot code lookup after trim, with no case/fuzzy matching;
- wrong-tenant/wrong-Location/inactive/zone-null/inactive-zone Spot is rejected safely;
- existing preassigned session Zone must match selected Spot Zone;
- occupied Spot is rejected safely;
- concurrent same-Spot confirmations allow at most one committed occupant;
- selected Zone is server-derived from the persisted Spot;
- session current Zone/Spot assignment is correct;
- successful command preserves current KeySlot assignment;
- exactly one RETURNED_TO_SLOT fact with correct actor/slot/time;
- Task moves `IN_PROGRESS -> COMPLETED` and increments once;
- Task assignee remains unchanged;
- exactly one COMPLETED DispatchEvent with the required structural shape;
- session moves `PARKING -> PARKED`, sets `parked_at`, and increments once;
- exactly one VALET_SESSION_PARKED AuditEvent with narrow safe metadata;
- shared PostgreSQL-authoritative timestamp across comparable effects;
- writer/mutation failures roll back all effects;
- double-submit and relevant races are safe;
- no guest notification, Retrieval, GPS/maps/tracking, payment, handoff, payroll, UI or offline behavior is introduced;
- migrations remain exactly 20 and unchanged;
- Prisma schema remains unchanged;
- architecture, lint, typecheck, focused/full tests, build, Prisma validation and changed-file formatting remain green.

## Consequences

- Phase 3 obtains one atomic command for finishing the physical Parking operation.
- Task completion, physical parked state, exact current Spot/Zone assignment, key return, Dispatch history and Audit history cannot drift apart on successful execution.
- Existing database Spot uniqueness remains the hard concurrency protection against two current sessions occupying the same Spot.
- Resource QR/manual identification remains a simple identifier rather than an authentication secret.
- The system reaches a clean `PARKED` + completed Parking Task boundary without pulling Retrieval, tracking, payment, handoff or UI behavior forward.
- VAL-005H can now focus on the Phase 3 API/integration/employee-operations gate rather than inventing missing parking lifecycle semantics.
