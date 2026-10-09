# Issue #276 / DEC-103 — isolated PostgreSQL Audit discovery experiment

**Status: P1 BLOCKER — STOP before shipping.** 2026-10-09. This records a
synthetic experiment on a verified disposable PostgreSQL 17.11 cluster; it is
**not** a shared-QA, production, local-customer-data, concurrency, or deployment
test. The Accepted DEC-103 permits the experiment, not an applied real-environment
migration. No API production source was edited by the experiment investigator.

## 1. Isolation chain and precise target

- Worktree HEAD when the experiment began: `c11c417261b9a893793542c1688f89743f7008cd`;
  dirty Issue #276 implementation WIP was left intact.
- Native PG17 installation: `C:\Program Files\PostgreSQL\17\bin`;
  `initdb.exe --version`, `pg_ctl.exe --version`, `postgres.exe --version`
  returned PostgreSQL **17.11**. Original local `postgresql-x64-17` Windows
  service is **Running** as `NT AUTHORITY\NetworkService`, using
  `C:\Program Files\PostgreSQL\17\data`, with existing listeners on
  `0.0.0.0:5432` and `:::5432`; **never contacted**.
- Docker CLI exists, but `com.docker.service` is Stopped, and `docker version`
  and `docker info` cannot open `//./pipe/dockerDesktopLinuxEngine`.
  Podman is not on PATH; existing WSL2 `docker-desktop` and `Ubuntu-24.04`
  distros were stopped, not assumed disposable.
- Initial Windows token was **elevated Administrator**; local `C:` had ~6.7 GiB
  free and `D:` ~50.9 GiB. A new ephemeral cluster was already independently
  initialized by the prime in a uniquely named directory; the investigator
  verified its OS and SQL identity before fixture writes.
- Disposable cluster path **only**:
  `D:\kndoom\valet-platform\tmp\issue-276-disposable-pg-0d8a6d3a254e\data`.
  `PG_VERSION` was `17`. OS `Get-NetTCPConnection -State Listen -LocalPort 55449`
  returned **127.0.0.1:55449**, process PID **15612**; process command line
  contained that exact data directory and `-h 127.0.0.1 -p 55449 -c fsync=off`.
  The recorded isolation manifest independently matched root, port, role and
  data path.
- Verified connection (read-only identity query, **only** at port 55449):

  ```powershell
  & 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55449 -U valet276test -d postgres -X -w -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database(),current_user,inet_server_addr(),inet_server_port(),current_setting('data_directory')"
  ```

  Returned exactly:
  `postgres|valet276test|127.0.0.1|55449|D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data`.
  No use of implicit host, port, cluster, DATABASE_URL, or migration fallback.
  **Important:** existing repository test helpers can silently fall back to
  `postgresql://valet:valet@127.0.0.1:5432/valet` when TEST_DATABASE_URL and
  MIGRATION_DATABASE_URL are unset (`packages/database/src/guest-browser-session-test-fixture.ts:16-20,54-77`,
  `scripts/test-harness/invocation-lease.mjs:13-20`). Do not run a generic PG
  test harness on this host without explicit proven isolated URL.

## 2. Disposable schema/fixtures — no real user data

- Created child database **only on isolated 55449**:
  `valet276_dec103_w2_40c1a097d8`, after verifying cluster data directory.
  Applied **78/78** committed forward SQL migrations in sorted order via
  explicitly targeted `psql -h 127.0.0.1 -p 55449 -U valet276test -d <child>
  -X -w -v ON_ERROR_STOP=1 -f <migration.sql>`; no repository migrations edited.
- Synthetic-only dataset: **200 ValetSessions**, **4,100 completed Parking Tasks**
  (100 sparse sessions with 1 Task; 100 dense sessions with 40 Tasks),
  **4,100 Dispatch COMPLETED** events, and **24,105 Audit** records:
  4,100 canonical Parking, 20,000 irrelevant, and five anomalous canonical
  Parking Audit records. All belong to explicitly inserted fake identities.
- Adversarial records included a canonical Audit with `valet_session_id=NULL`
  but scoped `entity_id`, Task-reference-only with canonical UUID text,
  mismatched entity/Task reference implicating two page sessions, wrong-Location
  reference, and deliberately noncanonical (unhyphenated) JSON taskId text.
- Synthetic fixture artifact, **outside the Git worktree**, at the isolated
  root `dec103-worker2-fixture.sql`; additional isolated append-only inserts
  produced the two canonical Task-ref/crosslink cases. First fixture run hit
  existing `audit_events_actor_provenance_check` for a NULL actor; its explicit
  `BEGIN` rolled back (verified zero new Organization rows), and the fixture
  was corrected to an invented membership actor before successful rerun.
- Executed `ANALYZE` on isolated fixture tables; measurements were warm-cache
  **single samples**, not a statistical latency guarantee or cold-buffer SLA.

## 3. DEC-103 candidate indexes — disposable DB only

Both proposals were created successfully with `CREATE INDEX CONCURRENTLY`
**outside** a transaction and then the isolated Audit table was analyzed:

```sql
CREATE INDEX CONCURRENTLY audit_events_parked_org_entity_idx
  ON public.audit_events (organization_id, entity_id)
  WHERE event_type = 'VALET_SESSION_PARKED';
CREATE INDEX CONCURRENTLY audit_events_parked_org_task_ref_idx
  ON public.audit_events (organization_id, (metadata_json->>'taskId'))
  WHERE event_type = 'VALET_SESSION_PARKED';
```

These are **not** committed forward migrations or authorization to install
indexes on shared QA, staging or production. Existing canonical Audit session
index was retained. Commands were explicitly aimed at the child DB on 55449.

## 4. Per-arm EXPLAIN (ANALYZE, BUFFERS)

All three independent arms used one authorized-like bounded 50/100-session
synthetic page, exact same Organization and canonical event type. A uses
`valet_session_id`, B uses `entity_id`, C uses JSON taskId compared as **text**
against the scope's PARKING Task IDs (no cast of untrusted JSON to UUID).

| Page | Arm | Before indexes ms | After indexes ms | After plan evidence |
|---|---|---:|---:|---|
| Sparse 50 | A session | 3.558 | 2.764 | existing session index; 3,941 Audit index rows scanned |
| Sparse 50 | B entity | 5.298 | 0.867 | new entity index-only scan, ~1 row × 50 loops |
| Sparse 50 | C taskId | 7.335 | 2.146 | new task-ref index, ~1 row × 50 loops |
| Sparse 100 | A session | 2.740 | 4.064 | existing session index; 3,941 index rows scanned |
| Sparse 100 | B entity | 5.243 | 1.297 | new entity index-only scan, ~1 row × 100 loops |
| Sparse 100 | C taskId | 7.238 | 2.669 | new task-ref index, ~1 row × 100 loops |
| Dense 50 | A session | 3.594 | 2.868 | existing session index; 4,061 index rows scanned |
| Dense 50 | B entity | 5.296 | 1.114 | new entity index-only scan, ~40 rows × 50 loops |
| Dense 50 | C taskId | 9.206 | **14.050** | task-ref index 2,000 loops; **regression** |
| Dense 100 | A session | 7.604 | 7.773 | existing session index; 4,101 index rows scanned |
| Dense 100 | B entity | 5.812 | 1.783 | entity index-only scan, ~40 rows × 100 loops |
| Dense 100 | C taskId | 11.675 | **26.406** | task-ref index 4,000 loops; **regression** |

Plans were read-only SELECT EXPLAINs, `Shared Read Blocks=0` for these warm
samples. The two indexes are discoverable by the planner, but the **Task-ref
path is not yet proven efficient on dense history**.

## 5. Actual production WIP three-branch SQL: P1

Read the **exact** query text dynamically from
`apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:36-87`,
replacing `$1`/`$2`/`$3` with the synthetic Organization, Location, and
50/100-page UUID array. No edits to that source. With **both new indexes**:

| Page | Exact WIP query ms | Shared hits | Key actual plan evidence |
|---|---:|---:|---|
| Sparse 50 | 16.557 | 1,147 | `Seq Scan(audit_events)` examines **24,105** rows |
| Sparse 100 | 23.634 | 1,212 | Same full Audit Seq Scan, despite new indexes |
| Dense 50 | 28.709 | 1,442 | Same full Audit Seq Scan; 2,000 Task references |
| Dense 100 | **44.578** | 1,769 | Same full Audit Seq Scan; 4,000 Task references |

**P1:** The current WIP SQL is syntactically valid and executed successfully
on real disposable PG17, but its JSON Task-reference branch causes a
**full-history Audit Seq Scan** in every measured case. Having an index does
not establish the required bounded query budget (DEC-102:58-59,
DEC-103:41,49-56). This is not a release PASS.

Read-only, **uncommitted alternative**: replace just C's equality join with
a pre-filtered scoped Task-ID `ANY(ARRAY(SELECT taskId...))`, followed by the
same Task/session join. This does use both new indexes, no Audit Seq Scan:

| Page | Alternative ms | Shared hits | Index scan/PK lookup evidence |
|---|---:|---:|---|
| Sparse 50 | 2.578 | 420 | task-ref index 50 loops; Audit PK 56 loops |
| Sparse 100 | 4.524 | 698 | task-ref 100 loops; Audit PK 106 loops |
| Dense 50 | **29.688** | 8,506 | task-ref 2,000 loops; Audit PK 2,000 loops |
| Dense 100 | **50.967** | 16,816 | task-ref 4,000 loops; Audit PK 4,000 loops |

Thus replacing an unbounded full-table scan by thousands of indexed probes
is **not yet a demonstrated dense-history budget solution**. The experiment
does not justify a new third index, arbitrary history cap or reader relaxation.

## 6. Cross-reference discovery/dedup accuracy

One synthetic **sparse 50-session page**, three explicit separately indexable
`UNION ALL` arms, then dedup by **(Audit ID, implicated page session)** gave:

- **156 raw arm mentions**, **55 distinct physical Audit IDs** and **56
  distinct Audit/session pairs**. A multi-arm physical audit is not counted
  as a duplicate event for one session.
- NULL-linked entity orphan was found through **B only**; null-linked
  canonical Task-reference-only Audit was found through **C only**;
  wrong-Location but matching entity was found through **B** and must be
  rejected at validation, not excluded from discovery.
- A crosslinked Audit whose `entity_id` implicates session 3 and whose
  `metadata_json.taskId` belongs to session 2 produced **two distinct
  Audit/session pairs**, one via B, the other via C. Both page sessions must
  fail closed rather than silently dropping the second relation.
- Noncanonical, unhyphenated (32-hex) JSON taskId did **not** text-match the
  PostgreSQL `uuid::text` 36-char Task ID, by design; it remained discoverable
  through its valid entity reference B. No unsafe JSON-to-UUID cast was used.
- These are *discovery* outcomes, not complete end-to-end `UNVERIFIABLE`
  classifier, historical identity, concurrent revocation or customer QA tests.

## 7. Decision / strict stop gate

**BLOCKER P1: STOP integration/shipping.** DEC-103 proof of three-arm
discoverability and two partial index creation **partially passed** in genuine
isolated PostgreSQL, but the exact WIP three-arm SQL and candidate indexed
alternative **failed to establish bounded dense-history performance**.
Need an Owner/security-reviewed SQL-plan optimization with representative
`EXPLAIN (ANALYZE,BUFFERS)`/loop/rows/latency proof, and the separate
DEC-102 Staff-session / grant / entitlement concurrent revocation tests before
production consideration. No shared database, production migration, app-source
edit, PR, commit, push, deployment or issue closure was performed by worker-2.

Reproducibility scripts remain exclusively under disposable cluster root:
`dec103-worker2-fixture.sql`, `dec103-worker2-discovery.sql`,
`dec103-worker2-bench.ps1`, `dec103-worker2-production-plan.ps1`.
Do not execute these without revalidating target data directory, port,
isolation and explicit experimental authorization. This report does not
authorize touching original PostgreSQL 5432.

### Cleanup handoff — **OWNED CLUSTER STOPPED; DATA PRESERVED**

Prime owned the lifecycle while the verified 55449 cluster was in use
by the #276 experiment. **After all PostgreSQL investigators stopped**, prime
verified the listener PID/command line still identified exactly the new
`issue-276-disposable-pg-0d8a6d3a254e\data` cluster, repeated the SQL
`data_directory`/user/port identity query, then executed:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D 'D:\kndoom\valet-platform\tmp\issue-276-disposable-pg-0d8a6d3a254e\data' -m fast -w stop
```

`pg_ctl` confirmed `server stopped`, and a subsequent listener check
confirmed **port 55449 closed** while the existing **5432 listener remained
running**. The disposable cluster folder and 78-migration child database
files were **preserved**, not dropped/deleted, to retain the reproducible
benchmark evidence. If separately authorized to delete them later, **first**
verify `Get-NetTCPConnection -LocalPort 55449` and the owning PostgreSQL
process's `-D` argument still exactly identify the new
`issue-276-disposable-pg-0d8a6d3a254e\data`, and verify the SQL server
identity query above returns the same data directory. Only then a separately
authorized operator may drop the **exact child database** with:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55449 -U valet276test -d postgres -X -w -v ON_ERROR_STOP=1 -c 'DROP DATABASE valet276_dec103_w2_40c1a097d8 WITH (FORCE)'
```

Do not drop any other database or act on `127.0.0.1:5432`. The separate
disposable cluster has **already been stopped**; the above sample SQL DROP
would require restarting the same verified isolated cluster under its exact
`-D` directory and port. A directory cleanup must independently verify the
exact new folder's resolved path before any file deletion. **No database DROP
or file/directory deletion occurred in this run.**

## 8. Owner-authorized Production Recovery SQL optimization experiment — 2026-10-09

**Result: P1 QUERY-BUDGET BLOCKER REMAINS.** This is a *new*, SQL/EXPLAIN-only
experiment after the prime restarted and reverified the original **disposable**
PG17.11 cluster. It supersedes the preceding stopped-cluster state **for this
experiment only**; it does not claim the cluster is still running at handoff.
This is not a real-environment migration, production code fix, or validation
of viewer revocation, concurrency, or U-004.

### 8.1 Scope and exact commands

The investigator independently checked
`Get-NetTCPConnection -State Listen -LocalPort 55449` (localhost listener PID
16500) and the Windows PostgreSQL process's
`-D D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data`
command line. Every benchmark run executed this **read-only SQL identity
check** on the same existing child database before any EXPLAIN:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55449 -U valet276test -d valet276_dec103_w2_40c1a097d8 -w -X -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database(),current_user,inet_server_addr(),inet_server_port(),current_setting('data_directory')"
```

The observed identity was exactly
`valet276_dec103_w2_40c1a097d8|valet276test|127.0.0.1|55449|D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data`.
**No connection to 5432, no fixture/DB writes, no index changes or new history
cap** occurred in this continuation.

The PowerShell runner
`D:\kndoom\valet-platform\tmp\issue-276-disposable-pg-0d8a6d3a254e\dec103-worker2-recovery-bench.ps1`
is located **outside the repo/worktree** and reads the exact SQL from
`apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:36-87`
before substituting an authorized-like *synthetic* bounded UUID page.
Invocation:

```powershell
& 'D:\kndoom\valet-platform\tmp\issue-276-disposable-pg-0d8a6d3a254e\dec103-worker2-recovery-bench.ps1' -Mode run -Repetitions 3
& 'D:\kndoom\valet-platform\tmp\issue-276-disposable-pg-0d8a6d3a254e\dec103-worker2-recovery-bench.ps1' -Mode fingerprints
```

Only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` around **SELECT** projections
and SELECT fingerprints were executed. Each of five shapes was measured three
times in each of **four** regimes: sparse50, sparse100 (1 Parking Task/session),
dense50, dense100 (40 Parking Tasks/session). This yields **60 plans** on
the preserved dataset (200 sessions, 4,100 Parking Tasks, 24,105 synthetic
Audit rows before the five-case extension; now 24,105 total after the earlier
five canonical anomalies). Warm-cache results predominate; some first runs
loaded additional shared buffers, which are reported in the raw CSV at
`dec103-worker2-recovery-results.csv` alongside each plan's scan/loop data.
All timing figures below are **single-host observed medians**, not SLAs.

### 8.2 Five shapes, exact result-preserving three-arm discovery

All shapes preserve **A** (session-reference), **B** (entity-reference), the
`UNION ALL` C result, `DISTINCT (auditId, implicatedSessionId)`, final Audit
join, the current exact organization/page/Task scoping, and safe JSON **text**
comparison. No query discards a C-only orphan, a wrong-Location Audit, or a
cross-session B/C linkage:

1. **exact** — the unchanged current production WIP C equality join at
   `operational-history-audit-discovery.ts:62-70`.
2. **semi_hash** — C Audit subquery with
   `EXISTS (SELECT 1 FROM page_parking_tasks WHERE taskId = audit.metadata_json->>'taskId')`
   and rejoin to the scoped Tasks; permitted planner to choose hash/semi paths.
3. **batch_agg** — aggregate all scoped Task UUID strings into one `text[]`,
   indexed C predicate, then rejoin the Task for its exact page session:

   ```sql
   SELECT audit.id AS "auditId", task."sessionId" AS "implicatedSessionId"
   FROM (SELECT array_agg("taskId") AS task_ids
         FROM page_parking_tasks) AS batch
   INNER JOIN audit_events AS audit
     ON audit.organization_id = $1
    AND audit.event_type = 'VALET_SESSION_PARKED'
    AND (audit.metadata_json->>'taskId') = ANY(batch.task_ids)
   INNER JOIN page_parking_tasks AS task
     ON task."taskId" = (audit.metadata_json->>'taskId')
   ```

4. **indexed_lateral** — page Task keyed
   `CROSS JOIN LATERAL (SELECT audit.id ... WHERE JSON taskId = taskId OFFSET 0)`;
   `OFFSET 0` constrains flattening as an experiment, not a recommendation.
5. **batch_materialized** — indexable Task-ID array filter inside a protected
   C subquery with `OFFSET 0`, followed by the same page Task rejoin.

### 8.3 Median measured runtime (milliseconds; three full EXPLAINs each)

| Shape | Sparse 50 | Sparse 100 | Dense 50 | Dense 100 | Plan outcome |
|---|---:|---:|---:|---:|---|
| Exact WIP | 21.206 | 18.953 | 33.598 | 49.832 | Audit **Seq Scan 24,105 rows** in every plan |
| Semi/hash EXISTS | 18.376 | 21.508 | 36.759 | 53.638 | Same Audit **Seq Scan 24,105** |
| Batch array aggregation | **2.556** | **4.881** | 29.853 | **84.749** | No Audit Seq Scan; C task-ref index **52/102/2,000/4,000 rows in one index scan** |
| Indexed lateral + OFFSET 0 | 14.610 | 16.183 | 44.725 | 88.157 | Full Audit Seq Scan **plus** C task-ref index 50/100/2,000/4,000 loops |
| Batched materialized subquery | 3.026 | 6.150 | 31.350 | 71.550 | No Audit Seq Scan, C index **52/102/2,000/4,000 matching rows** |

The batch candidate is immediately superior on the sparse fixture and **does
eliminate the global Audit scan** without a new index. However, the dense100
median is **84.749 ms versus 49.832 ms** for the full-scan baseline, with many
index/heap buffers. The corresponding prior array-probe experiment (§5) also
found severe dense-history regression. Consequently **none** of these shapes
establishes an accepted performance budget across both sparse and dense
histories; not even the no-Seq-Scan solutions warrant production release yet.
The indexed-lateral shape is particularly unsuitable because PostgreSQL may
retain both the global scan and thousands of Task-keyed probes.

### 8.4 Exact evidence equivalence across all five shapes

For each page regime, the runner executed the same SQL as a SELECT and
computed the count plus MD5 of the **sorted full**
`(auditId, implicatedSessionId)` pair list, not merely matching a count.
All five variants produced exactly the same fingerprint in every regime:

| Page | Pair count | Matching sorted-pair MD5 across all five variants |
|---|---:|---|
| Sparse 50 | 56 | `360c2fcf6350a0251c2913596d3cf805` |
| Sparse 100 | 106 | `804cdd8c6058e75bdad5b243de121493` |
| Dense 50 | 2,000 | `f6319eda9dc4b6ee8a2147de7be1ae30` |
| Dense 100 | 4,000 | `6196c48febcde7605327fd58cec72b3f` |

The sparse50 relation includes the two implications of the same malformed
cross-link through B (session 3) and C (session 2), as evidenced in §6. This
equality is **fixture-specific evidence of semantic parity**, not a proof that
the SQL handles every possible database corruption or an authority/session
revocation check.

### 8.5 Decision and next allowed work

**P1 remains at `apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70`.**
The existing exact C query still violates the DEC-102:58-59 and
DEC-103:41,49-56 global-scan/query-budget gate. The new batch_agg formulation
is a concrete **SQL optimization candidate for further investigation**, not
permission to ship: it removes unbounded Audit Seq Scan, but dense100 increased
to 84.749 ms (median, 3 samples) and touches thousands of index results.
Revisit the hash/bitmap/batched strategy with an explicitly reviewed dense
query-budget target and production-representative distribution, and rerun
`EXPLAIN (ANALYZE, BUFFERS)` on proven disposable PostgreSQL. A third index,
schema change, fabricated cardinality cap, downgrading `UNVERIFIABLE`, or
production DB change still requires its own Owner/security decision.

**Worker-2 made no production TypeScript edits, no DB writes, no migrations,
no additional indexes, no commit and no push** during this continuation.
Prime received the exact timings, plans, and remaining P1 before handoff.

### 8.6 One final Bitmap-vs-Index diagnostic (dense 100 only)

At the prime's request, a **single** additional `batch_agg` query was
benchmarked on the same verified child database within `BEGIN READ ONLY`
and `ROLLBACK`, with **transaction-local**
`SET LOCAL enable_indexscan=off` to inspect whether a bitmap alternative
would substantially improve the 4,000-Task case. This configuration was
**diagnostic only**, did not persist a server setting or change data, and is
**not** a recommended production session policy.

The measured `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` returned **62.868 ms**,
**1,732 shared buffer hits**, zero reads. The plan chose multiple
`Bitmap Heap Scan(audit_events)` operators (4,000 rows each), **but also a
full `Seq Scan(audit_events)` of 24,105 rows** in the C discovery. It therefore
**did not** demonstrate a safe no-global-scan, bounded-performance solution
and does not lift the P1 at
`apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70`.
No more planner variants or DB actions were attempted after this finite test.

### 8.7 Release gate and separate authority/visual evidence

The SQL-only follow-up completed 60 repeated `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans plus the single transaction-local Bitmap diagnostic **without** a shippable candidate. Dense100 results remain worse for the indexable no-global-scan alternatives, although all measured shapes preserved the exact synthetic audit/session relation fingerprints. This is an implementation **P1 STOP** under Accepted DEC-102/103, not a request to reapprove U-003, a performance SLA claim, or permission to install a third/modified index in shared environments.

The separately prepared Live authority PostgreSQL concurrency test had **zero completed race cases**. Test harness preflights and a subsequent interrupted run did not prove staff-session revocation, LM grant, entitlement, CA MFA or Location lifecycle serialization. An isolated test child DB `valet_mob007_auth_23212_d86d8019` was left within the task-owned 55449 cluster alongside the existing benchmark DB; no shared/production database was touched. Live-only Chromium functional tests **5/5 PASS** (including a corrected A→B→A scope test and portal-based fix for original invalid `tbody` nesting), but no Owner U-004 screenshot/pixel sign-off exists. All production source remains **uncommitted WIP**.

**Final isolated cluster lifecycle:** Once the PostgreSQL, security and UI investigators finished, prime reverified the exact PG17.11 data directory and owning server process on loopback port 55449, confirmed no active external client backends, and executed `pg_ctl -D <task-owned-exact-data-directory> -m fast -w stop`. PostgreSQL returned `server stopped`. Port **55449 is closed**; original independent **5432 listener remains present**. The experiment database `valet276_dec103_w2_40c1a097d8`, interrupted-concurrency child `valet_mob007_auth_23212_d86d8019`, fixture scripts and entire disposable directory were **preserved rather than dropped/deleted** so the test evidence can be reviewed. No additional DB action is authorized by this report.

## 9. Focused P1 Recovery — A1–A5 cost and index attribution (2026-10-09, later continuation)

**Decision: NO-GO / P1 NOT RESOLVED.** Unlike the 60 full-query plans in §8,
these new measurements isolate individual read costs, inspect the underlying
Audit heap/index access, replace *one existing candidate index on the disposable
child only* for an `INCLUDE(id)` experiment, and try a batched Audit-primary-key
hydration strategy. There were **no production TypeScript changes, no commit,
no push, no migration on a shared environment, no third production index,
no numerical history cap, and no connection to port 5432**.

### 9.1 Identity and method

The prime independently restarted and reverified the previously preserved
disposable PostgreSQL 17.11 cluster before any new SQL was permitted. Worker-2
then checked the exact identity by **explicit** `psql -h 127.0.0.1 -p 55449
-U valet276test -d valet276_dec103_w2_40c1a097d8 -X -w`:

```text
valet276_dec103_w2_40c1a097d8|valet276test|127.0.0.1|55449|D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data
```

All A1 SQL uses the same existing **200 completely synthetic sessions**, 4,100
PARKING Tasks and 24,105 Audit rows, including the original orphan, malformed,
wrong-Location and cross-session test cases. The test constructs the same
authorized-like scope and sparse/dense **50/100** pages as earlier, without
claiming it has replayed the actual CA/LM authorization transaction. It measures
**three EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT runs** per shape/page and
reports the true median and maximum read from the raw CSV, not an estimated
or fabricated budget. Reproducibility script and CSVs are *outside the Git
worktree*, under the previously verified disposable cluster directory:

```text
dec103-worker2-a1-cost.ps1
dec103-worker2-a1-cost.csv
dec103-worker2-a1-cost-abc_bulk_pk.csv
dec103-worker2-a1-cost-c_ids.csv
dec103-worker2-a5-classifier.cjs
```

### A1. Page, A/B/C discovery, DISTINCT and final wide Audit hydration

With the **temporary, disposable-only `INCLUDE(id)` Task-ref candidate index**
installed (see A2), measured medians and maxima were:

| Scoped stage | Sparse100 median / max ms | Dense100 median / max ms | Dense100 max shared hits | Observable Access |
|---|---:|---:|---:|---|
| Authorized-like bounded session-ID page only | 1.163 / 1.260 | 0.813 / 0.838 | 5 | 100 session rows, **not actual authorization transaction** |
| A: Audit `valet_session_id` IDs | 1.149 / 1.393 | 2.482 / 2.487 | 310 | 4,000 Audit matches in dense100 |
| B: Audit `entity_id` IDs | 0.867 / 0.997 | 2.533 / 3.378 | 343 | 4,000 Audit matches in dense100 |
| C: Audit JSON Task-ref IDs, after scoped Task batch | 2.029 / 2.038 | **26.264 / 39.441** | 4,167 | Task-ref expression index, **4,000 rows**, not index-only |
| A+B+C `UNION ALL` and pair `DISTINCT` IDs | 3.308 / 3.387 | **34.183 / 38.652** | 4,820 | All A/B/C paths; preserve multi-session implications |
| All discovered pairs joined back to wide Audit rows | 4.139 / 5.928 | **52.574 / 54.777** | **16,826** | Final `audit_events_pkey` **1 row × 4,000 loops** |

This decomposition shows a real dominant C expression lookup and an additional
wide Audit hydration cost: **~18.4 ms and ~12,006 additional shared hits**
between the two adjacent dense100 median end-to-end stages in the same
fixture. These are **cumulative query stage differences**, not isolated
operator CPU timers; they cannot establish causality or production latency
without plan-level comparisons and the actual full Live transaction. On the
original non-`INCLUDE` index, another A1 run had dense100 C IDs ~28.0 ms,
pair DISTINCT ~40.4 ms and full Audit ~67.8 ms; cross-run variance and
warm caches prevent claiming a clean A/B speedup from `INCLUDE`.

### A2. Narrow covering ID / heap-fetch hypothesis

Before the experiment `pg_class` reported `audit_events.relpages=706`,
`relallvisible=706`, favorable for possible index-only scans. Worker-2
recorded the original partial index DDL and **only in the verified disposable
child** temporarily replaced it with:

```sql
-- Disposable cluster experiment; NOT a proposed shared deployment.
DROP INDEX CONCURRENTLY public.audit_events_parked_org_task_ref_idx;
CREATE INDEX CONCURRENTLY audit_events_parked_org_task_ref_idx
  ON public.audit_events (organization_id, (metadata_json->>'taskId'))
  INCLUDE (id) WHERE event_type='VALET_SESSION_PARKED';
```

`EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` of the *narrow* query `SELECT
audit.id ... WHERE audit.metadata_json->>'taskId' =
ANY(ARRAY(SELECT 4000 matching synthetic task UUID strings))` **still chose
`Index Scan`, NOT `Index Only Scan`**. It returned 4,000 rows, with
~4,044 shared hits and ~33.4 ms. No `Heap Fetches` index-only counter was
available because it was not an Index Only Scan; it would be incorrect to
report a measured zero heap fetch or infer that the visibility map alone solves
the access cost. `INCLUDE(id)` alone is **not** a demonstrated index-only
solution for the current expression predicate.

### A3. Split narrow discovery and bounded bulk PK hydration

The second step rehydrates final Audit details by one ID-array predicate
instead of 4,000 repeated PK lookups, while retaining the prior A/B/C
discovery and `DISTINCT (auditId, implicatedSessionId)`:

```sql
WITH page_parking_tasks AS MATERIALIZED (...),
     task_batch AS MATERIALIZED (...),
     deduplicated AS MATERIALIZED (
       SELECT DISTINCT "auditId", "implicatedSessionId"
       FROM (SELECT ... /* A */ UNION ALL SELECT ... /* B */
             UNION ALL SELECT ... /* C */) AS discovered
     ),
     fetched AS MATERIALIZED (
       SELECT a.id,a.metadata_json,a.location_id,a.actor_membership_id,
              a.entity_type,a.entity_id,a.occurred_at
       FROM public.audit_events AS a
       WHERE a.id = ANY(ARRAY(SELECT DISTINCT "auditId" FROM deduplicated))
     )
SELECT d."auditId",d."implicatedSessionId",
       a.metadata_json,a.location_id,a.actor_membership_id,
       a.entity_type,a.entity_id,a.occurred_at
FROM deduplicated AS d JOIN fetched AS a ON a.id = d."auditId"
ORDER BY d."implicatedSessionId",d."auditId";
```

The complete reproducible SQL, including the exact A/B/C arms, appears in
`dec103-worker2-a1-cost.ps1` (shape `abc_bulk_pk`). PostgreSQL did replace
the final 4,000 one-by-one `audit_events_pkey` lookups by a **Bitmap Heap Scan
over the 4,000 selected Audit IDs**, reducing dense100 total buffers from
~16,826 to ~5,284 hits in the final repeat. **However, latency remained
unproven:** the final three repeats with the original index restored returned
**dense100 median 56.402 ms, max 60.950 ms** versus the historical exact
current-query median 49.832 ms; an earlier independent run with the temporary
`INCLUDE(id)` index saw a **maximum of 85.882 ms**. This is a measured
variance, **not** a consistent gain. The two-stage approach cannot pass solely
on buffer-hit reduction; CPU, sorting and materialization overhead remain.

| Latest batched PK SQL | Median / max ms | Max shared hits | Returned Audit IDs |
|---|---:|---:|---:|
| Sparse 50 | 2.732 / 2.875 | 342 | 56 |
| Sparse 100 | 4.324 / 4.518 | 522 | 106 |
| Dense 50 | 28.186 / 29.003 | 2,864 | 2,000 |
| Dense 100 | **56.402 / 60.950** | **5,284** | **4,000** |

Dense50→dense100 approximately doubles the number of real Audit candidates
and the PK heap workload; timings also roughly double, rather than
demonstrating a fixed upper bound on historic work. The query deliberately
includes **all** same-scope history, because the accepted DEC explicitly
forbids a speculative one-completion cap.

This candidate's **exact sorted full-pair fingerprints** match the previously
verified three-arm relation (§8.4), across all four regimes:

| Page | Pairs | MD5 over sorted `(auditId,implicatedSessionId)` |
|---|---:|---|
| Sparse50 | 56 | `360c2fcf6350a0251c2913596d3cf805` |
| Sparse100 | 106 | `804cdd8c6058e75bdad5b243de121493` |
| Dense50 | 2,000 | `f6319eda9dc4b6ee8a2147de7be1ae30` |
| Dense100 | 4,000 | `6196c48febcde7605327fd58cec72b3f` |

This proves **fixture-level reference preservation, including the cross-linked
B/C Audit ID**, not full authorization/classification/revocation correctness.
The actual read must continue matching every Task/Dispatch/Audit and classify
anomalies fail-closed under DEC-102.

### A4. Expression statistics / cardinality estimation

On the disposable child **only**, worker-2 evaluated:

```sql
CREATE STATISTICS dec103_sandbox_audit_taskref_stats
 (mcv,ndistinct,dependencies)
 ON organization_id,event_type,(metadata_json->>'taskId')
 FROM public.audit_events;
ANALYZE public.audit_events;
```

The dynamic 4,000-element `ANY(ARRAY(SELECT ...))` C index predicate was
still cardinality-misestimed: `EXPLAIN` estimated **2 rows**, but
`EXPLAIN ANALYZE` returned **4,000** actual rows (Task-ref Index Scan,
4,044 shared hits, ~38.7 ms). The earlier no-extra-stats plan estimated ~201
for 4,000 actual matches. Extended stats did **not** demonstrate a fix; do not
promote this ephemeral statistics object to production on speculation.

### A5. JS classifier CPU and end-to-end budget limitation

A separate **no-DB**, local CPU experiment transpiled the exact existing
`apps/api/src/modules/dashboard/operational-history-evidence-classifier.ts`
source in memory (without modifying it) and ran `classifyParkingHistory`
over synthetic canonical Task/Dispatch/Audit objects for 100 sessions.
Ten warm-ups preceded 30 measured batches:

| Batch | Canonical evidence records | Median JS time | p90 | Max |
|---|---:|---:|---:|---:|
| Sparse100, 1 Parking Task/session | 200 | 0.048 ms | 0.267 ms | 0.858 ms |
| Dense100, 40 Parking Tasks/session | 8,000 | **1.624 ms** | 2.569 ms | 4.345 ms |

The production classifier returned `PROVEN` with the correct actor for these
well-formed mock inputs. This is **not** the actual server HTTP + PostgreSQL
transaction, transport payload, security lock waits, or cross-linked anomaly
classification benchmark. The rough order of magnitude suggests that SQL
fetching/dedup/wide Audit hydration dominates under these fixtures, but no
Live end-to-end performance claim is warranted. Do **not** cap repeated
terminal PARKING operations at one: the current DB does not enforce that
limit and DEC-034 permits future completed task history.

### 9.2 Cleanup, residual P1 and release answer

Worker-2 **restored the disposable test child to the original candidate
index** with `DROP INDEX CONCURRENTLY` + the exact prior
`CREATE INDEX CONCURRENTLY ... (organization_id,metadata_json->>'taskId')
WHERE event_type='VALET_SESSION_PARKED'` **without `INCLUDE(id)`**.
`pg_get_indexdef` confirmed the original index definition, and
`DROP STATISTICS public.dec103_sandbox_audit_taskref_stats` was confirmed
with **zero remaining statistic objects by that name**. No fixture, schema
data, production database or shared index was changed. The disposable server
was **not** stopped, dropped or deleted in this continuation; the prime owns
its lifecycle.

**FINAL NO-GO / P1 remains.** Existing production WIP
`apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70`
retains a global Audit scan under the measured plan, while alternative
index-based solutions still examine **4,000 distinct Task/Audit candidates**
and perform expensive wide-row hydration in dense100. Owner-required
DEC-102:58-59 and DEC-103:49-56 query budget plus the separate real concurrency
authorization proof are **not satisfied**. This investigation provides a
finite, reproducible attribution and candidate strategies, **not** an
implemented production optimization, permission for another index/migration,
U-004 sign-off, PR, merge, deployment or issue closure.

## 10. Final Focused P1 Recovery status (latest, 2026-10-09)

The previous historical benchmark and stop-state snapshots remain preserved above. The latest complete cross-functional handoff is **ISSUE_276_FOCUSED_P1_RECOVERY_OUTCOME.md**, supported by the cost decomposition in §9, independent Domain cardinality review, and DRAFT index/schema decision proposal. The SQL P1 is **NOT RESOLVED**: C Task-reference lookup and wide Audit hydration still fail the jointly required no-global-scan / acceptable dense-history cost proof. No production SQL/index/migration is authorized or committed.

The earlier 0/8 PostgreSQL concurrency snapshot in §8.7 has now been superseded by **16/16 real PostgreSQL Lock-wait interleaving tests PASS** on fresh isolated children, including Staff revoke/refresh, Location grant, role loss, entitlement, CA MFA, Location lifecycle and Organization-status mutation. Native production writer fidelity was not verified for direct entitlement/Organization-status changes. An independent security reviewer identified a stale CA hint MFA-response oracle in the uncommitted authorization WIP; a narrow deferred-error fix passed **7/7 focused unit tests** and **independent read-only security re-review PASS**, preserving the accepted lock order. All source/test code remains **uncommitted and unshipped**.

The dedicated Live Chromium 5/5 cases do not verify the standalone Retrieval Queue view or U-004 before/after pixel screenshots; Owner U-004 signoff remains **PENDING**. The final read/test and experiment child databases were kept within the specifically isolated 55449 cluster; no original 5432 connection, real-environment migration, PR, merge, deployment or Issue close occurred.
