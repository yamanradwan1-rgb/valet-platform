# Issue #321 — authoritative Policies & Settings inventory (Phase A)

Baseline worktree: `20998a069eb5d576895c0e6c149271a4a0e4028b`, branch
`design/issue-321-four-react-prototypes`. This is a **source-derived inventory**,
not a proposal to expand the product. The adjacent TypeScript files contain only
synthetic example values; none came from an API or tenant.

## Existing entry, view composition and section scope

Source: `apps/dashboard/src/app/policies/page.tsx` (15 lines) and
`apps/dashboard/src/features/administration/settings/settings-page.tsx`
(283 lines). Protected `/policies` uses `DASHBOARD` access. The current tab
row is **Company Defaults**, **Location Overrides**, **Service Status** for
Company Admin. Location Manager receives the Location settings directly, without
that tab row. There is **no production Overview tab** today; #321 allows an
optional read-only navigation overview in prototypes.

| Focused feature | Company Admin, Location selected | Company Admin, no Location selected | Location Manager | Denied role |
| --- | --- | --- | --- | --- |
| Company Defaults: 15 ordinary defaults + Operating Hours | Read, edit, save; Hours clear | Same | Not offered | No access |
| Location Overrides: 15 inherited settings + Operating Hours + Location SLA | Read, set, clear per field | Select Location prompt; no scoped values | Only original 10 inherited settings | No access |
| Shift Presence | Company default policy + selected-Location UI | Company default policy only | Own exact-Location policy/zones/exceptions | No access |
| WhatsApp Guest Access | Existing Company and Location panels inside their respective tabs | Company panel only | No panel in current `settings-page.tsx` | No access |
| Service Status | Read-only OCR, Staff Push, Digital Payment | Read-only same Organization scope | Not offered | No access |
| Optional prototype Overview | Read-only navigation summary, no invented metrics | Same, with missing-Location prompt | Own eligible sections only | Do not reveal settings |

Company Admin maps to persisted `ORG_ADMIN`, requires the accepted session MFA
assurance and fresh step-up for sensitive writes (DEC-078/080). Location Manager
authority remains restricted to currently granted Location. `SUPERVISOR`,
`COMPANY_ADMIN_SUBSCRIPTION`, and unrelated roles do not gain Policies controls
from the local navigation. Frontend visibility is never an authorization grant.

The source has only the three local tabs. It mounts Shift Presence and WhatsApp
*within* Company/Location panels; standalone local navigation labels for those
subjects are Phase A presentation proposals. Avoid implying their existence as
separate production routes or approving a WhatsApp relocation.

## Complete typed setting catalog

The first **15 rows** below are exactly `settingDefinitions`, in current render
order. All fifteen are editable by Company Admin at Company and selected-Location
scope. Location Manager is restricted to the first **ten** via
`legacyLocationKeys`. Every ordinary row has per-setting Help adjacent to Save
and a narrow-layout label-side Help trigger under #278.

| # | Setting key | Editor / allowed values | LM override? | Help key |
| --- | --- | --- | --- | --- |
| 1 | `checkInPhotosRequired` | boolean | Yes | `setting.checkInPhotosRequired` |
| 2 | `handoffStandardMethodPolicy` | `PICKUP_CODE`, `DYNAMIC_QR`, `EITHER` | Yes | `setting.handoffStandardMethodPolicy` |
| 3 | `trackingEnabled` | boolean | Yes | `setting.trackingEnabled` |
| 4 | `rawGpsRetentionDays` | integer ≥1 | Yes | `setting.rawGpsRetentionDays` |
| 5 | `valetServiceFee` | nonnegative decimal string, ≤3 fraction digits | Yes | `setting.valetServiceFee` |
| 6 | `paymentServicePayer` | `CUSTOMER`, `VENUE` | Yes | `setting.paymentServicePayer` |
| 7 | `paymentMethodsPolicy` | `CASH_ONLY`, `DIGITAL_ONLY`, `CASH_OR_DIGITAL` | Yes | `setting.paymentMethodsPolicy` |
| 8 | `tipsEnabled` | boolean | Yes | `setting.tipsEnabled` |
| 9 | `validationEnabled` | boolean | Yes | `setting.validationEnabled` |
| 10 | `releaseRequiresPayment` | boolean | Yes | `setting.releaseRequiresPayment` |
| 11 | `languageDefault` | `EN`, `AR` | No | `setting.languageDefault` |
| 12 | `ocrAssistEnabled` | boolean | No | `setting.ocrAssistEnabled` |
| 13 | `parkingSpotRequired` | boolean | No | `setting.parkingSpotRequired` |
| 14 | `employeeRetrievalRequestedNotificationEnabled` | boolean | No | `setting.employeeRetrievalRequestedNotificationEnabled` |
| 15 | `guestVehicleReadyNotificationEnabled` | boolean | No | `setting.guestVehicleReadyNotificationEnabled` |
| 16 | `operatingHours` | nullable 7-day, Mon→Sun; each `CLOSED` or `OPEN` with `HH:mm` start < end | No | `setting.operatingHours` |
| 17 | `slaTargetSeconds` | Location-only nullable integer 30–3600 | No | `setting.slaTargetSeconds` |

Do not show rows 11–17 as LM editable. Hours are informational; they do not
automatically block check-in/retrieval. SLA has **no Company default**. Location
`timezone` and `currency` are read-only contextual facts in the Management
settings projection; they are not setting rows.

Each Location row shows persisted `default`, `overridePresent`,
`override`, and `effective`; an explicit `false` override is not inheritance.
`Clear Override` returns to Company default and is disabled when already
inherited. Company rows show saved effective/default. Draft changes are not
effective until a successful server save. The real ordinary row editor initializes
local `useState` drafts; tab changes unmount those rows, so Phase A should
explicitly demonstrate the #321 unsaved-edit guard.

## Shift Presence

Current Company policy and Location inheritance each include four **independently
saved** fields:

- `shiftStartPresenceMode`, `shiftEndPresenceMode`: `OFF`, `WARN_ONLY`,
  `REQUIRE`, `REQUIRE_OR_OVERRIDE`.
- `shiftPresenceMaxAccuracyMeters`: integer 1–200.
- `shiftPresenceMaxFixAgeSeconds`: integer 1–120.

Location uses explicit `INHERIT` or `CUSTOM` source choice. Strict-mode
transitions need explicit confirmation and server readiness checks. The current
Location area also has **Overview & map**, **Attendance zones**, **Start/end
policy**, **Exceptions**, **Guided setup** internal views. Zones support
bounded map configuration, and exceptions have Pending/History views and
capability-checked review. No continuous employee location surveillance, no raw
GPS evidence displayed, no made-up zone/exception counts or readiness badge.

Help IDs: `policies.presence`, the four `presence.*` setting IDs,
`presence.readiness`, `presence.zones`, `presence.zoneForm`,
`presence.exceptions`, and `presence.review`. See
`shift-presence-map-first-layout.tsx` and `help-setting-manifest.ts`.

## WhatsApp, Service Status and related issue fences

WhatsApp currently appears inside Company Defaults and (when selected) Location
Overrides **for Company Admin only**. Four policy controls:

1. `enabled`: Company boolean; Location `inherit` / false / true.
2. `language`: Company Arabic/English; Location inherit / Arabic / English.
3. `templateCatalogVersion`: nullable, options only from approved catalog.
4. `providerBindingId`: nullable, options only from known connections.

There is a separate WhatsApp Save with `expectedRevision`; the view also
projects a `companyDefault` and gated `globalSendEnabled` / `activationReady:
false`. **Saving a policy never implies live delivery.** `DEC-105` keeps
real sending disabled pending the accepted external activation gates.
GitHub **#311 was closed as `not_planned`** on 2026-10-23: no redesigned
placement/prototype was Owner-approved and closure is not implementation. Keep
its currently implemented presentation context in Phase A; no Meta connection,
test send, provider editing or fabricated templates.

Service Status is three backend-derived read-only integration statuses:
`PLATE_OCR`, `STAFF_PUSH`, `DIGITAL_PAYMENT`. UI supports Refresh, filters,
search, and status cards; **no Save or provider configuration**. The permitted
status enum includes `DISABLED`, `UNAVAILABLE`, `MISCONFIGURED`,
`DEGRADED`, `OPERATIONAL`, `UNKNOWN`. Prototype fixture status is `null`
because there was no authorized current API read.

`#316` Privacy & Contact lives at independent `/guest-information`, and must
not become a Policies subsection for #321.

## URL and interaction contracts to test

- Existing `/policies?tab=services` opens Service Status for Company Admin;
  `/integrations` redirects there with replace. Phase A may demonstrate a
  canonical `?section=...` and must normalize the legacy URL without changing
  route production files.
- Section URL state survives Back, Forward and Refresh, including AR/RTL and a
  permissions/scope change. One content pane is selected. A URL requesting an
  unauthorized section falls back to the first authorized section.
- Preserve current Organization and exact selected Location, including
  no-location prompt, revalidation, scope-keyed fetch, abort/retry/error handling
  and no cross-scope draft/data leak.
- Ordinary Company/Location writes use `expectedUpdatedAt`; Shift Presence
  uses expected revision / Company revision / configuration fingerprint; WhatsApp
  uses `expectedRevision`. Show conflict, validation, MFA and retry as clearly
  labeled **simulated interactions** if prototyped.
- Save is per setting; do not suggest one global bulk commit. Show Help directly
  adjacent to each corresponding Save, with the same key in mobile label Help.
  A help click never submits, mutates or discards an unsaved draft.
- Guard a dirty edit before a pane or scope switch (clear choice of stay,
  discard or save when simulated). Protect keyboard focus and screen-reader
  section announcement. Keep EN/AR, light/dark, 320/390/768/1440 and 200% zoom.

## Provenance pointers

- `apps/dashboard/src/features/administration/settings/{settings-page,
  setting-definitions,setting-row,company-settings-panel,
  management-location-settings-panel,location-manager-settings-panel,
  operating-hours-editor,sla-setting-row,settings-api,
  shift-presence-*,whatsapp-settings-*}.tsx/ts`
- `apps/dashboard/src/features/administration/commercial/service-status-panel.tsx`
- `apps/dashboard/src/features/help/{help-setting-manifest,help-route-manifest,
  help-section-manifest}.ts`
- `packages/contracts/src/{management-settings,location-configuration,
  shift-presence-policy}.ts`
- Accepted DEC-058, DEC-078, DEC-080, DEC-083, DEC-099, DEC-100, DEC-105;
  GitHub #321, #278, #311, #316 and their closure/acceptance comments.

All sample values, labels carrying “Sample”, draft actions and scenario switches
under `simulated-data.ts` are invented **for prototype-only interaction**.
They must display the notice in both languages and must never call real APIs,
be presented as an authorized current tenant, or report a successful real save.
