# DEC-025 — Production Database Connection / Credential Hardening

Status: Accepted  
Date: 2026-08-10

## Context

Phase 2 now has production staff authentication, guest access, durable anti-abuse state and a dedicated least-privilege PostgreSQL runtime role. The remaining database deployment boundary is not application business logic: production connections must be authenticated and encrypted without downgrade, the runtime process must not possess migration/admin authority, and the live connected runtime role must be checked against the accepted least-privilege contract.

Local development remains PostgreSQL on loopback and may use plaintext transport. Production must not silently inherit that development posture.

## Decision

VAL-004N hardens the existing PostgreSQL architecture. It does not introduce a new database, proxy, cloud provider or migration.

The production application runtime uses `DATABASE_URL` plus explicit Node `pg` TLS configuration. The production migration/admin path uses `MIGRATION_DATABASE_URL` with a narrowly allowlisted Prisma TLS query contract. Both paths fail closed when their production TLS or credential contract is not satisfied.

Exactly 18 forward-only migrations remain after VAL-004N.

## Runtime application connection

`DATABASE_URL` remains the runtime credential and remains a PostgreSQL URL containing username, password, host, port and database name.

For the Node application runtime:

- URL query parameters remain prohibited.
- URL fragments remain prohibited.
- username, password and database name are required.
- production TLS is configured outside the URL so node-postgres connection-string parsing cannot replace the explicit TLS object.

Production is `NODE_ENV=production`.

In production the runtime pool is created with TLS certificate verification enabled. `rejectUnauthorized: false`, trust-all certificates and plaintext fallback are prohibited.

The TLS trust source is:

```text
DATABASE_TLS_CA_PEM
```

If `DATABASE_TLS_CA_PEM` is present, it must contain one or more PEM CA certificates and is supplied as the explicit CA trust material for the Node TLS socket. If it is absent, the Node/system trusted root store is used. An empty/whitespace value is invalid when the variable is present.

Hostname/IP certificate verification remains enabled through the normal Node TLS verification path. No custom `checkServerIdentity` bypass is allowed.

Development/test may use the existing plaintext local PostgreSQL path. Production never falls back from TLS to plaintext.

## Production runtime secret compartmentalization

The application runtime deployment receives only the ordinary runtime database credential.

When `NODE_ENV=production`, application startup fails if `MIGRATION_DATABASE_URL` is present in the API process environment. The migration/admin secret belongs only in the migration/provisioning job boundary.

The runtime application must never log either URL, database passwords, CA PEM content or derived TLS material.

## Live runtime connection verification

Before the production API is considered ready to serve protected traffic, a real connection from the runtime pool must pass a startup verification transaction/query.

The verification checks the current backend itself, using PostgreSQL-authoritative metadata:

- `pg_stat_ssl` for `pg_backend_pid()` reports `ssl = true`;
- negotiated TLS version is non-null and accepted by the active Node/PostgreSQL security baseline;
- current role is not superuser;
- current role cannot create databases;
- current role cannot create roles;
- current role has no replication capability;
- current role cannot bypass RLS;
- current role does not own the current database;
- current role does not own the `public` schema;
- current role has no `CREATE` privilege on the current database;
- current role has no `CREATE` privilege on the `public` schema;
- current role owns no ordinary application tables/sequences/functions in `public`.

A missing row, insufficient authoritative result, unsafe privilege, non-TLS production connection or verification-query failure makes production startup fail closed.

The check is a compensating runtime safety guard. It does not replace the repository's explicit runtime-role `GRANT`/`REVOKE` provisioning or its integration tests.

## Migration/admin connection

`MIGRATION_DATABASE_URL` remains the migration/admin credential and must remain a distinct database role from `DATABASE_URL`.

Development/test may use a base PostgreSQL URL without TLS query parameters.

In production, Prisma migration/admin commands require a narrowly allowlisted query contract. The only accepted query keys are:

```text
sslmode=require
sslaccept=strict
sslrootcert=<optional certificate path>
```

Rules:

- `sslmode` must be exactly `require`;
- `sslaccept` must be exactly `strict`;
- `sslrootcert` is optional and may point to deployment-mounted CA material when the server chain is not trusted by the normal environment;
- duplicate query keys are rejected;
- every other query key is rejected;
- URL fragments are rejected;
- `sslmode=disable`, `sslmode=prefer`, `accept_invalid_certs` and equivalent downgrade/bypass modes are rejected.

Repository code must centralize this parsing/validation so Prisma configuration, runtime-role provisioning and production migration preflight do not drift into different URL policies.

The provisioning path compares migration and runtime identities and rejects the same role. It also rejects reusing the same database password for the migration/admin role and runtime role in production.

The migration/admin secret is never made available to the API runtime process.

## Migration TLS verification

A production migration/provisioning job must prove its actual PostgreSQL connection is encrypted before applying schema or privilege changes.

A focused preflight connection using the migration/admin URL checks `pg_stat_ssl` for its own backend and fails closed if TLS is not active. Prisma migration execution must use the same validated target and accepted TLS parameters.

No code may strip the accepted TLS parameters before invoking Prisma in production.

## Network boundary

Application code cannot prove cloud firewall/VPC/security-group topology. Therefore the following is a deployment gate, not a claim of repository enforcement:

- production PostgreSQL must not be directly exposed as a generally reachable public-internet service;
- runtime database access is restricted to the application deployment network/identity boundary;
- migration/admin access is restricted to the controlled deployment/migration boundary;
- direct developer workstation access to production is not a default application requirement;
- provider firewall/security-group/private-network/allowlist controls must be documented and verified for the actual production environment;
- no provider-specific mechanism is selected by this decision.

The local `docker-compose.yml` loopback-only PostgreSQL publication remains development-only and is not a production deployment topology.

## Credential handling and rotation

Production database credentials and CA material are supplied by deployment secret management, never committed to Git.

Rotation must support independent runtime and migration/admin credential replacement. Rotation must not require making the migration/admin credential visible to the API process.

The repository does not invent a cloud secret manager or an automatic credential-rotation service in VAL-004N. The deployment runbook must record ownership and the procedure for rotating each database identity.

## Error behavior

Database TLS/configuration/privilege verification failures are startup/deployment failures, not public API detail.

Errors may identify the violated configuration category but must not include:

- database URLs;
- usernames when unnecessary;
- passwords;
- CA PEM content;
- certificate bodies;
- raw connection options;
- server internals beyond the bounded reason needed for operators.

Protected traffic is not served through a knowingly unsafe production database connection.

## Testing contract

Tests must prove at minimum:

- production runtime URL rejects query strings/fragments and missing credentials;
- production runtime creates TLS with certificate verification enabled;
- explicit CA PEM is passed without logging it;
- production cannot start on a plaintext live PostgreSQL connection;
- production cannot start with superuser/createdb/createrole/replication/bypassrls/ownership/CREATE-capable runtime roles;
- accepted least-privilege runtime role passes the live verification;
- production API startup rejects the presence of `MIGRATION_DATABASE_URL`;
- production migration URL requires exact `sslmode=require` + `sslaccept=strict` and rejects all non-allowlisted/duplicate/downgrade parameters;
- production provisioning rejects same runtime/migration role and same password;
- migration/admin preflight rejects a plaintext live connection;
- local development loopback PostgreSQL remains usable without production TLS configuration;
- no database password/URL/CA material is emitted by tested error/log paths;
- existing runtime-role privilege tests remain green;
- migrations remain exactly 18 and migrations 1–18 are unchanged by this task.

## Documentation / deployment gate

VAL-004N must update the binding security/database/engineering status docs and `.env.example` with safe placeholders only.

It must add a provider-neutral production database deployment checklist that separates repository-enforced checks from infrastructure checks. The checklist must include TLS verification, private/restricted network reachability, runtime/admin credential separation, secret storage/rotation ownership, and encrypted backup/restore ownership status.

The checklist is evidence for later Phase 2 closure; checking in a template does not falsely assert that an actual production provider has already been configured.

## Scope boundary

VAL-004N does not:

- start Phase 3;
- redesign DEC-023 staff auth or DEC-024 anti-abuse;
- add Redis/WAF/CAPTCHA/MFA;
- choose a cloud/VPC/database provider;
- implement object storage;
- implement backup infrastructure itself;
- claim a fresh Standard Security Scan;
- declare Phase 2 production-ready by itself.

After VAL-004N is merged, the next required gate is a final Phase 2 closure/security-integrity review, including the explicitly tracked production deployment checklist and a fresh security review/scan where tooling permits.

## Reason

The existing architecture already has the right separation primitives: distinct runtime/migration URLs, a dedicated runtime role and PostgreSQL as the mandatory shared store. The smallest hardening step is therefore to make TLS verification and runtime privilege safety fail closed, compartmentalize the admin credential, and turn provider-owned network/security controls into explicit deployment evidence rather than pretending application code can enforce them.