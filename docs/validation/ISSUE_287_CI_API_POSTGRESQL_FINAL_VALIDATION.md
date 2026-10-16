# VAYLET #287 — CI, API and PostgreSQL regression qualification

**Evidence date:** 2026-10-16 (Asia/Amman)
**Base:** `origin/main` at `9f9bffc86b9c7631e7a58e8878925ddd28b7fd4f`
**Worktree:** `tmp/issue-287-prime`
**Review branch:** `fix/issue-287-ci-regression-qualification`
**Remote CI qualification:** **PENDING** until the exact candidate SHA receives its own complete required GitHub Actions run.

At the source-and-CI checkpoint `0319257ae11124bced2032cf8a5879bedd54ffc8`,
the branch contained **20 commits** after `origin/main` (including the
evidence-report commit), with **74 tracked files changed** (965 additions,
262 deletions), zero files under
`packages/database/prisma/migrations/` changed, and no unrelated
tracked working-tree changes. The validation report adds one documentation
file once its remaining evidence is finalized.

The implementation commits at this checkpoint, earliest to latest:

```text
464136e2 ci: restore browser and contracts prerequisites with protected test gates
1ed72495 fix(api): preserve multipart size errors and classify three-pool guest test
53175fe7 ci: gate protected Issue 215 API PostgreSQL tests with owned MinIO
06489e6d test: align dashboard projections and PG recovery fixtures
2a81ac07 fix(dashboard): resolve React hooks lint for scope switching
43437747 test(valet): supply required timezone in operational fixtures
7c510521 test: preserve operational identity and settle authority fixtures
aba07291 test(database): align current migration manifest and protected PG regression fixtures
7a0d9fff test(database): preserve audit write guards and current upgrade qualifications
fafd0b57 test(api): isolate staff push outage from public connect grants
f7eddaa0 test(harness): serialize root non-PostgreSQL suites
caa1549c test(valet): align Arabic offline flow with post-parking key deposit
8fa5c631 test(valet): align recovery and incident E2E with current custody flow
e4b881ae fix(contracts): resolve Node ESM runtime relative imports
07002f9f test(database): assert historical guest access consumption state
e250dd03 test(harness): bound Turbo package concurrency without skipping suites
a58f9294 test(valet): align parking lifecycle and retry-owned physical fixtures
16c7bdfc test(valet): restore shared E2E shift after denied mutation
6c84b417 docs(validation): record Issue 287 evidence and remaining qualification gates
0319257a ci: split bounded PostgreSQL profiles into required isolated jobs
```

## 1. Source of truth and safety boundary

Reviewed `AGENTS.md`, source-of-truth docs `00`–`10`, `14`–`17`,
DEC-104, Issue #215's master plan/final handoff, and `.github/workflows/ci.yml`.
The exact current main HEAD matched the independently confirmed historical base.
No existing primary-main changes, production databases, migrations, PRs or
production resources are included in this work. The main working tree's three
untracked local launcher/readme files were preserved untouched.

Historical GitHub proof is [run 38948686594](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/38948686594)
at `9f9bffc8`; comparison run
[38784930163](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/38784930163)
at `53e9be1a`. Both are **FAILURE**, and neither attests the #287 feature branch.

## 2. Exact failure inventory and dispositions

| Required job / failing stage | Actual historical first cause | Classification / remediation | Candidate proof |
| --- | --- | --- | --- |
| `unit` / API non-PG | Real HTTP multipart stream limit returned HTTP 400 instead of required 413 and emitted `TypeError` from reentrant Busboy destruction | `PRODUCT_DEFECT`: stop ingress first; defer parser destruction; assert 413/error code/no storage side effect | Focused Nest HTTP 7/7 pass locally; remote pending |
| `unit` / Dashboard presentation | Expected human name `Lina Haddad` for canonical `ASSIGNED` **status** | `TEST_ASSERTION_STALE`: assert localized canonical status; keep separate personal-name projection assertions | Presentation 8/8 local pass; remote pending |
| `unit` / Dashboard browser suites | Two browser-based help suites cannot launch absent Chromium headless executable | `CI_CONFIGURATION_DEFECT`: install Chromium before aggregate unit test lane | Runtime browser suite and remote CI pending |
| `postgres-api` / 3 overview assertions | Test's exact projection shape predates operational resource/assignee fields | `TEST_ASSERTION_STALE`: preserve full exact-key comparisons, add valid scoped assignee/resource assertions | Real isolated PG recheck pending |
| `postgres-api` / Guest T4 suite setup | Three live DB pools exceed standard profile's bounded `poolCount=2` | `TEST_CLASSIFICATION_DEFECT`: exact test-owned route to bounded compound profile (count 3) with impersonator-negative test | Classification tests pass; real PG recheck pending |
| `postgres-api` / Guest T3 | Zero-pool assertion ignored idle client intentionally retained by prior successful health query | `TEST_ASSERTION_STALE`: check zero checked-out leases, zero pending clients and zero active DB work | Real isolated PG recheck pending |
| `postgres-api` / Presence Zone create | Disconnect test intercepted employee `shift_presence_operations` transactions, missing management `shift_presence_management_results` transaction | `TEST_FIXTURE_DEFECT`: target management commit while preserving `UNKNOWN` and zero side-effects assertions | Real isolated PG recheck pending |
| `postgres-api` / Staff Push outage (older run only) | REVOKE CONNECT from runtime role left an effective connection path through the database's default `PUBLIC` grant; outage finalizer could reconnect | `TEST_FIXTURE_DEFECT`: in the uniquely owned disposable database snapshot both original CONNECT grants, revoke `PUBLIC` and role, verify effective denial, terminate connections, then restore exact original grants; preserve stranded lease and recovery assertions | Isolated PG17 focused repro pending; not reproduced in newer historical run |
| `postgres-database` / migration expectations | Hardcoded historical counts 46/49/53/57 vs 93 actual migration directories; missing manifest suffix | `MIGRATION_EXPECTATION_DEFECT`: exact physical ordered directory manifest and source-grounded history assertions | Full isolated PG17 lane pending final evidence |
| `postgres-database` / historical upgrade | DEC-103's intentional nonempty-Audit index gate rejects fixtures without online-index preflight, and historical partial-schema fixture requests current full role grants | `TEST_FIXTURE_DEFECT`: reproduce approved upgrade preconditions and preserve fail-closed grant validation | Full isolated PG17 lane pending final evidence |
| `employee-e2e` / fixture | `@valet/contracts/dist/index.js` missing before fixture imports; migrations and runtime role steps had passed | `CI_CONFIGURATION_DEFECT`: build contracts before running `tsx tools/e2e/provision-employee-e2e.ts` | Fresh PG17, 93 migrations, runtime role, real fixture **PASS**; focused Chromium **4/4 PASS**; full 13 pending |
| `employee-e2e` / API bootstrap (discovered after fixture repair) | Node rejects extensionless emitted ESM-relative specifiers in `@valet/contracts/dist/map-setup.js` and `dist/index.js` | `PRODUCT_DEFECT`: use `.js` in two authored contract source references and add a static Node-resolution regression over authored runtime imports | Actual `require('@valet/contracts')` from API resolves **528 exports**; regression **PASS**; focused browser **4/4 PASS** |
| `employee-e2e` / Chromium lifecycle (discovered after API bootstrap) | Helper jumps from Confirm Plate directly to phone though new vehicle needs Vehicle Details; also requests a second, nonexistent Create Parking Task button and mismatched key slot `E2E-KEY-D`; queue lookup happened before Start Parking created task | `TEST_ASSERTION_STALE`: traverse `Skip vehicle details`, click actual `Start Parking` **before** queue lookup, no duplicate task, use exact fixture key `E2E-KEY-L`; preserve completion/guest custody cases | Fresh real PG17 + focused Chromium **4/4 PASS**, full lifecycle through COMPLETED; full 13 pending |
| `static-build` / lint | Dashboard React Hooks render-ref/state-effect lint and `process` undefined in authored E2E | Source-correct hook state/epoch cleanup and Node process import; no global lint suppression | Dashboard lint locally verified, full integrated gate pending |
| `static-build` / later typecheck | Nine test fixtures omitted required `timezone` after stronger location contract | `TEST_FIXTURE_DEFECT`: populate typed synthetic Location test data, preserving app behavior | Local typecheck and focused tests pending integration |
| `platform-ubuntu`, `platform-windows` | Both jobs completed successfully historically | No attributable platform correction | Historical only; candidate remote pending |
| `quality` | Correctly failed because required jobs failed/cancelled | Preserve aggregate gate and all required matrix variants | Candidate remote pending |

## 3. Test ownership and mandatory CI coverage

The baseline classifier discovers 559 API test files and 97 database test files;
each belongs to exactly one manifest ownership project. The source records seven
`api-postgres-issue215` protected test files, but the baseline API runner never
selected their project. This was a **real CI coverage omission**, even when
other PostgreSQL tests passed. The corrected workflow adds a dedicated
Issue #215 protected PostgreSQL lane with a disposable labeled PG17 service,
private versioned MinIO, an exact protected-test runner, and unconditional
attested teardown. The lane preserves the existing target and storage identity
guards; there are no mocks, unconditional skips, disabled tests, or
`continue-on-error` exceptions.

The API PostgreSQL job was also originally bounded at 20 minutes for three
sequential test projects (165 standard, 27 compound, 224 race files), with
the standard project alone consuming over 14 minutes on task-owned Windows
PG17. The revised CI matrix separates five required jobs under the same
stable `postgres` job ID: `api-standard` (45 minutes),
`api-compound` (20), `api-race` (30), `database` (30) and protected
`issue215` (20). Each independently receives an isolated labeled PostgreSQL
17 service, uses the original guard/lease-aware runner or full database
command, and stays required by `quality.needs.postgres`. Concurrency inside
each project is unchanged, as are the exact 559/97 test ownership partitions.
Time budgets are **bounded estimates**, not measured remote CI PASS claims.

The database's tracked manifest explicitly enumerates all 93 real migration
directories in exact order. Historical prefix assertions continue to pin their
respective old schema, while current deployment tests compare against the
complete ordered manifest. A disposable historical upgrade containing audit
rows runs the two separately approved DEC-103 online-index statements before
the relevant later migration. The historical Shift Force End fixture uses its
version-specific privilege grant and retains grant-verification, rather than
bypassing missing contemporary tables in the production provisioning script.
All seven required AuditEvent columns retain both `attnotnull` catalog proofs
and real rejected write attempts (six SQLSTATE `23502`, one `42501`).

### PostgreSQL resource receipt

Worker 2 used Docker `postgres:17-alpine` bound to test-only loopback port
`64394`, attested container ID beginning `2c5b2d1602053a68` and task-owned
labels. Its completed direct project ran 41/41 files and 606/606 tests.
For the provision project, the first pass had 34 passing suite files with
169 passing tests and 11 explicitly reported skips; each of the seven
originally failing suite files subsequently passed independently, for
7/7 files and 24/24 tests. These were separate executions, rather than
a single completed 41-file green run.

After verifying ownership labels, Worker 2 stopped and removed exactly its
own container. Its Docker owner filter returned no containers, no PG17
test processes remained, and the test harness reported
`db=0 roles=0 children=0` at cleanup. An unrelated existing Docker database
and MinIO were untouched. Independent API-PostgreSQL and Employee E2E
disposable test receipts remain pending for full-run completion.

Worker 5 independently reproduced and repaired the downstream Employee E2E
chain using multiple separately owned disposable PG17 containers. The final
**focused four-test PASS** ran against container ID beginning
`124847ee0127f780`, loopback port `57470`, task label
`issue-287-worker5-a68a433bd9`, `tmpfs` PGDATA, no bind/named volumes,
and distinct test-only credentials. Fresh migrations **93/93**, runtime-role
provisioning, Contracts build, actual `provision-employee-e2e.ts`, API/Valet
HTTP 200, and read-only synthetic fixture counts of **1 organization, 1
Location, 1 membership, 1 ACTIVE shift, 8 parking spots** all passed.

Chromium command:

```bash
pnpm --filter @valet/valet exec playwright test e2e/employee-shell.spec.ts e2e/employee-lifecycle.spec.ts --project=chromium --workers=1 --reporter=line
```

The final focused run passed **4/4 tests** (11.2 seconds), including the actual
Check-In → Start Parking → Parked → Retrieval → Handoff COMPLETED lifecycle,
the shell, manifest, and offline honesty. This is explicitly **not** a result
for the entire 13-test Employee E2E suite. Earlier attempts exposed and
resolved, in order, missing Contracts build, extensionless emitted ESM
imports, stale Vehicle Details navigation, wrong Key Slot fixture, duplicate
Create Parking Task, and premature Task Queue lookup before Start Parking.
Worker 5 verified deletion of every exact task-owned PG container plus
termination of its own API/Valet process trees. Task-label Docker filters
and TCP 3000/3001 listener checks were empty; unrelated containers were
untouched. No real staff/customer data or shared DB was used.

The baseline also omitted standalone Node test-harness self-tests. The unit job
now runs all `scripts/test-harness/*.test.mjs`, including newly introduced
classification-negative tests, after installing pinned workspace dependencies.
On the integrated worktree, 39/39 standalone tests passed with zero skips;
Issue215 API classification also passed 4/4 independently.

## 4. Local validation evidence

| Environment | Verification | Result |
| --- | --- | --- |
| Windows host, Node 24.19.0, pnpm 10.34.5 | `pnpm install --offline --frozen-lockfile` | PASS; cached 1,022 packages |
| Windows host, Prime | Dashboard `operations-presentation.test.ts` | **8/8 PASS** |
| Windows host, Prime | Real Nest HTTP `condition-photo-http.test.ts` | **7/7 PASS**, no unhandled parser exception |
| Windows host, Prime, bounded single-worker | Full API `api-non-postgres` suite | **134 files PASS, 896 tests PASS, 2 opt-in files / 6 S3 tests SKIP** |
| Windows host, Prime, first serialized root `pnpm test:non-postgres` | Pure Turbo lane had **2 Dashboard timeouts** under concurrent package execution; API **896/896 PASS**, Database **64/64 PASS**, overall **FAIL** (correctly propagated) |
| Windows host, Prime, isolated failure reproduction | Dashboard `google-maps-sdk-ownership.test.ts` + `context-help.test.tsx` | **2 files, 11/11 PASS** alone in 7.92s; evidence of cross-package CPU/browser contention, not an authorized timeout increase |
| Windows host, Prime, second root `pnpm test:non-postgres` with Turbo `--concurrency=1` | Dashboard **838/838**, Employee Client **837/837**, Contracts **452/452**, Customer **344/344**, API **896/896** (6 intentional opt-in skips), Database **64/64** all PASS; Native 1631 pass/7 fail plus import failure | **Aggregate FAIL** for unchanged Native baseline failures, correctly propagated; no native exclusion |
| Windows host, Prime, bounded single-worker | Six heavyweight architecture/capacity/JPEG test files | **101/101 PASS**, no skips |
| Windows host, Prime | Dashboard live presentation + Valet retrieval key tests | **16/16 PASS**; wrong-case key explicitly rejected |
| Windows host, Prime + Chromium | `task02-location-switch-authority` inactive-location case | **1/1 PASS** after awaiting route authority readiness; zero extra context request preserved |
| Windows host, Prime integrated worktree | `pnpm lint`, `pnpm typecheck`, `pnpm test:build-contract`, `pnpm build` | **11/11**, **11/11**, **8/8**, **10/10** package gates respectively, all PASS |
| Windows host, W2 disposable PG17 | Full `database-postgres-direct` lane | **606/606 PASS**; protected lanes and one-shot full provision rerun await evidence |
| Windows host, W2 disposable PG17 | Seven previously failing `database-postgres-provision` files | **7 files, 24/24 PASS** on corrected fixtures; other 34 files had previously passed 169 tests; full single-run rerun not yet proved |
| Windows host, W5 isolated PG17, candidate `f7eddaa0` | Fresh PG migrations / runtime provisioning / Employee E2E fixture | **93/93 migrations PASS; runtime role PASS; contracts build PASS; real employee fixture PASS**; read-only counts 1 organization, 1 location, 1 membership, 1 active shift, 8 parking spots |
| Windows host, W5 owned PG17 + Chromium, candidate HEAD `f7eddaa0` + explicit uncommitted source fixes | Actual focused Employee E2E shell and full lifecycle | **4/4 PASS**, real lifecycle through COMPLETED, API + Valet HTTP 200; all task-owned resources cleaned |
| Windows host, Prime | `node --test scripts/test-harness/*.test.mjs` after Contracts regression | **39/39 PASS**, zero skips |
| Windows host, Prime | Built `@valet/contracts` loaded from API using Node `require()` | **PASS**, 528 runtime exports; fails with `ERR_MODULE_NOT_FOUND` before two `.js` fixes |
| Windows host, Prime | `pnpm architecture:check` | **PASS**, only documented grandfathered file-length warnings |
| Windows host, Prime | `node --check scripts/test-harness/run-issue215-ci-api.mjs` | **PASS** |
| GitHub Actions, `9f9bffc8` | Old complete workflow | **FAILED**; no new remote evidence yet |

The host's Node 24 validation is not a substitute for GitHub's required Node
22 + pnpm 10.34.5 runner. Isolated PG17, E2E and aggregate validation must
be reported separately with their exact test and skip counts. A passing
ordinary test lane alone does not qualify protected condition-photo byte
evidence or an approved production storage provider.

The first heavily concurrent Windows root `pnpm test:non-postgres` run failed
with 5-second timeouts in API architecture/capacity/JPEG tests and unrelated
presentation fixture assertions. The same six heavy API files **101/101** and
then the full API non-PostgreSQL project **896/896** passed with one worker,
without loosening timeouts or reducing their inclusion. This is evidence for
resource oversubscription in that Windows run, not a green assertion for the
original root aggregate command or the Linux CI job. Root harness scheduling
was corrected to execute the pure, API and database lanes sequentially without
excluding any test or hiding a non-zero result. Its full root aggregate rerun
on the integrated candidate remains required. The first rerun correctly
propagated two Dashboard failures: a 40-second Chromium setup hook timeout
in `context-help.test.tsx` and a 5-second file-reading timeout in
`google-maps-sdk-ownership.test.ts`, while Turbo still started several pure
package test processes simultaneously. Both exact affected Dashboard suites
passed isolated **11/11** immediately after the root run, with unchanged
assertions and timeouts. The remaining fix is to bound concurrency **inside**
the pure Turbo lane. Adding supported `--concurrency=1` and rerunning the
full root lane proved those Dashboard failures gone: **115/115 files, 838/838
tests PASS**, with no timeout or skipped suites. API and Database continued
running even though an unchanged Native baseline suite made the aggregate
fail; this demonstrates that the root harness retains all failures and
does not mask error codes.

### Native baseline gate (requires Owner scope decision)

The bounded full root run reproduced **7 failed Native assertions across five
executed suite files**, plus an import failure in
`native-cold-start-telemetry.test.ts` (zero executed tests). The failing
executed contracts were `employee-brand-assets.test.mjs` (1),
`native-appearance-coverage.test.ts` (1),
`native-appearance-render-matrix.test.ts` (2),
`native-production-entry.test.mjs` (1), and
`package-manifest.test.mjs` (2; `expo-location` mismatch). The test runner
reported **225 passing / 6 failing suite files, 1631 passing / 7 failing
executed tests**. The previously accepted Issue #215 handoff also recorded
six Native test failures across five suite files plus an import failure.
`git diff origin/main..HEAD -- apps/valet-native` has **zero changes**.
This is an existing platform-wide release-gate blocker, outside the
authorized Native implementation scope of Issue #287. It must not be
reclassified as green, removed from CI, or silently repaired through unrelated
Native production changes. A separate Owner decision is required if Native
baseline remediation should join this branch.

On the integrated candidate before its latest test-fixture follow-ups,
`pnpm lint` **11/11**, `pnpm architecture:check` **PASS**,
`pnpm typecheck` **11/11**, `pnpm test:build-contract` **8/8**, and
`pnpm build` **10/10** all passed. The latter used the repository's
deterministic verification-build configuration; `next-env.d.ts` generated
by the browser dev server is restored to its tracked source state before final
commit, including files touched by the employee E2E retry.

Independent W7 QA identified a test-coverage gap in a historical Check-In
cancellation upgrade: the snapshot excluded newly introduced
`customer_access_consumed_at` while only checking generation. The current
test keeps the original snapshot and Audit comparisons and additionally
requires exact post-upgrade `{customer_access_generation:1,
customer_access_consumed_at:null}`. The database typecheck passes.

## 5. Final review and delivery gates

Independent Worker 6 **SECURITY PASS** at exact source SHA
`16c7bdfcf7255b0c0b096d8f217112980670dfba`: P0/P1/P2 zero, all
seven negative Audit writes preserved, Staff/Company/Location/custody/privacy
controls preserved, disposable DB+MinIO ownership and no applied migration
edits verified. Worker 7 independently provided **SOURCE/TEST QA PASS** at
the same exact SHA, independently running **39/39** Node harness tests,
confirming ownership of API 559 test files and database 97 files, 93 exact
migrations, and unchanged **13 Chromium tests / 7 spec files**. Its historical
guest `consumed_at` invariant, retry-specific G0/G1 physical fixture
and shared shift-loss cleanup concerns were corrected and independently
rechecked. These are code-review attestations, **not** claims that all
runtime/remote CI gates have passed.

Pending final freeze: attach exact final branch SHA, complete changed-file and
commit list, PostgreSQL17 test/container and cleanup receipt, Employee E2E
fixture/Chromium result, lint/typecheck/build result, and SHA-matched independent
security/QA verdicts. Correct any attributable P0/P1/P2 issue before marking
code ready. No migration file may be rewritten and the audit, custody, private
photo verification, Staff authority, tenant and Location boundaries remain
required negative cases.

The current workflow only triggers `pull_request` targeting `main` and `push`
on `main`; a normal push of this authorized feature branch does **not** start
the full remote workflow. Creating a PR, widening workflow triggers, and
pushing to main are outside the current authorization. Consequently any final
feature-branch delivery must be labeled `REMOTE_CI_PENDING_AUTHORIZATION`
until a separately authorized full required workflow runs on the final SHA.

Issue #287 qualification does not close separate decisions/issues #286,
#288, #289, #290, #291 or any Issue #215 physical Android/production gate.

## 6. Owner-authorized Native/PR extension — 17 October 2026

This later record **supersedes the earlier authorization and outstanding
Native/PR statements** above; the original first-run failures remain in the
history rather than being silently erased. The Owner explicitly authorized
Native baseline remediation, an isolated PR to `main`, and actual remote CI.
No production deployment, PR merge, `main` change or Issue closure was
authorized. The PR is **#298 (draft)**.

- Native: the full task-owned Prime run finished **231/231 suites,
  1640/1640 tests PASS**. Test-only updates preserve the accepted high-density
  dark logo, the foreground-only `expo-location` dependency, telemetry
  opt-in, EN/AR Light/Dark appearance geometry, and the exact #255 Vehicles
  baseline hashes. GitHub's UTC versus the approved Asia/Amman baseline
  surfaced one #255 failure; it was reproduced with exact digest under UTC
  and corrected with a test-scoped Intl formatter, without changing runtime
  timestamps or baseline files.
- Chromium: on the later exact Prime candidate `e0d58c8895ebca85767c96af71a16658427ce239`,
  an independent task-owned PG17 data-tmpfs (1024 MiB) ran all **93
  migrations**, runtime role provisioning, Contracts build, Employee fixture
  attestation (1/1/1/1/8), API + Valet HTTP 200, then **all 13/13 Chromium
  tests PASS**, one Playwright worker with normal retry policy. The original
  PR CI run's single Incident E2E timeout (12/13 PASS) was corrected by
  waiting for the actual Parking screen before disconnecting the browser.
  Cleanup proved exact owned PG container absent and both app ports free;
  the separate photo-QA containers were untouched.
- The first remote PR workflow, GitHub Actions CI run
  `38968724526`, showed PASS for static-build, API compound, database,
  Ubuntu platform and Windows platform, with FAIL for unit (#255 UTC),
  API Standard (3), API Race (3), protected Issue215 (2 recovery suites),
  and Employee E2E (1); required aggregate `quality` therefore FAILED.
  This run **is not accepted**. The branch changes and revised CI must be
  checked on a new SHA.
- The protected Issue215 recovery DB teardown previously hardcoded the
  local `issue215_owner`, while the separately attested GitHub PG17 service
  uses `valet`. The correction requires equality of the independently
  verified bootstrap URL login, the live `session_user`, and the exact
  disposable database owner before any DROP. Negative mismatches remain
  denied. Focused ownership/target tests **15/15 PASS**, plus TypeScript
  and lint PASS. The actual versioned private-MinIO remote rerun is pending.
- API Standard: remote 1096/1099 PASS; the original three failures were
  two premature zero-leak pool-idle comparisons and one historical HTTP 500
  assertion where a disconnected database now returns safe 503. Following
  bounded (<1s) lease-settle assertions and the scoped response correction,
  independently owned **PG17 512MiB** focused replays passed **2/2 files,
  8/8 tests**, zero residual databases/roles/children.
- API Race: remote 1363/1401 passing with 35 intentional skips and three
  failed assertions: an out-of-transaction GUC expected 5s rather than the
  true transaction-scoped PG17 budget, a historical exception-message
  string, and a foreign-organization 400 expectation where safe enumeration
  masking now returns 404. Focused replay confirmed those three corrected
  tests PASS and the other adjacent tests PASS, but repeatedly exposed
  timing-sensitive *other* timeout cases under Windows; one focused pass
  produced 22/23 rather than all-green. The test now also asserts two
  successful sub-3s statements and only recognized PG17 timeout/lease
  disposal errors, bounded runtime, no persisted effect and no active
  transactions. Do **not** claim a full Race PASS without the new CI run.
- The old Windows W2 API project runner exhausted its *own* 128MiB
  ephemeral PG17 tmpfs, making its Race coverage invalid. It was cleaned
  by exact owner label and process-tree attestation. Later 512MiB targeted
  replays used the original worker9 start/stop identity validator, confirmed
  task-only Docker disposal, and left foreign databases untouched.

Final acceptance remains: all required remote PR checks including the five
PostgreSQL lanes, complete Employee E2E, pure unit, static/build/platform
and `quality` PASS **on the same final SHA**, plus independent security/QA
review and a clean diff. Do not merge or close #287 on this document alone.
