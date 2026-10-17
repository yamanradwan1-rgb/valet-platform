# VAYLET Issue #300 — U05 Option A local PostgreSQL validation

**Date:** 2026-10-18 (Asia/Amman). **Owner decision:** Option A authorized
**local implementation and testing only**. **Latest tested code commit:**
`5c3f8da2eb4ee939210d9d35fb78dbeb58926783` (U05 migration/proof base
`372e3cf4953a46c9ea5254426173eb456976126a`, earlier clean base
`c375ff9c572d011510f8f8c69934751b7f86fe6f`),
branch `codex/issue-300-prime`, worktree
`D:\kndoom\valet-platform\tmp\issue-300-prime-integration`.

## Result — partial research PASS, complete U05 acceptance BLOCKED

**DO NOT enable U05 unrestricted/production pagination.** The source-cohort
birth-XID migration and direct-reference signed keyset design have passed
**important but incomplete** tests on the disposable G2 database. An
independent adversarial review identified a real **P0 for enabling full U05**:
an old Audit row with an indirect Task/Incident pointer can become correlated
to a Session only after an entity is inserted/linked **after** the original
snapshot. The SQL fixture reproduced this on an actual captured `pg_snapshot`
and a subsequent COMMIT, even though all four event rows have correct birth
markers. Only the source-side parent Task relationship is missing its immutable
historical provenance. Neither Task `created_at`, snapshot timestamp, `xmin`,
nor simple event cursor signing solves this race.

The candidate now includes `audit-investigation-u05-indirect-guard.ts`:
**if a snapshot contains any potentially indirect Audit Task, Incident,
Vehicle or PARKED metadata-task reference in the scoped cohort, Search and
Timeline pagination fail closed with HTTP 503**, without deleting, silently
omitting or misrepresenting any of those records. For Search the check uses the
exact requested event interval; for full-history Timeline it conservatively
checks the whole Location because an unresolved row cannot be preassigned to a
Session. A G2 HTTP test inserts an orphan historic Audit→Task reference and
confirms both overfull endpoints return 503, including when the Task has not
yet been created. The direct-only G2 proof cohort still demonstrates signed
pagination, but **does NOT prove the full source/indirect coverage requirement**.

An additional signed filter digest binds CURRENT Location Incident visibility
to the first page. If Location policy/status changes between requests, the
old cursor is rejected rather than joining a newly visible/hidden Incident
cohort. This does not freeze or grant current permissions: staff session,
membership, MFA, Location, scope and commercial access are independently
reauthorized on every request.

## Dedicated environment and migration/legacy result

- Isolated, task-owned PostgreSQL **17.10** Docker container
  `issue300_g2_pg17`, loopback `127.0.0.1:55480`, database `issue300_g2`.
  Shared `valet` on port 5432 was never used or modified.
- **94/94** Prisma migrations applied to **G2 only**, including forward-only
  `20261018009400_issue_300_u05_birth_xid/migration.sql`. Prior 93 migrations
  remain unchanged. No production/staging migration applied.
- All three newly protected source tables have nullable `xid8`
  `pagination_birth_xid`, DB default `pg_current_xact_id()`, an INSERT trigger
  overriding client NULL/false values, and UPDATE-of-marker immutable
  preservation triggers. Migration uses ordered three-table
  `ACCESS EXCLUSIVE` locks, explicit `BEGIN`/`COMMIT` and a 5s local
  `lock_timeout`; interruption in the disposable copy leaves no partial
  activation. Legacy NULL rows were preserved (each source retained at least
  one old NULL after migration). No synthetic XID backfill.
- Rollback-only low-privilege `NOLOGIN` test writer could SELECT/INSERT but
  could not ALTER/disable trigger, SET replication bypass, UPDATE/DELETE,
  TRUNCATE or become table owner. Forged XIDs and explicit NULLs were ignored
  by the database trigger. This test is **not** a full audit of every live
  production runtime-role/provisioning path.
- API for ordinary preview `127.0.0.1:3161` remains **U05 disabled**.
  Test-only API `127.0.0.1:3162` is gated by all three conditions:
  `NODE_ENV=test`, `ISSUE300_U05_G2_PROOF_ENABLE=1`, and exact DB URL
  `127.0.0.1:55480/issue300_g2`. There is no production on-switch in the
  validated candidate. Dashboard `127.0.0.1:3113/audit-log` unchanged.

## Mandatory proof matrix (§7 original U05-R01–R09)

| Gate | Status | Actual executed subset and missing required proof |
| --- | --- | --- |
| R01 | **PARTIAL** | Three PostgreSQL connections; delayed single transaction with Audit/Custody/Dispatch/Incident, old event times; all four excluded by `S0` after COMMIT, admitted by `S1`. Cross-request **signed** page1/page2 test with held late writer and all four independent sources still required. |
| R02 | **GAP/PARTIAL** | Later `S1` admits rows excluded under `S0`. Distinct pre-capture committed control + earlier-BEGIN/later-COMMIT concurrent writer proof not separately exercised as required. |
| R03 | **PARTIAL; P0 mitigated fail-closed** | Four-source held transaction proves same XID/cohort. Separate real G2 counterexample showed two old indirect Audit references appearing only after post-`S0` Task/Incident writes; query guard now prevents misleading multi-page Search/Timeline. **Full indirect Audit semantics remain unproven.** |
| R04 | **PARTIAL** | Rollback-only copied-three-table DDL race: writer lock blocks activation, lock timeout rolls back all columns; prestarted writer inserts after activation and receives proper XID, old NULLs retained. Operational writers at migration boundary and every legacy transaction type still required. |
| R05 | **PARTIAL** | Explicit aborted DDL transaction, atomic three-table copy, role/trigger abuse denials and fresh marker tests. Fresh 0→94 migrated DB and two concurrent migration runners/upgrade interruption were not independently completed. |
| R06 | **PARTIAL** | Real authenticated HTTP signed Search traversed 6 distinct Sessions in DESC pages and Timeline traversed all four source families with four exact equal-time records in order Audit→Custody→Dispatch→Incident. **100+ Session/100+ single-Session events** still not tested. |
| R07 | **PARTIAL** | Current vehicle make filter on overfull query returns 503; current Location Incident visibility change invalidates signed page cursor; Staff session revocation rejects next page. Changing staff/slot/Incident attributes and active permissions during real writers still require matrix coverage. |
| R08 | **PARTIAL** | Changed HMAC, wrong time window, source purpose, distinct CA/LM staff session denied. JWT-like/opaque signed page bound to original filter, role, viewer and `pg_snapshot`; 512-character snapshot oversize unit check and 15m TTL exist. Actual long active-XID snapshot and deliberately stalled source/timeout HTTP tests remain GAP. |
| R09 | **GAP/PARTIAL; performance concern** | CA/LM real password and TOTP MFA tests, restricted Supervisor/foreign access, scoped SQL and HTTP, and a new **committed then exact-UUID-cleaned** G2 fixture plan with 3,500 Session +900 Custody, 101-result cap: **warm p50 933.93ms, p95 969.80ms**, 20 samples, 3,121,652 shared buffer hits, no physical reads. Not a target-scale PASS. **Actual operational check-in/parking/reassign/retrieval/handoff/Incident writers, 100k/1m skew, cold p95 and writer load** not completed. |

**Disposition:** none of the nine full requirements is marked PASS. The
original T01–T70 ledger's full-acceptance GAP accounting remains binding; the
successful subsets here do **not** upgrade overall T01/T70 to PASS.

## Reproducible proof commands — from Prime repository root

Use the already-verified task-only G2 credential source in process memory and
set `ISSUE300_PG_TEST_URL` to the explicit `127.0.0.1:55480/issue300_g2`
connection. Never log, commit or disclose the password, bearer tokens, or MFA
seeds. The six tests can be run individually with:

```powershell
node apps/api/test/issue300-pg/issue300-u05-trigger-proof.mjs
node apps/api/test/issue300-pg/issue300-u05-rollout-proof.mjs
node apps/api/test/issue300-pg/issue300-u05-privilege-proof.mjs
node apps/api/test/issue300-pg/issue300-u05-late-writers.mjs
node apps/api/test/issue300-pg/issue300-u05-indirect-join-counterexample.mjs
node apps/api/test/issue300-pg/issue300-u05-http-pagination.mjs
node apps/api/test/issue300-pg/issue300-query-performance.mjs
```

All six above **PASS** on G2; the counterexample test's PASS means it
**successfully reproduces the underlying unsafe relationship race and asserts
the new guard rejects it**, not that full U05 is solved. The tests either
ROLLBACK, use an explicit disposable probe schema removed after the test, or
delete precisely generated G2-only UUID fixtures. HTTP tests preserve
test-only G2 user/domain rows; never interpret these as production writers.
The separately listed performance test inserts and **commits** 3,500/900
isolated random-ID fixtures before snapshot capture; after measuring it
deletes those exact ID sets in a verified G2 transaction. It **PASSed its
test harness but not an acceptable target SLA**. The earlier in-transaction
measurement was invalid for U05 since born-XID rows were invisible under S0;
only the committed-measurement numbers above are meaningful.

Targeted additional evidence:

```powershell
pnpm --dir apps/api exec vitest run test/issue300-search --project=api-non-postgres --reporter=dot
node --test apps/api/test/issue300-timeline/*.mjs
node --test apps/api/test/issue300-qa/*.mjs
pnpm --dir apps/api typecheck
pnpm --dir apps/api lint
pnpm architecture:check
node scripts/validation/issue300/verify-live-ui-exceptions.mjs . tmp/issue300-g0/FROZEN_UI_MANIFEST.json
```

Verified: focused search **18/18**, timeline **18/18**, static security QA
**12/12**, TypeScript and ESLint PASS, architecture PASS (only grandfathered
warnings). Frozen Concept A source manifest **119/124 unchanged with precisely
five previously approved nonvisual data-wiring exceptions**; no new UI source,
CSS, behavior, copy, accessibility or Audit Events changes for U05.

## Owner-dependent next decision

**Option A is locally implemented, but insufficient by itself for the complete
U05 guarantee.** Owner must separately approve either:

1. A database-owned, immutable and historically scoped **Task/indirect
   provenance** mechanism (including any Task mutations/identity updates),
   rolled out atomically and tested against the same old Audit phantom; or
2. A separately specified protected/materialized Session-result membership
   snapshot design, with its own retention/authorization/cleanup/performance
   review.

Neither extension is within the approval to add markers to **only the three
named tables**. Do not silently discard indirect Audit evidence, mark source
coverage AVAILABLE when partial, fabricate Task XIDs, or enable production
pagination. All unrelated acceptance work can continue independently.

No push, PR, main merge, deployment, production migration or Issue closure.
