# AI Agent Execution Plan

Status: Binding work sequence  
Version: 0.5

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

Status: COMPLETE

Goal:
Establish the persistent multi-tenant foundation required by the sellable product without implementing UI features.

Completed foundation capabilities include:

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
- deterministic demo/seed data

The accepted DEC-021 financial persistence foundation was implemented in Phase 1 before Phase 6 application/provider workflows, through this dependency order:

1. Payment + Validation + tip foundation
2. CashEntry + provider-event/idempotency foundation
3. Refund foundation

Financial Phase 1 persistence does not authorize provider SDK/webhook integration or user-facing payment/refund workflows early; those remain Phase 6 work.

## Phase 2 — Core custody domain + check-in

Status: IN PROGRESS

Goal:
Implement the canonical physical vehicle lifecycle foundation and a fast check-in path ending in a safely completed `CHECKING_IN -> AWAITING_PARKING` transition.

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

Required capability across focused tasks:

- explicit domain commands and guards
- optimistic concurrency for contested mutations
- protected mutation + append-only Black Box/AuditEvent in one transaction
- customer/guest secure access-link foundation
- vehicle/session creation
- condition check
- configurable photo requirement, OPTIONAL by default
- plate capture contract with OCR/ANPR confirm/edit + permanent manual fallback
- accepted DEC-020 no-plate/unreadable Vehicle identity fallback
- check-in performance instrumentation

### Locked first command

VAL-004A locks the binding `complete-check-in` contract in `04_VALET_SESSION_STATE_MACHINE.md` before implementation.

The command performs only:

```text
CHECKING_IN -> AWAITING_PARKING
```

It requires authorized active staff, same-Organization scope, explicit Location access, ordinary `VALET_EMPLOYEE`/`VALET_SUPERVISOR` operational permission, expected ValetSession `version`, the accepted Vehicle identity path, required condition completion, typed photo-policy compliance when implemented, and atomic AuditEvent creation.

An active Shift is not a hard authorization prerequisite. Parking/key/Task/Dispatch effects are not part of `complete-check-in`.

State+version concurrency prevents duplicate transition/audit mutation, but it does not promise transparent replay of the original successful response. Durable client/device operation identity is added only if the focused offline/retry task demonstrates that need.

### Phase 2 focused task sequence

Use this dependency-oriented sequence; each remains a separate Issue/PR and may be split further only when reviewability requires it:

1. **VAL-004A — Lock Complete Check-In Command Contract**  
   Binding docs only: authorization, state/version concurrency, intake guards, audit atomicity, retry boundary, missing dependencies.

2. **VAL-004B — Custody Command / Authorization / Concurrency Foundation**  
   Reusable backend command pattern for actor/tenant/location authorization, optimistic ValetSession version mutation, transaction ownership, stable errors and required AuditEvent atomicity. This task must also resolve the dedicated Phase 2 runtime DB-role / append-only enforcement dependency before production commands rely on migration-owner privileges.

3. **VAL-004C — Check-In Intake Persistence**  
   Focused persistence needed by the locked command, including the accepted ConditionNote/VehiclePhoto intake evidence boundary and typed photo-policy persistence where the approved contract requires new schema. One migration owner only if persistence changes are needed.

4. **VAL-004D — Vehicle Identity / Plate Capture Command**  
   Confirmed plate input, OCR/ANPR assistive boundary, manual fallback, DEC-020 no-plate temporary descriptor path, tenant-scoped conflict handling and audited correction semantics without automatic merge.

5. **VAL-004E — Customer / Vehicle / ValetSession Creation**  
   Explicit intake creation command(s), tenant/location ownership, checked-in actor, secure retry semantics, active-session protections, server timestamps and initial `CHECKING_IN` state.

6. **VAL-004F — Guest Secure Access Foundation**  
   Cryptographically strong guest-access issuance and authorization over the existing hashed session fields, expiry/revocation, guest-safe scope and no raw bearer token in persistence/log/audit.

7. **VAL-004G — Condition Check + Photo Policy Commands**  
   Condition completion semantics, optional-by-default photos, typed Company-default -> Location-override required-photo evaluation, private attachment ownership and completion guards.

8. **VAL-004H — Complete Check-In Command Implementation**  
   Implement the accepted VAL-004A contract end-to-end: authorized `CHECKING_IN -> AWAITING_PARKING`, expected version, server completion timestamp, one version increment, one `VALET_SESSION_CHECK_IN_COMPLETED` AuditEvent, same-transaction rollback, no parking/key/dispatch side effects.

9. **VAL-004I — Check-In API / Integration / Performance Gate**  
   API/use-case wiring, shared request/response contract, command-error mapping, tenant/location/concurrency/retry integration coverage and performance instrumentation for the normal check-in path. Implemented locally on its focused branch; merge/review status remains external repository state.

Do not combine the nine slices into one PR. If an earlier task proves a later slice unnecessary, update this plan in a focused docs decision rather than implementing empty/speculative layers.

### Phase 2 implementation dependencies that must remain explicit

Before production `complete-check-in` claims the full Blueprint semantics, the repository must have:

- real ConditionNote completion persistence/logic
- authorized private VehiclePhoto/attachment persistence
- typed configurable photo requirement with Company default -> Location override
- secure guest access issuance/authorization behavior
- dedicated least-privilege application runtime DB credentials
- explicit append-only AuditEvent privilege/enforcement boundary for the runtime role
- durable command-operation identity only if transparent offline duplicate replay is required

Do not fake these dependencies inside the command with an untyped policy blob, migration-owner runtime access, or claims that `version` alone is full idempotency.

Acceptance direction:
The normal low-friction check-in path should target roughly 15–20 seconds where policy does not require photos.

The VAL-004I integration gate proves that a real authorized staff flow can establish a valid intake and safely reach `AWAITING_PARKING` with tenant/location isolation, concurrency protection, audit integrity and the required check-in instrumentation. Phase 2 must not be declared globally complete until the separate final Phase 2 security/integrity review gate is also completed.

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
Turn the Phase 1 provider-neutral financial persistence foundation into the sellable MVP payment/validation/cash/refund workflows without storing raw card data.

Phase 6 consumes the financial database structures already established in Phase 1. It does not own the three foundational migration slices.

Required work across focused tasks:

- financial-policy evaluation and explicit domain commands over the accepted DEC-021 aggregate
- Validation application/supersession commands and zero/positive due transitions
- guarded authorized pre-collection financial correction according to the accepted contract
- cash collection/correction commands and reconciliation behavior
- refund authorization, refundable-balance locking and refund commands
- currency-aware amount precision validation/quantization before persistence/provider conversion
- at least one approved digital payment gateway for the first market
- provider adapter + signature verification + idempotent callbacks
- stable outbound provider-operation idempotency for the selected gateway
- explicit stale/superseded provider-reference callback handling
- protected financial mutation + required AuditEvent atomicity
- user-facing payment/validation/receipt/refund workflows where scoped

Payment/validation/refund lifecycle remains separate from ValetSession physical state.

Provider selection/SDK/webhook implementation follows the provider-neutral Phase 1 persistence foundation. A general PaymentAttempt entity is not added unless the selected provider demonstrates a concrete requirement that the accepted aggregate/event model cannot safely satisfy.

Shift cash close/reopen, drawer management, venue settlement, POS/PMS, tax, ledger/accounting, payroll/tip distribution and chargeback handling are not part of the sellable-MVP financial foundation unless a later accepted requirement explicitly adds them.

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
