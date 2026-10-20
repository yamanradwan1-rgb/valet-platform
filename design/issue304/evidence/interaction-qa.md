# Issue #304 — independent interaction and visual QA

**Observed run:** 2026-10-20T18:26:36.071Z, Windows Edge with Playwright, one serialized headless Edge process. **1004 PASS / 32 FAIL / 4 NOT_RUN** automated checks. Static source checks: **52 PASS / 0 FAIL**. No result below implies production implementation or live API validity.

## Concrete observed coverage

- **64/64** responsive + locale/theme state screenshots, dimensions 320/390/768/1440 × EN/AR × light/dark × four options. 64/64 locale/direction, 64/64 theme, 64/64 document horizontal overflow, 64/64 logo image load, 4/4 page-level external request probes passed. Screenshots are under [screenshots/](screenshots/).
- **Frozen shell parity:** 64/64 HTML markup, 64/64 embedded CSS, 64/64 computed geometry, 64/64 computed style. These are equal across the four candidates at each tested state. A shared defect can still exist and is counted independently.
- **Content parity:** 48/48 rendered inventory comparisons, covering every family for all four concepts, both locales and A→B→A Location changes (expected A=8 Key Slots +8 Spots, B=3+3); pagination/group toggles traversed where applicable. 16/16 checks confirmed localized K-08/P-08 vehicle fallback. 8/8 synthetic warnings; 8/8 duplicate tab absence.
- **Keyboard and resource interaction:** 8/8 mobile menu opens, 8/8 Escape closes, 8/8 focus restored, 8/8 A→B and 8/8 B→A, 8/8 visible Tab focus, 8/8 selected detail, 8/8 QR previews, 8/8 no persisted synthetic create after list check/reload, 16/16 dialog Tab/Shift+Tab containment.
- **Preview states:** 8/8 empty, 8/8 loading, 8/8 error. These are independently triggered synthetic UI states, no network operations.
- **Zoom:** 4/4 720px CSS viewport proxies for 1440px at browser zoom 200%; 4/4 CSS-injected 200% checks. Native Edge browser zoom itself: 4 NOT_RUN. The CSS injection doubles a 100vw box and caused 1440px overflow; that diagnostic is explicitly **not** a browser zoom acceptance failure.

## Remaining FAIL checks (automated observations)

| Check | Failing observations | Interpretation | First context |
| --- | ---: | --- | --- |
| topbar-controls-within-header | 32 | Inherited frozen shell P1: location/sign-out buttons wrap beyond the fixed 64px topbar at widths 320/390; overlaps page headings. Shell parity holds across all options. | option-1 / 320 / en / light |

Screenshots to reproduce shared mobile shell issue: [Option 1 320 AR Dark](screenshots/option-1-320-ar-dark.png), [Option 2 390 EN Dark](screenshots/option-2-390-en-dark.png), [Option 3 320 AR Dark](screenshots/option-3-320-ar-dark.png), [Option 4 390 EN Dark](screenshots/option-4-390-en-dark.png).

**Option 4-specific defects RESOLVED and independently rechecked:** 320px Arabic Parking Spots family button previously extended 11px offscreen; current [AR Dark](screenshots/option-4-320-ar-dark.png) and [AR Light](screenshots/option-4-320-ar-light.png) screenshots show corrected wrapping, and **64/64** controls remain onscreen. The prior QR/Create dialog keyboard focus escape was fixed; **16/16** Tab/Shift+Tab cycles remain inside their active overlays. All 96 screenshots originate from the final local Edge run; there are also QR/detail/create and zoom/proxy images.

## Truth limitations

- Source equality proves parity between the **four static prototypes**; screenshots and computed styles provide browser evidence for those files. No authenticated production Dashboard was opened for pixel-by-pixel reference comparison. Shell CSS was sourced from the Dashboard snapshot, but native live shell parity remains outside this exact task's browser evidence.
- Local file URL demos use synthetic canonical data and no actual VAYLET server. No protected authorization, production DB, actual QR scanning, download/print, or mutation is exercised.
- Zoom findings distinguish CSS injection and reduced CSS viewport proxy from actual Edge 200% zoom. Native zoom remains unverified as labeled in the machine report.
- Detailed context-by-context checks, failures and timing: [qa/results.json](../qa/results.json); static fixture/source checks: [qa/static-results.json](../qa/static-results.json). Screenshots do not establish that hidden/offscreen regions are fully usable without the interaction probes.
