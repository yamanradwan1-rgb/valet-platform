# GPS-C Native Shift Presence — implementation and handoff

**READY FOR CHATGPT REVIEW — GPS-C**, under the owner's latest instruction to continue without building the APK. This is a review handoff, not physical acceptance, CI acceptance or strict production rollout approval.

OWNER-AUTHORIZED #262 SEQUENCING OVERRIDE: YES

#262 PHYSICAL VERIFIED: NO

APK build deferred by explicit owner instruction: `continue withot build the apk`.

## A. Git

Actual fetched origin/main base: `96b00c4e80bd394b398cee6b9f2b7148acdcd466`.
Owned branch: `codex/native-257-presence-native`. Initial tree was clean. The prior local branch had no unique commits; it was recreated from the fetched base. Issue #257 was read through the GitHub connector. No PR, merge or issue closure is authorized for this handoff.

The final local SHA, verified remote SHA and post-push clean-tree result are supplied in the accompanying final chat handoff: embedding this report's own final commit hash inside itself would change that hash. Verify with `git rev-parse HEAD`, `git ls-remote origin refs/heads/codex/native-257-presence-native` and `git status --porcelain`.

Exact changed-file inventory and physical counts are appended below. Generated Android artifacts are confined to `C:/Users/LP/Desktop/valet-app/gps-c-native-proof`; primary generated Android files were not edited.

## B. Structure

| Near-limit target                      | Initial physical lines | Final physical lines |
| -------------------------------------- | ---------------------: | -------------------: |
| employee-shift-start-session.ts        |                    292 |                  299 |
| employee-shift-end-session.ts          |                    300 |                  295 |
| native-auth-runtime.ts                 |                    300 |                  293 |
| native-production-lifecycle-owner.ts   |                    222 |                  225 |
| native-shift-start-panel.tsx           |                    207 |                  226 |
| native-active-shift-panel.tsx          |                    273 |                  287 |
| native-operational-http.ts (untouched) |                    248 |                  248 |

All new/modified authored code is at most 300 physical lines: YES. Start presentation/context reconciliation, End execution and Native Shift composition were extracted by responsibility. The new coordinator is 297 lines. No structure baseline or global architecture policy was changed.

`node scripts/gps-c-validation.mjs` checks the complete owned diff: allowed paths, physical lines, repository import policy, Prettier, affected-file ESLint, whitespace and byte-equivalent existing Shift style definitions (both palettes). It imports the existing architecture helpers without executing the root scanner. Root `pnpm architecture:check` was deliberately not run because it would read the explicitly excluded Employee Web tree.

## C. Dependency/config

`expo install expo-location` resolved **57.0.20**, declared `~57.0.20` with a matching lock entry. No other dependency version changed. Unrelated lock metadata drift was removed.

`app.json` adds the Location plugin, explicit foreground When-In-Use explanation in EN/AR, all background/always/motion switches false, and a narrow foreground-only manifest plugin. `app.config.ts` changed: NO. Camera plugin options changed: NO. SDK/build levels remain min 29, compile/target 36; cleartext remains disabled; notification, backup and camera settings are preserved.

Generated/public foreground permissions: ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION, alongside existing CAMERA. ACCESS_BACKGROUND_LOCATION: NO. GPS-C FOREGROUND_SERVICE_LOCATION permission: NO. GPS-C location foreground service: NO. Geofence/background service: NO.

Expo Location's library manifest unconditionally declares `LocationTaskService` even when the background plugin switches are false. The new plugin adds manifest-merger removal directives for that service and the two location background/service permissions. These directives appear in the generated source manifest, but the **merged debug manifest contains none of those declarations**. Existing unrelated notification/service declarations are preserved.

## D. Frozen acquisition contract

- Provider/API: installed Expo Location `watchPositionAsync`, a temporary foreground subscription; no last-known-position API.
- Deadline: **15,000 ms**, including permission/service/watch registration. Sample cap: **3 callbacks**.
- Request: `Accuracy.High`, `timeInterval: 1000`, `distanceInterval: 0`, `mayShowUserSettingsDialog: false`.
- First structurally valid fresh fix meeting action guidance ends acquisition. Otherwise the last structurally usable fresh fix is returned at the cap/deadline, including its real poor accuracy; only the server classifies attendance. A callback timestamp before action start, malformed coordinates/accuracy or implausible future timestamp is not used.
- Foreground permission is checked/requested only inside an explicit Shift action. Denial is LOCATION_UNAVAILABLE; disabled services are LOCATION_SERVICES_DISABLED; unavailable samples/deadline/provider failures are GPS_UNAVAILABLE.
- Fine/coarse and iOS full/reduced permission use actual delivered accuracy. No fabricated precision, relaxed strict threshold or client attendance verdict.
- Explicit settings action cancels the current local check before opening OS settings. Returning requires foreground authority validation and a fresh explicit action; no automatic protected mutation/acquisition.
- Every acquisition has an AbortSignal. Cancellation removes listeners, timers, subscription and measurement references. An already-aborted signal makes zero Location calls. A late non-cancellable permission/services/watch-registration promise cannot submit; a late registered watch is removed immediately.
- `LocationObject.mocked` is read at the object root: true -> true, false -> false, absent/unsupported -> omitted. This is a source signal, not spoof-proof attestation or local rejection policy.
- iOS uses When-In-Use only; full/reduced semantics, temporary foreground acquisition, settings and exact operation recovery are portable. No iOS background permission/infrastructure was added. Unsupported source signal remains absent. iOS physical behavior is unverified.

## E. Architecture and pre-code ledger

Binding sources: owner task, AGENTS.md, Accepted DEC-099/100, GPS-C execution-plan section, merged GPS-B consumer contracts/reports, docs 00/01/02/03/04/05/06/07/08/09/13/15/17. The implementation guardian and code-review guardian were applied.

Affected entities: authenticated User, OrganizationMembership, Organization, Location, Shift and exact ShiftPresenceOperation/Challenge/Exception. ValetSession transitions: NONE. Task/Dispatch transitions: NONE. Shift ACTIVE -> ENDED remains server-owned. New DB constraints/indexes/migrations: NONE. Company default -> Location override is consumed through action-specific server guidance; no configuration editor or strict rollout is introduced. This is the accepted sellable-MVP Native consumer capability.

| Observable proposition                                                   | Authority                          | Concrete boundary / verification                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Exact operation and evidence selector equality                           | Owner 15–29, DEC-099, merged GPS-B | shared transport schemas and coordinator; modes/transport tests                                               |
| OFF zero acquisition; WARN_ONLY missing evidence                         | Owner 19–22, GPS-B                 | evidence helper; mode/transport tests                                                                         |
| No mutation replay/inferred outcome after uncertainty                    | Owner 34–40, DEC-099               | recovery helper, Native runtime integration; recovery/runtime tests                                           |
| Explicit manager choice and approved continuation; terminal A -> fresh B | Owner 30–34, DEC-099/100           | exception recovery/helper; exception/fencing/UI tests                                                         |
| Foreground bounded acquisition and retirement                            | Owner 11–17, 39–43                 | Native adapter, existing lifecycle owner, AppState guard; adapter/fencing/lifecycle tests                     |
| True/false/absent source and no durable fix                              | Owner 4/23/43, GPS-B               | adapter/transport/minimized snapshot/store; source/privacy tests                                              |
| Existing own-End, cash/open-work and geometry                            | Owner L1/L6/26/47                  | existing routes, strict End result validator, optional session composition; existing Shift tests/style freeze |

Platform-neutral employee-client modules separate types, transport, transient workflow/evidence, exact recovery, failure handling and target equality. Native owns acquisition, SecureStore adapter, composition, foreground revalidation and inline presentation. Existing Start/End sessions use an optional coordinator; existing callers retain their legacy transport/reconciliation behavior.

Durable storage is a separate SecureStore key per START/END, device-only unlocked accessibility and installation-generation binding. Writes/deletes are serialized so an old write cannot overtake logout. Exact persisted fields:

```text
installationGeneration
  descriptor.version = 1
  descriptor.operationId
  descriptor.target.identityGeneration
  descriptor.target.organizationId / membershipId / locationId
  descriptor.target.action / shiftId / cashReported
  END only: shiftStartedAt / currency / original operational role (presentation only)
```

No challenge, exception body, full Start/End request, fix, mocked source, permission result or duplicate credentials is persisted. Field allowlists reject contamination. On restart, Start requires matching current membership/Organization/Location context. End retains its exact historical own-Shift scope through detached/inactive operational context; a different active Shift/membership retires it. The unchanged server proves own-Shift/operation access. Stored operational role only reconstructs the existing presentation, never grants current authority. The runtime rebases only the ephemeral auth generation after installation/identity restoration and performs exact GET recovery. Own-End recovery does not invent current LocationAccess: where no location presentation is available, the exact historical opaque Location UUID is used as a label. The backend still proves the actor's own Shift/operation.

## F. GPS-B contract consumption

Uses existing shared response/request schemas and canonical staff routes. Challenge guidance supplies action-specific mode/max accuracy/max age. Every final Start/End includes top-level O, including OFF/WARN_ONLY missing-evidence requests. MEASURED has the same O/challenge and a fresh clientSampleId; EXCEPTION has exact O/challenge/exception selectors. No Organization or membership authority is sent as a new client-controlled server grant.

Policy-race PRESENCE_REQUIRED/PRESENCE_REJECTED/APPROVER_AUTHORITY_REVOKED results are resolved using exact operation status. Measured denial exposes only the server's minimized classification/reason. A is terminal; manager choice allocates B and re-reads B's current mode before exception creation. Configuration-unusable denial is not relabeled outside and offers no inappropriate measured override.

COMMITTED recovery adopts its authoritative Shift result, including `decisionId: null` for evidence-free or NO_EFFECT_CONVERGENCE paths. Visible Shift state is never proof that the caller's O committed. Source true/false/absent is transmitted only in the intended measured body.

## G. Mode behavior

| Mode                | Local acquisition unavailable          | Protected command / fallback                                                             |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| OFF                 | Location API is never called           | same top-level O, no presence object                                                     |
| WARN_ONLY           | truthful attempt then missing evidence | same O, no presence object; final server policy remains authoritative; no exception flow |
| REQUIRE             | local unavailable feedback             | no Shift POST; explicit fresh retry/settings; no manager fallback                        |
| REQUIRE_OR_OVERRIDE | local unavailable feedback             | no Shift POST; explicit manager choice only; approved continuation still explicit        |

## H. Start

Existing location choice/explicit Start allocates O, persists only the safe descriptor, issues/verifies challenge, acquires according to guidance and submits exact selectors. Direct success refreshes current operational context; actual context controls the normal shell. Strict denial uses minimized exact recovery. Unknown outcomes retain O; retries/foreground recovery use GET only.

Same-location ACTIVE/no-effect convergence is accepted from the exact O result. Restart recovery also works when the current Shift is already active and eligibleLocations is empty. A visible active Shift with unavailable exact status leaves the operation uncertain. Location/membership/Organization/auth replacement fences the old attempt, including A -> B -> A. Legacy callers' prior reconciliation behavior is preserved and regression-tested.

## I. End

Existing exact own Shift, normalized cash and explicit confirmation remain. O binds membership/Organization/Location/action/Shift/cash; numerical cash is canonicalized for exact target identity. Existing End response validation checks original Shift/time/currency/reconciliation and authoritative blockers. Invalid local cash sends no request. Server open-work/cash failures retain their existing UI classification, not a GPS bypass.

Unknown End uses exact O GET and never replays a measured POST. Compatible already-ended convergence works even with no current usable Location. Changed cash or replaced Shift retires old O/approval. Cash editing is visibly disabled during confirmation/submission/uncertainty. Force-end remains a distinct existing server capability; no manager-force-end path is added.

## J. Exception

Local failure in REQUIRE_OR_OVERRIDE can request an exception on its pending O using LOCATION_UNAVAILABLE or GPS_UNAVAILABLE. Terminal measured denial A requires fresh B; the accepted helper maps CONFIDENT_OUTSIDE to OUTSIDE_ZONE, AMBIGUOUS_EDGE to AMBIGUOUS_FIX, eligible unusable measurement to GPS_UNAVAILABLE. Current mode is re-read immediately before explicit creation.

Lost creation acknowledgement is resolved via GET operations/O -> exceptionId -> GET exceptions/E and the exact challenge. No duplicate exception POST. PENDING remains informational. APPROVED offers explicit continuation, with no protected mutation on notification/foreground/status read. REJECTED/EXPIRED/CONSUMED cannot consume an approval; terminal state permits a fresh explicit attempt. Authority-revoked final denial remains server-authoritative.

## K. Lifecycle and recovery

The existing AppState owner suspends Start/End on inactive/background. Permission prompts receive no broad lifecycle exemption: if an OS permission prompt triggers suspension, its late result is fenced and the employee retries explicitly after returning. This conservative behavior requires device validation.

Before possible POST, background/cancel retires the acquisition and late callbacks cannot submit. After possible POST, only opaque O recovery state survives. Foreground/network return first refreshes auth/context, then uncertain Native presence sessions may GET exact status. Approval never auto-submits. Production authorization additionally requires current AppState active and non-offline connectivity.

Auth/logout clears transient attempts and awaits descriptor purge. Membership/scope/Shift/cash replacement uses monotonic generation and exact ordered target equality. A -> B -> A cannot revive an old callback. Runtime disposal suspends/fences rather than deleting unknown-operation recovery markers; explicit identity purge deletes them. Restart uses only the safe installation-bound descriptor, never raw GPS/request replay. Retry-After gates action, manager creation and status reads.

## L. Privacy

This matrix describes **GPS-C client-added employee raw measurement/source**, not GPS-B's existing server retention contract.

| Sink                                                       | Raw measurement/source introduced? |
| ---------------------------------------------------------- | ---------------------------------- |
| logs / console / telemetry / analytics / crash breadcrumbs | NO                                 |
| SecureStore / AsyncStorage / persistent workflow state     | NO                                 |
| Task GPS/history / audit / diagnostics                     | NO                                 |
| OFF request / WARN_ONLY missing-evidence request           | NO                                 |
| Exception request / status GET / challenge request         | NO                                 |
| Network bodies other than intended MEASURED Shift request  | NO                                 |
| Intended MEASURED Shift request, transient in flight       | YES, by contract                   |

Snapshots retain phase, mode, reason, minimized summary, allowed override reason and retry delay only. Descriptor tests reject raw fields/credentials; measured/source tests inspect exact outbound bodies. Coordinates are not shown in UI or forwarded to camera/physical diagnostics. In-flight network/OS internals cannot be erased by JS; logical retirement prevents those callbacks from becoming a new action. No continuous surveillance or background acquisition is added.

## M. UI

Touched existing panels: NativeShiftStartPanel and NativeActiveShiftPanel. Added inline NativeShiftPresenceStatus/EN-AR copy. States: discovery, acquisition, submission, local unavailable/permission/services, server outside/edge/inaccurate/stale/configuration denial, pending/approved/rejected/expired and exact-operation uncertainty. Added explicit cancel/settings/manager/status/continue actions using existing controls.

Geometry drift: NO in existing style definitions (exact source comparison passes). No new navigation design, overlay, palette, typography, radio geometry or altered field/control dimensions. Existing primitives/tokens are reused. EN complete: YES. AR complete: YES. RTL text alignment: YES in inspected/mocked presentation. Light and Dark: VERIFIED by pure render/palette tests and frozen styles; actual device pixel review: NOT VERIFIED. Accessibility: polite live feedback, busy state, existing button semantics/touch targets, controlled cash editing. Physical screen reader and rendering are pending.

## N. Camera / #262

Camera source changed: NO. Camera config changed: NO. #262 modified: NO. Deterministic GPS-C-caused camera regression identified: NO in focused tests. Owner sequencing override recorded: YES. #262 physical causal proof: NO.

Final camera/permission/ROI/OCR/torch subset: 15 files / 127 tests PASS. The production lifecycle owner is covered in the separate final Shift/shell subset (15 files / 91 tests); together the earlier 16-file camera/lifecycle set corresponds to 140 tests. No camera redesign or speculative #262 fix was introduced.

## O. Native config/build

config:public: PASS. Disposable Android prebuild: PASS. Source and merged manifest inspection: PASS. Primary and disposable app.json/plugin SHA256 match (`90CA8518062602FA21DBB73597E66BC61EBB92F7DE691C805834D9E895AE49FA`, `7F06A915042C8EB4B82AD31D679BC90C294D3585562772A9E58F65F76692A7D4`). Thus manifest evidence corresponds to the final config.

Before the latest owner instruction, `pnpm --filter @valet/valet-native android` failed because no Android device/emulator was available. A disposable `:app:assembleDebug` attempt failed in existing dependency CMake/Ninja long paths (`build.ninja still dirty after 100 tries`). One disposable init-script experiment with CMAKE_OBJECT_PATH_MAX=128 failed the same way. Existing Native #213 evidence records this host limitation. No tool/library/build-config changes were committed to bypass it.

The owner then explicitly instructed continuation without APK build. No more assembly attempts were made. Build variant attempted: debug/development. APK/artifact: NONE verified. Final build SHA: N/A; no final-source successful APK build exists. Prior build attempts used the baseline plus a then-current task overlay and are not final-commit runtime proof. Build log: `C:/Users/LP/Desktop/valet-app/gps-c-native-proof/gps-c-android-build.log`.

## P. Physical evidence

PHYSICAL ANDROID VERIFIED: NO. `adb devices -l` returned an empty device list. Device/model/API/build: N/A. Exact completed physical scenarios: NONE.

iOS PHYSICAL VERIFIED: NO. No authorized iOS device session occurred.

All owner acceptance scenarios remain pending:

1. OFF Start without permission prompt.
2. OFF exact End without permission prompt.
3. OFF response-loss exact recovery.
4. WARN_ONLY measured Start.
5. WARN_ONLY measured End.
6. WARN_ONLY unavailable GPS stays non-strict under current final policy.
7. REQUIRE inside Start.
8. REQUIRE inside End.
9. Outside-zone denial.
10. Ambiguous/edge denial.
11. Permission denied.
12. Precise/fine permission.
13. Approximate/reduced accuracy.
14. Services disabled.
15. Settings return.
16. Indoor inaccurate fix.
17. Acquisition timeout.
18. Background during permission.
19. Background during acquisition.
20. Background after possible mutation.
21. Network loss during Start.
22. Network loss during End.
23. Process restart and exact O recovery.
24. Same-location already-ACTIVE Start convergence.
25. Compatible already-ended End convergence.
26. Invalid cash.
27. Open-work blocker.
28. Changed cash does not reuse O/approval.
29. Measured denial A.
30. Fresh manager flow B.
31. Approval.
32. Explicit approved continuation.
33. Lost exception response and exceptionId recovery.
34. Rejection.
35. Approval expiry.
36. Force-end remains distinct.
37. Repeated completion/retirement leaves no ongoing Location acquisition/indicator.
38. Camera/check-in preview/ROI/torch smoke.

Where a source signal is exposed in an authorized test environment, tri-state mapping also needs physical inspection; it must not be presented as spoof-proof detection. Record model, Android version/API, final app SHA, variant and outcome, without a raw employee fix.

## Q. Commands and evidence levels

Final applicable code gates pass. **395 focused tests** across **48 files**: shared Shift 117; Native Shift/shell/recovery/UI 91; Native camera/permission/ROI/OCR/torch 127; shared contracts 60.

| Level                     | Observed result                                                                 |
| ------------------------- | ------------------------------------------------------------------------------- |
| IMPLEMENTED               | YES                                                                             |
| STATIC VERIFIED           | YES: actual tsc, Native ESLint and scoped structure/import/format/lint/geometry |
| LOCAL COMMAND VERIFIED    | YES: listed mocked/pure tests, config, prebuild and manifest                    |
| BUILD VERIFIED            | NO: prior host failure; latest owner deferred APK                               |
| RUNTIME VERIFIED          | NO: no real app/device/backend operation exercised                              |
| FAILURE VERIFIED          | NO for real device/network/process failure; simulated failures tested           |
| PHYSICAL ANDROID VERIFIED | NO                                                                              |
| iOS PHYSICAL VERIFIED     | NO                                                                              |
| CI VERIFIED               | NO: no remote CI run verified                                                   |

Executed validation/setup commands (read/search commands are not claimed as tests):

```powershell
git status --short
git fetch origin main
git rev-parse HEAD origin/main
git log origin/main..codex/native-257-presence-native
git switch -C codex/native-257-presence-native origin/main
& 'C:/Program Files/Git/bin/bash.exe' .agents/skills/vaylet-implementation-guardian/scripts/preflight.sh
pnpm --filter @valet/valet-native exec expo install expo-location
pnpm --filter @valet/employee-client typecheck
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/valet-native typecheck
pnpm --filter @valet/valet-native lint
pnpm --filter @valet/valet-native config:public
pnpm --filter @valet/valet-native prebuild:android # disposable checkout only
pnpm --filter @valet/valet-native android # disposable; no device, FAIL
# disposable android working directory, development/debug environment:
.\gradlew.bat :app:assembleDebug --console=plain
.\gradlew.bat :app:assembleDebug --console=plain --init-script ..\..\..\gps-c-cmake-paths.gradle
& 'C:/Users/LP/AppData/Local/Android/Sdk/platform-tools/adb.exe' devices -l
node scripts/gps-c-validation.mjs
git diff --check
```

The preflight passed. The preflight path above is the implementation-guardian script. Public/prebuild commands were repeated when the foreground-only manifest plugin was introduced, not represented as device acceptance. A mistaken read-only Git inventory command in the disposable non-Git checkout failed and did not copy files; it was corrected to run inventory in the primary repository before resynchronizing the disposable config. Formatting was executed only against the owned changed-file inventory (`pnpm exec prettier --write @taskFormat` / `@taskCode`). SHA256 comparisons used `Get-FileHash` on the two configs/plugins; generated manifests were inspected with `Get-Content`/`Select-String`.

Final exact shared Shift test inventory (passed 13 files / 117 tests):

```text
pnpm --filter @valet/employee-client exec vitest run
src/employee-shift-end-session.test.ts src/employee-shift-end-fences.test.ts
src/employee-shift-start-selection.test.ts src/employee-shift-start-reconciliation.test.ts
src/employee-shift-start-mutation.test.ts src/employee-shift-start-integration.test.ts
src/employee-shift-start-background-fence.test.ts src/employee-shift-end-state.test.ts
src/employee-shift-presence-transport.test.ts src/employee-shift-presence-recovery.test.ts
src/employee-shift-presence-modes.test.ts src/employee-shift-presence-fencing.test.ts
src/employee-shift-presence-exceptions.test.ts
```

These arguments were selected by scoped `rg --files packages/employee-client/src` filtering `employee-shift.*.test.ts`, then passed to `pnpm --filter @valet/employee-client exec vitest run @taskTests`. Earlier runs used the explicit presence 2/4/5-file subsets (23/42/46 tests) and the existing Shift subsets; they are superseded by the final 117-test result.

Final Native Shift/shell command (15 files / 91 tests PASS):

```text
pnpm --filter @valet/valet-native exec vitest run test/native-shift-start-panel.test.tsx test/native-active-shift-panel.test.tsx test/native-shift-end-http.test.ts test/native-shift-retirement.test.ts test/native-shift-protection.test.ts test/native-shift-detached-lifecycle-repair.test.tsx test/native-shift-copy.test.ts test/native-shift-presence-adapter.test.ts test/native-shift-presence-store.test.ts test/native-shift-presence-runtime.test.ts test/native-shift-presence-status.test.tsx test/native-push-route-denial.test.ts test/native-push-route-lifecycle.test.ts test/native-incident-recovery-context.test.ts test/native-production-lifecycle-owner.test.ts
```

Earlier Native presence adapter/store/runtime/status subsets (8, 21, 26 tests) and the existing 11-file Shift subset (57 tests) were executed during development. The final command above covers their final sources; the post-review detached-own-End/store subset also passed 13 tests before the final 91-test run. One runtime-test run had three failures, then one: restart target equality incorrectly depended on JSON key insertion order and an untyped recovery failure was not normalized as uncertainty. Exact ordered target keys and uncertainty normalization fixed both; all restart tests pass. Review also removed an accidental current-membership prerequisite from End; detached/inactive own-End GET recovery and explicit OFF cleanup are directly regression-tested. The role required by the existing Shift presentation is kept as a typed historical enum only, never a current authority grant. A shared reconciliation run then caught two legacy regressions from Native active-scope fencing; gating that behavior on presence composition restored both assertions. No assertion or timeout was weakened.

Final camera inventory (15 files / 127 tests PASS), obtained by scoped `rg --files apps/valet-native/test` and passed to `pnpm --filter @valet/valet-native exec vitest run @taskTests`:

```text
test/native-appearance-camera.test.ts test/native-camera-permission-lifecycle.test.ts
test/native-plate-camera-lifecycle.test.ts test/native-plate-camera-fallback.test.ts
test/native-plate-camera-step.test.ts test/native-plate-camera-step-fallback.test.ts
test/native-plate-roi-binding.test.ts test/native-plate-roi-viewport.test.ts
test/native-plate-roi-geometry.test.ts test/native-plate-roi-capture.test.ts
test/native-plate-roi-cleanup.test.ts test/native-plate-ocr-loop.test.ts
test/native-plate-ocr-diagnostics.test.ts test/native-plate-torch.test.ts
test/native-plate-torch-control.test.ts
```

Contract command (5 files / 60 tests PASS):

```text
pnpm --filter @valet/contracts exec vitest run src/shift-presence.test.ts src/shift-presence-public.test.ts src/shift-presence-mocked.test.ts src/shift-presence-consumer.test.ts src/shift-presence-management-result.test.ts
```

The final five-test UI subset was rerun after ensuring an OFF-to-strict policy-race denial remains visible rather than being hidden by prior OFF guidance. Initial Native typecheck exposed the known baseline timezone omissions in four owned fixture files, plus an adapter mock typing issue. Only the missing authoritative `timezone: Asia/Amman` fixture fields were added; production schemas were not weakened. Native lint's initial prefer-const error and scoped ceiling/format failures were fixed by a correct abort-safe timer and responsibility extraction/formatting. Final gates were rerun after those changes; no failed final code test remains.

## R. Scope assertions

| Assertion                            | YES / NO |
| ------------------------------------ | -------- |
| Native changed                       | YES      |
| Employee Client changed              | YES      |
| expo-location added                  | YES      |
| Background location permission added | NO       |
| Continuous/background tracking added | NO       |
| OS geofence added                    | NO       |
| Raw GPS durable storage added        | NO       |
| Mocked source durable storage added  | NO       |
| Task GPS reused                      | NO       |
| Server production code changed       | NO       |
| Database changed / migration added   | NO / NO  |
| Dashboard changed                    | NO       |
| Employee Web read / changed          | NO / NO  |
| Strict rollout enabled               | NO       |
| Camera source modified               | NO       |
| #262 physically proven               | NO       |
| GPS-D started                        | NO       |
| PR created / merge performed         | NO / NO  |
| Issue #257 closed                    | NO       |

## S. Review verdict and remaining gaps

Self-review target: fetched base through the complete owned tracked/untracked diff; final source inventory below. Scope, Accepted DEC fidelity, exact scope/auth fences, retry/concurrency, adapter compatibility, privacy, downstream legacy callers, structure, tests, internal consistency and evidence passes were performed under the VAYLET review matrix. No remaining substantive client implementation finding was identified in the reviewed paths.

Security/tenant/location: Native never claims manager or backend mutation authority; the unchanged authenticated GPS-B routes retain server ownership, self-vs-other and tenant/location enforcement. Local checks precede protected submission and every asynchronous evidence/status/exception completion is fenced. This is source/mocked-client verification, not a fresh real IDOR/DB test.

Retry/concurrency/DB: O correlation, singleflight, terminal A/fresh B, exact GET after uncertainty and explicit approved consumption are covered. DB/audit transaction rules are unchanged. Abstraction/downstream compatibility: optional presence preserves legacy behavior; the regression subset passes. Audit/privacy: no new raw sink identified. Architecture: all affected authored files <=300 and scoped gates pass. Tests: focused boundaries and failure simulation are covered; physical and hard-process/network failures remain unverified. Scope leakage: none identified.

Merge verdict under the review skill: **BLOCK MERGE** until independent review, repository CI and applicable build/device acceptance gates are met. This is an evidence gate; no remaining substantive source defect was identified. This self-review cannot satisfy cross-human review or remote CI.

Remaining implementation gap: NONE identified in reviewed GPS-C client scope. Failed final test: NONE. New server-contract dependency/defect: NONE identified. Known APK/build issue: Windows dependency CMake/Ninja path limitation; APK deferred by latest owner. Android scenarios: all 38 above pending. Physical lifecycle/recovery/privacy/camera proof: pending. iOS physical gate: pending. Remote CI: unverified. Independent ChatGPT/human review: pending. No strict production readiness or #262 closure claim is made.

## Exact file inventory and final authored physical counts

| File                                                                    | Final physical lines (authored code) |
| ----------------------------------------------------------------------- | -----------------------------------: |
| apps/valet-native/app.json                                              |                                  N/A |
| apps/valet-native/package.json                                          |                                  N/A |
| apps/valet-native/plugins/with-shift-presence-foreground-only.cjs       |                                   27 |
| apps/valet-native/src/auth/native-auth-runtime.ts                       |                                  293 |
| apps/valet-native/src/shell/native-production-lifecycle-owner.ts        |                                  225 |
| apps/valet-native/src/shift/native-active-shift-panel.tsx               |                                  287 |
| apps/valet-native/src/shift/native-shift-presence-adapter.ts            |                                  133 |
| apps/valet-native/src/shift/native-shift-presence-copy.ts               |                                   67 |
| apps/valet-native/src/shift/native-shift-presence-revalidate.ts         |                                   17 |
| apps/valet-native/src/shift/native-shift-presence-runtime.ts            |                                  170 |
| apps/valet-native/src/shift/native-shift-presence-status.tsx            |                                  127 |
| apps/valet-native/src/shift/native-shift-presence-store.ts              |                                  149 |
| apps/valet-native/src/shift/native-shift-runtime.ts                     |                                   51 |
| apps/valet-native/src/shift/native-shift-start-panel.tsx                |                                  226 |
| apps/valet-native/test/native-incident-recovery-context.test.ts         |                                  107 |
| apps/valet-native/test/native-push-route-denial.test.ts                 |                                  161 |
| apps/valet-native/test/native-push-route-lifecycle.test.ts              |                                  270 |
| apps/valet-native/test/native-shift-presence-adapter.test.ts            |                                  180 |
| apps/valet-native/test/native-shift-presence-runtime.test.ts            |                                  265 |
| apps/valet-native/test/native-shift-presence-status.test.tsx            |                                  144 |
| apps/valet-native/test/native-shift-presence-store.test.ts              |                                  152 |
| apps/valet-native/test/native-shift-retirement.test.ts                  |                                  210 |
| docs/validation/GPS_C_IMPLEMENTATION_REPORT.md                          |                                  N/A |
| packages/employee-client/src/employee-shift-end-attempt.ts              |                                   52 |
| packages/employee-client/src/employee-shift-end-session.ts              |                                  295 |
| packages/employee-client/src/employee-shift-end-types.ts                |                                   63 |
| packages/employee-client/src/employee-shift-presence-evidence.ts        |                                   80 |
| packages/employee-client/src/employee-shift-presence-exceptions.test.ts |                                  161 |
| packages/employee-client/src/employee-shift-presence-failure.ts         |                                   23 |
| packages/employee-client/src/employee-shift-presence-fencing.test.ts    |                                   95 |
| packages/employee-client/src/employee-shift-presence-modes.test.ts      |                                  118 |
| packages/employee-client/src/employee-shift-presence-recovery.test.ts   |                                  111 |
| packages/employee-client/src/employee-shift-presence-recovery.ts        |                                  161 |
| packages/employee-client/src/employee-shift-presence-session.ts         |                                  297 |
| packages/employee-client/src/employee-shift-presence-target.ts          |                                   49 |
| packages/employee-client/src/employee-shift-presence-test-fixture.ts    |                                  159 |
| packages/employee-client/src/employee-shift-presence-transport.test.ts  |                                  119 |
| packages/employee-client/src/employee-shift-presence-transport.ts       |                                  104 |
| packages/employee-client/src/employee-shift-presence-types.ts           |                                  130 |
| packages/employee-client/src/employee-shift-presence-workflow.ts        |                                   87 |
| packages/employee-client/src/employee-shift-start-presentation.ts       |                                  106 |
| packages/employee-client/src/employee-shift-start-session.ts            |                                  299 |
| packages/employee-client/src/employee-shift-start-types.ts              |                                   47 |
| packages/employee-client/src/index.ts                                   |                                  131 |
| pnpm-lock.yaml                                                          |                                  N/A |
| scripts/gps-c-validation.mjs                                            |                                  103 |

Scoped lint treats the new Expo config plugin as CommonJS and permits only its required Expo SDK import through a per-file rule allowlist. All TypeScript rules remain unchanged; no source lint suppression or global ESLint-policy modification was added. Native package lint does not otherwise include config plugins. Report formatting explicitly uses the repository .gitignore because .prettierignore excludes docs.

## T. Authorized recovery corrections (2026-10-05)

Continuation base: `07e10687f7bac8c781ecc9039b330a28fb2058f1`, on the existing `codex/native-257-presence-native` branch. The owner authorized only the two independent-review recovery findings and focused checks, with APK assembly still deferred.

Affected entities are the Native recovery descriptor and transient Shift Presence attempt, Shift Start/End presentation, and existing Operation/Exception status consumers. There are no ValetSession or Task/Dispatch transitions, server routes, database constraints/indexes, policy schema, or Company/Location precedence changes. Existing authenticated User/member/Organization/Location boundaries and safe own-End remain binding under DEC-099/100.

Connectivity is availability rather than authority. Offline lifecycle fencing must retain an unresolved protected Shift or Exception operation as uncertain, with locked target/cash and exact-O GET recovery after fresh authority validation. Pre-dispatch acquisition can be cancelled safely. Late responses cannot settle a fenced parent attempt.

The allowlisted descriptor will add only a controlled dispatch stage: local/challenge work, Shift may have left, or Exception may have left. Each protected dispatch requires its durable stage write first. Old stage-less descriptors remain conservatively recoverable as Shift may have left. No coordinates, mock signal, challenge/evidence body, credentials, or raw request are retained. Local-only restart reconciles authoritative status before permitting an explicit fresh action. Recovered measured denial permits explicit fresh B, whose current challenge mode gates Exception creation.

Structure plan: extract protected Shift dispatch from the near-ceiling coordinator and keep parent fencing helpers focused. Tests will cover deferred offline late success/failure, both parent locks, local/protected restart stages, current-B mode gates, persistence failure and privacy/purge. Validation and final evidence follow after implementation; no physical device, APK, or remote CI proof is implied.

### Correction evidence and review

Both findings are implemented. Native availability is separate from authenticated identity/scope; offline fencing runs before End's online presentation update. Parent fencing also reconstructs the exact pending target after manager Exception dispatch from a local-error presentation. Uncertain target/cash changes are guarded. Late success and failure retain O; reconnect validates context before exact GET. Already-confirmed results remain settled, while fencing during success cleanup still requires exact GET. An unresolved Exception request cannot be posted again by another manager action.

New writes contain `LOCAL`, `SHIFT_MAY_HAVE_LEFT`, or `EXCEPTION_MAY_HAVE_LEFT`; the latter two must be stored before their POST. Legacy descriptors without stage stay conservatively recoverable. Local-only restart reads O and, where still pending, its current challenge; it returns an explicit-retry state and offers manager choice under current REQUIRE_OR_OVERRIDE guidance. Recovered terminal measured denial clears A's historical mode, permits an explicit fresh B, and re-reads B's current mode before any Exception POST. No raw fix/mock flag/challenge/evidence/credential/request was added to storage. Transient evidence is released after dispatch.

| Focused gate                                            | Current local evidence                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shared presence/Start/End tests                         | 134 passed, 15 files                                                            |
| Native presence/Shift/lifecycle tests                   | 94 passed, 13 files                                                             |
| Employee client, contracts, Native typechecks           | Passed                                                                          |
| Native package lint                                     | Passed                                                                          |
| GPS-C scoped structure/import/format/lint/diff/geometry | Passed: 48 authored files, 52 owned files; every code file <=300 physical lines |
| `git diff --check`                                      | Passed                                                                          |

The final focused tests total **228 across 28 files**. Native coverage includes presence adapter/store/status/runtime/connectivity, Shift retirement/protection/Start/active panels/End HTTP/detached lifecycle repair, and lifecycle owner/authority. Shared coverage includes all existing presence/Start/End tests plus stage and restart tests. Initial six stage regressions failed against the reviewed implementation before correction. Deferred tests cover both late outcomes for Shift and Exception POST, pre-dispatch offline cancellation, locked Location/cash, exact GET after reconnect, all four current B modes, stage-write failures, and descriptor purge. Restart tests simulate process loss through fresh coordinators/runtime and persisted descriptors; they are not physical process-kill proof.

Self-review used the VAYLET code-review skill against the actual correction diff from `07e10687f7bac8c781ecc9039b330a28fb2058f1`, DEC-099/100, the binding structure/security/Definition-of-Done contracts, and the owner's two authorized findings. No unresolved code finding was identified in this correction scope. Scope/contract, identity/tenant/Location, retry/persistence, abstraction/downstream, privacy, structure, and focused-test passes are locally verified. Server authorization, database integrity and atomic audit remain existing GPS-B responsibilities; no server/schema/route/policy/dependency change is included. The geometry gate remains green; camera source is unchanged and camera tests were not rerun in this focused continuation.

Review merge verdict: **BLOCK MERGE** pending the requested independent re-review and repository merge gates. The owner requested commit/push only. APK assembly was not retried; all prior physical-device, iOS, APK, actual remote CI and rollout limitations remain. This correction is ready for code re-review, not a claim of physical or production readiness.

## U. Residual recovery-stage corrections (2026-10-05)

Continuation base: `8f66018fea402caa3b4166d1daa2ae9c49f998f9` on the same owned branch. The owner accepts the two earlier fixes and authorizes only truthful local-failure provenance and durable retirement after definite failed Shift responses. This section supersedes T's unsupported inference that a LOCAL pending challenge alone proves GPS_UNAVAILABLE.

LOCKED: LOCAL without an actually observed controlled acquisition failure must reconcile exact status and require a fresh explicit action, without manager eligibility. Observed LOCATION_UNAVAILABLE or GPS_UNAVAILABLE may be stored as a controlled non-sensitive classification; current REQUIRE_OR_OVERRIDE guidance must still gate manager choice. A definite non-network/non-408/non-5xx Shift rejection outside the existing three presence-terminal recovery codes must retire the durable marker before retryable definite presentation. Ambiguous, offline, lifecycle-fenced and presence-terminal recovery paths retain the existing semantics.

DERIVED: persist the controlled failure only after acquisition actually fails; omit it from protected dispatch-stage descriptors. Await durable marker retirement before clearing transient sent state and exposing a definite failure. Storage retirement failure remains uncertain. FORBIDDEN: server/DB/migrations, Dashboard, Employee Web, GPS-D, APK, Android physical testing, iOS testing and remote CI waiting. UNRESOLVED: none in this authorized client correction.

Affected entities: recovery descriptor, transient presence attempt, and existing Shift Start/End error presentation consumers. No ValetSession or Task/Dispatch transitions, tenant/Location authority changes, DB constraints/indexes, configuration schema or Company-default/Location-override changes. DEC-099/100, privacy, exact-O recovery, safe own-End and current-mode exception gating remain binding. Existing evidence/failure/workflow/store modules have room below 300 lines; new focused tests will be split by failure provenance and definite-response retirement. Validation evidence follows after implementation.

### Final residual-correction evidence

LOCAL alone now carries no failure inference. Only an actual acquisition rejection records allowlisted `localFailure: LOCATION_UNAVAILABLE | GPS_UNAVAILABLE`; failure after acquisition completed cannot fabricate that provenance. Native parsing rejects arbitrary classifications or provenance attached to a protected-dispatch stage. Protected Shift/Exception stage writes omit localFailure. Restart reads exact O and current challenge guidance; absent provenance requires fresh explicit acquisition, and observed provenance offers manager choice only under current REQUIRE_OR_OVERRIDE. No raw measurement/source, request, challenge/evidence body or credentials were added to storage.

Definite protected Shift failures now await durable descriptor deletion before changing transient sent state or exposing retryable failure. OPEN_TASK_HANDOFF_REQUIRED, ACTIVE_SHIFT_CONFLICT and controlled cash rejection retire their old O; a fresh Native runtime finds no unknown marker and a new explicit action allocates a new O. If deletion fails, the attempt remains uncertain with SHIFT_MAY_HAVE_LEFT and GET-only recovery. A late deletion failure after logout cannot publish into the cleared coordinator. Network errors, 408, 5xx, late lifecycle-fenced responses and the three presence-terminal recovery codes retain their existing exact-O behavior.

| Focused gate                                                                   | Current local evidence                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Shared Start/End plus presence stage/restart/provenance/definite-failure tests | 107 passed, 12 files                                                              |
| Native presence runtime/connectivity/known-failure/store tests                 | 39 passed, 4 files                                                                |
| Employee-client and Native typechecks                                          | Passed                                                                            |
| Native package lint                                                            | Passed                                                                            |
| GPS-C scoped structure/import/format/lint/diff/geometry                        | Passed: 51 authored files, 55 owned files; all authored code <=300 physical lines |
| `git diff --check`                                                             | Passed                                                                            |

The final focused run totals **146 tests across 16 files**. Eight new regressions initially failed against 8f66018 before implementation. Tests cover descriptor-before-challenge, challenge-before/during-acquisition process loss, both actually observed reasons against all four current modes, fresh explicit acquisition, controlled provenance validation, Native Start/End known rejection restart, storage retirement delay/failure, logout fencing, and contrasts with ambiguous and presence-terminal outcomes. No timeout was increased. The earlier erroneous Native LOCAL manager assertion was replaced with separate absent/observed provenance cases; existing positive manager and unknown-recovery coverage remains.

VAYLET self-review examined the actual diff from 8f66018 against the two owner-authorized corrections and DEC-099/100. No unresolved finding was identified in this scope. Authorization/scope, exact-O retry, private storage, existing command/downstream boundaries and structure remain intact. UI files, server, DB/migrations, Dashboard, Employee Web, GPS-D, dependencies and lockfile are untouched. Only focused affected suites and requested static checks ran. APK, physical Android, iOS and remote CI were neither executed nor required for this continuation. Simulated restart tests remain local evidence, not physical process-kill proof.

Review merge verdict remains **BLOCK MERGE** pending the owner's requested final independent re-review; this task authorizes commit/push only. Final status: ready for ChatGPT final code re-review, with the previously documented physical/rollout gates unchanged.
