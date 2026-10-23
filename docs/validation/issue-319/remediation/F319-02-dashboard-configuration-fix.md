# F319-02 — Legacy Location Manager Dashboard Configuration GET

## Historical RED (preserved)

At baseline source `20998a069eb5d576895c0e6c149271a4a0e4028b`, `dashboard-configuration-command.ts` accepted bare `authorizeDashboardLocation()` then projected protected settings without the Organization grant fence. After the canonical grant revocation had committed, the previously started real GET returned HTTP 200 with the ten-element settings array; a fresh GET returned 404. Preserved records: `../logs/audit-tests.txt`, `../security-findings.md` original reproduction section and initial Git SHA `af62a11add5d97ec291ca0dbf49fdd29be88f708`.

## Scoped implementation

Only `DashboardConfigurationService.read()` uses the previously accepted #315 `authorizeDashboardReadLocation(transaction, {authenticatedUserId, capability:'LOCATION_DASHBOARD_READ', targetLocationId})` in the **same READ COMMITTED database transaction** as `readResponse()` and `loadLocationConfigurationRow()`. Its LM branch obtains the canonical `staff-management-org` SHARED transaction advisory and rechecks exact live LM grant after acquisition; the fence survives through all ten projections and COMMIT. It receives no Staff session context, so the helper cannot enter the Company Admin fallback. The original LM-only and `DASHBOARD_ACCESS` eligibility, settings inheritance, currency, timezone, `updatedAt` and error mapping remain intact.

`setOverride()` and `clearOverride()` were source-reviewed and **not changed**. They use the existing SQL mutation functions and their own authorization contracts; their complete concurrent mutation safety was not separately proven by this read-only remediation.

## Post-fix evidence and boundaries

- `../remediation/logs/races-first-audit-tests.txt`: real CA MFA Staff Management HTTP revoke, reader-first valid fence orders writer; revoker-first committed removal yields a denied stale reader and fresh 404. Synthetic organization default `check_in_photos_required=false` and saved Location override `true` demonstrate a protected setting. The configuration part contributes **2/6 PASS** to this first focused test run.
- `../remediation/logs/patched-full-audit-tests.txt`: the post-fix historical Configuration trace now observes revoker commit before the unlinearized reader resumes and HTTP 404. The complete patched pre-adjacent test run is 52/52 PASS, including assertion of ten projections for an eligible LM and no post-revoke protected response.
- 80 synthetic uncontended HTTP samples p50 **9.78ms**, p95 **13.57ms**; there is no matched historic Configuration series. The shared `run-lab.ps1` creates a fresh task-owned PostgreSQL 17.11 cluster and verified cleanup after the run.

This fixes the documented read route only, under the supported cooperative canonical writer order and already-resolved Staff bearer semantics. See `FINAL_REMEDIATION_ACCEPTANCE.md` for final tested SHA, additional scoped fixes and independent review.
