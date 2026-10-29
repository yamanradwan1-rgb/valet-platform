# RB-004 — C021 to 9ac3 source/dependency-aware rebaseline

## Pinned evidence and scope

- Historical C021 product source: `0747a677ddf7fc3e1093490b7ef0a7bee9e2d938`, tree `9fbe93fe55b5ef7c42888a874cc7217a594ccace`.
- C021 audit-docs checkpoint published and fetched: `a17033d3a6d09175c602a03c802287c0138c67fd`. Historical C001–C021 credit/evidence files remain untouched.
- RB004 frozen product source: `9ac3c5518b6b7781364e90742589d8f63024f8f6`, tree `df279eba03754d18eaa98b3245b810cb808f82cf`. Clean detached source worktree and independent local read-only GitHub clone.
- Scope is **audit documentation and source-only semantic revalidation**, not product code modifications, tests, deployment, issue changes or runtime exploitation.

## Reconciled current-source ledger

| Metric | Final local RB004 after targeted dependency recheck |
| --- | ---: |
| Tracked Git files | 7,650 (7,595 previously) |
| Git changes | 104 = 55 added + 49 modified; 0 deleted |
| New eligible authored-code files | 54 |
| Existing credited Git blobs changed and invalidated | 40 |
| Unchanged but contract-dependent credited reviews invalidated | **12 / 2,245 lines** |
| Unchanged previously credited reviews preserved | **3,633** |
| Current eligible source files | **4,843** |
| Current eligible source lines | **628,283** |
| Current-source semantic credit | **3,633 / 4,843 (75.02%)** |
| Current-source credited lines | **464,919 / 628,283 (74.00%)** |
| Eligible files needing new complete review | **1,210** |
| Runtime tests executed for RB004 | **0** |

These numbers are local with **independent full-ledger verification PASS**, pending the non-force audit-docs commit/push and post-push fetch verification. Do **not** substitute historical C021 3,685/4,789 for current-source coverage or treat source-only candidates as runtime-confirmed.

## Targeted dependency gate

Source/consumer reviews independently established that the old review evidence for 12 **unchanged** blobs no longer covers the expanded contract. Review history and original SHA remain preserved; only **current-source credit** is revoked. See `targeted-dependency-impacts.json`, `invalidated-dependency-reviewed.json`, and independent `RB004-API-independent-source-qa.json`, `RB004-Dashboard-independent-source-qa.json`, `RB004-Ledger-independent-source-qa.json`.

- **Backend (7)**: Dashboard overview API test with obsolete Supervisor Tasks 404 expectation; overview controller; AppModule Dispatch registration; management audit query/projection/detail projection; live-map facade whose historical C015 review included the now-changed tracker ownership query.
- **Dashboard and Native (5)**: SelectedManagementShell; selected-scope revalidation hook; Supervisor navigation special-scopes test; dashboard navigation composition; Native task-tracking runtime's new owner-snapshot segment interaction.
- **Cleared controls**: Existing location/permission denial cases that remain denied, unrelated management data routes, unchanged generic navigation generation hooks and manager-only behavior. Detailed source reasons in independent reports; a lexical import alone was **not** treated as sufficient evidence.

Potential test-quality source finding `RB004-API-SOURCE-TEST-DRIFT-001`: the old on-shift Supervisor Tasks API test expects 404 although the new approved exact-Shift/Location scoped Tasks list can allow 200. This is a **high-confidence source-only P2 test-drift candidate**, not a recorded failing runtime test or authorization bypass. The added `EMERGENCY_TAKEOVER` audit metadata, custody, Dispatch and tracking contracts require fresh downstream semantic review in C022+. No HTTP/PostgreSQL/Chromium/Native tests executed by this audit.

## Reproducibility and next gate

- `tools/rebaseline-rb004-from-c021.mjs` requires exact prior published ledger, pinned new tree, clean source, unchanged remote baseline, 104 Git deltas, 40 changed-credit revocations and 54 new eligible files. The dependency manifest must have at least two distinct actual independent local source-QA report executors with existing source-pinned PASS JSON evidence, and each invalidated path must appear in the supporting report.
- Raw Git blobs are used for changed/new SHA-256 and EOF. The independent auditor first checked **35 deterministic samples**, then completed a separate **full 7,650/7,650 raw `git cat-file --batch` SHA-256/EOF review**. Every one of 3,645 byte-identical previously credited paths and all 12 dependency-stale identities matched the published C021 ledger; independently recomputed exact 3,633/4,843, 464,919/628,283 lines and 1,210 remaining. See `independent-qa-final.json` (`PASS_FULL_RAW_GIT_LEDGER_ACCOUNTING`). This is independent accounting evidence, not an independent semantic re-review of all 12 paths.
- The 7,650-row ledger, 1,210-path remaining file, changed/added/invalidated/reused manifests are deterministic artifacts for C022. No prior credited file is re-reviewed automatically.
- With final independent ledger QA PASS, perform staged docs-only/diff/JSON/secret validation, fetch latest main and audit refs, publish this RB004 documentation non-force and verify remote HEAD/objects. `tools/assign-c022-from-rb004.mjs` refuses roster creation until RB004 is COMPLETE_TARGETED_VALIDATION and remote-published, then prioritizes changed/new/dependency-stale paths, preserving seven original role owners and transparent fallback/deferment provenance. Publish/verify immutable C022 roster before any semantic C022 reviews.

Do not advertise 100% until current final main-source SHA has zero remaining audited files, independent total-ledger QA and published final security/architecture/runtime-limitations report.
