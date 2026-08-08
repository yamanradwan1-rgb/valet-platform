# Engineering Rules

Status: Binding  
Version: 0.2

## Architecture

Use a modular monolith.

Do not create distributed services without an accepted decision.

## Backend ownership

Backend/domain layer owns business rules.

Clients may not:

- choose arbitrary ValetSession or Task state
- authorize themselves
- decide tenant/location ownership
- validate pickup codes / handoff secrets by themselves
- write audit/Black Box events directly
- manufacture payment/validation success
- decide tracking policy without server-authorized configuration

## PostgreSQL

PostgreSQL is the operational system of record.

Object storage stores vehicle images/attachments.

Redis is not required until a concrete need is demonstrated.

## Time, currency and location context

- store DB timestamps in UTC
- server time is authoritative for operational mutations
- each Location owns the authoritative timezone used for operational display/reporting
- each Location owns its applicable currency/payment context
- an Organization may provide defaults but must not override a Location-specific timezone/currency
- convert dates/numbers for display according to locale/location context

## Validation

Use shared Zod schemas where a contract is shared between client/API.

Critical invariants must also be enforced in domain/database layers.

OCR/ANPR output is proposed input only. Confirmed/edit/manual input is the operational value persisted by the application.

## State ownership

`ValetSession` represents physical custody only.

Task/Hybrid Dispatch assignment lifecycle is separate.

Do not reintroduce task states such as assignment/acceptance as physical ValetSession states.

Protected state changes use explicit commands, guards and audited transactions.

## Errors

Use stable machine-readable codes, e.g.:

- `INVALID_STATE_TRANSITION`
- `INVALID_TASK_TRANSITION`
- `PARKING_SPOT_OCCUPIED`
- `KEY_SLOT_OCCUPIED`
- `RETRIEVAL_ALREADY_REQUESTED`
- `TASK_ASSIGNMENT_CONFLICT`
- `HANDOFF_VERIFICATION_FAILED`
- `HANDOFF_VERIFICATION_EXPIRED`
- `HANDOFF_VERIFICATION_CONSUMED`
- `HANDOFF_OVERRIDE_NOT_ALLOWED`
- `TENANT_ACCESS_DENIED`
- `LOCATION_ACCESS_DENIED`
- `VERSION_CONFLICT`
- `IDEMPOTENCY_CONFLICT`

Do not freeze exact error-code vocabulary in unrelated tasks; add stable codes with the focused feature contract.

## Logging

Never log:

- plaintext pickup codes / OTP-equivalent secrets
- passwords
- raw access/refresh/guest tokens
- payment card data
- provider secrets
- unnecessary customer/employee PII
- precise task-scoped GPS data in generic application logs

Use request/correlation IDs and safe operation identifiers.

## Configuration First

When a feature has an approved configurable operating policy, apply the documented precedence:

```text
Company default -> Location override
```

Do not hard-code normal customer-specific policy differences that the product marks configurable.

Do not solve Configuration First with one speculative untyped catch-all JSON settings object. Introduce typed configuration contracts in focused tasks.

## Testing priority

1. tenant/location isolation
2. ValetSession state-machine correctness
3. Task/Dispatch assignment/concurrency correctness
4. secure handoff
5. parking/key custody integrity
6. Black Box/audit integrity
7. concurrency/idempotency/offline retry safety
8. payment/validation callback integrity
9. guest access authorization / anti-abuse
10. tracking start/stop + privacy boundaries

## Offline-friendly operation

Offline-friendly employee actions are part of the sellable MVP reliability direction.

Before implementing full sync behavior:

- use idempotency keys / stable operation IDs for retryable mutations
- support client/device operation identity where needed
- define conflict behavior
- use optimistic concurrency on contested active entities
- distinguish locally accepted work from server-authoritative verification

Implement offline capability incrementally after the corresponding online domain command is stable; do not create a separate offline domain model that diverges from the online workflow.

Payment/handoff operations that require authoritative online verification need an explicit safe fallback. Never weaken verification silently because connectivity is unavailable.

## Internationalization

Frontend/domain contracts must not assume one country or language.

Support the approved direction for:

- Arabic + English
- real RTL/LTR
- E.164-compatible normalized phone representation where applicable
- multi-country plate input/normalization rules
- per-Location timezone/currency
- locale-aware date/number presentation

Country-specific plate normalization must be explicitly defined before code depends on it.

## Provider boundaries

Messaging, payment, object storage, OCR/ANPR and Maps providers should remain behind application boundaries/adapters where practical.

Core business rules must not depend on one commercial provider unless an accepted decision explicitly locks it.
