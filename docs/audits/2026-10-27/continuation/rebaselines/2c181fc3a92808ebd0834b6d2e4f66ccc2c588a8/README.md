# VAYLET exhaustive audit — current-main rebaseline (RB-001)

Status: deterministic source/coverage reconciliation complete; feature-level interaction validation and the 100% audit remain incomplete.

| Identity | Immutable SHA |
|---|---|
| Historical frozen source | `66968655b8bd90c6681daf53fb9d8da9b9ab9f79` |
| New source from fetched `origin/main` | `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8` |
| Last published pre-rebaseline docs checkpoint | `7addcf163b6338d794898b6739ab6c1f90af14d0` |

The prior source is an ancestor of the new source (three commits). A separate detached Git worktree was created for the new source. The owner's main checkout, historical detached worktree and unrelated worktrees were not switched, cleaned, reset or overwritten.

## Exact inventory and coverage

| Metric | Historical C007 | Current main RB-001 |
|---|---:|---:|
| Tracked files | 7,502 | 7,509 |
| Eligible authored-code candidates | 4,705 | 4,711 |
| Candidate source lines | 610,400 | 611,038 |
| Published-review files reusable at this source | 1,306 historical | 1,297 |
| Published-review source lines reusable | 147,993 historical | 147,052 |
| Source files pending current-source credit | 3,399 historical | 3,414 |
| File coverage | 27.76% historical | 27.53% |
| Line coverage | 24.25% historical | 24.07% |

Between the source commits: **16 changed paths** = nine modified authored-code candidates, six added authored-code candidates, one added non-code documentation file, zero deletions and zero renames. All nine modified files had previously been credited, so their historical reviews are preserved but new-version credit is withheld. The 1,297 reusable previously published source reviews are byte-identical; where an old review carried SHA-256, the original evidence hash was checked against the historical checkout. Byte-identical source does **not** independently prove unchanged runtime behavior.

Source inventory: [complete diff](git-diff-inventory.json), [current ledger](current-coverage-ledger.csv), [remaining paths](current-remaining-files.txt), [reused reviews](reusable-published-reviews.json), [stale reviews](invalidated-published-reviews.json), [new candidates](new-source-candidates.json), [removed historical paths](historical-removed-files.json), [baseline input hashes](input-file-hashes.json).

## C008 / C009 recovery

Saved records were independently checked against the historical source and the new source:

| Planned batch | Saved semantic records | Byte-identical on new main | Assigned paths still without records |
|---|---:|---:|---:|
| C008 | 55 (Dashboard 35, Prime 20) | 55 | 125 |
| C009 | 55 (Native 35, Prime 20) | 55 | 125 |

All 110 saved records are nonoverlapping, have the expected owner/batch/source SHA, recorded full read ranges, and remain byte-identical under the new source. The C008 and C009 rosters each contain 180 disjoint paths; neither overlaps C007 or the other batch, and none intersects the 16 changed main paths. Independent Recovery QA confirmed these identities and the exact pending sets.

For conservative checkpoint accounting, the **110 provisional records are not yet included in the 1,297 published-review numerator**. The complete sanitized [provisional evidence](recovered-provisional-evidence.json) is preserved; the original ignored temporary JSON rosters/results remain untouched. Promote each batch only after its pending work, ownership transfers, semantic QA and final checkpoint gates are complete.

## Changed dependencies and regression work

[Targeted impact map](targeted-dependency-impacts.json) identifies 16 unchanged consumers or review fixtures requiring interaction revalidation. See [impact assessment](cross-feature-impact.md). This preserves source-review credit while explicitly withholding behavioral revalidation claims.

Previously reported findings retain their historical disposition, including the provisional P2 `C009-NATIVE-001` and the unconfirmed employee parking-start race hypothesis. No new vulnerability, performance gain, production suitability, or passing test is claimed by this rebaseline. Historical issues #352–#363 were not edited.

## Execution and publication limits

- No runtime, integration, browser, database, build, CI or provider test executed during RB-001. Hash, range, set-intersection, file-identity and ledger checks are source-only verification.
- No application, UI, database schema/data, runtime configuration, external service, issue, PR, merge or production deployment changed.
- The two initial new COS worker chats failed to open a usable composer; a separate Recovery QA worker completed its read-only check. Worker restart/replacement status must be verified in later checkpoints rather than inferred from invitations.
- Subsequent assignments must use exactly the uncredited current-ledger paths and honor existing C008/C009 reservations before opening a global new batch.
- Baseline drift after `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8` requires an explicit later reconciliation; do not silently mix revisions.

Generated artifacts are tied to a SHA-checked historical ledger and both detached checkouts. Every future current-main review must name `2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8` and the exact file SHA-256. The historical C001–C007 checkpoints and original `docs/audits/2026-10-27/coverage-ledger.csv` have not been rewritten.
