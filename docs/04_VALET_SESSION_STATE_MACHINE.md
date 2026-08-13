# ValetSession State Machine

Status: Binding  
Version: 0.3

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

The only normal command that performs this transition is `complete-check-in`.

### Locked `complete-check-in` command contract

This is the first locked Phase 2 protected custody command. It is not a generic session patch and it must not perform parking, key, task, dispatch, retrieval, handoff, payment, incident, or notification lifecycle work.

VAL-004H implements this contract as a dedicated internal command executor. VAL-004I owns later controller/API mapping, end-to-end integration and performance instrumentation.

#### Command inputs and authority

The command identifies the target `ValetSession` and requires the caller's expected current session `version`.

Organization, Location, actor membership, current state, current version, Vehicle ownership, and all protected resource relationships are server-derived from authorized records. A client-supplied organization/location/actor identifier is never trusted to establish authority.

The current `version` field is the single optimistic-concurrency mechanism for this aggregate unless a later accepted decision changes it.

#### Authorization boundary

Before any mutation, all of the following must hold:

1. the caller is an authenticated staff User whose User status is `ACTIVE`
2. the caller has an `ACTIVE` OrganizationMembership in the same Organization as the ValetSession
3. the Organization and target Location are active for normal operation
4. the membership has explicit authorized access to the ValetSession Location through the accepted location-access model
5. the ordinary operational role is `VALET_EMPLOYEE` or `VALET_SUPERVISOR`
6. the ValetSession and linked Vehicle resolve inside the same authorized tenant/resource scope

`LOCATION_MANAGER` and `ORG_ADMIN` do not receive ordinary field check-in completion authority merely because those roles have broader management visibility/configuration responsibilities. A later explicit permission-set decision may grant an equivalent operational permission without changing the state-machine semantics.

An active Shift is **not** a hard authorization prerequisite for `complete-check-in`. Shift state may be imperfect; the actual completing actor must still be recorded. This preserves the domain rule that important operational events retain the acting membership even when Shift state is imperfect.

The completing actor may differ from `checked_in_by_membership_id` when an authorized operational handoff occurred during intake. `complete-check-in` does not rewrite `checked_in_by_membership_id`; the completing actor is preserved in the AuditEvent.

#### State and optimistic concurrency

The command requires:

- persisted state exactly `CHECKING_IN`
- caller-provided `expectedVersion` exactly equal to the persisted `version`

Error precedence for a resolved/authorized session is stable:

1. if persisted `version != expectedVersion`, fail with `VERSION_CONFLICT`
2. otherwise, if state is not `CHECKING_IN`, fail with `INVALID_STATE_TRANSITION`

The final write must still be conditional on both the expected version and `CHECKING_IN` state so a race between validation and mutation cannot succeed.

On success, `version` increments exactly once. No second lock/version column or alternate concurrency counter is introduced by this command.

#### Intake guards

Before transition, the command must establish:

- the Location/session/Vehicle relationships are valid and authorized
- Vehicle identity satisfies either the accepted known-plate contract or DEC-020 no-plate fallback with a valid `temporary_descriptor`
- the completing actor satisfies the authorization boundary above
- required vehicle condition information is complete
- photo requirements are satisfied only when the active typed Company/Location policy requires photos; photos remain optional by default
- guest/session access persistence is structurally valid where that access path is used

OCR/ANPR confidence is never a completion requirement. Confirm/edit/manual input remains authoritative and the accepted no-plate fallback must remain usable.

VAL-004C persists `ConditionNote`, private `VehiclePhoto` metadata, the condition-completion marker and typed Organization-default/Location-override photo policy. VAL-004G implements the locked current-policy/current-evidence guard, and VAL-004H reuses that guard while already owning the ValetSession row lock.

VAL-004F implements guest credential issuance, revocation and resolution separately. Guest credential usability is not a physical `complete-check-in` prerequisite: a disabled, expired or revoked credential and a session without Customer/contact may still pass the physical intake guards. `complete-check-in` never issues, resolves, rotates, revokes, returns or audits guest material.

Key-slot assignment, ParkingSpot/Zone assignment, Parking task creation/assignment, and Hybrid Dispatch are not prerequisites or side effects of `complete-check-in`; they belong after the session reaches `AWAITING_PARKING`.

#### Server-authoritative success effects

A successful `complete-check-in` transaction performs only these custody effects:

1. set `state = AWAITING_PARKING`
2. set `checking_in_completed_at` to one server-authoritative timestamp
3. increment `version` exactly once
4. append the required AuditEvent/Black Box event using the same transaction
5. return the updated authorized session representation

The command does not change `parking_spot_id`, `key_slot_id`, current task/dispatch state, retrieval state, payment state, handoff state, or incident/notification state.

#### Audit / Black Box contract

The mutation and its required AuditEvent either both commit or both roll back.

For this command the stable event contract is:

- `event_type = VALET_SESSION_CHECK_IN_COMPLETED`
- `entity_type = VALET_SESSION`
- `entity_id = ValetSession.id`
- matching Organization, Location, and ValetSession scope
- `actor_membership_id =` the authorized completing membership
- `occurred_at =` the same server-authoritative operation time used for completion
- safe metadata sufficient to explain the transition, limited by default to fields such as `from_state`, `to_state`, `from_version`, and `to_version`

Audit metadata must not contain a raw guest access token, raw phone secret, pickup code, authentication token, password, provider secret, payment credential, or other bearer/reusable secret. Do not redesign the AuditEvent table for this command.

#### Retry / idempotency boundary

Optimistic concurrency prevents the same successful transition from being applied twice, but `version` is **not** a durable command-idempotency record.

Minimum locked behavior:

- a retry using a stale `expectedVersion` cannot replay the mutation and returns `VERSION_CONFLICT`
- a caller that refreshes to the new version and tries `complete-check-in` again sees `INVALID_STATE_TRANSITION`
- neither case appends a second check-in-completed AuditEvent because the AuditEvent is inserted only in the transaction that actually wins the guarded state/version mutation

This is sufficient to prevent duplicate transition/audit side effects. It does not provide transparent "return the original success response" semantics for an offline duplicate submission.

If the offline/retry implementation requires distinguishing an exact retry from a new semantic command and returning the original successful result, a stable client/device operation identifier with durable uniqueness is required in a focused follow-up persistence task. The current nullable, non-unique `AuditEvent.idempotency_key` is not by itself a sufficient uniqueness guarantee and must not be presented as one.

#### Implemented dependency foundation

VAL-004B through VAL-004G now provide the accepted authorization/transaction/runtime-role foundation, intake persistence, Vehicle identity commands, intake session creation, separate secure guest access and the current condition/photo-policy guard. VAL-004H consumes those existing surfaces without changing schema or weakening their contracts.

Durable operation-id persistence remains deferred unless a later offline/retry task requires transparent replay of the original success response. VAL-004H intentionally preserves the locked version/state retry behavior instead.

#### Stable command errors

The implementation should use the existing cross-cutting access/concurrency errors where applicable and adds these check-in-specific meanings:

- `TENANT_ACCESS_DENIED`
- `LOCATION_ACCESS_DENIED`
- `VERSION_CONFLICT`
- `INVALID_STATE_TRANSITION`
- `VEHICLE_IDENTITY_INCOMPLETE`
- `CONDITION_CHECK_INCOMPLETE`
- `PHOTO_REQUIREMENT_NOT_SATISFIED`

`GUEST_ACCESS_INVALID` is not a normal `complete-check-in` guard or error.

Do not expose whether an unauthorized cross-tenant resource exists merely to provide a more specific error.

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

- current eligible Retrieval Task owner through the explicit initiate-handoff command
- vehicle/session matches the intended guest handoff
- payment/validation preconditions are satisfied when required by Location policy, or the workflow explicitly allows payment during HANDOFF_PENDING

## HANDOFF_PENDING

Vehicle is physically ready and the secure release process is active.

Normal Standard handoff policy accepts either:

- Dynamic one-time QR
- 4-digit pickup code

Supervisor override is exceptional and requires permission, reason and audit.
It is valid only while already `HANDOFF_PENDING`; it never performs
`READY -> HANDOFF_PENDING`. If the current Task owner is unavailable, use the
existing audited Dispatch/reassignment commands before initiation.

Allowed:

- `HANDOFF_PENDING -> COMPLETED`
- `HANDOFF_PENDING -> READY` when handoff is safely aborted/paused before release

Guard for COMPLETED:

- valid unconsumed handoff verification OR authorized audited supervisor override
- Standard verification is still unexpired and its method remains allowed by
  the current effective Company-default/Location-override policy at release time
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

For `complete-check-in` specifically, focused implementation coverage must include:

- allowed employee and supervisor completion with explicit Location access
- denied inactive user/membership and denied unauthorized role/location/tenant scope
- no hard dependency on an active Shift
- known-plate and accepted no-plate Vehicle identity paths
- condition guard and optional/default photo behavior once their persistence exists
- required-photo policy rejection once typed policy/photo persistence exists
- `VERSION_CONFLICT` on stale expected version
- `INVALID_STATE_TRANSITION` when version is current but state is not `CHECKING_IN`
- exactly one version increment and server-owned completion timestamp
- exactly one check-in-completed AuditEvent for the winning mutation
- mutation/audit rollback together on failure
- duplicate retry does not append another AuditEvent
- safe audit metadata without bearer/verification/payment secrets
- no parking/key/task/dispatch side effects
