# VAYLET 24-FINDING VERIFICATION REPORT

Read-only Owner review evidence. Repository: `yamanradwan1-rgb/valet-platform`.

## A. Executive summary

- **Baseline:** `f494ed06b4ffc6c698bfabb7519acd9994d07e6e` — fetched `origin/main`, then rechecked with `git ls-remote origin refs/heads/main` with the same result before report assembly, 2026-10-30 UTC.
- **Reviewed: 24/24. CONFIRMED: 20. REFUTED: 0. INCONCLUSIVE: 4.** Exactly one final status per issue.
- P2 candidates: 8 confirmed / 0 refuted / 4 inconclusive. P3 candidates: 12 confirmed / 0 refuted / 0 inconclusive.
- No P0/P1 finding established. Recommended change: **#392 P2 -> P3**, conditional on the remaining PG verification, because the evidenced scope is fixture drift. All other priorities retained; priorities on inconclusive issues remain provisional.
- **Already fixed among these 24: 0 established. Closure as false positive/already fixed: none recommended.** A failed or missing reproduction was not used to infer REFUTED.
- **No separate duplicate issues identified within these 24.** #377 includes alias C011-W5-NATIVE-001. #395 groups C016-W3-TEST-RACE-01, C016-W3-TEST-POLL-02 and C017-W3-P3-PG-LOCK-POLL-TEST-QUALITY; count each GitHub issue once.
- Tests: **100 passing tests across 19 selected test files** on the final successful commands (17 custom + 44 Native + 30 Employee Web + 4 Dashboard photos + 4 API diagnostics + 1 UI smoke). Repeated harness development runs are not added to that total. Mounted Chromium produced **8 scenario records** across #388/#389/#398/#390, including EN/AR field/keyboard cases.
- These are bounded findings: seven confirmed P3 items (#383/#384/#393/#394/#395/#396/#400) are defensive-contract or test-quality gaps. #397 is a test-generated tracked-file side effect. None of those establishes a corresponding production authorization/database defect.
- Outstanding evidence: actual monitoring consumer (#372), physical iOS/Android zoom (#387), full-shell same-instance target switch (#390), and migrated PostgreSQL execution (#392). Native device behavior remains untested even where deterministic JS/element tests confirm a narrower defect.

### Baseline, preservation and RUN 1

Initial checkout: clean branch `work`, HEAD `9ac3c5518b6b7781364e90742589d8f63024f8f6`; one existing worktree. No user changes were present. `git fetch origin main` advanced the local remote-tracking ref from `90aa90a8` to the pinned baseline; no remote ref was changed. Existing branch/HEAD/worktree contents were preserved. A new detached checkout was created at `tmp/audit-24-verification/baseline` under the original checkout's ignored `tmp/` directory. Existing installed dependency directories were temporarily symlinked for tests; they were not installed/updated and are removed before final integrity checks.

RUN 1 history from `9ac3c551` through this baseline was checked with `git log` and `git diff --name-only`. It changes Customer focus/hydration and Dashboard authentication/storage, map-dialog focus/coordinates, QR-print presentation, E2E outputs and the #371 residual-risk document. **None of the files cited by the 24 issues changed in RUN 1.** Earlier audit SHAs were also compared per issue: only #372's cited files changed after its original audit SHA (database-operation context and additive diagnostics); those changes retain the disputed output shape. The other 23 cited-file deltas are empty. This is history evidence plus current-source verification, not an inference that unchanged code must be defective.

The RUN 1 #371 Owner-accepted residual P2 risk remains a distinct exception, not a fix and not authorization to change policy. It is outside this issue list. #378 is distinct from the earlier #345 exact-END reconciliation fix; #382 is distinct from #357 push transport dedupe and #273 identity transition; #384 is not a re-audit of #358 operational scope fixes.

### Authority and verification rules checked

Applied the VAYLET code-review skill and its review matrix/evidence ladder, adapted to this exact verification scope (no PR merge verdict). Checked `AGENTS.md` source-of-truth/tenant/explicit-command/privacy rules; relevant clauses in `docs/06_SECURITY_AND_DATA_RULES.md`; `docs/07_DEFINITION_OF_DONE.md`; `docs/17_AGENT_CODE_STRUCTURE_RULES.md`; decision log and focused Accepted DEC-066/069/073/074/077/045/048/099 contracts; collaboration/contribution verification rules; the current monitoring target policy; and `RUN1_OWNER_ACCEPTED_RESIDUAL_RISK_2026-10-30.md`. UI Freeze and existing authority/retry decisions are preserved. The scoped read-only mission overrides generic implementation/full-suite/merge workflows. No broad repository audit or broad lint/typecheck/build/test run was justified by source edits, because there were none.

### Evidence definitions and limitations

`STATIC` = independently inspected source/contract/fixture/commit behavior. `TEST` = executed actual code under focused unit or synthetic/mock boundaries; it is **not** physical Native, real PostgreSQL, provider or production runtime proof. `RUNTIME` = actual mounted Chromium interaction in the bounded synthetic fixture. #390 carries RUNTIME partial evidence but remains INCONCLUSIVE for normal application reachability. A confirmed test-quality gap is classified on its test-source defect, without claiming the production behavior failed.

Browser harness mounted unmodified actual Employee React components/hooks and used safe synthetic props/data; it did not start the full Next application or real API. Native presentation used the repository's pure-element approach with mocked platform primitives. No customer or production data was used.

Docker CLI/daemon was available, but `docker ps` showed zero running containers; `psql`, `postgres` and `initdb` were absent. No approved already-migrated test target was supplied. Standard PG fixtures create databases, apply migrations and provision roles (for example `staff-auth-native-fixture.ts:105-135`). Under the explicit **no migrations** rule, those suites were not launched. Nothing here is a migrated-PG PASS. A separately authorized test setup or already-migrated disposable target is needed for outstanding DB acceptance. Physical iOS/Android, real SecureStore/GPS and the actual monitoring consumer were unavailable to this verification.

## B. Complete results matrix

| Issue | Original Priority | Final Status | Recommended Priority | Confidence | Evidence | Recommended Action |
|---|---|---|---|---|---|---|
| [#372](https://github.com/yamanradwan1-rgb/valet-platform/issues/372) | P2 | INCONCLUSIVE | P2 | MEDIUM | TEST | Obtain parser/label configuration and ingestion evidence |
| [#373](https://github.com/yamanradwan1-rgb/valet-platform/issues/373) | P2 | CONFIRMED | P2 | HIGH | TEST | Correct blocked verification presentation |
| [#374](https://github.com/yamanradwan1-rgb/valet-platform/issues/374) | P2 | CONFIRMED | P2 | HIGH | TEST | Validate effective pg target before connection |
| [#377](https://github.com/yamanradwan1-rgb/valet-platform/issues/377) | P2 | CONFIRMED | P2 | HIGH | TEST | Fence all post-cleanup publications |
| [#378](https://github.com/yamanradwan1-rgb/valet-platform/issues/378) | P2 | CONFIRMED | P2 | HIGH | TEST | Allow safe restoration retry after read failure |
| [#386](https://github.com/yamanradwan1-rgb/valet-platform/issues/386) | P2 | CONFIRMED | P2 | HIGH | TEST | Search all advertised identity fields |
| [#387](https://github.com/yamanradwan1-rgb/valet-platform/issues/387) | P2 | INCONCLUSIVE | P2 | MEDIUM | STATIC | Verify physical mobile zoom before disposition |
| [#388](https://github.com/yamanradwan1-rgb/valet-platform/issues/388) | P2 | CONFIRMED | P2 | HIGH | RUNTIME | Associate visible labels with controls |
| [#389](https://github.com/yamanradwan1-rgb/valet-platform/issues/389) | P2 | CONFIRMED | P2 | HIGH | RUNTIME | Use keyboard-operable semantic choice controls |
| [#390](https://github.com/yamanradwan1-rgb/valet-platform/issues/390) | P2 | INCONCLUSIVE | P2 | MEDIUM | RUNTIME | Prove full-shell trigger; then decide guard hardening |
| [#391](https://github.com/yamanradwan1-rgb/valet-platform/issues/391) | P2 | CONFIRMED | P2 | HIGH | TEST | Recover direct correction retry after refetch failure |
| [#392](https://github.com/yamanradwan1-rgb/valet-platform/issues/392) | P2 | INCONCLUSIVE | P3 | MEDIUM | STATIC | Run migrated-PG fixture/query verification |
| [#382](https://github.com/yamanradwan1-rgb/valet-platform/issues/382) | P3 | CONFIRMED | P3 | HIGH | TEST | Owner chooses attention bound/TTL |
| [#383](https://github.com/yamanradwan1-rgb/valet-platform/issues/383) | P3 | CONFIRMED | P3 | HIGH | TEST | Review compatibility; align parser cap |
| [#384](https://github.com/yamanradwan1-rgb/valet-platform/issues/384) | P3 | CONFIRMED | P3 | HIGH | TEST | Correct misleading SSR coverage claim |
| [#393](https://github.com/yamanradwan1-rgb/valet-platform/issues/393) | P3 | CONFIRMED | P3 | HIGH | TEST | Add actual oversized/boundary JPEG vectors |
| [#394](https://github.com/yamanradwan1-rgb/valet-platform/issues/394) | P3 | CONFIRMED | P3 | HIGH | STATIC | Add equal-time ordering regression |
| [#395](https://github.com/yamanradwan1-rgb/valet-platform/issues/395) | P3 | CONFIRMED | P3 | HIGH | STATIC | Use deterministic bounded DB barriers |
| [#396](https://github.com/yamanradwan1-rgb/valet-platform/issues/396) | P3 | CONFIRMED | P3 | HIGH | STATIC | Remove preceding-test fixture dependency |
| [#397](https://github.com/yamanradwan1-rgb/valet-platform/issues/397) | P3 | CONFIRMED | P3 | HIGH | STATIC | Write generated plans to ignored output |
| [#398](https://github.com/yamanradwan1-rgb/valet-platform/issues/398) | P3 | CONFIRMED | P3 | HIGH | RUNTIME | Clear stale ordinary Location choice |
| [#399](https://github.com/yamanradwan1-rgb/valet-platform/issues/399) | P3 | CONFIRMED | P3 | HIGH | TEST | Use actual manual/camera provenance |
| [#400](https://github.com/yamanradwan1-rgb/valet-platform/issues/400) | P3 | CONFIRMED | P3 | HIGH | TEST | Import and exercise the public UI entry |
| [#401](https://github.com/yamanradwan1-rgb/valet-platform/issues/401) | P3 | CONFIRMED | P3 | HIGH | TEST | Owner decides replacement-tracker fence policy |

## C. Detailed findings

All file/line references below point to the immutable baseline. All 24 complete issue descriptions and acceptance criteria, fetched through the GitHub read connector, are preserved in `issues.json`; comments were fetched across all pages and every issue had zero comments at retrieval. Acceptance criteria requesting fixes/regressions are future work, not authorization to perform them in this mission. Per-issue history and original-audit-SHA deltas are saved in `per-issue-history.txt` and `audit-sha-deltas.json`.

### Executed command evidence index

Commands below were run by `python .../run-command.py <log-name> <cwd> <command...>`, which records exact argument arrays, working directories, exit codes, elapsed time and output in the named JSON. `V` below is `/workspace/valet-platform/node_modules/vitest/vitest.mjs`; `B` is `/workspace/valet-platform/tmp/audit-24-verification/baseline`. Expand these two constants in the displayed commands; JSON records contain the full exact paths.

| ID | Working directory and exact command | Result / saved log |
|---|---|---|
| T1 | `B`: `node V run --config ../vitest.config.mjs` | 5 files, 17/17 pass; `custom-final.json` |
| T2 | `B/apps/valet-native`: `node V run --maxWorkers 1 test/native-release-panel.test.tsx test/native-shift-presence-runtime.test.ts test/native-incident-recovery-boundaries.test.ts test/native-incident-recovery-context.test.ts test/native-task-tracking-runtime.test.ts` | 5 files, 44/44 pass; `existing-native.json` |
| T3 | `B/apps/valet`: `node V run --maxWorkers 1 src/features/check-in/check-in-returning-controller.test.ts src/features/check-in/check-in-returning-isolation.test.ts src/features/parking/parking-controller-hydration.test.ts src/features/parking/parking-controller-rerender.test.ts src/features/task-queue/task-queue-scoping.test.tsx src/features/task-queue/task-queue-controller.test.ts` | 6 files, 30/30 pass; `existing-web.json` |
| T4 | `B/apps/dashboard`: `node V run --maxWorkers 1 src/features/operations/session-photos/photo-client.test.ts` | 1 file, 4/4 pass; `existing-dashboard.json` |
| T5 | `B/apps/api`: `node V run --maxWorkers 1 test/performance-request-diagnostics.test.ts test/http-operation-metrics.test.ts` | 1 matching file (diagnostics), 4/4 pass; `existing-metrics.json`. Second filter matched no file and is not counted as coverage. |
| T6 | `B/packages/ui`: `node V run --config ../../../ui.config.mjs` | 1 file, 1/1 pass; `existing-ui-final.json` |
| B1 | `B`: `node ../browser-run.cjs` | exit 0; Chromium version and 8 scenario records in `browser-results.json`; command/output `mounted-browser-final.json` |

Earlier non-success runs are preserved, not concealed: `custom-repros.json` failed before tests because the installed pnpm 11.25.0 attempted an automatic install and refused the worktree dependency symlink as unsafe (repository declares pnpm 10.34.5). No install was completed; direct Node/Vitest was used thereafter. `custom-repros-direct.json` failed module collection before exact package/subpath aliases were configured. `custom-all.json`/`custom-all-final.json` exposed missing Native test mocks; final corrected harness T1 passes. The first browser run timed out on a fixture button-name selector after earlier scenarios; B1 uses the actual accessible button query and completes. `existing-ui.json` initially inherited the evidence config and collected no UI test; explicit T6 config corrects collection. These were evidence-harness failures, not classified product reproduction failures. No green result is inferred from collection errors, and final successful counts include each selected test only once.

### #372 — HTTP metric schema drift exists; downstream ingestion failure is unproved

**Final status: INCONCLUSIVE** · Original: P2 · Recommended: P2 · Confidence: MEDIUM · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/api/src/common/observability/http-metrics.middleware.ts:36-50](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/common/observability/http-metrics.middleware.ts#L36); [apps/api/src/common/observability/performance-request-diagnostics.ts:76-104](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/common/observability/performance-request-diagnostics.ts#L76); [apps/api/src/common/observability/http-operation-metrics.ts:69-73](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/common/observability/http-operation-metrics.ts#L69); [infra/monitoring/README.md:3-31](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/infra/monitoring/README.md#L3); [infra/monitoring/guest-t4-alert-policy.json:13](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/infra/monitoring/guest-t4-alert-policy.json#L13).

**Proven source behavior / execution path and root cause:** The first HTTP middleware classifies the request, registers finish/close handlers, formats the four base fields, then appends route/requestId/errorCode/reason for recognized routes. The request ID is per-request correlation, not a bounded series dimension. The monitoring policy still describes fixed operation/outcome/status/durationMs fields.

**Required trigger / reachability:** A downstream parser must reject additive fields, or convert requestId into a metric-series label. Neither consumer behavior is established.

**Counterevidence and scope:** The repository explicitly says its target alert policy is not deployed and logs are not automatically connected to a metrics system. Route templates and failure categories are bounded, telemetry exceptions do not alter business responses, and the diagnostic test excludes request secrets.

**Reproduction status and observed assertions:** T5 exercised the real formatter/middleware with synthetic EventEmitter responses: final 503/499, correlation fields and once-only emission passed. No real HTTP ingestion provider was exercised.

**Tests executed:** T5: 4/4 diagnostic tests passed. No deployed parser, label-cardinality or alert-delivery test.

**Unverified behavior and limitations:** STATIC schema discrepancy and TEST emission behavior only. Provider rejection, cardinality, expense and monitoring loss remain unverified. P2 is provisional for the reported operational scenario.

**Recommended action / fix only:** Obtain the actual parser/label configuration and test captured synthetic records. Define additive-field compatibility and explicitly exclude requestId from series dimensions. Do not describe provider failure as confirmed.

**Owner decision required:** Yes — monitoring owner must supply/approve the actual consumer schema and label policy.

**History / overlap:** The two cited files changed since 2c181fc3: middleware wraps next in database-operation context; diagnostics add infrastructure failure classification/health routes. Neither separates request correlation from HTTP_METRIC or defines a deployed consumer. No RUN 1 fix overlaps.

### #373 — Blocked Native release displays a verified identity and invented default method

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/valet-native/src/handoff/native-release-panel.tsx:42-49](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/handoff/native-release-panel.tsx#L42); [apps/valet-native/src/handoff/native-release-panel.tsx:63-85](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/handoff/native-release-panel.tsx#L63); [packages/employee-client/src/employee-release-flow-state.ts:81-105](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/employee-client/src/employee-release-flow-state.ts#L81); [apps/valet-native/src/handoff/native-handoff-route-presentation.ts:11](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/handoff/native-handoff-route-presentation.ts#L11); [apps/valet-native/src/shell/native-production-workspace.tsx:203-216](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/shell/native-production-workspace.tsx#L203); [apps/api/src/modules/retrieval/complete-handoff-command.ts:66-84](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/modules/retrieval/complete-handoff-command.ts#L66).

**Proven source behavior / execution path and root cause:** A canonical session lacking verification produces phase=blocked/block=verification. Any non-inactive release is eligible for the release panel. That panel chooses Pickup code when method is absent and composes Identity verified for every non-loading/non-reconciling, non-released vehicle eyebrow.

**Required trigger / reachability:** Open/reconcile final release with missing/invalidated handoff proof, so a blocked canonical snapshot reaches the panel.

**Counterevidence and scope:** The operative Release CTA is limited to ready/releasing. EmployeeReleaseSession checks verification/financial readiness; server complete-handoff retains owner, lifecycle, proof and financial guards. This is misleading presentation, not a demonstrated unauthorized release.

**Reproduction status and observed assertions:** T1 generated a blocked snapshot through the actual EmployeeReleaseSession with a synthetic transport, rendered the actual panel through the repository pure-element harness in EN/AR, observed verified Pickup code prose, and verified zero complete calls after release().

**Tests executed:** T1: 2 targeted EN/AR cases passed; T2: existing Native release cases passed within 44/44.

**Unverified behavior and limitations:** Confirmed in canonical state-machine plus pure React element tests with mocked Native primitives; no mounted iOS/Android/device rendering claim.

**Recommended action / fix only:** Derive title/eyebrow/method from canonical verified evidence and blocked phase; never default an absent method to verified Pickup code. Add blocked, missing-proof and pending EN/AR presentation regressions without changing geometry.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #374 — The isolated PostgreSQL helper validates a different host from pg

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/api/tools/issue336-evidence-summary-pg.ts:7-14](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/tools/issue336-evidence-summary-pg.ts#L7); [apps/api/tools/issue336-evidence-summary-pg.ts:30-32](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/tools/issue336-evidence-summary-pg.ts#L30); [apps/api/tools/issue336-evidence-summary-pg.ts:54-65](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/tools/issue336-evidence-summary-pg.ts#L54); [apps/api/tools/issue336-evidence-summary-pg.ts:102-105](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/tools/issue336-evidence-summary-pg.ts#L102).

**Proven source behavior / execution path and root cause:** ACK plus new URL hostname/path checks precede construction of pg.Pool with the original connection string. The installed pg connection parser honors an override-capable URI option, so the effective host can differ from the checked authority.

**Required trigger / reachability:** An operator explicitly supplies the isolated-local ACK and an override-bearing URI accepted by the first guard.

**Counterevidence and scope:** This is opt-in test tooling. ACK, temporary tables and rollback narrow exposure; none guarantees the connection target. No production application connection path is implicated.

**Reproduction status and observed assertions:** T1 compared new URL and the installed pg ConnectionParameters parser offline. Checked host was loopback and checked database was the permitted test name; effective host was a synthetic reserved .invalid name. No Pool connection, DNS lookup or SQL was performed; exploit-bearing URLs are omitted from this report.

**Tests executed:** T1: offline parser disagreement assertion passed.

**Unverified behavior and limitations:** TEST proves parser disagreement and connection-target guard bypass, not a remote connection or database mutation. A loopback success smoke is still outstanding.

**Recommended action / fix only:** Validate/restrict the effective driver configuration before connect; reject override-capable query/connection options or construct explicit validated host/port/database options. Add non-network regression cases and a separately authorized disposable-loopback acceptance test.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #377 — Incident cleanup completion can overwrite a newer lifecycle fence

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: TEST · Complexity: MEDIUM

**Exact source:** [apps/valet-native/src/incident/native-incident-session.ts:62-77](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/incident/native-incident-session.ts#L62); [apps/valet-native/src/incident/native-incident-session.ts:167-201](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/incident/native-incident-session.ts#L167); [apps/valet-native/src/incident/native-incident-recovery-resolution.ts:114-129](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/incident/native-incident-recovery-resolution.ts#L114); [apps/valet-native/src/incident/native-incident-session.ts:105-109](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/incident/native-incident-session.ts#L105); [docs/decisions/DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md:589-605](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/docs/decisions/DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md#L589).

**Proven source behavior / execution path and root cause:** observeRecoveryContext checks generation after restore but awaits application of a definitive resolution before publishing without another check. retire has the same check-before-await pattern; acknowledge publishes after clearResolved without a generation guard. clearResolved may await storage. A fence can advance generation during that await.

**Required trigger / reachability:** Hold clearResolved pending; fence/replace lifecycle state; resolve the old clear. The old operation then publishes stale recovery-unknown/recovery-retired/inactive state.

**Counterevidence and scope:** Earlier generation checks and serialized storage exist. Server recovery remains actor/membership bound and no server authorization bypass was established. The tested stale outcomes were state/availability changes, not disclosure of an old Incident description.

**Reproduction status and observed assertions:** T1 used explicit deferred promises, waited until cleanup was entered, applied recovery-invalidated, then released cleanup. Restore, retire and acknowledge each replaced the newer fence with an older result.

**Tests executed:** T1: 3 controlled interleavings passed; T2: existing recovery boundary/context tests passed within 44/44.

**Unverified behavior and limitations:** Deterministic JS state-machine tests with a synthetic recovery/storage boundary. No SecureStore/device race or wrong-identity server access was exercised.

**Recommended action / fix only:** Capture and recheck generation and actor/scope after every awaited cleanup and before marker/snapshot publication, including catches and acknowledge. Preserve durable cleanup ordering and GET-only recovery; add purge and replacement-context interleavings.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #378 — A failed Shift Presence read suppresses same-generation restoration

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: TEST · Complexity: MEDIUM

**Exact source:** [apps/valet-native/src/shift/native-shift-presence-runtime.ts:72-92](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/shift/native-shift-presence-runtime.ts#L72); [apps/valet-native/src/shift/native-shift-presence-runtime.ts:165-170](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/shift/native-shift-presence-runtime.ts#L165); [apps/valet-native/src/shift/native-shift-presence-store.ts:142-147](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/shift/native-shift-presence-store.ts#L142); [apps/valet-native/src/auth/native-auth-runtime.ts:129-132](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/auth/native-auth-runtime.ts#L129).

**Proven source behavior / execution path and root cause:** restore sets restored=identityGeneration before either awaited store read. A read rejection escapes without resetting the latch. The operational-context observer swallows that rejection, and later restore calls for the same generation return immediately.

**Required trigger / reachability:** A transient installation-auth/SecureStore read rejects while an unresolved START/END descriptor exists. A later same-generation operational refresh retries restoration.

**Counterevidence and scope:** Identity purge resets the latch; recreating the runtime also starts it at -1. Exact-operation reconciliation and ownership checks remain authoritative. The claim is not that recovery is impossible forever or that an uncertain mutation is replayed.

**Reproduction status and observed assertions:** T1 seeded an END descriptor, rejected the first store read, then retried with healthy storage at the same generation. Read count stayed 1 and END was unrestored. Purge reset the latch and later reads proceeded.

**Tests executed:** T1: controlled read-rejection/retry case passed; T2: existing START/END stage, exact-result and purge cases passed within 44/44.

**Unverified behavior and limitations:** TEST with the existing mocked Native store adapter, not an induced real SecureStore/device failure. Device incidence unknown; #345 exact-END reconciliation does not fix this latch.

**Recommended action / fix only:** Only latch successful restoration, or safely clear the current-generation latch on failure; serialize concurrent attempts and preserve exact-operation no-replay rules. Cover failures in both store reads and identity changes.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #386 — Loaded Vehicles search omits plate/descriptor whenever make/model wins

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/dashboard/src/features/operations/operations-presentation.ts:69-80](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/operations-presentation.ts#L69); [apps/dashboard/src/features/operations/vehicles/vehicles-page.tsx:69-77](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/vehicles/vehicles-page.tsx#L69); [apps/dashboard/src/features/operations/operations-presentation.ts:115-131](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/operations-presentation.ts#L115); [apps/dashboard/src/features/operations/vehicles/vehicles-page.tsx:111-120](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/vehicles/vehicles-page.tsx#L111).

**Proven source behavior / execution path and root cause:** Authorized loaded-page rows are filtered solely using operationsVehicleLabel. That helper returns joined make/model before normalized plate or temporary descriptor; the EN/AR search label advertises plate/descriptor.

**Required trigger / reachability:** A loaded row has a nonblank make/model and a distinct plate or descriptor; search uses that omitted identifier.

**Counterevidence and scope:** Loaded-page scope is explicitly disclosed, and no server-search, tenant-isolation or pagination-wide result guarantee is alleged. A row with no make/model falls back to plate and can match.

**Reproduction status and observed assertions:** T1 supplied Toyota/Camry plus distinct PLATE777 and descriptor, called the real helper, and checked the page predicate outcome. Label was Toyota Camry; both distinct searches missed. The no-make/model control returned the plate.

**Tests executed:** T1: focused synthetic search-identity case passed.

**Unverified behavior and limitations:** Pure helper/predicate TEST plus source trace, not a mounted full Dashboard or real API search test.

**Recommended action / fix only:** Build search text from all advertised identity fields independently of the display label; add EN/AR loaded-page tests and retain scope, authorization and pagination boundaries.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #387 — Restrictive viewport configuration is present; physical zoom behavior is unverified

**Final status: INCONCLUSIVE** · Original: P2 · Recommended: P2 · Confidence: MEDIUM · Evidence: STATIC · Complexity: LOW

**Exact source:** [apps/valet/src/app/layout.tsx:19-24](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/app/layout.tsx#L19).

**Proven source behavior / execution path and root cause:** The Employee root exports Next viewport metadata with initialScale=1, maximumScale=1 and userScalable=false. This requests suppression of user zoom from browsers that honor it.

**Required trigger / reachability:** Use a mobile browser that honors those restrictions, including the relevant accessibility override/settings combination.

**Counterevidence and scope:** Some mobile browsers/accessibility settings can ignore or override viewport restrictions. The presence of this metadata alone does not prove failure on every current iOS/Android browser.

**Reproduction status and observed assertions:** Not reproduced on a physical mobile browser. The desktop Chromium component harness neither mounts the Next root layout nor proves pinch zoom.

**Tests executed:** No mobile pinch-zoom, assistive-technology or WCAG conformance test executed.

**Unverified behavior and limitations:** STATIC configuration only. Actual pinch-zoom suppression, device breadth and user impact remain unverified. Recommended P2 is conditional, not a confirmed accessibility compliance violation.

**Recommended action / fix only:** Run the accepted iOS/Android device/browser matrix with ordinary and accessibility settings. If restrictions block needed zoom, propose the smallest metadata correction and verify 200% text/zoom usability under UI Freeze.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #388 — Manual Check-In controls lack associated field names

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: RUNTIME · Complexity: LOW

**Exact source:** [apps/valet/src/components/screens/check-in/check-in-manual-plate-fields.tsx:27-46](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/check-in/check-in-manual-plate-fields.tsx#L27); [apps/valet/src/components/screens/check-in/check-in-intake-steps.tsx:62-77](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/check-in/check-in-intake-steps.tsx#L62).

**Proven source behavior / execution path and root cause:** Visible labels are siblings rather than enclosing/for-associated labels. Controls have no aria-label/labelledby. Chromium exposes the select without a name and uses example placeholders as textbox names.

**Required trigger / reachability:** Mount manual plate/country or Customer Contact in EN/AR and navigate or inspect accessible names.

**Counterevidence and scope:** The two textboxes are not entirely nameless in Chromium: placeholder fallback yields e.g. 12-34567 and 79 000 0000. The accurate defect is missing meaningful associated field names, with an unnamed country combobox; no screen-reader product-wide failure is asserted.

**Reproduction status and observed assertions:** B1 mounted actual React components with real DOM in Chromium, EN and AR. labels.length was 0; country had no aria naming attributes. Saved ARIA snapshots show the unnamed combobox and unchanged numeric/example textbox names in both locales.

**Tests executed:** B1: four locale/step scenario records passed their defect assertions.

**Unverified behavior and limitations:** Real mounted Chromium DOM/accessibility snapshot evidence. No physical screen-reader, iOS/Android, full responsive or full WCAG conformance claim.

**Recommended action / fix only:** Associate the existing visible labels through stable IDs/htmlFor or equivalent semantic names. Preserve geometry, locale, input behavior and server validation; add mounted accessible-name assertions.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #389 — Recoverable Check-In selection is unavailable through ordinary keyboard input

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: RUNTIME · Complexity: LOW

**Exact source:** [apps/valet/src/components/screens/check-in/check-in-recoverable-step.tsx:30-66](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/check-in/check-in-recoverable-step.tsx#L30).

**Proven source behavior / execution path and root cause:** Draft and continuation choices render onClick divs without tabIndex, button semantics or keyboard handlers. Back remains a button, but it does not perform either selection.

**Required trigger / reachability:** One or more recoverable choices are displayed and an operator relies on Tab, Enter or Space.

**Counterevidence and scope:** Pointer selection works and Back to Queue is available. This does not bypass command authorization or prove a touch/pointer workflow failure.

**Reproduction status and observed assertions:** B1 mounted one synthetic draft and continuation in EN/AR. Six Tab steps reached only buttons/body, never either choice; Enter/Space did not invoke selection. Pointer clicks invoked draft then continuation callbacks.

**Tests executed:** B1: two locale scenario records with keyboard and mouse controls passed.

**Unverified behavior and limitations:** Mounted Chromium interaction proof; no Native or assistive-device conformance claim.

**Recommended action / fix only:** Use semantic buttons for the existing choice visuals, preserving layout and callback targets; verify Tab/Enter/Space, focus treatment and EN/AR.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #390 — Stale Parking hydration is reproduced at the hook boundary; application trigger remains unproved

**Final status: INCONCLUSIVE** · Original: P2 · Recommended: P2 · Confidence: MEDIUM · Evidence: RUNTIME · Complexity: MEDIUM

**Exact source:** [apps/valet/src/features/parking/parking-controller.ts:78-123](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/parking/parking-controller.ts#L78); [apps/valet/src/features/parking/use-parking.ts:76-93](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/parking/use-parking.ts#L76); [apps/valet/src/components/shell/employee-live-router.tsx:81-130](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/shell/employee-live-router.tsx#L81); [apps/valet/src/components/employee-app.tsx:229-259](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/employee-app.tsx#L229); [apps/valet/src/components/screens/task-queue-screen.tsx:125-158](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/task-queue-screen.tsx#L125).

**Proven source behavior / execution path and root cause:** useParking retains one controller in useState. Each target-prop change launches hydration, but completion unconditionally updates activeSession without generation/target ownership. confirmParked subsequently reads that stored activeSession. The router does not key ParkingFlow by target, but switching screens normally unmounts it and the shell keys identity/scope.

**Required trigger / reachability:** The same mounted controller must receive target B while A is pending, then A must finish last. This condition was supplied by the synthetic fixture; a normal user path that changes the target without a remount is not established.

**Counterevidence and scope:** Ordinary Task Queue -> Parking -> Task Queue -> Parking navigation replaces the flow. Queue actionInFlightRef blocks simultaneous actions on the same mounted queue; the outer shell keys auth generation/member/Location/Shift. Existing same-workflow rerender tests pass.

**Reproduction status and observed assertions:** B1 mounted actual useParking, requested A, rerendered target B, resolved B then A. Observed target=B, activeSession=A, isHydrating=false. This proves the hook/controller race under its stated condition, not a normal full-shell reproduction or a wrong backend write.

**Tests executed:** B1: controlled mounted hook interleaving passed. T3: existing hydration/rerender tests passed within 30/30. No full-shell target-switch or mutation reproduction.

**Unverified behavior and limitations:** Partial RUNTIME proof only. Final INCONCLUSIVE concerns production reachability and resulting mutation, not whether the unguarded hook can race. Do not close based solely on the ordinary remount counterexample.

**Recommended action / fix only:** First establish a supported full-shell same-instance switch (including outstanding navigation callbacks). If reachable, fence hydration/publication and mutation readiness by target generation. If no supported trigger exists, consider separately scoped defensive hardening rather than reporting current operational mis-targeting.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #391 — Correction retry remains busy if conflict rehydration fails

**Final status: CONFIRMED** · Original: P2 · Recommended: P2 · Confidence: HIGH · Evidence: TEST · Complexity: MEDIUM

**Exact source:** [apps/valet/src/features/check-in/check-in-returning-vehicle.ts:128-185](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/check-in/check-in-returning-vehicle.ts#L128); [apps/valet/src/features/check-in/check-in-returning-vehicle.ts:189-200](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/check-in/check-in-returning-vehicle.ts#L189); [apps/valet/src/features/check-in/check-in-returning-vehicle.ts:214-239](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/check-in/check-in-returning-vehicle.ts#L214); [apps/valet/src/features/check-in/check-in-returning-mutations.ts:97-114](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/check-in/check-in-returning-mutations.ts#L97); [apps/valet/src/components/screens/check-in-flow.tsx:198-209](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/check-in-flow.tsx#L198); [apps/valet/src/components/screens/check-in/check-in-returning-vehicle-step.tsx:67-70](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/check-in/check-in-returning-vehicle-step.tsx#L67); [apps/valet/src/components/screens/check-in/check-in-returning-vehicle-step.tsx:118-151](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/screens/check-in/check-in-returning-vehicle-step.tsx#L118).

**Proven source behavior / execution path and root cause:** correctPendingDetails sets isSubmitting=true. On VEHICLE_DETAILS_VERSION_CONFLICT its catch awaits rehydrateCreatedSession with no nested recovery/finally. A second rejection escapes before the false update. The public continueAfterCustomerResolution path calls this directly; the screen invokes it with void and disables Back/Continue/correction using isSubmitting.

**Required trigger / reachability:** A created/resolved returning intake has a pending correction; explicit Continue/retry encounters a CAS conflict, then its authoritative refetch rejects.

**Counterevidence and scope:** The first createPreIntakeSession call has an outer catch that resets isSubmitting. A successful conflict refetch also clears the flag and refreshes the CAS token. The confirmed defect is the direct post-customer Continue/retry path after intake exists, not every conflict.

**Reproduction status and observed assertions:** T1 called the real direct continuation helper with synthetic returning state and a client rejecting first with the exact conflict code, then with refetch failure. The returned promise rejected and isSubmitting remained true while step stayed returning-vehicle.

**Tests executed:** T1: conflict-plus-refetch-failure assertion passed. T3: existing success/conflict/isolation tests passed within 30/30.

**Unverified behavior and limitations:** TEST of actual helper/control flow with synthetic API failures plus static UI disabled-state trace. No real API failure, mounted stranded-controls test or database write was performed.

**Recommended action / fix only:** Handle second failures and restore actionable controls on every exit without discarding the existing intake, guessing a CAS token or replaying a protected write. Add the public direct-retry failure case and mounted recovery control assertions.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #392 — Live Map fixture drift is visible; migrated PostgreSQL failure is not verified

**Final status: INCONCLUSIVE** · Original: P2 · Recommended: P3 · Confidence: MEDIUM · Evidence: STATIC · Complexity: LOW

**Exact source:** [apps/api/test/live-map-test-context.ts:203-230](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/live-map-test-context.ts#L203); [apps/api/src/modules/tracking/live-map-query.ts:87-95](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/modules/tracking/live-map-query.ts#L87); [apps/api/test/live-map-pagination.integration.test.ts:11-43](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/live-map-pagination.integration.test.ts#L11); [packages/database/prisma/migrations/20261029010500_issue352_emergency_takeover_persistence/migration.sql:30-51](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/database/prisma/migrations/20261029010500_issue352_emergency_takeover_persistence/migration.sql#L30); [apps/api/src/modules/tracking/task-tracking-lifecycle.ts:61-75](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/modules/tracking/task-tracking-lifecycle.ts#L61).

**Proven source behavior / execution path and root cause:** addParkingWork inserts a tracker without assignee_membership_id. The later #352 migration adds that nullable column without a default; the current Live Map query excludes null or mismatched assignees. The pagination test expects three visible trackers after adding two rows through this helper.

**Required trigger / reachability:** Run the current fixture and Live Map query on an isolated database with all current versioned migrations and runtime privileges.

**Counterevidence and scope:** Production tracker creation supplies the authoritative assignee, and null-owner exclusion is intentional attribution protection. The mismatch is test-only; removing the production filter would be an unsafe response. No PostgreSQL run occurred in the original issue either.

**Reproduction status and observed assertions:** Source mismatch independently traced through insert, migration, predicate and assertion. No current migrated PostgreSQL target was available. There were no running containers and no PostgreSQL binaries; standard fixtures would create databases, apply migrations and provision roles, which this mission forbids.

**Tests executed:** No PostgreSQL tests executed; do not interpret this as a skipped-green suite or a failed reproduction.

**Unverified behavior and limitations:** STATIC evidence strongly supports fixture drift, but the requested real migrated-PG reproduction is absent. Recommended P2 -> P3 because the reported scope is test-fixture correctness, with no production tracker defect established.

**Recommended action / fix only:** Provide an already-migrated disposable PostgreSQL target or separately authorize the required setup. Then run only Live Map pagination/assignment/tenant tests and align synthetic tracker ownership if failure is confirmed.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #382 — Foreground attention retains an unbounded per-identity set

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/valet-native/src/notifications/native-push-foreground-attention.ts:5-31](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/notifications/native-push-foreground-attention.ts#L5); [apps/valet-native/src/notifications/native-push-lifecycle.ts:108-119](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/notifications/native-push-lifecycle.ts#L108); [apps/valet-native/src/notifications/native-push-lifecycle.ts:146-158](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/notifications/native-push-lifecycle.ts#L146); [apps/valet-native/src/notifications/native-push-lifecycle.ts:281](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/notifications/native-push-lifecycle.ts#L281).

**Proven source behavior / execution path and root cause:** Valid foreground receipts add unique intent IDs to a Set and publish a full array copy. Background/foreground toggles change only active, not retained IDs. Removal is explicit dismissal or identity clear; there is no count limit or TTL.

**Required trigger / reachability:** A long-lived current authenticated identity receives many distinct valid intents without dismissing them.

**Counterevidence and scope:** Wire schema/kind, current identity and foreground gates exist; duplicate IDs are rejected; dismiss and identity purge clear entries. No memory exhaustion, real delivery volume or unauthorized push authority is demonstrated.

**Reproduction status and observed assertions:** T1 fed 2,000 distinct valid synthetic intents, toggled background/foreground, and observed 2,001 retained on the next receipt. Dismiss reduced to 2,000; clear followed by a new receipt produced 1; stale identity was ignored.

**Tests executed:** T1: bounded high-count synthetic lifecycle case passed.

**Unverified behavior and limitations:** TEST proves retention growth through 2,001 IDs and source establishes absence of a bound; no device memory benchmark, stale-indicator lifetime policy violation or production load measurement.

**Recommended action / fix only:** Choose an accepted attention retention/count/expiry rule, then implement bounded pruning and test foreground transitions, duplicate handling, dismissal and identity purge.

**Owner decision required:** Yes — choose the maximum/TTL and treatment of still-undismissed attention.

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #383 — Current and legacy directory parsers accept more than the documented page cap

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [packages/contracts/src/staff-vehicle-directory.ts:119-142](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/contracts/src/staff-vehicle-directory.ts#L119); [apps/api/src/modules/staff/staff-vehicle-directory.queries.ts:58-72](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/modules/staff/staff-vehicle-directory.queries.ts#L58).

**Proven source behavior / execution path and root cause:** Both strict response objects use an uncapped z.array for rows despite the local response comment specifying at most 100. Strict field validation does not impose array length. The producer independently applies DIRECTORY_PAGE_LIMIT=100.

**Required trigger / reachability:** A changed/misconfigured producer supplies 101 otherwise-valid rows to either consumer parser.

**Counterevidence and scope:** The actual producer cap was retained and tested: 101 candidates become 100 rows plus truncated=true. DEC-066 permits a safety cap with truthful loaded-page disclosure; no current API response over the cap or authorization bypass is proved.

**Reproduction status and observed assertions:** T1 parsed synthetic pages of 100 and 101 valid rows through both real current/legacy schemas; all four were accepted. A separate pure producer-cap control returned exactly 100.

**Tests executed:** T1: two parser-count cases plus producer-cap control passed.

**Unverified behavior and limitations:** Defense-in-depth parser-contract gap only; synthetic producer input, not real server overproduction. The original DEC alone does not mandate a parser max; this recommendation enforces the currently documented local contract.

**Recommended action / fix only:** After compatibility review, align documented and executable response bounds in both wire generations and test 100/101. Keep the producer and authorization boundary authoritative.

**Owner decision required:** Yes — confirm compatibility expectations for rejecting formerly accepted over-limit wire responses.

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #384 — The SSR scoping test does not exercise the advertised hard-stop behavior

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/valet/src/features/task-queue/task-queue-scoping.test.tsx:75-117](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/task-queue/task-queue-scoping.test.tsx#L75); [apps/valet/src/features/task-queue/task-queue-controller.test.ts:88-119](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/task-queue/task-queue-controller.test.ts#L88).

**Proven source behavior / execution path and root cause:** The named per-Location hard-stop test builds a rejecting client, renders one loc-forbidden instance with renderToStaticMarkup, then asserts only that a hook result is non-null. SSR does not run the effect that starts requests; no 403, polling halt, scope switch or denial callback is asserted there.

**Required trigger / reachability:** Treat that test/title as runtime proof of request denial or Location isolation.

**Counterevidence and scope:** Separate controller tests actually assert empty tasks, hard-stop, one denial callback and no later requests for 401/403/404, and exercise an A/B deferred race. The finding is a misleading coverage claim, not a demonstrated authorization defect.

**Reproduction status and observed assertions:** T3 ran the unchanged scoping and controller files. All passed, consistent with the gap: the weak SSR assertion can pass without exercising its constructed denial.

**Tests executed:** T3: six selected Web files, 30/30 passed, including both cited files.

**Unverified behavior and limitations:** TEST execution plus source/assertion inspection. Passing these tests is not server IDOR or full mounted-browser hard-stop verification.

**Recommended action / fix only:** Rename/rescope the SSR assertion to the synchronous invariant it proves, or add narrowly justified mounted hook coverage of the missing behavior; preserve controller denial coverage.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #393 — The oversized-JPEG test supplies no oversized JPEG

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/dashboard/src/features/operations/session-photos/photo-client.test.ts:47-61](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/session-photos/photo-client.test.ts#L47); [apps/dashboard/src/features/operations/session-photos/photo-client.ts:18](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/session-photos/photo-client.ts#L18); [apps/dashboard/src/features/operations/session-photos/photo-client.ts:75-92](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/dashboard/src/features/operations/session-photos/photo-client.ts#L75).

**Proven source behavior / execution path and root cause:** The test title includes oversized, but its only two byte arrays are four-byte wrong-format and four-byte truncated samples. Neither exercises the >8 MiB branch.

**Required trigger / reachability:** Rely on the named test as regression coverage for the byte-size bound.

**Counterevidence and scope:** Production validation explicitly rejects >8 MiB. T1 separately verified this bound on the unchanged code; there is no demonstrated oversized-image acceptance defect.

**Reproduction status and observed assertions:** T4 ran the original 4/4 tests. T1 supplied syntactically SOI/EOI-bounded synthetic buffers of 8 MiB and 8 MiB+1: boundary accepted, over-limit rejected. These are size-check vectors, not proof of a complete JPEG decoder.

**Tests executed:** T4: 4/4 passed. T1: focused boundary/over-limit case passed.

**Unverified behavior and limitations:** Confirmed missing test vector, not a production upload vulnerability or full media decode validation claim.

**Recommended action / fix only:** Add real over-limit and exact-boundary vectors to the repository regression test, preserving existing type/signature/truncation checks.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #394 — Queue ordering coverage never exercises equal-time tie-breaking

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: STATIC · Complexity: LOW

**Exact source:** [apps/api/test/staff-task-queue-ordering-and-lifecycle.integration.test.ts:20-79](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/staff-task-queue-ordering-and-lifecycle.integration.test.ts#L20); [apps/api/src/modules/dispatch/task-queue-query.ts:101-104](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/modules/dispatch/task-queue-query.ts#L101).

**Proven source behavior / execution path and root cause:** The test sorts three UUIDs and pairs them with strictly increasing created_at values. Both time-only ordering and time/id ordering satisfy its expected list, so removing the id tie-break would not be detected by this vector.

**Required trigger / reachability:** The intended regression is ordering when multiple rows share created_at.

**Counterevidence and scope:** The production query does contain ORDER BY task.created_at, task.id. Targeted inspection of related Task Queue tests found no deliberately equal-time multi-row ordering vector. No production ordering failure is claimed.

**Reproduction status and observed assertions:** The absence of an equal-time vector is established from fixture construction and assertion. Real PostgreSQL ordering/paging was not executed.

**Tests executed:** No PG tests executed. Static coverage verification only; a test-gap finding does not require claiming a DB failure.

**Unverified behavior and limitations:** Confirmed test insufficiency, not incorrect SQL. New database coverage needs separately available/authorized test setup.

**Recommended action / fix only:** Add equal-timestamp tasks with deliberately non-insertion-sorted IDs and assert stable results on an authorized disposable migrated PostgreSQL target. Test pagination only where that API actually supports it; do not invent it for this queue.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #395 — Race helpers contain timing guesses and incomplete polling bounds

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: STATIC · Complexity: MEDIUM

**Exact source:** [apps/api/test/key-eligibility-concurrency.integration.test.ts:132-188](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/key-eligibility-concurrency.integration.test.ts#L132); [apps/api/test/management-location-race-test-helpers.ts:83-97](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/management-location-race-test-helpers.ts#L83); [apps/api/test/management-settings-race-test-helpers.ts:50-98](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/management-settings-race-test-helpers.ts#L50).

**Proven source behavior / execution path and root cause:** Key eligibility cases sleep 100 ms instead of proving the competing request reached its lock barrier. The settings helper performs up to 1,000 immediate query iterations without a wall-clock budget/backoff. The Location helper spins queries without backoff.

**Required trigger / reachability:** Scheduling or PostgreSQL response speed differs from the developer environment; a fixed sleep may precede actual contention or tight polling may consume excessive queries/time.

**Counterevidence and scope:** The Location helper already has a 10-second wall-clock deadline, contradicting any blanket claim that all helpers are unbounded. Settings polling has an iteration cap. No flaky result, production lock bug or one-winner failure was observed.

**Reproduction status and observed assertions:** Confirmed the concrete synchronization mechanisms from source. No synthetic sleep result is passed off as PostgreSQL lock/race proof.

**Tests executed:** No real PostgreSQL concurrency suites executed under this no-migrations mission.

**Unverified behavior and limitations:** STATIC test-reliability debt. Actual flakiness, query cost and PostgreSQL outcomes remain unmeasured. Grouped aliases C016-W3-TEST-POLL-02 and C017-W3-P3-PG-LOCK-POLL-TEST-QUALITY belong here.

**Recommended action / fix only:** Replace timing assumptions with specific session/query lock barriers and bounded deadlines; add paced polling where needed and cleanup on failure. Retain one-winner and authority assertions. Do not simply lengthen sleeps.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #396 — The missing/malformed bearer test depends on the preceding successful test

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: STATIC · Complexity: LOW

**Exact source:** [apps/api/test/staff-push-registration-authority.integration.test.ts:5-62](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/staff-push-registration-authority.integration.test.ts#L5); [apps/api/test/staff-push-api-fixture.ts:104-112](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/staff-push-api-fixture.ts#L104); [apps/api/test/staff-auth-native-fixture.ts:105-135](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/staff-auth-native-fixture.ts#L105).

**Proven source behavior / execution path and root cause:** One shared fixture starts beforeAll. The positive case inserts the one registration; the next missing/malformed-bearer case asserts a global registration length of 1. Its setup and body create no registration, and the base fixture starts an empty dedicated database/API rather than seeding this prerequisite.

**Required trigger / reachability:** Run only the negative case or run it before the positive case. With correct denial/no writes, the expected existing count has no local setup source.

**Counterevidence and scope:** Normal declared sequential execution supplies the row. Later revoked/expired/disabled cases use a before/after count, which is order-independent. The source concern is fixture coupling, not proof of a successful unauthorized write.

**Reproduction status and observed assertions:** STATIC dependency is established by the producer positive test, shared beforeAll and literal negative assertion. No isolated/reordered PostgreSQL execution was performed.

**Tests executed:** No PG tests executed because fixture.start applies migrations/provisions roles. This report does not claim an observed isolated DB failure.

**Unverified behavior and limitations:** CONFIRMED only as a test-order dependency; actual isolated HTTP/PG failure and server denial behavior were not runtime-verified.

**Recommended action / fix only:** Capture before/after registration counts or explicitly seed the negative case; verify isolated/reordered denial and zero writes on an authorized disposable migrated target.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #397 — The history benchmark directly overwrites tracked evidence and stale metadata

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: STATIC · Complexity: LOW

**Exact source:** [apps/api/test/staff-shift-history-plan.integration.test.ts:90-108](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/test/staff-shift-history-plan.integration.test.ts#L90); [docs/validation/issue240e-query-plans.json:1-7](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/docs/validation/issue240e-query-plans.json#L1).

**Proven source behavior / execution path and root cause:** After EXPLAIN ANALYZE measurements, writeFileSync targets ../../docs/validation/issue240e-query-plans.json from the API working directory. git ls-files confirms this is tracked. Execution timings are nondeterministic; migrationsThrough is hard-coded to 96 while the baseline contains 105 versioned migration directories.

**Required trigger / reachability:** Select and successfully run the history benchmark from its normal API package working directory.

**Counterevidence and scope:** The write is a local test-side effect, not production telemetry, database history rewriting or a remote change. It occurs only after successful benchmark assertions; no tracked write happened in this mission.

**Reproduction status and observed assertions:** Verified write target, tracked ownership and metadata statically. Deliberately did not execute the benchmark because it would apply migrations and modify a tracked file.

**Tests executed:** No benchmark or PostgreSQL test executed; no EXPLAIN result claimed.

**Unverified behavior and limitations:** STATIC direct file-write evidence. Opt-in/selective execution is not proof that the file can never run in broader PG discovery; do not use this finding to assert anything about production plans.

**Recommended action / fix only:** Send generated measurements to an ignored evidence path or explicit caller output, derive truthful migration metadata, and verify the selected benchmark leaves tracked files unchanged.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #398 — A removed Start Shift choice remains the submitted selection

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: RUNTIME · Complexity: LOW

**Exact source:** [apps/valet/src/components/shell/employee-start-shift-panel.tsx:45-50](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/shell/employee-start-shift-panel.tsx#L45); [apps/valet/src/components/shell/employee-start-shift-panel.tsx:102-109](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/shell/employee-start-shift-panel.tsx#L102); [apps/valet/src/components/shell/employee-start-shift-panel.tsx:134-143](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/components/shell/employee-start-shift-panel.tsx#L134); [apps/valet/src/features/shift/start-shift-controller.ts:77-85](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet/src/features/shift/start-shift-controller.ts#L77); [apps/api/src/modules/shifts/start-shift-command.ts:158-171](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/api/src/modules/shifts/start-shift-command.ts#L158).

**Proven source behavior / execution path and root cause:** chosenLocationId persists in local state. effectiveChosen uses non-null selection without checking refreshed locations. The enabled Start callback submits that old ID. StartShiftController does not have a current eligible-list filter; the server independently reauthorizes the requested Location.

**Required trigger / reachability:** The mounted panel has A/B; select A; refresh the eligible list to B-only without replacing the panel; press Start.

**Counterevidence and scope:** Zero eligible Locations hide the whole choice UI; a fresh mount preselects the sole valid Location. Server Start Shift still proves current scope/access, and uncertain same-command retry has separate preserved semantics. No unauthorized Shift creation was demonstrated.

**Reproduction status and observed assertions:** B1 mounted the actual panel, selected A, rerendered B-only, verified A no longer appeared, then clicked Start and captured callback A.

**Tests executed:** B1: stale-choice mounted interaction passed.

**Unverified behavior and limitations:** Mounted component callback RUNTIME proof with synthetic props; not a real API denial or full-shell refresh timing measurement.

**Recommended action / fix only:** Revalidate ordinary local selection against the latest authoritative list and clear/fallback appropriately. Keep uncertain retained-command reconciliation separate; never silently retarget a request with unknown outcome.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #399 — Manual Native plate recognition is presented as camera detection

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [apps/valet-native/src/check-in/native-check-in-state-steps.tsx:95-104](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/check-in/native-check-in-state-steps.tsx#L95); [apps/valet-native/src/check-in/native-check-in-identity-context.tsx:41-45](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/check-in/native-check-in-identity-context.tsx#L41); [apps/valet-native/src/check-in/native-check-in-identity-context.tsx:65-73](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/check-in/native-check-in-identity-context.tsx#L65); [apps/valet-native/src/check-in/native-check-in-capture-step.tsx:65-97](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/check-in/native-check-in-capture-step.tsx#L65); [packages/employee-client/src/employee-check-in-session.ts:92-105](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/employee-client/src/employee-check-in-session.ts#L92); [apps/valet-native/src/check-in/native-check-in-workflow.tsx:164-168](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/check-in/native-check-in-workflow.tsx#L164); [apps/valet-native/src/check-in/native-check-in-workflow.tsx:225-228](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/check-in/native-check-in-workflow.tsx#L225).

**Proven source behavior / execution path and root cause:** Manual plate input goes through review/confirm to the same recognizing phase. Workflow already carries capture presentation, but NativeBusyStep hard-codes camera when recognizing, producing Detected and High confidence for any confirmed plate.

**Required trigger / reachability:** Manually enter/confirm a plate and hold the returning-vehicle recognition request pending.

**Counterevidence and scope:** Human confirmation and server vehicle recognition remain authoritative. This is transient source/provenance wording; it does not prove OCR confidence, a persisted OCR origin, or an authorization bypass. Descriptor mode has separate wording.

**Reproduction status and observed assertions:** T1 rendered the actual recognizing step with a manual-compatible confirmed plate in the repository element harness in EN/AR. Detected and High confidence were present and Manual entry absent. Source trace establishes the manual path reaches that same phase.

**Tests executed:** T1: 2 focused EN/AR presentation cases passed.

**Unverified behavior and limitations:** Pure element TEST with mocked Native primitives; no mounted device, real camera/OCR or Native accessibility-tree test.

**Recommended action / fix only:** Pass the existing actual capture presentation through the busy step and select truthful wording. Add manual/camera/descriptor EN/AR cases without changing layout or making camera input authoritative.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #400 — The UI smoke test cannot detect a broken public barrel

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: LOW

**Exact source:** [packages/ui/src/index.test.ts:1-7](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/ui/src/index.test.ts#L1); [packages/ui/src/index.tsx:1-15](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/ui/src/index.tsx#L1).

**Proven source behavior / execution path and root cause:** The only smoke assertion checks that a hard-coded @valet/ui string contains ui. It imports no package barrel or component and therefore cannot observe missing AppShell exports or a TSX consumer import failure.

**Required trigger / reachability:** Use this test as proof that workspace applications can import/use the public package.

**Counterevidence and scope:** Consumer builds/typechecks can provide separate export/typing coverage. No actual package export failure was found or claimed.

**Reproduction status and observed assertions:** T6 ran the unchanged test: 1/1 passed. Inspection confirms that passing has no dependency on the public implementation.

**Tests executed:** T6: 1/1 original smoke test passed.

**Unverified behavior and limitations:** Confirmed smoke-test insufficiency, not proof of a broken package or failed production build.

**Recommended action / fix only:** Replace the literal-string assertion with a focused import of the actual public entry and a meaningful component/export contract check, using the supported TSX test transform.

**Owner decision required:** No

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

### #401 — A fresh different tracker clears a fence but does not start on that reconciliation

**Final status: CONFIRMED** · Original: P3 · Recommended: P3 · Confidence: HIGH · Evidence: TEST · Complexity: MEDIUM

**Exact source:** [apps/valet-native/src/tracking/native-task-tracking-runtime.ts:179-210](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/tracking/native-task-tracking-runtime.ts#L179); [apps/valet-native/src/tracking/native-task-tracking-runtime.ts:126-139](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/apps/valet-native/src/tracking/native-task-tracking-runtime.ts#L126); [packages/employee-client/src/employee-operational-session.ts:39-42](https://github.com/yamanradwan1-rgb/valet-platform/blob/f494ed06b4ffc6c698bfabb7519acd9994d07e6e/packages/employee-client/src/employee-operational-session.ts#L39).

**Proven source behavior / execution path and root cause:** After successfulQueueSnapshotCount advances, resolveFence clears the old network/completion fence. If the new candidate has a different key, it retires the publisher and returns false, so reconcile exits before starting the valid new candidate.

**Required trigger / reachability:** Pause tracker A behind a network/completion fence, then receive a newer successful queue snapshot with eligible tracker B and no other notification immediately after it.

**Counterevidence and scope:** Tracking is stopped conservatively, not continued without authority. A later reconcile, including explicit retry/auth notification, can start B; it need not literally wait for a second queue poll. Foreground queue interval defaults to 5 seconds, but real delay depends on event timing/network. No permanent GPS loss is established.

**Reproduction status and observed assertions:** T1 used the actual runtime with synthetic auth/queue/location ports: A watcher=1; offline/online; fresh B/count=2 left watcher=1 and status idle; B/count=3 produced watcher=2 and active. Ordering was controlled without a timing sleep.

**Tests executed:** T1: focused different-key fence case passed. T2: existing tracking authority/offline/completion cases passed within 44/44.

**Unverified behavior and limitations:** TEST proves one extra reconciliation requirement, not five seconds of measured device delay or physical GPS failure. Real location APIs and tracking ingestion were mocked.

**Recommended action / fix only:** Have the Owner decide whether the extra reconciliation is an intended conservative fence. If immediate fresh-B start is desired, prove both fence/authority checks before changing control flow and retain privacy/no-stale-tracker tests.

**Owner decision required:** Yes — accept existing conservative pause or approve immediate eligible-replacement behavior.

**History / overlap:** The cited paths are byte-unchanged between the issue's original pinned audit SHA and this baseline (see audit-sha-deltas.json). Per-file latest commits were inspected; no later fix or exact duplicate among these 24 was established. RUN 1 does not touch the cited paths.

## D. Recommended fix order

This is a recommendation for Owner review, not implementation authorization. Risk ordering considers security/data integrity first, then operations/user impact, occurrence conditions, complexity and regression risk. No issue here proves a new cross-tenant bypass, unauthorized release or production database corruption.

| Rank | Confirmed issue(s) | Why / readiness / regression risk |
|---|---|---|
| 1 | #374 | Test-tool connection isolation: a wrong target is a safety boundary. LOW complexity, ready for focused effective-config validation; do offline cases first. Avoid weakening normal production DB policy. |
| 2 | #377 | Native identity/lifecycle fence correctness. MEDIUM complexity and higher recovery regression risk; exact operation, scope and storage ordering must survive all await branches. Ready for a tightly scoped fence fix. |
| 3 | #373 | Operator-facing handoff truthfulness at vehicle release. LOW complexity; canonical guards stay unchanged. Ready for minimal bilingual presentation correction. |
| 4 | #378, #391 | Recovery availability: conditional storage or conflict/refetch failures can block continued operations. MEDIUM complexity; preserve no-replay, CAS and one-intake guarantees. Ready for targeted fixes with failure-path tests. |
| 5 | #389, #388 | Keyboard recovery selection and meaningful field names affect basic operability. LOW complexity, ready for semantic-only corrections with mounted EN/AR checks; preserve visual/focus geometry. |
| 6 | #386 | Advertised plate search misses normal make/model-equipped vehicles. LOW complexity, ready for loaded-page identity-search correction without server-search expansion. |
| 7 | #398, #399 | Avoidable denied Shift submission / incorrect transient capture provenance. LOW complexity, ready for ordinary-selection revalidation and provenance-only correction. Keep uncertain retry intent untouched. |
| 8 | #397 | Benchmark modifies tracked evidence. LOW complexity; direct generated-output correction is ready, but validate later only on authorized disposable PG setup. |
| 9 | #384, #393, #400, #394, #396 | LOW-complexity test truthfulness/independence quick wins. The first three need no PostgreSQL; #394/#396 acceptance needs an authorized migrated PG fixture. No product policy should change. |
| 10 | #395 | MEDIUM-complexity concurrency-test reliability work. Real PostgreSQL deterministic barriers and cleanup are necessary; no runtime lock change justified. |
| 11 | #382, #383, #401 | Confirmed bounded gaps/behavior, but **decision required before implementation**: attention retention, parser compatibility, replacement-tracker pause policy respectively. Do not invent these choices. |

**Highest-priority implementation-ready shortlist:** #374, #377, #373, #378, #391, #389, #388, #386. These have enough bounded evidence to plan focused fixes without reopening accepted product semantics; this report itself authorizes none.

**Quick wins:** semantic labels/buttons (#388/#389), complete search text (#386), truthful release/capture wording (#373/#399), real JPEG/import assertions (#393/#400), accurate SSR test scope (#384), ignored plan evidence output (#397).

**Owner decisions:** #382 maximum/TTL; #383 wire compatibility; #401 conservative tracking pause. #372 also needs the monitoring owner's real provider configuration and label-policy decision before implementation/impact conclusions. The standing #371 accepted risk remains unchanged and outside this task.

**Additional environment/evidence:** #372 actual ingestion/parser/series configuration; #387 physical iOS/Android zoom and accessibility settings; #390 full-shell controlled user navigation with a supported same-instance target switch; #392 already-migrated disposable PostgreSQL with intended runtime privileges. #394/#395/#396/#397 also need that environment to validate future test-only changes. Native hardware QA for #373/#377/#378/#399/#401 is still a follow-up acceptance layer, not something these JS tests prove.

**Closure recommendations:** none as false positive or already fixed. Inconclusive #372/#387/#390/#392 remain open for the exact missing evidence; avoid implementing a speculative fix solely to force closure. Confirmed test-quality findings should not be relabeled production vulnerabilities.

## E. Final verification integrity

- All **24/24** requested issues were independently examined; full bodies/acceptance criteria/comments, cited source, affected boundaries, protections, focused tests and per-file history were checked. No unrelated audit findings were added.
- No result was fabricated. The original issue's claim was not treated as proof. All statuses, counts and matrix entries are generated from the 24 records in `results.json` and checked for uniqueness/completeness.
- Static evidence and mocked tests were not presented as real PostgreSQL, Native-device, provider, production, remote-CI or full-app runtime proof. Browser evidence is explicitly scoped to mounted synthetic actual components/hooks.
- No GitHub issue/comment/label/state was modified or closed. No messages were sent to repository participants.
- No tracked product source or documentation was edited; no migrations were created, rewritten or executed; no production/customer data was accessed. New reports, source snapshots, fixtures, harnesses and logs are local evidence under the original repository's ignored `tmp/audit-24-verification/` directory. The detached baseline contains the committed source for immutable review.
- Original branch/HEAD and pre-existing worktree preserved. Fetch changed only local remote-tracking metadata and a new detached evidence worktree was added. Temporary dependency symlinks are removed for final clean-status verification. See `final-integrity.json` for exact status/diff/HEAD/ignore checks and `initial-status.txt` / `initial-worktrees.txt` for the starting point.
- No commits, pushes, PRs, merges, remote CI, deployment, migration setup or product fixes were performed.
- Checkpoints were saved throughout. The final report, issue snapshots, results, source snapshots, per-issue histories, browser outputs and exact command logs remain reviewable locally. **Stop here for Owner review.**
