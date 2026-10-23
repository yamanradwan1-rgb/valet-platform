# Issue #324 — Semgrep parser coverage disposition (W13)

**Review date:** 2026-10-24 (Asia/Amman)

**Status:** **OPEN — confirmed historical partial-parse coverage gap; no new vulnerability confirmed.**
This is an evidence disposition, not a clean current-source scan or release approval.

## Immutable historical evidence

- GitHub Actions [Manual Security Audit run 39885805640](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/39885805640), static job 120193579690, at commit `c12500a816e588edac9059d3aa559f9039f8535f`.
- Artifact `static-security-39885805640`, artifact ID `12473075148`, GitHub-reported archive SHA-256 `e8e038813819cccfd0172c46102d221baf15a4a9c1ced2dc8408961361dba017`.
- The original `semgrep.json` reports Semgrep `1.182.1`, **1 finding**, **9 error entries**, all of type `PartialParsing`. Its `paths.scanned` list contains **3,652 paths**, including each of the 9 error-bearing files. The report has no `paths.skipped` property, so a zero skipped-file count is **not established**.
- Each error is a warning about parsing source; being included in `paths.scanned` does not prove complete parsing or rule evaluation for that file.
- The one MFA static finding is separately classified by `MASTER_DISPOSITION.md`; a parser warning does not itself establish a security defect.

## Exact nine parser failures from the archived JSON

| Source file | Error span line(s) | Scope and observed syntax |
| --- | --- | --- |
| `apps/api/src/modules/shifts/shift-presence-attempt.ts` | 98 | Production Shift presence logic; parser rejected comma in an argument to `transaction.query<import(...).PresenceOperationRow>(...)` |
| `apps/dashboard/src/features/administration/physical-resources/issue304-action-reopen.test.tsx` | 14 | Dashboard test; `importOriginal<typeof import("react")>()` |
| `apps/valet/src/components/employee-app.start-shift.test.tsx` | 112, 135, 150 | Employee tests; three generic `importOriginal<typeof import(...)>()` spans |
| `apps/valet/src/components/end-shift-recovery.test.tsx` | 20, 43, 58 | Employee test; three generic `importOriginal<typeof import(...)>()` spans |
| `apps/valet/src/components/screens/guest-access/guest-access-flow-actions.test.tsx` | 18 | Guest-flow test; generic `importOriginal<typeof import(...)>()` |
| `apps/valet/src/components/screens/incident-flow.live.test.tsx` | 6 | Incident-flow test; generic `importOriginal<typeof import("react")>()` |
| `apps/valet/src/components/screens/parking-flow.key-return.test.tsx` | 21 | Parking-flow test; generic `importOriginal<typeof import(...)>()` |
| `apps/valet/src/components/screens/parking-flow.live-scanner.test.tsx` | 12 | Scanner-flow test; generic `importOriginal<typeof import(...)>()` |
| `apps/valet/src/components/screens/vehicles-list-live.test.tsx` | 13 | Vehicle directory test; generic `importOriginal<typeof import(...)>()` |

There is **one runtime source file and eight test files**. The current candidate source at `b8fcf4d59df22c264e4a85a5e4b1f2dacdf34f8b` retains the relevant TypeScript syntax. It is likely the Semgrep parser has difficulty with these valid TypeScript generic/dynamic-import forms, but the exact parser cause and a working replacement version have **not** been reproduced. No affected source was rewritten to satisfy a scanner warning.

## Quality gate and bounded verification

`scripts/security/summarize_audit.py` already rejects nonempty Semgrep `errors`, missing `errors`, and missing/malformed `results`. This worker adds a narrow fail-closed check that `paths.scanned` exists as a nonempty list of nonblank path strings. The output reports the number of declared scanned paths and explicitly states that zero parse errors is necessary but **insufficient** to prove full source coverage. Synthetic `{"results":[],"errors":[]}` without scanned-path metadata must no longer pass.

- `python -m unittest scripts/security/test_summarize_audit.py -v`: **PASS 6/6** on the isolated W13 candidate; covers parse error, missing error/result metadata, invalid results, and absent/empty/malformed scanned-path metadata.
- `git diff --check`: **PASS**.
- **Semgrep CLI not present** in the current Windows environment; no install, new Semgrep run, DAST, or production scan was performed. Historical artifact inspection is **not** a current scan.
- Existing CI Semgrep rule profiles and explicit path/exclusion arguments were left unchanged. Excluding `*.test.tsx` would suppress eight warnings by reducing coverage and does not repair the production Shift parsing failure.

## Remaining acceptance proof

1. In a bounded, approved environment with Semgrep available, run the same configured profiles against the **exact final candidate SHA** and record the tool version, exit status, JSON artifact ID, `results`, `errors`, `paths.scanned`, and explicit exclusions. Evaluate whether a newer parser resolves these exact generic/dynamic-import forms.
2. Require no `PartialParsing` or other `errors`, verify that the Shift presence production file is included and fully parsed, and review all intentionally excluded or skipped relevant files. A scanner-reported `paths.scanned` count alone is not complete coverage proof.
3. If parser errors persist, retain the fail-closed gate and obtain a reviewed, path-specific coverage disposition; do not turn the Semgrep job green by ignoring error metadata or excluding production source.

**Decision:** **Scanner coverage still OPEN for #324.** The current summary guard prevents an empty or partial parsing result from being mistaken for a clean scan, but the nine historical parser errors have not been resolved on the final source SHA.
