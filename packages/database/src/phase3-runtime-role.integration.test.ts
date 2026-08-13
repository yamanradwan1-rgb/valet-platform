import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PgError extends Error {
  code?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_005a_role_${suffix}`;
const runtimeRole = `valet_005a_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;
let runtimePool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runDatabaseScript(
  command: string,
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
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
  const migrationUrl = scopedUrl();
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runDatabaseScript(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    migrationUrl,
  );
  await runDatabaseScript(
    process.execPath,
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    runtimeUrl,
  );
  adminPool = new Pool({ connectionString: migrationUrl });
  runtimePool = new Pool({ connectionString: runtimeUrl });
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

describe("DEC-031 runtime KeyCustodyEvent privileges", () => {
  it("allows SELECT/INSERT while denying runtime and PUBLIC mutation", async () => {
    const organizationId = randomUUID();
    const locationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    const slotId = randomUUID();
    const eventId = randomUUID();
    await adminPool.query("BEGIN");
    try {
      await adminPool.query(
        `INSERT INTO organizations (id, name, timezone, updated_at)
         VALUES ($1, 'Runtime organization', 'Asia/Amman', transaction_timestamp())`,
        [organizationId],
      );
      await adminPool.query(
        `INSERT INTO locations
           (id, organization_id, name, code, address_text, timezone, currency, updated_at)
         VALUES ($1, $2, 'Runtime location', $3, 'Address', 'Asia/Amman', 'JOD', transaction_timestamp())`,
        [locationId, organizationId, randomUUID()],
      );
      await adminPool.query(
        `INSERT INTO users (id, email, password_hash, updated_at)
         VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
        [userId, `${userId}@runtime.test`],
      );
      await adminPool.query(
        `INSERT INTO organization_memberships
           (id, organization_id, user_id, role, updated_at)
         VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
        [membershipId, organizationId, userId],
      );
      await adminPool.query(
        `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
         VALUES ($1, $2, 'Runtime vehicle', transaction_timestamp())`,
        [vehicleId, organizationId],
      );
      await adminPool.query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            organization_id, location_id, vehicle_id, state,
            checked_in_by_membership_id, updated_at)
         VALUES ($1, $2, transaction_timestamp() + interval '1 hour', $3, $4,
                 $5, 'AWAITING_PARKING', $6, transaction_timestamp())`,
        [
          sessionId,
          randomUUID(),
          organizationId,
          locationId,
          vehicleId,
          membershipId,
        ],
      );
      await adminPool.query(
        `INSERT INTO key_slots (id, organization_id, location_id, code, updated_at)
         VALUES ($1, $2, $3, $4, transaction_timestamp())`,
        [slotId, organizationId, locationId, randomUUID()],
      );
      await adminPool.query("COMMIT");
    } catch (error) {
      await adminPool.query("ROLLBACK");
      throw error;
    }

    await runtimePool.query(
      `INSERT INTO key_custody_events
         (id, organization_id, location_id, valet_session_id, key_slot_id,
          actor_membership_id, event_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'SLOT_ASSIGNED')`,
      [eventId, organizationId, locationId, sessionId, slotId, membershipId],
    );
    await expect(
      runtimePool.query(`SELECT id FROM key_custody_events WHERE id = $1`, [
        eventId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectDenied(
      runtimePool.query(
        `UPDATE key_custody_events SET occurred_at = occurred_at WHERE id = $1`,
        [eventId],
      ),
    );
    await expectDenied(
      runtimePool.query(`DELETE FROM key_custody_events WHERE id = $1`, [
        eventId,
      ]),
    );
    await expectDenied(runtimePool.query(`TRUNCATE key_custody_events`));
    const publicMutation = await adminPool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'PUBLIC' AND table_name = 'key_custody_events'
         AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`,
    );
    expect(publicMutation.rowCount).toBe(0);
  });
});
