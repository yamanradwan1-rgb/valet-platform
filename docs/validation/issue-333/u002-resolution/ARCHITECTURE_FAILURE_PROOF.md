# Issue #333 U-002 — protected response ordering and impossibility proof

Status: **PROPOSED architecture analysis; NOT Accepted; RUNTIME IMPLEMENTATION BLOCKED**.
Pinned source: `9079706ad322e87f6f33fb61335fdc3b6bfd2528`; main observation `c638a437749cae1f78a8c8a417fd4d53e6a34920`.
Security classification: five F333 current-runtime CONFIRMED VULNERABILITY; E-001 current-runtime **strict security RED**; L-001 single-PG-session-lock candidate **FALSIFIED**. No repaired-runtime GREEN is claimed.

## Normative guarantees and precise vocabulary

- Accepted `docs/decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md`: any HTTP response containing revoked Location A data must **complete protected server-side delivery before** its canonical LocationAccess revoke COMMIT; a response finishing afterward must provably exclude A-protected data. Starting a request, completing SQL, serializing JSON, entering a write callback, and a client's eventual receipt are different events. Other independently granted Locations retain their own authorization.
- Accepted `DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md`: emergency/security User disable denies **current and future** Staff access immediately and invalidates Staff sessions/attention endpoints. Organization membership lifecycle is distinct from global User disable.
- Accepted DEC-023/032/049/078/080/084/094 remain controlling for sessions, Shift, Live Map, MFA, Company Admin, Visit Contacts and inactive Location history. Neither contract silently elevates Location Manager to Organization-wide access.
- A **protected byte** includes any response content or metadata revealing location-scoped rows, counts, associations, cursor behavior or private error details. The current invariant is measured at the **terminal server-side response delivery boundary**, not at query completion.
- A **terminal witness** must prove that no server-controlled HTTP layer can complete further protected delivery for that response. An application-level `finish` observation is useful only if its exact semantics and lifetime are demonstrated; `close` alone is an abort signal and must confirm termination of future writes. An API-process kill does not by itself prove that already queued kernel/proxy/last-hop response bytes have finished or been discarded. Missing ACK, heartbeat expiration, database disconnect and lock expiration are not terminal witnesses. Client receipt *after* an already terminal server-side send is separately outside DEC-108.

## Current source and observed break

| Boundary | Current behavior | Consequence |
| --- | --- | --- |
| HTTP handlers | `apps/api/src/common/http/api-operation-runner.ts:58-96` resolves the handler's promise; Nest/Express performs response serialization afterward | Authorization transaction completion is not final protected delivery. |
| LocationAccess writer | `staff-management-mutation.service.ts:136-184` uses `inPostgresTransaction`, staff-management Organization advisory lock, target resolution, CAS grant mutation and audit; COMMIT ends DB transaction | Writers serialize within their established lock domain, but do not wait for HTTP terminal delivery. |
| Session | `staff-session-revalidation.ts:11-37` revalidates using `staff-user-security:<userId>` inside a short transaction | Session check does not fence a later HTTP send. |
| HTTP / DB lease | `postgres-lease.ts:40-127` releases on watchdog, backend error/end and cancellation independent of the HTTP socket | L-001 shows PostgreSQL lock loss need not revoke Node's capability to write. |
| Global emergency disable | `apps/api/tools/security-disable/persistence.ts:18-113` locks operation and User, marks User DISABLED, revokes StaffAuthSession and StaffPushRegistration, audits and commits | E-001 old HTTP200 survives despite successful global disable. |
| Existing race evidence | `u002-falsification/` and underlying test sources on 9079706a | F333 five RED; E001 RED; P001 mixed A+B stale-scope SQL; C001 pool4 capacity; real `40P01` upgrade deadlock. |

## Candidate protocol — defined for falsification, NOT yet deployable

A compliant candidate must provide all of the following **at the same trusted protection boundary**, otherwise the proof fails:

1. **Admission serialization.** Before any protected work may become deliverable, each API instance registers a per-request admission with organization, membership/user, exact Location scope, session generation and a monotonic fence generation. A global User emergency domain additionally spans all Org memberships. Atomic admission must be ordered with a canonical writer's fence. No new admission can pass an already fenced domain.
2. **Full-scope query.** The reader uses a verified, current location set for every row, aggregate, count, cursor and private field. Mixed A+B scope cannot retain A contributions when grant A is revoked. A correct recomputation must be re-fenced before bytes; full denial is permissible only while zero protected bytes have been emitted.
3. **Protected response ownership.** One transport owner must register the actual first protected byte and terminal event; a handler-return or buffered JSON-ready event is insufficient. Slow and streaming clients have an explicit bounded policy. A partially sent response can be aborted to prevent *future* bytes, but earlier bytes cannot be retracted.
4. **Writer fence before COMMIT.** The canonical writer atomically closes new admissions for the exact invalidating scope, waits for **credible terminal proofs** from every older relevant response (or a positively established loss of that response's egress capability), rechecks grant/CAS/MFA/writer authority, commits the mutation and audit, and preserves fence behavior until readers cannot enter with stale authority.
5. **Crash and uncertainty.** A durable registry may survive process and PostgreSQL connection loss, but a lease expiry alone cannot prove a remote live replica lost egress. A successful writer must receive verifiable terminal/egress-fence confirmation before COMMIT. On unknown COMMIT, retain conservative admission state until the canonical durable result is reconciled.
6. **Emergency.** Global User disable must be able to stop all current protected writes and deny new admission across every API instance; partial-stream interruption requires a trusted mechanism that can terminate old HTTP egress, not only revoke the Staff token or PostgreSQL session. No indefinite waiting is compatible with the required immediate protection.

### Reader state machine (conceptual)

| State | Permitted actions | Exit / witness |
| --- | --- | --- |
| NEW | Authenticate/session/MFA as contracted; no protected send | Atomic `admit` or deny against writer fence |
| ADMITTED | Bind User, membership, Organization, exact authorized Location set and generation | Protected SQL or fenced cancellation |
| QUERYING | Read authoritative data with consistent authorized scope | BUFFERED, DENIED or CANCELLED |
| BUFFERED | Validate complete protected projection and transport admission | First byte with continuing fence or deny whole response |
| EMITTING | May emit protected bytes **only while a trusted enforceable egress right remains held** | Terminal response witness, forced egress termination, or fail closed |
| TERMINAL | No further protected writes possible (finish/confirmed abort/egress kill) | Durable terminal ACK; release admission |
| UNKNOWN | Missing ACK, remote partition, lease loss or backend termination | **Not equivalent to TERMINAL**; block writer or externally prove egress fencing |

### Writer state machine (conceptual)

| State | Actions / linearization | Failure handling |
| --- | --- | --- |
| OPEN | Canonical identity, target, MFA, CAS and tenant checks; no mutation yet | DENIED on failed authorization |
| FENCING | Atomically stop new relevant admissions, including the global User domain for disable | Missing coordination authority => do not claim safety |
| DRAINING | Collect credible terminal witnesses or enforce network-egress isolation of all older relevant responses | Timeout => **UNKNOWN**, not "safe" |
| READY | Confirm no old relevant process can write, and check authoritative scope/CAS | Stale CAS/rollback => unwind with safe admission revalidation |
| COMMITTING | Durable LocationAccess mutation + audit; this PostgreSQL COMMIT is writer's mutation linearization point | Unknown acknowledgement => reconcile durable result; no optimistic unfence |
| COMMITTED | Revoke visible to all new admissions; no old protected bytes may cross after this instant | Keep generation invalidation even if writer HTTP reply fails |
| ROLLED_BACK | No revoke; reopen only with durable proof of rollback and refreshed admission | Never replay assumed partial success |
| UNKNOWN | Commit or fence outcome not yet known | Fail closed on implicated scope and reconcile with canonical DB state |

This state model is **a required protocol shape, not a correctness assertion**: the missing trusted cross-instance egress witness is implementation-critical.

## Conditional writer/reader linearization argument

Given assumptions **A1** atomic scoped admission and writer-fence ordering; **A2** all HTTP egress paths (including buffers/queues through the last server-controlled hop) obey the fence; **A3** a writer receives a non-forgeable *terminal response* or *trusted loss-of-egress and discard of any unsent protected bytes* witness for every older admitted protected response; **A4** the fence remains active across COMMIT and retries; **A5** every protected derivation uses current exact scope:

- A new reader admitted **after fence** cannot transmit affected data (A1/A2).
- An old reader whose terminal witness is received **before COMMIT** cannot transmit affected data after COMMIT (A3).
- An old reader whose delivery is still active prevents a successful COMMIT until trustworthy egress termination, or COMMIT does not occur (A3/A4).
- A revoked A projection cannot be smuggled into B's counts or cursor (A5).
- Therefore no affected protected byte can finish server-side after COMMIT **only conditional on A1–A5**. Current infrastructure does **not** demonstrate A2/A3 for live partitioned instances; this is not a deployed solution.

Do not treat a SQL read lock, `COMMIT` success, coordinator heartbeat, TTL, Nest handler completion, or a signal sent to an unacknowledging worker as satisfying A3.

## Replica failure and network partition: impossibility counterexample

Consider two histories indistinguishable to coordinator and writer B:

| Time | World D — A actually dead | World P — A live, coordinator-partitioned |
| --- | --- | --- |
| t0 | A authenticates and buffers private Location A response | Identical |
| t1 | A loses DB/coordinator connectivity, cannot ACK | Identical externally |
| t2 | A process permanently crashes | A remains alive with A-to-client writable socket |
| t3 | B sees missed heartbeat / expired PG lease | Identical observations |
| t4 | B uses timeout and allows revoke/disable COMMIT | Identical B action |
| t5 | No A response possible | A resumes and delivers A bytes after COMMIT: **DEC-108 violation and possible DEC-081 violation** |

If B blocks at t4 in both histories until definitive terminal ACK, safety is retained at the cost of potentially **unbounded writer delay**, contradicting immediate emergency disable availability. If B commits based on failure suspicion, P is unsafe. Neither durable tickets nor an in-memory coordinator nor PostgreSQL advisory locks change this indistinguishability.

**Current infrastructure: ARCHITECTURE BLOCKER.** To break the indistinguishability, Owner must authorize and independently validate a component that can *forcibly prevent every potentially live API instance from further protected egress*, including existing sockets, with an authoritative confirmation **before COMMIT**, while preserving the emergency deadline. Candidate process termination, ingress draining or instance quarantine is insufficient until it proves established connections cannot keep writing. A network partition may also isolate the control path to that enforcement plane. The formal proof therefore demands explicit failure-domain and fencing guarantees, not only a protocol diagram.

## Emergency disable separate proof obligation

The global User writer is not the per-Organization LocationAccess revoke. It uses the `staff-user-security:<userId>` advisory domain, revokes all StaffAuthSessions and push registrations and commits once with audit. Short admission revalidation does not stop an already authenticated handler from later emitting. E-001 confirms old protected HTTP200 after canonical disable COMMIT in two genuine Nest processes; a fresh request correctly denies. Under P world above, a coordinator-only cancellation cannot revoke the live socket. A compliant implementation must (i) stop new admissions worldwide, (ii) terminate every affected current server-side protected response before disable COMMIT or before the required immediate disable point, (iii) prove the termination even under a live unacknowledging replica, and (iv) reconcile unknown commits. Without authoritative egress quarantine, **no design GO** is supportable.

## Partial responses and mixed-Location privacy

- If protected bytes have already been transmitted before COMMIT, they cannot be recalled; DEC-108 does not rewrite history. A response containing A data still must reach verified server-side terminal delivery before the revoke commits.
- If the response is partly written and revoke must commit, the fence must prove the process will never send further protected bytes before COMMIT. A later `res.end` or reader abort request without acknowledgement is not proof.
- For an A+B contact search, the entire SQL projection and visibility including row inclusion, latest session/Location, associated vehicles, completed visit count, returningContact, next cursor, pagination and errors is dependent on A+B. Retaining B authorizes only a newly and completely B-scoped derivation.
- Option A: restart the **entire** query under a provably current B-only scope with protected delivery still fenced. Option B: deny the entire response **before first protected byte**, or verified abort further delivery if already emitting; do not label a partly delivered HTTP200 as safe.
- P-001 actual held boundary was **after initial authorization array capture and before aggregate SQL**. The separate after-SQL A+B schedule is currently UNVERIFIED.

## Required decision

**DECISION REQUIRED**, not READY TO IMPLEMENT. D-001 and D-002 require a trusted egress-fencing authority or an Owner-approved explicit fail-closed degradation policy; D-003–D-006 refine containment, durability, mixed-query behavior and measurable capacity bounds. Source falsification and synthetic proposed proof do not constitute a real distributed GREEN.
