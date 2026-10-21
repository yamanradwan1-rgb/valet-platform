# Issue #305 — Dashboard column alignment verification

**Base:** `origin/main` at `c883883df721449b5ca8025ab5cad94cfe5f0ff4`.
**Scope:** The existing four reported Management Dashboard tables (Live Operations, Vehicles, Tasks, Incidents), plus their two shared operational-table stylesheets. No backend, API, data, authorization, or database changes.

## Proven root cause and correction

Chromium's user-agent stylesheet gives `th` a centered text alignment even though the parent `table` is `text-align: start`; `td` content inherits logical `start`. The header cell and body cell boxes were already aligned, so changing their widths or padding would have changed the frozen layout unnecessarily.

Two narrow CSS selectors now give *non-last* operational-table headers `text-align: start`:

- `apps/dashboard/src/features/operations/operations.module.css`
- `apps/dashboard/src/features/operations/reference-list.module.css`

All existing consumers of these styles have their last column labeled Actions; that column keeps the pre-existing `text-align: end`. The shared first stylesheet also covers Keys & Spots and Live Retrieval Queue; the second covers Vehicles and Tasks. An independent reviewer should still confirm shared path rendering on representative data when verifying release.

## Actual Chromium evidence

The `issue305-table-alignment.spec.ts` browser suite captured **32 BEFORE + 32 AFTER DOM samples per reported page**: English/Arabic, light/dark, widths 320/390/768/1440 px, and 100%/200% **CSS zoom**. The synthetic fixture includes real rendered rows for each table, using the current `/overview/live-sessions` route for Live Operations. All four tests passed both before (recording diagnostics) and after (asserting alignment).

| Table | Cases before/after | Max header-content displacement before (all views) | Max after | Table/header/row box mismatches |
| --- | ---: | ---: | ---: | ---: |
| Live Operations | 32 / 32 | 156.266 px | 0.138 px | 0 |
| Vehicles | 32 / 32 | 211.891 px | 0.175 px | 0 |
| Tasks | 32 / 32 | 162.313 px | 0.174 px | 0 |
| Incidents | 32 / 32 | 275.328 px | 0.133 px | 0 |

These maxima include 200% CSS zoom; offsets were measured at the actual text range, not inferred from equal `th` and `td` bounding boxes. The Actions headers stayed `end` throughout. Evidence: `before/*-geometry.json`, `after/*-geometry.json`, `pixel-geometry-comparison.json`.

## Image parity and the frozen UI

Independent `before/*.png` and `after/*.png` capture the two actual source versions in a Next.js development server. An unrequested transient Next dev `Compiling…` widget was present during some independent Vehicles captures and some full-page RTL CSS-zoom screens had different overflow screenshot origins. Those independent screenshot differences are explicitly recorded as diagnostics in `pixel-geometry-comparison.json`; they are **not** silently counted as an application UI change or as pixel-perfect independent proof.

To remove dev-frame timing as a variable, `issue305-controlled-parity.spec.ts` repeats all four tables in the **same rendered Chromium session** at EN/dark/1440, AR/dark/390, and AR/light/320 with CSS zoom 200%. It temporarily emulates the original centered `th` behavior using a scoped style, captures `controlled-before`, removes that style, and captures `controlled-after`; the Next.js development portal is hidden in both frames. All **12 controlled screenshot pairs** contain **zero differing pixels outside the header cells** (or, where RTL/overflow applies, the same header y-band). All 12 compare results are `PASS`, and all independently captured DOM boxes match. This controlled visual proof is supplemental to the independent source-version geometry and screenshots.

**Caveat:** 200% was achieved through CSS `zoom` in Chromium, not browser-native zoom. Native browser zoom verification is **NOT RUN**. Empty/error/loading states, action keyboard focus, and additional shared pages have existing route tests, but this focused screenshot suite does not re-run every state or action interaction and makes no claim that it does.

## Commands and artifacts

```powershell
$env:E2E_BASE_URL = 'http://localhost:3003'
$env:ISSUE305_PHASE = 'before'
pnpm --dir apps/dashboard exec playwright test e2e/issue305-table-alignment.spec.ts --workers=1
Remove-Item Env:ISSUE305_PHASE
pnpm --dir apps/dashboard exec playwright test e2e/issue305-table-alignment.spec.ts --workers=1
pnpm --dir apps/dashboard exec playwright test e2e/issue305-controlled-parity.spec.ts --workers=1
python docs/validation/issue-305/compare.py
```

The DOM suite passed 4/4 after correction; controlled screenshot suite passed 4/4 and Python report returned `pass: true`. The image pairs and JSON evidence are in this directory. Both tests use mocked Dashboard responses and perform no real API/DB writes.
