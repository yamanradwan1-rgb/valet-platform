## 1. Planning baseline

**Issue #213 is feasible without backend changes, but exact preview-to-image mapping has one unresolved Native architecture dependency.** A JavaScript-only crop based solely on the captured image’s aspect ratio would not yet satisfy the issue’s accuracy requirement.

| Baseline item | Verified result |
|---|---|
| Repository | `veletpro0-lgtm/valet-platform` |
| Current `origin/main` | `6e086d7987668d20bf899c0c38d73576c3716cb0` |
| Verification | Fetched origin; independently checked remote `refs/heads/main`; rechecked before finishing |
| Local HEAD | Same SHA |
| Working tree | Clean before and after inspection |
| [Issue #213](https://github.com/veletpro0-lgtm/valet-platform/issues/213) | OPEN; six acceptance criteria; no comments |
| Work performed | Read-only inspection and ref update |
| Evidence level | STATIC VERIFIED; no implementation, test execution, native build, physical test, or CI claim |

Authority inspected includes [AGENTS.md](C:/Users/LP/Desktop/valet-app/valet-platform/AGENTS.md), [CONTRIBUTING.md](C:/Users/LP/Desktop/valet-app/valet-platform/CONTRIBUTING.md), the Blueprint bridge, structure rules, engineering/security/Definition of Done contracts, DEC-074 and its log mirror, and relevant camera, Native, authentication, offline, returning-recognition, Shift-eligibility, and OCR-configuration decisions: DEC-007, DEC-012, DEC-020, DEC-032, DEC-063, DEC-067, DEC-069, DEC-071, DEC-072, and DEC-083.

No conflict was identified between #213 and the inspected Accepted contracts. The owner’s restriction excluding Employee Web governs this investigation.

**Current-fact reconciliation**

| Fact | Result |
|---|---|
| A. CameraView inside scanner viewport; no real ROI pipeline | Confirmed. Absolute-fill camera inside a 260-unit-high viewport; no guide measurement or crop |
| B. Portrait orientation | Confirmed in Native app configuration |
| C. Capture targets and quality | Confirmed: preferred `1280×720`, lower target `1024×576`, qualities `0.6` / `0.45`. These are selection targets, **not proof of actual camera output dimensions** |
| D. Bounded OCR loop | Confirmed: 1,200 ms scheduling delay, five attempts, one operation in flight, no backlog |
| E. Still JPEG to existing OCR endpoint | Confirmed |
| F. JPEG-only bounded API; 1 MiB maximum | Confirmed: `1,048,576` bytes, MIME/size/JPEG-marker validation |
| G. Transient files and lifecycle deletion | Confirmed intent and normal lifecycle. The adapter owns files before handing a URI to the loop; file-inspection/deletion exceptions need stronger ownership coverage in the new pipeline |
| H. Existing image-manipulation dependency | Confirmed absent from Native dependencies, installed Native package boundary, and lockfile |

Two additional current facts matter:

- The API now honors typed Company OCR defaults and Location overrides before cost/provider work.
- Production OCR remains fail-closed under DEC-074 §22. #213 must preserve that behavior.

## 2. Current architecture trace

| Stage | Current owner and behavior |
|---|---|
| Preview | [native-plate-camera-step.tsx](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-camera-step.tsx): `NativePlateCameraStep` renders a muted rear `CameraView` |
| Binding/readiness | [native-plate-ocr-adapter.ts](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-ocr-adapter.ts): `createNativePlateOcrBinding` enumerates supported picture sizes and waits through the preferred-size remount |
| Camera lifecycle | [native-plate-camera-controller.ts](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-camera-controller.ts): `NativePlateCameraController` owns permission, generation, preview, terminal states, and one lower-resolution capture fallback |
| Attempt scheduling | [native-plate-ocr-loop.ts](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-ocr-loop.ts): `NativePlateOcrLoop.run` awaits capture, recognition, and deletion sequentially |
| Capture/file | `createNativePlateOcrPorts.capture`: `takePictureAsync({ quality, exif: false, base64: false })`; returns the full captured URI |
| Upload | [native-plate-ocr-client.ts](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-ocr-client.ts): `recognizeNativePlate` appends an Expo `File` to multipart and sends `POST /v1/staff/check-in/plate-ocr` |
| Authentication/HTTP | Existing Native bearer transport and portable `EmployeeClient`; the OCR POST is not automatically replayed after 401 |
| Shared contract | [plate-ocr.ts](C:/Users/LP/Desktop/valet-app/valet-platform/packages/contracts/src/plate-ocr.ts), re-exported through employee-client: location reference, country, bounded JPEG; `MATCH`, `NO_MATCH`, `UNAVAILABLE` |
| API validation | [plate-ocr.controller.ts](C:/Users/LP/Desktop/valet-app/valet-platform/apps/api/src/modules/check-in-api/plate-ocr.controller.ts): authentication guard before bounded multipart parsing; validation; buffer clearing in `finally` |
| API authority | [plate-ocr.service.ts](C:/Users/LP/Desktop/valet-app/valet-platform/apps/api/src/modules/check-in-api/plate-ocr.service.ts): persisted Location/actor authorization, exact-Location Shift eligibility, effective OCR policy, then cost guard |
| Provider | Snapshot-compatible adapter performs one bounded provider request and sanitizes the result |
| Result | Current-generation `MATCH` closes scanning, calls `session.setVehicle(...)`, then `session.reviewIdentity()` |
| Confirmation | Existing employee Confirm action alone calls `confirmIdentity()` and permits exact returning recognition |

The existing reusable boundary is `NativePlateOcrPorts`: capture returns one transient URI; recognition consumes that URI; removal disposes it. #213 should preserve that boundary and make the returned URI belong exclusively to the cropped JPEG.

## 3. Gap analysis against every #213 acceptance criterion

| Acceptance criterion | Current gap |
|---|---|
| Clearly indicate placement of the complete plate | Existing instructional text mentions a frame, but no actual plate guide exists |
| Upload the exact framed area plus margin | Full capture is uploaded; no crop occurs |
| Correct supported Android orientation/aspect mapping | No measured geometry, capture dimensions retained by the adapter, or authoritative preview-to-still transform |
| Physical improvement without systematic edge clipping | Existing issue reports incomplete candidates; no ROI comparison evidence |
| Preserve confirmation, editing, retries, Manual Entry, No Plate | Already implemented; must remain regression-protected |
| Regression tests for mapping/crop | Current tests cover capture, fallback, transport, lifecycle, and confirmation, but no ROI geometry/crop |

The largest gap is **information availability**, not the arithmetic itself.

Installed Expo Camera `57.0.4`:

- creates Android `PreviewView` with its default centered fill behavior;
- applies one resolution selector separately to Preview and ImageCapture;
- permits resolution fallback;
- binds the use cases without a shared `ViewPort`;
- does not expose preview resolution or preview-to-still transform through its JavaScript API.

CameraX selects final resolutions according to each use case and device capabilities. The requested picture size therefore cannot establish the preview’s actual source aspect or field of view. [CameraX ResolutionSelector documentation](https://developer.android.com/reference/androidx/camera/core/resolutionselector/ResolutionSelector)

CameraX’s documented guarantee that grouped outputs represent the same sensor area requires a shared viewport. That guarantee is not established by the current Expo binding. [CameraX configuration documentation](https://developer.android.com/media/camera/camerax/configuration)

## 4. Proposed architecture

**Decision classification**

| ID | Proposition | Classification | Evidence |
|---|---|---|---|
| L1 | OCR fills an editable draft and never confirms identity | LOCKED | DEC-074 §§3, 15; DEC-069 |
| L2 | Five attempts, single flight, no continuous processing or consensus | LOCKED | Owner constraints; DEC-074 §6 |
| L3 | Upload remains JPEG and ≤1 MiB | LOCKED | Owner constraints; current shared/controller contract |
| L4 | Images remain transient; generation/auth/lifecycle fencing stays intact | LOCKED | DEC-074 §§7–8; DEC-072 |
| L5 | No backend behavior, schema, history, provider, or cost-guard expansion | LOCKED | Owner constraints |
| L6 | Current server authority and Company→Location OCR policy remain authoritative | LOCKED | DEC-074; DEC-083; current service |
| D1 | Existing API can accept the cropped JPEG unchanged | DERIVED | Controller validates media, not full-frame dimensions |
| D2 | Expo ImageManipulator is a suitable device-side crop boundary | DERIVED | Installed SDK compatibility inventory and official API |
| D3 | Current JavaScript inputs cannot prove exact mapping across supported devices | DERIVED | Installed Expo native implementation and exposed API |
| D4 | Returning only the cropped URI preserves the loop/client boundary | DERIVED | Actual `NativePlateOcrPorts` contract |
| D5 | Original and derived files require ownership before loop handoff | DERIVED | Capture happens before the loop receives a URI |
| D6 | Scanner generation alone cannot distinguish all camera remounts | DERIVED | Picture-size fallback remounts within the same generation |
| U1 | How authoritative preview-to-capture mapping becomes available | UNRESOLVED | Requires choosing a maintained Native integration mechanism |

Falsification checks were performed for these **12/12 LOCKED+DERIVED conclusions**: confirmation calls, additional scheduling/replay, widened media validation, durable image sinks, backend/schema requirements, policy bypasses, API dimension restrictions, existing crop capability, exposed transform metadata, port incompatibility, pre-handoff cleanup ownership, and remount generation behavior were checked in their corresponding implementation/contracts.

**Common architecture, independent of U1**

1. Measure a camera-local host shared by CameraView and the guide.
2. Calculate and render one guide rectangle from those measured dimensions.
3. Snapshot guide geometry and camera mount identity before capture.
4. Capture one still.
5. Obtain a **verified** mapping into the actual processed image.
6. Expand the ROI, clamp, and round.
7. Crop on device and encode JPEG.
8. Verify the derived file’s size.
9. Return only that derived URI to the existing OCR loop.
10. Preserve existing result/confirmation handling.

**Guide presentation proposal**

These are reversible engineering defaults within #213, not new tenant configuration:

- Keep the current 260-unit viewport shell.
- Center the guide horizontally and vertically.
- Start with guide aspect `3.2:1`.
- Set width to `min(0.80 × viewportWidth, 520, 3.2 × 0.36 × viewportHeight)`.
- Derive height from width/aspect.
- Use a light outline with a dark outer stroke and visible corner brackets.
- Keep the interior clear; avoid covering digits.
- Use `pointerEvents="none"` and hide decorative pieces from accessibility.
- Keep instruction text outside the crop rectangle, using the existing status presentation.

Suggested existing hint replacements:

- EN: “Reading automatically… Keep the complete plate inside the guide.”
- AR: “جارٍ القراءة تلقائيًا… ضع اللوحة كاملة داخل الإطار.”

Use explicit physical `left`/`top` coordinates. Locale, text alignment, and RTL must not alter the guide’s physical position.

**U1 options**

- **Recommended:** authorize a narrow, opt-in extension of the installed Expo Camera boundary that exposes the actual preview-to-processed-image transform. Keep native image processing in Expo ImageManipulator.
- **Alternative:** explicitly approve a restricted, physically calibrated camera/device envelope for the simpler cover transform. This cannot silently be represented as coverage of the existing broader Android support policy.

Adding a `ratio` prop or assuming the requested picture size equals preview geometry does not close U1. It can change preview fit and still permits native resolution fallback.

## 5. Preview-to-image coordinate algorithm

**Coordinate spaces**

Keep these distinct:

- measured React Native preview-local layout units;
- native PreviewView pixels;
- raw still-buffer pixels;
- processed, upright JPEG pixels;
- normalized image coordinates.

Never use screen coordinates, navigation offsets, or status-bar dimensions.

**Centered-cover transform**

For a **verified common source field of view**, let:

- viewport dimensions be `Vw, Vh`;
- upright source-image dimensions be `Iw, Ih`;
- guide be `(gx, gy, gw, gh)` in preview-local coordinates.

Then:

```text
s  = max(Vw / Iw, Vh / Ih)
ox = (Vw - s × Iw) / 2
oy = (Vh - s × Ih) / 2

x0 = (gx      - ox) / s
x1 = (gx + gw - ox) / s
y0 = (gy      - oy) / s
y1 = (gy + gh - oy) / s

u0 = x0 / Iw
u1 = x1 / Iw
v0 = y0 / Ih
v1 = y1 / Ih
```

Negative offsets account for source areas hidden by fill cropping.

This formula is exact for its stated precondition. **The current repository does not establish that precondition across supported Android devices.**

**IF U1 selects authoritative Native transform metadata**

Use the actual camera matrices:

```text
Sv = sensor → native preview pixels
Sb = sensor → captured buffer pixels
R  = captured buffer → actual processed upright JPEG pixels
D  = layout units → native preview pixels

previewToProcessedImage = R × Sb × inverse(Sv) × D
```

CameraX provides `PreviewView.getSensorToViewTransform()` and `ImageInfo.getSensorToBufferTransformMatrix()`. These permit mapping between actual use-case spaces instead of guessing from dimensions. [PreviewView reference](https://developer.android.com/reference/androidx/camera/view/PreviewView), [ImageInfo reference](https://developer.android.com/reference/androidx/camera/core/ImageInfo)

For this branch:

- Snapshot the current native preview transform at capture.
- Carry the camera mount/layout identity with the capture.
- Compose `R` from the processing rotation actually applied to the returned JPEG.
- Convert all four guide corners.
- Normalize transformed coordinates by the returned JPEG’s actual width/height.
- Reject unavailable/non-invertible transforms, mismatched metadata, or changed layout/camera identity.
- Return no image or matrix into portable workflow state.

**Orientation**

Current capture uses `exif: false` and does not enable `skipProcessing`. The installed Android resolver physically applies EXIF rotation and returns dimensions from the resulting bitmap.

Therefore:

- Use returned `picture.width` / `picture.height`.
- Do not swap dimensions because the requested size string looks landscape.
- Do not rotate an already processed JPEG again.
- Preserve processing; explicitly keep `skipProcessing: false`.

For raw-buffer metadata, rotation of rectangle boundaries is:

```text
0°:   (x, y)
90°:  (Bh - y, x)       output dimensions Bh × Bw
180°: (Bw - x, Bh - y)
270°: (y, Bw - x)       output dimensions Bh × Bw
```

Those are boundary coordinates, so dimensions—not `dimension - 1`—are used.

The current Android implementation mirrors stills only when both `mirror` and front-camera conditions apply. Keep rear camera and explicitly set `mirror={false}`. Test asymmetric calibration targets to prove physical orientation and mirroring.

**Margin, clamp, rounding**

Proposed initial margin: **10% of the mapped guide width on each horizontal side and 10% of its height on each vertical side**.

```text
du = 0.10 × (u1 - u0)
dv = 0.10 × (v1 - v0)

left   = clamp(u0 - du, 0, 1)
right  = clamp(u1 + du, 0, 1)
top    = clamp(v0 - dv, 0, 1)
bottom = clamp(v1 + dv, 0, 1)

L = floor(left × Iw)
T = floor(top × Ih)
R = ceil(right × Iw)
B = ceil(bottom × Ih)

crop = { originX: L, originY: T, width: R-L, height: B-T }
```

Clamp integer edges again to image bounds. Reject non-finite inputs, non-positive dimensions, invalid guide bounds, empty crops, and an unexpanded guide that lies outside the image. Clipping a safety margin at an image edge is permitted; clipping the intended guide itself is not silently accepted.

**Deterministic example**

Given a verified `360×260` viewport and upright `720×1280` image:

- `s = 0.5`
- offsets `(0, -190)`
- centered guide `(36, 85, 288, 90)`
- source guide bounds `(72, 550)` to `(648, 730)`
- expanded/rounded crop: `{ originX: 14, originY: 532, width: 692, height: 216 }`

This becomes a golden unit-test fixture, not evidence that every device uses that mapping.

**Generation-safe measurement**

Tag geometry with scanner generation **and** camera mount identity/picture-size selection. The preferred-size and lower-size remounts require fresh measurement/readiness.

Use a keyed camera-local host so layout measurement runs for each mount. Late layout/readiness callbacks must validate their captured mount token. A layout change during capture invalidates that attempt and cleans its files; it must not silently create another five-attempt generation.

## 6. Dependency decision

Current Native environment:

| Package | Current resolution |
|---|---|
| Expo | `57.0.19` |
| Expo Camera | `57.0.4` |
| Expo FileSystem | `57.0.6` |
| React Native | `0.86.3` |
| React | `19.2.3` |
| Crop dependency | Absent |

**Selected crop mechanism:** `expo-image-manipulator`.

The installed Expo `57.0.19` compatibility inventory specifies **`~57.0.15`**, and registry metadata confirms that `57.0.15` exists. Use the installed SDK’s compatible range and lock the resolved version; do not upgrade Expo or Camera opportunistically.

Use the contextual API:

1. `ImageManipulator.manipulate(originalUri)`
2. `context.crop(integerRectangle)`
3. `context.renderAsync()`
4. `imageRef.saveAsync({ format: SaveFormat.JPEG, compress, base64: false })`

It supports pixel cropping and cache-file output on Android and iOS. Prefer it over the deprecated `manipulateAsync` interface. [Expo ImageManipulator documentation](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/)

Expected dependency changes:

- [Native package manifest](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/package.json)
- [pnpm lockfile](C:/Users/LP/Desktop/valet-app/valet-platform/pnpm-lock.yaml)

No root or Native `package-lock.json` exists. Do not introduce one. Coordinate the high-contention lockfile before implementation.

Adding a native library requires a **new Development Build**; Metro reload alone is insufficient. [Expo development-build guidance](https://docs.expo.dev/develop/development-builds/introduction/)

Rejected alternatives:

- FileSystem: manages files but does not crop pixels.
- Camera picture-size/quality options: do not represent the visible guide ROI.
- View capture/screenshots: capture presentation rather than the correct still-image ROI.
- Server cropping: unnecessary and violates the intended upload/privacy boundary.
- Heavy CV frameworks: unnecessary for rectangular cropping.
- Camera `PictureRef`: does not supply missing preview geometry and would broaden the current file-based capture change.

**U1 remains separate:** ImageManipulator solves cropping, not camera mapping. IF the Native metadata extension is approved, it needs a maintained package patch or equivalent CNG-compatible integration, its own tests, and a rebuilt binary. Direct edits to installed dependencies or generated native projects are not an acceptable deliverable.

## 7. File-by-file implementation plan

Current physical line counts were measured. Targets below are approximate implementation budgets; every authored file remains ≤300 lines.

**Definitely relevant existing files**

| File | Current responsibility / lines | Proposed change and size impact |
|---|---|---|
| [camera step](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-camera-step.tsx) | Presentation/actions; 223 | Delegate camera-host/guide rendering to focused viewport component; wire mount-tagged layout/readiness. Target 170–220 |
| [camera controller](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-camera-controller.ts) | Generation/readiness/fallback; 227 | Gate OCR on valid current geometry; distinguish same-generation remounts. Target 255–290 |
| [OCR adapter](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-ocr-adapter.ts) | Binding, capture, file, HTTP composition; 246 | Extract capture/derived-file preparation; preserve recognize/remove/accept integration. Target 170–230 |
| [capture policy](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-capture-policy.ts) | Picture sizes and quality; 94 | Preserve size selection; distinguish source-capture quality from ROI output quality. About +10–20 |
| [OCR diagnostics](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-ocr-diagnostics.ts) | Development-only sanitized diagnostics; 56 | Add closed numeric geometry/crop/cleanup fields; restrict values rather than accepting arbitrary URI-bearing strings. Target 90–140 |
| [English check-in copy](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/i18n/native-dictionary-en-check-in.ts) | Localized copy; 42 | Replace preview instruction; negligible growth |
| [Arabic check-in copy](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/i18n/native-dictionary-ar-check-in.ts) | Localized copy; 40 | Equivalent instruction; negligible growth |
| [Native package manifest](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/package.json) | Dependencies/scripts; 58 | One compatible crop dependency |
| [pnpm lockfile](C:/Users/LP/Desktop/valet-app/valet-platform/pnpm-lock.yaml) | Resolved dependencies | Corresponding importer/package/snapshot changes only; coordinated |
| [Native README](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/README.md) | Build/evidence instructions | Record rebuild requirement and privacy-safe ROI verification procedure |

**Proposed focused modules**

These names describe the common implementation split; they are not existing files:

| Proposed absolute path | Responsibility | Budget |
|---|---|---:|
| `C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-roi-viewport.tsx` | Keyed camera host, measurement, guide presentation; existing design tokens | 150–220 |
| `C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-roi-geometry.ts` | Pure guide sizing, verified transform application, margin/clamp/rounding | 140–220 |
| `C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-roi-capture.ts` | One attempt’s capture/fallback and original/derived-file ownership | 180–260 |
| `C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/src/check-in/native-plate-roi-crop-adapter.ts` | Narrow Expo manipulation/render/JPEG-save boundary | 80–140 |

Do not add a generic image-processing framework or shared utility dumping ground.

**Relevant existing test changes**

| File | Current lines | Change / budget |
|---|---:|---|
| [capture tests](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/native-plate-ocr-capture.test.ts) | 212 | Replace full-frame/recapture expectations with ROI handoff and re-encode expectations; ≤260 |
| [camera fallback tests](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/native-plate-camera-fallback.test.ts) | 227 | Fresh fallback-mount geometry and one-request proof; ≤285 |
| [camera presentation tests](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/native-plate-camera-step.test.ts) | 129 | Guide visibility/readiness/actions; ≤220 |
| [camera test fixture](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/native-plate-camera-step-test-fixture.ts) | 152 | Layout/mount callbacks and crop-aware binding mock; ≤220 |
| [confirmation tests](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/native-plate-ocr-confirmation.test.tsx) | 263 | Minimal crop-aware fixture changes; ≤290; place new lifecycle cases separately |
| [diagnostic tests](C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/native-plate-ocr-diagnostics.test.ts) | 260 | Adjust changed trace expectations; put ROI/privacy additions in a separate file |

Proposed new tests under `C:/Users/LP/Desktop/valet-app/valet-platform/apps/valet-native/test/`:

- `native-plate-roi-geometry.test.ts` — approximately 230–280 lines.
- `native-plate-roi-crop.test.ts` — approximately 180–250.
- `native-plate-roi-cleanup.test.ts` — approximately 220–280.
- `native-plate-roi-viewport.test.tsx` — approximately 180–250.
- `native-plate-roi-diagnostics.test.ts` — approximately 120–180.

Split orientation/matrix cases into another focused test if the geometry suite approaches 300.

**Conditional on U1**

IF the owner approves a maintained Expo Camera metadata extension, additionally plan:

- a version-specific package patch, provisionally  
  `C:/Users/LP/Desktop/valet-app/valet-platform/patches/expo-camera@57.0.4.patch`;
- its pnpm registration and lockfile metadata;
- a Native-only adapter consuming that metadata;
- focused native transform tests.

The exact integration mechanism and registration file must be fixed by U1 before claiming these as required artifacts. The extension must be opt-in for this plate flow and preserve existing default Camera behavior.

**Files that should remain unchanged**

- OCR API/controller/service/provider/config/cost-guard implementation.
- Shared OCR schemas and employee-client exports/workflow.
- Native OCR client and production telemetry vocabulary.
- Native plate lifecycle and shared QR lifecycle implementation.
- Native app configuration, unless the chosen U1 mechanism demonstrably requires a scoped plugin entry.
- Database/schema/migrations.
- Condition-photo and unrelated scanner code.
- Root dependency versions, workspace structure, and build architecture.

## 8. Tests

**Pure geometry**

Use numeric golden fixtures and invariant assertions covering:

- equal preview/image aspect;
- wider and taller viewport cases;
- horizontal and vertical cover cropping;
- portrait viewport versus landscape raw sensor buffer;
- 0/90/180/270-degree orientation handling;
- already-processed dimensions without double rotation;
- guide near each edge;
- margin expansion and all four clamps;
- outward integer rounding;
- deterministic repeated results;
- zero, negative, non-finite, tiny, and empty geometry;
- singular/unavailable transforms;
- layout-unit versus native-pixel scaling;
- asymmetric coordinates proving no RTL or rear-camera mirror;
- differing preview/still sensor crops **IF U1 selects Native transform metadata**.

Tests must not assert the unproven proposition that requested picture size determines preview geometry.

**Crop/ownership adapter**

Inject camera, manipulation, file inspection, and deletion boundaries:

- Exact integer rectangle reaches the crop operation.
- Saved format is JPEG; no base64.
- Original URI never reaches `recognizeNativePlate`.
- Uploaded URI is the derived URI.
- Original is deleted before successful handoff to the loop.
- One oversize ROI triggers one lower-quality save from the same rendered ROI.
- Both outputs oversize: zero HTTP requests.
- Crop/render/save/stat exceptions clean all known files.
- Abort during capture, render, and save cleans late-created files.
- Aborted lower-resolution fallback never dispatches HTTP.
- Deletion failure prevents accepting a successful candidate and is reported without URI/error text.
- Native image/context resources are released after use.

**Camera presentation**

- Guide appears with active preview.
- Loading, denied, error, unavailable, and no-match presentations remain truthful.
- OCR waits for current camera readiness and valid geometry.
- Preferred-size and fallback-size remounts require fresh measurements.
- Stale mount/layout callbacks cannot re-arm scanning.
- Manual Entry, No Plate, Retry, Close, and Back retain behavior.
- EN/AR copy and accessible instruction are present.
- RTL leaves physical crop geometry identical.
- Guide does not intercept controls.

**Loop and trust regressions**

Preserve existing suites proving:

- Five maximum attempts.
- No overlap while capture, crop, encode, HTTP, or deletion is pending.
- MATCH stops scanning.
- NO_MATCH alone schedules another bounded attempt.
- UNAVAILABLE stops and exposes fallback.
- Late generations cannot fill the draft.
- OCR never calls `confirmIdentity`.
- Returning recognition waits for explicit confirmation.
- Edit-before-confirm and selected country remain unchanged.

Also preserve the existing cancellation/reopen behavior; #213 must not introduce a queued generation or background restart while prior native work remains unresolved.

**Unchanged API/contract regression scope**

Run the existing:

- OCR shared-contract suite;
- provider/config/diagnostic suites;
- cost-guard suite;
- OCR HTTP and boundary-diagnostic integration suites.

These already cover two-principal cross-tenant access, inactive/revoked scope, current Shift, tenant policy, invalid media, and production denial. Add no backend behavior merely to generate new tests.

## 9. Physical Android verification plan

Use actual Android Development Builds for baseline and candidate.

Record:

- Full application/build SHA and native dependency resolution.
- Device model, Android version/API, build variant.
- Locale and RTL setting.
- Measured viewport dimensions/aspect.
- Requested preferred/fallback picture size.
- Actual processed capture dimensions.
- Verified transform/mount identity.
- Applied crop rectangle, output dimensions, JPEG bytes/quality.
- Capture, crop, encode, and total attempt durations.
- Attempt and HTTP counts.

Do not record image bytes, file URIs, plate text, credentials, or provider payloads.

**First prove geometry**

Use a non-sensitive asymmetric calibration target with distinct corner marks:

1. Position it at the guide’s center and each edge.
2. Verify the transient crop includes the framed target plus margin.
3. Confirm left/right and top/bottom orientation.
4. Repeat after preferred/fallback remounts, close/reopen, and layout changes.
5. Verify actual upload bytes are the derived JPEG, not merely that a rectangle was calculated.

Any temporary inspection surface must be development-only, outside workflow persistence, and delete files immediately afterward. Use synthetic imagery for retained automated fixtures.

**Then compare plate accuracy**

Suggested initial comparison: **120 paired scan cycles per physically tested device**, stratified across:

- bright/lower-light conditions;
- near/mid/far usable distances;
- steady hand/slight movement;
- centered plate/first character near left edge/last character near right edge;
- multiple relevant supported plate forms and lengths.

Alternate baseline/candidate order. Each cycle retains the accepted five-attempt maximum. Observe the complete real plate and candidate in person; retain only outcome categories, not plate strings or imagery.

Measure separately:

- complete candidate on first attempt;
- complete candidate within the bounded generation;
- incomplete MATCH;
- missing first/last/internal character;
- NO_MATCH/UNAVAILABLE;
- latency, bytes, and requests.

Respect server rolling limits; do not disable cost guards for the comparison.

“Materially improved” requires a reproducible reduction in incomplete-digit outcomes, with no systematic first/last-character clipping, no request-budget increase, and no meaningful usability/latency regression. Report paired counts and uncertainty. The sample count is a proposed experiment, **not an Accepted production SLO**. Expand an inconclusive sample instead of declaring success.

Exercise MATCH→Confirm, edit-before-confirm, NO_MATCH, Retry, Manual Entry, No Plate, Close/Back, background, logout, and EN/AR.

DEC-071 requires Android 10/11/13/15/16 coverage and Samsung, Pixel/reference, and representative mid-range families. Include at least a real Samsung/mid-range device; emulators supplement physical camera evidence.

## 10. Privacy/security/lifecycle preservation

**Transient ownership**

| Situation | Required ownership/cleanup |
|---|---|
| Capture resolves | Capture pipeline immediately owns original URI |
| Crop succeeds | Pipeline owns original plus derived URI |
| Before loop handoff | Delete original; hand off only bounded ROI URI |
| Crop/render/save failure | Delete original and every known derived output |
| Abort during native work | Mark attempt cancelled; when native work returns, register and delete its output before returning |
| HTTP failure / NO_MATCH / MATCH | Existing loop removes handed-off ROI in `finally` |
| Close / Back / Manual / No Plate | Existing generation cancellation plus pipeline abort cleanup |
| Unmount/background/auth change | Same fencing; late output is cleanup-only |
| Lower-resolution capture fallback | Failed capture’s known files disposed; new mount requires fresh geometry |
| Oversize primary ROI | Delete it before lower-quality save; reuse in-memory cropped image |
| Oversize fallback ROI | Delete it and stop unavailable; no upload |
| Deletion fails | Bounded retry in cleanup/finally; suppress candidate acceptance; sanitized failure classification |

The pipeline needs an in-memory set of owned URIs so exceptions from file inspection cannot lose ownership before loop handoff. This set is private adapter state—not navigation/session state, telemetry, or durable storage.

Deletion cannot be guaranteed when the OS denies it or the process is killed. Do not claim `finally` proves process-death cleanup. Physical failure tests must distinguish graceful cancellation from force-stop/kill and inspect residual cache behavior. No broad cache deletion or durable OCR recovery system belongs in #213.

**Image quality and size sequence**

Proposed policy:

```text
capture processed still at highest JPEG quality
→ validate actual image/mount geometry
→ crop and render ROI
→ save ROI JPEG at existing primary quality 0.6
→ inspect existence, positive size, dimensions, ≤1 MiB
→ if oversize, delete output and save same rendered ROI at 0.45
→ inspect again
→ return ROI URI or fail unavailable
```

- Preserve the existing `0.6`/`0.45` constants as **upload-output** qualities.
- Add a distinct source-capture quality of `1.0` to avoid applying the old lossy compression before the crop.
- Source capture remains JPEG; highest quality is not a claim of lossless encoding.
- Full-source byte size is not the API upload size.
- Do not resize or upscale the ROI initially.
- Retain the existing one lower-resolution camera retry for an actual capture exception.
- Do not recapture solely because the ROI output is oversized.
- Never fall back to uploading the full original.

If device evidence shows quality/resolution problems, tune these reversible acquisition settings within #213; do not add consensus/provider changes.

**Authorization proof**

#213 adds no protected business mutation. The unchanged external-cost ordering remains:

1. Resolve current authenticated Staff principal.
2. Validate bounded media and metadata.
3. Resolve target Location and Organization from persistence.
4. Prove active User/membership/Organization/Location, explicit access, operational role, intake eligibility, and exact-Location active Shift.
5. Read effective typed OCR policy under existing transaction/lock ordering.
6. Commit/release authorization transaction.
7. Acquire existing server-derived cost guard.
8. Perform provider I/O.
9. Release guard and clear transient input buffer.

No audit/domain write is introduced. Locks remain released before remote I/O, as the current Accepted policy requires. A later NO_MATCH request re-authorizes; timeout/lost response is not automatically replayed.

## 11. Server/provider load impact

For generation `g`:

```text
attempts(g) ≤ 5
HTTP dispatches per attempt ≤ 1
provider calls per accepted HTTP request ≤ 1

therefore HTTP dispatches(g) ≤ 5
and provider calls(g) ≤ 5
```

Cropping, encoding fallback, and lower-resolution camera fallback stay **inside the same awaited capture operation**.

Preserve:

- Same endpoint and multipart contract.
- Same five-attempt generation.
- Same single-flight loop.
- Same 1,200 ms delay before the next attempt.
- Same POST no-replay behavior.
- Same cost guard and production fail-closed state.

The delay is currently scheduled after work completes; it is not a fixed 1.2-second frame rate. Additional crop time may slow attempts but must not cause catch-up requests.

Prevent accidental extra work by:

- Starting the loop once after final readiness/geometry.
- Resolving a fallback remount’s existing operation instead of starting another.
- Encoding fallback without calling recognition.
- Keeping guide/layout effects free of HTTP dispatch.
- Requiring explicit Retry after terminal outcomes.

Cropped uploads should usually reduce bytes, but measure this; it is not guaranteed for every JPEG.

## 12. Risks and mitigations

| Risk | Mitigation | Proof |
|---|---|---|
| Wrong preview transform | Close U1; no guessed common field of view | Native metadata/calibration evidence |
| First/last characters clipped | Complete-plate instruction, 10% margin, outward rounding | Edge fixtures and physical plate samples |
| Incorrect orientation/mirroring | Actual processed dimensions; rear/non-mirrored camera | Asymmetric target and rotation tests |
| Guide mismatch after remount | Mount-tagged measurements/readiness | Preferred/fallback stale-callback tests |
| ROI too low-resolution | No additional resize; measure crop pixels | Distance/form accuracy comparison |
| Excessive JPEG compression | High-quality source; encode ROI once; bounded fallback | Fine-digit/light-condition comparison |
| Stale geometry | Snapshot revision; invalidate changed layouts | Deferred capture/layout race tests |
| Native dependency/build impact | SDK-compatible package; rebuilt binary | Clean CNG build and native-module smoke |
| Temporary-file leaks | Ownership before every fallible stage | Failure injection and cache inspection |
| Increased capture time | Bounded selected sizes; measure stage durations | Mid-range physical timings |
| Attempt timing drift | Preserve completion-plus-delay scheduling | Fake-clock and slow-native-work tests |
| Low-end Android memory pressure | One operation; release native references promptly | Repeated-cycle device test |
| Provider accuracy regression | Same provider/config; paired experiment | Full-digit/no-read comparison |
| UI obstruction/accessibility | Clear interior, structural outline, instruction outside ROI | TalkBack, font scaling, EN/AR checks |
| Accidental server crop/load | No backend change; upload derived file only | Multipart adapter assertion |
| Extra provider calls | One recognition invocation after final encode | Dispatch counters and cost-guard regression |
| Hard process death | Separate from graceful cleanup; no false guarantee | Kill/force-stop residual-cache evidence |

## 13. Implementation sequence

1. **Resolve U1 first.** Fix the mapping mechanism and its maintenance ownership. Do not land a cosmetic guide with guessed crop math.
2. Create the owner’s implementation branch from refreshed main; coordinate lockfile and any package-customization files.
3. Record the selected Native integration contract and evidence protocol before code.
4. Add the compatible image-manipulation dependency.
5. Implement pure geometry with golden fixtures.
6. IF U1 selects metadata integration, implement and verify that boundary before connecting OCR uploads.
7. Implement crop/JPEG adapter and per-attempt file ownership.
8. Add guide viewport and mount-safe layout/readiness.
9. Connect the pipeline through `createNativePlateOcrPorts.capture`; preserve loop/client/accept behavior.
10. Update focused tests and sanitized diagnostics.
11. Run focused validation, then repository gates.
12. Build/install the new Android Development Build.
13. Pass calibration, lifecycle/failure, and paired accuracy protocols.
14. Obtain observed CI and human review before merge.

Checkpoints:

- Geometry unavailable or mismatched: stop unavailable with manual/no-plate access.
- Crop/cleanup/request-count failure: do not advance to physical acceptance.
- Geometry calibration failure: repair the mapping boundary before accuracy testing.
- Accuracy regression/inconclusive result: keep #213 open; no consensus addition.
- Rollback: revert the complete scoped dependency/integration change, not selectively leave a guide implying an unapplied ROI.

## 14. Validation commands

**These are future implementation commands; none were run during this planning task.**

Focused checks from repository root:

```powershell
corepack pnpm --filter @valet/valet-native exec vitest run test/native-plate-roi-geometry.test.ts test/native-plate-roi-crop.test.ts test/native-plate-roi-cleanup.test.ts test/native-plate-roi-viewport.test.tsx test/native-plate-roi-diagnostics.test.ts

corepack pnpm --filter @valet/valet-native test

corepack pnpm --filter @valet/contracts exec vitest run src/plate-ocr.test.ts

corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/plate-ocr-provider.test.ts test/plate-ocr-provider-diagnostics.test.ts test/plate-ocr-cost-guard.test.ts test/plate-ocr-http.integration.test.ts test/plate-ocr-boundary-diagnostics.integration.test.ts

corepack pnpm --filter @valet/valet-native lint
corepack pnpm --filter @valet/valet-native typecheck
```

The API command uses the existing ownership/resource-budget harness; its PostgreSQL suites need the documented test database.

Repository-required checks:

```powershell
corepack pnpm architecture:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
git diff --check
```

Native configuration/build:

```powershell
corepack pnpm --filter @valet/valet-native config:public
corepack pnpm --filter @valet/valet-native prebuild:android
corepack pnpm --filter @valet/valet-native android
```

Use the existing generated-project procedure and organization-controlled build configuration. Repository build success does not prove APK/runtime behavior.

Mandatory root checks remain required; the implementation must not inspect or change the excluded application to address unrelated failures.

Observe remote required CI separately. Local green commands are not CI VERIFIED. The plan was not saved to a file, so the guardian’s saved-plan audit script was not applicable.

## 15. Acceptance-criteria traceability table

| #213 criterion | Implementation artifact | Automated proof | Physical proof |
|---|---|---|---|
| Complete-plate placement guide | Scoped viewport/guide and localized hint | Guide states, dimensions, accessibility, RTL tests | Visible guide across device widths, EN/AR, font scaling |
| Exact framed area plus margin produces upload | Verified geometry + crop adapter + capture ownership | Exact rectangle; derived-only multipart; no full-frame fallback | Calibration target and actual cropped-upload inspection |
| Correct Android orientation/aspect mapping | U1-selected mapping boundary; pure geometry | Rotation, cover axes, native/layout scaling, remount cases | Device/aspect matrix and asymmetric calibration |
| Improved full-digit recognition without systematic edge clipping | Guide, margin, quality policy | Boundary inclusion and quality-path tests | Paired full-digit/incomplete-MATCH comparison |
| Existing confirmation/edit/retry/manual/no-plate behavior | Existing loop/session flow preserved | Confirmation, lifecycle, fallback, five-attempt regressions | Complete employee workflow in EN/AR |
| ROI mapping/crop regression coverage | Focused geometry/crop/cleanup suites | Golden fixtures, failure injection, request counters | Device calibration supplements mocked/native-unit evidence |

Explicitly out of scope: Employee Web, multi-frame consensus, automatic confirmation, fuzzy returning recognition, provider replacement or provider-specific public contracts, server computer vision/cropping, OCR history/storage, image persistence, schema/migrations, condition photos, flashlight/torch #226, unrelated redesign/scanner refactors, production cost-guard redesign, and larger API image limits.

## 16. Final readiness verdict

**DECISION REQUIRED**

**U1 is the only identified architecture blocker:** current Expo Camera JavaScript inputs do not establish the exact relationship between the rendered preview and processed still across supported Android configurations.

The smallest recommended owner decision is to authorize a **maintained, opt-in Native camera metadata extension**, confined to this plate flow, that exposes the authoritative preview-to-processed-image mapping while preserving Expo/CNG, existing camera defaults, the OCR API, and iOS-compatible adapter boundaries.

Once that mechanism is fixed, the common crop, ownership, UI, request-budget, and verification plan above can proceed. Physical accuracy and failure evidence remain completion gates.

The [planning guardian](C:/Users/LP/Desktop/valet-app/valet-platform/.agents/skills/vaylet-planning-guardian/SKILL.md) requires: “Never return `READY TO IMPLEMENT` while an implementation-critical `UNRESOLVED` item remains.” U1 meets that condition; treating the simple cover formula as proven would leave #213’s central acceptance criterion unresolved.

## Owner Decision Addendum — U1 (Authoritative)

**Owner decision:** U1 is approved. Authorize the narrow, opt-in Native camera metadata extension for Issue #213 only. It must expose the authoritative preview-to-processed-image transform required for ROI mapping, remain isolated to the Native plate OCR flow, preserve existing Expo/CNG behavior and default camera behavior everywhere else, introduce no backend/API/schema changes, and keep cropping on-device through the SDK-compatible image-manipulation boundary. Do not broaden this into a generic camera framework or shared camera abstraction.

This Owner decision resolves the U1 architecture choice for implementation. The plan above remains otherwise unchanged; physical accuracy and failure evidence remain completion gates.

## Owner UI Freeze Condition — Issue #213 (Authoritative)

**The UI is frozen. No redesign or discretionary UI change is permitted under Issue #213, regardless of implementation difficulty. The overall screen must remain 100% visually consistent with the current original Native UI.**

- Preserve the existing screen shell, navigation, hierarchy, camera viewport footprint, surrounding layout, button order, button placement, button sizing, spacing, typography, colors, cards, headers, actions, and interaction flow.
- The only permitted visual addition is the minimum plate framing guide required by Issue #213 inside the existing camera viewport, plus only the minimal EN/AR instructional copy already required by this plan. Those additions must use the existing design tokens and presentation language and must not change the overall composition.
- The framing guide must be implemented as an overlay within the existing camera viewport. It must not resize the viewport, move surrounding controls, change screen height/composition, or trigger a broader visual refactor.
- RTL/LTR and EN/AR support must preserve the same physical UI composition; localization must not redesign or rearrange the screen.
- Do not introduce a new design system, new visual style, new card treatment, new navigation pattern, or unrelated visual cleanup.
- If a technical approach would require broader UI changes, do not make those changes. Keep the current UI intact and solve the requirement behind the existing presentation boundary; if that is impossible, report the blocker instead of redesigning the UI.
- Implementation review must include a visual-regression check proving the general UI remains 100% consistent with the original screen apart from the narrowly authorized framing-guide/instruction addition.

