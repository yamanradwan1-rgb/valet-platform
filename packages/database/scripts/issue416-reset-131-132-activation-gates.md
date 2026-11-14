# Issue416 R02/R03 forward-only SQL: source-only review boundary

**Status:** DORMANT, AUTHENTICATED ADMISSION DENIED. No PG17/Prisma migration,
privilege probe, server-side key, application signing or runtime activation has
been performed. This is not a claim of successful SQL parsing or installation.

## Source advance (after committed 125–130)

- Migration **131** preserves `120/124`'s short, pre-domain, all-or-none four
  private PENDING reservations. At a deferred COMMIT check, it refuses arbitrary
  finalization of those four entries: `DOMAIN_CHANGED/COUNTED` requires the
  consumed exact RESET_ISSUE receipt and issued reset/audit/generation row;
  `DOMAIN_UNCHANGED/IGNORED` requires the same-operation LINK_UNAVAILABLE
  receipt and **no** issued row. Unknown/no-receipt remains PENDING; only after
  the DB-clock 900-second boundary can `EXPIRED_UNRESOLVED` become COUNTED,
  never IGNORED. The existing 120 deferred four-entry check still enforces
  matching scopes, HMAC hashes, timestamps and terminal states. Installation
  refuses pre-existing terminal bundles that have not passed this new guard.
- Migration **132** adds insert-only private `reset_redeem_domain_evidence`,
  keyed to one exact reset UUID/generation/token hash, tenant, issuer, target,
  original issue operation, redeem operation, audit and consumed anonymous
  RESET_REDEEM receipt/challenge digests. Reciprocal deferred checks reject
  committed evidence without a consumed row and any consumed row without
  matched evidence. This is **provenance structure only**, not proof of raw
  bearer possession or proof of changed User/session/push rows.
- Migration **130's explicit SQL DENY** for all redeem consumption remains
  installed and untouched. A forged receipt, row ID, stored hash, audit ID,
  staff session DB state, or matching payload digest cannot lift this gate.
- Migrations 131/132 create **no** ordinary runtime EXECUTE, DML, schema,
  member, PUBLIC or generic signer grants. All objects are owned by the
  existing NOLOGIN private proof owner.

## Remaining admission blockers — do not silently remove DENY

1. **Genuine trusted R02 issue ceremony:** actual submitted `vsa1` bearer,
   current session/User/sole-company target and issuer CA membership, active
   Organization, dashboard entitlement, genuine sensitive MFA within five
   minutes, all L1 ADMIT dependencies and stable role/version state. SQL must
   recheck them after ranked locks. UUIDs, stored bearer hash, PHC, or MFA
   timestamps are not a signer. Derive ordered four HMAC keys from trusted
   issuer/target/org/client-address inputs; pre-domain reservation is not a
   substitute for authorization. No purpose-specific R02 signer/writer exists.
2. **Genuine trusted R03 redeem ceremony:** actual submitted canonical 49-char
   `vspr1.` bearer verified against the current unused exact hash/generation;
   trusted new password PHC from validated raw new password. A dedicated
   purpose-specific VAP1 signer must bind the reset UUID/generation/hash,
   current issuer and target eligibility, complete locked current SS/RC/P
   identity sets, expected versions, audit and operation identity in canonical
   signed U2 payload/state bytes. Mere `operation_receipts`/`proof_challenges`
   rows or their digest equality DO NOT establish this. A reviewed narrow SQL
   writer must verify the MAC, hold the accepted rank-01..17 locks, mutate User
   password, revoke all sessions/push, consume reset, append audit and receipt
   in **one COMMIT** before a new forward-only activation migration may replace
   the unconditional migration130 denial.
3. **Public R03 quota authority:** pre-parser client-address attempt (cap 30)
   must count *before* malformed input parsing; canonical credentials add a
   separate cap-5 reservation. The current public `anti_abuse_events` ordinary
   runtime state/cleanup privileges permit quota discount and remain unsafe.
   No trusted purpose-specific reserve/finalizer/ACL cutover is installed;
   SQL-only row IDs cannot prove legitimate IGNORED outcomes.
4. **Actual migration and release evidence:** the original isolated W9
   migration113 history recovery remains expressly **DENIED**; no alternate
   PostgreSQL, Prisma/DDL, Docker or repair route is authorized. Independent
   reviewers must source-inspect 131/132 and the actual previous constraints,
   then, only under a separate explicit PG17 test authorization, verify SQL
   syntax, deferred FK cycles, commit/rollback/expiry at both sides of 900s,
   no partial four-scope insert, two-connection races, effective ACL/overload
   privileges, receipt forgery negatives and old-provisioner/replay denial.
   Node source tests do not replace any of this proof.

W2's five untracked A01 draft directories and historical migrations 1–130
are deliberately unchanged. Prime owns integration, schema documentation and
independent W14/W19 review routing; this branch does not touch those surfaces.
