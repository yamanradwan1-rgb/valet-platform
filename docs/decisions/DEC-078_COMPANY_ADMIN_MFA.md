# DEC-078 — Company Admin MFA

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

DEC-023 deliberately leaves privileged `ORG_ADMIN` APIs unavailable until an
accepted MFA enrollment, challenge, recovery, and session-assurance contract
exists. The current `StaffPrincipal` still contains only `userId`; the newer
`StaffSessionContext` identifies the persisted Staff session but carries no MFA
assurance.

## Decision

Production Company Admin uses password plus a TOTP authenticator application.
SMS OTP is not an MVP factor. Enrollment creates ten one-time recovery codes;
only safe one-way verifiers are stored and raw codes are shown once.

A Company Admin who retains a recovery code may authenticate and self
re-enroll. Lost phone with no recovery code has no peer-Company-Admin bypass.
Recovery is VAYLET-mediated, explicitly verified, and recorded in the separate
account-security audit boundary established by DEC-079.

Successful MFA verification establishes server-side assurance on the exact
`StaffAuthSession` for at most eight hours. Thirty minutes of admin inactivity
requires step-up. Sensitive actions require MFA verified within five minutes.
Expiry is a soft step-up, not forced logout. Access/refresh rotation may retain
the session but must never silently extend MFA verification or activity time.
The server derives all assurance; no client `mfa=true`, role claim, device fact,
or refresh event is authority.

Enrollment, verification, recovery-code consumption, re-enrollment, and
assurance updates require bounded abuse controls, atomic single-use semantics,
safe retries, and race tests against refresh, replay revocation, logout, User
disable, and session expiry. Secrets, TOTP seeds, raw codes, passwords, tokens,
and verifiers never enter logs, tenant audit, or responses beyond the single
authorized enrollment/recovery disclosure.

## Reason

This completes DEC-023's explicit security gate with a deployable factor and a
session-bound freshness model while preserving the existing opaque session
lifecycle.

## Consequences

MGT-BE-02 owns the schema, migration, contracts, abuse controls, and Web/native
session interaction. Company Admin Management capability remains unavailable
until this decision is implemented and verified. This decision amends, and
does not replace, DEC-023 and DEC-072.

## Security and privacy considerations

TOTP seeds and recovery values are secrets: expose them only during the
authorized ceremony, protect factor material at rest, and never place them in
logs, URLs, telemetry, or tenant audit.

## Supersedes/amends references

Amends DEC-023 by resolving its deferred Company Admin MFA contract. DEC-072
session transport and DEC-075/076 push-session rules remain binding.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future auth/contracts/database tests and implementation.
