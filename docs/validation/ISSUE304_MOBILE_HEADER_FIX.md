# Issue #304 — exact narrow mobile Header geometry exception

Owner-approved exception: **correct the existing mobile Header spill without redesigning the global shell**. Original Dashboard and approved Option3 interiors otherwise remain protected.

## Exact production CSS change

File: `apps/dashboard/src/styles/shell.css`. Only within existing `@media (max-width:820px)`, change the pre-existing `.topbar { padding-inline:1rem; }` to:

```css
.topbar {
  height: auto;
  flex: 0 0 auto;
  padding-inline: 1rem;
}
```

The preexisting global `min-height:4rem` continues to apply. The original topbar controls, text, order, colors, sizes, fonts, icons, buttons, paddings, backgrounds, desktop geometry and selection behavior remain unchanged. Overflow is resolved by allowing the existing flex-wrapped controls to determine the mobile header height. No controls hidden or font sizes reduced. This is not an Option3-local CSS workaround.

Commit: W5 `286e298c5817ae4951697b47ba468e657d1444b5`; Prime integration cherry-pick `c5ebe0a9`.

## Evidence from actual Dashboard

W5 launched actual Next Dashboard route `/overview` with a synthetic test `DashboardApiFixture` and Microsoft Edge, not just a static screenshot. Executed 5/5 focused Playwright tests covering 20 EN/AR × Light/Dark contexts across widths 320px, 390px, 768px, 1440px and 384px effective 200% reflow equivalent.

| Width | Baseline | Corrected |
| --- | --- | --- |
| 320 | 64px header; five controls spilled | ~134.19px; no spill |
| 390 | 64px header; six controls spilled | ~92.19px; no spill |
| 768 / 1440 | 64px; baseline contained | 64px, unchanged |
| 384 effective 200% reflow proxy | controls spilled | ~92.19px, all contained |

Browser assertions: zero off-header controls, zero horizontal viewport overflow, zero header button overlaps, all targets at least 24 CSS px and their centers unobscured. Focused lint PASS. Synthetic evidence is under `docs/validation/issue304-w5/`, including `header-evidence.md`, `header-geometry-results.json`, and four PNGs. No authenticated user screenshots or private data.

**Limits:** Effective 384px reflow is not itself a native browser UI 200% zoom event; that additional full integrated acceptance is pending W6. W5 tested the real Dashboard before Prime merged W2/W3 Option3; complete integrated route screenshot and other-route shell parity are separate strict gates. No unrelated shell CSS or production deployment authorized.
