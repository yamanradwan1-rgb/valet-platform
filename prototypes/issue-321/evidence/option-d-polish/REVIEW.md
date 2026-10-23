# Issue #321 — Option D owner polish (23 October 2026)

## Design changes approved for prototype refinement

- **Service Status removed from Option D**: no navigation item, no renderable D pane, and `/d?section=services` (including when switching from B) resolves to an allowed section. Options A/B/C are retained unchanged for the Owner's comparison.
- Added original Dashboard-family Lucide icons to D's navigation groups and selected mobile disclosure. Kept the real Dashboard sidebar, header, fonts, palette, buttons and theme CSS intact.
- Four icon-led groups organize the **same fifteen** authorized Company settings: Arrival & handoff (5), Location & tracking (2), Fees & payment (5), Language & notifications (3). The Location Manager continues to see only their **ten** existing ordinary keys in this grouping. No fields or configuration rules were invented.
- Removed the duplicate section heading in D. The shared pane heading is now the region label and receives keyboard focus after a section change.
- Mobile secondary navigation collapses into an accessible labelled button, with correct `aria-expanded`/`aria-controls`, Enter/Space, Escape and focus return; the chosen pane remains visible on its own.
- All existing Shift Presence zones, map/one-shot location, Start/End policy, exceptions, Hours, SLA, WhatsApp and contextual Help interactions remain available in the authorized scenarios.

## Evidence

- `company-1440-en-light.png`: full-page English/light Company settings showing grouped sections and familiar Dashboard shell.
- `company-390-ar-dark.png`: full-page Arabic/dark Company settings with the collapsed compact vertical navigation.
- Fresh `../full-coverage-qa/` contains 64 normalized primary screenshots plus 8 zoom captures and JSON for 192 layout samples, roles, state preservation and geolocation interactions.

## Final checks

| Gate | Status |
| --- | --- |
| `pnpm --dir prototypes/issue-321 typecheck` | **PASS** |
| `pnpm exec eslint prototypes/issue-321 --max-warnings=0` | **PASS** |
| `pnpm --dir prototypes/issue-321 build` | **PASS** (1957 modules) |
| Playwright full-coverage suite | **PASS 10/10**, 2.6 minutes |
| D direct Service Status link, comparison switch, authorized sections | **PASS** |
| D mobile Arabic/dark keyboard, Escape, focus and section heading | **PASS** |
| Shared global shell geometry | **PASS 0/64 normal-zoom deltas** |

## Honest boundaries

Google map tiles need an authorized preview API key; the default offline coordinate map and simulated geolocation interactions were tested. No real API/DB writes, WhatsApp delivery, authentication or shift mutations occur. The production global shell's existing extreme-zoom reflow limitation and unverified original 1440 logo-pixel reference remain documented in `../../FINAL-REPORT.md`. This work does **not** approve Phase B or production changes.
