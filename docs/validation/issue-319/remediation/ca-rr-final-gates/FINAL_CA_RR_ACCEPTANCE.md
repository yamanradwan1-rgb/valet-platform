# Issue #319 — Company Admin RR MFA final gates, scoped post-remediation acceptance

Date: 2026-10-23. This package **appends** to and does not rewrite `../FINAL_REMEDIATION_ACCEPTANCE.md`, the original `../../ISSUE_319_FINAL_ACCEPTANCE.md`, or their historical red/green logs. Existing branch `audit/issue-319-dashboard-revocation-coverage`, starting SHA `3e5dc9bee1a8fd13f05eca335cfa3a5b5781fcdc` (origin branch confirmed same before changes); original application baseline `20998a069eb5d576895c0e6c149271a4a0e4028b`.

## A. Executive classification

**Focused three-gate remediation: SECURITY GO per independent READ-ONLY review; final source diff/branch push still pending. Issue #319 closure, merge and deployment: NO-GO without further Owner acceptance.** The previously unverified Company Admin REPEATABLE READ MFA-retirement candidates are now **confirmed P2 prepatch** by three independent deterministic real Nest HTTP/PostgreSQL reproductions; each has a corrected strict green response. These are three newly confirmed *route-family* findings beyond historical F319-01 through F319-05. New internal labels used only in this addendum: **CA-RR-A KPI**, **CA-RR-B Company Analytics**, **CA-RR-C Company Reports**. The original F319-01..05 remain intact.

Under the three exercised race schedules: **0 surviving confirmed P0 / 0 P1 / 0 P2**. Outside exercised route/isolation/factor-recovery boundaries: **NOT VERIFIED**, not secure by declaration. No general 85-route acceptance, and no extra unrelated P2 remediation inferred.

## B. Production scope, unchanged contracts

| Source | Change | Authority / transaction constraint |
|---|---|---|
| `apps/api/src/modules/auth/mfa/mfa-rr-factor-fence.ts` (new) | Exact session-bound ACTIVE MFA factor `FOR SHARE OF factor` (or accepted local bypass) | Only after canonical Staff session/User and Organization authorization; fail closed; no new privilege |
| `apps/api/src/modules/dashboard/analytics-kpi-snapshot-transaction.ts` | CA post-authorization MFA factor fence before KPI projections | Keeps original RR, LM pre-snapshot Organization shared advisory/session-lease cleanup, CA exclusive Organization path and existing bounded whole-transaction retry |
| `apps/api/src/modules/management/company-admin-rr-snapshot.ts` (new) | Focused RR wrapper, canonical Company Admin authorization then MFA factor fence, projection, activity audit; max five fresh 40001 retries | Only `ANALYTICS_READ` and `REPORTS_READ`, no generic authorization fallback |
| `apps/api/src/modules/management/management-company-analytics.service.ts` | Route existing analytics projection through focused wrapper | Existing Company Admin role/scope, projections, response and MFA |
| `apps/api/src/modules/management/company-report-read-service.ts` | Route DAILY/WEEKLY/MONTHLY read wrapper through focused fence | Existing REPORTS_READ, report grouping/response/audit semantics |

Lock order from source: canonical Staff session/User row → Management Organization exclusive transaction advisory/membership → same-session active MFA factor SHARE → protected RR projection/audit → transaction COMMIT releases transaction locks. Canonical recovery uses distinct Staff session and its User row, MFA user advisory and factor UPDATE. **Reader-first** recovery may wait on User row before reaching factor; do not attribute observed PID waits exclusively to factor. **Revoker-first** first RR snapshot before canonical recovery commit hits `40001` when factor tuple changed, then a complete fresh auth retry denies. No shared-to-exclusive Organization lock promotion. Already-delivered bytes and DBA direct SQL are outside contractual revocation guarantees.

No React/CSS/translations/UI, Customer/Native code, existing migrations, runtime grants, schema, roles, deployment or external service changes.

## C. Red-to-green evidence

| Strict test, source file under `apps/api/test/` | Historical vulnerable original source (real recovery committed before stale response) | Current protected source |
|---|---|---|
| `dashboard-issue319-ca-rr-kpi-gate.integration.test.ts` | `ca-rr-kpi-red-valid-fixture`: **0 PASS / 1 FAIL**; HTTP 200 synthetic timezone `true` | `ca-rr-kpi-green`: **1 PASS / 0 FAIL / 0 SKIP**, HTTP 403 synthetic `false`, fresh 403 |
| `dashboard-issue319-ca-rr-company-analytics-gate.integration.test.ts` | `ca-rr-company-analytics-red`: **0/1**, HTTP 200 synthetic `true` | `ca-rr-analytics-reader-first`: **2/2**, revoker-first 403 no sentinel, reader-first 200 then recovery waits and post-recovery fresh 403 |
| `dashboard-issue319-ca-rr-company-report-gate.integration.test.ts` | `ca-rr-company-report-red`: **0/1**, HTTP 200 synthetic `true` | `ca-rr-company-report-green`: **1/1**, HTTP 403 no sentinel, fresh 403 |
| `dashboard-issue319-ca-rr-company-export-finalizer.integration.test.ts` | Not an original RED finding; source has separate RC reauthorization finalizer | `ca-rr-company-export-finalizer`: **1/1**, canonical recovery commits **after** RR generation and **before** finalizer; HTTP 403, no PDF header/bytes, no new `DASHBOARD_REPORT_EXPORT_GENERATED` audit; previously valid PDF 200 and exactly one baseline audit |

All runs use the same command pattern (one `-TestFile` per isolated cluster):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag <tag> -TestFile test/<file>.integration.test.ts
```
Raw sanitized evidence: `../logs/<tag>-audit-tests.txt`, `../logs/<tag>-audit-identity.txt`, `../logs/<tag>-audit-cleanup.txt`. The exact before/after event timings and misfiring harness-only failures are explained in the three candidate reports; neither fixture bugs nor intentionally failing prepatch strict tests are counted as production regressions.

Reader-first Analytics log captures real `pg_backend_pid=25692` and `pg_blocking_pids()` writer wait, then valid response before recovery. Report export log: original RR complete / PDF renderer entry **29025.603 ms**, canonical recovery commit **29094.612 ms**, denied response **29122.808 ms**. These are event ordering markers, **not latency p95**.

## D. Environment, regressions and quality

The test runner enforces explicit owned disposable **PostgreSQL 17.11** on `127.0.0.1` with varying high local ports; `issue315_owner` owns the private cluster, test runtime `valet_runtime_mob007_*` is non-superuser and has neither CREATEDB nor CREATEROLE. Actual PG `current_database`, role, port, data_directory and version recorded per `*-identity.txt`. `*-cleanup.txt` shows **zero task child databases, zero child connections, owned cluster removed true**. A migration-created `valet_photo_evidence_lock_owner` role can appear before entire cluster removal. No shared/staging/production database was mutated.

- Issue #315 lock-contract regression: **28 PASS / 0 FAIL / 0 SKIP**, four files, `../logs/ca-rr-postfix-issue315-baseline-tests.txt` (duration 66.22 s), command `-Suite baseline -Evidence remediation -RunTag ca-rr-postfix-issue315`.
- Original five-fix Issue #319 **73/73** and earlier #315 **28/28** are historical pre-three-gate results, **NOT** re-counted as latest patched acceptance.
- API typecheck, API lint, architecture:check, API build, `git diff --check` all rerun **exit 0** after the final test-only changes. Exact commands: `pnpm --filter @valet/api typecheck`, `pnpm --filter @valet/api lint`, `pnpm architecture:check`, `pnpm --filter @valet/api build`, `git diff --check`. Architecture's only warnings were repository-baseline grandfathered oversized files, not new files.
- Patched uncontended real HTTP measurements: `-Suite audit -Evidence remediation -RunTag ca-rr-fixed-local-perf -TestFile test/dashboard-issue319-ca-rr-performance.integration.test.ts` **1/1 PASS**, 40 sequential samples per route, one warmup, real accepted MFA Company Admin, `../logs/ca-rr-fixed-local-perf-audit-tests.txt`:

  | Route | Samples | p50 ms | p95 ms | Min / max ms |
  |---|---:|---:|---:|---:|
  | KPI | 40 | 30.41 | 38.04 | 22.26 / 86.76 |
  | Company Analytics | 40 | 33.02 | 43.62 | 24.47 / 56.27 |
  | Company Report DAILY | 40 | 32.99 | 44.97 | 26.08 / 56.32 |

  Measurements include local Nest HTTP overhead; no load or revoker contention. There is **no same-route, same-fixture prepatch performance baseline**, so no numerical before/after regression percentage is claimed. Historical Dashboard/Physical/scope p95 values are **not comparable** route benchmarks.

## E. Remaining boundaries and action gates

- RR Company Report DAILY was directly raced. WEEKLY/MONTHLY share exact authorization transaction helper but their separate response projections were not each independently raced here.
- Export tested **PDF** after RR/before finalizer. CSV shares the same fresh finalizer but an independent CSV race was not run; no authority claim for its untested interleavings.
- KPI reader-first lock ordering is supported by unchanged original KPI tests and analogous Issue #315/F319-05 regression history; this final continuation directly raced its **revoker-first** recovery schedule only.
- Session logout, blanket credential cancellation, disabled account, noncanonical SQL UPDATE, cross-tenant, and every other 85 Dashboard/Management read pattern are outside this three-candidate proof and remain governed by their separate prior evidence/accepted semantics.
- Independent READ-ONLY actual source diff and log reviewer: **focused SECURITY GO** for the three exercised corrected races, P0=0/P1=0/P2=0 **surviving within tested boundaries**, while **Issue closure/merge/deploy NO-GO**. Signed source/log assessment, lock-order caveats and unverified failure paths: `independent-security-review.md`.
- No PR, merge, deploy, production migration or Issue closure. Once final QA/review is green, commit/push **only** existing branch and append factual findings/status to Issue #319; final exact SHA must be recorded outside the commit that creates it.
