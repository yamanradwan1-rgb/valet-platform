# Issue #262 — instrumentation and physical investigation handoff

Base: `755ba2c7d56b58fbcf75e7a032a1430ebf66393d` (fetched main, 2026-10-03).
Branch: `fix/262-native-plate-camera-investigation`.
Issue: https://github.com/veletpro0-lgtm/valet-platform/issues/262.
Authority: owner's instrumentation-only brief; `docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`, especially E, J, L262, M and N; DEC-071/074; `docs/17_AGENT_CODE_STRUCTURE_RULES.md`.

**ROOT CAUSE: NOT PROVEN. FIX IMPLEMENTED: NO. UI CHANGE: NONE.**
This handoff is repository evidence, not physical reproduction, APK acceptance or issue closure.

## Contract and scope ledger

- LOCKED: observe current acquisition, preserve all product/lifecycle behavior, bounded allowlisted diagnostics, tests and physical protocol only. No changes to dependencies, native patch, retries, delays, picture-size selection, ROI, torch or rendering.
- DERIVED: use one local diagnostic owner per camera binding, preserve originating generation/mount on asynchronous operations, record separate current controller identity, and stream bounded event records without a product UI.
- FORBIDDEN: selecting a recovery implementation, automatic camera/app restart, new UI, domain mutation/audit, migration, unrelated work, inspecting `apps/valet/**`.
- UNRESOLVED: physical surface class, causal ordering and minimum recovery boundary. These block a selected fix, not instrumentation.
- Affected objects: NativePlateCameraController, NativePlateRoiBinding, NativePlateOcrLoop and temporary native/cropped image ownership. No ValetSession, Task/Dispatch or Shift transition is changed. No protected mutation, authorization change, tenant/location exposure, new DB constraint/index, public API or Company-default/Location-override policy is introduced. Existing assistive MVP behavior remains DEC-074.
- Structure: trace schema/buffer lives outside the near-limit controller. Permission-result observation is a synchronous helper; it adds no promise hop. No new timeout, timer or subscription is introduced by diagnostics. Existing AppState subscription is wrapped, with its original listener invoked in the same call.

## Evidence register and actual lifecycle

Camera source/test paths below are relative to `apps/valet-native`; `docs/`, `patches/` and the base/branch references are repository-relative. Installed dependency paths are explicitly marked. Refer to named functions, which survive line movement.

| Source | Exact ownership / observation |
| --- | --- |
| `src/check-in/native-plate-camera-step.tsx` | `useState(createNativePlateOcrBinding)` retains one binding during this component lifetime. `useFocusEffect` binds lifecycle, calls `open`, and disposes on blur/unmount. Only starting/preview render CameraView; viewport remains 260px. |
| `native-plate-camera-controller.ts` | Owns `generation`, `mountId`, phase, size policy, fallback waiter and requested torch state. `open`, `configurePictureSizes`, `waitForCaptureFallback`, `ready`, `close` are distinct boundaries. |
| `native-plate-ocr-adapter.ts` | Owns exact ready callback generation/mount/ref checks and picture-size discovery. OCR ports delegate capture to the ROI boundary, and retry only an existing CameraCaptureFailure after one accepted fallback. |
| `native-plate-roi-binding.ts` | Owns camera ref, cameraMount, readyMount, geometry, revision, validated mapping and reading token. `validate` alone promotes actual production camera readiness. |
| `native-plate-roi-viewport.tsx` | Outer component and inner View use mountId keys. Stable ref callback closes over generation/mount. Ready/error/layout callbacks carry those identities. Rear, muted, unmirrored camera; transparent guide. |
| `native-plate-roi-metadata.ts`, `native-plate-roi-geometry.ts` | Native transform/dimension validation; capture checks geometry generation/mount/revision and actual image dimensions. No inferred mapping from requested sizes. |
| `native-plate-roi-capture.ts` | Snapshot ref/geometry, native capture, mapping/crop/render/save, JPEG budget fallback and cleanup. Native promise is not inherently cancelled by AbortSignal. |
| `native-plate-ocr-loop.ts` | One active operation across generations. 1200ms interval, at most five NO_MATCH attempts. `cancel` aborts/removes known file; operation remains until run's finally completes. |
| `native-plate-camera-lifecycle.ts`, `src/scanner/native-qr-lifecycle.ts` | Auth generation, identity purge, AppState and sticky Check-In phase/identity/location eligibility. Foreground does not itself reopen a closed scanner. |
| `src/scanner/native-camera-permission-lifecycle.ts` | Global pending OS camera permission count; non-active events deferred only while pending; settlement checks actual current AppState. Root owner uses the same permission-aware boundary. |
| `src/shell/native-production-lifecycle-owner.ts` | Background suspends workflows; foreground canonical authority revalidation can retire workflow scope. No modification here. |
| `app/_layout.tsx`, `app/index.tsx`, `src/shell/native-production-shell.tsx`, `native-production-workspace.tsx` | Root readiness/splash and explicit gate/workspace branches; camera-local diagnostics do not prove root rendering health. No modification here. |
| `package.json`, `app.json`, `app.config.ts`, root `patches/expo-camera@57.0.4.patch` | Expo ~57.0.19, camera ~57.0.4, React 19.2.3, RN 0.86.3; source-built camera and Android ROI metadata extension. The requested app-local patch path does not exist; actual patch is at repository root. |
| Installed `node_modules/expo-camera/android/.../ExpoCameraView.kt`, `CameraViewModule.kt` | `createCamera` launches coroutine binding; configure awaits ProcessCameraProvider, uses `unbindAll` then `bindToLifecycle`; OPEN emits ready, not a frame heartbeat. `OnViewDestroys` calls cleanupCamera, which cancels scope and calls provider `unbindAll`. Inspection only; installed/vendor code and patch unchanged. |

Normal flow, verified from current code:

1. Focus binds eligibility and calls `controller.open()`. Ineligible or already requesting/starting/preview opens return without another acquisition.
2. `open` increments generation, publishes requesting, awaits permission get; optionally awaits the existing permission-request wrapper. Each existing post-await generation/eligibility fence remains intact.
3. Granted result publishes starting, increments mountId and restores cached preferred size. A denied result publishes denied and does not render CameraView (mountId still increments).
4. React renders keyed viewport/CameraView. Ref attach and layout may arrive in either order. Layout computes guide, increments geometry revision/reading token; ready requires exact ref mount.
5. `binding.cameraReady(g,m)` rejects stale mounts/ref absence/non-starting phase. When pictureSize is undefined, it queries supported sizes, selects preferred/fallback, then rechecks exact mount and camera object.
6. A selected preferred size makes `configurePictureSizes` increment mountId **within the same generation**. The ROI subscriber clears old mount/ref/readiness/geometry and increments reading. Adapter returns without preview/OCR. React replaces the keyed view. Late old ref/ready/error callbacks are rejected by existing fences.
7. New ref/layout/ready reaches `roi.ready`, then `validate`. Current starting phase, readyMount=cameraMount=geometry.mountId, exact generation/mount/ref/geometry/read token are required. Native metadata must validate.
8. Current metadata success stores validated mapping, calls `controller.ready(g)`, publishes preview and starts the OCR timer. Cached preferred size on reopen skips discovery/remount.
9. Each OCR operation snapshots its owner. `capturePlateRoi` validates mapping, takes a full transient still, crops the real ROI, saves at quality 0.6 (then 0.45 only for oversize output), removes source/unused files, and hands only the validated cropped JPEG to recognition.
10. MATCH closes acquisition then fills editable draft and calls reviewIdentity. Explicit human Confirm is still separate. NO_MATCH schedules only the bounded existing attempts; terminal outcomes close then publish no-match/unavailable.

Capture fallback is separate from JPEG encoding fallback:

1. A current native takePicture rejection becomes CameraCaptureFailure. Generic mapping/crop/cleanup failures do not request a camera-size fallback.
2. Existing adapter catch requests `waitForCaptureFallback(g,signal)`. Aborted, stale, non-preview, absent fallback, already-used fallback or existing waiter returns false.
3. Accepted waiter registers AbortSignal listener, publishes starting with lower pictureSize, increments mountId, and marks captureFallbackUsed. The original OCR operation remains occupied.
4. React remount/ref/layout/ready/metadata sequence repeats. `controller.ready` publishes preview, resolves fallback true, and returns **without starting a second OCR loop**.
5. Original adapter continues its one retry with new validated mapping. Close/fail/abort resolves waiter false. There is no intrinsic waiter deadline or second automatic camera-size retry.

## Investigation questions answered from code

| # | Answer and limits |
| --- | --- |
| 1–2 | Controller owns generation and mountId. Open increments generation; close/fail invalidate it; sizes/fallback increment mountId without changing generation. |
| 3–4 | Production callbacks use ROI isMount plus ref identity for asynchronous sizes. A retired mount's ready cannot publish through this adapter. Controller.ready itself accepts only generation; direct callers without the binding would lack a mount fence. Current production caller is ROI.validate. |
| 5–6 | Size change synchronously invalidates old ROI mount via controller subscriber, then React remounts. An old ref detach is ignored; a new current ref replaces stored camera. JS detach is not proof that native cleanup finished. |
| 7–8 | Binding retains monotonic revision/reading counters across remount. Subscription invalidation clears camera/cameraMount/readyMount/geometry/validated and advances reading. Ref replacement clears validated/readyMount and advances reading, but retains same-mount geometry. Layout change replaces geometry, clears validated and advances revision/reading. During preview layout change closes to unavailable. |
| 9 | Metadata success rechecks reading, generation/mount, exact camera and geometry references. Ref/layout/generation replacement or background close invalidates it. Stale failures cannot trigger current geometryUnavailable under the existing catch fences. |
| 10–11 | Native capture/render/save promises can outlive abort/background/workflow retirement. Run checks current ownership and cleans late files; the operation slot remains occupied until finally completes. A new start can return false because that slot is occupied. This is deterministic source/test evidence of a possible stall, not evidence of the reported white surface. |
| 12 | Yes: an accepted fallback waiter has no deadline; missing ready/layout/metadata settlement can leave it pending until close/fail/abort. No timeout is added. |
| 13 | A genuine background is temporarily deferred while a permission request is pending. Once it settles, actual background revokes eligibility. A request that never settles extends deferral. Pending ownership is shared with other camera permission requests. |
| 14–15 | Existing remount-ID fences reject retired callbacks. Separately, current same-mount ref detach/reattach during preview clears validation/readiness while phase remains preview; validate requires starting. Source test records this mismatch without changing it. |
| 16 | Starting/error/etc render an absolute message-position View over the viewport. Its container has no opaque fill; text uses themed cameraMessageSurface with maxWidth 280. Guide is transparent and torch is bounded. No intended full opaque white CameraView overlay was found in these branches. Physical React inspection is still required for class B. |
| 17 | Root gesture View has opacity 0 until appearance is ready; splash is white and hiding requires layout+ready. Shell has explicit gate/workspace return branches, not an intended null root. Startup readiness, renderer exceptions, native surface failures or process loss cannot be excluded by source/tests. No camera trace is a React frame-health signal. |

Historical commits: #213 `f173ec9889d173ffdde715b320902b89d415067e` introduced mapping/patch/capture ownership; #226 `bc4fdb453fcae61e740c08941cff018257941468` adds requested torch state/reset and control. Historical proximity is not causation.

## Ranked, falsifiable hypothesis register

Ranking prioritizes experiments and discriminating evidence; it is not a probability estimate or a selected cause. All remain NOT PROVEN.

### H1 — Native provider/surface ownership overlap at remount

- Path/order: preferred/fallback remount → new Expo configureAndBindCamera binds process provider → retired view cleanupCamera unbinds provider, or old coroutine binding completes against a newer surface. Installed Expo uses provider-wide unbindAll in binding and cleanup.
- White mechanism/support: a current JS view could retain ready/ref state while native use cases/texture cease delivering frames. OPEN is camera state, not frame delivery.
- Against: normal view destruction/coroutine cancellation may serialize correctly; no observed reversed native order. Patch does not change use-case binding.
- Confirm: physical A/D after remount, current ready/ROI state, followed by native provider unbind or camera close tied to retired native view after new bind. JS ref events alone cannot prove native order; correlate CameraX/native logs or subsequently authorized native instrumentation.
- Falsify for a run: white occurs without remount, or independently measured current native stream remains healthy beneath a React overlay.
- Events: remount-request/transition, ref attach/detach, ready-callback, metadata success, native-error, native-capture start/result, AppState. If confirmed, fix boundary would be exact native view/provider lifecycle, after separate evidence review.

### H2 — Cancelled native capture retains the OCR active-operation slot

- Path/order: OCR run awaits capture → close/background abort → explicit reopen/new preview → start sees old operation → native promise remains pending. NativePlateOcrLoop.cancel does not free operation until finally.
- White mechanism/support: no subsequent captures/OCR and possibly a separately stuck native capture session; ordered unit test proves slot retention under an uncooperative promise.
- Against: this alone explains OCR stalling, not a full white preview; source generation fences prevent old plate publication.
- Confirm: old native-capture-start without result/cleanup, ocr-stopped with operationActive=true, newer preview followed by ocr-start-blocked. Demonstrate that stalled native work coincides with observed white class A/D.
- Falsify: failed run has no outstanding operation and new OCR capture starts normally.
- Events: capture/native-capture start/result, stop, start-blocked, discard, cleanup and close. If confirmed, fix boundary would be capture cancellation/retirement ownership, not arbitrary OCR timing.

### H3 — Same-mount ref replacement leaves preview without validated ROI

- Path/order: preview validated → current ref null/new ref → readyMount/validated cleared → ready callback calls validate in preview → early return.
- White mechanism/support: JS can advertise preview despite retired mapping; capture fails and may exit unavailable. Direct schedule test proves this state mismatch.
- Against: mount replacement normally uses a new key and starting phase; occurrence of same-mount ref churn on physical failure is unknown. Mapping invalidity does not inherently whiten a native surface.
- Confirm: same generation/mount ref change followed by roi-state phase=preview, validated=false, readyMount reset; no new metadata-start before failed capture.
- Falsify: physical ref identity and validated mapping remain unchanged/current throughout failure.
- Events: ref attach/detach ordinals, roi-state, ready-callback, metadata and capture failures. If confirmed, fix boundary would be same-mount ref/readiness association.

### H4 — Fallback remount never reaches validated ready

- Path/order: CameraCaptureFailure → fallback-wait → starting/remount → missing ready/layout or unresolved/failed metadata. Waiter has no intrinsic deadline.
- White mechanism/support: stalled starting camera can show an empty native rectangle with existing message over it; old OCR operation is waiting.
- Against: close/fail/abort settle waiter; fallback is bounded once. This cannot explain a run with no accepted fallback.
- Confirm: fallback-wait precedes white and no fallback-ready/aborted arrives; locate first missing ref/layout/ready/metadata event.
- Falsify: no fallback in failing run, or fallback-ready and continued native capture complete before white begins.
- Events: fallback request/wait/ready/aborted, remount transition, refs, layout, metadata and errors. If confirmed, fix boundary would be the specific missing fallback readiness/settlement path.

### H5 — Retired ready or picture-size discovery crosses ownership

- Path/order: old ready starts size query → remount/close/ref replacement → old completion/ready arrives. Adapter checks generation/mount and camera identity; controller.ready only checks generation.
- White mechanism/support: an unfenced publication would start preview/OCR for an unready newer surface. Required event ordering is plausible, but inspected adapter and tests reject it.
- Against: strong exact-mount/ref checks; new tests observe size-query-discard and stale ready/error rather than state publication.
- Confirm: an old callback is followed by a state change attributable to that old owner, bypassing the inspected guards. Do not infer this merely because an old callback arrives.
- Falsify: trace records stale callback/discard while current metadata independently establishes new preview.
- Events: ready-callback, size query start/complete/discard, selection, controller-state and metadata owner tokens. If confirmed, fix boundary would be the demonstrated callback caller/fence gap.

### H6 — Permission focus deferral conceals real background long enough to lose camera state

- Path/order: OS permission request pending → actual Home/background → deferral → request late/never resolves or focus returns before settlement. Root and scanner share pending-count mechanism.
- White mechanism/support: native Activity and JS eligibility can temporarily diverge. Tests show intended deferral and eventual revocation if still background.
- Against: ordinary background immediately closes; settlement rechecks actual state; normally permission settles quickly.
- Confirm: app-state background deferred=true and no settlement/revocation, or return to active with native camera unavailable while JS ownership persists. Distinguish permission dialog, notification shade and Home.
- Falsify: no pending permission and background-invalidation/controller-close occur before the failing native transition.
- Events: permission read/request/result/failure, AppState/deferred, eligibility, background and foreground. If confirmed, fix boundary would be exact permission/focus ownership handling.

### H7 — React presentation or root readiness covers/removes a healthy camera

- Path/order: camera remains current while React renders wrong phase/covering view, or root readiness/layout/splash/renderer fails.
- White mechanism/support: message overlay and initial root opacity/splash are actual surfaces; entire-root class C is outside camera readiness proof.
- Against: no opaque full camera overlay or intended empty production root found; render/style tests preserve current geometry and hierarchy. Startup opacity alone does not explain intermittent warm-scanner failures.
- Confirm: B has healthy native stream/capture under an independently identified covering React view; C lacks header/navigation/root while camera trace may continue or cease with runtime loss. Capture full-screen video and React/native hierarchy, not only ROI crop.
- Falsify: surrounding UI remains visible and responsive, inspected hierarchy has no covering view, native frames stop.
- Events: controller state, ref/error/capture continuity, lifecycle cleanup plus screen recording and debugger/native render evidence. If confirmed, fix boundary would be the proven presentation/root path.

### H8 — Crop/save/cleanup or external camera failure stalls beyond native readiness

- Path/order: native capture settles → crop/render/save/cleanup remains pending, or device camera OPEN is followed by a hardware/Activity resource failure without another JS ready/error.
- White mechanism/support: non-cancellable image operations can retain slot; native ready says nothing about continued frame health. Device-specific texture/resource failure is compatible with A/D.
- Against: mapping checks/file cleanup and existing failures are bounded where implemented; no device failure or real OOM observed. OCR provider failure alone normally exits to existing unavailable UI.
- Confirm: native-capture-success with no capture-success/failure/cleanup identifies post-native stage stall; native error/system evidence plus missing frame delivery identifies device/native boundary. Development's existing PLATE_OCR_NATIVE crop events may further narrow stage without media values.
- Falsify: capture/cleanup finishes and native frames stay healthy while the white root/overlay appears.
- Events: native and outer capture start/results, cleanup/failure, start-blocked, metadata, native-error; reviewed native logs. If confirmed, fix boundary would be only the demonstrated post-capture/native failure stage.

## Instrumentation and extraction

Enable only in an investigation build using `EXPO_PUBLIC_PLATE_CAMERA_TRACE=1` **before JS bundling or starting Metro**. Default is OFF in both development and release. Existing PLATE_OCR_NATIVE diagnostics remain unchanged and are __DEV__ only. This trace does not enable an OCR provider or bypass server OCR policy.

Each emitted line starts `PLATE_CAMERA_TRACE ` followed by one sanitized JSON record. Process-wide sequence numbers strictly increase; elapsedMs is monotonic performance time in milliseconds (not UTC, not duration since a specific open). Both reset on process/JS reload. Record process boundaries separately.

- workflowGeneration is a monotonically assigned **local camera-binding owner ordinal**, not a persisted session ID or the protected EmployeeCheckInSessionCore.sequence. That private sequence is not exposed or modified. identityGeneration is the Check-In identity generation at binding creation.
- generation/mountId identify the originating operation/callback when passed explicitly. currentGeneration/currentMountId and phase/currentPhase show the controller at emission. Async owners retain original generation/mount even after retirement; phase is the observed current phase, not a claim that the old mount remains active.
- refId is a per-binding WeakMap ordinal, never the native handle/object/string. A stale null ref callback cannot reliably identify its retired object; refId=-1 and current=false explicitly mark this, instead of assigning the current ref's ordinal.
- roi-state provides cameraMount, readyMount, attached, validated, geometryRevision, bindingRevision (layout revision counter), reading (metadata invalidation token), and ref ordinal. Reconstruct last state per binding; combine it with subsequent controller/ROI transitions.
- capture operationId is local to its OCR loop; attempt is bounded by existing OCR policy. A native capture resolution means the promise settled, not that a valid cropped JPEG reached OCR. capture-cleanup is slot settlement; capture-cleanup-failure marks failed file deletion.
- Ring holds at most 512 frozen sanitized records; readNativePlateCameraTrace returns a copy for an existing debugger. It is volatile and loses older records. Console streaming has no in-app accumulating array or disk history. Collect externally throughout the run, and verify sequence continuity. No per-frame logging, timer, recovery action or debug UI exists.
- Event names, keys, phase/AppState/reason vocabularies and dimension strings are runtime allowlisted. Dimensions may be finite fractional layout values. Errors emit only controlled classifications. No image bytes, recognized text, plate, customer/phone, credentials, URLs, raw payload or file URI is copied. Diagnostic sink exceptions are swallowed separately from acquisition errors.

Controlled event vocabulary (the source constant is definitive):

```text
workflow-created workflow-retired eligibility app-state
background-invalidation foreground-eligible open-request
permission-read permission-request permission-result permission-failure
controller-state mount-request ref-attach ref-detach roi-state ready-callback
size-query-start size-query-complete size-query-failure size-query-discard
size-selection remount-request remount-transition roi-layout
metadata-start metadata-success metadata-failure metadata-discard preview-validated
ocr-started ocr-start-blocked ocr-stopped ocr-finished
capture-start capture-success capture-failure capture-discard
native-capture-start native-capture-success native-capture-failure
capture-cleanup capture-cleanup-failure
fallback-request fallback-wait fallback-ready fallback-aborted
native-error controller-close lifecycle-cleanup torch-request torch-cleanup
```

Limits: JS ref attach is evidence of JS attachment, not native provider destruction, texture rendering, frame heartbeat or physical torch activation. Existing cameraReady is based on native OPEN. A/B/C/D require video and physical/debugger/native correlation; H1 cannot be proved by JS events alone. No hardware experiment was performed here.

## Exact physical protocol for the next operator

Use the originally affected physical Android device first, then a second representative device if available. Use synthetic plates/customers and a controlled account/location. Do not record real customer plates, phones, secrets, notifications or account settings.

1. Record DEVICE MODEL, manufacturer, ANDROID VERSION/API, APP BUILD SHA, JS/native build mode, patch hash and exact dependency versions, locale EN/AR, light/dark theme, permission state, network/provider mode, cold/warm launch and process/reload boundaries. Build SHA must be this branch's instrumentation commit, not the base SHA or an assumed installed version.
2. In the operator's build environment, set `$env:EXPO_PUBLIC_PLATE_CAMERA_TRACE = '1'` before the existing approved build/Metro command. Use the repository's actual build scripts and approved environment/signing configuration. Do not install Expo Go or change camera dependencies/patch. No build is executed by this repository-only task.
3. Before trials verify a workflow-created/open-request trace actually reaches the collector. For a USB-connected investigation binary, start `adb logcat -v monotonic ReactNativeJS:I '*:S' > issue-262-js-log.txt` in a separate terminal. Confirm PLATE_CAMERA_TRACE lines; do not assume every release binary forwards console output to that tag. If absent, use the existing Development Build/Metro console and export its stream; verify trace before proceeding. Do not add a debug overlay or gesture.
4. Record full screen with the device's existing recorder, or `adb shell screenrecord /sdcard/issue-262.mp4`, then `adb pull /sdcard/issue-262.mp4 .`. Keep recording within platform limits; make separate named clips per trial. Film surroundings/controls as well as the camera. Note operator action times and corresponding open/torch/background events for synchronization. Review/redact before sharing. Capture a short separate reviewed CameraX/system log if needed for H1/H8; raw native log text is not authorized as an application diagnostic payload.
5. Predeclare 10 trials per row below, then 30 uninterrupted scanner cycles. Log failure numerator/denominator, successful remount/fallback count and any path not reached. An unreached fallback is NOT TESTED, not passed. Use original fast operational cadence plus a separately marked rapid-navigation schedule; add no application delays.

| Trial | Exact action and trace checkpoint |
| --- | --- |
| Cold start | Fully close process, launch, enter Check-In, scanner. Record permission → initial mount → sizes → remount (if selected) → metadata → preview → capture. Repeat from cold launch. |
| Warm close/reopen | Reach preview, use existing Close camera, use existing open action. Record close/torch cleanup, new generation/mount, cached size behavior. |
| Manual / No Plate | Camera → Manual Entry → existing back to camera; separately Camera → No Plate → return. Verify old workflow disposal, fresh owner and unchanged controls. |
| Confirm / back | Successful synthetic candidate → Confirm Plate → Edit/back → camera. Do not auto-confirm or submit intake merely for testing OCR. |
| No-match / retry | Unreadable synthetic scene or controlled NO_MATCH provider; observe bounded attempts and existing retry. Distinguish UNAVAILABLE/rate limit from NO_MATCH. |
| Preferred remount | First scanner binding on a device with supported preferred size. Count size-query/selection, same-generation remount, new ref/layout/metadata and exactly one OCR start. |
| Fallback remount | Observe a genuine capture rejection on affected device; require native-capture-failure → fallback-wait → remount → metadata → fallback-ready → retry. If not naturally reachable, return NOT TESTED and deterministic test evidence. Any separately authorized fault injection must be labeled simulated, never a field reproduction; do not modify this build's capture policy to force it. |
| Torch | Toggle existing ON/OFF in preview, then close/reopen and each background schedule; note requested state versus actual illumination. Correlation is not proof that torch caused white. |
| Starting background | Home while starting (including size discovery / metadata when reachable) → foreground → observe idle/eligibility → existing explicit reopen. Record first missing stage. |
| Preview background | Home from validated preview → foreground → existing explicit reopen. Confirm no automatic stale camera resurrection. |
| Capture background | Use native-capture-start from external trace to align Home during in-flight capture → foreground → explicit reopen. Retain old/new owner traces, slot-blocked and late cleanup. If capture already finished, mark schedule NOT REACHED and report actual timing. |
| Permission | Fresh deny/grant; deny with no ask-again then existing Settings action; camera permission prompt transient interruption; separately Home while prompt pending; notification shade. Record deferred raw AppState and settlement rather than assuming all background is OS UI. |
| Check-In exit / resume | Leave Check-In → return; separately resume approved synthetic CHECKING_IN work through existing resume flow. Record disposal/owner changes. Reaching non-camera continuation is a legitimate result, not proof that scanner reopened. |
| Repeated cycles | 30 cycles across new synthetic intakes/open/close/manual/confirm, with alternating torch and background trials. Repeat in EN/light, AR/light, EN/dark, AR/dark without changing layout. Record unavailable combinations honestly. |

6. At each failure, keep the process alive long enough to collect the trace/video; do not immediately restart. Record the following exact evidence sheet:

```text
DEVICE MODEL:
ANDROID VERSION/API:
APP BUILD SHA / JS + native variant:
TRACE FILE / process segment:
SCREEN RECORDING / trial / failure time:
FAILURE CLASS: A CameraView rectangle white / B React overlay / C entire root white / D frozen native texture
LAST GOOD EVENT (sequence + event):
FIRST BAD OR MISSING EVENT (expected stage; absence alone has no timestamp):
workflowGeneration / identityGeneration:
originating generation + mountId / currentGeneration + currentMountId:
controller phase / AppState / permission-deferred:
ref attached + refId / cameraMount / readyMount:
geometryRevision / bindingRevision / reading / validated:
capture operationId + attempt / active or pending / aborted / last cleanup:
preferred remount occurred? / fallback accepted and settled?:
surrounding UI visible? / controls responsive? / actual torch state?:
native error or process/runtime evidence (reviewed/redacted):
failure count / attempted and reached count:
```

7. Classify A/B/C/D using full-screen video and hierarchy/native evidence. A and D may look identical in one screenshot; distinguish moving-frame delivery using a synthetic moving target and whether native captures still complete. Do not infer React overlay solely from whiteness or infer frame health from ready.
8. On separately reproduced failures, measure existing recoveries individually: close/reopen scanner; leave/return Check-In; existing navigation to Tasks and back; background/foreground; then process restart last. Record which smallest boundary restores BOTH live preview and valid ROI/OCR/torch. Do not chain recoveries on one incident and attribute success to an earlier step. Internal controller/binding/runtime reset experiments require separately authorized debugger work; none are added as product controls here.
9. Return trace + video + evidence sheets, counts, unreached schedules and confirm/falsify results for each hypothesis. Do not select a fix until the causal boundary is supported. A run without reproduction remains inconclusive.

## Verification evidence and review limits

Focused trace tests cover ordering/privacy/storage/sink failure; preferred remount and old ready/error/size completion; metadata after ref/layout/background retirement; existing same-mount preview mismatch; starting/preview/capture background; fallback ready/close/abort; A→B→A; permission deferral; torch close; native late promise cleanup; and identical rendered hierarchy/props in EN/AR and light/dark with trace on/off.

Existing focused camera/ROI/OCR/torch/permission/style regressions were run before the owner's later fast-validation instruction. No full repository suite, database harness, prebuild, APK build or physical reproduction was run. After that instruction, validation uses only changed trace tests and directly affected exact regression paths; passing unrelated coverage is not rerun.

Recorded local commands/results:

| Check | Result |
| --- | --- |
| Earlier exact camera/ROI/OCR/lifecycle/torch regression and initial trace paths | 24 files / 195 tests passed. The initial trace ordering assertion had first exposed a diagnostic-only mount/remount label defect; it was corrected before this passing run. No product policy was changed. |
| Adapter and UI trace paths added afterward | 2 files / 7 tests passed. |
| Final focused command below | 8 files / 54 tests passed. |
| Explicit late-capture Check-In retirement case subsequently added | Only `test/native-plate-camera-trace-lifecycle.test.ts` rerun: 10 tests passed; exact-file ESLint passed. Other passing tests were not rerun. |
| `pnpm --filter @valet/valet-native lint` after production code stabilized | PASS, zero warnings. |
| `pnpm --filter @valet/valet-native typecheck` | FAIL, the same five baseline diagnostics described below; no instrumentation diagnostic. |
| Diff and changed-file structure review | PASS: no whitespace errors; all 16 changed/new authored source/test files below 300 physical lines (maximum 294); no authored JSX/style/copy/navigation/theme changes. |

Final focused test command, run from `apps/valet-native`:

```powershell
pnpm exec vitest run test/native-plate-camera-trace.test.ts test/native-plate-camera-trace-roi.test.ts test/native-plate-camera-trace-lifecycle.test.ts test/native-plate-camera-trace-adapter.test.ts test/native-plate-camera-trace-capture.test.ts test/native-plate-camera-trace-ui.test.ts test/native-plate-ocr-loop.test.ts test/native-plate-roi-capture.test.ts
```

No command hung or required a timeout increase. Validation stops here; no broad confidence suite is added.

Native typecheck is **FAIL at baseline**: five diagnostics in four unchanged test files, all missing timezone in operational-context fixtures: native-incident-recovery-context.test.ts:36; native-push-route-denial.test.ts:35; native-push-route-lifecycle.test.ts:207; native-shift-retirement.test.ts:40,41. A read-only TypeScript compiler-host comparison substitutes actual base-commit source and excludes new root files; baseline and current diagnostic code/file/line sets are identical. These unrelated fixtures are not modified or chased. No clean package typecheck/overall Definition of Done claim is made.

Full architecture/monorepo gates are not run: they would inspect excluded Employee Web source and violate the owner's focused-validation instruction. Changed-file line policy, dependency direction, formatting and scope are reviewed separately. Physical UI acceptance and remote CI are not claimed. Current UI sources, hierarchy, styles, dimensions, copy, button props, navigation and themes have zero authored diff.

Next step: the physical Android operator must return the above evidence before any fix is selected. Keep Issue #262 open; no PR or merge is requested.
