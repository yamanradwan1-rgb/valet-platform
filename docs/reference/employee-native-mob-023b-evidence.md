# Employee Native — MOB-023B Recovery Evidence

> Evidence/status record only. This document creates no product, API, schema,
> persistence, or security authority. Accepted decisions and the binding Native
> execution plan remain canonical.

## Scope and result

- Base: `cad942bad7f7655b0d4bda3c7449c30c6e4205c6`
- Branch: `codex/mob-023b-protected-command-process-death`
- Physical evidence: **DEFERRED — owner deferred physical evidence gate.**
- Overall status: **BLOCKED / CHILD REQUIRED** for exact Incident recovery after
  a committed response is lost across process death. All independently safe
  MOB-023B client rows are implemented or proven without adding persistence.

## Recovery ownership matrix

The durable column describes production durability. Client attempts, command
bodies, optimistic versions, workflow snapshots, navigation, access tokens,
and protected proofs are memory-only unless stated otherwise.

| Stage | Production route and method | Client / Native owner | Server authority and retry identity | Cold-start behavior and disposition | Accepted authority |
| --- | --- | --- | --- | --- | --- |
| Staff auth | `POST /v1/staff/auth/refresh`; auth logout | `NativeAuthSession`; Native bootstrap | rotating server session family; secure refresh credential is the only relevant durable client secret | new auth owner starts without access token, restores refresh through the accepted path, then reloads context; logout/revocation/account replacement remains fail-closed | DEC-072 |
| Workspace | `GET /v1/staff/operational-context`; `GET /v1/staff/tasks/queue` | `EmployeeOperationalSession`; Tasks screen | current User, membership, Organization, Location, Shift, Task | entirely new owner loads context then queue; `native-process-death-routing.test.ts` proves a new production controller starts at Tasks with no restored command navigation | DEC-032/034/035/071/072 |
| Shift Start | `POST /v1/staff/shifts/start` | `EmployeeShiftStartSession`; Shift screen | active-Shift uniqueness and same-Location semantic recovery; no operation ID | context says active, startable, conflicting, or revoked; never auto-replays | DEC-032/063 |
| Shift End | `POST /v1/staff/shifts/:shiftId/end` | `EmployeeShiftEndSession`; Shift screen | open-work guard; immutable cash-close result; same ended Shift retry is server-idempotent | context says active or no active Shift; cash input and attempt are lost; never auto-replays | DEC-032/052/063 |
| Returning recognition | `POST /v1/staff/check-in/vehicle-recognition` with read-only recognition semantics | `EmployeeCheckInSession`; Check-In screen | current scoped Vehicle/Customer projection | transient candidate is discarded; explicit current flow repeats recognition when needed | DEC-069 |
| Intake | `POST /v1/staff/check-in/intakes` | `EmployeeCheckInSession`; Check-In screen | durable Organization-scoped operation ID and payload fingerprint | drafts/continuations discover a committed intake; Process B cannot recover Process A's operation ID, so no transparent exact retry or invented storage | DEC-069 and accepted intake contract |
| Check-In details / condition / completion | session-scoped PUT/POST routes under `/v1/staff/check-in/sessions/:id` | focused Check-In sessions; Check-In screen | current session/vehicle state, vehicle timestamp, command-specific idempotency | draft/detail/continuation reads reconstruct current stage; request bodies do not survive or replay | accepted Check-In contracts |
| Task assign / accept / claim | `POST /v1/staff/tasks/:taskId/assign`; `POST .../accept` | `EmployeeTaskActionOwner`; Tasks screen | Task version, assignee, Shift eligibility | current queue wins for queued, assigned, accepted, reassigned, missing, or complete; no action attempt survives | DEC-034/035/063 |
| Parking bootstrap | `POST /v1/staff/valet-sessions/:id/parking-task/queue` | `EmployeeParkingStartSession`; Check-In continuation | unique active Parking Task and current session | queue/detail discovers the committed Task; bootstrap runs only from explicit current continuation, never from restart | DEC-034/037/063 |
| Start Parking | `POST .../:id/start-parking` | `EmployeeParkingStartSession`; Parking screen | Task + session versions and atomic custody transition | queue/detail yields accepted pre-start or `PARKING`; no replay | DEC-036/063 |
| Confirm Parked | `POST .../:id/confirm-parked` | `EmployeeConfirmParkedSession`; Parking screen | Task + session versions, exact spot/slot, atomic projections and custody | queue/detail yields active pre-confirm or canonical `PARKED`; fresh owner now adopts server spot/slot without Process-A candidates | DEC-037/065/068/063 |
| Retrieval visibility | staff session detail and task queue GETs | operational/retrieval sessions | RetrievalRequest, Task, ValetSession | current `REQUESTED` and later state is reconstructed from server truth | DEC-039/040 |
| Retrieval accept / start / ready | shared Task POSTs; `POST .../:id/start-retrieval`; `POST .../:id/mark-ready` | task/retrieval sessions; Retrieval screen | versions, current owner, request, custody | new owner derives assigned, key checkout, `RETRIEVING`, or `READY`; no replay | DEC-035/039/063 |
| Handoff initiate / verify / override / abort | command-specific POSTs under `/v1/staff/valet-sessions/:id` | `EmployeeHandoffSession`; Handoff screen | session version, current Task/Shift, hashed verification status/expiry/attempts | queue/detail yields `READY`, pending, verified, expired/consumed, aborted, or conflict; proof/reason is gone and no POST runs | DEC-042/063 |
| Final release | `POST .../:id/complete-handoff`; payment/session/queue GETs | `EmployeeReleaseSession`; Release screen | atomic verification consumption, custody, request/task/session completion, current financial policy | detail-first read discovers `COMPLETED` without requiring the completed Task or a second release; otherwise current eligibility is rebuilt | DEC-043/057/063 |
| Incident | `POST .../:id/incidents`; session detail GET only | `NativeIncidentSession`; Incident screen | actor-bound stable `incidentId` exact-payload idempotency | new owner sends no POST and has no report result; committed report cannot be discovered or exact-retried because its UUID was Process-A-only | DEC-063/059 and accepted Stream-A contract |
| Guest Access | issue/reissue/revoke POSTs; staff session detail GET | `NativeGuestAccessSession`; contextual screen | hash-only credential state; explicit intents; revoked timestamp concurrency | detail can restore status but never raw bearer; reissue is explicit and no command replays | DEC-063/064 and accepted Guest Access contract |
| Media / tracking | separate command owners | not entered by this configured full-shift scenario | separate Accepted policies | not applicable to MOB-023B; no R-08/R-09/R-10 behavior is invented | DEC-045/048/063 |

## Deterministic process boundary

`ProtectedCommandServer` owns the authoritative fake state across two runtime
owners. Every claimed custody cut now begins at a real public production-owner
method; `server.mutate(...)` is called only inside that owner's transport
adapter. The harness models:

1. failure before commit;
2. commit followed by response loss;
3. atomic transaction rollback;
4. caller disconnect with both possible server outcomes.

Tests make the Process-A owner unreachable without calling `clear()` or
serializing its snapshot, target, candidates, proof, or navigation. Process B
constructs a new `EmployeeOperationalSession`, reloads current context and
queue, and passes only the Task identifiers returned by that Process-B queue to
new command owners. Its command transports reject unexpected POSTs, while the
harness records every protected POST.

For custody cuts, `processDeathCommandCut()` signals only after the fake server
has selected commit, non-commit, rollback, or disconnect outcome, then leaves
the Process-A transport response permanently unavailable. The test drops its
only Process-A owner reference at that signal, before Process A can publish a
result or begin its normal same-process reconciliation.

The evidence is split by production responsibility rather than held in one
oversized test. Parking bootstrap, Start Parking, Confirm Parked, Start
Retrieval, Mark Ready, initiate handoff, pickup-code verification, supervisor
override, abort, and complete handoff all execute through their Process-A
session public actions. Confirm Parked and complete handoff remove their active
Tasks, so integrated Process B intentionally stays at Tasks with no old target;
the focused owner suites separately prove canonical `PARKED` and `COMPLETED`
detail reconciliation when a current route supplies a target.

## Fault-boundary evidence

| Boundary | Real production-owner evidence |
| --- | --- |
| Failure before commit | `employee-process-death-shift-task.test.ts` — “restores Shift Start/End authority after before-commit without replay”; `employee-process-death-parking.test.ts` — “resolves Start Parking before-commit from Process-B queue authority”; `employee-process-death-release.test.ts` — “uses current server truth after complete-handoff before-commit” |
| Commit + response lost | the same Shift and Start Parking parameterized tests; Parking bootstrap, Confirm Parked, Retrieval, Handoff, proof, abort, override, and release named tests below |
| Transaction rollback | Shift Start/End and Start Parking parameterized `rollback` cases execute through real owners; PostgreSQL `start-parking-atomicity.integration.test.ts`, `confirm-parked-atomicity.integration.test.ts`, `start-retrieval-atomicity.integration.test.ts`, `mark-ready-atomicity.integration.test.ts`, `handoff-atomicity.integration.test.ts`, and `complete-handoff-atomicity.integration.test.ts` prove command atomicity |
| Caller disconnect, outcome unknown | Shift Start/End and Start Parking parameterized `disconnect-no-commit` and `disconnect-commit` cases; Process B accepts only its canonical read result |

## Required-row disposition

| Required row | Status | Deterministic evidence |
| --- | --- | --- |
| Shift Start | PASS | `employee-process-death-shift-task.test.ts` covers all four boundaries and both disconnect outcomes |
| Shift End | PASS | same suite; Process B adopts active/no-active truth and has empty cash input |
| Task accept / claim / reassignment | PASS | same suite plus `employee-operational-accept.test.ts`; committed accept, current reassignment, revoked scope, and claim/accept sequencing |
| Parking queue bootstrap | PASS | `employee-process-death-parking.test.ts` — “queues through Process A and lets Process B discover the Task”; real `openCompletedCheckIn` call, lost response, Process-B queue discovery, zero replay |
| Start Parking | PASS | `employee-process-death-parking.test.ts` — “resolves Start Parking … from Process-B queue authority”; all five fault outcomes through `startParking()` |
| Confirm Parked | PASS | `employee-process-death-parking.test.ts` — “confirms through Process A, then cold-starts at Tasks with no target”; `employee-confirm-parked-recovery.test.ts` is the correctly labeled lower-level fresh-owner canonical spot/slot reconciliation |
| Start Retrieval | PASS | `employee-process-death-retrieval.test.ts` — “resolves Start Retrieval … from Process-B queue authority”; all five fault outcomes through `startRetrieval()` |
| Mark Ready | PASS | `employee-process-death-retrieval.test.ts` — “marks Ready through Process A and restores it with no POST” |
| Initiate handoff | PASS | `employee-process-death-handoff.test.ts` — “initiates in Process A and Process B discovers HANDOFF_PENDING” |
| Pickup code / Dynamic QR proof loss | PASS | `employee-process-death-handoff.test.ts` — “loses pickup proof with Process A and adopts only server verification”; `employee-handoff-flow-session.test.ts` — “verifies pickup/qr proof without completing or releasing” proves both methods use the same non-retaining `run("verify", method, proof)` owner boundary |
| Supervisor override | PASS | `employee-process-death-handoff.test.ts` — “does not replay a supervisor override after Process A dies”; current supervisor scope and server verification win |
| Abort handoff | PASS | `employee-process-death-handoff.test.ts` — “aborts in Process A and Process B discovers READY” |
| Final release | PASS | `employee-process-death-release.test.ts` — before-commit and committed-response-lost calls through `release()`; committed terminal cold start has no Task/route and zero second POST. `employee-release-flow-session.test.ts` — “recovers COMMITTED completion after response loss even when Task disappeared” is the focused detail-first owner proof |
| Incident | BLOCKED / CHILD REQUIRED | `native-process-death-recovery.test.ts` proves both commit outcomes produce only a Process-B GET and no fabricated report/replay; no lawful exact-recovery identity exists |
| Guest Access | PASS | same Native suite proves ACTIVE server state with no retained raw bearer; existing recovery suite covers issue/revoke ambiguity |
| Check-In intake | ALREADY COVERED | `employee-check-in-recovery.test.ts` constructs a fresh session and restores server drafts/continuations; `employee-check-in-session.test.ts` proves same-process exact ID reuse; API integration proves durable idempotency |
| Check-In condition/detail correction | ALREADY COVERED | condition/correction recovery suites prove canonical reread, no append replay, stale version, and identity purge |
| Auth / account / scope replacement | PASS | new Task test plus `native-auth-storage-matrix.test.ts`, shift fences, Native auth-race tests, and workflow purge tests |

## MOB-023B-INCIDENT-RECOVERY CONTRACT CHILD REQUIRED

Accepted policy allows manual retry of the same logical Incident using its
actor-bound stable ID. Production generates that ID inside
`NativeIncidentSession` and retains it only in memory. The server deduplicates
that ID but exposes no employee read/list/by-ID route capable of discovering a
committed lost response. After process death, generating a new ID for an
explicit resubmission can create a second Incident for the same occurrence.

Required focused child/decision: define a command-specific, privacy-safe
Incident process-death recovery contract without selecting its architecture in
MOB-023B. It must decide:

- how one stable Incident intent identity can survive process death;
- how committed-response-lost is discovered and how not-committed is shown;
- actor, Organization, Location, and Valet Session binding;
- retention and TTL;
- logout, definitive auth loss, account switch, and scope-change purge;
- changed-payload reuse semantics and duplicate prevention;
- why cold start never automatically replays the Incident POST; and
- whether any sensitive draft content may be durable (plaintext persistence is
  forbidden unless explicitly accepted).

Responsible current modules are:

- Native: `apps/valet-native/src/incident/native-incident-session.ts`
- API: `apps/api/src/modules/incidents/incident-reporting-command.ts`
- route: `POST /v1/staff/valet-sessions/:sessionId/incidents`

MOB-023B does not invent that product/security contract and therefore does not
claim overall PASS.

## Privacy firewall

The Native process-death suite scans intentionally serializable app state with
canaries for access token, Authorization, Guest bearer, pickup code, Dynamic QR
proof, supervisor proof, and payment secret. Process B retains none. The
existing secure auth fake remains the sole allowed durable refresh boundary;
no command request, response, workflow snapshot, navigation, or proof store was
added.

## Automated validation record

- Employee client: 65 files / 475 tests passed; lint, typecheck, and build
  passed.
- Native: 136 files / 1,047 tests passed; lint and typecheck passed. A first
  concurrent run had one unrelated five-second dynamic-import timeout; the
  required full Native command rerun alone passed cleanly.
- PostgreSQL command invariants: 13 exact files / 106 tests passed: Shift Start,
  Shift End, intake idempotency, Start/Confirm Parking atomicity, Start
  Retrieval/Mark Ready atomicity, handoff atomicity/proof concurrency,
  complete-handoff atomicity/concurrency, Incident, and Guest Access. Four slow
  files were rerun serialized with a 15-second timeout after parallel fixture
  lock contention; that rerun passed 4 files / 23 tests.

  Exact files: `shift-start.integration.test.ts`,
  `shift-end.integration.test.ts`, `intake-session-command.integration.test.ts`,
  `start-parking-atomicity.integration.test.ts`,
  `confirm-parked-atomicity.integration.test.ts`,
  `start-retrieval-atomicity.integration.test.ts`,
  `mark-ready-atomicity.integration.test.ts`,
  `handoff-atomicity.integration.test.ts`,
  `handoff-proof-concurrency.integration.test.ts`,
  `complete-handoff-atomicity.integration.test.ts`,
  `complete-handoff-concurrency.integration.test.ts`,
  `staff-incident-reporting.integration.test.ts`, and
  `staff-valet-session-guest-access.integration.test.ts`.
- Architecture check passed with only pre-existing grandfathered-size warnings.
- Changed-file Prettier and `git diff --check` passed before commit.

G7 remains open: the binding plan requires both MOB-023B and MOB-024B, and this
evidence cannot close that gate.
