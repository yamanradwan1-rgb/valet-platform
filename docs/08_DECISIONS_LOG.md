# Product / Architecture Decisions Log

Important decisions must not live only in chat.

## DEC-107 — Emergency Task Takeover

Status: Proposed engineering reconciliation; Issue #352 Owner policies,
Phase B recovery directions and narrow Supervisor Tasks navigation exception
explicitly approved on 2026-10-29
Issue: #352

The exceptional command changes only canonical IN_PROGRESS Parking/Retrieval
Task ownership, requiring exact Supervisor operational authority or ORG_ADMIN
active organization/location, MFA and current session. Replacement B requires
exact Shift eligibility. No second approval; reason, distinct append-only
Dispatch/Audit and durable request identity are mandatory. No key custody is
fabricated; B's physical work fails closed without new accepted evidence.
HANDOFF_PENDING stays pending and old proof cannot authorize B's release.
Tracking history retains A attribution with a distinct B segment. A forward
schema change adds immutable tracker provenance and a successful-operation
receipt; all source changes require real PG, mounted UI and integrated review.

The Owner approved one narrow UI Freeze exception: show the existing Tasks
navigation entry to an eligible Supervisor with unchanged appearance and order.
The Supervisor route and Tasks list are limited to the active authorized Location
and its IN_PROGRESS Parking/Retrieval Tasks, without broader Dashboard management
reads or commercial entitlements. Other existing Dashboard elements remain frozen.
Full proposed contract:
[DEC-107](decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md).

## DEC-105 — Automatic WhatsApp Guest transport envelope

Status: Accepted for Stage C code and mocked verification only; real sending gated
Date: 2026-10-15

Owner WA-D02 authorizes a single at-most-30-minute encrypted sender-only
envelope for an automatically issued initial Guest bootstrap credential.
Runtime Guest/Browser Session credential persistence stays hash-only.
WA-D09/WA-D10 specifically authorize company-scoped Dashboard WhatsApp
settings and company-owned number binding, as a narrow exception to DEC-087.
Actual Meta recipient opt-in, template/fragment behavior, role/key custody and
live activation still require independent evidence and authorization.
Full contract: [DEC-105](decisions/DEC-105_AUTOMATIC_WHATSAPP_GUEST_ACCESS_ENVELOPE.md).

## DEC-104 — Verified condition-photo byte evidence / Native QR-pattern capture

Status: Accepted — design/architecture and scoped UI-X1 pattern; implementation and production proofs pending
Date: 2026-10-14
Issue: #215

Owner accepted U-001–U-007, selecting the bounded server-mediated JPEG
byte pipeline, private S3-compatible evidence, scoped durable upload journal,
server-verification-only qualification, fail-closed current policy, bounded
retries/reconciliation and Native-first delivery. Initial caps require actual
benchmark proof, and provider/retention/holds/release ownership remains a
production gate. UI-X1 is approved only in the existing Native QR-camera
visual/interaction pattern with strictly frozen unrelated UI. Historical
proposed photo DEC-075 does not replace the accepted Staff Push DEC-075.
Full contract: [DEC-104](decisions/DEC-104_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md).

## DEC-098 — Pre-custody Parking cancellation

Status: Accepted
Date: 2026-10-03
Issue: #261

Owner-approved U261-L/A/T: AWAITING_PARKING -> CANCELLED and exact Parking Task
QUEUED/ASSIGNED/ACCEPTED -> CANCELLED atomically before explicit Start Parking.
Original intake owner for QUEUED, current assignee otherwise, exact Shift and
current eligibility, no override. Dual CAS, one Dispatch CANCELLED and focused
custody audit, exact terminal status, no replay. Forward migration 057 broadens
truthful terminal shape; DEC-097 stays narrow. Existing Native pre-start panel,
minimal Cancel Service confirmation, UI freeze and legacy fail-closed boundary.
Full contract: [DEC-098](decisions/DEC-098_PRE_CUSTODY_PARKING_CANCELLATION.md).

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

---

## DEC-023 — Production Staff Authentication

Status: Accepted
Date: 2026-08-10

Context:
The staff check-in HTTP boundary currently passes the `Authorization` header to an injectable `StaffPrincipalResolver`. Production intentionally binds that boundary to `FailClosedStaffPrincipalResolver`, which rejects every request. Integration tests replace it with a test-only opaque mapping. The persisted `User` already owns normalized unique email, password hash, `ACTIVE`/`DISABLED` status and `last_login_at`, while the custody authorization layer separately resolves current User status, OrganizationMembership, Organization, Location access and operation-specific role from database state.

The repository has no accepted decision for production login, credential format and transport, expiry, refresh rotation, replay handling, logout, persistence or MFA assurance. Implementing the resolver before those choices are approved would silently turn transport code into the security contract.

Options considered:

- Option A: database-backed opaque staff access credentials with a database-backed rotating refresh session.
- Option B: a signed short-lived access token with a database-backed rotating/revocable refresh session.
- Option C: an external identity provider or hosted authentication service.

Proposed decision:
Use Option A for the current Employee/Valet web/PWA MVP.

The API already requires database access to make current `User.status` and session revocation authoritative on every protected request. Option B therefore would not remove the database read that matters, but would add signing-key lifecycle, algorithm/issuer/audience validation and claim-staleness risks. No Organization, Location, membership, role or permission claim may be authoritative, so signed authorization claims offer no benefit. Option C introduces an unselected provider, external availability and deployment decisions, and premature federation/SSO scope; enterprise SSO remains deferred.

The proposed design is one server-owned password login, one opaque access credential and one independently generated opaque refresh credential per staff session. Access is sent as a bearer credential. Refresh is confined to an HttpOnly cookie so browser JavaScript cannot directly read the long-lived credential. Both are verified by database-held hashes; raw credentials are never persisted.

### Login contract

The only MVP login identifier is email. Phone login, public signup, invitations, password reset and account recovery are separate decisions/tasks and are not part of this contract. Production staff Users must be provisioned through a separately approved administrative/onboarding path before this login can be enabled.

The login request is `POST /v1/staff/auth/login` with a strict JSON object containing only `email` and `password`. The email is trimmed and lowercased exactly as required by the existing `users_email_normalized_check`; lookup uses the resulting value against the globally unique stored email. The application must not introduce a second Unicode or locale-specific canonicalization rule without a migration/decision that reconciles existing stored identities. The normalized email is limited to 254 characters. Password input is treated as UTF-8 bytes exactly as submitted, is never trimmed or Unicode-normalized, and is bounded to 1–1024 UTF-8 bytes before password-hash work.

Unknown email, malformed or unsupported password hash, wrong password and `DISABLED` User all return HTTP 401 with the same stable `STAFF_AUTHENTICATION_FAILED` code and generic "Staff authentication failed." message plus the normal request ID. They must not reveal whether an account exists or is disabled. Before returning that failure, the login path performs one Argon2id verification: an unknown email verifies against one fixed valid dummy hash; a stored malformed, unsupported, legacy or placeholder hash also verifies against that same dummy hash; and a User with a supported stored hash verifies the submitted password against that hash even when the User is `DISABLED`. Account status must not cause a cheap early return with materially different password-verification work. Unsupported hashes are never accepted through a fallback. This is timing equalization, not a substitute for rate limiting.

After password verification, session issuance uses one database transaction. It re-reads and locks the User, requires `status = ACTIVE`, inserts the session and first refresh-credential rows, and updates `last_login_at` to the same server/database time used for successful issuance. Raw credentials are returned/set only after commit. A rollback returns no usable credential. `last_login_at` changes on successful new-session issuance only; it does not change on failed login, refresh or ordinary authenticated requests.

Login always creates fresh server-generated credentials and a fresh session ID. It never adopts an inbound session/access value, so an attacker cannot fix the resulting session identifier. A pre-existing refresh cookie is not used as authority for login and is overwritten after successful issuance.

### Password verification

`password_hash` stores one complete Argon2 PHC string and no plaintext or reversible password material. The initially accepted encoding is exactly Argon2id version 19 with `m=65536` KiB, `t=3`, `p=4`, a 16-byte cryptographically random salt and a 32-byte output. This is the selected 64 MiB/three-pass profile aligned with RFC 9106's second recommended Argon2id profile:

```text
$argon2id$v=19$m=65536,t=3,p=4$<PHC base64 salt>$<PHC base64 hash>
```

The implementation must parse and bound the PHC fields before invoking verification. A different algorithm, Argon2 version, parameter set, decoded salt/output length or malformed encoding is an unsupported/legacy format and fails closed through the same non-disclosing invalid-login response. There is no bcrypt/PBKDF2/plaintext fallback and no silent reinterpretation of existing seed placeholders. Any later hash-policy upgrade requires an amended accepted contract and an explicit migration/rehash path.

Hash creation and verification use the maintained `argon2` package's Argon2id API. Comparison is performed only by the library verifier; application code must not compare derived hashes with ordinary string equality. Password values, PHC strings and verification errors containing either must never enter logs, metrics, traces or AuditEvent metadata.

### Credential formats and hashing

Each access credential is 32 bytes from Node's cryptographically secure random generator, encoded as unpadded base64url and prefixed exactly as:

```text
vsa1.<43 base64url characters>
```

Each refresh credential is generated independently with the same entropy and encoding but a distinct prefix:

```text
vsr1.<43 base64url characters>
```

The access and refresh values must never be derived from each other, a User ID, session ID, timestamp or counter. A credential parser accepts only the exact versioned prefix, alphabet and length and rejects duplicates or additional material.

For lookup, the server computes SHA-256 over the complete UTF-8 raw credential, including its staff-specific prefix, and stores only the lowercase-hex versioned verifier:

```text
staff-access-sha256:v1:<64 lowercase hex characters>
staff-refresh-sha256:v1:<64 lowercase hex characters>
```

Plain SHA-256 is sufficient for these independently generated 256-bit credentials because there is no low-entropy secret to brute force. A server pepper would add an operational secret/rotation dependency without materially improving resistance to guessing. The verifier is strictly required for indexed database lookup, but it must remain confined to the authentication tables and parameterized queries; it must not be logged, audited or emitted as telemetry.

### Access transport, lifetime and resolution

Normal staff APIs accept the access credential only in one HTTP header:

```text
Authorization: Bearer vsa1.<43 base64url characters>
```

An access credential has a maximum lifetime of 15 minutes. `access_expires_at` is server-authoritative and is set using this exact formula:

```text
access_expires_at =
min(database now + 15 minutes, staff_auth_sessions.absolute_expires_at)
```

The client-supplied clock is never consulted.

`StaffPrincipalResolver.resolve(authorization)` must:

1. require exactly one syntactically valid Bearer access value;
2. compute its versioned access verifier;
3. perform an indexed lookup of the owning staff session and current User;
4. require an unrevoked session, `now < access_expires_at`, `now < absolute_expires_at` and current `User.status = ACTIVE`; and
5. return exactly `{ userId }` from persisted state.

Missing, malformed, duplicate, unknown, expired, rotated, revoked or otherwise invalid access credentials and disabled/missing Users all retain the existing HTTP 401 `STAFF_AUTHENTICATION_REQUIRED` response. The resolver must not disclose which predicate failed.

`X-User-Id`, `X-Staff-User-Id` and every other client-supplied User, Organization, Location, membership, role or permission value are never authentication or authorization authority. `StaffPrincipalResolver.resolve(authorization)` considers only the `Authorization` value it receives and is not required to detect unrelated HTTP headers. Alternate identity headers are never used to resolve or alter `StaffPrincipal`, do not override a valid Authorization bearer credential, may be ignored as non-authoritative input unless another strict transport policy explicitly rejects them, and must never be introduced as a production authentication convention. Strict request-body and query schemas continue to reject authority fields where those transports are contract-controlled. Test-only resolvers remain dependency-injected test fixtures and must not be selectable through environment variables or production request input.

Authentication proves only a current User identity. Tokens and sessions contain no authoritative Organization ID, Location ID, membership ID, role or permission. Existing custody authorization continues to load current persisted scope and apply active-membership, tenant, explicit Location-access and command-specific role rules. In particular, a valid password session does not grant `LOCATION_MANAGER` or `ORG_ADMIN` the `VALET_EMPLOYEE`/`VALET_SUPERVISOR` field-operation authority they do not already have.

### Refresh transport and browser boundary

The raw refresh credential is never returned in a JSON body and is not accepted in `Authorization`. At initial login it is set only as this host-only cookie:

```text
__Secure-vaylet_staff_refresh=<vsr1 value>;
Secure; HttpOnly; SameSite=Strict; Path=/v1/staff/auth; Max-Age=2592000
```

The cookie has no `Domain` attribute. Server expiry remains authoritative even if a browser retains a stale cookie. On refresh, the replacement cookie keeps the same name and security attributes, but its `Max-Age` is bounded to the remaining whole-second duration from the server/database time to `staff_auth_sessions.absolute_expires_at`; it must never reset to 2592000 or otherwise extend the browser credential beyond the existing absolute session expiry. Successful login and refresh return exactly the raw `accessToken`, literal `tokenType: "Bearer"`, server-authored `accessExpiresAt` and `sessionExpiresAt`; they never return the raw refresh credential. `POST /v1/staff/auth/refresh` accepts the refresh credential only from exactly one cookie with that name, requires an empty strict JSON object, and returns that same access response after commit while replacing the cookie. Missing, malformed, unknown, expired, rotated, replayed, revoked and disabled-User refresh failures all return the same HTTP 401 `STAFF_AUTHENTICATION_FAILED` response and clear the cookie. `POST /v1/staff/auth/logout` uses the same cookie to identify and revoke the current session, clears the cookie with the same name/path/security attributes and `Max-Age=0`, and always returns HTTP 204 with an empty body so validity is not disclosed.

The Employee/Valet web/PWA keeps the access credential in memory only. It must not persist it in `localStorage`, `sessionStorage`, IndexedDB, URLs, service-worker caches or application logs. The refresh cookie is inaccessible to JavaScript, but active XSS can still make authenticated same-origin requests or call refresh and read an allowed response; CSP, output encoding, dependency hygiene and avoiding unsafe script execution remain required controls.

Because browsers do not automatically attach an `Authorization` bearer value, CSRF is not the primary threat for normal staff API access. Login/refresh/logout are POST-only, require `Content-Type: application/json`, require the request `Origin` to exactly match a configured production Employee/Valet origin, and reject a missing or unapproved Origin. `SameSite=Strict`, host-only cookie scope and the narrow cookie path are additional controls, not substitutes for Origin validation.

Production CORS is an explicit allowlist of deployed Employee/Valet origins. It never uses `*`, reflected arbitrary origins or wildcard subdomains. Credentialed auth requests may enable CORS credentials only for an exact allowlisted origin and only the required methods/headers. The deployment must keep the Employee/Valet origin and API same-site so the Strict refresh cookie works; a future cross-site deployment must amend this decision rather than weaken cookie policy ad hoc.

All login, refresh and logout responses use `Cache-Control: no-store` and `Pragma: no-cache`. Reverse proxies, application diagnostics, tracing and error handlers must redact the `Authorization` and `Cookie` headers before capture.

### Session and refresh persistence

Implementation requires new persistence, but this proposed decision creates no Prisma model or migration. Existing migrations remain immutable.

The smallest proposed database model has two staff-only tables independent of guest access.

`staff_auth_sessions` conceptually contains:

- `id`: UUID primary key generated by the server;
- `user_id`: required restrictive foreign key to `users.id`;
- `current_access_token_hash`: required unique versioned verifier;
- `access_expires_at`: required server timestamp;
- `absolute_expires_at`: required server timestamp exactly 30 days after creation;
- `revoked_at`: nullable server timestamp;
- `created_at`: required server timestamp; and
- `last_rotated_at`: required server timestamp, initially equal to creation.

Checks require the exact versioned access-verifier shape, `access_expires_at > created_at`, `access_expires_at <= absolute_expires_at`, `last_rotated_at >= created_at`, and `revoked_at IS NULL OR revoked_at >= created_at`. Indexes include unique current access verifier and an index beginning with `user_id` suitable for current-session revocation/cleanup. The User foreign key uses restrictive delete/update behavior; staff auth history is not cascade-deleted.

`staff_refresh_credentials` conceptually contains:

- `id`: UUID primary key;
- `session_id`: required restrictive foreign key to `staff_auth_sessions.id`;
- `token_hash`: required unique versioned verifier;
- `generation`: positive integer starting at 1;
- `created_at`: required server timestamp;
- `expires_at`: required server timestamp equal to the owning session's absolute expiry;
- `consumed_at`: nullable server timestamp; and
- `replaced_by_credential_id`: nullable restrictive self-reference to the next credential.

Constraints require the exact versioned refresh-verifier shape, unique `(session_id, generation)`, unique `token_hash`, at most one unconsumed refresh credential per session through a partial unique index, no self-replacement, and valid timestamp ordering. A composite same-session self-reference from `(session_id, replaced_by_credential_id)` to `(session_id, id)` prevents cross-session lineage. Restrictive foreign keys prevent deletion from erasing replay lineage. Raw access/refresh values are never stored. The application runtime role needs only the specific `SELECT`/`INSERT`/`UPDATE` privileges required by this lifecycle and must not receive `DELETE` or `TRUNCATE` on these tables. Expired/revoked rows may later be removed only by an explicit migration/maintenance-owner retention policy; no retention duration is invented here.

The session lasts exactly 30 days from login and is not sliding. Refresh rotation does not extend `absolute_expires_at`. Initial access issuance and every rotated access credential use the authoritative `access_expires_at` formula above.

### Rotation, replay and concurrency

Every refresh use rotates both credentials. The server hashes the presented refresh value, finds its retained credential row, and in one database transaction locks that row and its owning session. It rechecks current User `ACTIVE`, session not revoked, refresh not expired and session not absolutely expired.

For a current unconsumed refresh credential, the transaction:

1. marks it consumed at the database time;
2. inserts exactly one next-generation refresh row with a newly generated verifier;
3. links the old row to the new row;
4. replaces the session's current access verifier and access expiry with a newly generated access credential;
5. updates `last_rotated_at`; and
6. commits before emitting either raw credential.

Exactly one transaction can consume a generation. A transaction that finds an already consumed credential treats it as refresh replay, sets `revoked_at` on the whole owning session/family if not already revoked, emits no credentials and returns the same non-disclosing authentication failure. This applies even when replay is caused by two browser tabs racing: one rotation can commit first, and the losing reuse then revokes that session. The PWA must serialize refresh with one cross-tab coordination mechanism such as the Web Locks API plus a broadcast of the new access state; failure to coordinate intentionally falls back to reauthentication rather than weakening replay detection.

Refresh replay revokes only the affected login session/family, not independent sessions created by other logins. A replayed credential cannot select another User/session because lookup ownership comes only from its verifier row. A disabled User causes refresh failure and session revocation.

### Logout, revocation and disable

Logout revokes the current session by setting `revoked_at` under a row lock and clears the refresh cookie. It is idempotent and non-disclosing; a retained consumed refresh credential presented to logout still identifies and revokes its family. After commit, resolver queries reject the session's access credential immediately even if its 15-minute timestamp has not elapsed.

Logout-all, user-visible device/session management and administrator-initiated per-device revocation are deferred. The schema supports a later authorized operation over sessions by `user_id`; such an operation will require its own authorization, reason and audit contract.

`User.status = DISABLED` blocks login and refresh. Every access resolution joins the current User and requires `ACTIVE`, so all existing sessions become unusable immediately without waiting for access expiry and without trusting a stale token claim. Re-enabling a User does not silently un-revoke sessions, but sessions that were not explicitly revoked solely by the status check could otherwise become usable again; therefore the future disable command must atomically set the User to `DISABLED` and revoke all of that User's unrevoked staff sessions. Until that command exists, direct production User-status mutation is not an approved account-disable workflow.

### MFA boundary

This password/session contract represents password-only staff authentication. It does not assert MFA assurance and does not make `{ userId }` sufficient for privileged Company Admin or VAYLET Super Admin operations.

Production Company Admin (`ORG_ADMIN`) privileged APIs and all VAYLET Super Admin APIs remain unavailable until a separate accepted MFA decision/task adds an MFA enrollment/challenge/recovery lifecycle and a server-validated assurance value bound to the session. That task may extend session persistence and principal/guard interfaces; it must not infer MFA from role, password login, a client claim or the existence of this session. Existing operational field commands continue to permit only their explicitly accepted roles, so this boundary does not grant admin roles implicit valet authority.

### Login abuse and security telemetry

The documented production requirement remains no more than five failed credential attempts for one normalized identifier in a rolling 15-minute window and no more than 30 login attempts from one trusted client address in a rolling 15-minute window. It must apply equivalently to known and unknown normalized identifiers, use only a correctly configured trusted-proxy client address, and return the same HTTP 429 `STAFF_AUTHENTICATION_RATE_LIMITED` response regardless of account existence. Process-local counters are prohibited because they reset and diverge across instances.

Production deployment of staff login is gated on a separately approved shared/durable anti-abuse boundary. The VAL-004L authentication implementation must not select or invent Redis, a WAF, generic rate-limit tables or other anti-abuse infrastructure. That boundary can be delivered by the upcoming production anti-abuse/readiness slice. The authentication core may be implemented and tested independently while production staff routes remain gated, but Phase 2 cannot be declared production-ready until the shared/durable staff-login anti-abuse requirement is implemented and verified. This remains independent of the guest rate-limiting task.

Authentication security telemetry is separate from tenant AuditEvent because login occurs before a membership/Organization/Location actor is established. It may record bounded event type, outcome, request ID, server time and, after successful authentication, internal User/session IDs. It must never record password, password hash, raw access/refresh credential, token verifier, `Authorization`/`Cookie` header or full request body. Failed-login telemetry must not copy the submitted email or password. Any future privileged session revocation remains a separately authorized/audited business action.

### Guest isolation and dependencies

Guest bearer access remains independent. Staff auth must not reuse guest token columns, tables, parsers, dependency-injection bindings, issuance/rotation commands, hashes or lifecycle semantics. Sharing Node's cryptographic primitive does not make the protocols interchangeable because formats, prefixes, persistence and resolvers remain separate.

Implementation would add exactly two direct `@valet/api` runtime dependencies: the maintained `argon2` package for Argon2id and the maintained `cookie` package for standards-compliant refresh-cookie parsing/serialization. No JWT/JWK, Passport, OAuth, hosted-IdP, Redis or MFA dependency is accepted by this decision. Exact compatible dependency versions must be pinned by the implementation task in the repository lockfile after package-security review; this proposal installs nothing.

### Threat review

- Credential theft: an access credential has a 15-minute maximum lifetime; a stolen refresh credential is harder for browser script to read, rotates on every use and can revoke only its session family on replay. TLS is mandatory in production.
- Database token-table compromise: a read-only leak exposes only verifiers of 256-bit random values and cannot reconstruct raw credentials. Database write/runtime compromise can replace session verifiers and is outside what token hashing alone can contain; least-privilege runtime database controls remain required.
- Password database compromise: unique-salt Argon2id at the locked memory/time cost slows offline guessing; password strength/provisioning policy remains a required onboarding contract and is not replaced by hashing.
- Token guessing: independent 256-bit CSPRNG values, exact parsing and unique verifier indexes make online guessing infeasible; abuse controls still protect endpoint resources.
- Session fixation: login always creates fresh server-owned IDs/credentials and never adopts inbound authority.
- Refresh replay/concurrent refresh: retained lineage detects old generations, row locking gives one winner, and any consumed-token reuse revokes the family.
- Stale credentials: database checks make logout, explicit revocation and User disable effective immediately; no signed stale claim bypass exists.
- Cross-tenant/role spoofing: the principal contains only persisted `userId`; all tenant, Location, membership and role authorization remains database-derived in the custody layer.
- Alternate-header spoofing: identity headers such as `X-User-Id` never become authority, never alter the resolved principal and never override a valid bearer credential; strict body/query schemas continue to reject authority fields where those transports are contract-controlled.
- Header/log leakage: raw bearer/cookie values and their verifiers are prohibited from logs, metrics, traces, audit and error bodies; infrastructure redaction is a production gate.
- CSRF: normal bearer requests are not browser-auto-attached; refresh/logout cookie requests require Strict SameSite, exact Origin, host-only/path scope and POST JSON semantics.
- XSS: memory-only access and HttpOnly refresh storage limit direct theft but cannot make an actively compromised origin safe; browser hardening remains necessary.
- Admin privilege escalation: password sessions carry no MFA assertion and privileged admin APIs stay unavailable until the MFA contract is implemented.
- Replay across devices/sessions: each login has independent credentials/family; replay revokes only the owning session, while User disable invalidates all sessions through current-state checks.

Consequences:

- Production staff routes remain fail-closed until this proposal is reviewed, accepted and implemented with PostgreSQL-backed tests.
- The implementation task requires new forward-only session/refresh persistence and must update the database contract, Prisma schema and invariant tests without rewriting migrations 1–16.
- The implementation must add login/refresh/logout transport and replace only the production staff principal binding; it must not redesign existing custody authorization.
- Staff login abuse control, credential-header redaction and exact production origin configuration are launch gates, not optional hardening notes.
- Public staff signup, invitation, password reset/recovery, MFA, SSO, device management and logout-all remain separate tasks.

Affected docs/code:
`docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`, `docs/11_REQUIREMENTS_TRACEABILITY.md`, future focused staff-auth contracts/controller/resolver/schema/migration/tests, `apps/api/package.json`, `pnpm-lock.yaml`

## DEC-024 — Shared Durable Anti-Abuse Boundary

Status: Accepted
Date: 2026-08-10

> Binding decision for VAL-004M. Before implementation changes are committed, this accepted decision must also be copied into `docs/08_DECISIONS_LOG.md` without semantic changes so the repository authority order remains intact.

## Context

Phase 2 now exposes two production-sensitive public boundaries that need shared anti-abuse protection:

- staff password login at `POST /v1/staff/auth/login`;
- guest bearer resolution at `GET /v1/guest/session`.

DEC-023 already requires no more than five failed staff credential attempts per normalized identifier in a rolling 15-minute window and no more than 30 staff login attempts from one trusted client address in a rolling 15-minute window. Guest access separately requires externally usable rate limiting without persisting or logging raw bearer tokens.

Process-local counters are rejected because they reset on restart and diverge across API replicas. PostgreSQL is already mandatory shared infrastructure for the pilot and both protected request paths already depend on it.

## Options considered

- **Option A — PostgreSQL-backed exact rolling-window state.** Existing shared database, transactional serialization, short-lived limiter events/reservations.
- **Option B — Redis-backed limiter state.** Suitable at higher volume but adds a new production service, ACL/TLS/network and availability dependency.
- **Option C — managed edge/WAF rate limiting.** Useful for coarse network protection but cannot safely own normalized staff-identifier semantics by itself.
- **Option D — process-local memory.** Rejected because it is neither durable nor shared across replicas.

## Decision

Use **Option A: PostgreSQL-backed exact rolling-window anti-abuse state** for VAL-004M.

PostgreSQL is the shared authority across API replicas. The implementation uses exact rolling 15-minute windows, transaction-level advisory serialization per limiter key, indexed short-lived limiter rows, and database-authoritative time. Redis/WAF/process-memory limiter dependencies are not introduced by this task.

If measured pilot load later proves material limiter contention, a later accepted decision may move the same public behavior to Redis or an edge/application hybrid.

## Secret and limiter-key contract

Production configuration uses:

```text
ANTI_ABUSE_HMAC_SECRET_B64URL
```

It is exactly one unpadded base64url value encoding **32 random bytes**: 43 characters from `[A-Za-z0-9_-]`.

The secret:

- is separate from staff/guest credentials and database credentials;
- is identical on every API replica;
- is never committed or logged;
- causes protected production endpoints to fail closed if absent or malformed;
- is not rotated ad hoc because changing it would split/reset active windows.

Limiter identities are HMAC-SHA-256 values. Inputs use unambiguous binary domain separation:

```text
HMAC-SHA-256(secret, UTF8(scope) || 0x00 || UTF8(value))
```

Scopes are exactly:

```text
v1:staff-login-identifier
v1:staff-client-address
v1:guest-client-address
v1:guest-token
```

Persisted key format:

```text
anti-abuse-hmac-sha256:v1:<64 lowercase hex characters>
```

Raw/normalized email, raw/canonical client IP, raw guest bearer, password, `Authorization`, `Cookie`, request bodies and auth verifier hashes are never persisted in limiter rows or emitted in normal logs, traces, metrics or `AuditEvent`.

Staff identifier keying reuses the exact DEC-023 email normalization; no second canonicalization rule is allowed.

Guest-token limiter keying uses the exact shape-valid raw guest bearer and is intentionally independent from the guest authentication SHA-256 verifier stored on `ValetSession`.

## Trusted client-address contract

Production configuration uses:

```text
ANTI_ABUSE_TRUSTED_PROXY_CIDRS
```

as a comma-separated list of explicit IPv4/IPv6 CIDRs. Empty means direct-client mode.

The socket peer address is authoritative unless the immediate peer is inside a configured trusted-proxy CIDR.

- Untrusted peers: ignore `X-Forwarded-For`, `Forwarded`, `X-Real-IP` and similar headers.
- Trusted peers: only `X-Forwarded-For` may contribute to the limiter client address.
- The trusted proxy/load balancer must overwrite or safely append the forwarding chain according to deployment configuration.
- Multiple ambiguous raw `X-Forwarded-For` header fields or malformed IP/CIDR data fail closed for protected endpoints.
- Walk the forwarding chain from right to left with the direct peer, discard trusted-proxy hops, and select the first untrusted hop.
- Do not trust a fixed hop count by itself.
- IPv4-mapped IPv6 is normalized to canonical IPv4; IPv6 uses one canonical textual form before HMAC keying.
- Malformed configured CIDRs fail production startup closed.

Production networking must prevent direct untrusted access to a proxy-only internal API listener when proxy mode is enabled.

## Persistence model

VAL-004M adds one new forward-only migration after migration 17.

Use one ephemeral anti-abuse table with the smallest fields needed for enforcement, conceptually:

- server-generated row ID;
- limiter `scope`;
- versioned HMAC `key_hash`;
- server-authoritative `occurred_at`;
- state: `PENDING`, `COUNTED`, or `IGNORED`.

Index `(scope, key_hash, occurred_at)` for current-window lookup.

`PENDING` and `COUNTED` consume quota for failure-only scopes. `IGNORED` does not. Count-all scopes insert directly as `COUNTED`.

Current-window rows are not tenant business history and are never written to `AuditEvent`.

## Advisory serialization

For each logical limiter key, check/reserve/record behavior runs in one PostgreSQL transaction and obtains a transaction-level advisory lock before counting/inserting.

The advisory-lock ID is deterministically derived from the limiter HMAC output as two signed 32-bit halves from its first eight bytes and acquired with the transaction-scoped advisory-lock form. The full versioned HMAC key remains authoritative for row lookup/counting.

A rare 64-bit advisory-lock collision may only over-serialize unrelated keys; it must never merge counters because SQL filtering still uses the full limiter key.

The limiter transaction uses a bounded local lock timeout of **2 seconds**. Failure to acquire/complete authoritative limiter state within that boundary follows the fail-closed unavailable contract rather than waiting without bound or falling back to memory.

Database server time is authoritative. Client/process clocks do not decide windows, expiry or `Retry-After`.

A request rejected because the relevant threshold is already exhausted does not append another counted event, so repeated 429s do not extend the window.

## Staff login — trusted client-address limit

For a syntactically valid staff-login request that passed the existing strict JSON/Origin transport checks, evaluate the address limiter before Argon2 work.

```text
30 login attempts per trusted client address
within the immediately preceding 15 minutes
```

The first 30 may proceed. While 30 counted address events remain in-window, the next request is 429.

Every allowed syntactically valid login attempt consumes this address quota regardless of later result: success, unknown email, wrong password, disabled User or unsupported/malformed stored hash.

Malformed JSON/body/schema and existing Origin failures retain their current 400/403 semantics and do not create staff limiter rows. Coarse malformed-request/DDoS protection remains a reverse-proxy/edge concern.

## Staff login — normalized identifier failure limit

For a syntactically valid normalized email, evaluate before Argon2:

```text
5 failed credential attempts per normalized identifier
within the immediately preceding 15 minutes
```

Unknown email, wrong password, disabled User and unsupported/malformed stored hash are identical counted failures.

Before password verification, reserve one slot as `PENDING` while holding the identifier limiter transaction/lock. Existing `PENDING` + `COUNTED` rows consume the five slots, so concurrent attempts cannot overshoot the threshold.

Outcome handling:

- credential failure -> finalize reservation to `COUNTED` before returning 401;
- successful session issuance -> finalize to `IGNORED` in the **same database transaction that commits successful staff-session issuance**;
- inconclusive/unexpected failure -> leave/finalize a fail-safe counted state until it ages out;
- if failure finalization cannot be made authoritative -> return the shared 503 unavailable response, not a possibly misleading 401.

A successful login does not erase earlier failures. A correct password presented while five still-counted failures exist receives the same staff 429 without password verification.

Known and unknown identifiers use identical reservation, keying and 429 behavior.

## Guest access — trusted client-address failure limit

For `GET /v1/guest/session`:

```text
60 failed guest-authentication attempts per trusted client address
within the immediately preceding 15 minutes
```

Reserve the address slot as `PENDING` before guest authentication.

Missing bearer, malformed/duplicate bearer, random/unknown bearer, expired bearer and revoked/rotated-old bearer finalize to `COUNTED`.

A successful guest resolution finalizes to `IGNORED` and does not permanently consume the address-failure quota.

Guest success resolution and address-reservation finalization must commit through one authoritative database transaction before guest data is returned. If that transaction cannot complete, return 503 and no guest data.

## Guest access — token request limit

For shape-valid guest bearers:

```text
180 requests per derived guest-token key
within the immediately preceding 15 minutes
```

Every shape-valid bearer presentation consumes the token-key quota before validity is disclosed, whether valid, unknown, expired, revoked or rotated-old. This permits ordinary status polling while bounding repeated use of one credential.

Requests without a shape-valid bearer do not create token-key rows but remain subject to the guest address-failure reservation.

Workflow order is:

1. reserve guest address failure slot;
2. if bearer is shape-valid, check/record token-key quota;
3. if token-key quota is already exhausted, finalize the address reservation to `IGNORED` and return token 429;
4. otherwise perform guest authentication and finalize the address reservation according to success/failure.

A rotating-random-token attacker therefore remains bounded by the address-failure threshold, while normal valid guests behind one NAT are not permanently charged against the address-failure quota.

## 429 contract

Threshold exhaustion returns HTTP 429.

Staff login:

```text
code: STAFF_AUTHENTICATION_RATE_LIMITED
message: Too many requests. Try again later.
```

Guest resolution:

```text
code: GUEST_ACCESS_RATE_LIMITED
message: Too many requests. Try again later.
```

Responses include the normal bounded `X-Request-Id`, `Cache-Control: no-store`, and:

```text
Retry-After: <integer delta-seconds>
```

The database computes the delta from the earliest currently counted/reserved row whose expiry keeps the blocking scope exhausted. Clamp to `1..900` seconds.

If multiple applicable scopes are already exhausted, return a conservative `Retry-After` equal to the greatest remaining blocking duration so a client is not told to retry before another known blocker expires.

429 never exposes account existence, token validity, counter values, which scope fired, limiter keys, identifiers, addresses or database details.

Below threshold, existing 400/401/403 semantics remain unchanged.

## Limiter-unavailable contract

Both protected endpoints fail closed when authoritative limiter state cannot be derived, locked, written or finalized.

Return:

```text
HTTP 503
code: ANTI_ABUSE_UNAVAILABLE
message: Service temporarily unavailable.
```

with the normal bounded `X-Request-Id` and `Cache-Control: no-store`.

On staff login 503:

- do not perform password verification when the limiter failed before auth;
- do not issue/return a staff session unless limiter success-finalization commits atomically with session issuance.

On guest 503:

- do not return guest session data.

Never fall back to unlimited access, process-local counters or caller-supplied identity.

## Runtime privileges and cleanup

The ordinary runtime DB role receives only the specific `SELECT`/`INSERT`/`UPDATE` privileges required by limiter enforcement. It receives no unrestricted `DELETE`, `TRUNCATE`, schema ownership or DDL privileges on limiter persistence.

Expired rows are ignored by enforcement after 15 minutes. Normal cleanup targets rows older than one hour.

Cleanup must use a fixed, parameterless maintenance boundary owned by migration/maintenance authority (or equivalently constrained database function) whose cutoff is server-authored and cannot delete current-window rows based on caller-selected keys/timestamps. If runtime is allowed to invoke such a function, only `EXECUTE` on that fixed function is granted; direct table `DELETE` remains denied.

Cleanup delay does not change enforcement correctness, but unbounded retention is not accepted.

## Concurrency / multi-instance acceptance

Tests must prove with shared PostgreSQL state that:

- two API instances observe one limiter state;
- simultaneous staff-address requests cannot exceed 30 accepted attempts;
- simultaneous staff-identifier requests cannot create more than five failure-capable reservations;
- simultaneous guest address failures cannot create more than 60 failure-capable reservations;
- simultaneous same-token guest requests cannot exceed 180 accepted requests;
- process restart does not reset limits;
- database time controls expiry;
- reservation finalization cannot affect another scope/key;
- advisory-lock timeout/outage fails closed;
- known/unknown staff identifiers remain non-enumerating;
- raw email/IP/token/password/header material is absent from limiter persistence/log/audit.

No process-local cache is authoritative for allow/deny behavior.

## Telemetry

Anti-abuse telemetry is security telemetry, not tenant `AuditEvent`.

Allowed fields: bounded event type, limiter scope, allow/deny/unavailable outcome, request ID, server time and coarse internal error category.

Do not emit raw/normalized email, raw/canonical IP, raw guest bearer, HMAC limiter key, password, `Authorization`, `Cookie`, request body or limiter row IDs into normal logs/metrics/traces.

Aggregated identity-free counts by endpoint/scope/outcome are allowed.

## Scope boundary

VAL-004M does not add CAPTCHA, bot scoring, Redis, CDN/WAF policy, payment/handoff rate limits, object-storage controls, MFA, signup/reset behavior, frontend integration or Phase 3 operations.

A future reverse proxy/WAF may add coarse request/connection protection but must not replace or weaken these application-level staff-identifier and guest-token semantics.

Production database network/TLS/credential hardening remains the next separate production-readiness slice.

## Reason

PostgreSQL is the smallest already-selected shared mechanism that can enforce exact rolling windows atomically across replicas without another production service. HMAC-derived keys minimize persisted identity data, reservations prevent concurrent overshoot on failure-only limits, bounded transaction-level advisory locking prevents unbounded same-key waits, and explicit proxy rules prevent caller-controlled forwarding headers from selecting limiter identities.

## Consequences

- VAL-004M adds exactly one new forward-only migration after migration 17 if implementation matches this decision.
- No Redis/WAF/rate-limit package dependency is required by the accepted architecture.
- Staff login and public guest access remain production-readiness gates until this limiter is implemented and verified.
- Phase 2 is still not production-ready after VAL-004M alone; production DB/network/TLS hardening and remaining deployment controls require their own closure review.
- Before implementation commit/PR, this accepted decision must be copied into `docs/08_DECISIONS_LOG.md` without semantic changes.

## Affected docs/code

`docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`, `docs/08_DECISIONS_LOG.md`, `docs/11_REQUIREMENTS_TRACEABILITY.md`, `docs/12_AGENT_EXECUTION_PLAN.md`, `docs/14_PROJECT_STATUS.md`, `.env.example`, future focused anti-abuse migration/runtime-role/service/controller/tests

---


### 2026-10-08 Owner-approved U-07 / T3 amendment

The Project Owner's T3 brief and U-07 authorize the derived request-class,
reservation, maintenance and runtime parameters recorded in
[GUEST_T3_POLICY_AND_EVIDENCE.md](GUEST_T3_POLICY_AND_EVIDENCE.md).
That contract supersedes DEC-024's historical Guest token 180-request and
anonymous enrollment 60-allocation clauses for T3 servers only. Production
COMPATIBILITY retains the original credential cap during N/N-1 coexistence;
T4 owns activation of the higher ACTIVE budgets after a full window drains. The shared
source-failure threshold remains 60/900s; staff 30/address and five identifier
failures, and independent handoff limits, remain unchanged. Classified events
preserve existing HMAC identities/windows; no limiter reset or fail-open path
is permitted. Authenticated admission is based on current persisted authority
and commits before public disclosure; unknown requests retain conservative
PENDING accounting. Maintenance is fixed, parameterless and bounded to 1000
expired rows per invocation. DEC-025 TLS and runtime-role requirements remain
unchanged; the same policy adds finite PostgreSQL 17 resource deadlines.

## DEC-025 — Production Database Connection / Credential Hardening

Status: Accepted
Date: 2026-08-10

### Context

Phase 2 now has production staff authentication, guest access, durable anti-abuse state and a dedicated least-privilege PostgreSQL runtime role. The remaining database deployment boundary is not application business logic: production connections must be authenticated and encrypted without downgrade, the runtime process must not possess migration/admin authority, and the live connected runtime role must be checked against the accepted least-privilege contract.

Local development remains PostgreSQL on loopback and may use plaintext transport. Production must not silently inherit that development posture.

### Decision

VAL-004N hardens the existing PostgreSQL architecture. It does not introduce a new database, proxy, cloud provider or migration.

The production application runtime uses `DATABASE_URL` plus explicit Node `pg` TLS configuration. The production migration/admin path uses `MIGRATION_DATABASE_URL` with a narrowly allowlisted Prisma TLS query contract. Both paths fail closed when their production TLS or credential contract is not satisfied.

Exactly 18 forward-only migrations remain after VAL-004N.

### Runtime application connection

`DATABASE_URL` remains the runtime credential and remains a PostgreSQL URL containing username, password, host, port and database name.

For the Node application runtime:

- URL query parameters remain prohibited.
- URL fragments remain prohibited.
- username, password and database name are required.
- production TLS is configured outside the URL so node-postgres connection-string parsing cannot replace the explicit TLS object.

Production is `NODE_ENV=production`.

In production the runtime pool is created with TLS certificate verification enabled. `rejectUnauthorized: false`, trust-all certificates and plaintext fallback are prohibited.

The TLS trust source is:

```text
DATABASE_TLS_CA_PEM
```

If `DATABASE_TLS_CA_PEM` is present, it must contain one or more PEM CA certificates and is supplied as the explicit CA trust material for the Node TLS socket. If it is absent, the Node/system trusted root store is used. An empty/whitespace value is invalid when the variable is present.

Hostname/IP certificate verification remains enabled through the normal Node TLS verification path. No custom `checkServerIdentity` bypass is allowed.

Development/test may use the existing plaintext local PostgreSQL path. Production never falls back from TLS to plaintext.

### Production runtime secret compartmentalization

The application runtime deployment receives only the ordinary runtime database credential.

When `NODE_ENV=production`, application startup fails if `MIGRATION_DATABASE_URL` is present in the API process environment. The migration/admin secret belongs only in the migration/provisioning job boundary.

The runtime application must never log either URL, database passwords, CA PEM content or derived TLS material.

### Live runtime connection verification

Before the production API is considered ready to serve protected traffic, a real connection from the runtime pool must pass a startup verification transaction/query.

The verification checks the current backend itself, using PostgreSQL-authoritative metadata:

- `pg_stat_ssl` for `pg_backend_pid()` reports `ssl = true`;
- negotiated TLS version is non-null and accepted by the active Node/PostgreSQL security baseline;
- current role is not superuser;
- current role cannot create databases;
- current role cannot create roles;
- current role has no replication capability;
- current role cannot bypass RLS;
- current role does not own the current database;
- current role does not own the `public` schema;
- current role has no `CREATE` privilege on the current database;
- current role has no `CREATE` privilege on the `public` schema;
- current role owns no ordinary application tables/sequences/functions in `public`.

A missing row, insufficient authoritative result, unsafe privilege, non-TLS production connection or verification-query failure makes production startup fail closed.

The check is a compensating runtime safety guard. It does not replace the repository's explicit runtime-role `GRANT`/`REVOKE` provisioning or its integration tests.

### Migration/admin connection

`MIGRATION_DATABASE_URL` remains the migration/admin credential and must remain a distinct database role from `DATABASE_URL`.

Development/test may use a base PostgreSQL URL without TLS query parameters.

In production, Prisma migration/admin commands require a narrowly allowlisted query contract. The only accepted query keys are:

```text
sslmode=require
sslaccept=strict
sslrootcert=<optional deployment-host-native absolute certificate path>
```

Rules:

- `sslmode` must be exactly `require`;
- `sslaccept` must be exactly `strict`;
- `sslrootcert` is optional and may point to deployment-mounted CA material when the server chain is not trusted by the normal environment; when supplied, its decoded value must be a deployment-host-native absolute filesystem path, and that exact path is used by both the Node `pg` preflight and Prisma;
- duplicate query keys are rejected;
- every other query key is rejected;
- URL fragments are rejected;
- `sslmode=disable`, `sslmode=prefer`, `accept_invalid_certs` and equivalent downgrade/bypass modes are rejected.

Repository code must centralize this parsing/validation so Prisma configuration, runtime-role provisioning and production migration preflight do not drift into different URL policies.

The provisioning path compares migration and runtime identities and rejects the same role. It also rejects reusing the same database password for the migration/admin role and runtime role in production.

The migration/admin secret is never made available to the API runtime process.

### Migration TLS verification

A production migration/provisioning job must prove its actual PostgreSQL connection is encrypted before applying schema or privilege changes.

A focused preflight connection using the migration/admin URL checks `pg_stat_ssl` for its own backend and fails closed if TLS is not active. Prisma migration execution must use the same validated target and accepted TLS parameters.

No code may strip the accepted TLS parameters before invoking Prisma in production.

### Network boundary

Application code cannot prove cloud firewall/VPC/security-group topology. Therefore the following is a deployment gate, not a claim of repository enforcement:

- production PostgreSQL must not be directly exposed as a generally reachable public-internet service;
- runtime database access is restricted to the application deployment network/identity boundary;
- migration/admin access is restricted to the controlled deployment/migration boundary;
- direct developer workstation access to production is not a default application requirement;
- provider firewall/security-group/private-network/allowlist controls must be documented and verified for the actual production environment;
- no provider-specific mechanism is selected by this decision.

The local `docker-compose.yml` loopback-only PostgreSQL publication remains development-only and is not a production deployment topology.

### Credential handling and rotation

Production database credentials and CA material are supplied by deployment secret management, never committed to Git.

Rotation must support independent runtime and migration/admin credential replacement. Rotation must not require making the migration/admin credential visible to the API process.

The repository does not invent a cloud secret manager or an automatic credential-rotation service in VAL-004N. The deployment runbook must record ownership and the procedure for rotating each database identity.

### Error behavior

Database TLS/configuration/privilege verification failures are startup/deployment failures, not public API detail.

Errors may identify the violated configuration category but must not include:

- database URLs;
- usernames when unnecessary;
- passwords;
- CA PEM content;
- certificate bodies;
- raw connection options;
- server internals beyond the bounded reason needed for operators.

Protected traffic is not served through a knowingly unsafe production database connection.

### Testing contract

Tests must prove at minimum:

- production runtime URL rejects query strings/fragments and missing credentials;
- production runtime creates TLS with certificate verification enabled;
- explicit CA PEM is passed without logging it;
- production cannot start on a plaintext live PostgreSQL connection;
- production cannot start with superuser/createdb/createrole/replication/bypassrls/ownership/CREATE-capable runtime roles;
- accepted least-privilege runtime role passes the live verification;
- production API startup rejects the presence of `MIGRATION_DATABASE_URL`;
- production migration URL requires exact `sslmode=require` + `sslaccept=strict` and rejects all non-allowlisted/duplicate/downgrade parameters;
- production provisioning rejects same runtime/migration role and same password;
- migration/admin preflight rejects a plaintext live connection;
- local development loopback PostgreSQL remains usable without production TLS configuration;
- no database password/URL/CA material is emitted by tested error/log paths;
- existing runtime-role privilege tests remain green;
- migrations remain exactly 18 and migrations 1–18 are unchanged by this task.

### Documentation / deployment gate

VAL-004N must update the binding security/database/engineering status docs and `.env.example` with safe placeholders only.

It must add a provider-neutral production database deployment checklist that separates repository-enforced checks from infrastructure checks. The checklist must include TLS verification, private/restricted network reachability, runtime/admin credential separation, secret storage/rotation ownership, and encrypted backup/restore ownership status.

The checklist is evidence for later Phase 2 closure; checking in a template does not falsely assert that an actual production provider has already been configured.

### Scope boundary

VAL-004N does not:

- start Phase 3;
- redesign DEC-023 staff auth or DEC-024 anti-abuse;
- add Redis/WAF/CAPTCHA/MFA;
- choose a cloud/VPC/database provider;
- implement object storage;
- implement backup infrastructure itself;
- claim a fresh Standard Security Scan;
- declare Phase 2 production-ready by itself.

After VAL-004N is merged, the next required gate is a final Phase 2 closure/security-integrity review, including the explicitly tracked production deployment checklist and a fresh security review/scan where tooling permits.

### Reason

The existing architecture already has the right separation primitives: distinct runtime/migration URLs, a dedicated runtime role and PostgreSQL as the mandatory shared store. The smallest hardening step is therefore to make TLS verification and runtime privilege safety fail closed, compartmentalize the admin credential, and turn provider-owned network/security controls into explicit deployment evidence rather than pretending application code can enforce them.

## DEC-026 — Shared API Infrastructure Ownership

Status: Accepted
Date: 2026-08-11

### Context

Phase 2 started with one check-in-focused HTTP module, but subsequent slices placed several cross-cutting production boundaries under `modules/check-in-api`: the application runtime PostgreSQL provider/lifecycle, request-ID middleware/request shape, generic HTTP exception/filter behavior, and operation timing/observer primitives. Staff authentication, guest access and shared anti-abuse already consume those boundaries, and Phase 3 will add additional operational modules.

If these primitives remain owned and named by Check-In, later features must import a feature module merely to obtain infrastructure. That creates the wrong dependency direction and makes future module separation riskier.

This decision is structural only. It must not change any externally observable behavior or accepted security/domain contract.

### Decision

Before Phase 3, move already-shared API/runtime infrastructure to neutral application ownership. Do this in staged cleanup PRs so behavior remains reviewable.

The cleanup sequence is:

1. **Shared Runtime Infrastructure** — neutral database/HTTP/observability ownership; Check-In consumes it.
2. **Feature Ownership** — separate Staff Auth, Anti-Abuse, Guest Access and Check-In module ownership without changing routes/contracts.
3. **Architecture Guard** — enforce dependency direction with static checks; file-size checks are advisory only.

VAL-004O implements only step 1.

### Runtime database ownership

The production runtime PostgreSQL pool is application infrastructure, not a Check-In dependency.

Use one neutral provider token, canonically named `RUNTIME_POSTGRES_POOL` or an equivalently neutral repository-convention name. There must be exactly one ordinary application runtime pool instance.

A neutral runtime database module owns:

- creation through the existing `createRuntimePostgresPool` contract;
- production startup safety verification from DEC-025;
- application shutdown of the pool;
- exporting the runtime pool provider to feature modules.

The refactor must preserve DEC-025 exactly:

- production verified TLS;
- `MIGRATION_DATABASE_URL` compartmentalization;
- live `pg_stat_ssl` verification;
- runtime role safety/ownership/CREATE checks;
- fail-closed startup;
- local development plaintext capability.

No second pool, second lifecycle owner, fallback pool or feature-specific database connection may be introduced.

`CHECK_IN_POSTGRES_POOL` is retired once all consumers in this cleanup use the neutral runtime token. Feature code must not retain an alias that allows new code to continue treating the shared pool as Check-In-owned.

### HTTP request and request-ID ownership

The request shape needed for request IDs, raw headers and socket peer information is shared HTTP infrastructure.

Move it to a neutral HTTP boundary with a neutral name such as `ApiRequest`. Preserve the exact currently accepted request-ID contract:

- inbound `X-Request-Id` is used only when it matches the existing bounded ASCII-safe pattern;
- otherwise the server creates a UUID;
- the same resolved request ID is attached to the request and emitted as `X-Request-Id`;
- no new header names, formats or reflection behavior are introduced.

Request-ID middleware must remain applied to every existing protected Staff Auth, Staff Check-In and Guest route currently covered. Cleanup A may keep route registration in `CheckInApiModule` temporarily if moving controller ownership belongs to Cleanup B; infrastructure implementation itself must be neutral.

### HTTP error/filter ownership

HTTP exception creation and the global exception filter behavior already serve Staff Auth, Guest Access, Anti-Abuse and Check-In. Their infrastructure belongs under a neutral HTTP boundary.

Cleanup A may move the existing mapping implementation mechanically, but it must preserve every current externally observable mapping exactly, including:

- HTTP status;
- stable error code;
- safe message;
- request ID;
- `Retry-After` semantics;
- `Cache-Control: no-store` behavior where currently required;
- non-disclosure of SQL/stacks/credentials/internal details.

Do not redesign the error taxonomy in this cleanup. A neutral shared file may still contain feature-specific mappings temporarily; final feature ownership can be improved later without changing transport behavior.

The transport-validation error type may be renamed only if all behavior/tests remain identical and the new name is neutral. A compatibility alias is acceptable only inside this refactor if needed to keep the diff safe; it must not become a new architectural dependency.

### Operation timing and observer ownership

Monotonic timing and operation observation are cross-cutting infrastructure when they do not contain feature semantics.

Move the generic clock interface/provider and generic operation observer/measurement primitives to a neutral observability boundary. The no-op observer remains behaviorally identical.

The operation runner may move to shared infrastructure only if its error mapping and measurement behavior remain identical. If the runner still contains Check-In-specific measurement fields or semantics that cannot be neutralized mechanically without changing behavior, keep the runner feature-local in VAL-004O and move only the genuinely generic primitives. Do not invent a generic framework merely to complete the move.

Instrumentation failures must continue never to change the business response.

### Dependency direction

After VAL-004O, the intended direction is:

```text
feature modules
  -> common/runtime database
  -> common/http
  -> common/observability
```

Common/shared infrastructure must not import feature modules.

VAL-004O does not yet require final Staff Auth / Guest / Anti-Abuse / Check-In module separation; that is Cleanup B.

### Behavior freeze

VAL-004O must not change:

- routes or HTTP methods;
- request/response schemas;
- status/error codes or safe messages;
- staff access/refresh/refresh-cookie behavior;
- guest bearer transport/resolution behavior;
- anti-abuse thresholds, ordering, HMAC scopes, trusted proxy rules or `Retry-After` calculations;
- authorization/tenant/location/role behavior;
- transaction or locking behavior;
- PostgreSQL TLS/credential/privilege policy;
- database schema, migrations or grants;
- audit/evidence semantics;
- any Phase 3 state or domain behavior.

File moves, symbol renames and import rewiring are allowed only when regression coverage proves behavior is unchanged.

### Regression requirements

At minimum preserve and run:

- Staff Auth integration coverage;
- Anti-Abuse integration coverage;
- Guest/Check-In API integration coverage;
- production database safety integration coverage;
- request-ID tests;
- exception/filter tests including 429/503 headers;
- runtime pool lifecycle tests.

Add focused wiring tests where necessary to prove:

- only one runtime pool provider/lifecycle exists;
- features resolve the neutral runtime provider;
- production startup verification still runs before readiness;
- shutdown still closes the pool once;
- existing route middleware/filter coverage remains intact.

Exactly 18 migrations remain unchanged. No dependencies or lockfile changes are part of this decision.

### Consequences

Phase 3 feature modules can depend on neutral application infrastructure instead of importing Check-In solely for shared services. Check-In becomes a consumer rather than infrastructure owner, reducing coupling before parking/key/dispatch modules are introduced.

This cleanup does not itself make Phase 2 production-ready and does not replace the remaining secure staff provisioning/onboarding and final Phase 2 security/integrity closure gates.

## DEC-027 — Feature Module Ownership Before Phase 3

Status: Accepted
Date: 2026-08-11

## Context

VAL-004O / DEC-026 moved the runtime PostgreSQL pool, request transport/request ID, generic HTTP error/filter behavior, and generic observability primitives out of Check-In ownership. The remaining API composition is still feature-coupled: `CheckInApiModule` registers Staff Auth, Anti-Abuse, Guest Access and Staff Check-In providers/controllers; Staff Auth depends on the Check-In-named operation runner; Staff principal wiring lives under Check-In; and guest issue/revoke/read application behavior still lives in `CheckInApiService` / `GuestCheckInController`.

Phase 3 will add parking/key/dispatch modules. Those modules must not depend on Check-In merely to reach authentication, anti-abuse, guest access, or shared HTTP execution boundaries.

This decision is structural only. It must preserve every accepted Phase 2 product/security/transport behavior.

## Decision

Complete Cleanup B by separating API feature ownership into four feature modules composed directly by `AppModule`:

- `AuthModule`
- `AntiAbuseModule`
- `GuestAccessModule`
- `CheckInModule`

Shared runtime database, HTTP and observability infrastructure remain under `apps/api/src/common/**` as accepted by DEC-026.

No feature module may become a replacement god-module.

## Dependency direction

The intended feature dependency graph is acyclic:

```text
AppModule
  -> AuthModule
  -> AntiAbuseModule
  -> GuestAccessModule
  -> CheckInModule

AuthModule
  -> AntiAbuseModule
  -> RuntimeDatabaseModule
  -> HttpInfrastructureModule

GuestAccessModule
  -> AuthModule        (staff-principal boundary only)
  -> AntiAbuseModule
  -> RuntimeDatabaseModule
  -> HttpInfrastructureModule

CheckInModule
  -> AuthModule        (staff-principal boundary only)
  -> RuntimeDatabaseModule
  -> HttpInfrastructureModule

AntiAbuseModule
  -> RuntimeDatabaseModule
```

Common infrastructure must never import a feature module. `AuthModule` and `AntiAbuseModule` must not import Guest Access or Check-In. Guest Access and Check-In must not import each other merely for convenience.

## Auth ownership

`AuthModule` owns:

- `StaffAuthController`;
- `StaffAuthService`;
- `StaffAuthOriginPolicy`;
- `Argon2StaffPasswordVerifier` and `STAFF_PASSWORD_VERIFIER` wiring;
- `DatabaseStaffPrincipalResolver`;
- the `STAFF_PRINCIPAL_RESOLVER` token and `StaffPrincipal` / `StaffPrincipalResolver` boundary.

Move the staff-principal boundary out of `check-in-api.boundaries.ts` into Auth ownership. `AuthModule` exports only the principal-resolution boundary/providers needed by Staff Check-In and staff-facing Guest Access.

Authentication token formats, refresh rotation/replay handling, cookie behavior, origin behavior, disabled-user checks and DEC-023 semantics do not change.

## Anti-Abuse ownership

`AntiAbuseModule` owns:

- `AntiAbuseService`;
- `AntiAbuseKeyDeriver`;
- `TrustedClientAddressResolver`;
- the existing anti-abuse errors/contracts required by consumers.

It imports the neutral runtime database module and exports only the anti-abuse services needed by Auth and Guest Access.

DEC-024 behavior is frozen: exact rolling-window semantics, HMAC scopes, thresholds, transaction/advisory-lock behavior, trusted-proxy/X-Forwarded-For handling, fail-closed behavior, `Retry-After`, and durable PostgreSQL storage remain unchanged.

## Guest Access ownership

`GuestAccessModule` owns all guest-access API/application behavior that is currently embedded under Check-In ownership.

Move out of `CheckInApiService` / `GuestCheckInController`:

- guest access issue;
- guest access revoke;
- guest token resolution;
- transactional guest resolution used with Anti-Abuse;
- guest-safe session read.

Use a dedicated `GuestAccessService` (or equivalently clear feature-local name).

Use feature-owned controllers. A practical split is:

- a staff-facing guest-access controller for issue/revoke;
- a guest-facing controller for `GET /v1/guest/session`.

Controller class/file names may change internally, but routes may not.

The exact existing routes remain:

- `POST /v1/staff/check-in/sessions/:sessionId/guest-access/issue`
- `POST /v1/staff/check-in/sessions/:sessionId/guest-access/revoke`
- `GET /v1/guest/session`

Guest bearer validation, duplicate Authorization-header rejection, anti-abuse reservation/finalization ordering, token rotation/revocation semantics, response schemas and safe errors remain unchanged.

`CheckInApiService` must no longer expose guest issue/revoke/resolve methods after this cleanup.

## Check-In ownership

`CheckInModule` owns only Staff Check-In behavior:

- intake;
- vehicle identity;
- condition notes/corrections/photos/completion;
- completion of Check-In;
- Check-In-specific KPI/measurement enrichment such as `checkInElapsedMs`.

It owns `StaffCheckInController`, `CheckInApiService`, and any thin Check-In-specific operation-runner wrapper needed for KPI enrichment.

Guest Access methods/controllers and Auth/Anti-Abuse providers must not remain registered by `CheckInModule`.

The legacy `CheckInApiModule` name should be retired in favor of `CheckInModule` once all composition is separated.

## Neutral operation runner

Staff Auth and Guest Access must not depend on a Check-In-named operation runner.

Create a narrow neutral `ApiOperationRunner` under common HTTP/operation infrastructure. It preserves the existing operation execution behavior exactly:

- obtains the existing request ID/fallback;
- runs the action;
- maps failures through the existing `mapApiError` + `apiHttpException` behavior;
- sets the neutral `operationMeasured` marker at the same point;
- emits one operation measurement through the existing shared clock/observer;
- swallows observer/instrumentation failures so they never alter the business response.

To preserve Check-In's feature-local `checkInElapsedMs` without polluting shared `ApiRequest`, the neutral runner may accept one narrow optional measurement-decorator/enricher callback. The callback may add feature-local measurement fields to the emitted object but may not alter core duration/error/outcome/operation/request-id semantics.

`CheckInOperationRunner` may remain as a thin feature-local wrapper over `ApiOperationRunner` whose only extra responsibility is adding `checkInElapsedMs` when available. Auth and Guest Access use `ApiOperationRunner` directly.

Do not create a plugin/event/telemetry framework beyond this single behavior-preserving hook.

## Request-ID middleware ownership

After module separation, request-ID middleware coverage must no longer be owned centrally by Check-In.

Each controller-owning feature module applies the existing shared `RequestIdMiddleware` exactly once to its own controllers:

- `AuthModule` -> `StaffAuthController`;
- `GuestAccessModule` -> its staff-facing and guest-facing controllers;
- `CheckInModule` -> `StaffCheckInController`.

Do not broaden middleware coverage to unrelated routes and do not double-apply it.

The global `ApiExceptionFilter` remains shared infrastructure and must be registered globally exactly once through the existing `HttpInfrastructureModule` ownership.

## App composition

`AppModule` directly composes the feature modules instead of importing one Check-In composition module that owns all features.

`AppController` behavior remains unchanged.

Shared modules may be imported by multiple feature modules through normal Nest module composition, but regression tests must prove this does not create duplicate runtime pool instances, lifecycle owners, global filter registrations, or middleware execution.

## File organization

Internal file moves/renames are allowed when they clarify ownership. Prefer existing repository conventions and avoid cosmetic churn unrelated to ownership.

Do not create a module per class. The four feature modules above are the accepted boundary for Cleanup B.

## Behavior freeze

VAL-004P must not change:

- any route or HTTP method;
- request/response schema or response body;
- public error code, status or safe message;
- request-ID semantics;
- `Retry-After`, `Cache-Control` or auth `Pragma` behavior;
- staff access/refresh token or refresh-cookie behavior;
- guest bearer/token behavior;
- authentication/authorization, tenant, Location or role checks;
- anti-abuse thresholds, scopes, HMAC derivation, ordering, trusted-proxy behavior or transaction semantics;
- PostgreSQL runtime TLS/credential/privilege/startup safety behavior;
- database schema, migrations or grants;
- audit/evidence/custody behavior;
- ValetSession state behavior;
- any Phase 3 behavior.

## Regression requirements

At minimum prove:

- all current Staff Auth integration behavior remains green;
- staff principal resolution still uses the same DB/auth contract;
- all current Guest Access issue/revoke/read behavior remains green;
- Anti-Abuse 429/503, reservation/finalization and trusted-address behavior remain green;
- Staff Check-In routes and `checkInElapsedMs` observation remain green;
- request-ID middleware runs once on every previously covered route;
- the global exception filter remains one effective registration;
- only one runtime PostgreSQL pool/lifecycle exists;
- the four feature modules resolve without circular dependencies;
- common code imports no feature code;
- `CheckInModule` no longer registers Auth/Anti-Abuse/Guest controllers/providers;
- `CheckInApiService` contains no Guest Access methods;
- exactly 18 migrations remain unchanged;
- no dependency/package-lock changes are introduced.

## Consequences

Phase 3 modules can depend on explicit authentication/common infrastructure without importing Check-In as an application composition root. Guest Access becomes a real feature boundary, Anti-Abuse remains a low-level reusable security boundary, and Check-In becomes limited to its custody-entry workflow.

Cleanup C (architecture dependency guard) remains required after this change. Secure staff provisioning/onboarding and the final Phase 2 security/integrity closure, including a fresh post-fix Standard Security Scan, remain separate gates. This decision does not declare Phase 2 production-ready and does not start Phase 3.

## DEC-028 — Pre-Phase-3 Architecture Guard

Status: Accepted
Date: 2026-08-11

## Context

DEC-026 and DEC-027 corrected the API ownership model before Phase 3: shared runtime/database/HTTP/observability infrastructure moved under `apps/api/src/common/**`, and API feature composition was split into Auth, Anti-Abuse, Guest Access and Check-In modules. Those boundaries are currently protected primarily by code review and focused tests. A later import can silently recreate the old coupling while still compiling and passing behavior tests. Phase 3 will add more feature modules, so the accepted dependency direction must become a deterministic repository gate before new operational code is introduced.

This decision adds architecture enforcement only. It does not change runtime behavior.

## Decision

Add a lightweight, repository-owned architecture guard with two layers:

1. ESLint `no-restricted-imports` rules for fast developer/editor feedback on obvious forbidden feature directions.
2. A root `architecture:check` command implemented with Node built-ins only that resolves repository-relative source imports and is the authoritative CI dependency-direction check.

Do not add an architecture framework or dependency.

## Enforced source boundaries

The checker applies to TypeScript/TSX source under `apps/api/src/**`.

### Common infrastructure

`apps/api/src/common/**` must not import any code under `apps/api/src/modules/**`. Allowed direction is feature/domain code -> common, never common -> feature/domain modules.

### Anti-Abuse

`apps/api/src/modules/anti-abuse/**` is a low-level reusable security feature. It must not import Auth, Guest Access or Check-In code. It may depend on neutral common infrastructure and its existing external/package dependencies.

### Auth

`apps/api/src/modules/auth/**` may depend on Anti-Abuse and neutral common infrastructure. It must not import Guest Access or Check-In.

### Guest Access

`apps/api/src/modules/guest-access/**` may depend on Auth, Anti-Abuse, neutral common infrastructure, and its existing lower-level guest/session domain commands. It must not import Check-In.

### Check-In

`apps/api/src/modules/check-in-api/**` may depend on Auth, neutral common infrastructure, and its existing lower-level valet-session/vehicle domain commands. It must not import Guest Access or direct Anti-Abuse unless a future Accepted decision changes the graph.

### Existing lower-level domain folders

Cleanup C does not redesign ownership of existing lower-level folders such as `modules/valet-sessions/**` or `modules/vehicles/**`. The architecture guard must not invent new restrictions on those folders beyond preventing `common/**` from importing module code.

## Import resolution

The repository checker inspects static TypeScript/JavaScript module edges sufficiently to prevent trivial bypasses through relative path spelling. For relative imports/exports, normalize the importing file and target path before applying boundary rules. It covers normal static `import ... from`, side-effect imports, and `export ... from` forms used by the repository. The guard must not depend on formatting style or a particular number of `../` path segments.

## Retired architecture symbols

Cleanup C prevents reintroduction of `CheckInApiModule`, `CHECK_IN_POSTGRES_POOL`, and `GuestCheckInController` in application source. The check is for architectural regression, not historical documentation; documentation/decision logs may mention retired names. Do not broaden this into a generic banned-word system.

## App composition

The accepted API feature composition remains `AuthModule`, `AntiAbuseModule`, `GuestAccessModule`, and `CheckInModule`. The existing feature-ownership regression test remains the primary executable proof of exact Nest module composition and one global filter/provider ownership; the architecture script does not parse Nest decorator metadata itself.

## File-size policy

Large files are an advisory maintainability signal only. The architecture checker may emit a warning for TypeScript/TSX source files above approximately 450 lines. File size alone must never make `architecture:check` fail. Do not add an arbitrary hard failure at 800 lines or any other line count.

## CLI and CI

Add a root `architecture:check` command. It returns non-zero for architecture violations and zero when only advisory file-size warnings exist. Add it to the existing GitHub Actions quality job so pull requests and pushes to `main` cannot pass CI with a forbidden dependency edge. Keep the existing lint, typecheck, test and build gates.

## Testability

The checker must be deterministic and testable without mutating production source files. Provide focused automated tests/fixtures proving common -> module; Anti-Abuse -> Auth, Guest Access and Check-In; Auth -> Guest Access and Check-In; Guest Access -> Check-In; Check-In -> Guest Access and Anti-Abuse all fail; allowed current edges pass; normalized relative paths cannot bypass the rule; retired architecture symbols are rejected in application source; and an oversized source fixture produces only a warning and successful exit when no architecture violation exists. Tests may exercise the checker through a temporary fixture root or an exported pure function, but must not require a new dependency.

## ESLint role

ESLint restrictions are fast feedback, not the sole source of truth. Use existing ESLint capabilities only. Do not install an import/dependency plugin. Rules should align with the repository checker and avoid duplicating unrelated style policy.

## Behavior freeze

VAL-004Q must not change routes/HTTP methods; request/response schemas; status/error codes or safe messages; authentication/authorization; staff access/refresh/cookie behavior; guest credential behavior; anti-abuse thresholds, scopes, ordering or proxy behavior; transaction or locking behavior; runtime PostgreSQL pool/lifecycle/TLS/privilege behavior; database schema, migrations or grants; audit/evidence/custody behavior; ValetSession state behavior; or any Phase 3 product behavior.

## Dependency and database freeze

No dependency is added or removed. `pnpm-lock.yaml` remains unchanged. The root `package.json` may change only to add the `architecture:check` script. Exactly 18 existing migrations remain unchanged. Prisma schema remains unchanged.

## Documentation

Record DEC-028 canonically in `docs/08_DECISIONS_LOG.md` and update repository structure/execution/status docs as needed. Cleanup A and Cleanup B are complete. Cleanup C is the final structural-cleanup slice, but its completion does not make Phase 2 production-ready. Secure staff provisioning/admin onboarding and final Phase 2 security/integrity closure, including a fresh post-fix Standard Security Scan, remain separate gates before Phase 3.

## Consequences

- Future Phase 3 code receives immediate feedback when it tries to depend in the wrong direction.
- The accepted feature graph is protected by CI rather than convention alone.
- No new architecture toolchain dependency is introduced.
- File-size warnings encourage review without creating arbitrary CI failures.
- Runtime behavior remains unchanged.

## DEC-029 — Controlled Production Staff Provisioning

Status: Accepted
Date: 2026-08-11

## Context

DEC-023 provides production staff authentication only for an existing `User` whose stored password verifier matches the locked Argon2id profile. The demo seed intentionally uses non-authentic password hashes and is development/test-only. There is currently no production-safe path to create the first real staff account or attach its first Organization membership and Location access.

Opening a public signup route or a password-only Company Admin provisioning API would create a new privileged attack surface immediately before Phase 3. The current security contract also states that password-only sessions do not assert MFA; Company Admin and VAYLET Super Admin capabilities that require MFA remain unavailable.

Production database administration already has a separate controlled migration/provisioning boundary under DEC-025. That boundary owns `MIGRATION_DATABASE_URL`, strict production TLS validation, and administrative database mutation. The ordinary API runtime must not possess that credential.

VAL-004R closes only the account-creation gap. It does not create a general tenant-admin account-management API.

## Decision

Add one repository operator command for **create-only staff provisioning**. It is not an HTTP endpoint and is not imported by the application runtime.

Canonical command ownership is the API workspace because the command must reuse Staff Auth contracts and Argon2id behavior, while its database connection must reuse the existing DEC-025 migration/provisioning connection policy.

Preferred implementation location:

```text
apps/api/tools/provision-staff.ts
```

Preferred package command:

```text
pnpm --filter @valet/api staff:provision -- <arguments>
```

The tool is repository/deployment operator tooling. It may use the already-present `tsx`, `argon2`, `pg`, and `@valet/contracts` dependencies of `@valet/api`. No new external dependency is required.

The API workspace lint command must cover the new operator tool so it does not become an unreviewed executable path.

## Database authority

The provisioning tool uses **only** `MIGRATION_DATABASE_URL` for database mutation.

It must call the existing canonical helpers from:

```text
packages/database/scripts/database-connection-policy.mjs
```

including:

- `parseMigrationDatabaseUrl`
- `migrationClientConfig`
- `verifyMigrationConnectionTls`

Do not copy or fork DEC-025 TLS/URL parsing logic into the tool.

`NODE_ENV` must be explicit and limited to:

```text
production
development
test
```

For `production`, the existing strict migration URL and live TLS verification apply before any transaction or mutation.

For `development` and `test`, the provisioning command additionally requires a loopback PostgreSQL host (`127.0.0.1`, `localhost`, or loopback IPv6) so an omitted/mistyped production environment cannot silently turn into a plaintext remote administrative connection.

The command does not need `DATABASE_URL` and must not make `MIGRATION_DATABASE_URL` available to the API runtime.

## Command inputs

Provisioning requires explicit operator-supplied scope:

- `--organization-id <uuid>`
- one or more repeated `--location-id <uuid>` values
- `--audit-location-id <uuid>`
- `--role <role>`
- `--email <email>`
- `--operator-ref <opaque-reference>`
- `--reason <bounded-reason>`
- `--password-stdin`

Accepted tenant roles are exactly:

```text
ORG_ADMIN
LOCATION_MANAGER
VALET_SUPERVISOR
VALET_EMPLOYEE
```

At least one Location is required. Duplicate Location IDs are rejected. The audit Location must be one of the granted Location IDs.

`operator-ref` is deployment/operator provenance such as a controlled change/ticket/actor reference. It is **not** a VAYLET Super Admin identity and grants no application authorization. It must be bounded and free of control characters.

`reason` is required and bounded. It is audit context, not an authorization input.

Unknown command options or missing required inputs fail closed.

## Email contract

The command must use the existing `staffLoginRequestSchema` to normalize and validate the submitted email, so provisioned identity uses exactly the same trim/lowercase/email/max-length behavior as Staff Auth login.

The normalized email is the only value persisted.

No alternate username or phone-based authentication convention is introduced.

## Password transport and policy

The raw password is accepted **only** from standard input when `--password-stdin` is present.

The command must not accept a raw password through:

- a command-line value such as `--password`;
- an environment variable;
- a config file argument;
- JSON output/logging.

When stdin is an interactive TTY, the command fails with a bounded instruction to provide password input through the controlled stdin path rather than visibly echoing a secret.

The stdin reader removes at most one terminal line ending (`LF` or `CRLF`) and otherwise does not trim or normalize the password. Embedded newlines are rejected.

While Staff Auth is password-only, a provisioned password must contain at least **15 Unicode code points**. The provisioning command accepts up to **128 Unicode code points** and remains subject to the existing Staff Auth maximum of **1024 UTF-8 bytes**. No character-class composition rule is added.

The password is hashed with the exact DEC-023-compatible Argon2id profile:

```text
argon2id
version = 19
memoryCost = 65536 KiB
timeCost = 3
parallelism = 4
saltLength = 16 bytes
hashLength = 32 bytes
```

Tests must prove the resulting verifier is accepted by the current `isAcceptedStaffPasswordHash` validator.

The raw password and its verifier must never be emitted in normal output, errors, logs, or AuditEvent metadata.

## Create-only semantics

VAL-004R creates a **new** staff identity only.

The command fails closed if the normalized email already exists in `users`.

It does not:

- reset or rotate an existing password;
- reactivate a disabled User;
- attach a new Organization membership to an existing User;
- change an existing membership role/status;
- change existing Location access.

Those are separate privileged lifecycle operations and require their own accepted contract if later needed.

This deliberate create-only behavior prevents an operator typo from silently taking over or broadening an existing identity.

## Organization and Location validation

Before mutation, the transaction must verify from persisted rows that:

- the target Organization exists and is `ACTIVE`;
- every requested Location exists;
- every requested Location belongs to that exact Organization;
- every requested Location is `ACTIVE`;
- the audit Location is among the granted Location IDs.

Caller-supplied names, Organization codes, Location codes, membership IDs, or tenant claims are not substitutes for persisted UUID relationships.

No Organization or Location is created by this command.

## Atomic persistence

One database transaction creates all required state:

1. one `users` row with:
   - generated UUID;
   - normalized email;
   - accepted Argon2id verifier;
   - `ACTIVE` status;
   - no phone by default;
2. one `organization_memberships` row with:
   - generated UUID;
   - requested Organization;
   - requested role;
   - `ACTIVE` status;
3. one `membership_location_access` row for each requested Location;
4. one `audit_events` row.

Server/database time is authoritative for persisted timestamps.

Any failure rolls back the entire provisioning attempt. No partial User, membership, Location access, or audit record may remain.

The existing unique email constraint remains the final concurrency guard for simultaneous attempts. A duplicate/concurrent loser is mapped to a bounded provisioning error without raw constraint/SQL details.

No schema migration is required by this decision. Exactly 18 migrations remain unchanged.

## Audit contract

Successful provisioning writes exactly one AuditEvent in the same transaction.

Canonical values:

```text
eventType  = STAFF_ACCOUNT_PROVISIONED
entityType = OrganizationMembership
entityId   = newly created membership ID
```

`organizationId` is the target Organization.

`locationId` is the explicit `--audit-location-id` required by the command and must be one of the new membership's granted Locations.

`actorMembershipId` is `NULL` because the action is performed through the controlled platform/deployment operator boundary, not by an authenticated tenant membership.

`metadataJson` contains only bounded safe provenance/scope information:

```text
provisioningBoundary = CONTROLLED_OPERATOR
operatorRef
reason
role
locationIds (sorted)
```

Audit metadata must not contain:

- email;
- phone;
- raw password;
- password hash;
- database URL/role/password;
- TLS CA content/path;
- Authorization/cookie/token data.

This operator reference is accountability metadata only and does not create VAYLET Super Admin persistence.

## Output and error behavior

On success the command emits one machine-readable JSON result containing only non-secret identifiers/scope, such as:

- `userId`
- `membershipId`
- `organizationId`
- `locationIds`
- `role`
- `auditEventId`

Do not emit the email, password, password hash, operator reason, database URL, or database identity.

Expected validation/conflict/database/TLS failures use bounded operator-safe messages. Raw SQL, PostgreSQL constraint names, stack traces, connection options, credentials, certificate contents, and secret input must not be printed by the normal CLI path.

A non-successful provisioning exits non-zero.

## ORG_ADMIN / MFA boundary

The command may create an `ORG_ADMIN` membership because it is a controlled offline operator action and `ORG_ADMIN` is an existing tenant role.

This **does not** make password-only sessions MFA-capable and does not enable privileged Company Admin APIs that require MFA. No such privileged HTTP capability may be introduced by VAL-004R.

VAYLET Super Admin remains a separate platform-level identity model and is not created or inferred here.

## Runtime / architecture boundary

No HTTP route, Nest provider, application module, middleware, global filter, Staff Auth token/session behavior, Anti-Abuse behavior, or runtime database provider changes are part of VAL-004R.

The provisioning tool is operator tooling outside `apps/api/src/**`; the application runtime must not import it.

DEC-028 architecture checks remain unchanged and green.

## Regression requirements

Tests must prove at minimum:

- staff-login email normalization/validation parity;
- password accepted only through the stdin boundary;
- one terminal line ending handling without general trimming;
- embedded newline rejection;
- 15-code-point minimum and 128-code-point/1024-byte bounds;
- generated Argon2id verifier passes the current Staff Auth verifier-format validator;
- all four accepted roles;
- missing/inactive Organization rejection;
- missing/inactive/cross-Organization Location rejection;
- duplicate Location input rejection;
- audit Location membership requirement;
- existing normalized email rejection without mutation;
- atomic rollback when membership/access/audit insertion fails;
- one safe `STAFF_ACCOUNT_PROVISIONED` AuditEvent on success;
- audit metadata excludes credential/email/database secret material;
- production migration TLS verification runs before `BEGIN`/mutation;
- non-production execution rejects non-loopback administrative database targets;
- tested error/output paths do not expose raw password/hash/database URL/CA material;
- no public route or runtime import is introduced;
- architecture check remains green;
- exactly 18 migrations and Prisma schema remain unchanged.

Run the normal full repository quality gates and the existing development/production Prisma validation/diff checks.

## Scope boundary

VAL-004R does not:

- start Phase 3;
- add signup;
- add password reset/change;
- add account reactivation/deactivation;
- add existing-user membership attachment;
- add role changes;
- add MFA/passkeys/SSO;
- add VAYLET Super Admin persistence;
- create Organizations or Locations;
- redesign Staff Auth/Anti-Abuse;
- change token/cookie/session lifetimes;
- change database schema/migrations;
- declare external deployment checklist evidence complete;
- claim a fresh Standard Security Scan;
- declare Phase 2 production-ready by itself.

## Consequences

- Production can create the first real Staff Auth-capable accounts without manual password-hash SQL or a public signup surface.
- Account creation remains behind the already hardened administrative database boundary.
- Tenant role and Location scope are explicit and atomically audited.
- Existing identities cannot be silently reset or broadened by this command.
- MFA-gated privileged administration and broader account lifecycle management remain separate future security decisions.
- Final Phase 2 security/integrity closure and a fresh post-fix Standard Security Scan still remain before Phase 3.

## DEC-030 — Agent Code Structure Limits

Status: Accepted

## Context

The repository already enforces API dependency direction through DEC-028, but its file-size rule is advisory only. The project owner has now made code-file size and responsibility boundaries a binding implementation constraint to prevent agents from repeatedly appending logic to large files and creating recurring repair/refactor loops.

This decision supersedes DEC-028 only where DEC-028 says file size is advisory-only. DEC-028 dependency-direction, retired-symbol, and architecture-check semantics otherwise remain unchanged.

## Decision

1. `docs/17_AGENT_CODE_STRUCTURE_RULES.md` is a binding repository contract and must be read before every code-changing task.

2. Authored repository code has a target hard maximum of **300 physical lines per file**. Covered authored code includes repository-owned `.ts`, `.tsx`, `.js`, `.mjs`, and `.cjs` implementation, test, script, and tool files. Generated/vendor/build output, lockfiles, Prisma migration SQL, and documentation are excluded.

3. A new authored code file must not exceed 300 physical lines.

4. A modified authored code file that was at or below 300 physical lines before the change must remain at or below 300 lines after the change.

5. Pre-existing legacy authored files already above 300 lines are grandfathered only to avoid an unrelated mass-refactor gate. They must not increase in physical line count. When a task adds meaningful behavior to such a file, the relevant responsibility must be extracted/split rather than appended.

6. Agents may not game the limit by compressing readable code, collapsing unrelated declarations, removing useful formatting, or otherwise reducing line count at the expense of maintainability.

7. Splits must follow real responsibility boundaries. The policy does not authorize speculative abstractions, circular dependencies, ownership inversion, behavior changes, or unrelated refactors.

8. Repository architecture tooling must enforce the 300-line rule deterministically. The preferred enforcement is a committed baseline of grandfathered legacy oversized files/line counts plus current-tree checks:
   - a >300 file absent from the baseline fails;
   - a baseline legacy oversized file whose line count increases fails;
   - once a baseline file is reduced to <=300, it should no longer need grandfathering;
   - current dependency-direction checks remain unchanged.

9. VAL-004R is the transition boundary. Files already created by VAL-004R before this owner instruction may be split during the immediately following structure-enforcement task rather than blocking the in-flight provisioning implementation.

10. After VAL-004R, the next focused task is the structure-policy enforcement/cleanup task. It must split VAL-004R-authored files that exceed 300 lines, wire the policy into `architecture:check`/CI, and establish the legacy baseline without broad unrelated refactoring.

11. The previously planned Final Phase-2 Security/Integrity Closure and fresh Standard Security Scan are no longer pre-Phase-3 gates by owner instruction. They may be performed later as production/pilot hardening work, but Phase 3 may begin after VAL-004R and the structure-policy enforcement task are merged.

## Consequences

- Agents receive a clear structural contract before coding.
- New god files are blocked before merge.
- Existing oversized debt does not trigger a repository-wide refactor loop.
- Phase 3 starts from enforced modularity rather than an advisory size warning.
- Skipping the former security-closure/scan sequence does not mean those checks were run or passed; no such claim may be made without actual execution.

---

## DEC-031 — Phase 3 Key & Parking Persistence Foundation

Status: Accepted
Date: 2026-08-11

Context:
Phase 3 needs first-class Parking Zones, exact Zone/Spot integrity, concurrency-safe current KeySlot/ParkingSpot assignment and append-only key custody history before any parking or Dispatch command is implemented. DEC-030 structure limits remain binding.

Decision:
VAL-005A is persistence/integrity only and adds exactly migration 19,
`20260811001900_phase3_key_parking_persistence`. Migrations 1–18 remain
unchanged. It adds `ParkingZoneStatus` with exactly `ACTIVE` and `INACTIVE`, and
tenant/location-safe `ParkingZone` rows with Location-scoped code uniqueness
and composite `(organization_id, location_id, id)` identity. Zone, Spot and
KeySlot codes are resource identifiers only; they never authenticate or
authorize an actor.

`ParkingSpot.parking_zone_id` is nullable for compatibility. A non-null Zone
must match the Spot's exact Organization and Location, and Spot exposes the
composite identity needed for exact Zone/Spot references.

`ValetSession.parking_zone_id` is nullable and Zone-only assignment is valid.
Spot without Zone is rejected by CHECK. A non-null Spot must match the exact
Organization, Location and assigned Zone through a composite foreign key.
Current non-null `key_slot_id` and `parking_spot_id` are unique across all
ValetSessions, replacing active-state occupancy. Later commands must clear
current IDs when resources become reusable; this task does not add cleanup
commands. Migration must fail compatibly rather than invent Zone assignments,
deduplicate occupancy or rewrite custody history.

`KeyCustodyEventType` contains exactly `SLOT_ASSIGNED`, `CHECKED_OUT`,
`RETURNED_TO_SLOT`, `SLOT_CLEARED` and `RELEASED`. Append-only
`KeyCustodyEvent` records Organization, Location, ValetSession, optional
KeySlot, actor membership, event type and server-authoritative occurrence and
creation times. Composite foreign keys enforce exact session and slot scope and
same-Organization actor scope. All event types except `RELEASED` require a
KeySlot. Deterministic session history is indexed by
`(valet_session_id, occurred_at, id)`.

The ordinary runtime role receives only SELECT/INSERT on KeyCustodyEvent;
UPDATE/DELETE/TRUNCATE are revoked and PUBLIC has no mutation privilege.
Existing runtime restrictions remain intact.

No Shift command, Task/Dispatch model, assignment algorithm, parking command,
ValetSession transition, GPS/maps, HTTP route, retrieval or handoff behavior is
part of VAL-005A. The full accepted implementation detail is mirrored in
`docs/decisions/DEC-031_PHASE3_KEY_PARKING_PERSISTENCE.md`.

Consequences:

- Phase 3 commands receive a database-enforced parking/key custody foundation.
- Existing Spot configuration remains Zone-null unless explicitly configured.
- Current resource occupancy cannot be inferred from completed history rows.
- Hybrid Dispatch remains a separate later persistence and command slice.

---

## DEC-032 — Shift Operational Eligibility

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-005B makes Shift the reusable, transaction-aware operational-eligibility boundary for field work. One active Shift is allowed per OrganizationMembership. Only persisted `VALET_EMPLOYEE` and `VALET_SUPERVISOR` memberships with current tenant/Location access and an active Shift are eligible for protected field operations; `ORG_ADMIN` and `LOCATION_MANAGER` do not inherit valet field authority.

The slice owns staff self-start/self-end and own-active-Shift lookup only. Task assignment, Retrieval, GPS, payroll and supervisor force-end behavior remain outside DEC-032.

Full binding contract:
`docs/decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md`

---

## DEC-033 — Key Assignment & Custody Commands

Status: Accepted  
Date: 2026-08-12

Decision:
`ValetSession.key_slot_id` is the current mutable KeySlot assignment while `KeyCustodyEvent` is append-only custody history. VAL-005C implements initial assignment, reassignment and clear during `AWAITING_PARKING`, using DEC-032 operational eligibility, optimistic session versioning, tenant/Location-safe KeySlot-code resolution, and atomic Audit/KeyCustody history.

KeySlot codes are operational resource identifiers only and never authenticate or authorize an actor. The accepted staff routes are the session-scoped key-slot assign and clear commands; later parking/retrieval commands reuse the custody primitives for `CHECKED_OUT` / `RETURNED_TO_SLOT` rather than inventing mutable custody status.

Full binding contract:
`docs/decisions/DEC-033_KEY_ASSIGNMENT_CUSTODY_COMMANDS.md`

---

## DEC-034 — Task / Dispatch Persistence Foundation

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-005D adds exactly migration 20 and establishes the authoritative `Task` current projection plus append-only `DispatchEvent` history. Task lifecycle remains separate from ValetSession physical state. Task types are exactly `PARKING` and `RETRIEVAL`; statuses are exactly `QUEUED`, `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

The database enforces the accepted tenant/Location/session/membership relationships, optimistic `Task.version`, and one active intended Task per `(valet_session_id, task_type)`. `RETRIEVAL` persistence is compatibility for Phase 4; DEC-034 itself exposes no dispatch command/API.

Full binding contract:
`docs/decisions/DEC-034_TASK_DISPATCH_PERSISTENCE_FOUNDATION.md`

---

## DEC-035 — Hybrid Dispatch Assignment / Acceptance / Reassignment

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-005E implements the Phase-3 `PARKING` Task queue/read surface, safe creation/queueing, deterministic basic assignment/suggestion, self-accept, self-decline and supervisor reassignment, with `Task.version`, append-only Dispatch history and required Audit history. `Task.current_assignee_membership_id` is the only canonical current Dispatch owner; ValetSession assignee data is not assignment authority.

Assignment uses current persisted Location scope, DEC-032 operational eligibility, open Task load and deterministic tie-breaking. GPS/proximity, AI signals and Phase-4 Retrieval workflow are not introduced. Normal Shift end is blocked while the membership still owns accepted nonterminal work as defined by the full contract.

Full binding contract:
`docs/decisions/DEC-035_HYBRID_DISPATCH_ASSIGNMENT_ACCEPTANCE_REASSIGNMENT.md`

---

## DEC-036 — Start Parking

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-005F makes Start Parking one protected atomic operation: the accepted `PARKING` Task moves `ACCEPTED -> IN_PROGRESS`, the ValetSession moves `AWAITING_PARKING -> PARKING`, `parking_started_at` is server/database-authored, both optimistic versions advance exactly once, the assigned key is checked out through one append-only `KeyCustodyEvent(CHECKED_OUT)`, and matching Dispatch/Audit history is appended.

The canonical route is `POST /v1/staff/valet-sessions/:sessionId/start-parking`. The active Parking Task is derived from persisted session/task state; no standalone key-checkout route or migration 21 is introduced.

Full binding contract:
`docs/decisions/DEC-036_START_PARKING.md`

---

## DEC-037 — Confirm Parked

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-005G makes Confirm Parked one protected atomic operation: exact ParkingSpot resolution by operator-visible code and derived Zone validation, occupancy protection, Parking Task `IN_PROGRESS -> COMPLETED`, ValetSession `PARKING -> PARKED`, current Zone/Spot assignment, server-authored `parked_at`, exactly one version increment per current projection, one `KeyCustodyEvent(RETURNED_TO_SLOT)`, one `DispatchEvent(COMPLETED)` and required Audit history.

The canonical route is `POST /v1/staff/valet-sessions/:sessionId/confirm-parked`. Retrieval, maps, notification delivery, handoff, payment and UI remain outside this decision, and the database remains at 20 migrations.

Full binding contract:
`docs/decisions/DEC-037_CONFIRM_PARKED.md`

---

## DEC-038 — Phase 3 API / Integration / Employee Operations Gate

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-005H is the Phase-3 integration gate rather than a new product workflow. It proves the production employee API composition from `AWAITING_PARKING` through key assignment, Parking Task queue/assignment/acceptance, Start Parking and Confirm Parked to `PARKED` with the Parking Task `COMPLETED`.

The gate preserves the existing public route surface while proving version propagation, tenant/Location/Shift isolation, canonical Task ownership, KeySlot/ParkingSpot occupancy, append-only KeyCustody/Dispatch/Audit chronology, decline/reassignment/open-work behavior, guest privacy and full architecture/schema/CI regression. Prisma and migrations 1–20 remain unchanged.

Full binding contract:
`docs/decisions/DEC-038_PHASE3_API_INTEGRATION_EMPLOYEE_OPERATIONS_GATE.md`

---

## DEC-039 — Phase 4 Retrieval & Handoff Persistence Hardening

Status: Accepted  
Date: 2026-08-12

Decision:
VAL-006A hardens and reuses the existing Phase-4 persistence rather than rebuilding it. The database remains at exactly 20 migrations: no migration 21, Prisma shape change, direct RetrievalRequest-to-Task foreign key or speculative active HandoffVerification index is authorized.

RetrievalRequest stays `OPEN` through Retrieval Task queue/assignment/acceptance and becomes `ACCEPTED` only when physical Retrieval starts. The existing one-active-request boundary remains `status IN (OPEN, ACCEPTED)`, and the active Request/Task composition remains through ValetSession plus `Task.type = RETRIEVAL`.

`HandoffVerification` is retained stateful security persistence: `verified_at` means proof accepted, while `consumed_at` means terminalized/non-reusable; successful verification alone does not release the vehicle. The ordinary runtime role must receive only `SELECT`, `INSERT` and `UPDATE` on existing `retrieval_requests` and `handoff_verifications`, with `DELETE`, `TRUNCATE`, DDL and ownership still denied. VAL-006A exposes no Retrieval/handoff feature API.

Full binding contract:
`docs/decisions/DEC-039_PHASE4_RETRIEVAL_HANDOFF_PERSISTENCE_HARDENING.md`

---

## DEC-040 — Guest Retrieval Request + Duplicate Protection

Status: Accepted
Date: 2026-08-13

Decision:
VAL-006B implements exactly one guest-originated `request-retrieval` command. A winning first request atomically moves the authoritative ValetSession `PARKED -> REQUESTED`, sets server-authored `retrieval_requested_at`, creates one `RetrievalRequest(status = OPEN)`, one unassigned `Task(task_type = RETRIEVAL, status = QUEUED)`, one `DispatchEvent(QUEUED)` and one `AuditEvent(RETRIEVAL_REQUESTED)`. Coherent repeated/stale guest presses are non-mutating HTTP 200 current-progression reads; inconsistent partial lifecycle fails closed.

The canonical route is `POST /v1/guest/session/request-retrieval` with a strict empty JSON body. Session/tenant/location/customer/task/version authority is never accepted from guest input. Under the DEC-064 T1 amendment the route accepts exactly one authorized Guest Access source: an unconsumed staged-rollout legacy bearer or the current active-scope Guest Browser Session; mixed authority and post-`COMPLETED` scope fail closed. Existing DEC-024 Guest anti-abuse budgets remain unchanged. Customer persistence remains optional: migration 21 changes only `retrieval_requests_requester_consistency_check` so a `CUSTOMER`-originated request may have nullable `requested_by_customer_id` while STAFF requester semantics and existing tenant-safe foreign keys remain unchanged. No synthetic Customer is created.

Retrieval business ownership lives in `apps/api/src/modules/retrieval/`. Guest Access retains credential/authentication ownership; Retrieval may depend one-way on a narrow Guest Access resolution boundary. The Phase-3 PARKING-specific queue command must not be reused, wrapped, spoofed or weakened for Retrieval. Shared Task/Dispatch schema and invariants remain authoritative; implementation may reuse a genuinely generic narrow Dispatch persistence primitive or add focused Retrieval queue persistence without creating a second dispatch system.

VAL-006B does not implement Retrieval assignment/acceptance/reassignment, key checkout, `REQUESTED -> RETRIEVING`, READY progression, notifications delivery, secure handoff, release/completion, Maps/GPS, payments, UI or offline replay. DEC-030 code-structure limits remain binding.

Full binding contract:
`docs/decisions/DEC-040_GUEST_RETRIEVAL_REQUEST.md`

---

## DEC-042 — Secure Handoff Verification

Status: Accepted
Date: 2026-08-13

Decision:
VAL-006F implements explicit staff-owned `READY -> HANDOFF_PENDING`, Guest
Access-authorized Standard proof issuance/rotation, separate staff pickup-code and Dynamic-QR
verification commands, actively shifted same-Location `VALET_SUPERVISOR`-only
override while already `HANDOFF_PENDING`, and reasoned owner/supervisor abort
back to `READY`. Verification does not release the vehicle; Task remains
`IN_PROGRESS` and RetrievalRequest remains `ACCEPTED`.

The DEC-064 T1 amendment changes only Guest credential transport: staged
unconsumed bearer or current active-scope Browser Session, exactly one source.
Post-`COMPLETED` Browser Session scope cannot issue or rotate handoff proof.

Typed handoff policy is Company default -> nullable Location override with
`PICKUP_CODE | DYNAMIC_QR | EITHER` and Company default `EITHER`. Pickup code
expires after 10 minutes, Dynamic QR after 2 minutes, both permit five attempts,
and durable session limits span rotations. Raw material is one-time response
only; persistence uses a separate domain-separated HMAC verifier. Migration 22
adds only typed policy columns/enum and durable handoff anti-abuse scopes;
migrations 1–21 and the HandoffVerification table remain immutable.

Supervisor override never performs initiation. VAL-006G must re-evaluate the
effective method policy at release and accept only a still-valid, unconsumed,
unexpired, currently allowed Standard proof or valid unconsumed override.

Full binding contract:
`docs/decisions/DEC-042_SECURE_HANDOFF_VERIFICATION.md`

---

## DEC-043 — Vehicle Release & Session Completion

Status: Accepted
Date: 2026-08-14

Decision:
VAL-006G adds the explicit staff `complete-handoff` command for the atomic
`HANDOFF_PENDING -> COMPLETED` physical release. The current eligible
`VALET_EMPLOYEE` or `VALET_SUPERVISOR` Retrieval Task owner is the only ordinary
release authority; a supervisor override replaces Standard guest proof but
does not replace canonical Task ownership.

Release reuses the DEC-042 transaction-aware guard to require a still-valid,
unconsumed, unexpired, currently allowed Standard proof or valid unconsumed
supervisor override. One transaction consumes that proof, appends the actual
KeySlot `RELEASED` custody fact, clears current KeySlot occupancy, completes the
RetrievalRequest and Retrieval Task, appends Dispatch completion, completes the
ValetSession, and appends distinct vehicle-released/session-completed Audit
history. Migrations 1–22 and Prisma remain unchanged. No speculative payment,
validation, or incident release rule is introduced before an owning typed
policy/guard exists.

Full binding contract:
`docs/decisions/DEC-043_VEHICLE_RELEASE_SESSION_COMPLETION.md`

---

## DEC-044 — Guest Pre-Start Retrieval Cancellation

Status: Accepted
Date: 2026-08-14

Decision:
VAL-006H adds Guest Access-owned pre-start cancellation at
`POST /v1/guest/session/cancel-retrieval` with a strict empty body and the same
Guest Access, shared anti-abuse, request-ID and no-store boundary as guest
Retrieval request. DEC-064 T1 permits exactly one unconsumed legacy bearer or
current active-scope Browser Session and rejects mixed/post-completion authority.
It is valid only for Session `REQUESTED`, one OPEN
RetrievalRequest and one RETRIEVAL Task in `QUEUED`, `ASSIGNED` or `ACCEPTED`.

One session-first locked transaction changes the Request and Task to
`CANCELLED`, sets `cancelled_at`, increments Task and Session versions once,
preserves any current Task assignee and `retrieval_requested_at`, appends one
guest-actor-null CANCELLED DispatchEvent and one safe `RETRIEVAL_CANCELLED`
AuditEvent, and returns the Session to `PARKED` without changing key custody or
later Retrieval/handoff state. Coherent repeated cancellation is a non-mutating
guest-safe retry; a later request creates new active Request/Task rows while
retaining cancelled history. Session locking serializes cancel/cancel and
cancel/start-retrieval so only one coherent physical outcome wins.

No Prisma schema change or migration 23 is authorized; migrations 1–22 remain
immutable. Post-start `RETRIEVING -> PARKING` behavior remains outside this
decision.

Full binding contract:
`docs/decisions/DEC-044_GUEST_PRE_START_RETRIEVAL_CANCELLATION.md`

---

## DEC-046 — Phase 5 Maps & Tracking Persistence

Status: Accepted
Date: 2026-08-14

Decision:
VAL-007A adds exactly migration 23 and a provider-neutral relational
persistence foundation for the DEC-045 policy. Typed policy uses Company
`tracking_enabled = false` and `raw_gps_retention_days = 30`, with nullable
Location overrides and positive-retention database checks.

Operational geometry is normalized as typed Location map points, typed map
areas, and ordered polygon vertices. A map area may reference an exact-scope
ParkingZone for map/geofence context, but existing ParkingZone/ParkingSpot and
ValetSession parking fields remain the sole parking assignment authority.

TaskTrackingSession is anchored by a composite FK to the canonical Task and
has no assignee field. `ended_at IS NULL` is active; partial unique indexes
allow at most one active tracker per Task and per ValetSession. RawGpsSample is
append-oriented, coordinate-constrained, and deduplicated by
`(tracking_session_id, client_sample_id)`. GeofenceEvent records only typed
ENTERED/EXITED/VIOLATION summary history and exact map-area scope; violations
do not mutate operational state.

Ordinary runtime gets SELECT-only geometry, SELECT/INSERT plus only
column-scoped `ended_at` update for TaskTrackingSession, and SELECT/INSERT-only
raw GPS/geofence history. No UPDATE/DELETE/TRUNCATE is granted on append-only
tracking history, no cleanup primitive is added before VAL-007F, and no
provider/API/UI/Guest behavior is implemented.

Full binding contract:
`docs/decisions/DEC-046_PHASE5_MAPS_TRACKING_PERSISTENCE.md`

---

## DEC-047 — Phase 5 Map Setup Write Authority

Status: Accepted
Date: 2026-08-14

Decision:
VAL-007B keeps ordinary runtime access to map point, area and vertex tables
SELECT-only. Migration 24 adds only operation-specific `SECURITY DEFINER`
functions for point create/update, area create/update and locked atomic polygon
replacement. Functions use a fixed safe search path, deny PUBLIC execution,
remain owned by the migration owner and receive narrow runtime EXECUTE grants
through existing provisioning. Every function independently verifies an active
Location Manager membership and explicit access to the exact active Location;
linked ParkingZone scope must match exactly.

Production map setup read/write authority is `LOCATION_MANAGER` only until
server-validated MFA exists. `ORG_ADMIN` remains denied under DEC-023, as do
supervisors, employees and Guest. Successful mutations append a same-transaction
AuditEvent containing safe resource/configuration facts but no coordinates or
vertex arrays. No second database credential, generic privileged SQL function,
provider integration, GPS behavior, Guest geometry or parking-assignment
authority is introduced.

Full binding contract:
`docs/decisions/DEC-047_PHASE5_MAP_SETUP_WRITE_AUTHORITY.md`

---

## DEC-050 — Phase 6 Effective Financial Policy & Payment Core

Status: Accepted
Date: 2026-08-15

Decision:
VAL-008A adds typed financial Configuration-First persistence using Company
defaults and nullable Location overrides for valet service fee, service payer,
allowed payment methods, tips, validation and release-payment policy. Safe
Company defaults are zero fee, `CUSTOMER`, `CASH_ONLY`, and false for tips,
validation and release blocking. Location currency remains authoritative and
is not duplicated in policy.

One session-locked provider-neutral internal command creates or reads at most
one canonical Payment. It snapshots effective policy, Location currency,
initial zero tip and server-derived amounts. Zero due is exact
`NONE / NOT_REQUIRED`; positive `CASH_ONLY` and `CASH_OR_DIGITAL` use
`CASH / UNPAID`; positive `DIGITAL_ONLY` fails closed until a real provider is
activated. Payment creation and one `PAYMENT_INITIALIZED` AuditEvent commit
atomically, Organization-scoped creation idempotency cannot be reused for a
different session, and later policy changes never rewrite historical Payment
terms.

Migration 26 adds only the typed policy enum/columns and non-negative fee
checks. VAL-008A adds no HTTP/configuration write surface, provider behavior,
Validation or tip mutation, CashEntry, Refund, release guard, or ValetSession,
Task, Dispatch, handoff, or key-custody mutation.

Full binding contract:
`docs/decisions/DEC-050_PHASE6_FINANCIAL_POLICY_PAYMENT_CORE.md`

---

## DEC-051 — Phase 6 Validation, Tips & Pre-collection Authority

Status: Accepted
Date: 2026-08-15

Decision:
VAL-008B uses the existing Payment, Validation and AuditEvent persistence for
Manager-authorized Validation and guarded pre-collection financial mutations.
An active `LOCATION_MANAGER` with explicit access to the exact active Location
may apply, replace or remove Validation, correct the service payer or base
service amount, and correct tips when effective policy enables tips.
`VALET_EMPLOYEE`, `VALET_SUPERVISOR` and password-only `ORG_ADMIN` receive no
such authority in this slice.

Validation is enabled by effective Company-default/Location-override policy,
belongs only to CUSTOMER responsibility, and preserves immutable superseding
history with at most one current row. Authenticated Guests may update only the
tip on their own canonical Payment when tips are enabled. Guest audit uses a
null staff actor plus safe `actor_class = GUEST` metadata.

Every mutation locks the canonical Payment, rechecks collection evidence and
effective policy, recomputes exact `numeric(14,3)` projections server-side, and
commits the Payment/Validation effect with one focused AuditEvent atomically.
Mutable terms freeze after collection starts. Positive `DIGITAL_ONLY`
recomputation continues to fail closed until a real provider is activated.

VAL-008B adds no migration, provider, CashEntry production write, Refund,
release guard, financial configuration write API, or ValetSession/Task/Dispatch
mutation. Employee cash receipt remains VAL-008C.

Full binding contract:
`docs/decisions/DEC-051_PHASE6_VALIDATION_TIPS_PRECOLLECTION_AUTHORITY.md`

---

# DEC-052 — Phase 6 Cash Collection + Reconciliation Authority

Status: Accepted
Date: 2026-08-16
Task: VAL-008C
Issue: #173

## Context

Phase 6 Batch 1 established canonical Payment creation, Validation, tips and guarded pre-collection corrections. VAL-008C now owns the cash-collection boundary and the smallest Blueprint-required `Cash Expected` versus `Cash Reported` Shift-facing reconciliation behavior.

Existing persistence already provides append-oriented `CashEntry` history with exact types `RECEIPT`, `ADJUSTMENT_INCREASE` and `ADJUSTMENT_DECREASE`, same-tenant actor ownership, `numeric(14,3)` amount, optional reason, server-authoritative occurrence time and organization-scoped submission idempotency.

Existing `Shift` persistence records operational ownership/status/timestamps only. It does not currently persist a durable close-time cash report or reconciliation snapshot.

DEC-021 and DEC-022 prohibit silently rewriting collected financial history, distinguish cash-recording corrections from actual returned customer money, and keep Payment lifecycle separate from ValetSession. DEC-051 already accepts that an ordinary Valet Employee may record cash/payment received through a server-owned action and that a Location Manager has full supported financial authority in an authorized Location subject to normal guards.

VAL-008C must not grow this boundary into drawer accounting, a general ledger, settlement, payroll or split-tender infrastructure.

## Decision

### 1. Cash receipt authority

The first-rollout cash receipt roles are:

- `VALET_EMPLOYEE` — allowed only while the actor owns an `ACTIVE` Shift in the same persisted Location as the canonical Payment;
- `VALET_SUPERVISOR` — allowed under the same active-Shift / same-Location rule;
- `LOCATION_MANAGER` — allowed for an authorized Location without requiring the Manager to own an operational Shift;
- `ORG_ADMIN` — not granted this operational cash mutation authority by VAL-008C.

All authority derives from the authenticated User plus persisted OrganizationMembership, MembershipLocationAccess, Location and, when required, Shift. Caller-supplied Organization, Location, membership, Shift, payer, amount, status or collection-method values are not authorization evidence.

### 2. Receipt command shape

MVP cash receipt is a server-derived **full remaining customer cash amount** command.

The caller supplies no receipt amount. Inside the protected transaction the server locks the canonical Payment and derives the receivable amount from persisted Payment state. A successful receipt records exactly the current positive `amount_due` as one `CashEntry(RECEIPT)` and atomically updates Payment `amount_paid` to the satisfied amount and Payment status to `PAID`.

The command is allowed only when the canonical Payment is cash-collectible under its persisted financial state. It must reject zero/not-required Payment, digital collection, already-collected/settled Payment, invalid collection state and any state that would imply split tender, installment collection, overpayment or a second successful collection.

This action is not a free-form `status = PAID` endpoint.

### 3. Receipt timing

Cash may be received early in the ValetSession or in the normal pre-handoff flow once a canonical Payment exists and the Payment is otherwise cash-collectible. VAL-008C does not add payment states to ValetSession and does not require a particular physical-custody state merely to record valid cash.

Future release enforcement remains owned by VAL-008G.

### 4. Cash receipt idempotency

Every receipt submission requires a caller-generated opaque submission idempotency key accepted only as retry identity, not as financial authority.

`CashEntry` organization-scoped uniqueness is the durable deduplication boundary. Retrying the same logical receipt returns the already-committed financial result without inserting another CashEntry, increasing `amount_paid` again or duplicating AuditEvent effect.

Reusing the same idempotency key for a materially different command is rejected.

### 5. Cash-recording corrections

`ADJUSTMENT_INCREASE` and `ADJUSTMENT_DECREASE` are **Location Manager only** in VAL-008C.

Each adjustment:

- is append-only;
- requires a non-empty bounded reason;
- requires a new submission idempotency key;
- is same-tenant / same-Location scoped;
- is applied transactionally with the resulting Payment cash projection and AuditEvent;
- cannot create negative recorded cash;
- cannot create an amount greater than the Payment customer amount that was legitimately collectible under this one-collection MVP model;
- cannot be used to represent money physically returned to the customer.

Actual customer money return remains Refund and is owned by VAL-008F.

The implementation must preserve the distinction between a correction to what VAYLET recorded and a real refund/outflow.

### 6. Shift `Cash Expected`

For a staff-owned operational Shift, `Cash Expected` is the server-derived net recorded cash attributable to that Shift's membership and Location during the Shift window:

```text
sum(RECEIPT)
+ sum(ADJUSTMENT_INCREASE attributable to that Shift cash)
- sum(ADJUSTMENT_DECREASE attributable to that Shift cash)
```

The implementation must use persisted financial facts and persisted Shift ownership/time boundaries. It must not accept caller-supplied expected cash.

Manager corrections after a Shift has ended do not rewrite the historical close snapshot defined below.

### 7. Shift close cash report

An operational employee/supervisor ending their own Shift supplies exactly one `cashReported` amount for that Shift.

`cashReported`:

- uses exact `numeric(14,3)`-compatible money input;
- is non-negative;
- is interpreted in the Shift Location's authoritative currency;
- is not a Payment amount and cannot mutate any Payment or CashEntry by itself.

At successful Shift close, the server atomically persists an immutable close-time reconciliation snapshot containing at minimum:

- `cash_expected`;
- `cash_reported`;
- `cash_variance = cash_reported - cash_expected`;
- close/report timestamp;
- reporting/closing membership identity.

The snapshot is calculated and written in the same protected Shift-end transaction that changes the Shift to `ENDED`, after existing open-task guards pass and before commit.

Shift close retry is idempotent and returns the already-persisted close result; it does not replace the original report.

### 8. Post-close behavior

The Shift close reconciliation snapshot is immutable historical evidence.

A later authorized Manager cash-recording correction remains a new CashEntry plus AuditEvent and does not rewrite the Shift's `cash_expected`, `cash_reported` or `cash_variance` snapshot.

Read/reporting logic may later show post-close adjustments separately from the original close variance. VAL-008C does not create a generic reconciliation-adjustment ledger.

There is no post-close employee/supervisor edit of `cashReported` in this slice. A future requirement to amend a mistaken close declaration needs a focused decision and append-oriented history rather than silent update.

### 9. Persistence decision

A new forward-only **migration 27 is approved** because the current Shift model has no durable representation for the accepted immutable close-time cash report/reconciliation snapshot.

The implementation must choose the narrowest typed persistence needed for this snapshot. It may either add typed nullable reconciliation columns to `Shift` or add a one-to-one typed Shift cash-reconciliation row, whichever better preserves repository conventions and invariants. It must not introduce drawer, ledger, settlement, tender-batch or generalized accounting entities.

Migrations 1–26 are immutable.

### 10. Audit, concurrency and failure semantics

Receipt, cash adjustment and Shift cash close are sensitive financial actions and require safe AuditEvents.

Commands must lock/re-check authoritative rows in the same transaction so concurrent receipt/retry/correction/Shift-close activity cannot:

- produce duplicate CashEntry financial effect;
- over-collect;
- make recorded cash negative;
- rewrite an immutable close snapshot;
- bypass active-Shift requirements;
- cross tenant or Location boundaries.

Failures roll back CashEntry/Payment/Shift-reconciliation/AuditEvent effects atomically.

### 11. Explicit non-goals

VAL-008C does not implement:

- digital payment provider behavior;
- Refund execution;
- payment release/handoff guard;
- split tender or partial installment collection;
- cash drawer opening/closing balances;
- float/petty cash;
- bank deposit/settlement;
- double-entry/general-ledger accounting;
- employee tip allocation/payroll;
- POS/PMS integration;
- Dashboard/UI.

## Consequences

- Employee and Supervisor cash receipt becomes operationally usable under an active same-Location Shift.
- Manager has controlled receipt/correction authority within authorized Location scope.
- Cash collection derives `PAID` from a validated financial fact rather than exposing manual Payment status mutation.
- One immutable close-time `Cash Expected` / `Cash Reported` / variance snapshot satisfies the MVP reconciliation boundary without creating an accounting platform.
- Post-close corrections preserve both the original close evidence and later append-only financial history.
- Migration 27 may be implemented by VAL-008C and must be the only new migration for this decision unless implementation proves a separate invariant cannot be represented safely and stops for another focused decision.

## Affected docs/code

- `docs/08_DECISIONS_LOG.md`
- `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`
- `docs/03_DATABASE_SCHEMA.md`
- `packages/database/prisma/schema.prisma`
- new migration 27
- `apps/api/src/modules/payments/**`
- `apps/api/src/modules/shifts/**`
- `packages/contracts/**`
- runtime privilege scripts/tests
- VAL-008C integration/concurrency/API/security tests

---

# DEC-053 — Phase 6 Currency Minor-Unit Authority

Status: Accepted
Date: 2026-08-16
Task: VAL-008C-FIX / Phase 6 financial money-boundary remediation
Issue: #174

## Context

DEC-022 already separates PostgreSQL storage precision from currency validity: financial persistence remains `numeric(14,3)`, while domain/provider commands must validate or deterministically quantize monetary inputs to the Payment currency's supported minor-unit exponent without silent material rounding.

Independent review of VAL-008C found that the repository currently enforces only the generic `numeric(14,3)` input/storage shape at new cash monetary boundaries. The repository contains no accepted supported-currency allowlist, ISO-4217 minor-unit table, or accepted `Intl`/CLDR/ICU authority. Inventing a hand-written mapping or allowing runtime locale/library behavior to decide financial validity would make the result non-authoritative or non-deterministic.

The same accepted DEC-022 invariant applies beyond VAL-008C to the existing Phase 6 monetary boundaries that can introduce or correct Payment terms, Validation amounts or tips.

## Decision

### 1. External standards authority

ISO 4217 minor-unit data, as maintained by SIX Financial Information in its role as the ISO 4217 Maintenance Agency, is the external authority for currency minor-unit exponents.

Canonical external references are:

- ISO 4217 currency-code standard information: `https://www.iso.org/iso-4217-currency-codes.html`
- SIX Financial Data Standards / ISO 4217 lists: `https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html`

The implementation must record the source/snapshot date used to build the checked-in VAYLET registry.

### 2. Deterministic runtime authority

Production financial validity must not depend on a runtime network lookup, `Intl.NumberFormat`, CLDR/ICU behavior, operating-system locale data, browser locale data or provider SDK defaults.

A released VAYLET build uses a reviewed, checked-in repository registry/snapshot derived from the authoritative ISO 4217/SIX current-currency list. Updating that registry is an explicit reviewed source change. A Node, browser, operating-system or locale-data upgrade therefore cannot silently change accepted financial precision.

The checked-in registry is financial reference data, not mutable tenant configuration.

### 3. Exact representability rule

The resolver maps an uppercase ISO alpha-3 currency code to one exact minor-unit exponent.

VAYLET storage remains `numeric(14,3)`. For an authoritative numeric exponent from `0` through `3`, an input is accepted only when its value is exactly representable at that currency exponent.

Fractional digits beyond the authoritative exponent are allowed only when they are all zero and therefore do not change the value.

Examples for exponent `2`:

- `1`, `1.2`, `1.20` and `1.200` are representable;
- `1.001`, `1.201` and `0.009` are not representable and must be rejected.

Exponent `3` permits every otherwise-valid `numeric(14,3)` amount.

There is no silent rounding or truncation. A non-representable caller/configured amount is rejected rather than changed.

### 4. Unsupported currency behavior

If the checked-in registry has no usable numeric minor-unit exponent for a currency, the financial command fails closed before mutation.

If the authoritative exponent exceeds VAYLET's current `numeric(14,3)` storage capability, the financial command also fails closed before mutation.

No default exponent is guessed.

This precision authority does not assert that a currency is supported by a future payment gateway. Provider/acquirer currency support remains a separate selected-provider concern owned by later Phase 6 provider activation.

### 5. Current Phase 6 remediation scope

After this decision is accepted, one shared deterministic minor-unit resolver must be applied to every current Phase 6 monetary boundary that can introduce or correct an amount, including at minimum:

- canonical Payment initialization/effective service amount before persistence, using authoritative Location/Payment currency;
- `PARTIAL` Validation input, using canonical Payment currency;
- Manager tip input, using canonical Payment currency;
- authenticated Guest tip input, using the Guest's canonical Payment currency;
- Manager service-amount correction input, using canonical Payment currency;
- VAL-008C cash-adjustment input, using canonical Payment currency;
- Shift-end `cashReported`, using the authoritative Shift Location currency.

Server-derived arithmetic such as full cash receipt, Validation recomputation, amount due, cash expected and variance remains exact arithmetic after valid monetary inputs have crossed the currency boundary. No second rounding step is introduced.

### 6. Error and mutation semantics

Currency precision validation occurs before the protected command commits any financial mutation.

A rejected non-representable or unsupported-currency amount must not partially write Payment, Validation, CashEntry, Shift reconciliation or AuditEvent state.

Existing non-disclosing tenant/Location/authentication behavior remains unchanged. The public error contract must remain bounded and must not expose internal registry structure, SQL or provider details.

### 7. Persistence and dependencies

No migration is approved by DEC-053.

Migration count remains exactly 27 for the VAL-008C branch. Existing `numeric(14,3)` schema columns and migrations 1–27 remain unchanged.

No new external runtime dependency is approved merely to obtain ISO/CLDR currency data. The registry and resolver should use repository-owned deterministic code/data and existing toolchain capabilities.

### 8. Required proof

Tests must prove at minimum:

- one authoritative 3-decimal currency path accepts a non-zero third decimal;
- one authoritative 2-decimal currency path accepts valid 2-decimal input;
- a 2-decimal currency rejects a non-zero third decimal;
- a mathematically equivalent trailing-zero third decimal remains accepted for a 2-decimal currency;
- no silent rounding occurs;
- unsupported or unrepresentable currency precision fails closed without writes;
- canonical Payment initialization rejects an effective service amount that is not representable in the Location currency;
- existing Validation, Manager/Guest tip, service-amount correction, cash-adjustment and Shift-reconciliation paths enforce the same shared rule;
- JOD 3-decimal behavior remains valid;
- all affected Phase 6 Payment/Validation/tip/cash/Shift regressions remain green.

### 9. Explicit non-goals

DEC-053 does not introduce:

- payment-provider selection or a provider currency matrix;
- FX or currency conversion;
- tax behavior;
- pricing UI;
- a Location financial-settings API;
- migration 28;
- a new accounting/ledger abstraction;
- runtime CLDR/locale authority;
- silent financial rounding.

## Reason

VAYLET is designed for Location-owned currency and multi-country operation, so accepting an amount merely because it fits `numeric(14,3)` is insufficient. ISO 4217/SIX provides the external standards authority, while a reviewed checked-in snapshot makes runtime behavior deterministic and reviewable. Exact representability preserves user/provider monetary intent and avoids hidden rounding.

## Consequences

- Phase 6 gains one shared currency-precision authority instead of separate ad hoc validators.
- Existing `numeric(14,3)` persistence remains stable and forward migrations are not required.
- JOD continues to support three decimal places while currencies with lower minor-unit exponents reject materially over-precise amounts.
- Unsupported/unknown precision fails closed rather than guessing.
- VAL-008C remains blocked from approval until this accepted decision is implemented and the affected current Phase 6 money boundaries are remediated and re-reviewed.

## Affected docs/code

- `docs/08_DECISIONS_LOG.md`
- `docs/03_DATABASE_SCHEMA.md`
- `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`
- `apps/api/src/modules/payments/**`
- `apps/api/src/modules/shifts/**`
- `packages/contracts/**` as needed for shared contracts/tests
- focused Phase 6 Payment/Validation/tip/cash/Shift tests

---

## DEC-054 — Phase 6 Outbound Collection Operation Identity

Status: Accepted
Date: 2026-08-20

Decision:
VAL-008D adds the focused `PaymentCollectionOperation` child of canonical
Payment because Payment creation identity and committed inbound provider-event
deduplication cannot represent durable pre-dispatch intent, dispatch ownership,
timeout/crash ambiguity, historical provider binding, or multiple terminal
operation histories.

The model separates Organization-scoped caller `submissionIdempotencyKey` from
server-generated durable `operationId`. Its exact lifecycle is `PREPARED`,
`OUTCOME_UNKNOWN`, `REFERENCE_ATTACHED`, `REJECTED`, and `RESOLVED`. A committed
Organization-scoped PREPARED-to-OUTCOME_UNKNOWN compare-and-set plus atomic
AuditEvent grants exactly one dispatch owner; provider I/O occurs only after
commit and no ambiguous outcome is blindly retried.

Migration 28 adds same-Organization Payment ownership, scoped submission and
provider-reference uniqueness, one-unresolved-operation-per-Payment protection,
exact state/data checks, and column-scoped runtime update authority. PREPARED
starts permanent financial freeze evidence, initiation never marks Payment
PAID, persisted provider identity is historical authority, and no real provider,
checkout route, callback/reconciliation, refund, or release behavior is added.

Full binding contract:
`docs/decisions/DEC-054_PHASE6_OUTBOUND_COLLECTION_OPERATION_IDENTITY.md`

---

## DEC-055 — Phase 6 Provider Event Authority & Reconciliation

Status: Accepted
Date: 2026-08-20

Decision:
VAL-008E authenticates and normalizes provider transport before finance core,
using a server-derived Organization/provider binding and no caller-controlled
verification boolean. The normalized contract excludes callback money and raw
provider material. Existing PaymentProviderEvent uniqueness remains the sole
committed inbound deduplication boundary.

Collection reconciliation is authoritative only for matching historical
provider/correlation/reference and unresolved `OUTCOME_UNKNOWN` or
`REFERENCE_ATTACHED` operations. PREPARED, REJECTED, RESOLVED, mismatched,
superseded and PAID-downgrade events are ignored. Success resolves the operation
and pays canonical persisted money; definitive failure resolves it to the
FAILED unpaid projection and permits a later fresh guarded attempt.

Existing PENDING digital Refund rows may be reconciled through trusted Refund
ID/provider/reference correlation without rewriting Payment history. Runtime
authority is limited to provider-event SELECT/INSERT and Refund SELECT plus
column updates for status, provider reference and completion time. No schema,
migration, public callback route, provider SDK or real/fake production provider
is added.

Full binding contract:
`docs/decisions/DEC-055_PHASE6_PROVIDER_EVENT_AUTHORITY_AND_RECONCILIATION.md`

---

## DEC-056 — Phase 6 Refund Authority & Core

Status: Accepted
Date: 2026-08-20

Decision:
VAL-008F authorizes only an active, explicitly Location-scoped
`LOCATION_MANAGER` to create Refund history. Employee, Supervisor and ORG_ADMIN
authority are denied; ORG_ADMIN remains deferred until an Accepted MFA-aware
production boundary exists. Creation locks canonical Payment and reserves from
`amount_paid - SUM(PENDING, SUCCEEDED)` using exact DEC-053 currency precision.
Failed Refunds free exposure. Exact same-key retries return the immutable row
without another audit; material reuse conflicts.

Cash creates immediate `SUCCEEDED` history with no provider fields. Digital
creates only `PENDING` history using the canonical historical provider and no
provider call. Refund never rewrites Payment or CashEntry history. First
creation and one safe `PAYMENT_REFUND_CREATED` AuditEvent commit atomically.
Runtime authority adds only column-scoped Refund INSERT, retaining DEC-055's
three lifecycle UPDATE columns and denying broad mutation/deletion. No schema or
migration change is required; migration count remains 28.

Full binding contract:
`docs/decisions/DEC-056_PHASE6_REFUND_AUTHORITY_AND_CORE.md`

---

## DEC-057 — Phase 6 Financial Release Guard & Safe Projections

Status: Accepted
Date: 2026-08-20

Decision:
VAL-008G evaluates the current Company-default/Location-override
`release_requires_payment` policy inside the existing complete-handoff
transaction before any terminal write. When required, release is satisfied only
by the exact canonical Payment `NOT_REQUIRED` zero-due projection or a coherent,
fully collected `PAID` CASH/DIGITAL projection. Missing or incoherent Payment
state fails closed with `FINANCIAL_RELEASE_NOT_SATISFIED`; Refund state never
changes the predicate.

Read-only Guest and staff session-Payment routes expose narrow purpose-specific
projections. Guest access remains exact-session, anti-abuse, and no-store. Under
DEC-064 T1 it accepts exactly one staged unconsumed bearer or current Browser
Session, and the 24-hour post-`COMPLETED` Browser Session scope may use only this
approved read-only receipt projection. Staff access permits Location Manager without a Shift and Employee or
Supervisor only with their own active exact-Location Shift; ORG_ADMIN is denied.
Provider, correlation, reason, authorizer, idempotency, operation/event, tenant,
and audit internals remain private. No schema, migration, privilege, dependency,
or lockfile change is required; migration count remains 28.

Full binding contract:
`docs/decisions/DEC-057_PHASE6_FINANCIAL_RELEASE_AND_PROJECTIONS.md`

## DEC-058 — Phase 7 Typed Location Configuration Authority

Status: Accepted
Date: 2026-08-22

Decision:
VAL-009B exposes the ten already-typed Company-default / nullable
Location-override pairs (`checkInPhotosRequired`, `handoffStandardMethodPolicy`,
`trackingEnabled`, `rawGpsRetentionDays`, `valetServiceFee`,
`paymentServicePayer`, `paymentMethodsPolicy`, `tipsEnabled`, `validationEnabled`,
`releaseRequiresPayment`) plus read-only Location timezone/currency. An ACTIVE
`LOCATION_MANAGER` with explicit persisted access to the exact ACTIVE Location may
read effective configuration and SET/CLEAR one Location override without a Shift;
resolution stays `Company default -> optional Location override -> effective`
with `default/overridePresent/override/effective` distinguished. ORG_ADMIN,
supervisors, employees and Guests are denied; password-only ORG_ADMIN remains
denied pre-MFA under DEC-023, and no principal mutates Company defaults.

Mutations go through narrow DEC-047-style SECURITY DEFINER functions (migration
29 only) that revalidate persisted authority in-database, enforce optimistic
concurrency on `locations.updated_at` via `expectedUpdatedAt`, independently
enforce DEC-053 fee representability against the persisted Location currency
through a deterministic checked-in minor-unit exponent mapping, and commit
exactly one same-transaction AuditEvent per success; stale-token,
authorization and validation failures mutate nothing and audit nothing. Runtime
privileges keep no generic UPDATE on `organizations`/`locations`; EXECUTE is
granted explicitly on the two functions only with PUBLIC denied.

Full binding contract:
`docs/decisions/DEC-058_PHASE7_TYPED_LOCATION_CONFIGURATION_AUTHORITY.md`

## DEC-059 — Phase 7 Incident Runtime Read Authority

Status: Accepted
Date: 2026-08-22

Accepted amendment (Owner, 2026-10-25, #337): the focused DEC now permits only
the explicit exact-Location administrative Resolve command, monotonic status
CAS and operation-bound retries, atomic INCIDENT_RESOLVED audit and UPDATE on
the four existing resolution columns. Dashboard defaults to All with Active /
Resolved filters. This narrowly supersedes the read-only/no-UPDATE statements
below; CLOSED, other editing, deletion and field-operation authority stay out
of scope. See the focused DEC for the full amended contract.

Decision:
VAL-009C keeps the incidents overview in scope. The API runtime role retains
`SELECT` on `public.incidents` for server-authorized exact-Location Dashboard
reads and independently retains `INSERT` for accepted Employee Incident
Reporting. That existing INSERT privilege is not Dashboard mutation authority
and creates no Dashboard mutation route. Runtime UPDATE/DELETE/TRUNCATE/
REFERENCES/TRIGGER remain denied, and PUBLIC receives no incident privilege.
The Dashboard route still requires the VAL-009A `LOCATION_MANAGER` scope and
stays non-disclosing and read-only. Employee incident authorization, Shift,
Location, idempotency, and audit rules remain unchanged. This reconciliation
adds no incident schema, persistence object, or migration.

Full binding contract:
`docs/decisions/DEC-059_PHASE7_INCIDENT_RUNTIME_READ_AUTHORITY.md`

## DEC-060 — Phase 7 Operational KPI Formula Catalog

Status: Accepted
Date: 2026-08-22

Decision:
Closes Phase 7 gate G5. VAL-009D analytics compute from committed authoritative
rows only, read-only, no audit on read, one exact Location under the VAL-009A
manager scope. Period contract: `from`/`to` inclusive local dates in the
persisted Location IANA timezone (no caller timezone), UTC interval
`[from-midnight, day-after-to-midnight)` via `AT TIME ZONE`, max 31 inclusive
local days, DST-correct, invalid input `REQUEST_INVALID`. Durations count only
valid non-negative complete intervals with end-timestamp cohorting:
Check-in `checking_in_completed_at-created_at`; Parking
`parked_at-parking_started_at`; Retrieval Wait OFFICIAL
`ready_at-retrieval_requested_at` (the sole metric allowed to carry that name);
Retrieval Start Latency AUXILIARY `retrieval_started_at-retrieval_requested_at`
(never aliased to Retrieval Wait); Handoff `completed_at-ready_at`. Output =
`sampleCount` + nullable `averageSeconds` decimal string (3 fractional digits,
half-away-from-zero; null when zero samples). Cars handled per local day counts
`completed_at` local-day buckets including zero days. Queue snapshot: depth +
server-clock `oldestAgeSeconds`, null when empty. Financial: PAID-by-`paid_at`
cohort per immutable Payment currency (count/collected/tips); Digital Payment
Rate DIGITAL/(CASH+DIGITAL), NONE excluded, nullable/"0.00" rules; SUCCEEDED
refunds by `completed_at` joined for location+currency; Validation Rate over
completed-session canonical Payments with current FULL/PARTIAL validation
(amount irrelevant, superseded excluded) plus per-currency current validation
totals; cash reconciliation from ENDED Shift close snapshots grouped by
`cash_currency` with signed variance. Incidents: period count, persisted
severity and raw type counts, `incidentsPer1000` over completed sessions with
echoed numerator/denominator. Explicitly absent: SLA compliance (G4),
Cars per Employee, Key Exceptions, Guest Rating/Repeat Guest,
adoption/friction, manager reliance, predictive analytics, pre-MFA rollups —
structurally absent, never zero-filled.

Full binding contract:
`docs/decisions/DEC-060_PHASE7_OPERATIONAL_KPI_FORMULA_CATALOG.md`

## DEC-061 — Phase 7 Report Export and Delivery Composition

Status: Accepted
Date: 2026-08-22

Decision:
VAL-009E ships manual authenticated DAILY/WEEKLY/MONTHLY Location reports and
synchronous CSV/PDF downloads under the VAL-009A exact-Location manager scope.
No scheduler, worker, queue or email/SMS/WhatsApp sending exists in VAL-009E;
Reliability owns future automated delivery and MUST reuse this composer. No
artifacts are persisted — bytes are generated in bounded memory (500 unique
free-text group rows per section family; 5 MiB artifact ceiling, fail-closed
before audit) and discarded. Each successful generation writes exactly one
`DASHBOARD_REPORT_EXPORT_GENERATED` AuditEvent (Location entity, NULL session,
authorized membership actor, safe metadata: reportKind/format/periodFrom/
periodTo/contentLength/optional contentSha256); regeneration creates a new
event; invalid/unauthorized/render/size failures write none. CSV is UTF-8
RFC4180 with header `section,key,subkey,currency,value`, deterministic
ordering, exact decimals, and deterministic formula-injection hardening beyond
quoting; filenames are server-generated ASCII. PDF uses `pdf-lib` as the sole
approved new dependency (no native/headless/browser runtime). Periods use the
persisted Location timezone via `AT TIME ZONE` (DAILY strict date, WEEKLY
strict Monday start ×7 days, MONTHLY calendar month incl. leap years) with no
caller timezone. Reports contain only historically reconstructable facts
(RetrievalRequest counts by requested_at, DispatchEvent grouped counts,
KeyCustodyEvent grouped counts for DAILY) and never reconstruct historical
queue/task/key state; unsupported metrics stay structurally absent; financial
sections keep the DEC-060 currency union behavior. No schema/migration/
runtime-privilege change.

Full binding contract:
`docs/decisions/DEC-061_PHASE7_REPORT_EXPORT_AND_DELIVERY_COMPOSITION.md`

## DEC-062 — Phase 7 Basic Branding and Subscription Entitlements

Status: Accepted
Date: 2026-08-22

Decision:
Closes gate G8. Basic branding = exactly brandDisplayName (Company default is
the existing Organization.name) and brandPrimaryColor (new non-null
organizations.brand_primary_color backfilled to #176BFF), each with optional
locations.brand_*_override columns; effective resolution stays Company
default -> optional Location override. Strict validation: display name
trimmed/1-120 code points/no Cc controls (Arabic preserved); colors canonical
uppercase ^#[0-9A-F]{6}$, database CHECK-enforced. Logo customization is
deferred until a server-controlled verified asset-storage boundary exists;
VehiclePhoto is never reused for logos. Reads/writes use the VAL-009A
exact-Location manager scope (no Shift); ORG_ADMIN pre-MFA and all other
non-manager paths fail closed non-disclosingly; no Company-default branding
mutation endpoint. Overrides mutate only through four narrow SECURITY DEFINER
functions (migration 30 foundation + migration 31 hardening) that revalidate authority in-database, recheck
expectedUpdatedAt on locations.updated_at, advance it monotonically, and write
exactly one DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED AuditEvent per
success; stale/validation/auth failures mutate nothing and audit nothing.

Subscription state is a dedicated one-to-one organization_subscriptions table
(organization_id PK/FK restrictive, opaque uppercase plan_code
^[A-Z0-9][A-Z0-9_-]{0,63}$, status enum TRIAL|ACTIVE|SUSPENDED only, three
typed booleans dashboard_access_enabled/report_exports_enabled/
basic_branding_enabled, timestamps). Zero or one row per Organization; no row
means subscription null; no fabricated defaults; no billing/price/provider/
invoice/renewal fields. Customer surface is read-only:
GET .../dashboard/locations/:id/subscription under the same manager scope.
Entitlement state is typed but does NOT gate VAL-009A-E routes in Phase 7;
composition requires a future focused decision. Runtime role: SELECT only on
organization_subscriptions; EXECUTE only on the four branding functions; no
generic UPDATE on organizations/locations.

Full binding contract:
`docs/decisions/DEC-062_PHASE7_BASIC_BRANDING_AND_SUBSCRIPTION_ENTITLEMENTS.md`

Hardening amendment (Migration 31, forward-only): the primary-color SET
function now rejects an explicit SQL NULL fail-closed with 22023 (NULL-as-clear
is impossible through SET; dedicated CLEAR functions remain the only clear
path), non-null persisted display-name overrides are canonical outer-trimmed
values enforced by a stricter CHECK with in-place migration-time
canonicalization (no business AuditEvents), and a successful SET/CLEAR returns
its projection/token from the same transaction as the mutation. Migration 30
remains immutable; no new decision number; G8 stays closed.

---

## DEC-063 — Employee Offline Operation Policy

Status: Accepted
Date: 2026-08-23

Decision:
The Employee MVP is offline-friendly through truthful connectivity status,
transient in-memory drafts where safe, server-authoritative rehydration, and
manual retries under each command's existing idempotency, version, and recovery
contract. It does not approve a persistent mutation outbox, durable draft
storage, Background Sync, generic automatic replay, or fabricated offline
success.

Protected commands retain their accepted authorization and concurrency rules.
Authentication, pickup-code and Dynamic-QR verification, supervisor override,
and final vehicle release remain online-only. Check-in intake and incident
reporting may be manually retried only with their existing stable logical
operation identities; stale operational commands must rehydrate or fail closed.
Authentication, guest, handoff, payment, and other release proofs must never be
persisted as offline material. Durable offline synchronization remains a later
Reliability decision.

Full binding contract:
`docs/decisions/DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md`

---

## DEC-064 — Guest Browser Entry Transport

Status: Accepted
Date: 2026-08-23

Decision:
The production one-time Guest browser entry transport remains exactly
`#guestToken=<43-character-base64url-token>` appended to the canonical Customer
application origin. The fragment is read browser-only after mount, validated,
immediately scrubbed with `history.replaceState`, and adopted only when safe
scrubbing succeeds. The raw bearer remains transient bootstrap material and is
never persisted/logged. The Owner-approved 2026-10-07 T1 amendment then creates
a server-minted pre-exchange browser enrollment, exchanges the bearer once under
ValetSession/generation serialization, and establishes a distinct high-entropy
hash-only Guest Browser Session carried by a host-only `__Host-`, `Secure`,
`HttpOnly`, `Path=/`, `SameSite=Lax` cookie with no Domain attribute.

The enrollment/pending Browser Session cookie exists before the consuming
exchange, so the same browser can restore/reconcile after a committed exchange
whose HTTP response is lost while a different browser cannot. One primary
Browser Session is allowed per visit generation; same-browser tabs share it.
Staff rotate/reissue/revoke advances or invalidates the credential generation
and old Browser Sessions. Active-visit Browser authority is persisted and has no
fixed 24-hour server expiry/polling dependency. `COMPLETED` retains only a
24-hour safe read/rating/receipt scope; `CANCELLED` has none. During rollout an
unexchanged legacy bearer remains compatible until consumed/expired/revoked,
but a request may present exactly one credential source and never falls back
from failed cookie authority to a bearer. T1 leaves DEC-024 quotas/cadence
unchanged and adds no new quota identity/number: as a pre-rollout storage-safety
floor, each successful anonymous enrollment allocation consumes one existing
durable Guest client-address slot (60/15 minutes) until T3 defines the final
request-class policy. Expired strictly-unexchanged/unbound/unreferenced enrollment
rows are reclaimed in bounded database-time batches, while exchanged recovery
state is retained. Rolling pre-T1 writers are generation-bridged in the database,
and generation changes invalidate stale Browser Sessions transactionally. New
enrollment stays rollout-disabled until T3/T4 production gates. A same-browser
second-link conflict never switches `ACTIVE` or `POST_VISIT` authority silently.
The Owner-approved UI-frozen delta uses only the existing `BottomSheet` and `Btn`
primitives with approved EN/AR copy to choose Continue Current or Open New. Same-
visit entry is a no-op. Different-visit preparation preserves the primary Browser
Session and keeps the raw new bearer memory-only; explicit Open New executes one
source/target database transaction that establishes the target Browser Session,
consumes its bootstrap and revokes the source browser only at the same commit.
Rollback preserves the source, POST_VISIT remains valid until commit, and an
exact committed transition is recoverable after lost response without duplicate
authority. Normal Guest routes remain mixed-source fail-closed; only prepare/
switch may deliberately inspect both current cookie and target bearer. This
explicit context replacement may cross Organizations only because the target
bearer independently proves the exact target visit; source tenant authority is
never inherited, combined or copied into the target context. A random
non-authoritative browser-context marker fences stale Customer responses/tabs
after the shared cookie context changes.

Every Employee shareable surface (QR, copied link, dev/test Open Guest App)
builds from one centrally validated canonical origin,
`NEXT_PUBLIC_CUSTOMER_APP_ORIGIN` (absolute clean origin; production HTTPS;
development localhost HTTP allowed; missing/malformed fails closed). This
transport changes no physical ValetSession/Task, Retrieval, Handoff, Financial
or Custody semantics; mutations remain online-only under DEC-063.

Full binding contract:
`docs/decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md`

## DEC-065 — Verified Key Return During Confirm Parked

Status: Accepted
Date: 2026-08-25

Decision:
Confirm Parked stops assuming physical key return and starts requiring
evidence. The strict request body gains one required `keySlotCode` field
(scanned resource evidence, never client authority; trim-only, exact match, no
case folding) which the command must resolve inside the same protected
transaction to an ACTIVE KeySlot in the persisted Organization + Location whose
ID equals the persisted `ValetSession.key_slot_id`, before any mutation.
`ValetSession.key_slot_id` remains the designated/assigned home slot; custody
truth remains append-only `KeyCustodyEvent` history; Start Parking keeps
recording `CHECKED_OUT` under DEC-036. On verified match, Confirm Parked still
commits atomically: `PARKING -> PARKED`, Parking Task `IN_PROGRESS ->
COMPLETED`, exactly one `RETURNED_TO_SLOT`, DispatchEvent `COMPLETED`,
AuditEvent `VALET_SESSION_PARKED`. Any wrong, missing, inactive, wrong-scope
or non-matching scan returns the existing `KEY_CUSTODY_NOT_READY` with zero
side effects; no new public error code is added. MVP unavailable-slot policy is
STRICT FAIL — no silent reassignment during Confirm Parked; supervisor/post-
start reassignment requires a later focused decision. No standalone return-key
endpoint, no new ValetSession state, no schema/migration/column change, no
mutable key-custody status field. Employee flow becomes spot confirmation ->
"Return key to {code}" instruction -> key-slot scan -> single POST; transient
in-memory holding of the spot code follows DEC-063. EN/AR copy direction locked
("Assigned key slot", "Return key to {code}", "Scan key slot", "Vehicle parked
and key returned" / Arabic equivalents), codes visually LTR-isolated in
Arabic; no Guest KeySlot exposure. Accepted MVP timestamp trade-off:
`parked_at` is authored at combined-commit time, shortly after physical
parking. Retrieval/release custody semantics unchanged; canonical history order
remains `SLOT_ASSIGNED -> CHECKED_OUT -> RETURNED_TO_SLOT`.

This decision amends only DEC-037 §3, §4, §11, §12, §13, §18, §24 and §33 and
the DEC-038 §11 gate wording (RETURNED_TO_SLOT succeeds only after
server-verified scanned KeySlot evidence). All other DEC-036/037/038 clauses
remain binding as written. Until Accepted, DEC-037 remains fully binding.

Full binding contract:
`docs/decisions/DEC-065_VERIFIED_KEY_RETURN_DURING_CONFIRM_PARKED.md`

---

## DEC-066 — Employee Bottom Navigation Production Wiring

Status: Accepted
Date: 2026-08-25

Decision:
Locks production behavior for the Employee bottom navigation (Tasks, Vehicles,
Scan, Shift) and the authorization/privacy boundaries for its implementation
slices VUI-011A–D and VUI-012. Prototype/mock screens can never be promoted
into Live mode: a tab becomes Live-reachable only when it renders a truthful
live-safe screen with zero hardcoded operational data; routing alone never
activates a tab. BottomNav navigates freely between top-level surfaces only
(task-queue, vehicles-list, scan-hub, shift-summary) and MUST NOT navigate away
while check-in/parking/retrieval/incident/guest-access workflows are active —
stronger than isSubmitting-only blocking — because workflow-local transient
in-memory intent must not be silently discarded; no persistence workaround of
any kind; DEC-063 remains binding. The Live Shift screen shows only
authoritative operational context (Organization/Location/role/start/elapsed/
status), never the raw Shift UUID, never a fake or email-derived identity
(omitted when none is available), and never prototype counters or Dashboard
analytics. End Shift stays the existing authoritative command
`POST /v1/staff/shifts/:shiftId/end` with strict `cashReported`, explicit
confirmation, ONLINE_ONLY, truthful `OPEN_TASK_HANDOFF_REQUIRED`, transient
in-memory retry intent, rehydrate-before-retry on ambiguous outcomes, reliance
on server idempotency for an already-ended self-owned Shift, success only from
a confirmed authoritative response followed by an operational-context refresh
to the No Active Shift gate; missing Live Start Shift UI is recorded as
VUI-011D, not absorbed here. The Scan Hub is a context-aware launcher only:
License Plate may launch Check-In; Key Slot/Parking Spot/Pickup-Handoff tiles
launch only with sufficient existing authoritative workflow context, else
disabled with truthful localized reasons; no camera/getUserMedia/
BarcodeDetector/scanner dependency, no fake scanner, no QR-as-authority, no
scan-first session discovery; real capture is deferred to VUI-012 with its own
focused decision. VUI-011C may add exactly ONE narrow Employee operational
read (`GET /v1/staff/valet-sessions/directory?locationId=<uuid>`, final shared
contract in packages/contracts; no schema/migration expected): server-derived
tenant/Organization/Location/eligibility/role authority; COMPLETED excluded;
supervisors read all active/non-COMPLETED sessions in the exact authorized
Location; employees read only sessions where existing lifecycle/task ownership
semantics establish a relation (derived from current per-state authorization,
not a second model); row visibility grants NO command authority and every
later operation re-proves its own authorization; row vs field authorization
are separate with fail-closed Key Slot masking for VALET_EMPLOYEE (null unless
existing state-specific authorization justifies disclosure); supervisor
Key Slot detail allowed within the exact Location; capped response with a
`truncated` flag and no misleading global search over a loaded page; row taps
perform no mutation and open workflows only with pre-existing authoritative
targets; two-principal negative IDOR tests required. All new copy EN/AR via
the existing i18n architecture with RTL and LTR-isolated plates/spot/slot/
currency identifiers.

DEC-066 supersedes nothing: DEC-032/033/036/037/052/063/065 remain fully
binding; this decision composes them into the production navigation/read
boundaries above. Non-goals include Dashboard analytics reuse, employee Shift
statistics, profile/display-name backend work, camera dependencies,
scan-first discovery, persistent mutation queues, new lifecycle states,
schema changes, migrations, Guest changes, and any weakening of command
authorization.

Full binding contract:
`docs/decisions/DEC-066_EMPLOYEE_BOTTOM_NAV_PRODUCTION_WIRING.md`

## DEC-067 — Employee Camera & QR Capture Architecture

Status: Accepted
Date: 2026-08-25

Decision:
Implements the real camera/QR capture architecture deferred to VUI-012 by
DEC-066 §5. Mechanism/library is locked to `@zxing/browser@0.2.1` with its
`@zxing/library@^0.23.0` peer — the official ZXing browser port (ESM+CJS,
typed, no React peer dependency, React 19 compatible), loaded only through a
lazy dynamic import inside `"use client"` code so it never touches SSR
(Next.js 16 compatible); `BarcodeDetector` may return only as a documented
optional optimization behind the same interface, never a second protocol.
Camera permission UX exposes distinct truthful localized states
(idle/starting/scanning/unsupported including insecure context/denied/busy/
no-device/error) with a mobile-first viewport and a large Close control; a
failed start never fakes success and always leaves manual entry operable.
Full MediaStream lifecycle obligations: all tracks stopped — no LED left
running, no background capture — on explicit close, successful accepted
decode, unmount, Live route change away from the workflow, workflow
completion, and authentication identity change; the decoder stop handle AND a
defensive stop of every preview `MediaStream` track are both applied; audio is
never requested. Resource QR V1 payloads are EXACTLY
`vaylet:key-slot:<RESOURCE_CODE>` and `vaylet:parking-spot:<RESOURCE_CODE>`:
typed, non-secret, NON-AUTHORITATIVE, with no sessionId/taskId/membershipId/
organization/location/token/pickup-secret/proof fields; the strict parser
accepts only these exact prefixes, trims surrounding whitespace only (never
case-folds), preserves the resource code byte-exact, rejects empty/overlong
(>120)/URL/JSON/garbage payloads without touching any input. Decoding alone
performs ZERO business mutation: the decoded code fills the EXISTING manual
input of the current step and the employee performs the existing explicit
action while the server re-proves everything (Confirm Parked keeps DEC-065
verified key return; resource codes never authorize; no scan-first session
discovery; Key Slot capture exists only inside Check-In key assignment,
Parking verified key return and Retrieval key checkout — no generic top-level
key lookup). Dynamic Handoff scans the RAW existing `vhq1.*` payload validated
against the existing `DYNAMIC_QR_PATTERN`, reused exactly — never wrapped, no
second protocol; scanning never marks verification locally and the raw proof
stays memory-only transient input cleared promptly after submission
(success or failure), never persisted to storage/logs/URLs/navigation state,
with no scan history. Duplicate-decode suppression is a client obligation:
after one accepted decode the scanner stops and stays suppressed until the
consumer re-arms it — never repeat-submitting proof or overwriting
employee-edited input, independent of backend rate limits; rejected payloads
show truthful localized messages and are consecutively deduplicated. Manual
fallback is mandatory and visible in EVERY camera workflow including every
failure state. No License Plate OCR in VUI-012. Offline behavior stays under
DEC-063: decoded values fill transient current-screen drafts offline;
protected mutations remain online-only; no persistent queues/outboxes/replay.

DEC-067 supersedes nothing: DEC-066 §5's deferral is resolved by this focused
decision as it required; DEC-033/037/042/063/065 remain fully binding.

Full binding contract:
`docs/decisions/DEC-067_EMPLOYEE_CAMERA_QR_ARCHITECTURE.md`

---

## DEC-068 — Post-Parking Key Slot Binding

Status: Accepted
Date: 2026-08-26

Decision:
Removes pre-Parking Key Slot assignment from the normal valet workflow. The
Employee receives the key with the vehicle, starts Parking with
`ValetSession.key_slot_id` NULL (no slot-specific custody event — no fake
pre-Parking `CHECKED_OUT`), keeps the physical key while driving, parks,
scans the Parking Spot, deposits the key into any visibly free physical Key
Slot on the FIRST cabinet visit, scans that slot, and Confirm Parked then
atomically resolves the submitted `keySlotCode` (trim-only exact code, ACTIVE,
persisted Organization + Location, transactionally locked, proven unoccupied),
binds it to the session alongside Spot/Zone, transitions `PARKING -> PARKED`
and Parking Task `IN_PROGRESS -> COMPLETED`, stops tracking, appends custody
(`SLOT_ASSIGNED` then `RETURNED_TO_SLOT`), Dispatch `COMPLETED`, and BOTH
audits (`VALET_SESSION_KEY_SLOT_ASSIGNED` + `VALET_SESSION_PARKED`) — all or
nothing. Canonical NEW custody sequence:
`SLOT_ASSIGNED -> RETURNED_TO_SLOT -> CHECKED_OUT(retrieval) ->
RELEASED(handoff)`. A dual-mode rule based purely on persisted state keeps
in-flight compatibility: non-null `key_slot_id` sessions continue current
accepted behavior end-to-end (assignment already recorded; `CHECKED_OUT` at
Start Parking; submitted Confirm Parked slot MUST equal the persisted slot;
no double `SLOT_ASSIGNED`/assignment audit); NULL sessions use post-parking
binding. Same-slot concurrency has exactly one winner via row locking plus
the existing unique `valet_sessions_key_slot_id_key` index as final authority
with the established `23505` classification pattern; the loser gets the
existing `KEY_CUSTODY_NOT_READY` (HTTP 409, no new public error code) and
commits zero effects. No availability picker or available-slots endpoint;
manual fallback mandatory; camera QR decode only fills inputs (DEC-067
mechanics unchanged); EN/AR/RTL with LTR-isolated codes. No standalone
return-key endpoint, no new lifecycle state, no reservation primitive, no new
audit type, no Guest Key Slot exposure, DEC-063 offline policy unchanged.

No schema/migration: no Prisma change, no migration, no new table/column/
enum value, no mutable custody status, no duplicate occupancy projection;
the repository remains at its then-current forward-only migration count.
Dashboard key accountability stays derivable from current `key_slot_id`
and becomes more physically truthful (slots show held only from physical
deposit until release).

This decision supersedes/amends exactly: DEC-033 §13's assigned-slot framing
for later parking commands (assign/clear remain administrative/legacy/
correction capabilities; all other contracts intact), DEC-036 §10/§11/§13/
§19/§20/§24/§26/§28 (mandatory slot readiness and unconditional
`CHECKED_OUT` become legacy-branch only), DEC-037 §11/§12/§13/§18/§24/§33
(key readiness, RETURNED_TO_SLOT-only assumption, guarded equality for the
new path), DEC-038 §5/§11 (canonical flow and gate proof become branch-
aware), DEC-065 §6 step 4/§8/§9/§10/§13/§16 for NEW sessions (equality
verification, designated-slot STRICT FAIL, old flow/copy/order superseded;
evidence principle, exact-code semantics, atomicity, privacy and transient
drafts preserved; LEGACY sessions keep its equality behavior), and the
guard wording of `docs/04_VALET_SESSION_STATE_MACHINE.md`
(`AWAITING_PARKING -> PARKING` needs no Key Slot for new sessions;
`PARKING -> PARKED` key readiness is branch-aware).

Full binding contract:
`docs/decisions/DEC-068_POST_PARKING_KEY_SLOT_BINDING.md`

---

## DEC-069 — Exact Returning Vehicle Recognition, Organization-Wide Returning Customer Suggestion, and Check-In Vehicle Details

Status: Accepted
Date: 2026-08-29

Decision:
After explicit Employee plate confirmation, Check-In may perform only an exact
Organization-scoped Vehicle lookup by `organization_id + plate_country +
plate_number_normalized`; fuzzy, partial, substring, approximate-OCR, broad
Vehicle enumeration and generic Customer search are prohibited. The current
Check-In remains authorized at the Employee's persisted Location, but the exact
Vehicle is Organization-scoped.

For that exact Vehicle only, returning-Customer association is intentionally
Organization-wide across all same-Organization Locations. Eligible evidence is
limited to `COMPLETED` ValetSessions with non-null Customer. The server suggests
a Customer only when all eligible Organization-wide history resolves to exactly
one distinct Customer ID: zero means no suggestion and more than one means no
suggestion. It never guesses newest/most frequent, infers ownership, or treats a
plate as authentication.

The suggestion projection is limited to an opaque confirmation reference,
nullable display name and masked phone suffix. Full phone and history remain
private. The Employee must explicitly choose `USE_SAVED_CUSTOMER` or
`DIFFERENT_CUSTOMER`; final intake treats any Customer ID as intent only and
re-proves current Check-In authority, exact Vehicle identity and the complete
Organization-wide single-Customer rule before attachment. A stale/invalid
suggestion fails safely and requires current Customer entry.

Different-Customer input uses the existing phone normalization and exact
same-Organization `phone_normalized` resolution: zero rows creates a Customer,
exactly one reuses it, and more than one returns an explicit ambiguity outcome
without guessing, merging or rewriting history. Phone remains non-unique and is
not proof of identity or ownership.

Vehicle `make`, `model` and `color` remain nullable optional descriptive fields.
Recognition pre-fills them; new intake may persist them; explicit corrections
use authoritative backend logic, Vehicle optimistic concurrency and appropriate
safe atomic audit history. A versioned licensed/provenance-reviewed local
Make/Model dataset provides searchable Make then Model, Other and Unknown/Skip
UX with no runtime network dependency; it is UI assistance, not relational
identity.

DEC-020 no-plate flow remains: stable distinct Vehicle UUID, useful confirmed
temporary descriptor, no descriptor matching and no returning-Customer
recognition. Ordinary recognition roles are `VALET_EMPLOYEE` and
`VALET_SUPERVISOR`; Manager/Admin roles do not inherit field authority. The
cross-Location suggestion reveals no source Location or operational history,
and all cross-Organization access remains prohibited and non-disclosing.

No Customer/Vehicle ownership table or cache is added. No lifecycle changes,
Prisma change, migration 32, dependency, or production code are part of this
decision task; the repository remains at 31 forward-only migrations.

Full binding contract:
`docs/decisions/DEC-069_RETURNING_CHECK_IN_RECOGNITION.md`

---

## DEC-070 — Retrieval Request and Vehicle Ready Foreground Notification MVP

Status: Accepted
Date: 2026-08-29

Decision:
Issue #192 MVP adds exactly two foreground in-app operational notifications without creating a general notification platform. A genuinely new guest retrieval request may notify eligible Employee users only after the canonical transaction creates a new unassigned `QUEUED` `RETRIEVAL` Task; the stable presentation identity is the Task ID. The Guest/Customer dashboard may notify only after the first authoritative `RETRIEVING -> READY` Mark Ready transition; the stable presentation identity is `ValetSession.id + ready_at`.

Employee recipients reuse the existing persisted exact-Location queue/Shift authorization boundary: active User, active membership and Organization/Location, explicit Location access, `VALET_EMPLOYEE` or `VALET_SUPERVISOR`, and an ACTIVE Shift at that exact Location. Guest presentation remains scoped only through the DEC-064-authorized Guest Access session boundary; Browser Session restore may survive reload while notification presentation state still baselines from canonical current state. Notification presentation grants no domain authority.

The selected MVP transport is the existing five-second canonical polling/refetch in Employee and Guest applications with client transition detection and baseline/dedupe semantics. No SSE, WebSocket, event bus, notification endpoint, or dedicated notification persistence is added. Existing Task/Dispatch/RetrievalRequest/ValetSession/Audit state remains authoritative, the external SMS/WhatsApp/Email `notifications` table is not reused, and missed presentation signals recover from canonical persisted state.

Two distinct foreground sounds are required: `RETRIEVAL_TASK_ALERT` for `EMPLOYEE_RETRIEVAL_REQUESTED` using the Product-selected Mixkit “Digital quick tone” candidate, and `VEHICLE_READY_ALERT` for `GUEST_VEHICLE_READY` using the Product-selected Mixkit “Happy bells notification” candidate. Implementation must verify and record asset/license provenance before committing local static audio. Browser autoplay failure degrades to visual-only presentation and never affects business success or causes disruptive retries.

Implementation is split into T2 `readyAt` guest-safe projection/contract, T3 Employee retrieval notification UX/sound/navigation/dedupe, and T4 Guest READY notification UX/sound/dedupe. No schema, migration, dependency, lifecycle redesign, Web Push, background OS notification, or generic notification-center scope is approved by this decision.

Full binding contract:
`docs/decisions/DEC-070_RETRIEVAL_NOTIFICATION_MVP.md`

---

## DEC-071 — Mobile Platform and Repository Architecture

Status: Accepted
Date: 2026-09-01
Amended: 2026-09-04 — Project Owner set the Android product minimum to Android 10 / API 29 and designated Employee Web as the visual reference for Employee Native.

Decision:
The VAYLET Employee native application will use the Expo SDK 57 generation
with React Native 0.86, Hermes and React Native New Architecture; Expo
Development Builds are required for native-capability testing and Expo Go is
not production evidence. Expo Router is the navigation mechanism. Continuous
Native Generation is the default: `android/` and `ios/` are generated,
short-lived native projects that are not hand-maintained in Git unless a later
Accepted Decision explicitly changes that policy; customization should use app
configuration/config plugins and narrow platform adapters.

The application belongs at `apps/valet-native` inside the existing pnpm/Turbo
monorepo as a sibling of `apps/valet`. Android is implemented, physically
tested and piloted first with Expo SDK 57's compile/target API 36, but business
and client workflow logic must remain platform-neutral. The same Expo
application is intended to produce the later iOS app, and an iOS
configuration/build smoke is required before final Android pilot completion.
Provider-neutral domain/database/portable concepts must not use Android- or
FCM-specific naming.

Employee Web remains available through development and the controlled mobile
pilot. Native-primary cutover and Web retirement are later evidence-based owner
decisions; no WebView wrapper is permitted. Shareable workflow/client logic may
later move behind a pure-TypeScript portable boundary, but UI remains
platform-specific and MOB-001 creates no package or application scaffold. The
existing API/database/contracts remain authoritative and require no mobile
rewrite. DEC-063 remains binding; no generic durable offline synchronization,
mutation outbox or automatic background replay is introduced.

Employee Web is also the visual source of truth for production Employee Native
UI. Beginning with MOB-010, each Native flow must preserve the established
VAYLET visual language, action and information hierarchy, state language, and
EN/AR RTL/LTR intent as closely as practical. Native remains a platform-specific
adaptation rather than a DOM/CSS copy, WebView, desktop layout, or independent
redesign. Deviations require native ergonomics, accessibility, platform or
smaller-screen constraints, or another explicit accepted Owner/product
decision, while preserving product identity and information hierarchy.

Android and iOS use the stable product identifier `com.vaylet.employee`.
Android supports a product minimum of Android 10 / API 29 and compiles/targets
API 36. Initial validation covers Android 10, 11, 13, 15 and 16 across Samsung,
Pixel/reference behavior and representative mid-range physical hardware;
emulators cannot replace required physical proof for native capabilities.

Google Play, Firebase, Android signing/upload credentials and future Apple
distribution are organization-controlled, with accountable ownership,
recovery and least-privilege policy. Credentials and signing secrets do not
belong in the mobile application, source or Git. Operational provisioning and
signing configuration remain later push/iOS/release work and do not block
scaffolding.

Expo Updates / OTA delivery is disabled for the initial Android pilot. Pilot
releases use deterministic native binaries with bundled JavaScript; any later
OTA adoption requires a focused Accepted Decision governing runtime
compatibility, rollout/rollback, channels, native/JavaScript compatibility and
emergency disablement.

No runtime code, dependency, database, migration, auth, push, camera/QR, GPS,
photo-upload, signing/distribution implementation or architecture-gate work is
authorized by this decision.

Full binding contract:
`docs/decisions/DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md`

---

## DEC-072 — Native Staff Authentication Architecture

Status: Accepted
Date: 2026-09-02

Decision:
Employee Native uses dedicated strict-JSON auth routes at
`POST /v1/staff/auth/native/login`, `/refresh` and `/logout`. Those routes
delegate to the existing `StaffAuthService`, `StaffAuthSession`, User and
refresh-credential lineage; they create no second User/session authority and
require no database change. Authentication still yields only `{ userId }`, and
current Organization, Location, membership, role, Shift, Task ownership and
command authorization remain authoritative server facts.

Native access credentials use the existing exact Bearer mechanism and are held
only in process memory. Native refresh credentials are exchanged only in the
dedicated route JSON bodies over HTTPS and are stored durably only behind the
DEC-071 platform secure-storage adapter. No raw credential may enter ordinary
storage, offline queues, logs, URLs, navigation, analytics, crash metadata or
push payloads. No compiled client secret, package identity, installation or
device identifier becomes Staff authentication authority.

DEC-023 rotation, one-current-credential integrity, replay-family revocation,
absolute expiry, disabled-User handling and idempotent session logout remain
unchanged. One process coalesces refresh. A lost rotation response is initially
transient, but authoritative retry may produce replay/revocation and require
login; there is no reuse grace. Secure replacement must succeed before the new
access credential is published, otherwise the client fails closed, blocks
restore, purges identity state and best-effort revokes the new session.

Logout immediately blocks old-identity work and independently records local
restore blocking, secure deletion and confirmed server revocation. Identity
change purges all operational context and transient state. A non-secret local
installation generation prevents any secure credential surviving reinstall
from silently restoring an old identity; it is never sent as authority.

The existing Web routes retain their exact-Origin requirement and host-only
`Secure`, `HttpOnly`, `SameSite=Strict` refresh cookie. Native routes do not
forge Origin, accept the Web cookie, weaken CORS or expose browser refresh
credentials to JavaScript. Production native traffic is HTTPS-only and Android
release builds must disallow cleartext; certificate pinning is not required.

Safe reads may retry once after successful coalesced refresh. The generic auth
layer never blindly replays protected mutations; ambiguous outcomes continue
to require canonical rehydration and command-specific idempotency/version rules
under DEC-063. MOB-007 owns implementation and the automated/physical-device
security evidence enumerated in the focused decision.

No runtime code, route, contract, dependency, schema, migration, Expo scaffold,
SecureStore implementation, Web auth change or MOB-003 work is part of this
decision task.

Full binding contract:
`docs/decisions/DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md`

---

## DEC-073 — Native Push Architecture

Status: Accepted
Date: 2026-09-02

Decision:
Employee Native push is a best-effort attention signal and never authentication,
authorization, synchronization, Task/Dispatch/ValetSession authority or a
mutation trigger. Receipt/tap must complete current Staff auth restoration,
refetch the canonical Task queue and require an explicit protected command for
any action. Existing five-second Employee Web polling and foreground DEC-070
behavior remain unchanged and are the recovery truth when push is delayed,
duplicated, suppressed or lost.

The only initially Accepted kind is `EMPLOYEE_RETRIEVAL_REQUESTED`, created
when the canonical guest-request transaction genuinely creates a new unassigned
`QUEUED` `RETRIEVAL` Task. That same transaction writes one deduplicated intent
and per-registration delivery rows only for current exact-Location queue/Shift
eligible Staff. The sender rechecks active User/session, membership,
Organization/Location, explicit access, Employee/Supervisor role, ACTIVE Shift
at the exact Location, registration/token version and still-unassigned queued Task
before provider I/O. New registrations are not backfilled. Guest-ready,
assignment, reassignment and general-operation native push remain unaccepted.

MOB-020 must add dedicated provider-neutral Staff push registration, intent and
delivery persistence; it must not reuse the external SMS/WhatsApp/Email
`notifications` table or create a generic event/outbox platform. Registrations
bind server-side to the exact authenticated `StaffAuthSession`, support
multiple devices, and use ACTIVE plus terminal
DISABLED/PROVIDER_INVALID/SUPERSEDED lifecycle semantics with atomic token
rotation and deterministic same-user session-transition supersession. A later
current session may reconcile the same User's exact physical installation,
including a simultaneous provider-token rotation; a different User may not
inherit an existing active binding, and a token collision across installations
remains a conflict.
Provider tokens are sensitive operational identifiers: the server retains the
raw usable value under least privilege plus a versioned hash for equality; no
token or hash enters logs, payloads, AuditEvent, analytics, errors or metric
labels.

Delivery uses PENDING, LEASED, RETRY_WAIT, PROVIDER_ACCEPTED, SUPPRESSED,
PERMANENT_FAILURE and EXPIRED states. Atomic short claims commit a unique lease
before external I/O; finalization is fenced by the exact lease token. TTL,
attempts and exponential full-jitter retry are finite typed deployment policy,
provider timeout is shorter than the lease, and no work starts after expiry.
A crash or database failure after provider acceptance can cause a bounded
duplicate attempt; exactly-once device display is not promised.

The Android implementation sends directly through an FCM HTTP v1 adapter and
may use Expo Notifications to obtain the native device token; Expo Push Service
is not selected. Shared entities/contracts remain provider-neutral and admit a
later direct APNs adapter. Payloads contain only schema version, push kind,
opaque intent ID and Task-queue route intent with fixed generic EN/AR copy; no
tenant, Location, Task/session, guest, vehicle, plate, phone, key, parking,
handoff, payment, GPS, auth or provider secret is sent.

MOB-020 owns backend persistence/contracts/worker/FCM/observability; MOB-021
owns native permission/token registration/rotation/logout/channel integration;
MOB-022 owns foreground/background/terminated tap/refetch proof. MOB-003 makes
no code, dependency, Firebase/APNs project, credential, schema, migration,
worker, Web Push, service-worker or Employee Web change.

Full binding contract:
`docs/decisions/DEC-073_NATIVE_PUSH_ARCHITECTURE.md`

---

## DEC-074 — Native Assistive Plate OCR / ANPR

Status: Accepted
Date: 2026-09-05
Amended: 2026-09-05 — no-migration OCR cost-guard policy

MOB-010A adds bounded automatic assistive plate acquisition to the existing Native
Scan Plate flow, before MOB-011. A candidate stops scanning and enters the existing
editable Confirm Plate flow. Only explicit human confirmation may initiate exact
returning recognition; OCR cannot confirm identity, select a Customer, create an
intake or mutate custody. Manual Entry, No Plate and bounded Retry remain available.

Transient camera samples go only through the authenticated VAYLET API and a
replaceable provider adapter under the focused decision's size, attempt, timeout,
authorization and privacy limits. Images and credentials must not be retained in
ordinary client storage, logs or audit. Existing QR semantics, check-in contracts,
identity generations and command recovery remain unchanged.

The cost identity is server-derived Organization + Membership + target Location.
Development/test/controlled single-API-process physical smoke may use bounded
ephemeral limits: one provider call in flight, five calls per 10 seconds and
20 calls per 60 seconds per key. This is not production anti-abuse protection.
Production must return provider-neutral `UNAVAILABLE` before provider I/O unless a
later Accepted implementation provides a shared/durable cost guard across replicas
and restarts. That later slice preserves these limits and fail-closed behavior
unless an Owner Decision changes them. Existing login, guest and handoff limiter
scope meanings cannot be reused for OCR. MOB-010A itself adds no schema/migration.

This summary repairs the log mirror; the full binding contract, including all
provider, capture, lifecycle and evidence requirements, remains:
`docs/decisions/DEC-074_NATIVE_ASSISTIVE_PLATE_OCR_ANPR.md`.

---

## DEC-077 — Employee Incident Process-Death Recovery

Status: Accepted
Date: 2026-09-12

Decision:
Employee Native Incident process-death recovery uses an actor-bound server
`IncidentRecoveryIntent`. Native first writes only a minimal no-content recovery
identity, then reserves the exact Incident ID on the server, and only after a
successful reservation may dispatch the recovery-enabled Incident POST. Recovery
stores no Incident body, description, type, severity or payload hash and never
automatically reserves, retires, posts, journals, queues or replays a mutation.

The exact original OrganizationMembership, Organization, Location and
ValetSession bind reservation, recovery and retirement. Server state is
`RESERVED -> RETIRED`; a migration-owned database transition guard makes RETIRED
terminal and immutable to the normal runtime role. Active reservation lasts 15
minutes by authoritative database time. Terminal exact-ID tombstones remain
indefinitely for MVP. Native's minimal SecureStore marker has an absolute,
non-sliding 24-hour soft recovery deadline and contains no userId or Incident
content.

CSPRNG UUIDv8 plus the exact narrow protocol header distinguishes recovery-enabled
Native attempts from compatible legacy UUIDv4 reporting and prevents downgrade of
a tracked v8 ID. Canonical outcomes are FOUND, RESERVED, RETIRED and UNKNOWN.
Exact actor recovery remains available after Shift end or ValetSession completion
while current identity and scope remain valid. Reservation, retirement and expiry
write no Black Box event; exactly one `INCIDENT_OPENED` remains atomic with an
actual Incident commit.

Implementation remains the `MOB-023B-INCIDENT-RECOVERY-IMPLEMENTATION` child of
MOB-023B and requires independent implementation review before the parent can
close.

Full binding contract:
`docs/decisions/DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md`

---

## DEC-078 — Company Admin MFA

Status: Accepted
Date: 2026-09-15

Company Admin uses password plus TOTP, with ten one-time verifier-only recovery
codes. Recovery without a code is VAYLET-mediated and audited; peers cannot
bypass it. Session-bound assurance expires after eight hours, 30 minutes of
admin inactivity, or five minutes for sensitive actions. Expiry is soft
step-up, and refresh rotation never extends assurance.

Full contract: `docs/decisions/DEC-078_COMPANY_ADMIN_MFA.md`.

---

## DEC-079 — Management Audit Scopes

Status: Accepted
Date: 2026-09-15

Audit has three truthful boundaries: Location operational events,
Organization-wide events with null Location, and separate account-security
events. Fake Locations and copying account events into every tenant are
forbidden.

Full contract: `docs/decisions/DEC-079_MANAGEMENT_AUDIT_SCOPES.md`.

---

## DEC-080 — Company Admin Management Authority

Status: Accepted
Date: 2026-09-15

MFA-assured `ORG_ADMIN` receives company Management scope, all-Location
visibility, settings/staff/branding/Location lifecycle, analytics, reports, and
safe audit. It does not inherit check-in, parking, handoff, key movement, or
other physical-custody authority. Live operational map visibility does not
include unrestricted raw route history.

Full contract: `docs/decisions/DEC-080_COMPANY_ADMIN_AUTHORITY.md`.

---

## DEC-081 — Staff, Role, and Access Lifecycle

Status: Accepted
Date: 2026-09-15

Company Admin owns company roles and Location grants. Last-usable-admin and
handover protections apply. Emergency disable blocks access immediately without
fabricating completion of operational work. Membership disable affects only its
Organization; global User disable remains separate.

Full contract:
`docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md`.

Approved T05-E extension (2026-10-02): bounded Organization Shift history/detail
read existing rows with current canonical identity/currentRole. CA uses standard
read assurance including inactive Locations/targets; LM history is constrained by
current granted ACTIVE Shift Locations, independent of target-management coverage.
Exact filters precede LIMIT; actor/scope/filter-bound dedicated cursors apply to
both authorities. A bounded history-authorized employee candidate read supports
exact membership selection. Explicit timezone date boundaries and one local
minute clock support the existing Staff UI. No cash/operational mutation or
T05-F/G behavior. Full execution map: `docs/validation/ISSUE_240E_SHIFT_HISTORY.md`.

Approved Issue #240 / T05-A extension (2026-10-01): nullable structured staff
names belong to OrganizationMembership; User retains global email. Names are
trimmed, nonblank, Unicode-preserving and bounded to 100 code points each, with
no fabricated backfill. One shared formatter uses complete names or truthful
email fallback. Company Admin directory filters run before the keyset limit;
v2 cursors bind effective filter fingerprints without raw search PII. Current
authority and mutation policies remain unchanged by T05-A.

Approved Issue #240 / T05-B extension (2026-10-01): Location Manager may manage
only existing Employee/Supervisor targets whose complete persisted Location grant
set is non-empty and fully contained in the actor's current grants to active
Locations. Mixed/outside, zero-grant, elevated-role and self targets are concealed.
LM role changes are Employee <-> Supervisor only; status and 1-50 Location
grant/revoke commands retain CAS, handover blockers, desired-state no-op and atomic
audit semantics, and every grant command must leave a non-empty fully covered
target set. Authority is re-proved through commit so grant/lifecycle loss cannot
race through stale preflight. LM sensitive staff commands reuse the existing MFA
system; eligibility for that ceremony does not grant Company Admin capability.
Approved Issue #240 / T05-C extension (2026-10-01): explicit PENDING User and
membership, null password only for pending accounts, required names/1–50 grants,
sensitive CA/fully covered LM lower-role onboarding, hash-only invitation
generations and strict staff-root POST plus `/:membershipId/invitations` resend.
Fresh issuance alone exposes the trusted-origin fragment link after commit.
Durable operation/digest replay returns link-unavailable with no new generation;
conflicting payload conflicts. Narrow security-definer writes atomically audit,
retain history and quarantine PENDING from ordinary management and authority.
Full details are in Accepted DEC-081. Activation/ownership/UI and T05-E–G remain
deferred to their assigned slices.

---

### Approved T05-F extension (2026-10-02)

DEC-081 and `docs/validation/ISSUE_240F_LM_MFA_FORCE_END_BACKEND.md` record the
owner-approved distinct administrative Force End backend. Existing LM MFA is
reused. CA same-Organization and LM current ACTIVE Shift-Location grant authority
require fresh sensitive exact-session assurance. One locked transaction closes
Shift with all cash fields NULL, persists Organization/operation replay identity,
and appends SHIFT_FORCE_ENDED with protected bounded reason. No Supervisor reason
visibility, self-end impersonation, Task/Session mutation or T05-G UI is authorized.

---

## DEC-082 — Management Audit Visibility

Status: Accepted
Date: 2026-09-15

Company Admin sees a safe Organization-wide projection, Location Manager only
authorized Locations, Supervisor only necessary operational history, and
Employee/Guest no general explorer. Security audit, secrets, credentials, and
raw routes are excluded without separate authority.

Full contract: `docs/decisions/DEC-082_MANAGEMENT_AUDIT_VISIBILITY.md`.

---

## DEC-083 — Management Settings Scope

Status: Accepted
Date: 2026-09-15

Preserve existing typed settings and add only language, informational operating
hours, OCR assist, parking-Spot requirement, per-notification-type toggles, SLA
target after its KPI definition, and optional justified geofence alerts. Do not
build generic settings/rules/templates, Key Policy, generic validation policy,
or Location allowed-role policy.

Full contract: `docs/decisions/DEC-083_MANAGEMENT_SETTINGS_SCOPE.md`.

---

## DEC-084 — Management Customers as Visit Contacts

Status: Accepted
Date: 2026-09-15

Management Customer search is bounded visit management by phone, plate, or
authorized-scope name. It may show safe contact and visit associations but
never claims vehicle ownership and does not add CRM campaigns, tags, segments,
loyalty, or marketing notes. Sensitive corrections are explicit and audited.

Full contract: `docs/decisions/DEC-084_MANAGEMENT_VISIT_CONTACTS.md`.

---

## DEC-085 — Effective Management and Guest Branding

Status: Accepted
Date: 2026-09-15

Basic branding remains display name plus primary color with Company default to
Location override inheritance. Guest Access derives effective branding from the
real visit Location. CSS, fonts, custom domains, and advanced white label are
excluded.

Full contract: `docs/decisions/DEC-085_EFFECTIVE_MANAGEMENT_BRANDING.md`.

---

## DEC-086 — Logo Customization Deferred

Status: Accepted
Date: 2026-09-15

Logo customization is deferred unless later proven a launch blocker. Any future
contract requires server-controlled verified asset handling; arbitrary client
URLs and VehiclePhoto metadata reuse are forbidden.

Full contract: `docs/decisions/DEC-086_LOGO_DEFERRAL.md`.

---

## DEC-087 — Read-Only MVP Integrations

Status: Accepted
Date: 2026-09-15

MVP exposes read-only truthful status for real implemented integrations.
Company Admin cannot enter keys, swap/self-enable providers, or manage secrets.
POS/PMS/SSO remain out of scope.

Full contract: `docs/decisions/DEC-087_READ_ONLY_INTEGRATIONS.md`.

---

## DEC-088 — Management Entitlement Safety

Status: Accepted
Date: 2026-09-15

Only VAYLET controls commercial entitlements. Lapse may restrict Management
features only and must never block check-in, parking, retrieval, handoff,
custody completion, incident safety, or necessary Guest completion paths.

Full contract: `docs/decisions/DEC-088_MANAGEMENT_ENTITLEMENT_SAFETY.md`.

---

## DEC-089 — Read-Only MVP Billing

Status: Accepted
Date: 2026-09-15

MVP Billing shows plan, subscription status, and included features only. SaaS
invoices, cards, Stripe, renewals, coupons, self-upgrade, and billing portal are
out of scope. Guest valet payments remain separate.

Full contract: `docs/decisions/DEC-089_READ_ONLY_MVP_BILLING.md`.

---

## DEC-090 — Management KPI Definitions

Status: Accepted
Date: 2026-09-15

SLA is retrieval request to READY against a Location-configured target. Cars per
Active Employee is completed visits divided by distinct operational employees
proven to have worked; Cars Handed Off is a separate final-completer count. Key
Exceptions include controlled genuine problems, never normal movements.

Full contract: `docs/decisions/DEC-090_MANAGEMENT_KPI_DEFINITIONS.md`.

---

## DEC-091 — Guest Rating and Returning Contact

Status: Accepted
Date: 2026-09-15

Guest rating is 1–5, once per completed visit, guest-only and idempotent; staff
cannot alter it. Returning Contact replaces Repeat Guest and means only that a
normalized contact appeared on a prior completed authorized-scope visit, not
that the same person or owner was proven.

DEC-064 T1 preserves exact-visit rating authorization through either an
unconsumed staged legacy bearer or the current Guest Browser Session. Browser
Session rating exists only within the 24-hour `COMPLETED` post-visit scope and
must pass the same function-only least-privilege database authorization;
`CANCELLED` has no rating scope.

Full contract:
`docs/decisions/DEC-091_GUEST_RATING_AND_RETURNING_CONTACT.md`.

---

## DEC-092 — All Locations Analytics

Status: Accepted
Date: 2026-09-15

Company analytics recomputes from underlying data, sums ratio numerators and
denominators, keeps currencies separate, respects every Location's local-time
semantics, and reports missing data as missing rather than zero.

Full contract: `docs/decisions/DEC-092_ALL_LOCATIONS_ANALYTICS.md`.

---

## DEC-093 — Automatic Report Delivery Deferred

Status: Accepted
Date: 2026-09-15

Manual authenticated CSV/PDF comes first. Scheduled delivery is deferred; a
future email-first design must use authenticated links, current authorization,
bounded retries, and the existing report composer, not open attachments.

Full contract:
`docs/decisions/DEC-093_AUTOMATIC_REPORT_DELIVERY_DEFERRED.md`.

---

## DEC-094 — Location Lifecycle

Status: Accepted
Date: 2026-09-15

New Locations start inactive with explicit currency/timezone and readiness
before activation. Closure stops intake, safely drains work, then deactivates;
history is never deleted or falsely completed. Currency is prospective with
historical snapshots; production timezone changes are exceptional corrections.

Full contract: `docs/decisions/DEC-094_LOCATION_LIFECYCLE.md`.

---

## DEC-095 — Management KPI Source Contracts

Status: Accepted
Date: 2026-09-18

SLA targets are typed Location settings with immutable per-retrieval snapshots
anchored at the authoritative retrieval-request transition. Key Exceptions are
exactly four controlled Incident types. Cars per Active Employee uses only the
explicit approved immutable actor-at-time operational evidence union; final
handoffs remain sourced from the persisted completing membership.

Full contract:
`docs/decisions/DEC-095_MANAGEMENT_KPI_SOURCE_CONTRACTS.md`.

---

## DEC-096 — Physical Resource Configuration and QR Identity

Status: Accepted
Date: 2026-09-29

Management may create/list persisted Key Slots and Parking Spots at an exact
Location under the approved Company Admin / Location Manager authority matrix.
New Management labels use V2 static-resource QR payloads containing resource
kind, immutable UUID, and exact code; V1 remains supported indefinitely. V2
operational use verifies persisted UUID, Organization, Location, code, and
ACTIVE state. ParkingSpot creation requires an ACTIVE same-Location
ParkingZone. Runtime keeps no direct INSERT on physical-resource tables and
writes only through narrow audited SECURITY DEFINER functions.

Task 04 / #236 extends this same boundary to ACTIVE ParkingZone creation in
Keys & Spots, using strict code/label contracts, sensitive Company Admin MFA,
exact Location Manager grants, shared operation replay, and atomic
`PARKING_ZONE_CREATED` audit. Zones have no QR identity. The Spot selector uses
explicit bounded pagination and can select the newly created authoritative zone.

Full contract:
`docs/decisions/DEC-096_PHYSICAL_RESOURCE_CONFIGURATION_QR_IDENTITY.md`.

## Approved T05-D activation and pending management reads

The owner Task 05-D contract is recorded in
`docs/validation/ISSUE_240D_STAFF_ACTIVATION_UI.md` (Accepted implementation map).
Public POST /v1/staff/auth/activate accepts only inviteToken/password. PENDING
accounts choose a password under current provisioning policy; ACTIVE accounts
prove their current password without hash/status/session changes; DISABLED is
denied. Activation consumes the current generation with member/account activation
and dedicated safe audit atomically, without issuing a Staff session. Narrow
migration 053 and runtime EXECUTE protect these writes. HMAC failure reservations
bound public attempts (credential 5, trusted address 30 per rolling 15 minutes).
Pending manager reads retain full LM coverage while ordinary mutations remain
quarantined. Create/resend use explicit MFA retry and ephemeral copy-link results.
The standalone EN/AR activation form immediately removes its fragment and keeps
secrets only in memory. T05-E/F/G and email/SMS delivery are outside this slice.

## DEC-097 — Incomplete Check-In cancellation

Status: Accepted
Date: 2026-10-03

Issue #255 adopts terminal CHECKING_IN -> CANCELLED, exact self-owned Employee/Supervisor current authority and expected Shift fencing, lifecycle version CAS, atomic VALET_SESSION_CHECK_IN_CANCELLED audit, minimal protected reconciliation and no mutation replay. All terminal consumers are reconciled. Both Guest resolvers reject CANCELLED with GUEST_ACCESS_INVALID; staff issuance rejects it with GUEST_ACCESS_INTENT_CONFLICT under the session lock. Cancellation retains credential columns/history and does not auto-revoke. Vehicles stays one bounded list with negotiated minimal hints and frozen presentation. Physical Android closure remains batch-owned. Full contract: docs/decisions/DEC-097_INCOMPLETE_CHECK_IN_CANCELLATION.md.

## DEC-099 — Shift Presence foundation

Status: Accepted
Date: 2026-10-04

Issue #257 GPS-A records the owner-approved U257-P/D/A/R/H and U257-RETENTION
contracts. Typed independent Start/End Company policy inherits per-field nullable
Location overrides; effective data stays OFF and non-OFF activation is SQL-gated.
Dedicated scoped Zone/Operation/Challenge/Decision/Exception models provide pure
accuracy-aware circular evaluation, single intent/final-attempt binding, one-time
challenge consumption, immutable minimized decisions and bounded Exception
history. Raw employee coordinates have zero durable retention. Exact recovery is
14 days; minimal terminal replay tombstones 90 days; expired unconsumed challenges
become purge-eligible after 24 hours; Decisions and terminal Exceptions retain
24 UTC calendar months, then privileged purge eligibility, with no cold archive.
Ephemeral operationId/challengeId and historical result survive independently in
Decision history, without requestFingerprint, raw coordinates, capturedAt,
accuracyMeters, distance or generic request payload (owner clarification accepted
2026-10-04; forward migration 059). Request/intent digests stay only on the 90-day
Operation. Runtime grants are column
scoped and deny deletion/immutable rewrites. Caller transaction/current authorized
scope are mandatory; GPS-B owns HTTP, management authority, actual Shift/audit
composition and activation. GPS-A changes no Shift/task lifecycle or client app.
Full contract: [DEC-099_SHIFT_PRESENCE_FOUNDATION.md](decisions/DEC-099_SHIFT_PRESENCE_FOUNDATION.md).

## DEC-100 — Shift Presence exception authority at consumption

Status: Accepted
Date: 2026-10-04
Owner: VAYLET product owner

Accepted U-001 extends DEC-099 for GPS-B. Consumption revalidates active requester
User/membership/exact Location access/action/END Shift and current original
approver User plus CA-for-Organization OR exact-LM-for-Location approval capability,
eligible Organization/Location and live APPROVED/unconsumed exception. The active
requester requirements apply to exception use, not ordinary stale-own-End cleanup.
MFA is required at approval; old approver browser/session/login/MFA freshness is
not required at consumption. Logout/session expiry alone does not revoke approval.
Real authority loss fails closed: no Start/End or consumption; atomically expire
the approved exception, deny its exact Operation with controlled recoverable
authority-revocation reason, preserve truthful approval history, and require fresh
operation/challenge/approval without automatic replay or alternate approval.
Existing EXPIRED is used; no revocation enum. GPS-B must forward-reconcile GPS-A's
timed-expiry CHECK and minimal denial result before enforcement; no migration or
production implementation is performed by this documentation decision. Full
Management UI contract is embedded in the canonical GPS-A/B/#262/C/D master plan;
Settings/navigation/visual freeze remains binding. Owner decisions unresolved: 0.

Full contract:
[DEC-100_SHIFT_PRESENCE_EXCEPTION_AUTHORITY.md](decisions/DEC-100_SHIFT_PRESENCE_EXCEPTION_AUTHORITY.md).

### GPS-B implementation parity for Accepted DEC-099/100

Issue #257 GPS-B implements the accepted backend contract on branch codex/native-257-presence-enforcement from verified fetched main 168da01e6822049ee0a45eebec4780c5b2b1fbd9. Forward migrations 060–063 supply early revocation expiry/minimal denial, narrow policy writes/closed strict gate, privileged retention execution, and protected commercial entitlement. Historical 058/059 and the Accepted Decision semantics are unchanged. Public transport U-002/U-003/U-004 is published in [GPS_B_PUBLIC_CONTRACT.md](validation/GPS_B_PUBLIC_CONTRACT.md); exact local/runtime/failure evidence and outstanding release gates are in [GPS_B_IMPLEMENTATION_REPORT.md](validation/GPS_B_IMPLEMENTATION_REPORT.md). This is implementation parity, not a new product decision, merge approval, strict activation or client-phase completion.
## DEC-101 — Guest Web Push v1 and T5 pilot UI activation

Status: Accepted
Date: 2026-10-08
Owner: VAYLET product owner

The owner approves T5-PUSH-01..09 and T5-UI-01..05 for repository
implementation on the existing T5 branch. Guest `GUEST_VEHICLE_READY`
background delivery uses standards Web Push, durable scoped Guest-specific
registration/intent/delivery, transactional first READY creation, multi-replica
PostgreSQL leases, bounded v1 retry/retention, VAPID with secure sender-only
private key, safe generic EN/AR service-worker presentation and click-time
Guest Browser Session reauthorization. Android Chrome/PWA and supported
iOS 16.4+ **Home Screen** apps are launch targets; iPhone Safari tabs remain
foreground-only. Approved UI enables exact-session Native handoff recovery,
real completed-visit rating, canonical read-only Payment Summary and verified
on-site valet Help, plus notification permission controls, without redesign.
Official receipt, digital checkout, tips, SMS/WhatsApp and full Guest incident
intake remain deferred. Authorization is **not** physical proof, deployment,
production migration or T6 readiness.

Full focused contract:
`docs/decisions/DEC-101_GUEST_WEB_PUSH_V1_AND_PILOT_UI_ACTIVATION.md`.

## DEC-102 — Live Operations historical staff attribution (#276)

Status: Accepted
Date: 2026-10-09
Owner: VAYLET product owner

Owner accepted the package-local `Issues272–278/U-003` historical-identity
contract and canonical completion-proof policy for **Issue #276 only**.
The new history reader is **Live Operations only** (separate API/strict DTO,
no Vehicles API/history change): expose current canonical complete first and
last names only when currently authorized, including inactive historical
subjects, never historical email/IDs. Recheck exact CA/LM Staff session and
viewer Organization/Location/capability/entitlement/current authority within
the same transaction with writer-compatible locks; CA MFA remains required.
The historical Parker requires coherent scoped completed Parking Task,
Dispatch COMPLETED and canonical Parking Audit, actor agreement and
`DispatchEvent.occurred_at` chronology. Missing/conflicting/duplicate/orphan
evidence or distinct maximal timestamp ties fail closed as `UNVERIFIABLE`;
the separate `PROVEN | NO_RECORD | UNVERIFIABLE` proof state and nullable
name-only history fields cannot change active Task assignment. This is
repository implementation authorization, **not** verified SQL/performance,
U-004 visual approval, merge/deployment or issue closure.

Full focused contract:
[DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md](decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md).

## DEC-103 — Issue #276 Audit evidence discovery index trial

Status: Accepted (design and isolated-test authorization only)
Date: 2026-10-09
Owner: VAYLET product owner

For the DEC-102 canonical history reader, the Owner approved the **direction**
of retaining the existing Audit session index plus testing two partial
`VALET_SESSION_PARKED` indexes on (Organization, entity ID) and
(Organization, JSON `taskId` reference) in a **verified disposable PostgreSQL**
database. Three same-Organization/page-scoped lookups must discover anomalous
null-linked entity/Task references and conservatively return `UNVERIFIABLE`
when inconsistent. Index existence is not performance or safety proof:
EXPLAIN, query-budget, authorization concurrency and SQL negative cases remain
mandatory. **No migration to shared QA/staging/production, data repair,
PR/merge or deployment is authorized** by this approval.

Full focused decision:
[DEC-103_ISSUE_276_AUDIT_DISCOVERABILITY_VALIDATION.md](decisions/DEC-103_ISSUE_276_AUDIT_DISCOVERABILITY_VALIDATION.md).

## DEC-108 — LocationAccess revocation and protected response delivery

Status: Accepted (Owner security contract; design and verification only under #333)
Date: 2026-10-31
Owner: VAYLET product owner

After canonical `LocationAccess` revocation commits, the former grant holder
must not receive protected data from that Location, including a request that
authorized before the revoke but has not finished delivering its protected
response. A reader may retain data from other currently authorized Locations.
DEC-023 session/logout handling is not a blanket in-flight Location-disclosure
exception. DEC-081 emergency/security disable remains strictly immediate for
new **and current** access, with affected sessions revoked. Existing role,
Organization, MFA, CAS, audit, tenant, operational and historical data rules
remain unchanged. RED Live Map and Visit Contact evidence must be assessed
against this now-accepted contract. **No runtime fix or deployment is approved**
under Issue #333 without a separate Owner GO.

Full focused contract:
[DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md](decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md).
