# Issue #321 Phase A — source-to-prototype acceptance inventory

Independent read-only source comparison (2026-10-23). Production source under
`apps/dashboard` was inspected without modification. Prototype observations are
for the moving implementation snapshot and require recheck after Prime's edits.
This extends `shared/fixtures/INVENTORY.md`, which is the complete typed catalog.

## Authority and placement matrix

| Feature | Company Admin / Company defaults | Company Admin / selected Location | Location Manager / own Location | Other roles |
| --- | --- | --- | --- | --- |
| Ordinary settings | All 15; Save per row | All 15; Save/Clear per row, default/effective/source | First 10 only; Save/Clear | No Policies controls |
| Operating hours | 7-day nullable editor, Save/Clear | 7-day nullable override, Save/Clear | Not present | None |
| Location SLA | Not present | Nullable integer 30–3600, Save/Clear | Not present | None |
| Shift Presence | Four Company default fields | Four inheritable fields, zones, readiness, exceptions, guided setup | Own Location's four inheritable fields, zones, readiness, exceptions, guided setup, subject to capabilities | None |
| WhatsApp Guest Access | Four policy fields and Save | Four policy fields and Save | Not present in current route composition | None |
| Service Status | Company Admin third local tab, read-only | Same Organization read-only tab | Not present | None |

Sources: `settings-page.tsx:59-279`, `company-settings-panel.tsx`,
`management-location-settings-panel.tsx`, `location-manager-settings-panel.tsx`,
`setting-definitions.ts:12-34`, `shift-presence-settings.tsx:135-260`.
The production route accepts legacy `/policies?tab=services`. A new overview
or separate Shift Presence navigation is presentation-only in #321, not a
currently existing production tab.

## Full ordinary setting set

Production ordering, contract editor, and exact Location Manager restriction:

1. `checkInPhotosRequired` — boolean, LM
2. `handoffStandardMethodPolicy` — PICKUP_CODE / DYNAMIC_QR / EITHER, LM
3. `trackingEnabled` — boolean, LM
4. `rawGpsRetentionDays` — integer, LM
5. `valetServiceFee` — nonnegative decimal money, LM
6. `paymentServicePayer` — CUSTOMER / VENUE, LM
7. `paymentMethodsPolicy` — CASH_ONLY / DIGITAL_ONLY / CASH_OR_DIGITAL, LM
8. `tipsEnabled` — boolean, LM
9. `validationEnabled` — boolean, LM
10. `releaseRequiresPayment` — boolean, LM
11. `languageDefault` — EN / AR, Company Admin
12. `ocrAssistEnabled` — boolean, Company Admin
13. `parkingSpotRequired` — boolean, Company Admin
14. `employeeRetrievalRequestedNotificationEnabled` — boolean, Company Admin
15. `guestVehicleReadyNotificationEnabled` — boolean, Company Admin

Every setting has Help directly near Save, and a mobile label Help. A Location
row distinguishes default, explicit override (including explicit false),
persisted effective and inherited source. Changing a draft does not immediately
make it effective. Clearing an override restores the current Company default.
Writes include `expectedUpdatedAt`, conflict/retry, loading/error, and sensitive
MFA handling. Sources: `setting-row.tsx:19-136`, `settings-api.ts`,
`use-sensitive-mutation.ts`, `help-setting-manifest.ts`.

## Special sections and interaction acceptance

- **Operating hours:** all Monday–Sunday, each CLOSED or OPEN with opensAt and
  closesAt `HH:mm` inputs; allow nullable no-schedule; Save and Clear Override
  and Help. Informational only, no automatic check-in/retrieval block.
  Source: `operating-hours-editor.tsx:13-161`.
- **SLA:** selected-Location Company Admin only; integer 30–3600 or null; Save,
  Clear and Help; no Company default inheritance. Source: `sla-setting-row.tsx`.
- **Shift Presence policy:** start/end modes OFF/WARN_ONLY/REQUIRE/
  REQUIRE_OR_OVERRIDE, max fix accuracy 1–200m, max fix age 1–120s. Independently
  Save per row; Location chooses INHERIT versus CUSTOM; strict activation needs
  explicit confirmation and authoritative readiness. Source:
  `shift-presence-policy-fields.ts`, `shift-presence-policy.tsx`.
- **Shift Presence workspace:** Overview & map combines saved zones map and
  readiness; internal views Attendance zones, Start/end policy, Exceptions,
  Guided setup (Scope → Zones → Policy → Review). Readiness comprises server
  applicability, usability, blockers, strict activation, active zones, both
  revisions and observed time. No fabricated real readiness.
  Source: `shift-presence-map-first-layout.tsx:26-122`,
  `shift-presence-location-orchestration.tsx`, `shift-presence-readiness.tsx`.
- **Attendance zones:** selected Location, not Company-wide coordinates.
  Map click/edit pin/circle; labeled zone, unique editable code, latitude
  -90..90, longitude -180..180, radius 5–1000m and ACTIVE/DISABLED state.
  Add/Edit/Enable/Disable, read/refresh/retry, revision-aware mutation, list
  pagination. Use My Current Location is explicitly requested **once** in
  foreground: secure context + permission, high accuracy, no cached fix,
  10-second timeout, accuracy feedback; only proposes lat/lng. Never guesses
  radius or automatically saves/sends GPS. Label suggests a transliterated
  uppercase Code until the operator edits Code manually. Manual coordinate and map picking
  cancel stale geolocation responses. Sources: `shift-presence-zone-form.tsx`,
  `shift-presence-zone-code.ts`,
  `use-attendance-zone-location.ts`, `attendance-zone-map.tsx`,
  `attendance-zones-overview-map.tsx`, `shift-presence-zones.tsx`.
- **Exceptions:** Pending and History, Refresh, pagination, requester,
  Start/End action, reason, requested/expiry time, status. Details and
  Approve/Reject in modal only when fresh, pending, unexpired and `canReview`;
  review never initiates a shift. Preserve canEdit/canReview capability
  distinctions. Source: `shift-presence-exceptions.tsx`,
  `shift-presence-review-dialog.tsx`, `shift-presence-settings.tsx:220-249`.
- **WhatsApp:** Company panel and selected-Location panel for Company Admin.
  Fields: enabled (Location inherit/false/true), language (inherit/ar/en),
  approved template catalog version or null, verified/pending sender binding
  or null. One panel Save with `expectedRevision`. Show Company default and
  no real sending (`globalSendEnabled` and `activationReady=false`).
  Source: `whatsapp-settings-panel.tsx:63-125`,
  `whatsapp-settings-api.ts:5-81`.
- **Service Status:** read-only PLATE_OCR, STAFF_PUSH, DIGITAL_PAYMENT, each
  status enum DISABLED/UNAVAILABLE/MISCONFIGURED/DEGRADED/OPERATIONAL/UNKNOWN;
  Refresh, All/per-service chips, search by label/key/status, empty/error/loading
  state and Help. No provider mutation. Source:
  `service-status-panel.tsx:20-202`.

## Prototype fidelity findings from the inspection snapshot

| Priority | Prototype code | Gap / acceptance correction |
| --- | --- | --- |
| P1 | `shared/components/SpecialSections.tsx:76-87` | WhatsApp only facts; add all four scoped controls, standalone Save, disabled delivery notice and inheritance |
| P1 | `SpecialSections.tsx:89-109` | Hours checkbox-only mock; add open/close time inputs for each day, Save and Clear; include its draft in unsaved guard |
| P1 | `SpecialSections.tsx:61-74` | Service Status cards lack Refresh, filter chips, search and empty/retry interactions |
| P1 | `shared/components/SettingRows.tsx:51,55,75-78` | Location effective/source currently follows unsaved draft and Company default label uses static sample, not saved Company value; separate persisted effective from proposed draft |
| P1 | `shared/components/SettingsPane.tsx:36-37` | SLA local state is not registered with app-wide unsaved-edit guard; preserve simulated saved state across navigation |
| P1 | `ShiftPresenceFull.tsx` | Zones saved only in component-local state and can disappear on section unmount; preserve simulated state across section changes; capability-denied scenarios now being added by Prime |
| P2 | `ShiftPresenceFull.tsx` | Exceptions only empty Pending/History views, no optional synthetic review/detail interaction; zone list lacks paging/refresh and conflict scenario |
| Covered / recheck | `ShiftPresenceFull.tsx` | Has Overview/map, Add/Edit zone, coordinate/radius/state editing, enable/disable, clickable illustrative fallback, optional real Google map, Use My Current Location and permission/error behavior. Verify discovery and safe foreground cancellation after integration |
| Covered / recheck | `SettingRows.tsx`, `SettingsPane.tsx` | All 15 CA ordinary keys, 10 LM keys, per-row Save/Clear/Help, Location SLA field, localized labels |

Cross-cutting acceptance: selected Organization and exact Location; no-location
prompt; no role escalation; no simulated edit/Help mutation on click;
scope-keyed state and dirty navigation guard; original Production Dashboard shell;
EN/AR RTL/LTR, light/dark, keyboard/focus, 320/390/768/1440 and 200% zoom.
Prototype data must remain visibly labeled synthetic with zero backend/API,
real messaging, deployment, migration or production changes.
