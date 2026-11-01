# Issue #333 / U-002 — protected HTTP delivery architecture (Proposed)

Status: **Proposed for Owner review; not Accepted; runtime implementation NOT authorized**.
Basis: audit branch `d8c342d5305fd688261312a7c777553ad3c1b4ac`;
`origin/main` `c638a437749cae1f78a8c8a417fd4d53e6a34920`.
Scope: F333-A, F333-B, F333-C1, F333-C2, F333-C3 only.

## Failure model and locked invariant

An authenticated Location Manager's SQL read takes a valid grant snapshot;
the SQL transaction commits; the HTTP handler pauses; a sensitive-MFA
Company Admin invokes the actual Staff Management LocationAccess revoke;
its transaction commits, deletes the grant and writes the audit; then the
earlier handler returns protected Location data. Five real-PostgreSQL schedules
confirm this pattern (see `../U001_OWNER_CONTRACT_AND_REMEDIATION.md`).
The original strict RED tests and evidence remain intact.

DEC-108: after **canonical grant revoke COMMIT**, no protected response bytes
belonging to that Location may finish server-side delivery to the former
grant holder. Request start, SQL snapshot, controller promise resolution,
JSON serialization and `response.end()` enqueue are **not** the delivery
linearization point. Node `ServerResponse.finish` (or already-terminated
`close` without successful delivery) is the proposed observable server-side
terminal event. Client receipt beyond server-side finish is not guaranteed
by DEC-108. Responses finished before revoke commit cannot be retracted.
Independently granted Locations and Organizations keep their own scope;
no broader Company Admin, Supervisor, inactive-Location or session rights arise.

## Preferred conditional mechanism: one-lease, bounded response fence

**Candidate, not yet a proven implementation:** for grant-dependent
Location Manager and eligible Supervisor Live Map readers **only**, a single
PostgreSQL backend leases an organization-scoped **session-level SHARED
advisory lock** under the existing `staff-management-org:<organizationId>`
hash domain. Resolve a persisted role hint before locking, then recheck
the exact role under the fence. On a role change, deny without emitting
protected data or release and retry on a completely unfenced CA branch.
The lock precedes the protected grant-authorization/projection snapshot;
all grant-dependent SQL runs on that same backend.
The SQL transaction ends normally, but the backend and session advisory lock
remain pinned until protected HTTP `finish`, or until the response has been
terminated without further protected emission. The canonical Staff Management
writer retains its existing **EXCLUSIVE transaction advisory lock**, acquired
before grant mutation and held through COMMIT/ROLLBACK. No writer change to
role, permissions, schema or audit is proposed by this narrow mechanism.

Ordering under an intact lease:

1. **Reader wins SHARED:** canonical writer cannot acquire EXCLUSIVE and
   therefore cannot commit the revoke until the reader's protected response
   reaches terminal server-side delivery and the reader releases SHARED.
2. **Writer wins EXCLUSIVE:** reader waits within a fixed lock budget; after
   writer COMMIT it obtains SHARED and performs a **new READ COMMITTED
   authorization**, then computes the projection using only surviving grants;
   if unauthorized it emits no private response. REPEATABLE READ Live Map
   snapshot MUST begin only after acquiring the session fence.
3. **Writer ROLLBACK or failed stale CAS:** writer releases EXCLUSIVE without
   a successful revoke; after fresh checking, originally valid access may
   proceed. Unknown COMMIT outcomes are classified by authoritative persisted
   grant and lock release, not by writer HTTP status.
4. **Two grant-dependent readers:** SHARED is compatible with SHARED; both
   may finish, then EXCLUSIVE writer commits. **Company Admin reads must
   bypass this SHARED session fence.** Their existing
   `authorizeCompanyAdminManagement` acquires an EXCLUSIVE transaction
   advisory lock on the same organization key even for GET requests
   (`management-authorization.ts:80-131`). Two CA readers holding SHARED
   and then asking for EXCLUSIVE would block each other; mixed CA/LM
   traffic can also wait. A fixed admission ceiling and response deadline
   bound grant-dependent reader waiting. Multiple Organizations use distinct
   existing hash keys; one request must not nest independently ordered
   organization locks.

This is a **server response lifecycle** design, not a long-running SQL
transaction: commit/rollback before serialization, no database transaction
open during network delivery. It still pins a PostgreSQL **connection**
and a session advisory lock until the response ends, with severe consequences
unless bounded. A second pool checkout while holding the witness is forbidden
at a four-connection development pool; the existing service's internal
`inPostgresTransaction(pool,...)` call must be adapted to reuse the same
leased backend if implementation is later approved.

### Required transport and failure state machine

| State | Permission to emit protected bytes | Fence ownership |
| --- | --- | --- |
| ADMITTED / buffered | No; size-limited response in memory | None until acquired |
| FENCED / query | No; recheck identity, grants, location and role on locked backend | One SHARED lease |
| READY / serializing | No headers or byte flush before fence validation | Same SHARED lease |
| DELIVERING | Only bounded non-streamed protected JSON; watch `finish` and `close` registered before awaits | Same SHARED lease |
| FINISHED | No more protected bytes; server has completed delivery | Release lock then lease |
| ABORTED | Destroy/terminate transport; verify it cannot emit remaining private bytes before relinquishing lock | Release once, disposing bad lease |

`finish` is completion of server output to the OS, **not proof of remote
client consumption**. `close` before `finish` is failed/aborted delivery,
not a successful response. `response.writableEnded` and an awaited handler
are not completion events. No `res.write`, `flushHeaders`, middleware
stream, automatic Nest serializer or compression flush may bypass the gate.
Existing `session-photo-controller.ts:94-168` provides a useful `finish`/
`close` cleanup precedent, but its `session-photo-delivery-fence.ts:85-117`
unlocks immediately after synchronous `response.end(bytes)` enqueue, hence
**is not a DEC-108 response fence**. Its safe enqueue approach may be reused
only with the longer protected lease lifetime and a new proof.

The response must have explicit max serialized bytes, a finite admission
queue, per-identity and per-instance in-flight limits, a monotonic delivery
deadline, and a disconnection AbortSignal. On saturation, timeout, error,
lost backend, unexpected early unlock or shutdown, **fail closed** by aborting
protected delivery and disposing the suspect connection. Do not release a
live response's SHARED lock merely to satisfy a timeout. Measure the gap
between terminal response event and successful unlock, pg backends,
`pg_locks`, `pg_blocking_pids()`, waiters, memory and p50/p95.

**Blocking unproven failure mode:** `common/database/postgres-lease.ts:107-125`
forcibly disposes an ordinary leased client on the existing transaction
budget or `error`/`end`, potentially releasing the session lock **before**
HTTP `finish`. It currently has no response-abort callback. The final
implementation must prove a fail-closed *abort-before-unlock* sequence
for normal deadlines and unexpected backend loss. A process/network crash
after bytes are enqueued but before `finish` needs separate fault-injection
evidence; do not infer exact delivery order from a successful query.

## Emergency/security disable: separate binding contract

DEC-081:19-34 says emergency/security disable blocks **new and current**
access immediately and revokes affected Staff sessions. Its canonical
controlled operator implementation in `apps/api/tools/security-disable/
persistence.ts:18-113` locks `staff-security-disable:<operationId>`, then
`staff-user-security:<userId>`, updates `users`, sessions, push and audit,
then commits. It **does not** take `staff-management-org`.

Therefore the organization fence *alone* does not protect an already
streaming response against concurrent global User disable. Naively adding
a response-held user SHARED lock would make the emergency writer wait behind
a slow browser, contrary to DEC-081. Neither treating emergency as ordinary
Location revoke nor extending DEC-108 automatically to logout/MFA is sound.

**Blocker E-001:** prove a cluster-wide **emergency preemption and acknowledgement**
path that interrupts every affected live protected delivery **and gates new
reader admission after cancellation acknowledgement until User disable
COMMIT**, without indefinite waiting or unapproved privileged grants,
or establish an Owner-approved, precise finite disable/delivery ordering rule
consistent with DEC-081. A process-local abort map alone is insufficient for
multiple API instances; PostgreSQL `NOTIFY` delivered *after* COMMIT is too
late to guarantee zero stale bytes. No such proven coordination exists in the
current audited paths. Until E-001 is resolved, even the preferred ordinary
revoke fence must **not** receive production GO.

## Mechanisms compared

| Alternative | Commit / delivery ordering | Gap, lifetime and availability assessment | Recommendation |
| --- | --- | --- | --- |
| Current shared **transaction** advisory lock | Protects SQL authorization only; ends at COMMIT | Nest HTTP send is later; five RED proofs | Reject unchanged |
| One-lease **session SHARED** org fence, bounded buffered HTTP | Existing EXCLUSIVE revoke COMMIT must wait for server-side `finish` | No ordinary check-to-send gap while lock survives; pins one PG backend; watchdog, emergency and crash proof outstanding | **Preferred candidate**, conditional |
| Two-lease independent witness + ordinary service query | Can hold org SHARED to finish | Risks pool starvation, especially max=4; lock queues/deadlocks, double acquisition | Reject for these five routes |
| Buffered body + unlocked final recheck or omission | Rechecks scope before `end()` | Revoke can commit between check and `finish`; mixed-Location aggregates can leak | Reject as sole mechanism |
| Authorization epoch/version | New persist/version writer or invalidation channel, plus final check | Epoch cannot close check-to-send alone; migrations/API policy out of scope | Not justified |
| Long SQL transaction to slow-client `finish` | Could serialize writer with row locks | Consumes transaction/connection, hits watchdog/idle limits, stalls emergency | Reject |
| Revocation waits only until `response.end()` enqueue | Synchronous boundary before Node flush | Node `finish` may happen later; DEC-108 specifically rejects handler/enqueue as completion | Reject |
| Force deny entire response if any grant changed | Prevents mixed-Location stale projection **only under an atomic delivery fence** | Safe fail-closed fallback; less availability than recompute | Conditional adjunct |

### Alternative-by-alternative engineering constraints

1. **Existing transaction advisory.** Authorize and read while SHARED xact
   is held; the canonical EXCLUSIVE writer linearizes at its COMMIT. The
   reader releases at its SQL COMMIT, so there is an unrestricted interval
   until Nest/Express `finish`: check-to-send remains. Only one short
   PG lease, ordinary SQL memory, current per-Org lock, pagination and
   rollback behavior are preserved. Slow HTTP clients, disconnect and
   emergency do not prolong SQL work, but can receive stale protected
   data. No lock-order innovation fixes its insufficient lifetime.
2. **Single session-level SHARED response fence (conditional candidate).**
   Grant-dependent reader acquires before its first authoritative snapshot,
   retains one backend to `finish`/confirmed abort; revoke COMMIT is the
   writer point. Independent org keys allow concurrency; an A+B
   Location reader needs one Organization fence and must not split an
   aggregate across unlocked B. Buffered, byte-limited JSON, explicit
   Node response lifecycle and a strict deadline are mandatory. A slow
   client pins one connection and delays ordinary writer; abrupt close
   should cancel. Cross-instance PostgreSQL advisory ownership is
   shared by the database, but backend failure/lease expiration may
   release before safe abort. CA EXCLUSIVE reader must bypass the SHARED
   branch; emergency User disable is on another domain. PostgreSQL
   COMMIT/ROLLBACK and ambiguous acknowledgement require persisted
   reconciliation; deadlock, pool starvation and preemption remain gates.
3. **Two-connection session witness.** Same temporal linearization as
   option 2 if the witness survives until HTTP `finish`, but an
   independent query lease can wait while a witness occupies one of
   four pool slots. Pair acquisition before locking avoids one hold/wait
   pattern at the cost of doubled per-request connections and reduced
   unrelated query availability. Mixed org grants, error/close, abort,
   memory buffering, emergency and backend-loss problems remain; a
   rollback on the query lease does not automatically release its
   witness. Not warranted for five finite JSON routes.
4. **Buffered recheck/filter immediately before `res.end`.** Can reuse
   current short DB pool leases; no advisory through network, cheap
   slow-client behavior and simple cleanup. The final SELECT or epoch
   can precede a revoke COMMIT by microseconds and Node `finish` by
   seconds: no defensible linearization between those. Mixed-Location
   `array_agg` counts, latest visit and cursors require a full
   recomputation; item filtering alone fails privacy. Writer rollback
   and ambiguous ack can be reconciled for fresh requests, but do not
   close the old response gap. Emergency commits quickly, yet old
   responses remain ungoverned.
5. **Version/epoch invalidation.** A durable authorization epoch would
   need a typed persisted contract and updates by every relevant
   canonical writer; a volatile cache is not cross-instance authority.
   A final version check has exactly the same check-to-send race unless
   paired with a response fence or atomic reader admission. PG connection
   need not persist for sending and memory could remain bounded; multi-
   membership/Org/Location epochs and CA exclusions require new
   semantics, migrations and tests. Abort, unknown commit, epoch
   rollover, emergency priority and rollback would be new protocols.
   No owner approval exists for them.
6. **Transaction/row lock through HTTP finish.** Reader authorization
   and response completion could exclude a writer COMMIT while a
   transaction retains conflicting row/advisory locks. It holds a PG
   backend **and open transaction** across slow network I/O; existing
   2s idle, 5s transaction and lease watchdogs terminate it. Deadlock
   and vacuum/MVCC cost increase; multi-Org ordering is nontrivial.
   Rollback can release before delivery, and emergency writers may
   wait on reader locks. Node cancel needs explicit rollback after
   abort. Rejected under current budgets and DEC-081.
7. **Durable admission/lease coordinator.** Atomically register a
   reader's protected-delivery ticket and prevent canonical revoke
   commit while tickets remain, including new admissions. It might
   free SQL connections during slow HTTP and model multiple
   Organizations/Locations precisely, but needs new persistent state,
   modified canonical writer, crash/TTL fencing, distributed
   acknowledgements, retry/rollback/unknown commit handling and
   explicit emergency priority. Expiring a lease while a live HTTP
   stream still runs recreates the same race. Memory and backpressure
   still require bounds. This is a materially larger, unapproved
   fallback, not an accepted redesign.

## Narrow authorization and projection policy

- F333-A: exact Location map; after lock, persisted exact grant, active role,
  active membership/User/org/location, Supervisor Shift, CA commercial/MFA
  rules remain unchanged. Apply the fence only to the LM/Supervisor
  operational branch. The CA fallback calls the EXCLUSIVE
  `authorizeCompanyAdminManagement` and must never hold an outer
  SHARED session fence. A CA's read is not made grant-based.
- F333-B: Location Manager's scope list; if a grant is revoked before fenced
  re-read, omit that Location, continue to show independently granted ones.
- F333-C1/C2/C3: Location Manager visit query has `array_agg` grants;
  search aggregates (`completedVisitCount`, latest visit, vehicles,
  phone projection) and cursor can be contaminated by a removed Location.
  Recompute the whole search/history under the post-writer scoped fence;
  fail-closed whole response if exact recomputation cannot be proved.
- The three CA Visit Contact GET paths also call EXCLUSIVE
  `authorizeCompanyAdminManagement`. They bypass the grant-dependent
  SHARED fence; a role change during the fenced LM request is denied
  rather than attempting an exclusive lock upgrade.
- Deny wrong Organization, absent grants, disabled actor, ineligible role/
  Shift, insufficient MFA and invalid session using existing error-concealment
  policies. Scope is membership × Organization × Location, never User-global
  grant. An inactive Location's eligible history is retained per DEC-094.
- Role downgrade, membership status, logout/refresh/replay and MFA changes
  are independently governed and require **separate** in-flight policy
  analysis; an ordinary LocationAccess revoke does not decide them.

## Owner design gates (none implicitly accepted)

1. **U-002/E-001:** select an emergency preemption protocol and prove
   multi-instance acknowledgement, bounded disable latency and no protected
   bytes after the accepted emergency linearization point.
2. **U-002/L-001:** authorize or reject the single-lease session-lock
   fence after fault-injection proves no lock can be lost while a protected
   response continues, including lease watchdog, backend death and shutdown.
   Include two CA readers, two LM readers, CA+LM, Supervisor and writer
   schedules without an EXCLUSIVE-under-SHARED upgrade.
3. **U-002/C-001:** approve explicit response max-bytes, maximum server
   delivery lifetime, per-instance admission ceiling and acceptable ordinary
   revoke wait bound based on real pool-pressure tests; no guessed SLO.
4. **U-002/P-001:** choose full fail-closed denial versus requery for a
   multi-Location visit aggregate when a grant changes; default safety gate
   is deny if scope equivalence cannot be proven.

Verdict at design stage: **DECISION REQUIRED**. This describes a concrete,
falsifiable candidate and smallest known envelope, **not verified GREEN**.
No production code, schema, migration, UI, runtime config or Accepted
Decision was modified for this package.
