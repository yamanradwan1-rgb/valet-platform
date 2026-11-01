# Issue #404 — Owner-authorized implementation contract

Date: 2026-11-01. Base: `c85fc34be9e7c62deae89b8f97b3d166dfdbc7ed`.
Authority: Owner's explicit Issue #404 IMPLEMENTATION GO, extending only
development registration and essential in-place EN/AR activation feedback.
DEC-064, DEC-101 and the T5 notification/security contracts remain binding.

## LOCKED

- Register the Guest worker in development over a browser-secure context.
- Production keeps `/sw.js`, default scope, lifecycle, cache and Push contracts.
- Development must not cache/intercept Next development, HMR or Guest requests.
- Permission is requested only synchronously from an explicit Enable gesture.
- Retain #335 deadlines, single-flight, cancellation and late/context fences.
- Only an exact authorized empty HTTP 204 confirms registration. An uncertain
  POST preserves the browser subscription and offers explicit reconciliation
  using the existing authorized, deduplicating registration POST.
- Preserve canonical Guest status, Browser Session authority, CSRF/Origin,
  generation/expiry/revocation, exact visit/tenant/Location and mixed-authority
  rejection. No server, schema, migration, permission or public API changes.
- No redesign: reuse the existing paragraph and buttons, design tokens,
  localized direction, loading/accessibility behavior and frozen geometry.

## DERIVED mechanics

- Development selects a non-caching mode of the same worker by its script URL;
  production does not opt into that mode. No worker unregister or cache clearing.
- Stage-local failure classification supplies safe fixed localized feedback;
  raw browser/server exception details never become user copy or telemetry.
- Retry is user initiated and discovers/reuses the native subscription before
  another authorized registration. No automatic replay or new verification API.
- Existing registration initialization remains shared and retryable after a
  failed attempt. Readiness and native Promise waits remain bounded.
- The only affected persisted entity is the existing GuestPushRegistration
  through its unchanged command. No ValetSession or Task transition is added.

## FORBIDDEN expansion

Production deployment/settings, senders/real notification delivery, real customer
sessions or subscriptions, changing existing consent, new endpoints, auth/DB
changes, unrelated refactors, PR/merge/issue closure and Owner worktree edits.
Disposable QA may use new synthetic sessions, separate hostname, random test
keys and a dedicated PostgreSQL runtime role, with all sending disabled.

## UNRESOLVED / evidence limits

The expired historical incident's deployment/origin/mode remain UNKNOWN.
Current missing-worker causality does not establish historical provenance.
No implementation-critical policy decision remains under the Owner's scope.
Independent COS review is conditional on actual worker availability; an
unavailable control plane must be reported, never replaced or called reviewed.

## Verification envelope

Tests first for development registration/no caching and truthful failure states;
mounted gesture/cancellation/context/timeout tests; strict HTTP and unknown-commit
tests; real PostgreSQL response-loss/retry verification; physical Android native
Push; before/after EN/AR/theme/width/zoom/keyboard evidence; focused and repository
quality gates; full diff/security review; commit/push and remote SHA verification.
Temporary QA state, credentials and raw browser/network dumps are never staged.

Verdict before code: **READY TO IMPLEMENT**, limited to these two corrections.
