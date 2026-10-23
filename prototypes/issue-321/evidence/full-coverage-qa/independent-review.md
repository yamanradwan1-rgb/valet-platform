# Issue #321 Phase A — independent four-variant coverage review

**Reviewer:** worker-13 (read-only product/source review; this report is the only authored artifact)
**Date:** 2026-10-23
**Scope:** `prototypes/issue-321` A/B/C/D, their common settings content, frozen Dashboard shell, and the production `/policies` source contract at baseline `20998a0`. No production source, API, database, deploy or workflow mutation was authorized or made by this reviewer.

## Verdict

**The expanded full-coverage components now represent the major production capability groups, but final interaction parity is not yet proven.** All four variants are coherent proposals for secondary navigation and share the real `DashboardShell` React component. Their content fidelity depends on common `SettingsPane`. During this review the team added full Operating Hours, SLA, WhatsApp and Service Status editors and split the Shift Presence model/map/dialog into focused modules. The remaining acceptance questions concern retained drafts, privacy wording and refreshed browser checks on this integrated source.

The previously captured visual QA (`evidence/qa/INDEPENDENT_QA_REPORT.md`) predates the expanded Shift Presence/WhatsApp/Service components. It reports 64/64 normal-width shell geometry cases and 48/48 earlier interaction probes. Those are useful baseline observations, **not** evidence that new controls or zone dialogs have passed the same matrix.

## Four designs, compared

| Variant | Organization and navigation | Main strength | Main tradeoff at narrow widths |
| --- | --- | --- | --- |
| **A — Classic Focused** | Plain five-item local rail beneath organization/location summary; single content pane | Simplest mental model and active item; predictable scan order | Local rail remains fully stacked; first form row measured at **Y=1063px** at 390px width |
| **B — Grouped Enterprise** | Collapsible Company/Location/Information groups; mobile menu chooser; breadcrumb | Fastest form access at 320/390/768px; clear hierarchy for many settings | One extra tap to open mobile navigation; collapsing the active group hides its selected menu item |
| **C — Context First** | Prominent company-to-location inheritance diagram, guidance, then local navigation | Best explanation of how company defaults and overrides relate | Content repetition and vertical stacking: first setting **Y=1670px** at 390px; **Y=1769px** at 320px |
| **D — Compact Workspace** | Narrow grouped rail, concise pane header, scope footer | Best desktop density; wide content area for forms/maps | Fully stacked mobile rail: first setting **Y=1157px** at 390px |

These are measured positions from the prior screenshot QA (`evidence/qa/layout-results.json`, 900px-high viewport, EN/light, Company Admin/Company Defaults). At 1440px first-row positions were A 517, B 489, C 865 and D 533px. All variants keep only one selected content pane and filter their local navigation through the same eligible-sections catalog. B is the most practical starting point for mobile use; C's context idea is valuable but too tall for routine editing.

## Production coverage matrix

| Production capability | Independent source finding | Follow-up |
| --- | --- | --- |
| Company ordinary settings | All **15** `settingDefinitions` catalog keys represented with per-row Save/Help and typed editors | Preserve production validation (notably raw GPS retention >=1 and money <=3 decimals); confirm final browser behavior |
| Company Admin Location overrides | All 15 ordinary fields, effective/source preview and explicit inherited-vs-false values | Show saved default, override and effective distinctly from unsaved draft |
| Location Manager scope | Restricted to production's first **10** legacy keys, with no Company/Service/WhatsApp panel | Keep enforcement upstream; local visibility is demonstration only |
| Operating Hours | New `OperatingHoursFull.tsx`: 7 ordered OPEN/CLOSED days with HH:mm open/close fields, same-day validation, nullable schedule, Company/Location clear and inherit, Help, dirty reporting | App now owns Company/Location schedule snapshots per scenario; verify runtime persistence and inherit flow |
| Location-only SLA | New `SlaFull.tsx`: nullable whole integer 30–3600, saved/effective display, per-setting Help and Save/Clear, dirty reporting | App now owns per-scenario saved SLA; verify invalid value/focus and scope lifecycle |
| Shift Presence | Full five subviews now use production `ShiftPresenceMapFirstLayout`: overview/map, attendance zones, Start/End policy, exceptions, guided setup. Zone editor includes map click, manual coordinates/radius, one-time `Use My Current Location`, save/edit, enable/disable | Revalidate after the source split; exercise strict policy, role capability, dialog focus, Escape and zone validation |
| WhatsApp Guest Access | Integrated `WhatsAppFull.tsx`: enabled, language, approved catalog, sender binding, inheritance, independent Save, simulated 409, explicit global-send gate. Matches backend requirement that an enabled policy have valid template/provider/language | Retain distinct saved Company/Location snapshots when navigating away/back; current component resets from static sample on scope switch |
| Service Status | Integrated `ServiceStatusFull.tsx`: OCR/Push/Payment read-only cards, filters/search and mock Refresh | Correctly keeps unknown/not-queried state and no editable provider controls; test filtering and refresh |
| Optional overview | Navigation summary only, no fabricated operational statistics | Valid Phase A addition; ensure no unauthorized sections are linked |

Canonical comparison: production `settings-page.tsx`, `operating-hours-editor.tsx`, `whatsapp-settings-panel.tsx`, `service-status-panel.tsx`, `shift-presence-map-first-layout.tsx`; inventory in `shared/fixtures/INVENTORY.md`.

## Required interaction and state issues

1. **Preserve WhatsApp saves across section/scope navigation.** Unlike ordinary settings, Hours and SLA, `WhatsAppFull.tsx` owns `saved/draft/serverRevision` inside one component and resets them from static fixtures in an effect keyed by `scope`. A Company WhatsApp policy saved in mock memory can disappear after navigating Company → Location → Company. Lift separate Company/Location saved policy and revision snapshots to App or keep explicit scope-keyed state. Its unsaved state already reports to the global navigation guard; retain that behavior.
2. **Dirty guard now covers more of the editor set.** The integrated `OperatingHoursFull`, `SlaFull`, `WhatsAppFull` and ZoneDialog report dirty state to `App.tsx`, alongside ordinary/presence drafts. Verify a rejected navigation leaves these drafts intact, an accepted discard really resets them, and scope switching never silently presents another scope's data. Presence's internal Company/Location policy scope switch still directly calls `setScope` even when policy draft is dirty; it retains the draft in App but does not show the requested scope-switch confirmation.
3. **Geolocation privacy wording resolved during review.** Earlier copy falsely promised no transmission until simulated Save even though an optional Google map pans to a proposed point. The updated `shift-presence-zone-dialog.tsx` now discloses that Google may receive the viewed center and explicitly distinguishes this from a VAYLET API request or continuous tracking. Browser permission denial and manual-coordinate fallback remain implemented. Verify the new wording is visible in EN/AR.
4. **Geographic map fidelity is conditional.** Without a dedicated Vite Maps key the visible map is an explicitly illustrative coordinate grid. This does demonstrate picking a center/radius and saved-zone overlays, but does not reproduce the real geographic basemap. Do not describe an offline-only run as proof of Google Maps visual parity.
5. **Focus and mobile efficiency differ.** B and D focus their pane heading when the section changes; A leaves focus in local navigation and announces the changed section in a live region; C uses a polite live heading. For A/C, manually verify a screen-reader user can immediately find the updated pane. C repeats page and section headings, making the edit form difficult to reach on mobile.
6. **Normalize forbidden-section URLs.** `App.tsx` computes an authorized `selected` fallback but leaves `route.section` and the browser URL unchanged. A Location Manager deep-linking to `?section=company` can see Overview while the address still says Company. The scenario chooser likewise sends the read-only LM scenario to Company, then silently renders Overview. Replace the inaccessible section in URL/state with the first eligible section (without adding a spurious history entry), including on initial load and permission change.
7. **Keep Option B's ARIA target mounted when collapsed.** `OptionB.tsx` sets `aria-controls` on each group header, but conditionally unmounts the associated `ul`. Use a persistent controlled element with `hidden`/CSS visibility, or update ARIA linking to match the DOM. All four variants also repeat the selected section heading in their outer layout and in `SettingsPane`; removing one layer would improve vertical space without deleting the section Help control.

## Shell, authority, data and accessibility

- `ProductionDashboardShell.tsx` imports the actual `DashboardShell`, registrations, locale dictionaries and theme provider. The role-filtered navigation and clearly visible synthetic banner preserve the broad shell geometry. Original baseline pixel comparisons include known contaminated/failed logo loads; do not make an exact-pixel claim at 1440 from those regions.
- Real company and location labels here are **sample fixtures** (`Acme Valet`, `Main Garage`), not authenticated tenant reads. `sampleServices.status`, readiness and exception data remain null/unknown; saved zones are explicitly in browser memory. Denied scenario has no Policies control/body. The shell still displays sample scope labels even when denied; that is synthetic UI context, not evidence of real access, but could be hidden for a clearer denial simulation.
- Production authority remains backend/session/MFA and exact Location authorization. A navigational button or simulated capability toggle grants no real permission. The additional location-manager read-only-presence scenario now disables zone/policy controls; verify it does not expose exception review actions.
- Earlier browser QA found no new horizontal document overflow at 100% and no unnamed visible controls in 32 DOM samples; it did **not** run NVDA/VoiceOver, full contrast, or independent 200% browser zoom. The original reference also overflows at script-driven CSS 160%/200% zoom, leaving actual WCAG reflow acceptance unproven.
- No production API call is intentionally present in the prototype interaction fixtures. Optional Google Maps loader and user-triggered browser geolocation must be reviewed separately from the zero-VAYLET-API claim.

## Verification status

- Source inspection covered A/B/C/D TSX, shared shell, catalog, settings components, production Policies panels, original visual screenshots and existing QA evidence.
- `pnpm --dir prototypes/issue-321 typecheck`: **PASS (exit 0)** on 2026-10-23 after the full-editor integration and scenario-keyed Hours/SLA wiring. A fresh browser interaction suite on the final component versions is still required.
- A focused `evidence/full-coverage-qa/persistence-regression.spec.ts` was added during the review (by another worker) to exercise zone, Hours, WhatsApp and SLA saves surviving section switches in all four variants. Its existence is not a PASS until the run and results are independently inspected.
- I did not run a fresh interactive browser suite on the post-integration version; old `evidence/qa` results must not be promoted to final acceptance.
- Await fresh four-variant, role/scoped, EN/AR, light/dark, 320/390/768/1440 and 200% checks, plus zone CRUD/geolocation, all complex editors and no-backend-request assertions.

**Phase A recommendation:** Retain A/B/C/D for owner comparison; prefer B for mobile workflow. The large missing control groups have now been implemented in shared preview components and the map privacy copy was corrected. Do not sign off complete feature fidelity until the WhatsApp saved-state lifecycle, URL normalization and post-integration browser checks are resolved.
