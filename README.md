# VAYLET Platform

B2B SaaS digital operating system for valet operations.

This repository starts from approved product/domain documentation before implementation.

The latest approved product direction is **VAYLET Founder & Product Blueprint v1.0 (August 2026)**, reconciled into the repository through accepted decisions and `docs/15_BLUEPRINT_V1_REBASELINE.md`.

The original concept document remains preserved under `docs/reference/` as historical product intent.

## AI agent startup order

Every AI agent working on this repository MUST begin with:

1. `AGENTS.md` — authority order and mandatory rules
2. `docs/14_PROJECT_STATUS.md` — operational handoff snapshot, then verify GitHub state
3. `docs/00_SOURCE_OF_TRUTH.md`
4. `docs/08_DECISIONS_LOG.md`
5. `docs/15_BLUEPRINT_V1_REBASELINE.md`
6. `docs/01_PRODUCT_SCOPE.md`
7. `docs/04_VALET_SESSION_STATE_MACHINE.md`
8. `docs/03_DATABASE_SCHEMA.md`
9. `docs/02_DOMAIN_MODEL.md`
10. `docs/09_TECH_STACK.md`
11. `docs/05_ENGINEERING_RULES.md`
12. `docs/06_SECURITY_AND_DATA_RULES.md`
13. `docs/07_DEFINITION_OF_DONE.md`
14. `docs/10_REPOSITORY_STRUCTURE.md`
15. `docs/11_REQUIREMENTS_TRACEABILITY.md`
16. `docs/12_AGENT_EXECUTION_PLAN.md`
17. `docs/13_COLLABORATION_WORKFLOW.md`
18. `CONTRIBUTING.md`
19. the assigned GitHub Issue/task

When operational state matters, actual GitHub Issues/PRs/branches/main override a stale `PROJECT_STATUS` snapshot.

## Product surfaces

- Valet Employee App / web terminal
- Guest/Customer Web Experience through secure phone link / WhatsApp-SMS and QR fallback
- Management / Operations Dashboard
- Backend API

A mandatory consumer app/account is not required for the sellable MVP.

## Core physical custody lifecycle

`ValetSession` is the center of the vehicle physical-custody model.

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

Hybrid Dispatch assignment/acceptance/reassignment is a separate Task lifecycle and must not be collapsed into ValetSession state.

## Sellable-MVP direction

Approved product capabilities include, through their scheduled focused tasks:

- multi-tenant Company/Location foundation
- base roles/permissions and location access
- assistive OCR/ANPR with confirm/edit + manual fallback
- condition check with photos optional by default/configurable
- QR key slots
- parking zones/spots with optional QR
- basic Hybrid Dispatch
- guest vehicle request/retrieval flow
- Dynamic one-time QR or 4-digit pickup-code handoff
- configurable Maps + Parking/Retrieval task-scoped tracking
- digital payments plus cash/validation/tips
- Black Box/audit + basic incidents
- Configuration First management behavior
- reports/export
- Arabic/English + RTL/LTR
- offline-friendly employee actions

Advanced prediction/optimization and custom hardware remain later-phase work unless explicitly approved.

## Configuration First

Normal approved customer/location operating-policy differences should use:

```text
Company default -> Location override
```

Do not invent one generic untyped settings blob in an unrelated task. Typed configuration is introduced as the corresponding feature is implemented.

## Collaboration

All work is performed on short-lived task branches and merged through Pull Requests.

Read:

- `CONTRIBUTING.md`
- `docs/13_COLLABORATION_WORKFLOW.md`

GitHub Issues define task boundaries; AI agents must not silently expand scope.

One active migration owner is preferred while database foundations remain high-contention.

Required generic CI checks before merge:

```text
lint
typecheck
test
build
```

Task-specific database/security/integration verification may also be required.

## Phase 0 local development

Requirements:

- Node.js 22 or newer
- Corepack with pnpm 10.34.5
- Docker with Docker Compose

Install and validate the workspace:

```text
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Application development ports:

- Valet employee app: `http://localhost:3000`
- API and Swagger: `http://localhost:3001` and `http://localhost:3001/docs`
- Customer experience: `http://localhost:3002`
- Management dashboard: `http://localhost:3003`
