# DEC-042 — Secure Handoff Verification

Status: Accepted
Date: 2026-08-13
Task: VAL-006F — Secure Handoff Verification

## Context

Phase 4 has delivered guest Retrieval requests, shared Retrieval Dispatch,
protected Retrieval start/key checkout, and `RETRIEVING -> READY`. The existing
`HandoffVerification` persistence distinguishes proof acceptance
(`verified_at`) from terminal consumption (`consumed_at`), while the canonical
physical state machine requires an explicit `READY -> HANDOFF_PENDING`
transition before final release.

VAL-006F must activate and verify secure handoff without releasing the vehicle.
Final key release, Task/Request completion and `HANDOFF_PENDING -> COMPLETED`
remain VAL-006G.

## Decision

### 1. Scope and command boundary

VAL-006F owns:

- explicit staff initiation `READY -> HANDOFF_PENDING`;
- guest-bearer issuance and rotation of Standard verification material;
- staff verification through separate pickup-code and Dynamic-QR commands;
- exceptional supervisor override while already `HANDOFF_PENDING`;
- safe abort `HANDOFF_PENDING -> READY`.

Supervisor override never initiates handoff. It is invalid from `READY`. If the
current Retrieval Task owner is unavailable, the existing audited Dispatch
reassignment mechanisms must establish a new canonical owner before normal
initiation; override does not acquire a second state-transition responsibility.

### 2. Typed Standard-method policy

The effective Standard handoff method is typed configuration:

```text
Company default -> Location override

PICKUP_CODE | DYNAMIC_QR | EITHER
```

The Company default is `EITHER`; a nullable Location override takes precedence.
Supervisor override is exceptional and is not a Standard method-policy value.

The effective policy is evaluated when material is issued, when Standard proof
is verified, and again by VAL-006G at final release. A previously verified
Standard proof is insufficient after its method becomes disallowed. Policy
changes fail closed.

### 3. Authorization and operational ownership

Standard initiation and verification require:

- authenticated active staff identity;
- active OrganizationMembership in the session Organization;
- active Organization and Location;
- explicit access to the exact session Location;
- role `VALET_EMPLOYEE` or `VALET_SUPERVISOR`;
- an ACTIVE Shift at that Location;
- the one active `RETRIEVAL` Task in `IN_PROGRESS`;
- `Task.current_assignee_membership_id` equal to the acting membership;
- active RetrievalRequest status `ACCEPTED`.

The Task projection, not `ValetSession.current_assignee_membership_id`, remains
canonical operational ownership.

Guest issuance and rotation require the current authorized Guest Access context
for the same ValetSession and active-visit scope. During DEC-064 T1 rollout that
context is exactly one unconsumed legacy bearer or one current Guest Browser
Session; mixed authority fails closed. The request never supplies session,
tenant, Location, Task, membership or version authority. The 24-hour
post-`COMPLETED` Browser Session scope cannot issue or rotate proof.

Supervisor override is allowed only to an actively shifted, explicitly
Location-authorized `VALET_SUPERVISOR` at the exact session Location. It does not
require current Task ownership. `LOCATION_MANAGER` and `ORG_ADMIN` receive no
implicit field-custody override authority.

Abort is allowed to either the current eligible Retrieval Task owner or an
eligible same-Location `VALET_SUPERVISOR`. It always requires a trimmed reason
of 1–500 characters.

### 4. State and related lifecycle effects

Initiation requires exactly `READY`, `ready_at IS NOT NULL`, an `IN_PROGRESS`
Retrieval Task and an `ACCEPTED` RetrievalRequest. It sets
`handoff_pending_at`, changes state to `HANDOFF_PENDING`, increments the session
version once and preserves `ready_at`.

Issuance, rotation and failed proof attempts do not change ValetSession state or
version. Successful Standard verification and supervisor override leave state
`HANDOFF_PENDING` and increment the session version once.

Abort requires exactly `HANDOFF_PENDING`, consumes every unconsumed verification,
clears `handoff_pending_at`, returns the session to `READY`, preserves
`ready_at`, and increments the session version once.

Throughout VAL-006F:

- Retrieval Task remains `IN_PROGRESS`;
- RetrievalRequest remains `ACCEPTED`;
- no KeyCustody release occurs;
- no payment, release, completion, receipt or notification mutation occurs.

### 5. Standard proof generation and storage

Pickup codes are generated with cryptographically secure unbiased randomness,
are exactly four decimal digits including leading zeroes, and expire ten
minutes after issuance.

Dynamic QR proof is an opaque one-time 32-byte cryptographically random token,
encoded as unpadded base64url with the public prefix `vhq1.`. It embeds no
session, tenant, Location, Task, parking, key or employee details and expires
two minutes after issuance. VAL-006F returns opaque material for client QR
rendering and adds no QR image/provider integration.

Both methods allow exactly five attempts per issued verification. Raw proof is
returned only in a successful guest issue/rotate response. It is never stored,
logged, audited, traced or emitted in metrics.

Persistence uses a dedicated 32-byte deployment secret named
`HANDOFF_VERIFIER_HMAC_SECRET_B64URL`, separate from Guest Access and anti-abuse
keys. The stored verifier is a versioned, method- and session-domain-separated
HMAC-SHA-256 value. Comparison is timing-safe. Missing/invalid secret
configuration fails closed.

### 6. HandoffVerification lifecycle

A Standard row starts with `attempt_count = 0`, `max_attempts = 5`, its method,
verifier, expiry and null verification/consumption fields.

ValetSession locking serializes lifecycle decisions. At most one unconsumed
authoritative verification may exist for a session. No speculative active-row
index is added.

- ordinary issue rejects when an unconsumed row already exists and never
  re-exposes its plaintext;
- rotation consumes the prior unverified row before creating its replacement;
- a verified row cannot be rotated;
- rotation after expiry or attempt lockout is allowed subject to durable limits;
- attempts one through four increment the counter;
- the fifth invalid attempt increments to five and consumes the row;
- expired or newly policy-disallowed proof is terminalized and fails through the
  same non-disclosing verification boundary;
- successful verification sets `verified_at` and
  `verified_by_membership_id`, leaving `consumed_at` null for VAL-006G;
- abort consumes every unconsumed row, including a verified Standard row;
- supervisor override creates a verified `SUPERVISOR_OVERRIDE` row with actor,
  reason, no reusable secret and no expiry.

### 7. Attempts and durable anti-abuse

In addition to existing Guest Access perimeter limits:

- at most five issue/rotation creations per ValetSession in 15 minutes;
- at most ten failed Standard-proof submissions per ValetSession in 15 minutes,
  accumulated across methods and rotations.

Limiter keys are scoped HMAC values and never persist raw session, bearer,
proof, membership or address material. Limiter unavailability fails closed.
Authenticated business-rule failures do not consume guest-authentication-failure
budget. Proof failure accounting, row attempt mutation and required AuditEvent
must commit atomically before the generic error is returned.

### 8. API surface

Canonical endpoints are:

```text
POST /v1/staff/valet-sessions/:sessionId/initiate-handoff
POST /v1/guest/session/handoff-verification/issue
POST /v1/guest/session/handoff-verification/rotate
POST /v1/staff/valet-sessions/:sessionId/verify-pickup-code
POST /v1/staff/valet-sessions/:sessionId/verify-dynamic-qr
POST /v1/staff/valet-sessions/:sessionId/supervisor-override-handoff
POST /v1/staff/valet-sessions/:sessionId/abort-handoff
```

Staff mutations require `expectedSessionVersion`. Override and abort require the
bounded reason. Guest issue/rotate accepts only the selected Standard method
and derives the session from the bearer.

Guest secret responses are strict, `no-store`, and contain only guest-safe
session state, method, expiry and the one-time pickup code or QR payload. They
expose no verification/hash/version/tenant/Location/Task/staff/audit/parking/key
internals.

### 9. Errors and precedence

Transport validity and principal authentication precede business processing.
After authentication, commands derive and lock persisted scope, prove
operation-specific tenant/Location/ownership/role authority, check expected
session version, then evaluate Task/Request/session state, policy and proof
lifecycle before mutation.

Cross-tenant, wrong-Location and non-owner Standard operations remain concealed.
Wrong, expired, consumed, replayed, cross-session, method-mismatched and
policy-disallowed valid-shaped proofs share one non-disclosing verification
failure. Rate limits return a bounded Retry-After response. No error reveals
stored verifier or proof validity details.

### 10. Concurrency and retry

Commands lock the ValetSession before Task/Request/verification resources in a
consistent order. Expected session version is mandatory for staff mutations.

- concurrent issue/rotation yields at most one unconsumed authoritative proof;
- concurrent invalid attempts are counted exactly;
- verify/abort, verify/override and rotate/abort races serialize and the loser
  re-evaluates committed version/state/lifecycle;
- retrying successful verification with the old version conflicts; with the
  current version it reports already verified without proof comparison,
  mutation or duplicate audit;
- duplicate override/abort fails through version or state guards without
  duplicate history;
- any mutation/audit/limiter failure rolls back the full transaction.

### 11. Audit and privacy

Append-only AuditEvents record handoff initiation, proof issuance/rotation,
failed proof attempts, successful verification, supervisor override and abort.
They commit atomically with their protected mutation.

Audit metadata may contain method, safe state/version facts, attempt/max counts,
terminalization and the accepted bounded override/abort reason. It never
contains raw proof, stored verifier, bearer, Authorization, address, parking,
key or employee-private operational detail. Guest issue/rotation has no staff
actor; staff actions use the server-resolved membership and database time.

Guest progression while pending remains the existing guest-safe session
projection and reveals only `HANDOFF_PENDING`, never proof or operational
internals.

### 12. VAL-006G downstream release boundary

VAL-006F must expose an internal transaction-aware guard/query reusable by
VAL-006G. Given a locked session and database-authoritative operation time, it
returns release eligibility only when exactly one authoritative verification is:

- verified;
- unconsumed;
- for the same tenant/session;
- still unexpired when Standard;
- and its Standard method is still allowed by the current effective
  Company-default/Location-override policy;

or is a valid unconsumed supervisor override.

The boundary does not consume proof, release keys, complete Task/Request, or
change ValetSession state. VAL-006G owns those writes and must call this guard in
the same transaction before atomically consuming the verification and releasing
the vehicle. Policy changes fail closed.

### 13. Persistence impact

The existing HandoffVerification table and constraints remain unchanged.

VAL-006F adds exactly migration 22 to:

1. create typed `handoff_standard_method_policy` values `PICKUP_CODE`,
   `DYNAMIC_QR`, `EITHER`;
2. add non-null Company default `EITHER`;
3. add nullable Location override;
4. add durable handoff issuance/session-verification AntiAbuseEvent scopes.

Migrations 1–21 remain immutable.

### 14. Explicit exclusions

VAL-006F does not implement vehicle/key release, session completion,
Task/RetrievalRequest completion, payment/validation/tip behavior, messaging,
receipt/rating, UI, Dashboard policy editing, QR rendering providers, GPS/maps,
offline replay or V2/Enterprise handoff policy.

## Consequences

Secure proof activation is separated from both Retrieval movement and physical
release. Explicit initiation preserves the state-machine command boundary;
supervisor override remains exceptional rather than becoming a hidden second
transition. Dynamic policy evaluation makes configuration changes fail closed
at both verification and final release.

## Owner-approved U-07 / T3 amendment (2026-10-08)

See the canonical DEC-024 amendment and
[Guest T3 policy](../GUEST_T3_POLICY_AND_EVIDENCE.md). That amendment supersedes
historical Guest quota/allocation and address-reservation mechanics only for
T3 admission. It changes no credential, authorization, custody, business retry,
audit, foreground notification or handoff-proof contract in this decision.
