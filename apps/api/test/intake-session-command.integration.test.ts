import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import {
  createIntakeSessionCommandExecutor,
  type IntakeSessionCommandRequest,
} from "../src/modules/valet-sessions/intake-session-command";
import { differentCustomer } from "./returning-check-in-test-context";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  userId: string;
}

interface FixtureOptions {
  locationAccess?: boolean;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  role?: MembershipRole;
  userStatus?: "ACTIVE" | "DISABLED";
}

interface ScopeCounts {
  audits: number;
  customers: number;
  intakeOperations: number;
  sessions: number;
  vehicles: number;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004e_app_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_intake_${uniqueSuffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

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
    if (value === undefined) delete childEnvironment[key];
    else childEnvironment[key] = value;
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
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            redactDatabaseDetails(
              `pnpm ${args.join(" ")} failed with exit code ${String(code)}.\n${stdout}\n${stderr}`,
            ),
          ),
        );
      }
    });
  });
}

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const fixture = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    userId: randomUUID(),
  };
  const identity = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations
       (id, name, status, timezone, updated_at)
     VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
    [fixture.organizationId, `VAL-004E ${identity}`],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Intake location', $3, 'Test address', 'Asia/Amman',
             'JOD', 'ACTIVE', transaction_timestamp())`,
    [fixture.locationId, fixture.organizationId, identity],
  );
  await adminPool.query(
    `INSERT INTO users
       (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', $3,
             transaction_timestamp())`,
    [
      fixture.userId,
      `${identity}@val-004e.test`,
      options.userStatus ?? "ACTIVE",
    ],
  );
  await adminPool.query(
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
    await adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, fixture.membershipId, fixture.locationId],
    );
  }
  return fixture;
}

function temporaryRequest(
  fixture: Fixture,
  overrides: Partial<IntakeSessionCommandRequest> = {},
): IntakeSessionCommandRequest {
  return {
    authenticatedUserId: fixture.userId,
    intakeOperationId: `intake:${randomUUID()}`,
    targetLocationId: fixture.locationId,
    vehicleIdentity: {
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: `Temporary vehicle ${randomUUID()}`,
    },
    ...overrides,
  };
}

function confirmedRequest(
  fixture: Fixture,
  operationId = `intake:${randomUUID()}`,
): IntakeSessionCommandRequest {
  return {
    authenticatedUserId: fixture.userId,
    intakeOperationId: operationId,
    targetLocationId: fixture.locationId,
    vehicleIdentity: {
      confirmedByHuman: true,
      mode: "CONFIRMED_PLATE",
      plateCountry: "jo",
      plateNumberRaw: "  ab-１２３  ",
    },
  };
}

async function expectCommandError(
  operation: Promise<unknown>,
  code: string,
): Promise<Error & { code: string }> {
  try {
    await operation;
    throw new Error(`Expected intake command error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const commandError = error as Error & { code: string };
    expect(commandError.code).toBe(code);
    return commandError;
  }
}

async function readCounts(organizationId: string): Promise<ScopeCounts> {
  const result = await adminPool.query<ScopeCounts>(
    `SELECT
       (SELECT count(*)::integer FROM audit_events
        WHERE organization_id = $1) AS audits,
       (SELECT count(*)::integer FROM customers
        WHERE organization_id = $1) AS customers,
       (SELECT count(*)::integer FROM intake_operations
        WHERE organization_id = $1) AS "intakeOperations",
       (SELECT count(*)::integer FROM valet_sessions
        WHERE organization_id = $1) AS sessions,
       (SELECT count(*)::integer FROM vehicles
        WHERE organization_id = $1) AS vehicles`,
    [organizationId],
  );
  return result.rows[0]!;
}

async function completeSession(
  fixture: Fixture,
  sessionId: string,
): Promise<void> {
  await adminPool.query(
    `UPDATE valet_sessions
     SET state = 'COMPLETED', completed_at = transaction_timestamp(),
         completed_by_membership_id = $2,
         updated_at = transaction_timestamp()
     WHERE id = $1`,
    [sessionId, fixture.membershipId],
  );
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

describe("VAL-004E intake session creation", () => {
  it("creates only a CHECKING_IN version-1 session with disabled guest access and one safe audit", async () => {
    const fixture = await createFixture();
    const result = await createIntakeSessionCommandExecutor(runtimePool)(
      temporaryRequest(fixture),
    );
    expect(result).toMatchObject({
      customerId: null,
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      state: "CHECKING_IN",
      version: 1,
    });

    const session = await adminPool.query<{
      check_in_condition_completed_at: Date | null;
      checking_in_completed_at: Date | null;
      completed_at: Date | null;
      current_assignee_membership_id: string | null;
      customer_access_expires_at: Date;
      customer_access_revoked_at: Date;
      customer_access_token_hash: string;
      checked_in_by_membership_id: string;
      created_at: Date;
      key_slot_id: string | null;
      parked_at: Date | null;
      parking_spot_id: string | null;
      retrieval_requested_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT customer_access_token_hash, customer_access_expires_at,
              customer_access_revoked_at, parking_spot_id, key_slot_id,
              checked_in_by_membership_id, current_assignee_membership_id,
              check_in_condition_completed_at,
              checking_in_completed_at, parked_at, retrieval_requested_at,
              completed_at, created_at, updated_at
       FROM valet_sessions WHERE id = $1`,
      [result.valetSessionId],
    );
    expect(session.rows[0]).toMatchObject({
      check_in_condition_completed_at: null,
      checking_in_completed_at: null,
      completed_at: null,
      current_assignee_membership_id: null,
      checked_in_by_membership_id: fixture.membershipId,
      key_slot_id: null,
      parked_at: null,
      parking_spot_id: null,
      retrieval_requested_at: null,
    });
    expect(session.rows[0]?.created_at).toEqual(result.createdAt);
    expect(session.rows[0]?.updated_at).toEqual(result.createdAt);
    expect(session.rows[0]?.customer_access_token_hash).toMatch(
      /^disabled:intake:[a-f0-9]{64}$/,
    );
    expect(session.rows[0]?.customer_access_expires_at).toEqual(
      result.createdAt,
    );
    expect(session.rows[0]?.customer_access_revoked_at).toEqual(
      result.createdAt,
    );
    expect(Object.keys(result)).not.toContain("customerAccessToken");

    const audit = await adminPool.query<{
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata_json
       FROM audit_events WHERE valet_session_id = $1`,
      [result.valetSessionId],
    );
    expect(audit.rows).toEqual([
      {
        event_type: "VALET_SESSION_CREATED",
        metadata_json: {
          customerPresent: false,
          identityMode: "TEMPORARY_DESCRIPTOR",
          intakeContractVersion: "V2",
        },
      },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain("disabled:intake:");
    expect(await readCounts(fixture.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });

  it("authorizes a supervisor without requiring an active Shift", async () => {
    const fixture = await createFixture({ role: "VALET_SUPERVISOR" });
    const result = await createIntakeSessionCommandExecutor(runtimePool)(
      temporaryRequest(fixture),
    );
    const session = await adminPool.query<{
      checked_in_by_membership_id: string;
    }>(
      `SELECT checked_in_by_membership_id::text
       FROM valet_sessions WHERE id = $1`,
      [result.valetSessionId],
    );
    expect(session.rows[0]?.checked_in_by_membership_id).toBe(
      fixture.membershipId,
    );
    const shifts = await adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM shifts
       WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    expect(shifts.rows[0]?.count).toBe(0);
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "rejects the non-operational %s role",
    async (role) => {
      const fixture = await createFixture({ role });
      await expectCommandError(
        createIntakeSessionCommandExecutor(runtimePool)(
          temporaryRequest(fixture),
        ),
        "AUTHORIZATION_DENIED",
      );
      expect(await readCounts(fixture.organizationId)).toEqual({
        audits: 0,
        customers: 0,
        intakeOperations: 0,
        sessions: 0,
        vehicles: 0,
      });
    },
  );

  it.each([
    [{ userStatus: "DISABLED" } as FixtureOptions, "AUTHORIZATION_DENIED"],
    [
      { membershipStatus: "INACTIVE" } as FixtureOptions,
      "TENANT_ACCESS_DENIED",
    ],
    [{ locationAccess: false } as FixtureOptions, "LOCATION_ACCESS_DENIED"],
  ])("rejects inactive or unscoped staff", async (options, code) => {
    const fixture = await createFixture(options);
    await expectCommandError(
      createIntakeSessionCommandExecutor(runtimePool)(
        temporaryRequest(fixture),
      ),
      code,
    );
    expect(await readCounts(fixture.organizationId)).toMatchObject({
      audits: 0,
      intakeOperations: 0,
      sessions: 0,
      vehicles: 0,
    });
  });

  it("does not disclose whether a target Location belongs to another tenant", async () => {
    const actor = await createFixture();
    const foreign = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const foreignError = await expectCommandError(
      execute(
        temporaryRequest(actor, { targetLocationId: foreign.locationId }),
      ),
      "TENANT_ACCESS_DENIED",
    );
    const missingError = await expectCommandError(
      execute(temporaryRequest(actor, { targetLocationId: randomUUID() })),
      "TENANT_ACCESS_DENIED",
    );
    expect(foreignError.message).toBe(missingError.message);
  });

  it("persists a canonical Jordan mobile and reuses one exact match", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const customer = differentCustomer("+962791234567", "  Ｊｏｒｄａｎ  ");
    const first = await execute(temporaryRequest(fixture, { customer }));
    const second = await execute(temporaryRequest(fixture, { customer }));
    expect(first.customerId).not.toBeNull();
    expect(second.customerId).toBe(first.customerId);
    const customers = await adminPool.query<{
      display_name: string | null;
      phone_normalized: string;
    }>(
      `SELECT phone_normalized, display_name
       FROM customers WHERE organization_id = $1 ORDER BY created_at`,
      [fixture.organizationId],
    );
    expect(customers.rows).toEqual([
      { display_name: "Jordan", phone_normalized: "+962791234567" },
    ]);
  });

  it("rejects invalid customer contact before any mutation", async () => {
    const fixture = await createFixture();
    const before = await readCounts(fixture.organizationId);
    for (const phone of ["+96277896356", "+962123456789", "+96279000000"]) {
      await expectCommandError(
        createIntakeSessionCommandExecutor(runtimePool)(
          temporaryRequest(fixture, { customer: differentCustomer(phone) }),
        ),
        "INTAKE_INPUT_INVALID",
      );
    }
    expect(await readCounts(fixture.organizationId)).toEqual(before);
  });

  it("creates and later reuses one same-Organization confirmed Vehicle", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const first = await execute(confirmedRequest(fixture));
    const vehicle = await adminPool.query<{
      plate_country: string;
      plate_number_normalized: string;
      plate_number_raw: string;
    }>(
      `SELECT plate_country, plate_number_normalized, plate_number_raw
       FROM vehicles WHERE id = $1`,
      [first.vehicleId],
    );
    expect(vehicle.rows[0]).toEqual({
      plate_country: "JO",
      plate_number_normalized: "AB123",
      plate_number_raw: "ab-１２３",
    });
    await completeSession(fixture, first.valetSessionId);
    const second = await execute(confirmedRequest(fixture));
    expect(second.vehicleId).toBe(first.vehicleId);
    expect(second.valetSessionId).not.toBe(first.valetSessionId);
    expect((await readCounts(fixture.organizationId)).vehicles).toBe(1);
  });

  it("keeps identical confirmed plates and phone values independent across Organizations", async () => {
    const firstFixture = await createFixture();
    const secondFixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const customer = differentCustomer("+962791234567");
    const first = await execute({
      ...confirmedRequest(firstFixture),
      customer,
    });
    const second = await execute({
      ...confirmedRequest(secondFixture),
      customer,
    });
    expect(first.vehicleId).not.toBe(second.vehicleId);
    expect(first.customerId).not.toBe(second.customerId);
  });

  it("always creates distinct Vehicles for temporary descriptors", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const identity = {
      mode: "TEMPORARY_DESCRIPTOR" as const,
      temporaryDescriptor: "Black sedan, plate unreadable",
    };
    const first = await execute(
      temporaryRequest(fixture, { vehicleIdentity: identity }),
    );
    const second = await execute(
      temporaryRequest(fixture, { vehicleIdentity: identity }),
    );
    expect(first.vehicleId).not.toBe(second.vehicleId);
    expect((await readCounts(fixture.organizationId)).vehicles).toBe(2);
  });

  it("does not let an OCR candidate become authoritative without human confirmation", async () => {
    const fixture = await createFixture();
    const before = await readCounts(fixture.organizationId);
    await expectCommandError(
      createIntakeSessionCommandExecutor(runtimePool)(
        temporaryRequest(fixture, {
          vehicleIdentity: {
            confirmedByHuman: false,
            mode: "CONFIRMED_PLATE",
            plateCandidate: {
              plateCountry: "JO",
              plateNumberRaw: "AB123",
              source: "OCR",
            },
            plateCountry: "JO",
            plateNumberRaw: "AB123",
          },
        }),
      ),
      "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED",
    );
    expect(await readCounts(fixture.organizationId)).toEqual(before);
  });

  it("returns an exact durable retry result without duplicate rows or AuditEvent", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const request = temporaryRequest(fixture, {
      customer: differentCustomer("+962791234567", "Guest"),
    });
    const first = await execute(request);
    const counts = await readCounts(fixture.organizationId);
    await completeSession(fixture, first.valetSessionId);
    const retry = await execute(request);
    expect(retry).toEqual(first);
    expect(await readCounts(fixture.organizationId)).toEqual(counts);
    expect(counts).toEqual({
      audits: 1,
      customers: 1,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });

  it("serializes concurrent identical retries to one exact result", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const request = temporaryRequest(fixture);
    const [first, second] = await Promise.all([
      execute(request),
      execute(request),
    ]);
    expect(second).toEqual(first);
    expect(await readCounts(fixture.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });

  it("rejects reuse of an operation identifier with different normalized input", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const operationId = `intake:${randomUUID()}`;
    await execute(
      temporaryRequest(fixture, { intakeOperationId: operationId }),
    );
    const before = await readCounts(fixture.organizationId);
    await expectCommandError(
      execute(
        temporaryRequest(fixture, {
          intakeOperationId: operationId,
          vehicleIdentity: {
            mode: "TEMPORARY_DESCRIPTOR",
            temporaryDescriptor: "Different vehicle",
          },
        }),
      ),
      "IDEMPOTENCY_CONFLICT",
    );
    expect(await readCounts(fixture.organizationId)).toEqual(before);
  });

  it("scopes the same operation identifier independently by Organization", async () => {
    const firstFixture = await createFixture();
    const secondFixture = await createFixture();
    const operationId = `intake:${randomUUID()}`;
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    await expect(
      Promise.all([
        execute(
          temporaryRequest(firstFixture, { intakeOperationId: operationId }),
        ),
        execute(
          temporaryRequest(secondFixture, { intakeOperationId: operationId }),
        ),
      ]),
    ).resolves.toHaveLength(2);
  });

  it("maps only the active same-location Vehicle constraint to the domain conflict", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    await execute(confirmedRequest(fixture));
    const before = await readCounts(fixture.organizationId);
    await expectCommandError(
      execute(confirmedRequest(fixture)),
      "ACTIVE_VALET_SESSION_CONFLICT",
    );
    expect(await readCounts(fixture.organizationId)).toEqual(before);
  });

  it("allows one concurrent active session winner and rolls the loser back", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const settled = await Promise.allSettled([
      execute(confirmedRequest(fixture)),
      execute(confirmedRequest(fixture)),
    ]);
    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = settled.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "ACTIVE_VALET_SESSION_CONFLICT",
    });
    expect(await readCounts(fixture.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });

  it("rolls back Customer, Vehicle, ValetSession, and idempotency when AuditEvent insertion fails", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(runtimePool);
    const existing = await execute(temporaryRequest(fixture));
    const audit = await adminPool.query<{ id: string }>(
      `SELECT id::text FROM audit_events WHERE valet_session_id = $1`,
      [existing.valetSessionId],
    );
    const duplicateAuditId = audit.rows[0]!.id;
    const before = await readCounts(fixture.organizationId);
    await expect(
      createIntakeSessionCommandExecutor(runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })(
        temporaryRequest(fixture, {
          customer: differentCustomer("+962791234567"),
        }),
      ),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await readCounts(fixture.organizationId)).toEqual(before);
  });
});
