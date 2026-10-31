# Issues #401 and #382 — Native verification ledger (2026-10-31)

Status: local verification and scoped #401 remediation completed; external merge readiness **INCONCLUSIVE** because the complete Native suite is red on both the pinned baseline and the integration commit. Issue #382 remains **DECISION REQUIRED**. This document records synthetic, source-backed observations; neither issue is claimed as a production incident.

## Repository and worktree identity

- Repository: `yamanradwan1-rgb/valet-platform`. Both issues were verified **OPEN** through read-only GitHub REST.
- Reviewed reference and verified `origin/main`: `2b1ed12d62a3d68d4b3bafeaf25b6bf53fde1e3f` (the same SHA).
- Root `main` worktree: `eba55b76916a6892059e45622252b87483f4cb1e`, behind remote; left untouched with its unrelated untracked files.
- Integration worktree: `tmp/cos-native-401-382-prime`, branch `integration/native-401-382-2026-10-31`; reviewed code integration HEAD before this evidence document: `9f78b11e205087ca05314d348994fb5cd323d929`. Clean immediately after tests and restoration of a test-generated comparison file.
- #401 author: W1, `tmp/cos-native-401-w1`, branch `fix/issue-401-gps-fence-reconcile`, final clean source SHA `e663f3972535f1c8a087188fc5d7aae37306fa53`, parent `1243d3c63e36925fc90d2ba74bd0227bd2cde9e1`.
- #382 author: W4, `tmp/cos-native-382-w4`, branch `fix/issue-382-foreground-attention`, final clean **test-only** SHA `235df6528f52c35400d6b3fdbed45ccf95c85d30`, parent pinned `main`.
- Local integration commits: #382 test-only `d2c1b31fc44da012a8e2a3727c64d208393ecc11`, then #401 source/test cherry-picks `deb07e6b`, `08c2d865`, `c8b6f660`, `3d890033`, `9f78b11e`. No push, PR, merge to `main`, issue closure, deployment or release.

## Ownership and independent review

| Role | Scope | Frozen SHA and result |
| --- | --- | --- |
| Prime | Baseline, policy gates, read-only validation, isolated integration and evidence | Integration code HEAD `9f78b11e`; exact final acceptance pending W7 |
| W1 | Sole #401 code/test author | `e663f397...`, clean; red-before/green-after and static gates |
| W2 | Independent #401 source/behavior reviewer | `e663f397...` — no P0/P1/P2; nonblocking P3 completed-key Set growth |
| W3 | Independent #401 test/race reviewer | `e663f397...` — no P0/P1/P2; nonblocking P3 completed-key Set growth |
| W4 | Sole #382 test author; production cap blocked by policy | `235df652...`, clean; no production source change |
| W5 | Independent #382 reviewer | `235df652...` — no newly introduced P0/P1/P2/P3 in test-only diff |
| W6 | Cross-issue tenant, identity, privacy and DEC reviewer | #401 `e663f397...`, #382 `235df652...` — no final P0/P1/P2; GPS local Set P3 |
| W7 | Final acceptance and integration reviewer | To inspect the exact final integration SHA and this evidence document read-only |

Earlier W1 candidate SHAs `881a65b8`, `a52d0d2`, `59e15288` and `1243d3c` were independently BLOCKED because subsequent reviewers found reproducible terminal/identity races. They were never integrated alone as approved final code. Their follow-up corrections are included in the cumulatively reviewed final `e663f397`.

## Issue #401 — Native GPS tracking may wait an extra queue snapshot

**Finding: CONFIRMED** by deterministic synthetic Native runtime tests. Phase-A readiness was **READY TO IMPLEMENT**. The original `resolveFence` control flow retired A and returned false when new eligible B was available on the first genuinely successful authoritative snapshot N+1. Reproduction separately exercised network, completion, and simultaneous fences: 4/4 initial tests red (EXIT 1). A separate realistic operational-session preterminal GET test showed PARKED/READY stale-A rearm: 2/2 red (EXIT 1).

Adversarial review uncovered further task-scoped stop races and W1 reproduced them **before** their corresponding source corrections:

- Late terminal A after new B and same-scope context/auth transitions: 4/4 late-terminal and 4/4 context tests red on the first candidate SHA.
- Direct canonical PARKED/READY without local `submitting`: 4 red / 2 already-green controls on the second candidate SHA.
- Queue failure clears `taskTracking`, then direct terminal A precedes a stale successful A GET: 2 red / 8 green controls on `1243d3c` with new regression tests (EXIT 1).
- Definitive GPS upload 409 with a real `EmployeeOperationalSession` and an already-in-flight preterminal GET: 2/2 red on the previously unmodified callback (EXIT 1); ordinary refresh coalesced old GET rather than starting a new one.

The final correction in `apps/valet-native/src/tracking/` changes only runtime/fence/completion reconciliation. It lets B start during the first fresh successful eligible queue reconciliation; retains exact binding, terminal and completed-key barriers; matches authoritative terminal identity generation, organization, membership, location, shift, task and session; stops A at canonical PARKED/READY; protects B from late A; and cancels a preterminal GET on definitive GPS upload failure using a keyed network fence and `refreshQueue(true)`. The last successful authorized binding is retained **only for terminal matching**, never as new GPS admission authority. Existing publisher generation/cancellation/abort guards, backend GPS authority, and tracking policy are unchanged.

Counterevidence and limits: the backend already rejects GPS ingestion for terminal/mismatched tasks, so local watcher rearm does not prove server-side persistence or production GPS loss. No real-device or live-provider validation was performed. Completed-key Set growth remains a nonblocking P3 RAM-only observation over a long authenticated shift; arbitrary pruning could reopen stale-A tracking and was not added.

## Issue #382 — Undismissed native foreground attention grows without bound

**Finding: CONFIRMED** by valid, privacy-safe synthetic Native push payloads. Retained distinct foreground IDs and published snapshots were 1 after 1 event, 64 after 64, 65 after 65, and 1,000 after 1,000. There were 1,000 array publications containing a total of 500,500 copied ID references. Duplicate rejection, dismissal, malformed kinds, background/foreground state, identity generation, logout and identity purge were exercised. This demonstrates deterministic growth/copy cost, **not measured device exhaustion**.

The only #382 integrated change is the 137-line `native-push-foreground-attention-volume.test.ts` regression/characterization module. The production foreground Set remains unbounded pending U-382-001. Existing server/provider send TTL 300 seconds is **not** an accepted client display expiry.

**Owner decision request U-382-001:** Accept or replace the proposed policy: at most 64 latest distinct undismissed foreground IDs, oldest insertion evicted on overflow, no local TTL, current background/foreground and explicit dismissal/identity-purge semantics, canonical Task Queue refetch as authority. Specify whether a previously evicted ID may appear again as new attention if replayed; the simple bounded Set permits that replay. No cap, expiry, second dedupe store, UI policy or server change has been implemented without acceptance.

## Commands and measured exit codes

| Gate | Exact command or scope | Result |
| --- | --- | --- |
| Offline installation | `corepack pnpm install --offline --frozen-lockfile` | EXIT 0; cached 1,043 packages, zero network downloads |
| Pinned-main focused Native baseline | Existing five tracking/push test files | EXIT 0, 50/50 PASS |
| Pinned-main complete Native baseline | `corepack pnpm --filter @valet/valet-native test` | EXIT 1; 248/250 files and 1,814/1,817 tests PASS |
| Final #401 immutable author SHA | `corepack pnpm --filter @valet/valet-native exec vitest run test/native-task-tracking-definitive-refresh.test.ts test/native-task-tracking-fence-reconcile.test.ts test/native-task-tracking-network-background.test.ts test/native-task-tracking-terminal-stale-queue.test.ts test/native-task-tracking-context-fence.test.ts test/native-task-tracking-late-terminal.test.ts test/native-task-tracking-server-terminal.test.ts test/native-task-tracking-runtime.test.ts test/native-task-gps-publisher.test.ts` | EXIT 0, 9/9 files, 53/53 tests PASS; Prime independently repeated |
| Final integrated #401 + #382 focused Native | Above nine files plus `test/native-push-foreground-attention-volume.test.ts test/native-push-lifecycle.test.ts test/native-push-purge-race.test.ts test/native-retrieval-attention.test.tsx` | EXIT 0, 13/13 files, 88/88 tests PASS |
| Native typecheck | `corepack pnpm --filter @valet/valet-native typecheck` | EXIT 0 |
| Native lint | `corepack pnpm --filter @valet/valet-native lint` | EXIT 0 |
| Architecture | `corepack pnpm architecture:check` | EXIT 0, only pre-existing grandfathered oversized-file warnings |
| Prettier | `corepack pnpm exec prettier --check` on all 11 changed source/test files | EXIT 0 after normalizing Windows checkout CRLF to LF; Git index/content unchanged |
| Diff | `git diff --check 2b1ed12d62a3d68d4b3bafeaf25b6bf53fde1e3f HEAD` | EXIT 0 |
| Integrated complete Native | `corepack pnpm --filter @valet/valet-native test` | EXIT 1; 256/258 files and 1,852/1,855 tests PASS |

Both baseline and integrated complete-suite runs fail exactly these three tests: `native-appearance-render-matrix.test.ts:280` for EN and AR Release render mismatch (`Identity verified` vs `Release blocked`), and `native-shift-recovery-freeze.test.ts:115` for a 5-second timeout. These are outside the changed 11 Native tracking/attention test files. The suite-generated diff in `docs/validation/issue-345/render-comparison.json` was inspected and restored **only** to the original HEAD content; no user work was discarded.

## Final boundaries and readiness

The entire integrated source/test delta is 11 Native files: three GPS runtime/helper files, seven focused GPS test files, and one #382 test-only file. Largest authored changed production file: tracking runtime 291 physical lines; fences 171, completion 50; all authored changed tests at most 290 lines. No UI/EN-AR/RTL change, product-policy change, push protocol/registration change, new API, database/migration, auth contract, dependency/lockfile, or infrastructure change. Task-scoped GPS, exact identity/tenant/location/shift checks, push as non-authoritative attention, logout/identity purge and UI Freeze remain intact in the independently reviewed code.

- **#401:** `CONFIRMED`; phase-A `READY TO IMPLEMENT`; scoped implementation and reviews passed, but complete Native/CI merge readiness remains **INCONCLUSIVE** until the three pre-existing full-suite failures are resolved or separately qualified through the repository's normal approved CI process. No claim of production runtime validation.
- **#382:** `CONFIRMED`; **DECISION REQUIRED** for U-382-001 before any behavior-changing production cap/expiry/eviction and independent re-review. Test-only evidence is locally integrated; issue implementation and closure are not ready.
- No GitHub write, push, PR, merge to `main`, deployment, release or issue closure was performed. Local integration commits remain available for Owner review after the outstanding gates.
