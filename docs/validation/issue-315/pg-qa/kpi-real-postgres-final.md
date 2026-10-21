# Issue #315 — real PostgreSQL KPI RR regression/concurrency acceptance

**QA owner:** W2, same `test/issue-315-pg-race` worktree. **Production implementation:** W1's reviewed candidate `ec9b6fd1dbe4fa09c0faaf30b9efc47cf1c43dbe`, cherry-picked into QA as `d66e2ee2`; this QA increment changes **tests and evidence only**.

## Genuine disposable infrastructure

- PostgreSQL **17.11**, brand-new Windows `initdb` cluster under `D:/kndoom/valet-platform/tmp/issue-315-pg-qa/.issue315-private-cluster`, listener **127.0.0.1:58417** only, role `issue315_owner`, bootstrap DB `postgres`. Not the Windows PostgreSQL service on 5432, not Docker/CI/shared DB. Cluster identity `current_database,current_user,inet_server_port,data_directory` attested before fixture migration and creation.
- `ManagementControlPlaneTestFixture` created/destroyed its **own test child database/runtime role** separately for each test suite, applied genuine project migrations and provisioned runtime permissions. Data comprised synthetic LM and CA accounts with real sessions, grants, MFA TOTP enrollment, a parked ValetSession and KEY_MISSING incident.
- The tests require explicit opt-in and an exact dedicated data-directory/role/loopback/nonstandard-port check. Without these, tests do not run. No implicit default fallback URL is allowed.

## Failing candidate before W1 KPI patch

Ran `dashboard-issue315-kpi-pg.integration.test.ts` against pre-fix W1 code `4c79a6bc`: **1 FAIL, 2 skipped**, because *actual* real-PostgreSQL `locationKpiAnalytics` rejected an authorized LM with `DashboardOverviewError AUTHORIZATION_DENIED` at `analytics-kpi-query.ts:47`. This was not the prior mocked proof.

## W1 fixed candidate — results

Command from repository root after guarded environment setup:

```powershell
$env:ISSUE315_EPHEMERAL_PG='I_OWN_THIS_CLUSTER'
$env:ISSUE315_PG_PRIVATE_DATADIR='<exact absolute owned .issue315-private-cluster path>'
$env:TEST_DATABASE_URL='postgresql://issue315_owner:<disposable-secret>@127.0.0.1:<owned-nonstandard-port>/postgres'
$env:MIGRATION_DATABASE_URL=$env:TEST_DATABASE_URL
$env:NODE_ENV='test'
pnpm --dir apps/api exec vitest run --config ../../docs/validation/issue-315/pg-qa/vitest-kpi-pg.config.mjs --reporter=verbose
```

**Actual PostgreSQL run: 2 files, 6/6 PASS, 27.12 seconds.** Cases:

1. Authorized Location Manager successfully retrieves real KPI aggregates. The actual first SLA and last key-exception SQL queries both observe `transaction_isolation = repeatable read` and **the same actual `txid_current_snapshot()`**, from one pinned database connection/transaction. Follow-up targeted rerun after adding a genuinely persisted parked session + key incident also passed **1/1** and asserted `keyExceptions.count = 1`.
2. **Reader-first:** actual `staff_management_set_location_access` SECURITY DEFINER revoker is observed waiting in `pg_stat_activity.wait_event_type='Lock'` until the RR KPI completes, then fresh KPI access returns `AUTHORIZATION_DENIED`.
3. **Revoker-first:** canonical writer deletes the grant but holds its transaction; the real KPI read is observed blocked, then, after the writer commits, denies and a fresh read also denies.
4. **Two simultaneous LM readers:** separate real RR KPI transactions both reach SQL projection; the canonical revoker remains blocked after the first finishes and only completes after the second finishes. No deadlocks or unexpected timeouts.
5. **Company Admin:** real TOTP enrollment and MFA assurance, then KPI succeeds under RR on the independent CA path without a session shared org advisory unlock.
6. **Serialization retry:** inject **one synthetic SQLSTATE 40001** at the actual first SLA query on a real runtime-PG connection; verify first transaction rolls back and releases the session advisory, then next attempt succeeds with RR, exactly two RR projections and two releases. This proves API retry wiring, **not** a PostgreSQL-generated serialization anomaly.

The separate existing mocked `dashboard-issue315-kpi-regression.test.ts` was updated by W2 to represent W1's **session-level `pg_advisory_lock_shared` before BEGIN** and `pg_advisory_unlock_shared` after COMMIT/ROLLBACK, rather than the old transactional advisory. This source-level regression then ran **4/4 PASS**, including real pre/post order assertions for the emulated connection, revoked grant, original baseline emulation and the CA path.

## Boundaries

- No assertions are made that a privileged *raw SQL* DELETE participates in an advisory lock. The original W2 negative control remains valid.
- The tests exercise the **real PostgreSQL and production `locationKpiAnalytics` function**, but are not a standalone HTTP endpoint/browser test. The 40001 error is injected, not a DB-generated serialization conflict.
- No production source, migration, service5432, CI or main-branch files were authored by W2. The prior 22/22 general #315 PG matrix was **not rerun**, per owner request.

## Run log summary

```text
BEFORE W1 KPI fix: 1 failed (LM KPI AUTHORIZATION_DENIED), 2 skipped.
AFTER W1 KPI fix:  Test Files 2 passed (2); Tests 6 passed (6); Duration 27.12s.
ADDED seeded KPI check: Test Files 1 passed, 1 skipped; Tests 1 passed, 5 skipped; Duration 16.56s.
Updated mock KPI: Test Files 1 passed, 2 skipped; Tests 4 passed, 6 skipped; Duration 12.25s.
```

Strictly remove this run's child DB/roles and stop/delete **only the exact private cluster** after final safety checks. A successful QA run is not authorization to merge/deploy/close Issue #315.
