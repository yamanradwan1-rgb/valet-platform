# CI Test Quality & Brittleness Review — Execution Index
Date: 2026-11-03
Status: IN PROGRESS — branch-local only; no production or main mutation

## Immutable source baseline
- Repository: yamanradwan1-rgb/valet-platform
- Pinned origin/main: a5a46de42c1a075f84806ecda60a31791493c990
- Earlier CI test baseline: 0a1d7420c9690d15c9765f9624e6d8e7c2470294
- Historical CI run: https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/41342122691
- Difference on the newest main is limited to native dark logo asset/test (no test-harness or CI fix in those commits).
- Owner-supplied plan: VAYLET_CI_TEST_QUALITY_BRITTLENESS_REVIEW_PLAN_2026-11-02.md (local conversation attachment; not repository authority).
- Local main remains at 0a1d7420 with preexisting untracked android/build and test-results preserved. Worktrees are separately pinned to origin/main.

## Locked preservation gates
- Preserve exact tenant/location, role, MFA, privacy, custody, audit, payment and state machine contracts.
- Preserve forward-only migration history and upgrade/role proofs; never alter historical migration SQL.
- No unconditional removal of assertions/test suites, no nonblocking required security CI gates, no silent flake retries.
- Any proposed DELETE, SCHEDULE outside required CI, accepted policy change, PR, main merge, production migration or deployment remains subject to separate owner/release approval.
- Accepted focused DEC files outrank stale tests; Proposed DEC-107 cannot be silently promoted to Accepted.
- One distinct COS worker owns each branch and path; Prime only integrates independently reviewed commits.
- No authored new code file over 300 physical lines and no growth of grandfathered oversized files.

## Scoped task owners (all branches based on pinned SHA)
| Task | Branch | Scope | Gate |
| --- | --- | --- | --- |
| CIQ-01 | cos/ciq-01-inventory-20261103 | Test/lane coverage catalog and evidence, docs only | No silent unowned tests |
| CIQ-02 | cos/ciq-02-dedupe-20261103 | Candidate-by-candidate KEEP/REWRITE/MERGE/REMOVE catalog, docs only | Do not delete by title alone |
| CIQ-03 | cos/ciq-03-harness-20261103 | Unstable test discovery counts, focused executable regression | Preserve exact-owner and Issue215 isolation |
| CIQ-04 | cos/ciq-04-migrations-20261103 | Reconcile migration 103->106 source manifest | Preserve SQL bytes and migration/privilege proofs |
| CIQ-05 | cos/ciq-05-e2e-20261103 | Fix non-exact dashboard locator, diagnose request count | UI Freeze, no assertion loosening without proof |
| CIQ-06 | cos/ciq-06-security-20261103 | Supervisor/assignee/tracking contract review, docs only | No changes based only on existing implementation |
| CIQ-08 | cos/ciq-08-performance-20261103 | Critical-path and cost benchmarking, docs only | No required CI gate edits |
| Prime | cos/ciq-integration-20261103 | Verify cross-branch results, independent diff review, integration | No push/PR/merge without owner approval |

CIQ-07 actual deletion/consolidation is intentionally deferred until CIQ-02 proves unique invariant coverage and the owner authorizes any removals; its current exploratory scope is folded into CIQ-02.

## Measured baseline (single historical run, not statistical median)
- CI elapsed about 21 minutes; postgres-api-race ~20.9m, postgres-api-standard ~20.6m.
- Other failures: migration source inventory 103 vs 106, harness count 42 vs 43, API supervisor/assignee/tracking assertions, dashboard locator/request budget.
- 2,031 tracked .test/.spec files; this is not a CI-executed case count.
- Plan proposes repeated run median/p95 timings, negative coverage matrix and 20% duration reduction target; these are acceptance proposals, not achieved metrics.

## Review and merge gate
1. Worker verifies its changes against own pinned branch, runs focused checks and records exit codes.
2. Different reviewer inspects actual immutable diff; no worker approves own commit as final.
3. Prime cherry-picks only reviewed commits into the dedicated integration branch; resolve conflicts without losing protections.
4. Run combined checks, compare no-loss security coverage and actual CI status on a pushed candidate if separately authorized.
5. Stop and request owner decision for deletion, required-gate changes or Proposed DEC policy contradictions.

## Current status
Worktrees created and worker messages issued. Worker startup acceptance alone is not evidence of successful execution or any passed test. Branch commits, validated results, reviewer verdicts and final SHA must be appended once observed.
