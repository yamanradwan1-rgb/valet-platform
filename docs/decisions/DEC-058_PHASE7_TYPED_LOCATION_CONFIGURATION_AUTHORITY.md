# DEC-058 — Phase 7 Typed Location Configuration Authority

Status: Accepted
Date: 2026-08-22
Task: VAL-009B — Typed Configuration Management Foundation
Issue: #181

## Context

The Phase 7 Dashboard execution plan (VAL-009) requires a Configuration First
management surface over the ten already-typed Company-default / nullable
Location-override setting pairs, while leaving Company defaults untouched until
the accepted MFA contract exists (DEC-023). Gate G2 of that plan required a
focused decision before any configuration write endpoint could ship.

Current staff authentication is password-only and asserts no MFA. DEC-047
established the precedent that an ACTIVE `LOCATION_MANAGER` with explicit
persisted access to the exact ACTIVE Location may perform narrow Location
configuration without an active Shift, while `ORG_ADMIN` remains denied pre-MFA,
through a narrow `SECURITY DEFINER` write boundary that never widens ordinary
runtime table privileges.

## Decision

1. **Read authority.** An ACTIVE `LOCATION_MANAGER` may read the typed
   effective configuration of an explicitly authorized ACTIVE Location:
   ACTIVE User, ACTIVE `LOCATION_MANAGER` membership, ACTIVE Organization,
   ACTIVE exact target Location in the same Organization, and an explicit
   persisted `membership_location_access` row. No active Shift is required.
2. **Write authority.** The same boundary may SET or CLEAR one Location
   override at a time for exactly these ten settings: `checkInPhotosRequired`,
   `handoffStandardMethodPolicy`, `trackingEnabled`, `rawGpsRetentionDays`,
   `valetServiceFee`, `paymentServicePayer`, `paymentMethodsPolicy`,
   `tipsEnabled`, `validationEnabled`, `releaseRequiresPayment`. CLEAR is an
   explicit inherit-again action; it is never expressed as SET-null. No bulk
   patch exists.
3. **Denials are uniform.** `ORG_ADMIN` (password-only, pre-MFA per DEC-023),
   `VALET_SUPERVISOR`, `VALET_EMPLOYEE` and Guest have no configuration read or
   mutation authority. Unauthorized, cross-tenant, nonexistent and inactive
   cases fail closed through one non-disclosing outcome.
4. **Server-derived authority only.** Client-supplied organization, location,
   membership or role values are never authorization evidence; every check
   re-derives current persisted state.
5. **Resolution semantics.** Effective resolution is always
   `Company default -> optional Location override`. Reads distinguish `default`,
   `overridePresent`, `override` and `effective`; explicit `false` overrides stay
   distinct from absent overrides. Authoritative Location `timezone` and
   `currency` are exposed read-only and are not mutable through this surface.
6. **Narrow SECURITY DEFINER boundary.** Overrides mutate exclusively through
   narrowly scoped PostgreSQL `SECURITY DEFINER` functions following DEC-047:
   owned by the migration/database owner, fixed safe `search_path`, PUBLIC
   EXECUTE revoked, EXECUTE granted explicitly to the runtime role only, actor
   authority revalidated inside the database, no arbitrary table/column/SQL
   selectors, no generic settings JSON, and Organization default columns not
   writable through this surface. Migration 29 is the only authorized migration;
   migrations 1–28 remain byte-for-byte unchanged.
7. **Optimistic concurrency.** Every SET/CLEAR carries the caller's last seen
   `locations.updated_at` as `expectedUpdatedAt`. A stale token produces one
   conflict outcome with no configuration mutation and no audit. Success
   advances `locations.updated_at` and returns the new token.
8. **Atomic audit.** Every successful SET/CLEAR writes exactly one
   same-transaction AuditEvent (scope `LOCATION_OVERRIDE`, operation `SET`
   or `CLEAR`, setting key, old/new override presence and value, old/new
   effective value). Failed authorization, validation or concurrency writes no
   configuration change and no success audit. Pure reads write no audit.
9. **Value validation.** Booleans accept real booleans only;
   `rawGpsRetentionDays` is a positive integer; `valetServiceFee` is non-negative
   exact money in the repository's decimal convention and must be exactly
   representable in the authoritative Location currency under DEC-053 with no
   silent rounding; enums accept existing controlled values only. Invalid input
   fails closed with no mutation and no audit. DEC-053 representability is
   enforced independently inside the SECURITY DEFINER boundary against the
   persisted Location currency through the deterministic checked-in
   minor-unit exponent authority (`location_configuration_minor_unit_exponent`),
   so direct runtime-role calls cannot bypass API-side validation.
10. **Prospective effect.** Persisted configuration affects subsequent policy
    evaluation immediately, without deployment or restart, and never rewrites
    historical Payment, Validation, session, task or audit facts.
11. **No Company-default mutation.** No principal may update Organization
    default policy through this surface pre-MFA; that remains gated by the
    future MFA decision (Phase 7 gate G1).

## Consequences

VAL-009B can ship the sellable-MVP typed configuration management foundation
without widening runtime table privileges and without weakening DEC-023.
Company-default administration, Category-B settings persistence (G3), SLA
semantics (G4) and MFA remain separate gated work. Runtime privilege proofs must
continue to demonstrate no generic UPDATE on `organizations` or `locations`, EXECUTE
only on the narrow functions, and PUBLIC unsafe-EXECUTE denial.

Full binding contract: this file.
