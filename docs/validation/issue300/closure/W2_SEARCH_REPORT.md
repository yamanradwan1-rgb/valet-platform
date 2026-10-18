# Issue #300 R2 — W2 Search / Selectors / Integrity Report

## Scope and authority

- Baseline: `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`.
- Worktree: `tmp/issue-300-r2-w2-search`; branch `codex/issue-300-r2-w2-search`.
- Owner R2 U-001–U-005 and UI-M1 approved locally; no publication or production actions.
- Source changes limited to W2-owned Search and selector modules. Contracts,
  Timeline, auth/security gates, UI, schema and migrations are unchanged.
- No ValetSession or Task/Dispatch transition, new policy or writer mutation.

## Changes

**F03 — canonical selector participation.** The Audit membership-discovery
predicate now demands the same scoped Task/Incident/Session containment as
the Search Audit source arm. For `VALET_SESSION_PARKED`:

1. `metadata_json ? 'taskId'` distinguishes an absent key (permitted when
   another canonical association proves the Session) from JSON `null`
   (present invalid reference, rejected).
2. A Task entity must be `PARKING` and, when both entity Task and metadata
   Task are present, the **exact persisted Task ID must match**. Two Tasks in
   one Session do not prove the same event relation.
3. Metadata Task is also `PARKING`, and both parent links must resolve inside
   the exact tenant/Location and same Session.
4. PARKED's entity allowlist is `ValetSession` or `Task`. Existing known
   Audit actor type and event-type allowlisting remain. Other source families,
   inactive-member history and canonical UUID selection remain unchanged.

**F01 — conservative generic Audit integrity coverage.** Search now makes
an additional parameterized query in the same already-authorized transaction,
using the exact Organization, Location, `[from,to)` and captured `S0`
source/parent insertion boundaries. It reports only response-level
`coverage.AUDIT = {status: PARTIAL, reason: INTEGRITY_ANOMALY}` for proven
contradictions: mismatched direct Session/Vehicle/Task/Incident reference;
malformed present PARKED taskId, wrong PARKING Task type, unsupported PARKED
entity, or distinct canonical entity/metadata Tasks. It returns one boolean,
never rejected Audit IDs, counts, membership identifiers, foreign labels,
raw metadata or an inferred Session link. Individual matched Session coverage
is not changed merely by a Location-level anomaly.

Missing/uncommitted parent at S0 is **not** by itself an integrity anomaly:
late parent birth cannot be mistaken for corruption. Unproven association
anomalies may remain unreported (conservative false negatives). A source
query failure fails the Search response, not a partial success page.
Matching record counts and reasons still come from admitted source/id witnesses.

**U-003 — mutable CURRENT vehicle identity.** Existing fail-closed
`InvestigationSnapshotPaginationUnavailable` on >limit current Make/Model/
Plate/PlateCountry results is preserved. There is no whole-cohort revision
detector and no cursor claiming such a snapshot. Historical-only signed keyset
continuation and current-label semantics are preserved.

## Verification

Completed against the isolated W2 worktree:

- `pnpm install --offline --frozen-lockfile --ignore-scripts`: succeeded
  from local dependency cache; no lockfile/source edit.
- `pnpm --filter @valet/api typecheck`: **PASS**.
- Focused ESLint for three changed modules and new test: **PASS**.
- `pnpm architecture:check`: **PASS** (reported only previously
  grandfathered files).
- `git diff --check`: **PASS**.
- Existing Search/selector Vitest subset: **14/14 PASS**.
- New `test/issue300-closure-search.integration.test.ts` is classified
  `api-postgres-standard` by the test harness. It covers sole Audit
  membership witness and absent/JSON-null, same-Session two Task IDs,
  PARKED RETRIEVAL, unknown entity, foreign Task scope, cross-Session metadata,
  wrong Location and generic anomaly/late-parent behavior. Its DB tests
  create only temporary PostgreSQL tables in a rollback transaction and are
  explicitly gated on `ISSUE300_R2_W2_DB_LEASE=GRANTED` and the exact
  `127.0.0.1:57285/issue300_r2` connection identity.

**Not executed:** new DB integration tests, actual signed HTTP, privileged
role access, Q1/Q2 EXPLAIN, warm/cold/scale/writer p95. W6 currently owns the
dedicated PostgreSQL lease; W4 follows it before W2. These remain **GAP**,
not passing results. The new SQL adds one scoped `EXISTS` read per successful
Search request; its measured overhead is unknown.

## Outstanding proof and gate

After Prime explicitly transfers the owned DB lease to W2:

1. Run the new temp-table integration test with exact lease variables.
   Independently verify all accepted/rejected combinations through actual SQL,
   including null/parent/S0 semantics and zero foreign information in response.
2. Obtain `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for the baseline Search
   and the extra integrity probe, with retained fixture/plan identity.
3. If measured budgets fail, compare no more than Q1/Q2 reviewed query
   candidates; any single index experiment is Prime-owned and requires
   justification. Re-run same-session AND, source/id deduplication and cursor
   ordering on the winning candidate.
4. W7/Prime subsequently prove actual-role authorized signed HTTP and
   multi-page source/parent cohorts and reconcile T02/T06/T09/T12/T15/T24/
   T29/T30/T31/T32/T35/T37, R01–R09 and performance evidence.

No full closure, production readiness or Search performance PASS is asserted.
