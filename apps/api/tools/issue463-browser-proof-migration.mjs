import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

function pgClient(root, url) {
  const require = createRequire(join(root, "packages/database/package.json"));
  const { Client } = require("pg");
  return new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
}

/** Attest the exact new TCP migrator before any DDL, then verify Prisma history. */
export async function assertMigrationTarget(root, env, requireHistory) {
  const client = pgClient(root, env.MIGRATION_DATABASE_URL);
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT current_database() AS db,current_user AS role,session_user AS login," +
      " current_setting('server_version_num')::int AS version," +
      " (SELECT system_identifier::text FROM pg_control_system()) AS system_id," +
      " pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())) AS owner," +
      " pg_is_in_recovery() AS recovery," +
      " rolsuper AS super,rolinherit AS inherit,rolcreaterole AS createrole," +
      " rolcreatedb AS createdb,rolreplication AS replication," +
      " rolbypassrls AS bypassrls FROM pg_roles WHERE rolname=current_user");
    const found = rows[0];
    if (rows.length !== 1 || found.db !== env.RATING_FEEDBACK_ATTESTED_DATABASE ||
        found.role !== "issue463_p7_migrator" ||
        found.login !== "issue463_p7_migrator" ||
        found.owner !== "issue463_p7_migrator" ||
        found.recovery !== false || found.super !== false ||
        found.inherit !== false || found.createrole !== true ||
        found.createdb !== true || found.replication !== false ||
        found.bypassrls !== false ||
        found.version < 170000 || found.version >= 180000 ||
        found.system_id !== env.RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER) {
      throw new Error("Issue463 wrong connected PG17 migrator or database identity.");
    }
    const dir = join(root, "packages/database/prisma/migrations");
    const expected = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (!requireHistory) {
      const fresh = await client.query(
        "SELECT count(*)::integer AS total FROM pg_tables WHERE schemaname='public'");
      if (fresh.rows[0]?.total !== 0) {
        throw new Error("Issue463 database is not completely fresh.");
      }
      return expected.length;
    }
    const history = await client.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at" +
      " FROM public._prisma_migrations ORDER BY migration_name");
    if (history.rows.length !== expected.length) {
      throw new Error("Issue463 official Prisma migration count differs.");
    }
    for (let i = 0; i < expected.length; i += 1) {
      const name = expected[i];
      const row = history.rows[i];
      const digest = createHash("sha256")
        .update(readFileSync(join(dir, name, "migration.sql"))).digest("hex");
      if (row.migration_name !== name || row.checksum !== digest ||
          !row.finished_at || row.rolled_back_at !== null) {
        throw new Error("Issue463 Prisma ledger/checksum mismatch: " + name);
      }
    }
    return expected.length;
  } finally { await client.end(); }
}
