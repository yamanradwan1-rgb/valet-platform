# VAYLET Route History · one design concept

Isolated React + TypeScript design prototype for Issue #343. No production files changed. The latest Owner request overrides the issue's older requests for two options and Before/After comparisons: this deliverable contains one concept and finished-state previews only.

## Open

From PowerShell:

```powershell
Set-Location 'C:\Users\Administrator\.codex\visualizations\2026\10\31\01a18f47-f217-71f0-a7a4-5e0cc26d3feb\route-history'
node preview.mjs
```

Open **http://127.0.0.1:4343/**. In Tasks, use the existing three-dot Details action on the first completed Parking or Retrieval row, then **View Route**. The third row is an active Task. Open **Prototype controls** in the section or viewer to select synthetic edge cases, language and theme. These disclosure controls belong only to the review environment.

Requires the existing repository and its installed dependencies at `D:\kndoom\valet-platform` (Node 22+). No dependency install, credentials or paid map service is needed. Stop the preview with Ctrl+C. Run `node check.mjs` for TypeScript, `node preview.mjs build` for the isolated bundle, and `node verify-ui.mjs` for the visible Chromium interaction checks.

## Design

The real Dashboard Shell, navigation registrations, header preferences, Tasks page, table, Task Details drawer, Fact rows, status badges, Operations buttons, Lucide icons, locale/theme providers and CSS are imported directly from the current source. The original drawer remains `min(28rem,100%)`. The isolated Vite adapter inserts just the new section after its existing FactList **in memory**, with a guarded insertion point. It never writes to the imported Dashboard files. Two small Next adapters retain the existing anchor/image markup and original logo assets without requiring a Next runtime. Navigation/scope selectors are visual context in this single-feature preview; they do not open other applications or change scope.

The viewer uses the Dashboard FocusDialog, with feature-scoped sizing, a sticky Close action, Escape, visible-control Tab wrapping, focus return, a lazily loaded route module, sample timestamps, direct marker selection, keyboard/touch sample slider, previous/next, zoom, pan and fit. Only the new Route History CSS module is authored. No existing CSS, tokens, JSX, navigation, page/table geometry, API, permissions or database files are edited.

This is an **offline coordinate map**, consistent with the existing operational map's coordinate fallback. It is not a street basemap or verified Google Maps integration. Every GPS sample and Task is synthetic. Start A and End B, direction chevrons and sequential straight segments show only fixture observations; they make no claim about travel between samples. Declared recording interruptions remain separate segments. Geographic orientation remains fixed in Arabic. No Directions, Roads, Places, Geocoding or other remote requests are used. There are no distance, speed or ETA claims.

## States

Completed Parking and Retrieval, no points, one point, loading, neutral unavailable, simulated provider failure with safe Retry, privacy-safe denied, active Task, 2,000 samples, partial/disconnected, sparse, noisy and short recordings. Task selection resets feature state. Scenario changes immediately remove prior map content while loading; cleanup cancels stale local reads. Dense routes retain all polyline coordinates and bound interactive map markers to 30; the slider inspects every sample.

## Integration boundary

This is ready for **Owner design review**, not production integration. DEC-045/049 and current source preserve ended-tracker-only raw reads and exact Location Manager / eligible Supervisor authority. The local fixture context represents a Location Manager; it does not validate or grant production permissions. Denied displays contain no coordinate/count/timing disclosure.

Future integration must separately resolve the exact Task → ended tracking-session discovery contract and authorize both discovery and every route-history page. The existing endpoint is `GET /v1/staff/tracking-sessions/:trackingSessionId/route-history`; its strict cursor query defaults to 100 samples and allows at most 500 per page. The prototype's 2,000-point fixture is a local rendering exercise, not proof of production pagination. Its `segment` fixture property is demo-only; actual gap provenance must be defined before production can label interruptions. Retention-expired or tracking-disabled reasons must only be shown when proven; the prototype uses a neutral unavailable state. Existing Google SDK ownership/camera/theme/teardown conventions were inspected; adapting historical polylines to that production adapter remains outside this design task.

## Files created

All authored files are inside this folder:

```text
README.md
package.json
index.html
tsconfig.json
preview.mjs
check.mjs
inspect-ui.mjs
verify-ui.mjs
src/main.tsx
src/next-adapters.tsx
src/task-fixtures.ts
src/route-copy.ts
src/route-fixtures.ts
src/demo-controls.tsx
src/route-section.tsx
src/route-viewer.tsx
src/route-state.tsx
src/route-map.tsx
src/sample-inspector.tsx
src/route-history.module.css
src/style-modules.d.ts
```

Final preview/check artifacts: `screenshots/route-section.png`, `screenshots/route-viewer.png`, `screenshots/route-arabic-dark.png`, `screenshots/route-arabic-mobile.png`, `verification.json`, and `build.log`. `.vite/` and `dist/` are generated cache/build output, including copied existing public assets. No commit, push, PR, merge or deployment.

Verification covers functional states, both locales/themes and widths 320/390/768/1440, focus, closing, read-only retry, no external requests and 200% content-zoom emulation. The zoom check is CSS magnification, not a claim of native browser-chrome zoom or screen-reader certification. Finished-state screenshots are previews, not Before/After or visual-difference reports.
