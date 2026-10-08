# DEC-044 — Guest Pre-Start Retrieval Cancellation

Status: Accepted
Date: 2026-08-14
Task: VAL-006H — Phase 4 API / Integration / Guest + Employee E2E Gate

## Context

The binding Phase-4 plan requires the explicit early-cancellation path
`REQUESTED -> PARKED` when physical Retrieval has not started. Existing
persistence already supports terminal `CANCELLED` RetrievalRequest and Task
rows, `RetrievalRequest.cancelled_at`, and `DispatchEvent(CANCELLED)`, but no
production command currently composes those records.

This decision closes only that missing pre-start contract. It does not define
the separate `RETRIEVING -> PARKING` physical return-to-parking exception.

## Decision

### 1. Canonical route and authority

The canonical route is:

```text
POST /v1/guest/session/cancel-retrieval
```

Cancellation is owned by the current authorized Guest Access context for its
own ValetSession. During DEC-064 T1 rollout that context is exactly one
unconsumed legacy bearer or one current Guest Browser Session. The request body
is a strict empty JSON object and no session UUID is accepted as guest routing
authority. Post-`COMPLETED` Browser Session scope cannot cancel Retrieval.

The command accepts no client-supplied Organization, Location, Customer,
ValetSession, Task, RetrievalRequest, membership, assignee, expected version,
timestamp, reason, role, KeySlot, parking Spot or Zone authority.

The route reuses the existing Guest Access authentication and durable DEC-024
guest anti-abuse boundary used by `request-retrieval`, including exactly one
credential source, safe invalid-guest behavior, unchanged guest address/token
budgets, existing request-ID behavior, and `Cache-Control: no-store`.

Guest is not an OrganizationMembership. Guest-originated cancellation keeps
AuditEvent and DispatchEvent actor membership null.

### 2. Allowed lifecycle

Cancellation is valid only before physical Retrieval starts, with exactly this
authoritative lifecycle:

```text
ValetSession.state = REQUESTED
RetrievalRequest.status = OPEN
Retrieval Task.status IN (QUEUED, ASSIGNED, ACCEPTED)
```

Exactly one authoritative active RetrievalRequest and one authoritative active
`Task(type = RETRIEVAL)` must exist for the session. The Task must not be
`IN_PROGRESS`.

Once `start-retrieval` has committed `ValetSession.state = RETRIEVING`, early
cancellation is invalid. This decision does not authorize `RETRIEVING ->
PARKING` or any other post-start reset.

### 3. Locking and authoritative time

The command uses one PostgreSQL transaction and locks the ValetSession first.
It then derives and locks the authoritative RetrievalRequest and Retrieval Task
from persisted Organization, Location and session scope.

One database-authoritative operation timestamp is used for the request
cancellation timestamp, Task update, Dispatch history, session update and
AuditEvent.

### 4. Atomic successful effect

One successful cancellation transaction performs all of these effects or none:

1. change the RetrievalRequest `OPEN -> CANCELLED`;
2. set `RetrievalRequest.cancelled_at = operationTime`;
3. change the Retrieval Task `QUEUED | ASSIGNED | ACCEPTED -> CANCELLED`;
4. increment `Task.version` exactly once;
5. preserve `Task.current_assignee_membership_id` when one exists;
6. append one `DispatchEvent(CANCELLED)` with null Guest actor membership,
   persisted current assignee as `previous_assignee_membership_id` when present,
   null `new_assignee_membership_id`, and no invented reason;
7. change the ValetSession `REQUESTED -> PARKED`;
8. increment `ValetSession.version` exactly once;
9. preserve `retrieval_requested_at` and every other historical lifecycle
   timestamp;
10. append one `RETRIEVAL_CANCELLED` AuditEvent with null actor membership and
    narrow session/Task state-version, requester-type and safe related-ID
    metadata.

Audit metadata must not contain guest bearer material, credential verifier,
phone/contact data, raw address, authentication secret, KeySlot or exact
parking details, arbitrary headers or arbitrary request body content.

Cancellation does not mutate key custody. Before physical Retrieval starts,
the key remains in its existing PARKED custody.

Cancellation also does not mutate parking location, `ready_at`,
`retrieval_started_at`, handoff state or verification, payment, validation,
incident, messaging or notification state.

### 5. Semantic retry

A repeated cancellation after one successful cancellation is a guest-friendly
HTTP 200 non-mutating retry only when persistence proves a coherent just-
cancelled lifecycle:

```text
ValetSession.state = PARKED
no active RetrievalRequest
no active RETRIEVAL Task
the lifecycle identified by the preserved retrieval_requested_at has exactly
one terminal CANCELLED RetrievalRequest and one terminal CANCELLED Task
```

The retry returns the current guest-safe PARKED projection and does not change
versions, append history, create rows, or rewrite `cancelled_at`.

An incoherent PARKED or cancellation lifecycle fails closed rather than being
silently repaired.

### 6. Later re-request

After successful cancellation, a later ordinary guest call to:

```text
POST /v1/guest/session/request-retrieval
```

may create a new OPEN RetrievalRequest and a new QUEUED Retrieval Task. The old
cancelled Request, Task, Dispatch and Audit rows remain terminal history and are
never resurrected or rewritten. The new request writes the new lifecycle's
`retrieval_requested_at` value.

### 7. Concurrency

The ValetSession row lock is the primary serialization boundary.

For cancel versus cancel, at most one call mutates. A concurrent loser
re-evaluates the committed lifecycle as a semantic retry. Exactly one request
cancellation, one Task cancellation/version increment, one CANCELLED
DispatchEvent and one cancellation AuditEvent may commit.

For cancel versus start-retrieval, exactly one physical outcome wins:

- cancellation first leaves Session PARKED, Request CANCELLED and Task
  CANCELLED; start-retrieval re-evaluates the committed state and fails;
- start-retrieval first leaves Session RETRIEVING, Request ACCEPTED and Task
  IN_PROGRESS; cancellation re-evaluates the committed state and fails without
  resetting physical Retrieval.

Mixed states such as PARKED plus IN_PROGRESS, RETRIEVING plus a CANCELLED
request, or a cancelled Task plus a losing-start key checkout are forbidden.

### 8. Database boundary

No Prisma schema change and no migration are required. Existing persistence
already supports every accepted effect.

Migrations 1–22 remain byte-for-byte immutable. No migration 23, second
cancellation table, second Task state system, generic cancellation engine,
session enum, active flag or duplicate timestamp is introduced.

A narrow TypeScript extension allowing the already-persisted
`DispatchEventType.CANCELLED` is permitted.

If implementation proves an unavoidable missing database invariant, work must
stop for a new focused decision before changing schema.

### 9. Required proof

Implementation must prove at minimum:

- successful API cancellation from QUEUED, ASSIGNED and ACCEPTED;
- strict empty transport and real Guest Access/anti-abuse composition;
- exact Request/Task/Session mutations and version increments;
- current assignee preservation and correct CANCELLED Dispatch history;
- exactly one narrow cancellation AuditEvent;
- no key checkout, Retrieval start, handoff or release side effect;
- semantic retry without duplicate mutation/history;
- later re-request creates new active rows while retaining cancelled history;
- concurrent cancel versus cancel has one mutation winner;
- cancel versus start-retrieval leaves exactly one coherent persisted winner;
- representative required-history failure rolls the full transaction back;
- guest response and history contain no bearer, verifier, contact, address,
  Authorization or secret material;
- Prisma schema and migrations 1–22 remain unchanged.

## Consequences

Phase 4 now has the Blueprint-required pre-start escape path without weakening
physical Retrieval safety. The current mutable projections return coherently to
PARKED while cancelled operational history remains append-only and a later
Retrieval request starts a new lifecycle.

## Owner-approved U-07 / T3 amendment (2026-10-08)

See the canonical DEC-024 amendment and
[Guest T3 policy](../GUEST_T3_POLICY_AND_EVIDENCE.md). That amendment supersedes
historical Guest quota/allocation and address-reservation mechanics only for
T3 admission. It changes no credential, authorization, custody, business retry,
audit, foreground notification or handoff-proof contract in this decision.
