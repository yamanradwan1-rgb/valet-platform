# QBR-07 — Read-only security semantics reconciliation
Date: 2026-11-03
State: decision follow-up required before changing API authorization or test expected status.

## Sources
- GitHub Actions CI #582, run 41542741666, api-postgres-compound: two failed tests, both also failed in prior CI run #41342122691.
- docs/08_DECISIONS_LOG.md:5-29: DEC-107 is **Proposed engineering reconciliation**, although owner explicitly approved narrow Supervisor Tasks navigation/read policy in Issue #352.
- docs/decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md:3,155-171: focused DEC remains **Proposed**; section describes one narrowly scoped Supervisor read in exact authorized Location only while Shift/current session valid, IN_PROGRESS PARKING/RETRIEVAL, not LOCATION_DASHBOARD_READ.
- docs/decisions/DEC-049_PHASE5_ROUTE_RETENTION_LIVE_MAP_PRIVACY.md:3,25-50: **Accepted** GPS route visibility scope and privacy.
- apps/api/src/modules/dashboard/overview-retrieval-tasks-query.ts:160-208: general dashboard authorization fallback to Supervisor-only read scoped to the allowed Task type/status and Location.
- apps/api/src/modules/dashboard/operational-assignee-projection.ts:9-33: live projection only ASSIGNED/ACCEPTED/IN_PROGRESS; historical Tasks page additionally projects authorized membership identity for COMPLETED/CANCELLED when granted exact Location.
- apps/api/test/dashboard-overview-api.integration.test.ts:138-169 and apps/api/test/issue241-live-operations.integration.test.ts:128-135.

## Case S1: Supervisor Tasks expected 404 but got 200 — policy reconciliation (P1)
The existing test expected 404 and AUTHORIZATION_DENIED from GET /v1/staff/dashboard/locations/:id/overview/tasks for an ACTIVE shifted Supervisor; implementation grants the narrow Tasks reader. The documented Issue #352 owner direction supports this narrow exception, but DEC-107 is still recorded Proposed pending compatibility review. Therefore the test and implementation conflict; the current 200 is **not evidence that a broad Supervisor dashboard grant is authorized**.

Before updating that assertion, ratify/reconcile DEC-107 status with Accepted DEC-049 and Dashboard capabilities, then prove the positive IN_PROGRESS Parking/Retrieval projection and negative cases: inactive/no Shift, wrong Location/Organization, lost membership/access, unrelated Tasks status/type, and denial on every other Dashboard management route (including reports, exports, commercial). Preserve MFA context on Admin read. If owner rejects this narrow exception, change implementation by an authorized task, not just the assertion.

## Case S2: Terminal Task historical assignee expected null but got identity — semantics/PII review (P1)
The current Tasks page query joins persisted prior assignee for terminal rows via dashboardTasksHistoricalAssigneeJoins(). This is explicitly documented in source as historical attribution, distinct from live Task identity or completion actor. The stale test expects null for a completed Retrieval Task; this expectation conflicts with actual projection. However the code comment is not an Accepted Decision, and explicit PII exposure limits require review.

Verify Task historical assignment policy and employee identity projection allowlist; prove manager already authorized to the exact Location, foreign tenant/location non-disclosure, revoked Location access behavior, stale former assignee handling, and that terminal assignment is not mistaken for current operational ownership. Only then adjust expected historical projection or tighten API if the accepted privacy contract disallows it. Do not strip protected history from persistence.

## Classification and release gate
Both S1 and S2 are **INCONCLUSIVE pending source-of-truth reconciliation**, not permission to delete tests or loosen behavior. No API, SQL, test assertion, required CI gate, role permission, or Accepted Decision modified by this report. A green lint/typecheck alone is not real PG proof.
