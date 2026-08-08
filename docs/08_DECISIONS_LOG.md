# Product / Architecture Decisions Log

Important decisions must not live only in chat.

## Decision template

```text
## DEC-XXX — Title

Status: Proposed | Accepted | Rejected | Superseded
Date: YYYY-MM-DD

Context:
...

Decision:
...

Reason:
...

Consequences:
...

Affected docs/code:
...
```

---

## DEC-001 — MVP uses a modular monolith

Status: Accepted  
Date: 2026-08-08

Decision:
Use a modular monolith. No microservices or Kubernetes for MVP.

Reason:
Prove the operational workflow with low implementation/ops complexity.

---

## DEC-002 — Customer does not require mobile app/account

Status: Accepted  
Date: 2026-08-08

Decision:
Customer MVP is secure web access through a phone-based WhatsApp/SMS link, with QR fallback. No account/app install is mandatory.

Reason:
Avoid installation/registration friction and align with Blueprint v1.0 Guest Friction = Minimum.

---

## DEC-003 — ValetSession is the core physical-custody aggregate

Status: Accepted  
Date: 2026-08-08

Decision:
Each custody visit is one ValetSession with explicit physical-state transitions and immutable Black Box/audit history.

Task/Dispatch assignment lifecycle remains separate from ValetSession physical state.

---

## DEC-004 — Payment lifecycle is separate

Status: Accepted  
Date: 2026-08-08

Decision:
Payment/validation/refund state stays outside the ValetSession physical state machine. Location policy may inspect financial state before handoff/completion.

---

## DEC-005 — Manual plate entry only / OCR outside first MVP

Status: Superseded  
Date: 2026-08-08

Original decision:
Manual plate entry and normal photo evidence complete the workflow without OCR/AI.

Superseded by:
`DEC-012` under Founder & Product Blueprint v1.0.

Reason:
Blueprint v1.0 explicitly brings assistive OCR/ANPR into the sellable MVP while preserving confirm/edit and manual fallback.

---

## DEC-006 — Locked application stack

Status: Accepted  
Date: 2026-08-08

Decision:
Use TypeScript monorepo, pnpm workspaces, Turborepo, NestJS API, Next.js web apps, PostgreSQL, Prisma, Zod contracts, S3-compatible object storage, Docker for local infrastructure.

Exact dependency versions are pinned by the bootstrap lockfile, not by this decision.

---

## DEC-007 — Provider integrations remain adapters

Status: Accepted  
Date: 2026-08-08

Decision:
Messaging, payment, object storage, OCR/ANPR and maps providers should be accessed through application boundaries/adapters where practical. Do not hard-code core product logic to one commercial provider.

Reason:
First-market/local providers are not all finalized and the product is intended to expand internationally.

---

## DEC-008 — GitHub is the coordination layer for distributed AI-assisted development

Status: Accepted  
Date: 2026-08-08

Context:
Two remote human contributors may work with independent AI coding agents.

Decision:
Use one shared GitHub repository, short-lived task branches, scoped Issues, Pull Requests, cross-review, and required CI. AI agents must stay inside task scope and may not independently coordinate conflicting changes through assumptions.

Reason:
Git history, task boundaries, documented decisions, and CI provide a stable shared source of truth across people and agents.

Consequences:
Direct work on `main` is prohibited. High-contention files require coordination. Database migrations should have one active owner at a time until the foundation is stable.

Affected docs/code:
`AGENTS.md`, `CONTRIBUTING.md`, `docs/07_DEFINITION_OF_DONE.md`, `docs/13_COLLABORATION_WORKFLOW.md`, `.github/**`

---

## DEC-009 — Founder & Product Blueprint v1.0 rebaselines the product contract

Status: Accepted  
Date: 2026-08-08

Context:
The project owner supplied VAYLET Founder & Product Blueprint v1.0 (August 2026) after the original Phase 1 database contract was locked and after local, uncommitted VAL-002B work had started.

Decision:
Treat Blueprint v1.0 as the latest approved product direction. `docs/15_BLUEPRINT_V1_REBASELINE.md` is the repository-native implementation bridge until the Blueprint PDF itself is committed under `docs/reference`.

Previous binding docs must be updated before merging implementation that materially conflicts with Blueprint v1.0.

Reason:
Avoid implementing stale product assumptions and avoid relying on chat history to communicate the new direction.

Consequences:
VAL-002B local work is preserved/stashed, re-reviewed after this docs rebaseline, and adjusted only where the new contract actually changes it.

---

## DEC-010 — VAYLET base business model is B2B SaaS, not direct valet operation

Status: Accepted  
Date: 2026-08-08

Decision:
VAYLET sells software to valet operators, hotels and operating customers. In the base model VAYLET does not employ valet drivers, operate the field service, or take physical custody of customer vehicles.

Reason:
Reduce direct operational/liability scope and preserve scalable SaaS economics/international expansion.

---

## DEC-011 — Tenant role contract expands and platform roles remain separate

Status: Accepted  
Date: 2026-08-08

Decision:
Current OrganizationMembership roles are:

- `ORG_ADMIN` = Blueprint Company Admin
- `LOCATION_MANAGER`
- `VALET_SUPERVISOR`
- `VALET_EMPLOYEE`

Guest/Customer is not a staff membership.

VAYLET Super Admin is platform-level and must not be represented as an OrganizationMembership.

Venue Client is an approved product actor with restricted location visibility, but its exact persistence/access representation is deferred to a dedicated schema decision because Blueprint v1.0 does not specify enough fields to lock it safely.

Reason:
Align current Phase 1 work with the approved role model without inventing unprovided schema.

---

## DEC-012 — Assistive OCR/ANPR and configurable photo policy are sellable-MVP capabilities

Status: Accepted  
Date: 2026-08-08

Decision:
Plate OCR/ANPR is included in the sellable MVP only with confirm/edit and a permanent manual fallback. OCR must not block check-in when the plate is unreadable.

Vehicle condition check is required, but photos are optional by default and may be configured as required by Company/Location policy.

Reason:
Match Blueprint v1.0 while preserving the speed-first employee workflow.

Consequences:
Old mandatory-four-photo language is superseded. OCR is no longer prohibited from MVP, but autonomous AI/damage detection remains deferred.

---

## DEC-013 — Maps/session tracking is task-scoped and configurable

Status: Accepted  
Date: 2026-08-08

Decision:
Maps plus GPS/session tracking may be implemented in the sellable MVP when configured. Tracking is tied by default to active Parking/Retrieval tasks and is not continuous for the entire employee Shift.

Guest users never receive exact vehicle coordinates.

Reason:
Support operational visibility/custody while limiting privacy overreach.

---

## DEC-014 — Hybrid Dispatch task lifecycle is separate from ValetSession state

Status: Accepted  
Date: 2026-08-08

Decision:
Use a separate Task/Dispatch lifecycle for queue/assignment/acceptance/reassignment/in-progress/completion.

Canonical Task path:

`QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED`

ValetSession represents physical custody and does not use `RETRIEVAL_ASSIGNED` as a physical state.

Reason:
Blueprint v1.0 explicitly models Hybrid Dispatch separately from the official vehicle lifecycle.

---

## DEC-015 — Canonical Blueprint-aligned ValetSession lifecycle

Status: Accepted  
Date: 2026-08-08

Decision:
Canonical sellable-MVP physical states are:

`CHECKING_IN -> AWAITING_PARKING -> PARKING -> PARKED -> REQUESTED -> RETRIEVING -> READY -> HANDOFF_PENDING -> COMPLETED`

`READY` is the canonical MVP state for Blueprint `STAGED/READY`; staging zone/spot is operational location data unless a later workflow requires a separate state.

Incident lifecycle remains separate from ValetSession physical state.

Reason:
Create one implementable state contract while preserving Blueprint separation of custody, dispatch, incidents and handoff.

---

## DEC-016 — Secure standard handoff is Dynamic QR OR 4-digit pickup code

Status: Accepted  
Date: 2026-08-08

Decision:
Standard sellable-MVP handoff accepts either a Dynamic one-time QR or 4-digit pickup code. Either may satisfy the normal policy. Supervisor override is exceptional and must be authorized, reasoned and audited.

Reason:
Match Blueprint v1.0 handoff contract.

---

## DEC-017 — Configuration First uses Company default -> Location override

Status: Accepted  
Date: 2026-08-08

Decision:
Normal customer/location operating-policy differences identified by the product should be configurable from the Dashboard rather than hard-coded.

Preferred inheritance:

`Company default -> Location override`

Do not implement this as one speculative untyped JSON blob. Add typed configuration contracts/tables through focused feature tasks.

Reason:
Make the SaaS sellable/configurable without creating an unsafe generic policy engine during foundation work.

---

## DEC-018 — Location owns operational timezone/currency context

Status: Accepted  
Date: 2026-08-08

Decision:
A Company may own Locations in different countries. Location timezone and currency are therefore first-class operational context. Organization timezone, while retained in the current Phase 1 contract as a Company/default value, must not override each Location's own timezone.

Reason:
Blueprint v1.0 explicitly requires per-Location timezone/currency and multi-country operators.

---

## DEC-019 — Advanced intelligence follows operational data

Status: Accepted  
Date: 2026-08-08

Decision:
Build the operating system and collect clean measured data before implementing predictive/optimization features such as SmartStack AI, Predictive Retrieval, Demand Autopilot or advanced fraud/risk intelligence.

OCR/ANPR assistive scanning is not treated as permission to add autonomous predictive AI.

Reason:
Preserve the Blueprint rule: build the operating system first; add intelligence after the operation works.