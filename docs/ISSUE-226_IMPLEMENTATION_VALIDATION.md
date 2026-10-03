# Issue #226 — Native plate scanner torch

Owner-authorized two-issue run, Phase A. Starting fetched `origin/main`:
`e4db5544b8217666d6f794908989d5c2b107d3a2`; ancestor check PASS, clean tree.
Branch: `feat/VAL-226-253-native-camera-theme`. No worktree, PR or merge.

## Contract and implementation

Native camera presentation/device state only. No affected persisted entities,
ValetSession/Task/Dispatch transitions, authorization/tenant/Location rules,
DB constraints/indexes, configuration inheritance or backend contracts.
This is an assistive sellable-MVP OCR usability addition under DEC-071/074.
Manual/no-plate and explicit Confirm/Edit remain authoritative and unchanged.

Installed patched `expo-camera` package version 57.0.4 was inspected:
`src/Camera.types.ts` defines `enableTorch?: boolean`, default false;
`src/CameraView.tsx` forwards props and defaults `enableTorch` to false.
`getSupportedFeatures()` exposes barcode/recording support only, no public torch
capability or activation acknowledgement. Installed Android `ExpoCameraView.kt`
checks `cameraInfo.hasFlashUnit()` before requesting `enableTorch`; unsupported
hardware silently ignores the request. No capability method was invented.
The existing ROI patch and all capture/crop/request mechanics are unchanged.

`NativePlateCameraController` owns a requested `torchEnabled` snapshot field.
Generation + mount fencing permits toggles only in eligible active preview.
Close, manual/no-plate, blur/unmount, scope/identity/auth retirement, background,
permission errors, camera errors, geometry failure and OCR completion reset OFF.
Reopen starts OFF. Same-generation picture-size fallback retains the request;
stale handlers cannot toggle a new mount/generation. No persistent preference,
EmployeeClient change or OCR authority is introduced.

## Authorized UI delta

One overlay inside the existing 260px viewport, top/right 8px, minimum 48x48
target, existing typography/radius/colors and deterministic Native SVG icon.
Visible On/Off labels and distinct surfaces supplement color; accessibility
role `switch`, `checked` reflects the requested state. English: Flashlight,
On, Off. Arabic: المصباح، تشغيل، إيقاف. Physical ROI remains LTR, unmirrored.
At the test viewport (360x260), overlay ends at y=56, guide starts at y=85.
Viewport, ROI/margin, surrounding controls/copy/order and Confirm/Edit unchanged.

## Evidence

- New state tests were first run RED (8 failures), then GREEN (8/8).
- Final focused Plate camera/ROI/OCR/capture/torch suite: 19 files, 173 tests PASS.
- Focused EN/AR torch UI tests cover state, accessibility, guide/viewport freeze,
  stale callback, denial/error manual fallback. Existing ROI/OCR/candidate tests
  protect crop, single-flight requests and explicit confirmation.
- Native full typecheck: five pre-existing timezone fixture diagnostics in
  incident recovery, push route denial, push route lifecycle, and two Shift
  retirement assignments. These files match starting HEAD; previous Issue #255
  validation also records these baseline omissions. No scoped diagnostics.
- Changed-file Native ESLint PASS; `pnpm architecture:check` PASS (existing
  grandfather warnings only); Prettier and `git diff --check` PASS.
- Read-only diff review: no OCR/ROI mechanics, surrounding UI geometry,
  dependencies or prohibited areas changed. All touched authored files <=300 lines.

## Limits and deferred physical acceptance

Checked state is the employee's requested setting, not hardware verification;
Expo offers no reliable public preflight/activation signal. Unsupported hardware
must not block OCR, and reported camera errors clear the request and retain
manual/no-plate paths. Real Android torch activation, low-light OCR, no-flash
hardware, ROI clipping and TalkBack remain the owner Native batch physical gate.
No APK or physical PASS is claimed. No dependency/lock/config/native source,
Employee Web, backend/API/database, brand or theme architecture change.
