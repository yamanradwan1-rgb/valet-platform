# DEC-062 — Phase 7 Basic Branding and Subscription Entitlements

Status: Accepted
Date: 2026-08-22
Task: VAL-009F — G8 basic branding & subscription entitlements
Issue: #185

## Context

Phase 7 gate G8 required basic branding/subscription to be explicitly
accepted (not silently omitted) before the Dashboard UI stream begins. This
decision locks the deliberately small sellable-MVP surface: two typed
branding values with Location overrides plus a read-only typed Organization
subscription state. Advanced white label remains V2; billing execution,
provider activation, checkout, invoices, payment methods, renewal/cancellation
workflows, custom domains, fonts, theme builders, and email/SMS sender
branding are out of scope.

## Part A — Basic branding

1. **Inheritance**: `Company default -> optional Location override ->
   effective value`. No generic JSON branding/settings object.
2. **Exactly two concepts**: `brandDisplayName` and `brandPrimaryColor`.
   No secondary/accent/background palettes, no typography, no CSS.
3. **Display name default** is the existing `Organization.name`; no duplicate
   Organization branding-name column is created. Locations may override via a
   new nullable `locations.brand_display_name_override`. Effective:
   `COALESCE(location.brand_display_name_override, organization.name)`.
4. **Primary color default** is a new non-null
   `organizations.brand_primary_color` backfilled to the official VAYLET
   primary `#176BFF`. Locations may override via new nullable
   `locations.brand_primary_color_override`. Effective:
   `COALESCE(location.brand_primary_color_override,
   organization.brand_primary_color)`.
5. **Logo deferred.** Basic logo customization is deferred from VAL-009F
   until a server-controlled verified asset-storage boundary exists. The
   existing `VehiclePhoto.storageObjectKey` boundary is client-declared
   metadata and is not trusted object evidence; VehiclePhoto MUST NOT be
   reused as logo storage, no generic `storageObjectKey` branding field may
   be invented, and no S3/bucket/provider design belongs to this decision.
6. **Validation.** Display name: UTF-8, outer-trimmed, non-empty after trim,
   at most 120 Unicode code points, Unicode control characters (`\p{Cc}`)
   rejected; Arabic/non-ASCII preserved (no transliteration). Colors:
   canonical uppercase hex only (`^#[0-9A-F]{6}$`), no alpha/gradients/named
   colors/lowercase stored form; the API validates strictly and does not
   normalize case. The database independently enforces valid persisted forms
   through CHECK constraints so direct SQL cannot store invalid values.
7. **Authorization.** Reads and writes use the exact VAL-009A Dashboard
   manager boundary: ACTIVE User, ACTIVE `LOCATION_MANAGER` membership,
   ACTIVE Organization, ACTIVE exact target Location, explicit
   `membership_location_access`, no Shift required. Password-only ORG_ADMIN
   pre-MFA, Supervisors, Employees, Guests, same-org ungranted,
   cross-tenant/nonexistent/inactive cases fail closed non-disclosingly. No
   Company-default branding mutation endpoint exists.
8. **Concurrency.** Every SET/CLEAR carries `expectedUpdatedAt`
   (`locations.updated_at`). Stale token ⇒ conflict, zero mutation, zero
   success audit. Success advances `updated_at` and returns the new token.
   No second version column.
9. **Audit.** Each successful SET/CLEAR writes exactly one same-transaction
   AuditEvent `DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED` scoped to the
   exact Organization/Location, `valet_session_id NULL`,
   `entity_type='Location'`, actor = fresh authorized LM membership, safe
   metadata only (`scope=LOCATION_BRANDING_OVERRIDE`, `operation=SET|CLEAR`,
   `settingKey`, old/new override presence+value, old/new effective). Failed
   authorization/validation/concurrency writes none; pure reads write none.

### Branding persistence authority

Migration `20260822003000_phase7_basic_branding_subscription_entitlements`
is the only migration; migrations 1–29 are immutable. Overrides mutate only
through narrow DEC-047/DEC-058-style `SECURITY DEFINER` functions — one per
operation (set/clear × display name/color) — each with fixed safe
`search_path`, owner-owned, PUBLIC EXECUTE revoked, EXECUTE granted solely to
the runtime role, in-database actor revalidation, `expectedUpdatedAt` recheck,
independent value validation, exact-Location mutation, monotonic
`updated_at` advance, and one atomic AuditEvent. The runtime role gains NO
generic UPDATE on `organizations` or `locations`.

### Branding HTTP contract

Exact routes in the existing Dashboard namespace:
`GET /v1/staff/dashboard/locations/:locationId/branding`,
`PUT .../branding/override` (strict discriminated union by `setting` with
`value` + `expectedUpdatedAt`),
`POST .../branding/override/clear` (`setting` + `expectedUpdatedAt`; CLEAR =
inherit Company default again). No bulk patch, no null-as-clear, no generic
settings API. GET returns strict `{locationId, updatedAt, displayName{},
primaryColor{}}` groups with `default/overridePresent/override/effective`;
no logo property or placeholders.

## Part B — Subscription entitlement state

1. **Purpose**: minimum typed customer-visible subscription/admin state for
   the sellable MVP. This is NOT billing execution.
2. **Persistence**: dedicated one-to-one table
   `organization_subscriptions`: `organization_id` UUID PK/FK → Organization
   (restrictive delete), `plan_code` text, `status` enum
   (`TRIAL | ACTIVE | SUSPENDED` — nothing else),
   `dashboard_access_enabled`, `report_exports_enabled`,
   `basic_branding_enabled` booleans, `created_at`/`updated_at` timestamptz
   DB defaults. Zero or one row per Organization; no row means
   `subscription: null`; existing Organizations get NO fabricated plan.
   Forbidden fields: price, billing interval, amount, currency, invoice/
   payment-method/Stripe ids, renewal/cancellation/trial dates, seat count,
   arbitrary JSON entitlements.
3. **Plan code**: opaque internal identifier, uppercase canonical
   `^[A-Z0-9][A-Z0-9_-]{0,63}$`, database-enforced; no hard-coded plan names;
   entitlement behavior is never derived from the plan code.
4. **Entitlements**: exactly three persisted boolean columns
   (`dashboardAccess`, `reportExports`, `basicBranding`). No generic
   entitlement JSON/key-value table/caller-supplied feature names. VAL-009F
   exposes typed entitlement state but does NOT retrofit entitlement gating
   onto VAL-009A–E routes; branding authorization does not depend on these
   booleans in this task; composition requires a future focused decision.
5. **Authority/read**: authenticated exact-Location `LOCATION_MANAGER` only
   via the same server-derived primitive (no Shift); response is the
   subscription row of the authorized Location's Organization; caller cannot
   supply organizationId. Denied cases fail closed non-disclosingly. There is
   NO customer-facing subscription mutation route and no audit for reads.
6. **Pilot mutation path**: provisioning/change is an internal platform
   operational concern outside the customer API; tests seed rows with admin
   authority. No internal HTTP admin endpoint, no VAYLET Super Admin model,
   no hidden customer mutation endpoint, no runtime-executable SQL mutation.
   The runtime role holds SELECT only on `organization_subscriptions`
   (INSERT/UPDATE/DELETE/TRUNCATE denied).

### Subscription HTTP contract

Exact route `GET /v1/staff/dashboard/locations/:locationId/subscription`
returning strict `{organizationId, locationId, subscription: null |
{planCode, status, entitlements{dashboardAccess, reportExports,
basicBranding}}}`. No marketing label, price, checkout URL, provider/billing
identifiers, or arbitrary entitlement map.

## Consequences

G8 closes without expanding into billing/white-label systems, Phase 7 route
behavior stays stable, and the Dashboard UI stream can begin against typed,
authorized, audited branding and read-only subscription surfaces. Future work
(entitlement enforcement composition, automated provisioning, logo behind a
verified asset boundary, billing execution) each require focused decisions.

Full binding contract: this file.
