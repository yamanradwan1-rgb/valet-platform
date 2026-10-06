# Issue #269 — ROI metadata diagnostic investigation

Baseline: `6bc4a15f0cc17734bf61d16ec16341ddb2f37d34`.

This note records static evidence only. No Android application build, Gradle task,
ADB command, emulator run, or physical-device test was used for this investigation.

## Strongest finding

The repository correctly registers `patches/expo-camera@57.0.4.patch` through
pnpm and configures the Native app to build `expo-camera` from source. At the
start of this investigation, however, the active local dependency installation
resolved to an unpatched `expo-camera` tree: `PlateRoiMetadata.kt` was absent and
the installed `ExpoCameraView.kt` / `ResolveTakenPicture.kt` had no VAYLET ROI
hooks. This is proven for that local dependency state and exactly permits a
normal Expo picture result with no `plateRoiMetadata`. It does not by itself
prove that diagnostic Build 3 was produced from that same stale installation.

Running the maintained pnpm patch workflow and a frozen install caused the
Native app's `node_modules/expo-camera` link to resolve to the patched package.

## Metadata path and drop points

`CameraView.takePictureAsync()` calls `ensurePictureOptions()`, which returns the
same options object and therefore preserves the VAYLET field. The patched native
`PictureOptions` record declares `plateRoiMetadata: PlateRoiRequest?`, containing
the generation, mountId, and revision fences.

The native ROI path can reject before ImageCapture when the request is for the
wrong lens, PreviewView metadata cannot be sampled, the ImageCapture use case is
missing, or the requested processing mode is incompatible with ROI metadata.

After ImageCapture succeeds, camera identity, ImageCapture use-case identity,
and a second PreviewView snapshot are checked. The original implementation
converted any failed predicate or preview-to-buffer transform into `roi = null`
and still continued through `ResolveTakenPicture`.

`ResolveTakenPicture` previously inserted the nested metadata bundle only when
all processing guards passed. EXIF/mirroring/additional EXIF, downsampling,
unsupported orientation, absent capture metadata, raw-size mismatch, rotation
mismatch, output-size mismatch, processing OOM fallback, or an invalid final
matrix could therefore produce a valid URI/width/height response with no ROI
metadata. Issue #269 hardening rejects ROI-requested captures at those boundaries
with a bounded diagnostic code instead of returning partial success.

## Candidate matrix

| Candidate | Static classification | Evidence |
| --- | --- | --- |
| Custom option dropped by `ensurePictureOptions` | RULED OUT | The function returns the same options object. |
| Native request record cannot decode ROI request | RULED OUT in maintained patch | `PictureOptions` has a typed `PlateRoiRequest?` field. |
| Maintained patch absent from installed dependency | PROVEN locally; Build 3 linkage requires provenance | The initial active installed source had no ROI patch while lock/workspace registered it. |
| PreviewView metadata unavailable | POSSIBLE | Snapshot returns null for missing transform, nonpositive dimensions, or invalid/noninvertible matrix. |
| Rear-camera/lens mismatch | POSSIBLE | ROI mapping is valid only for the back-camera path. |
| Camera object changed before capture success | POSSIBLE | Identity guard exists and can fail during lifecycle changes. |
| ImageCapture use case changed | POSSIBLE | Identity guard exists and can fail during rebinding. |
| PreviewView transform changed | POSSIBLE | A second snapshot is intentionally checked at capture success. |
| Exact FloatArray matrix equality | LIKELY runtime candidate, not proven root cause | `contentEquals` requires bit-identical floats from two samples. Static code cannot prove CameraX emits drift on the affected device. |
| Preview-to-buffer composition invalid | POSSIBLE | Inversion/composition validity checks can reject. |
| Raw JPEG dimensions differ from ImageProxy buffer | POSSIBLE | Processing validates exact dimensions. |
| CameraX rotation differs from EXIF-applied rotation | POSSIBLE | Processing validates exact rotation. |
| EXIF orientation unsupported | POSSIBLE | Only normal/90/180/270 orientations are accepted. |
| Processed bitmap dimensions differ from expected upright dimensions | POSSIBLE | Exact output dimensions are required. |
| OOM/downsampling path | POSSIBLE | Downsampling or rotate OOM invalidates ROI processing. |
| Metadata generated but not inserted into response | PROVEN possible before hardening | `processed(...) == null` skipped `putBundle` while the picture still resolved. |
| JS response serialization drops a valid nested Bundle | PHYSICAL EVIDENCE REQUIRED | No static evidence in this code path proves such a drop. |
| JS validator rejects otherwise-present metadata | POSSIBLE | Invalid dimensions/matrix are deliberately rejected; bounded diagnostics now distinguishes this. |
| Generation mismatch | POSSIBLE | JS fence rejects stale metadata. |
| mountId mismatch | POSSIBLE | JS fence rejects stale mount metadata. |
| Revision mismatch | POSSIBLE | JS fence rejects stale geometry metadata. |

## `PlateRoiPreview.matches()` review

Both snapshots come from the same `PreviewView`, but at different times: one is
captured immediately before `ImageCapture.takePicture()` and the second is read
inside `onCaptureSuccess`. The guard protects against binding a stale
preview-to-sensor relationship to an ImageProxy produced after camera/preview
state changed. Width/height plus lifecycle identity alone do not prove that the
transform stayed stable, so removing the matrix guard would weaken the race
fence.

The current implementation uses exact `FloatArray.contentEquals`. A one-ULP
change therefore fails the guard. Static inspection does not establish whether
CameraX recomputes numerically equivalent transforms with harmless float drift
on the affected device. No arbitrary tolerance is introduced here because a
safe tolerance would need an explicit geometric error bound. The next physical
run can now distinguish this candidate through `OCR_CAPTURE_METADATA_PREVIEW_CHANGED`.

## Telemetry semantics

Before this change, an exception in the capture/recognize chain recorded
`capture-unavailable`, converted the local result to `UNAVAILABLE`, and then
recorded that terminal result as `provider-unavailable`. The latter did not prove
that an OCR HTTP request was dispatched. Capture-chain failure now records its
single capture-unavailable event; ROI diagnostic failures attach a bounded
`OCR_CAPTURE_METADATA_*` errorCode that the existing Support Diagnostics view
already renders.

No diagnostic reason contains plate text, customer data, image bytes, image
URI/path, provider payload, auth/session tokens, matrix values, exception text,
or stack traces.
