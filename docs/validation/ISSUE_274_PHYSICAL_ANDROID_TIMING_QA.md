# Issue #274 — Owner-run Android FCM timing and battery QA packet

**Status:** PHYSICAL_QA_PENDING. This is a test plan, not device evidence.
**Scope:** VAYLET Employee Android `com.vaylet.employee`; no APK was built or installed by Task 4.

## Preconditions and provenance

Use only a separately authorized QA device, matching QA APK and backend. Never test disruptive Doze commands on a production Employee handset. Before each trial record:

- Build identity: exact Git source SHA, APK SHA-256, app version/build, backend SHA, FCM QA environment class (no project identifier or secret).
- Authorized synthetic Staff account, exact active Location Shift and healthy current registration; confirm the #273 account-binding regression has been cleared for the same build.
- Android API version, OEM/model, locale (EN/AR), Light/Dark, clock and calibration offset between server/device (with uncertainty).
- Notification app permission and per-channel status/importance independently of battery state.
- Framework `PowerManager.isIgnoringBatteryOptimizations()` result *and* separately inspected OEM-visible Battery setting. The former is not equivalent to every vendor's “Unrestricted” state.
- Network (Wi-Fi/mobile/offline), foreground/background/screen off, normal process death versus explicit force-stop, App Standby/Doze/Low Power Standby if observable.

## T0–T7 stage ledger

| Stage | Record and clock source | Limitations |
| --- | --- | --- |
| T0 | Human Guest presses Request Vehicle; QA synchronized observation | Human clock uncertainty |
| T1 | Server-authoritative Task QUEUED and Push intent committed; DB/API timestamp | Does not prove Push delivery |
| T2 | Backend FCM provider ACCEPTED; provider/DB timestamp | Provider response is not device receipt |
| T3 | Native device handling, only if supported and measured | Otherwise `DEVICE_RECEIPT_UNOBSERVABLE` — never infer from foreground JS launch |
| T4 | Android OS notification posted, from safe authorized device trace | Otherwise `UNKNOWN` |
| T5 | Human sees OS notification, wall clock/recording | Approximate human observation |
| T6 | User taps OS notification | User action timestamp |
| T7 | Authenticated, exact Shift/Location Task queue successful current read | Must revalidate authorization and Task state |

For separate clock domains record calibration and an uncertainty band. Do not subtract unrelated clocks without calibration. Classify the **first supported divergence** (queue/worker, server→FCM, provider→device, OS post→display, or unknown); do not use foreground JS callbacks as a universal Android-background receipt clock. Never replay a Guest request or an authorized Task mutation in response to a notification.

## Controlled test matrix

Run at least **10 screen-off locked trials per principal supported framework-allowlist state** where the device can reproduce both. Capture observations as results, not an invented SLA. Repeat the important trials on a reference Android device and a representative OEM device; include a Samsung/midrange OEM if available. Probe Android versions 10/11/13/15/16 as device access permits; explicitly mark untested combinations.

1. Foreground Employee: one existing in-app canonical Task attention, no duplicate OS foreground banner.
2. Background unlocked, screen-off locked, natural process death; distinguish each from explicit force-stop (force-stop delivery is not a supported equivalent test).
3. Notification permission granted/denied/re-enabled, channel enabled/disabled; preserve DEFAULT importance and original channel ID.
4. Framework allowlisted versus not allowlisted, recording **OEM visible** Unrestricted/Optimized/Restricted separately. Confirm whether the OEM UI changes the framework API result; if not, map the uncertain condition to `unknown` as required for honest OEM claims.
5. Guest request during Doze/App Standby with supported QA ADB only; after idle exit, ensure queued canonical Task remains usable.
6. Wi-Fi/mobile; temporary offline and reconnection; token rotation/registration when approved with isolated QA account.
7. Login A → logout → login B with one physical device; ensure no cross-account registration takeover or old alert treated as authorization.
8. Delayed tap after Task completed/cancelled: re-query current exact-authorized Tasks and offer no obsolete mutation or second Guest Request Vehicle.
9. Change settings while Employee backgrounded, resume, confirm old warning hides immediately during `checking`; if verified fixed, warning is absent without manual dismissal or relogin.
10. Restricted notice: EN/AR × Light/Dark, narrow display, enlarged system font, TalkBack/accessibility role, 48dp equivalent tap area, unobstructed header/navigation. Configured/checking/unknown/unsupported render no notice/no gap.
11. If primary Android Battery Optimization list intent unavailable, confirm explicit action falls back to VAYLET's Android app-details screen; if both fail, no crash or false success.

## Optional ADB commands (authorized QA handset ONLY)

Confirm selected device serial first; when more than one device is connected supply `adb -s <DEVICE_SERIAL>` to every command. Inspect logs locally and publish **only redacted stage classifications**, not raw system logs, package inventories, private push payloads, plate/guest/staff details, tokens, identifiers, or credentials.

```bash
adb devices
adb shell dumpsys deviceidle
adb shell dumpsys notification
# Only for explicit isolated test; restores are mandatory:
adb shell dumpsys deviceidle force-idle
adb shell dumpsys deviceidle unforce
adb shell dumpsys battery reset
```

ADB-forced idle is *not* proof of identical OEM idle/power management. Avoid collecting broad system logs or applying these commands on real operational shifts.

## Per-trial record (redacted)

```text
Issue #274 / synthetic QA trial label:
Source SHA / APK SHA-256 / API SHA / environment class:
Android OS version / OEM model / locale + theme:
Notification app permission / retrieval channel status & importance:
Framework power allowlist / OEM-visible Battery mode (SEPARATE):
Network / foreground-background-locked / process state:
Synthetic current Staff registration and active exact Location Shift confirmed: YES/NO
T0 Guest press (clock+source):
T1 Task+Push intent DB commit (clock+source):
T2 FCM ACCEPTED (clock+source):
T3 device receipt: TIMESTAMP + provenance | DEVICE_RECEIPT_UNOBSERVABLE
T4 OS notification post: TIMESTAMP + provenance | UNKNOWN
T5 human observation (clock+source):
T6 tap / T7 current canonical Task response (clock+source):
Clock offsets and uncertainty:
End-to-end latency if valid clock calibration:
Foreground canonical attention and OS notification observed:
Settings changed? / Warning cleared on resume? / screenshot evidence:
No duplicate Guest request / no unauthorized mutation:
Result: PASS | FAIL | UNKNOWN
Evidence gaps / redaction confirmed:
```

**Stop gates:** Physical test execution, OEM semantics, locked-screen receipt, U-004 visual sign-off, and U-005 capability validation remain external Owner tasks. Never treat synthetic render fixtures as physical screenshots, nor FCM provider acceptance as displayed delivery. Issue #274 remains OPEN.
