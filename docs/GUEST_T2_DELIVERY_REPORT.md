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

**Deterministic envelope:** At the fastest permitted 20-second interval, two concurrently visible tabs nominally offer 90 background GETs in 900 seconds. Adding the Owner's previously documented 66 additional valid presentations (initial, manual, wake, projections and mutations) gives 156 vs unchanged legacy 180, 24 nominal headroom. A sliding-window boundary may include 46 events per tab (instead of 45); targeted tests account for that tighter edge, retain 22 minimum headroom in the bounded model, and do not claim to simulate production NAT/device/network behavior. The budgets apply to one shared server-authorized Browser Session identity, not independent per-tab quota.

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
