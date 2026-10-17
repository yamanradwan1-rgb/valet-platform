# Issue #300 U05 — Cross-source snapshot / pagination decision

> **2026-10-18 Owner continuation:** Option A subsequently became **approved
> for LOCAL IMPLEMENTATION/VALIDATION ONLY**; this W3 source-only report below
> is historical and retains its original findings/authority. Prime implemented
> new forward-only migration 94 and test-only signed pages on G2, with
> **partial** U05 evidence under code `372e3cf4953a46c9ea5254426173eb456976126a`.
> New real PostgreSQL counterexample: indirect Audit Task/Incident links can
> change membership after the captured snapshot. The current candidate safely
> refuses unstable paginated cohorts; unrestricted U05 stays BLOCKED pending
> separate Owner approval of immutable Task/link provenance or protected
> result materialization. See `U05_OPTION_A_LOCAL_VALIDATION.md` for R01–R09
> statuses and exact test commands. NO production activation authorized.

**Decision date:** 2026-10-17 (Asia/Amman)

**Investigated tree:** `codex/issue-300-followup-w3`, baseline `6213fe1d2b7389c3cf07d4902d1417b81fd1b2f6`

**Mode:** source-only, read-only investigation; **NO PostgreSQL, migration, writer or HTTP execution**.
**Status:** **BLOCKED FOR STRONG PAGINATION / CONDITIONALLY RECOMMEND ADDITIVE MIGRATION FOR SEPARATE PROOF**. This document is an engineering evaluation, **not** an Accepted DEC, deployment authorization, migration or runtime acceptance.

## 1. Decision and guarantee boundary

**Reject enabling multi-request, cross-source snapshot-stable pagination in the current schema.** Preserve the existing fail-closed behavior until Prime obtains a task-owned PostgreSQL runtime, demonstrates the races below, approves a forward-only/atomic rollout, and validates real HTTP/cursor semantics. No timestamp-only cursor, `xmin`, high-water UUID, offset, or reconstructed historical XID is an approved substitute. Master Plan §§16, 18, 29, 32 condition U05 on proof, not on mere code completeness.

**Preferred candidate, not executable approval:** add database-owned immutable `pagination_birth_xid xid8` on **`key_custody_events`, `dispatch_events`, `incidents`** by a new forward-only migration. Follow the audited migration-45 pattern for already-fenced Audit/Session, prove atomic activation and legacy cohort, and filter *every* source using a first-request captured `pg_snapshot`. A successful experiment would establish **stable membership/order of persisted immutable event records as of the captured snapshot**, subject to the stated time window and currently authorized scope—not frozen employee/vehicle/slot labels, Incident status, current identity filters, authorization or a complete real-world custody narrative. A later search-to-timeline navigation does **not** share a snapshot unless explicitly authenticated/bound as such.

**If safe activation, legacy NULL cohort, or concurrency guarantees cannot be proven:** reject this migration candidate and keep pagination unavailable; ask Owner/Prime for a separately approved **truthfully weaker live-pagination** design or another persistence design. Do not quietly switch to timestamps. No database/schema/code changes are authorized by this worker task.

## 2. Facts observed in repository (source, not runtime)

| Subject | Source inspected and observed state |
| --- | --- |
| Snapshot machinery | `apps/api/src/modules/management/management-pagination-snapshot.ts:53-64` captures `clock_timestamp()` and `pg_current_snapshot()::text` in one SELECT; `:66-110` HMAC-signs/compresses opaque cursors. This does **not** export or hold the server transaction open across requests. |
| Cursor contracts | `apps/api/src/modules/management/audit-investigation/audit-investigation-cursor.ts:77-157` binds purpose, Location, Organization, precise staff session/role and normalized filter digest; `packages/contracts/src/audit-investigation-common.ts:77-116` carries snapshot, boundary, 15-minute expiry. Signatures are not authority: authorization must be rechecked each request. |
| Audit/Session | `packages/database/prisma/schema.prisma:2236-2261,1020-1041` models nullable `paginationBirthXid` on AuditEvent and ValetSession only. `packages/database/prisma/migrations/20260919004500_mgt_fix_02_pagination_snapshot_membership/migration.sql:1-47` adds `xid8`, database defaults, INSERT/column-UPDATE preserving triggers. Existing legacy NULLs are not backfilled. |
| Custody/Dispatch/Incident | `schema.prisma:1155-1174,1205-1226,1762-1784`: all have source UUID, exact Org/Location/Session and event/insertion timestamps, but **none has a birth-XID marker**. Incident is a mutable current row; its only historical event from that row is **creation**, not later transitions. |
| Documentation drift | `docs/03_DATABASE_SCHEMA.md:1379-1392` lists `key_custody_events.pagination_birth_xid`, contradicting both Prisma and applied migration source. Documentation cannot authorize querying a nonexistent column; Prime must reconcile in its separately owned schema-doc change. |
| Search read | `search/search-witness-sql.ts:12-93`: Audit arm checks `created_at <= $9` **and** birth visibility against `$10::pg_snapshot`; Custody, Dispatch, Incident check time cutoff **only**. `search/search-page-query.ts:41-123` computes grouped witness summaries, ordered `last_at DESC, session.id DESC` with `limit+1`. |
| Search protection | `search/audit-investigation-search.service.ts:49-110`: denies any cursor and fails with coded 503 `AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE` if more than requested `limit`. Suggestions likewise refuse cursors. This is a **bounded first-page facility**, not full pagination. |
| Timeline read | `timeline/timeline-source-query.ts:28-175` reads the four families in a **single SQL statement** with `ORDER BY occurred_at ASC, rank ASC, id ASC` and global `limit+1`; **no source birth filter is applied**. `timeline/timeline-read-service.ts:77-119` refuses cursors and overfull first pages with coded 503 `AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE`. It reads Session, Location, source rows and then wall-clock time in separate statements, so its returned `snapshotAt` is **not an across-statements MVCC snapshot certificate**. |
| Transaction model | `apps/api/src/common/database/postgres-transaction.ts:12-68` uses `BEGIN` and `COMMIT` without `REPEATABLE READ` or a long-lived exported snapshot; normally each READ COMMITTED statement sees its own current database snapshot. CA's `last_admin_activity_at` security-session update is allowed even though evidence/domain reads are otherwise read-only (Plan §17). |
| Safe transport | `apps/api/src/common/http/api-errors.ts:28-31,148-150` maps both pagination-unavailable codes to HTTP 503 with a safe non-disclosing message. No next cursor is manufactured on an overfull response. |
| Provenance of prior tests | `docs/validation/ISSUE_300_INTEGRATION_REPORT.md:36-58` reports focused mock/static suites, **not** actual Issue #300 DB, writer, HTTP, two-connection races or performance. Owned isolated PostgreSQL provisioning was blocked; shared `localhost:5432/valet` was not used. |

**Nuance:** Each individual SQL SELECT reads a consistent PostgreSQL statement snapshot; the sequence of separate SELECTs, or first-page response plus a later request, does not acquire that property automatically. First-page search can see a late commit in a non-Audit arm between the snapshot-capture SELECT and the following search SELECT despite the timestamp cutoff. First-page timeline has no persisted snapshot fence at all. Therefore `nextCursor: null` means *no additional page was returned*, not a promised immutable cohort or timeless investigation.

## 3. Concrete race: time cutoff and keyset are insufficient

Suppose `limit=1`; first request captures `S0` at T2, using event timestamp `occurred_at` and `created_at` predicates. `created_at` may be PostgreSQL `now()` (transaction start), database operation time or application time, **not commit time**. The following is possible without a persisted immutable birth transaction:

| Moment | Connection A — operational writer | Connection B — first page | Connection C — subsequent page |
| --- | --- | --- | --- |
| T0 | `BEGIN`; INSERT Custody/Dispatch/Incident for authorized Session with `occurred_at = T0`, `created_at <= T2`; **do not commit** | — | — |
| T1 | Still open; insertion transaction not visible | — | — |
| T2 | Still open | Capture DB snapshot `S0`; read first page, excluding uncommitted A; keep first keyset boundary | — |
| T3 | `COMMIT` | — | — |
| T4 | — | — | Ordinary READ COMMITTED sees A's row; its old timestamps pass `<= T2` and it may fall **beyond** the first-page boundary, appearing as a phantom. Or it falls **before** the boundary, making records permanently skipped by this cursor. |

The visible committed-row set has changed, and an old timestamp / high-water `id` cannot distinguish an active transaction at T2 from a transaction committed before T2. A first page can similarly have different source composition if the commit happens between separate capture/query statements.

With correctly preserved `birth_xid = pg_current_xact_id()` and a captured `S0`, the admission test is **`pg_visible_in_snapshot(birth_xid, S0)`** for all four families and the Session creation cohort where required. Transaction A's birth XID is **not visible in S0 even after T3**; later requests still reject it. Transactions committed before capture remain candidates. Snapshot visibility and source timestamps are **separate conjunctive filters**.

This describes the intended PostgreSQL semantics; this run **did not execute or measure** them.

## 4. Required strong-pagination design invariants (not implemented)

1. **Immutable source birth:** INSERT trigger assigns each new source row's top-level XID8, ignores client-supplied values, and UPDATE safeguards prevent both mutation and nulling. Existing source history cannot be rewritten or attributed to another Session. Legacy rows remain NULL; never derive a fabricated birth value from `xmin`, commit timestamp, `created_at`, `ctid` or current XID.
2. **Atomic rollout cohort:** a migration must make adding the column, default, and trigger effective atomically on **each of the three tables** with controlled lock acquisition. Prevent even one writer from committing a post-activation NULL row. Prove every NULL row on those tables was committed before the first allowed post-activation `S0`, including writers blocked in flight on table locks. If this cannot be proven, **do not permit NULL-as-visible**: fail strong pagination closed. No backfill; no optimistic exemption for concurrent deployments or a partial migration.
3. **One captured boundary:** use one validated `pg_current_snapshot()` and wall-clock cutoff for all source arms of the **same search/timeline read**, bind them to the signed purpose/scope/normalized filters/session/last tuple; reuse the captured `pg_snapshot` value on subsequent requests, not `pg_current_snapshot()` again. Time window `[from,to)` is search-only; timeline spans all available Session history unless separately authorized. Page 2 must not silently refresh snapshot.
4. **Every source fenced:** Audit, Custody, Dispatch, Incident and the Session parent as needed must apply an equivalent source-birth visibility predicate **before** grouping/counting and global keyset pagination. Never use Audit visibility to imply another source is visible; `UNION ALL` keeps independent source IDs. Current Location Incident visibility can change with authorization/policy and must be checked again.
5. **Global deterministic order:** search summary is computed from the exact fenced witness set before `(lastMatchedAt DESC, sessionId DESC)` keyset. Timeline compares `(occurred_at ASC, sourceRank ASC, UUID ASC)`, with ranks Audit=0, Custody=1, Dispatch=2, Incident=3; use PostgreSQL UUID ordering, not locale text ordering. Equal timestamps and Audit/Incident twin facts must not collapse. Strict `limit+1`, max 100; no offset or unsafe per-arm truncation.
6. **Mutable fields excluded from frozen claim:** vehicle Make/Model/Plate and staff/slot labels are CURRENT; Incident status and current Session state are CURRENT. U03 vehicle-filter matches can change between pages. A tested revision/restart scheme or explicit non-frozen current-identity filtering disclosure is required; birth fencing alone cannot make filtered *Session result membership* stable when current filters change. Historical immutable witness membership is a narrower claim.
7. **Authorization and lifetime:** re-authenticate/re-authorize current CA/LM membership, exact staff session, Location/grants, MFA and commercial policy **on every page and point detail**. Purpose/domain HMAC binding cannot replace that. Reject expired/wrong-filter/wrong-Session cursor. The schema's `databaseSnapshot` length cap (512) and signed transport max (4096) require fail-closed tests under many active transaction XIDs; no truncated or partially signed snapshot.
8. **No hidden write/retention effects:** never update domain/event records in reads, synthesize custody events, hold multi-request DB transactions or expose raw metadata. Current CA activity touch remains the existing explicit exception. A source query error aborts the page, never reports three of four as complete.

## 5. Migration/activation option versus alternatives

| Option | Assessment |
| --- | --- |
| **A. Forward-only nullable XID8 + database default and trigger, on three missing sources** | **Preferred conditional research candidate.** Reuses migration 45's source-time vs insertion-transaction separation and leaves historical NULLs untouched. Must prove atomic lock/activation and privilege gates, then code/query and load/HTTP acceptance. Do **not** execute just because U05 conditionally allows it. |
| B. Timestamp-only, stable UUID/keyset, max-ID, offset | **Reject for strong snapshot claim.** All admit late commits/phantoms or skips with old event times. |
| C. Read row `xmin` / `ctid` as durable insert identity | **Reject.** Tuple MVCC identity changes on UPDATE/VACUUM/freeze; not an independently persisted immutable insertion fact. No blanket adoption of transaction-ID inference from old rows. |
| D. `pg_export_snapshot` or REPEATABLE READ transaction held over pages | **Reject as default.** Requires open backend/transaction lifetime, risks locks, MVCC retention, leakage and worker resource exhaustion; cannot be modeled as a short signed stateless cursor without a separate Owner-approved design. |
| E. Materialized result set / server-side snapshot session | **Not approved.** Creates persistence, retention, cleanup, data security and read authority changes; would need separate proposal. |

**Proposed implementation ownership after proof authorization:** Prime alone reconciles `docs/03_DATABASE_SCHEMA.md`, Prisma's `Unsupported("xid8")?` additions, forward-only migration and runtime-role provisioning verification; W2/W3 then add consistent source-birth predicates + signed keyset; W7 runs independent DB/HTTP/writer/race/load oracle. No old migration rewrite, no trigger installation in this investigation.

## 6. Rollout, permissions and operational risk gates

- **Preflight:** freeze candidate SHA, require owned disposable DB/migration role and exclusive lease, inventory all writers and transaction boundaries for three tables, inspect existing NULLs, trigger/function/index catalog, migration status, database major version and role grants. Block if database identity/ownership cannot be proven. Never touch shared port 5432.
- **Transaction/locks:** design an all-or-nothing forward migration and prove that each `ALTER TABLE` and trigger activation establishes a write barrier until COMMIT; record exact lock modes, acquisition order across tables, writer contention/timeouts and impact on live task latency. A preexisting INSERT transaction must commit/rollback before the DDL can cross the barrier, or its post-activation insert must be trigger-marked. Stage activation must not leave a mixed epoch available to readers. No long running production migration without an approved online strategy.
- **Historical NULLs:** old rows stay NULL. Demonstrate post-rollout NULLs cannot arise from current runtime role, background writer, replica, maintenance process, ORM, explicit column INSERT, trigger disabling or interrupted deploy. Audit operator privilege boundaries; if a bypass path remains, fail closed or require a separately reviewed operational fence. Do not mark legacy data `pg_current_xact_id()` retroactively.
- **Privilege shape:** `packages/database/scripts/provision-append-only-tables.mjs:83-95` currently gives Custody/Dispatch **table-level SELECT+INSERT**, denies runtime UPDATE/DELETE/TRUNCATE; `runtime-table-privileges.mjs:17-33` and `incident-runtime-read-privilege.integration.test.ts:191-214` show Incident **SELECT+INSERT** only. A table-level INSERT grant means column marker spoof is syntactically possible; the **database INSERT trigger must overwrite it**. Prove runtime lacks schema/table ownership, ALTER/TRIGGER/REFERENCES/TRUNCATE, privileged function EXECUTE/DDL, and any ability to disable the trigger. Preserve normal writer INSERT ability. The migration role must be separate and privileged only for authorized DDL.
- **Trigger correctness:** adopt or carefully extend migration 45's `management_pagination_preserve_birth_xid()` pattern. Check search_path and function ownership; revoke PUBLIC EXECUTE as already done in migration 45, while ensuring normal INSERT trigger invocation still works. Test inserted explicit false marker, omitted marker, explicit NULL marker, normal insert, attempted update, and legacy NULL preservation. Do not rely on an UPDATE-OF-column trigger to make a new append-only table's privileges safe if maintenance roles can UPDATE other columns: inspect actual maintenance policy.
- **Indexes:** no birth-XID index is automatically necessary: it is a visibility filter, while scoped time and ID order should drive access. Baseline Custody `(valet_session_id,occurred_at,id)`, Dispatch same and `(task_id,occurred_at,id)`; migration 43's Custody scoped time index, migration 44's Dispatch Org/Location/time index (not a complete keyset index), Audit scoped/parked indices. Incident currently only `(location_id,status)` plus PK/FKs. Conditional measurement candidates are `incidents(organization_id,location_id,valet_session_id,created_at,id)`, Custody slot-scoped/time and Dispatch assignee-role/time when justified. **Do not build indexes merely from the design table.** Evaluate `EXPLAIN (ANALYZE,BUFFERS)`, actual time-window selectivity, sort spills and INSERT overhead on 100k/1m skewed disposable records. For live nonempty indexes, follow the repo's separate guarded `CREATE INDEX CONCURRENTLY` rollout pattern; not inside a transactional Prisma migration.
- **Fresh/upgrade/rollback:** verify fresh migrations and upgrade with historical data, mid-rollout termination, concurrent writers and explicit runtime role use. Assert catalog columns/defaults/triggers and behavior after deployment; perform no release until all checks and a DB-backed canary pass. Preferred rollback is **disable investigation pagination/routes in code**, leave additive columns/triggers intact pending separate reviewed cleanup. Never rewrite migrations or delete history.

## 7. Mandatory executable proof matrix for Prime/W7 (all currently GAP)

| ID | Two-or-more connection / migration test on disposable DB | Required result |
| --- | --- | --- |
| U05-R01 | A: BEGIN+INSERT earlier `occurred_at/created_at`, hold. B: capture `S0` and page 1. A COMMIT. C: page 2 with signed `S0`; repeat independently for Custody, Dispatch, Incident and Audit. | Late record excluded on **all** arms even when its order tuple is after the page-1 boundary; no omission/phantom from refreshed snapshot. |
| U05-R02 | A commits before B captures; another writer starts before snapshot but commits after. | First row admitted, second excluded, regardless of event timestamp and transaction begin time. |
| U05-R03 | One writer transaction inserts cross-source Audit+Custody+Dispatch/Incident facts, held around capture; control group committed before capture. | Every record from held transaction excluded consistently; committed group retained; preserved distinct IDs and correct aggregated search counts. |
| U05-R04 | Concurrent row INSERT before migration obtains barrier; migration waits, writer commits or rolls back; afterwards capture new `S0`, INSERT explicit NULL/false XID using normal runtime. | Legacy cohort fully settled before activation, post-activation rows database-marked, no post-activation NULL/forged marker. Timeouts/deadlock handled without partial enablement. |
| U05-R05 | Fresh versus historical upgrade; two migrations overlapping/aborted, new writer during activation; maintenance/runtime/PUBLIC role attempts to bypass trigger/alter privileges. | No broken epoch, no fake backfill, no widened privileges and no unauthorized UPDATE/DELETE/TRUNCATE/TRIGGER/DDL. |
| U05-R06 | Equal timestamp across four sources + repeated UUID patterns from distinct sources; 100+ results in one Session and 100+ search-matching Sessions; page boundaries at ties. | Exact once-per-(source,id), deterministic rank+PostgreSQL UUID order; no duplicates, gaps or unstable aggregates across pages. |
| U05-R07 | Concurrent Vehicle/current name/slot/Incident status revisions and Location activation/authorization/MFA revocation between pages. | Historical insertion cohort remains fenced; current labels clearly CURRENT, filter-change behavior truthful; revoked pages/detail denied, no stale cached data. |
| U05-R08 | Long active-XID snapshot, malformed/expired/other-purpose and staff-session cursor, concurrent policy checks; incident unavailable source errors; timeouts. | Bounded cursor rejects oversized snapshot safely, strict 400 for invalid cursors, 503/appropriate safe unavailable for failed reads, no three-of-four silent completion. |
| U05-R09 | Actual writers for parking/reassign/return/handoff/Incident plus scoped HTTP first/next/detail; EXPLAIN on realistic skew with operational writer traffic. | Writer and read semantics match SQL oracle; verified p50/p95/locks and no cross-tenant data; no fabricated custody. |

**Acceptance discipline:** log the exact test DB identity/lease, PostgreSQL version, schema SHA/migration IDs, role identity, controlled timestamps/XIDs, SQL transcripts, HTTP status/cursor, query plans, concurrency schedule and source-vs-API observations. Unit/static checks alone cannot close any U05-Rxx row. Never claim that successful migration-45 tests of Audit/Session establish race safety for the other three tables.

## 8. Final status and next owner action

- **Observed PASS:** source inspection establishes missing markers on 3/4 event families, signed/bound cursor framework, bounded fail-closed 503 first-page implementation, unchanged scope guards, and a preexisting migration-45 reference design. These are **source-level observations**, not runtime correctness proof.
- **Observed GAP/BLOCK:** real late-commit + upgrade/rollback races; legacy NULL and lock activation proof; all-source snapshot filters, keyset continuations, mutable-current filter honesty, real role/HTTP tests, query plans and performance. This worker created no executable SQL tests because no approved task-owned database exists and the task explicitly requests committing the **document only**.
- **Decision to Prime:** **do not enable strong multi-page search or timeline now**. Reserve and separately review conditional additive birth-XID migration/privilege/rollout design, book an owned PostgreSQL lease, run U05-R01–R09, and only then make an explicit go/no-go decision. If proof fails, obtain an Owner-approved weaker behavior rather than mislabeling timestamp paging as stable.

**Files changed by this investigation:** this document only. **No DB, application, schema, migration, old test or frontend edits; no push/merge/deploy.**
