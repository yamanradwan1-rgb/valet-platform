# Issue #405 — Native notification/auth recovery evidence

Date: 2026-11-01 UTC. Scope: automated source-level and local integration verification.
This report does not establish physical-device acceptance or production readiness.

## 1. Repository facts discovered

- Repository: `https://github.com/yamanradwan1-rgb/valet-platform.git`.
- Root: `/workspace/valet-platform`; initial branch `work`, clean, HEAD
  `c85fc34be9e7c62deae89b8f97b3d166dfdbc7ed`.
- Executed repository discovery, `git fetch origin main`, created tracking local
  `main`, and executed `git pull --ff-only origin main` before implementation.
- Exact synchronized baseline and task-branch starting commit:
  `3d02e9bb234e8505c3f123f8552ce9918fdcdad8`.
- Task branch: `fix/issue-405-native-notification-auth-race`; no existing local
  or remote task branch was found. A later fetch returned the same main SHA.
- Node `24.19.0`; repository-pinned pnpm `10.34.5` through Corepack.
- The GitHub issue was read. Its QA incident evidence is historical evidence;
  the original APK/API revisions and overwritten JavaScript logs are unavailable
  here. No claim connects a particular historical request to this reproduction.

## 2. Binding requirements

Authority follows `AGENTS.md` and `docs/00_SOURCE_OF_TRUTH.md`, including latest
explicit owner instructions and Accepted focused Decisions. Engineering,
security, DoD and structure constraints are in `docs/05_ENGINEERING_RULES.md`,
`docs/06_SECURITY_AND_DATA_RULES.md`, `docs/07_DEFINITION_OF_DONE.md`, and
`docs/17_AGENT_CODE_STRUCTURE_RULES.md`.

Verified Accepted authority: DEC-023 in `docs/08_DECISIONS_LOG.md`; focused
DEC-063, DEC-066, DEC-071, DEC-072, DEC-073, DEC-075 and DEC-076 under
`docs/decisions/`. Their actual titles matter: DEC-063 is Employee Offline
Operation Policy, and DEC-066 is Employee Bottom Navigation Production Wiring.
No Decision was created, accepted, or reinterpreted to authorize new policy.

## 3. Existing implementation patterns

Paths below are repository-relative. Names refer to the synchronized source.

```text
OS notification response
  -> notifications/use-native-push-response.ts
  -> NativePushRouteCoordinator.receive / setForeground / drain
  -> EmployeeOperationalSession.refresh / refreshQueue
  -> createNativeOperationalTransport.loadOperationalContext / loadTaskQueue
  -> createNativeEmployeeClient -> EmployeeClient.request

AppState foreground (independent subscribers)
  -> NativeProductionLifecycleOwner.setAppActive -> revalidate
     -> operations.setForeground(true) / refresh
  -> use-native-push-lifecycle.ts -> NativePushLifecycleOwner.setForeground
     -> reconcile -> perform -> NativePushHttpRegistrationTransport.reconcile
     -> createNativeEmployeeClient -> EmployeeClient.request(PUT)

PRE-FIX GET 401
  -> EmployeeClient.execute -> refreshAuthorization -> NativeAuthSession.refresh
  -> readAndRefresh -> refreshFrom -> NativeAuthHttpTransport.refresh
  -> POST /v1/staff/auth/native/refresh -> NativeStaffAuthController.refresh
  -> StaffAuthService.refresh -> locked credential/session/User validation
  -> consume R0, insert R1, rotate access, COMMIT -> HTTP 200

PRE-FIX concurrent PUT 401
  -> EmployeeClient.execute (mutation is not refresh/retry eligible)
  -> onAuthorizationLoss in tasks/native-operational-http.ts
  -> NativeAuthSession.handleDefinitiveAuthorizationLoss(G)
  -> NativeAuthFailureRecovery.handleDefinitiveAuthorizationLoss
  -> NativeAuthGenerationState.beginBarrier(G): G -> G+1; clear access
  -> local.read -> finishDefinitiveLoss -> local.cleanup
     -> restore block -> identity purge -> secure delete

Late refresh 200 for G
  -> refreshFrom detects obsolete generation (or commitResponse detects fence)
  -> NativeAuthFailureRecovery.revokeEphemeral(R1)
  -> NativeAuthHttpTransport.logout -> POST /v1/staff/auth/native/logout
  -> NativeStaffAuthController.logout -> StaffAuthService.logout
  -> logoutStaffSession: verifier lookup; FOR UPDATE credential/session
  -> revokeStaffSessionAndDisablePush
     -> UPDATE staff_auth_sessions.revoked_at
     -> DISABLE active session push registrations; clear provider_token
  -> COMMIT -> HTTP 204
```

Portable auth files live in `packages/employee-client/src`; native paths above
are under `apps/valet-native/src`; backend symbols are under
`apps/api/src/modules/auth`.

Generation/cleanup inventory:

| Entry | Transition / consequence |
| --- | --- |
| `NativeAuthSession.logout`, `switchAccount` | `logoutBarrier` advances generation immediately; serialized local logout; `completeLogout` uses ephemeral stored refresh to revoke remotely |
| Public `handleDefinitiveAuthorizationLoss` | `beginBarrier`; block/delete/purge; no direct server logout itself |
| `refreshFrom` definitive error; invalid/missing restore envelope | `definitiveLoss` -> `beginBarrier`; block/delete/purge |
| `commitResponse` secure replacement failure | `storageFailure` -> `beginBarrier`; block/delete/purge; revoke returned refresh |
| Local read/installation/login-preparation failure | `failFatal` -> `fatalBarrier`; clear access and purge identity |
| Stale login response | `login` -> `revokeEphemeral`; never publish old login |
| Stale refresh response or secure-commit fence | `refreshFrom` / `commitResponse` -> `revokeEphemeral`; never restore obsolete generation |
| `start` | memory `restoring`, validate local eligibility; then coalesced refresh or explicit unauthenticated/fatal state |
| Transient refresh failure | memory `unavailable`; clear access, retain refresh and generation; explicit retry |
| Login failure | memory `unauthenticated`; no authenticated publication |

`NativeAuthStorage.serializeMutation` orders secure replacement, block and
deletion. `NativeAuthMemoryState.authenticated` occurs only after secure
replacement AND installation activation. `nativeIdentityState.purge` invokes
runtime workflow/context/cache cleanup plus push and notification-route purge.

All native explicit logout invocations found are UI actions in
`native-auth-panel.tsx`, `native-auth-foundation-panel.tsx`, and
`native-production-shell.tsx`; `switchAccount` is the portable logout-before-login
API. Runtime/lifecycle/push disposal clears local owners and subscriptions and
does not invoke logout. Refresh starts at startup, safe-read recovery, explicit
auth retry, and network recovery from restoration-unavailable. The existing
session owns a single promise per auth generation.

## 4. LOCKED decisions

| ID | Exact requirement | Authority |
| --- | --- | --- |
| L1 | Shared Staff session authority, rotation, replay-family revocation, current User/session checks, absolute expiry | DEC-023; DEC-072 §§3,7,13 |
| L2 | Refresh credential only in secure storage; access memory-only; secure replacement precedes publication; genuine replacement failure fails closed | DEC-072 §§6–7 |
| L3 | Single-flight refresh per current auth generation; logout/account change fence late results | DEC-072 §§8,10 |
| L4 | Safe GET/HEAD retry once; no generic protected mutation replay; ambiguous outcomes use canonical reconciliation and command-specific policy | DEC-072 §8; DEC-063 §§4–8 |
| L5 | Transient refresh failure retains refresh and truthful retry state; lost response has no replay grace | DEC-072 §7 |
| L6 | Push is attention-only; tap authenticates and refetches canonical queue; current tenant/Location/Shift authority remains on server | DEC-071 §§6,12; DEC-073 §§4,7,9,11 |
| L7 | Push retry, staleness and registration state policy remain unchanged | DEC-075; DEC-076 |
| L8 | New/modified authored code <=300 lines; no grandfather-baseline expansion | docs/17_AGENT_CODE_STRUCTURE_RULES.md |

## 5. DERIVED conclusions

- D1: A protected request's 401 is not proof of refresh-session invalidity.
  DEC-023 intentionally uses the same access 401 for expired, rotated, revoked
  and invalid access. DEC-072 §8 permits refresh recovery. The old native adapter
  collapsed these different meanings into definitive loss.
- D2: Identity `authGeneration` does not advance on ordinary token rotation.
  Thus a generation-only check cannot identify a late rejection of an old bearer.
  `NativeAuthMemoryState.authenticated` and the three controlled orderings prove it.
- D3: Refresh recovery can run without replaying a command. The command must
  still receive its original rejection; only GET/HEAD may be sent again.
- D4: A second access 401 is also ambiguous while another rotation is in flight.
  Exhaust the safe-read retry budget; do not convert it to definitive loss.
- D5: After transient refresh failure, a delayed old 401 must not automatically
  retry the uncertain rotation. Preserve the explicit retry boundary.

Falsification: L1–L7 were checked against their focused clauses and the actual
client/HTTP/SQL paths above; L8 is checked by the architecture command. D1–D5
have focused tests, including a pre-fix failure for the separate-rotation race.
These are existing-policy corrections and request-local mechanics, not new
server authorization or retry policy.

Root cause in current source: premature definitive-loss classification of a
request-level access 401, including mutation 401s and exhausted-read 401s.
For H1, G's GET starts refresh; G's PUT 401 advances G to G+1; refresh 200 for
G is discarded and R1 is sent to native logout. The server correctly revokes
the session identified by R1. With PUT 401 after completed refresh, the same
bug deletes the new local session without needing a server logout.

Existing tests missed the composition: operational HTTP tests used a stub auth
object and explicitly expected mutation 401 -> definitive loss; portable auth
tests correctly protected stale cleanup but did not combine it with the real
push PUT adapter. Three obsolete native assertions were corrected under L1–L4.

| Hypothesis | Current-source conclusion | Historical incident conclusion |
| --- | --- | --- |
| H1 concurrent GET/PUT 401 | CONFIRMED by controlled deferred responses, real auth state machine and HTTP adapters | SOURCE-SUPPORTED; initiating request remains unproven |
| H2 explicit lifecycle logout | RULED OUT as an automatic mount/unmount/foreground path in audited source | INCONCLUSIVE without original JS logs |
| H3 genuine storage failure | SOURCE-SUPPORTED legitimate fail-closed revocation; preserved and tested | INCONCLUSIVE |
| H4 refresh replay | Coalesced current-generation client recovery verified; real DB winner/loser replay revocation verified | INCONCLUSIVE |
| H5 stale generation/bearer | CONFIRMED erroneous same-generation bearer rejection; account-generation fence retained | INCONCLUSIVE |
| H6 lifecycle overlap | SOURCE-SUPPORTED independent foreground read and registration paths; source simulation covered | INCONCLUSIVE for original runtime ordering |

## 6. UNRESOLVED decisions

No new material security/architecture decision is required for this correction.
Historical APK/API provenance and exact incident initiator remain unavailable
evidence, not a license to invent a cause. Physical-device and provider acceptance
remain outside the owner's current automated-only scope.

## 7. Risks / boundary violations

The implementation review identified no in-scope P0/P1 security blocker. The
availability defect was P1: ordinary expiry could destroy a valid session.
No backend, schema, credential lifetime, authorization, payload, UI or locale
contract changed. Raw bearer comparison is ephemeral only, never persisted or
logged. Caller-supplied identity/scope remains non-authoritative.

Repository/environment quality gates described below initially blocked publication.
The subsequent explicit Owner override accepts these limitations for branch
publication only; it does not authorize merge or production deployment.
Unrelated baseline assertions must not be deleted, changed to green, or silently
folded into this auth fix. The Issue #215 attestation must not be bypassed.

## 8. Proposed implementation plan

Plan executed: synchronize -> source/contract audit -> failing controlled race
-> native request-local recovery -> regression/API/quality gates -> integrated
review. The Owner subsequently authorized commit/push despite the documented
non-passing gates, without changing the tested source or security invariants.

`NativeProtectedTransport` captures identity generation when the client is
created and the exact bearer for each network attempt. A first current 401 joins
the existing auth refresh promise, or adopts a bearer already replaced by a
successful rotation. It retries only GET/HEAD once. POST/PUT/PATCH/DELETE keep
their original failure and are never replayed. A late access 401 cannot purge
auth; definitive refresh rejection retains the existing cleanup behavior.
An old 401 after restoration-unavailable cannot retry an unknown rotation.

This native adapter uses the existing portable `EmployeeClient`, auth owner,
safe-method policy, HTTP error mapping and per-network-attempt telemetry. It
removes the shared mutable last-response-status callback. No portable/Web auth
behavior changes. No additional downstream API is required.

Preserved authorization-before-mutation proof: protected commands still
authenticate and prove current persisted resource/tenant/Location/role/Shift
authority on the backend before their existing guarded transaction/write/audit.
Refresh still locks and validates credential/session/User before consuming and
rotating; logout still proves refresh-to-session ownership before revocation and
push disable. Their SQL, lock order, transaction, commit/rollback and unknown
response semantics are untouched. Existing real PostgreSQL tests verify selected
rotation/replay/concurrency and authorization cases, not every possible DB race.

The unchanged server check-use interval remains owned by each consumer
transaction: Shift end, membership/LocationAccess removal, User disable or
Location disable can invalidate a context snapshot. No client context grants
write authority. Transaction A's refresh may commit, roll back, or have an
unknown commit outcome at the client; transaction B's protected command must
independently authenticate and authorize persisted scope. If A commits rotation,
B's obsolete access may reject before any registration/domain write. If A rolls
back, B's 401 still does not prove refresh invalidity. If A's response is lost,
the old secure credential is retained only for the accepted explicit retry,
whose authoritative replay response may revoke the family. There is no new
client-side lock, database lock, idempotency key or retry authority.

| Mutation case | Preserved behavior |
| --- | --- |
| First execution | Exactly one command send; a 401 may recover auth but is returned to the caller |
| Identical retry | Only an explicit caller attempt under that command's existing Accepted contract; transport never retries it |
| Concurrent identical requests | Each caller sends once; shared refresh coalesces; existing server command uniqueness/idempotency remains final authority |
| Conflicting concurrent requests | Existing server authorization/version/conflict rules decide; auth recovery cannot resolve or replay the conflict |
| Retry after success / ambiguous outcome | Rehydrate authoritative state and use only accepted command-specific continuation; no generic success inference or automatic resend |

The auth mutations themselves retain the existing contracts: refresh is
single-flight for the current generation, server consumed-token reuse revokes
the family, login is explicit, and logout remains non-disclosing/idempotent.

Rejected alternatives: suppress stale-credential logout; relax backend replay
detection; add grace periods; extend token lifetime; serialize unrelated lifecycle
owners; replay registration PUT or domain mutations. Each would weaken security,
change accepted policy, or conceal the bad classification.

## 9. Test matrix

| ID | Evidence / result |
| --- | --- |
| T01 | New normal-success test: no refresh, authenticated |
| T02 | Real-session GET 401 -> refresh -> safe GET success |
| T03–T05 | GET + actual PushRegistration PUT, before/after/same-turn: one refresh, no logout/purge, secure R1 and memory A1 |
| T06 | Eight concurrent GETs + direct lifecycle refresh: one HTTP refresh |
| T07 | New HTTP-adapter logout-during-refresh test; existing portable secure-write/logout fence tests |
| T08 | Portable account-switch truth and secure-write races; new A logout/B login late-response tests |
| T09 | New HTTP-adapter replacement-write failure: restore blocked, no access, R1 logout; portable storage matrix |
| T10 | Real PostgreSQL Staff Auth replay + concurrent one-winner/loser family revocation |
| T11 | Portable lost-response retains R0 then authoritative replay purge; new delayed-401-after-transient test |
| T12–T13 | Real native/API revoked-session and disabled-User rejection; refresh 401 local purge test |
| T14 | Temporary refresh 503 preserves secure state and unavailable phase; native transport/portable network tests |
| T15 | Native production lifecycle/authority and push-route lifecycle simulation suites |
| T16 | Existing native push capture/parser/route duplicate-event tests; no notification domain-command path |
| T17 | New late A 200/401/403 after B login leaves B token, secure envelope and generation intact |
| T18 | Operational context/queue and lifecycle authoritative-refetch tests; route coordinator uses canonical state |
| T19 | Real PostgreSQL Shift/push registration authority tests and deactivation/refresh race |
| T20 | Eight-reader single-flight, one retry budget, same-client response isolation, delayed old 401 and transient retry barrier |

Controlled pre-fix reproduction on baseline `3d02e9bb`: 3/3 race cases FAIL.
Before/same-turn show exactly one unintended native logout; after shows
generation 0 -> 1 and unauthenticated state. The separate-rotation test was also
run against that unchanged baseline. Production sources were untouched there;
only task test files and dependency symlinks were added to a detached worktree.

Observed commands and final results (counts are test cases unless noted):

| Command / scope | Result |
| --- | --- |
| Baseline `pnpm --filter @valet/valet-native exec vitest run test/native-notification-auth-race.test.ts` | Expected FAIL: 0 pass, 3 fail; before/same-turn each issue one unintended logout |
| Baseline protected test with `-t 'separate rotation'` | Expected FAIL: 0 pass, 1 fail, 16 unselected; legitimate rotation returns stale |
| Final new race + protected test files | PASS: 20/20, 2 files |
| Initial focused operational/push request suites | PASS: 16/16; expanded focused pass recorded before later test additions |
| `pnpm --filter @valet/employee-client test` | PASS: 928/928, 106 files |
| `pnpm --filter @valet/valet-native test` final source | FAIL: 1,877 pass, 2 fail, 260 files; ONLY release Light EN/AR appearance assertions fail |
| Same native appearance test on detached baseline `3d02e9bb` | FAIL: same 2 release Light EN/AR assertions; no auth implementation changes there |
| Real PostgreSQL Staff Auth native/Web/continuity/push logout/registration concurrency | PASS: 49/49, 5 files; standard 17 + race 32 |
| Real PostgreSQL Shift eligibility/push authority/deactivation-refresh races | PASS: 38/38, 3 files; standard 36 + race 2 |
| Contracts through root non-PostgreSQL lane | PASS: 533/533, 74 files |
| `pnpm architecture:check` | PASS; only existing grandfather warnings |
| `pnpm lint` | PASS: 11/11 package tasks; actual ESLint |
| `pnpm typecheck` | PASS: 11/11 package tasks |
| `pnpm build` | PASS: 10/10 verification targets; no native binary build target |
| Focused `pnpm exec prettier --check` on 8 changed authored code files | PASS |
| `git diff --check` | PASS |
| `pnpm test` | BLOCKED before collection by Issue #215 protected disposable-database attestation |
| `pnpm test:non-postgres` | FAIL; details below. This is not a passing substitute for root test |

The broad non-PostgreSQL attempt recorded: UI 2, Contracts 533, Config 1 and
Testing 1 passing cases. Dashboard: 1,136 pass, 13 skipped, 2 failed suite setups
because the pinned Playwright Chromium executable is unavailable. Turbo stopped
the remaining pure-package tasks. API Node: 48 pass, 1 timeout in the existing
`issue333-u002-http-cancellation.test.mjs` large-body server-finish case; the API
Vitest half did not execute in that attempt. Database: 64 pass, 1 failure in
`issue304-migration-source-appendix.test.ts` (expects 103 migrations, finds 106).
That database assertion was separately reproduced on the unchanged baseline.
No failed test was deleted or weakened to obtain a green result.
An isolated rerun of `pnpm --filter @valet/api test:non-postgres` again recorded
48 Node passes and the same large-body server-finish timeout; its subsequent
Vitest half again did not execute. No cause beyond the observed timeout is
claimed for this unchanged test.

The first native-wide attempt overlapped a source correction and recorded one
additional failure in the newly added delayed-401/transient case (an automatic
second refresh). This exposed D5; the restoration-unavailable guard corrected
it. The stable-source rerun above has 20/20 new tests passing and only the two
independently reproduced baseline appearance failures remaining.

PostgreSQL execution used the repository ownership-aware runner:

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-auth-native.integration.test.ts test/staff-auth.integration.test.ts test/staff-auth-continuity.integration.test.ts test/staff-push-logout.integration.test.ts test/staff-push-registration-concurrency.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-eligibility.integration.test.ts test/staff-push-registration-authority.integration.test.ts test/staff-management-deactivation-refresh-race.integration.test.ts
```

A temporary external launcher loaded the existing local `.env` without printing
values, required a loopback migration target, set `NODE_ENV=test` and
`TEST_DATABASE_URL` from that local migration connection, and ran beneath the
environment's child-subreaper. The local Compose PostgreSQL 17 container was
started after the initial connection-refused attempt. Tests created disposable
databases/roles; runner cleanup reported zero remaining owned databases, roles
and child processes. These are real PostgreSQL tests, not mocked concurrency.
No migration, real-provider/device, remote CI or deployment verification is
claimed. Root protected-photo attestation remains unqualified.

## 10. Files expected to change

Actual files changed match the scoped implementation plan:

- `apps/valet-native/src/auth/native-protected-transport.ts` — focused native
  bearer-recovery owner; no token persistence.
- `apps/valet-native/src/tasks/native-operational-http.ts` — wire recovery around
  per-attempt HTTP/telemetry; remove unsafe shared status/loss callback.
- `apps/valet-native/test/native-notification-auth-fixture.ts` — real auth owner,
  HTTP adapters, in-memory secure adapter, controlled HTTP completions.
- `apps/valet-native/test/native-notification-auth-race.test.ts` — H1 orderings.
- `apps/valet-native/test/native-protected-recovery.test.ts` — security/recovery
  boundaries, logout, account isolation, transient and storage failures.
- `apps/valet-native/test/native-operational-auth-race.test.ts` — access rejection
  is not definitive refresh loss after exhausting the safe retry budget.
- `apps/valet-native/test/native-operational-http.test.ts` and
  `apps/valet-native/test/native-plate-ocr-client.test.ts` — mutation auth recovery
  without replay or premature definitive loss.
- This evidence report. No dependency/lockfile/migration/baseline changes.

## 11. Explicitly out of scope

No manual device/emulator verification, APK build/distribution, external provider
delivery, production state access, deployment, release, merge, issue closure,
GitHub issue write, PR creation or manual CI dispatch. No unrelated baseline
test/UI/migration-history correction. No claim of production readiness.

## 12. Ready-to-implement verdict

Contract verdict: READY TO IMPLEMENT; the scoped source correction is implemented.
Initial completion verdict: **NO-GO** under the original all-gates-pass condition.
Required repository tests still fail or cannot run; those results are unchanged.

Subsequent Owner decision: **CONDITIONAL ACCEPTANCE FOR BRANCH PUBLICATION**.
The Owner explicitly authorized committing and pushing this existing fix despite
the documented failures/unavailable gates. The override applies only to publishing
`fix/issue-405-native-notification-auth-race` for review. It waives no security
invariant and authorizes no merge, issue closure, deployment, APK generation,
additional device testing, CI execution/dispatch or workflow change.

Publication preflight rechecked the eight authored-code changes and this report.
The implementation still matches the previously tested patch; no new P0/P1
finding attributable to this fix was identified. No secrets, unrelated files,
dependencies, generated artifacts or CI workflows are included. Remote `main`
remains `3d02e9bb234e8505c3f123f8552ce9918fdcdad8`; the task branch did not exist
remotely before publication. The commit and post-push remote/local SHA comparison
are recorded in the delivery response. Automatic GitHub workflow results, if any,
are separate from the preserved local verification evidence.

The exact reviewable source patch is `/workspace/issue405-evidence/issue405-source.patch`
(eight authored files; report excluded), SHA-256
`6428f752c57297dbd779f5ad7b6df1fc5c4f3ba867b160ef3043c0a0b166b853`.
`git apply --check --reverse` validated that it matches the final working tree.
This baseline-plus-patch identifies the tested source independently of the
publication commit and the report-only Owner-override amendment.

Final integrated security review target: baseline `3d02e9bb` versus the eight
authored-code changes and this report. Scope, Accepted-policy fidelity,
authorization ordering, replay/concurrency, identity isolation, SecureStore,
revocation ordering, telemetry privacy, architecture and downstream boundaries
were reviewed against the actual diff. No confirmed in-scope P0/P1 remains;
The failed/unavailable repository gates remain outstanding verification limitations.
Review disposition: **BLOCK MERGE** until required gates are resolved. A fresh
Standard/Deep Codex Security Scan and independent human review were not run.

| Review field | Result |
| --- | --- |
| Review target | Exact baseline plus source patch identified above and report-only Owner-override amendment |
| Decision/docs checked | Authority and L1–L8 listed in sections 2 and 4 |
| Findings | No in-scope P0/P1. P2 baseline release appearance and migration-count assertions; P2 unchanged HTTP test timeout with cause unestablished. Environment blockers: pinned browser and protected DB attestation |
| Security & tenant/location verdict | No auth bypass or new scope authority; server checks unchanged; sampled real denial/deactivation cases pass |
| Retry/concurrency & DB verdict | No mutation replay; coalesced refresh and bearer/identity fences; real replay/revocation tests pass; no SQL/migration changes |
| Abstraction compatibility verdict | Native-only transport composes existing interfaces; portable/Web client semantics unchanged |
| Audit/privacy verdict | No new persistence, logs, audit or secret-bearing telemetry; only synthetic test credentials |
| Downstream consumer verdict | Existing native client factory remains the boundary; context is never command authority |
| Architecture/300-line verdict | PASS, maximum changed authored file 280 lines; no baseline exception |
| Test adequacy verdict | New failing-before/passing-after races plus full Native/Employee Client and 87 real PostgreSQL cases; device/provider/CI proof excluded |
| Scope leakage verdict | Eight native code/test files and report only |
| Gate evidence | Section 9; failures and unavailable collection explicitly retained |
| Merge verdict | BLOCK MERGE |

All eight changed authored code files are <=300 lines (maximum 280). The
operational HTTP file shrank from its baseline. No architecture-baseline,
dependency, lockfile, schema, audit or history change was made. Next.js-generated
`next-env.d.ts` additions produced by the verification build were removed after
inspection; the checkout was clean before this task, so no user work was lost.
