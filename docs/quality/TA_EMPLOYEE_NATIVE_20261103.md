# Employee Web / Native / Shared Client — Source-Level Test Audit

**Audit date:** 2026-11-03. **Immutable reviewed baseline:**
`f9ecebd9af85b44580771b4027515d06c0a31de4`.
**Exclusive worktree:** `cos/test-audit-employee-20261103`. The requested
`apps/employee-client` does not exist; the canonical package is
`packages/employee-client`. This report and its per-registration CSV are
**documentation only**. No test/code/UI/CI/schema/gate/timeout changed.

## Verdict and evidence levels

**KEEP** all distinct protected-command and identity/tenant/Location/Shift
negative gates. **Priority P1 REWRITE:** three parameterized suites have
**ignored case parameters** and thus pass multiple nominal scenarios while
actually executing the same scenario. This is a **source-demonstrated
test-coverage defect**, not proof of a production bug. **Priority P1 REWRITE:**
the 144 Native Shift render pairs are **not 144 full equalities**; their
accepted feedback exceptions must be independently guarded before treating
the matrix as exhaustive visual parity. **P2 REWRITE:** React 19's deprecated
mounted `react-test-renderer` harness should be replaced by supported
DOM/real-browser mounting while preserving its unique EndShift tests.

**Confidence:** **high** in exact source registration, ignored-parameter
false-green, semantic assertions, current CI routing, and declared guards;
**medium** in likely flakiness/cost (no timing experiment); **not established**
for actual test pass/fail on this SHA, real Android rendering, device custody,
and E2E behavior. This isolated worktree has **no installed dependencies** for
Vitest/Playwright/React, so those suites were **NOT RUN**. Assertions cited
below are source-declared, not observed runtime outcomes.

## Complete per-case static inventory

The companion
[`TA_EMPLOYEE_NATIVE_CASE_LEDGER_20261103.csv`](TA_EMPLOYEE_NATIVE_CASE_LEDGER_20261103.csv)
has one row per located `it`/`test` static registration:
`path,line,surface,runner,registration,mode,literalTitle,suiteGate,staticSignals,sourceLine`.

| Surface | Test files | Static registration sites | Runner |
| --- | ---: | ---: | --- |
| `apps/valet` | 135 | 669 | Vitest + 13 Playwright `.spec.ts` files |
| `apps/valet-native` | 260 | 1,294 | Vitest, including some Node `.test.mjs` |
| `packages/employee-client` | 106 | 560 | Vitest |
| **Total** | **501** | **2,523** | **364 `.each` sites** across surfaces |

The CSV is a **static source ledger**, not the number of executed Vitest or
Playwright cases: `.each` expands at runtime, some `it` registrations
contain loops, and a single freeze test contains 144 render pairs. The
`staticSignals` field is a broad regex review hint (its nearby-text search
can include a later case), **never proof of an individual test's behavior**.
Declared titles and source lines are review locators; neither a green runner
nor a test-name string establishes that a scenario was actually simulated.
The entire included file set contains no explicit `it.skip`/`test.skip`
registration found by the ledger scan; absence does not establish execution.

CI routing is observable: [root non-PostgreSQL runner
`scripts/test-harness/run-root-tests.mjs:15–26`](../../scripts/test-harness/run-root-tests.mjs#L15-L26)
serializes the non-API/DB Turbo test packages at concurrency 1;
[`ci.yml:60–93`](../../.github/workflows/ci.yml#L60-L93)
runs that unit lane. The separate
[`employee-e2e` job](../../.github/workflows/ci.yml#L233-L360)
provisions disposable PostgreSQL, starts the API and Web app, installs
Chromium and invokes Playwright. The Web
[`playwright.config.ts:3–20`](../../apps/valet/playwright.config.ts#L3-L20)
uses one worker, 60s default timeout, one retry; E2E suite-specific 90/120s
timeouts should not be removed without evidence. Native Vitest
[`vitest.config.mjs:5–16`](../../apps/valet-native/vitest.config.mjs#L5-L16)
stubs native modules; unit green ≠ a real Android build, layout or field test.

## Prioritized recommendations — exact source and required invariant

| Rank / judgment | Test and source-backed finding | Keep/repair condition and no-false-green criterion |
| --- | --- | --- |
| **P1 — REWRITE** | [Native push A→B account transition `native-push-account-transition.test.ts:94–116`](../../apps/valet-native/test/native-push-account-transition.test.ts#L94-L116) labels `online` vs `lost-response-after-commit` but `async ()` ignores the parameter. Both paths invoke the same resolved `registrationResponse` after a direct `owner=null` assignment; no committed-then-lost response is injected. | **KEEP** A registration ownership release before B registration, no token/account leak. Rewrite as a consumed `mode`, with a truly distinct post-commit response-loss fault/deferred rejection, A revocation known through server-backed reconciliation and B registered only after authoritative release. Assert different transport history **and** same safe B result, not just a B success assertion. Existing distinct tests [conflict/no data leak :36–61](../../apps/valet-native/test/native-push-account-transition.test.ts#L36-L61) and [local-only logout blocks B :63–92](../../apps/valet-native/test/native-push-account-transition.test.ts#L63-L92), [stale A in-flight response fenced :118–145](../../apps/valet-native/test/native-push-account-transition.test.ts#L118-L145) are necessary but do **not** simulate the advertised lost COMMIT acknowledgment. |
| **P1 — REWRITE** | [Native shift presence `native-shift-presence-runtime.test.ts:194–212`](../../apps/valet-native/test/native-shift-presence-runtime.test.ts#L194-L212) labels `logout` and `user replacement`; its `async ()` ignores label, directly increments auth generation and invokes identical `runtime.purge()` for both. | **KEEP** purging *both* START and END durable descriptors, including absent persisted authority after logout/replacement. Drive **two distinct public identity lifecycle events** rather than the same direct purge call; test both persisted store and live owner state and late restoration race. If no distinct public entry path exists, retain **one generic purge primitive test** and add separate interface/adapter-level logout and replacement tests before merging duplicates. Two identical passes are not two independently tested lifecycle causes. |
| **P1 — REWRITE / conditional MERGE** | [Shared ParkingSpot `employee-parking-spot-validation.test.ts:62–91`](../../packages/employee-client/src/employee-parking-spot-validation.test.ts#L62-L91) labels five cases `wrong-location`, `missing`, `inactive`, `occupied`, `zone-incompatible` while `async ()` ignores the reason: same `P-101` input, same generic synthetic 409 and same correction/re-scan path in all five. | **KEEP** generic non-disclosing `PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE` on client, no silent Slot/custody progress, correction and QR rescan. The distinct five *physical* reasons belong in real SQL/HTTP scoped negative cases, which actually vary fixtures: [API `parking-spot-validation.integration.test.ts:81–135`](../../apps/api/test/parking-spot-validation.integration.test.ts#L81-L135) and [race after preflight :66–97](../../apps/api/test/parking-spot-validation-races.integration.test.ts#L66-L97). Either vary the client transport response/authority facts per case and assert distinct effects, **or** consolidate this five-label duplicate to one honest generic-client-409 case **only if** those independent backend negative tests remain mandatory. No five-green-cases coverage claim from one stimulus. |
| **P1 — KEEP + targeted REWRITE** | [Native Shift freeze `native-shift-recovery-freeze.test.ts:47–57,104–198`](../../apps/valet-native/test/native-shift-recovery-freeze.test.ts#L47-L198). 16 locale/theme/width/font combinations × 9 states = **144** baseline/current React Native host-tree pairs in **one** `it`, with 30s test-local timeout. Only **64** full comparisons (ACTIVE, CONFIRMING, SUBMITTING, ENDED); **64** remove the entire `native-shift-presence-status` subtree before equality (UNCERTAIN, DENIED, EXPIRED, PENDING); the remaining **16** CHECKING STATUS pairs have **no equality**, only busy/a11y checks. Hashes written to JSON are not assertions. | **KEEP all 144 combinations** and approved Shift Presence differences, including exact busy+disabled controls and original geometry. Add state-specific *positive and negative* checks of allowed feedback subtree (with fixed safe delta), and for CHECKING STATUS explicitly compare all unchanged tree outside the allowed live feedback/controls; fail for any unapproved change. Do not make CI faster by deleting pairs or silently increasing/skipping test gates. The output [`render-comparison.json` writer :182–198](../../apps/valet-native/test/native-shift-recovery-freeze.test.ts#L182-L198) mutates a tracked documentation path when run; guard artifact reproducibility/review or move capture to an explicit non-gating tool only after equality proofs remain. |
| **P1 — KEEP** | [Native Release truth `native-release-verification-truth.test.tsx:99–208`](../../apps/valet-native/test/native-release-verification-truth.test.tsx#L99-L208) distinguishes EN/AR Standard proof method, Supervisor override, missing/PENDING proof, financial/authority block and no Release CTA. [Real panel gates verification fields and HANDOFF_PENDING at :42–67](../../apps/valet-native/src/handoff/native-release-panel.tsx#L42-L67) and does not offer Release without verified eyebrow [:113–142](../../apps/valet-native/src/handoff/native-release-panel.tsx#L113-L142). | **KEEP** proof-only (not custody) supervisor override, no identity-verified claim for override, release blocked on missing/invalid proof. The [visual render fixture explicitly provides `HANDOFF_PENDING`, `pendingAt`, `verifiedAt`](../../apps/valet-native/test/appearance-workflow-cases.ts#L104-L133); that is a **valid happy-path fixture**, not bypass of the negative proof guard. |
| **P2 — REWRITE, not REMOVE** | [Mounted EndShift `end-shift-recovery.test.tsx:1–7,42–55,122–137,187–270`](../../apps/valet/src/components/end-shift-recovery.test.tsx#L1-L270) uses `react-test-renderer` `create` with React `act` to mount actual `EmployeeApp`, real `useEndShift`/controller and mocked transport/scope/auth. [`apps/valet/package.json:32–33`](../../apps/valet/package.json#L32-L33) pins React-19-compatible `react-test-renderer` 19.2.8; [React explicitly deprecates it](https://react.dev/warnings/react-test-renderer). | **KEEP** the unique mounted integration: ambiguous A EndShift through `NO_ACTIVE_SHIFT`, explicit exact-cash retry, late A suppression under new Shift/identity, real hook callback wiring. Replace deprecated renderer with supported DOM-based mounted harness (e.g. Testing Library for React with proper cleanup and `act`) or equivalent browser test; leave current test in place until **same expanded five cases** pass with production hooks, no optimistic success. No production component or UI change is authorized. |
| **P2 — REWRITE** | [Web EndShift E2E `issue358-endshift-transition.spec.ts:38–116`](../../apps/valet/e2e/issue358-endshift-transition.spec.ts#L38-L116) covers A→none→B→none, late A success ignored under B, and same-scope token refresh. It uses positional `getByText('B Hotel').first()` at :51/:69/:82 and waits two animation frames [:75–80](../../apps/valet/e2e/issue358-endshift-transition.spec.ts#L75-L80) before checking absent `Shift ended`. | **KEEP** independent browser mount/visibility + trace count, distinguish this Vite/fixture-backed scope contract from database-backed E2E. Make assertions authority-scoped (region/test ID + correct selected Location, not first matching text) and use a controlled async commit/settlement barrier rather than two frames. Never count merely *not yet displayed* `Shift ended` as sufficient late-success suppression; assert authoritative B UI after the late response has definitely been processed. |
| **P2 — REWRITE** | [Real E2E recovery `employee-recovery.spec.ts:37–90`](../../apps/valet/e2e/employee-recovery.spec.ts#L37-L90) intercepts a genuine intake request then sleeps 1000 ms [:49–53](../../apps/valet/e2e/employee-recovery.spec.ts#L49-L53) and selects `page.locator('main button').first()` [:57–66](../../apps/valet/e2e/employee-recovery.spec.ts#L57-L66) as Back. Yet it **uniquely** proves offline Confirm Parked does not succeed [:82–88](../../apps/valet/e2e/employee-recovery.spec.ts#L82-L88) and actual ended Shift rejects Start Parking [:92–105](../../apps/valet/e2e/employee-recovery.spec.ts#L92-L105). | **KEEP** two protected negative gates and real endpoint. Replace time sleep with explicit route hold/release and selected semantic Back button/test ID; assert the mutation is pending before disabled-navigation checks. Do not trade real backend proof for a mock-only fast test. |
| **P2 — REWRITE** | [Parking stale E2E `issue390-parking-stale.spec.ts:190–285`](../../apps/valet/e2e/issue390-parking-stale.spec.ts#L190-L285) and [Start Shift stale selection `issue398-start-shift-stale-location.spec.ts:46–110`](../../apps/valet/e2e/issue398-start-shift-stale-location.spec.ts#L46-L110) use two-frame drains and multiple `.first()`/literal hotel strings. | **KEEP** actual B-target confirmation/expectedTaskVersion [#390 :204–220](../../apps/valet/e2e/issue390-parking-stale.spec.ts#L204-L220), old drafts/QR and late A errors scoped out [:223–285](../../apps/valet/e2e/issue390-parking-stale.spec.ts#L223-L285), and invalidated Location cannot silently reselect old A [#398 :59–110](../../apps/valet/e2e/issue398-start-shift-stale-location.spec.ts#L59-L110). Replace positional match + frame count with deterministic controller/transport barriers and identity-bound locators. |
| **P2 — KEEP, optional MERGE shared fixtures** | [Native release panel `native-release-panel.test.tsx:123–236`](../../apps/valet-native/test/native-release-panel.test.tsx#L123-L236) and [Native release verification truth :99–208](../../apps/valet-native/test/native-release-verification-truth.test.tsx#L99-L208) both check positive English method names but have **different unique negative cases**: one-CTA/releasing disabled/report issue/RTL vs missing proof/override/no identity-claim/blocked ready. | MERGE only common fixture construction and trivial positive label scenarios **after mapping assertion-for-assertion**. **REMOVE none** of the missing-proof, financial/authority, override, button-disable or non-owner invariants. |
| **P2 — KEEP, optional MERGE representation** | [Shift SSR `shift-summary-live.test.tsx:167–229`](../../apps/valet/src/components/screens/shift-summary-live.test.tsx#L167-L229) checks strings/HTML (including `indexOf('>Retry end shift</button>')` at :199) and [custom-hook interaction test `shift-summary-live.interaction.test.tsx:11–77,161–262`](../../apps/valet/src/components/screens/shift-summary-live.interaction.test.tsx#L11-L262) mocks React `useEffect` as a no-op. The mounted EndShift/Playwright probes are different integration levels. | If supported DOM mount replaces deprecated renderer, share repeated fixtures and semantic selectors rather than relying on literal markup/hand-rolled hooks. **KEEP** exact JOD LTR, disabled offline/submitting, explicit confirmation/cancel, open-work error, and EN/AR copy verification. HTML substring tests can remain fast copy guards but cannot claim actual interaction/focus semantics. |
| **P3 — cost REVIEW, not gate weakening** | [Appearance render matrix `native-appearance-render-matrix.test.ts:229–295`](../../apps/valet-native/test/native-appearance-render-matrix.test.ts#L229-L295) compiles baseline from Git and renders many light/dark EN/AR workflows; [renderer `appearance-render-evidence.ts:17–56,171–205`](../../apps/valet-native/test/appearance-render-evidence.ts#L17-L205) caches compiled source. [Style freeze `native-appearance-style-freeze.test.ts:9–37`](../../apps/valet-native/test/native-appearance-style-freeze.test.ts#L9-L37) has fixture overwrite when `VAYLET_CAPTURE_LIGHT_BASELINE=1`. | Profile cold/warm build, Git `cat-file`, TypeScript transpile and host render separately; only cache immutable reference/compiled AST when same hashes and all negative assertions survive. Prevent silent baseline recapture in normal CI. No actual timing measurement in this audit; do not remove 15s/30s timeouts to hide test cost. |
| **P3 — REMOVE only genuinely duplicate *labels*, not protection** | The 5 identical client ParkingSpot 409 rows or 2 identical Native shift purge labels are **candidate consolidation** only after truly distinct backend and public-lifecycle tests still enforce reason-specific coverage. | **No independently defended test registration is approved for unconditional removal or skip**. If changed, compare pre/post expanded case inventory, executed assertions and adversarial mutants. Never delete negative coverage for a suite-count win. |

## Unique safety invariants — source-backed KEEP matrix

| Contract | Source tests with distinctive denial/rollback/unknown-outcome evidence |
| --- | --- |
| **Accepted DEC-066, EndShift truth / cash / Shift owner** | [Web mounted `end-shift-recovery.test.tsx:189–269`](../../apps/valet/src/components/end-shift-recovery.test.tsx#L189-L269): scoped explicit Retry and auth-loss wiring; [web controller `end-shift-controller.test.ts:86–175`](../../apps/valet/src/features/shift/end-shift-controller.test.ts#L86-L175): no local success on network failure, changed retry payload refusal, OPEN_TASK_HANDOFF_REQUIRED as definite block; [shared `employee-shift-end-session.test.ts:22–201`](../../packages/employee-client/src/employee-shift-end-session.test.ts#L22-L201): normalized exact command, cash, no auto-replay, malformed 2xx is uncertain; [`employee-shift-end-fences.test.ts:27–121`](../../packages/employee-client/src/employee-shift-end-fences.test.ts#L27-L121): authorization change, background/offline and different Shift. |
| **Accepted DEC-099/100 Shift Presence / no location bypass** | [`employee-shift-end-recovery-fences.test.ts:11–220`](../../packages/employee-client/src/employee-shift-end-recovery-fences.test.ts#L11-L220): one exact GET/no POST, wrong operation/cash descriptor, late result fenced; [`employee-shift-end-reconciliation.test.ts:10–233`](../../packages/employee-client/src/employee-shift-end-reconciliation.test.ts#L10-L233): post-loss canonical reads, approval states, fixed 865.123 JOD and Shift identity; [`native-shift-presence-connectivity.test.ts:23–138`](../../apps/valet-native/test/native-shift-presence-connectivity.test.ts#L23-L138): offline late START/END result cannot cause second POST, descriptor O preserved; [`native-shift-presence-store.test.ts:109–193`](../../apps/valet-native/test/native-shift-presence-store.test.ts#L109-L193): secure storage descriptor/corruption/serialization. |
| **Accepted DEC-068: park first, then Spot, then KeySlot; physical confirmation never offline success** | [`employee-confirm-parked-flow.test.ts:11–83`](../../packages/employee-client/src/employee-confirm-parked-flow.test.ts#L11-L83): exact order and QR/manual equivalence; [`employee-confirm-parked-fences.test.ts:16–146`](../../packages/employee-client/src/employee-confirm-parked-fences.test.ts#L16-L146): non-owner, mismatch, stale response; [`employee-confirm-parked-recovery.test.ts:22–160`](../../packages/employee-client/src/employee-confirm-parked-recovery.test.ts#L22-L160): read-only recovery after lost response; [web real E2E :68–90](../../apps/valet/e2e/employee-recovery.spec.ts#L68-L90): no offline Confirm Parked. |
| **Accepted DEC-042/043: Handoff proof is not physical custody or supervisor-owner release** | [`employee-handoff-flow-fences.test.ts:25–65`](../../packages/employee-client/src/employee-handoff-flow-fences.test.ts#L25-L65): old proof cannot survive identity/task/background; [`employee-release-flow-session.test.ts:18–240`](../../packages/employee-client/src/employee-release-flow-session.test.ts#L18-L240): current owner vs supervisor override, cash gate, malformed 2xx, response loss and no blind completion POST; [`employee-process-death-release.test.ts:57–105`](../../packages/employee-client/src/employee-process-death-release.test.ts#L57-L105): process restart with before-commit and committed-lost-response cut, no recovered pickup code; [native release verification truth :150–202](../../apps/valet-native/test/native-release-verification-truth.test.tsx#L150-L202): missing/PENDING/unknown proof cannot unlock release. |
| **Tenant, Location, task owner, offline ambiguity** | [Web `parking-controller-stale.test.ts:82–224`](../../apps/valet/src/features/parking/parking-controller-stale.test.ts#L82-L224): old-target hydration/confirmation blocked on change; [web `check-in-membership-ownership.test.ts:33–81`](../../apps/valet/src/features/check-in/check-in-membership-ownership.test.ts#L33-L81): deny another employee's ASSIGNED/ACCEPTED/IN_PROGRESS Task; [shared `employee-operational-barrier.test.ts:37–166`](../../packages/employee-client/src/employee-operational-barrier.test.ts#L37-L166): no cross-task POST while uncertain or GET failed; [shared `employee-operational-identity.test.ts:14–108`](../../packages/employee-client/src/employee-operational-identity.test.ts#L14-L108): stale User A responses never become B authority; [web scoped E2E `issue390-parking-stale.spec.ts:204–285`](../../apps/valet/e2e/issue390-parking-stale.spec.ts#L204-L285) checks actual B confirmation target and no A draft. |

**What the tests do not prove:** A React Native host-tree comparison stubs
React hooks, platform primitives and effects
([`appearance-render-evidence.ts:71–88,150–169`](../../apps/valet-native/test/appearance-render-evidence.ts#L71-L169));
it cannot prove native Android pixels, touch behavior, actual platform
permissions, screen-reader service or real GPS hardware. The shared
`process-death` tests use in-memory simulated server transitions
([`employee-process-death-release.test.ts:30–53`](../../packages/employee-client/src/employee-process-death-release.test.ts#L30-L53)),
not actual killed Android processes or PostgreSQL commits. Web browser
fixtures simulate selected network outcomes; retain full employee-e2e
PostgreSQL/API/Chromium coverage for real authorization and custody. None of
these observations justifies weakening the source tests.

## Verification, implementation guidance and scope protection

1. **Do not conflate literal `it.each` labels with varied test inputs.**
   Priority follow-up should first cover the three false-green sites above.
   For each, show before/after test-case expansion and record the *unique*
   injected fault or persisted authority state per parameter. A passing test
   with a dormant parameter is **not negative-case evidence**.
2. **Keep real event timing where the safety claim is temporal.** Replace
   positional `.first()`, static `getByText`, fixed sleeps and double-RAF
   only when the alternative proves the protected event and state transition
   have actually settled. Do not settle for screenshots/text that might be
   stale or not yet updated. Preserve negative `zero POST` and authoritative
   request-body checks.
3. **Cold-start cost is a hypothesis, not a benchmark here.** The 144-pair
   freeze performs costly in-memory Git reads/transpile/render, plus writes
   evidence JSON. The Web Playwright job provisions PG, API, Web, browser and
   fixtures. Before changing the schedule or grouping, collect durations by
   suite and Git/transpile/render phase, compare repeated CI runs and check
   failing-case readability. The present 15/30/60/90/120-second values are
   existing guards, **not** suggested changes.
4. **Verify in the intended runners before any future test rewrite merge:**
   `pnpm --filter @valet/employee-client test`,
   `pnpm --filter @valet/valet test`,
   `pnpm --filter @valet/valet-native test`, and employee Chromium E2E with
   disposable migration/fixture provisioning, plus native device/manual
   checks for on-device claims. Report collected/executed/skipped cases,
   exact SHA, runtimes and device variants. This audit **did not run** those
   commands because dependencies were not installed in its owned worktree.
5. **Documentation-only decision:** No conditional `REMOVE` or `MERGE`
   should be performed without preserving every unique authorization,
   state, custody, offline, proof and history assertion above and proving
   they fail with an intentionally broken implementation. No CI gate,
   timeout or test is modified by this task.

## Audit validation log

- **Done:** checked branch and HEAD at the assigned baseline; scanned all
  501 files into **2,523** source test registration rows (including **364**
  parameterized sites). Exact path and line data live in the companion CSV.
- **Done:** inspected actual mounted React 19 hook contract, both Web and
  Native EndShift surfaces, the 144-pair test and renderer, renderer output
  mutation, current CI+Playwright lane, Push/Shift/Parking ignored-parameter
  cases, and release/custody/identity/offline negative tests.
- **Not done:** run Vitest, Playwright, PostgreSQL E2E, Native Android
  automation, screenshots, cold/warm timings or mutant tests; their absence
  is not a source regression result.
- **Boundary:** Only `docs/quality/TA_EMPLOYEE_NATIVE_20261103.md` and
  `docs/quality/TA_EMPLOYEE_NATIVE_CASE_LEDGER_20261103.csv` may enter the
  commit. All other worktrees and user changes are untouched.
