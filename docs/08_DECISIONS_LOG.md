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

---

## DEC-020 — Vehicle identity supports plate-less check-in

Status: Accepted
Date: 2026-08-08

Context:
Blueprint v1.0 requires check-in to continue when a plate is absent, unreadable or not confidently established through OCR/manual entry. The persistence contract must keep custody identity stable, allow multiple unidentified vehicles to remain distinct and preserve tenant-scoped plate uniqueness when a plate is known.

Options considered:

- Option A: create a stable Vehicle even when plate identity is unavailable, using a required temporary/manual descriptor until the plate is known.
- Option B: defer Vehicle creation and keep temporary identity on the custody/session path until later linking.
- Option C: introduce a separate temporary-vehicle entity or identity abstraction.

Decision:
Use Option A for MVP.

A Vehicle may exist without a known plate. `plate_country`, `plate_number_raw` and `plate_number_normalized` are nullable as one group: either all three are present or all three are absent. While all three are absent, `temporary_descriptor` is required and must contain non-empty trimmed employee-confirmed text sufficient to distinguish the vehicle operationally. Each unidentified Vehicle receives its own UUID; the descriptor is not unique.

No plate/identity status enum is introduced because known versus unknown is derived without ambiguity from the grouped plate fields.

When plate identity is known, enforce tenant-scoped uniqueness with a partial unique index on `(organization_id, plate_country, plate_number_normalized)` where `plate_number_normalized IS NOT NULL`.

Later identification or correction uses an explicit audited domain command and updates the same Vehicle when the confirmed normalized plate does not conflict. The temporary descriptor may be retained after identification. If the plate already belongs to another Vehicle in the Organization, reject the identification/correction conflict; do not automatically merge, relink custody history or rewrite Black Box events. The existing unidentified Vehicle and its ValetSessions remain distinct until a dedicated deduplication workflow is approved.

OCR/ANPR remains assistive only. Confirm/edit/manual fallback is permanent, and unreadable OCR must not block an otherwise allowed check-in.

Reason:
Option A preserves Vehicle as the stable identity referenced by custody while adding only nullable plate fields, one fallback descriptor and database constraints. Option B moves identity onto an undefined session path and creates later linking complexity. Option C adds an unnecessary entity/abstraction.

Consequences:

- Multiple unidentified vehicles are distinct by UUID even if their descriptors match.
- Plate corrections append audit/Black Box events; they do not replace historical facts.
- Automatic Vehicle merge/deduplication is deferred to a dedicated command/workflow decision.
- The Customer + Vehicle database foundation may implement this contract in a new migration with invariant tests.

Affected docs/code:
`docs/02_DOMAIN_MODEL.md`, `docs/03_DATABASE_SCHEMA.md`, `docs/11_REQUIREMENTS_TRACEABILITY.md`, future Customer + Vehicle schema/migration/domain command work

---

## DEC-021 — Sellable-MVP financial persistence is payment-centric with normalized history facts

Status: Accepted
Date: 2026-08-09

Context:
Blueprint v1.0 requires Customer Pays, Venue Pays, full/partial validation, cash, digital payment, tips, retry-safe provider callbacks and authorized refunds. The provisional Payment shape mixed charge, validation discount, provider and refund concerns and did not define safe correction, idempotency or cash history.

Options considered:

- Option A: separate first-class Payment, Validation, Tip, Cash/Reconciliation and Refund entities, plus provider-attempt/event entities.
- Option B: keep Payment as the current financial aggregate and add only distinct append-only facts needed for Validation history, cash history, provider callback deduplication and Refund history.
- Option C: use a smaller generic financial event/blob or ledger-like model.

Decision:
Use Option B.

At most one Payment exists per ValetSession. It stores same-tenant Organization/Location/ValetSession ownership, an immutable Location-currency snapshot, `service_payer` (`CUSTOMER` or `VENUE`), collection method (`NONE`, `CASH` or `DIGITAL`), base `service_amount`, customer `tip_amount`, derived current `amount_due`, collected `amount_paid`, entity-specific creation idempotency key, provider-neutral current reference fields and exact status.

`VENUE` means responsibility for the base service amount only. It does not create Venue Client identity, venue receivable, invoice or settlement persistence. For `CUSTOMER`, current customer service due is service amount less current Validation amount. For `VENUE`, current customer service due for the base service is zero. In both cases, customer tip is added to `amount_due`.

`service_payer` is immutable after Payment creation. Neither `CUSTOMER -> VENUE` nor `VENUE -> CUSTOMER` is allowed by mutating Payment. Validation can only belong to a `CUSTOMER` Payment, and immutable payer prevents current or historical Validation from later becoming semantically attached to a `VENUE` Payment. Incorrect financial responsibility requires a dedicated future correction workflow/decision. Other pre-collection monetary terms may be corrected only through an explicit authorized transaction that preserves history, recomputes amount due and writes required audit.

Validation is first-class because full/partial/no-validation corrections have different business and audit semantics. It belongs to a `CUSTOMER`-responsibility Payment; `VENUE` responsibility is not combined with Validation. No initial validation is no current row. Controlled modes are `NONE`, `FULL` and `PARTIAL`; `NONE` with zero amount is used only to supersede/remove an earlier validation. Multiple immutable history rows may exist, but a partial unique rule allows one current row. Correction inserts a superseding row and retires only the previous current marker atomically. Full/partial comparison to Payment service amount is transactional application logic, not a cross-row CHECK claim.

Tip remains `tip_amount` on Payment. MVP has no allocation, payroll, commission or multi-recipient tip lifecycle that justifies a separate Tip entity. The tip is included in amount due and can be collected by cash or digital payment. A returned tip uses Refund rather than rewriting paid history.

Cash uses append-only CashEntry records for one receipt and positive increase/decrease corrections. Each entry records amount, same-tenant actor, server-authoritative time and a unique submission idempotency key; adjustments require reason. Payment `amount_paid` is the transactionally maintained current projection. CashEntry corrections fix recorded cash; actual money returned to a customer is always Refund. No shift-close, drawer, general-ledger or advanced settlement entity is accepted in this foundation.

Digital callbacks use atomic processing model A. After signature verification and adapter normalization, ProviderEvent insert, Payment/Refund mutation and required AuditEvent commit in one database transaction. Durable ProviderEvent statuses are exactly `PROCESSED` and `IGNORED`: a recognized financial result is `PROCESSED`, including a provider-reported payment/refund failure represented in the relevant lifecycle, while a valid event intentionally causing no financial mutation is `IGNORED`. A duplicate after commit finds the unique `(organization_id, provider, provider_event_id)` row and does not repeat mutation/AuditEvent. Failure before commit rolls back the entire transaction, leaves no durable inbox/status row and allows provider retry to execute safely. PaymentProviderEvent is not an asynchronous inbox; internal processing failure is never committed as an event status. Raw payloads, PAN, CVV, reusable tokens and credentials are never stored. No separate PaymentAttempt entity is accepted for MVP.

Exact Payment statuses are:

`NOT_REQUIRED`, `UNPAID`, `PENDING`, `PAID`, `FAILED`

`REFUNDED` is removed because Refund is separate history and a single Payment status cannot truthfully represent zero, partial, pending, failed and full refunds. Payment lifecycle remains separate from ValetSession.

The accepted row matrix is exact: `NONE` pairs only with `NOT_REQUIRED`, zero due/paid and null provider fields; `NOT_REQUIRED` requires `NONE`; `CASH` always has null provider fields; `DIGITAL` always has provider and permits a null reference only before reference creation on `UNPAID` or on a pre-reference `FAILED` attempt; `UNPAID` has positive unpaid balance and no pending authoritative result; `PENDING` is digital with provider/reference and zero paid; `FAILED` is digital with provider and positive unpaid balance; `PAID` is cash/digital with positive due, paid equal to due and `paid_at`. These row-local implications are intended for database CHECK constraints.

Refund is a separate append-only entity with `PENDING`, `SUCCEEDED` and `FAILED` lifecycle, positive amount, reason, authorizing same-tenant membership, request/completion timestamps, unique idempotency key and provider/reference fields only for digital refunds. Multiple partial refunds and a final full refund are allowed; full/partial is derived. A locked application transaction must ensure pending plus successful refund amounts never exceed Payment `amount_paid`. Valet Employee authorization is forbidden in application policy; role and cross-row totals are not falsely delegated to CHECK constraints.

All money uses PostgreSQL `numeric(14,3)` and is non-negative. Currency is copied from Location to Payment at creation so later Location configuration changes cannot alter historical financial meaning. Financial relationships are tenant-safe and restrictive. Corrections append specialized facts and required AuditEvents rather than silently replacing history.

Split tender, installments and multiple successful collections for one session are not accepted MVP behavior. One Payment has one collection method; provider-specific retry attempts do not become a general transaction ledger.

Implementation order is three focused database slices with one active migration owner:

1. Payment + Validation + tip foundation.
2. CashEntry + provider-event/idempotency foundation.
3. Refund foundation.

Provider adapter/SDK/webhook code, provider choice, POS/PMS, Venue Client identity, tax, payroll/tip distribution, shift cash close, accounting ledger, chargebacks, subscription billing and advanced reconciliation/settlement remain deferred.

Reason:
This is the smallest reversible model that keeps current-payment reads simple while preserving every materially different MVP history and retry-safety fact. A fully separated Tip/ledger/attempt model adds unsupported complexity; a generic event/blob loses relational money and tenant guarantees.

Consequences:

- Payment implementation must replace the provisional `amount/discount_amount/REFUNDED` contract rather than copying it into Prisma.
- Cross-row validation, cash and refund totals require locked transactional commands and concurrency tests.
- Protected financial mutation and required AuditEvent must commit atomically when application commands are implemented.
- Each implementation slice requires a new forward-only migration; this decision task creates none.

Affected docs/code:
`docs/02_DOMAIN_MODEL.md`, `docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`, `docs/11_REQUIREMENTS_TRACEABILITY.md`, `docs/12_AGENT_EXECUTION_PLAN.md`, `docs/14_PROJECT_STATUS.md`, future focused financial schema/domain/provider tasks

---

## DEC-022 — Financial edge semantics clarify DEC-021 without changing its entity model

Status: Accepted
Date: 2026-08-09

Context:
An independent product review of DEC-021 found no need to reopen the payment-centric entity model, but identified underspecified operational edges that would otherwise become ambiguous database/application behavior: zero-balance transitions, pre-collection payer correction, currency precision, digital retry correlation, Refund row states and Phase 1/Phase 6 ownership.

Decision:
Keep the DEC-021 entity boundaries and three-slice persistence order unchanged, with these clarifications:

1. **Zero/positive due transitions are atomic financial-command behavior.** Before collection starts, if an authorized correction or Validation recomputation makes `amount_due = 0`, the same transaction must set `collection_method = NONE`, `status = NOT_REQUIRED`, `amount_paid = 0`, and clear provider/reference. If a previously zero-due Payment becomes positive before collection, the same command must select `CASH` or `DIGITAL`, set `UNPAID`, and satisfy that method's provider-field rules.

2. **`service_payer` is guarded rather than absolutely immutable from creation.** A pre-collection correction may change `CUSTOMER <-> VENUE` only while `amount_paid = 0`, no CashEntry exists, no Validation history exists, and no provider transaction/reference has started. The actor must be authorized and the correction, recomputation and required AuditEvent commit atomically. Once any guard ceases to hold, payer is immutable.

3. **Storage precision and currency validity are separate concerns.** Keep PostgreSQL `numeric(14,3)`, but domain/provider commands must validate or deterministically quantize monetary inputs to the Payment currency's supported minor-unit exponent before persistence/provider conversion. Silent rounding that materially changes a user/provider amount is not allowed; the chosen deterministic rule must be documented by the financial command/provider integration.

4. **Callback idempotency does not prove outbound provider-operation retry safety.** Payment `creation_idempotency_key` protects Payment creation; PaymentProviderEvent uniqueness protects committed callback replay. Phase 6's selected-provider design must separately define stable idempotency for outbound payment/refund initiation and handling of callbacks for stale/superseded provider references. Keep PaymentAttempt absent unless the selected gateway demonstrates a concrete requirement that cannot be met safely with the accepted aggregate/event model.

5. **Refund row-local state is exact.** Digital `PENDING` and `FAILED` require provider and keep `completed_at` null. Every `SUCCEEDED` Refund requires `completed_at`. Cash success has null provider/reference. Digital success requires both provider and provider reference. Any non-null provider reference requires provider. Cross-row refundable-balance limits remain transactional application logic.

6. **The three financial database slices are Phase 1 foundation.** Payment + Validation + tip, then CashEntry + provider-event/idempotency, then Refund are implemented as Phase 1 persistence tasks with one migration owner at a time. Phase 6 consumes those structures for financial domain commands, provider selection/integration, outbound-operation idempotency, callback handling, cash/refund workflows and user-facing behavior.

This decision clarifies the edge semantics of DEC-021. It does not add a PaymentAttempt, accounting ledger, venue settlement, split tender, installment support, provider-specific persistence or new financial entities.

Reason:
These rules preserve the smallest reversible MVP architecture while closing realistic operational ambiguity before database constraints and later payment commands make the behavior difficult to change safely.

Consequences:

- VAL-003J may implement the Payment/Validation row-local persistence contract after the affected binding docs are aligned.
- Payer immutability must not be implemented as a database trigger that would block the guarded pre-collection correction; the guard is a later transactional domain-command rule.
- Currency minor-unit validation/quantization is application/provider-boundary behavior, while the database retains `numeric(14,3)` storage and non-negative/row-local checks.
- Refund implementation must include the documented row-local provider/completion matrix.
- Phase 6 must prove outbound provider-operation retry safety for the selected gateway without assuming Payment creation idempotency solves later initiation retries.

Affected docs/code:
`docs/02_DOMAIN_MODEL.md`, `docs/03_DATABASE_SCHEMA.md`, `docs/12_AGENT_EXECUTION_PLAN.md`, `docs/14_PROJECT_STATUS.md`, future financial persistence/domain/provider tasks
