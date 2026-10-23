import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";

import {
  managementPhotoLockOwner,
  managementPhotoLockSignature,
  photoReadTables,
} from "./condition-photo-privilege-policy.mjs";
import { provisionManagementPhotoLockOwner } from "./condition-photo-management-lock-owner.mjs";

const { Client } = pg;
const url = process.env.W21_ROLE_RACE_DATABASE_URL;
if (!url || process.env.W21_ROLE_RACE_PRIVATE_OWNER !== "w21-isolated-pg17") {
  throw new Error("W21 requires an explicitly owned, disposable PostgreSQL 17 cluster.");
}

async function formatted(client, format, values) {
  const placeholders = values.map((_, i) => `$${i + 2}::text`).join(",");
  const result = await client.query(
    `SELECT format($1,${placeholders}) AS statement`,
    [format, ...values],
  );
  await client.query(result.rows[0].statement);
}

const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function prepareDatabase(name) {
  const connection = new URL(url);
  connection.pathname = `/${name}`;
  const client = new Client({ connectionString: connection.toString() });
  await client.connect();
  try {
    for (const [index, table] of photoReadTables.entries()) {
      const key = index < 2 ? "id" : "vehicle_photo_id";
      await client.query(`CREATE TABLE ${table} (${key} uuid PRIMARY KEY)`);
    }
    await client.query(
      `CREATE FUNCTION ${managementPhotoLockSignature} RETURNS boolean
       LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
       AS 'SELECT true'`,
    );
    await client.query(
      `REVOKE ALL ON FUNCTION ${managementPhotoLockSignature} FROM PUBLIC`,
    );
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

function barrierForTwoRoleReads() {
  let arrivals = 0;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  return (client) => ({
    query: async (...args) => {
      const result = await client.query(...args);
      if (typeof args[0] === "string" &&
          args[0].includes("FROM pg_roles WHERE rolname=$1") &&
          result.rowCount === 0 && arrivals < 2) {
        arrivals += 1;
        if (arrivals === 2) release();
        await ready;
      }
      return result;
    },
  });
}

test("two databases safely provision one shared strict photo-lock role", { timeout: 30000 }, async () => {
  const admin = new Client({ connectionString: url });
  await admin.connect();
  const names = ["a", "b"].map(
    (part) => `w21_photo_race_${process.pid}_${part}`,
  );
  const createdNames = [];
  let ownsRole = false;
  const clients = [];
  try {
    const existing = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1", [managementPhotoLockOwner],
    );
    assert.equal(existing.rowCount, 0, "dedicated cluster must start without target role");
    ownsRole = true;
    for (const name of names) {
      await admin.query(`CREATE DATABASE ${identifier(name)}`);
      createdNames.push(name);
      clients.push(await prepareDatabase(name));
    }

    for (const client of clients) await client.query("BEGIN");
    const waitForBoth = barrierForTwoRoleReads();
    const results = await Promise.allSettled(clients.map(async (client) => {
      await provisionManagementPhotoLockOwner(waitForBoth(client), formatted, "w21_runtime");
      await client.query("COMMIT");
    }));
    for (const [index, result] of results.entries()) {
      assert.equal(result.status, "fulfilled",
        `provisioner ${index + 1} failed: ${result.reason?.message}`);
    }

    const role = await admin.query(
      `SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,
              rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1`,
      [managementPhotoLockOwner],
    );
    assert.equal(role.rowCount, 1);
    assert.ok(Object.values(role.rows[0]).every((flag) => flag === false));
    const members = await admin.query(
      `SELECT 1 FROM pg_auth_members m JOIN pg_roles r
         ON m.member=r.oid OR m.roleid=r.oid WHERE r.rolname=$1`,
      [managementPhotoLockOwner],
    );
    assert.equal(members.rowCount, 0);

    await admin.query(`ALTER ROLE ${identifier(managementPhotoLockOwner)} LOGIN`);
    try {
      await clients[0].query("BEGIN");
      await assert.rejects(
        provisionManagementPhotoLockOwner(clients[0], formatted, "w21_runtime"),
        /privileged role attributes/,
      );
      await clients[0].query("ROLLBACK");
    } finally {
      await admin.query(`ALTER ROLE ${identifier(managementPhotoLockOwner)} NOLOGIN`);
    }
    await admin.query(`GRANT pg_read_all_data TO ${identifier(managementPhotoLockOwner)}`);
    try {
      await clients[0].query("BEGIN");
      await assert.rejects(
        provisionManagementPhotoLockOwner(clients[0], formatted, "w21_runtime"),
        /inherits roles/,
      );
      await clients[0].query("ROLLBACK");
    } finally {
      await admin.query(`REVOKE pg_read_all_data FROM ${identifier(managementPhotoLockOwner)}`);
    }
  } finally {
    for (const client of clients) {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
    for (const name of createdNames) {
      await admin.query(`DROP DATABASE IF EXISTS ${identifier(name)}`);
    }
    if (ownsRole) {
      await admin.query(`DROP ROLE IF EXISTS ${identifier(managementPhotoLockOwner)}`);
    }
    await admin.end();
  }
});
