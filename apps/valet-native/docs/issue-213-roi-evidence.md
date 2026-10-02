# Issue #213 — Native plate ROI implementation evidence

Baseline: `2ce340ba0f99c9efe6554681adea1a12cc89b13e`, refreshed `origin/main`.
Branch: `fix/VAL-213-native-plate-roi`. No worktrees or PR. The owner later approved direct code merge while deferring full Android packaging and physical acceptance to the Native batch closure gate.

## Contract ledger

| Behavior | Binding authority | Implementation boundary |
| --- | --- | --- |
| Opt-in authoritative camera transform | Issue #213 plan, Owner U1 addendum | Version-specific pnpm Expo Camera patch; Native-only adapter |
| Frozen UI, 260-unit viewport, centered 3.2:1 guide | Owner UI freeze; plan §§4–5 | Overlay inside existing camera viewport; existing instruction slot |
| Four mapped corners, 10% margin each side, outward rounding | Plan §5 | Pure geometry; reject invalid/outside-guide transforms |
| One source, local JPEG quality 0.6 then 0.45, ≤1 MiB | Plan §§10–11 | Device crop pipeline; no full-frame fallback |
| Original deleted before ROI handoff; all known files privately owned | Plan §10; DEC-074 §8 | Attempt-local ownership and bounded cleanup |
| Generation, mount and layout fencing | Plan §5; DEC-074 §7; DEC-072 | Camera binding; late work is cleanup-only |
| Five attempts, one flight, one HTTP per attempt, completion-plus-delay | DEC-074 §6; plan §11 | Existing OCR loop/client |
| Draft then review, explicit human Confirm, permanent fallbacks | DEC-074 §§3–4,15; DEC-069; DEC-020 | Existing accept and workflow contracts |
| Organization/Location/Shift authority and typed OCR policy unchanged | DEC-032; DEC-074 §13,22; DEC-083 | Existing API only; no persistence changes |

No business entities, physical ValetSession transitions, Task/Dispatch
transitions, permissions, configuration contracts, indexes, or migrations change.
All new geometry, native metadata and file ownership are transient Native memory.
Employee Web, QR scanning and backend behavior are excluded.

## Maintained integration choice

Use pnpm's version-specific patch mechanism rather than generated Android edits.
CameraX supplies sensor→PreviewView and sensor→capture-buffer transforms. The
patched JPEG resolver attaches metadata only when its actual EXIF rotation and
processed bitmap dimensions agree with capture metadata. Compose
`R × Sb × inverse(Sv)` in native code, then apply layout→native-pixel scaling
using the measured camera-local host. Reject unavailable or changed transforms.
The opt-in is used only by plate OCR. Existing captures keep their defaults.
Future iOS supplies the same narrow metadata boundary; unsupported metadata
currently degrades to OCR unavailable with manual/no-plate still available.

Expo 57.0.19's installed compatibility inventory selects
`expo-image-manipulator ~57.0.15`; the compatible resolved dependency is
`~57.0.20` (with `expo-image-loader 57.0.1` transitively).
Expo 57 defaults to precompiled native artifacts. The native package therefore
sets `expo.autolinking.android.buildFromSource: ["expo-camera"]`, as required by
[Expo prebuilt module guidance](https://docs.expo.dev/guides/prebuilt-expo-modules/),
so CNG compiles the maintained patch. No generated Android project is edited. No Expo/Camera/React Native upgrade is intended.

## Before-change baseline

Inspected the original Native scanner source and presentation fixture. Viewport:
height 260, navy2 background, primary radius, clipped overflow, absolute-fill
rear muted camera. The existing status slot and control order are retained.
Baseline presentation + OCR loop: 2 files / 15 tests passed locally.

No Android device was connected (`adb devices -l` returned none). The owner
instructed proceeding while reporting physical evidence as unavailable.
No screenshot, physical calibration, accuracy comparison, or real-device visual
regression is claimed. Source/element-tree regression is a separate evidence level.

## Implementation and request-budget proof

The physical guide is centered, aspect 3.2:1, width
`min(0.8 × viewportWidth, 520, 3.2 × 0.36 × viewportHeight)`, height width/3.2.
For the 360×260 fixture it is (36,85,288,90). Native metadata maps all four
corners; the guide must be wholly inside the actual upright JPEG. Add 10% of
mapped width/height on each side, clamp only that added margin, and round bounds
outward. The 720×1280 golden crop is (14,532,692,216). No requested-size or
center-cover guess determines the mapping.

One awaited capture owns its source and every returned derived URI. It captures
at quality 1, crops/renders once, saves JPEG at 0.6, and, only after deleting an
oversize derived file, saves the SAME rendered image at 0.45. A positive integer
size ≤1,048,576 is required. Both oversize means unavailable and zero HTTP.
Successful capture deletes the original and releases native image/context refs
before handing the final crop to the unchanged OCR loop. The loop owns that crop
through HTTP/cancellation cleanup. Known late-created files are cleanup-only;
delete errors are sanitized, retried locally, and suppress the candidate. Hard
process death and unreturned partial files inside a native dependency cannot be
claimed as gracefully cleaned; no broad cache sweep is introduced.

The unchanged loop awaits capture → recognize → remove within one operation,
then schedules at most the next bounded attempt 1,200 ms after completion.
Neither crop, local encoding fallback, metadata/layout nor the existing supported
camera-size fallback calls recognition. Adapter tests count recognition calls
and assert the final cropped URI and original-deletion ordering; loop tests bound
five attempts and single flight. The existing client does not replay POST.
Backend authorization, provider and production cost guard were not changed.

## Validation results

| Check | Actual result |
| --- | --- |
| Before-change presentation/loop baseline | PASS: 2 files, 15 tests |
| Focused ROI/camera/loop/client/confirmation/package/localization | PASS: 19 files, 175 tests |
| Final ownership fault-injection supplement | PASS: 1 file, 19 tests, including missing/stat-throw and mismatched output dimensions |
| OCR contracts | PASS: 1 file, 17 tests |
| API provider/diagnostics/cost guard | PASS: 3 files, 40 tests |
| API OCR HTTP and boundary PostgreSQL suites | UNAVAILABLE: local cluster rejects test-user authentication (28P01); not PASS |
| Native lint | PASS |
| Native typecheck | FAIL: unchanged incident, push-route and shift test fixtures omit required timezone; no remaining ROI error |
| Full Native tests | FAIL: isolated run (maxWorkers=2), 173 files pass / 1 file fails, 1,303 tests pass / 3 unchanged operational HTTP failures; affected expectations fixed |
| Root architecture | PASS, including final closure run; existing grandfathered warnings; no baseline alteration |
| Root lint | FAIL: unchanged dashboard lint/hook violations |
| Root typecheck | FAIL: unchanged Employee Web timezone fixtures; excluded application untouched |
| Root test | FAIL: unchanged dashboard assertions, resource-sensitive architecture timeouts, PostgreSQL authentication unavailable |
| Root build | PASS: command exit 0; 10/10 tasks successful |
| Frozen lockfile install | PASS |
| Public Expo config / clean CNG prebuild | PASS: config exit 0 and clean CNG prebuild exit 0 |
| Patched camera Kotlin compilation / unit tests | PASS: compiled Kotlin and 4 Robolectric tests, 0 failures/errors; includes sensor-transform composition |
| Development APK | FAIL: arm64 debug assembly; Windows CMake/Ninja path limits remain after local-tool and short-staging retries. No APK/runtime/install PASS claimed |
| Formatting / diff whitespace | PASS: changed-file Prettier and staged source/doc/lock whitespace checks. Raw staged check flags patch context-space markers and one CRLF dependency line; see below |
| Remote CI | NOT VERIFIED; no PR created |

Commands used from repository root: `corepack pnpm architecture:check`,
`lint`, `typecheck`, `test`, `build`; native `lint`, `typecheck`,
`test` and `test --maxWorkers=2`, `config:public`, `prebuild:android`;
contracts `exec vitest run src/plate-ocr.test.ts`; API owned-test harness with
`plate-ocr-provider`, `plate-ocr-provider-diagnostics`, `plate-ocr-cost-guard`,
`plate-ocr-http.integration`, and `plate-ocr-boundary-diagnostics.integration`.
Android Gradle uses JDK 17 and the installed SDK. Tests/assembly were separated
after the combined build caused contention; no test thresholds were weakened.
Temporary logs and package patch preparation are local-only and uncommitted.

The installed SDK Ninja is 1.10.2. Upstream recommends Ninja ≥1.12.0 for Windows
long paths. A checksum-verified upstream Ninja 1.13.2 was downloaded into the
ignored local task directory and selected only through a temporary Gradle init
script. No SDK, project dependency or generated-project file was changed for
this retry. See [upstream Windows guidance](https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/).

Final assembly command from `apps/valet-native/android`:
`./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --init-script ../../../.tmp/issue-213/local-ninja-short.gradle --console=plain`.
The temporary init script selected Ninja and short CMake staging for app,
screens, worklets and reanimated. Its temporary `V:` staging alias was removed
after Gradle exited. Assembly failed in `:app:buildCMakeDebug[arm64-v8a]` with
`Filename longer than 260 characters` for gesture-handler's generated
`ComponentDescriptors.cpp`; `:expo-modules-core:buildCMakeDebug[arm64-v8a]`
also failed with `build.ninja still dirty after 100 tries`. The native metadata
module compiled and its tests passed independently. A supported build environment
and physical runtime verification are still required.

Failure details for broad gates (commands are `corepack pnpm` unless noted):

- `--filter @valet/valet-native typecheck`: five missing-timezone errors in
  `native-incident-recovery-context.test.ts:36`, `native-push-route-denial.test.ts:35`,
  `native-push-route-lifecycle.test.ts:207`, `native-shift-retirement.test.ts:40,41`.
- `--filter @valet/valet-native test --maxWorkers=2`: three failures in
  `native-operational-http.test.ts:129,156,246`, rejecting operational context
  with `NATIVE_OPERATIONAL_RESPONSE_INVALID` because the fixture lacks timezone.
- `lint`: dashboard reports nine errors and three warnings in its unchanged
  foundation/scope hooks (`react-hooks/refs`, `set-state-in-effect`, dependencies).
- `typecheck`: Employee Web test fixtures omit timezone (TS2741); the command
  stops at `@valet/valet#typecheck`.
- `test`: dashboard operations/live-operations presentation expects opposite
  assignment labels (`Assigned` / `Lina Haddad`, synthetic existing fixtures);
  Employee Web context auth-transition tests fail; API Auth export ownership
  expects three exports but receives four; architecture/capacity subprocess tests
  hit 5,000-ms timeouts and Windows EBUSY cleanup; PostgreSQL setup rejects
  test-user authentication with 28P01. No assertions/timeouts were weakened.

These failing source/test paths and their operational contracts are unchanged
from the starting commit, verified by the scoped Git diff. ROI dependencies are
native-package-only; no operational-context, Dashboard, Employee Web, API Auth or
PostgreSQL configuration edits were made. They are reported as observed gate
failures, not silently corrected or counted as passes.

Final staged inspection contains 34 scoped files: 17 modified and 17 new.
No Ninja binary, temporary init script, drive/staging configuration, `.tmp` file,
or generated Android output is staged. `git diff --cached --check -- . ':!patches/*.patch'`
passes. The unfiltered check flags eight lines inside the maintained patch:
seven unified-diff blank context markers (the required space prefix) and one
CRLF line from package patch generation. Those are patch-artifact whitespace,
not accidental authored source whitespace; the patch and its matching lockfile
hash are preserved as installed and validated. No source changes were made in
closure mode. No additional full validation matrix or packaging retry was run.

The first prebuild retry overlapped package relinking and could not resolve the
camera plugin; repeating after frozen-lockfile installation succeeded. The first
root-test invocation met the API harness's cluster-ownership lease; repeating
only after the focused harness finished exposed the actual failures above.
An earlier commentary mistook Android resource compilation for Kotlin compile;
this report distinguishes the later actual Kotlin/native-unit evidence.

## Physical acceptance and UI evidence

Physical Android baseline screenshots, asymmetric-target calibration, actual
cropped-upload inspection, EN/AR font-scale/TalkBack validation, paired Jordanian
plate recognition/edge-digit accuracy, mid-range timings, repeated-cycle memory,
cache inspection, force-stop behavior and native-module runtime smoke are
**UNAVAILABLE**. No authorized device is attached. The owner explicitly approved
continuing implementation while recording this evidence as unavailable.
The final APK packaging attempt also failed, so no successful installable build
or physical installation is available from this run. The owner subsequently
approved direct code merge while explicitly deferring full Android packaging and
physical-device acceptance to the Native batch closure gate.

Source diff and element-tree tests verify the unchanged 260-unit navy/radius
viewport, shell, actions/order and permanent fallbacks, plus the decorative clear
ROI overlay and minimum approved instruction text. Those tests are not physical
screenshots or proof of accuracy improvement. Issue #213 physical acceptance
remains open. Unsupported native metadata (including current iOS) fails closed.

The dependency patch contains Android metadata/options/view-module/resolver
integration and native tests, plus the source/built JS/type method. Its only
Gradle dependency additions are JUnit and Robolectric for module unit tests.
When upgrading Expo Camera, regenerate and review the patch, preserve the source
build setting, rerun native tests and requalify physical mapping before release.

## Repository-contract review

Target: this branch against baseline SHA above, actual local diff and new files.
Checked Owner issue/plan/U1/UI-freeze, DEC-074/072/071/069/067/063/032/083,
relevant decisions log, security, engineering, DoD, native execution and structure
rules. Review used the VAYLET review matrix and production-evidence ladder.

- Scope: Native plate acquisition only. Employee Web, QR, torch #226, backend,
  HTTP contracts, schema/migrations and production cost policy unchanged.
- Authorization/tenant/location: existing authenticated OCR and current Location
  boundary retained; no new protected write or authority predicate.
- Retry/concurrency/database: one flight and existing five-attempt schedule;
  camera fallback resolves the existing operation; no new persistence/locks.
- Abstraction/downstream: version-specific patch behind plate-only Native adapter;
  default camera callers retain behavior; draft/review/human confirm unchanged.
- Audit/privacy: transient private URI/geometry ownership; development diagnostics
  allow only finite bounded numeric fields, known statuses and validated picture
  sizes; no URI, bytes, tokens, plate, customer or raw exception logging added.
- Architecture: focused files under 300 lines; no baseline exceptions added.
- Tests: automated sample coverage established; PostgreSQL/device runtime gaps
  explicitly unverified. No security scan or CI certification claimed.
- Findings: no additional in-scope implementation defect was identified. The
  originally recorded APK/physical/repository-gate blockers remain truthful
  evidence gaps, but the owner explicitly changed the workflow decision: merge
  the reviewed code now and carry those proofs into the Native batch closure gate.

**OWNER MERGE DECISION — 2026-10-03:** direct code merge is approved. This does
not convert unavailable evidence into PASS and does not mark Issue #213 production-
complete. The issue remains open for batch closure proof: clean Android build and
installation, physical ROI calibration, full-digit/edge-digit accuracy comparison,
EN/AR physical visual acceptance, and final relevant CI/integration verification.

## Exact file inventory

Modified files:

- `apps/valet-native/package.json`
- `apps/valet-native/src/check-in/native-plate-camera-controller.ts`
- `apps/valet-native/src/check-in/native-plate-camera-step.tsx`
- `apps/valet-native/src/check-in/native-plate-capture-policy.ts`
- `apps/valet-native/src/check-in/native-plate-ocr-adapter.ts`
- `apps/valet-native/src/check-in/native-plate-ocr-diagnostics.ts`
- `apps/valet-native/src/i18n/native-dictionary-ar-check-in.ts`
- `apps/valet-native/src/i18n/native-dictionary-en-check-in.ts`
- `apps/valet-native/test/native-check-in-localization-contract.test.tsx`
- `apps/valet-native/test/native-plate-camera-fallback.test.ts`
- `apps/valet-native/test/native-plate-camera-step-test-fixture.ts`
- `apps/valet-native/test/native-plate-ocr-capture.test.ts`
- `apps/valet-native/test/native-plate-ocr-confirmation.test.tsx`
- `apps/valet-native/test/native-plate-ocr-diagnostics.test.ts`
- `apps/valet-native/test/package-manifest.test.mjs`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

New files:

- `apps/valet-native/docs/issue-213-roi-evidence.md`
- `apps/valet-native/src/check-in/native-plate-roi-binding.ts`
- `apps/valet-native/src/check-in/native-plate-roi-capture.ts`
- `apps/valet-native/src/check-in/native-plate-roi-crop-adapter.ts`
- `apps/valet-native/src/check-in/native-plate-roi-files.ts`
- `apps/valet-native/src/check-in/native-plate-roi-geometry.ts`
- `apps/valet-native/src/check-in/native-plate-roi-metadata.ts`
- `apps/valet-native/src/check-in/native-plate-roi-viewport.tsx`
- `apps/valet-native/test/native-plate-roi-binding.test.ts`
- `apps/valet-native/test/native-plate-roi-boundaries.test.ts`
- `apps/valet-native/test/native-plate-roi-capture.test.ts`
- `apps/valet-native/test/native-plate-roi-cleanup.test.ts`
- `apps/valet-native/test/native-plate-roi-crop-adapter.test.ts`
- `apps/valet-native/test/native-plate-roi-geometry.test.ts`
- `apps/valet-native/test/native-plate-roi-test-fixture.ts`
- `apps/valet-native/test/native-plate-roi-viewport.test.ts`
- `patches/expo-camera@57.0.4.patch`
