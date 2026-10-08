# Issue #275 — Native Incident preflight and recovery: evidence report

**Task 2 only · code diagnostics / narrow schema guard · physical QA pending**

Date: 2026-10-09

Repository: `veletpro0-lgtm/valet-platform`

Branch: `fix/issue-275-native-incident-preflight`

Verified base `origin/main`: `95ea7f7cb345cfc19df5ec3344911d7f3e41bf11` (includes #272)

Final commit/push: see Git HEAD and remote equality in delivery response.

## Original observation versus confirmed findings

Owner Android physical observation (2026-10-08, Arabic RTL, Incident severity
including CRITICAL): after pressing **Open Incident**, a generic error appeared
without a confirmed reference. The inspected API logs showed no matching
RESERVE_INCIDENT_RECOVERY or REPORT_INCIDENT, and the inspected QA database
showed no newly persisted Incident or intent. **Absence from the inspected
logs is not proof no HTTP request was attempted.** The device's original
exception or first failing preflight stage was not captured.

Repository facts:

- `apps/valet-native/src/incident/native-incident-session.ts` validates the
  in-memory form, calls `IncidentRecoveryState.prepare()`, stores the marker,
  confirms reservation, then sends the existing Incident POST. It has existing
  response-loss and identity-generation fences.
- Production `apps/valet-native/src/auth/native-auth-runtime.ts` constructed
  `IncidentRecoveryState` with the default secure ID provider.
- `packages/employee-client/src/incident-recovery-id.ts` constructs UUIDv8
  from 16 CSPRNG bytes via `globalThis.crypto.getRandomValues` unless a
  provider is injected; it validates version and variant. It throws if unavailable.
- The actual Android **release** JS runtime's `getRandomValues` availability
  has **not been measured**. Node/Vitest capability is not release proof.
- `ExpoIncidentRecoveryStore` retains its dedicated key/service and
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; device-bound write + readback remains
  mandatory. No AsyncStorage/plaintext replacement.
- API reserve / report / recovery behavior and DEC-077 actor-bound intent
  protocol are unchanged by this branch.

## Failure mapping and tested first stage

The original physical failure remains **ROOT_CAUSE_UNVERIFIED_ON_DEVICE**.
These source-level failure scenarios can now be classified deterministically:

| Stage | Simulated condition | First safe failure / postcondition |
| --- | --- | --- |
| `session-detail-transport` | Session detail GET fails | No Incident form/protected POST; preserve existing context-error |
| `session-detail-response` | Session detail shape invalid | No Incident form/protected POST |
| `context` | Native recovery context missing | Context error; zero Incident mutation |
| `input-validation` | Invalid form payload | Input error; zero Incident mutation |
| `storage-read` | SecureStore read rejects | Read error; zero Incident mutation |
| `marker-parse` | Corrupt or already-pending marker | Parse/error; no new ID or mutation |
| `secure-uuid` | Missing/throwing secure CSPRNG | UUID error; zero write/reserve/report |
| `secure-uuid` | Invalid injected ID | Schema rejection before marker write |
| `storage-write` | SecureStore write rejects | Write error; zero reserve/report |
| `storage-readback` | SecureStore readback rejects | Readback error; zero reserve/report |
| `marker-verify` | Durability/readback mismatch | Verify error; zero reserve/report |
| `reserve-transport` | Reservation outcome lost | Dispatch attempted, result unknown; no report POST |
| `reserve-response` | Malformed reservation response | No report POST; preserve marker |
| `reserve-binding` | Reservation binding mismatch | No report POST; preserve marker |
| `report-transport` | Incident POST response lost | Exactly one attempted POST, GET-only recovery |
| `report-response` | Malformed Incident response | No blind POST replay; GET-only recovery |

**The only demonstrated minimal behavioral hardening** is validating an
injected/generated recovery ID through the strict UUIDv8 schema **before**
durable marker write. Previously, an invalid injected ID was first written,
then rejected by readback; the focused red test demonstrated one unexpected
write. After the guard, it is rejected in `secure-uuid` and writes zero
markers. This is not evidence that the Owner's production Android generator
returned an invalid ID; production's default ID factory was already strict.

## Diagnostic design and privacy

The branch reuses the existing fail-open, in-memory bounded Native telemetry
ring. A new allowlisted `recovery/preflight` classification carries only
`operation=incident-recovery`, `errorCode=<fixed-stage>.<fixed-outcome>`
and an enumerated result. Start is represented by `outcome=unknown`; a
failed transport means **dispatched/attempted with unknown server outcome**,
not proof no server mutation occurred.

No exception messages, stack traces, raw incident payloads, user/tenant/
session/incident IDs, secure random bytes, SecureStore contents, plate,
description, authorization headers, device identifier or tokens are emitted.
The observer catches its own failures and cannot interrupt any domain step.
No additional telemetry backend, persistence or analytics provider is added.

The Native runtime composes the same recovery State and HTTP transport through
`native-incident-recovery-runtime.ts`. Native submit uses the identical
input schema, POST body, path, required
`Valet-Incident-Submission-Protocol: actor-bound-intent-v1` header and
canonical response schema, now wrapped by allowlisted stage observation.
No form, recovery screen, translation, style or layout file changes.

## DEC-077/security invariants

- CSPRNG-backed UUIDv8 remains mandatory; no `Math.random`, time-based
  Incident ID, UUIDv4 downgrade, polyfill, new dependency or global patch.
- Exact local marker fields and 24-hour non-sliding soft deadline unchanged.
- SecureStore read → fresh marker/UUID → durable write → verified readback
  before any reserve or report network mutation.
- Only validated actor-bound RESERVED may precede Incident POST; no new route,
  role bypass, client-asserted authority or replay system.
- Canonical FOUND/RESERVED/RETIRED/UNKNOWN and unavailable remain distinct.
- Lost reserve/POST response retains the operation; recovery reads via GET,
  never an automatic new reservation/Incident POST/retirement.
- API still enforces original reporter membership, exact tenant/Location,
  current access and creation-versus-recovery Shift/session differences.
- 15-minute server reservation expiry and Incident/INCIDENT_OPENED transaction
  atomicity unchanged. This branch has zero DB/API production edits.
- Concurrency, process-death and logout/account-swap regression suites remain
  in scope for QA; no physical process-death test was claimed.

## Tests and known external dependencies

Run from the isolated issue worktree:

1. Portable: `pnpm --filter @valet/employee-client exec vitest run src/incident-recovery-preflight.test.ts src/incident-recovery.test.ts`.
2. Native: `pnpm --filter @valet/valet-native exec vitest run test/native-incident-preflight-stage.test.ts test/native-incident-process-death-intent.test.ts test/native-incident-recovery-boundaries.test.ts test/native-incident-marker-submit-fence.test.ts test/native-incident-success-lifecycle.test.ts test/native-incident-repair.test.ts test/native-incident-parity.test.tsx test/native-incident-recovery-telemetry.test.ts test/native-incident-recovery-telemetry-shapes.test.ts test/native-handoff-guest-access-recovery.test.ts test/native-tasks-warm-navigation.test.tsx`.
3. Pure API: `pnpm --filter @valet/api exec vitest run test/incident-recovery-rollout.test.ts` — 3/3 PASS.
4. Lint/typecheck: `pnpm --filter @valet/employee-client typecheck`, `lint`; `pnpm --filter @valet/valet-native typecheck`, `lint`.
5. Repository: `pnpm architecture:check`, `git diff --check`.

Pre-fix proof: the two new classification tests failed 2/2 with an empty
observer event list; then succeeded after stage wiring. An additional
invalid-ID prewrite test failed because the store `write` ran once before
schema rejection; then passed after the explicit prewrite UUIDv8 schema gate.
Existing first-run baseline: Portable 9/9; Native 45/45.

Final focused suite results: **15/15 Portable PASS** (9 existing + 6 new),
**74/74 Native PASS** (13 suites including 13 new stage tests, process death,
marker persistence and T5/#272 regressions), and **3/3 API pure PASS**.
Employee Client and Native typecheck/lint succeeded. `git diff --check`
is required at the final staging gate. Three separate red-test phases showed
five failing cases before fixes: absent UUID/marker-stage diagnostics (2),
invalid-ID writing before rejection (1), and missing session-detail stage
instrumentation (2). All now pass.

PostgreSQL integration suites that create and mutate
a disposable database must run only on an explicitly authorized isolated
PostgreSQL instance with unique child DB/role and cleanup proof. They were
**NOT RUN** here; do not infer SQL/audit concurrency physical proof from mocks
or pure API checks.

The architecture checker fails on the same two unrelated files against the
unmodified `#272` worktree at the exact base SHA: the 328-line
`packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts`
and portable `window` use in
`packages/employee-client/src/employee-shift-presence-local-provenance.test.ts`.
Neither file is touched here. No added #275 code/test file exceeds 300 lines.

## Independent review and unresolved code findings

- **Reviewer A (cryptography, durable marker, no replay): FINAL PASS.**
  Independently verified UUIDv8/CSPRNG fail-closed behavior at
  `packages/employee-client/src/incident-recovery-id.ts:3-22`, strict
  pre-write injected-ID validation at
  `incident-recovery-state.ts:70-83`, and confirmed SecureStore
  write/readback before reservation at `incident-recovery-store.ts:23-46`.
  Observer failures cannot affect protected work; no sensitive telemetry.
- **Reviewer B (API/transport/authorization): FINAL PASS.** Verified the
  unchanged actor-bound header, single reservation POST, reserved response
  schema and one report POST through
  `incident-recovery-transport.ts:18-48` and
  `native-incident-preflight.ts:36-55`; no API/schema/migration diff.
- **Independent Reviewer B performed the Reviewer C UI-freeze checklist:
  PASS.** Actual separate Reviewer C worker failed to start and did **not**
  submit an independent report; do not count it as a third reviewer. Reviewer
  B confirmed no changes to form/copy/styles/i18n/appearance, and existing
  session phase mapping plus parity tests are preserved.

The first security-review iteration found an invalid injected UUID that could
reach marker write; the strict prewrite schema check resolved it. A separate
interim reviewer found missing session-detail stage emissions; the narrow
GET/schema wrapper resolved them and the final Native stage tests passed.
**Remaining code P0/P1: none reported by the two completing reviewers.**

## ZERO_UNAUTHORIZED_UI_DELTA evidence

No edits to Native Incident form, form copy, dictionary, styles, recovery
screens, navigation, Light/Dark palettes, RTL/LTR or accessibility controls.
The existing `NativeIncidentSession` publishes exactly its preexisting form,
reserving, submitting, success or recovery phases; only the transport and
validation calls are factored through diagnostic wrappers. Native Incident
parity tests validate the unchanged render behavior. Actual device/screenshot
approval remains **PHYSICAL_QA_PENDING**.

## Android Owner-run physical QA packet

Only with separate Owner-approved matching test/release APK and synthetic QA
Incident/session data (not production/customer cases):

1. Record branch SHA, APK build number/hash, API SHA, Android OS/OEM/model,
   locale/theme, synthetic role and anonymized authorized Location.
2. Confirm release-runtime secure `getRandomValues` by attempting a normal
   valid Incident preflight; use **only the bounded stage outcome**, never raw
   random bytes, IDs, descriptions or exception strings. Repeat after process
   restart. Success must reach `secure-uuid.success` and strict UUIDv8
   validation, with no insecure fallback.
3. In Arabic RTL/Dark (original case), select an authorized non-terminal test
   ValetSession, type, CRITICAL severity and harmless test description.
   Submit once; record first stage error if any, canonical reference
   confirmation and the authorized QA database Incident/audit counts.
4. Repeat EN Light, EN Dark, AR Light and AR Dark for existing form, loading,
   error, success and recovery presentation, with no visual changes.
5. SecureStore: restart app, confirm marker recovery via GET only and no
   automatic reserve/report. If an authorized QA fault injection is available,
   distinguish read/write/readback failure; confirm zero mutation on
   preflight failure. Do not wipe markers to manufacture a new attempt.
6. Under a controlled staging-only lost reservation/POST response, restore
   connection and read canonical recovery outcome. Confirm no duplicate
   Incident or INCIDENT_OPENED audit, no blind mutation replay.
7. Account/scope: wrong membership or revoked access fails closed; original
   reporter can GET-only recover after Shift end/session completion, but
   cannot create a new Incident after eligibility ends.

Evidence template:

```text
Issue: #275
Source SHA / API SHA / APK variant, build number and hash:
Android version / OEM / model (no unique device ID):
Locale / theme / synthetic role / anonymized Location:
Test case / elapsed time:
First bounded stage and outcome / transport attempted yes-no-unknown:
Authorized canonical response classification:
Incident count / INCIDENT_OPENED audit count:
Screen evidence filename (redacted) / PASS-FAIL-UNKNOWN:
```

Never export raw customer/employee/incident IDs, descriptions, plates,
credentials, headers, secret material, SecureStore values or whole exception
logs. Do not infer any missing event from an API log gap.

## Remaining Owner decisions / release gates

**Physical first failing stage remains unknown.** If the actual Android release
runtime lacks a genuine secure CSPRNG, stop the crypto slice and seek separate
approval for a narrowly compatible native secure-random provider, lockfile/
autolinking effects and any required Accepted DEC-077 amendment. Do not
introduce a speculative adapter in this branch.

Dependency changes: **NONE**. Contract/protocol/schema/migration changes:
**NONE**. UI change: **ZERO**. APK created: **NO**. Android physically tested:
**NO**. PR/merge/deploy/issue close: **NO**. Issue remains **OPEN**.

This branch provides code-reviewable diagnostics and an independently
demonstrated prewrite UUIDv8 guard; it does **not** certify the original
physical Incident submission defect as fixed.
