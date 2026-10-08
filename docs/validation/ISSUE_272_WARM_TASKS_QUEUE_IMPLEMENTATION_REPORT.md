# Issue #272 — Native warm Tasks queue implementation evidence

Status: **CODE REVIEW READY for the reproduced source-level defects; PHYSICAL_QA_PENDING.**

Date: 2026-10-09

Repository: `veletpro0-lgtm/valet-platform`

Branch: `fix/issue-272-native-warm-tasks-queue`

Verified base `origin/main`: `82db5b75dc24ebf80e1c75780ad04e97bb72d7f5`

Final branch SHA: see Git delivery/branch HEAD (updated at commit).
Issue #272 stays **OPEN**. No PR, merge, APK, deploy or production migration.

## Observation, authority and first divergence

The Owner saw an authorized Parking Task missing during warm Native navigation,
then present immediately after terminating and relaunching Android. The physical
wait duration and actual polling/HTTP trace are unknown. Read-only backend
observations recorded an `ACCEPTED` Parking Task with `AWAITING_PARKING`
session and, later, `IN_PROGRESS` with `PARKING`; these are **different
instants**, not evidence of a vanished Task.

Two separately proven source-level gaps were reproduced **before code repair**:

1. **STALE_INFLIGHT_READ / MISSING_NAVIGATION_INVALIDATION** (bounded window):
   `EmployeeTaskQueueOwner.refresh()` coalesced an old same-scope GET regardless
   of when it began (`packages/employee-client/src/employee-task-queue-owner.ts`,
   existing branch at line 127). Warm Tasks navigation only changed shell
   destination (`apps/valet-native/src/shell/native-production-shell.tsx`,
   `navigate`). Deterministic timeline:

   | Moment | Canonical task | HTTP/queue owner | Native snapshot/render |
   | --- | --- | --- | --- |
   | T0 | No eligible row in prior response | Successful initial GET = [] | Confirmed empty |
   | T1 | Mutation / task now eligible | Old GET A is pending, logically predating mutation | Prior empty |
   | T2 | `ACCEPTED` or `IN_PROGRESS` | Warm route entry previously had no freshness barrier; same-scope `refresh()` would reuse A | Could show old empty |
   | T3 before fix | Task exists | A resolves []; old owner can publish it | Old empty despite newer canonical row |
   | T3 after fix | Task exists | Route-entry read invalidation aborts A; new authoritative GET B returns Task | Current-scope accepted result includes Task |
   | T4 after fix | Task exists | Operational snapshot publishes accepted B | Tasks card renders Start or Continue as appropriate |

   This **does not prove** why the Owner's Android display remained stale for
   the unspecified duration; under ordinary foreground 5-second polling, a
   bounded stale GET window should recover. Other physical candidates remain
   lifecycle suspension, network/backoff, authority hard-stop, transport,
   backend queue mismatch and stale UI publication. Physical classification:
   `UNVERIFIED_ON_DEVICE`.

2. **UI_RENDER_STATE_DEFECT:** a previously successful empty result followed
   by a temporary network failure retained `successfulQueueSnapshotCount > 0`
   and `tasks=[]`, while `NativeTasksPanel` omitted the current
   `queueFailure` predicate. Consequently it rendered the existing confirmed
   empty copy. The failing EN/AR tests first demonstrated the false empty
   (2 failures) and pass after selecting the existing error state.

Reproduction baseline: the first six queue invalidation tests failed because
the semantic read-entry method did not exist; the 2 new panel cases failed
against the previous presentation logic. After the source changes both
boundaries pass. Test-only timelines contain response counts/status classes;
no persistent production event logger was added.

## Minimal implementation and route/render ownership

- `packages/employee-client/src/employee-task-queue-owner.ts`: add
  read-only `refreshForNavigation()`; coalesce an already post-entry in-flight
  GET, otherwise abort the old GET and start an authoritative one through the
  **same** canonical queue owner. It neither changes `retryNotBefore` nor
  clears hard-stop/suspended/foreground gates. Existing abort-controller
  identity fences prevent late A from publishing or clearing B's controller.
- `packages/employee-client/src/employee-operational-session.ts`: expose the
  narrow method, without another interval or transport.
- `apps/valet-native/src/shell/use-native-tasks-route-revalidation.ts`:
  trigger only after a **same-scope active non-Tasks → Tasks transition**.
  First Tasks hydration, scope replacement and same-Tasks foreground recovery
  do **not** create an extra GET. React render-only changes do not refetch.
- `apps/valet-native/src/shell/native-production-shell.tsx`: mount that hook
  in the production shell; do not modify the existing T5 Guest Access recovery.
- `apps/valet-native/src/tasks/native-tasks-panel.tsx`: when the queue has no
  rows and the current fetch has failed, use the **existing** translated error
  state, not a false authoritative empty presentation. Retained same-scope
  rows are otherwise subject to existing action/authority guards.

New tests and fixtures:
`packages/employee-client/src/employee-task-queue-invalidation.test.ts`,
`apps/valet-native/test/native-tasks-warm-navigation.test.tsx`,
`apps/valet-native/test/native-production-shell-task-entry.test.tsx`,
`apps/valet-native/test/native-warm-tasks-queue-fixture.ts`; extended
`apps/valet-native/test/native-tasks-panel.test.tsx`.

No changes to API, Prisma/database, contracts, routes, payments, dispatch
commands or custody transitions. No POST/PATCH/DELETE in navigation; test
fixtures explicitly assert zero acceptance/assignment calls. No new UI
control, geometry, translation or new visual component.

## Authorization and custody checks

Canonical queue request scope remains generation + exact Organization,
membership, Location and Shift; changing scope aborts old reads. Successful
scope revalidation remains required. A 401/403/404 stops protected queue
reads; HTTP 429 retains `Retry-After`; foreground/context suspension remains
enforced. Navigation cannot accept/assign/Start/Confirm/Cancel/Complete work.
`ACCEPTED` is pre-custody and continues to show the approved **Start Parking**
action; `IN_PROGRESS` shows **Continue Parking** and must not repeat Start.
Prior #255 Check-In and #261 pre-custody cancellation fences and #271
cold-start false-empty guard remain unchanged. T5 contextual Handoff Guest
Access code remains unchanged. No private task/session IDs, plates, tokens,
headers or tenant identifiers are logged.

## Exact validation results

Executed from isolated `tmp/issue-272-worktree`:

| Command / suite | Result |
| --- | --- |
| `pnpm --filter @valet/employee-client exec vitest run src/employee-task-queue-invalidation.test.ts src/employee-task-queue-lifecycle.test.ts src/employee-operational-lifecycle-race.test.ts src/employee-operational-bootstrap-ordering.test.ts src/employee-operational-load.test.ts src/employee-operational-action-scope.test.ts src/employee-operational-barrier.test.ts src/employee-parking-cancellation-queue.test.ts src/employee-operational-identity.test.ts` | **46/46 PASS**, 9 files |
| `pnpm --filter @valet/valet-native exec vitest run test/native-production-shell-task-entry.test.tsx test/native-tasks-warm-navigation.test.tsx test/native-tasks-panel.test.tsx test/native-production-lifecycle-owner.test.ts test/native-production-lifecycle-authority.test.ts test/native-production-lifecycle-auth-ready.test.ts test/production-shell-revalidation.test.ts test/native-handoff-guest-access-recovery.test.ts test/native-handoff-recovery-production-mounted.test.tsx` | **69/69 PASS**, 9 files |
| Expanded Native suite with Start Parking, cancellation #255/#261, T5 Guest Access, lifecycle and production-mounted shell tests (18 files) | **119/119 PASS** after both mounted shell cases were added |
| `pnpm --filter @valet/valet exec vitest run src/components/screens/task-queue-screen.test.tsx src/components/screens/task-queue-screen-concurrency.test.tsx src/components/employee-app.test.tsx` | **21/21 PASS**, 3 files |
| `pnpm --filter @valet/employee-client typecheck` and `lint` | **PASS / PASS** |
| `pnpm --filter @valet/valet-native typecheck` and `lint` | **PASS / PASS** |
| `git diff --check` | **PASS** |
| `pnpm architecture:check` | **BASELINE FAIL**, same two violations on clean `main` |
| `pnpm --filter @valet/valet typecheck` | **BASELINE FAIL**, same missing `timezone` fixture fields on clean `main` |

The existing architecture violations are:
`packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts`
(328 physical lines, ungrandfathered limit 300), and
`packages/employee-client/src/employee-shift-presence-local-provenance.test.ts`
(portable client `window` global). The separate Employee Web typecheck has
preexisting `TS2741` missing `timezone` in old test fixtures. These are
identical when run against unchanged primary `main` and are unrelated to
the #272 diff; do not expand this task to fix them.

## Independent review

Reviewer A — Native queue lifecycle/concurrency: **FINAL PASS**, no unresolved
P0/P1. Initial P1 cold-start duplicate GET was corrected with actual
warm-transition gating; reviewer independently re-checked the queue fences,
retry/denial safety and the production-mounted initial hydration test.
Reviewer B — authorization/custody/Native composition: **FINAL PASS**, no
unresolved P0/P1. Initial mounted-coverage blocker was corrected with tests
exercising the **actual `NativeProductionShell` call-site** for both
Check-In→Tasks and Parking→Tasks, including stale GET replacement and zero
Accept/Assign. This is still a mocked React/native environment, not physical
Android acceptance.

## Native UI evidence

Before: simulated successful empty queue followed by failed GET displayed
the EN/AR confirmed-empty text. After: the same snapshot renders the
existing EN/AR error state; true successful empty remains unchanged.
Mounted render-tree tests validate the state selection. **No physical
EN/AR × Light/Dark screenshots, APK, or release-device evidence available**
to the agent; final UI sign-off remains outstanding.

## Physical Android QA handoff (Owner / authorized tester)

Use **QA/staging only**, with a synthetic or explicitly approved test vehicle,
an authorized employee and ACTIVE Shift at the correct Organization/Location.
Use a matching Native APK source SHA, APK version/hash and API SHA. Do not
edit the Owner's real/demo active vehicle for reproduction.

1. **Check-In → Tasks:** complete valid Check-In to canonical Parking Task;
   navigate to Tasks without killing Android. Record elapsed seconds, current
   authorized queue GET task-presence boolean, owner accepted-response
   boolean and Native card presence. Repeat after process termination/relaunch.
2. **Accepted Parking:** stage an eligible test task `ACCEPTED`; enter Tasks,
   leave to Vehicles, return; confirm **Start Parking** exists and **no**
   physical Start POST happened automatically.
3. **In-progress Parking:** explicitly Start Parking on test data, verify
   canonical `IN_PROGRESS`; navigate away and back; confirm **Continue
   Parking** and zero duplicate Start POST.
4. **Lifecycle/connectivity:** background/foreground and controlled
   offline/reconnect; check context-first revalidation, truthful unavailable
   state, task recovery and no unauthorized/stale actions.
5. Observe for at least three nominal 5-second polling intervals, recording
   **actual elapsed time**. The 5-second scheduler interval is not an SLA.

Record issue #272, branch/SHA, APK hash/version, API SHA, Android version,
OEM/model (no device identifier), EN/AR and Light/Dark mode, anonymized
location/role, foreground/connectivity, elapsed time, Task state/version
class, queue GET inclusion boolean, accepted snapshot boolean, rendered card
boolean, sanitized screenshot filenames and PASS/FAIL for each step. Never
publish raw task/ValetSession UUIDs, customer names, plate, auth credentials,
headers, tokens or sensitive history.

**Final physical acceptance requires matching-build Android QA.**
`PHYSICAL_QA_PENDING`; do **not** mark issue fixed/closed from mocks alone.
Merge/deployment require separate Owner decision.
