# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-09 21:20 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Merged `main` baseline for VAL-004A: `c67c3ea7b66d82586990019de0e4eeeec68230d2`
- Active branch: `docs/VAL-004A-complete-check-in-contract`
- Active Issue: #46 — VAL-004A — Lock Complete Check-In Command Contract
- Verification basis: merged PR #45 / VAL-003P, current GitHub branch state, Issue #46, and binding Phase 2 docs

## Current Milestone

**Phase 2 — Core custody domain + check-in**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, deterministic demo/seed data, and the pre-Phase-2 local-security hardening gate are merged to `main`.

VAL-004A is the first active Phase 2 task. It is **binding docs/contract work only** and introduces no application/package implementation, Prisma schema change, migration, or lockfile change.

## Recently Completed Gate

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

Current database foundation contains exactly **14 forward-only migrations**, ending with:

```text
20260809001400_notification_foundation
```

VAL-003O and VAL-003P add no migration.

The Phase 1 schema already contains the persistence used by the first Phase 2 command, including:

- Vehicle known-plate / DEC-020 temporary-descriptor identity foundation
- ValetSession `CHECKING_IN`, `AWAITING_PARKING`, `version`, `checking_in_completed_at`, checked-in actor and hashed guest-access fields
- AuditEvent Black Box persistence
- tenant/location-safe relationships

It does **not** yet contain the complete Blueprint intake dependencies for `ConditionNote`, `VehiclePhoto`, or typed required-photo policy storage.

## Current Task

### VAL-004A — Lock Complete Check-In Command Contract

- Issue #46
- Branch: `docs/VAL-004A-complete-check-in-contract`
- Status: **IN PROGRESS — DOCS/CONTRACT ONLY**
- Base: merged `main` at `c67c3ea7`
- Application/Prisma/migration changes: **none**

Objective:
Lock the first protected Phase 2 custody command before application/API implementation:

```text
complete-check-in
CHECKING_IN -> AWAITING_PARKING
```

The binding contract now establishes:

- server-derived tenant/resource scope; client ownership IDs are never trusted for authorization
- active authenticated staff User + active same-Organization membership
- explicit access to the ValetSession Location
- ordinary operational role: `VALET_EMPLOYEE` or `VALET_SUPERVISOR`
- `LOCATION_MANAGER`/`ORG_ADMIN` do not automatically inherit ordinary field completion permission
- active Shift is not a hard command prerequisite; actor accountability remains mandatory
- expected ValetSession `version` is the optimistic-concurrency boundary
- stale version -> `VERSION_CONFLICT`; current-version wrong state -> `INVALID_STATE_TRANSITION`
- winning mutation is conditional on both state and expected version
- success sets only `AWAITING_PARKING`, server `checking_in_completed_at`, and one version increment
- `VALET_SESSION_CHECK_IN_COMPLETED` AuditEvent commits atomically with the transition
- safe audit metadata excludes guest/auth/handoff/payment secrets
- no parking/key/Task/Dispatch side effects
- state+version blocks duplicate transition/audit mutation but is not misrepresented as transparent command replay idempotency
- durable operation identity is a focused follow-up only if offline retry semantics need original-success replay

## Explicit VAL-004A Dependencies

Production `complete-check-in` cannot claim the full Blueprint intake contract until focused Phase 2 work provides:

1. ConditionNote persistence/completion semantics
2. VehiclePhoto/private attachment persistence
3. typed Company-default -> Location-override required-photo policy, optional by default
4. secure guest-access issuance/authorization over existing hashed session fields
5. reusable protected command/authorization/concurrency/transaction infrastructure
6. dedicated least-privilege runtime DB role and explicit append-only AuditEvent enforcement boundary
7. durable operation-ID persistence only if transparent offline duplicate replay is required

These dependencies are recorded honestly rather than faked in VAL-004A.

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
- `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/**` remain CRITICAL files and are out of scope for VAL-004A.
- `docs/04_VALET_SESSION_STATE_MACHINE.md` is the single detailed source for the locked `complete-check-in` contract; other docs should point to it rather than duplicate/reinterpret it.
- Condition/photo policy persistence may require a later focused migration owner; do not start it inside VAL-004A.
- Do not pull Hybrid Dispatch/Task, parking/key, retrieval, handoff, payment or notification behavior into `complete-check-in`.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

For VAL-004A:

```text
finish docs consistency review
-> verify branch diff contains docs only
-> open PR for Issue #46
-> pass CI/docs checks
-> merge
```

After VAL-004A is merged, start **VAL-004B — Custody Command / Authorization / Concurrency Foundation** from the updated `main`. Do not begin VAL-004H implementation before its recorded intake/security dependencies are available.

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
