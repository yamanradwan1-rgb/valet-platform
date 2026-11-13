# Issue #416 — Option A lock and outcome closure

Status: **PROPOSED DESIGN — not implemented, not an Accepted DEC**.
Historical proposal baseline: `62d0a3d3f97a4186d2dd85642212efc7b4f35d42`.
Final source-reconciliation baseline: `eb2d0ba4aac496a238fff55bdfa9dbfdd66e1ed3`
(`cos/issue416-final-locks`, initially clean; no tracked source delta from this
base before this documentation-only edit).
This supplement replaces the simplified lock sketch in the provenance draft;
it does not authorize implementation, change public API semantics, or prove
deadlock freedom. PostgreSQL concurrency tests below are **NOT RUN**.

## Authority and scope

LOCKED: DEC-023/072 refresh replay can commit family revocation and then return
authentication failure; DEC-078 exact-session MFA, pending seed ownership,
single-disclosure recovery codes and current factor retirement remain intact.
DEC-080/081 current Company Admin, Location Manager grant coverage and last
usable Admin rules remain binding. Migration 112 audit reservations stay intact.
The Owner selected Option A direction, not these new internal mechanisms.

DERIVED REQUIREMENT: every writer of User/password/status, membership/grants,
Organization/entitlement, session/refresh, factor/recovery or session-bound push
must participate in compatible fencing or be unavailable during cutover.
There are no ValetSession or Task/Dispatch state transitions in this design.
No Company-default/Location-override policy changes are proposed.

## Verified current source graph

Paths below are repository relative. `A(name,id)` means transaction-exclusive
`pg_advisory_xact_lock(hashtextextended(name || id::text,0))`; `S`/`X` mean
row `FOR SHARE`/`FOR UPDATE`; `write` includes implicit row locks from DML.
An SQL `FOR UPDATE OF a,b` is one joined locking statement: its textual list
does **not** establish an exact physical order between a and b. No source
claim below assumes it does. Unordered bulk UPDATE similarly has no declared
row-ID order. Existence/authority reads without a locking clause are marked R.

Unless explicitly stated otherwise, these entrypoints call
`apps/api/src/common/database/postgres-transaction.ts:inPostgresTransaction`
which issues plain `BEGIN`; isolation is the connection default, not explicitly
READ COMMITTED. Production default isolation is **EXTERNAL FACT NOT VERIFIED**.
The two controlled tools and provisioning also issue plain BEGIN directly.
X/S and advisory locks are held until transaction completion, not helper return.
The legacy SQL SECURITY DEFINER functions execute inside their **caller's**
transaction and isolation, not an autonomous transaction. A direct `SELECT
function(...)` from the ordinary role need not enter the API caller's earlier
session/factor locks. A wrapper that holds new rank-03/07/12 locks and then
invokes an old definer which obtains rank-02 or 05/06 is **not** a valid migrated
command. The explicitly REPEATABLE READ management snapshot/export paths are
read-only exceptions, not evidence the above mutation paths use that isolation.

| Entry point / actual nested path | Current ordered acquisitions and writes |
| --- | --- |
| `apps/api/src/modules/auth/staff-auth.service.ts:StaffAuthService.login` -> `staff-user-security-lock.ts:lockAndRecheckStaffLoginUser` | Password lookup/Argon2 outside tx; A(`staff-user-security:`,user); User X; insert session; insert refresh generation 1; write User.last_login_at; optional anti_abuse_events write (2s local lock timeout). No existing challenge/key/receipt lock. |
| Same `refresh` -> `lockStaffRefreshUserSecurityBoundary` | R refresh-to-owner hint; A(`staff-user-security:`,user); joined refresh/session/User X; clock AFTER join; consume refresh, insert replacement, set replaced_by, rotate session. Consumed/invalid branch writes monotone session revoked_at and returns failed result from tx, so COMMIT precedes thrown auth error. |
| `auth/staff-auth-logout.ts:logoutStaffSession` -> `staff-session-revocation.ts:revokeStaffSessionAndDisablePush` | joined refresh/session X; write session.revoked_at COALESCE; bulk write active push registrations. No User-security advisory, no explicit registration-ID ordering. |
| `auth/mfa/mfa-enrollment.service.ts:MfaEnrollmentService.begin/confirm` | `mfa-session-repository.ts:lockAndRecheckMfaSession`: joined session/User X; A(`mfa-user:`,user); R management eligibility; `mfa-factor-repository.ts:lockCurrentFactor/lockFactorById`: factor X; begin inserts pending or retrieves same-session pending seed; confirm activates factor, inserts recovery slots in increasing slot order, writes session assurance, appends security audit, finalizes anti-abuse. |
| `auth/mfa/mfa-step-up.service.ts:MfaStepUpService.stepUp` | same session/User -> mfa-user -> current factor X; update accepted TOTP step; session assurance; anti-abuse finalization. |
| `auth/mfa/mfa-recovery.service.ts:beginSelfRecovery` | same session/User -> mfa-user -> factor X; selected recovery-code X; consume code; retire factor; insert pending factor; account audits; anti-abuse. |
| Same `reissueRecoveryCodes` | same session/User -> mfa-user -> factor X; insert new generation codes by slot; update factor step/generation; session assurance; audit; anti-abuse. |
| `auth/mfa/mfa-assurance-policy.ts:requireMfaAssuranceInTransaction` / `recordAdminActivityInTransaction` | require locks joined session/User X then R factor existence; ordinary activity performs guarded session UPDATE using User/factor predicates; does not acquire mfa-user or independently row-lock factor. Activity cannot change mfa_authenticated_at. |
| `apps/api/tools/security-disable/persistence.ts:persistControlledSecurityDisable` | A(`staff-security-disable:`,operation); R audit replay; A(`staff-user-security:`,user); User X; write User DISABLED; unordered session revocation; unordered registration disable; append controlled audit. |
| `apps/api/tools/mfa-recovery/persistence.ts:persistControlledMfaRecovery` | A(`mfa-recovery-operation:`,operation); R audit replay; User X; A(`mfa-user:`,user); current factor X; retire factor; append controlled audit. It does not acquire a session row before factor retirement. |
| `management/management-authorization.ts:authorizeCompanyAdminManagement` | R eligible CA; assurance joined session/User X; A(`staff-management-org:`,org); R Organization; actor membership X; optional target Location X; R commercial entitlement. |
| `management/staff-management-authorization.ts:authorizeStaffManagement` LM branch | R role; if SENSITIVE, assurance joined session/User X; A(`staff-management-org:`,org); actor membership X; R commercial access; active Locations S ordered Location.id. Ordinary LM path does not add CA MFA policy. |
| `management/staff-onboarding.service.ts:create/resend` | `staff-onboarding-account-lock.ts:lockStaffOnboardingAccount`: A(`staff-onboarding-email:`,normalized email), discover account, sorted distinct actor+target A(`staff-user-security:`,UUID); then SENSITIVE staff-management authorization above; reserve anti-abuse via its own pool transaction; call nested SQL below; finalize anti-abuse; guarded admin activity. |
| `auth/staff-activation.service.ts` -> `staff-activation-repository.ts` -> SQL `staff_onboarding_activate(text,text,text)` | bearer/optional password ceremony in app; SQL R invite identity; nested `staff_onboarding_lock_identity(NULL,email)`; A staff-management-org; Organization S; membership X; User X; invitation X; clock after locks; write User if pending, membership, invitation and audit. Consumed retry rechecks current account/password and durable activation audit. |
| `staff-push/staff-push-registration.service.ts:reconcile/disable` | `auth/staff-session-revalidation.ts:lockAndRecheckStaffSessionContext`: A staff-user-security then session X; reconcile takes sorted registration logical keys then registration X ordered id; disable locks owned registration X without logical keys. Replacement updates prior registration and inserts successor. |
| `staff-push/staff-push-maintenance-repository.ts` | registration selection `FOR UPDATE OF registration SKIP LOCKED`, bounded maintenance update; no upstream authority establishment. `staff-push-claim-repository.ts` similarly locks delivery rows SKIP LOCKED, not session authority. |
| `apps/api/tools/staff-provisioning/provisioning-persistence.ts:persistProvisionedStaff` | Organization S; Locations S with no ORDER BY; R existing email; insert User, membership, grants then audit. No email/User-security or staff-org advisory. This controlled entrypoint must be drained/migrated too. |
| Future reset issue/status/redeem | No implementation at baseline. Draft lock sketch is proposal only. Exact future sequence below. |

### Nested SQL graph (current, not future wrappers)

Migration paths use `packages/database/prisma/migrations/<directory>/migration.sql`.

| Latest defining migration / symbol | Nested acquisitions |
| --- | --- |
| `20260916003700_mgt_be_04_staff_roles_access`: `staff_management_authorize_actor(uuid,uuid)` | staff-management-org advisory then actor membership X; R active User/org. `staff_management_lock_admin_factors(uuid)` locks active Admin factors S in factor.id order for last-usable-Admin checks. |
| `20261001005000_mgt_240b_lm_staff_authority`: `staff_management_authorize_staff_actor(uuid,uuid)` | staff-org advisory; actor membership X; CA calls `staff_management_authorize_actor` (same advisory/member reacquired); LM does not. `staff_management_lock_lm_active_grants(uuid,uuid)` locks access+Location S ordered Location.id; intentionally no lifecycle advisory. |
| `20261001005100_mgt_240c_staff_onboarding_invites`: `staff_management_set_role(uuid,uuid,uuid,integer,membership_role)`, `staff_management_set_status(uuid,uuid,uuid,integer,membership_status)`, `staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)` | authorize_staff_actor; LM grants helper; target membership X; conditional admin-factors S for demotion/deactivation; location grant inserts/deletes for access. SQL-only entrypoint lacks app session/User prefix. Outer API authorization does not make SQL-only execution acquire it. |
| Same: `staff_onboarding_lock_identity(uuid,text)` | email advisory; discover User; sorted DISTINCT actor+target security advisories. No User row lock here. |
| Same: `staff_onboarding_authorize_actor(uuid,uuid)` | staff actor helper -> Organization S -> subscription S -> optional LM access+Location S. `staff_onboarding_authorize_target(uuid,uuid,uuid,membership_role)` takes pending target membership X then User S. |
| Same: `staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)` | identity helper; actor helper; requested Locations S ORDER BY id; R prior operation -> target helper on replay; otherwise existing User S, insert pending User/member/grants, `staff_onboarding_append_invitation` inserts invite+audit. |
| Same: `staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)` | R target email/actor; identity helper; actor helper; target helper; R prior op; invitations X ORDER BY generation; revoke old invitation and append new invite+audit. |
| `20261001005300_mgt_240d_staff_activation`: activation signature above | identity helper -> staff-org -> org S -> member X -> User X -> invite X. |
| `20260916003800_mgt_be_05_company_settings_branding`: `management_settings_lock_organization(uuid,boolean)` / `management_settings_authorize_actor(uuid,uuid,uuid)` | lock helper acquires management-settings-org shared when p_shared, otherwise exclusive. Actor authorizer calls it exclusive, then joined actor membership/Organization X, optional Location X. Thus settings graph includes settings advisory -> membership/org rows. |
| `20261007006900_shift_presence_strict_rollout_activation`: `shift_presence_set_policy` | settings advisory -> optional shared location-lifecycle advisory -> joined session/User X -> staff-org advisory -> member X -> joined Organization/subscription S -> Location S -> grant S -> factor S. This is a transitive compatibility dependency, even though presence policy is not a new auth feature. |

Nested trigger edge: migration
`20261030010600_issue363_session_bound_pending_mfa:mfa_pending_session_owner_guard`
checks an inserted pending factor's initiating same-User session FOR KEY SHARE.
It also rejects owner changes on UPDATE. Thus factor INSERT -> session KEY SHARE
exists even where the app already holds that session X; the replacement must
hold rank12 session before factor insertion, preserving the immutable owner.
Migration 112's runtime audit function delegates to the private account-security
append only after rejecting reserved reset event names and controlled actors.
Keep that rejection and append transaction boundary; do not treat audit UUIDs
as proof credentials.

Session cleanup search found direct deletes in
`apps/api/tools/local-dev/local-auth-state-reset.ts` and
`apps/api/tools/e2e/management-dashboard-e2e-persistence.ts`, plus test fixtures;
no production periodic session-delete writer was identified. These destructive
fixtures are not approved production cleanup. A future production cleanup must
start with owner03 and session12, then dependent registration/delivery14, preserve
pending factor historical owner semantics and audit/history retention, and never
delete key/challenge/receipt evidence needed by the reconciliation horizon.
External cleanup jobs require deployment inventory attestation.

Organization status/subscription authority has no general production CRUD writer
discovered by the scoped `UPDATE organizations`/`UPDATE organization_subscriptions`
source search: `apps/api/tools/e2e/control-management-dashboard-e2e.ts` contains
fixture controls, and tests/seeds contain privileged writes. Configuration
definers update Organization policy fields; they are not a new Organization
lifecycle API. Production operator SQL, inherited grants and external commercial
provisioning are EXTERNAL FACT NOT VERIFIED. They require an attested writer
allowlist; an invented app lifecycle endpoint is not closure. All privileged
operational scripts that change authority must use the proposed ordered commands
or an offline drained maintenance procedure. Fixture controls must never become
production escape hatches.

### Cycles and uncertainty found before choosing an order

VERIFIED SOURCE FACT: incompatible partial-order edges exist. In particular:

1. Native MFA's joined session/User locks and controlled disable's User ->
   session bulk UPDATE form a potential User/session inversion. The joined
   statement has no source-enforced row acquisition order; do not call a
   realized PostgreSQL deadlock proven from this alone.
2. Controlled recovery User -> mfa-user -> factor conflicts with MFA's
   session/User -> mfa-user only if another path holds mfa-user before User;
   none is established here. This prefix mismatch is a migration obligation,
   not evidence that this pair alone currently deadlocks.
3. Current onboarding acquires actor/target User-security before actor User;
   CA management locks actor User before staff-org; activation holds target
   User-security -> staff-org -> target User. An actor acting on itself can
   produce the union edge User -> staff-org -> User, across distinct entrypoints.
   Concrete realization depends on identity overlap and outer call chain.
4. Policy commands settings -> session/User -> staff-org versus existing
   management session/User -> org and settings helper settings -> org/member
   mean merely prepending one universal advisory to old functions is inadequate.
5. Push registration includes session -> logical keys -> registration while
   logout lacks its User-security fence. Bulk revocation and maintenance lack
   explicit registration order. One cannot infer their ordering from a join,
   executor plan, or index selection.

These are source-review findings, not exploit reproduction. No DB was opened,
and no third-party target was probed. The graph includes implicit write and FK
locks, uniqueness waits and audit reservations as implementation test concerns;
it is not a claim that every PostgreSQL lock mode is modeled by these tables.

## Proposed canonical replacement protocol

PROPOSED DESIGN: all new command transactions explicitly use READ COMMITTED.
Reject a write command invoked inside REPEATABLE READ/SERIALIZABLE or a caller's
already-locking transaction; callers must begin the command on a clean lease.
Existing REPEATABLE READ reporting stays read-only and gains no proof-command
side effect. Its session advisory/factor fences need regression tests, not a
silent isolation change. Never use session-level advisory locks on pooled writer
connections. Never acquire another pool connection while holding domain locks.

**Mandatory onboarding anti-abuse relocation (M04/M05):** current
`staff-onboarding.service.ts:create/resend` obtains email/User-security and
management locks **before** `reserveFreshOperation`, whose
`antiAbuse.reserve()` opens a separate pool transaction. The replacement must
make any durable quota reservation in a short, independent transaction **before**
acquiring the domain/operation lock prefix, after bounded read-only discovery;
commit it and bind its private reservation identity to the exact purpose,
issuer/Organization, target and operation. Acquire no second pool lease while
holding domain locks. Revalidate all previously discovered facts under the
command's ordered locks. Denial or a lost pre-reservation response cannot mint
authority or bypass quotas. On confirmed domain success, finalize the durable
reservation after releasing the domain lease: **COUNTED** only if create/resend
actually committed a **changed issuance**, while an exact same-operation
linkless replay with no change is **IGNORED**, preserving current policy.
On confirmed rollback, finalize the policy-appropriate ignored/failure outcome. On unknown
COMMIT, leave a bounded recoverable pending reservation and reconcile the
private operation receipt on a new lease before finalization; never assume
`IGNORED` from a transport exception or consume a new generation blindly.
Separate quota durability from business/audit atomicity; preserve the existing
accepted reservation counting/abuse policy. Negative tests must force
two-lease pool starvation/contention, failed finalization, rollback and lost
COMMIT while asserting no nested connection acquisition under domain locks.

The internal `prepare` phase is purpose-specific and can lock but cannot mutate
protected authority. Runtime can deny service through lock requests; it cannot
obtain proof issuance from prepare. Only genuine app credential verification
can authorize signing. Row ownership hints are discovery, never authorization.
Prepare and execute share one leased backend and full transaction identity.

Use this exact rank order, omitting classes unused by a command. Within each
class sort IDs as PostgreSQL UUID order; keys are deduplicated. Email/key strings
are normalized and compared with byte/C collation. Do not sort hashed advisory
integers; sort logical keys then hash. Hash collisions may serialize unrelated
operations, and must never confer authority.

| Rank | Proposed resource / mode |
| --- | --- |
| 01 | operation advisory `vap1-operation:<audience>:<purpose>:<operationUUID>` exclusive; a changed fingerprint cannot change this identity |
| 02 | all `staff-onboarding-email:<normalizedEmail>` exclusives, if creating/activating/changing password or reset; sorted emails |
| 03 | all `staff-user-security:<userUUID>` exclusives, including actor, target and all Admin candidates used for last-usable-Admin decisions, UUID sorted |
| 04 | all `mfa-user:<userUUID>` exclusives for factor/assurance or last-Admin checks; sorted users |
| 05 | all `management-settings-org:<orgUUID>` exclusives for authority-affecting Organization/configuration writers; sorted orgs |
| 06 | `location-lifecycle:<locationUUID>` shared for eligibility, exclusive for lifecycle mutation; sorted locations, mode chosen before any lock |
| 07 | `staff-management-org:<orgUUID>` exclusive for membership/grant/onboarding/activation/reset authority; sorted orgs |
| 08 | sorted `staff-push-install-lock:v1:<digest>` and `staff-push-token-lock:v1:<digest>` keys when registration uniqueness is involved |
| 09 | Users X, sorted UUID; insert fresh User only under email fence; no joined multi-table locking |
| 10 | Organization rows S (X if mutating) sorted UUID; subscription rows S (X if mutating) sorted organization UUID |
| 11 | memberships X sorted (organizationUUID, membershipUUID), including every actor/target/Admin candidate needed; Locations S/X sorted UUID then location grants S/X sorted (org,member,location) |
| 12 | sessions X sorted UUID, including all target sessions for global revoke; refresh rows X sorted (sessionUUID,generation,UUID) |
| 13 | factors X for mutation or S for assurance/last-Admin, sorted (userUUID,factorUUID); recovery codes X sorted (factorUUID,generation,slot,UUID) |
| 14 | invitations/reset rows X sorted (userUUID,generation,UUID); registrations X sorted UUID; deliveries X sorted UUID only if actually mutated |
| 15 | private selected proof-key record S; key selection is fixed in prepare and cannot change after this point |
| 16 | private transaction challenge X; then private receipt row X/INSERT under rank-01 operation fence |
| 17 | atomic domain/audit writes in previously locked order; append-only audit insertion and private receipt finalization. Any independently durable anti-abuse reservation was acquired before rank 01 and is finalized only after the domain lease is released and its outcome is known or reconciled |

Discovery may read immutable IDs before these locks, including candidate Admins.
After locks, re-read relationship and generations. If a new implicated earlier
rank ID appears, ROLLBACK, rediscover and restart with a fresh challenge. Never
append a smaller User lock or upgrade SHARE to UPDATE late. The staff-org fence
blocks membership phantoms after acquisition; a newly discovered member/user
requires restart. Identity-changing writers must use rank-02 email fences.

Key retirement takes only the key record X (plus its own separate operational
audit in the same transaction), never any domain lock or operation receipt held
by a proof command. Retirement-first makes execute reject after its S wait;
execute-first holds S through COMMIT, so retirement waits and then commits.
**Retirement commit** is the linearization barrier: no new successful execution
under that key can commit after it. Emergency tooling must not return success
before this commit; timeout means retirement unconfirmed, not effective.

**Separate activation/promotion barrier (PROPOSED):** staging a new key is not
activation. A trusted operator first verifies every authorized API replica has
the new signing material/key ID and that the private SQL verifier can select
it; no command may sign merely because it sees a locally staged key. Promotion
must lock the old and new key records in deterministic ID order using exclusive
row locks, serializing against every command's rank-15 key SHARE lock, then
commit exactly one `ACTIVE_SIGNING` ID/audience and an immutable promotion
epoch. A prepare selects only that committed ACTIVE key **under its SHARE lock**
and binds its key ID/epoch to the one-transaction challenge and app signer.
No new challenge may be minted for `VERIFY_ONLY` or `RETIRED`; an old-key
challenge must have originated before promotion and remain within its exact
backend/transaction and validated expiry. Since command SHARE is held through
COMMIT, promotion waits for already prepared old-key commands; a stale API
replica after promotion fails key-ID/epoch matching rather than signing under
the old key. Optional verification overlap cannot authorize fresh prepares.
Define and test concurrent promotion/prepare/sign/execute, a replica that misses
activation, rollback/unknown promotion COMMIT, clock skew, key lock waits and
multi-key order. The protocol and deployment synchronization remain unproven.

Prepare issues a cryptographically random challenge only after ranks 01–15.
Bind it to backend PID AND full transaction ID, purpose, operation, fingerprint,
audience, issuer/actor/target and every expected generation. A PID alone is
reusable. The issuer verifies actual password/raw refresh/TOTP/recovery/invite
ceremony, never just the locked facts; compare protected password/factor/lineage
versions with those actually verified. An app host signer uses local bounded
computation only while locks are held, no remote service call. Execution locks
the challenge and receipt at rank 16, checks MAC/schema/bindings, and samples
`clock_timestamp()` **again after every blocking acquisition and immediately
before protected writes**. Revalidate access/session/MFA/proof/invite/reset/key
expiry with that time. A timestamp captured before a wait is insufficient.

Proposed 30s is an upper proof validity limit, not a transaction budget or SLA.
Current `runtime-database.module.ts` checks 3s statement and 2s lock timeout;
`postgres-lease.ts` can shorten budgets and the transaction helper separately
handles guest PG17 transaction_timeout. Preserve all shorter effective budgets.
Do not extend them to accommodate proof issuance. Before release measure prepare,
sign and execute against actual bounded-pool contention; unavailable budget
fails transiently and rolls back. Never issue a challenge while queued for a
pool lease or serialize secrets into timeout errors.

Challenge insert/consumption, domain write, receipt and audit commit atomically.
Rollback/cancellation/backend loss before commit removes their uncommitted
changes; a new transaction needs a fresh challenge. COMMIT preserves consumed
challenge and immutable result receipt; receipt contains no raw secrets.
A lost connection during COMMIT yields unknown outcome until reconciliation.

### Command-by-command migration map

Every row is PROPOSED DESIGN; rank numbers refer to the exact table above.
All use rank 01, 15,16 and atomic 17. First protected mutation is only after
ceremony verification AND current scoped authorization under all locks.
Nested old functions must be replaced/split, not called underneath this prefix
if they reacquire a lower-ranked lock. Retire all old runtime EXECUTE overloads
and direct column grants listed by the writer/privilege manifest together.

| Purpose | Domain lock ranks / current replacement obligation | Linearization and conflict |
| --- | --- | --- |
| login | 03 actor;09 actor;12 new session/refresh; replace joined/direct inserts and last-login writer | exact verified password version and active User check; commit establishes new session; changed password version fails authentication |
| refresh rotate/replay | 03 owner;09;12 session then refresh; remove joined refresh/session/User locking | locked consumed_at determines rotation vs accepted replay-revoke branch; commit makes rotation/revocation visible; never receipt-replay raw replacement |
| logout / exact revoke | 03 owner;09;12 session+refresh;14 registrations | monotone revocation/disable commit; invalid bearer remains non-disclosing; no arbitrary session-ID authority |
| global revoke / security disable | 03 target;09;12 every session/refresh;14 registrations | committed User disable and revocation fence login/refresh/push; no clearing revoked_at |
| MFA begin/resume | 03,04 actor;09;12 exact session;13 factor | pending insertion commit or authorized same-session seed reread; foreign session denied |
| MFA confirm / step-up | 03,04;09;12 exact session;13 factor/codes | monotonic accepted step and assurance atomic at commit; stale step/factor fails |
| MFA self recovery / reissue | 03,04;09;12 exact session;13 factor/code generations | consume or advance generation with audit; one secret response only; self recovery does not grant assured status |
| controlled MFA recovery | 03,04 target;09;12 affected sessions if clearing assurance;13 factor | retirement commit invalidates assurance; trusted operator ceremony remains separate, no runtime reset bypass |
| admin activity | 03 actor;09;12 exact session;13 current factor S | guarded activity write commit; cannot increase mfa_authenticated_at or resurrect retired factor |
| CA management authorization | 03 actor/target/candidate Users;04 needed factor Users;09;10;11;12 exact actor session;13 active factor | current role/org/entitlement and exact MFA authorize before domain effect; locked target scope derived from persistence |
| LM management authorization | same necessary ranks;11 all active grants;12/13 only when accepted sensitive operation needs MFA | complete persisted active Location coverage; ordinary LM reads do not gain a new MFA requirement |
| role/status/grant mutation | CA/LM ranks above;07 org;11 actor+target+Admin candidates in sorted order;13 Admin factors S | expected-version/no-op/last-Admin/hand-over predicates preserved; mutation+audit commit; no late admin-factor helper |
| Organization lifecycle / entitlement operator | 03 affected actor where relevant;05,06,07 for affected scope;09,10 X;11 needed membership/grants | trusted operator authorization, not a new public API; commit blocks later authority recheck; external production writer inventory release gate |
| onboarding create/resend | durable purpose-bound anti-abuse reserve before domain locks on an independent completed lease; then 02 email;03 actor/target;04 actor;07 org;09,10,11,12 actor,13 actor factor,14 invitations | protected invitation generation+audit commit; no repeat activation link; remove nested email/security locks from new helper; finalize quota only after committed/rolled-back/unknown receipt is authoritatively reconciled |
| activation | 02 email;03 invite owner;07 org;09 owner;10 org/subscription as required;11 member;14 invite | genuine invite plus actual password ceremony for already-active User; commit activation; repeat reauth then durable completion, no new session implicit |
| push reconcile/confirm/disable | 03 owner(s) discovered;08 logical keys;09 owner(s);12 current session;14 registrations | source current-owner ordering preserved; commit cannot bind revoked session; new implicated owner means restart; worker terminal invalidation only never acquires earlier ranks |
| controlled provisioning | 02 email;03 operator/target if applicable;07 org;09,10,11 plus fresh rows | actual controlled operator trust, creates approved roles only; no uncoordinated direct provisioning under live traffic |
| reset issue/status | 02 target email;03 actor+target+all sole-Company authority candidates;04 actor;07 applicable orgs;09,10,11,12 actor,13 actor factor,14 reset generations | Issue416 current CA/sole-company/eligibility and sensitive MFA; issue+audit+receipt commit; status read cannot create/reset secret |
| reset redeem/password replace | 02 target email;03 target;07 orgs whose memberships constrain target;09,10,11,12 ALL target sessions/refresh,14 reset+registrations | actual bearer possession and latest unused generation plus current eligibility; atomic password/consume/revoke/push/audit commit; consumed retry generic invalid |

Operations spanning multiple organizations use all org keys and rows sorted;
do not infer target exclusivity from the issuer's selected Company. This is
necessary for the sole-company reset predicate and controlled identity changes.
Last-Admin factor candidates and target membership blockers must be discovered
before locking; protected operational blocker writes require their existing
domain protocol too. This document does not authorize locking arbitrary custody
aggregates in auth code. If blocker proof requires an incompatible writer,
fail closed and extend the reviewed graph before implementation.

### Final per-command acquisition reconciliation (A01–A11)

**Reading these matrices:** `current` is the source-observed acquisition order
at the pinned baseline, **not** a safe order. `future` is the required proposed
order; each such mutator additionally takes rank 01, key 15, challenge/receipt
16, and atomic write/audit 17 unless explicitly identified as read-only or
separate controlled maintenance. Rank ranges are expanded rather than invoked
as a single combined SQL join; every row in a sorted class is locked
individually in deterministic order. Default current isolation for the API
mutators is `BEGIN` with **unverified session default**; future writers must
explicitly establish and verify READ COMMITTED before any authority read or
lock. In both old and proposed designs, COMMIT (not a function return, an HTTP
reply, a prepared token, or an UPDATE alone) is the authoritative mutation
linearization point. Safe pre-discovery is not authorization. Every future
writer repeats actor, credential/proof version, current User/SS/F, scope and
expiry checks **after the last contended lock and immediately before writes**;
if discovery missed an earlier rank, roll back and rediscover on a new lease.

| U2 ID | Current source acquisition (caller -> nested/trigger) | Future lock prefix and post-wait guard | COMMIT/replay/unknown-result obligation |
| --- | --- | --- | --- |
| **A01 login** | Argon2 before transaction; user-security A -> U X -> SS/RC INSERT -> U last-login; login-identifier quota UPDATE under local 2s lock timeout. | 03 verified User; 09 U X; 12 SS/RC create, plus quota state by its separately accepted admission contract. Recheck exact verified PHC, ACTIVE User and DB clock after wait. | SS/RC and last-login commit together; unknown COMMIT leaves no recoverable raw access/refresh token. Reconcile safe receipt/current SS with fresh proof; do not replay POST or return secret from receipt. |
| **A02 refresh/replay** | R owner -> user-security A -> joined RC/SS/U X (join lock order unproven) -> RC/SS writes. | 03 owner, 09 U, 12 SS then RC ordered; re-evaluate raw `vsr1` verifier, consumed/expiry, User ACTIVE, session revoked/absolute expiry after wait. | Valid rotation commits one successor. Consumed-token reuse **commits family revocation then reports authentication failure**; never return cached successful rotation. Lost rotated response + old-token retry still triggers accepted family revoke. |
| **A03 logout** | Joined RC/SS X before any User-security A; `revokeStaffSessionAndDisablePush` updates SS then unordered active P. | R token-to-owner discovery; 03 owner, 09 U, 12 SS/RC, 14 sorted P. Recheck exact refresh lineage and session owner; no client session-ID authority. | Monotone revoke/terminal push commit; repeats retain nondisclosing logout. Unknown cannot assert server revoke; reconcile on fresh lease; local client purge remains distinct. |
| **A04 MFA pending begin/resume** | Joined SS/U X -> mfa-user A -> F X/INSERT; trigger pending-F INSERT -> owner SS KEY SHARE. | 03/04 owner, 09 U, 12 exact live SS X, 13 F X/create; ensure pending-F owner SS locked **before** trigger; recheck eligibility and clock. | Pending enrollment commits once; only exact initiating still-live SS may retrieve its seed under the accepted exception. A different session/failed proof cannot retrieve; no general secret receipt. |
| **A05 MFA confirm** | Same joined SS/U -> mfa-user -> F X; accepted TOTP -> F ACTIVE, C INSERT by slot, SS assurance, account audit. | 03/04,09,12,13 sorted F/C; compare current pending owner/seed, TOTP step and all expiries after wait. | Confirmation, recovery slots and assurance atomic at COMMIT; consumed step/duplicate fails or gives only accepted safe state, never raw recovery codes. |
| **A06 TOTP step-up** | Joined SS/U -> mfa-user -> F X; F.last_accepted_step -> SS assurance -> limiter. | 03/04,09,12,13; require current ACTIVE F and strictly newer accepted step; resample clock after any lock wait. | Step and exact-session assurance commit together; duplicate/stale step fails; unknown requires guarded fresh-lease state/receipt reread and cannot fake new MFA freshness. |
| **A07 self recovery** | Joined SS/U -> mfa-user -> F X -> selected C X; consume C, retire F, insert session-owned pending F (SS trigger KEY SHARE), audit. | 03/04,09,12,13 sorted F/C, with pending owner SS already at rank12; verify HMAC recovery code and current generation again after wait. | Single code consumption + factor retirement + pending factor commit together. Never resurrect F or reused C; exact-session pending seed exception only. |
| **A08 recovery-code reissue** | Joined SS/U -> mfa-user -> F X; accepted newer TOTP, next-generation C INSERT, F generation/step, SS assurance, audit. | 03/04,09,12,13; recheck active F, generation and step; sort new code slots and keep old-generation codes invalid. | New generation and audit commit atomically; raw codes disclose once only. Unknown receipt cannot redisclose list or silently mint a further generation. |
| **A09 admin activity** | MFA guard joins SS/U X and reads F; guarded SS.last_admin_activity_at UPDATE; no independent F row lock. | 03/04 as required, 09 U, 11 actor scope if management-piggyback, 12 exact SS, 13 current F S. Do not let piggyback activity use a lower-ranked old management helper. | Only activity time may advance at committed authorized request; **never** mfa_authenticated_at. No-op duplicate safe, denial not proof. |
| **A10 staff session context** | R opaque access hash/SS/U, with optional user-security A -> SS X for caller mutation; RR factor read fence may take F S. | **Read-only:** authenticated bearer lookup remains source of hint, not a signing command. Writers rebind 03/09/12/13 as applicable on their own READ COMMITTED transaction. | No mutation/receipt or credential proof from cached `StaffSessionContext`; REPEATABLE READ snapshots cannot authorize a later write. |
| **A11 MFA state/assurance read** | R U/SS/F; A09 activity is a distinct mutation path. | **Read-only:** current source state may be projected; writer checks exact live SS, active F and timestamps under its own locks. | No proof issuance, assurance extension, or future-write guarantee from an `ASSURED` read. |

Every A01–A09 signer is purpose-specific. A04/A07 pending-seed disclosure and
A05/A08 recovery-code disclosure require their original exact identity and
session rules; the receipt is **never** a recovery channel for their raw secrets.
Current client login/refresh/step-up anti-abuse reservation flows must be
mapped into separate pre-lock admission or already-held same-lease writes
without introducing a second pooled connection while domain locks are held.

### Management, push and controlled-operator reconciliation (M01–M15)

The current API **caller** and SECURITY DEFINER **callee** must both be inspected
as one transaction graph; no source-visible API guard grants authority to an
independently callable SQL overload. `staff_management_set_*` begins inside SQL
with staff-org A even if the API previously took SS/U X; `staff_onboarding_*`
re-enters email/target locks; settings/location/presence definers acquire
settings/lifecycle locks in distinct orders. These inner helpers cannot simply
be called under a new rank prefix. Each row's *future* locks include the
purpose/operation proof/receipt phases only for authenticated app commands,
and an independently attested operator origin for controlled tools; worker
maintenance has **no** delegated user-signer privilege.

| U2 ID | Observed caller -> SQL/worker lock order (plain-BEGIN default unless noted) | Future ranks; after-wait recheck and commit fence | Replay, failure and correction boundary |
| --- | --- | --- | --- |
| **M01 role** | API assurance joined SS/U X -> staff-org A/actor M X -> target M; nested `staff_management_set_role` reacquires staff-org/actor M, optionally admin F S. Direct SQL starts at staff-org without SS. | 03 actor/target/other Admin candidates,04 relevant F users,07 org,09 U,10 O/E,11 sorted M/G/L,12 exact actor SS,13 usable Admin F S. Recheck MFA/current role/last Admin and expected M version after waits. | Changed role+audit commit; accepted no-op does not invent a new role event; stale version conflicts, same op changed payload conflicts. Retire direct old EXECUTE and nested lower-rank helper. |
| **M02 status** | Same API and `staff_management_set_status` nested staff-org -> actor/target M X -> admin F S and operational blocker reads. | M01 ranks; complete handover/blocker predicates locked under their own compatible domain protocol, not fabricated task mutations. Recheck target lifecycle, last Admin and current scope. | Status+audit commit or no-op. Normal disable cannot bypass live-work blockers; unknown commit must inspect M version/audit on fresh lease. |
| **M03 grants** | API SS/U -> staff-org -> M; `staff_management_set_location_access` reacquires org and locks LM Location/grants, then G INSERT/DELETE + M version. | 03/04 actor+target,06 sorted affected Location lifecycle S,07 org,09/10/11 complete grant/location set,12/13 actor proof. Recheck **all** active target and LM grants after wait, not first page. | Grant delta/M version/audit commit. Retry same desired state safe; changed version or grant coverage conflict, no phantom-location authority. |
| **M04 create** | API email A -> sorted user-security A -> sensitive joined SS/U X -> staff-org A -> **nested separate pool** `antiAbuse.reserve()` -> SQL create repeats identity email/user A, staff-org, O/E S, M/U S, sorted L S -> U/M/G/I insert. | Reserve quota on **completed separate lease before rank01/domain locks**; then 02 email,03 actor+existing target,04 actor,06 affected Locations S,07 org,09/10/11,12 actor SS,13 actor F,14 I. Reauthorize email/target global identity and current issuer after waits; replace old SQL helper. | Changed invitation+audit COMMIT => COUNTED after domain lease release. Same-operation unchanged/linkless replay => IGNORED. Quota finalization failure leaves durable recovery, not second invitation. |
| **M05 resend** | Same API nested quota and SQL identity reentry; SQL locks target M/U and existing I by generation before revoke/insert. | Same pre-reserve and 02/03/04/07/09–14 with **all historical invitation generations**; require current PENDING member/issuer and expected operation fingerprint. | A new changed I generation+audit commits once => COUNTED. Exact unchanged replay is linkless/IGNORED; lost response never yields raw invite or automatic generation advance. |
| **M06 activate** | Public `vsi1` and password in app; SQL R invitation -> identity email+user A -> staff-org A -> O S/M X/U X/I X, no API Staff session. | R token/owner discovery, then 02 target email,03 User,07 org,09 U,10 O/E,11 M,14 I; recheck invite generation/expiry and **existing ACTIVE User password hash verified outside then matched under lock**. | Consumption/activation+audit COMMIT, no new SS. PENDING sets first password; ACTIVE requires existing password. A consumed replay stays safe only per accepted contract, never issues link. |
| **M07 management guard** | CA: R role -> assurance joined SS/U X -> staff-org A -> M X + optional L X + E R. LM sensitive: assurance -> staff-org A -> M X -> sorted active L S; SQL-only staff actor helper starts staff-org. | **No standalone writer:** every management mutator uses 03/04,06 if location,07 org,09/10/11,12 session,13 F as needed; all current scope/entitlement verified after waits. | A read/guard return grants **no** future or SQL-only authority. A09 activity piggyback shares the same mutation ordering and COMMIT. |
| **M08 Location lifecycle** | API management guard precedes `management_location_*`; SQL location-lifecycle A -> joined O/M X, create identity/operation A, currency may take settings-org A **later**. | 03 actor,04 F,05 settings org when required,06 affected L X,07 org,09 U,10 O/E,11 M/L,12 SS,13 F. New SQL must not obtain late rank05 under lifecycle/actor rows. | L status/intake/currency/timezone+audit commit, CAS `expectedUpdatedAt`; operations blocker/revision and all grants rechecked after wait. |
| **M09 settings/branding** | API management authorization may hold SS/U -> staff-org; SQL `management_settings_lock_organization` takes settings-org A then joined M/O X, optional L X. 12 callable runtime signatures. | 03/04 actor,05 settings-org,06 affected L S/X if scope,07 org,09/10/11 ordered actor/O/L,12/13 proof. Never call existing settings definer underneath ranks 07/09/12. | O/L configuration or brand+audit commit, expected timestamp CAS; no org.status or entitlement write inferred. Changed/no-op semantics preserved; stale timestamp conflicts. |
| **M10 presence policy** | API `protectPresenceManagementAuthority`: settings-org S/X -> lifecycle S -> user-security A/SS X -> joined SS/U X -> try staff-org A -> M X -> O/E/L/G/F S; SQL `shift_presence_set_policy` separately starts settings/lifecycle then joined SS/U and staff-org again. | 03/04 actor,05 settings-org X,06 lifecycle S sorted,07 org,09 U,10 O/E,11 M/L/G,12 SS,13 F; replace all nested prefix inversions and keep bounded try-lock/busy semantics. | Policy/revision/audit commit; rerun complete Location fanout readiness and 5min sensitive MFA after waits; stale revision/configuration conflicts without silent retry. |
| **M11 push register** | API user-security A -> SS X -> sorted installation/token A -> P X sorted; insert/confirm/supersede with owner/session uniqueness, no SQL actor signer. | 03 **all implicated owner Users** discovered from P,08 sorted logical keys,09 owner U,12 live SS,14 sorted P; new owner/row discovered late => rollback/restart. | Owner/token binding or terminal supersession commits once; unique `23505` uses existing safe push conflict. Late revoked SS cannot produce ACTIVE P; unknown does not claim confirmed endpoint. |
| **M12 push disable** | API user-security A -> exact SS X -> owned registration P X -> monotone terminal UPDATE. | 03 owner,09 U,12 exact SS,14 P; recheck genuine `vsa1`, registered SS owner/state and terminal timestamp after wait. | Exact P terminalization commits; already DISABLED is safe monotone result; no raw provider token resurfacing. |
| **M13 push worker/maintenance** | Claim PD `SKIP LOCKED` + lease; stale P `SKIP LOCKED`, FCM outside DB lease, exact fenced finalization and short cleanup. | **Separate bounded worker role**, not A/M signer: 14 sorted currently eligible PD/P with SKIP LOCKED, no session/issuer proof; current eligibility rechecked before send/finalize. Must not acquire domain rank03 after PD/P X or alter authority. | Lease claim/finalization each commit independently; provider acceptance may be UNKNOWN and generic duplicate attention possible. On lost lease reject stale finalize; no rewriting Tasks, deleting active P or claiming exactly-once send. |
| **M14 controlled disable** | Privileged CLI own BEGIN: operation A -> audit replay R -> user-security A -> U X -> unordered SS/P UPDATE -> controlled audit. | **Attested operator boundary** with 01 operation,03 target,09 U,12 sorted SS/RC,14 sorted P; no new public signer. Validate approved operator source, global User and exact op under all locks. | User DISABLED/session/P revocation+audit commit; same operation/payload safe replay. Unknown CLI COMMIT => new-connection audit+state reconcile, not re-enable/reissue. |
| **M15 controlled MFA recovery** | Privileged CLI own BEGIN: operation A -> audit replay R -> U X -> **later** mfa-user A -> F X, no SS row. | Trusted operator 01,03/04 target,09 U,12 affected SS only if necessary to clear assurance,13 F/C; move mfa-user before U and sort affected sessions. | Retired factor+controlled audit commit; current F/generation checked; repeated exact op safe; accepted assurance invalidation prevents a retired F authorizing later management. |

**Proven inversion examples:** current M01–03/M04–05 API locks session before
staff-org while the SQL function may start with staff-org independently; M08
late settings-org under lifecycle and M09 late settings-org after API management
locks both contradict proposed ranks. M10 contains a real *source-order*
settings/lifecycle -> session -> staff-org prefix (plus nested repeat). These
are incompatible acquisition graphs and possible deadlock ingredients, **not**
an observed PostgreSQL deadlock. Every replacement must either inline only
non-locking private validation after rank acquisition, or split SQL to accept a
transaction-private proof and recheck without taking a prior rank. A second
`pool.connect()`/independent `inPostgresTransaction()` inside any held-domain
transaction is prohibited, not solved by increasing pool size.

### Privileged, future reset and SQL-definer closure (P01–P05, R01–R03)

| U2 ID | Source/initial boundary | Future rank compatibility, revalidation and durable result |
| --- | --- | --- |
| **P01 controlled provisioning** | Privileged CLI `BEGIN`: O S -> unsorted L S -> R email -> U/M/G INSERT + tenant audit. No email/owner/org advisory. | Controlled operator admission (not merely supplied `operatorRef`); 02 normalized email,03 any existing User,06 sorted active Location lifecycle S,07 org,09 U,10 O,11 M/L/G; verify O ACTIVE, locations, global email uniqueness, allowed role and audit origin after wait. Successful initial account+audit COMMIT; 23505 email collision is conflict, not provisional proof. Unknown CLI COMMIT requires a **new** credentialed lease and durable operator operation fingerprint/receipt plus U/M/audit readback; current create-only CLI lacks a proven same-op receipt, so otherwise HOLD, never blindly retry with new User IDs. |
| **P02 Org/E external writers** | No general production `organizations.status`/`organization_subscriptions.dashboard_access_enabled` writer established by repository source; fixture E/O UPDATE is NOT a deployed operator API. | **EXTERNAL UNVERIFIED:** enumerate every billing/DBA/operator principal, job, SQL path, owner, privilege and time of access. Writer must use 03 affected Users as applicable,05 settings org,06 affected lifecycle keys,07 staff org,09/10 O/E X,11 affected members/grants; exact authority/entitlement must be rechecked for every later R02/R03. Commit makes new eligibility effective; unknown operator result requires independently attested readback, not stale Dashboard projection. If external writer cannot join ranks, gate it offline during protected traffic. |
| **P03 local-dev direct writes** | Dev password UPDATE and destructive auth-state cleanup bypass proof/monotone history. | No production command: fixture/dev role and executable absent from production allowlist, denied production principals. A future actual session cleanup needs 03 owner -> 12 ordered SS/RC -> 14 dependent P/PD while retaining audit/pending-owner/key/receipt history; do not run these scripts as compensation. |
| **P04 E2E/capacity fixtures** | Fixture SQL mutates M/G/E/O/U/SS directly without app session ceremony. | No production command: test-only principal/config isolation and negative startup/ACL proof. Fixture seeding may prepare a synthetic PG17 test but does **not** certify the subsequent signer; a real credential/TOTP operation must follow. |
| **P05 push cleanup** | `cleanup_staff_push_v1()` callable by runtime; terminal PD/intents/P `SKIP LOCKED` deletion, 7d/30d policy. | Accepted narrowly bounded maintenance exception, not reset/auth signer. On separate worker/maintenance boundary use ordered rank14 P/PD only where terminal/retention/FK criteria are actually met. Exclude active P, in-flight delivery and receipts needed by unknown-COMMIT reconciliation. Maintenance commit cannot reverse accepted session revocation or audit. |
| **R01 reset status** | Not implemented. Current management reads use current session/role/entitlement without this new SQL boundary. | Read-only current authenticated CA, issuer SS/F scope, O/E, sole-org target membership across **all** statuses, ACTIVE U/M. Any rank03/07/10/11/12/13 locks elected for a stable status read must follow the proposed order; READ COMMITTED is a point-in-time result, not a future permission. No token, hash, operation ID or secret receipt in response; conceal stale/foreign actor. |
| **R02 reset issue** | Not implemented. Issue #416 mandates `vspr1` single use, 15m DB-clock TTL, historical CAS generation, 3 target/20 issuer/100 org/30 client committed issuance caps. | Durable client/issuer/target/org admission is pre-domain and purpose bound; 02 target email -> 03 issuer+target+all all-status membership-related User candidates -> 04 issuer MFA -> 07 org -> 09 U -> 10 O/E -> 11 M/G complete scope -> 12 issuer SS -> 13 issuer F S -> 14 reset generations. Recheck exact 5m MFA, current CA, sole-company target, current entitlement and expected generation after wait. Changed new generation+audit+receipt COMMIT => counted after known/reconciled outcome. Same authorized op/fingerprint => **LINK_UNAVAILABLE** without original bearer/budget; changed fingerprint/stale CAS => conflict. UNKNOWN new-lease readback must not create another link. |
| **R03 reset redeem** | Not implemented. Anonymous raw bearer, no issuer online SS/MFA renewal; must recheck current issuer U/CA/M/O/E and target sole-company authority. | Pre-parser durable address reservation (30/15m) and valid-shape credential-key reservation (5/15m) **COUNT even on business rollback**; separate completed leases prior to domain locks. Discover token/owner without row X, then 02 target email,03 target+issuer+all implicated Users sorted,07 each org,09 U,10 O/E,11 all-status M,12 every target SS/RC,14 winning reset/sibling rows + all target P. Revalidate token hash/generation/15m expiry, current issuer role/entitlement and target status after wait. COMMIT atomically changes password, consumes winner, revokes siblings/SS/RC/P and records account audit+receipt; no MFA-factor deletion, new login or custody mutation. Expired/consumed/replay fail generically; UNKNOWN fresh-lease readback never reapplies password or discloses token. |

**SQL nested-call obligations (current, not a grant audit):** (1)
`staff_management_authorize_staff_actor` calls the CA actor helper, which can
reacquire staff-org/M; `staff_management_lock_admin_factors` holds last-usable
Admin F S; the three `staff_management_set_*` signatures therefore need
proof-required M01–03 replacements, not an API-only wrapper. (2)
`staff_onboarding_create/resend` invoke `staff_onboarding_lock_identity`
(email A and sorted user-security A), staff actor/O/E/Location helpers, and
invitation insert/revoke; M04/05 must replace the lower-rank reentry and
separate anti-abuse pool call. (3) `staff_onboarding_activate(text,text,text)`
shares identity/staff-org helpers and accepts a caller-supplied ACTIVE account
hash comparison; M06 needs genuine invite/password ceremony rather than just
caller-readable hash. (4) All **seven** `management_location_*` signatures
and **twelve** settings/branding signatures, plus
`shift_presence_set_policy`, need rank-compatible definer implementations
with verified current app actor/SS/factor rather than trusted actor IDs.
(5) `cleanup_staff_push_v1()` is purpose-bounded P05, and the migration-112
generic runtime security audit append must continue denying reserved reset
event types and controlled-operator actor provenance. The pending-MFA owner
trigger's SS `FOR KEY SHARE` follows rank12 for every F insertion.

Audit actual `pg_proc` signatures (including historic overloads), definer
owner, fixed `search_path`, `PUBLIC`/runtime/inherited effective EXECUTE and
old-version provisioner behavior. `provision-runtime-role.mjs` currently
reapplies MFA/table privilege writers; revoking a function once in a migration
does not secure it against a privileged stale runner. The old provisioner must
be denied **only in isolated C3/C4 rehearsal before C6 reopen**, with
post-reopen safe ACL drift monitoring, per the cutover contract. No static
source inspection can establish complete deployed function coverage.

**Newly relevant writer-drift check at the pinned baseline:** `git diff
eb2d0ba4..HEAD` was empty before this file edit; the targeted TS source
search for direct protected-table UPDATE found the inventoried auth/MFA/push
and controlled-tool writers plus dev/E2E fixture paths, but no new ordinary
production Org/E authority writer. This does **not** cover external operator
SQL, deployed jobs, unreviewed dynamic SQL or actual database grant drift; an
attested deployment inventory remains mandatory.

## Six retry outcomes and secret exceptions

### Outcome/timeout/compensation matrix — per typed command family

The command's *observed transaction phase* is part of error classification:
`40P01`, `40001`, `55P03` and `57014` **before** COMMIT require a
confirmed rollback/closed lease before bounded re-attempt with a new genuine
ceremony; they do **not** grant an automatic HTTP POST replay. A driver error
after COMMIT was sent, including `57014`, `57P01`, a connection-class
`08xxx` or a transport reset, is **UNKNOWN** irrespective of its code. A
rollback attempt after this cannot prove non-commit. The actual helper records
`UNAVAILABLE` in its outcome tracker and rethrows the **original** exception;
it does not return a typed `UNAVAILABLE` value to callers.

For each UNKNOWN, release/destroy the unusable lease, establish a *new* trusted
lease and current proof/authorization (controlled operator for P commands;
bearer/password/TOTP where accepted), verify same immutable
purpose+operation+fingerprint+actor+target, lock the canonical operation/domain
fences, reread the private committed receipt **and** protected state/audit.
For anonymous R03, the server may reconcile its **original** token/verifier
fingerprint against a private receipt under the strictly confined internal
redeem authority; a consumed public bearer cannot become a fresh authenticated
session, cannot renew issuer MFA, and must not grant a second redemption.
Receipt absence cannot be declared until prior commit is known resolved and
the matching fence can be acquired. An unresolved wait returns bounded
transient/unavailable, not `not found`. Compensation never undoes a committed
security revocation, reuse of a recovery code, or User password change, and
never prints a previous secret.

| Commands | Confirmed success / COMMIT linearization | Conflict, timeout or rollback (R/D) | Same-op replay, UNKNOWN recovery and compensation |
| --- | --- | --- | --- |
| **A01 login** | SS+initial RC+last-login+identifier reservation result. | Invalid password/User => uniform failure; lock/deadlock => rollback and bounded fresh-ceremony attempt only. | Receipt safely identifies committed issuance, not raw tokens; lost reply requires new login under policy, never secret reconstruction. Reset/disable racing after credential verification invalidates stale PHC. |
| **A02 refresh** | Single RC consume+successor+SS access-rotation, **or** consumed RC => SS family revoke committed despite auth failure. | Revoked/expired/invalid => auth loss; precommit deadlock/timeout rolls back, no successor; no grace. | Consumed-token presentation is **not** idempotent success replay. UNKNOWN success => reconcile; old refresh replay may itself revoke family and require fresh login. Never regenerate old successor response. |
| **A03 logout, M12 disable, M14 security disable** | Monotone SS/P/User terminal effects plus required audit commit. | Unmatched credentials/foreign registration fail non-disclosing; lock failure rolls back all local effects. | Exact already-terminal state can be reported only under its accepted safe contract; UNKNOWN reconcile terminal rows and audit on new lease. No compensating reactivation. |
| **A04–A08 enrollment/TOTP/recovery** | F/C/SS step, generation and account audit advance as one; pending F's exact SS ownership remains intact. | Wrong/used TOTP or code and stale generation fail; deadline crossing after wait fails; rollback must not consume factor/code. | A04 pending seed exception is **same originating live session only**; A05/A08 raw codes never redisclosed; A06 step never silently extended; A07 consumed C irreversible. UNKNOWN reconcile F/C/SS/audit and require accepted fresh ceremony for a lost secret. |
| **A09 / M07 guard, A10–A11 reads** | A09 activity UPDATE commits only with authorized management mutation; read-only guards have **no** mutation linearization. | Current role, F/session, freshness or tenant failure denies; stale prior read is not authority. | No cached assurance as a replacement for current locked credential; UNKNOWN A09 checks exact activity/domain receipt, no proof from read. |
| **M01–M03 role/status/grants** | Exact desired-state M/G version and required tenant audit together. | Expected-version mismatch, loss of LM full coverage, live-work/last-Admin blocker or stale org => conflict/deny; no partial grant write. | Identical authorized no-op safe without extra audit, changed payload conflicts; UNKNOWN fresh-lease current role/grants/version+audit/receipt, never reapply an unconfirmed admin change. |
| **M04–M05 onboarding** | Changed I generation + U/M/G if create + tenant audit; quota finalizes **COUNTED** only for changed issuance. | New quota denial blocks fresh issuance; precommit rollback/denied/no-op quota outcome **IGNORED** under accepted policy; failed finalization must remain recoverable. | Exact authorized unchanged operation replay is **linkless** and IGNORED; U requires private receipt reconciliation before quota finalization. No compensating second invitation or secret re-disclosure. |
| **M06 activation** | I consumed, U/M activated or verified current ACTIVE, audit committed. | Password mismatch/invite stale/generation conflict after wait => safe failure, no password or member partial mutation. | Only accepted already-activated safe outcome on replay; unknown new-lease I/U/M/audit proof, never automatic activation with a different candidate password. |
| **M08–M10 Location/settings/presence** | Typed Location or policy/branding change + version/revision + tenant audit. | CAS, current Location, entitlement, actor, presence readiness or handover conflict => deny; lock busy/timeout rolls back and preserves old version. | Identical replay only per existing operation key/no-op rules, not generic idempotency. UNKNOWN reread authoritative O/L/revision/audit/receipt; no blind config overwrite or custody mutation. |
| **M11 register / M13 worker** | P owner/registration state commit; worker's claim and finalize are **separate** fenced commits, provider I/O outside DB. | Uniqueness conflict `23505` maps to existing safe push conflict; expired/stale lease cannot finalize; `SKIP LOCKED` skip is not proof of deletion. | Reconcile exact token/install/SS owner on fresh lease; never leak provider token. Remote provider UNKNOWN permits bounded generic duplicate attention only per DEC-075/076, never exactly-once claim or authority write. |
| **M15 recovery / P01 provision / P02 external O/E** | Controlled operator-approved F retirement, new User/M/G, or O/E state and immutable audit each commits at their own explicit boundary. | Invalid operator provenance, conflicting email, stale authority or lock timeout => fail closed; externally uncoordinated O/E writer remains a release blocker. | Same operator operation+payload may safe-replay only with audit/receipt; UNKNOWN reread new lease with trusted operator identity, never fallback to a weaker app or SQL signer. |
| **P03–P05 maintenance/fixtures** | No protected command for P03/P04 in production; P05 terminal cleanup transaction is independent. | Fixture invocation in production is privilege denial; P05 SKIP LOCKED/retention constraint skips safely. | P05 unknown requires new-lease terminal/FK proof, never DELETE ACTIVE P or receipt/audit; no dev fixture as compensation. |
| **R01 status** | Authenticated read as of validated query/lock scope; no reset write. | Tenant, role, MFA, entitlement, all-status target membership denied/concealed as specified. | No link disclosed, no assumed serializable guarantee across requests; a later R02 must reauthorize. |
| **R02 reset issue** | New generation, old generation revoke, reset audit+receipt commit, then quota **COUNTED** for actual new link. | Stale expected generation, current CA/MFA/target/entitlement or quota deny; rollback cannot create token. | Same current authorized operation returns **LINK_UNAVAILABLE** with no link or new budget; U reconcile immutable receipt/latest generation before returning safe status or finalizing quota. No second link or automatic new operation. |
| **R03 reset redeem** | Password replacement+winning token consume+other reset revokes+all target SS/RC/P terminal+security audit atomically. | Generic invalid/expired/role-denied; failed protected business transaction does **not** undo counted public limiter attempts; no issuer MFA renewal. | Already consumed bearer generic failure; U new-lease readback by protected receipt/current generation, without redisclosing password or repeating UPDATE. **Never** compensate by restoring old password or revoked sessions. |

Post-domain limiter finalization must never share a live domain lease via another
pool connection. For M04/05 and R02, a finalizer crash/UNKNOWN must leave a
durable pending reservation with bounded recovery and receipt-backed
`COUNTED`/`IGNORED`; if no receipt exists after authoritative rollback,
apply only the approved noncommit policy. For R03 public address/credential
**attempt** quotas, the reservation/finalization policy instead counts failures
and malformed requests as required by Issue #416; never reuse issuance quota
semantics on public redeem. A duplicate request denied during pre-lock
admission must not become a secret replay or bypass quotas: a separately
authenticated, same-operation safe receipt read can confirm an already
committed linkless outcome, while an unresolved operation remains transient;
neither path silently issues a new generation.

| Case | Proposed authoritative outcome |
| --- | --- |
| 1 first valid execution | fresh ceremony/proof, current authorization, locks, expected versions, atomic mutation+receipt+audit, return only after confirmed COMMIT |
| 2 immediate identical retry | fresh authenticated proof and current authority first; identical purpose/op/fingerprint receipt returns safe non-secret completion; never raw prior secret |
| 3 concurrent identical | rank-01 serialization; winner commits -> loser authorized safe replay; winner rollback -> loser may first-execute with its own fresh tx challenge |
| 4 conflicting different operation | canonical domain fence serializes; loser rechecks latest version/generation/status and returns existing domain conflict or auth failure; no forced overwrite |
| 5 retry after state advances | receipt proves past completion only, not present authorization; reauthorize before reading safe completion; deny concealed resource if current authority lost |
| 6 same operation changed payload | immutable purpose/op scope + fingerprint comparison under operation fence; conflict with zero protected mutation, no receipt overwrite |

These are internal proposal rules, not new public endpoints or status codes.
Explicit exceptions: consumed refresh presented again is the DEC-023/072
family-revocation ceremony even after previous success, not a cached rotation;
pending MFA begin can reread seed only for its exact live enrollment session;
reset issuance replay is linkless; reset redemption replay remains generic
invalid; recovery reissue/confirmation cannot reread raw codes; lost login or
rotation response cannot recover raw credentials from a receipt. Recovery after
lost code disclosure follows existing recovery/reissue contract with a fresh
genuine ceremony. No general exactly-once secret-delivery guarantee is claimed.

## Deterministic future PostgreSQL 17 two-connection plan

NOT RUN. Use an attested disposable PG17 database with committed migrations,
real runtime permissions and synthetic identities. A/B use separate connections;
test coordinator observes `pg_blocking_pids`/`pg_locks` through read-only test
control and bounded barriers, never sleeps to guess interleaving. Instrument the
future command's prepare boundary in test-only harness, not production API.
Assert backend/version, isolation, effective grants and absence of preexisting
locks. Establish A's named fence, start B, observe B blocked on that exact fence,
then release A. Repeat with reversed A/B ownership for every row below.

Each test has **C/R/D/U** branches: C A commits; R A rolls back; D backend A
disconnects before COMMIT and rollback is observed; U drop only A's COMMIT
acknowledgment using a disposable connection/proxy harness, then reconcile from
a new lease. D must not be confused with U. B timeout while waiting rolls B
back; explicitly retry with a new proof only after reconciliation. Compare
domain rows, audit cardinality, receipts, consumed challenges and all secret
response fields. Also cross expiry during the wait and assert rejection after
acquisition. No assertion here is an executed result.

| Pair (A / B) | Exact barrier, unsafe interleaving prevented, expected C / R,D / U |
| --- | --- |
| 1 password change / login | A holds target rank03+User09; login has verified old hash before barrier. C old version rejected/no session; R,D old valid login may commit; U determine password receipt then login rechecks actual version, never assumes rollback. |
| 2 disable / login | A holds same User fence; C login inactive failure; R,D active valid login; U disable receipt/status settles outcome before fresh login. Reverse login-first lets login commit then disable revokes it. |
| 3 refresh / refresh | A holds owner03/session12; same old refresh in B. C B observes consumed, COMMITs family revoke then auth failure; R,D B rotates once; U read receipt safely but raw old refresh retry still triggers accepted replay if A committed. Assert no two live successor rotations. |
| 4 logout / refresh | A owner03; C B sees revoked and fails (monotone family state); R,D B rotates if still valid; U authoritative session/receipt before another mutation. Reverse rotation-first logout still resolves presented old lineage and revokes family. |
| 5 logout / MFA | A owner03/session12; C no step/factor/assurance mutation by B; R,D valid TOTP may succeed; U re-resolve exact live session; no assurance resurrection. Reverse MFA-first commit may precede logout but cannot survive as live session after logout. |
| 6 disable / MFA | A owner03/User09; C reject before factor/code mutation; R,D may succeed; U receipt/status/session determine authority. Reverse MFA-first then disable leaves User disabled and sessions revoked. |
| 7 controlled recovery / MFA | A owner03+04/factor13; C old factor rejected by B; R,D step may succeed; U read factor state and controlled audit, never replay secret response. Reverse B-first accepted step commits then retirement invalidates it. |
| 8 management / MFA | A actor03/session12/factor13 S, B same user step/recovery; C management authorized at its commit, B rechecks session/factor and step; R,D B proceeds from unchanged state; U safe operation receipt before retry. Run CA and sensitive LM; also recovery-first: old-factor management denied. |
| 9 role change / reset | A actor/target03 and org07, locked membership11; B reset issue after prior eligibility hint. C role/sole-company change rechecked; ineligible actor/target denies; still-eligible changed expected version conflicts as specified; R,D old current authority may issue; U receipt and current membership, never infer privilege from reset receipt. Reverse reset-first does not authorize role change or future redeem blindly. |
| 10 onboarding / reset | A target email02, all user03 then org07; B same email. C pending/membership/sole-company changes re-evaluated, no stale eligibility reset; R,D B can first issue if eligible; U invitation/reset receipts identify actual effects, no link redisclosure. Test create and resend, active and pending identities, reversed actor UUID order. |
| 11 push registration / reset redeem | A owner03/session12 and registration14; B reset target03. C registration may commit first then B atomically disables it; R,D B revokes without A binding; U authoritative receipt/session/registration, never assume delivery token active. Reverse reset-first makes A fail session check before registration mutation. |
| 12 key retirement / proof execute | A key15 X, B waits S after all domain locks. C B rejects retired key with no protected write; R,D active key may execute if proof still valid; U query protected key state through trusted operational boundary. Reverse B-first S forces retirement to wait until B commit/rollback; record no successful old-key execution commit after confirmed retirement commit. |
| 13 duplicate proof / conflicting proof | Same purpose/op rank01; B separately test identical fingerprint, changed fingerprint, and copied exact tx proof on different backend. C identical safe receipt, changed conflict, copied binding rejected; R,D fresh valid B first-executes, copied proof still rejects; U fresh proof reconciliation only. Test same op different purpose cannot borrow receipt, and challenge reused in same tx cannot duplicate effect. |
| 14 unknown COMMIT / receipt reconcile | A holds op01 through COMMIT; B new-lease authenticated reconcile same identity waits op01. C/U committed receipt reports only safe completion; R,D absence permits explicit first execution using fresh proof. While A is unresolved B must time out transiently, not return absent. Exercise server COMMIT success with lost ack and precommit termination independently. |
| 15 onboarding quota reservation / protected create-resend | A holds outer domain ranks for create/resend while B attempts durable anti-abuse admission. New design **must not** request a second pool lease until A releases its domain lease; reserve ahead of A's locks on a short completed lease and bind to the typed operation. C COUNTED only for committed changed invitation issuance, but IGNORED for same-operation linkless unchanged replay; R,D finalize policy-appropriate noncommit; U retain pending then new-lease reconcile domain receipt before finalizing. Exercise 2-connection pool exhaustion, parallel same-target reservation, postcommit finalization failure and quota exhaustion without signer-proof bypass. |

### Exact C/R/D/U/T harness and per-pair timeout acceptance

`C` means coordinator observes server COMMIT completion and **then** releases
the barrier; `R` is explicit server-confirmed ROLLBACK; `D` kills A's backend
**before any COMMIT is sent** and observes rollback/no receipt; `U` allows the
server to commit but drops only its acknowledgment so A's client sees UNKNOWN.
These are four **distinct** fault injections, not four generic network errors.
In `U`, a verifier on a third, *new* lease must first acquire the matching
operation fence and see the committed receipt and domain/audit rows. The
negative `T` branch leaves A holding its actual named fence beyond B's
effective lock/statement/transaction deadline, records the exact blocked PID,
`pg_locks` resource and SQLSTATE, then proves B's **complete** rollback on
fresh lease; only afterward release A into C or R and force an independently
authorized B revalidation. Neither the original B transaction nor its
time-expired challenge may be resumed. For each case also reverse actor/target
UUID order, reverse A/B when relevant, and cross the credential/MFA/invitation
expiry boundary *while B is waiting*.

| Race | Named B wait and deterministic T result | Post-T completion/compensation assertion (also apply C/R/D/U outcomes above) |
| --- | --- | --- |
| **1 password/login** | B waits owner03/User09 while A changes password; inject B lock timeout. | B has no SS/RC or last-login update; after C old password rejected, after R/D genuine current password may login; U re-read hash/receipt first. |
| **2 disable/login** | B waits target03 or U09, never observes pre-disable User as final authority. | B inserts no SS; A C/U blocks subsequent login, A R/D permits only independently reverified login. |
| **3 refresh/refresh** | B waits owner03/SS12 on same RC generation; on T no consumption or replacement by B. | A C/U winning rotate followed by B **fresh use of old consumed bearer** revokes family and returns failure **after COMMIT**; R/D permits exactly one fresh rotation, no grace/recovery of A's raw successor. |
| **4 logout/refresh** | B waits 03/12; T creates no successor RC. | A C/U revocation terminal; A R/D permits revalidated current refresh. Reverse rotation-first then logout revokes the lineage current after rotation. |
| **5 logout/MFA** | B waits User03/SS12; T cannot advance factor step, SS assurance or issue pending seed. | A C/U denies MFA on revoked SS; R/D permits fresh session+factor proof only. Reverse MFA-first then logout still revokes. |
| **6 disable/MFA** | B waits user03/U09 and times out before F/SS writes. | No consumed C or F step from B; C/U blocks by DISABLED, R/D requires active User/exact session proof. |
| **7 recovery/MFA** | B waits 03/04/F13; T cannot consume code or update SS assurance. | C/U retired F blocks old TOTP/recovery; R/D allows only still-current F ceremony. Reverse ordering preserves one accepted step before retirement. |
| **8 management/MFA** | B waits actor03 or F13; T cannot advance factor or protected management version/audit. | C/U requires subsequent factor/SS recheck, R/D no fabricated assurance. Reverse recovery-first makes old-factor management reject. |
| **9 role/reset** | B waits actor/target03 or org07/M11; T produces no reset row/link or M mutation. | A C/U forces current CA/sole-company/target recheck, R/D may issue only if current; receipt missing under A's lock is never early `not found`. |
| **10 onboarding/reset** | B waits email02 or target03/org07; T cannot create link or consume invite generation. | C/U resets only if latest User/M eligibility remains valid; R/D re-discover target. A's quota is finalized by A's own known/reconciled outcome, not by B. |
| **11 push/reset** | B waits User03/SS12/P14; T no ACTIVE P survives a committed reset by this command. | C/U if registration committed first, redemption disables it; R/D preserve only authorized registration; reverse redeem-first makes new owner binding fail. |
| **12 retirement/execute** | B waits key15 S behind retiring X; forced expiry while blocked must reject after acquisition. | A C/U retired key prevents execute; R/D may proceed only before proof expiry with current key, never sign a stale challenge. Reverse execute-first S makes retirement wait through command COMMIT. |
| **13 duplicate/conflict** | B waits purpose+operation01; T may not infer receipt absent, change fingerprint or execute a copied challenge. | A C/U identical safe response, changed fingerprint conflict; R/D B new proof may first-execute. Distinct purposes never share operation identity. |
| **14 unknown/reconcile** | B new-lease reconciler waits operation01, T must yield transient without secret/absence claim. | A C/U receipt+state confirmed; A R/D absent only once its fence is acquired and rollback established. Never turn R/D into U or vice versa. |
| **15 onboarding quota** | A's quota reservation completes **before** A takes domain locks; with pool max=2, B independently reserves on a short second lease **before its own domain locks** and releases it, then waits on A's email02/User03/org07. Force B timeout; instrument a hard prohibition on A acquiring a nested second lease. | A C changed issuance => COUNTED; A C unchanged same-op linkless replay => IGNORED; A R/D => documented noncommit finalization. A U => pending until new-lease receipt reconciliation. B's timed-out domain attempt is rolled back and its own reservation finalized/recovered independently; an exhausted quota cannot issue a link or be bypassed via signer proof. Inject finalizer failure and enforce one counted event per actual committed change. |

Use deterministic session barriers around the *actual* rank and named SQL
statement rather than fabricated `pg_sleep` success, and capture
`pg_blocking_pids`, backend IDs, `SHOW transaction_isolation`, lock mode,
server-clock sample, SQLSTATE, complete transaction outcome and the resulting
committed receipt/audit row counts. At least one separate test deliberately
exhausts the ordinary pool while a domain transaction is live: no protected
command may request another pool lease and the result must be bounded
unavailability, not an indefinite hang. To test post-COMMIT limiter failure,
close only the **finalizer** connection, keep the domain receipt intact and
recover the pending reservation without reissuing a token/link. Actual
`lock_timeout` (2s), `statement_timeout` (3s), guest PG17
`transaction_timeout` where applicable and the smaller lease/operation budget
must be read from the test connection; a proposed proof TTL cannot extend them.

For all fifteen, after C/R/D/U/T verify no partial credential/factor/reset/push
mutation without corresponding required audit, no raw secret stored in receipt,
no stale challenge accepted from recycled PID/connection, and key/expiry checks
after waits. Add two-user cross-action permutation tests, UUID input reversal,
multi-org entitlement changes, missing subscription rows, same-op different
tenant, and audit insertion failure after domain updates (full rollback).
Foreign-key/unique/audit waits must be captured as actual graph edges. Successful
pair tests alone still do not establish global deadlock freedom.

### SQLSTATE and outcome mapping

PROPOSED internal classification; preserve existing public error mappers.
`40P01` deadlock, `40001` serialization, `55P03` lock unavailable/timeout and
`57014` statement cancel/timeout **before COMMIT is attempted** require confirmed
rollback and a bounded transient result. No blanket automatic POST replay or
new operation identity. `25P02`
means transaction already failed, rollback; do not execute more commands there.
**Any** error after COMMIT is sent, including `57014`, connection-class
`08...`, backend termination `57P01` or transport loss, is UNKNOWN until
fresh-lease receipt reconciliation; an attempted
ROLLBACK after lost COMMIT cannot prove noncommit.

`23505` is mapped only for the known named operation/receipt uniqueness conflict
after authorized reread; push retains its existing conflict mapper. Other
`23505`, `23503`, `23514` are bounded integrity/unavailability failures, never
credential proof. `42501` represents denied privilege/authorization, not a
transient retry invitation. `22023` invalid typed internal request is rejected.
Existing `P0001` messages such as IDEMPOTENCY_CONFLICT, activation failures and
domain-version conflicts retain their explicit safe mapper, never raw SQL detail.
Invalid proof, expiry, key retirement and challenge binding get a bounded closed
internal denial result; do not silently invent HTTP status or expose whether a
target exists. Refresh committed-revocation failure is a structured committed
outcome, not an exception thrown inside the transaction callback.

## Validation and remaining gates

VERIFIED SOURCE FACT is limited to paths and statements above. This authored
document is the only changed file. No DB, migration, privilege, runtime behavior,
exploit reproduction, CI or deployment was executed by this supplement.
Documentation validation consists of source cross-check, scope diff and
`git diff --check`; report actual commands in the delivery record.

Engineering proposal is concrete enough to review, but acceptance depends on
the final issuer/command and ACL manifests sharing these prepare/execute phases,
the key-custody document accepting the row retirement barrier, and final
independent reviewers checking the union graph. Production default isolation,
external authority writers, key operational ownership and effective timeout/log
settings require deployment attestation. Legacy trust bootstrap and planned
downtime remain material Owner choices in the decision register, not lock-order
questions delegated back to the Owner. No new Accepted decision is claimed.
