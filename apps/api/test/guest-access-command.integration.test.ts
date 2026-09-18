import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import {
  createGuestAccessResolver,
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
  guestAccessContract,
  hashGuestAccessToken,
} from "../src/modules/valet-sessions/guest-access-command";

interface Fixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  placeholderHash: string;
  sessionId: string;
  userId: string;
  vehicleId: string;
}

interface FixtureOptions {
  locationAccess?: boolean;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  role?: MembershipRole;
  userStatus?: "ACTIVE" | "DISABLED";
}

interface AccessRow {
  customer_access_expires_at: Date;
  customer_access_revoked_at: Date | null;
  customer_access_token_hash: string;
  state: string;
  updated_at: Date;
  version: number;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004f_app_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_guest_${uniqueSuffix}`;
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
    placeholderHash: `disabled:intake:${randomBytes(32).toString("hex")}`,
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
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', clock_timestamp())`,
      [fixture.organizationId, `VAL-004F ${identity}`],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Guest access location', $3, 'Test address',
               'Asia/Amman', 'JOD', 'ACTIVE', TRUE, clock_timestamp())`,
      [fixture.locationId, fixture.organizationId, identity],
    );
    await client.query(
      `INSERT INTO users
         (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', $3, clock_timestamp())`,
      [
        fixture.userId,
        `${identity}@val-004f.test`,
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
         (id, organization_id, temporary_descriptor, make, model, color,
          updated_at)
       VALUES ($1, $2, 'Guest test vehicle', 'Toyota', 'Camry', 'Black',
               clock_timestamp())`,
      [fixture.vehicleId, fixture.organizationId],
    );
    await client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          customer_access_revoked_at, organization_id, location_id,
          vehicle_id, state, checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, clock_timestamp(), clock_timestamp(), $3, $4, $5,
               'CHECKING_IN', $6, 1, clock_timestamp())`,
      [
        fixture.sessionId,
        fixture.placeholderHash,
        fixture.organizationId,
        fixture.locationId,
        fixture.vehicleId,
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

function staffRequest(fixture: Fixture) {
  return {
    authenticatedUserId: fixture.userId,
    valetSessionId: fixture.sessionId,
  };
}

async function readAccess(sessionId: string): Promise<AccessRow> {
  const result = await adminPool.query<AccessRow>(
    `SELECT customer_access_token_hash, customer_access_expires_at,
            customer_access_revoked_at, state::text, version, updated_at
     FROM valet_sessions WHERE id = $1`,
    [sessionId],
  );
  return result.rows[0]!;
}

async function auditRows(sessionId: string) {
  const result = await adminPool.query<{
    actor_membership_id: string | null;
    event_type: string;
    metadata_json: Record<string, unknown>;
  }>(
    `SELECT actor_membership_id::text, event_type, metadata_json
     FROM audit_events
     WHERE valet_session_id = $1
       AND event_type LIKE 'GUEST_ACCESS_%'
     ORDER BY occurred_at, created_at, id`,
    [sessionId],
  );
  return result.rows;
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

async function resolvingTokens(
  tokens: readonly string[],
): Promise<string[]> {
  const resolveGuest = createGuestAccessResolver(runtimePool);
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      await resolveGuest(token);
      return token;
    }),
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
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

describe("VAL-004F guest secure access", () => {
  it("replaces the disabled placeholder with one secure server-owned credential and safe audit", async () => {
    const fixture = await createFixture();
    const before = await readAccess(fixture.sessionId);
    const result = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const access = await readAccess(fixture.sessionId);

    expect(result).toMatchObject({
      mutationKind: "ISSUED",
      valetSessionId: fixture.sessionId,
    });
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(result.rawToken, "base64url")).toHaveLength(32);
    expect(access.customer_access_token_hash).toBe(
      hashGuestAccessToken(result.rawToken),
    );
    expect(access.customer_access_token_hash).not.toBe(result.rawToken);
    expect(access.customer_access_token_hash).toMatch(
      /^sha256:v1:[a-f0-9]{64}$/,
    );
    expect(access.customer_access_revoked_at).toBeNull();
    expect(result.expiresAt.getTime() - result.issuedAt.getTime()).toBe(
      guestAccessContract.lifetimeMilliseconds,
    );
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(access.customer_access_expires_at).toEqual(result.expiresAt);
    expect(access.state).toBe(before.state);
    expect(access.version).toBe(before.version);
    expect(access.updated_at.getTime()).toBeGreaterThanOrEqual(
      before.updated_at.getTime(),
    );

    const audits = await auditRows(fixture.sessionId);
    expect(audits).toEqual([
      {
        actor_membership_id: fixture.membershipId,
        event_type: "GUEST_ACCESS_ISSUED",
        metadata_json: {
          accessContractVersion: "V1",
          mutationKind: "ISSUED",
        },
      },
    ]);
    const auditText = JSON.stringify(audits);
    expect(auditText).not.toContain(result.rawToken);
    expect(auditText).not.toContain(access.customer_access_token_hash);

    const shifts = await adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM shifts
       WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    expect(shifts.rows[0]?.count).toBe(0);
  });

  it("authorizes a supervisor without requiring an active Shift", async () => {
    const fixture = await createFixture({ role: "VALET_SUPERVISOR" });
    await expect(
      createIssueGuestAccessCommandExecutor(runtimePool)(staffRequest(fixture)),
    ).resolves.toMatchObject({ mutationKind: "ISSUED" });
  });

  it.each(["LOCATION_MANAGER", "ORG_ADMIN"] as const)(
    "denies the non-operational %s role without mutation",
    async (role) => {
      const fixture = await createFixture({ role });
      const before = await readAccess(fixture.sessionId);
      await expectErrorCode(
        createIssueGuestAccessCommandExecutor(runtimePool)(
          staffRequest(fixture),
        ),
        "AUTHORIZATION_DENIED",
      );
      expect(await readAccess(fixture.sessionId)).toEqual(before);
      expect(await auditRows(fixture.sessionId)).toEqual([]);
    },
  );

  it.each([
    [{ userStatus: "DISABLED" } as FixtureOptions, "AUTHORIZATION_DENIED"],
    [{ membershipStatus: "INACTIVE" } as FixtureOptions, "TENANT_ACCESS_DENIED"],
    [{ locationAccess: false } as FixtureOptions, "LOCATION_ACCESS_DENIED"],
  ])("denies inactive or unscoped staff", async (options, code) => {
    const fixture = await createFixture(options);
    const before = await readAccess(fixture.sessionId);
    await expectErrorCode(
      createIssueGuestAccessCommandExecutor(runtimePool)(staffRequest(fixture)),
      code,
    );
    expect(await readAccess(fixture.sessionId)).toEqual(before);
    expect(await auditRows(fixture.sessionId)).toEqual([]);
  });

  it("does not disclose a foreign-tenant session versus a missing session", async () => {
    const actor = await createFixture();
    const foreign = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const foreignError = await expectErrorCode(
      issue({
        authenticatedUserId: actor.userId,
        valetSessionId: foreign.sessionId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    const missingError = await expectErrorCode(
      issue({
        authenticatedUserId: actor.userId,
        valetSessionId: randomUUID(),
      }),
      "TENANT_ACCESS_DENIED",
    );
    expect(foreignError.message).toBe(missingError.message);
  });
  it("resolves a valid token to only the minimal guest-safe representation", async () => {
    const fixture = await createFixture();
    const issue = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const guest = await createGuestAccessResolver(runtimePool)(issue.rawToken);
    expect(guest).toMatchObject({
      branding: { primaryColor: "#176BFF" },
      guestVehicleReadyNotificationEnabled: true,
      readyAt: null,
      state: "CHECKING_IN",
      valetSessionId: fixture.sessionId,
      vehicle: { color: "Black", make: "Toyota", model: "Camry" },
    });
    expect(guest.branding.displayName).toMatch(/^VAL-004F /);
    expect(Object.keys(guest).sort()).toEqual([
      "branding", "guestVehicleReadyNotificationEnabled", "readyAt", "state",
      "valetSessionId", "vehicle"]);
    expect(Object.keys(guest.vehicle).sort()).toEqual([
      "color",
      "make",
      "model",
    ]);
    const serialized = JSON.stringify(guest);
    for (const forbidden of [
      "organization",
      "location",
      "membership",
      "parking",
      "keySlot",
      "audit",
      "token",
      "hash",
      fixture.membershipId,
      fixture.locationId,
      fixture.organizationId,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
  it("uses one non-disclosing guest error for malformed, random, expired, revoked, and rotated-old tokens", async () => {
    const resolveGuest = createGuestAccessResolver(runtimePool);
    const errors: Array<Error & { code: string }> = [];
    errors.push(await expectErrorCode(resolveGuest("malformed"), "GUEST_ACCESS_INVALID"));
    errors.push(
      await expectErrorCode(
        resolveGuest(randomBytes(32).toString("base64url")),
        "GUEST_ACCESS_INVALID",
      ),
    );

    const expiredFixture = await createFixture();
    const expiredIssue = await createIssueGuestAccessCommandExecutor(
      runtimePool,
    )(staffRequest(expiredFixture));
    await adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [expiredFixture.sessionId],
    );
    errors.push(
      await expectErrorCode(
        resolveGuest(expiredIssue.rawToken),
        "GUEST_ACCESS_INVALID",
      ),
    );

    const revokedFixture = await createFixture();
    const revokedIssue = await createIssueGuestAccessCommandExecutor(
      runtimePool,
    )(staffRequest(revokedFixture));
    await createRevokeGuestAccessCommandExecutor(runtimePool)(
      staffRequest(revokedFixture),
    );
    errors.push(
      await expectErrorCode(
        resolveGuest(revokedIssue.rawToken),
        "GUEST_ACCESS_INVALID",
      ),
    );

    const rotatedFixture = await createFixture();
    const oldIssue = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(rotatedFixture),
    );
    await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(rotatedFixture),
    );
    errors.push(
      await expectErrorCode(
        resolveGuest(oldIssue.rawToken),
        "GUEST_ACCESS_INVALID",
      ),
    );

    expect(new Set(errors.map((error) => error.code))).toEqual(
      new Set(["GUEST_ACCESS_INVALID"]),
    );
    expect(new Set(errors.map((error) => error.message))).toEqual(
      new Set(["Guest access is invalid."]),
    );
    for (const error of errors) {
      expect(error.message).not.toContain("token");
      expect(error.message).not.toContain("expired");
      expect(error.message).not.toContain("revoked");
    }
  });

  it("rotates to a fresh sole authoritative token with correct audits", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const first = await issue(staffRequest(fixture));
    const second = await issue(staffRequest(fixture));
    expect(second.mutationKind).toBe("ROTATED");
    expect(second.rawToken).not.toBe(first.rawToken);
    await expectErrorCode(
      createGuestAccessResolver(runtimePool)(first.rawToken),
      "GUEST_ACCESS_INVALID",
    );
    await expect(
      createGuestAccessResolver(runtimePool)(second.rawToken),
    ).resolves.toMatchObject({ valetSessionId: fixture.sessionId });
    const access = await readAccess(fixture.sessionId);
    expect(access.customer_access_token_hash).toBe(
      hashGuestAccessToken(second.rawToken),
    );
    expect((await auditRows(fixture.sessionId)).map((row) => row.event_type)).toEqual([
      "GUEST_ACCESS_ISSUED",
      "GUEST_ACCESS_ROTATED",
    ]);
  });

  it("rejects a rotation that would reuse the current credential", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool, {
      tokenBytesFactory: () => Buffer.alloc(32, 9),
    });
    const first = await issue(staffRequest(fixture));
    const before = await readAccess(fixture.sessionId);

    await expectErrorCode(
      issue(staffRequest(fixture)),
      "GUEST_ACCESS_GENERATION_FAILED",
    );

    expect(await readAccess(fixture.sessionId)).toEqual(before);
    await expect(
      createGuestAccessResolver(runtimePool)(first.rawToken),
    ).resolves.toMatchObject({ valetSessionId: fixture.sessionId });
    expect(
      (await auditRows(fixture.sessionId)).map((row) => row.event_type),
    ).toEqual(["GUEST_ACCESS_ISSUED"]);
  });

  it("revokes idempotently without a duplicate revocation audit", async () => {
    const fixture = await createFixture();
    const issued = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const resolveGuest = createGuestAccessResolver(runtimePool);
    await expect(resolveGuest(issued.rawToken)).resolves.toBeDefined();
    const revoke = createRevokeGuestAccessCommandExecutor(runtimePool);
    const first = await revoke(staffRequest(fixture));
    const second = await revoke(staffRequest(fixture));
    expect(second).toEqual(first);
    await expectErrorCode(resolveGuest(issued.rawToken), "GUEST_ACCESS_INVALID");
    expect((await auditRows(fixture.sessionId)).map((row) => row.event_type)).toEqual([
      "GUEST_ACCESS_ISSUED",
      "GUEST_ACCESS_REVOKED",
    ]);
  });

  it("requires explicit reissue intent to reactivate a revoked credential", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const first = await issue(staffRequest(fixture));
    const revoked = await createRevokeGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const afterRevoke = await readAccess(fixture.sessionId);
    const auditsAfterRevoke = await auditRows(fixture.sessionId);

    await expectErrorCode(
      issue(staffRequest(fixture)),
      "GUEST_ACCESS_INTENT_CONFLICT",
    );
    expect(await readAccess(fixture.sessionId)).toEqual(afterRevoke);
    expect(await auditRows(fixture.sessionId)).toEqual(auditsAfterRevoke);

    const reissued = await issue({
      expectedRevokedAt: revoked.revokedAt,
      ...staffRequest(fixture),
      intent: "REISSUE_REVOKED",
    });
    expect(reissued.mutationKind).toBe("ROTATED");
    await expectErrorCode(
      createGuestAccessResolver(runtimePool)(first.rawToken),
      "GUEST_ACCESS_INVALID",
    );
    await expect(
      createGuestAccessResolver(runtimePool)(reissued.rawToken),
    ).resolves.toMatchObject({ valetSessionId: fixture.sessionId });
    expect((await readAccess(fixture.sessionId)).customer_access_revoked_at).toBeNull();
    expect((await auditRows(fixture.sessionId)).map((row) => row.event_type)).toEqual([
      "GUEST_ACCESS_ISSUED",
      "GUEST_ACCESS_REVOKED",
      "GUEST_ACCESS_ROTATED",
    ]);
  });

  it("rejects explicit reissue against an active credential without mutation or audit", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const active = await issue(staffRequest(fixture));
    const before = await readAccess(fixture.sessionId);
    const auditsBefore = await auditRows(fixture.sessionId);

    await expectErrorCode(
      issue({
        ...staffRequest(fixture),
        expectedRevokedAt: new Date(0),
        intent: "REISSUE_REVOKED",
      }),
      "GUEST_ACCESS_INTENT_CONFLICT",
    );

    expect(await readAccess(fixture.sessionId)).toEqual(before);
    expect(await auditRows(fixture.sessionId)).toEqual(auditsBefore);
    await expect(
      createGuestAccessResolver(runtimePool)(active.rawToken),
    ).resolves.toMatchObject({ valetSessionId: fixture.sessionId });
  });

  it("requires a valid expected revocation timestamp only for explicit reissue", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    await issue(staffRequest(fixture));
    await createRevokeGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const before = await readAccess(fixture.sessionId);
    const auditsBefore = await auditRows(fixture.sessionId);

    await expectErrorCode(
      issue({
        ...staffRequest(fixture),
        intent: "REISSUE_REVOKED",
      }),
      "GUEST_ACCESS_REQUEST_INVALID",
    );
    await expectErrorCode(
      issue({
        ...staffRequest(fixture),
        expectedRevokedAt: new Date(Number.NaN),
        intent: "REISSUE_REVOKED",
      }),
      "GUEST_ACCESS_REQUEST_INVALID",
    );
    await expectErrorCode(
      issue({
        ...staffRequest(fixture),
        expectedRevokedAt: before.customer_access_revoked_at!,
      }),
      "GUEST_ACCESS_REQUEST_INVALID",
    );

    expect(await readAccess(fixture.sessionId)).toEqual(before);
    expect(await auditRows(fixture.sessionId)).toEqual(auditsBefore);
  });

  it("rejects stale expected revocation state without mutation or audit", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const original = await issue(staffRequest(fixture));
    const revoked = await createRevokeGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const before = await readAccess(fixture.sessionId);
    const auditsBefore = await auditRows(fixture.sessionId);

    await expectErrorCode(
      issue({
        ...staffRequest(fixture),
        expectedRevokedAt: new Date(revoked.revokedAt.getTime() - 1),
        intent: "REISSUE_REVOKED",
      }),
      "GUEST_ACCESS_INTENT_CONFLICT",
    );

    expect(await readAccess(fixture.sessionId)).toEqual(before);
    expect(await auditRows(fixture.sessionId)).toEqual(auditsBefore);
    await expectErrorCode(
      createGuestAccessResolver(runtimePool)(original.rawToken),
      "GUEST_ACCESS_INVALID",
    );
  });

  it("serializes concurrent initial issuances and leaves exactly one valid token", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const results = await Promise.all([
      issue(staffRequest(fixture)),
      issue(staffRequest(fixture)),
    ]);
    expect(await resolvingTokens(results.map((result) => result.rawToken))).toHaveLength(1);
    expect((await auditRows(fixture.sessionId)).map((row) => row.event_type).sort()).toEqual([
      "GUEST_ACCESS_ISSUED",
      "GUEST_ACCESS_ROTATED",
    ]);
  });

  it("serializes concurrent rotations and leaves exactly one valid new token", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const original = await issue(staffRequest(fixture));
    const rotations = await Promise.all([
      issue(staffRequest(fixture)),
      issue(staffRequest(fixture)),
    ]);
    const valid = await resolvingTokens([
      original.rawToken,
      ...rotations.map((result) => result.rawToken),
    ]);
    expect(valid).toHaveLength(1);
    expect((await readAccess(fixture.sessionId)).customer_access_token_hash).toBe(
      hashGuestAccessToken(valid[0]!),
    );
  });

  it("prevents an ordinary rotate versus revoke race from reactivating access", async () => {
    const fixture = await createFixture();
    const issue = createIssueGuestAccessCommandExecutor(runtimePool);
    const original = await issue(staffRequest(fixture));
    const [rotation, revocation] = await Promise.allSettled([
      issue(staffRequest(fixture)),
      createRevokeGuestAccessCommandExecutor(runtimePool)(staffRequest(fixture)),
    ]);
    const access = await readAccess(fixture.sessionId);
    expect(revocation.status).toBe("fulfilled");
    expect(access.customer_access_revoked_at).not.toBeNull();
    await expectErrorCode(
      createGuestAccessResolver(runtimePool)(original.rawToken),
      "GUEST_ACCESS_INVALID",
    );
    if (rotation.status === "fulfilled") {
      expect(access.customer_access_token_hash).toBe(
        hashGuestAccessToken(rotation.value.rawToken),
      );
      await expectErrorCode(
        createGuestAccessResolver(runtimePool)(rotation.value.rawToken),
        "GUEST_ACCESS_INVALID",
      );
    } else {
      expect(rotation.reason).toMatchObject({
        code: "GUEST_ACCESS_INTENT_CONFLICT",
      });
    }
  });

  it("prevents stale explicit reissue from becoming valid because revoke wins the race", async () => {
    const fixture = await createFixture();
    const original = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const rejectedRawToken = Buffer.alloc(32, 11).toString("base64url");
    const staleReissue = createIssueGuestAccessCommandExecutor(runtimePool, {
      tokenBytesFactory: () => Buffer.alloc(32, 11),
    });
    const [reissue, revocation] = await Promise.allSettled([
      staleReissue({
        ...staffRequest(fixture),
        expectedRevokedAt: new Date(0),
        intent: "REISSUE_REVOKED",
      }),
      createRevokeGuestAccessCommandExecutor(runtimePool)(staffRequest(fixture)),
    ]);

    expect(reissue.status).toBe("rejected");
    if (reissue.status === "rejected") {
      expect(reissue.reason).toMatchObject({
        code: "GUEST_ACCESS_INTENT_CONFLICT",
      });
    }
    expect(revocation.status).toBe("fulfilled");
    if (revocation.status !== "fulfilled") {
      throw revocation.reason;
    }
    const access = await readAccess(fixture.sessionId);
    expect(access.customer_access_revoked_at).toEqual(
      revocation.value.revokedAt,
    );
    expect(access.customer_access_token_hash).toBe(
      hashGuestAccessToken(original.rawToken),
    );
    await expectErrorCode(
      createGuestAccessResolver(runtimePool)(original.rawToken),
      "GUEST_ACCESS_INVALID",
    );
    await expectErrorCode(
      createGuestAccessResolver(runtimePool)(rejectedRawToken),
      "GUEST_ACCESS_INVALID",
    );
    expect((await auditRows(fixture.sessionId)).map((row) => row.event_type)).toEqual([
      "GUEST_ACCESS_ISSUED",
      "GUEST_ACCESS_REVOKED",
    ]);
  });

  it("rolls back initial issuance when its AuditEvent insert fails", async () => {
    const fixture = await createFixture();
    const duplicateAuditId = randomUUID();
    await insertAuditWithId(fixture, duplicateAuditId);
    const before = await readAccess(fixture.sessionId);
    const rejectedRawToken = Buffer.alloc(32, 7).toString("base64url");
    await expect(
      createIssueGuestAccessCommandExecutor(runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
        tokenBytesFactory: () => Buffer.alloc(32, 7),
      })(staffRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await readAccess(fixture.sessionId)).toEqual(before);
    const persisted = JSON.stringify(await readAccess(fixture.sessionId));
    expect(persisted).not.toContain(rejectedRawToken);
    expect(persisted).not.toContain(hashGuestAccessToken(rejectedRawToken));
  });

  it("rolls back rotation when its AuditEvent insert fails and keeps the old token valid", async () => {
    const fixture = await createFixture();
    const first = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const duplicateAuditId = randomUUID();
    await insertAuditWithId(fixture, duplicateAuditId);
    const before = await readAccess(fixture.sessionId);
    await expect(
      createIssueGuestAccessCommandExecutor(runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })(staffRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await readAccess(fixture.sessionId)).toEqual(before);
    await expect(
      createGuestAccessResolver(runtimePool)(first.rawToken),
    ).resolves.toBeDefined();
  });

  it("rolls back revocation when its AuditEvent insert fails and keeps the token valid", async () => {
    const fixture = await createFixture();
    const issued = await createIssueGuestAccessCommandExecutor(runtimePool)(
      staffRequest(fixture),
    );
    const duplicateAuditId = randomUUID();
    await insertAuditWithId(fixture, duplicateAuditId);
    const before = await readAccess(fixture.sessionId);
    await expect(
      createRevokeGuestAccessCommandExecutor(runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })(staffRequest(fixture)),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await readAccess(fixture.sessionId)).toEqual(before);
    await expect(
      createGuestAccessResolver(runtimePool)(issued.rawToken),
    ).resolves.toBeDefined();
  });
});
