# Issue #309 W5 — persisted PostgreSQL 17 + private versioned MinIO QA

Date: 2026-10-21. Initial run **BLOCKED** (23514/42501). Final reviewed
candidate **7/7 #309 + 6/6 #215 PASS** on isolated live PG17 + MinIO below.
Production/shared database activation is separately gated.

## Scope and exact source

- Base: origin/main `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`.
- Independent W5 branch: `feat/issue-309-w5-tests`, own worktree `tmp/issue-309-w5-integration-qa`.
- W3 auth source `705e2326`, cherry-picked only in test worktree as `31906b15`.
- W4 API source `2e15f283`, cherry-picked only in test worktree as `aa837729`.
- Production default policy in W3 explicitly denies photo VIEW. The W5 HTTP fixture's
  **test-only Nest singleton injection** invokes the real W4 service and PostgreSQL/S3,
  with W3 `authorizeSessionPhotoViewWithTestPolicy` for the proposed
  `LOCATION_MANAGER` role. It does not change production policy or use an env bypass.
- Existing #215 upload, DB schema, storage adapter, native app, grants, and main untouched.

## Fully isolated live targets

- Own Docker PostgreSQL `postgres:17-alpine` on a random `127.0.0.1` port,
  with tmpfs and pinned image ID enforced by
  `scripts/test-harness/issue215-worker9-pg-fixture.mjs`; no port 5432 or shared DB.
- Own Docker Chainguard MinIO on `127.0.0.1:63443`, private bucket
  `issue215-s3-worker4`, versioning enabled, object data in tmpfs,
  separate scoped app credentials. This fixture's run ID, labels, bucket,
  versioning and image identity are checked by the existing #215 HTTP helper.
- Each API suite receives a newly migrated database and restricted runtime role;
  identity-checked teardown reported `db=0 roles=0 children=0`.
- Original #215 real HTTP and new #309 cases used **actual JPEG bytes stored and
  retrieved from MinIO**. These are disposable synthetic images.

## Observed commands and results

Environment for the following test commands was sourced from this W5 worktree's
ignored private ownership manifests. It included
`VAYLET_ISSUE215_TEST_TARGET=worker9`, `ISSUE215_REAL_HTTP_ENABLED=true`,
`ISSUE215_REAL_S3_ENABLED=true`, `NODE_ENV=test`, and the attested
`TEST_DATABASE_URL` / run ID. No credentials are included here.

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/issue215-real-http-integration.test.ts
=> 1 file PASS; 6/6 tests PASS; harness cleanup db=0 roles=0 children=0

pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/issue309-photo-viewer.integration.test.ts test/issue309-photo-grant-race.integration.test.ts
=> 2 files FAIL; 7/7 expected acceptance cases FAIL; cleanup db=0 roles=0 children=0

pnpm --filter @valet/api exec tsc --noEmit -p tsconfig.json
=> PASS
pnpm exec eslint apps/api/test/issue309-photo-http-fixture.ts apps/api/test/issue309-photo-viewer.integration.test.ts apps/api/test/issue309-photo-grant-race.integration.test.ts
=> PASS
node --test scripts/test-harness/issue215-api-classification.test.mjs
=> 4/4 PASS (two W5 PostgreSQL suites explicitly admitted to protected project)
git diff --check
=> PASS
```

## Actual blocking evidence

**P1: every photo VIEW request returns HTTP 503 before it reaches the read
authorization/verification logic.** W4 added
`v1:dashboard-session-photo-view-user` to the TypeScript AntiAbuseScope union
(`apps/api/src/modules/anti-abuse/anti-abuse-key.ts:6`) and uses it at
`apps/api/src/modules/dashboard/session-photo-admission.ts:18`.
The newest applied PostgreSQL CHECK whitelist remains
`packages/database/prisma/migrations/20261015008100_issue_215_photo_anti_abuse_scopes/migration.sql:7-19`;
it does **not** allow the new scope. `AntiAbuseService.count` persists the new
scope into `anti_abuse_events` before the photo service authorization check,
so the database rejects the new event and the HTTP error is mapped to 503.
An additional actual SQL probe under the freshly provisioned restricted
runtime role inserted that exact scope with a syntactically valid scoped key;
PostgreSQL returned **SQLSTATE 23514** and constraint
**`anti_abuse_events_scope_check`**. This test used a new isolated database,
rolled back on the rejected statement, and dropped its own database/role.
This is a source/schema mismatch, not permission evidence for denied tenants.

**P1: actual runtime PostgreSQL rejects the new photo delivery row lock.**
After provisioning an actual fresh migrated PostgreSQL 17 database and the
restricted API runtime role using `openIssue215HttpDatabase`, we ran
`has_table_privilege(current_user, table, 'UPDATE')` on all four evidence
tables and then individually tried
`SELECT 1 FROM table AS photo WHERE FALSE FOR SHARE OF photo`.
Every UPDATE privilege returned `false`; every SELECT FOR SHARE returned
**SQLSTATE 42501**, including:

- `vehicle_photo_verifications`
- `vehicle_photo_availability`
- `condition_photo_upload_attempts`
- `condition_photo_upload_operations`

W4's final byte read in
`apps/api/src/modules/dashboard/session-photo-query.ts:104-153` requests
`FOR SHARE OF v,o,a,availability` using this exact role. Even after the
anti-abuse admission blocker is resolved, this SQL will be rejected. Existing
privilege policy is intentionally least-privilege; no broad UPDATE grants
were added during W5.

## Acceptance coverage prepared, but not yet qualified

`issue309-photo-viewer.integration.test.ts` exercises persisted JPEG
VERIFIED/SELECTED/AVAILABLE + manifest content, exact version+size+SHA256 and
byte fidelity; wrong session/photo and cross-tenant scopes; absent Location
grant and revoked grant; simultaneous list/download; and availability downgrade.
`issue309-photo-grant-race.integration.test.ts` exercises revoker-first
exclusive organization advisory and concurrent HTTP GET for manifest and
bytes, polls actual `pg_stat_activity` advisory wait state, then commits
grant removal and requires denied HTTP. **These assertions did execute, but
cannot yet qualify the behavior because admission returns 503 before lock
acquisition.** Both race attempts observed no advisory reader waiter.

No claims about positive image byte delivery, tenant denial, token/grant
revalidation timing, final enqueue linearization, or provider disappearance
are supported by the currently blocked #309 results. After the two confirmed
server blockers are fixed in their responsible production scopes, rerun the
same private integration suite and add real provider missing/version test.

## Teardown boundaries

Only W5 containers own `vaylet.owner=issue215-worker9-final` and
`com.docker.compose.project=issue215-s3-worker4` with matching run IDs.
Cleanup must use `node scripts/test-harness/issue215-worker9-pg-fixture.mjs stop`
and `node scripts/issue215-local-s3/stop.mjs` from **this W5 worktree**.
Other teams' containers, shared databases, ports and production were untouched.

## Reviewed W8/W9 migration acceptance rerun

Run `scripts/test-harness/run-issue309-private-qa.ps1` from **this isolated
W5 worktree**, after bringing the reviewed W1 scope and W2 SECURITY DEFINER
migration commits into the test candidate. Pass their exact directory basenames:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-harness/run-issue309-private-qa.ps1 `
  -ScopeMigration 'ACTUAL_W1_MIGRATION_DIRECTORY' `
  -DefinerMigration 'ACTUAL_W2_MIGRATION_DIRECTORY'
```

The runner verifies both migrations exist before starting any container;
refuses to take over existing fixtures; starts the pinned Docker PG17 and
versioned MinIO instances; passes verified private ownership manifests to the
existing protected `run-owned-tests.mjs` harness; and always attempts scoped
teardown. The #215 database fixture executes `prisma migrate deploy` against
each **newly created, disposable test database** before provisioning an actual
restricted runtime principal. Thus W1/W2 migrations are applied via the real
Prisma deploy order, with no migration of any shared database.

Final live qualification requires **7/7 executed #309** viewer/grant-race
cases and **6/6 executed #215** original real-upload cases, zero skips,
verified database/role cleanup and fixture removal. The historical #309
failure above is preserved as a pre-migration finding; final evidence follows.

## Final live acceptance — Prime 4b351b1c, 2026-10-21

The completed run used a **separate detached QA worktree** at
`tmp/issue-309-w11-pg17-qa`, exactly Prime source
`4b351b1ca3afc58d0ed538558af06159aec862b4`, with **only** the test runner
serialization commit `cfc51f29c94a5c84c888b7b33697efbad670312e`
(QA cherry-pick `f46d349d632d66f19fbd00339d6390a7fefa0e4e`).
Every suite independently used a freshly migrated disposable PostgreSQL 17
database and newly provisioned restricted runtime role. The private MinIO
bucket had versioning enabled. Both approved migrations were applied via
Prisma to each new database:

- `20261021009800_issue309_photo_view_anti_abuse_scope`
- `20261021009900_issue_309_management_photo_evidence_lock`

Command (run from the detached QA worktree root):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-harness/run-issue309-private-qa.ps1 `
  -ScopeMigration 20261021009800_issue309_photo_view_anti_abuse_scope `
  -DefinerMigration 20261021009900_issue_309_management_photo_evidence_lock
```

| Actual live HTTP suite | Results |
| --- | --- |
| `issue309-photo-viewer.integration.test.ts` | **5/5 PASS**, zero skips |
| `issue309-photo-grant-race.integration.test.ts` | **2/2 PASS**, zero skips |
| `issue215-real-http-integration.test.ts` | **6/6 PASS**, zero skips |

The #309 viewer cases verified real JPEG download with persisted exact
version/byte count/SHA256, cross-tenant/wrong-ID denial, absent/revoked
Location grant denial, concurrent readers, and availability downgrade.
Both revoker-first tests proved that committed grant removal prevents real
HTTP manifest and JPEG byte disclosure after waiting at the advisory fence.
The original #215 suite verified actual JPEG upload, qualification and
check-in policy on the same isolated provider and restricted database.

**Exit status `0`.** All three protected harness teardowns reported
`db=0 roles=1 children=0`: `roles=1` means **one orphaned task role was
dropped and verified absent** in `owned-cleanup.mjs` (the output field is
the number of successfully cleaned resources), not a remaining role.
The ownership-checked stop handlers then confirmed
`Issue #215 MinIO container and in-memory object data removed` and
`Worker9 isolated PG fixture STOPPED and removed`. Subsequent `docker ps -aq`
queries with both fixture ownership labels returned no containers, all three
PG/MinIO runtime manifests were absent, and the QA git worktree was clean.

Local raw log (ignored, no credentials displayed):
`tmp/issue-309-w11-pg17-qa/tmp/issue-309-w11-proof/acceptance-run-sequential.log`;
7,224 bytes; SHA256
`e7129686627c0182348d99be79662902219566f72410d6eb6aed3f771bc4aba3`.

The preceding parallel run was **not** accepted: 5 viewer cases passed, but
two grant-race cases were skipped because Windows Prisma engine extraction
hit `EPERM` renaming `schema-engine-windows.exe` during simultaneous
`prisma migrate deploy`; the original #215 remained 6/6 PASS. The narrow
W5 runner commit serializes the two #309 suite invocations, which eliminated
this nondeterministic test setup collision in the successful final run.

The HTTP fixture uses test-scoped proposed Location Manager authorization.
These results verify the database and HTTP read path under that role but
are not approval for production role activation or Company Admin MFA policy;
those have separate authorization tests and release gates.
