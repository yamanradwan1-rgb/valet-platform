# Issue #343 — Route History UI design archive

This folder preserves the **one design-only React + TypeScript prototype** supplied by the project owner on 2026-10-31. The corresponding work item is [VAYLET #343](https://github.com/yamanradwan1-rgb/valet-platform/issues/343).

**Review the finished design:**

- [Task Details — Route History entry](screenshots/route-section.png)
- [Route viewer](screenshots/route-viewer.png)
- [Arabic, dark theme](screenshots/route-arabic-dark.png)
- [Arabic, mobile](screenshots/route-arabic-mobile.png)

The source is in [`src/`](src/); the original development instructions and design notes are in [`README.md`](README.md). `verification.json` records the checks reported by the original local Codex run; these checks have **not** been rerun as part of GitHub archival.

## Reopen locally

This is an **isolated design fixture**, not a standalone production app. It imports real Dashboard components and styles from a local VAYLET repository checkout with its dependencies already installed. It requires Node.js 22+.

From this folder inside a VAYLET checkout, PowerShell:

```powershell
$env:VAYLET_REPO = (Resolve-Path ../..).Path
node preview.mjs
```

Or Bash:

```bash
VAYLET_REPO="$(realpath ../..)" node preview.mjs
```

Then open <http://127.0.0.1:4343/> and select **Tasks → Details → View Route**. `preview.mjs` supports `VAYLET_REPO`; the supplied `check.mjs`, `inspect-ui.mjs`, and `verify-ui.mjs` still contain the original author's Windows-specific repository path, so adjust them locally if rerunning those checks on another machine.

## Explicit boundaries

- The preview uses **synthetic task and GPS data** with an offline coordinate renderer: **no Google Maps API calls or costs**.
- No production Dashboard files, API contracts, authorization, database, or tracking behavior are changed by this archive.
- `.vite/`, `dist/`, and `build.log` were excluded as generated cache/build/log output.
- The latest owner direction was **one UI concept, without Before/After comparisons**.
- **Owner visual approval is still pending.** Uploading the prototype does not approve Phase B implementation, merge, PR, or deployment. Production integration must separately satisfy the authorization and data boundaries documented in Issue #343.

Archive baseline: `main` at `2b1ed12d62a3d68d4b3bafeaf25b6bf53fde1e3f` (2026-10-31). Source files and final screenshots were copied from the submitted ZIP; this archive index is the only added explanatory file.
