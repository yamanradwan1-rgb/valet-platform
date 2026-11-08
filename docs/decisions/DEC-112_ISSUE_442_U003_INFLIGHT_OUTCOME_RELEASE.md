# DEC-112 — Issue #442 U-003 Historical Task Outcome In-Flight Release

Status: **Proposed — Owner direction approved in principle; specific revocation exceptions, numeric limits and Gate A NOT accepted**
Date: 2026-11-08
Issue: #442
Version: 2 (qualification proposal; architecture reconciliation only)
Source baseline: `cded4e5ec5fed591f321ec983a5e2d46d0f66554`

## Problem and owner-authorized direction

U-003 may reveal only a purpose-bound, canonical historical outcome for an exact
Retrieval Task to a Staff principal who is **currently** authorized in exactly
one eligible operational scope and has the required historical Task relationship.
An exact-Task historical relationship by itself is not authorization. The owner
provisionally approved a **final protected authorization check close to the last
preventable application response handoff**, followed by a short, demonstrably
bounded in-flight interval. This is not a blanket post-revocation exception.

The real PostgreSQL policy witness in `tmp/u003/u003-late-release-policy-witness.test.ts`
observed a Force Shift End after the last protected read and before the test-only
function return, while the previously buffered `GUEST_CANCELLED` stayed positive.
No shipping Outcome GET exists; the witness is neither a production exploit nor
an owner acceptance of that delivery.

## Invariants already binding (not new exceptions)

- A new request, retry, resumed application, new authorization decision or
  background operation must never reuse a previously successful authorization.
- Deny unknown or foreign Task IDs without exposing whether the resource exists.
- Require current persisted User/StaffSession/token, active eligible field
  Membership/Organization/Location/grant/Shift, **one** eligible scope, exact
  Task/Session/Request relation, proven historical Membership ownership or direct
  transfer, and canonical committed Dispatch/Audit/terminal witnesses.
- When authority changed before the final protected point, fail closed. Ambiguous
  history, contended locks, uncertain transaction state, errors, and expired
  deadlines may never produce a historical positive.
- Already-transmitted HTTP bytes cannot be revoked. No indefinite streaming,
  protected-command replay, new Audit/Dispatch write, schema change, or generic
  role-based historical-read entitlement is authorized.
- DEC-108 authorizes bounded LocationAccess-in-flight completion for previously
  authorized requests, **not** Shift/role/logout/MFA/Task exceptions. DEC-081
  permits only **best-effort** response cancellation after global emergency
  User disable, with no last-byte guarantee. Existing auth/refresh/rotation and
  stronger source contracts remain authoritative.

## Proposed exact authorization linearization point

For a **positive U-003 reason**, the authorization point is the **final complete
protected Staff, User, scope, Task and canonical-history proof while its
PostgreSQL transaction holds every required lock**, before a confirmed COMMIT.
The primary qualification candidate is **one final full protected transaction**
after avoidable asynchronous preparation. A second **full** protected read is
an optional fallback only if the real HTTP pipeline demonstrates unavoidable
asynchronous work separating preliminary proof from final response preparation.
When used, the first read is preliminary and supplies no reusable authority.
An eligibility change or Task
mutation committed before the final read's protected snapshot must be observed
or cause a bounded NOWAIT/serialization failure. The reader holds the per-User
security transaction advisory fence and NOWAIT locks on StaffSession, User,
all relevant Membership/Organization/active Shift/Location/grant rows, and the
authorized Task/Session/Request rows. These locks end at final transaction
COMMIT, **not** at NestJS serialization or socket write. The originating query
must check exact history under those locks. All writer synchronization claims
require real writer-first and reader-first PostgreSQL tests; future writer
insertion paths must not be presumed covered merely because existing rows lock.

After a successful final COMMIT, the response is merely **eligible** for one
bounded application handoff; it is not a credential for future reads. The
application must confirm remaining monotonic budget, in-process abort state,
and any independently required credential/security cancellation before its last
preventable handoff. NestJS interception/serialization and physical socket
transmission are distinct phases. No atomic PostgreSQL-to-final-byte guarantee
is asserted. For classes without an accepted in-flight exception, positive
release remains **blocked at the gate** unless a qualified synchronization
mechanism can enforce their stricter delivery rule. Repeated SQL reads cannot
detect every revocation committed after the final protected transaction and
before HTTP handoff. No last-byte suppression is claimed.

## Revocation matrix — proposed, not automatically accepted

Every row requires a fresh denial for a request admitted after revocation.
`Before` means the change commits before the final protected read; `after`
means it commits **after that read's COMMIT** and before preventable handoff.
`U-003 owner decision` means provisional direction does not itself settle the
class. `Bounded proposed` is an exception to accept explicitly, not existing
authorization.

| Change | Synchronization / final check | Before | After / delivery rule | Status and mandatory tests |
| --- | --- | --- | --- | --- |
| Normal Shift End | Exact active Shift SHARE NOWAIT; canonical end writer row UPDATE | Neutral | Bounded proposed | **U-003 owner decision**; both commit orders, stale Shift, active Task blocker |
| Force Shift End | Exact Shift SHARE NOWAIT; Force End writer Shift update | Neutral | Bounded proposed | **U-003 owner decision**; real HTTP 201 before/after point, fresh GET denies |
| Membership disable | All actor Membership rows SHARE NOWAIT, active status | Deny | Suppress unless new exception | **U-003 owner decision**; handover/CAS and races |
| Role downgrade | Membership SHARE NOWAIT, exact field role eligibility | Deny | Suppress unless new exception | **U-003 owner decision**; Employee→non-field, both orders |
| Location Access revoke | All current grant rows SHARE NOWAIT; synchronized grant writers | Deny | Bounded previously-authorized completion per DEC-108, if all other controls hold | **Already accepted narrowly**; revoke before/after, new GET denied |
| Organization/Location deactivate | Organization/Location SHARE NOWAIT, active checks | Neutral | Suppress unless new exception | **U-003 owner decision**; canonical deactivation writer order, new GET |
| Global User disable | User SHARE NOWAIT + security advisory; User ACTIVE | Deny | Best-effort cancel; cannot guarantee last byte | **DEC-081 accepted narrow residual**; disable before/after, no fresh auth |
| Logout | Exact StaffSession FOR UPDATE NOWAIT, `revoked_at` | Auth lost | Suppress if preventable; no assumed completed-byte guarantee | **U-003/credential rule unresolved**; before/after, revoke visibility |
| Staff Session revocation | Exact Session FOR UPDATE NOWAIT, revocation generation | Auth lost | Suppress if preventable | **U-003/credential rule unresolved**; races and cached-response negative |
| Access Token Rotation | Exact token hash/createdAt/Session under lock, User advisory | Auth lost for old token | Suppress if preventable; preserve accepted refresh semantics | **U-003/credential rule unresolved**; rotation-before/after, no false 401 on legitimate refresh |
| Access-token / absolute expiry | PostgreSQL clock check and monotonic deadline; no writer lock suffices | Auth lost | Suppress if preventable; never treat whole-request budget as token lease | **Stricter pending verification**; expiry at every stage, no post-expiry new GET |
| MFA assurance loss | Current applicable assurance/factor state, required session/MFA guards | Deny when applicable | Suppress if preventable; no new field-role MFA requirement | **U-003/credential rule unresolved**; privileged/context-specific losses |
| Direct Task transfer | Exact Task SHARE NOWAIT, versioned Dispatch/Audit and current owner | Recompute/neutral | Bounded proposed only for previously verified exact outcome | **U-003 owner decision**; A→B, B→A, competing owner changes |
| Task cancellation | Task/Request/Session protected rows and committed cancellation evidence | Recompute/neutral | Bounded proposed only if outcome remains canonical at point | **U-003 owner decision**; guest cancellation vs new Task |
| Task completion | Task/Session/Request locks; terminal release/custody proof | Recompute/neutral | Bounded proposed only for previously verified reason | **U-003 owner decision**; READY/HANDOFF_PENDING negatives |
| Eligible-scope change | User advisory + all Membership/Shift/grant/Location rows and writer insertion fences | Recompute; only exactly one eligible scope | Suppress unless new exception | **U-003 owner decision**; second real Shift/membership both schedules and ineligible duplicate |

In this matrix `Deny` means no historical positive and existing authenticated
error classification must still be preserved. `Neutral` means no evidence-backed
reason, not a proof that an invalid credential is authenticated. All statuses,
response mappings and concealed behavior require Gate B real-route review.

## Quantitative proposal, not accepted measurement-backed SLA

Provisional engineering **test targets**: a 2,000-ms total request admission
through last preventable application handoff, and at most **150 ms from completion
of the final full protected proof to that application handoff**, starting
**before COMMIT** while the locks are held. Slow or uncertain COMMIT must not
reset or extend this clock; only confirmed COMMIT permits a positive. Both
values are **PROPOSED, NOT ACCEPTED** pending evidence and owner approval.

The existing single-transaction Read C local measurements (25 warm samples)
reported exact-Task p95 65.205 ms / max 274.359 ms, and 41-Membership p95
56.279 ms / max 100.331 ms. These are *not* two-transaction, full HTTP,
socket, cold-pool or production-load measurements. The chosen budgets provide
testable starting ceilings, **not** proof that NestJS can guarantee them. The
in-flight interval is a separate authorization lease from the total budget:
both must remain valid at handoff. A stalled event loop may exceed the lease;
the application must recheck elapsed monotonic time and withhold its positive.
Network delivery after the handoff is expressly outside any last-byte bound.

One admission-time monotonic clock must cover resolver/interceptor, pool lease,
BEGIN, all lock/SQL/history operations, COMMIT, optional preliminary transaction,
ROLLBACK/failure handling, pool release, response preparation and handoff.
Every protected operation receives remaining time; timeout/abort return no
positive; an uncertain transaction discards the connection; delayed leases
are released; asynchronous backend-PID cancellation must not target a reused
connection. A post-COMMIT token check alone is **not** a full scope recheck.

## Alternatives and residual risk

Preferred A (one final complete protected transaction) avoids redundant proof
round trips, lock contention and an additional uncertain-COMMIT lifecycle when
all avoidable asynchronous preparation precedes it. Fallback B (an earlier
preliminary proof plus a second final complete proof) is justified **only** by
demonstrated unavoidable asynchronous work between proof and preparation; it
detects commits between the reads at greater database/timeout cost. Neither
A nor B removes the post-final-COMMIT authorization-to-HTTP race. The existing
global Staff response interceptor performs awaited User-only SQL after the
controller, while the operation runner awaits its observer: a controller
return or test-only handoff hook is **not** the real HTTP adapter boundary.
Qualification must measure and enforce the lease/abort/deadline at that final
preventable boundary. Alternative C
(revocation until final HTTP byte) requires a separately approved cross-instance
writer/egress protocol; it is not implementable merely with PostgreSQL locks.

Even B can send a reason that became stale immediately after the final COMMIT.
There is no guarantee of no late revocation, network-delivery timing or client
receipt. Response contains only the approved enum, with `Cache-Control:
no-store`, no personal/vehicle/guest/actor identifiers, and no polling.

## Qualification and owner approval gates

1. Owner explicitly accepts or rejects each **U-003 owner decision** and
   credential/security-sensitive category above; decide whether to accept or
   change the 2,000-ms total / 150-ms post-proof-before-COMMIT **proposal**.
2. Actual PG17 owner-attested reader-first and writer-first barriers, including
   fake history, multi-membership, token/logout/expiry, Task changes and actual
   Force Shift End after the last DB snapshot. Record timings and cleanup.
3. Prove the one-deadline lifecycle across real pool and HTTP boundary; protect
   rollback/COMMIT uncertainty and no idle-in-transaction or late positives.
4. Fresh independent Read C Code Review must sign off. Only then may Gate A
   approve controlled Backend implementation; real registered NestJS HTTP
   security approval then precedes five-message Employee Native wiring.

**Current verdict: GATE A BLOCKED — POLICY DECISION REQUIRED.** This document
does not modify DEC-108/DEC-081, mark a new decision Accepted, implement a
production route, or authorize PR/merge/deployment.
