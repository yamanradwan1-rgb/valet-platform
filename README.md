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
copy .env.example .env
# Set distinct admin and runtime passwords in the local .env.
docker compose up -d postgres
corepack pnpm --filter @valet/database migrate:deploy
corepack pnpm --filter @valet/database runtime:provision
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

`pnpm build` is the deterministic repository verification build. It still runs
real production-mode package builds, while root orchestration supplies the
non-secret verification-only `API_ORIGIN=http://127.0.0.1:3001`. Production
verification also clears any caller-specific `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN`
so that local ambient configuration cannot change the verification artifact.
Production builds use `pnpm build:production`; callers must supply their real
required `API_ORIGIN`, and Customer production validation remains fail-closed
when it is missing or invalid.

Focused test gates are available as `pnpm test:non-postgres`,
`pnpm test:postgres:api`, `pnpm test:postgres:database`, and
`pnpm test:platform`. CI owns these through separate unit, API PostgreSQL,
database PostgreSQL, and Ubuntu/Windows platform lanes, while `quality`
aggregates every required correctness job. The live PostgreSQL and platform
checks execute directly without Turbo test-result caching. The PostgreSQL lanes
use the bounded 01A profiles; they are isolated by CI service and are not
sharded.

Docker Compose publishes PostgreSQL only on `127.0.0.1:5432`. Keep `.env`
local and do not commit it.

`POSTGRES_USER` and `POSTGRES_PASSWORD` initialize the local migration/admin
role. `MIGRATION_DATABASE_URL` uses that role for Prisma migrations and runtime
role provisioning. `DATABASE_URL` uses a distinct, restricted application role
whose password is taken from the URL by the provisioning command. Use this
deployment order: apply migrations, run `runtime:provision` to reconcile current
and future table grants, then start applications with `DATABASE_URL`. The runtime
role receives application `SELECT`, `INSERT`, and `UPDATE` privileges but no
blanket `DELETE` or `TRUNCATE`. It receives only `SELECT` and `INSERT` on
`audit_events` and cannot own or change schema objects.

An existing PostgreSQL volume retains its initialized passwords, roles and
database state. Changing `POSTGRES_USER` in `.env` from `valet` to
`valet_admin` does not rename or create that role in an initialized volume.
Developers may keep the existing admin role and point `MIGRATION_DATABASE_URL`
to it, explicitly create/rename the admin role when they understand the database
operation, or recreate the disposable local development volume when preservation
is unnecessary. Recreating the volume removes its local database data.

To intentionally load the synthetic demo dataset, set
`VAYLET_ALLOW_DEMO_SEED=true` in the local `.env`, keep
`NODE_ENV=development`, confirm that `DATABASE_URL` targets
`127.0.0.1:5432/valet` (or `localhost:5432/valet`), and run:

```text
corepack pnpm --filter @valet/database seed
```

Return `VAYLET_ALLOW_DEMO_SEED` to `false` after seeding. The seed refuses
unknown environments, remote hosts and non-demo database names.

Application development ports:

- Valet employee app: `http://localhost:3000`
- API and Swagger: `http://localhost:3001` and `http://localhost:3001/docs`
- Customer experience: `http://localhost:3002`
- Management dashboard: `http://localhost:3003`

## Deterministic local smoke harness

For local Employee/Customer smoke testing, three development-only commands
remove manual database inspection and fixing:

```text
corepack pnpm local:bootstrap
corepack pnpm local:status
corepack pnpm local:smoke
```

- `local:bootstrap` verifies safety guards (`NODE_ENV=development`, loopback
  PostgreSQL host, database exactly `valet`; it aborts before any destructive
  action otherwise), ensures the Compose `postgres` service is running, resets
  the local schema, applies migrations, provisions the runtime role, loads the
  canonical demo seed, makes `valet@vaylet.demo.invalid` login-capable with
  password `VayletPassword123!` using the official staff provisioning hashing,
  clears stale staff auth/anti-abuse state, and prints the deterministic
  KeySlot/parking-spot occupancy summary. Repeated runs converge to the same
  state; `K-03` and `K-04` are guaranteed FREE afterwards.
- `local:status` is strictly read-only (executed inside a `READ ONLY`
  transaction) and prints database identity, demo employee login health,
  KeySlot/parking-spot occupancy, and staff auth session / anti-abuse event
  counts without ever printing hashes or tokens.
- `local:smoke` bootstraps, builds contracts and the API, then starts the
  compiled API on port 3001 plus the Employee (3000) and Customer (3002) apps,
  tagging each process's output and stopping everything if any process fails.
  It supplies local-only child configuration itself (`NODE_ENV=development`,
  localhost staff origin, localhost API/customer origins) and generates
  in-memory local HMAC secrets when the repository `.env` leaves them blank;
  generated secrets are never written to disk or printed, and production
  validation/defaults are untouched.

All lifecycle smoke actions (Check-In, Parking, Retrieval, Guest Access,
Handoff) remain web-only product flows; this tooling only bootstraps the local
environment and reports read-only diagnostics.
