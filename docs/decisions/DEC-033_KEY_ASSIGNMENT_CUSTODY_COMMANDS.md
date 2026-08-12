# DEC-033 — Key Assignment & Custody Commands

Status: Accepted
Date: 2026-08-12
Issue: #92 (`VAL-005C — Key Assignment & Custody Commands`)

## Context

VAL-005A / DEC-031 established the Phase 3 key persistence boundary: `ValetSession.key_slot_id` is the mutable current KeySlot assignment, every non-null current slot is database-unique across sessions, and immutable custody history is recorded through append-only `KeyCustodyEvent` rows. The exact persisted event enum is `SLOT_ASSIGNED`, `CHECKED_OUT`, `RETURNED_TO_SLOT`, `SLOT_CLEARED`, and `RELEASED`.

VAL-005B / DEC-032 established transaction-aware operational eligibility. A field-operation actor is eligible at a Location only while the current User, OrganizationMembership, Organization, Location, explicit Location access, operational role, and same-Location active Shift are all valid.

The binding ValetSession state machine places normal key-slot assignment after check-in, while the session is `AWAITING_PARKING`. The later `AWAITING_PARKING -> PARKING` transition is owned by VAL-005F and `PARKING -> PARKED` by VAL-005G. VAL-005C must therefore implement assignment/correction custody commands without stealing those physical state transitions.

## Decision

### 1. Scope

VAL-005C implements only the current KeySlot assignment/correction command surface and the reusable custody mutation boundary required by later Parking commands.

It owns:

- initial KeySlot assignment for an authorized `AWAITING_PARKING` session;
- safe reassignment from one current slot to another while still `AWAITING_PARKING`;
- safe clearing of an erroneous current slot while still `AWAITING_PARKING`;
- exact scan/manual resource-code lookup semantics;
- optimistic concurrency using the existing ValetSession `version`;
- append-only `KeyCustodyEvent` and required AuditEvent atomicity;
- internal transaction-aware custody helpers later consumed by Start Parking / Confirm Parked for `CHECKED_OUT` and `RETURNED_TO_SLOT` behavior.

VAL-005C does not perform a ValetSession physical-state transition.

### 2. Operational authorization

All public VAL-005C mutations are ordinary field operations and therefore require the DEC-032 operational-eligibility boundary inside the same database transaction as the protected write.

The server derives the target session Organization and Location from persistence and proves the authenticated User's current membership/role/access/Shift eligibility for that exact Location.

Allowed operational roles remain:

- `VALET_EMPLOYEE`
- `VALET_SUPERVISOR`

`ORG_ADMIN` and `LOCATION_MANAGER` do not gain field-operation authority by hierarchy alone.

Client-supplied Organization, membership, actor, role, Shift or Location claims never establish authority.

### 3. Public command routes

Canonical staff routes are:

```text
POST /v1/staff/valet-sessions/:sessionId/key-slot/assign
POST /v1/staff/valet-sessions/:sessionId/key-slot/clear
```

Assign request:

```json
{
  "keySlotCode": "operator-visible-code",
  "expectedVersion": 3
}
```

Clear request:

```json
{
  "expectedVersion": 3
}
```

Public contracts live in `packages/contracts` and are exported through the existing package surface.

No generic ValetSession PATCH endpoint is introduced.

### 4. QR and manual identifier semantics

`KeySlot.code` is the one canonical resource identifier for both scanning and permitted manual entry.

The API does not accept a QR bearer token, resource secret, Organization ID, Location ID or client-selected KeySlot UUID as authority.

Scanner and manual flows submit the same `keySlotCode` field. Transport may trim surrounding whitespace before exact code lookup, but must not case-fold, partially match, fuzzy-match, or reinterpret the code.

A successful lookup must resolve an `ACTIVE` KeySlot in the exact persisted Organization + Location of the target ValetSession.

Scanning identifies a slot only. It never authenticates the employee or grants tenant/location access.

### 5. State and version guards

Public assign/reassign/clear commands require persisted ValetSession state exactly:

```text
AWAITING_PARKING
```

They require caller-provided `expectedVersion` exactly equal to the persisted session `version`.

For an authorized resolved session, stable precedence is:

1. `VERSION_CONFLICT` when persisted version differs from `expectedVersion`;
2. `INVALID_STATE_TRANSITION` when state is not `AWAITING_PARKING`;
3. command-specific resource validation/conflict errors.

Every successful mutation increments ValetSession `version` exactly once. Key assignment does not introduce another version/lock column.

### 6. Initial slot assignment

When the session currently has no KeySlot and the requested active same-scope slot is available, one transaction must:

1. lock/prove the ValetSession and DEC-032 operational eligibility;
2. resolve and protect the target KeySlot;
3. set `ValetSession.key_slot_id` to the target slot;
4. increment session `version` once;
5. append one `KeyCustodyEvent(event_type = SLOT_ASSIGNED)` for the target slot and acting membership;
6. append one required AuditEvent;
7. commit all effects atomically.

The custody event and audit use the same database-authoritative operation timestamp.

### 7. Same-slot semantic retry

If `expectedVersion` matches the current version and the requested KeySlot is already the session's current KeySlot, the command is a semantic no-op:

- return the current authorized session/key projection with HTTP 200;
- do not increment version;
- do not append another KeyCustodyEvent;
- do not append another AuditEvent.

A retry carrying a stale pre-success `expectedVersion` still returns `VERSION_CONFLICT`; the existing version is not a durable operation-id replay record.

### 8. Slot reassignment/correction

While still `AWAITING_PARKING`, an authorized actor may correct the current assignment from slot A to distinct slot B in one atomic command by calling the assign endpoint with B.

If B is valid and available, the transaction must:

1. preserve all prior history;
2. change current `key_slot_id` from A to B;
3. increment version exactly once;
4. append `SLOT_CLEARED` for A;
5. append `SLOT_ASSIGNED` for B;
6. append one reassignment AuditEvent.

Both custody events use the same actor and database-authoritative operation time. Deterministic insertion order is `SLOT_CLEARED` then `SLOT_ASSIGNED`.

No historical custody row is updated or deleted.

### 9. Explicit clear correction

The clear endpoint is only for removing an erroneous current slot while the session remains `AWAITING_PARKING`.

If a current slot exists, one transaction must:

- set `key_slot_id = NULL`;
- increment version exactly once;
- append `SLOT_CLEARED` for the previous slot;
- append one clear AuditEvent.

If `expectedVersion` matches and the session already has no current KeySlot, clear is a semantic no-op with HTTP 200 and no version/event/audit mutation.

This correction command is not the later normal release/completion lifecycle.

### 10. Slot availability and concurrency

The database unique index over non-null `ValetSession.key_slot_id` remains the final current-occupancy authority.

The implementation must use repository-compatible transactional locking and must classify races safely. At minimum:

- two sessions concurrently attempting the same free slot can produce at most one winner;
- a losing request returns a stable slot-unavailable conflict and does not append custody/audit effects;
- reassignment cannot temporarily expose a committed double occupancy;
- failures roll back the current assignment, version increment, custody events and audit together.

A unique-constraint violation is treated as a concurrency signal and mapped without leaking raw SQL or constraint names.

### 11. Public error contract

VAL-005C adds:

```text
KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE -> HTTP 409
```

The code intentionally combines inactive, wrong-scope and already-occupied resource outcomes where a more specific response would disclose resource existence or operational state unnecessarily.

Existing cross-cutting errors remain authoritative where applicable, including:

- `VERSION_CONFLICT`
- `INVALID_STATE_TRANSITION`
- existing non-disclosing tenant/location/authorization mappings
- existing operational-eligibility denial behavior

Raw database errors and constraint names are never returned.

### 12. Audit / Black Box contract

First successful mutations append exactly one AuditEvent atomically with the session/custody write.

Canonical event types:

```text
VALET_SESSION_KEY_SLOT_ASSIGNED
VALET_SESSION_KEY_SLOT_REASSIGNED
VALET_SESSION_KEY_SLOT_CLEARED
```

For each:

- Organization, Location and ValetSession scope come from persisted records;
- actor membership is the authorized acting membership;
- entity type is `VALET_SESSION`;
- entity ID is the ValetSession ID;
- occurredAt is the same database-authoritative operation time used by custody history;
- metadata is narrow and may contain only safe transition facts such as prior/current slot IDs or codes and from/to version;
- no authentication token, QR secret, raw guest credential, password, payment credential, personal free text or client authority claim is stored.

Semantic no-op retries append no event.

### 13. Parking checkout/return boundary

VAL-005C owns reusable internal transaction-aware custody primitives for the already-persisted event types needed by later parking lifecycle commands, but does not expose standalone public checkout/return endpoints and does not move ValetSession state.

VAL-005F Start Parking must use the custody boundary inside its own transition transaction to record the required `CHECKED_OUT` event when the physical workflow takes the key from the assigned slot.

VAL-005G Confirm Parked must use the custody boundary inside its own transition transaction to record `RETURNED_TO_SLOT` when the key is physically returned to the current assigned slot according to the accepted parking workflow.

Those later decisions own their state-specific guards and exactly when checkout/return is mandatory. VAL-005C only supplies the safe append-only primitive and scope/actor/resource enforcement.

`RELEASED` remains for later handoff/completion work and is not emitted by VAL-005C.

### 14. Persistence decision

VAL-005C requires no Prisma schema change and no migration.

Exactly 19 existing forward-only migrations remain unchanged.

Do not add:

- another current key-assignment table;
- a custody status enum on ValetSession;
- QR token/secret columns;
- assignment-history mutation columns;
- a second concurrency/version field.

The existing `ValetSession.key_slot_id`, unique occupancy index, `version`, `KeySlot`, `KeyCustodyEvent`, and AuditEvent persistence are sufficient.

### 15. Structure and architecture

DEC-028 dependency direction and DEC-030 300-line structure enforcement remain binding.

VAL-005C should follow the repository's thin controller/service/explicit-command pattern and reuse the DEC-032 transaction-aware eligibility boundary rather than duplicating authorization logic.

Do not introduce a generic repository framework or cross-feature dependency inversion merely for this slice.

### 16. Required proof

Implementation must prove at minimum:

- valid initial assignment succeeds only for an operationally eligible actor at the session Location;
- inactive/wrong-scope/wrong-location/occupied KeySlots cannot be assigned;
- scanner/manual code uses the same exact resource-code contract and code never grants authority;
- assign requires `AWAITING_PARKING` and correct expected version;
- successful initial assignment increments version once and appends exactly one `SLOT_ASSIGNED` plus one audit event;
- current same-slot semantic no-op produces no extra version/event/audit mutation;
- reassignment A -> B increments version once and appends ordered `SLOT_CLEARED(A)` then `SLOT_ASSIGNED(B)` plus one audit event;
- clear increments version once and appends `SLOT_CLEARED` plus one audit event;
- already-null clear is a semantic no-op;
- concurrent same-slot assignment across two sessions has at most one winner and no duplicate committed occupancy;
- custody/audit failure rolls back session assignment/version and vice versa;
- custody history remains append-only under runtime privileges;
- no ValetSession physical state transition occurs in VAL-005C;
- no Task/Dispatch, GPS/maps, Retrieval, handoff, payment or payroll behavior is introduced;
- migrations 1–19 and Prisma schema remain unchanged;
- architecture, lint, typecheck, focused/full tests, build and Prisma validation remain green.

## Consequences

- Key assignment becomes a safe operational command instead of a generic session patch.
- Scanner and manual fallback share one non-secret resource identifier contract.
- Corrections preserve immutable custody history while current assignment remains accurate.
- Existing database uniqueness remains the hard protection against double occupancy.
- Later Start Parking / Confirm Parked commands can reuse one transaction-aware custody boundary without VAL-005C prematurely owning their physical state transitions.
