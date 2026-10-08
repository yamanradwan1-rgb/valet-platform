# DEC-057 — Phase 6 Financial Release Guard and Safe Projections

Status: Accepted

Date: 2026-08-20

## Decision

VAL-008G composes the canonical Payment aggregate into the existing protected
vehicle-release transaction and exposes narrow, read-only Guest and staff
financial projections. It does not create a second payment authority.

### Current release policy

The effective `release_requires_payment` value is resolved at release time from
the Company default and nullable Location override:

```text
Organization release_requires_payment
  -> Location release_requires_payment_override when non-null
```

The caller never supplies this policy. The complete-handoff transaction locks
the canonical ValetSession first, proves the existing handoff authority and
lifecycle, resolves and locks current policy, then locks the canonical Payment
before any verification consumption, custody, request, Task, session, dispatch,
or audit write.

If the effective policy is false, release is financially satisfied even when no
Payment exists. If it is true, a Payment must exist and exactly one of these
canonical projections must hold:

- zero due: `NOT_REQUIRED`, `amount_due = 0`, `amount_paid = 0`,
  `collection_method = NONE`, `paid_at IS NULL`, and provider/reference are
  null;
- collected: `PAID`, `amount_due > 0`, `amount_paid = amount_due`, and
  `paid_at IS NOT NULL`; CASH requires null provider/reference, while DIGITAL
  requires non-null provider/reference.

Every other missing or incoherent state fails closed with
`FINANCIAL_RELEASE_NOT_SATISFIED` (HTTP 409 and a generic safe message). Refund
state never changes this predicate. Release reads but never mutates financial
history. A blocked attempt rolls back without changing handoff verification,
custody, RetrievalRequest, Task, dispatch, ValetSession, or audit state.

### Read-only projections

The production routes are:

- `GET /v1/guest/valet-sessions/:sessionId/payment`
- `GET /v1/staff/valet-sessions/:sessionId/payment`

Both resolve the current effective release policy and calculate the same pure
release predicate. Payment absence is represented as `payment: null`. The
current Validation is included without historical Validation rows. Refunds of
all statuses are ordered by `requested_at`, then internal id.

The Guest route requires the current authorized Guest Access context for the
exact path session, retains the existing anti-abuse and no-store boundary, and
returns only the narrow projection below. During DEC-064 T1 rollout that
authority is exactly one unconsumed legacy bearer or current Guest Browser
Session; mixed authority fails closed. A valid 24-hour post-`COMPLETED` Browser
Session may use this read-only projection as approved receipt behavior, but it
grants no financial mutation or release authority:

- `releaseRequiresPayment`, `releaseSatisfied`;
- Payment payer, service/tip/due/paid amounts, current Validation mode/amount,
  currency, collection method, status, and paid time;
- Refund amount, status, requested time, and completed time.

It exposes no internal ids, tenant/location ids, provider data, reasons,
authorizers, idempotency identities, operation/event data, or audit data.

The staff route returns the same projection plus Payment id, Refund id, and
Payment `updatedAt`. It exposes none of the other excluded fields. Access is
limited to an active user and membership with explicit access to the exact
active Organization/Location: LOCATION_MANAGER needs no Shift;
VALET_EMPLOYEE and VALET_SUPERVISOR need their own ACTIVE Shift at that exact
Location; ORG_ADMIN is denied. Task ownership is not required for this read.

### Concurrency and authority

The existing complete-handoff transaction is the only release mutation. Its
ValetSession lock serializes Payment absence against Payment initialization.
Current Organization/Location policy locks serialize policy reads against
policy mutation, and a Payment row lock serializes the predicate against cash,
digital provider-event, correction, and Refund-related Payment activity.

The projections are side-effect-free with respect to Payment, Validation,
Refund, handoff, custody, session, Task, dispatch, and audit state. Guest
anti-abuse accounting remains part of the existing security boundary.

### Explicit non-goals

VAL-008G does not add or change:

- Prisma schema, constraints, indexes, migrations, or runtime privileges;
- Payment, Validation, Refund, collection-operation, or provider-event writes;
- Refund creation/reconciliation semantics;
- provider integrations, checkout, callback routes, or release overrides;
- public financial identifiers or a generic Payment lookup;
- VAL-008H behavior.

Migration count remains exactly 28.

## Reason

Vehicle release must use the canonical, current financial truth without
allowing provider ambiguity, refunds, caller input, or stale policy to become an
alternate authority. Narrow projections let the authenticated Guest and
operational staff understand the current requirement without exposing internal
financial correlation, authorization, or provider data.

## Consequences

- Financial satisfaction becomes a mandatory guard inside the atomic release
  boundary when current policy requires payment.
- Canonical Payment remains the sole source of release financial truth.
- Guest and staff receive purpose-specific projections with different id
  disclosure boundaries.
- No schema, migration, dependency, or runtime-role change is required.

## Affected docs/code

- `docs/08_DECISIONS_LOG.md`
- `apps/api/src/modules/retrieval/**`
- `apps/api/src/modules/payments/**`
- `apps/api/src/common/http/api-errors.ts`
- `packages/contracts/src/payments.ts`
- focused contracts, complete-handoff, Payment API, authorization, privacy, and
  concurrency tests

## Owner-approved U-07 / T3 amendment (2026-10-08)

See the canonical DEC-024 amendment and
[Guest T3 policy](../GUEST_T3_POLICY_AND_EVIDENCE.md). That amendment supersedes
historical Guest quota/allocation and address-reservation mechanics only for
T3 admission. It changes no credential, authorization, custody, business retry,
audit, foreground notification or handoff-proof contract in this decision.
