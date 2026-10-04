# DEC-099 — Shift Presence Foundation

Status: Accepted
Date: 2026-10-04
Owner: VAYLET product owner
Task: Issue #257 / GPS-A
Base: 057b271a7f8f6d46f8e88a94035a9aa7e8763ef7

## Authority and scope

The owner-approved 2026-10-03 U257-P/D/A/R/H bundle in
`docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`, the GPS-A execution
instruction and the 2026-10-04 U257-RETENTION approval authorize this foundation.
The numeric non-retention values below are bounded technical parameterization
authorized by the execution instruction. They are not pilot activation defaults
or evidence of physical GPS reliability. No product direction is reopened.

Affected entities: Organization, Location, OrganizationMembership, Shift and
dedicated ShiftPresenceZone/Operation/Challenge/Decision/Exception records.
No ValetSession, Task/Dispatch or Shift transition changes. This is sellable-MVP
foundation, separate from DEC-045/046/048 task tracking. No PostGIS, provider
coupling, background/continuous attendance tracking or geofence-triggered Shift
actions. Raw employee coordinates have zero durable retention.

## Frozen technical parameters

| Parameter | Value | Source/rationale |
| --- | --- | --- |
| Start / End modes | OFF, WARN_ONLY, REQUIRE, REQUIRE_OR_OVERRIDE, independently | Owner U257-P |
| Company modes / existing data | OFF / OFF | Owner U257-P, compatible migration |
| Location overrides | nullable; null inherits Company | Configuration First / DEC-083 |
| Zone radius | finite 5..1000 meters inclusive; no implicit zone | Technical envelope for a bounded circular work area; configuration remains explicit |
| Configured maximum accuracy | integer 1..200 meters; Company default 50 | Positive bounded uncertainty; inert while OFF; not acceptance of the issue's pilot hypothesis |
| Configured maximum fix age | integer 1..120 seconds; Company default 30 | Bounded foreground evidence lifetime, inert while OFF |
| Future timestamp tolerance | 5 seconds inclusive | Small bounded device clock skew; beyond it is unusable evidence |
| Challenge lifetime | at most 300 seconds from database issuedAt, capped by Operation expiresAt | Bounded action/approval opportunity; does not extend fix freshness or unresolved operation lifetime |
| Operation pending deadline | 300 seconds from database createdAt | Bounded unresolved intent; explicit expiry without replay |
| Exact result reconciliation | 14 days from terminalAt, exclusive upper bound | Owner U257-RETENTION |
| Minimal replay tombstone | 90 days from terminalAt, exclusive upper bound | Owner U257-RETENTION; not a retry window |
| Unconsumed challenge purge eligibility | expiresAt + 24 hours | Owner U257-RETENTION |
| Consumed challenge purge eligibility | consumedAt immediately | Only non-secret identity survives independently in history |
| Exception terminal history | 24 calendar months from terminalAt | Owner U257-RETENTION |
| Decision history | 24 calendar months from decidedAt | Owner U257-RETENTION |
| Cold archive | none in v1 | Owner U257-RETENTION |
| Raw employee latitude/longitude retention | zero | Owner U257-D / U257-RETENTION |
| Zone code / label | trimmed nonblank; 64 / 200 characters | Existing bounded configuration style, no arbitrary metadata |
| Exception reason | LOCATION_UNAVAILABLE, GPS_UNAVAILABLE, OUTSIDE_ZONE, AMBIGUOUS_FIX | Narrow controlled reasons for the accepted fallback foundation |
| Exception note | absent in v1 foundation | Optional note is not necessary to represent the accepted primitive |
| Fingerprint | versioned HMAC-SHA256, 64 lower-case hex; injected key >=32 bytes | Repository keyed-digest convention; prevents low-entropy coordinate digest disclosure |
| END cash canonicalization | nonnegative decimal string, at most 11 integer / 3 fractional digits, insignificant zeros removed | Existing Shift Decimal(14,3) and End contract envelope; digest extension only, no cash behavior change |
| Policy fingerprint | versioned SHA256 of persisted effective values, Company/Location revisions and sorted active zone IDs/revisions | Non-secret configuration; no employee measurement |
| Persisted accuracy/freshness | ACCEPTABLE, UNUSABLE or NOT_EVALUATED, not exact meters/seconds/distances | Minimized truthful summary; an earlier validation failure never implies a later check passed |
| Timestamp / CAS | timestamptz(3); positive integer revisions, expectedRevision | Existing UTC/version conventions; no millisecond CAS collision |
| Distance | Haversine, mean spherical Earth radius 6371008.8 meters | Provider-neutral mean-Earth approximation; clamped intermediate, dateline/pole safe |

Calendar-month eligibility is evaluated in UTC with end-of-month clamping;
it is not approximated as 730 days. No acquisition timeout or Native parameter
is introduced by GPS-A; GPS-C must freeze those separately.

## Typed policy and release gate

Organization stores `shift_start_presence_mode`, `shift_end_presence_mode`,
`shift_presence_max_accuracy_meters`, `shift_presence_max_fix_age_seconds`,
and `shift_presence_revision`. Location stores nullable overrides of the four
values plus its own `shift_presence_revision`. No generic JSON settings.
Effective policy uses each non-null Location override, otherwise Company.
Bounds are identical in contracts and SQL. Independent positive thresholds
have no relative ordering requirement because meters and seconds are distinct
dimensions. The revision advances exactly once when a presence value changes;
identity/no-op updates cannot fabricate a new revision.

GPS-A keeps these fields outside both existing public settings whitelists and
projections. Database CHECKs additionally accept only Company OFF and Location
OFF/null. Thus no externally reachable route or direct configuration write can
activate WARN_ONLY or either strict mode. GPS-B must explicitly replace the SQL
gate, authorizers, management functions and readiness logic in a forward change
after authoritative command composition exists. GPS-A adds no public policy,
zone, challenge, status, exception, Start or End route.

## Pure evaluator

Strict schemas reject unknown fields and nonfinite/out-of-range coordinates,
nonpositive accuracy, malformed dates and invalid zone settings. Caller scope
must match every supplied zone, including disabled zones. Wrong scope is a
programming/boundary error, never an OUTSIDE classification.

Validate evidence before geometry: reject excessive accuracy, age beyond the
effective maximum or capturedAt beyond now+5 seconds. Challenge composition
also requires capturedAt >= issuedAt-5 seconds; the pure geometry boundary has
no challenge/database side effects. Disabled zones never qualify. Missing or
invalid active-zone configuration is CONFIGURATION_UNUSABLE, not OUTSIDE.

With distance d, horizontal accuracy a and zone radius R:
CONFIDENT_INSIDE iff d+a <= R; CONFIDENT_OUTSIDE iff d-a > R;
otherwise AMBIGUOUS_EDGE. Inside any ACTIVE zone wins; outside every ACTIVE
zone is outside; otherwise ambiguous. No rounding expands acceptance.
Invalid/stale/future/inaccurate evidence is MEASUREMENT_UNUSABLE with a controlled
reason. Policy mode mapping belongs to GPS-B and cannot enforce Shift in GPS-A.

## Durable operation, challenge and decision

All records have non-null Organization/Location/User/membership scope.
Composite FKs bind membership to its exact User and Organization, Location to
Organization, and an END target Shift to exact Organization/Location/member.
START has no target Shift; it never fabricates one. Result Shift is optional
until the caller creates the real Shift inside its own transaction.

Operation identity is `(userId, operationId)` so the same User cannot silently
reuse one identity at another membership/Location/action. Different Users may
use the same UUID independently. The canonical fingerprint contains version,
User/member/Organization/Location, action, target END Shift or START Location,
canonical cash amount for END, and exact evidence identity/content or exception
identity plus the accepted policy fingerprint. Cash is a decimal string without
redundant zeros; coordinates are
HMAC input only, never durable JSON. The key is trusted server material injected
by the caller; GPS-B owns deployment key provisioning and public error mapping.
The fingerprint helper returns only a digest and never logs input/key/errors.

Challenge issuance precedes measurement. Allocation therefore binds a non-null
`target_fingerprint` over the canonical scope/action/target/cash intent. The
full `request_fingerprint` is nullable until the first measured/exception attempt
and then bound exactly once under the operation lock. This explicit attempt
journal is part of Operation; no circular pre-issuance evidence is fabricated.
Same intent permits retrieving the same challenge; changed intent conflicts.
Same final request permits exact attempt reconciliation; changed evidence conflicts.
Allocation uses INSERT ON CONFLICT DO NOTHING followed by exact row locking
and complete intent fingerprint/scope comparison. A rolled-back allocation leaves no
reservation; concurrent commit converges; changed fingerprints conflict.
One operation has at most one challenge. A challenge's random UUID is a
non-secret selector, not a bearer credential: authenticated exact scope is
always required. No token/verifier is needed or persisted by this design.
Database-issued time determines expiry; consumption uses locked current rows,
database wall-clock and exactly one committed decision link. Consuming expiry
is exclusive (`now < expiresAt`); a duplicate cannot create a second decision.
Failed composition rolls back operation/challenge/decision with the caller.

Decisions are immutable typed facts: scope, action, exact real Shift when
available, operationId/fingerprint, non-secret challengeId, applied policy
fingerprint, applied mode and Company/Location policy revisions,
optional scoped zone ID/revision, classification/reason,
ACCEPTABLE/UNUSABLE/NOT_EVALUATED accuracy and freshness bands, server decidedAt and optional
exception ID. No raw coordinates, exact distance, exact accuracy, capture time,
generic metadata or serialized request. Decision outcome describes evidence;
it does not by itself assert a Shift started/ended. START decisions may have
null Shift for a denied/not-yet-composed effect; END always has the exact Shift.
SQL verifies the applied mode and both policy revisions against current persisted
configuration at insertion; caller configuration guards preserve that snapshot
through the transaction. It also verifies any supplied active zone revision.

Decision stores minimal operation/challenge identity independently, without
FKs to ephemeral operation/challenge rows. Exception likewise retains its
non-secret challenge selector independently. History must remain valid after
privileged ephemeral purge. Operation has only a minimal result identity, never
a full response/request payload. Exact reconciliation is tagged RECOVERABLE
only within 14 days; 14..90 days is EXPIRED replay protection only; terminal
operations are purge-eligible at 90 days. Even after tombstone purge, an old
recovery lookup is expired, never an instruction to execute. GPS-B/C own fresh
intent identity generation; absence must not trigger old-request auto-replay.
The internal scoped operation-status read requires only current authorized
User/member/Organization/Location and operationId, allowing process-death
recovery without retaining the original raw fix. Transport/response reconstruction
and new intent generation remain GPS-B/C obligations. Key rotation must preserve
fingerprint comparison for retained attempts; GPS-B owns that provisioning detail.

## Exception foundation

Exception is scoped to exact requester/action/target and challenge selector.
Request allocation requires a live unconsumed challenge and PENDING operation.
Controlled statuses: PENDING, APPROVED, REJECTED, EXPIRED, CONSUMED. Pending
approval/rejection uses expectedRevision. Approval/rejection actor must be a
same-Organization persisted membership, and its User cannot equal requester
User (even through another membership). SQL constraints require timestamps,
positive expiry ordering, one terminal state and one consumption decision.
Approval alone performs no Shift mutation. Expiry is challenge-bound in this
foundation; terminalAt records actual terminalization. Terminal facts cannot
be rewritten; privileged retention purge becomes eligible at terminalAt+24
months. GPS-A exposes no approval command. GPS-B owns current CA/exact-LM
capability/MFA, requester/approver revocation proof, semantic approval/consumption
and atomic final business events. Supervisor authority is not inferred.

## Lock graph and runtime boundary

Every helper accepts the caller PostgresTransaction; it never begins/commits a
nested transaction. Caller authenticates and resolves persisted scope before
any allocation/write; no public body can supply an authoritative scope/policy.
For GPS-B composition: settings Organization shared guard -> Location lifecycle
shared guard -> existing User/Organization/Location/member/access/Shift locks
in the established command order -> operation -> challenge -> exception.
Read zones under this guard. Zone writers must first take Organization settings
exclusive guard, then lifecycle guard, then scoped zone CAS; they must never
take the settings guard after Shift/attempt locks. Policy writers use the same
exclusive settings guard. GPS-A helpers do not independently claim full command
authorization or atomic Shift behavior. New helpers are never wired into Start,
End or operational eligibility. Preserve stale-own-End, cash and open-work rules.

Runtime zone access is SELECT/INSERT and column-scoped configuration UPDATE;
operation SELECT/INSERT and terminal-result columns UPDATE; challenge SELECT/
INSERT and consumption columns UPDATE; decision SELECT/INSERT only; exception
SELECT/INSERT and lifecycle columns UPDATE. No DELETE/TRUNCATE/REFERENCES/
TRIGGER or generic identity UPDATE. SQL guards enforce immutable identity,
one-way terminal state/consumption and revisions. Existing runtime provisioning
must explicitly reconcile/verify these grants after migration. Public has no
table/function authority. No generic unrestricted repository or settings writer.

All FK deletion is RESTRICT, never cascade historical facts. Decision UPDATE
is rejected even for migration-owner use. Ordinary runtime deletion is denied;
privileged maintenance may delete only eligible records, validated by SQL guard
and database clock. No new scheduler/queue/archive/retention infrastructure.
Expired pending operations/exceptions require explicit terminalization before
terminal retention clocks run. SQL eligibility plus focused tests establish the
later controlled operational maintenance boundary; actual purge scheduling is
outside GPS-A and must be supplied before production activation.

## Ownership and proof

GPS-A: this DEC, schema/migration/grants, pure evaluator, typed inherited policy,
internal operation/challenge/decision primitives, exception persistence,
retention eligibility, real PostgreSQL constraint/race/CAS/privacy tests.
GPS-B: Start/End composition, HTTP/auth/MFA, semantic exception flow, readiness,
management mutations/audit and exact result transport; remove OFF gate explicitly.
GPS-C: foreground bounded Native acquisition/permissions/recovery, Android proof,
iOS portability; GPS-D: Dashboard forms and complete management/device acceptance.
No automatic protected replay, whole-Shift tracking or physical proof is claimed.

Forward migration 058 follows migration 057. Old migrations remain immutable.
Contracts, domain/schema/security docs and canonical decision log must agree.
