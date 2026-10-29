# C017 independent final QA — provenance and traceability resolution

Independent W5 reviewer rechecked the C017 promoted ledger, 175 record ownerships, 50 formal transfers, 1,804 remaining and 50 reproducible canonical Git blob SHA256/EOF samples across all five actual reviewers. Their [full original report](C017-0747a677-independent-final-ledger-qa.json) correctly reports **coverage PASS** and two **documentation defects**. Preserve that report verbatim for provenance; do not overwrite or relabel its original verdict.

## QA-001 — immutable roster introduction SHA

- The original `C017-0747a677-coverage-summary.json` mistakenly used `ad2094edd7ab9ab5c2de137bcb9a67872f6beefa`, the *preceding RB-003 checkpoint*, as `immutable_roster_docs_commit`. That commit predates the C017 roster. C017's actual immutable roster was introduced by `dfb14c4276d26f9f10a35a37d829bf86b769264c`, verified with `git log --diff-filter=A ... -- checkpoints/C017-0747a677-assignment-roster.json` and `git show`.
- **Resolved by forward audit-docs correction:** C017 summary's `immutable_roster_docs_commit` now points to `dfb14c4276d26f9f10a35a37d829bf86b769264c`. The generic promoter now derives this introducing SHA from Git history instead of copying the roster's distinct `previous_published_audit_commit` parent field. The published original commit `9f21c1ded51526e6c791e2e31b6ea21e4e041132` remains immutable in Git history; no force push/rewrite.

## QA-002 — End Shift SSR candidate ID alias

- The C017 W6 record uses `C017-W6-CAND-P3-END-SHIFT-SSR-STALE`, while the finding evidence conserves the earlier RB-003 candidate `RB003-W7-CAND-P2-ENDSHIFT-OLD-SSR-TEST`, subsequently triaged down to likely P3 fixture alignment after full owner-scoped hook analysis.
- **Resolved:** `C017-0747a677-finding-evidence.json` now explicitly maps the C017 record ID to the RB-003 canonical evidence ID. One underlying hypothesis is counted once, not as a newly discovered P2.

These documentation corrections do not change source commit, 175 reviewed paths or hashes, original/actual reviewers, source-reviewed lines, ledger, remaining, finding severities, or runtime test count. The independently validated coverage remains **2,985/4,789 files** and **376,448/620,723 lines**, with **1,804 remaining** and **zero runtime tests**. C018's pre-assigned roster must retain the same 1,804-file baseline; no source or UI edit is authorized.
