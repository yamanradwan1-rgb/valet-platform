import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { runOutboundRoleSmoke } from "./outbound-role-smoke.mjs";
import { runOutboundConstraintSmoke } from "./outbound-constraint-smoke.mjs";
import { runOutboundRecoverySmoke } from "./outbound-recovery-smoke.mjs";
import { runOutboundLateOverrideSmoke } from "./outbound-late-override-smoke.mjs";

const baseUrl = process.env.TEST_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const address = new URL(baseUrl);
if (!["localhost","127.0.0.1"].includes(address.hostname)) {
  throw new Error("Outbound smoke requires a local disposable PostgreSQL server.");
}
const database = `outbound_w1_${randomUUID().replaceAll("-", "")}`;
const target = new URL(baseUrl);
target.pathname = `/${database}`;
const bootstrap = new pg.Client({ connectionString: baseUrl });
let created = false;
const roles = [];

await bootstrap.connect();
try {
  await bootstrap.query(`CREATE DATABASE "${database}"`);
  created = true;
  const client = new pg.Client({ connectionString: target.toString() });
  await client.connect();
  try {
    const root = new URL("../prisma/migrations/", import.meta.url);
    const folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    let count = 0;
    for (const folder of folders) {
      const sql = await readFile(new URL(`${folder}/migration.sql`, root), "utf8");
      try {
        await client.query(sql);
        count++;
      } catch (error) {
        throw new Error(`Migration ${folder} failed: ${error.message}`, { cause: error });
      }
    }
    const countResult = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'outbound_%'",
    );
    const flags = await client.query(
      "SELECT environment,issue_enabled,send_enabled FROM outbound_messaging_control ORDER BY environment",
    );
    if (countResult.rows[0].count !== 12 || flags.rows.length !== 2
      || flags.rows.some((item) => item.issue_enabled || item.send_enabled)) {
      throw new Error("Outbound migration schema/control invariant mismatch.");
    }
    await runOutboundRoleSmoke(client, database, roles);
    const fixture=await runOutboundConstraintSmoke(client);
    await runOutboundLateOverrideSmoke(client,fixture);
    await runOutboundRecoverySmoke(client,fixture);
    console.log(`PASS: ${count} pristine migrations on disposable PG; 12 outbound tables; control OFF/OFF.`);
  } finally {
    await client.end();
  }
} finally {
  if (created) await bootstrap.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  for (const role of roles.reverse()) {
    await bootstrap.query(`DROP ROLE IF EXISTS "${role}"`);
  }
  await bootstrap.end();
}
