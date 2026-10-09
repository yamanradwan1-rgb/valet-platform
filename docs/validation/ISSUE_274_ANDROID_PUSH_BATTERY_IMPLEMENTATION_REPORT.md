# Issue #274 — Android Retrieval Push Timing and Conditional Battery Notice

**Task:** 4 only. **Base/main:** `a43975e94b078c2e90ab1b6914b544067191c839`. **Branch:** `fix/issue-274-android-push-battery-reliability`. **Worktree:** `D:\kndoom\valet-platform\tmp\issue-274-worktree`.

## 1. Observed behavior versus unknown boundaries

Preserve the October 8, 2026 Jordan local observation exactly: Employee `com.vaylet.employee`, screen off/locked, current Staff account/active applicable Shift and Location, Guest T2 retrieval; no system notification when screen off; screen wake still showed none; opening Employee showed an existing canonical request in Tasks and the in-app attention; approximately three minutes after the Guest request an Android OS notification appeared while the Retrieval Task was still `OPEN/QUEUED`.

| Observation | Jordan local time | Provenance |
| --- | --- | --- |
| Guest request committed: QUEUED Task and Push intent | 21:09:54.883 | Historical backend/DB evidence from issue |
| FCM provider ACCEPTED | 21:09:57.212 | Historical worker/provider evidence from issue |
| Device Android OS notification visible | Approximately three minutes after request | Human observation; NOT an exact OS timestamp |

**Root cause:** `ROOT_CAUSE_UNVERIFIED_ON_DEVICE`. The T1→T2 delay was seconds; T3 device handling, T4 Android notification posting and accurate T5 observation clocks were **not captured**. No supported evidence identifies a ~3-minute worker scheduling interval, but provider acceptance does not establish Android delivery. Do not attribute the delay to Battery Optimization, Doze, OEM power control, Firebase proxying/deprioritization, channel importance, network, Low Power Standby or notification permission without an instrumented device trial.

### Timing boundaries and source diagnosis

T0 Guest press → T1 committed retrieval Task/intent → T2 FCM provider response → T3 device-side receipt/handling (if observable) → T4 Android system notification posted → T5 human-visible → T6 user tap → T7 *currently authorized* Task queue. Clock provenance matters; compare server/device only with a documented clock offset and uncertainty. A foreground React Native JS listener is **not** a universal background/locked-screen device receipt clock. Without a real device, T3=`DEVICE_RECEIPT_UNOBSERVABLE`, T4=`UNKNOWN`, T5=approximate only.

Server sends `android.priority=HIGH`, TTL bounded by the remaining 300-second intent lifetime, max 4 delivery attempts, bounded retry/eligibility/finalization. `PROVIDER_ACCEPTED` is a provider-only terminal classification. On every delivery candidate, eligibility revalidates User, StaffAuthSession/registration, membership, active Shift and exact Location; no push payload authorizes retrieval. The existing Android `vaylet-operational-retrieval` channel remains `DEFAULT`, configured through Expo. Existing foreground OS sound/banner/list suppression remains unchanged; canonical foreground Task attention stays primary.

### New read-only, fail-open diagnostics

The closed, existing in-memory Native Push telemetry vocabulary now also classifies `foreground-js-observed`, `notification-response-captured`, `route-held`, `route-dropped`, `route-resolved`, and `canonical-refresh-succeeded|failed` with bounded duration (at most 60,000 ms) for the already-authorized Task refresh boundary. These are **not** background OS delivery timestamps. No backend table, endpoint or migration; no new Push policy. No FCM token/hash, user, auth session, Task, tenant, location, registration, intent IDs, plate, payload or raw exception message enters the new measurements. Telemetry uses the existing bounded, sanitizing, fail-open in-memory sink. A failed recording cannot alter Task or Push state.

## 2. Framework-only battery capability contract

Local Expo module `VayletBatteryStatus` checks Android's actual `PowerManager.isIgnoringBatteryOptimizations(context.packageName)`, without requesting exemption, adding permissions or writing to Settings. This signal means *membership in Android's device power allowlist*, not a guarantee of timely FCM delivery, not OEM vendor-specific unrestricted status, and not the same as notification permission, channel importance, App Standby, Low Power Standby or other background restrictions. Android/Expo SDK interfaces were source-inspected; `expo-modules-autolinking search/resolve --platform android` discovers the local module in Expo 57. A real Android native build/runtime load **has not been performed** (`NATIVE_LINKAGE_UNVERIFIED`).

| Internal state | Evidence/meaning | Visible notice |
| --- | --- | --- |
| `checking` | Current validation running, including foreground resume | NONE |
| `configured` | Framework allowlist query returned `true` | NONE |
| `restricted` | Framework allowlist query returned `false` (only “not exempt”, **not** an OEM Restricted classification) | Exactly one existing-design notice |
| `unknown` | Read failed, timed out, invalid/ambiguous/no signal | NONE |
| `unsupported` | Missing module or non-Android platform | NONE |

Device-specific mismatch between the Android framework allowlist and the OEM-visible battery UI must be evaluated physically under package U-005. Where the framework signal cannot truthfully represent the intended user-facing condition, preserve `unknown`/do not assert OEM compliance. This implementation never claims that one framework API controls every OEM mode.

### Settings and lifecycle

Only an employee tap on the visible verified nonexempt-state notice calls the tiny Kotlin settings launcher. Try `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`; fallback to `ACTION_APPLICATION_DETAILS_SETTINGS` with VAYLET's own Android package URI. If both fail, do nothing safely. No direct exemption-request intent or `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, no background settings launch, no automatic permission changes, no wake lock/background task/service.

The `NativeBatteryStatusOwner` starts in `checking`; is only activated in authenticated active Employee workspace; uses the *existing production permission-aware AppState observer* via a stable callback; on background/auth/workspace generation changes invalidates stale results and immediately hides the prior warning; on foreground re-reads OS setting and ignores obsolete responses; duplicate same-generation reads are coalesced and an indefinite native response has a bounded 2.5s timeout to `unknown`. Returning from Settings is just foreground recheck; no false successful-setting claim or dismiss/relogin requirement. No continuous polling/network activity/persistence.

## 3. UI frozen except this one conditional warning

Inserted after `NativeConnectivityBanner` and `NativeTaskTrackingStatus`, before unchanged `EmployeeAppHeader`. Existing EmployeeCard, EmployeeButton, semantic Light/Dark palette, typography and spacing; no new generic design system. Configured/checking/unknown/unsupported/iOS/web **return null**: no placeholder View, reserved height or header/Task/navigation change. The 300-physical-line code ceiling is respected. The warning action uses EmployeeButton standard touch target, and the text uses existing `palette.textPrimary` for at least 4.5:1 contrast in both themes; EN/AR human text alignment honors RTL.

**Exact proposed EN text; Owner U-004 final visual acceptance still pending:**

> Battery optimization may delay vehicle requests.
> Choose Unrestricted or Don’t optimize for VAYLET Employee in Android settings. Delivery still depends on network and device settings.
> Open battery settings

**Exact proposed AR text; Owner U-004 final visual acceptance still pending:**

> قد يؤخر تحسين البطارية إشعارات طلب المركبة.
> اختر «غير مقيّد» أو «عدم تحسين البطارية» لتطبيق VAYLET Employee في إعدادات Android. يبقى وصول الإشعارات مرتبطاً بالشبكة وإعدادات الجهاز.
> فتح إعدادات البطارية

Automated `native-battery-render-matrix.test.ts` renders the actual authored warning component via the project's non-device appearance renderer at 320px across EN/AR × Light/Dark, asserts equivalent geometry and verified text, and tests no rendered node in every nonrestricted state. `native-battery-warning.test.tsx` verifies one alert/action and exact bilingual copy. These are **synthetic render-tree fixtures**, NOT screenshot evidence, live fonts, physical TalkBack or real Android pixels. Physical large-font, small-screen, TalkBack and final Owner exact visual sign-off remain mandatory.

## 4. Change inventory and security boundaries

Native module: `apps/valet-native/modules/vaylet-battery-status/{index.ts,expo-module.config.json,android/build.gradle,android/src/main/java/expo/modules/vayletbatterystatus/VayletBatteryStatusModule.kt}`.

Battery presentation/platform/owner: `apps/valet-native/src/notifications/{native-battery-platform.ts,native-battery-status.ts,use-native-battery-status.ts,native-battery-copy.ts,native-battery-warning.tsx}`. Source-stage diagnostics: `apps/valet-native/src/notifications/native-push-timing-diagnostics.ts`, and narrow calls in `native-push-lifecycle.ts` / `use-native-push-response.ts`, with closed classifications in `packages/employee-client/src/employee-telemetry-classification.ts`.

Existing Native shell wiring: `apps/valet-native/src/shell/{native-production-shell.tsx,native-production-workspace.tsx,native-production-workspace-types.ts,use-native-production-lifecycle.ts}`. Production mock fixtures updated: `test/native-production-shell-task-entry.test.tsx`, `test/native-handoff-recovery-production-mounted.test.tsx` (inject configured/no-warning state).

New focused tests: `apps/valet-native/test/native-battery-{status,platform,settings-return}.test.ts`, `native-battery-warning.test.tsx`, `native-battery-render-matrix.test.ts`, `native-push-timing-diagnostics.test.ts`. No changes to Guest/Customer/Dashboard behavior, backend Push priority/TTL/payload, channel ID/importance, auth/Shift/Location, #273 same-user ownership, Task/ValetSession/custody/handoff/payment mutations. No new dependency or lockfile change, Android permission or manifest edit, DB schema/Prisma migration/API DTO. No exposure of private Push identifiers or user information.

## 5. Validation and known limitations

Baseline before modification on exact a43975e9: Native 8 selected suites **55 PASS / 2 FAIL** (pre-existing `native-appearance-render-matrix.test.ts` Shift Light/en and Shift Light/ar fixture expects no `TextInput.editable`, runtime emits `editable:true`). API `staff-push-payload` 3/3, `staff-push-operational-policy` 27/27: **30/30 PASS**. Do not change Shift fixture or call those two failures #274 regressions. At the pre-implementation code SHA architecture checker already reports unrelated oversized `packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts` (328 lines) and portable `window` usage in `packages/employee-client/src/employee-shift-presence-local-provenance.test.ts`; do not amend these in #274.

After implementation, the selected Native matrix (21 suites) produced **129 PASS / 2 FAIL** — precisely the same two known Shift Light fixture failures; all other cases passed. A further 10 disjoint #273 Push account-transition/purge/response/production lifecycle suites produced **61/61 PASS**. Combined focused Native validation: **190 PASS / 2 known pre-existing FAIL**, 31 suites. Battery-specific tests alone: **27/27 PASS** (status 8, settings-return 2, platform 6, warning 6, four-language/theme and no-node render matrix 5). Fixed Push-stage diagnostic tests **2/2 PASS**. API selected Push suites **30/30 PASS**. Employee-client telemetry closed-vocabulary/privacy suites **147/147 PASS**.

`pnpm --filter @valet/valet-native typecheck`, `lint`, `pnpm --filter @valet/employee-client typecheck`, `lint`, and `pnpm --filter @valet/api typecheck`, `lint` all passed. `pnpm --filter @valet/valet-native exec expo config --type public` passed: no new battery permission is present; `expo-modules-autolinking search/resolve --platform android` discovered `VayletBatteryStatusModule`. `git diff --check` passed (only Windows LF/CRLF informational warnings). `pnpm architecture:check` still exits nonzero **only** for the two unrelated pre-existing files described above, not the Task #274 changed files. The test runner does not compile Kotlin/Gradle. No PostgreSQL integration was run against a shared database; DB tests require a separately proven disposable harness.

**Independent review A — Android/Expo:** Independent read-only FINAL **PASS** (no P0/P1). Reviewer checked local Expo 57 module classifier/Gradle/Kotlin source compatibility; Settings intents, framework-only PowerManager semantics, 2.5s timeout, stale generation fencing, stable production AppState callback and no hidden background service. Independently reran battery/diagnostic **29/29 PASS** and lifecycle/Push **60/60 PASS**. Actual Gradle linkage/runtime and OEM behavior are explicitly not verified.

**Independent review B — Push/security:** Independent read-only FINAL **PASS** (no P0/P1). Reviewer checked complete current source/document diff: closed, ID-free telemetry only, fail-open route observations, no FCM/payload/priority/TTL/channel change, no #273 cross-user registration replacement, no Task/Shift/Location/custody mutation, no OS exemption request or new permission. Physical delivery and native linkage remain explicitly untested.

**Independent review C — Native UI/accessibility:** Independent read-only FINAL **PASS** (no P0/P1). Reviewer confirmed existing AppState observer reuse, 300-line workspace, exact conditional-only notice with RTL/theme/contrast and mounted regressions.

## 6. Physical and release gates

The Owner explicitly has the only physical Android test path; Task 4 did not build an APK, install an app, measure screen-off device receipt, validate an OEM Battery mode, or capture actual OS notification posting. Full controlled physical trial and redacted evidence form: [`ISSUE_274_PHYSICAL_ANDROID_TIMING_QA.md`](ISSUE_274_PHYSICAL_ANDROID_TIMING_QA.md).

Release gates remain `U004_VISUAL_SIGNOFF_PENDING`, `U005_PHYSICAL_CAPABILITY_PENDING`, `PHYSICAL_FCM_TIMING_PENDING`, `NATIVE_LINKAGE_UNVERIFIED`; task branch must **not** be merged, built, deployed or #274 closed before applicable separate authorization/evidence. Push remains optional attention and canonical Tasks remain the only operational authority.

**Git commit/push/branch SHAs:** The immutable commit SHA and verified remote branch equality are recorded in the separate final task handoff (a commit cannot contain its own cryptographic SHA). This document's base SHA above stays fixed. No PR/merge/deployment/APK/Issue closure is authorized by this code milestone.
