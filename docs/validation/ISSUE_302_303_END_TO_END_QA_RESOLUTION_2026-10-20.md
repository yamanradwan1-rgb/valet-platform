# VAYLET — #302 / #303 | Complete end-to-end QA resolution report

**Report date:** 2026-10-20 (Asia/Amman)
**Status:** **RESOLVED IN ISOLATED QA — PHYSICAL ANDROID SUCCESS + BACKEND PHOTO EVIDENCE VERIFIED**
**Issue #302:** **RESOLVED ON PHYSICAL ANDROID (Owner reported successful Incident)**
**Issue #303:** **RESOLVED ON PHYSICAL ANDROID (Owner reported capture fixed; 2/2 DB records + 2/2 actual MinIO objects verified)**
**GitHub tracking:** Not closed; no merge, push, deployment or production rollout.
**Source branch:** `codex/issue-302-303-native-crypto-photo`
**Isolated worktree:** `D:\kndoom\valet-platform\tmp\issue-302-303-isolated`
**Final product commit:** `bc2485e0c2756d47489d94d8a2f54b10c07d0cfe`.

## 1. Executive summary and scope

This local QA track diagnosed and repaired two physical Android failures without
altering the primary VAYLET checkout, Issue #300, related feature worktrees,
production infrastructure, server contracts or unrelated product behaviors.
The project now has a working Native cryptographic random provider and a
native-file-copy completion boundary, backed by regression tests and a signed
ARM64 QA APK. Actual Android experience and persistent evidence support the
QA-resolution verdict rather than merely a green build.

The Owner explicitly confirmed a successful real-phone Incident report after
the Crypto repair, then successful Condition Photo capture after the awaited
copy hotfix. PostgreSQL and S3-compatible MinIO checks independently confirm
**two verified, available Condition Photo records** and **two existing private
JPEG objects**. The exact-once Incident DB audit and comprehensive physical
lifecycle/stress matrix were **not independently re-run in this final report**;
do not conflate the Owner's successful Incident observation with a new direct
database exactly-once proof.

## 2. Timeline: what happened and what changed

| Stage | Evidence / work | Result |
| --- | --- | --- |
| Initial #302 physical failure | Android had no usable global Crypto; first failure `secure-uuid`; Incident HTTP not attempted | Reproduced/probed; security provider needed |
| Initial #303 physical failure | Capture/resize/JPEG/cleanup happened, then `photo-handle-uuid` failed; photo HTTP not attempted | Shared Crypto dependency identified |
| 2026-10-18 diagnostic baseline | Three pinned Support Diagnostics blocks, bounded photo/Incident stage IDs and safe snapshots | Diagnostics implemented and independently reviewed |
| Owner's DEC-077 approval | Allow only `expo-crypto@~57.0.4` and tightly scoped Native CSPRNG integration | Approved security repair |
| 2026-10-19 Crypto repair | Native secure UUIDv4 and injected CSPRNG entropy for Incident UUIDv8; Android QA signed APK | `07d6feaf…`, local suites PASS |
| First physical retest | Incident #302 successful; Condition Photo first failed at `copy-verify` with transport `not-attempted` | Crypto barrier passed; distinct async-copy issue exposed |
| 2026-10-20 async-copy reproducer | 6 deterministic cases on original implementation: 5 failed / 1 passed, plus unhandled rejection observations | Unawaited `File.copy` failure reproduced |
| Awaited-copy repair | Await actual Android promise; distinguish copy from verify; secure cleanup/cancellation/retirement | `bc2485e0…`, review PASS |
| Release packaging | ARM64 Hermes release, existing QA origins, signed QA key, unique APK | Gradle `BUILD SUCCESSFUL` |
| Second physical retest | Owner reported that Condition Photo problem disappeared | Functional Android success reported |
| Persistent proof | Two PostgreSQL verification records, two MinIO objects with equal byte size | #303 backend persistence independently confirmed |

## 3. Repositories, commits and protection boundaries

All changes were confined to the isolated worktree and branch above.

- **Original protected baseline:** `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`.
- **Diagnostic baseline:** `ad5ab76d58ae62eafedacba0cd21342f113dda9b`.
- **Crypto repair:** `07d6feaf37d2e21b451795c5d40cb051076a3466`.
- **Final awaited-copy hotfix:** `bc2485e0c2756d47489d94d8a2f54b10c07d0cfe`.

At the final pre-report status inspection, source HEAD was `bc2485e0…`
with no modified tracked code. The pre-existing untracked generated directory
`apps/valet-native/modules/vaylet-battery-status/android/build/` remained
untouched. Older APKs, task-owned ignored Gradle outputs, unrelated launcher
scripts, other worktrees and unmerged Issue #300 work were not deleted,
reset, rebased, stashed, cherry-picked or overwritten.

## 4. Root cause and fix — Incident #302

**Root cause:** The original Android/Hermes execution context lacked the
`globalThis.crypto` interface required for secure UUID generation. Incident
report creation failed at `secure-uuid` **before its intended HTTP mutation**.

**Fix:** Owner-approved `expo-crypto@57.0.4` added to Native app with one
deferred/guarded cryptographic adapter at
`apps/valet-native/src/crypto/native-secure-crypto.ts`. A real Native CSPRNG
provider now drives the existing RFC 9562 UUIDv8 Incident recovery generator
and validates UUIDv4 call sites, including photo handles and upload-operation
IDs. Failures fail closed; **no `Math.random`, time-based fallback or global
JS Crypto polyfill** is added.

**Invariants retained:** DEC-077 marker write/readback, reservation before the
single authorized POST, actor/organization/location/session scoping, strict
UUIDv8 format, idempotency and GET-only reconciliation on ambiguous outcomes.
No Incident source refactor was introduced in the subsequent #303 copy fix.

**Physical outcome:** The Owner reported successfully submitting an Incident
on real Android after installation of the Crypto-repaired APK. This is
physical functional evidence, not an independently repeated final SQL audit of
exactly-once Incident rows.

## 5. Root cause and fix — Condition Photo #303

**First boundary:** Native Crypto repair removed the earlier
`photo-handle-uuid` failure. A later Android retest reached `copy-verify`,
where Support Diagnostics reported **`failed / currently running: no /
first failed stage: copy-verify / transport: not-attempted`**.

**Source-confirmed defect:** Installed `expo-file-system@57.0.6` exposes
`File.copy(destination): Promise<void>`; Android implements `copy` using
`AsyncFunction("copy") Coroutine` and `Dispatchers.IO`. The earlier source
called `output.copy(owned)` without `await`, immediately tested destination
existence/size, and could remove source/temp files while copy was still
writing. A synchronous test mock hid that native race.

**Fix:** `native-condition-photo-owned-copy.ts` now owns the pending native
copy, awaits completion, and only then validates source/destination existence,
nonzero size and equal byte length before preview is returned. Semantic stages
are preserved: rejected native copy means `owned-copy.error`; completed but
invalid copy means `copy-verify.error`; neither is a false success. No sleeps,
polling or arbitrary retries were introduced.

Pending operations are fenced by scope/generation. `discard()` awaits any
in-flight native copy before deleting its owned destination; `discardAll()`
retires current scope; `purgeStartup()` refuses to synchronously sweep private
files while same-instance native copy is outstanding. Partial native writes
are deleted only within validated app-private paths. If deletion fails,
capture is blocked until safe recovery. Existing Camera/ImageManipulator
source cleanup, bounded crash-recovery journal, JPEG rules, privacy, and
DEC-104 authoritative server evidence contracts are preserved.

**Physical/backend outcome:** After installation of the `bc2485e0…` APK,
the Owner stated that the camera issue had disappeared and requested proof
that an image persisted. The subsequent verified database/object-store
evidence proves the actual photo upload and storage path works for two
check-in condition images. This is substantially stronger than a local
preview or successful unit test.

## 6. Privacy-safe Support Diagnostics

Three independently pinned blocks remain at the **top** of the Shift Support
Diagnostics card, not inside the 200-event rolling telemetry ring:

1. `Last incident diagnostic`.
2. `Last condition photo diagnostic`.
3. `Native crypto capability`.

Stages preserve the actual first error, async stage `start/success/error`
transitions, and transport attempted/not-attempted classification. Old
operations cannot overwrite newer pinned results. Tests protect eviction by
large volumes of ordinary events. Existing Arabic/English, RTL/LTR and
Light/Dark support was not redesigned. No photo bytes, file URIs/paths,
customer/plate data, random IDs, exception internals or tokens are emitted.

## 7. Automated tests, code quality and independent review

| Validation | Verified result |
| --- | --- |
| Original deferred-copy reproducer | **5 failed / 1 passed** before fix, including unhandled rejection evidence |
| Final `native-condition-photo-async-copy.test.ts` | **8/8 PASS** |
| Final focused source/copy/recovery suite | **31/31 PASS** |
| Final complete Native suite | **1,692/1,692 PASS** in 239 test files |
| Final employee-client suite | **843/843 PASS** in 100 test files |
| Native and employee-client TypeScript | **PASS** |
| Native and employee-client ESLint | **PASS** |
| `pnpm architecture:check` | **PASS**; only grandfathered unrelated API/DB large-file warnings |
| `git diff --check` | **PASS** |
| Independent READ-ONLY P0/P1 audit, worker-2 | **SOURCE-ONLY GO**; no remaining confirmed P0/P1 in the narrowed #303 patch |

The current `native-condition-photo-files.ts` is exactly **300 physical
lines**; extracted `native-condition-photo-owned-copy.ts` is 55 lines;
new async-copy test is 209 lines. No authored changed file exceeds the
repository's 300-line limit. Independent review checked native-copy promise
completion, partial writes, cancellation/scope retirement, startup purge,
private JPEG containment, pinned diagnostics and untouched Incident code.

The earlier CSPRNG integration independently received security/source reviews,
with identified P1s addressed before the previous QA APK. The final copy
review does **not** replace Android lifecycle/stress testing.

## 8. Android APK artifacts and signing

**Previous Crypto repair QA APK (preserved):**

- File: `D:\vaylet-release-20261016\VAYLET_302_303_EXPO_CRYPTO57_ARM64_20261019.apk`.
- Bytes: `89,455,610`.
- SHA256: `B006FC76554870D84EC9708F138CFDE018233F5E6F75DB033D41B9F2467442F6`.

**Final awaited-copy QA APK (validated and delivered):**

- File: `D:\vaylet-release-20261016\VAYLET_ISSUE303_COPY_AWAIT_bc2485e0_ARM64_20261020.apk`.
- Bytes: **`89,458,986`**; distinct SHA from older APK.
- SHA256: **`EE4F50F96716DA5B8A874B4D41A0F4E8368A790CD3DB1786F93B00297681117C`**.
- Download: <https://desktop-k4voran.taild797f4.ts.net:10002/VAYLET_ISSUE303_COPY_AWAIT_bc2485e0_ARM64_20261020.apk> (private Tailscale network; HTTP HEAD 200 / exact Content-Length verified).
- Android package: `com.vaylet.employee`, `versionName=1.0.0`, `versionCode=1`, `minSdk=29`, `targetSdk=36`.
- **ABI:** `arm64-v8a` only, 26 packaged native libraries. No x86_64 in this build.
- **JS:** newly generated 2,483-module Metro Hermes Release bundle, `assets/index.android.bundle` 4,924,332 bytes; SHA256 `15dbbf027de62f3df4ca889fe26ed572c4bd0518886a1f3063cd55d4f29ca758`.
- **Signing:** `apksigner verify` PASS, APK Signature Scheme **v2**, same Android Debug **QA** signing certificate as prior QA APK (certificate SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). It is **not a Play Store production release**.
- **Embedded API origin:** `https://desktop-k4voran.taild797f4.ts.net:10003`.
- **Embedded Customer origin:** `https://desktop-k4voran.taild797f4.ts.net:10004`.

Gradle `:app:assembleRelease`: **BUILD SUCCESSFUL**, 870 actionable tasks,
24 executed and 846 up-to-date on the final build. Reused task-owned Android
long-path workarounds, temporary same-drive Native alias paths and a
pixel-equivalent generated PNG normalization step; restored affected
generated Gradle settings byte-for-byte after success. No build from
`origin/main`, unrelated worktree or older APK bytes was substituted.

## 9. QA infrastructure recovery after host reboot

After the Owner rebooted the Windows computer, Tailscale Serve mappings and
the photo QA PostgreSQL/MinIO containers persisted, but the Node frontends,
API and local APK HTTP file server had stopped. The existing compiled QA
runtime was restarted **without rebuilding APK or databases**, preserving
exact previously approved QA credentials/configuration (not reproduced here).
The API uses the **previously existing** test-only MFA guard allowing bypass
strictly for the isolated local QA port/database; no production bypass was
created. QA guard negative checks reject production mode, foreign database,
wrong port and missing opt-in. Protected API calls without a session return
HTTP 401 as expected.

| Tailnet endpoint | Internal backend | Verified outcome |
| --- | --- | --- |
| `:10002` QA APK download | local `:8008` | HTTP 200, Content-Length matches APK |
| `:10003` API | local `:3101` | `/health/ready` HTTP 200 `{"status":"ok"}` |
| `:10004` Customer App | local `:3102` | HTTP 200 and JS asset HTTP 200 |
| `:10005` Dashboard | local `:3103` | HTTP 200 and JS asset HTTP 200 |
| Photo PostgreSQL | Docker local `:59477` | `pg_isready` and read-only SQL OK |
| Private photo MinIO | Docker local `:59111` | Health OK; two object HEADs confirmed |

No restart of these running services was performed during the **hotfix APK
build**. No migration, HTTP write, database mutation, deployment, original
main change or Tailscale reconfiguration was made. Phone install requires the
device's own Tailscale connection to this tailnet.

## 10. Where exactly the images were saved

**PostgreSQL:** QA Docker service `vaylet-photo-qa-postgres-1`, database
`valet_003p_20261016_1`, local port **59477**. Relevant tables:

- `vehicle_photos`: per-photo metadata and `storage_object_key`, not JPEG bytes.
- `vehicle_photo_verifications`: content SHA256, verified byte count,
  pixel dimensions, normalization version and verification timestamp.
- `vehicle_photo_availability`: availability state.
- `condition_photo_upload_operations`: idempotent upload state (`VERIFIED`).
- `condition_photo_upload_attempts`: storage attempt (`SELECTED`) and object version.

**MinIO/S3-compatible object storage:** QA Docker service
`vaylet-photo-qa-minio-1`, endpoint `http://127.0.0.1:59111`, private bucket
`vaylet-photo-qa-20261016`, Docker volume **`vaylet-photo-qa_s3_data`**
mounted at **`/data`** in the MinIO container. Actual JPEG bytes live in
this private bucket. PostgreSQL links to them through the object key;
raw object keys and customer/session IDs are intentionally omitted from this
report to protect QA data.

### Final real persistence evidence (database and object-store HEAD)

All times below are **2026-10-20, Asia/Amman**.

| Photo | Verified local time | DB verified bytes | Dimensions | State | Private MinIO HEAD |
| --- | --- | ---: | --- | --- | --- |
| 1 | 02:38:09 | 1,128,319 | 2976 x 3968 | `VERIFIED`, `AVAILABLE` | HTTP 200; `image/jpeg`; same byte count |
| 2 | 03:05:19 | 1,268,635 | 2976 x 3968 | `VERIFIED`, `AVAILABLE` | HTTP 200; `image/jpeg`; same byte count |

Direct read-only SQL found exactly **2** `CHECK_IN_CONDITION` photos,
**2** verifications, **2** available records, **2** `VERIFIED` upload
operations and **2** `SELECTED` attempts. Independent **HEAD-only** MinIO
requests confirmed **2/2 real JPEG objects** with matching lengths. No photo
bytes were downloaded or displayed, and no destructive storage operation was
performed. The first proof originally showed one photo; a second later
appeared and was checked separately. This confirms end-to-end photo
persistence beyond device preview.

## 11. Security, limitations and explicit remaining gates

**Preserved:** DEC-077 Incident cryptographic UUIDv8, exactly-once design,
idempotency/recovery and restricted actor scopes; DEC-104 JPEG/EXIF/private
ownership/authoritative server verification; MFA/authorization/tenant isolation;
photo diagnostic privacy; original source, QA setup, Docker volumes, APKs
and unrelated branches.

**Demonstrated:** Owner physical success for #302 and #303; both #303 images
have DB verification and independently observable private storage; all
required automated tests and independent source review passed.

**Not independently demonstrated in this conversation:** new post-hotfix
SQL exact-once Incident audit, all edge-case phone cancellation/process-death
tests, 200+ actual on-phone Task Queue events retaining all pinned sections,
and production rollout. Those optional/remaining qualification checks must
not be retrospectively described as completed. Android physical use is
Owner-observed, not automated ADB proof; no ADB device was attached to the host.

**No formal tracker action:** Issues **#302 and #303 are recorded as
operationally resolved in isolated QA**, with #303 additionally verified
against real DB/MinIO evidence. No GitHub issue was automatically closed;
no branch was pushed, merged, deployed or released to production. The
remaining workflow is an Owner decision on whether to run extended phone
stress acceptance and approve PR/integration/issue closure.

## 12. Resolution register and final verdict

| Problem / request | Final recorded result | Basis |
| --- | --- | --- |
| #302 Incident `secure-uuid` failure | **RESOLVED — PHYSICAL ANDROID** | Owner successful Incident; native CSPRNG integration and regression suites |
| #303 Photo `photo-handle-uuid` failure | **RESOLVED — PHYSICAL ANDROID** | Native UUIDv4 adapter; Android progressed past previous stage |
| #303 Photo `copy-verify` race | **RESOLVED — PHYSICAL QA + SERVER EVIDENCE** | Awaited Android File.copy, 8/8 race tests, 2/2 authoritative verified records + MinIO objects |
| Photo cleanup/cancellation privacy | **SOURCE-VALIDATED** | Negative tests, private ownership fences, independent P0/P1 review; edge phone stress pending |
| Pinned diagnostics eviction/misclassification | **TEST-VALIDATED** | Three blocks independent from 200-event ring, existing UI unchanged |
| Host reboot QA service outage | **RESOLVED** | Ports/services restarted; Tailnet endpoints HTTP 200 |
| QA APK signing and download | **RESOLVED** | Gradle signed release, SHA256/v2/ABI/Hermes/embedded origins, Tailnet HTTP 200 |
| PostgreSQL/MinIO photo save evidence | **RESOLVED / CONFIRMED** | 2 verified, available images and 2 real matching private objects |
| Formal GitHub issue closure / production deployment | **NOT PERFORMED** | Requires distinct Owner approval |

**FINAL STATUS: #302 and #303 RESOLVED AND EVIDENCED IN PRIVATE QA.**
This document records that success without representing the APK as a
production release or silently closing/publishing the engineering work.

### Related project evidence

- `docs/validation/ISSUE_302_303_ISOLATED_DIAGNOSTIC_IMPLEMENTATION.md`
  (historic pre-Crypto baseline; its earlier PENDING status is superseded by
  the later physical/DB/MinIO evidence recorded here).
- `docs/validation/ISSUE_302_303_CRYPTO_REPAIR_APPROVAL_GATE.md`.
- `docs/validation/ISSUE_303_PHYSICAL_ANDROID_ASYNC_COPY_HOTFIX.md`.
- `docs/decisions/DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md`.
- `docs/17_AGENT_CODE_STRUCTURE_RULES.md`.

**Confidentiality:** This report intentionally does not embed account
passwords, signing private keys, photo payloads, private object keys,
individual IDs, customer information, plate numbers or database credentials.
