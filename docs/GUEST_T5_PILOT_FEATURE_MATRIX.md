# Guest T5 — Pilot Feature and Authority Matrix

Status: **OWNER PRODUCT/UI/WEB PUSH CHOICES APPROVED (DEC-101)**; code/runtime/physical qualifications remain separate. Base `74cc7064a907bec79c154e2d1afc55288ceffb1a` (2026-10-08). The binding source is `GUEST_APP_PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md`, U-06/U-08/U-09 and the focused Accepted decisions.

## Current pilot authorization envelope

| Surface | Accepted initial pilot policy | Production/pilot gate | Baseline evidence/owner |
| --- | --- | --- | --- |
| QR/Copy Link Guest Access | Enabled after separately approved Guest enrollment; one primary browser binding, exact-visit authority and staff-assisted reissue | Enrollment **not enabled by T5** | T1 Browser Session / DEC-064; existing Native Guest Access |
| Same-visit continuity, request/status, secure handoff | Authorized core journey | T1–T4 code is not a substitute for T6 real-origin/device/HA evidence | DEC-040/042/043/044, T2 and T4 delivery docs |
| Native contextual Guest Access recovery | **T5-UI-01 Owner-approved** for current authorized unverified Handoff | Enable exact-session entry in Native; Android physical proof remains pending | `apps/valet-native/src/handoff/**`, `src/guest-access/**`; issue #219 |
| Foreground READY | Preserve working authorized notice and dedupe | Not evidence of background receipt | DEC-070; `apps/customer/src/features/ready-alert/**` |
| Background/closed-app READY push | **Required; T5-PUSH-01..09 Owner-approved**, standards Web Push, approved durable DB, sender and browser/PWA contract | Code/local evidence separately tracked; live provider, production config, Android/iOS actual device proof still outstanding | Accepted DEC-101 and T5 Web Push contract |
| Post-visit rating | **T5-UI-03 Owner-approved**; exactly one immutable integer 1–5 for authenticated `COMPLETED` within 24h, not `CANCELLED` | Enable current real Customer form, preserve authoritative revoked/expired/ambiguous guards; test production mode | DEC-091; `POST /v1/guest/session/rating` |
| Financial payment projection | **T5-UI-04 Owner-approved Payment Summary**; read-only exact-session no-store and valid post-visit scope | Enable source-backed UI only; never infer paid/zero/receipt | DEC-057; `GET /v1/guest/valet-sessions/:sessionId/payment` |
| Cash collection | Staff-managed server-owned cash workflow, if configured | Never synthesize Guest digital `PAID` or release authority | DEC-051/057 |
| Digital checkout | **Disabled** (`paymentMethodsPolicy = CASH_ONLY`) | Deferred real provider decision; no fake checkout or payment-success view | DEC-051 |
| Guest tips | **Disabled** (`tipsEnabled = false`) | Do not expose tip mutation control | DEC-051 |
| Receipt | **Official/legal/tax receipt explicitly deferred** | Do not show legal receipt, invented identifiers, statutory claims or download | Existing Customer `features/deferred/screen-payment.tsx` is a preview |
| Real staff help | **T5-UI-05 Owner-approved:** on-site valet employee assistance | Only enable Help for Locations with independently verified operational support; no fabricated desk, emergency destination or `Report Issue` endpoint | Accepted DEC-101, Location-specific operational proof still required |
| Full Guest incident/claim intake | Deferred | Do not turn preview submission into reported incident | Existing deferred Report Issue presentation |
| Automatic Guest Access SMS/WhatsApp | Deferred | No channel/provider addition | U-08 |

## Binding domain and access rules

| Boundary | Authoritative rule |
| --- | --- |
| Custody | `PARKED -> REQUESTED -> RETRIEVING -> READY -> HANDOFF_PENDING -> COMPLETED`; pre-start cancellation `REQUESTED -> PARKED`. T5 adds **no custody state or transition**. |
| Retrieval/dispatch | Current RetrievalRequest, RETRIEVAL Task, dispatch and audit command lifecycles remain separate. Guest recovery cannot create or advance them. |
| Staff recovery | Authenticated active User + active membership + active Organization/Location + explicit Location access + **exact** accepted issue/reissue role + current locked session/revalidation; required audit in mutation transaction. Do not infer role parity. |
| Guest auth | Canonical active or 24-hour `POST_VISIT` Browser Session or explicitly staged permitted legacy source; server resolves visit/tenant/location. No client ID is authority; revoked/expired/old generations fail closed. |
| Post-visit | `COMPLETED` permits only approved read/rating/receipt for 24h. It cannot request/cancel retrieval, create/rotate proof or reopen custody. `CANCELLED` is excluded. |
| Handoff | Proof issuance, verification, consumption and vehicle release are independent commands with DEC-042/043 guards. Guest Access rotation satisfies none of them. |
| Financial | Payment is independent of physical custody. DEC-057 release check reads authoritative Payment and effective `Organization default -> Location override` policy; Guest projection grants no release authority. |
| READY event | First committed `RETRIEVING -> READY` with server `ready_at`, stable identity `(ValetSession.id, ready_at)`. No push send may fabricate business truth. |
| Persistence | Existing partial uniqueness/foreign-key, append-only audit, durable limiter, privileged rating SQL, T1 Browser Session generation and DEC-025 runtime/migration separation remain binding. **Guest Push schema, forward migration and bounded runtime grants now authorized by DEC-101**. |
| Security/telemetry | No raw Guest bearer, cookie, enrollment secret, handoff PIN/QR, plate, phone, payment internals or tenant IDs in public push/log labels; no private SW cache. |

## State classification

An **Owner-approved** design is not automatically **implemented**, **locally tested**, **provider configured**, **runtime tested**, **physically tested** or **pilot enabled**. T5 must report each axis separately. A preview is **not** an operational feature. The mandatory notification contract is **approved**, while actual device proof remains a first-launch gate.

## Source and decision dependencies

- U-08 fixes product scope; U-06 fixes post-visit; U-09 fixes runtime qualification. **Accepted DEC-101 explicitly approves** push provider/schema and all five UI deltas for repository implementation, without implying deployment.
- DEC-024/025 retain durable anti-abuse, TLS and runtime-role separation.
- DEC-040/042/043/044 retain current retrieval and handoff safeguards.
- DEC-051/057 retain typed cash/tip/digital and release/projection policy.
- DEC-064 governs Browser Session/rotation and cross-tenant context transfer only when a separate valid target bearer independently authorizes that exact target.
- DEC-070 keeps foreground READY; DEC-085 governs effective branding; DEC-091 owns immutable Guest rating; DEC-101 authorizes bounded Web Push and pilot UI.

Approved product choices and the remaining **implementation, runtime and physical** gates are detailed in the T5 implementation, notification, UI-safe-delta and T6 handoff reports.
