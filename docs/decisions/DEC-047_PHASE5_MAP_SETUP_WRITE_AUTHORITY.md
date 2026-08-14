# DEC-047 — Phase 5 Map Setup Write Authority

Status: Accepted
Date: 2026-08-14
Task: VAL-007B — Location Map Setup
Issue: #155

## Context

VAL-007A intentionally leaves `location_map_points`, `location_map_areas`, and
`location_map_area_vertices` read-only to the ordinary application runtime
role. VAL-007B needs authorized production configuration writes for Location
map setup, but the API process has only the least-privilege runtime database
credential and production explicitly rejects `MIGRATION_DATABASE_URL`.

The current staff-auth contract also provides password-only assurance. DEC-023
states that privileged production `ORG_ADMIN` APIs remain unavailable until a
separate accepted MFA contract adds server-validated MFA assurance bound to the
staff session. `StaffPrincipal { userId }` does not satisfy that requirement.

The Project Owner accepted the following narrow Phase-5 boundary rather than
widening the ordinary runtime role or pulling MFA implementation into Phase 5.

## Decision

### 1. Map-configuration table grants remain read-only

The ordinary runtime database role keeps `SELECT` only on:

- `location_map_points`;
- `location_map_areas`;
- `location_map_area_vertices`.

VAL-007B must not grant ordinary runtime table-level `INSERT`, `UPDATE`,
`DELETE`, or `TRUNCATE` on those tables. It must not add a migration/admin
credential to the production API process and must not add a generic privileged
SQL escape hatch.

### 2. Narrow SECURITY DEFINER functions own map-setup writes

VAL-007B may add one forward-only migration 24 containing narrowly scoped
PostgreSQL `SECURITY DEFINER` functions for the exact map-configuration
mutations required by the task.

The functions must:

- be owned by the migration/database owner, never the runtime role;
- use a fixed safe `search_path`;
- revoke `PUBLIC EXECUTE`;
- grant only explicit `EXECUTE` to the application runtime role through the
  existing provisioning mechanism;
- expose only typed map-setup arguments, never arbitrary SQL/table/column
  selectors;
- derive or validate Organization/Location relationships from persisted rows;
- validate the persisted actor against the accepted Location Manager authority
  described below;
- preserve all DEC-046 composite tenant/Location integrity;
- preserve `ParkingZone` / `ParkingSpot` as canonical parking assignment
  authority;
- perform polygon replacement atomically so no caller can persist a mixed or
  partial vertex set;
- support soft activation/deactivation rather than generic row deletion;
- never copy exact coordinates or vertex arrays into generic AuditEvent
  metadata.

A function may internally delete and recreate area vertices only as part of an
atomic full-polygon replacement. This does not grant the runtime role generic
`DELETE` privilege.

The implementation should prefer a small operation-specific function set over
one generic mutation function.

### 3. Runtime caller identity is still database-validated

Because `SECURITY DEFINER` functions execute with elevated table authority,
they must not rely only on the API having already authorized the request.

Every mutation function must receive only the minimum persisted actor identity
needed to re-check authority and must validate that actor against current
OrganizationMembership and Location-access records before changing map
configuration.

Client-supplied role, Organization ownership, membership ownership, or actor
claims are never authoritative. The API derives actor identity from the real
staff bearer principal and current persisted membership/access state.

The database function is a defense-in-depth authorization boundary, not a
replacement for API authorization.

### 4. VAL-007B write authority is Location Manager only

Until an accepted MFA implementation provides server-validated assurance,
VAL-007B production map-setup read/write APIs are authorized only for an
`ACTIVE` `LOCATION_MANAGER` membership with explicit persisted access to the
exact target Location.

`ORG_ADMIN` remains denied from this privileged map-setup API under DEC-023,
even when the Organization matches. Phase 5 does not weaken or supersede the
MFA requirement. A later MFA task may extend this same capability to
`ORG_ADMIN` after its session assurance is server-validated and accepted.

`VALET_SUPERVISOR`, `VALET_EMPLOYEE`, Guest, disabled memberships, and Location
Managers without explicit access have no map-setup authority.

Map setup is management configuration, not an active Shift command, so a Shift
is not required merely to configure the Location.

### 5. Read authority follows the same privileged boundary

Exact map points and polygon geometry exposed by the VAL-007B management API
are available only to the same authorized Location Manager boundary. This task
does not expose exact map geometry to `ORG_ADMIN` before MFA, field employees,
or Guest routes/contracts.

### 6. Migration boundary

VAL-007B may add exactly migration 24 for the narrow write-authority functions
and their execute-privilege provisioning support. Migration 23 and migrations
1–22 remain immutable.

Migration 24 must not alter the DEC-046 map/tracking table shape unless a new
material persistence conflict is separately reviewed and accepted.

No new application dependency or second database credential is authorized by
this decision.

## Consequences

VAL-007B can implement real production Location map configuration without
turning configuration tables into broad runtime-writable surfaces. Elevated
write authority is operation-specific, database-validated, auditable, and
limited to explicit Location Manager access.

The accepted boundary intentionally delays Company Admin map configuration
until MFA exists rather than weakening DEC-023 or expanding Phase 5 into an MFA
project.

Google Maps/provider integration, GPS ingestion, tracking lifecycle,
geofence evaluation, live map operations, retention cleanup, indoor maps, and
Guest coordinate exposure remain outside this decision.