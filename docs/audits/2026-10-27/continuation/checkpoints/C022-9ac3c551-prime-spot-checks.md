# C022 Prime independent pinned-source spot checks (provisional)

- Source commit: `9ac3c5518b6b7781364e90742589d8f63024f8f6`
- Git tree: `df279eba03754d18eaa98b3245b810cb808f82cf`
- Method: independent contiguous reading `1..EOF`, then SHA-256 of raw `git show HEAD:<path>` bytes, without executing product or runtime tests.
- Scope: 5 selected paths spanning W1/W2/W3/W6/W7 (including W4-origin transfers), **900 lines**. This is a bounded spot check, not a substitute for 175 individual worker reviews.

| Reviewer role | Original owner | Path | Read | Raw Git blob SHA-256 |
|---|---|---|---|---|
| W1 | W1 | `apps/api/src/app.module.ts` | `1..48` | `713d8bd19e2349a0962bdcce87ab1178f2740c57cd1f59f69d4e2a90a8a9c49b` |
| W2 | W2 | `apps/api/test/dashboard-overview-api.integration.test.ts` | `1..171` | `002e8e2f8c28825ed5680a22a4f78a7dfcb8eab1b696e55b47ef3cb53d9fcc17` |
| W3 | W3 | `apps/api/test/issue352-supervisor-tasks-races.integration.test.ts` | `1..182` | `96744b7a0c2c739f9ce0ac411a8c66683b521f10eaf02bd23e50b159f07dee71` |
| W6 | W4 | `apps/dashboard/e2e/issue352-takeover-interaction.spec.ts` | `1..242` | `7c5b5091b6fbd4d455d3ce899102e3416386c252e825bb99bf439ce41abb7ad8` |
| W7 | W4 | `apps/dashboard/e2e/issue352-takeover-visual-freeze.spec.ts` | `1..257` | `2f0c772d41f21a607807d310d13a40ee74173e77e33884922fafe9cc6dcda733` |

## Semantics and cross-consumer observations

- `app.module.ts` registers feature modules at Nest composition root; access checks, transactions, and domain invariants are delegated to those modules. Correlated test boundary: `apps/api/test/feature-module-ownership.test.ts`.
- `dashboard-overview-api.integration.test.ts:155-161` still asserts `404 AUTHORIZATION_DENIED` for on-shift Supervisor GET `/overview/tasks`. Current `apps/api/src/modules/dashboard/overview-retrieval-tasks-query.ts:148-184` expressly tries narrow `authorizeSupervisorEmergencyTasksScope` fallback and constrains result to exact organization/location `IN_PROGRESS` PARKING/RETRIEVAL tasks. `apps/api/test/issue352-supervisor-tasks.integration.test.ts` is the newer focused acceptance path. **High-confidence source-only P2 test-drift candidate** already tracked in RB004; no new runtime confirmation, do not double count. The old HTTP test setup's exact grant/task state needs reconciling before treating it as definitively failing at runtime.
- `issue352-supervisor-tasks-races.integration.test.ts` uses real PostgreSQL writer/reader transactions with LocationAccess revocation commit vs rollback and Shift end, plus org/cursor isolation. It waits for `pg_stat_activity` lock evidence and requires exact auth denial after commit; tests are source-reviewed only, not run in this audit.
- `issue352-takeover-interaction.spec.ts` uses a browser fixture to check a single reasoned POST, body schema, Unicode length, denial, Arabic Escape focus restoration, and late-context closed-drawer safety. This fixture is not independent real HTTP/PostgreSQL evidence.
- `issue352-takeover-visual-freeze.spec.ts` gates mounted visual captures on explicit pinned source SHA/base URL, iterates EN/AR, light/dark and 1440/390/320 widths, checks nested modal keyboard focus and Escape; its source is a test definition, not proof that screenshots ran in C022.

## Supplemental W6 Native-tracking candidate triage (read-only)

- Independently read `apps/valet-native/src/tracking/native-task-tracking-runtime.ts` in full and its focused `apps/valet-native/test/native-task-tracking-runtime.test.ts`, plus `packages/employee-client/src/employee-task-queue-owner.ts` and the relevant `employee-operational-session.ts` lifecycle.
- `resolveFence` in the Native runtime returns `false` once when a freshly eligible candidate has a *different* binding key than the paused binding, after clearing the fence. This can skip the new candidate on **that one queue snapshot**; the current Native unit tests cover same-key recovery but lack a different-key recovery case.
- Important counterevidence to an indefinite GPS outage: `EmployeeTaskQueueOwner.startTimer()` runs `setInterval(() => this.refresh(), intervalMs)` while foreground, scoped, non-suspended; the employee operational session defaults interval to 5,000 ms. A subsequent successful queue update notifies operational subscribers and calls `NativeTaskTrackingRuntime.reconcile()`, whose fence is then cleared. Under normal polling the new binding starts on the next successful snapshot. Treat as a **bounded transient admission-delay candidate**, NOT a proven permanent tracking stall or confirmed P2, pending worker reconciliation. Runtime not run.

## Correlation with saved worker evidence

After the five workers saved these selected records, Prime independently compared all five against the pinned blob bytes and the source readings above. **5/5 PASS** for exact path, assigned W1/W2/W3/W6/W7, original owner, full `1..EOF`, SHA-256, physical `execution_agent_id`, and substantive semantic/caller/test limitations. These samples do not stand in for independent review of the other 170 records.

The independent W2 cross-worker 12-file sample originally noted inaccurate W3 prose implying HTTP `401`; Prime re-read the current W3 `issue352-supervisor-tasks-races.integration.test.ts` record after W3's correction, and verified that it now states the actual asserted `AUTHORIZATION_DENIED` error code without an HTTP-status claim. Preserve the original independent observation as historical QA and classify the metadata issue **RESOLVED** before promotion.

## Outstanding before credit

- Complete independent final ledger and cross-worker source QA and strict C022 175/175 gate. No product/runtime tests were executed by Prime.
