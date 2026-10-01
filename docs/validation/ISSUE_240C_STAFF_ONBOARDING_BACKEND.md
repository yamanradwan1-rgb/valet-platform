# Issue #240 / T05-C secure staff onboarding backend

Branch: `fix/240c-staff-onboarding-backend`. Starting SHA:
`e69b20224dc41e7d6de13a2b3d22eb9b4b0bc360`.
Scope: issuance/persistence/resend only. Activation, ownership proof, password
setup, Dashboard UI and every Shift/Force End change remain T05-D or later.

## Contract ledger and pre-code model

Authority: owner T05-C brief sections 5–48 and locked U-01/U-02 in
`docs/plans/dashboard-issues-236-243-implementation-plan.md` section 28,
amending Accepted DEC-081. DEC-023 owns password verification; DEC-078 owns
MFA; DEC-079/082 own audit atomicity/privacy; DEC-088 owns entitlements.

| Locked behavior | Scope / persistence authority | Retry/concurrency | Audit/privacy |
| --- | --- | --- | --- |
| PENDING User with null password; reuse ACTIVE/PENDING; conceal DISABLED | Global User; unique email; brief 8/9/12/33 | Normalized-email advisory + User security locks | No account-state disclosure, no fake password |
| PENDING membership owns required names/role/grants | Tenant membership; existing tenant FKs and unique org/User; brief 5–11 | Staff Organization lock; complete grant proof | Names/email excluded from audit |
| CA lower roles, LM Employee/Supervisor fully covered | Persisted actor/Organization/entitlement/grants; brief 6/7/26/27 | Exact-session sensitive MFA, actor and grant/Location locks | Denials conceal foreign/elevated/mixed/zero targets |
| Fresh issuance only returns raw link | Invitation; brief 14–23 | Unique org operation/fingerprint, membership generation/current index | Hash-only storage; trusted origin + fragment |
| Explicit resend rotates all prior unconsumed generations | Same pending membership; brief 22/29 | Serialized generation; replay creates nothing | Exactly one safe event per changed operation |
| Lost result reconciles same operation | Invitation operation identity; brief 23/30 | Same digest returns original safe facts; different digest conflicts | No old/replacement raw link on replay |
| Pending quarantine | All ordinary auth/staff/operational boundaries; brief 11/28 | DB command rejection before no-op or write | Ordinary status schema remains ACTIVE/INACTIVE |
| Narrow runtime writes and atomic history | Migration-owner commands; brief 24/34/35 | Whole transaction includes audit and admin activity | Private helpers/PUBLIC denied; no direct table DML |

Derived mechanics: one purpose-specific invitation table, SHA-256 material
fingerprints, ordered security locks and focused modules/tests. Forbidden:
redemption, ownership proof, password creation/reset, external delivery, UI,
Shift/Task/ValetSession mutations. No unresolved product decision.

## Lock and authorization execution model

Authenticate the existing StaffSession first. Within the issuance transaction:
normalized-email advisory lock; resolve existing global User; acquire sorted
`staff-user-security:<user>` advisory locks for actor and existing invitee;
existing sensitive MFA session/User row boundary; existing
`staff-management-org:<organization>` lock; actor membership; Organization and
subscription SHARE protection; sorted LM active grants/Location SHARE protection;
target membership; invitee User SHARE protection; invitation generation; audit.

Identity locks precede MFA locks so reciprocal invitations cannot each hold an
actor User row while waiting for the other's security lock. Same-Organization
existing non-pending membership is rejected before invitee User row locking.
No Location-lifecycle advisory is acquired after the staff Organization lock.
Future T05-D must use the same email/security-before-session/Organization order
and locked pending membership/generation, and independently recheck authoritative
expiry, revocation, consumption and global User state. No activation is shipped.

First domain write follows persisted actor, target role, Location set and account
eligibility proof. The restricted API uses narrow security-definer commands for
protected writes, then records existing admin activity before transaction commit.
Raw link disclosure follows successful COMMIT only. Audit failure rolls back all
new account, membership, grant and invitation rows.

## Validation evidence — 2026-10-01

The final focused suites passed against PostgreSQL 17.10. All API database suites
booted a real Nest HTTP application with a distinct provisioned restricted runtime
role; they did not use the migration owner for application commands. Administrative
fixture connections seeded state and controlled deterministic transaction barriers.
Owned harness cleanup reported zero retained test databases, roles or subprocesses.

| Focused file | Passing tests | Evidence |
| --- | ---: | --- |
| API staff-onboarding.integration.test.ts | 7 | New/reused accounts, strict fresh/replay facts, audit privacy, atomic create rollback |
| API staff-onboarding-authority.integration.test.ts | 5 | CA/LM roles, complete active-grant coverage, MFA freshness, entitlement/member loss |
| API staff-onboarding-quarantine.integration.test.ts | 2 | Directory/detail/mutation concealment, pending login failure and no sessions, no pending management authority |
| API staff-onboarding-resend.integration.test.ts | 5 | Rotation/replay, expiry/terminal proof, rollback, lost target authority, origin-independent reconciliation |
| API staff-onboarding-races.integration.test.ts | 10 | Lock barriers for identical/conflicting/same-email creates, cross-tenant global reuse, grant/entitlement loss, competing resends, rollback winner |
| API staff-onboarding-database.integration.test.ts | 2 | FK/check/unique/current constraints, twice-rerun provision, direct DML/helper denial and DB pending quarantine |
| API staff-onboarding-policy.test.ts | 4 | Entropy/hash/origin/fingerprint and bounded measurement/log/error privacy |
| API staff-auth.service.test.ts | 5 | One dummy verification for null pending password, nearby timing/origin regressions |
| API staff-auth-native.integration.test.ts | 11 | Existing native auth/login/refresh/logout regression |
| API staff-management-lm-mutations.integration.test.ts | 2 | Focused T05-B lower-role/grant mutation regression |
| API staff-management-lm-authority-races.integration.test.ts | 5 | Existing revoke/mixed/zero/version/Location-deactivation serialization regression |
| Database staff-onboarding-migration.integration.test.ts | 2 | Actual Prisma 050→051 and fresh 51-migration deployment; preservation |
| Contracts staff-onboarding.test.ts | 5 | Strict identity, credentials/unknown-key rejection, role/Location/response/resend bounds |
| Contracts staff-management.test.ts | 8 | Existing T05-A/B contracts stay unchanged |

Totals count each test once, using its latest successful execution: **58 API tests**
(49 database-backed and 9 non-PostgreSQL), **2 database migration tests**, **13 contract
tests**; **73 focused tests**. Reruns corrected a failed fixture or followed a material
change; the counts do not inflate duplicated runs.

Executed package gates: contracts, API and database typecheck; Dashboard typecheck
once as compatibility evidence; Prisma validate; changed authored-file ESLint with
zero warnings; changed applicable-file Prettier check; architecture check; git diff
--check. All passed. Every changed/new authored TS/MJS file is <=300 physical lines.
Architecture retains only untouched legacy warnings. The stale auth-service
grandfather entry was removed; no allowance was added or raised.

Broad root test/lint/typecheck/build, the full 7,000+ database assertions, unrelated
old Phase/MOB/payment/dispatch suites, full Dashboard test/build, drift against
production, security scans and remote CI were **not run**. No skipped gate is PASS.
No Docker image/build/restart claim: an existing local PostgreSQL container served
isolated migrated databases and real HTTP application paths.

### Reproduction commands

Run from the repository root in PowerShell with its locked pnpm 10.34.5 toolchain.
Set DOTENV_CONFIG_PATH to the absolute root .env path without printing its contents.

```powershell
$env:DOTENV_CONFIG_PATH=(Resolve-Path .env).Path
pnpm --filter @valet/api exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-onboarding.integration.test.ts test/staff-onboarding-authority.integration.test.ts test/staff-onboarding-quarantine.integration.test.ts test/staff-onboarding-resend.integration.test.ts test/staff-onboarding-races.integration.test.ts test/staff-onboarding-database.integration.test.ts test/staff-onboarding-policy.test.ts test/staff-auth.service.test.ts test/staff-auth-native.integration.test.ts test/staff-management-lm-mutations.integration.test.ts test/staff-management-lm-authority-races.integration.test.ts
pnpm --filter @valet/database exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/staff-onboarding-migration.integration.test.ts
pnpm --filter @valet/contracts exec vitest run src/staff-onboarding.test.ts src/staff-management.test.ts
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/database typecheck
pnpm --filter @valet/dashboard typecheck
pnpm --filter @valet/database prisma:validate
$files=git diff --name-only e69b20224dc41e7d6de13a2b3d22eb9b4b0bc360
$code=$files | Where-Object {$_ -match '\\.(ts|tsx|mjs)$'}
pnpm exec eslint @code --max-warnings=0
pnpm exec prettier --check @code scripts/architecture-line-baseline.json
pnpm architecture:check
git diff --check
```

The combined focused command is a reproduction recipe. Actual execution was
split into owned focused batches; latest successful per-file results are above.
Existing Node24 Windows fixture subprocesses emitted DEP0190 from their existing
pnpm shell launcher. This task did not alter that unrelated launcher.

### Environment and test failures, correctly classified

The first baseline harness failed before tests because existing pg could not
resolve. An offline install lacked a cached tarball; clearing the old ignored
dependency tree stalled and was explicitly stopped. The task moved only verified
ignored node_modules directories into task-named temporary backups, restored the
exact frozen lockfile dependencies, then removed all those backups and edit scripts.
No dependency/lockfile change resulted. Restored Windows dependency hardlinks were
inaccessible under the sandbox, so validation ran through approved escalation.

The first real onboarding batch passed 15/18 database-backed cases; three fixture
setups failed, rather than proving an application defect: audit failure CHECKs
validated earlier rows, and stale MFA setup predated the session's creation time.
CHECKs were made NOT VALID (enforced on subsequent writes), and session timestamp
ordering was preserved. A subsequent FK test encountered the current-generation
unique index before its intended FK; its duplicate fixture was marked revoked so
the FK could be tested independently. These cases were rerun successfully.

Hostile review found a real origin-config coupling: replay attempted link creation.
Fixed by constructing a link only for changed issuance inside the transaction;
invalid config rolls back fresh create/resend, while an authorized replay still
returns durable facts without a link. Added a real HTTP regression and reran
rotation/race suites. No known failing focused test remains.

## Security, persistence and review findings

- User states: PENDING/ACTIVE/DISABLED. Membership states:
  PENDING/ACTIVE/INACTIVE. New identity stores null password; the User CHECK requires
  null exactly for PENDING and non-null otherwise. Existing values/defaults stay.
- Invitation model: StaffOnboardingInvitation / staff_onboarding_invitations.
  Organization plus composite target/issuer FKs; member/generation, org/operation
  and hash uniques; positive generation, 64-hex fingerprint, domain-hash format,
  expiry/terminal ordering CHECKs; partial one-current index. No historical row
  deletion by runtime or command path.
- Credential: vsi1. plus 32 random bytes, unpadded base64url (43 characters).
  Verifier is staff-invite-sha256:v1: plus SHA-256 of staff-invite:v1: plus raw token.
  Database-authoritative TTL is 24 hours (86,400 seconds), aligned with the existing
  VAL-004F guest credential lifetime in docs/06_SECURITY_AND_DATA_RULES.md.
  Existing sensitive MFA is five minutes; no new session/MFA constants.
- Origin: STAFF_ACTIVATION_PUBLIC_ORIGIN; HTTPS canonical origin, with HTTP loopback
  permitted only outside production. Fixed /staff/activate#invite= fragment. No
  caller Host/Origin/forwarded header participates. The activation UI is absent.
- POST /v1/staff/management/organizations/:organizationId/staff takes strict
  operationId, firstName, lastName, email, role, locationIds. Existing T05-A Unicode
  name and staff-auth email normalization are reused. Location IDs are canonical
  UUIDs, distinct and bounded 1–50.
- POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/invitations
  takes only strict operationId. Fresh results have outcome INVITE_ISSUED and
  membershipId/invitationId/generation/expiresAt/activationLink. Replay is strict
  INVITE_PENDING_LINK_UNAVAILABLE with the same durable facts and no link.
  Both use no-store; fresh exposure follows COMMIT. No User ID/account flag.
- CA: lower three roles and existing owned Locations, including inactive ones.
  LM: Employee/Supervisor only; whole submitted/current target grant set must be
  nonempty and contained in actor's currently active Location grants. Actor User,
  member, Organization, Dashboard entitlement and exact-session sensitive MFA
  are re-proved on every attempt/replay. Supervisor/Employee cannot issue.
- ACTIVE and PENDING global Users are reused without status/password mutation.
  Cross-tenant membership existence is undisclosed. DISABLED and same-tenant
  existing memberships yield STAFF_ONBOARDING_UNAVAILABLE (409); actor/target scope
  denials remain concealed AUTHORIZATION_DENIED (404). No global reactivation.
- Normal directory predicates exclude pending before LIMIT. Detail/role/status/
  grants reject pending; forward replacement DB commands reject before no-op/write.
  /activate cannot activate pending. Existing ordinary status contracts remain
  ACTIVE/INACTIVE. Native login returns generic 401 and issues no pending session;
  the timing test proves exactly one dummy verification.
- Organization-scoped operation UUID uniquely identifies one durable issuance.
  Create fingerprint includes versioned kind/org/canonical names/email/role/sorted
  Locations; resend includes kind/org/member. Same fingerprint reconciles without
  new row/generation/audit/verifier exposure. Different material payload conflicts.
  An unknown first response is resolved by explicit same-operation retry; only an
  explicit new resend operation can return a replacement raw secret.
- Resend locks pending target and generation history, revokes previous unconsumed
  verifier and appends max-generation+1. Concurrent resends leave generations 1/2
  revoked and 3 current. Expiry, revocation and consumption all fail private
  current-proof eligibility. No token redemption/consume API was implemented.
- Grant-loss and entitlement-loss barrier tests cover create and resend. A waiting
  command cannot commit after preceding revocation. Identical/conflicting creates,
  same email in one and two tenants and an uncommitted winner rolling back all have
  real two-connection evidence. Existing T05-B Location-deactivation race passed.
- Audit events: STAFF_ONBOARDING_INVITATION_ISSUED and
  STAFF_ONBOARDING_INVITATION_RESENT; entity OrganizationMembership, tenant actor
  and target, safe invitationId/generation/operationId/outcome/role/locationCount.
  Shared strict event/metadata schemas validate the persisted facts.
- Audit insertion failure rolls back initial User/member/grants/invite and restores
  the previous generation/revocation state for resend. Admin activity is in the
  same outer transaction; only a successful commit releases the raw response.
- New runtime access: SELECT invitations; EXECUTE create/resend only. No broad
  table INSERT/UPDATE, helper EXECUTE, PUBLIC EXECUTE or grant option.
  Fixed pg_catalog, public search_path; migration-owner definer identity verified.
  Existing narrow operational audit column INSERT and row-lock/update columns are
  preserved, rather than breaking other features. A trigger denies runtime
  fabrication of the new onboarding audit families. Twice-rerun provisioning and
  direct runtime insertion/helper/ordinary-pending-command denials passed.
- Persistence/audit assertions compare booleans, hash-domain facts and key
  allowlists without rendering a raw secret. API operation measurement and its
  actual log formatter omit response/body/token; error mapping is bounded even for
  an exception containing a secret. Nest logger is disabled in the real HTTP
  fixture; no separate production log-capture claim is made.

### Hostile review trace and verdict

Applied VAYLET code review against the owner's exact starting SHA, including all
new files and migration 051. Checked all 30 owner challenges. Entry path:
strict shared transport -> established StaffSession resolver -> email/security
locks -> existing sensitive MFA/current actor -> Organization/entitlement/grant
locks -> SQL independent role/Location/account/target proof -> first domain write
-> tenant audit -> admin activity -> COMMIT -> response. Replay reuses the same
proof boundary and returns no secret.

The 050 ordinary command definitions are forward-replaced only to reject pending
targets before no-op/write and to reject non-ACTIVE/INACTIVE desired statuses.
No change to their ordinary lower-role/CAS/blocker/last-admin semantics. The
migration preservation test proves authority helpers unchanged; focused T05-B
mutations and race regressions passed. Identity-lock order is described above.
No lock inversion was identified in the reviewed command paths.

Local code review verdict: **CLEAN TO MERGE** for reviewed code. Repository CI and
human cross-review remain separate requirements before any merge. This task
authorizes neither a merge nor a PR. Remote CI was not observed.

## Exact changed-file manifest and physical authored-code counts

There are 46 changed/new files. Counts are physical lines, including blank lines;
a dash means documentation/config/schema/migration outside the authored TS/MJS
ceiling. All authored code is <=300. The baseline JSON removes one obsolete
exception; it adds no exception or threshold change.

| Exact repository path | Physical code lines |
| --- | ---: |
| `.env.example` | — |
| `apps/api/src/common/http/api-errors.ts` | 221 |
| `apps/api/src/modules/auth/staff-auth-logout.ts` | 29 |
| `apps/api/src/modules/auth/staff-auth-token-result.ts` | 15 |
| `apps/api/src/modules/auth/staff-auth-types.ts` | 47 |
| `apps/api/src/modules/auth/staff-auth.service.ts` | 298 |
| `apps/api/src/modules/auth/staff-password-verification.ts` | 53 |
| `apps/api/src/modules/auth/staff-user-security-lock.ts` | 49 |
| `apps/api/src/modules/management/management.module.ts` | 95 |
| `apps/api/src/modules/management/staff-directory-query.ts` | 101 |
| `apps/api/src/modules/management/staff-invitation-credential.ts` | 14 |
| `apps/api/src/modules/management/staff-management-authorization.ts` | 238 |
| `apps/api/src/modules/management/staff-management-projection.ts` | 84 |
| `apps/api/src/modules/management/staff-onboarding-account-lock.ts` | 40 |
| `apps/api/src/modules/management/staff-onboarding-errors.ts` | 33 |
| `apps/api/src/modules/management/staff-onboarding-policy.ts` | 61 |
| `apps/api/src/modules/management/staff-onboarding-repository.ts` | 84 |
| `apps/api/src/modules/management/staff-onboarding.controller.ts` | 95 |
| `apps/api/src/modules/management/staff-onboarding.service.ts` | 120 |
| `apps/api/test/staff-auth.service.test.ts` | 106 |
| `apps/api/test/staff-onboarding-authority.integration.test.ts` | 132 |
| `apps/api/test/staff-onboarding-database.integration.test.ts` | 185 |
| `apps/api/test/staff-onboarding-policy.test.ts` | 115 |
| `apps/api/test/staff-onboarding-quarantine.integration.test.ts` | 88 |
| `apps/api/test/staff-onboarding-races.integration.test.ts` | 248 |
| `apps/api/test/staff-onboarding-resend.integration.test.ts` | 164 |
| `apps/api/test/staff-onboarding-test-fixture.ts` | 123 |
| `apps/api/test/staff-onboarding.integration.test.ts` | 246 |
| `docs/03_DATABASE_SCHEMA.md` | — |
| `docs/06_SECURITY_AND_DATA_RULES.md` | — |
| `docs/08_DECISIONS_LOG.md` | — |
| `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md` | — |
| `docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md` | — |
| `docs/validation/ISSUE_240C_STAFF_ONBOARDING_BACKEND.md` | — |
| `packages/contracts/src/index.ts` | 62 |
| `packages/contracts/src/staff-onboarding.test.ts` | 131 |
| `packages/contracts/src/staff-onboarding.ts` | 77 |
| `packages/database/prisma/migrations/20261001005100_mgt_240c_staff_onboarding_invites/migration.sql` | — |
| `packages/database/prisma/schema.prisma` | — |
| `packages/database/scripts/runtime-staff-authority-revokes.mjs` | 38 |
| `packages/database/scripts/runtime-table-privileges.mjs` | 279 |
| `packages/database/scripts/staff-onboarding-runtime-privileges.mjs` | 104 |
| `packages/database/scripts/verify-runtime-table-privileges.mjs` | 298 |
| `packages/database/src/migration-manifest.ts` | 53 |
| `packages/database/src/staff-onboarding-migration.integration.test.ts` | 193 |
| `scripts/architecture-line-baseline.json` | — |

Old migrations 001–050 have no diff. Migration 051 is exactly
20261001005100_mgt_240c_staff_onboarding_invites. Dashboard visual source and all
Shifts/Force End sources have no diff. No activation, ownership proof, password
setup, UI or external delivery work landed. No PR, merge or Issue edit occurred.
Branch commit/remote SHA and final clean Git status are recorded in the delivery
response because a committed source file cannot contain its own final commit SHA.
