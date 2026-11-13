# Issue #310 — Prototype validation evidence

Work date: 2026-11-13–14 (Asia/Amman). **Design approval: PENDING OWNER.**

## Identity and delivery

- Repository: `yamanradwan1-rgb/valet-platform`.
- Required branch: `feat/issue-310-sandbox-last-mile-authorization`.
- Worktree: `D:\kndoom\valet-platform\tmp\issue-310-last-mile-worktree`.
- Original source/remote: `de338f4da187297aacd0fc7005ece9b6f041fe61`.
- Plan-only commit: `eeaa522717efd37e3041b7b1e208bddc6394d65f`, normally pushed and independently confirmed with `git ls-remote` before prototype work.
- Prototype immutable source commit: recorded in the final evidence update after the validated source is committed. No claimed test is based on an invented future SHA.
- No PR, merge, production endpoint/schema/credential change, deployment, Meta call or messaging activation is part of this delivery.

## Exact scope

`NativeCheckInParkingTaskStep` receives one optional `whatsAppPrototype` presentation slot immediately after the existing Guest Access card. It renders only with a current fixture session, existing Guest entry callback and `__DEV__`. All ordinary callers omit it. A release-mode negative test explicitly supplies it and verifies the original rendering.

The development route `/whatsapp-prototype` reuses actual Native `EmployeeFrame`, `EmployeeAppHeader`, account utility, `CheckInHeader`, original ScrollView body styles, `NativeCheckInParkingTaskStep` and pinned `NativeProductionNavigation`. The fixture displays only synthetic IDs, Demo Hotel, a sample vehicle and `DEMO 310`; no phone or Guest credential exists. Existing operational callbacks are inert in this fixture. The unchanged production callbacks are tested separately against the original component.

Only the new control has new colors/logo/copy/state. Its colors are in a local fixture palette, not shared design tokens. Two existing appearance tests receive exact additions for that palette path and the new style-sheet identity; every old baseline style remains compared. The original `issue-253-light-styles.json` and all historical visual snapshots are unchanged.

## Baseline evidence

Before modifying the actual Parking Task component, the original component was rendered through the repository's existing Native host/style tree harness for EN/AR and Light/Dark. Its sanitized immutable baseline is:

`apps/valet-native/test/fixtures/issue-310-parking-task-baseline.json`

The one-time baseline capture used `ISSUE310_CAPTURE_BASELINE=1` while the target source was still identical to plan commit `eeaa5227`. The capture writer was then removed from the committed test; the fixture cannot silently regenerate from candidate source. This JSON is structural/style evidence, **not a screenshot or physical Native proof**.

The new regression compares all four unchanged original trees to that baseline, verifies the added control follows Guest Access, removes only that added node to compare the remaining tree, verifies release/no-session/no-Guest-entry suppression and exercises the original Guest/Open Parking handlers. It does not claim pixel equivalence from a tree comparison.

## Commands and failure history

Commands run from the worktree root unless a Native working directory is noted. Final results are completed before delivery; early failures are retained here as chronology rather than hidden.

| Command / check | Observed result |
|---|---|
| VAYLET implementation guardian `preflight.sh` | PASS on required clean feature branch after plan push |
| Plan `prettier --check`, local-link/A–U inventory, committed `git diff --check` | PASS; plan audit heuristic warnings dispositioned in the master plan |
| Initial baseline capture Vitest | PASS, 1 test, original target unchanged |
| New insertion test before implementation | Expected RED: marker absent beneath Guest Access |
| New button tests before implementation | Expected RED: new component module absent |
| New route parameter test before implementation | Expected RED: finite state/baseline props absent |
| Focused three Issue #310 Vitest files after initial implementation | PASS, 12 tests; later guards add two more cases |
| `pnpm --filter @valet/valet-native typecheck` | PASS after initial implementation |
| First Native ESLint | FAIL: cleanup-ref warning in new fixture only; corrected by capturing the prior theme inside the effect |
| Native ESLint after that correction | PASS |
| First full Native suite | FAIL: two expected existing appearance-inventory boundaries rejected the newly authorized control; one render-matrix 5s timeout under emulator load; 1703 tests passed |
| Focused appearance rerun after exact scope reconciliation | Coverage/button assertions passed; style/render tests exceeded their 5s deadlines under emulator resource pressure |
| Quiescent full Native rerun | PASS, 242 files / 1706 tests in 228.56s; final-source rerun recorded below |
| `pnpm architecture:check` | PASS with preexisting grandfathered-file warnings; no architecture baseline edited |
| `pnpm --filter @valet/contracts build` | PASS; generated dist only, required for Native Metro package resolution |
| `expo prebuild --platform android --no-install` | PASS; ignored generated Android project; package/lock/config source unchanged |

## Native runtime investigation

A new task-owned, headless Android emulator `vaylet310-ui` was created from the installed x86_64 API 37.1/16KiB image. The first software-graphics boot produced severe memory pressure and a launcher ANR. It was restarted with host graphics; no preexisting user device or AVD was used. The emulator was stopped during the full test rerun to avoid competing for memory.

The installed reusable debug development binary came from the existing Issue #336 worktree; its Native package dependency manifest matches this branch. SHA-256:

`B4470D34EB6230C458B36695569E66ABDD36DD6FE881BAC38B60DE5A402DA974`

This is a reused Native development runtime, **not a freshly compiled candidate APK**. Actual JS must be served from this worktree for any valid capture. It has minSdk 29 / targetSdk 36 and the same bundled Native fonts. It was installed only on the new isolated emulator.

Initial Metro watch mode failed to start. The installed Expo CLI explicitly supports `CI=1` to disable watch mode. On this Windows host `--localhost` bound Metro to IPv6 `::1`; the emulator used IPv4. A temporary loopback-only TCP bridge and `adb reverse` resolved that boundary without exposing a LAN/public service. After that, the runtime reached Metro but reported missing `@valet/contracts/dist`, so the repository's normal prerequisite build was executed. No provider, API account, consent record, Guest credential or real customer data was involved in these diagnostics.

Failed launcher/error screenshots remain only in ignored local runtime scratch space. The committed capture set contains successful real Native renders only. Expo's development menu floating control was disabled on the new task emulator so it would not cover the original header. System animation scales were zero and font scale was 1.0 for both baseline and prototype. Existing product animation/style source was untouched. Runtime warnings concerned existing blur/Android target/reduced-motion behavior; they were not repaired in this UI-frozen task.

## Review instructions

Use an existing compatible Expo development build, not the production APK or Expo Go. From this branch:

```powershell
pnpm --filter @valet/contracts build
pnpm --filter @valet/valet-native start
```

Open `/whatsapp-prototype?locale=en&theme=light&state=default` using the development client's supported linking flow. Add `baseline=1` for the original UI. Use `locale=ar`, `theme=dark` and `state=pressed|loading|queued|accepted|failed|unknown|delivered|disabled` to inspect deterministic variants. Unsupported parameters normalize safely; recipient/session/token parameters are ignored.

Default tap displays a local 900ms loading animation then queued. Subsequent taps cycle only local demonstration variants. A directly selected loading/disabled variant remains non-actionable. All states visibly say Demo/تجريبي; delivered is explicitly prospective webhook feedback. No tap sends anything. Theme selection uses the existing appearance owner and restores the prior preference on exit; it does not change shared appearance code.

On this host, the fallback Metro command is `CI=1` plus `--max-workers 2`; changes require a fresh server start in that mode. The temporary IPv4/IPv6 bridge is local QA plumbing, not part of production or the feature architecture. A normal device/development setup should use the repository's standard launch flow.

## Final validation and visual evidence

The [capture inventory](qa-artifacts/README.md) links all genuine PNGs and corresponding metadata. Each PNG has its SHA-256, actual dimensions/density and inspected control accessibility/bounds in its adjacent JSON. The standard preset is 780×1688 physical pixels at density 320 (390×844 logical); small is 640×1136 at density 320 (320×568 logical). These are resized Android emulator viewports, not measurements of physical handsets.

Eight baseline captures used the **original** Parking Task source blob `e04f82eb5882573430c9df0bfe5190fb74fb6bd9`: the seven-line candidate addition was temporarily removed using the known plan-commit version, then restored before candidate captures. Eight candidate captures used blob `b7c0e8ad3863cc04e14edaa7940086150c62331e`. Both sets ran the same fixture/shell/fonts/data/runtime, EN/AR, Light/Dark and both presets. The committed source is the restored candidate. The `baseline=1` fixture option also omits the candidate control, but that shortcut was **not** substituted for original-source baseline captures.

[Pixel comparison](qa-artifacts/pixel-comparison.json): **0 changed original-product pixels in each of eight pairs**. The RGB comparison excludes Android system rows 0–95 and the final 48 physical rows, plus only the new control's inspected bounds with a two-pixel edge. No other product region is excluded. On the small unscrolled captures the new control is below the fold, so its mask is empty. This establishes a bounded match for these captured fixtures, not every device, font-scale, runtime state or Owner reference image.

Two additional small scrolled captures show the new control after Guest Access and above the original pinned navigation (EN/Light and AR/Dark). A real emulator tap on the default EN/Light control produced the local queued label after its 900ms timer. Eight EN/Light deterministic captures cover pressed, loading, queued, accepted, failed, UNKNOWN, prospective webhook-delivered and disabled. Unit checks cover every state in both languages and both palettes' target/contrast. Native TalkBack speech, large accessibility font settings, physical Android/iOS and the unavailable Owner screenshot are **not verified**.

Final source validation is recorded before push. No incomplete gate is a PASS. Full repository backend/PostgreSQL tests, fresh release APK build, physical-device tests and remote CI are SKIP for this bounded prototype; no production readiness claim follows. The branch's `ci.yml` runs its quality workflow only for main pushes/main-target PRs, and this task explicitly prohibits creating a PR. No quality-CI run is claimed from local commands.

| Final command/check | Result |
|---|---|
| `pnpm exec vitest run test --maxWorkers=2 --no-file-parallelism` (Native directory) | PASS, **242 files / 1706 tests**, 324.82s, final source |
| `pnpm --filter @valet/valet-native typecheck` | PASS |
| `pnpm --filter @valet/valet-native lint` | PASS, zero warnings |
| `pnpm architecture:check` | PASS; existing grandfathered warnings only |
| Scoped `pnpm exec prettier --check` for all new/modified Native code, tests and new tree fixture | PASS |
| `git diff --check` | PASS |
| SHA-256 validation of all 27 PNGs against adjacent JSON | PASS |
| Eight original/candidate RGB comparisons | PASS, each 0 changed original-product pixels with recorded exclusions |
| Source scope and physical line-count inspection | PASS; exact three existing files touched, new code/test maximum 193 lines |
| Local Markdown link resolution | PASS, 141 links |

Raw local command logs remain in ignored task scratch (`tmp/issue310-prototype-runtime/`); they contain actual local tool output, not a remote CI record. Source remained fixed during the final runs; subsequent delivery-identity/review updates change documentation only.

Self-review: the real source diff adds seven lines to the actual Parking Task component and removes none. Shared UI/theme/locale/navigation/workflow/Guest Access source, dependency files, backend/contracts/schema/migrations and production activation controls have no task diff. The two existing test edits allow exactly the new palette path and stylesheet identity while retaining every original baseline comparison. New authored code/test files remain below 300 physical lines. No existing baseline snapshot was rewritten; the new issue-specific baseline was captured from original source. No protected business mutation was introduced, so authorization-before-mutation, persistence/idempotency/audit writer and database gates are unchanged rather than newly qualified.

## Production isolation and deferred gates

Static imports and release-mode/component tests prove the new prototype has no provider/API/credential/business-runtime dependency or reachable production action. This is bounded source/test evidence, not a claim of a new production security audit. No production flags were enabled, no dependency/lockfile/schema/migration changed, and no messaging/custody/Task state was mutated.

Owner design approval and the master plan's central sender, trigger/repeat-send, consent/contact, credential-envelope, authority, contract/status and operational decisions remain pending. Real feature implementation, live Meta/webhook/Guest entry, production release and full remote CI are separate future gates. Independent read-only VAYLET review follows the prototype push; no merge approval is implied.
