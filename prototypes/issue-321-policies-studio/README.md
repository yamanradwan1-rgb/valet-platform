# VAYLET Policies & Settings — Issue #321 prototype

One interactive React + TypeScript design prototype. This directory is isolated from production applications and the rejected `prototypes/issue-321/` candidates. It imports the real Dashboard shell, navigation, assets, locale/theme controls, buttons and contextual Help.

The Owner authorized completeness review and a prototype-only branch push after the design iterations. This does not approve Phase B integration, a PR, merge, deployment or Issue closure.

## Run

From the repository root, with the normal repository dependencies installed:

```powershell
Set-Location prototypes/issue-321-policies-studio
npm run dev
```

Open **http://127.0.0.1:4321/policies**. If repository dependencies are missing, install them at the repository root using its checked-in pnpm lockfile before starting.

The scripts discover the containing checkout. In a linked worktree they can reuse installed dependencies from the primary checkout. `VAYLET_DEPENDENCIES_ROOT` explicitly selects that dependency checkout; `VAYLET_REPO` explicitly selects a source checkout. The prototype does not install packages or modify repository dependency files. `PROTOTYPE_PORT` changes the preview port; set `PREVIEW_URL` to the same origin for browser tests.

The active delivery validation preview uses http://127.0.0.1:4322/policies. The original local design preview remains available on port 4321 where its session is still running.

## What is represented

**Configuration coverage against current Dashboard and backend contracts:**

| Role / context                                                          | Logical fields represented |
| ----------------------------------------------------------------------- | -------------------------: |
| Company Admin / Company defaults                                        |                    24 / 24 |
| Company Admin / Location overrides, including zone attributes           |                    31 / 31 |
| Location Manager / exact authorized Location, including zone attributes |                    20 / 20 |

These counts treat the seven-day operating schedule as one compound setting and each zone attribute as one field. The exact keys and source contracts are recorded in `evidence/settings-parity.json` and [COMPLETENESS-REVIEW.md](COMPLETENESS-REVIEW.md).

The eight sections cover vehicle operations, payments/validation, operating hours and Location SLA, task tracking, language/notifications, Shift Presence, attendance zones and WhatsApp Guest Access. Service Status is deliberately absent per the Owner's later instruction. Privacy & Contact remains a separate global destination. Presence exception review is an operational workflow rather than a configuration field and is not simulated here.

## Interaction

- Select Company defaults or Location overrides; use the real shell controls to choose synthetic Organizations and Locations.
- Each section has a distinct icon and short bilingual explanation. The secondary navigation becomes an expandable vertical list on narrow screens. The search input was removed per Owner instruction.
- Edit one setting at a time. Changing an inherited value creates a local draft override. Save applies it locally; Clear Override restores inheritance. Explicit false remains different from an absent override.
- Saved/effective values remain separate from drafts. Comparison and inheritance controls are available in the editor disclosure. Save confirmation appears beside the changed setting.
- Operating hours are informational and contain Monday–Sunday with valid same-day intervals. SLA is Location-only, 30–3600 seconds; clearing SLA means no configured target.
- Start and End Presence modes are independent. Strict modes require confirmation and a usable active zone. Company changes check all affected synthetic locations. Disabling the final usable zone is rejected while a strict policy is effective. These are local demonstrations of the current server contract, not server-readiness proof.
- Attendance zones support creation/editing, ACTIVE/DISABLED, radius 5–1000m, manual coordinates, a schematic coordinate picker, directional point controls and **Use my current location**. The latter reuses the existing production one-shot hook. It requests permission only after an explicit click, fills draft coordinates only, never derives radius or auto-saves, and ignores stale callbacks after manual edits/cancellation/scope changes. Automation uses mocked coordinates, not a real device location.
- The coordinate map remains an offline illustrative schematic with synthetic buildings, including when coordinates come from the browser. No provider tiles or paid map SDK are loaded.
- WhatsApp uses one bundled policy save. The fixture has no approved template or verified binding; enabling is rejected. Saving cannot activate messaging, prove consent or send a message.
- Existing bilingual setting-specific Help uses the production registry and focus dialog, including Help beside Save.
- URLs support section selection, Back/Forward and Refresh. Removed Service Status links fall back to Vehicle operations. Unsaved changes are guarded before navigation/refresh.
- The footer's Preview controls exposes separate synthetic roles, read-only response capability, loading, empty, read-error/retry and denied scenarios. The read-only capability is not inferred from the Location Manager role.

Saved settings use localStorage key `vaylet-321-studio-v1` and separate Organization/Location keys. Other global destinations are not integrated. No production API client is composed; browser fetch/XHR/beacon data transports are disabled. This does not prohibit browser-managed permission handling when the user deliberately requests their location.

## Verification commands

```powershell
npm run typecheck
npm run build
npm run test:parity
npm test
npm run test:location
node tests/presence-readiness.mjs
npm run capture
```

The browser suites require the preview server and use isolated visible Chromium contexts with synthetic state. `test:parity` reads current repository schemas directly using Vite's module loader. It does not call the backend.

Curated results:

- `evidence/settings-parity.json`: field/scoped catalogs and enum/value/bound comparisons against actual schemas, plus derived readiness checks.
- `evidence/verification.json`: navigation, local saves, inheritance, role/scopes, Help/keyboard, validation and responsive matrix.
- `evidence/current-location-verification.json`: mocked browser location, failure feedback, stale-result fencing and responsive checks.
- `evidence/presence-readiness-verification.json`: strict readiness/fanout, final-zone guard and case-sensitive code scenarios.
- `evidence/section-icons-verification.json`: EN/AR, light/dark and mobile/desktop icon checks.
- `evidence/validation-summary.json`: final local gate status and scope boundary.
- `evidence/native-zoom.json`: native zoom limitation. Effective-width reflow is separate and is not reported as native browser zoom.

Typecheck/build logs, dependency caches, generated typecheck config, build output and raw network diagnostics are generated locally and ignored by Git. The bundle can emit expected `use client` warnings because Next client components are imported into a Vite SPA. Runtime adapters for `next/link` and `next/image` retain the existing class names and component props.

## Finished-state captures

All are under `evidence/`:

- `en-light-desktop.png`
- `ar-dark-desktop.png`
- `en-light-mobile.png`
- `ar-dark-mobile.png`
- `location-override-edit.png`
- `attendance-zone-edit.png`

No old candidates, before/after comparisons or visual-diff artifacts are included.

## Evidence limits and production boundary

Source-contract parity proves the settings inventory and local representation only. It does not prove backend authorization, MFA, optimistic concurrency, exact-result recovery, idempotency, audit atomicity, live provider/catalog state, real GPS accuracy, message delivery, remote CI, deployment readiness or Owner design approval. The location picker, roles, entitlements and values are synthetic. Native browser zoom and physical-device/screen-reader acceptance remain unverified.

Future production integration must retain existing APIs, actor/scope derivation, capabilities, MFA, CAS/reconciliation, audit, privacy and external activation gates. It requires a separate Owner-approved Phase B. No production files are changed by this prototype branch.
