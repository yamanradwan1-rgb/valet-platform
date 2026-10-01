# DEC-096 — Physical Resource Configuration and QR Identity

Status: Accepted
Date: 2026-09-29
Owner: VAYLET product owner
Issue: #232

## Context

VAYLET already persists `KeySlot`, `ParkingSpot`, and `ParkingZone`, but normal
production creation is not yet available through Management. DEC-067's static
resource QR V1 grammar is code-only:

```text
vaylet:key-slot:<RESOURCE_CODE>
vaylet:parking-spot:<RESOURCE_CODE>
```

Codes are unique per Location, not globally. V1 therefore cannot prove the
physical origin of a label when two Locations legitimately use the same code.
Issue #232 adds Management creation/list/reprint over the existing persisted
entities and an additive exact-identity QR format for newly generated labels.

## Decision

### Persistence

Existing `KeySlot`, `ParkingSpot`, and `ParkingZone` models remain authoritative.
No QR/PNG/URL/creator column, new inventory table, or new status enum is added.
New Key Slots and Parking Spots start `ACTIVE`.

### QR V2

Every newly generated Management physical-resource label uses exactly:

```text
vaylet:v2:key-slot:<RESOURCE_UUID>:<RESOURCE_CODE>
vaylet:v2:parking-spot:<RESOURCE_UUID>:<RESOURCE_CODE>
```

The UUID is immutable identification only, never authorization. The code is the
persisted canonical code after surrounding trim and is otherwise preserved
byte-for-byte.

For V2 operational use, the server must prove the scanned UUID, persisted
Organization, persisted Location, exact code, and `ACTIVE` status all match the
current authoritative operational scope. Existing workflow/state/actor guards
remain fully binding. QR decode alone performs no business mutation.

### V1 compatibility and manual input

DEC-067 V1 remains supported indefinitely for already printed labels and manual
continuity. V1 keeps its existing 120-character total payload cap, exact
case/punctuation behavior, and code-only semantics. Manual entry remains
code-only. No V1 label becomes invalid because V2 exists.

### Management authority

- Company Admin: list, create, view label, download, print, and reprint.
- Location Manager: same actions for an exact explicitly granted `ACTIVE`
  Location only.
- Supervisor: no Management physical-resource authority.
- Employee: no Management physical-resource authority; operational scanning
  remains separate.

Company Admin uses dedicated capability
`PHYSICAL_RESOURCES_MANAGE_ELIGIBLE`; it does not reuse
`LOCATION_SETTINGS_MANAGE_ELIGIBLE`. Company Admin create requires SENSITIVE
MFA; CA reads/label/reprint require STANDARD Management assurance. Location
Manager keeps the existing exact-Location Dashboard assurance model.

Every request revalidates current persisted actor, role/status, Organization,
Location ownership/access, and Dashboard entitlement. Client-supplied tenant
ownership is never authoritative.

### ParkingSpot creation

Every newly created ParkingSpot must reference one persisted `ACTIVE`
ParkingZone in the same Organization and Location. Legacy zone-null ParkingSpots
remain truthful historical data. If Issue #231 has not already provided a
bounded Management zone selector read, #232 may add only that read; zone
creation/editing remains out of scope.

### Inactive behavior

Company Admin may retain historical listing where current lifecycle authority
allows it. Location Manager remains active-Location-only. Creation into an
inactive Location and label generation/reprint for an inactive Location or
inactive resource are denied.

### Code and label validation

#232 does not solve Issue #195. Resource codes use surrounding trim only,
preserve remaining bytes exactly, and remain case/punctuation-sensitive. New
#232 input limits are:

- KeySlot/ParkingSpot code: 1..100 characters after trim;
- ParkingSpot label: 1..160 characters after trim.

These are new API/domain limits, not existing Prisma constraints. V2's maximum
wire length is derived from the accepted grammar and 100-character code bound;
V1 retains DEC-067's 120-character limit.

### Runtime database write boundary

The ordinary runtime role keeps no direct table-level `INSERT` on `key_slots`
or `parking_spots`. #232 adds forward-only migration-owned `SECURITY DEFINER`
creation functions with fixed safe `search_path`, PUBLIC EXECUTE denied, and
runtime EXECUTE granted only on reviewed public entry points. Private helpers
remain non-runtime.

The database write boundary independently rechecks actor role/status,
Organization, exact Location authority/status, and ParkingZone scope/status when
applicable. Resource creation and its Management AuditEvent are atomic.

### Idempotency and retry safety

Each create attempt carries a stable UUID `operationId` plus deterministic
request fingerprint. Same operationId + same request returns/reconciles the
original authoritative result; same operationId + a different request fails
with idempotency conflict. Duplicate exact code in the same Location conflicts;
the same code in another Location remains valid.

Clients never blindly replay a dispatched POST. Pre-dispatch auth refresh is
allowed. Post-dispatch 401 reconciles auth but requires explicit retry.
Transport loss after possible commit is an unknown outcome resolved by
authoritative reread before explicit retry.

### Audit and privacy

Successful creation appends exactly one safe Location-scoped Management
AuditEvent in the same transaction. Audit/QR content never includes PNG bytes,
tokens, MFA material, guest/handoff secrets, raw request bodies, customer,
vehicle, or employee PII, session IDs, or task IDs. New creation events do not
expand Supervisor audit visibility.

### Label generation, download, and print

Every Management label view/download/print/reprint begins with a fresh
authorized label read. The server returns current canonical non-secret V2
payload plus safe label facts only after current authority and ACTIVE state are
revalidated. The Dashboard renders locally with the repository's existing QR
library family.

Human-facing label content is limited to `VAYLET`, resource type, resource code,
Location name, Location code, and QR. UUID is not printed as normal human text.
Print mode excludes all Dashboard chrome. Operational codes remain bidi-isolated
in RTL.

## Amendment map

### Task 04 / Issue #236 — Parking Zone creation

The approved Task 04 extends the physical-resource create boundary to ParkingZone
in Keys & Spots / Physical Resources / Parking Spots. The strict request contains
only UUID `operationId`, trimmed `code` (1–100), and trimmed `label` (1–160).
Case, punctuation and Unicode are preserved. The response is the existing
ParkingZoneSelector; creation persists ACTIVE status under the authorized
Organization and exact active Location. Parking Zones receive no QR identity.

Company Admin uses existing sensitive MFA; Location Manager uses the existing
exact active Location grant without a new MFA requirement. Persisted authority,
Dashboard entitlement and active Location are rechecked before replay and held
through mutation. The shared Organization/operation serialization and replay
family includes `PARKING_ZONE_CREATED`, with fingerprint kind, Location, normalized
code and label. Exact same-Location code conflicts include inactive rows.

One narrow runtime-executable SECURITY DEFINER command owns creation and one
atomic `PARKING_ZONE_CREATED` Management audit event (`ParkingZone` entity).
Private helpers and direct runtime table INSERT remain denied. Migration 048
extends the replay index, helper mapping and audit guard without rewriting 046.

The Add Spot selector loads one bounded server page and navigates only on explicit
Previous/Next actions. A newly returned zone is retained separately as the selected
authoritative option. Add Zone suspends the Spot dialog's focus trap while
preserving its in-memory draft. Complete selection/session authority epochs fence
all callbacks. MFA/auth reconciliation never automatically retries a dispatched
POST; uncertain outcomes retain the same in-memory operation ID for explicit retry.

DEC-096 amends DEC-067 only by adding V2 for newly generated Management static
resource labels while preserving all V1/manual/camera/non-authoritative-input
requirements.

DEC-096 amends DEC-068 only where Key Slot physical verification may carry V2
`UUID + exact code` in addition to V1/manual code. DEC-068 custody timing,
atomicity, state transitions, and legacy compatibility remain unchanged.

DEC-031/033/036/037/047/058/063/065/078/079/080/081/082/088/094 remain
otherwise binding.
