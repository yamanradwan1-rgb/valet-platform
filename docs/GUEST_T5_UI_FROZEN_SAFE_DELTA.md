# Guest T5 — UI-FROZEN SAFE DELTA Proposal

Status: **OWNER UI REVIEW REQUIRED — NO PRODUCTION UI ACTIVATION**
Baseline: `74cc7064a907bec79c154e2d1afc55288ceffb1a` (2026-10-08)

This packet defines the smallest visible T5 changes that can be reviewed without
changing the frozen Guest/Native visual system. It records copy, trigger,
authority, direction and theme behavior only. Approval of one row does not
approve another row, a notification provider, deployment, Guest enrollment,
digital payment, or Guest incident intake.

## Audited sources and hard boundaries

- U-08 requires first-launch Guest continuity, secure handoff/recovery, real
  staff assistance, approved post-visit rating/receipt behavior and reliable
  background/closed-app READY notification.
- U-06 limits post-`COMPLETED` Guest authority to 24 hours of approved safe
  read/rating/receipt behavior. `CANCELLED`, expired and revoked contexts do not
  receive these surfaces.
- DEC-091 already defines the real rating contract: one immutable integer `1..5`
  for the exact completed visit; identical retry is idempotent and a different
  second value conflicts. `POST /v1/guest/session/rating` is the existing write.
- DEC-057 already defines the real financial source:
  `GET /v1/guest/valet-sessions/:sessionId/payment`. A valid post-completion
  Browser Session may use that read-only projection as approved receipt
  behavior. The projection contains only the documented payment/refund fields
  and grants no mutation or release authority.
- The readiness plan separately warns that a financial projection is not by
  itself proof of a legally/contractually valid receipt. Therefore this packet
  calls the source-backed surface **Payment summary**. Calling it a tax/fiscal/
  legal receipt, adding statutory fields, or promising delivery needs a separate
  Owner/legal decision.
- Customer Help is currently a development preview only. The Guest session
  projection contains branding name/color, but no approved support phone, email,
  desk or reception contact. `GuestApiClient` has no Guest Help/incident command.
  Native/staff incident authority is not Guest authority. No contact or report
  endpoint may be inferred from it.
- The current Help preview's “Contact hotel reception” is not a production-safe
  default because a VAYLET Location is not guaranteed to be a hotel. The current
  Receipt preview's “Standard Valet / Complimentary / 0.00” is fixture content
  and must never become live truth.

No non-visual Help integration is authorized by the audited repository because
there is no authoritative Guest-facing destination to integrate. Help remains
an Owner/source gate rather than a code change in this task.

## Delta T5-UI-01 — Native handoff Guest Access recovery

**Approval:** proposed; exact visible entry requires Owner approval. The recovery
domain behavior itself is already inside accepted T5 scope.

**Trigger and placement:** while the exact Native retrieval session is
`HANDOFF_PENDING` and handoff is still pending/unverified, add one secondary
action to the existing Native handoff surface. It opens the existing contextual
`guest-access` screen with origin `HANDOFF` and that same `sessionId`. The
contextual router already accepts `HANDOFF`; no new recovery flow is required.
Hide the entry after verification/completion. Guest Access rotation never
verifies handoff, consumes proof, releases the vehicle or changes custody.

**Exact copy:** reuse the existing production Native Guest Access dictionary.

| State/control | English | العربية |
| --- | --- | --- |
| Handoff entry | Guest Access | وصول الضيف |
| Reissue action | Reissue Access | إعادة إصدار الوصول |
| Reissue title | Reissue guest access? | إعادة إصدار وصول الضيف؟ |
| Reissue warning | The current guest access stops working immediately and is replaced by a new link. | يتوقف وصول الضيف الحالي فورًا ويُستبدل برابط جديد. |
| Copy action | Copy Guest Link | نسخ رابط الضيف |
| Copy success | Guest link copied | تم نسخ رابط الضيف |
| Active without held link | Guest access is active. The previous link cannot be shown again. Reissue to get a new shareable link. | وصول الضيف نشط. لا يمكن عرض الرابط السابق مرة أخرى. أعد الإصدار للحصول على رابط جديد للمشاركة. |

**Failure behavior:** keep existing Native Guest Access `OFFLINE`,
`OUTCOME_UNKNOWN`, intent-conflict and load/update failure presentation. A lost
issue response reconciles current server state and must not automatically rotate
again. No stale QR/link may remain visible after identity/session change.

## Delta T5-UI-02 — Guest READY background notification presentation

**Approval:** copy proposal only. Activation remains blocked until the focused
notification transport/provider, persistence/retention and supported browser/PWA
matrix are accepted and implemented. Foreground polling/toast is not evidence of
background delivery.

Use the existing approved foreground READY message for the OS/background
notification so foreground and background channels do not contradict each other:

| Element | English | العربية |
| --- | --- | --- |
| Notification title | Your vehicle is ready | سيارتك جاهزة |
| Notification body | Your vehicle has arrived at the pickup area. | وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك. |

If the selected transport requires an explicit in-app permission affordance,
the smallest proposed copy is:

| Element | English | العربية |
| --- | --- | --- |
| Permission title | Vehicle-ready notifications | إشعارات جاهزية المركبة |
| Permission body | Allow notifications so we can alert you when your vehicle is ready. | اسمح بالإشعارات لننبهك عندما تصبح مركبتك جاهزة. |
| Primary action | Enable notifications | تفعيل الإشعارات |
| Secondary action | Not now | ليس الآن |
| Denied/unavailable note | Notifications are off. Check your vehicle status here for updates. | الإشعارات متوقفة. تحقّق من حالة مركبتك هنا لمعرفة التحديثات. |

The notification click opens only the public Customer application origin. It
must carry no Guest bearer, internal session/tenant identifier, handoff proof,
plate, phone or payment data; the server reauthorizes the current Browser
Session. Permission denial never weakens custody checks or fabricates delivery.

## Delta T5-UI-03 — Post-visit rating

**Approval:** proposed; backend authority exists, production entry/success/error
presentation still needs Owner approval.

**Trigger:** show only for an authorized `COMPLETED` visit within the U-06
24-hour post-visit window. Start with no rating selected; do not preselect five.
Submit stays disabled until the Guest explicitly chooses `1..5`. Once the API
returns the canonical rating, render the recorded value read-only. Exact same
retry may converge to that success; a different already-recorded value is not
overwritten.

| Element | English | العربية |
| --- | --- | --- |
| Completed-screen entry | Rate your experience | قيّم تجربتك |
| Screen title | Rate your experience | قيّم تجربتك |
| Rating 1 accessibility label | 1 star | نجمة واحدة |
| Rating 2 accessibility label | 2 stars | نجمتان |
| Rating 3 accessibility label | 3 stars | 3 نجوم |
| Rating 4 accessibility label | 4 stars | 4 نجوم |
| Rating 5 accessibility label | 5 stars | 5 نجوم |
| Primary action | Submit rating | إرسال التقييم |
| Busy action | Submitting… | جارٍ إرسال التقييم… |
| Success | Thanks for your feedback. | شكرًا لملاحظاتك. |
| Existing different rating | A rating has already been recorded for this visit. | تم تسجيل تقييم لهذه الزيارة بالفعل. |
| Temporary failure | We couldn't submit your rating. Try again. | تعذّر إرسال تقييمك. حاول مرة أخرى. |

There is no rating entry for `CANCELLED`, expired or revoked authority. A network
failure does not show “Thanks” until canonical success/reconciliation is known.

## Delta T5-UI-04 — Source-backed payment summary

**Approval:** proposed as a source-backed **Payment summary**. A legal/tax receipt
designation and any download/email/share delivery remain unapproved.

**Trigger:** authorized `COMPLETED` post-visit context only. Use only the DEC-057
Guest payment projection; do not reuse preview fixture values and do not infer
`PAID`, currency, service amount, tip, collection method, validation or refund.

| Element | English | العربية |
| --- | --- | --- |
| Completed-screen entry | Payment summary | ملخص الدفع |
| Screen title | Payment summary | ملخص الدفع |
| No Payment and payment not required | Payment was not required for this visit. | لم يكن الدفع مطلوبًا لهذه الزيارة. |
| Service amount | Service | الخدمة |
| Tip amount | Tip | الإكرامية |
| Amount due | Amount due | المبلغ المستحق |
| Amount paid | Amount paid | المبلغ المدفوع |
| Collection method | Payment method | طريقة الدفع |
| Paid time | Paid at | وقت الدفع |
| Status | Status | الحالة |
| Refund section | Refunds | المبالغ المستردة |
| Close/back | Back | رجوع |
| Temporary read failure | We couldn't load the payment summary. Try again. | تعذّر تحميل ملخص الدفع. حاول مرة أخرى. |

Currency amounts and timestamps use the canonical projection plus existing
locale-aware formatting. In Arabic, mixed currency codes, Latin digits and
timestamps are direction-isolated rather than reordered by surrounding RTL.
There is no “tax invoice”, “official receipt”, receipt number, merchant tax ID,
download, email or share action until a separate approved legal/content source
defines those facts.

## Delta T5-UI-05 — Minimum truthful Guest staff assistance

**Approval:** **BLOCKED ON OWNER SOURCE/OPERATING DECISION.** No production Help
code is activated by this packet.

The smallest repository-supported candidate requires no invented contact: an
informational Help surface directing the Guest to on-site valet staff. Owner must
explicitly confirm that this is the real pilot assistance route for every pilot
Location. If any pilot Location instead requires phone, desk, reception, chat or
another destination, that destination needs an authoritative configured source
before the UI can expose it.

Candidate exact copy, if Owner accepts on-site staff as the pilot route:

| Element | English | العربية |
| --- | --- | --- |
| Entry | Help | المساعدة |
| Title | Need assistance? | هل تحتاج إلى مساعدة؟ |
| Body | Please speak with a valet staff member at this location. | يرجى التحدث مع أحد موظفي خدمة صف السيارات في هذا الموقع. |

Do not ship the preview “Contact hotel reception,” a fictional phone/email,
“Report Issue,” incident-submitted confirmation, emergency-response promise or
staff incident credential as Guest Help. If Owner rejects the on-site-only route,
the Help surface stays hidden until a real destination contract exists.

## EN/AR, RTL/LTR and Light/Dark acceptance matrix

Every approved delta must pass all four existing product modes without changing
the established header, spacing, typography, branding or navigation geometry.

| Mode | Direction | Theme rule | Required evidence |
| --- | --- | --- | --- |
| English Light | LTR | Existing Customer semantic `C.*` tokens / Native light employee palette only | Exact English copy; controls, focus/press states and existing geometry; no raw new color |
| English Dark | LTR | Existing dark semantic tokens / Native dark employee palette only | Same content/order/geometry as Light; readable status/error/disabled states |
| Arabic Light | RTL | Same semantic tokens as English Light | Exact Arabic copy; document/Native direction RTL; correct right alignment; no clipping at narrow viewport/device |
| Arabic Dark | RTL | Same dark semantic tokens as English Dark | Arabic parity with Light plus readable dark status/error/disabled states |

Additional invariants for the five deltas:

- Customer layout follows the existing `LocaleProvider` document direction and
  `ThemeProvider`; use semantic tokens (`C.surface`, `C.text`, `C.borderSemantic`,
  success/warning/danger tokens). Native uses `useEmployeeStyles` /
  `useEmployeePalette` and existing `EmployeeButton`/header/card primitives.
- Rating star values remain logically `1..5` independent of locale. The star
  control may be direction-isolated so RTL does not invert the numeric meaning;
  accessibility labels remain localized.
- Payment currency codes, amounts, timestamps, PIN/QR/link material and other
  inherently directional values are isolated LTR where required while labels
  and surrounding Arabic layout remain RTL.
- Notification title/body use the selected locale at subscription/delivery time
  according to the eventual accepted notification contract; no English fallback
  is shown as if it were Arabic success.
- Native Guest Access QR retains its existing high-contrast scan surface and
  privacy lifecycle. Recovery adds no token text, clipboard-history promise or
  persistent credential storage.

## Owner approval and screenshot gate

Before any proposed visible delta is enabled in production, record Owner approval
for that named delta and capture same-state evidence for English Light, English
Dark, Arabic Light and Arabic Dark. Native T5-UI-01 additionally needs physical
Android handoff evidence. T5-UI-02 additionally needs the supported real-device
background/closed-app matrix. T5-UI-05 cannot advance until the assistance source
decision above is explicit.

Until those gates pass, existing production-visible Guest/Native UI remains
unchanged and development previews remain previews.
