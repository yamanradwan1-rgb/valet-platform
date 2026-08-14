# DEC-045 — Phase 5 Maps & Task-Scoped Tracking Policy

Status: Accepted
Date: 2026-08-14
Task: VAL-007 — Phase 5 Maps & Task-Scoped Tracking Execution Contract
Issue: #153

## Context

Founder & Product Blueprint v1.0 makes Maps plus configurable Parking/Retrieval
session tracking part of the sellable MVP. Existing repository authority already
locks the privacy principle that tracking is task-scoped rather than continuous
employee surveillance, and Guest users never receive exact vehicle coordinates.

Before Phase 5 implementation starts, several product choices still require one
explicit contract: first map provider, default tracking policy, raw GPS retention,
geofence reaction, Live Operations map orientation, and the MVP boundary for
Location map setup.

The project owner approved these choices on 2026-08-14. This decision records
them so they do not remain chat-only assumptions.

## Decision

### 1. First MVP map provider

The first deployed map provider is **Google Maps Platform**.

Provider-specific APIs, SDKs, credentials and response shapes must remain behind
a narrow application adapter/boundary. Core tracking, authorization, task,
retention and geofence semantics must not depend on Google-specific domain types.

This decision selects the first provider; it does not authorize hard-coding the
entire product to Google Maps or introducing a speculative multi-provider
framework.

### 2. Tracking configuration and inheritance

Tracking is an explicit typed operating policy using the product precedence:

```text
Company default -> Location override
```

The Company default is **OFF**.

A Location may explicitly override the effective setting. Absence of a Location
override inherits the Company default.

Turning tracking on never authorizes whole-shift employee surveillance. The
effective policy is only one guard inside the active task-scoped lifecycle below.

### 3. Tracking lifecycle is task-scoped

Tracking may run only while the authenticated operational employee owns the
active movement Task for the same authorized Organization/Location/session and
the physical lifecycle is in the matching movement state.

Canonical movement windows:

```text
Parking:
start-parking / PARKING -> tracking may become ACTIVE
confirm-parked / PARKED  -> tracking must stop

Retrieval:
start-retrieval / RETRIEVING -> tracking may become ACTIVE
mark-ready / READY             -> tracking must stop
```

Tracking is OFF outside active Parking/Retrieval movement tasks, including before
start, after PARKED/READY, during ordinary idle Shift time, and after session
completion.

A later explicit exception flow such as return-to-parking may define its own
movement window, but Phase 5 must not infer one before that physical command is
accepted.

### 4. Raw GPS retention

The default retention for raw GPS/route samples is **30 days**.

Retention is a typed configurable policy using Company default -> Location
override. The exact validation bounds and cleanup mechanism belong to the focused
persistence/retention tasks; they must preserve this 30-day default and may not
silently create indefinite raw-location storage.

Legal, contractual and country-specific retention requirements remain external
constraints that can require a different configured value. This decision does
not claim that 30 days satisfies every jurisdiction or customer contract.

After raw-sample retention expires, append-only operational/Audit history that is
independently required for custody explainability may remain as non-raw summary
facts according to its own retention contract. Raw route history must not be kept
forever merely because Audit history is append-only.

### 5. Geofence behavior

In MVP, a geofence violation is **alert/event behavior, not a hard task block**.

When geofence evaluation is enabled and an active tracked task crosses a relevant
boundary, the system may append the appropriate route/zone/geofence history and
surface an authorized operational alert.

The violation must not automatically cancel, pause, reassign or otherwise mutate
the Task or ValetSession physical state.

Hard blocking, autonomous intervention or risk scoring requires a later explicit
accepted decision.

### 6. Live Operations map orientation

The authorized operational map is **Task/Vehicle-centric**, not a persistent
employee surveillance map.

While a Parking/Retrieval movement task is active, an authorized viewer may see
safe operational context such as the active task/vehicle, current or last
accepted task-scoped position, zone/geofence context, task state and current
assignee where the viewer already has permission to that operational data.

Once the movement task ends, the employee must not remain continuously visible
merely because their Shift is still active.

Location-scoped viewers see only authorized Location data. Organization-wide
management visibility must still enforce tenant isolation and explicit role/
permission rules. Venue Client representation remains deferred and must not be
invented inside Phase 5.

Guest/Customer receives no exact GPS coordinates, route history, geofence
geometry, internal employee position or other employee-only map data.

### 7. MVP Location map setup

Phase 5 supports the operational geometry needed for real valet movement without
building an indoor digital twin.

MVP location setup may represent:

- `Entrance`, `Pickup`, and `Drop-off` as operational points;
- Parking, Overflow, Staging and Restricted operational areas as zones/polygons;
- existing Parking Zones/Spots as controlled operational records associated with
  the Location map setup;
- floor/level as metadata/label where useful to identify an operational area or
  spot.

Floor metadata does not create an indoor-navigation or multi-floor digital-twin
engine.

Garages may be represented through the approved point/zone/metadata model. A
separate complex garage graph, turn-by-turn indoor navigation or indoor map
provider is not part of this decision.

### 8. Security and data handling

Phase 5 implementation must preserve:

- staff authentication and current persisted membership authority;
- same-Organization and authorized Location scope;
- active Task ownership/eligibility where employee GPS ingestion is accepted;
- server-side derivation of Organization, Location, session and Task authority;
- no trust in client-supplied tenant/Location/assignee ownership;
- least-privilege runtime database access for raw/high-sensitivity location data;
- no provider keys or map secrets in source, logs, guest responses or Audit
  metadata;
- bounded validation of timestamps, coordinates, accuracy and retry identity at
  the ingestion boundary;
- append-only operational history where the focused contract requires it;
- no exact Guest vehicle coordinates.

Exact GPS sampling interval, accuracy thresholds, payload batching and durable
retry/idempotency shape are implementation details for their focused task unless
they materially change privacy, cost, correctness or retained data volume.

### 9. Explicitly out of scope

This decision does not authorize:

- continuous whole-Shift tracking;
- employee surveillance outside active movement tasks;
- Guest map coordinates or route history;
- indoor maps/digital twin;
- SmartStack AI;
- Predictive Retrieval;
- route optimization or autonomous dispatch decisions;
- VAYLET Qualified / Safety Score;
- geofence-driven automatic state mutation;
- NFC/BLE or Smart Key Vault behavior;
- Dashboard UI implementation beyond the backend/read contracts scheduled for
  Phase 5;
- Payments, POS/PMS or other later-phase integrations.

## Database boundary for VAL-007

VAL-007 itself is documentation only.

It changes no Prisma schema, migration, runtime code, API contract, dependency or
lockfile. Migrations 1–22 remain immutable and no migration 23 is authorized by
this planning task.

VAL-007A may propose a new forward-only migration only after its focused
persistence decision proves the exact new entities/constraints required for
tracking and geofence history.

## Consequences

Phase 5 can begin with a fixed privacy and product boundary: Google Maps is the
first provider but not a domain dependency; tracking is opt-in and task-scoped;
raw route data defaults to 30-day retention; geofence violations alert rather
than control the vehicle lifecycle; operational maps follow the active task and
vehicle instead of tracking employees continuously; and MVP map setup stays
simple enough for a pilot without pulling an indoor digital twin forward.

Implementation sequencing is locked separately in
`docs/20_PHASE5_MAPS_TRACKING_EXECUTION_PLAN.md`.
