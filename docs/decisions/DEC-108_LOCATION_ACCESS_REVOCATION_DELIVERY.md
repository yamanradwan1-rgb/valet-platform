# DEC-108 — LocationAccess Revocation and Protected Response Delivery

Status: Accepted (Owner security contract; **design and verification only** under Issue #333)
Date: 2026-10-31
Owner: VAYLET product owner
Source: Owner direction on U-001, VAYLET Issue #333

## Context

Issue #333 real PostgreSQL verification observed a reader returning already-read,
Location-protected Live Map or Management Visit Contact data after a canonical
`LocationAccess` revocation succeeded and committed. The previously unresolved
U-001 concerned the allowed lifetime of a pre-authorized in-flight read.

## Accepted owner security rule

**Once a canonical LocationAccess revocation has successfully committed, the
former grant holder must not receive protected data belonging to that revoked
Location. This applies even to a request that started and initially authorized
before the revocation but has not finished delivering its protected response.**

The authoritative scope is the persisted Organization, membership, role,
Location grant and applicable session/MFA state, not a client-selected Location,
cached Dashboard context, earlier authorization snapshot or previously assembled
response. Data from independently authorized Locations may remain available,
but the revoked Location must be removed or the protected response denied.
Cross-Organization data is never available through the revoked or retained grant.

For testing and implementation review, the server must establish an ordered
authorization/revocation boundary through completion of protected HTTP response
delivery. A pre-revocation SQL read or completed handler promise alone is not
proof that data was delivered before the writer committed. Responses that
finished delivery before commit are not retroactively retractable. Client-side
network receipt after the server has completed delivery is a distinct transport
question; this decision does not authorize client receipt tracking or a new
public protocol.

The accepted result may be obtained by serializing the revoke commit behind the
reader's protected delivery or by safely denying/omitting the revoked projection
before delivery. Implementation must prove that no check-to-send gap permits
revocation commit before the protected bytes are sent. Success of a fresh read
after revocation cannot establish the in-flight rule by itself.

## Relation to existing Accepted decisions

- **DEC-023** (`docs/08_DECISIONS_LOG.md`, staff authentication): a credential
  resolves a persisted User and session; it is not an authorization claim for
  Organization, membership, role or Location. Any allowance concerning already
  resolved session/logout requests cannot be applied by analogy to a revoked
  `LocationAccess` grant. This decision does not rewrite credential rotation,
  logout, expiry, refresh or replay rules.
- **DEC-049**: Live Map/route access requires current exact-Location grants,
  role and, for Supervisors, an eligible active Shift; live data is private.
- **DEC-032 and DEC-045/046**: Shift eligibility is per membership, and map
  tracking remains Task-scoped. U-001 grants no wider surveillance rights.
- **DEC-078/080**: Company Admin read and revocation authority remains subject
  to exact Staff session, current persisted membership and required MFA.
- **DEC-072/075/076/079**: Native session transport, privacy-safe Staff push
  attention/fencing, and distinct tenant/account audit scopes are unchanged.
- **DEC-081**: canonical Staff Management writers retain CAS, current authority,
  handover blockers, audit and transaction rules. Its emergency/security disable
  blocks **new and current** access immediately and revokes affected sessions;
  that stricter protection is never weakened by ordinary U-001 processing.
- **DEC-084**: private visit contacts and associated visits remain restricted to
  the viewer's actual Organization/Location scope; no broader people directory.
- **DEC-069**: Returning-visit recognition still does not create a customer
  ownership claim or a general employee contact directory.
- **DEC-094**: deactivated Locations retain eligible historical records.
  Location inactivity is not equivalent to revoking a member's grant.

No Session, ValetSession, Task, audit, API, role or database-schema contract is
changed by this decision. Role downgrade, membership deactivation, User/session
disable, MFA revocation and concurrent grant writers still require their own
accepted-contract assessment; U-001 must not silently invent stronger rules for
those distinct events.

## Consequences and implementation gate

Existing RED evidence for Live Map and each of the three Visit Contact routes
now violates this accepted rule and is a **confirmed authorization disclosure**
inside the demonstrated local PostgreSQL schedules. Severity and scope remain
bound to actual proof; this does not establish production exploitation or a
cross-tenant bypass. The P1-B Location-directory response-delivery race is
separately demonstrated in the follow-up evidence; other schedules still
require their own proof.

Under Issue #333 only a sanitized verification record, disposable PostgreSQL
tests, independent review and a proposed narrow remediation are authorized.
**No runtime authorization, lock, isolation, schema, migration, API, policy,
configuration, Dashboard UI or Policies Studio change is approved.** A separate
Owner implementation GO is required after review of lock lifetime, latency,
rollback, cancellation, pool pressure and emergency-disable semantics.

Full evidence and conditional implementation design:
`docs/validation/issue-333/U001_OWNER_CONTRACT_AND_REMEDIATION.md`.
