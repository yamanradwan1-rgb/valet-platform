# Employee Web, Native and portable client audit

Baseline: `66968655b8bd90c6681daf53fb9d8da9b9ab9f79` in isolated worktree `<AUDIT_WORKTREE>`. Read-only source review; no source, configuration or tests edited. Audit artifacts are outside the worktree. No install, deploy, provider calls, real database changes or GitHub writes performed by this worker.

## Result and coverage

One high-confidence P2 functional finding, NATIVE-WEB-01, is supported by actual source tracing and a focused actual-source probe. It is not presented as a security vulnerability or a physically reproduced native defect. No P0/P1 finding was established by this worker. This is partial review, not exhaustive line-level assurance.

Owned inventory is 1,206 tracked files, approximately 151,393 text lines using a mechanical line counter (some binary/file formats excluded from its line sum). Initial ledger: 61 files fully source reviewed (8,262 lines), 23 partially reviewed and four tool-assisted tests; the final ledger adds two fully reviewed scope-related files. Every other file is explicitly `not_reviewed`. Full source read does not mean runtime, browser, device or provider verification. The 23 partially reviewed notification files were read in a batch whose output was truncated; they are intentionally not claimed fully reviewed.

Final per-file truth is `coverage.json`; `coverage-summary.json` contains generated package/status counts. There are substantial unreviewed files in all three packages, including most UI screens, native modules/bridges, native tests and the portable operational command families. No 100% claim is supportable.

## Architecture and feature map

| Feature group | Source path / flow | Status established by this review | Coverage and concern |
|---|---|---|---|
| Native bootstrap/navigation | Expo Router `app/_layout.tsx`, `app/index.tsx` → `NativeProductionShell` → bootstrap/runtime → controller | Implemented; authenticated operational gate | Source read of bootstrap/controller callers; controller itself not fully reviewed; no device boot verified |
| Native staff authentication | `NativeAuthPanel` → `NativeAuthSession` → native auth HTTP → `/v1/staff/auth/native/{login,refresh,logout}` → installation state / SecureStore | Implemented login, refresh, logout and local account barriers | Core portable auth/storage/generation files source read; focused logout/account-switch tests passed; physical secure storage and OS behavior unknown |
| Native operational context/task queue | shell/lifecycle → `EmployeeOperationalSession` → native employee transport → `/v1/staff/operational-context`, `/v1/staff/tasks/queue` | Implemented foreground/reconnect authority revalidation | Main shell/lifecycle/transport read; underlying command/queue state machines not fully reviewed |
| Native shifts | shell/runtime → portable shift sessions → staff shift endpoints | Implemented start/end/presence wiring visible | Runtime composition read; shift controllers/storage/UI mostly not reviewed |
| Native check-in | workflow → portable check-in session → check-in API → DB | Implemented workflow steps, condition/parking continuation and recovery surfaces visible | Workflow/callers read; intake/OCR/continuation state machines and many tests unreviewed |
| Condition photographs | camera → private file owner → portable photo session → multipart transport → authenticated condition upload/status/discovery API → object storage/DB | Implemented scoped ownership, capture cleanup, status-driven retries, eligibility discovery | Detailed source review of owner/camera/files/transport/session/status; Node tests prove portable state behavior, not device bytes/provider success |
| Plate camera/OCR | check-in capture UI → native ROI/crop/OCR files and native bridge → recognized/confirmed/manual identity | Source presence established | Not fully reviewed or exercised; capture rotation/ROI/manufacturer/device conditions unknown |
| Native parking/retrieval/handoff/release | shell/runtime session composition → portable command sessions → domain endpoints | Implemented composition and continuation hooks visible | Runtime and workflow navigation read; individual sessions/screens mostly unreviewed; do not infer legal-state correctness |
| Native incident recovery | runtime → incident session/recovery state → storage/context + API | Implemented wiring visible | Core incident recovery implementation not reviewed; no process-death runtime claim |
| Native guest access | contextual route → `NativeGuestAccessSession` → staff detail/issue/revoke → one-time credential memory/clipboard/QR | Implemented online gating, scoped status checks and background credential clearing | Guest session and screen fully read; credential-memory helpers/QR/server producer not fully reviewed |
| Android push | shell hooks → lifecycle/reconcile scheduler → Expo adapter → FCM device token → staff push registration API → server/outbox/FCM | Implemented Android-specific registration and attention integration | Lifecycle/scheduler/transport fully read; larger notification batch partial; no real registration/send/receipt/account-switch proof |
| GPS task tracking | lifecycle authority → tracking runtime → publisher → Expo Location watch → bounded portable buffer → GPS ingestion endpoint | Implemented foreground task binding, permission gates, pause/retire, bounded memory retries | Core runtime/publisher/adapter/buffer source read; buffer tests passed; backend policy and actual location/device behavior not independently verified |
| Connectivity | Expo adapter → portable connectivity owner → lifecycle revalidation → context/queue/workflow refresh | Implemented recovery wiring | Lifecycle reviewed; adapter and full coordinator not reviewed |
| Native localization/appearance/a11y | locale/appearance owners + dictionaries/themed UI | Source presence established | Dictionary completeness, touch targets, zoom, RTL, VoiceOver/TalkBack and responsive device behavior unverified |
| Employee Web auth/bootstrap | Next page → StaffAuthProvider → auth client → authoritative operational context → EmployeeApp | Implemented live gate; prototype explicit opt-in | Provider/page/app source reviewed; auth client/server not fully reviewed |
| Employee Web operational workspace | EmployeeApp owns targets → active shell → live router → check-in/parking/retrieval/incident/guest/shift/scan/vehicles screens | Implemented live routing | **NATIVE-WEB-01:** same-login operational scope changes retain targets |
| Employee Web concrete workflows | feature controllers/hooks → employee API client → staff APIs | Numerous source modules/tests present | Most concrete web feature controllers and screens not reviewed; no rendered browser E2E verification |

This map distinguishes source-visible implementation from completed end-to-end product functionality. Backend enforcement and provider behavior remain authoritative and were not established just by client wiring.

## Finding register

| ID | Priority | Category | Feature | Finding | Confidence | Evidence | Existing issue |
|---|---|---|---|---|---|---|---|
| NATIVE-WEB-01 | P2 | Functional/context consistency | Employee Web workspace | Operational membership/location/shift changes retain previous scope's workflow targets under the new active header/context | HIGH | `employee-app.tsx:104–113,251–285`; `employee-workspace.ts:57–68,93–107`; `employee-live-router.tsx:159–169` | No matching open issue identified by this worker; parent owns full deduplication |

### NATIVE-WEB-01 — Operational scope changes do not retire Employee Web workflow targets

1. **Unique ID:** NATIVE-WEB-01.
2. **Title:** Previous operational scope's workflow survives a same-login scope change.
3. **Severity:** P2 (valid recovery workaround; no confirmed unauthorized mutation or disclosure).
4. **Confidence:** HIGH. Source behavior and pure source probe are confirmed; full browser scope-transition scenario remains unexecuted.
5. **Category:** Functional bug / cross-feature context consistency.
6. **Affected feature:** Employee Web parking/retrieval/guest/incident workflow restoration and scan-hub reentry after authoritative operational context changes.
7. **Exact paths:** `apps/valet/src/components/employee-app.tsx`; `apps/valet/src/components/shell/employee-workspace.ts`; `apps/valet/src/components/shell/employee-live-router.tsx`; `apps/valet/src/components/shell/employee-workspace-handlers.ts`; `apps/valet/src/components/shell/employee-active-shell.tsx`.
8. **Relevant line ranges:** `employee-app.tsx:104–113` supplies identity alone to workspace fence, `123–129` stores targets at parent scope, `251–285` selects retained screen and passes targets through while keying only the child shell on changed operational authority; `employee-workspace.ts:57–68,93–107` cannot represent location/membership/shift; `employee-live-router.tsx:159–169` combines new membership/role with retained session/task; `employee-workspace-handlers.ts:37–39,75–94` navigation retains unrelated prior targets.
9. **Expected behavior:** When authenticated identity stays the same but authoritative organization/membership/location/shift changes, retire targets bound to old operational authority. A same-user token refresh with identical operational authority should preserve a legitimate workflow.
10. **Actual behavior:** Workspace currency depends only on `authenticated` and `identityGeneration`. `EmployeeActiveShell` remounts for new membership/location/shift, but target state lives above that keyed subtree. The old `screenOverride`, task/session IDs and possible parking payload are sent straight into the newly mounted live router. New location header/scope can therefore coexist with old operational targets. A transient loss/restoration of the exact same authority need not cause this bug; the relevant case is a genuinely different resolved authority.
11. **Root cause:** Identity epoch is used as the entire workspace authority stamp. The operational scope key is applied at the child shell boundary, not where target state is stored or selected.
12. **Credible execution/reproduction path:** While signed in, open/resume a workflow for location A and retain its target. Let authoritative context change to an eligible different location/membership/shift under the same staff login, for example after shift management changes and a foreground/reconnect context refresh. `useStaffOperationalContext` yields the changed resolution without changing auth identity. Parent workspace remains current; child shell remounts; live router receives old A target plus B membership/role/header. A local actual-source transpilation probe of `rescopeWorkspace` verifies it returns the same object with A's retrieval session when identity is unchanged. Artifacts: `workspace-scope-probe.cjs`, `workspace-scope-probe.log`. The probe establishes the missing fence; it is not an E2E browser simulation.
13. **Preconditions:** A previously retained workflow target; operational authority genuinely changes while the staff auth identity remains authenticated with the same identity epoch; app remains mounted. A logout/login clears targets correctly and is not affected.
14. **Business impact:** Wrong-location workflow presentation, stale task errors, confusing resumption and failed operational actions following a scope change. Operators may have to abandon/reload/sign in again to get a consistent workspace.
15. **Security/data impact:** Not established as data exposure or authorization bypass. Backend location/shift/ownership checks can reject old target actions. This finding concerns the client mixing contexts; mutation enforcement needs independent backend verification.
16. **Affected roles:** Staff roles allowed into live Employee Web with retained operational targets, especially multi-location or multi-membership staff.
17. **Affected environments:** Employee Web, including pilot/production when such scope transitions occur. Native has a separate explicit authority-retirement implementation; this finding is not attributed to native.
18. **Existing test coverage:** `employee-workspace.test.ts` tests logout/login, definitive auth loss and same-user token-refresh preservation. `employee-app.start-shift.test.tsx` checks chooser/reconciliation via server rendering. Both passed here (13 tests). The latter explicitly notes effects do not run under SSR.
19. **Missing validation:** No full browser test transitions a mounted retained workflow from authority A to B. No live DB/multi-device/manager-driven context-change reproduction executed. Parent should independently verify a supported concrete authority transition and backend rejection before final severity acceptance.
20. **Suggested fix:** Stamp operation-bound targets with stable auth identity plus organization/membership/location/shift; retire incompatible targets when the actual resolved authority changes. Preserve pending command-recovery intent only where its explicit contract requires it. Do not clear on ordinary token refresh or transient context loading alone. Add mounted integration coverage A→no active shift→B and direct changed authority, plus same-authority token refresh.
21. **Estimated implementation complexity:** Small-to-medium, approximately 1–2 engineer days including regression coverage, subject to accepted recovery contracts.
22. **Regression risk:** Medium because eager clearing could destroy legitimate pending/ambiguous command recovery. Keep auth-presence and operational-authority transitions distinct. Verify existing token-refresh/uncertain-shift tests and all reentry paths.
23. **Existing related GitHub issue:** No exact match established. Known #273 is physical account-switch validation, #219 handoff recovery and #281 Cash/POS incompleteness; these are different subjects. Full closed-issue/branch deduplication remains with parent.

**Attempted disproof:** Checked the active-shell key: it does remount by membership/location/shift, but state is held in EmployeeApp above it. Checked workspace handlers: only explicit parking completion resets all targets; navigation preserves them. Checked operational hook: it derives scope from context and does not reset auth identity for a valid changed scope. Existing tests intentionally preserve same-user refresh but do not represent operational authority in their input. Backend rejection mitigates security impact but does not repair the wrong target/context pairing.

## Positive evidence and rejected hypotheses

- Native authentication has explicit generation barriers, serialized local storage mutations, installation binding and best-effort ephemeral refresh-token revocation. Logout does not equate local cleanup with confirmed server revocation.
- Native condition photo capture isolates private ownership, validates scoped cache paths, fences callbacks by owner revision and uses a crash/cleanup barrier. Portable upload results are scope/operation checked; only authoritative discovery establishes qualifying eligibility. These source properties are not proof of successful bytes transfer on an Android device.
- Native backgrounding intentionally discards transient captures. A pending `RESEND_SAME_BYTES` result after discarded bytes may require server operation expiry/recovery; without server policy review and accepted privacy requirements this was not promoted to a bug.
- A suspected Expo File/FormData incompatibility was **rejected** after reading installed Expo 57 runtime: it patches FormData and installs Expo fetch by default. React Native legacy FormData semantics alone would have produced a false positive. No finding is asserted from that hypothesis.
- Native task tracking stops foreground watchers on backgrounding, binds to authenticated task authority, uses bounded resident sample memory, has expiry and replay IDs. Detailed retry limits/backend contracts/device location performance are outside completed verification.
- Request timeout behavior remains a review gap; no speculative indefinite-loading defect is counted merely because an explicit timeout was absent in some read files.

## Validation actually executed

Existing dependencies were reused through parent-created external ancestor dependency links. No dependencies were installed and no build was run. The worktree source baseline remains unchanged. Node/Vitest execution is not physical-device verification and reused dependency availability is not clean-install proof.

1. From `packages/employee-client`:

   `<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run src/employee-condition-photo-session.test.ts src/native-auth-account-switch-truth.test.ts src/native-auth-logout.test.ts src/employee-gps-sample-buffer.test.ts --maxWorkers=1 --reporter=dot`

   **4 files passed; 30 tests passed.** Vitest duration 13.50 s. Log `focused-tests.log`.
2. From `apps/valet`:

   `<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run src/components/shell/employee-workspace.test.ts src/components/employee-app.start-shift.test.tsx --maxWorkers=1 --reporter=dot`

   **2 files passed; 13 tests passed.** Vitest duration 29.48 s. Log `web-workspace-tests.log`. These are unit/SSR checks; no mounted browser context transition proved.
3. Actual-source scope probe:

   `node <AUDIT_WORKDIR>/native/workspace-scope-probe.cjs`

   **Passed assertions / demonstrated retained object and target with unchanged identity.** It transpiles the existing source into an isolated VM and exercises the source function. No network or app source edits.
4. `git status --porcelain` from isolated source returned empty during verification.

Not run by this worker: full lint/typecheck/build, full native/web/portable suites, Playwright browser E2E, native Android Gradle build, emulator/simulator, physical Android/iOS tests, provider integration tests or DB-backed lifecycle tests. Parent may report separate checks; do not attribute those to this worker.

## Integration/production matrix for this scope

| Integration | Implemented | Configured here | Mock/Node proof here | Real provider/device proof here | Production enabled |
|---|---|---|---|---|---|
| Android camera/private files/Expo manipulation | Source yes | UNKNOWN | Portable condition-photo state tests passed; actual native file/transport test only source read | No | UNKNOWN |
| Condition-photo API/S3 | Client source yes | UNKNOWN | Portable session tests passed | No API/S3 call | UNKNOWN |
| Android FCM/Expo registration | Source yes | UNKNOWN | Lifecycle source read; no push test run | No token registration/delivery | UNKNOWN |
| SecureStore and installation file | Source yes | UNKNOWN on device | Portable account-switch/logout tests passed | No OS storage/reinstall proof | UNKNOWN |
| Expo Location/task GPS | Source yes | UNKNOWN on device | Buffer tests passed | No permission/GPS/device proof | UNKNOWN |
| Plate OCR/native bridge | Source files present | UNKNOWN | Not run | No | UNKNOWN |
| Customer HTTPS origin | Native config preflight source yes | UNKNOWN deployed value | Config source reviewed | No deployed origin check | UNKNOWN |
| iOS pushes/camera/runtime | Some shared client source; Android-only push adapter explicitly returns unavailable | UNKNOWN | No | No | UNKNOWN |

## Pilot interpretation and remaining uncertainty

A controlled pilot cannot be certified from this client review. Real Android camera/photo upload/rotation/restart/network-loss, FCM delivery/account switching, secure storage, location permission and background/foreground behavior remain unverified. Issue #273 already records physical account-switch validation work; do not inflate this into a newly discovered native defect. Missing Cash/POS UI from #281 and handoff recovery from #219 must be consolidated as known backlog by the parent, not rediscovered from incomplete review.

For NATIVE-WEB-01, a controlled workaround is to require a fresh app load or logout/login when moving to a different operational scope; avoid resuming previous-scope targets. Fix before a multi-location Web pilot that requires uninterrupted same-login scope switching. The limitation does not by itself block a tightly controlled single-scope session pilot. Do not treat this workaround as a substitute for actual Android end-to-end acceptance.

UI Freeze was respected. Suggested repair changes state scoping and tests, not approved layout, geometry, typography or design. No owner redesign approval is indicated for that repair; implementation still needs normal repository review and accepted recovery contract compliance.
