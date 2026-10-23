# Issue #319 — independent READ-ONLY post-remediation security review

Date: 2026-10-23. Reviewer: independent CoS Worker 5 (not a production
patch author or test executor). The reviewer inspected the **actual five-fix
source diff, recorded SQL/HTTP traces, source-level lock order, contract DEC,
PostgreSQL identity/cleanup, and test summary**. This is a review of the
current branch/worktree, not re-use of the pre-remediation W4 NO-GO opinion.
The unchanged F319-05 source delta was subsequently committed as
`6660ee8117edae1baccedcd1404da7822be5d5c5` (no source changes after
review).

## Explicit independent verdict

**SECURITY GO for the five focused remediations on the tested isolated
boundaries; SECURITY NO-GO for closing #319 or releasing to production.**

| Severity | Within actually tested five-fix scope | Outside that scope |
|---|---|---|
| P0 | 0 confirmed survivors | No universal scan claim |
| P1 | 0 confirmed survivors | No universal scan claim |
| P2 | 0 confirmed survivors in F319-01..05 | CA RR sibling candidates remain unverified, not classified as confirmed defects |
| P3/info | Benchmark and coverage limitations | Wide-route race/long-soak evidence not available |

All five original vulnerabilities remain **historically confirmed**. The
0-survivor count above describes *post-fix exercised security behavior*, not
a claim that the old findings never existed or that the other 85 registered
Dashboard/Management GET patterns have been proved safe.

## Source and behavioral assessment

- `physical-resource-authorization.ts`, `physical-resource-read.service.ts`
  and `physical-resource-overview-transaction.ts`: Location Manager exact
  post-fence authority under the canonical `staff-management-org` SHARED
  advisory, fresh RR snapshot after pre-BEGIN advisory acquisition; CA does
  not upgrade a shared Organization lock. All seven Physical GET patterns
  preserve sequential allow/deny behavior. The new F319-05 CA Overview path
  keeps the normal exclusive Management Organization authority and locks the
  actual persisted ACTIVE factor with `FOR SHARE` after Staff session/User
  locking, through projection and transaction completion.
- `dashboard-configuration-command.ts`: legacy LM-only route uses a held
  shared grant fence across its ten-item settings projection; no new CA
  fallback or mutation authority.
- `branding-command.ts`: LM BASIC_BRANDING requirement and precise branded
  projection preserved, with current post-lock grant check; no CA fallback.
- `subscription-read.ts`: LM scope and unentitled Dashboard subscription
  visibility preserved, without inventing DASHBOARD_ACCESS gating or CA role.
- Source changes are limited to these six Dashboard API implementation
  files, across the five scoped repairs; no Dashboard React/CSS, customer,
  native, Prisma migrations, DB grants or privilege expansion in the reviewed
  source diff.

The reviewer confirmed F319-05's originally leaked protected synthetic key
slot **appeared** after real factor retirement (historical RED HTTP200,
`containsSyntheticKeySlot=true`), whereas the same held RR-snapshot hook on
the repaired implementation returned **HTTP403/no synthetic key slot**.
Independent inspection of new HTTP/PG barrier logs confirmed a CA read with
a valid factor holds the recovery writer until completion, and recovery-first
orders the reader behind the writer before denied projection.

## Evidence reviewed (not newly executed by reviewer)

- `logs/ca-rr-mfa-confirmed-audit-tests.txt`: RED **0/1** strict security
  assertion, protected-data presence true.
- `logs/ca-rr-mfa-fixed-audit-tests.txt`: exact GREEN **1/1**,
  `responseStatus=403 containsSyntheticKeySlot=false`.
- `logs/ca-rr-mfa-concurrency-audit-tests.txt`: **2/2** canonical MFA
  recovery real HTTP with observed PostgreSQL `pg_blocking_pids`.
- `logs/final-five-fixes-audit-tests.txt`: **13 files, 73/73 PASS**.
- `logs/final-five-fixes-baseline-tests.txt`: **4 files, 28/28 #315 PASS**.
- `logs/final-five-fixes-performance-audit-tests.txt`: **1/1 PASS**,
  seven endpoint families ×80 uncontended local HTTP samples.
- Matching `*-identity.txt` and `*-cleanup.txt`: task-owned PostgreSQL
  17.11 loopback clusters, non-superuser runtime test roles, zero child DBs,
  zero child connections and removed entire owned private clusters. A
  `valet_photo_evidence_lock_owner` role appears inside a temporary cluster's
  role listing; no separate survival outside the removed cluster was shown.

## Review caveats and exact closure blockers

1. The outer F319-05 code retries a complete fresh transaction up to five
   times on `40001`, with rollback/lease handling before retry, and the HTTP
   denial was observed. The new race logs **do not directly count the
   internal SQLSTATE or individual retry snapshots**; do not claim that
   instrumentation was performed. Exhausted-retry stress was not run.
2. The CA factor `FOR SHARE` follows the existing CA exclusive Organization
   advisory and authenticated session lock. Canonical MFA recovery takes
   session/User then factor; no deadlock was observed in the tested schedules.
   This does not prove a global absence of deadlocks under arbitrary writers.
3. `analytics-kpi-snapshot-transaction.ts`,
   `management-company-analytics.service.ts`, and
   `company-report-read-service.ts` exhibit similar CA RR pre-MFA eligibility
   source patterns; report export adds a separate fresh finalization and might
   differ. **No deterministic recovery exploit for these sibling paths was
   executed**, and no separate production remediation was authorized.
4. No complete 85-route concurrency matrix, long-duration pool saturation,
   or contended p95 distribution was executed. Existing accepted in-flight
   resolver/session semantics, already-sent bytes and noncooperative DBA SQL
   are explicitly not treated as patched guarantees.
5. Owner still must review/release via an authorized future PR/CI gate.
   This Issue #319 branch must not be merged, deployed or closed automatically.

**Recommendation:** accept F319-01..05 as narrow *code-level* fixes for Owner
review, retain #319 as **OPEN / NO-GO closure** pending the explicit adjacent
CA RR boundary decision, completeness of scope verification and normal merge
controls. Do not label the sibling candidates confirmed P2 without a separate
reproduction and severity review.
