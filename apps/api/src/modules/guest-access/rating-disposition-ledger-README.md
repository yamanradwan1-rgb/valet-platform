# Issue 463 W4 — isolated disposition ledger contract

Status: controlled implementation, provider-neutral, unmounted. No cloud
provider, DB, restore coordinator, production secrets or release wiring.
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
  signed checkpoint, independent witness, injected store/signer/verifier,
  P-only SQL adapter and committed receipt reader.
- codec: canonical metadata-only digest (NOT comment hash), exact allowed
  field/type/UTC validation, cryptographic signature interface.
- protocol: independent trusted minimum checkpoint, signed full chain,
  conditional append CAS, durable intent and readback before SQL callback,
  independently verified committed SQL receipt before completion append.
  Unknown or conflicting results block, not success.
- restore: quarantined plan for ERASED/HELD, expiry recomputation, idempotent
  replay, full fail-closed behavior and admission DENY even after mock success.
  RELEASED, HELD_PENDING, NO_RECORD, unresolved intent need current
  controller/legal authorization and are deliberately denied, not automated.
- fixtures: explicitly nonproduction in-memory CAS + generated Ed25519 key;
  tests cover tamper, stale signer/head, signed rollback, gaps, unknown,
  concurrency, validation coercions, repeated replay and quarantine failures.

## Integration boundaries (pending and not authorized here)

Provider: separately attested write-once independent store/recovery domain,
signer/key custody and rotation, retained immutable checkpoint, provider
receipt semantics and backup/WAL residual evidence. No S3 provider qualified.

P SQL: Prime/W2 must supply exact authorized A/E case and tenant binding,
transaction-scoped visit/child lock, no comment SELECT by P, noncontent
committed receipt and failclosed expired/held/no-record workflow.

Restore: operational SRE/controller process must independently establish
legal hold/rights authority, complete ledger and backup retention, repeat
safe replay, and separate Gate C release approval before ANY served traffic.
These pure functions DO NOT authorize opening traffic.

Legal: notice/consent, cryptographic-erasure/key model, backup copy lifetime,
hold authority, identity checks remain task-specific owner/counsel decisions.

## Verification

Focused Vitest api-non-postgres: 2 suites, 17/17 PASS with in-memory doubles.
Focused strict TypeScript noEmit for four new source files: PASS.
Full API typecheck attempted but could not pass: isolated dependency graph
cannot resolve zod and reports unrelated repository-wide errors. Therefore
NO full build/CI claim. No database/provider/HTTP/deployment tests.
