# DEC-055 — Phase 6 Provider Event Authority & Reconciliation

Status: Accepted
Date: 2026-08-20
Task: VAL-008E — Provider Event / Normalization / Reconciliation Foundation

## Context

DEC-021 accepts atomic normalized provider-event processing and DEC-054 adds a
durable outbound collection operation. Neither decision settles which
authenticated late or reordered events may resolve that operation, how a
definitive failure permits a later attempt, or how existing digital Refund rows
may be reconciled without provider-specific persistence.

VAL-008E remains provider-neutral. Real signature schemes, callback transports,
provider status names, SDK objects and retry schedules remain deferred until a
real provider is selected.

## Decision

### Authenticity and normalization boundary

A provider adapter/authenticator receives raw transport material, authenticates
it, and returns normalized facts together with a server-derived
`organizationId + provider` binding. Authentication and runtime normalization
complete before the financial transaction starts. The finance core receives no
caller-controlled verification boolean and has no raw payload/header/error
input.

Authentication or normalization failure creates no PaymentProviderEvent,
Payment, Refund, PaymentCollectionOperation or AuditEvent mutation.

The normalized result kinds are exactly:

```text
COLLECTION_SUCCEEDED
COLLECTION_FAILED
REFUND_SUCCEEDED
REFUND_FAILED
NO_FINANCIAL_CHANGE
```

Collection results carry a VAYLET `operationId`; Refund results carry a VAYLET
`refundId`. Every result carries a bounded provider event ID and may carry a
bounded safe result code. Terminal collection results and successful Refund
results require a bounded stable provider reference. Callback amount and
currency are deliberately absent and can never become financial authority.

### Durable event identity and transaction

The sole inbound deduplication identity is:

```text
(organization_id, provider, provider_event_id)
```

For a first accepted normalized event, duplicate resolution, canonical locks,
PaymentProviderEvent insertion, financial/operation/refund mutation and any
required AuditEvent occur in one transaction. A committed duplicate returns the
existing durable classification without repeating any mutation or audit. A
unique race loser rolls back its attempted transaction before re-reading the
winner. Failure before commit leaves no event row and remains retryable.

The ordinary runtime role receives only `SELECT, INSERT` on
`payment_provider_events`; update, delete, truncate, references and trigger
authority remain denied.

### Collection authority

Canonical Payment owns tenant, Location, money and currency. The operation owns
historical provider, amount, currency and correlation. Processing locks Payment
before its operation, verifies same Organization/Payment/provider, verifies the
operation snapshot still equals canonical money/currency, and applies these
rules:

- `PREPARED`: financial result is `IGNORED`; no dispatch authority existed.
- `OUTCOME_UNKNOWN`: a matching stable provider reference may be attached and a
  terminal result may resolve the operation atomically.
- `REFERENCE_ATTACHED`: a terminal result may resolve only when its provider
  reference exactly matches the persisted reference.
- `REJECTED`: every later event is stale and `IGNORED`; it cannot revive or pay.
- `RESOLVED`: every later event is reordered/stale and `IGNORED`; it cannot
  rewrite the resolved result.

A provider mismatch, provider-reference mismatch, incompatible Payment
projection, or superseded/terminal operation is `IGNORED` when the canonical
same-Organization Payment is safely known. A correlation that resolves no
same-Organization canonical object creates no event row because the existing
schema has no truthful Payment owner for that fact; it returns only a generic
non-disclosing ignored result.

### Collection success and failure projection

An authoritative `COLLECTION_SUCCEEDED` uses the persisted amount/currency,
sets the operation to `RESOLVED`, attaches/preserves the exact provider
reference, and sets Payment to `DIGITAL / PAID`, `amount_paid = amount_due` and
database-authored `paid_at`. It cannot act on an already paid or otherwise
incompatible Payment.

An authoritative definitive `COLLECTION_FAILED` is distinct from initiation
rejection, local throw, timeout and ambiguity. It resolves the operation, keeps
`amount_paid = 0` and `paid_at = NULL`, and sets Payment to `DIGITAL / FAILED`
with the historical provider/reference. A failure can never downgrade PAID.

After this failed operation is terminal, a fresh submission key may start a new
attempt only after all normal fresh policy, cash/evidence, tenant, currency and
unresolved-operation guards pass. PREPARED creation changes `FAILED` back to
the coherent `DIGITAL / UNPAID` in-progress projection. Existing same-key retry
semantics remain unchanged and history is never rewritten.

### PROCESSED and IGNORED

An authoritative recognized success or definitive failure is `PROCESSED`.
An authenticated first-seen event that safely correlates but intentionally
causes no financial mutation is `IGNORED`. An ignored event's normalized durable
PaymentProviderEvent is sufficient receipt history and creates no AuditEvent.
Unauthenticated, malformed or uncorrelatable cross-tenant events are outside
the persistence boundary.

### Existing Refund reconciliation

VAL-008E may reconcile only an already-existing `PENDING` digital Refund. The
trusted binding and normalized `refundId` must resolve the same Organization,
canonical Payment and persisted Refund provider. A persisted provider reference
must match; otherwise a stable normalized reference may be attached.

- `REFUND_SUCCEEDED` sets `status = SUCCEEDED`, the stable provider reference,
  and database-authored `completed_at`.
- `REFUND_FAILED` sets `status = FAILED`, may preserve/attach the normalized
  reference, and keeps `completed_at = NULL`.

Payment collected history is never rewritten. Terminal or mismatched Refund
events are `IGNORED`. Runtime receives Refund `SELECT` and column-scoped UPDATE
only for `status`, `provider_reference` and `completed_at`; insert, broad update,
immutable-column update, delete, truncate, references and trigger authority are
denied. Refund creation, authorization, balance reservation and outbound
execution remain VAL-008F.

### Audit and privacy

Authoritative collection success/failure and Refund success/failure append one
normalized AuditEvent atomically. Metadata is allowlisted to VAYLET entity IDs,
provider, normalized result kind and optional safe result code. It excludes raw
payloads, headers, SDK values/errors, signatures, credentials, PAN/CVV, reusable
tokens and callback-controlled money.

### Provider-specific deferrals

VAL-008E adds no public callback route, provider SDK, signing secret, signature
algorithm, production test provider, checkout, wallet, 3DS, settlement polling
or real provider configuration. Those remain VAL-008I/J/K responsibilities.

## Rejected alternatives

- Passing `verified: true` into finance core: caller-controlled trust signal.
- Persisting raw callbacks as an inbox: contradicts the minimal committed-fact
  model and expands secret/privacy scope.
- Letting callback amount/currency update Payment: violates canonical money
  authority.
- Resolving PREPARED, REJECTED or RESOLVED operations: revives or rewrites
  non-authoritative history.
- Treating definitive failure as OUTCOME_UNKNOWN: permanently blocks a safe new
  attempt.
- Broad Refund UPDATE or INSERT authority: exceeds inbound reconciliation.
- A new provider event, attempt or ledger entity: existing persistence suffices.

## Database impact

No Prisma schema or migration change. Migration count remains 28. Runtime
privilege provisioning/verification is updated to match the least-privilege
contract above.
