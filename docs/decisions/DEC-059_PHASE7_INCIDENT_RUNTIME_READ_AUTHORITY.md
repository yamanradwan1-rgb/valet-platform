# DEC-059 — Phase 7 Incident Runtime Read Authority

Status: Accepted
Date: 2026-08-22
Task: VAL-009C / Phase 7 operational overview prerequisite

## Context

VAL-009C requires a read-only Dashboard incidents overview for an explicitly authorized Location. The `incidents` table already exists and is the accepted authoritative source, but the production API runtime role currently has no table privilege on `incidents`. As a result, the required read endpoint cannot succeed through the real least-privilege runtime identity.

The runtime role is provisioned by `packages/database/scripts/provision-runtime-role.mjs`, which revokes table privileges and then reapplies an explicit allowlist through `runtime-table-privileges.mjs`, followed by deterministic verification in `verify-runtime-table-privileges.mjs`.

## Decision

1. VAL-009C keeps the incidents overview in scope.
2. The API runtime role receives **SELECT only** on `public.incidents` through the existing runtime-role provisioning allowlist.
3. The runtime role receives no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, ownership, or schema authority over `incidents`.
4. PUBLIC receives no new privilege.
5. The privilege is solely to support server-authorized exact-Location management reads. It does not authorize direct client database access and does not replace API authorization.
6. The incidents Dashboard route continues to require the VAL-009A exact-Location `LOCATION_MANAGER` management scope: ACTIVE User, ACTIVE membership, ACTIVE Organization, ACTIVE Location, and explicit `membership_location_access`; no Shift is required. Password-only `ORG_ADMIN`, Supervisor, Employee, Guest, wrong-Location/cross-tenant/inactive cases remain denied.
7. The incidents read remains non-disclosing and read-only. No Incident lifecycle/mutation semantics are added.
8. This is an environment-specific runtime-role provisioning policy change, not a Prisma schema or persistence-object change. **No migration 30 is introduced.** Prisma migrations 1–29 remain unchanged. The runtime role name is deployment-specific and is intentionally managed by the post-migration provisioning boundary rather than hard-coded into a migration.
9. `verify-runtime-table-privileges.mjs` must prove SELECT is present and write/DDL-style table privileges remain absent for `public.incidents`.
10. Focused integration proof must use the genuine provisioned runtime role and demonstrate that the required incidents read succeeds while direct write attempts remain denied.

## Reason

Deferring incidents would make the accepted VAL-009C overview incomplete even though authoritative persistence already exists. Granting only SELECT is the smallest reversible least-privilege change that makes the existing read requirement executable. Using the established runtime-role provisioning boundary preserves environment-specific credential separation and avoids embedding deployment role names in Prisma migrations.

## Non-goals

DEC-059 does not introduce Incident create/update/close APIs, Incident workflow changes, new persistence, new indexes, Company-wide access, MFA, Dashboard UI, analytics/KPIs, reports/export, or broader runtime privilege widening.
