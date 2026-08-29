# DEC-069 — Exact Returning Vehicle Recognition, Organization-Wide Returning Customer Suggestion, and Check-In Vehicle Details

Status: Accepted
Date: 2026-08-29

Canonical decision log entry: `docs/08_DECISIONS_LOG.md` (DEC-069).

## 1. Context / problem

The current Check-In foundation already reuses a same-Organization Vehicle
when intake receives an exact confirmed known plate. It does not recognize that
Vehicle before intake creation, does not persist Check-In-authored Make / Model /
Color, and intentionally creates a new Customer row whenever Customer contact is
supplied. As a result, a repeat visit cannot safely prefill known Vehicle details
or offer a remembered Customer before the new custody visit is created.

Issue #191 must make repeat visits faster without turning the Employee surface
into a Vehicle directory, Customer directory, fuzzy plate search, ownership
registry, or PII enumeration tool. A plate is convenience input, never proof of
Customer identity, Vehicle ownership, or authorization.

The Project Owner explicitly accepts Organization-wide returning-Customer
association for this narrow flow. The wider scope is available only after an
Employee confirms an exact plate and the server resolves the exact
Organization-scoped Vehicle. It does not create general Organization-wide
Customer access.

## 2. Current persistence facts

The accepted contract builds on these verified repository facts:

- Vehicle is a reusable Organization-scoped entity.
- A known Vehicle plate is unique through the partial database index on
  `(organization_id, plate_country, plate_number_normalized)`.
- Vehicle already has nullable `make`, `model`, `color`, and
  `temporary_descriptor` fields plus `updated_at`.
- DEC-020 permits plate-less Vehicles and requires a useful employee-confirmed
  temporary descriptor when the grouped plate fields are absent.
- ValetSession already stores same-Organization `vehicle_id` and nullable
  `customer_id`, and `COMPLETED` is its terminal physical-custody state.
- Completed ValetSession rows therefore preserve authoritative visit-specific
  evidence that one Customer was associated with one Vehicle for that visit.
- Customer is Organization-scoped and stores required `phone_normalized` plus
  nullable `display_name`.
- `Customer.phone_normalized` is not unique. The current intake command creates
  a new Customer for supplied contact and performs no Customer reuse or merge.
- No Customer/Vehicle ownership or association table exists.
- The baseline has exactly 31 forward-only migrations.

DEC-069 changes none of those persistence structures.

## 3. Affected entities and lifecycle boundary

Affected entities and authorization facts are:

- authenticated User;
- OrganizationMembership and MembershipLocationAccess;
- Organization and current target Location;
- Vehicle;
- Customer;
- completed ValetSession history;
- the new ValetSession created by authoritative intake; and
- AuditEvent only when a protected Vehicle-detail correction requires history.

Recognition occurs before creation of the new intake. DEC-069 adds zero
ValetSession states and zero Task/Dispatch states. The canonical lifecycle stays:

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

Parking, DEC-068 post-parking KeySlot binding, Task/Dispatch, Retrieval, secure
handoff, Payments, tracking, incidents, notifications, and key custody are
unchanged. Recognition feeds Check-In only.

## 4. Canonical Employee Check-In flow

```text
Plate Capture
-> Employee Confirm Plate
-> Exact Returning-Vehicle Recognition

KNOWN VEHICLE
  -> show saved Make / Model / Color when present
  -> show a minimal returning-Customer suggestion only when eligible
  -> Employee chooses USE_SAVED_CUSTOMER or DIFFERENT_CUSTOMER
  -> Employee confirms details or explicitly corrects stale details

UNKNOWN VEHICLE
  -> optional Vehicle Details
  -> Customer Phone

NO / UNREADABLE PLATE
  -> meaningful temporary descriptor
  -> optional Vehicle Details
  -> Customer Phone

-> Vehicle Condition
-> existing Check-In completion
-> existing Parking Task workflow
```

Optional or unknown Make / Model / Color and absence of a safe Customer
suggestion must never block Check-In or add mandatory friction. The normal
no-photo fast path remains targeted at approximately 15–20 seconds.

## 5. Exact Organization-scoped Vehicle recognition

Recognition is permitted only after the Employee explicitly confirms the plate.
OCR/ANPR remains assistive candidate input; the human-confirmed value is the
authoritative input to the existing accepted normalization boundary.

The exact lookup key is:

```text
organization_id
+ plate_country
+ plate_number_normalized
```

The Organization is server-derived from the authenticated Employee's persisted
current Check-In scope. Recognition uses exact equality only. It permits no
fuzzy, partial, substring, approximate-OCR, or broad enumeration behavior and
must not become a generic Check-In Vehicle directory.

Vehicle recognition is Organization-wide because Vehicle identity itself is
Organization-scoped. Current Location authorization remains mandatory for the
Employee's Check-In, but the same Organization Vehicle may have prior visits at
other Locations. Recognition grants zero mutation authority.

A recognition result may contain only Check-In-safe Vehicle fields required for
the flow, such as the opaque Vehicle reference, plate display fields, normalized
plate only where technically required, nullable Make / Model / Color, and the
Vehicle optimistic token (`updated_at` / `vehicleUpdatedAt`). It must not expose
ValetSession history, Guest credentials, Customer history, payments, KeySlot,
ParkingSpot, GPS, AuditEvent metadata, staff identities, incident internals, or
unrelated historical data.

## 6. Organization-wide historical Customer suggestion

After exact Vehicle resolution, the server may derive one returning-Customer
suggestion from ValetSession history across every Location in the same
Organization. Eligible evidence is exactly:

- `valet_sessions.organization_id` equals the resolved Vehicle Organization;
- `valet_sessions.vehicle_id` equals the exact resolved Vehicle ID;
- `valet_sessions.customer_id IS NOT NULL`; and
- `valet_sessions.state = COMPLETED`.

Location is intentionally not a historical filter. An Employee checking in at
Location B may receive the minimum safe suggestion derived from an eligible
completed association at Location A when both Locations belong to the same
Organization and the current Location B Check-In is authorized.

The only supported disclosure path is:

```text
authorized current Check-In
-> Employee-confirmed exact plate
-> exact Organization-scoped Vehicle
-> eligible completed history for that Vehicle in that Organization
-> deterministic minimum Customer suggestion
```

An Employee cannot submit an arbitrary Customer ID, Vehicle ID, plate fragment,
or inaccessible Location reference to obtain Customer data.

## 7. Deterministic ambiguity rule

For the resolved Vehicle, compute the distinct non-null Customer IDs across all
eligible completed ValetSessions in the same Organization:

- zero distinct Customer IDs: return no suggestion;
- exactly one distinct Customer ID: that Customer may be suggested;
- more than one distinct Customer ID: return no suggestion.

The rule is based on distinct Customer IDs, not phone equality or display-name
equality. Repeated visits by the same Customer ID across one or many Locations
remain one distinct Customer. Any second Customer ID suppresses the suggestion,
even if one Customer is newer or more frequent.

The server must not guess the newest or most frequent Customer, compute a
confidence score, infer ownership, merge Customers, or use probabilistic/AI
matching.

## 8. Historical association is not ownership or authentication

A suggestion means only:

> Previously associated with this Vehicle during a completed VAYLET visit.

It does not mean legal or registered owner, permanent Vehicle owner, verified
driver, authenticated person, or guaranteed current Customer. The contract must
remain correct for sold, rental, fleet, family/shared, and company Vehicles; a
different guest using the same Vehicle; and historical Employee entry mistakes.

Plate recognition is convenience assistance only.

## 9. Minimum Customer disclosure

Before explicit Employee confirmation, the response and UI may disclose only:

- an opaque Customer reference required by the confirmation protocol;
- nullable `displayName`; and
- a masked phone suffix sufficient for recognition, for example
  `phone ending 1234`.

The full normalized phone is not returned merely for recognition. The opaque
Customer reference is intent data, not authorization.

The recognition boundary must not disclose a complete Customer profile,
arbitrary phone-search results, Guest token/hash/access state, payment history,
visit count, Location history, previous visit timestamps, Vehicle history, GPS,
AuditEvent data, or unrelated internal identifiers/sensitive metadata.

## 10. Explicit Customer confirmation

The server must never attach a remembered Customer automatically because the
plate matched. The Employee explicitly chooses one of two intents:

```text
USE_SAVED_CUSTOMER
DIFFERENT_CUSTOMER
```

### USE_SAVED_CUSTOMER

At final intake execution, before attaching the client-proposed Customer, the
backend must re-prove from persisted authoritative facts:

1. the authenticated active User;
2. the current active OrganizationMembership;
3. the active target Organization and Location;
4. explicit current target Location access;
5. accepted `VALET_EMPLOYEE` or `VALET_SUPERVISOR` field permission;
6. exact same-Organization Vehicle identity from the confirmed plate; and
7. that the proposed Customer ID still is the sole distinct Customer under
   DEC-069's Organization-wide completed-history rule.

The client-provided Customer reference is only confirmation intent. It grants no
authority. If the result is stale, the Vehicle no longer resolves exactly, or
the distinct-Customer rule no longer yields that Customer, the command fails
safely and requires current Customer entry. It must not silently attach another
Customer or fall back to the stale suggestion.

Revalidation belongs inside the authoritative final intake transaction. The
later implementation must preserve authorization-before-mutation and analyze
the recognition-to-intake check/use race; DEC-069 does not select a particular
row-lock, advisory-lock, or isolation primitive.

### DIFFERENT_CUSTOMER

The historical suggestion is ignored. The Employee proceeds through normal
Customer phone entry/resolution. No remembered Customer is silently attached.

## 11. Different-Customer exact-phone resolution

The supplied phone is normalized through the existing accepted international
phone-normalization contract. Resolution searches only the same Organization by
exact `phone_normalized` equality:

- zero exact Customer rows: create a new Customer through the authoritative
  intake path;
- exactly one exact Customer row: reuse that Customer ID;
- more than one exact Customer row: treat Customer identity as ambiguous and do
  not select or attach any of them.

The multiple-match case must return a stable explicit ambiguity outcome so the
Employee flow can recover without attaching the wrong historical Customer. The
later implementation slice may choose the narrowest compatible UX and stable
transport/error shape; this decision does not name an endpoint, status, or error
code.

Phone equality is not personal identity or Vehicle ownership. DEC-069 adds no
unique Customer-phone constraint, performs no automatic merge, and rewrites no
historical Customer IDs. Customer merge/deduplication remains out of scope.

The exact zero/one/many decision and any zero-match creation must be handled in
the authoritative intake transaction with concurrency protection adequate to
preserve those semantics. This decision locks the result invariant but does not
select the database lock mechanism.

## 12. Make / Model / Color persistence and correction

Vehicle remains the persistent reusable home for:

```text
Vehicle.make
Vehicle.model
Vehicle.color
```

All three fields remain nullable, optional descriptive strings. Missing or
uncertain details never block Check-In. They do not define Vehicle identity,
change the plate identity key, or cause creation of another Vehicle.

For a known Vehicle, recognition pre-fills persisted details. For a new Vehicle,
the Employee may supply any subset during intake. An Employee may explicitly
correct stale details through the authoritative accepted Check-In mutability
path; frontend-only state is never treated as persistence.

Protected correction must:

1. authenticate the staff principal;
2. resolve the current ValetSession/Vehicle and tenant/Location scope from
   persistence;
3. prove active Employee/Supervisor field authority and exact scope before any
   write;
4. enforce optimistic concurrency using the Vehicle `updated_at` token or an
   equivalent accepted Vehicle token;
5. update only the explicit intended descriptive fields;
6. append an appropriate safe Vehicle-scoped AuditEvent when the protected
   correction changes persisted details; and
7. commit mutation and audit atomically.

A stale browser read must not overwrite a newer correction. Exact AuditEvent
name and safe metadata schema belong to the later backend contract; metadata
must not copy raw phone, raw plate, Customer suggestion payloads, credentials,
or unnecessary free text.

## 13. Lightweight Vehicle-detail normalization

Make / Model / Color are descriptive values, not catalog identities. The later
shared contract and backend must consistently:

- trim surrounding whitespace;
- apply one documented lightweight presentation/Unicode normalization;
- enforce reasonable bounded lengths;
- convert empty values to absent/null where appropriate; and
- preserve ordinary human-readable descriptive strings.

Do not create Make, Model, VehicleTrim, or automobile-catalog entities; foreign
keys; VIN requirements; mandatory external validation; or catalog membership
guards. A value outside the UI reference catalog must not block Check-In.

## 14. Versioned local Make/Model reference data

Employee Make/Model selection uses a versioned local reference dataset as UI
assistance:

- searchable Make list;
- searchable Model list filtered after Make selection;
- explicit Other option;
- explicit Unknown / Skip path;
- offline-friendly local availability; and
- no runtime network dependency.

Backend `Vehicle.make` and `Vehicle.model` remain nullable descriptive strings
and are not foreign keys to the dataset. Before any real dataset is imported,
the implementation task must verify and record licensing and provenance. This
DEC imports no dataset, chooses no commercial API, adds no dependency, and
authorizes no autonomous Make/Model recognition.

## 15. No-plate / unreadable-plate flow

DEC-020 remains binding. When a plate is absent or unreadable:

- Check-In continues;
- intake creates/uses a stable Vehicle UUID under the existing no-plate rules;
- the Employee must confirm a useful non-empty `temporary_descriptor`;
- examples include `Silver Toyota SUV`, `Black Mercedes sedan`, or
  `White pickup truck`;
- the descriptor is not unique and is not a reusable identity key; and
- no returning-Vehicle or returning-Customer recognition runs.

Matching, fuzzy-searching, or merging Vehicles by temporary descriptor is
forbidden.

## 16. Authorization and Organization-wide privacy boundary

Returning recognition is a field-operation capability for the existing ordinary
Check-In roles only:

- `VALET_EMPLOYEE`;
- `VALET_SUPERVISOR`.

The backend requires persisted authoritative facts as applicable: active User,
active Organization, active OrganizationMembership, active target Location,
explicit Location access, and accepted operation-specific permission.
`LOCATION_MANAGER` and `ORG_ADMIN` do not inherit this field capability from
management visibility. No client-supplied Organization ID, membership ID, role,
Customer ownership, or Vehicle ownership is trusted.

An Employee authorized at Location B may receive the minimum Customer
suggestion derived from an eligible completed association at Location A only
when both are in the same Organization and the exact Vehicle/single-Customer
rules pass. This grants no access to Location A operational records.

The response must not reveal Location A's name, historical Session IDs,
parking/key details, previous staff, payment data, timestamps, condition/photos,
GPS, or audit history. The only cross-Location fact disclosed is the minimum
statement that this Customer was previously associated with this exact Vehicle
somewhere in the same Organization.

## 17. Cross-Organization non-disclosure

Cross-Organization Vehicle, Customer, and ValetSession history is always
prohibited. Unauthorized and foreign-tenant resources must not become existence
oracles. Safe failures must not reveal that another Organization owns a plate,
contains a Customer, or has association history. SQL errors, constraint names,
and inaccessible-resource details remain private.

## 18. Stale recognition, concurrency, retry, and idempotency

Recognition is advisory and read-only. It creates or mutates no Vehicle,
Customer, ValetSession, AuditEvent, or other state and does not freeze the facts
it observes.

Final intake and Vehicle-detail correction revalidate their own current facts
and authority. A stale recognition result must never:

- bypass the active-session conflict;
- attach a now-ineligible Customer;
- overwrite newer Vehicle details;
- defeat Vehicle optimistic concurrency;
- bypass tenant/Location/role authorization; or
- create duplicate intake effects.

Existing intake durable idempotency remains authoritative. The later request
fingerprint/equivalent must cover every material selection that can change the
Customer/Vehicle result, including saved-versus-different Customer intent and
any submitted Vehicle details. An exact retry after a committed intake returns
the original authoritative result without duplicating Customer, Vehicle,
ValetSession, AuditEvent, or operation history. Reuse of the same operation key
with materially different normalized intent remains a conflict.

The later implementation must test first execution, lost-response retry,
concurrent identical execution, changed-payload reuse, active-session races,
stale Vehicle-detail correction, and a suggestion that becomes ambiguous before
final intake. DEC-069 does not weaken any existing database uniqueness or
conditional-write guard.

## 19. Persistence / migration boundary

DEC-069 requires:

- zero Prisma schema changes;
- zero migrations;
- no rewrite of any existing migration;
- no migration 32;
- no new persistence entity; and
- no dependency or lockfile change.

Returning association truth remains:

```text
Customer
   ^
   | completed visit association
ValetSession
   |
   v
Vehicle
```

Do not introduce `customer_vehicle`, `vehicle_owner`,
`customer_vehicle_ownership`, `vehicle_customer_cache`,
`returning_customer_cache`, `visit_memory`, or equivalent persistence for Issue
#191. The current Vehicle, Customer, ValetSession, authorization, and AuditEvent
structures are sufficient under this accepted contract.

## 20. Audit / telemetry privacy

Read-only recognition does not create noisy AuditEvents unless a later accepted
audit policy explicitly requires one. Protected Vehicle-detail correction uses
an appropriate same-transaction Vehicle-scoped AuditEvent as described above.

Logs, metrics, traces, and AuditEvent metadata must not contain full Customer
phone, raw plate unnecessarily, Authorization, Guest credentials, historical
Customer lists, or raw recognition payloads containing PII. Where an existing
required AuditEvent needs semantic metadata, safe booleans such as
`returningVehicleRecognized`, `returningCustomerSuggestionUsed`, or
`vehicleDetailsCorrected` may be used only when relevant and without copying the
underlying sensitive values.

## 21. Consequences for the later backend / contracts slice

The backend/contracts implementation must provide reusable application/domain
boundaries rather than making internal intake code call its own HTTP route:

1. an authorized, exact, read-only Organization Vehicle recognition query;
2. a minimum Customer-suggestion projection implementing the completed-history
   and single-distinct-Customer rule;
3. final intake composition for explicit saved/different Customer intent with
   server-side revalidation;
4. exact same-Organization phone resolution with zero/one/many outcomes;
5. optional Make / Model / Color creation and optimistic correction semantics;
6. strict shared transport contracts and safe error mapping; and
7. focused authorization, privacy, concurrency, idempotency, and integration
   tests.

Exact HTTP route names, DTO property naming beyond the locked semantic fields,
stable error-code names, AuditEvent names, and locking implementation remain for
the focused backend/contracts task to define without weakening this DEC.

## 22. Consequences for the later Employee UI slice

The Employee UI must:

- trigger recognition only after explicit plate confirmation;
- truthfully render loading, no-match, known-Vehicle, no-suggestion,
  suggestion, ambiguity/recovery, stale/conflict, and offline states;
- display only the minimum masked Customer suggestion;
- require an explicit saved-versus-different Customer choice when a suggestion
  exists;
- provide optional Make / Model / Color entry/correction;
- use the versioned local Make/Model reference data with Other and Unknown/Skip;
- require a meaningful temporary descriptor for no-plate intake;
- keep manual entry/fallback available;
- preserve EN/AR and RTL/LTR behavior with plate/phone fragments isolated for
  correct display; and
- preserve DEC-063 truthful offline behavior: transient drafts and manual retry,
  no fabricated recognition or queued/synced mutation claim.

The UI never treats a cached recognition response, Customer reference, Vehicle
reference, or selected catalog value as authority.

## 23. Explicit non-goals

DEC-069 does not introduce:

- Customer account / Valet Passport;
- permanent or legal Vehicle ownership;
- Customer/Vehicle ownership tables or caches;
- Customer or Vehicle merge/deduplication workflows;
- fuzzy, partial, substring, or approximate plate search;
- arbitrary Vehicle or Customer directories;
- arbitrary Organization-wide PII search;
- VIN lookup or external runtime Vehicle API;
- AI/autonomous Make/Model recognition or autonomous OCR decisions;
- OCR-provider changes;
- SMS, WhatsApp, or Issue #192 Employee notifications;
- payment, Dashboard, parking, key, Retrieval, handoff, Task, Dispatch, GPS, or
  lifecycle changes;
- SmartStack AI or predictive behavior;
- schema/migration/dependency changes; or
- production-code implementation in this decision task.

## 24. Consequences / trade-offs

- Repeat visits can be faster because exact known Vehicle details and one
  deterministic historical Customer can be offered before intake.
- Organization-wide association improves multi-Location operator usefulness,
  while the exact-plate gate and minimum projection prevent a general PII search.
- The single-distinct-Customer rule deliberately suppresses some useful-looking
  suggestions instead of guessing in shared/rental/fleet or data-error cases.
- Existing Customer duplicates remain representable. Exact phone reuse reduces
  new duplication when unambiguous but does not pretend phone is unique or solve
  historical deduplication.
- Optional descriptive details improve operational recognition without turning
  automobile catalog data into domain identity.
- No new persistence or migration is required; the implementation complexity is
  concentrated in authorization, query composition, final-command revalidation,
  concurrency, contracts, and truthful Employee UX.

## Reason

The current relational model already contains the correct historical truth:
each completed custody visit links one Organization-scoped Vehicle to its
visit-specific Customer when known. Exact plate resolution plus a deterministic
single-Customer rule can safely reuse that truth without inventing ownership,
creating a search directory, or adding another association table. Persisting
optional descriptive details on the existing Vehicle and using local licensed
reference data keeps repeat Check-In fast, offline-friendly, and provider-free.

## Affected docs/code

Changed by this decision task:

- `docs/decisions/DEC-069_RETURNING_CHECK_IN_RECOGNITION.md`
- `docs/08_DECISIONS_LOG.md`

Expected later implementation areas, not modified by this decision:

- `apps/api/src/modules/check-in-api/**`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts`
- `apps/api/src/modules/vehicles/**`
- `packages/contracts/src/check-in.ts` and exports/tests
- `apps/valet/src/features/check-in/**`
- `apps/valet/src/components/screens/check-in/**`
- Employee i18n/reference-data assets and focused backend/API/UI tests
