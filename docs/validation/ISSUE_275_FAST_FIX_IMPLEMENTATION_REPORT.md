# Issue #275 — Incident Reporting local fast-fix validation

**Baseline:** `origin/main` = `11afb194bbe692e0df3762ee0dc2644d0a0126c5` (fetched 2026-10-17).

**Local branch:** `fix/issue-275-incident-reporting-recovery`

**Local worktree:** `D:\kndoom\valet-platform\tmp\issue-275-fast-fix`

**Integrated code HEAD before this report:** `f8c3e785ce092e22c83073d91f42f76df00fedf8`.

## Root cause and evidence

**Original reported Android Incident submission failure: ROOT CAUSE STILL DEVICE-DEPENDENT / UNCONFIRMED.** The prior physical and MuMu attempts did not capture the actual first client failure stage or confirm a new Incident. The current source trace confirms the production Native composition uses Incident recovery prepare → reserve → report, but the production Android CSPRNG and SecureStore behavior cannot be proven by this local execution. No MuMu, physical-device test, APK build or protected database write was authorized or run.

Three *separate* source-verifiable problems were addressed; **none has been established as the cause of the original Android submission failure**:

1. **Lost preflight evidence:** the generic Native telemetry ring keeps only 200 events and the support view shows 10/20 of the newest. Task queue events can evict every `incident-recovery` stage. A small, closed-allowlist latest-failure-stage field now retains the first error within a submission, independently of ring eviction, and reserves one existing support row for that stage. An explicit next submission resets the stage; canonical success clears it. Fixed outcome text distinguishes a pre-transport block from an attempted reserve/report with unknown result. No raw exception, Incident description, identifier, credential or unrestricted data is retained.
2. **Confirmed local marker race:** `IncidentRecoveryState.restore()` had serialized its read but performed mismatched-identity cleanup outside `serializeStorage`, allowing concurrent `purge()` deletion. The deterministic regression reproduced overlapping deletes before the change (peak concurrent deletes 2, expected 1); read, identity check and deletion now run in one serialized storage operation. Regression covers fresh marker protection after cleanup.
3. **Accepted protocol discrepancy:** canonical Incident Recovery GET silently accepted a nonempty HTTP body although DEC-077 requires empty request content. The controller now rejects unexpected body content before principal lookup/service execution; bodyless GET remains allowed. A focused controller test failed before and passed after.

## Files and commits

**Native telemetry and diagnostics:** `7739aebf`

- `apps/valet-native/src/telemetry/native-incident-failure-stage.ts` (new)
- `apps/valet-native/src/telemetry/native-telemetry-owner.ts`
- `apps/valet-native/src/telemetry/native-telemetry-types.ts`
- `apps/valet-native/src/telemetry/native-support-diagnostics.ts`
- `apps/valet-native/test/issue-275-incident-diagnostic-retention.test.ts` (new)

**Portable recovery serialization:** `3be20cd9` (integrated from independent Worker 2 `97fcda38`)

- `packages/employee-client/src/incident-recovery-state.ts`
- `packages/employee-client/src/incident-recovery-identity-race.test.ts` (new)

**API GET request validation:** `f8c3e785` (integrated from independent Worker 3 `a84cb5e4`)

- `apps/api/src/modules/incidents/incident-recovery.controller.ts`
- `apps/api/test/incident-recovery-controller.test.ts` (new)

## Current integrated validation

The following commands were **run fresh by Prime after all three source commits were integrated**:

| Command | Result |
| --- | --- |
| `pnpm --filter @valet/employee-client exec vitest run src/incident-recovery-identity-race.test.ts src/incident-recovery-preflight.test.ts src/incident-recovery.test.ts` | **3 files, 16/16 PASS** |
| `pnpm --filter @valet/valet-native exec vitest run test/issue-275-incident-diagnostic-retention.test.ts test/native-incident-preflight-stage.test.ts test/native-incident-recovery-store.test.ts test/native-support-diagnostics.test.ts test/native-support-diagnostics-card.test.tsx` | **5 files, 31/31 PASS** |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/incident-recovery-controller.test.ts test/incident-recovery-rollout.test.ts` | **2 files, 5/5 PASS** |
| **Integrated selected tests** | **10 files, 52/52 PASS** |
| `pnpm --filter @valet/employee-client typecheck` | PASS |
| `pnpm --filter @valet/valet-native typecheck` | PASS |
| `pnpm --filter @valet/api typecheck` | PASS |
| Focused ESLint on all changed production and test files in Employee Client, Native and API | PASS |
| `pnpm architecture:check` | PASS, existing unrelated grandfathered line-count warnings |
| `git diff --check` | PASS |

Worker 1 separately ran 55/55 scoped Native tests, Worker 2 16/16 Employee and 4/4 Native tests, and Worker 3 API 6/6 and contracts 3/3. These independent runs are **not added** to Prime's integrated test count.

**Database evidence:** NOT OBTAINED. No disposable PostgreSQL Incident integration exercise was run. **Android runtime evidence:** NOT OBTAINED. No device verification of native secure randomness, SecureStore persistence, mutation/audit creation or the original incident form was performed.

## Security and QA review

- **Security:** read-only Worker 2 reviewed integrated `f8c3e785` against baseline; **P0=0, P1=0** in reviewed scope. It independently reran 21/21 selected tests and checked no unsafe POST retry, preserved marker ordering, fixed-stage telemetry privacy and GET-only recovery semantics. Source-only PASS, not physical acceptance.
- **QA:** independent cross-issue Worker 5 reviewed exact final integrated `f8c3e785`: **P0=0, P1=0** within changed files; source QA PASS with explicit device limitation. It independently reran 8/8 scoped tests (Native retention 5, employee-client race 1, API controller 2) and checked stage evictions, response uncertainty, storage serialization, DEC-077 and untouched Native UI. These additional runs are not added to Prime's integrated counts. Original dedicated security/QA reviewers (Workers 6 and 7) could not start due browser composer startup failure and performed no review; do not count them as completed reviewers.

## Remaining limitations and verdict

- Do not claim the original Android Incident failure fixed. Its first failing runtime stage and authoritative server outcome remain unknown.
- Verify the exact new preflight stage on an approved, matched **physical Android release device**, including genuine `crypto.getRandomValues`, SecureStore write/readback and process-death recovery; confirm exactly one Incident and `INCIDENT_OPENED` audit event and GET-only reconciliation after an ambiguous response.
- The accepted DEC-077 actor/install/tenant/location/Shift binding, strict UUIDv8 CSPRNG, marker durability and no blind protected POST retry have been preserved by source review and focused tests. Device/DB proof remains outstanding.
- No UI/copy/geometry, schema, dependency, migration, configuration or production operations were changed.

**VERDICT: PARTIAL — DEVICE VERIFICATION PENDING**. Source-specific corrections and diagnostics are locally verified; **original device failure remains ROOT CAUSE UNCONFIRMED**.

**Delivery:** locally committed only. No push, PR, GitHub CI, merge, deployment or Issue closure.
