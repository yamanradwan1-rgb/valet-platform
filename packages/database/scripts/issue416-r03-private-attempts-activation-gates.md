# Issue416 R03 private attempt ledger — SOURCE ONLY, ADMISSION DENIED

**Source delta:** migrations 133/134. Migration 130's unconditional R03
redemption-consumption DENY remains untouched. Neither migration grants
ordinary runtime access, installs a security-definer writer, or makes an
actor UUID, receipt or stored hash into a credential-possession oracle.

## What the source stages

- Two owner-only append-only tables: client IP and canonical verifier attempts,
  in separate registered scopes, with respective caps **30/5** and a **15-minute
  sliding DB-clock window**. HMAC key hashes are 32-byte secret derivatives.
  There is no reference to the mutable public anti-abuse table and no
  IGNORED transition: every successful admission is terminal **COUNTED**,
  including invalid, expired, failed and malformed redemption attempts.
- Unique (audience,request_id) detects same-request retries after unknown
  COMMIT, and unique DB-generated transaction XID permits only one attempt
  per ledger per transaction, stopping same-statement multirow cap bypasses.
- The future counted trigger takes a fixed-scope/key advisory transaction
  lock, rejects non-READ-COMMITTED isolation, applies DB clock, and overwrites
  caller timestamps and XID. Credential attempts must reference a client row
  with exact audience/request/ID, created by a **previous committed transaction**
  and no older than 15 minutes at the later DB clock.
- The first INSERT trigger on both tables unconditionally raises
  VAP1_R03_TRUSTED_BINDER_UNAVAILABLE. The counted trigger is unreachable
  until genuine provenance is established and this DENY is safely retired.
  UPDATE, DELETE and TRUNCATE are denied; owner/DBA bypass remains outside
  the runtime threat model and needs independent review.

## Blockers before operational R03

1. **Pre-parser client provenance.** A real trusted origin/proxy-IP binder must
   commit each client-address attempt on its own short lease **before body
   parsing**, including malformed body and denied origin, using a purpose-
   separated anti-abuse HMAC secret. SQL must never receive raw IP. Unknown
   COMMIT must reconcile the original request ID from a protected read on
   a fresh lease; neither assume rollback nor invent another request ID.
2. **Canonical credential provenance.** Only a real submitted canonical vspr1
   link may cause the separately derived credential verifier HMAC. The
   credential attempt must COMMIT on a second short lease **before any business
   reset transaction**, so a failed/rolled-back domain mutation cannot erase
   either budget. Never use a blind INSERT ON CONFLICT DO NOTHING as evidence
   of a counted attempt; prove an inserted committed row or reconcile.
3. **SQL authority / key custody.** Genuine trusted pre-parser binder,
   canonical signed purpose-specific U2 reset writer and non-generic signing
   authority, proven private SQL ACLs and key custody are all absent. Do not
   grant runtime owner/INSERT/private helper EXECUTE or private schema CREATE.
   The old provisioner grants public anti_abuse_events UPDATE(state,group_key_hash)
   and runtime readiness requires that old privilege for unrelated features;
   revoking it here breaks Staff/Auth. The R03 path must instead use these
   separate protected private ledgers, never the public mutable counts.
4. **Independent PG17 validation remains REQUIRED and NOT RUN:** real ACLs,
   ordinary-role SQL-only negative, trigger ordering, batch inserts,
   simultaneous 29/30/31 + 4/5/6 attempts, 900-second edges, independent
   short transactions, crash/unknown COMMIT, malformed JSON pre-parser routing,
   trusted proxy IP, HMAC custody, full U2 reset/domain mutation and audit.
   No database, Prisma, Docker, SQL migrations, key installation, activation
   or deployment was executed in this source-only branch.

No changes to migrations 1–132, Prime, W2's five untracked A01 drafts or
W9 migration113 recovery (expressly DENIED). This cannot prove operational
30/5 limits or all six reset scopes until the missing binder, ACLs and PG17
tests are independently accepted.
