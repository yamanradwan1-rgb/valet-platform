import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import type { ValetSessionState } from "../src/modules/valet-sessions/protected-custody-command";
import {
  createVehicleIdentityCommandExecutor,
  normalizePlateNumber,
  type VehicleIdentityCommandRequest,
} from "../src/modules/vehicles/vehicle-identity-command";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
  vehicleId: string;
  vehicleUpdatedAt: Date;
}

interface FixtureOptions {
  locationAccess?: boolean;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  role?: MembershipRole;
  userStatus?: "ACTIVE" | "DISABLED";
}

interface LocationActor {
  locationId: string;
  membershipId: string;
  userId: string;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004d_app_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_identity_${uniqueSuffix}`;
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
  await new Promise<void>((resolvePromise, reject) => {
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
      if (code === 0) resolvePromise();
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

async function addVehicleSession(
  fixture: Pick<Fixture, "locationId" | "membershipId" | "organizationId">,
): Promise<Pick<Fixture, "sessionId" | "vehicleId" | "vehicleUpdatedAt">> {
  const sessionId = randomUUID();
  const vehicleId = randomUUID();
  const identity = randomUUID();
  const vehicle = await adminPool.query<{ updated_at: Date }>(
    `INSERT INTO vehicles
       (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, $3, transaction_timestamp())
     RETURNING updated_at`,
    [vehicleId, fixture.organizationId, `Test vehicle ${identity}`],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, version, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
             $3, $4, $5, 'CHECKING_IN', $6, 1, transaction_timestamp())`,
    [
      sessionId,
      `hash-${identity}`,
      fixture.organizationId,
      fixture.locationId,
      vehicleId,
      fixture.membershipId,
    ],
  );
  return {
    sessionId,
    vehicleId,
    vehicleUpdatedAt: vehicle.rows[0]!.updated_at,
  };
}

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const identity = randomUUID();
  const base = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    userId: randomUUID(),
  };
  await adminPool.query(
    `INSERT INTO organizations
       (id, name, status, timezone, updated_at)
     VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
    [base.organizationId, `VAL-004D ${identity}`],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, accepting_intake, updated_at)
     VALUES ($1, $2, 'Test location', $3, 'Test address', 'Asia/Amman',
             'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
    [base.locationId, base.organizationId, identity],
  );
  await adminPool.query(
    `INSERT INTO users
       (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', $3,
             transaction_timestamp())`,
    [base.userId, `${identity}@val-004d.test`, options.userStatus ?? "ACTIVE"],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
    [
      base.membershipId,
      base.organizationId,
      base.userId,
      options.role ?? "VALET_EMPLOYEE",
      options.membershipStatus ?? "ACTIVE",
    ],
  );
  if (options.locationAccess !== false) {
    await adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [base.organizationId, base.membershipId, base.locationId],
    );
  }
  return { ...base, ...(await addVehicleSession(base)) };
}

async function createLocationActor(fixture: Fixture): Promise<LocationActor> {
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  const identity = randomUUID();
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, accepting_intake, updated_at)
     VALUES ($1, $2, 'Sibling identity location', $3, 'Test address',
             'Asia/Amman', 'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
    [locationId, fixture.organizationId, identity],
  );
  await adminPool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
             transaction_timestamp())`,
    [userId, `${identity}@val-004j.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', 'ACTIVE',
             transaction_timestamp())`,
    [membershipId, fixture.organizationId, userId],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [fixture.organizationId, membershipId, locationId],
  );
  return { locationId, membershipId, userId };
}

async function addSharedVehicleSession(
  fixture: Fixture,
  actor: LocationActor,
  state: ValetSessionState = "CHECKING_IN",
): Promise<string> {
  const sessionId = randomUUID();
  await adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        customer_access_revoked_at, organization_id, location_id, vehicle_id,
        state, checked_in_by_membership_id, checking_in_completed_at,
        completed_at, version, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 hour', NULL,
             $3, $4, $5, $6::valet_session_state, $7,
             CASE WHEN $6::valet_session_state = 'CHECKING_IN' THEN NULL
                  ELSE transaction_timestamp() END,
             CASE WHEN $6::valet_session_state = 'COMPLETED'
                  THEN transaction_timestamp()
                  ELSE NULL END,
             1, transaction_timestamp())`,
    [
      sessionId,
      `hash-${randomUUID()}`,
      fixture.organizationId,
      actor.locationId,
      fixture.vehicleId,
      state,
      actor.membershipId,
    ],
  );
  return sessionId;
}

async function waitForBlockedQuery(queryPattern: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = await adminPool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid <> pg_backend_pid()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND query LIKE $1
       ) AS blocked`,
      [queryPattern],
    );
    if (result.rows[0]?.blocked === true) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`Timed out waiting for blocked query ${queryPattern}.`);
}

function confirmedRequest(
  fixture: Fixture,
  overrides: Partial<VehicleIdentityCommandRequest> = {},
): VehicleIdentityCommandRequest {
  return {
    authenticatedUserId: fixture.userId,
    expectedVehicleUpdatedAt: fixture.vehicleUpdatedAt,
    identity: {
      confirmedByHuman: true,
      mode: "CONFIRMED_PLATE",
      plateCountry: "jo",
      plateNumberRaw: "  ab- ١٢٣  ",
    },
    valetSessionId: fixture.sessionId,
    ...overrides,
  };
}

async function expectCommandError(
  operation: Promise<unknown>,
  code: string,
): Promise<Error & { code: string }> {
  try {
    await operation;
    throw new Error(`Expected vehicle identity command error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const commandError = error as Error & { code: string };
    expect(commandError.code).toBe(code);
    return commandError;
  }
}

async function readVehicle(vehicleId: string) {
  const result = await adminPool.query<{
    plate_country: string | null;
    plate_number_normalized: string | null;
    plate_number_raw: string | null;
    temporary_descriptor: string | null;
    updated_at: Date;
  }>(
    `SELECT plate_country, plate_number_raw, plate_number_normalized,
            temporary_descriptor, updated_at
     FROM vehicles WHERE id = $1`,
    [vehicleId],
  );
  return result.rows[0]!;
}

async function countAudits(sessionId: string): Promise<number> {
  const result = await adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
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

describe("vehicle identity normalization and authority", () => {
  it("normalizes Unicode and obvious separators deterministically", () => {
    expect(
      normalizePlateNumber(
        "  \uFF41b\u2013\uFF11\uFF12\uFF13 / \u0664\u0665  ",
      ),
    ).toEqual({
      plateNumberNormalized: "AB123\u0664\u0665",
      plateNumberRaw: "\uFF41b\u2013\uFF11\uFF12\uFF13 / \u0664\u0665",
    });
  });

  it("persists the human-confirmed raw and canonical plate", async () => {
    const fixture = await createFixture();
    const result = await createVehicleIdentityCommandExecutor(runtimePool)(
      confirmedRequest(fixture),
    );
    expect(result).toMatchObject({
      identityMode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberNormalized: "AB١٢٣",
      plateNumberRaw: "ab- ١٢٣",
    });
    expect(await readVehicle(fixture.vehicleId)).toMatchObject({
      plate_country: "JO",
      plate_number_normalized: "AB١٢٣",
      plate_number_raw: "ab- ١٢٣",
    });
  });

  it("normalizes compatibility-width plate countries to the two-letter contract", async () => {
    const fixture = await createFixture();
    const result = await createVehicleIdentityCommandExecutor(runtimePool)(
      confirmedRequest(fixture, {
        identity: {
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
          plateCountry: "  \uFF4A\uFF4F  ",
          plateNumberRaw: "ABC-123",
        },
      }),
    );
    expect(result.plateCountry).toBe("JO");
  });

  it("rejects invalid authoritative countries as domain errors without persistence", async () => {
    const fixture = await createFixture();
    const before = await readVehicle(fixture.vehicleId);
    const execute = createVehicleIdentityCommandExecutor(runtimePool);

    for (const plateCountry of ["USA", "J1", "   "]) {
      const error = await expectCommandError(
        execute(
          confirmedRequest(fixture, {
            identity: {
              confirmedByHuman: true,
              mode: "CONFIRMED_PLATE",
              plateCountry,
              plateNumberRaw: "ABC-123",
            },
          }),
        ),
        "VEHICLE_IDENTITY_INVALID",
      );
      expect(error.code).not.toBe("23514");
    }

    expect(await readVehicle(fixture.vehicleId)).toEqual(before);
    expect(await countAudits(fixture.sessionId)).toBe(0);
  });

  it("rejects invalid OCR candidate countries before persistence", async () => {
    const fixture = await createFixture();
    const before = await readVehicle(fixture.vehicleId);
    const error = await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(fixture, {
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCandidate: {
              plateCountry: "JORDAN",
              plateNumberRaw: "OCR-123",
              source: "OCR",
            },
            plateCountry: "JO",
            plateNumberRaw: "MANUAL-123",
          },
        }),
      ),
      "VEHICLE_IDENTITY_INVALID",
    );
    expect(error.code).not.toBe("23514");
    expect(await readVehicle(fixture.vehicleId)).toEqual(before);
    expect(await countAudits(fixture.sessionId)).toBe(0);
  });

  it("requires human confirmation and rejects empty canonical output", async () => {
    const fixture = await createFixture();
    await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(fixture, {
          identity: {
            confirmedByHuman: false,
            mode: "CONFIRMED_PLATE",
            plateCandidate: { plateNumberRaw: "OCR-123", source: "OCR" },
            plateCountry: "JO",
            plateNumberRaw: "OCR-123",
          },
        }),
      ),
      "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED",
    );
    await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(fixture, {
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: " - / . ",
          },
        }),
      ),
      "VEHICLE_IDENTITY_INVALID",
    );
    expect((await readVehicle(fixture.vehicleId)).plate_number_raw).toBeNull();
  });

  it("rejects an ambiguous mixture of identity modes", async () => {
    const fixture = await createFixture();
    await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)({
        ...confirmedRequest(fixture),
        identity: {
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
          plateCountry: "JO",
          plateNumberRaw: "ABC-1",
          temporaryDescriptor: "Black SUV",
        } as VehicleIdentityCommandRequest["identity"],
      }),
      "VEHICLE_IDENTITY_INVALID",
    );
  });

  it("keeps a confirmed manual value authoritative over OCR metadata", async () => {
    const fixture = await createFixture();
    const result = await createVehicleIdentityCommandExecutor(runtimePool)(
      confirmedRequest(fixture, {
        identity: {
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
          plateCandidate: {
            plateCountry: "US",
            plateNumberRaw: "OCR-WRONG",
            source: "ANPR",
          },
          plateCountry: "JO",
          plateNumberRaw: "manual-77",
        },
      }),
    );
    expect(result.plateNumberNormalized).toBe("MANUAL77");
  });
});

describe("vehicle identity authorization", () => {
  it("allows both accepted operational roles without an active Shift", async () => {
    for (const role of ["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const) {
      const fixture = await createFixture({ role });
      await expect(
        createVehicleIdentityCommandExecutor(runtimePool)(
          confirmedRequest(fixture),
        ),
      ).resolves.toMatchObject({ actor: { role } });
    }
  });

  it("denies inactive users and inactive memberships", async () => {
    const inactiveUser = await createFixture({ userStatus: "DISABLED" });
    const inactiveMembership = await createFixture({
      membershipStatus: "INACTIVE",
    });
    await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(inactiveUser),
      ),
      "AUTHORIZATION_DENIED",
    );
    await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(inactiveMembership),
      ),
      "TENANT_ACCESS_DENIED",
    );
  });

  it("denies missing location access and non-operational administrator roles", async () => {
    const noLocationAccess = await createFixture({ locationAccess: false });
    await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(noLocationAccess),
      ),
      "LOCATION_ACCESS_DENIED",
    );
    for (const role of ["LOCATION_MANAGER", "ORG_ADMIN"] as const) {
      const fixture = await createFixture({ role });
      await expectCommandError(
        createVehicleIdentityCommandExecutor(runtimePool)(
          confirmedRequest(fixture),
        ),
        "AUTHORIZATION_DENIED",
      );
    }
  });

  it("does not distinguish a foreign-tenant session from a missing session", async () => {
    const actor = await createFixture();
    const foreign = await createFixture();
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    const foreignError = await expectCommandError(
      execute(confirmedRequest(actor, { valetSessionId: foreign.sessionId })),
      "TENANT_ACCESS_DENIED",
    );
    const missingError = await expectCommandError(
      execute(confirmedRequest(actor, { valetSessionId: randomUUID() })),
      "TENANT_ACCESS_DENIED",
    );
    expect(foreignError.message).toBe(missingError.message);
  });
});

describe("temporary vehicle identity", () => {
  it("persists a trimmed descriptor and clears every canonical plate field", async () => {
    const fixture = await createFixture();
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    const plate = await execute(confirmedRequest(fixture));
    const fallback = await execute({
      authenticatedUserId: fixture.userId,
      expectedVehicleUpdatedAt: plate.vehicleUpdatedAt,
      identity: {
        mode: "TEMPORARY_DESCRIPTOR",
        temporaryDescriptor: "  Black SUV, lane 2  ",
      },
      valetSessionId: fixture.sessionId,
    });
    expect(fallback).toMatchObject({
      plateCountry: null,
      plateNumberNormalized: null,
      plateNumberRaw: null,
      temporaryDescriptor: "Black SUV, lane 2",
    });
    const audit = await adminPool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_events WHERE id = $1`,
      [fallback.auditEventId],
    );
    expect(audit.rows[0]?.event_type).toBe(
      "VEHICLE_TEMPORARY_DESCRIPTOR_IDENTITY_CORRECTED",
    );
  });

  it("rejects an empty or overlong descriptor without mutation", async () => {
    const fixture = await createFixture();
    for (const temporaryDescriptor of ["   ", "x".repeat(161)]) {
      await expectCommandError(
        createVehicleIdentityCommandExecutor(runtimePool)({
          authenticatedUserId: fixture.userId,
          expectedVehicleUpdatedAt: fixture.vehicleUpdatedAt,
          identity: { mode: "TEMPORARY_DESCRIPTOR", temporaryDescriptor },
          valetSessionId: fixture.sessionId,
        }),
        "VEHICLE_IDENTITY_INVALID",
      );
    }
    expect(
      (await readVehicle(fixture.vehicleId)).plate_number_normalized,
    ).toBeNull();
  });
});

describe("vehicle identity conflicts and concurrency", () => {
  it.each([
    "AWAITING_PARKING",
    "PARKING",
    "PARKED",
    "REQUESTED",
    "RETRIEVING",
    "READY",
    "HANDOFF_PENDING",
    "COMPLETED",
  ] as const)(
    "rejects the %s session as a Vehicle identity authority handle",
    async (state) => {
      const fixture = await createFixture();
      await adminPool.query(
        `UPDATE valet_sessions
         SET state = $2::valet_session_state,
             checking_in_completed_at = transaction_timestamp(),
             completed_at = CASE WHEN $2::valet_session_state = 'COMPLETED'
                                 THEN transaction_timestamp() ELSE NULL END
         WHERE id = $1`,
        [fixture.sessionId, state],
      );
      const before = await readVehicle(fixture.vehicleId);
      await expectCommandError(
        createVehicleIdentityCommandExecutor(runtimePool)(
          confirmedRequest(fixture),
        ),
        "VEHICLE_IDENTITY_SESSION_NOT_MUTABLE",
      );
      expect(await readVehicle(fixture.vehicleId)).toEqual(before);
      expect(await countAudits(fixture.sessionId)).toBe(0);
    },
  );

  it("rejects mutation when another Location has active custody of the shared Vehicle", async () => {
    const fixture = await createFixture();
    const sibling = await createLocationActor(fixture);
    const siblingSessionId = await addSharedVehicleSession(
      fixture,
      sibling,
      "PARKED",
    );
    const before = await readVehicle(fixture.vehicleId);
    const error = await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(fixture),
      ),
      "VEHICLE_IDENTITY_CUSTODY_CONFLICT",
    );
    expect(error.message).not.toContain(sibling.locationId);
    expect(error.message).not.toContain(siblingSessionId);
    expect(await readVehicle(fixture.vehicleId)).toEqual(before);
    expect(await countAudits(fixture.sessionId)).toBe(0);
  });

  it("rejects a temporary descriptor when another Location has active custody of the shared Vehicle", async () => {
    const fixture = await createFixture();
    const sibling = await createLocationActor(fixture);
    const siblingSessionId = await addSharedVehicleSession(
      fixture,
      sibling,
      "PARKED",
    );
    const before = await readVehicle(fixture.vehicleId);
    const auditCountBefore = await countAudits(fixture.sessionId);
    const error = await expectCommandError(
      createVehicleIdentityCommandExecutor(runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVehicleUpdatedAt: fixture.vehicleUpdatedAt,
        identity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Replacement temporary descriptor",
        },
        valetSessionId: fixture.sessionId,
      }),
      "VEHICLE_IDENTITY_CUSTODY_CONFLICT",
    );
    const after = await readVehicle(fixture.vehicleId);
    expect(error.message).not.toContain(sibling.locationId);
    expect(error.message).not.toContain(siblingSessionId);
    expect(after.plate_country).toBe(before.plate_country);
    expect(after.plate_number_raw).toBe(before.plate_number_raw);
    expect(after.plate_number_normalized).toBe(
      before.plate_number_normalized,
    );
    expect(after.temporary_descriptor).toBe(before.temporary_descriptor);
    expect(after.updated_at).toEqual(before.updated_at);
    expect(await countAudits(fixture.sessionId)).toBe(auditCountBefore);
  });

  it("cannot mutate after another Location completes check-in while holding the shared Vehicle", async () => {
    const fixture = await createFixture();
    const sibling = await createLocationActor(fixture);
    const siblingSessionId = await addSharedVehicleSession(fixture, sibling);
    const before = await readVehicle(fixture.vehicleId);
    const completionTransaction = await adminPool.connect();
    try {
      await completionTransaction.query("BEGIN");
      await completionTransaction.query(
        `SELECT id FROM valet_sessions WHERE id = $1 FOR UPDATE`,
        [siblingSessionId],
      );
      await completionTransaction.query(
        `SELECT id FROM vehicles WHERE id = $1 FOR SHARE`,
        [fixture.vehicleId],
      );
      const mutation = createVehicleIdentityCommandExecutor(runtimePool)(
        confirmedRequest(fixture),
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedQuery("%FROM vehicles%FOR UPDATE%");
      await completionTransaction.query(
        `UPDATE valet_sessions
         SET state = 'AWAITING_PARKING',
             checking_in_completed_at = transaction_timestamp(),
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE id = $1 AND state = 'CHECKING_IN'`,
        [siblingSessionId],
      );
      await completionTransaction.query("COMMIT");
      expect(await mutation).toMatchObject({
        reason: { code: "VEHICLE_IDENTITY_CUSTODY_CONFLICT" },
        status: "rejected",
      });
    } catch (error) {
      await completionTransaction.query("ROLLBACK");
      throw error;
    } finally {
      completionTransaction.release();
    }
    expect(await readVehicle(fixture.vehicleId)).toEqual(before);
    expect(await countAudits(fixture.sessionId)).toBe(0);
  });

  it(
    "serializes confirmed-plate intake before the cross-Location custody check",
    async () => {
      const fixture = await createFixture();
      const sibling = await createLocationActor(fixture);
      const executeIdentity = createVehicleIdentityCommandExecutor(runtimePool);
      const identified = await executeIdentity(confirmedRequest(fixture));
      const beforeCorrection = await readVehicle(fixture.vehicleId);
      const sessionGate = await adminPool.connect();
      try {
        await sessionGate.query("BEGIN");
        await sessionGate.query(
          `SELECT id FROM valet_sessions WHERE id = $1 FOR UPDATE`,
          [fixture.sessionId],
        );
        const correction = executeIdentity({
          ...confirmedRequest(fixture),
          expectedVehicleUpdatedAt: identified.vehicleUpdatedAt,
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: `corrected-${randomUUID()}`,
          },
        }).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        );
        await waitForBlockedQuery("%FROM valet_sessions AS session%FOR UPDATE%");
        const intake = await createIntakeSessionCommandExecutor(runtimePool)({
          authenticatedUserId: sibling.userId,
          intakeOperationId: `intake:${randomUUID()}`,
          targetLocationId: sibling.locationId,
          vehicleIdentity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: beforeCorrection.plate_number_raw!,
          },
        });
        expect(intake.vehicleId).toBe(fixture.vehicleId);
        await sessionGate.query("COMMIT");
        expect(await correction).toMatchObject({
          reason: { code: "VEHICLE_IDENTITY_CUSTODY_CONFLICT" },
          status: "rejected",
        });
      } catch (error) {
        await sessionGate.query("ROLLBACK");
        throw error;
      } finally {
        sessionGate.release();
      }
      expect(await readVehicle(fixture.vehicleId)).toEqual(beforeCorrection);
      expect(await countAudits(fixture.sessionId)).toBe(1);
    },
    10_000,
  );

  it("rejects same-Organization conflicts and never merges records", async () => {
    const first = await createFixture();
    const secondVehicle = await addVehicleSession(first);
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    await execute(confirmedRequest(first));
    const before = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM vehicles WHERE organization_id = $1`,
      [first.organizationId],
    );
    await expectCommandError(
      execute({
        ...confirmedRequest(first),
        expectedVehicleUpdatedAt: secondVehicle.vehicleUpdatedAt,
        valetSessionId: secondVehicle.sessionId,
      }),
      "VEHICLE_IDENTITY_CONFLICT",
    );
    const after = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM vehicles WHERE organization_id = $1`,
      [first.organizationId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(
      (await readVehicle(secondVehicle.vehicleId)).plate_number_normalized,
    ).toBeNull();
  });

  it("gives one winner for concurrent same-Organization plate claims", async () => {
    const first = await createFixture();
    const second = await addVehicleSession(first);
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    const results = await Promise.allSettled([
      execute(confirmedRequest(first)),
      execute({
        ...confirmedRequest(first),
        expectedVehicleUpdatedAt: second.vehicleUpdatedAt,
        valetSessionId: second.sessionId,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      (
        results.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult
      ).reason,
    ).toMatchObject({
      code: "VEHICLE_IDENTITY_CONFLICT",
    });
  });

  it("allows the same normalized plate in different Organizations", async () => {
    const first = await createFixture();
    const second = await createFixture();
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    await expect(
      Promise.all([
        execute(confirmedRequest(first)),
        execute(confirmedRequest(second)),
      ]),
    ).resolves.toHaveLength(2);
  });

  it("rejects stale competing correction instead of losing an update", async () => {
    const fixture = await createFixture();
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    const first = await execute(confirmedRequest(fixture));
    const corrections = await Promise.allSettled([
      execute({
        ...confirmedRequest(fixture),
        expectedVehicleUpdatedAt: first.vehicleUpdatedAt,
        identity: {
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
          plateCountry: "JO",
          plateNumberRaw: "NEW-1",
        },
      }),
      execute({
        ...confirmedRequest(fixture),
        expectedVehicleUpdatedAt: first.vehicleUpdatedAt,
        identity: {
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
          plateCountry: "JO",
          plateNumberRaw: "NEW-2",
        },
      }),
    ]);
    expect(
      corrections.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (
        corrections.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult
      ).reason,
    ).toMatchObject({
      code: "VEHICLE_IDENTITY_VERSION_CONFLICT",
    });
    const winner = corrections.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<{
      auditEventId: string;
      vehicleUpdatedAt: Date;
    }>;
    expect(winner.value.vehicleUpdatedAt.getTime()).toBeGreaterThan(
      first.vehicleUpdatedAt.getTime(),
    );
    const audit = await adminPool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_events WHERE id = $1`,
      [winner.value.auditEventId],
    );
    expect(audit.rows[0]?.event_type).toBe(
      "VEHICLE_CONFIRMED_PLATE_IDENTITY_CORRECTED",
    );
  });

  it("rejects a correction that conflicts with another Vehicle", async () => {
    const first = await createFixture();
    const second = await addVehicleSession(first);
    const execute = createVehicleIdentityCommandExecutor(runtimePool);
    await execute(confirmedRequest(first));
    const secondIdentity = await execute({
      ...confirmedRequest(first),
      expectedVehicleUpdatedAt: second.vehicleUpdatedAt,
      identity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "SECOND-2",
      },
      valetSessionId: second.sessionId,
    });
    await expectCommandError(
      execute({
        ...confirmedRequest(first),
        expectedVehicleUpdatedAt: secondIdentity.vehicleUpdatedAt,
        valetSessionId: second.sessionId,
      }),
      "VEHICLE_IDENTITY_CONFLICT",
    );
    expect((await readVehicle(second.vehicleId)).plate_number_normalized).toBe(
      "SECOND2",
    );
  });
});

describe("vehicle identity audit atomicity", () => {
  it("creates exactly one safe Vehicle AuditEvent with one successful mutation", async () => {
    const fixture = await createFixture();
    const result = await createVehicleIdentityCommandExecutor(runtimePool)(
      confirmedRequest(fixture),
    );
    const audit = await adminPool.query<{
      entity_id: string;
      entity_type: string;
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT entity_id::text, entity_type, event_type, metadata_json
       FROM audit_events WHERE id = $1`,
      [result.auditEventId],
    );
    expect(await countAudits(fixture.sessionId)).toBe(1);
    expect(audit.rows[0]).toEqual({
      entity_id: fixture.vehicleId,
      entity_type: "Vehicle",
      event_type: "VEHICLE_CONFIRMED_PLATE_IDENTITY_SET",
      metadata_json: {
        identityMode: "CONFIRMED_PLATE",
        mutationKind: "SET",
        normalizationVersion: "V1",
      },
    });
    expect(JSON.stringify(audit.rows[0])).not.toContain("ab- ١٢٣");
  });

  it("rolls the identity mutation back when required audit creation fails", async () => {
    const fixture = await createFixture();
    const duplicateAuditId = randomUUID();
    await adminPool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'EXISTING', 'Vehicle', $6,
               '{}'::jsonb, transaction_timestamp())`,
      [
        duplicateAuditId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
        fixture.vehicleId,
      ],
    );
    await expect(
      createVehicleIdentityCommandExecutor(runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })(confirmedRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (await readVehicle(fixture.vehicleId)).plate_number_normalized,
    ).toBeNull();
    expect(await countAudits(fixture.sessionId)).toBe(1);
  });
});
