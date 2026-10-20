# Issue #304 — browser verification matrix

**Executed 2026-10-20T18:26:36.071Z**. 64/64 viewport/locale/theme screenshot states; no interpolated or assumed screenshots. 1004 PASS / 32 FAIL / 4 NOT_RUN in the machine output. Each table cell below represents one screenshot per concept (four screenshots).

| Width | EN Light | EN Dark | AR Light RTL | AR Dark RTL |
| --- | --- | --- | --- | --- |
| 320 × 900 | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots |
| 390 × 900 | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots |
| 768 × 900 | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots |
| 1440 × 900 | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots | 4/4 screenshots |

| Exact check | PASS/total |
| --- | ---: |
| shell-parity-html | 64/64 |
| shell-parity-shellCss | 64/64 |
| shell-parity-geometry | 64/64 |
| shell-parity-style | 64/64 |
| rendered-fixture-parity | 48/48 |
| topbar-controls-within-header | 32/64 |
| no-offscreen-interactive-controls | 64/64 |

The shell source audit is 52/52; compared embedded CSS/JS/sidebar/topbar source hashes and each of 22 synthetic resource codes in all four standalone artifacts. The content audit is 48/48: A (8 Key Slots + 8 Spots) → B (3 + 3) → A for every option, in EN and AR. Screenshots: [all captured browser images](screenshots/). Native Edge zoom untested; 720px proxy 4/4.

Remaining failed checks: topbar-controls-within-header (32). Exact contexts and evidence: [interaction-qa.md](interaction-qa.md), [results.json](../qa/results.json).
