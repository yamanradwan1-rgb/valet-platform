# ValetSession State Machine

Status: Binding  
Version: 0.1

## Scope

ValetSession state represents physical/operational vehicle custody only.

Do not put payment, incident, notification, upload or shift states into this enum.

## States

```text
INTAKE
PARKING
PARKED
RETRIEVAL_REQUESTED
RETRIEVAL_ASSIGNED
RETRIEVING
READY
RELEASED
CANCELLED
```

Terminal:

- RELEASED
- CANCELLED

## Main path

```text
INTAKE
  |
  v
PARKING
  |
  v
PARKED
  |
  v
RETRIEVAL_REQUESTED
  |
  v
RETRIEVAL_ASSIGNED
  |
  v
RETRIEVING
  |
  v
READY
  |
  v
RELEASED
```

## INTAKE

Vehicle is being checked in and custody is being documented.

Activities:

- identify vehicle
- capture required condition photos
- establish secure customer access
- record intake actor

Allowed:

- INTAKE -> PARKING
- INTAKE -> CANCELLED

Guard for PARKING:

- valid vehicle
- valid location
- authorized receiving employee
- required evidence complete OR authorized exception

## PARKING

Vehicle is being parked / location and key placement are being finalized.

Allowed:

- PARKING -> PARKED
- PARKING -> CANCELLED only through explicit authorized exception

Guard for PARKED:

- parking spot/zone assigned
- key slot assigned according to location policy
- responsible actor known

On PARKED:

- set parked_at
- append PARKED event

## PARKED

Vehicle is parked and waiting.

Allowed:

- PARKED -> RETRIEVAL_REQUESTED

## RETRIEVAL_REQUESTED

A valid request exists.

Allowed:

- RETRIEVAL_REQUESTED -> RETRIEVAL_ASSIGNED
- RETRIEVAL_REQUESTED -> PARKED when an authorized request cancellation is supported

On entry:

- create/open RetrievalRequest
- set retrieval_requested_at

Repeated customer requests must be idempotent.

## RETRIEVAL_ASSIGNED

An authorized employee owns the retrieval task.

Allowed:

- RETRIEVAL_ASSIGNED -> RETRIEVING
- RETRIEVAL_ASSIGNED -> RETRIEVAL_REQUESTED when requeued

On entry:

- set retrieval assignee
- set retrieval_assigned_at

Concurrent assignment must not assign the same task to two employees.

## RETRIEVING

Employee is actively retrieving the vehicle.

Allowed:

- RETRIEVING -> READY
- RETRIEVING -> RETRIEVAL_REQUESTED through audited exception/requeue

On entry:

- set retrieval_started_at
- audit key custody action

## READY

Vehicle is physically ready for handoff.

Allowed:

- READY -> RELEASED
- READY -> RETRIEVING only as an explicit correction

On entry:

- set ready_at
- customer notification when configured

Guard for RELEASED:

- valid unconsumed handoff verification
- verification method allowed by location policy
- releasing employee authorized
- payment-before-release policy satisfied if enabled

## RELEASED

Vehicle was handed to the authorized recipient.

Terminal.

On entry:

- set released_at
- set releasing actor
- consume verification
- complete retrieval request
- append VEHICLE_RELEASED audit event

Never rewrite the session to hide post-release mistakes. Use incident/audit records.

## CANCELLED

Early invalidation/correction.

Terminal.

Required:

- authorized actor
- cancellation reason
- cancelled_at
- audit event

Do not use CANCELLED to erase completed custody history.

## Transition table

| From | To | Command |
|---|---|---|
| INTAKE | PARKING | complete-intake |
| INTAKE | CANCELLED | cancel-intake |
| PARKING | PARKED | confirm-parked |
| PARKED | RETRIEVAL_REQUESTED | request-retrieval |
| RETRIEVAL_REQUESTED | RETRIEVAL_ASSIGNED | assign-retrieval |
| RETRIEVAL_REQUESTED | PARKED | cancel-retrieval |
| RETRIEVAL_ASSIGNED | RETRIEVING | start-retrieval |
| RETRIEVAL_ASSIGNED | RETRIEVAL_REQUESTED | requeue-retrieval |
| RETRIEVING | READY | mark-ready |
| RETRIEVING | RETRIEVAL_REQUESTED | retrieval-exception-requeue |
| READY | RETRIEVING | correct-ready |
| READY | RELEASED | release |

Any transition not listed is forbidden until this document changes.

## API/domain command rule

Forbidden:

```text
PATCH /valet-sessions/:id
{ "state": "READY" }
```

Preferred explicit commands:

```text
POST /valet-sessions/:id/complete-intake
POST /valet-sessions/:id/confirm-parked
POST /valet-sessions/:id/request-retrieval
POST /valet-sessions/:id/assign-retrieval
POST /valet-sessions/:id/start-retrieval
POST /valet-sessions/:id/mark-ready
POST /valet-sessions/:id/verify-handoff
POST /valet-sessions/:id/release
```

Each command:

1. authorizes tenant/resource
2. loads current session
3. validates current state
4. validates guards
5. performs domain mutation
6. appends audit event
7. commits atomically
8. returns updated representation

## Required tests

- every allowed transition
- every forbidden transition
- guards
- duplicate retrieval request
- concurrent employee assignment
- release without verification
- expired OTP
- reused OTP
- tenant-boundary attempt
- transition/audit atomicity
