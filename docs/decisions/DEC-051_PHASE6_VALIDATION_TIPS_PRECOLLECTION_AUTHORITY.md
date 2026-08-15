# DEC-051 — Phase 6 Validation, Tips & Pre-collection Authority

Status: Accepted  
Date: 2026-08-15

## Context

VAL-008B needs exact authority and lifecycle rules for Validation, tips and guarded pre-collection financial corrections.

The Project Owner clarified the intended first-rollout operation:

- an ordinary Valet Employee must be able to record that a customer has paid;
- cash may be collected either early in the valet session or during the normal pre-handoff flow;
- digital payment remains disabled until a real provider is selected and activated;
- tips remain disabled for the initial rollout;
- both digital payment and tips must remain configuration-controlled capabilities that can be enabled later without redesigning the financial core;
- the Location Manager has full supported financial authority for their Location, subject to lifecycle, tenant, audit and immutable-history guards.

Existing DEC-021/022 semantics remain binding: Payment lifecycle is separate from ValetSession; collection history is not silently rewritten; provider truth cannot be fabricated; and corrections after collection use the proper financial-history/refund path instead of editing settled facts.

## Decision

### 1. Valet Employee payment authority

`VALET_EMPLOYEE` may record **cash received / payment received** for the canonical Payment when cash collection is allowed by the effective Location policy.

The employee action is not a free-form `status = PAID` mutation. The server owns the transition and must validate the canonical Payment, amount due, collection method, tenant/Location scope, current financial state and idempotency before deriving the resulting Payment state.

For a full cash receipt of the currently due amount, the server may derive the Payment as paid according to the accepted cash collection contract implemented in VAL-008C.

The employee may record cash either:

- early in the session after the canonical Payment exists; or
- during the normal payment step before handoff/release.

Physical `ValetSession` state does not become payment state and must not gain a `PAID` state.

### 2. Digital payment authority

Digital payment is OFF for the initial rollout.

Current safe default remains:

`paymentMethodsPolicy = CASH_ONLY`

When a real provider is activated later, digital success/failure is provider-authoritative through the accepted provider integration/callback flow. A Valet Employee must not manually mark a digital transaction as successful.

No fake/manual digital `PAID` override is accepted.

### 3. Tips

Tips are OFF for the initial rollout.

Current safe default remains:

`tipsEnabled = false`

Tip remains a supported typed capability and may be enabled later through the accepted Company-default -> Location-override configuration model. No code redesign or new Tip entity should be required merely to turn the feature on.

When tips are enabled later, the authenticated guest/customer for the canonical guest session may set or change their own tip before financial collection begins, and `LOCATION_MANAGER` may perform an authorized pre-collection tip correction within their Location. Once collection starts, the tip value is frozen for that Payment; returning collected tip value uses Refund rather than rewriting history.

### 4. Location Manager authority

`LOCATION_MANAGER` has full supported financial authority within their authorized Location, subject to all lifecycle, tenant, Location, audit, concurrency and immutable-history rules.

This includes, as each owning Phase 6 slice is implemented:

- recording cash payment;
- applying/removing/correcting Validation;
- pre-collection payer correction;
- pre-collection service-fee/financial-term correction where the product contract allows it;
- tip correction when tips are enabled and collection has not started;
- cash correction/reconciliation actions;
- refunds;
- location-level financial policy/configuration actions when the corresponding authorized configuration API/UI exists.

"Full supported financial authority" does not mean arbitrary database mutation. A Location Manager cannot bypass:

- tenant or Location scope;
- provider-authenticated digital truth;
- idempotency/concurrency guards;
- immutable financial history;
- refund balance limits;
- required AuditEvents;
- final provider/security requirements.

### 5. Validation authority for VAL-008B

For the first rollout, `LOCATION_MANAGER` is the financial authority that may apply, replace or remove Validation.

`VALET_EMPLOYEE` does not receive Validation authority merely because the employee can record cash payment.

`VALET_SUPERVISOR` receives no additional financial mutation authority in VAL-008B beyond any separately accepted cash/payment action; operational Supervisor authority remains separate.

Venue Client persistence, Staff PIN/Cashier QR validation, POS/PMS integration and automatic validation rules remain deferred.

### 6. Validation proof mechanism

VAL-008B uses authenticated staff identity plus persisted `LOCATION_MANAGER` authority as the validation proof mechanism.

No separate PIN, cashier QR, Venue Client identity or POS proof is introduced in this slice.

### 7. Pre-collection correction guards

A payer or other guarded pre-collection financial-term correction may occur only before collection has started and only while the accepted DEC-022 guards remain satisfied.

At minimum:

- `amount_paid = 0`;
- no `CashEntry` exists;
- no Validation history exists for payer/base-service-term correction;
- no provider transaction/reference has started;
- no settled/collected financial fact would be rewritten.

Validation may itself be superseded before collection; its history does not prevent another Validation correction. Tip may be changed before collection while tip policy permits it.

Once collection begins, mutable pre-collection terms freeze. Later financial correction uses append-only financial history and/or Refund as appropriate.

### 8. Atomic recomputation

Any accepted Validation, tip or pre-collection correction must recompute the canonical Payment and append the required AuditEvent atomically in one transaction.

If recomputation changes `amount_due` to zero, the Payment must become the coherent accepted zero-due state:

- `collection_method = NONE`;
- `status = NOT_REQUIRED`;
- `amount_paid = 0`;
- provider/reference cleared.

If a pre-collection correction changes a previously zero-due Payment to a positive amount, the collection method/status must be re-derived from the effective configured payment policy. Positive `DIGITAL_ONLY` continues to fail closed until a real provider is activated.

### 9. Persistence boundary

VAL-008B should use the existing `Payment`, `Validation`, `AuditEvent` and typed policy persistence.

No new migration is approved merely for this authority decision. If implementation proves a concrete invariant cannot be represented safely by the current schema, stop for a focused persistence decision before adding migration 27.

## Reason

This keeps the first rollout operationally simple:

- staff can actually collect cash and mark the customer paid through a safe server-owned action;
- managers can handle all supported financial exceptions at their Location;
- digital payment and tips remain safely OFF until the business chooses to enable them;
- feature capability remains present and configuration-driven rather than being removed from the architecture;
- no employee can fabricate digital-provider success or rewrite settled history.

## Consequences

- VAL-008B may implement Manager-only Validation, guest/Manager tip mutation gated by `tipsEnabled`, and guarded pre-collection corrections using existing persistence.
- VAL-008C must implement the actual employee cash-receipt / server-derived paid transition.
- Tips remain dormant while `tipsEnabled = false` but the core must continue to respect that typed switch.
- Digital payment remains dormant while effective policy is `CASH_ONLY`; later provider activation changes configuration/integration, not the Payment domain model.
- Location Manager refund authority is accepted here for the later VAL-008F implementation, still subject to refund-specific concurrency, audit and balance guards.
- No new ValetSession state is introduced.

Affected docs/code:
`docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`, `docs/08_DECISIONS_LOG.md`, `apps/api/src/modules/payments/**`, future VAL-008B/008C/008F/configuration work
