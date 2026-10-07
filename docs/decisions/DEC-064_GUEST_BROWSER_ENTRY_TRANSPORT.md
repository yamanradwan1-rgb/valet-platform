# DEC-064 — Guest Browser Entry Transport

Status: Accepted
Date: 2026-08-23
Amended: 2026-10-07 — Owner-approved Guest Browser Session continuity (T1)
Task: VUI-009A — Employee Guest Access and Production Guest Entry

## Context

Guest Access credentials already exist as 43-character base64url bearer
tokens with hash-only persistence (VAL-004F). The Customer web application,
however, had no accepted production transport for receiving that credential:
the repository previously used a development-only URL-fragment adapter that
was deliberately disabled in production builds, so a real guest could not
enter through an issued link.

The transport must never expose the raw token in referrers, server logs,
browser history, or persistent storage, and it must keep SSR and first client
render deterministic after the recent hydration stabilization work.

## Decision

1. The production one-time Guest browser entry transport is exactly:

   ```text
   #guestToken=<43-character-base64url-token>
   ```

   appended to the canonical Customer application origin.

2. The fragment is read browser-only after mount, never during SSR and never
   during the first deterministic client render. Adoption happens only after
   the existing post-mount bootstrap step completes.

3. The exact token shape is enforced: exactly 43 characters of
   `[A-Za-z0-9_-]`. Any guest fragment that does not match this exact full
   form is malformed and fails closed.

4. Immediately after reading, the fragment is scrubbed from the address bar
   with `history.replaceState`. A valid token is adopted only if safe
   scrubbing succeeds; if scrubbing fails, the token is not adopted (fail
   closed). Malformed guest fragments are scrubbed and rejected. Unrelated
   hash fragments are ignored and left untouched.

5. The raw bootstrap token and its derived URL are memory-only inside the
   mounted Customer flow. They must never be written to localStorage,
   sessionStorage, IndexedDB, cookies, Service Worker storage, analytics,
   logs, traces, AuditEvent, BroadcastChannel or an offline queue. It is
   bootstrap material only and is discarded after successful exchange.

6. The Employee side builds every shareable surface (QR, copied link, dev/test
   Open Guest App) from one canonical origin configuration,
   `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN`, validated centrally: absolute clean
   origin only (no credentials, query, fragment, or non-root path); missing
   or malformed values fail closed; production requires HTTPS while local
   development may use localhost HTTP. No production host is hard-coded.

7. This transport changes no ValetSession lifecycle state, Task/Dispatch
   state or existing Retrieval/Handoff/Financial/Custody semantics. Guest
   Access mutations remain online-only under DEC-063.

### 2026-10-07 T1 continuity amendment

The Project Owner approved U-01 through U-07 in
`docs/GUEST_APP_PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md`. Those decisions
supersede only the earlier memory-only post-entry continuity limitation and the
assumption that the fragment bearer remains the browser's normal authority.

8. After fragment scrubbing, the Customer establishes a server-minted opaque
   pre-exchange browser enrollment binding and performs one retry-safe exchange
   of the transient bearer. The exchange is serialized against the exact
   persisted ValetSession and current Guest credential generation. Successful
   exchange consumes that bootstrap generation for legacy bearer use.

9. Browser authority after exchange is a distinct high-entropy opaque Guest
   Browser Session. Persistence contains only versioned verifier hashes. Browser
   authentication uses a same-origin host-only `__Host-` cookie with `Secure`,
   `HttpOnly`, `Path=/`, no `Domain`, and explicit `SameSite=Lax`. The original
   Guest bearer is never stored in that cookie.

10. Enrollment establishes the browser-owned pending credential before the
    consuming exchange. If the exchange commits and its HTTP response is lost,
    the same enrollment can reconcile the already-authorized Browser Session;
    a different enrollment cannot. A fresh enrollment never adopts caller-
    supplied session material, so the protocol does not create a session-
    fixation or browser-swap path.

11. One primary Browser Session is permitted per ValetSession credential
    generation. Tabs sharing the same browser cookie share that authority. A
    second browser/device cannot silently join the visit; staff reissue is the
    transfer mechanism. IP addresses and browser/device fingerprints are not
    authentication bindings.

12. Staff rotate/reissue/revoke remains the authoritative generation boundary.
    A generation change invalidates Browser Sessions derived from the previous
    generation. Per-browser end-access may revoke only that Browser Session.
    None of these credential actions verifies/consumes handoff proof, releases
    the vehicle, creates Retrieval work or changes custody.

13. A valid Browser Session for a non-terminal active visit has no fixed 24-hour
    server expiry and does not depend on polling, process memory or one API/
    Customer process instance. The browser cookie uses a 400-day `Max-Age` as a
    transport persistence cap; it is not server-side Guest authority expiry.
    Cleared/expired browser storage uses the approved staff recovery/reissue
    path rather than changing the persisted active-visit rule.

14. `COMPLETED` retains only a 24-hour post-visit Browser Session scope measured
    from authoritative `completed_at`. That scope permits safe completed-session
    reads, DEC-091 rating and explicitly approved receipt reads only. It cannot
    request/cancel Retrieval, issue/rotate handoff proof, change tips or other
    financial terms, restart work, reopen custody or release a vehicle.
    `CANCELLED` has no post-visit Guest scope.

15. During staged rollout, an unexchanged legacy client may continue to present
    the current 43-character bearer until that credential is consumed, expires,
    rotates or is revoked. A business request presents exactly one authority
    source: legacy bearer or Browser Session cookie. Mixed sources fail closed;
    failed Browser Session authentication never falls back to a different bearer.

16. T1 keeps DEC-024 request budgets/cadence unchanged. The Browser Session
    secret provides the durable credential identity for the existing Guest
    anti-abuse boundary and future T3 request-class budgets. New enrollment is
    rollout-gated off until the later T3/T4 production gates are satisfied,
    while servers must continue resolving already-created Browser Sessions.

## Reason

A one-time, immediately-scrubbed fragment keeps the bootstrap credential out
of referrers, logs and durable browser storage. Durable continuity belongs to a
separate hash-only, server-authoritative Browser Session so reloads, browser
restarts and application process restarts do not require retaining or replaying
the original bearer. Exact generation and lifecycle checks keep that durable
authority scoped to the same persisted visit.

## Consequences

- VUI-009A implements the production-capable fragment adapter in the Customer
  app and removes the development-only production rejection.
- T1 adds retry-safe one-time bootstrap exchange and durable same-browser
  continuity without changing the frozen Guest presentation.
- Reload/reopen restores the exact visit through the Browser Session while it
  remains authorized; cleared browser credentials or device transfer require
  the approved recovery/reissue path.
- Any future alternative transport (for example scoped short-lived paths or
  messaging-delivered links) requires another decision.
- Persistent storage of the original Guest bearer remains prohibited.

## Affected docs/code

- `docs/decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md`
- `docs/08_DECISIONS_LOG.md` summary/index mirror
- `apps/customer/src/features/auth/guest-token-adapter.ts`
- `apps/valet/src/features/guest-access/**`
- `.env.example`
