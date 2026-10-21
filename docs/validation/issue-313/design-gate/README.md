# VAYLET #313 — Customer Feedback Analytics design gate

These are **offline HTML prototypes only**. The real VAYLET Management Dashboard,
rating controller, contracts, database and production Analytics UI are unchanged.
The Owner must explicitly select and approve one exact HTML revision before any
production implementation.

## Preview

Open `index.html` in a browser. The gallery embeds all four standalone HTML
documents and switches the language, theme and simulated device width. Open each
prototype directly to exercise the rating demonstration's local controls and
empty, loading, error and denied states.

The original Analytics period selector is frozen to the identical operational
reference fixture in each design. The **new section's separately labelled
simulation period control** lets the Owner explore September, October and
zero-visit date cohorts without modifying the pre-existing period selector or
operational KPI values. A production implementation would use the single
currently authorized Analytics period through a new typed backend read.

| Option | File | Hierarchy |
| --- | --- | --- |
| 1 — Summary First | `option-1-summary-first.html` | Average and participation first |
| 2 — Insights First | `option-2-insights-first.html` | Five-star distribution and statistical coverage first |
| 3 — History First | `option-3-history-first.html` | Recent visit rating records first |
| 4 — Balanced Executive | `option-4-balanced.html` | Score, participation, distribution and history together |

The common baseline is `baseline/current-analytics.html` and its fixed
reference fixture lives under `baseline/`. All synthetic visit references
start with `DEMO-`, contain no customer identities, and are for design
illustration. Browser displays may simulate a future API response. No API
request or customer data is needed.

## Visual freeze and data contract

The original Analytics content (sidebar, topbar, header, selectors, four
operational KPI cards and two existing charts) must be exactly identical in
all options. The sole allowed insertion is a new Customer Feedback section
between the four cards and the two charts. Natural vertical displacement of
both charts is permitted; changes to chart sizing or to existing components
are prohibited.

Guest rating statistics represent **one immutable integer (1–5) per completed
visit**. Cohort inclusion uses the visit's Location-local `completed_at`;
`rated_at` only represents when the feedback was submitted. Participation
equals rated completed visits divided by eligible completed visits. Zero
ratings means no average; zero eligible visits means participation unavailable.
The Company summary must equal its authorized Location summaries.

See `reports/` and `evidence/` for tested configurations, screenshot captures
and independent QA decisions. Verification limitations are documented rather
than silently changing an inherited Analytics element.

## Read-only local verification

```powershell
node tools/verify-ui-freeze.mjs
node qa/rating-contract-check.mjs
node qa/shared-fixture-check.mjs assets/feedback-fixture.js
```

The independent browser suite uses `qa/preview-audit.mjs` as documented in
`qa/README.md`. It requires a local Chromium/Playwright installation and
records actual viewport widths and browser native 200% zoom independently
from the screenshots.

## Approval checkpoint

The recommended option is advisory only. Selecting a design requires the
Owner to confirm the exact option, revision and screenshots. This branch must
not be merged, deployed or used as permission to implement the feature.
