# Guest T5 — Bounded Product Completion & Operational Recovery

Status: **PARTIAL — OWNER/PROVIDER/UI DECISIONS REQUIRED**. T5 implementation is **NOT fully complete**, physical background notification proof is **NOT VERIFIED**, and production readiness is **NOT VERIFIED**. Report date: 2026-10-08 (Asia/Amman).

## 1. Git and isolation

- Repo: `veletpro0-lgtm/valet-platform`.
- Base: verified `origin/main` and initial local `main` both `74cc7064a907bec79c154e2d1afc55288ceffb1a`; no newer commits at fetch.
- Branch: `feat/guest-t5-pilot-completion-recovery`; isolated worktree `tmp/guest-t5-worktree`.
- Pre-existing dirty Dashboard files in the primary worktree were left untouched.
- **Never** interpret this report/branch as a PR, merge, `main` update, deployment, migration, feature-flag activation, APK build or approval of new Web Push transport.

## 2. Authority and gap audit

This table distinguishes pre-existing working backend authority from newly wired behavior and production visibility. Exact security authority is still resolved on the API/DB, not inferred from the client.

| Feature | Existing source and authoritative boundary | Gap addressed / still outstanding | Security and UI gate | T5 implementation owner |
| --- | --- | --- | --- | --- |
| Native contextual recovery | `apps/valet-native/src/guest-access/**`, `src/handoff/**`, Employee client staff issue/reissue, persisted GuestAccess generation | Contextual exact-session recovery helper, guarded Native GuestAccess credential handling; real visible handoff CTA still gated pending Owner T5-UI-01 | No fabricated raw-token regeneration; no verification/custody effect; Native real-device proof pending | Native T5 |
| Closed/background Guest READY | `apps/customer/public/sw.js` currently public static cache; `features/ready-alert/**` DEC-070 foreground; API Mark Ready persisted `ready_at` | Proposed Web Push contract only; **NO sender, registration, push event or provider code** without explicit transport, schema, retention, dependency, deployment and UI approval | BrowserSession/generation-bound recipient; stable `session + ready_at`, post-commit only, no private payload; U-08 first-launch blocker | `GUEST_T5_NOTIFICATION_CONTRACT_AND_DECISIONS.md` |
| Completed visit rating | `POST /v1/guest/session/rating`, DEC-091, privileged exact-visit immutable DB write, shared strict schemas | Customer client `submitRating` + dev-gated real rating UI + coordinator and focused tests; no production entry until T5-UI-03 approval | Same-browser CSRF, 1..5 validation, unknown-outcome no blind POST retry, exact response session fence; authoritative read-after-lost-response is not currently exposed | Customer T5 |
| Financial projection | `GET /v1/guest/valet-sessions/:sessionId/payment`, DEC-057, strict guest projection contract | Customer `loadPaymentProjection` read-only typed API method; no production payment/receipt presentation until approved source/visible delta | GET no-store, current canonical visit only; client path is not authority, backend enforces exact session; no release mutation | Customer T5 |
| Receipt/visit summary | `features/deferred/screen-payment.tsx` uses preview `0.00` etc; canonical Payment projection exists | No fake receipt implemented. Propose source-backed **Payment summary** under T5-UI-04; legal receipt fields/format/source not approved | `payment: null` remains valid, don't invent collection, service fee, merchant or tax number | T5 UI/source proposal |
| Guest staff help | `features/deferred/screen-service.tsx` preview assumes hotel reception; no approved Guest contact/destination or incident endpoint | No fabricated Help submitted state. Propose on-site staff-only guidance **only if Owner confirms operational path** | Exact authorized Location, no staff incident credentials; T5-UI-05 Owner/source gate | T5 UI/source proposal |

## 3. Changed code and preserved contracts

### Customer — bound rating and payment reads

- `apps/customer/src/lib/api/guest-api-client.ts`: `submitRating()` validates the existing 1–5 request/response schemas and uses existing POST CSRF/no-store request boundary; `loadPaymentProjection()` accepts the **current canonical session** and parses the strict existing Guest projection response. No new route, authorization source, persistent Client rating state, network replay helper or mutation contract was added.
- `apps/customer/src/features/rating/guest-rating-submission.ts`: immediate duplicate-press guard, per-client/per-visit generation fencing, exact returned visit ID success check, ambiguous submit classified as **unknown**, not submitted/success or blind re-POST. HTTP 409 errors are distinguished by **exact** `GUEST_RATING_CONFLICT` versus `GUEST_RATING_NOT_AVAILABLE` server code; the latter never claims an existing rating.
- `apps/customer/src/features/rating/guest-live-rating.tsx`: in-progress/saved/conflict/unavailable/unknown/failure presentation, explicit star choice (no default 5-star consent), localized AR/EN copy, accessibility semantics. It replaces only the **development-only** rating preview flow. The `COMPLETED` entry remains development-only, preserving frozen production UI.
- Existing `screen-payment.tsx` fake `0.00`, add-tip, payment-success and receipt preview content remains **not production visible**. No Guest tip/digital pay operation was added; `CASH_ONLY`, `tipsEnabled=false` and DEC-057 financial release guard remain untouched.

### Native — exact handoff recovery scope

- Contextual target derives from a current authorized `HANDOFF_PENDING` retrieval/handoff snapshot and matches exact `sessionId`, Location, Task, role and an **unverified** handoff proof. The existing Native Guest Access screen, QR/Copy Link and staff APIs remain the only credential system.
- The real `NativeProductionWorkspace -> NativeHandoffPanel -> NativeHandoffPending` hierarchy now passes a contextual `guest-access` opener and reuses the existing localized Native Guest Access button. The opener and button remain **render-time hidden** while `NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED=false`; toggling that constant requires separately recorded Owner T5-UI-01 approval and visual evidence.
- Native Guest Access transient credentials are never reconstructed from `ACTIVE` status or stored verifier. Reissue/revoke remains a separate staff-authorized mutation, distinct from proof issuance, verification, handoff completion, payment and release.
- Recovery after lost POST response must reconcile the authoritative GuestAccess status with GET and cannot synthesize a raw URL or blindly rotate again. Background/logout/change of task must remove transient presentation proof and ignore old results.
- `NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED=false` is deliberate: the new visible handoff entry is not yet Owner-approved. **Issue #219 is not ready to close** and physical workflow proof is pending.

## 4. Domain, security and privacy invariant checklist

| Invariant | T5 handling / evidence classification |
| --- | --- |
| Custody lifecycle and separate Task/Dispatch | Unchanged. No T5 operation introduces states or makes a retrieval/handoff transition. |
| Exact staff scope | Existing User/membership/role/Location and lock/recheck APIs stay authoritative; no client `organizationId` can grant access. Focused Native tests must prove the contextual target rejects wrong session/scope. |
| Guest credential generation | Browser Session generation remains server checked; stale links cannot be regenerated. Reissue invalidates previous generation, including old Browser Sessions. |
| Secure handoff/release | No T5 recovery action issues/consumes proof, verifies handoff, releases, completes visit or bypasses DEC-057 financial guard. |
| Post-visit | Only `COMPLETED` grants limited rating/read for 24 hours; `CANCELLED` and expired/revoked fail on API, even if client presentation is stale. |
| Immutable rating | Backend DEC-091 remains authority for identical retry/different second value conflict; Customer has no persistent mutable shadow rating. |
| Error/replay | Transport-level ambiguous POST is not automatically reissued; absent authoritative rating GET, UI shows unresolved rather than fake saved state. This remains a focused read-contract consideration if full lost-response reconciliation is required. |
| Payment history | No writes/corrections/refunds/tips or fake digital/cash payment completion were added. Payment projection does not grant custody release. |
| Notification privacy | Provider-specific code not implemented; proposal forbids secret, plate, phone, internal ID or payment/tenant data in public payload/analytics, and requires send-time reauth and cleanup. |
| Service Worker and foreground READY | Existing public-static-only SW and DEC-070 foreground tracker unchanged. T2 21±1-second visible polling / 35-second stale threshold / no background polling remain unchanged. |
| Schema/infrastructure | No Prisma migration, DB runtime grants, provider keys, dependency, feature flag, DNS, Cloudflare or deployment changed. |

## 5. Testing and evidence classification

| Check | Result |
| --- | --- |
| `pnpm --filter @valet/customer exec vitest run src/lib/api/guest-t5-api.test.ts src/features/rating/guest-rating-submission.test.ts src/lib/api/api-error.test.ts` | **PASS: 3 files / 27/27**, including exact server rating 409 conflict/unavailable distinction, duplicate press, stale response and ambiguous outcome. |
| `pnpm --filter @valet/customer test` | **PASS: 43 test files / 308/308 tests**, final after reviewer C error-classification remediation. |
| `pnpm --filter @valet/customer typecheck` | **PASS** after final Customer changes. |
| `pnpm --filter @valet/customer lint` | **PASS** after final Customer changes. |
| `pnpm --filter @valet/valet-native exec vitest run test/native-guest-access-recovery.test.ts test/native-guest-access-issuance.test.ts test/native-handoff-guest-access-recovery.test.ts test/native-handoff-panel.test.tsx test/native-release-panel.test.tsx` | **PASS: 5 files / 64 tests** with exact snapshot, lost-response, generation and proof/release negative coverage (before extra hidden-button mount). |
| `pnpm --filter @valet/valet-native exec vitest run test/native-handoff-recovery-mounted.test.tsx` | **PASS: 5/5** mounted localized hidden-button/busy tests. |
| `pnpm --filter @valet/valet-native exec vitest run test/native-guest-access-recovery.test.ts test/native-guest-access-issuance.test.ts test/native-handoff-guest-access-recovery.test.ts test/native-handoff-recovery-mounted.test.tsx test/native-handoff-panel.test.tsx test/native-release-panel.test.tsx` | **PASS: 6 files / 69/69**, final Native contextual/controller/mounted/secure-proof tests. |
| `pnpm --filter @valet/valet-native lint` and `typecheck` | **PASS** after final Native handoff hierarchy wiring. |
| `pnpm --filter @valet/valet-native test` | **FAIL: 210 files passed / 6 failed; 1552 tests passed / 11 failed; 1 failed import suite**. Failing test sources concern Native brand-asset bytes, Shift Light render `editable`, old Parking “Start Parking” copy, `expo-location` package-contract expectation, and an Expo `__DEV__` import. These tests and production sources were not modified by T5. Failures classify as **out-of-scope suspected baseline**, not verified against a clean main run. Do not infer a T5 pass for the full Native suite. |
| `pnpm test:build-contract` | **PASS: 8/8**, existing T4 origin/build contract. |
| `pnpm architecture:check` | **Baseline FAIL outside T5:** `packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts` 328-line ungrandfathered code; `packages/employee-client/src/employee-shift-presence-local-provenance.test.ts` portable `window` boundary. These defects were reported in T2 docs; don't hide them by unrelated edits. |
| `pnpm --filter @valet/contracts exec vitest run src/guest-rating.test.ts src/payment-projections.test.ts` | **PASS: 2 files / 25/25** strict rating/payment schemas. |
| `pnpm --filter @valet/api exec vitest run test/guest-rating-service.test.ts test/guest-rating-command.test.ts test/guest-rating-module-ownership.test.ts` | **FAIL: 2 passed / 1 failed**. Both rating command/service contract tests passed; unmodified module ownership test expects only four GuestAccess controllers and fails because T1 `GuestBrowserContextController` exists. This is outside T5; not a new T5 mutation/API. |
| `pnpm test:non-postgres` | **FAIL** in broad parallel harness: among failures are unrelated existing Native asset/parking/package-manifest/Shift presentation, Dashboard operations text, Employee Web retrieval key proof and API module ownership/audit expectation. Specific T5 focused tests passed. Broad suite is not certified as passing; full baseline reproduction against isolated main not performed. |
| PostgreSQL API/database integration | **UNEXECUTED** unless a confirmed, authorized disposable DB target is available. Shared/staging/production fixtures are forbidden. |
| Physical Native/Android/iOS & background push | **NOT EXECUTED**; APK/AAB/iOS build forbidden by T5. Mocked tests cannot certify physical receipt. |

Tests exercise real client contracts but use controlled HTTP mocks; they do **not** prove server-side execution or device receipt. Backend Guest rating and Payment authority predate T5 and have their own API/database coverage. Security reviewer pass must distinguish verified local tests from runtime unknowns.

## Independent review results

- **Reviewer A — PASS**: Guest Browser Session/24h post-visit authority, exact Native handoff scope, no proof/release bypass, stale outcome and financial projection; no P0/P1 code blocker.
- **Reviewer B — PASS**: corrected Web Push proposal now binds approved EN/AR copy, documents provider-inflight revoke race without overclaiming, and requires multi-replica SQL uniqueness/lease fencing; no implemented push code or provider/config claim.
- **Reviewer C — PASS after remediation**: initially blocked status-only HTTP 409 rating classification. T5 now preserves and distinguishes `GUEST_RATING_CONFLICT` from `GUEST_RATING_NOT_AVAILABLE`, never falsely claiming a previous rating; added exact transport/controller regression tests (focused 27/27). Re-review found no remaining P0/P1 in product/UI/docs. These three code/docs reviews do not approve proposed UI/provider decisions or prove physical delivery.

## 6. Owner decisions and blockers

### Mandatory notification contract — not implicitly approved

Recommended: standards-based Web Push for **only** `GUEST_VEHICLE_READY` triggered on first committed `RETRIEVING -> READY` (`ValetSession.id + ready_at`), with persistent Guest-specific registration/intent/delivery data, DB lease/fenced multi-replica worker, VAPID credentials, retries/backoff/deduplication, short safe generic notification and click revalidation. The required specific approvals are listed as nine separable items in `GUEST_T5_NOTIFICATION_CONTRACT_AND_DECISIONS.md`: provider/transport and Android/iOS matrix, iPhone Safari vs Home Screen policy, UI delta, schema/migrations/grants, dependency, VAPID owner/security, retry/retention policy, sender deployment, and physical release matrix. Rejecting iOS Home Screen-only background capability requires a separately approved alternate transport; a normal iOS Safari tab cannot silently be reported as background-supported.

### Visible UI — no production enablement

`GUEST_T5_UI_FROZEN_SAFE_DELTA.md` proposes five separately named minimal deltas (Native contextual handoff, permission/status, rating, source-backed payment summary, staff help) with EN/AR, Light/Dark, LTR/RTL and evidence gates. No named delta is accepted by mere code presence. No corresponding dev/mock screenshot is a real phone capture.

### Legal receipt and truthful help

- **Receipt:** DEC-057 permits exact authorized financial read for completed/post-visit scope, but a Payment projection alone is **not a legal/tax receipt**. Approval needed: display source/fields, payment summary versus legal receipt, any required merchant/tax fields and real download/print capability. Keep receipt control hidden meanwhile.
- **Help:** no accepted Guest contact endpoint or canonical Location assistance destination is exposed. Recommendation for immediate bounded pilot is on-site valet employee assistance **only if the Owner confirms every included Location actually provides it**; otherwise configure and authorize a concrete contact source before new Help UI. Never invent hotel reception, phone numbers or incident submission.
- **Rating:** Owner must approve the new production entry/status UI before production visibility. A lost response is shown as unknown and never blindly resent. If the pilot requires on-screen recovery of the persisted rating after an ambiguous submission, the recommended **minimum read contract** (proposed, not approved) is `GET /v1/guest/session/rating` returning `null` or the immutable `{valetSessionId, rating, ratedAt}` for the **server-resolved current** Browser Session only. Guard on `COMPLETED` and 24-hour POST_VISIT, generation, revoke, expiry and tenant exactly as POST does; `no-store`, no client-selected session/tenant; no re-rating or state mutation. Integrate read-after-ambiguous and re-render existing rating only after Owner acceptance; do not add the endpoint implicitly.

## 7. Issue #219 evidence packet

- Historical issue: Native handoff Guest Access recovery. The required owning app is **`apps/valet-native`**, not Employee Web `apps/valet`.
- Baseline gap: standalone Native Guest Access already supported staff issue/reissue, but handoff had no contextual recovery target; staff had to leave/redescover the active visit.
- T5 wiring: `NativeProductionWorkspace` passes an exact currently pending, authorized retrieval snapshot through `NativeHandoffPanel`/`NativeHandoffPending` to a **gated contextual button** -> `guest-access` with origin `HANDOFF` and the same visit; reuses Native issue/reissue, QR/Copy Link, scope and credential protection; no second token, visit/task or handoff lifecycle.
- Negative/race proof expected in Native focused tests: wrong/verified/expired state, unrelated session/Location, background/logout, duplicate press, competing issuer, lost network response, old generation and return to handoff. Record actual results and file/line evidence in final review.
- **Not closed:** CTA gated by pending Owner UI approval, physical Android same-session QR+reissue old-link denial and proof/financial-release test not performed. Historical #192 foreground READY and #197 old Web Push closure are unchanged, and neither closes new U-08 background requirement.

## 8. T6 handoff and final verdict

See `GUEST_T5_T6_QUALIFICATION_HANDOFF.md` for exact supported-device matrices, real Customer HTTPS, secret/provider config, multi-replica, disposable PostgreSQL, full browser E2E, 100/500/1000 active-Guest, same NAT, 8-hour/26-hour soak, HA/failover and rollback. None is claimed by this local branch.

**T5 IMPLEMENTATION: PARTIAL** — mandatory provider-dependent background push and UI/help/source gates unresolved.

**T5 OWNER UI APPROVAL: PENDING**.

**T5 BACKGROUND NOTIFICATION PHYSICAL PROOF: NOT VERIFIED**.

**T5 PRODUCTION READINESS: NOT VERIFIED**.

No PR, merge, `main` mutation, deployment, production migration, or Guest enrollment activation is authorized by this report.
