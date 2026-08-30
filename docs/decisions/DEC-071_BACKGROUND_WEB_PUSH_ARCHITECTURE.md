# DEC-071 — Background Web Push Architecture

Status: Proposed
Date: 2026-08-30
Issue: #197

## 1. Context and problem

Accepted DEC-070 adds two foreground notifications by observing authorized,
canonical polling projections. It explicitly leaves Web Push, operating-system
notifications, `PushSubscription`, VAPID, permission UX, and service-worker
delivery out of scope.

Issue #197 asks whether those same two presentation concepts can also reach a
browser while its page is hidden or closed without turning delivery into
business authority, leaking credentials, weakening exact-Location or
exact-session access, or creating a generic notification platform.

The required order remains:

```text
authoritative domain commit
-> durable notification-delivery intent
-> current recipient authorization
-> Web Push attempt
-> notification click
-> normal application authentication/authorization
-> canonical state refetch
```

Web Push is lossy, platform-controlled presentation. It is never Task,
ValetSession, RetrievalRequest, handoff, release, payment, or audit truth.

## 2. Scope and non-goals

This proposal supports exactly:

1. `EMPLOYEE_RETRIEVAL_REQUESTED`
2. `GUEST_VEHICLE_READY`

It does not add marketing, engagement, escalation, reminders, a notification
center, unread state, Dashboard template administration, SMS/WhatsApp/Email,
generic domain events, WebSocket/SSE, Redis, Kafka, NATS, RabbitMQ, or a
customizable background sound.

This decision slice changes documentation only. It adds no schema, migration,
dependency, production code, VAPID key, or Service Worker behavior.

## 3. Relationship to Issue #192 and DEC-070

DEC-070 remains authoritative for foreground behavior, recipient meaning,
stable presentation identities, canonical polling, EN/AR accessibility, and
failure isolation.

Background Web Push is an additional best-effort delivery layer. A push never
replaces the employee Task queue, GuestAccess session refresh, or DEC-070
foreground detection. If background delivery is delayed, duplicated, or lost,
the applications still recover from canonical persisted state.

## 4. Repository facts discovered

- The Employee app uses Next.js 16.2.11 and React 19.2.8, has an installable
  manifest, and has no Service Worker or Push API code.
- The Customer app uses the same Next.js/React versions and already registers
  `apps/customer/public/sw.js` in production. That Service Worker only caches
  same-origin safe static assets and explicitly excludes API, guest, and
  Authorization-bearing requests. It has no `push` or `notificationclick`
  handler.
- No Web Push/VAPID dependency, sender, delivery worker, transactional outbox,
  delivery-intent table, or retry lease exists.
- `notifications` persists external `SMS`, `WHATSAPP`, and `EMAIL` provider
  delivery only. DEC-070 prohibits overloading it for foreground presentation.
- Staff access resolves to exactly `{ userId }`. A durable
  `StaffAuthSession.id` exists, survives access-token rotation, and is revoked
  by logout/replay while remaining independent per login/device session.
- GuestAccess has no independent principal row. Its current verifier, expiry,
  and revocation fields live directly on `ValetSession` and are replaced on
  issue/rotation.
- DEC-064 keeps the raw Guest bearer memory-only. After fragment scrubbing, a
  full page reload or closed-page relaunch intentionally loses GuestAccess.
- Employee locale is stored in a non-secret locale cookie. Customer locale is
  stored in localStorage, which a Service Worker cannot read directly.

## 5. Supported notification classes and authoritative identities

| Presentation class | Authoritative committed fact | Stable identity |
| --- | --- | --- |
| `EMPLOYEE_RETRIEVAL_REQUESTED` | First transaction that creates the unassigned `QUEUED` `RETRIEVAL` Task | `Task.id` |
| `GUEST_VEHICLE_READY` | First Mark Ready transaction that writes non-null `ready_at` | `ValetSession.id + ready_at` |

HTTP requests, retries, polling ticks, Service Worker wakes, and sender retries
are not event identities.

## 6. Employee subscription authority

An Employee subscription should bind to the existing `StaffAuthSession`, not
to an active Shift and not only to a platform-wide User.

Reasons:

- access tokens rotate while `StaffAuthSession.id` remains stable;
- logout and refresh replay revoke that exact browser/login family;
- separate login sessions can own separate device subscriptions;
- binding only to User would allow a logged-out shared device to remain
  eligible while another session for the User stayed active; and
- Shift is dynamic work eligibility, not permanent device identity.

The future subscribe/unsubscribe boundary therefore needs a narrow internal
authentication result containing the persisted `StaffAuthSession.id` and its
`User.id`. DEC-023's public `StaffPrincipal` remains `{ userId }`; the new
session-aware result must be subscription-specific and must not expose the
session ID to the client or turn session data into tenant/Location claims.

At every delivery attempt, Employee eligibility must be re-proved from current
persistence:

- StaffAuthSession is unrevoked and before absolute expiry;
- User is `ACTIVE`;
- the exact Task still exists as unassigned `QUEUED` `RETRIEVAL` work;
- User has an `ACTIVE` membership in the Task's Organization;
- Organization and exact Task Location are `ACTIVE`;
- current `MembershipLocationAccess` exists for that exact Location;
- current role is `VALET_EMPLOYEE` or `VALET_SUPERVISOR`;
- the membership has an `ACTIVE` Shift at that exact Location; and
- the canonical exact-Location queue would expose that Task as actionable.

No client-supplied Organization, membership, role, Location, Shift, Task
owner, or recipient claim is trusted.

## 7. Employee queued-Retrieval recipient policy

Recipient resolution happens at send time, not Organization-wide at event
time. It selects subscriptions whose StaffAuthSession User currently has one
membership satisfying the DEC-032/DEC-070 exact-Location queue eligibility
contract for the Task's persisted Location.

If the Task is claimed, assigned, accepted, started, completed, or cancelled
before a delayed attempt, the pending Employee delivery becomes suppressed.
Ending Shift, removing Location access, changing role, disabling User,
membership, Organization, or Location, or revoking the StaffAuthSession also
makes delivery ineligible immediately after that change commits.

## 8. Customer/Guest subscription authority

The current schema has no safe persistent Guest principal that survives token
rotation without retaining old authority. Binding only to `ValetSession.id`
would allow an old device to keep receiving pushes after Staff rotates Guest
Access for a new recipient. Copying the raw bearer is forbidden, and copying
its authentication verifier into another table unnecessarily duplicates
credential material.

The minimum required model is an opaque GuestAccess generation identifier:

- stored on the ValetSession beside the current GuestAccess verifier;
- changed atomically on every issue, rotate, and revoked-access reissue;
- never derived from or exposed as the raw bearer;
- copied into a Customer push-subscription binding only after the current
  bearer authenticates; and
- compared with the ValetSession's current generation at every send attempt.

Delivery also requires current GuestAccess to be unrevoked and unexpired, the
subscription to be active, and the session to be the exact bound ValetSession.
Session completion suppresses a late vehicle-ready alert. Handoff pending may
still receive the already-authoritative `ready_at` notification, consistent
with DEC-070; no notification is sent after `COMPLETED`.

This generation identifier is authentication-lineage metadata, not a new
Customer account and not permission to read the session without the bearer.

## 9. Minimum subscription persistence model

Future persistence should use a dedicated Web Push model, not `notifications`.
Conceptually, each subscription contains only:

- server-generated UUID;
- application audience: `EMPLOYEE` or `GUEST`;
- Push endpoint capability;
- `p256dh` encryption public key and `auth` secret from PushSubscription;
- optional browser-supplied expiration timestamp;
- exactly one principal binding:
  - Employee: `StaffAuthSession.id`;
  - Guest: exact `ValetSession.id` plus GuestAccess generation identifier;
- locale snapshot: `en` or `ar`, presentation-only and never authority;
- created/updated timestamps;
- nullable disabled timestamp and bounded machine reason; and
- optional last accepted-send / last failure code and timestamp, with no raw
  provider response body.

One browser PushSubscription belongs to one Service Worker registration. The
browser normally returns that registration's existing subscription rather than
creating an independent subscription for each authenticated app principal or
Guest context.

Multiple active subscriptions per principal are supported only across distinct
Service Worker registrations/browser profiles/devices. A single registration
does not create one independent PushSubscription per principal.

The endpoint is unique across active rows. A same-principal resubscribe may
replace endpoint/key material atomically. An endpoint already bound to another
principal must not be silently rebound. Endpoint rotation creates or replaces
only the authenticated principal's device binding.

Rows use tombstone disablement rather than business hard-delete so delivery
dedupe/history FKs remain explainable. Once disabled, recoverable endpoint/key
material should be cryptographically erased or cleared while retaining only a
keyed endpoint fingerprint needed for safe duplicate detection. Endpoint,
`auth`, and related material are operational credentials and require an
approved encryption-at-rest key boundary before production rollout.

### Browser registration ownership and principal switching

An active endpoint is exclusive to its current binding. It never silently
transfers between StaffAuthSessions, ValetSessions, or GuestAccess generations.
Conflicts with an endpoint still actively owned by another principal/context
are rejected non-disclosingly; the existing binding is not revealed or changed.

Employee identity switching follows these rules:

- successful Employee logout or server-side StaffAuthSession revocation makes
  the old server binding immediately delivery-ineligible;
- when changing authenticated identity, the client should disable the old
  server binding and call browser `PushSubscription.unsubscribe()` while the
  old context is available; either cleanup failure must not transfer authority;
- a newly authenticated StaffAuthSession must establish a fresh browser
  PushSubscription before registering its server binding; and
- if the browser/provider returns an endpoint previously associated only with a
  disabled, revoked, or expired binding, the authenticated subscribe flow may
  create a new active binding under this decision's endpoint-uniqueness rules.
  If another principal still actively owns it, the flow rejects
  non-disclosingly and never silently rebinds it.

Guest context switching follows these rules:

- GuestAccess rotation or reissue invalidates the prior generation binding;
- session completion, GuestAccess expiry, or revocation disables the prior
  server binding and makes it delivery-ineligible;
- a new GuestAccess context may register only through the normal
  bearer-authorized subscribe flow for its exact ValetSession and current
  generation; and
- an existing browser PushSubscription actively owned by another Guest context
  is never stolen, replaced, or rebound silently.

The MVP supports **one active Guest push binding per Customer Service Worker
registration/browser profile at a time**. If another simultaneous Guest
ValetSession is opened in the same browser, background push for both sessions is
not supported. The new context must not silently replace the existing active
binding; DEC-070 foreground behavior remains available. Supporting concurrent
Guest sessions on one registration would require a focused future decision and
is not designed by Issue #197.

## 10. Subscribe, replace, and unsubscribe boundaries

Exact HTTP literals are deferred to the implementation contract, but four
narrow authenticated route families are required:

- Employee subscribe/replace;
- Employee unsubscribe;
- Guest subscribe/replace; and
- Guest unsubscribe.

Subscribe accepts the browser PushSubscription fields and `en`/`ar` locale
only. It accepts no tenant, Location, membership, role, Shift, User, session,
Task, or recipient authority.

Employee subscribe resolves the current StaffAuthSession and User from the
normal bearer authentication path. Guest subscribe resolves and locks the
exact current GuestAccess from the normal bearer path. The server derives all
principal binding.

Unsubscribe targets a server subscription ID and re-proves exact self-binding
before mutation. Knowledge of an endpoint or UUID is not authority. Browser
`PushSubscription.unsubscribe()` and server disablement are attempted
independently; failure of either cannot change domain state. Repeated
unsubscribe converges to the same disabled result after re-proving ownership.

## 11. Authorization-before-mutation proof

| Stage | Employee subscription | Guest subscription |
| --- | --- | --- |
| Authenticate | Resolve valid current StaffAuthSession/User | Resolve valid bearer through GuestAccess |
| Resolve target | Load existing subscription by server ID/endpoint fingerprint | Load existing subscription by server ID/endpoint fingerprint |
| Authorize | Prove binding belongs to current StaffAuthSession | Prove exact ValetSession + current generation binding |
| Protect | Lock target/unique active endpoint scope | Lock target/unique active endpoint scope and GuestAccess session |
| Mutate | Insert/replace/disable only own binding | Insert/replace/disable only exact-session generation binding |
| Audit | No tenant Black Box event proposed; security telemetry only | No tenant Black Box event proposed; security telemetry only |
| Commit | Commit before returning ID/status | Commit before returning ID/status |
| Retry/read | Re-prove binding before returning current status | Re-prove exact session/generation before returning current status |

No protected row is updated first and authorized afterward.

## 12. Event-to-delivery persistence boundary

Reliable background delivery requires a dedicated durable intent, but it must
not be inserted as a required write in the authoritative Retrieval or Mark
Ready transaction. Notification persistence availability must not make an
otherwise valid domain command fail.

The two canonical facts already provide a crash-safe derivation source:

- a committed unassigned `QUEUED` `RETRIEVAL` Task, keyed by Task ID; and
- a committed ValetSession with first non-null `ready_at`, keyed by
  ValetSession ID + `ready_at`.

A database-backed reconciler scans for eligible canonical facts that have no
matching delivery intent and inserts the intent after the domain commit. A
unique stable identity makes concurrent reconcilers and repeated scans converge
on one intent. A direct post-commit wake signal may reduce latency, but the
reconciler—not that signal—is the recovery authority. If the process crashes
immediately after the domain commit, a later scan still discovers the fact.

Old facts outside the bounded notification TTL are materialized as expired or
skipped, not delivered late. Canonical polling remains the recovery path.
Remote Web Push is never called in the domain transaction.

A database-backed sender claims due work with a bounded lease, resolves
current recipients, creates one stable per-subscription delivery identity,
commits the claim, and performs remote sends outside the domain transaction.
Hard-crash recovery must use lease expiry or an equivalent accepted
visibility mechanism; it must not depend on the killed process executing
cleanup. A worker must not requeue every in-flight row without proving its
lease expired.

This is a focused notification-delivery outbox, not a generic domain event
bus. It carries only the two types above.

## 13. Delivery recipient snapshot versus send-time authority

Intent creation snapshots no recipients. Candidate subscriptions must have
been active before the authoritative event timestamp so a later subscription
does not replay old events. Current authority is evaluated before every remote
attempt.

Race outcomes:

- Shift ends before send: suppress Employee delivery.
- Location access/role/membership/User/Organization/Location changes before a
  retry: suppress Employee delivery.
- Task is claimed before send: suppress Employee delivery.
- GuestAccess expires, is revoked, or rotates before send: suppress Guest
  delivery.
- Guest session completes before send: suppress Guest delivery.
- Subscription disables while pending: suppress that device delivery.
- Authority commits after the sender's proof but before remote send: the
  sender may emit one stale informational notification. This cannot grant
  access or mutate state; click still re-authenticates and refetches. The
  implementation must minimize this window and recheck immediately before
  send, but it must not hold authorization rows locked across remote HTTP.

## 14. VAPID and runtime configuration

Web Push is optional and disabled by default. Disabled or unavailable Web Push
must never block Retrieval or Mark Ready.

Future configuration requires:

- `WEB_PUSH_ENABLED`;
- server-only `WEB_PUSH_VAPID_PRIVATE_KEY`;
- `WEB_PUSH_VAPID_PUBLIC_KEY`;
- `WEB_PUSH_VAPID_SUBJECT` using an operator-controlled `mailto:` or HTTPS
  contact; and
- a separate server-only encryption key for persisted endpoint/auth material,
  after that key-management boundary is accepted.

The public VAPID key may be exposed to both browser builds through validated
`NEXT_PUBLIC_...` configuration. The private key and storage-encryption key
must never enter Next.js public variables, Git, logs, AuditEvent, payloads, or
browser storage.

When Web Push is enabled, API startup fails closed on missing/malformed VAPID
or storage-encryption configuration. Local development defaults to disabled;
an explicit local opt-in may use developer-only keys that are never committed.
VAPID key rotation requires resubscription because restricted subscriptions
are bound to the corresponding public key.

### Storage-encryption key rotation

T1 must define bounded operational rotation for the encryption-at-rest key used
for Push endpoint, `auth`, and related recoverable subscription material:

- ciphertext that may survive a rotation carries non-secret key-version or
  key-identifier metadata;
- deployment supports an active plus previous-key decryption window, or an
  equivalent bounded migration approach, only for the time needed to migrate;
- records are re-encrypted under the active key before the previous key retires,
  or their bindings are safely disabled and must resubscribe;
- plaintext fallback is prohibited;
- decrypted endpoint/key/auth material is never logged, traced, audited, or
  included in an error; and
- a decryption failure suppresses delivery and safely disables the affected
  binding rather than exposing, reconstructing, or guessing credential
  material.

This decision requires those rotation semantics but does not select or design a
full KMS system.

## 15. Minimum push payload and privacy contract

The encrypted payload contains only:

- presentation type;
- stable notification identity;
- localized safe title/body or an allowlisted locale-independent copy key;
- locale and text direction;
- application audience; and
- safe route hint (`TASKS` or `GUEST_HOME`), never a credential URL.

It contains no Staff access/refresh token, Guest bearer/verifier/generation,
pickup code, Dynamic QR proof, handoff secret, provider/payment secret,
Authorization/Cookie value, raw endpoint, internal tenant/Location/member
identity, audit metadata, phone, plate, GPS, parking/key detail, or private
asset URL.

The payload is presentation only. Domain-sensitive content is loaded through
normal authorization after click.

## 16. Locale and EN/AR behavior

The browser supplies only `en` or `ar` when subscribing or updating its own
subscription. Locale is presentation preference, not authorization.

The server stores that snapshot because a Service Worker cannot depend on
React state, Employee page state, or Customer localStorage. The sender uses
an allowlisted copy catalog for the two types and emits already-localized safe
title/body plus `lang`/`dir`. Changing locale while permission remains granted
updates the current device subscription. Storage failure falls back to English
without exposing domain data.

No account-wide preference system is introduced.

## 17. Service Worker ownership

Each application owns one Service Worker scoped to its own origin:

- Customer extends the existing `/sw.js`, preserving its safe-static caching
  exclusions and adding only push/click/message behavior.
- Employee adds its own root-scoped Service Worker and production registration
  at the authenticated application shell.

Each worker:

- handles `push` and validates a strict, versioned payload;
- calls `registration.showNotification()` for accepted payloads;
- uses the stable identity as a notification `tag` for OS-level replacement;
- handles `notificationclick` by closing the notification, focusing a matching
  same-origin client when available, or opening only the safe app root;
- posts the stable identity/routing hint to an existing client so foreground
  trackers can suppress replay; and
- never caches API responses, Authorization, Guest tokens, or payload secrets.

Service Worker version changes must preserve safe activation/cache cleanup and
be tested against Next.js production builds. No runtime hotlinking is allowed.

## 18. Permission UX

Permission is requested only after an explicit user action explaining the two
operational benefits. It is never requested on first page load.

- `granted`: create/update the server subscription.
- `default`: remain not subscribed and allow a later explicit attempt.
- `denied`: show non-blocking settings guidance; do not repeatedly prompt.
- later revoked: disable the server row when detected and continue foreground
  workflows.
- unsupported browser: hide/disable the control with truthful guidance.
- iOS/iPadOS: explain that Web Push requires a Home Screen web app on supported
  versions before offering the actionable permission step.

Denied, unsupported, uninstalled, or revoked permission never blocks Employee
or Guest use.

## 19. Notification click routing

Employee click behavior:

1. focus/open the Employee app root;
2. allow normal HttpOnly refresh-cookie bootstrap or interactive login;
3. route toward the Task queue using only the safe `TASKS` hint;
4. refetch the authorized exact-Location queue; and
5. never auto-claim, assign, accept, or start the Task.

Customer click behavior uses safe degraded re-entry:

- If a matching Customer client is already open, focus it, send the stable
  identity, and let its existing in-memory GuestAccess refetch canonical state.
- If no client remains, DEC-064 leaves no credential available to the Service
  Worker or newly opened page. Open a credential-free re-entry screen that
  clearly asks the guest to reopen the original secure link or rescan the
  VAYLET QR. The screen must not disclose or restore the exact ValetSession.

No payload, query, path, fragment, or Service Worker store may contain a Guest
bearer, duplicate verifier, restorable GuestAccess credential, hidden session
authority, or substitute click credential.

## 20. Owner resolution — safe degraded Customer re-entry

`U-001` is resolved by the project owner in favor of safe degraded re-entry.

After a valid vehicle-ready push click:

1. The push payload and notification click URL remain credential-free.
2. If an already-authorized Customer client is open, the Service Worker focuses
   it and signals the stable notification identity. That client refetches using
   only its existing in-memory GuestAccess context.
3. If the Customer PWA/page was fully closed and GuestAccess is gone, the click
   opens a credential-free re-entry screen. It clearly asks the guest to reopen
   the original secure link or rescan the VAYLET QR.
4. The click flow must not persist a raw bearer, duplicate verifier, restorable
   GuestAccess credential, hidden session authority, or credential-bearing URL.

This resolution preserves DEC-064 unchanged. It intentionally does not provide
direct closed-page session restoration. DEC-071 remains Proposed and does not
authorize implementation until it is separately Accepted.

## 21. Foreground/background coexistence

DEC-070 foreground presentation stays enabled.

Both layers use the same stable identity. Service Worker messages mark an
identity observed in the mounted foreground tracker; polling then updates
canonical state without replaying sound. OS notifications use the same tag so
duplicate remote deliveries replace rather than stack.

When the page is visible, platform rules differ on whether a push event may
avoid `showNotification()`. The implementation must not rely on silent push.
It should prefer one OS notification plus the canonical in-app state/banner,
with at most one foreground sound attempt per identity. Real-device tests must
confirm whether visible-client suppression is permitted before enabling it on
any platform. Safari guidance requires promptly presenting a notification for
received pushes.

## 22. Retry, dedupe, idempotency, and invalid subscriptions

Per-subscription delivery identity is:

```text
delivery-intent ID + push-subscription ID
```

A unique constraint prevents two local delivery rows. Remote delivery is
at-least-once: a push service may accept a send and the process may crash
before local success is recorded. A retry may therefore duplicate an OS
notification, which the stable notification tag and client tracker suppress
at presentation level. No retry replays a domain command.

Use bounded exponential backoff with jitter and a short event-specific TTL.
Honor `Retry-After` for 429. Network errors, 429, and eligible 5xx responses are
retryable within the TTL/attempt cap. Authentication/configuration failures
such as VAPID 401/403 are deployment failures, not per-subscription infinite
retries. Payload/contract failures are terminal implementation errors.

An expired subscription response documented by RFC 8030 as 404 is terminal
and disables the subscription. A sender-library/provider-documented 410 for a
gone endpoint is also terminal. Exact terminal mapping must be locked against
the selected maintained sender library before implementation. No status is
logged with raw endpoint or response body.

Push-service acceptance proves only that the service accepted the request; it
does not prove device display, user receipt, or notification click.

## 23. Lifecycle cleanup

Employee:

- logout/session revocation makes the bound subscription immediately
  ineligible and schedules disablement;
- User disable or StaffAuthSession absolute expiry disables it;
- membership/role/Location access/Shift changes do not destroy the device
  binding, but current delivery eligibility becomes false;
- explicit device unsubscribe and terminal endpoint errors disable it.

Guest:

- GuestAccess rotation/reissue invalidates old-generation subscriptions;
- expiry/revocation and session completion disable them;
- explicit unsubscribe and terminal endpoint errors disable them.

Cleanup is monotonic disablement. Operational history remains bounded and
contains no raw credentials after cryptographic erasure/clearing.

## 24. Concurrency and race semantics

| Race | Authoritative result |
| --- | --- |
| Same domain command twice | Existing command locking/idempotency produces one domain fact; reconciler + unique intent identity produces one intent |
| Two subscribe requests for one endpoint/principal | Active endpoint uniqueness and a locked self-binding yield one current row |
| Same endpoint submitted by another principal | Reject without rebinding or disclosing owner |
| Unsubscribe races sender claim | Sender rechecks active subscription/authority before remote send; one stale informational send may remain possible after the final check |
| Two workers claim one delivery | Lease/guarded claim gives one live owner; expired lease permits recovery |
| Worker crashes before remote send | Lease expiry retries safely |
| Worker crashes after remote acceptance | Retry may duplicate presentation; stable tag/identity dedupes UX, never domain state |
| VAPID key rotates | Existing restricted subscriptions stop sending and require explicit resubscription |

No exactly-once delivery claim is made.

Unknown caller outcome is handled explicitly:

The commit outcome may be unknown to the caller after a timeout or disconnect.

- if subscribe/replace commits but the browser times out, an identical
  authenticated retry converges on the same active endpoint/principal binding;
- if unsubscribe commits but the browser times out, an authenticated retry
  returns the already-disabled self-owned binding without re-enabling it;
- if the owning domain transaction outcome is unknown, the existing domain
  command is retried under its accepted lock/idempotency contract; the
  reconciler reads committed canonical state and the unique stable identity
  prevents a second delivery intent; and
- if remote push acceptance is unknown, local delivery remains ambiguous and
  may retry within its cap. That branch is at-least-once presentation only and
  is deduped by stable tag/identity; it never replays domain mutation.

## 25. Observability, privacy, and logging

Allowed telemetry is bounded: notification type, hashed/internal intent and
subscription IDs, audience, attempt number, coarse outcome class, HTTP status
class, latency, and timestamps.

Forbidden in logs, AuditEvent, traces, URLs, payload diagnostics, and normal
metrics: raw endpoint, full PushSubscription JSON, `p256dh`, `auth`, VAPID
private key, storage-encryption key, Staff/Guest credentials or verifiers,
cookies/Authorization, Customer phone, plate, GPS, pickup/handoff proof, and
provider response bodies.

Subscribe/unsubscribe security telemetry is not tenant Black Box history.
Delivery failure never appends a custody AuditEvent or changes a domain result.

## 26. Platform support and limitations

Authoritative sources reviewed on 2026-08-30:

- Apple supports standards-based Web Push for iOS/iPadOS Home Screen web apps
  from 16.4 and for macOS Safari from Safari 16/macOS 13. Permission must be
  requested from a user gesture, and Safari requires visible notification
  presentation for received push.
- MDN documents Push API subscription and Service Worker notification display
  as secure-context features, with `userVisibleOnly` and VAPID application
  server keys required by browsers such as Chrome/Edge.
- Google web.dev documents Android browser delivery when the page/browser UI
  is closed and notes desktop delivery depends on the browser/background
  process running.
- Microsoft Edge documents push delivery while the PWA is not active and the
  Service Worker `push`/`showNotification()` flow.
- RFC 8030 documents subscription expiry, 404 terminal expiry, TTL, 429 with
  `Retry-After`, capability-URL/logging sensitivity, and non-guaranteed
  delivery. RFC 8292 defines VAPID and 401/403 authentication failures.

References:

- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation
- https://web.dev/articles/push-notifications-faq
- https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push
- https://datatracker.ietf.org/doc/html/rfc8030
- https://datatracker.ietf.org/doc/html/rfc8292

Actual delivery while locked, backgrounded, or fully closed remains subject to
OS notification permission, browser background policy, power/data-saving,
focus/do-not-disturb, push-service TTL, and vendor behavior. A support claim is
not complete until the real-device matrix below passes.

No Web API used here provides a portable custom VAYLET background sound. The
OS/browser controls whether its default notification sound or vibration occurs.

## 27. Required tests and real-device smoke matrix

Future automated tests must cover:

- subscription validation, endpoint uniqueness, multiple devices, self-only
  unsubscribe, and cross-principal/tenant/session denial;
- Employee logout/revocation eligibility, identity-switch cleanup, fresh
  browser subscription registration, disabled-endpoint reuse, and active-owner
  non-disclosing rejection without silent rebind;
- Employee current User/session/membership/Organization/Location/access/role/
  Shift/Task eligibility and revocation races;
- Guest exact ValetSession, generation, expiry, revocation, rotation,
  completion suppression, active-owner denial, and one-active-binding behavior
  when two ValetSessions share one Customer Service Worker registration;
- storage-key version selection, active/previous-key rotation, re-encryption or
  disable-and-resubscribe, decryption failure suppression, no plaintext
  fallback, and no decrypted endpoint/auth material in telemetry;
- domain success while delivery-intent persistence is unavailable, followed by
  reconciler recovery of exactly one intent from committed canonical state;
- sender lease claim, two-worker exclusion, lease expiry, commit/rollback,
  crash-before-send, and crash-after-accept duplicate behavior;
- bounded retry, Retry-After, VAPID configuration failure, terminal endpoint
  cleanup, and no infinite retry;
- strict payload allowlist and absence of credentials/PII/log leakage;
- Service Worker production registration, update, cache exclusions, push,
  click focus/open, strict payload rejection, stable tag, and Next.js build;
- visible/hidden coexistence with DEC-070 trackers and one sound attempt;
- EN/AR/RTL and locale-update behavior;
- open-client refetch and closed-client degraded re-entry behavior from the
  owner resolution of U-001; and
- Web Push disabled or failed never changes Retrieval/Mark Ready success.

Real-device smoke matrix:

| Platform | Browser/mode | Foreground | Hidden/background | Closed page/app | Locked device | Click/refetch |
| --- | --- | --- | --- | --- | --- | --- |
| Android | current Chrome browser tab | required | required | required | required | required |
| Android | installed Chrome PWA | required | required | required | required | required |
| iPhone/iPad 16.4+ | Home Screen web app | required | required | required | required | required |
| Windows | current Chrome and Edge | required | required | browser-background-policy noted | lock-screen policy noted | required |
| macOS 13+ | current Safari and Chrome | required | required | browser-background-policy noted | notification policy noted | required |

Tests record OS/browser versions, install mode, permission state, power-saving,
focus mode, observed sound policy, delivery latency, and whether canonical
authorization was re-proved after click.

## 28. Future implementation slices

U-001 is resolved. No slice may start until DEC-071 is Accepted.

1. **T1 — persistence/contracts/config foundation:** GuestAccess generation,
   encrypted/tombstoned subscription model, two-type delivery intent/delivery
   model, shared strict payload/subscription contracts, VAPID/config validation,
   bounded storage-key rotation semantics, migration/docs/runtime privileges.
2. **T2 — server subscription lifecycle APIs:** subscription-specific
   StaffAuthSession resolver, Guest exact-generation resolution, self-only
   subscribe/replace/unsubscribe, exclusive active-endpoint ownership,
   one-active-Guest-binding-per-registration, multi-device, and lifecycle
   cleanup.
3. **T3 — durable intent/reconciler/sender/retry worker:** post-commit canonical
   fact reconciliation, dynamic recipient resolution, leased worker, sender
   adapter, bounded retry/terminal cleanup, sensitive observability.
4. **T4 — Employee Service Worker and permission UX:** root worker,
   subscription controls, authenticated identity-switch cleanup and fresh
   subscribe, locale update, safe click routing, DEC-070 identity bridge.
5. **T5 — Customer Service Worker and permission UX:** extend existing worker,
   exact-generation and single-active-context subscription behavior,
   open-client in-memory refetch, credential-free closed-client re-entry screen,
   locale, and DEC-070 identity bridge.
6. **T6 — integration/dedupe/click routing:** foreground/background race tests,
   logout/rotation/revocation cleanup, production Next.js/service-worker gates.
7. **T7 — real-device smoke and hardening:** Android/iOS/desktop matrix,
   browser-specific terminal mappings, locked/closed behavior, operational
   runbook and deployment-secret evidence.

## 29. Consequences

- Background presentation remains subordinate to canonical domain state.
- Employee delivery remains exact-Location and current-Shift eligible.
- Guest delivery cannot survive GuestAccess rotation by accident.
- Multiple devices are supported without pretending delivery is exactly once;
  concurrent Guest bindings in one Customer Service Worker registration are not
  supported.
- Reliability requires focused durable persistence and a lease-aware sender;
  safe post-commit fire-and-forget is insufficient.
- The existing external-channel Notification table remains unchanged.
- A new encryption/key-management operational condition is required before
  recoverable Push endpoint/auth material is production-ready, including
  bounded key rotation without plaintext fallback.
- A closed Customer page cannot restore exact-session access; the guest must
  reopen the original secure link or rescan the VAYLET QR.

## 30. Ready-to-implement verdict

```text
DECISION REQUIRED
```

Reason: U-001 is resolved, but this decision remains Proposed. Formal
acceptance of DEC-071 is still required before production implementation.

## Planning-guardian classification appendix

This appendix classifies the proposal for implementation review. It does not
make the Proposed decision binding.

### Repository facts discovered

- See sections 4, 6, 8, 17, and 19 for inspected repository facts and symbols.
- No production Web Push sender, VAPID configuration, PushSubscription model,
  durable delivery worker, or Employee Service Worker exists.
- The Customer safe-static Service Worker, StaffAuthSession persistence,
  exact-Location Task query, GuestAccess-in-ValetSession persistence, and both
  DEC-070 foreground trackers are current reusable capabilities.

### Binding requirements

- DEC-070's two classes and stable identities remain exact.
- Delivery cannot authorize or mutate domain state.
- Employee recipients remain current exact-Location actionable queue readers.
- Guest access remains exact-session bearer authorization.
- DEC-064 prohibits Guest bearer persistence and credential-bearing click URLs.
- DEC-063 prohibits background mutation replay.
- External SMS/WhatsApp/Email Notification persistence is not foreground or
  Web Push persistence.
- Secrets and operational credential material do not enter logs/AuditEvent.

### Existing implementation patterns

- Employee: `createTaskQueueQuery(...)` composes persisted membership lookup
  with `lockShiftOperationalEligibility(...)` before exact-Location projection.
- Guest: GuestAccess hashes the presented bearer, resolves exact ValetSession,
  and enforces current expiry/revocation.
- Triggers: `requestGuestRetrieval(...)` creates Task ID atomically;
  `createMarkReadyCommandExecutor(...)` writes immutable first `ready_at`.
- Foreground: retrieval and ready trackers dedupe the same stable identities.
- Runtime config: deployment environment is read and fail-closed validation is
  owned at server/module boundaries; public browser configuration uses
  validated `NEXT_PUBLIC_...` values.

### LOCKED decisions

1. Only `EMPLOYEE_RETRIEVAL_REQUESTED` and `GUEST_VEHICLE_READY` are in scope.
2. Stable identities are Task ID and ValetSession ID + `ready_at`.
3. Push never grants authorization or changes business state.
4. Employee scope is current exact-Location queue eligibility, not Organization.
5. Guest canonical reads require current exact-session GuestAccess.
6. DEC-070 foreground polling/presentation remains available.
7. Raw credentials, handoff proof, payment secret, GPS, and unnecessary PII are
   forbidden from payload/log/routing state.
8. Background mutation replay remains prohibited.
9. Existing external-channel Notification persistence is not reused.
10. Active endpoints never transfer silently between StaffAuthSessions or Guest
    contexts; an active-owner conflict rejects non-disclosingly.
11. The MVP allows one active Guest binding per Customer Service Worker
    registration/browser profile, not simultaneous background push for multiple
    Guest ValetSessions in that registration.
12. Recoverable subscription ciphertext requires bounded key rotation,
    no-plaintext fallback, secret-safe failure, and re-encryption or
    disable-and-resubscribe behavior.

### DERIVED conclusions

1. StaffAuthSession is the narrow durable Employee device/login binding because
   access credentials rotate within it and logout revokes it.
2. Active Shift cannot be subscription identity because current eligibility is
   dynamic and exact-Location.
3. ValetSession alone is insufficient Guest subscription authority because
   GuestAccess rotation must invalidate an old recipient.
4. A GuestAccess generation identifier is the minimum non-bearer lineage needed
   to bind and revoke a Guest subscription safely.
5. Reliable crash-safe background delivery needs durable intent derived by a
   post-commit reconciler; one-shot post-commit fire-and-forget has a structural
   loss window, while requiring intent inside the domain transaction would
   wrongly couple domain success to notification persistence.
6. Remote send must be outside the domain transaction and cannot make its
   success/failure determine the domain result.
7. Send-time authority and current Task/session state must suppress stale
   employee, expired/revoked Guest, and completed-session deliveries.
8. Multiple PushSubscription rows are needed across independent Service Worker
   registrations/devices, but a browser registration does not create an
   independent subscription for every principal/context.
9. Service Worker locale cannot depend on mounted React state; a bounded locale
   snapshot must accompany the device subscription.
10. A newly opened closed Customer page cannot refetch the session under
    DEC-064 because no bearer remains available.

Falsification coverage: 22 / 22 LOCKED + DERIVED conclusions checked against
DEC-023, DEC-032, DEC-040, DEC-063, DEC-064, DEC-070, Prisma schema, GuestAccess
commands, Task queue query, Mark Ready, foreground trackers, PWA registration,
and current Web Push searches. No falsifier was found. U-001 is resolved by the
owner's safe degraded re-entry instruction, which preserves DEC-064 unchanged.

### UNRESOLVED decisions

- None within the proposed architecture. U-001 is resolved as defined in
  section 20. DEC-071 remains Proposed and still requires formal acceptance
  before implementation.

### Risks / boundary violations

- Binding only to User would leak notifications across logged-out/shared-device
  session boundaries.
- Binding Guest subscription only to ValetSession would survive token rotation.
- Silently rebinding a registration-owned endpoint would transfer background
  delivery authority across Employee or Guest identities.
- Holding database authorization locks over remote push HTTP would couple
  domain availability and create unsafe contention.
- A non-leased in-flight worker state would lose work after SIGKILL/OOM.
- Raw endpoint/auth storage without approved encryption/key management would
  leave recoverable operational credentials exposed at rest.
- Plaintext fallback or unbounded previous-key retention would turn storage-key
  rotation failures into credential exposure or permanent secret sprawl.
- Silent-push assumptions would conflict with browser user-visible policies.

### Proposed implementation plan

The future slices are section 28. They are not READY while DEC-071 remains
Proposed. The reusable downstream boundaries are:

- a subscription-specific StaffAuthSession identity resolver;
- an exact current GuestAccess-generation guard;
- a two-type post-commit durable intent reconciler over canonical facts;
- a send-time recipient-authority query; and
- a lease-aware per-subscription delivery executor.

### Test matrix

Section 27 is the required automated and real-device matrix. Each mutation
must cover first execution, identical retry, concurrent identical execution,
conflicting cross-principal execution, and retry after disablement. Worker
tests must cover competing transaction commit, rollback, expired lease, and
unknown post-remote-accept outcome without claiming exactly-once delivery.

### Files expected to change

While the verdict is DECISION REQUIRED:

- **Definitely relevant:** this DEC, decision log, database/schema docs in a
  later persistence slice, API auth/guest/retrieval/dispatch module families,
  shared contracts, both app PWA/foreground-notification boundaries, tests,
  and environment documentation.
- **Definitely relevant to T5:** the credential-free Customer re-entry screen
  and open-client focus/refetch bridge described by the U-001 resolution.
- **Not justified yet:** exact route filenames, exact table/column names beyond
  the conceptual model, selected sender dependency, generic queue/event-bus
  infrastructure, SMS/WhatsApp/Email changes, and Dashboard administration.

### Explicitly out of scope

Section 2 is controlling. No domain transition, push-triggered mutation,
notification center, marketing/escalation class, generic event platform,
custom background sound, or production secret generation is proposed.

### Ready-to-implement verdict

```text
DECISION REQUIRED
```

U-001 is resolved. DEC-071 must be explicitly Accepted before code, schema,
migration, dependency, Service Worker, or production VAPID work starts.
