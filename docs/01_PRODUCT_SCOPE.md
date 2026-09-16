# MVP Product Scope

Status: Binding  
Version: 0.2

## Goal

Build a sellable B2B SaaS valet operating system that can run a real location for a full shift without paper tickets and without daily developer intervention for normal operating-policy changes.

The primary commercial ICP is a valet operator managing roughly 5–50 locations, while the first pilot may deliberately run at one location with a limited team to measure real operational improvement.

VAYLET software does not employ valet drivers or take vehicle custody in the base business model.

## Product principles

- Employee speed first: common actions should take the fewest practical taps.
- Configuration First: normal customer/location operating differences are managed from Dashboard configuration rather than hard-coded.
- Least privilege: each actor sees only what is required.
- Audit by default: important actions create durable Black Box/audit events.
- Guest friction minimum: no mandatory account or app install.
- International by design: Arabic/English, RTL/LTR, location currency/timezone and multi-country data assumptions.
- Sell the operating system before advanced prediction, custom hardware or speculative AI.

## Personas and roles

### Guest / Customer

Must be able to:

- receive a secure phone-based WhatsApp/SMS link, with QR fallback where needed
- view safe vehicle/session status
- request the vehicle
- see retrieval/ready progress and ETA when available
- pay/tip when required by location policy
- use secure pickup QR/code
- receive receipt
- rate experience / report an issue when enabled

Must not see exact parking coordinates or key-slot information.

No mandatory customer account/password/app is required for MVP.

### Valet Employee

Must be able to:

- authenticate
- start/end a location-scoped shift
- see/accept assigned operational tasks
- start a new vehicle check-in
- scan plate using OCR/ANPR, confirm/edit, or use manual fallback
- record vehicle condition quickly
- capture photos when chosen/required by policy
- assign/scan QR key slot
- park and assign zone/spot, with QR/manual fallback
- perform retrieval
- complete secure handoff
- report an incident
- see shift summary

Employee cannot delete audit history, issue refunds, or perform unrestricted overrides.

### Valet Supervisor

Must be able to:

- supervise vehicles/tasks at authorized locations
- reassign tasks
- handle operational exceptions
- use limited audited overrides where policy permits
- review/triage incidents

### Location Manager

Must be able to:

- manage the authorized location
- see shifts, revenue, keys, incidents, KPIs and reports
- configure approved location operating policies
- manage zones/spots/maps as permitted

Must not automatically see other company locations.

### Company Admin

Internal tenant-role mapping: `ORG_ADMIN`.

Must be able to:

- manage company locations
- manage staff/roles and approved permission settings
- manage company defaults and location overrides
- manage approved prices/policies/branding as implemented
- view read-only plan, subscription status and included Management features
- view company-authorized reports

Production Company Admin requires MFA.

Accepted DEC-078 through DEC-094 clarify this Management boundary. Company
Admin MFA is password + TOTP with recovery codes and server-side assurance.
Company Admin Management authority does not imply operational field authority
for check-in, parking, handoff, key movement or custody. Only VAYLET controls
commercial entitlements, and a Management entitlement lapse must never block
field operations or safe completion of a vehicle already in custody.

MGT-BE-03 implements the Company Admin control-plane foundation. An MFA-assured
`ORG_ADMIN` selects an active Organization from its own active Company Admin
memberships, then selects either one Organization-owned Location or the explicit
`ALL_LOCATIONS` scope. Organization and Location selectors are bounded and
paginated. The returned capability catalog and selected context are a UI/read
snapshot only: protected Management use revalidates the current User, exact
Staff session MFA assurance, active membership/role, active Organization, target
ownership and capability-specific conditions from persistence.

The `ALL_LOCATIONS` scope in MGT-BE-03 is selection/context foundation only. It
does not implement All Locations analytics, company-wide report aggregation, or
commercial entitlement enforcement. Existing exact-Location Location Manager
Dashboard authority remains available under its existing grants. MFA-backed
Company Admin may use the existing authorized Location Dashboard/analytics/
reports/export reads and current live operations map, but raw route history,
map-setup mutation and operational field commands remain outside Company Admin
authority.

MGT-BE-04 implements DEC-081 Staff, Roles & Access on top of that control
plane. Company Admin can read a bounded Organization staff directory and
membership detail, change a membership among the four existing base roles,
activate/deactivate a tenant membership, and grant/revoke Organization-owned
Locations. The directory is tenant-minimized: it exposes the membership ID,
email identity, role, status, shared membership version and Location-access
counts; detail adds at most 100 named Location grants with a total/truncated
indicator. It does not expose User IDs, phone data, Staff sessions, MFA state,
other-Organization memberships or operational responsibility.

The directory query is page-first: it resolves the bounded Organization
membership page by `(created_at, id)` before joining User identity and counting
Location grants. Migration 37 adds only the three justified Staff-management
indexes needed for this page path and the intake/incident handover blocker
lookups; it does not introduce a broader speculative index set.

Role/status/grant mutations require current Company Admin authority and
five-minute MFA freshness. They use one shared monotonic
`OrganizationMembership.version` CAS and desired-state semantics: an exact
retry that already reached the requested state is a no-op with no extra version
or tenant audit event, while a different stale request conflicts. Database
command boundaries fail closed for nullable CAS/mode inputs. The role catalog
remains exactly `ORG_ADMIN`, `LOCATION_MANAGER`, `VALET_SUPERVISOR` and
`VALET_EMPLOYEE`; MGT-BE-04 adds no generic permission engine.

Access reduction cannot strand live work. Deactivation, operational-role
removal and Location-grant revocation recheck active Shift responsibility,
assigned/accepted/in-progress Tasks, unhanded-off intake responsibility, and
unexpired `RESERVED` incident-recovery intent. Key custody does not add a
second mutable responsibility owner: the active Task is the canonical current
operational owner, while `KeyCustodyEvent` remains immutable custody history.
An `ORG_ADMIN` demotion with dormant Location grants is rejected until those
grants are explicitly reconciled, so a role change cannot silently turn old
grants into new authority.

The last usable Company Admin cannot be normally demoted or deactivated. A
usable admin means an active `ORG_ADMIN` membership in an active Organization
for an active User with an `ACTIVE` TOTP factor; a live Staff session or recent
step-up is not required for that availability count. Normal staff-management
changes serialize per Organization before this decision.

Tenant membership `INACTIVE` remains Organization-scoped and leaves the User
and any memberships in other Organizations intact. Global User `DISABLED` is a
separate controlled VAYLET security action: it revokes all Staff sessions for
that User, disables their active push registrations, blocks later login/refresh
and push re-registration, and preserves memberships plus Shift/Task/intake/key/
incident operational truth for explicit recovery.

### Venue Client

Blueprint actor for a venue/customer that needs restricted visibility into its own location performance, validations, ratings, SLA and incidents.

Exact identity/persistence model is not yet locked and must not be invented inside unrelated tasks.

### VAYLET Super Admin

Platform-level operator role for tenants, subscriptions, support, feature flags and system health.

It is not an `OrganizationMembership` role. Sensitive access must be justified/audited and production access requires MFA. Exact persistence model is deferred until the platform-admin task.

## Core MVP workflow

1. Employee starts a Shift at an authorized Location.
2. Employee starts New Vehicle check-in.
3. Plate OCR/ANPR scans the plate when available; employee confirms/edits or uses manual fallback.
4. Customer phone/contact is captured when available and a secure WhatsApp/SMS link is sent; QR is fallback.
5. Employee records vehicle condition; photos follow configured policy and are optional by default.
6. Vehicle/ValetSession is created with server-authoritative timestamps.
7. Employee assigns/scans a QR key slot or uses permitted manual fallback.
8. Hybrid Dispatch creates/assigns the Parking task.
9. Employee starts Parking; task-scoped session tracking starts only if configured.
10. Employee assigns zone/spot, optionally by QR; manual fallback remains available.
11. Vehicle becomes PARKED and active parking tracking stops.
12. Guest requests the vehicle from the secure link.
13. Retrieval enters the queue and basic Hybrid Dispatch assigns/suggests an eligible employee; supervisor can reassign.
14. Key checkout/custody is recorded.
15. Employee starts Retrieval; configured task-scoped tracking begins.
16. Vehicle becomes READY; tracking stops and guest is notified.
17. Payment/validation is completed according to location policy where required.
18. Secure handoff uses Dynamic one-time QR or 4-digit pickup code; supervisor override is exceptional and audited.
19. Session becomes COMPLETED; receipt/rating flow may follow; Black Box/audit history remains available.

## Required sellable-MVP capabilities

- Multi-tenant Company/Location structure
- Base roles/permissions and location access
- Employee app / web terminal
- Guest web experience without mandatory account
- SMS and/or WhatsApp integration according to available first-market channel
- Plate OCR/ANPR + confirm/edit + manual fallback
- Vehicle condition check + configurable optional photos
- QR key slots
- Parking zones/spots + optional QR
- Maps + configurable Parking/Retrieval task-scoped session tracking
- Basic Hybrid Dispatch and supervisor reassignment
- Vehicle request / retrieval queue
- Secure handoff with Dynamic QR or 4-digit pickup code
- Basic digital payments plus cash, validation and tips
- Notifications
- Basic Black Box audit timeline
- Basic incident reporting
- Configuration-capable Management Dashboard
- Reports and CSV/PDF export
- Arabic/English with real RTL/LTR
- Offline-friendly employee actions / retry-safe foundations
- Basic subscription/admin controls

## Configuration First

Where the Blueprint defines normal operating policy as configurable, the product should support:

```text
Company default -> Location override
```

Examples include, when implemented:

- operating hours
- currency/timezone
- language defaults
- valet fee/payment methods/tips
- photo policy
- plate scan settings
- parking spot requirement
- tracking on/off
- optional geofence-alert enablement
- release policy
- per-notification-type enablement
- SLA target

DEC-083 explicitly rejects a generic Settings JSON/Rules Builder, a Key Policy
with only one valid mode, generic notification-template or validation-policy
engines, and a Location allowed-role policy. Existing typed validation
enablement and accepted financial commands remain unchanged.

## Management visit and commercial boundaries

- Management Customers is bounded visit management, not CRM. Search may use
  phone, plate or authorized-scope name, and vehicle relationships are described
  only as visit associations, never proven ownership.
- Rating is 1–5, guest-only, once per completed visit. Staff cannot alter it.
- “Returning Contact” means only that normalized contact appeared on a prior
  completed authorized-scope visit; it does not prove a person identity.
- Basic branding is display name and primary color with Company default ->
  Location override. Logo and advanced white-label remain deferred.
- Integrations and Billing are read-only MVP surfaces. Tenant provider-secret
  administration and SaaS billing execution are out of scope.
- Automatic report delivery is deferred; manual authenticated CSV/PDF is the
  current requirement.
- New Locations start inactive, require explicit currency/timezone and setup,
  and must stop intake and drain safely before deactivation. History is never
  deleted.

This scope requirement does not authorize one generic untyped settings JSON table. Typed configuration is introduced by focused implementation tasks.

## Payments and validation

Sellable MVP supports the product concepts:

- Customer Pays
- Venue Pays
- Full Validation
- Partial Validation
- tips
- cash reconciliation
- at least one digital payment gateway in the first market

Payment lifecycle remains separate from physical ValetSession state.

Employees cannot issue refunds; higher-authority refund actions require reason + audit.

## Maps / employee tracking rule

GPS/session tracking is configurable and tied by default to active Parking/Retrieval tasks.

Do not track employees continuously for the whole Shift by default.

The Guest never sees exact parking coordinates.

## Explicitly deferred beyond sellable MVP

Unless separately approved:

- AI damage detection/comparison
- autonomous make/model recognition
- NFC/BLE key tags
- VAYLET Qualified / Safety Score
- full ClaimShield evidence package workflow
- enhanced/high-security enterprise handoff policies beyond the MVP baseline
- POS/PMS integrations unless required by a pilot
- enterprise SSO
- persistent optional customer account / Valet Passport
- advanced fraud/risk engine
- predictive ETA/retrieval/demand systems
- SmartStack AI
- Curb Control Tower / Demand Autopilot
- Smart Key Vault/custom hardware
- ANPR entrance cameras
- indoor maps/digital twin
- advanced BI/data warehouse
- custom data residency/private integrations
- reservations
- consumer marketplace
- Anywhere Valet
- microservices/Kubernetes

## Pilot validation

Target 2–3 companies/locations willing to trial the product, with an initial pilot that may operate one real location for roughly 30 days.

Capture a pre-pilot baseline and compare at minimum:

- check-in time
- parking time
- retrieval wait
- handoff time
- SLA compliance
- cars per employee
- active queue
- key exceptions
- incidents/complaints per volume
- validation rate where used
- digital payment rate where used
- cash variance where used
- guest rating
- employee adoption/friction
- session loss/duplicate-event failures
- manager reliance on Dashboard
- willingness to convert/expand to paid locations

Success is operational proof, not UI admiration alone.
