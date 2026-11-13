# Issue 416 — R02 protected reset-issuance quota (dormant)

Migrations `20261113012000_issue416_vap1_atomic_reset_quota` (120, private
tables/evidence/guards) and
`20261113012400_issue416_vap1_atomic_reset_quota_functions` (124, private
reservation/reconciliation functions) form a **future-only** contract. Each is
under 300 physical lines and wraps its SQL changes in an explicit PostgreSQL
`BEGIN`/`COMMIT` with `SET ROLE`/`RESET ROLE`, so a statement failure cannot
leave partially installed schema/functions. Migration 124 depends on 120 and
comes after W2-owned 121–123 in the forward-only ordering. Neither migration
enables a password-reset endpoint, exposes EXECUTE to application roles, or
alters the existing anti-abuse service.

## Pre-domain boundary

After authenticating the prospective Staff bearer and deriving actual trusted
issuer, target, Organization and canonical client-address keys, the future R02
service must use **one separate, short transaction before any domain lock**.
Call `auth_proof_private.reserve_reset_issue_quota` only through a future
reviewed purpose-specific protected entrypoint. Supply the exact operation UUID,
immutable pre-domain request fingerprint, current issuer and target User and
membership IDs, Organization ID, and four HMAC keys. This private function
locks the operation first, then logical `(scope,key_hash)` pairs in C byte order.
The four 900-second rolling caps are target=3, issuer=20, Organization=100,
client-address=30. It inserts **one private bundle and all four PENDING rows**
in one transaction; any cap failure rolls back the entire invocation.

Repeated matching operation IDs return existing state plus reservation UUIDs
in **target, issuer, Organization, client-address** wire order. A different
fingerprint, principal/membership, Organization or key set conflicts. A lost
reservation COMMIT acknowledgment must reconcile this same operation on a new
lease and must never reserve a new bundle with that UUID. Raw IP, tokens, link
or password data must not be SQL inputs or stored in these tables.

## Domain/finalization boundary

The future narrow authenticated R02 writer must inspect the exact reservation
IDs, hashes, request fingerprint and PENDING state under its normal rank-order
domain locks; then revalidate the session, sensitive MFA, Company Admin and
one-company target invariants. Its immutable **domain result evidence row**
must be inserted in the *same domain transaction* as the actual reset
generation, successful consumed VAP1 challenge, private operation receipt and
account security audit. The `reset_issue_domain_evidence` insert trigger checks
the private receipt, consumed challenge, exact actor/target/Company association,
and (for a changed issuance) the corresponding USER audit event. It deliberately
does not constitute an R02 domain command by itself: the reset-generation table,
eligibility checks, signed payload and ledger binding remain to be authored and
independently reviewed by the future R02 owner.

Only **after releasing the domain lease**, call
`auth_proof_private.reconcile_reset_issue_quota(audience,operationId)` through
the future authorized repository. There is **no finalizer state argument**:
the function reads the verified domain outcome and changes all four rows to
COUNTED on changed issuance or IGNORED on an authenticated unchanged linkless
replay. If domain COMMIT is unknown or finalization failed, rows remain PENDING
and consume quota until reconciliation. After 900 seconds unresolved attempts
become conservatively COUNTED; a timeout or SQL exception is never evidence of
rollback. The ledger is append/terminal-only: SQL-only runtime roles have no
read, write, EXECUTE, role membership or schema access. No cleanup job is
implemented; retention needs its own approved policy and cannot delete proof
needed for unknown-COMMIT reconciliation.

The R02 ledger is independent of `public.anti_abuse_events`: its existing
runtime `UPDATE(state)` permission and one-hour cleanup path would allow
counter discount or conflict with migration113's `limiter_bindings` FK RESTRICT.
Future purpose-specific VAP1 payloads must bind **these four private UUIDs**,
not legacy `anti_abuse_events` IDs, with an accepted wire/migration-owner
mapping before activation. This compatibility gate must be reviewed explicitly.

R03 retains exactly two different independent attempt scopes: trusted
client-address `30/15m` before parsing, and credential `5/15m` only for a
canonical token. Both count attempts even on failed validation; R02's
changed-link accounting must never be reused for R03.

## Tests and release gate

PG17_ACCEPTANCE_NOT_RUN.md contains the P0-D security/atomicity/receipt/
concurrency acceptance matrix and its source-supported activation blockers.
It is a **specification**, not executable SQL or permission to connect to PG17.

`node --test packages/database/issue416-quota/*.unit.test.mjs` performs source,
hash-component, boundary and physical-line-count checks. The opt-in isolated
PG17 suite uses the W9 harness and can run **only** after the forward-only
lexical order W2 113–119 (plus any 11950/11955 before 120) → W12 120 →
W2 121–123 → W12 124 is successfully migrated under W9's triple URL,
container identity and exclusive lease
attestations. The guarded PG17 fixture previously failed migration113 (P3018);
all PG17 quota tests are **NOT RUN** pending W2/Prime safe recovery. No
production DB, PR, push, merge or cutover is authorized by this change.
