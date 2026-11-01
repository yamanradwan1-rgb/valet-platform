# DEC-108 — LocationAccess Revocation and Practical In-Flight Response Security

Status: Accepted (Owner practical launch-security contract; implementation GO under Issue #333)
Date: 2026-10-31
Amended: 2026-11-01 (explicit Owner replacement of the strict delivery rule)
Owner: VAYLET product owner
Source: Owner direction on U-001 and final practical security decision, Issue #333

## Context

Issue #333 real PostgreSQL verification observed old, pre-authorized Live Map
and Management Visit Contact responses completing after canonical
`LocationAccess` revocation committed. The 2026-10-31 strict delivery rule
classified those schedules as RED. On 2026-11-01 the Owner expressly replaced
that requirement with the practical contract below, accepting bounded in-flight
residual risk. Historical strict tests, observations and reports remain intact.

## Accepted owner security rule — 2026-11-01 amendment

**Once canonical `LocationAccess` revocation commits, every newly authorized
protected request must respect the persisted revoked Location scope. A request
that successfully passed the required authorization before that commit may
finish its response afterward.** The Owner explicitly accepts that bounded
in-flight residual risk for product launch.

The authoritative scope remains persisted Organization, User, membership, role,
exact Location grant and applicable Shift/session/MFA state, never client-selected
Location, Dashboard context or an obsolete grant cache. A fresh authorization
after revocation cannot include the revoked Location; independently authorized
Locations may remain visible. Cross-Organization data never becomes available.

Revalidate current authority close to protected database reads and response
generation where practical. In particular, do not reuse a stale grant snapshot
for a protected query when a fresh authorization check is required. A prior
successful authorization permits completion of that already-authorized request;
it does not grant authority to a distinct new request, page, retry, or newly
required authorization decision. The server must not run indefinite protected
streams or background operations that extend the in-flight exception.

This contract requires neither a cross-instance last-byte delivery fence nor a
guarantee that already-authorized response bytes stop at the revocation commit.
There is no requirement to track final client receipt, introduce an egress
gateway, or delay a canonical revoke until an old response finishes. Ordinary
request bounds, fresh authorization and response-cancellation controls remain
subject to focused implementation and verification.

## Relation to existing Accepted decisions

- **DEC-023** (`docs/08_DECISIONS_LOG.md`, staff authentication): a credential
  resolves a persisted User and session; it is not an authorization claim for
  Organization, membership, role or Location. The bounded in-flight allowance
  above applies only to an already successfully authorized request; it cannot
  authorize a fresh read after revocation. Credential rotation, logout, expiry,
  refresh and replay rules remain unchanged.
- **DEC-049**: Live Map/route access requires current exact-Location grants,
  role and, for Supervisors, an eligible active Shift; live data is private.
- **DEC-032 and DEC-045/046**: Shift eligibility is per membership, and map
  tracking remains Task-scoped. U-001 grants no wider surveillance rights.
- **DEC-078/080**: Company Admin read and revocation authority remains subject
  to exact Staff session, current persisted membership and required MFA.
- **DEC-072/075/076/079**: Native session transport, privacy-safe Staff push
  attention/fencing, and distinct tenant/account audit scopes are unchanged.
- **DEC-081**: canonical Staff Management writers retain CAS, current authority,
  handover blockers, audit and transaction rules. After global emergency User
  disable commits, all newly authorized protected requests are denied; affected
  Staff sessions and attention endpoints are revoked, and in-flight responses
  are cancelled on a best-effort basis. No absolute last-byte guarantee applies
  to responses authorized before the disable commit.
- **DEC-084**: private visit contacts and associated visits remain restricted to
  the viewer's actual Organization/Location scope; no broader people directory.
- **DEC-069**: Returning-visit recognition still does not create a customer
  ownership claim or a general employee contact directory.
- **DEC-094**: deactivated Locations retain eligible historical records.
  Location inactivity is not equivalent to revoking a member's grant.

No ValetSession, Task, audit, API, role or database-schema contract is changed.
Role downgrade, membership deactivation, session logout, MFA revocation and
concurrent grant writers retain their separate Accepted contracts; this U-001
amendment does not silently set their in-flight semantics.

## Consequences and implementation gate

Existing Live Map, Location-directory, Visit Contact and emergency-disable
strict RED evidence remains historically accurate for the superseded strict
delivery test. A pre-authorized response finishing after commit is **not by
itself** a violation of this amended practical contract. The demonstrated P001
query using pre-revocation A+B scope after revocation committed remains relevant
to the near-query fresh-authority requirement. None of these observations alone
proves broad practical-contract compliance, production exploitation, or a
cross-tenant bypass. Reclassify each schedule using the actual authorization
and protected-query boundaries, not only the HTTP finish timestamp.

The Owner has given an **implementation GO for the practical Issue #333
security contract**, not for the superseded strict last-byte architecture.
Implementation must prove fresh persisted scope, bounded in-flight behavior,
best-effort emergency cancellation and the unchanged tenant/role/Shift/MFA/CAS/
audit/history protections. This docs amendment authorizes no schema expansion,
new infrastructure, Dashboard/Policies Studio UI work, merge or deployment;
those remain governed by their normal scope and release gates.

Historical strict evidence and design:
`docs/validation/issue-333/U001_OWNER_CONTRACT_AND_REMEDIATION.md`
and `docs/validation/issue-333/u002-resolution/`.
Owner amendment and new validation scope:
`docs/validation/issue-333/PRACTICAL_OWNER_DECISION_2026-11-01.md`.
