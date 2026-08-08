# AI Agent Execution Plan

Status: Binding work sequence  
Version: 0.2

The agent must not attempt to build the whole product in one pass.

This plan is aligned to **VAYLET Founder & Product Blueprint v1.0** through `docs/15_BLUEPRINT_V1_REBASELINE.md`.

Each Phase is a milestone/dependency target, not one giant pull request. Break every Phase into focused Tasks/Issues/PRs with one clear objective and reviewable scope.

## Phase 0 — Bootstrap

Status: COMPLETE

Goal:
Create a healthy monorepo matching `09_TECH_STACK.md` and `10_REPOSITORY_STRUCTURE.md`.

Completed foundation includes:

- pnpm workspace + Turborepo
- strict TypeScript
- NestJS API scaffold
- Next.js employee/customer/dashboard apps
- shared packages
- lint/typecheck/test/build scripts
- local PostgreSQL with Docker Compose
- `.env.example`
- pinned lockfile

No business feature is added retroactively to Phase 0.

## Phase 1 — Foundation: data, tenants, staff and audit-ready structure

Goal:
Establish the persistent multi-tenant foundation required by the sellable product without implementing UI features.

Work is split into focused database/foundation tasks. Current early slices include tenant/staff structure before the remaining domain schema.

Required foundation capabilities over the Phase:

- Organization / Company
- Location with location-owned timezone/currency operational context
- User identity
- OrganizationMembership + location access
- base roles: `ORG_ADMIN`, `LOCATION_MANAGER`, `VALET_SUPERVISOR`, `VALET_EMPLOYEE`
- Shift
- customer/vehicle/session foundation
- parking/key foundation
- retrieval/handoff/payment/incident/notification/audit persistence as separately scoped tasks
- database-enforced tenant integrity
- critical unique/check/partial-index protections
- migration integrity tests
- demo/seed data when its dedicated task is reached

Rules:

- Do not add Venue Client or VAYLET Super Admin persistence without a dedicated accepted schema decision.
- Do not invent a generic Configuration First JSON policy table in the tenant/staff task.
- Configuration First is binding behavior, but typed configuration storage is introduced through focused feature tasks.
- One active migration owner at a time while the database foundation is high-contention.

## Phase 2 — Core custody domain + check-in

Goal:
Implement the canonical physical vehicle lifecycle foundation and a fast check-in path.

Canonical ValetSession physical states:

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

Required work across focused tasks:

- explicit domain commands and guards
- optimistic concurrency for contested mutations
- protected mutation + append-only Black Box/AuditEvent in one transaction
- customer/guest secure access-link foundation
- vehicle/session creation
- condition check
- configurable photo requirement, OPTIONAL by default
- plate capture contract with OCR/ANPR confirm/edit + permanent manual fallback
- implement the accepted DEC-020 no-plate/unreadable Vehicle identity fallback
- check-in performance instrumentation

Acceptance direction:
The normal low-friction check-in path should target roughly 15–20 seconds where policy does not require photos.

## Phase 3 — Operations: keys, parking and Hybrid Dispatch

Goal:
Make the valet operation executable after check-in.

Required work across focused tasks:

- QR-based Key Slots
- key assignment / checkout / return custody history
- controlled Parking Zones / Spots
- optional QR for Zone/Spot with manual fallback
- separate Task / Hybrid Dispatch lifecycle
- canonical task path:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

- reassignment with actor/reason audit where required
- availability/location/zone/current-load inputs for basic assignment
- no duplicate active work for the same intended operation

Do not put dispatch assignment states back into the physical ValetSession state machine.

## Phase 4 — Retrieval, guest progression and secure handoff

Goal:
Complete the customer-facing retrieval journey end-to-end.

Required work across focused tasks:

- phone-first guest link flow using SMS and/or WhatsApp according to approved provider/channel
- QR fallback
- no mandatory customer account/app install
- vehicle status and request action
- idempotent retrieval request
- retrieval queue + employee task
- notifications / ETA presentation where available
- READY flow
- Dynamic one-time QR OR 4-digit pickup code for standard handoff
- `HANDOFF_PENDING -> COMPLETED`
- supervisor override only with authorization + reason + audit
- duplicate request and early-cancellation rules

## Phase 5 — Maps, zones and task-scoped tracking

Goal:
Add the approved MVP maps/session-tracking capability without turning it into continuous employee surveillance.

Required work across focused tasks:

- map provider adapter/boundary
- location setup for entrances, pickup/drop-off, garages, zones/spots
- Parking/Retrieval task-scoped GPS/session tracking when configured
- start/stop behavior tied to task/session commands
- geofence behavior where enabled
- route/zone event persistence according to approved retention policy
- authorized Dashboard map views
- no exact vehicle coordinates in Guest experience

Default principle:
Tracking is OFF outside active Parking/Retrieval task sessions unless a later explicit policy decision changes it.

## Phase 6 — Payments, validation, cash and tips

Goal:
Support the sellable MVP financial models without storing raw card data.

Required work across focused tasks:

- location currency context
- Customer Pays
- Venue Pays
- Full Validation
- Partial Validation
- tips
- cash receipt / reconciliation
- at least one approved digital payment gateway for the first market
- provider adapter + signature verification + idempotent callbacks
- refund permissions/audit

Payment/validation/refund lifecycle remains separate from ValetSession physical state.

## Phase 7 — Dashboard, Configuration First and reporting

Goal:
Give managers/operators a usable control surface and remove normal location configuration dependency on developers.

Build incrementally from operational needs, including:

- Overview / Live Operations
- Vehicles
- Tasks
- Employees & Shifts
- Locations
- Maps & Zones
- Keys
- Payments / Validations
- Incidents
- Analytics / Reports
- Audit Log
- approved Policies / Location Settings
- Roles & Permissions
- Branding / White Label according to plan
- basic subscription/admin controls

Configuration inheritance when applicable:

```text
Company default -> Location override
```

Use typed configuration contracts; do not create a speculative catch-all policy blob.

Reports/export in sellable MVP include the approved operational/financial views and CSV/PDF where scoped.

## Phase 8 — Reliability, offline-friendly operation and production foundations

Goal:
Make the end-to-end product resilient enough for real shifts and pilot use.

Required work across focused tasks:

- offline-friendly employee action queue/sync
- stable client/device/request IDs
- idempotent retry behavior
- reconnect/duplicate prevention
- messaging/payment retry handling
- monitoring and central error logging without PII leakage
- backups + documented restore process
- security hardening
- rate limiting / anti-abuse on guest endpoints
- device/session revocation
- performance/load validation for peak queues

Do not redesign the domain for offline; use the idempotency/versioning foundations already required.

## Phase 9 — Pilot hardening and paid-customer readiness

Goal:
Operate a real location for a full shift and prove measurable value.

Focus:

- UX speed and employee friction
- end-to-end staging tests
- permission/tenant-isolation review
- security review
- edge cases and exception procedures
- operational support/monitoring
- pilot onboarding/configuration
- baseline KPI collection and 30-day comparison where applicable
- Arabic/English + RTL/LTR verification
- rollback/go-live readiness

Paid-customer-ready means the client can run check-in, parking, key custody, retrieval, secure handoff, incidents, payment/validation where enabled, reporting and normal configuration without daily developer intervention.

## Parallel UX/UI design track

UX/UI planning may run in parallel with backend/foundation work when it does not modify high-contention implementation contracts.

Recommended sequence:

```text
UX architecture / screen inventory
-> user flows
-> wireframes
-> design system
-> high-fidelity designs
-> interactive prototype
-> feature-by-feature frontend implementation with backend integration
```

Do not implement all UI screens against mocked assumptions before the corresponding product/domain contracts are stable.

## MVP / V2 / Enterprise gate

Before starting a task, confirm its capability boundary in `docs/15_BLUEPRINT_V1_REBASELINE.md`.

Examples explicitly beyond sellable MVP unless separately approved:

- NFC/BLE key tags
- VAYLET Qualified / Safety Score
- full ClaimShield
- POS/PMS integrations unless required by a pilot
- enterprise SSO
- persistent optional customer account
- Smart Key Vault
- ANPR entrance cameras
- indoor digital twin
- SmartStack AI / Predictive Retrieval / Demand Autopilot
- advanced BI/data warehouse
- custom data residency/private integrations

## Agent task sizing

Each Task/Issue/PR must have one focused objective.

Task size is determined by:

- dependency boundaries
- coupling
- security/domain risk
- testability
- reviewability
- high-contention files

Do not equate one Phase with one PR.

## Mandatory task gate

Before implementation:

- create/assign a scoped GitHub Issue
- confirm one human owner
- branch from current `main`
- identify SAFE / SHARED / CRITICAL files
- read `AGENTS.md` and affected binding docs
- identify domain/state/task transitions
- identify authorization/tenant/location/configuration impact
- resolve material ambiguity before coding
- define acceptance criteria and required tests

## Required checks before PR-ready

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database tasks additionally verify migration behavior on a fresh PostgreSQL database and required integrity tests.

## Collaboration gate

- never work directly on `main`
- one task / one human owner / one branch
- never run two AI agents in the same working tree concurrently
- coordinate SHARED/CRITICAL files before parallel edits
- keep one active migration owner while database foundations remain unstable
- use Pull Requests
- pass CI before merge
- cross-review whenever practical
- do not call work DONE until merged

See `docs/13_COLLABORATION_WORKFLOW.md`.
