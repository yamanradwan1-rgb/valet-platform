import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";
import { insertMfaRuntimeFixtureSession } from "./mfa-fixture-support.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_mfa_constraints_${randomUUID().replaceAll("-", "")}`;
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
let client: Client;
const userId = randomUUID();
const otherUserId = randomUUID();
const sessionId = randomUUID();
const otherSessionId = randomUUID();
const protectedSecret = `mte1.${"A".repeat(16)}.${"B".repeat(43)}.${"C".repeat(22)}`;

function scopedUrl(): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function expectConstraint(
  operation: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL constraint failure.");
  } catch (error) {
    const pgError = error as PgError;
    expect(pgError.code).toBe(code);
    if (constraint !== undefined) expect(pgError.constraint).toBe(constraint);
  }
}

async function insertFactor(
  user: string,
  id = randomUUID(),
  owner = user === otherUserId ? otherSessionId : sessionId,
): Promise<string> {
  await client.query(
    `INSERT INTO user_mfa_totp_factors(id,user_id,protected_secret,pending_enrollment_session_id)
     VALUES ($1,$2,$3,$4)`,
    [id, user, protectedSecret, owner],
  );
  return id;
}

async function activateFactor(id: string, step = 100): Promise<void> {
  await client.query(
    `UPDATE user_mfa_totp_factors
     SET state='ACTIVE', activated_at=created_at + interval '1 millisecond',
         last_accepted_step=$2, recovery_set_generation=1
     WHERE id=$1`,
    [id, step],
  );
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  client = new Client({ connectionString: scopedUrl() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await client.query(
      await readFile(
        new URL(`${migration}/migration.sql`, migrationRoot),
        "utf8",
      ),
    );
  }
  await client.query(
    await readFile(
      new URL(
        "20261030010600_issue363_session_bound_pending_mfa/migration.sql",
        migrationRoot,
      ),
      "utf8",
    ),
  );
  for (const id of [userId, otherUserId]) {
    await client.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES ($1,$2,'test-hash',transaction_timestamp())`,
      [id, `${id}@mfa-constraints.test`],
    );
  }
  await insertMfaRuntimeFixtureSession(client, userId, sessionId, "d");
  await insertMfaRuntimeFixtureSession(
    client,
    otherUserId,
    otherSessionId,
    "e",
  );
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("MGT-BE-02 MFA database invariants", () => {
  it("rejects ownerless or cross-User pending factor creation", async () => {
    await expectConstraint(
      client.query(
        `INSERT INTO user_mfa_totp_factors(id,user_id,protected_secret)
         VALUES ($1,$2,$3)`,
        [randomUUID(), userId, protectedSecret],
      ),
      "23514",
      "user_mfa_totp_factors_pending_session_required_check",
    );
    await expectConstraint(
      insertFactor(userId, randomUUID(), otherSessionId),
      "23503",
      "user_mfa_totp_factors_pending_session_owner_check",
    );
  });

  it("permits only one live factor per User and restrictive User ownership", async () => {
    const factorId = await insertFactor(userId);
    await expectConstraint(
      insertFactor(userId),
      "23505",
      "user_mfa_totp_factors_one_live_per_user_key",
    );
    await expectConstraint(insertFactor(randomUUID()), "23503");
    await activateFactor(factorId);
    await client.query(
      `UPDATE user_mfa_totp_factors
       SET state='RETIRED', retired_at=activated_at + interval '1 millisecond'
       WHERE id=$1`,
      [factorId],
    );
    await expect(insertFactor(userId)).resolves.toBeDefined();
  });

  it("enforces protected-secret shape and factor state timestamps", async () => {
    await expectConstraint(
      client.query(
        `INSERT INTO user_mfa_totp_factors(id,user_id,protected_secret,pending_enrollment_session_id)
         VALUES ($1,$2,'raw-secret',$3)`,
        [randomUUID(), otherUserId, otherSessionId],
      ),
      "23514",
      "user_mfa_totp_factors_protected_secret_check",
    );
    const factorId = await insertFactor(otherUserId);
    await expectConstraint(
      client.query(
        `UPDATE user_mfa_totp_factors SET state='ACTIVE' WHERE id=$1`,
        [factorId],
      ),
      "23514",
      "user_mfa_totp_factors_state_timestamps_check",
    );
  });

  it("makes replay state monotonic and retired factors terminal", async () => {
    const user = randomUUID();
    await client.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES ($1,$2,'x',transaction_timestamp())`,
      [user, `${user}@mfa-replay.test`],
    );
    const replaySessionId = randomUUID();
    await insertMfaRuntimeFixtureSession(client, user, replaySessionId, "f");
    const factorId = await insertFactor(user, randomUUID(), replaySessionId);
    await activateFactor(factorId, 200);
    await expectConstraint(
      client.query(
        `UPDATE user_mfa_totp_factors SET last_accepted_step=199 WHERE id=$1`,
        [factorId],
      ),
      "23514",
      "user_mfa_totp_factors_replay_step_check",
    );
    await expectConstraint(
      client.query(
        `UPDATE user_mfa_totp_factors SET recovery_set_generation=3 WHERE id=$1`,
        [factorId],
      ),
      "23514",
      "user_mfa_totp_factors_recovery_generation_transition_check",
    );
    await client.query(
      `UPDATE user_mfa_totp_factors
       SET state='RETIRED', retired_at=activated_at + interval '1 millisecond'
       WHERE id=$1`,
      [factorId],
    );
    await expectConstraint(
      client.query(
        `UPDATE user_mfa_totp_factors
         SET state='ACTIVE', retired_at=NULL WHERE id=$1`,
        [factorId],
      ),
      "23514",
      "user_mfa_totp_factors_state_transition_check",
    );
  });

  it("binds assurance to a factor owned by the exact session User", async () => {
    await client.query(
      `UPDATE user_mfa_totp_factors
       SET state='RETIRED', retired_at=created_at
       WHERE user_id=$1 AND state='PENDING'`,
      [userId],
    );
    const factorId = await insertFactor(
      userId,
      "11111111-1111-4111-8111-111111111111",
    );
    await activateFactor(factorId, 300);
    await expectConstraint(
      client.query(
        `UPDATE staff_auth_sessions SET mfa_factor_id=$2 WHERE id=$1`,
        [sessionId, factorId],
      ),
      "23514",
      "staff_auth_sessions_mfa_assurance_check",
    );
    const foreignFactor = await insertFactor(
      otherUserId,
      "22222222-2222-4222-8222-222222222222",
    ).catch(async () => {
      await client.query(
        `UPDATE user_mfa_totp_factors
         SET state='RETIRED', retired_at=created_at WHERE user_id=$1 AND state='PENDING'`,
        [otherUserId],
      );
      return insertFactor(otherUserId, "22222222-2222-4222-8222-222222222222");
    });
    const session = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM staff_auth_sessions WHERE id=$1`,
      [sessionId],
    );
    const assuranceAt = new Date(session.rows[0]!.created_at.getTime() + 1);
    await expectConstraint(
      client.query(
        `UPDATE staff_auth_sessions
         SET mfa_authenticated_at=$2,mfa_factor_id=$3,last_admin_activity_at=$2
         WHERE id=$1`,
        [sessionId, assuranceAt, foreignFactor],
      ),
      "23503",
      "staff_auth_sessions_user_mfa_factor_id_fkey",
    );
    await expect(
      client.query(
        `UPDATE staff_auth_sessions
         SET mfa_authenticated_at=$2,mfa_factor_id=$3,last_admin_activity_at=$2
         WHERE id=$1`,
        [sessionId, assuranceAt, factorId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectConstraint(
      client.query(
        `UPDATE staff_auth_sessions SET last_admin_activity_at=created_at WHERE id=$1`,
        [sessionId],
      ),
      "23514",
      "staff_auth_sessions_mfa_assurance_check",
    );
  });
});
