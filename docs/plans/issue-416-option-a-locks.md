# Issue #416 — Option A lock and outcome closure

Status: **PROPOSED DESIGN — not implemented, not an Accepted DEC**.
Source baseline: `62d0a3d3f97a4186d2dd85642212efc7b4f35d42`.
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

## Six retry outcomes and secret exceptions

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

For all fifteen, after C/R/D/U verify no partial credential/factor/reset/push
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
`57014` statement cancel/timeout require full rollback and a bounded transient
result. No blanket automatic POST replay or new operation identity. `25P02`
means transaction already failed, rollback; do not execute more commands there.
Connection-class `08...`, backend termination `57P01` or transport loss during
COMMIT are UNKNOWN until fresh-lease receipt reconciliation; an attempted
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
