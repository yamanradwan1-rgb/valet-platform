# #303 P1 physical Android Condition Photo — awaited native copy hotfix

**Owner evidence (physical Android):** Incident #302 reported successfully on
the repaired Expo Crypto APK. Condition Photo instead failed at the **pinned**
`copy-verify` stage before any upload (`transport: not-attempted`). The device
observation does not by itself prove the cause; repeat physical acceptance is
required before closing #303.

**Authorized isolated source:**
`D:\kndoom\valet-platform\tmp\issue-302-303-isolated`, branch
`codex/issue-302-303-native-crypto-photo`, starting commit
`07d6feaf37d2e21b451795c5d40cb051076a3466`.
The pre-existing untracked `apps/valet-native/modules/vaylet-battery-status/android/build/`
and all ignored Gradle/QA artifacts were protected.

## Source-confirmed fault and correction

Installed `expo-file-system@57.0.6` declares `File.copy(): Promise<void>` in
`src/internal/NativeFileSystem.types.ts`, and Android implements `copy` as
`AsyncFunction("copy") Coroutine` with `withContext(Dispatchers.IO)` in
`FileSystemModule.kt` / `FileSystemPath.kt`. Previously,
`native-condition-photo-files.ts` called `output.copy(owned)` **without**
`await`, immediately checked `owned.exists` and `owned.size`, and could delete
the camera/manipulator sources while the OS still wrote the private copy.

The focused `native-condition-photo-owned-copy.ts` boundary now awaits native
completion **before** emitting `owned-copy.success`, verifies source and
private destination existence/nonempty/equal size at `copy-verify`, and never
returns a preview handle until verification passes. Rejected copy has
`owned-copy.error` and leaves `copy-verify` unattempted; a completed but bad
copy has `copy-verify.error`. No polling, sleeps, retries or weakening of
existing JPEG size/URI contracts were introduced.

An owned-copy operation is tracked until its Promise settles. `discard` waits
before deletion; `discardAll` retires the scope even when a handle does not
exist yet; `purgeStartup` fails closed while a coroutine is still writing
instead of synchronously sweeping a destination that could reappear.
Cancellation, retake/dismissal and actor/session retirement therefore cannot
return an unverified file or silently recreate an orphan after the owner
clears handles. Partial-copy rejection discards the feature-owned destination;
if deletion fails, the pre-existing cleanupBlocked/startup-sweep privacy
barrier remains active. Camera crash journal and generated-source containment
are unchanged.

## Deterministic source tests

`test/native-condition-photo-async-copy.test.ts` mocks **pending** native
copy promises, then explicitly resolves/rejects them. Against the original
unawaited source: **5 failed / 1 passed** and Vitest observed unhandled
rejections. With the hotfix: **8/8 pass**, covering pending copy, correct
stage timing, success, rejection and partial cleanup, missing/wrong-size
destination, screen dismissal, direct discard, and synchronous purge during
copy. The original `native-condition-photo-files.test.ts` mock also now
returns `Promise<void>` instead of a synchronous `File.copy` result.

**Focused suites:** 31/31 passed including five durable recovery tests.
**Complete suites after the final source patch:** Employee-client
**843/843** across 100 files; Native **1692/1692** across 239 files, with
`--maxWorkers=2 --testTimeout 60000`.
Employee-client and Native TypeScript/lint and repository architecture checks
passed. `native-condition-photo-files.ts` remains at **300 physical lines**;
new test and helper files each remain below 300. Existing unrelated
grandfathered API/DB architecture warnings are unchanged.

## Security and acceptance

No edits to Incident UUIDv8/DEC-077, Expo Crypto dependency, MFA, transport
contracts, actor/tenant authorization, authoritative server photo evidence,
or the three independent pinned Support Diagnostics sections. No photo bytes,
URIs, IDs, tokens or raw native errors are logged to diagnostics. This
hotfix is strictly source/Android QA: no DB migrations or server changes.

Physical Owner checks still required: Check-In, preview after new capture,
confirm, authenticated upload and authoritative evidence, pinned stages,
copy-verify disappearance as CURRENT failure, retake/dismiss tests, Incident
regression, and pinned diagnostics under 200+ normal Task Queue events.
Neither source tests nor successful APK compilation close #303 by themselves.
No push, merge, deploy or issue closure authorized.
