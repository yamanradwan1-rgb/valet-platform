# DEC-059 — Phase 7 Incident Runtime Read Authority

Status: Accepted
Date: 2026-08-22
Task: VAL-009C / Phase 7 operational overview prerequisite

## Context

VAL-009C requires a read-only Dashboard incidents overview for an explicitly authorized Location. The `incidents` table already exists and is the accepted authoritative source. This decision was originally authored before current main accepted Employee Incident Reporting, whose command independently requires runtime INSERT on `incidents`.

The runtime role is provisioned by `packages/database/scripts/provision-runtime-role.mjs`, which revokes table privileges and then reapplies an explicit allowlist through `runtime-table-privileges.mjs`, followed by deterministic verification in `verify-runtime-table-privileges.mjs`.

## Decision

1. VAL-009C keeps the incidents overview in scope.
2. The API runtime role receives SELECT on `public.incidents` through the existing runtime-role provisioning allowlist for Dashboard reads.
3. Existing accepted Employee Incident Reporting independently requires runtime INSERT on `public.incidents`; that privilege is preserved and is not Dashboard mutation authority.
4. Runtime UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, ownership, and schema authority over `incidents` remain denied.
5. PUBLIC receives no new privilege.
6. Runtime table privileges do not authorize direct client database access and do not replace application authorization.
7. The incidents Dashboard route continues to require the VAL-009A exact-Location `LOCATION_MANAGER` management scope: ACTIVE User, ACTIVE membership, ACTIVE Organization, ACTIVE Location, and explicit `membership_location_access`; no Shift is required. Password-only `ORG_ADMIN`, Supervisor, Employee, Guest, wrong-Location/cross-tenant/inactive cases remain denied.
8. The Dashboard incident surface remains non-disclosing and read-only. No Dashboard Incident lifecycle or mutation route is added.
9. Employee Incident Reporting authorization, active-Shift and exact-Location rules, stable idempotency, actor-bound retry semantics, and append-only audit behavior remain governed by its accepted Stream A implementation.
10. This is an environment-specific runtime-role provisioning policy amendment, not a Prisma schema or persistence-object change. No incident schema or migration is introduced. The runtime role name remains deployment-specific and is managed by the post-migration provisioning boundary.
11. `verify-runtime-table-privileges.mjs` must prove SELECT and INSERT are present while UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER remain absent for `public.incidents`.
12. Focused integration proof must use the genuine provisioned runtime role and demonstrate the final least-privilege matrix accurately, with PUBLIC denied.

## Reason

The Project Owner approved this reconciliation after Employee Incident Reporting became accepted on current main. Preserving SELECT plus the independently required INSERT is the smallest truthful least-privilege matrix: Dashboard remains read-only while the Employee command remains executable. The established runtime-role provisioning boundary preserves environment-specific credential separation and avoids embedding deployment role names in Prisma migrations.

## Non-goals

DEC-059 does not introduce Dashboard Incident create/update/close APIs, Incident workflow changes, new persistence, new indexes, Company-wide access, MFA, Dashboard UI, analytics/KPIs, reports/export, or privilege widening beyond the already accepted Employee INSERT and Dashboard SELECT requirements.

## Accepted amendment — Issue #337 (2026-10-25)

The Owner explicitly approved amending the read-only restriction for this one
command. This amendment supersedes clauses 4, 8 and 11 only as stated below.

An authenticated Company Admin (DEC-078 five-minute sensitive MFA assurance) or Location
Manager may resolve an OPEN/INVESTIGATING Incident at an exact currently active
authorized Location. Employee/Supervisor/Guest authority is unchanged. Derive
scope, actor and timestamp on the server. Revalidate session, membership, role,
Organization, Location, grants and commercial Dashboard access through commit.

`POST /v1/staff/dashboard/locations/:locationId/overview/incidents/:incidentId/resolve`
accepts only `operationId` (UUID), `expectedStatus` (OPEN/INVESTIGATING), and
`resolutionNotes` (trimmed, 1–1000 characters). Expected active status is the
monotonic CAS token: this slice has only the outgoing RESOLVED transition.
Lock the exact Incident, reject a changed active state or different terminal
operation with VERSION_CONFLICT, and never overwrite another resolution.
An identical operation retries only for the same actor, Incident, expected
status and normalized note; reauthorize first. Changed payload/actor/scope is
IDEMPOTENCY_CONFLICT. CLOSED is never resolved by this command.

Update only existing `status`, `resolved_at`, `resolved_by_membership_id` and
`resolution_notes`. Runtime receives column-scoped UPDATE on these four fields,
not table UPDATE. All other Incident mutation privileges remain denied; PUBLIC
gets none. Provisioning verifies every Incident column. No schema migration is
needed. Session/Task/custody/payment/severity/reporter/evidence stay unchanged.

Append exactly one `INCIDENT_RESOLVED` AuditEvent with entity INCIDENT, exact
persisted Organization/Location/Session and authenticated membership, using the
operation UUID as event identity. Database time supplies both resolution and
event time. Metadata contains incidentId, fromStatus and toStatus only; notes
remain solely in resolution_notes, never audit metadata or diagnostic logs.
The locked Incident and audit insert share one transaction and rollback boundary.

Dashboard Incidents defaults to All and offers Active/Resolved filters with
server pagination. Resolved rows retain original severity/reporter, remain
accessible after refresh and show server resolver/time/note. Only confirmation,
required note, restrained success badge and a small filter are new UI surfaces.
Final CLOSED workflow, deletion and broad Incident editing remain excluded.
