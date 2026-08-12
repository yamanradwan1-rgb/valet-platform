# DEC-040 — Guest Retrieval Request + Duplicate Protection

Status: Proposed  
Date: 2026-08-12  
Issue: #134 (`VAL-006B — Guest Retrieval Request + Duplicate Protection`)

## Context

Phase 4 now has a completed persistence-hardening slice under Accepted DEC-039. The repository already contains:

- the canonical `PARKED -> REQUESTED` physical transition;
- `RetrievalRequest` with one-active-request protection for `OPEN` / `ACCEPTED`;
- `Task.task_type = RETRIEVAL` with one-active-task protection per `(valet_session_id, task_type)`;
- append-only `DispatchEvent` and `AuditEvent` history;
- the existing Guest Access bearer boundary and durable anti-abuse implementation;
- runtime `SELECT, INSERT, UPDATE` access to `retrieval_requests` and `handoff_verifications` after VAL-006A.

VAL-006B must turn an authenticated guest press into one atomic Retrieval request lifecycle without exposing tenant/Location/KeySlot/ParkingSpot/assignment internals.

A repository review found one persistence mismatch that cannot be ignored:

1. Intake intentionally allows a ValetSession with `customer_id = NULL`; Customer input is optional.
2. Guest Access issuance and resolution authenticate directly to a ValetSession and do not require a Customer row.
3. The current RetrievalRequest database CHECK requires `requested_by_type = CUSTOMER` to have a non-null `requested_by_customer_id`.

Therefore a valid Guest Access bearer can currently identify a legitimate parked ValetSession for which the database refuses the Blueprint-required guest Retrieval request.

Creating a synthetic Customer row would invent identity/contact data that the intake contract intentionally allows to be absent. Rejecting Retrieval for such a guest would make Guest Access only partially usable. The smallest compatible correction is to refine the requester CHECK so `CUSTOMER` means the external guest/customer request boundary while the optional Customer entity remains an attribution detail when one exists.

## Decision

### 1. VAL-006B owns one guest command only

VAL-006B implements the guest-originated `request-retrieval` command.

It owns:

- authenticated guest authority resolution;
- one narrowly scoped database correction for Customer-optional requester attribution;
- `PARKED -> REQUESTED`;
- server-authoritative `retrieval_requested_at`;
- one `RetrievalRequest(status = OPEN)`;
- one `Task(task_type = RETRIEVAL, status = QUEUED)`;
- one append-only `DispatchEvent(QUEUED)` for a newly created Retrieval Task;
- one append-only Retrieval-request AuditEvent for the winning first mutation;
- safe semantic retry behavior;
- guest-safe response and HTTP mapping;
- composition with the existing guest anti-abuse boundary.

It does not assign, accept, decline or reassign the Retrieval Task. That is VAL-006C.

### 2. Migration 21 is required and narrowly scoped

VAL-006B adds exactly one new forward-only migration after the current 20 migrations.

Migration 21 changes only the existing `retrieval_requests_requester_consistency_check` semantics. It does not add a column, table or enum.

The accepted requester meanings become:

#### `CUSTOMER`

`CUSTOMER` means the request originated through the external guest/customer boundary.

Rules:

- `requested_by_membership_id` must be null;
- `requested_by_customer_id` may be null;
- when `requested_by_customer_id` is non-null, the existing same-Organization foreign key remains authoritative;
- the command copies `ValetSession.customer_id` when one exists; it never accepts a Customer ID from guest input;
- no synthetic/empty Customer is created merely to satisfy RetrievalRequest attribution.

#### `STAFF`

Existing STAFF meaning remains unchanged:

- `requested_by_customer_id` must be null;
- `requested_by_membership_id` must be non-null and same-Organization;
- staff request behavior itself is not implemented by VAL-006B.

The replacement row CHECK is logically equivalent to:

```text
(
  requested_by_type = CUSTOMER
  AND requested_by_membership_id IS NULL
)
OR
(
  requested_by_type = STAFF
  AND requested_by_customer_id IS NULL
  AND requested_by_membership_id IS NOT NULL
)
```

Migrations 1–20 remain immutable.

This refinement supersedes earlier documentation only where it implied every CUSTOMER-originated RetrievalRequest must have a persisted Customer entity. It does not make Customer persistence mandatory for intake or Guest Access.

### 3. Canonical guest route

The new route is:

```text
POST /v1/guest/session/request-retrieval
```

Reasoning:

- it stays under the existing `/v1/guest/session` bearer-owned resource boundary;
- it expresses the already canonical domain command name `request-retrieval`;
- it avoids exposing or accepting a session UUID as routing authority;
- it does not imply that a guest may create RetrievalRequests for arbitrary sessions.

No alternate guest Retrieval route is introduced in VAL-006B.

### 4. Request transport is intentionally empty

The route requires:

- exactly one shape-valid existing Guest Access bearer in `Authorization`;
- strict empty JSON body `{}`;
- no query parameters;
- the existing bounded request-ID behavior;
- `Cache-Control: no-store` on every response path covered by the existing guest HTTP boundary.

The guest must not send:

- ValetSession ID;
- Organization ID;
- Location ID;
- Customer ID;
- Task ID;
- RetrievalRequest ID;
- expected session version;
- actor identity;
- priority/VIP/SLA fields;
- KeySlot/Zone/Spot data.

All authority and scope are derived from the bearer-authenticated persisted ValetSession.

### 5. Guest authority is session-bound, not Customer-row-bound

A successful guest credential resolution is sufficient to identify the authoritative ValetSession for this command even when `session.customer_id` is null.

The protected internal resolution used by request-retrieval must derive from persistence at least:

- ValetSession ID;
- Organization ID;
- Location ID;
- current ValetSession state;
- current ValetSession version;
- nullable `customer_id`;
- guest-safe vehicle fields required for the response.

The raw bearer is never copied into RetrievalRequest, Task, DispatchEvent, AuditEvent or logs.

Customer identity is not authentication authority. A non-null `session.customer_id` is only optional historical attribution copied into the RetrievalRequest.

### 6. Existing guest anti-abuse scopes are shared by read and request

VAL-006B does not create new rate-limit scopes or separate quotas that can be used to bypass DEC-024.

`POST /v1/guest/session/request-retrieval` uses the same existing scopes and thresholds as `GET /v1/guest/session`:

```text
v1:guest-client-address
60 failed guest-authentication attempts / 15 minutes

v1:guest-token
180 shape-valid bearer presentations / 15 minutes
```

A shape-valid bearer presentation to either the GET or POST consumes the same token-key quota. This keeps one credential under one shared request budget rather than giving each endpoint a separate 180-request allowance.

The address-failure quota continues to count authentication failures, not authenticated business-rule failures.

### 7. Anti-abuse and authentication ordering

The POST uses the existing guest ordering model:

1. validate the strict empty transport shape;
2. resolve trusted client address or fail closed with `ANTI_ABUSE_UNAVAILABLE`;
3. derive guest address key;
4. inspect exactly one Authorization header and, when shape-valid, derive the guest token key;
5. reserve the address failure slot;
6. enforce/count the shared token quota when the bearer is shape-valid;
7. reject missing/malformed/duplicate bearer as `GUEST_ACCESS_INVALID` and finalize the address reservation `COUNTED`;
8. for a shape-valid bearer, perform authoritative guest resolution and the business command through one controlled database transaction boundary where success-side anti-abuse finalization can commit with the business result.

A valid authenticated guest that receives a business-state rejection is not an authentication failure. Its address reservation must be finalized `IGNORED` before that business error is returned.

If authoritative anti-abuse/authentication/business transaction state cannot safely commit, fail closed; do not return a Retrieval success whose anti-abuse success-finalization did not commit.

### 8. First request is one serialized transaction

For a shape-valid authenticated guest, the business transaction locks the authoritative ValetSession before deciding whether this is a first request or semantic retry.

For the first successful request, persisted state must be exactly:

```text
ValetSession.state = PARKED
```

The same transaction then:

1. obtains one database/server-authoritative operation timestamp;
2. inserts one RetrievalRequest:
   - `requested_by_type = CUSTOMER`;
   - `requested_by_customer_id = session.customer_id` (nullable);
   - `requested_by_membership_id = NULL`;
   - `status = OPEN`;
   - `requested_at = operation time`;
3. inserts one `RETRIEVAL` Task in `QUEUED` with no assignee and `version = 1`;
4. appends one `DispatchEvent` with:
   - `event_type = QUEUED`;
   - null actor membership;
   - null previous/new assignee;
   - no invented reason;
5. updates ValetSession atomically:
   - `state = REQUESTED`;
   - `retrieval_requested_at = operation time`;
   - increment `version` exactly once;
   - `updated_at = operation time` according to existing persistence convention;
6. appends one Retrieval-request AuditEvent;
7. finalizes the authenticated address anti-abuse reservation to `IGNORED` in the authoritative success transaction;
8. commits before returning guest progression.

Any failure rolls back the business mutation and its required Audit/Dispatch side effects.

### 9. Guest Audit/Dispatch actor semantics

Guest/Customer is not an OrganizationMembership.

Therefore the winning guest request records:

```text
AuditEvent.actor_membership_id = NULL
DispatchEvent.actor_membership_id = NULL
```

This is not anonymous authority: the authorized guest bearer is validated against the exact ValetSession before the mutation. The raw bearer or its persisted verifier must not be copied into history.

The AuditEvent uses:

```text
event_type  = RETRIEVAL_REQUESTED
entity_type = ValetSession
entity_id   = ValetSession.id
```

Safe allowlisted metadata is limited to non-secret explanatory fields such as:

```text
actorType = GUEST
fromState = PARKED
toState = REQUESTED
fromVersion
toVersion
requesterType = CUSTOMER
```

Do not put guest bearer/token hash, phone, Customer contact data, Task assignment internals, KeySlot, Zone/Spot or raw request headers into Audit metadata.

The existing generic custody-audit helper currently requires a non-null staff membership at its TypeScript boundary. VAL-006B may either narrowly extend that helper to accept nullable actor membership where the database already permits it, or add a guest-specific safe writer. It must not fake a staff membership.

### 10. Duplicate prevention uses both lock serialization and existing unique constraints

The ValetSession row lock is the first command-serialization boundary.

The existing database protections remain final race/backstop guarantees:

- one active RetrievalRequest where status is `OPEN` or `ACCEPTED`;
- one active RETRIEVAL Task for the ValetSession under the accepted Task active-status rule.

The command must not rely on UI button disabling or a pre-insert existence check without locking.

The two active records are created in the same transaction as the Session transition. A committed state must not contain a newly REQUESTED session with only one of the required active Request/Task pair due to this command.

### 11. Semantic retry is success, not a second mutation

A repeated authenticated guest press is treated as semantic retry when the locked persisted lifecycle is already coherent for the same Retrieval operation.

At minimum, a `REQUESTED` session with:

- exactly one active RetrievalRequest for that ValetSession; and
- exactly one active RETRIEVAL Task for that ValetSession

returns the current guest-safe progression as HTTP 200 without:

- changing session version;
- changing `retrieval_requested_at`;
- inserting another RetrievalRequest;
- inserting another Task;
- appending another `RETRIEVAL_REQUESTED` AuditEvent;
- appending another `QUEUED` DispatchEvent.

The anti-abuse token presentation still counts normally and the authenticated address reservation finalizes `IGNORED`.

A duplicate button press therefore does not require a client-supplied idempotency key or expected version.

### 12. Later in-progress lifecycle presses are non-mutating current-progression reads

Once the same RetrievalRequest has moved to `ACCEPTED`, the guest may still have a stale UI/button or retry a previously uncertain POST while the session is:

```text
RETRIEVING
READY
HANDOFF_PENDING
```

In those states, when persisted RetrievalRequest/Task history is coherent with an already-started Retrieval lifecycle, VAL-006B does not create a new request and does not attempt to move the session backward. It returns the current guest-safe progression as HTTP 200.

This behavior is intentionally non-mutating and avoids making a harmless stale guest press disruptive after staff has started work.

`COMPLETED` is terminal and also returns the current guest-safe progression without creating work.

This semantic retry/current-progression behavior does not authorize a new Retrieval lifecycle after cancellation; a later request after an accepted pre-start cancellation is valid only when a separate cancellation slice has safely returned the ValetSession to `PARKED` and no active request/task remains.

### 13. Incoherent partial lifecycle fails closed

Semantic retry is allowed only when persistence is coherent.

Examples that must not be silently repaired by VAL-006B include:

- `REQUESTED` with an active RetrievalRequest but no expected Retrieval Task;
- `REQUESTED` with a Retrieval Task but no active RetrievalRequest;
- active records belonging to mismatched session/tenant scope;
- impossible multiple active rows that should have been prevented by database constraints;
- a `PARKED` session that already has unexplained active Retrieval work.

These are integrity failures, not permission to manufacture/relink rows. Fail closed with the normal safe internal-error boundary and preserve evidence. Do not expose row/constraint details to the guest.

### 14. Business state error precedence

For a transport-valid request, public precedence is:

1. anti-abuse unavailable / rate limit where the existing DEC-024 ordering requires it;
2. guest credential invalid (`GUEST_ACCESS_INVALID`);
3. after successful authentication and session lock:
   - coherent current Retrieval lifecycle -> HTTP 200 current progression;
   - first request from `PARKED` -> HTTP 200 after the atomic mutation;
   - unsupported physical state with no coherent current Retrieval lifecycle -> `INVALID_STATE_TRANSITION` (HTTP 409);
   - detected persistence inconsistency -> safe internal failure, not a detailed guest conflict.

No response may disclose whether an unrelated tenant/session/resource exists.

### 15. Response is the existing guest-safe session shape

First success and semantic retry both return HTTP 200 using the existing guest-safe session representation:

```text
valetSessionId
state
vehicle:
  make
  model
  color
```

For the first success, `state = REQUESTED`.

For retry/current progression, `state` reflects the authoritative current safe state.

VAL-006B does not return:

- RetrievalRequest ID;
- Task ID/version/status;
- current assignee;
- Shift/member/user identifiers;
- organization/location identifiers;
- `retrieval_requested_at` if the existing guest-safe contract does not expose it;
- KeySlot, ParkingZone or ParkingSpot;
- GPS/coordinates;
- Audit/Dispatch metadata;
- internal priority/ranking data.

A later guest progression contract may add explicitly approved safe ETA/status fields without weakening this minimum privacy boundary.

### 16. No automatic assignment in VAL-006B

The newly created Retrieval Task remains:

```text
QUEUED
current_assignee_membership_id = NULL
```

VAL-006B must not call Phase-3 PARKING-specific assignment behavior merely to assign a Retrieval task early.

VAL-006C owns making Retrieval Tasks fully consumable by the existing Hybrid Dispatch assignment/accept/decline/reassign surface.

### 17. Concurrency requirements

Tests must prove at minimum:

- simultaneous first guest presses for one PARKED session produce one Session transition, one active RetrievalRequest and one active RETRIEVAL Task;
- only one `RETRIEVAL_REQUESTED` AuditEvent and one `QUEUED` DispatchEvent are appended for that first lifecycle;
- all successful concurrent losers return current safe progression rather than creating work;
- session `version` increments exactly once for the first request;
- `retrieval_requested_at` is stable across semantic retries;
- database uniqueness remains the final backstop if transactions race unexpectedly.

### 18. Migration and persistence tests

Migration 21 must prove:

- migrations 1–20 are unchanged;
- CUSTOMER request with null Customer ID and null membership is accepted;
- CUSTOMER request with a valid same-Organization Customer ID remains accepted;
- CUSTOMER request with any membership requester is rejected;
- STAFF request still requires a membership and rejects Customer attribution;
- cross-Organization Customer and membership references remain rejected by existing FKs;
- one-active RetrievalRequest protection is unchanged.

Prisma model columns/enums remain unchanged unless generated schema metadata requires no-op formatting; no new field is authorized.

### 19. Guest anti-abuse regression requirements

Tests must prove:

- GET and POST share the same guest-token quota scope/key so presentations aggregate toward 180;
- malformed/missing/duplicate bearer counts against the guest address failure reservation as already accepted;
- authenticated business `INVALID_STATE_TRANSITION` finalizes address reservation `IGNORED` rather than consuming the failure quota;
- successful first mutation cannot commit if required authenticated anti-abuse finalization fails;
- rate-limited or unavailable requests do not mutate RetrievalRequest/Task/Session/Audit/Dispatch state;
- raw bearer/IP/phone/customer contact is absent from business history and public error bodies.

### 20. Architecture and file-structure boundary

DEC-030 / `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remain binding.

The repository already contains `apps/api/src/modules/retrieval/` as the feature boundary reserved for Retrieval behavior. VAL-006B must implement the new business command inside that Retrieval boundary rather than turning Guest Access into a mixed authentication + Retrieval business module.

The ownership split is binding:

- `guest-access` continues to own Guest Access credential issuance, revocation, resolution and the reusable guest authentication boundary;
- `anti-abuse` continues to own the existing trusted-client-address and guest address/token quota machinery;
- `retrieval` owns the `request-retrieval` transport/service/command behavior and the `PARKED -> REQUESTED` Retrieval business transaction;
- `dispatch` continues to own reusable Task/Dispatch persistence and later Hybrid Dispatch assignment semantics;
- `parking` / the PARKING-specific queue command do not become dependencies of guest Retrieval.

The Retrieval feature may depend one-way on a narrow exported Guest Access resolution/authentication surface. Guest Access must not import Retrieval to make this route work. A circular feature dependency or feature ownership inversion is forbidden.

The existing `queue-parking-task-command.ts` is not a generic queue command: it is coupled to staff identity, active Shift eligibility and `AWAITING_PARKING`. VAL-006B must not call it, wrap it, spoof a staff actor, or weaken its guards for Retrieval.

To create the required `Task(type = RETRIEVAL, status = QUEUED)` and `DispatchEvent(QUEUED)`, implementation must either:

1. reuse/extract a genuinely generic narrow Dispatch persistence primitive that accepts the already-authorized transaction/scope and preserves the current Task/Dispatch invariants; or
2. add a focused Retrieval queue persistence unit that writes the existing shared Task/Dispatch schema without creating a second assignment system.

If a generic Dispatch primitive is extracted, PARKING behavior, authorization, Shift guards, public routes, errors and transaction semantics must remain unchanged. The extraction is internal reuse only, not a redesign of Phase 3.

The HTTP route may remain under the public `/v1/guest/session/...` namespace while its controller/provider ownership lives in the Retrieval module. URL namespace does not transfer business ownership to `guest-access`.

The existing `guest-access.controller.ts` and `guest-access-command.ts` are legacy large files. VAL-006B must not append meaningful Retrieval behavior to an oversized file merely for convenience. A minimal export/wiring change is allowed only when needed to expose an already-existing guest resolution/authentication capability without moving Retrieval mutations into Guest Access.

Prefer a focused Retrieval controller/service/command/persistence split. Every new authored code file must remain under 300 physical lines, existing <=300-line files must remain <=300, and legacy >300-line files must not grow. No line-count gaming or unrelated refactor is authorized.

Before implementation commits, the agent must document its concrete file/module split and verify that dependency direction remains acyclic.

### 21. Explicitly out of scope

VAL-006B does not implement:

- staff-originated Retrieval request;
- pre-start cancellation command;
- Retrieval assignment/acceptance/decline/reassignment;
- key checkout or `REQUESTED -> RETRIEVING`;
- Retrieval GPS/maps;
- READY progression;
- notifications provider delivery;
- handoff credential issuance/verification;
- vehicle release/session completion;
- payment/validation workflow;
- Dashboard/Employee/Guest UI implementation;
- offline replay/idempotency infrastructure;
- predictive/AI Retrieval.

## Consequences

Positive:

- every valid guest bearer can request Retrieval even when no persistent Customer row exists;
- Customer remains optional at intake instead of being fabricated later;
- one button press maps to one coherent RetrievalRequest/Task/session transaction;
- repeated/stale presses are safe and guest-friendly;
- existing anti-abuse quotas cannot be bypassed by switching between GET and POST;
- guest privacy remains aligned with the current safe session contract;
- Retrieval business ownership now lands in the repository's existing `retrieval` feature boundary;
- Hybrid Dispatch remains one shared system rather than a guest-specific assignment path;
- Phase 3 PARKING-specific command semantics remain untouched.

Trade-offs:

- migration 21 intentionally relaxes one historical CUSTOMER-attribution CHECK while preserving every FK and STAFF requester guard;
- `CUSTOMER` becomes an origin classification rather than proof that a Customer entity exists;
- semantic retry logic must validate persistence coherence instead of simply returning success whenever state is not PARKED;
- business execution must be composed carefully with the existing anti-abuse transaction/finalization semantics;
- a small one-way module export or generic Dispatch persistence extraction may be required to compose existing capabilities without duplicating them.

## Implementation boundary

Implementation may begin only after this decision is explicitly approved by the project owner, marked `Accepted`, merged, and mirrored in `docs/08_DECISIONS_LOG.md`.
