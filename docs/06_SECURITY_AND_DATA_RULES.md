# Security and Data Rules

Status: Binding  
Version: 0.3

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

## Black Box / audit / evidence

Operational history is append-only.

- protected domain mutation + required audit event commit atomically
- later corrections create new events rather than rewriting original facts
- operational/audit history is not hard-deleted through normal application behavior
- sensitive audit metadata must exclude secrets and unnecessary PII
- high-risk evidence lock/export behavior may be introduced with Incident/ClaimShield tasks

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
