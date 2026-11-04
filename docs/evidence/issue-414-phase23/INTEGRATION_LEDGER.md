# Issue #414 — Phase 2 + Phase 3 Integration Ledger

## CURRENT IMPLEMENTATION CHECKPOINT — 2026-11-05 (supersedes historic table below)

**Verdict: PHASE 2 BLOCKED; PHASE 3 BLOCKED for acceptance (real integrated PG17, authenticated mounted HTTP, mixed-source EXPLAIN/p95 and final pushed CI are NOT complete).** This is substantial implemented **Draft** source and UI, not an approved merge or release. Owner policy is already **Accepted** in [DEC-110](../../decisions/DEC-110_ISSUE_414_PHASE2_SOURCE_OCCURRENCE_SEEN_POLICY.md) and [DEC-111](../../decisions/DEC-111_ISSUE_414_PHASE3_FINANCIAL_SECURITY_COMMERCIAL_POLICY.md), original Prime policy SHA `7bffd45d`; **do not reopen OD-07/08 choices**. DEC-107 focused file remains Proposed; independently approved Issue352 takeover is respected. All new routes, Seen writes and Dashboard UI are **OFF by default**; `main` remains at `5a844f70`; `ALT-14` and Issue #415 remain outside scope.

**Prime integration provenance:** combined source/contract/Seen/proposed ALT09 index migration commit `23eae9bab7b9c818feb26b43328866540b562cf1`; additive strict-UI-Freeze Dashboard source + exact/Seen/browser regression commit `d4116bc5`. All source-family commits from W17–W23 were cherry-picked serially onto this original Prime worktree before these commits. W24 latest independent read-only source security review **CLEAN** after the prior versioned-route/MFA source issues were addressed; W22 independent UI rereview **CLEAN** after abort and physical-read lease issues were addressed. Neither reviewer ran combined PG/CI or declared release readiness.

### Latest 14 WBS tasks: implementation, owners, source proof, tests and independent review

| WBS | Owner / original implementation SHA | Current source and acceptance proof | Review / status |
|---|---|---|---|
| 414-02-01 | W17 A `fcdb41cd` (preceded by `f5757c2`, `7b0f92a`, `cc2e374`) | ALT04 current Task status/Dispatch version + authoritative **post-lock** DB stage clock, Task/Session retirement, ALT01 same-attempt suppression before LIMIT21; separate mandatory server `MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER` after old writers quiesce. 18/18 W17 pure tests; **PG NOT RUN** | W24 independent source CLEAN; real cutoff and SQL race/authorization PG **BLOCKED** |
| 414-02-02 | W17 A `fcdb41cd` | ALT06 READY immutable Audit/Session readiness episode + original READY timestamp surviving HANDOFF_PENDING; null/extreme/missing proof fails closed; stage cutoff above mandatory; **PG NOT RUN** | W24 independent source CLEAN; PG **BLOCKED** |
| 414-02-03 | W18 B `ab0da70c` → `d6ad903b` → `8a8f3a70` | Forward-only `20261104010800_issue414_seen_receipts`, User+Organization+category+committed-event unique typed FK, idempotent transactional source reauth, list Seen anti-join **before LIMIT21**, exact source remains readable after Seen, seven-day cutoff. W18 real PG17 11/11 + 8/8 PASS; **combined PG/HTTP NOT RUN** | W21 adversarial reviews, final ALT15 leading-zero mismatch fixed; integrated gate **PARTIAL** |
| 414-02-04 | W19 C `87e1cdbc` → `edac2408` → `4656df79` | ALT05 distinct committed takeover operation/Dispatch/Audit actor, assignee, version and metadata relation; replay same occurrence. W19 real PG17 5/5 custody/attribution suite PASS (shared with ALT07), safe reason redaction. CA-only sensitive source assurance. | W20/W24 review, prior identity MAJOR resolved; integrated PG/HTTP **NOT RUN** |
| 414-02-05 | W19 C same final SHA | ALT07 terminalized handoff failure and independent supervisor override, committed AuditEvent ID; ordinary wrong-code excluded; no invented proof grouping, no codes. W19 real PG17 suite 5/5 combined ALT05/07 PASS. | Reviewed; integrated PG/HTTP **NOT RUN** |
| 414-02-06 | W20 D `f3aa64a` → `80df8caa` → `6db98cc9` | ALT09 committed GPS writer VIOLATION, exact tracking/Task/area + 2 peer transition subtype; ambiguous 3+ peer rejects; `recorded_at` seven-day DB attention (not device clock). PG negative/Seen pagination suites authored but **NOT RUN**. Prime add-only proposed `20261104010900` partial index on org/location/recorded_at/id; **EXPLAIN NOT RUN**. | W23 independently reviewed negative fixtures CLEAN; source index/perf gate **BLOCKED** |
| 414-02-07 | Prime integration `feature/issue-414-management-alerts-phase2-phase3` | Versioned `GET /preview-unified`, `GET /sources-unified/... `, explicit `PUT .../seen`; same P1 session and authorization fencing, occurrence-only Seen, category-aware 21 cap/20+ correlation, current exact source reauth. Synthetic API unit and browser suites passed; **mounted real-bearer HTTP, integrated PG/race, full mixed load unavailable**. | W24 prior security BLOCKERs fixed and independent source review CLEAN; **Phase2 BLOCKED** |
| 414-03-01 | W21 E `4b28f43c` → `9828375f` | Narrow CA/exact LM read-only Payment+operation projection; no provider secret, mutation, retry or charge; real PG17 7 standard + 8 race = **15/15 PASS**. | W23 independent source CLEAN; aggregate PG/HTTP still missing |
| 414-03-02 | W21 E same SHA | ALT10 definitive FAILED + authenticated matching committed provider failure audit, ALT11 OUTCOME_UNKNOWN/**REFERENCE_ATTACHED** anchored to original dispatch guard, **no 900s CRITICAL**; unresolved suppresses ALT10 even before delay; strict personal `>120s` default. Real PG17 mixed 23 same-ms, callback race PASS **15/15 combined**. | W23 independent CLEAN; full combined PG/p95 missing |
| 414-03-03 | W22 F `f81dcb4a` → `e75aee03` | ALT13 exact Shift force-end committed AuditEvent ID, no sensitive closure table SELECT/cash inference; source-only SHARED org advisory fence with current session/role/Location post-lock. 21/21 W22 pure tests; **PG concurrency NOT RUN**. | W23 previously flagged exclusive read lock; source correction in W22; real PG/perf still required |
| 414-03-04 | W22 F same SHA | ALT15 CA-only allowlisted committed STAFF_ROLE_CHANGED / STAFF_LOCATION_ACCESS_REVOKED AuditEvent, target Membership source, AuditEvent Seen ID, typed source metadata; 7-day Seen. 21/21 shared W22 pure; W18 adversarial leading-zero PG PASS. | Source static reviews, CA/LM exact combined PG NOT RUN |
| 414-03-05 | W23 G `920b5370` | ALT16 active Location intake OFF current `status='ACTIVE' && accepting_intake=false`, retires on resume/inactivation; current condition has **no fabricated onset clock and no Seen**. W23 API focused source tests. | W24 independent source CLEAN; integrated PG/HTTP pending |
| 414-03-06 | W23 G same SHA | ALT17 CA-only subscription-only recovery utility with effective `dashboard_access_enabled` restriction; **never returns from restricted Dashboard bell**, LM excluded, no Seen/clock invention. API + Dashboard focused tests. | W24 independent source CLEAN; restricted-browser combined gate pending |
| 414-03-07 | Prime integration / Draft PR **#431** | Typed contracts, P1 five categories unchanged on stable legacy routes, additive V2 frontend single foreground 60s owner, no notification on GET, strict EN/AR RTL 320/390/desktop 12-state Chromium suite **2/2 PASS**, exact-source request fence/transport lease; source/adversarial unit checks. **All mandatory final acceptance evidence not yet complete.** | W24 final security and W22 final UI independent read-only reviews CLEAN after corrections; **Phase3 BLOCKED** |

### Consolidated validation and explicit evidence limitations

- **Verified discrete real disposable PG17 BEFORE Docker failure:** W18 Seen 11/11 and 8/8; W19 custody 5/5; W21 Finance 15/15, each from original worker test worktree, cleanup `db=0 roles=0 children=0`. These **do not** prove the Prime integrated schema/HTTP/aggregate behavior.
- **Current Prime non-PG focused** API 69/69 and later API 27/27 + Dashboard 11/11 passed. Final race/legacy transport targeted Dashboard 9/9 PASS. Dashboard Chromium Phase23 2/2 passed, 12 CA browser viewport/theme/locale states + LM, mocked network fixture **not PostgreSQL or live authenticated bearer**. The actual 320px RTL screenshot and bounding-box assertions were inspected. Existing Phase1 `feature OFF` strict UI Freeze Playwright **1/1 PASS**; existing Phase1 ON / Phase23 OFF CA timing/keyboard/EN-AR responsive and LM navigation Playwright **2/2 PASS**. These are genuine Chromium GUI runs with mocked fixture API, **not** real PG HTTP.
- **Root scope gate attempt:** `lint` **11/11 PASS** and `typecheck` **11/11 PASS**; `test:non-postgres` aggregate **FAILED** due unrelated `apps/dashboard/src/features/help/context-help.test.tsx` browser harness `beforeAll` timeout at 40s under concurrent root load; Dashboard **1222 passed / 10 skipped** during that run, all 10 affected context-help tests **PASS** when rerun isolated with one worker and an extended setup allowance (8.69s), and focused alert transport/security tests 9/9 PASS. This isolates load sensitivity but is **not** a replacement for a full root PASS. Separate `test:build-contract` **8/8 PASS**; `build` **10/10 PASS** (verification only, not deployment); `architecture:check` exit0 with baseline grandfathered >300-line warnings only, final API and Dashboard typecheck exit0.
- **BLOCKED, not synthetic PASS:** Docker Desktop CLI remains unresponsive although port 127.0.0.1:45432 listens; PostgreSQL password/role attestation is inaccessible. W17 lease released without running PG (0 tests); W20 GPS negative/Seen after new index, W22 shared-lock concurrency, combined migration/exact/Seen/revocation, mounted authenticated HTTP, sparse/dense `EXPLAIN ANALYZE BUFFERS`, real 25/100/200 tab HTTP/pool/lock/p95 are **NOT RUN**. Do not use port5432 or bypass disposable test isolation. No alteration/restart of user Docker/MinIO services.
- Real production Stage source cutover must be recorded **after old stage writers quiesce and server PG UTC-ms clock is captured**; no environment variable has been activated. Phase-1 clocks cannot substitute for the Phase-2/3 gate. CI and Security CI must be verified against the eventual **final pushed SHA**, not the historical branch head.

### Separate acceptance gates

**Phase 2 = BLOCKED** until W17 stage/READY contested-lock PG, W20 GPS+Seen PG and measured index, integrated Seen/authenticated HTTP, security concurrency, actual mixed load/cadence, independent final cross-review and final CI are evidenced. **Phase 3 = BLOCKED** until W22 source shared-lock PG, CA/LM revocation and malformed audit PG, integrated finance + real HTTP/performance, restricted-shell browser verification and final CI/Security CI are evidenced. Earlier Worker source-only unit and PG PASS do not override these missing gates. This PR must remain Draft and unmerged, feature flags OFF.

---

## Historical initial audit (superseded by the current checkpoint above)

Status: **IMPLEMENTATION IN PROGRESS; PHASE 2/3 GATES NOT PASSED.** This ledger is evidence, not an Accepted Decision or release approval. **OD-07A–D and OD-08A–G Owner policy is now Accepted (DEC-110/111, Prime commit `7bffd45d`).** Historic WBS "OD decision required" statuses below describe the earlier checkpoint; **source proof and unimplemented functionality remain open**, not reapproval of the same choices. Current code/commit/test status must be updated separately per Worker.

## Immutable Git and COS provenance

- Repository: `yamanradwan1-rgb/valet-platform`.
- Verified remote `origin/main` at task start: `5a844f70d5efcda0a618f153b46871e6137a1d36` (Phase 0/1 PR #430).
- Prime integration branch: `feature/issue-414-management-alerts-phase2-phase3`.
- Prime worktree: `D:/kndoom/valet-platform/tmp/issue-414-phase23-prime`.
- COS initial family: `eec10549-7769-45f9-b6b5-578da9e50698`; after Core2-native continuation the status response reported `e18410ab-9088-4a53-8a0d-b897e169758c` for the same physical worker IDs. Preserve both identifiers; no duplicate 17–23 cohort was spawned.
- The original local `main` checkout and two untracked files were preserved. No `main` mutation, production migration, rollout or feature activation is authorized.
- Shared facade, contracts, migration integration and UI are **Prime-owned**. Workers must not edit these shared files without serial authorization.

## Worker ownership and WBS state

| WBS | Source / contract target | COS worker | Worktree (suffix under `tmp/`) | Commit | Tests | Independent review | State |
|---|---|---|---|---|---|---|---|
| 414-02-01 | ALT-04 current Task stage-entry order + READY/ALT-01 retirement | worker-17 | issue-414-p23-a-dispatch | — | NOT RUN | — | SOURCE CLOCK BEFORE LOCK / DECISION REQUIRED |
| 414-02-02 | ALT-06 canonical readiness episode | worker-17 | issue-414-p23-a-dispatch | source `20159483` → Prime `bf5325ba` | 4/4 pure PASS (Worker + Prime) | worker-19 CLEAN | UNEXPOSED CANDIDATE INTEGRATED; CLOCK/OD-07 GATED |
| 414-02-03 | Seen own-User + Organization occurrence receipt, seven-day and source reauthorization | worker-18 | issue-414-p23-b-seen | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-07 DECISION REQUIRED |
| 414-02-04 | ALT-05 takeover committed operation + DEC-107 reconciliation | worker-19 | issue-414-p23-c-custody | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-07 DECISION REQUIRED |
| 414-02-05 | ALT-07 terminalized handoff failure / distinct override | worker-19 | issue-414-p23-c-custody | — | NOT RUN | — | SOURCE REVIEW COMPLETE; EPISODE/OD-07 OPEN |
| 414-02-06 | ALT-09 geofence VIOLATION grouping + privacy | worker-20 | issue-414-p23-d-tracking | — | NOT RUN | — | SOURCE REVIEW COMPLETE; GROUPING/OD-07 OPEN |
| 414-02-07 | Phase 2 integration, negative security, PG/browser/perf and independent gate | Prime | issue-414-phase23-prime | — | NOT RUN | — | NOT PASSED |
| 414-03-01 | CA/LM per-payment and operation projections | worker-21 | issue-414-p23-e-finance | `61afe52d` (decision doc only) | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-08 DECISION REQUIRED |
| 414-03-02 | ALT-10 definitive FAILED vs ALT-11 unresolved UNKNOWN, overlap | worker-21 | issue-414-p23-e-finance | `61afe52d` (decision doc only) | NOT RUN | — | REFERENCE_ATTACHED / OD-08 OPEN |
| 414-03-03 | ALT-13 committed forced Shift closure | worker-22 | issue-414-p23-f-shift-staff | — | NOT RUN | — | SOURCE REVIEW COMPLETE; RUNTIME TABLE SELECT REVOKED; OD-08 OPEN |
| 414-03-04 | ALT-15 allowlisted staff-security audit events | worker-22 | issue-414-p23-f-shift-staff | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-08 OPEN |
| 414-03-05 | ALT-16 active Location not accepting intake | worker-23 (source review); Prime (pure helper) | issue-414-p23-g-location-commercial; issue-414-phase23-prime | `97b84526` (unexposed predicate) | Prime 3/3 pure PASS | worker-18 CLEAN | UNEXPOSED PREDICATE INTEGRATED; OD-08 OPEN |
| 414-03-06 | ALT-17 effective commercial restriction / CA-only utility | worker-23 | issue-414-p23-g-location-commercial | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-08 OPEN |
| 414-03-07 | Phase 3 integrated 16/17 target regression/perf/CI gate | Prime | issue-414-phase23-prime | — | NOT RUN | — | NOT PASSED |

One worker can have multiple WBS rows; the IDs above are **physical** COS workers. Document-only `61afe52d` was integrated by Prime as `e0370969`, **not** as a completed financial feature. Workers 18–23 conducted source reviews without claiming blocked feature implementation. Work-in-progress worker source code is not an integrated commit or test evidence. Update state, SHA, command evidence and review separately when returned and verified.

## Independently reviewed safe precursor

- Prime source commit `527ad36d3ee38ed668d12261032d51aec32d99ab`: additive selected-category metadata for the target 16, Phase1/2/3 distinct, ALT14 explicitly excluded, no widening of existing Phase1 preview schema or source permissions. No active new category exposed.
- Verified from Prime worktree: `corepack pnpm --filter @valet/contracts exec vitest run src/management-alert-category-inventory.test.ts src/management-alert-timing-preferences.test.ts` **2 test files, 7/7 PASS**; `corepack pnpm --filter @valet/contracts typecheck`, `lint`, `build`, root `corepack pnpm architecture:check` and `git diff --cached --check` exit 0. Architecture check reported only grandfathered pre-existing oversized-file warnings.
- Real COS independent **read-only** reviewer `worker-22` inspected exact immutable `527ad36d` against `5a844f70` and reported **CLEAN**, no BLOCKER/MAJOR. Reviewer did not rerun tests and did not edit the code. No PostgreSQL or browser test was necessary for metadata-only change.
- Prime `97b845266700b3066033bf06d9b67863c690b344` adds an **unexposed pure predicate** for ALT-16 current `ACTIVE && !acceptingIntake`, never a stopped-since clock or new Location reader/permission. Exact API Vitest `test/issue414-location-intake-alert-eligibility.test.ts`: **3/3 PASS**; API typecheck, targeted ESLint and `git diff --check` exit 0. Independent read-only reviewer `worker-18` inspected SHA `97b84526` and reported **CLEAN** (no edits/no independently rerun tests). OD-08 remains open.
- Worker `worker-17` source `20159483b11dc8cab67ef8f33a6503469238e0c6` adds internal READY/HANDOFF_PENDING candidate without unique episode ID or threshold eligibility. Worker focused 4/4 PASS, API lint/typecheck/build and architecture check exit 0; independent read-only `worker-19` checked exact commit and reported **CLEAN**. Prime serially cherry-picked it as `bf5325ba3e0f11811b05c33c44f049cd7aa902e4`, then **Prime integrated API Vitest 7/7 PASS** across this and ALT-16 sources. No real PG or browser Phase2/3 test claimed.
- Prime `f52fc80c` contains Prettier-only formatting correction of category inventory test; re-executed inventory unit test **4/4 PASS**, scoped Prettier check PASS. No logic modified by formatting.
- Final combined review: independent read-only COS `worker-20` inspected exact immutable integration diff `5a844f70..305b6562054e2933a03117d752cede817e313af7`, 11 changed files, 647 additions / 0 deletions, source lifecycle, DEC-109/107, new helpers and all decision/evidence documents. Verdict **CLEAN** without any BLOCKER/MAJOR for the *preparatory diff only*. Worker did not edit or rerun full regression, and explicitly did **not** approve Phase 2, Phase 3 or production enablement. Subsequent changes to this ledger are documentation-only.
- GitHub Actions `main` **baseline** push checks on `5a844f70`: CI run `41889681920` **completed success**, Security CI run `41889683483` **completed success**. These are **NOT** CI checks of new Phase 2/3 integration commits.

## GitHub draft-only review and security CI differential

- Prime pushed local `feature/issue-414-management-alerts-phase2-phase3` at `305b6562054e2933a03117d752cede817e313af7`. Draft **PR #431**: `https://github.com/yamanradwan1-rgb/valet-platform/pull/431`, target main base `5a844f70`, **draft=true, merged=false**. This is an Owner decision/evidence review surface, **not** a ready-to-merge completed Phase 2/3 implementation.
- The new-branch **push** Security CI `41898973715` ran with empty `BASE_TREE`: OSV reported 32 total / 32 new / 12 blocking and Trivy 26 total / 26 new / 10 blocking, despite no `pnpm-lock.yaml` or scanner-config diff in the integration commits. This is **a real push Security CI failure**, not a new-category security pass; the missing baseline causes existing findings to be counted as new in this mode. Semgrep push scanned and returned one finding but the gate failed closed due scan/parser `errors` field absent/incomplete. Do not suppress scanners or classify the incomplete Semgrep run as clean.
- The separate **PR** Security CI `41899138635` initially reported OSV, Trivy, Semgrep and Gitleaks jobs success while CodeQL remained in progress; CI `41899138822` was also in progress at that observation. These statuses are time-scoped observations, **not** proof of completion or a replacement for the failed push run. Recheck after any later SHA.

## Final local integration quality (Prime checkout `bf5325ba` plus evidence-only ledger adjustment)

| Exact command from Prime worktree | Exit | Recorded result |
|---|---|---|
| `corepack pnpm lint` | 0 | 11/11 packages PASS, 4 Turbo cache hits |
| `corepack pnpm typecheck` | 0 | 11/11 packages PASS, 4 Turbo cache hits |
| `corepack pnpm test:non-postgres` | 0 | All applicable packages/harness stages PASS, including API 1,501 tests passed / 6 skipped, database 65 passed, contracts 541 passed, Dashboard 1,217 passed and employee-client 928 passed; other packages also completed successfully |
| `corepack pnpm test:build-contract` | 0 | 8/8 PASS |
| `corepack pnpm build` | 0 | Verification build 10/10 PASS, 4 Turbo cache hits; **not** deployed |
| `corepack pnpm architecture:check` | 0 | PASS with grandfathered warnings only; new authored files each under 300 lines |

These checks execute **no Phase2/3 authorized alert reads**: all 11 new categories remain unexposed. No PostgreSQL 17, mounted HTTP bearer, browser/Playwright or new full-category/performance gate tests were run because OD-07/08 and stage chronology remain unresolved. Do not record PG/browser/performance as PASS.

The verification build/non-Postgres tests regenerated three Next `next-env.d.ts` import lines and an unrelated Issue345 render-comparison JSON. Before the commands, Prime worktree was clean; these four **run-generated** changes alone were reverted in the isolated Prime worktree with precise path-scoped `git restore --source=HEAD --worktree -- [four exact paths]`. Original root main checkout and user-untracked files were untouched. Ledger was the only remaining in-scope local diff.

## Binding versus unresolved

- Accepted DEC-109 fixes six per-user delay values, Phase-1 audience, and fail-closed source chronology. The Phase-1 implementation is already merged.
- Master Plan §14 OD-07 and OD-08 **policy was subsequently accepted in focused DEC-110/111 (2026-11-04)**. DEC-107 remains Proposed despite separately approved Issue #352 operational instructions. Source identity, contested-lock clocks, grouping and implementation tests remain outstanding.
- ALT-14 remains `EXTERNAL / DEFERRED / DISABLED`, outside this combined task.
- Owner requested two *separate* Phase 2 and Phase 3 acceptance gates and no auto-merge/production operation.
- Source existence is not permission to expose source data via Management Alerts. **DEC-110/111 now authorize the exact narrow source-specific boundaries described there**, but not blanket audit/payment/GPS rights, guessed episode history or a substantial new source-state model.

## Gate checkpoints

- Phase 2: **NOT PASSED**. Requires five source-authorized categories, approved Seen transaction, true current-event/condition semantics, real PG/browser/UI-Freeze/perf, clean independent review.
- Phase 3: **NOT PASSED**. Requires six source-authorized categories, OD-08 payment/staff/commercial audience, financial overlap, complete Phase-1/2 regressions, real PG/browser/perf and clean review.
- GitHub Owner PR: **#431 CREATED AS DRAFT ONLY**, explicitly `PARTIAL / NOT READY TO MERGE`; `main` remains unchanged by this execution.

Every future row update must link `WBS -> requirement -> owning source -> accepted authority -> identity -> eligibility -> retirement -> implementation -> tests -> reviewer -> SHA -> state`; never replace missing proof with green status.
