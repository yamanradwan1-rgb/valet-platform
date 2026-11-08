# DEC-112 — Issue #442 U-003 Historical Task Outcome In-Flight Release

Status: **Accepted — exact Issue #442 U-003 owner policy; technical implementation and Gates A/B NOT QUALIFIED**
Date: 2026-11-08
Issue: #442
Version: 3 (Owner's explicit bounded-residual policy acceptance; historical v2 preserved by Git)
Source baseline: `8302243e13d860543e8f95e6bdfb6d8080cd9974`
Approval: Owner's Issue #442 COS Prime continuation directive, 2026-11-08.
Security gate: **Gate A technical qualification pending; no production/HTTP authorization implied.**

## Problem and accepted owner policy

U-003 may reveal only a purpose-bound, canonical historical outcome for an exact
Retrieval Task to a Staff principal who is **currently** authorized in exactly
one eligible operational scope and has the required historical Task relationship.
An exact-Task historical relationship by itself is not authorization. The owner
**explicitly accepts** a final full protected authorization check close to the
last preventable application handoff and a strictly bounded in-flight interval.
Only a previously authorized, exact, minimal reason enum may finish in that
interval after later Task/authority change. If **current authorization is
invalid** before final protected proof, there is no positive. A Task mutation
committed before proof instead requires a fresh exact-Task/Request/Session
history evaluation: it may yield a canonical positive only when current
authorization and the new evidence independently support that result.
Each new request rechecks persisted authorization.
Suppress a still-preventable response on known applicable security revocation,
best-effort; an unobserved post-proof race is an accepted limited residual.
Never deliver a positive beyond token/absolute expiry at controllable handoff.
No general historical disclosure, cross-tenant permission, protected-command
replay, Guest/vehicle fields, streaming, background job or other endpoint.

The real PostgreSQL policy witness in `tmp/u003/u003-late-release-policy-witness.test.ts`
observed a Force Shift End after the last protected read and before the test-only
function return, while the previously buffered `GUEST_CANCELLED` stayed positive.
No shipping Outcome GET exists; the witness is not a production exploit.
The Owner now explicitly accepts a bounded version of this residual, not
unrestricted release or an authorization failure already present at proof.

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
- DEC-108 separately authorizes bounded LocationAccess completion, not an
  expansion of **other** endpoints. This new owner-approved U-003 decision
  expressly covers the listed reason-only late Shift/role/logout/MFA/Task
  categories. DEC-081 retains mandatory best-effort cancellation following
  global User disable, without last-byte guarantees. Other accepted auth,
  rotation/refresh, MFA, handover, tenant and stronger contracts remain binding.

## Accepted final authorization point; technical mechanism unqualified

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
  and any independently required known credential/security cancellation before its last
preventable handoff. NestJS interception/serialization and physical socket
transmission are distinct phases. No atomic PostgreSQL-to-final-byte guarantee
is asserted. The owner explicitly accepts **only** the bounded, reason-only
unobserved post-proof residual for the sixteen classes below. Known applicable
security revocations must cancel preventable delivery best-effort, and token
expiry at controllable handoff always suppresses a positive. Repeated SQL
reads cannot detect every commit after final COMMIT. The technical mechanism
remains blocked at Gate A pending evidence; no last-byte guarantee is made.

## Sixteen-category policy — Accepted for Issue #442 only

Every row requires fresh authorization for a new request after change.
`Before` means the change committed before the final complete locked proof;
`after` is a change committed after final COMMIT and before the controllable
response handoff. Uncommitted concurrent writers must serialize or cause safe
contention. `Bounded` permits **only** the already-authorized minimal enum
while both ceilings hold. A known applicable security loss triggers
best-effort preventable-response suppression, not a new authority check after
COMMIT. No cross-tenant exception or credential expiry waiver exists.

| Change | Synchronization / final check | Before | After / delivery rule | Status and mandatory tests |
| --- | --- | --- | --- | --- |
| 1 Normal Shift End | Active Shift SHARE NOWAIT; canonical end writer | Conceal if no eligible Shift | Bounded prior outcome | **Accepted U-003**; both orders, handover restrictions |
| 2 Force Shift End | Exact Shift SHARE NOWAIT; Force End row writer | Conceal | Bounded prior outcome | **Accepted U-003**; real management HTTP writer |
| 3 Membership disable | All User Memberships SHARE NOWAIT; ACTIVE | Conceal | Bounded; cancel known disable | **Accepted U-003**; no Membership inheritance |
| 4 Role downgrade | Exact field role; Membership SHARE NOWAIT | Conceal ineligible role | Bounded; cancel known role loss | **Accepted U-003**; no new field roles |
| 5 LocationAccess revoke | Current grant rows/writer fence | Conceal revoked Location | Bounded under DEC-108 | **Accepted DEC-108 + U-003**; fresh grant reads |
| 6 Organization/Location deactivate | Org/Location SHARE NOWAIT; ACTIVE | Conceal ineligible scope | Bounded exact prior outcome | **Accepted U-003**; lifecycle unchanged |
| 7 Global User disable | User ACTIVE/share + security advisory | 401/auth lost | Best-effort cancel, bounded unobserved race | **DEC-081 retained**; no new User authority |
| 8 Logout | Exact StaffSession FOR UPDATE NOWAIT; revoked_at | 401/auth lost | Cancel known logout; bounded unobserved race | **Accepted U-003**; no session reuse |
| 9 Staff Session revoke | Exact session ID/token/createdAt/revoked_at | 401/auth lost | Cancel known revoke; bounded unobserved race | **Accepted U-003**; no invented generation column |
| 10 Access token rotation | Exact hash/session + User advisory | Old token rejected for new request | Bounded late rotation; protect legitimate refresh | **Accepted U-003**; no false 401 |
| 11 Access/absolute expiry | DB clock + conservative monotonic projection | 401/auth lost | **Never positive after expiry at final controllable handoff** | **Accepted stricter U-003**; independent expiry fence |
| 12 Applicable MFA loss | Existing context-required assurance only | Deny when applicable | Cancel known loss; bounded unobserved race | **Accepted U-003**; no Employee/Supervisor MFA invention |
| 13 Direct Task transfer | Exact Task/versioned Dispatch/Audit/latest owner | Recompute or neutral | Bounded prior canonical outcome | **Accepted U-003**; transfer-back negative |
| 14 Task cancellation | Original Task/Request/Session under locks | Canonical result or neutral | Bounded exact proven guest cancellation | **Accepted U-003**; no sibling/new Task substitution |
| 15 Task completion | Terminal Request/Session/Handoff/release/custody | Canonical result or neutral | Bounded previously proven completion | **Accepted U-003**; READY/HANDOFF_PENDING never terminal |
| 16 Eligible-scope change | User advisory; all rows and absent-row insertion fences | Exactly one eligible scope or neutral | Bounded only previous one-scope result | **Accepted U-003**; real Shift activation both orders |

In this matrix `Deny` means no historical positive and existing authenticated
error classification must still be preserved. `Neutral` means no evidence-backed
reason, not a proof that an invalid credential is authenticated. All statuses,
response mappings and concealed behavior require Gate B real-route review.

## Accepted qualification ceilings, not production performance SLO

Owner-authorized **qualification limits**: a 2,000-ms total request admission
through last preventable application handoff, and at most **150 ms from completion
of the final full protected proof to that application handoff**, starting
**before COMMIT** while the locks are held. Slow or uncertain COMMIT must not
reset or extend this clock; only confirmed COMMIT permits a positive. Both
values are **ACCEPTED FOR IMPLEMENTATION/TESTING, NOT TECHNICALLY PROVEN**.

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

## Technical gates after owner acceptance

1. The Owner has accepted the sixteen-category, reason-only bounded in-flight
   policy and the 2,000-ms/150-ms initial ceilings. Do not request this risk
   acceptance again. Preserve stronger Accepted Decisions; qualify the
   mechanism and its actual HTTP handoff separately.
2. Actual PG17 owner-attested reader-first and writer-first barriers, including
   fake history, multi-membership, token/logout/expiry, Task changes and actual
   Force Shift End after the last DB snapshot. Record timings and cleanup.
3. Prove the one-deadline lifecycle across real pool and HTTP boundary; protect
   rollback/COMMIT uncertainty and no idle-in-transaction or late positives.
4. Fresh independent Read C Code Review must sign off. Only then may Gate A
   approve controlled Backend implementation; real registered NestJS HTTP
   security approval then precedes five-message Employee Native wiring.

**Current verdict: GATE A BLOCKED — INSUFFICIENT TECHNICAL EVIDENCE.**
Owner policy is **Accepted**, but its source/PG/HTTP implementation is NOT
security-qualified. This does not modify DEC-108/DEC-081, authorize the
production endpoint before Gate A, authorize Native before Gate B, or permit
PR/merge/deployment/Issue closure.
