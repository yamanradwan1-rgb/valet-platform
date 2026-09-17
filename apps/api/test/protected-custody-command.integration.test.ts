import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import {
  createInternalProtectedCustodyCommandExecutor,
  type InternalProtectedCustodyCommandDefinition,
  type ProtectedCustodyCommandRequest,
  type ValetSessionState,
} from "../src/modules/valet-sessions/protected-custody-command";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
}

interface FixtureOptions {
  locationAccess?: boolean;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  role?: MembershipRole;
  sessionState?: ValetSessionState;
  userStatus?: "ACTIVE" | "DISABLED";
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004b_app_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_app_${uniqueSuffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const testCommandDefinition: InternalProtectedCustodyCommandDefinition = {
  allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
  auditEvent: {
    eventType: "TEST_CUSTODY_MUTATION",
    metadata: {
      source: "VAL-004B application integration test",
    },
  },
  requiredState: "CHECKING_IN",
  targetState: "CHECKING_IN",
};

let adminPool: Pool;
let databaseCreated = false;
let runtimePool: Pool;
let runtimeRoleCreated = false;
let testMigrationUrl: string;
let testRuntimeUrl: string;

function connectionUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function runtimeUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.username = runtimeRole;
  url.password = runtimePassword;
  return url.toString();
}

function redactDatabaseDetails(value: string): string {
  let redacted = value;
  for (const secret of [
    adminDatabaseUrl,
    testMigrationUrl,
    testRuntimeUrl,
    runtimePassword,
  ]) {
    if (secret !== undefined && secret !== "") {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }
  return redacted;
}

async function runPnpm(
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
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

  await new Promise<void>((resolve, reject) => {
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
        resolve();
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

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    const fixture = {
      locationId: randomUUID(),
      membershipId: randomUUID(),
      organizationId: randomUUID(),
      sessionId: randomUUID(),
      userId: randomUUID(),
    };
    const vehicleId = randomUUID();
    const identity = randomUUID();

    await client.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
      [fixture.organizationId, `VAL-004B ${identity}`],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Test location', $3, 'Test address', 'Asia/Amman',
               'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
      [fixture.locationId, fixture.organizationId, identity],
    );
    await client.query(
      `INSERT INTO users
         (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', $3,
               transaction_timestamp())`,
      [
        fixture.userId,
        `${identity}@val-004b.test`,
        options.userStatus ?? "ACTIVE",
      ],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
      [
        fixture.membershipId,
        fixture.organizationId,
        fixture.userId,
        options.role ?? "VALET_EMPLOYEE",
        options.membershipStatus ?? "ACTIVE",
      ],
    );
    if (options.locationAccess !== false) {
      await client.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [fixture.organizationId, fixture.membershipId, fixture.locationId],
      );
    }
    await client.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, transaction_timestamp())`,
      [vehicleId, fixture.organizationId, `Test vehicle ${identity}`],
    );
    await client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
               $3, $4, $5, $6, $7, 1, transaction_timestamp())`,
      [
        fixture.sessionId,
        `hash-${identity}`,
        fixture.organizationId,
        fixture.locationId,
        vehicleId,
        options.sessionState ?? "CHECKING_IN",
        fixture.membershipId,
      ],
    );
    await client.query("COMMIT");
    return fixture;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function commandRequest(
  fixture: Fixture,
  overrides: Partial<ProtectedCustodyCommandRequest> = {},
): ProtectedCustodyCommandRequest {
  return {
    authenticatedUserId: fixture.userId,
    expectedVersion: 1,
    valetSessionId: fixture.sessionId,
    ...overrides,
  };
}

function createTestExecutor(
  definition = testCommandDefinition,
  options: { readonly auditEventIdFactory?: () => string } = {},
) {
  return createInternalProtectedCustodyCommandExecutor(
    runtimePool,
    definition,
    options,
  );
}

async function expectCommandError(
  operation: Promise<unknown>,
  code: string,
): Promise<Error & { code: string }> {
  try {
    await operation;
    throw new Error(`Expected custody command error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const commandError = error as Error & { code: string };
    expect(commandError.code).toBe(code);
    return commandError;
  }
}

async function countAuditEvents(sessionId: string): Promise<number> {
  const result = await adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM audit_events
     WHERE valet_session_id = $1`,
    [sessionId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

beforeAll(async () => {
  testMigrationUrl = connectionUrlFor(testDatabaseName);
  testRuntimeUrl = runtimeUrlFor(testDatabaseName);

  const bootstrapPool = new Pool({ connectionString: adminDatabaseUrl });
  try {
    await bootstrapPool.query(`CREATE DATABASE "${testDatabaseName}"`);
    databaseCreated = true;
  } finally {
    await bootstrapPool.end();
  }

  await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
    DATABASE_URL: undefined,
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  });
  await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
    DATABASE_URL: testRuntimeUrl,
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  });
  runtimeRoleCreated = true;

  adminPool = new Pool({ connectionString: testMigrationUrl });
  runtimePool = createRuntimePostgresPool(testRuntimeUrl);
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();

  const bootstrapPool = new Pool({ connectionString: adminDatabaseUrl });
  try {
    if (databaseCreated) {
      await bootstrapPool.query(
        `DROP DATABASE "${testDatabaseName}" WITH (FORCE)`,
      );
    }
    if (runtimeRoleCreated) {
      await bootstrapPool.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
    }
  } finally {
    await bootstrapPool.end();
  }
}, 60_000);

describe("custody authorization foundation", () => {
  it("allows an active permitted role with explicit location access", async () => {
    const fixture = await createFixture();

    const result = await createTestExecutor()(commandRequest(fixture));

    expect(result.actor).toEqual({
      membershipId: fixture.membershipId,
      role: "VALET_EMPLOYEE",
      userId: fixture.userId,
    });
    expect(result.organizationId).toBe(fixture.organizationId);
    expect(result.locationId).toBe(fixture.locationId);
  });

  it("rejects inactive users and inactive memberships", async () => {
    const inactiveUser = await createFixture({ userStatus: "DISABLED" });
    const inactiveMembership = await createFixture({
      membershipStatus: "INACTIVE",
    });

    await expectCommandError(
      createTestExecutor()(commandRequest(inactiveUser)),
      "AUTHORIZATION_DENIED",
    );
    await expectCommandError(
      createTestExecutor()(commandRequest(inactiveMembership)),
      "TENANT_ACCESS_DENIED",
    );
  });

  it("rejects missing location access and roles outside the bound allowlist", async () => {
    const noLocationAccess = await createFixture({ locationAccess: false });
    const administrator = await createFixture({ role: "ORG_ADMIN" });

    await expectCommandError(
      createTestExecutor()(commandRequest(noLocationAccess)),
      "LOCATION_ACCESS_DENIED",
    );
    await expectCommandError(
      createTestExecutor()(commandRequest(administrator)),
      "AUTHORIZATION_DENIED",
    );
  });

  it("does not distinguish a foreign-tenant session from a missing session", async () => {
    const actor = await createFixture();
    const foreign = await createFixture();

    const foreignError = await expectCommandError(
      createTestExecutor()(
        commandRequest(actor, { valetSessionId: foreign.sessionId }),
      ),
      "TENANT_ACCESS_DENIED",
    );
    const missingError = await expectCommandError(
      createTestExecutor()(
        commandRequest(actor, { valetSessionId: randomUUID() }),
      ),
      "TENANT_ACCESS_DENIED",
    );
    expect(foreignError.message).toBe(missingError.message);
  });
});

describe("custody concurrency foundation", () => {
  it("increments the expected version exactly once and rejects a stale retry", async () => {
    const fixture = await createFixture();
    const execute = createTestExecutor();

    expect((await execute(commandRequest(fixture))).version).toBe(2);
    await expectCommandError(
      execute(commandRequest(fixture)),
      "VERSION_CONFLICT",
    );
    const persisted = await adminPool.query<{ version: number }>(
      `SELECT version FROM valet_sessions WHERE id = $1`,
      [fixture.sessionId],
    );
    expect(persisted.rows[0]?.version).toBe(2);
  });

  it("returns state mismatch only when the supplied version is current", async () => {
    const fixture = await createFixture({ sessionState: "PARKED" });
    const execute = createTestExecutor();

    await expectCommandError(
      execute(commandRequest(fixture)),
      "INVALID_STATE_TRANSITION",
    );
    await expectCommandError(
      execute(commandRequest(fixture, { expectedVersion: 2 })),
      "VERSION_CONFLICT",
    );
  });

  it("allows only one winner for competing mutations", async () => {
    const fixture = await createFixture();
    const execute = createTestExecutor();

    const results = await Promise.allSettled([
      execute(commandRequest(fixture)),
      execute(commandRequest(fixture)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(await countAuditEvents(fixture.sessionId)).toBe(1);
  });
});

describe("protected mutation and audit atomicity", () => {
  it("commits server-scoped audit data and time with the mutation", async () => {
    const fixture = await createFixture();

    const result = await createTestExecutor()(commandRequest(fixture));
    const audit = await adminPool.query<{
      actor_membership_id: string;
      entity_id: string;
      entity_type: string;
      location_id: string;
      metadata_json: Record<string, unknown>;
      occurred_at: Date;
      organization_id: string;
      valet_session_id: string;
    }>(
      `SELECT actor_membership_id::text, entity_id::text, entity_type,
              location_id::text, metadata_json, occurred_at,
              organization_id::text, valet_session_id::text
       FROM audit_events
       WHERE id = $1`,
      [result.auditEventId],
    );

    expect(audit.rows[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      entity_id: fixture.sessionId,
      entity_type: "ValetSession",
      location_id: fixture.locationId,
      metadata_json: {
        source: "VAL-004B application integration test",
      },
      organization_id: fixture.organizationId,
      valet_session_id: fixture.sessionId,
    });
    expect(audit.rows[0]?.occurred_at).toEqual(result.operationTime);
  });

  it("rolls the mutation back when the required audit insert fails", async () => {
    const fixture = await createFixture();
    const duplicateAuditId = randomUUID();
    await adminPool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'TEST_EXISTING_AUDIT',
               'ValetSession', $4, '{}'::jsonb, transaction_timestamp())`,
      [
        duplicateAuditId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );

    await expect(
      createTestExecutor(testCommandDefinition, {
        auditEventIdFactory: () => duplicateAuditId,
      })(commandRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    const persisted = await adminPool.query<{ version: number }>(
      `SELECT version FROM valet_sessions WHERE id = $1`,
      [fixture.sessionId],
    );
    expect(persisted.rows[0]?.version).toBe(1);
    expect(await countAuditEvents(fixture.sessionId)).toBe(1);
  });

  it("does not append an audit event when the protected mutation fails", async () => {
    const fixture = await createFixture({ sessionState: "PARKED" });

    await expectCommandError(
      createTestExecutor()(commandRequest(fixture)),
      "INVALID_STATE_TRANSITION",
    );
    expect(await countAuditEvents(fixture.sessionId)).toBe(0);
  });

  it("rejects prohibited metadata field names as defense-in-depth", async () => {
    const fixture = await createFixture();
    const unsafeDefinition: InternalProtectedCustodyCommandDefinition = {
      ...testCommandDefinition,
      auditEvent: {
        eventType: "TEST_UNSAFE_AUDIT",
        metadata: { bearerToken: "test-only-value" },
      },
    };

    await expectCommandError(
      createTestExecutor(unsafeDefinition)(commandRequest(fixture)),
      "UNSAFE_AUDIT_METADATA",
    );
    expect(await countAuditEvents(fixture.sessionId)).toBe(0);
  });
});
