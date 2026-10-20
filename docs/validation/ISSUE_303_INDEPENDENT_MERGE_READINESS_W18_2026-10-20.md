# Issue #303 — W18 independent Condition Photo merge-readiness review

**Date:** 2026-10-20. **Mode:** source/Git/recorded-evidence audit only;
no running PostgreSQL, MinIO, Tailscale, APK or physical device.
**Verdict:** **PHYSICAL AND BACKEND QA SUCCESS HISTORICALLY RECORDED;
TRACKED SOURCE INTEGRATION IDENTICAL, REVIEWABLE FOR MERGE, BUT NOT
PRODUCTION/UNCONDITIONAL RELEASE ACCEPTANCE.**

## Git ancestry, scope and combined integration

- Target is the **read-only** existing worktree
  `D:/kndoom/valet-platform/tmp/issue-302-303-isolated`,
  `codex/issue-302-303-native-crypto-photo`, HEAD
  `e92f7f0c732ee53f26ccc45361c69b66f7296cfb`.
  Its untracked generated Native Android build directory was not accessed
  for editing, imported, staged or deleted.
- Local `origin/main` and merge-base
  `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`:
  **0 behind / 4 ahead** (no remote fetch). Four exact commits:
  `ad5ab76d58ae62eafedacba0cd21342f113dda9b` (diagnostics);
  `07d6feaf37d2e21b451795c5d40cb051076a3466` (CSPRNG);
  `bc2485e0c2756d47489d94d8a2f54b10c07d0cfe` (awaited copy);
  `e92f7f0c732ee53f26ccc45361c69b66f7296cfb` (QA records).
- Whole two-issue patch: **49 tracked changed files, +3,156/-170**;
  `git diff --check origin/main...HEAD` passed. Exact #303 hotfix commit
  modifies five tracked files: Native photo-files, added owned-copy,
  new async-copy test, existing photo-files test, and physical-hotfix note.
- Prime's combined `ecc7b3a2563a7a017d3ad299594bb2549e601ff1`:
  `e92f7f0c` is an ancestor, **all 49** source-branch changed paths occur
  in the combined tree, and direct comparison of all 49 path contents from
  `e92f7f0c` to `ecc7b3a2` produced **zero differences**.
  This establishes tracked patch inclusion/identity only; it does not
  validate the other integrated changes, current upstream remote head or CI.

## Binding ownership / actual source change

- Governing `AGENTS.md`, `docs/00_SOURCE_OF_TRUTH.md`, accepted
  `DEC-104`, `DEC-077`, `DEC-063`, `DEC-071`, `DEC-072` and
  code-structure rules were read. Photos are optional by default unless
  current Company/Location policy requires qualified evidence. Only server-
  verified private JPEG byte evidence counts; capture URI or a DB metadata
  placeholder alone does not qualify.
- Physical pre-fix symptom reported on Android: Crypto was repaired but
  pinned diagnostic failed `copy-verify` with `upload-transport:
  not-attempted`. Installed Expo FileSystem 57.0.6 declares
  `File.copy(...): Promise<void>` and implements asynchronous Android IO.
  Prior code synchronously called `output.copy(owned)` and then checked
  `owned.exists/size` before Android completed the write.
- `apps/valet-native/src/check-in/native-condition-photo-owned-copy.ts`
  (55 lines) now **awaits** `source.copy(owned)` before source/owned
  existence, nonempty/equal-byte verification. An in-flight map, generation,
  retirement set, and settled-before-discard prevent false success and unsafe
  deletion while copy is in flight. Rejected copy is `owned-copy.error`;
  completed but mismatched bytes is `copy-verify.error`.
- `native-condition-photo-files.ts` is **300 physical lines**, including
  bounded app-private paths, camera/ImageManipulator source cleanup,
  verified destination before returning the handle/preview, owned-folder
  cleanup, crash journal, `discardAll` scope retirement, startup purge
  refusal for pending copies and fail-closed cleanup-blocked states.
  `native-condition-photo-path.ts` restricts generated JPEG handling to
  known app-private Cache/Camera/ImageManipulator locations. No arbitrary
  external-URI cleanup or object-key authority added.
- Native `native-condition-photo-camera.tsx` guards the shutter,
  capture/review/retake, stale scope callbacks and source cleanup;
  `native-condition-photo-transport.ts` and
  `packages/employee-client/src/employee-condition-photo-transport.ts`
  preserve authenticated transport/idempotent operation IDs and distinguish
  pre-dispatch errors from ambiguous POST outcomes. No backend, DB migration,
  object-store public route, actor/tenant authorizer or policy bypass is in
  this 49-file change.

## Source tests / physical QA evidence with provenance

- `apps/valet-native/test/native-condition-photo-async-copy.test.ts`
  exercises deliberately pending/rejected copy Promises, completion before
  preview, size mismatch, partial deletion error, discard during copy, scope
  retirement and startup purge. The historical report records **5 failures /
  1 pass** against the original unawaited source, then **8/8 PASS** after
  repair; focused **31/31** and final Native **1,692/1,692** across 239 files;
  employee-client **843/843** across 100 files. Native/portable TS, lint and
  architecture checks and independent source P0/P1 review reported passed.
  W18 did **not independently rerun** those suites or any Android test.
- `ISSUE_302_303_END_TO_END_QA_RESOLUTION_2026-10-20.md` states Owner
  installed the new APK, confirmed the capture failure disappeared, and
  requested verification of saved images. This is attributed Owner physical
  QA; no W18-connected ADB device or screenshot evidence was generated.
- Historical **read-only SQL** and independent **MinIO object HEAD** results
  in that report assert **exactly two** `CHECK_IN_CONDITION`
  `vehicle_photos`, **two** `vehicle_photo_verifications`, **two**
  `vehicle_photo_availability` rows, **two** `VERIFIED` upload operations
  and **two** `SELECTED` attempts. Each photo status was
  `VERIFIED/AVAILABLE`. The two independently checked private JPEG object
  HEADs were HTTP **200**, `image/jpeg`, byte length matching DB.

| Historical QA sample (Asia/Amman, 2026-10-20) | DB verified bytes | Pixel dimensions | Private MinIO HEAD |
| --- | ---: | --- | --- |
| 02:38:09 | 1,128,319 | 2976 × 3968 | 200, JPEG, same bytes |
| 03:05:19 | 1,268,635 | 2976 × 3968 | 200, JPEG, same bytes |

No private object key, photo bytes, customer/session ID, bucket credential,
plate, incident text, image URI or storage path is reproduced here. W18
**did not query the historical DB or MinIO**: these counts are correctly
attributed to the original private QA verification note, not an independent
new live source of truth. They demonstrate historically recorded persistence
beyond a local camera preview, **not** a third/fourth photograph or continuous
production availability.

## Signed QA APK provenance — not production release

- `docs/validation/ISSUE_302_303_END_TO_END_QA_RESOLUTION_2026-10-20.md`
  names final hotfix APK
  `VAYLET_ISSUE303_COPY_AWAIT_bc2485e0_ARM64_20261020.apk`,
  associated with exact code SHA `bc2485e0c2756d47489d94d8a2f54b10c07d0cfe`.
  Recorded bytes **89,458,986** and SHA256
  `EE4F50F96716DA5B8A874B4D41A0F4E8368A790CD3DB1786F93B00297681117C`.
  Different from predecessor Crypto QA APK (89,455,610 bytes; SHA256
  `B006FC76554870D84EC9708F138CFDE018233F5E6F75DB033D41B9F2467442F6`).
- Recorded `Gradle :app:assembleRelease` success, Hermes release JS,
  **arm64-v8a only**, package `com.vaylet.employee`, minSDK 29 /
  targetSDK 36, pre-existing private QA origins, and `apksigner verify`
  **v2 signed using an Android Debug QA certificate**, not a production
  release certificate. Historical private Tailnet download HTTP HEAD and
  Content-Length were checked by the previous QA team.
- W18 did not download, hash, extract, install or independently verify either
  APK or its code-to-byte reproducibility. No APK/private signing material
  was staged or changed; build provenance remains **historical evidence**.

## Remaining gates / recommendation

1. **Integration:** 49 tracked blobs already present unchanged in Prime's
   combined SHA, but merged CI, independent review of #300 interactions,
   PR approvals and final source/branch synchronization are separate gates.
2. **Physical stress:** interrupted camera/write, app death, permission
   reentry, retake/dismiss, cleanup retries, account/Location switch, large
   font/TalkBack, real 200+ Task Queue events and device variance are not
   independently established by the two historical photos.
3. **Production:** DEC-104 private provider/bucket ownership, retention and
   incident holds, backup/restore, decoder/upload caps under load,
   QA-only MFA configuration and production signing/deployment still require
   distinct approvals and evidence. Two successful QA objects do not close
   those contracts.
4. **Issue disposition:** recorded **RESOLVED IN PRIVATE/PHYSICAL QA**;
   formal GitHub issue closure, production rollout and unconditional release
   approval **NOT PERFORMED**.

**Recommendation:** The #303 hotfix is **source-review/integration-ready with
explicit QA evidence and unresolved production/extended device gates**.
Do not mark QA-attributed object checks as new W18 results or infer production
readiness. W18 performed no push, merge, deployment, DB/MinIO operations,
signing action or edit outside its isolated review branch.
