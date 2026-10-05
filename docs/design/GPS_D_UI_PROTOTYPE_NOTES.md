# GPS-D Shift Presence composition spike

Status: **Variant A owner-selected for GPS-D production reference (2026-10-05).**

The owner froze Variant A: Readiness → Policy → Attendance Zones → Presence
Exceptions, in one subsection of existing Policies & Settings. Company uses the
reduced four-default form; CA and LM share the exact-Location composition.
No new page/tab/sidebar or rejected variant composition is authorized. The HTML
remains a visual reference only; production reuses existing Dashboard patterns.
Issue #266's optional explicit one-shot draft-center action is accepted and is
now synchronized narrowly into canonical UI-G. Strict rollout remains closed.

## Baseline and scope

- Fetched `origin/main` before editing on 2026-10-05. Actual base: **de617b363d3c2c9325cebde35137f419bec76eb7**.
- Branch: `design/257-gps-d-ui-freeze`, created from that fetched base; the initial working tree was clean.
- Only task artifacts: `docs/design/gps-d-shift-presence-prototypes.html` and this document.
- Production source changed: **NO**. API/server/contracts/database/Native/Employee Web/dependencies/lockfiles/routes/migrations changed: **NO**.
- Canonical plan and Issue #266 changed: **NO**. No implementation, issue closure, PR or merge is part of this spike.

The owner requested four alternative compositions of one embedded Shift Presence subsection, with the complete exact-Location surface as the selection target. Company defaults are the reduced form of the same subsection. CA and LM use the same Location composer. The design controls sit outside the simulated Dashboard.

## Binding contracts and decision lock

Reviewed the canonical `docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`, particularly UI-B/C/D/E/F/H/I/J/K/L/M/N and GPS-D, together with:

- `docs/decisions/DEC-099_SHIFT_PRESENCE_FOUNDATION.md`
- `docs/decisions/DEC-100_SHIFT_PRESENCE_EXCEPTION_AUTHORITY.md`
- `docs/validation/GPS_B_IMPLEMENTATION_REPORT.md`
- `docs/validation/GPS_C_IMPLEMENTATION_REPORT.md`
- `docs/validation/GPS_B_PUBLIC_CONTRACT.md`
- `AGENTS.md`, `CONTRIBUTING.md`, `docs/13_COLLABORATION_WORKFLOW.md` and `docs/17_AGENT_CODE_STRUCTURE_RULES.md`
- Relevant scope/security/Blueprint material in `docs/01_PRODUCT_SCOPE.md`, `docs/06_SECURITY_AND_DATA_RULES.md` and `docs/15_BLUEPRINT_V1_REBASELINE.md`.

Read GitHub [Issue #266](https://github.com/veletpro0-lgtm/valet-platform/issues/266), “GPS-D UX — Optional ‘Use my current location’ when creating Attendance Zones.” Its owner-approved optional draft acquisition is the narrow override of the older canonical prohibition on requesting manager geolocation. The prototype represents the addition without changing the canonical plan. Synchronize that contract only after the owner selects the design, as requested.

GPS-B/C evidence does not establish GPS-D production readiness or permit strict activation. All four modes can be inspected; attempting a strict mode Save displays the release-block message. Current-policy Ready and strict-activation eligibility are separate statements. Both Off displays Not applicable, never proof that strict activation is safe.

Affected entities in the illustration: Company/Location presence policy, AttendanceZone, ShiftPresenceExceptionRequest, staff identity and the read-only readiness projection. ValetSession transitions: **none**. Task/Dispatch transitions: **none**. Manager approval changes only the illustrated exception decision; the employee must explicitly continue Start/End Shift. No Shift or cash mutation is simulated.

Authority follows the accepted exact-Location CA/LM boundary. Company mode exposes four defaults only, with no zones, exception queue or Clear Override. No Supervisor or self-approval flow is introduced. These fixtures are presentation demonstrations; they do not constitute authorization evidence. Tenant/location authorization, CAS, database constraints, transactions, receipts and audit remain server responsibilities. No DB schema, indexes or configuration contract changes are proposed here. Company default → Location override remains per field; explicit Off is shown as an override.

## Source register: exact Dashboard files inspected

Paths below are relative to the repository root. No settings-local `*.module.css` exists at this base; Settings imports the administration styles listed here.

**Existing Settings and administration composition**

```text
apps/dashboard/src/features/administration/settings/settings-page.tsx
apps/dashboard/src/features/administration/settings/company-settings-panel.tsx
apps/dashboard/src/features/administration/settings/management-location-settings-panel.tsx
apps/dashboard/src/features/administration/settings/location-manager-settings-panel.tsx
apps/dashboard/src/features/administration/settings/setting-row.tsx
apps/dashboard/src/features/administration/settings/setting-definitions.ts
apps/dashboard/src/features/administration/settings/settings-copy.ts
apps/dashboard/src/features/administration/settings/operating-hours-editor.tsx
apps/dashboard/src/features/administration/settings/sla-setting-row.tsx
apps/dashboard/src/features/administration/administration-ui.tsx
apps/dashboard/src/features/administration/reference-administration-page.tsx
apps/dashboard/src/features/administration/administration-tabs.tsx
apps/dashboard/src/features/administration/administration-copy.ts
apps/dashboard/src/features/administration/administration.module.css
apps/dashboard/src/features/administration/reference-administration.module.css
apps/dashboard/src/features/administration/commercial/service-status-panel.tsx
apps/dashboard/src/features/administration/locations/locations-page.tsx
apps/dashboard/src/features/administration/locations/location-lifecycle-facts.tsx
apps/dashboard/src/features/administration/locations/locations-reference.module.css
```

**Shell, tokens, navigation and identity**

```text
apps/dashboard/src/app/globals.css
apps/dashboard/src/styles/foundation.css
apps/dashboard/src/styles/shell.css
apps/dashboard/src/styles/shell-controls.css
apps/dashboard/src/components/brand/vaylet-logo.tsx
apps/dashboard/src/components/shell/sidebar.tsx
apps/dashboard/src/components/shell/topbar.tsx
apps/dashboard/src/components/shell/navigation-list.tsx
apps/dashboard/src/components/foundation/selected-management-shell.tsx
apps/dashboard/src/components/foundation/header-preferences.tsx
apps/dashboard/src/lib/navigation/product-navigation-order.ts
apps/dashboard/src/features/administration/administration-navigation.ts
apps/dashboard/src/features/operations/operations-navigation.ts
apps/dashboard/src/features/intelligence/intelligence-navigation.ts
apps/dashboard/src/features/visit-contacts/visit-contact-navigation.ts
apps/dashboard/src/features/audit/audit-navigation.ts
apps/dashboard/src/features/intelligence/reports-reference-icons.ts
```

**Dialog/form/MFA precedents — visual language and focus only**

```text
apps/dashboard/src/features/administration/sensitive-mfa-dialog.tsx
apps/dashboard/src/components/presentation/focus-dialog.tsx
apps/dashboard/src/components/security/mfa-ceremonies.tsx
apps/dashboard/src/lib/i18n/dictionaries.ts
apps/dashboard/src/features/operations/maps/map-setup-dialog.tsx
apps/dashboard/src/features/operations/maps/point-editor-dialog.tsx
apps/dashboard/src/features/operations/maps/maps-reference.module.css
apps/dashboard/src/features/operations/operations-ui.tsx
apps/dashboard/src/features/operations/operations.module.css
```

Existing PNG bytes from `apps/dashboard/public/vaylet-emblem.png` and `apps/dashboard/public/vaylet-text-white.png` are embedded as data URLs. Existing Lucide glyph geometry and the Reports glyph are embedded as SVG paths. This avoids remote assets and preserves the current shell identity. The HTML runtime uses no React or installed dependency.

## Composition precedents recorded for the variants

The initial composition choices were based on these inspected precedents, before building the artifact. The final source audit corrected D to the **actually used** Locations grid rather than the unused administration `masterDetail` declaration.

| Variant | Ordering / spatial difference                                                 | Existing used precedent                                                                                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A       | Compact readiness → four policy rows → Zones → Exceptions                     | Settings panels and `SettingRow`: conservative three-column rows inside the existing card.                                                                                                                                                                      |
| B       | Three-value readiness facts strip → Zones → four policy rows → Exceptions     | `LocationLifecycleFacts` renders `facts/fact/factValue/factLabel`; existing administration sections use toolbar + table/list composition. Only the flat facts strip is reused, without its nested cards.                                                        |
| C       | Compact readiness → Exceptions → four policy rows → Zones                     | The existing administration toolbar/list flow and Settings row/table pattern, with the exception review queue moved earlier. No new interaction pattern is invented.                                                                                            |
| D       | Readiness beside policy on desktop → Zones → Exceptions; stacked below 1023px | `locations-page.tsx` uses the `locations-reference.module.css` twelve-column grid, with four-column master and eight-column detail. That exact ratio/gap/stacking breakpoint supplies the new feature-local composition. No cards are inserted inside Settings. |

All four variants use the same functions, synthetic fixtures, controls, validation, dialogs and recovery behavior. Only order/readiness grouping/spatial hierarchy change. Variant switching resets to the same fixtures for comparison. Company mode uses the same four-row reduced form across variants. There is no additional route, navigation item, Settings tab, accordion, bulk Save or zone Delete.

## Visual-source audit

The CSS template carries source comments for copied rules. CSS-module `:global(...)` wrappers are expanded for standalone selectors; only the Operations form selectors are scoped under `.mapDialog` to preserve Settings input treatment. The outer design toolbar has its own separate stylesheet.

| Convention         | Actual current source values reused                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light palette      | Background `#f4f7fb`, surface `#ffffff`, soft `#f8fafc`, text `#101828`, muted `#667085`, border `#e2e8f0`, accent `#1e60f0`.                                                                                                                       |
| Dark palette       | Background `#081020`, surface `#0d152f`, soft `#131e3d`, text `#f8fafc`, muted `#94a3b8`, border `#1e293b`; accent remains `#1e60f0`.                                                                                                               |
| Sidebar/focus      | Sidebar `#0b132b`, soft `#131e3d`, border `#172346`, focus `#69a1ff`. Same source theme status colors.                                                                                                                                              |
| Typography         | `Inter, "Segoe UI", Tahoma, Arial, sans-serif`; 24px/700 title with reference 32px line height; 14px subtitle with 20px reference line height; 12px table and button text; reference table line height 16px. No remote font added.                  |
| Shell              | 260px expanded sidebar; 64px topbar; 32px content padding / 20px narrow; existing 820px shell breakpoint and mobile controls.                                                                                                                       |
| Outer card         | 12px radius, source border and `0 1px 2px rgba(15,23,42,.04)` shadow; existing title/subtitle/tabs and legacy rows retained.                                                                                                                        |
| Settings buttons   | 36px minimum height; 8px radius; `.45rem .8rem` padding; 12px/700; unchanged source primary/secondary/disabled/focus rules.                                                                                                                         |
| Settings inputs    | 40px minimum height; `.55rem` radius; `.55rem .7rem` padding; `.78rem` font; soft surface, source border and native select treatment.                                                                                                               |
| Table              | Header `.875rem 1.5rem`, cell `1rem 1.5rem`; current reference header/dark borders; 42rem minimum width; setting-label column 44%, editor minimum 13rem; actions aligned to logical end. Overflow belongs to the existing table region.             |
| Tabs/facts         | Existing `referenceTabs/referenceTab` and `filterChip` styles; existing facts separators/spacing and 700px facts stacking. Pending/History are subsection filters, not new Settings tabs.                                                           |
| Zone/review dialog | Maps visual shell: 448px maximum width, 12px radius, existing shadow/backdrop; header `1rem 1.5rem`, body `1.25rem 1.5rem`, footer `.875rem 1.5rem`; footer buttons 14px/500 and 8px radius. Form grid uses the existing 640px stacking breakpoint. |
| Sensitive MFA      | Existing FocusDialog backdrop and 520px/16px-radius/20px-padding panel, administration dialog title/subtitle and TotpForm field/button treatment.                                                                                                   |

Feature-local additions use these values: a subsection separator, existing section padding, D's used grid, a private mock-map frame, safe fact definitions and error associations. The richer zone form uses a bounded flex dialog so its body scrolls while header/footer stay reachable; this is a prototype adaptation documented below, not a change to any production dialog.

## Interactive review instructions

Open `gps-d-shift-presence-prototypes.html` directly in a browser. No server, build, network, SDK or real geolocation permission is needed. A same-origin `srcdoc` iframe supplies a real 1440×900 or 480×900 canvas, so the source media queries see the selected width.

The initial view scrolls the existing Settings content to the added subsection. **Page top** shows the retained shell, title/subtitle, three existing Settings tabs and existing rows. **Shift Presence** returns to the added section. Scroll within the canvas to reach the whole interface. All preview controls and scenario selectors are outside the canvas.

Use **Failure / context previews** for readiness, next-mutation outcome, exact receipt versus unattributed state/read failure, device permission result, map failure, lists and Company/CA/LM context. Changing variant/theme/locale/viewport/context resets the draft and fixtures. Failure result selectors can change during a dialog without dismissing it. Reset returns to the currently selected preview fixture.

The synthetic Location is Main Garage in Asia/Amman, with two zones, four pending requests covering all controlled reasons, and four history records covering Approved/Rejected/Expired/Consumed. Date/time fixtures are fixed at 2026-10-05; they do not run a production expiry clock. Names are illustrative real-name forms; emails use `example.test`.

Demonstrated behavior:

- Four independent policy saves/clears, inherited/default/effective/source text, explicit Off override, numeric bounds/integer errors and strict-release blocking.
- Readiness Ready/Not ready/Not applicable/Loading/Error, safe reasons/count, Refresh/Retry and independent strict-release text. A mock server projection is explicitly separate from rendering; drawing a pin never authorizes readiness.
- Zones Add/Edit/Enable/Disable/Refresh and safe list facts; no Delete. Add has blank center/radius and a neutral state prompt. Coordinates zero and decimal radius are valid.
- Geographic mock with north up, one draft center pin and one valid radius circle; pan/zoom/tap and manual fields share a draft. Its synthetic streets are clearly labeled as a mock, never presented as loaded Google Maps.
- Issue #266: optional locating → resolved ±12m, denied and unavailable paths; center updates without changing radius or saving. EN/AR first-setup phone-on-location hint; manual fields remain usable. No device-coordinate history, telemetry, logging or storage.
- Pending/History and safe employee/action/Location/reason/time/status facts; review without notes or employee GPS evidence. Approval requires the employee's separate continuation.
- Nonoptimistic submission, six-digit simulated MFA step, current-context refresh and explicit resubmission after assurance.
- Conflict old/current/draft comparison with explicit adoption/reapply. Review decisions changed by another manager cannot be overwritten through reapply.
- Unknown outcome retained after dialog dismissal, duplicate mutation blocking, explicit exact-result reconciliation, unattributed canonical refresh and read failure. State equality is not commit proof; repeated result lookup does not create a second zone.
- Dialog keyboard trap, first-invalid-field focus, topmost Escape and opener/section focus restoration. Shell is inert during dialogs; map and manual field geometry remain LTR in Arabic.

## Verification and evidence limits

Headless Chromium using the repository's already-installed Playwright tooling verified all **32** combinations (four variants × two themes × two locales × two widths) and their Add Zone dialogs. Checks covered viewport dimensions, no document-level horizontal overflow, modal/footer bounds, RTL/LTR fields/map, unchanged initial fixtures, identical frozen Settings markup and computed styles across all four variants, and focus restoration. Captures were generated for the 32 surfaces and 32 dialogs outside the repository.

Separate interaction checks exercise the same flows in each variant: independent Save/Clear, validation and strict gating; #266 with unchanged radius/no autosave; manual/map synchronization and unavailable-map save; CAS comparison/adoption/reapply; unknown result after dismissal with failed/unattributed/confirmed reconciliation; no duplicate create; pending/history, approval/rejection, MFA without automatic approval; keyboard trap/restoration; reduced Company and shared LM Location surface. Runtime checks observe no browser errors or outgoing HTTP requests.

`pnpm architecture:check` reports a **pre-existing baseline violation**: `packages/employee-client/src/employee-shift-presence-local-provenance.test.ts: window violates portable Employee client global boundary`. A clean detached checkout at the fetched base reproduces the same failure. The test's working-tree Git blob matches the base (`6b3b41dd82446e9bb6a4f8a60d52b5743da013b4`). No production fix is included in this strictly design-only task. This is not a green repository-wide gate or production-readiness claim.

### Standalone parity limitations

1. This is source-derived HTML, not the actual React component tree. CSS-module scope is translated; real provider state, React lifecycle, transport, authority guards, live receipts and SDK behavior are not executed. Future GPS-D must reuse the actual components and shared contracts.
2. The same native font stack is retained; installed fonts/browser rasterization may differ. No live authenticated Dashboard screenshot comparison establishes pixel identity. **100% parity is not claimed.** The matrix proves invariant surrounding HTML/styles across variants, not production pixel equivalence.
3. Navigation, organization/location pickers, Sign out, Service Status and legacy setting mutations are static context. Their visual treatment is preserved; their production behavior is not implemented. Company/Location switches and theme/locale previews reset fixtures.
4. The map is a local schematic geographic mock. Its projection/scale/street positions are illustrative; it is not survey data or a production evaluator. Google Maps Platform remains the future accepted provider. Device location and accuracy are synthetic; any six digits complete the simulated MFA step and have no authentication meaning.
5. Rich dialogs add viewport-bounded body scrolling using the existing header/body/footer geometry. There is no production CSS change. Real browser zoom, physical phone behavior, permission APIs, MFA enrollment/error states, authoritative pagination and all server race schedules still require GPS-D implementation evidence.
6. Synthetic result delays and revision changes illustrate states only. No API contract implementation, real CAS/idempotency/security guarantee, strict-rollout unlock or employee physical proof follows from this spike.

The single self-contained documentation artifact is expressly requested by the owner. Documentation is outside the authored-code extension/300-line gate; no production or repository tooling file grows. Temporary browser checks/captures/generation helpers remain outside the repository. The later implementation must split feature-owned production files under the actual structure rules.

## Owner handoff

The owner selected Variant A and authorized GPS-D production implementation. The canonical plan now freezes that composition and the narrow optional #266 draft-location behavior. Existing rollout, server authority, security, audit and physical evidence gates remain binding.
