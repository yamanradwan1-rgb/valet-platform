# DEC-085 — Effective Management and Guest Branding

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

DEC-062 already persists Organization display name/primary-color defaults and
nullable Location overrides, but only Location Manager override APIs exist and
Guest Access does not project effective branding.

## Decision

Basic branding remains exactly display name and primary color with precedence:

```text
Company default -> Location override -> effective value
```

An MFA-assured Company Admin may manage Company defaults and allowed Location
overrides. Location Manager retains only authorized Location override authority.
Guest Access uses the effective branding of the real persisted visit Location;
the client cannot choose an Organization, Location, name, or color.

No free CSS, custom fonts, theme builder, advanced white label, custom domain,
or sender-branding system is introduced. Existing DEC-062 validation,
concurrency, audit, and narrow database-authority rules remain binding.

## Reason

One truthful inherited projection serves Management and Guest without a second
branding model.

## Consequences

MGT-BE-05 owns Company/default management; MGT-BE-12 closes a missing
guest-safe effective projection if it remains absent.

## Security and privacy considerations

The server resolves branding from the persisted visit Location and returns
only validated display name/color. Guest input cannot select tenant scope or
inject active content.

## Supersedes/amends references

Amends DEC-062 by accepting Company-default Management and the guest-safe
effective projection; its asset deferral remains in DEC-086.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future branding/Guest Access contracts.
