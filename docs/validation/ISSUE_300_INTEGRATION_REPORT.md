# VAYLET Issue #300 — Local Backend and Concept A Live-Data Integration

> **Latest local continuation (`33fc913c9cba26453288ac148f080016cdf1902d`,
> 2026-10-18):** Three additional G2-only test scripts PASS. The four source
> types now have individually demonstrated signed HTTP Timeline continuation
> across a held writer transaction (precommitted control included, later COMMIT
> excluded until fresh snapshot). A direct-only cohort has authenticated
> signed Search for 106 Sessions and Timeline for 112 events, including
> 108 equal-time and duplicate cross-source UUID tests. Actual Supervisor
> Check-in and key-slot A→B→C commands produced five sourced Custody and
> three key Audit rows; CA/MFA Search proves historical A while CURRENT is C.
> See the U05 validation addendum for distinctions and retained G2 fixtures.
> All nine U05 gates remain PARTIAL/GAP at **full** criterion scope, no full
> T01–T70 acceptance or target-scale SLA, and indirect Audit linkage still
> fails closed. Concept A UI untouched; release operations not authorized.

> **U05 Option A update — 2026-10-18 (newest code candidate):** Owner approved
> **local-only** implementation of the three-source `xid8` migration.
> **`372e3cf4953a46c9ea5254426173eb456976126a`** adds migration **94/94**
> tested on independent G2 PostgreSQL 17.10 only, guarded signed keyset
> Search/Timeline and 6 executable SQL/HTTP proof scripts. A PostgreSQL
> late-link phantom for pre-snapshot indirect Audit→Task/Incident was
> **actually reproduced**, and a fail-closed cohort guard now returns 503
> instead of making false stable pagination claims. Current Location Incident
> visibility is signed into paging state; current role/MFA/access is still
> checked every request. The six dedicated G2 tests and 18 Search +18
> Timeline +12 static QA tests pass; U05-R01–R09 are **PARTIAL/GAP**,
> **not nine PASS**. Full U05 requires an additional Owner decision for
> immutable Task/indirect provenance or a protected materialized snapshot.
> Production pagination remains DISABLED. Exact statuses, commands and
> limitations: `issue300/U05_OPTION_A_LOCAL_VALIDATION.md`. No UI changes.
> An additional locally tested Issue300 performance code commit
> `5c3f8da2eb4ee939210d9d35fb78dbeb58926783` removes repeated reason
> aggregation. A committed 3,500-Session/900-event G2 witness fixture still
> yields **p95 ≈970ms (warm, single client)**; target performance is NOT PASS.
> **Later actual-writer subsets:** task-only authenticated Supervisor HTTP
> Incident creation/idempotent retry and Dispatch assign/reassign were
> executed on G2, with persisted XIDs and Company Admin MFA Timeline/detail
> readback. User, Session and Shift were direct SQL setup fixtures, **not**
> proof of their operational writers. Full T01/T70 and R09 remain GAP.
> Fresh `d6b75b56` G2 HTTP/Playwright regression also PASS: real CA/LM MFA,
> Supervisor and foreign denial, revoked grant and Staff session, real
> authenticated Investigation search/detail, focus/Escape, aborted network
> read recovery, and 32 **synthetic** responsive panel cases. Synthetic CSS
> zoom is **not** proof of physical 200%-zoom equivalence; keep T58/T59 GAP.
> No push, PR, main merge, deployment, production migration or closure.

> **Authoritative G2 continuation (2026-10-18):** This report's older G1
> sections below describe the previously tested `3210555c` code only; the
> current **reviewable local code candidate** is
> **`f90c3cabbff07c57df57ee783f052b30a70b0a21`**, building on
> `961f324f` and `4b0b4ac3`. An independently owned PostgreSQL 17.10 database
> `issue300_g2` at `127.0.0.1:55480` was established and its **93/93**
> migrations applied. The **CURRENT candidate** API was compiled on local
> `3161` and the Dashboard loaded from the Prime worktree at `3113`. The
> independent signed authenticated CA/LM/foreign/Supervisor/MFA and 4-source
> HTTP tests, a real first-session/detail/Escape/focus browser pass, one
> network abort/manual recovery, 32 synthetic panel-smoke cases and PostgreSQL
> late-commit race proof executed. **These are not T01 actual domain-writer,
> U05 cross-source stable pagination, full T58–T70 browser or target-load
> acceptance. Full Issue #300 acceptance remains NOT ACHIEVED.** Exact latest
> test commands, candid limitations and source coverage are in
> `issue300/G2_RUNTIME_EVIDENCE.md`, original Section 27 traceability is in
> `issue300/T01-T70_ACCEPTANCE_LEDGER.md`, and Owner-dependent forward-only
> architecture/DDL gates are in `issue300/U05_SNAPSHOT_DECISION.md`.
> **No push/PR/main merge/deployment/production migration/Issue closure.**

Date: 2026-10-17. **Candidate, not release-approved.**

## Authority and Git baseline

- Owner approved U01–U06, final Concept A UI Freeze, and later a **narrow exception only to connect real authorized data to that UI**. No redesign, CSS, route/shell restructuring, or new navigation was authorized.
- Frozen UI baseline `0d5d0482` (branch `feat/issue-300-concept-a-ui-integration`). Master Plan base `2f1311575507eae06c6166270e748687762fb508`.
- Main remains `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`; isolated integration worktree `tmp/issue-300-prime-integration`, branch `codex/issue-300-prime`.
- Initial live-data wiring SHA `cc5f4390b54cfda39fa1f7f3671caff875f48c05`; independent static QA integration `2e227819`; **final tested code candidate SHA `3210555cc316cb735e89327c0460bae3d016d275`**. Any later report-only amendment is not a change to this tested code SHA. The initial wiring SHA alone is **not** the final candidate.
- Worker deliveries: W1 `f1b6f579`, W2 `c09c5000`, W3 `bfef2a95`, W4 `2062531f`, W5 `737cb029` and LIVE `4a8e6fb1`, W6 `42814161` and LIVE `b66ec440`, W7 `7d15abba` plus CRLF correction `97a1df23`.
- **No push, PR, merge to main, deployment, production migration, or Issue closure.** Existing local owner scripts and frozen UI worktree remain untouched.

## Implemented source surfaces

| Area | Local implementation and boundaries |
| --- | --- |
| Contracts | Strict bounded Zod search, selectors, four-source timeline, safe detail, coverage/current labels, signed-cursor payload and types in `packages/contracts/src/audit-investigation-*` |
| Search | `GET .../audit-investigations/sessions` and `/filters`; canonical Session same-window AND with independent persisted KeySlot and employee witnesses; `AUDIT`, `KEY_CUSTODY`, `DISPATCH`, `INCIDENT` sources; verified direct/entity/Task/Incident link guards; current vehicle identity differentiated from history |
| Timeline | `GET .../sessions/:sessionId/timeline` and `/events/:source/:eventId`; exact scoped source IDs, time/rank/UUID order, persisted actors/assignee roles, unknown-event minimal projection, Incident privacy, nullable RELEASED slot |
| Security | Existing Management Audit live staff-session/MFA/role/location/commercial checks composed by investigation-only W4 guard; CA/Location Manager only, no Supervisor elevation; direct/indirect event detail resource containment before projection; current Incident active-Location gate |
| Cursor | Purpose/scope/active staff-session/filter keyed digest in signed opaque transport; validation implemented, but strong cross-request four-source pagination remains **disabled** pending U05 DB proof |
| Live frontend | New `investigation-live.tsx` replaces fixture-only route rendering; real selected Location, authenticated scoped selectors, true UUID/time filter, AbortController/generation cancellation, search→timeline→independently authorized detail; W5/W6 typed adapters and safe data projection |
| Existing Audit Events | Audit Events component/API/scope retained as separate tab and never mounted while Investigation tab selected |

The backend deliberately rejects cursor or overfull first-page results with explicit safe 503 errors rather than claiming a full/snapshot-stable history. This is a **known functional limitation**, not complete pagination.

## UI Freeze comparison and narrow exception

- G0 baseline manifest: `tmp/issue300-g0/FROZEN_UI_MANIFEST.json`, **124 files**. Verification initially passed all 124 Git blobs on original frozen branches.
- Following Owner's live-data exception, the only pre-existing protected UI files intentionally changed are `audit-page.tsx`, `investigation-demo-types.ts`, `investigation-search-panel.tsx`, `investigation-workspace.tsx`, and `investigation-event-drawer.tsx`. These change source wiring, current/recorded values, real date/UUID display, and misleading Demo/Incident fixed copy, not CSS layout. New standalone data client/model/adapters/coordinator files were added.
- `git diff 0d5d0482..HEAD -- apps/dashboard` shows **zero CSS changes**. Existing Sidebar, Header, tab structure, grid, focus containment, contextual Help, and responsive class names are retained.
- **Do not describe post-exception 124/124 hash equality as a PASS.** Five protected files necessarily differ by explicit Owner data-only exception. All other 119 match G0; exact rendered cross-locale/zoom parity still needs independent G2 browser proof.
- Production routing remains subject to the pre-existing explicit review URL opt-in. Development Audit tab remains discoverable for current CA/LM Location scope. No Supervisor access.

## Focused tests and evidence (not substitutes for DB/HTTP)

- Reviewed contracts focused tests: **17 passing**, contracts typecheck/ESLint passing.
- Security focused tests: **26 passing**, API typecheck/lint passing on integration candidate.
- Historical search first-page focused API mock tests: **13 passing**, including a contradictory Vehicle/Audit reference regression.
- W3 Timeline source/order/privacy/authorization Node mock tests: **18 passing**, including inactive Incident coverage regression. Actual writer data not exercised.
- Frontend Concept A/W5/W6 scoped integration Vitest after live data-source repairs: **41 passing in 7 suites**; Dashboard TypeScript/ESLint passing. These do not verify a real database.
- W7 static oracle suite: **15 passing** (10 synthetic domain oracles + 5 disposable lease guards). T01–T70 exact acceptance ledger complete at `docs/validation/issue300/T01-T70_ACCEPTANCE_LEDGER.md`; **real DB/HTTP/browser/concurrency/performance lanes remain GAP** until executed and documented.
- `pnpm architecture:check` returned exit 0 with pre-existing grandfathered unrelated file-length warnings. New authored code stays at or below 300 physical lines per file. `git diff --check` passed.
- Post-exception QA `node scripts/validation/issue300/verify-live-ui-exceptions.mjs . tmp/issue300-g0/FROZEN_UI_MANIFEST.json`: **119/124 original files unchanged and 5/5 data-only exceptions accounted for; no CSS/Help/Shell source differences.** This is STATIC, not rendered browser parity.

## Historical G1 acceptance gaps — superseded where G2 evidence explicitly proves a newer result

1. **U05 PostgreSQL cross-source snapshot:** Current Prisma schema has immutable `pagination_birth_xid` for AuditEvent and ValetSession only, not KeyCustodyEvent/DispatchEvent/Incident. Strong late-commit stable continuation needs approved forward-only birth-XID/index/rollout/grants design and real two-connection proof. Until then pages exceeding the safe first-page limit fail closed. No migration authored or executed.
2. **Owned PostgreSQL environment:** Provisioning an isolated task-owned PostgreSQL 17 at port 55430 was blocked by tool safety checks. The already-running local `valet` database on 5432 is shared/non-task-owned and was **not** used for Issue #300 DB, writer, migration, HTTP, benchmark, or regression acceptance.
3. **Real production-equivalent HTTP/browser proof:** The existing healthy `localhost:3001` API and `localhost:3013` Dashboard were started from the *older main/frozen-preview sources*, not this candidate. Their HTTP 200 readiness does **not** prove that the new Issue #300 endpoints or live UI have run end-to-end. Real CA/LM authorization/revocation/Incident/late-commit cases await a separately controlled service/database runtime.
4. **Owner review and public release:** Maintain Owner-approved data-only UI exception, run dedicated rendered EN/AR RTL/LTR 320/390/768/1440/true zoom 200% checks on this candidate, and seek explicit publication approval after actual DB/HTTP proof. Do not restore misleading Demo copy for live records.
5. **Large selector sets:** Slot-code input now refines its `KEY_SLOT` selector request with the typed exact-code prefix and refuses ambiguous/incomplete responses. The existing native Employee select still initially exposes at most the first 20 scoped member options: members outside that bounded list require a future access-safe searchable selector/continuation design. Do not claim full U01 employee discoverability for large Locations.
6. **Independent QA follow-ups:** Source-based reviewer found and Prime corrected timeline's missing discovery-context before/inside/after classification, transient selector query retry via existing Apply, and timeline/detail API auth-reconciliation cancellation callbacks. Typed slot-code search now requests bounded exact-prefix suggestions rather than treating the first 20 global slots as complete. Their browser race/authorization behavior still needs G3 execution.

## Original G1 verdict (historical; current verdict is in the authoritative G2 notice above)

**Local typed/backend/frontend implementation candidate exists and is covered by focused static and mock tests, but full Issue #300 definition-of-done is NOT met.** Pagination proof and real PostgreSQL/HTTP/actual-writer/browser/performance/security acceptance remain explicit, blocking gaps. No production deployment or Issue closure authorized.
