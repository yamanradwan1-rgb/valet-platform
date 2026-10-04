# GPS-B public server contract

## GPS-C evidence-free correlation correction — owner authorized

Issue #257's 2026-10-04 correction adds optional top-level UUID `operationId`
to Start `{ targetLocationId, operationId?, presence? }` and End
`{ cashReported, operationId?, presence? }`. When both selectors are supplied,
`operationId` must equal `presence.operationId`; mismatch is transport-invalid.
Success responses are unchanged. Legacy omission and existing evidence-only
requests keep their prior behavior. No public MISSING evidence is introduced.

An evidence-free correlated command resolves the existing owned Operation and
Challenge, with exact action/target/canonical END cash and current authorization.
It never allocates another operation. When a new effect is needed, current OFF
commits the real Shift/audit and Operation with typed `OFF_NO_EVIDENCE` completion
basis and no Decision; current WARN_ONLY consumes the existing Challenge and
journals truthful missing measurement on that same Operation; current strict
modes bind and terminalize that Operation as DENIED/PRESENCE_REQUIRED, summary
null, with no Shift/Decision. Already-satisfied outcomes use the distinct
no-effect convergence contract below.
Exact terminal recovery precedes ordinary state convergence and uses the stored
policy fingerprint. Internal CORRELATED_MISSING fingerprints include operationId
and require no retained Challenge for recovery. No raw request is retained.

Migration 067 permits a missing result Decision only with explicit OFF provenance,
bound request/policy, exact result Shift and live preallocated Challenge at
completion. Evidence-backed results retain their Decision requirement. OFF leaves
the unconsumed Challenge on its existing expiry+24h purge clock; its purge cannot
destroy the independent 14-day Operation recovery result or 90-day tombstone.
No 24-month attendance evaluation is fabricated. This is server correction only;
GPS-C/GPS-D and strict activation remain unimplemented/closed respectively.

## GPS-C consumer correction — owner-authorized Issue #257

Challenge ISSUE and exact challenge GET add `presence: { mode,
maxAccuracyMeters, maxFixAgeSeconds }`. Mode is the current effective mode for
that exact START or END action, with independently inherited bounds (1..200 m,
1..120 s). Both reads return current guidance, not an issuance snapshot. Settings
and lifecycle guards precede current authority and Operation/Challenge locks;
final Shift submission reevaluates current policy. No zones, management policy,
override values, manager authority or fingerprint are projected. Legacy OFF
commands require no challenge; successful Start/End shapes remain unchanged.

Every RECOVERABLE result adds explicit nullable `summary`. Only a measured
PRESENCE_REJECTED denial may carry `{ classification, reason }`, using the
accepted consistent evaluator pair. Other denials, committed/expired results and
historical denials without those retained facts return null. PENDING adds nullable
`exceptionId`, the exact already-authorized operation's exception selector, so a
lost exception acknowledgement recovers by GET without repeating its POST.
EXPIRED outer responses retain their old shape. Forward migration 066 stores nullable
typed `denial_classification`/`denial_measurement_reason` on the Operation, never
raw measurement. No historical result is invented. Terminal facts and the
14-day recovery/90-day tombstone clocks remain unchanged.

Measured denial Operation A is terminal: reconcile it exactly before another
intent. Explicit employee approval request allocates fresh Operation B and
challenge B for the same current START Location, or exact current END Shift and
current canonical cash. B must currently use REQUIRE_OR_OVERRIDE. Map
CONFIDENT_OUTSIDE/OUTSIDE to OUTSIDE_ZONE; AMBIGUOUS_EDGE/EDGE to AMBIGUOUS_FIX;
MEASUREMENT_UNUSABLE to GPS_UNAVAILABLE while displaying its exact safe reason.
CONFIGURATION_UNUSABLE (NO_ACTIVE_ZONE/INVALID_CONFIGURATION) is a configuration
failure, never OUTSIDE_ZONE. Local foreground permission failure uses
LOCATION_UNAVAILABLE; disabled services/acquisition failure uses GPS_UNAVAILABLE.
Shared `shiftPresenceMeasuredDenialExceptionReason` validates and maps only these
server summaries; it returns null for configuration/inside outcomes, and grants
neither permission to request approval nor local geometry authority.
These local failures are not server geofence classifications. REQUIRE permits no
override. After B is APPROVED the employee explicitly submits EXCEPTION evidence
for B; current authority, exact target/cash, open work and DEC-100 still apply.
Changed cash cannot reuse B's approval. No automatic B, exception request or Shift
POST; no DENIED -> PENDING/COMMITTED transition and no mutation of A's evidence.
Lost B allocation recovers exact challenge/status; lost exception response
recovers its exceptionId through exact operation GET and then exact exception
GET. No new operation or exception POST is needed. User quotas and Retry-After
apply to B normally.

Task: #257. Base: `168da01e6822049ee0a45eebec4780c5b2b1fbd9`.
Authority: Accepted DEC-099/100 and the canonical implementation plan UI-F/Q.
This publishes U-002/U-003/U-004 transport mechanics within the owner-authorized
GPS-B task; it does not change modes, geometry, authority or retention.

## Scope and contract ledger

Affected: Organization, Location, User, OrganizationMembership, LocationAccess,
StaffAuthSession/MFA factor, Shift, dedicated Presence records and AuditEvent.
Shift remains ACTIVE -> ENDED. No ValetSession or Task/Dispatch transition changes.
No Native, Employee Web, employee-client or Dashboard presentation changes.
Presence is approved MVP point-in-time attendance, with no durable employee fix.

| Contract                             | Authority                       | Protected identity/persistence/concurrency                                                                                      |
| ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Modes, bounds, per-field inheritance | DEC-099 typed policy            | Organization/Location columns; positive revisions; existing settings guard                                                      |
| Operational intent/evidence/recovery | DEC-099 durable operation       | User/operation unique identity; scoped target digest; Operation -> Challenge -> Exception locks; 14-day exact recovery          |
| Original approver proof/early expiry | DEC-100                         | Current User/member/CA-or-exact-LM rows; existing invalidation guards; atomic EXPIRED + DENIED; immutable reviewer history      |
| Protected management                 | canonical UI-F                  | Exact session, actor User/member, Organization/subscription, Location/access and MFA factor protected through commit            |
| Readiness and inherited context      | canonical Q/R01-R12             | Settings exclusive then sorted lifecycle guards; paired policy revisions plus active-zone fingerprint; complete inheritor set   |
| Management reconciliation            | canonical U-003/UI-H            | Immutable successful receipt or legacy exact audit; fresh authorization; no equality attribution; absent create remains UNKNOWN |
| Minimal audit/privacy                | DEC-079/099/100, canonical UI-F | Real Organization/Location scope; typed IDs/revisions/status only; atomic business effect and history                           |
| Maintenance                          | DEC-099 retention boundary      | Separate privileged operator execution; SQL clock; bounded purge; runtime has no DELETE                                         |

## Operational routes

Under `/v1/staff/shifts`:

- POST `presence/challenges`: START `{action, targetLocationId, operationId}` or
  END `{action, shiftId, cashReported, operationId}`. END binds canonical cash.
- GET `presence/operations/:operationId`: exact authenticated owned status; no fix
  needed after process death. Missing/retention-expired means EXPIRED, never replay.
- GET `presence/operations/:operationId/challenge`: reauthorized exact challenge.
- POST `presence/operations/:operationId/exception`: `{challengeId, reason}`.
- GET `presence/exceptions/:exceptionId`: exact owned safe exception status.
- Existing POST `start` and POST `:shiftId/end` accept optional `presence`.
  Evidence contains operationId, challengeId and either MEASURED sample identity/
  measurement or EXCEPTION exceptionId. No client tenant/member/policy/inside flag.

Successful Start/End response schemas stay unchanged. Focused operation recovery
returns exact result linkage and the stored Shift response snapshot reconstructed
from immutable Shift fields; it never attributes an unrelated current Shift.
Same operation with changed intent/evidence conflicts. Pending is unresolved.
OFF legacy requests keep existing behavior. WARN_ONLY missing evidence is
UNVERIFIED, represented by minimized MEASUREMENT_UNUSABLE/INVALID_FIX facts,
never INSIDE. Strict modes deny missing evidence in the authoritative command.

## Management routes

CA prefix: `/v1/staff/management/organizations/:organizationId/shift-presence`.
Company GET `policy`, PUT `policy/default`. Exact Location prefix is
`locations/:locationId` beneath this prefix.

LM prefix: `/v1/staff/dashboard/locations/:locationId/configuration/shift-presence`.
Both exact Location surfaces expose:

- GET `policy`, PUT `policy/override`, POST `policy/override/clear`;
- GET `readiness`;
- GET `zones`, GET `zones/:zoneId`, POST `zones`, PUT `zones/:zoneId`;
- GET `exceptions` (PENDING/history), GET `exceptions/:exceptionId`;
- POST `exceptions/:exceptionId/approve`, POST `exceptions/:exceptionId/reject`;
- GET `results/:mutationId`.

Company result lookup lives at GET `results/:mutationId` under the CA prefix.
Lists use an opaque UUID cursor and bounded limit 1..100 (default 25), ordered
by immutable ID; no offset/full collection is returned. Exact reads reauthorize.
Writes use one typed field, positive expectedRevision, mutationId; Location
policy writes also require expectedCompanyRevision and configurationFingerprint.
Zone creates use a fresh immutable zoneId as exact reconciliation selector;
changed writes use a fresh mutationId as their audit identity. No blind retry.
No delete or generic state setter is exposed.

No-op policy values keep their revision and create no fictitious change audit.
An exact result read returns COMMITTED only when a scoped immutable management receipt (or an existing pre-correction change audit) proves the dispatched command committed; otherwise UNKNOWN plus current canonical authorized state. Equal values/statuses never prove own success.

## Readiness/release

Readiness returns applicability (NOT_APPLICABLE, WARNING, STRICT), configuration
usability, activeZoneCount, paired revisions, configurationFingerprint, observedAt
and controlled blockers. It separates configuration usability from strict rollout.
Usability requires a valid effective typed policy and at least one active valid
circle capable of admitting an accepted fix, preserving currency/timezone checks.
STRICT_ROLLOUT_CLOSED remains a blocker in GPS-B. No runtime environment toggle,
saved client readiness bit, implicit zone, downgrade or production activation.

## Controlled outcomes

Concealed scope/authority denial uses the established 404 AUTHORIZATION_DENIED.
Transport failure uses 400 REQUEST_INVALID. Presence conflicts/expiry/consumption,
configuration/CAS/context/readiness/release/busy errors use focused controlled
409 codes. Strict evidence denial uses 422 PRESENCE_REQUIRED / PRESENCE_REJECTED.
APPROVER_AUTHORITY_REVOKED is an exact recoverable DENIED operation reason (409).
MFA retains established 403 MFA_STEP_UP_REQUIRED; stale session remains 401.
Never expose SQL errors, employee fixes, fingerprints or challenge internals in
errors/audit/logs. Only non-secret selector IDs and safe minimized facts appear.

## Implementation evidence

The frozen transport is implemented on the GPS-B branch. Exact local commands,
runtime/failure evidence, race facts and remaining release gates are recorded in
[GPS_B_IMPLEMENTATION_REPORT.md](GPS_B_IMPLEMENTATION_REPORT.md).

## Literal success statuses and shared schema map

Operational challenge/exception POSTs and legacy Shift Start/End POSTs explicitly
return 200; operational GETs return 200. Management GET/PUT returns 200;
management POST (zone create, override clear, approve/reject) returns 201 under
the established management-controller convention. Authentication/errors retain
the controlled mappings above. Authenticated projections set no-store headers.

| Capability                                | Shared strict schemas                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Challenge intent and safe challenge       | shiftPresenceChallengeIntentSchema / shiftPresenceChallengeResponseSchema                                                                                             |
| Measured or exception evidence            | shiftPresenceEvidenceSchema                                                                                                                                           |
| Owned status and exact Shift result       | shiftPresenceOperationStatusResponseSchema / shiftPresenceRecoveryResponseSchema                                                                                      |
| Exception request and owned status        | shiftPresenceExceptionCreateRequestSchema / shiftPresenceExceptionResponseSchema                                                                                      |
| Company policy                            | shiftPresenceCompanySetRequestSchema / shiftPresenceCompanyResponseSchema                                                                                             |
| Location SET/CLEAR/projection/readiness   | shiftPresenceLocationSetRequestSchema / shiftPresenceLocationClearRequestSchema / shiftPresenceLocationResponseSchema / shiftPresenceReadinessSchema                  |
| Zones                                     | shiftPresenceZoneCreateRequestSchema / shiftPresenceZoneUpdateRequestSchema / shiftPresenceZoneResponseSchema / shiftPresenceZoneListResponseSchema                   |
| Management exception queue/history/review | shiftPresenceExceptionListQuerySchema / shiftPresenceExceptionListResponseSchema / shiftPresenceExceptionReviewRequestSchema / shiftPresenceManagementExceptionSchema |
| Management reconciliation                 | shiftPresenceManagementResultQuerySchema / shiftPresenceManagementResultSchema                                                                                        |

Location result GET defaults to POLICY when no query is supplied. Explicit queries
are kind=POLICY, or kind=ZONE/EXCEPTION with exact entityId. Response canonical is
a tagged POLICY, ZONE (zone plus current readiness), or EXCEPTION projection.
The canonical state is freshly authorized current state; receipt or legacy-audit attribution
COMMITTED names the exact mutation's entity/revision. UNKNOWN returns null effect/entity/revision facts alongside canonical state. ZONE canonical.value.zone is nullable only on result reads. Company result GET selects Company
POLICY. Mutation UUIDs are command correlation identities, never bearer authority.

START recovery reconstructs the original ACTIVE/endedAt=null result even after
that Shift later ends or a later Shift starts. END recovers its immutable cash
reconciliation. No raw fix is needed for GET recovery. Challenge IDs are scoped
non-secret selectors; hashes/verifiers/employee fixes are not response fields.
Exception history intentionally does not depend on a retained Operation or
Challenge row. Authorized management requester names come from Membership and
email from User. Review-time canReview is a snapshot; commands recheck authority.
Legacy WARN_ONLY uses a trusted server-only MISSING fingerprint variant, never a
fabricated Exception identity; it is absent from the client evidence union.

## Complete presence error publication

409: PRESENCE_OPERATION_CONFLICT, PRESENCE_OPERATION_EXPIRED,
PRESENCE_CHALLENGE_EXPIRED, PRESENCE_CHALLENGE_CONSUMED, PRESENCE_CAS_CONFLICT,
PRESENCE_AUTHORITY_BUSY, PRESENCE_CONFIGURATION_CONFLICT,
PRESENCE_INHERITED_CONTEXT_CONFLICT, PRESENCE_NOT_READY,
PRESENCE_STRICT_ROLLOUT_CLOSED, PRESENCE_MUTATION_CONFLICT,
PRESENCE_REVIEW_CONFLICT, APPROVER_AUTHORITY_REVOKED.
422: PRESENCE_REQUIRED, PRESENCE_REJECTED.
429: SHIFT_PRESENCE_RATE_LIMITED, with Retry-After 1..900 seconds.
503: PRESENCE_SECURITY_UNAVAILABLE; existing ANTI_ABUSE_UNAVAILABLE applies to limiter failure.
Internal PRESENCE_SCOPE_MISMATCH maps to concealed 404 AUTHORIZATION_DENIED.
The retained denial reasons are APPROVER_AUTHORITY_REVOKED, PRESENCE_REQUIRED
and PRESENCE_REJECTED; evaluated classification/reasons stay DEC-099 controlled
values. No SQL exception or private payload is copied into these messages.

## Operator prerequisites and retention execution

Set SHIFT_PRESENCE_FINGERPRINT_KEY through the deployment's protected secret
configuration: persistent canonical base64 of at least 32 bytes. Commands needing
presence binding fail with PRESENCE_SECURITY_UNAVAILABLE if key configuration is
missing/invalid. Legacy OFF without evidence keeps its key-independent behavior.
Do not enable WARN_ONLY before provisioning the key. Rotation supplies a JSON
array (at most 16 retained keys) through SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS.
Keep every referenced historical key until its Operations pass their 90-day
purge horizon; do not shorten comparison support to the 14-day result window.

Run the controlled privileged executor using the established migration/TLS
connection policy:

```powershell
pnpm --filter @valet/database shift-presence:maintain
```

MIGRATION_DATABASE_URL identifies the trusted migration/maintenance owner, never
the runtime role. The CLI validates TLS under the repository production policy.
Each call handles at most 1000 rows per category; a run performs at most 20 batches
and returns only batches, expiredOperations, expiredExceptions, purgedChallenges,
purgedOperations, purgedDecisions and purgedExceptions. Backlog is handled by
subsequent explicit operator runs. No protected business POST is replayed.

Maintenance explicitly expires pending Operations and independently expired
PENDING/APPROVED Exceptions, including unused approval after OFF/WARN action,
denied Operation, or already-purged Challenge. This starts a truthful terminal
history clock without changing immutable reviewer/review/deadline facts.
Consumed Challenges can purge immediately; unconsumed ones at expiry+24h.
Terminal Operation digests purge at terminalAt+90 UTC days; exact recovery ends
at terminalAt+14 days (exclusive). Decisions purge at decidedAt+24 UTC calendar
months; terminal Exceptions at terminalAt+24 UTC calendar months after independent
Decision references are gone. Live-reference guards preserve independent history.
No cold archive exists; raw employee GPS has zero durable retention.

The deployment operator must arrange the approved operational execution cadence
and verify protected key provisioning before a later strict release. GPS-B installs
no scheduler/queue/archive and keeps strict activation closed in both SQL and
public readiness. Tests remove strict CHECKs only in disposable owner fixtures
to exercise enforcement; that fixture facility is not a production activation path.

## GPS-B independent review corrections — authorized technical boundary

The new operational routes authenticate the current Staff session, then count the authenticated User against existing HMAC-derived AntiAbuse scopes before any Presence allocation or selector lookup. The rolling window is the infrastructure’s 15 minutes: `v1:shift-presence-challenge-user` allows 30 requests, `v1:shift-presence-exception-user` allows 10 requests, and `v1:shift-presence-status-user` allows 180 requests shared across all three status/read routes. These technical ceilings permit ordinary retries and roughly one combined status read per five seconds while bounding allocation and polling. Random selectors, sessions, memberships or Locations do not create another User quota. Threshold rejection uses 429 `SHIFT_PRESENCE_RATE_LIMITED`, safe standard text, no-store and integer Retry-After 1..900 seconds. Missing/invalid limiter secret or infrastructure failure uses the existing 503 `ANTI_ABUSE_UNAVAILABLE`. Legacy OFF Start/End routes do not use this new boundary. AntiAbuse rows retain only the existing scope/HMAC/time/state fields and existing cleanup eligibility after one hour.

Management correlation IDs are single-use successful-command identities, including no-ops. A dedicated typed append-only `ShiftPresenceManagementResult` receipt records mutation UUID, real actor/tenant/Location, controlled entity kind, entity UUID, positive completion revision, CHANGED or NO_CHANGE, optional exact change-audit linkage and database completion time. It contains no body, configuration text, raw evidence or digest. Each successful command appends its receipt atomically; a no-op has NO_CHANGE, unchanged policy revision and no fictitious change audit. Identical or changed reuse of a committed identity returns 409 PRESENCE_MUTATION_CONFLICT; callers recover by GET, never automatically replay a protected write. A failed/rolled-back command leaves no receipt. A unique receipt identity serializes collisions even across Organizations; loser effects/audit roll back. Existing reviewed change-audit identities remain recoverable and reserved. Historical no-ops without a receipt remain UNKNOWN; no completion history is invented or backfilled. Receipts are immutable minimized management history alongside existing append-only audit; the operational 14-day/90-day/24-month clocks remain unchanged.

Result attribution remains COMMITTED or UNKNOWN; `effect` is CHANGED, NO_CHANGE or null when attribution is UNKNOWN. The canonical ZONE result retains readiness and has a nullable `zone`. Absent or still-unresolved create returns UNKNOWN, null effect/entityId/revision and canonical.zone=null only after fresh exact Organization/Location authority. Absence never proves rollback or authorizes another create. A globally existing Zone in another tenant/Location remains concealed, as does revoked result-scope authority. Existing entities without that exact mutation proof return UNKNOWN with the authorized current entity. Code/label/value equality never proves attribution. Ordinary Zone GET continues to conceal missing entities.

## Distinct-operation no-effect convergence — owner follow-up

For a valid owned correlated request, same-Location existing ACTIVE Start and
exact already-ENDED End with compatible canonical cash durably record the
caller's own O as COMMITTED with internal `NO_EFFECT_CONVERGENCE`. COMMITTED
means the successful result was recorded, not that this O mutated the Shift.
No new Shift/audit/Decision, copied Decision or challenge/exception consumption
occurs. GET O recovers the exact returned result, including after response loss;
success and recovery response shapes remain unchanged with decisionId null.
Different-Location Start and changed correlated END cash conflict. Force-ended
missing cash remains unavailable. Legacy omission and prior effect-backed paths
remain unchanged. Forward migration 068 adds only narrow typed provenance.
