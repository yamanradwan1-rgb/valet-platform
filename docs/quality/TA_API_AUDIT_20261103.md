# VAYLET API test reliability and cost audit — 2026-11-03

**Review status:** source-backed inventory and prioritized static triage, **not** a
claim of exhaustive manual semantic case review or current PostgreSQL CI proof.
**Baseline:** `f9ecebd9af85b44580771b4027515d06c0a31de4`
(`origin/main` merge after PR #413), exclusive branch
`cos/test-audit-api-20261103`. This review changed documentation and an
inventory CSV only; it did not delete, skip, weaken, or alter any test or runtime.

## Finding and recommended order

The strongest **cost** candidate is the repeated **CREATE DATABASE → Prisma
`migrate:deploy` → runtime-role provision → pool startup** sequence per test
file, independently evidenced in multiple API suites and fixtures. This is a
repeated setup mechanism, **not proof that the tests are redundant**. The
reported 6–9 seconds per file is a *prior-CI observation supplied for this
task*, not a duration reproduced in this worktree. Run redacted stage-level
measurements on representative CI files before changing isolation strategy.
Preserve fresh databases, role privilege boundaries, transaction/audit checks,
negative cases, and owned cleanup. Reusing one mutable database across
concurrent files without independent proof would be unsafe.

The strongest **assertion-coupling** candidates are separate non-DB Issue #300
source-text tests that use regexes to find code or SQL fragments. These checks
are useful static tripwires, but passing them does not prove authorization,
UI cancellation, tenant scope, or actual SQL behavior. Their comments already
identify the browser/HTTP proof gap. Retain the tripwires while adding or
linking behavior tests that exercise the same protected invariants.

## Reproducible scope and per-case ledger

The companion
[`TA_API_CASE_LEDGER_20261103.csv`](./TA_API_CASE_LEDGER_20261103.csv)
contains **one row per statically observed test registration site**: repository
path, source line, ownership project, runner, ancestor `describe` path, case
title/expression, direct/`each`/loop mode, any literal `each` row-count hint,
dynamic-parent status, and heuristic invariant, fixture-cost and
assertion-coupling signals. The signals are **review queues**, not asserted
coverage, verified redundancy, runtime duration, or evidence that the case
passed. `not-established` means the automated screen did not establish that
property, not that the risk is absent.

Inventory algorithm:

1. Use the repository's own
   [`classifyPackageTests`](../../scripts/test-harness/test-classification.mjs#L47-L128)
   to discover `apps/api/test/**/*.(test|spec).*`, reject
   `.spec.*` naming, traverse eligible local helper/fixture imports, assign
   exactly one ownership project, and include the three explicitly registered
   [API source-adjacent tests](../../scripts/test-harness/api-source-adjacent-ownership.mjs#L3-L28).
   Protected #215/#309 names are an explicit
   [manifest](../../scripts/test-harness/issue215-test-manifest.mjs#L5-L22).
2. Parse every discovered TypeScript/JavaScript file using TypeScript's
   syntax tree; record the start line of direct `it`/`test`/`specify`
   registrations and Node `node:test` registrations, including nested
   `describe`, `it.each`, and detectable loops. Mark expression-based titles
   and dynamic row expansion rather than fabricating their runtime names.
3. Match per-file source signals conservatively for manual triage: direct
   database migration, named fixture reuse, HTTP buffer size, subprocess Git
   fixtures, source-regex assertions, VM-loaded mocked modules, snapshots, or
   timer/copy assertions. Heuristic invariant families derive from file and
   case text and may overlap. They are **not** a semantic interpretation of
   every assertion.
4. Check that every owned file has at least one registration site, the
   site IDs (path + line) are unique, and no AST parser diagnostics occur.
   Compare source counts with CI as separate evidence levels.

| Executable ownership / CI treatment | Source files | Static case sites |
| --- | ---: | ---: |
| `api-non-postgres` (Vitest plus eight separate Node `.test.mjs`) | 211 | 1,040 |
| `api-postgres-standard` (CI `api-standard`) | 187 | 921 |
| `api-postgres-race` (CI `api-race`) | 266 | 1,196 |
| `api-postgres-compound` (CI `api-compound`) | 28 | 85 |
| `api-postgres-issue215` (protected CI `issue215`) | 12 | 48 |
| `api-postgres-issue309-browser` (protected CI `issue215`) | 1 | 3 |
| `api-postgres-issue319-private` (owner-attested local only) | 20 | 58 |
| `api-postgres-issue333-private` (owner-attested local only) | 15 | 35 |
| `api-postgres-issue333-w4-private` (owner-attested local only) | 2 | 6 |
| **Total** | **742** | **3,392** |

Source discovery includes **739 files inside `apps/api/test`** (731
`.test.ts` and eight `.test.mjs`) plus **three
`apps/api/src/**/*.test.ts`**. All 742 have at least one recognized
registration; there are **3,392 unique path:line sites, zero unresolved
files and zero parser diagnostics**. The ledger flags **418 potentially
expanded/loop-parented sites**, including 406 direct `each` registrations,
and **22 expression-based titles**. Their dynamically expanded case count
cannot be read faithfully from the source site count. Zero recognized direct
`skip`/`todo` registrations is not a guarantee against runtime
conditional exclusions. An `it.each` site has one CSV row even when Vitest
executes several cases.

For context, the task supplied prior CI #586 figures of **1,186 tests /
~19 minutes / 185 files** in standard and **1,519 tests / ~23 minutes /
257 files** in race. The source snapshot here has **187 standard** and
**266 race** files. Neither the test-count expansion nor the file-count
difference should be silently reconciled by treating old CI observations
and a new static inventory as the same execution. Fresh logs on this exact
SHA are required for a defensible per-file runtime ranking.

## CI ownership and safety constraints

The API [Vitest config](../../apps/api/vitest.config.mjs#L20-L99) excludes
`.test.mjs` from Vitest and runs PostgreSQL projects in bounded fork pools.
The [Node runner](../../scripts/test-harness/run-api-node-tests.mjs#L6-L29)
executes the native files separately; the API
[`test:non-postgres` script](../../apps/api/package.json#L15-L18)
includes both. The [CI matrix](../../.github/workflows/ci.yml#L92-L115)
selects standard, compound, race, database and issue215 lanes, while the
private projects require explicit local environment attestations and are
excluded when `CI=true`
([config lines 66–97](../../apps/api/vitest.config.mjs#L66-L97)).

The classifier's
[`dbSignalPattern` and `raceSignalPattern`](../../scripts/test-harness/test-classification.mjs#L16-L36)
inspect reachable fixture text, and a `Promise.all(` is enough to indicate
a potential race lane. This is a safe **ownership heuristic**, not proof
that every selected test exercises concurrency. Do not move files to
non-Postgres or reduce race protection without negative lane-ownership tests.
The [resource profiles](../../scripts/test-harness/resource-budget.mjs#L1-L20)
currently admit one file worker for standard/compound and two for race;
connection/resource admission and
[global setup cleanup ownership](../../scripts/test-harness/vitest-postgres-global.mjs#L29-L131)
remain necessary. Protected #215/#309 preflight must precede cleanup.

## Prioritized source-backed review candidates

“Candidate” means a concrete source-observed cost or coupling mechanism
worth a **measured follow-up**. An invariant shown below is the substantive
reason to retain the test; none of these entries authorizes deleting cases.
`P1` indicates high-value follow-up, `P2` indicates contingent/secondary.
References are exact in the audited SHA.

| ID | Priority / finding and source | Invariant to preserve; bounded follow-up |
| --- | --- | --- |
| A01 | **P1 cost: repeated Shift fixture bootstrap.** [`shift-test-context.ts:98–129`](../../apps/api/test/shift-test-context.ts#L98-L129) creates DB, runs migrations and role provisioning, drops DB/role. **26 test files refer to the class; 25 are integration consumers**, while [`shift-test-context-names.test.ts:8–21`](../../apps/api/test/shift-test-context-names.test.ts#L8-L21) checks constructor names only. | Preserve [Shift start persisted exact audit and concurrent same-location retry](../../apps/api/test/shift-start.integration.test.ts#L14-L90), tenant/role access and failure isolation. Instrument each stage across files; only consider an immutable, attested migration template with fresh per-file DB/role and independently verified cleanup. |
| A02 | **P1 cost: Check-In HTTP setup** [`check-in-api.integration.test.ts:412–469`](../../apps/api/test/check-in-api.integration.test.ts#L412-L469) repeats DB, migrate, provision, Nest listen and closes the socket. | Preserve [live HTTP + optional-photo/runtime-role/elapsed-KPI](../../apps/api/test/check-in-api.integration.test.ts#L471-L545) assertions, request authority and privacy. Benchmark DB stage vs Nest startup separately. |
| A03 | **P1 cost: condition command migration** [`check-in-condition-command.integration.test.ts:391–437`](../../apps/api/test/check-in-condition-command.integration.test.ts#L391-L437). Instrumentation already distinguishes create/migrate/provision/probe. | Preserve [append-only condition evidence, safe audit, Shift independence](../../apps/api/test/check-in-condition-command.integration.test.ts#L457-L460), private-byte evidence and policy fail-closed guards. Compare existing redacted stage logs before proposing a shared setup path. |
| A04 | **P1 cost: complete Check-In migration** [`complete-check-in-command.integration.test.ts:469–515`](../../apps/api/test/complete-check-in-command.integration.test.ts#L469-L515) independently repeats the same four instrumented stages. | Preserve [`CHECKING_IN -> AWAITING_PARKING`, version/timestamp/one audit and no Shift](../../apps/api/test/complete-check-in-command.integration.test.ts#L536-L540). Shared migration material must not share mutable operational rows. |
| A05 | **P1 cost: Guest Access setup** [`guest-access-command.integration.test.ts:310–351`](../../apps/api/test/guest-access-command.integration.test.ts#L310-L351) runs a private DB/role bootstrap. | Preserve [one server-owned token and safe audit](../../apps/api/test/guest-access-command.integration.test.ts#L353-L354), negative authorization and no raw secret persistence. Measure DB setup before considering fixture consolidation. |
| A06 | **P1 cost: protected custody setup** [`protected-custody-command.integration.test.ts:280–325`](../../apps/api/test/protected-custody-command.integration.test.ts#L280-L325) repeats DB and runtime role. | Preserve [active role, exact Location access, inactive-user/member rejection](../../apps/api/test/protected-custody-command.integration.test.ts#L328-L358) and custody audit atomicity. |
| A07 | **P1 cost: vehicle identity setup** [`vehicle-identity-command.integration.test.ts:366–407`](../../apps/api/test/vehicle-identity-command.integration.test.ts#L366-L407) repeats DB, migrate, provision. | Preserve [Unicode canonicalization and human-confirmed raw/canonical plate persistence](../../apps/api/test/vehicle-identity-command.integration.test.ts#L409-L421), tenant isolation and negative collisions. |
| A08 | **P1 cost: staff-auth HTTP fixture** [`staff-auth.integration.test.ts:326–376`](../../apps/api/test/staff-auth.integration.test.ts#L326-L376) migrates DB, provisions role, starts Nest, and clears limiter events before each case. | Preserve [password hash, generic failure, revoked/expired bearer denial](../../apps/api/test/staff-auth.integration.test.ts#L378-L499). Profile startup versus per-case database clearing without weakening anti-abuse state isolation. |
| A09 | **P1 cost: returning Check-In fixture** [`returning-check-in-test-context.ts:104–148`](../../apps/api/test/returning-check-in-test-context.ts#L104-L148) migrates/provisions its own DB for two suites. | Preserve [exact Organization-scoped vehicle recognition and read-only/non-disclosure negative case](../../apps/api/test/returning-check-in.integration.test.ts#L69-L118); keep historical completed-visit witnesses. |
| A10 | **P1 cost: native Staff Auth fixture** [`staff-auth-native-fixture.ts:105–135`](../../apps/api/test/staff-auth-native-fixture.ts#L105-L135) repeats DB + Nest setup for [native transport](../../apps/api/test/staff-auth-native.integration.test.ts#L21-L22) and session continuity. | Preserve arbitrary-Origin denial, refresh/replay revocation and accurate native response shape. Benchmark combined Nest/bootstrap time before merging fixtures. |
| A11 | **P1 cost: provisioning fixture** [`provision-staff.integration-fixture.ts:129–143`](../../apps/api/test/provision-staff.integration-fixture.ts#L129-L143) creates/migrates DB for two suites; [per-case teardown:145–175](../../apps/api/test/provision-staff.integration-fixture.ts#L145-L175) deletes scoped records. | Preserve [atomic creation](../../apps/api/test/provision-staff.integration.test.ts#L13-L14), [cross-org denial and audit rollback](../../apps/api/test/provision-staff-rejections.integration.test.ts#L41-L69). A faster setup must still prove clean user/tenant state between cases. |
| A12 | **P1 cost: intake command harness** [`intake-command-database-test-harness.ts:96–137`](../../apps/api/test/intake-command-database-test-harness.ts#L96-L137), used transitively via [`intake-session-command-test-harness.ts:31–32`](../../apps/api/test/intake-session-command-test-harness.ts#L31-L32), repeats migration/provision. | Preserve [version-one intake, disabled guest access and one audit](../../apps/api/test/intake-session-command.integration.test.ts#L19-L20), negative non-operational roles and idempotency. Consolidate only after exact privilege and isolation equivalence. |
| A13 | **P2 memory/socket cost:** [`issue333-u002-http-response.test.mjs:14–15`](../../apps/api/test/issue333-u002-http-response.test.mjs#L14-L15) preallocates **24 MiB** and writes it to a paused TCP client in [the ordering proof:17–70](../../apps/api/test/issue333-u002-http-response.test.mjs#L17-L70) and [backpressure case:140–169](../../apps/api/test/issue333-u002-http-response.test.mjs#L140-L169). | Preserve actual `write(false)`, `drain`, `finish`, close, privacy-marker ordering and partial/abort negative cases. Test a smaller deterministic backpressure fixture on repeated Windows/Linux runs; small payload alone may eliminate the required backpressure and cause false green. |
| A14 | **P2 source assertion coupling:** [`issue300-qa/live-read-static.test.mjs:22–43`](../../apps/api/test/issue300-qa/live-read-static.test.mjs#L22-L43) regex-matches hook use and abort-controller source strings; [lines 78–85](../../apps/api/test/issue300-qa/live-read-static.test.mjs#L78-L85) regex-match generation fencing. | Preserve actual stale-detail/cross-session cancellation and safe live-data presentation. Keep source tripwire, add or link a rendered controller behavior test; source token presence alone can pass after control flow becomes incorrect. The file [explicitly labels browser/HTTP as GAP](../../apps/api/test/issue300-qa/live-read-static.test.mjs#L6-L6). |
| A15 | **P2 SQL-text coupling:** [`issue300-qa/audit-reference-consistency.test.mjs:20–45`](../../apps/api/test/issue300-qa/audit-reference-consistency.test.mjs#L20-L45) asserts SQL regexes for Task/Incident containment; [lines 54–75](../../apps/api/test/issue300-qa/audit-reference-consistency.test.mjs#L54-L75) cover exact-location and pagination fragments. | Preserve no cross-session/tenant witness, no wrong referenced entity, fail-closed timeline. Keep fast static tests, demand real PostgreSQL queries with foreign/missing references before treating them as end-to-end security proof. |
| A16 | **P2 mock-boundary gap:** [`issue300-timeline/timeline-boundaries.test.mjs:39–67`](../../apps/api/test/issue300-timeline/timeline-boundaries.test.mjs#L39-L67) substitutes no-op `parse` contracts and transpiles runtime TypeScript into a mocked VM; its [unproven-cursor denial case:208](../../apps/api/test/issue300-timeline/timeline-boundaries.test.mjs#L208-L208) tests the service under those mocks. | Preserve temporal order, authorization before reads, and malformed cursor denial; corroborate with real contract validation and PostgreSQL/HTTP integration. A VM pass cannot validate the production Zod implementation. |
| A17 | **P2 subprocess setup:** [`architecture-repository-fixture.ts:63–89`](../../apps/api/test/architecture-repository-fixture.ts#L63-L89) launches Git and writes files for fresh test repos; [`architecture-check.test.ts:12–38`](../../apps/api/test/architecture-check.test.ts#L12-L38) has a similar fixture. | Keep the real Git tracked/untracked and architecture/300-line enforcement cases. Measure Git init and file enumeration; reuse common fixture construction only if the independent Git semantics stay exercised. |
| A18 | **P2 classifier coupling:** [`test-classification.mjs:16–20,146–155`](../../scripts/test-harness/test-classification.mjs#L16-L20) chooses race vs standard by textual signal (including `Promise.all`) across imported helpers. | Preserve DB ownership, race budget and exactly-one classification. Add case-driven classifier negatives for comment/helper-only signals before any future lane split; no wrongly assigned specific case has been demonstrated by this audit. |
| A19 | **P2 intentionally heavy workload:** [`guest-t3-cost.integration.test.ts:28–45,73–79`](../../apps/api/test/guest-t3-cost.integration.test.ts#L28-L79) uses Shift fixture, then inserts **100,000 anti-abuse events** and `ANALYZE` to measure costs. | Preserve the 100k-row benchmark where cardinality is the tested invariant. Measure this separately from default per-file migration overhead; never downsize the dataset merely to make CI green. |

### Proposed safe experiments and acceptance criteria

1. **Observe setup before tuning.** Reuse the redacted
   [stage timer](../../apps/api/test/issue215-fixture-timing.ts#L9-L25)
   and [migration SQL breakdown](../../apps/api/test/issue215-fixture-timing.ts#L77-L98)
   where already present; sample representative standard/race/compound files
   and record per-file create/migrate/provision/probe/test/teardown times
   from one exact-SHA CI run. Keep sensitive URLs and credentials out of logs.
2. **Prototype only isolated provisioning reuse.** If measurements support
   it, compare independently created migrated databases from a *read-only
   verified template* against current full migrations. Maintain unique run
   owner, schema/version proof, per-file runtime roles, tenant data isolation,
   race worker connection budgets, and stale-owner recovery. Run full positive
   and deliberate negative cases for role grants, concurrent mutation, audit
   rollback, failed migration, interrupted setup, and abandoned-run cleanup.
   Do not treat a mocked PostgreSQL pool as equivalent.
3. **Pair static tripwires with observable behavior.** The Issue #300
   source checks may stay fast in Node. Add contracts/SQL/HTTP/browser tests
   that prove real authorization, cursor integrity and abort-after-scope-switch
   on an appropriately owned lane. Track whether the behavioral proof exists
   before calling static overlap “redundant.”
4. **Evaluate the HTTP buffer only with semantic guards intact.** Compare
   24 MiB and a smaller controlled-backpressure payload over repeated runs
   on Windows/Linux with assertions for `write(false)`, `drain`, complete
   TCP delivery, early-abort privacy, partial response and keep-alive.
   No fixture timeout increases or test exclusion are proposed.

## Validation performed and verification gaps

- **PASS:** static source/classifier inventory: 742 files, 3,392 unique
  registration sites, zero unresolved/duplicate sites, zero parser diagnostics;
  22 expression-title sites and 418 dynamically expanded/loop-parented
  registrations expressly marked. CSV is source triage, not executed-case
  coverage.
- **PASS:** `node scripts/test-harness/run-api-node-tests.mjs`: **49/49**
  native Node tests on this Windows worktree, including both HTTP socket
  suites and Issue #300 static/VM suites.
- **PASS:** `node --test scripts/test-harness/issue215-api-classification.test.mjs scripts/test-harness/classification-ownership.test.mjs`:
  **6/6**, including protected basename/negative ownership and exactly-one
  project discovery.
- **ENVIRONMENT BLOCKER, no source verdict:** a broader three-file harness
  attempt ran **14/17 passing**, with **3 failures** in
  `classification.test.mjs:92,110,140` because `pg` could not be resolved
  from `packages/database/package.json` in this isolated worktree. Expected
  preflight-denial assertions were not reached. This does **not** show those
  guards pass or fail with dependencies installed.
- **NOT RUN:** PostgreSQL DB-backed Vitest projects, Nest integration suites,
  S3/Chromium protected Issue #215/#309, private attested #319/#333 suites,
  or the complete CI matrix. No current-run file-specific timing, PostgreSQL
  race, tenant-isolation, or migration-safety result is claimed.

**Disposition:** documentation/ledger only is suitable for review against
this baseline. There is no evidence here to justify suppressing tests or
relaxing gates. Any tooling optimization needs a separate, isolated patch and
a complete relevant CI comparison plus explicit negative-case preservation
before it can be considered merge-ready.
