import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  MiddlewareConsumer,
  Module,
  Logger,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AppController } from "../src/app.controller";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
  type OperationMeasurement,
} from "../src/common/observability/operation-observability";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/check-in-api/check-in-api.boundaries";
import {
  GuestCheckInController,
  StaffCheckInController,
} from "../src/modules/check-in-api/check-in-api.controller";
import { CheckInApiService } from "../src/modules/check-in-api/check-in-api.service";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  staffToken: string;
  userId: string;
}

interface CheckInOperationMeasurement extends OperationMeasurement {
  readonly checkInElapsedMs?: number;
}

interface FixtureOptions {
  locationAccess?: boolean;
  locationPhotoRequiredOverride?: boolean | null;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  organizationPhotoRequired?: boolean;
  role?:
    "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_EMPLOYEE" | "VALET_SUPERVISOR";
  userStatus?: "ACTIVE" | "DISABLED";
}

interface HttpResult {
  body: Record<string, unknown>;
  requestId: string | null;
  status: number;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004i_http_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_http_${uniqueSuffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const principals = new Map<string, string>();
const measurements: CheckInOperationMeasurement[] = [];
let clockValue = 100;
let observerFailureOperation: string | undefined;

const testPrincipalResolver: StaffPrincipalResolver = {
  async resolve(authorization) {
    if (authorization === "Bearer force-internal-error") {
      throw new Error("test-only unexpected principal failure");
    }
    const userId =
      authorization === undefined ? undefined : principals.get(authorization);
    if (userId === undefined) {
      return new FailClosedStaffPrincipalResolver().resolve(authorization);
    }
    return { userId };
  },
};

let adminPool: Pool;
let app: INestApplication;
let baseUrl: string;
let databaseCreated = false;
let runtimePool: Pool;
let runtimeRoleCreated = false;
let testMigrationUrl: string;
let testRuntimeUrl: string;

@Module({
  controllers: [AppController, StaffCheckInController, GuestCheckInController],
  providers: [
    CheckInApiService,
    CheckInOperationRunner,
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    TrustedClientAddressResolver,
    RequestIdMiddleware,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: testPrincipalResolver },
    {
      provide: OPERATION_OBSERVER,
      useValue: {
        observe(measurement: CheckInOperationMeasurement) {
          measurements.push(measurement);
          if (measurement.operation === observerFailureOperation) {
            throw new Error("test-only observer failure");
          }
        },
      },
    },
    {
      provide: MONOTONIC_CLOCK,
      useValue: {
        now() {
          const current = clockValue;
          clockValue += 7;
          return current;
        },
      },
    },
  ],
})
class TestCheckInApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(StaffCheckInController, GuestCheckInController);
  }
}

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

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const fixture = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    staffToken: `staff-${randomUUID()}`,
    userId: randomUUID(),
  };
  const identity = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations
       (id, name, status, timezone, check_in_photos_required, updated_at)
     VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', $3,
             transaction_timestamp())`,
    [
      fixture.organizationId,
      `VAL-004I ${identity}`,
      options.organizationPhotoRequired ?? false,
    ],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, check_in_photos_required_override, updated_at)
     VALUES ($1, $2, 'HTTP location', $3, 'Test address', 'Asia/Amman',
             'JOD', 'ACTIVE', $4, transaction_timestamp())`,
    [
      fixture.locationId,
      fixture.organizationId,
      identity,
      options.locationPhotoRequiredOverride ?? null,
    ],
  );
  await adminPool.query(
    `INSERT INTO users
       (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', $3,
             transaction_timestamp())`,
    [
      fixture.userId,
      `${identity}@val-004i.test`,
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
  principals.set(`Bearer ${fixture.staffToken}`, fixture.userId);
  return fixture;
}

async function createSiblingLocationFixture(owner: Fixture): Promise<Fixture> {
  const sibling = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: owner.organizationId,
    staffToken: `staff-${randomUUID()}`,
    userId: randomUUID(),
  };
  const identity = randomUUID();
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Sibling HTTP location', $3, 'Test address',
             'Asia/Amman', 'JOD', 'ACTIVE', transaction_timestamp())`,
    [sibling.locationId, sibling.organizationId, identity],
  );
  await adminPool.query(
    `INSERT INTO users
       (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
             transaction_timestamp())`,
    [sibling.userId, `${identity}@val-004i-sibling.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', 'ACTIVE',
             transaction_timestamp())`,
    [sibling.membershipId, sibling.organizationId, sibling.userId],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [sibling.organizationId, sibling.membershipId, sibling.locationId],
  );
  principals.set(`Bearer ${sibling.staffToken}`, sibling.userId);
  return sibling;
}

async function http(
  method: string,
  path: string,
  options: {
    body?: unknown;
    requestId?: string;
    staffToken?: string;
  } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (options.staffToken !== undefined) {
    headers.authorization = `Bearer ${options.staffToken}`;
  }
  if (options.requestId !== undefined)
    headers["x-request-id"] = options.requestId;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    requestId: response.headers.get("x-request-id"),
    status: response.status,
  };
}

async function intake(
  fixture: Fixture,
  vehicleIdentity: Record<string, unknown> = {
    mode: "TEMPORARY_DESCRIPTOR",
    temporaryDescriptor: `Manual ${randomUUID()}`,
  },
) {
  return http("POST", "/v1/staff/check-in/intakes", {
    body: {
      intakeOperationId: `intake:${randomUUID()}`,
      targetLocationId: fixture.locationId,
      vehicleIdentity,
    },
    staffToken: fixture.staffToken,
  });
}

async function guestSession(authorization?: string): Promise<{
  body: Record<string, unknown>;
  headers: Headers;
  status: number;
}> {
  const response = await fetch(`${baseUrl}/v1/guest/session`, {
    headers: authorization === undefined ? {} : { authorization },
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
    status: response.status,
  };
}

beforeAll(async () => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
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
  app = await NestFactory.create(TestCheckInApiModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

beforeEach(async () => {
  await adminPool.query("DELETE FROM anti_abuse_events");
});

afterAll(async () => {
  await app?.close();
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

describe("VAL-004I Check-In HTTP integration", () => {
  it("preserves the existing health route and normal Nest semantics outside VAL-004I", async () => {
    const health = await fetch(`${baseUrl}/`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ name: "valet-api", status: "ok" });

    const missing = await fetch(`${baseUrl}/unrelated-missing-route`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: "Not Found",
      statusCode: 404,
    });
  });

  it("runs the optional-photo normal flow through the runtime role and emits the persisted elapsed KPI", async () => {
    const fixture = await createFixture();
    const firstMetric = measurements.length;
    const created = await intake(fixture, {
      confirmedByHuman: true,
      mode: "CONFIRMED_PLATE",
      plateCountry: "jo",
      plateNumberRaw: `http-${randomUUID()}`,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ state: "CHECKING_IN", version: 1 });
    expect(typeof created.body.vehicleUpdatedAt).toBe("string");

    const sessionId = created.body.valetSessionId as string;
    const condition = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
      { body: {}, staffToken: fixture.staffToken },
    );
    expect(condition.status).toBe(200);
    const completed = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/complete`,
      { body: { expectedVersion: 1 }, staffToken: fixture.staffToken },
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      state: "AWAITING_PARKING",
      version: 2,
    });
    expect(
      new Date(completed.body.checkingInCompletedAt as string).toISOString(),
    ).toBe(completed.body.checkingInCompletedAt);

    const events = await adminPool.query<{ event_type: string }>(
      `SELECT event_type::text
       FROM audit_events
       WHERE organization_id = $1
       ORDER BY occurred_at, created_at, id`,
      [fixture.organizationId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      "VALET_SESSION_CREATED",
      "VALET_SESSION_CHECK_IN_CONDITION_COMPLETED",
      "VALET_SESSION_CHECK_IN_COMPLETED",
    ]);
    const flowMetrics = measurements.slice(firstMetric);
    expect(flowMetrics).toHaveLength(3);
    expect(flowMetrics.every((metric) => metric.durationMs === 7)).toBe(true);
    expect(
      flowMetrics.find((metric) => metric.operation === "COMPLETE_CHECK_IN")
        ?.checkInElapsedMs,
    ).toBeGreaterThanOrEqual(0);

    const currentUser = await runtimePool.query<{ current_user: string }>(
      `SELECT current_user`,
    );
    expect(currentUser.rows[0]?.current_user).toBe(runtimeRole);
  });

  it("supports manual identity then a human-confirmed update using the intake concurrency token", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const acceptedPlate = `manual-${randomUUID()}`;
    const unconfirmed = await http(
      "PUT",
      `/v1/staff/check-in/sessions/${String(created.body.valetSessionId)}/vehicle-identity`,
      {
        body: {
          expectedVehicleUpdatedAt: created.body.vehicleUpdatedAt,
          identity: {
            confirmedByHuman: false,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: `unconfirmed-${randomUUID()}`,
          },
        },
        staffToken: fixture.staffToken,
      },
    );
    expect(unconfirmed).toMatchObject({
      body: { code: "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED" },
      status: 422,
    });
    const response = await http(
      "PUT",
      `/v1/staff/check-in/sessions/${String(created.body.valetSessionId)}/vehicle-identity`,
      {
        body: {
          expectedVehicleUpdatedAt: created.body.vehicleUpdatedAt,
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCandidate: {
              plateCountry: "jo",
              plateNumberRaw: "assistive candidate",
              source: "OCR",
            },
            plateCountry: "jo",
            plateNumberRaw: acceptedPlate,
          },
        },
        staffToken: fixture.staffToken,
      },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      identityMode: "CONFIRMED_PLATE",
      plateCountry: "JO",
    });
    const stale = await http(
      "PUT",
      `/v1/staff/check-in/sessions/${String(created.body.valetSessionId)}/vehicle-identity`,
      {
        body: {
          expectedVehicleUpdatedAt: created.body.vehicleUpdatedAt,
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: `stale-${randomUUID()}`,
          },
        },
        staffToken: fixture.staffToken,
      },
    );
    expect(stale).toMatchObject({
      body: { code: "VEHICLE_IDENTITY_VERSION_CONFLICT" },
      status: 409,
    });

    const second = await intake(fixture);
    const conflict = await http(
      "PUT",
      `/v1/staff/check-in/sessions/${String(second.body.valetSessionId)}/vehicle-identity`,
      {
        body: {
          expectedVehicleUpdatedAt: second.body.vehicleUpdatedAt,
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: acceptedPlate,
          },
        },
        staffToken: fixture.staffToken,
      },
    );
    expect(conflict).toMatchObject({
      body: { code: "VEHICLE_IDENTITY_CONFLICT" },
      status: 409,
    });
  });

  it("returns a non-disclosing conflict when another Location has active custody of the shared Vehicle", async () => {
    const owner = await createFixture();
    const sibling = await createSiblingLocationFixture(owner);
    const plateNumberRaw = `shared-${randomUUID()}`;
    const vehicleIdentity = {
      confirmedByHuman: true,
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw,
    };
    const ownerSession = await intake(owner, vehicleIdentity);
    const siblingSession = await intake(sibling, vehicleIdentity);
    expect(ownerSession.status).toBe(201);
    expect(siblingSession.status).toBe(201);

    const response = await http(
      "PUT",
      `/v1/staff/check-in/sessions/${String(ownerSession.body.valetSessionId)}/vehicle-identity`,
      {
        body: {
          expectedVehicleUpdatedAt: ownerSession.body.vehicleUpdatedAt,
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: `corrected-${randomUUID()}`,
          },
        },
        staffToken: owner.staffToken,
      },
    );
    expect(response).toMatchObject({
      body: { code: "VEHICLE_IDENTITY_CUSTODY_CONFLICT" },
      status: 409,
    });
    expect(JSON.stringify(response.body)).not.toContain(sibling.locationId);
    expect(JSON.stringify(response.body)).not.toContain(
      siblingSession.body.valetSessionId,
    );
  });

  it("routes append-only condition notes, corrections, and deterministic correction conflicts", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const sessionId = String(created.body.valetSessionId);
    const note = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-notes`,
      { body: { content: "Existing scratch" }, staffToken: fixture.staffToken },
    );
    expect(note.status).toBe(201);
    expect(new Date(note.body.createdAt as string).toISOString()).toBe(
      note.body.createdAt,
    );
    const noteId = String(note.body.conditionNoteId);
    const correction = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-notes/${noteId}/corrections`,
      {
        body: { content: "Corrected scratch" },
        staffToken: fixture.staffToken,
      },
    );
    expect(correction).toMatchObject({
      body: { supersedesConditionNoteId: noteId },
      status: 201,
    });
    const repeated = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-notes/${noteId}/corrections`,
      {
        body: { content: "Second direct correction" },
        staffToken: fixture.staffToken,
      },
    );
    expect(repeated).toMatchObject({
      body: { code: "CONDITION_NOTE_ALREADY_SUPERSEDED" },
      status: 409,
    });
    const original = await adminPool.query<{ content: string }>(
      `SELECT content FROM condition_notes WHERE id = $1`,
      [noteId],
    );
    expect(original.rows[0]?.content).toBe("Existing scratch");
  });

  it("keeps required-photo completion blocked by unverified metadata without leaking storage details", async () => {
    const fixture = await createFixture({ organizationPhotoRequired: true });
    const created = await intake(fixture);
    const sessionId = String(created.body.valetSessionId);
    const markerWithoutPhoto = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
      { body: {}, staffToken: fixture.staffToken },
    );
    expect(markerWithoutPhoto).toMatchObject({
      body: { code: "CHECK_IN_CONDITION_PHOTO_REQUIRED" },
      status: 422,
    });
    const storageObjectKey = `private/${randomUUID()}`;
    const photo = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-photos`,
      {
        body: { contentType: "image/jpeg", storageObjectKey },
        staffToken: fixture.staffToken,
      },
    );
    expect(photo.status).toBe(201);
    expect(JSON.stringify(photo.body)).not.toContain(storageObjectKey);
    const marker = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
      { body: {}, staffToken: fixture.staffToken },
    );
    expect(marker).toMatchObject({
      body: { code: "CHECK_IN_CONDITION_PHOTO_REQUIRED" },
      status: 422,
    });
    expect(JSON.stringify(marker.body)).not.toContain(storageObjectKey);
    const persisted = await adminPool.query<{
      completion_audits: number;
      marker_completed: boolean;
      vehicle_photos: number;
    }>(
      `SELECT
         (session.check_in_condition_completed_at IS NOT NULL OR
          session.check_in_condition_completed_by_membership_id IS NOT NULL)
           AS marker_completed,
         (SELECT count(*)::integer FROM vehicle_photos
          WHERE valet_session_id = session.id) AS vehicle_photos,
         (SELECT count(*)::integer FROM audit_events
          WHERE valet_session_id = session.id
            AND event_type = 'VALET_SESSION_CHECK_IN_CONDITION_COMPLETED')
           AS completion_audits
       FROM valet_sessions AS session
       WHERE session.id = $1`,
      [sessionId],
    );
    expect(persisted.rows[0]).toEqual({
      completion_audits: 0,
      marker_completed: false,
      vehicle_photos: 1,
    });
  });

  it("uses the current Organization default and Location override at Complete Check-In", async () => {
    const inherited = await createFixture({
      locationPhotoRequiredOverride: null,
      organizationPhotoRequired: false,
    });
    const inheritedSession = await intake(inherited);
    const inheritedSessionId = String(inheritedSession.body.valetSessionId);
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${inheritedSessionId}/condition-completion`,
        { body: {}, staffToken: inherited.staffToken },
      ),
    ).toMatchObject({ status: 200 });
    await adminPool.query(
      `UPDATE organizations SET check_in_photos_required = true
       WHERE id = $1`,
      [inherited.organizationId],
    );
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${inheritedSessionId}/complete`,
        { body: { expectedVersion: 1 }, staffToken: inherited.staffToken },
      ),
    ).toMatchObject({
      body: { code: "PHOTO_REQUIREMENT_NOT_SATISFIED" },
      status: 422,
    });

    const explicitFalse = await createFixture({
      locationPhotoRequiredOverride: false,
      organizationPhotoRequired: true,
    });
    const explicitFalseSession = await intake(explicitFalse);
    const explicitFalseSessionId = String(
      explicitFalseSession.body.valetSessionId,
    );
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${explicitFalseSessionId}/condition-completion`,
        { body: {}, staffToken: explicitFalse.staffToken },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${explicitFalseSessionId}/complete`,
        { body: { expectedVersion: 1 }, staffToken: explicitFalse.staffToken },
      ),
    ).toMatchObject({
      body: { state: "AWAITING_PARKING", version: 2 },
      status: 200,
    });

    const explicitTrue = await createFixture({
      locationPhotoRequiredOverride: false,
      organizationPhotoRequired: false,
    });
    const explicitTrueSession = await intake(explicitTrue);
    const explicitTrueSessionId = String(
      explicitTrueSession.body.valetSessionId,
    );
    await http(
      "POST",
      `/v1/staff/check-in/sessions/${explicitTrueSessionId}/condition-completion`,
      { body: {}, staffToken: explicitTrue.staffToken },
    );
    await adminPool.query(
      `UPDATE locations SET check_in_photos_required_override = true
       WHERE id = $1`,
      [explicitTrue.locationId],
    );
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${explicitTrueSessionId}/complete`,
        { body: { expectedVersion: 1 }, staffToken: explicitTrue.staffToken },
      ),
    ).toMatchObject({
      body: { code: "PHOTO_REQUIREMENT_NOT_SATISFIED" },
      status: 422,
    });
  });

  it("issues bearer-only guest access, invalidates rotated and revoked tokens, and returns only the safe session view", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const sessionId = String(created.body.valetSessionId);
    const issue = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      {
        body: { intent: "ISSUE_OR_ROTATE" },
        staffToken: fixture.staffToken,
      },
    );
    expect(issue.status).toBe(200);
    const rawToken = issue.body.rawToken as string;
    const guest = await fetch(`${baseUrl}/v1/guest/session`, {
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(guest.status).toBe(200);
    const guestBody = (await guest.json()) as Record<string, unknown>;
    expect(Object.keys(guestBody).sort()).toEqual([
      "state",
      "valetSessionId",
      "vehicle",
    ]);
    expect(JSON.stringify(guestBody)).not.toContain(rawToken);
    const invalidGuestResults: Array<{
      body: Record<string, unknown>;
      status: number;
    }> = [];

    const rotatedIssue = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      {
        body: { intent: "ISSUE_OR_ROTATE" },
        staffToken: fixture.staffToken,
      },
    );
    const rotatedToken = rotatedIssue.body.rawToken as string;
    expect(rotatedToken).not.toBe(rawToken);
    invalidGuestResults.push(await guestSession(`Bearer ${rawToken}`));
    await adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [sessionId],
    );
    invalidGuestResults.push(await guestSession(`Bearer ${rotatedToken}`));
    const refreshedIssue = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      {
        body: { intent: "ISSUE_OR_ROTATE" },
        staffToken: fixture.staffToken,
      },
    );
    const currentToken = refreshedIssue.body.rawToken as string;

    const revoke = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
      { body: {}, staffToken: fixture.staffToken },
    );
    expect(revoke.status).toBe(200);
    expect(JSON.stringify(revoke.body)).not.toContain(currentToken);
    invalidGuestResults.push(await guestSession(`Bearer ${currentToken}`));
    invalidGuestResults.push(
      ...(await Promise.all([
        guestSession(),
        guestSession("Bearer malformed"),
        guestSession(`Bearer ${"A".repeat(43)}`),
      ])),
    );
    expect(invalidGuestResults).toHaveLength(6);
    expect(
      invalidGuestResults.map((result) => ({
        code: result.body.code,
        message: result.body.message,
        status: result.status,
      })),
    ).toEqual(
      Array.from({ length: 6 }, () => ({
        code: "GUEST_ACCESS_INVALID",
        message: "Guest access is invalid.",
        status: 401,
      })),
    );
    const reissue = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      {
        body: {
          expectedRevokedAt: revoke.body.revokedAt,
          intent: "REISSUE_REVOKED",
        },
        staffToken: fixture.staffToken,
      },
    );
    expect(reissue.status).toBe(200);
    const reissuedToken = reissue.body.rawToken as string;
    expect(
      await fetch(`${baseUrl}/v1/guest/session`, {
        headers: { authorization: `Bearer ${reissuedToken}` },
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await fetch(`${baseUrl}/v1/guest/session`, {
        headers: { authorization: `Bearer ${currentToken}` },
      }),
    ).toMatchObject({ status: 401 });
    const persisted = await adminPool.query<{ token_hash: string }>(
      `SELECT customer_access_token_hash AS token_hash
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(persisted.rows[0]?.token_hash).not.toContain(reissuedToken);
    const audits = await adminPool.query<{ text: string }>(
      `SELECT coalesce(string_agg(metadata_json::text, ''), '') AS text
       FROM audit_events WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    expect(audits.rows[0]?.text).not.toContain(reissuedToken);
    expect(JSON.stringify(measurements)).not.toContain(reissuedToken);
  });

  it("bounds rotating random guest tokens at sixty address failures without persisting raw inputs", async () => {
    const rawTokens = Array.from({ length: 61 }, () =>
      randomBytes(32).toString("base64url"),
    );
    for (const rawToken of rawTokens.slice(0, 60)) {
      expect(await guestSession(`Bearer ${rawToken}`)).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
    }
    const blocked = await guestSession(`Bearer ${rawTokens[60]}`);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      code: "GUEST_ACCESS_RATE_LIMITED",
      message: "Too many requests. Try again later.",
    });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(
      1,
    );
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    const persisted = await adminPool.query<{
      address_failures: string;
      token_events: string;
      text: string;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE scope = 'v1:guest-client-address' AND state = 'COUNTED'
         )::text AS address_failures,
         count(*) FILTER (WHERE scope = 'v1:guest-token')::text AS token_events,
         coalesce(string_agg(key_hash, ''), '') AS text
       FROM anti_abuse_events`,
    );
    expect(persisted.rows[0]?.address_failures).toBe("60");
    expect(persisted.rows[0]?.token_events).toBe("60");
    for (const rawToken of rawTokens) {
      expect(persisted.rows[0]?.text).not.toContain(rawToken);
    }
  }, 60_000);

  it("counts every shape-valid guest token request and ignores successful address reservations", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const issued = await http(
      "POST",
      `/v1/staff/check-in/sessions/${String(created.body.valetSessionId)}/guest-access/issue`,
      {
        body: { intent: "ISSUE_OR_ROTATE" },
        staffToken: fixture.staffToken,
      },
    );
    const rawToken = String(issued.body.rawToken);
    for (let index = 0; index < 180; index += 1) {
      expect(await guestSession(`Bearer ${rawToken}`)).toMatchObject({
        status: 200,
      });
    }
    const blocked = await guestSession(`Bearer ${rawToken}`);
    expect(blocked.status).toBe(429);
    const states = await adminPool.query<{
      address_counted: string;
      address_ignored: string;
      token_counted: string;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE scope = 'v1:guest-client-address' AND state = 'COUNTED'
         )::text AS address_counted,
         count(*) FILTER (
           WHERE scope = 'v1:guest-client-address' AND state = 'IGNORED'
         )::text AS address_ignored,
         count(*) FILTER (
           WHERE scope = 'v1:guest-token' AND state = 'COUNTED'
         )::text AS token_counted
       FROM anti_abuse_events`,
    );
    expect(states.rows[0]).toEqual({
      address_counted: "0",
      address_ignored: "181",
      token_counted: "180",
    });
  }, 60_000);

  it("returns no guest data when authoritative success finalization fails", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const issued = await http(
      "POST",
      `/v1/staff/check-in/sessions/${String(created.body.valetSessionId)}/guest-access/issue`,
      {
        body: { intent: "ISSUE_OR_ROTATE" },
        staffToken: fixture.staffToken,
      },
    );
    await adminPool.query(
      `CREATE FUNCTION test_block_guest_ignored() RETURNS trigger
       LANGUAGE plpgsql AS $$ BEGIN
         IF NEW.state = 'IGNORED' THEN RAISE EXCEPTION 'blocked'; END IF;
         RETURN NEW;
       END $$;
       CREATE TRIGGER test_block_guest_ignored
       BEFORE UPDATE ON anti_abuse_events
       FOR EACH ROW EXECUTE FUNCTION test_block_guest_ignored()`,
    );
    try {
      const result = await guestSession(
        `Bearer ${String(issued.body.rawToken)}`,
      );
      expect(result.status).toBe(503);
      expect(result.body).toMatchObject({ code: "ANTI_ABUSE_UNAVAILABLE" });
      expect(result.body).not.toHaveProperty("valetSessionId");
    } finally {
      await adminPool.query(
        `DROP TRIGGER test_block_guest_ignored ON anti_abuse_events`,
      );
      await adminPool.query(`DROP FUNCTION test_block_guest_ignored()`);
    }
  });

  it("uses the greatest database-authored Retry-After without extending either exhausted window", async () => {
    const limiter = app.get(AntiAbuseService);
    const rawToken = randomBytes(32).toString("base64url");
    const addressKey = limiter.key("v1:guest-client-address", "127.0.0.1");
    const tokenKey = limiter.key("v1:guest-token", rawToken);
    await adminPool.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, occurred_at, state)
       SELECT $1, $2, clock_timestamp() - INTERVAL '5 minutes', 'COUNTED'
       FROM generate_series(1, 60)
       UNION ALL
       SELECT $3, $4, clock_timestamp() - INTERVAL '1 minute', 'COUNTED'
       FROM generate_series(1, 180)`,
      [addressKey.scope, addressKey.keyHash, tokenKey.scope, tokenKey.keyHash],
    );
    const first = await guestSession(`Bearer ${rawToken}`);
    const second = await guestSession(`Bearer ${rawToken}`);
    expect(first.status).toBe(429);
    expect(second.status).toBe(429);
    const firstRetry = Number(first.headers.get("retry-after"));
    const secondRetry = Number(second.headers.get("retry-after"));
    expect(firstRetry).toBeGreaterThanOrEqual(830);
    expect(firstRetry).toBeLessThanOrEqual(840);
    expect(secondRetry).toBeLessThanOrEqual(firstRetry);
    const rows = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM anti_abuse_events`,
    );
    expect(rows.rows[0]?.count).toBe("240");
  });

  it("preserves command-owned intake idempotency and active-session conflicts", async () => {
    const fixture = await createFixture();
    const operationId = `intake:${randomUUID()}`;
    const plate = `retry-${randomUUID()}`;
    const body = {
      intakeOperationId: operationId,
      targetLocationId: fixture.locationId,
      vehicleIdentity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: plate,
      },
    };
    const first = await http("POST", "/v1/staff/check-in/intakes", {
      body,
      staffToken: fixture.staffToken,
    });
    const retry = await http("POST", "/v1/staff/check-in/intakes", {
      body,
      staffToken: fixture.staffToken,
    });
    expect(retry.body.valetSessionId).toBe(first.body.valetSessionId);
    const mismatch = await http("POST", "/v1/staff/check-in/intakes", {
      body: {
        ...body,
        vehicleIdentity: {
          ...body.vehicleIdentity,
          plateNumberRaw: `different-${randomUUID()}`,
        },
      },
      staffToken: fixture.staffToken,
    });
    expect(mismatch).toMatchObject({
      body: { code: "IDEMPOTENCY_CONFLICT" },
      status: 409,
    });
    const activeConflict = await http("POST", "/v1/staff/check-in/intakes", {
      body: { ...body, intakeOperationId: `intake:${randomUUID()}` },
      staffToken: fixture.staffToken,
    });
    expect(activeConflict).toMatchObject({
      body: { code: "ACTIVE_VALET_SESSION_CONFLICT" },
      status: 409,
    });
    const counts = await adminPool.query<{
      audits: number;
      sessions: number;
      vehicles: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM audit_events
          WHERE organization_id = $1 AND event_type = 'VALET_SESSION_CREATED') AS audits,
         (SELECT count(*)::integer FROM valet_sessions
          WHERE organization_id = $1) AS sessions,
         (SELECT count(*)::integer FROM vehicles
          WHERE organization_id = $1) AS vehicles`,
      [fixture.organizationId],
    );
    expect(counts.rows[0]).toEqual({ audits: 1, sessions: 1, vehicles: 1 });
  });

  it("serializes concurrent Complete Check-In so only one transition and audit commit", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const sessionId = String(created.body.valetSessionId);
    const beforeMarker = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/complete`,
      { body: { expectedVersion: 1 }, staffToken: fixture.staffToken },
    );
    expect(beforeMarker).toMatchObject({
      body: { code: "CONDITION_CHECK_INCOMPLETE" },
      status: 422,
    });
    await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
      { body: {}, staffToken: fixture.staffToken },
    );
    const settled = await Promise.all([
      http("POST", `/v1/staff/check-in/sessions/${sessionId}/complete`, {
        body: { expectedVersion: 1 },
        staffToken: fixture.staffToken,
      }),
      http("POST", `/v1/staff/check-in/sessions/${sessionId}/complete`, {
        body: { expectedVersion: 1 },
        staffToken: fixture.staffToken,
      }),
    ]);
    expect(settled.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(settled.find((result) => result.status === 409)?.body.code).toBe(
      "VERSION_CONFLICT",
    );
    const oldVersionRetry = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/complete`,
      { body: { expectedVersion: 1 }, staffToken: fixture.staffToken },
    );
    expect(oldVersionRetry).toMatchObject({
      body: { code: "VERSION_CONFLICT" },
      status: 409,
    });
    const refreshedVersionRetry = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/complete`,
      { body: { expectedVersion: 2 }, staffToken: fixture.staffToken },
    );
    expect(refreshedVersionRetry).toMatchObject({
      body: { code: "INVALID_STATE_TRANSITION" },
      status: 409,
    });
    const session = await adminPool.query<{ state: string; version: number }>(
      `SELECT state::text, version FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(session.rows[0]).toEqual({ state: "AWAITING_PARKING", version: 2 });
    const audits = await adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events
       WHERE valet_session_id = $1
         AND event_type = 'VALET_SESSION_CHECK_IN_COMPLETED'`,
      [sessionId],
    );
    expect(audits.rows[0]?.count).toBe(1);
  });

  it("rejects authority injection, maps safe authorization failures, and does not require a Shift", async () => {
    const employee = await createFixture();
    const injected = await http("POST", "/v1/staff/check-in/intakes", {
      body: {
        authenticatedUserId: randomUUID(),
        intakeOperationId: `intake:${randomUUID()}`,
        targetLocationId: employee.locationId,
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Unknown authority key",
        },
      },
      staffToken: employee.staffToken,
    });
    expect(injected).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });

    const manager = await createFixture({ role: "LOCATION_MANAGER" });
    const denied = await intake(manager);
    expect(denied).toMatchObject({
      body: { code: "AUTHORIZATION_DENIED" },
      status: 404,
    });
    const organizationAdmin = await createFixture({ role: "ORG_ADMIN" });
    expect(await intake(organizationAdmin)).toMatchObject({
      body: { code: "AUTHORIZATION_DENIED" },
      status: 404,
    });
    const supervisor = await createFixture({ role: "VALET_SUPERVISOR" });
    expect(await intake(supervisor)).toMatchObject({
      body: { state: "CHECKING_IN", version: 1 },
      status: 201,
    });
    const noShift = await adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM shifts WHERE organization_id = $1`,
      [employee.organizationId],
    );
    expect(noShift.rows[0]?.count).toBe(0);
    expect((await intake(employee)).status).toBe(201);
    const noLocation = await createFixture({ locationAccess: false });
    expect(await intake(noLocation)).toMatchObject({
      body: { code: "LOCATION_ACCESS_DENIED" },
      status: 404,
    });
    const disabled = await createFixture({ userStatus: "DISABLED" });
    expect(await intake(disabled)).toMatchObject({
      body: { code: "AUTHORIZATION_DENIED" },
      status: 404,
    });
    const inactiveMembership = await createFixture({
      membershipStatus: "INACTIVE",
    });
    expect(await intake(inactiveMembership)).toMatchObject({
      body: { code: "TENANT_ACCESS_DENIED" },
      status: 404,
    });

    const foreignOwner = await createFixture();
    const foreignSession = await intake(foreignOwner);
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${String(foreignSession.body.valetSessionId)}/condition-completion`,
        { body: {}, staffToken: employee.staffToken },
      ),
    ).toMatchObject({
      body: { code: "TENANT_ACCESS_DENIED" },
      status: 404,
    });

    const sibling = await createSiblingLocationFixture(employee);
    const siblingSession = await intake(sibling);
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${String(siblingSession.body.valetSessionId)}/condition-completion`,
        { body: {}, staffToken: employee.staffToken },
      ),
    ).toMatchObject({
      body: { code: "LOCATION_ACCESS_DENIED" },
      status: 404,
    });
    expect(
      await http("POST", "/v1/staff/check-in/intakes", { body: {} }),
    ).toMatchObject({
      body: { code: "STAFF_AUTHENTICATION_REQUIRED" },
      status: 401,
    });
  });

  it("accepts only absent or empty-object bodies for condition completion and revoke", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const sessionId = String(created.body.valetSessionId);

    for (const body of [null, { unexpected: true }]) {
      expect(
        await http(
          "POST",
          `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
          { body, staffToken: fixture.staffToken },
        ),
      ).toMatchObject({
        body: { code: "REQUEST_INVALID" },
        status: 400,
      });
    }
    const markerBefore = await adminPool.query<{ completed_at: Date | null }>(
      `SELECT check_in_condition_completed_at AS completed_at
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(markerBefore.rows[0]?.completed_at).toBeNull();
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
        { staffToken: fixture.staffToken },
      ),
    ).toMatchObject({ status: 200 });

    const issued = await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      {
        body: { intent: "ISSUE_OR_ROTATE" },
        staffToken: fixture.staffToken,
      },
    );
    const rawToken = String(issued.body.rawToken);
    for (const body of [null, { unexpected: true }]) {
      expect(
        await http(
          "POST",
          `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
          { body, staffToken: fixture.staffToken },
        ),
      ).toMatchObject({
        body: { code: "REQUEST_INVALID" },
        status: 400,
      });
    }
    expect(await guestSession(`Bearer ${rawToken}`)).toMatchObject({
      status: 200,
    });
    expect(
      await http(
        "POST",
        `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
        { staffToken: fixture.staffToken },
      ),
    ).toMatchObject({ status: 200 });
  });

  it("keeps a successful Complete Check-In committed when its observer fails", async () => {
    const fixture = await createFixture();
    const created = await intake(fixture);
    const sessionId = String(created.body.valetSessionId);
    await http(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
      { body: {}, staffToken: fixture.staffToken },
    );

    const measurementsBefore = measurements.length;
    observerFailureOperation = "COMPLETE_CHECK_IN";
    let completed: HttpResult;
    try {
      completed = await http(
        "POST",
        `/v1/staff/check-in/sessions/${sessionId}/complete`,
        { body: { expectedVersion: 1 }, staffToken: fixture.staffToken },
      );
    } finally {
      observerFailureOperation = undefined;
    }
    expect(completed!).toMatchObject({
      body: { state: "AWAITING_PARKING", version: 2 },
      status: 200,
    });
    const persisted = await adminPool.query<{
      audit_count: number;
      state: string;
      version: number;
    }>(
      `SELECT session.state::text, session.version,
              (SELECT count(*)::integer FROM audit_events
               WHERE valet_session_id = session.id
                 AND event_type = 'VALET_SESSION_CHECK_IN_COMPLETED') AS audit_count
       FROM valet_sessions AS session
       WHERE session.id = $1`,
      [sessionId],
    );
    expect(persisted.rows[0]).toEqual({
      audit_count: 1,
      state: "AWAITING_PARKING",
      version: 2,
    });
    expect(
      measurements
        .slice(measurementsBefore)
        .filter((measurement) => measurement.operation === "COMPLETE_CHECK_IN"),
    ).toHaveLength(1);
  });

  it("generates or preserves safe request IDs and returns a redacted unexpected 500", async () => {
    const fixture = await createFixture();
    const accepted = await http("POST", "/v1/staff/check-in/intakes", {
      body: {
        intakeOperationId: `intake:${randomUUID()}`,
        targetLocationId: fixture.locationId,
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Request ID vehicle",
        },
      },
      requestId: "safe.request_004I-1",
      staffToken: fixture.staffToken,
    });
    expect(accepted.requestId).toBe("safe.request_004I-1");
    const invalid = await http("POST", "/v1/staff/check-in/intakes", {
      body: {},
      requestId: "x".repeat(129),
      staffToken: fixture.staffToken,
    });
    expect(invalid.requestId).not.toBe("x".repeat(129));
    expect(invalid.body.requestId).toBe(invalid.requestId);

    const metricCount = measurements.length;
    const malformedJson = await fetch(`${baseUrl}/v1/staff/check-in/intakes`, {
      body: "{",
      headers: {
        authorization: `Bearer ${fixture.staffToken}`,
        "content-type": "application/json",
        "x-request-id": "malformed-json-request",
      },
      method: "POST",
    });
    const malformedJsonBody = (await malformedJson.json()) as Record<
      string,
      unknown
    >;
    expect(malformedJson.status).toBe(400);
    expect(malformedJson.headers.get("x-request-id")).toBe(
      "malformed-json-request",
    );
    expect(malformedJsonBody).toEqual({
      code: "REQUEST_INVALID",
      message: "The request is invalid.",
      requestId: "malformed-json-request",
    });
    expect(measurements).toHaveLength(metricCount + 1);
    expect(measurements.at(-1)).toMatchObject({
      errorCode: "REQUEST_INVALID",
      operation: "CHECK_IN_INTAKE",
      outcome: "ERROR",
      requestId: "malformed-json-request",
    });

    const diagnostic = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const unexpected = await http("POST", "/v1/staff/check-in/intakes", {
      body: {},
      requestId: "diagnostic-request",
      staffToken: "force-internal-error",
    });
    expect(unexpected).toMatchObject({
      body: {
        code: "INTERNAL_ERROR",
        message: "The operation could not be completed.",
      },
      status: 500,
    });
    expect(JSON.stringify(unexpected.body)).not.toMatch(
      /stack|sql|principal failure/i,
    );
    const unexpectedMetric = measurements.at(-1);
    expect(unexpectedMetric).toMatchObject({
      errorCode: "INTERNAL_ERROR",
      outcome: "ERROR",
      requestId: unexpected.requestId,
    });
    expect(diagnostic).toHaveBeenCalledWith(
      "INTERNAL_ERROR operation=CHECK_IN_INTAKE requestId=diagnostic-request",
    );
    expect(JSON.stringify(diagnostic.mock.calls)).not.toMatch(
      /authorization|bearer|force-internal|principal failure|sql|constraint/i,
    );
    diagnostic.mockRestore();
  });

  it("keeps the default production principal resolver fail-closed even with a bearer value", async () => {
    const productionResolver = new FailClosedStaffPrincipalResolver();
    await expect(
      productionResolver.resolve("Bearer opaque-value"),
    ).rejects.toMatchObject({
      status: 401,
    });
  });
});
