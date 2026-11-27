import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";

import {
  attestIssue463SharedRoleInventory,
} from "./issue463-shared-role-attestation.mjs";

const requireDatabase = createRequire(new URL(
  "../../packages/database/package.json", import.meta.url));
const { Client } = requireDatabase("pg");
const sha256 = (source) => createHash("sha256").update(source).digest("hex");

export function migrationInventory(sourceRoot) {
  const root = join(sourceRoot, "packages/database/prisma/migrations");
  return new Map(readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(join(root, entry.name))
      .includes("migration.sql"))
    .map((entry) => [
      entry.name,
      sha256(readFileSync(join(root, entry.name, "migration.sql"))),
    ]));
}

export async function attestBeforeAndAfter(identity, database, sourceRoot, after) {
  const client = new Client({
    host: "127.0.0.1",
    port: identity.port,
    user: "valet",
    password: identity.migratorSecret,
    database,
    connectionTimeoutMillis: 7000,
    query_timeout: 30_000,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT current_setting('server_version_num') AS version,
         current_user AS principal, current_database() AS database,
         (SELECT r.rolname FROM pg_catalog.pg_database d
          JOIN pg_catalog.pg_roles r ON r.oid=d.datdba
          WHERE d.datname=current_database()) AS owner`,
    );
    const row = rows[0];
    if (!row || Number(row.version) < 170000 ||
        Number(row.version) >= 180000 ||
        row.principal !== "valet" || row.owner !== "valet" ||
        row.database !== database || !/^[0-9]+$/.test(identity.systemId))
      throw new Error("Exact dedicated PG17 migrator/database identity rejected.");
    await attestIssue463SharedRoleInventory(
      (sql, parameters) => client.query(sql, parameters));
    const registered = await client.query(
      `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`,
    );
    if (!after) {
      if (registered.rows[0]?.present !== false)
        throw new Error("Fresh proof DB has historical migration state.");
      return { systemId: identity.systemId, migrationCount: 0 };
    }
    if (!registered.rows[0]?.present)
      throw new Error("Official migrations did not create tracking table.");
    const result = await client.query(
      `SELECT migration_name,checksum,finished_at,rolled_back_at,
              applied_steps_count
         FROM public._prisma_migrations ORDER BY migration_name`,
    );
    const expected = migrationInventory(sourceRoot);
    if (expected.size < 150 || result.rows.length !== expected.size)
      throw new Error(
        `Migration inventory mismatch: expected ${expected.size}, observed ${result.rows.length}`,
      );
    for (const receipt of result.rows) {
      if (!expected.has(receipt.migration_name) ||
          receipt.checksum !== expected.get(receipt.migration_name) ||
          !receipt.finished_at || receipt.rolled_back_at)
        throw new Error(`Unverified migration receipt ${receipt.migration_name}`);
    }
    for (const marker of [
      "20261127000100_issue463_guest_rating_comments_p2",
      "20261127000200_issue463_management_feedback_reader_p5",
    ]) {
      if (!expected.has(marker))
        throw new Error(`Issue463 migration ${marker} missing from inventory`);
    }
    return {
      systemId: identity.systemId,
      migrationCount: result.rows.length,
      p2Checksum: expected.get("20261127000100_issue463_guest_rating_comments_p2"),
    };
  } finally {
    await client.end();
  }
}
