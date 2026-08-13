# DEC-043 — Vehicle Release & Session Completion

Status: Accepted
Date: 2026-08-14
Task: VAL-006G — Vehicle Release + Session Completion

## Context

VAL-006F / DEC-042 leaves a successfully verified handoff in
`HANDOFF_PENDING`, with the Retrieval Task still `IN_PROGRESS`, the
RetrievalRequest still `ACCEPTED`, and the authoritative HandoffVerification
verified but unconsumed. The existing transaction-aware
`lockReleaseEligibleHandoffVerification(...)` boundary re-evaluates current
Standard-method policy and expiry but intentionally performs no release write.

VAL-006G owns the final physical-custody boundary. Existing persistence already
supports every required terminal projection and history fact, so completion
must compose those records atomically rather than introduce duplicate storage.

## Decision

### 1. Command and API boundary

VAL-006G adds one explicit staff command:

```text
POST /v1/staff/valet-sessions/:sessionId/complete-handoff
```

Its strict request body contains only:

```json
{ "expectedSessionVersion": 9 }
```

The command accepts no client-selected tenant, Location, actor, membership,
role, Shift, Vehicle, Task, RetrievalRequest, HandoffVerification, KeySlot,
handoff-method, payment, validation, or incident authority.

The successful response is a narrow operational projection containing only
session ID/state/version, Task ID/status/version, and RetrievalRequest status.
It exposes no handoff material/verifier, KeySlot detail, guest bearer, tenant
internals, or Audit metadata.

### 2. Final release authority

Final vehicle release is an ordinary protected field operation. The actor must
be an authenticated active User whose persisted scope proves all of:

- active OrganizationMembership in the session Organization;
- active Organization and exact active Location;
- explicit access to that exact Location;
- role `VALET_EMPLOYEE` or `VALET_SUPERVISOR`;
- ACTIVE Shift at that exact Location;
- canonical ownership of the authoritative Retrieval Task through
  `Task.current_assignee_membership_id`;
- Task status exactly `IN_PROGRESS`.

Authentication precedes the command. Inside the transaction, authorization
order is tenant membership, exact Location operational eligibility, Task
ownership/field authority, expected session version, then lifecycle/release
guards. Cross-tenant, wrong-Location, inactive/ineligible, and non-owner access
remains concealed through `TASK_NOT_FOUND_OR_FORBIDDEN`.

`LOCATION_MANAGER` and `ORG_ADMIN` receive no implicit field-release authority.
A `SUPERVISOR_OVERRIDE` substitutes only for Standard guest proof. It does not
grant physical-release authority to the supervisor who created it. If the
current Task owner is unavailable, existing audited Dispatch reassignment must
establish a new canonical owner before release.

### 3. Required locked lifecycle

Before any release mutation, one transaction must lock ValetSession first and
derive the authoritative related records from persisted scope. It requires:

- ValetSession exactly `HANDOFF_PENDING` with non-null `handoff_pending_at`;
- matching `expectedSessionVersion`;
- authoritative Retrieval Task exactly `IN_PROGRESS`, owned by the actor;
- authoritative active RetrievalRequest exactly `ACCEPTED`;
- a release-eligible HandoffVerification from the DEC-042 release guard;
- a non-null current KeySlot in the same Organization and Location;
- current custody history coherently ending in `CHECKED_OUT` for that KeySlot.

Missing or inconsistent key/custody state fails closed with
`KEY_CUSTODY_NOT_READY`. Unsafe Task/Request/session states use the existing
safe Task, RetrievalRequest, state, and version errors. Release-ineligible proof
uses the existing non-disclosing `HANDOFF_VERIFICATION_FAILED` boundary.

### 4. Handoff proof is re-evaluated at release

The command must call `lockReleaseEligibleHandoffVerification(...)` in the same
transaction as final release.

A Standard proof must remain verified, unconsumed, unexpired at the one
database-authoritative operation time, same-tenant/session scoped, and allowed
by the current effective Company-default/Location-override method policy. A
policy change after verification fails closed.

A valid verified unconsumed `SUPERVISOR_OVERRIDE` remains release-eligible and
is not invalidated by Standard-method policy. The command never reproduces or
bypasses the DEC-042 release guard.

### 5. Atomic successful release

One transaction and one database-authoritative operation time must perform all
of these effects or none:

1. consume exactly the selected HandoffVerification by setting
   `consumed_at = operationTime`;
2. append one `KeyCustodyEvent(RELEASED)` with the actual current KeySlot,
   releasing Task-owner membership, and `occurred_at = operationTime`;
3. clear `ValetSession.key_slot_id` without appending a false `SLOT_CLEARED`
   correction fact;
4. change RetrievalRequest `ACCEPTED -> COMPLETED`;
5. change Retrieval Task `IN_PROGRESS -> COMPLETED`, retain the final current
   assignee, and increment `Task.version` exactly once;
6. append one `DispatchEvent(COMPLETED)` with the releasing actor/current
   assignee and the same operation time;
7. change ValetSession `HANDOFF_PENDING -> COMPLETED`, set `completed_at` and
   `completed_by_membership_id`, and increment `ValetSession.version` exactly
   once;
8. preserve every earlier lifecycle timestamp and immutable history row;
9. append distinct `VALET_SESSION_VEHICLE_RELEASED` and
   `VALET_SESSION_COMPLETED` AuditEvents with narrow safe state/version and
   related-record identifiers only.

The two AuditEvents contain no raw pickup code, QR payload, verifier/HMAC,
guest bearer, Authorization value, password, secret, or arbitrary request data.

### 6. Conditional writes and terminal behavior

Final writes remain conditional on their accepted source rows:

- verification is still verified and unconsumed;
- RetrievalRequest is still `ACCEPTED`;
- Task still has the expected version, remains `IN_PROGRESS`, and is still
  assigned to the releasing membership;
- ValetSession still has the expected version, remains `HANDOFF_PENDING`, and
  still references the locked current KeySlot.

`COMPLETED` is terminal. A stale retry cannot duplicate release, Dispatch,
custody, or Audit history. A refreshed retry also fails because the accepted
source lifecycle no longer exists. No transparent replay/idempotency key is
introduced; session version/state and locked conditional writes define retry
behavior.

The released KeySlot becomes available through the cleared current projection,
while `RELEASED` remains the terminal historical custody fact. The completed
Task retains its final responsible assignee.

### 7. Concurrency contract

Lock order begins with ValetSession, then actor operational authority and the
authoritative Task, RetrievalRequest, HandoffVerification/policy, and custody
resources in a consistent command order. The ValetSession lock serializes
release against release and abort.

- concurrent release attempts have at most one winner;
- release versus abort has one winner and the loser re-evaluates committed
  state/version;
- policy rows are locked through the DEC-042 release guard so release respects
  the policy value participating in its transaction;
- verification consumption and every terminal projection/history write share
  the same transaction;
- Audit, custody, Dispatch, or conditional-write failure rolls back everything.

### 8. Payment, validation, and incident boundary

The current repository has persistence foundations but no Accepted executable
typed release-blocking payment/validation or incident guard. VAL-006G therefore
does not infer release policy from arbitrary `Payment.status` values, does not
invent an OPEN-incident blanket rule, and adds no financial/incident writes or
configuration columns.

When a later owning phase accepts and implements a typed release-blocking
policy/guard, that guard composes at this final command boundary. This deferral
is not permission to bypass such a guard once it exists.

### 9. Persistence impact

No Prisma schema change and no migration are required. Existing ValetSession,
Task, RetrievalRequest, HandoffVerification, KeyCustodyEvent, DispatchEvent,
and AuditEvent persistence is sufficient. Migrations 1–22 remain immutable.

No completion timestamps are added to Task or RetrievalRequest, and no second
release/custody/status/version/policy persistence is introduced.

### 10. Explicit exclusions

VAL-006G does not implement receipts, ratings, payment collection, validation,
tips, cash, refunds, incident lifecycle, provider messaging, completed
notification delivery, Maps/GPS/tracking, geofences, offline replay, UI/PWA,
Dashboard, ClaimShield, VAYLET Qualified, enhanced handoff policies, or a
generic release-policy engine. VAL-006H owns the composed Phase-4 E2E gate.

## Consequences

The physical custody aggregate, Retrieval operation, secure proof, current key
occupancy, and append-only history close in one fail-closed transaction. Proof
policy remains current at release, canonical Task ownership remains the only
field-release authority, and later financial/incident policy can compose at one
explicit boundary without being invented in Phase 4.
