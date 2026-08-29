# DEC-070 — Retrieval Request and Vehicle Ready Foreground Notification MVP

Status: Accepted
Date: 2026-08-29
Issue: #192

## 1. Problem

The Employee application already receives an authorized Location task queue,
and the Guest application already receives its bearer-authorized ValetSession
progression. Both refresh every five seconds while visible, but neither surface
presents a distinct foreground notification when a new guest Retrieval Task is
created or when the vehicle first becomes READY.

The MVP needs those two operational cues without creating a general
notification platform, duplicating lifecycle truth, weakening tenant/Location
or GuestAccess boundaries, or replaying disruptive sound on ordinary polling,
rendering, reconnect, or idempotent domain retries.

This decision is Accepted after owner/independent review. Its accepted summary
must be mirrored into `docs/08_DECISIONS_LOG.md` before implementation begins.

## 2. Product scope

This MVP contains exactly two user-visible foreground notification concepts:

1. `EMPLOYEE_RETRIEVAL_REQUESTED`, presented with sound class
   `RETRIEVAL_TASK_ALERT`, when a genuinely new guest retrieval lifecycle
   creates a new unassigned QUEUED RETRIEVAL Task.
2. `GUEST_VEHICLE_READY`, presented with sound class `VEHICLE_READY_ALERT`,
   when the existing Mark Ready command first commits `RETRIEVING -> READY`.

These names are presentation concepts. They do not add AuditEvent,
DispatchEvent, database-enum, or generic event-bus types.

## 3. Existing authoritative lifecycle anchors

### 3.1 Guest retrieval request

`requestGuestRetrieval(...)` in
`apps/api/src/modules/retrieval/guest-retrieval-request-command.ts` is the
authoritative source. Under the existing GuestAccess transaction and lock it
atomically:

- inserts one `RetrievalRequest(status = OPEN)`;
- creates one `Task(task_type = RETRIEVAL, status = QUEUED,
  current_assignee_membership_id = NULL, version = 1)`;
- appends `DispatchEvent(QUEUED)`;
- changes the ValetSession `PARKED -> REQUESTED`, sets
  `retrieval_requested_at`, and increments its version; and
- appends `AuditEvent(RETRIEVAL_REQUESTED)`.

DEC-040 makes coherent `REQUESTED`, `RETRIEVING`, `READY`,
`HANDOFF_PENDING`, and completed retries non-mutating current-progression
reads. HTTP invocation, button press, refresh, or retry is therefore not a
notification trigger. Creation of the new RETRIEVAL Task is the trigger.

The stable Employee presentation identity is the new `Task.id`.

### 3.2 Vehicle ready

`createMarkReadyCommandExecutor(...)` in
`apps/api/src/modules/retrieval/mark-ready-command.ts` and
`markReadySession(...)` in `mark-ready-mutations.ts` are the authoritative
source. After staff principal resolution, persisted Task/session scope,
current owner eligibility, expected session version, `IN_PROGRESS` Retrieval
Task, `RETRIEVING` session, and `ACCEPTED` RetrievalRequest are proved, the
command:

- changes the ValetSession `RETRIEVING -> READY`;
- sets the database-authoritative `ready_at`;
- increments the session version exactly once;
- leaves the Retrieval Task `IN_PROGRESS`;
- leaves the RetrievalRequest `ACCEPTED`;
- stops configured Retrieval tracking; and
- appends the existing Mark Ready audit atomically.

Handoff and release remain later, separate operations. No `ARRIVED`,
`AVAILABLE`, `CUSTOMER_READY`, `PICKUP_READY`, or other lifecycle state is
introduced.

`ready_at` is written only by the guarded first Mark Ready transition and is
preserved by later handoff operations. The stable Guest presentation identity
is therefore:

```text
ValetSession.id + ready_at
```

Session version is not the notification identity because later authorized
operations increment it after READY.

## 4. Trigger matrix

| Event concept | Authoritative trigger | Recipient | Visual | Sound class | Stable identity |
| --- | --- | --- | --- | --- | --- |
| `EMPLOYEE_RETRIEVAL_REQUESTED` | Commit that creates a new unassigned QUEUED RETRIEVAL Task during the canonical guest request | Staff currently authorized to read and self-claim/act on that exact Location queue | Foreground operational banner/toast linked to the Task | `RETRIEVAL_TASK_ALERT` | Task ID |
| `GUEST_VEHICLE_READY` | First committed Mark Ready `RETRIEVING -> READY` with non-null `ready_at` | Existing bearer-authorized Guest dashboard for that exact ValetSession | Foreground positive banner/toast plus canonical READY progression | `VEHICLE_READY_ALERT` | ValetSession ID + `ready_at` |

Failed commands, stale versions, semantic retries, GETs, polling ticks,
re-renders, reconnects, handoff completion, and release are not triggers.

## 5. Employee recipient and Location scope

No new recipient or role model is introduced.

The current queue read path is:

```text
GET /v1/staff/tasks/queue?locationId=<uuid>
-> Staff principal userId
-> Location-derived OrganizationMembership
-> lockShiftOperationalEligibility(transaction, membershipId, locationId)
-> exact-Location nonterminal Task projection
```

`createTaskQueueQuery(...)` in
`apps/api/src/modules/dispatch/task-queue-query.ts` and
`lockShiftOperationalEligibility(...)` in
`apps/api/src/modules/shifts/shift-operational-eligibility.ts` currently prove:

- active User;
- active OrganizationMembership;
- active Organization;
- active exact Location in that Organization;
- explicit MembershipLocationAccess;
- current role `VALET_EMPLOYEE` or `VALET_SUPERVISOR`; and
- an ACTIVE Shift for that membership at that exact Location.

The queue query then returns only operational nonterminal PARKING/RETRIEVAL
Tasks at that exact Location. For a new unassigned QUEUED Task, either eligible
role may use the accepted self-claim path; supervisor assignment to another
member remains governed by DEC-035.

The Employee notification recipient set is exactly staff for whom this current
authorized queue read exposes the new unassigned QUEUED RETRIEVAL Task. It is
not Organization-wide, is not cross-Location, and trusts no client-supplied
Organization, membership, role, Shift, or recipient authority.

If eligibility or Location scope changes, the existing queue hard-stop/re-scope
behavior removes notification authority with the canonical queue projection.

## 6. Guest recipient and session scope

The Guest notification belongs only to the existing in-memory GuestAccess
context for the exact ValetSession. The GuestAccess bearer remains the sole
authorization boundary for canonical session refresh. A notification concept
grants no access and requires no persisted Customer row.

The raw bearer, its hash/verifier, pickup or handoff secrets, Staff identity,
tenant/Location identifiers, and other credentials must not enter notification
state, presentation payloads, logs, or analytics.

The current guest-safe projection contains only ValetSession ID, state, and
make/model/color. T2 must narrowly add nullable `readyAt` to that already
authorized projection. It must not expose session version, Task,
RetrievalRequest, assignee, Location, Organization, parking/key details, GPS,
audit data, or credentials.

## 7. Current refresh mechanisms

### 7.1 Employee

`TaskQueueController` and `useTaskQueue` currently perform:

- an initial authorized queue fetch;
- non-overlapping polling every 5,000 ms;
- polling only for an authenticated active Location scope;
- pause while hidden or offline;
- immediate refetch and restart on visibility/online recovery; and
- hard stop and scope clearing on authorization-loss responses.

At present this hook is mounted by `TaskQueueScreen`, not the app-level
authenticated operational shell. T3 must lift or compose the existing single
queue owner at that shell boundary so foreground alerts work while the Employee
uses another operational screen. It must not create duplicate simultaneous
queue polling loops.

### 7.2 Guest

`GuestSessionProvider` currently performs:

- initial bearer-authorized session load;
- non-overlapping visible-page polling every 5,000 ms;
- immediate refresh when the page becomes visible;
- manual `refreshSession()` support; and
- no further polling after canonical `COMPLETED`.

The provider already spans the live Guest application, so T4 can compose READY
transition detection there without adding another polling loop.

Neither application currently uses SSE, WebSocket, React Query, SWR, or another
server-push transport for these projections.

## 8. Transport options considered

### Option A — existing polling/refetch plus transition detection

Advantages:

- reuses two production-composed, authorized, 5-second polling boundaries;
- canonical Task/session responses remain business truth;
- naturally recovers after temporary offline/hidden periods;
- adds no connection lifecycle, live authorization stream, backplane, or
  deployment dependency; and
- keeps notification failure outside domain mutation transactions.

Limitations:

- foreground notice latency is up to the polling interval plus request time;
- the Employee poll owner must be moved to the authenticated operational shell;
- Guest safe state needs the existing immutable `ready_at` projected as
  `readyAt` to dedupe the exact first READY transition safely.

### Option B — lightweight SSE signal followed by canonical refetch

SSE could reduce latency while keeping the signal non-authoritative, but the
repository has no current SSE infrastructure. It would require new authenticated
long-lived endpoints, reconnect/resume policy, connection authorization and
revocation behavior, deployment/proxy validation, and likely a multi-instance
fan-out decision. Those concerns are disproportionate for two foreground
events already recoverable within the established 5-second polling cadence.

### Selected MVP transport

Select Option A.

The MVP is near-realtime foreground presentation through existing canonical
polling/refetch. No SSE, WebSocket, Redis, Kafka, NATS, RabbitMQ, third-party
realtime service, or generic event bus is added.

If measured pilot latency later proves the 5-second cadence insufficient, a
separate decision may add a lightweight live invalidation signal followed by
the same authorized canonical refetch. The signal must never become business
truth.

## 9. Persistence decision

No dedicated notification persistence is added for this MVP.

Existing durable domain records are sufficient:

- Employee source/recovery/dedupe identity: persisted RETRIEVAL Task ID and its
  current queue state;
- Guest source/recovery/dedupe identity: persisted ValetSession ID plus
  immutable first `ready_at`.

The existing `notifications` table is for external provider delivery through
`SMS`, `WHATSAPP`, or `EMAIL`, with recipient/template/provider delivery state.
It must not be overloaded for foreground in-app presentation.

Local `displayed`, `seen`, `dismissed`, or `soundPlayed` state is ephemeral
presentation state only. It does not assign/accept/start/complete a Task, change
ValetSession state, initiate/verify handoff, release a vehicle, or create audit
truth.

## 10. Employee presentation and dedupe

The Employee visual is a short accessible operational banner/toast. Selecting
it opens the canonical Task Queue context for that Task ID. The notification
interaction itself does not assign or accept the Task; the Employee must still
use the existing authorized Task action flow, which re-proves current ownership,
eligibility, state, and version server-side.

Suggested copy:

```text
EN title: Vehicle requested
EN body:  A guest has requested their vehicle.

AR title: تم طلب المركبة
AR body:  طلب أحد الضيوف استرجاع مركبته.
```

The selected candidate asset supplied by the Product Owner is Mixkit,
“Digital quick tone,” mapped to `RETRIEVAL_TASK_ALERT`. T1 does not download or
add it and does not assert locally verified licensing. Before T3 commits any
asset, T3 must verify and record source/license provenance and must store a
project-owned local static asset; runtime hotlinking is forbidden.

Employee presentation dedupe is scoped to the current authenticated identity
generation plus active membership/Location/Shift workspace:

1. the first successful queue snapshot establishes a baseline and does not
   replay alerts for Tasks already present;
2. a later snapshot may present only an unobserved Task ID whose canonical
   projection is unassigned, `RETRIEVAL`, and `QUEUED`;
3. once observed, that Task ID cannot replay due to polling, refetch, render,
   route navigation, visibility, online recovery, duplicate response, decline
   back to QUEUED, or guest request retry; and
4. logout, authenticated identity change, or authoritative workspace re-scope
   discards the old scope's presentation state rather than carrying it into a
   different Employee or Location.

If a Task is created while the client is disconnected, the next canonical
refresh presents it only if it is still a new actionable unassigned QUEUED
Retrieval Task. If another actor already owns or advanced it, canonical queue
state still updates but no stale disruptive alert is played.

## 11. Guest presentation and dedupe

The Guest visual is a prominent accessible positive banner/toast alongside the
canonical READY dashboard state.

Suggested copy:

```text
EN title: Your vehicle is ready
EN body:  Your vehicle has arrived at the pickup area.

AR title: سيارتك جاهزة
AR body:  وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك.
```

The selected candidate asset supplied by the Product Owner is Mixkit,
“Happy bells notification,” mapped to `VEHICLE_READY_ALERT`. T1 does not
download or add it and does not assert locally verified licensing. Before T4
commits any asset, T4 must verify and record source/license provenance and use a
project-owned local static asset with no runtime hotlink.

Guest presentation dedupe uses `valetSessionId + readyAt`:

1. the initial authorized session snapshot establishes a baseline; an already
   non-null `readyAt` renders canonical progression but does not replay sound;
2. the first later observation of a new non-null `readyAt` for the same session
   may present one visual and one sound attempt;
3. the stable identity is retained for the mounted GuestAccess presentation
   lifecycle, so polling, manual refresh, render, visibility, reconnect,
   duplicate response, handoff abort back to READY, stale Mark Ready, and later
   session version changes do not replay it; and
4. DEC-064 remains authoritative: the raw Guest token and presentation state
   stay memory-only, and a full reload after fragment scrubbing intentionally
   loses access. Reopening an original valid link starts with an authoritative
   baseline and does not replay an already-existing READY sound.

If a refresh misses the literal READY state because the session has already
advanced to `HANDOFF_PENDING`, newly observed `readyAt` still proves the first
Mark Ready transition. A terminal `COMPLETED` snapshot renders completion and
must not emit a late disruptive READY presentation.

## 12. Recovery and failure isolation

A missed poll, hidden page, offline interval, or failed future live signal can
never lose or roll back business truth.

- The Employee Task remains in the authoritative queue and is recovered by the
  next authorized queue refresh.
- The Guest ValetSession state and `readyAt` remain authoritative and are
  recovered by the next bearer-authorized session refresh.
- Notification/presentation failure never retries guest retrieval, creates a
  second Task, retries Mark Ready, or changes Task/session/handoff state.
- Audio playback failure never converts a successful domain command into a
  failure and never starts a repeated disruptive retry loop.

## 13. Foreground audio and autoplay degradation

There are exactly two distinct foreground in-app sound classes and assets:

1. `RETRIEVAL_TASK_ALERT` — short, operational, attention-getting;
2. `VEHICLE_READY_ALERT` — positive, arrival-oriented, and audibly distinct.

Standard browser audio capability is sufficient; no audio library or
notification permission prompt is required. Each authenticated app shell may
record the first trusted pointer/keyboard interaction and prepare its local
audio element for later foreground playback. Playback is attempted only while
the relevant application is foregrounded.

Browser autoplay policy remains authoritative. A rejected or unavailable
playback promise is caught once for that stable presentation identity. The
visual remains, canonical data remains updated, and no repeated sound retry is
scheduled. Sound is supplementary and cannot be the only communication channel.

## 14. Security, privacy, localization, and accessibility

Notification presentation and any future invalidation signal use minimum
necessary data. They must not carry Guest bearer or handoff secrets, Staff auth
tokens/cookies, pickup codes, payment internals/provider references, raw GPS or
whole-shift tracking, audit blobs, private asset URLs, Customer phone, or
unnecessary Customer identity.

Employee presentation is limited to the existing authorized exact-Location
Task projection. Guest presentation is limited to the existing exact-session
GuestAccess projection. Client-provided tenant, Location, membership, role,
Customer, or recipient fields never expand authority.

Both presentations require English and Arabic copy, correct RTL/LTR layout,
LTR isolation for plate/model identifiers where displayed, accessible visual
text, and operation without sound for muted devices, blocked audio, missing
assets, or users with hearing impairments.

## 15. Authorization-before-mutation preservation

DEC-070 introduces no new protected domain mutation.

Trigger A remains inside the existing DEC-040 transaction in this order:

1. Guest bearer shape and anti-abuse boundary;
2. persisted GuestAccess resolution and locked ValetSession scope;
3. exact session-state/lifecycle coherence proof;
4. RetrievalRequest, Task, DispatchEvent, session transition, and AuditEvent;
5. anti-abuse finalization and commit;
6. authorized guest-safe response.

Trigger B remains inside the existing Mark Ready transaction in this order:

1. Staff principal authentication;
2. persisted locked session/Task/RetrievalRequest scope;
3. current actor membership, exact Location, operational eligibility, and Task
   ownership proof;
4. expected-version and lifecycle guards;
5. `RETRIEVING -> READY`, tracking stop, and AuditEvent;
6. commit and authoritative response.

Polling observes only committed canonical state. Presentation cannot authorize
or execute either mutation, and retry/fallback reads must continue through the
same existing GuestAccess or staff queue authorization boundaries.

## 16. Explicitly out of scope

This MVP excludes:

- Web Push, browser background/OS notifications, Notification API permission,
  PushSubscription, VAPID, custom OS sounds, and service-worker push delivery;
- SMS, WhatsApp, Email, provider integrations, or external delivery callbacks;
- reassignment, unrelated assignment, cancellation, incident, severity,
  geofence, supervisor, escalation, SLA, or scheduled reminder alerts;
- notification center/history, unread badge/count, persistent read/seen state,
  generic templates, Dashboard notification administration, marketing, or
  engagement notifications;
- notification table/schema changes, new migrations, generic event bus, Redis,
  Kafka, NATS, RabbitMQ, WebSocket, or third-party realtime services;
- Task/Dispatch, Retrieval, GuestAccess, handoff/release, payment, Maps/GPS, or
  lifecycle redesign; and
- audio download or asset commit during T1.

## 17. Implementation decomposition

### T2 — Guest READY transition identity projection

- add nullable `readyAt` to the shared guest-safe session response contract;
- project existing `valet_sessions.ready_at` through both normal and locked
  GuestAccess session projections and existing guest Retrieval responses;
- preserve bearer authorization, no-store, anti-abuse, and minimum-data rules;
- add contract/API/integration proof that `readyAt` is null before Mark Ready,
  becomes the authoritative timestamp after Mark Ready, remains stable through
  later states, and leaks no added internal scope;
- no notification endpoint, live transport, table, migration, or UI/audio.

### T3 — Employee Retrieval foreground notification UX

- lift/compose one existing authorized task-queue polling owner at the active
  Employee operational shell so all foreground screens share it;
- baseline and dedupe exact new actionable Retrieval Task IDs within the scoped
  workspace;
- add accessible EN/AR/RTL visual presentation and navigation to the canonical
  Task Queue context without mutating the Task;
- verify and record the “Digital quick tone” asset provenance before adding a
  local static asset;
- implement one `RETRIEVAL_TASK_ALERT` playback attempt with safe autoplay
  degradation;
- do not redesign the Employee application or create a second polling loop.

### T4 — Guest READY foreground notification UX

- compare authorized Guest session snapshots using
  `valetSessionId + readyAt` at the existing GuestSessionProvider boundary;
- baseline and dedupe the first observed transition identity;
- add accessible EN/AR/RTL visual presentation while preserving the canonical
  READY screen;
- verify and record the “Happy bells notification” asset provenance before
  adding a local static asset;
- implement one `VEHICLE_READY_ALERT` playback attempt with safe autoplay
  degradation;
- do not redesign the Guest dashboard or add another polling loop.

No SSE/backend live-signal slice is proposed because repository inspection
shows the existing 5-second canonical polling paths are the smaller safe MVP.
T2 is limited to the missing Guest transition identity projection.

## 18. Required test matrix

### T2

- GuestAccess rejects invalid/expired/revoked credentials exactly as today and
  never returns another session's `readyAt`.
- Same-session reads return `readyAt = null` before Mark Ready and the persisted
  timestamp after the first successful Mark Ready.
- Failed/stale/repeated Mark Ready produces no new transition identity.
- `readyAt` remains stable through handoff initiation/abort/completion reads.
- Contracts reject extra/private notification or authority fields.

### T3

- Initial queue hydration does not alert existing Tasks.
- A newly observed unassigned QUEUED RETRIEVAL Task alerts once by Task ID.
- PARKING, already assigned/accepted/in-progress, and other-Location Tasks do
  not produce the new-request alert.
- Poll/refetch/render/route change/visibility/reconnect/duplicate response and
  decline-back-to-QUEUED do not replay the Task ID.
- Logout, identity change, and Location/Shift re-scope cannot carry seen IDs or
  notification data into another workspace.
- Missed polling recovers the canonical Task; it alerts only if still new and
  actionable.
- Clicking opens the canonical Task Queue context and performs no mutation;
  later Task action remains independently authorized.
- Audio failure leaves the visual and canonical queue state intact and is not
  retried disruptively.
- EN/AR/RTL, LTR identifier isolation, keyboard/screen-reader presentation,
  and no-sound comprehension are covered.

### T4

- Initial hydration with existing `readyAt` shows canonical progression but
  does not replay sound.
- A snapshot changing from null to a new `readyAt` alerts once using
  ValetSession ID + timestamp.
- Poll/refetch/render/visibility/reconnect/duplicate response and
  `HANDOFF_PENDING -> READY` abort do not replay the identity.
- A skipped intermediate READY state can recover from newly observed
  `readyAt`; terminal COMPLETED does not emit a late disruptive alert.
- Invalid/expired/revoked GuestAccess cannot receive another session's state or
  presentation.
- Audio failure leaves the visual and canonical session state intact and is not
  retried disruptively.
- EN/AR/RTL, accessibility, muted-device, and blocked-autoplay behavior are
  covered.

The existing guest-request and Mark Ready concurrency/idempotency suites remain
authoritative: concurrent guest requests create one Task; semantic retries do
not create another; stale/failed/repeated Mark Ready cannot create another
`ready_at`. DEC-070 adds presentation-delta tests and no new domain mutation
race.

## 19. Consequences

- Two distinct foreground operational notifications are added without a
  general notification platform.
- The existing 5-second polling mechanisms remain the selected MVP transport.
- One narrow guest-safe `readyAt` projection enables exact recovery and dedupe
  without another persistence model.
- Canonical Task/ValetSession state remains authoritative even when visual or
  audio presentation fails.
- The external-channel `notifications` table remains untouched.
- No schema, migration, dependency, generic realtime infrastructure, or domain
  lifecycle change is required.
