# DEC-053 — Phase 6 Currency Minor-Unit Authority

Status: Accepted  
Date: 2026-08-16  
Task: VAL-008C-FIX / Phase 6 financial money-boundary remediation  
Issue: #174

## Context

DEC-022 already separates PostgreSQL storage precision from currency validity: financial persistence remains `numeric(14,3)`, while domain/provider commands must validate or deterministically quantize monetary inputs to the Payment currency's supported minor-unit exponent without silent material rounding.

Independent review of VAL-008C found that the repository currently enforces only the generic `numeric(14,3)` input/storage shape at new cash monetary boundaries. The repository contains no accepted supported-currency allowlist, ISO-4217 minor-unit table, or accepted `Intl`/CLDR/ICU authority. Inventing a hand-written mapping or allowing runtime locale/library behavior to decide financial validity would make the result non-authoritative or non-deterministic.

The same accepted DEC-022 invariant applies beyond VAL-008C to the existing Phase 6 monetary boundaries that can introduce or correct Payment terms, Validation amounts or tips.

## Decision

### 1. External standards authority

ISO 4217 minor-unit data, as maintained by SIX Financial Information in its role as the ISO 4217 Maintenance Agency, is the external authority for currency minor-unit exponents.

Canonical external references are:

- ISO 4217 currency-code standard information: `https://www.iso.org/iso-4217-currency-codes.html`
- SIX Financial Data Standards / ISO 4217 lists: `https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html`

The implementation must record the source/snapshot date used to build the checked-in VAYLET registry.

### 2. Deterministic runtime authority

Production financial validity must not depend on a runtime network lookup, `Intl.NumberFormat`, CLDR/ICU behavior, operating-system locale data, browser locale data or provider SDK defaults.

A released VAYLET build uses a reviewed, checked-in repository registry/snapshot derived from the authoritative ISO 4217/SIX current-currency list. Updating that registry is an explicit reviewed source change. A Node, browser, operating-system or locale-data upgrade therefore cannot silently change accepted financial precision.

The checked-in registry is financial reference data, not mutable tenant configuration.

### 3. Exact representability rule

The resolver maps an uppercase ISO alpha-3 currency code to one exact minor-unit exponent.

VAYLET storage remains `numeric(14,3)`. For an authoritative numeric exponent from `0` through `3`, an input is accepted only when its value is exactly representable at that currency exponent.

Fractional digits beyond the authoritative exponent are allowed only when they are all zero and therefore do not change the value.

Examples for exponent `2`:

- `1`, `1.2`, `1.20` and `1.200` are representable;
- `1.001`, `1.201` and `0.009` are not representable and must be rejected.

Exponent `3` permits every otherwise-valid `numeric(14,3)` amount.

There is no silent rounding or truncation. A non-representable caller/configured amount is rejected rather than changed.

### 4. Unsupported currency behavior

If the checked-in registry has no usable numeric minor-unit exponent for a currency, the financial command fails closed before mutation.

If the authoritative exponent exceeds VAYLET's current `numeric(14,3)` storage capability, the financial command also fails closed before mutation.

No default exponent is guessed.

This precision authority does not assert that a currency is supported by a future payment gateway. Provider/acquirer currency support remains a separate selected-provider concern owned by later Phase 6 provider activation.

### 5. Current Phase 6 remediation scope

After this decision is accepted, one shared deterministic minor-unit resolver must be applied to every current Phase 6 monetary boundary that can introduce or correct an amount, including at minimum:

- canonical Payment initialization/effective service amount before persistence, using authoritative Location/Payment currency;
- `PARTIAL` Validation input, using canonical Payment currency;
- Manager tip input, using canonical Payment currency;
- authenticated Guest tip input, using the Guest's canonical Payment currency;
- Manager service-amount correction input, using canonical Payment currency;
- VAL-008C cash-adjustment input, using canonical Payment currency;
- Shift-end `cashReported`, using the authoritative Shift Location currency.

Server-derived arithmetic such as full cash receipt, Validation recomputation, amount due, cash expected and variance remains exact arithmetic after valid monetary inputs have crossed the currency boundary. No second rounding step is introduced.

### 6. Error and mutation semantics

Currency precision validation occurs before the protected command commits any financial mutation.

A rejected non-representable or unsupported-currency amount must not partially write Payment, Validation, CashEntry, Shift reconciliation or AuditEvent state.

Existing non-disclosing tenant/Location/authentication behavior remains unchanged. The public error contract must remain bounded and must not expose internal registry structure, SQL or provider details.

### 7. Persistence and dependencies

No migration is approved by DEC-053.

Migration count remains exactly 27 for the VAL-008C branch. Existing `numeric(14,3)` schema columns and migrations 1–27 remain unchanged.

No new external runtime dependency is approved merely to obtain ISO/CLDR currency data. The registry and resolver should use repository-owned deterministic code/data and existing toolchain capabilities.

### 8. Required proof

Tests must prove at minimum:

- one authoritative 3-decimal currency path accepts a non-zero third decimal;
- one authoritative 2-decimal currency path accepts valid 2-decimal input;
- a 2-decimal currency rejects a non-zero third decimal;
- a mathematically equivalent trailing-zero third decimal remains accepted for a 2-decimal currency;
- no silent rounding occurs;
- unsupported or unrepresentable currency precision fails closed without writes;
- canonical Payment initialization rejects an effective service amount that is not representable in the Location currency;
- existing Validation, Manager/Guest tip, service-amount correction, cash-adjustment and Shift-reconciliation paths enforce the same shared rule;
- JOD 3-decimal behavior remains valid;
- all affected Phase 6 Payment/Validation/tip/cash/Shift regressions remain green.

### 9. Explicit non-goals

DEC-053 does not introduce:

- payment-provider selection or a provider currency matrix;
- FX or currency conversion;
- tax behavior;
- pricing UI;
- a Location financial-settings API;
- migration 28;
- a new accounting/ledger abstraction;
- runtime CLDR/locale authority;
- silent financial rounding.

## Reason

VAYLET is designed for Location-owned currency and multi-country operation, so accepting an amount merely because it fits `numeric(14,3)` is insufficient. ISO 4217/SIX provides the external standards authority, while a reviewed checked-in snapshot makes runtime behavior deterministic and reviewable. Exact representability preserves user/provider monetary intent and avoids hidden rounding.

## Consequences

- Phase 6 gains one shared currency-precision authority instead of separate ad hoc validators.
- Existing `numeric(14,3)` persistence remains stable and forward migrations are not required.
- JOD continues to support three decimal places while currencies with lower minor-unit exponents reject materially over-precise amounts.
- Unsupported/unknown precision fails closed rather than guessing.
- VAL-008C remains blocked from approval until this accepted decision is implemented and the affected current Phase 6 money boundaries are remediated and re-reviewed.

## Affected docs/code

- `docs/08_DECISIONS_LOG.md`
- `docs/03_DATABASE_SCHEMA.md`
- `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`
- `apps/api/src/modules/payments/**`
- `apps/api/src/modules/shifts/**`
- `packages/contracts/**` as needed for shared contracts/tests
- focused Phase 6 Payment/Validation/tip/cash/Shift tests
