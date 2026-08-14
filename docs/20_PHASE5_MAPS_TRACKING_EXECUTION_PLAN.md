# Phase 5 Maps & Task-Scoped Tracking Execution Plan

Status: Binding execution plan  
Version: 1.0  
Date: 2026-08-14
Task: VAL-007
Issue: #153

## Purpose

This document locks the implementation sequence and product invariants for
**Phase 5 — Maps, zones and task-scoped tracking**.

It is an execution bridge, not a replacement for the Founder & Product Blueprint
v1.0 or focused Accepted decisions. Exact schema, command, authorization,
concurrency, ingestion, provider, retention and API semantics still require a
focused Accepted decision when they are not already locked by higher-authority
sources.

Phase 5 starts from the completed Phase 4 custody/retrieval baseline and adds the
sellable-MVP map/tracking capability without turning VAYLET into a continuous
employee-location monitoring product.

VAL-007 is documentation only. Production implementation begins in VAL-007A.

## Authority and reviewed sources

Implementation follows the authority order in `AGENTS.md`.

This plan was reconciled against:

- Founder & Product Blueprint v1.0 sections 05, 07, 08, 09, 12, 15, 16, 17,
  18, 19, 25, 26 and Appendix A;
- `AGENTS.md`;
- `docs/00_SOURCE_OF_TRUTH.md`;
- `docs/15_BLUEPRINT_V1_REBASELINE.md`;
- `docs/01_PRODUCT_SCOPE.md`;
- `docs/02_DOMAIN_MODEL.md`;
- `docs/03_DATABASE_SCHEMA.md`;
- `docs/04_VALET_SESSION_STATE_MACHINE.md`;
- `docs/05_ENGINEERING_RULES.md`;
- `docs/06_SECURITY_AND_DATA_RULES.md`;
- `docs/07_DEFINITION_OF_DONE.md`;
- `docs/12_AGENT_EXECUTION_PLAN.md`;
- `docs/17_AGENT_CODE_STRUCTURE_RULES.md`;
- `docs/18_PHASE3_OPERATIONS_EXECUTION_PLAN.md`;
- `docs/19_PHASE4_RETRIEVAL_HANDOFF_EXECUTION_PLAN.md`;
- Accepted DEC-007, DEC-013, DEC-017, DEC-031 through DEC-045 where relevant.

The owner-approved Phase 5 policy is recorded in
`docs/decisions/DEC-045_PHASE5_MAPS_TRACKING_POLICY.md`.

## Phase 5 objective

Add operational location visibility for active Parking/Retrieval movement while
preserving the physical custody and Task/Dispatch models already implemented.

Canonical physical movement windows remain:

```text
AWAITING_PARKING
  -> PARKING      tracking may start when effective policy is enabled
  -> PARKED       tracking stops

REQUESTED
  -> RETRIEVING   tracking may start when effective policy is enabled
  -> READY        tracking stops
```

Task/Dispatch remains separate:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

Phase 5 does not add map/tracking states to `ValetSession` or `Task`.

The end state of Phase 5 is a backend that can safely:

- store typed map/tracking configuration;
- represent operational points/zones required by a Location;
- start/stop a task-scoped tracking session from authoritative movement commands;
- accept validated GPS samples only for the correct active employee/task scope;
- evaluate configured geofences and record/alert violations without mutating the
  vehicle lifecycle;
- retain raw route history according to typed policy;
- provide authorized operational map reads for later Dashboard UI consumption;
- prove tenant/Location/privacy boundaries end to end;
- expose zero exact GPS data to Guest users.

## Existing foundation Phase 5 must reuse

Phase 5 does not start from an empty product.

Existing repository foundation includes:

- `Organization` and `Location` tenant ownership;
- explicit membership Location access;
- active Shift and operational eligibility rules;
- `ParkingZone` and `ParkingSpot` persistence from Phase 3;
- `Task.type = PARKING | RETRIEVAL`;
- canonical Task owner in `Task.current_assignee_membership_id`;
- separate Task/Dispatch lifecycle and append-only DispatchEvent history;
- protected `start-parking`, `confirm-parked`, `start-retrieval` and `mark-ready`
  movement boundaries;
- canonical ValetSession states `PARKING`, `PARKED`, `RETRIEVING`, `READY`;
- current staff bearer authentication and tenant/Location authorization
  infrastructure;
- append-only Audit/Black Box foundation;
- migration baseline 1–22.

Phase 5 must extend these boundaries rather than invent a second task owner,
second location system or generic session-state patch surface.

## Binding Phase 5 product decisions

### 1. Google Maps is the first provider, behind an adapter

Google Maps Platform is the first deployed provider.

Provider-specific SDK/API details stay behind a narrow boundary. Core domain and
persistence must remain provider-neutral enough that a later provider swap does
not require rewriting Task, custody, authorization, retention or geofence rules.

Do not build a speculative provider marketplace/framework.

### 2. Tracking is configurable and OFF by default

Use typed Configuration First inheritance:

```text
Company default = OFF
Location override = nullable/explicit override
```

An effective ON policy permits tracking only inside the active movement windows.
It does not enable Shift-wide tracking.

### 3. Tracking follows authoritative movement commands

Do not provide a loose client-controlled `start tracking` / `stop tracking`
state machine that can drift away from custody state.

Tracking start/stop must compose with the existing authoritative movement
commands or their transactionally consistent domain events:

- `start-parking` / entry to `PARKING` -> may start Parking tracking;
- `confirm-parked` / entry to `PARKED` -> stop Parking tracking;
- `start-retrieval` / entry to `RETRIEVING` -> may start Retrieval tracking;
- `mark-ready` / entry to `READY` -> stop Retrieval tracking.

Tracking start/stop failure semantics must be explicitly decided before a later
slice makes tracking a required side effect of a custody command. MVP must not
silently leave an ACTIVE tracker after PARKED/READY.

### 4. Raw GPS retention defaults to 30 days

Raw GPS/route samples use a typed retention policy with a default of 30 days and
Company default -> Location override inheritance.

Do not confuse raw GPS retention with append-only Audit retention. Raw samples
must not become indefinite by accident.

Country/customer legal retention remains deployment/configuration input and must
not be guessed inside implementation.

### 5. Geofence violations alert; they do not control state

MVP geofence events may produce operational alerts and append history.

They do not automatically cancel/pause/reassign a Task or mutate ValetSession
state.

### 6. Live map is Task/Vehicle-centric

Authorized map reads follow active movement work and vehicle custody.

The employee is visible only as context of the active task they currently own;
ending the movement task ends that live employee-location exposure.

Guest receives no exact coordinates, route, geofence geometry or employee map
position.

### 7. MVP geometry stays operational, not a digital twin

Support the minimum operational map model required for pilot use:

- Entrance / Pickup / Drop-off points;
- Parking / Overflow / Staging / Restricted zones/polygons;
- existing controlled Parking Zones/Spots;
- garage/floor/level labels or metadata where useful.

Do not build indoor turn-by-turn navigation, multi-floor digital twins or
Enterprise indoor maps.

## Security and privacy invariants

Every Phase 5 implementation slice must consider as applicable:

- authenticated actor resolution from existing staff bearer authority;
- active membership and persisted tenant scope;
- explicit Location access;
- active Shift/operational eligibility for field operations;
- canonical current Task ownership for GPS ingestion;
- server-derived Organization, Location, session, Task and assignee authority;
- no client-supplied ownership as authorization evidence;
- non-disclosing cross-tenant failures;
- no exact Guest GPS/location exposure;
- no provider key/secret leakage;
- bounded coordinate/timestamp/accuracy validation;
- retry/idempotency protection for sample ingestion;
- database least privilege for sensitive location history;
- retention enforcement and deletion that does not corrupt required summary/
  Audit facts;
- no continuous tracking outside movement windows.

## Phase 5 focused task sequence

### VAL-007 — Phase 5 Maps & Task-Scoped Tracking Execution Contract

**Status: current planning task; documentation only.**

Purpose:

- record the owner-approved Phase 5 product choices in Accepted DEC-045;
- lock this Phase 5 execution sequence;
- make the existing Blueprint/state/security boundaries explicit before schema or
  API work begins.

Must not change production code, Prisma schema, migrations, dependencies,
lockfiles, API behavior or UI behavior.

### VAL-007A — Maps / Tracking Persistence Foundation

Purpose:

- define the minimum provider-neutral persistence for task-scoped tracking,
  route/GPS samples, geofence configuration/events and typed tracking/retention
  policy;
- reuse existing Organization/Location/Task/ValetSession/ParkingZone/ParkingSpot
  ownership;
- enforce tenant/Location/task integrity and required uniqueness/check/index
  constraints;
- define runtime-role least-privilege access for raw GPS/location history;
- add exactly one new forward-only migration only if the accepted persistence
  contract requires it.

Required decision before implementation:

- exact entity shapes;
- raw versus summary history split;
- retention-policy storage fields;
- geofence geometry representation;
- append/update/delete privilege model;
- required indexes and cleanup ownership.

Must not integrate Google Maps, accept GPS over HTTP, start tracking, evaluate
geofences, expose map reads or build UI.

### VAL-007B — Location Map Setup

Purpose:

- implement authorized Company/Location configuration commands and contracts for
  MVP operational map setup;
- support Entrance / Pickup / Drop-off points and approved operational zones;
- connect map setup to existing Parking Zones/Spots without creating a second
  parking-location authority;
- support floor/level only as metadata/label;
- preserve Company default -> Location override where a typed policy applies;
- audit sensitive configuration changes.

Authorization target:

Management/configuration authority must be explicitly decided using existing
roles/permissions. Do not grant field employees map-configuration power merely
because they can submit GPS during their own task.

Must not build indoor maps/digital twin, GPS ingestion, live map UI, automated
routing or AI optimization.

### VAL-007C — Tracking Lifecycle Composition

Purpose:

- bind tracking activation/deactivation to existing movement commands;
- Parking tracking may start only with authoritative `PARKING` entry and stops at
  `PARKED`;
- Retrieval tracking may start only with authoritative `RETRIEVING` entry and
  stops at `READY`;
- evaluate the effective Company/Location tracking-enabled policy from persisted
  authoritative records;
- preserve coherent behavior under retries, command rollback and start/stop
  races;
- prevent orphan ACTIVE tracking outside a valid movement task.

This task must decide whether tracking-session persistence is created inside the
same custody transaction or through another consistency mechanism that cannot
leave a false active tracker after a failed custody mutation.

Must not accept device GPS samples yet.

### VAL-007D — Employee GPS Ingestion Boundary

Purpose:

- accept task-scoped GPS samples from the authenticated employee client only when
  persistence proves the caller is the correct active movement Task owner;
- derive tenant/Location/session/task scope server-side;
- validate coordinate range, timestamp freshness/order, accuracy and accepted
  payload size/batching;
- define durable retry/idempotency semantics so reconnect/retry does not duplicate
  route facts;
- reject samples when tracking is disabled, no matching active tracker exists, the
  task ended, the assignee changed, or tenant/Location authority fails;
- keep response/error data free of sensitive cross-tenant details.

Must not introduce whole-Shift tracking or trust caller-supplied membership,
Organization, Location or Task ownership.

### VAL-007E — Geofence Evaluation & Operational Alerts

Purpose:

- evaluate accepted task-scoped samples against enabled authorized geofences;
- append deterministic enter/exit/violation history where defined;
- create the backend operational alert/event projection required by later
  Dashboard display;
- make repeated/boundary samples race/idempotency safe;
- keep geofence evaluation inside the same tenant/Location scope as the active
  task.

A violation is alert/history only in MVP. It must not automatically mutate
ValetSession or Task state, change assignment, release a vehicle, or trigger
predictive/risk scoring.

### VAL-007F — Route History, Retention & Privacy

Purpose:

- enforce the typed raw GPS retention policy with 30-day default;
- define safe cleanup behavior for expired raw samples;
- preserve separately required non-raw custody/Audit summary facts;
- provide authorized historical route reads only to roles/Locations explicitly
  allowed by the focused contract;
- ensure exports/logs/telemetry do not leak raw coordinates beyond intended
  authority;
- prove retention cleanup cannot cross tenant/Location boundaries or corrupt
  active tracking sessions.

No assumption may be made that 30 days is legally sufficient for every market.

### VAL-007G — Live Operations Map Read APIs

Purpose:

- provide backend/read-model contracts for later Dashboard Live Operations map
  implementation;
- return active task/vehicle-centric position/state/zone context only to
  authorized management viewers;
- enforce tenant and Location scope and current policy;
- bound freshness/staleness semantics so the UI can distinguish live versus last
  known task-scoped position;
- avoid exposing expired raw route history through a live endpoint;
- prove Guest routes cannot obtain exact coordinates through direct or indirect
  identifiers.

This slice is backend/read API only. Full Dashboard UI remains Phase 7 unless the
project owner explicitly changes the phase boundary.

### VAL-007H — Phase 5 API / Integration / E2E / Security Gate

Purpose:

Prove the production-composed Phase 5 behavior across Parking and Retrieval:

```text
tracking policy OFF -> movement succeeds with no GPS tracking

tracking policy ON:
start parking -> tracker active -> GPS samples -> optional geofence events
-> confirm parked -> tracker stopped

start retrieval -> tracker active -> GPS samples -> optional geofence events
-> mark ready -> tracker stopped
```

The gate must prove at minimum:

- real staff bearer authentication;
- tenant and Location isolation;
- current Task owner and Shift/eligibility enforcement where required;
- Company default OFF and Location override behavior;
- no tracking before movement start or after PARKED/READY;
- reassignment/ended-task samples fail safely;
- retry/duplicate sample protection;
- invalid coordinate/time/accuracy/payload rejection;
- geofence enter/exit/violation history and alert-only semantics;
- no geofence-driven physical/task state mutation;
- raw route retention behavior and tenant-safe cleanup;
- authorized current/historical map reads;
- Guest cannot obtain exact GPS, route or geofence geometry;
- provider secrets never appear in persistence, audit, errors or client-safe
  responses;
- Google provider failure cannot grant extra authorization or leave tracking
  active outside the physical movement window;
- migration/runtime-role compatibility;
- no unrelated Phase 6/7/8 or V2/Enterprise behavior.

## Batch / branch execution order

Use the normal three-task reviewed stack from the Execution Workflow Playbook.

```text
Batch 1:
VAL-007  -> VAL-007A -> VAL-007B

Batch 2:
VAL-007C -> VAL-007D -> VAL-007E

Batch 3:
VAL-007F -> VAL-007G -> VAL-007H
```

Each task receives its own branch. The next branch stacks only after the previous
task is independently reviewed and approved. Create one PR per three-task batch,
verify CI, merge once, then start the next batch from the new `main`.

## Database and migration rules

Current accepted baseline is **22 forward-only migrations**.

VAL-007 changes no schema and authorizes no migration.

If VAL-007A proves new persistence is required, it owns the first Phase 5
forward-only migration. Existing migrations 1–22 remain immutable.

Later Phase 5 tasks must not add a migration merely for convenience if the
accepted persistence foundation already supports the required invariant. Any
new unavoidable schema requirement stops for a focused decision before a later
slice changes the database.

## Explicitly out of Phase 5

Do not pull forward:

- continuous whole-Shift tracking;
- Guest exact coordinates;
- indoor maps / digital twin;
- turn-by-turn indoor navigation;
- SmartStack AI;
- Predictive Retrieval;
- route optimization/autonomous dispatch;
- VAYLET Qualified / Safety Score;
- NFC/BLE keys or Smart Key Vault;
- full Dashboard implementation;
- Payments / validation / cash / tips;
- offline sync framework beyond the narrow retry identity needed for safe GPS
  ingestion;
- POS/PMS/SSO integrations;
- advanced BI/data warehouse;
- V2/Enterprise risk intelligence.

## Phase 5 completion definition

Phase 5 is complete only when the system can demonstrate, through real
production-composed backend behavior and automated proof, that configured
Parking/Retrieval tracking starts and stops with authoritative movement tasks,
GPS samples are accepted only from the correct authorized task owner, geofence
violations are visible but non-blocking, route data obeys typed retention and
privacy rules, authorized operations can read task-centric map context, and no
Guest or cross-tenant actor can obtain exact location history.

Passing unit tests alone is not sufficient; the final gate must include real
integration/E2E evidence for authorization, concurrency, persistence, privacy and
runtime database privilege behavior.
