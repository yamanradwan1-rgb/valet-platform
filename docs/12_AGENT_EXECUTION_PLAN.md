# AI Agent Execution Plan

Status: Binding initial work sequence  
Version: 0.1

The agent must not attempt to build the whole product in one pass.

## Phase 0 — Bootstrap only

Goal:
Create a healthy monorepo matching `09_TECH_STACK.md` and `10_REPOSITORY_STRUCTURE.md`.

Tasks:

- initialize pnpm workspace
- configure Turborepo
- configure TypeScript strict mode
- scaffold NestJS API
- scaffold Next.js valet/customer/dashboard apps
- create shared packages
- configure lint/typecheck/test scripts
- make local PostgreSQL available with Docker Compose
- establish `.env.example`
- generate lockfile

Acceptance:

- install succeeds
- lint succeeds
- typecheck succeeds
- empty/basic tests succeed
- applications can start
- no business feature added

## Phase 1 — Database foundation

Goal:
Implement only the approved logical schema.

Tasks:

- translate `03_DATABASE_SCHEMA.md` into Prisma schema
- create initial migration
- implement critical unique/check/index protections, using SQL migrations when Prisma schema cannot express them cleanly
- seed one demo organization/location/admin/employee, parking spots and key slots
- add DB constraint tests

Do NOT create UI features in this phase.

## Phase 2 — ValetSession domain/state machine

Goal:
Implement the core domain without UI.

Tasks:

- implement state enum
- implement explicit transition commands
- implement guards
- implement optimistic concurrency
- implement append-only audit event creation
- wrap transition + audit in one transaction
- implement tests for every allowed/forbidden transition
- implement idempotent retrieval request behavior
- implement concurrent assignment protection

Acceptance:
`04_VALET_SESSION_STATE_MACHINE.md` is fully enforced by tests.

## Phase 3 — Authentication and tenancy

Goal:
Make all staff access tenant-safe.

Tasks:

- staff authentication
- organization memberships
- location permissions
- role guards
- tenant-scoped repositories/services
- cross-tenant negative tests

## Phase 4 — Core valet intake

Goal:
Complete:

vehicle receive -> photos -> parking/key -> PARKED

No OCR/AI.

## Phase 5 — Customer retrieval

Goal:
Complete:

secure customer link -> request -> queue -> assignment -> retrieving -> ready

## Phase 6 — Secure handoff

Goal:
Implement OTP issuance/verification and READY -> RELEASED.

Add manager override only with strict role/reason/audit behavior.

## Phase 7 — Dashboard

Goal:
Operational views only:

- active vehicles
- retrieval queue
- employees/shifts
- session timeline
- incidents
- basic timing/count metrics

## Phase 8 — Integration adapters

Add actual providers only after core workflow is stable:

- SMS
- object storage
- payment if enabled for pilot

## Phase 9 — Offline support

Only after online flow is stable and measured.

Do not redesign the domain for offline; build on the idempotency/versioning foundations already required.

## Agent task sizing

Each pull request/task should have one focused objective.

Do not combine database foundation, authentication, UI, payments and offline sync into one change.


## Collaboration gate for every phase

Before starting a phase/task:

- create or assign a scoped GitHub Issue
- confirm one human owner
- create a short-lived branch from current `main`
- identify whether high-contention files are involved
- avoid parallel edits to the same critical files
- use the Pull Request template
- pass CI before merge
- cross-review whenever practical

See `docs/13_COLLABORATION_WORKFLOW.md`.
