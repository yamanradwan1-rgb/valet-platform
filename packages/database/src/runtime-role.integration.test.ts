import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyMigrationConnectionTls } from "../scripts/database-connection-policy.mjs";

interface CommandResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
}

interface AuditFixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const uniqueSuffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004b_db_${uniqueSuffix}`;
const runtimeRole = `valet_runtime_db_${uniqueSuffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
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

async function runPnpmCaptured(
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<CommandResult> {
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

  return await new Promise<CommandResult>((resolve, reject) => {
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
      resolve({ code, stderr, stdout });
    });
  });
}

async function runPnpm(
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const result = await runPnpmCaptured(args, environment);
  if (result.code !== 0) {
    throw new Error(
      redactDatabaseDetails(
        `pnpm ${args.join(" ")} failed with exit code ${String(result.code)}.\n${result.stdout}\n${result.stderr}`,
      ),
    );
  }
}

async function expectPostgresDenial(
  operation: Promise<unknown>,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PostgresError).code).toBe("42501");
  }
}

async function expectForeignKeyRestriction(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL foreign-key restriction.");
  } catch (error) {
    const postgresError = error as PostgresError;
    expect(postgresError.code).toBe("23503");
    expect(postgresError.constraint).toBe(constraint);
  }
}

async function createAuditFixture(): Promise<AuditFixture> {
  const fixture = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    sessionId: randomUUID(),
  };
  const userId = randomUUID();
  const vehicleId = randomUUID();
  const identity = randomUUID();
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
      [fixture.organizationId, `VAL-004B runtime ${identity}`],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, updated_at)
       VALUES ($1, $2, 'Runtime location', $3, 'Test address', 'Asia/Amman',
               'JOD', 'ACTIVE', transaction_timestamp())`,
      [fixture.locationId, fixture.organizationId, identity],
    );
    await client.query(
      `INSERT INTO users
         (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
               transaction_timestamp())`,
      [userId, `${identity}@val-004b-runtime.test`],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'VALET_EMPLOYEE', 'ACTIVE',
               transaction_timestamp())`,
      [fixture.membershipId, fixture.organizationId, userId],
    );
    await client.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, transaction_timestamp())`,
      [vehicleId, fixture.organizationId, `Runtime vehicle ${identity}`],
    );
    await client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
               $3, $4, $5, 'CHECKING_IN', $6, 1,
               transaction_timestamp())`,
      [
        fixture.sessionId,
        `hash-${identity}`,
        fixture.organizationId,
        fixture.locationId,
        vehicleId,
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
  await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
    DATABASE_URL: testRuntimeUrl,
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  });

  adminPool = new Pool({ connectionString: testMigrationUrl });
  runtimePool = new Pool({ connectionString: testRuntimeUrl });
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

describe("runtime PostgreSQL role boundary", () => {
  it("applies all 18 migrations through migration credentials only", async () => {
    const result = await adminPool.query<{ migration_name: string }>(
      `SELECT migration_name
       FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(result.rows).toHaveLength(18);
  });

  it("rejects a real plaintext migration preflight without applying a migration", async () => {
    const before = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM _prisma_migrations`,
    );
    const client = new Client({ connectionString: testMigrationUrl });
    try {
      await client.connect();
      await expect(
        verifyMigrationConnectionTls(client, "production"),
      ).rejects.toThrow("not securely encrypted");
    } finally {
      await client.end();
    }
    const after = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM _prisma_migrations`,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("can rotate retained auth rows but cannot delete or truncate them", async () => {
    const privileges = await adminPool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_select: boolean;
      can_truncate: boolean;
      table_name: string;
    }>(
      `SELECT table_name,
              has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS can_select,
              has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS can_insert,
              has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS can_delete,
              has_table_privilege($1, format('public.%I', table_name), 'TRUNCATE') AS can_truncate
       FROM unnest(ARRAY['staff_auth_sessions', 'staff_refresh_credentials']) AS table_name
       ORDER BY table_name`,
      [runtimeRole],
    );
    expect(privileges.rows).toEqual([
      {
        can_delete: false,
        can_insert: true,
        can_select: true,
        can_truncate: false,
        table_name: "staff_auth_sessions",
      },
      {
        can_delete: false,
        can_insert: true,
        can_select: true,
        can_truncate: false,
        table_name: "staff_refresh_credentials",
      },
    ]);

    const updatePrivileges = await adminPool.query<{
      allowed: boolean;
      column_name: string;
      table_name: string;
    }>(
      `SELECT table_name, column_name,
              has_column_privilege(
                $1,
                format('public.%I', table_name),
                column_name,
                'UPDATE'
              ) AS allowed
       FROM (VALUES
         ('staff_auth_sessions', 'current_access_token_hash'),
         ('staff_auth_sessions', 'access_expires_at'),
         ('staff_auth_sessions', 'revoked_at'),
         ('staff_auth_sessions', 'last_rotated_at'),
         ('staff_auth_sessions', 'user_id'),
         ('staff_auth_sessions', 'absolute_expires_at'),
         ('staff_refresh_credentials', 'consumed_at'),
         ('staff_refresh_credentials', 'replaced_by_credential_id'),
         ('staff_refresh_credentials', 'token_hash'),
         ('staff_refresh_credentials', 'generation')
       ) AS checked(table_name, column_name)
       ORDER BY table_name, column_name`,
      [runtimeRole],
    );
    expect(
      updatePrivileges.rows
        .filter((row) => row.allowed)
        .map((row) => `${row.table_name}.${row.column_name}`),
    ).toEqual([
      "staff_auth_sessions.access_expires_at",
      "staff_auth_sessions.current_access_token_hash",
      "staff_auth_sessions.last_rotated_at",
      "staff_auth_sessions.revoked_at",
      "staff_refresh_credentials.consumed_at",
      "staff_refresh_credentials.replaced_by_credential_id",
    ]);
  });

  it("reserves Prisma migration metadata for the migration identity", async () => {
    const migrationRecordId = randomUUID();
    await adminPool.query("BEGIN");
    try {
      await adminPool.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, migration_name, started_at, applied_steps_count)
         VALUES ($1, 'test-checksum', 'test_admin_write',
                 transaction_timestamp(), 0)`,
        [migrationRecordId],
      );
      const written = await adminPool.query<{ id: string }>(
        `SELECT id FROM _prisma_migrations WHERE id = $1`,
        [migrationRecordId],
      );
      expect(written.rows[0]?.id).toBe(migrationRecordId);
    } finally {
      await adminPool.query("ROLLBACK");
    }

    await expectPostgresDenial(
      runtimePool.query(`SELECT id FROM _prisma_migrations LIMIT 1`),
    );
    await expectPostgresDenial(
      runtimePool.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, migration_name, started_at, applied_steps_count)
         VALUES ($1, 'runtime-checksum', 'runtime_forbidden',
                 transaction_timestamp(), 0)`,
        [randomUUID()],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(
        `UPDATE _prisma_migrations
         SET applied_steps_count = applied_steps_count
         WHERE id = $1`,
        [migrationRecordId],
      ),
    );
  });

  it("is idempotently provisioned without elevated attributes, memberships or ownership", async () => {
    const role = await adminPool.query<{
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles
       WHERE rolname = $1`,
      [runtimeRole],
    );
    expect(role.rows[0]).toEqual({
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolsuper: false,
    });
    const memberships = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_auth_members AS membership
       INNER JOIN pg_roles AS member ON member.oid = membership.member
       WHERE member.rolname = $1`,
      [runtimeRole],
    );
    expect(memberships.rows[0]?.count).toBe("0");
    const ownership = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_class AS object
       INNER JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
       INNER JOIN pg_roles AS owner ON owner.oid = object.relowner
       WHERE namespace.nspname = 'public' AND owner.rolname = $1`,
      [runtimeRole],
    );
    expect(ownership.rows[0]?.count).toBe("0");
  });

  it("allows required reads, inserts and updates but denies ordinary table delete", async () => {
    const currentUser = await runtimePool.query<{ current_user: string }>(
      `SELECT current_user`,
    );
    expect(currentUser.rows[0]?.current_user).toBe(runtimeRole);
    await expect(
      runtimePool.query(`SELECT id FROM organizations LIMIT 1`),
    ).resolves.toBeDefined();

    const organizationId = randomUUID();
    await runtimePool.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, 'Runtime insert', 'ACTIVE', 'Asia/Amman',
               transaction_timestamp())`,
      [organizationId],
    );
    await runtimePool.query(
      `UPDATE organizations SET name = 'Runtime update',
                                updated_at = transaction_timestamp()
       WHERE id = $1`,
      [organizationId],
    );
    const persisted = await adminPool.query<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [organizationId],
    );
    expect(persisted.rows[0]?.name).toBe("Runtime update");
    await expectPostgresDenial(
      runtimePool.query(`DELETE FROM organizations WHERE id = $1`, [
        organizationId,
      ]),
    );
  });

  it("reconciles stale sequence privileges and deterministic future defaults", async () => {
    const migrationRole = decodeURIComponent(
      new URL(testMigrationUrl).username,
    );
    const currentSequence = `runtime_current_${uniqueSuffix}`;
    const futureSequence = `runtime_future_${uniqueSuffix}`;
    expect(migrationRole).toMatch(/^[a-z_][a-z0-9_]{0,62}$/);
    expect(currentSequence).toMatch(/^[a-z_][a-z0-9_]{0,62}$/);
    expect(futureSequence).toMatch(/^[a-z_][a-z0-9_]{0,62}$/);

    await adminPool.query(`CREATE SEQUENCE "${currentSequence}"`);
    await adminPool.query(
      `GRANT UPDATE ON SEQUENCE "${currentSequence}" TO "${runtimeRole}"`,
    );
    await adminPool.query(
      `GRANT UPDATE ON SEQUENCE "${currentSequence}" TO PUBLIC`,
    );
    await adminPool.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${migrationRole}" IN SCHEMA public
       GRANT UPDATE ON SEQUENCES TO "${runtimeRole}"`,
    );
    await adminPool.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${migrationRole}" IN SCHEMA public
       GRANT UPDATE ON SEQUENCES TO PUBLIC`,
    );

    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      DATABASE_URL: testRuntimeUrl,
      MIGRATION_DATABASE_URL: testMigrationUrl,
      NODE_ENV: "test",
    });

    await expect(
      runtimePool.query(`SELECT nextval($1::regclass)`, [currentSequence]),
    ).resolves.toBeDefined();
    await expectPostgresDenial(
      runtimePool.query(`SELECT setval($1::regclass, 1)`, [currentSequence]),
    );

    await adminPool.query(`CREATE SEQUENCE "${futureSequence}"`);
    await expect(
      runtimePool.query(`SELECT nextval($1::regclass)`, [futureSequence]),
    ).resolves.toBeDefined();
    await expectPostgresDenial(
      runtimePool.query(`SELECT setval($1::regclass, 1)`, [futureSequence]),
    );
  });

  it("allows audit insert/select but denies update, delete and truncate", async () => {
    const fixture = await createAuditFixture();
    const auditId = randomUUID();
    await runtimePool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'TEST_RUNTIME_AUDIT',
               'ValetSession', $4, '{}'::jsonb, transaction_timestamp())`,
      [
        auditId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );
    const selected = await runtimePool.query<{ id: string }>(
      `SELECT id::text FROM audit_events WHERE id = $1`,
      [auditId],
    );
    expect(selected.rows[0]?.id).toBe(auditId);

    await expectPostgresDenial(
      runtimePool.query(
        `UPDATE audit_events SET metadata_json = '{}'::jsonb WHERE id = $1`,
        [auditId],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(`DELETE FROM audit_events WHERE id = $1`, [auditId]),
    );
    await expectPostgresDenial(runtimePool.query(`TRUNCATE audit_events`));
  });

  it("allows immutable intake records insert/select but denies update, delete and truncate", async () => {
    const fixture = await createAuditFixture();
    const conditionNoteId = randomUUID();
    const intakeOperationKey = `op:${randomUUID()}`;
    const vehiclePhotoId = randomUUID();
    await runtimePool.query(
      `INSERT INTO condition_notes (
         id, organization_id, location_id, valet_session_id,
         context, content, recorded_by_membership_id
       ) VALUES ($1, $2, $3, $4, 'CHECK_IN', $5, $6)`,
      [
        conditionNoteId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        "Runtime condition evidence",
        fixture.membershipId,
      ],
    );
    await runtimePool.query(
      `INSERT INTO vehicle_photos (
         id, organization_id, location_id, valet_session_id,
         captured_by_membership_id, purpose,
         storage_object_key, content_type
       ) VALUES ($1, $2, $3, $4, $5, 'CHECK_IN_CONDITION', $6, 'image/jpeg')`,
      [
        vehiclePhotoId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
        `private/runtime/${randomUUID()}`,
      ],
    );
    await runtimePool.query(
      `INSERT INTO intake_operations
         (organization_id, operation_key, request_fingerprint, location_id,
          valet_session_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        fixture.organizationId,
        intakeOperationKey,
        "a".repeat(64),
        fixture.locationId,
        fixture.sessionId,
      ],
    );

    await expect(
      runtimePool.query(`SELECT id FROM condition_notes WHERE id = $1`, [
        conditionNoteId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      runtimePool.query(`SELECT id FROM vehicle_photos WHERE id = $1`, [
        vehiclePhotoId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      runtimePool.query(
        `SELECT operation_key FROM intake_operations
         WHERE organization_id = $1 AND operation_key = $2`,
        [fixture.organizationId, intakeOperationKey],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    await expectPostgresDenial(
      runtimePool.query(
        `UPDATE condition_notes SET content = content WHERE id = $1`,
        [conditionNoteId],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(`DELETE FROM condition_notes WHERE id = $1`, [
        conditionNoteId,
      ]),
    );
    await expectPostgresDenial(runtimePool.query(`TRUNCATE condition_notes`));

    await expectPostgresDenial(
      runtimePool.query(
        `UPDATE vehicle_photos SET content_type = content_type WHERE id = $1`,
        [vehiclePhotoId],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(`DELETE FROM vehicle_photos WHERE id = $1`, [
        vehiclePhotoId,
      ]),
    );
    await expectPostgresDenial(runtimePool.query(`TRUNCATE vehicle_photos`));

    await expectPostgresDenial(
      runtimePool.query(
        `UPDATE intake_operations
         SET request_fingerprint = request_fingerprint
         WHERE organization_id = $1 AND operation_key = $2`,
        [fixture.organizationId, intakeOperationKey],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(
        `DELETE FROM intake_operations
         WHERE organization_id = $1 AND operation_key = $2`,
        [fixture.organizationId, intakeOperationKey],
      ),
    );
    await expectPostgresDenial(runtimePool.query(`TRUNCATE intake_operations`));
  });

  it("denies indirect evidence mutation through runtime parent-key updates", async () => {
    const conditionFixture = await createAuditFixture();
    const conditionNoteId = randomUUID();
    await runtimePool.query(
      `INSERT INTO condition_notes (
         id, organization_id, location_id, valet_session_id,
         context, content, recorded_by_membership_id
       ) VALUES ($1, $2, $3, $4, 'CHECK_IN', $5, $6)`,
      [
        conditionNoteId,
        conditionFixture.organizationId,
        conditionFixture.locationId,
        conditionFixture.sessionId,
        "Immutable condition parent-key test",
        conditionFixture.membershipId,
      ],
    );
    await expect(
      runtimePool.query(
        `UPDATE valet_sessions
         SET updated_at = transaction_timestamp()
         WHERE id = $1`,
        [conditionFixture.sessionId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    const replacementConditionSessionId = randomUUID();
    await expectForeignKeyRestriction(
      runtimePool.query(`UPDATE valet_sessions SET id = $1 WHERE id = $2`, [
        replacementConditionSessionId,
        conditionFixture.sessionId,
      ]),
      "condition_notes_org_location_session_id_fkey",
    );
    const unchangedCondition = await runtimePool.query<{
      valet_session_id: string;
    }>(
      `SELECT valet_session_id::text
       FROM condition_notes
       WHERE id = $1`,
      [conditionNoteId],
    );
    expect(unchangedCondition.rows[0]?.valet_session_id).toBe(
      conditionFixture.sessionId,
    );

    const photoFixture = await createAuditFixture();
    const vehiclePhotoId = randomUUID();
    await runtimePool.query(
      `INSERT INTO vehicle_photos (
         id, organization_id, location_id, valet_session_id,
         captured_by_membership_id, purpose,
         storage_object_key, content_type
       ) VALUES ($1, $2, $3, $4, $5, 'CHECK_IN_CONDITION', $6, 'image/jpeg')`,
      [
        vehiclePhotoId,
        photoFixture.organizationId,
        photoFixture.locationId,
        photoFixture.sessionId,
        photoFixture.membershipId,
        `private/runtime-parent-update/${randomUUID()}`,
      ],
    );
    await expect(
      runtimePool.query(
        `UPDATE valet_sessions
         SET updated_at = transaction_timestamp()
         WHERE id = $1`,
        [photoFixture.sessionId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    const replacementPhotoSessionId = randomUUID();
    await expectForeignKeyRestriction(
      runtimePool.query(`UPDATE valet_sessions SET id = $1 WHERE id = $2`, [
        replacementPhotoSessionId,
        photoFixture.sessionId,
      ]),
      "vehicle_photos_org_location_session_id_fkey",
    );
    const unchangedPhoto = await runtimePool.query<{
      valet_session_id: string;
    }>(
      `SELECT valet_session_id::text
       FROM vehicle_photos
       WHERE id = $1`,
      [vehiclePhotoId],
    );
    expect(unchangedPhoto.rows[0]?.valet_session_id).toBe(
      photoFixture.sessionId,
    );
  });

  it("denies create, alter and drop DDL", async () => {
    await expectPostgresDenial(
      runtimePool.query(`CREATE TABLE runtime_forbidden (id integer)`),
    );
    await expectPostgresDenial(
      runtimePool.query(`CREATE SCHEMA runtime_forbidden_schema`),
    );
    await expectPostgresDenial(
      runtimePool.query(`ALTER TABLE organizations ADD COLUMN forbidden text`),
    );
    await expectPostgresDenial(runtimePool.query(`DROP TABLE organizations`));
  });

  it("rejects a hostile runtime role identifier before connecting or executing SQL", async () => {
    const unreachableMigration = new URL(testMigrationUrl);
    unreachableMigration.port = "1";
    const hostileRuntime = new URL(testRuntimeUrl);
    hostileRuntime.port = "1";
    hostileRuntime.username = `hostile-role-${uniqueSuffix}`;
    const result = await runPnpmCaptured(
      ["--filter", "@valet/database", "runtime:provision"],
      {
        DATABASE_URL: hostileRuntime.toString(),
        MIGRATION_DATABASE_URL: unreachableMigration.toString(),
        NODE_ENV: "test",
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.code).not.toBe(0);
    expect(output).toContain("unsafe runtime role name");
    expect(output).not.toContain("could not connect");
  });

  it("rejects connection URL query parameters and fragments before connecting", async () => {
    const unreachableMigration = new URL(testMigrationUrl);
    unreachableMigration.port = "1";
    const unreachableRuntime = new URL(testRuntimeUrl);
    unreachableRuntime.port = "1";

    const runtimeQueryUrl = new URL(unreachableRuntime);
    runtimeQueryUrl.searchParams.set(
      "user",
      decodeURIComponent(unreachableMigration.username),
    );
    const migrationQueryUrl = new URL(unreachableMigration);
    migrationQueryUrl.searchParams.set(
      "user",
      decodeURIComponent(unreachableRuntime.username),
    );
    const runtimeFragmentUrl = new URL(unreachableRuntime);
    runtimeFragmentUrl.hash = "identity-override";

    const cases = [
      {
        expected: "does not allow query parameters in DATABASE_URL",
        migrationUrl: unreachableMigration.toString(),
        runtimeUrl: runtimeQueryUrl.toString(),
      },
      {
        expected: "does not allow query parameters in MIGRATION_DATABASE_URL",
        migrationUrl: migrationQueryUrl.toString(),
        runtimeUrl: unreachableRuntime.toString(),
      },
      {
        expected: "does not allow URL fragments in DATABASE_URL",
        migrationUrl: unreachableMigration.toString(),
        runtimeUrl: runtimeFragmentUrl.toString(),
      },
    ];

    for (const testCase of cases) {
      const result = await runPnpmCaptured(
        ["--filter", "@valet/database", "runtime:provision"],
        {
          DATABASE_URL: testCase.runtimeUrl,
          MIGRATION_DATABASE_URL: testCase.migrationUrl,
          NODE_ENV: "test",
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.code).not.toBe(0);
      expect(output).toContain(testCase.expected);
      expect(output).not.toContain("could not connect");
      expect(output.includes(runtimePassword)).toBe(false);
      expect(output.includes(testCase.runtimeUrl)).toBe(false);
      expect(output.includes(testCase.migrationUrl)).toBe(false);
    }
  }, 15_000);

  it("does not reveal runtime credentials when provisioning fails", async () => {
    const redactionPassword = `sentinel-${randomUUID()}`;
    const unreachableMigration = new URL(testMigrationUrl);
    unreachableMigration.port = "1";
    const unreachableRuntime = new URL(testRuntimeUrl);
    unreachableRuntime.port = "1";
    unreachableRuntime.username = `valet_redaction_${process.pid}`;
    unreachableRuntime.password = redactionPassword;
    const completeRuntimeUrl = unreachableRuntime.toString();
    const result = await runPnpmCaptured(
      ["--filter", "@valet/database", "runtime:provision"],
      {
        DATABASE_URL: completeRuntimeUrl,
        MIGRATION_DATABASE_URL: unreachableMigration.toString(),
        NODE_ENV: "test",
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.code).not.toBe(0);
    expect(output).toContain("could not connect with MIGRATION_DATABASE_URL");
    expect(output.includes(redactionPassword)).toBe(false);
    expect(output.includes(completeRuntimeUrl)).toBe(false);
  });

  it("enforces least privilege and fixed cleanup for ephemeral anti-abuse rows", async () => {
    const currentHash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
    const staleHash = `anti-abuse-hmac-sha256:v1:${"b".repeat(64)}`;
    const inserted = await runtimePool.query<{ id: string }>(
      `INSERT INTO anti_abuse_events (scope, key_hash, state)
       VALUES ('v1:staff-client-address', $1, 'PENDING')
       RETURNING id::text`,
      [currentHash],
    );
    const id = inserted.rows[0]?.id;
    expect(id).toBeDefined();
    await runtimePool.query(
      `UPDATE anti_abuse_events SET state = 'COUNTED' WHERE id = $1`,
      [id],
    );
    await expectPostgresDenial(
      runtimePool.query(
        `UPDATE anti_abuse_events SET key_hash = $1 WHERE id = $2`,
        [staleHash, id],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(
        `INSERT INTO anti_abuse_events (scope, key_hash, occurred_at, state)
         VALUES ('v1:guest-token', $1, clock_timestamp(), 'COUNTED')`,
        [staleHash],
      ),
    );
    await expectPostgresDenial(
      runtimePool.query(`DELETE FROM anti_abuse_events WHERE id = $1`, [id]),
    );
    await expectPostgresDenial(runtimePool.query(`TRUNCATE anti_abuse_events`));
    await expectPostgresDenial(
      runtimePool.query(`ALTER TABLE anti_abuse_events ADD COLUMN unsafe text`),
    );

    await adminPool.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, occurred_at, state)
       VALUES ('v1:guest-token', $1, clock_timestamp() - INTERVAL '61 minutes', 'COUNTED')`,
      [staleHash],
    );
    const cleaned = await runtimePool.query<{
      cleanup_expired_anti_abuse_events: number;
    }>(`SELECT cleanup_expired_anti_abuse_events()`);
    expect(cleaned.rows[0]?.cleanup_expired_anti_abuse_events).toBe(1);
    const remaining = await adminPool.query<{ key_hash: string }>(
      `SELECT key_hash FROM anti_abuse_events ORDER BY key_hash`,
    );
    expect(remaining.rows).toEqual([{ key_hash: currentHash }]);
  });
});
