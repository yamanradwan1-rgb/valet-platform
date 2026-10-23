# Final CA RR gate B — Company Analytics

Route: `GET /v1/staff/management/organizations/:organizationId/analytics/all-locations`. Existing capability **ANALYTICS_READ** and Company Admin MFA contract are retained.

## RED before change

Real isolated PostgreSQL 17.11/Nest HTTP test `dashboard-issue319-ca-rr-company-analytics-gate.integration.test.ts` paused after the first RR authorization snapshot, then used a **different authenticated Staff session** to commit actual MFA recovery and retire the exact factor. The paused reader returned **HTTP 200 containing the synthetic Location timezone** even though fresh authorization denied. The strict test intentionally **failed 0/1** under original `3e5dc9b`: `../logs/ca-rr-company-analytics-red-audit-tests.txt`, event sequence 15588.531 → 15662.709 recovery commit → 15726.568 leaked response.

## Patch and GREEN

`management-company-analytics.service.ts` now uses narrowly shared `inFencedCompanyAdminRrSnapshot` from `company-admin-rr-snapshot.ts`: canonical authorization, Staff session/User lock, exclusive Organization grant lock, then persisted session-bound ACTIVE MFA-factor `FOR SHARE` before projection. All happen in one RR transaction held through projection and activity audit; PostgreSQL `40001` causes a bounded entire-transaction fresh retry (maximum five), never reuse a stale snapshot.

- `../logs/ca-rr-company-analytics-green-verified-audit-tests.txt`: **1/1 PASS**, HTTP 403, sentinel absent, fresh 403.
- `../logs/ca-rr-analytics-reader-first-audit-tests.txt`: **2/2 PASS** (strict revoker-first rerun plus independent reader-first). Reader-first valid 200/sentinel, canonical recovery HTTP waited on captured reader backend PID **25692** (observed via `pg_blocking_pids`), then recovered and fresh 403. Factor-row lock is part of the authorization fence, but this PID wait **alone** does not prove the factor row caused it: the canonical User-row lock also orders recovery.
- Earlier `ca-rr-company-analytics-green` first attempt failed a **test-harness TypeError** (`JSON.stringify(undefined)`), after correctly receiving 403; corrected assertion uses `JSON.stringify(response?.body ?? null)`. Preserve that log as harness-only, not a security regression.

The tested behavior does not imply every Management GET route shares this fence. No UI, schema, grants, response projection or capability changes.
