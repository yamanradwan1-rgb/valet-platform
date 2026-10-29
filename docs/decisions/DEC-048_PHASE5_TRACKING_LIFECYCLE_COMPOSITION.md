# DEC-048 — Phase 5 Tracking Lifecycle Composition

Status: Accepted
Date: 2026-08-14
Task: VAL-007C — Tracking Lifecycle Composition
Issue: #157

## Context

DEC-045 requires task-scoped tracking only during authoritative Parking/Retrieval movement windows, and DEC-046 already provides `TaskTrackingSession` persistence with exact Organization/Location/ValetSession/Task scope, at most one active tracker per Task and physical ValetSession, and a one-way `ended_at` lifecycle.

The remaining material choice is consistency semantics between the existing authoritative movement commands and tracking-session persistence. Phase 5 must not allow a committed physical movement state to drift from tracking state, and it must never leave an ACTIVE tracker after `PARKED` or `READY`.

## Decision

### 1. Tracking composes inside the authoritative movement transaction

Tracking activation/deactivation is an internal side effect of the existing protected movement commands and executes inside the same PostgreSQL transaction.

There is no public or client-controlled start/stop tracking state machine.

The authoritative integration points are:

```text
start-parking    / entry to PARKING     -> tracking may start
confirm-parked   / entry to PARKED      -> tracking stops
start-retrieval  / entry to RETRIEVING  -> tracking may start
mark-ready       / entry to READY       -> tracking stops
```

### 2. Effective tracking policy

At movement start, evaluate effective tracking policy from persisted authoritative Organization/Location rows inside the protected transaction:

```text
Location.tracking_enabled_override
  ?? Organization.tracking_enabled
```

Company default remains OFF.

No client-supplied Organization, Location, policy, Task owner or assignee field is authority.

### 3. Policy OFF start behavior

If effective policy is OFF, the movement command proceeds normally and creates no `TaskTrackingSession`.

Turning tracking OFF does not block normal Parking/Retrieval operation.

### 4. Policy ON start behavior

If effective policy is ON, creating the exact scoped active `TaskTrackingSession` is a required atomic side effect of the movement command.

A tracking-start persistence failure rolls back the entire movement transaction. The system must not commit `PARKING` or `RETRIEVING` when policy requires tracking but the corresponding tracker was not created.

A movement-start command must not reuse a pre-existing active tracker. Any active tracker already attached to the same physical ValetSession when a new movement-entry command attempts to start is an integrity conflict.

### 5. Stop behavior at PARKED / READY

When a movement command reaches `PARKED` or `READY`, any active tracker for the exact physical session/task must be ended inside the same transaction regardless of the current tracking-policy value.

This prevents a policy change from leaving an orphan ACTIVE tracker.

If an active tracker exists and ending it fails, the entire movement command rolls back.

If no active tracker exists, the movement command may proceed because no privacy/orphan-tracking risk remains.

If an active tracker exists for the same ValetSession but belongs to a different Task than the authoritative movement Task being ended, treat that as an integrity conflict and roll back rather than committing the end state with an orphan tracker.

### 6. Retry and concurrency semantics

Existing movement command locking/version semantics remain authoritative.

Tracking writes must compose with those existing locks and the DEC-046 partial unique indexes so concurrent/retry behavior converges safely:

- one successful tracked movement start creates at most one active tracking session;
- a stale or losing movement mutation cannot create a durable tracker after its movement transaction rolls back;
- one successful movement stop ends the exact active tracker at most once;
- no tracker is reopened or has `ended_at` rewritten after first end.

No new public tracking idempotency key or second version field is introduced in VAL-007C.

### 7. Database-authoritative time

Where practical, use the same database-authoritative movement `operationTime` for `TaskTrackingSession.started_at` and the first `ended_at` value so physical and tracking history share one authoritative transaction timestamp.

Client time and Node `Date.now()` do not choose lifecycle timestamps.

### 8. Authorization and privacy

VAL-007C adds no new actor authority.

Existing staff authentication, canonical Task ownership, active Shift operational eligibility, Organization/Location scope, expected-version guards and movement authorization remain unchanged.

Tracking remains task-scoped and employee operational data. Guest/Customer receives no exact GPS, tracking-session identifier, route, geofence geometry or employee map position through this task.

### 9. Database boundary

VAL-007C is expected to reuse the existing migration-23 persistence and runtime privileges.

No migration 25 and no Prisma schema change are expected.

Migrations 1–24 are merged history and must remain byte-for-byte immutable.

If implementation proves the accepted lifecycle semantics cannot be enforced safely with the existing schema/privileges, implementation must stop for a focused decision rather than opportunistically adding or rewriting persistence.

### 10. Explicitly out of scope

VAL-007C does not implement:

- GPS/device sample ingestion;
- geofence evaluation or alerts;
- route history/retention cleanup;
- live operations map APIs or UI;
- Google Maps provider integration;
- continuous Shift tracking;
- new Task or ValetSession states;
- IN_PROGRESS reassignment/handoff;
- Guest exact location data.

## Consequences

Tracking cannot drift independently from the authoritative Parking/Retrieval custody commands. Policy-OFF operation stays available, policy-ON movement start is atomic with tracker creation, and movement completion cannot commit while an active tracker that should stop remains open. This gives VAL-007D a reliable active-tracker boundary for later GPS ingestion without introducing a second movement lifecycle.

## Issue #352 exceptional tracking split (2026-10-29)

The Owner's later approved Emergency Task Takeover direction introduces one
internal tracking segment split **during** an IN_PROGRESS Parking/Retrieval
Task, without a movement-state transition. Inside the authorized takeover
transaction, after Session→Task locks, it ends the outgoing owner's segment
and creates a distinct new-owner segment iff effective tracking is enabled
and the physical session is still PARKING/RETRIEVING. It never creates a
segment at READY/HANDOFF_PENDING, changes the two normal entry/exit events
above, or exposes a client start/stop action. Both versions advance as a
concurrency fence; the same post-lock database clock instant is used for
segment boundaries and takeover history. Immutable owner provenance is
specified in the proposed DEC-107 and DEC-046 focused clarification.
