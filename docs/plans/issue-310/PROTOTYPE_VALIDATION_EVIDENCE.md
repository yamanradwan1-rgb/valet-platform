# Issue #310 — Prototype validation evidence

Work date: 2026-11-13–14 (Asia/Amman). **Design approval: PENDING OWNER.**

**Current update — Owner reconciliation, 2026-11-14:** see the appended current-task section below. The original commands, labels, screenshots and review records retained in this document are **historical delivery evidence for `0a1d40c0` and earlier**, not current-copy verification. Visible Demo/تجريبي requirements in the historical narrative are superseded by the Owner's November 14 refinement. Historical PNG/JSON files are not overwritten.

## Historical identity and delivery — prior prototype

- Repository: `yamanradwan1-rgb/valet-platform`.
- Required branch: `feat/issue-310-sandbox-last-mile-authorization`.
- Worktree: `D:\kndoom\valet-platform\tmp\issue-310-last-mile-worktree`.
- Original source/remote: `de338f4da187297aacd0fc7005ece9b6f041fe61`.
- Plan-only commit: `eeaa522717efd37e3041b7b1e208bddc6394d65f`, normally pushed and independently confirmed with `git ls-remote` before prototype work.
- Initial prototype source/capture commit: `2dfbe21e8232b428e566d923e66461278926761d`, with a 242-file/1706-test PASS.
- Final prototype source after independent review: `322df3df545dbd8065a3ca2f96adabd9fbabe1be`. The review fix preserves the original appearance across query changes and adds lifecycle regression coverage. The final rerun is recorded below; later delivery updates change documentation only.
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
| `pnpm exec vitest run test --maxWorkers=2 --no-file-parallelism` (Native directory), initial pushed source | PASS, **242 files / 1706 tests**, 324.82s |
| `pnpm --filter @valet/valet-native typecheck` | PASS |
| `pnpm --filter @valet/valet-native lint` | PASS, zero warnings |
| `pnpm architecture:check` | PASS; existing grandfathered warnings only |
| Scoped `pnpm exec prettier --check` for all new/modified Native code, tests and new tree fixture | PASS |
| `git diff --check` | PASS |
| SHA-256 validation of all 27 PNGs against adjacent JSON | PASS |
| Eight original/candidate RGB comparisons | PASS, each 0 changed original-product pixels with recorded exclusions |
| Source scope and physical line-count inspection | PASS; exact three existing files touched, new code/test maximum 193 lines |
| Local Markdown link resolution / manifest completeness | PASS, 142 links and all 75 changed files exactly inventoried |

Raw local command logs remain in ignored task scratch (`tmp/issue310-prototype-runtime/`); they contain actual local tool output, not a remote CI record. Source remained fixed during the final runs; subsequent delivery-identity/review updates change documentation only.

## Independent review and correction

The required independent read-only VAYLET Code Review ran **after** remote confirmation of `efa06dd208dc487fbb7a9a2ce6f6cdd0c7a7a352`, comparing original `de338f4d` to that pushed head. It found no BLOCKER/MAJOR scope, business-security, privacy, database or architecture defect. The reviewer independently reran the original 14 focused tests, all 27 image hashes and all eight pixel comparisons, and inspected the 242-file/1706-test log.

One MINOR defect was identified: the query-derived React key remounted the fixture on variant changes, allowing its original-theme ref to capture the previous preview theme instead of the pre-preview preference. This contradicted the promised restoration behavior. Final source `322df3d` removes that key, retains one preview-session identity, waits until the existing appearance owner is restored, and resets/cancels only local demonstration work when finite preview choices change. No shared appearance implementation, UI styles or business behavior changed.

Regression tests were observed RED before this fix (route remount, readiness and stale demo work), then **16/16 focused tests PASS**. The new lifecycle regression exercises the actual fixture component hooks through the repository-style mock harness and the real `NativeAppearanceOwner`, including persisted preference after variant/theme changes and exit; it is not a physical device lifecycle measurement. The original 27 captures predate this lifecycle-only correction. Their target component blob, styling and presentation remain unchanged; they must not be represented as a fresh post-fix device capture.

The first fix used synchronous state reset inside an effect; ESLint correctly rejected it, along with one unused test parameter. It was replaced with a guarded render-phase adjustment when the finite preview choice changes, keeping timer cancellation in the effect. No lint rule was disabled. The then-running full rerun was stopped after that lint failure rather than claimed as a pass. The corrected source passed scoped lint and all 16 focused tests before its final full rerun.

The next default-timeout rerun encountered the existing render-matrix test's 5s limit (5092ms) under shared-host load and was stopped. Final validation uses a **15s command-line test timeout**, retaining all assertions, all files and existing checked-in test timeouts/configuration. This changes only the local test invocation, not repository or product behavior. Corrected-source full Native lint, typecheck and architecture checks passed; no rules or architecture baselines were weakened.

The independent follow-up inspected `efa06dd2..322df3d`, confirmed the MINOR resolved with no additional actionable findings, and independently reran **4 files / 16 tests PASS**. The final remote confirmation remains a separate delivery check.

**Final corrected-source full run:** `pnpm exec vitest run test --maxWorkers=2 --no-file-parallelism --testTimeout=15000` from the Native directory: **PASS, 243 files / 1708 tests, 218.09s**, exit 0, source `322df3df545dbd8065a3ca2f96adabd9fbabe1be`. Raw output: ignored `tmp/issue310-prototype-runtime/delivery-final-native-vitest.log`. Final full Native lint/typecheck, architecture, scoped formatting and `git diff --check` also passed. Only this documentation/file-inventory update follows that tested source. Normal fast-forward push and independent remote confirmation are recorded in the final delivery report; no source rework, force-push, PR, merge, deployment or messaging activation follows.

The independent initial skill verdict was `BLOCK MERGE`: fix the minor fixture issue and retain the broader unfulfilled Owner/CI/production gates. That is distinct from completion of this authorized prototype delivery. No merge is requested or authorized. Post-fix pushed review disposition is recorded after the follow-up review.

Self-review: the real source diff adds seven lines to the actual Parking Task component and removes none. Shared UI/theme/locale/navigation/workflow/Guest Access source, dependency files, backend/contracts/schema/migrations and production activation controls have no task diff. The two existing test edits allow exactly the new palette path and stylesheet identity while retaining every original baseline comparison. New authored code/test files remain below 300 physical lines. No existing baseline snapshot was rewritten; the new issue-specific baseline was captured from original source. No protected business mutation was introduced, so authorization-before-mutation, persistence/idempotency/audit writer and database gates are unchanged rather than newly qualified.

## Production isolation and deferred gates

Static imports and release-mode/component tests prove the new prototype has no provider/API/credential/business-runtime dependency or reachable production action. This is bounded source/test evidence, not a claim of a new production security audit. No production flags were enabled, no dependency/lockfile/schema/migration changed, and no messaging/custody/Task state was mutated.

Owner design approval and the master plan's central sender, trigger/repeat-send, consent/contact, credential-envelope, authority, contract/status and operational decisions remain pending. Real feature implementation, live Meta/webhook/Guest entry, production release and full remote CI are separate future gates. Independent read-only VAYLET review follows the prototype push; no merge approval is implied.

## Current task — Owner decisions reconciliation and copy refinement, 2026-11-14

Initial clean local/remote HEAD: `0a1d40c0518c34ad15e089b3f0dc9afac64a95ef`, verified with `git ls-remote` before edits in the same owned feature worktree. The preceding sections are historical delivery evidence. Current authoritative intent is [the reconciliation](OWNER_DECISIONS_RECONCILIATION_2026-11-14.md), master-plan §T and the new dated Issue section.

### Current scope and source

The only implementation source changed is `native-whatsapp-prototype-state.ts`: exact Owner EN/AR labels replace visible Demo prefixes, Requesting becomes Sending… / جاري الإرسال…, and the non-visible simulated-Delivered hint explicitly disclaims provider evidence. The existing button/screen/route/guarded Parking Task slot, all geometry/colors/fonts/logo/handlers, theme restoration and immediate loading/timer logic are unchanged. No extra panels, status card or consent UI. Internal Demo type names and original synthetic Demo Hotel/DEMO-310 fixture remain; the Owner requested removing visible prefixes from the button, not restyling the frozen header.

The button and lifecycle tests now check all exact labels, absent visible prefixes/leading separators, busy/disabled/spinner, local same-control Sending→Queued, double-call single timer, cancelled stale work, unmount cleanup and original theme restoration. Original release/route/Guest/Open Parking/tree/style guards remain in force; no existing security/architecture assertion or baseline is weakened. No backend/packages/schema/Prisma/migration/worker/provider/config/credential/dependency/production wiring changes.

The complete master plan remains A–U, **16 phases / 48 bounded tasks**, now with R01–R27 and D01–D12 reconciliation. D01–D09 product directions are selected; technical contracts/external suitability remain pending. D10–D12 are unapproved. The current Owner instruction explicitly authorizes a dated append to Issue #310 while forbidding closure/PR/merge/deployment/activation.

### Current executed checks

| Command / check | Observed result |
|---|---|
| Git status/branch/worktree ownership, local HEAD and `git ls-remote` | PASS, clean owned existing branch at 0a1d40c0 before editing |
| `D:/Git/bin/bash.exe D:/kndoom/valet-platform/.agents/skills/vaylet-implementation-guardian/scripts/preflight.sh` | PASS, read-only checks |
| New copy/lifecycle tests before source change | Expected RED: 5 failures identified old visible prefixes/copy and missing simulated-delivery hint |
| `pnpm exec vitest run test/issue-310-whatsapp-button.test.tsx test/issue-310-whatsapp-lifecycle.test.tsx test/issue-310-whatsapp-parity.test.tsx test/issue-310-whatsapp-route.test.tsx --maxWorkers=2 --no-file-parallelism --testTimeout=15000` in Native directory | PASS, **4 files / 18 tests**; independently repeated PASS by reviewer |
| `pnpm --filter @valet/valet-native typecheck` | PASS |
| `pnpm --filter @valet/valet-native lint` | PASS, zero warnings |
| `pnpm architecture:check` | PASS, existing grandfathered warnings only |
| Scoped `pnpm exec prettier --write` then `--check` for changed source/tests and plan/spec/reconciliation | PASS where executed; final inventory check recorded at delivery |
| Planning guardian `audit_plan.py` on current plan | Executed; seven heuristic warnings manually dispositioned in master-plan review, not a clean semantic audit PASS |
| Independent pre-push VAYLET review | No BLOCKER/MAJOR; two MINOR selected-vs-pending/consent-process wording issues corrected |

Current raw local logs remain in ignored `tmp/issue310-prototype-runtime/`; they are not remote CI. Full Native rerun, line/source/manifest/link checks and final delivery identities are recorded below when observed. Root backend/PG17/security/deploy/release-build/remote quality CI/live Meta/webhook/physical-device tests are SKIP: they are future integration/release gates, not scope performed here.

### Current visual result — PARTIAL

[Attempt inventory and exact pending matrix](qa-artifacts/owner-2026-11-14/README.md). **No new PNG was accepted and no new pixel comparison ran.** Task-owned Android API37.1 emulator/compatible prior dev APK and current-source Metro were attempted; 1536MiB run reached an app ANR, 1024MiB retry did not reach a usable booted fixture. Host free physical memory was approximately 0.25–0.43GiB of 16GiB. This does not establish a code or production-device defect. The first capture helper refused an invalid hierarchy rather than labeling a launcher/ANR as product evidence.

New default and Sending screenshots, remaining states, EN/AR × Light/Dark, standard/small, native typography/fit/scroll and matched pixel checks are all pending. Prior 27 PNGs/eight comparisons remain unchanged historical evidence, not proof of new text. Static source and rendered-tree/style tests confirm unchanged original code/styles/handlers; those checks do not establish fresh Native pixels, physical accessibility or Owner design approval. [source-files.json](qa-artifacts/owner-2026-11-14/source-files.json) hashes the exact current Native app/src source with LF normalization; it is source identity only.

The prior reusable development APK SHA remains `B4470D34EB6230C458B36695569E66ABDD36DD6FE881BAC38B60DE5A402DA974`; no fresh candidate release APK was built. Both task emulator attempts, task Metro and loopback bridge were stopped before the complete test run. No unrelated user process/device was modified. No credentials, real business data, Meta call or WhatsApp message participated.

### Current Issue and final delivery

The exact dated append is [ISSUE_310_OWNER_DECISION_UPDATE_2026-11-14.md](ISSUE_310_OWNER_DECISION_UPDATE_2026-11-14.md). Update the fresh live body by preserving its full original prefix, append this section once, keep OPEN/title/branch/history and read it back. A successful update/read-back must be recorded; a prepared patch alone is not an UPDATED claim. No future implementation approval follows this documentation task.

**Observed update/read-back:** Issue #310 successfully updated and fetched back at `2026-11-14T03:25:38Z`. Its exact original 18,562-character body prefix is preserved; the dated section occurs once, the body exactly matches the expected append, and OPEN/title/unmerged branch association are unchanged. [Read-back metadata](ISSUE_UPDATE_READBACK_2026-11-14.json) records the normalized section SHA-256. Only the dated append was written; no labels/assignees/milestone/title/state change or Issue closure.

| Final current-source check | Observed result |
|---|---|
| `pnpm exec vitest run test --maxWorkers=1 --no-file-parallelism --testTimeout=15000` in Native directory | **PASS, 243 files / 1,710 tests**, 328.59s, exit 0; log `tmp/issue310-prototype-runtime/owner-final-native-vitest.log` |
| Full Native typecheck/lint and architecture | PASS; lint zero warnings, architecture preexisting grandfathered warnings only |
| Exact current source/test line counts | PASS: state 93, button test 157, lifecycle test 190, all <=300 |
| A–U / roadmap / traceability / register accounting | PASS: 21 lettered sections, 16 phases, 48 task IDs, 27 requirements, 12 decision rows |
| Source hash inventory | PASS: all 326 recorded Native app/src files match current source (LF-normalized SHA-256) |
| Exact changed-path guard | PASS: only the one allowed prototype implementation module + two tests under apps; no backend/packages/deploy/production UI/accepted DEC changes |
| Scoped formatting + `git diff --check` | PASS |
| Local Markdown links + file manifest | PASS: 94 links; all 13 task-changed files exactly inventoried |
| Live Issue append/read-back | PASS, original body preserved and OPEN; exact dated section matches tracked Markdown |
| New Native screenshot/pixel/physical/TalkBack/large-font checks | NOT VERIFIED; explicit current visual matrix PARTIAL, not historical PASS |

All executed current checks used the unchanged candidate source represented by the inventory; subsequent identity/review updates are documentation only. Final source/plan/evidence commit identities and normal remote parity are recorded below after commits exist. No root backend test/build, PostgreSQL migration, security scan, release APK, production/runtime activation or real Meta test is implied by these local results.

### Immutable current delivery identities and review

- Initial task HEAD: `0a1d40c0518c34ad15e089b3f0dc9afac64a95ef`.
- Owner reconciliation / complete plan commit: `674cf048fad1bee02b5fbb5c47aa64dc7e1aabb0`.
- Refined prototype / exact tested Native source commit: `f5ff6458a8233633e0a3a9b4bd0546c5ff795245`. Its app/src contents match all 326 source inventory entries, and it contains the exact source/tests used in the 1,710-test run. No source change follows.
- Supporting evidence/Issue/manifest commit is the subsequent documentation-only delivery commit; its final remote SHA is reported after normal push, avoiding an impossible self-referential commit hash in this file.

The independent final pre-commit VAYLET review found **no remaining actionable findings** after the two MINOR wording corrections. It independently verified A–U/16/48, current exact labels, all 13 changed paths, all 326 source hashes, unchanged historical images/comparisons and zero new PNGs, current Issue OPEN/title/branch/exact dated append and digest, and inspected the full 243-file/1,710-test log. It previously independently ran all 18 focused tests. Reviewer merge verdict remains **BLOCK MERGE** because D10/D11/D12 and technical/integration/security/CI/production authorization are pending/outside this task. This is not an unresolved defect in the bounded code/documentation delivery, and the disclosed visual matrix remains **PARTIAL**.

Normal fast-forward push, final remote ancestry/clean worktree and independent post-push confirmation are final delivery checks, recorded in the final report once observed. No force-push, reset, main integration, PR, merge/rebase, deployment, production API/DB/worker/provider action, actual WhatsApp send, production flag/credential change or Issue closure is performed.
