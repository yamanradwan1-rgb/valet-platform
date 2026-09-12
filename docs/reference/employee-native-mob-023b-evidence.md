# Employee Native — MOB-023B Recovery Evidence

> Evidence/status record only. This document creates no product, API, schema,
> persistence, or security authority. Accepted decisions and the binding Native
> execution plan remain canonical.

## Scope and result

- Base: `cad942bad7f7655b0d4bda3c7449c30c6e4205c6`
- Branch: `codex/mob-023b-protected-command-process-death`
- Physical-device evidence: explicitly deferred by the owner and not claimed.
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
| Workspace | `GET /v1/staff/operational-context`; `GET /v1/staff/tasks/queue` | `EmployeeOperationalSession`; Tasks screen | current User, membership, Organization, Location, Shift, Task | entirely new owner loads context then queue; no POST and no restored navigation authority | DEC-032/034/035/071/072 |
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
owners and models:

1. failure before commit;
2. commit followed by response loss;
3. atomic transaction rollback;
4. caller disconnect with both possible server outcomes.

Tests drop the Process-A owner without calling `clear()` or serializing its
snapshot. Process B is newly constructed and receives only canonical server
reads. The harness records every protected POST so restart-triggered mutation
would fail deterministically.

The full-shift scenario cuts responses after committed Parking Task bootstrap,
Start Parking, Confirm Parked, Start Retrieval, Mark Ready, initiate handoff,
pickup-code verification, abort handoff, and complete handoff. New owners adopt
each canonical stage. The release cut proves a completed session is recognized
before queue/payment reads and produces no duplicate release effect.

## Required-row disposition

| Required row | Status | Deterministic evidence |
| --- | --- | --- |
| Shift Start | PASS | `employee-process-death-shift-task.test.ts` covers all four boundaries and both disconnect outcomes |
| Shift End | PASS | same suite; Process B adopts active/no-active truth and has empty cash input |
| Task accept / claim / reassignment | PASS | same suite plus `employee-operational-accept.test.ts`; committed accept, current reassignment, revoked scope, and claim/accept sequencing |
| Parking queue bootstrap | PASS | `employee-full-shift-process-death.test.ts`; committed lost response is found through queue/detail with no bootstrap replay |
| Start Parking | PASS | full-shift process-death test plus `employee-parking-start-session.test.ts` |
| Confirm Parked | PASS | full-shift test and `employee-confirm-parked-recovery.test.ts`; includes fresh-owner canonical spot/slot adoption and stale-version cases |
| Start Retrieval | PASS | full-shift test plus `employee-retrieval-flow-session.test.ts` |
| Mark Ready | PASS | full-shift test plus `employee-retrieval-flow-fences.test.ts` |
| Initiate handoff | PASS | full-shift test plus `employee-handoff-flow-session.test.ts` |
| Pickup code / Dynamic QR proof loss | PASS | full-shift pickup-code canary, `employee-handoff-flow-session.test.ts` proof non-retention, and handoff fence tests; both methods use the same non-retaining command path |
| Supervisor override | PASS | fresh canonical verified-state path in full-shift scenario plus existing role/authority tests; no reason is persisted or replayed |
| Abort handoff | PASS | full-shift test discovers canonical `READY` after lost abort response |
| Final release | PASS | full-shift test and `employee-release-flow-session.test.ts`; canonical `COMPLETED`, zero second POST, missing completed Task tolerated |
| Incident | BLOCKED / CHILD REQUIRED | `native-process-death-recovery.test.ts` proves both commit outcomes produce only a Process-B GET and no fabricated report/replay; no lawful exact-recovery identity exists |
| Guest Access | PASS | same Native suite proves ACTIVE server state with no retained raw bearer; existing recovery suite covers issue/revoke ambiguity |
| Check-In intake | ALREADY COVERED | `employee-check-in-recovery.test.ts` constructs a fresh session and restores server drafts/continuations; `employee-check-in-session.test.ts` proves same-process exact ID reuse; API integration proves durable idempotency |
| Check-In condition/detail correction | ALREADY COVERED | condition/correction recovery suites prove canonical reread, no append replay, stale version, and identity purge |
| Auth / account / scope replacement | PASS | new Task test plus `native-auth-storage-matrix.test.ts`, shift fences, Native auth-race tests, and workflow purge tests |

## Incident child required

Accepted policy allows manual retry of the same logical Incident using its
actor-bound stable ID. Production generates that ID inside
`NativeIncidentSession` and retains it only in memory. The server deduplicates
that ID but exposes no employee read/list/by-ID route capable of discovering a
committed lost response. After process death, generating a new ID for an
explicit resubmission can create a second Incident for the same occurrence.

Required focused child/decision: define a narrow, privacy-safe Incident
process-death recovery contract. It must decide whether an allowed durable
incident intent identity (without protected draft content) or a scoped
canonical server discovery/read is authoritative, including retention, actor,
Organization/Location/session binding, logout/scope purge, collision, and
changed-payload behavior. Responsible current modules are:

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

- Employee client: 62 files / 457 tests passed; lint, typecheck, and build passed.
- Native: 135 files / 1,044 tests passed; lint and typecheck passed.
- PostgreSQL command invariants: 17 files / 144 tests passed for Shift Start/End,
  intake, Dispatch, Start/Confirm Parking, Start Retrieval, Mark Ready, handoff
  atomicity/proof concurrency, final-release command/atomicity/concurrency and
  terminal staff reads, Incident, and Guest Access. One release test needed a
  15-second CLI timeout after exceeding the default five seconds in fixture setup.
- Architecture check passed with only pre-existing grandfathered-size warnings.
- Changed-file Prettier and `git diff --check` passed before commit.

G7 remains open: the binding plan requires both MOB-023B and MOB-024B, and this
evidence cannot close that gate.
