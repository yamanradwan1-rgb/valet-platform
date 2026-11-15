# Issue #416 Option A independent SQL review

Status: Review complete for the proposed design; implementation BLOCKED.
All new subdecisions remain pending Owner approval.

Reviewed `issue-416-option-a-authentication-provenance.md` against feature HEAD
`350d88b090c9dbe1f8d7fa29d6390e28afa9ae19`. This review used repository source
only. No database execution, exploit reproduction, deployed privilege attestation,
authentication race tests or key-custody tests were performed.

## Verdict

The draft accurately presents Option A as a candidate and explicitly blocks on
U1 production key custody and U2 exhaustive typed writer/lock closure. Its one-pool
direction fits DEC-025 and docs/17 without giving API runtime migration credentials.
No additional contradiction was found that changes its BLOCKED verdict. The
findings below are required closure of openly unresolved contracts, not findings
that the draft falsely claims to have implemented them.

## Findings

### SQL-01 — MAJOR: privilege cutover must survive normal provisioning (U2)

Evidence: `packages/database/scripts/mfa-runtime-privileges.mjs` grants session
INSERT and selected UPDATE, refresh SELECT/INSERT and consumption/link UPDATE,
factor INSERT/UPDATE and recovery INSERT/consumption UPDATE.
`provision-runtime-role.mjs` calls table provisioning and then this MFA provisioner
(lines 201–207). A restrictive migration by itself can be reversed by normal
provisioning. The draft correctly requires these to change together.

Correction required before implementation: enumerate exact table/column ACLs,
PUBLIC and inherited rights, schema/ownership/overload rights, replacement
EXECUTE grants and startup verifier expectations. Migrate
`mfa-runtime-privilege-verification.mjs`, feature verification and callers with
the provisioner. Preserve only deliberately reviewed lock-only column grants.
Any retained revocation path must be monotone; ordinary UPDATE of revoked_at
permits clearing it unless a stronger enforced boundary prevents that.

Future acceptance: fresh and upgraded disposable PG17 databases must retain the
same restrictive effective privileges after provisioning is rerun. Old
provisioners/app versions must fail the cutover readiness gate, never restore
authority writes. Assert private helper/key/receipt access denied and every
authority-bearing direct column write denied.

### SQL-02 — MAJOR: transitive authority writer manifest is incomplete (U2)

Evidence: direct User/membership/location-access authority DML is already revoked
by `runtime-staff-authority-revokes.mjs`; `runtime-table-privileges.mjs` restores
selected timestamp UPDATE for row locking. However,
`staff-management-runtime-privileges.mjs` grants the existing set-role,
set-status and set-location-access function signatures, while
`staff-onboarding-runtime-privileges.mjs` grants create/resend/activate signatures.
The activation command in migration `20261001005300_mgt_240d_staff_activation`
sets initial password and activates pending User/membership; its ACTIVE-account
branch compares a supplied verified password hash with the persisted hash.
Database-readable hashes must therefore not become new proof-issuer authority.

The draft includes these families and explicitly defers exact signatures and
Organization/entitlement writer closure. That is an honest remaining gate.

Correction required: list every entry point, all callers, private delegates,
trigger effects, exact purpose-specific payload, proof origin and retirement of
the old signature. Cover enrollment begin/resume, activation for existing and
pending accounts, refresh invalid/replay revocation, logout/push, recovery-set
reissue, admin activity and controlled operator paths. Organization status and
entitlement require exact writer/ACL evidence, not the assumption that current
management predicates are sufficient.

Future acceptance: each old entry point is denied to runtime; each replacement
requires its own closed ceremony-bound payload. DB-readable invitation/session/
password hashes, arbitrary actor UUIDs and unrelated tenant scope cannot establish
authority. Exercise actual legitimate activation and management callers as well
as negative ACL cases; owner fixture seeding is not ceremony proof.

### SQL-03 — MAJOR: SQL key custody is a blocking production contract (U1)

The draft correctly separates a new operation MAC key from existing TOTP
encryption/recovery keys (`auth/mfa/mfa-crypto-config.ts`). A private verifier
table provides SQL ACL separation but does not prove backup/at-rest custody.
The draft does not select or claim a deployed custody mechanism.

Correction required: select actual injection/provisioning mechanism, owner,
storage/backup access, rotation and emergency retirement procedures. Keep secret
values out of migrations/function definitions/GUCs and observable query text;
execute revocation does not make PostgreSQL function source confidential. Pin
non-runtime ownership, qualified objects and safe search path. Specify effective
schema replacement denial and key-table/helper/receipt privileges. Verify MAC
comparison and canonical encoding through the eventual implementation contract.

Future acceptance: isolated deployment canaries establish secrecy across
provisioning, success, error, rollback, cancellation and proxy/tracing sinks;
runtime/PUBLIC cannot read or replace verifier material. Exercise VERIFY_ONLY
overlap, immediate retirement, missing-key outage and old proof rejection.
Repository source alone cannot establish production custody.

### SQL-04 — MAJOR: per-command lock migration remains unproven (U2)

Evidence: `auth/staff-user-security-lock.ts` and `staff-auth.service.ts` acquire
User-security advisory locks before login/refresh User/session/refresh row locks.
MFA services instead call `lockAndRecheckMfaSession` (session and User FOR UPDATE),
then `lockMfaUser`, then factor/recovery locks. Logout locks refresh/session rows
before revocation/push. Onboarding takes email then sorted actor/target
User-security advisories, then management organization lock and authoritative
membership/User/invitation rows (migration 051/053 and
`management/staff-onboarding-account-lock.ts`). These are distinct current orders.

The draft correctly identifies incompatibility instead of asserting deadlock
freedom. Its candidate reset ordering is a proposal requiring a complete graph.

Correction required: include caller-held and SQL-internal locks, key/challenge/
operation-receipt locks, multi-User ordering, factor fences, Organization and
subscription locks, isolation level and failure handling for each command.
Recheck proof expiry after potentially blocking locks, as well as current session,
MFA freshness, authority and lineage immediately before mutation. Explicitly
handle READ COMMITTED and existing REPEATABLE READ consumers. Receipt conflicts
must not introduce a domain-lock/receipt-lock inversion.

Future acceptance: deterministic paired transactions for login/refresh/reset,
MFA/logout, disable/verify, role/status/reset, push/reset and duplicate/conflicting
proofs, including commit, rollback, disconnect and serialization failures. Unknown
commit reconciliation must neither blindly replay writes nor disclose secret
results. No such tests were run in this design phase.

## Readiness

OPTION A DESIGN BLOCKED — ADDITIONAL SECURITY DECISION REQUIRED remains the
correct verdict. The draft supports Owner review of a concrete direction but
does not close U1/U2 or authorize implementation. After approved custody and typed
writer/lock contracts exist, independently review the exact proof schemas and
effective ACL migration before source implementation is treated as ready.
