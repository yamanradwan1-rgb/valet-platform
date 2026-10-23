# VAYLET #321 — Phase A prototype delivery and acceptance evidence

**Baseline:** `main` = `20998a069eb5d576895c0e6c149271a4a0e4028b`

**Design branch:** `design/issue-321-four-react-prototypes`

**Isolated worktree:** `/valet-platform/tmp/issue-321-prototypes`
**Scope:** Four React + TypeScript prototypes under `prototypes/issue-321/`; no production source, routing, APIs, permissions, or database changes.

## What to run and review

See [README.md](README.md) for the standalone Vite startup command and direct `/a`, `/b`, `/c`, `/d` URLs. All options share the *real* DashboardShell and source design assets. The blue Compare controls and the Role & scope simulation selector exist **inside** the prototype Policies page, not in the global Dashboard.

| Criterion | A — Classic Focused | B — Grouped Enterprise | C — Context First | D — Compact Workspace |
| --- | --- | --- | --- | --- |
| Global shell | Same production source; 0 geometry deltas | Same | Same | Same |
| Section discovery | Clear linear vertical rail | Expandable Company/Location/Information groups | Rich section descriptions | Compact grouped list |
| Company vs Location | Context at rail top | Distinct navigation groups; context at rail foot | Explicit Company → Location inheritance chain | Context at rail foot |
| Visual hierarchy | Restrained, familiar | Information-dense, clear hierarchy | Explanatory, roomy | Lean, efficient |
| Mobile first-setting top at 390px¹ | 1063px | **676px** | 1670px | 1157px |
| EN/AR and light/dark | 16 primary captures | 16 | 16 | 16 |
| Responsive and keyboard | Tested | Tested | Tested | Tested |
| Simulated interactions | Shared complete contract | Shared | Shared | Shared |
| Estimated Phase B integration effort² | Low | Medium | Medium–high | Low–medium |
| Best fit | Conservative extension | **Discoverability + mobile efficiency** | Scope education | Experienced dense editing |

¹ Measured by independent browser QA on identical fixture/viewport and initial company section. Lower is less pre-form scrolling. This is a usability comparison, not a production performance metric.

² Engineering assessment from variant complexity and new layout behavior; no Phase B estimate or authorization.

**Provisional design recommendation:** **Option B**. Its grouped rail exposes the existing Company/Location division clearly and gets users to the first setting substantially sooner on narrow screens. A is the closest familiar extension; C has the strongest explicit scope explanation; D is a compact alternative. The Founder makes the final selection.

## Source-faithful shell and truthful settings

- Imports: original `DashboardShell`, real sidebar, topbar, navigation registrations, source dictionary labels and theme provider; unchanged CSS and original branding asset bytes. Next Link/Image have local adapters only so the real shell can run in Vite.
- Baseline captured by Worker 1 from actual Dashboard React implementation in an authenticated, synthetic intercepted staff session. 16 locale/theme/width baseline screenshots and 8 zoom reference screenshots; DOM measurements in `evidence/baseline/geometry.json`.
- Source-backed inventory by Worker 2: `shared/fixtures/INVENTORY.md`. Includes 15 ordinary settings, seven-day operating hours, Location-only SLA, four Shift Presence policy controls, existing WhatsApp context and three **read-only** Service Status entries.
- Company Admin, Location Manager, selected/no Location and denied visibility are simulated from current product rules. No fake tenant status, messaging delivery, API response or persisted configuration is asserted.
- #278 Context Help is sourced from real registry content. #311 WhatsApp remains in its current Company/Location settings context. #316 Guest Information is outside scope.

### Owner-required complete feature coverage (23 October follow-up)

- The prototype now renders the full set of **15 Company/Company Admin Location setting editors** and the exact **10 Location Manager ordinary fields**, with per-setting Help, Save, Clear Override, saved inherited/effective values and a distinct unsaved draft preview.
- **Shift Presence** is a five-view production-aligned Map-First layout. The **Overview itself displays an attendance map**, the Zones view supports local zones with Add/Edit/Enable/Disable, exact label/code/latitude/longitude/radius/status input, manual map picking, one-time foreground **Use My Current Location** with permission-denial fallback, and code suggestion via the existing production utility. Geographic Google Maps tiles/marker/radius display when a local preview key is supplied; otherwise the clearly labeled offline coordinate map preserves editing behavior. Server readiness stays explicitly unknown.
- **Shift policy** exposes the four existing Start/End/accuracy/fix-age fields with Company inheritance and strict-mode confirmation. A scoped, read-only Location capability shows the map but disables modification. **Exceptions** start empty; a deliberately loaded fictional request demonstrates Details, modal focus, explicit simulated Approve/Reject and History without claiming any real employee, MFA, or shift mutation. Guided setup retains the production step structure.
- **Operating Hours** exposes all seven OPEN/CLOSED weekdays, HH:mm time validation, per-scope Save/Clear and Company inheritance. **SLA** is Location-only with 30–3600 second bounds and Save/Clear. **WhatsApp Guest Access** stays in the existing Company/Location settings placement with four typed fields, inherited values, separate in-memory Company/Location saved snapshots and simulated revision conflicts; no real templates/providers are invented or messages sent. **Service Status** stays read-only with honest unknown state and search/filter/refresh.
- The SPA preserves feature Save state across section navigation, normalizes disallowed deep-link sections to an authorized URL, preserves normal browser history, and guards unsaved edits in the feature editors. These are **prototype UI simulations**, not assertions of backend authorization or persistence.

## Test status

| Test | Result | Evidence |
| --- | --- | --- |
| TypeScript | **PASS** | `pnpm --dir prototypes/issue-321 typecheck` |
| Vite production build | **PASS** | `pnpm --dir prototypes/issue-321 build`; 1957 transformed modules on 23 October source integration |
| ESLint for all prototype TypeScript/TSX | **PASS, 0 warnings** | `pnpm exec eslint prototypes/issue-321 --max-warnings=0` |
| Initial Playwright QA specs (before expanded editors) | **PASS 6/6** | `tests/qa-*.spec.ts` and original QA JSON logs |
| Initial normalized screenshot matrix | **PASS 64/64 captured** | `evidence/qa/{a,b,c,d}-*.png`; `matrix-geometry.json`; predates expanded editors |
| Global shell DOM geometry | **PASS 0/64 deltas** | `matrix-geometry.json` |
| Topbar rendered RGBA pixel parity | **PASS 64/64** | `shell-pixel-diffs.json` |
| Initial interaction checks | **PASS 48/48** | `interaction-results.json`; predates expanded editors |
| Semantic rendered DOM checks | **PASS 32/32** | `accessibility-results.json` |
| Zoom capture at 160% and 200% | **CAPTURED 32/32; strict reflow gate BLOCKED by original shell** | `zoom-results.json`, original `evidence/baseline/` |
| Pixel-exact 1440px sidebar logo comparison | **BLOCKED by baseline image loading** | `shell-pixel-diffs.json` |

The 32 rendered accessibility cases check heading count, main landmark, selected local navigation, accessible names, dialog labels, duplicate IDs, and target sizes. Combined with keyboard interaction tests, this is meaningful coverage, **not a complete WCAG 2.2 audit or screen-reader certification**.

The expanded coverage is exercised by `tests/full-coverage-qa.spec.ts` and `evidence/full-coverage-qa/persistence-regression.spec.ts`. Their final results, including 192 geometry/zoom samples, 16 saved-state cases, editable zones/GPS/error paths, exceptional approval simulation and denial of edit authority, must be taken from the corresponding **new JSON reports**. Do not count older test evidence as proof of new behavior.

### Final post-expansion browser rerun — PASS

After integrating all special editors, fixing the two modal focus-return defects, normalizing forbidden deep links and removing an initially duplicated presence overview map and heading, Prime ran a complete fresh Chromium regression on the final source:

```powershell
node apps/dashboard/node_modules/@playwright/test/cli.js test --config prototypes/issue-321/evidence/full-coverage-qa/playwright.config.ts
```

**Result: PASS 8/8 Playwright tests (2.1 minutes, exit 0)** in three new spec files, plus TypeScript, Vite build (1957 modules) and ESLint (0 warnings) PASS. The suite uses one browser worker and does not call production VAYLET APIs.

| Final evidence | Result | File / exact meaning |
| --- | --- | --- |
| Normalized final source matrix | **PASS 192/192** | `evidence/full-coverage-qa/matrix-results.json`; 4 variants × 2 locales × 2 themes × 4 widths × CSS zoom 100/160/200; 0 failed groups |
| Frozen shell DOM rectangles | **PASS 0/64 normal-zoom discrepancies** | Reference comparison at 100% where original baseline cases exist; do not extrapolate to unbaselined zoom |
| Primary new screenshots | **CAPTURED 64/64** | `evidence/full-coverage-qa/{a,b,c,d}-{320,390,768,1440}-{en,ar}-{light,dark}-z100.png` |
| Focused zoom screenshots | **CAPTURED 8** | 160% EN 390 and 200% AR 320 for each variant; CSS zoom simulation, not OS/browser preference testing |
| Cross-section state retention | **PASS 16/16** | `persistence-results.json`: zone, Hours, WhatsApp and SLA saved samples persist after section switches in all variants |
| Zone/GPS/save/focus interactions | **PASS 8/8** | `zone-interactions.json`: manual/denied/allowed one-time location, map pick, edits, uniqueness, Enable/Disable and unsaved dismissal |
| Section/history/roles/Help | **PASS 16/16** | `navigation-results.json`: EN/AR, Light/Dark, LM restrictions, dirty navigation, Back/Forward, strict modes, Guided setup |
| Capability and exception dialogs | **PASS** | Real browser tests across A/B/C/D: read-only policy/zone denial, fictional exception confirmation, approval history, Escape and focus restoration |
| Invalid deep links & Option B ARIA | **PASS 2/2** | `tests/route-aria-qa.spec.ts`: unauthorized URLs normalize and collapsed group stays referenced in DOM |
| Unexpected external calls in default offline preview | **PASS 0** | New matrix and zone interception logs report no nonlocal or VAYLET API requests |

The map is verified interactively with the **offline illustrative coordinate mode**. A genuine Google geographic basemap depends on supplying an authorized local preview key; that exact provider-rendered experience was **NOT RUN**. Likewise screen-reader certification, user-agent zoom at 200%, and pixel-exact baseline logo matching remain outside demonstrated PASS criteria. The production shell's previously measured narrow-screen extreme-zoom limitation is unchanged, and this Phase A report makes no WCAG 2.2 conformance claim.

### Remaining evidence limitations

The original Next baseline at 1440px was captured before VAYLET image assets finished loading. Some original screenshots also contain a Next development overlay. A read-only baseline recapture attempt failed locally: Turbopack's symlink/outside-root path error and a separate webpack unresolved `./api-errors.js` import prevented an authenticated re-render. We preserved original W1 evidence rather than modifying its screenshots. Original logo assets and source DashboardShell are used unchanged by all prototypes, and normal-size DOM geometry and topbar pixels match; **exact logo pixel comparison remains unproven**.

Zoom 160%/200% testing exposed inherited horizontal/clipping behavior in the current shell at narrow effective widths. No new document overflow was introduced by the prototypes in the captured cases. Because the inherited behavior affects usable reflow, **200% WCAG usability should not be marked PASS**. Any production shell change to address it is outside #321 Phase A authorization.

## Worker ownership

| Worker | Task and outcome |
| --- | --- |
| W1 | Completed actual Dashboard visual baseline, assets, geometry, screenshots |
| W2 | Completed Policies/settings/roles/Help/WhatsApp inventory and fixtures |
| W3 | Completed Option A source |
| W4 | Agent launch failed before useful work; **Prime implemented Option B** |
| W5 | Completed Option C source |
| W6 | Completed Option D source |
| W7 | Independent cross-option visual, pixel, interaction and accessibility QA |
| W8 | Full seven-day Hours editor, state contract and validation |
| W9 | Full WhatsApp policy UI; Prime integrated durable simulation snapshots after the follow-up worker became unavailable |
| W10 | Read-only Service Status and complete SLA editor |
| W11 | Independent source-backed complete coverage inventory |
| W12 | Post-expansion browser matrix, role, map/GPS, persistence and keyboard QA |
| W13 | Independent full-coverage and design-efficiency review |
| Prime | Shared production-shell harness, Option B, integration fixes, commands, final review, commit and push |

Additional worker launches for follow-up persistence/deep-link/ARIA tasks failed to attach; Prime completed and verified those source patches. Worker 13's earlier independent review is retained verbatim in `evidence/full-coverage-qa/independent-review.md` as a point-in-time audit, while the later repaired items and fresh test results above are Prime's independently confirmed follow-up.

No Phase B source work, PR creation, merge, deployment, Issue closure, real API/database/WhatsApp mutation or production stylesheet changes are part of this deliverable.
The prototype has its own `package.json`, `pnpm-workspace.yaml` and nested `pnpm-lock.yaml`; these are the only dependency/lockfile additions. The root dependency manifests and lockfile remain unchanged.

## After Owner selection

1. Freeze the chosen React option as the immutable approved Policies UI.
2. Plan Phase B with server-authoritative role/scope guards, typed configuration projections, per-setting saving and expected revisions, MFA step-up and inherited/override semantics from existing APIs.
3. Verify all real Shift Presence, WhatsApp and Help behaviors without changing their business contracts; recheck responsive geometry, EN/AR, themes, keyboard interactions and baseline parity against the approved option.
4. Obtain explicit separate Owner GO for production changes. No implementation or merge follows automatically.
