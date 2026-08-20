import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const testDatabaseName = `valet_003p_${process.pid}_${Date.now()}`;
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const missingDotenvPath = fileURLToPath(
  new URL("../../../.env.val-003p-does-not-exist", import.meta.url),
);
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const demoOrganizationId = "00000000-0000-4000-8000-000000000001";
const ammanLocationId = "00000000-0000-4000-8000-000000000002";
const dubaiLocationId = "00000000-0000-4000-8000-000000000003";
const adminMembershipId = "00000000-0000-4000-8000-000000000020";
const managerMembershipId = "00000000-0000-4000-8000-000000000021";
const supervisorMembershipId = "00000000-0000-4000-8000-000000000022";
const valetMembershipId = "00000000-0000-4000-8000-000000000023";
const sessionAId = "00000000-0000-4000-8000-000000000080";
const sessionBId = "00000000-0000-4000-8000-000000000081";
const sessionCId = "00000000-0000-4000-8000-000000000082";
const sessionDId = "00000000-0000-4000-8000-000000000083";
const cashPaymentId = "00000000-0000-4000-8000-0000000000b0";
const digitalPaymentId = "00000000-0000-4000-8000-0000000000b1";

let databaseCreated = false;
let databaseClient: Client;
let testDatabaseUrl: string;

function connectionUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function redactDatabaseDetails(value: string): string {
  let redacted = value.replaceAll(adminDatabaseUrl, "[DATABASE_URL]");
  if (testDatabaseUrl !== undefined) {
    redacted = redacted.replaceAll(testDatabaseUrl, "[DATABASE_URL]");
  }
  try {
    const url = new URL(adminDatabaseUrl);
    if (url.password !== "") {
      redacted = redacted.replaceAll(url.password, "[REDACTED]");
    }
  } catch {
    // The database client will report an invalid administrator URL safely.
  }
  return redacted;
}

async function runPnpm(
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ stderr: string; stdout: string }> {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath === undefined ? pnpmExecutable : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  const childEnvironment = { ...process.env };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete childEnvironment[key];
    } else {
      childEnvironment[key] = value;
    }
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repositoryRoot,
      env: childEnvironment,
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          redactDatabaseDetails(
            `pnpm ${args.join(" ")} failed with exit code ${String(code)}.\n${stdout}\n${stderr}`,
          ),
        ),
      );
    });
  });
}

async function scalarNumber(
  sql: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await databaseClient.query<{ count: string }>(sql, values);
  return Number(result.rows[0]?.count ?? 0);
}

async function expectSeedRejectionWithoutMutation(
  environment: NodeJS.ProcessEnv,
  expectedMessage: string,
  forbiddenOutput?: string,
): Promise<void> {
  const before = await scalarNumber(
    `SELECT count(*)::text AS count FROM organizations`,
  );
  let rejection: Error | undefined;
  try {
    await runPnpm(["--filter", "@valet/database", "seed"], environment);
  } catch (error) {
    rejection = error instanceof Error ? error : new Error(String(error));
  }
  expect(rejection).toBeDefined();
  expect(rejection?.message).toContain(expectedMessage);
  if (forbiddenOutput !== undefined) {
    expect(rejection?.message).not.toContain(forbiddenOutput);
  }
  const after = await scalarNumber(
    `SELECT count(*)::text AS count FROM organizations`,
  );
  expect(after).toBe(before);
}

async function demoCounts(): Promise<Record<string, number>> {
  const tables = [
    "locations",
    "organization_memberships",
    "membership_location_access",
    "shifts",
    "customers",
    "vehicles",
    "parking_spots",
    "key_slots",
    "valet_sessions",
    "retrieval_requests",
    "handoff_verifications",
    "audit_events",
    "payments",
    "validations",
    "cash_entries",
    "refunds",
    "payment_provider_events",
    "incidents",
    "notifications",
  ] as const;
  const counts: Record<string, number> = {
    organizations: await scalarNumber(
      `SELECT count(*)::text AS count FROM organizations WHERE id = $1`,
      [demoOrganizationId],
    ),
  };
  for (const table of tables) {
    counts[table] = await scalarNumber(
      `SELECT count(*)::text AS count FROM ${table} WHERE organization_id = $1`,
      [demoOrganizationId],
    );
  }
  counts.users = await scalarNumber(
    `SELECT count(*)::text AS count
     FROM users
     WHERE email LIKE '%@vaylet.demo.invalid'`,
  );
  return counts;
}

beforeAll(async () => {
  expect(testDatabaseName).toMatch(/^valet_003p_\d+_\d+$/);
  testDatabaseUrl = connectionUrlFor(testDatabaseName);

  const adminClient = new Client({ connectionString: adminDatabaseUrl });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE "${testDatabaseName}"`);
    databaseCreated = true;
  } finally {
    await adminClient.end();
  }

  await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
    DATABASE_URL: testDatabaseUrl,
    MIGRATION_DATABASE_URL: testDatabaseUrl,
    NODE_ENV: "test",
  });

  databaseClient = new Client({ connectionString: testDatabaseUrl });
  await databaseClient.connect();
}, 120_000);

afterAll(async () => {
  if (databaseClient !== undefined) {
    await databaseClient.end();
  }
  if (databaseCreated) {
    const adminClient = new Client({ connectionString: adminDatabaseUrl });
    await adminClient.connect();
    try {
      await adminClient.query(
        `DROP DATABASE "${testDatabaseName}" WITH (FORCE)`,
      );
    } finally {
      await adminClient.end();
    }
  }
}, 60_000);

describe("demo seed data foundation", () => {
  it("applies all 28 forward-only migrations to a fresh database", async () => {
    const result = await databaseClient.query<{ migration_name: string }>(
      `SELECT migration_name
       FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
       ORDER BY migration_name`,
    );
    expect(result.rows).toHaveLength(28);
    expect(result.rows[0]?.migration_name).toBe(
      "20260808000100_tenant_staff_foundation",
    );
    expect(result.rows.at(-1)?.migration_name).toBe(
      "20260816002800_phase6_payment_collection_operation",
    );
  });

  it("refuses production without modifying the database", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "production",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "requires NODE_ENV=development or NODE_ENV=test",
    );
  }, 60_000);

  it("refuses staging without modifying the database", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "staging",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "requires NODE_ENV=development or NODE_ENV=test",
    );
  }, 60_000);

  it("refuses a missing NODE_ENV without modifying the database", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: testDatabaseUrl,
        DOTENV_CONFIG_PATH: missingDotenvPath,
        NODE_ENV: undefined,
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "requires NODE_ENV=development or NODE_ENV=test",
    );
  }, 60_000);

  it("refuses a missing demo-seed opt-in without modifying the database", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: testDatabaseUrl,
        DOTENV_CONFIG_PATH: missingDotenvPath,
        NODE_ENV: "test",
        VAYLET_ALLOW_DEMO_SEED: undefined,
      },
      "requires VAYLET_ALLOW_DEMO_SEED=true",
    );
  }, 60_000);

  it("refuses a false demo-seed opt-in without modifying the database", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "test",
        VAYLET_ALLOW_DEMO_SEED: "false",
      },
      "requires VAYLET_ALLOW_DEMO_SEED=true",
    );
  }, 60_000);

  it("refuses a remote database host without connecting or exposing its password", async () => {
    const remotePassword = "remote-test-password";
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: `postgresql://user:${remotePassword}@example.invalid:5432/valet`,
        NODE_ENV: "development",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "requires a loopback PostgreSQL host",
      remotePassword,
    );
  }, 60_000);

  it("refuses a query-parameter host override without connecting or exposing its password", async () => {
    const remotePassword = "remote-test-password";
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: `postgresql://user:${remotePassword}@127.0.0.1:5432/valet?host=example.invalid`,
        NODE_ENV: "development",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "does not allow PostgreSQL connection parameters or fragments",
      remotePassword,
    );
  }, 60_000);

  it("refuses benign-looking PostgreSQL connection parameters without modifying the database", async () => {
    const localPassword = "local-test-password";
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: `postgresql://user:${localPassword}@127.0.0.1:5432/valet?port=5432`,
        NODE_ENV: "development",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "does not allow PostgreSQL connection parameters or fragments",
      localPassword,
    );
  }, 60_000);

  it("refuses an unexpected local database name before connecting", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL:
          "postgresql://user:local-test-password@127.0.0.1:5432/not_the_demo_db",
        NODE_ENV: "development",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "development target must use database",
      "local-test-password",
    );
  }, 60_000);

  it("accepts the documented development target policy before local connection", async () => {
    await expectSeedRejectionWithoutMutation(
      {
        DATABASE_URL: "postgresql://user:local-test-password@127.0.0.1:1/valet",
        NODE_ENV: "development",
        VAYLET_ALLOW_DEMO_SEED: "true",
      },
      "could not connect using DATABASE_URL",
      "local-test-password",
    );
  }, 60_000);

  it("seeds coherent synthetic fixtures and remains idempotent", async () => {
    const firstRun = await runPnpm(["--filter", "@valet/database", "seed"], {
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "test",
      VAYLET_ALLOW_DEMO_SEED: "true",
    });
    expect(firstRun.stdout).toContain("VAYLET demo seed complete.");
    const firstCounts = await demoCounts();

    const secondRun = await runPnpm(["--filter", "@valet/database", "seed"], {
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "test",
      VAYLET_ALLOW_DEMO_SEED: "true",
    });
    expect(secondRun.stdout).toContain("VAYLET demo seed complete.");
    const secondCounts = await demoCounts();
    expect(secondCounts).toEqual(firstCounts);
    expect(secondCounts).toMatchObject({
      organizations: 1,
      locations: 2,
      users: 4,
      organization_memberships: 4,
      membership_location_access: 5,
      shifts: 1,
      customers: 4,
      vehicles: 4,
      parking_spots: 5,
      key_slots: 5,
      valet_sessions: 4,
      retrieval_requests: 1,
      handoff_verifications: 1,
      audit_events: 2,
      payments: 2,
      validations: 1,
      cash_entries: 1,
      refunds: 1,
      payment_provider_events: 1,
      incidents: 1,
      notifications: 2,
    });

    const organization = await databaseClient.query(
      `SELECT name, status, timezone
       FROM organizations WHERE id = $1`,
      [demoOrganizationId],
    );
    expect(organization.rows).toEqual([
      {
        name: "VAYLET Demo Operations",
        status: "ACTIVE",
        timezone: "Asia/Amman",
      },
    ]);

    const locations = await databaseClient.query(
      `SELECT code, timezone, currency, status
       FROM locations WHERE organization_id = $1 ORDER BY code`,
      [demoOrganizationId],
    );
    expect(locations.rows).toEqual([
      {
        code: "AMM-DEMO",
        currency: "JOD",
        status: "ACTIVE",
        timezone: "Asia/Amman",
      },
      {
        code: "DXB-DEMO",
        currency: "AED",
        status: "ACTIVE",
        timezone: "Asia/Dubai",
      },
    ]);

    const roles = await databaseClient.query<{ count: string; role: string }>(
      `SELECT role::text, count(*)::text AS count
       FROM organization_memberships
       WHERE organization_id = $1
       GROUP BY role ORDER BY role`,
      [demoOrganizationId],
    );
    expect(roles.rows).toEqual([
      { count: "1", role: "LOCATION_MANAGER" },
      { count: "1", role: "ORG_ADMIN" },
      { count: "1", role: "VALET_EMPLOYEE" },
      { count: "1", role: "VALET_SUPERVISOR" },
    ]);

    const access = await databaseClient.query<{
      location_id: string;
      membership_id: string;
    }>(
      `SELECT membership_id::text, location_id::text
       FROM membership_location_access
       WHERE organization_id = $1
       ORDER BY membership_id, location_id`,
      [demoOrganizationId],
    );
    expect(
      access.rows.filter((row) => row.membership_id === adminMembershipId),
    ).toHaveLength(2);
    expect(access.rows).toEqual(
      expect.arrayContaining([
        { membership_id: adminMembershipId, location_id: ammanLocationId },
        { membership_id: adminMembershipId, location_id: dubaiLocationId },
        { membership_id: managerMembershipId, location_id: ammanLocationId },
        { membership_id: supervisorMembershipId, location_id: ammanLocationId },
        { membership_id: valetMembershipId, location_id: ammanLocationId },
      ]),
    );

    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM shifts
         WHERE organization_id = $1 AND location_id = $2 AND membership_id = $3 AND status = 'ACTIVE'`,
        [demoOrganizationId, ammanLocationId, valetMembershipId],
      ),
    ).toBe(1);

    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM vehicles
         WHERE organization_id = $1 AND plate_country = 'JO'
           AND plate_number_raw IS NOT NULL AND plate_number_normalized IS NOT NULL`,
        [demoOrganizationId],
      ),
    ).toBe(3);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM vehicles
         WHERE organization_id = $1 AND plate_country IS NULL
           AND plate_number_raw IS NULL AND plate_number_normalized IS NULL
           AND btrim(temporary_descriptor) <> ''`,
        [demoOrganizationId],
      ),
    ).toBe(1);

    const sessions = await databaseClient.query<{ id: string; state: string }>(
      `SELECT id::text, state::text FROM valet_sessions
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[sessionAId, sessionBId, sessionCId, sessionDId]],
    );
    expect(sessions.rows).toEqual([
      { id: sessionAId, state: "PARKED" },
      { id: sessionBId, state: "READY" },
      { id: sessionCId, state: "COMPLETED" },
      { id: sessionDId, state: "COMPLETED" },
    ]);

    const activeConflicts = await databaseClient.query(
      `SELECT 'vehicle' AS kind FROM valet_sessions WHERE state <> 'COMPLETED'
       GROUP BY location_id, vehicle_id HAVING count(*) > 1
       UNION ALL
       SELECT 'spot' FROM valet_sessions WHERE state <> 'COMPLETED' AND parking_spot_id IS NOT NULL
       GROUP BY parking_spot_id HAVING count(*) > 1
       UNION ALL
       SELECT 'key' FROM valet_sessions WHERE state <> 'COMPLETED' AND key_slot_id IS NOT NULL
       GROUP BY key_slot_id HAVING count(*) > 1`,
    );
    expect(activeConflicts.rows).toEqual([]);

    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM retrieval_requests
         WHERE organization_id = $1 AND valet_session_id = $2
           AND requested_by_type = 'CUSTOMER' AND status = 'ACCEPTED'`,
        [demoOrganizationId, sessionBId],
      ),
    ).toBe(1);

    const handoff = await databaseClient.query<{ secret_hash: string }>(
      `SELECT secret_hash FROM handoff_verifications
       WHERE organization_id = $1 AND valet_session_id = $2
         AND method = 'PICKUP_CODE' AND attempt_count = 0 AND max_attempts = 5`,
      [demoOrganizationId, sessionBId],
    );
    expect(handoff.rows).toHaveLength(1);
    expect(handoff.rows[0]?.secret_hash).toMatch(/^sha256:/);
    expect(handoff.rows[0]?.secret_hash).not.toMatch(/^\d{4}$/);
    const plaintextCodeColumns = await databaseClient.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'handoff_verifications'
         AND column_name IN ('pickup_code', 'code', 'secret')`,
    );
    expect(plaintextCodeColumns.rows).toEqual([]);

    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM audit_events
         WHERE organization_id = $1 AND metadata_json = '{"source":"demo-seed"}'::jsonb`,
        [demoOrganizationId],
      ),
    ).toBe(2);

    const cashPayment = await databaseClient.query(
      `SELECT status::text, collection_method::text, currency,
              service_amount::text, tip_amount::text, amount_due::text, amount_paid::text
       FROM payments WHERE id = $1`,
      [cashPaymentId],
    );
    expect(cashPayment.rows).toEqual([
      {
        amount_due: "7.000",
        amount_paid: "7.000",
        collection_method: "CASH",
        currency: "JOD",
        service_amount: "6.000",
        status: "PAID",
        tip_amount: "1.000",
      },
    ]);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM cash_entries
         WHERE organization_id = $1 AND payment_id = $2 AND entry_type = 'RECEIPT'
           AND amount = 7.000 AND submission_idempotency_key = 'demo-cash-receipt-session-c'`,
        [demoOrganizationId, cashPaymentId],
      ),
    ).toBe(1);

    const digitalPayment = await databaseClient.query(
      `SELECT status::text, collection_method::text, service_amount::text,
              tip_amount::text, amount_due::text, amount_paid::text
       FROM payments WHERE id = $1`,
      [digitalPaymentId],
    );
    expect(digitalPayment.rows).toEqual([
      {
        amount_due: "8.000",
        amount_paid: "8.000",
        collection_method: "DIGITAL",
        service_amount: "10.000",
        status: "PAID",
        tip_amount: "2.000",
      },
    ]);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM validations
         WHERE organization_id = $1 AND payment_id = $2 AND mode = 'PARTIAL'
           AND amount = 4.000 AND is_current = true`,
        [demoOrganizationId, digitalPaymentId],
      ),
    ).toBe(1);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM refunds
         WHERE organization_id = $1 AND payment_id = $2 AND status = 'SUCCEEDED'
           AND amount = 2.000 AND idempotency_key = 'demo-refund-session-d'`,
        [demoOrganizationId, digitalPaymentId],
      ),
    ).toBe(1);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM payment_provider_events
         WHERE organization_id = $1 AND payment_id = $2
           AND provider_event_id = 'demo-event-payment-succeeded-001'
           AND processing_status = 'PROCESSED'`,
        [demoOrganizationId, digitalPaymentId],
      ),
    ).toBe(1);

    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM incidents
         WHERE organization_id = $1 AND valet_session_id = $2
           AND status = 'OPEN' AND severity = 'MEDIUM'`,
        [demoOrganizationId, sessionAId],
      ),
    ).toBe(1);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM notifications
         WHERE organization_id = $1 AND valet_session_id IS NULL
           AND channel = 'SMS' AND status = 'PENDING'`,
        [demoOrganizationId],
      ),
    ).toBe(1);
    expect(
      await scalarNumber(
        `SELECT count(*)::text AS count FROM notifications
         WHERE organization_id = $1 AND valet_session_id = $2
           AND channel = 'WHATSAPP' AND status = 'SENT' AND sent_at IS NOT NULL`,
        [demoOrganizationId, sessionBId],
      ),
    ).toBe(1);
  }, 120_000);
});
