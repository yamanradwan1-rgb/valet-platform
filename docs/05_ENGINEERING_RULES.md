# Engineering Rules

Status: Binding  
Version: 0.1

## Architecture

Use a modular monolith.

Do not create distributed services without an accepted decision.

## Backend ownership

Backend/domain layer owns business rules.

Clients may not:

- choose arbitrary session state
- authorize themselves
- decide tenant ownership
- validate OTP
- write audit events directly
- manufacture payment success

## PostgreSQL

PostgreSQL is the operational system of record.

Object storage stores vehicle images.

Redis is not required until a concrete need is demonstrated.

## Time

- store DB timestamps in UTC
- keep Location/Organization timezone configuration
- convert only for display
- server time is authoritative for operational mutations

## Validation

Use shared Zod schemas where a contract is shared between client/API.

Critical invariants must also be enforced in domain/database layers.

## Errors

Use stable machine-readable codes, e.g.:

- INVALID_STATE_TRANSITION
- PARKING_SPOT_OCCUPIED
- KEY_SLOT_OCCUPIED
- RETRIEVAL_ALREADY_REQUESTED
- RETRIEVAL_ALREADY_ASSIGNED
- HANDOFF_VERIFICATION_FAILED
- HANDOFF_VERIFICATION_EXPIRED
- HANDOFF_VERIFICATION_CONSUMED
- TENANT_ACCESS_DENIED
- VERSION_CONFLICT

## Logging

Never log:

- plaintext OTP
- passwords
- raw access/refresh/customer tokens
- payment card data
- unnecessary customer PII

Use request/correlation IDs.

## Testing priority

1. tenant isolation
2. state-machine correctness
3. handoff security
4. parking/key occupancy integrity
5. audit integrity
6. concurrency/idempotency
7. payment callback idempotency
8. guest access authorization

## Offline readiness

Before implementing full offline sync:

- use idempotency keys for retryable mutations
- support client-generated stable operation IDs
- define conflict behavior
- use optimistic concurrency on active sessions

Do not implement complex sync before the online flow is stable.
