# Issues #302 + #303 — isolated diagnostic implementation evidence

Date: 2026-10-18 (Asia/Amman)
Status: DIAGNOSTIC PATCH ONLY; physical source proof and APK pending.

## Isolation and provenance

- Protected original: `D:\kndoom\valet-platform`, main at
  `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`.
- Preflight `origin/main`: the same SHA, confirmed by `git ls-remote`.
- Initial protected status: three unrelated untracked files
  `RUN-VAYLET.ps1`, `START-VAYLET.cmd`, `VAYLET_LOCAL_QA_README.md`.
- Newly created clean worktree:
  `D:\kndoom\valet-platform\tmp\issue-302-303-isolated`.
- Branch: `codex/issue-302-303-native-crypto-photo`; baseline:
  `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`.
- Git registered 105 worktrees after creation, including the protected main,
  independent active #300/#275/#215 worktrees, and this new worktree.
- No existing worktree was reset, cleaned, stashed, rebased, merged, deleted,
  moved, or used for implementation; all source commands ran in this worktree.

## Current evidence, bounded implementation, and remaining cause

- **#302 Incident root cause: UNKNOWN on actual Android.** The original
  physical signed APK at 6d7bd599 yielded `secure-uuid.error` before Incident
  mutation. Portable UUIDv8 uses `globalThis.crypto.getRandomValues`.
  New process-startup capability probe records only closed crypto object,
  getRandomValues execution, randomUUID execution/format, and UUIDv8
  schema results. Successful execution/format checks do not prove the
  underlying entropy source is a device-backed CSPRNG.
- **#303 Photo root cause: UNKNOWN on actual Android.** Original physical
  failure occurs after live camera preview. New stage probes cover camera
  readiness, takePictureAsync, photo result, private cache containment,
  source validity, ImageManipulator init/resize/render, JPEG save/size,
  secure handle generation, owned-cache copy/verification, cleanup, preview,
  upload operation ID, local multipart preparation, dispatch and response.
  The first failed stage survives later cleanup events.
- The photo capture implementation still generates photo handles and upload
  operation IDs through `globalThis.crypto.randomUUID`. This may share
  the Incident Crypto problem, but the physical evidence has not proved it.
- Two privacy/first-stage gaps were corrected without protocol change:
  an ImageManipulator initialization failure now cleans the validated raw
  camera JPEG, and malformed camera dimensions clean the same validated
  source. Tests prove both source cleanup and allowlisted diagnostics.
- A portable upload-dispatch and response-validation observation seam now
  distinguishes failures during local multipart construction, attempted HTTP
  operations with ambiguous outcome, and failures validating a received
  server response. It neither replays a POST nor changes request credentials,
  headers, authorization, status or idempotency.
- Incident, photo and crypto last-completed diagnostic records are independent
  typed snapshots, displayed in three distinct blocks at the top of the
  existing Shift Support Diagnostics card, above build provenance, event count
  and the rolling events. The 200-event ring remains capped at 200; pinned
  sections consume none of its slots. Attempt starts retain previous completed
  results; late tokens cannot replace newer results. User-visible labels
  support Arabic/English and existing RTL/LTR and Light/Dark styles.
- The diagnostic owner is intentionally **process-local only**. It survives
  Shift navigation/card remounts and unrelated polling within the runtime.
  Actual process death resets last-completed records to not-run; a new Crypto
  probe executes at bootstrap. No IDs, paths, exception strings, random bytes,
  tokens or photos are stored in pinned records, persisted or sent to the API.

## Cryptography and authority

- No new dependency, provider bridge, polyfill or protocol change was applied.
  No `Math.random` or UUIDv4 fallback was added for Incident recovery.
- Incident UUIDv8 schema, recovery-marker SecureStore readback, marker-before-
  reservation-before-POST order, binding to installation/actor/tenant/location/
  session, protocol header, and GET-only ambiguous outcome recovery remain
  under DEC-077 unchanged.
- Photo private JPEG containment/re-encoding, EXIF stripping, owned copies,
  cleanup, upload idempotency, server-verification and required-photo policy
  remain DEC-104-controlled. A local preview is not server-verified evidence.
- A new Android CSPRNG-backed library/provider is a **security approval gate**.
  This diagnostic patch neither asserts that such a provider is needed nor
  selects one before a real-device capability result and Owner review.
- No API, database schema, migration, runtime role or service configuration was
  modified. No diagnostic is emitted through an API telemetry route.

## Verification

- `pnpm --filter @valet/contracts build`: PASS.
- `pnpm --filter @valet/employee-client test`: 98 suites/838 tests PASS.
- `pnpm --filter @valet/employee-client typecheck`: PASS.
- `pnpm --filter @valet/valet-native typecheck`: PASS.
- `pnpm --filter @valet/valet-native lint`: PASS.
- `pnpm architecture:check`: PASS with existing grandfathered
  over-300-line warnings outside this task.
- Final full Native test run: **236 suites / 1668 tests PASS** using two
  workers and increased timeout for a repository appearance scan (which
  also passes in isolation). Includes the final photo cleanup and
  response-validation stage regressions.
- Deterministic card tests assert all three pinned sections precede ordinary
  event-count and 260 unrelated HTTP events; related old #275 tests assert
  Incident first failure and precise transport classification. Appearance
  snapshot tests normalize **only** the three approved diagnostics subtrees.
- Modified/new authored TypeScript files must remain within 300 physical
  lines, confirmed by the architecture check.
- Independent read-only review found no P0 in the reviewed diagnostic patch
  and identified pre-dispatch, stale scope, image-init cleanup and response
  validation misclassifications. Narrow fixes were applied with targeted tests.

## APK and physical acceptance gates

- Safe build-resource preflight: D: had roughly 55 GiB free; C: about 1 GiB;
  free RAM was only about 2.57 GiB out of 15.93 GiB total. Running Android
  Gradle/prebuild alongside concurrently active VAYLET agents was judged unsafe
  under the Owner's RAM/shared-environment protection requirement. No APK was
  built and no older APK was deleted.
- Android SDK configured at `D:\android\sdk`, JDK available. ADB devices
  returned no physical or emulator devices.
- QA Tailscale Customer/Dashboard/Employee origins on ports 10004/10005/10006
  returned 200 on read-only probes. API origin port 10003 returned 401 at the
  protected `/v1/staff/operational-context` route, confirming a live auth
  boundary. The attempted `/health` path returned 404, so it is not a
  confirmed health endpoint. No existing services were started or changed.
- Consequently: **no feature APK path, SHA256, signed release certificate,
  ABI inventory, bundle origin proof or real-device acceptance result yet**.
  These are pending; the historical signed APK remains only failing baseline
  evidence. Do not claim release readiness.
- Next Owner/device validation: build a uniquely named signed ARM64 QA APK
  from this exact feature SHA when safe resources permit, record API/Customer
  origins in the production JS bundle, verify signature, libraries and hash;
  reproduce both flows on physical Android, capture sanitized pinned results,
  prove successful secure UUIDv8 + exactly one Incident / INCIDENT_OPENED and
  verified Photo upload, or use the failing stage to gate a narrowly reviewed
  security/provider repair. No backend rollout or issue closure meanwhile.

## Review verdict

- P0 in patch: none identified by independent read-only review.
- P1 release blockers: original physical causes UNKNOWN; CSPRNG provider
  unproved; signed APK and real-device acceptance absent.
- P2 device verification: preview rendering, TalkBack/large font scale,
  permission return/lifecycle and stale callbacks still need real-phone QA.
- #302, #303, parent #275 and related #215 remain OPEN.
- **Verdict: BLOCKED ON PHYSICAL QA / SAFE BUILD CAPACITY AND SECURITY
  APPROVAL IF DEVICE EVIDENCE REQUIRES A NEW PROVIDER.**
