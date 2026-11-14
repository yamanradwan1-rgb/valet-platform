# Issue416 A01 — Trusted Limiter Dependencies (W13 source-only)

Status: DORMANT. No admission, settlement, SQL migration or runtime grant.

The current StaffLoginService calls AntiAbuseService.reserve(), which commits
a standalone anti_abuse_events(PENDING) row. Its UUID and HMAC key hash do not
attest any VAP1 audience, purpose or operation binding.
AntiAbuseService.finalize() takes a caller-provided COUNTED/IGNORED decision,
which is not a protected A01 finalization authority. Staged migration123
explicitly blocks bound-event UPDATE; do not bypass this trigger.

## Required purpose-specific pre-domain SQL interface (NOT IMPLEMENTED)

1. An independently committed short lease from accepted Staff Login input:
   canonical email, the existing secret-backed HMAC key, exact derived lock
   halves, server operation UUID, attested deployment audience and fixed
   STAFF_LOGIN_COMMIT purpose. These are candidate identities, not login proof.
2. Under the derived-key advisory lock, enforce the five-attempt rolling
   15-minute threshold using PostgreSQL clock; atomically commit precisely one
   PENDING event and private limiter_bindings row for the same audience,
   purpose, operation, scope and derived key digest.
3. Same operation plus exact fingerprint can recover only the original
   already committed binding. Changed key/operation/tenant/payload or UNKNOWN
   COMMIT must never fabricate another reservation.
4. Separately owned purpose-specific signer must attest actual submitted raw
   password Argon2 verification, original PHC and current locked PHC/ACTIVE
   User/ADMIT, not a SQL-visible hash, caller boolean, User UUID or arbitrary
   context. Neither binder nor finalizer can be a general signer oracle.
5. Verified private NOLOGIN grant and old-definer/provisioner denial:
   no runtime/PUBLIC/inherited direct INSERT/UPDATE of private binding,
   no generic EXECUTE of binder, no writable key/epoch or arbitrary audience.

## Required post-domain finalizer SQL interface (NOT IMPLEMENTED)

1. Start a separate restricted lease only after domain lock release. Recheck
   exact private audience/purpose/operation/reservation binding and key scope.
2. For IGNORED, independently verify immutable COMPLETED receipt, consumed
   challenge, exact payload/state digest, immutable A01 issuance sidecar,
   original session+refresh lineage, ANONYMOUS subject User, null membership/
   organization actor, and the original account-security audit event. Claimed
   receipt, client JSON and mutable generic audit are never authority.
3. Persist a single idempotent finalization basis/transaction. A duplicate
   cannot discount twice or prune a still-PENDING binding.
4. Known failures and unresolved attempts after authorized recovery window
   must be COUNTED conservatively. UNKNOWN COMMIT is not rollback; absence of
   a receipt is not proof of failure. Do not retry POST with new identifiers.
5. Migration123 currently rejects bound anti-abuse UPDATE. Only a separate
   DBA-reviewed forward migration may implement a narrow, finalizer-only
   transition with durable evidence; no temporary runtime owner grant, trigger
   disable, SQL GUC or generic finalize(UUID,state) endpoint.

## Replay / 15-minute protocol

Fresh PENDING within DB-clock 15 minutes permits only a _candidate_ new
issuance, never a completed receipt. Resolved IGNORED supports only a new
genuine password ceremony and exact signed linkless same-operation replay;
it never creates SS/RC or rediscloses raw tokens. COUNTED denies new birth.
Expired PENDING, changed payload/audience, HOLD/disabled User and stale PHC
must fail closed. The API cannot use its own clock or caller-provided pending
age for a finalization decision.

## Handoff

The new source-only inspectors always return a blocked result, including for
a forged matching key or apparently perfect immutable receipt. Tests check
UUID-only, forged audit/receipt, changed fingerprint, UNKNOWN COMMIT, terminal
COUNTED/IGNORED, foreign audience/tenant, claimed stale PENDING and absence
from active AntiAbuseModule registration. W13 has no DB attestation or runtime
grant authority. Independent DB/signer reviews and actual PG17 integration,
ACL and recovery tests are mandatory before activating any SQL writer.
