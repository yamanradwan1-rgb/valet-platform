# Guest T5 — T6 Qualification Handoff

**Status: OWNER DESIGN/UI DECISIONS APPROVED (DEC-101); NOT PHYSICALLY QUALIFIED / NOT PRODUCTION READY.** This is a T5-to-T6 test and acceptance handoff, not permission to deploy, run production/shared migrations, activate Guest enrollment or widen the pilot. Baseline: `74cc7064a907bec79c154e2d1afc55288ceffb1a` (2026-10-08).

The owner approved T5-PUSH-01..09 and T5-UI-01..05 on 2026-10-08,
including dedicated Web Push DB persistence, sender, library, VAPID config
contract and the iOS Home Screen support boundary. Design authorization is
complete; code verification, production origin/VAPID/migration/worker setup,
real browser/device receipt and T6 go/no-go remain distinct evidence gates.

See `GUEST_T5_WEB_PUSH_OPERATIONS_AND_PHYSICAL_TESTS.md` for the specific
approved delivery bounds, safe migration/worker rollout, rollback floor,
low-cardinality operations evidence and Android/iOS physical test checklist.

## Distinct acceptance gates

1. **Code:** locally exercised T5 contracts and implementations, without outstanding P0/P1 changes.
2. **Owner product/UI:** all five named UI-FROZEN SAFE DELTAs **approved by DEC-101**; prove their actual production-mode rendering and exact configured eligibility. An unmounted or disabled entry point is not a shipped capability.
3. **Provider/infrastructure:** Web Push architecture **approved**; actual reviewed dependency, durable schema implementation, authorized secret configuration, migration/rollout plan, Location-specific Help availability and real Customer HTTPS origin must be verified separately.
4. **Physical/device:** actual READY delivery on supported background/closed-app combinations, real Native handoff recovery without custody bypass, real QR/link/reissue behavior.
5. **T6 release:** CI/E2E, HA/database, load, long-soak, rollback, security, canary and human go/no-go evidence.

## Target physical journey

| Sequence | Evidence that T6 must capture | Critical rejection |
| --- | --- | --- |
| Authorized Native QR/Copy Link | Physical Android build, actual visit and correct Customer HTTPS origin; re-open and exact-visit continuity | No bearer in logs, cookies read by JS, wrong visit/tenant or fake origin |
| Retrieval request | Actual API/database transaction, one OPEN request/QUEUED Task and status progression | No duplicate request/task after reconnect or lost response |
| First staff Mark Ready | Real database `ready_at` and durable chosen notification event identity | Poll/refresh or repeated Mark Ready is not a new event |
| Background Guest READY | Android Chrome vs installed Android PWA, iPhone Safari vs Home Screen web app; permission granted/denied, locked, suspended, fully closed where platform permits | Foreground toast/audio, service-worker unit tests and provider accepted response do not prove device receipt |
| Notification click | Open exact public Customer origin; server reauth of current Browser Session; revoked/expired becomes safe recovery view | Never pass bearer or internal identifiers in deep link; never regain revoked authority |
| Secure handoff | Genuine fresh QR/PIN, staff verification, proof consumption and independent financial policy check | Guest Access recovery alone never verifies/releases or marks `COMPLETED` |
| Contextual Native recovery | Lost link, expired/revoked/rotated credential, app reload, different browser/device, duplicate press, timeout after commit and staff competition | Old link invalid after rotation; no second business lifecycle, unsafe repeated rotation or stale QR |
| Post-visit | `COMPLETED` 24-hour limited Browser Session, approved immutable rating/receipt-read presentation | `CANCELLED`, expired or revoked cannot rate; no custody mutation |
| Staff assistance/receipt | Real configured help destination, or explicit unavailable; source-backed financial/visit summary if approved | No fictional phone number, incident confirmation, tax receipt or paid status |

## Browser/PWA matrix to resolve before test execution

Record exact **OS build, browser build, installation mode, origin, permission state, subscription ID fingerprint (non-secret), backend delivery attempt ID, provider response, actual device receipt and click reauthentication outcome** for each case. Do not assume Safari tabs and iOS Home Screen apps, or Android Chrome tabs and installed PWAs, share permission or browser storage. **Accepted DEC-101 already fixes ordinary iPhone Safari tabs as foreground-only and iOS/iPadOS 16.4+ supported Home Screen web apps as the background target**. No new first-launch support-matrix choice is pending; actual physical device proof remains mandatory.

| Platform/mode | Foreground | Background/locked | Closed app or process eviction | Permission denied, offline recovery, revoke |
| --- | --- | --- | --- | --- |
| Android Chrome tab | T6 evidence pending | T6 evidence pending | T6 evidence pending | T6 evidence pending |
| Installed Android PWA | T6 evidence pending | T6 evidence pending | T6 evidence pending | T6 evidence pending |
| iPhone Safari tab | Foreground-only by DEC-101; T6 evidence pending | **Not supported as Web Push background target**; Home Screen required | **Not supported as closed-app Web Push target**; Home Screen required | T6 foreground/install/denial/revocation evidence pending |
| iPhone Home Screen web app | T6 evidence pending | T6 evidence pending | T6 evidence pending | T6 evidence pending |

## Required independent automated gates

- Existing focused Customer, Native, API and contract tests, lint, typecheck, architecture line policy, build-contract test and `git diff --check`.
- Disposable PostgreSQL, migrated with real ordered migrations, only with authorized test setup/reset rights. Separate API and database suites; record exact target and runtime role, and preserve DEC-025 TLS/migration privileges.
- Real Customer browser E2E CI, no simulated backend as the sole correctness proof. Exercise Browser Session CSRF/revoke/context-transfer and reissue while background push is subscribed.
- Multiple Customer and API replicas with no process-local auth, subscription or notification business ownership. Restart while send claimed; recover pending work; retry backoff, duplicate worker delivery, provider failure and outbox reconciliation.
- Payment/custody race tests with independent source of truth. Confirm 1–5 rating immutable per visit and post-visit expiration/revocation; exact financial projection path authorization.

## T6 operational/release gates (not owned by T5)

- Real public HTTPS, exact Customer build/runtime origin match, secure cookies and CSRF through trusted proxy; real production-like startup/readiness and failure drains.
- 100 / 500 / 1000 concurrent active Guests (sequential qualification), same-NAT companions and normal users never accidentally rate-limited; finite quotas/headroom.
- 8-hour shift soak; 26-hour active-visit continuity soak; repeated app restarts and page/browser eviction; no shared process-local auth.
- One-instance-loss recovery target `<=30s`; managed PostgreSQL failover `<=120s`; measured RPO/provider evidence, backups, DNS/load balancer and rollback rehearsal.
- Notification queue/outbox age, retry count, permanent/provider failure, unsupported/denied subscription and true provider-vs-device delivery distinctions in bounded, private telemetry; alert delivery tested.
- Native Android binary and deployment separately authorized, proof collected with actual devices. T5 task expressly prohibits building APK/AAB/iOS binaries.
- Pilot support matrix, visual Owner sign-off, UI localizations/accessibility, real payment/receipt/help policies and explicit go/no-go.

**Verdict:** Required background/closed-app notification delivery and full HA/physical qualification remain **NOT VERIFIED** until their own approved implementation/runtime evidence exists. Do not use T5 mocked/unit test passes as substitute.
