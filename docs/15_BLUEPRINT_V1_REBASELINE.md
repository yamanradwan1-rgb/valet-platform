# Blueprint v1.0 Product Rebaseline

Status: Binding rebaseline bridge  
Version: 1.0  
Date: 2026-08-08

## Purpose

This document records the implementation-relevant delta between the repository contracts that existed before 2026-08-08 and the approved **VAYLET Founder & Product Blueprint v1.0 (August 2026)**.

The Blueprint expands and changes parts of the sellable MVP. This bridge exists so contributors and AI agents can update the repository without relying on chat history or silently guessing how old terms map to the new product direction.

Where this document records an explicit reconciliation decision, that decision is also reflected in `08_DECISIONS_LOG.md` and the affected binding document.

## OLD vs NEW decision matrix

| Area | Previous repository contract | Blueprint v1.0 contract | Impact |
|---|---|---|---|
| Company model | B2B/B2B2C software product; operating model not as explicit | VAYLET is B2B SaaS software only in the base model; it does not employ valet drivers or take vehicle custody itself | EXPANDED |
| Primary ICP | Prove one valet company/location can run paperlessly | Primary customer is a valet operator managing roughly 5–50 locations; one-location pilot remains the validation method | CHANGED |
| Product surfaces | Employee app, customer web/QR/SMS experience, management dashboard | Same three core surfaces, with stronger configuration/admin and venue visibility requirements | EXPANDED |
| Guest account | No account/app required | Phone -> WhatsApp/SMS link is primary; QR fallback; optional account only for future/repeat-customer benefits | EXPANDED |
| Roles | `ORG_ADMIN`, `LOCATION_MANAGER`, `VALET_EMPLOYEE` | Guest/Customer, Valet Employee, Valet Supervisor, Location Manager, Company Admin, Venue Client, VAYLET Super Admin | CHANGED |
| Authorization | Tenant membership + location access + role | Least privilege, tenant isolation, location scope, audited sensitive actions; Company Admin and VAYLET Super Admin require MFA in production | EXPANDED |
| Vehicle lifecycle | `INTAKE -> PARKING -> PARKED -> RETRIEVAL_REQUESTED -> RETRIEVAL_ASSIGNED -> RETRIEVING -> READY -> RELEASED` | `CHECKING_IN -> AWAITING_PARKING -> PARKING -> PARKED -> REQUESTED -> RETRIEVING -> STAGED/READY -> HANDOFF_PENDING -> COMPLETED` plus incident/exception behavior | CHANGED |
| Retrieval assignment | Session state included `RETRIEVAL_ASSIGNED` | Assignment belongs to Hybrid Dispatch task lifecycle (`QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED`) | CHANGED |
| Plate entry | Manual-first; OCR deferred | OCR/ANPR scan + confirm/edit + manual fallback is in sellable MVP; OCR remains assistive, never mandatory | CHANGED |
| Condition photos | Four intake photos required unless exception | Condition check is required; photos are optional by default and configurable as required per policy | CHANGED |
| Key management | Key slot entity and custody audit | QR-based key slots are explicitly MVP; one active vehicle per slot; checkout/return actor/time recorded | EXPANDED |
| Parking | Controlled spot/zone | Zones/spots remain controlled; QR per spot/zone is optional; manual selection remains fallback | EXPANDED |
| Maps / GPS | GPS explicitly deferred | Maps + configurable session tracking are MVP; tracking only during active Parking/Retrieval tasks by default, not the whole shift | CHANGED |
| Dispatch | Retrieval assignment/concurrency only | Basic Hybrid Dispatch is MVP; system suggests/assigns and supervisor can reassign; task lifecycle is explicit | NEW |
| Secure handoff | OTP required initially; dynamic QR and manager override modeled | Default is Dynamic one-time QR OR 4-digit pickup code; either is sufficient; supervisor override must be audited | CHANGED |
| Payments | Modeled; pilot integration could be disabled | Sellable MVP supports customer pays, venue pays, full/partial validation, tips, cash reconciliation, and at least one digital gateway in first market | EXPANDED |
| Configuration | Avoid generic settings/policy engine in Phase 1 | Configuration First is a product principle; normal customer-specific operations are changed from Dashboard, with Company defaults and Location overrides | CHANGED |
| Dashboard | Operational views and basic metrics | Adds live operations, tasks, employees/shifts, maps/zones, keys, payments, validations, incidents/claims, analytics/reports, policies, roles, integrations, branding, billing/subscription, audit log | EXPANDED |
| Incidents | Basic Incident entity independent from session state | Basic incident reporting remains MVP; evidence/timeline handling is stronger; full ClaimShield is V2 | EXPANDED |
| Black Box / audit | Append-only AuditEvent chain of custody | Basic Black Box timeline is MVP; corrections append new events instead of replacing original facts | EXPANDED |
| Offline | Future Phase 9, architecture prepared for it | Offline-friendly employee actions are part of sellable MVP/reliability; retry/idempotency foundations remain mandatory | CHANGED |
| Internationalization | Regional intent; bilingual later implied | Arabic + English from the start, real RTL/LTR, location currency/timezone, E.164 phones, multi-country plates, locale-aware formats | EXPANDED |
| White label | Later/limited | White label is a configurable commercial capability; advanced white label remains V2 | EXPANDED |
| AI | Advanced AI deferred | Same principle: build operating system first; prediction/optimization only after clean measured data. OCR is not treated as autonomous AI product logic | UNCHANGED |
| V2 | AI/damage/reservations broadly deferred | V2 explicitly includes NFC/BLE keys, Qualified, Safety Score, full ClaimShield, enhanced security, POS/PMS, SSO, advanced analytics, optional customer account, vehicle rules, compliance, advanced white label, fraud rules, predictive ETA | EXPANDED |
| Enterprise/V3 | Broad future features | Smart Key Vault, ANPR entrance cameras, indoor maps/digital twin, predictive/optimization systems, advanced BI/data residency | EXPANDED |
| Pilot | One restaurant/valet company, 100–200 cars/night target | 2–3 companies/locations willing to pilot; first pilot may run one location for 30 days with baseline/KPI comparison | EXPANDED |

## Reconciliation decisions for repository implementation

### 1. Role mapping for the current tenant/staff foundation

For the current `OrganizationMembership` model:

- `ORG_ADMIN` is the internal enum name for the Blueprint's **Company Admin** role.
- `LOCATION_MANAGER` remains a tenant membership role.
- `VALET_SUPERVISOR` is added as a tenant membership role.
- `VALET_EMPLOYEE` remains a tenant membership role.

The Blueprint defines **Venue Client** as a restricted actor for a venue's performance/validation/SLA/incidents, but does not specify enough persistence fields to lock its Phase 1 schema here. Its identity/membership representation is therefore **deferred to a dedicated accepted schema task**.

**VAYLET Super Admin** is platform-level, not an `OrganizationMembership` role. Its production access must be strongly audited and MFA-protected. Exact platform-admin persistence is deferred until platform administration is implemented.

Guest/Customer does not use `OrganizationMembership`.

### 2. Session state vs dispatch task state

The Blueprint separates physical vehicle custody from dispatch assignment. Therefore:

- `RETRIEVAL_ASSIGNED` is removed from the canonical ValetSession lifecycle.
- assignment/acceptance/reassignment belongs to a Task/Dispatch lifecycle.
- the ValetSession records the current physical custody state and may reference current task/assignee for fast reads without making task assignment a physical custody state.

### 3. Canonical MVP session lifecycle

Use the following canonical session states for future state-machine implementation:

```text
CHECKING_IN
AWAITING_PARKING
PARKING
PARKED
REQUESTED
RETRIEVING
READY
HANDOFF_PENDING
COMPLETED
```

`READY` is the canonical MVP state name for the Blueprint's `STAGED/READY` position. A staging zone/spot can be represented operationally without introducing a second session state until a concrete workflow requires it.

`INCIDENT` remains a separate incident lifecycle/event rather than a normal ValetSession state. Opening an incident can pause/block commands through guards/policies without replacing the physical custody state.

Early request cancellation and other exceptions are explicit corrective commands; they do not justify arbitrary state mutation.

### 4. Location international settings

The Blueprint explicitly requires currency and timezone per Location and allows one Company to own Locations in different countries. Therefore future database work must treat Location timezone/currency as authoritative for operational display/reporting/payment context.

A Company-level default may exist for configuration inheritance, but it must not prevent a Location override.

### 5. Configuration First without speculative schema

Configuration First is binding product behavior, but this rebaseline does not invent a generic JSON settings table or a premature policy engine.

Implementation must introduce typed configuration contracts/tables when the corresponding approved feature is built. Required precedence is:

```text
Company default -> Location override
```

where the Blueprint defines a configurable operating policy.

### 6. OCR and GPS are assistive/configurable MVP capabilities

OCR/ANPR must always have confirm/edit and manual fallback. It cannot block check-in when unreadable.

GPS/session tracking is opt-in/configurable per policy and limited by default to active Parking/Retrieval sessions. It is not continuous employee surveillance.

## Blueprint MVP capability boundary

The sellable MVP includes:

- multi-tenant Company/Location structure
- base roles/permissions
- employee app/web terminal
- guest web link without mandatory account
- SMS and/or WhatsApp integration according to available channel
- plate OCR/ANPR + confirm/edit + manual fallback
- vehicle condition check + configurable optional photos
- QR key slots
- zones/spots with optional QR
- maps + configurable task-scoped session tracking
- basic Hybrid Dispatch
- vehicle request and queue
- secure handoff with Dynamic QR or 4-digit pickup code
- basic payments + cash + validation + tips
- notifications
- basic Black Box audit timeline
- basic incident reporting
- configurable dashboard
- reports + CSV/PDF export
- Arabic/English and RTL/LTR
- offline-friendly employee actions
- basic subscription/admin controls

## Explicitly deferred beyond sellable MVP

Examples from Blueprint v1.0:

- custom valet hardware
- NFC/BLE key tags (V2)
- VAYLET Qualified / Safety Score (V2)
- full ClaimShield (V2)
- POS/PMS integrations unless required by a pilot (V2)
- enterprise SSO (V2/Enterprise)
- optional persistent customer account (V2)
- advanced fraud/predictive systems
- Smart Key Vault
- ANPR entrance cameras
- indoor digital twin
- SmartStack AI / Predictive Retrieval / Demand Autopilot
- advanced data warehouse/BI
- custom data residency/private integrations

## Unresolved details — do not guess

Blueprint v1.0 intentionally does not fully specify:

- exact schema for Venue Client identities/access
- exact schema for VAYLET Super Admin identities/access
- exact typed storage model for Configuration First policies
- exact OCR/ANPR provider
- exact map provider
- exact first-market payment provider
- whether WhatsApp or SMS is the first primary deployed messaging channel
- legal retention periods per country/customer
- exact data residency requirements
- exact fallback procedure for server-required OTP/payment operations during outages

These require later scoped decisions/tasks. Contributors must not invent them inside unrelated implementation work.

## VAL-002B impact

The pre-rebaseline `VAL-002B` implementation remains largely reusable. After this rebaseline merges, review the preserved work specifically for:

- add `VALET_SUPERVISOR` to the membership role contract
- ensure Company Admin naming maps cleanly to internal `ORG_ADMIN`
- move/confirm operational timezone semantics at Location level according to the updated database contract
- add Location currency if the updated Phase 1 contract requires it
- do not add Venue Client or VAYLET Super Admin persistence without a dedicated schema decision
- preserve existing tenant-integrity, restrictive-delete, shift, UUID, timestamp and database-constraint work unless the updated contract says otherwise

Do not discard the preserved implementation merely because the product contract expanded.