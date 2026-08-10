# Security and Data Rules

Status: Binding  
Version: 0.4

## Priority threats

- unauthorized vehicle release
- cross-tenant or cross-location data exposure
- guessed/stolen guest access link
- pickup-code brute-force/reuse
- employee account/session misuse
- privileged admin misuse
- evidence/Black Box tampering
- public vehicle photos or sensitive exports
- fraudulent payment callbacks/refunds
- cash/validation manipulation
- unsafe GPS/session tracking or privacy overreach
- duplicate offline/retry mutations
- loss of audit history

## Transport and infrastructure

- TLS for production network traffic.
- Least privilege for database/cloud identities.
- migration/admin database credentials are separate from ordinary application runtime credentials
- application runtime uses a dedicated least-privilege database role without schema migration or DDL privileges
- append-only AuditEvent and financial-history persistence requires an explicit database privilege/enforcement decision before Phase 2 commands rely on that guarantee
- exact database role provisioning and `GRANT`/`REVOKE` policy remains a focused security task; it is not inferred from migration-owner access
- Production secrets stay outside source code in environment/secret management.
- Encrypted backups and a documented/tested restore procedure are required before production readiness.
- Central error/monitoring must avoid unnecessary PII/secrets.
- Dependency/security scanning and incident-response procedures are part of production hardening.

## Staff authentication

- secure password hashing using Argon2id or approved equivalent
- short-lived access token
- rotated/revocable refresh/session mechanism
- account disable support
- device/session revocation support as staff authentication matures
- production Company Admin requires MFA
- production VAYLET Super Admin requires MFA

Enterprise SSO is deferred until its approved later phase.

## Roles and authorization

Follow least privilege.

Current tenant membership roles:

- `ORG_ADMIN` = Company Admin
- `LOCATION_MANAGER`
- `VALET_SUPERVISOR`
- `VALET_EMPLOYEE`

Guest/Customer is not a staff membership. VAYLET Super Admin is platform-level. Venue Client requires restricted authorized location visibility; its exact persistence model remains a dedicated decision.

Protected operations verify, as applicable:

1. authentication / guest token validity
2. tenant/platform scope
3. organization membership
4. location access
5. role/permission
6. resource ownership
7. active policy/guard

Cross-tenant access is a critical defect.

Sensitive actions such as override, refund, role change, data export and incident close require audit with actor/time/reason where appropriate.

### `complete-check-in` authorization boundary

The Phase 2 `complete-check-in` command follows least privilege and the exact contract in `04_VALET_SESSION_STATE_MACHINE.md`:

- authenticated active staff User
- active same-Organization membership
- active Organization/Location for normal operation
- explicit access to the session Location through the accepted location-access model
- ordinary operational role limited to `VALET_EMPLOYEE` or `VALET_SUPERVISOR`
- same-tenant/same-location resource ownership verified from persisted records

`LOCATION_MANAGER` and `ORG_ADMIN` do not automatically gain this field-operation permission from broader management scope. A future permission-set feature may grant equivalent permission explicitly.

An active Shift is not a hard authorization prerequisite for this command. The actual completing membership is still required in the AuditEvent so an imperfect Shift state cannot erase actor accountability.

Unauthorized requests must not disclose the existence or detailed state of a cross-tenant resource merely to return a more specific command error.

### Vehicle identity field-operation boundary

The internal vehicle identity command applies the same field-operation authorization boundary through the persisted ValetSession: active User, active same-Organization membership, active Organization/Location, explicit Location access, and `VALET_EMPLOYEE` or `VALET_SUPERVISOR`. `LOCATION_MANAGER` and `ORG_ADMIN` have no implicit permission, and an active Shift is not required.

Caller-supplied tenant, Location, membership, role or Vehicle ownership is not trusted. A foreign or missing session produces the same non-disclosing tenant-access response. Same-Organization plate conflicts return only `VEHICLE_IDENTITY_CONFLICT` and do not expose the conflicting Vehicle; matching plates in different Organizations remain isolated.

OCR/ANPR candidate metadata is neither identity nor authorization evidence. Only explicitly human-confirmed input may write canonical plate fields. Audit metadata records the identity mode, set/correction kind and normalization version, but excludes raw/canonical plate text, temporary descriptor text and OCR payloads.

Vehicle identity mutation and the required Vehicle-scoped AuditEvent are atomic. Stale optimistic tokens, validation errors, authorization failures, uniqueness conflicts and audit failures leave no partial identity mutation or orphan event. Automatic Vehicle merge/relink behavior is prohibited.

## Guest access

MVP does not require customer passwords or an account.

Primary access is secure phone-based WhatsApp/SMS link, with QR fallback where needed.

Use:

- cryptographically unguessable scoped token
- session-specific authorization
- expiry/revocation policy
- only guest-safe actions/data
- anti-abuse/rate limiting on externally usable guest endpoints

Never expose exact parking coordinates, internal employee-only data or key-slot identifiers to the Guest.

Raw guest bearer tokens must not be stored in logs/audit metadata.

The existence of hashed guest-access fields on ValetSession is a persistence foundation, not permission for check-in commands to manufacture, return, log, or audit raw bearer tokens. Guest issuance/authorization semantics remain a focused Phase 2 task.

VAL-004E satisfies those required persistence fields with an interim disabled marker for a newly created session: no bearer credential or usable preimage is generated, the marker is both expired and revoked at the session creation timestamp, and neither the result nor the AuditEvent contains it. VAL-004F must replace that disabled state through its own secure issuance contract before any guest access is possible.

VAL-004F replacement uses 256 bits of Node CSPRNG entropy encoded as unpadded base64url. Only the successful authorized issue/rotate result receives the raw bearer token, once. The database stores only `sha256:v1:` plus SHA-256 of the exact raw UTF-8 token string; no raw, reversible or encrypted token copy is persisted. The MVP credential expires 24 hours after the database-authoritative issue/rotation time.

Issue/rotation/revocation require an active User, active same-Organization membership, explicit session-Location access and an operational employee/supervisor role. They lock the ValetSession row and atomically mutate the credential with one safe AuditEvent. Initial `ISSUE_OR_ROTATE` replaces the disabled marker and rotates only a real active credential. It cannot reactivate a real revoked credential: post-revocation access requires the separately explicit `REISSUE_REVOKED` intent and the exact persisted `revokedAt` value previously observed from revocation. This expected timestamp is only an optimistic concurrency token and grants no authorization; the normal authorized path still applies. The intent is rejected unless a real credential remains revoked at that exact timestamp. Row locking plus this comparison prevents stale ordinary rotation and stale explicit reissue from clearing or becoming valid because of a concurrent revocation. Revocation preserves the hash, sets server time, and repeated revocation returns the existing timestamp without another audit. Physical session state and version never change.

Guest resolution accepts no Organization or Location input. It hashes the presented shape-valid token, requires the globally unique matching hash to be unrevoked and unexpired, and returns only session ID, public state and Vehicle make/model/color. Malformed, random, expired, revoked and rotated-old tokens share the same `GUEST_ACCESS_INVALID` code/message. No parking spot, key slot, membership/staff identity, internal Location/Organization, audit data, token/hash, GPS or exact parking location is returned.

VAL-004I wires the narrow guest resolver only at `GET /v1/guest/session`. It accepts the raw credential exclusively as `Authorization: Bearer <token>` and returns the existing guest-safe result. Query, body, cookie, path and alternate-header token transport are not accepted. Missing, malformed, random, expired, revoked and rotated-old credentials remain indistinguishable. Rate limiting and broader anti-abuse provider integration remain explicit later production-reliability work; no in-memory limiter is claimed here.

## Check-in API transport security

The dedicated check-in HTTP surface uses strict shared Zod contracts and injects the authenticated staff User ID only from an injectable server-side principal resolver. The default production resolver always returns an authentication failure because no accepted production verifier exists yet. No route accepts `authenticatedUserId`, Organization, membership, role, target state or audit authority, and no `X-User-Id` convention exists.

All new responses carry a bounded ASCII-safe `X-Request-Id`; malformed optional inbound values are replaced with a server UUID rather than reflected. Stable errors repeat the same request ID and never expose SQL, constraint names, stacks, credentials or request bodies. Metrics exclude Authorization, raw tokens, phone, plates, descriptors, note text and storage keys. A raw guest token may appear only in a successful authorized issue/rotate/reissue response and remains hash-only in persistence.

## Secure handoff

Standard MVP verification accepts either:

- Dynamic one-time QR
- 4-digit pickup code

Security controls:

- cryptographically secure secret generation
- short/appropriate expiry
- store only a hash or non-reusable verifier representation
- attempt limit for pickup-code entry
- rate limit / anti-brute-force protection
- single use
- consumed verification cannot be reused
- no plaintext pickup code/QR secret in logs/audit metadata

Supervisor override:

- restricted role/permission
- mandatory reason
- explicit audit event
- cannot silently bypass vehicle/session mismatch or other configured blocking controls without an explicit accepted policy

Enhanced/high-security handoff policies are later configuration/enterprise work unless a pilot explicitly requires them.

## Vehicle condition photos / attachments

Photos are optional by default according to Blueprint v1.0 and may be required by Company/Location policy.

When captured:

- private S3-compatible/object-storage bucket
- short-lived signed URLs or authorized backend proxy
- MIME/type/size validation
- ownership/tenant authorization
- never publicly enumerable
- preserve evidence integrity
- sensitive incident evidence download/export should be auditable

Do not invent a legal retention period. Retention must later be configurable/contract-aware where required.

VAL-004G evaluates the typed Company-default -> nullable Location-override photo policy from locked persisted rows. An explicit Location `false` overrides a Company `true`; otherwise the Company default applies. Current-schema `CHECK_IN_CONDITION` VehiclePhoto rows contain client-declared metadata only and are not qualifying evidence for a required-photo policy. The condition-completion marker is historical evidence and is not treated as proof that a later current policy remains satisfied.

The VAL-004G registration boundary stores authorized private object metadata only. Registration does not verify an object or promote metadata into trusted evidence. It does not upload or fetch bytes, trust MIME metadata as byte validation, create public URLs or expose the object key through AuditEvent metadata. The opaque storage key is never a client-fetchable URL, and globally conflicting reuse returns a non-disclosing domain conflict. Required-photo completion remains unavailable until a server-controlled verification boundary exists. Actual upload authorization, byte sniffing, size enforcement, malware scanning, signed access and lifecycle/retention remain later object-storage work.

## Black Box / audit / evidence

Operational history is append-only.

- protected domain mutation + required audit event commit atomically
- later corrections create new events rather than rewriting original facts
- operational/audit history is not hard-deleted through normal application behavior
- sensitive audit metadata must exclude secrets and unnecessary PII
- high-risk evidence lock/export behavior may be introduced with Incident/ClaimShield tasks

For the VAL-004C intake evidence tables, the ordinary application runtime role
has only `SELECT` and `INSERT` on `condition_notes` and `vehicle_photos`.
`UPDATE`, `DELETE` and `TRUNCATE` are denied so corrections append new evidence
instead of mutating or removing the original row. Migration/admin ownership
remains separate from this runtime boundary.

The VAL-004E `intake_operations` record is likewise `SELECT`/`INSERT` only for
the ordinary runtime role. Its Organization-scoped operation key and normalized
request fingerprint provide durable retry identity without persisting raw
customer contact, plate/descriptor input, guest material or audit metadata.
Changing or deleting that record is not a supported application correction.

Intake creation derives Organization from the target persisted Location and
requires an active authenticated user, active same-Organization membership,
explicit Location access and an operational employee/supervisor role. It never
trusts client-supplied tenant, membership, state, version or audit identities.
The optional Customer, resolved/created Vehicle, disabled guest fields,
`CHECKING_IN` ValetSession, `VALET_SESSION_CREATED` AuditEvent and operation
record commit atomically. Phone equality never authorizes Customer reuse or
merge, and confirmed Vehicle reuse remains constrained to the same Organization.

For `complete-check-in`, the winning state/version mutation and `VALET_SESSION_CHECK_IN_COMPLETED` AuditEvent must commit in one transaction. The event uses the authorized completing membership, same Organization/Location/session scope, server-authoritative time, and safe transition/version metadata only.

A stale-version retry or a later attempt from a non-`CHECKING_IN` state must not append another check-in-completed AuditEvent.

The current AuditEvent schema provides the history record but database-level append-only enforcement for the ordinary Phase 2 runtime role still requires the explicit privilege/enforcement task identified by VAL-003P. Feature code must not treat migration-owner privileges as the production runtime boundary.

Full ClaimShield evidence-package workflow is V2; basic Black Box and incident evidence integrity are MVP requirements.

## Maps, GPS and employee privacy

Blueprint v1.0 approves Maps + configurable session tracking for active vehicle tasks.

Default privacy rule:

- tracking is tied to active Parking/Retrieval tasks
- tracking is not continuous for the employee's entire Shift by default
- start/stop must follow approved task/session state + Location policy
- Guest never sees exact coordinates
- route history/geofence storage and retention follow configured/legal policy
- privacy notices/customer contracts must accurately describe the tracking behavior before production use

Do not expand task-scoped tracking into general employee surveillance without a new explicit decision.

## Payments, cash, validation and refunds

Use an external PCI-compliant/tokenized provider where practical.

- never store raw PAN/CVV
- never store reusable provider payment tokens, credentials, secrets or raw callback payloads in financial/audit records
- Payment copies Location currency and explicitly separates service amount, current customer amount due, amount paid and tip
- Customer Pays/Venue Pays is a controlled service-responsibility value, not a Venue Client identity or settlement account
- Validation history is first-class; superseding corrections append a row and retire only the current marker
- tip remains a Payment field and has no payroll/distribution semantics
- verify callback signatures before accepting provider events for processing
- deduplicate callbacks with unique `(organization_id, provider, provider_event_id)` persistence and make financial mutation + processing result + required AuditEvent atomic
- provider and provider reference are present only for digital flows under the accepted nullable/uniqueness rules
- cash receipt/correction uses append-only CashEntry rows with same-tenant actor, server time and unique submission idempotency key
- cash adjustments require a non-empty reason and appropriate permission/audit; earlier cash entries are never edited
- shift cash close/reopen, drawer management and advanced settlement are deferred rather than approximated by a general ledger
- Valet Employee cannot issue refunds
- Refund is append-only and requires authorized same-tenant actor, positive amount, non-empty reason, server timestamp, entity-specific idempotency key and audit
- refund amount aggregation is enforced in a locked transaction so pending/successful refunds cannot exceed amount paid; role and aggregate authorization are not delegated to a row CHECK
- financial records use restrictive relationships and are not hard-deleted through normal application behavior

Exact provider/compliance obligations depend on the first market and provider contract.

## Offline/retry safety

Offline-friendly employee actions are part of the sellable MVP direction.

Design protected mutations with stable IDs/idempotency/request/device context so reconnect/sync does not create duplicate sessions, requests, tasks, payments or custody events.

Optimistic aggregate versioning is necessary for contested state changes but is not equivalent to durable command idempotency. `complete-check-in` is protected against duplicate state/audit mutation by its conditional state+version transition; transparent replay of the original success requires a later focused durable operation-ID contract if the offline client needs that behavior.

Operations that require authoritative online verification, such as certain payment/handoff steps, must use an explicitly documented fallback; never silently weaken security when offline.

## Secrets

Use environment variables/secret manager.

Never commit production secrets, real API keys, raw verification codes or provider credentials.

## Privacy minimization

Collect only data needed to run/support the valet operation.

Typical MVP data may include:

- guest phone/contact token when used
- vehicle/plate data
- session/task/custody history
- optional condition photos
- task-scoped GPS/route data when policy enables it
- external-provider payment references/status
- incidents/audit

Do not add identity documents, unrelated profiling or continuous location tracking without explicit approval.

## Retention and residency

Retention must be configurable/contract/legal-policy aware for categories such as:

- vehicle photos/evidence
- guest contact data
- route/GPS history
- audit history
- payments/refunds/validation
- incidents/claims

Blueprint v1.0 does not define universal legal retention or residency periods. Do not invent them.

Country/client-specific data residency, messaging consent and local legal requirements require local review before commercial launch.

## Security operations / launch hardening

Before production/paid-customer readiness, plan and verify as applicable:

- authentication/authorization tests
- tenant-isolation / IDOR tests
- guest endpoint rate-limiting tests
- webhook signature/idempotency tests
- backup restore drill
- monitoring/alerting for login/admin/payment/messaging anomalies
- permission review for larger customers
- rollback/release procedure
- incident-response runbook
