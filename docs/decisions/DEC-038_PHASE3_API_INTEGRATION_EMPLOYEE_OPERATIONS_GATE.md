# DEC-038 — Phase 3 API / Integration / Employee Operations Gate

Status: Accepted  
Date: 2026-08-12  
Issue: #116 (`VAL-005H — Phase 3 API / Integration / Employee Operations Gate`)

> Amendment notice (2026-08-25): `DEC-065` — Verified Key Return During Confirm
> Parked (`Proposed`) amends §11 (Key custody proof) once Accepted so that
> `RETURNED_TO_SLOT` succeeds only after server-verified scanned KeySlot
> evidence during Confirm Parked. Until then this decision remains fully
> binding.

## Context

VAL-005A through VAL-005G are merged and establish the complete Phase 3 Parking backend primitives:

- ParkingZone / ParkingSpot / KeySlot persistence and occupancy integrity;
- Shift operational eligibility;
- KeySlot assignment/correction and append-only key custody history;
- Task / Dispatch persistence;
- Parking Task queue, assignment, acceptance, decline and reassignment;
- Start Parking;
- Confirm Parked.

The binding Phase 3 execution plan says Phase 3 closes only when a real authorized employee flow can execute from `AWAITING_PARKING` through `PARKED`, while preserving tenant/Location isolation, Shift eligibility, one-active-work/resource guarantees, append-only history and the employee-oriented API boundary.

VAL-005H is therefore a gate/integration slice. It does not invent another product workflow. Its job is to prove that already accepted Phase 3 contracts compose correctly through the production API/module/transaction boundaries and to fix only narrow integration defects discovered by that proof.

DEC-030 and `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding. All newly authored code files must remain at or below 300 physical lines.

## Decision

### 1. Scope

VAL-005H owns:

- one coherent Phase 3 employee Parking operations integration gate;
- end-to-end HTTP/API proof across Key Assignment, Dispatch, Start Parking and Confirm Parked;
- production route/module wiring verification;
- authoritative version propagation between operations;
- tenant/Location/Shift isolation across the composed workflow;
- canonical Task ownership across assignment, acceptance and parking lifecycle;
- current KeySlot and ParkingSpot occupancy protection across the composed workflow;
- append-only KeyCustodyEvent, DispatchEvent and AuditEvent sequence proof;
- reassignment/decline/open-work behavior required to prove handoff-safe employee operations;
- guest/privacy regression checks for exact key-slot / parking-location detail;
- full architecture, schema/migration, contract, regression and Linux CI gates;
- only narrow code/wiring fixes proven necessary by failing integration evidence.

VAL-005H adds no new business feature merely to simplify testing.

### 2. Database boundary

The database remains at exactly 20 forward-only migrations.

VAL-005H must not modify:

- `packages/database/prisma/schema.prisma`;
- any migration 1–20;
- runtime persistence shape;
- Task/Dispatch/Key/parking enum shape.

No migration 21 is authorized.

If a true persistence defect is discovered that cannot be corrected without schema/migration change, implementation must stop and report it for a new focused accepted decision instead of changing the database inside VAL-005H.

### 3. Dependency boundary

No new runtime or dev dependency is expected or authorized for the normal gate.

`package.json` files and `pnpm-lock.yaml` remain unchanged unless an unavoidable repository-tooling defect is proven and separately accepted.

Use the existing NestJS, PostgreSQL, Vitest and repository test infrastructure.

### 4. No new public product surface by default

The accepted Phase 3 staff route surface already exists.

VAL-005H must not add a new convenience route, generic PATCH endpoint, dashboard endpoint, employee UI endpoint or alternate mutation merely to make the integration test easier.

A route/wiring change is allowed only when the route was already accepted by DEC-033/035/036/037 but is missing or incorrectly connected in the production module graph.

The gate must preserve these accepted staff operations:

```text
POST /v1/staff/valet-sessions/:sessionId/key-slot/assign
POST /v1/staff/valet-sessions/:sessionId/key-slot/clear

POST /v1/staff/valet-sessions/:sessionId/parking-task/queue
GET  /v1/staff/tasks/queue?locationId=<uuid>
POST /v1/staff/tasks/:taskId/assign
POST /v1/staff/tasks/:taskId/accept
POST /v1/staff/tasks/:taskId/decline
POST /v1/staff/tasks/:taskId/reassign

POST /v1/staff/valet-sessions/:sessionId/start-parking
POST /v1/staff/valet-sessions/:sessionId/confirm-parked
```

### 5. Canonical successful employee flow

At least one coherent PostgreSQL-backed HTTP integration test must prove this exact operational composition:

```text
ValetSession = AWAITING_PARKING

1. assign current KeySlot
2. queue the Parking Task
3. claim/assign the Parking Task
4. accept the Parking Task
5. start Parking
6. confirm the ParkingSpot

ValetSession = PARKED
Parking Task = COMPLETED
```

The flow must use the production controllers/services/command executors and normal API error/contract boundaries rather than replacing the positive path with direct SQL state mutation after the initial fixture is created.

Fixture setup may create the precondition state and configured resources directly through test/admin persistence, but every Phase 3 operation being proven by the gate must execute through its accepted application/API path.

### 6. Authentication test boundary

The gate proves Phase 3 authorization composition, not a new Staff Auth design.

The composed Phase 3 flow must use an authenticated Staff principal that resolves to a persisted User and then derives Organization, membership, role, Location access, Shift and Task authority from the database.

A dependency-injected test principal resolver may be used in a focused HTTP integration harness if that is the established repository pattern, provided:

- it supplies only persisted `userId` identity;
- Organization/Location/membership/role/Shift/Task ownership still come from production database authorization code;
- no client-supplied authority bypass is introduced;
- the full existing Staff Auth regression suite remains green.

VAL-005H must not add a production test-auth switch, environment-variable bypass, alternate identity header or test-only route.

### 7. Phase 3 operational eligibility

Every field-operation step that requires DEC-032 eligibility must still prove it inside the same protected transaction as defined by its accepted decision.

The gate must prove at least:

- the same eligible employee can execute the normal flow at the correct Location;
- a wrong-Location actor cannot use that workflow against the session/task;
- an ended Shift cannot continue protected field operations;
- active open Task ownership blocks normal Shift end where DEC-035 requires it;
- after Parking Task completion, that Task no longer blocks normal Shift end.

The gate must not create a force-end or manager/admin bypass.

### 8. Version propagation

The composed flow must use returned authoritative versions from one command as inputs to the next contested command.

At minimum prove the expected progression without hard-coding an invented second concurrency mechanism:

- KeySlot assignment increments `ValetSession.version` when it performs a real mutation;
- Task assignment increments `Task.version`;
- Task acceptance increments `Task.version`;
- Start Parking increments both Task and ValetSession versions exactly once;
- Confirm Parked increments both exactly once.

A stale version at a protected command must continue returning the existing stable `VERSION_CONFLICT` contract.

VAL-005H must not add an operation token, replay table, command ID or second version field.

### 9. Task ownership and lifecycle proof

The gate must prove the Parking Task lifecycle through the canonical Task projection:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

`Task.current_assignee_membership_id` remains canonical ownership.

`ValetSession.current_assignee_membership_id` must not be synchronized or used as Hybrid Dispatch authority.

The final completed Parking Task may retain its assignee according to the accepted Task contract.

Retrieval Task behavior is not part of this gate.

### 10. Duplicate active work protection

The DEC-034 partial unique index remains final authority for active `(valet_session_id, task_type)` work.

The gate must prove either directly or through a focused regression assertion that:

- repeated/concurrent Parking Task queue attempts do not create two active Parking Tasks;
- the authoritative active Task is reused/classified safely;
- no duplicate `QUEUED` DispatchEvent is appended for semantic retry;
- raw PostgreSQL constraint information is not leaked.

Do not add UI-only duplicate suppression as a substitute.

### 11. Key custody proof

The successful flow must establish an explainable Key custody sequence for the same session.

The expected normal history contains the relevant accepted events in order:

```text
SLOT_ASSIGNED
CHECKED_OUT
RETURNED_TO_SLOT
```

Corrections may add earlier `SLOT_CLEARED` / `SLOT_ASSIGNED` pairs when a dedicated negative/correction test uses them, but the canonical happy path does not need to manufacture corrections.

The gate must prove:

- current `ValetSession.key_slot_id` remains the assigned slot through PARKED;
- CHECKED_OUT is written only when Start Parking succeeds;
- RETURNED_TO_SLOT is written only when Confirm Parked succeeds;
- history is append-only;
- actor/session/Location/slot scope is authoritative and consistent.

No `RELEASED` event is part of Phase 3.

### 12. Parking resource proof

Confirm Parked continues to use exact persisted `ParkingSpot.code` as the submitted resource identifier.

The gate must prove the final PARKED projection has:

- authoritative `parking_zone_id` derived from the selected persisted Spot;
- authoritative `parking_spot_id` for that Spot;
- `parked_at` set from server/database time;
- no double current ParkingSpot occupancy.

At least one negative/concurrency proof must preserve the existing database unique occupancy boundary.

No QR bearer secret or client-selected Zone authority is introduced.

### 13. Dispatch history proof

The successful flow must leave an append-only lifecycle history that can explain the Parking Task.

At minimum the normal path must include the applicable sequence:

```text
QUEUED
ASSIGNED
ACCEPTED
IN_PROGRESS
COMPLETED
```

The gate must also prove a reassignment or decline history path already accepted by DEC-035, sufficient to show that previous/new assignee and reason facts remain append-only and do not rewrite prior events.

Do not weaken the existing rule that `IN_PROGRESS` reassignment is forbidden.

### 14. Audit / Black Box proof

The composed successful flow must prove the required AuditEvents from the accepted commands are present with persisted Organization/Location/session/task/actor scope and narrow metadata.

At minimum verify the relevant events for:

- KeySlot assignment;
- Task assignment;
- Task acceptance;
- Start Parking;
- Confirm Parked.

Where the tested path includes reassignment/decline, verify the corresponding accepted AuditEvent.

The gate should validate event existence, actor/scope and safe transition metadata, not snapshot arbitrary implementation-specific JSON ordering.

No secret, bearer token, cookie, guest credential, password, payment credential, raw request body or GPS value may be present in Audit metadata.

### 15. Shared time / ordering expectations

Do not invent a global cross-command timestamp equality requirement.

Each individual accepted command keeps its own PostgreSQL-authoritative operation time and atomic event set.

The gate must prove logical ordering using persisted timestamps plus deterministic IDs/order only where repository semantics require it.

Within Start Parking and Confirm Parked, the already accepted shared-operation-time behavior remains unchanged.

### 16. Tenant and Location isolation

The composed gate must include negative proof that a staff User from another Organization or unauthorized Location cannot:

- assign/correct the session KeySlot;
- read or mutate the target Task through the accepted staff Task routes;
- start Parking;
- confirm Parked.

Use existing non-disclosing public errors.

The test must not depend on exact protected-resource-existence details leaking through error differences.

### 17. Employee API usability boundary

Phase 3 closes only if the existing API can support the later Employee/Valet UI without requiring direct database knowledge.

The gate must verify that returned projections provide the IDs/status/version facts needed to drive the next accepted action:

- KeySlot assignment response exposes the updated session/version projection already defined by DEC-033;
- Task queue/assignment/acceptance responses expose Task ID, session ID, status, current assignee and version through the existing strict Task projection;
- Start Parking response exposes session/task IDs, states and versions;
- Confirm Parked response exposes the final parked Task/session projection and selected Spot/Zone identifiers for authorized staff.

VAL-005H must not add a dashboard-style aggregate endpoint merely to collect these fields.

### 18. Guest privacy gate

The guest surface must not expose exact operational details that belong only to staff.

The gate must verify existing guest-facing session/status responses do not reveal exact:

- KeySlot ID/code;
- ParkingZone ID/code;
- ParkingSpot ID/code;
- employee GPS/location coordinates;
- internal Task assignment details not already explicitly approved for Guest.

If an existing guest endpoint leaks one of these values, VAL-005H may make the narrowest response-contract/serialization fix required to restore the already binding privacy boundary.

Do not add guest parked-notification delivery in this task.

### 19. Production module wiring

The gate must verify the accepted Phase 3 controllers are reachable through the production NestJS module graph.

A narrowly proven wiring correction is in scope, for example:

- an accepted controller omitted from a production feature module;
- a feature module omitted from `AppModule`;
- missing normal RequestId / shared error infrastructure on an accepted controller;
- missing contract export needed by the already accepted route.

Do not reorganize modules solely for naming aesthetics.

### 20. Allowed integration fixes

VAL-005H may fix only defects that are demonstrated by the gate and that preserve the accepted semantics of DEC-031 through DEC-037.

Examples:

- incorrect production module/controller wiring;
- response schema mismatch between two accepted operations;
- error mapper missing an already accepted stable error;
- version projection not passed/returned correctly;
- a cross-slice transaction/helper assumption that makes the accepted flow impossible;
- guest serialization leak that violates an existing privacy invariant.

A fix that would change authorization, state transition, persistence shape, Task lifecycle or resource policy requires a new focused decision and is not silently absorbed here.

### 21. Explicitly out of scope

VAL-005H must not implement:

- RetrievalRequest creation;
- Retrieval Task creation/assignment/acceptance;
- `PARKED -> REQUESTED` or later ValetSession transitions;
- key `RELEASED` / handoff completion;
- GPS capture, maps, tracking or geofences;
- parked notification provider delivery;
- payment, validation or refund behavior;
- secure handoff/pickup-code behavior;
- payroll/timekeeping;
- dashboard UI;
- Employee/Valet UI/PWA implementation;
- offline queue/replay;
- timeout/requeue scheduler;
- generic parking configuration CRUD;
- AI assignment / V2 / Enterprise behavior.

### 22. Security regression gate

VAL-005H implementation must perform a focused security self-review of the composed Phase 3 surface for:

- client-supplied authority;
- cross-tenant or cross-Location access;
- stale-version bypass;
- wrong-owner parking actions;
- Shift eligibility checked outside protected transactions;
- duplicate active Task races;
- KeySlot/ParkingSpot occupancy races;
- raw PostgreSQL/constraint leakage;
- append-only history mutation;
- partial transaction commits;
- exact operational detail leaking to guest responses;
- auth/cookie/token values entering Audit metadata;
- forbidden IN_PROGRESS reassignment;
- later-phase behavior accidentally reachable.

This focused review is part of VAL-005H. It does not by itself claim that a separate repository-wide Standard Security Scan was run.

If a fresh Standard Security Scan is actually run, report it explicitly with its result. Otherwise do not claim one.

### 23. Required automated proof

The implementation must add a focused Phase 3 gate suite proving, at minimum:

1. the production Phase 3 route/module surface is wired;
2. one employee can execute KeySlot assign -> Parking Task queue -> assign/self-claim -> accept -> Start Parking -> Confirm Parked;
3. final session is PARKED;
4. final Parking Task is COMPLETED;
5. final session keeps its current KeySlot;
6. final session has the selected Zone and Spot;
7. `parking_started_at` and `parked_at` are populated in order;
8. Task ownership stays canonical on Task and the legacy ValetSession assignee is not synchronized;
9. returned versions are sufficient to drive the next command;
10. stale Task/session versions retain `VERSION_CONFLICT` semantics;
11. wrong Organization is concealed;
12. wrong Location is concealed;
13. ended Shift prevents protected field operations;
14. open Task ownership blocks Shift end;
15. completed Parking Task no longer blocks Shift end;
16. duplicate/concurrent Parking Task queueing keeps one active Task;
17. KeySlot current occupancy cannot be double-booked;
18. ParkingSpot current occupancy cannot be double-booked;
19. normal Key custody history includes SLOT_ASSIGNED -> CHECKED_OUT -> RETURNED_TO_SLOT;
20. normal Dispatch history includes QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED;
21. reassignment or decline history preserves previous/current actor facts and reason semantics;
22. IN_PROGRESS reassignment remains rejected;
23. required AuditEvents exist atomically for the tested flow;
24. Audit metadata contains no secret/credential material;
25. guest-facing responses expose no exact KeySlot/Zone/Spot operational detail;
26. no Retrieval route/behavior is introduced;
27. no GPS/maps/tracking behavior is introduced;
28. migrations remain exactly 20 and byte-for-byte unchanged;
29. Prisma schema is unchanged;
30. package manifests and lockfile are unchanged;
31. all strict shared contracts remain valid;
32. all authored code files satisfy the architecture/300-line policy.

Existing focused A–G suites remain authoritative and must continue to pass; the gate suite complements them rather than duplicating every individual edge case.

### 24. Quality gates

VAL-005H must pass:

```text
corepack pnpm architecture:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm --filter @valet/database exec prisma validate
git diff --check
```

It must also run the focused Phase 3 operations gate suite directly and relevant focused regressions for:

- Key custody;
- Hybrid Dispatch;
- Shift end;
- Start Parking;
- Confirm Parked;
- guest privacy/status surface;
- migration/schema integrity.

Changed-file formatting must pass without mass-formatting unrelated grandfathered files.

### 25. Frozen diff boundaries

Before the implementation commit, confirm expected empty diffs for:

```text
docs/
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/
pnpm-lock.yaml
package.json
apps/*/package.json
```

The implementation branch must not edit docs; project completion/status synchronization is done after review/merge.

### 26. Phase 3 closure rule

VAL-005H is complete only after:

- the focused gate implementation is reviewed;
- Linux CI is green;
- the implementation PR is merged;
- Issue #116 is completed;
- the project status snapshot is synchronized to mark VAL-005A through VAL-005H completed;
- Phase 3 is explicitly recorded as completed;
- the next project phase is identified from the binding execution sequence without pulling its implementation into this PR.

A green test suite that leaves a known Phase 3 integration blocker unresolved does not close Phase 3.

## Consequences

- Phase 3 closes on evidence of a composed employee workflow, not merely on isolated feature tests.
- The employee API remains task-oriented and thin for later UI integration.
- Accepted A–G behavior remains frozen unless a proven integration defect requires the narrowest compatible fix.
- Retrieval, tracking, payments, handoff and UI remain cleanly deferred to their later phases.
- Database migrations remain exactly 20 for the Phase 3 closure baseline.
