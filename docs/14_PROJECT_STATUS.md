# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-11` (VAL-004Q local implementation session)
- Repository: `veletpro0-lgtm/valet-platform`
- Required accepted-decision baseline: `9c92649378786fac7a0fc31cde8e86221d6c1f2a`
- Active branch: `chore/VAL-004Q-architecture-guard`
- Active task: VAL-004Q — Pre-Phase-3 Architecture Guard
- Verification basis: owner-supplied VAL-004Q task packet and accepted DEC-028

## Current Milestone

**Phase 2 — Core custody domain + check-in**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, deterministic demo/seed data, and the pre-Phase-2 local-security hardening gate are merged to `main`.

VAL-004N is **MERGED / COMPLETED** through PR #73, merge commit
`53e674464c6f3973da9202ce68fc8131af8447e1`. VAL-004O is **MERGED / COMPLETED**
through PR #75, merge commit `89ffc2f0bbd1f386b9da11b5f871c85c3cb15cce`.
VAL-004P is **MERGED / COMPLETED** through PR #77, merge commit
`7b84ee5f6aa3a605d589dc4651ac5920031f9124`. Cleanup A and Cleanup B are
complete. VAL-004Q is the active Cleanup C architecture-guard slice; the full
Pre-Phase-3 Structural Cleanup is not complete until its PR is merged, Phase 3
has not started, and Phase 2 is not yet
declared production-ready. No fresh post-fix Standard Security Scan is claimed.

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

### VAL-004M — Shared Durable Anti-Abuse Boundary

- PR #71
- Merge commit: `56a7c4584f588e61513f728f34958ef497b86b01`
- Status: **MERGED / COMPLETED**
- Result: accepted DEC-024 PostgreSQL-backed exact rolling-window staff and
  guest anti-abuse enforcement with scoped HMAC keys, trusted client-address
  resolution, bounded advisory locking, fail-closed behavior, fixed cleanup,
  and least-privilege runtime access

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

### VAL-004Q — Pre-Phase-3 Architecture Guard

- Branch: `chore/VAL-004Q-architecture-guard`
- Status: **ACTIVE — LOCAL IMPLEMENTATION / VALIDATION**
- Accepted decision baseline: `1501253e766bed93e3498960294a3777493947a1`
- Expected database state on this branch: **18 forward-only migrations**

Objective:
Implement accepted DEC-028 with repository-owned resolved import-direction and
retired-symbol guards, ESLint fast feedback, focused regression coverage, and
CI integration without changing application behavior.

VAL-004Q does not change schema, migrations, dependencies, public routes,
authentication, anti-abuse semantics, custody behavior, or Phase 3 scope. Phase
2 remains gated on secure staff provisioning/admin onboarding, external deployment evidence, and the final
closure/security-integrity review including a fresh Standard Security Scan.

## Remaining Phase 2 Check-In Gate

VAL-004L staff authentication, VAL-004M shared anti-abuse, VAL-004N production
database hardening, VAL-004O Cleanup A, and VAL-004P Cleanup B are merged.
VAL-004Q Cleanup C is active. Phase 2 is not production-ready until Cleanup C
is merged, the provider-owned checklist has real evidence, and the final Phase 2
closure/security-integrity review including a fresh Standard Security Scan is
completed.

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
VAL-004N  Production Database / Network / TLS / Credential Hardening
VAL-004O  Shared Runtime Infrastructure Cleanup (Cleanup A)
VAL-004P  Feature Ownership Cleanup (Cleanup B)
VAL-004Q  Pre-Phase-3 Architecture Guard (Cleanup C)
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
- VAL-004L adds migration 17; VAL-004M adds migration 18. VAL-004N adds no
  migration and leaves migrations 1–18 unchanged.
- `docs/04_VALET_SESSION_STATE_MACHINE.md` is the single detailed source for the locked `complete-check-in` contract; other docs should point to it rather than duplicate/reinterpret it.
- DEC-023 is the accepted staff-authentication contract; existing custody commands remain authoritative for tenant, Location and role authorization.
- DEC-024 is the accepted shared anti-abuse contract; limiter buckets never authenticate or authorize a User, tenant, Location, membership, role or guest session.
- DEC-025 is the accepted production database connection/credential contract;
  repository enforcement must remain distinct from provider-owned network,
  secret, backup, and restore evidence.
- Do not pull Hybrid Dispatch/Task, parking/key, retrieval, handoff, payment or notification behavior into `complete-check-in`.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.

## Exact Next Step

For VAL-004Q:

```text
implement architecture dependency/retirement guards and focused regression coverage
-> run all quality gates and architecture:check
-> review the local diff against DEC-028 and the VAL-004Q task scope
-> commit and push the assigned implementation branch after all gates pass
```

Do not begin Phase 3 on this branch. Cleanup C remains active until its PR is merged. Do not
declare Phase 2 production-ready and do not claim a fresh Standard Security
Scan was run.

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
