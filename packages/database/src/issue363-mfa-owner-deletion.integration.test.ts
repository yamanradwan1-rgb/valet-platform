import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const databaseName = `valet_issue363_owner_${randomUUID().replaceAll("-", "")}`;
const newMigration = "20261030010600_issue363_session_bound_pending_mfa";
const secret = `mte1.${"A".repeat(16)}.${"B".repeat(43)}.${"C".repeat(22)}`;
const legacyUser = randomUUID();
const legacyFactor = randomUUID();
const states = ["PENDING", "ACTIVE", "RETIRED"] as const;
const records = states.map((state) => ({
  factorId: randomUUID(),
  sessionId: randomUUID(),
  state,
  userId: randomUUID(),
}));
let client: Client;

function scopedUrl(): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function applyMigration(name: string): Promise<void> {
  const sql = await readFile(
    new URL(`${name}/migration.sql`, migrationRoot),
    "utf8",
  );
  await client.query(sql);
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  client = new Client({ connectionString: scopedUrl() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await applyMigration(migration);
  }
  for (const userId of [legacyUser, ...records.map((entry) => entry.userId)]) {
    await client.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES ($1,$2,'synthetic-hash',transaction_timestamp())`,
      [userId, `${userId}@issue363.test`],
    );
  }
  // This historical record predates session ownership, including its session.
  await client.query(
    `INSERT INTO user_mfa_totp_factors(id,user_id,protected_secret)
     VALUES ($1,$2,$3)`,
    [legacyFactor, legacyUser, secret],
  );
  await applyMigration(newMigration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("Issue #363 immutable owner and disposable session deletion", () => {
  it("preserves an ownerless legacy PENDING factor until operator retirement", async () => {
    const before = await client.query<{
      pending_enrollment_session_id: string | null;
      state: string;
    }>(
      `SELECT state::text, pending_enrollment_session_id::text
       FROM user_mfa_totp_factors WHERE id = $1`,
      [legacyFactor],
    );
    expect(before.rows[0]).toEqual({
      pending_enrollment_session_id: null,
      state: "PENDING",
    });
    await client.query(
      `UPDATE user_mfa_totp_factors
       SET state='RETIRED', retired_at=created_at WHERE id=$1`,
      [legacyFactor],
    );
    const after = await client.query<{ state: string }>(
      "SELECT state::text FROM user_mfa_totp_factors WHERE id=$1",
      [legacyFactor],
    );
    expect(after.rows[0]?.state).toBe("RETIRED");
  });

  it("allows later session-only purge without transferring pending/active/retired owner IDs", async () => {
    for (const entry of records) {
      await client.query(
        `INSERT INTO staff_auth_sessions
           (id,user_id,current_access_token_hash,access_expires_at,
            absolute_expires_at,created_at,last_rotated_at)
         VALUES ($1,$2,$3,transaction_timestamp()+interval '15 minutes',
                 transaction_timestamp()+interval '30 days',
                 transaction_timestamp(),transaction_timestamp())`,
        [
          entry.sessionId,
          entry.userId,
          `staff-access-sha256:v1:${entry.sessionId.replaceAll("-", "").repeat(2)}`,
        ],
      );
      await client.query(
        `INSERT INTO user_mfa_totp_factors
           (id,user_id,protected_secret,pending_enrollment_session_id)
         VALUES ($1,$2,$3,$4)`,
        [entry.factorId, entry.userId, secret, entry.sessionId],
      );
      if (entry.state === "ACTIVE") {
        await client.query(
          `UPDATE user_mfa_totp_factors
           SET state='ACTIVE',activated_at=created_at,
               last_accepted_step=100,recovery_set_generation=1 WHERE id=$1`,
          [entry.factorId],
        );
      } else if (entry.state === "RETIRED") {
        await client.query(
          `UPDATE user_mfa_totp_factors
           SET state='RETIRED',retired_at=created_at WHERE id=$1`,
          [entry.factorId],
        );
      }
    }

    const deleted = await client.query("DELETE FROM staff_auth_sessions");
    expect(deleted.rowCount).toBe(records.length);
    const remaining = await client.query<{
      id: string;
      pending_enrollment_session_id: string | null;
      state: string;
    }>(
      `SELECT id::text, pending_enrollment_session_id::text, state::text
       FROM user_mfa_totp_factors WHERE id = ANY($1::uuid[])`,
      [records.map((entry) => entry.factorId)],
    );
    expect(remaining.rows).toHaveLength(records.length);
    for (const entry of records) {
      expect(remaining.rows).toContainEqual({
        id: entry.factorId,
        pending_enrollment_session_id: entry.sessionId,
        state: entry.state,
      });
    }

    await expect(
      client.query(
        `INSERT INTO user_mfa_totp_factors
         (id,user_id,protected_secret,pending_enrollment_session_id)
       VALUES ($1,$2,$3,$4)`,
        [randomUUID(), records[0]!.userId, secret, records[0]!.sessionId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const removed = await client.query(
      "DELETE FROM user_mfa_totp_factors WHERE id = ANY($1::uuid[])",
      [records.map((entry) => entry.factorId)],
    );
    expect(removed.rowCount).toBe(records.length);
  });
});
