# DEC-091 — Guest Rating and Returning Contact

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

There is no Guest rating persistence. Older planning language used “Repeat
Guest,” which overstates identity evidence from a contact value.

## Decision

Guest Rating is an integer from one through five, accepted only through the
authorized Guest Access context for one completed visit. At most one rating may
be created per visit. The write is idempotent for an exact retry and conflicting
second values fail safely. Staff cannot create, alter, or delete a rating.

DEC-064's T1 amendment preserves this exact-visit authorization through either
an unconsumed legacy bearer during staged rollout or the current Guest Browser
Session. Browser Session rating is available only inside the accepted 24-hour
post-`COMPLETED` scope and must be revalidated through the same least-privilege
database authorization boundary; no client-supplied ValetSession ID is
authority. `CANCELLED` never becomes rating scope.

Use the label **Returning Contact**, not Repeat Guest. It means the normalized
contact on the current visit appeared on a prior completed visit within the
viewer's authorized analytics scope. It does not prove the same human, an
account, ownership, or authentication. Missing contact or missing eligible
history remains missing/false according to the strict response contract and is
never inferred from plate alone.

Rating and Returning Contact analytics are tenant/Location scoped, bounded,
privacy-minimized, and use Location-local period semantics. Raw phone values do
not appear in analytics or audit metadata.

## Reason

This provides a genuine guest feedback source and an honest recurrence signal
without asserting identity the system cannot prove.

## Consequences

MGT-BE-09 owns rating persistence/write; MGT-BE-08 exposes the bounded Returning
Contact calculation; MGT-BE-10/11 may aggregate them after source availability.
DEC-069's returning-customer suggestion remains distinct and unchanged.

## Security and privacy considerations

Rating authorization stays bound to the exact Guest visit context. Analytics
contains no raw contact, and recurrence is not authentication, identity proof,
ownership proof, or an unrestricted person lookup.

## Supersedes/amends references

Supersedes the old “Repeat Guest” label and rating packet semantics; it does
not widen DEC-069 Employee recognition.

## Affected docs/code

`docs/02_DOMAIN_MODEL.md`, `docs/03_DATABASE_SCHEMA.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future Guest Access/customer/analytics implementation.

## Owner-approved U-07 / T3 amendment (2026-10-08)

See the canonical DEC-024 amendment and
[Guest T3 policy](../GUEST_T3_POLICY_AND_EVIDENCE.md). That amendment supersedes
historical Guest quota/allocation and address-reservation mechanics only for
T3 admission. It changes no credential, authorization, custody, business retry,
audit, foreground notification or handoff-proof contract in this decision.

## Owner-approved Issue #463 amendment (2026-11-27; controlled implementation)

The immutable numeric rating remains guest-only, one per completed visit. The
optional service comment is accepted only atomically with the first rating, as
a separately stored private one-to-one child. New requests assert the intended
visit without granting authority; legacy stars-only requests retain their
exact response. Canonical equality governs retries while retained; no append,
edit, normal delete or overwrite is allowed. Terminal erasure of the comment
by the separately approved privacy case process is the sole exception to
comment immutability, never a change to numeric rating. Every subsequent retry
variant after terminal erasure conflicts safely after current credential
authorization. No erased content or content-derived digest is retained.

The exact canonicalization, state, retry and authorization contract is in
[Master Plan v1.3](../plans/ISSUE_463_GUEST_RATING_COMMENTS_IMPLEMENTATION_PLAN.md)
sections 5-7 and 17-18, with the explicit owner approvals and unresolved task-specific
legal decisions in the implementation handoff. No production activation is
authorized. Existing custody, contact, authorization and T3 rules remain.
