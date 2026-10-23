# VAYLET #321 — independent full-coverage browser QA

Date: 2026-10-23. Scope: Phase A A/B/C/D React+TS prototype worktree only.
Validation target: integrated preview on `http://127.0.0.1:3321`. The source Dashboard shell and production applications were inspected read-only. The test author changed only this QA suite and its evidence files; source fixes were made by Prime.

## Verdict

**Functional browser QA: PASS, 8/8 Playwright tests in 3.0 minutes.** All four alternatives expose the integrated simulated features and passed the tested CRUD, policy, permission, navigation, persistence and Help/focus paths. The tested flows made no VAYLET API calls.

**Absolute zoom/reflow acceptance: NOT PROVEN / NO-GO for an unconditional 200% usability claim.** At CSS zoom 160% and 200%, all 128 samples had horizontal document overflow; the 64 samples at 100% had none. Existing W1 production-shell baseline captures already document this extreme-zoom condition. The fresh 320px AR/dark 200% capture shows a completely navy initial viewport, with no Policies content initially visible. The 390px EN/light 160% capture visibly clips content on the right. This remains a release-quality usability issue even though the baseline shell geometry is preserved.

## Evidence summary

| Check | Result | Scope |
| --- | --- | --- |
| Canonical Playwright run | **8/8 PASS** | Own 6 suites plus Prime's 2 route/ARIA suites |
| Geometry states | **192/192 captured, 0 failed groups** | 4 options × 2 languages × 2 themes × 4 widths × CSS zoom 100/160/200 |
| 100% shell parity to W1 | **64/64, 0 geometry mismatches** | Shell, sidebar and topbar bounding rectangles, 1px tolerance |
| 100% document overflow | **0/64** | Widths 320/390/768/1440, EN/AR and light/dark |
| 160/200% document overflow | **128/128** | Absolute reflow remains a known unresolved constraint |
| Fresh image captures | **72 PNGs** | All 64 normal-zoom cases, plus 8 representative 160/200% states |
| Saved-state remount regressions | **16/16 PASS** | Zone, Company Hours, WhatsApp language and Location SLA across A/B/C/D |
| Backend/external network | **0 detected** | Matrix external-origin requests, zone/API requests and saved-state API requests |
| Role and capability gating | **PASS** | Company Admin, Location Manager (10 ordinary rows), read-only Presence, denied role, no selected Location |
| Route history and controls | **PASS** | Keyboard selection, Back/Forward, dirty confirmation, AR/RTL, theme, forbidden-section normalization, Option B aria-controls |

The matrix uses `document.documentElement.style.zoom`, matching the historical W1 measurement approach. It is a layout simulation; it does **not** establish a pass for actual browser zoom, text-only zoom, assistive technology, touch targeting or WCAG 2.2 reflow.

## Functional journeys verified

- On each A/B/C/D option: add a simulated attendance zone using a clickable coordinate grid, validate unique code and geographic bounds, edit its radius, Disable/Enable with confirmation, and retain saved state through section navigation.
- `Use My Current Location`: deterministic permission-denied message with manual-entry fallback; a stubbed single foreground success updates latitude and longitude; clicking the map overrides the synthetic proposal.
- Zone editor: unsaved Escape/Cancel protection, confirmation and focus restoration. Prime fixed a real lost-focus finding exposed in the first run; the unchanged focus assertion passed after repair.
- Presence policy: Company/Location scope switching, explicit strict-mode confirmation, row Save and guided setup through Review.
- Fictional exception request: load, open Review, reject an approval confirmation, accept an approval confirmation, move to History, then reopen Details. Read-only capability has no Approve action. Prime fixed an independent exception-dialog Escape focus defect; retest passed.
- Operating Hours, WhatsApp and SLA: save simulated values, navigate away, return and verify they persist in the same SPA session. These were all green after Prime hoisted synthetic state into App.
- Help dialog Escape/focus return, draft guards, URL history, unauthorized sections, no-location and denied-role empty states.

## Map and privacy qualification

The screenshot baseline on this run shows an **interactive local coordinate-grid preview**, not geographic Google map tiles. The optional Google Maps preview requires `VITE_GOOGLE_MAPS_API_KEY`; it was not configured in this zero-external-network QA run. The simulation provides point selection, exact coordinates, radius, location permission/error behavior and zone management, but cannot prove real map-tile geometry, provider availability or server-side geofencing.

All employee, company, zone and exception records are fictional. Simulated Save/Review actions do not persist across a fresh browser reload and do not approve a real shift or send messages.

## Reproduction and artifact index

Run from the isolated worktree root in PowerShell, with the Vite preview running at port 3321:

```powershell
& .\apps\dashboard\node_modules\.bin\playwright.cmd test --config prototypes\issue-321\evidence\full-coverage-qa\playwright.config.ts
```

- `matrix-results.json`: 192 rendered DOM cases, baseline availability, shell comparison, dimensions, map kind, overflow geometry and network origin log.
- `zone-interactions.json`: zone/geolocation/edit/enable/duplicate/dirty cases and API request log.
- `navigation-results.json`: draft, keyboard, browser history, help, roles, strict mode, exception controls and guided setup.
- `persistence-results.json`: 16 saved-state checks with individual PASS/FAIL and API request log.
- `a-*.png`, `b-*.png`, `c-*.png`, `d-*.png`: 72 fresh normalized image captures.
- `playwright.config.ts`, `persistence-regression.spec.ts` and `../../tests/full-coverage-qa.spec.ts`: repeatable QA source. Prime owns `../../tests/route-aria-qa.spec.ts`.

## Decision boundary

This is a **functional Phase A preview QA pass with a documented zoom usability limitation**. It does not approve Phase B production implementation, any actual tenant/API write, Google Maps provider configuration, release deployment or Issue #321 closure. An unconditional 200%-zoom accessibility sign-off would require a separate remediation/rebaseline of the inherited global shell and a fresh browser-level reflow evaluation.
