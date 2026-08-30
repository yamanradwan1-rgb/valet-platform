# Database Package

Owns Prisma schema, migrations, generated client configuration and database test helpers.

`docs/03_DATABASE_SCHEMA.md` is the logical source of truth.

Do not implement models that contradict it without an accepted decision.

## Local validation

Start PostgreSQL from the repository root, then validate the schema and run the
database tests:

```text
docker compose up -d postgres
pnpm --filter @valet/database migrate:deploy
pnpm --filter @valet/database runtime:provision
pnpm --filter @valet/database prisma:validate
pnpm --filter @valet/database test
```

Prisma migration commands require `MIGRATION_DATABASE_URL`, using the
migration/admin role. Application code and the guarded demo seed use
`DATABASE_URL`, using the restricted runtime role. Run `runtime:provision`
after every migration deployment so current grants are reconciled and default
privileges are retained for future tables. The command is idempotent, reads the
runtime role and password from `DATABASE_URL`, never logs credentials, and
restricts `audit_events` to `SELECT` and `INSERT` for runtime.
Runtime receives no blanket table `DELETE` or `TRUNCATE` privilege.
DEC-071 Web Push subscription, intent, and delivery rows are mutable only for
their focused lifecycle; disabled subscription tombstones remain retained and
recoverable endpoint/key/auth ciphertext can be cleared without deleting the
row.
It receives no access to `_prisma_migrations`; sequence privileges reconcile to
`USAGE` and `SELECT` without `UPDATE`/`setval` authority.

The integration suite creates a uniquely named temporary database, applies the
committed migrations, verifies database constraints, and removes that database
after the run. `TEST_DATABASE_URL` may override the administrative connection;
otherwise `MIGRATION_DATABASE_URL` and then the local Docker Compose URL are
used.
