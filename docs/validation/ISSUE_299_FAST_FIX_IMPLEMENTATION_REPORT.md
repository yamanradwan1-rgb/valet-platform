# Issue #299 — Completed Task staff attribution local fast-fix validation

**Baseline:** `origin/main` = `11afb194bbe692e0df3762ee0dc2644d0a0126c5` (fetched 2026-10-17).

**Local branch:** `fix/issue-299-completed-task-staff-attribution`

**Local worktree:** `D:\kndoom\valet-platform\tmp\issue-299-fast-fix`

**Integrated code HEAD before this report:** `1d1f05ee1d6cca1e85f352437f1fa81824d14378`.

## Confirmed root cause

`apps/api/src/modules/dashboard/overview-retrieval-tasks-query.ts` used shared `operationalAssigneeJoins('task')` on Dashboard → Tasks. Its membership join selected only statuses `ASSIGNED`, `ACCEPTED` and `IN_PROGRESS`. Therefore a `COMPLETED` Parking task with a persisted `current_assignee_membership_id` yielded `assignee: null`, which the table and drawer faithfully rendered as Unassigned. Prior Issue evidence found non-null IDs in all five observed completed Parking tasks; **those five rows were not re-queried in the current run**.

## Implemented behavior

- `054e829a`: added the Tasks-specific `dashboardTasksHistoricalAssigneeJoins()` for `COMPLETED` in addition to active statuses, keeping shared Live Operations and Retrieval queue projection active-only. Membership join still requires exact task Organization ID and an existing grant to the task's exact Location; null or missing user identity remains null. Only `listDashboardTasks()` uses the historical join.
- A completed Parking or Retrieval row can now display its persisted, authorized **assigned employee**. It does **not** claim the stored assignee personally completed the task. `Assigned To` is the existing truthful label; no new `Completed By` or `Parked By` assertion, no copying the Parker to an unassigned Retrieval task.
- `QUEUED` and `CANCELLED` stay unassigned if identity is unproven; pagination, filters and existing task DTO are unchanged. Both the mounted table and drawer read the same `TaskOverviewEntry.assignee`.
- No database task updates, schema, migration, production UI markup, style, translation or geometry change.
- `1d1f05ee`: integrated Worker 5's dedicated mounted Tasks table/drawer Playwright regression without modifying production UI.

## Files and focused regression evidence

Files changed:

- `apps/api/src/modules/dashboard/operational-assignee-projection.ts`
- `apps/api/src/modules/dashboard/overview-retrieval-tasks-query.ts`
- `apps/api/test/dashboard-task-assignee-history.test.ts` (new)
- `apps/api/test/dashboard-overview-domains.integration.test.ts` (existing PostgreSQL suite extended with one focused historical attribution test)
- `apps/dashboard/e2e/issue299-task-staff-attribution.spec.ts` (new)

| Command or check | Fresh result |
| --- | --- |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/dashboard-task-assignee-history.test.ts` | **1 file, 3/3 PASS** (Prime); independently rerun **3/3 PASS** by Worker 1 |
| Single `issue299-task-staff-attribution.spec.ts` mounted Playwright Chromium test (Worker 5, isolated W5 worktree) | **1/1 PASS**, 5.1s; EN/AR, RTL, table/drawer parity, queued/cancelled/unproven fallback, focus/Escape |
| `pnpm --filter @valet/api typecheck` | PASS |
| Focused API ESLint on changed backend/test files | PASS |
| Dashboard TypeScript check (Worker 5) | PASS |
| `pnpm architecture:check` | PASS, existing unrelated grandfathered warnings |
| `git diff --check` | PASS |
| Added PostgreSQL integration case in `dashboard-overview-domains.integration.test.ts` | **NOT RUN** — no uniquely owned disposable PostgreSQL environment established |
| Real prior isolated Photo QA DB five-row recheck | **NOT RUN** — no read-only database evidence obtained in this execution |

The new PostgreSQL regression case is scoped to completed Parking and Retrieval, queued unassigned Retrieval, cancelled Parking, and a completed task linked to a membership without the task-Location grant. **The SQL itself has not been executed against PostgreSQL in this run**. Other missing/inactive identity cases and cursor pagination are not newly covered in this change; prior shared behavior is retained.

## Independent security and QA review

- **Security:** read-only Worker 3 examined final candidate `1d1f05ee`: **P0=0, P1=0**, no cross-Organization/Location disclosure demonstrated, shared Live/queue paths unaffected, no N+1. **P2 privacy-minimization observation:** authorized completed-task assignee DTO also exposes email and membership ID under the existing shared contract. This is not currently a proven authorization violation; a separate product/privacy decision could narrow historical DTO fields.
- **QA:** read-only Worker 1 examined exact `1d1f05ee`: **P0=0, P1=0**, scoped API test independently **3/3 PASS**. **P2 coverage caveats:** missing/inactive identity or membership state and cursor pagination do not have new regression cases; mounted UI test uses synthetic mocked API, so it does not prove SQL execution or real Photo QA state.
- Dedicated Workers 6 and 7 failed to start (browser composer startup failure); no review should be attributed to them.

## Verdict and remaining acceptance work

**LOCAL FIX VERIFIED — source and mounted UI scope.** The Tasks-specific read projection and customer-visible table/drawer behavior passed focused local checks; no unrelated UI change. The code-level Organization and Location grant boundaries remain explicit and reviewed.

**NOT VERIFIED:** real PostgreSQL execution of the new regression, the five historical Photo QA records, cross-tenant integration runtime behavior, and any production deployment. Those remain the final DB acceptance steps before concluding end-to-end data verification. No shared or production database was mutated.

**Delivery:** locally committed only. No push, PR, GitHub CI, merge, deployment or Issue closure.

## Owner-authorized PostgreSQL acceptance follow-up (2026-10-17)

The original **NOT RUN** statements above describe the first local implementation handoff and are superseded **for the focused PostgreSQL suite only** by this follow-up.

- Executed `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-standard test/dashboard-overview-domains.integration.test.ts --reporter=dot` on the issue branch against a freshly initialized task-owned PostgreSQL 17 cluster, loopback-only at `127.0.0.1:45541`, with a unique cluster/role and temporary suite-owned child database.
- **PASS: 1 file, 8/8 real PostgreSQL integration tests** (including the new completed Parking/Retrieval, queued, cancelled, and no-grant regression); 26.55 seconds.
- Harness clean-up reported **db=0, roles=0, children=0** for the test run. The separate task-owned PostgreSQL cluster was stopped after the run; the host's normal PostgreSQL service and shared databases were not used.
- A first preflight run failed at migration URL validation because the isolated test URL omitted a required password field; no tests executed. The URL was corrected and the actual second test run passed.
- The previously observed **five Photo QA rows were NOT re-queried**; no existing QA/staging/production database was read or modified. Mounted Chromium checks in the original report still use fixtures, not a live backend.
- This is source and **real isolated PostgreSQL query** acceptance, **not** evidence of production deployment.
