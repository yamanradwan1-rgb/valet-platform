# Issue #310 — Owner decisions reconciliation — 2026-11-14

**Execution authority: planning + isolated Native prototype only.** Initial local/remote SHA: `0a1d40c0518c34ad15e089b3f0dc9afac64a95ef`. Existing branch: `feat/issue-310-sandbox-last-mile-authorization`. This document records the November 14 Owner instruction; it does not create an Accepted repository DEC.

## Selected product direction and remaining gates

The complete [master plan](ISSUE_310_WHATSAPP_GUEST_ACCESS_MASTER_IMPLEMENTATION_PLAN.md) retains A–U and 16 phases / 48 bounded tasks. Its §T is the canonical D01–D12 reconciliation matrix for this task, covering previous plan, new selection, prototype/future API/DB/worker effects, external assets, technical blockers and owning phases.

| ID | Owner product selection | Technical/external or approval status |
|---|---|---|
| D01 | Central VAYLET sender; actual production number selected later | TECHNICAL CONTRACT PENDING: company-owned binding/tenant entitlement/correlation/secret ownership reconciliation. External number/WABA/Phone Number ID/credentials/templates not supplied |
| D02 | Manual sending ONLY after eligible employee tap | TECHNICAL CONTRACT PENDING: safely retire/fence historical automatic hook, legacy records, old replicas, restart/rollback/restore. No automatic code removed now |
| D03 | Existing voluntary phone-entry step for Guest-link communications is complete intended employee UX; no additional consent UI/step | TECHNICAL CONTRACT PENDING + external compliance: genuine operational permission provenance and accepted GRANT mapping, historic/future distinction, withdrawal/phone correction. No fabricated consent or bypass |
| D04 | Anyone with actual Check-In permission in current scope, not a guessed WhatsApp role list | TECHNICAL CONTRACT PENDING: reuse/reconcile real capability, current principal/member/org/Location/relevant Shift and exact target session, retries/status reads and revocation/transaction boundary |
| D05 | No per-tap rotation/reissue/browser invalidation, second successful/uncertain send or blind UNKNOWN retry | TECHNICAL CONTRACT PENDING: DEC-064/105 delayed first issuance and active/consumed/expired/revoked/unrecoverable credential handling; hashes cannot reconstruct a URL |
| D06 | Immediate same-button Sending… / جاري الإرسال…, later truthful Queued/Meta accepted/Delivered/Failed/Unknown/Disabled | TECHNICAL CONTRACT PENDING: safe query, cadence/budgets, fact precedence/freshness/retention/retry; genuine correlated provider fact required for real delivery |
| D07 | Durable duplicate-safe authorized server-derived session/recipient and audit | TECHNICAL CONTRACT PENDING: exact schemas, routes, errors, audit catalog, replay identity and transaction/locking mechanism. No implementation invented |
| D08 | Visible below existing conditionally available Guest Access; disabled/unavailable when ineligible | TECHNICAL CONTRACT PENDING: safe finite eligibility/reason projection. No silent hiding due to offline/sender/prerequisites. Backend remains authority |
| D09 | Shared provider capacity with tenant safeguards, fairness, abuse/cost/security/retention/restore/monitoring/rollout controls | TECHNICAL CONTRACT PENDING: provider-measured capacity, approved numeric quotas/prices/retention/SLOs and owners. No fabricated numbers |
| D10 | Owner design review remains separate | PENDING OWNER; copy refinement is not full design approval |
| D11 | Integrated security/QA release qualification remains separate | PENDING QUALIFICATION; prototype checks are not PG17/real provider/webhook/Guest/device/CI release proof |
| D12 | Production activation requires separate Owner authorization | PENDING OWNER ACTIVATION; no production activation, PR, merge, deployment or closure authorized |

D01–D09 are **OWNER DIRECTION SELECTED**, with the technical gates above. D10–D12 remain unapproved. The prior configurable auto/manual recommendation, eligible-only hiding, new consent UI alternatives and Guest-role-based send recommendation are superseded as product directions. Preserve their historical rationale in the plan; do not keep them as competing active requirements.

## Binding contract reconciliation needed later

- WA-D09/WA-D10 and DEC-087 currently describe company-owned sending numbers. Central ownership needs a focused approved amendment, scoped tenant grants, FK/privilege/verification/callback design and operations ownership. Removing global phone uniqueness alone is unsafe.
- WA-D02/C0 and DEC-105 permit the historical automatic new-Intake-only encrypted envelope. Manual delayed sending and retirement of that trigger need an accepted replacement, including legacy work/replica cutover. The current `initialGuestIssuance ?? createInitialGuestIssuanceFromEnv()` means a null option alone is not a proven disable strategy.
- DEC-064 retains hash-only credential/browser authority and explicit generation changes. DEC-105 is a narrow short-lived transport exception, not a recoverable token vault. The button must not hide reissue/resend under a retry.
- Current DEC-105/C0 recipient evidence gates remain in force. D03 selects operational UX intent but does not prove historical permission. Approve a truthful process/evidence mapping compatible with external requirements; if it cannot qualify, block dispatch and record the precise conflict without inventing an extra UI step.
- Command/query authorization, replay/status/audit/DB mechanisms require a proper accepted technical contract. No endpoint, DTO, status/error, event name, SQL function or lock is created here. Accepted focused DECs and `docs/08_DECISIONS_LOG.md` are intentionally unchanged.

## Current Check-In capability evidence

`apps/api/src/modules/check-in-api/check-in-location-authorization.ts::authorizeCheckInLocation` checks the active User, persisted Location/Organization, ACTIVE and accepting-intake state, active membership, explicit LocationAccess and current Check-In role filter through `custody-staff-authorizer.ts`. `intake-session-command.ts` calls it before first writes and existing-operation replay. The current role filter is implementation evidence, not a new independently selected WhatsApp allowlist.

This branch's Intake authorizer has no Shift query. OCR adds a separate Shift check; Parking/Task authority is separate again. Future implementation must reconcile the actual integrated Check-In capability, relevant Shift obligations and exact existing target-session scope. Rendering the button, a senior role or an active Shift alone does not establish authority. Every protected retry/status read must reauthorize; mutation follows authority, never the reverse.

## Prototype contract ledger

Allowed: exact button text/state/accessibility refinement, tests, plan/reconciliation/supporting docs, new synthetic Native captures, append-only Issue body section, task commits and normal push. Existing actual Parking Task source, header, fonts, colors, spacing, logo, Guest/Open Parking handlers, navigation and all shared UI remain unchanged from this task's initial SHA.

Visible labels use the exact Owner EN/AR table in master-plan §F. No Demo/تجريبي prefix or leading separator appears in the button. The accessible hint explains simulation/no message and explicitly qualifies simulated delivery. Default tap immediately shows Sending and busy/disabled/spinner on that same control; the 900ms local timer illustrates Queued only. Other finite states are visual fixtures, not remote results. No local timer or fake provider response is delivery evidence.

Affected entities/transitions: **none**; all display IDs remain synthetic. No ValetSession/Task/Dispatch transition, tenant/Location business read/write, DB constraint/index/migration, configuration policy, dependency or secret changes. The approved MVP capability is represented only by a development fixture. `__DEV__` and finite route parameters remain; no production caller supplies the optional slot.

## Evidence and Issue continuity

Original sandbox files/captures remain immutable historical evidence. Existing captures with Demo text do not prove the new copy. Current source-file hashes and failed capture-attempt notes live under `qa-artifacts/owner-2026-11-14/`. **No new PNG was accepted:** the 1536MiB emulator run reached an application ANR; the 1024MiB retry did not reach a usable booted fixture under shared-host memory pressure. Current default, Sending, remaining state, locale/theme/size/readability/pixel checks remain pending. Future paired captures must use the same running Native fixture/runtime/presets, with only `baseline=1` omitting the existing optional control; no production source checkout is needed because the actual Parking Task source is unchanged in this task.

See [visual spec](PROTOTYPE_VISUAL_PARITY_SPEC.md), [validation history/current evidence](PROTOTYPE_VALIDATION_EVIDENCE.md), [capture inventory](qa-artifacts/README.md) and [task file manifest](DELIVERY_FILE_MANIFEST.md). The new Issue section is `Owner Decision Update — 2026-11-14`; old body content and OPEN state/unmerged branch association must be preserved and read back after update.

Final delivery does not grant D10/D11/D12. **REAL FEATURE IMPLEMENTATION NOT STARTED. PRODUCTION SENDING OFF. MERGE NOT AUTHORIZED.** No production runtime controls are inspected or changed merely to support those scope statements; historical OFF evidence remains dated.
