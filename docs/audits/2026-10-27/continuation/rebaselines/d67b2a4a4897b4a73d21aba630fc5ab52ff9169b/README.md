# RB-002 — latest-main source rebaseline (29 October 2026)

## Exact source identities

- Previous C009 source: `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8`.
- Verified fetched `origin/main`: `d67b2a4a4897b4a73d21aba630fc5ab52ff9169b`.
- Current Git tree: `8731302512f8db4edb8bbb1cdc50b208a0dcb5b8`.
- Previously published audit branch: `f0da19dd590e0dc0ef3a934f1e897d1e6d467f86` (C009).

The rebaseline was generated from the current source's Git blobs to avoid Windows checkout line-ending changes. The source checkout was clean. The previous C009 ledger (7,509 tracked paths, 4,711 eligible files, 1,672 credited, 611,038 total eligible lines, 193,240 credited lines) was checked before transformation.

## Deterministic file reconciliation

| Classification | Count |
| --- | ---: |
| Changed tracked paths | 138 |
| Added tracked paths | 75 |
| Modified tracked paths | 63 |
| Removed tracked paths | 0 |
| Renamed tracked paths | 0 |
| Added eligible authored-code files | 68 |
| Added documentation (excluded by the existing eligible-source rule) | 7 |
| Previously reviewed eligible files modified, now stale | 52 |
| Byte-identical previously credited reviews retained | 1,620 |
| Current eligible files | **4,779** |
| Current eligible source lines | **619,108** |
| Current credited reviewed files | **1,620 (33.90%)** |
| Current credited reviewed lines | **187,430 (30.27%)** |
| Current eligible files needing review | **3,159** |

The other eleven modified eligible files had no previous full-review credit. Historical records remain in C009 and prior checkpoints. All 52 changed reviewed paths are in `invalidated-published-reviews.json` and await fresh semantic review; the 68 new eligible files are in `new-source-candidates.json`. No assignment file alone counts as a completed review.

The content-identical prior reviews retain historical credit, but their dependency impact requires targeted examination, especially database connection handling, authorization, photo ingestion, guest settings, Dashboard freshness, and native check-in. Cross-component findings must be reconciled against the new source, including fixes potentially merged since C009. This checkpoint makes no runtime or production-readiness claim.

## Evidence

- `summary.json` — pinned totals, source and tree hashes.
- `git-diff-inventory.json` — 138 source changes with exact paths.
- `current-coverage-ledger.csv` — one row for every current tracked path, with current source status.
- `current-remaining-files.txt` — 3,159 eligible remaining paths.
- `invalidated-published-reviews.json` — stale review metadata and before/after SHA-256.
- `reusable-published-reviews.json` — retained current-source credit for identical content.
- `new-source-candidates.json` — new eligible code and source SHA-256.
- `historical-removed-files.json` — empty; no removed paths.
- `verification.json` — deterministic accounting checks and outstanding limits.

Reproducible generator: `../../tools/rebaseline-source.mjs`. Runtime tests were **NOT_EXECUTED — STATIC_AUDIT_ONLY**. No product source, schema, UI, CI, issues, or deployment were changed.
