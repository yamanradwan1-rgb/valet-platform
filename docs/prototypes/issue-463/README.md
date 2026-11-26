# Issue #463 — Rating comments UI prototypes

**Prototype evidence only. No production implementation or deployment.**

Source baseline: `cc507a5b25779e12934a3ead846ceb2c8ddff16b` (main at capture).
Tracking issue: [#463](https://github.com/yamanradwan1-rgb/valet-platform/issues/463).

## Run locally

Download and extract either ZIP into its own folder. Node.js is required; the prebuilt bundles do not require npm installation.

| Package | Command from extracted folder | Local address |
| --- | --- | --- |
| [Guest Web](guest-prototype.zip) | `node serve.cjs` | http://127.0.0.1:3463/ |
| [Management Dashboard](dashboard-prototype.zip) | `node serve.cjs` | http://127.0.0.1:3464/ |

Both servers bind to loopback only. Use the prototype toolbar to change language, theme, original/proposed mode, or mock submission result. Dashboard has an additional full-section view. No live API or database is used.

## Guest Web

- Optional multiline comment directly below the existing rating stars and above submission feedback/button.
- Existing Guest AppShell, Btn, SectionTitle, translations, semantic theme tokens and logo assets reused.
- Field geometry derived from the existing Report Issue textarea (10px radius, 12px/14px padding); three rows, accessible label and focus state. Placeholder copy is provisional.
- No production character limit defined.
- Mock stars-only and comment-entry flows; loading prevents edits/duplicate submission, failure supports retry, back returns to the completed view.

[Original](screenshots/guest-original.png) · [Arabic light](screenshots/guest-ar-light.png) · [Arabic dark](screenshots/guest-ar-dark.png) · [English light](screenshots/guest-en-light.png) · [English dark](screenshots/guest-en-dark.png) · [Multiline](screenshots/guest-multiline.png)

## Management Dashboard

- Comment icon next to existing rating chip only for mock visits with a comment.
- Expands the matching comment inline; one open at a time; click again to collapse.
- Original CustomerFeedbackInsights CSS, date formatting, translations, rating-chip styles and theme tokens reused. Summary and distribution remain visible in full-section mode.
- Direction-aware multiline text; keyboard-operable disclosure with aria-expanded.

[Original](screenshots/dashboard-original.png) · [Proposed](screenshots/dashboard-proposed.png) · [Expanded](screenshots/dashboard-expanded.png) · [Arabic dark](screenshots/dashboard-ar-dark.png) · [English light](screenshots/dashboard-en-light.png)

## Verification and limitations

Local Playwright runs returned exit 0:
- Guest: original heading geometry, four language/theme combinations, star selection, optional empty and multiline input, loading lock, failure/retry, back, 320/390/1280 widths, reduced viewport, no page errors.
- Dashboard: original row geometry, four rows, two comment buttons, expand/collapse, single open, matching comment, keyboard, four language/theme combinations, 320px no overflow, no page errors.
- 13 Guest and 8 Dashboard screenshots captured; all included in their respective ZIPs. Selected screenshots are linked above.
- Reduced viewport is a keyboard simulation, not a physical mobile keyboard test. Full pixel parity and font availability were not independently established.
- The two mock prototypes are independent. Guest comment text is held in component state; the mock rating submission currently exercises the existing stars-only submission path, so this does not demonstrate comment transport or Guest-to-Dashboard persistence. Dashboard comments are fixtures.
- Source deltas, original local build/verification scripts and prebuilt bundles are included in the ZIPs. The build/verification scripts reference the original Windows repository dependency paths and are not portable without adapting paths and restoring the pinned source tree. The prebuilt runtime is portable with Node.
- No production source, API, contracts, authorization, migrations, CI, or security configuration changed. No production feature activation.

**Review status: UI PROTOTYPE READY — OWNER APPROVAL REQUIRED.** Production implementation requires explicit `UI APPROVED` and subsequent implementation authorization per issue #463.
