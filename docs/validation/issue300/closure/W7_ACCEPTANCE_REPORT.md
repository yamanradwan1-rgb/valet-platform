# Issue #300 R2 — W7 Independent Acceptance Report

**Verdict: NOT READY — TECHNICAL ACCEPTANCE INCOMPLETE.** W7 has prepared acceptance harnesses; no final integrated candidate, exclusive PostgreSQL/browser lease, actual provisioned role or runtime proof was supplied to W7 at report preparation. This report does not claim a failed application or a completed release test.

## Authority, isolation and evidence level

- Owner authorization: R2 + UI-M1 local execution approved on 2026-10-18. No push, PR, merge, deploy, production or Issue closure.
- W7 branch/worktree: `codex/issue-300-r2-w7-acceptance` / `tmp/issue-300-r2-w7-acceptance`; base `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687` (frozen SHA remains untouched).
- R2 authority: `tmp/issue300-r2-owned/ISSUE_300_FINAL_CLOSURE_MASTER_PLAN.md`; direct Owner authorization `tmp/issue300-r2-owned/OWNER_R2_EXECUTION_AUTHORIZATION.txt`. Latest Prime correction confirms the exact W7 file paths in R2 §8.8.
- Previous evidence: `U05_OPTION_B_LOCAL_VALIDATION.md`, `G2_RUNTIME_EVIDENCE.md`, `T01_ACTUAL_G2_LIFECYCLE.md`, `T01-T70_ACCEPTANCE_LEDGER.md`, `T01_T70_FOLLOWUP_EVIDENCE.md`. All describe historical candidates/partial checks, not the final R2 integration.
- Historical G2 `127.0.0.1:55480/issue300_g2` had 96 migrations; current bind failed with Windows excluded-port error. Prime is preparing a separate owned **candidate** at `127.0.0.1:57285/issue300_r2` subject to W6 attestation. Its identity and lease have **not** been verified by W7. W7 did **not** inspect either DB, use port 5432, query a DB, make HTTP calls, start services or use a browser.

## New owned acceptance artifacts

| File | Proof instrument | Current evidence |
|---|---|---|
| `scripts/issue300-closure-http-proof.mjs` | Real Bearer-authenticated, Origin-bound HTTP signed Search/Timeline keysets; separate ordinary/default gate-denial negative; independent source-ID manifest; saved S0 first page; subsequent S0 pages after certified two-connection late commit; fresh S1; exact source IDs, duplicates, signed purpose/tamper and anonymous negatives | **STATIC ONLY**: Node syntax check PASS; actual source/parent/role/HTTP proof GAP |
| `scripts/issue300-closure-load-proof.mjs` | Timed real HTTP tier test, bounded 5/25 readers, 100k/1m source evidence count, 10-minute samples; verifies externally attested independent real domain writers, 20 true cold trials, SQL-plan artifacts, 20%/100ms writer impact and R2 p95 budgets | **STATIC ONLY**: Node syntax check PASS; runtime and benchmark GAP |
| `apps/dashboard/e2e-runtime/issue300-closure.spec.ts` | Authenticated real-browser API, one-click continuation, source ID, disclosure, nested-detail focus, fail/retry, 32 genuine locale/theme/viewport/zoom attempts, same-fixture frozen-image comparison | **PREPARED ONLY**: requires integrated UI-M1, actual browser/role/fixture and frozen comparison assets |

**Important limitations of the instruments:** W7's HTTP script consumes an **independent** fixture/oracle and a separate held-writer certificate; it does not itself execute domain commands or establish the historical validity of an indirect association. It must be paired with W1/W6/W4 and actual signed API runs. It explicitly reports **PARTIAL** when its fixture origin is `DISPOSABLE_SQL_FIXTURE`; only `ACTUAL_DOMAIN_WRITER` may produce script PASS, subject to independent confirmation. The load script emits raw HTTP timings but treats separately captured DB/real-writer/cold/EXPLAIN artifacts as mandatory attestation inputs. Such inputs must themselves be independently observed before a report can upgrade any row to PASS. A manifest alone is not evidence.

## Reproducible validation and leased-runtime sequence

1. **Source-only, completed:** `pnpm install --offline --frozen-lockfile --ignore-scripts` → PASS, no tracked lockfile changes; `node --check scripts/issue300-closure-http-proof.mjs` and `node --check scripts/issue300-closure-load-proof.mjs` → PASS; `pnpm --dir apps/dashboard exec tsc --noEmit -p tsconfig.json` → PASS; `pnpm exec eslint apps/dashboard/e2e-runtime/issue300-closure.spec.ts` → PASS; Playwright `--list` → **34 collected tests** (32 UI combinations plus two functional/Events cases). `prettier --check` on the two shorter files and `prettier --check --print-width 120` on the HTTP source ensure readable formatting within the 300-line rule. No runtime endpoint or browser exercised by these static checks.
2. **Dependency gate:** Prime supplies integrated candidate SHA/build, disposable database identity `127.0.0.1:57285/issue300_r2` and exact exclusive lease, W1 independent source-qualified expected-ID oracle, W6 96/96 and actual ordinary-role attestation, W4 authentic CA/LM exact-session MFA evidence. Provide **two** locally owned API origins: `ISSUE300_R2_API_URL` for the explicitly enabled candidate and `ISSUE300_W7_DISABLED_API_URL` for the ordinary/default capability-denied build. The `guardedCohortPath` in the source manifest must be representative of a previously unproven indirect cohort: ordinary/default must give a controlled non-200. Use disposable fixtures only and record actual scope/Window/source rows, IDs, parent identities, role, snapshot and writer origins. Never use simulated credentials or a permissive schema-owner connection as authorization proof.
3. **Signed S0:** Set the documented `ISSUE300_W7_*` environment inputs, `ISSUE300_W7_HTTP_PHASE=capture`, and execute `node scripts/issue300-closure-http-proof.mjs`. Both Search and Timeline must return 200 with a signed second-page cursor. The script writes a unique, private checkpoint at `ISSUE300_W7_HTTP_CHECKPOINT`; this is **CAPTURED_ONLY**, never a PASS.
4. **Writer interleaving:** An independently controlled writer transaction begins before capture and commits after S0; W6/Prime records two distinct PostgreSQL connection identities, begin/commit timestamps, exact late Audit/Custody/Dispatch/Incident and parent Task/Incident/PARKED keys, rollback and unknown-outcome reconciliation. Construct the certificate referenced by `ISSUE300_W7_COMMIT_CERTIFICATE`; its IDs must match the independent fixture manifest. Repeat per source and relationship cohort, including rollback, absent/JSON-null metadata, Task type mismatch, conflicting Task IDs, foreign organization/location, legacy NULL markers and genuine canonical PARKED writer shape. Do not claim a single run covers all.
5. **Old S0 versus fresh S1:** Set `ISSUE300_W7_HTTP_PHASE=verify`; rerun the HTTP script. It fetches subsequent pages with the exact old signed cursors, excludes late IDs from old S0, checks distinct source-qualified IDs/continuation, then opens fresh signed S1 and requires newly admissible IDs. A 503 guard, cursor error or missing independent evidence is a GAP/FAIL of that cohort, not a pass. Repeat with CA and LM; add revocation/expiry/current-identity negatives and source-detail rights through W4's separate suite.
6. **Performance:** Run normal and stress separately for both **100k** and **at least 1m** mixed-source tiers: `ISSUE300_W7_LOAD_MODE=normal` or `stress`; `node scripts/issue300-closure-load-proof.mjs`. Normal is five HTTP readers + two concurrently active real operational writer clients for at least ten minutes, at least 1,000 successful requests per endpoint. Stress is 25 readers + eight real writers for ten minutes. Required external artifact envs: `ISSUE300_W7_LOAD_PATHS`, `ISSUE300_W7_WRITER_BASELINE`, `ISSUE300_W7_WRITER_LIVE`, `ISSUE300_W7_COLD_TRIALS`, `ISSUE300_W7_EXPLAIN_PLANS`, `ISSUE300_W7_RESULTS_PATH`. Capture DB sizes, hardware/role/SQL and full `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans. Do **not** flush shared caches.
7. **Browser:** Prime supplies `ISSUE300_W7_BROWSER_URL`, `ISSUE300_W7_BROWSER_STORAGE_STATE` (real scoped MFA session), `ISSUE300_W7_BROWSER_SCENARIO`, a W7 browser lease and paired frozen same-data screenshots. Command: `pnpm --dir apps/dashboard exec playwright test --config playwright.runtime.config.ts issue300-closure.spec.ts`. Runs against e2e-runtime and never calls the older fixture-reset helper. Screen sizes 320/390/768/1440 × EN/AR × light/dark × 100/200%; browser keyboard zoom must actually be observed or that case fails. Every frozen image must be captured from the same real data/settings/browser version. Supplement with manual OS/browser zoom, accessibility and screen reader checks if Chromium cannot honor keyboard zoom headlessly.

### Exact U-004 acceptance budgets

| Metric | Required |
|---|---|
| Warm HTTP p95 Search / Timeline / Detail | ≤1500 / ≤750 / ≤400 ms |
| Cold HTTP p95 Search / Timeline / Detail | ≤3000 / ≤1500 / ≤800 ms; 20 independently prepared trials for each |
| Real writer p95 impact | ≤20% relative **and** ≤100 ms absolute over matched writer-only baseline |
| Normal / stress | 5 readers + 2 genuine writers / 25 readers + 8 genuine writers; ten minutes each |
| Tier, samples and failure | 100k and ≥1m mixed evidence; ≥1000 completed 200 responses per endpoint; no unaccepted deadlock, timeout, canonical writer error, fabricated history |

Historical `U05_OPTION_B_LOCAL_VALIDATION.md` measured a 3500-Session/900-Custody hot SQL-only Search **p95 1968.88 ms**, above the approved warm Search budget. This measurement is a **known concern**, not evidence that the final R2 candidate fails or passes at scale. W2/Prime must provide fresh query-plan proof within the two-query/one-index bounded optimization rule.

## U05-R01–R09 evidence disposition

| Gate | Historical artifact and R2 delta | W7 final-candidate status |
|---|---|---|
| R01 | G2 source late-commit SQL and signed four-source HTTP subset existed; independently compare S0 source IDs on current signed pages | GAP |
| R02 | Source holding before S0 and commit after; repeat all four + Task/Incident parents in real signed HTTP | GAP |
| R03 | Option B G2 SQL Task/Incident/PARKED proof exists; actual HTTP indirect cohort still 503 guarded; preserve scoped confidence | GAP |
| R04 | Historical atomic 95/96 on disposable G2; W6 fresh/upgrade/held-writer rollout needed | BLOCKED W6 lease |
| R05 | Historical privilege/triggers; actual ordinary provisioned role, failure/rollback and legacy NULL proof needed | BLOCKED W6/W4 |
| R06 | Earlier 106 Session/112 event bounded pages; final all-source 100+ ties and signed nonphantom keysets required | GAP |
| R07 | Earlier binding/CA/LM checks; current exact staff session, grant/Location MFA reauthorization and invalidated cursor needed | GAP |
| R08 | Earlier negative scopes/guards; source-detail safe 403/404, denied principal, fresh detail and no-write evidence needed | GAP |
| R09 | Earlier domain Dispatch/Incident and SQL hot benchmark; full writer lifecycle + required local HTTP/load p95 pending | GAP |

## T01–T70 delta register

Each row remains **GAP** for the final R2 integrated candidate until its source SHA/schema/role, actual assertion, command and artifact are recorded. Historical or synthetic coverage listed below is a test location, not an invented PASS.

| ID | Existing test/evidence to map by impact | Required final delta |
|---|---|---|
| T01 | `T01_ACTUAL_G2_LIFECYCLE` | Real custody A→B→C historical slot via signed Search |
| T02 | independent-oracle synthetic | Reused slot/multi-Session scoped DB witness |
| T03 | Option B source traces | Equal-time clear/assign retained separately |
| T04 | DEC-068 normal writer | No fabricated checkout on unbound parking |
| T05 | prior custody proofs | Retrieval slot/actor from source event |
| T06 | independent-oracle synthetic | QUEUED Dispatch without Audit, signed Timeline |
| T07 | independent-oracle synthetic | Nullable actor and confidence |
| T08 | prior Dispatch proof | Actor vs assignee and previous/new roles |
| T09 | Search source query tests | Historical participant despite current assignee |
| T10 | #299/Dispatch regression | Completing actor differs from Task assignee |
| T11 | Timeline ties | Distinct Task IDs never collapsed |
| T12 | Timeline source tests | Audit direct/entity/task union dedup by ID |
| T13 | DEC-102 | Check-in association vs actual completion actor |
| T14 | Option B PARKED proof | Audit and Dispatch remain distinct facts |
| T15 | malformed Task regression | Wrong linked Task is not admitted/attributed |
| T16 | retrieval writer | Cancel does not erase request history |
| T17 | handoff writer | Verified without release stays unreleased |
| T18 | lifecycle writer | Equal-time release and completion both present |
| T19 | safe projection tests | Every allowed event type safely projected |
| T20 | W4 disclosure tests | Secret/raw free text rejected on HTTP |
| T21 | prior Incident writer | Reporter distinct from Audit actor/count |
| T22 | Incident search selector | U06 in/out window indication truth |
| T23 | Incident safe detail | No fictional lifecycle transitions |
| T24 | vehicle current labels | Corrected CURRENT plate/no historical overclaim |
| T25 | malformed vehicle Audit | Vehicle-wide correction not copied to all Sessions |
| T26 | W4 point-detail | No photo keys/signed URLs/bytes |
| T27 | UI-M1 safe copy | Unauthorized/missing reference truth |
| T28 | unknown event tests | Minimal safe unknown, no private metadata |
| T29 | W1/W4 | Foreign metadata cannot disclose foreign IDs |
| T30 | independent-oracle | Two in-window witnesses, same Session AND |
| T31 | Search HTTP | Exact Session plus filters obey AND |
| T32 | former selector tests | Duplicate/inactive membership canonical UUID |
| T33 | normalize search tests | NFKC/case/separator/literal wildcards |
| T34 | contract/W4 | Reject unknown keys/vehicle type interpolation |
| T35 | source query tests | Half-open millisecond/timezone edges |
| T36 | W5 timezone tests | Explicit DST gap/fold + genuine browser controls |
| T37 | independent-oracle | Creation date not historical witness |
| T38 | Timeline HTML/API | Events outside search window labelled |
| T39 | source pagination | All four equal-time sources globally ordered |
| T40 | Search cursor | Accurate counts/order across signed page bounds |
| T41 | existing SQL held writer | Signed HTTP late commit + two connections |
| T42 | source 106/112 old pages | S0 retry/back without skipped/new IDs |
| T43 | migration94–96 | Legacy NULL birth/cutover lock overlap |
| T44 | U-003 | Mutable CURRENT identity explicit restart |
| T45 | signed cursor tests | Purpose/filter/principal/session/expiry/tamper |
| T46 | W4/CA MFA | Actual current exact session MFA deny/allow |
| T47 | W4 and browser | LM grant revoked before next page |
| T48 | W4 | Cross-tenant/Location endpoints independently deny |
| T49 | prior Audit Events | Supervisor ordinary Events stays authorized |
| T50 | W4 | Employee/guest/platform cannot enter |
| T51 | W4 | Commercial/user/member/session disable |
| T52 | DEC-059 | Incident detail ACTIVE Location policy |
| T53 | W4 detail | Valid source belongs to different Session denied |
| T54 | W4 HTTP/DB | No new evidence/domain writes from repeated GET |
| T55 | controller tests | No-store/request-ID/log redaction |
| T56 | UI-M1 browser | Scope/session stale response and drawer fence |
| T57 | UI-M1 browser | Explicit page, Retry, expiry, no duplicate call |
| T58 | UI-M1 browser | Keyboard, nested Help/drawer, Escape return |
| T59 | UI-M1 browser | EN/AR RTL/LTR real theme/zoom/bidi |
| T60 | prior Audit suites | Existing Events/Help/filter/page geometry unchanged |
| T61 | #275 regressions | Incident/privacy process-recovery boundary |
| T62 | prior SQL hotspot | 100k/1m broad search/slot EXPLAIN and p95 |
| T63 | prior SQL hot benchmark | Long Timeline 100 rows/deep cursor/aggregation |
| T64 | no final load evidence | 5+2/25+8 concurrent read/write deadlock/p95 |
| T65 | Option B migration SQL | W6 fresh/upgrade/immutable trigger/real role |
| T66 | W4 query validation | Unsupported table/source/metadata refused |
| T67 | W3 source-failure injection | Never falsely complete on one source outage |
| T68 | independent-oracle | Matching source/id union counts exact |
| T69 | contracts/W4 | Max filters/cursor size/decompression bounds |
| T70 | prior G2 browser subset | Disconnect, authorized explicit retry, no loops |

## Blocking dependencies and handoff

The present W7 test design is source-only; it does not satisfy any final R01–R09, T01–T70, migration, performance, authorization, privacy or visual gate. Before execution, Prime must hand over the **actual** locally integrated SHA/build, W1 oracle, real scoped credentials without storing secrets in evidence, W6 ordinary-role/DB identity and exclusive lease, W4 authorization attestation and W5 UI-M1 candidate. For the signed late-parent proof, a separate independently verified two-connection writer certificate is mandatory; a JSON claim without transaction trace cannot elevate status.

On a new P0/P1, release the affected resource lease and report exact source line, candidate SHA, executable reproduction and privacy-safe artifact. Do not bypass the existing 503 gate or edit another worker's files. Record errors, timing, snapshots, plans and browser evidence with sanitized identities; Prime alone reconciles the final ledger and local readiness verdict.
