# Issue #304 — W5 production Dashboard mobile-header geometry

**Source and scope:** `feat/issue304-w5-header` from `main a3779327`. Real Dashboard `/overview` rendered by Next.js 16.2.11, using the repository's synthetic `DashboardApiFixture` for a Company Admin and selected Location. Microsoft Edge via Playwright `channel: msedge`, Windows, 2026-10-20. No live API or customer data.

**Change verified:** `apps/dashboard/src/styles/shell.css`, within `@media (max-width: 820px)`:

```diff
-  .topbar { padding-inline: 1rem; }
+  .topbar {
+    height: auto;
+    flex: 0 0 auto;
+    padding-inline: 1rem;
+  }
```

The original `min-height:4rem` remains in force. Parent header contents can now make it taller than 4rem when `.scope-line` and `.topbar-actions` wrap at narrow widths. The markup, colors, text, icons, navigation, authorization, button sizes, focus styles, and desktop CSS are untouched.

## Measured results

All numbers are CSS pixels (rounded for display). Each row represents four verified combinations: EN/AR × Light/Dark. The baseline is the **same live page** with a temporary test-only CSS override restoring `height:4rem;flex:0 0 4rem`; the after column measures production CSS after removing that override.

| Browser viewport | Cases | Baseline header height | Fixed header height | Baseline controls outside header | After failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| 320px | 4 | 64 | 134.19 | 5 each | 0 |
| 390px | 4 | 64 | 92.19 | 6 each | 0 |
| 768px | 4 | 64 | 64 | 0 | 0 |
| 1440px | 4 | 64 | 64 | 0 | 0 |
| 384px effective layout (768px / 200%) | 4 | 64 | 92.19 | 6 each | 0 |

Across 20 combinations, after the change, every visible header button remained inside the viewport and its header, at least 24 × 24 CSS pixels, with its center unobscured by another element. No two visible header buttons overlapped, and header width stayed within the layout viewport. The 1440px desktop header remained exactly 64px tall. Checks cover both text directions and both themes, including the full text Sign out control.

For 320px Arabic after the fix, measured visible button horizontal extents were **x = 17.42–304px** and vertical extents were **y = 0–133.19px**, inside the **320px** viewport and **134.19px** header. At 390px Arabic they were **x = 74.05–374px**, **y = 0–91.19px**, inside the **92.19px** header. At 768px and 1440px the vertical extents were **y = 10.70–52.30px**, unchanged from baseline. No clipping or hit-target obscuration was found in these sampled states.

**200% qualification:** The 384px run checks the reflow-equivalent layout width for a 768px viewport at 200% desktop browser zoom. It is not evidence that Edge's native browser zoom UI was set to 200%; native browser zoom was not separately automated. It does exercise the same CSS media-query width/layout constraint.

**Accessibility coverage and limit:** The browser assertions check WCAG 2.2 target-size minimum (24px where no exceptions are needed), basic visible focus-target geometry, viewport containment and target overlap. They do not constitute a full WCAG audit of focus indicator contrast, keyboard order, screen readers, or every zoom setting.

## Test and evidence

- Test: `apps/dashboard/e2e/issue304-header-geometry.spec.ts` (real Next Dashboard, Edge, fixture API, baseline override then production CSS).
- Command: `E2E_BASE_URL=http://127.0.0.1:3304 pnpm --filter @valet/dashboard exec playwright test e2e/issue304-header-geometry.spec.ts --reporter=line`
- Outcome: **5/5 tests PASS; 20/20 EN/AR × Light/Dark × viewport cases; 0 after failures.**
- Full bounding-box data and per-control checks: `header-geometry-results.json`.
- Synthetic screenshots: `header-320-ar-dark-after.png`, `header-390-ar-dark-after.png`, `header-768-ar-dark-after.png`, `header-1440-ar-dark-after.png`.

The fix applies only to mobile header height. The wider Issue #304 HTML prototypes, feature logic and full Dashboard shell parity remain separate tasks.
