# Guest T5 — Bounded Product Completion & Operational Recovery

Status: **T5-PUSH-01..09 AND T5-UI-01..05 OWNER APPROVED (Accepted DEC-101)**. The repository implementation and independent security review are being finalized separately; real provider/runtime/device proof is **NOT VERIFIED**, Help availability is **NOT ESTABLISHED** for pilot Locations, and production readiness is **NOT VERIFIED**. Follow-up date: 2026-10-08 (Asia/Amman).

This report records both the original three T5 commits (baseline
`de96808b4d0b74a882beabb204bf2c00b34f13cf`) and the later
Owner-approved same-branch follow-up. Older preapproval focused-test results
below remain historical evidence, not proof the final integrated push stack
or physical delivery is production ready. Current final commit/test values
must supersede them in the follow-up verification section.

## 1. Git and isolation

- Repo: `veletpro0-lgtm/valet-platform`.
- Base: verified `origin/main` and initial local `main` both `74cc7064a907bec79c154e2d1afc55288ceffb1a`; no newer commits at fetch.
- Branch: `feat/guest-t5-pilot-completion-recovery`; isolated worktree `tmp/guest-t5-worktree`.
- Pre-existing dirty Dashboard files in the primary worktree were left untouched.
- **Owner design approval exists (DEC-101)**; never interpret branch/test
  evidence as a PR, merge, `main` update, deployment, **migration execution**,
  production flag activation, real VAPID secret provisioning, APK build,
  live provider receipt or T6 release approval.

## 2. Authority and gap audit

This table distinguishes pre-existing working backend authority from newly wired behavior and production visibility. Exact security authority is still resolved on the API/DB, not inferred from the client.

| Feature | Existing source and authoritative boundary | Gap addressed / still outstanding | Security and UI gate | T5 implementation owner |
| --- | --- | --- | --- | --- |
| Native contextual recovery | `apps/valet-native/src/guest-access/**`, `src/handoff/**`, Employee client staff issue/reissue, persisted GuestAccess generation | T5-UI-01 **OWNER APPROVED AND PRODUCTION-CODE ENABLED** in exact Handoff context; 75/75 focused mounted/unit Native PASS | Unverified proof only, exact Task/visit version; no custody effect; actual Android/device proof pending | Native T5 |
| Closed/background Guest READY | `apps/customer/public/sw.js`, `features/ready-alert/**`, first Mark Ready `ready_at` | **DEC-101 APPROVES** Web Push architecture, dependency, durable 3-table schema, sender, SW and UI. Implementation is active in this T5 follow-up; provider live setup/device receipt remain unverified | BrowserSession/generation-bound recipient; one atomic first READY, no private payload; U-08 first-launch physical gate | T5 DB/API + sender + PWA |
| Completed visit rating | `POST /v1/guest/session/rating`, DEC-091, privileged exact-visit immutable DB write, shared strict schemas | T5-UI-03 production entry is enabled from `COMPLETED`; zero preselection, exact EN/AR labels, canonical post-visit revalidation and focused mounted tests | Same-browser CSRF, 1..5 validation, unknown-outcome no blind POST retry, exact response session fence; expired/revoked/unavailable fail closed | Customer T5 |
| Financial projection | `GET /v1/guest/valet-sessions/:sessionId/payment`, DEC-057, strict guest projection contract | T5-UI-04 production **Payment summary** reads only the canonical projection after exact completed-visit revalidation | GET no-store, current canonical visit only; no financial mutation, tip action, digital checkout or release mutation | Customer T5 |
| Receipt/visit summary | Deferred receipt preview still contains fixture data but remains development-only; canonical Payment projection exists | Production surface is explicitly **Payment summary**, not a receipt. Official/tax/legal receipt, download/share and statutory fields remain deferred | `payment: null` remains valid; no invented paid/zero/provider/merchant/tax facts | Customer T5 |
| Guest staff help | DEC-101 approves onsite valet help only when Location operational support availability is independently confirmed | No persisted/configured/projected per-Location support-availability fact exists in the current repository, so production Help remains unavailable. Safe exact-copy component is gated behind explicit verified input only | No hotel reception, phone/email, incident endpoint, emergency claim or staff credential reuse | Customer T5 |

## 3. Changed code and preserved contracts

### Customer — bound rating and payment reads

- `apps/customer/src/lib/api/guest-api-client.ts`: `submitRating()` validates the existing 1–5 request/response schemas and uses existing POST CSRF/no-store request boundary; `loadPaymentProjection()` accepts the **current canonical session** and parses the strict existing Guest projection response. No new route, authorization source, persistent Client rating state, network replay helper or mutation contract was added.
- `apps/customer/src/features/rating/guest-rating-submission.ts`: immediate duplicate-press guard, per-client/per-visit generation fencing, exact returned visit ID success check, ambiguous submit classified as **unknown**, not submitted/success or blind re-POST. HTTP 409 errors are distinguished by **exact** `GUEST_RATING_CONFLICT` versus `GUEST_RATING_NOT_AVAILABLE` server code; the latter never claims an existing rating.
- `apps/customer/src/features/rating/guest-live-rating.tsx`: in-progress/saved/conflict/unavailable/unknown/failure presentation, explicit star choice (no default 5-star consent), exact localized AR/EN accessibility labels and semantic theme tokens. T5-UI-03 now exposes the real flow from `COMPLETED` only after canonical same-visit post-visit revalidation.
- `apps/customer/src/features/payment/guest-payment-summary.tsx`: source-backed T5-UI-04 production summary uses only the strict DEC-057 projection, isolates amount/time direction for RTL, and never calls a Payment mutation. Existing fake `0.00`, add-tip, payment-success and receipt previews remain development-only; `CASH_ONLY`, `tipsEnabled=false` and official/legal receipt deferral are unchanged.
- `apps/customer/src/features/help/guest-onsite-help.tsx`: contains only the accepted onsite staff copy and is not production-mounted because the required independently verified per-Location support-availability input does not exist in current contracts/config/projections.

### Native — exact handoff recovery scope

- Contextual target derives from a current authorized `HANDOFF_PENDING` retrieval/handoff snapshot and matches exact `sessionId`, Location, Task, role and an **unverified** handoff proof. The existing Native Guest Access screen, QR/Copy Link and staff APIs remain the only credential system.
- The real `NativeProductionWorkspace -> NativeHandoffPanel -> NativeHandoffPending` hierarchy passes a contextual `guest-access` opener and reuses the existing localized Native Guest Access button. **T5-UI-01 is Owner approved and the production gate is enabled**, with exact Task version, Location/visit and unverified Handoff guards. Production-composition tests cover EN/AR RTL/Dark, no release/proof mutation.
- Native Guest Access transient credentials are never reconstructed from `ACTIVE` status or stored verifier. Reissue/revoke remains a separate staff-authorized mutation, distinct from proof issuance, verification, handoff completion, payment and release.
- Recovery after lost POST response must reconcile the authoritative GuestAccess status with GET and cannot synthesize a raw URL or blindly rotate again. Background/logout/change of task must remove transient presentation proof and ignore old results.
- `NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED=true` is now approved in
  the repository. **Issue #219 physical acceptance is still pending:** no Android
  same-session QR/reissue old-link denial or actual handoff/release demonstration.

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
| Notification privacy | Approved `web-push` v3.6.7 adapter uses a controlled EN/AR generic payload, no plate/phone/internal IDs/payment/tenant data, exact-scope send-time reauth, signed VAPID private sender env only, endpoint SSRF allowlist, bounded cleanup and no claim of device receipt. |
| Service Worker and foreground READY | SW extended with validated push/click and immutable copy while **retaining public-static-only caching**. Existing DEC-070 foreground READY/polling semantics remain unchanged. |
| Schema/infrastructure | **New forward migration `078` and runtime grant scripts are authored**. The migration and grants were exercised only against temporary UUID-named child databases on local PostgreSQL, never against the parent `valet`/staging/production database. No production keys/worker/deployment/Guest enrollment activated. |

## 5. Testing and evidence classification

| Check | Result |
| --- | --- |
| `pnpm --filter @valet/customer exec vitest run src/lib/api/guest-t5-api.test.ts src/features/rating/guest-rating-submission.test.ts src/lib/api/api-error.test.ts` | **PASS: 3 files / 27/27**, including exact server rating 409 conflict/unavailable distinction, duplicate press, stale response and ambiguous outcome. |
| `pnpm --filter @valet/customer test` | **Approved T5 follow-up: PASS 50 files / 344/344 tests** after capability/spoof guard and exact EN/AR corrections. Initial preapproval validation was 43 files / 308. |
| `pnpm --filter @valet/customer typecheck` | **PASS** after final Customer changes. |
| `pnpm --filter @valet/customer lint` | **PASS** after final Customer changes. |
| `pnpm --filter @valet/valet-native exec vitest run test/native-guest-access-recovery.test.ts test/native-guest-access-issuance.test.ts test/native-handoff-guest-access-recovery.test.ts test/native-handoff-panel.test.tsx test/native-release-panel.test.tsx` | **PASS: 5 files / 64 tests** with exact snapshot, lost-response, generation and proof/release negative coverage (before extra hidden-button mount). |
| `pnpm --filter @valet/valet-native exec vitest run test/native-handoff-recovery-mounted.test.tsx` | **PASS: 5/5** mounted localized hidden-button/busy tests. |
| `pnpm --filter @valet/valet-native exec vitest run test/native-handoff-guest-access-recovery.test.ts test/native-handoff-recovery-mounted.test.tsx test/native-handoff-recovery-production-mounted.test.tsx test/native-guest-access-recovery.test.ts test/native-guest-access-issuance.test.ts test/native-handoff-panel.test.tsx test/native-release-panel.test.tsx` | **T5 approved follow-up PASS: 7 files / 75/75**, including actual production Native workspace composition. |
| `pnpm --filter @valet/valet-native lint` and `typecheck` | **PASS** after final Native handoff hierarchy wiring. |
| `pnpm --filter @valet/valet-native test` | **FAIL: 210 files passed / 6 failed; 1552 tests passed / 11 failed; 1 failed import suite**. Failing test sources concern Native brand-asset bytes, Shift Light render `editable`, old Parking “Start Parking” copy, `expo-location` package-contract expectation, and an Expo `__DEV__` import. These tests and production sources were not modified by T5. Failures classify as **out-of-scope suspected baseline**, not verified against a clean main run. Do not infer a T5 pass for the full Native suite. |
| `pnpm test:build-contract` | **PASS: 8/8**, existing T4 origin/build contract. |
| `pnpm --filter @valet/api exec vitest run test/guest-push test/guest-web-push-sender.test.ts test/mark-ready-guest-push.test.ts` | **PASS: 8 files / 41/41 tests**, registration/authorization, provider/SSRF/timeout, role-URL isolation, token-fenced sender, SECDEF maintenance and first READY boundary, under mocked/no-real-PostgreSQL conditions. |
| `pnpm --filter @valet/database test:non-postgres` | **PASS: 5 files / 41/41 tests**, including Guest Push SQL/grant source contract, PostgreSQL-valid key regex limits, provisioner role identity and DB connection policy. |
| `pnpm architecture:check` | **NOT PASSING**: previous **unmodified off-T5** database browser-context test is 328 lines, and portable Employee-client test uses forbidden `window`. The temporary T5 runtime-grants script ceiling issue was **fixed** (new Guest grant helper 163 lines, updated verifier 300); the current architecture run reports **no T5-authored-file violation**. Overall gate remains FAIL due to the two unrelated source violations, not a T5 PASS. |
| `pnpm --filter @valet/contracts exec vitest run src/guest-rating.test.ts src/payment-projections.test.ts` | **PASS: 2 files / 25/25** strict rating/payment schemas. |
| `pnpm --filter @valet/api exec vitest run test/guest-rating-service.test.ts test/guest-rating-command.test.ts test/guest-rating-module-ownership.test.ts` | **FAIL: 2 passed / 1 failed**. Both rating command/service contract tests passed; unmodified module ownership test expects only four GuestAccess controllers and fails because T1 `GuestBrowserContextController` exists. This is outside T5; not a new T5 mutation/API. |
| `pnpm test:non-postgres` | **FAIL** in broad parallel harness: among failures are unrelated existing Native asset/parking/package-manifest/Shift presentation, Dashboard operations text, Employee Web retrieval key proof and API module ownership/audit expectation. Specific T5 focused tests passed. Broad suite is not certified as passing; full baseline reproduction against isolated main not performed. |
| PostgreSQL API/database integration | **PASS: 2 integration files / 6/6**, applying migrations only to random-UUID **child databases** created and dropped by test fixtures on the already-running local `127.0.0.1:5432` PostgreSQL. Tests prove API/worker runtime role separation (4) and Browser Session registration after legacy bearer expiry plus concurrent endpoint uniqueness/secret-clearing (2); harness final cleanup `db=0 roles=0 children=0`. An attempted separate PG17 test *server* at ports 55449/54399 could not bind Windows loopback and was not used. **Sender two-replica SKIP LOCKED/lease-reclaim SQL, production grants/runtime/device receipt remain unverified**. No migration touched the parent `valet`, staging or production database. |
| Physical Native/Android/iOS & background push | **NOT EXECUTED**; APK/AAB/iOS build forbidden by T5. Mocked tests cannot certify physical receipt. |

Tests exercise real client contracts but use controlled HTTP mocks; they do **not** prove server-side execution or device receipt. Backend Guest rating and Payment authority predate T5 and have their own API/database coverage. Security reviewer pass must distinguish verified local tests from runtime unknowns.

## Original preapproval independent review results (historical)

- **Reviewer A — PASS**: Guest Browser Session/24h post-visit authority, exact Native handoff scope, no proof/release bypass, stale outcome and financial projection; no P0/P1 code blocker.
- **Reviewer B — PASS**: original *design proposal* review checked EN/AR copy, provider-inflight revoke race and multi-replica SQL uniqueness/lease fencing. This historical review did **not** inspect later implemented sender/provider code. New independent T5 review required separately.
- **Reviewer C — PASS after remediation**: initially blocked status-only HTTP 409 rating classification. T5 now preserves and distinguishes `GUEST_RATING_CONFLICT` from `GUEST_RATING_NOT_AVAILABLE`, never falsely claiming a previous rating; added exact transport/controller regression tests (focused 27/27). Re-review found no remaining P0/P1 in product/UI/docs. These three code/docs reviews do not approve proposed UI/provider decisions or prove physical delivery.

## Owner-approved implementation follow-up — security boundary remediation

- **T5-UI-01..04 code implemented:** Native exact-context Guest Access
  recovery, real Customer completed-visit Rating and strict read-only Payment
  Summary, permission UI, PWA service worker and fixed EN/AR READY copy.
  **T5-UI-05 Help remains unavailable** until the target Location has an
  independently verified onsite staff support-availability fact; no guest
  incident/phone/legal receipt is fabricated.
- **T5-PUSH-01..09 code authored:** reviewed `web-push@3.6.7`, one
  transactional first-READY intent, durable dedicated 078 SQL migration,
  browser-cookie/CSRF subscription, fixed 30-minute/4-attempt policy, SSL
  endpoint allowlist, bounded lease-token-fenced worker and no device receipt
  overclaim. Production keys/provider/deploy/migration execution remain
  unconfigured.
- **Independent Reviewer C: PASS** after fixing iOS user-agent sniffing
  to actual platform/capability signals, exact AR/EN copy, ordinary Safari
  foreground-only T6 matrix and ambiguous rating staff-help overclaim.
- **Initial Reviewer A/B P1 blockers addressed in source:** sender DB
  principal is distinct from ordinary API; API role has register/READY
  function rights but no delivery lease-token SELECT or secret-resolver
  EXECUTE; worker role holds only the bounded claim/reconcile/cleanup and
  lease-fenced secret resolver rights. Provisioning now fail-closes if
  `GUEST_PUSH_WORKER_ROLE` differs from the worker DB URL or duplicates
  ordinary API/migration identity, and checks matching PostgreSQL target
  **before** any privilege grant. Worker reconciliation calls a scoped
  SECURITY DEFINER function instead of querying Guest Browser Session
  tables directly. **Fresh independent Reviewer A re-review: PASS** after
  confirming both original P1 closures and role isolation; Reviewer C's
  product/UI pass remains valid. The prior Reviewer B BLOCKER was for the
  pre-remediation shared-DB-principal state and unexecuted SQL evidence;
  neither that old decision nor passing mock tests is represented as a
  post-remediation Reviewer B PASS.
- **Real disposable PostgreSQL evidence:** `guest-push-role-separation`
  4/4 and `guest-push-registration-concurrency` 2/2 PASS in UUID-named
  child databases on the existing local PostgreSQL server, with fixture
  cleanup of child DBs and transient roles. The real SQL run detected
  and prompted correction of an invalid PostgreSQL regular-expression
  quantifier in registration validation. The test fixture also now
  explicitly activates its initially `INACTIVE` Location; production SQL
  correctly rejects inactive Locations. These tests do not prove two
  sender replicas racing for a lease or an actual provider/device receipt.
- **Mandatory release evidence still absent:** multi-replica sender
  `SKIP LOCKED` claim/reclaim/finalization under crash/timeout, actual
  worker runtime operations against its restricted role, and real
  HTTPS browser registrations, VAPID provider sends, closed-app Android/
  iOS Home Screen device receipt, Native physical handoff proof and T6
  HA/failover/soak. Mocked unit tests and accepted DEC-101 are not substitutes.

## 6. Owner decisions and remaining operational gates

### Mandatory notification contract — expressly OWNER APPROVED (DEC-101)

The Owner accepted **all nine** T5-PUSH decisions and **all five** UI deltas.
The implementation is standards Web Push for `GUEST_VEHICLE_READY` triggered
on first committed `RETRIEVING -> READY` with durable Guest-specific
registration/intent/delivery rows, a DB-fenced multi-replica worker, reviewed
`web-push` dependency and VAPID sender-only secrets, exact EN/AR generic
payload and click reauthorization. Deployment on a genuine Customer HTTPS
origin, real key creation/injection, isolated migration qualification,
running worker, device receipt and T6 remain **NOT VERIFIED**. iPhone Safari
tabs remain foreground-only; approved supported iOS Home Screen mode requires
physical qualification.

### Visible UI — implementation approval recorded; deployment/physical proof separate

DEC-101 records Owner approval for the five T5 UI deltas. Repository implementation still does not authorize deployment or substitute mocked/mounted tests for required physical/runtime evidence.

### Legal receipt and truthful help

- **Receipt:** T5-UI-04 production **Payment summary** is approved and implemented from the exact DEC-057 projection. It is **not a legal/tax receipt**; official receipt naming, statutory merchant/tax fields, download/print/share and delivery remain deferred.
- **Help:** DEC-101 approves only onsite valet employee help where operational support availability is **independently confirmed for that Location**. The exact missing input is a trusted per-Location support-availability fact exposed through an accepted persisted/configured server projection. No such source exists today, so production Help stays hidden. Never infer availability from an active visit or branding, and never invent hotel reception, phone/email or incident submission.
- **Rating:** T5-UI-03 production entry/status UI is approved and implemented. A lost response is shown as unknown and never blindly resent; no new rating-read endpoint was invented.

## 7. Issue #219 evidence packet

- Historical issue: Native handoff Guest Access recovery. The required owning app is **`apps/valet-native`**, not Employee Web `apps/valet`.
- Baseline gap: standalone Native Guest Access already supported staff issue/reissue, but handoff had no contextual recovery target; staff had to leave/redescover the active visit.
- T5 wiring: `NativeProductionWorkspace` passes an exact currently pending, authorized retrieval snapshot through `NativeHandoffPanel`/`NativeHandoffPending` to a **gated contextual button** -> `guest-access` with origin `HANDOFF` and the same visit; reuses Native issue/reissue, QR/Copy Link, scope and credential protection; no second token, visit/task or handoff lifecycle.
- Negative/race proof expected in Native focused tests: wrong/verified/expired state, unrelated session/Location, background/logout, duplicate press, competing issuer, lost network response, old generation and return to handoff. Record actual results and file/line evidence in final review.
- **Not closed:** visible Native CTA is implemented and Owner-approved, but
  physical Android same-session QR+reissue old-link denial and proof/financial-
  release test are not performed. Historical #192 foreground READY and #197
  old Web Push closure are unchanged; neither closes new U-08 physical proof.

## 8. T6 handoff and final verdict

See `GUEST_T5_T6_QUALIFICATION_HANDOFF.md` for exact supported-device matrices, real Customer HTTPS, secret/provider config, multi-replica, disposable PostgreSQL, full browser E2E, 100/500/1000 active-Guest, same NAT, 8-hour/26-hour soak, HA/failover and rollback. None is claimed by this local branch.

**T5 CODE IMPLEMENTATION: LOCALLY IMPLEMENTED.** Independent security Reviewer
A and product Reviewer C report PASS after P1 remediation. The original
Reviewer B report blocked the **prior**, shared-DB-role implementation;
re-review of the corrected sender code is tracked separately and is not
silently represented as a fresh B PASS. Guest Help is unavailable for
unverified Locations. Disposable SQL role separation and endpoint contention
passed; two-sender `SKIP LOCKED` claim/reclaim/crash, live credentials,
production deploy and physical device proof remain unverified.

**T5 OWNER PRODUCT/UI DECISIONS: APPROVED (DEC-101).**

**T5 BACKGROUND NOTIFICATION PHYSICAL PROOF: NOT VERIFIED**.

**T5 PRODUCTION READINESS: NOT VERIFIED**.

No PR, merge, `main` mutation, deployment, production migration, or Guest enrollment activation is authorized by this report.
