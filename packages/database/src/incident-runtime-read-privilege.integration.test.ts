import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_009c_incident_${suffix}`;
const runtimeRole = `valet_009c_incident_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;

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
): Promise<void> {
  execFileSync(command, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();

  const migrationUrl = scopedUrl();
  await runDatabaseScript(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    migrationUrl,
  );
  await runDatabaseScript(
    process.execPath,
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    scopedUrl(runtimeRole, runtimePassword),
  );
  adminPool = new Pool({ connectionString: migrationUrl });

  const organizationId = randomUUID();
  const locationId = randomUUID();
  const sessionId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'DEC-059 tenant', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'DEC-059 location', $3, 'Address', 'Asia/Amman', 'JOD',
             'ACTIVE', transaction_timestamp())`,
    [locationId, organizationId, randomUUID()],
  );
  await adminPool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
             transaction_timestamp())`,
    [userId, `${userId}@dec-059.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, 'LOCATION_MANAGER', 'ACTIVE',
             transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  const vehicleId = randomUUID();
  await adminPool.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor,
        updated_at) VALUES ($1, $2, 'Probe vehicle', transaction_timestamp())`,
    [vehicleId, organizationId],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4, $5,
             'PARKED', $6, transaction_timestamp())`,
    [sessionId, randomUUID(), organizationId, locationId, vehicleId, membershipId],
  );
  await adminPool.query(
    `INSERT INTO incidents (id, organization_id, location_id,
        valet_session_id, status, severity, type, description,
        reported_by_membership_id, created_at)
     VALUES ($1, $2, $3, $4, 'OPEN', 'LOW', 'PROBE', 'Incident read probe',
             $5, transaction_timestamp())`,
    [randomUUID(), organizationId, locationId, sessionId, membershipId],
  );
}, 120_000);

afterAll(async () => {
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("DEC-059 runtime incident read authority", () => {
  it("grants bounded SELECT while denying every write privilege", async () => {
    const runtime = new Client({
      connectionString: scopedUrl(runtimeRole, runtimePassword),
    });
    await runtime.connect();
    try {
      const reads = await runtime.query<{
        count: number;
        first_status: string;
      }>(
        `SELECT count(*)::int AS count,
                min(status::text) AS "firstStatus"
         FROM (
           SELECT status FROM incidents
           WHERE status IN ('OPEN', 'INVESTIGATING')
           ORDER BY created_at DESC
           LIMIT 50
         ) AS bounded`,
      );
      expect(reads.rows[0]).toEqual({ count: 1, firstStatus: "OPEN" });

      for (const statement of [
        `INSERT INTO incidents (id, organization_id, location_id,
            valet_session_id, status, severity, type, description,
            reported_by_membership_id, created_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
            gen_random_uuid(), 'OPEN', 'LOW', 'X', 'x', gen_random_uuid(),
            transaction_timestamp())`,
        `UPDATE incidents SET severity = 'CRITICAL'`,
        `DELETE FROM incidents`,
      ]) {
        await expect(runtime.query(statement)).rejects.toMatchObject({
          code: "42501",
        });
      }
    } finally {
      await runtime.end();
    }
    const matrix = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1, 'public.incidents', 'SELECT')
         AS can_select,
              has_table_privilege($1, 'public.incidents', 'INSERT')
         AS can_insert,
              has_table_privilege($1, 'public.incidents', 'UPDATE')
         AS can_update,
              has_table_privilege($1, 'public.incidents', 'DELETE')
         AS can_delete,
              has_table_privilege($1, 'public.incidents', 'TRUNCATE')
         AS can_truncate,
              has_table_privilege($1, 'public.incidents', 'REFERENCES')
         AS can_references,
              has_table_privilege($1, 'public.incidents', 'TRIGGER')
         AS can_trigger`,
      [runtimeRole],
    );
    expect(matrix.rows[0]).toEqual({
      can_delete: false,
      can_insert: false,
      can_references: false,
      can_select: true,
      can_trigger: false,
      can_truncate: false,
      can_update: false,
    });
    const publicGrant = await adminPool.query<{ grantable: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM aclexplode(
           COALESCE(c.relacl, acldefault('r', c.relowner))
         ) AS privilege
         WHERE privilege.grantee = 0
           AND privilege.privilege_type IN
               ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
       ) AS grantable
       FROM pg_class AS c
       WHERE c.oid = 'public.incidents'::regclass`,
    );
    expect(publicGrant.rows[0]).toEqual({ grantable: false });
  });
});
