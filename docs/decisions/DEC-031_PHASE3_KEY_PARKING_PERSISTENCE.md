# DEC-031 — Phase 3 Key & Parking Persistence Foundation

Status: Accepted

Canonical decision log entry: `docs/08_DECISIONS_LOG.md` (DEC-031). This file
retains the expanded implementation contract and must remain behaviorally
consistent with that canonical entry.

## Context

Phase 3 starts after VAL-004S. The existing schema already contains `KeySlot`, `ParkingSpot`, and nullable `ValetSession.key_slot_id` / `parking_spot_id`, but it does not yet model Parking Zones, append-only key custody history, or concurrency-safe current slot/spot occupancy. Hybrid Dispatch remains a separate later concern and must not be encoded into `ValetSession` states or `current_assignee_membership_id`.

The binding ValetSession state machine already defines `AWAITING_PARKING -> PARKING -> PARKED`, requires valid key custody before Parking starts, and requires a permitted Zone/Spot assignment before PARKED. VAL-005A provides persistence/integrity only; it does not implement those commands.

DEC-030 and `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding: every new authored code file must be at most 300 physical lines, grandfathered oversized files may not grow, and no line-count gaming is allowed.

## Decision

### 1. Scope

VAL-005A is a persistence/integrity slice only.

It may change Prisma schema, add exactly one forward-only migration, update runtime-role grants required by the new append-only table, update deterministic seed/integrity tests, and synchronize project docs.

It must not add HTTP routes, `start-parking`, `confirm-parked`, Task/Dispatch lifecycle, assignment algorithms, guest/retrieval flows, or Phase 4 behavior.

### 2. Migration

Add migration 19 only:

`20260811001900_phase3_key_parking_persistence`

The repository moves from exactly 18 migrations to exactly 19 migrations.

No existing migration may be edited or reordered.

### 3. ParkingZone

Add a `ParkingZoneStatus` enum with exactly:

- `ACTIVE`
- `INACTIVE`

Add `ParkingZone` with:

- `id` UUID primary key
- `organization_id` UUID
- `location_id` UUID
- `code` text
- `label` text
- `status` default `ACTIVE`
- `created_at`
- `updated_at`

Integrity:

- Organization/Location scope uses the existing composite tenant-safe Location relation.
- `code` is unique within Location.
- `(organization_id, location_id, id)` is unique for composite foreign keys.
- Zone `code` is the operator-visible canonical identifier and may be encoded in a QR. It is not a bearer credential or authorization secret.

### 4. ParkingSpot -> ParkingZone

Add nullable `parking_zone_id` to `ParkingSpot`.

It is nullable at the persistence-foundation boundary so existing production/configuration data is not silently assigned to an invented business zone during migration.

When non-null, `parking_zone_id` must reference a ParkingZone in the same Organization and Location through a composite foreign key.

Add the composite uniqueness required to reference a spot together with its zone:

`(organization_id, location_id, parking_zone_id, id)`

Existing `ParkingSpot.code` remains the canonical operator-visible QR/manual identifier and remains unique within Location.

VAL-005A does not create a management API for assigning legacy spots to zones.

### 5. ValetSession parking assignment fields

Add nullable `parking_zone_id` to `ValetSession`.

A session may later be assigned to a Zone without an exact Spot, so `parking_zone_id` may be non-null while `parking_spot_id` is null.

If `parking_spot_id` is non-null:

- `parking_zone_id` must also be non-null;
- the selected ParkingSpot must belong to that exact same Organization, Location, and ParkingZone.

Enforce this with database integrity, including a check constraint and same-scope composite foreign key; do not rely only on application validation.

VAL-005A itself must not populate these fields through a domain command.

### 6. Current resource occupancy

The current `ValetSession.key_slot_id` and `parking_spot_id` fields represent current assignment, not immutable history.

Enforce database-level current exclusivity:

- at most one ValetSession may reference a given non-null KeySlot in the same Organization/Location;
- at most one ValetSession may reference a given non-null ParkingSpot in the same Organization/Location.

Use PostgreSQL uniqueness semantics over the nullable current-assignment fields; multiple null assignments remain allowed.

Later lifecycle commands are responsible for clearing current slot/spot assignment when the physical resource becomes reusable. Historical custody is retained separately and must not depend on leaving a resource ID forever on ValetSession.

### 7. Key custody history

Add enum `KeyCustodyEventType` with exactly:

- `SLOT_ASSIGNED`
- `CHECKED_OUT`
- `RETURNED_TO_SLOT`
- `SLOT_CLEARED`
- `RELEASED`

Add append-only `KeyCustodyEvent` with:

- `id` UUID primary key
- `organization_id` UUID
- `location_id` UUID
- `valet_session_id` UUID
- `key_slot_id` nullable UUID
- `actor_membership_id` UUID
- `event_type`
- `occurred_at` server/database-authoritative timestamp
- `created_at` server/database-authoritative timestamp

Relations must be tenant/location safe:

- ValetSession must resolve within the same Organization + Location.
- actor membership must resolve in the same Organization.
- when `key_slot_id` is non-null, the KeySlot must resolve in the same Organization + Location.

For `SLOT_ASSIGNED`, `CHECKED_OUT`, `RETURNED_TO_SLOT`, and `SLOT_CLEARED`, `key_slot_id` is required by a database check constraint.

`RELEASED` may have a null slot because later handoff/release flows may clear the current slot before or as release completes.

Index history for deterministic session-oriented lookup using `(valet_session_id, occurred_at, id)`.

The table is append-only. The ordinary runtime role receives only `SELECT, INSERT`; `UPDATE, DELETE, TRUNCATE` are revoked from runtime and PUBLIC following the existing append-only table pattern.

Future custody mutation commands must append the appropriate KeyCustodyEvent and required AuditEvent in the same transaction. VAL-005A only establishes the storage/enforcement boundary.

### 8. QR/manual identifier semantics

Do not introduce a QR secret/token column in VAL-005A.

`ParkingZone.code`, `ParkingSpot.code`, and `KeySlot.code` are canonical resource identifiers that may be printed or encoded as static QR values.

Scanning a resource QR only identifies the resource. It never authenticates the employee and never grants tenant/location authority. Future commands must still derive staff identity and authorization from Staff Auth and server-side scope.

Manual entry of the same resource code remains possible where the later accepted command/policy permits it.

### 9. Dispatch separation

VAL-005A does not add `Task`, task status enums, assignment history, load scoring, or dispatch ownership.

Do not repurpose `ValetSession.current_assignee_membership_id` as the Hybrid Dispatch model.

The canonical Task lifecycle remains separate and will be introduced by a later focused Phase 3 decision.

### 10. Seed/data compatibility

Do not invent production ParkingZone assignments for existing ParkingSpots during migration.

Existing spots remain valid persistence rows with nullable `parking_zone_id` until explicitly configured by a later management/configuration path or deterministic development seed.

Demo/seed data may add synthetic ParkingZones and attach synthetic ParkingSpots deterministically, provided existing seed guarantees remain idempotent and clearly non-production.

### 11. Authorization and behavior freeze

This persistence slice does not change application authorization rules.

Do not change:

- Staff Auth/login/refresh/logout
- Anti-Abuse
- Guest Access
- Check-In routes or commands
- `complete-check-in`
- ValetSession state enum or transitions
- production TLS/database connection policy
- payment/retrieval/handoff behavior
- existing AuditEvent semantics

No new public/runtime command surface is created in VAL-005A.

### 12. Required proof

Implementation must prove at minimum:

- migration count becomes exactly 19 and migrations 1–18 are byte-for-byte unchanged;
- ParkingZone tenant/location foreign keys and Location-code uniqueness;
- cross-Organization/cross-Location Zone/Spot relationships are rejected;
- a ParkingSpot may remain zone-null for migration compatibility;
- a ValetSession may have Zone without Spot;
- a ValetSession cannot have Spot without Zone;
- a ValetSession Spot must belong to its exact assigned Zone;
- two current sessions cannot occupy the same non-null KeySlot;
- two current sessions cannot occupy the same non-null ParkingSpot;
- multiple sessions with null KeySlot/Spot continue to work;
- KeyCustodyEvent actor/session/slot scope is tenant-safe;
- slot-required custody event types reject null `key_slot_id`;
- RELEASED may use null `key_slot_id`;
- runtime-role grants make KeyCustodyEvent append-only;
- deterministic seed remains idempotent if updated;
- DEC-028 architecture checks and DEC-030 300-line enforcement remain green;
- lint, typecheck, test, build, Prisma validation, migration diff/integrity gates, and changed-file formatting pass.

## Consequences

- Phase 3 gains a safe persistence base for key-slot custody and Zone/Spot parking assignment.
- Current KeySlot/Spot double occupancy is prevented before command/API work starts.
- Existing production ParkingSpots are not silently placed into invented Zones.
- Static QR/manual resource identification remains simple and does not become an authentication secret.
- Hybrid Dispatch remains cleanly separated for its own focused decision/task.
- `start-parking` and `confirm-parked` remain future command slices built on this persistence foundation.
