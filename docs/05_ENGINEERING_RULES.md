# Engineering Rules

Controlled production Staff Auth account creation uses the create-only
`@valet/api` `staff:provision` operator command accepted by DEC-029. It runs
outside API runtime source, accepts passwords only through non-interactive
stdin, uses `MIGRATION_DATABASE_URL`, and atomically creates the User,
membership, explicit Location access, and AuditEvent. It is not a signup or
general account-lifecycle API.

Status: Binding  
Version: 0.3

## Architecture

Use a modular monolith.

Do not create distributed services without an accepted decision.

## Backend ownership

Backend/domain layer owns business rules.

Clients may not:

- choose arbitrary ValetSession or Task state
- authorize themselves
- decide tenant/location ownership
- validate pickup codes / handoff secrets by themselves
- write audit/Black Box events directly
- manufacture payment/validation success
- decide tracking policy without server-authorized configuration

## PostgreSQL

PostgreSQL is the operational system of record.

Object storage stores vehicle images/attachments.

Redis is not required until a concrete need is demonstrated.

Migration/admin database credentials are not ordinary application runtime
credentials. Phase 2 application code must use a dedicated least-privilege
runtime role without schema migration or other DDL privileges.

In production, the API uses query-free `DATABASE_URL` with strict
certificate-verifying Node `pg` TLS configuration and must not receive
`MIGRATION_DATABASE_URL`. Application startup verifies the live backend's
`pg_stat_ssl` state plus the connected runtime role's flags, ownership and
`CREATE` capabilities before listening. Migration/provisioning uses the
separate admin URL through the exact accepted TLS-only query allowlist and must
verify its own encrypted backend before mutation. See accepted DEC-025 and the
provider-neutral production database deployment checklist.

Before Phase 2 commands rely on append-only AuditEvent or financial-history
guarantees, the project must make an explicit database privilege/enforcement
decision for those tables. Exact role provisioning and `GRANT`/`REVOKE` rules
remain a focused security task; feature code must not assume migration-owner
privileges are an acceptable runtime boundary.

## Time, currency and location context

- store DB timestamps in UTC
- server time is authoritative for operational mutations
- each Location owns the authoritative timezone used for operational display/reporting
- each Location owns its applicable currency/payment context
- an Organization may provide defaults but must not override a Location-specific timezone/currency
- convert dates/numbers for display according to locale/location context

## Validation

Use shared Zod schemas where a contract is shared between client/API.

Critical invariants must also be enforced in domain/database layers.

OCR/ANPR output is proposed input only. Confirmed/edit/manual input is the operational value persisted by the application.

## State ownership

`ValetSession` represents physical custody only.

Task/Hybrid Dispatch assignment lifecycle is separate.

Do not reintroduce task states such as assignment/acceptance as physical ValetSession states.

Protected state changes use explicit commands, guards and audited transactions.

### Protected custody command pattern

A protected custody command must:

1. derive tenant/resource scope from persisted authorized records rather than trusting client-supplied ownership identifiers
2. authorize active user, active membership, Location access and the command-specific role/permission
3. load and compare the current aggregate `version` for contested mutations
4. validate the exact current physical state and focused policy/domain guards
5. perform a conditional state/version mutation so a validation-to-write race cannot win
6. use one server-authoritative operation timestamp where the focused contract requires one
7. append the required AuditEvent/Black Box fact in the same transaction
8. commit mutation and audit together or roll both back
9. return an authorized representation rather than allowing the client to manufacture the resulting state

The first locked Phase 2 example is `complete-check-in`; its exact authorization, guard, concurrency, audit, retry and dependency contract lives in `04_VALET_SESSION_STATE_MACHINE.md` and must not be reinterpreted by API/UI code.

Optimistic `version` concurrency prevents stale contested writes but does not automatically provide transparent duplicate-request replay. If a command requires an exact retry to return the original successful response, use a focused durable operation/idempotency contract rather than claiming versioning alone is idempotency.

### Vehicle identity command boundary

Vehicle identity mutation is an explicit internal command scoped through a persisted ValetSession. The command derives Organization, Location, Vehicle and actor membership server-side; accepts only a human-confirmed plate or a DEC-020 temporary descriptor; and rejects mixed modes. OCR/ANPR metadata is candidate provenance only and never supplies the authoritative value without explicit human confirmation.

The shared normalization boundary preserves the human-confirmed raw plate after trimming, applies Unicode NFKC normalization to the canonical value, uppercases the canonical plate and country value, removes whitespace and obvious separator characters (`-`, Unicode dash punctuation, `.`, `/` and `\\`) from the canonical plate, and enforces Unicode-code-point input bounds. The final plate country must satisfy the existing two-letter uppercase `^[A-Z]{2}$` country-code contract; no country-specific plate-number validation is applied.

Corrections use the persisted Vehicle `updated_at` value as the explicit optimistic token. A successful conditional update advances that token monotonically; a stale token returns `VEHICLE_IDENTITY_VERSION_CONFLICT`. The tenant-scoped partial unique plate index is the final race-safe conflict arbiter and maps collisions to `VEHICLE_IDENTITY_CONFLICT`; application code must not auto-merge Vehicle records.

The Vehicle mutation and its required safe `AuditEvent` commit in one transaction or both roll back. ValetSession `version` is not used as a substitute for Vehicle identity concurrency.

### Intake session creation boundary

VAL-004E is an internal application command. It accepts a target Location, a stable intake operation ID, optional minimal Customer input and a VAL-004D vehicle identity; it does not accept client-supplied Organization, membership, session state, version or audit identity. The command derives Organization from the persisted target Location, derives the actor from the authenticated user and authorizes active `VALET_EMPLOYEE`/`VALET_SUPERVISOR` Location access without requiring an active Shift.

When Customer contact is present, the phone is NFKC-normalized, presentation separators are removed and the final value must satisfy the general E.164-compatible `+` plus 2-15 digit boundary with a nonzero first digit. Each new intake operation creates its own minimal Customer row. Phone equality is not an identity proof, so this command performs no Customer reuse, deduplication or merge; exact retries do not duplicate the row because they resolve through the durable operation record.

Confirmed plates use the shared VAL-004D normalization/confirmation boundary and resolve or create the same-Organization Vehicle through the existing partial unique plate index. A temporary descriptor always creates a distinct Vehicle. Neither path merges Vehicles or moves an existing session. The existing partial unique active-session index is the final race-safe arbiter for one non-`COMPLETED` session for the same Location and Vehicle.

The stable operation ID is scoped by Organization and stored with a SHA-256 fingerprint of the normalized material request. An exact retry returns the original created session without another Customer, Vehicle, ValetSession or AuditEvent; reuse with different normalized material returns `IDEMPOTENCY_CONFLICT`. The operation record contains no raw phone, plate, descriptor, guest credential or audit payload and is `SELECT`/`INSERT` only for the runtime role.

Creation starts exactly at `CHECKING_IN`, `version = 1`, with parking/key/assignment/later-transition fields unset. Customer, Vehicle, ValetSession, one safe `VALET_SESSION_CREATED` AuditEvent and the idempotency record commit in one transaction or all roll back. This command exposes no controller/public API and does not implement Complete Check-In.

### Guest secure access boundary

VAL-004F provides internal issue/rotate and revoke boundaries over the ValetSession Guest Access generation. DEC-064 T1 composes that staff lifecycle with legacy-bootstrap and durable Browser Session resolution. Staff mutations accept only authenticated User and ValetSession identifiers, derive Organization/Location/membership server-side, and require active `VALET_EMPLOYEE`/`VALET_SUPERVISOR` explicit Location access without an active Shift prerequisite.

Issuance uses exactly 32 CSPRNG bytes (256 bits) encoded as an unpadded 43-character base64url bearer token. The raw token is returned only by the successful issue/rotate result and is never persisted, logged or audited. Persistence stores `sha256:v1:` plus lowercase SHA-256 hex over the exact raw token UTF-8 string. Its fixed 24-hour lifetime remains only for bootstrap and staged unexchanged legacy clients. A successfully exchanged active Browser Session derives lifetime from the persisted visit and current generation, not that bearer expiry or polling activity.

Issue, rotation and revocation lock the ValetSession row and do not change physical state or `version`. Initial `ISSUE_OR_ROTATE` issuance replaces the VAL-004E disabled marker atomically, and the same ordinary intent rotates only a real active credential. Ordinary rotation cannot clear revocation: a real revoked credential requires the separately explicit `REISSUE_REVOKED` intent plus `expectedRevokedAt` exactly equal to the persisted millisecond-precision timestamp previously returned by revocation. `expectedRevokedAt` is an optimistic concurrency token, not authorization; explicit reissue still follows the normal employee/supervisor authorization path. The intent is rejected for a placeholder or active credential and any timestamp mismatch fails without mutation or audit. A valid explicit reissue writes a new hash/fresh expiry, clears revocation and is an intentional reactivation action. Rotate/reissue and first revoke advance the explicit credential generation and invalidate Browser Sessions derived from the prior generation in the same serialized transaction. Repeated revocation returns the original revoked result without another generation change or audit event. Row locking ensures stale exchange/resolve, ordinary rotation and explicit reissue cannot resurrect prior authority.

Guest request authentication accepts exactly one source: an unconsumed shape-valid legacy bearer during staged rollout or the current Browser Session cookie. Mixed sources fail closed and a failed source never falls through to a different visit. Browser resolution uses hash-only durable persistence, exact generation matching and the ValetSession as the parent serialization lock. Active authority has no fixed 24-hour server expiry; `COMPLETED` has only the approved 24-hour post-visit read/rating/receipt scope; `CANCELLED` is invalid. Malformed, unknown, expired, consumed, revoked and stale-generation credentials all use the same non-disclosing Guest invalid boundary. Resolvers expose only the exact internal authority needed by the downstream command; public Guest projections continue to exclude tenant/location internals, parking/key data, staff identity, audit data, coordinates and credential/verifier material.

Issue/rotation/revocation and their respective `GUEST_ACCESS_ISSUED`, `GUEST_ACCESS_ROTATED` or first `GUEST_ACCESS_REVOKED` AuditEvent commit atomically. Resolver reads do not append AuditEvent rows.

### Check-in condition and photo-policy command boundary

VAL-004G provides internal commands to append a `CHECK_IN` ConditionNote, append a correction that identifies the immediately superseded note, register private `CHECK_IN_CONDITION` VehiclePhoto metadata, and record the check-in condition-completion marker. These commands accept authenticated User and ValetSession identifiers, derive Organization/Location/membership server-side, and require active `VALET_EMPLOYEE`/`VALET_SUPERVISOR` explicit Location access without an active Shift prerequisite.

Every new mutation locks the ValetSession and rechecks that its physical state is exactly `CHECKING_IN`. Note content is trimmed, rejects Unicode control characters and is limited to 1,000 Unicode code points. Notes are append-only: correction creates a new same-session/same-tenant note linked to its target and never rewrites the original. The session row lock serializes correction chains while preserving the runtime role's intentionally insert-only access to `condition_notes`; only one direct successor may target a note, while a later correction may target that successor.

Photo registration stores private metadata only; it does not upload, fetch, validate bytes or mint a URL. The trimmed opaque storage object key is limited to 512 Unicode code points, rejects control characters and cannot be an `http:` or `https:` URL. Content type is trimmed, lowercased, limited to 127 Unicode code points and must be an `image/*` media type. The globally unique storage key is the retry identity: only an exact retry with the same Organization, Location, session, `CHECK_IN_CONDITION` purpose, actor and normalized content type returns the existing row without another AuditEvent. Any different reuse returns the generic `PHOTO_STORAGE_OBJECT_CONFLICT` result without disclosing the existing object's scope.

The effective typed photo policy is `Location.check_in_photos_required_override` when non-null, otherwise `Organization.check_in_photos_required`; therefore an explicit Location `false` overrides an Organization `true`. Completion permits zero condition notes. It requires at least one exact-session `CHECK_IN_CONDITION` photo only when the effective policy is true, then atomically sets both condition-completion fields without changing physical state or `version`. A repeated completion returns the original marker and appends no second AuditEvent.

The reusable VAL-004H guard evaluates the current effective policy and current qualifying-photo evidence independently from the historical completion marker. This keeps a later policy change visible without rewriting the persisted marker. Condition-note, correction, photo-registration and first completion mutations each commit with one safe AuditEvent in the same transaction; audit metadata excludes note content, storage keys and other evidence payload.

### Complete check-in command boundary

VAL-004H implements one dedicated internal command accepting only authenticated User ID, ValetSession ID and expected ValetSession version. It derives tenant, Location, actor and linked Vehicle from persistence; requires active `VALET_EMPLOYEE`/`VALET_SUPERVISOR` explicit Location access without an active Shift; and locks the session through guard evaluation, mutation, audit and commit. Under that lock, stale version is classified before invalid physical state.

The linked Vehicle is held stable with a share lock and must have either a complete, valid persisted known-plate triple or the DEC-020 all-plate-fields-absent plus non-empty temporary descriptor path. The command then reuses the VAL-004G locked guard: the condition marker is mandatory, a ConditionNote is not, and current effective photo policy—not historical marker-time policy—determines whether exact-session `CHECK_IN_CONDITION` evidence is required. Guest credential state and Customer/contact presence are not prerequisites and are not mutated.

The winning guarded mutation performs only `CHECKING_IN -> AWAITING_PARKING`, sets `checking_in_completed_at` and `updated_at` to one database-authoritative timestamp, increments `version` once and appends one `VALET_SESSION_CHECK_IN_COMPLETED` AuditEvent atomically. Parking, key, assignee, checked-in actor, condition evidence/marker, Vehicle, guest credential and downstream retrieval/dispatch/financial/incident/notification state remain unchanged. Retrying the old version returns `VERSION_CONFLICT`; retrying the refreshed version returns `INVALID_STATE_TRANSITION`, with no replay or duplicate audit.

### Check-in transport and performance boundary

VAL-004I exposes only the dedicated `/v1/staff/check-in` routes for the accepted VAL-004E through VAL-004H commands plus `GET /v1/guest/session`. Shared `@valet/contracts` Zod schemas reject unknown keys and never accept client-supplied authenticated User, Organization, membership, role, state, audit or server-timestamp authority. The default production staff-principal resolver fails closed until a real verifier is supplied; `X-User-Id` and equivalent client-trusted identity shortcuts are prohibited. Tests may replace this provider only through test-module dependency injection.

Every routed operation owns one safe correlation ID and exactly one operation measurement using a monotonic duration clock. Measurements contain only request ID, operation, outcome, duration, an optional stable error code and, for successful Complete Check-In, optional elapsed check-in time derived from the exact persisted session `created_at` and `checking_in_completed_at`. Instrumentation failure cannot roll back, replay or convert an already committed command into an HTTP failure. The roughly 15–20 second normal no-photo target is a measured product KPI/benchmark only, never a request timeout or rejection threshold.

Transport serializes explicit safe DTOs with UTC ISO strings and uses one centralized stable error mapping. The intake response includes the current authorized Vehicle `updated_at` token solely so the employee client can invoke the existing optimistic vehicle-identity command; no broad Vehicle read endpoint or new concurrency field is introduced. Complete Check-In remains exactly `CHECKING_IN -> AWAITING_PARKING` and transport does not pre-guess its guards.

## Errors

Use stable machine-readable codes, e.g.:

- `INVALID_STATE_TRANSITION`
- `INVALID_TASK_TRANSITION`
- `PARKING_SPOT_OCCUPIED`
- `KEY_SLOT_OCCUPIED`
- `RETRIEVAL_ALREADY_REQUESTED`
- `TASK_ASSIGNMENT_CONFLICT`
- `HANDOFF_VERIFICATION_FAILED`
- `HANDOFF_VERIFICATION_EXPIRED`
- `HANDOFF_VERIFICATION_CONSUMED`
- `HANDOFF_OVERRIDE_NOT_ALLOWED`
- `TENANT_ACCESS_DENIED`
- `LOCATION_ACCESS_DENIED`
- `VERSION_CONFLICT`
- `IDEMPOTENCY_CONFLICT`

Do not freeze exact error-code vocabulary in unrelated tasks; add stable codes with the focused feature contract.

## Logging

Never log:

- plaintext pickup codes / OTP-equivalent secrets
- passwords
- raw access/refresh/guest tokens
- payment card data
- provider secrets
- unnecessary customer/employee PII
- precise task-scoped GPS data in generic application logs

Use request/correlation IDs and safe operation identifiers.

## Configuration First

When a feature has an approved configurable operating policy, apply the documented precedence:

```text
Company default -> Location override
```

Do not hard-code normal customer-specific policy differences that the product marks configurable.

Do not solve Configuration First with one speculative untyped catch-all JSON settings object. Introduce typed configuration contracts in focused tasks.

## Testing priority

1. tenant/location isolation
2. ValetSession state-machine correctness
3. Task/Dispatch assignment/concurrency correctness
4. secure handoff
5. parking/key custody integrity
6. Black Box/audit integrity
7. concurrency/idempotency/offline retry safety
8. payment/validation callback integrity
9. guest access authorization / anti-abuse
10. tracking start/stop + privacy boundaries

## Offline-friendly operation

Offline-friendly employee actions are part of the sellable MVP reliability direction.

Before implementing full sync behavior:

- use idempotency keys / stable operation IDs for retryable mutations
- support client/device operation identity where needed
- define conflict behavior
- use optimistic concurrency on contested active entities
- distinguish locally accepted work from server-authoritative verification

Implement offline capability incrementally after the corresponding online domain command is stable; do not create a separate offline domain model that diverges from the online workflow.

Payment/handoff operations that require authoritative online verification need an explicit safe fallback. Never weaken verification silently because connectivity is unavailable.

## Internationalization

Frontend/domain contracts must not assume one country or language.

Support the approved direction for:

- Arabic + English
- real RTL/LTR
- E.164-compatible normalized phone representation where applicable
- multi-country plate input/normalization rules
- per-Location timezone/currency
- locale-aware date/number presentation

Country-specific plate normalization must be explicitly defined before code depends on it.

## Provider boundaries

Messaging, payment, object storage, OCR/ANPR and Maps providers should remain behind application boundaries/adapters where practical.

Core business rules must not depend on one commercial provider unless an accepted decision explicitly locks it.

## Guest T3 resilience amendment — 2026-10-08

The Owner-approved U-07 T3 policy is defined in
[GUEST_T3_POLICY_AND_EVIDENCE.md](GUEST_T3_POLICY_AND_EVIDENCE.md).
It supersedes historical Guest 180-request and anonymous 60-allocation budgets
only through the classified, server-authorized T3 admission boundary. Production
defaults to COMPATIBILITY and retains the 180 per-credential overlap floor until
T4 verifies the ACTIVE transition after all replicas and windows drain. Staff and
handoff proof thresholds remain unchanged. Limiter events gain an optional
`request_class` (A/B/C/D); historical NULL values conservatively consume every
class and the shared visit aggregate once bound. A nullable, validated visit HMAC
`group_key_hash` carries the budget across transport and credential reissue while
preserving original credential keys for mixed-version enforcement. Migration
preserves all
existing scopes and windows. Anonymous allocations use the separate shared
source scope `v1:guest-enrollment-address`. Runtime has no new direct DELETE,
TRUNCATE or credential-table authority. Cleanup remains fixed at older than
one DB-authored hour and is now bounded to 1000 SKIP LOCKED candidates per call.
PostgreSQL 17 server timeouts and validated finite pool/queue budgets follow the
same policy. No domain/audit/lifecycle or Customer presentation change is made.
