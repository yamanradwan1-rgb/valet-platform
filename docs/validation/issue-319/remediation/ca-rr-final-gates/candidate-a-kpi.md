# Final CA RR gate A — Dashboard KPI

Scope: `GET /v1/staff/dashboard/locations/:locationId/analytics/kpis` for an MFA-assured Company Admin. Historical five-finding checkpoint: `../FINAL_REMEDIATION_ACCEPTANCE.md`.

## Verified original defect (before this patch)

- Strict `dashboard-issue319-ca-rr-kpi-gate.integration.test.ts`, isolated PostgreSQL 17.11 and genuine Nest HTTP.
- Baseline code at `3e5dc9bee1a8fd13f05eca335cfa3a5b5781fcdc`: the first `REPEATABLE READ` authorization query formed an MVCC snapshot. Canonical recovery using a **distinct Staff session** retired that request's ACTIVE MFA factor and committed while the request waited. The stale request then returned **HTTP 200 with the synthetic `Pacific/Chatham` Location timezone**.
- Actual strict security assertion `0 PASS / 1 FAIL`, `../logs/ca-rr-kpi-red-valid-fixture-audit-tests.txt`, emitted `KPI_RR_RESPONSE status=200 containsSyntheticTimezone=true`. Event timestamps (monotonic ms) 13625.819 first RR authorization / 13683.402 recovery committed / 13719.846 leaked response. This is vulnerability **RED**, not a pass.
- Earlier `ca-rr-kpi-red` and `ca-rr-kpi-fixture-debug` runs were **HARNESS-INVALID**: an initially unawaited async TOTP `generate()` caused 400 enrollment confirmation. Those logs do **not** prove the security defect; they remain separately labeled and preserved.

## Corrective behavior

`apps/api/src/modules/dashboard/analytics-kpi-snapshot-transaction.ts` now requires `requireCurrentMfaFactorFenceInRr` for the CA branch **after** canonical Management authorization/session/User and Organization locks and **before** KPI projections. The factor `FOR SHARE` lock survives through transaction `COMMIT`. If a factor UPDATE committed after an older RR snapshot, PostgreSQL raises `40001`; the existing KPI call site's bounded retry repeats a whole new transaction and authorization. The LM's pre-snapshot shared Organization advisory and CA's non-upgrade path are unchanged.

## Patched evidence

- `../logs/ca-rr-kpi-green-audit-tests.txt`: **1 PASS, 0 FAIL, 0 SKIP**, actual `KPI_RR_RESPONSE status=403 containsSyntheticTimezone=false`; fresh access 403. Same test file and canonical recovery schedule.
- Full-screen/UI/API shapes, entitlement and permission source files are unchanged. This focused test does not independently prove all KPI variants or every possible MFA/session rotation interleaving.
