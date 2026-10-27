# Coordinator validation findings

Baseline: `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`. These findings supplement the six subsystem reports. No source/test/configuration repair is authorized or performed as a result.

## VAL-002 — Current audit catalog test has a stale exact count

1. **ID/title:** VAL-002 — Resume Intake leaves the management-audit catalog test deterministically red.
2. **Severity:** P2 validation defect; no production audit-event loss demonstrated.
3. **Confidence:** CONFIRMED by the existing full Contracts suite.
4. **Category:** Test/validation defect.
5. **Feature:** Management audit catalog and release gates.
6. **Paths:** `packages/contracts/src/management-audit.test.ts`; `packages/contracts/src/management-audit-events.ts`; `packages/database/prisma/migrations/20261026010300_issue346_resume_location_intake/migration.sql`.
7. **Lines:** test 14–17 expects102; event catalog 91–92 includes STOPPED and newly RESUMED; migration 38 emits LOCATION_INTAKE_RESUMED. Exact failure retained in `contracts-full-tests.log`.
8. **Expected:** Current known-event inventory assertion matches the approved event catalog, retaining exact membership/uniqueness checks.
9. **Actual:** The catalog has103 entries, while both count assertions still demand102. Existing test fails at line16.
10. **Root cause:** Resume Intake extended the runtime catalog but did not synchronize its exact-count regression test.
11. **Reproduction:** From `packages/contracts`, execute `<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run src --maxWorkers=2`. Actual result:71 files,506 tests passed and1 failed.
12. **Preconditions:** The audited main baseline; no provider, network, database or customer data required.
13. **Business impact:** Clean release validation cannot be truthfully green. Dismissing a known red gate creates false confidence in future audit-contract regressions.
14. **Security/data impact:** None directly demonstrated. The runtime catalog includes the new event; this is not evidence that Resume Intake audit is missing.
15. **Affected roles:** Developers, reviewers, release operators.
16. **Environments:** Local/CI contracts validation.
17. **Existing coverage:** The existing exact-catalog test detects the defect. All other506 Contracts tests passed in this run.
18. **Missing validation:** Future authorized correction must rerun Contracts and associated audit projections. No correction made here.
19. **Fix:** Update the current exact catalog expectations to103, preserve duplicate detection and explicit required events, and keep future catalog changes coupled to their inventory test.
20. **Complexity:** Small, roughly0.5–1 engineering hour plus normal review/checks; planning estimate.
21. **Regression risk:** Low for test-expectation synchronization; do not delete the new event or weaken unknown-event validation to obtain green tests.
22. **Related issue:** Recently closed #346 introduced Resume Intake; no duplicate tracker identified among17 open/30 recently closed issues inspected. It is adjacent to DB-01's stale migration inventory, but a different gate/file/expectation; fix both in one batch without pretending they are two independent customer outages.
23. **Disproof/limits/pilot:** The failure cannot be attributed to external providers. Read the producer/catalog: the new event is present. This blocks a clean quality sign-off, not the ordinary field workflow on its own. Owner product-design approval is unnecessary for a normal expectation repair, but this audit remains read-only.

## TEST-001 — Tracking unit suites are absent from official API test ownership

1. **ID/title:** TEST-001 — Three existing tracking suites never enter the configured API projects.
2. **Severity:** P3 test-coverage gap, not a demonstrated map/GPS runtime defect.
3. **Confidence:** CONFIRMED by configured test discovery and direct execution.
4. **Category:** Test wiring/false-confidence risk.
5. **Feature:** Live-map cursor, historical-route cursor, point-in-polygon geometry.
6. **Paths:** `apps/api/vitest.config.mjs`; `scripts/test-harness/test-classification.mjs`; `scripts/test-harness/run-api-node-tests.mjs`; `apps/api/src/modules/tracking/{live-map-cursor,route-history-cursor,point-in-polygon}.test.ts`; `.github/workflows/ci.yml`.
7. **Lines:** API Vitest8–25 discovers only `./test/` and rewrites include paths under `test/`;47–60 uses those ownership lists for projects; classifier41–42 only discovers the supplied root. CI82–89 invokes ownership checks/non-PostgreSQL root tests. The three omitted files each start at line1.
8. **Expected:** Every first-party executable API test is intentionally assigned to a safe test lane or explicitly excluded/documented.
9. **Actual:** The three source-adjacent suites are outside `apps/api/test` and absent from every generated API project include. The ownership safety assertion only inventories its existing root, so it can pass while these suites remain invisible.
10. **Root cause:** Test ownership coverage is narrower than first-party test placement.
11. **Reproduction:** From `apps/api`: `<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest list --config vitest.config.mjs --project api-non-postgres --filesOnly src/modules/tracking/live-map-cursor.test.ts src/modules/tracking/route-history-cursor.test.ts src/modules/tracking/point-in-polygon.test.ts` returns no files. Source inspection shows other API projects use the same root. An external configuration including these exact unchanged files runs3 suites/10 cases successfully (`tracking-direct-tests.log`).
12. **Preconditions:** Ordinary repository API test scripts; no DB/provider/device.
13. **Business impact:** Cursor and geometry regressions can evade these intended unit checks while ownership/CI is green.
14. **Security/data impact:** No bypass, exposure, incorrect geometry or corruption demonstrated; passing10 cases does not establish broad spatial correctness.
15. **Affected roles:** Developers/reviewers and indirectly map/GPS feature users.
16. **Environments:** Official local/API CI unit test execution.
17. **Existing coverage:** Related API/GPS integration suites exist, so no claim of zero tracking coverage. These10 particular cases are omitted from normal projects. They passed direct execution in this audit.
18. **Missing validation:** A repository-wide test-placement vs ownership assertion should include source-adjacent tests and fail if any test has no lane. Full CI was not rerun.
19. **Fix:** Move suites into the owned API test root with corrected imports, or extend safe classifier ownership to explicitly include source-adjacent tests. Preserve PostgreSQL/non-PostgreSQL isolation; do not add a blanket include that bypasses database safety.
20. **Complexity:** Small, approximately0.5–1 engineering day with ownership regression coverage; planning estimate.
21. **Regression risk:** Low–medium because test-lane safety must be preserved.
22. **Related issue:** No match identified among the inspected open/recently closed issues. #343 concerns historical-route UI, not execution of these suites.
23. **Disproof/limits/pilot:** Searched package scripts, root harness and workflows for another runner; none found for these files. Direct custom execution is a useful workaround until official ownership is repaired. This does not independently block a controlled pilot and requires no UI redesign or new product decision.

## Independent parent validation and calibration

- **OPS-001:** Parent read the actual reassignment status guard, final-release ownership gate, proof-only override, unchanged IN_PROGRESS abort outcome and DEC035/043 conflict. Source-confirmed recovery gap; no successful full operational PostgreSQL reproduction. No instruction to weaken ownership is implied.
- **DB-01:** Parent read the expected102 appendix and actual103 directory list; independent worker executed the failing existing test and complete database pure project. Applying all103 SQL files directly to fresh PostgreSQL17.11 succeeded, so a broken migration-chain claim is disproved for this clean direct-SQL scenario.
- **DASH-01/02:** Parent read complete page/hook/child dataflow. Stable successful count keys have no invalidation and preview errors are discarded. Neither was browser-reproduced; retain HIGH confidence.
- **CUST-001/002:** Parent read complete preferences/providers/button code and retained mounted/SSR outputs. Storage failures leave React snapshots at defaults while DOM changes; loading markup has no text or ARIA name. Physical browser/screen-reader verification remains absent.
- **INT-001:** Parent read actual worker/FCM adapter and DEC075. Treat as P2 avoidable late-lease duplication risk supported by deterministic actual-source model; accepted at-least-once delivery already tolerates some duplicates. It is not an exactly-once violation, data leak or custody defect. Fixing it reduces avoidable stale transport and does not guarantee exactly-once.
- **NATIVE-WEB-01:** Parent read parent-owned workspace and keyed shell/router flow. HIGH source evidence of missing operational stamp; full supported A→B browser scenario still needs validation. No cross-account leak or native runtime bug is asserted.

## Audit execution incident and restoration

Two existing wrappers unexpectedly invoked the environment's pnpm11 automatic dependency setup: the Customer build-contract negative test, and PostgreSQL fixture `ShiftTestContext.runPnpm`. This exceeded the user's no-install constraint. Both runs ended before relevant build/operational assertions could establish success. They temporarily generated `node_modules` directories inside the isolated audit worktree and appended `allowBuilds` prompts to `pnpm-workspace.yaml`. The coordinator restored that file byte-for-byte from the audited HEAD, removed only those audit-created dependency directories, and verified both original and isolated tracked Git state remained clean. Shared package-manager cache was left alone to avoid removing pre-existing user cache. These events are disclosed as audit limitations, not product vulnerabilities or successful builds. No source/test/migration fix, commit, push, PR, deployment or GitHub write occurred.

For further validation, the coordinator used existing dependency binaries with external ancestor resolution and direct read-only checks; no further package-manager wrapper was used. Docker created a fresh tmpfs-backed audit PostgreSQL container; only that known container/database received existing migration SQL. Production/development databases were not contacted. SQL application is distinct from Prisma ledger and runtime-role provisioning proof.
