# GPS-B mocked/simulated signal contract correction — Issue #257

Date: 2026-10-04. Base: fetched `origin/main`
`53d00801a39ae4f8ad7c6b0fb5031e9abde96614`.
Branch: `fix/257-presence-mocked-signal-contract`, created directly from that
baseline with a clean working tree. This is a shared-contract/server correction;
GPS-C acquisition and GPS-D remain outside this task.

## Pre-code contract ledger

| Behavior                                                                | Authority                                     | Identity, persistence, retry and privacy                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Optional nested measurement.mocked boolean, true/false/absent preserved | Latest owner task 3–4/10; LOCKED              | Existing MEASURED shape and exact User/member/Organization/Location/action/target; strict shared parsing            |
| Signal alone cannot change evaluation                                   | Owner 5/11; DEC-099 evaluator; LOCKED         | Current policy, zones, accuracy and freshness remain the only core evaluation rules; no new classification          |
| Signal participates in protected request HMAC                           | Owner 6/12; DEC-099 durable operation; LOCKED | Same exact Operation with changed signal conflicts; raw input transient, only digest retained                       |
| Preserve old absent-field HMAC bytes                                    | Owner 3/8/9/12/16; DERIVED compatibility      | Append true/false only when provided; existing v1 absent tuple, target identity and retained-key recovery unchanged |
| No raw signal storage or recovery projection                            | Owner 7–8; DEC-099/100 privacy; LOCKED        | No migration, source column, audit/log/analytics/history/body or response expansion                                 |
| Native/Web/Dashboard/camera/attestation/strict rollout                  | Owner 15/19; FORBIDDEN                        | No read/change to apps/valet; no client/dependency or release-gate work                                             |

Affected entities: transient ShiftPresenceMeasurement, existing scoped
ShiftPresenceOperation request identity and Shift Start/End command input.
No ValetSession, Task/Dispatch or Shift transitions change. No new authorization,
DB constraint/index, Company setting or Location override is necessary. Backend
authentication/ownership/locks/atomic mutation and history ordering remain intact.
No unresolved product-policy choice under the explicit owner correction.

Baseline target physical line counts: shared measurement source 111; request/intent
fingerprint source 143; existing fingerprint tests 46; evaluator tests 69. Focused
new tests will remain below 300 lines; no unrelated extraction is necessary.

## Implemented contract and compatibility

The existing strict nested measurement now accepts:

```ts
z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().finite().positive(),
  capturedAt: z.string().datetime({ offset: true }),
  mocked: z.boolean().optional(),
}).strict();
```

`true` means the platform positively reports mocked/simulated. `false` means the
platform positively reports not mocked/simulated; it is not proof of authentic
coordinates. Absence means unsupported/not provided and remains absent. Strings
(`"true"`, `"false"`), numbers (0/1), null, arrays, objects and arbitrary unknown
measurement fields reject. Flattened evidence-level `mocked` rejects. START/END
operation-selector equality still applies to all three values.

The MEASURED HMAC evidence tuple remains
`[kind, challengeId, clientSampleId, canonicalCapturedAt, latitude, longitude, accuracyMeters]`
when the signal is absent. A supplied boolean adds a final tuple element. Tuple
length distinguishes absence from false; the boolean distinguishes false from
true. The outer v1 tuple, target fingerprint and non-MEASURED variants do not
change. The frozen pre-correction absent digest is
`04a285122810ba53eadf1c37279d087c89a4536303308437db8515b2f8fc2791` for the synthetic
fixture in `shift-presence-mocked-fingerprint.test.ts`. Identical JSON round trips
remain deterministic. Retained deployment keys resolve pending and terminal
attempts after rotation for all three values.

The evaluator algorithm is unchanged. An otherwise identical fix has the same
complete inside/outside/edge/inaccurate/stale/future/invalid/configuration result
for all three signal values. `mocked=true` is not automatically rejected;
`mocked=false` is not an authenticity decision. Advanced U257-H attestation is
deferred. Real synthetic START/END requests under REQUIRE and WARN_ONLY prove
that current policy/evaluation still decides the final result.

No schema, migration, constraint, index, permission, audit shape or retention
clock changed. Only the protected request HMAC is retained for request identity.
Full Operation/Challenge/Decision/audit/exception rows, HTTP success/recovery/error
projections and captured console output were checked for raw fix/source fields
in the tested success and denial paths. Committed recovery retains `summary:null`;
measured denial retains only its existing classification/reason summary. Ordinary
Shift responses remain strict and unchanged. Exact retries recover their original
result; changing only the source signal returns PRESENCE_OPERATION_CONFLICT.

Legacy clients omitting `mocked` preserve their existing contract and digest.
B1 guidance, B2 denial, B3 fresh Exception B, operationId correlation,
OFF_NO_EVIDENCE, WARN_ONLY missing evidence, strict PRESENCE_REQUIRED,
NO_EFFECT_CONVERGENCE, END cash binding, anti-abuse, retention and DEC-100 behavior
remain covered by the focused regression suites below.

## Exact changed-file inventory

| File                                                             | Purpose                                                            | Physical authored-code lines |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| packages/contracts/src/shift-presence.ts                         | Optional strict boolean; standard formatting of the touched source | 201                          |
| packages/contracts/src/shift-presence-mocked.test.ts             | Parsing, strictness and selector-equality tests                    | 103                          |
| apps/api/src/modules/shifts/shift-presence-fingerprint.ts        | Append supplied boolean to protected MEASURED identity             | 145                          |
| apps/api/test/shift-presence-mocked-fingerprint.test.ts          | Tri-state, determinism, target and legacy digest tests             | 75                           |
| apps/api/test/shift-presence-mocked-evaluator.test.ts            | Existing algorithm parity                                          | 70                           |
| apps/api/test/shift-presence-mocked-test-helper.ts               | Synthetic scoped HTTP fixture; no hidden assertions                | 56                           |
| apps/api/test/shift-presence-mocked-http.integration.test.ts     | Real Start/End acceptance, denial, warning, retries and strictness | 192                          |
| apps/api/test/shift-presence-mocked-recovery.integration.test.ts | Lost success response, restart, rotation and privacy               | 139                          |
| apps/api/test/shift-presence-mocked-denial.integration.test.ts   | Lost denial response, restart and minimized privacy                | 117                          |
| docs/validation/GPS_B_PUBLIC_CONTRACT.md                         | Public signal semantics and compatibility                          | Documentation                |
| docs/validation/GPS_B_MOCKED_SIGNAL_CONTRACT_REPORT.md           | This focused evidence/handoff report                               | Documentation                |

A comparison against the formatted baseline plus the single optional boolean
confirmed there are no other semantic changes to `shift-presence.ts`. Every
changed authored-code file is below 300 lines; no extraction/baseline exception
or formatting compression was used.

## Validation commands and results

Executed in Windows PowerShell from the repository root. PostgreSQL commands used
the task-owned `postgres:17-alpine` container `valet-gpsb-mocked-20261004`, bound
only to loopback port 55443; the existing developer container was untouched.
The owned harness applied real versioned migrations and provisioned runtime
roles on disposable test databases. Strict modes were opened only by the existing
owner-only disposable fixture helper, never by a production migration or policy.

```powershell
pnpm --filter @valet/contracts exec vitest run src/shift-presence-mocked.test.ts src/shift-presence.test.ts src/shift-presence-public.test.ts src/shift-presence-consumer.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/shift-presence-mocked-fingerprint.test.ts test/shift-presence-mocked-evaluator.test.ts test/shift-presence-fingerprint.test.ts test/shift-presence-evaluator.test.ts test/shift-presence-retention.test.ts test/shift-presence-audit-projection.test.ts
$env:TEST_DATABASE_URL='postgresql://valet:valet@127.0.0.1:55443/valet'
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-mocked-recovery.integration.test.ts test/shift-presence-enforcement.integration.test.ts test/shift-presence-consumer-policy.integration.test.ts test/shift-presence-consumer-recovery.integration.test.ts test/shift-presence-consumer-continuation.integration.test.ts test/shift-presence-no-evidence-recovery.integration.test.ts test/shift-presence-no-evidence-fences.integration.test.ts test/shift-presence-convergence-proof.integration.test.ts test/shift-presence-anti-abuse.integration.test.ts test/shift-presence-anti-abuse-privacy.integration.test.ts test/shift-presence-maintenance.integration.test.ts test/shift-presence-approver.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-mocked-http.integration.test.ts test/shift-presence-mocked-denial.integration.test.ts
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-presence-privacy.integration.test.ts src/shift-presence-release-gate.integration.test.ts
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/contracts build
pnpm --filter @valet/api build
node scripts/gps-b-validation.mjs
git diff --check
```

| Final focused run                                               | Result                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Shared contracts                                                | 4 files, 55 tests PASS                                                     |
| API fingerprint/evaluator/retention/audit units                 | 6 files, 44 tests PASS                                                     |
| API recovery/enforcement/compatibility/privacy regression batch | 9 standard files, 64 tests; 3 race-profile files, 19 tests PASS            |
| API mocked HTTP and lost-denial batch                           | 2 files, 26 tests PASS                                                     |
| Database privacy and release gates                              | 2 files, 5 tests PASS                                                      |
| Total, counting each final selected test once                   | 26 files, 213 tests PASS                                                   |
| Both required typechecks and both builds                        | PASS                                                                       |
| GPS-B scoped structure/import/format/lint/diff check            | PASS: 137 authored files, 158 owned files; historical migrations unchanged |
| Exact task-file scope and changed-file 300-line check           | PASS: 11 files; 9 authored-code files                                      |
| git diff --check                                                | PASS                                                                       |

New tests were first run red against the old contract/fingerprint: shared true and
false were rejected, source-aware fingerprints failed, and the valid evaluator
paths rejected the unknown source field. After the minimal correction they pass.
Initial new HTTP assertions incorrectly expected nested error codes, committed
summaries and an Operation `decision_id` column; these test assumptions were
corrected to the existing flat error contract, null committed summary and
`result_decision_id`. No production contract was changed to satisfy those tests.
Additional test invocations attempted during an owned PostgreSQL run were
rejected by the cluster lease; final database invocations ran sequentially without
bypassing ownership or changing timeouts. The existing Node DEP0190 warning is
from the unchanged test harness and did not fail final runs.

## Self-review

Review target: the complete local diff/new files against
`53d00801a39ae4f8ad7c6b0fb5031e9abde96614`, using the VAYLET code-review matrix.
Authority checked: the latest owner correction, binding AGENTS/structure/security
and Definition of Done docs, implementation plan, Accepted DEC-099/100 and GPS-B
public/consumer/no-measurement/convergence contracts. No blocking code finding was
identified in the reviewed scope.

- Security and tenant/Location: unchanged. The shared parser retains selector
  equality. ShiftController resolves the staff principal before parsing and
  command execution. `startInTransaction` proves `authorizeShiftStart` before
  presence binding or `createShift`; `endInTransaction` resolves/locks the owned
  Shift before presence binding or `UPDATE shifts`. Exact recovery compares
  User/member/Organization/Location/action/Shift/target and stored request HMAC.
- Retry/concurrency and database: unchanged transaction/lock/constraint paths.
  New source values participate only in the existing request identity. Tested
  changed-signal retries conflict; exact retries and retained-key recovery pass.
- Abstraction compatibility: the existing shared measurement and fingerprint
  boundaries represent the addition directly; no writer/helper generalization,
  sentinel identifier or new singleton infrastructure.
- Audit/privacy: explicit minimized Decision inserts and evaluator outputs exclude
  raw source/fix; append-only history, atomic Shift/audit and retention remain.
- Downstream boundary: GPS-C can now submit the optional signal through the shared
  contract without a Native-only DTO. Acquisition/attestation remains deferred.
- Architecture/test adequacy/scope: nine focused code files below 300 lines;
  strictness, tri-state identity, geometric checks, real Start/End, lost response,
  restart, key rotation, privacy and affected regressions covered. Scope inventory
  contains only two production sources, focused tests and two validation docs.
- Evidence: local gates passed; actual remote CI and contributor cross-review
  were not observed. The latest task explicitly required focused validation, so
  unrelated full-suite gates and Employee Web-reading checks were not run.

Merge verdict: **BLOCK MERGE** until required repository CI and contributor
cross-review are complete. This task authorizes commit/push only, and no merge,
PR creation or Issue #257 closure is part of the handoff.

## Scope and evidence classification

| Surface                                                    | Result                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Server                                                     | YES: protected MEASURED fingerprint suffix only                                                                                         |
| Shared contracts                                           | YES: optional strict nested boolean only                                                                                                |
| Database/schema/migration                                  | NO / NO / NO                                                                                                                            |
| Raw mocked signal/raw GPS persistence                      | NO / NO                                                                                                                                 |
| Evaluator policy changed                                   | NO                                                                                                                                      |
| mocked=true automatically rejected                         | NO                                                                                                                                      |
| mocked=false treated as authenticity proof                 | NO                                                                                                                                      |
| Native / expo-location added / Dashboard / camera          | NO / NO / NO / NO                                                                                                                       |
| Employee Web read / changed                                | NO / NO                                                                                                                                 |
| GPS-C implemented / GPS-D started / strict rollout enabled | NO / NO / NO                                                                                                                            |
| Merge / PR creation / Issue closure                        | NO / NO / NO                                                                                                                            |
| IMPLEMENTED                                                | YES: scoped contract and fingerprint correction                                                                                         |
| STATIC VERIFIED                                            | YES: typecheck, format, lint, scoped imports/lines/diff                                                                                 |
| LOCAL COMMAND VERIFIED                                     | YES: 213 focused tests, both builds and required gates                                                                                  |
| RUNTIME VERIFIED                                           | YES: real Nest HTTP and PostgreSQL with synthetic fixes                                                                                 |
| FAILURE VERIFIED                                           | YES: real HTTP socket loss after success/denial, new Nest instance recovery, retained keys; no device-spoof or hard-process-crash claim |
| CI VERIFIED                                                | NO: actual remote run not observed; local commands are not CI evidence                                                                  |

The final commit/remote SHA and clean-tree evidence are reported in the final
chat handoff after commit/push, avoiding a self-referential commit SHA in this
document. The branch must remain separate from GPS-C acquisition work.
