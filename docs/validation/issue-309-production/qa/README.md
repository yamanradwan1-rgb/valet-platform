# Issue #309 — independent production React browser/UI-FROZEN QA

**Scope:** only actual `apps/dashboard` Next/React code running in Chromium;
never the approved standalone HTML as a substitute. Source reference is
`459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`; approved HTML revision is
`a6227f681f4948305c331b1372062fe34533b9aa`, HTML SHA256 prefix
`0b190089`. No product files, server state, real photo bytes or external services
are mutated by this QA suite. The photos in `synthetic-photo.jpg` are generated
test-only illustrations, not actual customer evidence.

## Test matrix

- Frozen source: **2 routes × 2 languages × 2 themes × 4 CSS viewports = 32**
  cases, with original FactList geometry and exact text, original drawer
  header/Help/Close, first focus, opener focus return and screen screenshots.
  Real baseline is W1's `docs/validation/issue-309-prototype/baseline` with
  source-only snapshots/measurements. Conditions use the exact same authorized
  synthetic vehicle fixtures used to capture the baseline.
- Photo behavior: **2 routes × 10 states × 2 languages × 2 themes × 4 widths = 320**
  combinations. States are three, one, ten, empty, legacy-only, unavailable,
  loading, network error/retry, access denied, and interactive viewer. All
  requests are intercepted locally at the actual typed management endpoints;
  HTTPS object keys or private storage URLs are never provided to the browser.
- Viewer: keyboard Enter/Escape, focus opening/return, direction-aware
  arrow navigation and modal semantics. Ten-image late thumbnail access and
  retry-after-network-error additionally exercised.
- Genuine browser 200% zoom requires external Chrome `tabs.setZoom(2)` and
  `tabs.getZoom()===2`; viewport halving or CSS `zoom` is not accepted. Baseline
  inherited Close clipping at physical width 320 / native200: EN 10.42 CSS px,
  AR 17.78 CSS px; compare candidate against identical source before assigning
  new regression severity. Chrome-native zoom proof is a separate browser step.

## Run the integrated candidate

Use the **candidate worktree's** `apps/dashboard` dev server and one reserved
browser slot. Run the test CLI from the **W6 QA worktree's** `apps/dashboard`
directory so Playwright and the test fixture resolve the same package instance;
the app server separately runs in the candidate worktree. A typical Windows
PowerShell run:

```powershell
$env:ISSUE309_APP_URL = 'http://127.0.0.1:3197'
$env:ISSUE309_BASELINE_DIR = 'D:/kndoom/valet-platform/tmp/issue-309-w1-baseline/docs/validation/issue-309-prototype/baseline'
$env:ISSUE309_CANDIDATE_SHA = (git rev-parse HEAD)
cd 'D:/kndoom/valet-platform/tmp/issue-309-w6-react-browser-qa/apps/dashboard'
pnpm exec playwright test --config ../../docs/validation/issue-309-production/qa/playwright.config.ts
```

The tests write candidate PNG/JSON into sibling `results`. Run strict pixel
comparison afterward (requires Python Pillow 10+):

```powershell
python 'D:/kndoom/valet-platform/tmp/issue-309-w6-react-browser-qa/docs/validation/issue-309-production/qa/compare-frozen-pixels.py' --baseline $env:ISSUE309_BASELINE_DIR --candidate 'D:/kndoom/valet-platform/tmp/issue-309-w6-react-browser-qa/docs/validation/issue-309-production/qa/results' --report 'D:/kndoom/valet-platform/tmp/issue-309-w6-react-browser-qa/docs/validation/issue-309-production/qa/results/pixel-report.json'
```

This yields **96 protected pixel regions**: 32 complete closed Dashboard
screens, 32 original drawer headers, and 32 original FactLists. Crops are
derived solely from the original measured rectangles; the new photo section
is the only excluded open-drawer region. `differentPixels` and `diffBounds`
are the exact unrounded RGBA differences. No tolerance is applied and a
one-pixel mismatch is a **STOP** pending inspection. Screenshot differences
arising from an isolated Next development indicator must be documented
explicitly; the script never silently masks it.

This suite's in-repo `self-check.json` compares the frozen baseline to itself:
96 regions, zero changed pixels. It validates comparator operation **only**;
it is not evidence that the integrated candidate has passed.

## W6 completed native zoom, focus and final candidate recheck

Final integrated frontend at `4bf3c725` passed **16/16 real Chrome-native
200% cases**, 32/32 first/last focus outline exterior pixel checks (EN/AR,
light/dark, 320/390, Vehicles/Live), and 16/16 viewer aria-labelled and
aria-described references. Native check creates a Manifest V3 extension in an
isolated temporary Chromium profile, runs `chrome.tabs.setZoom(id,2)` and
validates `getZoom(id) === 2`, including DPR2, CSS zoom1, zero horizontal
document/drawer-body overflow, keyboard and focus restoration. Reproduce:

```powershell
$env:ISSUE309_NATIVE_MODE = 'all'
$env:ISSUE309_APP_URL = 'http://127.0.0.1:3197'
pnpm exec playwright test --config ../../docs/validation/issue-309-production/qa/playwright.config.ts --grep 'true native Chromium'
pnpm exec playwright test --config ../../docs/validation/issue-309-production/qa/playwright.config.ts --grep 'after focus-safe paint'
python ../../docs/validation/issue-309-production/qa/compare-focus-exterior.py
```

The newest frozen pixel proof is `results/final-head-4bf3c725-frozen-pixels.json`:
**93/96 exactly unchanged**, 32/32 FactLists and 32/32 headers exact. The
remaining 3 closed sidebar AA regions differ at **150 pixels** (one RGB
unit), so literal owner zero-pixel gate is still **STOP**. No regions are
masked, shifted or thresholded. Approved HTML photo-region pixel comparison
with identical image fixtures remains unverified and must not be counted as a
success. Real backend owner access policy and PostgreSQL/MinIO integration are
separate release conditions.

## Limits

Automated aria/keyboard checks are not a WCAG 2.2 certification or a screen
reader, physical phone, or production API/storage authority test. The synthetic
legacy-only case models the backend's required exclusion of metadata-only
records from the eligible manifest; it does not query historical private data.
Visual parity with the approved HTML's new photo area must be reviewed using
matched synthetic data/geometry and corresponding W4 HTML captures, not inferred
from the frozen original-region diff. Report missing candidate build or backend
policy authorization as **NOT RUN**; never count it as PASS.
