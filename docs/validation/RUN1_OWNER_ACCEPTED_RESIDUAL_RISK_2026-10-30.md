# VAYLET RUN 1 — Owner-accepted residual security risk (#371)

**Owner decision date:** 2026-10-30 (Asia/Amman).

**Status:** EXPLICITLY ACCEPTED RESIDUAL P2 RISK FOR RUN 1 — NOT REMEDIATED.

## Exact, limited Owner decision

Following RUN 1 independent final review, the Owner selected the option to
**preserve automatic Dashboard session recovery** and **accept/document the
remaining #371 security risk as an explicit exception**. The Owner confirmed:
"بختار هاي كمل وانهي الشغل" in response to the option to retain automatic
recovery and record the remaining risk as accepted. This authorization is
limited to RUN 1 closeout for the reviewed Dashboard authentication behavior.

This is a conscious risk acceptance, **not** a claim that the conditional
session-resurrection scenario was fixed or that its security review passed
without findings. A subsequent change to the session policy or a future
release requires its own review.

## Precisely accepted risk and prerequisites

Issue: `#371`; classification: **P2**, source-based conditional session
resurrection / incomplete logout; no demonstrated new cross-tenant escalation.

1. The employee initiates Dashboard logout while browser storage cannot
   persist the unconfirmed-logout marker (`apps/dashboard/src/lib/auth/staff-auth-client.ts:255-261`).
2. The logout request to the server fails (`staff-auth-client.ts:163-170`),
   so the previously valid HttpOnly refresh cookie may survive.
3. Browser storage becomes writable again **before** a fresh page/bootstrap.
   No durable logout marker was recorded during the failure.
4. The storage preflight passes (`staff-auth-bootstrap-storage.ts:17-36`)
   and Dashboard session bootstrap attempts automatic refresh
   (`staff-auth-context.tsx:92-108`). The prior identity may be restored.

This path was established by independent static source review; it was **not**
newly demonstrated by a complete mounted-browser plus real-server outage test
on the final RUN 1 source SHA. The incidence and exploitation likelihood are
not measured. The practical impact is possible restoration of an identity
after a user believed logout was complete, if all prerequisites coincide.

## Boundaries, safeguards, and deferred follow-up

- Retain current automatic refresh/session continuity. Do **not** implement an
  unconditional fresh-login requirement on this approval.
- Preserve existing fail-closed behavior while storage access remains denied,
  normal persisted logout markers, and server-side revocation when logout
  succeeds. This exception does not authorize bypassing other authentication,
  MFA, tenant, location, or role checks.
- The distinct stale-marker **login availability** P2 found during review
  **was fixed** at `21abfb3da8789276f3f3828affae853cdeeac83c` and
  independently re-inspected. This accepted risk is **not** that fixed bug.
- Track a future durable server-authoritative logout-intent/session-revocation
  design, or a separately approved fresh-login policy, if unconditional
  post-logout non-resurrection is required. This is deferred, not completed.
- Do not describe Issue #371 as universally fail-closed under simultaneous
  storage and network failure; retain this exception in release notes/issue
  disposition rather than silently erasing the security finding.

## Review provenance and merge-readiness meaning

- Baseline: `9ac3c5518b6b7781364e90742589d8f63024f8f6`.
- Final reviewed **production-code** SHA:
  `21abfb3da8789276f3f3828affae853cdeeac83c`.
- Independent security reviewer: COS `worker-8` — incremental auth patch PASS;
  **overall security finding FIX REQUIRED** until Owner policy/risk decision.
  That historical reviewer verdict must remain visible.
- Independent UI Freeze reviewer: COS `worker-9` — **PASS**, including QR screen
  visual preservation and no new layout/CSS changes on final auth patch.
- The Owner's explicit acceptance resolves the *release decision gate* for
  this identified P2 residual risk, **not** the vulnerability itself.
  Readiness can be reported as **CLEAN TO MERGE WITH AN EXPLICITLY ACCEPTED
  RESIDUAL P2 SECURITY EXCEPTION**, provided this exact exception travels
  with the review and no other new blocker emerges.
- RUN 1 acceptance and QA evidence: ignored local
  `tmp/run1-evidence/RUN1-final-review-closeout-21abfb3d.md`.
  Prior mounted Chromium 18/18, Dashboard 24/24, Customer 14/14, genuine
  PostgreSQL #371 2/2 and #380 3/3 are historical evidence, not reruns on
  this docs-only decision. The final auth source SHA has focused 13/13 tests,
  TypeScript, lint, and architecture checks reported PASS.

**Not authorized by this acceptance:** push, PR creation, merge, deployment,
remote CI, GitHub issue closure, or edits to main. The Owner must authorize
any of those separately.
