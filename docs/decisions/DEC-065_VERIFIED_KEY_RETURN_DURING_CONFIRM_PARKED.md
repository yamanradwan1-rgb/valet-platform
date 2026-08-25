# DEC-065 — Verified Key Return During Confirm Parked

Status: Accepted
Date: 2026-08-25

> Amendment notice (2026-08-26): `DEC-068` — Post-Parking Key Slot Binding
> (`Accepted`) supersedes parts of this decision for NEW sessions whose
> persisted `key_slot_id` is NULL at Confirm Parked time: §6 step 4
> (equality against a persisted assignment — replaced by resolution of an
> ACTIVE, same-scope, currently free slot that is then atomically bound);
> §8 STRICT FAIL designated-slot policy (there is no designated slot on the
> new path; occupied/inactive/wrong-scope chosen slots fail closed via
> `KEY_CUSTODY_NOT_READY` with zero side effects, and no other session's
> slot is ever silently taken); §9 normal-flow narrative; §10's pre-parking
> "Assigned key slot" / "Return key to {code}" copy direction for the normal
> path; §13's unconditional canonical history order; and the corresponding
> §16 proofs. The canonical NEW normal sequence becomes
> `SLOT_ASSIGNED -> RETURNED_TO_SLOT` (both at Confirm Parked), then
> retrieval `CHECKED_OUT`, then handoff `RELEASED`. PRESERVED in full:
> scanned/entered evidence before any mutation, trim-only exact-code
> semantics, single-transaction atomicity, no standalone key-return
> endpoint, no new lifecycle state, no schema/migration/status column, no
> Guest exposure, transient in-memory codes per DEC-063. LEGACY sessions
> (non-null persisted slot) remain governed by this decision's equality-
> verification behavior unchanged. See
> `docs/decisions/DEC-068_POST_PARKING_KEY_SLOT_BINDING.md`.

## Context

Real-world valet custody requires the employee to physically keep the customer
key while driving the vehicle and to deposit it into its Key Slot only after
the vehicle is parked and the employee has returned to the key cabinet.

The currently accepted Confirm Parked contract (DEC-037) appends exactly one
`KeyCustodyEvent(RETURNED_TO_SLOT)` inside the Confirm Parked transaction
without requiring the employee to scan or otherwise evidence that physical
return. The repository investigation established that:

- `ValetSession.key_slot_id` is, and must remain, the designated/assigned home
  KeySlot for the session — not a live physical-location tracker (DEC-033,
  DEC-036 §12);
- append-only `KeyCustodyEvent` history is the authoritative record of physical
  custody transitions (DEC-031);
- Start Parking correctly records `CHECKED_OUT` while preserving the current
  slot assignment (DEC-036), and downstream consumers (Start Retrieval, release
  custody proof in DEC-042/043, Phase 3 gate proofs in DEC-038 §11) depend on
  the canonical history order `SLOT_ASSIGNED -> CHECKED_OUT -> RETURNED_TO_SLOT`.

The owner has selected a combined-confirmation design: Confirm Parked remains a
single atomic staff operation, but the physical key return is no longer
assumed — it must be evidenced by an exact scanned/entered KeySlot code that
the server verifies against the persisted assignment before any mutation.

This decision deliberately does not introduce a new ValetSession lifecycle
state, a standalone key-return endpoint, any schema/migration change, or a
mutable key-custody status column.

## Decision

### 1. Scope

DEC-065 amends only the Confirm Parked request/verification/custody-evidence
contract defined by DEC-037 and the matching Phase 3 gate wording in DEC-038.
It preserves every other accepted element of the parking lifecycle: routes,
state transitions, task transition, transaction atomicity, authorization,
locking, concurrency, error concealment, timestamps, audit/dispatch shapes, and
persistence.

### 2. Exact clauses of DEC-037 superseded/amended

Until DEC-065 is Accepted, DEC-037 remains fully binding. Once Accepted,
DEC-065 supersedes/amends exactly these clauses of DEC-037:

- **§3 (Canonical command route / request body)** — the strict shared request
  body gains one additional required field `keySlotCode`. The route, method,
  session-scoped derivation of the active Parking Task, and all other body
  constraints remain unchanged.
- **§4 (Parking proof / resource-code contract)** — the resource-code contract
  is extended so the same identifier/evidence rules apply to the submitted
  KeySlot code: trim surrounding whitespace only; exact match; never
  case-folded, fuzzy-matched, partially matched, reinterpreted, or treated as
  authentication; never accepted as a client-selected UUID authority.
- **§11 (Error precedence)** — `KEY_CUSTODY_NOT_READY` is widened to also cover
  a submitted KeySlot code that cannot be resolved to the session's assigned
  ACTIVE slot (wrong code, missing code, inactive/wrong-scope slot, or resolved
  slot not equal to the persisted assignment). Its precedence position relative
  to `PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE` is preserved. No new public
  wrong-slot error code is introduced.
- **§12 (Key custody readiness)** — readiness now additionally requires, inside
  the same protected transaction and before any mutation: resolution of the
  submitted `keySlotCode` to an ACTIVE KeySlot row within the persisted
  Organization + Location, transactional protection of that row, and equality
  between the resolved slot ID and the persisted `ValetSession.key_slot_id`.
- **§13 (Current KeySlot remains assigned)** — the outcome (current slot stays
  assigned through PARKED until a later lifecycle command changes it) is
  unchanged; the clause's "returns the key physically" assumption is replaced
  by server-verified scanned evidence as the condition for recording return.
- **§18 (RETURNED_TO_SLOT custody fact)** — the event is appended exactly once,
  but only after the verified scanned-slot match described above. The existing
  prohibitions stand: no standalone return-key route; no historical
  KeyCustodyEvent is updated or deleted.
- **§24 (Atomicity)** — the committed effect set (1–10) is unchanged; the
  pre-mutation proof set additionally includes the verified KeySlot match.
  Forbidden partial states are unchanged.
- **§33 (Required proof)** — implementation must additionally prove wrong-slot,
  non-matching, inactive, and wrong-scope submissions produce `KEY_CUSTODY_NOT_READY`
  with zero side effects, and that a correct scan produces exactly one
  `RETURNED_TO_SLOT` fact bound to the persisted assigned slot.

All other DEC-037 clauses (scope boundary, migration freeze, actor
authorization, canonical ownership, Task resolution, session preconditions,
dual optimistic concurrency, Spot resolution/Zone derivation, Spot occupancy,
session parking assignment, dispatch/audit contracts, one authoritative
operation time, lock ordering, retry behavior, public error contract, guest
notification/GPS/retrieval boundaries, architecture rules) remain binding as
written.

### 3. What remains valid elsewhere

- **DEC-036 remains fully valid**: Start Parking still records `CHECKED_OUT`
  while `ValetSession.key_slot_id` remains assigned; the designated-slot plus
  append-only-history model of current key-board state is unchanged.
- **ValetSession lifecycle remains exactly** `PARKING -> PARKED` for this path;
  no new state such as a parked-awaiting-key-return state is introduced.
- **Task lifecycle remains exactly** Parking Task `IN_PROGRESS -> COMPLETED`,
  committed in the same transaction.
- Both projections and the single `RETURNED_TO_SLOT` custody event still commit
  atomically in the one Confirm Parked transaction or not at all.
- **No standalone key-return endpoint** exists or may be added.
- **No database schema, migration, table, column, enum value, or runtime
  privilege change** is required or permitted by this decision. The repository
  remains at its then-current forward-only migration count.
- **Append-only `KeyCustodyEvent` history remains the sole custody authority**;
  no mutable key-custody status field may be introduced on ValetSession or
  anywhere else.
- Existing optimistic dual-version concurrency, authorization-before-mutation
  ordering, PostgreSQL-authoritative operation time, Dispatch/Audit event
  shapes, rollback guarantees, and non-disclosing error mapping remain
  unchanged.

### 4. DEC-038 Phase 3 gate amendment

DEC-038 §11 ("Key custody proof") is amended so the integration gate proves
that `RETURNED_TO_SLOT` succeeds **only after server-verified scanned KeySlot
evidence during Confirm Parked**, in addition to the existing proofs that it is
written only when Confirm Parked succeeds, that current
`ValetSession.key_slot_id` remains the assigned slot through PARKED, that
history is append-only, and that actor/session/Location/slot scope is
authoritative. The canonical normal-path history order
(`SLOT_ASSIGNED`, `CHECKED_OUT`, `RETURNED_TO_SLOT`) is unchanged.

### 5. Request contract

Conceptual Confirm Parked request becomes:

```json
{
  "expectedSessionVersion": 5,
  "expectedTaskVersion": 4,
  "parkingSpotCode": "A-03",
  "keySlotCode": "K-03"
}
```

The field name is locked as `keySlotCode`. It must not be named
`expectedKeySlotCode`: the submitted value is scanned resource evidence, not a
client authority claim. Strict shared Zod contracts under `packages/contracts`
continue to own the exact schema.

### 6. Scanned KeySlot evidence semantics

Inside the same protected transaction and before any mutation, the command
must:

1. trim surrounding whitespace from the submitted `keySlotCode`;
2. resolve it by exact code — no case folding, partial match, fuzzy match or
   reinterpretation — against `ACTIVE` KeySlots within the persisted session
   Organization + Location;
3. transactionally protect the resolved KeySlot row;
4. require `resolvedKeySlotId === ValetSession.key_slot_id`.

`parkingSpotCode` and `keySlotCode` are resource identifiers/evidence only.
Neither grants tenant, Location, membership, role, Shift, Task-owner or
assignment authority; all authority remains server-derived per DEC-032/033/037.

### 7. Failure semantics — zero side effects

Any failure of section 6 returns the existing stable public error:

```text
KEY_CUSTODY_NOT_READY
```

Wrong, missing, inactive, wrong-scope, or non-matching scanned slots fail
closed without leaking protected resource detail. Because verification occurs
inside the single Confirm Parked transaction before all mutations, a failed
verification produces zero side effects: no session/task projection change, no
custody/dispatch/audit events, no version increment.

### 8. MVP unavailable-slot policy — STRICT FAIL

If the designated KeySlot cannot be used at confirmation time (inactive,
unexpectedly unavailable, or the employee is at a different slot), Confirm
Parked fails closed with `KEY_CUSTODY_NOT_READY`. The command must never
silently reassign the KeySlot during Confirm Parked. A supervisor exception or
post-start slot-reassignment workflow is out of scope and requires a later
focused decision.

### 9. Employee flow and frontend boundary

The Employee flow becomes:

```text
AWAITING_PARKING
-> assign/designate Key Slot K-03
-> Parking Task created/accepted
-> Start Parking (CHECKED_OUT)
-> valet parks the vehicle at spot A-03
-> employee scans/enters Parking Spot A-03
-> UI instructs: return the key to K-03
-> employee physically returns the key to the cabinet
-> employee scans/enters K-03
-> one Confirm Parked POST carrying both codes
-> server verifies the scanned slot matches the persisted assignment
-> atomic commit: PARKING -> PARKED, Task IN_PROGRESS -> COMPLETED,
   RETURNED_TO_SLOT, Dispatch COMPLETED, Audit event
```

The frontend may temporarily hold the confirmed `parkingSpotCode` in memory
while the employee walks back to return the key, consistent with the accepted
Employee offline policy (DEC-063): transient in-memory drafts only; no
persistent browser mutation queues, durable drafts, Background Sync, or
automatic replay. If the device dies before submission, nothing was committed;
the existing rehydration/recovery flow restarts the confirmation safely.

### 10. Employee copy direction

Operational copy uses:

- English:
  - "Assigned key slot" (pre-parking designation contexts)
  - "Return key to {code}" (post-spot instruction step)
  - "Scan key slot" (key-return scan/manual entry step)
  - "Vehicle parked and key returned" (success state)
- Arabic:
  - "خانة المفتاح المخصصة"
  - "أعد المفتاح إلى الخانة {code}"
  - "امسح رمز خانة المفتاح"
  - "تم صف السيارة وإعادة المفتاح"

Wording must not imply the key is physically stored in its slot while the
employee is driving. Operational codes such as `K-03` must remain visually LTR
isolated in Arabic rendering (existing `bdi dir="ltr"` conventions).

Exact final strings live in the Employee i18n dictionaries; this decision locks
their meaning and direction, not their byte-level phrasing.

### 11. Accepted MVP timestamp trade-off

`parked_at` is authored from the one PostgreSQL-authoritative operation time of
the combined parking + verified-key-return confirmation commit. It may
therefore be recorded shortly after the vehicle physically stops in its
ParkingSpot (approximately the walk-back time to the key cabinet). This delay
is explicitly accepted for MVP. Guest notification delivery does not yet exist
(DEC-037 §29); if a later notification decision requires an earlier parked
signal, that decision owns the trade-off.

### 12. Privacy

No exact KeySlot information may ever be exposed to Guest surfaces. The
submitted/verified slot code remains staff-only operational data, consistent
with `docs/06_SECURITY_AND_DATA_RULES.md`.

### 13. Retrieval continuity

Retrieval semantics are unchanged. Start Retrieval continues to check the key
out from the session's assigned slot, release-time custody proof continues to
read the latest custody event, and after successful parking completion the
canonical history remains `... SLOT_ASSIGNED -> CHECKED_OUT ->
RETURNED_TO_SLOT`, followed by retrieval's `CHECKED_OUT` and handoff's
`RELEASED` under their existing decisions.

### 14. Persistence freeze

No Prisma schema change. No new forward-only migration. No mutable key-return
or key-custody status column. No duplicate custody projection table. The
existing `ValetSession.key_slot_id`, unique occupancy index, `version`,
`KeySlot`, `KeyCustodyEvent`, and AuditEvent persistence are sufficient.

### 15. Authorization and concurrency preservation

Operation order inside the single Confirm Parked transaction remains:

1. authenticate Staff principal;
2. lock the target ValetSession row;
3. resolve the acting OrganizationMembership from persisted data;
4. resolve and lock the active IN_PROGRESS PARKING Task;
5. prove current Task assignee + DEC-032 operational eligibility;
6. resolve, verify, and lock the assigned KeySlot against the scanned code
   (section 6);
7. resolve and lock the selected ParkingSpot and derived Zone;
8. guarded dual-version mutations, tracking stop, custody/dispatch/audit
   appends;
9. commit.

No mutation occurs before operation-specific authority and the verified
slot match are proven. Retry-after-success with stale versions still yields
`VERSION_CONFLICT` with no duplicate events (DEC-037 §27).

### 16. Required proof

Implementation must prove at minimum:

- exact extended request contract with required `keySlotCode`;
- trim-only, exact-match slot resolution within persisted Organization +
  Location; no case/fuzzy/partial matching;
- mismatch/non-resolution/inactive/wrong-scope scans yield
  `KEY_CUSTODY_NOT_READY` with zero side effects;
- correct scan yields exactly one `RETURNED_TO_SLOT` bound to the persisted
  assigned slot, actor, and shared DB-authoritative timestamp;
- `PARKING -> PARKED`, Task `IN_PROGRESS -> COMPLETED`, spot/zone assignment,
  version increments, Dispatch `COMPLETED`, and Audit `VALET_SESSION_PARKED`
  behave exactly as DEC-037 already requires;
- current KeySlot assignment preserved through PARKED;
- concurrent duplicate confirms: one winner, loser commits nothing;
- no standalone return endpoint; no schema/migration change;
- Employee EN/AR copy follows section 10 with LTR-isolated codes;
- no guest exposure of KeySlot detail;
- architecture/lint/typecheck/tests/build gates remain green.

## Reason

Physical custody truth should rest on evidence, not assumption, while keeping
the smallest possible change surface. Requiring one scanned slot code inside
the already-atomic Confirm Parked transaction achieves verifiable key return
with zero lifecycle, schema, endpoint, or recovery-model changes, and keeps
every downstream custody invariant (retrieval checkout, release proof, gate
history order) intact.

## Consequences

- Confirm Parked becomes two-step for the employee but one-shot on the wire.
- `parked_at` (and future parked notifications) reflects combined-commit time —
  an accepted MVP trade-off (section 11).
- Wrong-slot mistakes surface immediately at the cabinet with a safe,
  non-disclosing error instead of being silently absorbed into history.
- A designated-slot contingency (broken/unavailable slot at return time) fails
  closed until a later focused decision adds a supervised path.
- DEC-037 and DEC-038 retain their status; their amended clauses are governed
  by this decision once Accepted.

## Affected docs/code

- `docs/decisions/DEC-065_VERIFIED_KEY_RETURN_DURING_CONFIRM_PARKED.md`
- `docs/decisions/DEC-037_CONFIRM_PARKED.md` (amendment notice only)
- `docs/decisions/DEC-038_PHASE3_API_INTEGRATION_EMPLOYEE_OPERATIONS_GATE.md` (amendment notice only)
- `docs/08_DECISIONS_LOG.md` summary/index mirror
- future implementation: `packages/contracts/src/confirm-parked.ts`,
  `apps/api/src/modules/parking/**`, `apps/valet/src/features/parking/**`,
  `apps/valet/src/lib/i18n/dictionary-en.ts`,
  `apps/valet/src/lib/i18n/dictionary-ar.ts` (not modified by this decision)
