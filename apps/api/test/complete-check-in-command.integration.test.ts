import { randomBytes, randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { RuntimeDatabaseLifecycle } from "../src/common/database/runtime-database.module";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { withDatabaseOperationDeadline } from "../src/common/database/runtime-database-deadline";
import {
  reportIssue215MigrationTimings,
  runIssue215FixturePnpm,
  timedIssue215FixtureStage,
} from "./issue215-fixture-timing";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import {
  createCompleteCheckInConditionCommandExecutor,
  createRegisterCheckInConditionPhotoCommandExecutor,
} from "../src/modules/valet-sessions/check-in-condition-command";
import {
  createCompleteCheckInCommandExecutor,
  hasAcceptedPersistedVehicleIdentity,
} from "../src/modules/valet-sessions/complete-check-in-command";
import { beginBlockedCompanySettingMutation, waitForAdvisoryLock } from "./management-settings-race-test-helpers";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
  vehicleId: string;
}

interface FixtureOptions {
  conditionComplete?: boolean;
  locationAccess?: boolean;
  locationPhotoOverride?: boolean | null;
  locationStatus?: "ACTIVE" | "INACTIVE";
  membershipStatus?: "ACTIVE" | "INACTIVE";
  organizationPhotosRequired?: boolean;
  organizationStatus?: "ACTIVE" | "INACTIVE";
  role?: MembershipRole;
  sessionState?: "AWAITING_PARKING" | "CHECKING_IN";
  sessionVersion?: number;
  userStatus?: "ACTIVE" | "DISABLED";
  vehicleIdentity?: "EMPTY_KNOWN_PLATE" | "KNOWN_PLATE" | "TEMPORARY";
}

interface SessionRow {
  check_in_condition_completed_at: Date | null;
  check_in_condition_completed_by_membership_id: string | null;
  checked_in_by_membership_id: string;
  checking_in_completed_at: Date | null;
  current_assignee_membership_id: string | null;
  customer_access_expires_at: Date;
  customer_access_revoked_at: Date | null;
  customer_access_token_hash: string;
  customer_id: string | null;
  key_slot_id: string | null;
  parking_spot_id: string | null;
  state: string;
  updated_at: Date;
  version: number;
}

interface VehicleRow {
  color: string | null;
  make: string | null;
  model: string | null;
  plate_country: string | null;
  plate_number_normalized: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
  updated_at: Date;
}

interface AuditRow {
  actor_membership_id: string | null;
  entity_id: string;
  entity_type: string;
  event_type: string;
  location_id: string;
  metadata_json: Record<string, unknown>;
  occurred_at: Date;
  organization_id: string;
  valet_session_id: string | null;
}

interface DownstreamCounts {
  cash_entries: number;
  customers: number;
  incidents: number;
  notifications: number;
  payments: number;
  refunds: number;
  retrieval_requests: number;
  validations: number;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004h_app_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_complete_${uniqueSuffix}`;
const runtimePassword = `runtime-${randomUUID()}`;

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
  const sessionState = options.sessionState ?? "CHECKING_IN";
  const conditionComplete = options.conditionComplete ?? true;
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations
         (id, name, status, timezone, check_in_photos_required, updated_at)
       VALUES ($1, $2, $3, 'Asia/Amman', $4, clock_timestamp())`,
      [
        fixture.organizationId,
        `VAL-004H ${identity}`,
        options.organizationStatus ?? "ACTIVE",
        options.organizationPhotosRequired ?? false,
      ],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, check_in_photos_required_override, updated_at)
       VALUES ($1, $2, 'Complete check-in location', $3, 'Test address',
               'Asia/Amman', 'JOD', $4, $5, $6, clock_timestamp())`,
      [
        fixture.locationId,
        fixture.organizationId,
        identity,
        options.locationStatus ?? "ACTIVE",
        (options.locationStatus ?? "ACTIVE") === "ACTIVE",
        options.locationPhotoOverride ?? null,
      ],
    );
    await client.query(
      `INSERT INTO users
         (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', $3, clock_timestamp())`,
      [
        fixture.userId,
        `${identity}@val-004h.test`,
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

    if (options.vehicleIdentity === "KNOWN_PLATE") {
      await client.query(
        `INSERT INTO vehicles
           (id, organization_id, plate_country, plate_number_raw,
            plate_number_normalized, temporary_descriptor, make, model, color,
            updated_at)
         VALUES ($1, $2, 'JO', '12-34567', '1234567',
                 'Earlier descriptor', 'Toyota', 'Camry', 'Black',
                 clock_timestamp())`,
        [fixture.vehicleId, fixture.organizationId],
      );
    } else if (options.vehicleIdentity === "EMPTY_KNOWN_PLATE") {
      await client.query(
        `INSERT INTO vehicles
           (id, organization_id, plate_country, plate_number_raw,
            plate_number_normalized, updated_at)
         VALUES ($1, $2, 'JO', '', '', clock_timestamp())`,
        [fixture.vehicleId, fixture.organizationId],
      );
    } else {
      await client.query(
        `INSERT INTO vehicles
           (id, organization_id, temporary_descriptor, make, color, updated_at)
         VALUES ($1, $2, 'Unmarked blue sedan', 'Unknown', 'Blue',
                 clock_timestamp())`,
        [fixture.vehicleId, fixture.organizationId],
      );
    }

    await client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          customer_access_revoked_at, organization_id, location_id,
          vehicle_id, state, checked_in_by_membership_id,
          check_in_condition_completed_by_membership_id,
          check_in_condition_completed_at, checking_in_completed_at,
          version, updated_at)
       VALUES ($1, $2, clock_timestamp() - interval '1 hour',
               clock_timestamp() - interval '2 hours', $3, $4, $5, $6, $7,
               CASE WHEN $8 THEN $7::uuid ELSE NULL END,
               CASE WHEN $8 THEN clock_timestamp() ELSE NULL END,
               CASE WHEN $10 THEN clock_timestamp() ELSE NULL END,
               $9, clock_timestamp())`,
      [
        fixture.sessionId,
        `disabled:intake:${randomBytes(32).toString("hex")}`,
        fixture.organizationId,
        fixture.locationId,
        fixture.vehicleId,
        sessionState,
        fixture.membershipId,
        conditionComplete,
        options.sessionVersion ?? 1,
        sessionState !== "CHECKING_IN",
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
    [userId, `${identity}@val-004h.test`],
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
     VALUES ($1, $2, 'Other complete-check-in vehicle', clock_timestamp())`,
    [vehicleId, fixture.organizationId],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        customer_access_revoked_at, organization_id, location_id, vehicle_id,
        state, checked_in_by_membership_id,
        check_in_condition_completed_by_membership_id,
        check_in_condition_completed_at, version, updated_at)
     VALUES ($1, $2, clock_timestamp(), clock_timestamp(), $3, $4, $5,
             'CHECKING_IN', $6, $6, clock_timestamp(), 1, clock_timestamp())`,
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

function commandRequest(fixture: Fixture, expectedVersion = 1) {
  return {
    authenticatedUserId: fixture.userId,
    expectedVersion,
    valetSessionId: fixture.sessionId,
  };
}

async function registerPhoto(
  fixture: Fixture,
  valetSessionId = fixture.sessionId,
): Promise<void> {
  await createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)({
    authenticatedUserId: fixture.userId,
    contentType: "image/jpeg",
    storageObjectKey: `private/check-in/${randomUUID()}`,
    valetSessionId,
  });
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
    `SELECT state::text, version, checking_in_completed_at, updated_at,
            parking_spot_id::text, key_slot_id::text,
            current_assignee_membership_id::text,
            checked_in_by_membership_id::text,
            check_in_condition_completed_at,
            check_in_condition_completed_by_membership_id::text,
            customer_access_token_hash, customer_access_expires_at,
            customer_access_revoked_at, customer_id::text
     FROM valet_sessions WHERE id = $1`,
    [sessionId],
  );
  return result.rows[0]!;
}

async function readVehicle(vehicleId: string): Promise<VehicleRow> {
  const result = await adminPool.query<VehicleRow>(
    `SELECT plate_country, plate_number_raw, plate_number_normalized,
            temporary_descriptor, make, model, color, updated_at
     FROM vehicles WHERE id = $1`,
    [vehicleId],
  );
  return result.rows[0]!;
}

async function readCompletionAudits(sessionId: string): Promise<AuditRow[]> {
  const result = await adminPool.query<AuditRow>(
    `SELECT organization_id::text, location_id::text,
            valet_session_id::text, actor_membership_id::text,
            event_type, entity_type, entity_id::text,
            metadata_json, occurred_at
     FROM audit_events
     WHERE valet_session_id = $1
       AND event_type = 'VALET_SESSION_CHECK_IN_COMPLETED'
     ORDER BY occurred_at, created_at, id`,
    [sessionId],
  );
  return result.rows;
}

async function readEvidenceCounts(sessionId: string) {
  const result = await adminPool.query<{
    condition_notes: number;
    vehicle_photos: number;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM condition_notes
        WHERE valet_session_id = $1) AS condition_notes,
       (SELECT count(*)::integer FROM vehicle_photos
        WHERE valet_session_id = $1) AS vehicle_photos`,
    [sessionId],
  );
  return result.rows[0]!;
}

async function readDownstreamCounts(
  sessionId: string,
): Promise<DownstreamCounts> {
  const result = await adminPool.query<DownstreamCounts>(
    `SELECT
       (SELECT count(*)::integer FROM retrieval_requests
        WHERE valet_session_id = $1) AS retrieval_requests,
     (SELECT count(*)::integer FROM payments
        WHERE valet_session_id = $1) AS payments,
       (SELECT count(*)::integer FROM customers
        WHERE organization_id = (
          SELECT organization_id FROM valet_sessions WHERE id = $1
        )) AS customers,
       (SELECT count(*)::integer FROM validations AS validation
        INNER JOIN payments AS payment ON payment.id = validation.payment_id
        WHERE payment.valet_session_id = $1) AS validations,
       (SELECT count(*)::integer FROM cash_entries AS cash_entry
        INNER JOIN payments AS payment ON payment.id = cash_entry.payment_id
        WHERE payment.valet_session_id = $1) AS cash_entries,
       (SELECT count(*)::integer FROM refunds AS refund
        INNER JOIN payments AS payment ON payment.id = refund.payment_id
        WHERE payment.valet_session_id = $1) AS refunds,
       (SELECT count(*)::integer FROM notifications
        WHERE valet_session_id = $1) AS notifications,
       (SELECT count(*)::integer FROM incidents
        WHERE valet_session_id = $1) AS incidents`,
    [sessionId],
  );
  return result.rows[0]!;
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

beforeAll(async () => {
  testMigrationUrl = connectionUrlFor(testDatabaseName);
  testRuntimeUrl = runtimeUrlFor(testDatabaseName);
  const bootstrapPool = new Pool({ connectionString: adminDatabaseUrl });
  await timedIssue215FixtureStage("create-db", async () => {
    try {
      await bootstrapPool.query(`CREATE DATABASE "${testDatabaseName}"`);
      databaseCreated = true;
    } finally {
      await bootstrapPool.end();
    }
  });
  await timedIssue215FixtureStage("migrate", () => runIssue215FixturePnpm(
    ["--filter", "@valet/database", "migrate:deploy"], {
    DATABASE_URL: undefined,
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  }, [adminDatabaseUrl, testMigrationUrl, testRuntimeUrl, runtimePassword]));
  await reportIssue215MigrationTimings(testMigrationUrl);
  await timedIssue215FixtureStage("provision", () => runIssue215FixturePnpm(
    ["--filter", "@valet/database", "runtime:provision"], {
    DATABASE_URL: testRuntimeUrl,
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  }, [adminDatabaseUrl, testMigrationUrl, testRuntimeUrl, runtimePassword]));
  runtimeRoleCreated = true;
  await timedIssue215FixtureStage("runtime-pools", async () => {
    adminPool = new Pool({ connectionString: testMigrationUrl });
    runtimePool = createRuntimePostgresPool(testRuntimeUrl);
    const rawProbe = new Pool({ connectionString: testRuntimeUrl, max: 1 });
    try {
      await rawProbe.query("SELECT current_user");
      await runtimePool.query("SELECT current_user");
      await new RuntimeDatabaseLifecycle(runtimePool).onApplicationBootstrap();
      await withDatabaseOperationDeadline(() =>
        inPostgresTransaction(runtimePool, async (tx) => {
          await tx.query("SELECT 1 AS supports_pg16_guest_budget");
        }),
      );
    } catch (error) {
      const code = (error as { code?: string }).code ?? "NO_SQLSTATE";
      throw new Error(`Runtime connection probe failed (SQLSTATE=${code})`, { cause: error });
    } finally {
      await rawProbe.end();
    }
  });
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

describe("VAL-004H complete-check-in command", () => {
  it("performs only CHECKING_IN to AWAITING_PARKING with one timestamp/version/audit and no Shift", async () => {
    const fixture = await createFixture();
    const beforeSession = await readSession(fixture.sessionId);
    const beforeVehicle = await readVehicle(fixture.vehicleId);
    const beforeEvidence = await readEvidenceCounts(fixture.sessionId);
    const beforeDownstream = await readDownstreamCounts(fixture.sessionId);

    const result = await createCompleteCheckInCommandExecutor(runtimePool)(
      commandRequest(fixture),
    );
    const afterSession = await readSession(fixture.sessionId);
    const audits = await readCompletionAudits(fixture.sessionId);

    expect(result).toMatchObject({
      actorMembershipId: fixture.membershipId,
      checkingInCompletedAt: result.operationTime,
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      state: "AWAITING_PARKING",
      valetSessionId: fixture.sessionId,
      version: 2,
    });
    expect(afterSession.state).toBe("AWAITING_PARKING");
    expect(afterSession.version).toBe(2);
    expect(afterSession.checking_in_completed_at).toEqual(result.operationTime);
    expect(afterSession.updated_at).toEqual(result.operationTime);
    expect(afterSession.parking_spot_id).toBe(beforeSession.parking_spot_id);
    expect(afterSession.key_slot_id).toBe(beforeSession.key_slot_id);
    expect(afterSession.current_assignee_membership_id).toBe(
      beforeSession.current_assignee_membership_id,
    );
    expect(afterSession.checked_in_by_membership_id).toBe(
      beforeSession.checked_in_by_membership_id,
    );
    expect(afterSession.check_in_condition_completed_at).toEqual(
      beforeSession.check_in_condition_completed_at,
    );
    expect(
      afterSession.check_in_condition_completed_by_membership_id,
    ).toBe(beforeSession.check_in_condition_completed_by_membership_id);
    expect(afterSession.customer_access_token_hash).toBe(
      beforeSession.customer_access_token_hash,
    );
    expect(afterSession.customer_access_expires_at).toEqual(
      beforeSession.customer_access_expires_at,
    );
    expect(afterSession.customer_access_revoked_at).toEqual(
      beforeSession.customer_access_revoked_at,
    );
    expect(afterSession.customer_id).toBe(beforeSession.customer_id);
    expect(await readVehicle(fixture.vehicleId)).toEqual(beforeVehicle);
    expect(await readEvidenceCounts(fixture.sessionId)).toEqual(beforeEvidence);
    expect(await readDownstreamCounts(fixture.sessionId)).toEqual(
      beforeDownstream,
    );
    expect(audits).toEqual([
      expect.objectContaining({
        actor_membership_id: fixture.membershipId,
        entity_id: fixture.sessionId,
        entity_type: "ValetSession",
        event_type: "VALET_SESSION_CHECK_IN_COMPLETED",
        location_id: fixture.locationId,
        metadata_json: {
          fromState: "CHECKING_IN",
          fromVersion: 1,
          toState: "AWAITING_PARKING",
          toVersion: 2,
        },
        occurred_at: result.operationTime,
        organization_id: fixture.organizationId,
        valet_session_id: fixture.sessionId,
      }),
    ]);
  });

  it("allows a supervisor handoff actor without rewriting the checked-in actor", async () => {
    const fixture = await createFixture();
    const supervisor = await createAdditionalActor(fixture);
    const result = await createCompleteCheckInCommandExecutor(runtimePool)({
      authenticatedUserId: supervisor.userId,
      expectedVersion: 1,
      valetSessionId: fixture.sessionId,
    });
    const session = await readSession(fixture.sessionId);
    const audits = await readCompletionAudits(fixture.sessionId);
    expect(result.actorMembershipId).toBe(supervisor.membershipId);
    expect(session.checked_in_by_membership_id).toBe(fixture.membershipId);
    expect(audits[0]?.actor_membership_id).toBe(supervisor.membershipId);
  });

  it.each(["LOCATION_MANAGER", "ORG_ADMIN"] as const)(
    "denies the non-operational %s role",
    async (role) => {
      const fixture = await createFixture({ role });
      const before = await readSession(fixture.sessionId);
      await expectErrorCode(
        createCompleteCheckInCommandExecutor(runtimePool)(
          commandRequest(fixture),
        ),
        "AUTHORIZATION_DENIED",
      );
      expect(await readSession(fixture.sessionId)).toEqual(before);
      expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
    },
  );

  it.each([
    [{ userStatus: "DISABLED" } as FixtureOptions, "AUTHORIZATION_DENIED"],
    [
      { membershipStatus: "INACTIVE" } as FixtureOptions,
      "TENANT_ACCESS_DENIED",
    ],
    [{ locationAccess: false } as FixtureOptions, "LOCATION_ACCESS_DENIED"],
    [
      { organizationStatus: "INACTIVE" } as FixtureOptions,
      "AUTHORIZATION_DENIED",
    ],
    [
      { locationStatus: "INACTIVE" } as FixtureOptions,
      "AUTHORIZATION_DENIED",
    ],
  ] as const)(
    "denies inactive or unscoped staff/tenant state %#",
    async (options, code) => {
      const fixture = await createFixture(options);
      await expectErrorCode(
        createCompleteCheckInCommandExecutor(runtimePool)(
          commandRequest(fixture),
        ),
        code,
      );
      expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
    },
  );

  it("keeps missing and cross-tenant sessions non-disclosing", async () => {
    const actorFixture = await createFixture();
    const foreignFixture = await createFixture();
    const complete = createCompleteCheckInCommandExecutor(runtimePool);
    await expectErrorCode(
      complete({
        authenticatedUserId: actorFixture.userId,
        expectedVersion: 1,
        valetSessionId: randomUUID(),
      }),
      "TENANT_ACCESS_DENIED",
    );
    await expectErrorCode(
      complete({
        authenticatedUserId: actorFixture.userId,
        expectedVersion: 1,
        valetSessionId: foreignFixture.sessionId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    expect(await readCompletionAudits(foreignFixture.sessionId)).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "maps invalid expectedVersion %s to VERSION_CONFLICT before persistence",
    async (expectedVersion) => {
      const fixture = await createFixture();
      const before = await readSession(fixture.sessionId);
      await expectErrorCode(
        createCompleteCheckInCommandExecutor(runtimePool)(
          commandRequest(fixture, expectedVersion),
        ),
        "VERSION_CONFLICT",
      );
      expect(await readSession(fixture.sessionId)).toEqual(before);
      expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
    },
  );

  it("enforces VERSION_CONFLICT before INVALID_STATE_TRANSITION", async () => {
    const staleCheckingIn = await createFixture({ sessionVersion: 2 });
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(
        commandRequest(staleCheckingIn, 1),
      ),
      "VERSION_CONFLICT",
    );

    const wrongState = await createFixture({
      sessionState: "AWAITING_PARKING",
      sessionVersion: 2,
    });
    const before = await readSession(wrongState.sessionId);
    const complete = createCompleteCheckInCommandExecutor(runtimePool);
    await expectErrorCode(
      complete(commandRequest(wrongState, 1)),
      "VERSION_CONFLICT",
    );
    await expectErrorCode(
      complete(commandRequest(wrongState, 2)),
      "INVALID_STATE_TRANSITION",
    );
    expect(await readSession(wrongState.sessionId)).toEqual(before);
    expect(await readCompletionAudits(wrongState.sessionId)).toEqual([]);
  });

  it("rejects old and refreshed retries after success without duplicate mutation or audit", async () => {
    const fixture = await createFixture();
    const complete = createCompleteCheckInCommandExecutor(runtimePool);
    const first = await complete(commandRequest(fixture));
    const afterFirst = await readSession(fixture.sessionId);
    await expectErrorCode(
      complete(commandRequest(fixture, 1)),
      "VERSION_CONFLICT",
    );
    await expectErrorCode(
      complete(commandRequest(fixture, 2)),
      "INVALID_STATE_TRANSITION",
    );
    expect(await readSession(fixture.sessionId)).toEqual(afterFirst);
    expect(afterFirst.checking_in_completed_at).toEqual(first.operationTime);
    expect(await readCompletionAudits(fixture.sessionId)).toHaveLength(1);
  });

  it("serializes same-version completion to one success, one version conflict and one audit", async () => {
    const fixture = await createFixture();
    const otherActor = await createAdditionalActor(fixture);
    const complete = createCompleteCheckInCommandExecutor(runtimePool);
    const outcomes = await Promise.allSettled([
      complete(commandRequest(fixture)),
      complete({
        authenticatedUserId: otherActor.userId,
        expectedVersion: 1,
        valetSessionId: fixture.sessionId,
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejection).toMatchObject({
      reason: { code: "VERSION_CONFLICT" },
      status: "rejected",
    });
    const session = await readSession(fixture.sessionId);
    expect(session.state).toBe("AWAITING_PARKING");
    expect(session.version).toBe(2);
    expect(session.checking_in_completed_at).not.toBeNull();
    expect(await readCompletionAudits(fixture.sessionId)).toHaveLength(1);
  });

  it("accepts a persisted known plate without OCR or ANPR metadata", async () => {
    const fixture = await createFixture({ vehicleIdentity: "KNOWN_PLATE" });
    await expect(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
    ).resolves.toMatchObject({ state: "AWAITING_PARKING" });
  });

  it("accepts the DEC-020 temporary-descriptor fallback", async () => {
    const fixture = await createFixture({ vehicleIdentity: "TEMPORARY" });
    await expect(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
    ).resolves.toMatchObject({ state: "AWAITING_PARKING" });
  });

  it("rejects an empty persisted known-plate identity without mutation or audit", async () => {
    const fixture = await createFixture({
      vehicleIdentity: "EMPTY_KNOWN_PLATE",
    });
    const before = await readSession(fixture.sessionId);
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
      "VEHICLE_IDENTITY_INCOMPLETE",
    );
    expect(await readSession(fixture.sessionId)).toEqual(before);
    expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
  });

  it("classifies malformed and partially grouped identity shapes at the application guard", () => {
    expect(
      hasAcceptedPersistedVehicleIdentity({
        plate_country: "USA",
        plate_number_normalized: "123",
        plate_number_raw: "123",
        temporary_descriptor: null,
      }),
    ).toBe(false);
    expect(
      hasAcceptedPersistedVehicleIdentity({
        plate_country: "JO",
        plate_number_normalized: null,
        plate_number_raw: "123",
        temporary_descriptor: "Fallback must not repair a partial group",
      }),
    ).toBe(false);
  });

  it("returns CONDITION_CHECK_INCOMPLETE before photo classification when the marker is missing", async () => {
    const fixture = await createFixture({
      conditionComplete: false,
      organizationPhotosRequired: true,
    });
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
      "CONDITION_CHECK_INCOMPLETE",
    );
    expect((await readSession(fixture.sessionId)).state).toBe("CHECKING_IN");
  });

  it("allows zero ConditionNotes and zero photos when current policy is optional", async () => {
    const fixture = await createFixture();
    expect(await readEvidenceCounts(fixture.sessionId)).toEqual({
      condition_notes: 0,
      vehicle_photos: 0,
    });
    await expect(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
    ).resolves.toMatchObject({ state: "AWAITING_PARKING" });
  });

  it("rejects a complete marker with zero photos under required policy", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
      "PHOTO_REQUIREMENT_NOT_SATISFIED",
    );
    expect((await readSession(fixture.sessionId)).state).toBe("CHECKING_IN");
    expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
  });

  it("rejects required policy with only exact-session unverified metadata", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    await registerPhoto(fixture);
    const before = await readSession(fixture.sessionId);
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
      "PHOTO_REQUIREMENT_NOT_SATISFIED",
    );
    expect(await readSession(fixture.sessionId)).toEqual(before);
    expect((await readEvidenceCounts(fixture.sessionId)).vehicle_photos).toBe(1);
    expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
  });

  it("does not count another session's photo", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    const otherSessionId = await createAdditionalSession(fixture);
    await registerPhoto(fixture, otherSessionId);
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
      "PHOTO_REQUIREMENT_NOT_SATISFIED",
    );
  });

  it.each([
    [false, true, "PHOTO_REQUIREMENT_NOT_SATISFIED"],
    [true, false, "SUCCESS"],
    [true, null, "PHOTO_REQUIREMENT_NOT_SATISFIED"],
  ] as const)(
    "honors Organization=%s and Location override=%s",
    async (organizationRequired, locationOverride, expected) => {
      const fixture = await createFixture({
        locationPhotoOverride: locationOverride,
        organizationPhotosRequired: organizationRequired,
      });
      const operation = createCompleteCheckInCommandExecutor(runtimePool)(
        commandRequest(fixture),
      );
      if (expected === "SUCCESS") {
        await expect(operation).resolves.toMatchObject({
          state: "AWAITING_PARKING",
        });
      } else {
        await expectErrorCode(operation, expected);
      }
    },
  );

  it("respects a current policy change made after the historical marker", async () => {
    const fixture = await createFixture();
    await registerPhoto(fixture);
    await adminPool.query(
      `UPDATE locations
       SET check_in_photos_required_override = true
       WHERE id = $1`,
      [fixture.locationId],
    );
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(commandRequest(fixture)),
      "PHOTO_REQUIREMENT_NOT_SATISFIED",
    );
  });

  it("rolls back state, completion time, version and updated_at when audit append fails", async () => {
    const fixture = await createFixture();
    const duplicateAuditId = randomUUID();
    await insertAuditWithId(fixture, duplicateAuditId);
    const before = await readSession(fixture.sessionId);
    await expect(
      createCompleteCheckInCommandExecutor(runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })(commandRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await readSession(fixture.sessionId)).toEqual(before);
    expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
  });

  it("keeps physical completion blocked during concurrent unverified metadata registration", async () => {
    const fixture = await createFixture({ organizationPhotosRequired: true });
    const photo = createRegisterCheckInConditionPhotoCommandExecutor(runtimePool)({
      authenticatedUserId: fixture.userId,
      contentType: "image/jpeg",
      storageObjectKey: `private/check-in/${randomUUID()}`,
      valetSessionId: fixture.sessionId,
    });
    const completion = createCompleteCheckInCommandExecutor(runtimePool)(
      commandRequest(fixture),
    );
    const [photoOutcome, completionOutcome] = await Promise.allSettled([
      photo,
      completion,
    ]);
    expect(photoOutcome.status).toBe("fulfilled");
    expect(completionOutcome.status).toBe("rejected");
    if (completionOutcome.status === "rejected") {
      expect(completionOutcome.reason).toMatchObject({
        code: "PHOTO_REQUIREMENT_NOT_SATISFIED",
      });
    }
    expect((await readSession(fixture.sessionId)).state).toBe("CHECKING_IN");
    await expectErrorCode(
      createCompleteCheckInCommandExecutor(runtimePool)(
        commandRequest(fixture),
      ),
      "PHOTO_REQUIREMENT_NOT_SATISFIED",
    );
    expect((await readEvidenceCounts(fixture.sessionId)).vehicle_photos).toBe(1);
    expect(await readCompletionAudits(fixture.sessionId)).toEqual([]);
  });

  it("serializes condition-marker completion against physical completion", async () => {
    const fixture = await createFixture({ conditionComplete: false });
    const marker = createCompleteCheckInConditionCommandExecutor(runtimePool)({
      authenticatedUserId: fixture.userId,
      valetSessionId: fixture.sessionId,
    });
    const completion = createCompleteCheckInCommandExecutor(runtimePool)(
      commandRequest(fixture),
    );
    const [markerOutcome, completionOutcome] = await Promise.allSettled([
      marker,
      completion,
    ]);
    expect(markerOutcome.status).toBe("fulfilled");
    if (completionOutcome.status === "rejected") {
      expect(completionOutcome.reason).toMatchObject({
        code: "CONDITION_CHECK_INCOMPLETE",
      });
      expect((await readSession(fixture.sessionId)).state).toBe("CHECKING_IN");
      await expect(
        createCompleteCheckInCommandExecutor(runtimePool)(
          commandRequest(fixture),
        ),
      ).resolves.toMatchObject({ state: "AWAITING_PARKING" });
    } else {
      expect((await readSession(fixture.sessionId)).state).toBe(
        "AWAITING_PARKING",
      );
    }
    expect(await readCompletionAudits(fixture.sessionId)).toHaveLength(1);
  });

  it("serializes completion behind a Management check-in policy mutation", async () => {
    const fixture = await createFixture();
    const writer = await beginBlockedCompanySettingMutation({
      adminPool,
      organizationId: fixture.organizationId,
      runtimePool,
      setting: "checkInPhotosRequired",
      value: "true",
    });
    const completion = createCompleteCheckInCommandExecutor(runtimePool)(
      commandRequest(fixture),
    );
    try {
      await waitForAdvisoryLock(
        adminPool,
        "pg_advisory_xact_lock_shared",
        "ShareLock",
        false,
      );
      await writer.commit();
      await expectErrorCode(completion, "PHOTO_REQUIREMENT_NOT_SATISFIED");
      expect((await readSession(fixture.sessionId)).state).toBe("CHECKING_IN");
    } finally {
      await writer.rollback();
      await completion.catch(() => undefined);
    }
  });
});
