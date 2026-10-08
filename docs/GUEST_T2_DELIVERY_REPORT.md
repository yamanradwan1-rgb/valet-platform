# Guest T2 — Client Reliability, Reconciliation and PWA Delivery

Date: 2026-10-08 (Asia/Amman). Task: T2 from `GUEST_APP_PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md`.
Status: **CODE DELIVERED TO ISOLATED BRANCH — INDEPENDENT REVIEW / PHYSICAL EVIDENCE STILL REQUIRED**.

## Base, scope and non-actions

- Base: fetched `origin/main` at `a7b5259ec965fb6c897e8da9af057fa3f306e91d`; branch `fix/guest-client-reliability-t2` in a separate worktree.
- Customer client session, retrieval/handoff, transport, selected existing Guest primitives, public-only Service Worker, locale and focused tests only.
- No schema/migration, API business rule, T1 exchange/session authority, T3 DB/limiter quota, Provider integration, Employee/Native, Dashboard, payment expansion or Guest design replacement.
- No PR, main update, merge, deployment or activation of Browser Session enrollment / `GUEST_T3_RATE_POLICY=ACTIVE`.
- Parent worktree had unrelated local Dashboard modifications; the isolated task worktree did not touch them.

## Owner's accepted T2 COMPATIBILITY policy

The Owner approved this *after* the original T2 plan proposal and explicitly superseded the provisional 15-second stale target for the COMPATIBILITY rollout:

| Policy | Implemented contract |
| --- | --- |
| Foreground polling | **21,000 ms with bounded ±1,000 ms jitter**; never faster than 20,000 ms |
| Trust age | **35,000 ms** since last successfully validated canonical snapshot; fail/unknown immediately invalidates action eligibility |
| Background polling | None; hidden/offline pages stop requesting and discard scheduled ticks |
| Manual refresh | Immediate subject to current coordinator single-flight and server cooldown |
| Resume / focus / visibility / online / pageshow | One coalesced canonical read for the resumed client; events within two seconds do not produce duplicate wake requests |
| Failed or ambiguous mutation | No automatic POST replay; mark state untrusted and re-read current authenticated session before enabling action |
| 429 and outages | Respect `Retry-After` header (delta seconds or valid HTTP-date) with safe body fallback; exponential bounded ordinary failure backoff and no missed-tick backlog |
| Rollout | Keep T3 `COMPATIBILITY` 180/900-second legacy cap; `ACTIVE` only through later T4 approval; no automatic faster cadence |

**Deterministic envelope:** At the fastest permitted 20-second interval, two concurrently visible tabs nominally offer 90 background GETs in 900 seconds. Adding the Owner's previously documented 66 additional valid presentations (initial, manual, wake, projections and mutations) gives the original 156 vs unchanged legacy 180, 24 nominal headroom. The subsequent conservative remediation review additionally charges ten automatic post-mutation canonical reconciliation GETs (four retrieval requests, four cancellations, one proof issue, one proof rotation), yielding 166 and 14 nominal headroom. A sliding-window boundary may include 46 events per tab (instead of 45); targeted tests account for that tighter edge and retain **12** minimum headroom in this expanded bounded model. These are deterministic compatibility counts, not production NAT/device/network proof. The budgets apply to one shared server-authorized Browser Session identity, not independent per-tab quota.

## Implemented T2 boundaries

1. **Transport:** Strict GET 8-second / mutation 12-second deadlines cover fetch, response body consumption and client schema validation; composed caller abort and timeout produce safe typed errors. A POST whose response is lost, times out or is malformed returns *outcome unknown*, not false success or permission for automatic replay. `Retry-After` never leaks backend messages. Existing no-store, same-origin credential, CSRF and browser-context-marker rules remain.
2. **One client coordinator:** Session reads from initial/manual/timer/wake events single-flight; pre-mutation reads are invalidated and aborted; late snapshots/errors are generation-fenced. One synchronous protected mutation lock covers request, cancel and proof issue/rotate/switch; post-settlement canonical GET is required before any new protected action. No enum-based monotonic state assumption: valid cancel can return REQUESTED to PARKED. An unexpected GET visit identity cannot silently switch tenant/session.
3. **Error and freshness:** Initial 429/503/network/schema/timeout renders a temporary retry path, not fake expired access. Last-known state remains informational with a narrow stale/retry notice and disabled protected controls; terminal invalid authorization clears the state. Offline and ambiguous Guest context-switch block mutation even if the displayed state is recent. Background/resume cannot continue trusting time elapsed while suspended.
4. **Retrieval:** Request/cancel share the same coordinator instead of unrelated locks, reject rapid duplicate or disallowed lifecycle actions, fence old visit/client outcomes, do not replay uncertain POSTs and reconcile with server before permitting another action. Existing request confirm shows action error; `ScreenReceived` reflects refresh loading; confirmation is dismissed on authoritative PARKED exit.
5. **Handoff:** Issue/rotate/method-switch are serialized. Rotating/switching clears previous plaintext proof immediately, old completions never restore it, and proof/countdown are hidden/cleared after expiry, lifecycle exit, client replacement or unmount. ALREADY_ISSUED is distinct from ALREADY_VERIFIED; no silent rotation or plaintext persistence. Original backend 5-per-900-second proof issuance guard is unchanged.
6. **PWA and accessibility:** Service Worker intercepts **only** explicit public icons/manifest and hashed `/_next/static/`; no navigation, Guest/API, arbitrary image or credential-backed response caching. A bounded 240-entry cache migrates known safe public assets from the legacy cache without deleting unrelated apps' caches. Browser zoom is enabled; existing BottomSheet gains modal semantics, keyboard focus containment/Escape and focus restoration, with unchanged normal geometry.

## UI-FROZEN SAFE DELTAS — scoped, not a redesign

- Existing confirm overlay receives a small, localized failure message and disabled confirm when stale or busy.
- Existing Guest live screen stays beneath a compact temporary stale/cooldown status banner (`GuestFreshnessNotice`); it appears only when the last snapshot is not trusted. No normal journey/screen geometry, typography hierarchy, colors, branding or navigation redesign.
- Existing network-unavailable screen shows an optional cooldown and disables manual retry only until server cooldown expires.
- The temporary error screen distinguishes network loss, rate limiting and service unavailability by typed client errors; no 429 or 503 is presented as permanently expired access.
- Existing received refresh spinner, request/cancel disabled state and handoff proof hiding are wired to actual loading/freshness.
- EN/AR copy is parallel; RTL placement uses logical CSS positioning. Focus/zoom change is semantic.

## Evidence and qualification boundary

- Customer Vitest, typecheck and lint, focused response-hang/ambiguous-POST tests, coordinator generation/wake/stale/cooldown tests, two-tab rolling quota model, handoff/retrieval tests, Service Worker privacy/migration tests and app structure check are the local evidence gates.
- Customer browser automation, Safari/Chrome PWA restart/background/bfcache, two physical tabs sharing the same Cookie Jar, network proxy fault shaping, EN/AR/RTL screenshots, assistive-technology interaction, proof lifecycle on real device and #196's real refresh reproduction still require the separate T6/T4 qualification path. Unit/static analysis does not substitute for this runtime proof.
- Current repository-wide `pnpm architecture:check` also evaluates unrelated committed files. Any grandfather or baseline failures in Database/Employee are reported separately; T2 introduces no schema/DB/Employee changes and must itself satisfy the authored-code line/architecture constraints.

## Test / Git status

| Executed local gate | Result |
| --- | --- |
| `pnpm --filter @valet/customer test` | **33 files / 242 tests PASS** (full Customer suite immediately before the final narrow error-presentation addition) |
| Focused final six files: coordinator, HTTP transport, SW, retrieval, handoff, error classification | **33/33 PASS**, including the final error-presentation addition |
| `pnpm --filter @valet/customer typecheck` | **PASS** after the final addition |
| `pnpm --filter @valet/customer lint` | **PASS** after the final addition |
| `git diff --check` | **PASS** |
| `pnpm test:build-contract` | **4/4 PASS** |
| `pnpm architecture:check` | **Baseline blockers outside T2**: Database's `guest-browser-session-context-switch-failures.integration.test.ts` is 328 lines and Employee client's `employee-shift-presence-local-provenance.test.ts` violates the portable browser-global boundary. Customer's oversized original `guest-app-root.tsx` was split to keep it below 300; no T2-owned file is oversized. |

Full Customer was not repeatedly rerun for the final two-string error classification change, per Owner request for focused bounded validation rather than looping full suites. Real multi-tab/proxy/browser/physical qualifications remain separate release gates. The final commit SHA and push result are reported by the executor, not claimed by this pre-commit document. Independent code review must precede main merge; production use requires later T4/T6 evidence and Owner authorization.

## Independent review remediation — 2026-10-08

Reviewed original T2 SHA: `62e6e14696cfa8785bc19c0bcb411233147ac0d8`. Remediation **code** commit SHA: `66fc72694e934b1853efe3599ac8b724020b07d0`; the follow-up documentation commit and final remote branch tip are separately verified and reported by the executor, avoiding a self-referential Git SHA. Same branch `fix/guest-client-reliability-t2`; no PR, merge, main update, APK, DB change, or deploy.

### Root-cause and safety corrections

- **Handoff proof trust:** Original mounted `useHandoff` keyed cached plaintext material only by the client/visit/HANDOFF_PENDING identity. The presentation layer hid its PIN/QR during stale/offline periods, but a successful later canonical GET with the same lifecycle could reveal that old plaintext even after staff-side proof consumption or rotation. A session GET does **not** attest proof validity. The remediation invalidates locally held proof eligibility and clears the plaintext/countdown when trust is lost; the screen and hook fence rendering before asynchronous cleanup. Reconnection never restores old proof or silently reissues/rotates it. The existing `ALREADY_ISSUED`/`ALREADY_VERIFIED`, method and expiration restrictions remain server-authoritative.
- **Manual Refresh and compatibility quota:** Previously `GuestSessionProvider.refreshSession` called `coordinator.read()` directly. Rapid sequential taps after fast GETs could therefore bypass the two-second explicit user/wake trigger coalescing. The mounted control now uses the existing `triggerRead()` policy, including Retry-After exclusion and post-mutation canonical reconciliation; a click during server cooldown is not counted as a completed trigger. Foreground cadence stays 21 seconds ±1 second (minimum 20), stale bound 35 seconds, and background polling disabled. The 180/rolling-900-second COMPATIBILITY quota, two-tab modeled boundary, and T3 configuration remain unchanged. Explicit counting includes ten protected-mutation reconciliation GETs above the original 66-event budget and still fits the conservative sliding-window allowance (at least 12 presentations remain).
- **BottomSheet keyboard accessibility:** A globally outside-focused Tab could escape the active sheet; multiple open sheets could each consume Escape. The focused update confines document keys to the topmost sheet, wraps Tab and Shift+Tab, and restores focus only to an attached/currently appropriate element. Existing T1 context-conflict dismissal continues to mean Continue Current, never Open New.
- **Public-static PWA cache:** Legacy migration originally accepted public-URL responses without checking no-store/private/Set-Cookie metadata. The migration and current cache scrub now require a same-origin public-asset request and cacheable basic response; runtime fetch uses the same guard. The 240-entry bound and isolation from unrelated Cache Storage namespaces are retained. The strict static URL allowlist, not browser exposure of forbidden Set-Cookie response headers, is the primary privacy boundary.
- **Transport and mutation ambiguity:** No API endpoint, quota bucket, database lifecycle or new POST replay mechanism was added. Read deadline remains 8s, mutation deadline 12s through response parsing; ambiguous mutations require same-visit canonical reconciliation before protected actions become eligible. Lost GET authority is not equated with expired Guest access. Independent review additionally found that protected retrieval/handoff POST **429 Retry-After** could be lost at `ticket.finish()` even when a class-A GET reconciled; the shared coordinator now records a **separate mutation cooldown**, both action hooks forward the exact failed POST error, and a canonical GET cannot erase that cooldown. No protected POST resumes before the deadline.

### UI-FROZEN SAFE DELTA review matrix

These are **scoped implementation candidates accepted for T2 reliability**, not blanket approval of new visuals. Each reuses existing Guest components and semantic theme tokens, inherits authoritative visit branding, and does not replace layout/navigation. Independent screenshot and real-device Owner visual sign-off remains **PENDING**; no screenshots are claimed where no comparable capture was produced.

| Trigger and affected component | Exact English / Arabic copy or behavior | Interaction, RTL/LTR, theme and approval |
| --- | --- | --- |
| Existing live snapshot becomes untrusted (35s age, offline, error, mutation, hidden page, ambiguous T1 switch): `GuestFreshnessNotice` | EN: “Your last vehicle status may be out of date. Actions are paused until it is confirmed.”; “Please wait {seconds}s before refreshing.” / AR: “قد تكون حالة سيارتك المعروضة غير محدثة. توقفت الإجراءات مؤقتاً حتى تأكيد الحالة.”; “يرجى الانتظار {seconds} ثانية قبل التحديث.” | Compact fixed status with polite live region, inherited C semantic palette, logical inset/margins for RTL, existing “Refresh status” / “تحديث الحالة” Btn, disabled during Retry-After/refresh. Visible design sign-off pending. |
| Initial retryable 429/503/network failure: `ScreenNetworkUnavailable` | 429 EN: “Please wait a moment”; “Too many status requests. You can refresh when the wait time ends.” / AR: “يرجى الانتظار قليلاً”; “طلبات التحديث كثيرة حالياً. يمكنك التحديث عند انتهاء وقت الانتظار.”; 503 EN: “Service temporarily unavailable”; “Your current status could not be confirmed. Please try again.” / AR: “الخدمة غير متاحة مؤقتاً”; “تعذر تأكيد الحالة الحالية. يرجى المحاولة مرة أخرى.”; network EN: “Network unavailable” / AR: “الاتصال غير متاح”. | Existing screen geometry and semantic colors, typed temporary state never `ScreenExpired`, cooldown-disabling retry, direction inherited from document. Visual sign-off pending. |
| Request failure, unknown outcome, or blocked trust: `OverlayConfirmRequest` | Existing heading/actions EN “Request your vehicle?” / “Request vehicle” / “Not yet”; AR “هل ترغب بطلب سيارتك؟” / “طلب السيارة” / “ليس الآن”. Dynamic safe example: EN “This action may have gone through. Check your current status before trying again.” / AR “قد تكون العملية تمت. تحقق من الحالة الحالية قبل إعادة المحاولة.” | Existing BottomSheet/Btn, localized role=alert failure line, disabled confirm during pending/stale state; no card geometry change. RTL/focus inherited; visible sign-off pending. |
| Cancel in REQUESTED while pending or stale: `ScreenRequested` | EN “Cancel request” / “Cancelling request...” / AR “إلغاء الطلب” / “جاري إلغاء الطلب...”. Any failure uses localized existing error presentation. | Existing requested screen, current danger tokens, disabled during mutation or loss of authoritative freshness. RTL/brand/theme inherited. Visual sign-off pending. |
| RECEIVED refresh in flight: `ScreenReceived` | Existing button EN “Refresh status”; AR “تحديث الحالة”. Built-in loading indicator only, no new copy. | Existing secondary Btn and unchanged screen geometry; actual `isRefreshing` wired from authoritative read. Visual sign-off pending. |
| HANDOFF_PENDING proof lost trust/rotated/expired/context changed: `useHandoff` and `GuestLiveView` | Previously issued PIN/QR plaintext disappears without replacement copy; existing PIN/QR shell, method labels, and recovery text remain. | Hook-level plaintext invalidation plus synchronous eligibility fence; no reissue merely on reconnect; semantic existing light/dark/branding and RTL presentation. Visual sign-off pending. |
| BottomSheet opening/closing or keyboard navigation: `BottomSheet` | No visible new copy; role=dialog/aria-modal, focus trap/Escape restoration. | 44px Close target, keyboard-only semantics; current context-conflict sheet Continue Current behavior unchanged; visual geometry untouched. |

### Remaining qualification and approval

- Mounted React tests exercise real Customer component/hook paths; mocked transport and a test-local DOM host **do not** constitute actual mobile Safari/Chrome evidence.
- Physical repro and resolution for issue #196 remain unverified and the issue remains open. T4/T6 browser/device multi-tab, bfcache/PWA, browser zoom/assistive technology, operator network/proxy shaping and matched EN/AR/RTL light/dark before/after screenshots remain separate release gates.
- The T1 context-conflict sheet intentionally makes dismiss a no-op during an in-progress/ambiguous switch; the preexisting Close target may still be focusable in that state. This is an outstanding narrow semantic follow-up, **not** permission to change T1 context-switch behavior or redesign the sheet during T2.
- No additional Owner approval of these **exact** visible T2 deltas was evidenced in the repository; individual final visual acceptance must not be implied by passing code tests.

### Final remediation verification (after code commit `66fc72694e934b1853efe3599ac8b724020b07d0`)

| Executed local gate | Outcome |
| --- | --- |
| `pnpm --filter @valet/customer test` | **PASS: 38 files, 271/271 tests** on the final production code and mounted-test set. |
| `pnpm --filter @valet/customer typecheck` | **PASS** on final implementation; repeated after the last test-host accessibility fix. |
| `pnpm --filter @valet/customer lint` | **PASS** after fixing two lint-only issues in newly added tests (fake DOM `this` alias; unused test destructure). The initial lint attempt before those corrections failed; no error remains. |
| `pnpm test:build-contract` | **PASS: 4/4 tests.** |
| `pnpm architecture:check` | **FAIL (two pre-existing, outside T2)**: `packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts` (328 physical lines, ungrandfathered) and `packages/employee-client/src/employee-shift-presence-local-provenance.test.ts` (portable client browser `window` violation). No newly authored T2 file exceeds 300 physical lines; handoff production hook split to 275 and helper 51. |
| `git diff --check`, `git diff --cached --check` | **PASS**; only benign local LF→CRLF Git worktree warnings. |
| Focused mounted/coordinator/PWA regression matrix | **PASS: 7 files / 47 tests** before the final handoff-expanded case, then **4 files / 32 tests** (handoff and coordinator), with complete 271-test final suite including all new cases; BottomSheet+PWA retest **10/10 PASS** after lint fixes. |

**Independent review:** Coordinator/transport/API/retrieval/Service Worker reviewer A found and verified closure of the protected POST 429 cooldown hole; confirmed no additional P0/P1, no POST replay and stable same-visit generations. Handoff reviewer B mounted real hook trust-loss/offline/reconnect and fresh-issue scenarios, rapid rotation and recovery; prior plaintext does not reappear. UI/PWA reviewer C checked the EN/AR/RTL/theme/branding safe-delta matrix, T1 Continue Current Escape/backdrop behavior, mounted BottomSheet keyboard accessibility, and strictly public-static cache migration. All scoped code reviews **PASS**; no production Owner UI sign-off or physical phone reproduction is inferred.

**Issue #196:** **MOUNTED REGRESSION VERIFIED — PHYSICAL ISSUE #196 REPRODUCTION PENDING.** Actual Refresh button reaches canonical GET and updates visible Guest state; sequential taps, poll overlap, a 503 retry, client-context replacement and real Request Vehicle/POST reconciliation are covered. The original real-phone symptom was not reproduced or revalidated on a device; keep #196 open pending Safari/Chrome physical browser qualification.

**Release boundary:** T2 code is reviewable, **not** production-qualified. UI delta exact-screen screenshots and final Owner visual acceptance, T4/T6 field/browser/CI qualification, two real mobile tabs, bfcache, varied connectivity and device-specific #196 retest are outstanding. No production deployment or merge was performed.

## Final merge-gate follow-up — failed Handoff reconciliation

**Baseline reviewed:** `16c6321b1e7080bfa453961d6c4a3745bc5acf4b`; same branch `fix/guest-client-reliability-t2`.

**PASS — no production-code change required.** New focused mounted regression: `apps/customer/src/features/handoff/use-handoff.reconcile-failure.mounted.test.tsx`. It mounts the **real** `useHandoff` under `GuestSessionContext.Provider` driven by the **real** `GuestRequestCoordinator`, with controlled Guest API transport responses and a lightweight React DOM test host. The sequence is: initial canonical GET returns `HANDOFF_PENDING` → automatic PIN issue POST returns valid unexpired proof → the immediate coordinator reconciliation GET fails with 503 → `lastAuthoritativeAt` remains null, `error` is set, `isTrusted` is false and no render exposes plaintext → a later canonical GET succeeds with the **same** `HANDOFF_PENDING` → the old PIN remains hidden. It asserts one issue POST, zero rotations and no non-null proof in the mounted render history. The test does **not** claim real-server or browser-network qualification. The alternate timeout transport case was not separately simulated: the exercised failed GET uses 503 as allowed by the review request.

**Focused validation:** `pnpm --filter @valet/customer exec vitest run src/features/handoff/use-handoff.reconcile-failure.mounted.test.tsx src/features/handoff/use-handoff.mounted.test.tsx src/features/handoff/use-handoff.recovery.mounted.test.tsx` — **3 files / 12 tests PASS**. Customer `typecheck` **PASS**. Customer `lint` **PASS**. No repeat of the 271-test full suite; all other production behavior/limits unchanged.

### Reviewable UI-FROZEN text examples (not screenshots)

These are **source-grounded text examples** for final Owner comparison, not captured pixels. In each theme, the exact same existing Guest typography/geometry/header/branding remains in place. **EN = LTR, AR = RTL**; Light and Dark use the existing `C.*` semantic CSS variables (`--v-sheet-bg`, `--v-text`, `--v-border`, `--v-danger`, etc.), **not** newly selected colors. Bracketed control states below are **test conditions**, not visible app copy. No fabricated device screenshot or Owner acceptance is asserted.

| Scenario / trigger | English · Light · LTR | English · Dark · LTR | العربية · فاتح · RTL | العربية · داكن · RTL |
| --- | --- | --- | --- | --- |
| Last visit snapshot untrusted; fixed stale banner | “Your last vehicle status may be out of date. Actions are paused until it is confirmed.” — “Refresh status” [disabled while cooldown] | Same English notice/button; existing dark semantic surface/text | “قد تكون حالة سيارتك المعروضة غير محدثة. توقفت الإجراءات مؤقتاً حتى تأكيد الحالة.” — “تحديث الحالة” [معطل أثناء الانتظار] | نفس النص العربي؛ ألوان داكنة من متغيرات الواجهة الأصلية |
| Initial HTTP 429; read retry cooldown | “Please wait a moment” — “Too many status requests. You can refresh when the wait time ends.” — “Try again” [disabled during Retry-After] | Same English copy; dark existing network-screen tokens | “يرجى الانتظار قليلاً” — “طلبات التحديث كثيرة حالياً. يمكنك التحديث عند انتهاء وقت الانتظار.” — “إعادة المحاولة” [معطل أثناء المهلة] | نفس النص العربي؛ ثيم داكن وRTL |
| Initial HTTP 503; retryable read failure | “Service temporarily unavailable” — “Your current status could not be confirmed. Please try again.” — “Try again” | Same English copy and existing dark layout | “الخدمة غير متاحة مؤقتاً” — “تعذر تأكيد الحالة الحالية. يرجى المحاولة مرة أخرى.” — “إعادة المحاولة” | نفس النص العربي؛ ثيم داكن وRTL |
| RECEIVED while explicit Refresh GET pending | “Refresh status” [existing secondary button spinner] | Same existing button/spinner; dark theme tokens | “تحديث الحالة” [مؤشر التحميل في الزر الأصلي] | نفس الزر ومؤشر التحميل؛ ثيم داكن |
| PARKED Request confirm; ambiguous POST or stale | “Request your vehicle?” — “This action may have gone through. Check your current status before trying again.” — “Request vehicle” [disabled] / “Not yet” | Same English copy, existing BottomSheet and danger token | “هل ترغب بطلب سيارتك؟” — “قد تكون العملية تمت. تحقق من الحالة الحالية قبل إعادة المحاولة.” — “طلب السيارة” [معطل] / “ليس الآن” | نفس النص العربي؛ BottomSheet الأصلي باتجاه RTL |
| REQUESTED Cancel; 503 error and untrusted snapshot | “Vehicle requested” — “Service is temporarily unavailable. Please try again shortly.” — “Cancel request” [disabled while untrusted] | Same text with dark danger surface and existing requested screen | “تم طلب السيارة” — “الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.” — “إلغاء الطلب” [معطل أثناء فقدان الثقة] | نفس النص العربي؛ حالة الخطأ الأصلية والثيم الداكن |

**Approval checklist:** EN Light [text example available, screenshots PENDING], EN Dark [text example available, screenshots PENDING], AR Light [text example available, screenshots PENDING], AR Dark [text example available, screenshots PENDING]. Exact controls/copy, RTL, theme tokens and branding have code/static test evidence, but **Owner visual approval remains PENDING** until real comparable screen captures and review. No Guest page re-layout, new fonts, new icons, unrelated action or T4/T5/T6 implementation was introduced by this follow-up.

**Physical-only qualifications still open:** real Safari/Chrome phones and two-tab shared-cookie session; background, resume and bfcache/PWA lifetime; actual proxy-induced 503/429/timeouts; screen-reader/keyboard and EN/AR RTL light/dark capture comparison; original issue #196 refresh reproduction on physical hardware. They are not prerequisites for *Owner code merge review*, but still block claiming complete physical/production readiness.

## Owner visual scope acceptance — 2026-10-08

After reviewing the separately hosted local T2 development-only UI preview, the Owner confirmed that the presented changes are acceptable ("خلص الامور تمام"). This supersedes the earlier pending **Owner acceptance of the scoped T2 UI-FROZEN safe deltas for code integration**: stale notice, retryable 429/503 screens, Refresh loading, retrieval request/cancel failures, and hidden handoff proof presentation. The visual inspection was of the development-only preview using synthetic fixtures; the preview-only code was not part of the T2 production branch and must not be merged with it.

This approval authorizes the reviewed T2 code for fast-forward integration into main **without PR or production deployment**. It does not certify physical Safari/Chrome behavior, pixel-matched screenshot evidence, accessibility on devices, or production readiness. Original issue #196 remains open for physical repro and confirmation; T4/T6 qualification remains required. Earlier historical PENDING entries above describe the status before this Owner acceptance and are superseded only for the limited code-merge visual decision.