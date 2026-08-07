# Definition of Done

Status: Binding  
Version: 0.1

A feature is complete only when all applicable checks pass.

## Product

- matches MVP scope
- no unapproved feature creep
- session behavior matches state machine
- operational flow remains fast

## Domain

- invariants explicit
- invalid transitions rejected
- tenant ownership enforced
- custody-sensitive action audited

## Database

- schema doc updated
- new migration added
- FKs/constraints/indexes added
- no destructive migration without review
- seed/fixtures updated when needed

## Security

- authorization tested
- secrets/OTP/PII not leaked in logs
- guest access scoped
- upload/payment/handoff rules followed

## Backend

- request validation
- stable error codes
- transaction safety
- idempotency defined for retryable operations
- concurrency behavior covered

## Tests

At minimum:

- happy path
- invalid input/state
- authorization failure
- tenant isolation
- concurrency/idempotency where relevant

## UI

- loading state
- error state
- success state
- duplicate-submit protection
- mobile usability for valet/customer apps

## Documentation

If behavior changed, update the binding docs first.

## Operational acceptance

Core path contributes toward:

receive -> evidence -> park -> request -> retrieve -> verify -> release


## Collaboration / merge

- work is linked to a scoped task/Issue
- PR stays within approved scope
- dependencies are reported instead of silently expanding scope
- high-contention files were coordinated
- required CI passes:
  - lint
  - typecheck
  - test
  - build
- another human contributor reviewed the PR whenever practical
