# Issue #416 A01 SQL boundary — dormant handoff

Status: **BLOCKED. SOURCE ONLY. PG17 NOT RUN.** The database-only changes in
this branch do not install an A01 reservation writer or grant a runtime role.

`AntiAbuseService.reserve()` currently commits a mutable public
`anti_abuse_events` row. That row's UUID, key hash, and state cannot attest
an application-verified raw password ceremony, the deployment audience, a
stable operation ID or a VAP1 signed proof. The existing runtime role may
write/finalize public anti-abuse events. An SQL function that merely accepts
those identifiers and populates private `limiter_bindings` would let ordinary
SQL capabilities manufacture A01 evidence.

## Required pre-domain contract (no executable function yet)

After the trusted HTTP layer derives the canonical identifier, secret-backed
HMAC key, lock pair and independently allocated operation UUID, one **separate
completed** transaction must enforce five attempts in a DB-clock 15-minute
rolling window and atomically create one PENDING public reservation and its
private `(audience,'STAFF_LOGIN_COMMIT',operation_id,reservation_id,scope,
key_digest,request_fingerprint)` identity. The current
`auth_proof_private.limiter_bindings` gains a required 32-byte fingerprint in
dormant migration129. This is schema support only: no trusted writer exists.
Same-operation retries must
return the same reservation only for an exact original fingerprint. The
commit-linearized binding must be immutable to the ordinary runtime role.

**Still missing:** an authenticated origin that cannot be constructed from a
caller-supplied User ID, copied Argon2 PHC, DB-readable access verifier,
arbitrary context object or a claimed `passwordVerified` boolean. W3's
password verification helpers are candidates for a purpose-specific trusted
application ceremony, but no trusted admission/signing capability is connected
to them yet. A generic MAC oracle is forbidden. An ordinary SQL function
cannot establish that origin merely by inspecting the public reservation.

## Required post-domain contract (no executable function yet)

Use a new lease only after all Staff Login domain locks have been released.
Input should be only `(audience, operation_id, reservation_id)`; never an
external `COUNTED`/`IGNORED` argument. The function must join an immutable
A01 receipt, a *consumed* exact-operation VAP1 challenge, original session and
refresh identities from `a01_issuance_evidence`, and the non-forgeable
`STAFF_LOGIN_SESSION_CREATED` account-security audit. Match original payload
and state digests, actor `ANONYMOUS`, subject User and null organization/member.
Only the proven committed unchanged/no-charge outcome may transition to
`IGNORED`; absent or unknown receipts remain `PENDING` and later conservatively
`COUNTED` under a documented retention window. Failed-domain attempts cannot
be discounted by the caller.

W13's staged migration123 blocks bound-event UPDATE entirely. A reviewed
forward-only narrow finalizer and its immutable basis ledger must replace that
rule at the coordinated cutover, with ordinary runtime `UPDATE(state)` and
cleanup bypasses closed at the same time. Never disable the trigger or grant
temporary private owner access to runtime.

## Separate reset ABI delivered here

`auth_proof_private.assert_reset_issue_reservations(text,uuid,bytea,uuid,
uuid,uuid,uuid,uuid,uuid[])` accepts the ordered **private** four-scope R02
UUIDs, plus the exact issuer/target/member/organization identities. It returns
five fields per binding in fixed target/issuer/org/address order and has no
runtime EXECUTE grant. It cannot consume public `limiter_bindings` UUIDs.
Migration127 cross-references the committed reset generation, fingerprint and
issue audit using an exact composite FK. The signed R02 domain writer and the
genuine staff bearer/MFA signer are still absent, so these migrations must
remain dormant until reviewed PG17/ACL and application acceptance passes.

Prime must update `docs/03_DATABASE_SCHEMA.md` and the Issue #416 evidence
ledger when integrating these migrations; these shared files are outside W17
ownership. Do not edit migration113/120/124 histories or execute Prisma
while the independently attested failed migration113 remains unresolved.
