# Domain Model

Status: Binding  
Version: 0.1

## Aggregate center

`ValetSession` represents one continuous custody period:

vehicle received -> parked -> requested -> retrieved -> securely released.

A later visit by the same vehicle creates a new ValetSession.

## High-level relationships

```text
Organization
  |
  +-- Location
  |    |
  |    +-- ParkingSpot
  |    +-- KeySlot
  |    +-- Shift
  |
  +-- OrganizationMembership
       |
       +-- User

Customer
  |
  +-- Vehicle
       |
       +-- ValetSession
            |
            +-- VehiclePhoto
            +-- RetrievalRequest
            +-- HandoffVerification
            +-- Payment
            +-- Incident
            +-- AuditEvent
```

## Organization

The business/operator tenant.

One Organization may manage many Locations.

Cross-organization access is prohibited.

## Location

A physical valet operation location.

Examples: hotel, restaurant, mall, hospital, event venue.

A Location belongs to one Organization in MVP.

## User

Authenticated staff identity.

Keep authentication identity separate from tenant membership.

## OrganizationMembership

Connects a User to an Organization.

Initial roles:

- `ORG_ADMIN`
- `LOCATION_MANAGER`
- `VALET_EMPLOYEE`

Location access can be restricted through membership-location assignment.

## Shift

A working session for staff at a Location.

Important operational events must still store the acting membership even if shift state is imperfect.

## Customer

Guest/contact associated with the active visit when known.

MVP minimizes customer data. Name is optional.

No customer account is required.

## Vehicle

Reusable vehicle identity within an organization.

Primary operational identity is normalized plate + plate country/region.

A Vehicle can have many ValetSessions.

## ValetSession

Central operational aggregate.

Stores current operational snapshot for fast queries:

- organization
- location
- vehicle
- customer
- current state
- parking spot
- key slot
- retrieval assignee
- operational timestamps

History is preserved by immutable AuditEvents.

## VehiclePhoto

Condition/evidence photo for a session.

Initial capture types:

- FRONT
- REAR
- LEFT
- RIGHT

Photo bytes live in private object storage.

## ParkingSpot

Controlled parking location/zone within a Location.

Do not model current parking location as arbitrary text.

## KeySlot

Controlled physical key location within a Location.

Current slot is available on the ValetSession; movements are preserved in audit history.

## RetrievalRequest

Customer/staff request to bring the vehicle.

Separate entity so requests can be measured and audited.

Only one active retrieval request per session in MVP.

## HandoffVerification

Secure authorization used before vehicle release.

Methods:

- OTP
- DYNAMIC_QR
- MANAGER_OVERRIDE

Initial MVP must support OTP.

## Payment

Separate financial lifecycle.

Possible statuses:

- NOT_REQUIRED
- UNPAID
- PENDING
- PAID
- FAILED
- REFUNDED

## Incident

Operational issue tied to a session.

Examples:

- DAMAGE
- KEY
- VEHICLE_LOCATION
- DELAY
- HANDOFF
- PAYMENT
- OTHER

Incident status must not be added to ValetSession state.

## AuditEvent

Append-only operational history.

Each event should support:

- actor
- organization
- location
- session
- timestamp
- event type
- entity type/id
- safe metadata
- idempotency/request context when applicable

## Modeling principles

1. Current state lives on the operational entity for fast reads.
2. Historical facts live in immutable events.
3. Audit events do not replace relational constraints.
4. Payment, incident, notification and session states stay separate.
5. Avoid premature event sourcing.
