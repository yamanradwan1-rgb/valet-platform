# Issue #300 — G0 freeze verification

**Observation:** PASS at wave-0 candidate inspection, 2026-10-17.

- W7 branch: `codex/issue-300-w7-qa` at base `2f1311575507eae06c6166270e748687762fb508`.
- Manifest: `../issue-300-prime-integration/tmp/issue300-g0/FROZEN_UI_MANIFEST.json`.
- Manifest says 124 protected files, frozen UI commit `0d5d0482559e5576293e341ac7ac02c655267a60`.
- Read-only target: `D:/kndoom/valet-platform/tmp/issue-300-prime-integration`.
- Command from W7 worktree:

```powershell
node scripts/validation/issue300/verify-frozen-ui.mjs "D:/kndoom/valet-platform/tmp/issue-300-prime-integration" "D:/kndoom/valet-platform/tmp/issue-300-prime-integration/tmp/issue300-g0/FROZEN_UI_MANIFEST.json"
```

Observed stdout: `checked 124 protected files`; `PASS: zero protected SHA differences`. Exit code **0**.

This establishes integrity of those 124 files at the inspected instant only.
**It is not a G2/G3 proof**: freeze must be rerun against the exact integrated candidate SHA.
No browsers, credentials, operational database, migration or source files were modified.
