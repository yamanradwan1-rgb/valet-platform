# CIQ-06 — Security-sensitive failing test triage
Date: 2026-11-03. Baseline: origin/main a5a46de42c1a075f84806ecda60a31791493c990. Evidence: repository source inspection and last CI logs at run 41342122691, NOT a fresh runtime reproduction.

## Gate 1: Supervisor Tasks (P1 authorization)
- Existing suite: apps/api/test/dashboard-overview-api.integration.test.ts:138-169. Shifted Supervisor GET /v1/staff/dashboard/locations/:locationId/overview/tasks expected 404 (line 160), observed 200 in CI.
- Proposed DEC-107 status at docs/decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md:3 is explicitly Proposed; owner approved narrow Phase B behavior but final compatibility review pending. Sections 155-166 narrow Supervisor Tasks access to exact Organization/Location, current Staff session, active operational Shift, and only IN_PROGRESS Parking/Retrieval Task rows. No other Dashboard overview, reporting, exports, or commercial reads.
- No unconditional replacement of 404 by 200 is justified; separate approved owner policy from unresolved Accepted decision compatibility. Prove exact endpoint, filtered row scope and unavailable/foreign/inactive denials. Preserve existing negative coverage, verify effective accepted decision before modifying assertions or API authority.
- Classification: INVESTIGATE / DECISION REQUIRED for policy reconciliation, not REMOVE.

## Gate 2: Terminal Task Assignee (P1 data meaning/privacy)
- apps/api/test/issue241-live-operations.integration.test.ts:128-135 expects a terminal retrieval Task assignee null, actual CI returned membership identity. This can be stale expectation or unauthorized historical identity projection.
- Verify canonical Tasks current assignee vs status and documented Task history semantics. Live/current Task projection must not silently leak inactive/historical assignee as actively assigned; historical identity cannot be removed merely to pass a test if authorized provenance is required. Check cross-tenant/location negatives.
- Classification: INVESTIGATE, do not relax assertion based on implementation alone.

## Gate 3: Management Live Tracking (P1 privacy/functional)
- apps/api/test/management-tracking-boundaries.integration.test.ts:108-138 creates tracked session and sample, expects one item; CI returned [] while HTTP was 200. Test also asserts policy disabled yields [], foreign Location denies 404.
- Confirm fixture active Task, actor/owner, Shift, policy inheritance, time filters and sample/session state; verify only task-scoped active location samples appear. An empty response may be a bug or fixture mismatch, not grounds to remove privacy guard.
- Classification: INVESTIGATE; retain policy-off + foreign-scope negative cases.

## Release safety and falsification
- Require Accepted-DEC mapping, feature owner decision when conflicting, targeted real PostgreSQL test on disposable DB, explicit positive/negative role/Location/Shift/MFA scenarios, cross-tenant concealment, and state/policy transitions.
- No API or test semantics changed by this report. No production, DB or GitHub Actions execution claimed.
- A passing TypeScript build or successful unrelated tests cannot close these gates.
