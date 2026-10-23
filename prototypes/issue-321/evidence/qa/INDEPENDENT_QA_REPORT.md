# VAYLET #321 Phase A — Worker 7 independent visual and accessibility QA

Date: 2026-10-23. Baseline `main` SHA: `20998a0`. Prototype branch: `design/issue-321-four-react-prototypes`.

## Verdict and scope

**The four prototype options pass the measured 100% shell geometry, normal-width rendering, simulated interaction, role, deep-link, Help and keyboard checks.** No production route, API, database or shared setting code was changed by this reviewer. This audit does **not** approve a design or authorize Phase B.

The remaining evidence limitation is an **absolute 160–200% zoom/reflow acceptance gap inherited from the W1 baseline** and a **partially invalid original pixel baseline** (missing/inconsistent Next-optimized logo images and an EN/dark Next dev overlay). Prototype shell uses the real `DashboardShell` React source; all three VAYLET source/prototype logo files match by SHA-256. Do not claim full pixel or WCAG 2.2 parity based on the baseline artifacts.

## Run results (latest build)

| Evidence | PASS | FAIL | BLOCKED / qualification |
| --- | ---: | ---: | --- |
| Normalized screenshots, A/B/C/D × 1440/768/390/320 × EN/AR × light/dark | 64 | 0 | 0 |
| Actual global-shell DOM geometry vs W1 reference, at 100% | 64 | 0 | 0 |
| Horizontal **document** overflow at 100% | 64 | 0 | 0 |
| Simulated keyboard, Back/Forward/Refresh, Help, Save, validation, roles and unsaved guard | 48 | 0 | 0 |
| DOM accessibility spot checks at 1440/768/390/320 × EN/AR × four variants | 32 | 0 | Full assistive-technology/contrast audit not run |
| Focused 160% and 200% screenshots | 32 captured | 0 new overflow vs W1 | 32 inherit W1's CSS-zoom overflow; absolute reflow not proven |
| Exact global topbar RGBA pixel comparison | 64 | 0 | 0 |
| Exact sidebar/topbar pixel regions at 100% | 64 exact regions | 0 established product regressions | 16 sidebar regions at 1440 have contaminated reference pixels |
| Refreshed authenticated 1440 baseline with verified logo loads | 0 | 0 | 1 runtime blocker, detailed below |

The standard six-spec Playwright suite finished **6/6 PASS** using a local Vite prototype on port 3321. The separate targeted Next baseline-refresh attempt could not reach its sign-in state and is excluded from the normal prototype suite.

## Global shell and original pixel-reference limitations

- DOM position, size, display, color, typography, padding and gap comparisons found **0/64 shell case mismatches** against `.shell`, `.sidebar`, `.sidebar-brand`, `.sidebar-scope`, `.sidebar-navigation`, `.sidebar-utilities`, `.topbar`, `.scope-line`, `.topbar-actions` and `.content`. Prototype content is intentionally different, so the selected-pane geometry is not expected to match old tabs.
- **Topbar: 64/64 pixel-exact** to W1 original captures. Sidebar regions at 768, 390 and 320 have no difference. Desktop 1440 sidebar pixel deltas localize to the logo header (near y=21–40); the EN/dark original additionally captured a visible Next.js dev overlay over the lower navigation near y=840–884. Inconsistent original logo loads cannot establish an actual logo defect.
- Independent SHA-256 confirms `vaylet-emblem.png`, `vaylet-text-white.png` and `vaylet-text-dark.png` are each byte-identical between `apps/dashboard/public/` and `prototypes/issue-321/public/`.
- A read-only, isolated attempt to re-run the real Next baseline on port 3003 failed: Turbopack panicked because the worktree's `apps/dashboard/node_modules` symlink points outside its filesystem root; Webpack fallback returned HTTP 500 on source contract import `./api-errors.js`. Original baseline files were left untouched. No production source workaround was made. Evidence of this failed attempt resides in the separate baseline-refresh test artifacts.

## Responsive comparison at EN/light, Company Admin, Company Defaults

At 390px width and 900px viewport height, the actual first setting starts at the measured Y coordinate below. A position under 900px requires scrolling before the form appears.

| Variant | Information architecture and distinguishing behavior | First setting Y at 390px | UX observation |
| --- | --- | ---: | --- |
| **A — Classic Focused** | Plain five-section vertical local rail; organization/location block; one selected pane | 1063px | Simple and predictable; full local rail pushes mobile form below initial viewport |
| **B — Grouped Enterprise** | Grouped, collapsible Company / Location / Information rail; mobile section chooser collapsed until opened | **676px** | Fastest access to current form on narrow screens; navigation requires one extra reveal action |
| **C — Context First** | Company-to-location inheritance context above the rail and selected pane; rich contextual guidance | 1670px | Strongest scope explanation, longest mobile journey to editable settings |
| **D — Compact Workspace** | Narrow desktop rail with labeled section groups and restrained selected-pane header | 1157px | Dense desktop organization, tall stacked rail still delays mobile form |

Measured first-setting Y at 320px: **A 1120px, B 733px, C 1769px, D 1214px**. At 1440px all four display an editable row above the fold (A 517, B 489, C 865, D 533px). At 768px B remains above the fold (539px); A/C/D start at 999/1462/1031px.

Sections are role-filtered from the source-derived fixture catalog. A/C/D use: **Overview → Company Defaults → Location Overrides → Shift Presence → Service Status**. B groups them as **Company Defaults → Location Overrides → Shift Presence → Overview → Service Status**. Company Admin may access all five; Location Manager has Overview/Location Overrides/Shift Presence, while denied role has no editable section. No-location scenario prevents location-override editing. Service Status is read-only. WhatsApp remains an informational demonstration under its existing company/location context; no provider activation is asserted.

## Interaction and accessibility evidence

The 48/48 interaction probes cover four variants with the same checks each: deep-link/Refresh, legacy `?tab=services`, Enter-key selection plus Back/Forward, contextual Help opened and dismissed by Escape with trigger focus restored, unsaved changes rejection and accepted discard/reset, prototype-only Save, invalid negative GPS retention rejection, Location Manager scoping, denied-role editing absence, no-location empty state and Arabic RTL navigation.

Rendered DOM checks in 32 conditions found **one H1 per screen**, one main landmark, an active local navigation item, no duplicate IDs, no unnamed visible controls, no unlabeled dialogs and no interactive targets under a 23.9px tolerance (which avoids a browser fractional-rounding false positive for exactly 24px Help buttons). Focused keyboard behavior was tested through real Playwright key events. These checks are not an NVDA/VoiceOver evaluation or a full color-contrast audit.

For zoom, the W1 original uses `document.documentElement.style.zoom=1.6/2` rather than a browser-level zoom setting. Its 8/8 zoom reference states already exceed document client width, so the equivalent 32/32 prototype screenshots also report inherited overflow. Some snapshots, particularly 320px/200%, contain very little visible content. The result proves **no new overflow against this reference**, but the Issue #321 no-clipping/200% reflow gate remains **not proven** and needs a separately accepted method or a distinct production-shell resolution.

## Evidence index and reproduction

- `matrix-geometry.json` — 64 normalized case measurements, baseline comparison and overflow/offender details.
- `a-*.png`, `b-*.png`, `c-*.png`, `d-*.png` — 64 normalized 100% and 32 focused zoom screenshots; use identical ID suffixes for A/B/C/D comparisons.
- `shell-pixel-diffs.json` — exact per-region image comparisons and mismatch row/bounds diagnostics.
- `interaction-results.json` — individual 48 simulated-interaction outcomes.
- `accessibility-results.json` — 32 rendered-DOM inspection conditions.
- `zoom-results.json` — 32 zoom states classified as inherited vs new overflow.
- `layout-results.json` — first setting, selected-pane and local-rail dimensions at four widths.
- `tests/qa-*.spec.ts` and `tests/playwright-qa.config.ts` — repeatable Playwright suite; run from the worktree root after starting the prototype with `pnpm --dir prototypes/issue-321 dev`:

```powershell
pnpm --dir apps/dashboard exec playwright test --config ../../prototypes/issue-321/tests/playwright-qa.config.ts
```

The isolated Next refresh attempt is in `tests/qa-baseline-refresh.spec.ts` with its dedicated config and is excluded from the standard suite. No production routes were requested or mutated by the prototype checks.
