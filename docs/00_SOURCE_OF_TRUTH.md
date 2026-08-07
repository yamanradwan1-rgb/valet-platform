# Source of Truth

Status: Binding  
Version: 0.1

## Primary source

The primary product reference is:

`docs/reference/Valet_Project_Concept_Arabic.pdf`

The project is not merely a customer valet application. It is a digital operating system for the valet workflow.

The intended system covers the vehicle journey from arrival to release, including:

- employee intake
- vehicle identification
- condition photos
- digital ticket
- parking location
- key location
- customer retrieval request
- employee assignment/retrieval
- secure handoff
- payment/receipt where enabled
- operational audit trail
- management dashboard

## Three MVP surfaces

1. Valet Employee App
2. Customer QR/SMS/Web Experience
3. Management Dashboard

A customer mobile app is NOT required for the initial MVP.

## Product priorities

1. Operational speed
2. Correctness and traceability
3. Secure vehicle handoff
4. Reliable key/parking location
5. Low-friction customer retrieval
6. Management visibility
7. Payments
8. Advanced analytics
9. AI/automation later

## Core differentiator to preserve

The system must maintain a reliable digital chain of custody.

For a session, authorized staff must be able to determine:

- who received the vehicle
- when it was received
- who captured condition evidence
- where it was parked
- where the key was placed
- who accepted retrieval
- who retrieved it
- when it became ready
- who released it
- which verification method was used

## Performance requirement

Any product decision that materially increases employee check-in friction requires explicit review.

The target is not feature quantity. The target is a workflow fast enough to replace paper during real peak traffic.

## Reliability requirement

The employee workflow must remain compatible with future offline operation.

Full offline sync may follow the first online core flow, but IDs, timestamps, mutation semantics and idempotency must not make offline support require a domain redesign.

## Change rule

When the project owner changes an important requirement:

1. Add an accepted entry to `08_DECISIONS_LOG.md`.
2. Update affected binding docs.
3. Update implementation.

Do not rely on chat history as the only record of an important product decision.


## Collaboration source

Important implementation coordination must be represented in the shared repository through:

- GitHub Issues/tasks
- branches
- Pull Requests
- accepted decisions
- binding documentation

Do not rely on private AI-agent conversation history to communicate project-critical assumptions to the other contributor.
