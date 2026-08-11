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

## DEC-024 — Shared Durable Anti-Abuse Boundary

Status: Accepted
Date: 2026-08-10

> Binding decision for VAL-004M. Before implementation changes are committed, this accepted decision must also be copied into `docs/08_DECISIONS_LOG.md` without semantic changes so the repository authority order remains intact.

## Context

Phase 2 now exposes two production-sensitive public boundaries that need shared anti-abuse protection:

- staff password login at `POST /v1/staff/auth/login`;
- guest bearer resolution at `GET /v1/guest/session`.

DEC-023 already requires no more than five failed staff credential attempts per normalized identifier in a rolling 15-minute window and no more than 30 staff login attempts per trusted client address in a rolling 15-minute window. Guest access separately requires externally usable rate limiting without persisting or logging raw bearer tokens.

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
