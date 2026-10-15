# Issue #215 — P6 Physical Android Acceptance Protocol

Status: **NOT RUN** until an owner-authorized physical Android device, signed test build and an independently attested isolated qualification API/PG/private versioned object store are available. This protocol is not evidence of device execution.

## Evidence record for each test run

Record before performing any operation:

- Android device manufacturer/model, OS/API version (initial floor Android 10/API29), build fingerprint, app package identifier, hardware camera and connectivity class.
- App build SHA and test artifact/build job ID; integration candidate API SHA, PostgreSQL 16/17 version, storage provider/image digest, bucket alias (nonsecret), and task-owned identity/attestation record.
- Locale (`en`/`ar`), direction (LTR/RTL), theme (Light/Dark), screen size/density, font scale, accessibility/TalkBack enabled/disabled and permissions at start.
- Synthetic employee/company/Location/session identities, synthetic test vehicle, policy Company default and Location override. Record only disposable IDs; never photograph a real vehicle/customer or put secrets, bearer tokens, private object URLs, GPS EXIF or phone numbers in screenshots/logs.
- Device capture time, test-case code, result PASS/FAIL/NOT RUN, exact observed HTTP request/response diagnostic safe codes, server audit ID, selected attempt/version and verified canonical byte hash (hash only), and cleanup result.

## Preconditions

1. Confirm the signed APK's build commit equals the review candidate, and the API is the pinned integrated SHA. Production, current owner VPS and unrelated customer data are out of scope.
2. The isolated API must run under an explicitly authorized and documented **test-only** condition-photo qualification configuration; `trustedQualificationStore()` is currently `NODE_ENV=test` gated. No production provider or public bucket is approved. If this gate cannot be safely satisfied, mark all required-photo positives BLOCKED and run the safe negative/optional cases only.
3. Verify PostgreSQL and private versioned MinIO/provider ownership with live IDs, labels, loopback or otherwise explicitly owned endpoint, bucket versioning, restricted IAM and exact role separation. Verify public anonymous HEAD/GET denied. Synthetic JPEGs only.
4. Record the expected current policy. REQUIRED may be Company default or Location override. OPTIONAL must finish with zero photos while storage is unavailable.
5. Install an authorized, non-production test APK; disable other apps that could capture real customer photos, enable safe test logs only, and verify private cache is empty before starting. Do not publish private images to gallery.

## Required scenario matrix

| ID | Procedure | Expected evidence | Status |
| --- | --- | --- | --- |
| N01 | First camera launch, grant permission | Camera opens; still JPEG capture available, no crash | NOT RUN |
| N02 | Deny camera permission, deny permanently and open Settings | Recoverable localized denial and Settings path; no fake upload | NOT RUN |
| N03 | Required Condition: take a fresh still image, review, retake, confirm second photo | Only confirmed new image is uploaded; first temporary capture cleaned | NOT RUN |
| N04 | Inspect actual multipart request over authorized connection | Authenticated Staff bearer, UUID operation, actual JPEG file body; no URI JSON/object key from client | NOT RUN |
| N05 | Verify JPEG decode/canonicalization on server | EXIF/GPS stripped, dimensions/pixels/8MiB and decoder budget enforced | NOT RUN |
| N06 | Inspect MinIO exact version and PostgreSQL journal | T1 operation/attempt, exact immutable private version, readback hash and VERIFIED + SELECTED + AVAILABLE + once audit | NOT RUN |
| N07 | Complete Condition then final Check-In under REQUIRED | New trusted receipt and current policy; `CHECKING_IN` → `AWAITING_PARKING` via CAS; correct audit, no Task/Dispatch/Key Custody | NOT RUN |
| N08 | OPTIONAL, zero photos, disconnect MinIO completely | Condition and Check-In still succeed without object store or added photo affordance delay | NOT RUN |
| N09 | Upload wrong MIME/fake JPEG/oversize via controlled test | Safe validation failure, no verified evidence or false success; UI error recoverable | NOT RUN |
| N10 | Airplane mode before upload | No POST/unknown server object; retain/discard only owned private handle as contract allows | NOT RUN |
| N11 | Interrupt network during actual PUT; lose response after commit | Unknown status, GET/discovery before explicit reconcile; no automatic second POST or fake VERIFIED | NOT RUN |
| N12 | Background/blur during captured-but-unsent photo | Owned private cache purged and capture fenced; no stale preview across auth/Location changes | NOT RUN |
| N13 | Force-stop during pending/unknown PUT, then relaunch with same member | No durable sensitive URI/queue; server discovery finds actual journal safely; no replay of POST | NOT RUN |
| N14 | Logout/switch Member A→B→A while camera pending or preview open | A's image cannot attach to B or revived A session; late callbacks ignored, private owned files cleaned | NOT RUN |
| N15 | Switch Location/session; revoke membership/Location and expire bearer before finalization | 401/403/concealed 404 as contract; no late verified write or forged app receipt | NOT RUN |
| N16 | Two devices same scope/upload or one device finalizes while other polls | Lease and version fences preserve only selected immutable evidence; discovery idempotent, audit once | NOT RUN |
| N17 | OPTIONAL Condition marker, then Location policy becomes REQUIRED | Historical marker unchanged; fresh verified photo allowed only while CHECKING_IN; final Check-In guarded | NOT RUN |
| N18 | Server exact selected version missing/corrupt, legacy metadata row or forged response | Required policy blocks; no `qualifyingPhotoPresent=true`; private object remains inaccessible to public | NOT RUN |
| N19 | Cancel Check-In/revoke Staff token during upload, reconcile or finalize | Exact bearer revalidation rejects stale mutation; no session resurrection, duplicate audit or evidence promotion | NOT RUN |
| N20 | Tap Continue, Back, review/retake, and repeated Upload rapidly | Existing navigation/custody UI preserved; single in-flight upload, scoped callbacks, correct pending/error affordances | NOT RUN |

## UI-FROZEN and accessibility matrix

Run the twelve core combinations of `en`/`ar` × Light/Dark × small/normal/large screen or font scale. Also inspect camera-open, permission-denied, captured preview, uploading, pending, unknown, VERIFIED, failed and blocked states. For each combination compare the accepted Condition baseline and existing QR camera reference using the **same device density/layout**. Header, logo, VehicleCard, three Condition choices, core spacing, original Continue/Back positions, and all other Check-In pages must remain unchanged outside approved UI-X1 photo affordances. Do not bulk-update snapshots to hide differences.

In TalkBack test that status changes are announced, control names are localized, roles/focus order and touch targets are understandable, modal close and Android hardware Back work, and Arabic content remains readable in RTL. Capture device screenshots and accessibility-tree/focus notes as evidence, but crop/redact any private synthetic identifiers or photo bytes. Do not claim a score alone proves WCAG or TalkBack parity.

## Performance recording

Measure, do not invent: OPTIONAL Check-In total, time to camera ready, shutter→preview, retake, JPEG normalization, network upload, T1, PUT, readback, T2, P3 receipt, final completion and peak device memory. Record median and slowest for repeated runs, connection type, size/width/height of synthetic image and errors/timeouts. Verify OPTIONAL zero-photo path has no dependency on MinIO latency. The accepted initial 8MiB/4096/12MP, 5s decode, 60s upload and 15s object budgets are protective bounds, not production SLA claims.

## Safety, cleanup and retest

After each case, enumerate only task-owned Android cache files and private object versions, verify retention of VERIFIED/held data, confirm discarded temporary files are gone and ensure no system gallery copies exist. Record case-specific cleanup failures as FAIL/NOT VERIFIED; do not delete selected versions to make the test environment green. Preserve append-only operation/audit history. Remove only disposable task-owned test identities using the approved live guard. Any failed required-photo proof, stale callback leak, unaudited transition, public object read or unexpected Task/custody mutation is an acceptance blocker.

At current handoff time, there is **no documented owner-authorized physical Android build or connected physical test device**, and the host's `adb` command was not present on PATH. Every status above remains NOT RUN until actual artifact/device/API evidence is attached. Recording model/OS/build and test traces is mandatory before upgrading a row to PASS.
