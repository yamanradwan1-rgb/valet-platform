# DEC-032 — Shift Operational Eligibility

Status: Accepted
Date: 2026-08-12

Issue: #88 (`VAL-005B — Shift Operational Eligibility`)

## Context

Phase 3 requires a focused Shift/eligibility slice before Hybrid Dispatch may assign work. Phase 1 already persists `Shift` and migration 1 already contains the partial unique index `shifts_one_active_per_membership_idx` over `membership_id` where `status = 'ACTIVE'`.

That database constraint means at most one ACTIVE Shift exists per `OrganizationMembership`; it does **not** mean one active Shift per `User` across all Organizations. A User may belong to multiple Organizations through distinct memberships.

`StaffPrincipal` currently proves only `userId`. Organization, membership, role, Location and resource scope remain server-derived from persisted records.

The current custody staff authorizer is useful repository precedent, but it is a custody-specific abstraction. Likewise, the current custody AuditEvent writer requires a non-null `valetSessionId` and only supports `ValetSession` / `Vehicle` entities. VAL-005B must not pretend those helpers already support Shift semantics merely because the database can represent them.

`ValetSession.current_assignee_membership_id` is not canonical Hybrid Dispatch ownership. Task persistence is VAL-005D and assignment/reassignment is VAL-005E.

## Decision

### 1. Scope

VAL-005B implements only:

- staff self-start of an operational Shift;
- staff self-end of an operational Shift;
- own-active-Shift lookup needed by the employee surface/reconnect path;
- a reusable transaction-aware operational eligibility boundary for later Dispatch assignment;
- exact concurrency/retry and AuditEvent semantics for those Shift mutations.

VAL-005B does **not** implement:

- supervisor/manager force-end or move commands;
- Task persistence or assignment;
- open-task reassignment commands;
- Zone assignment eligibility beyond same-Location Shift eligibility;
- current-load scoring;
- GPS/proximity/geofencing;
- payroll/timekeeping/shift-close accounting;
- Retrieval behavior.

Supervisor reassignment/move behavior remains part of the focused VAL-005E Dispatch contract. No supervisor override may bypass open-work handoff by leaving work owned by an ended employee.

### 2. Identity and active-Shift scope

The existing database invariant remains authoritative:

```text
one ACTIVE Shift per OrganizationMembership
```

It is **not** one ACTIVE Shift per User platform-wide.

A User with memberships in two Organizations may therefore have one ACTIVE Shift for each membership if independently authorized in each Organization.

VAL-005B must never collapse `User.id` and `OrganizationMembership.id`.

No new User-global active-Shift constraint is added.

### 3. Start Shift authorization

Start Shift is a self-service field-operation command available only to memberships whose current role is:

- `VALET_EMPLOYEE`
- `VALET_SUPERVISOR`

The request supplies only the target Location identifier. It does not supply authoritative Organization, membership, role, User or actor IDs.

Inside the command transaction the server must prove from persisted state:

- authenticated User is `ACTIVE`;
- target Location exists and derives its Organization;
- Organization is `ACTIVE`;
- Location is `ACTIVE`;
- authenticated User has an `ACTIVE` membership in that Organization;
- that membership currently has explicit `MembershipLocationAccess` to the target Location;
- membership role is one of the two allowed operational roles.

`ORG_ADMIN` and `LOCATION_MANAGER` do not inherit this field-operation permission merely from role names or hierarchy.

Existing non-disclosing tenant/location authorization behavior remains in force.

### 4. Start Shift command and API contract

Canonical staff route family remains versioned under `v1/staff/...`.

Start endpoint:

```text
POST /v1/staff/shifts/start
```

Shared request contract:

```json
{
  "targetLocationId": "uuid"
}
```

No `organizationId`, `membershipId`, `userId`, role or actor field is accepted from the client.

Successful first execution and successful same-Location retry both return HTTP `200` with the current Shift projection:

```text
shiftId
locationId
status
startedAt
endedAt
```

For an active Shift, `status = ACTIVE` and `endedAt = null`.

The response intentionally omits authority-bearing Organization/membership/role claims that the client does not need to choose.

### 5. Start retry and concurrency semantics

No durable idempotency key or operation-ID column is introduced by VAL-005B.

Start uses state-based retry semantics:

- no active Shift for the resolved membership -> create one;
- active Shift for the same membership at the same Location -> return that existing Shift with HTTP 200 and do not append another AuditEvent;
- active Shift for the same membership at another Location -> reject with `ACTIVE_SHIFT_CONFLICT`, HTTP 409;
- simultaneous starts are finally protected by the existing partial unique index.

A unique violation is a concurrency signal, not proof of idempotency by itself. The implementation must recover outside the failed PostgreSQL statement/transaction state as needed, re-read authoritative Shift state, and classify same-Location retry versus different-Location conflict before returning a result.

VAL-005B does not promise transparent replay of an original response after later business state has changed. If a client times out after a committed start, a retry is evaluated against current persisted Shift state. Durable offline operation identity remains a later reliability concern unless a focused decision brings it forward.

### 6. Self-end authorization

VAL-005B provides **self-end only**. There is no supervisor-targeted end/force-end API in this slice.

End is intentionally a capability-reducing cleanup operation and uses a narrower authorization rule than operational eligibility:

- the authenticated User itself must still be `ACTIVE` and have a valid staff principal;
- the targeted Shift must resolve from persistence;
- the Shift's owning `OrganizationMembership.user_id` must equal the authenticated User;
- no caller-supplied Organization, membership or role claim is trusted.

Current membership status, role, Location status, Organization status and `MembershipLocationAccess` are **not** required to end that User's own already-existing Shift. This allows a User to close a stale Shift after access/role/location policy changed, instead of leaving a zombie ACTIVE row that can block later operation.

This exception authorizes only the monotonic `ACTIVE -> ENDED` cleanup of the caller's own Shift. It grants no other operation in an inactive/revoked scope.

A disabled User cannot exercise self-end through Staff Auth; administrative cleanup of disabled-user stale Shifts is not introduced by VAL-005B and requires a later privileged lifecycle contract if needed.

### 7. End Shift command and API contract

End endpoint:

```text
POST /v1/staff/shifts/:shiftId/end
```

The request body is empty.

The Shift ID is required so retry targets the same durable Shift rather than accidentally ending a newer Shift at the same Location.

Success returns HTTP `200` with:

```text
shiftId
locationId
status
startedAt
endedAt
```

First successful end performs exactly:

```text
ACTIVE -> ENDED
```

with a database-authoritative `endedAt`.

An identical retry for that same self-owned already-ended Shift returns the persisted ended Shift with HTTP 200 and does not append another AuditEvent.

### 8. End concurrency semantics

The first transaction that successfully changes the target Shift from `ACTIVE` to `ENDED` is the mutation winner.

Concurrent end attempts for the same Shift must converge to one persisted `ENDED` result and one end AuditEvent. A loser must re-read authoritative state and return the already-ended Shift only after proving self-ownership; it must not emit a second mutation/event.

Start/end races are evaluated against committed authoritative Shift state. The existing partial unique index remains the final protection against two ACTIVE rows for one membership. The implementation must not claim the index alone serializes every Shift read/write semantic.

### 9. Database-authoritative time

Clients and Node `Date.now()` do not choose trusted Shift operation time.

For each successful start or first successful end, obtain the operation timestamp from PostgreSQL inside the command transaction and use that same authoritative instant for:

- `started_at` or `ended_at`;
- corresponding AuditEvent `occurred_at`.

Retry responses return the already-persisted original timestamps.

### 10. Operational eligibility definition

A membership is operationally eligible for Dispatch at Location `L` only when all of the following are true **at the time the eligibility boundary is evaluated**:

- its User is `ACTIVE`;
- the OrganizationMembership is `ACTIVE`;
- its Organization is `ACTIVE`;
- Location `L` is `ACTIVE` and belongs to that Organization;
- explicit `MembershipLocationAccess` currently exists for membership + `L`;
- current membership role is `VALET_EMPLOYEE` or `VALET_SUPERVISOR`;
- the membership has an `ACTIVE` Shift at exactly Location `L`.

Authorization is therefore dynamic for Dispatch eligibility; Shift start does not snapshot future authorization.

Removal/deactivation makes future eligibility evaluations false immediately after that change commits. The Shift row itself is not silently ended by access/policy changes.

### 11. Reusable eligibility boundary and race contract

VAL-005B must expose an internal transaction-aware eligibility boundary that accepts a database transaction plus authoritative `membershipId` and `locationId` inputs and returns/proves at least the matching active `shiftId` when eligible.

The boundary must derive Organization/User relationships from persisted rows. It must not trust an HTTP caller's Organization, User, role or tenant claim.

The rows used to prove eligibility must be read under repository-compatible transactional locking that prevents a concurrent Shift end or relevant authorization revocation from committing between the eligibility proof and the caller's protected write while the caller retains that transaction.

The exact implementation helper/file name is not part of this decision.

VAL-005E must consume this boundary **inside the same transaction as Task assignment**. Calling an HTTP endpoint, evaluating eligibility in one transaction and assigning in another, or performing a plain unlocked boolean SELECT is not sufficient.

When Task assignment exists, the required race behavior is:

- assignment locks/proves eligibility first, then commits assignment before a competing end/revocation may commit; or
- end/revocation commits first, then assignment observes ineligibility and must not assign.

The later Task decision owns Task-row locking and assignment persistence, while this decision owns the Shift/authorization side of the eligibility proof.

### 12. Open-work handoff boundary

VAL-005B does not use `ValetSession.current_assignee_membership_id` as open Task ownership and does not clear or rewrite it during Shift end.

Before Hybrid Dispatch assignment becomes usable, VAL-005E must integrate Shift end with canonical Task ownership so that normal Shift end cannot complete while the membership owns nonterminal work requiring handoff/reassignment.

The rule is:

```text
no Shift end that strands canonical open Task ownership
```

Reassignment/handoff must occur first under the focused Task/Dispatch contract.

Because canonical Task persistence does not exist until VAL-005D, VAL-005B does not invent a temporary open-work query over ValetSession. It also does not implement a force-end bypass.

### 13. Active Shift lookup

Employee/reconnect state needs an own-active-Shift lookup without assuming a User has only one active Shift platform-wide.

Endpoint:

```text
GET /v1/staff/shifts/active?locationId=<uuid>
```

The query is explicitly Location-scoped.

The caller must be an authenticated `ACTIVE` User. The endpoint may return only an active Shift whose owning membership belongs to that User and whose `location_id` equals the requested Location.

It returns HTTP 200 with either:

```text
{ "shift": <ShiftProjection> }
```

or:

```text
{ "shift": null }
```

It does not turn caller-supplied Location into authority over another membership/tenant.

Current LocationAccess is not required merely to discover/close the caller's own stale active Shift after access revocation. Operational eligibility remains false until full current eligibility is restored.

### 14. Shared contracts and transport ownership

Public Shift request/response schemas belong in `packages/contracts` and are exported through the package's existing public surface.

Do not create module-local public transport contracts as the authoritative schema.

The API should follow the repository's existing thin controller/service/explicit-command pattern. VAL-005B does not introduce a generic repository layer merely because it is conventional NestJS architecture.

### 15. Error contract

VAL-005B adds one public Shift conflict code:

```text
ACTIVE_SHIFT_CONFLICT -> HTTP 409
```

It is used only when the resolved membership already has a different active Shift than the requested start Location.

Existing authorization errors retain current non-disclosing mappings, including 404 concealment for tenant/location/authorization denial where applicable.

Self-end of a foreign/non-owned Shift must use the same non-disclosing authorization/resource behavior; it must not reveal whether another tenant's Shift exists.

No `SHIFT_HAS_OPEN_TASKS` error is introduced in VAL-005B because canonical Task persistence/ownership does not yet exist. VAL-005E must define the exact blocked-end error when integrating open Task ownership.

### 16. Audit / Black Box contract

First successful Shift start and first successful Shift end are protected operational mutations and must append exactly one AuditEvent atomically in the same transaction.

Canonical event values:

```text
SHIFT_STARTED
SHIFT_ENDED
```

For both events:

- `organizationId` and `locationId` come from persisted Shift scope;
- `actorMembershipId` is the Shift-owning membership for this self-service slice;
- `valetSessionId` is `NULL`;
- `entityType = "Shift"`;
- `entityId = shiftId`;
- `occurredAt` is the same database-authoritative timestamp used by the Shift mutation;
- metadata is narrow and contains no credentials, bearer material, personal free text or client-authority claims.

Retries that do not create a new mutation do not append another Shift AuditEvent.

The current custody AuditEvent writer cannot satisfy this contract unchanged because it requires `valetSessionId` and restricts entity types. Implementation must introduce a Shift-compatible audit boundary or a carefully reviewed neutral refactor without weakening the current custody metadata protections. This is an application abstraction change, not a database schema requirement.

No `SHIFT_FORCE_ENDED` event exists in VAL-005B because force-end is out of scope.

### 17. Persistence and migration decision

VAL-005B requires **no database migration**.

The current `Shift` table already persists the required start/end facts, tenant/location/membership scope and timestamps. Migration 1 already enforces one ACTIVE Shift per membership. `AuditEvent` already supports nullable `valet_session_id`, String `entity_type`, UUID `entity_id`, actor membership, Location scope and metadata.

Exactly 19 existing forward-only migrations remain unchanged in VAL-005B.

Do not add speculative Shift columns such as:

- `version`;
- `ended_by_membership_id`;
- `override_reason`;
- `end_type`.

If a later supervisor lifecycle decision needs additional persistence, that later focused decision must justify it separately rather than preloading VAL-005B.

### 18. Required concurrency proofs

Implementation tests must prove at minimum:

- first valid start creates exactly one active Shift and one `SHIFT_STARTED` AuditEvent;
- sequential same-Location start retry returns the same Shift with no second event;
- concurrent same-Location starts converge to one active Shift and one start event;
- concurrent different-Location starts for one membership never create two active Shifts and the losing conflicting request is classified safely;
- one User may independently operate through different memberships in different Organizations without collapsing membership identity;
- start denies inactive User/membership/Organization/Location, missing LocationAccess and disallowed role;
- self-end of the exact own Shift succeeds and writes one `SHIFT_ENDED` event;
- repeated/concurrent self-end converges to one end mutation/event;
- self-end never permits ending another User's Shift;
- self-end remains possible for the caller's own Shift after membership/access/Location/Organization eligibility is revoked, provided the authenticated User itself remains active;
- eligibility becomes false after committed User/membership/Organization/Location/access invalidation or Shift end;
- eligibility is false for an active Shift at another Location;
- eligibility is false for disallowed current roles;
- transaction-aware eligibility locking prevents Shift end/revocation from committing between a successful eligibility proof and a protected write in the same transaction;
- audit failure rolls back Shift mutation and Shift mutation failure produces no audit event;
- no test treats `current_assignee_membership_id` as canonical Task ownership;
- no migration 1–19 changes occur.

### 19. Explicitly deferred integration rule

When VAL-005D/VAL-005E introduce canonical Tasks and assignment, they must extend the end path before Dispatch is considered complete so open Task ownership is safely handed off/reassigned before Shift termination.

That integration may add a focused blocked-end error and supervisor reassignment semantics, but it must preserve this decision's identity, dynamic eligibility, same-Location, audit, anti-enumeration and transaction-boundary principles unless a later Accepted decision explicitly supersedes them.

## Consequences

- Dispatch receives a precise reusable eligibility contract without pulling Task persistence into VAL-005B.
- Access/status revocation affects new work eligibility dynamically instead of being snapshotted at Shift start.
- A stale own Shift can still be closed after access/policy changes, preventing avoidable zombie ACTIVE rows.
- One-active-Shift scope remains correctly attached to OrganizationMembership, not User.
- Start/end retries are state-safe without pretending the existing unique index provides transparent request idempotency.
- Shift mutation auditing is explicit and does not misuse the custody-specific writer.
- No schema churn is required for the self-service Shift slice.
- Supervisor move/force-end and canonical open-work blocking remain attached to the later Task/Dispatch decision where reassignment can actually be enforced.
