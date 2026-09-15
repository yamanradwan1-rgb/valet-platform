# DEC-083 — Management Settings Scope

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

The repository already has ten typed Location overrides and basic branding.
Older scope examples also suggested policy engines whose current valid behavior
has not justified their complexity.

## Decision

Management must expose the existing typed defaults/overrides without replacing
them with generic JSON. The only new current settings categories are:

- Arabic/English language default;
- informational operating hours;
- OCR assist on/off;
- parking Spot required yes/no;
- optional geofence-alert enablement only if implementation evidence justifies
  it;
- per-notification-type on/off; and
- a Location SLA target after the DEC-090 KPI contract is implemented.

Operating hours are informational first and do not block intake or custody.
OCR disablement must preserve manual/no-plate check-in; enablement cannot bypass
DEC-074's provider and durable production cost-guard gate. Notification toggles
select controlled real event types and never expose templates or provider
secrets.

Do not build a Key Policy with only one valid mode, generic Rules Builder,
generic Settings JSON, generic notification-template editor, generic
validation-policy engine, or Location allowed-role policy. Existing typed
financial, handoff, photo, tracking, retention, and branding settings remain
valid and are not removed.

## Reason

Configuration First should represent real operational variability without
inventing a policy platform.

## Consequences

MGT-BE-05 combines the existing typed catalog with the bounded additions above.
The old Key Policy, validation-policy, notification-template, and allowed-role
packets are retired. Geofence alert work remains optional.

## Security and privacy considerations

Writes require current tenant/Location authority, required MFA freshness,
bounded typed values, optimistic concurrency, and atomic safe audit. Provider
secrets are never tenant settings.

## Supersedes/amends references

Narrows open-ended configuration examples in product scope while preserving
the typed configuration and mutation rules of DEC-058/059/062.

## Affected docs/code

`docs/01_PRODUCT_SCOPE.md`, `docs/03_DATABASE_SCHEMA.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future configuration contracts/persistence.
