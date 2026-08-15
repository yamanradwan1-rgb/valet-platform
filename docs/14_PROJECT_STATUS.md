# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md`, the Founder & Product Blueprint v1.0, binding docs and Accepted decisions.

## Last Verified

- Date: `2026-08-15`
- Repository: `veletpro0-lgtm/valet-platform`
- Current merged `main` checkpoint: `ccd43a948c3dfe5cd2e4fdbe7bf096620e797985`
- Completed product phases: **Phases 1–5 COMPLETE**
- Phase 5 final slice: **VAL-007H — COMPLETE**
- Phase 5 final PR: **#168 — MERGED**
- Current planning task: **VAL-008 — Phase 6 Payments Core & Provider-Ready Execution Contract**
- Current task issue: **#169**
- Binding Phase 6 plan: `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md` on the VAL-008 task branch until merged
- Database baseline: exactly **25 forward-only migrations**
- Latest migration: `20260815002500_phase5_raw_gps_retention_cleanup`
- Real digital payment provider: **NOT SELECTED / NOT ACTIVATED**
- Phase 6 production implementation: **NOT STARTED**

## Current Product Checkpoint

The backend has completed the Foundation, Core Check-in, Operations, Retrieval and Maps/task-scoped tracking phases.

The next Blueprint phase is **Payments**.

Phase 6 starts from existing accepted financial persistence rather than from an empty schema. Current persistence already includes:

```text
Payment
Validation
CashEntry
PaymentProviderEvent
Refund
```

The production payments module is still effectively a placeholder boundary; the financial domain commands and API workflows are not yet implemented.

## Phase 6 Sequencing

The Project Owner approved a provider-ready sequencing strategy:

1. finish the provider-neutral VAYLET financial core;
2. reach a clearly named `PHASE 6 CORE = PROVIDER_READY` checkpoint;
3. select/activate the real first-market provider later;
4. run the real provider checkout/callback/refund/security gate before claiming digital-payments MVP completion.

This sequencing does not remove the Blueprint requirement for at least one real digital gateway before Payments are production-complete for the sellable MVP.

No provider is currently Accepted. Jordan research may inform a later provider decision, but APS, HyperPay, MEPS and other candidates are not authorized as production integrations by VAL-008.

## Phase 6 Task Plan

```text
Batch 1
VAL-008   Phase 6 Payments Core & Provider-Ready Execution Contract
VAL-008A  Effective Financial Policy + Payment Core
VAL-008B  Validation + Tips + Guarded Pre-collection Corrections

Batch 2
VAL-008C  Cash Collection + Cash Reconciliation MVP Boundary
VAL-008D  Provider-Neutral Digital Payment Boundary + Outbound Operation Identity
VAL-008E  Provider Event / Normalization / Reconciliation Foundation

Batch 3
VAL-008F  Refund Core
VAL-008G  Financial Handoff/Release Guard + Safe Financial Projections
VAL-008H  Phase 6 Core API / Integration / E2E / Security Gate

Deferred provider batch
VAL-008I  Selected Provider Activation / Hosted or Tokenized Checkout
VAL-008J  Real Provider Callbacks, Settlement/Failure & Digital Refund Wiring
VAL-008K  Real Digital Provider E2E / Security / Production Gate
```

VAL-008H may establish only:

```text
PHASE 6 CORE = PROVIDER_READY
```

Only successful VAL-008K with a selected real provider may establish:

```text
PHASE 6 DIGITAL PAYMENTS = MVP / PRODUCTION COMPLETE
```

## Binding Financial Foundation

Key accepted repository contracts already include:

- Payment lifecycle remains separate from the ValetSession physical state machine;
- at most one Payment per ValetSession;
- service payer `CUSTOMER | VENUE`;
- collection method `NONE | CASH | DIGITAL`;
- Payment status `NOT_REQUIRED | UNPAID | PENDING | PAID | FAILED`;
- Validation `NONE | FULL | PARTIAL` for Customer-responsibility semantics;
- tip stored on Payment rather than a payroll/allocation subsystem;
- append-oriented CashEntry history;
- provider-event callback deduplication foundation;
- separate Refund lifecycle;
- ordinary `VALET_EMPLOYEE` cannot refund;
- Location currency is authoritative and snapshotted onto Payment;
- provider integrations remain behind adapters;
- final financial release policy, when implemented, composes at the existing protected final `complete-handoff` boundary rather than creating a second handoff state machine.

Exact Phase 6 command authorization/policy fields that are not already Accepted remain focused decision gates in `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`.

## Database / Migration Baseline

Exactly **25 forward-only migrations** are present.

Financial foundation migrations include:

```text
10  20260809001000_payment_validation_tip_foundation
11  20260809001100_cash_entry_provider_event_foundation
12  20260809001200_refund_foundation
```

The current latest migration is:

```text
25  20260815002500_phase5_raw_gps_retention_cleanup
```

Migrations 1–25 are immutable. Never rewrite, renormalize or change historical migration hashes/line endings.

VAL-008 is documentation only and adds no migration.

A later Phase 6 task may add a new forward-only migration only when a concrete Accepted invariant cannot safely be represented by current persistence.

## Current Security / Privacy Boundary

Phase 6 must continue to preserve:

- persisted tenant and exact Location authority;
- server-derived financial ownership and actor authority;
- non-disclosing cross-tenant/cross-Location failures;
- append/audit behavior for sensitive financial changes;
- retry/concurrency safety for money-moving operations;
- no raw PAN/CVV or provider secrets in normal persistence, AuditEvent, logs, errors or client responses;
- Guest access limited to the financial projection for the Guest's own authorized session;
- provider-specific statuses/SDK objects isolated from the core financial domain.

The exact selected-provider PCI/security contract remains deferred until real provider activation.

## Still Deferred / Not Claimed

The project does **not** currently claim:

- production Payment/Validation/Cash/Refund command APIs;
- cash reconciliation runtime behavior;
- provider-neutral digital initiation/runtime adapter implementation;
- a selected or activated real digital provider;
- real hosted checkout / 3DS / wallet payment flow;
- real provider callback verification/reconciliation;
- real digital refund execution;
- Phase 6 provider-ready E2E/security completion;
- Phase 7 full Dashboard implementation;
- Reliability/offline sync framework;
- Venue Client persistence;
- POS/PMS integration;
- payment orchestration/multiple live gateways;
- accounting ledger/venue settlement/tip payroll;
- V2/Enterprise payment intelligence.

## Exact Next Step

Complete and independently review **VAL-008** documentation on:

```text
feat/VAL-008-phase6-payments-contract
```

After VAL-008 is approved for stack, create **VAL-008A — Effective Financial Policy + Payment Core** from the approved VAL-008 branch under the normal three-task batch workflow.
