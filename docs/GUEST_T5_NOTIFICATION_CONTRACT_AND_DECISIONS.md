# T5 — Guest background notification contract and Owner decision packet

Status: **PROPOSED — OWNER APPROVAL REQUIRED BEFORE IMPLEMENTATION**
Date: 2026-10-08
Scope: U-08 first-launch Guest background/closed-app notification only

## 1. Why this packet exists

U-08 requires a real, observable and physically qualified Guest background or
closed-app notification for first launch. The existing implementation does not
provide that capability:

- DEC-070 is an Accepted **foreground-only** notification decision. Its Guest
  trigger is the first committed `RETRIEVING -> READY`, with stable identity
  `ValetSession.id + ready_at`, and it explicitly excluded Web Push,
  `PushSubscription`, Notification API permission and service-worker delivery.
- `apps/customer/public/sw.js` caches public static files only. It has no `push`,
  `notificationclick`, `showNotification` or subscription behavior.
- `GuestSessionProvider` detects READY from canonical Guest reads, plays the
  best-effort foreground sound and presents the existing READY banner. Polling
  pauses while hidden/offline, so it cannot satisfy closed-app delivery.
- T1 Browser Session authority is server-side and cookie-backed. A
  `GuestBrowserSession` is bound to one `valet_session_id` and credential
  generation, and it is revoked on generation replacement, successful browser
  context transfer or explicit end-access.
- The existing `notifications` table is SMS/WhatsApp/Email persistence and is
  not suitable for browser push. Existing `StaffPush*` persistence and the FCM
  native adapter are Staff-session/native-specific and are not Guest authority.

This packet proposes the smallest reliable extension of those facts. It does
not itself authorize a provider/transport, dependency, schema, migration,
production-visible UI, credentials, sender deployment or production rollout.

## 2. Proposed decision

Approve **standards-based Web Push** for one initial Guest notification kind:

```text
kind = GUEST_VEHICLE_READY
trigger = first successful committed RETRIEVING -> READY
stable domain identity = ValetSession.id + ready_at
recipient authority = current exact GuestBrowserSession for that ValetSession
presentation = user-visible OS notification with generic privacy-safe copy
tap behavior = open/focus Customer app, then canonical cookie-authorized refetch
```

Web Push is attention only. It grants no Guest authority, does not restore a
revoked Browser Session, does not verify handoff proof, and never changes a
ValetSession, Task, RetrievalRequest, payment or release state.

DEC-070 foreground READY presentation remains authoritative for the visible
Customer application. This proposal supplements DEC-070; it does not rewrite
the historical foreground transport decision.

No additional Guest push kind is approved by this packet. Future cancellation,
handoff, payment, receipt, marketing or generic notification-center concepts
need their own product decision.

## 3. Supported first-launch platform contract

The implementation must use feature detection and secure-context checks rather
than browser-name detection.

| Surface | Proposed first-launch background support | Contract |
| --- | --- | --- |
| Android Chrome on HTTPS | **Supported target** | Standards Web Push may wake the service worker while the page is not loaded. Notification permission and a valid subscription are required. Android/browser power policy can delay presentation, so no exact delivery-time guarantee is claimed. |
| Installed Android Guest PWA | **Supported target** | Same origin/service-worker Web Push contract. Must be physically qualified independently from a normal Chrome tab because lifecycle/storage behavior can differ. |
| iPhone/iPad Home Screen Guest web app, iOS/iPadOS 16.4+ | **Supported target** | Apple supports standards Web Push for Home Screen web apps. The current manifest already uses `display: standalone`. Permission/subscription must be requested from a direct user gesture. Every received push must result in a visible notification; silent push is not allowed. |
| iPhone/iPad Safari tab | **Foreground-only** | Mobile Safari tabs are not the iOS Web Push target. A Guest who needs closed-app READY notification must add the Guest web app to the Home Screen and grant notification permission, or the Owner must separately approve another delivery channel. |
| Permission denied / notifications disabled | **No background delivery claim** | Guest access and canonical status remain usable. The product must state the limitation truthfully and recover by canonical read when the Guest returns. |
| Unsupported browser/API | **No background delivery claim** | Continue the existing Guest journey and foreground behavior. Never show a fake enabled/sent state. |

External capability evidence checked for this proposal:

- Apple, *Sending web push notifications in web apps and browsers*:
  https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- WebKit, *Web Push for Web Apps on iOS and iPadOS*:
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- MDN, *Push API*:
  https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- Chrome for Developers, *Use Web Push*:
  https://developer.chrome.com/docs/extensions/how-to/integrate/web-push

Physical T6 evidence remains the release authority for the exact OS/browser/PWA
versions used by the pilot. Standards support is not proof that a specific
device displayed a notification.

## 4. Permission and enrollment contract

The browser permission prompt must follow an explicit Guest gesture. Do not
request notification permission automatically on page load, token exchange,
polling, visibility change or READY transition.

The minimal future UI needs one Owner-approved UI-FROZEN SAFE DELTA that can:

1. offer `Enable notifications` only when the current platform can support the
   selected Web Push path;
2. explain the iOS Home Screen requirement when the Guest is in an iPhone/iPad
   browser surface that cannot subscribe for Home Screen push;
3. represent `enabled`, `denied/disabled`, `unsupported` and retryable setup
   failure truthfully; and
4. avoid promising guaranteed sound, exact timing or delivery while the OS has
   final presentation control.

No exact layout/copy/control is approved here. Customer implementation is
blocked until that UI delta is separately approved.

## 5. Subscription authorization and binding

Subscription registration must reuse the T1 same-origin Guest Browser Session
boundary. The client must not send or choose `organizationId`, `locationId`,
`valetSessionId`, credential generation, Browser Session ID or recipient ID.

Proposed authorization order for registration/reconciliation:

1. require HTTPS/same-origin mutation transport and the existing CSRF/origin
   protections used by Guest Browser Session mutations;
2. resolve the Secure HttpOnly Browser Session cookie server-side;
3. prove the Browser Session is currently authorized with `ACTIVE` scope;
4. derive the exact ValetSession and credential generation from that authority;
5. strictly validate the browser-generated PushSubscription endpoint and
   encryption keys plus allowlisted locale metadata;
6. acquire deterministic per-BrowserSession and endpoint-hash transaction locks,
   then atomically upsert/supersede active records under database uniqueness;
7. persist one current binding; and
8. return only safe state/metadata, never the stored endpoint or encryption
   secrets.

The server stores the raw subscription endpoint and Web Push encryption material
only because outbound Web Push requires them. It also stores a versioned hash of
the endpoint for equality/uniqueness. Endpoint, endpoint hash, `p256dh`, auth
secret and VAPID private material are sensitive and must never enter logs,
metrics labels, analytics, AuditEvent, client read responses or support exports.

One active Web Push registration per current Browser Session is the proposed v1
rule. Same-origin tabs share the service worker subscription naturally. A
successful T1 context switch, staff generation reissue/revoke or explicit
end-access makes the old registration **ineligible at the next send-time check**
because its Browser Session is no longer authorized. A provider request already
in flight may still be accepted or displayed after the context change. This
residual race is safe only with generic credential-free copy, bounded TTL and
mandatory canonical reauthorization on click. Cleanup cannot recall a push
already dispatched or replace the final authorization check.

If the same PushSubscription is later presented by a newly authorized Browser
Session in the same browser context, registration reconciliation may supersede
the prior binding only after the new Browser Session has already been proven.
The endpoint itself never identifies or authorizes a Guest.

## 6. Authoritative READY trigger and transactional handoff to delivery

The only accepted v1 trigger remains the Mark Ready command. Provider/network
I/O must never happen inside the Mark Ready transaction.

Recommended sequence:

```text
Staff -> Mark Ready command
API -> DB transaction:
  lock/recheck existing staff + Task + RetrievalRequest + ValetSession authority
  perform RETRIEVING -> READY and set immutable ready_at
  stop retrieval tracking and append existing Mark Ready audit
  evaluate effective guest_vehicle_ready_notification_enabled
  if enabled: insert one durable GuestPushIntent keyed by (kind, session, ready_at)
  expand only ACTIVE registrations whose currently authorized Browser Session
    resolves to the exact ValetSession + credential generation + Organization/Location
  insert delivery with UNIQUE(intent_id, registration_id) / ON CONFLICT DO NOTHING
DB -> API: COMMIT
sender may observe the durable rows only after commit
```

Rollback means no intent and no delivery. A semantic Mark Ready retry that sees
the already committed READY state creates no second intent. Turning the setting
on after READY does not backfill an old event. Turning it off before an unsent
delivery is sent causes send-time suppression.

After commit, the API may emit a best-effort in-process **wake hint** so a local
sender starts looking for due work immediately. That hint is latency only: it
contains no authority, it is not persisted as separate truth, and losing it on a
crash or another replica is harmless because every sender independently polls
the durable due rows. This keeps the post-commit path fast without adding an
event bus or making delivery correctness depend on process memory.

The durable intent is a narrow transactional consequence of this one command.
It is not a generic event bus, Kafka topic, client mutation outbox or general
notification platform.

## 7. Durable persistence option — recommended for U-08 reliability

Reliable closed-app delivery, crash recovery, bounded retry, multi-replica
claiming and truthful operations state require durable coordination. The
recommended schema, subject to explicit Owner approval, is three dedicated
provider-neutral entities analogous in shape to the proven Staff push pattern
but with Guest-specific authority:

### `GuestPushRegistration`

- UUID identity;
- exact restrictive FK to `GuestBrowserSession`;
- raw subscription endpoint, `p256dh` and auth material in sensitive columns;
- versioned endpoint hash for uniqueness/equality;
- controlled locale (`en | ar`);
- state: `ACTIVE | DISABLED | PROVIDER_INVALID | SUPERSEDED`;
- created/updated/last-confirmed and terminal timestamps;
- safe terminal reason class; and
- optional supersession reference.

**Mandatory database fences:** a partial UNIQUE index for `ACTIVE`
`guest_browser_session_id` (one active registration per Browser Session), and
a partial UNIQUE index for `ACTIVE` `endpoint_hash` (one active owner of a
physical PushSubscription endpoint). Endpoint hashing must be stable/canonical
under an accepted versioned hash policy and use no raw endpoint in telemetry.
Registration/reconciliation obtains deterministic transaction/advisory locks on
the hashed endpoint and Browser Session **before insert**, and uses the database
unique constraints as the final guard even when two API replicas both observe
an initially empty keyspace. Reuse/supersession is legal only after the new
Browser Session has been independently authorized; a uniqueness conflict never
silently authorizes an old or cross-tenant binding.

### `GuestPushIntent`

- UUID identity;
- Organization, Location and ValetSession references with same-scope database
  constraints;
- kind, initially only `GUEST_VEHICLE_READY`;
- immutable `ready_at` trigger identity;
- policy version, creation time and finite expiry time; and
- uniqueness on the logical READY identity.

### `GuestPushDelivery`

- UUID identity and same-Organization intent relation;
- registration reference;
- `PENDING | LEASED | RETRY_WAIT | PROVIDER_ACCEPTED | SUPPRESSED |
  PERMANENT_FAILURE | EXPIRED` state;
- attempt count/max-attempt snapshot;
- next-attempt time;
- unique lease token and lease expiry;
- normalized provider-result class;
- optional non-secret provider reference; and
- provider-accepted/terminal/created/updated timestamps.

**Mandatory deduplication/authority fences:** database UNIQUE
`(intent_id, registration_id)` plus `INSERT ... ON CONFLICT DO NOTHING` for
repeat expansion and competing API workers. Both delivery creation and the
final sender recheck must prove that the registration's Browser Session is the
exact currently authorized recipient of the intent's ValetSession, same
credential generation and Organization/Location; an `ACTIVE` registration
alone never proves this. Preserve FK/scope checks and DB uniqueness across
multiple API processes; no application memory map is a substitute.

`notifications` and `StaffPush*` tables must not be overloaded. A no-schema
implementation that scans `ready_at`/AuditEvent and sends ephemerally is **not
recommended** for U-08 because it has no durable per-subscription attempt,
crash-recovery, multi-replica lease or terminal-delivery truth.

## 8. Multi-replica sender contract

The sender stays inside the API modular-monolith deployment boundary as a
separate worker process. More than one replica may run concurrently.

The proven coordination shape is:

1. claim one due PENDING/RETRY_WAIT or expired-lease delivery in a short DB
   transaction using row locking plus `SKIP LOCKED` (or equivalent);
2. write a fresh unique lease token, lease expiry and incremented bounded attempt
   count, then commit;
3. re-prove current Browser Session authorization/generation, exact ValetSession,
   effective notification policy, registration state/version and event freshness;
4. suppress without provider I/O if any current eligibility fact fails;
5. perform Web Push I/O outside a DB transaction;
6. finalize in a new short transaction only if delivery ID + `LEASED` + exact
   current lease token still match; and
7. reclaim expired leases safely after worker death.

If the push service accepted a request and the worker dies before finalization,
a bounded retry may submit the same notification again. This is an explicit
at-least-once provider-attempt ambiguity. No exactly-once OS display claim is
made. The service worker must use the opaque intent ID as the notification `tag`
so repeated presentation can replace/coalesce the same logical READY alert where
the platform supports that behavior.

## 9. Send-time eligibility

At the final authoritative check immediately before **starting** outbound
transport, the sender must prove all of the following from current server state:

- intent is unexpired and kind/policy version is supported;
- registration is ACTIVE and exact endpoint/key version still matches;
- referenced GuestBrowserSession is unrevoked and resolves to the same
  ValetSession and credential generation;
- the browser authority scope is still `ACTIVE`, not expired/revoked;
- `ready_at` still equals the immutable intent trigger;
- session has not reached `COMPLETED` or another terminal/no-longer-useful state;
- effective `guest_vehicle_ready_notification_enabled` is still true; and
- no current security transition has invalidated the Guest generation.

`READY` and `HANDOFF_PENDING` remain useful notification states. Completion
**before** the final check suppresses a pending READY send. Completion or
revocation **after** that check may race with provider I/O already in flight;
the generic alert can still display, but conveys no private visit details and
has no Guest authority. If zero post-revoke alerts are mandatory, a different
Owner-approved guarantee/transport would be required.

## 10. Payload and service-worker behavior

The v1 encrypted payload should contain only:

```text
schemaVersion = 1
kind          = GUEST_VEHICLE_READY
intentId      = <opaque UUID>
routeIntent   = GUEST_STATUS
locale        = en | ar
```

Do not send plate, vehicle make/model/color, customer name/phone, Organization,
Location, valet-session ID, `ready_at`, parking/key data, payment data, handoff
proof, browser credential, Guest token or provider secret.

The server selects **only** allowlisted `en|ar` from the persisted authorized
registration. The service worker owns a small versioned, immutable
`GUEST_VEHICLE_READY` EN/AR title/body lookup table. Its exact copy is owned by
the Owner-reviewed T5 UI-FROZEN SAFE DELTA and must be contract-tested against
that accepted wording. The worker resolves `locale` and `kind`; it never trusts
arbitrary notification title/body data. An unknown locale must fail closed or
use a specifically Owner-approved safe fallback. No free-form client or domain
text may enter the lock-screen copy.

The service worker must:

- reject/ignore unknown schema versions or kinds;
- resolve the approved title/body from the versioned EN/AR copy table and test
  exact locale parity;
- call `showNotification` for every accepted push event; this is required for
  the iOS Home Screen contract and avoids silent background processing;
- use the opaque `intentId` as the notification tag/dedupe hint;
- on click, focus an existing Customer window when possible or open `/` only;
- never place Guest bearer/session/proof material in a notification URL; and
- let the normal Customer bootstrap/canonical read decide what the user may see.

If auth was revoked before tap, the notification may still be visible, but the
tap grants no access and the canonical Guest route fails closed.

## 11. Delivery policy proposal

Exact delivery numbers need Owner approval. The recommended v1 starting policy
reuses the already reviewed Staff push reliability bounds where they fit:

| Policy item | Proposed v1 value |
| --- | ---: |
| Policy version | `1` |
| READY intent TTL | `30 minutes` |
| Maximum provider attempts | `4 total` |
| Provider call timeout | `10 seconds` |
| DB lease duration | `30 seconds` |
| Retry minimum | `10 seconds` |
| Exponential retry cap | `60 seconds` |
| Retry jitter | full jitter, preserving 10-second floor |
| Intent/Delivery retention | `7 days` |
| Terminal registration troubleshooting retention | `30 days` |

The longer READY TTL than Staff retrieval attention is intentional: READY is
still useful while the Guest is approaching the handoff, while send-time state
checks prevent a stale alert after completion. Provider TTL must always be the
positive remaining intent lifetime; a retry never restarts the 30-minute clock.

These are server/deployment values, not tenant/Location settings. A material
change requires a new policy version rather than silently changing v1.

## 12. Web Push transport and dependency choice

The proposed transport is standard RFC Web Push using the browser-created
PushSubscription endpoint and VAPID application-server identity. The browser
chooses its push service; Customer code does not choose FCM vs APNs and must not
reuse the Staff native FCM token API.

Recommended server implementation is a narrowly scoped, reviewed Web Push
library (for example `web-push`) rather than hand-implementing VAPID signing,
payload encryption and browser-specific HTTP details. Adding that dependency and
its lockfile changes requires explicit Owner approval before implementation.

Required deployment material:

- one VAPID key pair per approved environment/rotation policy;
- VAPID public key exposed as non-secret Customer configuration;
- VAPID private key available only to the server sender as a secret;
- an approved VAPID subject/contact value;
- HTTPS Customer origin and functioning production service worker; and
- egress/DNS/TLS access to browser push endpoints, including Apple Web Push
  endpoints for the supported iOS Home Screen path.

No VAPID private key, PushSubscription endpoint or encryption secret may be
committed to Git or emitted in build/runtime evidence.

## 13. Provider-result truth

Normalize transport results into bounded classes such as:

```text
ACCEPTED
TRANSIENT
RATE_LIMITED
INVALID_ENDPOINT
PERMANENT
CONFIGURATION
UNKNOWN
```

`ACCEPTED` means the browser push service accepted the request. It does **not**
mean the device displayed it or the Guest saw it. Timeout/network loss after
dispatch is `UNKNOWN`; bounded retry may duplicate attention. Conclusive expired
or invalid subscription responses terminalize the exact registration version
and clear its raw endpoint/keys. Auth/config errors must never mass-invalidate
subscriptions.

The product/API must never expose a fake `delivered` or `seen` state from provider
acceptance alone.

## 14. Cleanup and revocation

Revocation removes **future** eligibility at the final Browser Session check.
It cannot stop an already-started provider call or erase an OS alert. Bounded
TTL, minimal generic copy, optional `tag` coalescing and fail-closed click
reauthorization limit the residual risk. Maintenance only reduces retained
sensitive data and stale pending work.

Required cleanup behavior after approval:

- explicit Guest end-access: disable current registration and clear raw
  endpoint/keys as part of the same authorized operation where practical;
- successful browser-context transfer or credential-generation revoke: old
  registration fails subsequent send-time rechecks; reconciliation marks it
  terminal and clears sensitive transport material;
- provider-invalid endpoint: terminalize exact current registration only and
  suppress its unsent deliveries;
- completed/expired visit: no new READY deliveries; unsent work is suppressed;
- terminal registrations retain only safe troubleshooting metadata/hash for the
  approved retention window, then purge when FK constraints permit; and
- intents/deliveries purge only after the approved retention horizon and never
  delete ValetSession/Audit/Task operational history.

Cleanup must be restart-safe, idempotent, batch-bounded and safe with multiple
workers. Missing cleanup may increase retained operational rows but must never
make an unauthorized send eligible.

## 15. Observability and privacy

Operational truth must be low-cardinality and secret-free. Record aggregate
counts/latency for:

- registration create/reconcile/disable and safe failure class;
- intent creation/suppression;
- due backlog count and oldest due age;
- claim/reclaim/attempt count;
- provider result class and provider latency bucket;
- retry scheduling/expiry/permanent failure;
- invalid endpoint cleanup; and
- cleanup rows evaluated/terminalized/purged.

Do not label metrics/logs with endpoint, endpoint hash, Browser Session ID,
Guest token, ValetSession ID, Organization/Location ID, customer/vehicle data,
VAPID material or payload body.

The first-launch readiness claim requires both server-side operational evidence
and T6 physical device proof. Provider acceptance alone is not physical proof.

## 16. Recovery and rollback

Foreground canonical status remains the recovery truth when permission is
denied, delivery is late/lost, the worker is unavailable or the OS suppresses a
notification. Web Push failure must never make Guest domain actions fail.

Rollback may disable new subscription enrollment and sender work while keeping
existing Guest Browser Session/canonical read behavior intact. It must not roll
back T1 authority, delete ValetSession/Audit history, re-enable bearer-only
storage or fabricate notification success.

Existing persisted push rows may be drained/terminalized by the last compatible
sender/maintenance version under an approved rollback runbook; a code rollback
must not strand leases or leak sensitive subscription data.

## 17. Required implementation and physical proof after approval

Implementation is incomplete until it proves at least:

- registration cannot bind a foreign/stale/revoked Browser Session;
- no client-supplied tenant/session/generation value grants scope;
- two simultaneous API registration attempts for the same new Browser Session
  and endpoint result in exactly one ACTIVE binding under SQL constraints;
- two competing bindings from different Browser Sessions/tenants cannot retain
  simultaneous ACTIVE ownership of the same endpoint;
- Mark Ready rollback creates zero Guest push intent/delivery;
- exactly one logical intent exists for the first READY identity;
- replayed intent expansion and two API replicas produce at most one delivery
  per `(intent_id, registration_id)` under a real SQL unique constraint;
- creation and final dispatch independently reject any registration whose
  Browser Session/credential generation/visit/tenant no longer match the intent;
- semantic Mark Ready retry creates no duplicate logical intent;
- current policy disable/revoke/context switch/generation change **before the
  final send-time check** suppresses provider I/O; the after-check race may
  permit a generic alert already in flight, with click-time denial;
- two sender replicas cannot concurrently own the same valid lease;
- crash after provider acceptance is recovered within bounded at-least-once
  semantics without any domain mutation;
- invalid endpoint affects only the exact current registration version;
- service worker renders exact approved EN/AR READY copy and handles
  push/click/unknown payloads without caching protected
  API responses or exposing credentials;
- controlled revoke/COMPLETED race between final eligibility check and provider
  I/O, proving no sensitive payload, bounded TTL and click-time denial;
- Android Chrome and installed Android PWA deliver after background/process
  suspension on the approved physical matrix;
- iOS/iPadOS 16.4+ Home Screen Guest app delivers while backgrounded/closed;
- iPhone Safari tab is presented truthfully as foreground-only for this path;
- denied/disabled permission remains safe and truthful; and
- EN/AR, lock-screen privacy, restart/reconnect and duplicate delivery are
  physically exercised with exact OS/browser versions recorded.

## 18. Exact Owner approvals required to unblock implementation

The following approvals are intentionally separate. Approval of U-08 alone did
not select these implementation choices.

1. **Transport/platform:** approve standards-based Web Push as the v1 Guest
   background transport for `GUEST_VEHICLE_READY`, with Android Chrome/PWA and
   iOS/iPadOS 16.4+ Home Screen as supported background targets.
2. **iPhone Safari boundary:** approve Safari-tab foreground-only behavior and
   Home Screen install + permission as the iOS background-notification path. If
   Safari-tab closed-app notification is mandatory, select a different approved
   delivery channel instead; this Web Push plan cannot satisfy that requirement.
3. **UI-FROZEN SAFE DELTA:** approve the exact notification enable/install/
   denied/unsupported UI states and EN/AR copy before Customer UI changes.
4. **Schema/migration:** approve dedicated `GuestPushRegistration`,
   `GuestPushIntent` and `GuestPushDelivery` persistence plus forward migration,
   constraints, runtime grants and retention/cleanup behavior.
5. **Dependency:** approve the exact reviewed Web Push server dependency and
   lockfile change, or explicitly approve a standards implementation without a
   new package.
6. **Credential/config:** approve VAPID key ownership, environment separation,
   rotation/recovery, secret store and public-key distribution contract.
7. **Delivery policy:** approve policy v1 values in section 11, especially the
   30-minute READY TTL, four attempts, retry/lease bounds and retention.
8. **Sender deployment:** approve a Guest Web Push worker process and replica
   topology using DB leases/fencing, plus its production configuration/egress.
9. **Physical release gate:** approve the exact Android/iOS device + OS/browser
   matrix and require T6 physical delivery/dedupe/revoke/permission evidence
   before first-launch readiness is claimed.

Until those decisions are approved, T5 may continue source/read-only auditing
and test-contract design, but it must not add Customer/API push behavior, schema,
migrations, dependencies, credentials, provider delivery or production-visible
notification UI.

## 19. Decision packet recommendation

Recommended Owner choice: approve items 1–9 as one focused Guest Web Push v1
sub-contract, with the iOS rule explicitly stating **Home Screen required for
background notification**. This is the narrowest architecture that satisfies
U-08 while preserving T1 Browser Session authority, DEC-070 foreground truth,
the typed notification setting, modular-monolith deployment and T4/T6 evidence
boundaries.
