# Issue 463 W4 — isolated disposition ledger contract

Status: controlled implementation, provider-neutral, unmounted. No cloud
provider, production DB, restore coordinator, production secrets or release wiring.
In-memory signed test doubles are NOT proof of provider durability.

## Personal reading receipt

- Exact docs checkpoint / own branch base:
  173674d334770262e5a54fd74f1a409c25d024f7.
- Audited existing app baseline: cc507a5b25779e12934a3ead846ceb2c8ddff16b.
- Personally inspected COMPLETE Master Plan v1.3 (847/847 lines) in ranges:
  1-105, 106-200, 201-294, 295-400, 401-495, 496-594, 595-705,
  706-795, 796-847. Controlling sections 6, 12, 15, 17.3 and 18.
- Personally inspected COMPLETE P0 Architecture Proof (359/359 lines) in
  ranges 1-115, 116-235, 236-359; particularly section 10.
- Read root AGENTS.md, docs/17_AGENT_CODE_STRUCTURE_RULES.md (300 line
  authored file ceiling), security/retention rules, accepted DEC-091/095
  November 27 amendments, implementation execution handoff, current strict
  Guest rating contract/API command, API tsconfig/vitest/test classification.

## Implemented contract, not active provider

- types: strict typed scope, intent, receipt, action, controlled outcome,
  signed checkpoint, independent monotone CAS witness, injected
  store/signer/verifier, P-only SQL adapter and committed receipt reader.
- codec: canonical metadata-only digest (NOT comment hash), exact allowed
  field/type/UTC validation, cryptographic signature interface.
- protocol: independently trusted signed monotone witness and full chain,
  conditional append CAS, verified exact-payload idempotent replay, bounded
  verified CAS rebase, unknown-commit readback and witness ACK reconciliation.
  Durable witnessed intent is mandatory before any SQL; exact committed SQL
  readback is required before signed completion receipt. Unverifiable unknown
  results fail closed.
- W2 SQL adapter: one exact parameterized E-only P-owned function
  public.apply_guest_rating_comment_disposition(uuid), strict status
  allowlist and exact metadata-only approval/committed receipt inspection.
  The P-owned SQL function owns locking, final expiry, case and same-XID
  commit. An independently authorized inspector is required for pre-apply
  and completion verification. W2 A/E/R have no direct receipt-table SELECT;
  no new grants or function were added to circumvent this.
- restore: no caller-supplied plan is accepted for execution. Fresh verified
  independently signed checkpoint in quarantine is rechecked after replay.
  ERASED requires NULL, tombstone, case receipt and invisibility proof;
  HELD_PENDING must retain hold and pending erase case; RELEASED requires
  exact historical case reconciliation; NO_RECORD_CLOSED requires original
  24h window closed, exact committed case and confirmed no rating. Intermediate
  fully resolved histories do not block; unresolved intents, NO_RECORD_WAIT,
  unknown or contradictory states always block. Admission remains DENY.
- fixtures: explicitly nonproduction in-memory ledger/witness CAS + generated
  Ed25519 key; tests cover forged replay plan, wrong-case RELEASE, ERASE during
  HOLD, HELD_PENDING, NO_RECORD closure, unknown ACKs, independent witness
  rollback, race and stale SQL receipt, idempotent retry and quarantine failures.

## Integration boundaries (pending and not authorized here)

Provider: separately attested write-once independent store/recovery domain,
signer/key custody and rotation, atomic monotone witness CAS, verifiable highest
committed immutable head, provider receipt semantics, rollback resistance and
backup/WAL residual evidence. A witness and ledger write are not atomic:
the store must retain any committed object across a crash before witness
advancement, and the recovery inventory must detect it. No S3 provider qualified.

P SQL: W2 exact five controlled routines and private metadata receipt table
were inspected (20261127000100 P2 draft). A/E cannot directly SELECT receipt
metadata. The unmounted W4 adapter requires a separately authorized inspector
that binds approval, tenant, visit, case, actors, action, timestamps, outcome and
verified transaction commit. Until that approved reader and real PG transaction
adapter exist, no runtime mounting or durability claim. W2 draft returns
NO_RECORD_WAIT without writing a completion row; do not sign it as completion.

Restore: operational SRE/controller process must independently establish
legal hold/rights authority, complete ledger, exact-case recovery callbacks,
actual SQL tombstone and committed receipt proof, backup retention, repeat-safe
replay, and separate Gate C approval before ANY served traffic.
These pure functions DO NOT authorize opening traffic.

Legal: notice/consent, cryptographic-erasure/key model, backup copy lifetime,
hold authority, identity checks remain task-specific owner/counsel decisions.

## Verification

Focused Vitest api-non-postgres and six-source TypeScript noEmit were run for
this continuation; exact final counts and SHA are reported at final handoff.
No full build/CI, DB provider, HTTP, independent PG restore, or deployment claim.
