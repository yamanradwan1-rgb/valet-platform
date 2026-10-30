# Issue #377 — Native Incident recovery lifecycle fencing

Canonical finding: `C011-W2-CANDIDATE-001` (P2).
Baseline: `5993cd7d5b98547d9016f60c99a75e5cf99aed6f`, fetched `origin/main`.
Branch: `fix/issue-377-native-incident-recovery-fence`.

## Contract and scope

The Owner authorizes the focused implementation through commit and verified push.
DEC-077, especially sections 9 and 12–14, requires exact installation/member/
Organization/Location marker binding, identity-generation fencing, confirmed
cleanup, GET-only recovery, no Incident-body persistence and no mutation replay.
Existing resolution telemetry is recorded exactly once by the resolution helper.
No server permissions, public DTO, business transition, UI, migration or dependency
change is authorized. The 24-finding audit report is immutable for this task.

## Investigation and reproduction before implementation

The Native session checks generation before, but not after, awaited resolution
cleanup. Acknowledge/purge also publish after cleanup without rechecking. The
background path returns before fencing when recovery snapshots have no target.
The auth runtime's context resolver can also finish out of order, and its purge
continuation/error handler can apply a stale fence.

Controlled deferred-promise tests reproduce publication without sleeps: hold
restore/retire/acknowledge/purge cleanup, establish another actor, Organization,
Location or installation, then release or reject the old cleanup. The initial
32-case suite reports **25 failures / 7 passes**, exit 1. Those failures are the
intended baseline reproductions, not adjusted expectations.

Storage has a shared serialized queue. Cleanup/purge already enqueued before a
replacement write cannot overtake it. Separately, an old cleanup enqueued after
a replacement prepare can delete that replacement because `clearResolved()` has
no expected-marker binding. A real `IncidentRecoveryState` plus synthetic store
test exercises both orderings; this is in-memory persistence evidence, not a
SecureStore/device corruption claim.

## Implemented correction

Recheck session generation after every awaited recovery result and before marker,
snapshot or subscriber publication, including failure branches. Stale acknowledge
must return false so its UI callback cannot close a replacement workflow. Fence
background work even when its snapshot target is null. Move submission marker
assignment after its existing generation check.

Preserve the existing serialized store boundary and add optional exact-marker
matching inside it for resolved cleanup; Native callers pass the captured marker.
No-argument cleanup and identity purge retain their established behavior. A
mismatched newer marker is not deleted and uses the existing cleanup-failure path.
This mechanically preserves DEC-077 ownership; it adds no replacement/replay policy.

Use a focused Native context observer to fence resolver and purge continuations
by the latest callback plus authenticated generation. This extraction keeps the
295-line auth runtime within the 300-line rule. Preserve public Native session
interfaces and existing telemetry emission sites.

## Implementation boundaries and files

- `apps/valet-native/src/incident/native-incident-session.ts`: post-await
  generation checks, stale-acknowledge false result, background fence even for
  targetless recovery, generation-bound prepared-marker assignment, and a read-only
  lifecycle fence for the operational-context resolver.
- `apps/valet-native/src/incident/native-incident-recovery-resolution.ts`: pass the
  exact resolved marker into cleanup; preserve telemetry emission sites.
- `apps/valet-native/src/incident/native-incident-context-observer.ts`: order
  operational-context callbacks by callback sequence, authenticated generation and
  session lifecycle; fence pending resolution and purge continuations. A stale
  identity callback does not cancel a current identity callback. Identity purge
  and disposal explicitly invalidate the observer.
- `apps/valet-native/src/auth/native-auth-runtime.ts`: wire that observer to the
  existing singleton recovery owner; retain existing context-selection policy.
- `apps/valet-native/src/incident/native-incident-load.ts`: move form/context-error
  snapshot construction from the session into its existing detail loader. This
  keeps the session below 300 lines without changing the error or telemetry contract.
- `packages/employee-client/src/incident-recovery-state.ts` and
  `incident-recovery-store.ts`: snapshot the optional expected marker before
  enqueueing, compare all marker fields within the existing storage queue, retain
  read/delete/readback failures and preserve the no-argument API and identity purge.
- New Native tests: `native-incident-recovery-fence.test.ts`,
  `native-incident-recovery-storage-fence.test.ts`,
  `native-incident-context-observer.test.ts`,
  `native-incident-context-lifecycle.test.ts`, plus the shared
  `native-incident-fence-test-fixture.ts` under `apps/valet-native/test/`.
- New portable tests:
  `packages/employee-client/src/incident-recovery-cleanup-binding.test.ts`.
- This validation record; no other files belong to the task.

## Interleavings and evidence limits

| Boundary held                                                                | Invalidation/winner                                | Asserted outcome                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Restore result application / retire resolution / acknowledge cleanup / purge | New actor, Organization, Location or installation  | New snapshot and marker retained; no old subscriber notification                      |
| Restore read                                                                 | Identity purge                                     | No resolution cleanup or stale publication                                            |
| Cleanup success or rejection                                                 | Replacement context                                | New state retained; stale acknowledge returns false; purge rejection still propagates |
| Cleanup                                                                      | Clear, explicit fence, background                  | No later stale publication, including targetless recovery                             |
| Acknowledge and purge together                                               | New observation; both cleanup completion orders    | New observation wins                                                                  |
| Operational-context resolution                                               | New callback, new identity, clear/purge/background | Old resolver cannot start recovery or cleanup                                         |
| Context invalidation purge or restore error                                  | New callback or background                         | No stale invalidated/unavailable fence                                                |
| Cleanup enqueued before purge and replacement prepare                        | Existing serialized storage order                  | Replacement survives (baseline counterevidence)                                       |
| Old exact-marker cleanup enqueued after replacement prepare                  | Replacement marker                                 | Mismatch rejects without deleting replacement                                         |

The late-cleanup test exercises the cleanup API directly with a real portable
state owner and a synthetic store. It proves unbound deletion at that API, not
that the Native production caller automatically produces that queue ordering.
The publication reproductions exercise the actual Native session with deferred
recovery ports. Store safety depends on the established single recovery owner and
its serialized queue; this is not a cross-process atomic compare-and-delete claim.

Existing fresh-owner/process-restart tests preserve serialized marker state across
JavaScript owner instances and verify GET-only recovery after simulated response
loss. They do not kill an OS process. Existing submission tests preserve marker
write/readback -> reserve -> explicit POST, single submission while writing, and
zero reservation/POST when purge or background wins. Recovery retry, retirement
and acknowledgment do not replay an uncertain Incident submission. Resolution
telemetry remains one event per executed resolution in the tested paths.

## Verification record

Final implementation SHA: `28c5d7b9a3775e276c93f18a6c109a8187c819bc`.

All commands below were executed locally. Vitest commands use the repository's
installed runner and package configuration directly, with one worker; no remote
CI or broad repository test suite was requested. Exact stdout, arguments, working
directory and exit code are retained in ignored `tmp/issue-377-evidence/*.json`.

| Gate                                                      | Result                                                             | Exit | Evidence                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ---- | ------------------------------------------------------- |
| Pre-fix Native publication reproduction                   | 25 failed / 7 passed, expected baseline failure                    | 1    | Synthetic deferred promises, actual session             |
| Pre-fix storage orderings                                 | 1 failed / 1 passed; late cleanup observed replacement become null | 1    | Actual portable state, synthetic store                  |
| Final Native Incident + related identity/lifecycle suites | 164 passed / 0 failed, 21 files                                    | 0    | Synthetic JS/component tests; not mounted Native/device |
| Portable recovery suites                                  | 32 passed / 0 failed, 5 files                                      | 0    | Actual state/queue and synthetic ports                  |
| Native TypeScript                                         | Passed                                                             | 0    | Static                                                  |
| Shared-client TypeScript                                  | Passed                                                             | 0    | Static                                                  |
| Scoped ESLint, zero warnings allowed                      | Passed                                                             | 0    | Static                                                  |
| Scoped formatting                                         | Passed                                                             | 0    | Static                                                  |
| Repository architecture / 300-line policy                 | Passed; existing grandfather warnings only                         | 0    | Static                                                  |
| `git diff --check`                                        | Passed                                                             | 0    | Static                                                  |

The final test sets include 79 new cases (67 Native, 12 portable). No product defect
was hidden by weakening an assertion. The pre-fix failures were intentional
reproductions; the corrected code passed their rechecks.

### Exact baseline reproduction commands

Run after adding the reproduction tests to the baseline, before product edits:

`reproduction-before` — cwd `/workspace/valet-platform/apps/valet-native`, expected exit 1:

```bash
node ../../node_modules/vitest/vitest.mjs run test/native-incident-recovery-fence.test.ts --maxWorkers 1
```

`storage-before-observed` — cwd `/workspace/valet-platform/apps/valet-native`, expected exit 1:

```bash
node ../../node_modules/vitest/vitest.mjs run test/native-incident-recovery-storage-fence.test.ts --maxWorkers 1
```

### Exact successful commands

`native-focused-final` — cwd `/workspace/valet-platform/apps/valet-native`, exit 0:

```bash
node ../../node_modules/vitest/vitest.mjs run \
  test/native-incident-context-lifecycle.test.ts \
  test/native-incident-context-observer.test.ts \
  test/native-incident-marker-submit-fence.test.ts \
  test/native-incident-parity.test.tsx \
  test/native-incident-preflight-stage.test.ts \
  test/native-incident-process-death-intent.test.ts \
  test/native-incident-recovery-boundaries.test.ts \
  test/native-incident-recovery-context.test.ts \
  test/native-incident-recovery-fence.test.ts \
  test/native-incident-recovery-storage-fence.test.ts \
  test/native-incident-recovery-store.test.ts \
  test/native-incident-recovery-telemetry-shapes.test.ts \
  test/native-incident-recovery-telemetry.test.ts \
  test/native-incident-repair.test.ts \
  test/native-incident-success-lifecycle.test.ts \
  test/issue-275-incident-diagnostic-retention.test.ts \
  test/native-contextual-lifecycle-fences.test.ts \
  test/native-production-lifecycle-owner.test.ts \
  test/native-production-lifecycle-authority.test.ts \
  test/native-production-lifecycle-auth-ready.test.ts \
  test/identity-state-boundary.test.ts \
  --maxWorkers \
  1
```

`portable-regressions` — cwd `/workspace/valet-platform/packages/employee-client`, exit 0:

```bash
node ../../node_modules/vitest/vitest.mjs run src/incident-recovery.test.ts src/incident-recovery-identity-race.test.ts src/incident-recovery-cleanup-binding.test.ts src/incident-recovery-preflight.test.ts src/incident-recovery-provider.test.ts --maxWorkers 1
```

`native-typecheck` — cwd `/workspace/valet-platform/apps/valet-native`, exit 0:

```bash
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

`portable-typecheck` — cwd `/workspace/valet-platform`, exit 0:

```bash
node node_modules/typescript/bin/tsc -p packages/employee-client/tsconfig.json --noEmit
```

`eslint` — cwd `/workspace/valet-platform`, exit 0:

```bash
node node_modules/eslint/bin/eslint.js \
  apps/valet-native/src/incident/native-incident-context-observer.ts \
  apps/valet-native/test/native-incident-context-lifecycle.test.ts \
  apps/valet-native/test/native-incident-context-observer.test.ts \
  apps/valet-native/test/native-incident-fence-test-fixture.ts \
  apps/valet-native/test/native-incident-recovery-fence.test.ts \
  apps/valet-native/test/native-incident-recovery-storage-fence.test.ts \
  packages/employee-client/src/incident-recovery-cleanup-binding.test.ts \
  apps/valet-native/src/auth/native-auth-runtime.ts \
  apps/valet-native/src/incident/native-incident-load.ts \
  apps/valet-native/src/incident/native-incident-recovery-resolution.ts \
  apps/valet-native/src/incident/native-incident-session.ts \
  packages/employee-client/src/incident-recovery-state.ts \
  packages/employee-client/src/incident-recovery-store.ts \
  --max-warnings=0
```

`format-check` — cwd `/workspace/valet-platform`, exit 0:

```bash
node node_modules/prettier/bin/prettier.cjs \
  --check \
  apps/valet-native/src/incident/native-incident-context-observer.ts \
  apps/valet-native/test/native-incident-context-lifecycle.test.ts \
  apps/valet-native/test/native-incident-context-observer.test.ts \
  apps/valet-native/test/native-incident-fence-test-fixture.ts \
  apps/valet-native/test/native-incident-recovery-fence.test.ts \
  apps/valet-native/test/native-incident-recovery-storage-fence.test.ts \
  packages/employee-client/src/incident-recovery-cleanup-binding.test.ts \
  apps/valet-native/src/auth/native-auth-runtime.ts \
  apps/valet-native/src/incident/native-incident-load.ts \
  apps/valet-native/src/incident/native-incident-recovery-resolution.ts \
  apps/valet-native/src/incident/native-incident-session.ts \
  packages/employee-client/src/incident-recovery-state.ts \
  packages/employee-client/src/incident-recovery-store.ts
```

`architecture` — cwd `/workspace/valet-platform`, exit 0:

```bash
node scripts/architecture-check.mjs
```

`diff-check` — cwd `/workspace/valet-platform`, exit 0:

```bash
git diff --check
```

## Adversarial self-review

Review target: complete Issue #377 diff against
`5993cd7d5b98547d9016f60c99a75e5cf99aed6f`, including new files and tests.
Contracts checked: AGENTS, source-of-truth, engineering/security rules, Definition
of Done, collaboration, structure rules, decision log and Accepted DEC-077.
The VAYLET planning, implementation and code-review guardians were applied by a
single agent; no subagent delegation occurred.

| Review pass                                      | Verdict                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Scope / decision fidelity / internal consistency | Focused lifecycle and marker-ownership correction; no new product policy                                                 |
| Security / actor / Organization / Location       | No new P0/P1/P2/P3 finding in the reviewed diff; tested stale publication suppressed                                     |
| Mutation ordering / retry / concurrency          | Exact ownership checked before cleanup in the same queue; current-generation error behavior retained; no replay added    |
| Abstraction compatibility                        | Optional cleanup argument is additive; no-argument callers and purge preserved; all existing shared recovery suites pass |
| Database / server authority                      | No schema, SQL, migration, endpoint, authorization or server state-machine change                                        |
| Audit / privacy / telemetry                      | No payload persistence/logging added; existing telemetry sites unchanged; duplicate-event regression tests pass          |
| Downstream boundary                              | Native consumes the same portable recovery state; no common-to-feature dependency                                        |
| Architecture / 300-line                          | Every touched/new code file <=300; auth runtime 295 and session 298 lines                                                |
| Tests / evidence                                 | Controlled interleavings plus relevant existing suites; local synthetic/static evidence only                             |
| UI Freeze                                        | No UI component, layout, translation, CSS or permission change                                                           |

The extra async detail-loader extraction preserves terminal-session rejection,
transport/response telemetry, and context-error rendering; existing parity,
preflight and lifecycle tests pass. New marker-ownership errors contain no marker
values, Incident text, credentials or identity data. A stale purge rejection is
still observable to its caller, while only a current observer may fence the UI.

Review merge verdict: **CLEAN TO MERGE** for this scoped diff based on local
checks, subject to Owner review and the physical acceptance limitation below.
This is not a production-readiness or real-device verification claim.

## Remaining acceptance and restrictions

- Physical Android/iOS, mounted Native application, actual OS process death,
  background/foreground scheduling and real SecureStore verification: **NOT RUN**.
  No connected physical device was exercised. These remain the explicit manual
  acceptance follow-up, not proven by mocks or fresh JavaScript owner tests.
- No implementation-critical product decision remains unresolved.
- No dependency, API, permissions, migration, infrastructure or unrelated business
  change. No production data or live network mutation used by the tests.
- No PR, merge, manual remote CI, deployment, issue edit/closure or audit-report
  modification. A branch push may trigger GitHub's configured workflows; no
  remote workflow result is asserted here.
- Implementation and this evidence record are committed separately so this file
  can name the immutable implementation SHA without a self-referential hash.
  The final response records the branch-head and directly verified remote SHA.

Recommendation: ready for Owner review; do not merge or close the issue automatically.
