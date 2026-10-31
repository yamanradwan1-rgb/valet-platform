# Issue #333 U-002 — falsification result and architecture design gate

Status: **Proposed architectural disposition, not Accepted. Runtime
implementation NO-GO; Owner decision required.**
Source baseline: `a4f5f2c6589b6be01b7db99cac4e6829986007f1`.
This record supplements and **supersedes the conditional mechanism preference**
in `../u002/ARCHITECTURE_DECISION.md` and `../u002/IMPLEMENTATION_HANDOFF.md`
where the new empirical counterexamples contradict it. Those earlier
documents are preserved as the pre-falsification design history.

## LOCKED contractual boundaries

- `DEC-108:17-42`: after canonical LocationAccess revoke COMMIT, no
  revoked-Location protected HTTP data can finish server-side delivery to
  the former grant holder, even from an older request. A prior SQL
  projection, handler promise and response enqueue are insufficient.
- `DEC-081:19-34`: emergency/security disable revokes current **and new**
  Staff access immediately, with session/attention invalidation and honest
  custody state. Global User disable is distinct from membership-scoped
  deactivation and ordinary LocationAccess revocation.
- `DEC-023/032/049/078/080/084/094`: persisted User, Staff session,
  membership, exact Location grants, eligible Supervisor Shift, CA MFA,
  visit-contact privacy and inactive-Location historical scope are preserved.
  Do not infer independent role/session/MFA in-flight rules from U-001.
- No StateMachine/Task/Dispatch transition, database model, API or UI policy
  changes are approved. The five original F333 LocationAccess RED proofs
  are retained and **no runtime fix has been implemented**.

## Proven adverse interleavings

1. **L-001 (falsified candidate):** real `boundedPostgresPool` lease
   watchdog or actual PostgreSQL backend termination releases a
   session-level SHARED `staff-management-org` lock **before** Node HTTP
   `finish`. A canonical, MFA-assured CA POST revoke waits, then commits
   and deletes A while the synthetic response remains writable. The
   late response then finishes with a protected synthetic marker.
   `w2/README.md` (original 2/2 experimental PASS) contains verified
   backend PIDs, `pg_blocking_pids`, committed grant absence and cleanup.
   The probe is a synthetic HTTP reader, so this disproves the **uncoupled
   session-lock mechanism**, not an as-yet-unimplemented five-route fix.
2. **E-001 (confirmed runtime disclosure):** two real compiled Nest API
   processes and the *supported* controlled global User-disable CLI.
   A previously authorized Dashboard Location read pauses **after real SQL**.
   The disable commits, a separate SQL witness proves User DISABLED,
   Staff session revoked and one audit, then HTTP `finish` returns **200**
   with a private synthetic Location name. Fresh and queued requests return
   **401**. The original W3 run and two independent Prime runs are all RED:
   `w3/EMERGENCY_W3_RESULT.md`,
   `PRIME_E001_INDEPENDENT_REPRODUCTION.md`. This violates
   `DEC-081` current-access policy in the tested scope.
3. **P-001 (confirmed current C1 disclosure):** an A+B LM contact search
   captured its grant-dependent `viewer.locationIds` before canonical
   revoke A. After the POST **201** and persisted A grant count **0**,
   the old request executed aggregate SQL with that stale A+B list.
   Its HTTP response included A's
   synthetic plate and a two-visit aggregate. The fresh B-only response
   excluded A, preserved B and counted one visit. The original C1/C2/C3
   RED tests remain strict. See
   `PRIVACY_P001_SOURCE_AND_TEST_GATE.md`. Row filtering after projection
   would retain unsafe count/latest/vehicle contributions, so it cannot
   be asserted sufficient.
4. **C-001 (capacity):** real PostgreSQL pool max 4 with four held HTTP
   responses leaves no free backend. Five contended connection-acquisition
   samples had local p50/p95 **386/386 ms**, vs 0/0 ms rounded
   uncontended; a finite 350ms acquisition budget rejected the fifth
   request. No production p95 or SLO claim follows. The intact-lease
   synthetic writer waited behind real SHARED until HTTP `finish`;
   backend-loss falsification makes that conditional result insufficient.
5. **CA/LM lock-order:** real PG17 tests prove CA+CA EXCLUSIVE serialization,
   CA+LM two-way compatibility order, LM+LM SHARED/EXCLUSIVE writer waits,
   a true `40P01` two-sided upgrade deadlock, a stale LM role hint after
   canonical CA downgrade, and pool max4 pressure. A separate real
   authenticated MFA CA writer returned 201 and one audit after the synthetic
   LM SHARED holder released. See `w5/lock-order-experiment.md`.
   **CA must never acquire its current EXCLUSIVE authorizer while retaining
   a proposed SHARED session fence.** These are SQL/probe boundaries,
   not five-route protected response GREEN tests.

## Mechanisms compared after falsification

| Mechanism | Commit vs delivery linearization | Failure / resource analysis | Current disposition |
| --- | --- | --- | --- |
| Current transaction advisory | SQL COMMIT/rollback, then Nest HTTP writes separately | Five established REDs; unrestricted check-to-send gap | Reject unchanged |
| **One leased session SHARED until `finish`** | Writer EXCLUSIVE waits only while same PG backend survives | Actual watchdog/backend death releases first; no response abort ownership; four slow readers exhaust dev pool | **REJECT as proposed** (L-001 RED, C-001) |
| Final SQL authorization/epoch check + JSON buffer/filter | Query finishes before network `finish` | Revoke can commit between recheck and send; mixed Location aggregates contaminate cursor/count | Reject as sole protection |
| Long SQL transaction through slow HTTP | Lock retained while backend survives | Backend death still loses lock; MVCC/pool/transaction costs and emergency priority unacceptable | Reject |
| Process-local cancellation map | Local response close when signal arrives | Canonical operator and other API instances do not share it; after-COMMIT `NOTIFY` arrives too late | Reject as sole protection |
| **Cluster-wide admission/terminal-response coordinator** | Writer establishes an authoritative **prepare gate**, excludes new tickets, interrupts/drains relevant readers and obtains terminal acknowledgement **before revoke COMMIT**; reader admission rechecks persisted authority | Requires trustworthy replica discovery, authenticated cancellation, stalled/dead process fencing, bounded wait, rollback/retry and possibly new persisted state; proof absent | **Conditional design investigation, not selected/Accepted** |
| Whole-response fail-closed denial for sensitive grant-dependent reads | Deny/abort before any private bytes; independently authorized B may be temporarily unavailable | Product availability regression; before/after transition still needs proof for requests already emitting | Conditional temporary containment requiring separate Owner GO |

## Why no exact U-002 runtime protocol can yet be selected

A PostgreSQL session lock has a **failure domain different from the Node HTTP
socket**. The database can release it on backend termination while the
application remains capable of writing protected bytes. A timeout callback
cannot establish an atomic *abort-before-unlock* when the backend disappears
first. Merely lengthening the lease budget hides the failure.

The existing controlled emergency writer uses
`staff-security-disable:<operationId>` then
`staff-user-security:<userId>`, not
`staff-management-org:<organizationId>`. Ordinary grant writer uses the
organization domain. A User-level response-held lock could indefinitely
delay emergency disable behind a stalled browser, violating `DEC-081`.
An after-COMMIT broadcast cannot prevent in-flight stale delivery.

A viable cross-instance coordinator would need to make admission, cancellation
acknowledgement, terminal server-side delivery and writer COMMIT one
provable ordering model. It must not treat a TTL expiry as permission to
commit while an unreachable yet live API process can later resume sending.
On instance crash, prove the process/socket can emit no later bytes;
on partition, either fence that process from the network or refuse an
unsafe writer COMMIT. Emergency must stay bounded: decide what happens when
an instance cannot acknowledge. These require a new explicit Owner
architecture/persistence decision; no existing accepted primitive proves
the full protocol.

## Smallest provisional implementation envelope (after a distinct GO only)

**Definitely relevant:** the five named controllers/readers and current
authorizers under `tracking/live-map-*`,
`dashboard/dashboard-scope-discovery.*`,
`management/management-visit-contact-*`; the real Staff Management
`/location-access/revoke` executor; Nest/Express response ownership;
`postgres-lease.ts`, `bounded-postgres-pool.ts`,
`postgres-transaction.ts`; and exact session/MFA/grant validation.
The Visit Contact *entire query/cursor* is a consumer of scoped grant data.

**Conditional on Owner choice:** canonical controlled
`tools/security-disable/persistence.ts` and its session-preemption
boundary; a narrowly scoped cluster-wide delivery coordinator (potential
persistent ticket state, new safe inter-instance signaling and bounded
admission); full Visit Contact query recomputation vs whole-response denial.
Explicitly reassess existing database indexes/constraints **if** a persisted
protocol is authorized; invent none during this task. Respect
300-physical-line modules and approved modular monolith.

**Not justified:** API/public schema redesign, new roles, MFA relaxation,
changing ValetSession or Task state, new untyped settings, generic auth
engine, implicit migrations/grants, changes to other read families without
their own tests, and **all Dashboard/Policies Studio UI changes**.

## Owner decision gate

- **D-001:** Authorize a new *design* for a cross-instance response-admission,
  precommit cancellation and terminal acknowledgement protocol, with
  explicit handling of dead/unreachable replica and active sockets. Existing
  single-lease design is rejected on test evidence.
- **D-002:** Specify the emergency disable's bounded completion/fail-closed
  behavior under a non-acknowledging but potentially live instance, consistent
  with already Accepted `DEC-081`; do not reinterpret immediate access.
- **D-003:** Decide whether a temporary deny-all grant-dependent
  response containment is acceptable while a provable coordinator is built.
  This would be a **separate runtime remediation GO**, not authorized here.
- **D-004:** If a persisted coordination mechanism is selected, approve
  an explicit new schema/transaction/grant decision and its verification
  contract separately. Existing owner freeze remains in force until then.
- **D-005:** For mixed-Location Visit Contacts, choose complete safe
  recomputation or fail-closed denial when grant scope changes. Never filter
  only returned rows.
- **D-006:** Review measured memory/response bytes, per-instance admission,
  transaction/writer latency, cancellation and pool capacity from a proposed
  implementation before setting operating limits. No production SLO inferred.

**Planning verdict: DECISION REQUIRED. Independent design verdict:
IMPLEMENTATION NO-GO. Security verification result: CONFIRMED VULNERABILITY —
REMEDIATION APPROVAL REQUIRED, for the tested DEC-081 reader-first path
and existing five DEC-108 RED paths.**
