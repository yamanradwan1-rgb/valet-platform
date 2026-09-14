# DEC-073 — Native Push Architecture

Status: Accepted
Date: 2026-09-02

Canonical decision log entry: `docs/08_DECISIONS_LOG.md` (DEC-073).

## 1. Context and decision scope

DEC-070 accepted two foreground Web presentation concepts and selected
five-second canonical polling/refetch with client transition detection. It
explicitly did not accept Web Push, background operating-system notification,
dedicated notification persistence, or a general notification platform.

DEC-071 accepted the Android-first Employee Native application and required
provider-neutral shared concepts with later iOS portability. DEC-072 accepted
native Staff authentication over the existing `StaffAuthSession` authority.
Native push now needs an exact security, persistence, delivery and lifecycle
contract before backend or device implementation begins.

This decision accepts attention-only native push for one initial workflow. It
does not implement a schema, migration, endpoint, worker, provider, Firebase
project, native dependency, service credential or application behavior.

## 2. Acceptance, authority and affected domain

This decision is `Accepted`. Repository inspection and owner direction settle
the material semantics needed by MOB-020 through MOB-022.

The following Accepted Decisions remain binding:

- DEC-007 keeps external providers behind application adapters;
- DEC-014 keeps Task/Dispatch lifecycle separate from `ValetSession`;
- DEC-023 and DEC-024 govern Staff identity, session validity and anti-abuse;
- DEC-032 governs current exact-Location queue/Shift eligibility;
- DEC-034 and DEC-035 govern Task ownership, queue and assignment truth;
- DEC-063 prohibits a generic client mutation outbox and blind replay;
- DEC-070 defines the existing foreground Web concepts and polling truth;
- DEC-071 fixes the native platform, organization-owned Firebase posture and
  provider-neutral shared architecture; and
- DEC-072 governs native authentication, logout and identity-state purge.

Affected existing entities are `User`, `StaffAuthSession`,
`OrganizationMembership`, `LocationAccess`, `Shift`, `Task`, `ValetSession`,
`RetrievalRequest` and `DispatchEvent`. MOB-020 may add the three logical push
entities accepted in section 8.

No `ValetSession`, Task or Dispatch transition is added or changed. A genuine
guest retrieval request continues to atomically create the `QUEUED`, unassigned
`RETRIEVAL` Task and perform the already Accepted `PARKED -> REQUESTED` session
transition. Push intent creation is downstream attention persistence in that
same successful transaction; push can never cause either transition.

## 3. Current notification reality

Repository inspection on the decision date establishes this baseline:

| Area | Current fact |
| --- | --- |
| Employee Web | A non-overlapping five-second Task queue poll runs only with authenticated identity and selected Location, pauses while hidden/offline, and refetches when visible/online. |
| Employee foreground alert | Client transition detection alerts only for a newly observed unassigned `QUEUED` `RETRIEVAL` Task; the initial snapshot is a baseline and Task ID is the presentation identity. |
| Alert action | The alert navigates to the canonical queue. It does not claim, assign or mutate a Task. |
| Guest foreground alert | `GUEST_VEHICLE_READY` is a separate Guest Web presentation concept after the authoritative ready transition. |
| Service workers | Employee Web has no tracked service worker, Push API, Notification API or background push code. |
| Customer PWA | `apps/customer/public/sw.js` is a static GET cache only; it excludes API/authorization traffic and has no `push` event or `showNotification`. |
| Persistence | The existing `notifications` table is for external SMS/WhatsApp/Email delivery and is not a native-push store. |
| Backend work | The guest request transaction already persists RetrievalRequest, Task, DispatchEvent, ValetSession and AuditEvent changes atomically. |
| Worker/lease | No reusable application delivery worker, lease, scheduler or retry framework exists. The GPS cleanup function is unrelated maintenance code. |
| Provider pattern | Narrow provider-neutral application ports and fail-closed unconfigured registries exist, but no push adapter exists. |

The earlier Web Push persistence/subscription work was explicitly reverted.
MOB-020 must not resurrect it, overload the external notification table, or
alter Employee Web polling/service-worker behavior.

## 4. Non-authoritative push invariant

Push is an optional, best-effort attention signal. It is never:

- authentication, session restoration or device trust;
- tenant, Location, role, Shift, Task or assignment authority;
- proof that a Task still exists or remains actionable;
- a command, mutation, claim, assignment, handoff or release trigger;
- canonical synchronization or guaranteed delivery; or
- evidence that the operating system displayed a notification.

Receipt or tap must first complete DEC-072 authentication/restoration, discard
all prior identity/Location context on identity change, refetch the canonical
Task queue from the API, reauthorize current scope and show only current server
state. Any claim or other action remains an explicit user command through its
normal protected endpoint.

Polling/refetch remains the recovery path when permission is denied, a token is
missing, the worker/provider/device is unavailable, the app is offline, the OS
suppresses presentation, or a notification is delayed, duplicated, reordered
or lost.

## 5. Accepted initial eligibility matrix

Only one native push kind is Accepted initially:

| Kind | Trigger | Audience | Current authorization | Current Location/Shift/Task conditions | Safe payload | TTL/freshness class | Logical dedupe | Refetch target | Suppression |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EMPLOYEE_RETRIEVAL_REQUESTED` | The canonical guest-request transaction creates a genuinely new unassigned `QUEUED` `RETRIEVAL` Task | Staff with active native registrations for the Task Location | Active User; unrevoked/unexpired Staff session; active membership and Organization; `VALET_EMPLOYEE` or `VALET_SUPERVISOR` | Active Location; explicit access; ACTIVE Shift at that exact Location; Task remains `RETRIEVAL`, `QUEUED` and unassigned | Fixed generic EN/AR copy plus schema version, kind, opaque intent ID and `TASK_QUEUE` route | Short-lived typed policy; never valid after configured expiry or lost Task eligibility | Unique push kind + Task ID; unique intent + registration | Authenticated exact-Location Task queue | Any failed current eligibility fact, inactive endpoint/token version, expiry or attempt exhaustion |

The following candidates were evaluated and are not Accepted:

| Candidate | Reason not Accepted |
| --- | --- |
| `GUEST_VEHICLE_READY` | Guest native application and native guest binding do not exist; DEC-070 Guest Web behavior remains sufficient. |
| Task assignment/reassignment | No accepted native presentation/audience contract and the current initial need is new queue attention. |
| Task status/general operations | Speculative breadth with no current product requirement. |

New registrations do not backfill old intents. A Staff user may have multiple
eligible sessions/devices, and each distinct active registration may receive
one delivery for the same intent. That is intentional device fan-out, not a
duplicate logical intent.

## 6. Provider and application boundary

The logical domain uses `StaffPushRegistration`, `StaffPushIntent`, push kind,
registration state, delivery state and provider-result classes. Entity,
service, route and shared portable names must not contain `Fcm`, `Firebase` or
`Apns`.

The initial Android adapter sends directly through FCM HTTP v1. The native app
may use Expo Notifications to request permission, configure Android channels
and obtain the native device token. The Expo Push Service and Expo push tokens
are not selected. Provider credentials remain deployment secrets outside the
application, source, Git, database rows and payloads.

Infrastructure-level provider values may distinguish `FCM` and future `APNS`
at the strict registration/adapter boundary. The initial API accepts only the
valid `FCM + ANDROID + com.vaylet.employee` combination. The later iOS adapter
may accept `APNS + IOS + com.vaylet.employee` without changing logical intent,
eligibility, delivery state or client tap semantics.

No generic event bus, outbox platform, microservice, Redis queue, Kafka topic,
Web Push path or client-side delivery queue is accepted.

## 7. Registration API and authorization order

MOB-020 must expose these authenticated native-Staff operations under the
existing `/v1/staff` boundary:

- `PUT /v1/staff/push/registrations` — idempotently register an installation or
  reconcile its current token/allowed metadata; and
- `POST /v1/staff/push/registrations/:registrationId/disable` — idempotently
  disable the current session's registration.

All use strict JSON, reject unknown fields and non-empty query parameters, and
accept exactly these body concepts as applicable:

| Field | Rule |
| --- | --- |
| `provider` | Controlled infrastructure value; initially only `FCM`. |
| `platform` | Controlled value; initially only `ANDROID`. |
| `providerToken` | Required non-empty provider token with a conservative length bound; opaque and never parsed for identity. |
| `installationId` | Required app-generated UUID, regenerated on reinstall; correlation only, never authority. |
| `appIdentifier` | Must equal the server allowlist entry `com.vaylet.employee`. |
| `appVersion` | Strict bounded display version string; telemetry only. |
| `appBuild` | Strict bounded build identifier; telemetry only. |
| `locale` | Controlled `en` or `ar`; presentation preference only. |

No User, session, Organization, Location, membership, role, Shift, Task or
recipient identifier is accepted from the client. The server resolves the
current `StaffAuthSession` from the same bearer credential through an internal
session-context boundary; the public principal remains DEC-023's `{ userId }`.

Authorization-before-mutation ordering is mandatory:

1. authenticate the bearer and resolve the exact active Staff session;
2. verify the current active User;
3. strictly validate provider/platform/app/token/install/metadata shape;
4. load and lock registrations implicated by registration ID, installation and
   token hash;
5. prove a registration-ID mutation belongs to the current Staff session, and
   permit cross-session replacement only for the exact same-user,
   same-installation session-transition rule in section 9;
6. apply one idempotent state transition and safe metadata change;
7. commit before returning; and
8. emit only redacted operational telemetry after the outcome is known.

Validation or authorization failure writes nothing. The desired-state PUT is
semantically idempotent under locked provider/app/installation and token-hash
uniqueness: an exact retry returns the same active registration, metadata
reconciliation converges, and rotation creates at most one new active row.
Disable is terminal and an authorized repeat returns the same disabled outcome.

## 8. Accepted logical persistence for MOB-020

MOB-020 must add dedicated provider-neutral persistence rather than reuse
`Notification`.

### `StaffPushRegistration`

Required logical fields:

- UUID identity and exact `staff_auth_session_id` restrictive foreign key;
- provider, platform, application identifier and opaque installation ID;
- raw usable provider token in a dedicated sensitive column;
- versioned SHA-256 token hash for equality/uniqueness only;
- app version, app build and locale;
- registration state;
- created/updated, last-confirmed, and terminal timestamps;
- terminal reason class; and
- optional `superseded_by_registration_id` self-reference for deterministic
  rotation retry resolution.

The raw token must be available to the sender; a one-way hash alone is
insufficient. This decision does not create an application encryption/key
management platform solely for push. Production database/storage encryption,
backup protection, least-privilege column access and secret-safe operations
remain deployment gates. Raw tokens never enter logs, AuditEvent, analytics,
errors, metrics labels or client read responses.

Database integrity must enforce:

- controlled provider/platform/state/locale values;
- provider/platform/app combinations;
- one active row for a provider + app + installation;
- one active row for a provider + token hash;
- ACTIVE requires a raw token and hash;
- terminal states have a terminal timestamp; and
- state transitions never reactivate a terminal row.

### `StaffPushIntent`

Required logical fields:

- UUID identity, Organization, Location, `ValetSession` and Task references;
- the controlled push kind, currently only
  `EMPLOYEE_RETRIEVAL_REQUESTED`;
- creation time, required expiry time and typed policy version; and
- a stable logical dedupe key enforced as unique push kind + Task ID.

Organization/Location/Task relationships must be database-enforced using the
repository's same-tenant composite-key pattern. An intent is immutable business
attention history; provider attempts do not rewrite its trigger identity.

### `StaffPushDelivery`

Required logical fields:

- UUID identity, Organization, intent, registration and recipient membership;
- controlled delivery state;
- attempt count and maximum-attempt snapshot;
- next-attempt time;
- unique lease token and lease-expiry time;
- safe provider-result class and optional non-secret provider reference;
- provider-accepted and terminal timestamps; and
- created/updated timestamps.

Database integrity must enforce same-Organization intent/membership ownership,
unique intent + registration, non-negative bounded attempts, state-dependent
lease fields, and state-dependent terminal timestamps. Delivery rows are
append-oriented attempt coordination records; provider tokens are referenced
through the registration and never copied into intent or delivery rows.

Exact Prisma names and indexes may follow repository naming conventions, but
the entities, relationships, uniqueness, states and invariants above may not be
weakened. MOB-020 must update `docs/03_DATABASE_SCHEMA.md`, add one forward-only
migration, update fixtures and add PostgreSQL constraint tests.

## 9. Registration lifecycle and identity changes

| State | Meaning | Entered from | Legal next states | Retryable? | Terminal? | Observability |
| --- | --- | --- | --- | --- | --- | --- |
| ACTIVE | Current provider endpoint is eligible to be considered; current Staff/session/scope eligibility is still separately required | New registration or a winning replacement | DISABLED, PROVIDER_INVALID, SUPERSEDED | Exact register/metadata reconciliation is idempotent | No | Count create/refresh by provider/platform/build without sensitive identifiers |
| DISABLED | Owning session/client or trusted logout/revocation path disabled the binding | ACTIVE | None; a later registration creates a new row | Disable repeats are idempotent | Yes | Safe reason class and transition count |
| PROVIDER_INVALID | Provider conclusively rejected this exact endpoint as unregistered/invalid | ACTIVE | None; current token registration creates a new row | No send retry for this row | Yes | Invalid-endpoint count only; no token/hash label |
| SUPERSEDED | A token rotation/account switch/concurrency winner replaced this row | ACTIVE | None | Repeating the winning desired state returns the current row | Yes | Rotation/supersession count without identity labels |

| Current state | Event | Preconditions | Next state | Required effects |
| --- | --- | --- | --- | --- |
| None | Register | Current authenticated Staff session; valid strict input | ACTIVE | Create one row; return only registration ID/state/metadata, never token. |
| ACTIVE | Exact retry | Same session, install, token hash and canonical operation | ACTIVE | Return prior outcome; update no authority. |
| ACTIVE | Metadata refresh | Same session and registration | ACTIVE | Update only app version/build/locale and last-confirmed time. |
| ACTIVE | Token rotation | Same session, or a later-created current session for the same User, presents the same installation with a new valid token | SUPERSEDED + new ACTIVE | Lock and transition old row; insert new row atomically. |
| ACTIVE | Same-user session rebind | A later-created current session for the same User presents the exact same provider/app/installation and token | SUPERSEDED + new ACTIVE | Atomically supersede the old binding and create a row for the new session; reveal no old session identity. |
| ACTIVE | Explicit disable/logout | Current owning session or trusted server session-revocation path | DISABLED | Terminal transition; clear raw token after the transition is durable. |
| ACTIVE | Provider says endpoint invalid | Fenced delivery still references the same registration/token version | PROVIDER_INVALID | Terminal transition; clear raw token and suppress unsent deliveries. |
| ACTIVE | New active row wins a uniqueness race | Locked canonical winner exists | SUPERSEDED | Losing old row cannot remain active. |
| Any terminal | Register/rotate | Any input | Unchanged | Never reactivate; create a new row only after current authorization and uniqueness checks. |

The same-user session-transition exception uses installation and token only to
locate the existing binding to supersede; they never identify or authorize the
Staff user. The authenticated sessions must resolve to the same User, and the
new owner must be later-created. A different User or a token collision across
different installation IDs fails closed and raises safe security telemetry
rather than silently rebinding.

Registration races use one canonical lock order across Staff session,
provider/app/installation and token-hash rows. Duplicate or simultaneous
desired-state PUTs converge on one ACTIVE row. Registration rechecks the locked
Staff session immediately before mutation. If logout wins, registration is
rejected; if registration wins, the following logout transaction disables the
row while revoking the session. When two authenticated sessions for the same
User race to bind the exact same provider/app/installation/token tuple, the
later-created current Staff session is the deterministic endpoint owner; an
older session cannot reclaim it. A session for a different User cannot take
ownership of the active binding. This ordering affects endpoint attention only
and grants neither session domain authority. Provider invalidation is
conditional on exact row and token version, so a concurrent successful
re-registration cannot be invalidated by a stale provider result.

Multiple installations and multiple active Staff sessions are supported. Each
registration belongs to exactly one Staff session. Session access-token
rotation does not change that binding because the session identity is stable.

Native logout must atomically revoke the resolved Staff session and disable all
its ACTIVE push registrations once MOB-020 is present. The device also blocks
old identity immediately, purges native identity state, best-effort deletes the
local provider token and stops presenting old-identity notifications. If the
logout request never reaches the server, remote revocation cannot be claimed:
the residual is a possible generic attention notification until the server
learns of logout, provider invalidation or session expiry. Tap still fails at
authentication/current eligibility and exposes no protected data.

Server-side session revocation, session expiry, disabled User, removed access,
ended Shift or account status change makes a registration ineligible
immediately through the send-time join even if its row has not yet been moved
from ACTIVE. A reconciliation/cleanup path may later terminalize it; state is
not a substitute for current authorization.

Uninstall is not observable synchronously. The old endpoint remains harmlessly
stale until provider invalidation or bounded cleanup. Reinstall creates a new
installation ID and registers the current provider token as a new row.

Clearing application data follows the same new-installation behavior. An
application upgrade preserves the opaque installation ID when the platform
does; on launch the app obtains the current provider token and performs the
desired-state PUT, which refreshes build/locale metadata or performs the normal
atomic rotation if the token changed. Provider token refresh at any other time
uses the same path.

Permission denial is supported. The app continues normal authenticated use and
polling; it does not upload a provider token while denied. Later grant follows
normal registration. Permission or channel revocation never weakens the app.

## 10. Intent creation and recipient expansion

For the one accepted kind, the authoritative guest-request transaction must:

1. perform the existing guest authorization and locked domain checks;
2. create the genuine new RetrievalRequest and unassigned `QUEUED`
   `RETRIEVAL` Task;
3. perform the Accepted `PARKED -> REQUESTED` transition and append existing
   Dispatch/Audit history;
4. insert one deduplicated `StaffPushIntent` for that Task;
5. derive recipients only from current persisted server facts in the eligibility
   matrix;
6. insert at most one PENDING delivery per currently eligible ACTIVE
   registration; and
7. commit all domain and attention persistence atomically.

If any write fails or the transaction rolls back, there is no intent or
delivery. A semantic retry that observes the already-created Task does not
create another intent. Intent persistence is a narrow transactional consequence
of this specific domain command, not a generic outbox or event platform.

The transaction performs no provider I/O. New registrations after commit do
not receive historical deliveries; the canonical queue supplies current truth.

Before external send, the worker must re-read and re-prove every eligibility
fact plus registration state and token version. If any fact is false, the
delivery becomes SUPPRESSED without provider I/O. A race can still change facts
after that final check and before provider acceptance; this unavoidable TOCTOU
window is contained by the generic payload and mandatory tap refetch.

## 11. Safe payload, localization and client behavior

The accepted payload is a visible user notification with a minimal data hint:

```text
schemaVersion = 1
kind          = EMPLOYEE_RETRIEVAL_REQUESTED
intentId      = <opaque UUID>
routeIntent   = TASK_QUEUE
```

It contains no User, membership, Organization, Location, Task, ValetSession,
RetrievalRequest, guest, phone, plate, vehicle, parking, key, GPS, payment,
handoff, pickup-code, auth credential, session credential or provider secret.
The opaque intent ID is correlation/dedupe only and grants no read access.

Presentation uses fixed allowlisted server templates selected from the stored
`en`/`ar` preference, with English fallback. Initial generic copy is equivalent
to “VAYLET — New retrieval task available” and “VAYLET — مهمة استرجاع جديدة
متاحة”. No client-supplied or domain-derived free text enters the payload.
Android uses one dedicated operational retrieval channel whose user-controlled
permission, sound and prominence are respected.

The same privacy-safe generic copy is suitable for lock-screen display. The
application must not reveal protected screens or cached prior-identity data
while authentication restoration is pending. Foreground, background and
terminated receipt/tap handling all normalize to the same portable route
intent, authenticate/restore, refetch and render current state. Unknown
versions/kinds are ignored with safe telemetry.

Duplicate or out-of-order receipt may update an in-memory attention marker but
must not create duplicate domain actions. There is no exactly-once display
promise.

## 12. Delivery state machine

| State | Meaning | Entered from | Legal next states | Retryable? | Terminal? | Observability |
| --- | --- | --- | --- | --- | --- | --- |
| PENDING | Never claimed for provider work | Delivery creation | LEASED, SUPPRESSED, EXPIRED | Yes, by first claim while due/unexpired | No | Due/backlog age and candidate count |
| LEASED | One worker owns the current fenced attempt | PENDING, RETRY_WAIT or expired LEASED reclaim | PROVIDER_ACCEPTED, RETRY_WAIT, SUPPRESSED, PERMANENT_FAILURE, EXPIRED, or fenced LEASED reclaim | Only through bounded retry/reclaim | No | Claim latency, attempt and reclaim counts; no lease token label |
| RETRY_WAIT | Retryable result waits until `next_attempt_at` | LEASED | LEASED, SUPPRESSED, EXPIRED | Yes, only when due and within attempts/TTL | No | Safe result class and scheduled delay bucket |
| PROVIDER_ACCEPTED | Provider accepted the request | LEASED after ACCEPTED | None | No | Yes | Accepted count/latency; never “displayed” |
| SUPPRESSED | Current eligibility or endpoint state forbids send | PENDING, RETRY_WAIT or LEASED | None | No | Yes | Controlled suppression reason count |
| PERMANENT_FAILURE | Provider/payload result is non-retryable or attempts are exhausted | LEASED | None | No | Yes | Safe terminal result class and attempt count |
| EXPIRED | Intent freshness ended before accepted delivery | PENDING, RETRY_WAIT or LEASED | None | No | Yes | Expiry/backlog-age count |

Allowed transitions are explicit; there is no arbitrary state-setting route.
Finalization must match delivery ID + `LEASED` + exact current lease token.

## 13. Retry, lease and provider-result contract

Each push kind has a versioned typed server policy containing finite positive
intent TTL, maximum attempts, lease duration, provider-call timeout, exponential
backoff base/cap and retention values. The selected values are operational
configuration, not tenant/location policy and not yet safely derivable from
repository evidence. MOB-020 must require them explicitly and fail closed at
startup if absent or invalid; it must not smuggle in unreviewed defaults.

The following bounds are architectural and not configurable away:

- maximum attempts and TTL are finite;
- provider timeout is shorter than the lease;
- retry uses exponential backoff with full jitter and a finite cap;
- rate-limit `Retry-After` is honored only after clamping to the remaining TTL
  and configured cap;
- no attempt starts at or after intent expiry;
- a retry is scheduled only when another attempt can begin before expiry;
- attempt count increments atomically at claim; and
- provider TTL is the remaining intent lifetime, never the provider default.

The provider adapter returns exactly one normalized class:

| Result class | Delivery action | Registration action | Operations action |
| --- | --- | --- | --- |
| ACCEPTED | PROVIDER_ACCEPTED | None | Count accepted latency; do not claim displayed. |
| TRANSIENT | RETRY_WAIT if within bounds, else terminal | None | Safe rate/error metric. |
| RATE_LIMITED | RETRY_WAIT using bounded/clamped delay | None | Alert sustained throttling. |
| INVALID_ENDPOINT | PERMANENT_FAILURE; suppress other unsent rows for endpoint | Conditionally PROVIDER_INVALID if token version still matches | Count invalidation, no token label. |
| PERMANENT | PERMANENT_FAILURE | None unless the exact provider mapping proves endpoint invalid | Alert unexpected payload/permanent rate. |
| CONFIGURATION | Retry only within the same TTL/attempt bounds | None | Fail-closed provider circuit and urgent deployment alert. |
| UNKNOWN | Treat as retryable ambiguous outcome within bounds | None | Count unknown outcome; duplicate delivery is possible. |

Provider-specific codes must have a tested exhaustive mapping. FCM
`UNREGISTERED` is INVALID_ENDPOINT. FCM `INVALID_ARGUMENT` is INVALID_ENDPOINT
only after the adapter proves the payload itself is valid; otherwise it is a
payload PERMANENT failure. Authentication/project configuration errors are
CONFIGURATION, never mass token invalidation.

## 14. Atomic claim and fenced finalization

The worker operates inside the API modular monolith deployment boundary; a
separate microservice or queue product is not required.

Claim/reclaim is one short database transaction that atomically selects due
PENDING/RETRY_WAIT rows or expired LEASED rows, writes a new unique lease token
and bounded lease expiry, increments attempt count, and commits. The worker then
rechecks eligibility and registration/token version. Provider I/O occurs only
after that commit and outside any database transaction.

Finalization is a new short transaction conditioned on the exact lease token.
A stale worker cannot overwrite a reclaiming worker's result. If the provider
accepted but the worker crashed or the database was unavailable before
finalization, the expired lease is reclaimed and may send again. This is an
explicit at-least-once provider-attempt ambiguity; exactly-once device display
is impossible and is not claimed.

Provider cancellation/timeout does not prove the provider rejected the
request. It is UNKNOWN. The worker must preserve the possibility that the first
request was accepted and retry only within the accepted bounded policy.

## 15. Required delivery and lifecycle sequence diagrams

### Sequence A. Successful native endpoint registration

```text
Native app -> OS/provider: request permission and current native token
OS/provider --> Native app: permission granted + token T1
Native app -> API: authenticated desired-state PUT(T1, install I, build, locale)
API -> DB: resolve exact StaffAuthSession; validate; lock I/hash(T1)
API -> DB: create ACTIVE registration R1; commit
API --> Native app: R1 + ACTIVE + safe metadata (never token)
```

### Sequence B. Provider token rotation

```text
OS/provider -> Native app: token changed T1 -> T2
Native app -> API: authenticated desired-state PUT(T2, same install I)
API -> DB: lock R1/I/hash(T1)/hash(T2)
API -> DB: R1 SUPERSEDED + create ACTIVE R2(T2); commit
API --> Native app: R2 + ACTIVE
exact retry --> same R2; no second active row
```

### Sequence C. Eligible domain event to durable intent

```text
Guest -> API: authorized retrieval request
API -> DB transaction:
  prove guest/domain state
  create RetrievalRequest + unassigned QUEUED RETRIEVAL Task Q
  PARKED -> REQUESTED + DispatchEvent + AuditEvent
  create intent N unique(kind, Q)
  derive current eligible registrations
  create one PENDING delivery per registration
DB --> API: COMMIT
worker can observe rows only after commit
```

### Sequence D. Lease, recheck, FCM send and finalize

```text
Worker -> DB: atomically claim due delivery D with lease L; commit
Worker -> DB: recheck session/User/membership/Location/access/role/Shift/
              Task/registration/token version
DB --> Worker: eligible
Worker -> FCM adapter: fixed safe payload + remaining TTL
FCM adapter --> Worker: ACCEPTED
Worker -> DB: finalize D WHERE state=LEASED AND lease=L
DB --> Worker: PROVIDER_ACCEPTED
```

### Sequence E. Transient provider failure and bounded retry

```text
Worker -> provider: attempt under lease L1
provider --> Worker: TRANSIENT or RATE_LIMITED
Worker -> DB: fenced RETRY_WAIT(nextAttemptAt within TTL); commit
clock -> Worker: due
Worker -> DB: claim with new lease L2; increment bounded attempt
Worker -> provider: retry only if current eligibility and freshness still pass
```

### Sequence F. Invalid or unregistered provider token

```text
Worker -> provider: send using registration R/token version V
provider --> Worker: conclusively INVALID_ENDPOINT
Worker -> DB transaction:
  finalize delivery PERMANENT_FAILURE under current lease
  set R PROVIDER_INVALID only if R is still ACTIVE at version V
  suppress other unsent deliveries for R
  clear raw token
DB --> Worker: COMMIT
```

### Sequence G. Worker crash after provider acceptance

```text
Worker A -> provider: send
provider --> Worker A: ACCEPTED
Worker A -X-> DB: crashes before finalization
clock: lease expires
Worker B -> DB: reclaim with new fence
Worker B -> provider: bounded retry may be accepted again
Worker B -> DB: fenced finalize
device may display twice; domain state is unchanged
```

### Sequence H. Logout or session revocation

```text
Native app -> API: native logout when reachable
API -> DB transaction: revoke StaffAuthSession + DISABLE its ACTIVE registrations
DB --> API: COMMIT
Native app: block/purge old identity + best-effort delete local provider token
worker -> DB: current eligibility recheck -> SUPPRESSED

server-side revocation follows the same send-time ineligibility even if the
device never called disable
```

### Sequence I. Notification tap and canonical refetch

```text
OS -> Native app: tap {version, kind, intentId, TASK_QUEUE}
Native app -> auth bootstrap: restore/login under DEC-072
auth bootstrap --> Native app: current identity or login required
Native app: discard stale identity/Location context
Native app -> API: authenticated canonical Task queue GET
API -> DB: current authorization + current Task state
API --> Native app: current queue / safe forbidden-or-empty result
Native app: navigation only; no protected mutation
```

### Sequence J. Same-user reauthentication on the same device

```text
User A has a prior still-valid StaffAuthSession bound to install I
User A -> API: reauthenticate as a later StaffAuthSession
User A app -> API: desired-state PUT(same install I, current token T)
API -> DB: lock exact provider/app/I/hash(T)
API -> DB: prove same User and later session; supersede prior binding
API -> DB: create ACTIVE binding for the current session atomically
API --> User A app: new registration; no prior-session identity disclosed
future delivery eligibility derives only from the current session's facts
```

## 16. Concurrency analysis diagrams

### A. Two workers claim the same delivery

```text
Worker A -> DB: atomic claim delivery D
Worker B -> DB: atomic claim delivery D
DB ------> A : lease token LA (winner)
DB ------> B : no row
A -------> provider -> fenced finalize(LA)
```

### B. Lease expires while original I/O remains unresolved

```text
A -> provider: send under LA ... unresolved
clock: LA expires
B -> DB: reclaim D with LB; commit
A -> DB: finalize LA -> rejected by fence
B -> provider: send under LB -> finalize LB
possible device duplicate is tolerated; no domain mutation occurs
```

### C. Provider accepts and worker crashes before persistence

```text
A -> provider: accepted
A -X-> DB: no finalization (crash)
lease expires
B -> DB: reclaim -> provider may accept again
B -> DB: PROVIDER_ACCEPTED
```

### D. Token rotates while an old delivery is leased

```text
Client -> API: rotate token T1 -> T2
API -> DB: T1 registration SUPERSEDED; T2 registration ACTIVE; commit
Worker -> DB: recheck leased T1 registration
DB --> Worker: not ACTIVE / token version changed
Worker -> DB: fenced SUPPRESSED; no provider send
```

### E. Logout races with delivery

```text
Client -> API: native logout
API -> DB: revoke session + disable registrations atomically
Worker -> DB: current-session eligibility recheck
DB --> Worker: ineligible -> SUPPRESSED
if provider acceptance won before commit: generic payload may arrive;
tap must authenticate/refetch and fails closed
```

### F. Reassignment races with delivery

```text
Dispatcher -> DB: assign Task; commit
Worker -> DB: recheck Task is unassigned QUEUED retrieval
DB --> Worker: false -> SUPPRESSED
if assignment commits after recheck: generic attention may arrive;
tap/refetch shows canonical assignment state
```

### G. Session revocation races with delivery

```text
Admin/auth flow -> DB: revoke StaffAuthSession
Worker -> DB: recheck session/User/scope
DB --> Worker: revoked -> SUPPRESSED
post-recheck revocation is contained by generic payload + tap auth
```

### H. Duplicate domain trigger

```text
Request 1 -> DB: create Task Q + intent(kind,Q)
Request 2 -> DB: semantic retry observes Q
unique(kind, task_id) -> one intent
unique(intent_id, registration_id) -> one delivery per device
```

### I. Domain transaction rolls back

```text
guest command transaction:
  Task + session transition + audit + intent + deliveries
  one write fails
DB: ROLLBACK ALL
worker: no visible push rows; no false notification
```

### J. Database unavailable during finalization

```text
Worker -> provider: accepted or unknown
Worker -> DB: finalize -> unavailable
Worker: do not fabricate success and do not mutate domain state
lease expires; bounded reclaim/retry may duplicate
alert finalization failures; polling remains truth
```

## 17. Security and privacy contract

Provider tokens are sensitive operational identifiers: possession may permit
unauthorized notification attempts through a compromised provider credential,
but a token is not Staff authentication or domain authorization. Treat the raw
value as restricted data and its hash as sensitive correlation data.

Required controls are:

- TLS for registration and provider traffic;
- provider credentials only in accountable deployment secret management;
- least-privilege registration/sender database access;
- raw-token redaction in logs, traces, metrics, errors, AuditEvent, fixtures and
  support tooling;
- safe payload allowlisting and byte/field limits;
- current server-derived tenant/Location/role/Shift/Task checks twice;
- authorization before registration mutation;
- conditional invalidation tied to exact registration/token version;
- non-disclosing cross-tenant/not-owned registration responses;
- no notification content sourced from untrusted input; and
- no notification handler performing a protected mutation.

Push intent/delivery bookkeeping is operational telemetry, not Black Box
custody history. It does not add an AuditEvent for every attempt. Sensitive
administrator/provider-credential changes remain separately auditable through
deployment/security controls.

## 18. Threat model

| Threat | Server defense | Client behavior | Failure mode | Test/evidence |
| --- | --- | --- | --- | --- |
| 1. Cross-tenant delivery | Same-Organization composite FKs plus current server eligibility | Refetch through authenticated API | Suppress/non-disclose | Cross-tenant integration and DB constraint tests |
| 2. Cross-Location delivery | Exact Task Location, explicit access and exact-Location ACTIVE Shift at create/send | Never trust payload Location | Suppress | Wrong-Location negative tests |
| 3. Stale Task assignment | Require unassigned `QUEUED` retrieval again before send | Refetch queue on tap | Generic stale alert possible in TOCTOU window | Assignment race test |
| 4. Revoked session | Current session join at send | Restore fails, purge/login | Suppress; already accepted generic alert may arrive | Revocation race/e2e |
| 5. Disabled User | Active User at resolution/create/send | Purge on auth loss | Suppress | Disabled-user integration test |
| 6. Logout unregister failure | Atomic server logout+disable when request arrives; current session eligibility | Local block/purge and best-effort provider-token delete | Unconfirmed logout can leave short residual until server learns | Offline logout physical test |
| 7. Session/account change | Same-user later-session rebind; different-User active ownership fails closed | Purge all old identity state before new context | Reauthenticate same User safely; reject cross-User collision | Same-user reauth and A->B negative tests |
| 8. Provider-token theft | Token is non-authority; strict authenticated registration; server credentials secret | Never log/share token | Attacker with provider credentials could send generic/forged OS alerts | Redaction/secret review |
| 9. Forged registration | Bearer-authenticated current session; strict allowlists; no caller identity fields | Send token only after auth | Reject without write | Auth/unknown-field/spoof tests |
| 10. Token rotation race | Locks, active uniqueness and conditional token-version invalidation | Register rotation immediately | Old delivery suppressed; one ACTIVE winner | PostgreSQL concurrency test |
| 11. Duplicate intent | Unique kind + Task ID and same transaction as domain trigger | Dedupe display by intent ID only | One intent; provider can still duplicate | Semantic retry test |
| 12. Lease race | Atomic claim plus unique lease token/fenced finalization | No business action on receipt | One current DB owner | Two-worker concurrency test |
| 13. Crash after provider accept | Bounded lease/reclaim; explicit ambiguous outcome | Tolerate duplicate presentation | Duplicate provider/device delivery possible | Crash injection test |
| 14. Infinite retry | Finite TTL/attempts/cap; no claim after expiry | Polling continues | Terminal expiry/failure | Fake-clock retry property tests |
| 15. Provider outage | Bounded retry/circuit telemetry; domain transaction never waits on provider | Poll/refetch | Missed/delayed attention only | Adapter outage test/runbook drill |
| 16. Invalid provider credentials | CONFIGURATION classification, no token invalidation, urgent alert | Poll/refetch | Provider send disabled/degraded | Invalid-credential sandbox test |
| 17. Secret/PII payload | Fixed schema/template allowlist and forbidden-field tests | Ignore unknown schema | Build/send fails closed | Payload snapshot/redaction tests |
| 18. Lock-screen disclosure | Generic EN/AR copy without operational details | Respect OS privacy settings | Generic attention visible | Locked-device physical review |
| 19. Stale tap | No authority in payload; auth + canonical queue refetch | Show current queue or neutral unavailable state | No stale protected screen/action | Stale/expired tap lifecycle test |
| 20. Tap causes mutation | Route intent supports navigation only | Explicit user command required | No automatic claim/transition | Handler unit/e2e assertion |
| 21. Rooted/repacked binary | Server trusts no app/device/install/provider token as authority | Best-effort local storage only | Compromised device can observe its own generic alerts/token | Server spoof/authority tests; residual documented |
| 22. Duplicate/out-of-order provider delivery | Stable intent ID; current state always canonical | Dedupe presentation best effort; refetch | Duplicate visual alert possible | Inject duplicate/reordered receipts |
| 23. Reinstall | New installation ID; active uniqueness and provider invalidation | Treat as new install/login | Old endpoint remains stale until invalid/cleanup | Uninstall/reinstall physical test |
| 24. Permission denied | Push optional; no dependency in domain flow | Continue app and polling; allow later opt-in | No OS alert | Deny/allow physical test |
| 25. Endpoint unregistered | INVALID_ENDPOINT mapping and conditional terminalization | Re-register when provider issues a current token | Delivery permanent failure | FCM invalid-token sandbox test |
| 26. Database outage | Domain transaction rolls back intent with domain state; claim/finalize never fabricates success | Poll when API returns | No false committed intent; ambiguous accepted attempt may retry | DB fault injection and recovery evidence |

## 19. Failure and degradation matrix

| Condition | User impact | Domain impact | Recovery | Retry | Observability |
| --- | --- | --- | --- | --- | --- |
| DB unavailable during guest command | Retrieval request reports its normal unavailable/ambiguous API outcome | Canonical command cannot commit; no partial domain or push rows | Existing command idempotency/current-state recovery | Command-specific only; push does not retry it | API/DB availability and rollback signal |
| DB unavailable during claim/finalization | Push waits, or an accepted attempt becomes ambiguous | NONE | Lease reclaim after DB recovery | Bounded by attempts/TTL; duplicate possible | Claim/finalization failures and reclaim alert |
| Worker unavailable/backlogged | Attention is delayed or missed | NONE | Restart/drain while unexpired; polling remains truth | Due rows claim only within TTL | Backlog age, due count, expiry alert |
| FCM unavailable | Attention is delayed or missed | NONE | Adapter/provider recovery | TRANSIENT bounded retry | Provider result/rate and outage alert |
| Provider auth/config broken | No new provider acceptance | NONE | Correct deployment secret/config; reopen fail-closed circuit | CONFIGURATION only within normal bounds | Urgent configuration alert; never invalidate endpoints |
| Registration API unavailable | Device has no new/rotated remote binding | NONE | App continues polling and explicitly reconciles later | Safe desired-state PUT retry | Registration availability/outcome rate |
| Notification permission denied/channel disabled | No OS presentation | NONE | User may opt in later; app/polling continue | No server delivery retry solely for permission | Client permission/channel state, privacy-safe aggregate |
| Provider token invalid | That endpoint receives no push | NONE | PROVIDER_INVALID; app registers current token later | No delivery retry for invalid endpoint | Invalid-endpoint count |
| Stale token | Attention may be missed until invalidated/rotated | NONE | Provider invalidation or bounded cleanup | Only provider-classified bounded attempts | Stale-age/invalid-result aggregate |
| Token rotation | Brief old-endpoint suppression window | NONE | Atomic old SUPERSEDED + new ACTIVE | Desired-state PUT is idempotent | Rotation/race outcome count |
| Server eligibility changes | Candidate receives no send after recheck; a post-check generic alert may still arrive | NONE | Canonical queue/current authorization | Suppressed delivery is terminal | Suppression reason aggregate |
| App offline | Tap/refetch waits; OS may still hold/display attention | NONE | Reconnect, authenticate and canonical refetch | API safe-read policy only; no mutation replay | Client connectivity/refetch outcome without payload |
| Device offline/Doze/OEM restriction | Provider/OS may delay or drop until TTL | NONE | Device reconnect/app open/poll | Provider stores only for remaining TTL; no unbounded server retry | Accepted-versus-expired aggregates; no display claim |
| App uninstalled | Endpoint becomes stale and no useful attention arrives | NONE | Provider invalidation/cleanup; reinstall is new registration | No retry after INVALID_ENDPOINT/expiry | Invalidation and stale cleanup counts |
| App logged out, server confirmed | Old identity receives no newly eligible send | NONE | Re-login creates/reconciles a new binding | Disable is idempotent | Logout-disable outcome |
| App logged out, server unconfirmed | Generic old-identity attention may briefly arrive | NONE | Local block/token delete; later revoke, expiry or invalidation | Client may retry explicit server logout; push stays bounded | Truthful unconfirmed-logout client signal |
| Staff session revoked | New send is suppressed; accepted generic alert may arrive in race window | NONE | Reauthentication only | No push retry after failed eligibility | Revocation suppression count |
| User disabled | New send is suppressed | NONE | Authorized administrator recovery only | No push retry after failed eligibility | Disabled-user suppression count |
| Location access removed/Location inactive | New send is suppressed | NONE | Authorized scope restoration affects future intents only | No push retry after failed eligibility | Location/access suppression count |
| Shift ended | New send is suppressed | NONE | New ACTIVE Shift affects future/current eligible work only | No push retry after failed eligibility | Shift suppression count |

Push failure never rolls back or changes an already committed Task,
`ValetSession`, RetrievalRequest, DispatchEvent or AuditEvent.

## 20. Observability, alerts and retention

Safe metrics may count intent creation, candidate deliveries, suppression
reason, claims, lease reclaim, provider-result class, attempts, latency,
expiry, terminal failure and registration-state transitions. Labels may include
push kind, provider class, platform, app build, result class and environment.
They must not include provider token/hash, installation ID, registration ID,
intent ID, User/membership/session IDs, Organization/Location IDs, Task/session
IDs, guest/vehicle data or payload bodies.

Alerts are required for sustained configuration failures, provider throttling
or outage, claim/finalization database failures, abnormal lease reclaim,
backlog approaching expiry, unexpected permanent failures and suspicious
registration collisions. Logs use request/correlation IDs that are safe and
not the sensitive identifiers above.

Retention is bounded by typed server policy. Terminal registrations must clear
the raw provider token as part of terminal handling; token hashes and terminal
metadata remain only for the configured bounded troubleshooting window. Intents
and deliveries are purged after their configured bounded operational window,
subject to active investigations/holds. Active registrations require a
last-confirmed timestamp and a configured stale-endpoint policy.

Blueprint/repository authority does not define a universal legal duration, so
this decision does not invent one. MOB-020 must implement configurable bounded
values and a tested cleanup path; production enablement must record approved
values and ownership. Cleanup must be tenant-safe, batch-bounded and must not
reuse the records as custody/audit history.

## 21. Required implementation and evidence split

### MOB-020 — backend persistence and delivery

MOB-020 owns the exact schema/migration/constraints; strict registration,
rotation/update and disable contracts; native-logout integration; atomic intent
creation and eligibility expansion; send-time recheck; worker claim/lease,
retry and fenced finalization; direct FCM adapter; secrets/config; cleanup;
observability; and backend/provider sandbox evidence.

Automated proof must include:

- strict contracts, authentication and registration ownership;
- all eligibility positives/negatives and tenant/Location isolation;
- atomic domain rollback with no intent;
- intent/delivery dedupe and multiple-device fan-out;
- registration lifecycle, rotation, account switch and logout;
- database constraints and all concurrency scenarios A–J;
- retry/TTL/fake-clock boundaries and every provider result class;
- invalid endpoint versus invalid payload/config distinction;
- payload allowlist/localization/redaction;
- cleanup/retention bounds and least privilege; and
- no regression to DEC-070 Web behavior or the existing external notification
  table.

### MOB-021 — native registration and receipt integration

MOB-021 owns Expo-compatible notification dependency/config, Android channel,
permission UX, native FCM token acquisition, authenticated registration,
rotation listener/update, logout/local delete, account-switch purge, safe
payload parsing and foreground receipt behavior. It must use a Development
Build, not Expo Go, and must not introduce background domain sync.

Physical Android evidence must cover permission deny/allow/revoke, a real FCM
token and delivery, rotation/update, multiple sessions/devices, offline token
registration recovery, logout/relogin, account switch, disabled/revoked User,
invalid endpoint recovery and lock-screen privacy.

### MOB-022 — lifecycle and tap proof

MOB-022 owns deterministic foreground/background/terminated/cold-start tap
behavior, early response capture, auth/router ordering, duplicate/out-of-order
receipt, stale intent, logged-out/revoked state, canonical refetch and the full
DEC-071 physical-device/OEM matrix.

No MOB-021/022 result may claim guaranteed delivery or exactly-once display.

## 22. Rollback and deployment boundary

Provider sending is separately enableable per environment through typed server
configuration. A push incident is rolled back by disabling new intent creation
and worker/provider sending, then allowing or explicitly terminalizing already
persisted rows according to the runbook. Employee Web and Native canonical
polling/refetch continue unchanged; no domain data rollback or client-to-client
migration is required.

Application builds must tolerate the backend push capability being absent or
disabled. Backend deployment must tolerate no registered devices. Later APNs
activation requires its adapter, credentials, sandbox/production token handling
and physical iOS evidence, but does not reopen this provider-neutral contract.

## 23. Scope exclusions

MOB-003 adds no code, dependency, Firebase/APNs project, credential, schema,
migration, endpoint, worker, cron, service worker, Web Push, Web notification
change, Employee Web change, native scaffold, registration, delivery or device
behavior. It does not start MOB-004, MOB-020, MOB-021 or MOB-022.

It does not accept silent/background domain synchronization, background
mutation, a notification center, arbitrary notification kinds, assignment
push, guest native push, topics, broadcast fan-out, marketing push, geofencing,
generic events, Redis, Kafka, microservices or exactly-once delivery.

## Decision firewall

All material MOB-003 semantics are locked here: the one eligible kind,
audience, two-time eligibility, attention-only behavior, provider boundary,
strict registration/session binding, lifecycle, payload, persistence,
dedupe, state machines, lease fencing, bounded retry, unknown-outcome behavior,
privacy, retention boundary, observability, rollout and MOB-020–022 split.

Exact operational TTL/attempt/lease/backoff/retention values are intentionally
not invented. They are required typed deployment policy and production evidence,
not permission to alter the state machine or make retry unbounded. Any material
change to the locked contract or any additional push kind requires a focused
Accepted Decision before implementation.

## 24. External platform evidence

- Firebase registration-token lifecycle and invalidation:
  `https://firebase.google.com/docs/cloud-messaging/manage-tokens`
- Firebase error taxonomy:
  `https://firebase.google.com/docs/cloud-messaging/error-codes`
- Firebase message TTL:
  `https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan`
- Expo direct native device-token path:
  `https://docs.expo.dev/push-notifications/sending-notifications-custom/`
- Expo notification receipt/tap lifecycle:
  `https://docs.expo.dev/push-notifications/what-you-need-to-know/`
- Apple device-token registration and rotation guidance:
  `https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns`
- Apple best-effort ordering/storage behavior:
  `https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns`
