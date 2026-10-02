# Issue #240 / T05-G — Force End UI and cumulative Task05 closure

Status: **Task05 BLOCKED**. Force End UI focused acceptance passed; cumulative
API/database/browser and repository gates have failures recorded below.
Baseline: `4604048439eae0c1b8306a9b36afe2d2df6c66c6`.
Owned normal branch: `fix/240g-force-end-closure`. No worktree, PR, merge or Issue write.

## Accepted implementation map

Authority: owner T05-G brief clauses 0–71, Issue #240, complete execution plan
section 13/17–28, Accepted DEC-078/080/081/082/088/032/052 and merged A–F records.
The existing T05-F command remains the sole mutation authority.

Entities: Shift, OrganizationMembership identity, Location, Organization and exact
Staff session/MFA factor. Backend transition: existing Shift ACTIVE→ENDED only.
ValetSession/Task/Dispatch transitions: none. Configuration inheritance: none.
Database constraints/indexes: existing migration 054 only; no migration 055 and
no edits to 001–054. Scope remains approved sellable-MVP staff administration.

| Concern      | Locked behavior / derived implementation                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry        | One bottom action region after existing ACTIVE detail facts; authoritative loaded CA/LM detail only; Details row action unchanged                                                                      |
| Dialog       | Adjacent FocusDialog, canonical name/email and Location name/code, required textarea, confirmation checkbox, Cancel, submit and localized status                                                       |
| API          | Focused DashboardApiClient POST helper; exported strict request/result schemas; response operation/target correlation                                                                                  |
| Intent       | Full administrationScopeKey + distinct Shift selection revision + Shift + canonical material revision; mount/sequence fences on every callback                                                         |
| Operation    | UUID at first valid explicit submit; identical material retains it through MFA/blocker/unknown/auth-reconciled explicit retry; changed material rotates; success retires                               |
| Reason       | Shared reason schema; Unicode retained, outer trim, 1–500 UTF-16 units; maxLength 500; no storage/log/URL                                                                                              |
| Confirmation | Real checkbox; request token only after checked; invalid/busy submission disabled                                                                                                                      |
| MFA          | Existing SensitiveMfaDialog only; completion shows review/resubmit message; zero automatic Force End POST                                                                                              |
| Auth refresh | Existing API refuses POST replay; narrow volatile recovery only for that explicit rejected POST and exact reconciled identity/session/selection; freshly read detail required before draft restoration |
| Unknown      | NETWORK_ERROR/malformed mutation boundary stays unresolved; freeze exact submitted material until explicit READ reconciliation; no new automatic operation                                             |
| Reconcile    | One history first-page GET plus one selected detail GET; preserve selection only for this action; clear cursor history and advance read generations                                                    |
| Read result  | ENDED disables further Force End; ACTIVE permits explicit same-operation retry after review; denied reads clear protected dialog/target                                                                |
| Conflicts    | Open Task blocker is text only; already-ended/idempotency conflict requires review and explicit reconciliation; no Task/Session/cash mutation                                                          |
| Invalidation | Filters/page/manual refresh clear selection; scope/session/logout/target changes destroy drafts/MFA and suppress stale success/error/finally/reconcile                                                 |
| Budget       | Detail 1 GET, dialog 0 business GET, explicit submit ≤1 POST, reconciliation ≤1 list + ≤1 detail, local duration 0 HTTP                                                                                |
| Visual       | Exact-baseline deterministic table/drawer/MFA; final EN light desktop, AR dark desktop, EN dark narrow, AR light narrow plus unknown/success                                                           |
| Tests        | Pure intent/error/API tests; real Chromium retry/budget/unknown/authority/fencing/focus/storage/visual proof; reuse real A–F DB evidence and run cumulative suites once                                |
| Structure    | Existing body 233 lines; separate API, dialog, hook, copy, recovery and drawer coordinator responsibilities; every authored file ≤300 physical lines                                                   |

No unresolved product policy is encoded. Forbidden expansions are those in the
owner brief: Force Start, second MFA system, backend rewrite, migration 055,
Task/Session automation, cash settlement, payroll, timesheets or redesign.

## Evidence ledger

Fresh baseline browser capture: existing `issue240e-baseline.spec.ts`, 8/8 PASS
at the exact required SHA before UI changes. Artifacts: `issue240g-baseline/`.
First sandbox invocation failed before startup on dependency-hardlink EPERM;
approved execution passed. Node 24.18.0, pnpm 10.34.5, Chromium, one worker.
Existing-MFA pre-UI baseline: 4/4 PASS, 4 PNGs in `issue240g-mfa-baseline/`.
No deployment, remote CI, live browser-to-API or paid-customer pilot claim.

## Final gates and evidence boundaries

Exact commands/counts and historical failures:
[issue240g-evidence-ledger.json](issue240g-evidence-ledger.json).
The API/database/E2E manifests enumerate actual selections. Browser tests run
the actual Dashboard with explicit API fixtures; backend/database tests use
owned isolated real PostgreSQL and restricted runtime roles. These evidence
levels are distinct. Remote CI, deployment and full-shift pilot are **UNRUN**.
Raw logs remain ignored; committed artifacts are sanitized JSON and synthetic
captures. Failed/preliminary duplicate traces were removed after their outcomes
were recorded, not relabeled PASS.

| Gate                        | Status          | Actual result                                                                                                                                                           |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard units             | PASS            | 80 files / 594 tests, including intent, recovery and strict API negative/correlation cases                                                                              |
| Cumulative Task05 contracts | PASS            | 9 files / 65 tests                                                                                                                                                      |
| Final scoped browser proof  | PASS            | 68 distinct new cases + 8 existing baseline cases have successful final scoped evidence; union of runs, not a single 76-case green run                                  |
| Final browser main run      | FAIL, corrected | 65/68 passed; focus defect and two ALL fixture errors fixed and rerun below                                                                                             |
| Final correction run        | PASS            | 22/22: keyboard, page/filter fences, baseline freeze, final visual matrix and CA/LM submit                                                                              |
| Cumulative owned API        | FAIL            | 63 files, 319 passed / 4 failed; all 62 Force End command/authority/race cases passed                                                                                   |
| Cumulative owned DB/runtime | FAIL            | 9 files, 27 passed / 3 failed; all 4 migration-054 fresh/upgrade/runtime cases passed                                                                                   |
| Cumulative Dashboard E2E    | FAIL / stopped  | 180 selected; 78 reported failed before sign-in, 79th interrupted, 101 unstarted; generated Next route inventory returned 404; one broad run, no broad replay           |
| Root typecheck              | FAIL            | Generated dashboard validator Route→never; recovered final Dashboard check passes, separate Employee check still fails 15 missing-timezone errors in 9 unchanged files  |
| Root lint                   | FAIL            | 9 errors / 3 warnings in 5 unchanged foundation/scope files                                                                                                             |
| Root format                 | FAIL            | 950 reported files; 851 tracked files proven unchanged, remaining 99 outside tracked baseline include reference/task artifacts; not all 950 are called baseline defects |
| Final Dashboard typecheck   | PASS            | Final source after successful production compilation/cache recovery                                                                                                     |
| Final owned lint            | PASS            | 27 owned TS/TSX files, max warnings 0                                                                                                                                   |
| Final owned format          | PASS            | Explicit owned-source/docs/JSON Prettier check passed; final evidence synchronization checked before commit                                                             |
| Architecture                | PASS            | Existing grandfathered warnings only; no allowances changed                                                                                                             |
| Prisma                      | PASS            | Real Prisma validation, separate from migration verification                                                                                                            |
| Root production build       | PASS            | One no-cache run, 10/10 tasks; final focus correction also passed Dashboard-only production build; local compilation only                                               |
| Broad PostgreSQL            | FAIL            | One complete serial run: 374 files, 2617 passed / 27 failed; API 1942/2, DB 675/25; exact failures in ledger                                                            |

## Exact closure blockers and provenance

[issue240g-baseline-provenance.json](issue240g-baseline-provenance.json) records
base/current Git blobs for failed source/test files, 851 unchanged tracked format
files and all 54 historical migrations. No API, contract, database, migration or
test-harness source changes belong to this branch.

| Blocker                        | Exact observed failure                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory Location concealment | `apps/api/test/staff-directory-filters.integration.test.ts:151`: foreign filter expected 404, received 200; reproduced isolated. Requires investigation; no claim of corrected authorization.                                                                   |
| Directory cursor contract      | `apps/api/test/staff-management-directory-pagination.integration.test.ts:70`: foreign-org cursor expected 400, received 404; reproduced isolated; no reinterpretation of accepted errors.                                                                       |
| Large-grant proof              | `apps/api/test/staff-management-lm-mutations.integration.test.ts:176`: >100-grant case exceeded existing 5000ms limit.                                                                                                                                          |
| History plan proof             | `apps/api/test/staff-shift-history-plan.integration.test.ts:11`: 40,000-row case exceeded existing 5000ms limit.                                                                                                                                                |
| Migration count assertions     | Identity expects 49; onboarding/activation expect 53; real fresh/upgrade databases contain 54, latest migration 054; all three tests unchanged.                                                                                                                 |
| Cumulative browser gate        | Empty generated `.next` route inventory; `/` and `/employees` returned 404 before sign-in. Task-owned run stopped; only generated cache removed. HTTP 200 preflight, production builds and focused UI checks then passed. Broad gate remains failed/unverified. |
| Repository typecheck           | Separate Employee check: 15 TS2741 missing Location.timezone errors across the 9 exact unchanged files in provenance JSON.                                                                                                                                      |
| Repository lint/format         | Exact 5 lint files and 851 tracked format files in provenance JSON; unrelated sources not formatted/refactored.                                                                                                                                                 |

The existing history-plan test rewrites its timing artifact during execution;
that generated artifact is restored to starting content before delivery.
No timeout increase, skipped test, weakened assertion/race barrier, retry loop
or CI configuration change. No failed gate is treated as closure PASS.

Owned defects corrected during development: StrictMode/auth epoch recovery;
transient list error hiding unknown review; focus returning to a replaced row;
consumed 401 intent resurrecting through tab navigation; nested MFA Escape and
disabled-submit focus falling to body. Corresponding negative browser cases
pass. Fixture mistakes (ALL value, exact scope naming, scope changes behind the
modal) were corrected without relaxing assertions or timeouts.

## Single broad PostgreSQL result

The one canonical broad invocation completed with exit 1: 374 files,
2,617 passed / 27 failed. API: 1,942 passed / 2 failed. Database: 675 passed /
25 failed. Both owned-run timing cases passed in this wider run with unchanged
limits; their earlier owned-run failures remain recorded, not erased.

The two API failures are the same directory assertions above. Database failures
comprise 24 stale migration-count/latest expectations and one
`packages/database/src/schema.integration.test.ts:2516` required AuditEvent
field case: expected NOT NULL SQLSTATE `23502`, received permission SQLSTATE
`42501`. The exact case/file/reference/error for all 27 is in the ledger.
All 26 failing test files match their baseline blobs. No root-sweep failure was
repaired by changing an unrelated test, runtime privilege or migration.
Every project reports owned cleanup `db=0 roles=0 children=0`; cluster lease
released after completion. No broad repeat or PostgreSQL test overlap.

## Cumulative A–F reconciliation and migration lineage

Previously merged focused acceptance remains evidence at its stated boundary;
it does not turn fresh failed cumulative gates into PASS.

| Slice | Prior binding record / capability                                                                                                                                    | Fresh closure result                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A     | [Identity/directory](ISSUE_240A_STAFF_IDENTITY_DIRECTORY.md): membership-owned names, global email, bounded pages/filtering                                          | BLOCKED: two directory assertions above, identity DB count stale                                                                        |
| B     | [LM authority/grants](ISSUE_240B_LM_STAFF_AUTHORITY_LOCATION_GRANTS.md): full target coverage, mixed/outside/zero denial, roles/last-admin and deactivation blockers | BLOCKED cumulatively: owned-run timing failure; the same case passes in broad canonical run without altered limits                      |
| C     | [Onboarding](ISSUE_240C_STAFF_ONBOARDING_BACKEND.md): generation rotation/consume/redaction, anti-abuse and PENDING quarantine                                       | BLOCKED cumulatively: fresh API cases pass; migration count fails                                                                       |
| D     | [Activation/UI](ISSUE_240D_STAFF_ACTIVATION_UI.md): account ownership, activation, copy-link-only delivery                                                           | BLOCKED cumulatively: migration count and broad browser gate; prior focused proof retained                                              |
| E     | [History](ISSUE_240E_SHIFT_HISTORY.md): ACTIVE/ENDED pages, scoped filters, stable ended/local duration, bounded lazy reads                                          | BLOCKED cumulatively: owned plan timeout (passes in canonical broad run) and browser gate; baseline geometry/focused G regressions pass |
| F     | [MFA/Force End](ISSUE_240F_LM_MFA_FORCE_END_BACKEND.md): exact-session MFA, mandatory reason, atomic manager audit, pending cash, operational races                  | Focused backend PASS: 62 command/authority/race + 4 migration/runtime cases; aggregate closure still BLOCKED                            |

All unchanged: `20261001004900_mgt_240a_staff_identity`,
`20261001005000_mgt_240b_lm_staff_authority`,
`20261001005100_mgt_240c_staff_onboarding_invites`,
`20261001005200_mgt_240c_invitation_anti_abuse_scope`,
`20261001005300_mgt_240d_staff_activation`,
`20261002005400_mgt_240f_force_end_shift`. No T05-E migration or 055.

## Visual, accessibility and privacy proof

Before: `issue240g-baseline/` 32 PNGs and `issue240g-mfa-baseline/` 4 PNGs.
After: `issue240g-final-corrections/issue240g-freeze-*` 32 PNGs and
`issue240g-verified-final/issue240g-mfa-baseline-*` 4 PNGs. Existing baseline test
unchanged. Owned freeze copy uses exact baseline capture clock 09:55 UTC to
preserve duration and automatic column inputs.

[issue240g-visual-comparison.json](issue240g-visual-comparison.json) compares all
36 surfaces. Only the new bottom action is excluded on ACTIVE drawers. Outside
that action, 35 match exactly. EN-dark narrow Shifts has four pixels at
`(394..396,265..266)` with one RGB channel differing by one; native-control
raster rounding is an inference, not a claim of zero difference. Geometry
assertions pass; CSS/shared primitive sources unchanged. Existing MFA matches
exactly in all four variants.

| Final Force End matrix | Size     | Five PNG states in `issue240g-final-corrections/issue240g-visual-*`         |
| ---------------------- | -------- | --------------------------------------------------------------------------- |
| EN Light LTR desktop   | 1440×900 | active-drawer, force-end, nested-mfa, outcome-unknown, success-pending-cash |
| AR Dark RTL desktop    | 1440×900 | same five states                                                            |
| EN Dark LTR narrow     | 480×900  | same five states                                                            |
| AR Light RTL narrow    | 480×900  | same five states                                                            |

Keyboard: initial Reason focus, labeled help, checkbox Space, Tab/Shift+Tab trap,
topmost Escape, nested MFA return, busy/terminal focus recovery, parent action/
close and authoritative current-row focus return. Status is polite; no page
horizontal overflow in the final matrix. Reason/operation absent from URL,
localStorage, sessionStorage, cookies, CacheStorage, IndexedDB, resource URLs and
console. Screenshots use synthetic identity/reason; no new invitation storage.

## Hostile review — required skill verdicts

1. **Review target:** exact starting SHA versus owned local/staged diff and
   final manifest. Final local/remote SHA is reported after push; no summary-only
   review and no human cross-review claim.
2. **Decision/docs checked:** named Accepted DECs, Issue #240/owner clauses,
   AGENTS, security/DoD/structure/engineering docs, plan and A–F records; guardian
   review matrix and authorization/production evidence references.
3. **Findings:** exact cumulative/repository blockers above. No remaining owned
   UI defect identified after focused corrections; failing closure remains open.
4. **Security/tenant/location:** CA/LM current scope only, lower-role denial;
   simulated revalidation after LM grant/role/entitlement loss conceals identity.
   Real F tests prove foreign/outside-grant/replay denial. Existing directory
   Location 200 failure remains a blocker, not a claimed security fix.
5. **Retry/concurrency/DB:** sync one-POST guard, canonical stable operation,
   unknown GET-only reconciliation and late success/catch/finally suppression
   exercised. Existing DB remains authority; no SQL or constraint changes.
6. **Abstraction compatibility:** existing strict schemas, DashboardApiClient,
   FocusDialog/SensitiveMfaDialog reused without broadening.
7. **Audit/privacy:** no new writer. Existing F atomic closure/audit and pending
   cash preserved. Safe fixed errors expose no prior reason; storage/log negatives.
8. **Downstream:** no Task/Dispatch eligibility or ownership change; existing
   backend boundaries preserved.
9. **Architecture/300 lines:** all 27 owned code files ≤300; exact counts in
   change manifest; architecture gate PASS, no exceptions added.
10. **Test adequacy:** focused UI/race/keyboard/matrix and real F proof pass;
    failed cumulative gates prevent full Task05 proof.
11. **Scope leakage:** Dashboard staff/tests/evidence only; no migration,
    backend rewrite, CSS redesign or new issue.
12. **Gate evidence:** strongest observed levels labeled; no CI/deploy/pilot
    claim; historical FAILs retained after focused fixes.
13. **Merge verdict: BLOCK MERGE.** Task05 **BLOCKED** until exact failures are
    resolved/reverified within approved scope and repository CI/human review.

Unchanged authorization-before-mutation trace: controller resolves exact staff
session; service `authorizeStaffManagement(...SENSITIVE)`; SQL independently
proves org/actor/entitlement/session/factor and persisted Shift Location/current
LM grant; Shift lock; replay/state/open-Task decision; then Shift/closure/
SHIFT_FORCE_ENDED atomically, admin activity and commit. UI visibility is not
backend authorization. No client Task/Session/cash mutation exists.

## Owner final-report checklist

### Post-push correction — conflict material freeze

Owner-authorized correction starts at
`13bb9d1baa3fc4c23e83a728726461af03238543` on the same branch. Review discovered
that `ended-conflict` and `conflict` disabled submission but did not lock edits.
Changing Reason/confirmation reset the phase to idle and could allocate another
operation before authoritative reconciliation. The prior self-review missed
this bypass; its historical test results remain recorded above.

Locked correction: freeze both mutation fields in both conflict phases until
explicit bounded Refresh status; ENDED forbids further submission, ACTIVE uses
the existing reviewed retry rules. Derived mechanics: add only those two phases
to the existing hook lock predicate and extend the existing browser cases.
Affected entity: Shift UI intent only. No new domain transitions, tenant/Location
authority, configuration, DB constraints/indexes or MVP scope changes. Unknown,
MFA, auth retry, blocker, operation identity and scope/session fences unchanged.
No unresolved product choice. No extraction needed: both authored targets are
below 300 physical lines.

**T05-G focused correction PASS:** one normal run of
`pnpm --filter @valet/dashboard test:e2e e2e/issue240g-unknown.spec.ts --reporter=line`
against the existing manual Dashboard runtime passed **7/7**. Both conflict cases
assert disabled Reason, disabled checked confirmation and disabled submit;
native pointer/keyboard attempts cannot change material or escape the conflict.
UUID allocation count remains unchanged and POST count stays exactly one before
Refresh. Explicit Refresh alone adds one history GET and one detail GET. An
ENDED result exposes neither Force End nor Retry and allocates no new UUID.
The four unknown-outcome cases and existing 401 stable-operation retry also pass.

Dashboard typecheck and two-file ESLint passed. Changed-file Prettier/whitespace
results are synchronized in the correction ledger before commit. The cumulative
manifest remains **132 files**, with **five** correction files, all already in
that manifest. Maximum authored file remains **268 lines**.

Manual hostile review: the only production change is the lock predicate. Unknown,
blocker retry, MFA success requiring explicit click, auth refresh requiring
explicit same-operation retry, operationId allocation and reconciliation/fences
are unchanged. No API/contracts/database/migration/privilege changes, Force Start,
Task/Session automation, timeout increase or weakened assertion/race. Generated
preview reference/test-result artifacts were restored/removed only for this run.
No PostgreSQL, cumulative API/DB/browser, root full gate or production build was
rerun. Historical failure evidence remains intact; all cumulative blockers are
unchanged. Task05 closure remains **BLOCKED**. No PR, merge or Issue write.

| Items | Result / exact evidence                                                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–5   | Exact branch/base above; final commit/remote SHA reported after push. `issue240g-change-manifest.json` enumerates every changed file and physical code count.                            |
| 6–7   | No 055; 001–054 baseline/current blobs identical.                                                                                                                                        |
| 8–12  | ACTIVE drawer bottom action, canonical target/location, required Reason, checkbox and Cancel/submit/status; operation/reason/confirmation behavior in map and unit/browser proof.        |
| 13–15 | Existing nested MFA and exact-session 401 recovery; successful ceremony/refresh has zero automatic POST; explicit retry retains operation for same material.                             |
| 16–22 | Frozen unknown, explicit bounded GET reconcile, parsed-success ≤1 history + ≤1 detail, text blocker, ended disables, conflict explicit review, duplicate-click one POST.                 |
| 23–28 | CA/LM success, lower-role direct navigation denial; org/location/Shift/filter ABA, cursor/manual refresh, logout/session and grant/role/entitlement late success/failure/finally fences. |
| 29–35 | Storage/console/URL negatives, bounded counts, keyboard, EN/AR RTL/LTR, themes, desktop/narrow matrix and baseline comparison above.                                                     |
| 36–41 | A–F table distinguishes prior focused acceptance from fresh cumulative BLOCKED status.                                                                                                   |
| 42–52 | Gate table/ledger: contracts, API, DB, E2E, typecheck/lint/format, architecture, Prisma, builds and single broad PostgreSQL result.                                                      |
| 53–56 | Exact failures/provenance; no timeout increase/test weakening; final max physical authored-code count in manifest.                                                                       |
| 57–60 | No Force Start, Task/Session automation, new MFA system or backend Force End semantic rewrite.                                                                                           |
| 61–62 | Task05 **BLOCKED** with exact blockers; final clean status/matching remote SHA verified after push. No PR, merge or Issue write.                                                         |
