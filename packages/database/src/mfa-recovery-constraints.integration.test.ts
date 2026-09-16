import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_mfa_recovery_${randomUUID().replaceAll("-", "")}`;
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const userId = randomUUID();
const factorId = randomUUID();
const verifier = `mrv1.${"e".repeat(43)}`;
const protectedSecret = `mte1.${"A".repeat(16)}.${"B".repeat(43)}.${"C".repeat(22)}`;
let client: Client;

async function expectConstraint(
  operation: Promise<unknown>,
  code: string,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL constraint failure.");
  } catch (error) {
    const pgError = error as Error & { code?: string; constraint?: string };
    expect(pgError.code).toBe(code);
    expect(pgError.constraint).toBe(constraint);
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    const sql = await readFile(
      new URL(`${migration}/migration.sql`, migrationRoot),
      "utf8",
    );
    await client.query(sql);
  }
  await client.query(
    `INSERT INTO users(id,email,password_hash,updated_at)
     VALUES ($1,$2,'test-hash',transaction_timestamp())`,
    [userId, `${userId}@mfa-recovery.test`],
  );
  await client.query(
    `INSERT INTO user_mfa_totp_factors
       (id,user_id,state,protected_secret,last_accepted_step,
        recovery_set_generation,activated_at)
     VALUES ($1,$2,'ACTIVE',$3,100,1,transaction_timestamp())`,
    [factorId, userId, protectedSecret],
  );
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("MGT-BE-02 recovery-code persistence", () => {
  it("stores ten distinct slots for one recovery set", async () => {
    for (let slot = 1; slot <= 10; slot += 1) {
      await client.query(
        `INSERT INTO mfa_recovery_codes
           (id,factor_id,set_generation,slot,selector,verifier)
         VALUES ($1,$2,1,$3,$4,$5)`,
        [
          randomUUID(),
          factorId,
          slot,
          `sel${String(slot).padStart(8, "0")}`,
          verifier,
        ],
      );
    }
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM mfa_recovery_codes
       WHERE factor_id=$1 AND set_generation=1`,
      [factorId],
    );
    expect(result.rows[0]?.count).toBe("10");
    await expectConstraint(
      client.query(
        `INSERT INTO mfa_recovery_codes
           (id,factor_id,set_generation,slot,selector,verifier)
         VALUES ($1,$2,1,10,'otherselect',$3)`,
        [randomUUID(), factorId, verifier],
      ),
      "23505",
      "mfa_recovery_codes_factor_generation_slot_key",
    );
  });

  it("rejects invalid generation, slot, selector and verifier shapes", async () => {
    for (const [generation, slot, selector, value, constraint] of [
      [
        0,
        1,
        "selector001",
        verifier,
        "mfa_recovery_codes_set_generation_check",
      ],
      [2, 11, "selector002", verifier, "mfa_recovery_codes_slot_check"],
      [2, 1, "short", verifier, "mfa_recovery_codes_selector_check"],
      [2, 1, "selector003", "invalid", "mfa_recovery_codes_verifier_check"],
    ] as const) {
      await expectConstraint(
        client.query(
          `INSERT INTO mfa_recovery_codes
             (id,factor_id,set_generation,slot,selector,verifier)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), factorId, generation, slot, selector, value],
        ),
        "23514",
        constraint,
      );
    }
  });

  it("makes consumption one-way and verifier identity immutable", async () => {
    const code = await client.query<{ id: string }>(
      `SELECT id::text FROM mfa_recovery_codes
       WHERE factor_id=$1 AND set_generation=1 AND slot=1`,
      [factorId],
    );
    await client.query(
      `UPDATE mfa_recovery_codes
       SET consumed_at=transaction_timestamp() WHERE id=$1`,
      [code.rows[0]!.id],
    );
    await expectConstraint(
      client.query(
        `UPDATE mfa_recovery_codes SET consumed_at=NULL WHERE id=$1`,
        [code.rows[0]!.id],
      ),
      "23514",
      "mfa_recovery_codes_single_use_check",
    );
    await expectConstraint(
      client.query(`UPDATE mfa_recovery_codes SET verifier=$2 WHERE id=$1`, [
        code.rows[0]!.id,
        `mrv1.${"f".repeat(43)}`,
      ]),
      "23514",
      "mfa_recovery_codes_immutable_check",
    );
  });

  it("accepts only the extended durable anti-abuse scope allowlist", async () => {
    const hash = `anti-abuse-hmac-sha256:v1:${"f".repeat(64)}`;
    for (const scope of [
      "v1:staff-login-identifier",
      "v1:mfa-totp-user",
      "v1:mfa-recovery-user",
    ]) {
      await client.query(
        `INSERT INTO anti_abuse_events(scope,key_hash,state)
         VALUES ($1,$2,'COUNTED')`,
        [scope, hash],
      );
    }
    await expectConstraint(
      client.query(
        `INSERT INTO anti_abuse_events(scope,key_hash,state)
         VALUES ('v1:mfa-unknown-user',$1,'COUNTED')`,
        [hash],
      ),
      "23514",
      "anti_abuse_events_scope_check",
    );
  });
});
