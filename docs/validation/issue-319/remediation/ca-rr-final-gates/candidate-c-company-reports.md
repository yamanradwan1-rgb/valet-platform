# Final CA RR gate C — Company Reports

Route: `GET /v1/staff/management/organizations/:organizationId/reports/daily`. Other WEEKLY/MONTHLY projections use the same `ManagementCompanyReportService.read` transaction wrapper, but their distinct HTTP payloads were **not individually raced** in this continuation.

## RED before change

At original branch `3e5dc9b`, a repeatable-read daily report took its authorization snapshot, canonical MFA recovery from a separate Staff session retired its factor and committed, and the request completed **HTTP 200 with synthetic `Pacific/Chatham` timezone**. The strict original-security assertion **FAILED 0/1**: `../logs/ca-rr-company-report-red-audit-tests.txt`, events 25132.011 snapshot, 25217.883 factor-retirement commit, 25288.440 leaked response.

## Fix and verified post-remediation boundary

`company-report-read-service.ts` now uses the same focused `inFencedCompanyAdminRrSnapshot`, preserving capability **REPORTS_READ** and current Company Admin-only semantics. Session/User → Management Organization → persisted MFA-factor ordering remains within one consistent RR snapshot; factor `FOR SHARE` remains until commit. Stale-updated factors cause PostgreSQL `40001`, followed by a bounded fresh full-transaction retry.

`../logs/ca-rr-company-report-green-audit-tests.txt`: **1 PASS / 0 FAIL / 0 SKIP**, HTTP 403, no sentinel, fresh 403. The distinct report-export finalizer contract and any execution evidence are separately catalogued in `FINAL_CA_RR_ACCEPTANCE.md`.

No report payload, rendering, audit schema, UI or database privilege changes.
