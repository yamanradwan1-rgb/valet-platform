# Issue #414 — Phase 2 + Phase 3 Integration Ledger

Status: IN PROGRESS / NOT ACCEPTED. This is evidence, not an Accepted Decision or release approval.

## Immutable Git and COS provenance

- Repository: `yamanradwan1-rgb/valet-platform`.
- Verified remote `origin/main` at task start: `5a844f70d5efcda0a618f153b46871e6137a1d36` (Phase 0/1 PR #430).
- Prime integration branch: `feature/issue-414-management-alerts-phase2-phase3`.
- Prime worktree: `D:/kndoom/valet-platform/tmp/issue-414-phase23-prime`.
- COS family: `eec10549-7769-45f9-b6b5-578da9e50698`.
- The original local `main` checkout and two untracked files were preserved. No `main` mutation, production migration, rollout or feature activation is authorized.
- Shared facade, contracts, migration integration and UI are **Prime-owned**. Workers must not edit these shared files without serial authorization.

## Worker ownership and WBS state

| WBS | Source / contract target | COS worker | Worktree (suffix under `tmp/`) | Commit | Tests | Independent review | State |
|---|---|---|---|---|---|---|---|
| 414-02-01 | ALT-04 current Task stage-entry order + READY/ALT-01 retirement | worker-17 | issue-414-p23-a-dispatch | — | NOT RUN | — | SOURCE CLOCK BEFORE LOCK / DECISION REQUIRED |
| 414-02-02 | ALT-06 canonical readiness episode | worker-17 | issue-414-p23-a-dispatch | `20159483` (unexposed candidate) | 4/4 pure PASS per W17 | worker-19 requested, pending | INTERNAL HELPER REVIEW; CLOCK/OD-07 GATED |
| 414-02-03 | Seen own-User + Organization occurrence receipt, seven-day and source reauthorization | worker-18 | issue-414-p23-b-seen | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-07 DECISION REQUIRED |
| 414-02-04 | ALT-05 takeover committed operation + DEC-107 reconciliation | worker-19 | issue-414-p23-c-custody | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-07 DECISION REQUIRED |
| 414-02-05 | ALT-07 terminalized handoff failure / distinct override | worker-19 | issue-414-p23-c-custody | — | NOT RUN | — | SOURCE REVIEW COMPLETE; EPISODE/OD-07 OPEN |
| 414-02-06 | ALT-09 geofence VIOLATION grouping + privacy | worker-20 | issue-414-p23-d-tracking | — | NOT RUN | — | SOURCE REVIEW COMPLETE; GROUPING/OD-07 OPEN |
| 414-02-07 | Phase 2 integration, negative security, PG/browser/perf and independent gate | Prime | issue-414-phase23-prime | — | NOT RUN | — | NOT PASSED |
| 414-03-01 | CA/LM per-payment and operation projections | worker-21 | issue-414-p23-e-finance | `61afe52d` (decision doc only) | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-08 DECISION REQUIRED |
| 414-03-02 | ALT-10 definitive FAILED vs ALT-11 unresolved UNKNOWN, overlap | worker-21 | issue-414-p23-e-finance | `61afe52d` (decision doc only) | NOT RUN | — | REFERENCE_ATTACHED / OD-08 OPEN |
| 414-03-03 | ALT-13 committed forced Shift closure | worker-22 | issue-414-p23-f-shift-staff | — | NOT RUN | — | SOURCE REVIEW COMPLETE; RUNTIME TABLE SELECT REVOKED; OD-08 OPEN |
| 414-03-04 | ALT-15 allowlisted staff-security audit events | worker-22 | issue-414-p23-f-shift-staff | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-08 OPEN |
| 414-03-05 | ALT-16 active Location not accepting intake | worker-23 (source review); Prime (pure helper) | issue-414-p23-g-location-commercial; issue-414-phase23-prime | `97b84526` (unexposed predicate) | Prime 3/3 pure PASS | worker-18 requested, pending | INTERNAL PREDICATE REVIEW; OD-08 OPEN |
| 414-03-06 | ALT-17 effective commercial restriction / CA-only utility | worker-23 | issue-414-p23-g-location-commercial | — | NOT RUN | — | SOURCE REVIEW COMPLETE; OD-08 OPEN |
| 414-03-07 | Phase 3 integrated 16/17 target regression/perf/CI gate | Prime | issue-414-phase23-prime | — | NOT RUN | — | NOT PASSED |

One worker can have multiple WBS rows; the IDs above are **physical** COS workers. Document-only `61afe52d` was integrated by Prime as `e0370969`, **not** as a completed financial feature. Workers 18–23 conducted source reviews without claiming blocked feature implementation. Work-in-progress worker source code is not an integrated commit or test evidence. Update state, SHA, command evidence and review separately when returned and verified.

## Independently reviewed safe precursor

- Prime source commit `527ad36d3ee38ed668d12261032d51aec32d99ab`: additive selected-category metadata for the target 16, Phase1/2/3 distinct, ALT14 explicitly excluded, no widening of existing Phase1 preview schema or source permissions. No active new category exposed.
- Verified from Prime worktree: `corepack pnpm --filter @valet/contracts exec vitest run src/management-alert-category-inventory.test.ts src/management-alert-timing-preferences.test.ts` **2 test files, 7/7 PASS**; `corepack pnpm --filter @valet/contracts typecheck`, `lint`, `build`, root `corepack pnpm architecture:check` and `git diff --cached --check` exit 0. Architecture check reported only grandfathered pre-existing oversized-file warnings.
- Real COS independent **read-only** reviewer `worker-22` inspected exact immutable `527ad36d` against `5a844f70` and reported **CLEAN**, no BLOCKER/MAJOR. Reviewer did not rerun tests and did not edit the code. No PostgreSQL or browser test was necessary for metadata-only change.
- Prime `97b845266700b3066033bf06d9b67863c690b344` adds an **unexposed pure predicate** for ALT-16 current `ACTIVE && !acceptingIntake`, never a stopped-since clock or new Location reader/permission. Exact API Vitest `test/issue414-location-intake-alert-eligibility.test.ts`: **3/3 PASS**; API typecheck, targeted ESLint and `git diff --check` exit 0. Independent read-only review requested from `worker-18`, not yet accepted. OD-08 remains open.
- GitHub Actions `main` **baseline** push checks on `5a844f70`: CI run `41889681920` **completed success**, Security CI run `41889683483` **completed success**. These are **NOT** CI checks of new Phase 2/3 integration commits.

## Binding versus unresolved

- Accepted DEC-109 fixes six per-user delay values, Phase-1 audience, and fail-closed source chronology. The Phase-1 implementation is already merged.
- Master Plan §14 OD-07 and OD-08 remain open. DEC-107 remains Proposed despite separately approved Issue #352 operational instructions.
- ALT-14 remains `EXTERNAL / DEFERRED / DISABLED`, outside this combined task.
- Owner requested two *separate* Phase 2 and Phase 3 acceptance gates and no auto-merge/production operation.
- Source existence is not permission to expose source data via Management Alerts. Owner decisions must precede any gated endpoint, Seen mutation, sensitive DTO or source authorization widening.

## Gate checkpoints

- Phase 2: **NOT PASSED**. Requires five source-authorized categories, approved Seen transaction, true current-event/condition semantics, real PG/browser/UI-Freeze/perf, clean independent review.
- Phase 3: **NOT PASSED**. Requires six source-authorized categories, OD-08 payment/staff/commercial audience, financial overlap, complete Phase-1/2 regressions, real PG/browser/perf and clean review.
- GitHub owner PR: **NOT CREATED**. `main` remains outside this execution's changes.

Every future row update must link `WBS -> requirement -> owning source -> accepted authority -> identity -> eligibility -> retirement -> implementation -> tests -> reviewer -> SHA -> state`; never replace missing proof with green status.
