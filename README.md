# Valet Platform

Digital operating system for valet operations.

This repository starts from product/domain documentation before implementation.  
The original concept document is preserved under `docs/reference/`.

## AI agent startup order

Every AI agent working on this repository MUST read, in order:

1. `AGENTS.md`
2. `docs/00_SOURCE_OF_TRUTH.md`
3. `docs/01_PRODUCT_SCOPE.md`
4. `docs/02_DOMAIN_MODEL.md`
5. `docs/03_DATABASE_SCHEMA.md`
6. `docs/04_VALET_SESSION_STATE_MACHINE.md`
7. `docs/05_ENGINEERING_RULES.md`
8. `docs/06_SECURITY_AND_DATA_RULES.md`
9. `docs/07_DEFINITION_OF_DONE.md`
10. `docs/08_DECISIONS_LOG.md`
11. `docs/09_TECH_STACK.md`
12. `docs/10_REPOSITORY_STRUCTURE.md`
13. `docs/11_REQUIREMENTS_TRACEABILITY.md`
14. `docs/12_AGENT_EXECUTION_PLAN.md`
15. `docs/13_COLLABORATION_WORKFLOW.md`
16. `CONTRIBUTING.md`

## MVP surfaces

- Valet Employee PWA
- Customer Web Experience via QR/SMS secure link
- Management Dashboard
- Backend API

## Core domain

`ValetSession` is the center of the operational model.

```text
INTAKE
  -> PARKING
  -> PARKED
  -> RETRIEVAL_REQUESTED
  -> RETRIEVAL_ASSIGNED
  -> RETRIEVING
  -> READY
  -> RELEASED
```

Do not start feature implementation before reading the binding documentation.

## Collaboration

All work is performed on short-lived branches and merged through Pull Requests.

Read:

- `CONTRIBUTING.md`
- `docs/13_COLLABORATION_WORKFLOW.md`

GitHub Issues define the task boundary; AI agents must not silently expand scope.

Required CI checks before merge:

```text
lint
typecheck
test
build
```

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
