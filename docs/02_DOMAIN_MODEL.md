# Domain Model

Status: Binding  
Version: 0.5

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
            +-- Payment
                 +-- Validation history
                 +-- CashEntry history when cash is used
                 +-- PaymentProviderEvent deduplication when digital payment is used
                 +-- Refund history
            +-- Incident
            +-- Notification
            +-- GuestRating
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

Management-created Locations begin inactive. Activation requires explicit
currency/timezone readiness. MGT-BE-07 represents the lifecycle with the
existing `ACTIVE | INACTIVE` status plus `accepting_intake`: `INACTIVE/false`
is setup or inactive, `ACTIVE/true` accepts normal Check-In intake, and
`ACTIVE/false` is the drain state. `INACTIVE/true` is invalid.

BE-07 readiness is exactly two checks: supported Location currency and valid
IANA timezone. It does not infer a larger setup checklist. Closure first stops
new Check-In intake, then drains existing operational work, and only then
deactivates. Safe drain means no non-`COMPLETED` ValetSession, no `ACTIVE` Shift,
and no Task in `QUEUED`, `ASSIGNED`, `ACCEPTED`, or `IN_PROGRESS`. Historical
Location data is never deleted and deactivation never fabricates completion of
operational or financial history.

Currency and timezone correction use the same inactive, intake-closed, drained
safe boundary. Currency correction is prospective and must keep the effective
service fee representable in the new currency. Timezone correction is an
exceptional reasoned/audited correction; historical timestamps and prior report
facts remain unchanged.

## User

Authenticated staff identity.

Keep authentication identity separate from tenant membership.

MGT-BE-02 adds User-owned TOTP factor state without making MFA a tenant
membership fact. `UserMfaTotpFactor` is a server-owned authenticator factor with
`PENDING`, `ACTIVE`, or terminal `RETIRED` state. A User has at most one live
(`PENDING` or `ACTIVE`) factor at a time. The factor stores only an AES-256-GCM
protected TOTP secret plus replay/recovery-set state; the raw TOTP secret is
disclosed only during the enrollment ceremony.

Each activated factor owns exactly ten one-time `MfaRecoveryCode` entries for
its current recovery-code generation. Recovery rows store a random selector and
an HMAC verifier, never the reusable raw recovery code. Consumption is
single-use and retained as security history.

MFA assurance belongs to the exact existing `StaffAuthSession`, not to the User
globally and not to `OrganizationMembership`. The session records the factor
that authenticated it plus server-authored authentication/activity timestamps.
If that exact factor is retired or replaced, old assurance is no longer valid.

## OrganizationMembership

Connects a User to an Organization.

Current tenant membership roles:

- `ORG_ADMIN` — internal name for Blueprint Company Admin
- `LOCATION_MANAGER`
- `VALET_SUPERVISOR`
- `VALET_EMPLOYEE`

MGT-BE-04 adds one shared positive monotonic `version` to
`OrganizationMembership`. Role, status and Location-grant lifecycle commands
all use that same version for optimistic concurrency. Desired-state retries are
idempotent: if the requested role/status/grant state is already true, the
command returns the current state without another version increment or audit
event. A stale request for a different state conflicts. The database command
boundary also treats nullable expected versions and nullable grant/revoke mode
as invalid/fail-closed input.

Location access can be restricted through membership-location assignment.
Those grants are authority only when the current role/status and operational
authorization path consume them. In particular, an `ORG_ADMIN` demotion with
persisted Location grants is blocked until those dormant grants are explicitly
reconciled, preventing a role transition from silently activating old grants.

Normal access reduction must preserve truthful operational responsibility.
Before deactivation, leaving an operational role, or revoking a Location grant,
the current implementation checks the affected scope for:

- an `ACTIVE` Shift;
- a Task assigned to the membership in `ASSIGNED`, `ACCEPTED`, or
  `IN_PROGRESS`;
- intake ownership while a ValetSession is still `CHECKING_IN`, or while it is
  `AWAITING_PARKING` without an active Parking Task that represents handoff;
- an unexpired `RESERVED` `IncidentRecoveryIntent` reported by the membership.

The Staff directory reads the bounded tenant membership page first and only then
hydrates identity and Location-access counts. The persistence support added by
migration 37 is intentionally narrow: one Organization membership page index,
one intake-responsibility lookup index, and one reserved-incident lookup index
for these concrete access/lifecycle paths.

Key custody does not create a separate mutable staff-responsibility field for
this lifecycle check. During normal parking/retrieval work the active Task is
the canonical current assignee, while `KeyCustodyEvent` is append-only custody
history. Security/emergency disable therefore never fabricates key movement or
completion events.

The last usable Company Admin cannot be normally demoted or deactivated. A
usable admin is an active `ORG_ADMIN` membership in an active Organization,
owned by an active User that has an `ACTIVE` TOTP factor. This definition does
not require a currently live Staff session, current five-minute step-up, or
recent admin activity. Staff-management mutations serialize per Organization
with the shared `staff-management-org` transaction advisory boundary before
rechecking this invariant.

Membership `INACTIVE` is tenant-scoped: it disables that
`OrganizationMembership` only. User `DISABLED` is a separate global account
security state that applies across every Organization membership. Controlled
global disable revokes the User's Staff sessions and disables active Staff push
registrations while leaving membership and operational records unchanged.

Guest/Customer is not an OrganizationMembership.

VAYLET Super Admin is platform-level, not a tenant membership role.

Venue Client is a Blueprint actor with restricted location visibility, but its exact identity/persistence model is not yet locked and must be defined by a dedicated schema decision.

## Management context

MGT-BE-03 adds no new persisted Management aggregate. Company Admin context is a
server-derived projection over the authenticated User, exact `StaffAuthSession`,
current `OrganizationMembership`, Organization and optional Location.

An MFA-assured active `ORG_ADMIN` may select one active Organization for which
the User currently has an active Company Admin membership. Within that
Organization, Management context uses one of two explicit scopes:

- `LOCATION`, with one Organization-owned selected Location; or
- `ALL_LOCATIONS`, with no selected Location.

Organization and Location selection lists are bounded, keyset-paginated
projections. Location selection may describe an inactive Location for
Management context; each downstream capability decides whether its target must
currently be active.

The context also returns a typed Company Admin capability catalog. That catalog
is a snapshot for client composition, not authorization state and not a generic
permission system. Every protected downstream use revalidates current persisted
User/session assurance, membership role/status, Organization, target ownership
and capability-specific conditions. The catalog contains Management/read
eligibility only; it does not confer operational field commands.

The explicit `ALL_LOCATIONS` scope is foundation for later company-wide
Management work. MGT-BE-03 does not add All Locations analytics or company
report aggregation. Existing Location Manager authority remains governed by its
persisted Location grants. Company Admin may use the authorized current live-map
read, while retained raw route history remains outside this Management context.

## Shift

A working session for a staff membership at a Location.

The employee receives tasks only for authorized operational scope. Ending a shift while tasks remain open requires reassignment/handoff or an authorized override according to later task rules.

Important operational events must still store the acting membership even if shift state is imperfect.

## Customer / Guest Contact

Minimal guest/contact data associated with a visit when known.

MVP does not require a persistent customer account.

Primary guest access is through secure phone-based WhatsApp/SMS link, with QR fallback. A future optional account/Valet Passport is outside the initial MVP.

Management treats Customer as a visit contact, not a CRM profile or proven
identity. Phone, plate and name search stays inside authorized visit scope.
Vehicles may be described as associated through visits but not as owned.

`Returning Contact` is a derived authorized-scope fact that the same normalized
contact value appeared on a prior physically completed visit. For a reference
ValetSession, prior means strictly earlier by persisted `(created_at, id)`; the
reference visit, future visits, incomplete visits, matching plate alone, and
visits outside the viewer's current authorized Location scope do not count. The
calculation may cross separate Customer rows sharing the same normalized phone
without merging them. It does not prove that the same human returned.

MGT-BE-08 represents Visit Contacts only through existing Customer, Vehicle and
ValetSession identifiers. Search returns explicit `NONE | UNIQUE | AMBIGUOUS`
state and at most five vehicles observed on authorized visits for a Customer.
Company Admin receives the full normalized contact projection; Location Manager
receives only the last four digits and only visit-derived facts from currently
granted Locations. Customerless Vehicle visits remain valid Vehicle/history
results and no synthetic VisitContact identifier is persisted. Phone/name
search pages share one first-page database snapshot for Customer candidates and
authorized visit-derived counts/latest/vehicle facts; current persisted grants
are nevertheless reauthorized on every page.

The only MGT-BE-08 factual mutations are Company Admin corrections of
`Customer.display_name` and `Customer.phone_normalized`. They use
`Customer.updated_at` compare-and-set, do not relink historical ValetSessions,
do not merge duplicate Customers, and do not establish Customer ownership of a
Vehicle. Current accepted authority does not grant Location Manager an
Organization-level Customer/Vehicle mutation or grant Management a plate
correction command, so those mutations are absent.

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

Typed policy uses Company default -> nullable Location override. Company
tracking defaults OFF and Company raw-GPS retention defaults to 30 days.

`LocationMapPoint` represents an active/inactive Entrance, Pickup or Drop-off.
`LocationMapArea` represents an active/inactive Parking, Overflow, Staging or
Restricted polygon through ordered `LocationMapAreaVertex` rows. A map area may
reference an existing ParkingZone for map/geofence context, but never replaces
ParkingZone/ParkingSpot as parking assignment authority.

`TaskTrackingSession` is the current/ended movement-tracking projection anchored
to the exact canonical Task and ValetSession. It has no assignee lifecycle;
`Task.current_assignee_membership_id` remains authoritative. At most one active
tracker exists per Task and per physical ValetSession.

`RawGpsSample` stores privacy-sensitive append-oriented route observations with
client capture time, database receive time and a per-tracking-session durable
client sample UUID. `GeofenceEvent` stores non-raw ENTERED, EXITED or VIOLATION
summary history. A violation is alert/history only and does not mutate physical,
Task, Dispatch, assignment, release or handoff state.

Raw samples follow the effective finite retention policy and are not permanent
Black Box history. Cleanup execution belongs to VAL-007F and is not part of the
persistence foundation.

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

DEC-042 locks Standard handoff policy as typed `PICKUP_CODE | DYNAMIC_QR |
EITHER` configuration with Company default `EITHER` and nullable Location
override. Staff explicitly initiates `READY -> HANDOFF_PENDING`; a guest bearer
issues/displays one-time material and the current Retrieval Task owner verifies
it. Supervisor override is valid only after initiation and only for an actively
shifted same-Location `VALET_SUPERVISOR`. Verification does not release the
vehicle. Final release must re-evaluate current policy and require a still-valid,
unconsumed, unexpired allowed Standard verification or valid unconsumed
supervisor override.

## Payment

The current financial aggregate for one ValetSession. At most one Payment exists per session. It is created when the session's financial policy is evaluated; absence is not equivalent to `NOT_REQUIRED`.

Payment records the immutable currency snapshot, base service charge, customer tip, service responsibility, collection method, amount due to be collected directly from the customer, amount actually collected and the current payment lifecycle status.

One Payment has one collection method. Split tender, installments and multiple successful collections are not part of the accepted MVP contract.

Service responsibility is explicit:

- `CUSTOMER` means the customer is responsible for the base service charge after effective validation.
- `VENUE` means the venue is financially responsible for the base service charge. It does not create or imply a Venue Client identity, receivable or settlement account.

Service responsibility is normally immutable. A narrowly guarded pre-collection correction may change `CUSTOMER <-> VENUE` only while `amount_paid = 0`, no CashEntry exists, no Validation history exists, and no provider transaction/reference has started. The correction must be explicitly authorized, recompute financial projections, and commit the required AuditEvent atomically. Once any of those guards cease to hold, `service_payer` is immutable.

Tip is a non-negative customer-paid value on Payment for both cash and digital flows. It is not an employee distribution/payroll record.

Before collection starts, an authorized financial correction may change service amount, tip or current Validation and recompute `amount_due`. If recomputation crosses the zero boundary, collection method and status must change in the same transaction: zero due uses `NONE/NOT_REQUIRED`; positive due requires selecting `CASH` or `DIGITAL` and becomes `UNPAID` with the matching provider-field rules.

Payment is a current financial projection, while corrections and externally delivered facts are preserved by Validation, CashEntry, PaymentProviderEvent, Refund and required AuditEvent records. Once collection has occurred, monetary terms are not silently rewritten.

Payment state remains outside ValetSession physical custody state, although Location policy may require financial completion before handoff.

## Validation

First-class history of venue support applied to the Payment's base service charge.

Validation belongs to Payment and therefore to the same Organization, ValetSession and Location. Controlled modes are:

- `NONE` with amount `0`, used only as an explicit superseding correction that removes an earlier validation
- `FULL` with an amount equal to the Payment service amount
- `PARTIAL` with an amount greater than `0` and less than the Payment service amount

No initial validation is represented by no current Validation row. Multiple historical Validation rows may exist, but at most one is current. A correction retires the current marker and appends a superseding row atomically; it does not rewrite the earlier mode or amount.

Validation applies only when service responsibility is `CUSTOMER`. A guarded payer correction is therefore allowed only before any Validation history exists; after Validation history exists, payer cannot change to `VENUE`.

The database can enforce mode/amount shape, one current row, same-tenant relationships and non-deletion. Equality/ordering against the Payment service amount is enforced by transactional domain logic because it crosses rows.

## Tip

`tip_amount` is stored on Payment rather than in a separate Tip entity.

It is the voluntary amount paid by the customer in addition to any customer-responsible service amount. It is included in `amount_due` and may be collected by cash or digital payment. Keeping it as one Payment field is sufficient because MVP has no tip allocation, payroll, commission or multi-recipient distribution lifecycle.

After payment collection, a returned tip is represented through Refund rather than by reducing historical `tip_amount`.

## CashEntry

Append-only cash receipt and correction fact for a cash Payment.

The single initial receipt records a positive amount equal to the current amount due, collecting membership, server-authoritative occurrence time and a stable submission idempotency key. A correction appends a positive increase/decrease entry with actor and non-empty reason; it never edits or deletes an earlier entry. CashEntry corrections fix recorded cash facts; actual money returned to a customer is represented by Refund.

Payment keeps the current `amount_paid` projection, which must equal the transactionally applied net CashEntry total. Shift close/reopen, drawer ownership and enterprise settlement are not part of this foundation contract; later reporting may reconcile cash by aggregating these entries.

## PaymentProviderEvent

Minimal provider-neutral committed callback outcome used only for digital payment/refund callback retry safety. It is not a durable asynchronous inbox and does not by itself define safe outbound provider-operation retries.

After signature verification and adapter normalization, ProviderEvent insert, Payment/Refund mutation and required AuditEvent commit atomically. Durable outcomes are only `PROCESSED` and `IGNORED`. Failure before commit rolls back everything and leaves no event row; duplicate delivery after commit reuses the unique Organization/provider/event record and does not repeat mutation or AuditEvent.

The selected-provider Phase 6 design must define stable outbound-operation idempotency and how callbacks for stale/superseded provider references are handled. Payment creation idempotency is not treated as proof of later provider-initiation retry safety. No PaymentAttempt is added unless the selected provider demonstrates a concrete need.

Raw callback payloads, card data, payment tokens and provider credentials are not part of this entity.

## Refund

Separate append-only financial correction against a Payment.

Refund records a positive amount, non-empty reason, authorizing membership, request time, status, completion time when successful, stable idempotency key and an optional digital-provider reference. Cash refunds complete synchronously; digital refunds may be pending before provider confirmation.

Row-state semantics are explicit: digital `PENDING` and `FAILED` require a provider and keep `completed_at` null; every `SUCCEEDED` refund requires `completed_at`; cash success has null provider/reference; digital success requires both provider and provider reference; any non-null provider reference requires provider.

Multiple partial refunds and a final full refund are allowed. Full versus partial is derived from the remaining refundable balance rather than persisted as another status. Transactional application logic must lock the Payment and ensure the sum of pending/successful refunds never exceeds `amount_paid`; a simple row CHECK cannot safely enforce that aggregate.

Valet Employee cannot issue refunds. Role authorization and the required atomic AuditEvent are application responsibilities; same-tenant actor/payment relationships and row-local amount/reason/state rules are database responsibilities.

## Incident

Operational issue tied to a session/task/location.

Blueprint categories include vehicle damage, key problems, unauthorized zone exit, wrong vehicle handoff attempt, payment dispute, customer complaint, employee safety, system/connection issue and custom/other categories.

Incident lifecycle is separate from ValetSession physical state. Opening an incident may block later commands through policy/guards without rewriting custody history.

Full ClaimShield evidence-package handling is V2; basic incident reporting is MVP.

The DEC-077 process-death recovery intent (`IncidentRecoveryIntent`) is
reliability/admission metadata, not an Incident lifecycle state. It binds one
recovery-mode Incident operation ID to its exact original Organization, Location,
ValetSession and reporting OrganizationMembership before dispatch, holds a
server-authoritative 15-minute admission window, and becomes terminal
(`RETIRED`, or effectively expired) without ever asserting that an Incident
occurred. A matching committed Incident remains the only success authority.

## Notification

Outbound communication record for guest/staff operational messages.

MVP channels may include SMS and/or WhatsApp according to first-market provider availability. Push belongs to users who later choose an account/app flow.

## GuestRating

Minimal immutable guest feedback for one completed ValetSession, implemented by
MGT-BE-09 under DEC-091. The persisted source contains the exact Organization,
Location and ValetSession scope, integer rating from one through five, and the
database-authored `rated_at`. `valet_session_id` is the one-rating-per-visit
identity. The rating is written only through that session's current authorized
Guest Access after `COMPLETED`; staff cannot author, update or delete it.

`rated_at` is the rating-write receipt time. `GuestRating` is the authoritative
rating fact for later analytics, but `rated_at` does not redefine the later
Location-local visit-period cohort; MGT-BE-10 owns the aggregate/cohort contract.
The rating write creates no separate `AuditEvent`; immutability of the source
row preserves the submitted fact.

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

DEC-079 distinguishes Location operational audit, Organization-wide audit with
no fabricated Location, and a separate account-security audit boundary.
`AuditEvent` now supports the first two tenant scopes: operational events keep a
real Organization/Location, while Organization-wide events keep a real
Organization with `location_id = NULL` and no ValetSession. Account-security
history is persisted separately in `AccountSecurityAuditEvent`; it has no
Organization or Location relationship and is not part of tenant Black Box
history.

MGT-BE-02 records the bounded account-security catalog
`MFA_TOTP_ACTIVATED`, `MFA_RECOVERY_CODE_USED`,
`MFA_FACTOR_REENROLLMENT_STARTED`, `MFA_RECOVERY_CODES_REISSUED`, and
`MFA_OPERATOR_RECOVERY`. These events describe account-security outcomes only;
they never carry TOTP seeds, raw recovery codes, verifiers, bearer credentials,
or tenant-audit copies.

New tenant audit rows carry truthful actor provenance: a same-Organization
membership, Guest, system/service, external provider, or controlled VAYLET
operator. Controlled operators use a bounded opaque operator reference in a
dedicated column. Historical rows whose earlier schema did not encode an
explicit non-membership actor remain unchanged rather than receiving invented
provenance.

MGT-BE-07 adds the bounded Location lifecycle event family
`LOCATION_CREATED`, `LOCATION_ACTIVATED`, `LOCATION_INTAKE_STOPPED`,
`LOCATION_DEACTIVATED`, `LOCATION_CURRENCY_CORRECTED`, and
`LOCATION_TIMEZONE_CORRECTED`. Each real lifecycle/correction mutation appends
its Location-scoped tenant event atomically; desired-state no-ops do not create
duplicate lifecycle history.

## Configuration model principle

Configuration First is binding product behavior.

Where a product policy varies normally by customer/location, preferred precedence is:

```text
Company default -> Location override
```

Exact typed configuration entities/tables are introduced by focused tasks. Do not create a speculative untyped policy blob simply to satisfy the concept early.

MGT-BE-05 makes the Company-default layer mutable through the Company Admin
Management boundary while preserving the existing Location Manager exact-grant
surface for the original ten typed Location overrides. The implemented
Management catalog adds `EN | AR` language, informational operating hours,
OCR-assist enablement, Parking Spot required, employee Retrieval-requested
notification enablement, and Guest vehicle-ready notification enablement. Scalar
Location overrides are nullable; absence means inherit and explicit `false`
remains a real override.

`OrganizationOperatingHours` and `LocationOperatingHoursOverride` are normalized
seven-weekday local-wall-clock facts. They persist `time without time zone`, use
the authoritative Location timezone only when interpreting/displaying the
schedule, and do not persist a current UTC offset. They are informational and do
not become an operational eligibility lifecycle.

Parking completion consumes the effective current Parking Spot policy inside
the protected transaction. A required policy needs a valid permitted Spot; an
optional policy may complete with a valid Parking Zone and no Spot. This is
prospective policy only and does not rewrite completed parking history.

OCR-assist and notification enablement are likewise prospective gates. OCR OFF
prevents tenant OCR assistance while preserving manual/no-plate Check-In;
OCR ON still depends on independent provider/deployment/cost/privacy gates.
Notification settings are finite real event families, not arbitrary keys, and
do not rewrite old Notification or Staff Push history.

Basic Management branding is only Company/Location display name and primary
color. Company display name is `Organization.name`; Location overrides inherit
when absent. Logos/assets are deliberately not modeled by MGT-BE-05. No
geofence-alert setting is modeled without a justified alert consumer. MGT-BE-10
implements the previously deferred SLA source as nullable
`Location.sla_target_seconds` plus the immutable per-attempt
`RetrievalRequest.sla_target_seconds_snapshot`. The current Location value is
configuration; the RetrievalRequest snapshot is historical applicability truth.
There is no default target, historical backfill, or rewrite of an earlier
attempt when configuration changes.

## Management KPI source facts

DEC-095 keeps Management analytics derived from existing operational facts
rather than creating a KPI warehouse. SLA Compliance cohorts authoritative
RetrievalRequests by request time and compares `retrieval_requested_at ->
ready_at` against the immutable snapshot. Equality meets target; missing target
or invalid/missing interval is coverage information rather than fabricated zero.

Cars per Active Employee counts distinct actor-at-time memberships evidenced by
exactly: ValetSession check-in, condition completion and final completion;
KeyCustodyEvent actor; ConditionNote recorder; VehiclePhoto capturer;
HandoffVerification verifier; and DispatchEvent actor for `ACCEPTED`, `DECLINED`,
`IN_PROGRESS` or `COMPLETED`. Current directory membership, Shift presence,
current Task assignment and Dispatch `QUEUED`/`ASSIGNED`/`REASSIGNED` are not
work evidence. Later role/status changes do not erase accepted historical action
facts.

Cars Handed Off by Employee is separately sourced only from
`ValetSession.completed_by_membership_id` at `completed_at`; a null completing
actor remains explicit missing attribution. Key Exceptions reuse Incident as the
only fact, at `Incident.created_at`, and only `KEY_MISSING`, `WRONG_KEY`,
`KEY_DAMAGED` and `KEY_LOCKED_INSIDE` qualify. Ordinary KeyCustodyEvent movement
never becomes an exception and no `KeyException` aggregate/table exists.

## Modeling principles

1. Current state lives on operational entities for fast reads.
2. Historical facts live in immutable events.
3. Audit events do not replace relational constraints.
4. Physical ValetSession state, Task/Dispatch state, Payment state, Incident state and Notification state remain separate lifecycles.
5. Tenant/location integrity is enforced in the database where practical and always authorized in application code.
6. Offline/retryable operations require stable identifiers/idempotency semantics.
7. Multi-country Location data must not inherit one-country assumptions from Organization.
8. Avoid premature event sourcing, generic configuration engines and speculative future schema.
