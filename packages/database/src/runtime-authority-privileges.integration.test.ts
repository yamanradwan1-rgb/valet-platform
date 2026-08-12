import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  authorityColumnPrivileges,
  runtimeLockQueries,
} from "./runtime-authority-privilege-cases";

interface PgError extends Error {
  code?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_sec002_${suffix}`;
const runtimeRole = `valet_sec002_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;
let runtimePool: Pool;
let organizationId: string;
let membershipId: string;
let userId: string;
let locationId: string;
let keySlotId: string;
let parkingSpotId: string;
let parkingZoneId: string;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runScript(args: string[], runtimeUrl?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: scopedUrl(),
        NODE_ENV: "test",
      },
    });
    let output = "";
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database script failed: ${output}`)),
    );
  });
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PgError).code).toBe("42501");
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runScript([prismaCli, "migrate", "deploy"]);
  await runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  await runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminPool = new Pool({ connectionString: scopedUrl() });
  runtimePool = new Pool({ connectionString: runtimeUrl });
  organizationId = randomUUID();
  userId = randomUUID();
  membershipId = randomUUID();
  locationId = randomUUID();
  keySlotId = randomUUID();
  parkingSpotId = randomUUID();
  parkingZoneId = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'SEC-002 organization', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency, updated_at)
     VALUES ($1, $2, 'SEC-002 location', 'SEC002', 'Address', 'Asia/Amman', 'JOD', transaction_timestamp())`,
    [locationId, organizationId],
  );
  await adminPool.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
    [userId, `${userId}@sec002.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [organizationId, membershipId, locationId],
  );
  await adminPool.query(
    `INSERT INTO parking_zones (id, organization_id, location_id, code, label, updated_at)
     VALUES ($1, $2, $3, 'SEC002-ZONE', 'SEC-002 zone', transaction_timestamp())`,
    [parkingZoneId, organizationId, locationId],
  );
  await adminPool.query(
    `INSERT INTO parking_spots (id, organization_id, location_id, parking_zone_id, code, label, updated_at)
     VALUES ($1, $2, $3, $4, 'SEC002-SPOT', 'SEC-002 spot', transaction_timestamp())`,
    [parkingSpotId, organizationId, locationId, parkingZoneId],
  );
  await adminPool.query(
    `INSERT INTO key_slots (id, organization_id, location_id, code, updated_at)
     VALUES ($1, $2, $3, 'SEC002-KEY', transaction_timestamp())`,
    [keySlotId, organizationId, locationId],
  );
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("SEC-002 runtime authority privileges", () => {
  it("allows the accepted authorization and resource row locks", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      const ids = {
        keySlotId,
        locationId,
        membershipId,
        organizationId,
        parkingSpotId,
        parkingZoneId,
        userId,
      };
      for (const [query, parameters] of runtimeLockQueries(ids)) {
        await expect(client.query(query, parameters)).resolves.toMatchObject({
          rowCount: 1,
        });
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("grants only the reviewed bookkeeping columns for row locking", async () => {
    for (const [table, column, allowed] of authorityColumnPrivileges) {
      const result = await adminPool.query<{ allowed: boolean }>(
        `SELECT has_column_privilege($1, $2, $3, 'UPDATE') AS allowed`,
        [runtimeRole, table, column],
      );
      expect(result.rows[0]?.allowed).toBe(allowed);
    }
    await expect(
      runtimePool.query(
        `UPDATE users SET last_login_at = transaction_timestamp() WHERE id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("denies all direct staff identity and authority writes", async () => {
    const attempts = [
      () =>
        runtimePool.query(
          `INSERT INTO users (id, email, password_hash, updated_at) VALUES ($1, $2, 'x', transaction_timestamp())`,
          [randomUUID(), `${randomUUID()}@forbidden.test`],
        ),
      () =>
        runtimePool.query(
          `UPDATE users SET password_hash = 'forbidden' WHERE id = $1`,
          [userId],
        ),
      () =>
        runtimePool.query(
          `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
          [userId],
        ),
      () =>
        runtimePool.query(
          `INSERT INTO organization_memberships (id, organization_id, user_id, role, updated_at) VALUES ($1, $2, $3, 'ORG_ADMIN', transaction_timestamp())`,
          [randomUUID(), organizationId, userId],
        ),
      () =>
        runtimePool.query(
          `UPDATE organization_memberships SET role = 'ORG_ADMIN' WHERE id = $1`,
          [membershipId],
        ),
      () =>
        runtimePool.query(
          `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
          [membershipId],
        ),
      () =>
        runtimePool.query(
          `INSERT INTO membership_location_access (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
          [organizationId, membershipId, locationId],
        ),
      () =>
        runtimePool.query(
          `UPDATE organization_memberships SET organization_id = $1 WHERE id = $2`,
          [randomUUID(), membershipId],
        ),
      () =>
        runtimePool.query(
          `UPDATE organization_memberships SET user_id = $1 WHERE id = $2`,
          [randomUUID(), membershipId],
        ),
      () =>
        runtimePool.query(
          `UPDATE membership_location_access SET organization_id = $1 WHERE membership_id = $2`,
          [randomUUID(), membershipId],
        ),
      () =>
        runtimePool.query(
          `UPDATE membership_location_access SET membership_id = $1 WHERE membership_id = $2`,
          [randomUUID(), membershipId],
        ),
      () =>
        runtimePool.query(
          `UPDATE membership_location_access SET location_id = $1 WHERE membership_id = $2`,
          [randomUUID(), membershipId],
        ),
      () =>
        runtimePool.query(
          `DELETE FROM membership_location_access WHERE membership_id = $1`,
          [membershipId],
        ),
      () =>
        runtimePool.query(
          `TRUNCATE users, organization_memberships, membership_location_access`,
        ),
    ];
    for (const attempt of attempts) await expectDenied(attempt());
  });

  it("reconciles stale grants and keeps future migration-owned tables default-deny", async () => {
    await adminPool.query(`GRANT UPDATE ON users TO "${runtimeRole}"`);
    await runScript(
      ["scripts/provision-runtime-role.mjs"],
      scopedUrl(runtimeRole, runtimePassword),
    );
    await expectDenied(
      runtimePool.query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [
        userId,
      ]),
    );
    await adminPool.query(
      `CREATE TABLE sec002_future_table (id UUID PRIMARY KEY)`,
    );
    const privileges = await adminPool.query<{
      can_insert: boolean;
      can_update: boolean;
    }>(
      `SELECT has_table_privilege($1, 'sec002_future_table', 'INSERT') AS can_insert,
              has_table_privilege($1, 'sec002_future_table', 'UPDATE') AS can_update`,
      [runtimeRole],
    );
    expect(privileges.rows[0]).toEqual({
      can_insert: false,
      can_update: false,
    });
  });
});
