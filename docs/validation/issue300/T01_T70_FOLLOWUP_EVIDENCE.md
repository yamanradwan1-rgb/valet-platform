# Issue #300 — W7 Independent Follow-up Acceptance Evidence

**Date:** 2026-10-17; **Candidate:** `6213fe1d2b7389c3cf07d4902d1417b81fd1b2f6`.
**Worktree/branch:** `tmp/issue-300-followup-w7` / `codex/issue-300-followup-w7`.
**Mode:** read-only inspection of existing source; only new W7 QA tests and this document.
No PostgreSQL connection, process termination, new browser, HTTP load, CI, app or CSS edits.
The canonical `T01-T70_ACCEPTANCE_LEDGER.md` is unchanged.

## Reproduced checks

| Command, from worktree | Actual result | Proof level |
| --- | --- | --- |
| `node scripts/validation/issue300/run-static-qa.mjs` | **PASS**: 10 synthetic oracles, 5 local DB-lease guards, 70 criteria parser | ORACLE / STATIC; no actual writer/DB |
| `node scripts/validation/issue300/verify-live-ui-exceptions.mjs . ../issue-300-prime-integration/tmp/issue300-g0/FROZEN_UI_MANIFEST.json` | **PASS**: exactly 119 G0 identical SHA256 files and five explicit source-data exceptions | STATIC integrity, not rendered UI parity |
| `node scripts/validation/issue300/verify-frozen-ui.mjs . ../issue-300-prime-integration/tmp/issue300-g0/FROZEN_UI_MANIFEST.json` | **EXPECTED FAIL**: exactly five Owner-approved source exceptions; strict original 124 equality no longer valid | STATIC, not regression |
| `node --test apps/api/test/issue300-qa/*.test.mjs` | **8 PASS, 2 FAIL** (both are intended regression signals for Task/Incident Audit references) | STATIC source regression, no SQL execution |

Node modules are absent from the W7 worktree. No full API/Dashboard package/typecheck,
Vitest, Playwright, running server or real Postgres tests were performed here.

## P1 candidate: search/timeline inconsistent canonical Audit source reference

**Search:** `apps/api/src/modules/management/audit-investigation/search/search-witness-sql.ts:19-26,33-59`.
The Session can be resolved from the Audit row's valid **direct** `valet_session_id` even when
`a.entity_type='Task'` or `'INCIDENT'` identifies an unrelated/nonexistent resource.
The nullable guards at **54–55** (`task_ref.id IS NULL OR ...`, `incident_ref.id IS NULL OR ...`)
allow failed LEFT JOIN references to qualify instead of rejecting them. In contrast,
**Timeline:** `apps/api/src/modules/management/audit-investigation/timeline/timeline-source-query.ts:77-85`
requires matching `linked_task.id` / `linked_incident.id` for those resource entity types.

**Proposed disposable-DB reproduction (NOT executed):** Create authorized Session S, Member M
and valid time `[14:00,15:00)`; insert a *malformed-legacy-only test* Audit row in the same
Organization/Location with `valet_session_id=S`, `actor_membership_id=M`, event time 14:30,
`entity_type='Task'` and `entity_id` pointing to an absent Task or Task of another Session;
repeat with `entity_type='INCIDENT'` and absent/wrong-Session Incident. Search by Session S
and Member M. The W2 witness SQL allows these rows into matched source identities while W3
omits those IDs from the same Session's full timeline and detail. This contradicts T15/T21
and the single truthful source-reference contract. **Do not conflate with leakage of the
foreign record itself; the observed defect is false same-session evidence attribution.**

**Recommended Prime/W2 fix:** require positive matching canonical same-Org, same-Location,
same-Session Task/Incident joins whenever Audit `entity_type` declares that family,
including when direct Session exists. Align supported case spellings with W3 and add the
two new W7 red tests. Re-run on a *disposable* Postgres after unit green; no shared DB.

## Other scoped observations

**Static PASS (not runtime acceptance):** `audit-page.tsx:164-175,186-192` renders native
Audit Events only on its own tab; no hidden native `useAuditPage` mounted in Investigation.
`audit-scope.ts:51-68` keys remount across identity/session/selection revisions;
`investigation-live.tsx:67-92,145-158,207-231,254-270` aborts pending reads and
fences search/timeline/detail, and API transports propagate auth reconciliation.
`audit-investigation-authorization.ts:27-56` composes the established persisted
CA/LM Location guard. `audit-investigation-source-boundary.ts:47-81` binds source, UUID,
exact Session, Location, Organization; Incident detail also enforces ACTIVE Location.

**Source provenance:** `investigation-live-projection.ts:71-126,129-207` preserves actual
source-qualified UUID identities, persisted UTC occurred/recorded times, current-label
basis, nullable incident type/status without invented KEY_MISSING/OPEN or photos.
`timeline-safe-projection.ts:94-139,145-225` enforces known event types and safe details;
unknown Audit type has minimal actorless/reference-limited projection. Actual HTTP redaction
and DB roles are **GAP**. The documented 119 identical plus five approved data-only
exceptions have no implied authorization for CSS/DOM redesign; browser dimensions/RTL/
keyboard/focus still require independent acceptance.

**P2 / known availability restriction:** `investigation-live.tsx:99-115,170-206` loads at
most 20 visible Member choices. An authorized member past the first page cannot be selected
even if their canonical ID is valid. Prime's integration report §Unresolved(5) already
acknowledges this; future searchable/continued scoped selector necessary. Typed slot-code
refinement now addresses many-slots case (different from the older failed implementation).

**Performance/U05 GAP:** `search-witness-sql.ts:11-117` builds materialized four-source
witnesses across a selected Location/time before final vehicle filters. Worst-case skew
and cost depend on actual indexes/cardinality; no EXPLAIN or p95 measurements exist here.
`audit-investigation-search.service.ts:66-69,99-111` and
`timeline-read-service.ts:83-96` fail closed instead of inventing stable >limit keyset
pagination. This is a correct safety boundary but **not** complete T40–T44/T62–T65 acceptance.
Real writer/DB/HTTP/CI/browser, revocation lock-order and race proof remain unrun.

## T01–T70 follow-up coverage register

| IDs | Static disposition | Required proof still GAP |
| --- | --- | --- |
| T01–T14 | Existing synthetic/adapter oracles (partial); no new source defect proven | Actual writer, real PG and joined-source identities |
| **T15** | **FAIL STATIC**: Task reference may be invalid despite direct Session | Malformed-legacy disposable PG regression |
| T16–T20 | No new P0/P1 observed in source | Writer/DB and privacy HTTP |
| **T21** | **FAIL STATIC**: Incident Audit reference may be invalid despite direct Session | Real Incident+Audit pairing and malformed reference PG |
| T22–T29 | Existing bounded incident/direct/unknown protections seen statically | Incident resource HTTP and actual DB |
| T30–T39 | Exact `[from,to)`, source IDs, rank and UTC seen statically | Real writer/DB, timezone/UX and equal-time order |
| T40–T44 | Stable continuation deliberately disabled; U05 incomplete | Multi-connection late commit, true snapshot, live correction |
| T45–T55 | Scope/auth, source detail and no-store route checks observed statically | Current CA/LM/Supervisor/session/MFA/commercial HTTP + domain-write comparison |
| T56–T61 | Generation/abort fences; no hidden Events hook; safe Incident view statically | Actual auth-refresh race, browser focus RTL, #275 regression |
| T62–T65 | No measurements; large history deliberately fails closed | EXPLAIN, benchmark, locks, migration, grants; isolated PG lease |
| T66–T70 | Strict bound/no raw selector shape checks statically | HTTP fuzz, source outage, count union, disconnect/retry |

**Verdict:** Source-only **P1 candidate requires resolution or explicit Owner disposition**
before a production-quality G2/G3 verdict. Eight new static regressions PASS; the two red
checks are genuine blockers, not a CI run or executed exploit. No actual T01–T70 row is
upgraded to full acceptance without its mandated independent evidence level.
