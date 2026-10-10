# Issue #276 — Recovery of the historical Parking read candidate

**Status: CANDIDATE WORKS ON ISOLATED FIXTURES; RELEASE NO-GO.**
Date: 2026-10-10. This is engineering evidence and an uncommitted WIP
handoff, **not** an Accepted DEC, performance SLA, Owner U-004 approval, or
authorization for a production index/migration/merge/deploy.

## 1. Scope and preservation

- Existing protected worktree: `D:\kndoom\valet-platform\tmp\issue-276-worktree`,
  branch `fix/issue-276-live-operations-staff-history`, HEAD/remote
  `6545d6f036d38e77a7df695dc5ec82fc9472c6c1`.
- Main at `698bcb6044f72844008ffa49ef085f11471f53e1`;
  original primary-checkout dirty changes and all preceding #276 WIP retained.
- No PR, commit, push, merge, production index, schema migration, deploy,
  history backfill or issue closure.
- Accepted DEC-102/103 govern evidence, read authorization, and the two
  **disposable-only** index experiments. Original A/B/C design DRAFT remains
  unaccepted for any broader physical access or schema migration.

## 2. Fixed correctness issues

1. `operational-history-evidence-classifier.ts`: reject source and destination
   Task/Session versions outside positive PostgreSQL int4. Before the patch,
   5/10 new focused tests failed: impossible versions were classified PROVEN.
   After the patch 10/10 and existing projection tests pass. Malformed evidence
   remains UNVERIFIABLE rather than producing a historic Parker.
2. `session-staff-attribution.ts`: on PARKED+PROVEN+unprojectable identity,
   render **Unknown / Parked by** (not bare Unknown). NO_RECORD/UNVERIFIABLE
   display Unknown without a proven-completion subtitle; queued Retrieval is
   still Unassigned and any active assignment retains precedence. Independent
   UI re-review PASS for code and the existing six-column geometry.
3. `operational-history-atomic-evidence.ts`: the scoped Parking Task,
   COMPLETED Dispatch, and all A/B/C Audit discoveries are combined into
   **one PostgreSQL statement**, using tagged JSONB rows with explicit
   rehydration of timestamptz values. Under READ COMMITTED, this establishes a
   shared statement snapshot without moving current-viewer authorization to
   REPEATABLE READ or relaxing locks. Names still load only under exact
   organization/page membership scope in the same authorized transaction.
4. `live-history-read-authorization.ts`: Live history *readers only* use a
   SHARED `staff-management-org` transaction advisory lock instead of
   EXCLUSIVE. Existing writer-side EXCLUSIVE locks, exact Staff-session
   generation checks and current membership/grant/commercial row locks remain
   intact. Security reviewer found static compatibility with DEC-102 and
   current native writers. Real production-writer interleavings remain
   necessary before release.

## 3. Physical Audit discovery change — no added index/schema

- Audit ID/session implication deduplication now retains PostgreSQL UUID.
- Task-id text equality uses `COLLATE "C"`; malformed JSON reference values
  are compared as text and never cast to UUID.
- Every discovered Audit row is hydrated via `CROSS JOIN LATERAL` on the
  existing unique Audit primary key; `LIMIT 1` is **per primary-key lookup**,
  not a limit on discovered candidate evidence. All A/B/C independent
  reference implications remain.
- On the **verified, disposable PG 17.11 only**, exact SQL and one-statement
  candidate return full-row parity and archived independent evidence-pair
  fingerprints for sparse50 (56), sparse100 (106), dense50 (2,000),
  dense100 (4,000), including pre-existing anomalous evidence.
- No Audit full Seq Scan appeared in the current fixture plans. This does
  **not** mean zero Bitmap Heap scans or zero expensive PK probes. On dense100
  4,000 Audit PK lookups remain: relevant evidence volume is not bounded by
  a 100-session page limit.

## 4. Isolated performance evidence, not production p95

Physical target was checked via PostgreSQL query before access:
`127.0.0.1:55449`, user `valet276test`, child DB
`valet276_dec103_w2_40c1a097d8`, data directory
`D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data`.
No connection to 5432. All diagnostic query sessions used BEGIN READ ONLY.
Disposable fixture: 200 sessions, 4,100 completed Tasks and Dispatches,
24,105 Audit rows; prior DEC-103 candidate indexes exist **only in this DB**.

| Page | Exact atomic Task+Dispatch+Audit, `C` median ms | Same with default collation median ms |
|---|---:|---:|
| Sparse50 | 6.18 | 5.85 |
| Sparse100 | 6.13 | 6.05 |
| Dense50 | 39.77 | 63.73 |
| Dense100 | 75.64 | 110.09 |

Median reflects **six warm EXPLAIN ANALYZE iterations per variant** on a
local synthetic fixture (sequential, not interleaved); it is not an HTTP
budget, cold-cache p95, true multi-Location contention measure, or capacity
test. All pairs of variants emitted identical full result rows. Both had
no full Audit Seq Scan in the four recorded fixture plans; the `C` candidate
does **not** have a dedicated `C`-collated expression index. Bitmap candidate
scans and dense PK probes remain measurable.

Invoking the actual three-query `getOperationalHistoryForSessions()` code
under read-only PG on sparse50/100 and dense50/100 returned exactly one item
per source session; dense100 first measured 183.81 ms for 100 classified
session outcomes and name projections. First-run timing is not p95.

Local generated *ignored* artifacts:
`tmp/issue276-reinvestigation/lateral-hydration-results.json`,
`current-wip-query-proof.json`, `consistent-snapshot-results.json`,
`atomic-collation-comparison.ts`,
`live-history-real-postgres-readonly.ts` and `read-lock-contention.ts`.
Earlier diagnostic extraction
scripts refer to the older inline Audit SQL and may require refreshing their
source selector to be rerun.

### 4.1 Read-only, same-Organization contention experiment

The exact Organization advisory key was held through a real, read-only
three-query Dense100 historical projection, comparing isolated EXCLUSIVE
versus SHARED reader locks without touching writer source:

| Concurrent reads | EXCLUSIVE group wall ms | SHARED group wall ms |
|---|---:|---:|
| 1 | 239.78 | 184.50 |
| 4 | 724.82 | 278.11 |
| 8 | 1231.14 | 451.74 |
| 16 | 2307.31 | 879.58 |

The SHARED 16-reader burst waited up to 4.26ms for the Organization lock,
versus 1992.19ms for EXCLUSIVE. One synthetic burst per size; this is
**not** authenticated HTTP p95, real writer contention or a production SLA.
After changing only the Live-history reader to SHARED, the modeled PG
authorization writer-first/reader-first suite was rerun: **16/16 PASS**.

## 5. Reverified tests and reviewer disposition

| Gate | Verified result |
|---|---|
| API non-PG focused authorization/cursor/projection/classifier/discovery | **42/42 PASS**, six files |
| Disposable PostgreSQL modeled security/authorization races | **16/16 PASS**, isolated child databases cleaned |
| Contracts strict Live DTO | **5/5 PASS** |
| Dashboard focused attribution/transport | **6/6 PASS** |
| Mounted Chromium #276 fixture suite (current candidate) | **6/6 PASS** using `localhost`, including standalone Retrieval Queue lazy/scope-fencing/detail test |
| API, Dashboard, Contracts TypeScript | PASS |
| Targeted API and Dashboard ESLint | PASS |
| Independent security authority review | Code PASS; native-writer race proof still missing |
| Independent UI code re-review | PASS for repaired proven-null state; Owner captures outstanding |
| Architecture full repository | FAIL, two pre-existing unrelated violations listed below |

Architecture baseline failures, **not introduced by #276**:
`packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts`
(328 physical lines) and
`packages/employee-client/src/employee-shift-presence-local-provenance.test.ts`
(portable module references `window`). Do not alter them as an implicit
part of this issue.

## 6. Exact remaining release blocks

**2026-10-10 QA rollout continuation:** The Owner approved progressing to an
identified, isolated QA/Staging test with a rollback plan, excluding
Production. No actual QA connection was configured. A fresh, separately
owned local **synthetic** clone on isolated 127.0.0.1:55449 passed the full
two-index CREATE CONCURRENTLY / fingerprint parity / DROP CONCURRENTLY
rehearsal and was deleted afterward; both indexes and all 24,105 Audit
rows remain in the original disposable source. Exact index/snapshot/timing
evidence and the fail-closed real-QA/rollback runbook are recorded in
[ISSUE_276_DEC103_QA_ROLLOUT_PLAN_2026_10_10.md](ISSUE_276_DEC103_QA_ROLLOUT_PLAN_2026_10_10.md).
Real QA DDL remains blocked on verifying an independently supplied
nonproduction target. The existing main and #276 dirty worktrees remain
uncommitted; no access to the unverified local 5432 database.

1. **Index rollout decision:** current isolated fixture includes the DEC-103
   partial Audit entity and metadata Task-ref indexes. Neither is an
   authorized shared/production migration. Owner must approve an exact
   production physical access plan, validated on appropriate representative
   staging data. Do not silently invent a third `C` index.
2. **Real authorized request performance:** benchmark the full authenticated
   Live route, lock acquisition/wait, query, JSON and HTTP response at
   meaningful concurrency, mixed sparse/dense distributions and cold cache.
   Current SHARED Organization advisory lock is held through evidence read;
   synthetic lock-concurrency timing does not establish end-to-end p95.
3. **Writer authority races:** 16/16 PG tests model writer SQL/locks; they
   do not call all native StaffAuth refresh/logout, staff management role/grant,
   MFA, and lifecycle mutation entrypoints. Organization status and dashboard
   entitlement writers have not been identified as product APIs. Test actual
   writers or accept a focused external-writer lock contract first.
4. **HTTP/QA:** live Auth/MFA denial parity, cross-tenant/access revocation,
   real authorized local QA records, and independent actual DB-backed
   attribution completeness remain pending.
5. **UI:** Owner U-004 matched EN/AR Light/Dark narrow/wide/zoom screenshots
   and sign-off pending. A new focused standalone Retrieval Queue mounted
   test is PASS, but a legacy general R03 cursor-switch test still timed out
   with an older Company Admin chooser assumption; investigate separately
   before claiming the *entire* Dashboard E2E suite is green. The R03 Queue
   presentation test now passes after repairing the shared synthetic fixture
   to include mandatory nullable `task.assignee`. Existing Queue
   drawer-inside-tbody issue predates #276.
6. Final independent whole-diff review including physical-index/migration
   decision before code acceptance. No issue closure, PR, merge or deploy.

**Disposition:** viable code-first query + correctness recovery in protected
WIP; **NO-GO FOR PRODUCTION** until the above conditions close.

## 7. 2026-10-10 — real NestJS HTTP / restricted runtime discovery

The earlier #276 evidence used elevated read-only SQL and modeled auth races.
An added safety-gated native HTTP integration fixture now exercises the
**actual NestJS AppModule**, genuine Staff authentication, management writer
endpoints, and a freshly provisioned **restricted** runtime PostgreSQL role.
The fixture checks exact loopback 55449 user/cluster data directory and
requires an explicitly supplied isolated TEST_DATABASE_URL and
MIGRATION_DATABASE_URL before creating a uniquely owned disposable child.
It cleans up test databases and roles after each test process. Never use
the original Windows 5432 instance.

### Runtime SQL privilege defect reproduced and repaired

The first authorized real HTTP requests failed **500**, even for a valid
Location Manager with no historical rows. Direct runtime-role debugging
proved PostgreSQL SQLSTATE **42501**, permission denied for the row lock on
\`organization_subscriptions\`. PostgreSQL raw \`SELECT ... FOR SHARE\`
requires additional privileges intentionally withheld from the runtime role.
The earlier synthetic SQL tests had run with an administrator and missed
this security/integration mismatch.

The narrow fix in \`live-history-read-authorization.ts\` retains the
already-authorized SHARED Organization advisory lock and current membership/
Location/grant lock semantics, but invokes the existing grant-verified,
SECURITY DEFINER function
\`shift_presence_lock_management_entitlement(uuid,uuid,text,uuid)\` to
check the **exact current Staff session** and acquire subscription row
\`FOR SHARE\` under its bounded SQL permission contract. It removes the
raw runtime \`FOR SHARE OF subscription\` clause from the join while still
filtering for current dashboard entitlement. No new application role
privilege, schema migration or unrelated API endpoint was introduced.

This explicitly couples the #276 history-reader to a previously accepted
Shift Presence SQL helper. Any future migration that removes/changes that
helper needs contract coordination and a focused security review; no new
security decision has been silently asserted.

### Native authorizations and race evidence

The native HTTP integration runs through the actual registered Live
\`GET /v1/staff/dashboard/locations/:id/overview/live-sessions\` route:

- Missing bearer gets 401; valid LM gets 200; foreign-Organization Location
  never gets 200 or an unintended tenant-scoped identity.
- Real Staff refresh rotates the access credential; old token is denied.
  Native logout invalidates its replacement.
- Actual Company Admin management HTTP commands revoke the LM's Location
  grant, change role or deactivate membership: after successful mutation,
  historical Live read is denied. These are real writer services, not
  invented direct UPDATE SQL.
- A concurrent true Company Admin Location grant revoker waits on a separate
  transaction holding the Live-history reader's current row/advisory locks;
  it succeeds only after reader COMMIT, then fresh Live reads are denied.
- An actual Company Admin Location lifecycle sequence (read lifecycle ->
  stop intake -> deactivate) invalidates the Location for subsequent Live
  reads. Unlike the modeled race fixture, this test calls the actual
  registered management HTTP controller and lifecycle service.
- Company Admin Live read without valid current MFA is denied; an unauthorized
  foreign Location is denied without disclosing the MFA-step-up condition.
  The same CA succeeds at a currently authorized Location after actual MFA
  enrollment and step-up.
- The independently existing PG modeled authorization race suite still
  covers 16/16 success paths, including Organization, entitlement, Location,
  Staff Session, refresh generation, role, grant and MFA retirement. It
  does not exercise all of these as actual HTTP writers.

Final native NestJS HTTP fixture: **9/9 PASS** after adding CA MFA and
Location lifecycle scenarios. The independent modeled PostgreSQL
read/writer lock suite: **16/16 PASS** with the entitlement-helper change,
run together with 8 native tests on an earlier focused 24/24 run; the later
standalone native 9/9 rerun also passed. The final file has 291 physical
lines (under the repository 300-line limit), and targeted API TypeScript
and ESLint passed. This does NOT prove every possible production writer
interleaving.

### First authenticated populated-page latency

The isolated HTTP fixture inserts **50 fully synthetic, RFC-valid UUID
ValetSessions** and matching synthetic Vehicles (no completed Parking Task
or canonical Audit evidence). All returned sessions must be classified
\`NO_RECORD\` with no historical Parker; HTTP 200 and exact item count are
asserted by the strict live response transport.

First successful 7/7 run before adding the CA MFA case:

| Concurrent true HTTP requests | Group wall time on 50-session page |
|---|---:|
| 1 | 44.39ms |
| 4 | 169.85ms |
| 8 | 192.06ms |

This measures actual authentication, read authorization, query, parsing and
HTTP transport for a populated page with **no completed Task/Audit history**.
It is **not** the 4,000-evidence Dense100 authenticated workload, cold-cache
p95, repeated statistical measurement or an accepted endpoint SLA. The
existing synthetic isolated Dense100 EXPLAIN and read lock contention
numbers must not be confused with these HTTP timings.

The 9/9 native final rerun again returned exactly 50 NO_RECORD rows and
200 response for each authenticated request. Under simultaneous test DB
workload, group wall durations were 46.62ms (1), 230.95ms (4), and
367.35ms (8), illustrating that the individual wall numbers vary by run
and are not a statistically justified SLO.

**Remaining evidence for release:** actual HTTP Dense100 (representative
history and concurrent writer pressure), full cross-tenant negative
evidence scenarios, all real native Location lifecycle / presence / MFA
writer interleavings, unresolved source ownership of commercial/
Organization invalidation, U-004 Owner screenshot approval, repository
architecture baseline and independent final whole-diff security review.
No commit, push, migration, deployment or merge.
