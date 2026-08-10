# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-10` (VAL-004I local implementation session)
- Repository: `veletpro0-lgtm/valet-platform`
- Required merged baseline through VAL-004H: `6b3f02df20377cad154e7b1c8f0b7e96de2dc8e1`
- Active branch: `feat/VAL-004I-check-in-api-gate`
- Active Issue: #62 — VAL-004I — Check-In API / Integration / Performance Gate
- Verification basis: owner-supplied Issue #62 task packet, required local branch/HEAD preflight, binding Phase 2 docs and focused real-HTTP/runtime-role PostgreSQL integration coverage

## Current Milestone

**Phase 2 — Core custody domain + check-in**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, deterministic demo/seed data, and the pre-Phase-2 local-security hardening gate are merged to `main`.

VAL-004A through VAL-004H are merged. VAL-004I is implemented locally and ready for review. It adds strict shared check-in transport contracts, dedicated staff/guest HTTP routes, fail-closed production staff-principal injection, centralized request IDs/errors, safe monotonic performance observation and focused real-HTTP/runtime-role integration proof. It adds no migration and does not start Phase 3.

## Recently Completed Gate

### VAL-004A — Lock Complete Check-In Command Contract

- Status: **MERGED / COMPLETED**
- Result: binding authorization, state/version, guard, audit, retry and dependency contract for the later `complete-check-in` command

### VAL-004B — Custody Command / Authorization / Concurrency Foundation

- Status: **MERGED / COMPLETED**
- Result: backend-owned protected command foundation plus dedicated least-privilege runtime database role and append-only AuditEvent enforcement

### VAL-004C — Check-In Intake Persistence

- Status: **MERGED / COMPLETED**
- Merge commit: `1baa94ab7d830f4f64aecd042618d442b7dbf807`
- Result: append-only condition/photo evidence persistence, explicit condition-completion evidence and typed Organization-default/Location-override photo policy

### VAL-003O — Demo / Seed Data Foundation

- Issue #40
- PR #41
- Status: **MERGED / COMPLETED**
- Result: deterministic/idempotent synthetic demo seed over the existing 14-migration Phase 1 schema

### VAL-003P — Pre-Phase-2 Security Hardening

- Issue #44
- PR #45
- Merge commit: `c67c3ea7b66d82586990019de0e4eeeec68230d2`
- Status: **MERGED / COMPLETED**
- Result:
  - local PostgreSQL Compose publication restricted to loopback
  - development DB password removed from hard-coded Compose configuration
  - demo seed changed to fail-closed environment/opt-in/loopback/database-name policy
  - query-parameter target override blocked before connection
  - Phase 2 runtime DB boundary documented: dedicated least-privilege runtime role, no runtime DDL/migration privileges
  - explicit append-only AuditEvent/financial-history DB privilege/enforcement decision remains required before production commands rely on that guarantee

## Phase 1 Completion Evidence

Phase 1 completed with exactly **14 forward-only migrations**, ending with:

```text
20260809001400_notification_foundation
```

The current merged baseline additionally contains VAL-004C migration 15, `20260809001500_check_in_intake_persistence`. VAL-004D adds no migration. VAL-004E adds only migration 16, `20260810001600_intake_session_creation`.

The Phase 1 schema already contains the persistence used by the first Phase 2 command, including:

- Vehicle known-plate / DEC-020 temporary-descriptor identity foundation
- ValetSession `CHECKING_IN`, `AWAITING_PARKING`, `version`, `checking_in_completed_at`, checked-in actor and hashed guest-access fields
- AuditEvent Black Box persistence
- tenant/location-safe relationships

Merged VAL-004C provides migration 15 for `ConditionNote`, `VehiclePhoto`, explicit condition-completion evidence and typed required-photo policy storage.

## Current Task

### VAL-004I — Check-In API / Integration / Performance Gate

- Issue #62
- Branch: `feat/VAL-004I-check-in-api-gate`
- Status: **READY FOR REVIEW — LOCAL CHANGES ONLY**
- Base: `6b3f02df20377cad154e7b1c8f0b7e96de2dc8e1`
- Expected database state on this branch: **16 forward-only migrations**

Objective:
Wire the accepted Phase 2 check-in commands through the narrow transport gate:

- strict shared Zod request/response schemas with no client authority fields
- dedicated staff routes plus bearer-only guest-safe session read
- production-default fail-closed staff principal resolver and test-only DI override
- runtime pool lifecycle, centralized safe HTTP errors and bounded request IDs
- exactly one safe monotonic measurement per routed operation
- persisted end-to-end check-in elapsed KPI on successful completion
- real Nest listener and runtime-role PostgreSQL integration coverage

VAL-004I preserves `AWAITING_PARKING` as the Phase 2 physical endpoint. It does not implement object upload, parking/key assignment, Task/Dispatch, retrieval, handoff, payment, incident, notification, frontend or production guest rate limiting.

## Remaining Phase 2 Check-In Gate

VAL-004I closes the planned API/integration/performance implementation slice locally. Phase 2 is not globally complete until VAL-004I review/merge and a separate final Phase 2 security/integrity review gate are complete.

## Phase 2 Focused Task Sequence

The current binding execution plan splits Phase 2 into nine focused slices:

```text
VAL-004A  Lock Complete Check-In Command Contract
VAL-004B  Custody Command / Authorization / Concurrency Foundation
VAL-004C  Check-In Intake Persistence
VAL-004D  Vehicle Identity / Plate Capture Command
VAL-004E  Customer / Vehicle / ValetSession Creation
VAL-004F  Guest Secure Access Foundation
VAL-004G  Condition Check + Photo Policy Commands
VAL-004H  Complete Check-In Command Implementation
VAL-004I  Check-In API / Integration / Performance Gate
```

This sequence is dependency-oriented, not permission to combine Phase 2 into one large PR.

## Current Product / Domain Baseline

Canonical ValetSession physical lifecycle:

```text
CHECKING_IN
-> AWAITING_PARKING
-> PARKING
-> PARKED
-> REQUESTED
-> RETRIEVING
-> READY
-> HANDOFF_PENDING
-> COMPLETED
```

Canonical Hybrid Dispatch Task lifecycle remains separate:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

Current tenant membership roles:

```text
ORG_ADMIN
LOCATION_MANAGER
VALET_SUPERVISOR
VALET_EMPLOYEE
```

Audit/Black Box history is append-only by contract. Protected domain mutations that require audit must commit the mutation and required AuditEvent atomically.

Financial persistence remains payment-centric under DEC-021 with DEC-022 edge clarifications. Phase 6 consumes that persistence for commands/provider/workflows.

## Dependencies / Contention

- No Phase 1 migration task remains active.
- VAL-004I uses the existing ValetSession, Vehicle, condition/photo-policy and AuditEvent persistence, adds no migration and does not modify migrations 1–16.
- `docs/04_VALET_SESSION_STATE_MACHINE.md` is the single detailed source for the locked `complete-check-in` contract; other docs should point to it rather than duplicate/reinterpret it.
- VAL-004I adds only the dedicated check-in API/integration/performance boundary; the accepted VAL-004E–H domain commands remain authoritative.
- Do not pull Hybrid Dispatch/Task, parking/key, retrieval, handoff, payment or notification behavior into `complete-check-in`.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

For VAL-004I:

```text
finish the dedicated HTTP/runtime-role PostgreSQL integration coverage
-> run all quality gates
-> review the local diff against Issue #62 scope
-> stop for human/ChatGPT review without commit or push
```

Do not begin Phase 3 on this branch. After VAL-004I review/merge, run the separate final Phase 2 security/integrity review gate before declaring Phase 2 globally complete.

## Parallel UX/UI Track

UX/UI design may proceed in parallel only where it does not redefine active high-contention domain/database contracts. Frontend implementation should remain feature-by-feature with the corresponding backend/domain capability.

## Status Vocabulary

```text
LOCAL CHANGES ONLY
STASHED LOCALLY
COMMITTED LOCALLY
PUSHED / NO PR
PR OPEN / CI PENDING
PR OPEN / CHANGES REQUIRED
PR READY FOR MERGE
MERGED
BLOCKED
READY FOR LOCAL IMPLEMENTATION
```

Never call a task merged/completed merely because branch edits or validation pass.
