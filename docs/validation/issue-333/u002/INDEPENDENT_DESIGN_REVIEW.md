# U-002 independent security design review — final read-only verdict

Reviewer: **COS worker-1**, revived as the independent U-002 W7 reviewer.
Final source review against Prime branch
`audit/issue-333-u002-response-delivery-design`, HEAD at review time
`a840a6fd18e57e23c1c45a104ae32e02168da3dc`.
The reviewer inspected actual accepted DEC-108/081, the five HTTP paths,
canonical revoke, PostgreSQL lease and response hooks, and the Prime
architecture, dependency, test and handoff drafts. **No implementation
was authored by the reviewer; no new PostgreSQL test was run by them.**
Prime added an alternative-comparison explanation and this review record
after the review; neither changes the reviewed candidate's gates.

**Independent verdict: NO-GO for production runtime implementation.**
Isolated task-owned test-only falsification experiments are permissible,
but cannot be presented as a GREEN fix. The five original accepted
DEC-108 disclosures remain CONFIRMED from prior real PG/HTTP evidence.
This report is an adversarial **design** verdict, not another reproduced
vulnerability or an approval for a security change.

| Severity | Classification and finding | Exact evidence and required response |
| --- | --- | --- |
| P0 | None independently demonstrated | No claim of production exploit, cross-tenant disclosure or MFA bypass |
| **P1 design blocker L-001** | PG backend death, lease watchdog, `error` or `end` may release response-held session SHARED advisory at the **database** before Node can abort a still-writable HTTP response. A callback attached to PG connection cannot prove abort-before-unlock. | `apps/api/src/common/database/postgres-lease.ts:107-125`; `runtime-postgres-policy.ts:3-10`; `ARCHITECTURE_DECISION.md`. Require fail-stop fault injection and a stronger ordered protocol if counterexample persists. No GO. |
| **P1 design blocker E-001** | DEC-081 global User emergency disable uses `staff-user-security:<userId>`, not org advisory. A concurrent protected old response can continue; a SHARED user fence could stall emergency behind a slow client. Cross-replica cancellation acknowledgement **and new-admission fencing before emergency COMMIT** are unproven. | `docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md:19-34`, `apps/api/tools/security-disable/persistence.ts:18-113`; no proven multi-instance precommit protocol. No GO. |
| **P1 discovered, design corrected; untested** | Initial SHARED-on-every-reader proposal caused SHARED→EXCLUSIVE lock upgrade: Company Admin GET itself calls `authorizeCompanyAdminManagement` which requests EXCLUSIVE org xact; two CA readers can deadlock each other, mixed CA+LM readers can stall. | `management-authorization.ts:80-131`, `live-map-read-authorization.ts:42-55`, `management-visit-contact-authorization.ts:119-141`. Prime narrowed proposed SHARED session fence to grant-dependent LM/Supervisor reads; pure CA bypasses it and role transition denies/restarts. **Correction exists on paper only**; S13/F17 real PG tests mandatory. |
| **P2 C-001** | Holding one PG connection per protected response can exhaust dev pool 4; current service transaction acquires its own second connection; slow clients block ordinary writers and pool admission. | `runtime-postgres-policy.ts:38-59`, `postgres-transaction.ts:12-16,55-68`, `bounded-postgres-pool.ts`; require same-lease SQL integration, finite response bytes/time, reserved capacity, p50/p95 and cancellation tests. |
| **P2 P-001** | Visit Contact mixed A+B aggregates may disclose removed Location through counts, latest visit, associated vehicles, phones or pagination even if A rows are filtered. | `management-visit-contact-authorization.ts:63-116`, `management-visit-contact.service.ts:75-84,91-134,152-188`, search/history query and cursor. Recompute from surviving grant scope atomically or fail closed whole response. |
| P3 | None remaining after design correction | Other role/status/session/MFA in-flight semantics still UNVERIFIED, but are not silently classified as DEC-108 grant violations |

## Reviewer falsification contract

1. Stop at first real post-commit protected sentinel disclosure. The proposed
   fence is RED if any authorized old reader still emits revoked Location
   bytes after writer COMMIT; a green process exit does not change that.
2. For L-001 kill the PostgreSQL backend **during an actual slow HTTP
   response** after SHARED acquisition and before `finish`. Observe
   PostgreSQL lock release, Node error event, abort and client-visible
   bytes in that exact order. A deterministic counterexample invalidates
   the candidate without a stronger mechanism.
3. For E-001 run two API instances: paused reader on instance A, controlled
   User disable on B, a fresh request on A between cancellation acknowledgement
   and User-disable COMMIT, and a slow/stalled connection. Verify immediate
   current/new access cut-off and bounded emergency latency. Do not equate
   postcommit `NOTIFY` or process-local abort with full guarantee.
4. For CA upgrades run CA+CA and CA+LM authenticated GETs, each with the
   current `authorizeCompanyAdminManagement` EXCLUSIVE xact and LM
   grant-dependent SHARED candidate, plus role transition; inspect
   `pg_blocking_pids()`, 40P01/55P03 and bounded completion.
5. For P-001 compare full bodies/cursors for A+B before and B-only after
   revoke. A synthetic private marker must not survive in phone,
   vehicles, latest visit, count, metadata or error response.

## Prime resolution of design disagreements

No source-of-truth conflict was found: DEC-049/080 expressly separate CA
authority; DEC-081 emergency stays stronger; DEC-094 keeps independently
authorized inactive-Location history; DEC-108 does not itself resolve
role/status/logout/MFA in-flight policy. The independent CA-upgrade
finding was accepted and the **proposed** branch gate/documentation
corrected. The P1 backend-loss and emergency preemption concerns were
**not** dismissed by ordinary happy-path test results or code assertions;
they remain blocking. This report accepts no production runtime
remediation; it preserves RED evidence and requests the Owner's U-002
mechanism decision only after these falsification gates are addressed.

Independent security reviewer conclusion: **IMPLEMENTATION NO-GO**.
Prime planning classification: **DECISION REQUIRED**.
