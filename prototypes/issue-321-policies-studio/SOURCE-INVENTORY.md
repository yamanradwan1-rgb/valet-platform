# Source inventory and design boundary

Current delivery comparison: `92638c499a1062db3f814687ca3761f235361298`. The earlier design inventory below was collected at `eba55b76916a6892059e45622252b87483f4cb1e`; the final current-schema matrix is in `evidence/settings-parity.json`. The Owner subsequently authorized prototype-only review and push, superseding the earlier no-push instruction. Production integration and design approval remain separate.

Latest Owner amendment: remove Service Status from this isolated prototype. The inventory below retains the production-source research; it does not authorize removing production functionality. Removed section links (including legacy links) fall back to Vehicle operations.

Verified from checkout `eba55b76916a6892059e45622252b87483f4cb1e` on 2026-10-31. All paths below are relative to `D:\kndoom\valet-platform`.

## Authority

The latest attached Owner request supersedes #321's older four-candidate/comparison/commit instructions. Exactly one isolated prototype is authorized. No production integration, Git mutation, PR, deployment or issue closure is authorized.

Read task authority and relevant source: `AGENTS.md`; `docs/00_SOURCE_OF_TRUTH.md`; product scope, engineering/security rules, Definition of Done, project status, Blueprint rebaseline and structure rules. Relevant accepted contracts include DEC-058, DEC-083, DEC-090, DEC-099, DEC-100 and DEC-105, with current controller/projection behavior used to distinguish historical foundation gates from current supported UI.

GitHub issues reviewed live:

- [#321](https://github.com/yamanradwan1-rgb/valet-platform/issues/321): two-level navigation and Phase A design gate; the latest attached request replaces the old four-design deliverable.
- [#278](https://github.com/yamanradwan1-rgb/valet-platform/issues/278): bilingual contextual Help, including per-setting Save adjacency and mobile discoverability.
- [#238](https://github.com/yamanradwan1-rgb/valet-platform/issues/238): read-only Service Status, preserved in this concept.
- [#311 closure](https://github.com/yamanradwan1-rgb/valet-platform/issues/311#issuecomment-6354957959): administrative closure did not approve redesign/relocation or activation.
- [#316](https://github.com/yamanradwan1-rgb/valet-platform/issues/316): separate Privacy & Contact destination, excluded from this feature.
- [#310](https://github.com/yamanradwan1-rgb/valet-platform/issues/310): deferred integration and production OFF; no delivery or activation work here.

The four old candidate source compositions and Vite setup were inspected read-only using `git show design/issue-321-four-react-prototypes:prototypes/issue-321/...`. None was edited, checked out, copied as the new page composition or delivered as a comparison.

## Latest Owner amendment

Remove the search input. Add a current-location button to Attendance zones → Add zone, reusing `use-attendance-zone-location.ts` and its existing bilingual feedback. Only an explicit user click invokes a one-time browser geolocation request; the result updates draft coordinates without saving or deriving a radius. Tests use synthetic positions and do not read a real device location. The underlying map remains an offline illustrative schematic.

## Earlier usability refinement

Owner requested a clearer, easier settings section. The local prototype adds authorized-scope settings search, short bilingual navigation hints, explicit scope explanations, visible Edit labels, direct draft editing of inherited values, optional saved/inheritance detail and inline save feedback. Search targets are validated against the role/scope catalog before URL-driven focus. This changes presentation and local interaction only; no production policy, role, persistence or API authority changes.

## Pre-code classification

| Item                                                                | Classification and prototype consequence                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing policy keys, values, role-specific catalog                 | LOCKED by current typed definitions/controllers and accepted settings decisions                                                             |
| Company default → Location override, explicit false, Clear Override | LOCKED; local fixture projects default/saved/effective separately                                                                           |
| Operating hours informational; SLA Location-only                    | LOCKED; no intake/handoff command effect                                                                                                    |
| Presence Start/End independent; bounded thresholds/zones            | LOCKED; simulation preserves the values and explicit confirmation                                                                           |
| Location Manager presence mutation authority                        | VERIFIED current source: Dashboard LM controllers extend the same protected management controller families; not inferred from Company Admin |
| Read-only presence capability                                       | DERIVED UI demonstration: current UI handles `canEdit=false`; explicitly a capability fixture, not a claim the current API returned it      |
| Topic index and progressive row editor                              | PROPOSED design; reversible and local, awaiting Owner review                                                                                |
| Production implementation                                           | DECISION REQUIRED: separate Owner design approval and Phase B authorization                                                                 |

Affected concepts: Organization defaults, Location overrides, informational schedule, SLA, Shift Presence policy and Attendance Zones, WhatsApp policy and read-only integration projections. No real entity changes. No ValetSession, Task/Dispatch or Shift transitions. No database schema, constraints, indexes, migrations, audit records or provider activation changes. Existing production save contracts remain future integration inputs; local fixture persistence is not an alternate product data model.

## Ordinary catalog

Authoritative inventory: `apps/dashboard/src/features/administration/settings/setting-definitions.ts`, `settings-copy.ts`, `company-settings-panel.tsx`, `management-location-settings-panel.tsx`, `location-manager-settings-panel.tsx` and `packages/contracts/src/management-settings.ts`.

| New section              | Existing keys                                                                           | Supported values                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Vehicle operations       | `checkInPhotosRequired`                                                                 | boolean                                                                                  |
| Vehicle operations       | `handoffStandardMethodPolicy`                                                           | `PICKUP_CODE`, `DYNAMIC_QR`, `EITHER`                                                    |
| Vehicle operations       | `ocrAssistEnabled`, `parkingSpotRequired`                                               | boolean; Company Admin management surface only                                           |
| Task tracking            | `trackingEnabled`                                                                       | boolean                                                                                  |
| Task tracking            | `rawGpsRetentionDays`                                                                   | integer 1–2147483647                                                                     |
| Payments & validation    | `valetServiceFee`                                                                       | nonnegative exact money; fixture locations use JOD, at most three decimals               |
| Payments & validation    | `paymentServicePayer`                                                                   | `CUSTOMER`, `VENUE`                                                                      |
| Payments & validation    | `paymentMethodsPolicy`                                                                  | `CASH_ONLY`, `DIGITAL_ONLY`, `CASH_OR_DIGITAL`                                           |
| Payments & validation    | `tipsEnabled`, `validationEnabled`, `releaseRequiresPayment`                            | boolean                                                                                  |
| Language & notifications | `languageDefault`                                                                       | `EN`, `AR`                                                                               |
| Language & notifications | `employeeRetrievalRequestedNotificationEnabled`, `guestVehicleReadyNotificationEnabled` | boolean                                                                                  |
| Hours & SLA              | `operatingHours`                                                                        | ordered Monday–Sunday; CLOSED or OPEN with same-day `opensAt < closesAt`                 |
| Hours & SLA              | `slaTargetSeconds`                                                                      | Location-only integer 30–3600; clear means no configured target, not Company inheritance |

The Location Manager ordinary catalog is exactly `legacyLocationKeys`: the ten existing photo/handoff/tracking/retention/payment policy keys. It does not inherit the additional Company Admin catalog.

## Dedicated settings

| Surface          | Existing fields / source                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift Presence   | `shiftStartPresenceMode`, `shiftEndPresenceMode`: `OFF`, `WARN_ONLY`, `REQUIRE`, `REQUIRE_OR_OVERRIDE`; `shiftPresenceMaxAccuracyMeters`: 1–200; `shiftPresenceMaxFixAgeSeconds`: 1–120. Source: `shift-presence-policy-fields.ts`, contracts and DEC-099/100                                               |
| Attendance zones | Code ≤64, label ≤200, latitude ±90, longitude ±180, radius 5–1000m, ACTIVE/DISABLED. Location-only, no deletion. Source: `packages/contracts/src/shift-presence.ts`, existing zone forms and maps                                                                                                           |
| WhatsApp         | Enabled policy, ar/en language, approved template catalog version, provider binding. Nullable Location values inherit. One policy save; no approved assets fabricated. Source: `whatsapp-settings-panel.tsx`, `whatsapp-settings-api.ts`, `apps/api/src/modules/notifications/whatsapp-settings-service.ts` |
| Service Status   | `PLATE_OCR`, `STAFF_PUSH`, `DIGITAL_PAYMENT`. Existing controlled statuses: DISABLED, UNAVAILABLE, MISCONFIGURED, DEGRADED, OPERATIONAL, UNKNOWN. This fixture uses DISABLED for all three and labels the data synthetic. Source: `features/administration/commercial/service-status-panel.tsx`             |

Presence authority was traced through `apps/api/src/modules/dashboard/dashboard-presence.controller.ts`, the shared `presence-location-*` controller bases, `presence-management-authority.ts` and `presence-management-projection.ts`. Real current-session, exact-role, persisted tenant/location/access, entitlement and MFA checks are not replaced or proven by the local role picker.

## Help and shell

Existing ordinary/presence/schedule/SLA/service Help is imported directly from `features/help/context-help.tsx` and its registry. Dialog focus/trap/dismissal is imported from `components/presentation/focus-dialog.tsx`. WhatsApp's prototype explanation is authored separately and describes only the existing four-field policy and separate activation gates; it is not represented as previously approved production copy.

Shell sources: `components/shell/`, `components/foundation/header-preferences.tsx`, `components/foundation/dashboard-shell-labels.ts`, `lib/navigation/dashboard-navigation.ts`, `features/administration/administration-navigation.ts`, `app/globals.css` and its style imports. New feature styles never target the global sidebar/topbar/content geometry.

## Evidence scope

Source review establishes the inventory and existing UI/controller contracts. Browser fixtures establish only the new local prototype interactions and layout. No authenticated production screenshot, real authorization response, physical device, provider, database transaction, remote CI, production deployment or Owner-approval evidence is claimed.
