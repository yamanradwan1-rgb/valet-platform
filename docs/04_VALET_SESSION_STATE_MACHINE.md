# ValetSession State Machine

Status: Binding  
Version: 0.2

## Scope

ValetSession state represents the vehicle's physical/operational custody lifecycle only.

Do not put payment, incident, notification, photo/upload, Shift, or Dispatch assignment states into this enum.

Blueprint v1.0 separates physical custody from task assignment. Assignment/reassignment is tracked by the Task/Dispatch lifecycle, not by a `RETRIEVAL_ASSIGNED` ValetSession state.

## Canonical MVP states

```text
CHECKING_IN
AWAITING_PARKING
PARKING
PARKED
REQUESTED
RETRIEVING
READY
HANDOFF_PENDING
COMPLETED
```

Terminal:

- `COMPLETED`

`READY` is the canonical MVP state for the Blueprint's `STAGED/READY` position. A staging zone/spot may be represented as parking/location data without adding a second session state unless a later accepted workflow requires it.

`INCIDENT` is not a normal ValetSession state. Incidents have their own lifecycle and can block/guard commands while the physical custody state remains truthful.

## Main path

```text
CHECKING_IN
  |
  v
AWAITING_PARKING
  |
  v
PARKING
  |
  v
PARKED
  |
  v
REQUESTED
  |
  v
RETRIEVING
  |
  v
READY
  |
  v
HANDOFF_PENDING
  |
  v
COMPLETED
```

## CHECKING_IN

Vehicle intake is in progress and custody/guest access is being established.

Activities may include:

- OCR/ANPR plate scan
- confirm/edit or manual plate fallback
- customer phone/link setup when available
- vehicle condition check
- photos according to configured policy
- intake actor/timestamps

Allowed:

- `CHECKING_IN -> AWAITING_PARKING`

Guard for AWAITING_PARKING:

- valid/authorized Location
- valid vehicle identification or approved no-plate/manual fallback once that contract is implemented
- authorized receiving employee
- required condition information complete
- configured photo requirement satisfied when policy requires photos
- session/customer access data valid where used

OCR confidence alone must never block manual fallback.

## AWAITING_PARKING

Check-in is complete; vehicle/key are ready for the Parking task to start.

Typical activities:

- QR key-slot assignment or permitted manual fallback
- create/queue/assign Parking task through Hybrid Dispatch

Allowed:

- `AWAITING_PARKING -> PARKING`

Guard for PARKING:

- authorized employee/task ownership according to Dispatch rules
- key custody assignment satisfies current location policy

## PARKING

Vehicle is actively being moved to a parking zone/spot.

If session tracking is enabled by policy, Parking tracking starts on entry and ends when the vehicle becomes PARKED.

Allowed:

- `PARKING -> PARKED`

Guard for PARKED:

- permitted Zone/Spot assigned according to Location policy
- QR proof used when required; manual fallback allowed when policy permits
- key/vehicle custody remains valid
- responsible actor known

On PARKED:

- set `parked_at`
- stop active Parking tracking when enabled
- append parked/custody events
- notify guest according to configured channel/template

## PARKED

Vehicle is safely parked and waiting.

Allowed:

- `PARKED -> REQUESTED`

On retrieval request:

- create/open a RetrievalRequest idempotently
- create/queue the Retrieval task
- set `retrieval_requested_at`

Repeated guest requests must return/show the current active request rather than create duplicate active RetrievalRequests/tasks.

## REQUESTED

A valid retrieval request exists and the retrieval task is queued/assigned/accepted separately through Hybrid Dispatch.

Allowed:

- `REQUESTED -> RETRIEVING` when an authorized employee actually starts Retrieval
- `REQUESTED -> PARKED` for an authorized cancellation before Retrieval starts

Do not add a ValetSession `ASSIGNED` state. Task assignment belongs to the Task lifecycle.

Guard for RETRIEVING:

- active retrieval request exists
- authorized/accepted task owner according to Dispatch rules
- key checkout/custody is valid

## RETRIEVING

Employee is actively retrieving the vehicle.

If session tracking is enabled by policy, Retrieval tracking starts on entry and stops when the vehicle becomes READY.

Allowed:

- `RETRIEVING -> READY`
- `RETRIEVING -> PARKING` only through an explicit audited return-to-parking exception/cancellation flow once its focused task defines required guards

On entry:

- set `retrieval_started_at`
- record key checkout/custody actor/time
- start Retrieval tracking if configured

## READY

Vehicle is physically staged/ready at the handoff/pickup point.

Allowed:

- `READY -> HANDOFF_PENDING`
- `READY -> RETRIEVING` only as an explicit correction when the vehicle was marked ready incorrectly and must be moved/retrieved again

On entry:

- set `ready_at`
- stop Retrieval tracking when enabled
- notify guest that vehicle is ready

Guard for HANDOFF_PENDING:

- authorized releasing employee
- vehicle/session matches the intended guest handoff
- payment/validation preconditions are satisfied when required by Location policy, or the workflow explicitly allows payment during HANDOFF_PENDING

## HANDOFF_PENDING

Vehicle is physically ready and the secure release process is active.

Normal Standard handoff policy accepts either:

- Dynamic one-time QR
- 4-digit pickup code

Supervisor override is exceptional and requires permission, reason and audit.

Allowed:

- `HANDOFF_PENDING -> COMPLETED`
- `HANDOFF_PENDING -> READY` when handoff is safely aborted/paused before release

Guard for COMPLETED:

- valid unconsumed handoff verification OR authorized audited supervisor override
- verification method allowed by Location policy
- releasing employee authorized
- vehicle/session identity still matches
- payment/validation policy satisfied
- no blocking incident/exception remains unresolved where policy requires blocking

## COMPLETED

Vehicle was handed to the authorized recipient and the custody session is closed.

Terminal.

On entry:

- set `completed_at`
- set completing/releasing actor
- consume verification
- complete RetrievalRequest/Task
- finalize applicable key custody
- append handoff/session-completed Black Box events
- make receipt/rating flow available when configured

Never rewrite completed custody history to hide later mistakes. Use incidents and append-only corrective events.

## Task / Hybrid Dispatch lifecycle

Task status is separate from ValetSession state.

Canonical task path:

```text
QUEUED
  |
  v
ASSIGNED
  |
  v
ACCEPTED
  |
  v
IN_PROGRESS
  |
  v
COMPLETED
```

Alternative outcomes/events may include:

- `REASSIGNED`
- `DECLINED`
- `CANCELLED`
- `INCIDENT`

Rules:

- system may suggest/assign based on basic MVP eligibility/load/location/zone context
- supervisor can reassign
- reassignment after acceptance records actor + reason
- concurrent assignment/acceptance must not create two active owners for one task
- task timeout/requeue behavior is configurable later and must not be invented before its focused task

## Transition table

| From | To | Command / meaning |
|---|---|---|
| CHECKING_IN | AWAITING_PARKING | complete-check-in |
| AWAITING_PARKING | PARKING | start-parking |
| PARKING | PARKED | confirm-parked |
| PARKED | REQUESTED | request-retrieval |
| REQUESTED | PARKED | cancel-retrieval-before-start |
| REQUESTED | RETRIEVING | start-retrieval |
| RETRIEVING | READY | mark-ready |
| RETRIEVING | PARKING | return-to-parking-exception (guarded; focused flow required) |
| READY | RETRIEVING | correct-ready |
| READY | HANDOFF_PENDING | begin-handoff |
| HANDOFF_PENDING | READY | abort-handoff |
| HANDOFF_PENDING | COMPLETED | complete-handoff |

Any transition not listed is forbidden until this document changes or a referenced focused exception flow is accepted.

## Important Blueprint exception rules

### Duplicate request

One session cannot create multiple active RetrievalRequests/tasks from repeated guest presses.

### Early retrieval cancellation

If Retrieval has not started, return `REQUESTED -> PARKED` through an explicit command.

If Retrieval has started, do not silently jump states. A later focused workflow must choose between staging/READY or explicit return-to-parking based on policy and actual physical custody.

### Wrong phone / no phone

Guest-contact correction and manual supervisor verification do not justify arbitrary physical state changes. Sensitive corrections are audited.

### Key missing / wrong key / wrong vehicle

Verification mismatch or key incident blocks unsafe completion and opens/updates an Incident while preserving physical custody state.

### Internet outage

Offline/retry behavior must preserve idempotency. Server-required payment/verification operations may require a separately documented fallback; do not weaken security silently.

### Invalid/abandoned check-in

Blueprint v1.0 does not fully define a post-session-creation terminal cancellation state for an invalid/abandoned check-in. Do not add `CANCELLED` to the canonical session enum or hard-delete the session without a later accepted decision.

## API/domain command rule

Forbidden:

```text
PATCH /valet-sessions/:id
{ "state": "READY" }
```

Preferred explicit commands conceptually include:

```text
POST /valet-sessions/:id/complete-check-in
POST /valet-sessions/:id/start-parking
POST /valet-sessions/:id/confirm-parked
POST /valet-sessions/:id/request-retrieval
POST /valet-sessions/:id/cancel-retrieval
POST /valet-sessions/:id/start-retrieval
POST /valet-sessions/:id/mark-ready
POST /valet-sessions/:id/begin-handoff
POST /valet-sessions/:id/verify-handoff
POST /valet-sessions/:id/complete-handoff
```

Task/Dispatch commands are separate from session commands.

Each protected command:

1. authorizes tenant/resource/location/role
2. loads current entity/version
3. validates current state
4. validates configuration/policy guards
5. performs domain mutation
6. appends required Black Box/audit/custody event
7. commits atomically
8. returns updated representation

## Required tests

When this state machine is implemented, include at minimum:

- every allowed transition
- representative forbidden transitions from every state
- configured photo-policy guard
- duplicate retrieval request idempotency
- concurrent task assignment/acceptance protection
- retrieval cancellation before start
- release/completion without verification
- expired/reused pickup code/QR secret
- unauthorized supervisor override
- payment/validation-before-handoff guard when configured
- tenant/location boundary attempts
- tracking start/stop bound to correct task/session states
- transition/audit atomicity
- offline/retry duplicate-command safety where implemented