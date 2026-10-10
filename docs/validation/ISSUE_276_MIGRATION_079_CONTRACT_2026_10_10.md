# #276 / DEC-103 — migration 079 delivery contract

Status: **verified on isolated Windows PostgreSQL; ready for per-environment
rollout approval, not auto-applied to unverified databases.**

## Why two SQL files

The repository's migration integration harness sends each entire
`prisma/migrations/.../migration.sql` via **one** `pg.Client.query(sql)`.
PostgreSQL cannot perform `CREATE INDEX CONCURRENTLY` in that implicit
multi-statement transaction context. A prototype migration mixing `DO`,
concurrent CREATE and `DO` was rejected during independent review.

The corrected version-control contract is:

1. **Operator first:** `packages/database/scripts/dec103-online-index-rollout.sql`
   has preflight definition checks, two independent `CREATE INDEX CONCURRENTLY
   IF NOT EXISTS` statements, and postflight verification. Run as a
   **file with psql -X -v ON_ERROR_STOP=1 -f** against an explicitly
   identified and authorized target, never via `pg.Client.query` or a
   transactional wrapper. The guarded `IF NOT EXISTS` is *not* blind:
   an existing wrong-table, different-definition, invalid or unready index
   triggers a fatal exception before DDL. Query the target and confirm
   expected migration head, index catalog, disk capacity, backup, lock
   timeout, and rollback operator before running this script.
2. **Migration registration and empty greenfield installation:** the
   single-statement SQL in
   `packages/database/prisma/migrations/20261010007900_live_history_parked_audit_indexes/migration.sql`
   checks the two exact index definitions and their `indisvalid` and
   `indisready` flags. If this is a **fresh empty Audit table**, it
   locks out concurrent inserts, creates both ordinary indexes in the same
   transaction, and re-verifies them; a brand-new test/development database
   can therefore deploy all migrations without a manual intervening step.
   If even one Audit event already exists, missing indexes **fail closed**:
   perform the operator-approved concurrent rollout BEFORE deploying 079.
   That restriction avoids a blocking CREATE INDEX on a populated database.
3. **Rollback:** do **not** remove migration 079 from history, apply
   `DROP INDEX CONCURRENTLY` only to indexes actually created under
   the authorized per-environment rollout, outside a transaction, with
   catalog/ownership and dependency verification. See
   `ISSUE_276_DEC103_QA_ROLLOUT_PLAN_2026_10_10.md`.

Example, with an out-of-band verified QA migration connection and
normal secure credential delivery:

```powershell
# After inspecting the target's identity, migration prerequisites,
# full backup, permissions and approved change window:
psql -X -v ON_ERROR_STOP=1 -f packages/database/scripts/dec103-online-index-rollout.sql
# ONLY when earlier pending migrations are also authorized:
pnpm --filter @valet/database migrate:deploy
```

The PostgreSQL connection parameters are not embedded in the SQL file:
the operator must supply them explicitly via trusted connection
configuration, and must **not** rely on a fallback to localhost or any
Production target. Never invoke migration deployment on a database with
unauthorized earlier pending migrations.

## Actual Windows development database

`127.0.0.1:5432/valet` already has both DEC-103 indexes, individually
installed with the Owner's approval on 2026-10-10, after a verified
custom-format backup. Both are valid/ready, definitions match and runtime
read authorization passes. **Prisma migration 078
`20261008007800_guest_web_push_v1` remains pending** in that database,
so a general `prisma migrate deploy` would also apply unrelated Guest
Push schema changes. It was deliberately **not** run as part of #276.
Migration 079 therefore remains unregistered locally until the preceding
migration has separately been authorized and applied in order. Do not
manually fake 078's completion or mutate historic migration SQL.

## Independent disposable PG test results

All of the following ran on owned child databases under the verified
`127.0.0.1:55449` disposable PostgreSQL 17 cluster, **not** on 5432:

- Operator rollout, indexes already valid: **PASS, guarded no-op**.
- Operator rollout, both indexes absent: **PASS, 2/2 valid and ready**.
- Operator rollout, one missing: **PASS, missing recreated**.
- Operator rollout with conflicting same-name index: **PASS, error raised**.
- Prisma `migration.sql` submitted as **one `pg.Client.query(sql)`**:
  preinstalled valid indexes **PASS**; incorrect definition **correctly
  rejected**; valid after operator rollout **PASS**. A **fresh, empty DB**
  must create both automatically, while a populated DB with missing index
  must reject without starting blocking DDL.
- The **actual Prisma migration runner** and PostgreSQL test harness now
  apply all migrations from a blank child DB through migration 079;
  greenfield two-index creation/validation succeeds with no separate
  operator step. Real NestJS / Dense100 suite exercises this new schema.
- The Windows-specific 16-session/revocation/load checks intentionally run
  only when explicitly opted into the separately verified Windows 55449
  disposable lab. They skip in the default Linux CI PostgreSQL service,
  which uses a different trust boundary (port 5432). This prevents
  destructive test setup against the wrong DB. Their 26/26 local tests were
  run against the owned lab, with the test parent URL read from explicit
  environment variables rather than embedding credentials in test sources.
- Test-only owned child DBs removed afterward; verified the original
  disposable source fixture remained present.

**Merge-hygiene validation note:** full database schema integration on the
current main-based tree reached 418/421 passing checks; the three failures
are pre-existing legacy assertions (fixed historic migration-manifest
lengths in two tests, plus an Audit NOT NULL error expectation receiving
`42501` due privileges). The full repository architecture check also has
two unrelated baseline violations in Guest Browser and Employee Client.
This report does not authorize bypassing repository release gates or
changing those other files under #276.

No production migration, PR, branch merge, background service or
unrelated Owner-owned worktree was touched during this test.
