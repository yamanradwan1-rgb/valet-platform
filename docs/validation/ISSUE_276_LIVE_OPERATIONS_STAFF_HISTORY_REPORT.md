# Issue #276 — Live Operations staff history / Task 5 diagnostic report

**Status: DEC-102 ACCEPTED — IMPLEMENTATION STOPPED AT P1 ORPHAN AUDIT DISCOVERABILITY / UNMEASURED QUERY COST.**

**2026-10-09 decision update:** The Owner accepted the six recommendations for Issue #276; binding [DEC-102](../decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md) selects name-only historical read-time identity, Live-only API excluding Vehicles, exact CA/LM session-in-transaction reauthorization, paired Task/Dispatch/Audit proof with actor agreement, conservative event-time tie/conflict handling, and three-valued provenance. The later diagnostic paragraphs and original STOP/status table below are a **historic pre-acceptance snapshot**. No production query/contract/UI, database tests or U-004 approval was added by this documentation-only acceptance.

Date: 2026-10-09. Source repository: `veletpro0-lgtm/valet-platform`; exact fetched `origin/main` and isolated branch base SHA: `698bcb6044f72844008ffa49ef085f11471f53e1`. Issue remains **OPEN**. Working branch `fix/issue-276-live-operations-staff-history`; worktree `D:\kndoom\valet-platform\tmp\issue-276-worktree`. Final pushed commit SHA is recorded by the final handoff/branch after commit, not inferred from this self-referential document.

## 1. Real observation versus reproduced proof

The original 2026-10-08 read-only **local QA observation** is authoritative historical issue evidence, **not** a fresh 2026-10-09 database verification: two PARKED vehicles (KIA K4 and BMW X4) displayed `Unassigned`; both ValetSessions recorded known Check-in membership and a real COMPLETED PARKING Task with historical assignee; both had null current session assignee and no active Task. No source data was missing or repaired. Original plate/staff identity evidence is intentionally omitted here.

A synthetic Dashboard diagnostic fixture reproduces *the current wrong presentation*, with two synthetic PARKED entries whose existing `activeTask=null` and two distinct synthetic vehicle labels. It does not assert that the API has historically resolved a name: current public contract cannot represent that fact. Assigned and queued/unassigned Retrieval examples independently check current assignee semantics. **No actual local QA GET was performed in this run.**

**DTO truth limitation:** two nullable historical name keys alone cannot prove whether `parkedBy:null` means no verified Parking completion or an unprojectable actor on a proven completion. The U-003/U-004 proposals now flag a separate minimum provenance decision; a null name must not create a fictitious "Parked By" event.

## 2. Exact root cause, proven against current source

| Layer | Evidence | Consequence |
|---|---|---|
| API query | `apps/api/src/modules/dashboard/overview-sessions-query.ts:129-138` | Current-task lateral restricts statuses to QUEUED/ASSIGNED/ACCEPTED/IN_PROGRESS; correctly excludes COMPLETED |
| API mapping | Same file `:146-152` | A null current Task becomes `activeTask:null`; no independent historical facts |
| Active identity | `operational-assignee-projection.ts:3-20` | Subject current Location grant + active task state; unsuitable for inactive historical actor |
| Strict contract | `packages/contracts/src/location-overview.ts:25-31,40-72` | No checkedInBy/parkedBy, rejects extra keys |
| Table | `apps/dashboard/src/features/operations/live-operations/live-operations-table.tsx:42-50,126-130` | Universal header Assigned To and current Task assignee only |
| Drawer | `session-drawer.tsx:40,65-72` | Same current-only assignment and linked email row |
| Formatter | `operational-staff.tsx:9-16` | Null current assignee becomes Unassigned, not historic Parker |

There is **no legitimate reason to backfill** `valet_sessions.current_assignee_membership_id` or relabel a completed Task as active. The correct eventual read has three roles: `checkedInBy` (session recorded check-in), `parkedBy` (proven completed Parking), and `activeTask.assignee` (current task). Their source and security policies must not be conflated.

## 3. Critical second root risk — Task completion chronology is unproven

The owner plan suggests latest completed Parking by `task.updated_at DESC, task.id DESC`. **This cannot yet be accepted as canonical.**

- `Task` has `updated_at` but no `completed_at` (`packages/database/prisma/schema.prisma:1127-1153`). `confirm-parked-mutations.ts:10-25` sets COMPLETED, `updated_at=operationTime`, leaving historical task assignee intact.
- Supported application dispatch commands normally reject terminal Task status (`dispatch-types.ts:5-18`, `task-mutation.ts:14-51`).
- **Nevertheless**, the Task table has no terminal-update immutability trigger in its task migration; runtime-role tests successfully perform direct `UPDATE tasks ... updated_at=transaction_timestamp()` (`packages/database/src/task-dispatch-runtime-role.integration.test.ts:103-121`). Task `updated_at` is therefore **not** an immutable completion instant at the actual database privilege boundary.
- A later Task write could reorder previously completed Parking Tasks. Per owner Task 5 stop rule, **no task.updated_at-based selection was implemented**. No imaginary `completed_at`, new migration or index was added.

### Proposed canonical alternative (**NOT YET ACCEPTED**)

Accepted DEC-037 Confirm Parked (`docs/decisions/DEC-037_CONFIRM_PARKED.md:489-545,680-697`) requires one COMPLETED `DispatchEvent` and one `VALET_SESSION_PARKED` AuditEvent atomically with the Task transition, all at the same authoritative operation time. `confirm-parked-command.ts:158-170,189-201` and `confirm-parked-audit.ts:24-52` implement these writes.

Prefer a reviewed, one-row-per-session **completion-event-derived** selection, using `dispatch_events` because its `task_id` has an exact Organization/Location/Session composite FK (`20260812002000_phase3_task_dispatch_persistence/migration.sql:127-131`) and indexes `(task_id,occurred_at,id)` and `(valet_session_id,occurred_at,id)` (lines 97–101).

**Proposed selection constraints:** match exact session Organization, Location, ValetSession and Task; Task `task_type=PARKING`, `status=COMPLETED`; DispatchEvent `event_type=COMPLETED`; order valid completion events `occurred_at DESC`, deterministic Task ID / event ID tie, `LIMIT 1` only after integrity checks. Derive historical Parker from the accepted canonical completed-event actor/newAssignee *if the owner accepts that provenance*, rather than trusting a mutable Task assignee. The Black Box `VALET_SESSION_PARKED` could serve as an additional coherence check if performance and JSON task metadata relationship are verified.

Do not blindly assume one event: `dispatch_events` is append-only for the normal runtime role (`task-dispatch-runtime-role.integration.test.ts:124-171`) but a DB unique completed-event constraint was not found. Design must fail closed on missing/conflicting/duplicate completion evidence and validate the accepted event-pair invariant. A completion-event ordering policy, provenance choice, and SQL performance need **separate focused Owner/security acceptance** before code.

## 4. Authorized viewer and historical subject policy

Existing `authorizeDashboardReadLocation` is called first at `overview-sessions-query.ts:75-84`, with `LOCATION_DASHBOARD_READ`; session predicates include Organization, exact Location, state (`:92-101`). Current keyset cursor binds Organization/Location/filter and orders `session.created_at DESC,session.id DESC` (`:86-106,141-143`). These must remain unchanged.

Current LM scope checks active User, membership, Organization, Location, present Location grant, and entitlement (`dashboard-location-authorization.ts:13-54`). CA path uses Staff context, MFA and current persisted Management authority (`dashboard-read-authorization.ts:58-89`); commercial requirement is `DASHBOARD_ACCESS` (`:37-46`). No viewer read permission is granted by historic actor identity.

`docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md:173-205` establishes a **Shift-history-specific** precedent for read-time names/disabled historic staff, but not the new Live Operations projection. See **`ISSUE_276_U003_HISTORICAL_IDENTITY_SECURITY_PROPOSAL.md`**. Proposed minimal strict nullable name-only DTO suppresses historical emails/IDs, with current source-scoped viewer authority and authorized inactive historical subjects; **DRAFT — NOT ACCEPTED**.

An independent read-only security review of the first U-003 draft identified two important gaps: Location Manager Staff session revocation is not rechecked inside the current Dashboard read transaction, and the shared SessionOverview DTO also serves Vehicles. The proposal now records both as **mandatory scope/security acceptance questions**, not implemented claims. No production contract, API query, public identity field, Dashboard staff selector or UI copy was changed. U-004 pixel/copy approval is independent and pending.

## 5. Candidate bounded query and validation matrix

The existing query uses one authorized session page, fixed `LIMIT+1` and one active-task lateral. A future completion-event lateral must return at most one fact per authorized session and preserve the original outer sort/cursor/filter/count. No global User join, client directory fetch, uncapped Task/history scan, or N+1 lookup is allowed.

Required PostgreSQL disposable test cases after gates: two PARKED synthetic cases; distinct/same Checker and Parker; completed Parking plus assigned/queued Retrieval; newer cancelled Parking; no history; multiple completed Parking Tasks and exact timestamp ties; duplicate/missing/conflicting completion events; wrong Org/wrong Location task/member; subject inactive/grant lost/missing names; viewer LM grant/session revocation, CA MFA, Location inactive, Dashboard entitlement loss; exact row/cardinality/cursor parity, zero mutations, zero extra audit/dispatch writes. Synthetic fixtures only.

**PostgreSQL and EXPLAIN: NOT RUN.** No `TEST_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_URL` or known disposable credentials were supplied to this isolated worktree. `psql` is not on PATH, although independent read-only host inspection found a PostgreSQL 17 installation and a ready localhost service. **Neither availability nor `pg_isready` proves an isolated disposable database, access rights or task authorization**. No database connection, test setup, migration, query or performance run was attempted. The required `EXPLAIN (ANALYZE, BUFFERS)` and index/latency comparisons must be executed against a proven disposable PostgreSQL instance after Owner approval of completion event ordering. Existing task indexes are not efficiency proof. No production/shared QA write operations were attempted. The Accepted DEC requires an atomic **writer** pairing of Dispatch COMPLETED and canonical Audit VALET_SESSION_PARKED; whether every history reader must additionally JOIN the audit row is an unsettled query-security/performance design question, not an Accepted mandate.

## 6. Current baseline tests and safe synthetic reproduction

At clean base `698bcb60`:

| Command | Actual result |
|---|---|
| `pnpm --filter @valet/contracts exec vitest run src/session-overview-query.test.ts` | **3/3 PASS** |
| `pnpm --filter @valet/dashboard exec vitest run src/features/operations/live-operations/live-operations-presentation.test.ts` | **7/8 PASS, 1 pre-existing FAIL** |

The stale baseline test expects generic `Assigned` / `مسندة` at `live-operations-presentation.test.ts:100-127` when current `operationalStaffName` correctly produces the #241 canonical name `Lina Haddad`. Do not change shipped formatter semantics to appease it or blanket-update snapshots. Revisit the test assertion only under an accepted presentation contract.

Added a **diagnostic-only** `apps/dashboard/src/features/operations/live-operations/issue-276-baseline-diagnostic.test.tsx`, using synthetic IDs/history and production-table **server-rendered markup** to prove existing current-only display. This is **not** a mounted browser test or a test of a non-implemented historical API projection. It must be replaced by approved history/contract/mounted/E2E cases when implementation becomes authorized.

See final handoff for the exact diagnostic/test, typecheck, lint, architecture and `git diff --check` outcomes. No scope-data or screenshot claims are inferred from a unit test.

### 2026-10-09 focused static validation

| Gate | Actual result |
|---|---|
| Synthetic #276 table SSR diagnostic | **3/3 PASS** (after correcting a test-only vehicle-label expectation) |
| Synthetic #276 canonical writer SQL-call witness (no PostgreSQL) | **3/3 PASS** — validates existing Task update guard and writer SQL args/event-pair shape, NOT reader correctness or DB uniqueness |
| Scoped ESLint on new diagnostic | **PASS** (zero warnings) |
| Prettier on diagnostic file | **PASS** after formatting |
| `@valet/contracts` typecheck | **PASS** |
| `@valet/api` typecheck | **PASS** |
| `@valet/dashboard` typecheck | **PASS** |
| Whole Dashboard lint | **FAIL on existing unchanged files**: 9 errors / 3 warnings in selected-management-shell-transition, selected-management-shell, location-switch-menu, use-location-switch-epoch-guard and use-location-switcher |
| `pnpm architecture:check` | **FAIL on existing unchanged files**: `packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts` 328/300 lines, and `packages/employee-client/src/employee-shift-presence-local-provenance.test.ts` portable Employee global boundary; additional existing grandfathered oversized-file warnings |

These global failures were reproduced in the isolated source baseline; **no affected lint/architecture paths were edited for #276**. No failing global test was reported as green. Focused code formatting, tests and typechecks did pass.

### Continuation engineering evidence

The more specific `ISSUE_276_CANONICAL_PARKING_COMPLETION_EVIDENCE.md` reconciles Accepted DEC-037/068 writer invariants with Task DB mutability, append-only-but-INSERT-able Dispatch/Audit history, exact Task/event FK, paired Audit metadata and missing/duplicate/tied event cases. A **Task-first** candidate scan (include completed Tasks without any Dispatch event), evidence cardinality/coherence aggregation and fail-closed result must precede choosing a Parker; an event-first JOIN could falsely select an older employee when a newer Task lacks event evidence. A page `LIMIT+1` does not prove historical per-session scan bounds, and the audit metadata JSON lookup has no measured cost proof. Whether a hard per-session history cap is needed remains a separately reviewed performance/domain choice. Proposed chronology and Parked By source are **not yet Accepted**.

The **recommended** U-003 packet now favors a separate, strict, Live Operations-only history response so Vehicles does not receive extra historical PII through the shared `SessionOverviewEntry`. It proposes names-only read-time identity and explicit `PROVEN/NO_RECORD/UNVERIFIABLE` completion evidence, but nothing is implemented or silently approved. Exact Staff session lock/recheck must occur before CA MFA/session locking in the same read transaction; existing LM location dashboard reads do not yet provide it. Independent security/DB/UI design review identifies these as pre-implementation gates, not current fix verification.

## 7. UI freeze, scope replacement and QA

`live-operations-page.tsx:28-34` keys the active content by `scopeKey`; `:68-82` passes scope-sensitive keys to `useAuthoritativeRead`. Scope generation and request teardown require focused mounted tests **after** newly protected history is introduced. **Vehicles currently reuses the same `SessionDrawer`**, so any future extra facts must be guarded to the explicitly approved Live Operations surface or receive separate Vehicles approval. Strict new nullable required fields also need coordinated client/API rollout to avoid breaking older parsers. Maintain same six-column layout, existing drawer FactList, EN/AR, Light/Dark, RTL/LTR, dense rows and unchanged Retrieval Queue. Exact strings, changed fact placement, and Owner acceptance matrix are documented in **`ISSUE_276_UI_VISUAL_REVIEW.md`**.

**Visual screenshots: NOT CAPTURED; U004_VISUAL_PENDING.** **Authorized local QA GET: NOT RUN; LOCAL_QA_PENDING.** Neither original customer plates nor employee identities were exported. Task/Session/Audit/Dispatch data mutations: **ZERO** in this diagnostic scope.

## 8. Deliverable status / stop gates

| Gate | Status |
|---|---|
| 276-A source/root cause | PASS (source + synthetic baseline proof) |
| Existing current assignment separated | PASS (source and synthetic current-task cases) |
| Task terminal chronology | **BLOCKER** — `tasks.updated_at` mutable at DB boundary; event-based alternative awaits acceptance |
| Issues272–278/U-003 historical identity policy | **DRAFT — NOT ACCEPTED** |
| 276-C Backend/contract identity projection | **NOT IMPLEMENTED — gated** |
| 276-D UI change | **NOT IMPLEMENTED — gated** |
| Issues272–278/U-004 exact visual sign-off | PENDING |
| PostgreSQL isolation + EXPLAIN | NOT RUN |
| Authorized local QA | NOT RUN |
| Completed Parking reader and public history identity DTO | NOT IMPLEMENTED — formal policy/chronology approvals pending |
| PR / merge / deploy / migrations / Issue closure | **NOT PERFORMED** |

Independent reviewer findings and exact final validation are supplied in the final Task 5 handoff. No claim of complete fix, real-device verification, PostgreSQL execution or independent security PASS is made merely from this diagnostic.

**Historical snapshot above:** original pre-DEC-102 U003/chronology approval warnings were superseded by Accepted DEC-102. The following continuation records the later, *different implementation-time* blocker.

## 9. DEC-102 authorized implementation continuation, stopped at new P1

**Source:** Accepted DEC-102 / branch HEAD `6073df68569e3829d37b6ac6415a29a0c098b412`; current `origin/main` `698bcb6044f72844008ffa49ef085f11471f53e1` unchanged; primary Owner checkout dirty files preserved. An isolated #276 worktree has **uncommitted, unshipped prototype changes** in the Live-only strict Contracts, API read, shared-page transaction refactor, purpose-specific Staff-session authorization, history projection and Live-only table/drawer. Existing Vehicles response and Retrieval Queue are intended to remain unaffected, but final integration/parity is **not** established without PostgreSQL and mounted/E2E evidence.

**P1 blocker:** canonical Audit table allows `VALET_SESSION_PARKED` rows with null `valet_session_id` but `entity_id` equal to an authorized session or `metadata_json.taskId` referring to its Task. `audit_events(valet_session_id,occurred_at)` index cannot discover these with the prototype's current indexed scan, so an orphan/contradiction could be missed, violating DEC-102 §§4–6. No approved or proven bounded partial index or PostgreSQL query plan is available. **Separate decision-ready proposal:** `ISSUE_276_DEC102_ORPHAN_AUDIT_INDEX_BLOCKER.md`. Do **not** weaken `UNVERIFIABLE` semantics, introduce an arbitrary cap, add an unapproved schema migration or ship the incomplete reader.

**Actual safe checks on the uncommitted prototype:** Contracts old/new strict tests 8/8 PASS; API cursor 2/2 PASS; canonical projection mock tests 15/15 PASS; Live API fake-transaction tests 3/3 PASS after the authorization module was created; authorization fake-transaction tests 5/5 PASS; Dashboard staff selector 5/5, Live transport 1/1, existing synthetic diagnostic 3/3 PASS. API/Contracts/Dashboard TypeScript typechecks PASS after new authorization file appeared. These checks do **not** execute the SQL reader, prove lock/revoker interleavings, query budget, or visual U-004. Pre-existing stale Dashboard presentation assertion remains 7/8 at base main. **No isolated PG connection**, EXPLAIN, mounted/E2E, local QA or screenshots were run; no migration, PR, merge, deploy or Issue close occurred.

**STOP result:** DEC-102 remains **Accepted**, but the intended production source is **not review-ready, committed or pushed**. Implementation security/performance and three independent final production reviews are incomplete; U-004 sign-off pending. The primary Owner checkout is unchanged.

## 10. DEC-103 isolated test continuation and final P1 gate

**Binding status:** DEC-102 Accepted; [DEC-103](../decisions/DEC-103_ISSUE_276_AUDIT_DISCOVERABILITY_VALIDATION.md) Accepted **for isolated index evaluation only**. Worktree/remote branch source began at `c11c417261b9a893793542c1688f89743f7008cd`, same as its fetched upstream; `origin/main=698bcb6044f72844008ffa49ef085f11471f53e1`. Existing Owner primary Dashboard config and planning changes were never touched. No shared database or real migration was contacted/executed.

**New actual measured evidence:** A freshly initialized and SQL-verified unique PostgreSQL 17.11 cluster bound exclusively to `127.0.0.1:55449`; 78/78 schema migrations in its own new test database, synthetic 200 sessions/4,100 PARKING Tasks/4,100 Dispatch/24,105 Audit. DEC-103 partial Organization+entity and Organization+JSON taskId indexes created **in the disposable test database only** with `CREATE INDEX CONCURRENTLY`. On 50/100 sparse and dense session pages, exact WIP SQL after indexes: `16.557 / 23.634 / 28.709 / 44.578 ms`; `EXPLAIN (ANALYZE, BUFFERS)` confirmed all four plans perform a **24,105-row Audit Seq Scan**. A scoped-array alternative uses indexes but dense100 still incurs `50.967 ms / 16,816 buffer hits / 4,000 loops`. The accepted bounded-performance gate remains **P1 BLOCKER**, not PASS.

**Read-side WIP:** Narrow three-path discovery (`valet_session_id`, `entity_id`, `metadata_json.taskId`) with exact Organization/page Task scope, Audit ID/session dedup and fail-closed Task/Dispatch/Audit classifier has been authored **only as uncommitted prototype**, preserving Vehicles and current assigned Retrieval by contract. Synthetic read-only PostgreSQL probes verified three discovery reference paths and cross-linked anomaly visibility; they do **not** prove end-to-end query budget, complete identity read, or authorization concurrency. The dedicated PG experiment and exact commands are at `ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md`.

**Remaining release gates:** a separately accepted and measured SQL-plan improvement without arbitrary caps/indexes; real exact-Live-session CA/LM revoker concurrency tests (NOT RUN); three final independent production-code reviews (INCOMPLETE); before/after bilingual Light/Dark/narrow/zoom/U004 evidence and Owner sign-off (PENDING); local product QA (NOT RUN). A static security lock review found no additional static P0/P1, but explicitly did not establish race/deadlock proof. **STOP before committing/pushing any unverified production WIP, PR, fast-forward merge, shared migration, deployment or issue closure.** Historical sections above are point-in-time observations, not current assertions that DEC-103 was unapproved or PostgreSQL has never been tested.

## 11. Production Recovery — repeated SQL comparison and preserved WIP

Starting issue branch and remote at `9e4c1493ef4d2209dc9be71bb62706f5ed08f9b1`; Accepted DEC-102/103 still present; Owner primary checkout untouched. Previously preserved synthetic PostgreSQL 17.11 child database under uniquely owned cluster `127.0.0.1:55449` was reverified by PID, data directory, role and SQL identity before any benchmark. No connection to original host port 5432 was made. This continuation executed **60 actual read-only EXPLAIN plans** on five query shapes × sparse/dense 50/100 × three repeats, plus a final `BEGIN READ ONLY` transaction-local bitmap diagnostic and `ROLLBACK`. No new index or shared migration.

**Exact SQL outcome:** current C branch `operational-history-audit-discovery.ts:62-70` still causes a full scan of **24,105 Audit events**, dense100 median **49.832 ms**. Batched Task IDs through `array_agg` eliminate full Audit scan and preserve sorted evidence-pair fingerprints, but dense100 median **84.749 ms**; other measured candidates likewise fail at least one of the non-global-scan / non-pathological-dense criteria. See `ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md` §8 for complete five-row/four-column timing matrix, buffer/loop details, exact SQL and 20 fingerprints. **P1 BLOCKER remains; the production reader must not be committed/pushed or delivered as review-ready.**

Scoped Contracts/API/Dashboard TypeScript checks each passed; 50 focused unit/synthetic tests passed (Contracts 8, API 33, Dashboard 9). API/Contracts lint passed; full Dashboard lint has previously known unrelated React hook warnings/errors in shared foundation/scope files. `architecture:check` initially also identified 305 lines in an uncommitted #276 API test; the author corrected that file to 299 physical lines, leaving only two unrelated baseline violations (a 328-line guest-browser-session test and `window` use in a portable employee client test). These scoped checks do not substitute for actual released SQL or final E2E/security concurrency proof. Owner U-004 remains PENDING. An independent release-review PASS of the actual final implementation does not exist; no PR/merge/deploy/Issue closure occurred.

**Live UI mounted continuation:** The dedicated Chromium test suite completed **5/5 PASS** on synthetic fixtures. A minimal Live-only `createPortal` wrapper at `live-operations-table.tsx:181-194` mounts the existing SessionDrawer to `document.body`, removing the preexisting invalid `<div>`-under-`<tbody>` warning without changing six-column table geometry or the shared Vehicles component. Real location-switcher A→B→A transitions with an open drawer, delayed old-A response, logout teardown, bilingual Light/Dark and narrow-viewport DOM/accessibility checks passed. **This does not constitute matched before/after screenshot parity or U-004 Owner sign-off.** The portal and tests remain **uncommitted**, because the backend SQL release gate is still P1.

**Real-PG security integration gate:** a separately authorized worker prepared `live-history-read-authorization-concurrency.integration.test.ts` and its fixture, but no concurrency case completed. The first run failed an overly exact localhost address guard (`127.0.0.1/32`), the second failed due to a passwordless migration URL preflight, and the third run was interrupted at the explicit SQL P1 STOP instruction. **0/8 passed, 0/8 established; PostgreSQL security serialization NOT VERIFIED**. The worker left an isolated child database `valet_mob007_auth_23212_d86d8019` in the same verified task-owned 55449 cluster and performed no cleanup after STOP. The primary benchmark child DB and test fixtures were preserved. No original 5432 DB was accessed.
