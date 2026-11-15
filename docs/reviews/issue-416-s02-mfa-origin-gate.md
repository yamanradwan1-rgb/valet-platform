# Issue #416 / Option C — S02 genuine MFA-origin gate

**Status: PROPOSED ONLY — source evidence, not a security fix or launch approval.**
Exact baseline: `db85db57fc5c3913a22d34ab5d9ef77269756301`.
Scope: enrolled TOTP factors, step-up, recovery, session-bound assurance,
Management activity. No Reset, VAP1 implementation, or database changes.

## Findings and verified scope

**S02 remains OPEN.** The ordinary `DATABASE_URL` SQL role receives UPDATE of
`staff_auth_sessions.mfa_authenticated_at`, `mfa_factor_id` and
`last_admin_activity_at`, factor INSERT/activation/replay-step UPDATE, and
recovery-code INSERT/consumption UPDATE:

- `packages/database/scripts/mfa-runtime-privileges.mjs:1-45,142-207`;
  `scripts/provision-runtime-role.mjs:198-209` reapplies grants;
  `scripts/mfa-runtime-privilege-verification.mjs:110-158` expects them.
- `20260916003600_mgt_be_02_complete_mfa/migration.sql:9-66,108-132,151-219`
  enforces same-user factor FK, shape, state transitions and monotonic replay
  step, but does not validate raw TOTP/recovery-code possession.
- `20261030010600_issue363_session_bound_pending_mfa/migration.sql:15-49`
  checks same-user PENDING session ownership, not human-code verification.
- `mfa-enrollment.service.ts:98-180`, `mfa-step-up.service.ts:31-61` and
  `mfa-recovery.service.ts:53-124,146-213` verify submitted user material in
  Node, then write through `RUNTIME_POSTGRES_POOL`. Its credential comes from
  `process.env.DATABASE_URL` in `runtime-database.module.ts:20-24`.
- `mfa-assurance-policy.ts:68-137,140-174` accepts stored MFA timestamps,
  factor state and same-user relation, while Management trusts these fields.
  `packages/database/src/mfa-runtime-role.integration.test.ts:178-235`
  *explicitly executes* direct factor activation and assurance with runtime
  SQL, **without providing a TOTP**.

At the time of W33's standalone source review this established a source-level
privilege/origin gap only; W33 did not run PostgreSQL. **Subsequent independent
W37 testing reproduced the T5 SQL-to-mounted-HTTP bypass on synthetic users
using an actual restricted runtime role** (sensitive Management HTTP201 after
forged MFA and after revoked-session revival). See
`docs/validation/issue416-option-c-launch-security-evidence.md` for the
actual result and its limits. This does not mean any fix has been applied.

## Minimum credible remediation, blocked on an Owner trust-root gate

**Preferred after approval:** if W35 has an *independently reviewed* protected
Staff-Auth writer credential that ordinary runtime SQL cannot obtain or
inherit, extend its authority only through narrowly typed MFA-purpose commands
after explicit blast-radius approval. Otherwise create a **dedicated MFA
ceremony writer** credential, e.g. `MFA_CEREMONY_DATABASE_URL` and a
`LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
NOBYPASSRLS` role. Bootstrap/rotate the credential outside ordinary SQL;
the role must not own the public security tables, inherit runtime, or grant
generic authorization setters. Any private function owner is NOLOGIN.

The new credential/role is a **material trust-root decision** not implicitly
approved by Option C. Reusing `MFA_TOTP_ENCRYPTION_KEY_B64URL` or recovery HMAC
inside SQL, passing arbitrary session/factor UUIDs into an ordinary-runtime
`SECURITY DEFINER` setter, or reusing a generic W35 signature would not be
acceptable. A same-process protected connection can isolate *ordinary DB
credential compromise* (T5), not a compromised app host (T6) or DB owner (T7).

After a specific Owner gate, cut over purpose-scoped operations together:

1. Preserve current encrypted enrolled factor material, real human TOTP
   verification, recovery verifiers, exact Staff bearer checks, and Guest.
   Recheck current active User, locked exact session, factor/pending owner,
   management eligibility, verified code, single-use replay step, and expiry.
   No SQL-only actor ID, timestamp, claimed challenge or old audit is proof.
2. Route *all* factor begin/confirm, step-up, self-recovery and recovery-code
   reissue mutations through the restricted writer within the existing
   atomic factor/session/recovery/audit transaction. Keep anti-abuse durable;
   do not grant a new writer unrestricted `anti_abuse_events.state` updates.
   Use a separately reviewed purpose-scoped finalizer.
3. Include `recordAdminActivityInTransaction` used by Dashboard and
   Management; otherwise the ordinary role can still extend the 30-minute
   inactivity lease. These touches currently share domain transactions:
   analyze lock ordering, rollback and timeout before moving them to another
   pool/transaction. Never replace them with a runtime-callable generic touch
   function or lose the 5-minute sensitive assurance constraint.
4. Cut over applications and **effective ACLs** coherently. Deny ordinary
   runtime/PUBLIC/inherited MFA authority and all alternate function/column/
   default-grant paths; update `provisionMfaPrivileges` and
   `verifyMfaPrivileges` to keep the revocation after two provisioning runs.
   Check Staff session minting/rotation independently under S01; S02 alone
   cannot claim end-to-end Staff/Management T5 resilience.
5. Preserve historical factors but do not grandfather historical session MFA
   timestamps as independently attested. Require genuine fresh step-up
   against the retained factor before sensitive operations after cutover;
   handle ambiguous PENDING factors with audited operator recovery, not
   arbitrary retirement or forced secret exposure.

## Explicit Owner approval required

Choose (A) a **named accepted W35 writer** plus purpose-scoped MFA extension
and credential blast-radius review, or (B) a new independently provisioned
and rotated **MFA writer credential** with specific secret delivery/recovery.
Approve historical-assurance refresh policy, protected admin-activity path,
role rollout/rollback and operational owner. Without this approval do not
change live grants: a simple REVOKE breaks currently legitimate MFA and
Management and a mere extra CHECK/trigger cannot prove OTP possession.

## Validation and release gate

- Performed **only** source evidence:
  `node --test packages/database/issue416-s02-origin/s02-source-evidence.test.mjs`.
  PASS means the old source-level exposure is correctly detected, **not fixed**.
- **Not run:** PostgreSQL, Docker or existing `mfa-runtime-role.integration.test.ts`.
  Its fixture uses an environment/default admin URL and creates/drops databases
  and roles. No shared test DB is authorized.
- After approval: dedicated uniquely identified disposable PG17 and actual
  restricted runtime/writer roles; official migrations and two provisioning
  runs, effective role inheritance/table/column/trigger/definer/EXECUTE ACLs.
  Negative direct SQL factor creation/activation, assurance stamp, recovery
  and activity extension must deny (typically SQLSTATE `42501`).
- Prove real positive enrollment, TOTP, step-up, recovery/reissue, session
  refresh/logout, factor retirement, 5m/30m age, rollback/UNKNOWN, replay,
  same-user other-session, cross-user and tenant negatives, durable quotas,
  immutable audit and Management authorization; Guest/Staff still work.
- Crucially attempt ordinary-runtime SQL-only forged MFA facts and then
  exercise **mounted Staff Auth and sensitive Management API** for actual
  acceptance/denial (not solely source or SQL acceptance). Two-client races
  and lock-order negatives required. Independent reviewer and CI/Security
  signoff required. **Company Admin Password Reset remains OFF.**
