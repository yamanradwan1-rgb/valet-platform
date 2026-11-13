# Issue 416 P0-D — R02 PG17 acceptance plan (NOT RUN)

**Status: SPECIFICATION ONLY — NO PostgreSQL connection, migration, fixture,
recovery, or execution was performed for this review.**

Source baseline: W12 branch `cos/issue416-impl-w12`, migrations 120 and 124.
This plan must not be wired into a default test command. The existing opt-in
PG17 test file is *not* evidence that any of the cases below passed.

## Authorization and isolation gates (stop on any failure)

1. Prime must explicitly release the W9 migration113 `P3018/42501` recovery
   safety block. Do **not** retry Prisma, resolve migration history, or use
   alternative SQL/CLI paths to get around the block.
2. Only W9's exclusively leased, identity-attested, synthetic, disposable PG17
   target may be used. Require the W9 container/project label, exact allowlisted
   synthetic DB URL triplet, role identity, loopback port and exclusive lease.
   Never connect to live, shared QA, default 5432, or production databases.
3. Confirm all W2 migrations 113–119 and 121–123 are reviewed and applied in
   order, then W12 120 and 124, with no partially applied or failed migration.
   Re-check schema owner/ACLs. W2 owns any 113–123 repairs.
4. Future execution needs a purpose-limited, rollback-isolated fixture and
   verified cleanup/identity after every case. Concurrency and lost-ack cases
   necessarily need two independent leased connections; do not hold a domain
   lock while acquiring another lease. No synthetic identity or timestamp may
   leak into other workloads. Require explicit owner approval of any clock
   manipulation or test-only committed fixtures.

## Test matrix — all NOT RUN

| ID | Prospective synthetic test | Required observed result |
| --- | --- | --- |
| Q01 | Inspect `pg_roles`, role memberships, schema/object ACLs, grants, function security mode and ownership under runtime, migration and private-owner roles. Try runtime SELECT, INSERT, UPDATE, DELETE, function EXECUTE and `SET ROLE`. | Runtime has no private schema/table/function/owner capabilities; only attested migrator may assume NOLOGIN/NOINHERIT owner; functions stay invoker, no `SECURITY DEFINER` or PUBLIC EXECUTE. |
| Q02 | Call reserve with authenticated prospective issuer/target/org/client-address identities and four correctly derived HMAC hashes. Inspect returned ID array and private rows. | Exactly one bundle and four unique PENDING rows; source order target, issuer, org, address; exact fingerprint, IDs, hashes, timestamp and purpose-specific scopes. Never accept caller-supplied raw bearer, IP or password. |
| Q03 | Exercise caps with distinct operations, sharing only one key at a time, at counts 2→3 target, 19→20 issuer, 99→100 org, 29→30 client, then one extra in each case. | Exact rolling 900-second COUNTED+PENDING boundary; denied request has *zero* bundle/entry writes, regardless of which scope fails. Verify boundary exactly at 900s using an authorized controlled clock strategy, not arbitrary test-clock edits. |
| Q04 | Same audience/op/identities/fingerprint/keys reserved twice, including a fresh lease after simulated lost reserve-COMMIT acknowledgment. Mutate in separate retries: fingerprint, principal, membership, org, one key. | Same four reservation UUIDs and current state for exact replay; every mismatch fails closed. Unknown COMMIT may not create another bundle or mint a new operation/token. |
| Q05 | Inject error after bundle insert, after 1–3 entry inserts, and at deferred-integrity COMMIT, using synthetic rollback/savepoints. | No durable partial bundle, fewer-than-four entries, orphan evidence, or discounted one-scope quota; integrity trigger rejects any partial row/state/occurrence mismatch. |
| Q06 | Two concurrent connections reserve same key(s) in reverse request order and across scopes. Include lock contention, blocked waiting, timeouts, deadlock diagnostics and concurrent cap-at-boundary. | Operation lock first, sorted logical locks next; no oversubscription, partial writes, deadlock or leaked lock. Compare Node signed 32-bit `lockHigh/lockLow` with PostgreSQL first 8 digest bytes. |
| Q07 | Commit receipt/evidence for one genuine **changed issuance** on a distinct domain transaction only after consuming an exact RESET_ISSUE challenge, committing generation+audit and proving all four reservation IDs. Finalize on fresh lease. | Four COUNTED together and stable on replay; evidence exactly binds issuer, subject, organization, session/MFA/current eligibility, request fingerprint, reset ID/generation, operation receipt and audit. No raw link can be redisclosed. |
| Q08 | Exact authorized, same-operation linkless no-op receipt; invalid/forged/unconsumed/wrong-actor/wrong-tenant/wrong-generation receipt; cross-operation challenge; stale generation and changed request. | Only valid `LINK_UNAVAILABLE` no-op makes all four IGNORED. Every invalid case rejects evidence/finalization without changing PENDING state or granting a link. |
| Q09 | Lost domain-COMMIT acknowledgment with absent, committed and delayed receipt; dropped finalizer, retry, delayed arrival; expiry without evidence. | Unknown stays PENDING pending fresh-lease receipt reconciliation; committed changed receipt makes all COUNTED; no evidence is conservatively COUNTED at 900s when reconciled; no transport-error `IGNORED`, duplicate generation or new link. |
| Q10 | Attempt runtime and direct private-owner UPDATE/DELETE of ledger/evidence, single-row discount, parent/child mismatch, then all-four-entry+parent PENDING→IGNORED without a receipt as trusted owner. Include invalid terminal state/basis pairs COUNTED+DOMAIN_UNCHANGED, IGNORED+DOMAIN_CHANGED, IGNORED+EXPIRED_UNRESOLVED, and NULL/finalized_at mismatch. | Runtime has no UPDATE or owner membership. SQL CHECK must reject all invalid state/basis/timestamp pairs regardless of caller; the source guard should reject single-row/partial or terminal mutations. If an all-four **valid-pair** owner update succeeds without a receipt, document it as a *privileged bypass*, not a passing receipt-proven discount. Future writer cannot hold direct UPDATE grants; a receipt-bound narrow finalizer is mandatory. |
| Q11 | Attempt R02 issuance via existing `AntiAbuseService.reserve()`, mutable `public.anti_abuse_events`, legacy SQL writers, alternate endpoints, or old `limiter_bindings` public FK. | None can issue a reset or satisfy new private four-scope bundle. Signed R02 `LIMITER_RESERVATION_V1` must bind **private** reservation UUIDs/hashes/fingerprint with an accepted W2/Owner migration mapping, never old public IDs. |
| Q12 | Malformed/expired/used R03 credential, and canonical credential, with two independent attempt scopes. Exercise R03 even when body parsing fails, then concurrent R02 issuance. | R03 trusted-address 30/15m is durable pre-parser; canonical credential 5/15m is separate. Neither returns or modifies an R02 bundle, uses R02 `IGNORED` discount, or grants reset issuance. |
| Q13 | Rollback before reserve COMMIT, denied domain operation, confirmed domain rollback, unknown transaction outcome and receipt replay under connection-pool exhaustion. | Clear separate pre-domain and post-domain leases; no nested pool acquisition under domain locks; distinguish confirmed rollback from unknown commit; never mint link or discard a pending attempt without authoritative receipt. |
| Q14 | Inspect migration120 after its COMMIT but before migration124, then source and catalog after 124. Force failure at a statement in each migration in a fresh disposable database only if approved. | 120 has private storage/guards/evidence, no reserve/reconcile callable; 124 installs both functions without broader grants. Each failed migration is transactionally rolled back; ordering is 120 then W2 121–123 then 124. |

## Known source-supported blockers — not waivable by a green unit test

- **P0 activation blocker — limiter ABI mismatch.** Migration113
  `auth_proof_private.limiter_bindings` (113:224–233) has its reservation_id FK
  to `public.anti_abuse_events`. Migration120 (120:46–67) and migration124
  (124:131–146) instead create/return **private** `reset_issue_quota_entries`
  IDs. No authenticated RESET_ISSUE domain writer or accepted private-reservation
  signed proof binding exists here. W2/Owner must resolve the typed ABI and close
  all old writer/grant routes before Q07/Q11 can pass.
- **P0 activation blocker — domain-generation evidence.** The evidence row can
  carry reset_id/reset_generation (120:84–99), but its insert guard
  (120:197–241) authenticates receipt/challenge/audit **without comparing those
  values to an actual committed reset generation**. The R02 domain writer and
  atomic generation/receipt/audit binding do not exist in W12. Q07/Q08 remain
  red until this is proven; an audit row alone is not issuance evidence.
- **Significant integration gap — authenticated reservation entrypoint.**
  `reserve_reset_issue_quota` (124:8–149) accepts syntactically valid hashes
  and typed IDs, not a freshly authenticated CA/MFA provenance on its own.
  This is deliberate dormancy: runtime has no SQL EXECUTE, and no application
  endpoint may call it until narrow authenticated authority exists.
- **Significant conditional privilege risk — direct owner state transition.**
  The state guard (120:113–135) permits PENDING to COUNTED/IGNORED, while
  deferred integrity (120:153–192) only requires all four entries and bundle
  to agree. A privileged owner with table UPDATE can change all five state
  fields in one transaction **without a receipt**, bypassing the ordinary
  receipt-derived finalizer. Current runtime gets no such grant; future SQL
  writers must also receive **no direct UPDATE**. Q01/Q10 must prove the grant
  boundary and report privileged-owner behavior without claiming SQL itself
  enforces receipt provenance for arbitrary owner DML.
- **W10 terminal-basis pair fix (source-only, PG17 NOT RUN).** Migration120's
  bundles CHECK now only allows PENDING with NULL finalization fields, COUNTED
  with DOMAIN_CHANGED or EXPIRED_UNRESOLVED and non-NULL finalized_at, or IGNORED
  with DOMAIN_UNCHANGED and non-NULL finalized_at. This closes invalid pairing
  even for direct owner DML, but does **not** establish receipt provenance or
  validate CHANGED reset_id/generation against a committed reset record.
  Integration activation remains BLOCKED. This source revision is limited to
  W12's still-unapplied migration120 in the blocked synthetic fixture; it must
  never rewrite an already-applied migration in any environment. If a target has
  applied 120, coordinate an explicitly new forward-only constraint migration
  after verifying its migration history. W13 owns prospective migration125;
  W12 created no migration125 and must not collide with that numbering.
- **Significant operations gap — unresolved reservations.** A finalizer
  invocation (124:212–217) transitions a PENDING attempt to conservatively
  COUNTED after 900s, but there is no scheduled recovery/reconciliation or
  approved proof-retention policy in W12. No auto-discount and no truncation of
  unresolved proof. Q09/Q13 and production recovery policy remain open.
- **Unverified PG behavior — advisory lock/DDL/ACL/constraint execution.**
  Source has canonical ordering (124:79–107), exact four-row inserts
  (124:121–146), deferred integrity (120:149–192) and private revokes
  (120:243–249;124:239–245), but these are inspection facts, not verified PG17
  concurrency, privilege or migration behavior.

## Required verdict before enabling reset issuance

**Current: BLOCKED / PG17 NOT RUN.** Source-only assertions may pass without
proving DB atomicity, authorization, isolation, application integration or real
concurrency. Only accept after independent signed-proof/privilege audit, Q01–Q14
executed under fresh explicit W9/Owner authorization, and evidence on the exact
integrated SHA. Do not use this document as permission to run SQL.
