# Issue #313 — independent design-gate QA

Base: \`459e9c42dfff5b2aeb11ee9165a7d1a4338a7783\`. Scope: **design prototypes only**.
This folder belongs to Worker 6. All checks are read-only against the production source and
the four HTML previews; no implementation, deployment, or API/DB mutation is authorized.

## Binding contracts and exact frozen surface

- [Issue #313](https://github.com/yamanradwan1-rgb/valet-platform/issues/313):
  the feature lives as a new **Customer Feedback** section on **Analytics**, after its
  four existing KPI cards and before its original two charts. Optional Overview and
  exact-session UI are deferred until explicitly selected.
- \`apps/dashboard/src/features/intelligence/analytics-page.tsx:105-145\`: the page
  header, period/scope selectors, then \`analytics-card-grid\` with four cards, then
  \`analytics-chart-grid\` with two chart panels. These are frozen across all variants.
- \`analytics-cards.tsx:71-161\`: original order Cars Handled, Avg. Retrieval Wait,
  SLA Compliance, Incidents. Test IDs \`analytics-metric-card\` and \`analytics-card-label\`.
- \`analytics.module.css\`: Analytics page gap 24px; original cards gap 16px;
  chart gap 24px; white/dark card backgrounds \`#fff\`/\`#0d152f\`; border
  \`#e2e8f0\`/\`#172346\`; card radius 12px and padding 20px.
  At CSS width 640+, two original KPI columns; at 1024+, four KPI columns
  and two original chart columns. Scope/page shell must not be redesigned.
- \`docs/decisions/DEC-091_GUEST_RATING_AND_RETURNING_CONTACT.md\`: one immutable
  integer 1–5 Guest rating per authorized completed visit. No guest comment,
  reviewer name, or sentiment exists.
- \`docs/decisions/DEC-095_MANAGEMENT_KPI_SOURCE_CONTRACTS.md:180-187\`:
  the visit cohort uses Location-local \`ValetSession.completed_at\`, **never**
  submission \`guest_ratings.rated_at\`. Event timestamp may still be displayed.
- \`docs/decisions/DEC-092_ALL_LOCATIONS_ANALYTICS.md\`: aggregate from raw
  numerator/denominator, not by averaging Location averages. No cross-tenant
  or unauthorized Location details.

## Checks / evidence matrix

| Area | Test | Decision rule |
| --- | --- | --- |
| Frozen shell | Topbar/sidebar, period/scope selectors, Analytics title, navigation and typography compared to baseline and identically across all four | Any unrelated substantial change = NO-GO |
| Frozen KPIs | Exactly 4 original cards in the same order, computed 30px value / 14px label, 20px padding / 12px radius; same values from fixture | Missing/changed KPI or any new rating card inserted among them = NO-GO |
| Placement | New Feedback section after all 4 old KPI cards and before both old chart panels | Wrong order = NO-GO |
| Frozen charts | Exactly 2 original charts, unchanged headings, data/axes/help affordances; compare crop/screenshots to baseline | Missing/chart remake = NO-GO |
| Rating figures | 1–5 scale, rated count/eligible completed count, rate with explicit denominator, five bins summing to rated count, sample-based weighted mean | Wrong math or false coverage = NO-GO |
| Cohort | Check late submission, local time boundary and Company composition in \`rating-contract-check.mjs\` | Using \`rated_at\` as cohort or averaging Location means = NO-GO |
| Data honesty | Synthetic label clearly visible in every option/state, visit reference only, bounded authorized Location label; no PII, comments, NPS, AI sentiment, Google rating, employee rating | Fabricated source/identity = NO-GO |
| Scopes | Company-wide vs authorized Location(s); switching scope resets old figures; no unapproved location rows | Any data leak or stale data = NO-GO |
| States | Ready, no eligible visits, eligible but no ratings, loading, error, denied; display null average as em dash/unavailable rather than 0/5 | Misleading empty state = NO-GO |
| Locale/theme | EN/LTR and AR/RTL, dark/light; real translated labels and mirrored layout without bidi number corruption | Missing modes = NO-GO |
| Reflow | CSS widths 320/390/768/1440; no page-level horizontal overflow, hidden clipping or broken grid; keyboard focus visible | Broken supported width = NO-GO |
| Real zoom | Chromium \`chrome.tabs.setZoom(id, 2)\` and \`getZoom(id)===2\` with effective CSS widths >=320 (e.g. physical 768=>384, 1440=>720); log physical 320 at 200% as exploratory effective160 | Failing supported zoom reflow = NO-GO |
| Interaction | Language, theme, period, scope, details, pagination/filter if present, keyboard Tab/Enter/Space/Escape where relevant | Fake enabled control with no response = NO-GO |
| Accessibility | Landmarks, headings, named controls, focus visibility, modal focus/close, table headers, contrast, reduced-motion support | Blocking keyboard, invisible focus or critical semantics = NO-GO |

## QA-only scripts

\`node rating-contract-check.mjs\` independently evaluates a deliberately
adversarial **QA-only** synthetic fixture. It is not the presentation fixture.
The final visual comparison must use the actual **one shared synthetic fixture**
chosen by the design authors, equal in all four options.

\`node preview-audit.mjs --preview <directory> --output <private-evidence-dir>\`
runs the four standalone HTML previews in Chromium from disk. The runner records
DOM styles, layout/overflow, default EN and AR labels, HTML state hooks,
screenshots, keyboard focus and real native 200% tab zoom. It reports missing
evidence separately from verified failures. Provide a shared Playwright install
with \`VAYLET_DEPS_ROOT\` if this isolated worktree lacks \`node_modules\`.
Do not convert an unverified/blocked test into a PASS.

Interpretation of preview tests is intentionally limited: a beautiful HTML
simulation does not prove API authorization or authoritative SQL aggregation.
Those production tests are Phase B after an explicit Owner choice.

## Known inherited, out-of-scope anomaly

\`apps/dashboard/src/features/intelligence/analytics-cards.tsx:139-144\` checks
\`p?.slaCompliance.percentage\` for truthiness: a valid numeric/string \`0\` can
render \`—\`, even when its denominator is nonzero. Existing condition precedes
Issue #313. This is recorded for owner awareness; do not silently alter it
while checking frozen original KPI cards.
