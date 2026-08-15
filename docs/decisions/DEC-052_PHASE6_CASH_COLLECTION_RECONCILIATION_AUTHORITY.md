# DEC-052 — Phase 6 Cash Collection + Reconciliation Authority

Status: Accepted  
Date: 2026-08-16  
Task: VAL-008C  
Issue: #173

## Context

Phase 6 Batch 1 established canonical Payment creation, Validation, tips and guarded pre-collection corrections. VAL-008C now owns the cash-collection boundary and the smallest Blueprint-required `Cash Expected` versus `Cash Reported` Shift-facing reconciliation behavior.

Existing persistence already provides append-oriented `CashEntry` history with exact types `RECEIPT`, `ADJUSTMENT_INCREASE` and `ADJUSTMENT_DECREASE`, same-tenant actor ownership, `numeric(14,3)` amount, optional reason, server-authoritative occurrence time and organization-scoped submission idempotency.

Existing `Shift` persistence records operational ownership/status/timestamps only. It does not currently persist a durable close-time cash report or reconciliation snapshot.

DEC-021 and DEC-022 prohibit silently rewriting collected financial history, distinguish cash-recording corrections from actual returned customer money, and keep Payment lifecycle separate from ValetSession. DEC-051 already accepts that an ordinary Valet Employee may record cash/payment received through a server-owned action and that a Location Manager has full supported financial authority in an authorized Location subject to normal guards.

VAL-008C must not grow this boundary into drawer accounting, a general ledger, settlement, payroll or split-tender infrastructure.

## Decision

### 1. Cash receipt authority

The first-rollout cash receipt roles are:

- `VALET_EMPLOYEE` — allowed only while the actor owns an `ACTIVE` Shift in the same persisted Location as the canonical Payment;
- `VALET_SUPERVISOR` — allowed under the same active-Shift / same-Location rule;
- `LOCATION_MANAGER` — allowed for an authorized Location without requiring the Manager to own an operational Shift;
- `ORG_ADMIN` — not granted this operational cash mutation authority by VAL-008C.

All authority derives from the authenticated User plus persisted OrganizationMembership, MembershipLocationAccess, Location and, when required, Shift. Caller-supplied Organization, Location, membership, Shift, payer, amount, status or collection-method values are not authorization evidence.

### 2. Receipt command shape

MVP cash receipt is a server-derived **full remaining customer cash amount** command.

The caller supplies no receipt amount. Inside the protected transaction the server locks the canonical Payment and derives the receivable amount from persisted Payment state. A successful receipt records exactly the current positive `amount_due` as one `CashEntry(RECEIPT)` and atomically updates Payment `amount_paid` to the satisfied amount and Payment status to `PAID`.

The command is allowed only when the canonical Payment is cash-collectible under its persisted financial state. It must reject zero/not-required Payment, digital collection, already-collected/settled Payment, invalid collection state and any state that would imply split tender, installment collection, overpayment or a second successful collection.

This action is not a free-form `status = PAID` endpoint.

### 3. Receipt timing

Cash may be received early in the ValetSession or in the normal pre-handoff flow once a canonical Payment exists and the Payment is otherwise cash-collectible. VAL-008C does not add payment states to ValetSession and does not require a particular physical-custody state merely to record valid cash.

Future release enforcement remains owned by VAL-008G.

### 4. Cash receipt idempotency

Every receipt submission requires a caller-generated opaque submission idempotency key accepted only as retry identity, not as financial authority.

`CashEntry` organization-scoped uniqueness is the durable deduplication boundary. Retrying the same logical receipt returns the already-committed financial result without inserting another CashEntry, increasing `amount_paid` again or duplicating AuditEvent effect.

Reusing the same idempotency key for a materially different command is rejected.

### 5. Cash-recording corrections

`ADJUSTMENT_INCREASE` and `ADJUSTMENT_DECREASE` are **Location Manager only** in VAL-008C.

Each adjustment:

- is append-only;
- requires a non-empty bounded reason;
- requires a new submission idempotency key;
- is same-tenant / same-Location scoped;
- is applied transactionally with the resulting Payment cash projection and AuditEvent;
- cannot create negative recorded cash;
- cannot create an amount greater than the Payment customer amount that was legitimately collectible under this one-collection MVP model;
- cannot be used to represent money physically returned to the customer.

Actual customer money return remains Refund and is owned by VAL-008F.

The implementation must preserve the distinction between a correction to what VAYLET recorded and a real refund/outflow.

### 6. Shift `Cash Expected`

For a staff-owned operational Shift, `Cash Expected` is the server-derived net recorded cash attributable to that Shift's membership and Location during the Shift window:

```text
sum(RECEIPT)
+ sum(ADJUSTMENT_INCREASE attributable to that Shift cash)
- sum(ADJUSTMENT_DECREASE attributable to that Shift cash)
```

The implementation must use persisted financial facts and persisted Shift ownership/time boundaries. It must not accept caller-supplied expected cash.

Manager corrections after a Shift has ended do not rewrite the historical close snapshot defined below.

### 7. Shift close cash report

An operational employee/supervisor ending their own Shift supplies exactly one `cashReported` amount for that Shift.

`cashReported`:

- uses exact `numeric(14,3)`-compatible money input;
- is non-negative;
- is interpreted in the Shift Location's authoritative currency;
- is not a Payment amount and cannot mutate any Payment or CashEntry by itself.

At successful Shift close, the server atomically persists an immutable close-time reconciliation snapshot containing at minimum:

- `cash_expected`;
- `cash_reported`;
- `cash_variance = cash_reported - cash_expected`;
- close/report timestamp;
- reporting/closing membership identity.

The snapshot is calculated and written in the same protected Shift-end transaction that changes the Shift to `ENDED`, after existing open-task guards pass and before commit.

Shift close retry is idempotent and returns the already-persisted close result; it does not replace the original report.

### 8. Post-close behavior

The Shift close reconciliation snapshot is immutable historical evidence.

A later authorized Manager cash-recording correction remains a new CashEntry plus AuditEvent and does not rewrite the Shift's `cash_expected`, `cash_reported` or `cash_variance` snapshot.

Read/reporting logic may later show post-close adjustments separately from the original close variance. VAL-008C does not create a generic reconciliation-adjustment ledger.

There is no post-close employee/supervisor edit of `cashReported` in this slice. A future requirement to amend a mistaken close declaration needs a focused decision and append-oriented history rather than silent update.

### 9. Persistence decision

A new forward-only **migration 27 is approved** because the current Shift model has no durable representation for the accepted immutable close-time cash report/reconciliation snapshot.

The implementation must choose the narrowest typed persistence needed for this snapshot. It may either add typed nullable reconciliation columns to `Shift` or add a one-to-one typed Shift cash-reconciliation row, whichever better preserves repository conventions and invariants. It must not introduce drawer, ledger, settlement, tender-batch or generalized accounting entities.

Migrations 1–26 are immutable.

### 10. Audit, concurrency and failure semantics

Receipt, cash adjustment and Shift cash close are sensitive financial actions and require safe AuditEvents.

Commands must lock/re-check authoritative rows in the same transaction so concurrent receipt/retry/correction/Shift-close activity cannot:

- produce duplicate CashEntry financial effect;
- over-collect;
- make recorded cash negative;
- rewrite an immutable close snapshot;
- bypass active-Shift requirements;
- cross tenant or Location boundaries.

Failures roll back CashEntry/Payment/Shift-reconciliation/AuditEvent effects atomically.

### 11. Explicit non-goals

VAL-008C does not implement:

- digital payment provider behavior;
- Refund execution;
- payment release/handoff guard;
- split tender or partial installment collection;
- cash drawer opening/closing balances;
- float/petty cash;
- bank deposit/settlement;
- double-entry/general-ledger accounting;
- employee tip allocation/payroll;
- POS/PMS integration;
- Dashboard/UI.

## Consequences

- Employee and Supervisor cash receipt becomes operationally usable under an active same-Location Shift.
- Manager has controlled receipt/correction authority within authorized Location scope.
- Cash collection derives `PAID` from a validated financial fact rather than exposing manual Payment status mutation.
- One immutable close-time `Cash Expected` / `Cash Reported` / variance snapshot satisfies the MVP reconciliation boundary without creating an accounting platform.
- Post-close corrections preserve both the original close evidence and later append-only financial history.
- Migration 27 may be implemented by VAL-008C and must be the only new migration for this decision unless implementation proves a separate invariant cannot be represented safely and stops for another focused decision.

## Affected docs/code

- `docs/08_DECISIONS_LOG.md`
- `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`
- `docs/03_DATABASE_SCHEMA.md`
- `packages/database/prisma/schema.prisma`
- new migration 27
- `apps/api/src/modules/payments/**`
- `apps/api/src/modules/shifts/**`
- `packages/contracts/**`
- runtime privilege scripts/tests
- VAL-008C integration/concurrency/API/security tests
