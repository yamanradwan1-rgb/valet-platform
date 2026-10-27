# Customer application audit — partial source review

Baseline: `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`, fetched `origin/main` and detached worktree supplied by coordinator. Audit date: 2026-10-27 Asia/Amman. Scope: `apps/customer`; no source, tests, configuration or provider data changed by this worker. No formal Codex Security scan was run; its coordinator is unavailable. This report is an engineering source review, not complete security assurance.

## Coverage and test result

Inventory: **235 tracked files**, including **7 binary assets excluded from manual line review**. **95 files / 8,650 lines fully inspected**, **3 files partially inspected**, **63 files executed by tools without full assertion review**, **67 reviewable files not reviewed**, plus 7 excluded binary assets. Exact per-file statuses, exclusions, and executed tests are in `coverage.json`. Partial files are the context-conflict gate, More menu, and test DOM host because returned output was truncated or only selected ranges were read. No claim of exhaustive manual coverage.

Executed from isolated worktree:

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config apps/customer/vitest.config.mjs apps/customer/src --reporter=json --outputFile=<AUDIT_WORKDIR>/customer-tests.json
```

Retained JSON reports **67 test files, 481 tests passed, zero failed/skipped/pending/todo tests**, `success: true`. Vitest's `numTotalTestSuites:145` includes nested suites and is not the file count. Existing original-checkout dependencies were reused through coordinator-created ancestor symlinks; no dependencies were installed by this worker. These are unit/mounted synthetic-DOM/mocked-transport tests, not production-browser/provider proof. The QA-only `apps/customer/qa/issue-338/render.test.tsx` was outside the `src` invocation and not executed. The tool session later became unavailable after completion; JSON is the retained result evidence.

Additional scratch-only reproduction:

```sh
node <AUDIT_WORKDIR>/customer/reproduce-preferences.cjs
```

Final run exited 0. Initial scratch attempts failed because the root package does not resolve React and the reused synthetic test DOM lacks two document methods; scratch harness was corrected to resolve customer dependencies and provide null-returning meta lookups. These harness errors are not product defects. Final retained output in `preferences-reproduction.log` shows preferences remain `en/light` while DOM becomes `rtl/dark`, and a loading button renders with no accessible text.

## Architecture and feature map

The customer application is a Next.js 16 / React 19 client-rendered single product route `/`, with a server readiness route `/readyz`, a same-origin `/api/v1/guest/:path*` rewrite, a public-static-only service worker, and an installable manifest. `page.tsx` composes auth → session provider → application root → context-conflict gate. No generic customer login/account interface is present in this path.

| Feature | UI → client logic → API/contract | Completeness and evidence |
|---|---|---|
| Guest entry/continuity | `GuestAuthProvider` → fragment adapter + bootstrap stages → browser `prepare/exchange/switch/switch/reconcile` | Implemented, staged retries, memory-only fragment token, cookie context markers. Legacy bearer path conditional on enrollment flag. Full provider behavior needs backend/staging qualification. |
| Live status | `GuestLiveView` → `GuestSessionProvider` / `GuestRequestCoordinator` → GET `/session` with `guestSessionReadResponseSchema` | Implemented across CHECKING_IN, AWAITING_PARKING, PARKING, PARKED, REQUESTED, RETRIEVING, READY, HANDOFF_PENDING, COMPLETED. CANCELLED maps unavailable. Reads coalesce, deadlines/backoff/cooldown exist, hidden/offline mutation gate exists. |
| Retrieval/cancellation | Parked confirmation / requested cancel → `useRetrieval` mutation ticket → POST `session/request-retrieval`, `session/cancel-retrieval` | Integrated client path. Shared coordinator serializes actions and performs canonical GET after outcomes, including ambiguous network responses. Server transition/transaction proof belongs to backend worker. |
| Handoff proof | PIN/QR screens → `useHandoff` issue/rotate → POST `session/handoff-verification/{issue,rotate}` | Integrated. Material fenced by client+visit+pending+freshness, revokes on background/offline, explicit rotate recovery. QR uses qrcode encoder + four-module quiet zone. Requires real scanner/device qualification. |
| Ready alerts | Accepted session snapshot → ready-identity tracker → overlay + optional local audio | Implemented; suppresses initial ready baseline and completed alerts, deduplicates by visit+readyAt. Audio is supplementary and browser autoplay failure is swallowed intentionally. |
| Web Push consent | Permission card → bounded browser stages + transport → GET push config / POST push registration → SW push/notificationclick | Implemented, actual permission gesture preserved, deadlines and unknown outcome handling. Browser support, real VAPID/provider delivery, installed iOS continuity unknown. |
| Post-visit rating | Completed contextual action / automatic selection → post-visit authorization GET → scoped rating submit → POST `session/rating` | Implemented, exact-client/visit outcome fencing and presentation-only sessionStorage memory. No automatic POST retry. Server uniqueness and revoked-cookie cases are backend scope. |
| Receipt/payment summary | Completed contextual action → authorization GET → `GuestPaymentSummary` → GET `/valet-sessions/:id/payment` | Read-only integrated projection: service/tip/due/paid/method/date/status/refunds. Customer online checkout, payment method selection, and tip payment screens under `features/deferred` are dev-preview material, not proof of online payment support. |
| Guest privacy/contact | More menu → information sheet → GET `/information?locale=…` → validated guest information | Implemented typed localized fields, separate load/error/retry. More-menu source review partial; actual published operator data unknown. |
| Arabic/English and themes | Menu → locale/theme external stores → document dir/lang/theme, translation dictionaries | Implemented normal path; confirmed restricted-storage failure CUST-001. Dictionaries checked by executed parity tests; full linguistic review not performed. |
| Branding | AppShell uses guest branding style; parked label uses guest brand display name | Composition inspected; palette algorithms and most branding source/tests tool-assisted only. No visual/design conclusions. |
| Development preview | `NODE_ENV !== production` guards preview renderer and controls | Production guard inspected, safety tests passed; deferred screens not manually reviewed in full. |
| Deployment/readiness/PWA | Build-time API origin validation → immutable rewrite → startup artifact-origin match → readiness upstream probe | Implemented fail-closed configuration and bounded/coalesced probe. Actual HTTPS ingress/build artifact/production services not available to this worker. Service worker caches only approved static GET paths and not guest API responses/navigation. |

The client uses `@valet/contracts` parsers for API producer/consumer validation; producer-side database/auth/external-service implementations were not manually traced in this worker. Those cells must be combined with backend/database worker evidence before claiming the complete UI → database → external result chain.

## Findings register

| ID | Priority | Category | Feature | Finding | Confidence | Existing issue |
|---|---|---|---|---|---|---|
| CUST-001 | P2 | Functional / localization recovery | Locale/theme | Blocked preference storage prevents reactive preference changes while direct DOM updates still occur | CONFIRMED in mounted synthetic DOM | No matching open issue among supplied 18 open issues; closed-issue duplicate check not done |
| CUST-002 | P3 | Accessibility | Shared buttons | Loading buttons replace their accessible names with an unnamed spinner | CONFIRMED rendered markup / conclusive source | No matching open issue among supplied open issues; closed-issue duplicate check not done |

### CUST-001 — Blocked storage prevents locale/theme updates and desynchronizes the DOM

1. **ID:** CUST-001.
2. **Title:** Locale/theme changes depend on successful localStorage persistence.
3. **Severity:** P2; bounded environment-specific functional defect, no data corruption.
4. **Confidence:** CONFIRMED by mounted React reproduction; physical browser coverage not claimed.
5. **Category:** Functional correctness, localization, recovery.
6. **Affected feature:** Guest Arabic/English selector and dark/light switch.
7. **Paths:** `apps/customer/src/i18n/locale.ts`; `apps/customer/src/i18n/locale-provider.tsx`; `apps/customer/src/theme/theme.ts`; `apps/customer/src/theme/theme-provider.tsx`; menu caller `apps/customer/src/features/deferred/overlay-more-menu.tsx`.
8. **Lines:** locale.ts 19–33,36–47,54–62; locale-provider.tsx 54–60,69–75,97–104; theme.ts 18–32,35–46,65–72; theme-provider.tsx 43–48,58–65,79–86. Menu locale action 54–56 and theme button 80–85.
9. **Expected:** Current mounted preference selection should change UI copy, direction and theme consistently even if optional persistence is unavailable.
10. **Actual:** On storage get/set rejection, `getPersistedLocale()` remains `en` and `getPersistedTheme()` remains `light`. Events fire, but useSyncExternalStore reads the unchanged defaults and React state does not update. The same commit directly sets `dir=rtl`, `lang=ar`, `data-theme=dark`; text remains English and theme switch remains unchecked. Further toggles compute from unchanged `en/light` and cannot toggle back.
11. **Root cause:** Persistent storage is the only reactive state source; catch-and-ignore write failures have no in-memory fallback. Direct document mutation bypasses that source.
12. **Reproduction:** Mount production LocaleProvider+ThemeProvider with a consumer under the repository's synthetic DOM; set localStorage getItem/setItem to throw; invoke exposed toggleLocale/toggleTheme inside React.act. Retained output: `before en light en:light`, then `after en light en:light DOM dir rtl DOM theme dark`. Scratch harness imports the unchanged worktree sources; no copied implementation logic.
13. **Preconditions:** Guest browser allows app JS but rejects preference storage reads/writes (restricted storage policy/webview, or writes blocked); not all private modes meet this condition. Reproduction forces the precise failure rather than assuming every private browser fails.
14. **Business impact:** Arabic-preferring guest cannot obtain Arabic instructions through the visible language control in that environment; English copy may be rendered RTL, and dark mode control misrepresents the active DOM theme.
15. **Security/data impact:** No credential or operational data exposure found in this path. Preference consistency only.
16. **Affected roles:** Guest/customer.
17. **Environments:** Production and development customer browser under stated storage restriction; ordinary writable localStorage is unaffected.
18. **Existing coverage:** locale.test.ts 19–35 and 146–170, theme.test.ts 20–35 and 132–155 use always-successful storage mocks. Locale integration verifies dictionary/interpolation/routing; theme matrix injects initial values. All 481 current customer tests passed.
19. **Missing validation:** Real restricted Android/iOS in-app browser, browser storage policies and screen-reader language behavior not exercised. New regression should mount providers with throwing storage and check rendered text/control state/DOM on both toggles.
20. **Suggested fix:** Keep current mounted preference in an in-memory external store or React state and make persistence best effort; derive DOM updates and snapshots from that same state. Preserve cross-tab storage synchronization and hydration semantics. No layout or visual redesign required.
21. **Complexity:** Small-to-medium; estimate 0.5–1 engineering day plus focused regression coverage, subject to owner planning.
22. **Regression risk:** Medium around SSR hydration, pre-hydration Arabic visibility guard and cross-tab synchronization; test normal persistence, rejected persistence, both directions, remount and storage events.
23. **Related issues:** No open match in `<AUDIT_WORKDIR>/open-issues.json` (18 entries); closed history was not available to this worker. Pilot: fix before onboarding Arabic-only users in affected browsers, or constrain pilot to verified writable-storage browsers with an explicit workaround.

**Attempted disproof:** Verified commitLocaleChange dispatches an event and writes DOM, so this is not merely lack of notification. The subscribed snapshot still reads persisted storage and returns the same default. InitialLocale/initialTheme override props appear only in tests; the production layout passes neither. Catching storage errors prevents crashes but does not preserve the selected value.

### CUST-002 — Loading buttons lose their accessible names

1. **ID:** CUST-002.
2. **Title:** Shared loading button has no accessible label or busy status.
3. **Severity:** P3.
4. **Confidence:** CONFIRMED by rendered markup and source; no real assistive-technology run.
5. **Category:** Accessibility / functional feedback.
6. **Feature:** Customer action/refresh/rating/push loading states.
7. **Paths:** `apps/customer/src/components/primitives/btn.tsx`; examples `src/features/session/screen-received.tsx`, `src/features/rating/guest-live-rating.tsx` under same app.
8. **Lines:** btn.tsx 64–86; screen-received.tsx 73–76; guest-live-rating.tsx 85–87.
9. **Expected:** While busy, retain the action's accessible name and expose operation status, even if its visual label becomes a spinner.
10. **Actual:** Loading substitutes children with an empty spinner span; the button has neither aria-label nor aria-labelledby nor retained text. The rating caller supplies translated 'Submitting' text, but the component discards it.
11. **Root cause:** Conditional loading render removes the name source and adds no accessible replacement.
12. **Reproduction:** Render `<Btn loading variant="secondary">Refresh</Btn>` with production component via renderToStaticMarkup; retained output is a disabled button containing only an empty styled span, no Refresh or ARIA name/status. Source-level accessible-name calculation is empty.
13. **Preconditions:** Any caller sets loading true; transient but ordinary live operation.
14. **Business impact:** A guest using assistive technology loses the action label/operation feedback during a request; harder to understand pending actions and recovery.
15. **Security/data impact:** None demonstrated.
16. **Roles:** Guest/customer using assistive technology.
17. **Environments:** All customer app environments when loading prop true.
18. **Existing coverage:** Current 481 tests pass; static theme matrix tests render the secondary button with loading false. No dedicated Btn test in tracked source inventory.
19. **Missing validation:** Physical screen-reader announcement behavior, live busy status and focus retention; assert accessible names in loading and idle states.
20. **Suggested fix:** Keep an accessible action label (e.g. retained visually hidden text or an explicit label), hide decorative spinner from assistive technology, and expose busy state. Fit within existing geometry/UI freeze.
21. **Complexity:** Small; a few hours with regression checks.
22. **Regression risk:** Low if layout is preserved; verify visual freeze, name preservation, disabled/busy semantics and translations.
23. **Related issue:** No matching supplied open issue; closed history not checked. Pilot: can be deferred for a constrained pilot if accessibility qualification is tracked; fix before broader accessibility acceptance.

**Attempted disproof:** Callers do supply meaningful children during loading; these are conditionally discarded inside Btn itself. A disabled button can still have and needs an accessible name. No role=status/aria-label exists on its spinner or button in rendered result.

## Disproved / unreported candidates

- Completed polling stops and freshness ages out, but explicit receipt/rating `open()` uses `canRemain`, not `canEnter`, and the post-visit screen performs an independent session reauthorization GET. Therefore post-visit actions were not reported as permanently blocked after 35 seconds.
- Initial handoff material is not automatically reissued on every poll; the issue claim prevents automatic repeated POSTs, and explicit rotate recovery is exposed. Cached material is intentionally withheld after trust loss. No blanket handoff failure was inferred from that policy.
- Customer online payment/deferred screens are not live product support: production root exposes a read-only completed payment summary. Their existence alone is not a broken checkout finding.
- CSS selectors and dimensions alone do not establish clipping or physical-device defects. No responsive screenshot defect claimed.

## Known external release gates / integration uncertainty

Supplied open issues establish known tracked work, not newly proved regressions: **#279** Guest E2E/load/physical/production gate; **#224** Customer HTTPS origin; **#227** production origins/build proof; **#219** active-handoff Guest Access recovery; **#310** WhatsApp sandbox-only production-off integration; **#324** broader dependencies/secrets/ingress follow-up. Do not classify these as newly discovered confirmed vulnerabilities from this report.

| Integration | Implemented in inspected client | Configured here | Mock/unit evidence this run | Real provider/browser proof | Production-enabled |
|---|---|---|---|---|---|
| Same-origin Guest API | Yes, typed proxy client | UNKNOWN | Yes | Not exercised | UNKNOWN |
| Browser Session cookies | Yes, bootstrap + context fence | UNKNOWN enrollment flag/deployment | Yes | Not exercised | UNKNOWN |
| Web Push / VAPID | Yes, browser stages+SW | UNKNOWN | Yes | No permission/provider/device run | UNKNOWN |
| Audio ready alert | Yes | Static path exists; binary unverified | Yes | No browser playback | UNKNOWN |
| QR handoff rendering | Yes | Encoder dependency reused | Yes | No actual camera/scan proof | UNKNOWN |
| Operator information | Yes | Published data UNKNOWN | Yes | No live operator data | UNKNOWN |
| Payments | Read-only projection | UNKNOWN | Contract/client tests passed | No live money/provider operation | UNKNOWN |
| WhatsApp link delivery | Client consumes fragment entry | Not customer-owned | Customer auth mocks only | No WhatsApp delivery proof | Production-off issue #310 remains separate |
| Fonts CDN | CSS references Google Fonts | External connectivity UNKNOWN | No browser font check | Not exercised | UNKNOWN |

## Pilot assessment and remediation order

Client source and 481 tests support continued development/internal testing. They do **not** establish readiness for an unconstrained real-customer pilot or production rollout. Before a pilot, close or explicitly satisfy the existing HTTPS/origin/build and Guest T6 gates using one organization, multiple locations, actual Android devices and customer browsers. Exercise check-in link issuance → browser exchange → refresh/restoration → request/cancel → concurrent staff retrieval → READY alert → handoff code/QR → checkout → receipt/rating; include expired/revoked authority, two tabs/devices, provider failures, background/foreground, and intermittent connectivity.

Batch 4 customer corrections: CUST-001 first for Arabic/restricted-browser support (small-to-medium, hydration regression risk); CUST-002 shared accessibility correction (small, low risk). Both recommendations preserve approved UI layout; no owner design change is required for a nonvisual correctness correction, but implementation authorization is a separate task. Batch 5: physical/staging qualification for #279, #224/#227 deployment proof and active-handoff recovery #219. No P0/P1 client defect is established by this worker. No confirmed client data-loss or cross-tenant exploit is claimed.

## Explicit unverified areas

Full unreviewed paths are enumerated in coverage.json: translations and linguistic accuracy, palette/branding internals, most test assertions, development-preview/deferred screens, icon/brand/hero primitives, QA scripts, TypeScript config and generated declarations. Three partially read files are flagged separately. No full backend producer/database/transaction review, real API requests, real provider integration, installed PWA/browser continuity, physical device/scanner/push/audio test, screen-reader run, browser zoom/RTL visual matrix, production infrastructure review or data inspection was performed by this worker. These are gaps, not passing results.
