# MVP Product Scope

Status: Binding  
Version: 0.1

## Goal

Validate that one valet company at one real location can operate a busy shift digitally and reliably without depending on paper tickets.

The architecture must support multiple organizations and locations without requiring enterprise-scale infrastructure for the pilot.

## Personas

### Valet Employee

Must be able to:

- authenticate
- start/end a shift
- receive a vehicle
- enter plate data
- capture required condition photos
- assign parking location
- assign key location
- see retrieval queue
- accept/perform retrieval
- mark vehicle ready
- verify secure handoff
- record an incident

### Location Manager / Supervisor

Must be able to:

- see active vehicles
- see retrieval queue
- see employees on shift
- inspect complete vehicle/session timeline
- resolve operational exceptions
- review incidents
- inspect basic performance metrics

### Organization Admin

Must be able to:

- manage organization
- manage locations
- manage staff and roles
- view authorized reports

### Customer

Must be able to:

- receive an access link / QR / SMS
- view vehicle status
- request vehicle
- see retrieval progress
- complete handoff verification
- pay and receive receipt when payments are enabled

No customer account/password is required for MVP.

## Core MVP workflow

1. Employee receives vehicle.
2. Plate is entered.
3. Required vehicle photos are captured.
4. Digital customer access is created.
5. Parking spot/zone is assigned.
6. Key slot is assigned.
7. Vehicle is marked parked.
8. Customer requests vehicle.
9. Retrieval is assigned/accepted.
10. Employee retrieves vehicle.
11. Vehicle is marked ready.
12. Customer is verified by OTP or another approved method.
13. Vehicle is released.
14. Complete audit timeline remains available.

## Required modules

- Authentication
- Organizations
- Locations
- Staff / Memberships / Roles
- Shifts
- Customers
- Vehicles
- ValetSessions
- Vehicle Photos
- Parking Spots
- Key Slots
- Retrieval
- Secure Handoff
- Notifications abstraction
- Payments abstraction / optional pilot integration
- Incidents
- Audit
- Basic Reporting

## Payment rule

Payment is modeled from the start but may be disabled for the earliest operational pilot.

Payment state must remain independent from ValetSession operational state.

## Explicitly out of scope

Unless explicitly approved:

- automatic plate OCR
- AI damage detection/comparison
- vehicle recognition AI
- GPS tracking
- reservations
- consumer loyalty/Valet+
- marketplace
- Anywhere Valet
- smart key locker hardware
- advanced workforce scheduling
- dynamic pricing
- advanced data warehouse/BI
- microservices
- Kubernetes

## Pilot metrics

Capture at minimum:

- check-in duration
- retrieval duration
- number of vehicles handled
- currently parked count
- retrieval request count
- delayed retrievals
- operational errors
- incidents
- employee adoption/friction
- customer use of Bring My Car
- willingness of business to pay
