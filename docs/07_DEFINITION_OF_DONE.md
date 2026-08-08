# Definition of Done

Status: Binding  
Version: 0.2

A feature is complete only when all applicable checks pass.

## Product

- matches the approved MVP/V2/Enterprise boundary
- no unapproved feature creep
- behavior matches Founder & Product Blueprint v1.0 reconciliation and binding docs
- operational flow remains fast
- Configuration First behavior is respected where the feature is configurable
- Arabic/English / RTL-LTR impact is considered for user-facing work

## Domain

- invariants explicit
- invalid ValetSession/Task transitions rejected
- physical custody state and Dispatch task state remain separated
- tenant/location ownership enforced
- custody-sensitive action audited in Black Box history
- corrections append new events instead of rewriting historical facts

## Database

- schema doc updated before implementation when behavior/storage changes
- new migration added for schema changes
- FKs/constraints/indexes added where appropriate
- tenant-consistency protections reviewed
- no destructive migration without explicit review
- no rewriting already-applied migrations to hide later changes
- seed/fixtures updated when needed
- fresh-database migration verification performed for database foundation tasks

## Security / privacy

- authorization and least-privilege behavior tested
- secrets/pickup codes/PII not leaked in logs
- guest access scoped and anti-abuse considered
- upload/payment/handoff rules followed
- cross-tenant/cross-location negative tests included where applicable
- task-scoped GPS/tracking does not expand beyond approved policy
- sensitive override/refund/export actions have required reason/audit

## Backend

- request validation
- stable machine-readable errors where applicable
- transaction safety
- idempotency defined for retryable/offline-friendly operations
- concurrency behavior covered
- provider-specific messaging/payment/maps/OCR/storage behavior stays behind approved boundaries/adapters where practical

## Tests

At minimum, as applicable:

- happy path
- invalid input/state
- forbidden state/task transition
- authorization failure
- tenant/location isolation
- concurrency/idempotency
- duplicate request/submission protection
- policy/configuration guard behavior
- audit/Black Box atomicity for protected mutations

Feature-specific tests must cover the acceptance criteria in its Issue/task.

## UI / UX

For user-facing implementation:

- loading state
- error state
- success state
- empty state where relevant
- duplicate-submit protection
- accessible focus/interaction states
- employee touch targets/workflow remain practical for fast operations
- mobile usability for employee/customer surfaces
- responsive desktop behavior for Dashboard
- Arabic/English and RTL/LTR behavior where that surface is in scope

Design/wireframes alone do not make a feature operationally done; integrated behavior must match the backend/domain contract when frontend implementation is in scope.

## Configuration First

If the feature exposes a normal operating policy identified as configurable:

- approved Company default / Location override precedence is respected where applicable
- policy is not silently hard-coded per customer
- typed configuration contract is used instead of speculative untyped catch-all settings unless explicitly approved
- normal configuration change does not require redeploy when the product contract says it should be admin-configurable

## Documentation

If behavior changed, update binding docs first.

If a Blueprint gap remains unresolved, document the gap and stop rather than guessing inside implementation.

## Operational acceptance

Core product work should contribute toward the paid-customer-ready path:

```text
check-in
-> parking / key custody
-> request / Hybrid Dispatch
-> retrieval
-> ready
-> secure handoff
-> completed session
-> Black Box / reporting
```

Where enabled, payment/validation, tracking, incidents and notifications integrate with this path without replacing the physical ValetSession lifecycle.

## Quality checks

Before PR-ready:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Additional database/integration/security checks run when required by the task.

## Collaboration / merge

- work is linked to a scoped task/Issue
- one human owner / one branch
- PR stays within approved scope
- dependencies are reported instead of silently expanding scope
- high-contention files were coordinated
- required CI passes
- another human contributor reviewed the PR whenever practical
- AI-agent completion is not treated as merge approval
- work is not called DONE until merged
