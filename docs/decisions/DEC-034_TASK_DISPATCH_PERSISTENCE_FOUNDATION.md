# DEC-034 — Task / Dispatch Persistence Foundation

Status: Accepted  
Date: 2026-08-12  
Issue: #97 (`VAL-005D — Task / Dispatch Persistence Foundation`)

## Context

Blueprint v1.0 and DEC-014 separate Hybrid Dispatch work state from the physical `ValetSession` custody state. The canonical Task path is:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

Phase 3 has already established:

- parking/key persistence through VAL-005A / DEC-031;
- transaction-aware Shift operational eligibility through VAL-005B / DEC-032;
- KeySlot assignment/correction and internal key checkout/return custody primitives through VAL-005C / DEC-033.

The current Prisma schema contains no `Task` or `DispatchEvent` model. `ValetSession.current_assignee_membership_id` exists only as a legacy/current operational read field and is explicitly not the canonical Hybrid Dispatch authority.

VAL-005D must therefore add only the persistence and database-integrity boundary required by later VAL-005E–G commands. It must not implement assignment, acceptance, reassignment, parking transitions, GPS, Retrieval behavior, or HTTP APIs.

DEC-030 and `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding for implementation code.

## Decision

### 1. Scope

VAL-005D is a persistence/integrity slice only.

It may:

- update Prisma schema;
- add exactly one forward-only migration;
- update runtime-role privilege provisioning for the new tables;
- update deterministic seed/fixtures if needed;
- add focused database integrity/runtime-role tests.

It must not add:

- Task/Dispatch HTTP routes;
- assignment/suggestion algorithms;
- accept/decline/reassign commands;
- supervisor authorization behavior;
- ValetSession physical-state transitions;
- parking/key command behavior;
- GPS/maps/proximity tracking;
- Retrieval behavior;
- payment, handoff, payroll, dashboard, employee UI, offline, NFC/BLE, Smart Key Vault, or AI assignment behavior.

### 2. Migration

Add exactly migration 20:

```text
20260812002000_phase3_task_dispatch_persistence
```

The repository moves from exactly 19 migrations to exactly 20 migrations.

Migrations 1–19 are immutable and must not be edited, reordered, renamed, squashed, or regenerated.

### 3. Task type

Add `TaskType` with exactly:

```text
PARKING
RETRIEVAL
```

`PARKING` is used by Phase 3.

`RETRIEVAL` is persisted now only because Blueprint v1.0 requires the same Hybrid Dispatch Task model for later Retrieval and this avoids a second schema redesign. VAL-005D does not create Retrieval tasks or implement Retrieval behavior.

Do not add task types for handoff, payment, incident, generic maintenance, or speculative future work.

### 4. Task status

Add `TaskStatus` with exactly:

```text
QUEUED
ASSIGNED
ACCEPTED
IN_PROGRESS
COMPLETED
CANCELLED
```

The normal canonical path remains:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

`CANCELLED` is a terminal exceptional status required so later focused commands can end an intended operation without pretending it completed.

`DECLINED` and `REASSIGNED` are not Task statuses. They are immutable Dispatch history facts that may cause the current Task projection to return to `QUEUED` or move to another assignee according to VAL-005E.

`INCIDENT` remains a separate Incident lifecycle and is not a Task status.

### 5. Task current projection

Add `Task` with:

- `id` UUID primary key;
- `organization_id` UUID;
- `location_id` UUID;
- `valet_session_id` UUID;
- `task_type` `TaskType`;
- `status` `TaskStatus`, default `QUEUED`;
- `current_assignee_membership_id` nullable UUID;
- `version` integer, default `1`;
- `created_at` database/server-authoritative timestamp;
- `updated_at` application/ORM-maintained timestamp.

`Task` is the mutable current operational projection. Historical assignment/lifecycle facts live in append-only `DispatchEvent` rows.

Do not add an additional generic payload JSON, score blob, route/GPS fields, timeout policy fields, client-selected priority scheme, or provider-specific assignment fields in VAL-005D.

### 6. Task tenant and Location integrity

Database relations must enforce:

- Task Organization exists;
- Task Location belongs to that exact Organization;
- Task ValetSession belongs to that exact Organization + Location;
- when non-null, current assignee membership belongs to that exact Organization.

Location eligibility, active membership, role, explicit Location access, Shift status, and current workload are dynamic authorization/assignment facts and remain application/transaction checks in VAL-005E. They are not denormalized into Task persistence.

Provide composite uniqueness required for exact-scope foreign keys where needed.

### 7. Assignee shape

The current assignee field represents only the current Task owner/assignment projection.

Persistence must enforce at minimum:

- `QUEUED` -> `current_assignee_membership_id IS NULL`;
- `ASSIGNED`, `ACCEPTED`, and `IN_PROGRESS` -> `current_assignee_membership_id IS NOT NULL`.

For terminal `COMPLETED` and `CANCELLED`, the current assignee may remain populated to preserve the final current projection; immutable DispatchEvent history remains authoritative for who was assigned/accepted/completed or cancelled.

Later commands own transition legality and whether cancellation clears or retains the current assignee. VAL-005D must not invent those command semantics.

`ValetSession.current_assignee_membership_id` is not synchronized by this persistence slice and must not be used as Task authority.

### 8. Optimistic concurrency

`Task.version` is the one optimistic concurrency field for later contested Task mutations.

Every later successful current-projection mutation will increment it according to the focused command decision.

VAL-005D adds no second lock/version field and no durable client-operation replay field.

### 9. One active intended operation

The database must prevent duplicate active work for the same intended operation.

For one `(valet_session_id, task_type)`, at most one Task may exist in an active status:

```text
QUEUED
ASSIGNED
ACCEPTED
IN_PROGRESS
```

Enforce this with a PostgreSQL partial unique index over the Task session/type identity for those statuses.

`COMPLETED` and `CANCELLED` are terminal and do not block a later distinct Task of the same type when a later accepted workflow legitimately creates one.

This uniqueness is the final database concurrency authority. Later commands must map its race failures to safe stable application errors without leaking raw SQL/constraint names.

### 10. DispatchEvent types

Add `DispatchEventType` with exactly:

```text
QUEUED
ASSIGNED
ACCEPTED
DECLINED
REASSIGNED
IN_PROGRESS
COMPLETED
CANCELLED
```

These are immutable operational history facts.

They do not replace `AuditEvent`; later focused commands decide which protected mutations require both DispatchEvent and AuditEvent atomically.

### 11. DispatchEvent persistence

Add append-only `DispatchEvent` with:

- `id` UUID primary key;
- `organization_id` UUID;
- `location_id` UUID;
- `task_id` UUID;
- `valet_session_id` UUID;
- `event_type` `DispatchEventType`;
- `actor_membership_id` nullable UUID;
- `previous_assignee_membership_id` nullable UUID;
- `new_assignee_membership_id` nullable UUID;
- `reason` nullable text;
- `occurred_at` database/server-authoritative timestamp;
- `created_at` database/server-authoritative timestamp.

The event must reference the exact same Organization + Location + ValetSession as its Task through database-enforced composite relations.

When present, actor/previous/new assignee memberships must belong to the same Organization.

`actor_membership_id` is nullable because later system-generated queue/assignment facts may have no tenant membership actor. A null actor must never be interpreted as authorization; the command creating the event remains responsible for its accepted authority model.

### 12. Dispatch event field-shape constraints

Database checks must enforce basic structural meaning without attempting to encode all future command policy.

At minimum:

- `QUEUED`: previous/new assignee are null;
- `ASSIGNED`: new assignee is non-null;
- `ACCEPTED`: new assignee is non-null;
- `DECLINED`: previous assignee is non-null;
- `REASSIGNED`: previous and new assignee are non-null and different;
- `IN_PROGRESS`: new assignee is non-null;
- `COMPLETED`: new assignee is non-null;
- `CANCELLED`: no mandatory assignee shape beyond tenant-safe nullable fields.

`reason` remains nullable at persistence level. VAL-005E must require a bounded non-empty reason where the accepted supervisor reassignment/decline policy requires one.

Do not use free-form event metadata JSON for the core assignment facts above.

### 13. Append-only history

`DispatchEvent` is append-only.

The ordinary runtime role receives only:

```text
SELECT, INSERT
```

and must not receive:

```text
UPDATE, DELETE, TRUNCATE
```

PUBLIC must not receive mutation privileges.

Update the repository-owned append-only privilege provisioning so `dispatch_events` receives the same enforcement pattern as existing Audit/Condition/Key custody history.

Historical DispatchEvent rows are never rewritten to make a reassignment or correction look as if the previous assignment never happened.

### 14. Task runtime mutation privileges

`Task` is a current projection and therefore later runtime commands require:

```text
SELECT, INSERT, UPDATE
```

The ordinary runtime role must not require `DELETE` or `TRUNCATE` for Task lifecycle behavior.

Task lifecycle ends through terminal statuses, not row deletion.

### 15. Indexes

Add query indexes sufficient for later Phase 3 operations without speculative optimization.

At minimum:

- Task queue lookup by `(location_id, status, created_at, id)`;
- current workload lookup by `(current_assignee_membership_id, status)`;
- Task history/session lookup by `(valet_session_id, created_at, id)` or equivalent supporting index;
- Dispatch history lookup by `(task_id, occurred_at, id)`;
- Dispatch session timeline lookup by `(valet_session_id, occurred_at, id)` if not adequately covered by the Task join path.

Do not add GPS/proximity/geospatial indexes in VAL-005D.

### 16. No current-assignee duplication onto ValetSession

Do not repurpose or maintain `ValetSession.current_assignee_membership_id` as canonical Task ownership.

VAL-005D does not remove the existing column because that is an unrelated compatibility/schema decision.

Later read models may safely denormalize current Task owner only through an accepted decision; Task remains authoritative.

### 17. Shift eligibility boundary

VAL-005D adds no Shift foreign key to Task and no persisted `eligible` flag.

VAL-005E must reuse DEC-032 transaction-aware operational eligibility when assigning/accepting operational work at the exact Task Location.

A Shift ending later affects whether new work may be accepted/assigned; it does not rewrite historical Task or DispatchEvent rows.

### 18. Parking and key boundary

VAL-005D does not change ValetSession physical state and does not emit key custody events.

Later ownership remains:

- VAL-005E: assignment / acceptance / reassignment commands;
- VAL-005F: Start Parking, Task `IN_PROGRESS`, `AWAITING_PARKING -> PARKING`, and DEC-033 `CHECKED_OUT` integration;
- VAL-005G: Confirm Parked, Task `COMPLETED`, `PARKING -> PARKED`, parking Zone/Spot proof, and DEC-033 `RETURNED_TO_SLOT` integration.

### 19. Retrieval compatibility boundary

`TaskType.RETRIEVAL` persistence does not authorize Phase 4 Retrieval behavior in Phase 3.

VAL-005D must not create RetrievalRequest/Task coupling, retrieval queue commands, retrieval assignment, or Retrieval ValetSession transitions.

The purpose is schema compatibility only.

### 20. Seed and migration compatibility

There are no existing Task rows to migrate.

Migration 20 must not synthesize production Tasks or DispatchEvents from `ValetSession.current_assignee_membership_id` or current physical states.

Deterministic development seed may add synthetic Task/DispatchEvent examples only if needed for focused database tests/demo data and only if it remains clearly non-production and idempotent.

### 21. Authorization and behavior freeze

This persistence slice changes no public authorization rules and creates no public API surface.

Do not change:

- Staff Auth;
- Anti-Abuse;
- Guest Access;
- Check-In;
- Shift commands;
- KeySlot commands;
- ValetSession state transitions;
- payment/retrieval/handoff behavior;
- GPS/maps;
- existing AuditEvent/KeyCustodyEvent semantics.

### 22. Required proof

Implementation must prove at minimum:

- migration count becomes exactly 20 and migrations 1–19 remain byte-for-byte unchanged;
- fresh-database migration succeeds;
- Task enum values are exact;
- DispatchEvent enum values are exact;
- Task exact Organization/Location/ValetSession scope is database-enforced;
- current assignee cannot point cross-Organization;
- active duplicate `(ValetSession, TaskType)` Tasks are rejected;
- terminal historical Tasks permit a later distinct Task of the same type;
- QUEUED requires null current assignee;
- ASSIGNED/ACCEPTED/IN_PROGRESS require non-null current assignee;
- DispatchEvent Task/session/location scope is exact;
- actor/previous/new assignee membership scope is same-Organization;
- event field-shape checks reject structurally invalid assignment history;
- DispatchEvent runtime privileges are append-only;
- Task runtime does not require delete/truncate privilege;
- no Task/Dispatch HTTP route or command behavior is introduced;
- no ValetSession physical state changes are introduced;
- no GPS/maps/Retrieval/payment/handoff/payroll/UI behavior is introduced;
- architecture check, DEC-030 line limits, lint, typecheck, tests, build, Prisma validation, migration integrity/diff, and formatting checks pass.

## Consequences

- Hybrid Dispatch gains a first-class authoritative Task current projection separate from physical custody state.
- Assignment and lifecycle history becomes immutable and explainable through DispatchEvent.
- Duplicate active intended operations are blocked at the database boundary before assignment commands exist.
- Later VAL-005E can add safe assignment/acceptance/reassignment behavior without redesigning persistence.
- Later VAL-005F/VAL-005G can coordinate Task state, ValetSession physical state, key custody, parking location, DispatchEvent, and AuditEvent in focused atomic transactions.
- Retrieval can reuse the same Task model later without Phase 3 prematurely implementing Retrieval behavior.
