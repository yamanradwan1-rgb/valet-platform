import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { preflightIssue416Target } from "./target-preflight.mjs";
import { TARGET } from "./target-contract.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Client } = require("pg");

async function queryFrom(key, query, params = []) {
  await preflightIssue416Target(); // Gate *every* access on verified target.
  const client = new Client({
    connectionString: process.env[key], connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    return await client.query(query, params);
  } finally {
    await client.end().catch(() => {});
  }
}

describe("Issue416 isolated PG17 non-mutating role negatives", () => {
  it("attests the exact owned, loopback PostgreSQL 17 container", async () => {
    const attested = await preflightIssue416Target();
    expect(attested.containerId).toMatch(/^[a-f0-9]{64}$/);
    expect(attested.volume).toBe(TARGET.volume);
  });

  it.each(["TEST_DATABASE_URL", "DATABASE_URL"])(
    "%s cannot create database/schema or assume the owner role", async (key) => {
      const role = TARGET.roles[key][0];
      const result = await queryFrom(key, `
        SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS db_create,
               has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
               pg_has_role(current_user, $1::name, 'MEMBER') AS owner_member`,
      [TARGET.owner]);
      expect(result.rows).toEqual([{
        db_create: false, schema_create: false, owner_member: false,
      }]);
      expect(role).not.toBe(TARGET.owner);
    },
  );

  it("migration role is limited to the synthetic fixture", async () => {
    const result = await queryFrom("MIGRATION_DATABASE_URL", `
      SELECT current_user AS actor,
             has_database_privilege(current_user, current_database(), 'CREATE') AS db_create,
             pg_has_role(current_user, $1::name, 'MEMBER') AS owner_member`,
    [TARGET.owner]);
    expect(result.rows).toEqual([{
      actor: TARGET.roles.MIGRATION_DATABASE_URL[0],
      db_create: true,
      owner_member: false,
    }]);
  });
});
