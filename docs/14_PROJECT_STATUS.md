# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-10` (VAL-004E local implementation session)
- Repository: `veletpro0-lgtm/valet-platform`
- Required merged baseline through VAL-004D: `8f0576161f8305947eaea92657852185b79bb915`
- Active branch: `feat/VAL-004E-intake-session-creation`
- Active Issue: #54 — VAL-004E — Customer / Vehicle / ValetSession Creation
- Verification basis: owner-supplied Issue #54 task packet, required local branch/HEAD preflight, binding Phase 2 docs and focused PostgreSQL integration coverage

## Current Milestone

**Phase 2 — Core custody domain + check-in**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, deterministic demo/seed data, and the pre-Phase-2 local-security hardening gate are merged to `main`.

VAL-004A through VAL-004D are merged. VAL-004E is implemented locally and ready for review. It adds the internal, durable-idempotent intake session creation command and one focused migration; it does not implement secure guest issuance, `complete-check-in` or any API endpoint.

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

### VAL-004E — Customer / Vehicle / ValetSession Creation

- Issue #54
- Branch: `feat/VAL-004E-intake-session-creation`
- Status: **READY FOR REVIEW — LOCAL CHANGES ONLY**
- Base: `8f0576161f8305947eaea92657852185b79bb915`
- Expected database state on this branch: **16 forward-only migrations**

Objective:
Implement only the internal intake creation slice:

- persisted target-Location scope and operational employee/supervisor authorization
- optional minimal E.164-compatible Customer creation with no phone-based reuse/merge
- confirmed same-Organization Vehicle resolution or distinct temporary Vehicle creation through the VAL-004D normalization boundary
- exact `CHECKING_IN`, version-1 ValetSession creation under the existing active-session partial unique index
- Organization-scoped durable idempotency and exact retry replay
- expired+revoked disabled guest placeholder pending VAL-004F
- atomic Customer/Vehicle/ValetSession/AuditEvent/idempotency persistence

VAL-004E does not issue guest credentials, integrate an OCR/ANPR vendor, implement `complete-check-in`, or expose an API route.

## Remaining Complete Check-In Dependencies

After VAL-004E, production `complete-check-in` still depends on focused later tasks for secure guest access, condition/photo policy commands and final command/API wiring. Intake creation is one dependency, not permission to combine those later slices into this branch.

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
- VAL-004E adds exactly migration 16 for the scoped intake idempotency record and does not modify migrations 1–15.
- `docs/04_VALET_SESSION_STATE_MACHINE.md` is the single detailed source for the locked `complete-check-in` contract; other docs should point to it rather than duplicate/reinterpret it.
- VAL-004E changes only internal application command/persistence behavior and relevant documentation; guest issuance remains VAL-004F and condition/photo command semantics remain owned by VAL-004G.
- Do not pull Hybrid Dispatch/Task, parking/key, retrieval, handoff, payment or notification behavior into `complete-check-in`.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

For VAL-004E:

```text
finish internal command, migration and focused PostgreSQL integration coverage
-> run Prisma validation and all quality gates
-> review the local diff against Issue #54 scope
-> stop for human/ChatGPT review without commit or push
```

Do not begin VAL-004F or `complete-check-in` implementation on this branch.

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
