# Canonical CA MFA recovery — deterministic PostgreSQL/HTTP matrix

All source code and strict test artifacts belong to the existing Issue #319 branch. Test harness `apps/api/test/dashboard-issue319-lab.ts` verifies ephemeral opt-in `ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER`, PostgreSQL 17.11, owner `issue315_owner`, loopback-only server and private `tmp/issue-315-pg-qa/issue319-*/.issue315-private-cluster` identity, non-superuser and no CREATEDB/CREATEROLE runtime role; separate synthetic tenant, Location, accounts, MFA factor, sessions, persisted timezone sentinel. No shared/production database used.

| Scenario and exact `-RunTag` | Prepatch strict result | Patched strict result | Expected secured outcome |
|---|---|---|---|
| KPI `ca-rr-kpi-red-valid-fixture` → `ca-rr-kpi-green` | 0/1, 200 leaked | 1/1 | 403, no sentinel after prior recovery commit |
| Analytics `ca-rr-company-analytics-red` → `ca-rr-company-analytics-green-verified` | 0/1, 200 leaked | 1/1 | 403, no sentinel |
| Daily report `ca-rr-company-report-red` → `ca-rr-company-report-green` | 0/1, 200 leaked | 1/1 | 403, no sentinel |
| Analytics `ca-rr-analytics-reader-first` | Not run on prepatch | 2/2 | Valid reader 200; writer waits on backend PID; fresh 403 |
| PDF export `ca-rr-company-export-finalizer` | No original vulnerability asserted for this two-stage path | 1/1 | Recovery after RR snapshot but before finalizer denies 403; no PDF/no new audit |
| Local after-fix latency `ca-rr-fixed-local-perf` | Comparable prepatch measurement not run | 1/1 | 120 authorized HTTP 200 responses; 40 each KPI/Analytics/Report |

Run all with `powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag <tag> -TestFile test/<named-test>.integration.test.ts`. No numeric timings above are p95 latency metrics: they are monotonic in-test event ordering. The private-cluster teardown logs attest **zero leftover child databases and zero connections**, and `OWNED_CLUSTER_DIRECTORY_REMOVED=True`; one migration-created `valet_photo_evidence_lock_owner` role can exist until its entire isolated cluster is deleted—do not describe role listings as zero.

`-Suite baseline -Evidence remediation -RunTag ca-rr-postfix-issue315`: **28/28 PASS across four test files**, `../logs/ca-rr-postfix-issue315-baseline-tests.txt`, duration 66.22 s, after the three production fixes and before the later test-only reader-first/export additions.

Historical `../FINAL_REMEDIATION_ACCEPTANCE.md` and all F319-01 through F319-05 logs are retained unmodified. Intentional original security-red failures are not converted into historical green. Two separate harness-debug failures are segregated in their named logs.
