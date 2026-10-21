# Issue #313 — Final Chromium evidence

**Design source SHA:** `13f762a5ee1643e87a0026a29139bda3d712308d`
**Test environment:** Windows host, local Playwright Chromium (headless),
actual page DOM/CSS and true browser-tab 200% zoom using
`chrome.tabs.setZoom(id, 2)` / `getZoom(id)`.

**Final outcome: 96/96 PASS, 0 failures, 0 pending.** Each option received
16 regular rendering samples (English/Arabic × Light/Dark × 320/390/768/1440)
and 8 genuine 200%-zoom samples (English/Arabic × Light/Dark × physical
768/1440, corresponding to effective CSS 384/720). Saved as
`browser-qa-96-samples.json`, which also includes original KPI/chart computed
CSS, DOM equality comparisons, bounding rectangles and keyboard focus
samples, state transitions, period and role checks.

## Screenshot files

Each `../option-N/` directory includes the following seven screenshots:

- `option-N-en-light-physical1440-100.png`
- `option-N-ar-dark-physical1440-100.png`
- `option-N-en-light-physical390-100.png`
- `option-N-ar-dark-physical390-100.png`
- `option-N-ar-light-physical320-100.png`
- `option-N-ar-dark-physical768-native200.png`
- `option-N-shell-en-light-1440.png`

The first six use an independently tested scroll-region capture method
which **stitches real viewport pixels from `main.content`**. A normal
Playwright `fullPage` screenshot alone omits the Dashboard's inner-scroll
contents on mobile. The seventh screenshot retains the original fixed
Dashboard sidebar/topbar within the desktop viewport so the frozen shell
itself is also visible.

The source-derived frozen baseline's five additional CDP viewport
screenshots and geometry snapshots live at `../baseline/`.

## Replay

From the `design-gate/` directory:

```powershell
node tools/verify-ui-freeze.mjs
node qa/shared-fixture-check.mjs assets/feedback-fixture.js
node qa/rating-contract-check.mjs
node qa/preview-audit.mjs --preview . --output <local-evidence-folder> --source-sha 13f762a5ee1643e87a0026a29139bda3d712308d
node qa/contrast-check.mjs .
node qa/gallery-check.mjs .
```

The browser scripts need a local Playwright installation. If it is installed
in a different VAYLET checkout, set `VAYLET_DEPS_ROOT` to that checkout.
All HTML previews run from local files without a backend or external
analytics/tracking request.

The comparison confirms exact consistency **between the frozen prototype
reference and all four options**. It does not independently certify pixel
identity to an authenticated live production Dashboard, as explained in
`../../reports/visual-freeze.md`.
