# Issue #253 — Native appearance implementation and evidence

Owner-authorized Phase B contract, read before the broad presentation migration.
Starting main: `e4db5544b8217666d6f794908989d5c2b107d3a2`.
Pushed #226 / Light baseline: `bc4fdb453fcae61e740c08941cff018257941468`.
Same branch: `feat/VAL-226-253-native-camera-theme`.

## Locked implementation contract

Explicit Light/Dark only, device-local version-1 appearance-only file using the
existing Expo File System. Missing/malformed/unknown/read failure defaults Light.
Restore is bounded, before exposing visible UI, independent from auth startup.
Logout/identity replacement never clears appearance. Serialized writes protect
rapid toggles; write failure keeps the app usable and current in-memory choice.
No auth/business identifier or protected value is stored.

One React context/provider owns presentation state. Immutable semantic Light/Dark
palettes and two cached sheets per style factory preserve geometry; no mutable
global palette or per-screen theme state. Shared primitives migrate first,
followed by all screen-local styles and direct colors. Current literal tokens,
spacing/radii/typography/sizes and official logo assets remain immutable.

Only colors/system bars, official logo surface selection, and one minimal
Appearance section in the existing Account/Settings sheet may change. Reuse the
existing Language radio pattern. EN/AR and LTR identifier islands remain intact.
No persisted entities, ValetSession/Task/Dispatch transitions, DB constraints or
indexes, authorization/tenant/Location/configuration inheritance are affected.
No backend support, dependencies, lock/config/native source/patch, Web, Dashboard,
Customer or Management work. No APK, PR, merge or issue closure.

## Evidence plan

Capture pushed-#226 style/render baseline before the color migration. Compare final
Light styles/render trees and both-theme geometry. Add strict store/owner failure,
restart, immediate switch and serialized-write tests, Settings/accessibility and
representative EN/AR production renders. Add a scoped static color coverage guard.
Run focused suites, Native aggregate once, lint/typecheck/architecture/format and
one repository verification build excluding Employee Web. Record baseline failures
and deferred real-device evidence honestly. Results and inventory follow below.

## Implemented architecture and persistence

`EmployeeAppearanceProvider` owns one stable `NativeAppearanceOwner` above the
router tree. Consumers read its semantic palette; no theme key, per-screen theme
state, auth/runtime reconstruction or workflow retirement is introduced. The
router mounts during restoration, so auth startup is not delayed. Visible UI is
hidden until restoration completes; the splash waits for restoration and root
layout and hides once. Root system appearance and StatusBar follow the selected
mode. Existing navy gate status bars remain appropriate for their navy surface.

`employee-palette.ts` has immutable Light literals and deliberate Dark roles.
`createEmployeeStyles` creates two cached StyleSheet maps once per module;
`createEmployeeValues` does the same for color-only variants. Existing spacing,
typography, radii, dimensions, layout order and identifier direction remain intact.
Compatibility exports expose immutable Light maps for existing pure tests;
production components consume the selected map. Shared primitives and every
screen-local style/color consumer were migrated. The two scoped extractions
split existing Account menu primitives and gate sheets to maintain the 300-line
physical authored-code ceiling; neither changes behavior.

Existing Expo File System supplies the device document file
`vaylet-appearance-v1.json`. Its complete format is
`{"version":1,"theme":"light"}` or `{"version":1,"theme":"dark"}`.
Parsing rejects extra keys, arrays, unknown versions/modes and malformed values.
Missing/unreadable data defaults Light. A 1500ms bounded read prevents hung
storage from holding the splash indefinitely; late results cannot overwrite
selection. Selection publishes immediately, then serialized writes preserve
rapid-toggle order. Write failure retains the usable in-memory choice; persistence
cannot be promised for that failed write. No dependencies or protected-data store
were added. The preference has no employee, auth, shift, organization, location,
session, token or operational data; identity/logout code has no appearance import
or deletion path. A new owner restores the last successful write after restart.

## Exact UI delta and full production inventory

Only theme colors/system appearance, official surface-appropriate logo selection,
and the minimal Appearance section are changed. Account/Settings inserts it after
Language and before About, reusing the existing 44px radio choices and layout:
English Appearance / Light / Dark; Arabic المظهر / فاتح / داكن. Exactly two
options, no System/automatic option. The selected radio state and localized label
are accessible, and selecting either option immediately updates the entire tree.
No navigation, controls, workflow ordering or surrounding geometry is redesigned.

| Native area               | Covered presentation                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth and startup          | Root background/bars, branded sign-in/gates, loading, retry/error and foundation auth/PoC panels                                                                    |
| Production shell          | Header, official logo, role/Settings utility, connectivity/offline banner, contextual surface, pinned navigation and gate shell                                     |
| Tasks                     | Priority cards, queue rows, action buttons, disabled/busy controls, shift strip, retrieval attention, loading/error/empty and skeleton surfaces                     |
| Vehicles (#255)           | Rows, plate capsule, badges, metadata, expanded details, Continue/Cancel incomplete Check-In actions, cancellation sheet, loading/error/empty states                |
| Scan                      | Existing four tiles, deterministic icons, available/disabled states, badges and QR camera panel                                                                     |
| Shift (#252)              | Start/location selection, active/end/cash/confirmation/uncertain states, summary rows, live elapsed timer presentation and support diagnostics                      |
| Account/Settings          | Avatar, overlay/sheet, employee information, notifications, language, Appearance and About                                                                          |
| Check-In                  | Manual/OCR identity, country selector, camera messages, #226 torch, Confirm/Edit, returning customer, condition photos, continuation/parking-task and result states |
| Parking/key custody       | Start, active task, zone/spot resource choices and QR input, confirmation, key-return assignment, failure/conflict and success                                      |
| Retrieval                 | Vehicle/details, key checkout input, stage content, offline/failure and success                                                                                     |
| Handoff/release           | Pending/code/scanner verification, vehicle summary, reasoned override controls, warning, blocked/release/results                                                    |
| Incident                  | Loading, context failure, category/severity/details form, validation, submission and success                                                                        |
| Guest access              | Screen, status card, QR container and confirm/danger sheets                                                                                                         |
| Shared/foundation/support | Buttons, fields, cards, badges, errors, progress/loading, back headers, SVG icons, notification permission, foundation styles and physical diagnostics              |

All authored Native TS/TSX sources are scanned for direct hex/rgba colors, literal
color imports and unthemed StyleSheet factories. Explicit fixed exceptions are:
immutable historical design tokens; semantic palette definitions; black/white QR
modules and quiet zone; white camera ROI guide/navy shadow; and an unused legacy
Check-In color re-export. The navy brand gates intentionally keep navy/white
surfaces in both modes. Official image assets are unchanged. Dark header uses the
official dark-surface logo inside the existing Light-sized 169:60, 28px-high box
with contain sizing; no tint, recreation or physical header reordering (#249/#251).

EN/AR human-copy alignment and existing RTL containers are preserved. Plate/ID,
QR/ROI/camera and other identifier islands remain LTR and unmirrored. SVG icons
remain deterministic. Dark contrast tests require >=4.5 for normal copy/action
labels/status combinations and >=3 for input boundaries/status indicators.
Light's exact existing colors are preserved, including existing contrast limits.

## Automated evidence and limitations

The pre-migration fixture captures 46 Native style maps from pushed commit A.
Final Light maps equal it exactly; Dark maps equal Light after removing only color
properties. A second harness reads commit A's Native blobs without a checkout or
worktree and renders actual production exports with platform/business-I/O mocks.
Its 39 cases run in both EN/AR at a mocked 320px host width: 78 Light comparisons
against A and 78 Dark non-color tree/prop comparisons. Only the authorized new
Appearance section is removed for Light comparison. Dark text requires an
explicit or inherited themed color. Geometry includes typography, line heights,
spacing, dimensions, direction, border/stroke widths, layout and logo bounding box.
These are source/render-tree checks, not a device layout engine or screenshots.

Owner/store tests cover exact JSON, corrupt/missing/read failure, restart,
serialized rapid writes, write failure and bounded/late restore. Provider/root
tests exercise stable ownership, children mounting during restore, one splash
hide after layout+restore and system appearance updates without tree replacement.
Interactive Settings tests cover immediate selection, persistence payload, EN/AR
and radio accessibility. Camera tests cover both languages and theme changes
with torch off/on without camera reopening/generation replacement; cleanup still
resets OFF. Existing lifecycle/ROI/OCR and #255/Shift/shell regressions also pass.

| Verification                                                      | Result                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Phase A focused camera/ROI/OCR/torch                              | 19 files / 173 tests PASS before commit A                                                                   |
| Final Phase B focused appearance + Plate + #255 + Shift + shell   | 39 files / 290 tests PASS                                                                                   |
| Native ESLint, zero warnings                                      | PASS                                                                                                        |
| Native typecheck                                                  | FAIL: five unchanged timezone fixture diagnostics, detailed below; no scoped diagnostics                    |
| Native-only repository line/import rules                          | PASS: 481 authored files, zero violations/warnings; modified legacy files do not grow beyond their baseline |
| Changed-file Prettier and diff whitespace                         | PASS                                                                                                        |
| Single final repository verification build, Employee Web excluded | PASS: 9/9 tasks; 3 cached; exit 0; Native has no build script                                               |
| Android APK / physical Native acceptance                          | DEFERRED; none generated or claimed                                                                         |

Final focused command (run from repository root):

```text
pnpm --filter @valet/valet-native exec vitest run test/native-appearance test/native-startup-branding.test.mjs test/native-plate test/issue-255-native-vehicles-freeze.test.tsx test/native-task-shift-strip.test.tsx test/native-active-shift-panel.test.tsx test/native-shift-format-repair.test.tsx test/native-shift-detached-lifecycle-repair.test.tsx test/native-shell-layering-repair.test.tsx test/production-shell-state.test.ts test/production-shell-routing.test.ts test/production-shell-revalidation.test.ts
pnpm --filter @valet/valet-native lint
pnpm --filter @valet/valet-native typecheck
pnpm build --filter=!@valet/valet
```

The Native aggregate was run once: 184 files, 180 passed / 4 failed; 1337 tests,
1331 passed / 6 failed. It excluded four known Web-coupled tests, but missed
`native-production-entry.test.mjs`, whose Web asset comparison failed. Three
failures in unchanged `native-operational-http.test.ts` arise from missing
required timezone in existing context fixtures; Issue #255's validation already
records those same three transport failures. The two scoped failures were fixed:
the render harness now batches Git reads/caches compilation and passes under the
unchanged default timeout; startup branding expectations now require bounded
appearance readiness as well as layout, backed by the root lifecycle test. The
aggregate was not rerun; the final focused run validates those repairs. No full
aggregate green result is claimed. Future Native-only aggregate validation must
exclude all five Web-coupled files:

```text
employee-brand-assets.test.mjs
employee-icon-foundation.test.tsx
employee-shell-frame.test.tsx
native-dictionary-parity.test.mjs
native-production-entry.test.mjs
```

Typecheck's unchanged diagnostics: `native-incident-recovery-context.test.ts:36`,
`native-push-route-denial.test.ts:35`, `native-push-route-lifecycle.test.ts:207`,
`native-shift-retirement.test.ts:40` and `:41`, all missing `timezone`. These are
outside this presentation task and remain unfixed. A scoped Phase A lifecycle
fixture is corrected in commit B from invalid `anonymous` to valid `authenticated`
with a changed authGeneration; it still exercises auth retirement and changes no
production torch behavior.

## Read-only review, scope audit and deferred gate

Full branch review found no persisted entity, backend/API/database, dependency,
lockfile, Native app/build configuration, Expo patch/native source or operational
state mutation changes. Appearance is independent of auth, tenant/location,
workflow generation, session/task commands and append-only operational history.
The test-only Vitest setup gives existing pure component fixtures a Light context;
new provider/owner/root tests exercise the real appearance implementation.

Employee Web has no changes. The strict no-inspection instruction was not fully
met: earlier legacy Native parity tests and a broad architecture check indirectly
read Web reference sources/assets, and the single aggregate also included the
missed Web asset parity test. This was reported during execution; final focused
tests and the Native-only architecture check avoid Web. There was no direct
manual Web inspection or Web implementation work. This exception must not be
represented as an absolute no-Web-inspection PASS.

Physical acceptance remains in the owner Native batch: Android torch activation,
unsupported hardware, low-light OCR, camera clipping, persisted Dark cold start,
actual system bars, keyboard, narrow-screen text/layout, AR/RTL, official-logo
appearance, TalkBack and workflow continuity across theme switching. No APK,
device/screenshot/physical PASS, PR, merge or issue closure is claimed. Repository
CI and unrelated baseline failures remain review/merge gates outside this run.

## Exact commit-B file manifest

The following Native-only implementation/tests and this evidence document make
up commit B. Paths follow below.

```text
apps/valet-native/app/_layout.tsx
apps/valet-native/src/appearance/employee-appearance-context.tsx
apps/valet-native/src/appearance/employee-palette.ts
apps/valet-native/src/appearance/employee-themed-styles.ts
apps/valet-native/src/appearance/native-appearance-owner.ts
apps/valet-native/src/appearance/native-appearance-store.ts
apps/valet-native/src/auth/native-auth-foundation-panel.tsx
apps/valet-native/src/auth/native-auth-panel.tsx
apps/valet-native/src/auth/native-poc-panel.tsx
apps/valet-native/src/check-in/native-check-in-condition-step.tsx
apps/valet-native/src/check-in/native-check-in-continuation-step.tsx
apps/valet-native/src/check-in/native-check-in-identity-context.tsx
apps/valet-native/src/check-in/native-check-in-parking-task-step.tsx
apps/valet-native/src/check-in/native-check-in-primitives.tsx
apps/valet-native/src/check-in/native-check-in-returning-step.tsx
apps/valet-native/src/check-in/native-check-in-state-steps.tsx
apps/valet-native/src/check-in/native-check-in-styles.ts
apps/valet-native/src/check-in/native-check-in-workflow.tsx
apps/valet-native/src/check-in/native-plate-camera-step.tsx
apps/valet-native/src/check-in/native-plate-country-selector.tsx
apps/valet-native/src/check-in/native-plate-torch-control.tsx
apps/valet-native/src/diagnostics/native-physical-diagnostics-card.tsx
apps/valet-native/src/employee-ui/employee-action-icons.tsx
apps/valet-native/src/employee-ui/employee-back-header.tsx
apps/valet-native/src/employee-ui/employee-context-icons.tsx
apps/valet-native/src/employee-ui/employee-controls.tsx
apps/valet-native/src/employee-ui/employee-feedback.tsx
apps/valet-native/src/employee-ui/employee-fields.tsx
apps/valet-native/src/employee-ui/employee-frame.tsx
apps/valet-native/src/employee-ui/employee-navigation-icons.tsx
apps/valet-native/src/employee-ui/employee-torch-icon.tsx
apps/valet-native/src/foundation/foundation-shell.tsx
apps/valet-native/src/foundation/foundation-styles.ts
apps/valet-native/src/guest-access/native-guest-access-confirm-sheet.tsx
apps/valet-native/src/guest-access/native-guest-access-qr.tsx
apps/valet-native/src/guest-access/native-guest-access-screen.tsx
apps/valet-native/src/guest-access/native-guest-access-status-card.tsx
apps/valet-native/src/guest-access/native-guest-access-styles.ts
apps/valet-native/src/handoff/native-handoff-panel.tsx
apps/valet-native/src/handoff/native-handoff-pending.tsx
apps/valet-native/src/handoff/native-handoff-reason-action.tsx
apps/valet-native/src/handoff/native-handoff-scanner.tsx
apps/valet-native/src/handoff/native-handoff-styles.ts
apps/valet-native/src/handoff/native-handoff-vehicle.tsx
apps/valet-native/src/handoff/native-release-panel.tsx
apps/valet-native/src/incident/native-incident-form.tsx
apps/valet-native/src/incident/native-incident-screen.tsx
apps/valet-native/src/incident/native-incident-styles.ts
apps/valet-native/src/notifications/native-push-permission-status.tsx
apps/valet-native/src/parking/native-active-parking-panel.tsx
apps/valet-native/src/parking/native-active-parking-styles.ts
apps/valet-native/src/parking/native-parking-confirm-panel.tsx
apps/valet-native/src/parking/native-parking-confirm-styles.ts
apps/valet-native/src/parking/native-parking-key-return-step.tsx
apps/valet-native/src/parking/native-parking-qr-input.tsx
apps/valet-native/src/parking/native-parking-resource-step.tsx
apps/valet-native/src/parking/native-parking-start-panel.tsx
apps/valet-native/src/parking/native-parking-start-styles.ts
apps/valet-native/src/parking/native-parking-success.tsx
apps/valet-native/src/retrieval/native-retrieval-details.tsx
apps/valet-native/src/retrieval/native-retrieval-key-input.tsx
apps/valet-native/src/retrieval/native-retrieval-panel.tsx
apps/valet-native/src/retrieval/native-retrieval-stage-content.tsx
apps/valet-native/src/retrieval/native-retrieval-styles.ts
apps/valet-native/src/scan/native-scan-hub-icons.tsx
apps/valet-native/src/scan/native-scan-hub-screen.tsx
apps/valet-native/src/scan/native-scan-hub-tile.tsx
apps/valet-native/src/scanner/native-qr-panel.tsx
apps/valet-native/src/shell/native-account-menu-copy.ts
apps/valet-native/src/shell/native-account-menu-sections.tsx
apps/valet-native/src/shell/native-account-menu-styles.ts
apps/valet-native/src/shell/native-account-menu.tsx
apps/valet-native/src/shell/native-active-header-utilities.tsx
apps/valet-native/src/shell/native-connectivity-banner.tsx
apps/valet-native/src/shell/native-contextual-surface.tsx
apps/valet-native/src/shell/native-gate-primitives.tsx
apps/valet-native/src/shell/native-gate-shell.tsx
apps/valet-native/src/shell/native-gate-style-sheets.ts
apps/valet-native/src/shell/native-production-navigation.tsx
apps/valet-native/src/shell/native-shell-gate.tsx
apps/valet-native/src/shift/native-active-shift-panel.tsx
apps/valet-native/src/shift/native-shift-diagnostics-card.tsx
apps/valet-native/src/shift/native-shift-start-panel.tsx
apps/valet-native/src/shift/native-shift-summary-details.tsx
apps/valet-native/src/tasks/native-new-vehicle-button.tsx
apps/valet-native/src/tasks/native-retrieval-attention.tsx
apps/valet-native/src/tasks/native-task-action-button.tsx
apps/valet-native/src/tasks/native-task-card-styles.ts
apps/valet-native/src/tasks/native-task-card.tsx
apps/valet-native/src/tasks/native-task-queue-row-styles.ts
apps/valet-native/src/tasks/native-task-queue-row.tsx
apps/valet-native/src/tasks/native-task-shift-strip.tsx
apps/valet-native/src/tasks/native-tasks-panel.tsx
apps/valet-native/src/vehicles/native-check-in-cancel-sheet.tsx
apps/valet-native/src/vehicles/native-vehicle-check-in-actions.tsx
apps/valet-native/src/vehicles/native-vehicle-row-styles.ts
apps/valet-native/src/vehicles/native-vehicle-row.tsx
apps/valet-native/src/vehicles/native-vehicles-screen.tsx
apps/valet-native/test/appearance-default-test-context.ts
apps/valet-native/test/appearance-render-cases.ts
apps/valet-native/test/appearance-render-evidence.ts
apps/valet-native/test/appearance-render-tree.ts
apps/valet-native/test/appearance-style-evidence.ts
apps/valet-native/test/appearance-workflow-cases.ts
apps/valet-native/test/fixtures/issue-253-light-styles.json
apps/valet-native/test/native-appearance-camera.test.ts
apps/valet-native/test/native-appearance-contrast.test.ts
apps/valet-native/test/native-appearance-coverage.test.ts
apps/valet-native/test/native-appearance-owner.test.ts
apps/valet-native/test/native-appearance-provider.test.tsx
apps/valet-native/test/native-appearance-render-matrix.test.ts
apps/valet-native/test/native-appearance-root.test.ts
apps/valet-native/test/native-appearance-settings.test.ts
apps/valet-native/test/native-appearance-storage.test.ts
apps/valet-native/test/native-appearance-style-freeze.test.ts
apps/valet-native/test/native-plate-camera-lifecycle.test.ts
apps/valet-native/test/native-startup-branding.test.mjs
apps/valet-native/vitest.config.mjs
docs/ISSUE-253_IMPLEMENTATION_VALIDATION.md
```
