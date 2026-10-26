# Issue #345 — implementation and focused verification

Repository: `yamanradwan1-rgb/valet-platform`
Issue: https://github.com/yamanradwan1-rgb/valet-platform/issues/345
Branch: `fix/issue-345-end-shift-uncertain-reconciliation-ui-frozen`
Fetched base: `a33717b197580d0ba48a9b3d56068841140c28ad`
Validation date: 2026-10-26 UTC.

## A. Root cause

The Native status control previously checked only the Presence child. The independently held End Shift parent remained uncertain, so the ordinary End Shift control remained disabled even after the child recovered terminal truth. Missing-attempt, active-operation and rate-limit guards returned silently.

Two further defects are proven by source inspection:

- The status endpoint's `shiftId` is the **result** Shift selector. Denial writers leave `result_shift_id` null. The previous child check rejected legitimate END denials with that null selector, although the authenticated immutable operation identity still bound the attempted Shift.
- A COMMITTED response with a null result fell through to expired presentation. This could erase the sole recovery descriptor without verified success evidence.

A new regression test also exposed the need to fence an uncertain parent during the subsequent fresh-context read, even when the child has already established terminal denial.

The original network interruption, installed phone APK/API origin and attribution of historical server reads to particular device taps remain unproven. No live QA or production diagnosis was attempted.

## B. Implementation

`PresenceCheckOutcome` carries a typed outcome, exact descriptor and, when established, committed result or denial reason. It is a read outcome/feedback contract; the existing operation lifecycle remains authoritative.

Native Check request status invokes `EmployeeShiftEndSession.checkPresenceStatus()`. The parent binds its original attempt to its Presence operation ID, validates the exact target before GET, consumes the structured child outcome, and applies it only after its existing workflow-generation and authority fences pass.

- **COMMITTED:** shared response parsing and the existing strict End result validator run before descriptor deletion. Matching Shift/start/location/currency/cash/reconciliation evidence settles the parent to `ended`. The existing one-time `onEnded`, scope retirement/context refresh and ended-presentation acknowledgment path remains in use. A malformed, missing or mismatched result remains unresolved.
- **DENIED:** retain the historical server reason and measured summary. Read fresh authenticated operational context. Only one exact matching active Shift permits returning to `active`; missing, foreign, ambiguous or unavailable context keeps the parent uncertain with explicit feedback. No automatic END follows.
- **EXPIRED/missing server operation/expired exception:** read fresh context under the same rule. No inference of success from absence of an active Shift. Only verified exact active authority enables another explicit attempt.
- **PENDING/APPROVED/unknown:** retain uncertainty and the exact operation. Approval alone never completes a Shift. Retry performs a read; only explicit approved continuation may proceed through the existing exception workflow. A contradictory consumed exception with a pending operation stays unresolved.
- **No-op guards:** checking, blocked, offline, rate-limited and missing-descriptor outcomes are explicit and observable. Network/HTTP/timeout/contract errors explain that the result remains unconfirmed. No raw exception details enter Native feedback.

The existing Retry end shift control performs status recovery for Presence attempts while uncertain. Legacy transports retain their prior behavior. Double taps share the parent operation; child guards prevent concurrent GETs. Busy feedback covers the status read and terminal context verification and is cleared/fenced on completion or lifecycle cancellation.

Cash input is preserved, including exact `865.123 JOD` recovery in a synthetic test. Pending/approved/checking operations lock cash edits and ordinary submissions. A genuinely new explicit attempt after verified terminal rejection allocates a new operation/challenge and reads current policy, including REQUIRE_OR_OVERRIDE -> OFF. Historical denial facts are not rewritten.

Restart uses the existing protected persisted descriptor and installation/auth identity fences. Restored END recovery is explicitly read-only. Exact committed, denied and expired restart outcomes reconcile to the parent; terminal descriptors are cleaned up, while ambiguous or invalid committed evidence retains the recovery selector. Native foreground revalidation invokes the same parent-aware read path. No background GPS or new permission acquisition was added.

No API, contract schema, database, deployment, payment, audit-writing or production configuration files changed. Existing server authorization, transactions and idempotency remain unchanged.

## C. Security and safety

Affected entities are Shift, Presence operation/exception, client End attempt and the existing cash report. There are no ValetSession or Task/Dispatch transitions, schema changes, new indexes or policy changes. This is a correction to the existing authorized employee workflow.

Recovery checks auth generation, organization, membership, location, Shift ID, Shift start identity, END action, original operation ID, normalized cash identity/amount, currency and parent workflow generation. The native authority predicate and End authority key now also bind Shift start and currency. Exact result validation checks cash arithmetic and report timestamp. A previous Shift with the same cash cannot satisfy recovery.

Logout, identity replacement, membership/location/Shift changes, A-B-A changes, backgrounding and operational-scope retirement make late results inert. Availability is rechecked after the status GET. Parent settlement cannot be duplicated by repeated checks. Recovery does not issue END/cash POSTs, request manager approval or acquire location. Existing policy/challenge/exception validation remains in force for subsequent explicit actions.

## D. Native UI freeze

Permitted visible changes are confined to:

1. Text in the existing Shift Presence feedback region, including checking, terminal result, pending, offline, blocked, rate-limit, unavailable descriptor and unresolved authority messages in EN/AR.
2. Existing Check request status and Retry end shift busy indicators/accessibility state and duplicate-tap protection.
3. Correct state-dependent cash/End/manager/continuation control availability.
4. Recovery visibility for a historical unresolved END under current OFF policy, and a missing child descriptor while the parent remains uncertain.

No new card, screen, modal or toolbar was added. No style declarations, global tokens, typography, palettes, icons, spacing, fixed control sizes or scroll geometry changed. The complete Active Shift stylesheet is byte-identical to the base. Headers, navigation, summary card, other Native screens, Dashboard and both Web apps are untouched.

`render-comparison.json` records 144 deterministic before/after host-tree comparisons against the exact base: nine states (ACTIVE, CONFIRMING, SUBMITTING, UNCERTAIN, CHECKING STATUS, DENIED, EXPIRED, PENDING, ENDED), EN/AR, Light/Dark, 320/390 width inputs and font scales 1/1.5. Ordinary ACTIVE/CONFIRMING/SUBMITTING/ENDED trees are identical. Recovery comparisons verify parity outside the feedback region except for checking-state busy behavior; checking explicitly asserts both existing recovery controls are busy. The file records hashes and localized feedback, and the test regenerates it.

The existing pure render harness was extended with an optional baseline reference and viewport/font inputs; its default behavior remains unchanged. This evidence uses resolved React Native host trees, **not an Android layout engine or screenshots**. Text remains unconstrained by line limits/fixed feedback height, but actual text wrapping, clipping, overlap and TalkBack behavior require Android acceptance. These are source/test verified, not physically accepted.

## E. Executed verification

Commands below run from the repository root with the repository-pinned `corepack pnpm` 10.34.5. Counts are tests unless marked as a check. Suites overlap intentionally.

| Command | Passed | Failed | Skipped | Result |
| --- | ---: | ---: | ---: | --- |
| `corepack pnpm --filter @valet/employee-client test` | 897 | 0 | 0 | PASS; 103 files, includes 47 new recovery/fence tests |
| `corepack pnpm --filter @valet/valet-native test` | 1700 | 0 | 0 | PASS; 241 files |
| `corepack pnpm --filter @valet/valet-native exec vitest run test/native-shift-recovery-freeze.test.ts test/native-shift-presence-status.test.tsx` | 11 | 0 | 0 | PASS after final bounded feedback wording; includes 144 comparisons |
| `corepack pnpm test:platform` | 61 | 0 | 1 | PASS; architecture/capacity harness, 5 files |
| `corepack pnpm architecture:check` | 1 check | 0 | 0 | PASS; existing grandfathered-file warnings only |
| `corepack pnpm --filter @valet/employee-client typecheck` | 1 check | 0 | 0 | PASS |
| `corepack pnpm --filter @valet/valet-native typecheck` | 1 check | 0 | 0 | PASS |
| `corepack pnpm --filter @valet/employee-client lint` | 1 check | 0 | 0 | PASS |
| `corepack pnpm --filter @valet/valet-native lint` | 1 check | 0 | 0 | PASS |
| `corepack pnpm --filter @valet/contracts build` | 1 build | 0 | 0 | PASS; existing Native Metro dependency |
| `corepack pnpm --filter @valet/employee-client build` | 1 build | 0 | 0 | PASS |
| Android Hermes export command below | 1 export | 0 | 0 | PASS; local `.hbc`, no APK or deployment |
| `git diff --check` | 1 check | 0 | 0 | PASS |
| Android device/emulator layout and TalkBack acceptance | — | — | — | NOT RUN; tooling/device unavailable |
| API/PostgreSQL runtime tests | — | — | — | NOT RUN; no backend/schema changes; source contract review completed |

```sh
EXPO_NO_DOTENV=1 \
EXPO_PUBLIC_API_ORIGIN=http://127.0.0.1:3001 \
EXPO_PUBLIC_CUSTOMER_APP_ORIGIN=https://customer.example.invalid \
CI=1 corepack pnpm --filter @valet/valet-native exec expo export \
  --platform android --max-workers 2 \
  --output-dir /tmp/issue345-android-hermes-final
```

Origins above are synthetic bundle-only inputs. No service is contacted through them. Dotenv loading is disabled. The export is build evidence, not Android runtime acceptance.

One interim full Native run timed out the existing appearance test at its 5-second limit while tests/builds competed for resources. The isolated unchanged test passed, then the complete Native suite passed. No timeout configuration or unrelated failing test was modified. In-scope implementation/fixture failures found during development were corrected before the successful runs above. The platform suite's existing skipped test is the Windows Get-Process integration on this POSIX worker.

Focused coverage includes lost success, one-time settlement, denial reason/null result selector, fresh-context gating, policy transition, expiry/exception states, pending/explicit approved continuation, 502/503/408/network failures, malformed/missing committed evidence, guard feedback, concurrent status/retry, late GET/context responses, identity/scope/background fences, restart, cleanup, and exact three-decimal cash/previous-Shift rejection. Existing package tests cover normal End/Start, cash validation, offline/open-work guards, presence requirements, persistence and role/tenant fences.

## F. Git delivery

The implementation commit and final local/remote SHAs are recorded in the delivery response (a commit cannot embed its own SHA). Delivery is a normal commit and non-forced push of this dedicated branch. No PR, merge, deployment, issue closure or unrelated branch operation is authorized/performed.

## G. Remaining limitations

`adb` and `emulator` are absent, known Android SDK paths are absent, and `/dev/kvm` is unavailable. No physical-device screenshots, installed APK origin check, TalkBack interaction, live API correlation or financial/audit row inspection was performed. No Android runtime acceptance is claimed.

Unknown/pending/malformed committed evidence and missing/ambiguous/foreign current authority intentionally remain unresolved. A missing descriptor does not grant permission to fabricate success or start another mutation. These outcomes have explicit feedback and preserve the safety boundary.

No production or QA service was accessed or mutated. Only synthetic fixtures and local build artifacts were used. No messages/provider calls were made.

## H. Final status

Implementation: complete within the authorized client repair.
Tests: available focused checks pass; device acceptance NOT RUN.
UI freeze: source and deterministic host-tree verified; physical acceptance pending.
Push: final delivery response records verified remote equality.
PR / merge / deployment / production access / issue closure: none.

## Exact changed-file inventory

- `apps/valet-native/src/shift/native-active-shift-panel.tsx`
- `apps/valet-native/src/shift/native-shift-presence-copy.ts`
- `apps/valet-native/src/shift/native-shift-presence-revalidate.ts`
- `apps/valet-native/src/shift/native-shift-presence-runtime.ts`
- `apps/valet-native/src/shift/native-shift-presence-status.tsx`
- `apps/valet-native/src/shift/native-shift-runtime.ts`
- `apps/valet-native/test/appearance-render-evidence.ts`
- `apps/valet-native/test/native-active-shift-panel.test.tsx`
- `apps/valet-native/test/native-shift-presence-connectivity-fixture.ts`
- `apps/valet-native/test/native-shift-presence-connectivity.test.ts`
- `apps/valet-native/test/native-shift-presence-test-fixture.ts`
- `apps/valet-native/test/native-shift-recovery-freeze.test.ts`
- `docs/validation/issue-345/REPORT.md`
- `docs/validation/issue-345/render-comparison.json`
- `docs/validation/issue-345/verification.txt`
- `packages/employee-client/src/employee-shift-end-attempt.ts`
- `packages/employee-client/src/employee-shift-end-form.ts`
- `packages/employee-client/src/employee-shift-end-reconciliation.test.ts`
- `packages/employee-client/src/employee-shift-end-recovery-fences.test.ts`
- `packages/employee-client/src/employee-shift-end-recovery-fixture.ts`
- `packages/employee-client/src/employee-shift-end-recovery.ts`
- `packages/employee-client/src/employee-shift-end-session.ts`
- `packages/employee-client/src/employee-shift-end-state.ts`
- `packages/employee-client/src/employee-shift-end-types.ts`
- `packages/employee-client/src/employee-shift-presence-check.ts`
- `packages/employee-client/src/employee-shift-presence-dispatch.ts`
- `packages/employee-client/src/employee-shift-presence-parent-fence.ts`
- `packages/employee-client/src/employee-shift-presence-recovery.ts`
- `packages/employee-client/src/employee-shift-presence-result.ts`
- `packages/employee-client/src/employee-shift-presence-session.ts`
- `packages/employee-client/src/employee-shift-presence-types.ts`
- `packages/employee-client/src/employee-shift-presence-workflow.ts`
