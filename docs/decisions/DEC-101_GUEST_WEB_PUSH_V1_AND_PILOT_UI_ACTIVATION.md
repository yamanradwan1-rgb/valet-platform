# DEC-101 — Guest Web Push v1 and T5 pilot product surface activation

Status: **Accepted**
Date: 2026-10-08
Owner: VAYLET product owner
Scope: T5 owner-approved same-branch implementation on `feat/guest-t5-pilot-completion-recovery`
Extends: DEC-024, DEC-025, DEC-040/042/043/044, DEC-051/057, DEC-064/070/085/091

## Decision

The owner accepted the previously proposed nine T5-PUSH decisions and five T5
UI-FROZEN SAFE DELTAs on 2026-10-08. This decision **authorizes repository
implementation**; it does **not** authorize production deployment, credentials,
production/staging migrations, enrollment, mobile binary build, or represent
physical push receipt / T6 readiness as verified.

The full design, concurrency/retention/privacy/observability/rollback and
physical proof contract remains binding in
`docs/GUEST_T5_NOTIFICATION_CONTRACT_AND_DECISIONS.md`.
The exact EN/AR UI copy and Light/Dark/RTL geometry contract remains binding in
`docs/GUEST_T5_UI_FROZEN_SAFE_DELTA.md`. Neither contract may be weakened merely
because approval is now recorded.

## Accepted Guest Web Push decisions — T5-PUSH-01..09

1. **Transport:** standards-based Web Push, notification kind
   `GUEST_VEHICLE_READY` only; DEC-070 existing foreground notifications
   remain independently operational.
2. **Platform:** Android Chrome on HTTPS, installed Android Guest PWA and
   supported iOS/iPadOS 16.4+ **Home Screen web app**. Ordinary iPhone Safari
   browser tabs are **foreground-only** for this contract. Install and explicit
   permission are required where the platform mandates them.
3. **Permission UI:** the narrowly approved UI-02 permission, enablement,
   unsupported, denied and unavailable presentation; no implicit permission
   prompt. Browser enrollment begins **only** from explicit Guest gesture.
4. **Persistence:** dedicated PostgreSQL `GuestPushRegistration`,
   `GuestPushIntent`, `GuestPushDelivery` with forward migrations, exact
   FK/scope, partial ACTIVE Browser Session and endpoint-hash uniqueness,
   uniqueness for logical READY identity and `(intent_id, registration_id)`,
   runtime least-privilege privileges, index/retention and cleanup contract.
   Existing StaffPush and generic notifications tables are not repurposed.
5. **Dependency:** a reviewed maintained, narrow Web Push library (for example
   `web-push`) with compatibility/security/lockfile review; no handmade
   cryptography where reviewed library meets this need.
6. **VAPID:** server-owned configuration, public key exposed only to the
   Customer as required and private key available only to authorized sender;
   separate environments, secret-store rotation and recovery. No production
   secret generation, deployment or committing credentials here.
7. **Delivery policy v1:** immutable 30-minute READY intent lifetime, maximum
   **four** provider attempts, 10-second network request deadline, 30-second
   lease, minimum 10-second retry, maximum exponential retry delay 60 seconds,
   full jitter with 10-second floor, 7-day intent/delivery retention,
   30-day terminal-registration troubleshooting retention, version 1.
   Retrying cannot reset the original intent expiry.
8. **Sender:** dedicated worker process **inside the existing API modular
   monolith**; bounded claims with PostgreSQL row locks/`SKIP LOCKED`,
   unique lease token and expiry, DB claim/commit before network I/O,
   send-time authoritative revalidation and fenced DB finalization. Multiple
   replicas safe; no Redis/message bus/new microservice/sticky sessions.
9. **Physical gate:** approved Android/iOS browser/Home Screen matrix;
   actual permission, background/closed-app delivery, revocation, dedupe,
   and click-time reauthorization are **required before first-launch PASS**.

## Authoritative trigger and transaction

Only first committed `RETRIEVING -> READY`, owned by current Mark Ready
command with immutable `ValetSession.id + ready_at`, creates the durable
logical intent and exact current eligible deliveries **inside the same
transaction** as the READY state/audit. Rollback creates zero deliveries,
semantic retries create no second intent and provider I/O cannot occur while
holding the domain transaction. At creation and final send-time, Browser
Session cookie authority, exact visit/Organization/Location, generation,
revocation, effective notification policy, current lifecycle and intent
expiry must be rechecked. Provider acceptance is **not** OS/device receipt.

No browser subscription endpoint/hash/key, raw Guest bearer, cookie,
hand-off proof, customer/vehicle/plate, tenant identity or payment value
appears in public payload/URL/log labels/analytics. The approved encrypted
payload is versioned kind, opaque intent ID, fixed Guest status route
intent and controlled `en|ar` locale only. The service worker resolves
allowlisted exact EN/AR display copy; notification click opens only the
public Customer root and reauthorizes canonically. A provider call already
in flight when authority revokes may show a **generic credential-free**
alert; it cannot grant subsequent access. Future sends must fail the last
authoritative recheck. Provider retries are at-least-once attempts, never an
exactly-once OS display guarantee.

## Accepted pilot UI deltas — T5-UI-01..05

1. **Native contextual Guest Access recovery:** show the existing
   `Guest Access / وصول الضيف` action for exact authorized
   `HANDOFF_PENDING` session/RETRIEVAL Task only when handoff is unverified;
   reuse existing issue/reissue, QR/Copy Link, no proof/release bypass.
2. **Notification permission/status:** versioned English/Arabic READY
   title/body and explicit localized enablement/denied/unsupported UI with
   platform-correct Home Screen requirement; preserve foreground path.
3. **Completed-visit rating:** remove development-only entry gating, reuse
   existing real 1–5 POST; zero preselection, immutable one-per-visit, 24h
   canonical POST_VISIT scope, expired/revoked/CANCELLED fail closed, known
   conflict versus unavailable distinct; lost response never auto-POST retries.
4. **Payment Summary / ملخص الدفع:** exact authorized read-only DEC-057
   projection; no invented paid/zero/tip/provider fields. Not a legal receipt.
5. **Truthful Guest Help:** approved minimum route is onsite valet employee
   help with exact accepted copy, **only for Locations whose operational support
   availability is independently confirmed**. No fabricated phone, incident
   route, emergency service or staff action. Without source evidence, keep
   that Location's Help unavailable.

All five deltas preserve the existing navigation, branding, design tokens,
header geometry, EN/AR RTL/LTR and Light/Dark presentation; no redesign,
full claim intake or new capability implied.

## Explicit deferrals and release gates

Official/tax/legal receipt, receipt download/share, digital checkout,
Guest tip mutation, SMS/WhatsApp Guest Access, Guest account creation and
full Guest incident submission remain deferred. `CASH_ONLY` and
`tipsEnabled=false` remain the initial pilot policy. No feature may show
success, sent, paid, supported or legally compliant status without its
corresponding authoritative evidence.

**Approval status:** Owner product/architecture/UI decisions **APPROVED**.
**Implementation status:** separately proven through code/tests in the
same T5 branch and T5 implementation report, not through this decision.
**Provider/live runtime/device status:** not verified by this approval.
**Production readiness:** NOT VERIFIED; T6 and physical support-matrix
acceptance remain separate release requirements.
