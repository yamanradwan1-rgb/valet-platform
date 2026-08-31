# Issue #197 Web Push real-device smoke evidence

Status: BLOCKED — manual real-device execution required
Date: 2026-08-31
Slice: T7 — real-device Web Push smoke and final hardening
Base: `53fb90efb1775c6989bc4d216ddfb580ad381a04`

## Evidence boundary

This record does not claim real Web Push delivery. The available execution
environment had no configured runtime Web Push/VAPID material, no configured
public browser Web Push key, no HTTPS test origin or certificate, no connected
Android device/tooling, no iPhone/iPad device, and no callable browser DevTools
integration. Microsoft Edge was installed, but an installed browser alone
cannot exercise the backend sender, browser push service, or OS notification
boundary.

No secret, token, endpoint, phone number, plate, or private identifier was read
or recorded. No production or staging environment was contacted.

Automated tests and builds below are supporting local-command evidence only.
They do not satisfy any real-device row.

## Minimum acceptance matrix

| Date | App | Device category | OS/browser/mode | Permission | App state | Canonical trigger | Expected behavior | Observed behavior | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-31 | Employee | Android mobile | Not available | Not tested | Background/closed | Normal Customer Retrieval Request | Backend push, OS notification, click to Tasks, canonical refetch | No physical Android device and no configured real-push environment | BLOCKED |
| 2026-08-31 | Customer | Android mobile | Not available | Not tested | Background/open client | Request Vehicle followed by staff Mark Ready | Backend push, localized OS notification, exact-session focus and refetch | No physical Android device and no configured real-push environment | BLOCKED |
| 2026-08-31 | Customer | Android mobile | Not available | Not tested | Fully closed/no authorized client | Request Vehicle followed by staff Mark Ready | Notification click opens fixed credential-free `/re-entry` | No physical Android device and no configured real-push environment | BLOCKED |
| 2026-08-31 | Employee and Customer | iPhone/iPad | iOS/iPadOS browser mode unavailable | Not tested | Foreground | Explicit notification UX after the normal prerequisite flow | Home Screen guidance and no automatic permission request | No iPhone/iPad device available | BLOCKED |
| 2026-08-31 | Employee and Customer | iPhone/iPad | iOS/iPadOS 16.4+ Home Screen unavailable | Not tested | Background/closed | Normal Retrieval Request and Mark Ready flows | Real Home Screen Web Push and safe click/refetch behavior | No compatible iPhone/iPad device available | BLOCKED |

Minimum rows passed: 0

Minimum rows failed: 0

Minimum rows blocked: 5

T7 is not fully complete.

## Additional requested scenarios

| Scenario | Result | Reason |
| --- | --- | --- |
| Employee Android browser and optional installed PWA | BLOCKED | No Android device and no configured real-push environment |
| Customer Android browser | BLOCKED | No Android device and no configured real-push environment |
| Employee iOS browser mode | BLOCKED | No iPhone/iPad device |
| Customer iOS browser mode after Request Vehicle | BLOCKED | No iPhone/iPad device |
| Employee iOS Home Screen mode | BLOCKED | No compatible iPhone/iPad device |
| Customer iOS Home Screen GuestAccess re-entry behavior | BLOCKED | No compatible iPhone/iPad device |
| Employee desktop browser real delivery | BLOCKED | Edge installed; HTTPS/VAPID/backend push path unavailable |
| Customer desktop browser real delivery | BLOCKED | Edge installed; HTTPS/VAPID/backend push path unavailable |
| Default to granted, granted to denied, and restoration through browser settings | BLOCKED | No configured real-push browser session |
| Lock screen | BLOCKED | No physical device smoke environment |
| Focus/Do Not Disturb | BLOCKED | No physical device smoke environment |
| Android battery saver/Doze | BLOCKED | No Android device |
| Offline then restored delivery | BLOCKED | No configured real-push environment |
| Real-device duplicate/tag presentation | BLOCKED | No configured real-push environment |
| Employee Staff session switch | BLOCKED | No configured real-push environment |
| Customer Guest context switch | BLOCKED | No configured real-push environment |
| English and Arabic OS notifications | BLOCKED | No configured real-push environment |
| Real Service Worker update/ownership observation | BLOCKED | No callable browser DevTools integration |
| Real browser Application/Storage privacy observation | BLOCKED | No callable configured browser session |

## Automated supporting evidence

Current-checkout local-command evidence:

- Employee T4/T6, DEC-070, and Staff auth/logout browser suites: 19 files,
  98 tests passed.
- Customer T5/T6, DEC-070, GuestAccess composition, and re-entry browser
  suites: 18 files, 79 tests passed.
- T3 worker, processor, policy, sender, and payload suites: 5 files, 23 tests
  passed.
- T2/T3 database integration, GuestAccess lifecycle, and Staff authentication:
  6 files, 71 tests passed.
- Root typecheck: 9 of 9 tasks passed.
- Root lint: 9 of 9 tasks passed.
- Root build: 9 of 9 tasks passed, including Employee and Customer production
  builds.
- Targeted Prettier and `git diff --check`: passed.
- DEC-071 VAYLET planning audit: no heuristic red flags.
- Production browser-chunk private Web Push configuration identifier scan:
  passed.
- Architecture check: only the eight known oversized `reference/` UI files
  failed; no task file violated the authored-code limit.

Total focused automated tests passed: 271.

These results verify the implemented contracts locally. They do not verify a
real push provider, OS notification delivery, physical-device behavior, or
browser permission UX.

## Defects

No real-device defect was observed because the real-device/provider boundary
could not be executed. No production code was changed.

## Manual completion requirements

Use a sanitized configured HTTPS environment and non-production test accounts,
with real VAPID configuration available only to the intended server/browser
configuration boundaries. Execute all five minimum acceptance rows above and
record exact device class, OS/browser versions, display mode, permission state,
app state, canonical trigger, observed notification/click behavior, and result.

Also record the requested platform limitations and privacy observations without
capturing PushSubscription material, GuestAccess, credentials, customer data,
or private configuration. Unexecuted rows must remain `BLOCKED`; a failed row
must remain `FAIL` until a defect is fixed and the same real scenario passes.
