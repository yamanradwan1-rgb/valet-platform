# RB-003 — C016 pinned-source to latest-main deterministic rebaseline

## Source epochs and published checkpoint

- Previous immutable product source `d67b2a4a4897b4a73d21aba630fc5ab52ff9169b`, tree `8731302512f8db4edb8bbb1cdc50b208a0dcb5b8`.
- Fetched target `origin/main` `0747a677ddf7fc3e1093490b7ef0a7bee9e2d938`, tree `9fbe93fe55b5ef7c42888a874cc7217a594ccace`.
- Published and remotely verified prior audit checkpoint C016: `f93a0bc72cc3046303292e744dad168629330dc6`; its ledger is the **only** starting inventory for this rebaseline.
- Source read-only clean detached worktree `tmp/cos-audit-20261029-rb003-source`; documentation generated only on the dedicated audit branch, never inside the source worktree.

## Final exact Git-blob accounting (after targeted semantic dependency review)

| Property | Certified RB-003 reconciliation |
| --- | ---: |
| Tracked paths | 7,595 (previously 7,584) |
| Changed paths | 18 = 7 modified + 11 added, 0 removed |
| Newly added eligible authored-code files | 10 |
| New `.html` e2e fixture scaffold | 1 excluded by existing extension-based rule; actual scripted behavior lives in referenced `.ts` source, which is included |
| Previously credited reviewed code changed (mandatory stale) | 6 |
| Previously unreviewed code changed | 1 |
| Byte-identical reviews preserved before dependency review | 2,825 |
| Byte-identical reviews invalidated for changed caller/authority semantics | **15** (2 Staff Push, 13 Employee Web; **2,482** lines) |
| Byte-identical reviews still valid after targeted analysis | **2,810** |
| Current-main eligible source files | 4,789 |
| Current-main eligible source lines | 620,723 |
| **Current-main credited reviewed files** | **2,810 / 4,789 (58.68%)** |
| **Current-main credited reviewed lines** | **353,103 / 620,723 (56.89%)** |
| **Current-main unreviewed eligible files** | **1,979** |

The six mandatory stale records are four Staff Push modules, `employee-app.tsx` and `employee-workspace.ts`. `end-shift-controller.ts` changed while previously unreviewed, and the ten eligible additions are mostly #357/#358 concurrency/Employee Web tests and scoped session hooks. Exact provenance is in the `git-diff-inventory`, `invalidated-published-reviews`, `new-source-candidates` and full new ledger files. Historical C016 records and older checkpoints are not rewritten or erased.

## Targeted dependency gate — completed

**Final target-source credit is 2,810, not 2,825.** W1 re-read the changed Staff Push claim/FCM transport contract and its importers, invalidating two previously credited unchanged helpers/tests; W7 re-read the Employee Web workspace/end-shift authority transition and consumers, invalidating thirteen unchanged reviewed files. Both reports identify explicitly cleared dependencies and precise reasons. The source-only W2 independent FCM-revocation check found a reachable generic post-eligibility notification race **already Accepted in DEC-073/DEC-076**, not a new P2 regression (optional P3 contract/test clarity). Source-only Employee Web stale same-location authority and old SSR fixture hypotheses remain for focused C017 review; none is confirmed by runtime execution.

The independent source-object QA checked 6 modified reviewed blobs, 10 newly eligible blob hashes/lines, 2,810 unchanged Git OIDs and 69 canonical SHA256 samples, plus all 15 unchanged dependency-invalidated blob identities/hashes. **W3 independently PASS-verified the final ledger**, including 2,848 canonical Git SHA256/EOF objects, 15 preserved historical owner/reviewer/provenance records, 2,810 reused reviews, 1,979 pending unique files and all exact line arithmetic (see `W3-final-independent-qa.json`). **Static review is not a runtime authorization or production-readiness assertion.**

`summary.json`, `current-coverage-ledger.csv`, `current-remaining-files.txt`, `invalidated-dependency-reviewed.json`, and `reusable-published-reviews.json` are the reconciled final RB-003 inputs to C017. C016 historical ledger and record bytes are preserved. C017 MUST review the six source-changed credited paths, ten newly added eligible files, and fifteen dependency-stale unchanged files as mandatory priority within its first 175 unique assigned files. Source freeze SHA/tree above remains mandatory. Zero HTTP/PostgreSQL/browser/Native/runtime tests performed.
