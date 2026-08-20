# DEC-056 — Phase 6 Refund Authority & Core

Status: Accepted
Date: 2026-08-20
Task: VAL-008F — Refund Core

## Context

The accepted financial model already provides append-only `Refund` persistence
and authenticated inbound reconciliation for an existing pending digital
Refund. VAL-008F must now authorize and reserve returned-money history without
rewriting the canonical Payment or pretending that a provider call occurred.

## Decision

### Authority and disclosure

Only an active `LOCATION_MANAGER` may create a Refund, and only for a canonical
Payment in the exact Organization and Location for which the persisted active
membership has explicit `MembershipLocationAccess`. The authenticated User,
membership, Organization, Location and authorizer are server-derived.

`VALET_EMPLOYEE`, `VALET_SUPERVISOR`, inactive memberships and `ORG_ADMIN` are
not authorized. `ORG_ADMIN` refund authority remains deferred until an Accepted
MFA-aware production authorization boundary exists. Missing, foreign and
unauthorized Payment identifiers are non-disclosing and share the existing
resource-unavailable behavior.

### Refundable exposure and locking

The remaining refundable balance is:

```text
Payment.amount_paid
- SUM(Refund.amount WHERE status IN (PENDING, SUCCEEDED))
```

`FAILED` does not consume current exposure. Creation locks the canonical
Payment before idempotency resolution, exposure aggregation and insertion, so
all Refund creation for one Payment serializes without sleep or timing
assumptions. Pending plus successful exposure may never exceed the positive
amount actually collected.

The requested amount must be positive, fit the existing exact decimal money
shape, be exactly representable at the canonical Payment currency's DEC-053
minor-unit exponent, and not exceed the remaining balance. No rounding,
truncation, caller currency or caller balance is accepted. The Payment must be
a coherent collected `PAID` cash or digital projection with positive
`amount_paid` and a non-null `paid_at`.

### Idempotency and immutable history

`(organization_id, idempotency_key)` is the durable retry identity. The key is
bounded before SQL. An exact retry must match Payment, exact normalized amount,
trimmed bounded reason and the server-derived authorizing membership; it
returns the existing Refund without another mutation or AuditEvent. Any
material mismatch returns stable `REFUND_IDEMPOTENCY_CONFLICT`. Concurrent
same-key requests converge on one Refund and one audit without exposing a raw
database error.

Reason is required, trimmed, bounded to 500 Unicode code points, and rejects
control characters. Reason and `authorized_by_membership_id` are immutable
after creation. Callers cannot supply tenant, Location, currency, provider,
provider reference, status, authorizer or timestamps.

### Cash Refund

A collected canonical cash Payment creates a Refund immediately as:

```text
status = SUCCEEDED
provider = NULL
provider_reference = NULL
requested_at = database transaction time
completed_at = the same database transaction time
```

This represents actual money returned. It creates no CashEntry and does not
reduce or otherwise rewrite Payment collection history.

### Digital Refund request

A collected canonical digital Payment with a valid bounded historical provider
creates a provider-neutral request as:

```text
status = PENDING
provider = Payment.provider
provider_reference = NULL
requested_at = database transaction time
completed_at = NULL
```

The Refund UUID is VAYLET-owned durable correlation identity. VAL-008F performs
no provider call and cannot synchronously claim success. Existing DEC-055
authenticated reconciliation alone may transition the row to `SUCCEEDED` or
`FAILED`. A failed row frees current exposure, while a retry with its original
key still returns that immutable failed row.

### Payment and custody history

Refund never changes Payment amount paid, paid time, collection method,
provider, provider reference or successful status. It never changes CashEntry
history and does not depend on ValetSession physical state; a valid Refund may
therefore be created after handoff or completion.

### Audit and atomicity

First creation appends exactly one `PAYMENT_REFUND_CREATED` AuditEvent in the
same transaction, with the authorized membership and allowlisted metadata:
Refund ID, Payment ID, amount, currency, collection method and resulting Refund
status. Reason text is deliberately excluded from audit metadata. Failure of
Refund insertion or audit rolls back the whole transaction and remains
retryable. Idempotent retry adds no audit. Provider reconciliation audit remains
owned by DEC-055.

### Runtime database authority

The ordinary runtime role receives Refund `SELECT`, column-scoped `INSERT` only
for the columns required to create a row, and retains DEC-055 column-scoped
`UPDATE` only for `status`, `provider_reference` and `completed_at`. It receives
no table-level INSERT or UPDATE and no DELETE, TRUNCATE, REFERENCES, TRIGGER,
ownership, DDL or SECURITY DEFINER bypass. `created_at` remains database-owned.

### API and provider deferrals

The protected staff route accepts only amount, reason and idempotency key under
the existing session Payment route. It exposes no guest Refund command.
Provider-specific outbound execution, SDKs, webhooks, polling, settlement,
wallets and retry schedules remain later selected-provider work.

## Database impact

No Prisma schema or migration change. Migration count remains 28. Existing
Refund constraints and identities are sufficient.

## Rejected alternatives

- Reducing `Payment.amount_paid`: rewrites collected history.
- CashEntry adjustment for returned money: conflates recording correction with
  real customer outflow.
- Synchronous digital success or a fake provider: fabricates provider truth.
- Broad Refund INSERT/UPDATE: exceeds the least-privilege lifecycle.
- ValetSession-state gating: conflates custody and financial history.
- ORG_ADMIN before MFA-aware authorization: weakens the Blueprint security gate.
