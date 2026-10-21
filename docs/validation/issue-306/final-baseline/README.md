# #306 final matched baseline — independent Chromium reproduction

**Exact source versions:** detached clean baseline `c883883df721449b5ca8025ab5cad94cfe5f0ff4` under `tmp/issue-306-original-baseline`; pushed #306 `57975551d6a6896f8e3071742f6c4ccaf5f45310` under `tmp/issue-306-reporter`. Both were served by their respective local Next applications, baseline port **3317**, after port **3316**. These were never the unrelated #305 server on port 3003.

**Method:** one identical Playwright test source, `apps/dashboard/e2e/issue306-matched-baseline.spec.ts`, invokes Chromium with a separate isolated browser context for each variant and condition. Both versions receive the same synthetic Incident ID, session ID, type, severity, description, location and timestamp. The before payload omits `reporterDisplayName` because that key did not exist in the strict original API; after adds one bounded long Arabic reporter name. Same initial 1440px render, font readiness (`document.fonts.ready`), language/direction, dark/light, physical viewport, device scale setting, scroll-to-top/bottom and full set of measured old Facts for each paired case. Actual top and bottom PNGs and JSON DOM measurements are in **`before/`** and **`after/`**. Both sides used the same test fixture code; neither source application's CSS or production components were changed.

| Identical case | Baseline original Facts | After Facts | Shared old Fact horizontal change | Shared first 5 rows vertical change | New reporter shifts later rows |
|---|---:|---:|---:|---:|---:|
| AR RTL 320, dark, CSS zoom 200% | 9 | 10 | **0px** | **0px** | +312px |
| EN 320, light, 100% | 9 | 10 | **0px** | **0px** | +92px |
| AR RTL 390, dark, 100% | 9 | 10 | **0px** | **0px** | +60px |
| AR RTL 768, dark, CSS zoom 200% | 9 | 10 | **0px** | **0px** | +120px |
| EN 1440, light, CSS zoom 200% | 9 | 10 | **0px** | **0px** | +120px |
| AR RTL 320, dark, genuine Chrome native 200% | 9 | 10 | **0px** | **0px** | +156px |
| EN 320, light, genuine Chrome native 200% | 9 | 10 | **0px** | **0px** | +172px |

All **seven BEFORE/AFTER pairs passed** Chromium automation. `compare.mjs` independently validates exactly 9→10 Facts, unchanged strings on all nine original Facts, first five original rows at exactly unchanged coordinates, and zero horizontal displacement for **every** original Fact. It writes the source-verified, per-case font, browser metrics, CSS bounds and scrolling comparisons to `comparison.json`. The additional vertical height is the naturally wrapped new reporter row plus grid spacing; rows above remain fixed, rows below all move by the same amount. Drawer rectangle, FactList left edge and Close button left edge are unchanged in every case.

## Genuine native zoom and clipping diagnosis

Native zoom is verified with a local isolated Chromium MV3 extension via official **`chrome.tabs.setZoom(2)` / `chrome.tabs.getZoom() === 2`**, using the proven `issue304-browser-zoom.spec.ts` technique. This is **real browser tab zoom**; it does not use CSS `zoom`, CDP pinch or `visualViewport` page scaling. In both AR320 native cases, the browser's inner CSS width changes **320→160**, DPR **1→2** and `visualViewport.scale` remains **1**. EN320 native shows the same effective zoom.

In the **actual original baseline** at AR320 native 200%, the X/Close button has left **−22.12px**, and the values for Type/Description/State/Severity/Location already start at **−3.46px**. In the #306 after capture, the exact same original values and Close still start at **−3.46px** and **−22.12px**, respectively. At AR320 CSS zoom200, original value left is **−6.92px** both before and after; original Close left is **−44.23px** both before and after. Thus original fields and Close visibly overflow the left viewport **before** #306. The reporter row itself inherits the same clipping at extreme AR320 200%; new content cannot be fully considered accessible at that scale under the existing shared Drawer/Fact layout.

At normal EN320, the original and updated document scroll widths remain **320px**, original Close left remains **266px**, and no original Fact clips left. AR390 normal and AR768 CSS200 shared field/Close left geometry is also unchanged; note CSS zoom200 creates wider document scroll extents (AR768 **1536px**, EN1440 **2880px**) in both versions, so a passing DOM scrollWidth assertion alone does not prove complete accessibility. Browser font families, loaded font entries, body metrics, directions and scroll geometry are recorded on both sides in each case JSON.

**Classification:** zero new horizontal position/overflow regression to any pre-existing Incident Fact or X button. The clipping mechanism is an inherited shared drawer layout problem (especially RTL effective 160px CSS width), and the new reporter inherits that same defect. The added long name increases **vertical content height and need for scrolling** at extreme zoom, as expected. **P0/P1 source/UI regression from #306: none found. Extreme AR320 native/CSS200 visual accessibility acceptance remains NO-GO until the independently scoped shared Drawer reflow is addressed and reverified.** Do not claim the extreme zoom UI is fully usable from test passing alone.

## Reproduce and check source scope

From the #306 W3 worktree after starting the clean baseline Next server at localhost:3317 and W3 Next at localhost:3316, run each source/condition separately (PowerShell):

```powershell
$env:E2E_BASE_URL = 'http://localhost:3317'
$env:ISSUE306_VARIANT = 'before'
$env:ISSUE306_CASE_ONLY = 'ar320-native200-dark'
pnpm --filter @valet/dashboard exec playwright test e2e/issue306-matched-baseline.spec.ts --workers=1

$env:E2E_BASE_URL = 'http://localhost:3316'
$env:ISSUE306_VARIANT = 'after'
pnpm --filter @valet/dashboard exec playwright test e2e/issue306-matched-baseline.spec.ts --workers=1

node docs/validation/issue-306/final-baseline/compare.mjs
```

Other `ISSUE306_CASE_ONLY` values are the seven case IDs in `comparison.json`. The synthetic fixture, viewport, requested locale, theme, scroll position, font readiness and measurement code are identical. Generated browser profiles live in the ignored test-results area and are excluded from the commit. The extension source is in `native-zoom-extension/` for reproduction. Interrupted **initial** and **second** baseline single-case diagnostic images have been retained in separately named folders for transparency and are excluded from `comparison.json`.

Targeted existing incident scope race tests, now using the current `Select location` listbox after `Change scope`, proved stale first-A **success and failure 2/2 PASS** for A→B→A. The focused #306 A→B reporter switch test **1/1 PASS** additionally checks Escape closes the drawer and returns keyboard focus to its original Details opener. No production source/CSS, DB schema or grants were changed in this follow-up. No PR, merge, deployment or issue closure was performed.
