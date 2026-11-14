## Owner Decision Update — 2026-11-14

**PLANNING + ISOLATED NATIVE PROTOTYPE ONLY. REAL FEATURE IMPLEMENTATION NOT STARTED UNDER THIS TASK. PRODUCTION SENDING REMAINS OFF.**

This dated Owner update supersedes prior unselected product alternatives, while preserving all historical Sandbox evidence and technical contracts until properly reconciled. Product choice is **OWNER DIRECTION SELECTED**; required implementation amendments remain **TECHNICAL CONTRACT PENDING**. This update is not an Accepted DEC or production implementation authorization.

| Decision | Selected direction / outstanding gate |
|---|---|
| D01 | Central VAYLET sender retained. Actual production number, WABA, Phone Number ID and credentials are deferred; none provided or invented. Tenant authorization and Company/Location policies remain. WA-D09/WA-D10, DEC-087/105, company binding FKs and webhook lookup need future approved reconciliation; Sandbox assets are not production assets |
| D02 | **Manual-only sending:** complete Check-In → Parking Task → existing Guest Access → green WhatsApp button → eligible employee tap → future backend. No automatic sending at Check-In completion. Existing automatic source is unchanged now; future approved cutover must safely disable/replace it, handle old replicas/legacy work and prove no hidden automatic dispatch or duplicates |
| D03 | Existing voluntary phone collection for receiving the Guest Access link is the intended complete employee-facing permission flow. No additional checkbox, screen, modal or employee step requested. Historical phone records are not manufactured consent evidence. Verifiable operational permission/notice/provenance, withdrawal, recipient correctness and provider/legal suitability remain release gates; current dispatch/consent controls are not bypassed |
| D04 | Any authenticated employee genuinely permitted to perform Check-In in the relevant scope may request the action. Reuse/reconcile actual Check-In capability, current principal/member/Organization/Location/relevant Shift and exact target session authority, including retries/status reads and revocation. No guessed role list, seniority inheritance or visibility-as-authorization |
| D05 | No implicit credential rotation/reissue/replacement or Guest browser invalidation due to repeated taps. No automatic second outbound message after successful or uncertain send; no blind UNKNOWN retry. Backend owns credentials; Native supplies no token. DEC-105 delayed-manual lifecycle and active/consumed/expired/revoked/unrecoverable handling remain technical gates |
| D06 | **Immediate same-button `Sending…` / `جاري الإرسال…`**, ActivityIndicator/busy and concurrent-submission prevention. Queued means durable backend acceptance; Meta accepted means provider acceptance; real Delivered requires authenticated correlated provider evidence. Authoritative Failed remains separate from timeout/UNKNOWN. Exact query/cadence/precedence/retry contracts pending |
| D07 | Durable duplicate-safe authorization, recipient/session derivation, concurrency/retry/unknown-commit/crash/callback/lifecycle/withdrawal/revocation and audit safety retained. No client-selected recipient/token or invented final route/schema/error/event/SQL/lock contract |
| D08 | Button stays visible directly below conditionally available Guest Access; show disabled/unavailable when ineligible, offline or missing prerequisites. Backend eligibility remains authoritative; no sensitive recipient/resource-existence disclosure |
| D09 | Shared provider capacity with global limits, tenant budgets/fairness/rate/abuse/cost/privacy/credential/kill/retention/backup/restore/alerts/runbooks and controlled rollout. Numeric quotas, costs, retention/SLOs and provider details require approval/evidence |
| D10 | **PENDING OWNER DESIGN APPROVAL**; selecting revised copy is not full design approval |
| D11 | **PENDING SECURITY/QA AND INTEGRATED RELEASE QUALIFICATION**; local prototype checks do not establish real provider/PG17/webhook/Guest/device/CI readiness |
| D12 | **PENDING OWNER PRODUCTION ACTIVATION AUTHORIZATION**; no activation authorized |

### Native prototype refinement and UI freeze

Visible `Demo ·` / `تجريبي ·` prefixes and leading separators are removed from every WhatsApp button state. English: Send via WhatsApp, Sending…, Queued by VAYLET, Meta accepted, Failed, Outcome unknown, Delivered, Unavailable. Arabic: إرسال عبر واتساب، جاري الإرسال…، في قائمة إرسال VAYLET، قبلت Meta الطلب، تعذّر الإرسال، نتيجة الإرسال غير معروفة، تم التسليم، الإرسال غير متاح.

Only this existing green WhatsApp-logo control is refined. Header, VAYLET logo, Location, Back/title, vehicle/status/tracking notice, Open Parking, Guest Access, fonts/colors/spacing/radii/shadows/icons, bottom navigation, hierarchy and business handlers remain frozen. No extra status card, popup, toast or consent UI.

The prototype remains development-only, synthetic-data-only and local-state-only, with the `__DEV__` boundary intact. Its accessibility hint says that no message is sent and simulated delivery is not provider evidence. No actual messaging API, Guest credential, provider response, database write or production Native action is introduced. The local Sending→Queued illustration is not a real backend result or future retry policy.

### Updated plan and review evidence

- [Complete Master Implementation Plan — A–U, 16 phases / 48 tasks](https://github.com/yamanradwan1-rgb/valet-platform/blob/feat/issue-310-sandbox-last-mile-authorization/docs/plans/issue-310/ISSUE_310_WHATSAPP_GUEST_ACCESS_MASTER_IMPLEMENTATION_PLAN.md)
- [Owner decisions reconciliation / required future DEC amendments](https://github.com/yamanradwan1-rgb/valet-platform/blob/feat/issue-310-sandbox-last-mile-authorization/docs/plans/issue-310/OWNER_DECISIONS_RECONCILIATION_2026-11-14.md)
- [Current visual specification](https://github.com/yamanradwan1-rgb/valet-platform/blob/feat/issue-310-sandbox-last-mile-authorization/docs/plans/issue-310/PROTOTYPE_VISUAL_PARITY_SPEC.md)
- [Current-source identity, capture attempts and pending visual checks](https://github.com/yamanradwan1-rgb/valet-platform/tree/feat/issue-310-sandbox-last-mile-authorization/docs/plans/issue-310/qa-artifacts/owner-2026-11-14)
- [Validation and evidence boundaries](https://github.com/yamanradwan1-rgb/valet-platform/blob/feat/issue-310-sandbox-last-mile-authorization/docs/plans/issue-310/PROTOTYPE_VALIDATION_EVIDENCE.md)
- [Changed-file manifest](https://github.com/yamanradwan1-rgb/valet-platform/blob/feat/issue-310-sandbox-last-mile-authorization/docs/plans/issue-310/DELIVERY_FILE_MANIFEST.md)

The complete future roadmap still covers Check-In authority, recipient/evidence, Guest credentials, approved command/contracts, DB integrity/PG17, durable outbox/worker/Meta/webhook/status, production Native wiring, security/CI/device qualification and deployment/monitoring/rollback. Those packages are **not executed by this task**. Exact technical contract amendments and D10/D11/D12 remain gates.

**Fresh visual evidence is PARTIAL:** two task-owned Android emulator attempts failed to reach a usable fixture under shared-host memory pressure, so no new screenshot or pixel comparison is claimed. New default/Sending/remaining-state captures, EN/AR × Light/Dark and small/standard label-fit/parity checks remain pending. Prior Demo-prefix screenshots remain historical and do not verify this copy. Current source and tests preserve the original UI and verify labels/local-only behavior, but do not replace Native visual review.

**Issue #310 stays OPEN**, associated with the same unmerged [`feat/issue-310-sandbox-last-mile-authorization`](https://github.com/yamanradwan1-rgb/valet-platform/tree/feat/issue-310-sandbox-last-mile-authorization) branch. Historical Sandbox PASS, original acceptance scope, evidence, commits and OFF controls are preserved. No live WhatsApp test occurred in this update. **No PR, merge/rebase, deployment, production implementation/activation or Issue closure is authorized. The next execution phase requires a separate explicit Owner instruction.**
