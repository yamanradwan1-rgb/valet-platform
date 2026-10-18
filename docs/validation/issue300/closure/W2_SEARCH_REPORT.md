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

1. `metadata_json ? 'taskId'` distinguishes an absent key (permitted for
   direct Session association OR exact independently anchored Session-entity
   EVENT-only) from JSON `null` (present invalid reference, rejected).
   NULL-direct PARKED with absent metadata never certifies actor or Task.
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

### W4 P1 corrective follow-up — independent historical anchors

The first W2 commit `318e4f8405762017c7cfae9de99964c45ff37e3a`
retained legacy NULL-direct Audit association through Task/Incident/PARKED
current parent ownership. W4 correctly flagged the mismatch with R2 §7.1.
The corrective diff now admits a Search Audit source only where the Audit row
persisted the exact scoped `valet_session_id`, or itself directly identifies
the scoped Session via `entity_type = ValetSession` and matching `entity_id`.
A NULL-direct PARKED entity-Session with absent `taskId` contributes only
its safe persisted EVENT, without actor/Task enrichment or automatic anomaly.
Present JSON-null or wrong Task hints remain excluded. A Task, Incident, or PARKED parent alone cannot resolve a
Session, even if both source and parent birth XIDs are set or equal.
Canonical writers explicitly store direct Session for TASK_*, INCIDENT_OPENED,
and PARKED; current parent relationship is not historical proof.

Selectors use that same Audit admission predicate. An older NULL-birth
explicit Session-entity Audit may remain a window witness, but its actor does
not qualify an employee selector or Search employee match, consistent with
Timeline's UNVERIFIABLE safe projection. Direct legacy source facts with a
validated Session retain their own evidence subject to separate S0 visibility.
Source, Task/Incident/metadata-parent, and Session birth-XID snapshot fences
remain separate; the original witness count, same-Session AND and signed keyset
have not been widened.

The response-level Audit integrity check now flags a NULL-direct
Task/Incident source as a **generic Location-only** anomaly on independently
scoped Audit/window/S0 evidence. Absence of PARKED Task metadata with a valid
independent Session-entity anchor is **not** an anomaly. Its Task/Incident/
PARKED parent joins are now independently restricted to the **same** tenant,
Location and parent S0 before any comparison. Neither presence nor status of
a foreign parent may alter the returned boolean. No record ID, rejected count,
or guessed Session/actor is emitted.

The new gated adversarial suite also evaluates the actual Audit SELECT arm,
rejecting legacy Task-only, Incident-only and PARKED Task-only sources,
comparing sole-member selector participation with Search admission,
preserving direct and explicit Session witnesses, and testing foreign-parent
existence neutrality. The PostgreSQL assertions were executed under the
isolated W2 exclusive lease, with the additions for absent-metadata legacy
PARKED EVENT-only admission, suppressed historical actor and no anomaly.

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
  `api-postgres-standard` by the default test harness, but was executed
  using an exclusive one-file Vitest configuration that does **not** launch
  the harness's shared PostgreSQL service. It covers sole Audit
  membership witness and absent/JSON-null, same-Session two Task IDs,
  PARKED RETRIEVAL, unknown entity, foreign Task scope, cross-Session metadata,
  wrong Location and generic anomaly/late-parent behavior. Its DB tests
  create only temporary PostgreSQL tables in a rollback transaction and are
  explicitly gated on `ISSUE300_R2_W2_DB_LEASE=GRANTED` and the exact
  `127.0.0.1:57285/issue300_r2` connection identity. **13/13 PASS**
  (four static + nine actual disposable PG17.10 TEMP/ROLLBACK cases).
- Exact runtime role `issue300_r2_w6_runtime` was checked independently
  on the loopback PG17.10 instance. `CREATE TEMP` under runtime role failed
  with the expected privilege denial; only W6-derived **disposable owner**
  credentials were used for temporary fixtures inside `BEGIN`/`ROLLBACK`,
  never to widen runtime grants. Runtime role was used separately for Q1/Q2.

### Actual-role bounded query evidence

Same disposable PG17.10 DB, exact runtime role, captured `pg_snapshot`,
synthetic scoped Organization/Location, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
once per exact query, then **20** warm executions each inside read-only
transaction. Two plans only, no schema or index changes:

| Statement | Planning ms | Execution ms | Shared hit / read | Actual root rows | p95 / 20 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Q1 full four-source Search | 30.285 | 1.541 | 10 / 0 | 0 | 14.783 |
| Q2 F01 integrity EXISTS | 0.761 | 0.140 | 1 / 0 | 1 boolean | 4.635 |

**Measurement limitation:** These are read-only warm timings for an
**empty matching scope**, not a validated populated 100k/1m cohort, cold-cache
trial, writer-overlap p95, or production-performance proof. A speculative
index cannot be justified from this baseline and was not created. The extra
scoped `EXISTS` read per Search request remains an unqualified performance
cost pending W7 scale/writer evidence. No raw tenant/customer data or secrets
were printed. All SQL connections were closed. W2 explicitly released the
exclusive lease to Prime/W7 immediately after bounded proof.

**Not executed:** actual signed HTTP, authorization multi-page concurrency,
populated-scale and overlapping writer p95. Those remain GAP.

## Outstanding proof and gate

The exclusive W2 DB lease has **already been transferred back to Prime/W7**.
The remaining independent gate is W7/Prime proving actual-role authorized signed HTTP,
populated scope Q1/Q2 scale/writer p95 and
multi-page source/parent cohorts and reconciling T02/T06/T09/T12/T15/T24/
T29/T30/T31/T32/T35/T37, R01–R09 and performance evidence.

No full closure, production readiness or Search performance PASS is asserted.
