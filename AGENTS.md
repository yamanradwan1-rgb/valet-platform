# AGENTS.md — Mandatory AI Agent Instructions

Status: Binding

## 1. Mission

Build the Valet MVP described by the repository documentation.

The product is a digital operating system for valet businesses, not a generic parking marketplace and not an "Uber for valet".

## 2. Authority order

When instructions conflict, use this order:

1. Explicit latest instruction from the project owner.
2. `docs/08_DECISIONS_LOG.md` entries marked `Accepted`.
3. `docs/01_PRODUCT_SCOPE.md`.
4. `docs/04_VALET_SESSION_STATE_MACHINE.md`.
5. `docs/03_DATABASE_SCHEMA.md`.
6. `docs/02_DOMAIN_MODEL.md`.
7. `docs/09_TECH_STACK.md`.
8. `docs/05_ENGINEERING_RULES.md`.
9. `docs/06_SECURITY_AND_DATA_RULES.md`.
10. `docs/13_COLLABORATION_WORKFLOW.md` for collaboration/process rules.
11. `CONTRIBUTING.md`.
12. Original concept PDF for product intent.

Never silently resolve a material conflict. Record the resolution as a decision.

## 3. Mandatory pre-code protocol

Before implementing a feature:

1. Read the relevant docs.
2. Name the affected entities.
3. Name the affected ValetSession transitions.
4. Identify authorization/tenant impact.
5. Identify required DB constraints and indexes.
6. Confirm the feature is inside MVP scope.
7. Update design docs first if agreed behavior changes.
8. Then implement.
9. Add tests.
10. Verify the Definition of Done.

## 4. Scope discipline

Do NOT add any of the following unless explicitly approved:

- AI damage detection
- automatic plate recognition
- vehicle make/model recognition
- GPS tracking
- reservations
- consumer marketplace
- Valet+ loyalty/subscription network
- Anywhere Valet
- smart key locker hardware integration
- microservices
- Kubernetes
- Kafka/event-streaming infrastructure
- advanced BI warehouse
- multi-region infrastructure

Do not add speculative abstractions solely because they may be useful later.

## 5. Architecture

MVP architecture is a modular monolith.

Applications:

- `apps/api`
- `apps/valet`
- `apps/customer`
- `apps/dashboard`

Shared packages:

- `packages/database`
- `packages/contracts`
- `packages/ui`
- `packages/config`
- `packages/testing`

The backend owns business rules.

## 6. Core domain rules

- `ValetSession` is the core operational aggregate.
- Session state can change only through explicit domain commands.
- Never expose a generic endpoint that accepts arbitrary session state.
- State mutation and audit event must commit atomically.
- Audit history is append-only.
- Operational history must not be hard-deleted.
- Payment state is independent from ValetSession state.
- Incident state is independent from ValetSession state.
- Notification state is independent from ValetSession state.
- Photo/upload state is independent from ValetSession state.
- Current parking/key assignment and historical movement must both be representable.
- Vehicle release requires valid handoff verification unless an authorized, reasoned and audited manager override is used.

## 7. Multi-tenancy

Every business-owned operational record must belong to an organization directly or through a parent relation.

Never trust `organization_id`, `location_id`, membership IDs or resource ownership values supplied by a client without authorization checks.

Cross-tenant access is a critical defect.

## 8. Data integrity

Prefer database-enforced integrity.

Use:

- foreign keys
- unique constraints
- check constraints
- partial unique indexes where appropriate
- transactions
- optimistic concurrency/versioning for contested operational mutations
- idempotency keys for retryable operations

Never use free-form status strings when the domain defines controlled values.

## 9. Security

- Never commit secrets.
- Never log plaintext OTPs, passwords, customer access tokens or payment card details.
- Passwords must be securely hashed.
- Customer public access uses unguessable scoped tokens.
- OTPs expire, have attempt limits, are stored hashed and are one-time use.
- Vehicle photos are private by default.
- Sensitive operations are audited.
- Never expose sequential internal identifiers as guest access URLs.
- Validate upload type, size and ownership.

## 10. Database changes

For every database change:

1. Update `docs/03_DATABASE_SCHEMA.md`.
2. Add a new migration.
3. Never rewrite an already-applied migration to hide a later change.
4. Update test fixtures/seeds when relevant.
5. Add constraint/invariant tests.

## 11. AI agent behavior

If something is ambiguous:

- Do not invent a product feature.
- Choose the simplest reversible interpretation consistent with binding docs.
- If behavior materially changes the product, add a `Proposed` decision and stop that behavior from becoming silently permanent.
- Do not refactor unrelated parts of the codebase while completing a focused task.
- Do not replace a chosen technology without an accepted decision.
- Do not mark work complete when tests are failing.


## 12. Collaboration and Git rules

AI agents participate in the same Git workflow as human contributors.

- Never work directly on `main`.
- Work only on the branch/task owned by the human contributor invoking the agent.
- Read the assigned GitHub Issue/task before implementation.
- Stay inside the task's allowed scope.
- If a material dependency requires an out-of-scope change, report it instead of silently implementing it.
- Do not allow two agents to edit the same working tree concurrently.
- Do not merge your own work merely because your own tests/review say it is correct.
- Pull Requests must pass repository CI before merge.
- Prefer cross-review by the other human contributor, optionally assisted by their AI agent.

High-contention files require explicit coordination before parallel edits:

```text
AGENTS.md
CONTRIBUTING.md
docs/00_SOURCE_OF_TRUTH.md
docs/01_PRODUCT_SCOPE.md
docs/02_DOMAIN_MODEL.md
docs/03_DATABASE_SCHEMA.md
docs/04_VALET_SESSION_STATE_MACHINE.md
docs/08_DECISIONS_LOG.md
docs/09_TECH_STACK.md
docs/13_COLLABORATION_WORKFLOW.md
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
```

Until the database foundation is stable, prefer a single active migration owner at a time.

See `docs/13_COLLABORATION_WORKFLOW.md`.

## 13. Core success criterion


The MVP must support a real valet operation handling approximately 100–200 vehicles during a busy night with:

- minimal check-in friction
- reliable parking/key location
- customer retrieval requests
- secure handoff
- complete chain of custody
- operational visibility
- no dependency on paper tickets
