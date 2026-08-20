# DEC-054 — Phase 6 Outbound Collection Operation Identity

Status: Accepted
Date: 2026-08-20
Task: VAL-008D — Provider-Neutral Digital Payment Boundary

## Context

VAL-008D must make outbound digital collection initiation durable before any
provider network call. Existing `Payment.creation_idempotency_key` identifies
creation of the canonical Payment, not a later collection submission.
`PaymentProviderEvent` deduplicates committed inbound provider events after
authentication and normalization; it cannot represent pre-dispatch intent,
dispatch ownership, a lost response, or retry of an unresolved outbound call.

The current Payment provider/reference projection also cannot preserve more
than one terminal rejected/resolved operation or distinguish a caller retry key
from VAYLET's provider correlation identity without overloading unrelated
fields. Existing persistence is therefore insufficient for the required
outbound retry and ambiguity invariants.

## Decision

### Focused persistence

Add `PaymentCollectionOperation`, a collection-only child of canonical Payment:

```text
id (operationId)
organization_id
payment_id
submission_idempotency_key
amount
currency
provider
state
provider_reference nullable
safe_result_code nullable
dispatch_guarded_at nullable
resolved_at nullable
created_at
updated_at
```

It does not duplicate Location or ValetSession. Those remain canonical on
Payment. It is not a generic PaymentAttempt, ledger, provider event, refund, or
settlement abstraction.

### Identities

`submissionIdempotencyKey` is untrusted caller retry identity scoped to one
Organization. It never supplies tenant, Payment, amount, currency, provider, or
provider-reference authority.

`operationId` is a server-generated durable UUID created once and persisted
before dispatch. Future real adapters map it to the provider's strongest
available idempotency/correlation mechanism. It is distinct from Payment
creation identity, submission identity, and provider reference.

### Lifecycle and dispatch fence

The exact lifecycle is:

```text
PREPARED -> OUTCOME_UNKNOWN -> REFERENCE_ATTACHED -> RESOLVED
                           \-> REJECTED
```

`PREPARED` is durable pre-dispatch intent. A new transaction claims dispatch
ownership with an Organization-scoped guarded compare-and-set from `PREPARED`
to `OUTCOME_UNKNOWN`, sets database/server time, appends the required audit,
and commits. Only that winner may call the provider, and no database
transaction remains open during network I/O.

Entering `OUTCOME_UNKNOWN` before the call is intentional. A process crash,
timeout, socket reset, lost response, adapter throw, or normalized ambiguous
result does not prove rejection. Such an operation is not blindly dispatched
again.

`REFERENCE_ATTACHED` records a normalized stable provider reference but is not
financial success. `REJECTED` records a definitive initiation rejection and is
terminal. `RESOLVED` is modeled for later event/reconciliation work, but
VAL-008D does not create that transition.

### Concurrency and tenant isolation

Database integrity enforces:

- unique `(organization_id, submission_idempotency_key)`;
- unique `(organization_id, provider, provider_reference)` when a reference is
  present through normal PostgreSQL null semantics;
- at most one unresolved operation per `(organization_id, payment_id)` where
  state is `PREPARED`, `OUTCOME_UNKNOWN`, or `REFERENCE_ATTACHED`;
- a composite same-Organization foreign key to Payment;
- positive amount, uppercase three-letter currency, nonblank provider, and the
  exact state/timestamp/reference row matrix.

All reads, inserts and transitions are Organization-scoped. Canonical Payment
owns Location, amount, currency and tenant authority. Concurrent insertion
uses conflict-safe winner re-read and stable domain classification; raw
PostgreSQL errors and constraint names are not public domain behavior.

### Historical provider binding and retries

A fresh operation snapshots an internally resolved provider. From PREPARED
onward, the persisted provider is historical authority. Configuration changes
never switch an existing operation. If its adapter is unavailable, it remains
PREPARED without claiming dispatch ownership.

An existing submission key is resolved before fresh-only policy/provider
guards. A matching operation is resumed or returned unchanged. Reuse for a
different Payment or materially incompatible immutable facts is an idempotency
conflict. A different key is rejected while an unresolved operation exists.
After terminal REJECTED, a new key may create a new operation if all fresh
guards pass.

### Payment projection and financial freeze

PREPARED creation is collection start. It may project Payment to DIGITAL with
the persisted provider and a null reference, while Payment remains UNPAID with
unchanged amount paid and null paid time. REFERENCE_ATTACHED may copy the same
normalized reference onto Payment. Initiation never marks Payment PAID.

Any operation history, including REJECTED or RESOLVED, permanently freezes
mutable pre-collection payer/service/tip/Validation terms. This historical
freeze is separate from the fresh-operation guard and does not prohibit a new
attempt after REJECTED.

### Audit, privacy, and database privileges

The normalized audit event types are:

```text
PAYMENT_COLLECTION_PREPARED
PAYMENT_COLLECTION_DISPATCH_GUARDED
PAYMENT_COLLECTION_REFERENCE_ATTACHED
PAYMENT_COLLECTION_REJECTED
```

Each required event commits atomically with its owning database mutation and
uses `PaymentCollectionOperation` as entity type. Metadata is allowlisted to
operation ID, Payment ID, provider, lifecycle state, and optional safe result
code. PAN, CVV, credentials, authorization material, raw provider bodies,
callbacks, SDK errors, and reusable payment/session secrets are prohibited.

The internal request boundary validates canonical UUID input and the existing
200-character submission-key limit before SQL. Normalized provider references
and safe result codes are bounded and control-character/code-shape checked
before persistence or audit. An unknown result kind or malformed normalized
output remains `OUTCOME_UNKNOWN`; it can never be interpreted as definitive
rejection.

The ordinary runtime role receives SELECT and INSERT on the operation table,
plus column-scoped UPDATE only for state, provider reference, safe result code,
dispatch-guard time, resolution time, and updated time. It receives no DELETE,
TRUNCATE, REFERENCES, TRIGGER, broad UPDATE, or authority to rewrite identity,
tenant, Payment, submission key, money, provider, or creation time.

### Stable errors

The internal boundary uses stable non-disclosing errors equivalent to:

```text
DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE
DIGITAL_COLLECTION_IDEMPOTENCY_CONFLICT
DIGITAL_COLLECTION_OPERATION_IN_PROGRESS
DIGITAL_COLLECTION_STATE_CONFLICT
```

No public HTTP mapping or route is added by VAL-008D.

## Database impact

Add exactly migration 28:

`20260816002800_phase6_payment_collection_operation`

Migrations 1–27 remain byte-for-byte immutable. Prisma models the focused enum,
table and relations. Runtime provisioning and verification enforce the least-
privilege contract above.

## Rejected alternatives

- Reusing Payment creation idempotency: wrong lifecycle and retry identity.
- Reusing PaymentProviderEvent: inbound committed-event evidence cannot be
  pre-dispatch outbound evidence.
- Storing operationId in Payment provider reference: conflates VAYLET and
  provider identities and loses terminal history.
- Generic PaymentAttempt/transaction ledger: broader than the accepted MVP
  requirement.
- Holding a database transaction across provider I/O: unsafe contention and no
  crash-safe ambiguity boundary.
- Treating timeout/throw as FAILED or REJECTED: can duplicate a remote charge.

## Explicit non-goals

VAL-008D does not add a real provider, provider SDK, checkout route, callback
authentication, provider-event reconciliation, provider status query, refund,
release guard, settlement, split tender, card storage, wallet, 3DS, or
provider-specific status/payload model.
