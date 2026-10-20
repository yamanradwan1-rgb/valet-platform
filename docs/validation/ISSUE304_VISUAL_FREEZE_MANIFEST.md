# Issue #304 — Option 3 production visual freeze manifest

**State:** W1 reference documented; product visual PASS not yet established.
**Owner-approved direction:** Option 3, Master/Detail Resource Inspector only.
**Base:** `main` `a3779327690debc1ec561760641502967603c5f2`; W1 branch `feat/issue304-w1-visual-freeze`.

## Immutable baseline and source authority

1. **Approved reference** `D:/kndoom/valet-platform/tmp/issue304-design-prime/design/issue304/option-3.html`. Direct PowerShell `Get-FileHash -Algorithm SHA256` verified `31E655EE1DC83311EA473705661A32638D59A17BF13C4D50EE6A00FC0EC939F2`. Reverify this exact byte SHA before comparison; mismatch blocks acceptance. Do not rebuild or modify the Owner-approved file.
2. **Frozen live shell source:** `apps/dashboard/src/components/shell/{dashboard-shell,sidebar,topbar}.tsx`, `apps/dashboard/src/styles/{foundation,shell,shell-controls}.css`, `apps/dashboard/src/app/globals.css` at base `a3779327`. Preserve real role/Location-aware navigation and authenticated actions. The only approved shell exception is the narrow mobile Header geometry repair below.
3. **Historic screenshot support** `D:/kndoom/valet-platform/tmp/issue304-design-prime/design/issue304/evidence/screenshots/option-3-*.png` and evidence `shell-parity.md`, `interaction-qa.md`, `qa-matrix.md`. Earlier W9 run captured 64/64 four-option EN/AR light/dark viewport states, 64/64 mutual mockup shell DOM/CSS/style/geometry parity, 1004 PASS / 32 FAIL / 4 NOT_RUN; the failures were inherited topbar spill at 320/390 and native Edge 200% zoom was NOT_RUN. These **do not prove production parity**.
4. **Baseline evidence caveat:** a previously captured `option-3-1440-en-light.png` lacks the six KPI cards present in the currently hashed reference HTML. Therefore historic pictures cannot automatically be used as pixel-perfect golden images. **Re-capture verified immutable HTML and real implementation under matching browser conditions**. No authenticated Dashboard pixel comparison was conducted by W1.

## Frozen Option 3 interior contract

| Component | Structure and geometry that must survive production mapping |
| --- | --- |
| Heading | Option 3 kicker, single `Resource inspector` heading, subtitle and existing spacing/hierarchy. Replace synthetic design disclaimer with truthful production state, not a redesigned banner. |
| Six KPI cards | Six independent cards in exact order `keys-active`, `keys-available`, `keys-in-use`, `spots-active`, `spots-available`, `spots-occupied` (`data-c-kpi` in reference); **both families always visible** regardless of family selected. Actual counts are authoritative, never guessed. CSS grid is six columns by default, three at <=1150px and two at <=575px. Preserve label hierarchy, accent line, rounded cards, gaps. |
| Family switch | One Key Slots / Parking Spots control group, selected pill/count badges, primary Add Key/Spot and contextual Add Parking Zone. No redundant Operational Keys top tab, second resource management route or invented mutation. |
| Master/detail | Framed `c-workspace`: desktop `minmax(290px,35%) minmax(0,1fr)`, <=1150 `minmax(260px,38%) minmax(0,1fr)`. Master list/search/filters/status and selected row highlight; inspector detail hero + prominent vehicle + two distinct status cards + resource profile + applicable key custody / parking zone. |
| Mobile states | <=820px sequential list/details with Back to list, never clipped/offscreen detail; <=575px 2-column KPIs, compact controls; <=360px full-width stacked actions. Preserve corresponding line heights, margins, cards and scrolling semantics. |
| Data identity | Both families show operator Code, Label, configuration ACTIVE/INACTIVE, independent occupancy/usage, vehicle identity/fallback, QR actions when authorized; Key-only custody, Spot-only Parking Zone. K-02/P-02 sample plate `DEMO 4821`, K-03/P-03 truthful temporary descriptor, K-08/P-08 unavailable fallback. Real resource values may vary; prominence/location/fallback treatment may not. No invented vehicle for empty/inactive/unknown. |
| QR and forms | Match label preview size, modal structure, buttons, focus, print-only label styling; use fresh authorized persisted V2 QR identity. Real Add Key, Add Zone and Add Spot forms keep recognizable Option3 placement/hierarchy and server validation. |
| Theme and direction | Preserve VAYLET light/dark tokens, AR RTL / EN LTR and RTL bidi-safe code/plate rendering; no discretionary typography, color, radius or shadow alteration. |

Semantic match is mandatory even if production React CSS module classnames differ: stable reference landmarks include `.inspector`, `.c-head`, `.c-kpis`, `.c-family-switch`, `.c-workspace`, `.c-master`, `.c-resource-list`, `.c-resource`, `.c-detail`, `.c-vehicle`, `.c-lower-grid`, `.c-modal`.

## Allowed differences and strict shell freeze

Permitted: live Location/resource data, exact authorized server occupancy and associated-vehicle values, independent six KPI counts, scoped loading/error/empty responses, server-provided QR labels, permission-gated create/print actions, and removal of synthetic/demo/preview-only controls. This permission does **not** justify changing static layout, losing selected detail behavior or concealing real UNKNOWN state.

**Sole shell exception — Owner-approved narrow mobile Header geometry:** `apps/dashboard/src/styles/shell.css:186-198` fixes `.topbar` at `4rem` height/min-height/flex basis; `:205-211` permits `flex-wrap:wrap` for `.scope-line,.topbar-actions`; `:255-261` reduces only mobile padding. Earlier actual Edge evidence showed Sign out and/or Location control below the 64px header, overlapping content at 320px and 390px (**32/64** narrow cases failed). Implementation may correct only the minimum Header geometry required to keep **all existing menu, Location, language, theme and Sign out controls visible and non-overlapping**. No hiding, renaming, reordering controls or unrelated branding/sidebar/nav/color/density changes. Require before/after source diff and element rectangle proof. Compare the production header to this **repaired no-overlap contract**, not to a defective pixel screenshot.

Frozen shell dimensions otherwise: desktop sidebar 260px / collapsed 80px; topbar 4rem outside authorized narrow correction; sidebar branding and navigation unchanged; 820px mobile breakpoint, page padding 2rem desktop / 1.25rem mobile, same font/color tokens, scope focus and sign-out behavior.

## Mandatory browser comparison matrix and evidence

For each of these **16 viewport/locale/theme cells**, take *paired* screenshots of the **hash-verified reference** and **authenticated QA production implementation** in the same Edge version/OS/font environment, matching viewport, zoom, DPR, canonical permitted demo scenarios and interaction state. Do not present an older standalone mockup screenshot as a newly generated implementation comparison.

| Viewport (CSS px) | EN light LTR | EN dark LTR | AR light RTL | AR dark RTL |
| --- | --- | --- | --- | --- |
| **320 × 900** | Required | Required | Required | Required |
| **390 × 900** | Required | Required | Required | Required |
| **768 × 900** | Required | Required | Required | Required |
| **1440 × 900** | Required | Required | Required | Required |

At every cell compare **both resource families** and their six KPIs, selected list row and details, status/vehicle display, RTL order and modal geometry. Additional interaction screenshots/tests cover Search, filter, alternate Location A→B→A, real loading/empty/error, resource switch, Add Key, Add Zone, Add Spot, QR preview/download/print, descriptor-only, unavailable and empty associations. Mobile cases require detail Back/return focus. Real data may be sanitized or replaced with deterministic authorized QA fixtures; if values differ, mask **only variable content**, not component contours/styling. Sensitive production/customer data must not be stored in screenshots.

**Native 200% Edge zoom is an independent required gate**, including EN/AR and light/dark. Record native browser zoom setting and **measured** `window.innerWidth`/`window.innerHeight` (at 1440 physical window, approximately 720 effective CSS px, but do not assume it); verify 320/390-equivalent reflow, keyboard focus and dialogs. W9's historical 720px proxy and CSS-injected 200% checks are **not proof of native browser zoom**.

Every comparison record must include reference file/hash, implementation commit SHA, browser version, OS/fonts, viewport, DPR, native zoom, computed CSS viewport, locale, `dir`, theme, resource family, exact Location and list/detail/overlay state, paired screenshot paths and timestamps, comparison artifacts, mask rectangles with reasons and PASS/FAIL per check. Do not invent screenshot names, pixel counts, computed boxes or passes.

### Quantitative visual gates (acceptance, not an assertion of measured PASS)

1. **DOM/semantics:** normalized page landmarks, one logical heading hierarchy, six KPI family/role slots, family controls, list/detail layout, row/vehicle/status information and modal/action presence **all match**. Ignore React-generated IDs, client hydration, timestamps and real data strings; never mask missing family cards, broken selection, duplicated Operational Keys or inaccessible controls. Verify selected `aria-current` and pressed state transitions.
2. **Computed CSS:** verify font stack, size, weight and line height, RTL logical alignment, theme tokens, gaps, padding, border/radius, surface/elevation, focus outline, selected-row styling and the actual media rules at 1150/820/575/360 thresholds. The production styles must be source-faithful to Option3 interior; an unexpected token/spacing change is a visual difference needing approval, not a harmless cosmetic variation.
3. **Geometry:** compare reference/implementation `getBoundingClientRect()` on shell sidebar/topbar/main and interior heading, all six KPIs, family switch, main action, workspace columns, rows, inspector details, vehicle card and QR/modal. With identical fonts and scenario, **target <=1 CSS px** displacement for stable regions; larger deltas require recorded cause and Owner sign-off. **ZERO overlapping header/control/page heading, ZERO clipped enabled controls** at 320/390 or zoom. Exempt only the explicitly approved mobile header fix rectangle from identical-geometry gate; its no-overlap/accessibility checks remain mandatory.
4. **Pixel:** align pairs in the same Edge/font/DPR and calculate an RGB absolute diff for unmasked invariant regions. Target exact output; initial antialiasing review band **<=2/255 per-channel discrepancy in <=0.5% of unmasked pixels**, subject to manual assessment, not automatic PASS. Any shifted contiguous border/edge, modified composition, background token, typography hierarchy, missing panel or hidden action FAILS even if an overall difference score falls below the band. If browser engines or font sets differ, first normalize test environment rather than loosening thresholds.
5. **Masks:** only literal variable code/label/plate/Location name, authorized KPI figures, time, actual QR artwork, server error message and separately approved mobile header delta. Log precise DOM selector/rectangle and reason; **never** mask entire inspector, six KPI grid, family switch, selected-row decoration, modal or topbar. An unexplained artifact, mismatched configuration or unavailable screenshot is **NOT VERIFIED**, not PASS.

## WCAG 2.2, keyboard and landmarks — must be verified separately

- One visible primary `main`, meaningful `h1`, ordered headings and named sidebar navigation; modal `role="dialog"`, labelled heading, accessible names for icon buttons, no nested interactive controls, no role/name/description omissions.
- Keyboard-only flows: language/theme/location chooser; Key/Spot family; search and filters; selected item; detail Back (mobile); Add Key/Spot/Zone, QR preview/download/print, close. Test Tab/Shift+Tab/focus return, Escape modal handling, listbox arrow/Home/End if used, visible selected/pressed attributes and status messages. Focus must not move to hidden/offscreen master/detail or behind a modal.
- WCAG 2.2 **1.4.3/1.4.11** text and non-text contrast, **1.4.10** 320px/reflow, **1.4.12** text spacing, **2.4.7/2.4.11/2.4.12** visible/non-obscured focus, **2.5.3** label-in-name and **2.5.8** target-size 24×24 px or documented spacing equivalent. Test focus ring against both themes and reduced motion. In RTL, plate/code/UUID remain bidi-isolated, with no wrong-side clipped icon or label.
- Accessible automatic audits are supplemental; **manual keyboard, focus obscuration and screen-reader semantics need real evidence**. No WCAG PASS is claimed by writing this manifest.

## Domain/security boundaries and outstanding acceptance

Binding decisions and issues read: **DEC-031** (current KeySlot/ParkingSpot assignment uniqueness, custody event append-only, no fake Zone), **DEC-096 / #232** (scoped persisted creation and non-secret versioned QR labels), **#236** (authorized Parking Zone creation), **#237** (Keys & Spots relocation, Location scope fencing) and **#254** (authoritative operational occupancy + direct vehicle labels, bounded reads, no per-row N+1); see [Issue #304](https://github.com/yamanradwan1-rgb/valet-platform/issues/304). UI screenshot parity never substitutes for tests of authorization, active Location, idempotency, stale A→B→A read/mutation fencing, tenant isolation, custody and API errors.

**W1 evidence classification:** Option3 SHA **VERIFIED**; original source/accepted contracts **INSPECTED**; earlier mockup screenshots **EXIST and supporting**; actual new production rendering and pairwise screenshots **NOT RUN**; numerical pixel comparisons **NOT RUN**; native 200% zoom **NOT RUN**; WCAG live audit **NOT RUN**. Prime/independent QA must fill real measurements and paths before sign-off.

**Release visual decision:** PASS requires all required state/cell/interaction screenshot comparisons, DOM/CSS/geometry checks, 200% native zoom, focus/landmark checks, no unapproved visual change and only the Owner-authorized narrow mobile header geometry exception. Missing or failing evidence is **BLOCKED/PENDING**, never a fabricated PASS.
