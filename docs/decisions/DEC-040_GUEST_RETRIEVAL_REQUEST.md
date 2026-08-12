# DEC-040 — Guest Retrieval Request + Duplicate Protection

Status: Accepted  
Date: 2026-08-13  
Issue: #134 (`VAL-006B — Guest Retrieval Request + Duplicate Protection`)

## Context

Phase 4 starts from the completed Phase 3 Operations baseline and Accepted DEC-039. The repository already has the canonical `PARKED -> REQUESTED` transition, `RetrievalRequest`, `Task(type = RETRIEVAL)`, append-only `DispatchEvent` / `AuditEvent`, Guest Access bearer resolution, durable guest anti-abuse, and runtime access to the Phase-4 persistence.

VAL-006B must implement the Blueprint-required guest Retrieval request without creating a second dispatch system or moving unrelated Retrieval phases forward.

Repository review proved one real persistence mismatch:

- intake intentionally permits `ValetSession.customer_id = NULL`;
- Guest Access authenticates directly to a ValetSession and does not require a Customer row;
- the current RetrievalRequest requester CHECK requires every `CUSTOMER` request to have `requested_by_customer_id`.

A valid Guest Access bearer can therefore identify a legitimate parked session that the current CHECK would reject from requesting Retrieval. Creating a synthetic Customer would contradict the accepted optional-customer intake contract.

## Decision

### 1. Scope of VAL-006B

VAL-006B implements exactly one guest-originated command: `request-retrieval`.

The winning first request atomically owns:

- guest authority resolution through the existing Guest Access boundary;
- `PARKED -> REQUESTED`;
- server-authored `retrieval_requested_at`;
- one `RetrievalRequest(status = OPEN)`;
- one `Task(task_type = RETRIEVAL, status = QUEUED)`;
- one `DispatchEvent(QUEUED)`;
- one `AuditEvent(RETRIEVAL_REQUESTED)`;
- duplicate/concurrency protection;
- guest-safe current progression response;
- composition with the existing guest anti-abuse boundary.

It does not assign, accept, decline or reassign the Retrieval Task. Those remain VAL-006C.

### 2. Migration 21 is required and narrow

VAL-006B adds exactly one new forward-only migration after the current 20 migrations.

Migration 21 changes only `retrieval_requests_requester_consistency_check`. It adds no table, column or enum and does not rewrite migrations 1–20.

Accepted requester semantics are:

```text
CUSTOMER:
  requested_by_membership_id IS NULL
  requested_by_customer_id MAY be NULL

STAFF:
  requested_by_customer_id IS NULL
  requested_by_membership_id IS NOT NULL
```

When a CUSTOMER-originated request has a non-null Customer ID, the existing same-Organization FK remains authoritative. The command copies `ValetSession.customer_id` when present and never accepts a Customer ID from guest input.

No synthetic Customer is created merely to satisfy RetrievalRequest attribution.

`CUSTOMER` is therefore the external guest/customer request origin classification; existence of a persisted Customer entity is optional attribution, not authentication authority.

### 3. Canonical guest route

The route is:

```text
POST /v1/guest/session/request-retrieval
```

The route stays under the existing bearer-owned guest session namespace and accepts no session UUID as routing authority.

No alternate guest Retrieval route is introduced by VAL-006B.

### 4. Request transport

The request requires:

- exactly one shape-valid existing Guest Access bearer in `Authorization`;
- strict empty JSON body `{}`;
- no query parameters;
- existing bounded request-ID behavior;
- `Cache-Control: no-store` on the guest boundary.

The guest does not supply ValetSession, Organization, Location, Customer, Task, RetrievalRequest, expected-version, actor, priority, KeySlot, Zone or Spot authority.

All operational scope is derived from persisted state resolved through the bearer.

### 5. Guest authority remains session-bound

A valid Guest Access credential is sufficient authority to identify its own ValetSession even when `session.customer_id` is null.

The protected resolution used by Retrieval derives from persistence at least:

- ValetSession ID;
- Organization ID;
- Location ID;
- current state/version;
- nullable Customer ID;
- guest-safe vehicle projection.

The raw bearer or its verifier is never copied into RetrievalRequest, Task, DispatchEvent, AuditEvent, logs, metrics or traces.

### 6. Existing anti-abuse contract is reused

The POST shares the existing DEC-024 guest limiter scopes and quotas with `GET /v1/guest/session`:

```text
v1:guest-client-address
60 failed guest-authentication attempts / 15 minutes

v1:guest-token
180 shape-valid bearer presentations / 15 minutes
```

GET and POST presentations aggregate into the same token-key quota. VAL-006B does not create a parallel limiter namespace that doubles the credential budget.

Authenticated business-rule failures are not guest-authentication failures and therefore finalize the address reservation as `IGNORED`.

Missing/malformed/duplicate bearer handling, trusted-client-address derivation, 429/503 behavior and fail-closed semantics remain those of DEC-024.

A Retrieval success must not commit if required authenticated anti-abuse success-finalization cannot commit authoritatively.

### 7. First request transaction

For a shape-valid authenticated guest, the command locks the authoritative ValetSession before deciding first request versus semantic retry.

A first mutation requires persisted state exactly `PARKED`.

Using one server/database-authored operation timestamp, the same transaction:

1. inserts one RetrievalRequest with `requested_by_type = CUSTOMER`, nullable copied `session.customer_id`, null membership requester, `OPEN`, and server-authored request time;
2. inserts one `RETRIEVAL` Task as `QUEUED`, unassigned, version 1;
3. appends one `DispatchEvent(QUEUED)` with null guest actor membership and no invented assignee/reason;
4. changes ValetSession to `REQUESTED`, sets `retrieval_requested_at`, updates `updated_at`, and increments session version exactly once;
5. appends one `RETRIEVAL_REQUESTED` AuditEvent;
6. finalizes the authenticated address anti-abuse reservation to `IGNORED` in the authoritative transaction;
7. commits before returning guest progression.

Any failure rolls back the session/request/task/dispatch/audit mutation together.

### 8. Guest Audit / Dispatch actor semantics

Guest/Customer is not an OrganizationMembership.

For the winning guest request:

```text
AuditEvent.actor_membership_id = NULL
DispatchEvent.actor_membership_id = NULL
```

The AuditEvent uses the ValetSession as entity and safe non-secret metadata such as guest actor type, from/to state, from/to version and requester type.

No raw bearer, token verifier, phone/contact value, KeySlot, Zone/Spot or internal assignment data enters audit metadata.

The existing custody-audit writer may be narrowly generalized to nullable actor membership, or Retrieval may use a focused safe writer. A fake staff membership is forbidden.

### 9. Duplicate prevention and serialization

The ValetSession row lock is the primary command serialization boundary.

Existing database protections remain the final backstops:

- one active RetrievalRequest while status is `OPEN` or `ACCEPTED`;
- one active RETRIEVAL Task for the ValetSession under the accepted Task active-status rule.

The request/task pair is created in the same transaction as the Session transition. UI button disabling or an unlocked pre-insert existence check is never treated as duplicate protection.

### 10. Semantic retry

A repeated authenticated guest press is a successful non-mutating retry when the persisted Retrieval lifecycle is coherent.

For `REQUESTED`, there must be exactly one expected active RetrievalRequest and one expected active RETRIEVAL Task.

The retry returns the current guest-safe session projection with HTTP 200 and does not:

- change Session version;
- change `retrieval_requested_at`;
- insert another RetrievalRequest or Task;
- append another `RETRIEVAL_REQUESTED` AuditEvent;
- append another `QUEUED` DispatchEvent.

No client idempotency key or expected session version is required for this button-press retry contract.

### 11. Later stale guest presses

For a coherent already-started Retrieval lifecycle in `RETRIEVING`, `READY` or `HANDOFF_PENDING`, a stale/repeated request-retrieval POST is a non-mutating current-progression read and returns HTTP 200.

`COMPLETED` is terminal and also returns the current guest-safe progression without creating work.

This behavior never moves a session backward and does not authorize a new lifecycle after cancellation. A new request after cancellation is valid only after a separately accepted cancellation flow has returned the Session to `PARKED` and removed active Retrieval work coherently.

### 12. Incoherent lifecycle fails closed

VAL-006B does not silently repair partial or impossible persistence, including:

- `REQUESTED` with request but no expected Retrieval Task;
- `REQUESTED` with Task but no active RetrievalRequest;
- mismatched tenant/session scope;
- impossible multiple active rows;
- `PARKED` with unexplained active Retrieval work.

These are integrity failures. The guest receives only the normal safe internal failure boundary; row/constraint details are not disclosed.

### 13. Error precedence

For transport-valid requests, public precedence remains:

1. DEC-024 anti-abuse unavailable/rate-limit behavior;
2. invalid guest credential -> `GUEST_ACCESS_INVALID`;
3. after authentication/session lock:
   - coherent current Retrieval lifecycle -> HTTP 200 current progression;
   - first valid `PARKED` request -> HTTP 200 after atomic mutation;
   - unsupported physical state with no coherent current lifecycle -> `INVALID_STATE_TRANSITION` / HTTP 409;
   - persistence inconsistency -> safe internal failure.

No response reveals whether an unrelated tenant/session/resource exists.

### 14. Guest response privacy

Success and semantic retry use the existing guest-safe session representation:

```text
valetSessionId
state
vehicle:
  make
  model
  color
```

VAL-006B does not expose RetrievalRequest ID, Task ID/version/status, assignee, Shift/member/user IDs, tenant/location IDs, key/parking internals, GPS, audit/dispatch internals or ranking/priority data.

### 15. No automatic assignment

The newly created Retrieval Task remains:

```text
status = QUEUED
current_assignee_membership_id = NULL
```

VAL-006C owns Retrieval assignment/acceptance/decline/reassignment through the existing Hybrid Dispatch model.

### 16. Architecture ownership

The repository's existing `apps/api/src/modules/retrieval/` boundary owns the new Retrieval business behavior.

Binding ownership is:

- `guest-access`: Guest Access credential issuance, revocation, resolution and reusable guest authentication boundary;
- `anti-abuse`: trusted-client-address and shared guest address/token quota machinery;
- `retrieval`: `request-retrieval` controller/service/command/business transaction;
- `dispatch`: shared Task/Dispatch persistence primitives and later Hybrid Dispatch assignment semantics;
- `parking`: remains PARKING-specific and is not a dependency of guest Retrieval.

The Retrieval feature may depend one-way on a narrow exported Guest Access resolution/authentication surface. Guest Access must not import Retrieval. Circular feature dependencies and ownership inversion are forbidden.

The public route may live under `/v1/guest/session/...` while its business/controller ownership is in Retrieval; URL namespace does not transfer business ownership to Guest Access.

### 17. Parking command must not be reused as Retrieval

`queue-parking-task-command.ts` is not a generic task queue primitive. It is coupled to staff identity, active Shift eligibility and `AWAITING_PARKING`.

VAL-006B must not call it, wrap it, spoof a staff actor, or weaken its guards.

To persist the required `Task(RETRIEVAL, QUEUED)` plus `DispatchEvent(QUEUED)`, implementation must either:

1. extract/reuse a genuinely generic narrow Dispatch persistence primitive that accepts already-authorized transaction/scope and preserves current invariants; or
2. add a focused Retrieval queue persistence unit that writes the existing shared Task/Dispatch schema without creating a second assignment system.

Any internal generic extraction must leave Phase 3 PARKING authorization, Shift guards, routes, errors and transaction behavior unchanged.

### 18. File-structure contract

DEC-030 and `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding.

Meaningful Retrieval behavior must not be appended to the legacy oversized `guest-access.controller.ts` or `guest-access-command.ts` files.

Prefer focused Retrieval controller/service/command/persistence responsibilities. Every new authored code file remains <=300 physical lines; existing <=300-line files remain <=300; grandfathered >300-line files do not grow.

Before implementation commit, the concrete file/module split must be reviewed for acyclic dependency direction.

### 19. Required regression proof

Tests must prove at minimum:

- simultaneous first presses yield one Session transition, one active RetrievalRequest and one active RETRIEVAL Task;
- exactly one request AuditEvent and one queue DispatchEvent are emitted for the first lifecycle;
- concurrent losers return current progression without duplicate work;
- Session version increments exactly once and `retrieval_requested_at` stays stable on retry;
- Migration 21 permits CUSTOMER origin with nullable Customer ID, preserves optional same-Organization Customer attribution, rejects CUSTOMER+membership, preserves STAFF requirements and existing FKs/active uniqueness;
- GET and POST share the same guest-token anti-abuse quota;
- authenticated business-state rejection does not consume the guest authentication-failure quota;
- anti-abuse failure/rate-limit does not mutate Retrieval state;
- raw bearer/IP/phone/contact data is absent from business history/public errors;
- full repository lint, architecture, typecheck, tests and build pass.

### 20. Explicitly out of scope

VAL-006B does not implement:

- staff-originated Retrieval request;
- pre-start cancellation;
- Retrieval assignment/acceptance/decline/reassignment;
- key checkout or `REQUESTED -> RETRIEVING`;
- GPS/maps/tracking;
- READY progression;
- messaging-provider delivery;
- handoff credential issuance/verification;
- vehicle release/session completion;
- payment/validation workflow;
- Dashboard/Employee/Guest UI;
- offline replay infrastructure;
- predictive/AI Retrieval.

## Consequences

- The guest Retrieval path matches the Blueprint and Phase-4 execution plan without fabricating Customer identity.
- One request maps to one coherent Session/RetrievalRequest/Task transaction.
- Duplicate/stale presses are guest-friendly and non-mutating.
- Guest privacy and existing anti-abuse semantics are preserved.
- Retrieval business logic lands in the existing Retrieval module instead of growing Guest Access.
- Hybrid Dispatch remains one shared Task system.
- Phase 3 PARKING-specific behavior remains unchanged.
- Migration 21 is a narrow compatibility correction, not a persistence redesign.

## Implementation boundary

Implementation may begin only after this Accepted decision is merged and mirrored in `docs/08_DECISIONS_LOG.md`.