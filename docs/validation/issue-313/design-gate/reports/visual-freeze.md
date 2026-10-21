# VAYLET #313 — Analytics UI freeze

**Original source SHA:** `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`

The frozen local Analytics reference is `baseline/current-analytics.html`.
Its original Dashboard shell, header, selectors, four KPI cards and two charts
were recreated using the original TSX and CSS source, and the same reference
data and local assets are included in every standalone option.

## Exact prototype comparison

Run `node tools/verify-ui-freeze.mjs` from `design-gate/`. Each HTML option
has a byte-identical prefix and suffix to the frozen HTML, separated by the
single `<!-- ISSUE313_FEEDBACK_SECTION -->` insertion point. All four pass.
The sole insertion follows `#frozen-kpi-grid` and precedes
`#frozen-chart-grid`. Each new section uses its own locally scoped CSS/JS
and consumes the identical `assets/feedback-fixture.js`.

The independent Chromium Playwright test `qa/preview-audit.mjs` compares
the original 4 KPI cards, 2 chart panels, translated original labels, chart
data, rendered DOM and computed styling against a separately loaded frozen
baseline. It tests 320, 390, 768 and 1440 CSS pixels across EN/AR and
light/dark, plus real Chromium native 200% zoom. The two charts are allowed
to translate vertically from insertion; their internal geometry remains
unchanged.

Evidence includes the `evidence/baseline/` CDP screenshot and geometry set,
and the QA option screenshots and machine-readable browser results under
`evidence/`. The baseline 1440px capture recorded KPI y=183px, 136px-high
grid and chart y=343px. At 390px the grid begins y=323px, height 592px,
and charts begin y=939px. All baseline captured CSS viewport widths equal
their requested widths and had no root horizontal overflow.

## Scope and fidelity boundary

**Prototype-to-frozen-reference parity:** Proven by byte-identical protected
HTML and independently measured rendered DOM/CSS in browser tests.

**Absolute live-product pixel identity:** Not established. This is a
standalone, source-derived HTML snapshot. The baseline was not captured in
an authenticated production Analytics browser and includes source-faithful
local SVG/icon equivalents, fixed synthetic existing KPIs/charts, and
platform font fallback. Consequently, this evidence cannot claim exact
pixel-by-pixel identity to an authenticated live VAYLET Dashboard. The
Owner's strict live-pixel gate remains conditional on such a source capture
and controlled image/geometry comparison at the same resolution/font
environment before implementation approval.

No production frontend, API, data, navigation, global theme or database
schema files were modified for these prototypes.
