# Issue #276 — DEC-102 canonical Audit discoverability / PostgreSQL budget blocker

**Status: P1 — OWNER INDEX-DESIGN DECISION ACCEPTED (DEC-103); DISPOSABLE POSTGRESQL PROOF / QUERY BUDGET STILL BLOCKING. NO REAL-ENVIRONMENT MIGRATION APPROVAL.**

**2026-10-09 decision update:** The Owner approved the direction of two additional partial `VALET_SESSION_PARKED` Audit indexes (Organization+entity reference and Organization+`metadata_json->>'taskId'`) alongside the existing session index. [DEC-103](../decisions/DEC-103_ISSUE_276_AUDIT_DISCOVERABILITY_VALIDATION.md) defines three bounded evidence lookup arms and strictly limits any index creation and measurement to a **verified disposable PostgreSQL environment** pending separate real-environment migration approval. The older `decision requested` language below documents the historical blocker, not a still-open choice between the recommended indexes. **No PostgreSQL execution, production migration, EXPLAIN, or WIP code commit has occurred as a result of this approval.**

**Later 2026-10-09 measured continuation supersedes the earlier NOT RUN snapshot:** A new, uniquely owned PostgreSQL 17.11 cluster at `127.0.0.1:55449` was positively verified, and all 78 repository migrations plus both Accepted indexes were tested **only on its fresh disposable child database**. The three reference paths detected synthetic null-linked, entity-only, task-only and cross-linked Audit anomalies. **However, the exact production WIP discovery SQL still performs a full sequential scan across 24,105 Audit records on 50/100-session pages despite both indexes.** An index-driven alternative removed that scan but incurred up to 4,000 probes, 16,816 buffer hits and 50.967 ms in the tested dense case. Consequently **P1 remains blocking for a different reason: unproven query cost**, not U-003/DEC-103 policy approval. Full measured evidence: [DEC-103 disposable PostgreSQL experiment](ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md), especially §§4–7. No indexes were installed on shared QA, staging or production; implementation WIP is uncommitted.

**Production Recovery continuation (same date):** the same disposable cluster and child data were reverified, then five distinct three-arm SQL shapes were measured across sparse/dense 50/100-session pages, **three repetitions each, 60 real `EXPLAIN (ANALYZE, BUFFERS)` plans**. All variants returned identical sorted `(auditId, implicatedSessionId)` fingerprints in each of four synthetic regimes. Exact production query median dense100 **49.832 ms** retained a 24,105-row full Audit scan. Batched Task ID `array_agg` removed the full Audit scan and improved sparse pages (median sparse50 **2.556 ms**) but regressed dense100 to **84.749 ms**. A final bitmap planning diagnostic still performed the full Audit scan. **No SQL-only solution proved both a bounded lookup and acceptable dense-history plan. P1 STOP persists at `apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70`.** Full command, median matrix, sorted-pair fingerprints and query shapes are in the linked experiment report §8. No schema/fixture change or new index was made during this recovery continuation.

Date: 2026-10-09. Branch: `fix/issue-276-live-operations-staff-history`.
Accepted authority: `docs/decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md` §§4–6, especially lines 41–43, 48–59.
Source starting point: `6073df68569e3829d37b6ac6415a29a0c098b412`.

## Verified static evidence

**Latest Focused P1 Recovery (2026-10-09):** See ISSUE_276_FOCUSED_P1_RECOVERY_OUTCOME.md for actual A1–A5 PostgreSQL cost decomposition, independent domain and Audit-reference oracle, 16/16 real current-authority concurrency tests, a separately reviewed fix for a Live-only stale-CA MFA error-response oracle, and the remaining query-performance P1. A separate **DRAFT, NOT ACCEPTED** design alternative is in ISSUE_276_AUDIT_QUERY_DESIGN_DECISION_PROPOSAL.md. Current production WIP remains uncommitted; the older snapshots below are historical.

1. `packages/database/prisma/migrations/20260808000700_audit_event_foundation/migration.sql:6-18` allows `audit_events.valet_session_id NULL`, while `event_type`, `entity_type`, and independent `entity_id` are populated without an event-specific CHECK requiring canonical Parking Audit's session reference.
2. `migration.sql:39-43` only enforces the composite Session FK *when the nullable session reference is supplied*. `entity_id` itself is not an exact-scoped Session FK.
3. `schema.prisma:1803-1828` includes an index on `(valet_session_id,occurred_at)` and a general Organization/occurredAt index; no dedicated `VALET_SESSION_PARKED` index on `entity_id` or `metadata_json->>'taskId'`.
4. The existing canonical Confirm Parked writer (`apps/api/src/modules/parking/confirm-parked-audit.ts:37-52`) supplies **both** `valet_session_id` and `entity_id`, exact Organization/Location, the Task ID in metadata, and the shared authoritative event time. A normally written event therefore satisfies the narrow proof. But the table does **not** independently require all those relationships for arbitrary or legacy inserted rows.
5. The uncommitted DEC-102 reader prototype `apps/api/src/modules/dashboard/operational-history-projection.ts` presently finds scoped audits by `audit.valet_session_id = ANY($3::uuid[])`. That can miss a `VALET_SESSION_PARKED` event where `valet_session_id IS NULL` while `entity_id` references an otherwise authorized session (or `metadata_json.taskId` references one of its Tasks). It may then incorrectly classify `NO_RECORD` or `PROVEN` rather than `UNVERIFIABLE`.

This is a **source-proven discoverability gap in a proposed read algorithm**, not proof that any real QA/production AuditEvent is corrupt. No real Audit rows, plates, staff IDs or customer records were inspected.

## Why this blocks the Accepted feature

DEC-102 requires fail-closed treatment of missing, orphan, duplicated and malformed canonical Audit evidence **before** selecting the Parked By actor. With nullable linkage, a `valet_session_id`-only indexed query cannot discover every in-scope contradictory event. A speculative `OR entity_id=...` or `metadata_json->>'taskId'=...` scan may widen Audit reads or cause unbounded index/sequence scans. Page size `limit+1` does not cap this historical scan.

An authoritative, safe answer needs *both* (a) an explicitly accepted definition of which malformed Audit references count as in-scope evidence and (b) measured efficient access paths. A random per-session candidate limit, migration, trigger, data repair or untested fallback is **not authorized** by DEC-102.

## Owner/DB decision requested

**Preferred candidate for investigation, not automatic execution:**

1. Treat canonical Parking Audits as potentially relevant when **any** of these same-Organization evidence references resolve to the authorized session: (a) `valet_session_id=session.id`; (b) `event_type='VALET_SESSION_PARKED' AND entity_id=session.id`; (c) `event_type='VALET_SESSION_PARKED' AND metadata_json->>'taskId'` identifies a scoped PARKING Task. Reject mismatching Organization/Location/Task/actor/timestamp/status/version, including null linkage, as `UNVERIFIABLE`. Do not fetch or project foreign Organization identities.
2. Evaluate a **forward, non-mutating partial lookup index** (or more narrowly justified alternative) such as:

   ```sql
   -- PROPOSAL ONLY. Do not run or add a migration without separate approval.
   CREATE INDEX CONCURRENTLY audit_events_parked_org_entity_idx
     ON audit_events (organization_id, entity_id, occurred_at DESC, id DESC)
     WHERE event_type = 'VALET_SESSION_PARKED';
   ```

   A separately measured narrow JSON `taskId` expression/partial index may be needed for case (c); do not assume the one proposed index addresses malformed `entity_id` with missing session linkage.
3. Alternative: a separately approved forward database constraint enforcing `VALET_SESSION_PARKED` canonical session/entity/scope shape. That requires explicit handling of **existing historical rows**: a NOT VALID constraint protects future writes but does **not** prove old rows satisfy it, and no silent backfill or repair is allowed. Any validation must be isolated and failure-handled.
4. If Owner/security expressly narrows *relevant anomalous evidence* to trusted `valet_session_id=session.id` rows only, record the loss of visibility for null-linked/orphan Audit and reconcile this with DEC-102 §4–5 **in an Accepted amendment**. Do not have implementation silently adopt it.

**Needed proof before unblocking:**

- Verified isolated/disposable PostgreSQL connection, never an unidentified localhost or shared QA database.
- The proposed exact Organization/Location/page-first lookup with sparse and history-heavy, malformed/null-linked/orphan, duplicate, contradictory Task and event fixtures.
- `EXPLAIN (ANALYZE, BUFFERS)` for 50/100 page sizes, both candidate lookup arms and worst-case history. Record buffers, plan nodes, rows and latency/query budget.
- SQL row-cardinality/authorization tests and concurrency with the actual entitlement/Staff Session/Location-grant revoker; no read-side Task/Session/Event mutations.
- Three independent final reviews on the **actual production diff** once the blocker is resolved.

## Work-in-progress and validation truth

This continuation developed **uncommitted, unshipped** contract, API reader, authorization, Dashboard and unit-test prototypes under the isolated #276 worktree. The canonical projection's **15/15 non-PostgreSQL synthetic tests** passed; Live-only strict contract **5/5** and existing Contracts **3/3** passed; purpose-bound API cursor **2/2** passed; fake-transaction API service **3/3** and auth **5/5** passed. API/Contracts/Dashboard TypeScript checks were reported PASS at the current prototype. Dashboard worker's role and transport tests passed **6/6**, and its baseline synthetic diagnostic **3/3**. These tests do **not** validate real SQL, lock interleavings, EXPLAIN or U-004 pixels.

At the time of this report, `TEST_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_URL` and PG* environment variables for a verified disposable DB were absent. PostgreSQL 17 on localhost was discovered, **but not verified as a disposable authorized target**, so **no SQL queries, migrations or fixtures were run there**. No physical QA, browser screenshots, production deployment or schema changes were attempted.

**STOP boundary:** do not commit/push the unverified production prototypes, open a PR, fast-forward merge, deploy, alter schema or close Issue #276 until this focused decision and measured evidence are resolved. The existing accepted DEC-102 remains Accepted; only this implementation proof is blocked.
