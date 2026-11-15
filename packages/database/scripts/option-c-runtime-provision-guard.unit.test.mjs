import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

import { assertOptionCProvisioningIsLegacy } from "./option-c-runtime-provision-guard.mjs";

function fixture(
  phase = "LEGACY",
  boundary = "auth_proof_private.option_c_launch_boundary",
) {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("pg_catalog.to_regclass(")) {
        return { rowCount: 1, rows: [{ boundary }] };
      }
      if (sql === "SET LOCAL ROLE vap1_proof_owner" || sql === "RESET ROLE") {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("option_c_launch_boundary WHERE singleton FOR SHARE")) {
        return { rowCount: 1, rows: [{ phase }] };
      }
      throw new Error("UNEXPECTED_SQL");
    },
  };
  return { client, queries };
}

test("pre-migration legacy installation remains eligible, without SET ROLE", async () => {
  const { client, queries } = fixture("LEGACY", null);
  await assert.doesNotReject(assertOptionCProvisioningIsLegacy(client));
  assert.equal(queries.length, 1);
});

test("migration-created LEGACY holds private row lock and restores role", async () => {
  const { client, queries } = fixture();
  await assert.doesNotReject(assertOptionCProvisioningIsLegacy(client));
  assert.deepEqual(queries.slice(1), [
    "SET LOCAL ROLE vap1_proof_owner",
    "SELECT phase FROM auth_proof_private.option_c_launch_boundary WHERE singleton FOR SHARE",
    "RESET ROLE",
  ]);
});

test("PROTECTED blocks legacy provisioning without consulting environment flags", async () => {
  const { client, queries } = fixture("PROTECTED");
  await assert.rejects(
    assertOptionCProvisioningIsLegacy(client),
    /Option C PROTECTED/,
  );
  assert.equal(queries.at(-1), "RESET ROLE");
});

test("a broken privileged boundary read fails closed and always resets role", async () => {
  const { client, queries } = fixture();
  const query = client.query;
  client.query = async (sql) => {
    if (sql.includes("WHERE singleton FOR SHARE")) {
      queries.push(sql);
      throw new Error("SIMULATED_PG_PERMISSION_FAILURE");
    }
    return query(sql);
  };
  await assert.rejects(
    assertOptionCProvisioningIsLegacy(client),
    /SIMULATED_PG_PERMISSION_FAILURE/,
  );
  assert.equal(queries.at(-1), "RESET ROLE");
});

test("source guard runs before the first DDL/GRANT in ordinary provisioning", () => {
  const source = readFileSync(
    new URL("./provision-runtime-role.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.indexOf("await assertOptionCProvisioningIsLegacy(client)") <
      source.indexOf("const existingRole = await client.query("),
  );
  assert.ok(
    source.includes("await assertLegacyRuntimeProvisioningAllowed(client)"),
  );
});

test("forward-only migration keeps PROTECTED immutable and never enables reset", () => {
  const source = readFileSync(
    new URL(
      "../prisma/migrations/20261115235000_option_c_launch_writer_boundary/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /OLD\.phase = 'PROTECTED'/);
  assert.match(source, /SET ROLE vap1_proof_owner/);
  assert.match(
    source,
    /REVOKE ALL ON TABLE auth_proof_private\.option_c_launch_boundary FROM PUBLIC/,
  );
  assert.doesNotMatch(source, /password.reset|staff_password_reset|ENABLE/);
});
