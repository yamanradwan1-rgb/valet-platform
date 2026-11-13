# Issue 416 — private disposable PostgreSQL 17 harness

This lane is **independent** of the generic test harness and of every existing
PostgreSQL instance. Its image is the explicit cached `postgres:17-alpine`.
It never uses port 5432 or 45432 and never reads `.env`.
It has no automated Docker startup, Docker teardown, stale-lease recovery,
database migration, or destructive fixture setup. The exact new fixture is
`vaylet-issue416-w9-pg17` on `127.0.0.1:55416/issue416_w9_db`, with the
named volume `vaylet-issue416-w9-pg17-data`.

In a **new PowerShell session**, set all three synthetic URLs explicitly:

```powershell
$env:TEST_DATABASE_URL='postgresql://issue416_w9_test:fixture_w9_test_only@127.0.0.1:55416/issue416_w9_db'
$env:MIGRATION_DATABASE_URL='postgresql://issue416_w9_migration:fixture_w9_migration_only@127.0.0.1:55416/issue416_w9_db'
$env:DATABASE_URL='postgresql://issue416_w9_runtime:fixture_w9_runtime_only@127.0.0.1:55416/issue416_w9_db'
```

From the repository worktree root:

```powershell
node packages/database/issue416-private/target-preflight.mjs --prepare
docker compose -f packages/database/issue416-private/compose.yaml -p vaylet-issue416-w9 up -d --pull never
node packages/database/issue416-private/target-preflight.mjs --inspect
pnpm --dir packages/database exec vitest run --config vitest.issue416-vap1.config.mjs --project issue416-preflight-unit
pnpm --dir packages/database exec vitest run --config vitest.issue416-vap1.config.mjs --project issue416-pg17-private
```

Once W2's reviewed forward-only migration SQL is integrated into the test
worktree, the **explicit DDL entrypoint** is:

```powershell
node packages/database/issue416-private/run-migrations.mjs --apply
```

It requires the same three explicit test URLs and verifies the running Docker
and PostgreSQL identities twice before the migration and again afterwards.
The pinned installed Prisma 7.9.1 CLI is invoked as a sanitized Node child
with its own pre-entrypoint attestation. Do not call the generic pnpm migrate
runner: it depends on inherited `npm_execpath` and its usual fallback paths.
On this dedicated test target `issue416_w9_migration` alone is allowed
`CREATEROLE` to create the future private NOLOGIN owner in migration 113;
test/runtime roles remain `NOCREATEROLE` with no owner membership.

If Prisma P3018 reports a failed migration, **stop**. Preserve its logs and
catalog state with the strictly read-only investigation command below, using
the same explicit three synthetic URLs:

```powershell
node packages/database/issue416-private/diagnose-migration.mjs --read-only
```

The script attests W9 from both parent and sanitized child before and after
inspection, reads migration history, schema ownership/ACLs, existing private
relations and role membership inside a `REPEATABLE READ READ ONLY` transaction,
then rolls back. It does not invoke Prisma, modify migration history or
repair failed migrations. An explicit target-attested `migrate resolve` adapter
requires separate Prime/W2 approval and review before implementation; never
use the generic Prisma command directly as a recovery workaround.

`--prepare` must PASS **before** creating the container; it denies an existing
name, volume, or occupied dedicated port. The compose command is the only
explicitly operator-started container creation. `--inspect` attests Docker
labels, image, loopback mapping, mounts, DB owner, role equality, version 17,
and rechecks from a sanitized Node child. Existing unrelated Docker containers
are left untouched. Never run `compose down -v`, `prune`, or a generic test
harness cleanup against the fixture.

The PG17 Vitest global setup performs both parent and child attestation
**before** it acquires a private, fail-closed exclusive lease. It never
recovers an existing lease or invokes generic cleanup. If a prior process
crashes, investigate the lease at the system temp directory before any
manual intervention. Test code must recheck `preflightIssue416Target()`
before accessing the cluster. A DDL-capable subprocess must load
`node --import=./issue416-private/child-preflight.mjs` first with only the
three explicit URLs and safe OS process variables (see
`sanitizedChildEnvironment`). The opt-in `runAttestedNode(script, args)`
wrapper enforces both parent and child checks and permits only JavaScript
scripts inside `packages/database`. Do not invoke existing generic migrate
runners or inherited `PG*`/run-ID environments without a reviewed adapter.

The role passwords above are publicly readable synthetic fixture strings,
not production credentials. This is an isolated test preflight, **not**
production key custody, backup, security validation or release attestation.
