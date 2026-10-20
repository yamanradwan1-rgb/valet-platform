# Issue #300 — Independent T01–T70 Acceptance Ledger

> **Option B local follow-up, 2026-10-18 (not a re-approval of the
> historical 70-row ledger):** independent pre-migration and post-candidate
> security reviews, forward-only Task relation / attribution migrations
> 95–96 on dedicated disposable G2 only, held two-connection late-parent
> S0/S1 Search+Timeline SQL regression, PARKED conflicting-Task negatives
> and real writer-shaped positives, immutable trigger/ACL checks PASS
> in their stated subsets. Existing 503 overfull indirect guard remains
> enabled. Newly linked Audit signed HTTP pagination, comprehensive
> legacy/anomaly diagnostics, 100k/1m cold/concurrent performance,
> revocation-race and full independent physical UI/browser acceptance
> **remain GAP**. Latest measured 3,500-Session/900-Custody SQL-only
> p95 **1,968.88 ms** is a performance concern. See
> `U05_OPTION_B_LOCAL_VALIDATION.md`. Issue #300 is NOT ACCEPTED.

> **Additional G2 actual T01 writer lane, 2026-10-18 (new evidence,
> historical 70-row candidate SHA unchanged):** The Owner-authorized
> disposable database now contains a successful independently read-back
> **real Check-in→Key A/B/C→Parking→Guest Retrieval→verified Handoff
>→COMPLETED** HTTP flow. Historic A search ignores current C, then two
> distinct Parking/Retrieval checkouts, guest QUEUED null actor,
> consumed Handoff verification, final RELEASED and equal-time
> VEHICLE_RELEASED/COMPLETED Audit remain distinct. Fully detailed
> evidence and known SQL-setup versus writer boundaries are in
> `T01_ACTUAL_G2_LIFECYCLE.md`. The original older SHA/70 rows below
> are not silently repinned; broader role/adversarial/target-scale,
> frozen UI acceptance and snapshot indirect-provenance remain GAP.

> **Latest separate T70 follow-up (2026-10-18, do not repin historical
> 70-row SHA):** after earlier real-browser Search abort coverage, the
> same G2-bound CA+MFA Chromium test additionally aborts **Timeline** and
> **point Detail** independently, checks zero partial event cards/no false
> detail dialog/no automatic request loop, and confirms user-triggered
> Apply and detail selection recovers authenticated 200 reads. Focus after
> Escape returns to event card. Full T70 remains **PARTIAL/GAP**:
> missing multi-scope revocation-during-fault, repeated abort/generation
> races, physical zoom, real locale/theme behavior, and full reliability
> stress. No frozen React/CSS component was edited.

**Owner:** Worker 7 (original independent ledger), updated by Prime against
actual code candidate `f90c3cabbff07c57df57ee783f052b30a70b0a21`.
**Status:** **2 narrowly scoped DB/HTTP fixture criteria PASS, 68 full acceptance
criteria GAP or partially evidenced. Overall Issue #300 is NOT ACCEPTED.**
**Additional 2026-10-18 evidence after the historical SHA pin:** local commit
`33fc913c9cba26453288ac148f080016cdf1902d` adds a **real operational
Supervisor Check-in and key A→B→C** HTTP test; five born-XID Custody rows and
three Audit rows are proven with a CA/MFA historical A-window Search, explicit
CURRENT C label, negative C-filter in old A window, and exact Timeline source IDs.
The generated Shift/slots/intake policy are still **SQL setup**, not domain
writers. Test-only G2 Timeline held late writers for each of four sources and
106-Session/112-event keyset cases also PASS. See the U05 addendum. The older
70-row candidate SHA and outcomes below deliberately **remain traceable to the
older reviewed candidate**; this new proof is additive, not a retroactive
70-row reapproval. Remaining Parking/Retrieval/Handoff, T70/physical UI,
indirect provenance, migration/load gates remain GAP; **Issue #300 OPEN**.
**Newer U05 gated local test candidate:** `372e3cf4953a46c9ea5254426173eb456976126a`
with later Issue300 SQL/performance candidate
`5c3f8da2eb4ee939210d9d35fb78dbeb58926783`
and additional **actual HTTP Incident and Dispatch writer subset proof scripts**
in `apps/api/test/issue300-pg/issue300-operational-*.mjs` (fresh Supervisor
password login, operational Incident/Dispatch endpoints, CA TOTP MFA
Timeline/detail source readback). **These are subset evidence, not full T01**:
fixture Session and Shifts originate from direct SQL, and complete upstream
check-in, custody, release/retrieval/handoff and T70 remain unexecuted.
adds migration94 and partial Option A proof only. See
`U05_OPTION_A_LOCAL_VALIDATION.md`. It **does not upgrade any original
Section 27 acceptance row**: U05 full indirect Audit provenance, actual
operational domain writers, target-scale performance and physical UI checks
remain GAP. The 70-row code SHA below deliberately pins the previous
fully-reviewed source candidate; it is not retroactive proof for U05.
**Code SHA:** `f90c3cabbff07c57df57ee783f052b30a70b0a21` pins the latest
local combined implementation-and-test candidate. The non-code documentation
commit will be recorded separately and does not invalidate this code SHA.
**Partial browser/T70:** A real CA/MFA login, source drawer Escape/focus return,
one injected Search-network abort and explicit manual successful recovery are
**executed**, but T58, T59 and **full T70 remain GAP**. The 32 locale/theme/
CSS-zoom combinations only asserted visible Investigation panel presence under
synthetic DOM state changes, **not** application preference behavior, physical
200% zoom or zero-overflow parity. See `G2_RUNTIME_EVIDENCE.md`.
An independently owned PostgreSQL 17.10 `issue300_g2` now runs at loopback
port 55480 with 93/93 migrations. The previously rejected port 55430 no longer
blocks isolated SQL tests; the shared `valet` / port 5432 was **never touched**.
The actual G2 SQL, HTTP, performance and browser-lane results are in
`G2_RUNTIME_EVIDENCE.md`; the original 70 design criteria are preserved verbatim.

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

For GAP rows, `NOT RUN` explicitly means the **complete** requirement was not
executed. `PARTIAL ONLY` points to an actually executed subset and is **not**
an acceptance PASS. The candidate SHA column refers to the code commit, not
the later documentation-only commit. G2 URL arguments have the placeholder
`<owned>` instead of the actual task-only credential; source it in-memory from
the untracked G2 environment after confirming port/name/ownership. Never put
passwords, access tokens or MFA seeds in Git or test logs.

## T01–T70

| ID | Criterion (§27, verbatim) | Owners | Independent evidence lane | Result | Evidence / blocker | Exact command / execution | Code candidate SHA | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Session moved A→B→C; A-window returns it using historical event, never current C | W2 DB; W7 actual writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T01 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T02 | Same slot used by many Sessions across windows; only in-window witnesses qualify | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T02 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T03 | Reassignment clear+assign at same time retained as two source records, no synthetic transfer | W3 DB; W7 writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T03 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T04 | Normal unbound parking lacks checkout; UI does not mark fabricated loss | W3 writer; W6 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T04 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T05 | Retrieval checkout/return/release uses event slot and actor, not current assignment | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T05 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T06 | QUEUED Dispatch exists without Audit; Session discoverable and timeline includes it | W2/W3 focused; W7 independent | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T06 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T07 | Nullable actor stays unavailable; no automatic “system” attribution | W3 contract/DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T07 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T08 | A assigns B, later C reassigned; actor/previous/new roles correct | W3 writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T08 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T09 | Employee participation finds historical previous/new assignee even if current assignee changed | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T09 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T10 | Completed Task current assignee differs from completing actor; no false completion label | W3 DB; W7 #299 regression | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T10 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T11 | Same-time different Task events do not merge | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T11 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T12 | Audit found by direct/entity/Task arms counts once by ID | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T12 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T13 | Checked-in association differs from check-in completion actor | W3 writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T13 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T14 | PARKED Audit+Dispatch coherent relation preserved as related separate facts | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T14 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T15 | Wrong Task/session/version relation produces safe unverifiable handling, not attribution | W3/W4 DB | Writer/DB/oracle + scoped HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T16 | Retrieval request plus mutable canceled status does not erase request Audit history | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T16 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T17 | Verified/consumed handoff without vehicle release never shown as released | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T17 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T18 | VEHICLE_RELEASED and COMPLETED equal-time records both retained | W3 actual writer | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T18 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T19 | Every baseline allowlisted Session event type has safe projection fixture | W1/W3 unit/contracts | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T19 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T20 | Free reasons/raw metadata/payment/secret fields cannot pass safe schema | W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T20 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T21 | Incident reporter and Audit actor retained; incident count distinct from evidence count | W2/W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T22 | Incident indication semantics outside search window match approved U06 | W2 HTTP; W5 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T22 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T23 | Schema-only lifecycle states don't create invented transitions/resolver participants | W3 DB; W6 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T23 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T24 | Corrected current plate searchable with CURRENT label; old plate not falsely claimed | W2 DB; W5 UI | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T24 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T25 | Vehicle shared across Sessions does not attach every correction Audit to every Session | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T26 | Photo reference cannot return object key/signed URL or imply verified bytes | W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T26 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T27 | Known unavailable/unauthorized evidence truthful; no “deleted” guess | W6 UI; W7 browser | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T27 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T28 | Unknown Audit type minimal: no raw type/metadata/actor enrichment | W3/W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T28 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T29 | Conflicting cross-tenant metadata does not disclose other tenant IDs or labels | W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T29 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T30 | U01 separate in-window witnesses qualify; outside-window witness does not | W1 fixtures; W2 DB | Writer/DB/oracle + scoped HTTP | **PASS (G2 SQL fixture + authenticated HTTP; criterion only)** | See G2_RUNTIME_EVIDENCE.md; SQL source test fixtures, NOT operational writers | ISSUE300_PG_TEST_URL=<owned> node apps/api/test/issue300-pg/issue300-pg-proof.mjs ; ISSUE300_PG_TEST_URL=<owned> node apps/api/test/issue300-pg/issue300-auth-http-proof.mjs | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Retain real SQL/HTTP results; obtain operational-writer proof before overall Issue PASS |
| T31 | Exact Session+vehicle+employee filters obey AND, no ID bypass | W2 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T31 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T32 | Duplicate employee names require canonical ID; inactive member still searchable when authorized | W2 DB; W5 UI | Writer/DB/oracle + scoped HTTP | **PASS (G2 SQL fixture + authenticated HTTP; criterion only)** | See G2_RUNTIME_EVIDENCE.md; SQL source test fixtures, NOT operational writers | ISSUE300_PG_TEST_URL=<owned> node apps/api/test/issue300-pg/issue300-pg-proof.mjs ; ISSUE300_PG_TEST_URL=<owned> node apps/api/test/issue300-pg/issue300-auth-http-proof.mjs | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Retain real SQL/HTTP results; obtain operational-writer proof before overall Issue PASS |
| T33 | Plate NFKC/case/separators and literal wildcard escaping match existing domain rules | W1/W2 unit+DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T33 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T34 | Unsupported vehicle type/category/unknown query keys rejected; no SQL interpolation | W1 contract; W4 HTTP | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T34 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T35 | `[from,to)` exact millisecond edges and midnight | W1 unit; W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T36 | DST gap/fold resolved explicitly; timezone display survives pagination | W5/W6 unit; W7 browser | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T36 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T37 | Search ignores Session.created_at for historical event qualification | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T37 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T38 | Timeline includes before/after discovery window events with clear markers | W3 HTTP; W6 browser | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T38 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T39 | Equal times across all four sources page without duplicates/skips | W3 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T39 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T40 | Search aggregate order/count stable across page boundaries | W2 DB | Writer/DB/oracle + scoped HTTP | **GAP** | G2 + owned runtime pending; §27 T40 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T41 | Late-commit transaction with old event time excluded by approved snapshot fence | W7 two-connection DB race | Two-connection PG snapshot race | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T42 | Inserts after page1 and retry/back navigation don't create duplicate/omitted eligible records | W7 DB/HTTP | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T42 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T43 | Legacy null birth rows and online rollout overlap behave as documented | W7 DB migration/race | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T43 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T44 | Current identity correction between pages follows approved restart/live rule, no false frozen claim | W7 DB/HTTP | Two-connection PG snapshot race | **GAP** | G2 + owned runtime pending; §27 T44 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T45 | Cursor tamper/wrong purpose/scope/filter/principal/session/expiry rejected | W4 HTTP; W1 unit | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T46 | CA valid MFA passes; expired/inactive/other exact session fails; no assurance refresh | W4 HTTP/DB | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T47 | LM current grant passes; revoked grant before next page/detail denies and clears UI | W4 race; W7 browser | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T48 | Cross-org and cross-Location IDs fail search, selectors, timeline and detail independently | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T49 | Supervisor new mode denied under U02; existing scoped Events remains correct | W4 HTTP; W7 regression | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T50 | Employee/guest/platform principal cannot use management route | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T50 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T51 | Commercial gate/user/member/session disable enforced on every page | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T51 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T52 | Inactive Location history versus resource-specific Incident detail authority preserved | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T52 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T53 | Detail source/event belongs to different Session despite valid surrounding path → denial | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | G2 + owned runtime pending; §27 T53 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T54 | Repeated reads create zero Audit/domain/evidence writes; CA activity-only exception measured | W4 DB; W7 independent | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T55 | No-store/request-ID/redacted error/log behavior on success/failure | W4 HTTP | HTTP authorization/privacy + PG | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T56 | UI scope/session/selection revision switch cancels and fences all stale responses/drawers | W5/W6 tests; W7 browser | G2 browser/regression/HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T57 | Apply/reset/load more/error/empty/cursor expiry avoid duplicate requests and stale rows | W5 UI | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T57 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T58 | Keyboard/focus/return/Escape nested Help and timeline detail | W6 UI; W7 browser | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T58 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T59 | Arabic/English, RTL/LTR, long labels, tablet/desktop and bidi IDs | W6; W7 browser/manual | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T59 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T60 | Existing Events geometry, filters, identity, Help, security and pagination unchanged | W7 existing Audit suites | G2 browser/regression/HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T61 | Incident/privacy recovery regression from latest #275 preserved | W4/W7 HTTP | G2 browser/regression/HTTP | **GAP** | G2 + owned runtime pending; §27 T61 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T62 | Worst-case broad time search + highly reused slot plans bounded at target scale | W7 EXPLAIN/benchmark | Owned PG load/migration | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T63 | Long timeline, 100-row page, count aggregation and deep cursor stay bounded, no N+1 | W7 benchmark | Owned PG load/migration | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T64 | Simultaneous readers and domain writers: no unacceptable blocking/deadlocks | W7 DB/load | Owned PG load/migration | **GAP** | G2 + owned runtime pending; §27 T64 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T65 | Fresh migration and existing-schema upgrade, runtime grants, immutable birth trigger | W7 DB; Prime migration | Owned PG load/migration | **GAP** | G2 + owned runtime pending; §27 T65 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T66 | Unapproved source/table/metadata selector cannot reach SQL | W4 HTTP | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T66 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T67 | One source query failure does not return a falsely complete timeline | W3 failure injection; W7 HTTP | Failure injection/contract/HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T68 | Matching count dedup includes union of witnesses; paired source records labelled records | W2/W3 DB; W5 UI | Failure injection/contract/HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |
| T69 | Boundary limits/cursor decompression/oversized filter inputs fail safely | W1/W4 contract+HTTP | Failure injection/contract/HTTP | **GAP** | G2 + owned runtime pending; §27 T69 | NOT RUN (full Section 27 scenario) | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Execute full required lane with real writer/HTTP/browser proof, retain evidence |
| T70 | Runtime/API disconnect then retry reauthorizes; no evidence mutation or automatic repeated loop | W5/W6 browser; W4 HTTP | Failure injection/contract/HTTP | **GAP** | Partial G2 runtime evidence (see G2_RUNTIME_EVIDENCE.md); criterion still GAP | PARTIAL ONLY — exact executed subset in G2_RUNTIME_EVIDENCE.md | f90c3cabbff07c57df57ee783f052b30a70b0a21 | Run remaining Section 27 actual writer, source snapshot, HTTP, browser or performance subcases |

## Status changes

A row may advance to **PASS** only with a retained evidence file referencing
the exact tested SHA and runtime identity, commands/results, and proof level.
**FAIL** requires a reproducible observed contract violation. A blocked/unrun
scenario remains **GAP**, even when static references suggest correct behavior.
Never use test-only fixture authorization as evidence of production MFA or grant semantics.

**Updated verdict:** 2/70 narrowly scoped PASS, 68/70 GAP. In particular,
T01 actual domain-writer custody transitions, T41–T44 real four-source U05
cross-request cursor snapshot/legacy races, T58–T59 authenticated rendered
browser parity, T62–T65 target-scale writer/load/migration and T70 true API
disconnect/retry have **not** passed. U05 needs an explicit Owner architecture/
forward-only schema decision; retaining the existing 503 fail-closed behavior
is mandatory pending that decision.
