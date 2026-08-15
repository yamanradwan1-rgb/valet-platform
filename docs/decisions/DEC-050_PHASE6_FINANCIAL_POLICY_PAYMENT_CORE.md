# DEC-050 — Phase 6 Effective Financial Policy & Payment Core

Status: Accepted  
Date: 2026-08-15  
Task: VAL-008A — Effective Financial Policy + Payment Core  
Issue: #170

## Context

Phase 6 starts from accepted payment-centric persistence (`Payment`, `Validation`, `CashEntry`, `PaymentProviderEvent`, `Refund`) but the repository does not yet contain the typed Configuration-First financial policy needed to create a canonical Payment from authoritative Company/Location settings.

Founder & Product Blueprint v1.0 makes the following Location settings configurable: currency, valet fee, payment methods, tips, release policy and validation rules. It prefers Company default -> Location override. The Blueprint also requires Customer Pays, Venue Pays, Full/Partial Validation, cash, tips and one real digital gateway for the sellable MVP.

Accepted DEC-004 keeps financial state outside `ValetSession`. DEC-017 defines Company default -> Location override. DEC-018 makes Location currency authoritative. DEC-021/022 define the existing Payment/Validation/Cash/ProviderEvent/Refund model and exact financial row semantics.

The Project Owner also approved Phase 6 sequencing in VAL-008: finish a provider-neutral `PROVIDER_READY` core before selecting/activating a real digital provider.

This decision therefore introduces only the smallest typed policy needed by VAL-008A, preserves current production behavior for existing tenants, and avoids inventing provider-specific or accounting behavior.

## Decision

### 1. Typed financial policy uses Company default -> Location override

Add typed financial policy fields to `Organization` with nullable overrides on `Location`.

Organization defaults:

```text
valet_service_fee = 0
payment_service_payer = CUSTOMER
payment_methods_policy = CASH_ONLY
tips_enabled = false
validation_enabled = false
release_requires_payment = false
```

Location overrides are nullable:

```text
valet_service_fee_override
payment_service_payer_override
payment_methods_policy_override
tips_enabled_override
validation_enabled_override
release_requires_payment_override
```

`NULL` means inherit the Organization value.

No generic JSON policy blob is introduced.

### 2. Payment-method policy is typed and intentionally small

The policy has exactly these MVP values:

```text
CASH_ONLY
DIGITAL_ONLY
CASH_OR_DIGITAL
```

This policy defines what the Location permits. It does not itself prove that a real digital provider is activated.

There is no split tender, installment or multiple-successful-collection policy.

### 3. Safe migration defaults preserve existing release behavior

The migration defaults are intentionally conservative:

```text
valet_service_fee = 0
payment_service_payer = CUSTOMER
payment_methods_policy = CASH_ONLY
tips_enabled = false
validation_enabled = false
release_requires_payment = false
```

All existing Location overrides start `NULL`.

Therefore introducing the policy cannot unexpectedly charge an existing session, enable tips/validation, require a provider, or block an existing vehicle release.

A customer must explicitly configure non-zero fees or stricter behavior later.

### 4. No separate `payment_enabled` flag

A separate payment-enabled boolean is not added.

The effective financial terms are derived from typed policy:

- `valet_service_fee` is the base service amount snapshot;
- `payment_service_payer` determines whether the base service is owed by CUSTOMER or VENUE;
- tips and validation are independently enabled/disabled;
- collection method policy controls permitted collection paths;
- release blocking is independently controlled by `release_requires_payment`.

A zero-fee session may still later carry an optional tip when tips are enabled, so `fee = 0` must not be treated as a permanent statement that no Payment can ever exist.

### 5. Location currency remains authoritative and is not duplicated in policy

Currency continues to come from the persisted `Location.currency` required by DEC-018.

When Payment is created, its `currency` is a historical snapshot of the authoritative Location value.

Caller input never chooses or overrides currency.

### 6. Canonical Payment snapshot

VAL-008A creates at most one canonical Payment per ValetSession when the financial policy is first evaluated by the owning financial command.

The Payment snapshots:

```text
organization
location
valet session
Location currency
current effective valet service fee
current effective service payer
initial tip amount = 0
current derived amount due
chosen canonical collection method
exact Payment status
creation idempotency identity
```

Policy changes after Payment creation do not silently rewrite the existing Payment. Historical Payment meaning stays stable. Any later allowed pre-collection correction must use the explicit DEC-022/VAL-008B correction rules and audit.

Absence of a Payment is not equivalent to `NOT_REQUIRED`.

### 7. Initial amount calculation

At creation:

For `CUSTOMER` payer:

```text
customer service due = valet_service_fee
amount_due = customer service due + tip_amount
```

For `VENUE` payer:

```text
customer service due = 0
amount_due = tip_amount
```

Initial `tip_amount = 0` in VAL-008A.

Validation does not mutate the Payment in VAL-008A; validation commands belong to VAL-008B.

### 8. Zero-due row is exact

If initial `amount_due = 0`, create the canonical Payment as:

```text
collection_method = NONE
status = NOT_REQUIRED
amount_paid = 0
provider = NULL
provider_reference = NULL
paid_at = NULL
```

This is a financial projection, not a ValetSession state.

### 9. Positive-due CASH behavior is executable in VAL-008A

If `amount_due > 0` and effective policy is `CASH_ONLY`, create:

```text
collection_method = CASH
status = UNPAID
amount_paid = 0
```

No CashEntry is created by VAL-008A. Cash receipt/collection belongs to VAL-008C.

If effective policy is `CASH_OR_DIGITAL`, the provider-ready core initially chooses `CASH` as the canonical collection method until a later authorized pre-collection method-selection command can choose DIGITAL after a real provider is available.

This choice prevents provider-specific fields from being fabricated before provider activation.

### 10. DIGITAL_ONLY fails closed before provider activation

Accepted DEC-021 requires a DIGITAL Payment to have a provider value. Phase 6 core currently has no selected/activated provider.

Therefore, before VAL-008I activates a real provider:

```text
payment_methods_policy = DIGITAL_ONLY
+ positive amount_due
=> financial initialization fails closed as digital provider unavailable
=> no invalid DIGITAL Payment row is created
```

A future selected-provider activation may satisfy this policy without changing the finance-core business model.

No placeholder provider name such as `mock`, `test`, `generic` or `pending` may be persisted in production to bypass this rule.

### 11. Tips and validation default OFF but are first-class policy

`tips_enabled` defaults false.

`validation_enabled` defaults false.

These safe defaults avoid changing existing tenant behavior merely by applying the migration.

VAL-008B owns:

- tip mutation/freeze rules;
- full/partial/no-validation commands;
- validation proof/authority;
- guarded pre-collection financial corrections.

VAL-008A only persists/resolves the policy and snapshots the initial zero tip.

### 12. Release blocking default is OFF

`release_requires_payment` defaults false so the migration cannot retroactively block the existing Phase 4 secure-release path.

VAL-008A does not modify `complete-handoff` runtime behavior.

VAL-008G later composes the accepted financial guard inside the existing DEC-043 final release transaction. VAL-008G must define the exact financial-satisfaction predicate before enabling the guard.

### 13. Financial configuration writes are not exposed by VAL-008A

VAL-008A does not add a public Dashboard/configuration mutation API for these policy fields.

It adds the typed persistence and authoritative resolver consumed by financial commands. Tests may set policy through controlled fixtures/admin setup.

A later owning management/configuration task must define the production write authority. Company-default mutation must not be granted to password-only `ORG_ADMIN` while the Blueprint's Company Admin MFA requirement remains unmet. Location override authority must likewise be explicitly accepted before a public write API is exposed.

This avoids turning VAL-008A into an unreviewed financial-admin surface.

### 14. Server authority

The financial initialization boundary derives all authority from persisted records.

Caller input must not become authority for:

```text
organization
location
currency
service payer
service fee
allowed payment methods
validation enablement
tip enablement
release policy
provider/provider reference
amount due
amount paid
```

A caller may supply only narrow command identity/retry information and the session identifier required by the accepted API contract.

Tenant and Location probing must remain non-disclosing.

### 15. Transaction, idempotency and concurrency

Payment creation and required AuditEvent must commit atomically.

The existing uniqueness rule of at most one Payment per ValetSession remains canonical.

Creation idempotency is Organization-scoped and must not be reusable across tenants.

Concurrent/retried initialization for the same session must produce one canonical Payment and no duplicate financial/audit effect.

`Payment.creation_idempotency_key` protects Payment creation only. It is not reused as the later outbound provider-operation idempotency mechanism.

### 16. Audit

Successful first financial initialization writes a narrow AuditEvent containing business-safe identifiers and normalized financial facts needed for Black Box traceability.

Audit must not contain card data, provider credentials, Authorization values, raw secrets or arbitrary request bodies.

### 17. Persistence impact

VAL-008A owns exactly one new forward-only migration for the typed Organization defaults, Location nullable overrides and payment-method policy enum required by this decision.

Migrations 1–25 remain immutable.

Existing Payment/Validation/CashEntry/PaymentProviderEvent/Refund entities are reused and not redesigned.

No PaymentAttempt, ledger, drawer, receivable, settlement or provider-specific persistence is introduced.

## Explicit exclusions

This decision does not implement or accept:

- Validation proof/authority or mutation;
- tip mutation/allocation/payroll;
- cash receipt or Cash Expected vs Cash Reported;
- selected digital provider or hosted checkout;
- provider callback semantics;
- refunds;
- final financial release-guard predicate/runtime;
- Dashboard/UI;
- POS/PMS;
- Venue Client persistence;
- MFA implementation;
- split tender/installments;
- accounting ledger/receivables/settlement;
- subscription billing;
- multiple live providers.

## Consequences

VAL-008A can implement a migration-safe, provider-neutral financial foundation without inventing a payment gateway or unexpectedly blocking existing operations.

Existing tenants remain effectively free/non-blocking until financial settings are deliberately configured. Cash can be the first executable collection path. Digital-only policy remains representable but fails closed until a real provider is activated. Later Validation, Tips, Cash, Refund, release-guard and provider tasks compose around the same canonical Payment rather than redesigning the aggregate.
