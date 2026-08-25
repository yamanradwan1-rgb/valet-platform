# DEC-068 — Post-Parking Key Slot Binding

Status: Accepted
Date: 2026-08-26

Canonical decision log entry: `docs/08_DECISIONS_LOG.md` (DEC-068).

## 1. Context / operational problem

Real smoke testing of the Live Employee UI exposed an operational workflow
defect, not a code defect: the currently accepted parking workflow forces the
employee to visit the key cabinet TWICE for every parking operation.

Today the normal path is:

```text
Check-In -> AWAITING_PARKING
-> scan/enter a Key Slot and call key-slot/assign   (cabinet visit #1)
-> queue/accept the Parking Task
-> Start Parking (records CHECKED_OUT from the assigned slot)
-> drive and park the vehicle
-> scan the Parking Spot
-> return to the assigned slot                       (cabinet visit #2)
-> Confirm Parked verifies the scanned slot equals the persisted assignment
```

Operationally this is wrong. The employee receives the key together with the
vehicle from the guest, must keep that key physically while driving, and has
no reason to know — or reserve — a cabinet slot before the vehicle is parked.
Pre-parking assignment adds walking, latency, reservation-shaped complexity,
and a second cabinet trip to every park operation.

The repository investigation confirmed the constraint chain that produced
this shape (Start Parking readiness guard plus guarded UPDATE predicate, the
custody primitive's INNER JOIN on `ValetSession.key_slot_id`, the DEC-065
verified-return equality requirement, and the Phase 3 gate's canonical
custody triple) and confirmed that none of it is load-bearing for physical
truth: the database already permits sessions with a NULL `key_slot_id`, the
partial unique index already provides single-occupancy authority, and no
runtime consumer requires a `CHECKED_OUT` event before the first
`RETURNED_TO_SLOT`.

## 2. Product objective

- Fewer employee steps per parking operation.
- NO key cabinet visit before Parking; exactly ONE cabinet visit after the
  vehicle is parked.
- Faster vehicle throughput and a shorter low-friction check-in path,
  consistent with the Blueprint core success criterion.
- Physical workflow truth: custody history records what actually happened
  (the key rode with the employee; the slot first enters custody at deposit).
- No reservation complexity: nothing is reserved, held, or predicted before
  the physical deposit happens.

## 3. Canonical NEW flow

```text
CHECK-IN
-> AWAITING_PARKING                      (no Key Slot step)
-> Parking Task queue/assign/accept      (unchanged DEC-034/035 lifecycle)
-> START PARKING                         (key_slot_id IS NULL allowed;
                                          no key custody event)
-> employee keeps the physical key while driving
-> park vehicle
-> scan/enter the Parking Spot           (unchanged evidence step)
-> go to the key cabinet for the FIRST time
-> place the key into any visibly free physical Key Slot
-> scan QR / enter that Key Slot code    (manual fallback mandatory)
-> CONFIRM PARKED
-> server atomically binds the Key Slot, appends custody facts,
   completes Parking                     (one transaction)
```

Operating principle:

```text
PARK FIRST -> SCAN PARKING SPOT -> PLACE KEY IN AVAILABLE SLOT
-> SCAN THAT SLOT -> CONFIRM PARKED
```

## 4. Scope

DEC-068 amends the parking/key-custody workflow semantics defined by
DEC-033, DEC-036, DEC-037, DEC-038 and DEC-065 as enumerated in section 28,
and the corresponding guard wording in `docs/04_VALET_SESSION_STATE_MACHINE.md`.

It owns:

- post-Parking Key Slot binding inside the Confirm Parked transaction;
- Start Parking proceeding without a preassigned Key Slot;
- the dual-mode compatibility rule based on persisted `key_slot_id`;
- the branch-aware custody/audit/dispatch behavior for both modes;
- the Employee UI flow direction for the normal path.

It does NOT:

- remove or change the accepted `key-slot/assign` / `key-slot/clear`
  commands (they remain valid administrative/legacy/correction capabilities);
- introduce reservations, availability projections, pickers, new lifecycle
  states, standalone key-return endpoints, new public error codes, new audit
  event types, schema changes, or migrations;
- implement any product code (implementation belongs to a later focused
  slice governed by this decision).

## 5. No pre-Parking Key Slot assignment or reservation

The NEW normal path has:

- NO Key Slot assignment during Check-In;
- NO Key Slot reservation before Parking;
- NO automatic Key Slot reservation of any kind;
- NO requirement to know the future Key Slot code before Parking;
- NO key cabinet visit before Parking.

The Check-In Employee flow must reach the Parking Task step without calling
any Key Slot assignment mutation. Session hydration must treat a persisted
NULL `key_slot_id` on an `AWAITING_PARKING` session as ready for the Parking
Task step, not as an incomplete check-in.

## 6. Start Parking semantics with NULL key_slot_id

For a session whose persisted `key_slot_id` IS NULL (the NEW normal path):

- Start Parking MUST succeed with `key_slot_id` still NULL.
- Start Parking MUST NOT fabricate a KeySlot-specific
  `KeyCustodyEvent(CHECKED_OUT)` when no Key Slot exists.
- Every other accepted Start Parking effect is unchanged: locked active
  ACCEPTED Parking Task owned by the actor, DEC-032 eligibility inside the
  transaction, dual optimistic versions, `AWAITING_PARKING -> PARKING`,
  PostgreSQL-authoritative `parking_started_at`, one Task version increment,
  one ValetSession version increment, tracking start when enabled,
  `DispatchEvent(IN_PROGRESS)`, and `AuditEvent(VALET_SESSION_PARKING_STARTED)`
  — all atomic.
- The protected session mutation must remain conditional on the locked
  expected version and accepted source state and must remain correct for a
  NULL current binding (a NULL-hostile equality predicate on
  `key_slot_id` must not silently reject the legitimate new-path update).
- The `KEY_CUSTODY_NOT_READY` readiness failure applies only to sessions
  that DO carry a persisted assignment whose slot cannot safely be used
  (legacy mode below), never to a legitimately unbound session.

The employee's operational responsibility while driving remains proven by:
canonical Parking Task ownership; active Shift / DEC-032 eligibility;
`parking_started_at`; Task `IN_PROGRESS`; Dispatch `IN_PROGRESS`;
`VALET_SESSION_PARKING_STARTED` audit; and configured tracking. No new
mutable custody status is introduced.

Legacy mode: if `key_slot_id` IS NOT NULL, all existing DEC-036 behavior
stands unchanged — prove the bound slot ACTIVE and same-scope under lock,
append exactly one `CHECKED_OUT`, keep the assignment intact.

## 7. Physical custody while Parking is IN_PROGRESS

Between guest handover and Confirm Parked, the key is physically with the
task-owning employee and intentionally has NO KeySlot custody representation.
This mirrors the already-accepted reality between `CHECKED_OUT` and
`RETURNED_TO_SLOT` in the legacy model, extended backwards across the drive.
Append-only `KeyCustodyEvent` history plus the current `key_slot_id` column
remain the only custody authorities; no status column, tracker, or projection
is introduced to represent "key in pocket".

## 8. Confirm Parked Key Slot binding semantics

The Confirm Parked request contract keeps exactly its DEC-065 shape:
`parkingSpotCode`, `keySlotCode`, `expectedSessionVersion`,
`expectedTaskVersion`. For a session with `key_slot_id == NULL`, the
submitted `keySlotCode` means: "the Key Slot into which the employee is
physically depositing the key NOW". It is NOT a previously assigned slot and
MUST NOT be verified against any prior assignment.

Inside the same protected Confirm Parked transaction the server must:

1. authenticate/authorize exactly as today (staff principal, persisted scope,
   current IN_PROGRESS PARKING Task owner, DEC-032 eligibility);
2. lock the ValetSession;
3. lock/authorize the active Parking Task;
4. enforce dual optimistic versions before state/resource detail
   (`VERSION_CONFLICT` precedence unchanged);
5. resolve the submitted Key Slot by exact trimmed code;
6. require the resolved Key Slot to be `ACTIVE`;
7. require the resolved Key Slot to belong to the persisted session
   Organization + Location (cross-scope codes are concealed failures);
8. transactionally lock the resolved Key Slot row;
9. prove the slot is not currently occupied by another session;
10. resolve/lock the Parking Spot and derive/lock its Zone exactly as today;
11. bind `ValetSession.key_slot_id` to the resolved slot;
12. bind Parking Spot / Zone exactly as today;
13. transition `PARKING -> PARKED` with the shared authoritative
    operation time;
14. transition the Parking Task `IN_PROGRESS -> COMPLETED`;
15. stop tracking as required today;
16. append the custody facts (section 12), Dispatch and Audit events
    (section 17);
17. commit atomically.

No partial parking/key/task result is allowed. Any failure before commit
leaves session, task, slot, spot, custody, dispatch, audit and tracking
exactly as they were.

## 9. Key Slot resolution / exact-code semantics

The DEC-033/DEC-037/DEC-065 resource-code contract applies unchanged:
transport may trim surrounding whitespace only; lookup is exact; codes are
never case-folded, partially matched, fuzzy-matched or reinterpreted; a
KeySlot code identifies a resource only and never authenticates the employee
or grants tenant/location/task authority; client-selected slot UUIDs are not
accepted. Resolution happens against `ACTIVE` KeySlots within the persisted
session Organization + Location only. Scanner and manual entry submit the
same `keySlotCode` field.

## 10. Key Slot availability / occupancy concurrency

The existing architecture principles govern availability:

- the partial unique index over non-null `valet_sessions.key_slot_id`
  (`valet_sessions_key_slot_id_key`) remains the FINAL current-occupancy
  authority — at most one session may reference a given slot;
- the resolved slot row is transactionally locked inside the Confirm Parked
  transaction before any mutation;
- current occupancy is proven transactionally after acquiring that lock;
- a PostgreSQL `23505` violation of the slot uniqueness index is treated as
  a concurrency signal and classified outside the aborted transaction using
  the established pattern (as already done for slot assignment and Parking
  Spot confirmation) — raw errors and constraint names are never exposed;
- there is NO availability-list endpoint, NO occupancy projection table, and
  NO reservation primitive. The server's in-transaction proof at Commit time
  is the only availability truth.

## 11. Exactly-one-winner same-slot race behavior

If two employees/sessions try to bind the same free Key Slot concurrently,
exactly one wins. The loser receives the stable conflict
`KEY_CUSTODY_NOT_READY` (section 25) and commits ZERO effects:

- no session change (state, versions, timestamps, slot/spot/zone binding);
- no task change;
- no custody events;
- no dispatch events;
- no audit events;
- no tracking mutations.

The winner is determined by the accepted locking/uniqueness mechanics of
section 10; DEC-068 locks these semantics and deliberately does not
prescribe finer implementation micro-details beyond them. Duplicate Confirm
Parked submissions for the SAME session remain governed by DEC-037 §27 /
DEC-065: stale expected versions yield `VERSION_CONFLICT` with no duplicate
events. Confirm Parked versus Shift end / eligibility loss converges safely
per DEC-037 §26, unchanged.

## 12. New custody history

For NEW normal-path sessions:

```text
guest hands key directly to employee     (no KeySlot custody event yet)
-> Start Parking                          (no CHECKED_OUT)
-> Confirm Parked:
     SLOT_ASSIGNED(resolved slot)
     RETURNED_TO_SLOT(resolved slot)
-> Retrieval Start:                       CHECKED_OUT(slot)
-> Handoff release:                       RELEASED
```

Canonical new normal sequence:

```text
SLOT_ASSIGNED -> RETURNED_TO_SLOT -> CHECKED_OUT -> RELEASED
```

Both parking-phase events describe real physical facts occurring at the
combined confirmation (the slot becomes this session's designated home slot
and the key is deposited into it) and carry the same actor, session scope,
slot, and shared database-authoritative operation timestamp. Deterministic
insertion order within the transaction is `SLOT_ASSIGNED` then
`RETURNED_TO_SLOT`. A fake pre-Parking `CHECKED_OUT` MUST NOT be created:
the named slot never held the key before the deposit, and inventing that
event would falsify append-only Black Box history.

## 13. Legacy/preassigned custody history

Sessions carrying a preassigned slot keep the accepted history shape:

```text
SLOT_ASSIGNED -> CHECKED_OUT(at Start Parking) -> RETURNED_TO_SLOT(at Confirm Parked)
```

Their Confirm Parked continues to require the submitted `keySlotCode` to
resolve to the persisted assigned ACTIVE slot (DEC-065 equality behavior),
appends only `RETURNED_TO_SLOT`, and MUST NOT double-append `SLOT_ASSIGNED`
or a second slot-assignment audit fact for the already-recorded assignment.

## 14. Dual-mode compatibility rule based on persisted key_slot_id

The compatibility rule is based entirely on persisted state:

```text
IF ValetSession.key_slot_id != NULL
   -> LEGACY/preassigned mode:
      current accepted behavior end-to-end
      (SLOT_ASSIGNED already recorded; CHECKED_OUT at Start Parking;
       submitted slot MUST equal persisted slot at Confirm Parked;
       RETURNED_TO_SLOT only)

IF ValetSession.key_slot_id == NULL
   -> NEW DEC-068 post-Parking binding mode
```

Do NOT add:

- a workflow-version column;
- a migration;
- a legacy flag;
- a new lifecycle state.

Persisted `key_slot_id` null/non-null is sufficient. A legacy session whose
erroneous assignment was cleared through the accepted correction command
simply becomes an unbound session and follows the new mode; this is truthful
and safe.

## 15. Confirm Parked atomicity

Confirm Parked remains ONE indivisible protected transaction. For the NEW
path the all-or-nothing effect set is:

1. `ValetSession.key_slot_id` bound to the resolved slot;
2. `parking_zone_id` / `parking_spot_id` assigned;
3. ValetSession `PARKING -> PARKED` with `parked_at`;
4. ValetSession version increment (exactly once);
5. Parking Task `IN_PROGRESS -> COMPLETED` with version increment
   (exactly once, assignee unchanged);
6. tracking stopped as required today;
7. `KeyCustodyEvent(SLOT_ASSIGNED)` and
   `KeyCustodyEvent(RETURNED_TO_SLOT)` appended exactly once each;
8. `DispatchEvent(COMPLETED)` appended;
9. `AuditEvent(VALET_SESSION_KEY_SLOT_ASSIGNED)` appended;
10. `AuditEvent(VALET_SESSION_PARKED)` appended.

Forbidden partial states extend DEC-037 §24 symmetrically: slot binding
committed without parked state, `RETURNED_TO_SLOT` committed without
`SLOT_ASSIGNED` on the new path, either custody event committed without both
projections, or Dispatch/Audit committed without the protected mutations.
The legacy path effect set is the existing DEC-065-amended set, unchanged.

## 16. Locking / authorization / optimistic concurrency invariants

Operation order inside the single Confirm Parked transaction preserves the
accepted DEC-037 §25 / DEC-065 §15 ordering and inserts the Key Slot
resolution where it already sat relative to the Spot (before it):

1. authenticate Staff principal;
2. lock the target ValetSession row;
3. resolve the acting OrganizationMembership from persisted data;
4. resolve and lock the active IN_PROGRESS PARKING Task;
5. prove current Task assignee + DEC-032 operational eligibility;
6. resolve, verify, and lock the Key Slot (branch-dependent: legacy equality
   verification, or new-path availability/binding resolution);
7. resolve and lock the selected ParkingSpot and derived Zone; prove Spot
   occupancy;
8. guarded dual-version mutations, tracking stop, custody/dispatch/audit
   appends;
9. commit.

No mutation occurs before operation-specific authority (and, on the new
path, the availability proof) is established. Dual optimistic versions keep
`VERSION_CONFLICT` precedence ahead of state/resource detail for an
authorized pair. Authorization-before-mutation holds for retry/re-read paths
as today: possession of a session UUID or of a resource code never confers
authority, and refresh/recovery reads re-prove their own authorization.

## 17. Audit / Black Box semantics

For the NEW normal-path binding, Confirm Parked appends BOTH existing
semantic Audit events inside the SAME transaction:

1. `VALET_SESSION_KEY_SLOT_ASSIGNED`
2. `VALET_SESSION_PARKED`

Both use the same database-authoritative Confirm Parked operation time,
unless an existing accepted audit contract strictly requires otherwise.
Existing event types and the existing audit writer abstraction are reused;
NO new audit event type is introduced. Metadata stays narrow and safe
(e.g., taskId, resolved/current keySlotId, zoneId/spotId, state/version
transitions); no secrets, credentials, proofs, raw request bodies, GPS
values, or sensitive PII. The purpose is explicit Black Box evidence that
this actor/session bound THIS slot and that the combined parking
confirmation then committed.

Legacy Confirm Parked must not double-append a slot-assignment audit: its
assignment was already recorded by the original assign command
(`VALET_SESSION_KEY_SLOT_ASSIGNED`), so legacy Confirm Parked appends only
`VALET_SESSION_PARKED`, exactly as accepted.

## 18. Dispatch / tracking continuity

Unchanged. The Parking Task lifecycle remains
`QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED`; Confirm Parked
still appends `DispatchEvent(COMPLETED)` with the accepted structural shape;
configured task-scoped tracking still stops on PARKED. Start Parking still
starts tracking when enabled, with or without a bound slot.

## 19. Retrieval continuity

Unchanged commands, unchanged guards. After a new-path Confirm Parked, the
session has non-null `key_slot_id` and `parking_spot_id` and an ACTIVE bound
slot, which is exactly what Start Retrieval requires; retrieval checks the
key out of the bound slot (`CHECKED_OUT`) and clears the spot while keeping
the home-slot assignment, exactly as today. After retrieval, `CHECKED_OUT`
is the latest custody event, which is what the release-time custody proof
consumes. Guest retrieval requests, cancellation safety, duplicate-request
protection, and Retrieval Task lifecycle are untouched.

## 20. Handoff / release continuity

Unchanged. Release still requires an unconsumed verified handoff proof, the
latest custody event to be `CHECKED_OUT` against the session's still-bound
slot, and completion nulls `key_slot_id` and appends `RELEASED`. The new
canonical sequence terminates correctly in that proof.

## 21. Dashboard continuity

No Dashboard redesign is required. Key accountability derives holder state
from the current `valet_sessions.key_slot_id` and remains derivable: under
the new model a slot shows as held from the moment the key is physically
deposited (Confirm Parked commit) until release — which is MORE physically
truthful than the legacy model, where a slot appeared occupied from
assignment even while the key was physically in the employee's pocket during
the entire drive. During PARKING an unbound session occupies no slot, and
the cabinet view correctly shows the slot free. Daily activity reporting
counts custody events by type and window and remains accurate under the new
event distribution (one fewer `CHECKED_OUT` per new-path parking).

## 22. Guest privacy

Unchanged and absolute: no exact Key Slot information (ID, code, or
existence) may ever appear on Guest surfaces. The submitted/bound slot
remains staff-only operational data. Existing guest responses expose no such
detail today and must continue not to.

## 23. Employee UI direction

- Check-In has NO key-slot step on the normal path; the `key-scan` /
  `key-assigned` steps disappear from the normal flow, and hydration treats
  NULL-slot `AWAITING_PARKING` as ready for the Parking Task step.
- Parking flow order: Parking Spot first; then place the key into a free
  physical slot; scan QR or use manual code entry (manual fallback visible
  and operable in EVERY state, including camera failure states); then
  Confirm Parked.
- There is NO availability-list picker and NO "available key slots"
  endpoint. The employee is physically standing at the cabinet, chooses a
  visibly free physical slot, deposits the key, and scans that slot; the
  server remains final authority at Confirm Parked time.
- EN/AR with proper RTL continues; operational codes remain visually LTR
  isolated (`bdi dir="ltr"` conventions). Copy direction for the lost-race/
  unavailable context: English "This key slot is no longer available. Scan
  another slot."; Arabic meaning "هذه الخانة لم تعد متاحة. امسح خانة أخرى."
  Exact final strings remain owned by Employee i18n implementation later;
  this decision locks meaning and direction, not byte-level phrasing.
  Pre-parking "assigned key slot" framing disappears from the normal
  parking flow.

## 24. Camera / QR boundary

DEC-067 remains fully binding mechanically: same scanner mechanism, payload
grammar (`vaylet:key-slot:<RESOURCE_CODE>`), permission UX states,
MediaStream lifecycle cleanup, duplicate-decode suppression, and mandatory
manual fallback. A decoded value ONLY fills the existing input of the
current step; scanning grants no authority and performs no mutation by
itself; the employee still performs the explicit Confirm Parked action and
the server re-proves everything. Prototype simulate buttons remain
prototype-gated.

## 25. Error semantics

Reuse the existing stable public error:

```text
KEY_CUSTODY_NOT_READY -> HTTP 409
```

No new public API error code is added. On the new path this error covers:
unknown/wrong code, inactive slot, wrong Organization/Location scope, slot
currently occupied by another session, and the lost same-slot race. It is
intentionally non-disclosing: no protected occupant/session or resource
existence detail leaks. All such failures produce zero side effects
(verification/resolution happens inside the single transaction before all
mutations). Existing cross-cutting errors (`VERSION_CONFLICT`,
`INVALID_STATE_TRANSITION`, `TASK_INVALID_STATE`,
`TASK_NOT_FOUND_OR_FORBIDDEN`,
`PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE`, authorization/eligibility denials)
keep their accepted meanings and precedence.

## 26. Offline/retry behavior

DEC-063 remains fully binding: no fake success, no persisted mutation queue,
no Background Sync, no automatic replay. Confirm Parked remains
REHYDRATE_BEFORE_RETRY. Selected Parking Spot / Key Slot codes may exist
only as transient in-memory input until Confirm Parked succeeds; if the
device dies before submission, nothing was committed and the existing
rehydration/recovery flow restarts the confirmation safely. A lost same-slot
race surfaces as a calm localized retry instruction (section 23); retry after
that conflict is simply a fresh Confirm Parked with refreshed versions and a
different slot.

## 27. Persistence / migration freeze

DEC-068 requires and permits NONE of the following:

- no Prisma schema change;
- no migration;
- no new table;
- no new column;
- no new enum value;
- no new mutable custody/custody-status field anywhere;
- no duplicate Key Slot occupancy projection.

The repository remains at its then-current forward-only migration count.
The existing nullable `valet_sessions.key_slot_id`, the partial uniqueness
enforcement over it, KeySlot persistence, the `KeyCustodyEvent` enum
(`SLOT_ASSIGNED`, `CHECKED_OUT`, `RETURNED_TO_SLOT`, `SLOT_CLEARED`,
`RELEASED`), the slot-required check constraint, and AuditEvent persistence
are sufficient to represent both modes truthfully.

## 28. Explicit supersession map

DEC-068 supersedes/amends exactly the following, and leaves all other
clauses of the listed decisions binding as written.

### DEC-033 — Key Assignment & Custody Commands

Amended: the framing that treats current Key Slot assignment as a mandatory
precondition of the later Parking commands — specifically §13's description
of VAL-005F/VAL-005G checkout/return as operating against "the assigned
slot" for every session — now describes the LEGACY/preassigned branch only.

Kept fully binding: the assign/clear command contracts themselves (they
remain available administrative/legacy/correction capabilities; DEC-068 does
not delete the API merely because the normal Employee flow stops calling
assign), exact-code/scoping rules, state/version guards, optimistic
concurrency, append-only custody model, and the reusable custody primitives.

### DEC-036 — Start Parking

Amended: §10 error precedence (KEY_CUSTODY_NOT_READY applies only when a
slot IS bound), §11 (mandatory non-null Key Slot readiness), §13
(unconditional CHECKED_OUT), §19 atomic-effect item 6 and related effect
enumerations (CHECKED_OUT becomes branch-conditional), §20 lock-order step
for the slot (applies when a slot is bound), §24 error-contract wording, §26
required-proof wording, and §28 required proofs tied to mandatory
preassignment.

New rule: `key_slot_id` NULL ⇒ Start Parking proceeds with no slot-specific
custody event; `key_slot_id` non-null (legacy) ⇒ existing slot validation +
CHECKED_OUT behavior remains exactly as accepted.

### DEC-037 — Confirm Parked

Amended: §11 error precedence (KEY_CUSTODY_NOT_READY widened on the new path
to cover resolution/availability/lost-race outcomes), §12 (key readiness
requiring an already-persisted assignment), §13 ("current KeySlot remains
assigned" — true for legacy; on the new path the binding is CREATED here),
§18 (RETURNED_TO_SLOT-only assumption — the new path also appends
SLOT_ASSIGNED), §24 atomicity list (branch-aware effect set), §33 required
proofs. Guarded key-slot equality assumptions apply to the legacy branch
only; the new path may bind the slot inside the transaction.

Kept fully binding: route/request/response shapes, dual versions, Spot/Zone
resolution and occupancy protection, authorization, lock ordering, shared
operation time, Dispatch/Audit contracts, retry posture, error concealment.

### DEC-038 — Phase 3 Gate

Amended: §5 canonical composed flow (the unconditional "assign current
KeySlot" step 1 becomes legacy-only) and §11 (the Phase 3 custody proof
requiring the old `SLOT_ASSIGNED -> CHECKED_OUT -> RETURNED_TO_SLOT` triple
for EVERY session). Required proof becomes branch-aware: new normal-path
sessions prove the DEC-068 sequence; preassigned-session behavior remains
covered by the original sequence as regression.

### DEC-065 — Verified Key Return During Confirm Parked

This requires the clearest amendment. PRESERVED for all sessions: physical
return requires scanned/entered evidence; trim-only exact-code semantics;
same-transaction verification before any mutation; no standalone key-return
endpoint; no new lifecycle state; no schema/status columns; no Guest
exposure; atomic Confirm Parked; transient in-memory Parking Spot/Key Slot
values per DEC-063.

SUPERSEDED for NEW sessions (`key_slot_id == NULL`): §6 step 4 (resolved
slot MUST equal the persisted assignment — replaced by availability/binding
resolution); §8 STRICT FAIL because the DESIGNATED slot is unavailable
(there is no designated slot on the new path; occupied/inactive/wrong-scope
chosen slots fail closed via section 25 instead, and no silent reassignment
of another session's slot occurs); §9 normal-flow narrative including
"Return key to {preassigned code}"; §10's pre-parking "Assigned key slot" /
"Return key to {code}" copy direction for the normal path; §13's
unconditional canonical history order; and the corresponding §16 proofs.

LEGACY sessions (non-null persisted slot) remain governed by this decision's
equality-verification behavior in full.

### State machine documentation

`docs/04_VALET_SESSION_STATE_MACHINE.md` guard wording is updated so
`AWAITING_PARKING -> PARKING` does not require a Key Slot for new sessions
while retaining task-ownership, eligibility, version, and all other non-key
guards; and `PARKING -> PARKED` key-custody readiness is expressed
branch-aware per sections 6–14 of this decision.

### Not superseded

DEC-031, DEC-032, DEC-034, DEC-035, DEC-042, DEC-043, DEC-052, DEC-063,
DEC-066 and DEC-067 remain binding unchanged. DEC-067's capture architecture
composes with the new flow without modification of its mechanism or payload
rules; the capture surface descriptions evolve through normal implementation
of this decision rather than by rewriting DEC-066/067.

## 29. Required implementation proof/tests

Future implementation must prove at minimum:

1. Check-In reaches the Parking Task step without any Key Slot assignment
   call; hydration treats NULL-slot `AWAITING_PARKING` as parking-ready.
2. NEW Start Parking succeeds with `key_slot_id` NULL; versions advance
   exactly once; `parking_started_at` is server-authored.
3. NEW Start Parking emits NO `CHECKED_OUT` (and no other custody event).
4. Legacy Start Parking still validates the assigned ACTIVE same-scope slot
   and emits exactly one `CHECKED_OUT`.
5. New Confirm Parked binds a genuinely free slot and sets zone/spot/
   `parked_at`, completing the Task.
6. `SLOT_ASSIGNED` + `RETURNED_TO_SLOT` are written exactly once each for
   the new path, bound to the resolved slot, actor, and shared DB time,
   in deterministic order.
7. `VALET_SESSION_KEY_SLOT_ASSIGNED` + `VALET_SESSION_PARKED` audits are
   written atomically on the new path; legacy Confirm Parked does not
   double-append the assignment audit.
8. Occupied slot fails with zero side effects (full projection + event-diff
   assertion).
9. Inactive slot fails with zero side effects.
10. Unknown / wrong-location / wrong-organization slot codes fail concealed
    with zero side effects.
11. Same-slot concurrent race: exactly one winner; loser receives
    `KEY_CUSTODY_NOT_READY` and commits zero session/task/custody/dispatch/
    audit/tracking effects.
12. Duplicate Confirm Parked for one session stays safe
    (`VERSION_CONFLICT`, no duplicate events).
13. Shift-end / eligibility-loss races converge safely (existing DEC-037
    §26 posture preserved on the new path).
14. Parking Spot race protection is preserved unchanged.
15. Retrieval works after the new path (request → accept → start: slot kept,
    spot cleared, `CHECKED_OUT` emitted from the bound slot).
16. After retrieval, `CHECKED_OUT` is the latest custody event.
17. Handoff release works after the new path: latest-event proof passes,
    `RELEASED` appended, slot nulled at completion.
18. Legacy path remains backward compatible end-to-end (assignment →
    checkout → verified-equality return → retrieval → release).
19. Dashboard key accountability remains correct for both modes; daily
    activity custody counts remain accurate.
20. Guest surfaces never expose Key Slot detail (privacy gate re-run).
21. Employee EN/AR/RTL correctness for all new/changed copy, with LTR-
    isolated codes.
22. Camera QR + manual fallback both fill only the slot input; decode alone
    mutates nothing.
23. Real web smoke: Check-In → Start Parking → scan Spot → scan free Key
    Slot → Confirm Parked, executed through production routes/UI.

Plus the standing gates: migrations/schema byte-for-byte unchanged, no
dependency/lockfile changes, architecture/300-line policy green, lint/
typecheck/test/build/Prisma validation green.

## 30. Consequences / trade-offs

- The Employee parks faster: one cabinet visit instead of two; check-in
  loses a step entirely.
- `parked_at` reflects combined-commit time (already the accepted DEC-065
  MVP trade-off); the slot-selection dwell adds seconds, not minutes. A
  future parked-notification decision owns any earlier-signal need.
- Between Start Parking and Confirm Parked the system truthfully knows
  NOTHING about which cabinet slot will hold the key — matching physical
  reality. Operational visibility during that window rests on task
  ownership/tracking, as accepted.
- The assign/clear endpoints persist but drop out of the normal Employee
  happy path; they remain for administrative/correction/legacy support.
- Test/gate churn is real but bounded: the Phase 3 gate, Start/Confirm
  suites, e2e lifecycle spec, and demo fixtures gain branch-aware variants.
- Custody history gains a second legitimate shape; every consumer that
  interprets history has been inventoried (release proof, report counting)
  and is order-safe for both shapes.

## Reason

Physical custody truth should record what actually happens: the key rides
with the employee until it is deposited. Binding the slot at deposit time —
inside the already-atomic Confirm Parked transaction, protected by the
existing uniqueness and locking machinery — removes a mandatory cabinet
trip, eliminates reservation complexity, keeps append-only history truthful
in both modes, and requires zero persistence change.

## Affected docs/code

Docs modified by this decision:

- `docs/decisions/DEC-068_POST_PARKING_KEY_SLOT_BINDING.md` (new)
- `docs/decisions/DEC-033_KEY_ASSIGNMENT_CUSTODY_COMMANDS.md` (notice only)
- `docs/decisions/DEC-036_START_PARKING.md` (notice only)
- `docs/decisions/DEC-037_CONFIRM_PARKED.md` (notice only)
- `docs/decisions/DEC-038_PHASE3_API_INTEGRATION_EMPLOYEE_OPERATIONS_GATE.md` (notice only)
- `docs/decisions/DEC-065_VERIFIED_KEY_RETURN_DURING_CONFIRM_PARKED.md` (notice only)
- `docs/04_VALET_SESSION_STATE_MACHINE.md` (guard wording)
- `docs/08_DECISIONS_LOG.md` (canonical summary entry)

Future implementation areas (NOT modified by this decision):
`apps/api/src/modules/parking/**`, `apps/api/src/modules/keys/**`,
`packages/contracts/src/confirm-parked.ts` (semantics/comments only if
needed), `apps/valet/src/features/check-in/**`,
`apps/valet/src/features/parking/**`,
`apps/valet/src/components/screens/check-in/**`,
`apps/valet/src/components/screens/parking-*.tsx`,
`apps/valet/src/lib/i18n/dictionary-*`, focused integration/e2e tests, and
demo seed fixtures.
