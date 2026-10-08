# Guest T5 — Pilot Feature and Authority Matrix

Status: implementation tracking; **not a rollout, UI, provider or physical acceptance**. Base `74cc7064a907bec79c154e2d1afc55288ceffb1a` (2026-10-08). The binding source is `GUEST_APP_PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md`, U-06/U-08/U-09 and the focused Accepted decisions.

## Current pilot authorization envelope

| Surface | Accepted initial pilot policy | Production/pilot gate | Baseline evidence/owner |
| --- | --- | --- | --- |
| QR/Copy Link Guest Access | Enabled after separately approved Guest enrollment; one primary browser binding, exact-visit authority and staff-assisted reissue | Enrollment **not enabled by T5** | T1 Browser Session / DEC-064; existing Native Guest Access |
| Same-visit continuity, request/status, secure handoff | Authorized core journey | T1–T4 code is not a substitute for T6 real-origin/device/HA evidence | DEC-040/042/043/044, T2 and T4 delivery docs |
| Native contextual Guest Access recovery | T5 implementation authorized | Visible handoff entry requires a named Owner UI-FROZEN SAFE DELTA; exact-session Native physical proof pending | `apps/valet-native/src/handoff/**`, `src/guest-access/**`; issue #219 |
| Foreground READY | Preserve working authorized notice and dedupe | Not evidence of background receipt | DEC-070; `apps/customer/src/features/ready-alert/**` |
| Background/closed-app READY push | **Required**, not a discretionary enhancement | Transport/provider, persistence/retention, approved browser/PWA support and real-device delivery must be accepted and demonstrated | T5 notification decision, then provider/schema implementation and T6 physical proof |
| Post-visit rating | Exactly one immutable integer 1–5 for authenticated `COMPLETED`, within 24h, not `CANCELLED` | Existing backend is not a live Customer screen; entry/success/error UI needs Owner delta approval | DEC-091; `POST /v1/guest/session/rating` |
| Financial payment projection | Read-only exact-session projection allowed, no-store and authorized for valid post-visit scope | Actual display may only be enabled after UI approval and truthful canonical data validation | DEC-057; `GET /v1/guest/valet-sessions/:sessionId/payment` |
| Cash collection | Staff-managed server-owned cash workflow, if configured | Never synthesize Guest digital `PAID` or release authority | DEC-051/057 |
| Digital checkout | **Disabled** (`paymentMethodsPolicy = CASH_ONLY`) | Deferred real provider decision; no fake checkout or payment-success view | DEC-051 |
| Guest tips | **Disabled** (`tipsEnabled = false`) | Do not expose tip mutation control | DEC-051 |
| Receipt | Distinguish legally valid payment receipt from a visit summary | Keep production control disabled unless authoritative source, legal fields, display policy and Owner UI are accepted | Existing Customer `features/deferred/screen-payment.tsx` is a preview |
| Real staff help | Required approved operational assistance route or truthful configured destination | No fabricated desk number, emergency destination or `Report Issue` endpoint; source and UI delta approval pending until proved | Existing Customer `features/deferred/screen-service.tsx` uses preview content |
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
| Persistence | Existing partial uniqueness/foreign-key, append-only audit, durable limiter, privileged rating SQL, T1 Browser Session generation and DEC-025 runtime/migration separation remain binding. New push schema requires a separate accepted contract. |
| Security/telemetry | No raw Guest bearer, cookie, enrollment secret, handoff PIN/QR, plate, phone, payment internals or tenant IDs in public push/log labels; no private SW cache. |

## State classification

An **implemented** client/API path is not automatically **UI approved**, **provider configured**, **physically tested** or **pilot enabled**. T5 branch delivery must report each axis separately. A preview is **not** an operational feature. The notification requirement is a mandatory first-launch gate even if transport approval remains pending.

## Source and decision dependencies

- U-08 fixes product scope; U-06 fixes post-visit; U-09 fixes runtime qualification. None authorizes new push provider/schema by implication.
- DEC-024/025 retain durable anti-abuse, TLS and runtime-role separation.
- DEC-040/042/043/044 retain current retrieval and handoff safeguards.
- DEC-051/057 retain typed cash/tip/digital and release/projection policy.
- DEC-064 governs Browser Session/rotation and cross-tenant context transfer only when a separate valid target bearer independently authorizes that exact target.
- DEC-070 keeps foreground READY; DEC-085 governs effective branding; DEC-091 owns immutable Guest rating.

Pending decisions and evidence are detailed in the T5 implementation, notification, UI-safe-delta and T6 handoff reports. No change to canonical DEC status is implied here.
