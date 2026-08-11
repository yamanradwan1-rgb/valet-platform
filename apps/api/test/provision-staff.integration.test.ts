import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  hashProvisioningPassword,
  persistProvisionedStaff,
  type ProvisioningArguments,
} from "../tools/provision-staff";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_004r_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let passwordHash: string;
let pool: Pool;
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

async function scope(
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
      `VAL-004R ${organizationId}`,
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

function input(
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

async function persist(
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

describe("controlled staff provisioning persistence", () => {
  it("atomically creates normalized User, membership, exact access, and safe audit", async () => {
    const first = await scope();
    const secondLocationId = randomUUID();
    await pool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, updated_at)
       VALUES ($1, $2, 'Second Location', $3, 'Test address', 'Asia/Amman',
               'JOD', 'ACTIVE', transaction_timestamp())`,
      [secondLocationId, first.organizationId, secondLocationId],
    );
    const provisioning = input(
      first.organizationId,
      [secondLocationId, first.locationId],
      { auditLocationId: secondLocationId, role: "VALET_SUPERVISOR" },
    );
    const normalizedEmail = provisioning.email.trim().toLowerCase();
    const result = await persist(provisioning, normalizedEmail);

    const user = await pool.query<{
      email: string;
      password_hash: string;
      status: string;
    }>("SELECT email, password_hash, status::text FROM users WHERE id = $1", [
      result.userId,
    ]);
    expect(user.rows[0]).toEqual({
      email: normalizedEmail,
      password_hash: passwordHash,
      status: "ACTIVE",
    });
    const membership = await pool.query<{ role: string; status: string }>(
      `SELECT role::text, status::text FROM organization_memberships
       WHERE id = $1`,
      [result.membershipId],
    );
    expect(membership.rows[0]).toEqual({
      role: "VALET_SUPERVISOR",
      status: "ACTIVE",
    });
    const access = await pool.query<{ location_id: string }>(
      `SELECT location_id::text FROM membership_location_access
       WHERE membership_id = $1 ORDER BY location_id`,
      [result.membershipId],
    );
    expect(access.rows.map((row) => row.location_id)).toEqual(
      [...provisioning.locationIds].sort(),
    );
    const audit = await pool.query<{
      actor_membership_id: string | null;
      event_type: string;
      location_id: string;
      metadata_json: Record<string, unknown>;
      valet_session_id: string | null;
    }>(
      `SELECT actor_membership_id::text, event_type, location_id::text,
              metadata_json, valet_session_id::text
       FROM audit_events WHERE id = $1`,
      [result.auditEventId],
    );
    expect(audit.rows[0]).toEqual({
      actor_membership_id: null,
      event_type: "STAFF_ACCOUNT_PROVISIONED",
      location_id: secondLocationId,
      metadata_json: {
        locationIds: provisioning.locationIds,
        operatorRef: "CHANGE-004R",
        provisioningBoundary: "CONTROLLED_OPERATOR",
        reason: "Controlled initial staff provisioning",
        role: "VALET_SUPERVISOR",
      },
      valet_session_id: null,
    });
    const serialized = JSON.stringify(audit.rows[0]?.metadata_json);
    expect(serialized).not.toContain(normalizedEmail);
    expect(serialized).not.toContain(passwordHash);
    expect(Object.keys(result).sort()).toEqual([
      "auditEventId",
      "locationIds",
      "membershipId",
      "organizationId",
      "role",
      "userId",
    ]);
  });

  it.each([
    ["inactive Organization", { organizationStatus: "INACTIVE" as const }],
    ["inactive Location", { locationStatus: "INACTIVE" as const }],
  ])("rejects %s without a User", async (_name, options) => {
    const target = await scope(options);
    const provisioning = input(target.organizationId, [target.locationId]);
    await expect(persist(provisioning)).rejects.toThrow("unavailable");
    const users = await pool.query("SELECT 1 FROM users WHERE email = $1", [
      provisioning.email.trim().toLowerCase(),
    ]);
    expect(users.rowCount).toBe(0);
  });

  it("rejects a missing Organization", async () => {
    const organizationId = randomUUID();
    const provisioning = input(organizationId, [randomUUID()]);
    await expect(persist(provisioning)).rejects.toThrow("Organization");
  });

  it("rejects a missing Location", async () => {
    const target = await scope();
    await expect(
      persist(input(target.organizationId, [randomUUID()])),
    ).rejects.toThrow("Locations");
  });

  it("rejects cross-Organization Location assignment", async () => {
    const target = await scope();
    const foreign = await scope();
    await expect(
      persist(input(target.organizationId, [foreign.locationId])),
    ).rejects.toThrow("Locations");
  });

  it("rejects an existing normalized email without mutation", async () => {
    const target = await scope();
    const existingUserId = randomUUID();
    userIds.add(existingUserId);
    const email = `${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, 'DISABLED', transaction_timestamp())`,
      [existingUserId, email, passwordHash],
    );
    await expect(
      persist(input(target.organizationId, [target.locationId]), email),
    ).rejects.toThrow("already exists");
    const memberships = await pool.query(
      "SELECT 1 FROM organization_memberships WHERE user_id = $1",
      [existingUserId],
    );
    expect(memberships.rowCount).toBe(0);
  });

  it("rolls back all inserts when AuditEvent insertion fails", async () => {
    const target = await scope();
    const provisioning = input(target.organizationId, [target.locationId], {
      auditLocationId: randomUUID(),
    });
    const email = provisioning.email.trim().toLowerCase();
    await expect(persist(provisioning, email)).rejects.toThrow(
      "Staff provisioning failed",
    );
    const facts = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE email = $1`,
      [email],
    );
    expect(facts.rows[0]?.count).toBe("0");
  });

  it("concurrent duplicate email attempts leave exactly one User", async () => {
    const target = await scope();
    const email = `${randomUUID()}@example.com`;
    const attempts = await Promise.allSettled([
      persist(input(target.organizationId, [target.locationId]), email),
      persist(input(target.organizationId, [target.locationId]), email),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    const users = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE email = $1",
      [email],
    );
    expect(users.rows[0]?.count).toBe("1");
  });
});
