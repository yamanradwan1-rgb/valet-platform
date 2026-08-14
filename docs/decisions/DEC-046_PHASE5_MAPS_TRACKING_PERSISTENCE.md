# DEC-046 — Phase 5 Maps & Tracking Persistence

Status: Accepted
Date: 2026-08-14
Task: VAL-007A — Maps / Tracking Persistence Foundation
Issue: #154

## Context

DEC-045 locks the Phase-5 product policy: provider-neutral core data, Company
tracking default OFF with nullable Location override, 30-day raw GPS retention
with nullable Location override, tracking only during active Parking/Retrieval
movement, alert/history-only geofence violations, Task/Vehicle-centric maps,
and no exact Guest GPS. This decision locks only the relational persistence
semantics needed by later VAL-007B through VAL-007H.

## Decision

### 1. Typed inherited policy

`Organization.tracking_enabled` is non-null and defaults to `false`.
`Organization.raw_gps_retention_days` is non-null and defaults to `30`.
`Location.tracking_enabled_override` and
`Location.raw_gps_retention_days_override` are nullable. Effective policy uses
the Location value when non-null and otherwise the Organization value.

Both retention fields are PostgreSQL integers. Database checks require the
Organization value to be positive and a Location override to be either null or
positive. Integer storage is finite by construction. Thirty days is a product
default, not a claim of legal suitability for every customer or jurisdiction.

### 2. Provider-neutral operational geometry

`LocationMapPoint` belongs to an exact Organization and Location. Its typed
kind is `ENTRANCE`, `PICKUP`, or `DROP_OFF`; it stores code, label, latitude,
longitude, optional level label, and active/inactive configuration state.

`LocationMapArea` belongs to an exact Organization and Location. Its typed
purpose is `PARKING`, `OVERFLOW`, `STAGING`, or `RESTRICTED`; it stores code,
label, optional level label, and active/inactive configuration state. It may
reference an existing `ParkingZone` only through the exact same Organization
and Location. That reference supplies map/geofence context only.
`ParkingZone`, `ParkingSpot`, and `ValetSession.parking_zone_id` /
`parking_spot_id` remain the only parking assignment authority.

`LocationMapAreaVertex` stores normalized ordered polygon vertices. Every
vertex repeats and is foreign-keyed through the exact parent Organization and
Location. Vertex position is zero-based, non-negative, and unique within the
area. Latitude and longitude use provider-neutral decimal columns. Polygon
completeness, self-intersection, and minimum vertex count are configuration
validation concerns because row-local checks cannot safely enforce them.

No provider identifier, provider geometry payload, generic JSON policy,
PostGIS type, indoor graph, or digital-twin structure is persisted.

### 3. Task-scoped tracking-session projection

`TaskTrackingSession` belongs to an exact Organization, Location,
ValetSession, and canonical `Task` through one composite Task foreign key. It
does not store an assignee or create a second ownership lifecycle;
`Task.current_assignee_membership_id` remains authoritative.

`started_at` is database/server-authored. `ended_at IS NULL` means active and a
non-null value means ended; an end cannot precede its start. Partial unique
indexes permit at most one active tracking session per Task and at most one
active tracking session per physical ValetSession. Ended history remains
append-only apart from the one-way first setting of `ended_at`. A dedicated
database trigger permits `NULL -> non-NULL`, permits an identical-value no-op,
and rejects both `non-NULL -> NULL` reopening and `non-NULL -> different
non-NULL` rewriting. The existing database check also rejects an end before
the persisted start. Later command composition must still own authorization
and transaction boundaries, but it cannot weaken this history invariant.

This persistence does not start or stop tracking and adds no Task or
ValetSession states.

### 4. Raw GPS samples and durable retry identity

`RawGpsSample` is append-oriented and scoped through an exact composite
`TaskTrackingSession` foreign key carrying Organization, Location,
ValetSession, and Task. It stores provider-neutral latitude and longitude, an
untrusted client `captured_at`, and database-authored `received_at`.

The durable retry identity is a client-generated UUID unique within one
tracking session: `(tracking_session_id, client_sample_id)`. Reusing that pair
is rejected. Accuracy, altitude, speed, bearing, and provider payloads are not
persisted by this foundation because no binding requirement needs them yet.

Latitude is constrained to `[-90, 90]` and longitude to `[-180, 180]` on every
coordinate-bearing table.

Raw GPS rows are privacy-sensitive operational data. They must not be copied
into `AuditEvent.metadata` or exposed through Guest contracts.

### 5. Geofence/zone event history

`GeofenceEvent` is append-only summary history. Its controlled type is exactly
`ENTERED`, `EXITED`, or `VIOLATION`. It is scoped through the exact composite
tracking-session relationship and an exact same-Organization/same-Location
`LocationMapArea` relationship. It stores server-authored occurrence and
recording times and no raw coordinate.

No geofence evaluation is implemented here. A `VIOLATION` is history/alert
data only and never mutates ValetSession, Task, assignee, Dispatch, release, or
handoff state.

### 6. Retention boundary

Raw GPS samples follow the effective typed raw-retention policy and are not
permanent Black Box history. Non-raw `GeofenceEvent` summary history may remain
under its separate operational/audit retention contract.

VAL-007A creates no cleanup function, scheduler, job, endpoint, or generic
deletion primitive. VAL-007F must later own a narrow cleanup mechanism.
Ordinary application runtime must never receive unrestricted DELETE or
TRUNCATE over raw or append-only tracking history.

### 7. Runtime database privileges

The ordinary runtime role receives:

- map point/area/vertex configuration: `SELECT` only;
- TaskTrackingSession: `SELECT`, `INSERT`, and column-scoped `UPDATE` of
  `ended_at` only;
- RawGpsSample and GeofenceEvent: `SELECT` and `INSERT` only.

For all new tables, DELETE and TRUNCATE remain denied. RawGpsSample and
GeofenceEvent also deny UPDATE. The runtime role receives no table ownership,
DDL, REFERENCES, or TRIGGER expansion. Company/Location configuration retains
the existing configuration-authority convention; this task does not grant the
ordinary runtime role broad policy or geometry mutation authority.

### 8. Migration boundary

VAL-007A adds exactly migration 23:
`20260814002300_phase5_maps_tracking_persistence`. Migrations 1–22 remain
byte-for-byte immutable. The migration and Prisma schema introduce only the
typed policy, geometry, task-tracking, raw-sample, and geofence-history
structures described here.

No Maps provider adapter/API, GPS endpoint, employee client, tracking command,
geofence engine, alert delivery, UI, Guest route, cleanup execution, continuous
Shift tracking, or provider dependency is part of this decision.

## Consequences

Later Phase-5 tasks receive a tenant-safe, provider-neutral persistence base
without weakening canonical Task ownership or parking authority. Active
tracking is coherent at the database boundary, raw route retry identity is
durable, raw data has an explicit finite-default retention policy, and future
cleanup remains separated behind a narrow least-privilege contract.
