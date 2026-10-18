# #302/#303 — Physical Android CSPRNG repair: DEC-077 owner authorization

Status: **OWNER APPROVED — locally built and tested; physical Android acceptance pending**.

Existing owned worktree: `tmp/issue-302-303-isolated`; branch
`codex/issue-302-303-native-crypto-photo`; diagnostic baseline
`ad5ab76d58ae62eafedacba0cd21342f113dda9b`; existing owned tests
and diagnostics were preserved rather than reset or overwritten.

## Proven physical failure (owner supplied)

- Android process startup: `crypto-object: missing`.
- Incident: `secure-uuid: error`, `report-transport: not-attempted`.
- Photo: capture/resize/JPEG/cleanup succeed; `photo-handle-uuid: error`,
  `upload-transport: not-attempted`. The separate plate camera still works.
- **Never infer that downstream upload, server verification or exactly-once
  Incident reporting will succeed until a real phone retest proves it.**

## Recorded explicit owner approval under Accepted DEC-077

The Owner explicitly approved adding exactly one runtime dependency to the Native app:
`expo-crypto@~57.0.4`, recommended for installed `expo@~57.0.19` in the
Expo SDK 57 versioned documentation (`https://docs.expo.dev/versions/v57.0.0/sdk/crypto/`).
Current Native app uses React Native `0.86.3` and Hermes in the release APK.

The gate would allow edits to `apps/valet-native/package.json`, `pnpm-lock.yaml`,
and narrowly owned Native adapter and call sites only. No new backend routes,
schema, migrations, policy exceptions, global JS Crypto polyfill or bypass.

### Security argument / proposed exact integration

1. A narrow Native adapter imports `getRandomValues` and `randomUUID` from
   `expo-crypto`; calls are synchronous and native-backed on Android/iOS.
   Android uses the platform cryptographic random provider rather than a JS PRNG.
   Avoid `getRandomBytes` because Expo documents a `Math.random` fallback in
   some remote debugging modes. Never use `Math.random`, a timestamp or UUIDv4
   as a recovery-mode Incident ID.
   Acquire the Expo native module in a guarded, lazily evaluated adapter so a
   missing native autolink is reported as an unavailable probe instead of an
   uncaught import error during app startup. An unavailable module must block
   protected mutations while keeping Support Diagnostics available.
2. Inject a provider exposing `getRandomValues(Uint8Array)` into existing portable
   `createIncidentRecoveryId` through `createNativeIncidentRecoveryState`. Leave
   portable UUIDv8 formatting and the strict schema unchanged; preserve exactly
   the RFC 9562 v8 nibble, variant bits and CSPRNG-derived other bits.
3. Use the *same* narrow adapter's native `randomUUID()` for photo-file handles,
   photo upload-operation IDs and legacy Incident UUIDv4, with existing validators.
   Fail closed on unavailable or throwing native provider; never fall back to JS.
4. The existing startup Crypto capability probe must test the native adapter
   rather than `globalThis.crypto`, and retain its four allowlisted stage labels
   with truthful failure/missing/success outcomes, independent of the 200-event
   telemetry ring. Never store raw random bytes, UUIDs, URIs or secrets.
5. Keep Incident marker write/readback -> reservation -> POST ordering, protocol
   header, canonical actor binding, recovery fencing, GET-only reconciliation,
   and no automatic/ambiguous POST replay exactly as DEC-077 requires.
6. Keep camera/JPEG/ownership/EXIF privacy, copied byte evidence, user confirmation,
   operation idempotency and authoritative server verification as DEC-104 requires.
7. Verify Expo module autolinking via Android prebuild and Gradle release, bundled
   Hermes JavaScript, ABI, cold startup and actual phone reboot tests. A code
   mock proving the adapter API is *not* Android CSPRNG or physical acceptance.

### Owner gate satisfied — runtime evidence separate

Owner's explicit written approval authorizes installation and narrow integration
of `expo-crypto@~57.0.4` in the existing isolated #302/#303 feature branch.
This does **not** establish physical Android success or permit issuing a release
claim before autolinking, Gradle, source, signing and phone acceptance tests.

## Work independently authorized and completed before approval

- Reproduced missing global Crypto in isolated unit tests for Incident,
  photo-handle capture and upload-operation UUID generation.
- Added fail-closed no-marker/no-reservation proof, RFC 9562 v8 bit layout proof,
  cleanup/no leaked URI proof and stale Crypto pinned-result lifecycle proof.
- Increased Issue #275 Task Queue ring-eviction regression to 275 events.
- Existing pinned diagnostics, release APK and runtime QA services untouched.

## Required post-approval evidence

Run focused and full Native/employee-client regression/typecheck/lint,
architecture/300-line checks and independent read-only security review. Resolve
all P0/P1 findings. Build one new signed release-JS Android QA APK from this
feature-branch SHA with exactly the existing Tailnet API `:10003` and Customer
App `:10004`, verify signature, SHA256, size and supported ABIs. Do not restart
the API, dashboard, Tailscale, PostgreSQL or MinIO or delete older APKs.
Owner physical tests of Crypto, Incident exactly-one audit, Photo verified
evidence, and retained pinned diagnostics remain required before issue closure.

## Post-approval implementation and validation evidence

- Owner approved exact `expo-crypto@~57.0.4` on 2026-10-18 for #302/#303,
  without authorizing unrelated decision semantics, deployments or issue closure.
- Installed resolved Native module: `expo-crypto@57.0.4` with Expo SDK 57.0.19,
  React Native 0.86.3 and Hermes. Package source confirms Android
  `java.security.SecureRandom.nextBytes()` for `getRandomValues` and
  `java.util.UUID.randomUUID()` for UUIDv4. Gradle Expo autolinking explicitly
  lists `expo-crypto (57.0.4)`; this alone is not a physical-device pass.
- `src/crypto/native-secure-crypto.ts` provides the sole guarded, deferred
  Native module resolver, exact-input-array secure entropy and strict UUIDv4
  checks. No global JS Crypto polyfill or PRNG fallback is installed. Missing,
  throwing or unlinked providers fail before protected mutations.
- Incident UUIDv8 uses the existing portable RFC 9562 generator with injected
  native entropy; durable marker/readback, exact actor binding, reservation,
  one permitted POST and GET-only ambiguous reconciliation are unchanged.
- Photo handles and upload IDs, legacy Incident UUIDv4, Check-In operation IDs
  and Push installation IDs use the same secure adapter. Check-In propagates a
  closed, localized preflight failure instead of an unhandled rejection.
- The three pinned Support Diagnostics categories retain fixed closed stages
  independently of the rolling telemetry ring (test covers 275 events). The
  Native Crypto capability probe exercises the *same* strict adapter used by
  Incident; no native entropy quality is inferred from mocked probes.
- Independent read-only worker-4 audit found no P0 and identified four P1s:
  mismatching Crypto probe, Check-In missing-CSPRNG rejection, stale HTTP
  upload callback attributing old scope errors to the next attempt, and raw
  camera photo cleanup failures. The first three received source fixes and
  targeted negative tests; the fourth received a before-shutter fail-closed
  guard, private retry custody for failed camera-cache source deletion, and
  negative tests. Subsequent independent worker-5 re-reviews verified durable
  private cleanup journal recovery for malformed/crashed records, strict
  Camera/ImageManipulator UUID-JPEG path scans, and safe no-result capture
  retry; **no remaining confirmed P0/P1** under the SDK output assumptions.
  Physical camera output filenames, delayed writes and OS-kill cleanup are
  still device-only acceptance conditions.
- Final **uninterrupted full suites after all source changes**:
  **843/843 PASS, 100 files** (`@valet/employee-client`, 2026-10-19),
  **1684/1684 PASS, 238 files** (`@valet/valet-native`, `--maxWorkers=2
  --testTimeout 60000`, 2026-10-19). Native and employee TypeScript,
  Native ESLint `--max-warnings=0`, architecture checks and new/changed
  authored-file 300-line limits all passed. Existing grandfathered API/DB
  oversize files remained untouched.
- Built from **this exact isolated feature worktree** with Gradle
  `:app:assembleRelease`: **BUILD SUCCESSFUL (870 tasks)**. Windows long
  CMake paths required *temporary* junctions to existing dependency source
  on the same drive; a third-party Metro-generated branded PNG crashed AAPT2,
  so a task-owned Gradle init step replaced the *generated* resource with
  a normal-form PNG verified to have **zero differing ARGB pixels**. All 26
  generated PNGs passed direct AAPT2 compilation. No tracked image assets
  or service were changed; temporary generated Gradle settings were restored
  byte-identically after the build.
- Android QA artifact (ARM64 only, release JS/Hermes):
  `D:\\vaylet-release-20261016\\VAYLET_302_303_EXPO_CRYPTO57_ARM64_20261019.apk`
  (**89,455,610 bytes**, SHA256
  `B006FC76554870D84EC9708F138CFDE018233F5E6F75DB033D41B9F2467442F6`).
  Package `com.vaylet.employee`, version 1.0.0, minSDK 29, targetSDK 36.
  `apksigner` verified **APK v2 signature**, Android Debug QA certificate
  unchanged from earlier diagnostic APK; **not a Play Store release**.
  ZIP inspection verified Hermes bytecode and ABI `arm64-v8a` only.
- Exact bundle-embedded QA origins:
  `https://desktop-k4voran.taild797f4.ts.net:10003` (API) and
  `https://desktop-k4voran.taild797f4.ts.net:10004` (Customer App).
  Existing Tailnet-only APK download `:10002` responded HTTP HEAD 200 with
  the matching `Content-Length`. No API, Dashboard, Tailscale, PostgreSQL,
  MinIO or other pre-existing process was restarted, and earlier APKs remain.
- No physical Android device was attached through ADB; physical Crypto
  startup, Incident canonical exactly-one mutation/audit, confirmed photo
  upload/authoritative verification, and pinned Support Diagnostics under
  actual Task Queue traffic remain **pending Owner acceptance**. Do not
  merge, push, deploy, close #302/#303, or claim physical success on tests alone.
