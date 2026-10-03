# Security and Data Rules

DEC-029 provisioning is a controlled offline create-only boundary. It never
accepts passwords from argv/environment, never reuses or reactivates an
existing User, validates Organization and Location scope from persisted rows,
and writes one safe `STAFF_ACCOUNT_PROVISIONED` AuditEvent atomically. Creating
an `ORG_ADMIN` membership does not assert MFA or enable MFA-gated admin APIs.

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

Accepted DEC-025 makes the production database boundary fail closed. The API
uses query-free `DATABASE_URL`, strict Node TLS certificate and hostname
verification, optional secret-provided CA trust, and a live `pg_stat_ssl` plus
runtime-role capability/ownership preflight before traffic is served. The API
process must not possess `MIGRATION_DATABASE_URL`. The controlled
migration/provisioning boundary uses only exact `sslmode=require`,
`sslaccept=strict`, and optional `sslrootcert` parameters, verifies its actual
TLS backend before mutation, and requires distinct runtime/admin roles and
production passwords.

Repository checks cannot prove provider firewall/private-network topology,
secret-store configuration, backups, restore drills, or rotation ownership.
Those remain explicit deployment-verified gates in the provider-neutral
production database checklist and must not be marked complete without external
evidence.

## Staff authentication

VAL-004L implements DEC-023's PostgreSQL-backed opaque staff authentication.
Password verification accepts only the locked Argon2id profile and equalizes
unknown, malformed-hash and disabled-account work without accepting legacy
fallbacks. Access and refresh credentials each contain 256 CSPRNG bits, use
separate versioned formats and are persisted only as versioned SHA-256
verifiers. Access lasts at most 15 minutes; every refresh rotates both
credentials under row locks; consumed-credential replay revokes only the
affected 30-day non-sliding session family.

The refresh credential is host-only, Secure, HttpOnly, SameSite=Strict and
scoped to `/v1/staff/auth`. Login, refresh and logout require an exact approved
Origin and strict JSON transport. `User.status` is checked at login, refresh
and every access resolution. Authentication yields only `{ userId }`; current
membership, Organization, Location, role and permission remain server-resolved
authorization facts. Alternate client identity headers never override the
bearer credential and are not an authentication convention.

Accepted DEC-072 adds a separate native JSON transport under
`/v1/staff/auth/native/*` without changing that browser boundary. Native access
tokens are memory-only, and native refresh credentials may be stored only
behind the platform secure-storage adapter; native routes neither use the Web
cookie nor treat browser Origin, device metadata or a compiled client secret as
authentication authority. Both transports reuse the same `StaffAuthSession`,
rotation, replay, revocation and current server authorization authority.

MGT-BE-02 implements DEC-078 Company Admin TOTP MFA on the same
`StaffAuthSession`; it does not create a second principal or grant Management
authority by itself. Password-only sessions still do not assert MFA. MGT-BE-03
implements DEC-080 Company Admin Management authorization on top of that exact
session assurance; the current persisted User, active `ORG_ADMIN` membership,
active Organization and target ownership remain authorization inputs on every
protected use.

The factor contract is TOTP SHA-1, six digits, 30-second period with ±1-period
acceptance, issuer `VAYLET`, and a 20-byte random secret. Seeds are stored only in an `mte1`
AES-256-GCM envelope keyed by `MFA_TOTP_ENCRYPTION_KEY_B64URL`, which must be a
canonical 43-character unpadded base64url encoding of exactly 32 random bytes.
The authenticated User/factor identity is authenticated as encryption context.

Enrollment returns exactly ten one-time recovery codes. Each `vmr1` code contains
an 8-byte random selector and a 20-byte random secret. Persistence keeps the
selector plus an `mrv1` HMAC-SHA-256 verifier only; the HMAC key comes from
`MFA_RECOVERY_HMAC_SECRET_B64URL`, with the same 32-byte/43-character canonical
base64url key contract. Raw recovery codes are shown only in an authorized
issuance/reissue response and never stored in reusable plaintext.

Successful TOTP or recovery verification binds assurance to the exact active
factor and exact Staff session. Maximum assurance expires when age is
`>= 8 hours`; admin inactivity expires at `>= 30 minutes`; sensitive freshness
expires only when age is `> 5 minutes`. Expiry is a soft step-up, not logout.
Retiring/replacing the exact factor invalidates old session assurance even if
timestamps remain. Access/refresh rotation never slides MFA authentication or
admin-activity timestamps.

MFA verification reuses DEC-024's durable PostgreSQL anti-abuse machinery with
scopes `v1:mfa-totp-user` and `v1:mfa-recovery-user`, each limited to five
failure-capable attempts per User in the immediately preceding 15 minutes.
Database time and fail-closed limiter behavior remain authoritative; no
process-local MFA counter is accepted. TOTP replay additionally requires a
strictly advancing accepted time step, and recovery-code consumption is atomic
and single-use.

Authenticated MFA routes are under `/v1/staff/auth/mfa`: `GET /state`,
`POST /enrollment/begin`, `POST /enrollment/confirm`, `POST /step-up`,
`POST /recovery/begin`, and `POST /recovery-codes/reissue`. They preserve the
existing Web/Native Staff authentication transports and never accept client
User/session/role/MFA claims as authority.

Issue #234 keeps Account Security eligibility account/session scoped. An active
Staff User may manage Account Security when the server can prove at least one
ACTIVE `ORG_ADMIN` membership in an ACTIVE Organization. The currently selected
Organization, Location, workspace role, Location grant, Shift and commercial
`dashboardAccess` entitlement are not Account Security authority. A direct
`/security` entry therefore must not fabricate business scope or perform
Management discovery merely to render the shell. Any already-resolved business
labels/navigation retained by the browser are presentation only and never replace
server authorization.

Issue #240 / T05-B narrowly extends the same Account Security/MFA ceremony
eligibility to a User with at least one ACTIVE `LOCATION_MANAGER` membership in an
ACTIVE Organization because authorized LM staff role/status/grant commands remain
SENSITIVE. This changes no factor storage, assurance duration, freshness rule,
recovery mechanism, or Staff session model. MFA eligibility is not Company Admin
authority: each staff command still proves its operation-specific current
membership, entitlement, target role and complete Location-grant coverage from
persistence. `VALET_SUPERVISOR` and `VALET_EMPLOYEE` do not gain MFA ceremony
eligibility from T05-B.

For LM existing-staff management, a target is visible or mutable only when its
complete persisted grant set is non-empty and every target grant is also a current
LM grant to an ACTIVE Location. Mixed/outside, zero-grant, elevated-role and self
targets use the normal concealed denial. Directory filtering applies that boundary
before LIMIT. Protected writes serialize current actor/target/grant authority and
Location lifecycle state through commit; no first-page, first-100, submitted-ID,
selected-Location, or browser-cached authority proof is accepted.

The Dashboard may coordinate the non-secret MFA state for the current
identity/session generation, but provisioning secrets, TOTP inputs, recovery-code
inputs and raw recovery-code disclosures remain ceremony-local and ephemeral.
They must not be promoted into shared navigation/shell state or browser persistent
storage. A failed authoritative reread must not preserve an earlier `ASSURED`
presentation.

Sensitive-action freshness is independent of the ordinary `ASSURED` state. When a
protected Management action requires fresh sensitive assurance, the browser must
collect and submit a fresh TOTP even if the ordinary state read is `ASSURED`.
Successful verification does not replay the protected mutation. Authentication
reconciliation after a rejected write may refresh Staff credentials, but the
write itself requires deliberate explicit retry; generic automatic mutation replay
is prohibited.

Issue #234 itself did not change the production MFA endpoints, public
request/response contracts, database schema, persisted factor model, factor
algorithm/format or server eligibility rule. The later T05-B eligibility amendment
above is limited to active Location Managers and reuses those same endpoints and
persistence.

VAL-004M implements accepted DEC-024 as the shared PostgreSQL-backed anti-abuse
boundary. It uses exact rolling windows, database time, transaction-level
advisory serialization, HMAC-derived limiter keys and fail-closed 503 behavior;
process-local counters are never authoritative.

Enterprise SSO is deferred until its approved later phase.

### Issue #240 / T05-C invitation issuance

Pending User/membership are explicit and provide no protected authority. Null
password is restricted to pending accounts; login performs dummy-hash verification
and returns the same generic failure. Existing ACTIVE credentials are untouched.
Tenant invitations cannot reactivate global DISABLED accounts or expose another
tenant's membership/account state. Ordinary staff commands cannot bypass pending
activation or ownership proof.

Create/resend use current StaffSession, fresh sensitive MFA, Dashboard entitlement,
persisted CA/LM role policy and complete LM active grant coverage through commit.
The exact routes and durable operation semantics are recorded in Accepted DEC-081.
Only fresh successful issuance returns a raw 256-bit `vsi1` invitation link after
commit; persistence stores a purpose/version-separated SHA-256 verifier only.
Trusted `STAFF_ACTIVATION_PUBLIC_ORIGIN` must be a validated origin (HTTPS outside
local development); `/staff/activate#invite=...` carries the secret in a fragment.
Never derive this origin from request Host/Origin/forwarded headers. No delivery
provider or outbox. Invitation TTL is 24 hours, aligned with the existing one-time
guest credential lifetime; explicit resends serialize without an automatic loop.

Same operation/digest reconciles safe durable invitation facts without returning
the secret or issuing another generation. Different digest conflicts; explicit new
resend invalidates older unconsumed generations. Audit includes only actor/tenant,
target membership, operation/invitation/generation, role, count and safe outcome;
no names/email/token/link/verifier/password. Narrow command privileges protect
atomic issuance/audit and preserved generation history. T05-D must recheck private
current-proof eligibility under account/member/generation locks before any future
consumption; no public redemption, credential setup or UI is implemented here.

## Native push

Accepted DEC-073 makes Employee Native push a best-effort attention signal,
never authentication, authorization, synchronization or mutation authority.
The backend derives identity from the current `StaffAuthSession`, derives
tenant/Location/role/Shift/Task eligibility from persisted facts when creating
delivery rows and again before provider I/O, and suppresses ineligible sends.
Every receipt or tap authenticates/restores, refetches canonical server state
and requires a separate explicit protected command for any mutation.

Provider tokens are sensitive operational identifiers. A raw usable value may
exist only in dedicated least-privilege registration persistence because the
sender needs it; its versioned hash is equality/uniqueness support, not a send
substitute. Raw tokens, token hashes, provider credentials, Staff/session
identity and domain/guest/vehicle data must not enter payloads, ordinary logs,
AuditEvent, analytics, errors or metrics labels. Payloads use only the fixed
generic EN/AR allowlist in DEC-073. Provider credentials remain deployment
secrets, and push permission/delivery failure never weakens Employee workflows
or canonical polling.

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

Guest resolution accepts no Organization or Location input. It hashes the presented shape-valid token, requires the globally unique matching hash to be unrevoked and unexpired, and returns only session ID, public state, Vehicle make/model/color, `readyAt`, and the effective `guestVehicleReadyNotificationEnabled` presentation flag. Malformed, random, expired, revoked and rotated-old tokens share the same `GUEST_ACCESS_INVALID` code/message. No parking spot, key slot, membership/staff identity, internal Location/Organization, audit data, token/hash, GPS or exact parking location is returned.

VAL-004I wires the narrow guest resolver only at `GET /v1/guest/session`. It accepts the raw credential exclusively as `Authorization: Bearer <token>` and returns the existing guest-safe result. Query, body, cookie, path and alternate-header token transport are not accepted. Missing, malformed, random, expired, revoked and rotated-old credentials remain indistinguishable.

VAL-004M protects that route with a 60-failure trusted-client-address rolling window and a separate 180-request shape-valid-token rolling window. Guest address reservations become `COUNTED` only for authentication failure and `IGNORED` for success or token-limit rejection. Guest data is returned only after resolution and address finalization commit atomically. Staff login separately enforces 30 syntactically valid attempts per trusted client address and five failed credentials per normalized identifier. Successful staff identifier finalization commits atomically with session issuance and `lastLoginAt`; unknown, wrong-password, disabled and unsupported-hash outcomes are non-disclosing counted failures.

Limiter keys are versioned HMAC-SHA-256 values derived from a separate 32-byte secret with explicit scope separation. Raw/normalized email, raw/canonical address, guest bearer, password and Authorization never enter limiter persistence, AuditEvent or normal telemetry. Socket peer authority is used directly unless the immediate peer is inside an explicitly configured trusted CIDR; only then is one unambiguous `X-Forwarded-For` chain walked right-to-left. Limiter failure never falls back to unlimited access or process memory.

## Check-in API transport security

The dedicated check-in HTTP surface uses strict shared Zod contracts and injects the authenticated staff User ID only from the DEC-023 PostgreSQL-backed principal resolver. The resolver accepts only an unexpired, unrevoked `vsa1.` bearer whose current User is active and returns only `{ userId }`. No route accepts `authenticatedUserId`, Organization, membership, role, target state or audit authority. `X-User-Id`, `X-Staff-User-Id` and similar caller values are non-authoritative and cannot alter a valid bearer principal.

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

DEC-042 locks four-digit pickup-code expiry to 10 minutes and opaque 256-bit
Dynamic-QR expiry to 2 minutes. Both allow five attempts per issued proof.
Durable per-session limits allow five issue/rotation creations and ten failed
proof submissions across rotations per 15 minutes. Persistence uses a dedicated
32-byte handoff HMAC secret with method/session domain separation; it must not
reuse Guest Access or general anti-abuse secrets. Standard method policy is
evaluated again at verification and final release so policy changes fail closed.

Supervisor override:

- restricted role/permission
- mandatory reason
- explicit audit event
- cannot silently bypass vehicle/session mismatch or other configured blocking controls without an explicit accepted policy
- valid only after explicit `READY -> HANDOFF_PENDING` initiation
- limited to an actively shifted, explicitly authorized same-Location
  `VALET_SUPERVISOR`; manager/admin role names do not imply override authority

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

## Management settings and branding security

MGT-BE-05 Company Admin reads use the exact BE-03 `StaffSessionContext`, current
`ORG_ADMIN` membership/Organization/capability revalidation, and STANDARD MFA
assurance. Company and exact-Location settings/branding mutations use the same
authority plus SENSITIVE assurance and the BE-02 five-minute freshness policy.
Stale sensitive MFA is a soft `MFA_STEP_UP_REQUIRED`: it does not revoke the
base Staff session, does not mutate configuration, and does not append a success
audit. Normal Management activity may advance the existing admin-activity fact
but never slides `mfa_authenticated_at` or the fixed eight-hour assurance origin.

The pre-existing Location Manager Dashboard configuration and branding routes
remain separate authority. They continue to require active User, active
`LOCATION_MANAGER` membership, active exact Location, and explicit
`MembershipLocationAccess`; they require no Shift and receive no Company Admin
MFA requirement. Company Admin authority is never added to that userId-only
guard. Conversely, Company Admin exact-Location Management writes need no
`MembershipLocationAccess` because BE-03 Management authority is revalidated
server-side from the exact Staff session.

Every real MGT-BE-05 Company mutation writes one Organization-wide tenant audit
with `location_id = NULL` and the actual ORG_ADMIN membership actor. Every real
Location mutation writes one exact-Location tenant audit with the actual actor.
No-op desired-state convergence writes no duplicate audit and need not advance
CAS. Audit metadata is bounded/allowlisted; operating-hours values use a bounded
canonical week and never raw request/provider/secret payloads. Mutation and audit
commit or roll back together.

PostgreSQL authority stays narrow: runtime cannot generically update
Organizations/Locations, cannot arbitrarily write the normalized hours tables,
cannot execute private helpers, and receives no grant option. Reviewed
`SECURITY DEFINER` entry points have a fixed safe `search_path`, PUBLIC EXECUTE
revoked, closed setting allowlists, SQL-NULL rejection for SET, tenant/actor
revalidation, CAS, and same-transaction audit.

Mutable operational policy is re-read at the protected decision boundary. The
per-Organization settings advisory ordering makes committed policy changes
coherent with Check-In completion, Parking completion, Handoff financial
release, tracking start/GPS ingestion, OCR authorization, and notification
creation/final-send checks. Locks are not held across OCR/push/provider network
I/O. Policy changes are prospective and do not rewrite historical photos,
handoffs, payments, validations, GPS, custody, notifications, or audit facts.

Operating hours are informational only. OCR OFF blocks tenant OCR assistance but
not manual/no-plate Check-In; OCR ON never bypasses independent deployment,
provider, cost, or privacy gates. Parking Spot required is enforced only at
authoritative completion, with Zone-only persistence permitted when the policy
is false. The two notification toggles suppress only their real configured event
families; no templates, sender/provider credentials, routing, webhook, or
security-notification controls are exposed. Branding is name/color only, with no
logo/assets. MGT-BE-12 now adds current commercial authority above the existing
role/scope/MFA checks: protected Management/Dashboard use requires
`dashboardAccess`, and branding administration additionally requires
`basicBranding`. The read-only Company/Location subscription status surfaces
are intentional bootstrap exceptions so disabled/absent entitlement state can be
displayed without unlocking unrelated Management data.

## Management Audit reader security

MGT-BE-06 exposes only read-only tenant AuditEvent projections through
`GET /v1/staff/management/organizations/:organizationId/audit-events` and
`GET /v1/staff/management/organizations/:organizationId/locations/:locationId/audit-events`.
The reader never queries or unions `account_security_audit_events`, never reads
`raw_gps_samples`, and never writes an AuditEvent for either successful or denied
reads.

Company Admin Organization reads require the exact current Staff session,
STANDARD Management MFA assurance, active User, active `ORG_ADMIN` membership,
active Organization, and current `TENANT_AUDIT_READ_ELIGIBLE` semantics from
persistence. Organization scope may return both truthful Organization-wide rows
with `location_id = NULL` and Location-scoped rows in that same Organization.
Company Admin exact-Location reads revalidate same-Organization ownership; an
inactive Location remains readable as historical tenant data. Successful Company
Admin reads may advance the existing admin-activity timestamp but never slide
`mfa_authenticated_at`.

Location Manager has no Organization-wide Audit Explorer. Exact-Location reads
require a current active User/session/membership/Organization plus an explicit
current `MembershipLocationAccess` grant to that same-Organization Location.
DEC-094 historical-access semantics mean Location deactivation alone does not
hide its audit history while that current grant remains authorized. Supervisor
reads are narrower: the Location must be active, the explicit grant must still
exist, and the Supervisor must have an ACTIVE Shift at that exact Location.
Supervisor SQL admits only the reviewed operational event allowlist; Shift,
Incident, financial/provider, map/configuration, report, Staff-management,
Company-management, and unknown event families are excluded. Valet Employee and
Guest receive no general Audit Explorer.

Authorization facts used by the Location Manager/Supervisor path are held under
transaction-compatible row locks through the scoped read, and Company Admin MFA
and authority are likewise rechecked inside the read transaction. Every page
request therefore reauthorizes current persisted state; a cursor or client claim
never establishes Organization, Location, role, membership, or capability.

Public output is a typed safe projection, never `metadata_json`. All 78 current
tenant event types are explicitly classified and projected through bounded
allowlists. Membership actors expose only a tenant-safe membership reference;
non-membership actors expose only their safe type, and controlled operator
references are never returned. Raw contacts/plates, pickup or QR material, guest
tokens/hashes, MFA/recovery data, provider credentials/tokens or raw responses,
push tokens, storage keys, cash/private financial values, free-text reasons, raw
GPS/coordinates/routes, and arbitrary metadata keys are excluded. A future or
historical unknown event fails closed to a minimal envelope containing only its
event ID, occurrence time, already-authorized scope, `eventType = UNKNOWN`,
`details.kind = UNKNOWN`, and `entity = null`; it exposes no actor, internal raw
event type, entity expansion, or metadata. Unknown events are not returned to a
Supervisor.

Pagination is bounded keyset traversal ordered by `(occurred_at DESC, id DESC)`.
The opaque strict cursor binds route kind, Organization, Location or Organization
Location filter, event filter, the page boundary, and a database-authored first-
page `created_at` snapshot ceiling. Equal occurrence timestamps therefore use the
event UUID as a deterministic tie-breaker, later pages cannot cross scope/filter
boundaries, and rows appended after the first-page snapshot do not destabilize
the traversal. Migration 39 adds only the measured
`audit_events(organization_id, occurred_at DESC, id DESC)` chronology index; it
changes no runtime DML privilege and preserves the existing append-only audit
boundary.

## Management Location lifecycle security

MGT-BE-07 implements DEC-094 only for MFA-backed Company Admin Management. Every
create, lifecycle read, activate, stop-intake, deactivate, currency correction,
and timezone correction resolves the exact current `StaffSessionContext`,
revalidates current active `ORG_ADMIN`/Organization ownership and
`LOCATION_LIFECYCLE_MANAGE_ELIGIBLE`, and requires SENSITIVE five-minute MFA
freshness. Client Organization/Location/role claims never become authority, and
the routes use no-store responses.

The explicit HTTP surface is:

- `POST /v1/staff/management/organizations/:organizationId/locations`;
- `GET /v1/staff/management/organizations/:organizationId/locations/:locationId/lifecycle`;
- `POST /v1/staff/management/organizations/:organizationId/locations/:locationId/activate`;
- `POST /v1/staff/management/organizations/:organizationId/locations/:locationId/stop-intake`;
- `POST /v1/staff/management/organizations/:organizationId/locations/:locationId/deactivate`;
- `POST /v1/staff/management/organizations/:organizationId/locations/:locationId/currency-correction`;
- `POST /v1/staff/management/organizations/:organizationId/locations/:locationId/timezone-correction`.

Creation is retry-safe through a stable UUID `operationId` and immutable request
fingerprint. Other lifecycle/correction writes use `expectedUpdatedAt` as the
optimistic token; exact desired-state no-ops converge without another audit.
Successful real changes append one of `LOCATION_CREATED`, `LOCATION_ACTIVATED`,
`LOCATION_INTAKE_STOPPED`, `LOCATION_DEACTIVATED`,
`LOCATION_CURRENCY_CORRECTED`, or `LOCATION_TIMEZONE_CORRECTED` atomically with
the Location mutation. Those six event names are reserved by a database trigger:
ordinary runtime audit INSERT remains available for its existing bounded uses,
but direct runtime attempts to forge a lifecycle event are denied. This keeps the
`LOCATION_CREATED` operation-id ledger authoritative to the reviewed lifecycle
command boundary.

The representation is status plus intake gate. New Management-created Locations
are `INACTIVE` with `accepting_intake=false`; activation produces
`ACTIVE/true`; stop-intake produces `ACTIVE/false`; final deactivation produces
`INACTIVE/false`. A database CHECK rejects `INACTIVE/true`. Check-In holds the
shared Location lifecycle advisory boundary and requires both `ACTIVE` and
`accepting_intake=true`, so committed stop-intake fences new intake without
preventing existing custody work from finishing.

The same `location-lifecycle:<locationId>` transaction advisory key coordinates
Management lifecycle writes with protected operational paths that need the
Location to remain live, including Check-In, Shift eligibility/start, and Guest
Retrieval creation. Final deactivation takes the exclusive boundary and rechecks
only three drain blockers: a non-`COMPLETED` ValetSession, an `ACTIVE` Shift, or
a Task in `QUEUED`, `ASSIGNED`, `ACCEPTED`, or `IN_PROGRESS`. It never closes,
completes, cancels, or deletes those records to make the check pass.

Readiness is intentionally limited to supported Location currency and valid IANA
timezone. Currency/timezone correction is restricted to the safe boundary where
the Location is `INACTIVE`, intake is closed, and the same three blockers are
absent. Currency correction must keep the effective service fee exactly
representable. Timezone correction requires a bounded non-control reason and
returns explicit impact facts that historical timestamps and prior report facts
were not rewritten. Historical Location audit/Management reads remain available
under their existing authorization after deactivation.

## Black Box / audit / evidence

Operational history is append-only.

- protected domain mutation + required audit event commit atomically
- later corrections create new events rather than rewriting original facts
- operational/audit history is not hard-deleted through normal application behavior
- sensitive audit metadata must exclude secrets and unnecessary PII
- high-risk evidence lock/export behavior may be introduced with Incident/ClaimShield tasks

DEC-079 audit persistence has three trust boundaries. Location operational
events remain tenant AuditEvents with a real Organization and Location.
Organization-wide tenant events require a real Organization but store no fake
Location and no ValetSession. Account-authentication/security events use the
separate `account_security_audit_events` store, with no Organization/Location
columns and no tenant Black Box exposure.

New tenant audit rows may identify a same-Organization membership, Guest,
system/service, external provider or controlled VAYLET operator. A controlled
operator requires a dedicated bounded opaque operator reference; absence of a
membership is never interpreted as SYSTEM by itself. Historical rows are not
backfilled with guessed actor provenance. For compatibility with accepted
database-owned writers, an INSERT with a real membership and omitted actor type
is normalized to explicit `MEMBERSHIP`; no new row may persist a null actor type.

The ordinary runtime role has tenant-audit `SELECT` plus column-scoped `INSERT`
needed by existing/new application writers, but cannot insert the dedicated
controlled-operator reference or database-authored `created_at`, and cannot
`UPDATE`, `DELETE`, `TRUNCATE`, add triggers or take ownership. PUBLIC has no
tenant-audit access. Account-security tables grant the ordinary runtime no
direct table access: `USER`, `SYSTEM` and `ANONYMOUS` writes go through a
fixed-search-path SECURITY DEFINER append function. The generic
controlled-operator account-security append function is denied to runtime and
PUBLIC. Runtime therefore cannot manufacture controlled-operator provenance by
supplying table columns or selecting the privileged function directly.

MGT-BE-02 account-security outcomes use only
`MFA_TOTP_ACTIVATED`, `MFA_RECOVERY_CODE_USED`,
`MFA_FACTOR_REENROLLMENT_STARTED`, `MFA_RECOVERY_CODES_REISSUED`, and
`MFA_OPERATOR_RECOVERY`. TOTP/recovery runtime ceremonies use the ordinary
runtime account-security append boundary. No-code recovery is a controlled
operator action outside ordinary runtime and records `MFA_OPERATOR_RECOVERY`
through the privileged account-security boundary.

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

Database runtime provisioning enforces the append-only AuditEvent boundary and
must be rerun after the MGT-BE-01 migration so the new account-security function
grants are installed before the updated application runtime is started. The
migration role remains the schema/object owner; feature code must not treat its
privileges as the application runtime boundary.

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

### Employee Incident process-death recovery (DEC-077)

The Employee Native Incident command uses an actor-bound server recovery intent
plus a minimal encrypted device marker; it stores no durable command journal:

- Native durably confirms a minimal no-content marker (identity/scope metadata
  only) before any network mutation, then reserves the exact Incident ID on the
  server, and dispatches the recovery-enabled Incident POST only after a
  validated RESERVED response
- the marker and `incident_recovery_intents` row contain no userId, Incident
  body, description, type, severity, payload hash, credential, guest proof or
  navigation state
- cold start, reconnect and foregrounding issue the canonical recovery GET only;
  Native never automatically reserves, retires, posts or schedules replay
- success is shown only from the authoritative committed Incident row
  (`FOUND`); a lost response, rollback, disconnect or API outage never
  fabricates success
- the exact original OrganizationMembership, Organization, Location and
  ValetSession bind reservation, recovery read and explicit foreground
  retirement; a different actor or membership is denied without disclosure
- the server state is one-way `RESERVED -> RETIRED`; a migration-owned database
  transition guard makes terminal state, binding and timestamps immutable to the
  normal runtime role, and an expired reservation is terminal for admission
  forever
- the runtime database role receives only SELECT, INSERT on the binding columns
  and UPDATE on `state`; it cannot author timestamps, delete rows, manage the
  guard function or use DDL
- reservation, retirement and expiry emit no Black Box event; exactly one
  `INCIDENT_OPENED` remains atomic with an actual Incident commit
- recovery remains available to the exact original actor after Shift end or
  ValetSession completion without reopening custody, while a new
  reservation/Incident still requires current creation authority
- definitive logout, account replacement, membership retirement or authoritative
  scope loss securely purges the local marker; a failed secure purge fences only
  the Incident surface until cleanup succeeds
- the 24-hour local marker deadline is presentation metadata; authoritative
  online recovery still resolves the exact outcome and never invents absence


## Secrets

Use environment variables/secret manager.

Never commit production secrets, real API keys, raw verification codes or provider credentials.

MGT-BE-02 requires two independent server secrets before the API starts:

- `MFA_TOTP_ENCRYPTION_KEY_B64URL`: 32 random bytes, canonical unpadded
  base64url, exactly 43 characters; AES-256-GCM key for `mte1` TOTP envelopes
- `MFA_RECOVERY_HMAC_SECRET_B64URL`: independently generated 32 random bytes,
  canonical unpadded base64url, exactly 43 characters; HMAC-SHA-256 key for
  `mrv1` recovery verifiers

Neither key may be logged, committed, returned to a client, or reused as the
other key. Production provisioning must install both before the updated server
process is started.

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

## Management security boundary

Accepted DEC-078 through DEC-094 add these binding Management controls:

- Company Admin uses password + TOTP. Ten one-time recovery codes are stored
  only as safe verifiers. No SMS MFA or peer-admin recovery bypass exists.
- MFA assurance is bound to the exact Staff session: maximum eight hours,
  30-minute admin inactivity, and five-minute freshness for sensitive actions.
  Eight-hour and 30-minute boundaries expire at equality; sensitive freshness
  expires only after five minutes. Expiry is step-up, exact-factor replacement
  invalidates old assurance, and refresh rotation cannot extend assurance or
  activity.
- Account-security audit is separate from tenant audit. Organization-wide
  business events use their real Organization and null Location; fake Locations
  and per-tenant copies of account events are forbidden.
- Company Admin Management scope never grants operational check-in, parking,
  handoff, key movement, or custody authority. Raw route history requires an
  explicit separate authority.
- MGT-BE-03 Organization/Location selectors are bounded and keyset-paginated.
  Context uses an explicit selected `LOCATION` or `ALL_LOCATIONS`; the latter is
  a scope-selection foundation only and does not grant All Locations analytics
  or company-report fan-out.
- The Management context capability list is a typed response snapshot, not
  authority. Protected reads/actions revalidate current persisted User/session
  assurance, active `ORG_ADMIN` membership, active Organization, target
  ownership and capability-specific conditions. Cached context, frontend claims
  and selected IDs never substitute for those checks.
- Existing Location Manager Dashboard authorization remains governed by its
  existing Location grants. MGT-BE-03 adds the MFA-backed Company Admin path to
  authorized existing Location Dashboard/analytics/reports/export reads without
  removing that Location Manager path.
- Company Admin `LIVE_MAP_READ` is an allowed Management read for an active
  Organization-owned active Location and still follows effective tracking
  policy. Retained raw route history and map-setup/field mutations remain
  denied to Company Admin through this control plane.
- MGT-BE-03 added no database migration or commercial gate. MGT-BE-12 now
  composes current persisted OrganizationSubscription booleans into protected
  Management/Dashboard use without replacing tenant/role/MFA authorization.
- MGT-BE-11 Company analytics/reports are Organization-scoped Management reads,
  not authority inherited from a cached `ALL_LOCATIONS` selector. Each use
  revalidates the exact Staff session/MFA, active `ORG_ADMIN` membership, active
  Organization and the relevant `ANALYTICS_READ`, `REPORTS_READ` or
  `REPORT_EXPORT` capability from persistence. Caller-supplied Location IDs are
  not accepted as Company fan-out authority. MGT-BE-12 now additionally requires
  current `dashboardAccess` for reads and current
  `dashboardAccess + reportExports` for exports.
- MGT-BE-04 Staff directory/detail are Organization-scoped, bounded and
  minimized. T05-A directory identity is nullable membership-owned first/last
  names and globally authoritative User email, plus membership role/status/
  version and Location-access count; detail adds a bounded Location-grant
  projection. User IDs, phone data, Staff sessions, MFA material,
  other-Organization memberships/grants and operational responsibility are not
  exposed. Foreign membership lookup is concealed as unavailable, and these
  responses use no-store semantics.
- T05-A Staff directory applies tenant/authority, bounded literal name/email
  search and exact role/status/Organization-owned Location filters before the
  keyset LIMIT. User email joins precede LIMIT; grant counts follow page selection.
  V2 cursors contain a filter fingerprint, never readable search PII; no raw
  search terms or staff names/email are added to logs, audit or browser storage.
  Migration 37 adds the justified
  `organization_memberships_org_created_id_idx`,
  `valet_sessions_checked_in_state_location_idx`, and
  `incident_recovery_intents_member_state_expiry_location_idx` indexes for the
  directory and handover-blocker access paths; no additional Staff-management
  index should be inferred from this contract.
- MGT-BE-04 role/status/Location grant mutations require current persisted
  `ORG_ADMIN` authority and sensitive five-minute exact-session MFA freshness.
  The four tenant roles remain exactly `ORG_ADMIN`, `LOCATION_MANAGER`,
  `VALET_SUPERVISOR`, `VALET_EMPLOYEE`; no generic permission engine is created.
- Role, status and Location-grant commands share the monotonic
  `OrganizationMembership.version` CAS. Desired-state retries that would make
  no change converge without another version increment or duplicate tenant
  audit event; a different stale state conflicts. The database command boundary
  fails closed for `NULL` expected versions and `NULL` Location grant mode.
- Staff-management mutations serialize per Organization on the
  `staff-management-org` transaction advisory boundary. The last usable admin
  is an active `ORG_ADMIN` membership in an active Organization for an active
  User with an `ACTIVE` TOTP factor; a live session/recent step-up is not part of
  that availability definition. A normal demotion or deactivation cannot remove
  the last such admin.
- Normal access reduction is handover-safe. The affected scope is blocked by an
  active Shift; an assigned/accepted/in-progress Task; unfinished intake
  responsibility (`CHECKING_IN`, or `AWAITING_PARKING` before a Parking Task
  takes over); or an unexpired `RESERVED` IncidentRecoveryIntent. Location
  revocation checks only the requested Locations. Key custody uses the active
  Task as current operational responsibility; `KeyCustodyEvent` remains
  append-only history and is never rewritten to make an access change succeed.
- Persisted Location grants can be dormant under roles that do not consume
  them. Demoting an `ORG_ADMIN` while grants remain is rejected until the grant
  set is explicitly reconciled, so a role change cannot silently turn dormant
  rows into authority.
- Staff membership `INACTIVE` is tenant-scoped. It does not change the User or
  memberships in other Organizations and does not globally revoke unrelated
  sessions. Global User `DISABLED` remains a distinct controlled VAYLET
  security action.
- Controlled global disable runs through
  `pnpm --filter @valet/api staff:security-disable -- --operation disable-user --operation-id <uuid> --user-id <uuid> --operator-ref <ref>`
  with the protected migration credential. It changes the User to `DISABLED`,
  revokes every active Staff session for that User, disables and clears active
  Staff push registrations, and writes one controlled account-security audit
  event. It deliberately leaves Organization memberships, Shift/Task/intake,
  ValetSession, KeyCustodyEvent and IncidentRecoveryIntent truth unchanged for
  explicit operational recovery.
- Global disable, login issuance, refresh rotation and push registration share
  the per-User `staff-user-security` transaction advisory boundary. After a
  disable commits, queued/future login and refresh fail and no active push
  registration can be re-established from the disabled User's sessions. Exact
  disable retries converge by operation ID; changing the recorded operation
  facts under the same ID is rejected.
- Staff-management tenant audit and account-security audit remain separate.
  Changed role/status/grant commands append one Organization audit event in the
  same transaction; desired-state no-ops append none. Global User disable writes
  only controlled account-security history and does not fabricate per-tenant
  disable events.
- Migration 37 keeps authority columns behind the runtime-role boundary. Normal
  runtime has no direct DML authority over `users.status`, membership
  role/status/version, or membership Location-grant identity. It receives
  execute only on the three migration-owner staff-management command functions;
  helper functions and `PUBLIC` execution remain denied and the functions use a
  fixed safe search path.
- Audit, Customer/visit, integration, subscription, and report projections are
  allowlisted, bounded, tenant-safe, and reauthorize current persisted scope.
- MGT-BE-08 Visit Contact reads are authorized by visible ValetSessions, not by
  Customer or Vehicle Organization ownership alone. Company Admin reads require
  current STANDARD Management MFA and Organization authority. Location Manager
  reads require an active User/membership/Organization plus current exact
  `MembershipLocationAccess`; every search/history aggregate embeds that granted
  Location set before counting, selecting latest visits, projecting associated
  vehicles, evaluating ambiguity, or calculating Returning Contact. Revocation
  is rechecked on every request/page. Location status alone does not erase
  historical visibility while the exact grant remains current.
- Visit Contact search is purpose-limited: one strict mode per request, exact
  current Jordan Check-In phone normalization, exact authoritative plate
  normalization with country, or a 2–80 code-point NFKC name prefix. Control
  characters are rejected, SQL wildcard characters are escaped, result pages
  are capped at 50 (default 25), and there is no unrestricted browse, suffix
  phone match, fuzzy plate, fuzzy directory, or global E.164 widening.
- Search ambiguity is derived only from authorized visits. Duplicate normalized
  phone Customers remain separate `AMBIGUOUS` candidates and an inaccessible
  candidate cannot change a Location Manager's ambiguity/count/latest/vehicle/
  Returning Contact projection. Customerless Vehicle visits remain truthful
  Vehicle results. Public terminology describes vehicles/plates observed on
  visits and never ownership.
- MGT-BE-08 history uses a first-page database snapshot and descending
  `(ValetSession.created_at, id)` keyset traversal. Search/history cursors are
  version 1 base64url records bound to Organization, membership, normalized
  search or subject, snapshot and boundary; cross-mode, cross-Organization,
  cross-membership and cross-subject reuse fails validation. Authorization is
  still recomputed before every page. Phone/name search applies the cursor's
  first-page snapshot to Customer creation, authorized ValetSession existence,
  completed counts, latest visit and associated-vehicle derivation. A visit
  appended after page 1 therefore cannot create a later-page candidate or alter
  later-page visit-derived facts, while current Location grants are still
  revalidated for every request.
- Returning Contact is true only when the reference visit's normalized contact
  matches at least one strictly earlier `(created_at, id)` physically
  `COMPLETED` ValetSession inside the viewer's current authorized visit scope.
  The current visit, later visits, incomplete visits, plate-only recurrence and
  hidden Locations do not contribute. Equal timestamps use the persisted UUID
  tie-break and duplicate Customer rows do not require merging.
- Company Admin Visit Contact correction is limited to Customer display name and
  Jordan-normalized phone, requires `VISIT_CONTACT_CORRECT_ELIGIBLE` plus
  SENSITIVE five-minute exact-session MFA, and uses `Customer.updated_at` CAS.
  Stale CAS conflicts, same desired state is a no-op, concurrent differing
  corrections have one winner, and successful mutation plus audit is atomic.
  No historical ValetSession is relinked. Location Manager correction is absent
  because current accepted authority does not permit a Location-scoped manager
  to mutate an Organization-level Customer/Vehicle with cross-Location effects;
  Management plate correction is likewise absent because existing Vehicle
  identity authority does not grant that Management mutation.
- Migration 41 keeps Customer correction behind two narrow `SECURITY DEFINER`
  functions with fixed safe search path. PUBLIC/private-helper execution is
  revoked, runtime receives execute only on the two correction commands, and it
  receives no generic Customer UPDATE/DELETE or Vehicle DELETE authority.
  Correction audit uses `VISIT_CONTACT_NAME_CORRECTED` and
  `VISIT_CONTACT_PHONE_CORRECTED`; the BE-06 catalog knows both, Supervisor does
  not gain this Management family, and public audit details expose only the
  allowlisted corrected field/normalization category, never raw name/phone/plate.
- MGT-BE-01 migration 35 is a coordinated cutover: stop ordinary runtime audit
  traffic, apply the migration, rerun runtime-role provisioning, then start the
  updated application. Do not run old null-actor writers or an old pre-35
  runtime grant set against the migrated schema.
- MGT-BE-02 is migration 36. Deployment must provision both MFA keys, apply the
  migration with `pnpm --filter @valet/database migrate:deploy`, rerun
  `pnpm --filter @valet/database runtime:provision` (which performs runtime
  privilege verification), deploy the updated server, then smoke login,
  enrollment, step-up, recovery-code flow, and controlled operator recovery.
  This is an ordered deployment contract, not a zero-downtime claim.
- Controlled no-code recovery is performed only through
  `pnpm --filter @valet/api staff:mfa-recover -- --operation recover-totp --operation-id <uuid> --user-id <uuid> --operator-ref <ref>`
  using `NODE_ENV=production` and the protected `MIGRATION_DATABASE_URL`
  operator boundary in production; ordinary API runtime cannot invoke it.
- MGT-BE-04 is migration 37. After migration 36/MFA prerequisites are in place,
  apply migration 37 with `pnpm --filter @valet/database migrate:deploy`, rerun
  `pnpm --filter @valet/database runtime:provision` so the runtime receives only
  the reviewed staff-management function grants and current direct-DML revokes,
  then deploy the updated API and smoke directory/detail, one sensitive
  mutation, tenant deactivation, and controlled global disable/login-refresh-
  push denial. Do not serve BE-04 mutation traffic assuming migration-owner or
  stale runtime privileges are sufficient.
- MGT-BE-06 is merged to `main`; migration 39 supplies only the
  measured Management Audit chronology index and read-side implementation.
- MGT-BE-07 is migration 40,
  `20260917004000_mgt_be_07_location_management`. It adds the intake gate,
  inactive default, bounded Location-create retry index, measured partial
  ValetSession/Task drain-blocker indexes, and narrow lifecycle command
  functions. After migration, rerun runtime-role provisioning/verification before
  serving the new lifecycle routes. The existing Shift index remains the measured
  authority for the ACTIVE-Shift blocker; no speculative extra Shift index is
  added.
- MGT-BE-08 is merged on
  `main@8c01dd58098715ed5b3b03a2d16c77a241714657` as migration 41,
  `20260917004100_mgt_be_08_visit_contacts`; its Customer correction boundary
  still requires the reviewed runtime-role provisioning/verification.
- MGT-BE-09 adds `POST /v1/guest/session/rating` with strict body
  `{ rating: 1..5 }`, no query parameters and no-store response headers. The
  response contains only `valetSessionId`, `rating` and `ratedAt`. Session,
  Organization and Location are never caller-selected.
- Rating reuses the current Guest Access bearer and the existing shared
  `v1:guest-client-address` and `v1:guest-token` DEC-024 anti-abuse scopes in the
  same authentication/finalization pattern. Missing, malformed, duplicate,
  unknown, expired and revoked Guest authority remains non-disclosing; an
  authenticated business-rule failure does not become a guest-auth failure.
- The authorized ValetSession is locked before rating eligibility is decided.
  Both the application boundary and database command require `COMPLETED` plus
  non-null `completed_at`. Exact same-value retries return the original rating
  and `ratedAt`; competing/different values cannot overwrite the first persisted
  fact and fail with the safe rating-conflict boundary.
- Migration 42, `20260917004200_mgt_be_09_guest_rating`, keeps Guest Rating
  behind a function-only ordinary-runtime write boundary. Runtime has no direct
  table read or DML privilege and may execute only
  `guest_rating_submit(text, integer)`; the migration-owned function has fixed
  safe search path, PUBLIC execution is revoked, and the private immutable-row
  helper is not runtime-executable. Table UPDATE/DELETE is also rejected by the
  immutable-row trigger.
- Guest Rating creates no tenant `AuditEvent`. The immutable `guest_ratings` row
  is the authoritative rating source. Its `rated_at` is submission/receipt time,
  not a replacement for the later Location-local analytics visit-period
  semantics. MGT-BE-09 adds exactly one benchmark-justified scoped index on
  `(organization_id, location_id, valet_session_id)` for bounded Location cohort
  joins; it adds no other speculative period/rating-value index. Later analytics
  must justify any further read/index boundary from its actual bounded query.
- MGT-BE-10 / migration 43 makes the SLA target a Company Admin-only sensitive
  Location setting. Every write revalidates the exact current Staff session,
  active ORG_ADMIN membership, active Organization and exact Location, and uses
  the existing SENSITIVE MFA boundary where exactly five minutes remains valid
  and older proof requires step-up. Location Manager mutation authority is not
  widened. Requests are strict integer 30..3600 with Location `updated_at` CAS;
  exact desired-state retry is audit-free and stale differing state conflicts.
- Ordinary runtime keeps no generic Location configuration UPDATE. SLA SET/CLEAR
  is through two reviewed migration-owned `SECURITY DEFINER` commands with fixed
  safe search path and no grant option; PUBLIC/private helpers are closed. A
  database trigger derives each RetrievalRequest SLA snapshot under the shared
  settings serialization boundary and a second trigger rejects snapshot rewrite.
  Thus neither caller input nor a later target change can forge historical SLA
  applicability.
- A real target change appends exactly
  `MANAGEMENT_LOCATION_SLA_TARGET_CHANGED` atomically. Metadata is limited to
  Location-setting scope, SET/CLEAR operation, `slaTargetSeconds`, and previous/
  new configured values; bearer credentials, MFA material, contact/address and
  other PII are excluded.
- `/analytics/kpis` remains an authorized exact-Location, bounded, read-only
  Management projection using the Location timezone and one REPEATABLE READ
  snapshot. It exposes aggregate SLA coverage, controlled Incident counts,
  completed-visit handoff membership IDs/counts and distinct work-evidence
  counts; it exposes no Guest token/contact/Customer identity, GPS route, payroll
  or employee score. Historical work evidence does not consult mutable current
  role/status, so later access reduction cannot rewrite past operational truth.
- MGT-BE-11 Company analytics and report reads recompute from source in one
  REPEATABLE READ snapshot. Every persisted Organization Location participates,
  including inactive historical Locations, and each current persisted Location
  IANA timezone defines that Location's local period bounds. Coverage exposes
  total/active/inactive and timezone-boundary truth; missing metric/ratio evidence
  remains null or explicit coverage rather than fabricated zero. Finance remains
  grouped by immutable Payment currency, and Cars per Active Employee uses an
  Organization-wide distinct approved evidence cohort rather than summing
  per-Location employee counts.
- Company report export first composes that bounded source snapshot and renders
  deterministic hardened CSV/PDF bytes. A separate final transaction freshly
  reauthorizes `REPORT_EXPORT`, rechecks current `dashboardAccess` and
  `reportExports`, rederives and matches the requested period, hashes the final
  bytes, and appends exactly one
  `DASHBOARD_REPORT_EXPORT_GENERATED` event at Organization scope with
  `location_id = NULL`. Final reauthorization does not recompute the source
  snapshot. Revocation or other final authorization failure produces no
  successful generation audit and no successful artifact response; repeating a
  successful manual export intentionally creates a new audit event.
- The exact-Location export finalizer performs the same fresh current
  `dashboardAccess + reportExports` composition before its generation audit and
  artifact return. Revocation between render and finalization fails closed with
  no new audit on both Location and Company export paths.
- BE-11 enforces at most 500 timezone, currency, cash-reconciliation and Incident
  type groups; DAILY report activity is bounded to 16 Dispatch groups and five
  key-custody groups; rendered artifacts are limited to 5 MiB. CSV cells receive
  spreadsheet-injection/control hardening and PDF rendering is deterministic.
  No Company `byEmployee` handoff breakdown, Guest Rating, Returning Contact,
  raw contact identity, raw route/GPS data, credentials or provider secrets are
  emitted. Report artifacts are not persisted and automatic delivery remains
  deferred.
- Tenant users never manage provider secrets or commercial entitlements.
- Company Admin commercial status is a no-store read-only projection of exact
  persisted plan/status/three booleans (or null). Integrations are a no-store
  fixed `PLATE_OCR | STAFF_PUSH | DIGITAL_PAYMENT` projection with strict safe
  status only; no endpoint, project/account identifier, token, credential,
  device token or raw provider error is returned, and no provider I/O occurs to
  render status.
- Management entitlement lapse must never block field operation or the safe
  completion of a vehicle already in custody.
- Guest rating is guest-only, one through five, once per completed visit;
  contact recurrence never becomes proof of identity.

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
secrets only in memory. T05-E/F/G and email/SMS delivery are outside T05-D.

## T05-E Shift history read boundary

Management history list/detail/candidates revalidate the exact current session,
active actor User/membership/Organization and Dashboard entitlement. Company Admin
uses standard DEC-078 read assurance. Location Manager authorization belongs to
the Shift's current granted ACTIVE Location; target lifecycle/role/full grant
coverage is not required for a historical read. Predicates precede LIMIT and
direct detail conceals unauthorized rows. Both authorities' dedicated cursors
bind actor membership/authority scope, Organization and normalized filters.
Projection includes only current canonical staff identity/currentRole, Location
metadata and Shift status/timestamps. No cash, tokens, custody/task or audit blob.
The bounded employee candidate read uses this history authority. Browser state is
memory-only and fenced by identity/session/scope/filter/page/detail generations;
duration uses one local clock with no requests. See Accepted DEC-081 T05-E and
`docs/validation/ISSUE_240E_SHIFT_HISTORY.md`.

## Issue #240 / T05-F Force End security

The existing Staff MFA ceremony includes active Location Managers under DEC-081;
this does not confer Company Admin capability. Force End requires the exact
current Staff session and ACTIVE factor, sensitive age <=5 minutes, maximum age
<8 hours and idle <30 minutes, with no refresh extension. Current actor account,
membership, Organization and Dashboard entitlement are rechecked even on replay.
CA requires same-Organization Shift; LM requires its current grant at the Shift's
ACTIVE Location, independently of target-level staff-management coverage.

The reason is outer-trimmed, nonblank and bounded to 500 characters; Unicode is
preserved as text. Only dedicated SHIFT_FORCE_ENDED audit metadata stores it.
Typed authorized CA/LM audit may expose it; Supervisor's allowlist excludes this
event. Responses, errors, logs, telemetry, cursor identity and ordinary Shift
projections omit it. No raw request logging or arbitrary metadata projection.
Migration 054's narrow command is SECURITY DEFINER with fixed search_path and
PUBLIC denied; private guards are denied and runtime has no closure-table access.
One transaction preserves session/scope/Shift proof, blocks open assigned Tasks,
and atomically writes pending-cash closure and audit. Unknown transport outcome
uses the same operation identity only after fresh proof and explicit retry.
No Force Start, impersonation, cash settlement or automatic Task/Session mutation.

## Issue #255 — terminal intake authority

DEC-097 requires current exact self-owned membership, Organization/Location/access/Shift eligibility before cancellation or status disclosure, including terminal convergence. Expected Shift and version are selectors, never authority. Both Guest resolvers reject CANCELLED before projection; locked staff token issuance fails with GUEST_ACCESS_INTENT_CONFLICT before any generation/write/audit. No automatic credential revocation. Cancellation audit contains only lifecycle state/version facts. Transient client intent is memory-only and fenced by full owner/generation/revision.
