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
