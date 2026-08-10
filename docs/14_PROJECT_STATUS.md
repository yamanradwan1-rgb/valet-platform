# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-10` (VAL-004M local implementation session)
- Repository: `veletpro0-lgtm/valet-platform`
- Required accepted-decision baseline: `02b77c3`
- Active branch: `feat/VAL-004M-shared-durable-anti-abuse`
- Active task: VAL-004M — Implement Shared Durable Anti-Abuse Boundary
- Verification basis: owner-supplied VAL-004M task packet, required local branch/HEAD preflight, accepted DEC-024 and focused real-HTTP/runtime-role PostgreSQL integration coverage

## Current Milestone

**Phase 2 — Core custody domain + check-in**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, deterministic demo/seed data, and the pre-Phase-2 local-security hardening gate are merged to `main`.

The Phase 2 check-in slices through VAL-004L are present on this branch baseline. VAL-004M implements accepted DEC-024 as the shared durable PostgreSQL-backed anti-abuse boundary for staff login and guest session resolution while preserving the existing authentication, guest-token and custody-authorization contracts. It does not start Phase 3 and does not claim production readiness.

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

The Phase 2 branch history additionally contains VAL-004C migration 15, `20260809001500_check_in_intake_persistence`. VAL-004D adds no migration. VAL-004E adds migration 16, `20260810001600_intake_session_creation`. VAL-004L adds migration 17, `20260810001700_staff_authentication`. VAL-004M adds migration 18, `20260810001800_shared_durable_anti_abuse`.

The Phase 1 schema already contains the persistence used by the first Phase 2 command, including:

- Vehicle known-plate / DEC-020 temporary-descriptor identity foundation
- ValetSession `CHECKING_IN`, `AWAITING_PARKING`, `version`, `checking_in_completed_at`, checked-in actor and hashed guest-access fields
- AuditEvent Black Box persistence
- tenant/location-safe relationships

Merged VAL-004C provides migration 15 for `ConditionNote`, `VehiclePhoto`, explicit condition-completion evidence and typed required-photo policy storage.

## Current Task

### VAL-004M — Shared Durable Anti-Abuse Boundary

- Branch: `feat/VAL-004M-shared-durable-anti-abuse`
- Status: **IMPLEMENTED LOCALLY — QUALITY/SECURITY REVIEW IN PROGRESS**
- Accepted decision baseline: `02b77c3`
- Expected database state on this branch: **18 forward-only migrations**

Objective:
Implement accepted DEC-024 exact rolling staff-address, staff-identifier,
guest-address and guest-token limits using shared PostgreSQL state, scoped HMAC
keys, trusted client-address resolution, bounded transaction advisory locks,
database-authored retry timing, fixed cleanup and least-privilege runtime access.

VAL-004M does not implement MFA, signup/reset, device management, Redis, WAF,
CAPTCHA or Phase 3 operations. Production deployment remains gated on
production database/network/TLS/credential hardening and the other documented
deployment controls.

## Remaining Phase 2 Check-In Gate

VAL-004L's staff-authentication core and VAL-004M's shared anti-abuse boundary are implemented on the current branch history. Phase 2 is not production-ready until production database/network/TLS/credential hardening and the remaining deployment controls are implemented and reviewed.

## Phase 2 Focused Task Sequence

The current binding execution plan preserves the original nine check-in slices plus focused security/integrity follow-ups:

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
VAL-004J  Cross-Location Shared Vehicle Identity Guard
VAL-004K  Verified Condition-Photo Evidence Guard
VAL-004L  Production Staff Authentication
VAL-004M  Shared Durable Anti-Abuse Boundary
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
- VAL-004L adds migration 17; VAL-004M adds only migration 18 and leaves migrations 1–17 unchanged.
- `docs/04_VALET_SESSION_STATE_MACHINE.md` is the single detailed source for the locked `complete-check-in` contract; other docs should point to it rather than duplicate/reinterpret it.
- DEC-023 is the accepted staff-authentication contract; existing custody commands remain authoritative for tenant, Location and role authorization.
- DEC-024 is the accepted shared anti-abuse contract; limiter buckets never authenticate or authorize a User, tenant, Location, membership, role or guest session.
- Do not pull Hybrid Dispatch/Task, parking/key, retrieval, handoff, payment or notification behavior into `complete-check-in`.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

For VAL-004M:

```text
finish shared durable anti-abuse implementation and coverage
-> run all quality gates
-> review the local diff against DEC-024 and the VAL-004M task scope
-> commit and push the assigned implementation branch after all gates pass
```

Do not begin Phase 3 on this branch. Do not declare Phase 2 production-ready until production DB/network/TLS/credential hardening and remaining deployment controls are complete.

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
