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

## Test status

| Test | Result | Evidence |
| --- | --- | --- |
| TypeScript | **PASS** | `pnpm --dir prototypes/issue-321 typecheck` |
| Vite production build | **PASS** | `pnpm --dir prototypes/issue-321 build`; 1940 transformed modules on final validated precommit build |
| ESLint for all prototype TypeScript/TSX | **PASS, 0 warnings** | `pnpm exec eslint prototypes/issue-321 --max-warnings=0` |
| Playwright QA specs | **PASS 6/6** | `tests/qa-*.spec.ts` and QA JSON logs |
| Normalized screenshot matrix | **PASS 64/64 captured** | `evidence/qa/{a,b,c,d}-*.png`; `matrix-geometry.json` |
| Global shell DOM geometry | **PASS 0/64 deltas** | `matrix-geometry.json` |
| Topbar rendered RGBA pixel parity | **PASS 64/64** | `shell-pixel-diffs.json` |
| Interaction checks | **PASS 48/48** | `interaction-results.json` |
| Semantic rendered DOM checks | **PASS 32/32** | `accessibility-results.json` |
| Zoom capture at 160% and 200% | **CAPTURED 32/32; strict reflow gate BLOCKED by original shell** | `zoom-results.json`, original `evidence/baseline/` |
| Pixel-exact 1440px sidebar logo comparison | **BLOCKED by baseline image loading** | `shell-pixel-diffs.json` |

The 32 rendered accessibility cases check heading count, main landmark, selected local navigation, accessible names, dialog labels, duplicate IDs, and target sizes. Combined with keyboard interaction tests, this is meaningful coverage, **not a complete WCAG 2.2 audit or screen-reader certification**.

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
| Prime | Shared production-shell harness, Option B, integration fixes, commands, final review, commit and push |

No Phase B source work, PR creation, merge, deployment, Issue closure, real API/database/WhatsApp mutation or production stylesheet changes are part of this deliverable.
The prototype has its own `package.json`, `pnpm-workspace.yaml` and nested `pnpm-lock.yaml`; these are the only dependency/lockfile additions. The root dependency manifests and lockfile remain unchanged.

## After Owner selection

1. Freeze the chosen React option as the immutable approved Policies UI.
2. Plan Phase B with server-authoritative role/scope guards, typed configuration projections, per-setting saving and expected revisions, MFA step-up and inherited/override semantics from existing APIs.
3. Verify all real Shift Presence, WhatsApp and Help behaviors without changing their business contracts; recheck responsive geometry, EN/AR, themes, keyboard interactions and baseline parity against the approved option.
4. Obtain explicit separate Owner GO for production changes. No implementation or merge follows automatically.
