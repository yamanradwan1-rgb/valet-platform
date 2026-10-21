# Issue #315 — isolated PostgreSQL grant/reading concurrency QA

**Test ownership:** worker-2, branch `test/issue-315-pg-race` rooted at `origin/main` `9abbbd2cf6ea062beabdcd06d8323ede474384dc`. This QA branch incorporated worker-1's approved source commits (content of `8b235c1b` and `4ff09023`) solely to run the corrected authorization function. The QA changes are focused test files and this validation directory. No production authorization/migration edits were authored here.

## Isolation and safety

- Real PostgreSQL **17.11** launched using Windows-installed binaries in a newly initialized disposable data directory `D:/kndoom/valet-platform/tmp/issue-315-pg-qa/.issue315-private-cluster`, bound **only to 127.0.0.1:58415**; role `issue315_owner`, initial `postgres` administrative DB. This is independent of the Windows PostgreSQL service and the repository's default 5432 DB. Docker Desktop daemon was unavailable.
- The tests are **disabled without explicit opt-in**: `ISSUE315_EPHEMERAL_PG=I_OWN_THIS_CLUSTER`, `ISSUE315_PG_PRIVATE_DATADIR` pointing to a private `/tmp/issue-315*/.issue315-private-cluster` directory, and matching `TEST_DATABASE_URL` and `MIGRATION_DATABASE_URL` with localhost, nonstandard port, `issue315_owner`, explicit password, and `/postgres`. They check the live server-reported `data_directory`, user, port, database and READ COMMITTED isolation **before** `ManagementControlPlaneTestFixture.start()` can create a child database/role. No CI, shared DB, implicit fallback, or ordinary main test harness execution was used.
- `StaffAuthNativeFixture` created a new disposable child database and runtime role for each test file, applied real repository migrations, provisioned least-privilege runtime, and destroyed both in fixture teardown. Both test files use synthetic staff users, sessions, Organizations and Location grants. No shared or real user data.
- The two tests were run using `docs/validation/issue-315/pg-qa/vitest.config.mjs`, which contains no general CI ownership or cleanup integration and collects only the two test files. This configuration avoids running other integration suites against the private DB.

## Results — 22/22 PostgreSQL tests PASS

| Area | Evidence / assertion |
| --- | --- |
| Canonical managed writer | Actual `staff_management_set_location_access` SECURITY DEFINER function, **reader-first and revoker-first**, independently observes PostgreSQL lock wait; later grant denied |
| Managed advisory writer | Reader-first and revoker-first grant deletion, staff role downgrade, and inactive Location; all serialize and recheck |
| Two readers | Independent LM accounts both acquire SHARED authorization; managed writer cannot complete before **both** reader transactions commit |
| Revoke then regrant | Two operations in same writer transaction resolve after commit to correctly authorized read |
| Multiple revokers | Exclusive writers queue; subsequent read denies without deadlock |
| Lock timeout/deadlock | Blocked reader aborts with expected PostgreSQL `55P03` after 250ms configured `lock_timeout`; no observed `40P01` deadlock |
| MVCC isolation | Both `REPEATABLE READ` and `SERIALIZABLE` fail closed, protecting the reread that requires `READ COMMITTED` |
| Tenant/location/role | Foreign Organization and ungranted Location deny; role downgrade and inactive membership deny |
| User/session | Disabled Staff user denies; revoked Staff session denies `REPORT_EXPORT` (the path that performs transactional credential revalidation) |
| Read capabilities | `LOCATION_DASHBOARD_READ`, `ANALYTICS_READ`, `REPORTS_READ`, `REPORT_EXPORT` paths through `authorizeDashboardReadLocation` exercised |
| Negative control: direct privileged SQL | **Both** a direct raw DELETE committed during a previously authorized reader transaction and an uncommitted revoker-first DELETE allow the original race without the canonical advisory. This is a documented residual boundary, not a managed-writer PASS. |

The last complete run used **two Vitest test files, 22 passed, zero failed**. Lint of both new test files, API TypeScript check and `pnpm architecture:check` passed (only grandfathered unrelated architecture warnings).

## Reproduction

Use a freshly initialized, independently owned disposable Windows PostgreSQL cluster with a unique port. Do not point these commands at an existing service's data directory or reuse a shared DB. Start it with `pg_ctl`, and set:

```powershell
$env:ISSUE315_EPHEMERAL_PG = 'I_OWN_THIS_CLUSTER'
$env:ISSUE315_PG_PRIVATE_DATADIR = '<absolute disposable Issue315 private cluster path>'
$env:TEST_DATABASE_URL = 'postgresql://issue315_owner:<ephemeral-private-password>@127.0.0.1:<private-port>/postgres'
$env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
$env:NODE_ENV = 'test'
pnpm --dir apps/api exec vitest run --config ../../docs/validation/issue-315/pg-qa/vitest.config.mjs --reporter=verbose
```

The path shown above is illustrative; the test guards validate exact runtime cluster identity before creating child resources. `pg_ctl stop` followed by deleting **only the explicitly owned private data directory** disposes of the PostgreSQL instance after proof.

## Limits and interpretation

The test exercised authorization transactions directly through the real PostgreSQL-backed TypeScript helper and actual canonical SECURITY DEFINER writer, **not each individual HTTP Dashboard endpoint**. Detailed HTTP response statuses, CI container behavior, service restarts, and arbitrary direct DBA edits are not fully protected/qualified by these tests. The inherited direct privileged SQL bypass is still possible because a DBA can mutate grants without participating in the canonical advisory protocol; that residual behavior is distinctly recorded and should not be conflated with the managed-writer fencing fix.
