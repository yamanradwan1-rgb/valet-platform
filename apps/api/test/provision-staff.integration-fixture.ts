import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll } from "vitest";

import {
  hashProvisioningPassword,
  persistProvisionedStaff,
  type ProvisioningArguments,
} from "../tools/provision-staff";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_004s_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export let passwordHash: string;
export let pool: Pool;
let testDatabaseUrl: string;
const organizationIds = new Set<string>();
const userIds = new Set<string>();

async function migrateDatabase(): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath === undefined ? pnpmExecutable : process.execPath;
  const args =
    npmExecPath === undefined
      ? ["--filter", "@valet/database", "migrate:deploy"]
      : [npmExecPath, "--filter", "@valet/database", "migrate:deploy"];
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "test",
      },
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Migration failed (${String(code)}).`));
    });
  });
}

export async function scope(
  options: {
    locationStatus?: "ACTIVE" | "INACTIVE";
    organizationStatus?: "ACTIVE" | "INACTIVE";
  } = {},
): Promise<{ locationId: string; organizationId: string }> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  organizationIds.add(organizationId);
  await pool.query(
    `INSERT INTO organizations
       (id, name, status, timezone, check_in_photos_required, updated_at)
     VALUES ($1, $2, $3, 'Asia/Amman', false, transaction_timestamp())`,
    [
      organizationId,
      `VAL-004S ${organizationId}`,
      options.organizationStatus ?? "ACTIVE",
    ],
  );
  await pool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Provisioning Location', $3, 'Test address',
             'Asia/Amman', 'JOD', $4, transaction_timestamp())`,
    [
      locationId,
      organizationId,
      locationId,
      options.locationStatus ?? "ACTIVE",
    ],
  );
  return { locationId, organizationId };
}

export function input(
  organizationId: string,
  locationIds: readonly string[],
  overrides: Partial<ProvisioningArguments> = {},
): ProvisioningArguments {
  return {
    auditLocationId: locationIds[0] ?? randomUUID(),
    email: ` Staff.${randomUUID()}@Example.COM `,
    locationIds: [...locationIds].sort(),
    operatorRef: "CHANGE-004R",
    organizationId,
    passwordStdin: true,
    reason: "Controlled initial staff provisioning",
    role: "VALET_EMPLOYEE",
    ...overrides,
  };
}

export async function persist(
  provisioning: ProvisioningArguments,
  email = provisioning.email.trim().toLowerCase(),
) {
  const client = await pool.connect();
  try {
    const result = await persistProvisionedStaff(
      client as unknown as never,
      provisioning,
      email,
      passwordHash,
    );
    userIds.add(result.userId);
    return result;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  const bootstrap = new Pool({ connectionString: databaseUrl });
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.search = "";
  testDatabaseUrl = parsed.toString();
  await migrateDatabase();
  pool = new Pool({ connectionString: testDatabaseUrl });
  passwordHash = await hashProvisioningPassword("fifteen-codepoints");
}, 120_000);

afterEach(async () => {
  for (const organizationId of organizationIds) {
    const memberships = await pool.query<{ user_id: string }>(
      "SELECT user_id::text FROM organization_memberships WHERE organization_id = $1",
      [organizationId],
    );
    memberships.rows.forEach((row) => userIds.add(row.user_id));
    await pool.query("DELETE FROM audit_events WHERE organization_id = $1", [
      organizationId,
    ]);
    await pool.query(
      "DELETE FROM membership_location_access WHERE organization_id = $1",
      [organizationId],
    );
    await pool.query(
      "DELETE FROM organization_memberships WHERE organization_id = $1",
      [organizationId],
    );
    await pool.query("DELETE FROM locations WHERE organization_id = $1", [
      organizationId,
    ]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [
      organizationId,
    ]);
  }
  for (const userId of userIds) {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  }
  organizationIds.clear();
  userIds.clear();
});

afterAll(async () => {
  await pool.end();
  const bootstrap = new Pool({ connectionString: databaseUrl });
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

export function trackUser(userId: string): void {
  userIds.add(userId);
}
