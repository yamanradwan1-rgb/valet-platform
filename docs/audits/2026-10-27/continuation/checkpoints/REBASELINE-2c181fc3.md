# RB-001 — main source rebaseline

Audited source identity changed from `66968655b8bd90c6681daf53fb9d8da9b9ab9f79` to `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8` after a safe fetch of `origin/main` and creation of an isolated detached worktree. This checkpoint changes coverage accounting only; it does not merge main into the audit branch or rewrite old reviews.

**Current source: 1,297/4,711 fully reviewed files (27.53%), 147,052/611,038 source lines (24.07%), 3,414 files pending.** The nine changed previously reviewed files require complete new-source review; six new authored-code files enter the inventory. Sixteen exact unchanged paths have a targeted dependency-impact revalidation flag.

C008 and C009 remain incomplete: 55/180 saved valid records in each, all 110 byte-identical to the new source, with 125 + 125 still lacking promotable records. No provisional records are credited to the official numerator at RB-001. [Full evidence and limitations](../rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/README.md).

No runtime tests, product changes, database changes, issues, PRs, merge, CI or deploy were performed. The audit is incomplete, and production/pilot readiness is not asserted.
