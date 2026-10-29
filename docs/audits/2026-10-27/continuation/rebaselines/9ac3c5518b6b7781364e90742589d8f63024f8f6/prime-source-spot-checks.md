# RB-004 Prime independent source spot review — 2026-10-29

Source: `9ac3c5518b6b7781364e90742589d8f63024f8f6`; Git tree `df279eba03754d18eaa98b3245b810cb808f82cf`. Prior source `0747a677ddf7fc3e1093490b7ef0a7bee9e2d938`. This is a **static** source/consumer check for the dependency gate, not an additional semantic credit or a runtime test.

I read these complete current-source files contiguously from 1..EOF (7 files, **1,236 lines**):

| Path | Full range | Relevant source edge |
| --- | ---: | --- |
| `apps/api/src/app.module.ts` | 1..48 | Existing root module imports `DispatchModule` at 9 and 40; the changed DispatchModule now publishes the new emergency controller. |
| `apps/api/src/modules/dashboard/overview.controller.ts` | 1..254 | Unchanged `GET tasks` endpoint at 158..177 delegates to modified `listDashboardTasks`; same controller also has separate retrieval queue and financial scopes. |
| `apps/api/src/modules/dashboard/overview-retrieval-tasks-query.ts` | 1..236 | At 168..183, the modified tasks query adds an exact Supervisor fallback with `IN_PROGRESS` Parking/Retrieval predicate; `listRetrievalQueue` remains a separate ordinary dashboard authorization path at 35..133. |
| `apps/dashboard/src/components/foundation/selected-management-shell.tsx` | 1..288 | Unchanged shell calls changed navigation resolution at 90..97 and renders access-filtered navigation at 154..173 and selected route children at 258..285. |
| `apps/dashboard/src/components/foundation/use-navigation-authority.ts` | 1..138 | Unchanged generation-fenced hook invokes changed `resolveNavigationAuthority` at 117..135; old async state constraints still need interpretation under new Supervisor eligibility. |
| `apps/dashboard/src/components/foundation/resolve-navigation-authority.ts` | 1..198 | Changed resolver now produces `emergencyTasksEligible` for Supervisor/eligible management at 134..149; commercial eligibility for Supervisor remains denied at 140..143. |
| `apps/dashboard/src/lib/navigation/navigation-authority.ts` | 1..74 | Changed navigation contract explicitly introduces `EMERGENCY_TASKS` gating at 16..19 and 48..57, separate from ordinary commercial checks 66..72. |

**Scoped inference:** unchanged `overview.controller.ts`, `app.module.ts`, `selected-management-shell.tsx` and `use-navigation-authority.ts` are legitimate *dependency-impact candidates* because their live caller/callee contracts changed, not because their own Git blobs changed. Their previous credit must be adjudicated against separate independent API/Dashboard dependency reviews before final manifest. This sample is not a conclusion that every textual importer is stale.

**Security boundary retained in this sample:** `listDashboardTasks` narrows the Supervisor fallback with explicit task type and state predicates; no observed expansion of `listRetrievalQueue` or ordinary financial data from the shown query. This does not replace end-to-end/DB authorization validation. No product code changes; no HTTP, PostgreSQL, browser or Native runtime tests. No new runtime-confirmed finding.
