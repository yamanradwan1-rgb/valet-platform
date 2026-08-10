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
