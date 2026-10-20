# Issue #303 — Native Condition Photo merge readiness

**Disposition: PHYSICAL QA + PRIVATE PERSISTENCE VERIFIED — COMBINED SOURCE
REGRESSION VERIFIED; PRODUCTION RELEASE NOT AUTHORIZED.**

Source branch `codex/issue-302-303-native-crypto-photo`, tip
`e92f7f0c732ee53f26ccc45361c69b66f7296cfb`; final product hotfix
`bc2485e0c2756d47489d94d8a2f54b10c07d0cfe`; Native merge commit
`6982e168459f858bfe894a253490ba1bfca5344e` over `origin/main`
`6d7bd5991e66d8f5d93978512352a52c72bdc7f6`. Verify final
consolidated SHA from Git; this is not an Android production APK approval.

Original Android `photo-handle-uuid` Crypto failure was corrected with the
Owner-approved Native CSPRNG. A subsequent physical `copy-verify` failure
exposed that Expo FileSystem `File.copy()` is asynchronous (a Promise) while
existing code tested/deleted the owned destination before the copy finished.
The fix explicitly **awaits copy completion** in
`apps/valet-native/src/check-in/native-condition-photo-owned-copy.ts` before
size/existence/equal-length verification. Scoped retirement and
cancel/discard await pending copy, clean only validated private paths and
distinguish failed copy from failed verification. DEC-104 private JPEG byte
evidence remains server-authoritative; no broader photo-viewer permission,
raw object key/logging or customer data is introduced by #300.

**Physical and persistence evidence at the original QA SHA:** Owner confirmed
the camera issue cleared. Independently observed **two VERIFIED/AVAILABLE
PostgreSQL photo records and two corresponding private MinIO JPEG objects**
with matching byte lengths; only counts, not object keys/bytes, appear here.
The QA evidence is not a new database/object-store query on this combined
candidate. Original async regression 8/8; full isolated Native 1692/1692,
Employee Client 843/843; source/security read-only reviews found no remaining
narrowed P0/P1. Combined Employee Client 843/843 and source API/Contracts
  tests 137/137 and 473/473 passed; Native first full combined run 1690/1692
  due two appearance-test timeouts. Focused retest passed 4/4; second **full
  combined run** with two Vitest workers and the unchanged individual timeout
  returned **1692/1692 PASS** / 239 files in 83.18 seconds. The first
  full run's timeout failure remains part of the record, not rewritten.

See [`ISSUE_303_PHYSICAL_ANDROID_ASYNC_COPY_HOTFIX.md`](ISSUE_303_PHYSICAL_ANDROID_ASYNC_COPY_HOTFIX.md),
[`ISSUE_302_303_END_TO_END_QA_RESOLUTION_2026-10-20.md`](ISSUE_302_303_END_TO_END_QA_RESOLUTION_2026-10-20.md)
and [`ISSUE_303_INDEPENDENT_MERGE_READINESS_W18_2026-10-20.md`](ISSUE_303_INDEPENDENT_MERGE_READINESS_W18_2026-10-20.md).
Source test modules include `native-condition-photo-async-copy.test.ts`,
`native-condition-photo-source-recovery.test.ts` and private-photo transport
and telemetry tests. QA signed/debug APK is not production release-signing;
full device lifecycle/stress, storage retention/legal holds and new production
signing still require an authorized separate qualification. Roll back source
by redeploying prior reviewed app artifacts, not by deleting private evidence.

**Recommendation:** source/PR review is supported by phone and original
persistence evidence; do not auto-close #303, deploy or publish private QA
artifacts without exact diff, CI and Owner merge/release approval.
