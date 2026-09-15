# DEC-084 — Management Customers as Visit Contacts

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

`Customer` is minimal Organization-scoped visit contact data, not an account or
verified identity. DEC-069 permits narrow exact-plate returning assistance but
forbids Employee directories and ownership inference.

## Decision

The Management Customers surface is visit management, not CRM. Authorized
search may use exact/normalized phone, plate, or name. Name search is permitted
only inside visit history already visible for the viewer's authorized
Organization/Location scope; it is not a platform or unscoped people search.

Results may include display name, an authority-appropriate phone projection,
visit count, last visit, and vehicles associated through visits. The product
must call this a visit association and must not claim legal or current vehicle
ownership. Search is bounded and paginated; identifiers and normalization are
server-derived from stored tenant facts.

Sensitive corrections are explicit, concurrency-safe, audited, and preserve
historical custody associations. No campaigns, tags, segments, loyalty,
marketing notes, bulk export, Customer account, or automatic merge is added.
Employee recognition remains governed by DEC-069 and gains no directory access.

## Reason

Managers need visit history while the current data model cannot truthfully
support CRM or ownership claims.

## Consequences

MGT-BE-08 owns safe projections and controlled corrections. Current Jordan-only
Check-In phone normalization is an implementation fact; broader international
normalization is not inferred by this decision.

## Security and privacy considerations

Contact fields are purpose-limited and minimized by role. Search, correction,
pagination, and audit cannot become an Employee directory, cross-tenant oracle,
ownership claim, or bulk contact export.

## Supersedes/amends references

Amends DEC-069 only by defining the Management visit-contact surface; its
Employee exact-match and anti-directory limits remain unchanged.

## Affected docs/code

`docs/01_PRODUCT_SCOPE.md`, `docs/02_DOMAIN_MODEL.md`,
`docs/06_SECURITY_AND_DATA_RULES.md`, `docs/08_DECISIONS_LOG.md`,
`docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`, future customer queries.
