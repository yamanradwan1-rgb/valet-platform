# Issue #416 security foundation

Status: Proposed authentication architecture. Audit event reservation authorized.

The later Owner instruction conditionally selects Option A for design only.
The current detailed proposal and remaining decision gates are in
[Option A authentication provenance](issue-416-option-a-authentication-provenance.md).
The comparison below is historical preparation, not a request to reopen A/B.

The Owner brief of 2026-11-13 authorizes diagnostics and compatible fixes.
Its Gate B requires independent review and explicit Owner approval before a
material authentication architecture change. This document requests that
decision and records the independently implementable audit reservation.

## Contract ledger

| Classification | Proposition | Authority |
| --- | --- | --- |
| LOCKED | Preserve opaque Staff credentials and session lifecycle | DEC-023, DEC-072 |
| LOCKED | Sensitive MFA is exact-session and at most five minutes old | DEC-078 |
| LOCKED | Reset requires current Company Admin and tenant entitlement | DEC-080, Issue #416 A/G |
| LOCKED | Runtime SQL capabilities alone cannot establish reset issuer authority | Owner remediation brief section 3 |
| LOCKED | Runtime cannot freely append either reset audit event | Owner Gate D, DEC-079 |
| DERIVED | Reject those exact event names before generic append and replay | Reservation and existing generic append boundary |
| UNRESOLVED | Trusted writer or authenticated provenance mechanism and custody | Owner Gate B |
| UNRESOLVED | Effective deployment observability can protect a raw SQL bearer | Owner Gate C |

The reservation affects AccountSecurityAuditEvent append policy. There are no
ValetSession, Task or Dispatch transitions, Location policy changes or new
Company-default/Location-override behavior. Authentication discovery concerns
User, StaffAuthSession, StaffRefreshCredential, MFA factors/recovery codes,
OrganizationMembership and Organization. No reset endpoint is mounted.

## Threat boundary

| Caller | Required protection |
| --- | --- |
| A anonymous internet caller | Bearer validation, trusted ingress admission, generic failures |
| B lower-privilege Staff | Current exact role and tenant checks |
| C Location Manager | Protected reset issuance denied |
| D Company Admin | Current session, recent MFA, eligible target, entitlement |
| E normal SQL runtime role | Cannot create authoritative issuer/MFA evidence or reset audit facts |
| F DB-readable session IDs/verifiers | Possession alone grants no reset authority |
| G compromised application and all its secrets | Outside the proposed E/F guarantee |
| H database administrator | Outside the proposed E/F guarantee |

Column grants and persisted predicates are source evidence. They do not establish
a completed account takeover. End-to-end impersonation has not been executed.
The reset SQL issuer boundary has no runtime implementation yet.

## Current authority and lifecycle

`mfa-runtime-privileges.mjs` configures session INSERT and selected UPDATE rights.
`staff-auth.service.ts` uses those writes after password verification and during
refresh rotation. `staff-session-context.ts` resolves access through persisted
session facts. `mfa-session-repository.ts` writes and reloads exact-session MFA.
`staff-auth-credential.ts` implements the accepted unkeyed SHA-256 verifier.

Any new trusted mechanism must cover login, refresh lineage, MFA enrollment,
verification/recovery, factor retirement, admin activity, logout and revocation.
It must also account for runtime-callable provisioning, activation and role
writers that can change the future issuer's authority. A signature over current
mutable database facts alone does not establish original authentication.

DEC-023 preserves fifteen-minute access and thirty-day absolute sessions.
DEC-072 preserves Web/native transport and refresh replay revocation. DEC-078
preserves eight-hour assurance, thirty-minute inactivity and five-minute sensitive
freshness. Refresh cannot extend MFA. DEC-075/076 retain session-bound push
behavior. Current User, membership, Organization and entitlement remain
authoritative after the applicable locks.

## Architecture options requiring Owner decision

| Property | A authenticated narrow writers | B authenticated provenance |
| --- | --- | --- |
| Boundary | Narrow SQL commands authenticated by application proof | Signed/MAC evidence bound to genuine authentication ceremonies |
| Ordinary SQL role | Sensitive writes removed after consumers migrate | Writes may remain but cannot create accepted evidence |
| Login | Command proof follows actual password verification | Initial evidence follows actual password verification |
| Refresh | Command verifies authenticated rotation lineage | Prior authenticated lineage required before new evidence |
| MFA | Protected factor lifecycle and exact-session assurance commands | Authenticated factor lifecycle plus exact-session ceremony evidence |
| Custody | App proof key unavailable to E/F, private database verifier custody | App signing key unavailable to E/F, private or public verification custody |
| Schema | Command functions, ACL changes, bounded replay state | Versioned evidence, key identifiers and protected replay/retirement state |
| Risk | Missing a sensitive writer during migration | Missing a signing oracle or trusted lineage dependency |
| Rotation | Define key overlap, retirement and proof expiry | Define key overlap, retirement and legacy evidence policy |
| Rollback | Disable reset and retain restrictive ACLs | Disable reset and retain evidence/history while rejecting unknown proof |

Option A with a bounded operation proof is recommended for detailed review. It
can retain the current single application pool, opaque credential formats and
database-authoritative revocation while reducing direct sensitive writes and
avoiding reusable access bearers in reset SQL. Its proof issuer still needs
independently authenticated password/refresh/MFA provenance. This remains a
proposal, with no approval or implementation-readiness claim.

Option B remains a candidate for detailed review if its complete lineage and upstream authority
writers are protected. Replay/retirement state must be inaccessible to ordinary
runtime writes so older evidence cannot restore consumed or revoked authority.
It introduces more evidence persistence and key/legacy-session handling. Both
options require independent SQL and application review.

A separately credentialed privileged application writer is another possible
boundary, but DEC-025 currently supplies only the ordinary runtime DB credential.
The single-pool infrastructure contract and docs/17 also prohibit an unapproved
parallel runtime pool. That alternative requires explicit amendments and has
greater deployment and credential-management impact. No external secrets service
or microservice is assumed.

## Concurrency, recovery and compatibility decisions

Map the current email, User-security, MFA session/User, Organization and factor
locks before selecting commands. Test login/refresh, MFA/logout, disable/verify,
role/session validation and concurrent rotations with commit, rollback and
unknown-commit outcomes. Authenticated evidence cannot replace live revocation.

Specify the transition for old sessions and app versions, proof establishment
after genuine login/MFA, refresh lineage, key retirement and outage recovery.
Reject unsupported or absent proof at reset. Do not weaken existing opaque
credential or MFA policy while deciding the new provenance representation.

## Secret confidentiality

The current resolver sends a verifier to SQL. The proposed original reset
definer would additionally receive a reusable access bearer. PostgreSQL statement,
bind, error and extension logging need effective pre-call evidence before that
addition. Function-local settings cannot establish confidentiality before entry.

Repository query measurements use bounded categories. This does not attest
deployed tracing agents, SQL proxies, reverse proxies or log collectors. Test
success, error, rollback and cancellation using nonsecret canaries, reporting
presence/absence without the values. Deployment settings remain unverified.

Reference [PostgreSQL 17 logging](https://www.postgresql.org/docs/17/runtime-config-logging.html).

## Authorized audit reservation and rollout

The new migration replaces only the generic runtime audit wrapper, rejecting
the two exact reset event names before private append or retry lookup. It retains
the signature, SECURITY DEFINER, fixed search_path, owner/ACL behavior and existing
controlled-operator denial. It changes no history or session/MFA/password state.
The private append delegate remains denied to runtime and PUBLIC.

Apply after migration 111 only through a separately authorized release. Existing
application versions emit no reset events and remain compatible. Keep the
reservation during application rollback. Removing it reopens the audit gap.
A future approved reset command must derive issuer USER and redemption ANONYMOUS
actors, append atomically, and correlate immutable event IDs from its private row.

Tests must cover reserved denial before identical-ID replay, preserved legitimate
event retry/conflict/rollback, PUBLIC/private ACLs, immutable existing history,
fresh migration history and upgrade behavior. These prove the reservation only.

## Owner decision required

Option A's direction has subsequently received conditional Owner design approval.
Its proof custody and exact writer/lock contracts still require finalization.
The selected design must explicitly cover upstream authority writers, proof-key
custody, rotation, legacy sessions, lock compatibility and replay recovery.
DEC-023/072/078 define existing behavior and DEC-080 requires current authority.
They do not select this new E/F trust boundary. Gate B of the Owner brief requires
approval before implementing it. Authentication remediation and the remaining
Issue #416 feature stay blocked until that decision and all proof gates pass.
