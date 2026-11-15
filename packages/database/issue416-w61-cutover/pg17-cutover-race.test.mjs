import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";

import { assertOptionCProvisioningIsLegacy } from "../scripts/option-c-runtime-provision-guard.mjs";
import {
  lockOptionCBoundary,
  promoteOptionCBoundary,
} from "../scripts/option-c-protected-cutover-state.mjs";

const { Client } = pg;
const enabled = process.env.ISSUE416_W61_PG17_TEST === "1";
const ownerUrl = process.env.ISSUE416_W61_OWNER_URL;
const migratorUrl = process.env.ISSUE416_W61_MIGRATOR_URL;
const ownerRole = "issue416_w61_owner";
const migratorRole = "issue416_w61_migrator";

function attestUrl(raw, role) {
  if (!raw) throw new Error("Missing isolated W61 PG17 URL.");
  const url = new URL(raw);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "45561");
  assert.equal(url.pathname, "/issue416_w61_cutover");
  assert.equal(url.username, role);
}

async function prepareFixture(owner) {
  await owner.query(
    `CREATE ROLE issue416_w61_migrator WITH LOGIN PASSWORD 'synthetic-migrator-secret'
       NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  await owner.query("GRANT CREATE ON DATABASE issue416_w61_cutover TO issue416_w61_migrator");
  const migrator = new Client({ connectionString: migratorUrl });
  await migrator.connect();
  try {
    await migrator.query(
      `CREATE ROLE vap1_proof_owner NOLOGIN NOINHERIT NOSUPERUSER
         NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await migrator.query(
      "GRANT vap1_proof_owner TO issue416_w61_migrator WITH INHERIT FALSE, SET TRUE",
    );
    await migrator.query("CREATE SCHEMA auth_proof_private AUTHORIZATION vap1_proof_owner");
    await migrator.query("SET ROLE vap1_proof_owner");
    await migrator.query(
      `CREATE TABLE auth_proof_private.option_c_launch_boundary (
         singleton boolean PRIMARY KEY DEFAULT TRUE CHECK(singleton),
         phase text NOT NULL CHECK(phase IN ('LEGACY','PROTECTED')),
         promoted_at timestamptz(6),
         CHECK((phase='LEGACY' AND promoted_at IS NULL) OR
               (phase='PROTECTED' AND promoted_at IS NOT NULL)))`,
    );
    await migrator.query(
      "INSERT INTO auth_proof_private.option_c_launch_boundary(singleton,phase) VALUES(TRUE,'LEGACY')",
    );
    await migrator.query("REVOKE ALL ON TABLE auth_proof_private.option_c_launch_boundary FROM PUBLIC");
    await migrator.query("GRANT USAGE ON SCHEMA auth_proof_private TO issue416_w61_migrator");
    await migrator.query("RESET ROLE");
  } finally {
    await migrator.end();
  }
  await owner.query("REVOKE CREATE ON DATABASE issue416_w61_cutover FROM issue416_w61_migrator");
}

async function waitForRowLock(owner, pid) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await owner.query(
      `SELECT wait_event_type,wait_event FROM pg_catalog.pg_stat_activity WHERE pid=$1`, [pid],
    );
    if (result.rows[0]?.wait_event_type === "Lock") return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Legacy provisioner did not block on the cutover row lock.");
}

test("PG17 cutover row lock fences a racing legacy provisioner until PROTECTED commit", {
  skip: !enabled,
}, async () => {
  attestUrl(ownerUrl, ownerRole);
  attestUrl(migratorUrl, migratorRole);
  const owner = new Client({ connectionString: ownerUrl });
  const cutover = new Client({ connectionString: migratorUrl });
  const legacy = new Client({ connectionString: migratorUrl });
  await owner.connect();
  try {
    const server = await owner.query(
      "SELECT current_setting('server_version_num')::integer AS version, pg_is_in_recovery() AS replica",
    );
    assert(server.rows[0].version >= 170000 && server.rows[0].version < 180000);
    assert.equal(server.rows[0].replica, false);
    await prepareFixture(owner);
    await cutover.connect();
    await legacy.connect();

    await cutover.query("BEGIN");
    const state = await lockOptionCBoundary(cutover, migratorRole);
    assert.equal(state.phase, "LEGACY");
    const pid = Number((await legacy.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await legacy.query("BEGIN");
    let guardSettled = false;
    const guard = assertOptionCProvisioningIsLegacy(legacy)
      .then(() => { guardSettled = true; })
      .catch((error) => { guardSettled = true; throw error; });
    const wait = await waitForRowLock(owner, pid);
    assert.equal(wait.wait_event_type, "Lock");
    assert.equal(guardSettled, false);

    assert.equal(await promoteOptionCBoundary(cutover, migratorRole, state), true);
    await cutover.query("COMMIT");
    await assert.rejects(guard, /Option C PROTECTED/);
    await legacy.query("ROLLBACK");

    const phase = await owner.query(
      "SELECT phase,promoted_at IS NOT NULL AS promoted FROM auth_proof_private.option_c_launch_boundary",
    );
    assert.deepEqual(phase.rows, [{ phase: "PROTECTED", promoted: true }]);
    await legacy.query("BEGIN");
    await assert.rejects(assertOptionCProvisioningIsLegacy(legacy), /Option C PROTECTED/);
    await legacy.query("ROLLBACK");
  } finally {
    await Promise.allSettled([owner.end(), cutover.end(), legacy.end()]);
  }
});
