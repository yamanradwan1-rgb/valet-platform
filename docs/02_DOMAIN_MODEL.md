# Domain Model

Status: Binding  
Version: 0.3

## Aggregate center

`ValetSession` represents one continuous physical custody period for a vehicle visit:

```text
CHECKING_IN
-> AWAITING_PARKING
-> PARKING
-> PARKED
-> REQUESTED
-> RETRIEVING
-> READY
-> HANDOFF_PENDING
-> COMPLETED
```

A later visit by the same vehicle creates a new ValetSession.

Task/Dispatch assignment lifecycle is related to the session but remains a separate operational lifecycle.

## High-level relationships

```text
Organization
  |
  +-- Location
  |    |
  |    +-- ParkingZone
  |    +-- ParkingSpot
  |    +-- KeySlot
  |    +-- Shift
  |    +-- operational configuration overrides
  |
  +-- OrganizationMembership
       |
       +-- User

Customer / Guest Contact (when known)
  |
  +-- Vehicle
       |
       +-- ValetSession
            |
            +-- ConditionNote
            +-- VehiclePhoto / Attachment
            +-- Task / DispatchEvent
            +-- KeyCustodyEvent
            +-- GPS/RouteEvent when tracking enabled
            +-- RetrievalRequest
            +-- HandoffVerification
            +-- Payment / Validation / Tip / Refund records as implemented
            +-- Incident
            +-- Notification
            +-- AuditEvent / Black Box timeline
```

The diagram is conceptual. A listed Blueprint entity is not authorization to invent its persistence fields before the relevant schema task is approved.

## Organization

The valet operator/business tenant.

One Organization may manage many Locations, including Locations in different countries.

Cross-organization access is prohibited.

Configuration may define Company-level defaults that Locations override.

## Location

A physical valet operation location.

Examples: hotel, restaurant, mall, hospital, airport, event venue.

A Location belongs to one Organization in MVP.

Location is the authoritative operational scope for settings such as timezone/currency and location-specific policies when implemented.

## User

Authenticated staff identity.

Keep authentication identity separate from tenant membership.

## OrganizationMembership

Connects a User to an Organization.

Current tenant membership roles:

- `ORG_ADMIN` — internal name for Blueprint Company Admin
- `LOCATION_MANAGER`
- `VALET_SUPERVISOR`
- `VALET_EMPLOYEE`

Location access can be restricted through membership-location assignment.

Guest/Customer is not an OrganizationMembership.

VAYLET Super Admin is platform-level, not a tenant membership role.

Venue Client is a Blueprint actor with restricted location visibility, but its exact identity/persistence model is not yet locked and must be defined by a dedicated schema decision.

## Shift

A working session for a staff membership at a Location.

The employee receives tasks only for authorized operational scope. Ending a shift while tasks remain open requires reassignment/handoff or an authorized override according to later task rules.

Important operational events must still store the acting membership even if shift state is imperfect.

## Customer / Guest Contact

Minimal guest/contact data associated with a visit when known.

MVP does not require a persistent customer account.

Primary guest access is through secure phone-based WhatsApp/SMS link, with QR fallback. A future optional account/Valet Passport is outside the initial MVP.

## Vehicle

Reusable vehicle identity within an Organization.

Operational identity supports multi-country plate formats and must not assume one country's plate layout.

Plate OCR/ANPR is assistive input; manual confirm/edit/fallback remains authoritative.

A Vehicle may be created while its plate is absent, unreadable or not yet confidently established. Plate country, raw plate and normalized plate are either all known or all absent. When they are absent, a non-empty employee-confirmed `temporary_descriptor` is required for operational recognition. The descriptor is not a unique identity; each unidentified Vehicle remains distinct through its own UUID.

Known plate identity is unique within the Organization by country plus normalized plate. Later identification or correction updates the same Vehicle through an explicit audited command when no tenant-scoped plate conflict exists. If the plate already belongs to another Vehicle in the Organization, automatic merge/relink is forbidden; the identities and custody histories remain separate pending a dedicated deduplication workflow.

No separate plate-status enum is required because the grouped plate fields unambiguously express known versus unknown identity.

A Vehicle can have many ValetSessions.

## ValetSession

Central physical custody aggregate.

Stores current operational snapshot for fast queries, such as:

- organization
- location
- vehicle
- guest/customer contact when known
- current physical custody state
- current parking zone/spot
- current key slot
- current operational task/assignee reference where useful
- server-authoritative timestamps

History is preserved by append-only AuditEvents/Black Box events.

Task assignment is not itself a physical ValetSession state.

## ConditionNote

Fast condition assessment captured during check-in.

The condition check is part of intake; photos follow configured policy and are optional by default.

Do not require photo evidence when the active policy does not require it.

## VehiclePhoto / Attachment

Private evidence attachment associated with a session/incident/condition record as applicable.

Photo policy is configurable. The system may support directional capture types, damage detail and other evidence categories without assuming that four photos are always mandatory.

Photo bytes live in private object storage.

## ParkingZone

Controlled logical parking area within a Location, such as Garage A, VIP, overflow or staging.

A Zone may contain ParkingSpots and may later carry map/geofence configuration.

## ParkingSpot

Controlled parking position within a Location/Zone.

A Spot or Zone may have a QR identifier. Manual selection remains a fallback where QR is not available.

Do not model current parking location as arbitrary unaudited text.

## KeySlot

Controlled physical key location within a Location.

MVP key system is QR-based.

One slot must not be assigned to two active vehicle sessions simultaneously.

## KeyCustodyEvent

Append-only custody fact recording key assignment/checkout/return/movement actor and timestamp.

Current key slot can be denormalized on the ValetSession for fast reads, while custody history remains immutable.

## Task

Operational work item used by Hybrid Dispatch.

Typical task types include Parking and Retrieval.

Canonical task lifecycle:

```text
QUEUED
-> ASSIGNED
-> ACCEPTED
-> IN_PROGRESS
-> COMPLETED
```

Alternative task outcomes may include:

- `REASSIGNED`
- `DECLINED`
- `CANCELLED`
- `INCIDENT`

Exact persistence and transition rules are defined in the focused Dispatch task, not invented in the database foundation.

## DispatchEvent

Append-only record of assignment/reassignment/acceptance/decline and actor/reason where applicable.

A supervisor reassignment after task acceptance must be auditable.

## GPS / Route Event

Optional operational tracking evidence for a Parking/Retrieval task when the Location policy enables session tracking.

Tracking is task-scoped by default, not continuous for the entire Shift.

Possible captured information includes start/end location, route history, duration/distance and zone/geofence events when configured.

The Guest never receives exact coordinates.

## RetrievalRequest

Customer/staff request to bring the vehicle.

Separate entity so requests can be measured, deduplicated and audited.

Only one active RetrievalRequest/active retrieval task per session should exist at a time.

## HandoffVerification

Secure authorization used before vehicle completion/release.

MVP methods:

- 4-digit pickup code
- Dynamic one-time QR
- authorized supervisor override with reason/audit

Either standard QR or pickup code may satisfy the normal handoff policy. Higher-security policies are later/enterprise configuration.

Reusable plaintext verification secrets must never be stored.

## Payment

Separate financial lifecycle.

MVP product concepts include:

- customer-paid fee
- venue-paid/complimentary
- full validation
- partial validation
- tip
- cash reconciliation
- digital gateway payment

Payment state remains outside ValetSession physical custody state, although location policy may require financial completion before handoff.

## Validation

Records venue/customer fee support according to location policy.

Possible product modes include full or partial validation. Exact persistence is introduced by the Payments/Validation schema task.

## Tip

Financial value separate from valet fee for reporting/distribution policy.

Exact distribution/payout behavior is a later focused implementation concern.

## Refund

Financial correction requiring higher-authority permission, amount, reason, timestamp and audit.

Valet Employee cannot issue refunds.

## Incident

Operational issue tied to a session/task/location.

Blueprint categories include vehicle damage, key problems, unauthorized zone exit, wrong vehicle handoff attempt, payment dispute, customer complaint, employee safety, system/connection issue and custom/other categories.

Incident lifecycle is separate from ValetSession physical state. Opening an incident may block later commands through policy/guards without rewriting custody history.

Full ClaimShield evidence-package handling is V2; basic incident reporting is MVP.

## Notification

Outbound communication record for guest/staff operational messages.

MVP channels may include SMS and/or WhatsApp according to first-market provider availability. Push belongs to users who later choose an account/app flow.

## AuditEvent / Black Box

Append-only operational history.

Each event should support as applicable:

- actor
- organization
- location
- session
- task
- timestamp
- event type
- entity type/id
- safe metadata
- idempotency/request/device context when applicable

Representative Blueprint events include vehicle creation, plate scan, customer link sent, condition recorded, photo added, key assigned, task assigned/reassigned, parking started, geofence events, vehicle parked, retrieval requested/started, key checkout, vehicle ready, payment/validation, handoff verified, vehicle released/completed, incident opened/evidence locked and override used.

Corrections append a new event. Original historical facts are not silently edited.

## Configuration model principle

Configuration First is binding product behavior.

Where a product policy varies normally by customer/location, preferred precedence is:

```text
Company default -> Location override
```

Exact typed configuration entities/tables are introduced by focused tasks. Do not create a speculative untyped policy blob simply to satisfy the concept early.

## Modeling principles

1. Current state lives on operational entities for fast reads.
2. Historical facts live in immutable events.
3. Audit events do not replace relational constraints.
4. Physical ValetSession state, Task/Dispatch state, Payment state, Incident state and Notification state remain separate lifecycles.
5. Tenant/location integrity is enforced in the database where practical and always authorized in application code.
6. Offline/retryable operations require stable identifiers/idempotency semantics.
7. Multi-country Location data must not inherit one-country assumptions from Organization.
8. Avoid premature event sourcing, generic configuration engines and speculative future schema.
