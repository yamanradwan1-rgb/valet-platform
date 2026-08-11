# AGENTS.md — Mandatory AI Agent Instructions

Status: Binding

## 1. Mission

Build the VAYLET product described by the repository documentation.

VAYLET is a B2B SaaS digital operating system for valet operations. In the base company model, VAYLET does not employ valet drivers or take direct custody of customer vehicles; the operator/hotel/valet company remains responsible for field operations, staffing and insurance.

The product is not a generic parking marketplace and not an "Uber for valet".

## 2. Authority order

When instructions conflict, use this order:

1. Explicit latest instruction from the project owner.
2. `docs/08_DECISIONS_LOG.md` entries marked `Accepted`.
3. `docs/15_BLUEPRINT_V1_REBASELINE.md` for the approved Founder & Product Blueprint v1.0 implementation bridge.
4. `docs/01_PRODUCT_SCOPE.md`.
5. `docs/04_VALET_SESSION_STATE_MACHINE.md`.
6. `docs/03_DATABASE_SCHEMA.md`.
7. `docs/02_DOMAIN_MODEL.md`.
8. `docs/09_TECH_STACK.md`.
9. `docs/17_AGENT_CODE_STRUCTURE_RULES.md` for mandatory code-structure and file-size constraints.
10. `docs/05_ENGINEERING_RULES.md`.
11. `docs/06_SECURITY_AND_DATA_RULES.md`.
12. `docs/13_COLLABORATION_WORKFLOW.md` for collaboration/process rules.
13. `CONTRIBUTING.md`.
14. Original concept PDF for historical product intent.

The Founder & Product Blueprint v1.0 is the latest approved product direction. Until its PDF is committed into `docs/reference`, `docs/15_BLUEPRINT_V1_REBASELINE.md` is the repository-native bridge that records its implementation-relevant decisions.

Never silently resolve a material conflict. Record the resolution as a decision.

## 3. Mandatory pre-code protocol

Before implementing a feature:

1. Read the relevant docs, including `docs/17_AGENT_CODE_STRUCTURE_RULES.md` for every code-changing task.
2. Name the affected entities.
3. Name the affected ValetSession transitions and Task/Dispatch transitions, if any.
4. Identify authorization/tenant/location impact.
5. Identify required DB constraints and indexes.
6. Identify configuration-policy impact and Company-default/Location-override behavior where applicable.
7. Confirm the feature is inside the approved MVP/V2/Enterprise boundary.
8. Inspect intended target files and plan extraction before adding code if any target is near or above the 300-line authored-code ceiling.
9. Update design docs first if agreed behavior changes.
10. Then implement.
11. Add tests.
12. Verify the Definition of Done and the structure rules.

## 4. Scope discipline

Do NOT add any of the following unless explicitly approved for the task:

- AI damage detection/comparison
- autonomous vehicle make/model recognition
- VAYLET Qualified / Safety Score
- full ClaimShield
- predictive retrieval or demand prediction
- SmartStack AI
- Curb Control Tower / Demand Autopilot
- reservations
- consumer marketplace
- Anywhere Valet
- smart key locker/vault hardware integration
- NFC/BLE key tags before their approved phase
- POS/PMS/SSO integrations before their approved phase unless a pilot explicitly requires them
- advanced BI/data warehouse
- microservices
- Kubernetes
- Kafka/event-streaming infrastructure
- multi-region infrastructure

The following are approved sellable-MVP capabilities and must not be treated as automatically out of scope:

- OCR/ANPR plate scan with confirm/edit and manual fallback
- configurable condition-photo policy, optional by default
- QR key slots
- parking zones/spots with optional QR
- maps and configurable Parking/Retrieval task-scoped session tracking
- basic Hybrid Dispatch
- secure Dynamic QR or 4-digit pickup-code handoff
- basic payments, cash, validation and tips
- Configuration First behavior
- Arabic/English with RTL/LTR
- offline-friendly employee actions

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

Provider-specific OCR, maps, messaging, payments and object storage must stay behind application boundaries/adapters where practical.

All authored code must also follow `docs/17_AGENT_CODE_STRUCTURE_RULES.md`; agents must not grow god files or bypass the 300-line policy through compressed formatting.

## 6. Core domain rules

- `ValetSession` is the core physical custody aggregate.
- Session state can change only through explicit domain commands.
- Task/Dispatch assignment lifecycle is separate from the physical ValetSession lifecycle.
- Never expose a generic endpoint that accepts arbitrary session/task state.
- Protected state mutation and audit event must commit atomically.
- Black Box/audit history is append-only; corrections create new events.
- Operational history must not be hard-deleted.
- Payment state is independent from ValetSession state.
- Incident state is independent from ValetSession state.
- Notification state is independent from ValetSession state.
- Photo/upload state is independent from ValetSession state.
- Current parking/key assignment and historical movement/custody must both be representable.
- Vehicle release requires valid allowed handoff verification unless an authorized, reasoned and audited supervisor/manager override is used.
- Repeated retrieval requests must not create multiple active retrieval tasks for one session.
- OCR/ANPR is assistive: confirm/edit and manual fallback are mandatory.
- GPS/session tracking must follow configured policy and is limited by default to active Parking/Retrieval tasks, not the whole employee shift.

## 7. Multi-tenancy and roles

Every business-owned operational record must belong to an Organization directly or through an enforced parent relation.

Never trust `organization_id`, `location_id`, membership IDs or resource ownership values supplied by a client without authorization checks.

Cross-tenant access is a critical defect.

Current tenant membership role contract:

- `ORG_ADMIN` = Blueprint Company Admin
- `LOCATION_MANAGER`
- `VALET_SUPERVISOR`
- `VALET_EMPLOYEE`

Guest/Customer is not a staff membership. VAYLET Super Admin is platform-level, not an OrganizationMembership. Venue Client persistence/access representation remains a dedicated future schema decision; do not invent it inside an unrelated task.

## 8. Configuration First

Normal operating differences between customers/locations should be configurable from the Dashboard rather than hard-coded when the Blueprint identifies them as policy.

Use this precedence when applicable:

```text
Company default -> Location override
```

Do not respond by creating one untyped catch-all JSON settings object without an accepted schema decision. Introduce typed configuration contracts as the corresponding features are implemented.

## 9. Data integrity

Prefer database-enforced integrity.

Use:

- foreign keys
- unique constraints
- check constraints
- partial unique indexes where appropriate
- transactions
- optimistic concurrency/versioning for contested operational mutations
- idempotency keys for retryable/offline-friendly operations

Never use free-form status strings when the domain defines controlled values.

## 10. Security and privacy

- Never commit secrets.
- Never log plaintext OTPs/pickup codes, passwords, customer access tokens or payment card details.
- Passwords must be securely hashed.
- Customer public access uses unguessable scoped tokens.
- Verification codes/QR secrets expire, have attempt/rate limits where applicable, and are single-use.
- Vehicle photos are private by default.
- Sensitive actions are audited.
- Never expose sequential internal identifiers as guest access URLs.
- Validate upload type, size and ownership.
- Admin access must follow least privilege; production Company Admin and VAYLET Super Admin require MFA.
- Guest endpoints require anti-abuse/rate limiting as they become externally usable.
- Session tracking must not become continuous employee surveillance by default.

## 11. Database changes

For every database change:

1. Update `docs/03_DATABASE_SCHEMA.md`.
2. Add a new migration.
3. Never rewrite an already-applied migration to hide a later change.
4. Update test fixtures/seeds when relevant.
5. Add constraint/invariant tests.

## 12. AI agent behavior

If something is ambiguous:

- Do not invent a product feature or schema.
- Choose the simplest reversible interpretation consistent with binding docs only when the ambiguity is non-material.
- If behavior materially changes the product, add/request a `Proposed` decision and stop that behavior from becoming silently permanent.
- Preserve explicit Blueprint distinctions between MVP, V2 and Enterprise.
- Do not refactor unrelated parts of the codebase while completing a focused task.
- Do not replace a chosen technology without an accepted decision.
- Do not mark work complete when tests are failing.
- Do not create or grow a code file beyond the structural rules in `docs/17_AGENT_CODE_STRUCTURE_RULES.md`.

## 13. Collaboration and Git rules

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
docs/15_BLUEPRINT_V1_REBASELINE.md
docs/17_AGENT_CODE_STRUCTURE_RULES.md
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
```

Until the database foundation is stable, prefer a single active migration owner at a time.

See `docs/13_COLLABORATION_WORKFLOW.md`.

## 14. Core success criterion

The first paid-customer-ready product must support a real valet operation for a full shift with:

- fast check-in, targeting roughly 15–20 seconds in the normal low-friction path when photos are not required
- reliable parking/key custody
- customer retrieval requests
- Hybrid Dispatch/reassignment
- secure handoff
- complete Black Box/chain of custody
- configurable operating policies
- operational visibility/reporting
- Arabic/English guest/employee experience
- no dependency on paper tickets
- no daily developer dependency for normal location configuration

The pilot must measure real operational KPIs rather than feature quantity.