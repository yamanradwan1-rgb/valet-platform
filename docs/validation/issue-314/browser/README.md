# Issue #314 — W5 independent Chromium Incidents drawer acceptance

**Source-under-test:** BEFORE `origin/main` `9abbbd2cf6ea062beabdcd06d8323ede474384dc`, isolated W5 worktree (`test/issue-314-browser-qa`), served at `http://localhost:3384`; AFTER W4 production change `e34d9a1ca88a47d150da64b1d8beb6e07b81b7b7`, isolated `tmp/issue-314-prime`, served at `http://localhost:3385`. W4 later added a test-only commit; production source remained the above SHA. Neither app source nor the shared drawer CSS was changed by W5. No shared database/CI/API was used.

**Method:** exactly the same independent W5 Playwright harness `apps/dashboard/e2e/issue314-independent-acceptance.spec.ts` and synthetic fixture across both source versions, `chromium` headless MV3 extension, one Chromium instance at a time and one case per invocation to avoid state carryover. The fixture provides **10 actual Incident Facts**, complete long Arabic reporter name, long bilingual description, UUID incident/session IDs, a technical type code, plus a second Incident with `reporterDisplayName:null`. No real customer/employee identities. The test captures top/bottom drawer PNG and real DOM/CSS rectangles and full text, and checks Help keyboard/pointer opening, initial Close focus, Tab→Help, Shift+Tab→Close, Escape, restored opener focus, Close pointer click when geometrically available, scroll-to-bottom, and the localized missing-reporter fallback. Only the drawer's `FactList` is measured and it is **fail-closed** if the real dialog, header/body or exactly 10 nonempty Facts cannot be located.

**Genuine Chrome tab zoom:** local extension `native-zoom-extension/manifest.json` grants `tabs` and uses `chrome.tabs.setZoom(tabId,2)` followed by `chrome.tabs.getZoom(tabId) === 2`; it resets to 1 between cases. At physical Chromium viewport 320, the resulting CSS `innerWidth` is **160** and `devicePixelRatio` **2**, with `visualViewport.scale` **1** and HTML computed CSS zoom **1**. At physical 390, CSS `innerWidth` is **195**. This is **native browser zoom**, not a mobile device, viewport-only resize, CSS `zoom`, or CDP pinch. CSS `document.documentElement.style.zoom='2'` is independently captured and **never counted as a native zoom pass**.

## Paired results

| Physical viewport, locale/theme, zoom | BEFORE | AFTER | Result |
|---|---|---|---|
| 320 AR RTL dark, native Chrome 200% | Help/Close clipped; fact values clipped; internal X overflow | Both buttons and all 10 values inside width, no internal X overflow | **PASS — repaired** |
| 320 EN light, native Chrome 200% | Same clipping/X overflow | Both buttons and all values inside width, no internal X overflow | **PASS — repaired** |
| 390 AR RTL light, native Chrome 200% | No measured horizontal clipping | No measured horizontal clipping, reflow height reduced | **PASS — preserved** |
| 320 AR RTL dark, **CSS style.zoom=2** | Clip/X overflow | Clip/X overflow, unchanged | **DIAGNOSTIC NO-GO (not browser-native)** |
| 320 AR RTL light, normal 100% | All values/buttons within viewport | Identical original layout | **PASS — 0 changed PNG pixels** |
| 390 EN dark, normal 100% | All values/buttons within viewport | Identical original layout | **PASS — 0 changed PNG pixels** |
| 768 AR RTL dark, normal 100% | Within viewport | Identical original layout | **PASS — 0 changed PNG pixels** |
| 1440 EN light, normal 100% | Within viewport | Identical original layout | **PASS — 0 changed PNG pixels** |
| 1440 EN light, native Chrome 200% (effective 720) | Within viewport | Identical original layout | **PASS — 0 changed PNG pixels** |

All **18 of 18 isolated one-case Playwright invocations completed PASS** against their pinned servers. The separate `compare.mjs` checks nine matched JSON pairs: **8 PASS, 0 FAIL, 0 NOT RUN, 1 CSS-only DIAGNOSTIC_NO_GO**. Its unchanged-width PNG comparisons decode the pixels with Sharp, compare raw RGBA at tolerance 8/channel, and report **0 changed pixels across both top and bottom screenshots for all five unaffected conditions (10 pairs)**. Geometry positions of all old Facts and Help/Close buttons at unaffected widths match within 0.75 CSS pixel. This is stronger than merely comparing file hashes. Each pair's file SHA-256, measured DOM fields, flags and screenshots are indexed in `comparison.json`; screenshots live under `before/` and `after/`.

The two repaired 320 native cases verify native zoom factor **2**, all 10 values inside the CSS viewport, no drawer horizontal scrolling, Help and Close pointer activation, working modal Help/Escape, Tab/Shift+Tab containment, restored opener focus and scroll-to-bottom. The long content naturally increases vertical content height; no data was removed/hidden. The normal 320 AR and 390 EN cases also include separately saved and verified **null reporter** fallback screenshots.

The independent acceptance verdict for the **scoped #314 native browser zoom fix is GO**. The separate CSS `style.zoom` case remains **NO-GO as a diagnostic** because it does not change the CSS media-query viewport in the way native Chrome tab zoom does; no CSS-only workaround should be added under the scoped Owner approval. This verdict does **not** claim testing on real Android hardware, a native Chrome UI zoom menu (the official extension API is used), production authorization, arbitrary zoom percentages, all Dashboard routes or all possible languages/text lengths.

## Reproduction (PowerShell)

Build `@valet/contracts` in **each** isolated worktree before starting its Next server, then serve baseline on `3384` and candidate on `3385` (or substitute another explicit isolated local port). The test runner runs from the W5 repository root and tests only the selected local URL:

```powershell
$env:E2E_BASE_URL='http://localhost:3384'
$env:ISSUE314_VARIANT='before'
$env:ISSUE314_CASE_ONLY='ar320-native200-dark'
pnpm --filter @valet/dashboard exec playwright test e2e/issue314-independent-acceptance.spec.ts --workers=1 --reporter=line

$env:E2E_BASE_URL='http://localhost:3385'
$env:ISSUE314_VARIANT='after'
pnpm --filter @valet/dashboard exec playwright test e2e/issue314-independent-acceptance.spec.ts --workers=1 --reporter=line

node docs/validation/issue-314/browser/compare.mjs
```

Set `ISSUE314_CASE_ONLY` to each of the IDs in `comparison.json` and repeat both versions to regenerate all nine pairs. Browser profile/test-results are ignored temporary output. `compare.mjs` is evidence tooling, **not** application code. No browser profiles, `.next` build output, runtime database, generated `next-env.d.ts` changes, or CI changes are part of the W5 source deliverable.
