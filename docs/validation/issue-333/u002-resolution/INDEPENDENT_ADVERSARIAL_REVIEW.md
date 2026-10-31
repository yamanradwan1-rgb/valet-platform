# Issue #333 U-002 — independent adversarial security design review

Scope: review of source and owner design-only architecture at pinned base `9079706ad322e87f6f33fb61335fdc3b6bfd2528`, including Prime's new `ARCHITECTURE_FAILURE_PROOF.md`, `ALTERNATIVES_AND_RESOURCE_BOUNDS.md`, `TEST_AND_FAILURE_MATRIX.md` and `OWNER_DECISION_GATE.md`. Reviewers were READ-ONLY. Their analysis does not substitute for unexecuted fault injection or a runtime GREEN.

## Actual workers and independence

| Executed COS worker | Own isolated scope | Review result / exclusions |
| --- | --- | --- |
| worker-14 | Cross-instance admission, reader/writer ordering and live partition counterexample | Independent static architecture analysis, **NO-GO**; did not author runtime implementation |
| worker-15 | PostgreSQL Organization/User lock domains, COMMIT unknown, DB lease/pool/deadlock | Read-only independent SQL/transactions, **NO-GO**; reviewed archived PG evidence without rerunning a new candidate |
| worker-16 | HTTP controllers, Nest/Express response lifecycle, socket `finish`/`close`/abort | Read-only source and prior Node transport experiments, **NO-GO** |
| worker-6 | Global emergency disable, DEC081, User session invalidation | Read-only E001 independent from its earlier L001 authoring, **NO-GO**; explicitly excluded approving own L001 |
| worker-8 | C1/C2/C3 LocationAccess privacy and A+B aggregate evidence | Read-only P001 audit and JSON-number test-failure discovery, **NO-GO**; explicitly excluded self-review of E001 which it had previously authored |
| worker-17 | Independent adversarial challenge of Prime docs and live-but-partitioned replica | Read-only final challenge, **NO-GO**; independently caught wrong C2/C3 route text and P001 evidence imprecision; corrected in Prime's docs |

Six specialist Worker conversations actually executed in this current design round. Earlier failed or unavailable worker startup attempts are **not** counted as review. All six used isolated worktrees and did not change production files. Workers 14/15/16/6/8 independently reviewed their **source-specific scope at pinned 907**, and their reports preceded some final Prime wording; **worker-17 alone** independently inspected all new Prime documents after draft and checked the corrected C2/C3 routes against the real controller. Do not count six independent reviews of the final five-file draft.

## Adversarial P0–P3 findings

| Level | Finding and confidence | Evidence / exact limit | Action gate |
| --- | --- | --- | --- |
| P0 | No newly established P0 in design/test-only scope | All reviewed implementation sources remain untouched; no new production exploit claim | Maintain diff scope and tests |
| P1 — **CONFIRMED** | Global security disable E001 allows current protected HTTP delivery after User DISABLED COMMIT | Real authenticated two-Nest-instance PG17 W3 + two independent Prime strict RED runs; persisted revoked StaffSession/audit before old protected HTTP200; fresh401 | DEC081 current-access contract violated; emergency runtime NO-GO |
| P1 — **DERIVED design blocker** | Live A unreachable to coordinator but still client-writable defeats bounded-timeout writer COMMIT | D/P indistinguishability in `ARCHITECTURE_FAILURE_PROOF.md`; not a newly executed distributed partition experiment | No TTL/heartbeat/missed ACK as proof of terminal; trusted egress-fence operational decision required |
| P1 — **FALSIFIED candidate** | PG session advisory response fence can disappear while HTTP egress continues | L001 real backend kill/watchdog and canonical revoke, plus Node transport proof; the observed 40P01 lock upgrade | Reject response-held session lock and uncoordinated upgrade; no contention GREEN |
| P2 — **CONFIRMED** | F333 five old LocationAccess protected GET disclosure races | Original authenticated PG17 strict RED, no repaired runtime | Preserve unchanged strict RED; Owner approval required for remediation |
| P2 — **CONFIRMED** | P001 A+B C1 mixed projection leaks revoked A and numeric completed count2 | Revoke A HTTP201, persisted A grant0, old HTTP200 A synthetic plate + numeric 2, fresh B-only numeric1; pre-aggregate-SQL gate | SQL scopes/aggregates/cursors all protected, must recompute or deny; after-SQL A+B unverified |
| P2 — **evidence precision resolved** | P001 archived assertion compared JSON count to quoted string | Archived test expected `"completedVisitCount":"2"` rather than numeric JSON `"completedVisitCount":2`; failed in callback before shared strict invariant | Prime corrected **only numeric type literals** and reran task-owned PG17 `bc0fcd5495b54eaf80afd357778a234a`; now strict RED at original helper line160 (4 FAIL/2 PASS), source hash recorded in evidence |
| P2 — **capacity/security** | Holding DB backend through slow HTTP can exhaust bounded connection pool | C001 synthetic four-slot test; N=5 saturated acquisitions (p50/p95 386/386 ms), N=5 uncontended and one separately blocked writer | No DB connection pinned through response; set D006 guardrails |
| P2 — **unverified breadth** | Global disable coverage outside five targeted GETs has not been proved | Staff User disable is global, includes other sensitive reads/streaming/attention; current E001 is targeted route | Define downstream consumer enumeration before global transport design |
| P3 — **precision** | Node HTTP `finish` and gate signal need exact semantics; small samples are not SLOs | Node prior transport-only 9/9, 24MiB backpressure, `close` without finish, delayed downstream receipt | Require true no-further-egress witness at chosen boundary and bounded sample counts |

No reviewer asserted a positive cross-tenant exploit beyond tested private sentinels, or claimed a new protocol's safety from paper reasoning alone.

## Independent falsification questions

1. **Can absent acknowledgement imply dead?** No: live-partitioned A and crashed A are indistinguishable to writer B/coordinator. A can write to its client after B COMMIT unless egress capability is positively removed. Timeout and durable ticket cleanup do not change this.
2. **Can "last SQL check" or a Nest handler return be a delivery fence?** No: source runner returns before Express emits and a check-to-send gap persists. `res.end` being called does not establish all protected bytes are terminal.
3. **Can the gateway terminate current protected sockets?** No gateway/sidecar implementation or network topology was supplied or proved. LB draining or stopping new admissions is insufficient for existing HTTP responses. A trusted final-hop enforcer is a **conditional requirement, not an accepted recommendation to deploy an unspecified component**.
4. **Can emergency wait for every slow reader?** Unbounded waiting contradicts the accepted immediate global User disable; an abort request lost to live A is not proof of safety.
5. **Does retaining Location B justify an A-derived count/latest/cursor?** No. The A+B private aggregate must be recomputed from B alone or response denied before protected bytes; C2/C3 history and pagination/returningContact require the same complete proof.
6. **What about rollback or uncertain COMMIT?** Release of fence is permissible only on verified rollback/reconciliation; retry must respect canonical CAS/audit/op identity. A lost HTTP/CLI acknowledgement is not a PostgreSQL rollback.
7. **Did historical suite PASS mean RED fixed?** No. Original F333 and E001 remain security FAIL. L001/P001/C001 characterization outcomes can describe vulnerabilities. The two P001 numeric assertions are test-only evidence hygiene; unchanged strict no-private-marker assertion remains active.

## Final independent review gate

**IMPLEMENTATION NO-GO / DECISION REQUIRED.** Worker-17 independently challenges the final design and confirms the live-but-partitioned-replica gap, DEC081 current-response gap and unsatisfied trusted egress-fence premise. Workers 14/15/16/6/8 concur through separate scopes. Evidence proves present vulnerabilities and falsifies earlier proposals; it does **not** prove a safe current candidate, and no repaired-runtime GREEN is available.

Owner must decide D-001/D-002 first: whether and how a positively enforceable cross-instance response-egress authority can terminate even a live, unacknowledged replica's established client sockets **before a bounded canonical disable/revoke COMMIT**. D-003–D-006 then define fail-closed containment, durable recovery, complete mixed-Location projection policy and capacity/deadline limits. No Worker, Prime or reviewer may mark this protocol Accepted, merge, deploy, or close Issue #333.
