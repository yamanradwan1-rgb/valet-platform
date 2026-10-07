# Guest App Production Readiness Implementation Plan

Planning audit date: 2026-10-07 (Asia/Amman). Status: **OWNER DECISIONS ACCEPTED — READY FOR TASK EXECUTION**.

Production verdict: **NOT READY** for reliable continuity throughout an active visit. This is an audit and execution plan with the Owner decisions recorded below; it is not an implementation report. No production code, UI, schema, migration, dependency, deployment, or GitHub issue is changed by this document.

## 1. Executive Summary

The current Guest application cannot meet reliable same-visit reload/reopen continuity. The audit confirms **0 P0, 12 P1 and 5 P2 findings**, including **4 new findings**. Six bounded implementation tasks address authority, client recovery, backend resilience, operations, selected product gaps and qualification. Production is **NOT READY** for this target; the nine Owner decisions below are now accepted for implementation. The premium Guest UI remains frozen.

This planning document follows the Owner's requested 22-section outline. Repository guardian classifications and evidence gates are retained as subsections; the skill's default section order is superseded by that explicit outline.

## 2. Audited Baseline

### Repository facts discovered

- Repository: `veletpro0-lgtm/valet-platform`.
- Fetched with `git fetch origin --prune`; exact audited `origin/main`: **38dbaf7e2fd69046447537e84b543446277d5637**. It matches the supplied earlier baseline; equality was verified, not assumed.
- Planning branch: `plan/guest-app-production-readiness`, created from that exact remote commit. The initial working tree was clean; no matching local or remote planning branch existed.
- Evidence below is **STATIC VERIFIED** unless explicitly identified otherwise. The existing Customer suite is **LOCAL COMMAND VERIFIED**: `pnpm --filter @valet/customer test`, 26 files / 176 tests passed. Initial sandbox dependency access failed with EPERM; the same command succeeded with authorized access.
- PostgreSQL suites were inspected but not executed: they provision fixtures and can mutate databases. No services, migrations, load runs, mobile builds, staging, or production operations were run. No new browser/physical/runtime proof is claimed.
- Counts: **0 P0, 12 P1, 5 P2 confirmed findings; 4 newly discovered findings; 6 major implementation tasks**. P1 means a release-blocking reliability/control gap for the stated target, not necessarily a security exploit. P2 means a bounded operational, product, or usability gap. Unproven deployment conditions are separately listed and not counted as confirmed deployed defects.

Paths and line numbers refer to the audited SHA. Symbol names are included where line ranges would obscure the relevant boundary. Evidence proves current implementation, not approval of future policy.

Inspection covered binding product/schema/state/security/engineering/structure/workflow docs, task-specific Accepted decisions, Customer entry/controllers/views/tests/SW, API Guest consumers/limiter/PostgreSQL runtime/health, migrations/privileges, Native sharing/recovery, deployment artifacts and CI. Evidence collection used git fetch/status/show, rg/file reads, GitHub read-only issue search/fetch/comments, the existing Customer unit suite and the planning heuristic. No source mutation or runtime deployment is inferred from those reads.

## 3. Current Architecture

`Staff issue/reissue -> transient QR/Copy Link -> Customer #guestToken fragment -> GuestAuthProvider -> GuestApiClient -> /api/v1/guest/* Next rewrite -> /v1/guest/* API -> durable anti-abuse -> GuestAccessService -> PostgreSQL session scope -> feature command/projection`.

The fragment is strictly 43 base64url characters, read after mount, scrubbed with `history.replaceState`, and adopted only after successful scrubbing. The credential then lives in React/client memory. There is **no server-side one-time exchange today**: the same bearer remains reusable until expiry, revoke, or rotation. “One-time browser entry” in DEC-064 describes fragment ingestion, not token consumption.

### Browser continuity truth table

| Event | Current result | Required qualification |
| --- | --- | --- |
| In-app Refresh | Uses existing bearer and canonical GET unless same-client request is already in flight or state is COMPLETED | #196 real touch/loading/error proof still open |
| Full reload, clean URL reopen, fresh duplicated clean tab | New document has no bearer | F01; duplicated-tab browser restoration details require physical proof |
| Process eviction, memory pressure causing document destruction, browser restart | No implemented durable restoration | F01; distinguish destruction from an alive suspended page |
| PWA relaunch | Manifest start_url `/`; no credential bootstrap from storage | Same gap; browser/PWA cookie-storage sharing must not be assumed later |
| Background then foreground with document retained | Memory remains; visible event refetches | Requests may hang; no stale bound |
| Network switch/reconnect with document retained | Next poll can recover; no explicit online event/deadline/backoff | T2 failure tests |
| Customer/API restart with document retained | Bearer remains in browser; server credential hash remains in PostgreSQL | Restart does not inherently destroy existing Guest auth; availability/reconciliation require proof |
| Deploy causing reload or old asset mismatch | New document loses bearer | T1 continuity plus T4 asset compatibility |
| Storage cleared/private session ended/device changed | No safe guarantee of restoration from a clean URL | Explicit staff recovery is necessary even with a cookie design |

### Endpoint inventory and anti-abuse cost

The Customer client currently calls only session read, request/cancel and handoff issue/rotate. All these, plus the following backend-only Guest surfaces, use shared `v1:guest-client-address` and `v1:guest-token` scopes:

| API route | Owner |
| --- | --- |
| `GET /v1/guest/session` | `guest-access/guest-access.controller.ts` |
| `POST /v1/guest/session/request-retrieval`, `cancel-retrieval` | `retrieval/guest-retrieval.controller.ts` |
| `POST /v1/guest/session/handoff-verification/issue`, `rotate` | `retrieval/handoff-guest.controller.ts` |
| `PATCH /v1/guest/payment/tip` | `payments/guest-payment.controller.ts` |
| `GET /v1/guest/valet-sessions/:sessionId/payment` | Same controller; service compares path ID with credential-derived scope |
| `POST /v1/guest/session/rating` | `guest-access/guest-rating.controller.ts` |

Ordinary successful session read, below quota, has approximately **23 SQL statements**: address reservation 8 (BEGIN, timeout twice, advisory lock, clock, count, insert, COMMIT), token counting 8, authenticated resolution/finalization 5, plus two cleanup SELECTs. Cleanup function internals add work beyond that count. This excludes TLS/socket overhead, failure branches and PostgreSQL internal work. There are three explicit connection acquisitions/transactions plus two pool queries. Each successful poll creates two rows and updates one; both IGNORED and COUNTED rows remain until one-hour cleanup.

| Concurrent visible Guests at 5s | Offered polls/s | Inserts/s | Updates/s | Cleanup calls/s | Explicit transactions/s | Approx. retained limiter rows at 1h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 20 | 40 | 20 | 40 | 60 | 144,000 |
| 500 | 100 | 200 | 100 | 200 | 300 | 720,000 |
| 1000 | 200 | 400 | 200 | 400 | 600 | 1,440,000 |

These are mechanical offered-load costs **assuming every poll succeeds**, not a measured throughput promise; present quotas, pending reservations, outages and contention can reduce accepted throughput. Limiter indexes are `(scope,key_hash,occurred_at)` and `(occurred_at)`. Counts include PENDING/COUNTED, with IGNORED excluded by a filter rather than a partial index. Same-address reservation decisions share an advisory lock; unresolved PENDING rows count for up to the 15-minute window. Crash-after-reserve can therefore temporarily penalize a NAT even when the eventual intended operation was legitimate. Do not treat an unfinalized reservation as success or delete current-window rows to conceal overload.

### Existing implementation patterns

GuestAccessModule imports AuthModule, AntiAbuseModule, RuntimeDatabaseModule and HttpInfrastructureModule; it exports **GuestAccessService** and applies RequestIdMiddleware to its controllers. RetrievalModule imports those shared boundaries plus GuestAccessModule; retrieval business transactions remain in RetrievalService/explicit command functions. PaymentsModule similarly consumes GuestAccessService. API operations use ApiOperationRunner and shared `@valet/contracts` schemas, not duplicated DTOs.

Two verified staff route prefixes differ: StaffGuestAccessController is `v1/staff/check-in`; StaffAuthController is `v1/staff/auth`. Preserve established routes; any new Guest exchange/logout/renewal path, DTO and error taxonomy requires T1's accepted contract. Guest business controllers can live in their owning feature despite sharing `/v1/guest`.

`resolveAndLockGuestAccessSession` currently accepts a raw Guest bearer and locks its ValetSession in the business transaction. A cookie cannot simply be substituted into that raw-token argument. T1 must provide a narrow exported credential-resolution capability that consumers use in their own transaction, yielding only the existing authoritative session scope. Guest Access must not import Retrieval/Payments. No domain SQL in Next, and no process-local mapping from cookie to original bearer.

Nearest cookie precedent is staff auth: duplicate-cookie rejection, Secure/HttpOnly cookie and exact origin allowlist exist in `staff-auth.controller.ts` / `staff-auth.origin.ts`. Staff refresh cookie path and staff principal semantics are **not** Guest contracts and must not be copied verbatim.

Important abstraction gap: `submitGuestRating` calls privileged `guest_rating_submit(rawToken,rating)`; migration 42 hashes the raw Guest bearer and reauthorizes/locks the session inside PostgreSQL. Replacing only HTTP auth would break rating. If cookie architecture is accepted, a forward migration must add an equally constrained browser-session authorization path, preserving execute-only runtime authority and immutable ratings; never grant unrestricted INSERT as a shortcut.

`appendCustodyAuditEvent` accepts nullable membership with explicit GUEST/SYSTEM actor, mandatory organization/location/session scope, and only ValetSession/Vehicle entity types. It can describe approved session-scoped credential events; it cannot represent an arbitrary BrowserSession entity merely because audit columns are nullable. New event semantics/metadata and any writer extension require an accepted contract. Metadata key filtering is not a license to store arbitrary values or credential hashes.

## 4. Guest UI Freeze Contract

**NON-NEGOTIABLE: NO GENERAL UI REDESIGN. Default: NO VISUAL CHANGE.**

The existing premium Guest product design is frozen: screen layouts, card geometry, spacing, typography hierarchy, colors, icons, branding, composition, navigation and framework remain intact. Reliability work belongs in authentication, controllers/hooks, API transport, server, database, deployment and tests. No generic replacement loading/error UI or new design system is authorized.

Any necessary visible change must be individually recorded as **UI-FROZEN SAFE DELTA**, with its failing state, existing primitive, exact changed copy/control and EN/AR/RTL screenshots. Permitted candidates for review are temporary failure/retry, stale/reconnecting notice, retrieval error text, accurate loading/disabled behavior, proof-recovery feedback and accessibility semantics. Accessibility focus/zoom fixes must preserve default layout. No blanket permission to rearrange screens is implied.

Enabling a currently hidden product surface or adding an end-access control also requires a named delta and Owner approval of its precise entry point. If this would require navigation redesign, stop that sub-work for an explicit design decision. Baseline and final screenshots must use identical viewport, theme, locale, branding and canonical state; only approved state-specific deltas may differ.

## 5. Confirmed Findings

| ID / severity / owner | Evidence | Confirmed behavior and failure scenario |
| --- | --- | --- |
| F01 / P1 / T1 | `docs/decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md`, decision 5; `apps/customer/src/features/auth/guest-token-adapter.ts`, `extractGuestFragmentToken`; `guest-auth-context.tsx`, `GuestAuthProvider` | Confirmed intentional reload access loss. A new document at the scrubbed URL has no token and cannot restore the same visit. This is a product-contract mismatch with the new continuity target, not an accidental violation of DEC-064. |
| F02 / P1 / T1 | `apps/api/src/modules/valet-sessions/guest-access-token.ts:3`, `guestAccessContract.lifetimeMilliseconds`; `guest-access-command.ts`, `createIssueGuestAccessCommandExecutor`; both `guest-access-resolver.ts` and `guest-access-session-resolution.ts` | Fixed 24-hour issue/rotation lifetime. Both normal and locked resolution require unexpired access even if the physical visit remains active. No active-visit renewal exists; a legitimate longer visit can lose access. |
| F03 / P1 / T3 | `apps/customer/src/features/session/guest-session-provider.tsx:23,95,162`; `apps/api/src/modules/guest-access/guest-access.controller.ts`, `getSession`; retrieval/handoff/payment/rating controllers listed below | Five-second visible polling consumes about 180 presentations per rolling 900 seconds. Initial, manual, visibility and mutation calls share the 180 budget; extra tabs multiply it. No jitter/backoff scheduler consumes Retry-After. Normal use has no dependable headroom. The address quota is 60 **failed or pending** authentications, not 60 successful polls; successful requests become IGNORED. Synchronized valid requests behind one NAT can nevertheless exhaust 60 pending reservations before finalization. |
| F04 / P1 / T2,T3 | `apps/customer/src/lib/api/guest-api-client.ts:18,65,79`; `guest-session-provider.tsx:95-127`; `features/retrieval/use-retrieval.ts`, `requestVehicle`/`cancelRetrieval` | AbortSignal is accepted but these hooks supply none and create no deadline. Fetch or body consumption can remain unresolved, holding refresh or mutation locks indefinitely. A timeout after a POST reaches the server would be an ambiguous outcome, not proof of failure. |
| F05 / P1 / T2 | `apps/customer/src/features/session/guest-lifecycle-router.ts`, `resolveGuestScreenId`; `guest-session-provider.tsx:109`; `apps/customer/src/app/guest-app-root.tsx`, UNAVAILABLE branch | Initial network errors get a retry screen, but 429/5xx/schema failures with no snapshot fall through to UNAVAILABLE and `ScreenExpired`. API error mapping itself has temporary-error messages; the route/controller presentation loses that distinction. |
| F06 / P1 / T2 | `guest-session-provider.tsx:109-120,162-189`; `guest-lifecycle-router.ts`; `guest-app-root.tsx`, live route | After a snapshot exists, poll failures retain it without a freshness bound or visible stale-state notice. Guests can see an old operational state indefinitely during outages. Visibility refresh exists; no explicit online/pageshow recovery exists. COMPLETED suppresses all further session fetches, including manual refresh: post-completion auth/financial freshness must be handled separately if those surfaces are enabled. |
| F07 / P2 / T2 | `features/retrieval/use-retrieval.ts`, catches; `app/guest-app-root.tsx`, `handleRequestConfirm` and `OverlayConfirmRequest`; `features/retrieval/overlay-confirm-request.tsx:9`; `app/guest-live-view.tsx:39` | Request failure sets `actionError` but confirmation has no error input/rendering. Cancel failure is rendered in ScreenRequested. An open confirm overlay is not invalidated when authoritative state changes. Refresh is wired, but ScreenReceived's `isRefreshing` input is not passed. Missing handler is rejected as the explanation for #196; physical reproduction remains required. |
| F08 / P1 / T2 | `features/handoff/use-handoff.ts:29-50,79-88`; `features/handoff/screen-ready-pin.tsx`, method switch; `apps/api/src/modules/retrieval/issue-handoff-command.ts`, `issueHandoffVerification` | Issue, rotate and switch lack a synchronous shared lock or response generation fence. Rapid switches/rotations can complete out of order and display a proof already consumed by a later server rotation. Server session serialization prevents parallel authoritative proofs but does not order browser responses. Issuance is limited to 5 per 15 minutes; accidental overlap wastes that budget. |
| F09 / P2 / T3 | `modules/anti-abuse/anti-abuse.service.ts:91-121,204-225,236-255,276-299`; guest read controller; migration `20260810001800_shared_durable_anti_abuse/migration.sql:25-46` | Every ordinary successful session read incurs two limiter inserts, one finalization update, three transactions and two cleanup calls. Cleanup executes an unbatched age-based DELETE; lock timeout bounds waiting, not all statement execution. This is a verified cost/retention design gap; production saturation is not asserted without measurements. |
| F10 / P1 / T3 | `apps/api/src/common/database/postgres.ts`, `createRuntimePostgresPool`; `runtime-database.module.ts`; `modules/retrieval/retrieval.service.ts`, `inTransaction` | Runtime PoolConfig sets connectionString and production TLS only. No explicit pool max, acquisition/query/statement/idle-transaction deadline or pool-wait instrumentation is configured here. Limiter lock_timeout is 2s, but does not bound the full guest command or connection queue. Deployment role-level settings, if any, require runtime inspection. |
| F11 / P1 / T4 | `apps/api/src/app.controller.ts`, `getStatus`; `main.ts`; `common/database/runtime-database.module.ts`; `common/observability/console-operation-observer.ts`; `infra/systemd/vaylet-customer.service` | API `/` is a static scaffold response. There is no continuous DB/anti-abuse readiness contract or Customer readiness route in the inspected application tree. Structured operation duration/outcome/request-ID logging and shutdown hooks **do exist**; “no observability/graceful shutdown” is rejected. Readiness/drain, pool metrics, guest recovery metrics and operational alerts remain missing repository-owned proof. |
| F12 / P2 / T5 | `apps/customer/src/components/layout/bottom-nav.tsx`; `app/guest-app-root.tsx`; `features/session/screen-completed.tsx`; `lib/api/guest-api-client.ts`; API payments/rating modules | Payment, tip, receipt, rating, Help and report previews are not a complete production Guest journey. Some backend capabilities exist, so “all backend functionality missing” is rejected. Product classification below prevents this becoming an unlimited development task. |
| F13 / P1 / T6 | `.github/workflows/ci.yml`; `apps/customer/package.json`; `features/session/production-behavior.test.ts`; `features/auth/guest-auth-context.test.tsx` | CI has unit, PostgreSQL, build, platform, Employee E2E and Dashboard runtime E2E, but no Customer browser journey. Customer tests include fetch mocks, pure routing and static React rendering; they cannot prove reload continuity, mounted hook races, proxy cookies, or real secure release. |

### Production surface classification

| Surface | Current truth / authority | Classification and disposition |
| --- | --- | --- |
| Entry, continuity, request/cancel, PIN/QR, refresh | Live paths exist; findings above | **BLOCKING GUEST CORE** until T1-T4/T6 gates pass |
| Native handoff-time Guest recovery | Separate Native Guest Access exists; contextual integration missing (#219) | **BLOCKING GUEST CORE** operational fallback, T5 |
| Payment projection | DEC-057 backend projection exists; Customer API client has no payment method | **PILOT BLOCKER** for any paid flow requiring Guest financial visibility; may remain disabled only for explicitly payment-disabled pilot |
| Tips | Guest PATCH backend exists; Customer tip screen is preview | **PILOT BLOCKER** when tips are offered; otherwise explicit pilot exclusion, never fake success |
| Digital payment / checkout status | Provider-neutral collection core exists; PaymentsModule binds `UnconfiguredDigitalPaymentProviderRegistry` | **POST-PILOT / DEFERRED** for payment-disabled earliest pilot allowed by `docs/09_TECH_STACK.md`; **PILOT BLOCKER** if digital collection is promised. Do not add a provider incidentally. |
| Receipt | Preview only; a financial projection is not automatically a legally/contractually valid receipt | **PILOT BLOCKER** if money is collected and a receipt is promised/required; Owner must approve source/content/delivery or an explicit external receipt process. No invented fields. |
| Rating | DEC-091, immutable guest_ratings and submit API implemented; completed-screen rating is dev-only | **PILOT BLOCKER** if pilot includes approved Guest feedback; otherwise explicit bounded deferral. Full sellable-MVP completion still requires wiring. |
| Help / Report Issue | Deferred screens, no production Customer command in GuestApiClient | Minimum truthful way to obtain staff assistance is **PILOT BLOCKER**; full Guest incident intake is **POST-PILOT / DEFERRED** pending contract. Staff incident capability is not Guest authority. |
| Guest READY notification | Foreground alert is implemented, with effective Company-default/Location-override enablement and `valetSessionId + readyAt` dedupe | Preserve foreground behavior as core. Reliable background/closed-app Guest notification is a **PILOT BLOCKER** for first launch and is owned by T5/T6. Browser audio remains best effort and must not be presented as guaranteed delivery. |
| SMS / WhatsApp | Blueprint intent; provider selection TBD; current QR/Copy Link acceptance does not claim delivery | Automatic Guest Access link delivery through SMS/WhatsApp is explicitly **POST-PILOT / DEFERRED** into a separate later program. The first pilot uses real QR/Copy Link entry. No simulated sent status. |
| QR / Copy Link | Web and Native transient sharing modules exist; valid production origin is required | **BLOCKING GUEST CORE** until real sharing/opening proof |
| Branding | Implemented #239, DEC-085, contrast-safe inherited values | Preserve; no redesign or second branding authority |

## 6. Newly Discovered Findings

| ID / severity / owner | Exact evidence and current behavior | Failure scenario and required correction |
| --- | --- | --- |
| N01 / P1 / T2 | `apps/customer/src/features/session/guest-session-provider.tsx:75-105,133-146`, `applyAuthorizedSessionSnapshot`; `client-bound-session.ts`, `applyCurrentClientSessionUpdate` | Client identity and session identity are checked, but read responses are not fenced against intervening mutations. A GET reads PARKED, a retrieval POST commits REQUESTED and updates UI, then delayed GET restores PARKED. A delayed mutation response can likewise overwrite a newer poll. Add one read/mutation coordinator; invalidate pre-mutation reads and revalidate after settled mutation. Do not impose numeric state ordering: cancellation and handoff abort legitimately move backward. |
| N02 / P1 / T2 | `features/handoff/use-handoff.ts:20,55-61,93-98`; `modules/retrieval/issue-handoff-command.ts`, checks of `active`; DEC-042 section 6 | Reopening original access during HANDOFF_PENDING issues again, but an existing unconsumed proof yields ALREADY_ISSUED and plaintext cannot be recovered. In the same mounted app, abort hides material without clearing it; re-entry can briefly expose old consumed material. Clear proof/countdown on identity/lifecycle changes; explicitly reconcile already-issued versus already-verified proof and require controlled rotation when permitted. No automatic repeated rotation or plaintext persistence. |
| N03 / P2 / T2,T4 | `apps/customer/public/sw.js:1-2,8-18,33-56`, static cache policy | A constant v1 cache uses cache-first for unversioned icons/manifest and every matching same-origin png/svg/woff2, with no bound or age eviction. Repeat deployments can retain obsolete unversioned assets and accumulate hashed assets. Narrow to an explicit public-static allowlist and release-aware bounded cache maintenance. API/Authorization exclusions currently exist; there is **no proven current secret cache leak**. Cookie migration requires renewed tests because Authorization absence is no longer an auth signal. |
| N04 / P2 / T2 | `apps/customer/src/app/layout.tsx`, viewport `maximumScale: 1`, `userScalable: false`; `components/layout/bottom-sheet.tsx`, `BottomSheet` | Zoom is explicitly disabled; confirm/details sheets lack dialog semantics, focus containment/return and Escape handling. Keyboard/screen-reader users can lose interaction context during retrieval confirmation. Restore zoom and add semantics/focus behavior with no geometry, color, typography or layout change. Physical assistive-technology proof remains required. |

## 7. Findings Rejected / No Longer Applicable

- #196 is not explained by an absent refresh handler: the handler exists; loading, suppression and real-device proof remain open.
- API restart alone does not erase the Guest bearer held in a live page or the PostgreSQL hash. Reload after restart still exposes F01.
- Successful Guest polls are not permanently charged to the 60-address failure quota; they are finalized IGNORED. Pending same-NAT concurrency still matters.
- Durable anti-abuse, hash-only credentials, no-store protection, tenant-scoped payment reads, branding, operation logging and graceful shutdown hooks exist. They must be preserved.
- Database serialization already prevents duplicate active retrieval/proof records; this does not fix stale browser responses or provide generic POST replay safety.
- Payment/rating backend contracts exist; complete production Guest wiring does not.
- Closed historical Web Push issue #197 is not current background-delivery proof.
- Misconfigured live proxy identity, live DB saturation and deployed HA failure are not proven from repository defaults; they require runtime evidence.

### DERIVED conclusions

| Proposition | Classification | Derivation |
| --- | --- | --- |
| The present transport cannot satisfy ordinary full-reload continuity | DERIVED | A new document has no token after scrub and no restoration boundary |
| Polling needs a coordinated quota/cadence decision | DERIVED | 900 / 5 = 180 before extra legitimate operations |
| A server restart alone does not erase a live browser's existing bearer or persisted verifier | DERIVED | Browser memory and PostgreSQL own those values, not API process state |
| Cookie adoption must cover all Guest consumers, including privileged rating SQL | DERIVED | Consumers accept rawToken and rating revalidates it in DB |
| New readiness claims require real environment and failure evidence | DERIVED | Static health/configuration and mocks do not exercise network/DB/process boundaries |

## 8. Owner Decisions — Accepted for Implementation

### OWNER-APPROVED decisions

Every row below is **OWNER-APPROVED** for this execution program. T1 begins by synchronizing these decisions into the focused Accepted decision/contract surfaces, canonical log, schema/security documentation and implementation contracts before production code that depends on them. This planning commit records Owner direction; it does not itself implement the production changes.

| ID | Options and recommendation | Consequences / required acceptance |
| --- | --- | --- |
| U-01 Browser authority — **ACCEPTED** | Use a distinct opaque server-persisted-hash Browser Session through the same-origin Customer boundary and a Secure, HttpOnly cookie. The original Guest bearer remains transient bootstrap material and is not persisted in JavaScript-readable browser storage. | Amend DEC-064 and affected Guest transport clauses in DEC-040/042/044/057/070/091. Freeze exact exchange/read/renew/end-access contracts, auth-source precedence, errors and auditing before dependent code. Never store the original bearer in a cookie or server plaintext. |
| U-02 Bootstrap consumption and ambiguous exchange — **ACCEPTED** | Consume the bootstrap atomically once, with retry-safe recovery for the same browser enrollment using a narrowly scoped server-minted pre-exchange binding. | A lost response after consume must not strand the just-authorized browser. Bind the browser enrollment hash and bootstrap generation atomically so the same authorized browser can reconcile without recreating plaintext. Foreign/stale enrollment, duplicate-tab, CSRF/session-swap and cleanup behavior must fail closed. Do not ship naive consume-then-Set-Cookie. |
| U-03 Device, tab and visit policy — **ACCEPTED** | One primary browser binding per visit initially; same-browser tabs may share that visit authority. Moving access to another browser/device uses fresh staff reissue rather than silently supporting multiple independent device bindings. A same-browser link to the same visit is no-op continuity. A verified different-visit link uses the Owner-approved explicit `BottomSheet` choice: Continue Current preserves the current binding; Open New atomically transfers the one browser context only after server revalidation. | Reissue remains the safe different-device transfer path. Same-browser multi-visit context never switches silently and never becomes persistent multi-visit authority. The current `ACTIVE`/24h `POST_VISIT` authority survives prepare/switch failure; source invalidation occurs only in the successful target-establishing transaction. No fingerprint/IP binding. Physical browser/PWA storage-jar differences remain qualification work, not a reason to weaken the rule. |
| U-04 Reissue/revoke/logout and rotation — **ACCEPTED** | Staff reissue/revoke invalidates the prior credential generation, including Browser Sessions derived from it. User end-access/logout is per-browser; staff generation revoke is generation-wide. | Reissue never consumes/verifies handoff. Explicit security events may rotate Browser Session secrets. No per-poll rotation or unbounded old-secret grace. Race semantics and audit events must preserve old-access invalidation. |
| U-05 Visit lifetime and restart persistence — **ACCEPTED** | Use a persistent browser credential with server-authoritative active-visit continuity. An active ValetSession is not silently cut off by the old 24-hour bootstrap lifetime or an inactivity timeout, and ordinary process restart/deploy must not invalidate access. Background polling is not required to keep authority alive. | Active-visit authority remains valid while the ValetSession is active and not explicitly revoked/security-invalidated. Cookie/session renewal must preserve that rule instead of imposing an arbitrary active-visit cutoff. Cleared cookies, a different device/browser or explicit revoke use the approved staff recovery path. |
| U-06 Completion and post-visit authority — **ACCEPTED** | After COMPLETED, retain a **24-hour limited post-visit scope** for approved safe read/rating/receipt behavior, with no operational mutation authority. | The post-visit scope cannot request/cancel retrieval, issue/rotate handoff proof or reopen custody. Preserve DEC-091 rating semantics. CANCELLED cannot resolve. Expiry/revoke remains server-authoritative. |
| U-07 Limiter/cadence and reservation model — **ACCEPTED** | Split durable budgets by request class and use adaptive polling with jitter/backoff and Retry-After handling. Keep hostile-traffic protection fail-closed and keep handoff proof issuance separately tight. | Normal supported Guest use must never self-rate-limit inside the approved envelope. Exact numeric budgets/counter shapes are engineering parameters derived and proven in T3 load/concurrency tests, with >=2x measured headroom for the supported normal envelope; they are not permission to weaken anti-abuse. |
| U-08 Pilot product boundary — **ACCEPTED** | First launch is a bounded QR/Copy-Link Guest pilot with full core continuity, request/status/READY/secure handoff/recovery, real staff assistance, and approved post-visit rating/receipt behavior. **Reliable background/closed-app Guest notifications are required for first launch and stay inside this plan.** | Automatic Guest Access link delivery through WhatsApp/SMS is explicitly deferred to a separate later program. Digital payment/provider expansion remains outside the first payment-disabled pilot unless separately approved. No hidden preview may be presented as a working production feature. Background notification implementation must be real, observable and physically qualified; best-effort foreground audio alone is insufficient. |
| U-09 Availability and qualification target — **ACCEPTED** | Production target is >=2 Customer instances and >=2 API instances across failure domains in one region, no sticky authentication/session state, plus managed DB HA/backup. Qualify sequentially at 100, 500 and 1000 concurrent active Guests before any higher approved target. | Accepted operating targets: 99.9% monthly availability; one application-instance loss recovered <=30s; DB failover recovered <=120s. DB RPO still requires provider evidence. Zero unexpected active-visit access loss, duplicate protected business effects or cross-session/tenant disclosure are correctness gates, not percentile allowances. |

### Unresolved decisions

None at the Owner product/security/program-scope level for U-01..U-09. Remaining exact implementation parameters, provider capabilities, environment facts and physical/runtime evidence are owned by the corresponding task and must stay inside the accepted decisions above; any material departure requires a new Owner decision.

## 9. Target Architecture

Based on accepted U-01..U-07; T1 must synchronize these Owner decisions into the focused Accepted decision/contract surfaces before dependent production code changes.

```text
Initial link -> validate fragment -> scrub URL -> acknowledge server-minted enrollment binding
             -> exchange transient bootstrap under generation/consume lock
             -> commit hash-only Browser Session -> Secure HttpOnly cookie -> discard raw bootstrap
Second link  -> scrub transient bearer -> compare persisted current + target authority
same visit   -> no-op continuity, no extra Browser Session or visible conflict
different    -> approved BottomSheet choice -> Continue keeps current / Open New atomic transfer
             -> target established + source browser revoked in one commit -> shared-cookie tabs reconcile
Reload/reopen -> cookie -> current generation/expiry/scope resolution -> same visit projection
Staff reissue -> existing staff authorization -> session lock -> revoke prior generation
              -> audit + fresh bootstrap -> assisted new-browser enrollment
Staff revoke -> authorized lock + generation revoke + audit -> all affected reads/writes denied
Expiry -> server-authoritative active/post-visit rule -> accepted renewal or explicit recovery
Request/cancel -> authorized visit -> domain lock/current state -> atomic task/request/history
               -> browser mutation fence -> authoritative reconciliation
Handoff -> fresh pending snapshot -> single-flight issue/rotate -> transient proof
        -> staff verification + financial/custody guards -> atomic completion
Timeout/lost response -> unknown outcome -> stop stale proof/actions -> reauthorize + reread
                      -> coherent state or approved explicit recovery; no blind POST replay
```

Background requests are not required to keep active authority alive. Completion changes permitted scope under U-06; it never reopens custody. Cleared cookies, another device or unsupported storage retention require assisted recovery, with no vehicle-release bypass.

### Accepted cookie threat model for U-01

The public Customer origin remains the browser boundary; Next forwards only intended Guest routes to a controlled API origin. Recommend host-only `__Host-` cookie, `Secure`, `HttpOnly`, `Path=/`, no Domain, explicit `SameSite=Lax` for external QR/link entry compatibility. Strict is a viable alternative only after entry/browser proof. Cookie name and exact expiry remain part of U-01/U-05 acceptance. `__Host-` requires Path=/; do not combine it with an incompatible API-only Path.

Every cookie-authenticated mutation, exchange, renewal and logout needs exact allowed **public Origin** validation, no wildcard/reflected allowlist, rejection of missing/null/duplicate/foreign Origin for browser mutation routes, strict expected content type and a same-origin custom request header. SameSite is defense in depth, not the entire CSRF boundary. Consider Fetch Metadata as an additional check with a documented fallback for supported browsers. Cookie credentials must not be accepted through a permissive cross-origin CORS path. Define and reject ambiguous bearer-plus-cookie authority; do not silently fall back from an invalid cookie to a different visit's bearer.

Bootstrap binding must also prevent login/session-swap CSRF: foreign enrollment cannot replace an existing active visit without the accepted explicit context-switch flow. XSS still permits same-origin actions and reading returned Guest data even if it cannot read HttpOnly credentials. Retain safe rendering, secret-free telemetry and narrowly justified CSP/header hardening; do not claim HttpOnly eliminates XSS. Original bearer remains transient only through scrub/exchange and is then discarded.

Use persistent hash/verifier records bound through an enforced ValetSession/tenant relation; validate current generation, expiry, revocation and permitted physical/post-visit scope on **every** request. No process-local session authority. Never send raw bearer, cookie, proof, verifier, URL fragment or full request/response bodies into logs, traces, analytics, BroadcastChannel, caches or offline queues. Proxy logging must redact Cookie, Set-Cookie and Authorization; URL-only redaction is insufficient.

Cookie syntax/lifecycle reference: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie). Session restore can preserve nominal session cookies, so “browser close logs out” cannot be guaranteed from omission of Max-Age. CSRF reference: [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). These inform recommendations, not repository policy acceptance.

## 10. Implementation Dependency Graph

Exactly **six major tasks**. This section is the Owner-approved implementation envelope. Each task must name its human owner/issue before execution, re-fetch main and re-check touched Accepted decisions. No two agents may edit the same worktree. Coordinate shared contracts, schema/migrations, decision log, CI and package files; one migration owner at a time.

Dependency order: **T1 accepted contracts and merged compatibility foundation -> T3 -> T2 -> T4 -> T5 -> T6 final release gate**. T4 read-only environment discovery and T6 test design can occur earlier, but production rollout and final qualification cannot. These dependencies concern safe merged execution, not permission for concurrent shared-file edits. T1 includes the minimal new client bootstrap behind a disabled rollout gate; T2 owns complete client reliability. T5 depends on T1/T2/T3/T4; T6 cannot certify until every selected slice is merged.

## 11. Major Execution Tasks

### Proposed implementation plan

All six tasks below are governed by the accepted U-decisions in section 8. Existing security/domain invariants remain mandatory.

### T1 — Guest Access continuity and credential lifecycle

1. **Goal:** preserve the same authorized visit across normal document/process lifecycle events under an accepted credential model.
2. **Why:** F01/F02 and the rating SQL/auth abstraction gap prevent a transport-only fix.
3. **Owned problems:** bootstrap exchange/restore, active/post-visit lifetime, browser authority, revoke/reissue/logout, multi-tab/device rules, credential migration compatibility; auth integration for every inventoried Guest route.
4. **Out of scope:** reliability UI redesign, changing retrieval/handoff transitions, providers, new accounts, staff role changes.
5. **Dependencies:** U-01 through U-06 accepted and mirrored before production code. U-07 must define new credential limiter identity before enrollment can be enabled. This task's compatibility foundation MUST merge before T3/T2 depend on it.
6. **Likely modules:** Customer auth provider/token adapter/API transport; API guest-access plus existing normal/locked resolvers; affected retrieval, payment and rating consumers; shared contracts; schema docs/Prisma/new forward SQL/runtime privileges/tests. Extract credential lifecycle responsibility from the 437-line guest-access-command instead of growing it.
7. **Preserve:** DEC-040/042/043/044/057/085/091 domain behavior, no-store and narrow projections, nullable Customer, exact tenant scope, audited staff issue/revoke.
8. **Decisions:** amend DEC-064 and affected transport clauses; accept precise API/error/audit/retention contracts. Do not assign an invented DEC number or mark it Accepted yourself.
9. **Database:** IF U-01 C is accepted, expected direction is an additive Browser Session relation with unique high-entropy-secret hash, enforced visit scope, generation binding, server timestamps, expiry/revoke fields and checks, plus session/revocation/expiry lookup indexes. U-02 determines bootstrap-consumption/enrollment persistence; U-03 determines binding uniqueness. Add forward privileged rating support preserving execute-only authority; no historical migration edits or destructive down migration. Exact schema remains conditional until the DEC freezes it.
10. **API:** preserve existing business routes; add only accepted exchange/restore/renew/end-access transport and shared Zod contracts. Publish whether legacy bearer is allowed per route/generation. Reject mixed authority deterministically. No secret in guest-safe projections.
11. **Client:** deterministic post-mount scrub -> accepted exchange -> credential-free restore. Distinguish auth bootstrapping from missing access; clear raw fragment bearer after exchange. Restore via same-origin cookie if accepted; no local/session/IndexedDB token persistence. Client-generation fencing prevents prior visit responses from rendering.
12. **Security:** apply conditional threat model above; server-authored target scope and current generation checks before business writes. Session fixation/enrollment swap, CSRF and credential-source precedence require explicit negative tests.
13. **Privacy:** hashes only in persistence; no raw auth/proof in telemetry or caches; browser cookie scoped to controlled Customer host. Clear sensitive memory on invalidation/context replacement.
14. **Concurrency/idempotency:** freeze transaction/lock order and exchange-lost-response contract; test concurrent consume, same-browser retry, foreign-browser replay, renewal-vs-revoke and completion. Use race matrix below; no credential resurrection.
15. **UI freeze:** no normal-screen visual change. The Owner-approved U-03 same-browser different-visit delta is exactly one existing `BottomSheet` with existing `Btn` controls and approved EN/AR copy: Continue Current preserves the authoritative browser context and discards only the in-memory new-link bearer; Open New invokes the atomic server context transfer. `ACTIVE` and `POST_VISIT` use the same component with the approved body variant. Same-visit continuity displays no sheet. Dismissal is Continue Current and can never switch implicitly. No new full screen/navigation/account/multi-visit UI is permitted.
16. **Error/recovery:** unavailable is retryable without discarding valid authority; invalid/revoked is terminal until fresh authorized access. Lost exchange response reconciles through U-02, never blindly consumes another token. Cookie rejection/storage denial leads to truthful assisted recovery.
17. **Backward compatibility:** deploy additive DB then server dual-reader compatibility before cookie clients. Existing unexchanged links remain valid under the accepted transition contract; a consumed/rotated link never revives through legacy fallback. Version contracts without requiring simultaneous deployment.
18. **Deployment:** secure public origin/proxy must pass T4 preflight before enablement; backend instances share state and key material. Feature gating must be operationally explicit and must not bypass authorization.
19. **Authorization-before-mutation proof:** authenticate credential -> resolve persisted visit/generation -> prove current exact-session permission and allowed scope -> lock/recheck invalidation predicates in accepted order -> write auth/domain changes -> append required approved audit -> commit -> emit Set-Cookie/data. Retry re-proves authority before returning. The U-03 context-switch exception resolves source only from the current Browser Session and target only from the transient bearer, locks distinct parent ValetSessions in deterministic UUID order, then the exact transition enrollment/source Browser Session, and revokes the old browser only in the same transaction that establishes the target. Pre-commit failure preserves source authority; committed-response loss is reconciled from exact server-minted transition lineage. Staff reissue retains active-user/member/org/location/access/role proof before session mutation; do not invent a Shift requirement absent from current issue command.
20. **Tests:** unit transport/cookie parsing; real PostgreSQL constraints/migration/runtime-role/rollback tests; two-principal tenant and same-tenant-other-session denial; CSRF and source-confusion tests; browser reload/restart/tabs; concurrent exchange/revoke/renew; >24h simulated-clock fixture plus physical long-visit soak. Real lost-response/SIGKILL cases, not only mocks.
21. **Commands:** C1/C2/C3 below; new T6 browser lane once available. Migrations/tests only against designated disposable DB, then representative sanitized upgrade data in staging.
22. **Acceptance:** all selected U-01..06 lifecycle rows have tests, no original bearer persistence, reload returns the same visit, explicit revoke wins against later writes, rating still works under the selected completed scope.
23. **Done:** accepted docs/contracts synchronized; staged migration compatibility proven; runtime privileges remain least-privilege; code structure/CI/cross-review pass; rollout stays disabled until T3/T4 gates.
24. **Rollout:** additive migration -> compatible API everywhere -> disabled client capability -> staging enrollment -> later T4 canary. Track old/new cohorts without logging identities.
25. **Rollback:** stop new enrollment; retain compatible cookie readers/renewal for existing active visits. Revert faulty client behavior to last cookie-compatible version. Preserve auth schema/history. Security emergency uses authorized revoke/reissue with operational assistance, never re-enable old consumed links.
26. **Risks:** multiple tabs replacing cookies, cross-jar PWA entry, response loss after commit, rating SQL incompatibility, renewal write amplification and long dormant visits.
27. **Owner blockers:** none for U-01..U-07. T1 must first encode the accepted Owner direction into the focused DEC/contract/schema/security surfaces and resolve only bounded implementation details without changing those decisions.

### T2 — Guest client reliability, reconciliation and PWA behavior

1. **Goal:** make reads/mutations terminate predictably and render only reconciled, current-client state without changing Guest design.
2. **Why:** F04-F08 and N01-N04 cause stuck, misleading or stale interactions even when server invariants hold.
3. **Owned problems:** refresh feedback/#196, finite deadlines, retry classification, stale bound, lifecycle wakeups, read/mutation ordering, retrieval errors, proof single-flight/recovery, public-static cache bounds and accessibility.
4. **Out of scope:** business-state redesign, autonomous POST replay, altered proof limits, push/provider implementation and premium UI changes.
5. **Dependencies:** MUST NOT start dependent implementation until T1 and T3 are merged and their auth/rate-limit contracts accepted. Pure reproduction/test design may precede them.
6. **Likely modules:** `lib/api/guest-api-client.ts`, `api-error.ts`; session provider/client-bound-session/router; retrieval/handoff hooks; GuestAppRoot/GuestLiveView; current system/confirm/PIN/QR primitives; SW/register-pwa; locale strings; focused mounted-hook/browser tests. GuestAppRoot is 291 lines: extract a focused coordinator/composition before adding logic.
7. **Preserve:** backend-authoritative state, DEC-070 alert identity/baseline, existing layouts/branding, semantic request/cancel rules and no proof persistence.
8. **Decisions:** U-07 cadence/quota contract; any new safe response revision or handoff-recovery projection requires accepted scope. Prefer client coordinator without expanding guest projection/version.
9. **Database:** NONE for client-only implementation under accepted existing projections. If recovery requires new server projection/contract, stop that sub-work for T1 ownership; do not assert a blanket no-migration guarantee for unaccepted auth changes.
10. **API:** consume accepted T1 auth and existing business contracts; parse Retry-After header (integer and valid date form where received), preserving safe body fallback. Invalid/malformed values get bounded backoff, never immediate busy retry.
11. **Client architecture:** one coordinator for initial/manual/poll/visibility/online/pageshow reads. One active read per client generation; manual refresh joins it or schedules one follow-up. Mutations invalidate prior read generation; discard their late snapshots and force one post-settlement read. Prevent a poll overtaking a mutation response. Do not compare lifecycle enums as monotonic numbers.
12. **Security:** terminal auth invalidation clears snapshot/proofs and stops mutations; current-client fences cover every async continuation, not just success. No offline mutation queue. UI eligibility never replaces server authorization.
13. **Privacy:** proof only in current mounted lifecycle; clear on abort/completion/auth replacement/expiry; no cache/telemetry of sensitive responses. SW exclusion uses explicit public assets, not merely presence of Authorization.
14. **Concurrency/idempotency:** one synchronous handoff issue/rotate/switch lock per client/session generation; old completions cannot restore material. Request/cancel share operation coordination, not separate uncoordinated locks. On ambiguous POST, authoritative read first; only user-confirmed safe next intent proceeds under the existing contract. Never replay an old request after cancel or old cancel after re-request.
15. **UI freeze:** UI-FROZEN SAFE DELTA only for stale/retry/rate-limit/ambiguity/error/loading/assistive semantics. Preserve screen geometry; use existing ScreenNetworkUnavailable, Btn and error-text styles. Zoom defaults and focus behavior are behavioral fixes, not restyling.
16. **Error/recovery:** typed controller states distinguish invalid access, offline/network, unavailable, rate-limited and ambiguous mutation. Propose read deadline 8s, mutation 12s including body parse, bounded jittered retry capped 30s after ordinary failures; never retry earlier than Retry-After. Proposed stale threshold 15s foreground; disable state-changing controls/proof display when freshness is untrusted, preserve last snapshot with notice, and revalidate after wake before actions. Final budgets align with T3 acceptance.
17. **Compatibility:** old and new API error payloads remain readable during rollout; no cookie-dependent caller activates before T1 server support. Preserve existing optional branding fallback.
18. **Deployment:** SW changes activate safely with already-open old pages; retain old hashed assets through approved compatibility window. Cache cleanup only touches this app's public-static caches, never shared auth state.
19. **Authorization-before-mutation proof:** browser coordinator requests no scope authority; server independently performs T1/feature proof. Every reconciliation read authenticates again. Cancelled client requests are recorded as unknown when appropriate, never locally authoritatively marked failed/succeeded.
20. **Tests:** mounted fake-timer and deferred-promise tests; all race matrix cases; initial and stale 429/503/body hang; old-client response; back/forward cache; online/visibility; Service Worker update/cache privacy; keyboard focus/zoom; screenshots EN/AR/light/dark; browser and physical Safari/Chrome lifecycle. Load/soak verify scheduler request envelope via T6.
21. **Commands:** C1/C2 and T6 browser command; network shaping/hang/reorder through an isolated test proxy, not mocked successful domain routes.
22. **Acceptance:** no lock survives its deadline plus cleanup allowance; no response before a later mutation can restore stale state; user sees temporary failure as temporary; no automatic unsafe POST replay; expired/consumed proof is not shown as usable.
23. **Done:** #196 reproduction is recorded or explicitly still unproven; tests cover mount/unmount, not only pure helpers; approved visual deltas only; CI and structure checks pass.
24. **Rollout:** staging network-fault matrix -> small cookie-compatible Guest cohort -> observe 429/stale/recovery/proof issue rates -> widen.
25. **Rollback:** last cookie-compatible client and SW; pause rollout if access-loss/unsafe state appears. Do not roll back to memory-only app for enrolled visits or clear all caches blindly.
26. **Risks:** mobile background timers cannot enforce wall-clock display updates while suspended; evaluate freshness immediately on resume. Cross-tab proof rotations still invalidate another tab's proof; use accepted non-secret invalidation hints plus server revalidation, never broadcast secrets.
27. **Owner blockers:** none for U-01..U-07. Any exact visible delta still requires the existing UI-FROZEN SAFE DELTA review. If already-issued/verified recovery needs new status data, freeze that narrow API before coding it.

### T3 — Durable anti-abuse and PostgreSQL runtime resilience

1. **Goal:** normal supported Guest use has quota headroom while abuse remains durably bounded and DB saturation produces finite, recoverable failures.
2. **Why:** F03/F09/F10; polling is a write-heavy authentication workload.
3. **Owned problems:** route-class budgets, pending-NAT bursts, limiter cleanup/churn, pool acquisition/query/lock/transaction deadlines and low-cardinality pool/security instrumentation.
4. **Out of scope:** weakening staff limits, memory-only limiters, unrestricted cleanup privileges, speculative Redis/queue infrastructure, domain-state changes.
5. **Dependencies:** MUST follow merged T1 authority/compatibility contracts and accepted U-07. T2 scheduler consumes this published budget; T4 deployment uses its capacity numbers.
6. **Likely modules:** anti-abuse key/service/client-address; all inventoried Guest controller adapters; neutral runtime database/observability; constrained cleanup SQL/runtime provisioning if approved; contracts/errors; anti-abuse/PostgreSQL tests. AntiAbuseService is exactly 300 lines: extract maintenance or focused enforcement responsibilities before adding code.
7. **Preserve:** DEC-024 cross-instance atomicity/HMAC/full-key lookup/DB time; DEC-025 TLS/role safety; existing staff and handoff attempt/issuance limits; no-store and generic denial.
8. **Decisions:** amend quota/window/scope and cleanup/reservation details through U-07. Keep exact rolling windows unless explicitly changed. No silent multiplication of quota via new endpoint namespaces or bearer/cookie adapters.
9. **Database:** conditional new scope CHECK entries and a bounded parameterless maintenance function through a forward migration; preserve cutoff older than the protected window. Consider a PENDING/COUNTED partial lookup index only after EXPLAIN evidence on representative data. Any bounded-counter/reservation replacement needs accepted schema and equivalence proof. No DROP/reset of active windows during deployment.
10. **API:** retain safe 429/503 and Retry-After; internal reason labels do not appear publicly. Aggregate all auth mechanisms under the approved abuse identity; unauthenticated random-token spray stays address-limited.
11. **Client:** no UI changes; publish machine-readable cooldown/deadline behavior to T2. Normal usage envelope includes tabs/manual/wake/reconciliation/payment/rating; proof generation remains separately tightly limited.
12. **Security:** authentication never proceeds without required durable reservation; authorized success finalization remains atomic with protected result. Size a separate bounded authenticated burst path only if approved; simply ignoring pending reservations would permit failure overshoot.
13. **Privacy:** HMAC identities only; no IP/token/verifier as metric labels. Runtime maintenance has execute-only constrained deletion and cannot choose current-window keys/cutoffs.
14. **Concurrency/idempotency:** test shared counters on two real API instances, crash after reserve, blocked advisory lock, cleanup-vs-count and credential rotation. Define reservations conservatively across process loss; do not infer orphan success. Preserve full-key predicates despite advisory collisions.
15. **UI freeze:** backend-only task; no Guest visual delta.
16. **Error/recovery:** propose initial budgets acquisition 500ms, lock 2s ceiling, statement 3s, full Guest transaction 5s, API operation 6s, proxy 7s; align T2 read 8s/mutation 12s. Query timeout alone does not ensure DB cancellation: rollback/release or destroy a tainted connection and prove server work terminates. Use supported PostgreSQL mechanisms for deployed version; do not assume a newer transaction_timeout exists. Set idle-in-transaction timeout and app transaction budget; preserve finite retries only for proven safe reads.
17. **Compatibility:** preserve old limiter namespaces/windows through migration overlap; dual mechanism must not double quota. Staged rollout cannot mix enforcement policies that bypass limits.
18. **Deployment:** pool cap per instance derived from `(DB allowed connections - admin/maintenance/other-service reserve) / max simultaneous API instances`, including rollout surge. Recommend bounded admission/backpressure before unbounded pool queue growth. Confirm actual DB role settings rather than relying only on code defaults; [node-postgres Pool](https://node-postgres.com/apis/pool) documents max=10 and connectionTimeoutMillis=0 defaults.
19. **Authorization-before-mutation proof:** limiter rows are security accounting, not domain writes. Reserve/check before secret validity disclosure; after persisted Guest scope authorization, finalization and feature writes share transaction. Maintenance authenticates its runtime/maintenance privilege and uses fixed DB-time retention policy before deletion.
20. **Tests:** unit budgets/error mapping; PostgreSQL two-instance thresholds, restart/PENDING and role privileges; real blocked lock/DB connection exhaustion/statement cancellation; per-class load and 8h/26h soak; NAT 100/500/1000 with synchronized wakeups; auth abuse alongside valid traffic. Browser T2 verifies cooldown integration; physical proof in T6.
21. **Commands:** C2/C3; T6 capacity lane only in isolated/staging environments, with explicit DB confirmation. Existing `capacity:baseline` seeds staff fixtures and is not a safe read-only Guest test.
22. **Acceptance:** zero unexpected 429 for approved legitimate envelope, hostile thresholds stay enforced across instances/restarts, finite DB/API deadline behavior, no leaked connection/transaction, bounded cleanup backlog and load gates below pass.
23. **Done:** accepted policy/docs/SQL/runtime grants synchronized, no staff regression, query plans and pool budget recorded, migration/CI proof and cross-review complete.
24. **Rollout:** compatible SQL/functions -> server enforcement everywhere -> published budget -> T2 client cadence. Observe old/new traffic before retiring old support; do not rotate HMAC secrets during rollout.
25. **Rollback:** revert scheduler/enforcement only to a compatible policy that still accommodates active clients; stop cohort expansion first. Retain forward schema and safe cleanup; never truncate counters or fail open to restore availability.
26. **Risks:** per-NAT contention, cleanup vacuum/WAL pressure, DB deadline cancellation bugs, multiplied pools during deploy and proof throttling obscured by general request metrics.
27. **Owner blockers:** none for U-07/U-09. Any material departure from the accepted split-budget/adaptive-cadence or availability envelope requires a new Owner decision.

### T4 — Deployment, proxy identity, availability and observability

1. **Goal:** prove the real HTTPS request path and recover through restart/failure without destroying active access.
2. **Why:** F11 and unverified #224/#227/proxy/HA conditions cannot be solved by client tests.
3. **Owned problems:** canonical origins, trusted forwarding, private/direct ingress boundaries, health/readiness/drain, replica topology, immutable releases/static assets, metrics/alerts and backup/recovery evidence.
4. **Out of scope:** multi-region, Kubernetes, provider selection by guess, app UX redesign, mobile binary construction as part of this audit/program slice.
5. **Dependencies:** read-only topology inventory can begin early; implementation/canary MUST follow merged T1/T3 and approved U-09. Client canary follows merged T2.
6. **Likely modules:** infra/systemd and deployment docs; Customer next.config/API origin/build/start scripts; API main/app health and neutral database/observability; ingress configuration owned by operator; CI production-artifact checks.
7. **Preserve:** fail-closed production config, real origin distinction, DEC-025 runtime/migration credential separation and existing shutdown hooks. `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN` is Employee Web sharing config; Native uses `EXPO_PUBLIC_CUSTOMER_APP_ORIGIN`; Customer server uses API_ORIGIN.
8. **Decisions:** U-09 exact host/process/container topology, failure domains, SLO/RTO/RPO, log retention; approved security headers/health transport. Reconcile deployment artifacts with stack guidance before selecting implementation.
9. **Database:** NONE for ordinary health/metrics/config; DB infrastructure backup/HA changes are operator-owned. Any DB-function/schema requirement is coordinated with T1/T3, never added ad hoc.
10. **API:** separate dependency-free liveness from bounded readiness checking DB reachability and required auth/limiter capability/config. Readiness must not create credentials or consume ordinary Guest quotas. Public responses contain no secret/config details.
11. **Client:** no new process-local session data. Test Next preserving Cookie/Set-Cookie, Origin, request IDs and no-store through rewrites; if rewrite behavior cannot satisfy the accepted contract, use a narrowly scoped same-origin proxy adapter without moving domain auth into Next.
12. **Security:** explicit CIDRs and trusted chain, public ingress strips spoofed identity headers, API private path inaccessible directly, Native public ingress separately authenticated. Exact origin allowlist must use public Customer origin, not blindly supplied Host/X-Forwarded-Host.
13. **Privacy:** redact auth/Set-Cookie/proofs/fragments at edge, tunnel, Next, API, APM and browser error collectors; sample safe operation labels only. No raw URI/body dumps in failure logs or E2E artifacts.
14. **Concurrency/idempotency:** no sticky authentication; requests may hit any healthy instance. Shutdown withdraws readiness then drains in-flight requests within budget before closing shared pool. Hard kill/OOM has no cleanup assumption; clients reconcile committed unknown outcomes.
15. **UI freeze:** no visual changes. Temporary outage state uses T2 approved primitives only.
16. **Error/recovery:** deadlines compose from DB outward; health fails fast; load balancer stops new traffic to unready nodes. Preserve prior assets for open pages and cookies across rolling releases; no forced logout on ordinary restart.
17. **Compatibility:** immutable release directories/artifacts and N/N-1 compatible API/auth/schema; validate build-time API_ORIGIN in Next rewrite output, not only systemd runtime env. Rollback artifact must be cookie-compatible.
18. **Deployment:** inventory actual Cloudflare/tunnel/LB/API listeners and owners; prove loopback binding and route separation. If U-09 HA option accepted, test two Customer/two API instances without stickiness and managed DB failover. A systemd Restart=always service alone is not HA.
19. **Authorization-before-mutation proof:** deployment operator uses controlled credentials; migrations run only through isolated migration authority. Probes are read-only. Production smoke writes require approved synthetic scope and ordinary staff/Guest auth, never privileged bypass URLs.
20. **Tests:** config/unit; real production-mode staging build/stack; proxy spoofing/malformed chain; same NAT/distinct addresses; two replica restarts, graceful drain and SIGKILL; DB failover; cookie/CSRF cross-origin checks; alert injection; 8h staging soak; physical generated-link proof.
21. **Commands:** C4; actual operator deployment commands recorded in environment-specific runbook. `pnpm build` is verification build and does not substitute for `pnpm build:production` with real inherited inputs.
22. **Acceptance:** #224 actual origin/QR path and #227 build evidence, exact identity chain proof, readiness removes bad nodes, no access loss on app restart, approved recovery targets and alert tests pass.
23. **Done:** dashboard/runbook/on-call owner, rollback drill, backup restore evidence and non-secret configuration source attached; remote CI evidence distinguished from local command evidence.
24. **Rollout:** preflight staging -> migrations/compatible API -> Customer canary -> 5%,25%,100% or equivalent site cohorts after one complete peak period at each agreed stage. Rollout percentages/time gates require operator approval; no automatic widening on missing telemetry.
25. **Rollback:** route traffic to last healthy compatible release; keep DB additive; stop new enrollment if needed without disabling existing auth. If DB restore is necessary, explicitly account for credential generation/revocation and operational history loss under accepted RPO; do not silently revive revoked credentials.
26. **Risks:** shared-host/tunnel single points, build/runtime origin mismatch, CDN cache of Set-Cookie/private responses, proxy retry of POST, unknown DB failover behavior.
27. **Owner blockers:** truthful environment inputs and access to infrastructure evidence; all untested items remain REQUIRES RUNTIME / PHYSICAL PROOF.

### T5 — Bounded Guest product completion and operational recovery

1. **Goal:** complete the explicitly selected pilot surfaces, required background Guest notification, and Native recovery without claiming previews/providers are production features.
2. **Why:** F12/#219 and product matrix distinguish core access from optional commercial scope.
3. **Owned problems:** contextual Native Guest reissue during handoff; required reliable Guest background/closed-app notification for READY and other explicitly approved Guest notification events; approved payment projection/tip/rating wiring; truthful help/receipt availability; issue closure evidence packet.
4. **Out of scope:** Guest account system, automatic Guest Access link delivery through WhatsApp/SMS, wholesale unrelated messaging-provider expansion, full incident/claim flow, Employee Web #219 expansion, new Guest navigation design.
5. **Dependencies:** MUST follow merged T1/T2/T3/T4 and U-08; post-completion rating depends on U-06 and the T1 privileged SQL path. Selected paid/provider work cannot start without its own focused accepted sub-contract.
6. **Likely modules:** Native handoff panel/pending and existing native-guest-access-session/credential-memory; employee-client guest access; Customer notification/service-worker/runtime paths plus deferred screens/API client/completed view; API existing notification/rating/payment projections; focused shared contracts only if approved; issue evidence docs.
7. **Preserve:** same ValetSession/Task/request; old generation invalidation; secure proof/release; DEC-051 tips/currency authority, DEC-057 financial release, DEC-091 immutable rating, DEC-085 branding. Staff issue authorization remains existing roles, not assumed role hierarchy.
8. **Decisions:** U-08 feature boundary is accepted: background Guest notification is required for first launch; automatic WhatsApp/SMS Guest Access delivery is deferred separately. Receipt/help source and any concrete notification transport/provider contract must be selected consistently with existing notification decisions without changing the accepted scope. No invented Guest report endpoint or use of staff incident credentials.
9. **Database:** NONE for wiring existing projections/tips/rating after T1 compatibility. Any new provider/receipt/report persistence is explicitly unresolved and outside this slice until approved; it must not be hidden as UI integration.
10. **API:** reuse inventory routes and strict shared schemas; add Customer methods only for selected features. Never treat current projection as authority for release or supply tenant IDs. Existing payment path ID must match authenticated visit.
11. **Client:** Native re-present only an actually held fresh credential; otherwise explicit rotate/reissue, refresh persisted access projection after ambiguous outcomes, display QR/Copy Link transiently. Guest features use T2 coordinator and accepted post-visit scope; no preview fixture data in live mode.
12. **Security:** recovery never verifies/consumes handoff or releases vehicle. Rating is Guest-only; tip and financial actions retain precollection guards; no raw card handling. Help links must be approved/truthful destinations.
13. **Privacy:** no copied auth in persistent clipboard history claims, analytics, offline queues or logs; existing Native privacy clearing remains. Sharing reveals only the intended fresh URL at the trusted boundary, never hashes/internal authority.
14. **Concurrency/idempotency:** Native duplicate-click lock and ambiguous issue reconciliation; late issuance response must not be represented as current without authoritative generation proof. Rating exact same value retry returns existing result; changed value conflicts. Tip absolute-value replay reconciles against current collection state; do not replay after collection/policy changed.
15. **UI freeze:** every newly enabled Guest surface/entry point needs a specific UI-FROZEN SAFE DELTA; reuse existing premium screen primitives and layouts. Native uses existing EN/AR handoff language and minimal contextual recovery.
16. **Error/recovery:** no fake sent/paid/rated/report-submitted states. Unknown provider/payment outcome remains unknown until canonical reconciliation; Guest Access reissue response loss does not trigger automatic repeated rotation.
17. **Compatibility:** feature availability guarded by actual backend capability and approved pilot configuration; old clients remain supported. Hidden unimplemented surfaces stay hidden unless approved wiring is ready.
18. **Deployment:** the required background-notification transport needs real production configuration/credentials/evidence before first launch; it cannot be replaced by foreground audio or a simulated success state. Unselected WhatsApp/SMS Guest Access delivery remains disabled/deferred. Payment-disabled pilot must not enable release-requires-payment with no operational collection route.
19. **Authorization-before-mutation proof:** staff principal -> persisted visit -> active User/member/org/location/access and current issue-role proof -> session lock/recheck -> rotate/revoke -> safe audit -> commit. Guest rating/tip -> T1 credential/visit proof -> feature constraints/locks -> write immutable rating or guarded Payment change -> required existing history -> commit. All retry/fallback reads reauthorize.
20. **Tests:** Native unit/controller recovery; backend exact-scope/concurrency/atomicity; Guest browser real projection/rating/tip paths where selected; two-principal payment/rating negatives; required background-notification delivery/dedupe/permission/failure/recovery tests; physical lost/expired/revoked access at handoff, no release without proof; visual/i18n; real-device notification proof with app/browser backgrounded or closed as supported by the chosen transport.
21. **Commands:** C1/C2/C3 plus existing Native package test/typecheck scripts and T6 journey. Physical proof uses a separately approved real release/dev build; this planning task builds no binaries.
22. **Acceptance:** #219 same visit restored, old generation denied, no duplicate work or bypass; required Guest background notification is delivered/deduped and physically proven for the supported first-launch browser/PWA/device matrix; every enabled surface is backed by authoritative data; every excluded pilot surface is documented and not advertised as functional.
23. **Done:** Owner-approved pilot matrix, required background notification evidence, completed evidence per selected feature, no unreviewed UI delta; CI/cross-review and physical recovery pass. Issue closure is a later human-reviewed action, not automatic from code merge.
24. **Rollout:** enable recovery first, then selected read surfaces, then each selected mutation after backend compatibility; one capability at a time with telemetry.
25. **Rollback:** disable new feature entry points while preserving prior auth and existing backend records; keep Native recovery available through last safe implementation. Never delete ratings/payment/audit records or bypass release to compensate.
26. **Risks:** notification transport/browser support differences, scope expansion into unrelated commercial providers, confused completion auth, late reissue response holding stale link, acceptance mistakenly inferred from dev previews.
27. **Owner blockers:** none for U-06/U-08. Exact UI deltas still require UI-FROZEN SAFE DELTA review; missing notification production configuration blocks first launch, while missing deferred WhatsApp/SMS delivery does not.

### T6 — Guest browser E2E, load, physical and production readiness gate

1. **Goal:** produce reproducible evidence that the selected journey and approved capacity survive real failures.
2. **Why:** F13 and runtime proof gaps remain even when unit suites pass.
3. **Owned problems:** real Guest CI lane, capacity harness/workload, visual/physical matrix, privacy-safe artifacts, release evidence and go/no-go.
4. **Out of scope:** using mocks for successful core routes, production load without operator approval, arbitrary capacity claims, closing issues or merging merely because tests pass.
5. **Dependencies:** test design may start earlier; final qualification MUST wait until T1-T5 selected slices are merged and deployed to the intended staging topology. Changed code after qualification invalidates affected evidence.
6. **Likely modules:** `.github/workflows/ci.yml`, Customer test/E2E tooling, existing Playwright tooling ownership, API test fixtures/capacity helpers and evidence docs. Reuse installed repository tooling; any new dependency requires a later implementation approval.
7. **Preserve:** real migrations/runtime role, ordinary staff/Guest auth, canonical lifecycle, secret-free artifacts, UI freeze and test DB guardrails.
8. **Decisions:** U-09 target envelope/SLO and U-08 pilot matrix are accepted; assign release evidence owner and human sign-off.
9. **Database:** NONE for test lane itself; disposable test fixtures apply real versioned migrations, never schema push as migration proof. No production fixture/reset command.
10. **API:** exercise generated URLs and real Guest/staff operations. Fault injection may drop/delay/reorder network responses; success paths must hit the real API/DB.
11. **Client:** production build and service worker exercised; browser contexts reproduce reload/tabs/storage jars; no test-only persistent token restore in success path.
12. **Security:** two distinct principals/tenants and two sessions in one tenant for object authorization; old rotated/expired/revoked credentials and foreign Origin fail without data/mutation. Validate anti-abuse under actual proxies.
13. **Privacy:** screenshots/traces/HAR/logs must redact generated URLs, Cookie/Set-Cookie/Authorization and proof material. Prefer synthetic data and programmatic assertions; do not upload unrestricted auth bootstrap traces as CI artifacts.
14. **Concurrency/idempotency:** real overlapping transactions, dropped successful responses and crash after commit; count persisted domain/history rows. Correctness requires coherent winner or rollback, not merely matching HTTP status.
15. **UI freeze:** canonical screenshot matrix with identical fixtures; default no visual difference, exact approved delta list only. Accessibility and language checks are functional gates.
16. **Error/recovery:** induce 429/503/offline/slow body/DB pressure and actual SIGTERM/SIGKILL of Customer/API, then verify bounded return and no auth loss. Graceful shutdown tests do not stand in for hard crash tests.
17. **Compatibility:** old page/new API, new page/compatible old API, old SW/new assets, pre-migration upgrade data and rollback floor all tested.
18. **Deployment:** separate local capacity qualification, staging qualification and production observation. Only operator-approved synthetic low-impact smoke/canary in production; no stress/chaos by default.
19. **Authorization-before-mutation proof:** fixtures target confirmed disposable DB; journey uses staff issue then exact Guest scope; assert unauthorized requests leave protected rows/history untouched. Verification queries are controlled test-only evidence, never app bypass.
20. **Tests:** execute full checklist and numerical capacity gates below, including unit/integration/PostgreSQL/browser/race/security/load/soak/physical categories; no category silently waived.
21. **Commands:** C1-C4 plus future Guest E2E/load scripts introduced by this task. Script names and safety flags must be documented when implemented; no nonexistent command is presented as runnable now.
22. **Acceptance:** every required gate has a linked report with commit/environment/time/workload/result and no unexplained failures; zero access-loss/duplicate/security events; approved latency/error/recovery thresholds met.
23. **Done:** remote required CI passes, staging/physical/failure evidence reviewed, rollback rehearsed, production observation owner assigned; **Production readiness MUST NOT be claimed until every required gate has evidence.**
24. **Rollout:** qualify local -> stage cohorts -> 8h and 26h soak -> physical -> operator canary -> controlled expansion and observation; stop immediately on correctness/security violations.
25. **Rollback:** invoke T4 compatible release procedure; preserve evidence, reconcile ambiguous domain outcomes, repeat affected qualification after repair. Never lower thresholds after a failing run without explicit Owner decision and recorded rationale.
26. **Risks:** correlated NAT load, false success from mocks, missed mobile suspension, test trace secret leaks, synthetic traffic unlike real staffing/visit duration.
27. **Owner blockers:** real device/environment availability and reviewer sign-off. Missing evidence means NOT READY, not a silent pass.

## 12. Cross-Task Security Invariants

### Binding requirements

- Authority order: latest Owner instruction, Accepted focused DEC/full contract plus canonical log, Blueprint bridge, binding product/domain/schema/state/security/process docs. This plan records Owner acceptance of U-01..U-09; T1 must synchronize those decisions into the binding focused decision/contract surfaces before dependent implementation.
- Affected entities: ValetSession, existing Guest credential fields; conditional new Guest Browser Session; anti_abuse_events; RetrievalRequest, Task, DispatchEvent, HandoffVerification, KeyCustodyEvent, AuditEvent; read/approved mutation consumers Payment, Validation, Refund and GuestRating. Organization/Location derive from persisted scope. Guest is not staff membership and nullable Customer attribution is valid.
- Existing transitions remain: `PARKED -> REQUESTED`, pre-start `REQUESTED -> PARKED`; staff `REQUESTED -> RETRIEVING -> READY -> HANDOFF_PENDING -> COMPLETED`, and authorized `HANDOFF_PENDING -> READY` abort. Authentication recovery causes **none** of these transitions.
- Task/request transitions remain separate: request creates OPEN + QUEUED; cancellation terminalizes OPEN and eligible pre-start Task; start yields ACCEPTED + IN_PROGRESS; release completes both. No generic state endpoint, duplicate active retrieval, or manufactured staff/Customer identity.
- DEC-042/043 secure proof, current policy and Task owner guards remain; DEC-057 financial-release guard remains. No recovery, cookie, notification, timeout or payment UI success authorizes release.
- Protected mutation/history are atomic; operational history is not deleted. Existing partial unique indexes on active RetrievalRequest and active `(ValetSession,task_type)` are retained. No speculative handoff index or schema rewrite.
- DEC-024 durable cross-instance, fail-closed, HMAC identity and no-store privacy requirements remain until an explicit amendment. DEC-025 TLS, non-owner runtime role and isolated migration credentials remain.
- Typed Company default -> Location override continues for handoff, financial, notifications and branding. Browser security/runtime limits are deployment security policy unless an Accepted decision explicitly makes them customer-configurable; no catch-all JSON settings object.
- Approved MVP scope only. No accounts/passwords for Guests, tracking expansion, new framework, message bus, Redis, microservices, hardware, Kubernetes or multi-region system by implication.

### LOCKED decisions

| Proposition | Classification | Authority |
| --- | --- | --- |
| Current fragment bearer is memory-only and reload loss is intentional | LOCKED | DEC-064; must be explicitly amended before persistent browser auth |
| Guest request and cancel are exact-session commands with coherent semantic retries and shared quotas | LOCKED | DEC-040, DEC-044 |
| Secure handoff uses current allowed method, bounded expiry/attempts and atomic proof/custody release | LOCKED | DEC-042, DEC-043, composed DEC-057 |
| Durable limiter enforcement and trusted forwarding chain are required | LOCKED | DEC-024 canonical log and implementation |
| Foreground polling/ready identity are current MVP transport | LOCKED | DEC-070; a cadence/transport policy change must be reconciled |
| Rating is one immutable 1-5 value for an authorized completed visit; exact retry succeeds, changed rating conflicts | LOCKED | DEC-091 and migration 42 |
| Guest branding derives from persisted visit scope | LOCKED | DEC-085 and #239 implementation |
| UI design stays frozen throughout this program | LOCKED | Owner's current task instruction |

### Risks / boundary violations

- **REQUIRES RUNTIME / PHYSICAL PROOF:** actual Cloudflare -> Customer Next -> API forwarding chain. `TrustedClientAddressResolver` correctly walks trusted hops from the right and ignores forwarding headers from untrusted peers. Empty trusted CIDRs in `.env.example` plus loopback API rewrite can collapse identity if copied unchanged; it is not proof that production is misconfigured. Pin real CIDRs, overwrite client-supplied headers at ingress, verify all-trusted/missing/duplicate/malformed chains fail closed, and prove direct API access cannot forge a proxy path. Preserve separately required Native ingress.
- **REQUIRES RUNTIME / PHYSICAL PROOF:** actual DB role settings, network TLS, max connections, CPU/WAL/storage, external health checks, load balancer drain, systemd/container identity and HA. Repository `/` cannot certify these.
- Anti-abuse key rotation must not reset active windows or split instances. Shared DB availability is a security dependency; do not fail open during saturation.
- Rollback to bearer-only code after consuming bootstraps and establishing cookie sessions would strand Guests. The rollback floor must retain cookie resolution for already-enrolled visits, including privileged rating authorization.
- Revocation, cancellation, completion and browser renewal must share a serialization/guard contract. A check outside the business transaction is insufficient if invalidation can win before the write. Accept lock order before implementation to avoid auth-session/session deadlocks.
- Browser cancellation cannot prove server rollback. A delayed old cancel can cancel a **new** requested lifecycle because current request/cancel bodies carry no lifecycle identity. Preserve accepted semantic retries, but never automatically replay them across cancellation/re-request boundaries. Any stronger intent identity needs an explicit DEC-040/044 amendment.
- Proof rotation is not an idempotent read. Hash-only storage cannot reproduce a lost raw proof. On ambiguous rotation, re-read canonical state, stop displaying possibly consumed material, and use the approved recovery path only.
- Latest Owner intent now fixes U-01..U-09 for this program. This is not a contradiction between two Accepted sources; T1 must amend/synchronize the affected binding decisions before dependent production code. Current Accepted behavior remains binding until that synchronization lands.

## 13. Cross-Task UI Freeze Rules

Section 4 applies to all six tasks, including tests, product wiring and deployment recovery. A task cannot use a new auth model, provider or error taxonomy to justify redesign. Record each UI-FROZEN SAFE DELTA with its exact state, existing component, copy/control, approval and same-viewport EN/AR screenshots. Normal successful-screen comparisons must remain unchanged. Hidden-feature enablement is separately gated by U-08; unselected previews must not advertise live completion.

## 14. Database / API Compatibility Strategy

T1 owns additive auth schema and forward privileged rating authorization, conditional on U-01..U-06. T3 follows with accepted limiter changes. Preserve least-privilege runtime grants, old valid unexchanged cohorts and current business endpoints. Deploy compatible readers to every API instance before any client consumes a bootstrap; reject mixed or obsolete authority without bearer fallback. Test old/new clients against mixed compatible server versions and upgraded persisted state. No application-only cookie shim can bypass rating SQL authorization. Do not remove legacy support or schema until active cohorts drain under the accepted lifetime policy and recovery evidence exists.

### Files expected to change

This planning commit intentionally changes **only this Markdown file**. Conditional future areas are listed per task; they do not authorize unrelated changes.

Structure preflight at baseline: GuestAppRoot 291 lines; GuestSessionProvider 213; useHandoff 102; GuestApiClient 163; GuestAccessController file 263; guest-access-command 437 (legacy); AntiAbuseService 300; postgres.ts 216. T1/T2/T3 must extract focused responsibilities before growing near-limit/legacy files.

New authored implementation/test/tooling files <=300 physical lines; existing legacy >300 files must not grow. No compressed formatting to evade rules.

T1 conditionally owns new auth SQL, `docs/03_DATABASE_SCHEMA.md`, relevant focused DEC/log/security docs and runtime privilege fixtures. T3 owns limiter SQL/runtime changes only after T1 merges. T2 owns Customer controllers and minimal approved presentation behavior. T4 owns deployment/health/metrics; T5 owns selected feature and Native recovery integration; T6 owns test/CI/evidence. Coordinate high-contention schema/contracts/CI/decision files explicitly.

### Test matrix

Every retry after success, failed attempt, lost response or rollback must re-prove current credential ownership and authorized persisted visit scope before returning protected state. Database-authoritative commit is the linearization point for effects. If the competing transaction rolls back, the waiting operation re-evaluates persisted state; timeout/disconnect is an unknown result until reauthorization/reconciliation. No table uniqueness constraint alone defines an HTTP replay contract.

| Operation | First / identical retry / concurrent identical | Conflicting race / late retry / changed payload | Protection and owner |
| --- | --- | --- | --- |
| Browser enrollment/exchange (conditional) | U-02 must define one binding and same-browser lost-response recovery; foreign browser must not inherit it | Consume vs staff revoke/reissue; cookie already belongs to another visit; token consumed but response lost | T1 accepted generation/session/enrollment lock or guarded-write contract; prove authorization before binding. Commit/rollback and response loss separately tested. |
| Browser renew/rotate/logout (conditional) | U-04/U-05 govern overlap and renewal; no poll-driven uncontrolled rotation | Logout/revoke/completion vs renew; out-of-order Set-Cookie must not restore revoked authority | T1 server generation check on every use; DB-authoritative expiry; client generation fence. Exact statuses remain decision-dependent. |
| Staff issue/reissue/revoke | Existing issue/rotate returns fresh secret once; repeated issue can rotate again. Revoke is idempotent; REISSUE_REVOKED requires matching expectedRevokedAt | Concurrent issuance has one final current hash; late response may hold obsolete secret. Revoke vs ordinary rotate cannot silently reactivate revoked access | Existing `authorizeAndLockSession` and atomic audit; T1 extends browser-generation handling, T5 reconciles before sharing; no automatic staff POST retry. |
| Request retrieval | PARKED creates one OPEN request/QUEUED task/history; coherent repeated REQUESTED/later progression is non-mutating | Cancel vs request can create a legitimate new lifecycle after PARKED; a late transport retry must not masquerade as new intent | DEC-040 session lock, active uniqueness indexes, atomic dispatch/audit/push intent. T2 reads first after unknown; user explicitly initiates new work. |
| Cancel retrieval | REQUESTED/pre-start cancels once; coherent just-cancelled PARKED retry is non-mutating | Start wins -> cancellation denied; cancellation wins -> start denied. New request then late old cancel can target new lifecycle; prohibit blind replay | DEC-044 session/request/task locks and versioned writes; T2 coordinator, T6 real race. Stronger lifecycle intent identity requires a new decision. |
| Issue handoff | HANDOFF_PENDING with no unconsumed proof issues once; repeat rejects ALREADY_ISSUED; no plaintext replay | Concurrent issue -> one accepted material; process/browser loss after issue requires controlled recovery | DEC-042 session lock; T2 single-flight, clear material, reconcile; no automatic issue loop. |
| Rotate/switch handoff | Unverified current proof consumed and replacement issued; repeats are new rotations, not idempotent | Rotation vs verification: if verified wins, rotate cannot replace; if rotate wins, old proof fails. Abort/release invalidate pending browser responses | Existing session serialization, HMAC/expiry/attempt rules, 5/15m issuance; T2 identity/lifecycle fence. Never auto-switch through methods until one works. |
| Staff verify/abort/release | Current Task owner/supervisor exception per DEC; release consumes proof and completes once | Stale versions/replay denied; verify vs abort/override and release vs abort have coherent winner. Financial policy/collection races participate in release locks | Preserve DEC-042/043/057 and real `handoff-proof-concurrency`, completion atomicity suites. Browser access recovery grants none of these effects. |
| Guest tip | Absolute amount update under current precollection/payment constraints; current truth re-read after unknown | Concurrent tip/collection or changed tip intent must not overwrite committed collection | Existing Payment mutation transaction, T5 integration; preserve currency minor-unit validation and audit. No generic retry engine. |
| Guest rating | One immutable value per completed visit; identical retry returns existing value/time | Concurrent equal values yield one row; different value conflicts; auth revoke/completion expiry rechecked, no staff authoring | DEC-091, privileged SQL and session lock, unique visit PK/immutable trigger; T1 compatible auth SQL and T5 UI. |

For all protected operations: authenticate -> persisted target/scope -> operation-specific authorization -> accepted locks/recheck -> mutation -> required history -> commit. Anti-abuse accounting may precede credential validity but does not authorize domain mutation. Exact staff operation authority is not inferred from a role name; current accepted User/membership/org/location/access/Shift/Task requirements apply per command. Reconciliation does not expose another visit by supplied UUID.

## 15. Guest Browser E2E Strategy

- [ ] Fresh disposable PostgreSQL applies **versioned migrations** and least-privilege runtime provisioning; API/Customer start in production mode behind representative same-origin proxy.
- [ ] Staff ordinary authenticated UI/API creates or obtains Guest Access for a real test visit; use the **actual generated URL**, not test-injected token context.
- [ ] Browser opens URL; exact fragment is scrubbed, no secret remains in address bar/history entry or telemetry; bootstrap/exchange succeeds under accepted T1 architecture.
- [ ] Authorized snapshot loads; full reload, clean reopen and duplicated tab preserve the same visit per U-03/U-05; raw original bearer is absent from Web Storage/IndexedDB/SW cache.
- [ ] Request Vehicle creates exactly one request/task/audit/dispatch set; duplicate taps, dropped response and concurrent reads do not regress UI or create duplicates.
- [ ] Cancellation and cancel-vs-start leave coherent persistence; a new intentional request preserves old cancelled history.
- [ ] Real staff dispatch/start/ready commands reach READY with correct custody/tracking behavior; ready alert obeys effective policy/dedupe.
- [ ] Staff initiates HANDOFF_PENDING; Guest issues real allowed PIN/QR; authorized staff verifies; final release requires valid proof plus financial guard and reaches COMPLETED.
- [ ] Test alternate permitted method, disallowed policy, expiry, fifth invalid attempt, rotate-vs-verify, abort/re-entry and lost proof response.
- [ ] Reload/reopen during handoff uses approved proof recovery without revealing stored plaintext or rotating verified material.
- [ ] Required first-launch background/closed-app Guest notification is delivered, deduped, privacy-safe and recoverable on the supported browser/PWA/device matrix; foreground audio alone does not satisfy this gate.
- [ ] Selected rating/payment/receipt operations work through actual backend contracts; payment-disabled pilot proves those unavailable paths make no false success claim.
- [ ] Invalid, expired, revoked, rotated-old and consumed bootstrap links fail safely; no foreign session data, no auth fallback that resurrects old access.
- [ ] Cookie CSRF: foreign/null/missing Origin, malformed/duplicate cookies, bearer-cookie conflict, login/session-swap, cross-origin requests and forged forwarding chain denied as accepted.
- [ ] Two tenants and two same-tenant visits cannot read/mutate one another's payment/rating/retrieval; unauthorized attempts leave domain/history rows unchanged.
- [ ] Network offline, slow headers/body, malformed success body, 429/Retry-After, 503, dropped committed POST and reconnect produce the correct finite state.
- [ ] Real Customer/API graceful restart and hard kill, DB pressure and staging failover recover without unexpected Guest 401/403 or duplicate action.
- [ ] EN/AR, RTL/LTR code isolation, light/dark/effective branding, keyboard, screen reader, zoom and exact approved visual-delta screenshots pass.
- [ ] Old page/SW across rolling deploy and rollback retains valid assets/auth. SW never caches auth/session/proof/payment/receipt/rating responses.
- [ ] CI artifact privacy is verified and the new Guest lane is included in the required `quality` aggregate; record actual remote run URL and commit.

Main E2E success must not mock Guest core backend routes. Mocked deterministic unit faults supplement, but do not replace, real network/process failure proof.

## 16. Load / Capacity / Soak Strategy

Proposed qualification gates below require U-09 acceptance. They are engineering targets, not measured results. Fix environment inventory per run: CPU/RAM/instances, DB version/class/storage/max connections, pool caps, ingress/tunnel/CDN, commit/build, RTT, TLS and traffic generator placement. Existing staff-focused capacity tooling is reusable only after Guest workload adaptation and safety review.

At each **100 -> 500 -> 1000** active-Guest cohort: 5-minute warmup, 30-minute steady run, 5-minute cooldown; do not advance after failure. Use independent visits across several locations/tenants, randomized start phases, 70% foreground/30% hidden plus an all-foreground worst-case run. Include two tabs for 10% of visits and enforce the accepted tab envelope. Worst-case legacy five-second cadence offers 20/100/200 reads per second before extra operations; new cadence reports its actual request budget rather than hiding reduced work.

Workload per 15-minute block: foreground/session reads; 10% foreground returns in a 10-second burst; 10% manual refresh; 10% request vehicle in a 10-second burst; 20% of those cancel before start; staff transitions remaining requests through RETRIEVING/READY/HANDOFF_PENDING; issue one proof and rotate once on 10% of handoffs; complete and, where selected, read payment and submit rating. Replace completed visits with new independently issued visits to maintain cohort size. Add separate adversarial duplicate/race cases without treating them as ordinary usage.

Repeat with distributed client identities and **all Guests behind one hotel NAT**, including synchronized wakeups and two-tab load. Run an independent invalid-token attack cohort; report expected hostile 429 separately from legitimate 429. During failure windows restart one API, one Customer, hard-kill one instance, inject DB connection/lock pressure and temporary network loss; maintain the workload and reconcile each uncertain mutation.

At the highest passing target run **8-hour full-shift soak** and **26-hour active-visit continuity soak** (at approved representative cohort), with at least one visit left active across the old 24h boundary, hidden periods and a restart. Higher target: multiply passing cohort by 1.5 or 2, re-budget DB connections/storage and run the same gates; stop on resource/error/correctness limits. A higher target is separately approved, never inferred by linear extrapolation.

| Metric | Proposed passing gate |
| --- | --- |
| Unexpected HTTP 5xx/network/deadline failures, steady state | <=0.1% overall and per core route; no sustained 1-minute interval >1% |
| Unexpected 401/403, legitimate 429, access-loss incidents | **0** within approved active-visit/tab/lifetime envelope; expected revoked/expired/attack responses excluded and reported separately |
| Duplicate domain mutation/history or unauthorized disclosure | **0**; inspect request/task/session/proof/audit/dispatch effects, not only HTTP success |
| Read latency p50/p95/p99 | <=200ms / 500ms / 1000ms measured through Customer ingress in staging |
| Mutation latency p50/p95/p99 | <=300ms / 1000ms / 2000ms, excluding external-provider asynchronous completion; report separately |
| DB acquisition wait p95/p99 | <=50ms / 200ms steady; finite <=accepted 500ms acquisition budget under induced exhaustion |
| DB lock wait p95/p99 | <=50ms / 250ms steady; zero deadlocks in legitimate workload; induced contention terminates within accepted timeout |
| Limiter churn/retention | Record inserts/updates/deletes/WAL bytes per successful read; no cleanup backlog older than 2h after recovery, no monotonic retained-row/dead-tuple growth after steady retention horizon; cleanup p99 <=500ms target |
| Stale display bound | Notice/actions gated within 15s since last authoritative foreground snapshot or immediately upon stale resume |
| Reconnect/canonical state recovery | p95 <=10s, p99 <=30s after reachability restored, except explicit still-valid Retry-After; report cooldown separately |
| Instance failure | <=approved 30s recovery, no credential loss; any in-flight mutation reconciled with zero duplicate business effect |
| DB failover | <=approved 120s recovery with explicit outage state and zero fabricated success; RPO/credential-revocation safety separately proven |
| CPU/memory | <=70% sustained CPU target per app instance, no 5-minute saturation >85%; warmed RSS change <10% between final two comparable steady hours, no unbounded queues/connections |
| Soak | 8h and 26h complete with the above correctness gates, stable pool/retention/memory trend, no unexpected visit expiry |

Treat resource limits as stop conditions; do not load a shared or production DB without explicit authorization. Local results establish regression/cost evidence only. Staging results qualify that exact topology. Production capacity requires canary/peak observations over an agreed period (recommend at least one full operational week) and incident review; local 1000-user results alone never certify production 1000-user capacity.

## 17. Physical Browser Validation Matrix

Real Android Chrome and installed Guest PWA; real iPhone Safari and Home Screen Guest app; at least one constrained-memory device. Record OS/browser versions and cookie/storage behavior separately. For each: actual Native QR/link entry, scrub, reload, browser restart, process eviction/forced kill, lock/unlock, 30-minute background, Wi-Fi/mobile switch, offline then return, required background/closed-app Guest notification delivery and dedupe, handoff proof scan, staff recovery and COMPLETED. Test PWA/browser jar differences rather than promising shared cookies. Test same-NAT companions and changed device. Repeat EN/AR, zoom, screen reader, notification permission states and muted/autoplay-denied audio. Desktop Chromium/WebKit automation is supporting evidence, not physical iOS proof.

| Scenario | Evidence mode | Required result |
| --- | --- | --- |
| Generated URL, scrub, full reload, original-link reopen, QR rescan | BOTH | Same authorized visit or explicitly accepted consumed/revoked recovery outcome; no leaked fragment |
| Android Chrome and installed Guest app; iPhone Safari and Home Screen app | PHYSICAL | Real device storage/jar and lifecycle behavior documented |
| Background/foreground, lock/unlock, suspension, forced process kill, memory pressure | BOTH | Automation supplements actual mobile lifecycle; restore/revalidate without false authority |
| Wi-Fi/cellular switch, offline, poor network, body stall | BOTH | Finite truthful state and measured reconnect; no blind mutation replay |
| Staff reissue/revoke during active visit and handoff | BOTH | Old authority invalidated per accepted generation policy; secure release preserved |
| Same-NAT Guests, duplicate tabs, overlapping mutations | BOTH | No legitimate quota loss or domain duplication inside accepted envelope |
| Deterministic response reordering, CSRF, cross-tenant denial | AUTOMATED | Real API/DB assertions with browser fault controls |
| Screen reader, zoom, RTL, touch refresh, audio restrictions | BOTH | Automated semantics plus real assistive/touch behavior; frozen design |
| Required background/closed-app Guest notification | BOTH | Real supported-device delivery, dedupe, permission-denied handling, restart/reconnect behavior and privacy-safe telemetry; foreground audio is not a substitute |

## 18. Deployment / HA / Observability Plan

T4 owns topology inventory, genuine build-time API_ORIGIN/public-origin proof, trusted hop configuration, direct-ingress restrictions, TLS/header ownership, compatible artifacts, readiness/drain and U-09 availability. Test the actual Customer -> API path and public ingress. Start with the accepted topology, record every remaining single point of failure, and exercise both graceful restart and hard kill. Header and cookie policy must be verified at the public TLS termination boundary; source configuration alone is insufficient.

T4 must expose operation-class request rate, status/error categories, latency histograms, Guest unexpected-auth/429 counts, bootstrap/restore/reissue success, timeouts/ambiguous outcomes/reconciliation latency, stale/reconnect duration, pool total/idle/waiting/acquisition time, lock/deadlock/statement timeouts, limiter rows/churn/oldest eligible cleanup backlog, DB connections/WAL and app resource/restart/readiness state. Aggregate without token/session/IP labels. Existing bounded operation logs are the starting point, not a complete metrics system.

Proposed alerts: any confirmed access-loss/duplicate/authorization defect pages immediately; legitimate 429 or unexpected auth above zero triggers investigation; 5xx >1% for 5m or read p95 >1s for 5m pages; pool wait p95 >200ms for 5m and cleanup backlog >2h alert; readiness loss with no healthy replica pages immediately. Inject each alert in staging, attach notification/detection/runbook evidence and name the responder. “Dashboard configured” is not “alert verified.”

## 19. Rollout Sequence

1. Synchronize the accepted U-01..U-09 decisions into the applicable focused decisions/contracts; assign human/task ownership and capture baseline visuals and current active cohorts.
2. Apply T1 additive migration through authorized deployment workflow; deploy compatible API/rating readers everywhere with enrollment disabled. Prove old cohorts and current security behavior.
3. Merge and deploy T3 finite DB/limiter budgets; verify cross-instance/NAT enforcement and saturation recovery.
4. Deploy T2 cookie-capable client/controller/SW behavior behind disabled enrollment; preserve old open-page/assets compatibility.
5. Complete T4 real-origin/proxy/readiness/HA/alert preflight. Enable staging enrollment, then a bounded production canary only after authorized deployment and passing selected T5/T6 gates.
6. Enable only approved T5 product surfaces; expand canary cohorts while measuring auth loss, unexpected 429, stale recovery and domain duplicates. Stop on any security/access-loss defect.
7. T6 records remote CI, staging/physical/failure/load and production observation evidence. Retire old support only after approved cohort drain, never solely because a new build passed.

## 20. Rollback Strategy

Before enrollment, disable the new client path and roll back compatible application artifacts while retaining additive schema. After any enrollment, the rollback floor is the last cookie-compatible API/client/rating implementation: stop new enrollment but retain existing Browser Session resolution and required renewal through active visits. Revert T2/T3 behavior only to a version compatible with accepted credential identity and capacity; old polling and old quotas must not be restored independently. Preserve current limiter windows/shared keys and auth history.

Never deploy bearer-only readers for an enrolled cohort, drop additive auth state, resurrect consumed/rotated links, or restore a DB snapshot that revives revoked authority without a reviewed reconciliation procedure. A security emergency uses authorized generation revoke/reissue and staffed assistance. Verify rollback under active retrieval and handoff, on an old cached page, and after a committed response is lost. Record who can stop rollout, artifact versions, rollback trigger metrics and operational recovery contact before canary.

## 21. GitHub Issue Mapping

GitHub connector inspection verified live state; broad Guest and Customer searches covered both open and closed issues. Search result state was null, so the specific dispositions below use individual issue reads. The four required issues had zero comments at inspection.

| Issue | Live state / repository assessment | Plan owner and closure evidence |
| --- | --- | --- |
| [#196](https://github.com/veletpro0-lgtm/valet-platform/issues/196) Refresh | OPEN. Handler exists; request suppression/loading feedback and outage behavior need examination. Not proven fixed or stale. | T2 reproduction plus T6 real phone tapping, request trace and canonical state update. Its old memory-only requirement must be reconciled with accepted T1 continuity, not silently used to prohibit it. |
| [#219](https://github.com/veletpro0-lgtm/valet-platform/issues/219) Handoff recovery | OPEN. Native `src/guest-access/**` already provides credential operations; `native-handoff-panel.tsx` / `native-handoff-pending.tsx` have verification/abort/override but no contextual Guest recovery integration. | T5 exact Native integration, T1 generation semantics, T6 real-device same-visit secure release. Employee Web expansion is outside #219. |
| [#224](https://github.com/veletpro0-lgtm/valet-platform/issues/224) Customer HTTPS origin | OPEN. Native origin validation and Customer standalone/systemd artifacts exist. Actual reachable origin and physical release proof are not established by code. | T4 deployment evidence, T6 opening a real generated QR/link. Distinct from build-only #227. |
| [#227](https://github.com/veletpro0-lgtm/valet-platform/issues/227) Real origins/build | OPEN. Explicit deployment-evidence deferral, not automatically a source defect. | T4 actual inherited configuration and `pnpm build:production`; T6 production qualification. No fabricated production origins. |
| [#239](https://github.com/veletpro0-lgtm/valet-platform/issues/239) Branding | CLOSED. `guest-branding.ts`, AppShell and branding tests implement effective display name/color with safe contrast fallback and current-client isolation. | Preserve; not a new missing-feature task. T6 regression only. |
| [#188](https://github.com/veletpro0-lgtm/valet-platform/issues/188) Guest entry | CLOSED. Fragment entry and transient sharing are implemented. | T1 supersedes only explicitly amended transport/lifecycle parts; retain security and QR/Copy Link. |
| [#123](https://github.com/veletpro0-lgtm/valet-platform/issues/123) no-store | CLOSED. `no-store-response.ts`, controllers and exception filter provide protection; tests exist. | Preserve and test across proxies/cookies; do not reopen as a missing code fix. |
| [#70](https://github.com/veletpro0-lgtm/valet-platform/issues/70) Durable anti-abuse | CLOSED. Implementation exists. | T3 is a focused policy/capacity amendment, not removal of enforcement. |
| [#192](https://github.com/veletpro0-lgtm/valet-platform/issues/192) Notifications | CLOSED. DEC-070 Guest foreground ready alert exists. | Preserve current effective policy and dedupe. U-08 now requires first-launch background/closed-app Guest notification; T5/T6 own the new implementation and proof without rewriting the historical issue. |
| [#197](https://github.com/veletpro0-lgtm/valet-platform/issues/197) Web Push | CLOSED, but historical comments reference a prior Web Push DEC-071 and blocked physical proof. Current DEC-071 is Native architecture and Customer SW has no push handler. | Historical issue closure is not current background-notification proof. Do not resurrect historical design or renumber a DEC. T5 must implement the newly accepted U-08 background-notification requirement through a fresh focused contract compatible with current decisions, and T6 must prove it physically. |

No issues were created, edited, commented on or closed. These issues overlap in the guest journey but are not interchangeable closure evidence.

## 22. Final Production Readiness Gate

Production readiness **MUST NOT** be claimed until every required selected-scope gate has evidence.

- [x] U-01..U-09 Owner decisions and exact program scope are accepted in this plan.
- [ ] U-01..U-09 are synchronized into the applicable binding focused decisions/contracts; human owners and rollback authority are named.
- [ ] All selected findings are resolved and independently reviewed; no source/structure/tenant/handoff regression.
- [ ] UI freeze and every approved safe delta have EN/AR/RTL comparison evidence.
- [ ] Migration/privilege/old-new cohort compatibility and rollback floor are verified.
- [ ] All section 15 real Guest E2E checks pass in remote required CI.
- [ ] Section 16 accepted capacity, NAT, failure and 8h/26h soak thresholds pass in representative staging.
- [ ] Section 17 physical matrix passes on actual Android/iPhone devices.
- [ ] Real public-origin/proxy identity, readiness/drain/HA, privacy, dashboards and injected alerts are verified.
- [ ] Selected payment/rating/help/delivery surfaces and issue-specific closure evidence are complete; deferred work is explicit.
- [ ] Production canary/observation and tested rollback meet accepted SLO/RTO/RPO with named responders.

### Validation commands and evidence levels

Commands below are existing commands unless marked future. Run from repository root, only in the appropriate authorized environment:

```text
C1 — Customer local behavior
pnpm --filter @valet/customer test
pnpm --filter @valet/customer lint
pnpm --filter @valet/customer typecheck

C2 — repository static and safe non-PostgreSQL gates
pnpm architecture:check
pnpm lint
pnpm typecheck
pnpm test:non-postgres
pnpm test:build-contract

C3 — future implementation verification against designated disposable PostgreSQL
pnpm test:postgres:api
pnpm test:postgres:database

C4 — future production-stage artifact proof with real inherited origin configuration
pnpm build:production

Planning-document check
python .agents/skills/vaylet-planning-guardian/scripts/audit_plan.py docs/GUEST_APP_PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md
git diff --check
```

C3 creates test state; it was not run during this audit. C4 requires genuine deployment inputs; it was not run. The future Guest E2E/load commands must be added and documented by T6 with strict target-DB/environment checks. Current `pnpm --filter @valet/api capacity:baseline` is a staff/local mutation harness, **not** the new Guest capacity lane.

Required evidence ladder: IMPLEMENTED -> STATIC VERIFIED -> LOCAL COMMAND VERIFIED -> RUNTIME VERIFIED -> FAILURE VERIFIED -> CI VERIFIED -> PRODUCTION-READY for the approved scope. These are distinct claims; lint is not typecheck, build is not runtime, graceful shutdown is not crash recovery, workflow configuration is not a passed remote CI run.

### Explicitly out of scope

For this planning task: production fixes, Guest visual changes, application code edits, schema/migrations, dependency additions, production/staging mutation, services, deployments, mobile binaries, PR creation, merge, main updates and issue mutations are prohibited.

For future execution: general Guest redesign, new accounts, arbitrary TTL inflation, weakened handoff, staff bypass, provider integrations without accepted scope, speculative infrastructure and unrestricted Guest incident access. Automatic WhatsApp/SMS Guest Access link delivery is explicitly deferred to a separate later program. Required background Guest notification remains in scope and must be truthfully qualified on supported devices; do not claim guaranteed delivery/audio where the chosen platform cannot prove it. Full sellable-MVP gaps may remain explicitly deferred under U-08; do not call the whole product complete because core continuity works.

### Ready-to-implement verdict

**READY FOR TASK EXECUTION.** The audit/task boundaries and U-01..U-09 Owner choices are now explicit. T1 starts by synchronizing those choices into the affected binding decisions/contracts before dependent production code. No production implementation is completed by this document.

Production remains **NOT READY** for the requested continuity target until all selected implementation, CI, runtime, failure, load, physical and operational gates have evidence. Missing runtime evidence is marked REQUIRES RUNTIME / PHYSICAL PROOF rather than reported as a proven deployed failure.

Planning validation: the Customer suite passed 26 files / 176 tests during the original audit. After recording the accepted Owner decisions and required background-notification scope, the v1.5 planning heuristic reports **no heuristic red flags**; this remains a structural heuristic, not proof that the plan is semantically or operationally correct. U-01..U-09 are accepted Owner direction; implementation still requires the planned DEC/contract synchronization and evidence gates.

Final planning checks: re-fetch origin/main before commit and compare the exact SHA; if it moved, inspect the relevant delta and update evidence before committing. Review only this plan's diff; verify six major tasks, explicit freeze, evidence for every counted finding, separate inherited/new findings, accepted Owner choices and staged rollback floor. Commit only this file as `docs: plan guest app production readiness`, push only `plan/guest-app-production-readiness`, and do not open a PR.
