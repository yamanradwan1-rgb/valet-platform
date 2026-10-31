# Issue #333 U-002 — independent final adversarial design review

Status: **READ-ONLY review; production implementation NO-GO.**
Review target: audit/issue-333-u002-falsif-prime following four isolated
worker test commits and Prime test-only integration. The independent reports
preceded Prime's last E-001 post-extraction rerun; that later result is separately
documented below. No reviewer approved their own authored tests.

## Reviewer independence

| Reviewer | Independently challenged | Self-review exclusion |
| --- | --- | --- |
| COS worker-3 (W5 author) | W2 L-001, W3 E-001, Prime P-001/C-001, source scope and evidence timing | Own W5 locks |
| COS worker-8 (W3 author) | W2 L-001, W5 PostgreSQL/MFA writer, Prime P-001/C-001, DEC-108 and DEC-081 | Own W3 E-001 |
| COS worker-6 (W2 author) | W3 E-001, W5 lock graphs, Prime P-001/C-001, cleanup and design | Own W2 L-001 |
| COS worker-4 (W4 author) | Early read-only challenge of W2/W3/W5 and Prime P-001/C-001, plus Node HTTP 9/9 | Own W4 transport |
| COS worker-1 | Earlier independent Accepted Decision and five-route architecture review | No current test authorship |

Four COS worker authors participated in this falsification round; additional
attempts to attach workers failed. The prior design reviewer and final
cross-reviewers are not counted as seven new independently executing workers.
Reviews were read-only and inspected actual source, local sanitized evidence,
and the pending diff.

## Independent P0–P3 findings

| Severity | Finding | Tested evidence and precise limit | Disposition |
| --- | --- | --- | --- |
| P0 | No new P0 introduced by test/doc-only diff | No runtime, UI, API, schema, grant or migration edits in reviewed scope | No new P0; no broad certification |
| P1 | E-001 current-access disclosure after emergency User disable | Two real compiled authenticated Nest API processes, supported disable CLI, independent PG17 User DISABLED/session revoked/audit witness, old private HTTP 200 after COMMIT, fresh/queued 401; original W3 and two independent Prime strict FAIL 1/1 | **CONFIRMED VULNERABILITY** under DEC-081 in this route/schedule |
| P1 design | L-001 one-session advisory response fence falsified | Real backend death/watchdog releases SHARED lock; actual MFA CA revoke commits, synthetic HTTP still finishes protected 200; W2 and Prime 2/2 each | Reject sole session-lease mechanism; no five-route GREEN |
| P1 design | Lock-order deadlock and stale role hint | Real PG17 W5 6/6 SQL and MFA CA 1/1; actual sampled 40P01, test also permits 55P03; live role changed after stale hint | Future locks require ordering and role revalidation |
| P1 privacy | P-001 Location A+B C1 visit-contact leak | Canonical revoke A 201, persisted grant 0, old HTTP 200 contains A synthetic plate/count2, fresh B-only count1; stale viewer A+B captured **before** revoke, aggregate SQL **after** revoke | **CONFIRMED VULNERABILITY** in tested C1, after-projection A+B still UNVERIFIED |
| P2 capacity | C-001 max-four database pool exhaustion | Four synthetic paused HTTP leases occupy four real PG backends; fifth times out, contended local p50/p95 386/386 ms; 2/2 PASS adverse observation | Candidate capacity hazard, no production SLO |
| P2 existing | Five F333-A/B/C1/C2/C3 protected LocationAccess REDs | Historical accepted #333, original W4 C1/C2/C3 deliberately still fail; no repaired runtime exists | Confirmed DEC-108 defects; no GREEN inference |
| P2 evidence | Initial P-001 gate timing claim inaccurate | Reviewers located gate after authorization, before aggregate SQL | Prime corrected architecture, privacy and test matrix; after-SQL A+B schedule UNVERIFIED |
| P3 | General-purpose diagnostic sanitizer coverage | No secret observed in inspected logs, but hypothetical unexpected child error strings are not fully proven redacted | Preserve sanitized-only external evidence |

## Resolved disagreements and nonclaims

1. L-001 and C-001 tests PASS when they successfully demonstrate an
   **unsafe architecture property**. W3/W4 strict security assertions FAIL;
   neither result establishes security GREEN.
2. P-001 scope was captured before revoke, while private SQL was executed
   afterward. This still proves the observed stale-authority disclosure and
   aggregate contamination. It is not an after-SQL gate experiment.
3. W5 sampled an actual 40P01 deadlock; the assertion tolerates bounded
   40P01 or 55P03, not a guaranteed identical SQLSTATE on every run.
4. Postgres lock ownership and the Node HTTP socket are different failure
   domains. A timeout or connection-end callback cannot prove an abort was
   effective before backend lock loss.
5. Canonical global User disable uses a per-User security-lock domain;
   ordinary LocationAccess revoke uses an Organization lock domain.
   Organization-only SHARED fencing cannot by itself enforce DEC-081.

## Evidence, cleanup and residual uncertainty

- Exact commands and result IDs are in CONSOLIDATED_TEST_AND_FAILURE_MATRIX.md.
  All private runs used task-owned PostgreSQL 17 and reported removed=True
  or the equivalent 0/0 cleanup; historical retained W3 PGDATA untouched.
- Prime integration after helper extraction: API typecheck, ESLint,
  architecture and 300-line check, private-CI classifier 2/2, focused
  Prettier, and diff check **PASS**. Latest fresh E-001 private run
  16ef8938d9734a0f9666ec8fe2385bf0 is **strict RED FAIL 1/1** again:
  disabled witness 2026-10-31 23:05:30.862Z, old private HTTP 200 finish
  23:05:30.869Z, fresh 401; owned cluster removed. This specific rerun
  occurred after the reviewers' snapshot and is Prime-verified.
- #319 89/89 and #315 28/28 **PASS**; original W4 three REDs retained
  alongside new P-001 strict RED and two authorization negative PASS tests.
- UNVERIFIED: repaired five-route HTTP delivery, post-projection A+B,
  partial-byte socket abort, dead or partitioned API replica, lost
  cross-instance cancellation ACK, true PostgreSQL unknown COMMIT,
  cross-Organization multi-membership/role/MFA in-flight races and
  production-like pool or latency conditions.

## Independent verdict

**IMPLEMENTATION NO-GO.** None of the reviewed mechanisms provides a proven
cross-instance ordering of reader admission, revocation COMMIT, in-flight
protected HTTP terminal delivery and emergency disable. A new design must
survive real database backend loss, live but unreachable API replicas,
slow/stalled/partially emitted HTTP, disconnects, rollback/ambiguous writer
outcome and bounded connection pressure. Emergency must preempt current
access without indefinite waiting.

**Test-only evidence is reviewable** after final scope checks, with RED
assertions preserved. This is not authorization for a runtime fix, PR,
merge, deployment, schema changes or issue closure.

Owner design decisions D-001–D-006 are recorded in
U002_FALSIFICATION_DESIGN_GATE.md. Planning verdict: **DECISION REQUIRED**.
Security conclusion: **CONFIRMED VULNERABILITY — REMEDIATION APPROVAL
REQUIRED**.
