# DEC-029 — Controlled Production Staff Provisioning

Status: Accepted
Date: 2026-08-11

## Context

DEC-023 provides production staff authentication only for an existing `User` whose stored password verifier matches the locked Argon2id profile. The demo seed intentionally uses non-authentic password hashes and is development/test-only. There is currently no production-safe path to create the first real staff account or attach its first Organization membership and Location access.

Opening a public signup route or a password-only Company Admin provisioning API would create a new privileged attack surface immediately before Phase 3. The current security contract also states that password-only sessions do not assert MFA; Company Admin and VAYLET Super Admin capabilities that require MFA remain unavailable.

Production database administration already has a separate controlled migration/provisioning boundary under DEC-025. That boundary owns `MIGRATION_DATABASE_URL`, strict production TLS validation, and administrative database mutation. The ordinary API runtime must not possess that credential.

VAL-004R closes only the account-creation gap. It does not create a general tenant-admin account-management API.

## Decision

Add one repository operator command for **create-only staff provisioning**. It is not an HTTP endpoint and is not imported by the application runtime.

Canonical command ownership is the API workspace because the command must reuse Staff Auth contracts and Argon2id behavior, while its database connection must reuse the existing DEC-025 migration/provisioning connection policy.

Preferred implementation location:

```text
apps/api/tools/provision-staff.ts
```

Preferred package command:

```text
pnpm --filter @valet/api staff:provision -- <arguments>
```

The tool is repository/deployment operator tooling. It may use the already-present `tsx`, `argon2`, `pg`, and `@valet/contracts` dependencies of `@valet/api`. No new external dependency is required.

The API workspace lint command must cover the new operator tool so it does not become an unreviewed executable path.

## Database authority

The provisioning tool uses **only** `MIGRATION_DATABASE_URL` for database mutation.

It must call the existing canonical helpers from:

```text
packages/database/scripts/database-connection-policy.mjs
```

including:

- `parseMigrationDatabaseUrl`
- `migrationClientConfig`
- `verifyMigrationConnectionTls`

Do not copy or fork DEC-025 TLS/URL parsing logic into the tool.

`NODE_ENV` must be explicit and limited to:

```text
production
development
test
```

For `production`, the existing strict migration URL and live TLS verification apply before any transaction or mutation.

For `development` and `test`, the provisioning command additionally requires a loopback PostgreSQL host (`127.0.0.1`, `localhost`, or loopback IPv6) so an omitted/mistyped production environment cannot silently turn into a plaintext remote administrative connection.

The command does not need `DATABASE_URL` and must not make `MIGRATION_DATABASE_URL` available to the API runtime.

## Command inputs

Provisioning requires explicit operator-supplied scope:

- `--organization-id <uuid>`
- one or more repeated `--location-id <uuid>` values
- `--audit-location-id <uuid>`
- `--role <role>`
- `--email <email>`
- `--operator-ref <opaque-reference>`
- `--reason <bounded-reason>`
- `--password-stdin`

Accepted tenant roles are exactly:

```text
ORG_ADMIN
LOCATION_MANAGER
VALET_SUPERVISOR
VALET_EMPLOYEE
```

At least one Location is required. Duplicate Location IDs are rejected. The audit Location must be one of the granted Location IDs.

`operator-ref` is deployment/operator provenance such as a controlled change/ticket/actor reference. It is **not** a VAYLET Super Admin identity and grants no application authorization. It must be bounded and free of control characters.

`reason` is required and bounded. It is audit context, not an authorization input.

Unknown command options or missing required inputs fail closed.

## Email contract

The command must use the existing `staffLoginRequestSchema` to normalize and validate the submitted email, so provisioned identity uses exactly the same trim/lowercase/email/max-length behavior as Staff Auth login.

The normalized email is the only value persisted.

No alternate username or phone-based authentication convention is introduced.

## Password transport and policy

The raw password is accepted **only** from standard input when `--password-stdin` is present.

The command must not accept a raw password through:

- a command-line value such as `--password`;
- an environment variable;
- a config file argument;
- JSON output/logging.

When stdin is an interactive TTY, the command fails with a bounded instruction to provide password input through the controlled stdin path rather than visibly echoing a secret.

The stdin reader removes at most one terminal line ending (`LF` or `CRLF`) and otherwise does not trim or normalize the password. Embedded newlines are rejected.

While Staff Auth is password-only, a provisioned password must contain at least **15 Unicode code points**. The provisioning command accepts up to **128 Unicode code points** and remains subject to the existing Staff Auth maximum of **1024 UTF-8 bytes**. No character-class composition rule is added.

The password is hashed with the exact DEC-023-compatible Argon2id profile:

```text
argon2id
version = 19
memoryCost = 65536 KiB
timeCost = 3
parallelism = 4
saltLength = 16 bytes
hashLength = 32 bytes
```

Tests must prove the resulting verifier is accepted by the current `isAcceptedStaffPasswordHash` validator.

The raw password and its verifier must never be emitted in normal output, errors, logs, or AuditEvent metadata.

## Create-only semantics

VAL-004R creates a **new** staff identity only.

The command fails closed if the normalized email already exists in `users`.

It does not:

- reset or rotate an existing password;
- reactivate a disabled User;
- attach a new Organization membership to an existing User;
- change an existing membership role/status;
- change existing Location access.

Those are separate privileged lifecycle operations and require their own accepted contract if later needed.

This deliberate create-only behavior prevents an operator typo from silently taking over or broadening an existing identity.

## Organization and Location validation

Before mutation, the transaction must verify from persisted rows that:

- the target Organization exists and is `ACTIVE`;
- every requested Location exists;
- every requested Location belongs to that exact Organization;
- every requested Location is `ACTIVE`;
- the audit Location is among the granted Location IDs.

Caller-supplied names, Organization codes, Location codes, membership IDs, or tenant claims are not substitutes for persisted UUID relationships.

No Organization or Location is created by this command.

## Atomic persistence

One database transaction creates all required state:

1. one `users` row with:
   - generated UUID;
   - normalized email;
   - accepted Argon2id verifier;
   - `ACTIVE` status;
   - no phone by default;
2. one `organization_memberships` row with:
   - generated UUID;
   - requested Organization;
   - requested role;
   - `ACTIVE` status;
3. one `membership_location_access` row for each requested Location;
4. one `audit_events` row.

Server/database time is authoritative for persisted timestamps.

Any failure rolls back the entire provisioning attempt. No partial User, membership, Location access, or audit record may remain.

The existing unique email constraint remains the final concurrency guard for simultaneous attempts. A duplicate/concurrent loser is mapped to a bounded provisioning error without raw constraint/SQL details.

No schema migration is required by this decision. Exactly 18 migrations remain unchanged.

## Audit contract

Successful provisioning writes exactly one AuditEvent in the same transaction.

Canonical values:

```text
eventType  = STAFF_ACCOUNT_PROVISIONED
entityType = OrganizationMembership
entityId   = newly created membership ID
```

`organizationId` is the target Organization.

`locationId` is the explicit `--audit-location-id` required by the command and must be one of the new membership's granted Locations.

`actorMembershipId` is `NULL` because the action is performed through the controlled platform/deployment operator boundary, not by an authenticated tenant membership.

`metadataJson` contains only bounded safe provenance/scope information:

```text
provisioningBoundary = CONTROLLED_OPERATOR
operatorRef
reason
role
locationIds (sorted)
```

Audit metadata must not contain:

- email;
- phone;
- raw password;
- password hash;
- database URL/role/password;
- TLS CA content/path;
- Authorization/cookie/token data.

This operator reference is accountability metadata only and does not create VAYLET Super Admin persistence.

## Output and error behavior

On success the command emits one machine-readable JSON result containing only non-secret identifiers/scope, such as:

- `userId`
- `membershipId`
- `organizationId`
- `locationIds`
- `role`
- `auditEventId`

Do not emit the email, password, password hash, operator reason, database URL, or database identity.

Expected validation/conflict/database/TLS failures use bounded operator-safe messages. Raw SQL, PostgreSQL constraint names, stack traces, connection options, credentials, certificate contents, and secret input must not be printed by the normal CLI path.

A non-successful provisioning exits non-zero.

## ORG_ADMIN / MFA boundary

The command may create an `ORG_ADMIN` membership because it is a controlled offline operator action and `ORG_ADMIN` is an existing tenant role.

This **does not** make password-only sessions MFA-capable and does not enable privileged Company Admin APIs that require MFA. No such privileged HTTP capability may be introduced by VAL-004R.

VAYLET Super Admin remains a separate platform-level identity model and is not created or inferred here.

## Runtime / architecture boundary

No HTTP route, Nest provider, application module, middleware, global filter, Staff Auth token/session behavior, Anti-Abuse behavior, or runtime database provider changes are part of VAL-004R.

The provisioning tool is operator tooling outside `apps/api/src/**`; the application runtime must not import it.

DEC-028 architecture checks remain unchanged and green.

## Regression requirements

Tests must prove at minimum:

- staff-login email normalization/validation parity;
- password accepted only through the stdin boundary;
- one terminal line ending handling without general trimming;
- embedded newline rejection;
- 15-code-point minimum and 128-code-point/1024-byte bounds;
- generated Argon2id verifier passes the current Staff Auth verifier-format validator;
- all four accepted roles;
- missing/inactive Organization rejection;
- missing/inactive/cross-Organization Location rejection;
- duplicate Location input rejection;
- audit Location membership requirement;
- existing normalized email rejection without mutation;
- atomic rollback when membership/access/audit insertion fails;
- one safe `STAFF_ACCOUNT_PROVISIONED` AuditEvent on success;
- audit metadata excludes credential/email/database secret material;
- production migration TLS verification runs before `BEGIN`/mutation;
- non-production execution rejects non-loopback administrative database targets;
- tested error/output paths do not expose raw password/hash/database URL/CA material;
- no public route or runtime import is introduced;
- architecture check remains green;
- exactly 18 migrations and Prisma schema remain unchanged.

Run the normal full repository quality gates and the existing development/production Prisma validation/diff checks.

## Scope boundary

VAL-004R does not:

- start Phase 3;
- add signup;
- add password reset/change;
- add account reactivation/deactivation;
- add existing-user membership attachment;
- add role changes;
- add MFA/passkeys/SSO;
- add VAYLET Super Admin persistence;
- create Organizations or Locations;
- redesign Staff Auth/Anti-Abuse;
- change token/cookie/session lifetimes;
- change database schema/migrations;
- declare external deployment checklist evidence complete;
- claim a fresh Standard Security Scan;
- declare Phase 2 production-ready by itself.

## Consequences

- Production can create the first real Staff Auth-capable accounts without manual password-hash SQL or a public signup surface.
- Account creation remains behind the already hardened administrative database boundary.
- Tenant role and Location scope are explicit and atomically audited.
- Existing identities cannot be silently reset or broadened by this command.
- MFA-gated privileged administration and broader account lifecycle management remain separate future security decisions.
- Final Phase 2 security/integrity closure and a fresh post-fix Standard Security Scan still remain before Phase 3.