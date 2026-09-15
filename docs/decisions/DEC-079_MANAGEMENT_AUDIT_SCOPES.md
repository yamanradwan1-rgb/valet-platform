# DEC-079 — Management Audit Scopes

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

The existing `AuditEvent` is a Location-required operational record. Company
configuration and account-security activity do not always have a natural
Location, and choosing a fake or arbitrary Location would corrupt scope.

## Decision

Use three distinct audit scopes:

1. Location operational events, compatible with the existing Black Box.
2. Organization-wide events with the real Organization and `location_id =
   null`.
3. Account-security events in a separate security/account audit boundary.

No fake Location may be created or selected. Account-security events are not
copied into every Organization a User belongs to and are never exposed through
tenant Management Audit Log APIs. Each boundary is append-only, records safe
actor provenance appropriate to its trust boundary, and commits atomically with
the protected mutation when applicable.

Tenant audit metadata excludes credentials, MFA material, raw contact data,
raw GPS, provider secrets, request bodies, and unnecessary PII. Account audit
uses its own retention/access/operations policy and does not weaken tenant
isolation.

## Reason

The three scopes reflect real ownership and prevent fabricated tenant/location
history or cross-tenant disclosure.

## Consequences

MGT-BE-01 must extend the current Location-required persistence safely and add
the separate security audit boundary before Management mutations or MFA ship.
Existing Location audit rows and writers remain valid. DEC-029's explicit
provisioning audit Location stays historical behavior, not a general precedent.

## Security and privacy considerations

Each boundary has a separate minimum projection and authorization policy.
Account-security details, credentials, tokens, and raw authentication evidence
must never leak through tenant-visible metadata.

## Supersedes/amends references

Amends the Location-only scope of the current AuditEvent model and DEC-017
audit guidance while preserving existing operational events.

## Affected docs/code

`docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future audit/database/auth implementation.
