# Issue #300 R2 — W3 Timeline and safe detail report

Status: **LOCAL SOURCE IMPLEMENTED; DATABASE/HTTP ACCEPTANCE GAP**

## Authority and ownership

- Approved scope: R2 U-002 / §7.1, Owner final R2+UI-M1 execution authorization.
- Frozen source: `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`.
- Worktree/branch: `tmp/issue-300-r2-w3-timeline` / `codex/issue-300-r2-w3-timeline`.
- Source edits: `timeline-source-query.ts`, `timeline-read-service.ts`,
  `timeline-safe-projection.ts`, `timeline-indirect-audit.ts` under
  `apps/api/src/modules/management/audit-investigation/timeline/`.
- New owned test: `apps/api/test/issue300-closure-timeline.integration.test.ts`.
- No contract, controller, Search, security-boundary, migration, UI or DB edits.

## Changed behavior

1. **Evidence confidence:** all four Timeline source arms return an explicitly
   projected quality basis. Independently scoped direct Audit facts remain
   `RECORDED`; only Audit evidence independently anchored by the source's
   own immutable matching `ValetSession` entity reference may be admitted
   without a direct Session FK. Post-cutover entity-only rows are `PARTIAL`;
   legacy NULL-birth entity-only rows are `UNVERIFIABLE`. Both suppress Audit
   actor/name enrichment. Unknown Audit kinds remain `UNKNOWN`/`UNVERIFIABLE` and do not
   disclose raw event kind or metadata. Legacy direct sources retain persisted
   facts and are not assigned fabricated birth XIDs or historical identities.
2. **Indirect relation safety:** canonical Task, Incident and PARKED writers
   all persist a direct Audit→Session FK. A NULL-direct Audit with only a
   current Task/Incident/PARKED parent is therefore excluded, even if birth
   XIDs are equal or ordered: neither proves that relation at event time.
   An entity-only `ValetSession` anchor must match the exact authorized
   Session; a PARKED variant must also carry a valid canonical same-session
   PARKING Task reference. Present-but-JSON-null `taskId`, conflicting
   Task/metadata IDs, wrong Task type and foreign scope remain excluded.
   No synthetic association or actor arises from late/legacy parent existence.
3. **Scoped F01 signal:** a separate bounded `EXISTS` checks malformed Audit
   evidence **only when `audit.valet_session_id` independently anchors the
   authorized Session** and the Audit row is admitted in the read snapshot.
   If present, Timeline's `AUDIT` coverage becomes
   `{status:PARTIAL,reason:INTEGRITY_ANOMALY}`; it returns no rejected ID,
   count, metadata, wrong-tenant reference or actor. No Session signal is
   synthesized for indirect-only mismatches. Only independently provable
   source contradictions and snapshot-visible positive parent conflicts set
   this flag; an absent/uncommitted/post-S0 Task or Incident is not treated
   as proof of corruption. W2 owns the corresponding
   Location-level Search indicator. Quality, source coverage and
   `nextCursor` exhaustion remain separate response properties.
4. **F02 evidence lock:** indirect point-detail containment now uses
   `FOR SHARE OF session` without locking append-only `audit_events` rows.
   The same request still authorizes scope, locks/validates Session, checks
   the canonical indirect link and re-fetches its exact `(source,eventId)`
   independently of Search S0. W4 owns the matching direct-boundary fix and
   actual provisioned-role race verification.
5. **Four-source invariants:** AUDIT / KEY_CUSTODY / DISPATCH / INCIDENT rank
   order, `(occurred_at,rank,id)` keyset and 100-row lookahead are unchanged.
   No related event or synthetic transition is created; source query errors
   reject the whole page. Incident's current active-Location disclosure rule
   and CURRENT status basis remain in place.

### W4 P1 follow-up — absent versus present-null PARKED Task hint

The W1 independent `issue300ExpectedParkedLink` oracle permits an **absent**
`metadata_json.taskId` for a source with its own valid Session anchor; it
explicitly rejects **present JSON null** and a mismatched/late/foreign or
wrong-type Task. Timeline now retains that anchored Audit **event fact** even
when `taskId` is entirely absent. Directly anchored missing-hint PARKED has
`PARTIAL` quality; legacy NULL-birth Session-entity-only PARKED has
`UNVERIFIABLE` quality. Neither receives an inferred Task, responsibility,
actor/participants, related evidence or custody transition.

When `taskId` is present it must be a JSON string resolving to a canonical
same-Organization/Location/Session PARKING Task visible under the selected
snapshot. Explicit JSON null, non-string, wrong type, missing/invisible or
conflicting references remain excluded. The NULL-direct point-detail
containment uses the same absent/present condition, retaining the Session-only
lock and an independent final four-source read. F01's scoped integrity signal
no longer treats the absent hint alone as corruption; only a **present invalid**
type or an independently visible contradictory relationship can trigger it.
This classification deliberately does not assert that missing Task metadata
proves writer corruption across legacy cohorts.

Coordination: at the time of W3 inspection, W2's Search/selector branch
still required a Task hint for NULL-direct Session-entity PARKED and flagged
its absence as an anomaly.
Prime was informed to align W2's owned files and consider suppressing
unsupported PARKED actor/employee witness when the hint is absent. The W3
commit alone cannot establish cross-reader parity until W2's update lands.

## Checks run on this isolated worktree

| Check | Observation | Evidence level |
| --- | --- | --- |
| `pnpm install --offline --frozen-lockfile --ignore-scripts` | PASS; unchanged lockfile | Tooling |
| `pnpm --filter @valet/api typecheck` | PASS | Static |
| Focused ESLint for four sources and W3 test | PASS, zero warnings | Static |
| `pnpm architecture:check` | PASS; existing grandfathered non-W3 warnings only | Architecture |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/issue300-closure-timeline.integration.test.ts` | **6/6 PASS** after missing-hint follow-up | Local mock/contract and SQL-shape validation only |
| `pnpm --filter @valet/api exec node --test test/issue300-timeline/timeline-provenance.test.mjs test/issue300-timeline/timeline-indirect-audit.test.mjs test/issue300-timeline/timeline-boundaries.test.mjs` | **15/18 PASS; 3 stale-harness failures** | Existing non-DB regression |
| `git diff --check` and ≤300 physical source/test lines | PASS | Structural |

The two failing legacy boundary tests use a VM stub of
`./timeline-indirect-audit` missing the new
`hasAnchoredTimelineAuditAnomaly` export and omit its read in expected calls
(`apps/api/test/issue300-timeline/timeline-boundaries.test.mjs:114-119,
188-207,228-236`). The third old test explicitly requires the **removed
unsafe** `FOR SHARE OF session, audit` form
(`apps/api/test/issue300-timeline/timeline-indirect-audit.test.mjs:60`).
Those files are outside W3 ownership; Prime was notified and owns updates.
Do not call the old suite fully passing before its corrected run.

## Required independent proof — still GAP

- Dedicated PostgreSQL lease, W6 actual ordinary runtime role/GRANT proof, and
  W4 four-source direct/indirect detail and writer-lock race verification.
- SQL executed against actual Option B migration 94–96 catalogs with held
  transactions: legacy NULL entity anchors, late parent, conflicting
  Task/entity/JSON-null, foreign scope, immutable marker and missing parent.
- W1 independent association oracle and W7 signed HTTP S0/S1 first/next
  pages across all four source types, >100 equal-time ties, exact source/id
  identity, stable cursor, malformed relationships and detail reauthorization.
- Bounded query plan/latency for the extra per-Timeline `EXISTS` under 100k/1m
  workloads and concurrent operational writers; no latency number is claimed.
- Search-side generic Location anomaly depends on W2. UI confidence/coverage
  language depends on W5, and final runtime/browser qualification on W7.

No database or HTTP commands were run: W6 held the sole R2 PostgreSQL lease.
No push, PR, merge, deployment, production migration or issue closure occurred.
