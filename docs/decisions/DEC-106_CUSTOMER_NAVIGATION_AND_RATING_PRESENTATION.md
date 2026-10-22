# DEC-106 — Customer navigation and rating presentation (#318, #317, #312)

Status: Accepted
Date: 2026-10-22
Owner: VAYLET project owner (explicit implementation brief and linked issues)

## Accepted change

The Customer production experience remains one vehicle journey without bottom
tabs. Retire the development BottomNav, CustomerTab and obsolete tab routes.
Keep the existing independent development navigator and Payment/Rating previews.

Remove Customer Help, its routes, previews and unused copy. This supersedes only
DEC-101's Customer Help presentation delta. Staff/Native/Dashboard assistance,
incidents and backend capabilities are unaffected. Photos, Privacy, Contact and
the More menu are frozen; #316 is expressly excluded.

For the exact current authorized COMPLETED visit, automatically activate the
existing rating route on live completion or authorized initial access. Preserve
GuestPostVisitScreen's independent latest-session authorization before mounting
GuestLiveRating. A cached completed snapshot is insufficient. Bootstrap,
context-switch ambiguity, expiry, read failures and stale initial reads block
automatic entry. A pending route is fenced by the exact client and visit.

Back deliberately dismisses automatic presentation while retaining manual entry
and Payment Summary. Polls, focus, visibility and refresh must not undo dismissal.
Persist only a presentation outcome scoped to the exact visit and the existing
non-authoritative browser-context marker in sessionStorage. Initial Browser
Sessions without that marker use a random presentation-only nonce. A successful
fresh credential exchange rotates that nonce; SAME_VISIT preserves it. Neither
nonce is a credential or authorization proof. Legacy
bearer contexts without that marker use memory only: their bearer is scrubbed
and cannot restore authorization after refresh. Never persist/hash bearer material.
Storage denial falls back to in-memory suppression for the mounted context.

Known saved/conflicting outcomes suppress later automatic prompting. An unknown
submission outcome also suppresses automatic entry without claiming success or
retrying. Existing submission feedback and explicit manual entry remain intact.
A new browser has no saved-rating read endpoint; it may encounter the existing
immutable rating conflict. Never infer a server rating from presentation state.

Credential/client or visit replacement invalidates pending callbacks and local
route selections. The server's DEC-064/091 exact-visit and 24-hour authority,
immutable rating, explicit 1–5 selection and explicit Submit remain unchanged.
Automatic presentation performs no rating POST.

## Scope ledger

- Entities: Guest Browser Session, ValetSession and presentation state only.
- No ValetSession/Task/Dispatch transition or mutation is introduced.
- No DB constraint/index/migration, backend endpoint, configuration policy,
  tenant/Location permission, audit writer or dependency change.
- MVP navigation mechanics only; no new product surface or visual redesign.
- Allowed: Customer routing/layout nav removal, Help-only source/copy cleanup,
  rating presentation/submission outcome notification, focused tests/QA evidence.
- Frozen: rating/completed JSX, styles/tokens/shared UI, More menu and #316 files.

## Evidence obligations

Production build before/after comparisons and focused production-route browser
tests must distinguish HTTP fixtures from real API authorization evidence.
Review the full changed-file allowlist. All new authored code stays <=300 lines;
the oversized root must shrink by deleting obsolete tab routing.

The canonical decisions-log mirror is deferred to the next coordinated
documentation synchronization; this focused Accepted decision is binding under
AGENTS.md's mirror-lag rule.
