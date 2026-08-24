# DEC-064 — Guest Browser Entry Transport

Status: Accepted
Date: 2026-08-23
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

5. The raw token and its derived URL are memory-only inside the mounted
   Customer flow. They must never be written to localStorage, sessionStorage,
   IndexedDB, cookies, or Service Worker storage, and never logged. A full
   page reload after scrubbing intentionally loses access until the original
   link is reopened/rescanned or Staff reissues Guest Access.

6. The Employee side builds every shareable surface (QR, copied link, dev/test
   Open Guest App) from one canonical origin configuration,
   `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN`, validated centrally: absolute clean
   origin only (no credentials, query, fragment, or non-root path); missing
   or malformed values fail closed; production requires HTTPS while local
   development may use localhost HTTP. No production host is hard-coded.

7. This transport changes no ValetSession lifecycle state, Task/Dispatch
   state, database schema, or existing issue/reissue/revoke command
   semantics. Guest Access mutations remain online-only under DEC-063.

## Reason

A one-time, immediately-scrubbed fragment keeps the credential out of
servers, logs, referrer headers, and durable storage while requiring no new
infrastructure. Fail-closed scrubbing and strict shape validation prevent
partial or hostile fragments from being adopted, and memory-only custody
bounds the blast radius of any shared device.

## Consequences

- VUI-009A implements the production-capable fragment adapter in the Customer
  app and removes the development-only production rejection.
- Refresh-after-entry is intentionally unsupported for MVP; recovery is
  reopen original link, rescan original QR, or Staff reissue.
- Any future alternative transport (for example scoped short-lived paths or
  messaging-delivered links) requires another decision.
- Persistent Guest credential storage remains prohibited.

## Affected docs/code

- `docs/decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md`
- `docs/08_DECISIONS_LOG.md` summary/index mirror
- `apps/customer/src/features/auth/guest-token-adapter.ts`
- `apps/valet/src/features/guest-access/**`
- `.env.example`
