import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import {
  checkInConditionLimits,
  createCompleteCheckInConditionCommandExecutor,
  createCorrectCheckInConditionNoteCommandExecutor,
  createRecordCheckInConditionNoteCommandExecutor,
  createRegisterCheckInConditionPhotoCommandExecutor,
  evaluateEffectiveCheckInPhotoPolicy,
  evaluateLockedCheckInConditionGuard,
} from "../src/modules/valet-sessions/check-in-condition-command";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
  vehicleId: string;
}

interface FixtureOptions {
  locationAccess?: boolean;
  locationPhotoOverride?: boolean | null;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  organizationPhotosRequired?: boolean;
  role?: MembershipRole;
  sessionState?: "AWAITING_PARKING" | "CHECKING_IN";
  userStatus?: "ACTIVE" | "DISABLED";
}

interface SessionRow {
  check_in_condition_completed_at: Date | null;
  check_in_condition_completed_by_membership_id: string | null;
  checking_in_completed_at: Date | null;
  key_slot_id: string | null;
  parking_spot_id: string | null;
  state: string;
  version: number;
}

interface ConditionRow {
  content: string;
  context: string;
  id: string;
  recorded_by_membership_id: string;
  supersedes_condition_note_id: string | null;
}

interface PhotoRow {
  captured_by_membership_id: string;
  content_type: string;
  location_id: string;
  organization_id: string;
  purpose: string;
  storage_object_key: string;
  valet_session_id: string;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004g_app_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_condition_${uniqueSuffix}`;
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

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const fixture = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    sessionId: randomUUID(),
    userId: randomUUID(),
    vehicleId: randomUUID(),
  };
  const identity = randomUUID();
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations
         (id, name, status, timezone, check_in_photos_required, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', $3, clock_timestamp())`,
      [
        fixture.organizationId,
        `VAL-004G ${identity}`,
        options.organizationPhotosRequired ?? false,
      ],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, check_in_photos_required_override, updated_at)
       VALUES ($1, $2, 'Condition location', $3, 'Test address',
               'Asia/Amman', 'JOD', 'ACTIVE', $4, clock_timestamp())`,
      [
        fixture.locationId,
        fixture.organizationId,
        identity,
        options.locationPhotoOverride ?? null,
      ],
    );
    await client.query(
      `INSERT INTO users
         (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', $3, clock_timestamp())`,
      [
        fixture.userId,
        `${identity}@val-004g.test`,
        options.userStatus ?? "ACTIVE",
      ],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, clock_timestamp())`,
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
       VALUES ($1, $2, 'Condition test vehicle', clock_timestamp())`,
      [fixture.vehicleId, fixture.organizationId],
    );
    await client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          customer_access_revoked_at, organization_id, location_id,
          vehicle_id, state, checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, clock_timestamp(), clock_timestamp(), $3, $4, $5,
               $6, $7, 1, clock_timestamp())`,
      [
        fixture.sessionId,
        `disabled:intake:${randomBytes(32).toString("hex")}`,
        fixture.organizationId,
        fixture.locationId,
        fixture.vehicleId,
        options.sessionState ?? "CHECKING_IN",
        fixture.membershipId,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return fixture;
}

async function createAdditionalActor(
  fixture: Fixture,
  role: MembershipRole = "VALET_SUPERVISOR",
): Promise<{ membershipId: string; userId: string }> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  const identity = randomUUID();
  await adminPool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE', clock_timestamp())`,
    [userId, `${identity}@val-004g.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp())`,
    [membershipId, fixture.organizationId, userId, role],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [fixture.organizationId, membershipId, fixture.locationId],
  );
  return { membershipId, userId };
}

async function createAdditionalSession(fixture: Fixture): Promise<string> {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await adminPool.query(
    `INSERT INTO vehicles
       (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'Other condition vehicle', clock_timestamp())`,
    [vehicleId, fixture.organizationId],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        customer_access_revoked_at, organization_id, location_id,
        vehicle_id, state, checked_in_by_membership_id, version, updated_at)
     VALUES ($1, $2, clock_timestamp(), clock_timestamp(), $3, $4, $5,
             'CHECKING_IN', $6, 1, clock_timestamp())`,
    [
      sessionId,
      `disabled:intake:${randomBytes(32).toString("hex")}`,
      fixture.organizationId,
      fixture.locationId,
      vehicleId,
      fixture.membershipId,
    ],
  );
  return sessionId;
}

function staffRequest(fixture: Fixture) {
  return {
    authenticatedUserId: fixture.userId,
    valetSessionId: fixture.sessionId,
  };
}

function photoRequest(fixture: Fixture, storageObjectKey = `private/${randomUUID()}`) {
  return {
    ...staffRequest(fixture),
    contentType: "image/jpeg",
    storageObjectKey,
  };
}

async function expectErrorCode(
  operation: Promise<unknown>,
  code: string,
): Promise<Error & { code: string }> {
  try {
    await operation;
    throw new Error(`Expected error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const commandError = error as Error & { code: string };
    expect(commandError.code).toBe(code);
    return commandError;
  }
}

async function readSession(sessionId: string): Promise<SessionRow> {
  const result = await adminPool.query<SessionRow>(
    `SELECT check_in_condition_completed_at,
            check_in_condition_completed_by_membership_id::text,
            checking_in_completed_at, parking_spot_id::text,
            key_slot_id::text, state::text, version
     FROM valet_sessions WHERE id = $1`,
    [sessionId],
  );
  return result.rows[0]!;
}

async function conditionRows(sessionId: string): Promise<ConditionRow[]> {
  const result = await adminPool.query<ConditionRow>(
    `SELECT id::text, content, context::text,
            supersedes_condition_note_id::text,
            recorded_by_membership_id::text
     FROM condition_notes
     WHERE valet_session_id = $1
     ORDER BY created_at, id`,
    [sessionId],
  );
  return result.rows;
}

async function photoRows(sessionId: string): Promise<PhotoRow[]> {
  const result = await adminPool.query<PhotoRow>(
    `SELECT organization_id::text, location_id::text,
            valet_session_id::text, captured_by_membership_id::text,
            purpose::text, storage_object_key, content_type
     FROM vehicle_photos
     WHERE valet_session_id = $1
     ORDER BY created_at, id`,
    [sessionId],
  );
  return result.rows;
}

async function conditionAuditRows(sessionId: string) {
  const result = await adminPool.query<{
    actor_membership_id: string | null;
    event_type: string;
    metadata_json: Record<string, unknown>;
    occurred_at: Date;
  }>(
    `SELECT actor_membership_id::text, event_type, metadata_json, occurred_at
     FROM audit_events
     WHERE valet_session_id = $1
       AND event_type IN (
         'CHECK_IN_CONDITION_NOTE_RECORDED',
         'CHECK_IN_CONDITION_NOTE_CORRECTED',
         'CHECK_IN_CONDITION_PHOTO_REGISTERED',
         'VALET_SESSION_CHECK_IN_CONDITION_COMPLETED'
       )
     ORDER BY occurred_at, created_at, id`,
    [sessionId],
  );
  return result.rows;
}

async function insertAuditWithId(
  fixture: Fixture,
  auditEventId: string,
): Promise<void> {
  await adminPool.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'TEST_EXISTING_AUDIT',
             'ValetSession', $4, '{}'::jsonb, clock_timestamp())`,
    [
      auditEventId,
      fixture.organizationId,
      fixture.locationId,
      fixture.sessionId,
      fixture.membershipId,
    ],
  );
}

async function readGuard(fixture: Fixture) {
  const transaction = await runtimePool.connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      `SELECT id FROM valet_sessions WHERE id = $1 FOR UPDATE`,
      [fixture.sessionId],
    );
    const result = await evaluateLockedCheckInConditionGuard(transaction, {
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      valetSessionId: fixture.sessionId,
    });
    await transaction.query("COMMIT");
    return result;
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
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

describe("VAL-004G condition check and photo policy commands", () => {
  it("records trimmed append-only CHECK_IN evidence with safe audit and no Shift", async () => {
    const fixture = await createFixture();
    const before = await readSession(fixture.sessionId);
    const content = "  Front-left wheel has a light scratch  ";
    const result = await createRecordCheckInConditionNoteCommandExecutor(
      runtimePool,
    )({ ...staffRequest(fixture), content });

    expect(result).toMatchObject({
      content: content.trim(),
      recordedByMembershipId: fixture.membershipId,
      supersedesConditionNoteId: null,
      valetSessionId: fixture.sessionId,
    });
    expect(await conditionRows(fixture.sessionId)).toEqual([
      {
        content: content.trim(),
        context: "CHECK_IN",
        id: result.conditionNoteId,
        recorded_by_membership_id: fixture.membershipId,
        supersedes_condition_note_id: null,
      },
    ]);
    expect(await readSession(fixture.sessionId)).toEqual(before);
    const audits = await conditionAuditRows(fixture.sessionId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      event_type: "CHECK_IN_CONDITION_NOTE_RECORDED",
      metadata_json: {
        context: "CHECK_IN",
        mutationKind: "RECORD",
        supersedesEvidence: false,
      },
    });
    expect(JSON.stringify(audits)).not.toContain(content.trim());
    const shifts = await adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM shifts
       WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    expect(shifts.rows[0]?.count).toBe(0);
  });

  it("allows an operational supervisor", async () => {
    const fixture = await createFixture({ role: "VALET_SUPERVISOR" });
    await expect(
      createRecordCheckInConditionNoteCommandExecutor(runtimePool)({
        ...staffRequest(fixture),
        content: "No damage observed",
      }),
    ).resolves.toMatchObject({ recordedByMembershipId: fixture.membershipId });
  });

  it.each(["LOCATION_MANAGER", "ORG_ADMIN"] as const)(
    "denies the non-operational %s role without evidence or audit",
    async (role) => {
      const fixture = await createFixture({ role });
      await expectErrorCode(
        createRecordCheckInConditionNoteCommandExecutor(runtimePool)({
          ...staffRequest(fixture),
          content: "Not authorized",
        }),
        "AUTHORIZATION_DENIED",
      );
      expect(await conditionRows(fixture.sessionId)).toEqual([]);
      expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
    },
  );

  it.each([
    [{ userStatus: "DISABLED" } as FixtureOptions, "AUTHORIZATION_DENIED"],
    [{ membershipStatus: "INACTIVE" } as FixtureOptions, "TENANT_ACCESS_DENIED"],
    [{ locationAccess: false } as FixtureOptions, "LOCATION_ACCESS_DENIED"],
  ])("denies inactive or unscoped staff", async (options, code) => {
    const fixture = await createFixture(options);
    await expectErrorCode(
      createRecordCheckInConditionNoteCommandExecutor(runtimePool)({
        ...staffRequest(fixture),
        content: "Not authorized",
      }),
      code,
    );
    expect(await conditionRows(fixture.sessionId)).toEqual([]);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
  });

  it("keeps foreign and missing sessions non-disclosing", async () => {
    const actor = await createFixture();
    const foreign = await createFixture();
    const record = createRecordCheckInConditionNoteCommandExecutor(runtimePool);
    const foreignError = await expectErrorCode(
      record({
        authenticatedUserId: actor.userId,
        content: "Foreign attempt",
        valetSessionId: foreign.sessionId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    const missingError = await expectErrorCode(
      record({
        authenticatedUserId: actor.userId,
        content: "Missing attempt",
        valetSessionId: randomUUID(),
      }),
      "TENANT_ACCESS_DENIED",
    );
    expect(foreignError.message).toBe(missingError.message);
    expect(await conditionRows(foreign.sessionId)).toEqual([]);
  });

  it.each([
    "   ",
    "contains\ncontrol",
    "x".repeat(checkInConditionLimits.noteContentCodePoints + 1),
  ])("rejects invalid condition content without mutation: %s", async (content) => {
    const fixture = await createFixture();
    await expectErrorCode(
      createRecordCheckInConditionNoteCommandExecutor(runtimePool)({
        ...staffRequest(fixture),
        content,
      }),
      "CHECK_IN_EVIDENCE_REQUEST_INVALID",
    );
    expect(await conditionRows(fixture.sessionId)).toEqual([]);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
  });

  it("appends a correction chain while preserving original evidence", async () => {
    const fixture = await createFixture();
    const record = createRecordCheckInConditionNoteCommandExecutor(runtimePool);
    const correct = createCorrectCheckInConditionNoteCommandExecutor(runtimePool);
    const original = await record({
      ...staffRequest(fixture),
      content: "Scratch on rear right",
    });
    const firstCorrection = await correct({
      ...staffRequest(fixture),
      content: "Scratch on rear left",
      supersedesConditionNoteId: original.conditionNoteId,
    });
    const secondCorrection = await correct({
      ...staffRequest(fixture),
      content: "Light scratch on rear left",
      supersedesConditionNoteId: firstCorrection.conditionNoteId,
    });

    const rows = await conditionRows(fixture.sessionId);
    expect(rows.map((row) => row.content)).toEqual([
      "Scratch on rear right",
      "Scratch on rear left",
      "Light scratch on rear left",
    ]);
    expect(rows[0]?.supersedes_condition_note_id).toBeNull();
    expect(rows[1]?.supersedes_condition_note_id).toBe(original.conditionNoteId);
    expect(rows[2]?.supersedes_condition_note_id).toBe(
      firstCorrection.conditionNoteId,
    );
    expect(secondCorrection.recordedByMembershipId).toBe(fixture.membershipId);
    await expectErrorCode(
      correct({
        ...staffRequest(fixture),
        content: "Contradictory branch",
        supersedesConditionNoteId: original.conditionNoteId,
      }),
      "CONDITION_NOTE_ALREADY_SUPERSEDED",
    );
    expect(await conditionRows(fixture.sessionId)).toEqual(rows);
    expect(JSON.stringify(await conditionAuditRows(fixture.sessionId))).not.toContain(
      "Light scratch on rear left",
    );
  });

  it("rejects cross-session and cross-tenant correction targets non-disclosing", async () => {
    const fixture = await createFixture();
    const otherSessionId = await createAdditionalSession(fixture);
    const record = createRecordCheckInConditionNoteCommandExecutor(runtimePool);
    const correct = createCorrectCheckInConditionNoteCommandExecutor(runtimePool);
    const otherNote = await record({
      authenticatedUserId: fixture.userId,
      content: "Other session evidence",
      valetSessionId: otherSessionId,
    });
    const crossSession = await expectErrorCode(
      correct({
        ...staffRequest(fixture),
        content: "Cross-session correction",
        supersedesConditionNoteId: otherNote.conditionNoteId,
      }),
      "TENANT_ACCESS_DENIED",
    );

    const foreign = await createFixture();
    const foreignNote = await record({
      ...staffRequest(foreign),
      content: "Foreign evidence",
    });
    const crossTenant = await expectErrorCode(
      correct({
        ...staffRequest(fixture),
        content: "Cross-tenant correction",
        supersedesConditionNoteId: foreignNote.conditionNoteId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    expect(crossSession.message).toBe(crossTenant.message);
    expect(await conditionRows(fixture.sessionId)).toEqual([]);
  });

  it("serializes concurrent corrections to one direct successor", async () => {
    const fixture = await createFixture();
    const original = await createRecordCheckInConditionNoteCommandExecutor(
      runtimePool,
    )({ ...staffRequest(fixture), content: "Original evidence" });
    const correct = createCorrectCheckInConditionNoteCommandExecutor(runtimePool);
    const results = await Promise.allSettled([
      correct({
        ...staffRequest(fixture),
        content: "Correction one",
        supersedesConditionNoteId: original.conditionNoteId,
      }),
      correct({
        ...staffRequest(fixture),
        content: "Correction two",
        supersedesConditionNoteId: original.conditionNoteId,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: { code: "CONDITION_NOTE_ALREADY_SUPERSEDED" },
    });
    const rows = await conditionRows(fixture.sessionId);
    expect(
      rows.filter(
        (row) => row.supersedes_condition_note_id === original.conditionNoteId,
      ),
    ).toHaveLength(1);
    expect(
      (await conditionAuditRows(fixture.sessionId)).filter(
        (row) => row.event_type === "CHECK_IN_CONDITION_NOTE_CORRECTED",
      ),
    ).toHaveLength(1);
  });

  it("rolls back both first note and correction when audit insertion fails", async () => {
    const firstFixture = await createFixture();
    const firstAuditId = randomUUID();
    await insertAuditWithId(firstFixture, firstAuditId);
    await expect(
      createRecordCheckInConditionNoteCommandExecutor(runtimePool, {
        auditEventIdFactory: () => firstAuditId,
      })({ ...staffRequest(firstFixture), content: "Must roll back" }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await conditionRows(firstFixture.sessionId)).toEqual([]);

    const correctionFixture = await createFixture();
    const original = await createRecordCheckInConditionNoteCommandExecutor(
      runtimePool,
    )({ ...staffRequest(correctionFixture), content: "Original" });
    const correctionAuditId = randomUUID();
    await insertAuditWithId(correctionFixture, correctionAuditId);
    await expect(
      createCorrectCheckInConditionNoteCommandExecutor(runtimePool, {
        auditEventIdFactory: () => correctionAuditId,
      })({
        ...staffRequest(correctionFixture),
        content: "Rejected correction",
        supersedesConditionNoteId: original.conditionNoteId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await conditionRows(correctionFixture.sessionId)).toHaveLength(1);
  });

  it("registers normalized private image metadata with derived scope and safe audit", async () => {
    const fixture = await createFixture();
    const key = `private/check-in/${randomUUID()}`;
    const result = await createRegisterCheckInConditionPhotoCommandExecutor(
      runtimePool,
    )({
      ...staffRequest(fixture),
      contentType: "  IMAGE/JPEG  ",
      storageObjectKey: `  ${key}  `,
    });
    expect(result).toMatchObject({
      capturedByMembershipId: fixture.membershipId,
      contentType: "image/jpeg",
      valetSessionId: fixture.sessionId,
    });
    expect(await photoRows(fixture.sessionId)).toEqual([
      {
        captured_by_membership_id: fixture.membershipId,
        content_type: "image/jpeg",
        location_id: fixture.locationId,
        organization_id: fixture.organizationId,
        purpose: "CHECK_IN_CONDITION",
        storage_object_key: key,
        valet_session_id: fixture.sessionId,
      },
    ]);
    const audits = await conditionAuditRows(fixture.sessionId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      event_type: "CHECK_IN_CONDITION_PHOTO_REGISTERED",
      metadata_json: {
        mediaCategory: "image",
        mutationKind: "REGISTER",
        purpose: "CHECK_IN_CONDITION",
      },
    });
    const auditText = JSON.stringify(audits);
    expect(auditText).not.toContain(key);
    expect(auditText).not.toContain("http");
  });

  it("keeps invented JPEG and PNG metadata unverified under required-photo policy", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    const register =
      createRegisterCheckInConditionPhotoCommandExecutor(runtimePool);
    const storageObjectKeys = [
      `invented/check-in/${randomUUID()}`,
      `private-looking/check-in/${randomUUID()}`,
    ];
    await register({
      ...staffRequest(fixture),
      contentType: "image/jpeg",
      storageObjectKey: storageObjectKeys[0]!,
    });
    await register({
      ...staffRequest(fixture),
      contentType: "image/png",
      storageObjectKey: storageObjectKeys[1]!,
    });

    expect(await readGuard(fixture)).toMatchObject({
      markerComplete: false,
      photoPolicy: { required: true },
      qualifyingPhotoPresent: false,
      satisfied: false,
    });
    const beforeCompletion = await readSession(fixture.sessionId);
    await expectErrorCode(
      createCompleteCheckInConditionCommandExecutor(runtimePool)(
        staffRequest(fixture),
      ),
      "CHECK_IN_CONDITION_PHOTO_REQUIRED",
    );
    expect(await readSession(fixture.sessionId)).toEqual(beforeCompletion);
    expect(await photoRows(fixture.sessionId)).toHaveLength(2);
    const audits = await conditionAuditRows(fixture.sessionId);
    expect(audits.map((row) => row.event_type)).toEqual([
      "CHECK_IN_CONDITION_PHOTO_REGISTERED",
      "CHECK_IN_CONDITION_PHOTO_REGISTERED",
    ]);
    const auditText = JSON.stringify(audits);
    for (const storageObjectKey of storageObjectKeys) {
      expect(auditText).not.toContain(storageObjectKey);
    }
  });

  it.each([
    ["https://bucket.example/signed?secret=x", "image/jpeg"],
    ["http://bucket.example/public.png", "image/png"],
    ["private/key", "text/plain"],
    ["private/key", "application/octet-stream"],
    ["private\u0000key", "image/png"],
  ])("rejects unsafe photo metadata %s %s", async (storageObjectKey, contentType) => {
    const fixture = await createFixture();
    await expectErrorCode(
      createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)({
        ...staffRequest(fixture),
        contentType,
        storageObjectKey,
      }),
      "CHECK_IN_EVIDENCE_REQUEST_INVALID",
    );
    expect(await photoRows(fixture.sessionId)).toEqual([]);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
  });

  it("returns exact photo retries without another row or audit", async () => {
    const fixture = await createFixture();
    const register = createRegisterCheckInConditionPhotoCommandExecutor(runtimePool);
    const request = photoRequest(fixture);
    const first = await register(request);
    const second = await register(request);
    expect(second).toEqual(first);
    expect(await photoRows(fixture.sessionId)).toHaveLength(1);
    expect(await conditionAuditRows(fixture.sessionId)).toHaveLength(1);
  });

  it("rejects conflicting and cross-tenant storage-key reuse non-disclosing", async () => {
    const fixture = await createFixture();
    const register = createRegisterCheckInConditionPhotoCommandExecutor(runtimePool);
    const key = `private/${randomUUID()}`;
    await register(photoRequest(fixture, key));
    const localConflict = await expectErrorCode(
      register({
        ...photoRequest(fixture, key),
        contentType: "image/png",
      }),
      "PHOTO_STORAGE_OBJECT_CONFLICT",
    );
    const otherActor = await createAdditionalActor(fixture);
    const actorConflict = await expectErrorCode(
      register({
        authenticatedUserId: otherActor.userId,
        contentType: "image/jpeg",
        storageObjectKey: key,
        valetSessionId: fixture.sessionId,
      }),
      "PHOTO_STORAGE_OBJECT_CONFLICT",
    );
    const foreign = await createFixture();
    const crossTenant = await expectErrorCode(
      register(photoRequest(foreign, key)),
      "PHOTO_STORAGE_OBJECT_CONFLICT",
    );
    expect(localConflict.message).toBe(actorConflict.message);
    expect(localConflict.message).toBe(crossTenant.message);
    expect(await photoRows(fixture.sessionId)).toHaveLength(1);
    expect(await photoRows(foreign.sessionId)).toEqual([]);
  });

  it("serializes concurrent exact photo registration to one row and audit", async () => {
    const fixture = await createFixture();
    const register = createRegisterCheckInConditionPhotoCommandExecutor(runtimePool);
    const request = photoRequest(fixture);
    const [first, second] = await Promise.all([register(request), register(request)]);
    expect(second).toEqual(first);
    expect(await photoRows(fixture.sessionId)).toHaveLength(1);
    expect(await conditionAuditRows(fixture.sessionId)).toHaveLength(1);
  });

  it("rolls back photo metadata when audit insertion fails", async () => {
    const fixture = await createFixture();
    const auditId = randomUUID();
    await insertAuditWithId(fixture, auditId);
    await expect(
      createRegisterCheckInConditionPhotoCommandExecutor(runtimePool, {
        auditEventIdFactory: () => auditId,
      })(photoRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await photoRows(fixture.sessionId)).toEqual([]);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
  });

  it.each([
    [false, null, false, "ORGANIZATION_DEFAULT"],
    [true, null, true, "ORGANIZATION_DEFAULT"],
    [false, true, true, "LOCATION_OVERRIDE"],
    [true, true, true, "LOCATION_OVERRIDE"],
    [false, false, false, "LOCATION_OVERRIDE"],
    [true, false, false, "LOCATION_OVERRIDE"],
  ] as const)(
    "evaluates org=%s location=%s as required=%s from %s",
    (organizationDefault, locationOverride, required, source) => {
      expect(
        evaluateEffectiveCheckInPhotoPolicy({
          locationOverride,
          organizationDefault,
        }),
      ).toEqual({ required, source });
    },
  );

  it("completes with zero notes and zero photos when policy is optional", async () => {
    const fixture = await createFixture();
    const before = await readSession(fixture.sessionId);
    const result = await createCompleteCheckInConditionCommandExecutor(
      runtimePool,
    )(staffRequest(fixture));
    const after = await readSession(fixture.sessionId);
    expect(result).toEqual({
      completedAt: after.check_in_condition_completed_at,
      completedByMembershipId: fixture.membershipId,
      valetSessionId: fixture.sessionId,
    });
    expect(after.check_in_condition_completed_at).not.toBeNull();
    expect(after.check_in_condition_completed_by_membership_id).toBe(
      fixture.membershipId,
    );
    expect(after.state).toBe("CHECKING_IN");
    expect(after.version).toBe(before.version);
    expect(after.checking_in_completed_at).toBeNull();
    expect(after.parking_spot_id).toBeNull();
    expect(after.key_slot_id).toBeNull();
    expect(await conditionRows(fixture.sessionId)).toEqual([]);
    expect(await photoRows(fixture.sessionId)).toEqual([]);
    const audits = await conditionAuditRows(fixture.sessionId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      event_type: "VALET_SESSION_CHECK_IN_CONDITION_COMPLETED",
      metadata_json: {
        effectivePhotosRequired: false,
        policySource: "ORGANIZATION_DEFAULT",
        qualifyingPhotoPresent: false,
      },
      occurred_at: after.check_in_condition_completed_at,
    });
  });

  it("rejects unverified metadata whenever effective policy requires photos", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    const before = await readSession(fixture.sessionId);
    await expectErrorCode(
      createCompleteCheckInConditionCommandExecutor(runtimePool)(
        staffRequest(fixture),
      ),
      "CHECK_IN_CONDITION_PHOTO_REQUIRED",
    );
    expect(await readSession(fixture.sessionId)).toEqual(before);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);

    await createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)(
      photoRequest(fixture),
    );
    await expectErrorCode(
      createCompleteCheckInConditionCommandExecutor(runtimePool)(
        staffRequest(fixture),
      ),
      "CHECK_IN_CONDITION_PHOTO_REQUIRED",
    );
    expect(await readSession(fixture.sessionId)).toEqual(before);
    const auditTypes = (await conditionAuditRows(fixture.sessionId)).map(
      (row) => row.event_type,
    );
    expect(auditTypes).toEqual(["CHECK_IN_CONDITION_PHOTO_REGISTERED"]);
  });

  it("does not count a photo from another session", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    const otherSessionId = await createAdditionalSession(fixture);
    await createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)({
      authenticatedUserId: fixture.userId,
      contentType: "image/webp",
      storageObjectKey: `private/${randomUUID()}`,
      valetSessionId: otherSessionId,
    });
    await expectErrorCode(
      createCompleteCheckInConditionCommandExecutor(runtimePool)(
        staffRequest(fixture),
      ),
      "CHECK_IN_CONDITION_PHOTO_REQUIRED",
    );
    expect(
      (await readSession(fixture.sessionId))
        .check_in_condition_completed_at,
    ).toBeNull();
  });

  it("repeats completion idempotently and preserves the first actor and timestamp", async () => {
    const fixture = await createFixture();
    const otherActor = await createAdditionalActor(fixture);
    const complete = createCompleteCheckInConditionCommandExecutor(runtimePool);
    const first = await complete(staffRequest(fixture));
    const second = await complete({
      authenticatedUserId: otherActor.userId,
      valetSessionId: fixture.sessionId,
    });
    expect(second).toEqual(first);
    expect(first.completedByMembershipId).toBe(fixture.membershipId);
    expect(await conditionAuditRows(fixture.sessionId)).toHaveLength(1);
  });

  it("serializes concurrent completion to one marker mutation and audit", async () => {
    const fixture = await createFixture();
    const otherActor = await createAdditionalActor(fixture);
    const complete = createCompleteCheckInConditionCommandExecutor(runtimePool);
    const [first, second] = await Promise.all([
      complete(staffRequest(fixture)),
      complete({
        authenticatedUserId: otherActor.userId,
        valetSessionId: fixture.sessionId,
      }),
    ]);
    expect(second).toEqual(first);
    const session = await readSession(fixture.sessionId);
    expect(session.check_in_condition_completed_at).toEqual(first.completedAt);
    expect(session.check_in_condition_completed_by_membership_id).toBe(
      first.completedByMembershipId,
    );
    expect(await conditionAuditRows(fixture.sessionId)).toHaveLength(1);
  });

  it("rolls back the completion marker when audit insertion fails", async () => {
    const fixture = await createFixture();
    const auditId = randomUUID();
    await insertAuditWithId(fixture, auditId);
    const before = await readSession(fixture.sessionId);
    await expect(
      createCompleteCheckInConditionCommandExecutor(runtimePool, {
        auditEventIdFactory: () => auditId,
      })(staffRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await readSession(fixture.sessionId)).toEqual(before);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
  });

  it("keeps required-photo completion blocked during concurrent metadata registration", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    const register = createRegisterCheckInConditionPhotoCommandExecutor(runtimePool);
    const complete = createCompleteCheckInConditionCommandExecutor(runtimePool);
    const [photo, completion] = await Promise.allSettled([
      register(photoRequest(fixture)),
      complete(staffRequest(fixture)),
    ]);
    expect(photo.status).toBe("fulfilled");
    expect(completion.status).toBe("rejected");
    if (completion.status === "rejected") {
      expect(completion.reason).toMatchObject({
        code: "CHECK_IN_CONDITION_PHOTO_REQUIRED",
      });
    }
    expect(await photoRows(fixture.sessionId)).toHaveLength(1);
    expect(
      (await readSession(fixture.sessionId)).check_in_condition_completed_at,
    ).toBeNull();
    await expectErrorCode(
      complete(staffRequest(fixture)),
      "CHECK_IN_CONDITION_PHOTO_REQUIRED",
    );
    expect(
      (await conditionAuditRows(fixture.sessionId)).map(
        (row) => row.event_type,
      ),
    ).toEqual(["CHECK_IN_CONDITION_PHOTO_REGISTERED"]);
  });

  it("rejects every new intake mutation after the session leaves CHECKING_IN", async () => {
    const fixture = await createFixture({ sessionState: "AWAITING_PARKING" });
    await expectErrorCode(
      createRecordCheckInConditionNoteCommandExecutor(runtimePool)({
        ...staffRequest(fixture),
        content: "Too late",
      }),
      "INVALID_STATE_TRANSITION",
    );
    await expectErrorCode(
      createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)(
        photoRequest(fixture),
      ),
      "INVALID_STATE_TRANSITION",
    );
    await expectErrorCode(
      createCompleteCheckInConditionCommandExecutor(runtimePool)(
        staffRequest(fixture),
      ),
      "INVALID_STATE_TRANSITION",
    );
    expect(await conditionRows(fixture.sessionId)).toEqual([]);
    expect(await photoRows(fixture.sessionId)).toEqual([]);
    expect(await conditionAuditRows(fixture.sessionId)).toEqual([]);
    expect(
      (await readSession(fixture.sessionId))
        .check_in_condition_completed_at,
    ).toBeNull();

    const correctionFixture = await createFixture();
    const original = await createRecordCheckInConditionNoteCommandExecutor(
      runtimePool,
    )({ ...staffRequest(correctionFixture), content: "Original evidence" });
    await adminPool.query(
      `UPDATE valet_sessions SET state = 'AWAITING_PARKING'
       WHERE id = $1`,
      [correctionFixture.sessionId],
    );
    await expectErrorCode(
      createCorrectCheckInConditionNoteCommandExecutor(runtimePool)({
        ...staffRequest(correctionFixture),
        content: "Late correction",
        supersedesConditionNoteId: original.conditionNoteId,
      }),
      "INVALID_STATE_TRANSITION",
    );
    expect(await conditionRows(correctionFixture.sessionId)).toHaveLength(1);
    expect(await conditionAuditRows(correctionFixture.sessionId)).toHaveLength(1);
  });

  it("keeps the reusable current-policy guard separate from the completion marker", async () => {
    const fixture = await createFixture();
    expect(await readGuard(fixture)).toMatchObject({
      markerComplete: false,
      photoPolicy: {
        required: false,
        source: "ORGANIZATION_DEFAULT",
      },
      qualifyingPhotoPresent: false,
      satisfied: false,
    });
    await createCompleteCheckInConditionCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    expect(await readGuard(fixture)).toMatchObject({
      markerComplete: true,
      photoPolicy: { required: false },
      satisfied: true,
    });

    await adminPool.query(
      `UPDATE organizations SET check_in_photos_required = true
       WHERE id = $1`,
      [fixture.organizationId],
    );
    expect(await readGuard(fixture)).toMatchObject({
      markerComplete: true,
      photoPolicy: {
        required: true,
        source: "ORGANIZATION_DEFAULT",
      },
      qualifyingPhotoPresent: false,
      satisfied: false,
    });
    await createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)(
      photoRequest(fixture),
    );
    expect(await readGuard(fixture)).toMatchObject({
      markerComplete: true,
      photoPolicy: { required: true },
      qualifyingPhotoPresent: false,
      satisfied: false,
    });
  });

  it("honors an explicit false Location override in the reusable guard", async () => {
    const fixture = await createFixture({
      locationPhotoOverride: false,
      organizationPhotosRequired: true,
    });
    await createCompleteCheckInConditionCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    expect(await readGuard(fixture)).toMatchObject({
      markerComplete: true,
      photoPolicy: {
        required: false,
        source: "LOCATION_OVERRIDE",
      },
      qualifyingPhotoPresent: false,
      satisfied: true,
    });
  });
});
