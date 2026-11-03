# VAYLET — Test Reliability Audit & Root-Cause Strategy

Date: 2026-11-03
State: Evidence-backed working audit — **not** blanket approval to delete tests or bypass required gates.
Repository baseline: `f9ecebd9af85b44580771b4027515d06c0a31de4` (merged PR #413). GitHub CI #586 for PR SHA `c0da5d8b`: **all 11 jobs PASS**.
Scope: every tracked test/spec source file and authored declaration, prioritized deep semantic review and CI cost investigation.

## 1. What the evidence actually says

- At the pinned merged source there were **2,034** tracked `*.test.*` / `*.spec.*` files, compared with **2,031** in the older CIQ inventory; the difference requires classification, not automatic deletion. This audit branch adds one test file for the registry and one for the optional local precheck tool, giving **2,036** audited files.
- The **reviewer-corrected** TypeScript AST audit enumerates **9,347 authored test declarations**, including 22 authored test declarations belonging to the two audit tools; the original merge has approximately **9,325** declarations under this scanner, not the prior inflated 9,410. The correction excludes **85** non-runner `.test()` calls, recognizes `as const` parameter matrices and nested suite expansion, restricts Node subtest detection to real `node:test` imports, and flags **283** dynamically titled or expanded declarations in the current audit source. Indirect runner aliases, including nested declarations, are reported as unresolved if encountered rather than silently counted. These are still *source registrations*, not the number of executed runtime cases. Full runner-by-runner reconciliation remains required.
- Files are tagged with the existing CIQ lane annotation and signals only. Every case and file starts `NOT_SEMANTICALLY_REVIEWED`. A static AST is no substitute for proving intent, contractual relevance, actual execution, or unique defect detection.
- Strong workflow-level gap: **270** `apps/dashboard/e2e/*.spec.ts` mock-browser specs are not part of the default PR `employee-e2e` job. Its dashboard command invokes `test:e2e:runtime`, which selects `apps/dashboard/e2e-runtime` (13 files), not the old `e2e` folder. Their value/coverage must be reconciled rather than blindly scheduled or discarded.
- Other ownership uncertainty: **35** `scripts/*.test.mjs` in the old `SCRIPT_EXECUTION_UNVERIFIED` category and **14** outside known package roots. Source inventory is not proof that a specific runner executes them. A further 37 private Issue319/333 API cases require owner-attested, isolated infrastructure; do not silently move them to ordinary CI.
- Source-level *candidate signals*, not verdicts: **68** files contain arbitrary-wait-like calls, **147** contain exact text assertions, **154** contain structural CSS selectors, **163** use positional locators, **231** contain internal invocation-count assertions, **81** use server-static rendering, and **173** contain module mocks. Some are required behavior budgets, frozen designs, or genuine negative security evidence.

### What made CI failures expensive rather than meaningful

The prior PR execution uncovered an inaccurate EndShift mock with no command ownership, an R11 selector matching two selects, a text assertion that assumed `Overridden` rather than the current UI, a LiveMap fixture without tracker owner, a 24-MiB paused-client `finish` assumption, incomplete Native handoff proof, and two stale API authorization/history assertions. These were repaired and CI #586 passed on disposable PostgreSQL and real browser E2E. A test can be valid in purpose but badly specified in implementation.

## 2. Critical path: dependency caching is not the root cause

The GitHub CI #586 `api-postgres-standard` lane ran 185 passing files / 1,186 passing cases (11 skipped) in approximately **1,141 seconds**; `api-postgres-race` ran 257 passing files / 1,519 cases (63 skipped) in approximately **1,399 seconds**. Across an earlier completed run, median per-file durations were about **6.57 s** (standard) and **8.92 s** (race); these are *one-run observations*, not p50 across many runs.

The resource profile deliberately caps standard at **1 file worker** and race at **2 file workers**, with database connection envelopes protecting cluster capacity, and per-file setup/cleanup. Do not change worker counts without an isolated load budget and tenant-concurrency validation.

The pnpm cache successfully restored ~408 MB in #586, but three sampled runs do not establish a net CI speedup. Some faster installs were offset by cache setup/restore. A proper A/B experiment compares same lockfile, runner class, cache state, fixture base, workflow steps and protected test set.

## 3. Test architecture policy: assertions as owned contracts

For each required test, capture: stable identifier, feature owner, Accepted Decision or product requirement, unique invariant, actor and tenant/Location, positive/negative/retry/race, layer (pure/domain/component/HTTP+Postgres/browser), fixtures, failure it detects, duplicate equivalent proof, expected execution lane, flake/cost evidence and a reviewer decision `KEEP|REWRITE|MERGE|REMOVE|UNRESOLVED`.

**KEEP:** tenant and Location isolation, role/MFA boundaries, key/vehicle custody, payment ledger, transactional audit, cryptographic guest access, concurrency/idempotency, migration constraints and safety-critical fail-closed paths. A test that looks similar but changes actor/scope/transaction is *not* duplicate.

**REWRITE:** tests comparing unstable CSS structure, translated copy or incidental call count to a snapshot when those are not published contracts; mocks that inject impossible states; blind sleeps; shared mutable global fixtures; UI tests checking internal component instance details. Replace with observable state transitions, accessible roles or dedicated stable test IDs, contract-aware facts and deterministic synchronization.

**MERGE:** truly repeated setup and assertions with same business invariant into parameterized cases and reusable fixture factories *without eliminating distinct actors, tenants, workflows or failure modes*. Shared fixtures should not hide authorization.

**REMOVE:** only after demonstrating that the exact behavioral fault it detects is independently caught by another reliable test at a lower-cost layer, ideally by a controlled mutation/fault-injection test; no unique negative security/privacy branch may be lost. Capture the exact before/after tests and full approved CI proof.

## 4. Change-aware workflow without a false-green merge

1. **Inner development loop:** typecheck/lint and `vitest related --run` for directly changed source files, plus nearest existing tests and feature-level negative checks. Vitest dependency graphs do **not** see every dynamic import, so this is an advisory inner loop, not a complete safety guarantee. For cross-package changes, use pnpm's dependent-package selectors; fail closed for migration, contracts, shared auth, custody, payment, security or workflow changes.
2. **PR gate stays authoritative:** full required PostgreSQL/API race, tenant/Location permissions, migrations, browser E2E and quality aggregation until a formally reviewed replacement proves equivalent coverage. No automatic skip of protected lanes based solely on paths.
3. **Browser scope:** retain a small real-browser collection for login/session restoration, authorized action, denied action, guest token, end shift/retrieval and persisted mutation. Use Playwright's role/label/test-ID locators, isolated data and auto-retrying web-first assertions; avoid arbitrary waits and exact English copy for behavior not semantically about copy.
4. **DB tests:** separately benchmark fixture creation and teardown per file, then experiment with a per-worker immutable template or safe transaction rollback only for suites with proven no-commit/no-concurrent-observer constraints. Protected cross-process, race, permission/privilege, migration, and S3 recovery suites must keep true committed PostgreSQL semantics.
5. **Flaky triage:** log the stable test ID, SHA, runner OS, fixture seed, unique session/test run, DB role, elapsed setup/test/cleanup, first failing assertion and classified failure type. Do not turn a retry-pass into silent green; label flaky and assign an owner.
6. **Cleanup candidate gates:** require fault detection evidence, a second reviewer, no lost protected cases, actual runtime difference, and owner approval for deletions or required CI changes.

## 5. Prioritized experiments and objective exit criteria

| Priority | Candidate | Proof before rollout | Stop condition |
| --- | --- | --- | --- |
| P0 | Reconcile 270 mock E2E against live runtime cases | Contract-by-contract mapping; retain test-only real-browser evidence for unique paths | Uncovered role/tenant/custody path |
| P0 | Adopt one per-case source ledger and review ownership | Registry regeneration deterministic, false-positive AST cases explicitly flagged | Dropping dynamically generated cases as if covered |
| P1 | Replace brittle sleeps/copy/structural locators in top-risk suites | Exact original failure reproduced; new assertion reacts to real semantic defect | Test passes while true backend/visible state is wrong |
| P1 | PostgreSQL per-file fixture cost decomposition | At least 10 comparable runs per baseline/variant, headroom/cleanup/tenant-boundary evidence | Cross-file leak, connection budget breach, race suppression |
| P1 | Safe local affected-unit precheck | Prove fail-closed on shared/unknown changes and a deliberate mutation | Any protected regression missed by required PR CI |
| P2 | Deprecated React 19 test-renderer replacement | Mounted owner/retry/identity invariants intact, no UI modification, maintenance lower | Missing genuine hook lifecycle or need for more fragile mocks |
| P2 | Cache strategy keep/revert | Matched lockfile/OS install + setup wall time and total billed minutes | Setup overhead exceeds benefits repeatedly |

Targets are *proposals*: aim for markedly fewer false failures per 100 changes, median local feedback under 2 minutes for ordinary component edits, and >=20% improvement in full PR critical path **only if measured** without coverage loss. Maintain zero known bypass of protected business/security invariants. Cost and case-value audit is a continuing review process, not a one-time blanket cleanup.

## 6. Primary technical references consulted (2026-11-03)

- [Playwright Best Practices](https://playwright.dev/docs/best-practices): observable user behavior, resilient locators and web-first assertions.
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles/): tests should resemble how software is used.
- [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html): push assertions to the lowest layer that adds confidence; eliminate provably redundant higher-level checks.
- [Vitest Mocking](https://vitest.dev/guide/mocking): clear/reset mocks to prevent state leaks; [Timers](https://vitest.dev/guide/mocking/timers): controlled clock instead of real wait.
- [Vitest CLI](https://vitest.dev/guide/cli): `related` uses static graph and has dynamic import limitations; [Test Context](https://vitest.dev/guide/test-context): fixture scope tradeoffs.
- [Playwright Parallelism](https://playwright.dev/docs/test-parallel): independent tests and data isolation; sharding only after safe isolation.
- [pnpm Filtering](https://pnpm.io/filtering): package and dependent-project selective checks, not substitutes for protected merge gates.
- [GitHub Actions Dependency Caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching): restore semantics, cache trust boundaries and cost tradeoffs.
