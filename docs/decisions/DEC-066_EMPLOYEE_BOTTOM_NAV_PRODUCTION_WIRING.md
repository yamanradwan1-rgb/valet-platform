# DEC-066 — Employee Bottom Navigation Production Wiring

Status: Proposed
Date: 2026-08-25

## Context

The Employee bottom navigation visually exposes Tasks, Vehicles, Scan and
Shift, but in current Live mode only the Tasks surface is wired:
`EmployeeApp` handles only the home tab, the live route allowlist excludes
`vehicles-list` / `scan-hub` / `shift-summary`, and the live router has no case
for them. The existing Vehicles, Scan Hub and Shift Summary screens originated
as prototype UI containing hardcoded vehicle arrays, fake shift counters, a
fake employee identity and a dead End Shift button. No camera or QR capture
implementation exists anywhere in the Employee app; all live "scanning" today
is manual entry inside authoritative flows.

The repository already accepts everything needed to wire these surfaces
truthfully: transaction-aware operational eligibility (DEC-032), server-derived
tenant/Location/resource authority with resource codes that never authorize
(DEC-033), the Parking/Key Slot lifecycle (DEC-036/037), End Shift cash
reconciliation (DEC-052), verified key return (DEC-065) and the Employee
offline/recovery policy (DEC-063). The owner has resolved the open product
questions for this surface. This decision locks those resolutions so the
implementation slices cannot drift and prototype/mock screens can never be
accidentally promoted into Live mode.

Implementation slices covered:

```text
VUI-011A — Bottom Nav + Live Shift
VUI-011B — Context-Aware Scan Hub
VUI-011C — Employee Vehicle Directory Read + Live Vehicles
VUI-011D — Live Start Shift gap (recorded follow-up)
VUI-012  — Real Camera/QR architecture (deferred)
```

## Decision

### 1. Live bottom navigation is incrementally activated

The bottom navigation contains Tasks, Vehicles, Scan and Shift. Production
activation is incremental and gated on truthful Live implementations:

- VUI-011A: Tasks remains Live; Shift becomes Live.
- VUI-011B: Scan becomes Live only when its context-aware truthful
  implementation exists (section 5).
- VUI-011C: Vehicles becomes Live only when the authoritative Employee
  vehicle-directory read and its Live screen exist (sections 6–10).

Mechanically wiring routing never makes a tab Live-reachable. No Live tab may
route to hardcoded vehicle arrays, fake Shift counters, fake employee identity,
prototype scanner behavior, or any other mock operational state. A prototype
screen must not be made reachable from Live mode merely to attach a tab; a tab
becomes Live-reachable only when it renders a truthful live-safe screen with
zero hardcoded operational data.

### 2. Top-level versus operational workflow navigation

Top-level surfaces are exactly:

```text
task-queue
vehicles-list
scan-hub
shift-summary
```

BottomNav may navigate freely between top-level surfaces. BottomNav MUST NOT
navigate away while any operational workflow is active:

```text
check-in
parking
retrieval
incident
guest-access
```

These workflows may hold transient in-memory intent/drafts; unmounting them
must not silently discard operational work. This rule is deliberately stronger
than blocking navigation only while a submission is in flight.

Workflow exit/navigation remains owned by each workflow's explicit completion,
cancel, back, or recovery actions — never by BottomNav.

No persistence workaround is permitted: no localStorage mutation drafts, no
sessionStorage mutation drafts, no IndexedDB outbox, no Service Worker mutation
replay, no Background Sync, no hidden background mutation continuation.
DEC-063 remains fully binding.

### 3. Live Shift tab

The Live Shift screen uses only the authoritative current Staff operational
context and the existing End Shift command. It displays only useful
employee-facing facts such as Organization, Location, role, shift start time,
elapsed duration and active status. The raw Shift UUID is never shown to the
employee.

Identity: no fake name and no email-local-part-derived name. If no
authoritative employee display identity is already available to the Live
Employee app, employee identity is omitted entirely. (Current inspection: the
live app retains no post-login email/name.)

Shift statistics: the prototype counters (Check-ins, Parking tasks,
Retrievals, Handoffs, Incidents) are NOT promoted. No Dashboard analytics are
reused for employees and no new employee counter API is added under VUI-011A.

### 4. End Shift

End Shift remains the existing authoritative command:

```text
POST /v1/staff/shifts/:shiftId/end
```

with the existing strict body containing `cashReported` per DEC-052 §7 and
DEC-032 §7 as amended. No new End Shift backend semantics are introduced.

The frontend must:

- collect `cashReported` according to the existing money/currency contract;
- require explicit employee confirmation;
- treat End Shift as ONLINE_ONLY;
- keep pending cash input transiently in memory only;
- surface `OPEN_TASK_HANDOFF_REQUIRED` truthfully;
- never claim success from a timeout or network failure alone.

Ambiguous outcome rule: if the request outcome is unknown,

1. do not show success;
2. retain only the minimum transient in-memory retry intent needed by the
   currently mounted Shift screen;
3. revalidate authoritative Shift/operational context after connectivity is
   restored;
4. allow the employee to explicitly retry the SAME End Shift command;
5. rely on the existing server idempotency for an already-ended self-owned
   Shift (DEC-032 §7);
6. show End Shift success only after a confirmed authoritative response.

Absence of an active Shift by itself MUST NOT be treated as proof that the
previous mutation succeeded. After confirmed success, refresh the
authoritative operational context; the Employee app returns to the existing
No Active Shift gate.

Start Shift is NOT added by VUI-011A. The missing Live Start Shift UI is
recorded as VUI-011D, a separate follow-up task.

### 5. Scan Hub — MVP production contract

VUI-011B is a context-aware launcher only. No camera implementation exists;
therefore: no getUserMedia, no BarcodeDetector dependency, no new scanner
library, no fake camera/scanner, and no QR-as-authorization behavior. Manual
code entry and existing operational inputs remain the supported MVP path.

Tiles:

- License Plate: may launch the existing Check-In flow.
- Key Slot / Parking Spot / Pickup-Handoff: may launch ONLY when the app
  ALREADY holds sufficient authoritative, identity-bound workflow context to
  resume the corresponding protected flow; otherwise the tile is disabled with
  a truthful localized reason.

The current Employee workspace does not contain a general Check-In target that
would let a top-level Scan Hub reconstruct an arbitrary key-assignment step.
Such a target must not be invented here; the Key Slot tile MAY remain disabled
in the first production Scan Hub when no sufficient existing target exists.
Parking Spot / Pickup-Handoff tiles similarly require the existing Parking /
Retrieval targets.

Prohibited: scan-first session discovery; "scan a code then search for whatever
session it belongs to" APIs; treating any resource code as authorization.

A later Real Camera/QR architecture is VUI-012 and requires a focused decision
covering capture mechanism/dependency, QR/barcode payload formats, camera
permission UX, manual fallback, and abuse/security rules.

### 6. Employee Vehicle Directory — purpose

VUI-011C may add ONE narrow Employee operational read. It must NOT reuse
Dashboard analytics/overview APIs. Conceptual route:

```text
GET /v1/staff/valet-sessions/directory?locationId=<uuid>
```

The exact final shared contract lives in `packages/contracts` during
implementation. No schema or migration change is expected or authorized by
DEC-066. The directory is operational, not analytical. COMPLETED sessions are
excluded from the active directory.

### 7. Vehicle Directory authority

Tenant, Organization, Location, role, active Shift and actor authority are all
server-derived. Client-provided `locationId` is only a requested resource
selector and never authority.

The server must prove: authenticated active Staff principal; authoritative
OrganizationMembership; exact Organization; exact Location; operational
eligibility / active Shift rules; role; and row visibility.

VALET_SUPERVISOR may read all active/non-COMPLETED sessions in the exact
authorized current Location for operational supervision.

VALET_EMPLOYEE may read only sessions for which existing lifecycle/task
semantics establish an operational relationship. Visibility must be derived
from existing accepted state/task ownership semantics rather than inventing a
second authorization model — examples include check-in ownership where
applicable, Parking Task assignment/ownership, Retrieval Task
assignment/ownership, and queued-task eligibility where the current Task Queue
already permits visibility.

Directory row visibility MUST NOT grant command authority. Every subsequent
session detail read, Parking command, Retrieval command, Handoff command,
Incident command, or other protected operation continues to re-prove its own
existing server authorization. Supervisor directory visibility likewise does
NOT automatically grant mutation authority where the underlying command does
not already allow it.

### 8. Field-level masking

Row authorization and field authorization are separate. A visible row does not
automatically permit every staff detail field.

Proposed directory fields may include sessionId, lifecycle state,
createdAt/updatedAt, vehicle descriptors, parking zone label, parking spot
label, and keySlotCode — but protected resource detail must be masked where
existing authorization does not justify disclosure.

In particular: VALET_SUPERVISOR may receive staff-only Key Slot detail for
sessions inside the exact authorized Location, consistent with supervisory
operational scope. VALET_EMPLOYEE `keySlotCode` MUST be null unless the
employee's existing state-specific operational/session authorization justifies
seeing that Key Slot detail; mere visibility of a QUEUED task/session does NOT
automatically grant exact Key Slot disclosure. Implementation must reuse or
derive field visibility from existing accepted Staff authorization semantics
and fail closed. No Key Slot detail may ever cross into Guest surfaces.
Parking Spot / Zone fields remain limited to operationally appropriate
staff-visible projections and create no new authority.

### 9. Directory v1 limits / search

A server-side safety cap is allowed. If the response is capped (for example
100 rows) and carries a `truncated` indicator, the Live UI MUST NOT present a
search box implying it searches all Location vehicles while it filters only the
loaded page. For v1: omit global search unless a true server-side search
contract is explicitly added later; local filtering, if any, must be clearly
limited to loaded results. Prefer the smaller v1 surface.

### 10. Vehicle row click behavior

Tapping a Vehicle Directory row performs no mutation. A row may open an
existing workflow only when the Employee already holds the authoritative target
and existing server authorization for that workflow; otherwise it shows only
the safe read-only operational detail already present in the directory
projection. Privileged session detail is not fetched merely because a row is
visible. No directory response may widen action authorization.

### 11. Offline / revalidation

Read-only top-level screens may display already-held data truthfully. On
reconnect, authoritative state must be revalidated. No fake offline success.
Protected mutations such as End Shift remain online-only. DEC-063 remains
binding.

### 12. English / Arabic

All new Live Employee copy uses the existing Employee i18n architecture with
EN/AR and proper RTL. Operational identifiers remain visually LTR isolated —
vehicle plates, Parking Spot codes, Key Slot codes, currency/amount
presentations where needed. Prototype hardcoded English strings may not be
promoted into Live mode.

### 13. Security / privacy

Preserved unchanged: server-derived tenant authority; exact Location isolation;
active Shift authority; task ownership; least privilege; Staff/Guest boundary;
no Dashboard privilege reuse; no guest credential/proof exposure; no Guest Key
Slot exposure; resource identifiers never authenticate or authorize;
authorization before protected data disclosure; authorization before mutation.

The vehicle-directory read is specifically an IDOR-sensitive surface and must
receive two-principal negative integration tests during VUI-011C.

### 14. Implementation sequence

```text
VUI-011A — Bottom Nav + Live Shift
  Tasks + Shift production navigation; workflow navigation pinning;
  truthful Live Shift; End Shift; no mock Shift content.
VUI-011B — Context-Aware Scan Hub
  Scan activates only with its truthful Live implementation;
  manual/context-aware only.
VUI-011C — Employee Vehicle Directory Read + Live Vehicles
  Vehicles activates only after the narrow read + Live screen exist;
  role/row/field-level authorization required.
VUI-011D — Live Start Shift Gap
  Separate follow-up; not silently absorbed into VUI-011A.
VUI-012 — Real Camera/QR Architecture
  Deferred; requires its own focused decision.
```

### 15. Non-goals

DEC-066 does NOT authorize: Dashboard API reuse for Employee analytics;
employee Shift statistics; profile/display-name backend work; camera/scanner
dependencies; scan-first session discovery; persistent browser mutation queues;
new lifecycle states; schema changes; migrations; Guest changes; weakening
existing command authorization; promotion of prototype operational data to Live
mode.

### 16. Required implementation proof

Bottom Nav: top-level tabs navigate only when their truthful Live screen
exists; operational workflows pin/disable BottomNav; no workflow-local
transient state is silently discarded through tab navigation.

Shift: zero fake name/stats; raw Shift UUID never shown; authoritative
Location/role/start/elapsed; exact End Shift body including `cashReported`
handling; online-only behavior; an ambiguous outcome never becomes local
success; explicit retry is server-idempotent; success refreshes operational
context.

Scan: no camera/fake scanner; no tile grants authority; no Parking/Retrieval
launch without a sufficient existing authoritative target; disabled reasons
truthful and localized.

Vehicles: exact tenant/Location isolation; role-aware row visibility;
two-principal negative authorization tests; supervisor Location-wide read only
inside the authorized Location; employee state/task-based visibility only; row
visibility grants no mutation authority; Key Slot field-level masking; no Guest
detail exposure; no mock vehicle list; no misleading global search over a
capped local page.

General: EN/AR + RTL/LTR identifier proof; DEC-063 recovery rules; no
schema/migration changes unless a later decision explicitly supersedes this;
lint/typecheck/tests/build gates green.

### 17. Relation to existing decisions

- DEC-032 remains binding for operational Shift/task eligibility.
- DEC-033 remains binding for server-derived tenant/Location/resource
  authority.
- DEC-036/DEC-037 remain binding for Parking and Key Slot lifecycle authority.
- DEC-052 remains binding for End Shift cash reconciliation.
- DEC-063 remains binding for Employee offline/recovery semantics.
- DEC-065 remains binding for verified key return during Confirm Parked.
- DEC-066 does not supersede those decisions; it composes them into the
  production navigation/read boundaries above.

## Reason

The bottom navigation currently advertises four surfaces while three are dead
or mock-only. Locking the activation gates, navigation-pinning policy, Scan Hub
launcher contract, and the role/row/field authorization envelope for the one
new narrow read lets each slice land independently reviewable without
inventing backend behavior, leaking prototype data into Live mode, or widening
any existing trust boundary.

## Consequences

- VUI-011A/B/C can be planned and reviewed against a fixed behavioral
  contract; each tab's Live activation becomes an explicit, testable event.
- Employees gain a truthful Shift surface with the accepted End Shift flow;
  supervisors gain Location-scoped supervision visibility only after
  VUI-011C's focused contract work.
- The missing Live Start Shift UI remains a recorded gap (VUI-011D) rather
  than silent scope creep.
- Camera/QR capture stays deferred until VUI-012 defines it.

## Affected docs/code

- `docs/decisions/DEC-066_EMPLOYEE_BOTTOM_NAV_PRODUCTION_WIRING.md`
- `docs/08_DECISIONS_LOG.md` summary/index mirror
- future implementation areas only: `apps/valet/src/**` (navigation shell,
  Shift/Scan/Vehicles screens and features), `packages/contracts/src/**`
  (directory contract during VUI-011C),
  `apps/api/src/modules/staff/**` (directory query during VUI-011C)
