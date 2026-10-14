# Issue #215 P1 — Independent PostgreSQL harness and lock-order audit

Status: **Focused disposable-PostgreSQL P1 tests passed; independent SQL and role review completed with conditional P1 handoff GO and P2 production gates open**

Scope: P1 C1 database integrity, isolation, test discovery and concurrency review.
Basis: `codex/issue-215-p1-foundation`, predecessor `37a0b7a9bc19a9048c617978f2b69325a74869ea`.

## Authority and observed baseline

Read `AGENTS.md`, `DEC-104_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md`, the #215 master plan (especially sections 10, 12–14, 20/P1 and 23/P1), P0 handoff, structure rules, current auth/check-in sources and database test harness. C1 requires additive journal/attempt/verification/availability/admission persistence; legacy `vehicle_photos` remain metadata-only until a separate, actually verified upload creates a separate photo and verification. P1 changes no photo guard, screen, API route, or custody state.

Existing migration `20260809001500_check_in_intake_persistence` provides `vehicle_photos` with tenant/location/session/member composite FKs and immutable runtime role treatment; no byte-verification child exists in the baseline. `provision-append-only-tables.mjs` grants only `SELECT, INSERT` on `vehicle_photos` and revokes `UPDATE, DELETE, TRUNCATE` from the API role. P1 must preserve that old behavior while denying generic mutation of its new verified relations.

## Test discovery and execution evidence

`scripts/test-harness/test-classification.mjs` discovers `*.test.ts` in `packages/database/src`, recursively follows local test/fixture/helper imports and assigns each test to exactly one project. `new Pool`, `new Client`, `CREATE DATABASE` or `DROP DATABASE` make a test PostgreSQL-owned; a provisioning/migration subprocess marker makes it `database-postgres-provision` rather than `database-postgres-direct`. `packages/database/vitest.config.mjs` creates separate Postgres projects with `vitest-postgres-global.mjs`, ownership setup and budgeted worker counts. Focused tests should use `node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/<test>.test.ts` through the database package, with explicit verified `TEST_DATABASE_URL`.

Observed pure Node command, with no PostgreSQL connection or migration:

```text
node --test scripts/test-harness/classification.test.mjs scripts/test-harness/ownership-state.test.mjs
First run: 11 passed / 1 failed / 12 total
After authorized correction to three stale deterministic ownership counts: 12 passed / 0 failed / 12 total
```

Existing `classification.test.mjs:29-31` has stale hardcoded counts. Runtime classification on this source returned:

| Test project | Current discovered count | Current static expectation |
| --- | ---: | ---: |
| `api-non-postgres` | 96 | — |
| `api-postgres-race` | 215 | — |
| `api-postgres-standard` | 165 | — |
| `api-postgres-compound` | 26 | — |
| `database-non-postgres` | 6 | 6 |
| `database-postgres-direct` | 41 | 41 |
| `database-postgres-provision` | 47 | 47 |

`classification.test.mjs` initially failed `5 !== 3` before reaching two further stale assertions. The prime subsequently authorized worker-4 to update only those three deterministic counts to reflect current discovered tests; the rerun passed all 12 Node harness tests, including the ownership and crash cleanup simulations. This corrected a pre-existing harness expectation mismatch without weakening the discovery/count check.

All five worker-4 PostgreSQL test files are classified into `database-postgres-provision`. The standard `run-owned-tests.mjs` wrapper was blocked *before DB access* by missing `apps/api/node_modules/pg` in this worktree, so the focused database Vitest project ran directly using its existing `vitest-postgres-global.mjs` lease, ownership tracking and resource budget:

```text
pnpm --filter @valet/database exec vitest run --config vitest.config.mjs --project database-postgres-provision src/condition-photo-p1-audit-availability.integration.test.ts src/condition-photo-p1-integrity.integration.test.ts src/condition-photo-p1-negative.integration.test.ts src/condition-photo-p1-stored.integration.test.ts src/condition-photo-p1-upgrade.integration.test.ts
database-postgres-provision: 5 test files PASS / 21 tests PASS / 0 fail
condition-photo-p1-audit-availability.integration.test.ts: 3 PASS
condition-photo-p1-integrity.integration.test.ts: 6 PASS
condition-photo-p1-negative.integration.test.ts: 7 PASS
condition-photo-p1-stored.integration.test.ts: 3 PASS
condition-photo-p1-upgrade.integration.test.ts: 2 PASS
cleanup: db=0 roles=0 children=0
```

The test cases cover scope FK denial, malformed hashes/dimensions, foreign attempt object keys, dangling VERIFIED deferred rollback, selected-attempt uniqueness, single exact ValetSession audit and replay, concurrent logical UUID convergence, User-wide capacity across three organizations, durable STORED idempotence/fingerprint conflict/rollback, stale lease and ABANDONED tombstone/maintenance inspection, spoofed verification audit denial with/without idempotency or correct entity, post-CHECKING_IN SYSTEM coded unavailability audit/idempotence, inactive Organization/Location mutation denial, and real Prisma 79-to-80 predecessor upgrade retaining the old ConditionNote and VehiclePhoto while leaving both unverified and without availability child. All owned test files are below 300 lines; focused ESLint, database TypeScript typecheck and `git diff --check` passed. The harness correctly denied one earlier competing invocation while another worker owned cluster `loopback:58487`; once that lease was released, the complete five-file run passed and removed its own task-scoped resources.

## Disposable target isolation — evidence and gate

At initial inspection, `TEST_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATABASE_URL`, `PGHOST`, `PGDATABASE` were unset in the connected shell. `scripts/test-harness/invocation-lease.mjs:13-21` and many existing fixtures fall back to `postgresql://valet:valet@127.0.0.1:5432/valet`. Therefore an unqualified invocation could address an unrelated cluster. Do not run database tests or migrations on the fallback.

A later read-only Docker inspection found a task-named container `vaylet_issue215_p1_local`, image `postgres:16-alpine`, ID beginning `9e5631c9cbd2`, created `2026-10-14T19:11:46Z`, with a dedicated Docker-managed volume and host binding **`127.0.0.1:58487 -> container 5432`**. Container configuration reports `POSTGRES_USER=issue215_owner`, `POSTGRES_DB=issue215_empty`. A local socket `psql` query confirmed `current_database()=issue215_empty`, `current_user=issue215_owner`, and `pg_is_in_recovery()=false`. No secret was printed or recorded; no schema, role or database mutation occurred in this review.

For the successful focused run, the task-local `db-local.ps1 -Database empty` environment loader provided the URL without logging credentials, and `condition-photo-p1-test-context.ts` independently enforced explicit `TEST_DATABASE_URL` hostname, port 58487, database `issue215_empty`, role `issue215_owner` and a SQL connection identity probe before creating a randomized `vlt_t_db_215_*` database. The test harness reserved its per-cluster lease and the fixture dropped only its own named databases. Neither the production/shared cluster nor the prime's `issue215_upgrade` predecessor snapshot was touched by these tests.

## Existing lock graph and P2 compatibility risk

| Existing writer | Observed acquisition order | Source |
| --- | --- | --- |
| Exact Staff access recheck | `staff-user-security:<user>` advisory -> matching `staff_auth_sessions FOR UPDATE` (current hash, expiry, revocation and User active filters) | `auth/staff-session-revalidation.ts` |
| Staff refresh | Resolve session User without lock -> User advisory -> `staff_refresh_credentials`, `staff_auth_sessions`, `users FOR UPDATE` | `auth/staff-auth.service.ts` |
| Staff login | User advisory -> `users FOR UPDATE` -> create Staff session and refresh credential | `auth/staff-auth.service.ts` |
| Staff logout | `staff_refresh_credentials` and `staff_auth_sessions FOR UPDATE` -> session revocation and push disable; does not acquire User advisory | `auth/staff-auth-logout.ts` |
| Existing Check-In condition mutation | `users FOR SHARE` -> optional `management-settings-org` shared advisory -> membership/organization/location/access `FOR SHARE` -> `valet_sessions FOR UPDATE` | `check-in-condition-authorization.ts`, `custody-staff-authorizer.ts` |
| Existing complete Check-In | `users FOR SHARE` -> settings shared advisory -> persisted scope authorizer shared locks -> session `FOR UPDATE` -> vehicle `FOR SHARE` -> guard | `complete-check-in-command.ts` |

The new T2 must revalidate the **exact bearer credential** before finalization and hold the protected row through the atomic write. Ordering `users FOR SHARE` before `staff-user-security` creates a potential cycle with login (`advisory` then `users FOR UPDATE`); review the final call graph before combining the existing helpers. Logout's different prefix must also be exercised in actual two-transaction tests; merely calling the new advisory does not prove deadlock freedom. P1's per-User admission row must serialize live leases across memberships/locations before operation/attempt locks, with database time and stale-attempt fencing. No external object I/O should occur while a DB transaction is held.

## Focused PostgreSQL proof matrix for the P1 owner

1. **Coherence/negative FKs:** wrong Organization, Location, ValetSession, actor, operation, selected attempt or storage key must fail via PostgreSQL constraints. Check digest length (32 bytes), positive byte/pixel dimensions, immutable verification and availability coding.
2. **One logical evidence result:** duplicate member + client UUID, member + session + purpose pending, repeated attempt number, object key, verification operation/attempt and back-reference must each be enforced. A `VERIFIED` operation without coherent selected verification/photo must fail at commit, including deferred cycles and partial writes.
3. **Actual races:** simultaneous pending reservations (commit, rollback and uncertain-response branches); same User across two memberships/locations claiming the live-attempt cap; expiry/claim fences. Check SQLSTATE and named constraint rather than interpreting every `23505` as expected.
4. **Least privilege:** query `has_table_privilege`, `has_column_privilege`, `has_function_privilege` and `pg_proc` metadata under actual API, distinct maintenance and PUBLIC roles. Confirm SECURITY DEFINER owner/search_path safety, no PUBLIC EXECUTE, no direct mutation of verified facts, and no maintenance evidence finalization.
5. **Legacy upgrade:** run real recorded migrations through predecessor, persist representative metadata-only `vehicle_photos`, run actual `migrate:deploy` plus role provisioning, prove old data/queries unchanged and no verification/availability child backfilled. Compare against an empty fresh deployment; never rewrite migration 15 or use schema synchronization.

All 21 worker-4 P1 integrity, STORED, audit/availability, negative, concurrency and historical-upgrade tests pass against real PostgreSQL 16. Independently, worker-3 reviewed the current SQL/schema and ran real role tests: **4/4** connected API/maintenance/PUBLIC privilege tests and **3/3** focused privilege-policy unit tests passed, including repeat provisioning, all six API entrypoints, two maintenance entrypoints and denied PUBLIC grants. The final atomic `BEGIN`/`COMMIT` migration also deployed all **80/80** migrations from empty to the separate verified `issue215_atomic_final` test DB; repeating deploy reported no pending migrations. No SQL-level P0/P1 remained in these reviews. The explicit outstanding release gate is P2's exact bearer/authority lock-order and revocation race proof, plus real byte/provider verification; the P1 foundation is conditionally review-ready and the feature remains disabled. These results are not production release evidence.

## Review-001 post-implementation harness remediation (2026-10-14)

The historical fixture-only preflight was insufficient for the role suite: the
legacy guest-browser helper selected `TEST_DATABASE_URL` then
`MIGRATION_DATABASE_URL` and finally a local development fallback. More
importantly, the standard Postgres harness itself could perform **stale-owner
DROP cleanup before P1's test `beforeAll`** via
`invocation-lease.mjs`/`vitest-postgres-global.mjs`. Both paths were identified
by separate independent read-only reviewers as P1 acceptance blockers.

P1 tests now use `ConditionPhotoP1OwnedTarget`, shared with the P1 integrity
fixture, instead of the legacy guest fixture. The canonical guard in
`condition-photo-p1-test-target.mjs` is used **before** lease acquisition and
stale recovery on P1-containing invocations; it refuses any fallback, requires
exact 127.0.0.1:58487/issue215_empty and bootstrap issue215_owner, pins the
approved Docker container ID and private volume ID, and verifies read-only
PostgreSQL 16 primary/live login/database owner before any lifecycle SQL.
Its strict target parser and Docker/live checks are exercised by 20 pure tests.
The original P1 owner context and actual role suite both use randomized
task-owned database and role identifiers and re-verify identity before cleanup;
the main ownership harness still records planned-before-create resource events
to recover an uncertain CREATE acknowledgement.

| Test-target scenario | Observed result |
| --- | --- |
| Explicit approved disposable target | Docker, URL and PostgreSQL live identity pass before CREATE |
| Missing URL, despite forged `MIGRATION_DATABASE_URL` | Direct Vitest global setup errors **before** lease/stale cleanup; no test executes |
| Wrong host, non-loopback, port, database, role, protocol | Parser unit tests reject, zero mutation callback |
| Unexpected query, fragment, PG override, wrong NODE_ENV/project/run marker | Parser unit tests reject, zero mutation callback |
| Wrong PostgreSQL user, owner, version, port, recovery state | Live-identity unit tests reject |
| Swapped Docker identity or volume, incorrect bind | Docker-identity unit tests reject |
| Setup never completed / CREATE DB failed | Mocked close emits zero DROP |
| DB created, next role CREATE fails | Mocked cleanup drops only recorded owned database |
| One role created, second CREATE fails | Mocked cleanup drops only acknowledged role/database |
| Pre-existing matching-prefix role | Collision rejected, no mutation / no DROP |
| Identity changed before cleanup | No destructive SQL, error reported |
| Repeated successful run | Exactly own two resource sets cleaned, no orphan in mock |
| Actual restricted PostgreSQL run | **6/6 PASS**, including connected runtime, maintenance, PUBLIC-only SQL and successful server-side runtime VERIFIED evidence |
| Actual old P1 integrity/upgrade suites | **21/21 PASS**, five files |
| Actual P1-owned lifecycle tests | **8/8 PASS**, owned harness |
| PostgreSQL harness classification/ownership | **14/14 PASS**, including prelease fallback refusal |
| Successful PostgreSQL teardown | Observed `db=0 roles=0 children=0` in each completed focused PG invocation |

The negative cases use isolated in-memory/mocked SQL for rejected targets; no
destructive operation is issued to a deliberately unsafe real database. Fresh
non-Postgres database tests: **7 files, 64/64 PASS**; shared contracts:
**449/449 PASS**, lint/typecheck PASS; database lint/typecheck, Prisma schema
validation, architecture check and `git diff --check` PASS. The architecture
check reports only grandfathered source-size warnings outside this change.

The full repository `pnpm test:non-postgres` still fails in the isolated
worktree: missing `react`, `@valet/contracts`, NestJS/API and employee-client
workspace dependencies prevented many suites from loading. One Dashboard
`operations-presentation.test.ts` localization expectation also failed and
cannot be classified as green or assumed environment-only; no Dashboard code
was changed. This broader suite is **not green** and remains a CI/dependency
validation gate. Initial Prisma validate without the required config URL
failed configuration loading; the subsequent schema-only validation with the
approved test-local migration URL passed without executing a database write.

The latest root reattempt also encountered Windows VirtualAlloc and Node heap
out-of-memory failures in concurrent Customer, employee-client and Dashboard
Vitest processes (Turbo reported `memory-pressure`, exit 134). An overlapping
six-file PostgreSQL run was consequently not green: one upgrade test timed out
under load, and the STORED file's bootstrap identity inspection failed during
resource exhaustion. No suspect target was mutated by the failing STORED
fixture. The earlier isolated 27/27 result remains separate evidence; never
count this contended run as passing. Resource pressure requires isolated rerun
and the full cross-package suite requires a capable/complete CI environment.

After the competing processes ended, the verified isolated recheck passed
**21/21** P1 integrity/STORED/negative/audit/upgrade cases in five files using
`--no-file-parallelism`, followed by **6/6** connected restricted-role tests in
a separate owned PG16 run. The harness reported `db=0 roles=0 children=0`
for both runs. These are the final functional focused test results, without
misreporting the separate resource-contention failure as a pass.

No P1 SQL/migration/schema or UI was changed by this remediation. Existing
`Promise.all`/sleep PostgreSQL races are useful integrity tests but are **not**
equivalent to deterministic barrier-controlled two-transaction HTTP/refresh
interleavings; those comprehensive credential/provider conflicts remain P2.
The future P5 integrity worker needs a narrow separate service authority to
mark unavailable bytes after staff/Location deactivation with append-only
SYSTEM audit, without impersonation, forged trust, or broad privileges.

## P1-HARNESS-SCOPE-001 — task-only preflight ownership correction

The prior fix at `8975fc5d` secured P1 against fallback and pre-lease stale
cleanup, but required the **P1-only pinned Docker/CI target** for every
`database-postgres-direct`/`database-postgres-provision` project (including
41+41 unrelated database files), as well as their full package/root wrappers.
Focused ordinary PostgreSQL tests therefore failed on otherwise permitted
legacy test environments without ever exercising condition-photo code.

The corrected model has an authoritative 7-file exact manifest in
`issue215-test-manifest.mjs`. Test classification assigns these tests to
`database-postgres-issue215` exclusively; 41 direct, 41 provisioning and 7
non-Postgres files retain their normal project/lease/resource-profile behavior.
The classifier rejects missing protected files and any newly DB-backed
condition-photo test or transitive P1 mutation fixture outside that manifest.
Vitest config retains all original tests, registers the dedicated project with
the bounded provisioning resource profile, and `test:postgres` executes all
three database projects. No test is hidden behind an opt-in switch.

The P1 attestation predicate receives **resolved project identity** from the
actual owning Vitest global setup, or from an explicit project list produced by
the authoritative package/owned-test dispatch. It never reads CLI filenames,
`--exclude`, `--changed`, reporter or output-file args. Ordinary-only
direct/provisioning and API PostgreSQL projects do not require Issue215 Docker
identity. Mixed/full commands whose owned project list contains Issue215
preflight **before the outer lease**; direct protected Vitest runs preflight
in their own global setup **before recovery**. An unrelated global setup
recovering a stale run containing proven `vlt_t_db_215_*` or
`vlt_t_role_215_*` resources must also attest P1 before terminating a child
or issuing any DROP. This is conditional fencing, not a change to the
existing ownership-record and ordinary cleanup model.

Full database/package/root suites **contain P1 tests** and therefore still
require an approved target for those tests; this is deliberate and cannot
be avoided without silently skipping them. A focused unrelated test or an
ordinary direct/provision project does **not** have that requirement. The
existing CI database PostgreSQL matrix retains its explicitly attested PG17
service and now discovers the new P1 project; the API matrix does not run P1.
The `main`/PR-only CI triggers mean that pushing this branch alone does not
establish a green GitHub Actions run. P2/P5/P6 remain deferred unchanged.

### Focused execution matrix after scope split

- All seven Issue215 PostgreSQL tests in the new guarded project:
  **35/35 PASS**, including authenticated runtime/maintenance/PUBLIC role SQL
  and immutable evidence/upgrade verification; owned cleanup
  `db=0 roles=0 children=0`.
- Unrelated direct constraints **23/23 PASS** and unrelated provisioning
  guest rating **5/5 PASS**, each under an intentionally invalid Issue215-only
  mode (thus its strict Docker guard was not imposed on unrelated work).
- Mixed owned dispatch: ordinary Direct **23/23** plus guarded P1 mocked
  lifecycle **8/8 PASS**, on one verified parent lease, with 0 residual
  databases/roles/children. Mixed missing-target selection rejected *before*
  lease, even when a poisoned migration URL was provided.
- Focused database-non-postgres policy **3/3 PASS**, with no TEST_DATABASE_URL
  and poisoned MIGRATION_DATABASE_URL. The focused runner previously used
  `.includes("postgres")`, which wrongly treated `non-postgres` as PG and
  started a potentially destructive lease; its project detection is corrected.
- Every newly started protected run now emits `issue215-protected-run`
  to its durable ownership ledger before child work. Lease metadata records
  `issue215Protected` for all new invocations; legacy unmarked root/database
  labels which could have run P1 require P1 attestation before stale recovery.
  Cleanup rechecks the post-quiescence resource ledger before any DROP.
  Unit tests reject P1 stale records or marker-only recovery without a
  target; the original owned-only DROP semantics remain intact.
- The database focused coordinator now resolves PostgreSQL's `pg` driver
  from its own package rather than an absent isolated API workspace install.
- Harness/classification/ownership **19/19 PASS** at the final scope checks;
  database nonPG **64/64 PASS**, no migration/schema/UI edits.

Additional stale-recovery hardening: each new lease now records
`issue215RecoveryRequired` when a stale owner or pending ancestor could
have executed protected P1 tests. A failed stale-P1 preflight parks its
lease with the complete owner/recoveryRunIds ledger intact instead of deleting
it. A synthetic three-generation legacy → ordinary → ordinary chain verifies
that the protection and deferred resources remain recoverable. The focused
park helper lives in a small separate file to preserve the 300-line code rule.

Independent read-only final review (worker-3, post-recovery corrections):
**GO for the scoped P1 test harness remediation; no demonstrated P0/P1**.
The reviewer inspected manifest/project segregation, pre-lease attestation,
legacy recovery flags, parked ledger preservation and dual-stage cleanup
fencing, without modifying source or running database commands. A known
non-security retry constraint remains: a parked lease may be considered active
for the normal startedAt fallback window of up to 30 seconds before it can be
reclaimed; the original pending recovery records are retained. The successful
focused tests above are executor-run, not independently rerun by this reviewer.

An unrelated legacy audit-foundation provisioning suite ran but returned
**3/4 PASS** because it hardcodes 46 migrations while the immutable current
baseline now has 80; no unrelated test or schema was changed to hide this.
The complete 82-file unrelated PostgreSQL lane and real GitHub-hosted PG17
workflow remain **unverified** (not PASS). Branch push alone does not trigger
this main/PR-only workflow. Previously documented broad root memory failures
remain separate from this test-selection remediation.
