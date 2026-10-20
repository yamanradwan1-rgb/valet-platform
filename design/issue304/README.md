# VAYLET Keys & Spots — Issue #304 design exploration

**Design-only. Not an implemented product feature. No live data, backend calls, saved changes or deployment. Owner selection is required before any product change.**

Four independently openable concept pages are generated from exactly one frozen VAYLET Dashboard shell and the same canonical, explicitly fictional data:

| HTML preview | Distinct interior concept |
| --- | --- |
| option-1.html | A — Unified Operations Table |
| option-2.html | B — Resource Overview + Actionable Tables |
| option-3.html | C — Master / Detail Resource Workspace |
| option-4.html | D — Grouped Resource Workspace |

## Preview

Open any generated option-N.html file directly in a browser. No server, login, network or VAYLET API is required. Use the preview's language and theme controls, the location selector (two fictional Locations), and the inner resource actions. QR and creation actions are **demonstrations only**; print/download never persist or act on a real resource. Use the browser device toolbar to try widths 320, 390, 768 and 1440.

From the isolated design worktree run:

    node design/issue304/build.mjs

The script injects the same shell template, exact snapshot styling/assets, the canonical fixture and each concept's distinct interior CSS/HTML/JS into the four standalone HTML files. The four final files require no external CSS, JavaScript, images or fonts. Contributors edit the design-only source fragments under concepts/ and do not independently modify the shell in finished outputs.

## Source lineage and caveats

- Shell reference: current apps/dashboard/src/styles/{foundation,shell,shell-controls}.css, apps/dashboard/src/app/globals.css, actual logo assets, Dashboard navigation registry and controls, all **read-only**. This is a static reconstruction for comparison, not a reused authenticated production runtime.
- Resource reference: current Keys Operational view and Physical Resources panel. Currently these are separate projections; their combined unified Key Slot information and proposed human-friendly Key Slot label are **design proposals**, not claims that one API already exposes them.
- Canonical fixture: fixtures/canonical-data.json and fixtures/CONTRACT.md. All license plates have DEMO prefixes and every organization/location/vehicle/staff/time is fictional. No credentials or real customer identifiers.
- QA evidence and limitations are recorded in evidence/. Screenshots are generated using an actual local browser only if browser tests complete; files are never marked visually verified just because they exist.

### Frozen-shell mobile constraint

The inherited, source-faithful Dashboard shell has a **known narrow-width overlap risk at 320–390px**: its 4rem fixed header permits location and header-action groups to wrap, sending Sign out below the topbar height. This was observed in real Edge screenshots of the design previews and traced to unchanged production shell.css and topbar.tsx; see evidence/shell-parity.md and evidence/interaction-qa.md. **The shell was not modified or cosmetically patched to conceal this**, because Issue #304 forbids all shell changes. It is an Owner acceptance blocker, not evidence that the four interior concepts should share a new shell design. No authenticated production pixel-diff reference was available.

## Owner decision gate

Review COMPARISON.md and all four candidates. Choose option 1, 2, 3 or 4, or request targeted interior revisions. The real Dashboard shell, routes, API, database and state transitions are unchanged. Issue #304 remains open and no subsequent React implementation is authorized.
