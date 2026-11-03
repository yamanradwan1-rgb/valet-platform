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
