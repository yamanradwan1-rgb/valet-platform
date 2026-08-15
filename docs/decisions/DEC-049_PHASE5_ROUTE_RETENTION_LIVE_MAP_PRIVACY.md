# DEC-049 — Phase 5 Route Retention, Historical Reads & Live Map Privacy

Status: Accepted
Date: 2026-08-15
Task: VAL-007F — Route History, Retention & Privacy
Issue: #162

## Context

Founder & Product Blueprint v1.0 and Accepted DEC-045/046 already establish that
GPS tracking is task-scoped to active Parking/Retrieval movement, Guest never
receives exact coordinates, raw GPS retention defaults to 30 days with Company
-> Location inheritance, raw samples are not permanent Black Box history, and
Live Operations is Task/Vehicle-centric rather than whole-Shift employee
surveillance.

VAL-007F through VAL-007H still require focused choices for historical raw-route
read authority, active-route visibility, the least-privilege cleanup boundary,
retention age authority, and Live Operations freshness. These choices materially
affect privacy, authorization and database privileges, so the Project Owner
approved them before Batch 3 implementation.

## Decision

### 1. Historical raw-route read authority

Historical exact route reads are restricted to management/operational oversight
roles with persisted exact-Location authority:

- an ACTIVE `LOCATION_MANAGER` membership with explicit persisted access to the
  target Location; or
- an ACTIVE `VALET_SUPERVISOR` membership with explicit persisted access to the
  target Location **and** an ACTIVE Shift at that exact Location.

`VALET_EMPLOYEE` has no broad historical-route read permission merely because an
employee may submit GPS while owning an active movement Task.

Guest/Customer receives no exact GPS or route history.

Venue Client representation remains deferred and is not invented in Phase 5.

Password-only `ORG_ADMIN` remains denied from this privileged raw-location read
surface while the accepted authentication contract does not provide
server-validated MFA assurance. A later accepted MFA/session-assurance task may
extend management visibility without weakening this decision.

Historical read authorization is derived from the authenticated staff principal
plus current persisted User, membership, Organization, Location-access and, for
Supervisor, Shift state. Caller-supplied tenant, Location, role or membership
claims are never authority.

### 2. Historical route reads are ended-tracker only

VAL-007F historical route reads may expose retained `RawGpsSample` coordinates
only for an **ended** `TaskTrackingSession`.

An active movement tracker is not exposed as a continuously growing historical
breadcrumb route through this API. VAL-007G owns current/last-known operational
position for active movement work.

This keeps historical analysis separate from live operational visibility and
reduces employee-surveillance scope.

### 3. Raw GPS retention age uses database-authored receipt time

Effective raw-retention policy remains:

```text
Location.raw_gps_retention_days_override
?? Organization.raw_gps_retention_days
```

with the existing 30-day Organization default.

Expiration age is measured from database-authored `RawGpsSample.received_at`,
not client-supplied `captured_at`.

Cleanup uses database-authoritative current time. Client clocks therefore cannot
extend or prematurely shorten retention.

The configured retention value is a product/contract policy, not a claim that
30 days satisfies every jurisdiction. Legal/customer requirements may require a
different configured value.

### 4. Cleanup is narrow least-privilege database authority

The ordinary application runtime role must not receive table-level `DELETE` or
`TRUNCATE` on `raw_gps_samples`.

VAL-007F may add exactly one forward-only migration 25 if required to introduce
narrow PostgreSQL `SECURITY DEFINER` cleanup authority and explicit runtime
`EXECUTE` provisioning.

The cleanup function must:

- be owned by the migration/database owner, not the runtime role;
- use a fixed safe `search_path`;
- revoke `PUBLIC EXECUTE`;
- grant only explicit `EXECUTE` to the intended maintenance/runtime boundary;
- derive retention policy from persisted Organization/Location rows;
- use database time and `received_at` for expiration;
- delete only `RawGpsSample` rows belonging to **ended** tracking sessions;
- delete in bounded batches;
- preserve exact tenant/Location scope through persisted relationships;
- expose no arbitrary SQL/table/column selector;
- expose no arbitrary caller-controlled retention cutoff that bypasses policy;
- never delete `GeofenceEvent`, AuditEvent, custody history, Task,
  ValetSession, TaskTrackingSession or other non-raw summary/history facts.

Migrations 1–24 remain immutable.

### 5. Cleanup execution boundary

VAL-007F provides a narrow maintenance CLI/job invocation suitable for scheduled
operations later.

It does **not** add:

- a public or staff HTTP deletion endpoint;
- a generic scheduler framework;
- a general data-deletion primitive;
- a tenant-selectable arbitrary cutoff endpoint.

Operational scheduling/deployment may invoke the narrow maintenance command, but
ordinary feature code cannot turn it into unrestricted deletion.

### 6. Live Operations map authority for VAL-007G

Exact current/last-known active movement positions are visible only to:

- ACTIVE `LOCATION_MANAGER` with explicit persisted access to the target
  Location; or
- ACTIVE `VALET_SUPERVISOR` with explicit persisted access to the target Location
  and an ACTIVE Shift at that exact Location.

`VALET_EMPLOYEE`, Guest, Venue Client and password-only `ORG_ADMIN` do not gain a
broad Live Operations map surface in Phase 5.

Live map remains Task/Vehicle-centric. The employee appears only as context of
active movement work the viewer is otherwise authorized to see.

If the movement tracker has ended, or effective tracking policy is OFF, that
work is absent from the Live Operations map even if retained raw samples still
exist.

### 7. Live freshness contract

For VAL-007G, the latest accepted task-scoped sample is classified using a
60-second threshold:

```text
age <= 60 seconds  -> LIVE
age > 60 seconds   -> STALE / last-known
```

Freshness is calculated with database-authoritative current time against the
persisted canonical sample timestamp. The read contract returns the relevant
sample timestamp so the Dashboard can represent freshness honestly.

A stale sample may remain useful as last-known context while the movement task is
still active and policy is enabled; it must not be mislabeled as live.

### 8. Privacy and history separation

`RawGpsSample` is privacy-sensitive finite-retention operational data.

`GeofenceEvent` remains non-raw append-only operational summary history under its
separate retention contract. Raw GPS cleanup must not delete or rewrite it.

Exact coordinates must not be copied into AuditEvent metadata, logs, errors,
metrics or Guest-safe contracts merely because historical/live read APIs exist.

No Phase 5 route or map read grants permission for whole-Shift employee
surveillance.

## Consequences

VAL-007F can implement a finite, enforceable raw-GPS lifecycle without granting
the ordinary runtime role broad deletion authority. Historical exact routes are
available only after movement ends and only to narrowly authorized Location
management/oversight roles.

VAL-007G receives a fixed Task/Vehicle-centric viewer boundary and a 60-second
live/stale contract. VAL-007H can test these rules end to end without inventing
new product semantics.

The expected database impact is one narrow forward-only migration 25 for cleanup
authority, not a redesign of the Phase 5 tracking schema. If existing database
capabilities prove insufficient beyond this exact authority, implementation must
stop for a new focused decision rather than silently widening privileges or
persistence.