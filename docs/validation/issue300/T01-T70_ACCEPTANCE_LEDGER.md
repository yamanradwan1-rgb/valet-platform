# Issue #300 — Independent T01–T70 Acceptance Ledger

**Owner:** Worker 7 (independent QA). **Base SHA:** `2f1311575507eae06c6166270e748687762fb508`.
**Status:** 70 GAP at design stage. No G2 candidate, authorized task-owned Postgres lease,
or actual-writer/HTTP/browser acceptance execution has been supplied to W7 yet.
The Prime's rejected disposable PG17 attempt on port 55430 is a resource blocker,
not a failed feature test. No use of shared `valet` / port 5432 is authorized.

Evidence taxonomy: `ORACLE` = independent fixed expected facts; `STATIC` = read-only
source/manifest; `UNIT` = module; `DB` = real PostgreSQL; `WRITER` = real domain
writer; `HTTP` = real guarded endpoint; `BROWSER` = real connected page;
`LOAD` = measured PostgreSQL query/writer contention; `CI` = observed pipeline.
A passing ORACLE or STATIC check never changes an unexecuted DB/HTTP item to PASS.

## Execution gates

- **G0 (STATIC):** Verify all 124 frozen SHA entries with `verify-frozen-ui.mjs` on the exact G2 candidate.
- **G1:** Record Prime's frozen DTO/guard signatures, source writer map, approved migration decision and SHAs.
- **G2:** Freeze candidate and HTTP/UI runtime identities; do not test a different worktree or mock endpoint.
- **PG lease:** Prime supplies proof of separate DB/cluster ownership, database name, port, session/user, exclusive window, cleanup authority; DB tests then run.
- **G3:** Attach per-row command, exit code, writer/fixture distinction, snapshot and evidence path. No implicit PASS.

## T01–T70

| ID | Criterion (§27, verbatim) | Owners | Independent evidence lane | Result | Evidence / blocker |
| --- | --- | --- | --- | --- | --- |
| T01 | Session moved A→B→C; A-window returns it using historical event, never current C | W2 DB; W7 actual writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T01 |
| T02 | Same slot used by many Sessions across windows; only in-window witnesses qualify | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T02 |
| T03 | Reassignment clear+assign at same time retained as two source records, no synthetic transfer | W3 DB; W7 writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T03 |
| T04 | Normal unbound parking lacks checkout; UI does not mark fabricated loss | W3 writer; W6 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T04 |
| T05 | Retrieval checkout/return/release uses event slot and actor, not current assignment | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T05 |
| T06 | QUEUED Dispatch exists without Audit; Session discoverable and timeline includes it | W2/W3 focused; W7 independent | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T06 |
| T07 | Nullable actor stays unavailable; no automatic “system” attribution | W3 contract/DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T07 |
| T08 | A assigns B, later C reassigned; actor/previous/new roles correct | W3 writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T08 |
| T09 | Employee participation finds historical previous/new assignee even if current assignee changed | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T09 |
| T10 | Completed Task current assignee differs from completing actor; no false completion label | W3 DB; W7 #299 regression | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T10 |
| T11 | Same-time different Task events do not merge | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T11 |
| T12 | Audit found by direct/entity/Task arms counts once by ID | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T12 |
| T13 | Checked-in association differs from check-in completion actor | W3 writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T13 |
| T14 | PARKED Audit+Dispatch coherent relation preserved as related separate facts | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T14 |
| T15 | Wrong Task/session/version relation produces safe unverifiable handling, not attribution | W3/W4 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T15 |
| T16 | Retrieval request plus mutable canceled status does not erase request Audit history | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T16 |
| T17 | Verified/consumed handoff without vehicle release never shown as released | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T17 |
| T18 | VEHICLE_RELEASED and COMPLETED equal-time records both retained | W3 actual writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T18 |
| T19 | Every baseline allowlisted Session event type has safe projection fixture | W1/W3 unit/contracts | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T19 |
| T20 | Free reasons/raw metadata/payment/secret fields cannot pass safe schema | W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T20 |
| T21 | Incident reporter and Audit actor retained; incident count distinct from evidence count | W2/W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T21 |
| T22 | Incident indication semantics outside search window match approved U06 | W2 HTTP; W5 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T22 |
| T23 | Schema-only lifecycle states don't create invented transitions/resolver participants | W3 DB; W6 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T23 |
| T24 | Corrected current plate searchable with CURRENT label; old plate not falsely claimed | W2 DB; W5 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T24 |
| T25 | Vehicle shared across Sessions does not attach every correction Audit to every Session | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T25 |
| T26 | Photo reference cannot return object key/signed URL or imply verified bytes | W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T26 |
| T27 | Known unavailable/unauthorized evidence truthful; no “deleted” guess | W6 UI; W7 browser | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T27 |
| T28 | Unknown Audit type minimal: no raw type/metadata/actor enrichment | W3/W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T28 |
| T29 | Conflicting cross-tenant metadata does not disclose other tenant IDs or labels | W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T29 |
| T30 | U01 separate in-window witnesses qualify; outside-window witness does not | W1 fixtures; W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T30 |
| T31 | Exact Session+vehicle+employee filters obey AND, no ID bypass | W2 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T31 |
| T32 | Duplicate employee names require canonical ID; inactive member still searchable when authorized | W2 DB; W5 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T32 |
| T33 | Plate NFKC/case/separators and literal wildcard escaping match existing domain rules | W1/W2 unit+DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T33 |
| T34 | Unsupported vehicle type/category/unknown query keys rejected; no SQL interpolation | W1 contract; W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T34 |
| T35 | `[from,to)` exact millisecond edges and midnight | W1 unit; W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T35 |
| T36 | DST gap/fold resolved explicitly; timezone display survives pagination | W5/W6 unit; W7 browser | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T36 |
| T37 | Search ignores Session.created_at for historical event qualification | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T37 |
| T38 | Timeline includes before/after discovery window events with clear markers | W3 HTTP; W6 browser | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T38 |
| T39 | Equal times across all four sources page without duplicates/skips | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T39 |
| T40 | Search aggregate order/count stable across page boundaries | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T40 |
| T41 | Late-commit transaction with old event time excluded by approved snapshot fence | W7 two-connection DB race | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T41 |
| T42 | Inserts after page1 and retry/back navigation don't create duplicate/omitted eligible records | W7 DB/HTTP | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T42 |
| T43 | Legacy null birth rows and online rollout overlap behave as documented | W7 DB migration/race | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T43 |
| T44 | Current identity correction between pages follows approved restart/live rule, no false frozen claim | W7 DB/HTTP | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T44 |
| T45 | Cursor tamper/wrong purpose/scope/filter/principal/session/expiry rejected | W4 HTTP; W1 unit | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T45 |
| T46 | CA valid MFA passes; expired/inactive/other exact session fails; no assurance refresh | W4 HTTP/DB | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T46 |
| T47 | LM current grant passes; revoked grant before next page/detail denies and clears UI | W4 race; W7 browser | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T47 |
| T48 | Cross-org and cross-Location IDs fail search, selectors, timeline and detail independently | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T48 |
| T49 | Supervisor new mode denied under U02; existing scoped Events remains correct | W4 HTTP; W7 regression | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T49 |
| T50 | Employee/guest/platform principal cannot use management route | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T50 |
| T51 | Commercial gate/user/member/session disable enforced on every page | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T51 |
| T52 | Inactive Location history versus resource-specific Incident detail authority preserved | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T52 |
| T53 | Detail source/event belongs to different Session despite valid surrounding path → denial | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T53 |
| T54 | Repeated reads create zero Audit/domain/evidence writes; CA activity-only exception measured | W4 DB; W7 independent | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T54 |
| T55 | No-store/request-ID/redacted error/log behavior on success/failure | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T55 |
| T56 | UI scope/session/selection revision switch cancels and fences all stale responses/drawers | W5/W6 tests; W7 browser | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T56 |
| T57 | Apply/reset/load more/error/empty/cursor expiry avoid duplicate requests and stale rows | W5 UI | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T57 |
| T58 | Keyboard/focus/return/Escape nested Help and timeline detail | W6 UI; W7 browser | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T58 |
| T59 | Arabic/English, RTL/LTR, long labels, tablet/desktop and bidi IDs | W6; W7 browser/manual | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T59 |
| T60 | Existing Events geometry, filters, identity, Help, security and pagination unchanged | W7 existing Audit suites | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T60 |
| T61 | Incident/privacy recovery regression from latest #275 preserved | W4/W7 HTTP | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T61 |
| T62 | Worst-case broad time search + highly reused slot plans bounded at target scale | W7 EXPLAIN/benchmark | Owned PG load/migration | **GAP** | G2 + owned runtime pending; §27 T62 |
| T63 | Long timeline, 100-row page, count aggregation and deep cursor stay bounded, no N+1 | W7 benchmark | Owned PG load/migration | **GAP** | G2 + owned runtime pending; §27 T63 |
| T64 | Simultaneous readers and domain writers: no unacceptable blocking/deadlocks | W7 DB/load | Owned PG load/migration | **GAP** | G2 + owned runtime pending; §27 T64 |
| T65 | Fresh migration and existing-schema upgrade, runtime grants, immutable birth trigger | W7 DB; Prime migration | Owned PG load/migration | **GAP** | G2 + owned runtime pending; §27 T65 |
| T66 | Unapproved source/table/metadata selector cannot reach SQL | W4 HTTP | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T66 |
| T67 | One source query failure does not return a falsely complete timeline | W3 failure injection; W7 HTTP | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T67 |
| T68 | Matching count dedup includes union of witnesses; paired source records labelled records | W2/W3 DB; W5 UI | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T68 |
| T69 | Boundary limits/cursor decompression/oversized filter inputs fail safely | W1/W4 contract+HTTP | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T69 |
| T70 | Runtime/API disconnect then retry reauthorizes; no evidence mutation or automatic repeated loop | W5/W6 browser; W4 HTTP | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T70 |

## Status changes

A row may advance to **PASS** only with a retained evidence file referencing
the exact tested SHA and runtime identity, commands/results, and proof level.
**FAIL** requires a reproducible observed contract violation. A blocked/unrun
scenario remains **GAP**, even when static references suggest correct behavior.
Never use test-only fixture authorization as evidence of production MFA or grant semantics.
