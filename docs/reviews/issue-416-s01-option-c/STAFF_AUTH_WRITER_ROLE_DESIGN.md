# Issue #416 S01 — Dedicated Staff Auth Writer Role/Pool

**Status: OWNER APPROVAL REQUIRED — DESIGN ONLY.**

This proposal is deliberately limited to Staff Auth session and refresh
credential writes. No new role, connection string, migration, pool, or runtime
route has been implemented by W35.

## 1. Problem and threat boundary

At baseline SHA db85db57fc5c3913a22d34ab5d9ef77269756301:

- staffCredentialHash() is public, unkeyed SHA-256 over the submitted bearer.
- The DATABASE_URL runtime role has column INSERT on staff_auth_sessions,
  including user_id and current_access_token_hash, and UPDATE on
  current_access_token_hash and expiry fields.
- The same role has table INSERT and column UPDATE on
  staff_refresh_credentials.
- DatabaseStaffSessionContextResolver accepts a row when the presented
  bearer hashes to current_access_token_hash, the session is unrevoked and
  unexpired, and the User is ACTIVE. It does not require a signed issuance
  receipt.

Consequently a SQL-only T5 principal can choose a known bearer, compute its
digest, and use the runtime grants to create or replace a session/refresh
credential. Constraints and FKs validate row shape, not credential origin.
**Later independent verification:** W37 reproduced the runtime-session and
refresh forgery with actual restricted SQL privileges and mounted HTTP200,
recorded in `docs/validation/issue416-option-c-launch-security-evidence.md`.
W56's separately restricted-migrator provisioning exercise remains blocked;
neither result authorizes implementing the proposed writer role.

The intended boundary is specifically: possession of ordinary DATABASE_URL
SQL authority must not imply authority to mint or rotate Staff bearers. A
compromised API process or writer credential is outside T5 and must be treated
as a higher trust-boundary compromise.

## 2. Recommended design

**2026-11-15 implementation reconciliation:** Owner-approved Option C retains
the SQL-only ordinary-runtime T5 threat boundary. The trusted Staff Auth writer
principal can issue sessions directly once its credentials are obtained; this
is an explicit higher-trust T6 credential-compromise risk, requiring separate
secret custody, no shared runtime credentials, and application-only raw
password verification before invoking its writes. No claim is made that the
database cryptographically attests the password ceremony to this writer.
The S01 implementation transfers logout to this same protected writer because
PostgreSQL `FOR UPDATE OF refresh` cannot run on a read-only refresh table;
logout still commits session revocation and Push retirement together. The
dedicated writer receives only the exact Push retirement columns needed.
As S04 removes general anti-abuse UPDATE grants, S01 commits login reservation
success via `public.s04_staff_login_success(uuid,text)` with its exact
returned row count of one, rather than generic limiter-table updates.
Activation of a verified Staff invitation likewise uses the writer-only
`staff_onboarding_activate(text,text,text)` function.
The preceding role matrix records the original proposal and is superseded
by this narrow implementation reconciliation where the two differ.

Use one dedicated login role and one API connection pool for the small set of
Staff Auth domain writes. Do not convert the other 35 writer families and do
not activate global VAP1.

Proposed role: vaylet_staff_auth_writer (LOGIN, NOINHERIT, NOSUPERUSER,
NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS).

Proposed application secret: STAFF_AUTH_WRITER_DATABASE_URL.

The URL must identify the same PostgreSQL server, port and database as
DATABASE_URL, but a distinct username and independently rotated password.
It must use the same production TLS policy. It must not equal
MIGRATION_DATABASE_URL or DATABASE_URL. Neither the runtime role nor the
writer role may be a member of the other; neither may SET ROLE to the other.
The writer role owns no database, schema, table, sequence or function.

RuntimeDatabaseModule would expose a dedicated STAFF_AUTH_WRITER_POOL. Only
StaffAuthService may inject it. No generic repository, controller, management,
Guest, MFA or Push service receives this pool. No fallback to the ordinary
runtime pool is permitted when the writer URL is absent.

## 3. Proposed permission contract

| Object | Ordinary runtime role | Staff Auth writer role |
|---|---|---|
| staff_auth_sessions | SELECT; UPDATE only revoked_at, mfa_authenticated_at, mfa_factor_id, last_admin_activity_at | SELECT only id,user_id,absolute_expires_at,revoked_at; INSERT exact login columns; UPDATE current_access_token_hash, access_expires_at, last_rotated_at, and revoked_at for refresh replay |
| staff_refresh_credentials | SELECT only | SELECT only id,session_id,token_hash,generation,expires_at,consumed_at; INSERT exact six issuance columns; UPDATE only consumed_at, replaced_by_credential_id |
| users | Existing runtime grants unchanged | SELECT only id,password_hash,status; UPDATE only last_login_at,updated_at |
| anti_abuse_events | Existing anti-abuse grants unchanged | SELECT only id,scope,key_hash,state; UPDATE only state for the same pending login reservation |
| MFA factors/recovery | Existing MFA grants unchanged | No access |
| Push registrations | Existing Push grants unchanged | No access |
| Other public tables/sequences | Existing runtime grants unchanged | No access |
| Private VAP1 schema/functions | No new access | No new access |

The exact writer-role grants must be checked against the current SQL statements
in StaffAuthService.login() and .refresh() before implementation. In
particular, the writer role must not update users.password_hash/status, MFA
assurance columns, membership/tenant state, or Push registration state.

Ordinary runtime revoked_at remains a one-way operation only. Before cutover,
add a forward-only monotonicity guard proving an already revoked session cannot
be unrevoked or have its revocation timestamp rewritten. Existing logout and
session-revocation SQL uses COALESCE(revoked_at, now) and should remain valid.
MFA continues to update only its current assurance/activity columns.

## 4. Application flow and compatibility

- Browser login and native login continue through StaffLoginService and
  StaffAuthService; only the transaction that creates session/refresh rows
  moves to the writer pool.
- Browser refresh and native refresh continue through the same
  StaffAuthService.refresh() operation; its entire lock/read/rotate/commit
  transaction uses the writer pool.
- Browser logout and native logout remain on the ordinary runtime pool for
  monotonic revoked_at and existing Push disable behavior.
- DatabaseStaffSessionContextResolver remains on the ordinary runtime pool
  with SELECT-only session/refresh access.
- MFA factor enrollment, confirmation, step-up, recovery and admin-activity
  updates remain on the ordinary runtime pool with their existing exact
  column grants.
- Guest and Push paths remain unchanged.
- Anti-abuse reservation remains on the existing runtime pool. Successful
  login finalization (PENDING to IGNORED) occurs inside the writer
  transaction; failed login finalization remains the current conservative
  COUNTED path. Unknown COMMIT behavior must be designed before cutover:
  the service must never return tokens or count a committed reservation as a
  failure without authoritative commit reconciliation.

For an ambiguous COMMIT acknowledgement, the application must retain the
original random session/refresh IDs and raw token values in process memory,
then use a separate read-only transaction to verify the exact persisted
session, refresh row, token digests, user/session binding, replacement
lineage and limiter outcome. Return the original tokens only when the exact
committed state is proven; never execute the write a second time. If the
readback is unavailable or contradictory, fail closed and leave the limiter
conservative. Refresh uses the same rule with the old consumed credential and
the exact replacement ID/hash. This is a required application change, not
something the extra DB role provides automatically.

## 5. Required environment and provisioning

Required new deployment secret: STAFF_AUTH_WRITER_DATABASE_URL.

No VAYLET_AUTH_PROOF_KEYRING_JSON, A01/A02 signer, new VAP1 audience,
universal admission bootstrap, or new migration-owner membership is required
for this proposal.

A separate provision-staff-auth-writer-role.mjs would:

1. Connect only with MIGRATION_DATABASE_URL and enforce existing TLS and
   database-identity checks.
2. Parse STAFF_AUTH_WRITER_DATABASE_URL; require same host/port/database as
   DATABASE_URL and distinct login/password identity from both existing
   credentials.
3. Create or verify the dedicated login role with the attributes above.
4. Reject any membership edge, unsafe role attribute, object/container
   ownership, PUBLIC grant, default ACL grant, or unlisted table/function
   privilege.
5. Apply only the exact grants in section 3, idempotently.
6. Verify both positive writer permissions and negative runtime permissions
   using effective has_table_privilege, has_column_privilege,
   has_function_privilege, pg_auth_members SET/INHERIT options and PUBLIC/
   default ACL catalog checks.

The existing vap1-security-privileges.mjs is not part of this design. The
ordinary runtime provisioner must not call retireLegacyVap1Grants.

## 6. Mandatory proof before any grant cutover

**Source/API tests**

- Login with correct raw password creates exactly one session and one initial
  refresh credential; wrong password and PHC-as-password create neither.
- Browser and native login/refresh/logout remain behaviorally equivalent.
- Refresh rotates access and refresh atomically; absolute expiry remains fixed.
- Concurrent refresh has one winner; replay revokes the family and old access.
- Logout revokes the session and disables its Push registrations.
- MFA enrollment, confirmation, step-up, recovery, and admin-activity tests
  pass unchanged.
- Guest and Push integration suites pass unchanged.
- Anti-abuse success/failure/UNKNOWN outcomes remain conservative and
  idempotent; no lost token on ambiguous COMMIT.

**Actual PostgreSQL 17 permission tests**

Run only on a separately attested disposable fixture with unique Docker
context/daemon, container ID, PostgreSQL system identifier, database, role and
port. Do not use W9, Prime, shared, staging or production databases.

- As ordinary runtime: direct session INSERT, token-hash UPDATE, expiry
  UPDATE, refresh INSERT, refresh consumed/replaced UPDATE all fail with
  insufficient privilege; SET ROLE vaylet_staff_auth_writer fails.
- As writer role: exact login and refresh writes succeed; attempts to update
  User password/status, MFA assurance, membership, Push, or unrelated tables
  fail.
- Prove no PUBLIC/default ACL, inherited role, function EXECUTE or ownership
  path restores session/refresh write authority to runtime.
- Prove SQL-created known bearer under ordinary runtime returns 401 through
  the mounted Staff Auth/session resolver; the same API login/refresh works
  through the writer pool.
- Re-run the above after role reprovisioning and migration replay.

## 7. Deployment sequencing and rollback

1. Owner approves the credential architecture, exact env contract and
   operational owner for the new secret.
2. Provision the writer role and secret without revoking legacy runtime grants.
3. Deploy all API instances with the writer pool required and no silent
   fallback; verify pool identity and health.
4. Exercise browser/native login, refresh, logout, MFA, Guest and Push on the
   new version; drain every old API instance.
5. In one reviewed maintenance/cutover step, revoke ordinary runtime session
   INSERT and credential-field UPDATE, refresh INSERT/UPDATE, and verify the
   exact runtime/writer ACLs.
6. Confirm no old application instance remains. Keep a rollback target only
   if it understands the writer pool. Blind rollback to the old direct writer
   is incompatible with the revoked grants and must not restore them silently.

This is a material deployment credential change and needs a coordinated
rollout/rollback plan. W35 has not implemented any part of this architecture.

## 8. Alternatives not selected

- **Universal VAP1 / A01+A02:** not selected for Option C. Current A01 depends
  on global security_boundary='PROTECTED', user authority-admission bootstrap
  and U1 key custody; A02 refresh SQL/application protocol is absent. Global
  VAP1 retirement also covers unrelated writer families. Prime explicitly
  directed W35 not to resume that path.
- **Change SHA-256 to HMAC only:** insufficient. An SQL writer can copy a
  known existing bearer hash to another session or replace an existing
  session's hash. The authority to write session/refresh rows must be removed
  from the ordinary runtime principal.
- **Remove direct grants before replacement is deployed:** breaks current
  login/refresh and is not an acceptable partial rollout.

## 9. Approval requested

Approve or reject only the proposed dedicated vaylet_staff_auth_writer login
role, STAFF_AUTH_WRITER_DATABASE_URL, dedicated pool and exact permission
matrix. Until approval, current direct runtime grants and routes remain
unchanged; no new role, secret, pool, migration or deployment action is
authorized by this design document.
