# Database Package

Owns Prisma schema, migrations, generated client configuration and database test helpers.

`docs/03_DATABASE_SCHEMA.md` is the logical source of truth.

Do not implement models that contradict it without an accepted decision.

## Local validation

Start PostgreSQL from the repository root, then validate the schema and run the
database tests:

```text
docker compose up -d postgres
pnpm --filter @valet/database prisma:validate
pnpm --filter @valet/database test
```

The integration suite creates a uniquely named temporary database, applies the
committed migrations, verifies database constraints, and removes that database
after the run. `TEST_DATABASE_URL` may override the administrative connection;
otherwise `DATABASE_URL` and then the local Docker Compose URL are used.
