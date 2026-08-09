# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-09 18:10 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Remote `main`: `def431b07e7de2cd77c60c43c6478e0792ecd085`
- Local user-reported `main`: clean and synced to `def431b07`
- Verification basis: merged PR #41 / VAL-003O, closed Issue #40, current GitHub `main`, and user-reported local sync

## Current Milestone

**Phase 2 — Core custody domain + check-in**

Phase 0 is complete.

Phase 1 is **COMPLETE**. The planned multi-tenant persistence foundation, custody-supporting entities, financial persistence foundation, Incident/Notification persistence, database integrity coverage, and deterministic demo/seed data are merged to `main`.

No Phase 2 implementation task is active yet. Before implementation, create/assign a focused Issue and branch from current `main` according to `docs/12_AGENT_EXECUTION_PLAN.md` and `docs/13_COLLABORATION_WORKFLOW.md`.

## Completed

### Phase 0 — Bootstrap

- PR #1 — `chore: bootstrap monorepo foundation`
- Status: **MERGED / COMPLETED**

### VAL-002A — Lock previous Phase 1 Database Contract

- Issue #2
- PR #3
- Status: **MERGED / COMPLETED**
- Note: historical where later Blueprint v1.0 decisions supersede it

### VAL-002R — Rebaseline Product Contracts to Founder Blueprint v1.0

- Issue #6
- PR #7
- Status: **MERGED / COMPLETED**

### VAL-002B — Tenant & Staff Database Foundation

- Issue #4
- PR #8
- Status: **MERGED / COMPLETED**
- Result: Organization, Location, User, OrganizationMembership, MembershipLocationAccess and Shift foundation

### VAL-003A — No-plate / unreadable Vehicle identity contract

- Issue #9
- PR #10
- Status: **MERGED / COMPLETED**
- Result: DEC-020 accepted

### VAL-003B — Customer & Vehicle Database Foundation

- Issue #11
- PR #12
- Status: **MERGED / COMPLETED**

### VAL-003C — Parking Spot & Key Slot Database Foundation

- Issue #13
- PR #14
- Status: **MERGED / COMPLETED**

### VAL-003D — ValetSession Database Foundation

- Issue #15
- PR #16
- Status: **MERGED / COMPLETED**
- Result: canonical nine-state ValetSession persistence with tenant/location-safe relations and active-session protections

### VAL-003E — Restore Required ValetSession Query Indexes

- Issue #17
- PR #18
- Status: **MERGED / COMPLETED**

### VAL-003F — AuditEvent / Black Box Database Foundation

- Issue #19
- PR #20
- Status: **MERGED / COMPLETED**
- Result: append-only AuditEvent persistence foundation and timeline query support

### VAL-003G — RetrievalRequest Database Foundation

- Issue #22
- PR #23
- Status: **MERGED / COMPLETED**
- Result: requester consistency, tenant safety and one-active-request protection

### VAL-003H — HandoffVerification Database Foundation

- Issue #24
- PR #25
- Status: **MERGED / COMPLETED**
- Result: PICKUP_CODE / DYNAMIC_QR / SUPERVISOR_OVERRIDE persistence foundation without plaintext secrets

### VAL-003I — Lock Payments Persistence Contract

- Issue #26
- PR #27
- Status: **MERGED / COMPLETED**
- Result: DEC-021 accepted payment-centric MVP financial persistence contract

### VAL-003I-A — Clarify Financial Persistence Edge Contracts

- Issue #29
- PR #30
- Status: **MERGED / COMPLETED**
- Result: DEC-022 accepted; zero/positive due transitions, guarded pre-collection payer correction, currency precision boundary, provider retry ownership and Refund row-state matrix clarified

### VAL-003J — Payment + Validation + Tip Database Foundation

- Issue #28
- PR #31
- Status: **MERGED / COMPLETED**
- Result: Payment + Validation persistence with tip on Payment and accepted financial integrity rules

### VAL-003K — CashEntry + PaymentProviderEvent Database Foundation

- Issue #32
- PR #33
- Status: **MERGED / COMPLETED**
- Result: cash receipt/correction history and committed provider-callback replay protection foundation

### VAL-003L — Refund Database Foundation

- Issue #34
- PR #35
- Status: **MERGED / COMPLETED**
- Result: append-only Refund persistence and accepted provider/status/completion matrix

### VAL-003M — Incident Database Foundation

- Issue #36
- PR #37
- Status: **MERGED / COMPLETED**
- Result: tenant/location-safe Incident persistence with status/severity and required query index

### VAL-003N — Notification Database Foundation

- Issue #38
- PR #39
- Status: **MERGED / COMPLETED**
- Result: provider-neutral SMS / WhatsApp / Email Notification persistence with PENDING / SENT / FAILED state integrity

### VAL-003O — Demo / Seed Data Foundation

- Issue #40
- PR #41
- Implementation commit: `da0619c7d424e8200959beadab9b869dd3511353`
- Merge commit: `def431b07e7de2cd77c60c43c6478e0792ecd085`
- Status: **MERGED / COMPLETED**
- Result:
  - deterministic synthetic demo data for the existing Phase 1 schema
  - standard command: `pnpm --filter @valet/database seed`
  - production refusal when `NODE_ENV=production`
  - one-transaction seed with rollback on failure
  - idempotent re-seeding without destructive reset
  - fresh PostgreSQL integration coverage using all 14 migrations
  - first and second seed runs verified with stable logical counts
  - schema, migrations and lockfile unchanged

## Phase 1 Completion Evidence

Current database foundation contains exactly **14 forward-only migrations**, ending with:

```text
20260809001400_notification_foundation
```

VAL-003O adds no migration.

Latest validated database suite after seed work:

```text
392 / 392 tests passed
```

The seed integration coverage itself verifies:

- fresh temporary PostgreSQL database creation
- all 14 migrations applied
- production seed refusal without mutation
- actual seed command succeeds
- actual seed command succeeds a second time
- demo logical row counts remain stable after the second run
- representative tenant/staff/vehicle/session/retrieval/handoff/financial/incident/notification fixtures

PR #41 CI passed lint, typecheck, test and build before merge.

## Current Local / Remote Handoff State

Latest user-reported local state after PR #41 merge:

```text
LOCAL WORKING TREE: clean
LOCAL BRANCH: main
LOCAL main: def431b
origin/main: def431b
```

Remote coordination state:

```text
VAL-003O / Issue #40: CLOSED / COMPLETED
PR #41: MERGED
Phase 1 planned implementation: COMPLETE
Active Phase 2 implementation Issue: NONE YET
```

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

Financial persistence remains payment-centric under DEC-021 with DEC-022 edge clarifications. Phase 6 consumes that persistence for commands/provider/workflows; it does not redesign the Phase 1 foundation without an accepted decision.

## Next Milestone — Phase 2

Per `docs/12_AGENT_EXECUTION_PLAN.md`, Phase 2 is:

**Core custody domain + check-in**

Required work across focused tasks includes:

- explicit ValetSession domain commands and guards
- optimistic concurrency for contested mutations
- protected mutation + append-only AuditEvent atomicity
- customer/guest secure access-link foundation
- vehicle/session creation
- condition check
- configurable photo requirement, optional by default
- plate capture with OCR/ANPR confirm/edit plus permanent manual fallback
- accepted DEC-020 no-plate/unreadable Vehicle fallback
- check-in performance instrumentation

Do not implement Phase 2 as one giant PR. The first Phase 2 task must be scoped into a dedicated Issue before coding.

## Dependencies / Contention

- No Phase 1 migration task remains active.
- `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/**` remain CRITICAL files; modify them only for a focused accepted task that truly needs persistence change.
- Phase 2 protected mutations will contend on ValetSession/domain/audit boundaries; keep command scopes small and explicit.
- Do not pull Hybrid Dispatch/Task persistence into Phase 2 custody commands unless the focused task requires the accepted dependency.
- Venue Client identity, VAYLET Super Admin persistence, country-specific plate normalization and Vehicle merge/deduplication remain separate deferred decisions/tasks.
- First-market digital payment provider remains a later Phase 6 selection/integration decision.

## Exact Next Step

Create and assign the first focused Phase 2 Issue from current `main` before implementation. Scope it narrowly around the first custody/check-in domain command boundary, define authorization/tenant/location/concurrency/AuditEvent requirements, then create its feature branch from the latest merged `main`.

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

Never call a task merged/completed merely because local edits or validation pass.
