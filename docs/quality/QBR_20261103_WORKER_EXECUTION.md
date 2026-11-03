# VAYLET — Test Rationalization execution checkpoint
Date: 2026-11-03
Status: IMPLEMENTATION IN PROGRESS; no main/PR/deployment mutation.

## Repository provenance
Pinned newest origin/main: 88129a5212f0dd886afbefe6f2b3be1db938f527 (merged PR #418).
Previously approved Draft CIQ PR #413: head 892988ce1f8f38874de3319f157f1704ecb2f9ab; still open Draft at initial check, do not presume merge approval.
New local combined *seed* commit 5bae0b8c51ce60b963e6647d83853a8b9ad37573 on cos/ciq-rationalize-seed-20261103 merges old CIQ fixes with latest origin/main. Existing main local and its untracked user artifacts untouched.
Prime integration: cos/ciq-rat-integration-20261103, initially pinned to seed 5bae0b8c.

## COS assignments and exclusive paths
| Logical task | COS identity | Worktree suffix cos-ciq-rat-*-20261103 | Permitted focus |
| --- | --- | --- | --- |
| QBR-01 End Shift mocked recovery | worker-3, awakened | endshift | src/components/end-shift-recovery.test.tsx |
| QBR-02 Dashboard fragile locator | worker-5, awakened | selectors | apps/dashboard/e2e-runtime/md-r11-administration.spec.ts |
| QBR-03 Live Map tracker fixture | worker-6, awakened | tracking | apps/api/test/management-tracking-boundaries.integration.test.ts |
| QBR-04 Proven duplicated assertions | worker-7, awakened | dedupe | help mapping and duplicate Guest CSS assertion, conditional |
| QBR-05 Local test-impact ergonomics | worker-16, COS failed startup | impact | Prime handles docs-only diagnostic guidance, no unsafe selector script |
| QBR-06 Safe CI optimization experiments | worker-17, invited | performance | CI workflow and cost baseline, no gate downgrade |
| QBR-07 Security test contradictions | worker-18, COS failed startup | security | Prime handles decision-mapping report, no policy edits |

"Awakened"/"invited" are broker requests, NOT proof of successful worker execution. Confirm actual worker acknowledgments and returned commits separately. Do not create non-COS replacement workers; failed startups due to model-selection composer are native COS blockers.

## Mandatory protections
- Every endpoint's tenant/Location/Shift/MFA denial, custody, payment, audit, idempotent retry, concurrency and Issue215 coverage stays protected.
- Tests removed or simplified only with proof of redundant invariant coverage; do not delete real HTTP endpoints' guards or real-browser paths based on matching titles.
- No required CI gate weakening, silent skip, retry-until-green, SQL history rewrite or policy change. DEC-107 currently Proposed pending reconciliation.
- No change to frozen VAYLET UI visuals, copy, theme or navigation unless explicitly authorized separately.
- No claims of 20–30% performance improvement without comparable before/after measured CI runs.
- Local tests, discovered Playwright tests, remote CI, approved disposable-Postgres E2E and production are distinct proof levels.
- Only Prime cherry-picks independently reviewed commits from clean worker branches into its separate integration branch. No push, PR, main merge, deployment or production DB action in this batch without additional approval.

## Historical CI #582 triage
The previous full PR run #582 (41542741666) failed Unit End Shift recovery, Dashboard R11 selector, management live map fixture, Supervisor Tasks expected 404/actual 200, terminal Task assignee expected null/actual identity. Prior run had the last three API failures as well. These are root-cause targets, not reasons to suppress tests.

## Results and hold points
At checkpoint creation no new worker commit, reviewed test pass, runtime E2E, remote CI or performance delta from this new task batch is yet certified. Updates require an exact immutable SHA, command/exit evidence and separate reviewer verdict. Keep safety decisions unresolved rather than forcing green.


## Implementation and verification checkpoint (2026-11-03, updated by Prime)
- Integration commit before this documentation update: `b605ddf077e33896173b5cf36620447b982cd0bb`, clean. Existing origin/main remained `88129a5212f0dd886afbefe6f2b3be1db938f527`. This branch descends from Draft PR #413's `892988ce`; fast-forwarding that existing PR branch is possible without force.
- **QBR-01 End Shift** — author SHA `b06e8db0`, integrated `cb98fc45`: mounted real hook/controller over explicit same-Shift UI submission → uncertain network result → NO_ACTIVE_SHIFT → same-command retry; switched identity/Shift cannot inherit unknown intent. Independently reviewed CLEAN by worker-5. Integrated focused 8 files **39/39 PASS**, Valet lint/typecheck PASS, architecture PASS. Adds test-only `react-test-renderer` and types; **deprecated library warnings remain**, no browser E2E claimed.
- **QBR-02 Dashboard R11** — author `54ae9cfc`, corrected Prettier `343abb00`, integrated `028c6358` and `b605ddf0`: unique scoped value combobox in Company/Location, no visual source changes. Worker-3 final read-only reviewer CLEAN. Integrated Dashboard focused 4 suites **20/20 PASS**, Dashboard lint/typecheck PASS; scoped Prettier PASS; **Playwright --list 2** is test discovery, NOT execution.
- **QBR-03 Management Live Map** — author `6c0df6bf`, integrated `31fe7aa4`: fixture now has historical immutable `assignee_membership_id` matching owned Task, with response ownership assertion. Worker-7 independently found no source issue, verdict MERGEABLE AFTER FIXES solely because disposable **real PostgreSQL HTTP integration NOT RUN** locally; policy-off and cross-Organization negatives retained. API lint/typecheck PASS.
- **QBR-04 Help coverage** — author `d073313c`, integrated `e9025462`: replaced tautological swapped-map comparisons with validator rejection for missing CONTENT help; independent worker-5 CLEAN. Integrated focused help/settings **20/20 PASS**. Avoided unproven CSS assertion deletion.
- **QBR-05 Local testing guidance / QBR-07 Security semantics** — Prime documentation only, no unsafe auto selector and no role policy/test expectations changed. DEC-107 remains Proposed despite approved narrow owner policy; terminal assignee privacy/historical projection remains unresolved. Prior CI #582 showed these API failures.
- **QBR-06 CI cache** — Prime `b6901e9e`: across five workflow setup blocks, pnpm v10.34.5 installs before setup-node v4 `cache: pnpm` rooted in the lockfile. Semantically normalized workflow audit **PASS** (unchanged six jobs, all matrices, protected Issue215, every frozen install, E2E, quality aggregator); independent worker-6 CLEAN for config *subject to remote CI*. **No measured speed improvement yet**.
- **Other integrated checks**: Node Harness **45/45 PASS**, database source manifest **1/1 PASS**, integrated architecture PASS (existing grandfathered warnings), git diff integrity PASS, frozen offline dependency install PASS.
- **Unrun gates**: fresh remote PR CI, real disposable PostgreSQL API integration and Dashboard Playwright browser E2E. Docker daemon missing and database connection variables intentionally absent locally; never use unknown or production DB. The PR CI is the designated isolated runner.
- **No false green**: previous 404/200 Supervisor Tasks scope and terminal Tasks historical assignee are policy/PII reconciliation, not authorized assertion-deletion candidates. Never make PR mergeable by lowering required tests.
- **COS capacity**: seven logical task assignments; four workers actually executed and independently reviewed scoped commits, the other three launch attempts failed. Their documentation/config scopes were handled directly by Prime. Do not report seven working child agents.
- **Publication policy**: Owner previously expressly approved publishing Draft PR #413 to test; this later conversation requested continuation to completion. Updates to existing Draft PR are for obtaining remote evidence, **not** authorization to merge, migrate production, deploy or change branch protection.
