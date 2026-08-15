# Phase 6 Payments Core & Provider-Ready Execution Plan

Status: Binding execution plan  
Version: 1.0  
Date: 2026-08-15  
Task: VAL-008  
Issue: #169

## Purpose

This document locks the implementation sequence and invariants for **Phase 6 — Payments**.

It is an execution bridge, not a replacement for the Founder & Product Blueprint v1.0 or focused Accepted decisions. It starts from the completed Phase 5 backend and consumes the financial persistence already accepted in Phase 1 rather than redesigning it.

The Project Owner has approved a provider-ready sequencing change for this phase: VAYLET will complete the provider-neutral financial core first and defer selection/activation of the real digital payment provider until that core is ready.

This sequencing changes execution order only. The Blueprint still requires at least one real digital gateway before Payments can be called sellable-MVP / production complete.

VAL-008 is documentation only. Production financial implementation begins in VAL-008A.

## Authority and reviewed sources

Implementation follows the authority order in `AGENTS.md`.

This plan is reconciled against:

- Founder & Product Blueprint v1.0, especially sections 04, 05, 06, 10, 11, 12, 15, 16, 17, 18, 19, 20, 25, 27 and Appendix A;
- `AGENTS.md`;
- `docs/00_SOURCE_OF_TRUTH.md`;
- `docs/15_BLUEPRINT_V1_REBASELINE.md`;
- `docs/01_PRODUCT_SCOPE.md`;
- `docs/02_DOMAIN_MODEL.md`;
- `docs/03_DATABASE_SCHEMA.md`;
- `docs/04_VALET_SESSION_STATE_MACHINE.md`;
- `docs/05_ENGINEERING_RULES.md`;
- `docs/06_SECURITY_AND_DATA_RULES.md`;
- `docs/07_DEFINITION_OF_DONE.md`;
- `docs/08_DECISIONS_LOG.md`;
- `docs/11_REQUIREMENTS_TRACEABILITY.md`;
- `docs/12_AGENT_EXECUTION_PLAN.md`;
- `docs/17_AGENT_CODE_STRUCTURE_RULES.md`;
- `docs/19_PHASE4_RETRIEVAL_HANDOFF_EXECUTION_PLAN.md`;
- `docs/20_PHASE5_MAPS_TRACKING_EXECUTION_PLAN.md`;
- Accepted DEC-004, DEC-007, DEC-017, DEC-018, DEC-021, DEC-022 and DEC-043 where relevant.

Material behavior that remains unresolved is explicitly marked as a **REQUIRED DECISION GATE** below. This plan must not be used to silently invent those semantics.

## Verified baseline

Phase 5 is complete.

```text
main = ccd43a948c3dfe5cd2e4fdbe7bf096620e797985
Phase 5 final slice = VAL-007H COMPLETE
PR #168 = MERGED
migration count = 25
latest migration = 20260815002500_phase5_raw_gps_retention_cleanup
```

The production payments module is still effectively a placeholder boundary. Phase 6 therefore starts with financial persistence available but executable payment workflows largely unimplemented.

Migrations 1–25 are immutable.

## Existing financial persistence Phase 6 must reuse

The repository already has accepted persistence for:

- `Payment`;
- `Validation`;
- `CashEntry`;
- `PaymentProviderEvent`;
- `Refund`;
- `Payment.tip_amount`;
- Location-currency snapshotting on Payment;
- Payment creation idempotency;
- provider-neutral current provider/reference fields;
- normalized financial history and callback-deduplication facts.

Accepted exact financial enums include:

```text
PaymentServicePayer:
CUSTOMER | VENUE

PaymentCollectionMethod:
NONE | CASH | DIGITAL

PaymentStatus:
NOT_REQUIRED | UNPAID | PENDING | PAID | FAILED

ValidationMode:
NONE | FULL | PARTIAL

CashEntryType:
RECEIPT | ADJUSTMENT_INCREASE | ADJUSTMENT_DECREASE

PaymentProviderEventProcessingStatus:
PROCESSED | IGNORED

RefundStatus:
PENDING | SUCCEEDED | FAILED
```

At most one Payment exists per ValetSession. New financial entities must not be introduced merely because Phase 6 starts. If a later slice proves that a concrete invariant cannot be represented safely by the accepted model, implementation stops for a focused persistence/architecture decision.

## Phase 6 objective

Deliver the sellable-MVP financial behavior in two explicit checkpoints.

### Checkpoint A — provider-ready financial core

After VAL-008H:

```text
PHASE 6 CORE = PROVIDER_READY
```

The backend can safely execute and prove provider-neutral financial policy, Payment creation/current projection, validation, tips, cash collection/reconciliation-facing behavior, refund core, financial release guards, safe financial projections, authorization, concurrency, audit and provider-neutral digital contracts.

This checkpoint **does not** claim that a real digital card/wallet transaction can run in production.

### Checkpoint B — real-provider digital completion

After VAL-008K with a selected real provider:

```text
PHASE 6 DIGITAL PAYMENTS = MVP / PRODUCTION COMPLETE
```

Only this later checkpoint may claim the Blueprint requirement for at least one first-market digital gateway is complete.

No fake provider, test double or locally simulated callback may be represented as production-provider completion.

## Canonical financial separation

`ValetSession` remains the physical-custody lifecycle:

```text
CHECKING_IN
-> AWAITING_PARKING
-> PARKING
-> PARKED
-> REQUESTED
-> RETRIEVING
-> READY
-> HANDOFF_PENDING
-> COMPLETED
```

Payment state remains separate:

```text
NOT_REQUIRED | UNPAID | PENDING | PAID | FAILED
```

Refund state remains separate:

```text
PENDING | SUCCEEDED | FAILED
```

Do not add payment/provider states to `ValetSession`, and do not use Payment state as a substitute for physical custody, Task/Dispatch, secure handoff or key-custody state.

## Binding financial invariants

### Payment

- At most one canonical Payment exists per ValetSession.
- Organization, Location and ValetSession ownership must be same-tenant and server-derived.
- Location currency is authoritative and is snapshotted onto Payment so later configuration changes cannot alter historical meaning.
- Money remains compatible with PostgreSQL `numeric(14,3)` storage. Currency minor-unit validation/quantization is command/provider-boundary behavior per DEC-022; silent material rounding is forbidden.
- `service_payer` is `CUSTOMER` or `VENUE` only.
- One Payment has one collection method: `NONE`, `CASH` or `DIGITAL`.
- Split tender, installments and multiple successful collections for one session remain out of MVP scope.
- `amount_due` and `amount_paid` are server-maintained financial projections, not caller authority.
- Payment creation idempotency protects Payment creation only; it does not by itself prove provider-operation retry safety.

### Service payer and guarded pre-collection correction

DEC-022 permits `CUSTOMER <-> VENUE` correction only before collection while all accepted guards still hold: zero paid amount, no CashEntry, no Validation history and no provider transaction/reference started. The correction, recomputation and required audit must be atomic.

Once any guard ceases to hold, payer is immutable.

### Validation

- Validation is valid only for `CUSTOMER` responsibility.
- Supported modes are `NONE`, `FULL` and `PARTIAL`.
- Validation history is append/supersede oriented; previous financial facts are not silently rewritten.
- At most one current validation projection exists while historical rows remain available.
- Full/partial amount validity is checked transactionally against the canonical Payment service amount.
- `VENUE` responsibility is not combined with Validation in the accepted MVP model.

### Tips

- Tip remains `Payment.tip_amount`; Phase 6 does not create a separate tip allocation subsystem.
- Tip is a customer-paid amount and remains distinguishable from the base valet service fee in financial projections/reporting.
- Tip payroll, employee allocation, team pools, commissions and settlement/distribution accounting are not Phase 6 core behavior.
- Returning already collected tip value uses Refund rather than rewriting paid history.

### Cash

- Cash history is append-oriented through `CashEntry`.
- A recorded receipt and later recorded correction are separate historical facts.
- A CashEntry adjustment corrects recorded cash; actual money returned to the customer is a Refund.
- Submission retry must not create duplicate CashEntry financial effect.
- `Payment.amount_paid` is maintained transactionally with accepted cash facts.
- The Blueprint requires `Cash Expected` versus `Cash Reported` at Shift end, but DEC-021 deliberately did not create a drawer, general ledger, shift-close accounting or settlement subsystem. Phase 6 implements only the smallest backend boundary required for the MVP comparison; it must not grow into an accounting platform.

### Refund

- Refund is separate append-only financial history.
- `VALET_EMPLOYEE` refund authority is forbidden.
- Multiple partial refunds are permitted; full/partial is derived rather than stored as a separate lifecycle.
- Under locking/concurrency, pending plus successful refund exposure must never exceed `Payment.amount_paid`.
- Cash refund success has no digital-provider fields.
- Digital refund execution stays provider-neutral until a real provider is activated.
- Failed or pending provider refund history must not rewrite collected Payment history.

## Configuration-First financial policy boundary

Normal financial policies that vary by customer/location should follow the accepted pattern:

```text
Company default -> Location override
```

Phase 6 must use typed configuration. It must not introduce an untyped generic policy JSON blob.

The exact financial policy fields required for VAL-008A are a **REQUIRED DECISION GATE** before that slice changes persistence or behavior. At minimum that decision must settle the typed source for:

- whether payment is required for the Location/service;
- default service payer;
- allowed collection methods;
- whether validation is enabled and its operational proof/authority;
- whether tips are enabled and when tip value freezes for collection;
- whether successful financial satisfaction is required before final release.

A new forward-only migration is allowed only if the accepted typed policy cannot be represented safely by current persistence.

## Authorization and decision register

The following classification is binding for Phase 6 planning.

### ALREADY ACCEPTED

- Payment lifecycle is separate from ValetSession — DEC-004.
- Commercial/provider integrations remain behind adapters where practical — DEC-007.
- Configuration inheritance is Company default -> Location override — DEC-017.
- Location owns operational currency/timezone context — DEC-018.
- Payment-centric persistence and normalized financial-history model — DEC-021.
- Guarded payer correction, currency precision boundary, outbound-idempotency distinction and exact Refund row semantics — DEC-022.
- Ordinary `VALET_EMPLOYEE` cannot refund — Blueprint + DEC-021 application policy.
- Final physical release is owned by the existing protected `complete-handoff` command; DEC-043 explicitly reserves this final command boundary for a later typed financial release guard.
- Cross-tenant/wrong-Location failures must remain non-disclosing under the existing authorization model.
- No PAN/CVV/raw reusable payment credentials in VAYLET financial persistence.

### OWNER-APPROVED FOR THIS PHASE

- Complete provider-neutral financial core before choosing/activating a real digital provider.
- VAL-008H is named `PHASE 6 CORE = PROVIDER_READY` and is not real-provider production completion.
- Real provider selection/activation is deferred to VAL-008I/J/K.
- No APS, HyperPay, MEPS, Stripe or other provider is currently Accepted.
- Contract-test doubles may prove internal provider-neutral contracts, but no fake provider may be wired as production behavior.

### REQUIRED DECISION GATES

Before the owning implementation slice, focused decisions must settle any item not already proven by binding repository authority:

1. exact typed financial Configuration-First policy fields and persistence;
2. default payer and allowed collection methods;
3. exact validation authority and proof mechanism while Venue Client persistence/POS are out of scope;
4. tip enablement and the exact pre-collection freeze/correction point;
5. exact roles allowed to perform pre-collection payer/amount/tip/validation corrections;
6. exact cash receipt authority;
7. the smallest `Cash Expected` vs `Cash Reported` backend model and post-close correction authority, without a ledger/drawer subsystem;
8. exact refund-authorizing roles and how `ORG_ADMIN` authority remains compatible with the Blueprint production-MFA requirement/current auth posture;
9. exact guest/staff financial projection fields and safe error contracts;
10. durable provider-neutral outbound operation identity if current persistence cannot represent it safely;
11. stale/superseded provider-reference authority rules before real callbacks can mutate finance;
12. final real-provider selection, legal/commercial merchant model and provider-specific security contract before VAL-008I.

Do not mark any of these Accepted merely because a later task needs an answer. Create the focused decision when the ambiguity becomes implementation-blocking.

## Handoff / release financial guard

DEC-043 is the accepted composition point.

The existing final command:

```text
POST /v1/staff/valet-sessions/:sessionId/complete-handoff
```

owns final physical release. A later typed financial guard composes inside that protected release transaction before any terminal custody/release mutation.

Phase 6 must not create a second handoff state machine and must not move payment ownership into `ValetSession`.

When the effective Location policy requires financial satisfaction, the release command fails closed unless the canonical financial projection satisfies the accepted predicate. The exact predicate must be defined in the financial-policy decision before VAL-008G; examples must not be guessed from arbitrary provider statuses.

The existing `READY -> HANDOFF_PENDING` and secure handoff proof behavior remain intact. READY does not complete the Retrieval Task, and payment logic must not change that invariant.

## Provider-neutral digital boundary

The finance core owns business authority. A future provider adapter owns provider translation.

Core logic must not depend on:

- APS response/status codes;
- HyperPay entity IDs;
- Stripe-style headers;
- provider SDK objects;
- provider-specific webhook JSON;
- provider-specific wallet payloads.

A narrow adapter may eventually need capabilities equivalent to:

```text
initiate digital collection
query/reconcile provider operation
request digital refund
verify/authenticate + normalize callback
```

Exact interface names are implementation details and are not locked by this document.

Caller-controlled amount, currency, payer, Organization, Location, membership or provider reference must never become financial authority through the adapter.

### VAYLET-owned outbound operation identity

The system must own a durable logical identity for outbound collection/refund work so a timeout/retry cannot create an unintended second financial operation.

Existing guarantees are not enough by themselves:

- `Payment.creation_idempotency_key` protects Payment creation;
- provider-event uniqueness protects committed callback replay.

VAL-008D must first prove the narrowest safe representation using existing persistence. A generic `PaymentAttempt` framework is not pre-approved. If the accepted model cannot represent durable outbound retry correlation safely, VAL-008D stops for a focused persistence decision and only then may a forward-only migration be considered.

## Provider event / reconciliation boundary

VAL-008E remains provider-neutral and may use contract-test doubles only.

The accepted callback model is:

1. provider authenticity verification happens before financial mutation;
2. provider data is normalized at the adapter boundary;
3. normalized `PaymentProviderEvent` fact, Payment/Refund mutation and required AuditEvent commit atomically;
4. duplicate committed provider events do not repeat financial mutation or audit;
5. a valid event intentionally producing no financial mutation may be `IGNORED`;
6. a recognized financial result, including provider-reported failure represented in the relevant lifecycle, is `PROCESSED`;
7. processing failure before commit rolls back the transaction and remains retryable;
8. raw provider payloads are not persisted by default.

Late, duplicate, reordered and stale/superseded events must be safe. Exact real-provider event IDs, signatures, retry schedules and status mapping are deferred to VAL-008I/J after provider selection.

## Guest and staff financial projections

Guest access remains tied to the guest's own authorized ValetSession. Guest responses may expose only the minimum information needed to understand whether payment is required, the customer-visible amount/currency, validation/tip effect, collection method/status appropriate to the UI, and receipt/refund progression when implemented.

Guest responses must not expose internal Organization/Location identifiers unnecessarily, staff authority detail, provider secrets, raw callbacks, reusable payment credentials, internal reconciliation-only fields or another session's financial data.

Staff/manager financial reads and commands must enforce persisted tenant + Location + role authority. Cross-tenant or cross-location identifier probing must not disclose whether another tenant's Payment/Refund exists.

The exact DTO/role matrix is a REQUIRED DECISION GATE before the owning API slice.

## PCI, card-data and secret boundary

VAYLET's intended digital architecture minimizes card-data handling.

- Do not store PAN or CVV.
- Do not log Authorization values, provider credentials, signing phrases/keys, wallet secrets or raw sensitive callback bodies.
- Prefer a selected provider's hosted/tokenized flow when real-provider activation occurs.
- Provider secrets stay server-side and outside source control/client bundles.
- Audit metadata contains normalized business facts/identifiers only, never secret or raw payment material.
- Provider failure/error translation must not echo provider secrets or sensitive request data to Guest/staff clients.

The exact PCI scope depends on the selected provider and checkout flow and is therefore finalized during VAL-008I/K, not guessed in provider-neutral core tasks.

## Idempotency, concurrency and transaction rules

Every financial mutation must define its retry and race behavior explicitly.

At minimum:

- Payment creation is protected by the accepted creation-idempotency key and one-Payment-per-session uniqueness;
- Validation correction serializes current-row supersession and Payment recomputation;
- cash receipt/correction submission identity prevents duplicate CashEntry effect;
- pre-collection corrections re-check collection-start guards inside the transaction;
- concurrent refund requests lock/re-check the refundable balance so pending + successful refunds never exceed paid amount;
- final financial release guard is evaluated in the same protected release transaction as final custody mutation;
- provider-event processing is deduplicated and atomic with financial mutation/audit;
- future outbound provider operations use stable VAYLET-owned logical identity and do not blindly reissue after uncertain network outcomes.

Required AuditEvent/history writes must commit with the protected financial mutation when the accepted contract requires them. A failed required audit/history write rolls back the mutation rather than leaving an unaudited sensitive action.

## Focused task sequence

### VAL-008 — Phase 6 Payments Core & Provider-Ready Execution Contract

Documentation only. Lock this sequence, invariants and decision gates; refresh project status. No production/schema/migration/provider/UI change.

### VAL-008A — Effective Financial Policy + Payment Core

Purpose:

- accept the typed financial Configuration-First decision;
- resolve effective Company-default/Location-override policy;
- create/read the one canonical Payment for a session using server-authoritative Location currency, payer, collection method and monetary terms;
- enforce creation idempotency and accepted zero/positive-due row transitions;
- expose no provider-specific behavior.

Required gate: exact typed policy fields/defaults/authority.

### VAL-008B — Validation + Tips + Guarded Pre-collection Corrections

Purpose:

- apply/supersede `NONE | FULL | PARTIAL` validation under accepted Customer-payer semantics;
- update tip and other permitted pre-collection terms without rewriting history;
- implement DEC-022 payer-correction guards;
- recompute amount due/status/method atomically;
- audit sensitive corrections and prove races cannot cross the collection-start boundary.

Required gate: validation proof/authority, tip freeze point and correction roles.

### VAL-008C — Cash Collection + Cash Reconciliation MVP Boundary

Purpose:

- implement retry-safe cash receipt and append-only correction behavior;
- update Payment projection atomically;
- implement the smallest accepted `Cash Expected` vs `Cash Reported` Shift-facing backend boundary;
- keep actual customer money return in Refund;
- prove tenant/Location/role and post-close rules.

Required gate: cash receipt authority, expected/reported model and post-close correction authority.

### VAL-008D — Provider-Neutral Digital Payment Boundary + Outbound Operation Identity

Purpose:

- define/implement the narrow provider adapter contract needed by VAYLET;
- establish durable VAYLET-owned logical outbound operation/retry correlation;
- keep provider-specific SDK/status/signature objects outside the finance core;
- use no real production provider and no fake production provider.

Required gate only if current persistence cannot safely represent durable operation identity.

### VAL-008E — Provider Event / Normalization / Reconciliation Foundation

Purpose:

- compose authenticated/normalized provider-event processing behind the adapter contract;
- prove deduplication, stale-event handling, atomic Payment/Refund/Audit behavior and transaction-status reconciliation contracts using test doubles only;
- persist no raw callback payload by default;
- expose no fake provider runtime.

Real provider signatures/statuses/retry schedules remain deferred.

### VAL-008F — Refund Core

Purpose:

- implement authorized cash refund success and provider-neutral digital refund request/lifecycle contract;
- enforce idempotency, immutable reason/authorizer history and refundable-balance locking;
- forbid ordinary Valet Employee refund authority;
- keep provider-specific digital execution deferred.

Required gate: exact authorizing roles and MFA compatibility.

### VAL-008G — Financial Handoff/Release Guard + Safe Projections

Purpose:

- evaluate accepted effective financial release policy at DEC-043's final `complete-handoff` boundary;
- fail closed without changing the existing secure-handoff/custody state machine;
- expose Guest/staff-safe financial projections under tenant/Location/role boundaries.

Required gate: exact financial-satisfaction predicate and DTO/role projection matrix.

### VAL-008H — Phase 6 Core API / Integration / E2E / Security Gate

Prove production-composed provider-ready core behavior, including at minimum:

- Customer Pays and Venue Pays;
- zero-due / NOT_REQUIRED behavior;
- Full/Partial/None validation semantics;
- tip enable/correction/freeze behavior;
- cash receipt, duplicate retry and correction history;
- Cash Expected vs Cash Reported accepted boundary;
- guarded pre-collection correction races;
- cash refund and refund authorization/concurrency;
- provider-neutral adapter/event contract behavior with test doubles only;
- no fake production provider activation;
- tenant and Location isolation;
- non-disclosing cross-tenant/cross-location failures;
- Guest own-session-only financial projection;
- financial release guard at the final protected release command;
- required AuditEvent/history atomicity;
- runtime DB-role compatibility for all touched financial tables;
- no PAN/CVV/provider secrets in persistence, logs, audit, errors or client-safe responses;
- migration/schema/dependency scope matches accepted tasks.

Passing unit tests alone is insufficient. This gate must include production-composed integration/E2E/security proof for implemented core behavior.

Successful VAL-008H means only:

```text
PHASE 6 CORE = PROVIDER_READY
```

### VAL-008I — Selected Provider Activation / Hosted or Tokenized Checkout

Deferred until a real provider is explicitly selected.

Purpose:

- implement one first-market provider adapter using the provider's real documented API/security contract;
- use hosted/tokenized payment collection where practical;
- configure provider secrets server-side;
- map stable VAYLET outbound operation identity to the provider's supported correlation/idempotency model;
- keep core business authority provider-neutral.

Provider selection must pass its legal/commercial/technical gate before this task begins.

### VAL-008J — Real Provider Callbacks, Settlement/Failure & Digital Refund Wiring

Purpose:

- verify real provider callback authenticity;
- normalize real provider transaction outcomes;
- connect real status/reconciliation lookup;
- wire provider-specific digital refund execution behind the accepted Refund core;
- handle duplicate, reordered, delayed and stale/superseded provider events safely.

### VAL-008K — Real Digital Provider E2E / Security / Production Gate

Prove the selected provider in sandbox/certification and production-composed configuration as applicable:

- hosted/tokenized checkout;
- success/failure/cancel/3DS paths where supported;
- uncertain timeout recovery without duplicate charge;
- callback authenticity and replay handling;
- duplicate/late/out-of-order callbacks;
- transaction status reconciliation;
- partial/full digital refunds;
- refund retry/failure behavior;
- no provider secret/card-data leakage;
- Guest/payment-return safety;
- live merchant/account/currency configuration expected for the Jordan pilot.

Only successful VAL-008K permits the claim:

```text
PHASE 6 DIGITAL PAYMENTS = MVP / PRODUCTION COMPLETE
```

## Batch / branch execution order

Use the normal reviewed stack cadence:

```text
Batch 1:
VAL-008 -> VAL-008A -> VAL-008B

Batch 2:
VAL-008C -> VAL-008D -> VAL-008E

Batch 3:
VAL-008F -> VAL-008G -> VAL-008H

Deferred provider batch:
VAL-008I -> VAL-008J -> VAL-008K
```

Each task gets its own branch. The next branch stacks only after the previous task is independently reviewed and approved. One cumulative PR/merge is used per reviewed batch unless the Project Owner approves an exception.

## Database and migration rules

Current accepted baseline is exactly **25 forward-only migrations**.

VAL-008 changes no schema and adds no migration.

Migrations 1–25 remain immutable. Never rewrite, renormalize or change their historical contents/hashes.

Future Phase 6 tasks add a new migration only when a focused accepted invariant demonstrably cannot be represented safely by current persistence. A migration is not added merely to prepare for an unspecified provider.

Provider-specific persistence is not accepted by default. Stable core business identifiers remain provider-neutral.

## Phase 6 core Definition of Done

The provider-ready core is complete only when VAL-008H proves that VAYLET can safely execute the accepted internal financial model across policy, Payment, validation, tips, cash, refunds, release guards, authorization, concurrency, audit and provider-neutral contracts without requiring any real gateway-specific behavior.

The checkpoint must be reported as:

```text
PHASE 6 CORE = PROVIDER_READY
REAL DIGITAL PROVIDER = NOT YET ACTIVATED
```

It is not acceptable to relabel mocked/test-double digital success as real provider payment readiness.

## Deferred provider Definition of Done

Digital payments satisfy the Blueprint MVP requirement only after a selected provider is commercially/legal-operationally approved and VAL-008I/J/K prove real checkout, callback/reconciliation, digital refund and security behavior.

Provider selection must explicitly confirm the merchant/acquiring model, supported processing/settlement currency, production onboarding, credentials/security, refund/chargeback behavior and provider-specific webhook/retry contract before production activation.

## Explicit exclusions

Phase 6 core does not pull forward:

- full Dashboard implementation or Payments Dashboard UI;
- Employee UI redesign;
- unrelated Guest UI redesign;
- Reliability/offline sync framework beyond narrow financial mutation retry safety;
- Venue Client persistence;
- MFA implementation unless separately approved by its owning task;
- POS/PMS integrations;
- split tender or installments;
- tip payroll/allocation/distribution engine;
- venue receivables/settlement/accounting ledger;
- subscription billing;
- multiple live payment gateways or a provider marketplace/orchestration platform;
- chargeback management platform beyond provider facts required for the chosen MVP integration;
- advanced fraud/risk engine;
- predictive AI;
- ClaimShield/VAYLET Qualified or other V2/Enterprise behavior.

Full Dashboard implementation remains the next product phase after Payments according to the Blueprint sequence unless the Project Owner explicitly changes that direction.

## VAL-008 completion definition

VAL-008 is complete when this plan and the refreshed project-status snapshot make VAL-008A executable without inventing product/security/data behavior, while clearly preserving every unresolved decision gate.

For VAL-008 itself:

```text
production source change = NO
Prisma schema change = NO
migration change = NO
runtime DB privilege change = NO
dependency/lockfile change = NO
UI change = NO
real provider selected = NO
real provider activated = NO
migration count = 25
```
